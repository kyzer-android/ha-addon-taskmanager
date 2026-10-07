// Sélecteurs d'entités Home Assistant, sur le modèle de celui de la page Actions de HA :
// icône, nom, appareil / pièce, identifiant, recherche approximative. Aucune saisie libre.
import { api } from './api.js';
import { h } from './dom.js';

const MAX_VISIBLE = 100;
const PANEL_MAX_HEIGHT = 340;
const NO_AREA = 'Sans pièce';

const DOMAIN_ICONS = {
  media_player: '🎬', light: '💡', switch: '🔌', sensor: '📡', binary_sensor: '🚶', calendar: '📅',
  input_boolean: '🔘', input_select: '🔽', person: '🧑', button: '🔲', number: '🔢',
};
const iconFor = (entityId) => DOMAIN_ICONS[entityId.split('.')[0]] || '▫️';

let entitiesPromise = null;

// Liste des entités chargée une seule fois (rechargée si la première tentative échoue).
export const loadEntities = () => {
  if (!entitiesPromise) {
    entitiesPromise = api.entities().catch(() => {
      entitiesPromise = null;
      return [];
    });
  }
  return entitiesPromise;
};

const normalize = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const isSubsequence = (needle, haystack) => {
  let position = 0;
  for (const char of haystack) {
    if (char === needle[position]) position += 1;
    if (position === needle.length) return true;
  }
  return false;
};

// Score de pertinence : 0 = exclu. Tous les mots saisis doivent correspondre (sous-chaîne ou lettres dans l'ordre).
const score = (entity, query) => {
  if (!query) return 1;
  const haystack = normalize(`${entity.name} ${entity.device} ${entity.area} ${entity.entity_id}`);
  const name = normalize(entity.name);
  let total = 0;
  for (const token of query.split(/\s+/).filter(Boolean)) {
    if (name.startsWith(token)) total += 4;
    else if (haystack.includes(token)) total += 3;
    else if (token.length > 2 && isSubsequence(token, haystack)) total += 1;
    else return 0;
  }
  return total;
};

const inDomains = (entity, domains) =>
  !domains || !domains.length || domains.some((domain) => entity.entity_id.startsWith(`${domain}.`));

const subtitle = (entity) => [entity.device, entity.area].filter(Boolean).join(' · ');

const closers = new Set();
document.addEventListener('click', (event) => closers.forEach((close) => close(event.target)));
window.addEventListener('resize', () => closers.forEach((close) => close(null)));
window.addEventListener('scroll', (event) => {
  closers.forEach((close) => close(event.target instanceof Node ? event.target : null));
}, true);

/**
 * options :
 *  - entities  : liste complète [{ entity_id, name, device, area }]
 *  - domains   : préfixes de domaine autorisés (ex. ['media_player'])
 *  - value     : entity_id actuel
 *  - onChange  : (entityId) => void
 *  - pinned    : entity_id à proposer en tête (ex. le catalogue)
 *  - allowEmpty: propose « aucun » (champ facultatif)
 */
