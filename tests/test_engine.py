import asyncio

from taskmanager import models


def node(**kw):
    base = models.new_node("n")
    base.update(kw)
    return models.clean_node(base)


VIDEO = {"kind": "video", "content_id": "media-source://media_source/local/video_papa/lever.mp4", "label": "lever"}
AUDIO = {"kind": "audio", "content_id": "media-source://media_source/local/video_papa/musique.mp3", "label": "m"}


def run(coro):
    return asyncio.run(coro)


def test_video_only_plays_then_closes_popup(engine, ha):
    async def scenario():
        await engine.run_node(node(media=VIDEO))
    run(scenario())
    plays = ha.services("media_player", "play_media")
    assert len(plays) == 2  # aucune détection : toutes les tablettes
    popup = plays[0]["extra"]["popup"]
    assert popup["tag"] == "video" and popup["dismissable"] is False
    assert plays[0]["media"]["media_content_type"] == "video/mp4"
    closed = {(c["browser_id"][0], c["tag"]) for c in ha.services("browser_mod", "close_popup")}
    assert closed == {("tablette-salon", "video"), ("tablette-chambre", "video")}
    assert ha.services("homeassistant", "turn_on") == []  # écrans déjà allumés


def test_screen_turned_on_only_when_off(engine, ha):
    ha.set("switch.salon_ecran", "off")
    run(engine.run_node(node(media=VIDEO)))
    turned = ha.services("homeassistant", "turn_on")
    assert [t["entity_id"] for t in turned] == ["switch.salon_ecran"]


def test_audio_has_no_popup(engine, ha):
    run(engine.run_node(node(media=AUDIO)))
    play = ha.services("media_player", "play_media")[0]
    assert "extra" not in play and play["media"]["media_content_type"] == "audio/mpeg"
    assert ha.services("browser_mod", "close_popup") == []


def test_presence_targets_only_most_recent_room(engine, ha):
    ha.set("binary_sensor.presence_chambre", "on", last_changed="2026-10-07T10:00:00+00:00")
    run(engine.run_node(node(media=VIDEO)))
    assert [p["entity_id"] for p in ha.services("media_player", "play_media")] == ["media_player.chambre"]


def test_tablet_in_call_is_excluded(engine, ha):
    ha.set("sensor.pjsip_102_102_state", "Busy")
    run(engine.run_node(node(media=VIDEO)))
    assert [p["entity_id"] for p in ha.services("media_player", "play_media")] == ["media_player.chambre"]


def test_playback_that_never_starts_is_closed(engine, ha):
    engine.settings["start_timeout_seconds"] = 1

    original = ha.call_service

    async def silent(domain, service, data):
        if (domain, service) == ("media_player", "play_media"):
            ha.calls.append((domain, service, data))
            return
        await original(domain, service, data)

    ha.call_service = silent
    run(engine.run_node(node(media=VIDEO)))
    assert any(c["tag"] == "video" for c in ha.services("browser_mod", "close_popup"))
    assert any("n'a pas démarré" in e["message"] for e in engine.storage.journal)


def test_question_yes_runs_yes_branch_and_closes_other_tablet(engine, ha):
    ha.play_seconds = 0.6
    yes_child = {"trigger": "yes", "node": node(media=AUDIO)}
    no_child = {"trigger": "no", "node": node(media={"kind": "video", "content_id": "media-source://media_source/local/x.mp4"})}
    task_node = node(media=VIDEO, question={"text": "Ça va ?", "repeats": 0, "delay_minutes": 0},
                     children=[yes_child, no_child])

    async def scenario():
        job = asyncio.create_task(engine.run_node(task_node))
        for _ in range(100):
            await asyncio.sleep(0.01)
            if engine.questions:
                break
        rid = next(iter(engine.questions))
        assert engine.submit_answer(rid, "oui", room_id="salon")
        return await job

    outcome = run(scenario())
    assert outcome == "yes"
    popups = ha.services("browser_mod", "popup")
    assert {p["tag"] for p in popups} == {"question"}
    card = popups[0]["content"]  # vidéo + question : boutons moyens seuls, sous la vidéo
    assert card["type"] == "horizontal-stack"
    assert card["cards"][0]["tap_action"]["perform_action"] == "logbook.log"
    # répondre pendant la vidéo l'arrête sur toutes les tablettes
    stopped = [c["entity_id"] for c in ha.services("media_player", "media_stop")]
    assert "media_player.chambre" in stopped and "media_player.salon" in stopped
    # la branche OUI (audio) a bien été jouée, pas la branche NON (vidéo)
    types = [p["media"]["media_content_type"] for p in ha.services("media_player", "play_media")]
    assert "audio/mpeg" in types and types.count("video/mp4") == 2


