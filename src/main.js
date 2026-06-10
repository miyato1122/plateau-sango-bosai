import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  HOME_VIEW, CITY_BBOX, GSI_PALE, GSI_PHOTO,
  PLATEAU_TERRAIN_ION_ASSET, PLATEAU_ION_TOKEN,
} from './config.js';
import { loadBuildingTilesets } from './plateau.js';
import { createHazardLayer, HAZARD_LAYERS, FLOOD_DEPTH_CLASSES } from './hazards.js';
import { fetchShelters, addShelterEntities, nearestShelter } from './shelters.js';
import { loadCityOverlay } from './citydata.js';
import { diagnosePoint } from './risk.js';
import { compassDirection } from './lib/geomath.js';

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
Cesium.Ion.defaultAccessToken = PLATEAU_ION_TOKEN;

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
});
viewer.scene.globe.depthTestAgainstTerrain = true;

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

// ---- PLATEAU地形 (失敗時は平坦のまま) ----
setStatus('terrain', '地形 (PLATEAU-Terrain): 読み込み中…');
Cesium.CesiumTerrainProvider.fromIonAssetId(PLATEAU_TERRAIN_ION_ASSET)
  .then((tp) => {
    viewer.terrainProvider = tp;
    setStatus('terrain', '地形 (PLATEAU-Terrain): 読み込み完了', 'ok');
  })
  .catch(() => setStatus('terrain', '地形: 取得不可のため平坦表示', 'warn'));

// ---- PLATEAU 3D建物 ----
setStatus('bldg', '3D建物: データカタログ照会中…');
let buildingTilesets = [];
loadBuildingTilesets(viewer, (msg) => setStatus('bldg', `3D建物: ${msg}`))
  .then(({ tilesets }) => {
    buildingTilesets = tilesets;
    for (const t of tilesets) t.show = $('layer-buildings').checked;
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

// ---- パネル開閉 ----
const panel = $('panel');
$('fabLayers').addEventListener('click', () => { panel.hidden = !panel.hidden; });
$('panelClose').addEventListener('click', () => { panel.hidden = true; });
if (window.matchMedia('(min-width: 641px)').matches) panel.hidden = false;

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

async function runDiagnosis(lon, lat, placeName) {
  showMarker(lon, lat);
  $('resultTitle').textContent = placeName ?? 'この地点のリスク';
  $('resultBody').innerHTML = '<div class="loading-dots">診断中…</div>';
  resultCard.hidden = false;
  panel.hidden = true;

  try {
    const risk = await diagnosePoint(lon, lat);
    const rows = [];

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

// 地図タップで診断 (避難所アイコンのタップ時は通常の情報表示を優先)
const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
handler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.position);
  if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity && picked.id !== marker) {
    return; // 既存エンティティの選択を優先
  }
  const cartesian =
    viewer.scene.pickPosition(movement.position) ??
    viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  runDiagnosis(
    Cesium.Math.toDegrees(carto.longitude),
    Cesium.Math.toDegrees(carto.latitude)
  );
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

// ---- 初回ヒント ----
if (!localStorage.getItem('sango-hint-shown')) {
  setTimeout(() => {
    toast('地図をタップすると、その場所の災害リスクと最寄りの避難場所がわかります', 7000);
    localStorage.setItem('sango-hint-shown', '1');
  }, 1500);
}
