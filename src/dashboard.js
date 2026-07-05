import { FLOOD_DEPTH_CLASSES } from './lib/geomath';
import { RISK_COLORS } from './buildingrisk.js';
import { scanFloodGrid } from './floodgrid.js';
import { t } from './i18n.js';

// 町全体統計ダッシュボード。
//   - 浸水面積統計: ハザードタイル全域スキャン (町全体を常にカバー)
//   - 建物統計: 3D Tiles属性の漸進集計 (読み込み済み建物が対象)
const $ = (id) => document.getElementById(id);

function bar(label, value, max, color, unit) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      <div class="stat-track"><div class="stat-bar" style="width:${pct}%;background:${color}"></div></div>
      <span class="stat-value">${value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}${unit}</span>
    </div>`;
}

export function initDashboard(analyzer) {
  const card = $('dashCard');
  $('fabDash').addEventListener('click', () => {
    card.hidden = !card.hidden;
    if (!card.hidden) refresh();
  });
  $('dashClose').addEventListener('click', () => {
    card.hidden = true;
  });

  let areaStats = null;
  let scanError = false;

  async function refresh() {
    renderBuildings(analyzer.stats, analyzer.hasRiskAttributes());
    if (!areaStats && !scanError) {
      $('dashArea').innerHTML = `<div class="loading-dots">${t('dash.scanning')}</div>`;
      try {
        areaStats = await scanFloodGrid((done, total) => {
          $('dashArea').innerHTML =
            `<div class="loading-dots">${t('dash.scanning')} ${done}/${total}</div>`;
        });
      } catch (err) {
        console.error(err);
        scanError = true;
        $('dashArea').innerHTML = `<p class="result-note">${t('dash.scanFailed')}</p>`;
        return;
      }
    }
    if (areaStats) renderArea(areaStats);
  }

  function renderArea({ areaKm2, totalKm2 }) {
    const max = Math.max(...areaKm2);
    const classes = t('floodClasses');
    $('dashArea').innerHTML = `
      <p class="dash-headline">${t('dash.areaHead', { km2: totalKm2.toFixed(2) })}</p>
      ${FLOOD_DEPTH_CLASSES.map((cls, i) =>
        bar(classes[i].label, areaKm2[i], max, cls.css, t('dash.unitKm2')),
      ).join('')}
      <p class="result-note">${t('dash.areaNote')}</p>`;
  }

  function renderBuildings(stats, hasAttrs) {
    if (!hasAttrs || stats.total === 0) {
      $('dashBuildings').innerHTML = `
        <p class="result-note">${stats.total === 0 ? t('dash.bldgWait') : t('dash.bldgNoAttr')}</p>`;
      return;
    }
    const atRisk = stats.byClass.reduce((a, b) => a + b, 0);
    const max = Math.max(...stats.byClass);
    const classes = t('floodClasses');
    $('dashBuildings').innerHTML = `
      <p class="dash-headline">${t('dash.bldgHead', {
        total: stats.total.toLocaleString(),
        atRisk: atRisk.toLocaleString(),
        vert: stats.verticalEvacuationRisk.toLocaleString(),
      })}</p>
      ${FLOOD_DEPTH_CLASSES.map((cls, i) =>
        bar(classes[i].label, stats.byClass[i], max, RISK_COLORS[i], t('dash.unitBldg')),
      ).join('')}
      <p class="result-note">${t('dash.bldgNote')}</p>`;
  }

  // 統計更新・言語切替を開いているダッシュボードに反映
  analyzer.onUpdate((stats) => {
    if (!card.hidden) renderBuildings(stats, analyzer.hasRiskAttributes());
  });
  document.addEventListener('sango:langchange', () => {
    if (!card.hidden) refresh();
  });
}
