import * as Cesium from 'cesium';
import { CITY_BBOX } from './config.js';
import { fetchCityDatasets } from './plateau.js';
import { parseOfficialShelters, findGeoJsonDataset } from './lib/geomath.js';
export { nearestShelter, distanceMeters } from './lib/geomath.js';

// 避難施設の取得。優先順:
//   1. PLATEAUデータカタログAPIの「避難施設」GeoJSON (最新の公式配信)
//   2. 同梱の public/data/shelter.geojson (PLATEAU関連データセット、CRC検証済み)
//   3. 国土地理院 指定緊急避難場所タイル (全国データ)
export async function fetchShelters() {
  const fromCatalog = await fetchSheltersFromCatalog().catch(() => null);
  if (fromCatalog?.length) return { shelters: fromCatalog, source: '三郷町公式データ (PLATEAU配信)' };
  const local = await fetchLocalShelters().catch(() => null);
  if (local?.length) return { shelters: local, source: '三郷町公式データ (同梱)' };
  const gsi = await fetchGsiShelters();
  return { shelters: gsi, source: '国土地理院 指定緊急避難場所' };
}

async function fetchSheltersFromCatalog() {
  const datasets = await fetchCityDatasets();
  const ds = findGeoJsonDataset(datasets, 'shelter');
  if (!ds) return null;
  const res = await fetch(ds.url);
  if (!res.ok) return null;
  return parseOfficialShelters(await res.json());
}

async function fetchLocalShelters() {
  const res = await fetch('./data/shelter.geojson');
  if (!res.ok) return null;
  return parseOfficialShelters(await res.json());
}

// ---- 国土地理院 指定緊急避難場所 GeoJSONタイル (フォールバック) ----
const SKHB_BASE = 'https://cyberjapandata.gsi.go.jp/xyz';
const SKHB_LAYERS = [
  { id: 'skhb01', disaster: '洪水' },
  { id: 'skhb02', disaster: '崖崩れ・土石流・地すべり' },
  { id: 'skhb04', disaster: '地震' },
  { id: 'skhb06', disaster: '大規模な火事' },
];
const TILE_Z = 10;

function* bboxTiles(bbox, z) {
  const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat) => {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
    );
  };
  for (let x = lon2x(bbox.west); x <= lon2x(bbox.east); x++) {
    for (let y = lat2y(bbox.north); y <= lat2y(bbox.south); y++) yield { x, y };
  }
}

async function fetchGsiShelters() {
  const byKey = new Map();
  const tasks = [];
  for (const layer of SKHB_LAYERS) {
    for (const { x, y } of bboxTiles(CITY_BBOX, TILE_Z)) {
      tasks.push(
        fetch(`${SKHB_BASE}/${layer.id}/${TILE_Z}/${x}/${y}.geojson`)
          .then((r) => (r.ok ? r.json() : null))
          .then((geojson) => ({ layer, geojson }))
          .catch(() => null)
      );
    }
  }
  for (const result of await Promise.all(tasks)) {
    if (!result?.geojson?.features) continue;
    for (const f of result.geojson.features) {
      const [lon, lat] = f.geometry?.coordinates ?? [];
      if (lon == null) continue;
      if (
        lon < CITY_BBOX.west || lon > CITY_BBOX.east ||
        lat < CITY_BBOX.south || lat > CITY_BBOX.north
      ) continue;
      const name = f.properties?.name ?? '避難場所';
      const key = `${lon.toFixed(6)},${lat.toFixed(6)},${name}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          lon, lat, name,
          address: f.properties?.address ?? '',
          kind: '指定緊急避難場所',
          capacity: null,
          disasters: new Set(),
          official: false,
        });
      }
      byKey.get(key).disasters.add(result.layer.disaster);
    }
  }
  return [...byKey.values()].map((s) => ({ ...s, disasters: [...s.disasters] }));
}

// ---- 表示 ----
export function addShelterEntities(viewer, shelters) {
  const entities = [];
  for (const s of shelters) {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
      billboard: {
        image: shelterIcon(),
        width: 30,
        height: 38,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: s.name,
        font: '600 13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#14532d'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -40),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000),
      },
    });
    entity.sangoShelter = s; // クリック時に独自カードで表示するための元データ
    entities.push(entity);
  }
  return entities;
}

// 緑のピン型アイコンをSVGで生成 (外部画像に依存しない)
let iconUrl = null;
function shelterIcon() {
  if (iconUrl) return iconUrl;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="76" viewBox="0 0 60 76">
    <path d="M30 2C15 2 4 13 4 28c0 20 26 46 26 46s26-26 26-46C56 13 45 2 30 2z"
      fill="#16a34a" stroke="#ffffff" stroke-width="4"/>
    <path d="M30 14L16 26h5v12h8v-8h2v8h8V26h5z" fill="#ffffff"/>
  </svg>`;
  iconUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return iconUrl;
}
