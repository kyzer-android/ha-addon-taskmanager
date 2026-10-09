import asyncio
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taskmanager" / "app"))

from taskmanager.engine import Engine  # noqa: E402
from taskmanager.storage import Storage  # noqa: E402


class FakeHa:
    """Faux Home Assistant : enregistre les appels de services et simule les lecteurs."""

    def __init__(self) -> None:
        self.states: dict[str, dict[str, Any]] = {}
        self.listeners: list = []
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.connected = asyncio.Event()
        self.connected.set()
        self.play_seconds = 0.05
        self.call_seconds = 0.05
        self.published: list[tuple[str, str, dict[str, Any]]] = []
        self.ha_users: list | None = [
            {"id": "admin1", "name": "Admin", "username": "admin", "is_admin": True},
            {"id": "u1", "name": "Mathieu", "username": "mathieu", "is_admin": False},
            {"id": "tab1", "name": "Tablette salon", "username": "tablettesalon", "is_admin": False},
            {"id": "other", "name": "Autre", "username": "autre", "is_admin": False}]

    def set(self, entity_id: str, state: str, **extra: Any) -> None:
        self.states[entity_id] = {"state": state, "last_changed": extra.pop("last_changed", None), **extra}

    def state(self, entity_id: str) -> str:
        return str((self.states.get(entity_id) or {}).get("state", "unknown"))

    async def users(self):
        return self.ha_users

    def entities(self):
        return [{"entity_id": k, "name": k, "state": v["state"]} for k, v in self.states.items()]

    async def get_config(self):
        return {"time_zone": "Europe/Paris"}

    async def set_state(self, entity_id, state, attributes):
        self.published.append((entity_id, state, attributes))

    async def calendar_events(self, entity_id, start, end):
        from datetime import date, timedelta  # demain : le test ne dépend pas de la date du jour
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        return [{"summary": "Médecin", "start": {"dateTime": f"{tomorrow}T10:00:00+02:00"}}]

    async def call_service(self, domain, service, data):
        self.calls.append((domain, service, data))
        if (domain, service) == ("media_player", "play_media"):
            entity = data["entity_id"]
            self.set(entity, "playing")
            asyncio.get_running_loop().call_later(self.play_seconds, lambda: self.set(entity, "idle"))
        elif (domain, service) == ("media_player", "media_stop"):
            self.set(data["entity_id"], "idle")
        elif (domain, service) == ("homeassistant", "turn_on"):
            self.set(data["entity_id"], "on")
        elif (domain, service) == ("browser_mod", "navigate") and "call=" in data.get("path", ""):
            sensor = "sensor.pjsip_102_102_state"
            self.set(sensor, "Busy")
            asyncio.get_running_loop().call_later(self.call_seconds, lambda: self.set(sensor, "Not in use"))

    def services(self, domain: str, service: str) -> list[dict[str, Any]]:
        return [d for dom, svc, d in self.calls if (dom, svc) == (domain, service)]


def make_config() -> dict[str, Any]:
    return {
        "rooms": [
            {"id": "salon", "name": "Salon", "extension": "102", "media_player": "media_player.salon",
             "screen": "switch.salon_ecran", "call_sensor": "sensor.pjsip_102_102_state",
             "browser_id": "tablette-salon", "presence_sensor": "binary_sensor.presence_salon"},
            {"id": "chambre", "name": "Chambre", "extension": "101", "media_player": "media_player.chambre",
             "screen": "switch.chambre_ecran", "call_sensor": "sensor.pjsip_101_101_state",
             "browser_id": "tablette-chambre", "presence_sensor": "binary_sensor.presence_chambre"},
        ],
        "default_room_id": "salon",
        "users": [{"id": "c1", "name": "Mathieu", "extension": "100", "role": "aidant", "ha_user_id": "u1"},
                       {"id": "c2", "name": "Shirley", "extension": "103", "role": "aidant", "ha_user_id": "u2"}],
        "catalog": [],
        "settings": {"question_seconds": 0.2, "start_timeout_seconds": 2, "screen_wait_seconds": 0,
                     "call_unanswered_seconds": 0, "call_max_seconds": 5},
    }


@pytest.fixture
def ha() -> FakeHa:
    fake = FakeHa()
    fake.set("switch.salon_ecran", "on")
    fake.set("switch.chambre_ecran", "on")
    fake.set("media_player.salon", "idle")
    fake.set("media_player.chambre", "idle")
    fake.set("sensor.pjsip_102_102_state", "Not in use")
    fake.set("sensor.pjsip_101_101_state", "Not in use")
    fake.set("binary_sensor.presence_salon", "off")
    fake.set("binary_sensor.presence_chambre", "off")
    return fake


@pytest.fixture
def engine(tmp_path, ha) -> Engine:
    storage = Storage(tmp_path)
    storage.set_config(make_config())

    async def fast_sleep(_seconds: float) -> None:
        await asyncio.sleep(0)

    return Engine(storage, ha, media_dir=str(tmp_path), sleep=fast_sleep)
