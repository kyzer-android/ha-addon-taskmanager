# Changelog

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
