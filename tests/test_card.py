import asyncio

from taskmanager.card import RESOURCE_PATH, CardInstaller


class FakeWs:
    def __init__(self, resources, fail=False):
        self.resources = resources
        self.fail = fail
        self.calls = []
        self.connected = asyncio.Event()
        self.connected.set()

    async def ws_call(self, kind, **params):
        self.calls.append((kind, params))
        if self.fail:
            raise RuntimeError("Resources are not editable in YAML mode")
        return self.resources if kind == "lovelace/resources" else {}


def make_source(tmp_path):
    source = tmp_path / "card.js"
    source.write_text("const V='__VERSION__';", encoding="utf-8")
    return source


def test_install_and_create_resource(tmp_path):
    (tmp_path / "homeassistant").mkdir()
    ha = FakeWs([])
    installer = CardInstaller(ha, make_source(tmp_path), tmp_path / "homeassistant/www/taskmanager", "9.9.9")
    asyncio.run(installer.run())
    assert (tmp_path / "homeassistant/www/taskmanager/taskmanager-card.js").read_text() == "const V='9.9.9';"
    assert ha.calls[-1] == ("lovelace/resources/create", {"res_type": "module", "url": f"{RESOURCE_PATH}?v=9.9.9"})
    assert installer.status["resource"] == "ok" and installer.status["file"] is True


def test_resource_updated_when_version_changes(tmp_path):
    (tmp_path / "homeassistant").mkdir()
    ha = FakeWs([{"id": "abc", "url": f"{RESOURCE_PATH}?v=0.0.1", "type": "module"}])
    installer = CardInstaller(ha, make_source(tmp_path), tmp_path / "homeassistant/www/taskmanager", "2.0.0")
    asyncio.run(installer.run())
    assert ha.calls[-1][0] == "lovelace/resources/update"
    assert ha.calls[-1][1]["resource_id"] == "abc"


def test_resource_untouched_when_current(tmp_path):
    (tmp_path / "homeassistant").mkdir()
    ha = FakeWs([{"id": "abc", "url": f"{RESOURCE_PATH}?v=2.0.0", "type": "module"}])
    installer = CardInstaller(ha, make_source(tmp_path), tmp_path / "homeassistant/www/taskmanager", "2.0.0")
    asyncio.run(installer.run())
    assert [call[0] for call in ha.calls] == ["lovelace/resources"]


def test_yaml_mode_gives_manual_instructions(tmp_path):
    (tmp_path / "homeassistant").mkdir()
    installer = CardInstaller(FakeWs([], fail=True), make_source(tmp_path),
                              tmp_path / "homeassistant/www/taskmanager", "2.0.0")
    asyncio.run(installer.run())
    assert installer.status["resource"] == "manual" and "Ressources" in installer.status["message"]


def test_config_folder_not_mounted(tmp_path):
    ha = FakeWs([])
    installer = CardInstaller(ha, make_source(tmp_path), tmp_path / "absent/www/taskmanager", "2.0.0")
    asyncio.run(installer.run())
    assert installer.status["resource"] == "error" and ha.calls == []
