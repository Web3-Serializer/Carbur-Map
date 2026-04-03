const API_BASE =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://api.carburmap.leetcode.agency';

async function apiFetch(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  });
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
  return r.json();
}

export const api = {
  stations: (p) => apiFetch('/api/stations', p),
  stats:    (p) => apiFetch('/api/stats', p),
  history:  (p) => apiFetch('/api/history', p),
  predict:  (p) => apiFetch('/api/predict', p),
  fuels:    ()  => apiFetch('/api/fuels'),
  depts:    ()  => apiFetch('/api/departments'),
};
