"""Point d'entrée de l'add-on : python3 -m taskmanager."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

import aiohttp
from aiohttp import web

from .api import build_app
from .card import CardInstaller
from .engine import Engine
from .ha_client import HaClient
from .storage import Storage

PORT = 8099


async def main() -> None:
    logging.basicConfig(
        level=getattr(logging, os.environ.get("TM_LOG_LEVEL", "info").upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    data_dir = os.environ.get("TM_DATA_DIR", "/config/taskmanager")
    media_dir = os.environ.get("TM_MEDIA_DIR", "/media")
    token = os.environ.get("SUPERVISOR_TOKEN", "")
    base_url = os.environ.get("TM_HA_URL", "http://supervisor/core")
    web_dir = Path(__file__).resolve().parent.parent / "web"
    card_source = Path(__file__).resolve().parent.parent / "card" / "taskmanager-card.js"
    www_dir = Path(os.environ.get("TM_WWW_DIR", "/homeassistant/www/taskmanager"))

    async with aiohttp.ClientSession() as session:
        storage = Storage(data_dir)
        ha = HaClient(session, token, base_url)
        engine = Engine(storage, ha, media_dir)
        ha.start()
        await engine.start()
        card = CardInstaller(ha, card_source, www_dir)
        card_task = asyncio.create_task(card.run(), name="card-install")
        runner = web.AppRunner(build_app(engine, web_dir, card.status))
        await runner.setup()
        await web.TCPSite(runner, "0.0.0.0", PORT).start()
        logging.getLogger(__name__).info("Interface disponible sur le port %s", PORT)
        try:
            await asyncio.Event().wait()
        finally:
            card_task.cancel()
            await engine.stop()
            await ha.stop()
            await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
