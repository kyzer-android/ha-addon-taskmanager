# Vue tablette : carte « Fil du jour »

L'add-on fournit une **carte Lovelace personnalisée** (`custom:taskmanager-card`) qui reprend le style du dashboard des tablettes :
bandeau vert « Aujourd'hui : jour date », très gros caractères (30–35 px), halo sur le jour courant, éléments passés estompés.

Elle lit l'entité `sensor.taskmanager_fil_du_jour` publiée par l'add-on (mise à jour chaque minute et à chaque modification d'une tâche). Seules les tâches **visibles** (👁️) et les événements de calendrier choisis y figurent.

## Installation (automatique)

Au démarrage, l'add-on copie `taskmanager-card.js` dans `<config HA>/www/taskmanager/` et le déclare comme ressource Lovelace (`/local/taskmanager/taskmanager-card.js`).
Cela demande l'accès à la configuration de HA (`homeassistant_config:rw` dans `config.yaml`).
L'état de l'installation est affiché dans **Configuration → Vue tablette**. Si les dashboards sont en mode YAML, ajoute la ressource à la main (Paramètres → Tableaux de bord → Ressources, type « module JavaScript »).

## Utilisation

Dans le dashboard de la tablette : ajouter une carte → carte personnalisée, ou en YAML :

```yaml
type: custom:taskmanager-card
entity: sensor.taskmanager_fil_du_jour   # facultatif
show_header: true                        # bandeau vert « Aujourd'hui : … »
min_day_width: 360                       # largeur minimale d'un jour (px)
font_scale: 1                            # 1 = 30–35 px ; 0.8 pour réduire
```

**Nombre de jours adapté à la place** : la carte affiche autant de jours que la largeur le permet (largeur ÷ `min_day_width`), dans la limite des jours publiés (réglage « Nombre de jours publiés »).

Pour l'afficher en plein écran, utiliser une vue de type **Panneau** (une seule carte). L'image de fond et le mode kiosque restent réglés dans le dashboard, comme avant (le fond se règle sur la vue).
