"""API HTTP (aiohttp) et fichiers statiques de l'interface, servis via Ingress."""

from __future__ import annotations

import ipaddress
import logging
import os
import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from aiohttp import web

from . import __version__, access, models
from .engine import Engine

_LOGGER = logging.getLogger(__name__)
INGRESS_PEER = "172.30.32.2"
VIDEO_EXT = {"mp4", "webm", "mkv", "mov", "m4v", "3gp"}
AUDIO_EXT = {"mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"}
MEDIA_UPLOAD_DIR = "taskmanager"  # seul sous-dossier de /media où l'add-on écrit et supprime


class IngressApplication(web.Application):
    """Application qui réduit les slashes répétés AVANT le routage.

    Ingress peut transmettre un chemin du type « //// » (ingress_entry « / » + base).
    """

    async def _handle(self, request: web.Request):
        path = request.rel_url.path
        if "//" in path:
            while "//" in path:
                path = path.replace("//", "/")
            request = request.clone(rel_url=request.rel_url.with_path(path))
        return await super()._handle(request)


@web.middleware
async def ingress_only(request: web.Request, handler):
    """N'accepte que le Supervisor (Ingress), sauf mode développement."""
    if os.environ.get("TM_ALLOW_ANY") == "1":
        return await handler(request)
    peer = request.remote or ""
    try:
        allowed = ipaddress.ip_address(peer) == ipaddress.ip_address(INGRESS_PEER)
    except ValueError:
        allowed = False
    if not allowed:
        return web.json_response({"error": "forbidden"}, status=403)
    return await handler(request)


@web.middleware
async def role_guard(request: web.Request, handler):
    """Détermine le rôle du compte connecté ; un compte « tablette » ne peut que lire son fil."""
    engine: Engine = request.app["engine"]
    role = await access.resolve_role(engine, request.headers.get("X-Remote-User-Id", ""))
    request["role"] = role
    if role == access.TABLET and not access.tablet_may(request.method, request.path):
        return web.json_response({"error": "forbidden"}, status=403)
    return await handler(request)


