import { api } from './api.js';
import { h, clear, toast, todayIso } from './dom.js';

export const renderArchive = async (root, context, show) => {
  const list = h('ul', { class: 'task-list' });
  const load = async () => {
    const archived = (await api.tasks()).filter((task) => task.archived);
    clear(list);
    if (!archived.length) list.append(h('li', { class: 'hint' }, 'L\'archive est vide.'));
    archived.forEach((task) => {
      const dateInput = h('input', { type: 'date', value: todayIso() });
      list.append(h('li', { class: 'task-item' },
        h('span', { class: 'task-title' }, task.title,
          h('div', { class: 'task-status' }, `${task.schedule.date || 'tous les jours'} à ${task.schedule.time} · ${task.last_status || 'jamais lancée'}`)),
        dateInput,
        h('button', { class: 'btn btn-small', onclick: async () => {
          await api.duplicate(task.id, dateInput.value);
          toast('Réutilisée à la date choisie');
        } }, 'Réutiliser ce jour'),
        h('button', { class: 'btn btn-secondary btn-small', onclick: async () => {
          await api.flag(task.id, 'archived', false);
          load();
        } }, 'Restaurer'),
        h('button', { class: 'btn btn-danger btn-small', onclick: async () => {
          if (window.confirm('Supprimer définitivement cette tâche ?')) {
            await api.deleteTask(task.id);
            load();
          }
        } }, 'Supprimer'),
      ));
    });
  };
  root.append(h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Archive'),
    h('p', { class: 'hint' }, 'Les tâches uniques passées arrivent ici. On peut les réutiliser un autre jour.'),
    list));
  await load();
};
