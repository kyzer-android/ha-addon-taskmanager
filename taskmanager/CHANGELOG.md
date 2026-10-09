# Changelog

## 0.9.2
- **Créateur — sous-tâches** : corrige la sélection. Un clic (ou la saisie) dans le titre d'une tâche / sous-tâche la sélectionne ; une sous-tâche nouvellement créée est sélectionnée automatiquement, donc les tuiles (audio, vidéo, question, sous-tâche) s'ajoutent bien dedans et les sous-tâches peuvent s'empiler. Carte sélectionnée bien visible (fond bleu, bordure épaisse) et bandeau « Les tuiles s'ajoutent dans : … ».
- **Créateur — heure** : champ à saisie directe (`0810` devient `08:10`), sans sélecteur à roue, clavier numérique sur mobile.

## 0.9.1
- **Nouveau déclencheur de sous-tâche « Après un délai »** : minutes + secondes (5 min par défaut), compté à partir de la fin de la tâche parente (après la vidéo / la réponse), quelle que soit la réponse. Plusieurs minuteurs sur un même parent démarrent ensemble (non cumulés). La tâche reste « en cours » jusqu'à la fin des minuteurs ; un redémarrage de l'add-on les perd.
- **Sous-tâche « Tant qu'un capteur est actif »** : la liste des capteurs ne propose plus que les entités du Catalogue d'entités (Configuration), avec leur nom. Catalogue vide : un message invite à demander à un administrateur de l'alimenter.

