// Vue tablette : fil du jour en très gros caractères (bandeau vert, jours adaptés à la largeur).
import { api } from './api.js';
import { h, clear, toast } from './dom.js';

const REFRESH_MS = 30000;
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

const pad = (value) => String(value).padStart(2, '0');
const isoOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const minutesOf = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const dayBlock = (day, now, isToday) => {
  const [year, month, date] = String(day.date || '').split('-').map(Number);
  const parsed = year ? new Date(year, month - 1, date) : null;
  const items = Array.isArray(day.items) ? day.items : [];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return h('section', { class: `tablet-day ${isToday ? 'is-today' : ''}` },
    h('div', { class: 'tablet-day-head' }, parsed
      ? [h('span', { class: 'tablet-weekday' }, WEEKDAYS[parsed.getDay()]),
        h('span', { class: 'tablet-daynum' }, parsed.getDate()),
        h('span', { class: 'tablet-month' }, MONTHS[parsed.getMonth()])]
      : h('span', { class: 'tablet-weekday' }, day.label || '')),
    items.length
      ? h('ul', { class: 'tablet-items' }, items.map((item) => {
        const minutes = minutesOf(item.time);
        const past = isToday && minutes !== null && minutes < nowMinutes;
        return h('li', { class: `tablet-item ${past ? 'is-past' : ''}` },
          h('span', { class: 'tablet-time' }, item.time || ''),
          h('span', {}, `${item.kind === 'event' ? '📅 ' : ''}${item.title || ''}`));
      }))
      : h('div', { class: 'tablet-empty' }, 'Rien de prévu'));
};

/**
 * Affiche la vue tablette dans `root`.
 * options.standalone : plein écran (compte « tablette »).
 * options.preview    : aperçu dans l'interface de gestion, pleine largeur, avec un bouton « Plein écran ».
 */
export const renderTablet = async (root, _context, _show, options = {}) => {
  const view = h('div', { class: `tablet-view ${options.standalone ? 'is-standalone' : ''}` });
  if (options.preview) {
    root.append(h('div', { class: 'tablet-toolbar' },
      h('button', { class: 'btn btn-secondary btn-small', onclick: async () => {
        try { await view.requestFullscreen(); } catch (error) { toast('Plein écran refusé ici : essaie F11 dans le navigateur'); }
      } }, '⛶ Plein écran'),
      h('span', { class: 'hint' }, 'Rendu exact de ce que voit la tablette.')));
  }
  root.append(view);
  let data = await api.tablet();
  let width = 0;

  const applySettings = () => {
    const settings = data.settings || {};
    view.style.setProperty('--tablet-scale', String(Number(settings.font_scale) || 1));
    view.style.backgroundImage = settings.background_url ? `url("${settings.background_url}")` : '';
    const cover = settings.background_mode === 'cover';
    view.style.backgroundSize = cover ? 'cover' : 'contain';
    view.style.backgroundRepeat = cover ? 'no-repeat' : 'repeat';
  };

  const draw = () => {
    applySettings();
    clear(view);
    const now = new Date();
    const days = Array.isArray(data.days) ? data.days : [];
    const minWidth = Math.max(160, Number(data.settings?.min_day_width) || 360);
    const available = width || view.getBoundingClientRect().width || minWidth;
    const count = Math.min(Math.max(1, Math.floor(available / minWidth)), days.length || 1);
    const today = isoOf(now);
    view.append(
      h('div', { class: 'tablet-banner' },
        `Aujourd'hui : ${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`),
      days.length
        ? h('div', { class: 'tablet-days', style: `grid-template-columns: repeat(${count}, minmax(0, 1fr))` },
          days.slice(0, count).map((day, index) => dayBlock(day, now, day.date ? day.date === today : index === 0)))
        : h('div', { class: 'tablet-message' }, 'Aucun jour publié.'));
  };

  const refresh = async () => {
    if (!view.isConnected) { clearInterval(timer); observer.disconnect(); return; }
    try { data = await api.tablet(); } catch (error) { /* on garde l'affichage précédent */ }
    draw();
  };

  const observer = new ResizeObserver((entries) => {
    const next = Math.round(entries[0].contentRect.width);
    if (next !== width) { width = next; draw(); }
  });
  const timer = setInterval(refresh, REFRESH_MS);
  observer.observe(view);
  draw();
};
