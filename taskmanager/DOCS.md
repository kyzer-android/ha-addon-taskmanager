# Gestionnaire de tâches journalières

Rappels vidéo ou audio sur les tablettes murales, questions OUI/NON avec répétitions, et appel vidéo d'escalade vers les aidants quand personne ne répond.

## Prérequis dans Home Assistant

- **Browser Mod** (popups plein écran sur les tablettes), avec un **Browser ID** par tablette.
- Un `media_player` Browser Mod par tablette (celui que lit déjà ton script « Lire vidéo »).
- Pour les appels : **SIP Core** + `custom:sip-call-card`, et le capteur d'état de l'extension de chaque tablette (`sensor.pjsip_..._state`).
- Les vidéos et audios dans le dossier `media` de HA (ex. `/media/video_papa/`).
- Facultatif : un capteur de présence par pièce (radar, détection de mouvement Fully…).

## Utilisation

1. Ouvre **Tâches** dans la barre latérale de HA.
2. Onglet **Configuration** : déclare les pièces (nom, extension SIP, lecteur, écran, capteur d'appel, Browser ID, capteur de présence), les aidants (nom + extension) et le catalogue d'entités.
3. Onglet **Créateur** : glisse les tuiles (Tâche, Question, Audio, Vidéo, Sous-tâche) ou touche-les sur téléphone, règle les jours et l'heure, puis crée la tâche.
4. Onglet **Fil de la journée** : retrouve les tâches, masque-les (👁️), lance-les à la main pour tester.

## Règles de fonctionnement

- **Pièce ciblée** : la pièce détectée le plus récemment ; sans détection, toutes les tablettes (hors tablette en appel). Pour un appel d'escalade : la pièce détectée, sinon la tablette par défaut.
- **Écran** : normalement toujours allumé ; l'add-on ne l'allume que s'il est éteint.
- **Vidéo** : popup plein écran sans bouton de fermeture, fermé à la fin de la lecture (aucune limite de durée). Une lecture qui ne démarre pas est fermée et notée au journal.
- **Question** : affichée pendant la lecture, 1 minute par défaut (réglable). Une réponse ferme la question partout et arrête la vidéo des autres tablettes.
- **Sans réponse** : répétitions (nombre et délai par tâche), puis escalade si elle est activée, puis sous-tâches « aucune réponse ».
- **Appel entrant** : la vidéo et la question sont fermées, l'écran est allumé si besoin, la Call Card s'ouvre en plein écran puis se ferme à la fin de l'appel.
- **Aucun script ni automatisation n'est créé dans HA.**

## Fil du jour pour la tablette

Voir `docs/dashboard-tablette.md` dans le dépôt : l'add-on publie `sensor.taskmanager_fil_du_jour`, à afficher avec une carte Markdown.

## Points à valider sur une vraie installation

- Masquage des contrôles du lecteur natif : réglable dans « Style du popup vidéo » (Configuration).
- Lancement d'un appel : réglable dans « Modèle d'URL pour lancer un appel » (par défaut `/lovelace/0?call={extension}`).
- Les réponses OUI/NON passent par l'action `logbook.log` de HA (visible dans le journal de HA).

## Données

Fichiers JSON dans le dossier de configuration de l'add-on (`/config/taskmanager/` côté add-on) : `config.json`, `tasks.json`, `journal.json`.
