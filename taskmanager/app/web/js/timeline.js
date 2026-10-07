import { api } from './api.js';
import { h, clear, toast, todayIso } from './dom.js';

const shiftDate = (iso, days) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const renderTimeline = async (root, context, show) => {
  let currentDate = todayIso();
  const banner = h('div', { class: 'day-banner' });
  const list = h('ul', { class: 'task-list' });

  const load = async () => {
    const [day, tasks] = await Promise.all([api.day(currentDate), api.tasks()]);
    const byId = Object.fromEntries(tasks.map((task) => [task.id, task]));
    clear(banner).append(
      h('span', { class: 'day-label' }, day.label),
      h('div', { class: 'day-nav' },
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => { currentDate = shiftDate(currentDate, -1); load(); } }, '◀'),
        h('input', { type: 'date', value: currentDate, onchange: (event) => { currentDate = event.target.value || currentDate; load(); } }),
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => { currentDate = shiftDate(currentDate, 1); load(); } }, '▶')),
    );
    clear(list);
    if (!day.items.length) list.append(h('li', { class: 'hint' }, 'Rien de prévu ce jour-là.'));
    day.items.forEach((item) => list.append(renderItem(item, byId[item.id])));
  };

  const renderItem = (item, task) => {
    if (item.kind === 'event' || !task) {
      return h('li', { class: 'task-item is-event' },
        h('span', { class: 'task-time' }, item.time),
        h('span', { class: 'task-title' }, item.title),
        h('span', { class: 'badge' }, 'Calendrier'));
    }
    const toggle = (name, label, icon) => h('button', {
      class: `icon-btn ${task[name] ? '' : 'is-off'}`,
      title: label,
      onclick: async () => { await api.flag(task.id, name, !task[name]); load(); },
    }, icon);
    const classes = ['task-item', task.visible ? '' : 'is-hidden', item.enabled === false ? 'is-disabled' : '',
      item.skipped ? 'is-skipped' : ''].filter(Boolean).join(' ');
    if (item.skipped) {
      return h('li', { class: classes },
        h('span', { class: 'task-time' }, task.schedule.time),
        h('span', { class: 'task-title' }, task.title, h('div', { class: 'task-status' }, 'Supprimée ce jour-là')),
        h('button', { class: 'btn btn-secondary btn-small', onclick: async () => {
          await api.skipDay(task.id, currentDate, false);
          toast('Jour rétabli');
          load();
        } }, 'Rétablir ce jour'));
    }
    const isDaily = task.schedule.type === 'daily';
    return h('li', { class: classes },
      h('span', { class: 'task-time' }, task.schedule.time),
      h('span', { class: 'task-title' }, task.title,
        item.enabled === false ? h('span', { class: 'badge' }, 'Désactivée') : null,
        task.last_status ? h('div', { class: 'task-status' }, `Dernier état : ${task.last_status}`) : null),
      h('div', { class: 'task-actions' },
      toggle('visible', 'Afficher sur la tablette', '👁️'),
      toggle('enabled', 'Activer / désactiver', '⏻'),
      h('button', { class: 'btn btn-secondary btn-small', onclick: async () => {
        const result = await api.runTask(task.id);
        toast(result.started ? 'Tâche lancée' : 'Déjà en cours');
      } }, 'Lancer'),
      h('button', { class: 'btn btn-secondary btn-small', onclick: () => { context.editTask = task; show('creator'); } }, 'Modifier'),
      h('button', { class: 'btn btn-secondary btn-small', onclick: async () => {
        await api.flag(task.id, 'archived', true);
        toast('Archivée');
        load();
      } }, 'Archiver'),
      h('button', { class: 'btn btn-danger btn-small', onclick: async () => {
        const question = isDaily
          ? `Supprimer « ${task.title} » seulement le ${currentDate} ?\n\nElle continue les autres jours. Pour supprimer toute la répétition : Modifier → Supprimer.`
          : `Supprimer définitivement « ${task.title} » ?`;
        if (!window.confirm(question)) return;
        await api.skipDay(task.id, currentDate, true);
        toast(isDaily ? 'Supprimée pour ce jour' : 'Tâche supprimée');
        load();
      } }, 'Supprimer')),
    );
  };

  root.append(h('section', { class: 'panel' }, banner, list));
  await load();
};
