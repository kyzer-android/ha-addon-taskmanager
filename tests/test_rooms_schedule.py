from datetime import date, datetime
from zoneinfo import ZoneInfo

from conftest import make_config
from taskmanager import models, schedule
from taskmanager.rooms import choose_rooms


def states(**kw):
    base = {
        "binary_sensor.presence_salon": {"state": "off"},
        "binary_sensor.presence_chambre": {"state": "off"},
        "sensor.pjsip_102_102_state": {"state": "Not in use"},
        "sensor.pjsip_101_101_state": {"state": "Not in use"},
    }
    base.update(kw)
    return base


def ids(rooms):
    return [r["id"] for r in rooms]


def test_media_most_recent_detection_wins():
    s = states(**{
        "binary_sensor.presence_salon": {"state": "on", "last_changed": "2026-10-07T10:00:00+00:00"},
        "binary_sensor.presence_chambre": {"state": "on", "last_changed": "2026-10-07T10:05:00+00:00"},
    })
    assert ids(choose_rooms(make_config(), s, "media")) == ["chambre"]


def test_media_no_detection_means_all_tablets():
    assert ids(choose_rooms(make_config(), states(), "media")) == ["salon", "chambre"]


def test_media_excludes_tablet_in_call():
    s = states(**{"sensor.pjsip_102_102_state": {"state": "Busy"}})
    assert ids(choose_rooms(make_config(), s, "media")) == ["chambre"]


def test_call_without_detection_uses_default_room():
    assert ids(choose_rooms(make_config(), states(), "call")) == ["salon"]


def test_call_with_detection_uses_that_room():
    s = states(**{"binary_sensor.presence_chambre": {"state": "on", "last_changed": "2026-10-07T10:00:00+00:00"}})
    assert ids(choose_rooms(make_config(), s, "call")) == ["chambre"]


def test_room_without_presence_sensor_still_gets_media():
    cfg = make_config()
    cfg["rooms"][1]["presence_sensor"] = ""
    assert ids(choose_rooms(cfg, states(), "media")) == ["salon", "chambre"]


def test_is_due_daily_and_grace():
    tz = ZoneInfo("Europe/Paris")
    task = models.clean_task({"title": "t", "schedule": {"type": "daily", "days": [2], "time": "08:00"},
                              "root": {"media": {"kind": "video", "content_id": "x"}}})
    wednesday = datetime(2026, 10, 7, 8, 2, tzinfo=tz)
    assert schedule.is_due(task, wednesday, 5)
    assert not schedule.is_due(task, datetime(2026, 10, 7, 7, 59, tzinfo=tz), 5)
    assert not schedule.is_due(task, datetime(2026, 10, 7, 8, 10, tzinfo=tz), 5)
    assert not schedule.is_due(task, datetime(2026, 10, 8, 8, 1, tzinfo=tz), 5)
    task["last_run_date"] = "2026-10-07"
    assert not schedule.is_due(task, wednesday, 5)


def test_once_and_missed():
    task = models.clean_task({"title": "t", "schedule": {"type": "once", "date": "2026-10-07", "time": "09:00"},
                              "root": {}})
    assert schedule.occurs_on(task, date(2026, 10, 7))
    assert not schedule.occurs_on(task, date(2026, 10, 8))
    assert schedule.is_missed_once(task, date(2026, 10, 8))
    assert not schedule.is_missed_once(task, date(2026, 10, 7))


def test_board_hides_invisible_and_adds_events():
    visible = models.clean_task({"title": "Lever", "schedule": {"type": "daily", "days": [2], "time": "08:00"}, "root": {}})
    hidden = models.clean_task({"title": "Secret", "visible": False,
                                "schedule": {"type": "daily", "days": [2], "time": "09:00"}, "root": {}})
    events = [{"key": "k", "summary": "Médecin", "start": "2026-10-07T10:30:00+02:00"}]
    board = schedule.build_board([visible, hidden], events, date(2026, 10, 7), 2)
    titles = [i["title"] for i in board[0]["items"]]
    assert titles == ["Lever", "Médecin"]
    assert board[0]["label"] == "mercredi 7 octobre"
    assert board[1]["items"] == []


def test_all_day_event_spans_every_day_and_is_listed_first():
    events = [{"key": "k", "summary": "Vacances", "start": "2026-10-07", "end": "2026-10-10"},
              {"key": "m", "summary": "Médecin", "start": "2026-10-08T10:30:00+02:00", "end": "2026-10-08T11:00:00+02:00"}]
    board = schedule.build_board([], events, date(2026, 10, 7), 4)
    titles = [[item["title"] for item in day["items"]] for day in board]
    assert titles == [["Vacances"], ["Vacances", "Médecin"], ["Vacances"], []]
    assert board[1]["items"][0]["time"] == schedule.ALL_DAY_LABEL


def test_old_media_source_ids_are_migrated():
    """Régression : `media-source://media/…` n'est pas résolu par HA (500). Il faut `media_source/local`."""
    from taskmanager import models
    node = models.clean_node({"media": {"kind": "video", "content_id": "media-source://media/taskmanager/a b.mp4"}})
    assert node["media"]["content_id"] == "media-source://media_source/local/taskmanager/a b.mp4"
    again = models.clean_node(node)
    assert again["media"]["content_id"] == node["media"]["content_id"]
