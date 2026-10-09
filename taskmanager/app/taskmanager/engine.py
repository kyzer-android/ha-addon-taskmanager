"""Moteur : planification, lecture des médias, questions OUI/NON, appels et escalade.

Tout passe par les services de base de Home Assistant (Browser Mod, media_player,
homeassistant.turn_on). Aucun script ni automatisation n'est créé dans HA.
"""

from __future__ import annotations

import asyncio
import logging
import time as time_module
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable
from zoneinfo import ZoneInfo

from . import models, schedule, video_popup
from .rooms import BUSY_STATE, call_sensor_of, choose_rooms, is_in_call, state_of
from .storage import Storage

_LOGGER = logging.getLogger(__name__)

BOARD_ENTITY = "sensor.taskmanager_fil_du_jour"
ANSWER_SEPARATOR = "|"
AUDIO_TYPES = {
    "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4",
    "aac": "audio/aac", "ogg": "audio/ogg", "flac": "audio/flac",
}
VIDEO_TYPES = {
    "mp4": "video/mp4", "m4v": "video/mp4", "webm": "video/webm", "mkv": "video/x-matroska",
    "mov": "video/quicktime", "3gp": "video/3gpp",
}
def dialog_box_style(vertical: str, height: str = "", transparent: bool = False) -> str:
    """Place la fenêtre browser_mod pleine largeur, en haut (`top`), en bas (`bottom`) ou au centre (`center`).

    Plusieurs mécanismes cumulés (variables de ha-dialog, parties ::part, ancienne mwc-dialog) :
    selon la version de HA / browser_mod, l'un ou l'autre est pris en compte.
    """
    margin = {"top": "0 0 auto 0", "bottom": "auto 0 0 0", "center": "auto"}[vertical]
    align = {"top": "flex-start", "bottom": "flex-end", "center": "center"}[vertical]
    size = f"height: {height} !important; max-height: {height} !important; min-height: 0 !important;" if height else ""
    background = "--ha-dialog-surface-background: transparent; --mdc-dialog-surface-background: transparent;" if transparent else ""
    return (
        "ha-dialog {\n"
        f"  --vertical-align-dialog: {align};\n"
        "  --dialog-surface-margin-top: 0px;\n"
        "  --dialog-surface-margin-bottom: 0px;\n"
        "  --ha-dialog-width-md: 100vw;\n"
        "  --ha-dialog-width-full: 100vw;\n"
        "  --ha-dialog-max-width: 100vw;\n"
        "  --ha-dialog-border-radius: 0px;\n"
        "  --mdc-dialog-min-width: 100vw;\n"
        "  --mdc-dialog-max-width: 100vw;\n"
        f"  {background}\n"
        "}\n"
        "ha-dialog::part(dialog) {\n"
        f"  margin: {margin} !important;\n"
        "  width: 100vw !important;\n"
        "  max-width: 100vw !important;\n"
        f"  {size}\n"
        "  border-radius: 0 !important;\n"
        "}\n"
        "ha-dialog::part(header) { display: none !important; }\n"
        "ha-dialog .mdc-dialog__surface, ha-dialog .container, ha-dialog .content {\n"
        f"  {size}\n"
        "  padding: 0 !important;\n"
        "  overflow: hidden !important;\n"
        "}\n"
    )


# Question seule : fenêtre centrée à l'écran.
QUESTION_CENTER_STYLE = dialog_box_style("center") + (
    ".content, .container .content { display: flex; flex-direction: column; justify-content: center; }\n"
)


def video_top_style(base: str, percent: float) -> str:
    """Vidéo + question : la vidéo occupe le haut de l'écran (percent % de la hauteur)."""
    return base + dialog_box_style("top", f"{percent:g}vh") + "video { width: 100%; height: 100%; object-fit: contain; }\n"


def question_bottom_style(percent: float) -> str:
    """Boutons seuls, sous la vidéo : ils occupent le reste de l'écran."""
    rest = max(5.0, 100.0 - percent)
    return dialog_box_style("bottom", f"{rest:g}vh", transparent=True)


