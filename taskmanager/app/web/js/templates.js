// Liste des modèles (blocs de tâche sans date ni heure) : importer, renommer, supprimer.
import { api } from './api.js';
import { h, clear, toast } from './dom.js';

const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

const summarize = (root) => {
  const parts = [];
  const walk = (node, tally) => {
    if (node.media.kind === 'video') tally.video += 1;
    if (node.media.kind === 'audio') tally.audio += 1;
    if (node.question) tally.question += 1;
    node.children.forEach((child) => { tally.sub += 1; walk(child.node, tally); });
  };
  const tally = { video: 0, audio: 0, question: 0, sub: 0 };
  walk(root, tally);
  if (tally.video) parts.push(plural(tally.video, 'vidéo'));
  if (tally.audio) parts.push(plural(tally.audio, 'audio'));
  if (tally.question) parts.push(plural(tally.question, 'question'));
  if (tally.sub) parts.push(plural(tally.sub, 'sous-tâche'));
  return parts.join(' · ') || 'Tâche vide';
};

export const openTemplates = (onImport) => {
  const overlay = h('div', { class: 'modal-overlay' });
  const list = h('ul', { class: 'template-list' });
  const close = () => overlay.remove();

  const load = async () => {
    const templates = await api.templates();
    clear(list);
    if (!templates.length) {
      list.append(h('li', { class: 'hint' },
        'Aucun modèle. Dans le Fil de la journée, utilise « 📚 Modèle » sur une tâche pour l\'enregistrer.'));
    }
    templates.forEach((template) => list.append(h('li', { class: 'template-item' },
      h('div', { class: 'template-info' },
        h('strong', {}, template.name),
        h('div', { class: 'task-status' }, summarize(template.root))),
      h('div', { class: 'task-actions' },
        h('button', { class: 'btn btn-small', onclick: () => { close(); onImport(template); } }, 'Importer'),
        h('button', { class: 'btn btn-secondary btn-small', onclick: async () => {
          const name = window.prompt('Nouveau nom :', template.name);
          if (!name || !name.trim()) return;
          await api.renameTemplate(template.id, name.trim());
          load();
        } }, 'Renommer'),
        h('button', { class: 'btn btn-danger btn-small', onclick: async () => {
          if (!window.confirm(`Supprimer le modèle « ${template.name} » ?`)) return;
          await api.deleteTemplate(template.id);
          toast('Modèle supprimé');
          load();
        } }, 'Supprimer')))));
  };

  overlay.append(h('div', { class: 'upload-dialog' },
    h('h3', {}, '📚 Modèles'),
    h('p', { class: 'hint' },
      'Sur un canvas vide, le modèle devient la tâche. Avec une carte sélectionnée, il s\'ajoute comme sous-tâche.'),
    list,
    h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary', onclick: close }, 'Fermer'))));
  document.body.append(overlay);
  load();
};
