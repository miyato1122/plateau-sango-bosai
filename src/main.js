import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  HOME_VIEW, CITY_BBOX, GSI_PALE, GSI_PHOTO,
  PLATEAU_TERRAIN_ION_ASSET, PLATEAU_ION_TOKEN, PLATEAU_TERRAIN_CREDIT,
} from './config.js';
import { loadBuildingTilesets } from './plateau.js';
import { GsiTerrainProvider } from './gsiterrain.js';
import { createHazardLayer, HAZARD_LAYERS, FLOOD_DEPTH_CLASSES } from './hazards.js';
import { fetchShelters, addShelterEntities, nearestShelter } from './shelters.js';
import { loadCityOverlay } from './citydata.js';
import { diagnosePoint } from './risk.js';
import { compassDirection } from './lib/geomath.js';
import { BuildingRiskAnalyzer } from './buildingrisk.js';
import { buildWaterColumns } from './floodgrid.js';
import { initDashboard } from './dashboard.js';
import {
  registerServiceWorker, offlineSupported, offlineMeta,
  saveOfflineArea, watchOnlineState,
} from './offline.js';

const $ = (id) => document.getElementById(id);

// ---- 小さなUIユーティリティ ----
let toastTimer = null;
function toast(message, ms = 4000) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function setStatus(id, text, state = 'loading') {
  let li = document.getElementById(`status-${id}`);
  if (!li) {
    li = document.createElement('li');
    li.id = `status-${id}`;
    $('statusList').appendChild(li);
  }
  li.textContent = text;
  li.dataset.state = state;
  if (state === 'error') toast(text);
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ---- Viewer初期化 ----
// トークンがある場合のみ設定 (空のままだとCesium同梱の既定トークンに依存してしまう)
if (PLATEAU_ION_TOKEN) Cesium.Ion.defaultAccessToken = PLATEAU_ION_TOKEN;

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: GSI_PALE,
      maximumLevel: 18,
      credit: new Cesium.Credit('地理院タイル'),
    })
  ),
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,            // 生属性テーブルは出さず、独自カードで表示する
  selectionIndicator: false,
});
viewer.scene.globe.depthTestAgainstTerrain = true;
// 既定のダブルクリック(エンティティへズーム)も無効化
viewer.screenSpaceEventHandler.removeInputAction(
  Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
);

function flyHome(duration = 1.2) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(HOME_VIEW.lon, HOME_VIEW.lat, HOME_VIEW.height),
    orientation: {
      heading: Cesium.Math.toRadians(HOME_VIEW.heading),
      pitch: Cesium.Math.toRadians(HOME_VIEW.pitch),
      roll: 0,
    },
    duration,
  });
}
flyHome(0);
$('fabHome').addEventListener('click', () => flyHome());

// ---- 3D地形 (既定で PLATEAU-Terrain、取得不可時は地理院標高タイルへフォールバック) ----
async function setupTerrain() {
  if (PLATEAU_ION_TOKEN) {
    try {
      setStatus('terrain', '地形 (PLATEAU-Terrain): 読み込み中…');
      viewer.terrainProvider =
        await Cesium.CesiumTerrainProvider.fromIonAssetId(PLATEAU_TERRAIN_ION_ASSET);
      // 配信された地形データ利用時に必須の帰属表記をクレジット表示に追加
      viewer.creditDisplay.addStaticCredit(new Cesium.Credit(PLATEAU_TERRAIN_CREDIT));
      setStatus('terrain', '地形 (PLATEAU-Terrain): 読み込み完了', 'ok');
      return;
    } catch {
      /* 取得不可の場合は地理院標高タイルへフォールバック */
    }
  }
  viewer.terrainProvider = new GsiTerrainProvider();
  setStatus('terrain', '地形 (地理院標高タイル): 有効', 'ok');
}
setupTerrain();

// ---- PLATEAU 3D建物 + 建物単位リスク分析 ----
setStatus('bldg', '3D建物: データカタログ照会中…');
const riskAnalyzer = new BuildingRiskAnalyzer();
let buildingTilesets = [];
loadBuildingTilesets(viewer, (msg) => setStatus('bldg', `3D建物: ${msg}`))
  .then(({ tilesets }) => {
    buildingTilesets = tilesets;
    for (const t of tilesets) {
      t.show = $('layer-buildings').checked;
      riskAnalyzer.attach(t);
    }
    setStatus('bldg', '3D建物: 読み込み完了', 'ok');
  })
  .catch((err) => {
    console.error(err);
    setStatus('bldg', `3D建物: 読み込み失敗 — ${err.message}`, 'error');
  });
