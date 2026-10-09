# Ajouter une tablette

Procédure pour ajouter une tablette murale (appels vidéo, rappels vidéo/audio, questions OUI/NON) une fois le serveur en place.

> Les appels entrants, la lecture des vidéos, les questions et l'escalade sont gérés par l'add-on **Gestionnaire de tâches journalières**. **Ne crée aucune automatisation ni aucun script « Lire vidéo / appel »** dans HA : ils feraient doublon.
> Version générique : remplace les exemples (`salon`, `102`, `tablette-salon`…) par tes valeurs. Les secrets sont des placeholders (`TON_AUTO_ADD_SECRET`). Remplace-les toi-même.

---

## 1. Prérequis (déjà en place)

- Add-on **Asterisk** et SIP Core sur HA2, Browser Mod installé
- HTTPS actif sur HA2 : `https://mon-domaine.duckdns.org:8123`
- URL interne et externe de HA2 renseignées (*Paramètres → Système → Réseau*)
- Dossier `/media/mes_videos/` pour les vidéos
- Add-on **Gestionnaire de tâches journalières** installé sur HA2 (entrée « Tâches » dans le menu latéral)
- Browser Mod à jour. Le mode kiosque de Browser Mod demande **Home Assistant 2026.1 ou plus**.

## 2. Valeurs à préparer

| Valeur | Exemple |
|---|---|
| Nom de la pièce | `salon` |
| Compte HA de la tablette | `tablettesalon` |
| Nom du profil HA (champ « Nom ») | `Tablette salon` |
| Extension SIP | `102` |
| Browser ID | `tablette-salon` |
| Lecteur Browser Mod | `media_player.tablette_salon` |
| Interrupteur d'écran (Fully) | `switch.salon_tablette_salon_ecran` |
| Capteur d'état d'appel | `sensor.pjsip_102_102_state` |
| Capteur de présence (optionnel) | selon ton matériel |

Le lecteur, l'interrupteur d'écran et le capteur d'appel n'existent qu'après les étapes 3 à 5. Les noms exacts se lisent dans *Paramètres → Appareils et services → Entités*.

## 3. Compte, personne et extension (HA2)

1. **Paramètres → Personnes** : créer la personne de la tablette, avec un compte HA (ex. `tablettesalon`) et un **nom de profil** (ex. `Tablette salon`).
2. **Redémarrer l'add-on Asterisk** : il crée une extension par personne, à partir de 100. Relever l'extension de la tablette (ex. `102`) et vérifier que `sensor.pjsip_102_102_state` apparaît.
3. Ajouter la tablette dans les réglages de **SIP Core** (roue dentée), dans `users`, en gardant les lignes existantes :

```yaml
  - ha_username: Tablette salon
    display_name: Salon
    extension: '102'
    password: 'TON_AUTO_ADD_SECRET'
```

- `ha_username` = **nom du profil HA**, pas le login.
- `password` = l'option `auto_add_secret` de l'add-on Asterisk.
- Ajouter aussi l'extension dans `popup_config.extensions` (numéro entre guillemets, avec un nom).
- Si la fenêtre d'appel native de SIP Core s'affiche en double avec celle de l'add-on, passer `auto_open: false` dans `popup_config`, **sur HA2 uniquement**.

## 4. Fully Kiosk (sur la tablette)

