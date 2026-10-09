// Popup de formulaire : tous les champs les uns sous les autres, avec aide et validation.
import { h } from './dom.js';
import { entityPicker } from './picker.js';

/**
 * options :
 *  - title    : titre de la popup
 *  - values   : valeurs initiales (copiées, l'original n'est modifié qu'à l'enregistrement)
 *  - fields   : [{ key, label, help, kind: 'text'|'entity'|'select'|'checkbox', required, showIf(values),
 *                  domains | domainsFor(values), allowEmpty, options: [{ value, label }], rerender }]
 *  - entities : liste des entités HA (pour les champs « entity »)
 *  - onSave   : (values) => void
 */
export const openForm = ({ title, values, fields, entities, onSave }) => {
  const draft = structuredClone(values);
  const errors = new Set();
  const showAll = new Set();
  const body = h('div', { class: 'modal-body' });
  const overlay = h('div', { class: 'modal-overlay' });

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  function onKey(event) {
    if (event.key === 'Escape') close();
  }

  const control = (spec) => {
    if (spec.kind === 'entity') {
      // Filtre facultatif (ex. écrans) : l'entité déjà choisie reste toujours visible.
      const filtered = spec.filter && !showAll.has(spec.key)
        ? entities.filter((entity) => spec.filter(entity) || entity.entity_id === draft[spec.key]) : entities;
      const picker = entityPicker({
        entities: filtered,
        domains: spec.domainsFor ? spec.domainsFor(draft) : spec.domains,
        value: draft[spec.key], allowEmpty: Boolean(spec.allowEmpty),
        onChange: (entityId) => { draft[spec.key] = entityId; errors.delete(spec.key); render(); },
      });
      if (!spec.filter) return picker;
      return h('div', {}, picker, h('button', { type: 'button', class: 'link-button', onclick: () => {
        if (showAll.has(spec.key)) showAll.delete(spec.key); else showAll.add(spec.key);
        render();
      } }, showAll.has(spec.key) ? spec.filterLabel || 'Seulement les entités probables' : 'Afficher toutes les entités'));
    }
    if (spec.kind === 'select') {
      return h('select', { class: 'modal-input', onchange: (event) => {
        draft[spec.key] = event.target.value;
        if (spec.rerender) render();
      } }, spec.options.map((option) => h('option', {
        value: option.value, selected: draft[spec.key] === option.value }, option.label)));
    }
    return h('input', { type: 'text', class: 'modal-input', value: draft[spec.key] || '',
      oninput: (event) => { draft[spec.key] = event.target.value; errors.delete(spec.key); } });
  };

  const fieldBlock = (spec) => {
    if (spec.kind === 'checkbox') {
      return h('label', { class: 'modal-check' },
        h('input', { type: 'checkbox', checked: Boolean(draft[spec.key]),
          onchange: (event) => { draft[spec.key] = event.target.checked; } }),
        h('span', {}, h('span', { class: 'modal-label' }, spec.label),
          spec.help ? h('span', { class: 'modal-help' }, spec.help) : null));
    }
    return h('div', { class: `modal-field ${errors.has(spec.key) ? 'has-error' : ''}` },
      h('span', { class: 'modal-label' }, spec.label, (typeof spec.required === 'function' ? spec.required(draft) : spec.required) ? h('span', { class: 'modal-required' }, ' *') : null),
      spec.help ? h('span', { class: 'modal-help' }, spec.help) : null,
      control(spec),
      errors.has(spec.key) ? h('span', { class: 'modal-error' }, 'Champ obligatoire') : null);
  };

  const visible = () => fields.filter((spec) => !spec.showIf || spec.showIf(draft));

  function render() {
    body.replaceChildren(...visible().map(fieldBlock));
  }

  const save = () => {
    errors.clear();
    visible().filter((spec) => (typeof spec.required === 'function' ? spec.required(draft) : spec.required) && !String(draft[spec.key] || '').trim())
      .forEach((spec) => errors.add(spec.key));
    if (errors.size) { render(); return; }
    onSave(draft);
    close();
  };

  overlay.append(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('h2', { class: 'modal-title' }, title),
    body,
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: close }, 'Annuler'),
      h('button', { type: 'button', class: 'btn', onclick: save }, 'Enregistrer'))));
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  render();
  document.body.append(overlay);
};
