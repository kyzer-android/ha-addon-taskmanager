import { loadEntities } from './picker.js';
import { h, clear } from './dom.js';
import { renderTimeline } from './timeline.js';
import { renderCreator } from './creator.js';
import { renderArchive } from './archive.js';
import { renderSettings } from './settings.js';
import { renderJournal } from './journal.js';
import { renderTablet } from './tablet.js';
import { api } from './api.js';

const pages = [
  { id: 'timeline', label: 'Fil de la journée', render: renderTimeline },
  { id: 'creator', label: 'Créateur', render: renderCreator },
  { id: 'archive', label: 'Archive', render: renderArchive },
  { id: 'tablet', label: 'Vue tablette', render: renderTablet },
  { id: 'settings', label: 'Configuration', render: renderSettings },
  { id: 'journal', label: 'Journal', render: renderJournal },
];

const context = { editTask: null };
const main = document.getElementById('appMain');
const nav = document.getElementById('appNav');

const show = async (pageId) => {
  const page = pages.find((item) => item.id === pageId) || pages[0];
  nav.querySelectorAll('.app-nav-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.page === page.id);
  });
  clear(main);
  try {
    await page.render(main, context, show);
  } catch (error) {
    main.append(h('p', { class: 'panel' }, `Erreur : ${error.message}`));
  }
};

const start = async () => {
  let role = { full: true };
  try { role = await api.me(); } catch (error) { /* interface complète par défaut */ }
  if (!role.full) {
    // Compte « tablette » : uniquement le fil du jour, sans navigation.
    document.body.classList.add('is-tablet');
    await renderTablet(main, context, show, { standalone: true });
    return;
  }
  pages.forEach((page) => {
    nav.append(h('button', {
      class: 'app-nav-link',
      'data-page': page.id,
      onclick: () => show(page.id),
    }, page.label));
  });
  loadEntities();
  show('timeline');
};

start();
