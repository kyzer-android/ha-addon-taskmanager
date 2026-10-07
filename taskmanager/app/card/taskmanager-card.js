/*
 * Carte « Fil du jour » du Gestionnaire de tâches.
 * Installée et déclarée automatiquement par l'add-on (aucune dépendance externe).
 *
 * Exemple :
 *   type: custom:taskmanager-card
 *   entity: sensor.taskmanager_fil_du_jour   # facultatif
 *   show_header: true                        # bandeau « Aujourd'hui : … »
 *   min_day_width: 360                       # largeur minimale d'un jour (px) : fixe le nombre de jours affichés
 *   font_scale: 1                            # 1 = très gros caractères (30–35 px)
 */
const CARD_VERSION = '__VERSION__';
const DEFAULT_ENTITY = 'sensor.taskmanager_fil_du_jour';
const UPDATE_INTERVAL_MS = 30000;
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

const STYLE = `
  :host { display: block; height: 100%; }
  ha-card {
    --tm-scale: 1;
    --tm-banner-bg: #d4edda;
    --tm-gap: 16px;
    --tm-font-weekday: calc(30px * var(--tm-scale));
    --tm-font-day: calc(35px * var(--tm-scale));
    --tm-font-month: calc(25px * var(--tm-scale));
    --tm-font-item: calc(30px * var(--tm-scale));
    --tm-font-banner: calc(28px * var(--tm-scale));
    display: flex; flex-direction: column; height: 100%; overflow: hidden;
    background: transparent; box-shadow: none; border: none;
  }
  .banner {
    background: var(--tm-banner-bg); color: #1f2933; font-weight: bold; text-align: center;
    font-size: var(--tm-font-banner); padding: 14px 16px; border-radius: var(--ha-card-border-radius, 12px);
    margin-bottom: var(--tm-gap);
  }
  .days { display: grid; gap: var(--tm-gap); flex: 1; align-items: start; padding: 4px; }
  .day {
    background: var(--ha-card-background, var(--card-background-color, #fff)); color: var(--primary-text-color);
    border-radius: var(--ha-card-border-radius, 12px); padding: 14px 16px; min-width: 0;
    box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0, 0, 0, 0.2));
  }
  .day.is-today { box-shadow: 0 0 14px 3px var(--primary-color); }
  .day-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 8px; }
  .weekday { font-size: var(--tm-font-weekday); font-weight: 600; text-transform: capitalize; }
  .daynum { font-size: var(--tm-font-day); font-weight: 700; }
  .month { font-size: var(--tm-font-month); color: var(--secondary-text-color); }
  .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .item { display: flex; gap: 14px; align-items: baseline; font-size: var(--tm-font-item); line-height: 1.2; }
  .item.is-past { opacity: 0.4; }
  .time { font-weight: 700; white-space: nowrap; min-width: 3.2em; }
  .title { overflow-wrap: anywhere; }
  .empty { font-size: var(--tm-font-item); color: var(--secondary-text-color); }
  .message { font-size: var(--tm-font-item); padding: 16px; color: var(--secondary-text-color); }
`;

const pad = (value) => String(value).padStart(2, '0');
const isoToday = (now) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const minutesOf = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

class TaskManagerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._lastState = undefined;
    this._width = 0;
    this._timer = null;
    this._observer = null;
  }

  static getStubConfig() {
    return { entity: DEFAULT_ENTITY };
  }

  setConfig(config) {
    this._config = {
      entity: DEFAULT_ENTITY,
      show_header: true,
      min_day_width: 360,
      font_scale: 1,
      ...config,
    };
    this._lastState = undefined;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const state = hass.states[this._config?.entity];
    if (state !== this._lastState) {
      this._lastState = state;
      this._render();
    }
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 'full', min_columns: 6, rows: 'auto' };
  }

  connectedCallback() {
    this._observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      if (width !== this._width) {
        this._width = width;
        this._render();
      }
    });
    this._observer.observe(this);
    // Le bandeau et les éléments passés se mettent à jour même sans changement d'état.
    this._timer = setInterval(() => this._render(), UPDATE_INTERVAL_MS);
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    clearInterval(this._timer);
  }

  _visibleDays(days) {
    const minWidth = Math.max(160, Number(this._config.min_day_width) || 360);
    const width = this._width || this.getBoundingClientRect().width || minWidth;
    const fit = Math.max(1, Math.floor(width / minWidth));
    return Math.min(fit, days.length || 1);
  }

  _dayNode(day, now, isToday) {
    const [year, month, date] = String(day.date || '').split('-').map(Number);
    const parsed = year ? new Date(year, month - 1, date) : null;
    const node = document.createElement('section');
    node.className = `day${isToday ? ' is-today' : ''}`;

    const head = document.createElement('div');
    head.className = 'day-head';
    const make = (className, text) => {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      return span;
    };
    if (parsed) {
      head.append(make('weekday', WEEKDAYS[parsed.getDay()]), make('daynum', String(parsed.getDate())),
        make('month', MONTHS[parsed.getMonth()]));
    } else {
      head.append(make('weekday', day.label || ''));
    }
    node.append(head);

    const items = Array.isArray(day.items) ? day.items : [];
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Rien de prévu';
      node.append(empty);
      return node;
    }
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const list = document.createElement('ul');
    list.className = 'items';
    items.forEach((item) => {
      const minutes = minutesOf(item.time);
      const past = isToday && minutes !== null && minutes < nowMinutes;
      const row = document.createElement('li');
      row.className = `item${past ? ' is-past' : ''}`;
      row.append(make('time', item.time || ''),
        make('title', `${item.kind === 'event' ? '📅 ' : ''}${item.title || ''}`));
      list.append(row);
    });
    node.append(list);
    return node;
  }

  _render() {
    if (!this._config) return;
    const root = this.shadowRoot;
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = STYLE;
    const card = document.createElement('ha-card');
    card.style.setProperty('--tm-scale', String(Number(this._config.font_scale) || 1));
    root.append(style, card);

    const now = new Date();
    if (this._config.show_header) {
      const banner = document.createElement('div');
      banner.className = 'banner';
      banner.textContent = `Aujourd'hui : ${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
      card.append(banner);
    }

    const state = this._hass?.states?.[this._config.entity];
    const message = (text) => {
      const div = document.createElement('div');
      div.className = 'message';
      div.textContent = text;
      card.append(div);
    };
    if (!this._hass) return message('Chargement…');
    if (!state) return message(`Entité introuvable : ${this._config.entity}. Vérifie que l'add-on est démarré.`);

    const days = Array.isArray(state.attributes?.days) ? state.attributes.days : [];
    if (!days.length) return message('Aucun jour publié.');
    const count = this._visibleDays(days);
    const grid = document.createElement('div');
    grid.className = 'days';
    grid.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
    const today = isoToday(now);
    days.slice(0, count).forEach((day, index) => {
      grid.append(this._dayNode(day, now, day.date ? day.date === today : index === 0));
    });
    card.append(grid);
  }
}

if (!customElements.get('taskmanager-card')) {
  customElements.define('taskmanager-card', TaskManagerCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'taskmanager-card',
    name: 'Fil du jour (Gestionnaire de tâches)',
    description: 'Tâches et événements du jour, en très gros caractères, pour les tablettes murales.',
    preview: false,
  });
  console.info(`%c TASKMANAGER-CARD %c ${CARD_VERSION} `, 'background:#4caf50;color:#fff', 'background:#eee;color:#333');
}
