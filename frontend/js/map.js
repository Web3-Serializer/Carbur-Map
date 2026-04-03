import { api } from './api.js';
import { renderHistoryChart } from './chart.js';

const FUEL_COLOR = {
  SP95: '#38bdf8', SP98: '#a78bfa', Gazole: '#e8ff47',
  E10: '#4ade80',  E85: '#f472b6',  GPLc: '#fb923c',
};

let map, cluster;
let state = {
  fuel: 'SP95',
  dept: '',
  pop: '',
  histDays: 7,
  stations: [],
};

export function initMap() {
  map = L.map('map', {
    center: [46.603354, 1.888334], // centre France
    zoom: 6,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  cluster = L.markerClusterGroup({
    maxClusterRadius: 55,
    iconCreateFunction: (c) => {
      const n = c.getChildCount();
      const sz = n > 100 ? 44 : n > 30 ? 36 : 30;
      return L.divIcon({
        html: `<div style="
          width:${sz}px;height:${sz}px;
          background:rgba(232,255,71,.88);
          border:2px solid #e8ff47;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          color:#000;font-weight:800;font-size:${sz > 36 ? 12 : 10}px;
          font-family:'Syne',sans-serif;
          box-shadow:0 2px 12px rgba(232,255,71,.3)
        ">${n}</div>`,
        className: '',
        iconSize: [sz, sz],
      });
    },
  });

  map.addLayer(cluster);
}


function normalizeStation(station) {
  let lat = Number(station.lat);
  let lng = Number(station.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  if (Math.abs(lat) > 1000) lat = lat / 100000;
  if (Math.abs(lng) > 1000) lng = lng / 100000;

  if (lat >= -6 && lat <= 10 && lng >= 41 && lng <= 52) {
    [lat, lng] = [lng, lat];
  }

  if (
    lat < 41 || lat > 51.5 ||
    lng < -5.5 || lng > 9.8
  ) return null;

  return {
    ...station,
    lat,
    lng,
    price: Number(station.price ?? 0),
  };
}

export async function loadStations() {
  setStatus('loading', 'Chargement...');

  try {
    const data = await api.stations({
      fuel: state.fuel,
      dept: state.dept,
      pop: state.pop,
    });

    state.stations = (data.stations || [])
      .map(normalizeStation)
      .filter(Boolean)
      .sort((a, b) => a.price - b.price);

    renderMarkers(state.stations);
    updateStats(state.stations);
    renderStationList(state.stations);
    loadHistoryChart();

    setStatus('ok', `${state.stations.length.toLocaleString('fr')} stations`);
  } catch (e) {
    setStatus('error', 'Erreur de chargement');
    showToast(e.message, 'error');
  }
}

function renderMarkers(stations) {
  cluster.clearLayers();
  if (!stations.length) return;

  const prices = stations.map((s) => s.price).filter(Number.isFinite);
  if (!prices.length) return;

  const mn = Math.min(...prices);
  const range = Math.max(...prices) - mn || 1;

  const bounds = [];

  const markers = stations.map((s) => {
    const ratio = (s.price - mn) / range;
    const col = ratio < 0.33 ? '#4ade80' : ratio < 0.66 ? '#e8ff47' : '#f87171';

    const icon = L.divIcon({
      html: `<div style="
        background:${col};color:#000;border-radius:5px;
        padding:2px 5px;font-size:9.5px;font-weight:700;
        font-family:'IBM Plex Mono',monospace;white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,.5);
      ">${s.price.toFixed(3) ?? "—"}</div>`,
      className: '',
      iconSize: null,
      iconAnchor: [22, 12],
    });

    const m = L.marker([s.lat, s.lng], { icon });
    bounds.push([s.lat, s.lng]);

    const priceRows = Object.entries(s.prices || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `
        <div class="popup-price">
          <div class="popup-fuel" style="color:${FUEL_COLOR[k] || '#4a6278'}">${k}</div>
          <div class="popup-val" style="color:${FUEL_COLOR[k] || '#dde6f0'}">${Number(v).toFixed(3) ?? "—"} €</div>
        </div>`)
      .join('');

    const badge = s.pop === 'A'
      ? '<span class="popup-badge" style="color:#4ade80">Autoroute</span>'
      : s.pop === 'R' ? '<span class="popup-badge">Routier</span>' : '';

    m.bindPopup(`
      <div class="popup-inner">
        <div class="popup-title">${s.ville || 'Station'} ${badge}</div>
        <div class="popup-addr"><i class="bi bi-geo-alt"></i> ${s.adresse || ''} — ${s.cp || ''}</div>
        <div class="popup-prices">${priceRows}</div>
      </div>`, { maxWidth: 280 });

    m.on('click', () => highlightStation(s.id));
    return m;
  });

  cluster.addLayers(markers);

  // 🔥 Recentrage automatique sur la France / résultats
  if (bounds.length === 1) {
    map.setView(bounds[0], 12);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }
}

function updateStats(stations) {
  if (!stations.length) return;

  const prices = stations.map((s) => s.price).filter(Number.isFinite);
  if (!prices.length) return;

  const mn = Math.min(...prices);
  const mx = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  document.getElementById('stat-min').textContent  = mn.toFixed(3) ?? "—";
  document.getElementById('stat-max').textContent  = mx.toFixed(3) ?? "—";
  document.getElementById('stat-avg').textContent  = avg.toFixed(3) ?? "—";
  document.getElementById('stat-count').textContent = stations.length.toLocaleString('fr');
}

function renderStationList(stations) {
  const top = [...stations].slice(0, 30);
  const list = document.getElementById('station-list');

  list.innerHTML = top.map((s, i) => `
    <div class="station-item" data-id="${s.id}" onclick="window.mapModule.flyTo('${s.id}')">
      <div>
        <div class="station-name">
          <span style="color:var(--muted);font-size:.62rem;margin-right:4px">#${i + 1}</span>
          ${s.ville || 'CP ' + s.cp}
        </div>
        <div class="station-sub">${s.adresse || s.cp || ''}</div>
      </div>
      <div class="station-price">${s.price.toFixed(3) ?? "—"} €</div>
    </div>`).join('');
}

export function flyTo(id) {
  const s = state.stations.find((x) => x.id === id);
  if (s) map.flyTo([s.lat, s.lng], 15, { duration: 1 });
}

function highlightStation(id) {
  document.querySelectorAll('.station-item').forEach((el) => el.classList.remove('active'));
  const el = document.querySelector(`.station-item[data-id="${id}"]`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function loadHistoryChart() {
  try {
    const data = await api.history({ fuel: state.fuel, days: state.histDays, dept: state.dept });
    renderHistoryChart(data, state.fuel);
  } catch (_) {}
}

export function setFuel(fuel) {
  state.fuel = fuel;
  loadStations();
}

export function setDept(dept) {
  state.dept = dept;
  loadStations();
}

export function setPop(pop) {
  state.pop = pop;
  loadStations();
}

export function setHistDays(days) {
  state.histDays = days;
  loadHistoryChart();
}

export function searchStation(query) {
  if (!query) return;
  const q = query.toLowerCase();
  const s = state.stations.find(
    (x) =>
      (x.ville && x.ville.toLowerCase().includes(q)) ||
      (x.cp && String(x.cp).startsWith(q)) ||
      (x.dept && String(x.dept).toLowerCase() === q)
  );
  if (s) map.flyTo([s.lat, s.lng], 13, { duration: 1 });
}

function setStatus(type, text) {
  const dot  = document.querySelector('.dot');
  const span = document.getElementById('status-text');
  dot.className = 'dot' + (type === 'loading' ? ' loading' : type === 'error' ? ' error' : '');
  if (span) span.textContent = text;
}

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}