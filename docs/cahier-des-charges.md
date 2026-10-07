# Cahier des charges : Add-on Home Assistant « Gestionnaire de tâches journalières »

Version 1 : phase de spécification (aucun code à ce stade)
Date : 7 octobre 2026

---

## 1. Contexte et objectif

Une personne atteinte d'une maladie neurodégénérative vit seule dans la maison. Des tablettes murales (Honor Pad X8 aujourd'hui) servent à lui rappeler ses activités quotidiennes. Leur nombre est variable : tablettes et aidants sont déclarés dans les paramètres, jamais écrits en dur dans l'add-on.

L'add-on planifie et exécute des rappels vidéo ou audio, pose des questions OUI/NON, relance si besoin, et escalade par appel vidéo SIP vers un proche en l'absence de réponse.

Deux profils d'utilisateurs :
- **Aidants (Mathieu, sa compagne)** : créent et modifient les tâches depuis un PC ou un téléphone.
- **Personne assistée** : voit le fil de sa journée sur la tablette, sans rien à configurer.

---

## 2. Périmètre

### Inclus
- Add-on HA avec interface de gestion (Ingress).
- Moteur de planification, choix de la pièce, lecture, questions, répétitions, escalade.
- Vue tablette (dashboard) du fil de la journée.
- Écran de configuration (pièces, catalogue d'entités).

### Exclus (traités ailleurs)
- Création du capteur de mouvement Fully Kiosk (MQTT) : traitée dans la conversation « intégration des tablettes ». Pour l'add-on, c'est une entité capteur comme une autre.
- Reconnaissance vocale par IA (prévue en V2, la structure est prête).
- Configuration de l'environnement HA : capteurs de présence (radars existants, onMotion Fully), broker MQTT, réglages du dashboard et du mode kiosque. L'add-on lit seulement l'entité « détecte une présence ».

---

## 3. Dépendances (déjà en place)

| Composant | Rôle |
|---|---|
| Home Assistant OS (RPi5) | Hôte |
| Browser Mod | Popups plein écran sur les tablettes |
| Fully Kiosk Plus | Tablettes, écran, lecteur média |
| Asterisk + SIP Core | Appels vidéo SIP |
| Dashboard kiosque | Vue tablette |

Principe : l'add-on appelle directement les services de base de HA (allumer l'écran, lire un média, ouvrir/fermer un popup, appeler une extension).
**Aucun script ni aucune automatisation n'est créé dans HA.** Toute la logique vit dans l'add-on, y compris celle des deux éléments actuels : le script « Lire vidéo » et l'automatisation « Appel tablette salon - popup plein écran » (allumage de l'écran et ouverture de la Call Card à l'arrivée d'un appel, fermeture à la fin). Une fois l'add-on en place, ces deux éléments n'ont plus lieu d'exister dans HA.

---

## 4. Écran de configuration

### 4.1 Pièces et tablettes
Le nombre de pièces et de tablettes est variable : on en ajoute, modifie ou supprime depuis les paramètres. **Aucun nom, numéro d'extension ni identifiant n'est écrit en dur dans l'add-on.** Pour chaque pièce (une tablette par pièce) :
- Nom libre (salon, chambre…).
- **Numéro d'extension SIP** de la tablette.
- Lecteur : le `media_player` de la tablette.
- Écran : l'entité qui permet de lire l'état de l'écran (allumé/éteint) et de l'allumer si besoin.
- Capteur d'appel : l'état de l'extension SIP de la tablette (sert à détecter qu'elle est en appel).
- **Browser ID** : paramètre de la tablette, saisi dans la configuration comme tout le reste.
- Capteur de présence : **facultatif**.

### 4.1 bis Aidants
Le nombre d'aidants est variable. Chaque aidant est déclaré dans les paramètres avec son **nom** et son **numéro d'extension**, tous deux modifiables.
**Seuls les aidants déclarés ici peuvent être appelés** (escalade, §5.6 et §10). Aucune autre extension n'est proposée.

### 4.2 Tablette par défaut
Une pièce désignée comme tablette par défaut, utilisée pour les appels quand aucune présence n'est détectée.

### 4.3 Paramètres généraux
Réglables dans la page de configuration :
- **Durée d'affichage d'une question** : 1 minute par défaut (§9.4).
- Délai d'attente après l'allumage de l'écran : 1 s par défaut (§9.1).
- Délai avant de considérer qu'une lecture n'a pas démarré : 10 s par défaut (§9.3).

### 4.4 Catalogue d'entités
L'utilisateur sélectionne des entités HA et leur donne un nom parlant. Quatre types :

