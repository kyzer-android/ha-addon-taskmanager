"""Rôles d'accès : administrateur / aidant (interface complète) ou tablette (lecture seule du fil)."""

from __future__ import annotations

import logging
from typing import Any

_LOGGER = logging.getLogger(__name__)

FULL = "admin"
CAREGIVER = "aidant"
TABLET = "tablette"

# Ce qu'un compte « tablette » peut lire (GET) : son fil, ses images et son rôle. Rien d'autre.
TABLET_API = {"/api/me", "/api/tablet"}
TABLET_API_PREFIXES = ("/api/image/",)


def is_full(role: str) -> bool:
    return role in (FULL, CAREGIVER)


def tablet_may(method: str, path: str) -> bool:
    if method not in ("GET", "HEAD"):
        return False
    if not path.startswith("/api/"):
        return True  # fichiers de l'interface
    return path in TABLET_API or path.startswith(TABLET_API_PREFIXES)


async def resolve_role(engine: Any, user_id: str) -> str:
    """Rôle du compte HA connecté (identifié par l'en-tête d'Ingress)."""
    users = engine.config.get("users", [])
    if not users:
        return FULL  # démarrage : personne n'est encore déclaré
    if not user_id:
        _LOGGER.warning("Ingress n'a pas transmis le compte connecté : accès complet accordé")
        return FULL
    ha_users = await engine.ha.users() if hasattr(engine.ha, "users") else None
    if ha_users and any(item["id"] == user_id and item["is_admin"] for item in ha_users):
        return FULL
    listed = next((user for user in users if user.get("ha_user_id") == user_id), None)
    if listed:
        return CAREGIVER if listed.get("role") == "aidant" else TABLET
    if ha_users is None:
        _LOGGER.warning("Comptes HA indisponibles : compte non déclaré %s traité comme administrateur", user_id)
        return FULL
    return TABLET
