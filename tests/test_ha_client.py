import asyncio

import aiohttp
from aiohttp import web
from aiohttp.test_utils import TestServer

from taskmanager.ha_client import HaClient


def build_mock_ha(sent: list):
    async def states(request):
        assert request.headers["Authorization"] == "Bearer secret"
        return web.json_response([{"entity_id": "switch.a", "state": "on", "attributes": {"friendly_name": "A"}}])

    async def config(_):
        return web.json_response({"time_zone": "Europe/Paris"})

    async def service(request):
        sent.append((request.match_info["domain"], request.match_info["service"], await request.json()))
        return web.json_response([])

    async def set_state(request):
        sent.append(("state", request.match_info["entity"], await request.json()))
        return web.json_response({})

    async def websocket(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json({"type": "auth_required"})
        auth = await ws.receive_json()
        await ws.send_json({"type": "auth_ok" if auth["access_token"] == "secret" else "auth_invalid"})
        await ws.receive_json()
        await ws.receive_json()
        await ws.send_json({"id": 1, "type": "event", "event": {
            "event_type": "state_changed",
            "data": {"entity_id": "switch.a", "old_state": {"state": "on"},
                     "new_state": {"entity_id": "switch.a", "state": "off", "attributes": {}}}}})
        await ws.send_json({"id": 2, "type": "event", "event": {
            "event_type": "logbook_entry", "data": {"name": "taskmanager", "message": "answer|q1|salon|oui"}}})
        await asyncio.sleep(0.3)
        return ws

    app = web.Application()
    app.router.add_get("/api/states", states)
    app.router.add_get("/api/config", config)
    app.router.add_post("/api/services/{domain}/{service}", service)
    app.router.add_post("/api/states/{entity}", set_state)
    app.router.add_get("/websocket", websocket)
    return app


def test_rest_and_websocket_events():
    async def scenario():
        sent: list = []
        async with TestServer(build_mock_ha(sent)) as server:
            async with aiohttp.ClientSession() as session:
                client = HaClient(session, "secret", str(server.make_url("")).rstrip("/"))
                seen: list = []
                client.listeners.append(lambda kind, data: seen.append((kind, data)))
                assert (await client.get_config())["time_zone"] == "Europe/Paris"
                await client.call_service("media_player", "media_stop", {"entity_id": "media_player.x"})
                await client.set_state("sensor.demo", "3", {"a": 1})
                client.start()
                await asyncio.wait_for(client.connected.wait(), 3)
                await asyncio.sleep(0.15)
                await client.stop()
                assert client.state("switch.a") == "off"
                kinds = [kind for kind, _ in seen]
                assert "connected" in kinds and "state_changed" in kinds and "logbook_entry" in kinds
                assert client.entities()[0]["entity_id"] == "switch.a"
                assert sent[0] == ("media_player", "media_stop", {"entity_id": "media_player.x"})
                assert sent[1][0] == "state" and sent[1][1] == "sensor.demo"
    asyncio.run(scenario())
