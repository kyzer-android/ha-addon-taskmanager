"""Client Home Assistant : REST, WebSocket et cache des états.

Passe par le proxy du Supervisor (http://supervisor/core) avec SUPERVISOR_TOKEN.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable

import aiohttp

_LOGGER = logging.getLogger(__name__)

Listener = Callable[[str, dict[str, Any]], Awaitable[None] | None]


class HaClient:
    def __init__(self, session: aiohttp.ClientSession, token: str,
                 base_url: str = "http://supervisor/core") -> None:
        self.session = session
        self.token = token
        self.base_url = base_url.rstrip("/")
        self.ws_url = self.base_url.replace("http", "ws", 1) + "/websocket"
        self.states: dict[str, dict[str, Any]] = {}
        self.listeners: list[Listener] = []
        self.connected = asyncio.Event()
        self._task: asyncio.Task | None = None

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    # ---- REST -----------------------------------------------------------------
    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self.base_url}/api{path}"
        async with self.session.request(method, url, headers=self.headers, **kwargs) as resp:
            text = await resp.text()
            if resp.status >= 400:
                raise RuntimeError(f"HA {method} {path} -> {resp.status}: {text[:200]}")
            return json.loads(text) if text else None

    async def get_config(self) -> dict[str, Any]:
        return await self._request("GET", "/config")

    async def call_service(self, domain: str, service: str, data: dict[str, Any]) -> Any:
        _LOGGER.debug("service %s.%s %s", domain, service, data)
        return await self._request("POST", f"/services/{domain}/{service}", json=data)

    async def set_state(self, entity_id: str, state: str, attributes: dict[str, Any]) -> Any:
        return await self._request(
            "POST", f"/states/{entity_id}", json={"state": state, "attributes": attributes}
        )

    async def calendar_events(self, entity_id: str, start: str, end: str) -> list[dict[str, Any]]:
        return await self._request(
            "GET", f"/calendars/{entity_id}", params={"start": start, "end": end}
        )

    async def refresh_states(self) -> None:
        for item in await self._request("GET", "/states"):
            self.states[item["entity_id"]] = item

    # ---- état ------------------------------------------------------------------
    def state(self, entity_id: str) -> str:
        return str((self.states.get(entity_id) or {}).get("state", "unknown"))

    def entities(self) -> list[dict[str, str]]:
        return sorted(
            (
                {
                    "entity_id": eid,
                    "name": str((s.get("attributes") or {}).get("friendly_name") or eid),
                    "state": str(s.get("state")),
                }
                for eid, s in self.states.items()
            ),
            key=lambda e: e["entity_id"],
        )

    async def ws_commands(self, types: list[str]) -> dict[str, Any]:
        """Envoie des commandes WebSocket ponctuelles (registres) et renvoie les résultats par type."""
        results: dict[str, Any] = {}
        async with self.session.ws_connect(self.ws_url, heartbeat=30) as ws:
            await ws.receive_json()
            await ws.send_json({"type": "auth", "access_token": self.token})
            reply = await ws.receive_json()
            if reply.get("type") != "auth_ok":
                raise RuntimeError(f"Authentification refusée : {reply}")
            for index, kind in enumerate(types, start=1):
                await ws.send_json({"id": index, "type": kind})
            pending = {index: kind for index, kind in enumerate(types, start=1)}
            while pending:
                message = await asyncio.wait_for(ws.receive_json(), timeout=15)
                if message.get("type") == "result" and message.get("id") in pending:
                    kind = pending.pop(message["id"])
                    results[kind] = message.get("result") if message.get("success") else []
        return results

    async def registry(self) -> dict[str, dict[str, Any]]:
        """Pièces et appareils des entités : {entity_id: {area, device}} (vide si indisponible)."""
        try:
            data = await self.ws_commands([
                "config/entity_registry/list", "config/device_registry/list", "config/area_registry/list"])
        except Exception as err:  # noqa: BLE001 - la liste reste utilisable sans pièces
            _LOGGER.warning("Registres HA indisponibles (%s)", err)
            return {}
        areas = {a["area_id"]: a.get("name", "") for a in data.get("config/area_registry/list", [])}
        devices = {d["id"]: d for d in data.get("config/device_registry/list", [])}
        info: dict[str, dict[str, Any]] = {}
        for entry in data.get("config/entity_registry/list", []):
            device = devices.get(entry.get("device_id") or "", {})
            area_id = entry.get("area_id") or device.get("area_id")
            info[entry["entity_id"]] = {
                "area": areas.get(area_id, "") if area_id else "",
                "device": device.get("name_by_user") or device.get("name") or "",
            }
        return info

    # ---- WebSocket ------------------------------------------------------------
    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="ha-websocket")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)

    async def _run(self) -> None:
        delay = 2
        while True:
            try:
                await self._listen()
                delay = 2
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001 - on reconnecte quoi qu'il arrive
                _LOGGER.warning("WebSocket HA interrompu (%s), nouvelle tentative dans %ss", err, delay)
            self.connected.clear()
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)

    async def _listen(self) -> None:
        async with self.session.ws_connect(self.ws_url, heartbeat=30) as ws:
            first = await ws.receive_json()
            if first.get("type") != "auth_required":
                raise RuntimeError(f"Message inattendu : {first}")
            await ws.send_json({"type": "auth", "access_token": self.token})
            reply = await ws.receive_json()
            if reply.get("type") != "auth_ok":
                raise RuntimeError(f"Authentification refusée : {reply}")
            await self.refresh_states()
            await ws.send_json({"id": 1, "type": "subscribe_events", "event_type": "state_changed"})
            await ws.send_json({"id": 2, "type": "subscribe_events", "event_type": "logbook_entry"})
            self.connected.set()
            _LOGGER.info("Connecté au WebSocket de Home Assistant")
            await self._dispatch("connected", {})
            async for msg in ws:
                if msg.type != aiohttp.WSMsgType.TEXT:
                    continue
                payload = json.loads(msg.data)
                if payload.get("type") != "event":
                    continue
                event = payload["event"]
                kind = event.get("event_type")
                data = event.get("data", {})
                if kind == "state_changed" and data.get("new_state"):
                    self.states[data["entity_id"]] = data["new_state"]
                await self._dispatch(kind, data)

    async def _dispatch(self, kind: str, data: dict[str, Any]) -> None:
        for listener in list(self.listeners):
            try:
                result = listener(kind, data)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Erreur dans un écouteur d'événement (%s)", kind)
