# Prompt de reprise : add-on « Gestionnaire de tâches journalières »

Copie le texte ci-dessous dans une nouvelle conversation avec Claude pour continuer le travail.

---

Je reprends le projet d'add-on Home Assistant « Gestionnaire de tâches journalières ». Dépôt : https://github.com/kyzer-android/ha-addon-taskmanager (branche `main`). Lis d'abord `README.md`, `docs/cahier-des-charges.md` et `taskmanager/DOCS.md`.

## Règles de travail (non négociables)
- **Ne jamais coder sans mon accord explicite.** On discute et on cadre d'abord ; j'écris « OK vas-y » ou « fais la solution » pour autoriser le code.
- Tu me tutoies (sans être trop familier), avec des emojis pour clarifier, des réponses concises, orientées solutions, et tu expliques les « pourquoi » techniques.
- Réponses structurées : résumé visuel (✅ ❌ 🎯), sections claires, étapes numérotées pour les procédures.
- Code propre et commenté. CSS : toutes les couleurs, tailles et espacements en variables dans `:root`. JavaScript : `const`/`let` (jamais `var`), fonctions fléchées, camelCase. HTML : classes sémantiques, `<th>` dans `<thead>`.
- Sois honnête sur les limites : dis clairement ce qui n'a pas été testé sur une vraie installation.

## Le projet
Une personne atteinte d'une maladie neurodégénérative vit seule. Des tablettes murales (Honor Pad X8, Fully Kiosk) affichent des rappels vidéo/audio, posent des questions OUI/NON, répètent, puis appellent un aidant en vidéo SIP si personne ne répond. Des aidants (moi et ma compagne) créent les tâches depuis téléphone ou PC.

Environnement : Home Assistant OS sur Raspberry Pi 5 (« HA2 »), Browser Mod, Fully Kiosk Plus, Asterisk (add-on TECH7Fox) + SIP Core + `custom:sip-call-card`, vidéos dans `/media/video_papa/`. Tablette salon = extension 102, chambre = 101 ; le nombre de tablettes et d'aidants varie, donc tout est en paramètres.

## Décisions de conception
- **Tout est dans l'add-on** : aucun script ni automatisation créé dans HA. Les scripts « Lire vidéo » et l'automatisation d'appel d'origine sont intégrés au moteur et n'ont plus lieu d'exister.
- **Pièce ciblée** : la pièce détectée le plus récemment (une seule personne dans la maison) ; sans détection : toutes les tablettes (hors tablette en appel). Pour un appel : pièce détectée, sinon tablette par défaut. Les capteurs de présence (radar, onMotion Fully MQTT) sont de simples entités ; leur création est hors périmètre.
- **Écran** : normalement toujours allumé ; on ne l'allume que s'il est éteint.
- **Vidéo** : popup plein écran (tag `video`), pas de bouton pause, pas de limite de durée, fermeture à la fin de lecture. Lecture non démarrée après 10 s : fermeture + journal.
- **Question** : affichée pendant la lecture (popup tag `question`), 1 minute par défaut (réglable). Réponse : ferme la question partout, arrête la vidéo des autres tablettes. Sans réponse : répétitions, puis escalade (optionnelle, aidants choisis par tâche), puis sous-tâches « aucune réponse ». Un « non » veut dire que tout va bien.
- **Sous-tâches** : branches sur OUI / NON / aucune réponse / condition capteur (rejouer toutes les N minutes tant que le capteur a l'état voulu).
- **Audio seul** : aucun popup, le son joue en arrière-plan.
- **Calendrier Google** : les événements sont proposés dans l'écran de création ; je choisis ceux qui apparaissent dans le fil.
- **Vue tablette** : l'add-on publie `sensor.taskmanager_fil_du_jour` (attribut `days`), affiché par une carte Markdown (`docs/dashboard-tablette.md`), pas d'iframe (HA en HTTPS).
- **Réponse IA (V2)** : même structure que les boutons (`valeur`, `source`, `texte brut`) ; point d'entrée `POST /api/answer` déjà prêt.

## État du code (v0.2.0)
Backend Python/aiohttp dans `taskmanager/app/taskmanager/` (`engine.py` = cœur), interface sans build dans `taskmanager/app/web/`, tests dans `tests/` (`python -m pytest -q tests`, tous verts, faux HA). Jamais testé sur un vrai HA.

## À valider / à faire ensuite
1. Installer l'add-on sur HA2 et valider : masquage des contrôles natifs de la vidéo dans le popup Browser Mod (réglage « Style du popup vidéo »), lancement d'un appel via `/lovelace/0?call={extension}` (réglage « Modèle d'URL »), boutons OUI/NON via `logbook.log`, cohabitation des popups `video` et `question`.
2. Corriger ce qui diffère de la réalité (ajuster le moteur, pas seulement les réglages).
3. Ajouter si besoin : icône et logo de l'add-on, traductions, vue tablette plus riche, branchement de l'IA vocale sur `POST /api/answer`.
4. Mettre à jour `README.md`, `DOCS.md`, `CHANGELOG.md` et la version dans `taskmanager/config.yaml` à chaque évolution.

Commence par me dire ce que tu as lu et ce qui te paraît le plus risqué, puis propose un plan. Ne code rien avant mon accord.
