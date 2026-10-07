import { api } from './api.js';
import { h, clear, field, toast } from './dom.js';
import { entityChecklist, loadEntities } from './picker.js';
import { openForm } from './modal.js';

const NUMBER_SETTINGS = [
  ['question_seconds', 'Durée d\'affichage d\'une question (secondes)'],
  ['screen_wait_seconds', 'Attente après allumage de l\'écran (secondes)'],
  ['start_timeout_seconds', 'Délai avant de juger qu\'une lecture n\'a pas démarré (secondes)'],
  ['call_unanswered_seconds', 'Un appel plus court que ceci est considéré sans réponse (secondes)'],
  ['call_max_seconds', 'Durée maximale attendue pour un appel (secondes)'],
  ['sensor_loop_max_runs', 'Nombre maximal de répétitions d\'une sous-tâche liée à un capteur'],
  ['days_published', 'Nombre de jours publiés pour la tablette'],
  ['grace_minutes', 'Retard toléré au lancement d\'une tâche (minutes)'],
];

const makeId = (prefix) => prefix + Math.random().toString(16).slice(2, 10);

const DOMAINS = {
  media: ['media_player'],
  screen: ['light', 'switch'],
  callSensor: ['sensor'],
  presence: ['binary_sensor', 'sensor'],
  other: ['sensor', 'binary_sensor', 'input_boolean', 'input_select', 'person', 'switch', 'light'],
  calendar: ['calendar'],
};

const textInput = (object, key, listId) => h('input', {
  type: 'text', value: object[key] || '', list: listId,
  oninput: (event) => { object[key] = event.target.value; },
});

