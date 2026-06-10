import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  HOME_VIEW, GSI_PALE, GSI_PHOTO,
  PLATEAU_TERRAIN_ION_ASSET, PLATEAU_ION_TOKEN,
} from './config.js';
import { loadBuildingTilesets } from './plateau.js';
import { createHazardLayer, FLOOD_DEPTH_CLASSES } from './hazards.js';
import {
  fetchShelters, fetchOfficialShelters, addShelterEntities, nearestShelter,
} from './shelters.js';
import { loadCityOverlay } from './citydata.js';
import { diagnosePoint } from './risk.js';
import { FloodSimulator } from './floodsim.js';

const statusList = document.getElementById('statusList');
function setStatus(id, text, state = 'loading') {
  let li = document.getElementById(`status-${id}`);
  if (!li) {
    li = document.createElement('li');
    li.id = `status-${id}`;
    statusList.appendChild(li);
  }
  li.textContent = text;
  li.dataset.state = state;
}

// ---- Viewer初期化 (ベースマップ: 地理院淡色) ----
Cesium.Ion.defaultAccessToken = PLATEAU_ION_TOKEN;

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: GSI_PALE,
      maximumLevel: 18,
      credit: new Cesium.Credit('地理院タイル'),
    })
  ),
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: true,
  timeline: false,
  animation: false,
});
viewer.scene.globe.depthTestAgainstTerrain = true;

