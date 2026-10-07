// Sélecteurs d'entités Home Assistant : liste avec recherche, filtrée par domaine.
// Aucune saisie libre : on ne peut choisir que parmi les entités existantes.
import { api } from './api.js';
import { h } from './dom.js';

const MAX_VISIBLE = 100;
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

const closers = new Set();
document.addEventListener('click', (event) => {
  closers.forEach((close) => close(event.target));
});

const matches = (entity, query) =>
  !query || entity.entity_id.toLowerCase().includes(query) || entity.name.toLowerCase().includes(query);

const inDomains = (entity, domains) =>
  !domains || !domains.length || domains.some((domain) => entity.entity_id.startsWith(`${domain}.`));

/**
 * options :
 *  - entities  : liste complète [{ entity_id, name }]
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
  const search = h('input', { type: 'search', class: 'picker-search', placeholder: 'Rechercher…' });
  const list = h('ul', { class: 'picker-list' });
  const panel = h('div', { class: 'picker-panel', hidden: true }, search, list);
  const root = h('div', { class: 'picker' }, button, panel);

  const refreshButton = () => {
    const entity = byId.get(current);
    button.classList.toggle('is-missing', Boolean(current) && !entity && entities.length > 0);
    if (!current) label.textContent = '— choisir —';
    else if (entity) label.textContent = `${entity.name} (${entity.entity_id})`;
    else label.textContent = entities.length ? `${current} — introuvable` : current;
  };

  const choose = (entityId) => {
    current = entityId;
    refreshButton();
    close();
    onChange(entityId);
  };

  const option = (entity, extraClass = '') => h('li', {},
    h('button', { type: 'button', class: `picker-option ${extraClass}`, onclick: () => choose(entity.entity_id) },
      h('span', {}, entity.name), h('span', { class: 'picker-id' }, entity.entity_id)));

  const heading = (text) => h('li', { class: 'picker-heading' }, text);

  const fill = () => {
    const query = search.value.trim().toLowerCase();
    list.replaceChildren();
    if (allowEmpty) {
      list.append(h('li', {}, h('button', { type: 'button', class: 'picker-option picker-none',
        onclick: () => choose('') }, '— aucun —')));
    }
    const pinnedEntities = pinned.map((id) => byId.get(id)).filter(Boolean)
      .filter((entity) => matches(entity, query));
    if (pinnedEntities.length) {
      list.append(heading('Catalogue'), ...pinnedEntities.map((entity) => option(entity)));
    }
    const others = entities.filter((entity) => inDomains(entity, domains)
      && !pinned.includes(entity.entity_id) && matches(entity, query));
    if (pinnedEntities.length && others.length) list.append(heading('Autres entités'));
    list.append(...others.slice(0, MAX_VISIBLE).map((entity) => option(entity)));
    if (others.length > MAX_VISIBLE) {
      list.append(h('li', { class: 'picker-heading' }, `${others.length - MAX_VISIBLE} autres : affine la recherche`));
    }
    if (!pinnedEntities.length && !others.length) {
      list.append(h('li', { class: 'picker-heading' }, entities.length ? 'Aucune entité correspondante' : 'Entités indisponibles'));
    }
  };

  const open = () => {
    closers.forEach((closeOther) => closeOther(null, root));
    panel.hidden = false;
    search.value = '';
    fill();
    search.focus();
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
    h('span', {}, isMissing ? `${entityId} — introuvable` : `${name} (${entityId})`));
  const rows = [
    ...candidates.map((entity) => row(entity.entity_id, entity.name, false)),
    ...(entities.length ? missing.map((id) => row(id, id, true)) : []),
  ];
  return h('div', { class: 'checklist' },
    rows.length ? rows : h('span', { class: 'hint' }, 'Aucune entité disponible.'));
};