export const renderSettings = async (root) => {
  const config = await api.config();
  const entities = await loadEntities();
  const page = h('div');
  root.append(page);

  const nameOf = (id) => {
    const entity = entities.find((item) => item.entity_id === id);
    return entity ? `${entity.name} (${id})` : id;
  };
  const line = (icon, text) => (text ? h('span', { class: 'config-card-line' }, `${icon} ${text}`) : null);

  // Carte d'un élément de configuration avec ses boutons Modifier / Supprimer.
  const card = (title, lines, onEdit, onDelete) => h('div', { class: 'config-card' },
    h('div', { class: 'config-card-main' }, h('span', { class: 'config-card-title' }, title), lines),
    h('div', { class: 'config-card-actions' },
      h('button', { class: 'btn btn-secondary btn-small', onclick: onEdit }, 'Modifier'),
      h('button', { class: 'btn btn-danger btn-small', onclick: onDelete }, 'Supprimer')));

  const list = (items, empty) => (items.length
    ? h('div', { class: 'config-list' }, items)
    : h('p', { class: 'config-empty' }, empty));

  // ---- Pièces ----
  const ROOM_FIELDS = [
    { key: 'name', label: 'Nom de la pièce', help: 'Par exemple : Salon, Chambre.', kind: 'text', required: true },
    { key: 'media_player', label: 'Lecteur de la tablette', kind: 'entity', domains: DOMAINS.media, required: true,
      help: 'Le lecteur média (media_player) qui joue les vidéos et les sons sur cette tablette.' },
    { key: 'screen', label: 'Écran de la tablette', kind: 'entity', domains: DOMAINS.screen, allowEmpty: true,
      help: 'L\'entité qui allume l\'écran, souvent « … Screen ». Sans elle, l\'écran n\'est pas allumé avant une lecture.' },
    { key: 'call_sensor', label: 'État d\'appel de la tablette', kind: 'entity', domains: DOMAINS.callSensor, allowEmpty: true,
      help: 'Le capteur de l\'extension SIP : il passe à « Busy » quand la tablette est en appel.' },
    { key: 'extension', label: 'Extension SIP de la tablette', kind: 'text', help: 'Par exemple : 102. Sert à appeler cette tablette en cas d\'escalade.' },
    { key: 'browser_id', label: 'Identifiant du navigateur (Browser ID)', kind: 'text',
      help: 'L\'identifiant Browser Mod de cette tablette, pour y ouvrir les fenêtres plein écran.' },
    { key: 'presence_sensor', label: 'Détecteur de présence', kind: 'entity', domains: DOMAINS.presence, allowEmpty: true,
      help: 'Facultatif : radar ou capteur de mouvement de cette pièce.' },
    { key: 'is_default', label: 'Tablette par défaut', kind: 'checkbox',
      help: 'Utilisée pour les appels quand personne n\'est détecté.' },
  ];

  const editRoom = (room) => {
    const isNew = !room;
    const base = room || { id: makeId('r'), name: '', extension: '', media_player: '', screen: '',
      call_sensor: '', browser_id: '', presence_sensor: '' };
    openForm({
      title: isNew ? 'Ajouter une pièce' : `Modifier : ${base.name}`,
      values: { ...base, is_default: config.default_room_id === base.id },
      fields: ROOM_FIELDS, entities,
      onSave: ({ is_default: isDefault, ...values }) => {
        const index = config.rooms.findIndex((item) => item.id === values.id);
        if (index >= 0) config.rooms[index] = values; else config.rooms.push(values);
        if (isDefault) config.default_room_id = values.id;
        else if (config.default_room_id === values.id) config.default_room_id = '';
        draw();
      },
    });
  };

  const removeRoom = (room) => {
    if (!window.confirm(`Supprimer la pièce « ${room.name} » ?`)) return;
    config.rooms = config.rooms.filter((item) => item.id !== room.id);
    if (config.default_room_id === room.id) config.default_room_id = '';
    draw();
  };

  const roomsList = () => list(config.rooms.map((room) => card(
    `${room.name || 'Sans nom'}${config.default_room_id === room.id ? ' ⭐ tablette par défaut' : ''}`,
    [line('🎬', room.media_player && nameOf(room.media_player)), line('💡', room.screen && nameOf(room.screen)),
      line('📞', [room.extension && `extension ${room.extension}`, room.call_sensor && nameOf(room.call_sensor)]
        .filter(Boolean).join(' — ')),
      line('🌐', room.browser_id && `Browser ID : ${room.browser_id}`),
      line('🚶', room.presence_sensor && nameOf(room.presence_sensor))],
    () => editRoom(room), () => removeRoom(room))), 'Aucune pièce : ajoutes-en une.');

  // ---- Aidants ----
  const editCaregiver = (person) => {
    const isNew = !person;
    openForm({
      title: isNew ? 'Ajouter un aidant' : `Modifier : ${person.name}`,
      values: person || { id: makeId('c'), name: '', extension: '' },
      fields: [
        { key: 'name', label: 'Nom de l\'aidant', kind: 'text', required: true, help: 'Par exemple : Mathieu.' },
        { key: 'extension', label: 'Extension SIP à appeler', kind: 'text', required: true,
          help: 'Par exemple : 100. C\'est l\'extension appelée en cas d\'escalade.' },
      ],
      entities,
      onSave: (values) => {
        const index = config.caregivers.findIndex((item) => item.id === values.id);
        if (index >= 0) config.caregivers[index] = values; else config.caregivers.push(values);
        draw();
      },
    });
  };

  const caregiversList = () => list(config.caregivers.map((person) => card(
    person.name || 'Sans nom', [line('📞', person.extension && `extension ${person.extension}`)],
    () => editCaregiver(person),
    () => {
      if (!window.confirm(`Supprimer l'aidant « ${person.name} » ?`)) return;
      config.caregivers = config.caregivers.filter((item) => item.id !== person.id);
      draw();
    })), 'Aucun aidant : ajoutes-en un.');

  // ---- Catalogue ----
  const CATALOG_TYPES = [{ value: 'presence', label: 'Capteur de présence' }, { value: 'sensor', label: 'Autre capteur' }];
  const editCatalogItem = (item) => {
    const isNew = !item;
    openForm({
      title: isNew ? 'Ajouter une entité au catalogue' : `Modifier : ${item.name}`,
      values: item || { id: makeId('e'), entity_id: '', name: '', type: 'presence' },
      fields: [
        { key: 'type', label: 'Type', kind: 'select', options: CATALOG_TYPES, rerender: true,
          help: 'Présence : radar, onMotion Fully… Autre capteur : sert de condition pour une sous-tâche.' },
        { key: 'entity_id', label: 'Entité Home Assistant', kind: 'entity', required: true,
          domainsFor: (values) => (values.type === 'presence' ? DOMAINS.presence : DOMAINS.other) },
        { key: 'name', label: 'Nom parlant', kind: 'text', required: true, help: 'Par exemple : Présence lit.' },
      ],
      entities,
      onSave: (values) => {
        const index = config.catalog.findIndex((entry) => entry.id === values.id);
        if (index >= 0) config.catalog[index] = values; else config.catalog.push(values);
        draw();
      },
    });
  };

  const catalogList = () => list(config.catalog.map((item) => card(
    item.name || 'Sans nom',
    [line('🏷️', CATALOG_TYPES.find((type) => type.value === item.type)?.label), line('📡', nameOf(item.entity_id))],
    () => editCatalogItem(item),
    () => {
      if (!window.confirm(`Retirer « ${item.name} » du catalogue ?`)) return;
      config.catalog = config.catalog.filter((entry) => entry.id !== item.id);
      draw();
    })), 'Catalogue vide : ajoutes-y des capteurs.');

  const settingsForm = () => {
    const settings = config.settings;
    return h('div', {},
      h('div', { class: 'row' }, NUMBER_SETTINGS.map(([key, label]) => field(label,
        h('input', { type: 'number', min: 0, step: 'any', value: settings[key],
          oninput: (event) => { settings[key] = Number(event.target.value); } })))),
      h('div', { class: 'row' },
        field('Page du dashboard à retrouver après un appel d\'escalade (chemin, facultatif)', textInput(settings, 'tablet_home_path')),
        field('Modèle d\'URL pour lancer un appel ({extension} est remplacé)', textInput(settings, 'call_url_template'))),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Calendriers à proposer dans le créateur de tâches'),
        entityChecklist({ entities, domains: DOMAINS.calendar, values: settings.calendar_entities || [],
          onChange: (values) => { settings.calendar_entities = values; } })),
      h('label', { class: 'field' },
        h('span', { class: 'field-label' }, 'Style du popup vidéo (CSS injecté par Browser Mod ; sert à masquer les contrôles du lecteur)'),
        h('textarea', { rows: 10, oninput: (event) => { settings.video_style = event.target.value; } }, settings.video_style)));
  };

  const save = async () => {
    config.catalog.forEach((item) => { item.id = item.id || makeId('e'); });
    await api.saveConfig(config);
    toast('Configuration enregistrée');
  };

  const draw = () => {
    clear(page);
    page.append(
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Pièces et tablettes'),
        h('p', { class: 'hint' }, 'Une tablette par pièce. Rien n\'est écrit en dur : ajoute, modifie ou supprime à volonté. N\'oublie pas d\'enregistrer en bas de page.'),
        roomsList(),
        h('button', { class: 'btn btn-secondary', onclick: () => editRoom(null) }, '＋ Ajouter une pièce')),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Aidants'),
        h('p', { class: 'hint' }, 'Seuls les aidants déclarés ici peuvent être appelés en cas d\'escalade.'),
        caregiversList(),
        h('button', { class: 'btn btn-secondary', onclick: () => editCaregiver(null) }, '＋ Ajouter un aidant')),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Catalogue d\'entités'),
        h('p', { class: 'hint' }, 'Donne un nom parlant aux capteurs : présence (radar, onMotion Fully…) ou autres capteurs pour les sous-tâches.'),
        catalogList(),
        h('button', { class: 'btn btn-secondary', onclick: () => editCatalogItem(null) }, '＋ Ajouter une entité')),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Paramètres généraux'),
        settingsForm()),
      h('div', { class: 'canvas-actions' }, h('span'), h('button', { class: 'btn', onclick: save }, 'Enregistrer la configuration')));
  };

  draw();
};