export const entityPicker = ({ entities, domains, value, onChange, pinned = [], allowEmpty = false }) => {
  let current = value || '';
  const byId = new Map(entities.map((entity) => [entity.entity_id, entity]));

  const label = h('span', { class: 'picker-label' });
  const button = h('button', { type: 'button', class: 'picker-button' }, label);
  const search = h('input', { type: 'search', class: 'picker-search', placeholder: 'Rechercher…', autocomplete: 'off' });
  const list = h('ul', { class: 'picker-list' });
  const panel = h('div', { class: 'picker-panel', hidden: true }, search, list);
  const root = h('div', { class: 'picker' }, button, panel);

  const refreshButton = () => {
    const entity = byId.get(current);
    const missing = Boolean(current) && !entity && entities.length > 0;
    button.classList.toggle('is-missing', missing);
    label.replaceChildren();
    if (!current) {
      label.append(h('span', { class: 'picker-placeholder' }, '— choisir —'));
    } else if (entity) {
      label.append(
        h('span', { class: 'picker-name' }, `${iconFor(current)} ${entity.name}`),
        h('span', { class: 'picker-id' }, [subtitle(entity), current].filter(Boolean).join(' — ')));
    } else {
      label.append(h('span', { class: 'picker-name' }, current),
        missing ? h('span', { class: 'picker-id' }, 'introuvable dans Home Assistant') : null);
    }
  };

  const choose = (entityId) => {
    current = entityId;
    refreshButton();
    close();
    onChange(entityId);
  };

  const option = (entity) => h('li', {},
    h('button', { type: 'button', class: 'picker-option', onclick: () => choose(entity.entity_id) },
      h('span', { class: 'picker-name' }, `${iconFor(entity.entity_id)} ${entity.name}`),
      subtitle(entity) ? h('span', { class: 'picker-sub' }, subtitle(entity)) : null,
      h('span', { class: 'picker-id' }, entity.entity_id)));

  const heading = (text) => h('li', { class: 'picker-heading' }, text);

  const fill = () => {
    const query = normalize(search.value).trim();
    list.replaceChildren();
    if (allowEmpty) {
      list.append(h('li', {}, h('button', { type: 'button', class: 'picker-option picker-none',
        onclick: () => choose('') }, '— aucun —')));
    }
    const ranked = (items) => items.map((entity) => ({ entity, points: score(entity, query) }))
      .filter((item) => item.points > 0)
      .sort((a, b) => b.points - a.points || a.entity.name.localeCompare(b.entity.name, 'fr'))
      .map((item) => item.entity);

    const pinnedEntities = ranked(pinned.map((id) => byId.get(id)).filter(Boolean));
    if (pinnedEntities.length) list.append(heading('Catalogue'), ...pinnedEntities.map(option));

    const others = ranked(entities.filter((entity) => inDomains(entity, domains) && !pinned.includes(entity.entity_id)));
    const shown = others.slice(0, MAX_VISIBLE);
    if (query) {
      // En recherche : par pertinence, sans titres de groupes.
      if (pinnedEntities.length && shown.length) list.append(heading('Autres entités'));
      list.append(...shown.map(option));
    } else {
      // Sans recherche : regroupé par pièce, comme dans HA.
      const groups = new Map();
      shown.forEach((entity) => {
        const key = entity.area || NO_AREA;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entity);
      });
      [...groups.keys()].sort((a, b) => (a === NO_AREA) - (b === NO_AREA) || a.localeCompare(b, 'fr'))
        .forEach((key) => list.append(heading(key), ...groups.get(key).map(option)));
    }
    if (others.length > MAX_VISIBLE) {
      list.append(heading(`${others.length - MAX_VISIBLE} autres : affine la recherche`));
    }
    if (!pinnedEntities.length && !shown.length) {
      list.append(heading(entities.length ? 'Aucune entité correspondante' : 'Entités indisponibles'));
    }
  };

  // Le panneau est en position fixe : il n'est donc jamais coupé par un tableau défilant.
  const place = () => {
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
    const height = Math.max(160, Math.min(PANEL_MAX_HEIGHT, (openUp ? rect.top : spaceBelow) - 16));
    const width = Math.max(rect.width, 320);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    panel.style.top = openUp ? `${rect.top - height - 4}px` : `${rect.bottom + 4}px`;
    list.style.maxHeight = `${height - 48}px`;
  };

  function close(target, except) {
    if (except === root) return;
    if (target && root.contains(target)) return;
    panel.hidden = true;
  }
  const closer = (target, except) => {
    if (!root.isConnected) { closers.delete(closer); return; }
    close(target, except);
  };
  closers.add(closer);

  const open = () => {
    closers.forEach((closeOther) => closeOther(null, root));
    panel.hidden = false;
    search.value = '';
    fill();
    place();
    search.focus();
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (panel.hidden) open(); else close();
  });
  search.addEventListener('input', fill);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter') {
      event.preventDefault();
      list.querySelector('.picker-option:not(.picker-none)')?.click();
    }
  });
  panel.addEventListener('click', (event) => event.stopPropagation());

  refreshButton();
  return root;
};

// Liste de cases à cocher (ex. calendriers) ; les valeurs enregistrées disparues sont signalées.
export const entityChecklist = ({ entities, domains, values, onChange }) => {
  const selected = new Set(values || []);
  const byId = new Map(entities.map((entity) => [entity.entity_id, entity]));
  const candidates = entities.filter((entity) => inDomains(entity, domains));
  const missing = [...selected].filter((id) => !byId.has(id));
  const emit = () => onChange([...selected]);
  const row = (entityId, name, isMissing) => h('label', { class: `checklist-item ${isMissing ? 'is-missing' : ''}` },
    h('input', { type: 'checkbox', checked: selected.has(entityId), onchange: (event) => {
      if (event.target.checked) selected.add(entityId); else selected.delete(entityId);
      emit();
    } }),
    h('span', {}, isMissing ? `${entityId} — introuvable` : `${iconFor(entityId)} ${name} (${entityId})`));
  const rows = [
    ...candidates.map((entity) => row(entity.entity_id, entity.name, false)),
    ...(entities.length ? missing.map((id) => row(id, id, true)) : []),
  ];
  return h('div', { class: 'checklist' },
    rows.length ? rows : h('span', { class: 'hint' }, 'Aucune entité disponible.'));
};