1. Installer **Fully Kiosk Browser** et activer la licence **Plus**.
2. **URL de démarrage** : l'adresse de HA2, sans aucun paramètre.
   - Pour que la tablette affiche directement le fil du jour : `https://mon-domaine.duckdns.org:8123/app/<slug>_taskmanager` (le `<slug>` apparaît dans l'adresse quand tu ouvres « Tâches » dans le menu latéral).
3. Activer : accès **webcam** et **micro** (HTTPS obligatoire), lecture automatique audio et vidéo, écran toujours allumé, **interface JavaScript**.
4. Exposer l'écran dans HA via l'intégration **Fully Kiosk Browser** : l'interrupteur d'écran de la tablette doit apparaître.
5. Vider le cache (*Web Content Settings → Clear cache*), puis se connecter avec le compte de la tablette.

## 5. Browser Mod (enregistrer la tablette)

Sur la tablette, connectée avec son compte :

1. Ouvrir `https://mon-domaine.duckdns.org:8123/browser-mod`.
2. Section **This browser** :
   - activer **Register** ;
   - dans **Browser ID**, saisir l'identifiant choisi (ex. `tablette-salon`) ;
   - activer **Sync Browser ID to login session** (restaure l'identifiant si le stockage local est vidé, tant que la session reste la même) ;
   - laisser **Enable camera entity** et **go2rtc** désactivés.
3. Vérifier dans *Paramètres → Appareils et services → Browser Mod* que l'appareil `tablette-salon` apparaît, avec son lecteur `media_player.tablette_salon`.

> Si tu te déconnectes puis te reconnectes avec le compte de la tablette, la session change : rouvrir `/browser-mod` et vérifier que **Sync Browser ID to login session** est bien activé.

### Mode kiosque

Depuis ton PC, en administrateur :

1. *Paramètres → Appareils et services → Browser Mod → roue dentée* (panneau de configuration).
2. Section **Frontend settings** : ajouter un réglage au niveau **Utilisateur**, choisir le compte de la tablette (ex. `tablettesalon`).
3. Activer **Kiosk mode**. Il a le même effet que « masquer la barre latérale », sans modifier le réglage utilisateur « toujours masquer la barre latérale ».
4. Recharger la page de la tablette.

- Niveau **Utilisateur** : le réglage suit le compte, même si le Browser ID change. Au niveau **Navigateur**, il dépend du Browser ID.
- Pour le désactiver sur un appareil, ouvrir `/browser-mod` (le kiosque cache les menus).
- Ne pas utiliser `?kiosk` ni `BrowserID=` dans l'URL de démarrage de Fully.

## 6. Add-on « Gestionnaire de tâches journalières »

1. Ouvrir **Tâches** dans le menu latéral → onglet **Configuration**.
2. **Pièces** → ajouter la pièce avec :
   - **Nom** : `salon`
   - **Extension SIP** : `102`
   - **Lecteur** : `media_player.tablette_salon`
   - **Écran** : `switch.salon_tablette_salon_ecran`
   - **Capteur d'appel** : `sensor.pjsip_102_102_state`
   - **Browser ID** : `tablette-salon` (identique à Browser Mod)
   - **Capteur de présence** : optionnel
3. **Utilisateurs** → déclarer le compte de la tablette avec le rôle **Tablette** (vue plein écran en lecture seule). Les aidants sont déclarés avec le rôle **Aidant** et leur extension SIP.
4. Si cette tablette doit être la tablette par défaut pour les appels d'escalade, la choisir dans les réglages correspondants.

## 7. Tests de validation

| # | Test | Attendu |
|---|---|---|
| 1 | Ouvrir la tablette | Fil du jour en plein écran, sans barre latérale ni en-tête |
| 2 | Appeler l'extension de la tablette depuis un téléphone | Popup d'appel plein écran sur fond noir, décrochage automatique, image et son |
| 3 | Fin de l'appel | Le popup se ferme |
| 4 | Lancer une tâche vidéo à la main (onglet « Fil de la journée ») | Vidéo plein écran avec le son, puis fermeture à la fin |
| 5 | Appeler la tablette pendant une vidéo | La vidéo se ferme, puis le popup d'appel s'ouvre |
| 6 | Écran éteint, puis appel | L'écran s'allume, puis le popup s'ouvre |
| 7 | Redémarrer la tablette | Browser ID inchangé, kiosque appliqué, fil du jour affiché |
| 8 | Se connecter avec le compte de la tablette depuis un autre navigateur | Vue simplifiée en lecture seule |
