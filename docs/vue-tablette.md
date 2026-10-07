# Vue tablette et rôles

La vue tablette est une **page de l'add-on** (Ingress), pas une carte Lovelace : même rendu que l'ancien dashboard (bandeau vert « Aujourd'hui : … », très gros caractères 30–35 px, halo sur le jour courant, éléments passés estompés, image de fond), avec un nombre de jours adapté à la largeur de l'écran.

## Qui voit quoi

Ingress transmet le compte Home Assistant connecté (en-tête `X-Remote-User-Id`). Le rôle est déterminé ainsi :

| Compte | Interface |
|---|---|
| Administrateur Home Assistant | complète, toujours (même non déclaré) |
| Utilisateur déclaré **Aidant** | complète |
| Utilisateur déclaré **Tablette** | vue simplifiée seule, **lecture seule** (le serveur refuse tout le reste) |
| Compte non déclaré, non admin | vue simplifiée |
| Aucun utilisateur déclaré | complète pour tout le monde (démarrage) |

Si la liste des comptes HA est indisponible (`config/auth/list` refusé), un compte non déclaré est traité comme administrateur pour ne jamais bloquer l'accès ; les comptes déclarés gardent leur rôle.

Les utilisateurs se déclarent dans **Configuration → Utilisateurs** : compte HA (liste déroulante), rôle, et extension SIP pour un aidant (c'est cette liste d'aidants qui sert aux appels d'escalade).

## Utilisation sur la tablette

Le compte « Tablette » ouvre le panneau « Tâches » de la barre latérale (ou directement `/app/<slug>_taskmanager`). L'add-on n'affiche aucun en-tête : la page est le fil du jour en plein écran, rafraîchi toutes les 30 secondes. Le panneau reste accessible aux non-administrateurs (`panel_admin: false`).

## Réglages (Configuration → Vue tablette)

- Nombre de jours publiés, largeur minimale d'un jour (fixe combien de jours tiennent côte à côte), taille des caractères.
- **Image de fond** : images téléversées dans l'add-on (`/config/taskmanager/images/`) ou présentes dans le dossier média de HA ; affichage en mosaïque ou plein écran.

L'onglet **Vue tablette** de l'interface complète montre le rendu exact.

## Données

`GET /api/tablet` (seul point d'API, avec `/api/me` et `/api/image/…`, accessible au compte « Tablette ») renvoie les jours, les réglages d'affichage et l'adresse du fond.
Le capteur `sensor.taskmanager_fil_du_jour` reste publié (utile pour d'autres usages, par exemple une carte Markdown).
