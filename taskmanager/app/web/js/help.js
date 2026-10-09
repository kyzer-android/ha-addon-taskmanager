// Onglet Aide : guides d'installation (Markdown), version générique ou fichier de l'administrateur.
import { api } from './api.js';
import { h, clear, toast } from './dom.js';
import { renderMarkdown } from './markdown.js';

export const renderHelp = async (root) => {
  const guides = await api.guides();
  const tabs = h('div', { class: 'help-tabs' });
  const body = h('div', { class: 'help-body' });
  let currentId = guides[0]?.id;

  const loadGuide = async (id) => {
    currentId = id;
    tabs.querySelectorAll('.help-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.id === id));
    const guide = await api.guide(id);
    const { nodes, toc } = renderMarkdown(guide.markdown);

    const fileInput = h('input', { type: 'file', accept: '.md,.markdown,text/markdown,text/plain', hidden: true,
      onchange: async (event) => {
        const [file] = event.target.files;
        event.target.value = '';
        if (!file) return;
        try {
          await api.replaceGuide(id, await file.text());
          toast('Guide remplacé');
          loadGuide(id);
        } catch (error) {
          toast(`Remplacement impossible : ${error.message}`);
        }
      } });

    clear(body).append(
      h('div', { class: 'help-actions' },
        h('span', { class: `badge ${guide.custom ? 'badge-custom' : ''}` },
          guide.custom ? 'Ton fichier' : 'Version générique'),
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => fileInput.click() },
          '⬆️ Remplacer par mon fichier (.md)'),
        guide.custom ? h('button', { class: 'btn btn-secondary btn-small', onclick: async () => {
          if (!window.confirm('Revenir à la version générique ? Ton fichier sera supprimé.')) return;
          await api.resetGuide(id);
          toast('Version générique rétablie');
          loadGuide(id);
        } }, '↩️ Revenir à la version générique') : null,
        fileInput),
      toc.length ? h('details', { class: 'help-toc', open: true },
        h('summary', {}, 'Sommaire'),
        h('ul', {}, toc.map((entry) => h('li', { class: `toc-l${entry.level}` },
          h('a', { href: `#${entry.id}`, onclick: (event) => {
            event.preventDefault();
            document.getElementById(entry.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } }, entry.text))))) : null,
      h('article', { class: 'md-doc' }, nodes));
  };

  guides.forEach((guide) => tabs.append(h('button', {
    class: 'help-tab', 'data-id': guide.id, onclick: () => loadGuide(guide.id),
  }, guide.title)));
  root.append(h('section', { class: 'panel' }, tabs, body));
  if (currentId) await loadGuide(currentId);
};