$('layer-buildings').addEventListener('change', (e) => {
  for (const t of buildingTilesets) t.show = e.target.checked;
});

// ---- ハザードレイヤ (チップUI) ----
const opacityInput = $('hazardOpacity');
const hazardLayers = {};
const chipsBox = $('hazardChips');
for (const [key, def] of Object.entries(HAZARD_LAYERS)) {
  hazardLayers[key] = createHazardLayer(viewer, key, Number(opacityInput.value) / 100);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.style.setProperty('--dot', def.color);
  chip.setAttribute('aria-pressed', 'false');
  chip.innerHTML = `<span class="dot"></span>${def.label}`;
  chip.addEventListener('click', () => {
    const on = chip.getAttribute('aria-pressed') !== 'true';
    chip.setAttribute('aria-pressed', String(on));
    hazardLayers[key].show = on;
  });
  chipsBox.appendChild(chip);
  if (key === 'flood') chip.click(); // 洪水は初期表示
}
opacityInput.addEventListener('input', () => {
  const alpha = Number(opacityInput.value) / 100;
  for (const layer of Object.values(hazardLayers)) layer.alpha = alpha;
});

// 凡例
for (const cls of FLOOD_DEPTH_CLASSES) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="swatch" style="background:${cls.css}"></span>${cls.label}`;
  $('floodLegend').appendChild(li);
}

// ---- 航空写真 ----
let photoLayer = null;
$('layer-photo').addEventListener('change', (e) => {
  if (e.target.checked && !photoLayer) {
    photoLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: GSI_PHOTO,
        maximumLevel: 18,
        credit: new Cesium.Credit('地理院タイル (写真)'),
      }),
      1 // ベースの直上・ハザードの下
    );
  } else if (photoLayer) {
    photoLayer.show = e.target.checked;
  }
});

// ---- 避難場所 ----
setStatus('shelter', '避難場所: 読み込み中…');
let shelters = [];
let shelterEntities = [];
fetchShelters()
  .then(({ shelters: list, source }) => {
    shelters = list;
    shelterEntities = addShelterEntities(viewer, list);
    for (const ent of shelterEntities) ent.show = $('layer-shelters').checked;
    setStatus('shelter', `避難場所: ${list.length}件 (${source})`, 'ok');
  })
  .catch((err) => {
    console.error(err);
    setStatus('shelter', '避難場所: 読み込み失敗', 'error');
  });
$('layer-shelters').addEventListener('change', (e) => {
  for (const ent of shelterEntities) ent.show = e.target.checked;
});

// ---- 町データオーバーレイ (緊急輸送道路・町域界) ----
for (const [key, noteId] of [['emergency_route', 'er-note'], ['border', 'border-note']]) {
  const checkbox = $(`layer-${key}`);
  const note = $(noteId);
  loadCityOverlay(viewer, key)
    .then((ds) => {
      if (!ds) {
        note.textContent = '(データ取得不可)';
        return;
      }
      checkbox.disabled = false;
      note.textContent = '';
      checkbox.addEventListener('change', (e) => { ds.show = e.target.checked; });
    })
    .catch(() => { note.textContent = '(データ取得不可)'; });
}

// ---- 建物リスク色分け ----
$('layer-bldgrisk').addEventListener('change', (e) => {
  if (e.target.checked && !riskAnalyzer.hasRiskAttributes()) {
    $('bldgrisk-note').textContent =
      riskAnalyzer.stats.total === 0 ? '(建物の読み込み待ち)' : '(この都市モデルに浸水ランク属性なし)';
    if (riskAnalyzer.stats.total > 0) {
      // 属性が無い場合はチェックを戻す
      e.target.checked = false;
      toast('この3D都市モデルには建物単位の浸水ランク属性が含まれていません');
      return;
    }
  } else {
    $('bldgrisk-note').textContent = '';
  }
  riskAnalyzer.setColoring(buildingTilesets, e.target.checked);
  viewer.scene.requestRender?.();
});

// ---- 浸水深の3D表示 (高さ付き水柱) ----
let waterPrimitive = null;
let waterLoading = false;
$('layer-water3d').addEventListener('change', async (e) => {
  const note = $('water3d-note');
  if (waterPrimitive) {
    waterPrimitive.show = e.target.checked;
    return;
  }
  if (!e.target.checked || waterLoading) return;
  waterLoading = true;
  try {
    note.textContent = '(解析中…)';
    waterPrimitive = await buildWaterColumns(viewer, (done, total) => {
      note.textContent = `(解析中… ${done}/${total})`;
    });
    if (!waterPrimitive) {
      note.textContent = '(データ取得不可)';
      e.target.checked = false;
      return;
    }
    note.textContent = '';
    waterPrimitive.show = $('layer-water3d').checked;
  } catch (err) {
    console.error(err);
    note.textContent = '(取得失敗)';
    e.target.checked = false;
    toast('浸水深データの解析に失敗しました');
  } finally {
    waterLoading = false;
  }
});

// ---- 町全体統計ダッシュボード ----
initDashboard(riskAnalyzer);

// ---- パネル開閉 ----
const panel = $('panel');
$('fabLayers').addEventListener('click', () => { panel.hidden = !panel.hidden; });
$('panelClose').addEventListener('click', () => { panel.hidden = true; });
if (window.matchMedia('(min-width: 641px)').matches) panel.hidden = false;

// ---- アクセシビリティ: 文字サイズ切替・Escで閉じる ----
const FONT_KEY = 'sango-font-large';
const fontToggle = $('fontLarge');
const applyFontSize = (large) => {
  document.body.classList.toggle('font-large', large);
  fontToggle.checked = large;
};
applyFontSize(localStorage.getItem(FONT_KEY) === '1');
fontToggle.addEventListener('change', () => {
  applyFontSize(fontToggle.checked);
  localStorage.setItem(FONT_KEY, fontToggle.checked ? '1' : '0');
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const id of ['resultCard', 'dashCard']) {
    const el = $(id);
    if (!el.hidden) {
      el.hidden = true;
      if (id === 'resultCard' && marker) marker.show = false;
      return;
    }
  }
  if (!panel.hidden && isMobile()) panel.hidden = true;
});

// ---- 地点リスク診断 ----
const resultCard = $('resultCard');
$('resultClose').addEventListener('click', () => {
  resultCard.hidden = true;
  if (marker) marker.show = false;
});

let marker = null;
function showMarker(lon, lat) {
  if (!marker) {
    marker = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString('#f97316'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  marker.position = Cesium.Cartesian3.fromDegrees(lon, lat);
  marker.show = true;
}

const inCity = (lon, lat) =>
  lon >= CITY_BBOX.west && lon <= CITY_BBOX.east &&
  lat >= CITY_BBOX.south && lat <= CITY_BBOX.north;

const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

async function runDiagnosis(lon, lat, placeName, extraRowHtml = '') {
  showMarker(lon, lat);
  $('resultTitle').textContent = placeName ?? 'この地点のリスク';
  $('resultBody').innerHTML = '<div class="loading-dots">診断中…</div>';
  resultCard.hidden = false;
  if (isMobile()) panel.hidden = true; // モバイルでは結果カードと重なるため閉じる

  try {
    const risk = await diagnosePoint(lon, lat);
    const rows = [];
    if (extraRowHtml) rows.push(extraRowHtml);

    if (risk.flood) {
      rows.push(`
        <div class="risk-row bad">
          <span class="icon">🌊</span>
          <div>洪水で <span class="depth-chip" style="background:${risk.flood.css}">${risk.flood.label}</span> の浸水が想定されています
            <span class="advice">${risk.flood.advice ?? ''}</span></div>
        </div>`);
    } else {
      rows.push(`
        <div class="risk-row ok"><span class="icon">🌊</span>
          <div>洪水の浸水想定区域<b>外</b>です</div></div>`);
    }

    const ls = risk.landslide;
    const lsTypes = [
      ls.dosekiryu && '土石流',
      ls.kyukeisha && '急傾斜地の崩壊',
      ls.jisuberi && '地すべり',
    ].filter(Boolean);
    if (lsTypes.length) {
      rows.push(`
        <div class="risk-row bad"><span class="icon">⛰️</span>
          <div>土砂災害警戒区域 (<b>${lsTypes.join('・')}</b>) に該当する可能性があります
            <span class="advice">大雨のときは早めに区域の外へ避難してください</span></div></div>`);
    } else {
      rows.push(`
        <div class="risk-row ok"><span class="icon">⛰️</span>
          <div>土砂災害警戒区域<b>外</b>です</div></div>`);
    }

    const filter = risk.flood ? '洪水' : lsTypes.length ? '土砂' : null;
    const nearest = shelters.length ? nearestShelter(shelters, lon, lat, filter) : null;
    if (nearest) {
      const { shelter: s, dist } = nearest;
      const minutes = Math.max(1, Math.ceil(dist / 80)); // 徒歩80m/分
      const dir = compassDirection(lon, lat, s.lon, s.lat);
      rows.push(`
        <div class="shelter-row">🏃 最寄りの避難場所
          <div><b>${escapeHtml(s.name)}</b></div>
          <div class="meta">${dir}へ約${Math.round(dist)}m・徒歩約${minutes}分${s.kind ? `・${escapeHtml(s.kind)}` : ''}</div>
          <a class="route-link" target="_blank" rel="noopener"
             href="https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${s.lat},${s.lon}&travelmode=walking">
             経路を見る</a>
        </div>`);
    }

    if (!inCity(lon, lat)) {
      rows.push('<p class="result-note">⚠️ この地点は三郷町の外です。表示は全国データに基づく参考値です。</p>');
    }
    rows.push('<p class="result-note">出典: ハザードマップポータルサイト (想定最大規模)。参考情報であり、実際の災害はこれと異なる場合があります。</p>');
    $('resultBody').innerHTML = rows.join('');
  } catch (err) {
    console.error(err);
    $('resultBody').innerHTML =
      '<p class="result-note">診断に失敗しました。通信状況をご確認のうえ、もう一度お試しください。</p>';
  }
}

// 避難所カード (InfoBoxの代わり)
function showShelterCard(s) {
  $('resultTitle').textContent = '避難場所の情報';
  $('resultBody').innerHTML = `
    <div class="shelter-row">🏫 <b>${escapeHtml(s.name)}</b>
      <div class="meta">${escapeHtml(s.address)}${s.kind ? `・${escapeHtml(s.kind)}` : ''}${s.capacity ? `・収容${s.capacity}人` : ''}</div>
      <div class="meta">対応災害: ${escapeHtml(s.disasters.join('、')) || '指定なし'}</div>
      <a class="route-link" target="_blank" rel="noopener"
         href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking">経路を見る</a>
    </div>
    <p class="result-note">出典: ${s.official ? 'PLATEAU 三郷町関連データセット' : '国土地理院 指定緊急避難場所データ'}</p>`;
  resultCard.hidden = false;
  if (isMobile()) panel.hidden = true;
}

// 建物クリック時の追加情報行
function buildingInfoRow(info) {
  const parts = [];
  if (info.usage) parts.push(escapeHtml(info.usage));
  if (info.height) parts.push(`高さ${info.height.toFixed(1)}m`);
  if (info.storeys) parts.push(`約${info.storeys}階建て`);
  if (parts.length === 0 && info.classIdx < 0) return '';
  const rank = info.classIdx >= 0
    ? `<div class="meta">この建物の浸水ランク (PLATEAU属性):
        <span class="depth-chip" style="background:${FLOOD_DEPTH_CLASSES[info.classIdx].css}">${FLOOD_DEPTH_CLASSES[info.classIdx].label}</span>
        ${info.classIdx >= 2 && info.storeys != null && info.storeys <= 2
          ? '<b class="dash-danger"> — 2階建て以下のため屋内の垂直避難は困難です</b>' : ''}</div>`
    : '';
  return `<div class="risk-row"><span class="icon">🏠</span>
    <div>${parts.join('・') || '建物'}${rank}</div></div>`;
}

// 地図タップで診断。建物タップはその建物の診断、避難所タップは施設カード。
const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
handler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.position);

  // 避難所などのエンティティ → 専用カード
  if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity && picked.id !== marker) {
    if (picked.id.sangoShelter) showShelterCard(picked.id.sangoShelter);
    return;
  }

  const cartesian =
    viewer.scene.pickPosition(movement.position) ??
    viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  let lon = Cesium.Math.toDegrees(carto.longitude);
  let lat = Cesium.Math.toDegrees(carto.latitude);

  // 建物 (3D Tiles) タップ → 建物の代表点で診断し、建物情報を添える
  if (picked instanceof Cesium.Cesium3DTileFeature) {
    const info = riskAnalyzer.describe(picked);
    if (Number.isFinite(info.lon) && Number.isFinite(info.lat)) {
      lon = info.lon;
      lat = info.lat;
    }
    runDiagnosis(lon, lat, 'この建物のリスク', buildingInfoRow(info));
    return;
  }
  runDiagnosis(lon, lat);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ---- 現在地診断 ----
$('fabLocate').addEventListener('click', () => {
  if (!navigator.geolocation) {
    toast('この端末では現在地を取得できません');
    return;
  }
  toast('現在地を取得しています…', 8000);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { longitude: lon, latitude: lat } = pos.coords;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.008, 1500),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
        duration: 1.5,
      });
      runDiagnosis(lon, lat, '現在地のリスク');
    },
    () => toast('現在地を取得できませんでした。位置情報の許可を確認してください。'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ---- 住所検索 (地理院ジオコーダ) ----
$('searchBar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('searchInput').value.trim();
  if (!q) return;
  const search = async (query) => {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    return res.json();
  };
  try {
    let results = await search(q.includes('三郷') ? q : `奈良県生駒郡三郷町${q}`);
    if (!results.length) results = await search(q);
    if (!results.length) {
      toast(`「${q}」が見つかりませんでした`);
      return;
    }
    const hit = results[0];
    const [lon, lat] = hit.geometry.coordinates;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.008, 1500),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
      duration: 1.5,
    });
    runDiagnosis(lon, lat, hit.properties?.title ?? q);
    $('searchInput').blur();
  } catch (err) {
    console.error(err);
    toast('検索に失敗しました。通信状況をご確認ください。');
  }
});

// ---- オフライン対応 (PWA) ----
registerServiceWorker();

function renderOfflineNote() {
  const meta = offlineMeta();
  if (!meta) {
    $('offline-note').textContent = 'まだ保存されていません';
    return;
  }
  const date = new Date(meta.savedAt);
  $('offline-note').textContent =
    `保存済み: ${date.getMonth() + 1}月${date.getDate()}日 (タイル${meta.ok + meta.notFound}件)`;
}

const offlineSaveBtn = $('offlineSave');
if (!offlineSupported()) {
  offlineSaveBtn.disabled = true;
  $('offline-note').textContent = 'この端末・ブラウザでは利用できません';
} else {
  renderOfflineNote();
  offlineSaveBtn.addEventListener('click', async () => {
    if (!navigator.onLine) {
      toast('オフラインのため保存できません。通信できる場所でお試しください。');
      return;
    }
    offlineSaveBtn.disabled = true;
    try {
      await saveOfflineArea((done, total) => {
        $('offline-note').textContent = `保存中… ${done}/${total}`;
      });
      renderOfflineNote();
      toast('町内のデータを保存しました。電波がない場所でも診断できます。');
    } catch (err) {
      console.error(err);
      $('offline-note').textContent = '保存に失敗しました';
      toast(err.message ?? 'オフラインデータの保存に失敗しました');
    } finally {
      offlineSaveBtn.disabled = false;
    }
  });
}

watchOnlineState((online) => {
  const badge = $('offlineBadge');
  badge.hidden = online;
  if (!online) {
    badge.textContent = offlineMeta()
      ? '📡 オフライン表示中 — 保存済みデータで診断できます'
      : '📡 オフラインです — データ未保存のため表示が制限されます';
  }
});

// ---- 初回ヒント ----
if (!localStorage.getItem('sango-hint-shown')) {
  setTimeout(() => {
    toast('地図をタップすると、その場所の災害リスクと最寄りの避難場所がわかります', 7000);
    localStorage.setItem('sango-hint-shown', '1');
  }, 1500);
}
