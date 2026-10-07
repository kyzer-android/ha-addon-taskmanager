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
  entities: () => request('GET', 'api/entities'),
  media: () => request('GET', 'api/media'),
  tasks: () => request('GET', 'api/tasks'),
  saveTask: (task) => request('POST', 'api/tasks', task),
  deleteTask: (id) => request('DELETE', `api/tasks/${id}`),
  flag: (id, name, value) => request('POST', `api/tasks/${id}/flag`, { name, value }),
  runTask: (id) => request('POST', `api/tasks/${id}/run`, {}),
  duplicate: (id, date) => request('POST', `api/tasks/${id}/duplicate`, { date }),
  day: (date) => request('GET', `api/day?date=${date}`),
  calendar: () => request('GET', 'api/calendar?days=14'),
  saveShownEvents: (events) => request('PUT', 'api/shown_events', events),
  journal: () => request('GET', 'api/journal'),
};
