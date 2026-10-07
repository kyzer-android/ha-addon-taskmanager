# Changelog

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
