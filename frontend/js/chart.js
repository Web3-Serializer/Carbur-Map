const FUEL_COLOR = {
  SP95: '#38bdf8', SP98: '#a78bfa', Gazole: '#e8ff47',
  E10: '#4ade80',  E85: '#f472b6',  GPLc: '#fb923c',
};

let histChart = null;
let predictChart = null;

const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  interaction: { intersect: false, mode: 'index' },
};

function tc() {
  const s = getComputedStyle(document.documentElement);
  return {
    s1: s.getPropertyValue('--s1').trim(),
    border: s.getPropertyValue('--border').trim(),
    txt: s.getPropertyValue('--txt').trim(),
    muted: s.getPropertyValue('--muted').trim(),
  };
}

function tooltipStyle(color) {
  const t = tc();
  return {
    backgroundColor: t.s1,
    borderColor: t.border,
    borderWidth: 1,
    titleColor: t.txt,
    bodyColor: color || t.txt,
  };
}

function scaleStyle() {
  const t = tc();
  return {
    x: {
      grid: { color: t.border + '33' },
      ticks: { color: t.muted, font: { family: 'Syne', size: 10 }, maxTicksLimit: 7 },
    },
    y: {
      grid: { color: t.border + '55' },
      ticks: {
        color: t.muted,
        font: { family: 'IBM Plex Mono', size: 10 },
        callback: (v) => (v !== null ? v.toFixed(3) : '—') + '€',
      },
    },
  };
}

export function renderHistoryChart(history, fuel) {
  const canvas = document.getElementById('history-chart');
  if (!canvas) return;

  if (histChart) { histChart.destroy(); histChart = null; }

  const color = FUEL_COLOR[fuel] || '#e8ff47';
  const labels = history.map((h) => {
    const d = new Date(h.date);
    return d.toLocaleDateString('fr', { day: '2-digit', month: 'short' });
  });

  histChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Max',
          data: history.map((h) => h.max),
          borderColor: color + '44',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.4,
        },
        {
          label: 'Moyenne',
          data: history.map((h) => h.avg),
          borderColor: color,
          backgroundColor: color + '1a',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          fill: 1,
          tension: 0.4,
        },
        {
          label: 'Min',
          data: history.map((h) => h.min),
          borderColor: color + '44',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.4,
        },
      ],
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: {
          ...tooltipStyle(color),
          callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y?.toFixed(3) ?? '—'} €/L` },
        },
      },
      scales: scaleStyle(),
    },
  });
}

export function renderCompareChart(datasets) {
  const canvas = document.getElementById('history-chart');
  if (!canvas) return;

  if (histChart) { histChart.destroy(); histChart = null; }

  const allDates = new Set();
  datasets.forEach((d) => d.history.forEach((h) => allDates.add(h.date)));
  const sorted = [...allDates].sort();

  const labels = sorted.map((d) => {
    return new Date(d).toLocaleDateString('fr', { day: '2-digit', month: 'short' });
  });

  const t = tc();

  const chartDatasets = datasets
    .filter((d) => d.history.length > 0)
    .map((d) => {
      const color = FUEL_COLOR[d.fuel] || '#e8ff47';
      const dateMap = {};
      d.history.forEach((h) => { dateMap[h.date] = h.avg; });
      return {
        label: d.fuel,
        data: sorted.map((date) => dateMap[date] ?? null),
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 1,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
        tension: 0.4,
        spanGaps: true,
      };
    });

  histChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: chartDatasets },
    options: {
      ...BASE_OPTS,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: t.txt,
            font: { family: 'Syne', size: 9, weight: '700' },
            boxWidth: 10,
            boxHeight: 3,
            padding: 8,
          },
        },
        tooltip: {
          ...tooltipStyle(),
          callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y?.toFixed(3) ?? '—'} €/L` },
        },
      },
      scales: scaleStyle(),
    },
  });
}

export function renderPredictChart(result, fuel) {
  const canvas = document.getElementById('predict-chart');
  if (!canvas) return;

  if (predictChart) { predictChart.destroy(); predictChart = null; }

  const color = FUEL_COLOR[fuel] || '#e8ff47';
  const hist = result.history;
  const preds = result.predictions;

  const allDates = [...hist.map((h) => h.date), ...preds.map((p) => p.date)];
  const labels = allDates.map((d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('fr', { day: '2-digit', month: 'short' });
  });

  const histData = hist.map((h) => h.avg);
  const predData = [
    ...new Array(hist.length - 1).fill(null),
    hist[hist.length - 1].avg,
    ...preds.map((p) => p.pred),
  ];
  const lowData = [...new Array(hist.length - 1).fill(null), hist[hist.length - 1].avg, ...preds.map((p) => p.low)];
  const highData = [...new Array(hist.length - 1).fill(null), hist[hist.length - 1].avg, ...preds.map((p) => p.high)];

  const t = tc();

  predictChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Intervalle haut',
          data: highData,
          borderColor: 'transparent',
          backgroundColor: color + '18',
          fill: '+1',
          tension: 0.4,
          pointRadius: 0,
        },
        {
          label: 'Prédiction',
          data: predData,
          borderColor: color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 4,
          pointBackgroundColor: color,
          fill: false,
          tension: 0.4,
        },
        {
          label: 'Intervalle bas',
          data: lowData,
          borderColor: 'transparent',
          backgroundColor: color + '18',
          fill: '-2',
          tension: 0.4,
          pointRadius: 0,
        },
        {
          label: 'Historique',
          data: [...histData, ...new Array(preds.length).fill(null)],
          borderColor: t.txt,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 2,
          fill: false,
          tension: 0.4,
        },
      ],
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: {
          ...tooltipStyle(color),
          callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y?.toFixed(3) ?? '—'} €/L` },
        },
      },
      scales: scaleStyle(),
    },
  });
}
