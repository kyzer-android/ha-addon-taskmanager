"""Modèle de données : valeurs par défaut, identifiants et validation légère."""

from __future__ import annotations

import copy
from datetime import date
import uuid
from typing import Any

DEFAULT_VIDEO_STYLE = (
    "ha-dialog {\n"
    "  --ha-dialog-surface-background: black;\n"
    "}\n"
    "ha-dialog .container {\n"
    "  padding: 0px;\n"
    "}\n"
    "video::-webkit-media-controls {\n"
    "  display: none !important;\n"
    "}\n"
    "video {\n"
    "  pointer-events: none;\n"
    "}\n"
)

DEFAULT_SETTINGS: dict[str, Any] = {
    "question_seconds": 60,
    "screen_wait_seconds": 1,
    "start_timeout_seconds": 10,
    "tablet_home_path": "",
    "call_url_template": "/lovelace/0?call={extension}",
    "call_unanswered_seconds": 20,
    "call_max_seconds": 600,
    "sensor_loop_max_runs": 24,
    "days_published": 4,
    "grace_minutes": 5,
    "tablet_background": "",
    "tablet_background_mode": "tile",
    "tablet_font_scale": 1.0,
    "tablet_min_day_width": 360,
    "video_style": DEFAULT_VIDEO_STYLE,
    "calendar_entities": [],
    "calendar_refresh_minutes": 10,
    "media_max_mb": 500,
}

DEFAULT_CONFIG: dict[str, Any] = {
    "rooms": [],
    "default_room_id": "",
    "users": [],
    "catalog": [],
    "settings": copy.deepcopy(DEFAULT_SETTINGS),
    "hidden_events": [],
}

USER_ROLES = ("aidant", "tablette")
TRIGGERS = ("yes", "no", "no_answer", "sensor")
MEDIA_KINDS = ("video", "audio", "none")
SCHEDULE_TYPES = ("daily", "once")


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def new_node(title: str = "") -> dict[str, Any]:
    return {
        "id": new_id("n"),
        "title": title,
        "media": {"kind": "none", "content_id": "", "label": ""},
        "question": None,
        "escalation": {"enabled": False, "caregiver_ids": []},
        "children": [],
    }


def new_task(title: str = "Nouvelle tâche") -> dict[str, Any]:
    return {
        "id": new_id("t"),
        "title": title,
        "enabled": True,
        "visible": True,
        "archived": False,
        "schedule": {"type": "daily", "days": [0, 1, 2, 3, 4, 5, 6], "date": "", "time": "08:00"},
        "root": new_node(title),
        "last_run_date": "",
        "last_status": "",
    }


def clean_node(node: dict[str, Any]) -> dict[str, Any]:
    """Normalise un nœud (et ses sous-tâches) reçu de l'interface."""
    base = new_node()
    out: dict[str, Any] = {
        "id": str(node.get("id") or base["id"]),
        "title": str(node.get("title") or ""),
    }
    media = node.get("media") or {}
    kind = media.get("kind") if media.get("kind") in MEDIA_KINDS else "none"
    out["media"] = {
        "kind": kind,
        "content_id": str(media.get("content_id") or "") if kind != "none" else "",
        "label": str(media.get("label") or ""),
    }
    question = node.get("question")
    if question:
        out["question"] = {
            "text": str(question.get("text") or "Tout va bien ?"),
            "repeats": max(0, int(question.get("repeats") or 0)),
            "delay_minutes": max(0, float(question.get("delay_minutes") or 0)),
        }
    else:
        out["question"] = None
    esc = node.get("escalation") or {}
    out["escalation"] = {
        "enabled": bool(esc.get("enabled")),
        "caregiver_ids": [str(c) for c in (esc.get("caregiver_ids") or [])],
    }
    children = []
    for child in node.get("children") or []:
        trigger = child.get("trigger") if child.get("trigger") in TRIGGERS else "yes"
        entry: dict[str, Any] = {"trigger": trigger, "node": clean_node(child.get("node") or {})}
        if trigger == "sensor":
            sensor = child.get("sensor") or {}
            entry["sensor"] = {
                "entity_id": str(sensor.get("entity_id") or ""),
                "state": str(sensor.get("state") or "on"),
                "repeat_minutes": max(0.1, float(sensor.get("repeat_minutes") or 10)),
            }
        children.append(entry)
    out["children"] = children
    return out


def clean_dates(raw: Any) -> list[str]:
    """Jours supprimés d'une tâche répétée (dates ISO valides, sans doublon)."""
    days: set[str] = set()
    for value in raw or []:
        try:
            days.add(date.fromisoformat(str(value)).isoformat())
        except ValueError:
            continue
    return sorted(days)


def clean_task(task: dict[str, Any]) -> dict[str, Any]:
    """Normalise une tâche complète reçue de l'interface."""
    base = new_task()
    sched = task.get("schedule") or {}
    stype = sched.get("type") if sched.get("type") in SCHEDULE_TYPES else "daily"
    days = sorted({int(d) for d in (sched.get("days") or []) if 0 <= int(d) <= 6})
    out = {
        "id": str(task.get("id") or base["id"]),
        "title": str(task.get("title") or "Sans titre"),
        "enabled": bool(task.get("enabled", True)),
        "visible": bool(task.get("visible", True)),
        "archived": bool(task.get("archived", False)),
        "schedule": {
            "type": stype,
            "days": days if stype == "daily" else [],
            "date": str(sched.get("date") or "") if stype == "once" else "",
            "time": str(sched.get("time") or "08:00"),
        },
        "root": clean_node(task.get("root") or {}),
        "last_run_date": str(task.get("last_run_date") or ""),
        "last_status": str(task.get("last_status") or ""),
        "skipped_dates": clean_dates(task.get("skipped_dates")) if stype == "daily" else [],
    }
    if not out["root"]["title"]:
        out["root"]["title"] = out["title"]
    return out


def clean_user(raw: dict[str, Any]) -> dict[str, Any]:
    """Un utilisateur : compte HA + rôle (aidant ou tablette) + extension SIP (aidant)."""
    role = raw.get("role") if raw.get("role") in USER_ROLES else "aidant"
    return {
        "id": str(raw.get("id") or new_id("u")),
        "ha_user_id": str(raw.get("ha_user_id") or ""),
        "name": str(raw.get("name") or ""),
        "role": role,
        "extension": str(raw.get("extension") or "") if role == "aidant" else "",
    }


def caregivers(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Utilisateurs appelables en escalade."""
    return [user for user in config.get("users", []) if user.get("role") == "aidant"]


def merge_config(raw: dict[str, Any]) -> dict[str, Any]:
    """Complète une configuration lue sur disque avec les valeurs par défaut."""
    config = copy.deepcopy(DEFAULT_CONFIG)
    for key in ("rooms", "catalog"):
        config[key] = list(raw.get(key) or [])
    config["hidden_events"] = [str(key) for key in (raw.get("hidden_events") or [])]
    # Reprise de l'ancienne liste « aidants » : mêmes identifiants, donc les tâches restent valides.
    legacy = [{**person, "role": "aidant"} for person in (raw.get("caregivers") or [])]
    config["users"] = [clean_user(user) for user in (raw.get("users") or legacy)]
    config["default_room_id"] = str(raw.get("default_room_id") or "")
    config["settings"].update(raw.get("settings") or {})
    return config
