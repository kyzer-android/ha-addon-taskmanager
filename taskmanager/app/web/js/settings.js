import { api } from './api.js';
import { h, clear, field, toast } from './dom.js';
import { entityChecklist, loadEntities } from './picker.js';
import { openForm } from './modal.js';
import { imagePicker } from './images.js';

// Paramètres généraux regroupés par thème : chaque champ a une unité et une aide.
const SETTING_GROUPS = [
  { title: 'Questions et lecture', hint: 'Déroulement d\'un rappel sur la tablette.', fields: [
    { key: 'question_seconds', label: 'Durée d\'affichage d\'une question', unit: 'secondes',
      help: 'Temps pendant lequel les boutons OUI / NON restent affichés (60 s par défaut).' },
    { key: 'screen_wait_seconds', label: 'Attente après allumage de l\'écran', unit: 'secondes',
      help: 'Pause avant d\'ouvrir la vidéo, le temps que la tablette se réveille.' },
    { key: 'start_timeout_seconds', label: 'Délai de démarrage d\'une lecture', unit: 'secondes',
      help: 'Si la lecture n\'a pas démarré après ce délai, la fenêtre est fermée et noté au journal.' },
    { key: 'video_height_percent', label: 'Hauteur de la vidéo quand il y a une question', unit: '% de l\'écran',
      help: 'Vidéo + question : la vidéo prend le haut de l\'écran, les boutons OUI / NON sont dessous (80 % par défaut).' },
    { key: 'question_button_height', label: 'Hauteur des boutons sous la vidéo', unit: 'pixels',
      help: 'Taille des boutons OUI / NON affichés sous la vidéo (90 par défaut). Seuls, ils restent énormes.' },
    { key: 'grace_minutes', label: 'Retard toléré au lancement', unit: 'minutes',
      help: 'Une tâche manquée de moins que ce délai est quand même lancée (par exemple après un redémarrage).' },
  ] },
  { title: 'Appels d\'escalade', hint: 'Appel vidéo vers un aidant quand une question reste sans réponse.', fields: [
    { key: 'call_unanswered_seconds', label: 'Appel considéré sans réponse', unit: 'secondes',
      help: 'Un appel plus court que ce délai passe à l\'aidant suivant.' },
    { key: 'call_max_seconds', label: 'Durée maximale attendue d\'un appel', unit: 'secondes',
      help: 'Au-delà, l\'add-on arrête de surveiller l\'appel.' },
    { key: 'call_url_template', label: 'Adresse qui lance l\'appel', kind: 'text',
      help: '{extension} est remplacé par l\'extension appelée. Par défaut : /lovelace/0?call={extension}' },
    { key: 'tablet_home_path', label: 'Page à retrouver après un appel', kind: 'text',
      help: 'Chemin du dashboard de la tablette (facultatif), par exemple /lovelace/0.' },
  ] },
  { title: 'Médias', hint: 'Vidéos et sons ajoutés depuis le Créateur (stockés dans /media/taskmanager).', fields: [
    { key: 'media_max_mb', label: 'Taille maximale d\'un fichier ajouté', unit: 'Mo',
      help: 'Au-delà, l\'envoi est refusé. Une vidéo de téléphone de quelques minutes pèse souvent 50 à 300 Mo.' },
  ] },
  { title: 'Sous-tâches liées à un capteur', hint: 'Rejeu tant qu\'une condition reste vraie (par exemple : toujours au lit).', fields: [
    { key: 'sensor_loop_max_runs', label: 'Nombre maximal de répétitions', unit: 'fois',
      help: 'Garde-fou : arrête le rejeu après ce nombre de passages.' },
  ] },
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

export const renderSettings = async (root) => {
  const config = await api.config();
  const entities = await loadEntities();
  const browsers = await api.browsers().catch(() => []);
  const usersReply = await api.users().catch(() => ({}));
  const haUsers = { available: Boolean(usersReply.available), users: Array.isArray(usersReply.users) ? usersReply.users : [] };
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
      help: 'L\'identifiant Browser Mod de cette tablette, pour y ouvrir les fenêtres plein écran. Choisi parmi les navigateurs connus de Browser Mod.' },
    { key: 'presence_sensor', label: 'Détecteur de présence', kind: 'entity', domains: DOMAINS.presence, allowEmpty: true,
      help: 'Facultatif : radar ou capteur de mouvement de cette pièce.' },
    { key: 'is_default', label: 'Tablette par défaut', kind: 'checkbox',
      help: 'Utilisée pour les appels quand personne n\'est détecté.' },
  ];

  // Liste des navigateurs Browser Mod : évite les fautes de frappe sur le Browser ID.
  const browserField = (spec, current) => {
    if (!browsers.length) {
      return { ...spec, help: `${spec.help} (Liste indisponible : saisie manuelle.)` };
    }
    const known = browsers.some((item) => item.browser_id === current);
    const options = [{ value: '', label: '— Choisir un navigateur —' },
      ...browsers.map((item) => ({ value: item.browser_id,
        label: item.name && item.name !== item.browser_id ? `${item.browser_id} (${item.name})` : item.browser_id }))];
    if (current && !known) options.push({ value: current, label: `⚠️ ${current} (inconnu de Browser Mod)` });
    return { ...spec, kind: 'select', options };
  };

  const editRoom = (room) => {
    const isNew = !room;
    const base = room || { id: makeId('r'), name: '', extension: '', media_player: '', screen: '',
      call_sensor: '', browser_id: '', presence_sensor: '' };
    openForm({
      title: isNew ? 'Ajouter une pièce' : `Modifier : ${base.name}`,
      values: { ...base, is_default: config.default_room_id === base.id },
      fields: ROOM_FIELDS.map((spec) => (spec.key === 'browser_id' ? browserField(spec, base.browser_id) : spec)),
      entities,
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
      line('🌐', room.browser_id && `Browser ID : ${room.browser_id}${browsers.length
        && !browsers.some((item) => item.browser_id === room.browser_id) ? ' ⚠️ inconnu de Browser Mod' : ''}`),
      line('🚶', room.presence_sensor && nameOf(room.presence_sensor))],
    () => editRoom(room), () => removeRoom(room))), 'Aucune pièce : ajoutes-en une.');

  // ---- Utilisateurs ----
  const ROLES = [{ value: 'aidant', label: 'Aidant : interface complète, peut être appelé' },
    { value: 'tablette', label: 'Tablette : vue simplifiée en lecture seule' }];
  const ROLE_LABELS = { aidant: 'Aidant', tablette: 'Tablette' };
  const haUserName = (id) => haUsers.users.find((user) => user.id === id)?.name;

  const editUser = (user) => {
    const isNew = !user;
    const taken = new Set(config.users.filter((item) => item.id !== user?.id).map((item) => item.ha_user_id));
    const accountField = haUsers.available
      ? { key: 'ha_user_id', label: 'Compte Home Assistant', kind: 'select', required: true,
        options: [{ value: '', label: '— choisir un compte —' },
          ...haUsers.users.filter((account) => !taken.has(account.id) || account.id === user?.ha_user_id)
            .map((account) => ({ value: account.id,
              label: `${account.name} (${account.username || 'sans identifiant'})${account.is_admin ? ' — admin' : ''}` }))],
        help: 'Le compte avec lequel la personne ouvre Home Assistant.' }
      : { key: 'ha_user_id', label: 'Identifiant du compte Home Assistant', kind: 'text', required: true,
        help: 'La liste des comptes est indisponible : saisis l\'identifiant interne du compte (Paramètres → Personnes → Utilisateurs).' };
    openForm({
      title: isNew ? 'Ajouter un utilisateur' : `Modifier : ${user.name || 'utilisateur'}`,
      values: user || { id: makeId('u'), ha_user_id: '', name: '', role: 'aidant', extension: '' },
      fields: [
        accountField,
        { key: 'role', label: 'Rôle', kind: 'select', options: ROLES, rerender: true,
          help: 'Un administrateur de Home Assistant voit toujours l\'interface complète.' },
        { key: 'extension', label: 'Extension SIP à appeler', kind: 'text', required: true,
          showIf: (values) => values.role === 'aidant',
          help: 'Par exemple : 100. C\'est l\'extension appelée en cas d\'escalade.' },
      ],
      entities,
      onSave: (values) => {
        const next = { ...values, name: haUserName(values.ha_user_id) || values.name || values.ha_user_id };
        if (next.role !== 'aidant') next.extension = '';
        const index = config.users.findIndex((item) => item.id === next.id);
        if (index >= 0) config.users[index] = next; else config.users.push(next);
        draw();
      },
    });
  };

  const usersList = () => list(config.users.map((user) => card(
    [haUserName(user.ha_user_id) || user.name || 'Sans nom', ' ',
      h('span', { class: 'badge' }, ROLE_LABELS[user.role] || user.role)],
    [user.ha_user_id ? line('🔑', haUsers.users.find((item) => item.id === user.ha_user_id)?.username
      || user.ha_user_id) : h('span', { class: 'badge badge-warning' }, '⚠️ Compte Home Assistant à choisir'),
    line('📞', user.extension && `extension ${user.extension}`)],
    () => editUser(user),
    () => {
      if (!window.confirm(`Supprimer l'utilisateur « ${user.name} » ?`)) return;
      config.users = config.users.filter((item) => item.id !== user.id);
      draw();
    })), 'Aucun utilisateur : tant que la liste est vide, tout le monde voit l\'interface complète.');

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

  const settingField = (spec) => {
    const settings = config.settings;
    const input = spec.kind === 'text'
      ? h('input', { type: 'text', class: 'modal-input', value: settings[spec.key] || '',
        oninput: (event) => { settings[spec.key] = event.target.value; } })
      : h('div', { class: 'unit-input' },
        h('input', { type: 'number', class: 'modal-input', min: 0, step: 'any', value: settings[spec.key],
          oninput: (event) => { settings[spec.key] = Number(event.target.value); } }),
        spec.unit ? h('span', { class: 'unit' }, spec.unit) : null);
    return h('div', { class: 'modal-field' },
      h('span', { class: 'modal-label' }, spec.label),
      spec.help ? h('span', { class: 'modal-help' }, spec.help) : null,
      input);
  };

  const groupPanel = (group) => h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, group.title),
    group.hint ? h('p', { class: 'hint' }, group.hint) : null,
    h('div', { class: 'settings-grid' }, group.fields.map(settingField)));

  const tabletPanel = () => h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Vue tablette'),
    h('p', { class: 'hint' }, 'Le fil du jour que voient les comptes « Tablette ». Aperçu dans l\'onglet « Vue tablette » (enregistre d\'abord).'),
    h('div', { class: 'settings-grid' },
      settingField({ key: 'days_published', label: 'Nombre de jours publiés', unit: 'jours',
        help: 'La vue en montre autant que la largeur de l\'écran le permet.' }),
      settingField({ key: 'tablet_min_day_width', label: 'Largeur minimale d\'un jour', unit: 'pixels',
        help: 'Plus elle est grande, moins il y a de jours côte à côte.' }),
      settingField({ key: 'tablet_font_scale', label: 'Taille des caractères', unit: '× (1 = 30 à 35 px)',
        help: 'Par exemple 0,8 pour réduire, 1,2 pour agrandir.' }),
      h('div', { class: 'modal-field' },
        h('span', { class: 'modal-label' }, 'Affichage du fond'),
        h('select', { class: 'modal-input', onchange: (event) => { config.settings.tablet_background_mode = event.target.value; } },
          [{ value: 'tile', label: 'Mosaïque (motif répété)' }, { value: 'cover', label: 'Image remplissant l\'écran' }]
            .map((option) => h('option', { value: option.value,
              selected: (config.settings.tablet_background_mode || 'tile') === option.value }, option.label))))),
    h('div', { class: 'modal-field' },
      h('span', { class: 'modal-label' }, 'Image de fond'),
      imagePicker({ value: config.settings.tablet_background,
        onChange: (value) => { config.settings.tablet_background = value; } })));

  const calendarPanel = () => h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Calendriers'),
    h('p', { class: 'hint' }, 'Les événements des calendriers cochés sont importés automatiquement dans le fil de la tablette. Les événements à masquer se choisissent dans le Créateur.'),
    entityChecklist({ entities, domains: DOMAINS.calendar, values: config.settings.calendar_entities || [],
      onChange: (values) => { config.settings.calendar_entities = values; } }),
    h('div', { class: 'settings-grid' }, settingField({ key: 'calendar_refresh_minutes', label: 'Actualisation des calendriers',
      unit: 'minutes', help: 'Fréquence de lecture des agendas. Enregistrer la configuration actualise aussi tout de suite.' })));

  const advancedPanel = () => h('details', { class: 'panel' },
    h('summary', { class: 'panel-title' }, 'Avancé : style de la vidéo'),
    h('p', { class: 'hint' }, 'CSS injecté par Browser Mod dans la fenêtre vidéo. Il masque les contrôles du lecteur (pause, barre de progression). À modifier seulement si les contrôles réapparaissent.'),
    h('textarea', { class: 'modal-input', rows: 10, oninput: (event) => { config.settings.video_style = event.target.value; } },
      config.settings.video_style));

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
        h('h2', { class: 'panel-title' }, 'Utilisateurs'),
        h('p', { class: 'hint' }, 'Choisis les comptes Home Assistant et leur rôle. Seuls les aidants (avec une extension) peuvent être appelés en cas d\'escalade. Les administrateurs voient toujours l\'interface complète.'),
        usersList(),
        h('button', { class: 'btn btn-secondary', onclick: () => editUser(null) }, '＋ Ajouter un utilisateur')),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Catalogue d\'entités'),
        h('p', { class: 'hint' }, 'Donne un nom parlant aux capteurs : présence (radar, onMotion Fully…) ou autres capteurs pour les sous-tâches.'),
        catalogList(),
        h('button', { class: 'btn btn-secondary', onclick: () => editCatalogItem(null) }, '＋ Ajouter une entité')),
      ...SETTING_GROUPS.map(groupPanel),
      tabletPanel(),
      calendarPanel(),
      advancedPanel(),
      h('div', { class: 'canvas-actions' }, h('span'), h('button', { class: 'btn', onclick: save }, 'Enregistrer la configuration')));
  };

  draw();
};