CALL_STYLES = """ha-dialog {
  --dialog-content-padding: 0;
  --padding-x: 0px;
  --padding-y: 0px;
  --ha-dialog-surface-background: black;
  --ha-card-background: black;
  --primary-text-color: white;
  color: white;
}
.content,
.container .content,
.content .container {
  padding: 0 !important;
  overflow: hidden !important;
  background: black;
  scrollbar-width: none;
}
.content::-webkit-scrollbar {
  display: none;
}"""
CALL_CARD_STYLE = """ha-card {
  display: flex;
  align-items: center;
  justify-content: center;
  background: black;
  border: none;
  border-radius: 0;
  box-shadow: none;
  width: 100%;
  box-sizing: border-box;
}
#remoteVideo {
  max-height: calc(100vh - 12px);
  max-width: 100%;
  object-fit: contain;
  object-position: center;
}"""


VIDEO_MAX_SECONDS = 1800  # garde-fou : une vidéo qui ne signale jamais sa fin ne bloque pas la question
VIDEO_START_GRACE = 5  # secondes ajoutées au délai de démarrage (réveil de l'écran, chargement)


@dataclass
class PendingQuestion:
    rid: str
    rooms: list[dict[str, Any]]
    future: asyncio.Future = field(default_factory=lambda: asyncio.get_running_loop().create_future())
    # Popup unique vidéo + question : pièces dont la vidéo tourne encore, et celles où elle a démarré.
    pending_video: set[str] = field(default_factory=set)
    started: set[str] = field(default_factory=set)
    video_done: asyncio.Event = field(default_factory=asyncio.Event)


def normalize_answer(value: str) -> str:
    text = (value or "").strip().lower()
    if text in ("oui", "yes", "o", "y", "true"):
        return "oui"
    if text in ("non", "no", "n", "false"):
        return "non"
    return "indéterminé"


