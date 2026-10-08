import { openTemplates } from './templates.js';
import { askUpload } from './upload-dialog.js';
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

const dayTitle = (iso, today) => {
  const next = new Date(`${today}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const capital = label.charAt(0).toUpperCase() + label.slice(1);
  if (iso === today) return `Aujourd'hui · ${capital}`;
  return iso === tomorrow ? `Demain · ${capital}` : capital;
};

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
  schedule: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], date: todayIso(), time: '08:00' },
  root: newNode('Nouvelle tâche'),
  last_run_date: '',
  last_status: '',
});

export const renderCreator = async (root, context, show) => {
  const [config, initialMedia, entities] = await Promise.all([api.config(), api.media(), loadEntities()]);
  let media = initialMedia;
  const caregivers = config.users.filter((user) => user.role === 'aidant');
  let draft = context.editTask ? structuredClone(context.editTask) : null;
  const isEdit = Boolean(context.editTask);
  const editedTask = context.editTask;
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

  // Un modèle importé reçoit de nouveaux identifiants : il peut être importé plusieurs fois.
  const freshNode = (node) => ({
    ...structuredClone(node),
    id: makeId('n'),
    children: node.children.map((child) => ({ ...structuredClone(child), node: freshNode(child.node) })),
  });

  const importTemplate = (template) => {
    const node = freshNode(template.root);
    if (!draft) {
      draft = newTask();
      draft.title = node.title || template.name;
      draft.root = node;
    } else {
      const target = findNode(draft.root, selectedId) || draft.root;
      target.children.push({
        trigger: target.question ? 'yes' : 'sensor',
        sensor: { entity_id: '', state: 'on', repeat_minutes: 10 },
        node,
      });
    }
    selectedId = node.id;
    draw();
    toast(`Modèle « ${template.name} » importé`);
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

  // Envoi d'un média (fichier ou capture du téléphone) puis sélection automatique du fichier ajouté.
  const friendly = (file) => (file.deletable ? file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') : file.path);

  const uploadFor = async (node, original, progress) => {
    const file = await askUpload(original, node.media.kind);
    if (!file) return;
    try {
      const added = await api.uploadMedia(file, (ratio) => { progress.value = ratio; progress.hidden = false; });
      media = await api.media();
      node.media.content_id = added.content_id;
      node.media.label = added.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      toast('Fichier ajouté');
      draw();
    } catch (error) {
      progress.hidden = true;
      toast(`Envoi impossible : ${error.message}`);
    }
  };

  const mediaBlock = (node) => {
    const isVideo = node.media.kind === 'video';
    const files = media.filter((file) => file.kind === node.media.kind);
    const current = files.find((file) => file.content_id === node.media.content_id);
    const control = files.length
      ? h('select', { onchange: (event) => {
        node.media.content_id = event.target.value;
        node.media.label = event.target.selectedOptions[0].textContent;
        refreshSaveState();
        draw();
      } }, files.map((file) => h('option', {
        value: file.content_id, selected: file.content_id === node.media.content_id,
      }, friendly(file))))
      : h('input', { type: 'text', value: node.media.content_id, placeholder: 'media-source://media_source/local/…',
        oninput: bind(node.media, 'content_id') });
    if (files.length && !node.media.content_id) {
      node.media.content_id = files[0].content_id;
      node.media.label = files[0].name;
    }
    const progress = h('progress', { class: 'upload-progress', max: 1, value: 0, hidden: true });
    const picker = (accept, capture) => h('input', { type: 'file', accept, capture, hidden: true,
      onchange: (event) => {
        const [file] = event.target.files;
        event.target.value = '';
        if (file) uploadFor(node, file, progress);
      } });
    const fileInput = picker(isVideo ? 'video/*,.mp4,.webm,.mov,.mkv,.m4v,.3gp' : 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus');
    // Plan B retenu : l'application caméra / dictaphone du téléphone, qui évite les restrictions de l'iframe.
    const captureInput = picker(isVideo ? 'video/*' : 'audio/*', isVideo ? 'environment' : true);
    return h('div', { class: `node-block node-block-${node.media.kind}` },
      h('div', { class: 'row' },
        field(isVideo ? 'Vidéo' : 'Audio', control),
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => {
          node.media = { kind: 'none', content_id: '', label: '' };
          draw();
        } }, 'Retirer')),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => fileInput.click() }, '⬆️ Ajouter un fichier'),
        h('button', { class: 'btn btn-secondary btn-small', onclick: () => captureInput.click() },
          isVideo ? '📹 Filmer avec le téléphone' : '🎙️ Enregistrer avec le téléphone'),
        current?.deletable ? h('button', { class: 'btn btn-danger btn-small', onclick: async () => {
          if (!window.confirm(`Supprimer définitivement « ${friendly(current)} » ?`)) return;
          await api.deleteMedia(current.path);
          media = await api.media();
          node.media.content_id = '';
          node.media.label = '';
          draw();
        } }, '🗑️ Supprimer ce fichier') : null,
        fileInput, captureInput, progress));
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
      onclick: (event) => {
        event.stopPropagation();
        selectedId = node.id;
        // Un clic sur un champ ne doit pas redessiner la carte : le champ serait remplacé avant d'avoir réagi.
        if (event.target.closest('input, select, textarea, button, label, video, audio')) return;
        draw();
      } },
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
          sched.days = sched.days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6];
          draw();
        } }, sched.days.length === 7 ? 'Aucun jour' : 'Tous les jours')) : null,
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
    let events = [];
    const hasCalendars = (config.settings.calendar_entities || []).length > 0;
    const drawEvents = () => {
      clear(box);
      if (!hasCalendars) {
        box.append(h('p', { class: 'hint' }, 'Aucun calendrier coché : voir Configuration → Calendriers.'));
        return;
      }
      const today = todayIso();
      const byDay = new Map();
      events.forEach((event) => (event.days || []).forEach((day) => {
        if (day < today) return;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(event);
      }));
      if (!byDay.size) box.append(h('p', { class: 'hint' }, 'Aucun événement à venir.'));
      [...byDay.keys()].sort().forEach((day) => {
        const items = byDay.get(day).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        box.append(h('div', { class: 'event-day' },
          h('h3', { class: 'event-day-title' }, dayTitle(day, today)),
          items.map((event) => h('label', { class: 'event-row' },
            h('input', { type: 'checkbox', checked: !event.hidden, onchange: async (change) => {
              event.hidden = !change.target.checked;
              await api.saveHiddenEvents(events.filter((item) => item.hidden).map((item) => item.key));
              toast(event.hidden ? 'Événement masqué' : 'Événement affiché');
              drawEvents();
            } }),
            h('span', { class: 'event-time' }, event.time || ''),
            h('span', { class: 'event-title' }, event.summary)))));
      });
    };
    const load = async (refresh) => {
      try { events = refresh ? await api.refreshCalendar() : await api.calendar(); } catch (error) { events = []; }
      drawEvents();
    };
    load(false);
    return h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Événements des calendriers'),
      h('p', { class: 'hint' },
        'Les événements des calendriers cochés dans Configuration arrivent automatiquement dans le fil de la tablette. Décoche ceux que tu veux masquer.'),
      hasCalendars ? h('button', { class: 'btn btn-secondary btn-small', onclick: () => load(true) }, '🔄 Actualiser') : null,
      box);
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
        }, `${tile.icon} ${tile.label}`)),
        h('div', { class: 'tile tile-template', onclick: () => openTemplates(importTemplate) }, '📚 Modèles'))),
      ...(draft ? [h('section', { class: 'panel' }, scheduleForm())] : []),
      canvas,
      h('div', { class: 'canvas-actions' },
        h('button', { class: 'btn btn-danger', onclick: () => { draft = null; selectedId = ''; draw(); } }, '🗑 Effacer'),
        isEdit ? h('button', { class: 'btn btn-danger', onclick: async () => {
          const task = editedTask;
          if (!window.confirm(`Supprimer « ${task.title} » définitivement, pour TOUS les jours ?\n\nCette action est irréversible.`)) return;
          await api.deleteTask(task.id);
          toast('Tâche supprimée');
          show('timeline');
        } }, '🗑 Supprimer toute la tâche (tous les jours)') : null,
        saveButton),
      calendarPanel());
  };

  draw();
};
