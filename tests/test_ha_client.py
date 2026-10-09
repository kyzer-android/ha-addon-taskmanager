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


def test_registry_gives_area_and_device():
    async def websocket(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json({"type": "auth_required"})
        await ws.receive_json()
        await ws.send_json({"type": "auth_ok"})
        results = {
            "config/entity_registry/list": [
                {"entity_id": "media_player.salon", "device_id": "d1", "area_id": None},
                {"entity_id": "light.lampe", "device_id": None, "area_id": "a2"}],
            "config/device_registry/list": [{"id": "d1", "name": "Tablette", "name_by_user": None, "area_id": "a1"}],
            "config/area_registry/list": [{"area_id": "a1", "name": "Salon"}, {"area_id": "a2", "name": "Chambre"}],
        }
        for _ in range(3):
            message = await ws.receive_json()
            await ws.send_json({"id": message["id"], "type": "result", "success": True, "result": results[message["type"]]})
        await asyncio.sleep(0.1)
        return ws

    async def scenario():
        app = web.Application()
        app.router.add_get("/websocket", websocket)
        async with TestServer(app) as server:
            async with aiohttp.ClientSession() as session:
                client = HaClient(session, "secret", str(server.make_url("")).rstrip("/"))
                info = await client.registry()
                assert info["media_player.salon"] == {"area": "Salon", "device": "Tablette"}
                assert info["light.lampe"] == {"area": "Chambre", "device": ""}
                broken = HaClient(session, "secret", "http://127.0.0.1:1")
                assert await broken.registry() == {}

    asyncio.run(scenario())


def test_ws_call_returns_result_or_raises():
    async def websocket(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json({"type": "auth_required"})
        await ws.receive_json()
        await ws.send_json({"type": "auth_ok"})
        message = await ws.receive_json()
        if message["type"] == "ok/cmd":
            await ws.send_json({"id": message["id"], "type": "result", "success": True, "result": {"echo": message["x"]}})
        else:
            await ws.send_json({"id": message["id"], "type": "result", "success": False, "error": {"message": "refusé"}})
        await asyncio.sleep(0.1)
        return ws

    async def scenario():
        app = web.Application()
        app.router.add_get("/websocket", websocket)
        async with TestServer(app) as server:
            async with aiohttp.ClientSession() as session:
                client = HaClient(session, "secret", str(server.make_url("")).rstrip("/"))
                assert await client.ws_call("ok/cmd", x=3) == {"echo": 3}
                try:
                    await client.ws_call("bad/cmd")
                except RuntimeError as err:
                    assert "refusé" in str(err)
                else:
                    raise AssertionError("RuntimeError attendue")

    asyncio.run(scenario())


def test_browsers_come_from_browser_mod_devices():
    async def websocket(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json({"type": "auth_required"})
        await ws.receive_json()
        await ws.send_json({"type": "auth_ok"})
        message = await ws.receive_json()
        devices = [
            {"id": "d1", "name": "Tablette salon", "name_by_user": None, "identifiers": [["browser_mod", "tablette-salon"]]},
            {"id": "d2", "name": "Tablette chambre", "name_by_user": "Chambre", "identifiers": [["browser_mod", "Tablette-Chambre"]]},
            {"id": "d3", "name": "Lampe", "identifiers": [["hue", "abc"]]}]
        await ws.send_json({"id": message["id"], "type": "result", "success": True, "result": devices})
        await asyncio.sleep(0.1)
        return ws

    async def scenario():
        app = web.Application()
        app.router.add_get("/websocket", websocket)
        async with TestServer(app) as server:
            async with aiohttp.ClientSession() as session:
                client = HaClient(session, "secret", str(server.make_url("")).rstrip("/"))
                assert await client.browsers() == [
                    {"browser_id": "Tablette-Chambre", "name": "Chambre"},
                    {"browser_id": "tablette-salon", "name": "Tablette salon"}]
                broken = HaClient(session, "secret", "http://127.0.0.1:1")
                assert await broken.browsers() == []

    asyncio.run(scenario())
