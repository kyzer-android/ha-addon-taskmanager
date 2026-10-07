import { api } from './api.js';
import { h, clear, field, toast, todayIso } from './dom.js';
import { entityPicker, loadEntities } from './picker.js';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const TRIGGER_LABELS = {
  yes: 'Si réponse OUI',
  no: 'Si réponse NON',
  no_answer: 'Si aucune réponse',
  sensor: 'Tant qu\'un capteur est actif',
};
const TILES = [
  { id: 'task', label: 'Tâche', icon: '✔️', cls: 'tile-task' },
  { id: 'question', label: 'Question', icon: '❓', cls: 'tile-question' },
  { id: 'audio', label: 'Audio', icon: '🔊', cls: 'tile-audio' },
  { id: 'video', label: 'Vidéo', icon: '▶️', cls: 'tile-video' },
  { id: 'subtask', label: 'Sous-tâche', icon: '☰', cls: 'tile-subtask' },
];

const makeId = (prefix) => prefix + Math.random().toString(16).slice(2, 10);

const newNode = (title = '') => ({
  id: makeId('n'),
  title,
  media: { kind: 'none', content_id: '', label: '' },
  question: null,
  escalation: { enabled: false, caregiver_ids: [] },
  children: [],
});

const newTask = () => ({
  id: makeId('t'),
  title: 'Nouvelle tâche',
  enabled: true,
  visible: true,
  archived: false,
  schedule: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], date: todayIso(), time: '08:00' },
  root: newNode('Nouvelle tâche'),
  last_run_date: '',
  last_status: '',
});