function flyHome(duration = 0) {
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
viewer.homeButton.viewModel.command.beforeExecute.addEventListener((e) => {
  e.cancel = true;
  flyHome(1.2);
});

// ---- PLATEAU地形 (取得できなければ楕円体のまま) ----
setStatus('terrain', '地形: 読み込み中…');
Cesium.CesiumTerrainProvider.fromIonAssetId(PLATEAU_TERRAIN_ION_ASSET)
  .then((tp) => {
    viewer.terrainProvider = tp;
    setStatus('terrain', '地形: PLATEAU-Terrain 読み込み完了', 'ok');
  })
  .catch(() => setStatus('terrain', '地形: 取得不可のため平坦表示', 'warn'));

// ---- PLATEAU 3D建物 ----
setStatus('bldg', '3D建物: データカタログ照会中…');
let buildingTilesets = [];
loadBuildingTilesets(viewer, (msg) => setStatus('bldg', `3D建物: ${msg}`))
  .then(({ tilesets }) => {
    buildingTilesets = tilesets;
    setStatus('bldg', `3D建物: 読み込み完了 (${tilesets.length}タイルセット)`, 'ok');
  })
  .catch((err) => {
    console.error(err);
    setStatus('bldg', `3D建物: 読み込み失敗 — ${err.message}`, 'error');
  });

// ---- ハザードレイヤ ----
const opacityInput = document.getElementById('hazardOpacity');
const initialAlpha = Number(opacityInput.value) / 100;
const hazardLayers = {
  flood: createHazardLayer(viewer, 'flood', initialAlpha),
  dosekiryu: createHazardLayer(viewer, 'dosekiryu', initialAlpha),
  kyukeisha: createHazardLayer(viewer, 'kyukeisha', initialAlpha),
  jisuberi: createHazardLayer(viewer, 'jisuberi', initialAlpha),
};
hazardLayers.flood.show = true;

for (const key of Object.keys(hazardLayers)) {
  document.getElementById(`layer-${key}`).addEventListener('change', (e) => {
    hazardLayers[key].show = e.target.checked;
  });
}
opacityInput.addEventListener('input', () => {
  const alpha = Number(opacityInput.value) / 100;
  for (const layer of Object.values(hazardLayers)) layer.alpha = alpha;
});

document.getElementById('layer-buildings').addEventListener('change', (e) => {
  for (const t of buildingTilesets) t.show = e.target.checked;
});

// 航空写真ベースマップ切替
let photoLayer = null;
document.getElementById('layer-photo').addEventListener('change', (e) => {
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
(async () => {
  try {
    // 町公式データ (同梱GeoJSON) を優先し、なければ地理院データ
    const official = await fetchOfficialShelters();
    shelters = official ?? (await fetchShelters());
    shelterEntities = addShelterEntities(viewer, shelters);
    setStatus(
      'shelter',
      `避難場所: ${shelters.length}件 (${official ? '三郷町公式データ' : '地理院データ'})`,
      'ok'
    );
  } catch (err) {
    console.error(err);
    setStatus('shelter', '避難場所: 読み込み失敗', 'error');
  }
})();

// 町データオーバーレイ (緊急輸送道路・町域界)。GeoJSON未配置ならチェックボックスを無効化。
for (const key of ['emergency_route', 'border']) {
  const checkbox = document.getElementById(`layer-${key}`);
  loadCityOverlay(viewer, key)
    .then((ds) => {
      if (!ds) {
        checkbox.disabled = true;
        return;
      }
      checkbox.addEventListener('change', (e) => {
        ds.show = e.target.checked;
      });
    })
    .catch(() => {
      checkbox.disabled = true;
    });
}
document.getElementById('layer-shelters').addEventListener('change', (e) => {
  for (const ent of shelterEntities) ent.show = e.target.checked;
});

// ---- 浸水疑似体験 ----
const floodSim = new FloodSimulator(viewer);
const depthInput = document.getElementById('floodDepth');
const depthLabel = document.getElementById('floodDepthLabel');
depthInput.addEventListener('input', () => {
  const depth = Number(depthInput.value) / 10; // 0〜10.0m
  depthLabel.textContent = `${depth.toFixed(1)} m`;
  floodSim.setDepth(depth);
});

// ---- 凡例 ----
const legend = document.getElementById('floodLegend');
for (const cls of FLOOD_DEPTH_CLASSES) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="swatch" style="background:${cls.css}"></span>${cls.label}`;
  legend.appendChild(li);
}

// ---- 地点リスク診断 ----
const diagnoseBtn = document.getElementById('diagnoseBtn');
const resultBox = document.getElementById('diagnoseResult');
let diagnosing = false;
let marker = null;

diagnoseBtn.addEventListener('click', () => {
  diagnosing = !diagnosing;
  diagnoseBtn.textContent = diagnosing ? '診断モード中 (地図をクリック)' : '診断モード開始';
  diagnoseBtn.classList.toggle('active', diagnosing);
  viewer.canvas.style.cursor = diagnosing ? 'crosshair' : '';
});

const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
handler.setInputAction(async (movement) => {
  if (!diagnosing) return;
  const cartesian =
    viewer.scene.pickPosition(movement.position) ??
    viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);

  if (marker) viewer.entities.remove(marker);
  marker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: {
      pixelSize: 12,
      color: Cesium.Color.ORANGE,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  resultBox.hidden = false;
  resultBox.innerHTML = '<p>診断中…</p>';
  try {
    const risk = await diagnosePoint(lon, lat);
    const parts = [];
    parts.push(
      risk.flood
        ? `<p class="risk-bad">🌊 洪水: 浸水想定 <b>${risk.flood.label}</b></p>`
        : '<p class="risk-ok">🌊 洪水: 浸水想定区域外</p>'
    );
    const ls = risk.landslide;
    const lsTypes = [
      ls.dosekiryu && '土石流',
      ls.kyukeisha && '急傾斜地',
      ls.jisuberi && '地すべり',
    ].filter(Boolean);
    parts.push(
      lsTypes.length
        ? `<p class="risk-bad">⛰️ 土砂災害警戒区域: <b>${lsTypes.join('・')}</b></p>`
        : '<p class="risk-ok">⛰️ 土砂災害警戒区域外</p>'
    );

    const disasterFilter = risk.flood ? '洪水' : lsTypes.length ? '土' : null;
    const nearest = nearestShelter(shelters, lon, lat, disasterFilter)
      ?? nearestShelter(shelters, lon, lat, null);
    if (nearest) {
      parts.push(
        `<p>🏃 最寄り避難場所: <b>${nearest.shelter.name}</b> (約${Math.round(nearest.dist)}m)</p>`
      );
    }
    parts.push(`<p class="hint">地点: ${lat.toFixed(5)}, ${lon.toFixed(5)}（参考情報）</p>`);
    resultBox.innerHTML = parts.join('');
  } catch (err) {
    console.error(err);
    resultBox.innerHTML = '<p>診断に失敗しました。通信状況をご確認ください。</p>';
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ---- パネル開閉 (モバイル) ----
document.getElementById('panelToggle').addEventListener('click', () => {
  document.getElementById('controlPanel').classList.toggle('open');
});