## 0.9.0
- **Vidéo + question dans un seul popup** : la vidéo (80 % du haut de l'écran) et les boutons OUI / NON dessous sont dans le même popup plein écran. À la fin de la vidéo, la question (titre + gros boutons) prend toute la place, sans rien rouvrir. Le délai de réponse ne démarre qu'à la fin de la vidéo ; répondre pendant la vidéo l'arrête. La fin de lecture est lue directement sur la vidéo (plus de délai de ~25 s). Contrôles du lecteur masqués. L'ancien mode (deux popups) reste dans Configuration → Avancé → « Affichage vidéo + question » pour revenir en arrière.
- Si la vidéo ne démarre pas (lecture automatique bloquée), la question seule s'affiche à sa place et un avertissement est noté au journal.
- **Vue tablette** : le bandeau affiche `samedi 10 octobre 2026 — 14:32` (sans « Aujourd'hui »), en plus grand (36 px). Une seule actualisation par minute, calée sur le changement de minute : données et heure.

## 0.8.4
- **Fini le double enregistrement** dans Configuration : le bouton « Enregistrer » des fenêtres (pièces, utilisateurs, entités) et « Supprimer » écrivent directement ; Calendriers, Vue tablette et chaque sous-partie d'Avancé ont leur propre bouton **Enregistrer** et un badge « ● non enregistré » ; le bouton du bas est supprimé.

## 0.8.3
- **Rôle « Administrateur » dans l'add-on** (Configuration → Utilisateurs) : voit toute l'interface sans dépendre de la liste des comptes de Home Assistant (qui peut être refusée à l'add-on). Il peut être appelé en escalade s'il a une extension. Corrige un administrateur HA déclaré « aidant » qui se retrouvait en vue aidant. Si tu es déjà bloqué : dans `config.json` du dossier de configuration de l'add-on, mets `"role": "admin"` sur ton compte et redémarre l'add-on.
- **Configuration allégée** : par défaut seuls Pièces, Utilisateurs, Catalogue d'entités, Calendriers et Vue tablette sont visibles ; le reste (questions et lecture, appels d'escalade, médias, sous-tâches liées à un capteur, style vidéo) est dans un bloc repliable « ⚙️ Avancé ».

## 0.8.2
- **Capteur d'appel déduit de l'extension SIP** : `sensor.pjsip_<ext>_<ext>_state` est utilisé automatiquement. Le champ « Capteur d'appel (avancé, facultatif) » reste pour forcer un autre capteur (les pièces déjà configurées gardent leur valeur). La liste des pièces affiche ⚠️ si le capteur n'existe pas dans HA.
- **Écran** : la liste ne propose que les entités dont le nom contient « screen » ou « ecran » (lien « Afficher toutes les entités » pour contourner).

## 0.8.1
- **Browser ID choisi dans une liste** : le champ de la pièce propose les navigateurs enregistrés dans Browser Mod (lus dans le registre des appareils de HA) au lieu d'une saisie libre. Un ID inconnu de Browser Mod est signalé par ⚠️ dans le formulaire et dans la liste des pièces (une faute de frappe empêche le popup d'appel de s'ouvrir). Si la liste est indisponible, la saisie manuelle reste possible.

## 0.8.0
- **Rôles** : un aidant (non administrateur HA) ne voit plus que **Fil de la journée, Créateur et Vue tablette** — contrôlé aussi côté serveur (pas de configuration, utilisateurs, images, journal ni guides). Un administrateur HA voit tout, même s'il est listé comme aidant.
- **Nouvel onglet Aide** (administrateurs) : guides « Serveur d'appel vidéo » et « Ajouter une tablette » affichés avec une vraie mise en page (sommaire, tableaux, blocs de code avec bouton Copier, encadrés).
- Les guides fournis sont des **versions génériques** (sans données personnelles). Bouton « Remplacer par mon fichier (.md) » pour mettre le tien (stocké dans la config de l'add-on, jamais dans le dépôt) et « Revenir à la version générique ».

## 0.7.2
- **Vidéo + question** : positionnement explicite des fenêtres (vidéo en haut sur 80 % de l'écran, boutons en bas sur le reste), pleine largeur, en cumulant plusieurs mécanismes CSS pour s'adapter à la version de HA / browser_mod.
- **Question seule** : fenêtre centrée au milieu de l'écran.
- **Boutons OUI / NON** : icônes et libellés en blanc, libellés plus grands.

## 0.7.1
- Le titre « Gestionnaire de tâches » de la page est retiré (HA affiche déjà le sien) : les onglets passent en haut.

## 0.7.0
- **Vidéo + question** : la vidéo prend le haut de l'écran (80 % par défaut) et seuls les boutons OUI / NON, de taille moyenne, sont dessous. À la fin de la vidéo, la question entière (texte et gros boutons) apparaît. Répondre pendant la vidéo l'arrête partout.
- **Question seule** : affichage centré. Vidéo seule : plein écran, inchangé.
- Deux réglages dans Configuration : hauteur de la vidéo et hauteur des boutons sous la vidéo.

## 0.6.2
- **Correction lecture vidéo/audio** : l'adresse envoyée à Home Assistant était invalide (`media-source://media/…`, erreur 500 « unknown_media_source »). Elle devient `media-source://media_source/local/…`. Les tâches et modèles existants sont convertis automatiquement.
- Le type de contenu d'une vidéo suit son extension (mp4, webm, mov, mkv…).

## 0.6.1
- **Correction importante** : derrière Ingress, les paramètres d'adresse étaient perdus (changer la date du Fil de la journée n'avait aucun effet). Corrigé, avec un test de non-régression.
- **Créateur** : le mot « null » n'apparaît plus au-dessus du canvas vide.
- **Agenda** : les événements du calendrier sont groupés par jour (« Aujourd'hui », « Demain », puis la date), avec l'heure en gras ou « Journée ». Un événement de plusieurs jours apparaît chaque jour.

## 0.6.0
- **Modèles** : l'onglet Archive disparaît. Sur chaque ligne du Fil de la journée, « 📚 Modèle » enregistre la tâche complète (actions, médias, questions, sous-tâches) **sans date ni heure**. Dans le Créateur, la tuile « 📚 Modèles » liste les modèles (importer, renommer, supprimer) : sur un canvas vide le modèle devient la tâche, avec une carte sélectionnée il s'ajoute comme sous-tâche.
- Le bouton « Archiver » est supprimé ; les anciennes tâches archivées sont abandonnées. Une tâche unique terminée ou passée est supprimée.
- **Boutons d'état** : « Visible / Masquée » et « Active / Désactivée » en texte clair (plus de symbole ⏻ illisible sur téléphone). Une tâche désactivée grise toute sa ligne.

## 0.5.1
- **Téléphone** : le fil de la journée s'adapte aux petits écrans (date et navigation sur deux lignes, boutons qui passent à la ligne).
- **Créateur** : la case « Appeler si personne ne répond » (et les autres cases/champs d'une carte) réagit enfin au clic.

## 0.5.0
- **Fil de la journée** : « Supprimer » ne retire que l'occurrence du jour (la répétition continue ; « Rétablir ce jour » annule). Pour supprimer toute la tâche : Modifier → « Supprimer toute la tâche (tous les jours) », avec confirmation.
- **Désactivée** : la tâche reste dans le planning mais grisée (elle n'est ni lancée ni affichée sur la tablette).
- **Archiver** : sort la tâche du planning pour la garder dans l'onglet Archive (réutilisable). Bouton aussi dans Modifier.
- **Médias** : avant l'envoi d'une vidéo/d'un son, une fenêtre propose un aperçu et le choix du nom du fichier.

## 0.4.0
- **Médias** : ajout de vidéos et de sons depuis le Créateur (fichier, ou « Filmer / Enregistrer avec le téléphone » via l'appli native), avec barre de progression ; suppression des fichiers ajoutés par l'add-on. Stockage dans `/media/taskmanager/` : le dossier média est maintenant monté en écriture (`media:rw`). Taille maximale réglable.
- **Agendas automatiques** : les événements des calendriers cochés arrivent seuls dans le fil (actualisation toutes les 10 min, bouton « Actualiser »). On peut masquer un événement. Les événements « journée entière » sur plusieurs jours apparaissent chaque jour.
- **Créateur** : le bouton « Tous les jours » devient « Aucun jour » quand les 7 jours sont cochés.
- **Vue tablette** : l'onglet est en pleine largeur et pleine hauteur, avec un bouton « Plein écran ».

## 0.3.0
- **Utilisateurs** : la section « Aidants » devient « Utilisateurs » (compte Home Assistant choisi dans une liste, rôle Aidant ou Tablette, extension SIP pour les aidants). Les anciens aidants sont repris automatiquement.
- **Rôles côté serveur** : un administrateur HA voit toujours l'interface complète ; un compte « Tablette » ne voit que le fil du jour, en lecture seule (le reste de l'API lui est refusé).
- **Vue tablette** dans l'interface : nouvel onglet, et page plein écran pour les comptes « Tablette » (bandeau vert, gros caractères, jours adaptés à la largeur, rafraîchie toutes les 30 s).
- **Image de fond** au choix (téléversement ou dossier média), mosaïque ou plein écran ; taille des caractères et largeur des jours réglables.
- La carte Lovelace `taskmanager-card` est abandonnée, ainsi que l'accès en écriture à la configuration de HA (`homeassistant_config:rw` retiré).

## 0.2.1
- Accès en écriture à la configuration de Home Assistant (`homeassistant_config:rw`), nécessaire pour installer automatiquement la carte `taskmanager-card` dans `/config/www/taskmanager/`. Aucune étape manuelle.

## 0.2.0
- Nouvelle carte Lovelace `custom:taskmanager-card` (style du dashboard des tablettes : bandeau vert, gros caractères, halo sur aujourd'hui, jours adaptés à la largeur). Installée et déclarée automatiquement par l'add-on (nécessite l'accès à la configuration de HA).
- Configuration : paramètres généraux réorganisés par thème (Questions et lecture, Appels d'escalade, Sous-tâches, Vue tablette, Calendriers, Avancé), avec unités et aides ; état de la carte et YAML à copier.

## 0.1.5
- Configuration : pièces, aidants et catalogue passent en cartes (Modifier / Supprimer). « Ajouter » et « Modifier » ouvrent une popup avec tous les champs les uns sous les autres, une aide sous chaque libellé et une validation des champs obligatoires.
- Libellés clarifiés (Lecteur de la tablette, Écran de la tablette, État d'appel de la tablette, Extension SIP, Identifiant du navigateur, Détecteur de présence, Tablette par défaut).

## 0.1.4
- Sélecteurs d'entités refaits sur le modèle de HA : icône, nom, appareil · pièce, identifiant, regroupement par pièce, recherche approximative (accents ignorés, plusieurs mots). Le panneau n'est plus coupé par les tableaux.
- `/api/entities` ajoute la pièce et l'appareil (registres HA via WebSocket).

## 0.1.3
- Configuration : tous les champs d'entités (lecteur, écran, capteurs d'appel et de présence, catalogue, capteur de sous-tâche, calendriers) sont des listes de sélection avec recherche, filtrées par domaine. Une entité enregistrée mais disparue est signalée en rouge « introuvable ».
- Le Browser ID reste en saisie libre (aucune API HA fiable pour le lister).

## 0.1.2
- Correction de l'erreur 404 à l'ouverture du panneau : Ingress transmet un chemin du type `////`, les slashes répétés sont maintenant normalisés.

## 0.1.1
- Ajout de l'icône « Tâches » dans le menu latéral (`ingress_panel: true`), visible dès l'installation et accessible aussi aux non-administrateurs (`panel_admin: false`).

## 0.1.0
- Première version : planification, lecture vidéo/audio, questions OUI/NON, appels d'escalade, gestion des appels entrants, interface de gestion et capteur du fil du jour.