export const renderCreator = async (root, context, show) => {
  const [config, media, entities] = await Promise.all([api.config(), api.media(), loadEntities()]);
  const caregivers = config.users.filter((user) => user.role === 'aidant');
  let draft = context.editTask ? structuredClone(context.editTask) : null;
  const isEdit = Boolean(context.editTask);
  context.editTask = null;
  let selectedId = draft ? draft.root.id : '';

  const page = h('div');
  root.append(page);

  const applyTile = (node, tileId) => {
    if (tileId === 'video' || tileId === 'audio') {
      node.media.kind = tileId;
      const first = media.find((file) => file.kind === tileId);
      if (!node.media.content_id && first) {
        node.media.content_id = first.content_id;
        node.media.label = first.name;
      }
    } else if (tileId === 'question') {
      node.question = node.question || { text: 'Tout va bien ?', repeats: 0, delay_minutes: 5 };
    } else if (tileId === 'subtask') {
      node.children.push({
        trigger: node.question ? 'yes' : 'sensor',
        sensor: { entity_id: '', state: 'on', repeat_minutes: 10 },
        node: newNode('Sous-tâche'),
      });
    }
  };

  const dropOn = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    const tileId = event.dataTransfer.getData('text/plain');
    if (!TILES.some((tile) => tile.id === tileId)) return;
    if (!draft) draft = newTask();
    applyTile(node || draft.root, tileId);
    selectedId = (node || draft.root).id;
    draw();
  };

  const tapTile = (tileId) => {
    if (!draft) draft = newTask();
    const target = findNode(draft.root, selectedId) || draft.root;
    applyTile(target, tileId);
    selectedId = target.id;
    draw();
  };

  const findNode = (node, id) => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findNode(child.node, id);
      if (found) return found;
    }
    return null;
  };

  const bind = (object, key, transform = (value) => value) => (event) => {
    object[key] = transform(event.target.value);
    refreshSaveState();
  };

  const mediaBlock = (node) => {
    const files = media.filter((file) => file.kind === node.media.kind);
    const control = files.length
      ? h('select', { onchange: (event) => {
        node.media.content_id = event.target.value;
        node.media.label = event.target.selectedOptions[0].textContent;
        refreshSaveState();
      } }, files.map((file) => h('option', {
        value: file.content_id, selected: file.content_id === node.media.content_id,
      }, file.path)))
      : h('input', { type: 'text', value: node.media.content_id, placeholder: 'media-source://media/…',
        oninput: bind(node.media, 'content_id') });
    if (files.length && !node.media.content_id) {
      node.media.content_id = files[0].content_id;
      node.media.label = files[0].name;
    }
    return h('div', { class: `node-block node-block-${node.media.kind}` },
      h('div', { class: 'row' },
        field(node.media.kind === 'video' ? 'Vidéo' : 'Audio', control),
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => {
          node.media = { kind: 'none', content_id: '', label: '' };
          draw();
        } }, 'Retirer')));
  };

  const questionBlock = (node) => h('div', { class: 'node-block node-block-question' },
    h('div', { class: 'row' },
      field('Question posée', h('input', { type: 'text', value: node.question.text, oninput: bind(node.question, 'text') })),
      field('Répétitions', h('input', { type: 'number', min: 0, value: node.question.repeats,
        oninput: bind(node.question, 'repeats', Number) })),
      field('Délai entre répétitions (min)', h('input', { type: 'number', min: 0, step: 0.5, value: node.question.delay_minutes,
        oninput: bind(node.question, 'delay_minutes', Number) })),
      h('button', { class: 'btn btn-secondary btn-small', onclick: () => {
        node.question = null;
        node.escalation = { enabled: false, caregiver_ids: [] };
        draw();
      } }, 'Retirer')),
    h('label', { class: 'row' },
      h('input', { type: 'checkbox', checked: node.escalation.enabled, onchange: (event) => {
        node.escalation.enabled = event.target.checked;
        draw();
      } }),
      'Appeler si personne ne répond'),
    node.escalation.enabled ? h('div', { class: 'row' },
      caregivers.length ? caregivers.map((person) => h('label', { class: 'row' },
        h('input', { type: 'checkbox', checked: node.escalation.caregiver_ids.includes(person.id),
          onchange: (event) => {
            const ids = new Set(node.escalation.caregiver_ids);
            if (event.target.checked) ids.add(person.id); else ids.delete(person.id);
            node.escalation.caregiver_ids = [...ids];
          } }),
        `${person.name} (${person.extension})`))
        : h('span', { class: 'hint' }, 'Aucun aidant déclaré : voir Configuration.')) : null);

  const childBlock = (node, child, index) => h('div', { class: 'child-branch' },
    h('div', { class: 'row' },
      field('Déclencheur', h('select', { onchange: (event) => { child.trigger = event.target.value; draw(); } },
        Object.entries(TRIGGER_LABELS).map(([value, label]) => h('option', {
          value, selected: child.trigger === value }, label)))),
      h('button', { class: 'btn btn-danger btn-small', onclick: () => {
        node.children.splice(index, 1);
        draw();
      } }, 'Supprimer la sous-tâche')),
    child.trigger === 'sensor' ? h('div', { class: 'row' },
      field('Capteur', entityPicker({
        entities, value: child.sensor.entity_id, pinned: config.catalog.map((item) => item.entity_id),
        domains: ['sensor', 'binary_sensor', 'input_boolean', 'input_select', 'person', 'switch', 'light'],
        onChange: (entityId) => { child.sensor.entity_id = entityId; } })),
      field('État attendu', h('input', { type: 'text', value: child.sensor.state, oninput: bind(child.sensor, 'state') })),
      field('Rejouer toutes les (min)', h('input', { type: 'number', min: 0.1, step: 0.5, value: child.sensor.repeat_minutes,
        oninput: bind(child.sensor, 'repeat_minutes', Number) }))) : null,
    renderNode(child.node, false));

  const renderNode = (node, isRoot) => {
    const card = h('div', { class: `node-card ${selectedId === node.id ? 'is-selected' : ''}`,
      ondragover: (event) => { event.preventDefault(); event.stopPropagation(); card.classList.add('is-over'); },
      ondragleave: () => card.classList.remove('is-over'),
      ondrop: (event) => dropOn(event, node),
      onclick: (event) => { event.stopPropagation(); selectedId = node.id; draw(); } },
    h('div', { class: 'row' },
      field(isRoot ? 'Titre de la tâche' : 'Titre de la sous-tâche',
        h('input', { type: 'text', value: isRoot ? draft.title : node.title,
          oninput: (event) => {
            if (isRoot) { draft.title = event.target.value; node.title = event.target.value; }
            else node.title = event.target.value;
            refreshSaveState();
          },
          onclick: (event) => event.stopPropagation() }))),
    node.media.kind !== 'none' ? mediaBlock(node) : null,
    node.question ? questionBlock(node) : null,
    node.children.map((child, index) => childBlock(node, child, index)));
    return card;
  };

  const scheduleForm = () => {
    const sched = draft.schedule;
    return h('div', {},
      h('div', { class: 'row' },
        field('Type', h('select', { onchange: (event) => { sched.type = event.target.value; draw(); } },
          h('option', { value: 'daily', selected: sched.type === 'daily' }, 'Journalière'),
          h('option', { value: 'once', selected: sched.type === 'once' }, 'Unique (un jour précis)'))),
        field('Heure', h('input', { type: 'time', value: sched.time, oninput: bind(sched, 'time') })),
        sched.type === 'once' ? field('Date', h('input', { type: 'date', value: sched.date, oninput: bind(sched, 'date') })) : null),
      sched.type === 'daily' ? h('div', { class: 'row' },
        DAY_LABELS.map((label, index) => h('button', {
          class: `chip ${sched.days.includes(index) ? 'is-on' : ''}`,
          onclick: () => {
            const days = new Set(sched.days);
            if (days.has(index)) days.delete(index); else days.add(index);
            sched.days = [...days].sort();
            draw();
          } }, label)),
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => {
          sched.days = [0, 1, 2, 3, 4, 5, 6];
          draw();
        } }, 'Tous les jours')) : null,
      h('div', { class: 'row' },
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: draft.visible,
          onchange: (event) => { draft.visible = event.target.checked; } }), '👁️ Visible sur la tablette'),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: draft.enabled,
          onchange: (event) => { draft.enabled = event.target.checked; } }), 'Activée')));
  };

  const isValid = () => {
    if (!draft) return false;
    const { root: node, schedule: sched } = draft;
    const hasContent = (node.media.kind !== 'none' && node.media.content_id) || node.question;
    const scheduleOk = sched.type === 'once' ? Boolean(sched.date) : sched.days.length > 0;
    return Boolean(draft.title.trim()) && Boolean(hasContent) && scheduleOk;
  };

  let saveButton = null;
  const refreshSaveState = () => { if (saveButton) saveButton.disabled = !isValid(); };

  const save = async () => {
    draft.root.title = draft.root.title || draft.title;
    await api.saveTask(draft);
    toast(isEdit ? 'Tâche enregistrée' : 'Tâche créée');
    draft = null;
    show('timeline');
  };

  const calendarPanel = () => {
    const box = h('div');
    const panel = h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Événements du calendrier'),
      h('p', { class: 'hint' },
        'Choisis ceux qui s\'affichent dans le fil de la journée sur la tablette. Les calendriers se déclarent dans Configuration.'),
      h('button', { class: 'btn btn-secondary', onclick: async () => {
        clear(box);
        const events = await api.calendar();
        if (!events.length) box.append(h('p', { class: 'hint' }, 'Aucun événement à venir (ou aucun calendrier déclaré).'));
        events.forEach((event) => {
          const checkbox = h('input', { type: 'checkbox', checked: event.shown });
          checkbox.addEventListener('change', async () => {
            const selected = events.filter((_, i) => boxes[i].checked);
            await api.saveShownEvents(selected);
            toast('Fil mis à jour');
          });
          boxes.push(checkbox);
          box.append(h('label', { class: 'row' }, checkbox, `${event.start.replace('T', ' ').slice(0, 16)} · ${event.summary}`));
        });
      } }, 'Charger les événements'),
      box);
    const boxes = [];
    return panel;
  };

  const draw = () => {
    clear(page);
    const canvas = h('div', { class: 'canvas',
      ondragover: (event) => { event.preventDefault(); canvas.classList.add('is-over'); },
      ondragleave: () => canvas.classList.remove('is-over'),
      ondrop: (event) => { canvas.classList.remove('is-over'); dropOn(event, null); },
      onclick: () => { if (draft) { selectedId = draft.root.id; draw(); } } },
    draft ? renderNode(draft.root, true)
      : h('div', { class: 'canvas-empty' }, '＋ Glissez des tuiles ici (ou touchez une tuile)'));
    saveButton = h('button', { class: 'btn', disabled: !isValid(), onclick: save },
      isEdit ? '✓ Enregistrer' : '✓ Créer la tâche');
    page.append(
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, isEdit ? 'Modifier la tâche' : 'Créateur de tâches'),
        h('p', { class: 'hint' }, 'Glissez les tuiles sur le canvas. Sur téléphone, touchez une tuile : elle s\'ajoute à la carte sélectionnée.'),
        h('div', { class: 'palette' }, TILES.map((tile) => h('div', {
          class: `tile ${tile.cls}`, draggable: true,
          ondragstart: (event) => event.dataTransfer.setData('text/plain', tile.id),
          onclick: () => tapTile(tile.id),
        }, `${tile.icon} ${tile.label}`)))),
      draft ? h('section', { class: 'panel' }, scheduleForm()) : null,
      canvas,
      h('div', { class: 'canvas-actions' },
        h('button', { class: 'btn btn-danger', onclick: () => { draft = null; selectedId = ''; draw(); } }, '🗑 Effacer'),
        saveButton),
      calendarPanel());
  };

  draw();
};
