import { api } from './api.js';
import { renderPredictChart } from './chart.js';

let state = {
  fuel: 'SP95',
  horizon: 7,
  dept: '',
  depth: 180,
  confidence: 95,
  result: null,
};

export async function runPrediction() {
  const btn = document.getElementById('predict-btn');
  const errorEl = document.getElementById('predict-error');
  if (errorEl) errorEl.style.display = 'none';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Calcul en cours...';
  }

  try {
    const result = await api.predict({
      fuel: state.fuel,
      horizon: state.horizon,
      dept: state.dept,
      depth: state.depth,
      confidence: state.confidence,
    });

    result.model = result.model || {};
    result.predictions = result.predictions || [];
    result.history = result.history || [];

    state.result = result;

    renderPredictChart(result, state.fuel);
    renderModelStats(result.model);
    renderPredictTable(result.predictions);
    renderFeatureImportance(result.model.top_features || []);
  } catch (e) {
    console.error(e);
    showPredictError(e.message || 'Erreur lors de la prédiction');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-graph-up-arrow"></i> Calculer la prédiction';
    }
  }
}

function renderModelStats(model) {
  const el = document.getElementById('model-stats');
  if (!el) return;

  const r2 = typeof model.r2 === 'number' ? model.r2 : 0;
  const mae = typeof model.mae === 'number' ? model.mae : 0;
  const rmse = typeof model.rmse === 'number' ? model.rmse : 0;
  const volatility = typeof model.volatility === 'number' ? model.volatility : 0;
  const weekly = typeof model.weekly_change === 'number' ? model.weekly_change : 0;
  const residual = typeof model.residual_std === 'number' ? model.residual_std : 0;

  const trendClass = model.trend === 'hausse' ? 'up' : model.trend === 'baisse' ? 'down' : 'flat';
  const trendIcon = model.trend === 'hausse' ? 'bi-arrow-up-right' : model.trend === 'baisse' ? 'bi-arrow-down-right' : 'bi-dash';
  const trendLabel = model.trend === 'hausse' ? 'Tendance haussière' : model.trend === 'baisse' ? 'Tendance baissière' : 'Tendance stable';

  el.innerHTML = `
    <div class="model-stats">
      <div class="model-row">
        <span class="model-key">R² (précision)</span>
        <span class="model-val" style="color:${r2 > 0.7 ? 'var(--green)' : r2 > 0.4 ? 'var(--acc)' : 'var(--red)'}">${(r2 * 100).toFixed(1)}%</span>
      </div>
      <div class="model-row">
        <span class="model-key">MAE</span>
        <span class="model-val">${mae.toFixed(4)} €</span>
      </div>
      <div class="model-row">
        <span class="model-key">RMSE</span>
        <span class="model-val">${rmse.toFixed(4)} €</span>
      </div>
      <div class="model-row">
        <span class="model-key">Volatilité (30j)</span>
        <span class="model-val">${volatility.toFixed(4)} €</span>
      </div>
      <div class="model-row">
        <span class="model-key">Variation hebdo</span>
        <span class="model-val">${weekly > 0 ? '+' : ''}${weekly.toFixed(4)} €</span>
      </div>
      <div class="model-row">
        <span class="model-key">Écart résiduel</span>
        <span class="model-val">${residual.toFixed(4)} €</span>
      </div>
      <div class="model-row">
        <span class="model-key">Données</span>
        <span class="model-val">${model.data_points ?? 0} pts</span>
      </div>
      <div class="model-row">
        <span class="model-key">Features</span>
        <span class="model-val">${model.features_count ?? 0}</span>
      </div>
      <div class="model-row">
        <span class="model-key">Ensemble</span>
        <span class="model-val">${model.ensemble_size ?? 0} modèles</span>
      </div>
    </div>
    <div class="trend-badge ${trendClass}" style="margin-top:.9rem">
      <i class="bi ${trendIcon}"></i>
      ${trendLabel}
    </div>`;
}

function renderFeatureImportance(features) {
  const el = document.getElementById('feature-importance');
  if (!el || !features.length) return;

  const maxImp = Math.max(...features.map((f) => f.importance));
  const rows = features
    .map((f) => {
      const pct = maxImp > 0 ? (f.importance / maxImp) * 100 : 0;
      return `
      <div class="feat-row">
        <span class="feat-name">${f.name}</span>
        <div class="feat-bar-wrap">
          <div class="feat-bar" style="width:${pct}%"></div>
        </div>
        <span class="feat-val">${(f.importance * 100).toFixed(1)}%</span>
      </div>`;
    })
    .join('');

  el.innerHTML = rows;
}

function renderPredictTable(predictions) {
  const el = document.getElementById('predict-table-wrap');
  if (!el) return;

  const rows = predictions
    .map((p) => {
      const pred = typeof p.pred === 'number' ? p.pred.toFixed(3) : '—';
      const low = typeof p.low === 'number' ? p.low.toFixed(3) : '—';
      const high = typeof p.high === 'number' ? p.high.toFixed(3) : '—';
      const d = new Date(p.date).toLocaleDateString('fr', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      });
      return `
      <tr>
        <td>${d}</td>
        <td style="color:var(--acc);font-family:var(--mono)">${pred} €</td>
        <td style="color:var(--muted);font-family:var(--mono)">${low} — ${high} €</td>
      </tr>`;
    })
    .join('');

  el.innerHTML = `
    <table class="predict-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Prix prédit</th>
          <th>Intervalle (${state.confidence}%)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function showPredictError(msg) {
  const el = document.getElementById('predict-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

export function setFuel(fuel) {
  state.fuel = fuel;
}
export function setHorizon(h) {
  state.horizon = parseInt(h);
}
export function setDept(dept) {
  state.dept = dept;
}
export function setDepth(d) {
  state.depth = parseInt(d);
}
export function setConfidence(c) {
  state.confidence = parseInt(c);
}
