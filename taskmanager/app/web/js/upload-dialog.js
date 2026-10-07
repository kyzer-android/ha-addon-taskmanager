// Dialogue avant envoi d'un média : aperçu local + choix du nom du fichier.
import { h } from './dom.js';

const MIME_EXT = {
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/3gpp': '3gp',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/webm': 'webm', 'audio/opus': 'opus',
};
const GENERIC_NAME = /^(img|vid|mov|video|audio|rec|recording|record|dsc|pxl|pxl_|mvi|\d)[\d_\-\s.a-z]*$/i;
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const extensionOf = (file) => {
  const match = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return match ? match[1].toLowerCase() : (MIME_EXT[(file.type || '').split(';')[0]] || 'bin');
};

const defaultName = (file, kind) => {
  const stem = (file.name || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  if (stem && !GENERIC_NAME.test(stem)) return stem;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
  return `${kind === 'video' ? 'Vidéo' : 'Audio'} ${now.getDate()} ${MONTHS[now.getMonth()]} ${time}`;
};

/** Résout avec un File renommé, ou null si annulé. */
export const askUpload = (file, kind) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const input = h('input', { type: 'text', class: 'modal-input', value: defaultName(file, kind) });
  const overlay = h('div', { class: 'modal-overlay' });
  const finish = (result) => {
    URL.revokeObjectURL(url);
    overlay.remove();
    resolve(result);
  };
  const send = () => {
    const name = input.value.trim().replace(/[\\/:*?"<>|]+/g, ' ').trim();
    if (!name) { input.focus(); return; }
    finish(new File([file], `${name}.${extensionOf(file)}`, { type: file.type }));
  };
  const preview = h(kind === 'video' ? 'video' : 'audio', { class: 'upload-preview', src: url, controls: true });
  if (kind !== 'video') preview.style.height = '48px';
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') send(); });
  overlay.append(h('div', { class: 'upload-dialog' },
    h('h3', {}, kind === 'video' ? 'Nouvelle vidéo' : 'Nouvel audio'),
    preview,
    h('label', {}, 'Nom du fichier', input),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-secondary', onclick: () => finish(null) }, 'Annuler'),
      h('button', { class: 'btn', onclick: send }, 'Envoyer'))));
  document.body.append(overlay);
  input.focus();
  input.select();
});
