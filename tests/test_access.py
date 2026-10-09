import asyncio
import os

from aiohttp.test_utils import TestClient, TestServer

from taskmanager import models
from taskmanager.api import build_app

os.environ["TM_ALLOW_ANY"] = "1"
WEB = os.path.join(os.path.dirname(__file__), "..", "taskmanager", "app", "web")


def run_with(engine, scenario):
    async def go():
        async with TestClient(TestServer(build_app(engine, WEB))) as client:
            return await scenario(client)
    return asyncio.run(go())


def setup_users(engine):
    engine.storage.set_config({**engine.config, "users": [
        {"id": "c1", "name": "Mathieu", "role": "aidant", "ha_user_id": "u1", "extension": "100"},
        {"id": "t1", "name": "Tablette salon", "role": "tablette", "ha_user_id": "tab1"}]})


def test_legacy_caregivers_become_users():
    config = models.merge_config({"caregivers": [{"id": "c1", "name": "Mathieu", "extension": "100"}]})
    assert config["users"] == [{"id": "c1", "ha_user_id": "", "name": "Mathieu", "role": "aidant", "extension": "100"}]
    assert [u["id"] for u in models.caregivers(config)] == ["c1"]
    tablet = models.clean_user({"role": "tablette", "extension": "999", "ha_user_id": "x"})
    assert tablet["extension"] == ""


def test_roles(engine):
    setup_users(engine)

    async def scenario(client):
        async def role(user_id):
            headers = {"X-Remote-User-Id": user_id} if user_id else {}
            return (await (await client.get("/api/me", headers=headers)).json())["role"]
        assert await role("admin1") == "admin"
        assert await role("u1") == "aidant"
        assert await role("tab1") == "tablette"
        assert await role("other") == "tablette"
        assert await role("") == "admin"
    run_with(engine, scenario)


def test_everyone_full_until_users_declared(engine):
    engine.storage.set_config({**engine.config, "users": []})

    async def scenario(client):
        data = await (await client.get("/api/me", headers={"X-Remote-User-Id": "tab1"})).json()
        assert data["role"] == "admin"
    run_with(engine, scenario)


def test_tablet_account_is_read_only(engine):
    setup_users(engine)

    async def scenario(client):
        tab = {"X-Remote-User-Id": "tab1"}
        assert (await client.get("/api/tablet", headers=tab)).status == 200
        assert (await client.get("/js/app.js", headers=tab)).status == 200
        for path in ("/api/config", "/api/tasks", "/api/journal", "/api/users", "/api/images"):
            assert (await client.get(path, headers=tab)).status == 403, path
        assert (await client.put("/api/config", json={}, headers=tab)).status == 403
        assert (await client.post("/api/tasks/x/run", json={}, headers=tab)).status == 403
        assert (await client.get("/api/config", headers={"X-Remote-User-Id": "u1"})).status == 200
    run_with(engine, scenario)


def test_unknown_ha_users_fall_back_safely(engine):
    setup_users(engine)
    engine.ha.ha_users = None

    async def scenario(client):
        async def role(user_id):
            return (await (await client.get("/api/me", headers={"X-Remote-User-Id": user_id})).json())["role"]
        assert await role("tab1") == "tablette"   # déclaré : son rôle reste
        assert await role("stranger") == "admin"  # liste HA indisponible : pas de blocage
    run_with(engine, scenario)


