"""Calcul des échéances et construction du fil de la journée (fonctions pures)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

WEEKDAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MONTHS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]
ALL_DAY_LABEL = "Journée"


def label_fr(day: date) -> str:
    return f"{WEEKDAYS_FR[day.weekday()]} {day.day} {MONTHS_FR[day.month - 1]}"


def parse_hhmm(value: str) -> time:
    try:
        hour, minute = (int(part) for part in value.split(":")[:2])
        return time(hour % 24, minute % 60)
    except (ValueError, AttributeError):
        return time(8, 0)


def occurs_on(task: dict[str, Any], day: date) -> bool:
    """La tâche tombe-t-elle ce jour-là ?"""
    sched = task["schedule"]
    if sched["type"] == "daily":
        return day.weekday() in sched.get("days", [])
    try:
        return date.fromisoformat(sched.get("date", "")) == day
    except ValueError:
        return False


def scheduled_datetime(task: dict[str, Any], day: date, tzinfo) -> datetime:
    return datetime.combine(day, parse_hhmm(task["schedule"]["time"]), tzinfo=tzinfo)


def is_due(task: dict[str, Any], now: datetime, grace_minutes: float) -> bool:
    """Vrai si l'échéance du jour est passée depuis moins de `grace_minutes`."""
    if not task.get("enabled", True) or task.get("archived"):
        return False
    today = now.date()
    if not occurs_on(task, today):
        return False
    if task.get("last_run_date") == today.isoformat():
        return False
    delta = (now - scheduled_datetime(task, today, now.tzinfo)).total_seconds()
    return 0 <= delta <= grace_minutes * 60


def is_missed_once(task: dict[str, Any], today: date) -> bool:
    """Tâche unique dont le jour est passé : à archiver."""
    sched = task["schedule"]
    if sched["type"] != "once" or task.get("archived"):
        return False
    try:
        return date.fromisoformat(sched.get("date", "")) < today
    except ValueError:
        return False


def event_day_and_time(event: dict[str, Any]) -> tuple[date | None, str]:
    start = str(event.get("start") or "")
    if not start:
        return None, ALL_DAY_LABEL
    try:
        if "T" in start:
            moment = datetime.fromisoformat(start.replace("Z", "+00:00"))
            return moment.date(), moment.strftime("%H:%M")
        return date.fromisoformat(start), ALL_DAY_LABEL
    except ValueError:
        return None, ALL_DAY_LABEL


def items_for_day(
    tasks: list[dict[str, Any]],
    shown_events: list[dict[str, Any]],
    day: date,
    only_visible: bool = True,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for task in tasks:
        if task.get("archived") or not task.get("enabled", True):
            continue
        if only_visible and not task.get("visible", True):
            continue
        if occurs_on(task, day):
            items.append({
                "time": task["schedule"]["time"],
                "title": task["title"],
                "kind": "task",
                "id": task["id"],
            })
    for event in shown_events:
        event_day, label = event_day_and_time(event)
        if event_day == day:
            items.append({
                "time": label,
                "title": str(event.get("summary") or "Événement"),
                "kind": "event",
                "id": str(event.get("key") or ""),
            })
    items.sort(key=lambda item: ("" if item["time"] == ALL_DAY_LABEL else item["time"], item["title"]))
    return items


def build_board(
    tasks: list[dict[str, Any]],
    shown_events: list[dict[str, Any]],
    today: date,
    days: int,
) -> list[dict[str, Any]]:
    board = []
    for offset in range(max(1, days)):
        day = today + timedelta(days=offset)
        board.append({
            "date": day.isoformat(),
            "label": label_fr(day),
            "items": items_for_day(tasks, shown_events, day),
        })
    return board
