"""Choix des pièces (et donc des tablettes) selon la présence détectée."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping

BUSY_STATE = "Busy"


def parse_ts(value: str | None) -> float:
    """Convertit un horodatage ISO de HA en secondes ; 0 si invalide."""
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def state_of(states: Mapping[str, Mapping[str, Any]], entity_id: str) -> str:
    return str((states.get(entity_id) or {}).get("state", "unknown"))


def call_sensor_of(room: Mapping[str, Any]) -> str:
    """Capteur d'état d'appel : celui saisi (avancé), sinon celui déduit de l'extension SIP."""
    explicit = str(room.get("call_sensor") or "").strip()
    if explicit:
        return explicit
    extension = str(room.get("extension") or "").strip()
    return f"sensor.pjsip_{extension}_{extension}_state" if extension else ""


def is_in_call(room: Mapping[str, Any], states: Mapping[str, Mapping[str, Any]]) -> bool:
    sensor = call_sensor_of(room)
    return bool(sensor) and state_of(states, sensor) == BUSY_STATE


def detected_rooms(
    rooms: list[dict[str, Any]], states: Mapping[str, Mapping[str, Any]]
) -> list[dict[str, Any]]:
    """Pièces dont le capteur de présence est actif, la plus récente d'abord."""
    found = []
    for room in rooms:
        sensor = room.get("presence_sensor")
        if sensor and state_of(states, sensor) == "on":
            since = parse_ts((states.get(sensor) or {}).get("last_changed"))
            found.append((since, room))
    found.sort(key=lambda pair: pair[0], reverse=True)
    return [room for _, room in found]


def choose_rooms(
    config: Mapping[str, Any],
    states: Mapping[str, Mapping[str, Any]],
    purpose: str = "media",
) -> list[dict[str, Any]]:
    """Retourne les pièces ciblées.

    - media : la pièce détectée le plus récemment, sinon toutes les tablettes.
      Les tablettes en appel sont exclues.
    - call : la pièce détectée le plus récemment, sinon la tablette par défaut.
    """
    rooms: list[dict[str, Any]] = [r for r in config.get("rooms", []) if r.get("media_player")]
    available = [r for r in rooms if not is_in_call(r, states)]
    detected = [r for r in detected_rooms(rooms, states) if r in available]
    if detected:
        return [detected[0]]
    if purpose == "call":
        default_id = config.get("default_room_id")
        default = next((r for r in available if r.get("id") == default_id), None)
        if default:
            return [default]
        return available[:1]
    return available