| Type | Exemples | Usage |
|---|---|---|
| Lecteur | media_player tablette | Où jouer |
| Capteur de présence | onMotion Fully (MQTT), radar | Détection de la pièce |
| Personne à appeler | Les aidants déclarés au §4.1 bis (nom + extension) | Escalade |
| Autre capteur | Conditions libres | Sous-tâches conditionnelles |

---

## 5. Tâches

### 5.1 Type et planification
- **Journalière** : jours de la semaine choisis, ou « tous les jours ».
- **Unique** : un jour précis.
- Heure de déclenchement.

### 5.2 Archive
Les tâches uniques passées vont en archive, récupérables.

### 5.3 Visibilité
Icône 👁️ pour afficher ou masquer la tâche sur la tablette. Une tâche masquée s'exécute quand même.

### 5.4 Contenu (un seul choix par tâche)
- Vidéo seule.
- Audio seul.
- Vidéo + question avec boutons OUI / NON.

### 5.5 Récurrence (si question)
Par tâche : nombre de répétitions et délai entre chaque.

### 5.6 Escalade (si question, sans réponse)
Par tâche : option oui/non, et choix des personnes à appeler (extensions du catalogue). L'escalade lance un appel vidéo SIP.

---

## 6. Sous-tâches (arborescence conditionnelle)

Une sous-tâche est une branche déclenchée par :
- une réponse **OUI** ;
- une réponse **NON** ;
- **aucune réponse** (délai écoulé) ;
- une **condition capteur** (ex : tant que la personne est détectée dans le lit, rejouer toutes les 10 min).

Chaque sous-tâche peut contenir vidéo, audio, question et d'autres sous-tâches.

---

## 7. Réponses

Structure unique, prête pour l'IA :

| Champ | Contenu |
|---|---|
| Valeur | `oui` / `non` / `indéterminé` / `aucune` |
| Source | `bouton` / `IA` / `automatique` |
| Texte brut | Phrase prononcée (IA uniquement) |

V1 : boutons uniquement. En V2, l'IA alimentera la même structure sans changer le moteur.
Dès qu'une réponse arrive, les popups des autres tablettes se ferment immédiatement.

---

## 8. Choix de la pièce

Il n'y a qu'une personne dans la maison : deux pièces ne détectent jamais deux personnes différentes. En cas de plusieurs pièces actives, **on retient la détection la plus récente** (d'après l'heure de passage à « détecté » de chaque capteur).

| Situation | Résultat |
|---|---|
| Au moins une pièce détectée | On joue dans la pièce détectée le plus récemment |
| Aucune détection, vidéo ou audio | On joue sur **toutes** les tablettes (y compris sans capteur) |
| Aucune détection, appel vidéo | On appelle la **tablette par défaut** |
| Tablette en appel | Exclue de la diffusion vidéo |

---

## 9. Lecture vidéo et audio

### 9.1 Déroulement
1. Vérifier que la tablette n'est pas en appel.
2. Vérifier l'état de l'écran : l'écran est normalement toujours allumé. S'il est éteint, on l'allume puis on attend 1 s (réglable). S'il est déjà allumé, on ne fait rien et on n'attend pas.
3. Ouvrir un popup plein écran (fond noir) via Browser Mod, avec le lecteur natif.
4. Lancer la lecture sur le lecteur de la pièce.
5. Surveiller le début puis la fin de la lecture.
6. Fermer le popup à la fin.

### 9.2 Aucune interaction de pause
- La personne **ne peut pas mettre la vidéo en pause**.
- Les contrôles du lecteur natif (pause, barre de progression…) ne doivent pas être visibles.
- Aucun appui sur l'écran ne doit interrompre la vidéo.
- Principe : le popup charge une carte plein écran qui utilise le lecteur natif, et on masque ses contrôles à ce niveau. La doc officielle du navigateur confirme qu'un lecteur vidéo sans l'attribut `controls` n'affiche aucun contrôle natif. Le « comment » exact avec Browser Mod est à vérifier au développement (§13, point 1).

### 9.3 Fermeture (aucune limite de durée)
1. **Fin normale** de la lecture : fermeture, quelle que soit la durée.
2. **Lecture jamais démarrée** après un délai court (10 s, réglable) : fermeture et trace dans le journal.
3. **Appel entrant** sur la tablette : la vidéo est fermée immédiatement, avant l'ouverture du popup d'appel.
4. **Réponse reçue** (autre tablette) : fermeture immédiate.

L'ancien délai maximum de 10 minutes est **supprimé**.

