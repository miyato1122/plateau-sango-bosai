import * as Cesium from 'cesium';
import { CITY_BBOX } from './config.js';

// 国土地理院「指定緊急避難場所」GeoJSONタイル。skhb01〜08は災害種別ごとのレイヤ。
// https://maps.gsi.go.jp/development/ichiran.html
const SKHB_BASE = 'https://cyberjapandata.gsi.go.jp/xyz';
const SKHB_LAYERS = [
  { id: 'skhb01', disaster: '洪水' },
  { id: 'skhb02', disaster: '崖崩れ・土石流・地すべり' },
  { id: 'skhb03', disaster: '高潮' },
  { id: 'skhb04', disaster: '地震' },
  { id: 'skhb05', disaster: '津波' },
  { id: 'skhb06', disaster: '大規模な火事' },
  { id: 'skhb07', disaster: '内水氾濫' },
  { id: 'skhb08', disaster: '火山現象' },
];
const TILE_Z = 10; // skhbタイルの提供ズーム

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
}

function* bboxTiles(bbox, z) {
  const x0 = lonToTileX(bbox.west, z);
  const x1 = lonToTileX(bbox.east, z);
  const y0 = latToTileY(bbox.north, z);
  const y1 = latToTileY(bbox.south, z);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) yield { x, y };
  }
}

// 三郷町公式の避難施設GeoJSON (PLATEAU関連データセット、public/data/に同梱)。
// 存在しない場合はnullを返し、呼び出し側で地理院データにフォールバックする。
export async function fetchOfficialShelters() {
  const res = await fetch('./data/shelter.geojson').catch(() => null);
  if (!res?.ok) return null;
  const geojson = await res.json();
  const shelters = [];
  for (const f of geojson.features ?? []) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties ?? {};
    const capacity = p['収容人数'];
    shelters.push({
      lon, lat,
      name: p['名称'] ?? '避難施設',
      address: p['住所'] ?? '',
      kind: p['施設の種類'] ?? '',
      capacity: capacity > 0 ? capacity : null,
      disasters: (p['対象とする災害の分類'] ?? '')
        .split(/[、,;]/)
        .map((s) => s.trim())
        .filter((s) => s && s !== '指定なし'),
      official: true,
    });
  }
  return shelters.length > 0 ? shelters : null;
}

// 町域bbox内の指定緊急避難場所を全災害種別レイヤから取得し、
// 同一地点 (座標+名称) をマージして対応災害種別を集約する。
export async function fetchShelters() {
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
      const name = f.properties?.name ?? f.properties?.['名称'] ?? '避難場所';
      const key = `${lon.toFixed(6)},${lat.toFixed(6)},${name}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          lon, lat, name,
          address: f.properties?.address ?? f.properties?.['住所'] ?? '',
          disasters: new Set(),
        });
      }
      byKey.get(key).disasters.add(result.layer.disaster);
    }
  }
  return [...byKey.values()].map((s) => ({ ...s, disasters: [...s.disasters] }));
}

export function addShelterEntities(viewer, shelters) {
  const entities = [];
  for (const s of shelters) {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#1a9850'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: s.name,
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000),
      },
      description: `
        <h3>${s.name}</h3>
        <p>${s.address}</p>
        ${s.kind ? `<p><b>施設の種類:</b> ${s.kind}</p>` : ''}
        ${s.capacity ? `<p><b>収容人数:</b> ${s.capacity}人</p>` : ''}
        <p><b>対応災害種別:</b> ${s.disasters.join('、') || '指定なし'}</p>
        <p>出典: ${s.official ? 'PLATEAU 三郷町関連データセット (避難施設)' : '国土地理院 指定緊急避難場所データ'}</p>`,
    });
    entities.push(entity);
  }
  return entities;
}

// ハバーサイン距離 (m)
export function distanceMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestShelter(shelters, lon, lat, disasterFilter) {
  let best = null;
  for (const s of shelters) {
    if (disasterFilter && !s.disasters.some((d) => d.includes(disasterFilter))) continue;
    const dist = distanceMeters(lon, lat, s.lon, s.lat);
    if (!best || dist < best.dist) best = { shelter: s, dist };
  }
  return best;
}
