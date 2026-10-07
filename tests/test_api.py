import asyncio
import os
from pathlib import Path

from aiohttp.test_utils import TestClient, TestServer

from taskmanager.api import build_app, list_media

os.environ["TM_ALLOW_ANY"] = "1"
WEB = Path(__file__).resolve().parents[1] / "taskmanager" / "app" / "web"


def with_client(engine, scenario):
    async def go():
        async with TestClient(TestServer(build_app(engine, WEB))) as client:
            return await scenario(client)
    return asyncio.run(go())


def test_task_lifecycle(engine):
    async def scenario(client):
        task = {"title": "Lever", "schedule": {"type": "daily", "days": [0, 1, 2, 3, 4, 5, 6], "time": "08:00"},
                "root": {"media": {"kind": "video", "content_id": "media-source://media/a.mp4"}}}
        created = await (await client.post("/api/tasks", json=task)).json()
        assert created["id"] and created["root"]["media"]["kind"] == "video"
        flagged = await (await client.post(f"/api/tasks/{created['id']}/flag",
                                           json={"name": "visible", "value": False})).json()
        assert flagged["visible"] is False
        day = await (await client.get("/api/day")).json()
        assert [i["title"] for i in day["items"]] == ["Lever"]
        board = await (await client.get("/api/board?days=2")).json()
        assert board[0]["items"] == []  # masquée : absente de la tablette
        copy = await (await client.post(f"/api/tasks/{created['id']}/duplicate", json={"date": "2026-12-25"})).json()
        assert copy["schedule"]["type"] == "once" and copy["id"] != created["id"]
        assert (await client.delete(f"/api/tasks/{created['id']}")).status == 200
        assert (await client.delete("/api/tasks/nope")).status == 404
    with_client(engine, scenario)


def test_config_roundtrip_and_static_index(engine):
    async def scenario(client):
        config = await (await client.get("/api/config")).json()
        config["caregivers"].append({"name": "Nouvelle", "extension": "104"})
        saved = await (await client.put("/api/config", json=config)).json()
        assert saved["caregivers"][-1]["id"]
        page = await client.get("/")
        assert page.status == 200 and "Gestionnaire de tâches" in await page.text()
        assert (await client.get("/js/app.js")).status == 200
    with_client(engine, scenario)


def test_forbidden_without_ingress_ip(engine):
    os.environ["TM_ALLOW_ANY"] = "0"
    try:
        async def scenario(client):
            return (await client.get("/api/config")).status
        assert with_client(engine, scenario) == 403
    finally:
        os.environ["TM_ALLOW_ANY"] = "1"


def test_media_listing_and_calendar(engine, tmp_path):
    (tmp_path / "video_papa").mkdir()
    (tmp_path / "video_papa" / "lever.mp4").write_bytes(b"")
    (tmp_path / "video_papa" / "note.txt").write_bytes(b"")
    found = list_media(str(tmp_path))
    assert found == [{"name": "lever.mp4", "path": "video_papa/lever.mp4",
                      "content_id": "media-source://media/video_papa/lever.mp4", "kind": "video"}]
    engine.storage.config["settings"]["calendar_entities"] = ["calendar.papa"]

    async def scenario(client):
        events = await (await client.get("/api/calendar")).json()
        assert events[0]["summary"] == "Médecin" and events[0]["shown"] is False
        await client.put("/api/shown_events", json=[events[0]])
        again = await (await client.get("/api/calendar")).json()
        assert again[0]["shown"] is True
    with_client(engine, scenario)


def test_answer_endpoint_for_future_ai(engine):
    async def scenario(client):
        reply = await (await client.post("/api/answer", json={"request_id": "x", "value": "oui", "source": "IA"})).json()
        assert reply == {"accepted": False}
    with_client(engine, scenario)


def test_ingress_repeated_slashes(engine):
    async def scenario(client):
        for path in ("////", "////css//app.css", "////api//status"):
            assert (await client.get(path)).status == 200, path
    with_client(engine, scenario)


def test_card_status_route(engine):
    async def scenario(client):
        data = await (await client.get("/api/card")).json()
        assert data["resource"] == "unknown"
    with_client(engine, scenario)
