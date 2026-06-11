import { FLOOD_DEPTH_CLASSES } from './lib/geomath.js';
import { RISK_COLORS } from './buildingrisk.js';
import { scanFloodGrid } from './floodgrid.js';

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
  $('dashClose').addEventListener('click', () => { card.hidden = true; });

  let areaStats = null;
  let scanError = false;

  async function refresh() {
    renderBuildings(analyzer.stats, analyzer.hasRiskAttributes());
    if (!areaStats && !scanError) {
      $('dashArea').innerHTML = '<div class="loading-dots">町全域のハザードタイルを解析中…</div>';
      try {
        areaStats = await scanFloodGrid((done, total) => {
          $('dashArea').innerHTML =
            `<div class="loading-dots">町全域のハザードタイルを解析中… ${done}/${total}</div>`;
        });
      } catch (err) {
        console.error(err);
        scanError = true;
        $('dashArea').innerHTML =
          '<p class="result-note">面積統計の取得に失敗しました。通信状況をご確認ください。</p>';
        return;
      }
    }
    if (areaStats) renderArea(areaStats);
  }

  function renderArea({ areaKm2, totalKm2 }) {
    const max = Math.max(...areaKm2);
    $('dashArea').innerHTML = `
      <p class="dash-headline">想定最大規模の洪水で、町内 <b>約${totalKm2.toFixed(2)} km²</b> が浸水するおそれがあります</p>
      ${FLOOD_DEPTH_CLASSES.map((cls, i) =>
        bar(cls.label, areaKm2[i], max, cls.css, ' km²')).join('')}
      <p class="result-note">出典: ハザードマップポータルサイト配信タイルの全域解析 (約63m格子)</p>`;
  }

  function renderBuildings(stats, hasAttrs) {
    if (!hasAttrs || stats.total === 0) {
      $('dashBuildings').innerHTML = `
        <p class="result-note">${stats.total === 0
          ? '3D建物の読み込み待ちです。地図を表示したまましばらくお待ちください。'
          : 'この3D都市モデルには建物単位の浸水ランク属性が含まれていないため、建物別統計は表示できません (面積統計をご利用ください)。'}</p>`;
      return;
    }
    const atRisk = stats.byClass.reduce((a, b) => a + b, 0);
    const max = Math.max(...stats.byClass);
    $('dashBuildings').innerHTML = `
      <p class="dash-headline">読み込み済み <b>${stats.total.toLocaleString()}棟</b> のうち
        <b>${atRisk.toLocaleString()}棟</b> に浸水想定、うち
        <b class="dash-danger">${stats.verticalEvacuationRisk.toLocaleString()}棟</b> は
        3m以上の浸水想定かつ2階建て以下 (垂直避難が困難)</p>
      ${FLOOD_DEPTH_CLASSES.map((cls, i) =>
        bar(cls.label, stats.byClass[i], max, RISK_COLORS[i], '棟')).join('')}
      <p class="result-note">カメラで表示した範囲の建物から漸進的に集計されます。建物属性 (浸水ランク・階数) はPLATEAU CityGML由来です。</p>`;
  }

  // 統計が更新されたら開いているダッシュボードに反映
  analyzer.onUpdate((stats) => {
    if (!card.hidden) renderBuildings(stats, analyzer.hasRiskAttributes());
  });
}