def test_answer_through_logbook_event(engine, ha):
    async def scenario():
        job = asyncio.create_task(engine.run_node(node(question={"text": "?", "repeats": 0, "delay_minutes": 0})))
        for _ in range(100):
            await asyncio.sleep(0.01)
            if engine.questions:
                break
        rid = next(iter(engine.questions))
        await engine.on_event("logbook_entry", {"name": "taskmanager", "message": f"answer|{rid}|salon|non"})
        return await job

    assert run(scenario()) == "no"


def test_indeterminate_answer_is_ignored(engine):
    assert engine.submit_answer("inconnu", "peut-être") is False


def test_no_answer_repeats_then_escalates(engine, ha):
    ha.play_seconds = 0.01
    engine.settings["question_seconds"] = 0.05
    task_node = node(media=VIDEO, question={"text": "Ça va ?", "repeats": 1, "delay_minutes": 0},
                     escalation={"enabled": True, "caregiver_ids": ["c1", "c2"]},
                     children=[{"trigger": "no_answer", "node": node(media=AUDIO)}])
    outcome = run(engine.run_node(task_node))
    assert outcome == "no_answer"
    assert len(ha.services("browser_mod", "popup")) == 8  # 2 essais x 2 tablettes x (boutons sous la vidéo, puis question entière)
    calls = [c["path"] for c in ha.services("browser_mod", "navigate")]
    assert calls and "call=100" in calls[0]
    types = [p["media"]["media_content_type"] for p in ha.services("media_player", "play_media")]
    assert "audio/mpeg" in types  # branche « aucune réponse »


def test_escalation_goes_to_next_caregiver_when_unanswered(engine, ha):
    engine.settings["call_unanswered_seconds"] = 10  # un appel de 0,05 s = sans réponse
    run(engine._escalate({"enabled": True, "caregiver_ids": ["c1", "c2"]}))
    paths = [c["path"] for c in ha.services("browser_mod", "navigate")]
    assert paths == ["/lovelace/0?call=100", "/lovelace/0?call=103"]


def test_incoming_call_closes_video_and_opens_call_card(engine, ha):
    async def scenario():
        await engine.on_event("state_changed", {
            "entity_id": "sensor.pjsip_102_102_state",
            "old_state": {"state": "Not in use"}, "new_state": {"state": "Busy"}})
    run(scenario())
    closed = [(c["browser_id"][0], c["tag"]) for c in ha.services("browser_mod", "close_popup")]
    assert ("tablette-salon", "video") in closed
    assert ha.services("media_player", "media_stop")[0]["entity_id"] == "media_player.salon"
    popup = [p for p in ha.services("browser_mod", "popup") if p["tag"] == "appel"][0]
    assert popup["content"]["type"] == "custom:sip-call-card"
    assert popup["content"]["extensions"]["103"] == {"name": "Shirley"}

    run(engine.on_event("state_changed", {
        "entity_id": "sensor.pjsip_102_102_state",
        "old_state": {"state": "Busy"}, "new_state": {"state": "Not in use"}}))
    assert ("tablette-salon", "appel") in [(c["browser_id"][0], c["tag"]) for c in ha.services("browser_mod", "close_popup")]


