// Sélecteur d'image de fond : images téléversées dans l'add-on ou présentes dans /media.
import { api } from './api.js';
import { h, toast } from './dom.js';

const SOURCE_LABELS = { upload: 'Téléversée', media: 'Média' };

export const imagePicker = ({ value, onChange }) => {
  let current = value || '';
  let images = [];
  const root = h('div', { class: 'image-picker' });
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true,
    onchange: async (event) => {
      const [file] = event.target.files;
      event.target.value = '';
      if (!file) return;
      try {
        const uploaded = await api.uploadImage(file);
        current = uploaded.value;
        onChange(current);
        toast('Image téléversée');
        await load();
      } catch (error) {
        toast(`Envoi impossible : ${error.message}`);
      }
    } });

  const tile = (image) => h('div', { class: `image-tile ${current === image.value ? 'is-selected' : ''}` },
    h('button', { type: 'button', class: 'image-tile-button', title: image.name, onclick: () => {
      current = image.value;
      onChange(current);
      draw();
    } },
    h('img', { src: image.url, alt: '', loading: 'lazy' }),
    h('span', { class: 'image-tile-name' }, image.name),
    h('span', { class: 'image-tile-source' }, SOURCE_LABELS[image.source] || image.source)),
    image.source === 'upload' ? h('button', { type: 'button', class: 'image-tile-delete', title: 'Supprimer cette image',
      onclick: async () => {
        if (!window.confirm(`Supprimer l'image « ${image.name} » ?`)) return;
        await api.deleteImage(image.name);
        if (current === image.value) { current = ''; onChange(''); }
        await load();
      } }, '✕') : null);

  function draw() {
    const missing = current && !images.some((image) => image.value === current);
    root.replaceChildren(...[
      h('div', { class: 'image-grid' },
        h('div', { class: `image-tile ${current ? '' : 'is-selected'}` },
          h('button', { type: 'button', class: 'image-tile-button image-tile-none', onclick: () => {
            current = '';
            onChange('');
            draw();
          } }, 'Aucun fond')),
        images.map(tile)),
      missing ? h('p', { class: 'modal-error' }, `L'image choisie (${current}) est introuvable.`) : null,
      h('button', { type: 'button', class: 'btn btn-secondary btn-small image-upload', onclick: () => fileInput.click() },
        '＋ Téléverser une image'),
      fileInput,
      h('p', { class: 'hint' }, 'JPG, PNG, WebP ou GIF, 8 Mo maximum. Les images du dossier média de Home Assistant sont aussi proposées.')].filter(Boolean));
  }

  async function load() {
    try { const reply = await api.images(); images = Array.isArray(reply) ? reply : []; } catch (error) { images = []; }
    draw();
  }

  load();
  return root;
};
