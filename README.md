# ha-addon-taskmanager

Add-on Home Assistant « **Gestionnaire de tâches journalières** » : rappels vidéo ou audio sur des tablettes murales, questions OUI/NON avec répétitions, et appel vidéo SIP d'escalade vers les aidants quand personne ne répond.

Conçu pour accompagner une personne atteinte d'une maladie neurodégénérative, avec des aidants qui créent les tâches depuis un téléphone ou un PC.

## Installer l'add-on

1. Dans Home Assistant : **Paramètres → Modules complémentaires → Boutique des modules complémentaires**.
2. Menu **⋮ → Dépôts**, puis ajoute : `https://github.com/kyzer-android/ha-addon-taskmanager`.
3. Installe **Gestionnaire de tâches**, démarre-le, puis ouvre **Tâches** dans la barre latérale.

Détails d'utilisation : [`taskmanager/DOCS.md`](taskmanager/DOCS.md).

## État du projet

Version **0.2.1** : première implémentation complète du [cahier des charges](docs/cahier-des-charges.md).

| Fonction | État |
|---|---|
| Pièces, tablettes et aidants en paramètres (aucun nom en dur) | ✅ |
| Tâches journalières ou uniques, archive, visibilité 👁️ | ✅ |
| Vidéo, audio, question OUI/NON, répétitions, sous-tâches (OUI, NON, sans réponse, capteur) | ✅ |
| Choix de la pièce (présence la plus récente, sinon toutes les tablettes) | ✅ |
| Écran allumé seulement s'il est éteint | ✅ |
| Appels entrants (ferme la vidéo, Call Card plein écran) et appel d'escalade | ✅ (à valider sur la vraie installation) |
| Interface de gestion (Ingress) avec créateur à tuiles | ✅ |
| Fil du jour pour la tablette (`sensor.taskmanager_fil_du_jour`) | ✅ voir [`docs/dashboard-tablette.md`](docs/dashboard-tablette.md) |
| Réponse vocale par IA | ⏳ V2 (point d'entrée `POST /api/answer` déjà prêt) |

**Pas encore testé sur un vrai Home Assistant** : la logique est couverte par des tests automatiques avec un faux HA, mais les détails Browser Mod / SIP Core restent à valider (voir « Points à valider »).

## Points à valider sur une vraie installation

1. **Masquage des contrôles vidéo** : le CSS par défaut (réglable dans Configuration) cache les contrôles natifs ; son effet dans le popup de Browser Mod est à vérifier.
2. **Lancement d'un appel** : l'add-on ouvre `/lovelace/0?call=<extension>` sur la tablette (auto-appel de SIP Core par URL). Le chemin est réglable.
3. **Boutons OUI/NON** : ils appellent `logbook.log`, que l'add-on écoute. Le message est visible dans le journal de HA.
4. **Popup question** : ouvert avec le tag `question`, en plus du popup vidéo (tag `video`).

## Structure du dépôt

```
repository.yaml              dépôt d'add-ons HA
docs/                        cahier des charges, vue tablette
taskmanager/                 l'add-on
  config.yaml  Dockerfile  run.sh  DOCS.md  CHANGELOG.md
  app/taskmanager/           backend Python (aiohttp)
    engine.py                planification, lecture, questions, appels, escalade
    schedule.py rooms.py     échéances, fil du jour, choix de la pièce
    ha_client.py             REST + WebSocket de HA (via le Supervisor)
    storage.py models.py     JSON dans /config/taskmanager/, validation
    api.py                   API HTTP + fichiers statiques (Ingress)
  app/web/                   interface (HTML/CSS/JS sans build)
tests/                       tests pytest avec un faux Home Assistant
PROMPT_CONTINUATION.md       prompt pour reprendre le travail dans une autre conversation
```

## Développement

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q tests
```

Les tests couvrent le choix des pièces, les échéances, le moteur (vidéo, audio, questions, répétitions, escalade, appels entrants, sous-tâches capteur), l'API et le client HA.

## Règle de travail

Aucun code n'est écrit sans l'accord explicite de Mathieu (voir `PROMPT_CONTINUATION.md`).
