import { loadEntities } from './picker.js';
import { h, clear } from './dom.js';
import { renderTimeline } from './timeline.js';
import { renderCreator } from './creator.js';
import { renderSettings } from './settings.js';
import { renderJournal } from './journal.js';
import { renderTablet } from './tablet.js';
import { renderHelp } from './help.js';
import { api } from './api.js';

const pages = [
  { id: 'timeline', label: 'Fil de la journée', render: renderTimeline },
  { id: 'creator', label: 'Créateur', render: renderCreator },
  { id: 'tablet', label: 'Vue tablette', wide: true,
    render: (root, ctx, showPage) => renderTablet(root, ctx, showPage, { preview: true }) },
  { id: 'settings', label: 'Configuration', render: renderSettings, adminOnly: true },
  { id: 'journal', label: 'Journal', render: renderJournal, adminOnly: true },
  { id: 'help', label: 'Aide', render: renderHelp, adminOnly: true },
];

const context = { editTask: null };
const main = document.getElementById('appMain');
const nav = document.getElementById('appNav');

const show = async (pageId) => {
  const page = pages.find((item) => item.id === pageId) || pages[0];
  nav.querySelectorAll('.app-nav-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.page === page.id);
  });
  document.body.classList.toggle('is-wide', Boolean(page.wide));
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
  // Un aidant voit le fil, le créateur et la vue tablette ; seuls les administrateurs voient le reste.
  const isAdmin = role.admin !== false;
  pages.filter((page) => isAdmin || !page.adminOnly).forEach((page) => {
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
