"""Stockage JSON (config, tâches, journal) avec écriture atomique."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from . import models

_LOGGER = logging.getLogger(__name__)
MAX_LOG_ENTRIES = 500


class Storage:
    def __init__(self, data_dir: str | Path) -> None:
        self.dir = Path(data_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.config: dict[str, Any] = models.merge_config(self._read("config.json", {}))
        self.tasks: list[dict[str, Any]] = [
            models.clean_task(t) for t in self._read("tasks.json", [])
        ]
        self.journal: list[dict[str, Any]] = self._read("journal.json", [])
        self._lock = asyncio.Lock()

    # ---- lecture / écriture -------------------------------------------------
    def _read(self, name: str, default: Any) -> Any:
        path = self.dir / name
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _LOGGER.exception("Fichier illisible : %s (valeur par défaut utilisée)", path)
            return default

    def _write(self, name: str, data: Any) -> None:
        path = self.dir / name
        fd, tmp = tempfile.mkstemp(dir=self.dir, prefix=name, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
        except OSError:
            _LOGGER.exception("Écriture impossible : %s", path)
            try:
                os.unlink(tmp)
            except OSError:
                pass

    def save_config(self) -> None:
        self._write("config.json", self.config)

    def save_tasks(self) -> None:
        self._write("tasks.json", self.tasks)

    def save_journal(self) -> None:
        self._write("journal.json", self.journal)

    # ---- tâches ---------------------------------------------------------------
    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return next((t for t in self.tasks if t["id"] == task_id), None)

    def upsert_task(self, task: dict[str, Any]) -> dict[str, Any]:
        cleaned = models.clean_task(task)
        existing = self.get_task(cleaned["id"])
        if existing:
            cleaned["last_run_date"] = existing.get("last_run_date", "")
            cleaned["last_status"] = existing.get("last_status", "")
            self.tasks[self.tasks.index(existing)] = cleaned
        else:
            self.tasks.append(cleaned)
        self.save_tasks()
        return cleaned

    def delete_task(self, task_id: str) -> bool:
        task = self.get_task(task_id)
        if not task:
            return False
        self.tasks.remove(task)
        self.save_tasks()
        return True

    # ---- config ---------------------------------------------------------------
    def set_config(self, raw: dict[str, Any]) -> dict[str, Any]:
        self.config = models.merge_config(raw)
        for room in self.config["rooms"]:
            room.setdefault("id", models.new_id("r"))
        for person in self.config["caregivers"]:
            person.setdefault("id", models.new_id("c"))
        for item in self.config["catalog"]:
            item.setdefault("id", models.new_id("e"))
        self.save_config()
        return self.config

    # ---- journal --------------------------------------------------------------
    def log(self, level: str, message: str, **extra: Any) -> None:
        entry = {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "level": level, "message": message}
        entry.update(extra)
        self.journal.append(entry)
        del self.journal[:-MAX_LOG_ENTRIES]
        getattr(_LOGGER, "warning" if level == "warning" else "info")("%s", message)
        self.save_journal()