### 9.4 Questions OUI/NON
- La question et ses boutons s'affichent **pendant la lecture** de la vidéo.
- **Durée d'affichage de la question : 1 minute par défaut**, réglable dans la page de configuration (§4.3).
- Passé ce délai sans réponse, c'est une absence de réponse : l'add-on enchaîne avec les répétitions, la sous-tâche « aucune réponse » ou l'escalade prévues par la tâche.

### 9.5 Audio seul
- Même logique de choix de pièce.
- **Aucun popup** : la tablette garde son dashboard par défaut et le son est joué en arrière-plan.

---

## 10. Appel vidéo (escalade)

- Déclenché si une question reste sans réponse après les répétitions prévues et si l'escalade est activée.
- La tablette appelée suit la règle du §8 (pièce détectée la plus récente, sinon tablette par défaut).
- La gestion de l'appel est **intégrée à l'add-on** : à l'arrivée d'un appel sur une tablette (détectée par son capteur d'extension SIP), l'add-on vérifie l'écran (normalement toujours allumé) et ne l'allume que s'il est éteint, ferme toute vidéo en cours, ouvre la Call Card en plein écran (fond noir), puis la ferme à la fin de l'appel. Elle remplace l'automatisation actuelle, pour toutes les tablettes déclarées (plus seulement le salon).
- Les personnes à appeler viennent du catalogue.

---

## 11. Les deux vues

| Vue | Utilisateurs | Contenu |
|---|---|---|
| Gestion (add-on, Ingress) | Mathieu et sa compagne, PC ou téléphone | Fil de la journée éditable, création de tâches, glisser-déposer, archive |
| Tablette (dashboard HA) | Personne assistée | Fil du jour simplifié, tâches visibles uniquement (👁️ activé) |

### 11.1 Vue tablette
- Même style que le dashboard actuel : très gros caractères (30–35 px), bandeau vert « Aujourd'hui : jour date », image de fond, mode kiosque.
- Le nombre de jours affiché **s'adapte à la place** à l'écran (un, deux jours ou plus). Il remplace les 4 cartes fixes actuelles.

### 11.2 Calendrier Google
Les événements du calendrier Google sont proposés dans l'écran de création des tâches. L'aidant choisit ceux qui s'affichent dans le fil. Ils ne sont pas ajoutés d'office.

---

## 12. Stockage et architecture

- Données au format JSON dans `/config/taskmanager/` (tâches, pièces, catalogue, archive).
- Moteur de planification interne à l'add-on (pas d'automatisations HA).
- Au démarrage : vérification que les entités configurées existent encore, avec alerte dans le journal sinon.
- Journal des exécutions et des réponses (utile pour les aidants et pour diagnostiquer).
- **Distribution :** le code est publié dans le dépôt GitHub `kyzer-android/ha-addon-taskmanager`, structuré comme un dépôt d'add-ons Home Assistant (fichier `repository.yaml` à la racine, dossier d'add-on avec son `config.yaml`), pour que l'add-on soit installable depuis le magasin d'add-ons de HA en ajoutant l'URL du dépôt.
- Accès à l'API de HA : option `homeassistant_api: true` dans la configuration de l'add-on (§13, point 2).

---

## 13. Points à valider ou à définir

| # | Point | Statut |
|---|---|---|
| 1 | Masquage des contrôles du lecteur natif et blocage des appuis tactiles | Mécanisme confirmé par la doc officielle du navigateur (un lecteur vidéo sans l'attribut `controls` n'affiche aucun contrôle natif). La doc de Browser Mod ne détaille pas comment retirer ces contrôles dans son popup média : à vérifier lors du développement |
| 2 | Accès de l'add-on à HA (appel de services, lecture des états, événements) | Confirmé par la doc officielle des add-ons : option `homeassistant_api: true`, jeton `SUPERVISOR_TOKEN`, API REST via `http://supervisor/core/api/` et WebSocket via `ws://supervisor/core/websocket` |
| 3 | Affichage des boutons OUI/NON | Réglé : pendant la lecture, durée d'affichage 1 min par défaut, réglable (§9.4) |
| 4 | Mode d'affichage de l'audio seul | Réglé : dashboard par défaut, son en arrière-plan (§9.5) |
| 5 | Browser ID : saisi pour chaque tablette dans la configuration de l'add-on | Réglé |

---

## 14. Ordre de construction proposé

1. Vérification technique : popup vidéo sans contrôles avec Browser Mod, accès de l'add-on à l'API de HA.
2. Modèle de données et stockage.
3. Écran de configuration (pièces, catalogue).
4. Moteur : planification, choix de la pièce, lecture, répétitions, escalade.
5. Interface de gestion (Ingress).
6. Vue tablette.
7. Plus tard (V2) : réponse vocale par IA.

Aucun code ne sera produit sans accord explicite de Mathieu.
