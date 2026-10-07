"""Installation de la carte « Fil du jour » dans Home Assistant.

Le fichier JS est copié dans <config HA>/www/taskmanager/ (servi sous /local/taskmanager/)
puis déclaré comme ressource Lovelace, sans aucune action manuelle.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from . import __version__

_LOGGER = logging.getLogger(__name__)

CARD_FILE = "taskmanager-card.js"
RESOURCE_PATH = f"/local/taskmanager/{CARD_FILE}"
CARD_YAML = (
    "type: custom:taskmanager-card\n"
    "entity: sensor.taskmanager_fil_du_jour\n"
    "show_header: true\n"
    "min_day_width: 360\n"
    "font_scale: 1\n"
)


class CardInstaller:
    def __init__(self, ha: Any, source: Path, www_dir: Path, version: str = __version__) -> None:
        self.ha = ha
        self.source = Path(source)
        self.www_dir = Path(www_dir)
        self.version = version
        self.status: dict[str, Any] = {
            "file": False, "resource": "pending", "url": RESOURCE_PATH,
            "message": "Installation en attente", "yaml": CARD_YAML,
        }

    @property
    def target(self) -> Path:
        return self.www_dir / CARD_FILE

    def install_file(self) -> bool:
        # Le dossier de configuration de HA doit être monté dans l'add-on (map homeassistant_config).
        mount = self.www_dir.parent.parent
        if not mount.is_dir():
            self.status.update(file=False, resource="error",
                               message=f"Le dossier de configuration de Home Assistant n'est pas accessible ({mount}).")
            _LOGGER.warning("Carte non installée : %s absent (accès à la configuration HA non accordé)", mount)
            return False
        try:
            content = self.source.read_text(encoding="utf-8").replace("__VERSION__", self.version)
            self.www_dir.mkdir(parents=True, exist_ok=True)
            if not self.target.exists() or self.target.read_text(encoding="utf-8") != content:
                self.target.write_text(content, encoding="utf-8")
            self.status["file"] = True
            return True
        except OSError as err:
            self.status.update(file=False, resource="error",
                               message=f"Copie impossible dans le dossier www de Home Assistant : {err}")
            _LOGGER.warning("Carte non installée : %s", err)
            return False

    async def register_resource(self) -> None:
        url = f"{RESOURCE_PATH}?v={self.version}"
        try:
            resources = await self.ha.ws_call("lovelace/resources")
            existing = next((item for item in resources if item.get("url", "").split("?")[0] == RESOURCE_PATH), None)
            if existing is None:
                await self.ha.ws_call("lovelace/resources/create", res_type="module", url=url)
            elif existing.get("url") != url:
                await self.ha.ws_call("lovelace/resources/update", resource_id=existing["id"],
                                      res_type="module", url=url)
            self.status.update(resource="ok", message="Carte installée et déclarée dans Home Assistant")
            _LOGGER.info("Carte taskmanager-card installée (%s)", url)
        except Exception as err:  # noqa: BLE001 - dashboards en YAML, droits… : on explique quoi faire
            self.status.update(
                resource="manual",
                message=("Ajoute la ressource à la main : Paramètres → Tableaux de bord → Ressources → "
                         f"{url} (type : module JavaScript). Détail : {err}"))
            _LOGGER.warning("Ressource Lovelace non déclarée automatiquement : %s", err)

    async def run(self) -> None:
        await self.ha.connected.wait()
        if self.install_file():
            await self.register_resource()
