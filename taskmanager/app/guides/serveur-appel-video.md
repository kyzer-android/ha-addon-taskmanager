# Guide 1 : Serveur d'appel vidéo (installation)

Installation de l'infrastructure commune : Asterisk, redirections, DNS, SIP Core, Browser Mod, téléphones.
Les tablettes ont chacune leur guide (02 chambre, 03 salon).

> Version générique : remplace les valeurs `mon-domaine…`, `IP_…`, `aidantN` par les tiennes. Les secrets sont des placeholders : `TON_AUTO_ADD_SECRET`, `TON_TOKEN`. Remplace-les toi-même.

---

## 1. Vue d'ensemble

```
Tel (Companion, HA1) ──► LXC WireGuard (IP_LXC_WIREGUARD) ──► tunnel ──► Asterisk (add-on, RPi5 / HA2)
Tablette (Fully + SIP Core, HA2) ◄──── réseau local de HA2 ────►  Asterisk
```

| Élément | Où | Rôle |
|---|---|---|
| Asterisk (add-on) | HA2 (RPi5, IP_RPI5) | Serveur SIP, une extension par personne HA |
| Intégration Asterisk | HA2 | Expose `sensor.pjsip_XXX_XXX_state` |
| SIP Core (HACS) | HA1 et HA2 | Le « téléphone » dans le navigateur |
| Browser Mod (HACS) | HA2 | Popup plein écran sur une tablette précise |
| Fully Kiosk | Tablettes | Page toujours chargée, écran allumé |
| LXC WireGuard | HA1 (IP_LXC_WIREGUARD) | Redirige les ports vers HA2 (`IP_TUNNEL_HA2`) |
| AdGuard | HA1 | Réécriture DNS `mon-domaine` → `IP_LXC_WIREGUARD` |

Domaine : `https://mon-domaine.duckdns.org` (`:8123` Home Assistant, `:8089` Asterisk WSS `/ws`).

| Ports | Protocole | Usage |
|---|---|---|
| 8123 | TCP | Home Assistant HA2 |
| 8089 | TCP | Asterisk WebSocket sécurisé |
| 10000 à 10049 | UDP | Flux audio/vidéo (RTP) |

## 2. Prérequis

- HA2 (RPi5, HAOS) et HA1 (VM Proxmox) fonctionnels
- Tunnel WireGuard actif entre les deux sites (HA2 vu comme `IP_TUNNEL_HA2`)
- Domaine DuckDNS et HTTPS actif sur HA2
- HACS installé sur HA1 et HA2
- Les personnes HA créées (une par tablette et par téléphone), dans l'ordre voulu pour les extensions

## 3. HA2 : add-on Asterisk

1. **Paramètres → Modules complémentaires → Boutique** : installer l'add-on **Asterisk** (identifiant `3e533915_asterisk`, version 6.2.0).
2. Onglet **Configuration** : renseigner `auto_add_secret` (= mot de passe SIP commun) : `TON_AUTO_ADD_SECRET`.
3. Au démarrage, l'add-on crée **une extension par personne HA, à partir de 100**. Exemple de ce montage :

| Extension | Personne |
|---|---|
| 100 | aidant1 |
| 101 | chambre |
| 102 | salon |
| 103 | aidant2 |