def test_images_upload_select_and_serve(engine, tmp_path):
    setup_users(engine)
    media = tmp_path / "media-folder"
    media.mkdir()
    engine.media_dir = str(media)
    (media / "fond.jpg").write_bytes(b"jpgdata")

    async def scenario(client):
        from aiohttp import FormData
        form = FormData()
        form.add_field("file", b"\x89PNG-fake", filename="mon_fond.png", content_type="image/png")
        uploaded = await (await client.post("/api/images", data=form)).json()
        assert uploaded["value"] == "upload:mon_fond.png"
        bad = FormData()
        bad.add_field("file", b"x", filename="virus.exe", content_type="application/octet-stream")
        assert (await client.post("/api/images", data=bad)).status == 400
        values = {item["value"] for item in await (await client.get("/api/images")).json()}
        assert values == {"upload:mon_fond.png", "media:fond.jpg"}
        assert (await (await client.get("/api/image/media/fond.jpg")).read()) == b"jpgdata"
        assert (await client.get("/api/image/media/..%2Fsecret.jpg")).status == 404
        assert (await client.get("/api/image/upload/absent.png")).status == 404
        config = await (await client.get("/api/config")).json()
        config["settings"]["tablet_background"] = uploaded["value"]
        await client.put("/api/config", json=config)
        tablet = await (await client.get("/api/tablet", headers={"X-Remote-User-Id": "tab1"})).json()
        assert tablet["settings"]["background_url"] == "api/image/upload/mon_fond.png"
        assert (await client.delete("/api/images/mon_fond.png")).status == 200
    run_with(engine, scenario)


def test_caregiver_sees_only_daily_tools(engine):
    setup_users(engine)

    async def scenario(client):
        aidant = {"X-Remote-User-Id": "u1"}
        data = await (await client.get("/api/me", headers=aidant)).json()
        assert data["full"] is True and data["admin"] is False
        for path in ("/api/tasks", "/api/templates", "/api/config", "/api/entities"):
            assert (await client.get(path, headers=aidant)).status == 200, path
        for path in ("/api/journal", "/api/users", "/api/images", "/api/guides", "/api/guides/serveur"):
            assert (await client.get(path, headers=aidant)).status == 403, path
        assert (await client.put("/api/config", json={}, headers=aidant)).status == 403
        assert (await client.put("/api/guides/serveur", data="# x", headers=aidant)).status == 403
        assert (await client.delete("/api/guides/serveur", headers=aidant)).status == 403
        admin = await (await client.get("/api/me", headers={"X-Remote-User-Id": "admin1"})).json()
        assert admin["admin"] is True
    run_with(engine, scenario)


def test_ha_admin_listed_as_caregiver_stays_admin(engine):
    engine.storage.set_config({**engine.config, "users": [
        {"id": "c9", "name": "Admin", "role": "aidant", "ha_user_id": "admin1", "extension": "101"}]})

    async def scenario(client):
        data = await (await client.get("/api/me", headers={"X-Remote-User-Id": "admin1"})).json()
        assert data["admin"] is True
        assert (await client.get("/api/guides", headers={"X-Remote-User-Id": "admin1"})).status == 200
    run_with(engine, scenario)


def test_guides_default_replace_reset(engine):
    async def scenario(client):
        listing = await (await client.get("/api/guides")).json()
        assert [g["id"] for g in listing] == ["serveur", "tablette"]
        assert not any(g["custom"] for g in listing)
        default = await (await client.get("/api/guides/serveur")).json()
        assert default["custom"] is False and default["markdown"].startswith("#")
        assert "maisondrusch" not in default["markdown"]
        resp = await client.put("/api/guides/serveur", data="# Mon guide\n\n| a | b |\n|---|---|\n| 1 | 2 |".encode())
        assert resp.status == 200
        mine = await (await client.get("/api/guides/serveur")).json()
        assert mine["custom"] is True and mine["markdown"].startswith("# Mon guide")
        assert (await (await client.get("/api/guides/tablette")).json())["custom"] is False
        assert (await client.put("/api/guides/serveur", data=b"  ")).status == 400
        assert (await client.put("/api/guides/serveur", data=b"\xff\xfe\x00")).status == 400
        assert (await client.put("/api/guides/inconnu", data=b"# x")).status == 404
        assert (await client.delete("/api/guides/serveur")).status == 200
        assert (await (await client.get("/api/guides/serveur")).json())["custom"] is False
    run_with(engine, scenario)