class Engine:
    def __init__(
        self,
        storage: Storage,
        ha: Any,
        media_dir: str = "/media",
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        tz: ZoneInfo | None = None,
    ) -> None:
        self.storage = storage
        self.ha = ha
        self.media_dir = media_dir
        self.sleep = sleep
        self.tz = tz or ZoneInfo("UTC")
        self.runs: dict[str, asyncio.Task] = {}
        self.questions: dict[str, PendingQuestion] = {}
        self.display_lock = asyncio.Lock()
        self._tasks: list[asyncio.Task] = []
        self._warned_no_browser: set[str] = set()
        self.calendar_events: list[dict[str, Any]] = []
        self._calendar_refreshed = float("-inf")

    # ---- raccourcis -----------------------------------------------------------
    @property
    def config(self) -> dict[str, Any]:
        return self.storage.config

    @property
    def settings(self) -> dict[str, Any]:
        return self.storage.config["settings"]

    def now(self) -> datetime:
        return datetime.now(self.tz)

    def log(self, level: str, message: str, **extra: Any) -> None:
        self.storage.log(level, message, **extra)

    # ---- démarrage / arrêt ------------------------------------------------------
    async def start(self) -> None:
        try:
            cfg = await self.ha.get_config()
            self.tz = ZoneInfo(cfg.get("time_zone") or "UTC")
        except Exception as err:  # noqa: BLE001
            self.log("warning", f"Fuseau horaire de HA indisponible ({err}), UTC utilisé")
        self.ha.listeners.append(self.on_event)
        self._tasks.append(asyncio.create_task(self._scheduler_loop(), name="scheduler"))
        self._tasks.append(asyncio.create_task(self._board_loop(), name="board"))
        self.log("info", "Moteur démarré")

    async def stop(self) -> None:
        for task in [*self._tasks, *self.runs.values()]:
            task.cancel()
        await asyncio.gather(*self._tasks, *self.runs.values(), return_exceptions=True)

    async def _scheduler_loop(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Erreur dans la planification")
            await self.sleep(10)

    async def _board_loop(self) -> None:
        while True:
            try:
                every = max(1.0, float(self.settings.get("calendar_refresh_minutes", 10))) * 60
                if time_module.monotonic() - self._calendar_refreshed >= every:
                    await self.refresh_calendars()
                    self._calendar_refreshed = time_module.monotonic()
                await self.publish_board()
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Publication du fil du jour impossible : %s", err)
            await self.sleep(60)

    # ---- planification ------------------------------------------------------------
    async def tick(self) -> list[str]:
        """Déclenche les tâches échues. Retourne les identifiants lancés."""
        now = self.now()
        grace = float(self.settings.get("grace_minutes", 5))
        launched: list[str] = []
        changed = False
        for task in list(self.storage.tasks):
            if schedule.is_missed_once(task, now.date()):
                self.storage.tasks.remove(task)
                self.log("info", f"Tâche unique passée supprimée : {task['title']}", task_id=task["id"])
                changed = True
                continue
            if schedule.is_due(task, now, grace) and task["id"] not in self.runs:
                task["last_run_date"] = now.date().isoformat()
                changed = True
                self.start_task(task)
                launched.append(task["id"])
        if changed:
            self.storage.save_tasks()
        return launched

    def start_task(self, task: dict[str, Any]) -> bool:
        if task["id"] in self.runs:
            return False
        run = asyncio.create_task(self._run_task(task), name=f"task-{task['id']}")
        self.runs[task["id"]] = run
        run.add_done_callback(lambda _t, tid=task["id"]: self.runs.pop(tid, None))
        return True

    async def _run_task(self, task: dict[str, Any]) -> None:
        self.log("info", f"Tâche lancée : {task['title']}", task_id=task["id"])
        status = "terminée"
        try:
            outcome = await self.run_node(task["root"])
            if outcome:
                status = {"yes": "réponse OUI", "no": "réponse NON", "no_answer": "sans réponse"}[outcome]
        except asyncio.CancelledError:
            status = "interrompue"
            raise
        except Exception as err:  # noqa: BLE001
            status = f"erreur : {err}"
            self.log("warning", f"Erreur pendant « {task['title']} » : {err}", task_id=task["id"])
        finally:
            task["last_status"] = status
            if task["schedule"]["type"] == "once" and task in self.storage.tasks:
                self.storage.tasks.remove(task)  # tâche unique terminée : rien à garder (voir les modèles)
            self.storage.save_tasks()
            self.log("info", f"Tâche terminée : {task['title']} ({status})", task_id=task["id"])

    # ---- exécution d'un nœud ------------------------------------------------------
    async def run_node(self, node: dict[str, Any]) -> str | None:
        """Exécute un nœud puis ses sous-tâches. Retourne yes / no / no_answer / None."""
        media = node.get("media") or {}
        has_media = media.get("kind") in ("video", "audio") and media.get("content_id")
        outcome: str | None = None
        if node.get("question"):
            outcome = await self._ask(node)
        elif has_media:
            async with self.display_lock:
                rooms = choose_rooms(self.config, self.ha.states, "media")
                if not rooms:
                    self.log("warning", f"Aucune tablette disponible pour « {node.get('title')} »")
                else:
                    started = await self._start_playback(rooms, media)
                    await self._finish_playback(started, media)
        await self._run_children(node, outcome)
        return outcome

    async def _run_children(self, node: dict[str, Any], outcome: str | None) -> None:
        for child in node.get("children", []):
            trigger = child["trigger"]
            if trigger in ("yes", "no", "no_answer"):
                if trigger == outcome:
                    await self.run_node(child["node"])
            elif trigger == "sensor":
                await self._run_sensor_child(child)

    async def _run_sensor_child(self, child: dict[str, Any]) -> None:
        sensor = child.get("sensor") or {}
        entity = sensor.get("entity_id")
        if not entity:
            return
        wanted = sensor.get("state", "on")
        pause = float(sensor.get("repeat_minutes", 10)) * 60
        for _ in range(int(self.settings.get("sensor_loop_max_runs", 24))):
            if self.ha.state(entity) != wanted:
                return
            await self.run_node(child["node"])
            await self.sleep(pause)

    # ---- lecture -------------------------------------------------------------------
    def _browser_id(self, room: dict[str, Any]) -> str:
        browser_id = room.get("browser_id", "")
        if not browser_id and room.get("id") not in self._warned_no_browser:
            self._warned_no_browser.add(room.get("id", ""))
            self.log("warning", f"Pas de Browser ID pour la pièce « {room.get('name')} » : popups impossibles")
        return browser_id

    async def _close_popup(self, room: dict[str, Any], tag: str) -> None:
        browser_id = self._browser_id(room)
        if not browser_id:
            return
        try:
            await self.ha.call_service("browser_mod", "close_popup",
                                       {"browser_id": [browser_id], "tag": tag})
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("close_popup (%s) a échoué : %s", tag, err)

    async def _stop_media(self, room: dict[str, Any]) -> None:
        try:
            await self.ha.call_service("media_player", "media_stop",
                                       {"entity_id": room["media_player"]})
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("media_stop a échoué : %s", err)

    async def _ensure_screen(self, room: dict[str, Any]) -> None:
        """L'écran est normalement toujours allumé : on ne l'allume que s'il est éteint."""
        screen = room.get("screen")
        if not screen or self.ha.state(screen) == "on":
            return
        await self.ha.call_service("homeassistant", "turn_on", {"entity_id": screen})
        await self.sleep(float(self.settings.get("screen_wait_seconds", 1)))

    async def _wait_until(self, predicate: Callable[[], bool], timeout: float | None) -> bool:
        waited = 0.0
        while not predicate():
            if timeout is not None and waited >= timeout:
                return False
            await self.sleep(0.5)
            waited += 0.5
        return True

    def _is_playing(self, room: dict[str, Any]) -> bool:
        return self.ha.state(room["media_player"]) == "playing"

    def _video_style(self, compact: bool) -> str:
        base = self.settings.get("video_style", "")
        if not compact:
            return base
        return video_top_style(base, float(self.settings.get("video_height_percent", 80)))

    async def _play_on_room(self, room: dict[str, Any], media: dict[str, Any], compact: bool = False) -> bool:
        kind = media["kind"]
        content_id = media["content_id"]
        try:
            await self._ensure_screen(room)
            if kind == "video":
                data: dict[str, Any] = {
                    "entity_id": room["media_player"],
                    "extra": {"popup": {
                        "initial_style": "fullscreen",
                        "tag": "video",
                        "dismissable": False,
                        "popup_styles": [{"style": "all", "styles": self._video_style(compact)}],
                    }},
                    "media": {"media_content_id": content_id,
                              "media_content_type": VIDEO_TYPES.get(content_id.rsplit(".", 1)[-1].lower(), "video/mp4")},
                }
            else:
                extension = content_id.rsplit(".", 1)[-1].lower()
                data = {
                    "entity_id": room["media_player"],
                    "media": {"media_content_id": content_id,
                              "media_content_type": AUDIO_TYPES.get(extension, "audio/mpeg")},
                }
            await self.ha.call_service("media_player", "play_media", data)
        except Exception as err:  # noqa: BLE001
            self.log("warning", f"Lecture impossible sur « {room.get('name')} » : {err}")
            return False
        started = await self._wait_until(
            lambda: self._is_playing(room), float(self.settings.get("start_timeout_seconds", 10))
        )
        if not started:
            self.log("warning", f"La lecture n'a pas démarré sur « {room.get('name')} »")
            if kind == "video":
                await self._close_popup(room, "video")
        return started

    async def _start_playback(self, rooms: list[dict[str, Any]], media: dict[str, Any],
                              compact: bool = False) -> list[dict[str, Any]]:
        results = await asyncio.gather(*(self._play_on_room(r, media, compact) for r in rooms))
        return [room for room, ok in zip(rooms, results) if ok]

    async def _finish_playback(self, rooms: list[dict[str, Any]], media: dict[str, Any]) -> None:
        """Attend la fin de la lecture (sans limite de durée) puis ferme le popup vidéo."""
        async def one(room: dict[str, Any]) -> None:
            await self._wait_until(
                lambda: not self._is_playing(room) or is_in_call(room, self.ha.states), None
            )
            if media["kind"] == "video":
                await self._close_popup(room, "video")

        await asyncio.gather(*(one(r) for r in rooms))

    # ---- questions ------------------------------------------------------------------
    def _question_card(self, text: str, rid: str, room_id: str, compact: bool = False) -> dict[str, Any]:
        """compact : boutons moyens seuls (sous la vidéo) ; sinon texte + énormes boutons, centrés."""
        height = int(float(self.settings.get("question_button_height", 90))) if compact else 160
        font = max(16, int(height * 0.3)) if compact else 44

        def button(label: str, value: str, color: str, icon: str) -> dict[str, Any]:
            return {
                "type": "button", "name": label, "icon": icon,
                "show_name": True, "show_icon": True,
                "tap_action": {
                    "action": "perform-action", "perform_action": "logbook.log",
                    "data": {"name": "taskmanager", "domain": "taskmanager",
                             "message": ANSWER_SEPARATOR.join(["answer", rid, room_id, value])},
                },
                "card_mod": {"style": (
                    f"ha-card {{ height: {height}px; font-size: {font}px; font-weight: bold; "
                    f"background: {color}; color: white; --icon-primary-color: white; "
                    f"--primary-text-color: white; --mdc-icon-size: {int(height * 0.45)}px; }} "
                    f"ha-state-icon, ha-icon {{ color: white !important; }} "
                    f".name, span.name {{ font-size: {font}px !important; color: white !important; }}"
                )},
            }

        buttons = {"type": "horizontal-stack", "cards": [
            button("OUI", "oui", "#2e7d32", "mdi:check-bold"),
            button("NON", "non", "#c62828", "mdi:close-thick"),
        ]}
        if compact:
            return buttons
        return {"type": "vertical-stack", "cards": [
            {"type": "markdown", "content": f"# {text}",
             "card_mod": {"style": "ha-card { text-align: center; font-size: 36px; }"}},
            buttons,
        ]}

    async def _open_question(self, pq: PendingQuestion, text: str, rooms: list[dict[str, Any]],
                             compact: bool = False) -> None:
        seconds = float(self.settings.get("question_seconds", 60))
        percent = float(self.settings.get("video_height_percent", 80))
        for room in rooms:
            browser_id = self._browser_id(room)
            if not browser_id:
                continue
            try:
                await self._ensure_screen(room)
                data: dict[str, Any] = {
                    "browser_id": [browser_id],
                    "tag": "question",
                    "initial_style": "wide",
                    "dismissable": False,
                    "content": self._question_card(text, pq.rid, room.get("id", ""), compact),
                    "popup_styles": [{"style": "all", "styles":
                                      question_bottom_style(percent) if compact else QUESTION_CENTER_STYLE}],
                }
                if not compact:  # sous la vidéo, pas de délai : il démarre à la fin de la vidéo
                    data["timeout"] = int(seconds * 1000)
                await self.ha.call_service("browser_mod", "popup", data)
            except Exception as err:  # noqa: BLE001
                self.log("warning", f"Question impossible sur « {room.get('name')} » : {err}")

    async def _ask(self, node: dict[str, Any]) -> str:
        question = node["question"]
        media = node.get("media") or {}
        has_media = media.get("kind") in ("video", "audio") and media.get("content_id")
        attempts = int(question.get("repeats", 0)) + 1
        seconds = float(self.settings.get("question_seconds", 60))
        outcome = "no_answer"
        for attempt in range(attempts):
            answered: tuple[str, str] | None = None
            async with self.display_lock:
                rooms = choose_rooms(self.config, self.ha.states, "media")
                if not rooms:
                    self.log("warning", f"Aucune tablette disponible pour la question « {question['text']} »")
                else:
                    pq = PendingQuestion(rid=models.new_id("q"), rooms=rooms)
                    self.questions[pq.rid] = pq
                    if (has_media and media.get("kind") == "video"
                            and self.settings.get("video_question_mode", "single") != "legacy"):
                        answered = await self._ask_with_video(pq, rooms, question["text"], media, seconds)
                    else:
                        answered = await self._ask_two_popups(pq, rooms, question, media, has_media, seconds)
            if answered:
                return "yes" if answered[0] == "oui" else "no"
            if attempt < attempts - 1:
                self.log("info", f"Pas de réponse (essai {attempt + 1}/{attempts}), nouvelle tentative")
                await self.sleep(float(question.get("delay_minutes", 0)) * 60)
        self.log("info", f"Pas de réponse à « {question['text']} »")
        if (node.get("escalation") or {}).get("enabled"):
            await self._escalate(node["escalation"])
        return outcome

    async def _ask_two_popups(self, pq: PendingQuestion, rooms: list[dict[str, Any]], question: dict[str, Any],
                              media: dict[str, Any], has_media: bool, seconds: float) -> tuple[str, str] | None:
        """Ancien mode : lecteur browser_mod + popup de question séparé (audio, ou vidéo en mode « legacy »)."""
        answered: tuple[str, str] | None = None
        started = rooms
        playback: asyncio.Task | None = None
        # Vidéo + question : vidéo en haut, boutons moyens dessous, question entière après la vidéo.
        compact = has_media and media.get("kind") == "video"
        if has_media:
            started = await self._start_playback(rooms, media, compact)
            playback = asyncio.create_task(self._finish_playback(started, media))
            compact = compact and bool(started)
        await self._open_question(pq, question["text"], rooms, compact)
        try:
            if compact and playback:
                await asyncio.wait({pq.future, playback}, return_when=asyncio.FIRST_COMPLETED)
                if not pq.future.done():
                    for room in rooms:
                        await self._close_popup(room, "question")
                    await self._open_question(pq, question["text"], rooms, False)
            answered = await asyncio.wait_for(asyncio.shield(pq.future), seconds)
        except asyncio.TimeoutError:
            answered = None
        finally:
            self.questions.pop(pq.rid, None)
        await self._close_after_question(rooms, answered, stop_all=compact and not playback.done())
        if playback:
            # Les autres tablettes ont été arrêtées ; la vidéo de la tablette
            # qui a répondu se termine normalement avant de libérer l'écran.
            await asyncio.gather(playback, return_exceptions=True)
        return answered

    def video_event(self, rid: str, room_id: str, event: str) -> None:
        """Signal du popup unique : la vidéo a démarré ou s'est terminée dans une pièce."""
        pq = self.questions.get(rid)
        if not pq:
            return
        if event == "started":
            pq.started.add(room_id)
        elif event == "ended":
            pq.pending_video.discard(room_id)
            if not pq.pending_video:
                pq.video_done.set()

    async def _open_video_question(self, pq: PendingQuestion, room: dict[str, Any], text: str,
                                   url: str, mime: str) -> bool:
        """Ouvre le popup unique (vidéo en haut, boutons dessous) sur une tablette."""
        browser_id = self._browser_id(room)
        if not browser_id:
            return False
        try:
            await self._ensure_screen(room)
            await self.ha.call_service("browser_mod", "popup", {
                "browser_id": [browser_id],
                "tag": "video",
                "initial_style": "fullscreen",
                "dismissable": False,
                "popup_styles": [{"style": "all", "styles": video_popup.POPUP_STYLES}],
                "content": video_popup.build_html(
                    url=url, mime=mime, text=text, rid=pq.rid, room_id=room.get("id", ""),
                    video_percent=float(self.settings.get("video_height_percent", 80)),
                    button_height=int(float(self.settings.get("question_button_height", 90)))),
            })
            return True
        except Exception as err:  # noqa: BLE001
            self.log("warning", f"Vidéo + question impossibles sur « {room.get('name')} » : {err}")
            return False

    async def _video_watchdog(self, pq: PendingQuestion, rooms: list[dict[str, Any]], text: str) -> None:
        """Si la vidéo ne démarre pas (lecture automatique bloquée), la question seule prend le relais."""
        await asyncio.sleep(float(self.settings.get("start_timeout_seconds", 10)) + VIDEO_START_GRACE)
        for room in rooms:
            room_id = room.get("id", "")
            if room_id in pq.started or room_id not in pq.pending_video:
                continue
            self.log("warning", f"La vidéo n'a pas démarré sur « {room.get('name')} » : question seule")
            await self._close_popup(room, "video")
            await self._open_question(pq, text, [room], False)
            self.video_event(pq.rid, room_id, "ended")

    async def _ask_with_video(self, pq: PendingQuestion, rooms: list[dict[str, Any]], text: str,
                              media: dict[str, Any], seconds: float) -> tuple[str, str] | None:
        """Vidéo + question dans un seul popup ; le délai de réponse démarre à la fin de la vidéo."""
        info: dict[str, str] | None = None
        try:
            info = await self.ha.resolve_media(media["content_id"])
        except Exception as err:  # noqa: BLE001
            self.log("warning", f"Adresse de la vidéo introuvable ({err}) : question seule")
        opened: list[dict[str, Any]] = []
        if info and info.get("url"):
            extension = media["content_id"].rsplit(".", 1)[-1].lower().split("?")[0]
            mime = info.get("mime_type") or VIDEO_TYPES.get(extension, "video/mp4")
            for room in rooms:
                if await self._open_video_question(pq, room, text, info["url"], mime):
                    opened.append(room)
        pq.pending_video = {room.get("id", "") for room in opened}
        answered: tuple[str, str] | None = None
        watchdog: asyncio.Task | None = None
        try:
            if not opened:
                await self._open_question(pq, text, rooms, False)
            else:
                watchdog = asyncio.create_task(self._video_watchdog(pq, opened, text))
                waiter = asyncio.ensure_future(pq.video_done.wait())
                try:
                    await asyncio.wait({pq.future, waiter}, return_when=asyncio.FIRST_COMPLETED,
                                       timeout=VIDEO_MAX_SECONDS)
                finally:
                    waiter.cancel()
            answered = await asyncio.wait_for(asyncio.shield(pq.future), seconds)
        except asyncio.TimeoutError:
            answered = None
        finally:
            if watchdog:
                watchdog.cancel()
            self.questions.pop(pq.rid, None)
            for room in rooms:
                await self._close_popup(room, "question")
                await self._close_popup(room, "video")
        return answered

    async def _close_after_question(self, rooms: list[dict[str, Any]], answered: tuple[str, str] | None,
                                    stop_all: bool = False) -> None:
        """Ferme la question partout ; ferme aussi la vidéo des autres tablettes si répondu."""
        answered_room = answered[1] if answered else None
        for room in rooms:
            await self._close_popup(room, "question")
            if answered and (stop_all or room.get("id") != answered_room):
                await self._stop_media(room)
                await self._close_popup(room, "video")

    def submit_answer(self, rid: str, value: str, source: str = "bouton",
                      text: str = "", room_id: str = "") -> bool:
        """Point d'entrée des réponses (boutons aujourd'hui, IA demain)."""
        normalized = normalize_answer(value)
        pq = self.questions.get(rid)
        self.log("info", f"Réponse « {normalized} » (source : {source})",
                 source=source, text=text, value=normalized)
        if not pq or pq.future.done() or normalized == "indéterminé":
            return False
        pq.future.set_result((normalized, room_id))
        return True

    # ---- appels -----------------------------------------------------------------------
    def _in_call(self, room: dict[str, Any]) -> bool:
        return is_in_call(room, self.ha.states)

    def _extensions_map(self) -> dict[str, dict[str, str]]:
        names: dict[str, dict[str, str]] = {}
        for room in self.config["rooms"]:
            if room.get("extension"):
                names[str(room["extension"])] = {"name": room.get("name", "")}
        for person in models.caregivers(self.config):
            if person.get("extension"):
                names[str(person["extension"])] = {"name": person.get("name", "")}
        return names

    async def on_event(self, kind: str, data: dict[str, Any]) -> None:
        if kind == "state_changed":
            entity = data.get("entity_id")
            new_state = (data.get("new_state") or {}).get("state")
            old_state = (data.get("old_state") or {}).get("state")
            for room in self.config["rooms"]:
                if entity and call_sensor_of(room) == entity:
                    if new_state == BUSY_STATE and old_state != BUSY_STATE:
                        await self.show_call(room)
                    elif old_state == BUSY_STATE and new_state != BUSY_STATE:
                        await self.hide_call(room)
        elif kind == "logbook_entry" and data.get("name") == "taskmanager":
            parts = str(data.get("message", "")).split(ANSWER_SEPARATOR)
            if len(parts) == 4 and parts[0] == "answer":
                self.submit_answer(parts[1], parts[3], source="bouton", room_id=parts[2])
            elif len(parts) == 4 and parts[0] == "video":
                self.video_event(parts[1], parts[2], parts[3])

    async def show_call(self, room: dict[str, Any]) -> None:
        """Appel entrant : ferme la vidéo et la question, puis ouvre la Call Card."""
        self.log("info", f"Appel sur « {room.get('name')} »")
        await self._stop_media(room)
        await self._close_popup(room, "video")
        await self._close_popup(room, "question")
        browser_id = self._browser_id(room)
        if not browser_id:
            return
        try:
            await self._ensure_screen(room)
            await self.ha.call_service("browser_mod", "popup", {
                "browser_id": [browser_id],
                "initial_style": "fullscreen",
                "dismissable": True,
                "tag": "appel",
                "popup_styles": [{"style": "all", "styles": CALL_STYLES}],
                "content": {
                    "type": "custom:sip-call-card",
                    "extensions": self._extensions_map(),
                    "buttons": [],
                    "card_mod": {"style": CALL_CARD_STYLE},
                },
            })
        except Exception as err:  # noqa: BLE001
            self.log("warning", f"Popup d'appel impossible : {err}")

    async def hide_call(self, room: dict[str, Any]) -> None:
        await self._close_popup(room, "appel")

    async def _place_call(self, room: dict[str, Any], person: dict[str, Any]) -> bool:
        """Lance un appel depuis la tablette. Retourne True si l'appel semble avoir abouti."""
        path = str(self.settings.get("call_url_template", "")).format(extension=person["extension"])
        browser_id = self._browser_id(room)
        if not browser_id or not path:
            self.log("warning", "Appel impossible : Browser ID ou modèle d'URL d'appel manquant")
            return False
        await self._ensure_screen(room)
        await self.ha.call_service("browser_mod", "navigate", {"browser_id": [browser_id], "path": path})
        self.log("info", f"Appel de {person.get('name')} ({person['extension']}) depuis « {room.get('name')} »")
        if not await self._wait_until(lambda: self._in_call(room), 15):
            self.log("warning", "L'appel ne s'est pas établi")
            return False
        began = time_module.monotonic()
        await self._wait_until(lambda: not self._in_call(room), float(self.settings.get("call_max_seconds", 600)))
        lasted = time_module.monotonic() - began
        return lasted >= float(self.settings.get("call_unanswered_seconds", 20))

    async def _escalate(self, escalation: dict[str, Any]) -> None:
        people = [p for p in models.caregivers(self.config) if p.get("id") in escalation.get("caregiver_ids", [])]
        if not people:
            self.log("warning", "Escalade demandée mais aucun aidant sélectionné")
            return
        async with self.display_lock:
            rooms = choose_rooms(self.config, self.ha.states, "call")
            if not rooms:
                self.log("warning", "Escalade impossible : aucune tablette disponible pour l'appel")
                return
            room = rooms[0]
            for person in people:
                if await self._place_call(room, person):
                    break
            home = self.settings.get("tablet_home_path")
            if home and room.get("browser_id"):
                await self.ha.call_service("browser_mod", "navigate",
                                           {"browser_id": [room["browser_id"]], "path": home})

    # ---- fil du jour ---------------------------------------------------------------------
    def visible_events(self) -> list[dict[str, Any]]:
        """Événements importés des calendriers cochés, hors ceux que l'aidant a masqués."""
        hidden = set(self.config.get("hidden_events", []))
        return [event for event in self.calendar_events if event["key"] not in hidden]

    async def refresh_calendars(self) -> None:
        """Importe les événements des calendriers cochés (aujourd'hui + jours publiés, 14 jours au moins)."""
        entities = list(self.settings.get("calendar_entities") or [])
        days = max(14, int(self.settings.get("days_published", 4)))
        start = self.now().replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=days)
        events: list[dict[str, Any]] = []
        failed = False
        for entity_id in entities:
            try:
                raw_events = await self.ha.calendar_events(entity_id, start.isoformat(), end.isoformat())
            except Exception as err:  # noqa: BLE001
                failed = True
                self.log("warning", f"Calendrier {entity_id} indisponible : {err}")
                continue
            for raw in raw_events:
                raw_start = raw.get("start") or {}
                raw_end = raw.get("end") or {}
                start_value = raw_start.get("dateTime") or raw_start.get("date") or ""
                summary = str(raw.get("summary") or "Événement")
                events.append({
                    "key": schedule.event_key(entity_id, start_value, summary), "entity_id": entity_id,
                    "summary": summary, "start": start_value,
                    "end": raw_end.get("dateTime") or raw_end.get("date") or "",
                })
        if failed and self.calendar_events and not events:
            return  # on garde les derniers événements connus plutôt que de vider le fil
        events.sort(key=lambda event: (event["start"], event["summary"]))
        self.calendar_events = events
        self._calendar_refreshed = time_module.monotonic()

    def board(self) -> list[dict[str, Any]]:
        return schedule.build_board(
            self.storage.tasks, self.visible_events(),
            self.now().date(), int(self.settings.get("days_published", 4)),
        )

    async def publish_board(self) -> None:
        board = self.board()
        count = len(board[0]["items"]) if board else 0
        await self.ha.set_state(BOARD_ENTITY, str(count), {
            "friendly_name": "Fil du jour",
            "icon": "mdi:calendar-check",
            "days": board,
            "updated": self.now().isoformat(timespec="seconds"),
        })