IMAGE_EXT = {"jpg", "jpeg", "png", "webp", "gif"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def image_roots(engine: Engine) -> dict[str, Path]:
    return {"upload": engine.storage.dir / "images", "media": Path(engine.media_dir)}


def safe_image(root: Path, name: str) -> Path | None:
    """Chemin d'une image dans `root`, ou None (extension non permise, sortie du dossier, absent)."""
    try:
        path = (root / name).resolve()
        path.relative_to(root.resolve())
    except (ValueError, OSError):
        return None
    if path.suffix.lower().lstrip(".") not in IMAGE_EXT or not path.is_file():
        return None
    return path


def list_images(engine: Engine) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for source, root in image_roots(engine).items():
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*") if source == "media" else root.glob("*")):
            if path.is_file() and path.suffix.lower().lstrip(".") in IMAGE_EXT:
                rel = path.relative_to(root).as_posix()
                items.append({"source": source, "name": rel, "value": f"{source}:{rel}",
                              "url": f"api/image/{source}/{rel}"})
        if len(items) > 300:
            break
    return items[:300]


def background_url(settings: dict[str, Any]) -> str:
    value = str(settings.get("tablet_background") or "")
    source, _, name = value.partition(":")
    return f"api/image/{source}/{name}" if source in ("upload", "media") and name else ""


async def save_upload(request: web.Request, root: Path, allowed: set[str], max_bytes: int) -> Path:
    """Enregistre le fichier d'un envoi multipart (champ « file ») sans jamais écraser un fichier existant."""
    reader = await request.multipart()
    part = await reader.next()
    if part is None or part.name != "file" or not part.filename:
        raise web.HTTPBadRequest(text="Fichier manquant")
    clean = re.sub(r"[^\w.\-]", "_", Path(part.filename).name) or "fichier"
    if clean.rsplit(".", 1)[-1].lower() not in allowed:
        raise web.HTTPBadRequest(text=f"Format non pris en charge ({', '.join(sorted(allowed))})")
    root.mkdir(parents=True, exist_ok=True)
    target = root / clean
    counter = 1
    while target.exists():
        target = root / f"{Path(clean).stem}-{counter}{Path(clean).suffix}"
        counter += 1
    size = 0
    try:
        with target.open("wb") as handle:
            while chunk := await part.read_chunk():
                size += len(chunk)
                if size > max_bytes:
                    raise web.HTTPRequestEntityTooLarge(max_size=max_bytes, actual_size=size)
                handle.write(chunk)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return target


def media_entry(media_dir: str, path: Path) -> dict[str, Any]:
    rel = path.relative_to(Path(media_dir)).as_posix()
    ext = path.suffix.lower().lstrip(".")
    return {"name": path.name, "path": rel, "content_id": f"media-source://media/{rel}",
            "kind": "video" if ext in VIDEO_EXT else "audio", "deletable": rel.startswith(f"{MEDIA_UPLOAD_DIR}/")}


def list_media(media_dir: str) -> list[dict[str, str]]:
    root = Path(media_dir)
    files: list[dict[str, str]] = []
    if not root.is_dir():
        return files
    for path in sorted(root.rglob("*")):
        ext = path.suffix.lower().lstrip(".")
        if not path.is_file() or ext not in VIDEO_EXT | AUDIO_EXT:
            continue
        rel = path.relative_to(root).as_posix()
        files.append({
            "name": path.name,
            "path": rel,
            "content_id": f"media-source://media/{rel}",
            "kind": "video" if ext in VIDEO_EXT else "audio",
            "deletable": rel.startswith(f"{MEDIA_UPLOAD_DIR}/"),
        })
    return files


def build_app(engine: Engine, web_dir: str | Path) -> web.Application:
    app = IngressApplication(middlewares=[ingress_only, role_guard])
    app["engine"] = engine
    storage = engine.storage
    routes = web.RouteTableDef()

    async def body(request: web.Request) -> dict[str, Any]:
        try:
            data = await request.json()
        except ValueError:
            raise web.HTTPBadRequest(text="JSON invalide")
        if not isinstance(data, dict):
            raise web.HTTPBadRequest(text="Objet JSON attendu")
        return data

    @routes.get("/api/status")
    async def status(_: web.Request) -> web.Response:
        return web.json_response({
            "version": __version__,
            "ha_connected": engine.ha.connected.is_set() if hasattr(engine.ha, "connected") else True,
            "running": list(engine.runs),
            "now": engine.now().isoformat(timespec="seconds"),
        })

    @routes.get("/api/me")
    async def me(request: web.Request) -> web.Response:
        role = request["role"]
        return web.json_response({"role": role, "full": access.is_full(role)})

    @routes.get("/api/users")
    async def ha_users(_: web.Request) -> web.Response:
        users = await engine.ha.users() if hasattr(engine.ha, "users") else None
        return web.json_response({"available": users is not None, "users": users or []})

    @routes.get("/api/tablet")
    async def tablet(_: web.Request) -> web.Response:
        from . import schedule
        settings = storage.config["settings"]
        return web.json_response({
            "days": schedule.build_board(storage.tasks, engine.visible_events(),
                                         engine.now().date(), int(settings["days_published"])),
            "settings": {
                "background_url": background_url(settings),
                "background_mode": settings.get("tablet_background_mode", "tile"),
                "font_scale": settings.get("tablet_font_scale", 1.0),
                "min_day_width": settings.get("tablet_min_day_width", 360),
            },
            "now": engine.now().isoformat(timespec="seconds"),
        })

    @routes.get("/api/images")
    async def images(_: web.Request) -> web.Response:
        return web.json_response(list_images(engine))

    @routes.get("/api/image/{source}/{name:.+}")
    async def image(request: web.Request) -> web.StreamResponse:
        root = image_roots(engine).get(request.match_info["source"])
        path = safe_image(root, request.match_info["name"]) if root else None
        if path is None:
            raise web.HTTPNotFound()
        return web.FileResponse(path)

    @routes.post("/api/images")
    async def upload_image(request: web.Request) -> web.Response:
        target = await save_upload(request, image_roots(engine)["upload"], IMAGE_EXT, MAX_IMAGE_BYTES)
        return web.json_response({"source": "upload", "name": target.name, "value": f"upload:{target.name}",
                                  "url": f"api/image/upload/{target.name}"})

    @routes.delete("/api/images/{name:.+}")
    async def delete_image(request: web.Request) -> web.Response:
        path = safe_image(image_roots(engine)["upload"], request.match_info["name"])
        if path is None:
            raise web.HTTPNotFound()
        path.unlink()
        return web.json_response({"ok": True})

    @routes.get("/api/config")
    async def get_config(_: web.Request) -> web.Response:
        return web.json_response(storage.config)

    @routes.put("/api/config")
    async def put_config(request: web.Request) -> web.Response:
        config = storage.set_config(await body(request))
        await engine.refresh_calendars()
        await publish()
        return web.json_response(config)

    @routes.get("/api/entities")
    async def entities(request: web.Request) -> web.Response:
        prefix = request.query.get("domain", "")
        registry = await engine.ha.registry() if hasattr(engine.ha, "registry") else {}
        items = []
        for entity in engine.ha.entities():
            if not entity["entity_id"].startswith(prefix):
                continue
            extra = registry.get(entity["entity_id"], {})
            items.append({**entity, "area": extra.get("area", ""), "device": extra.get("device", "")})
        return web.json_response(items)

    @routes.get("/api/media")
    async def media(_: web.Request) -> web.Response:
        return web.json_response(list_media(engine.media_dir))

    @routes.post("/api/media")
    async def upload_media(request: web.Request) -> web.Response:
        limit = int(float(storage.config["settings"].get("media_max_mb", 500)) * 1024 * 1024)
        root = Path(engine.media_dir) / MEDIA_UPLOAD_DIR
        try:
            target = await save_upload(request, root, VIDEO_EXT | AUDIO_EXT, limit)
        except PermissionError:
            raise web.HTTPInternalServerError(text="Dossier média en lecture seule : l'add-on doit avoir accès en écriture à /media")
        engine.log("info", f"Média ajouté : {target.name}")
        return web.json_response(media_entry(engine.media_dir, target))

    @routes.delete("/api/media/{path:.+}")
    async def delete_media(request: web.Request) -> web.Response:
        root = (Path(engine.media_dir) / MEDIA_UPLOAD_DIR).resolve()
        try:
            path = (Path(engine.media_dir) / request.match_info["path"]).resolve()
            path.relative_to(root)
        except (ValueError, OSError):
            raise web.HTTPForbidden(text="Seuls les médias ajoutés par l'add-on peuvent être supprimés")
        if not path.is_file():
            raise web.HTTPNotFound()
        path.unlink()
        engine.log("info", f"Média supprimé : {path.name}")
        return web.json_response({"ok": True})

    @routes.get("/api/tasks")
    async def tasks(_: web.Request) -> web.Response:
        return web.json_response(storage.tasks)

    @routes.post("/api/tasks")
    async def save_task(request: web.Request) -> web.Response:
        task = storage.upsert_task(await body(request))
        await publish()
        return web.json_response(task)

    @routes.delete("/api/tasks/{task_id}")
    async def delete_task(request: web.Request) -> web.Response:
        if not storage.delete_task(request.match_info["task_id"]):
            raise web.HTTPNotFound()
        await publish()
        return web.json_response({"ok": True})

    def find(request: web.Request) -> dict[str, Any]:
        task = storage.get_task(request.match_info["task_id"])
        if not task:
            raise web.HTTPNotFound()
        return task

    @routes.post("/api/tasks/{task_id}/flag")
    async def flag(request: web.Request) -> web.Response:
        task = find(request)
        data = await body(request)
        name = data.get("name")
        if name not in ("visible", "enabled"):
            raise web.HTTPBadRequest(text="Champ inconnu")
        task[name] = bool(data.get("value"))
        storage.save_tasks()
        await publish()
        return web.json_response(task)

    @routes.post("/api/tasks/{task_id}/skip")
    async def skip(request: web.Request) -> web.Response:
        """Supprime une seule occurrence (ou la rétablit). Une tâche unique est supprimée entièrement."""
        task = find(request)
        data = await body(request)
        try:
            day = date.fromisoformat(str(data.get("date")))
        except ValueError:
            raise web.HTTPBadRequest(text="Date invalide")
        if task["schedule"]["type"] != "daily":
            if data.get("skipped", True):
                storage.delete_task(task["id"])
                await publish()
                return web.json_response({"deleted": True})
            raise web.HTTPBadRequest(text="Une tâche unique ne se rétablit pas : elle est supprimée")
        days = set(task.get("skipped_dates") or [])
        if data.get("skipped", True):
            days.add(day.isoformat())
        else:
            days.discard(day.isoformat())
        task["skipped_dates"] = sorted(days)
        storage.save_tasks()
        await publish()
        return web.json_response({"deleted": False, "task": task})

    @routes.post("/api/tasks/{task_id}/run")
    async def run(request: web.Request) -> web.Response:
        task = find(request)
        return web.json_response({"started": engine.start_task(task)})

    @routes.get("/api/templates")
    async def list_templates(request: web.Request) -> web.Response:
        return web.json_response(storage.templates)

    @routes.post("/api/templates")
    async def create_template(request: web.Request) -> web.Response:
        """Enregistre la tâche `task_id` comme modèle (sans date ni heure)."""
        data = await body(request)
        task = storage.get_task(str(data.get("task_id")))
        if not task:
            raise web.HTTPNotFound()
        template = storage.upsert_template({"name": data.get("name") or task["title"], "root": task["root"]})
        return web.json_response(template)

    @routes.put("/api/templates/{template_id}")
    async def rename_template(request: web.Request) -> web.Response:
        template = storage.get_template(request.match_info["template_id"])
        if not template:
            raise web.HTTPNotFound()
        data = await body(request)
        return web.json_response(storage.upsert_template({**template, "name": data.get("name") or template["name"]}))

    @routes.delete("/api/templates/{template_id}")
    async def delete_template(request: web.Request) -> web.Response:
        if not storage.delete_template(request.match_info["template_id"]):
            raise web.HTTPNotFound()
        return web.json_response({"ok": True})

    @routes.get("/api/board")
    async def board(request: web.Request) -> web.Response:
        days = int(request.query.get("days", storage.config["settings"]["days_published"]))
        from . import schedule
        return web.json_response(schedule.build_board(
            storage.tasks, engine.visible_events(), engine.now().date(), days))

    @routes.get("/api/day")
    async def day(request: web.Request) -> web.Response:
        from datetime import date
        from . import schedule
        try:
            target = date.fromisoformat(request.query.get("date", engine.now().date().isoformat()))
        except ValueError:
            raise web.HTTPBadRequest(text="Date invalide")
        return web.json_response({
            "date": target.isoformat(),
            "label": schedule.label_fr(target),
            "items": schedule.items_for_day(storage.tasks, engine.visible_events(), target, False, admin=True),
        })

    @routes.get("/api/calendar")
    async def calendar(_: web.Request) -> web.Response:
        """Événements importés automatiquement des calendriers cochés, avec leur état (masqué ou non)."""
        hidden = set(storage.config["hidden_events"])
        return web.json_response([{**event, "hidden": event["key"] in hidden} for event in engine.calendar_events])

    @routes.post("/api/calendar/refresh")
    async def calendar_refresh(_: web.Request) -> web.Response:
        await engine.refresh_calendars()
        await publish()
        return await calendar(_)

    @routes.put("/api/hidden_events")
    async def hidden_events(request: web.Request) -> web.Response:
        data = await request.json()
        if not isinstance(data, list):
            raise web.HTTPBadRequest(text="Liste attendue")
        storage.config["hidden_events"] = [str(key) for key in data]
        storage.save_config()
        await publish()
        return web.json_response(storage.config["hidden_events"])

    @routes.get("/api/journal")
    async def journal(_: web.Request) -> web.Response:
        return web.json_response(list(reversed(storage.journal)))

    @routes.post("/api/answer")
    async def answer(request: web.Request) -> web.Response:
        data = await body(request)
        taken = engine.submit_answer(
            str(data.get("request_id", "")), str(data.get("value", "")),
            source=str(data.get("source", "IA")), text=str(data.get("text", "")),
            room_id=str(data.get("room_id", "")),
        )
        return web.json_response({"accepted": taken})

    async def publish() -> None:
        try:
            await engine.publish_board()
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Publication du fil du jour impossible : %s", err)

    app.add_routes(routes)

    async def index(_: web.Request) -> web.FileResponse:
        return web.FileResponse(Path(web_dir) / "index.html")

    app.router.add_get("/", index)
    app.router.add_static("/", str(web_dir), show_index=False)
    return app