def test_sensor_child_loops_while_condition_holds(engine, ha):
    ha.set("binary_sensor.lit", "on")
    child = {"trigger": "sensor", "sensor": {"entity_id": "binary_sensor.lit", "state": "on", "repeat_minutes": 0.1},
             "node": node(media=AUDIO)}
    runs = []

    async def sleeper(seconds):
        if seconds >= 1:  # seules les pauses entre répétitions comptent (pas les attentes de 0,5 s)
            runs.append(1)
            if len(runs) == 2:
                ha.set("binary_sensor.lit", "off")
        await asyncio.sleep(0)

    engine.sleep = sleeper
    run(engine.run_node(node(children=[child])))
    plays = ha.services("media_player", "play_media")
    assert len(plays) == 4  # 2 passages x 2 tablettes, puis le capteur repasse à « off »


def test_tick_launches_due_task_once_and_removes_once_tasks(engine, ha):
    task = models.clean_task({
        "title": "Uniquement", "schedule": {"type": "once", "date": engine.now().date().isoformat(),
                                            "time": "00:00"},
        "root": {"media": AUDIO}})
    engine.storage.tasks.append(task)
    engine.settings["grace_minutes"] = 24 * 60

    async def scenario():
        first = await engine.tick()
        await asyncio.gather(*engine.runs.values())
        second = await engine.tick()
        return first, second

    first, second = run(scenario())
    assert first == [task["id"]] and second == []
    assert task not in engine.storage.tasks  # tâche unique terminée : supprimée


def test_publish_board_sets_sensor(engine, ha):
    run(engine.publish_board())
    entity, state, attrs = ha.published[-1]
    assert entity == "sensor.taskmanager_fil_du_jour" and "days" in attrs


def test_video_plus_question_layout_then_full_question(engine, ha):
    """Vidéo 80 % en haut + boutons moyens seuls ; à la fin de la vidéo, question entière et centrée."""
    ha.play_seconds = 0.3
    engine.settings["question_seconds"] = 0.2
    task_node = node(media=VIDEO, question={"text": "Ça va ?", "repeats": 0, "delay_minutes": 0})
    run(engine.run_node(task_node))
    video = ha.services("media_player", "play_media")[0]["extra"]["popup"]
    assert "80vh" in video["popup_styles"][0]["styles"]
    popups = [p for p in ha.services("browser_mod", "popup") if p["browser_id"] == ["tablette-salon"]]
    compact, full = popups[0], popups[1]
    assert compact["content"]["type"] == "horizontal-stack" and "timeout" not in compact
    assert "height: 90px" in compact["content"]["cards"][0]["card_mod"]["style"]
    assert "20vh" in compact["popup_styles"][0]["styles"]
    assert full["content"]["type"] == "vertical-stack" and full["timeout"] == 200
    assert "height: 160px" in full["content"]["cards"][1]["cards"][0]["card_mod"]["style"]
    assert "center" in full["popup_styles"][0]["styles"]


def test_question_alone_is_centered_and_huge(engine, ha):
    engine.settings["question_seconds"] = 0.05
    run(engine.run_node(node(question={"text": "Ça va ?", "repeats": 0, "delay_minutes": 0})))
    popup = ha.services("browser_mod", "popup")[0]
    assert popup["content"]["type"] == "vertical-stack"
    assert "center" in popup["popup_styles"][0]["styles"]


def test_answer_during_video_stops_video_everywhere(engine, ha):
    ha.play_seconds = 5
    task_node = node(media=VIDEO, question={"text": "Ça va ?", "repeats": 0, "delay_minutes": 0})

    async def scenario():
        job = asyncio.create_task(engine.run_node(task_node))
        for _ in range(100):
            await asyncio.sleep(0.01)
            if engine.questions:
                break
        rid = next(iter(engine.questions))
        engine.submit_answer(rid, "oui", room_id="salon")
        return await asyncio.wait_for(job, 3)

    assert run(scenario()) == "yes"
    stopped = {c["entity_id"] for c in ha.services("media_player", "media_stop")}
    assert "media_player.salon" in stopped


def test_call_popup_opens_from_derived_sensor(engine, ha):
    room = engine.config["rooms"][0]
    assert room["extension"] == "102"
    room["call_sensor"] = ""  # déduit de l'extension SIP
    run(engine.on_event("state_changed", {
        "entity_id": "sensor.pjsip_102_102_state",
        "old_state": {"state": "Not in use"}, "new_state": {"state": "Busy"}}))
    assert [p for p in ha.services("browser_mod", "popup") if p["tag"] == "appel"]
