import { api } from './api.js';
import { h } from './dom.js';

export const renderJournal = async (root) => {
  const [entries, status] = await Promise.all([api.journal(), api.status()]);
  root.append(h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Journal'),
    h('p', { class: 'hint' },
      `Version ${status.version} · Home Assistant ${status.ha_connected ? 'connecté' : 'déconnecté'} · ${status.now}`),
    entries.length ? entries.map((entry) => h('div', { class: `log-line log-${entry.level}` },
      `${entry.ts}  ${entry.message}`)) : h('p', { class: 'hint' }, 'Aucune entrée pour l\'instant.')));
};