4. Configurer le RTP (fichier `rtp.conf` personnalisé de l'add-on) :

```ini
rtpstart=10000
rtpend=10049
ice_host_candidates=IP_RPI5 => IP_LXC_WIREGUARD,include_local_address
```

5. Démarrer l'add-on, activer **Démarrer au boot** et **Watchdog**.
6. Vérifier dans l'onglet **Journal** : `Asterisk Ready`, puis les endpoints.
7. **Paramètres → Appareils et services** : ajouter l'intégration **Asterisk** (elle crée `sensor.pjsip_XXX_XXX_state`).

## 4. LXC WireGuard : redirections

Dans la configuration WireGuard du LXC (IP_LXC_WIREGUARD), section `[Interface]`, redirections vers HA2 :

```ini
PostUp = iptables -t nat -A PREROUTING -p tcp --dport 8123 -j DNAT --to-destination IP_TUNNEL_HA2:8123; iptables -t nat -A PREROUTING -p tcp --dport 8089 -j DNAT --to-destination IP_TUNNEL_HA2:8089; iptables -t nat -A PREROUTING -p udp --dport 10000:10049 -j DNAT --to-destination IP_TUNNEL_HA2; iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE
PostDown = iptables -t nat -D PREROUTING -p tcp --dport 8123 -j DNAT --to-destination IP_TUNNEL_HA2:8123; iptables -t nat -D PREROUTING -p tcp --dport 8089 -j DNAT --to-destination IP_TUNNEL_HA2:8089; iptables -t nat -D PREROUTING -p udp --dport 10000:10049 -j DNAT --to-destination IP_TUNNEL_HA2; iptables -t nat -D POSTROUTING -o wg0 -j MASQUERADE
```

- Un seul `;` entre commandes.
- Redémarrer l'interface WireGuard du LXC (`wg-quick down wg0 && wg-quick up wg0`).
- Vérifier : `iptables -t nat -L PREROUTING -n`.

## 5. DNS : AdGuard (HA1)

1. **Filtres → Réécritures DNS → Ajouter** :
   - Domaine : `mon-domaine.duckdns.org`
   - Réponse : `IP_LXC_WIREGUARD` (le LXC, **pas** `IP_TUNNEL_HA2`)
2. Les appareils des deux maisons doivent utiliser AdGuard comme DNS.

## 6. HACS : SIP Core et Browser Mod (HA2)

1. **HACS → Intégrations** : ajouter **SIP Core** (version 5.1.2), télécharger, **redémarrer HA2**.
2. **HACS → Intégrations** : ajouter **Browser Mod**, télécharger, **redémarrer HA2**.
3. **Paramètres → Appareils et services → Ajouter une intégration** : **Browser Mod** puis **SIP Core**.

## 7. SIP Core sur HA2 (tablettes)

Dans les réglages de SIP Core (roue dentée), renseigner le serveur Asterisk (adresse `mon-domaine.duckdns.org`, port `8089`, chemin `/ws`, en WSS) puis :

```yaml
sip_video: true
auto_answer: true
users:
  - ha_username: Tablette chambre
    display_name: Chambre
    extension: '101'
    password: 'TON_AUTO_ADD_SECRET'
  - ha_username: Tablette salon
    display_name: Salon
    extension: '102'
    password: 'TON_AUTO_ADD_SECRET'
popup_config:
  auto_open: true
  extensions:
    "100":
      name: aidant1
    "101":
      name: chambre
    "102":
      name: salon
    "103":
      name: aidant2
```

- `ha_username` = **nom du profil** HA (champ « Nom »), pas le login.
- `sip_video` et `auto_answer` sont **globaux** : une seule valeur pour tout le site.
- `extensions` doit être **dans** `popup_config`, numéros entre guillemets.
- Le passage éventuel de `auto_open` à `false` se décide après observation sur les tablettes (guides 02 et 03).

## 8. SIP Core sur HA1 (téléphones)

1. Même installation HACS que l'étape 6 (SIP Core uniquement).
2. Même serveur Asterisk (domaine `mon-domaine…`, `:8089`).
3. `users` : une ligne par téléphone (extensions 100, 103…), avec le **nom de profil** HA du téléphone.
4. `auto_open: true` (les téléphones n'ont pas Browser Mod).
5. `sip_video: true`.

## 9. Browser Mod : réglages communs (HA2)

- Panneau de configuration Browser Mod : **Enable browser mod** actif.
- Entité caméra et go2rtc **désactivés** (vie privée et conflit avec l'appel).
- L'enregistrement de chaque tablette se fait dans son guide.

## 10. Téléphones (application Companion)

1. Installer l'application **Home Assistant Companion** sur chaque téléphone, serveur HA1.
2. Ajouter une **carte SIP Core** au tableau de bord HA1 (contacts : extensions 101, 102…).
3. Autoriser **caméra** et **micro** dans Android pour l'application.
4. Régler le **DNS privé** d'Android sur *Désactivé* ou sur le DNS d'AdGuard (sinon `mon-domaine` n'est pas résolu).

## 11. Tests de bout en bout

| # | Test | Attendu |
|---|---|---|
| 1 | Journal Asterisk | `Asterisk Ready`, endpoints présents |
| 2 | `sensor.pjsip_XXX_XXX_state` | Passe de `Not in use` à `Busy` pendant un appel |
| 3 | Appel local (HA2 ↔ HA2) | Audio et vidéo OK |
| 4 | Appel inter-sites (tel HA1 → tablette) | Audio et vidéo OK |
| 5 | Redémarrage de HA2 | Extensions de nouveau enregistrées |

## 12. Lecture de vidéos en plein écran (commun aux tablettes)

Permet à une automatisation de lancer une vidéo mp4 en plein écran sur une tablette, avec fermeture automatique à la fin.

### 12.1 Prérequis

1. **URL de Home Assistant** (HA2) : *Paramètres → Système → Réseau → Adresse Home Assistant*. Désactiver la détection automatique de l'URL interne, puis renseigner l'**URL interne** et l'**URL externe** avec `https://mon-domaine.duckdns.org:8123`. Sans cela, `media_player.play_media` échoue avec « Unable to determine Home Assistant URL to send to device ».
2. **Dossier des vidéos** : créer `/media/mes_videos/` sur HA2 et y déposer les fichiers **mp4**. Ils sont accessibles depuis le media center et le sélecteur de média.
3. **Lecteur Browser Mod** : chaque tablette enregistrée dans Browser Mod expose un lecteur `media_player.<nom>` (ex. `media_player.tablette_salon`).
4. **Fully Kiosk** : lecture automatique audio et vidéo activée (déjà dans les guides tablettes).

### 12.2 Script commun « Lire vidéo »

**Paramètres → Automatisations et scènes → Scripts → Créer un script → ⋮ → Modifier en YAML** :

```yaml
alias: Lire vidéo
icon: mdi:play-box
description: Lit la vidéo choisie en plein écran sur le lecteur choisi, puis ferme le popup à la fin.
mode: parallel
max: 4
fields:
  video:
    name: Lecteur et vidéo
    required: true
    selector:
      media: {}
variables:
  tablettes:
    media_player.tablette_salon:
      ecran: switch.salon_tablette_salon_ecran
      appel: sensor.pjsip_102_102_state
      browser_id: tablette-salon
    media_player.tablette_chambre:
      ecran: switch.chambre_tablette_chambre_ecran
      appel: sensor.pjsip_101_101_state
      browser_id: tablette-chambre
  lecteur: "{{ video.entity_id }}"
  t: "{{ tablettes[lecteur] if lecteur in tablettes else none }}"
sequence:
  - condition: template
    value_template: "{{ t is not none and states(t.appel) != 'Busy' }}"
  - action: switch.turn_on
    target:
      entity_id: "{{ t.ecran }}"
  - delay:
      seconds: 1
  - action: media_player.play_media
    target:
      entity_id: "{{ lecteur }}"
    data:
      extra:
        popup:
          initial_style: fullscreen
          tag: video
          popup_styles:
            - style: all
              styles: |
                ha-dialog {
                  --ha-dialog-surface-background: black;
                }
                ha-dialog .container {
                  padding: 0px;
                }
      media:
        media_content_id: "{{ video.media_content_id }}"
        media_content_type: video/mp4
  - wait_template: "{{ is_state(lecteur, 'playing') }}"
    timeout: 10
    continue_on_timeout: true
  - wait_template: "{{ not is_state(lecteur, 'playing') }}"
    timeout: 600
    continue_on_timeout: true
  - action: browser_mod.close_popup
    data:
      browser_id:
        - "{{ t.browser_id }}"
      tag: video
```

Fonctionnement :
- Le sélecteur de média renvoie le **lecteur choisi** (`entity_id`) et le fichier ; le script en déduit l'écran, l'extension et le Browser ID via la table `tablettes`.
- Un lecteur absent de la table : le script s'arrête sans rien lancer.
- Appel en cours (extension `Busy`) : le script s'arrête sans rien lancer.
- Le script attend que le lecteur passe en lecture, puis qu'il cesse de lire (fin de la vidéo), puis ferme le popup. Un délai de 10 minutes sert de secours.
- Pour ajouter une pièce : ajouter un bloc de 3 lignes dans `tablettes`.

### 12.3 Un script par pièce

Pour chaque tablette, dupliquer le script (voir guides 02 et 03) et choisir un **lecteur par défaut** dans le champ « Lecteur et vidéo ». Les automatisations n'ont plus qu'à choisir la vidéo.

---

## 13. Fonctionnalités à venir (sections vides)

- Fermeture de la vidéo à l'arrivée d'un appel (ajout dans les automatisations d'appel) : _à faire_
- Déclencheurs des rappels vidéo (heure, heure + capteur de présence) : _à définir_
- Escalade « ne réagit pas » : _à définir_
- Supervision (RPi5, Asterisk, tablettes) : _à définir_
- Appel lancé par HA (`asterisk.send_action`) : _à tester_
- Accès depuis l'extérieur : _à définir_
