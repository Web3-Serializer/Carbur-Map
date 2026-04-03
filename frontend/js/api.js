const API_BASE = window.API_BASE || 'http://localhost:8000';

async function apiFetch(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  });
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`API error ${r.status}: ${await r.text()}`);
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
