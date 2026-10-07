import { api } from './api.js';
import { h, clear, field, toast } from './dom.js';

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

const textInput = (object, key, listId) => h('input', {
  type: 'text', value: object[key] || '', list: listId,
  oninput: (event) => { object[key] = event.target.value; },
});

export const renderSettings = async (root) => {
  const config = await api.config();
  const page = h('div');
  root.append(page);

  const roomsTable = () => h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['Pièce', 'Extension SIP', 'Lecteur (media_player)', 'Écran', 'Capteur d\'appel',
      'Browser ID', 'Capteur de présence', 'Par défaut', ''].map((label) => h('th', {}, label)))),
    h('tbody', {}, config.rooms.map((room, index) => h('tr', {},
      h('td', {}, textInput(room, 'name')),
      h('td', {}, textInput(room, 'extension')),
      h('td', {}, textInput(room, 'media_player', 'entityList')),
      h('td', {}, textInput(room, 'screen', 'entityList')),
      h('td', {}, textInput(room, 'call_sensor', 'entityList')),
      h('td', {}, textInput(room, 'browser_id')),
      h('td', {}, textInput(room, 'presence_sensor', 'entityList')),
      h('td', {}, h('input', { type: 'radio', name: 'defaultRoom', checked: config.default_room_id === room.id,
        onchange: () => { config.default_room_id = room.id; } })),
      h('td', {}, h('button', { class: 'btn btn-danger btn-small', onclick: () => {
        config.rooms.splice(index, 1);
        draw();
      } }, '✕')))))));

  const caregiversTable = () => h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['Nom', 'Extension SIP', ''].map((label) => h('th', {}, label)))),
    h('tbody', {}, config.caregivers.map((person, index) => h('tr', {},
      h('td', {}, textInput(person, 'name')),
      h('td', {}, textInput(person, 'extension')),
      h('td', {}, h('button', { class: 'btn btn-danger btn-small', onclick: () => {
        config.caregivers.splice(index, 1);
        draw();
      } }, '✕')))))));

  const catalogTable = () => h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['Entité HA', 'Nom parlant', 'Type', ''].map((label) => h('th', {}, label)))),
    h('tbody', {}, config.catalog.map((item, index) => h('tr', {},
      h('td', {}, textInput(item, 'entity_id', 'entityList')),
      h('td', {}, textInput(item, 'name')),
      h('td', {}, h('select', { onchange: (event) => { item.type = event.target.value; } },
        h('option', { value: 'presence', selected: item.type === 'presence' }, 'Capteur de présence'),
        h('option', { value: 'sensor', selected: item.type !== 'presence' }, 'Autre capteur'))),
      h('td', {}, h('button', { class: 'btn btn-danger btn-small', onclick: () => {
        config.catalog.splice(index, 1);
        draw();
      } }, '✕')))))));

  const settingsForm = () => {
    const settings = config.settings;
    return h('div', {},
      h('div', { class: 'row' }, NUMBER_SETTINGS.map(([key, label]) => field(label,
        h('input', { type: 'number', min: 0, step: 'any', value: settings[key],
          oninput: (event) => { settings[key] = Number(event.target.value); } })))),
      h('div', { class: 'row' },
        field('Page du dashboard à retrouver après un appel d\'escalade (chemin, facultatif)', textInput(settings, 'tablet_home_path')),
        field('Modèle d\'URL pour lancer un appel ({extension} est remplacé)', textInput(settings, 'call_url_template'))),
      h('label', { class: 'field' },
        h('span', { class: 'field-label' }, 'Calendriers à proposer (une entité calendar.* par ligne)'),
        h('textarea', { rows: 3, oninput: (event) => {
          settings.calendar_entities = event.target.value.split('\n').map((line) => line.trim()).filter(Boolean);
        } }, (settings.calendar_entities || []).join('\n'))),
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
        h('p', { class: 'hint' }, 'Une tablette par pièce. Rien n\'est écrit en dur : ajoute, modifie ou supprime à volonté.'),
        roomsTable(),
        h('button', { class: 'btn btn-secondary', onclick: () => {
          config.rooms.push({ id: makeId('r'), name: '', extension: '', media_player: '', screen: '',
            call_sensor: '', browser_id: '', presence_sensor: '' });
          draw();
        } }, '＋ Ajouter une pièce')),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Aidants'),
        h('p', { class: 'hint' }, 'Seuls les aidants déclarés ici peuvent être appelés en cas d\'escalade.'),
        caregiversTable(),
        h('button', { class: 'btn btn-secondary', onclick: () => {
          config.caregivers.push({ id: makeId('c'), name: '', extension: '' });
          draw();
        } }, '＋ Ajouter un aidant')),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Catalogue d\'entités'),
        h('p', { class: 'hint' }, 'Donne un nom parlant aux capteurs : présence (radar, onMotion Fully…) ou autres capteurs pour les sous-tâches.'),
        catalogTable(),
        h('button', { class: 'btn btn-secondary', onclick: () => {
          config.catalog.push({ id: makeId('e'), entity_id: '', name: '', type: 'presence' });
          draw();
        } }, '＋ Ajouter une entité')),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Paramètres généraux'),
        settingsForm()),
      h('div', { class: 'canvas-actions' }, h('span'), h('button', { class: 'btn', onclick: save }, 'Enregistrer la configuration')));
  };

  draw();
};
