# Vue tablette : fil du jour

L'add-on publie dans HA une entité `sensor.taskmanager_fil_du_jour` (mise à jour chaque minute et à chaque modification d'une tâche).
Son état est le nombre d'éléments du jour. Son attribut `days` contient, pour chaque jour publié (4 par défaut, réglable) :
`date`, `label` (ex. « mercredi 7 octobre ») et `items` (liste de `time`, `title`, `kind` = `task` ou `event`).

Seules les tâches **visibles** (icône 👁️) et les événements de calendrier choisis y figurent.

Cette approche passe par une simple carte Markdown : pas d'iframe, donc pas de souci de contenu mixte avec un HA en HTTPS.

## Exemple : une carte par jour dans une vue de type « sections »

Dans une vue `sections`, les cartes se replacent toutes seules selon la largeur de l'écran : c'est ce qui adapte le nombre de jours visibles (1, 2 ou plus). Duplique la carte en changeant l'index `0` en `1`, `2`, `3`.

```yaml
type: markdown
card_mod:
  style: |
    ha-card { background: #ffffff; }
    ha-markdown { font-size: 30px; }
content: >
  {% set days = state_attr('sensor.taskmanager_fil_du_jour', 'days') %}
  {% set day = days[0] if days and days | length > 0 else none %}
  {% if day %}
  # {{ day['label'] | capitalize }}
  {% for item in day['items'] %}
  **{{ item['time'] }}** — {{ item['title'] }}

  {% else %}
  Rien de prévu.
  {% endfor %}
  {% endif %}
```

## Remarques

- La carte `custom:calendar-card-pro` actuelle n'est plus nécessaire : les événements du calendrier Google choisis dans le créateur apparaissent dans ce fil.
- Après un redémarrage de HA, l'entité réapparaît dès que l'add-on se reconnecte (en moins d'une minute).
