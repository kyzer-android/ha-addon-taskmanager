// Appels à l'API de l'add-on. Les URL sont relatives pour fonctionner derrière Ingress.
const request = async (method, path, body) => {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} : ${response.status}`);
  return response.json();
};

export const api = {
  status: () => request('GET', 'api/status'),
  config: () => request('GET', 'api/config'),
  saveConfig: (config) => request('PUT', 'api/config', config),
  me: () => request('GET', 'api/me'),
  users: () => request('GET', 'api/users'),
  tablet: () => request('GET', 'api/tablet'),
  images: () => request('GET', 'api/images'),
  deleteImage: (name) => request('DELETE', `api/images/${encodeURIComponent(name)}`),
  uploadImage: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('api/images', { method: 'POST', body: form });
    if (!response.ok) throw new Error(await response.text() || `Envoi refusé (${response.status})`);
    return response.json();
  },
  entities: () => request('GET', 'api/entities'),
  browsers: () => request('GET', 'api/browsers'),
  media: () => request('GET', 'api/media'),
  tasks: () => request('GET', 'api/tasks'),
  saveTask: (task) => request('POST', 'api/tasks', task),
  deleteTask: (id) => request('DELETE', `api/tasks/${id}`),
  skipDay: (id, date, skipped) => request('POST', `api/tasks/${id}/skip`, { date, skipped }),
  flag: (id, name, value) => request('POST', `api/tasks/${id}/flag`, { name, value }),
  runTask: (id) => request('POST', `api/tasks/${id}/run`, {}),
  guides: () => request('GET', 'api/guides'),
  guide: (id) => request('GET', `api/guides/${id}`),
  replaceGuide: async (id, text) => {
    const response = await fetch(`api/guides/${id}`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown' }, body: text });
    if (!response.ok) throw new Error(await response.text() || response.status);
    return response.json();
  },
  resetGuide: (id) => request('DELETE', `api/guides/${id}`),
  templates: () => request('GET', 'api/templates'),
  createTemplate: (taskId, name) => request('POST', 'api/templates', { task_id: taskId, name }),
  renameTemplate: (id, name) => request('PUT', `api/templates/${id}`, { name }),
  deleteTemplate: (id) => request('DELETE', `api/templates/${id}`),
  day: (date) => request('GET', `api/day?date=${date}`),
  calendar: () => request('GET', 'api/calendar'),
  refreshCalendar: () => request('POST', 'api/calendar/refresh', {}),
  saveHiddenEvents: (keys) => request('PUT', 'api/hidden_events', keys),
  deleteMedia: (path) => request('DELETE', `api/media/${path.split('/').map(encodeURIComponent).join('/')}`),
  // Envoi avec progression (fetch ne sait pas la suivre).
  uploadMedia: (file, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api/media');
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => {
      if (xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else if (xhr.status === 413) reject(new Error('fichier trop gros (limite réglable dans Configuration)'));
      else reject(new Error(xhr.responseText || `envoi refusé (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('connexion interrompue'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  }),
  journal: () => request('GET', 'api/journal'),
};
