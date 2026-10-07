"""API HTTP (aiohttp) et fichiers statiques de l'interface, servis via Ingress."""

from __future__ import annotations

import ipaddress
import logging
import os
from datetime import timedelta
from pathlib import Path
from typing import Any

from aiohttp import web

from . import __version__, models
from .engine import Engine

_LOGGER = logging.getLogger(__name__)
INGRESS_PEER = "172.30.32.2"
VIDEO_EXT = {"mp4", "webm", "mkv", "mov"}
AUDIO_EXT = {"mp3", "wav", "m4a", "aac", "ogg", "flac"}


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
        })
    return files


def event_key(entity_id: str, start: str, summary: str) -> str:
    return f"{entity_id}|{start}|{summary}"


def build_app(engine: Engine, web_dir: str | Path, card_status: dict[str, Any] | None = None) -> web.Application:
    app = IngressApplication(middlewares=[ingress_only])
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

    @routes.get("/api/card")
    async def card(_: web.Request) -> web.Response:
        return web.json_response(card_status or {"resource": "unknown", "message": "", "yaml": "", "file": False})

    @routes.get("/api/config")
    async def get_config(_: web.Request) -> web.Response:
        return web.json_response(storage.config)

    @routes.put("/api/config")
    async def put_config(request: web.Request) -> web.Response:
        config = storage.set_config(await body(request))
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
        if name not in ("visible", "enabled", "archived"):
            raise web.HTTPBadRequest(text="Champ inconnu")
        task[name] = bool(data.get("value"))
        storage.save_tasks()
        await publish()
        return web.json_response(task)

    @routes.post("/api/tasks/{task_id}/run")
    async def run(request: web.Request) -> web.Response:
        task = find(request)
        return web.json_response({"started": engine.start_task(task)})

    @routes.post("/api/tasks/{task_id}/duplicate")
    async def duplicate(request: web.Request) -> web.Response:
        source = find(request)
        data = await body(request)
        copy = models.clean_task({**source, "id": ""})
        copy["id"] = models.new_id("t")
        copy["archived"] = False
        copy["last_run_date"] = ""
        copy["last_status"] = ""
        if data.get("date"):
            copy["schedule"] = {**copy["schedule"], "type": "once", "date": str(data["date"]), "days": []}
        storage.tasks.append(copy)
        storage.save_tasks()
        await publish()
        return web.json_response(copy)

    @routes.get("/api/board")
    async def board(request: web.Request) -> web.Response:
        days = int(request.query.get("days", storage.config["settings"]["days_published"]))
        from . import schedule
        return web.json_response(schedule.build_board(
            storage.tasks, storage.config["shown_events"], engine.now().date(), days))

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
            "items": schedule.items_for_day(storage.tasks, storage.config["shown_events"], target, False),
        })

    @routes.get("/api/calendar")
    async def calendar(request: web.Request) -> web.Response:
        days = int(request.query.get("days", 14))
        start = engine.now()
        end = start + timedelta(days=days)
        shown = {e.get("key") for e in storage.config["shown_events"]}
        result: list[dict[str, Any]] = []
        for entity_id in storage.config["settings"].get("calendar_entities", []):
            try:
                events = await engine.ha.calendar_events(entity_id, start.isoformat(), end.isoformat())
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Calendrier %s indisponible : %s", entity_id, err)
                continue
            for event in events:
                raw_start = event.get("start", {})
                start_value = raw_start.get("dateTime") or raw_start.get("date") or ""
                summary = str(event.get("summary") or "Événement")
                key = event_key(entity_id, start_value, summary)
                result.append({"key": key, "entity_id": entity_id, "summary": summary,
                               "start": start_value, "shown": key in shown})
        return web.json_response(result)

    @routes.put("/api/shown_events")
    async def shown_events(request: web.Request) -> web.Response:
        data = await request.json()
        if not isinstance(data, list):
            raise web.HTTPBadRequest(text="Liste attendue")
        storage.config["shown_events"] = [
            {"key": str(e.get("key")), "summary": str(e.get("summary") or ""),
             "start": str(e.get("start") or ""), "entity_id": str(e.get("entity_id") or "")}
            for e in data if e.get("key")
        ]
        storage.save_config()
        await publish()
        return web.json_response(storage.config["shown_events"])

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
