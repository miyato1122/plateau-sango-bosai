import * as Cesium from 'cesium';
import { CITY_CODE, PLATEAU_DATASETS_API } from './config.js';

const CACHE_KEY = `plateau-datasets-${CITY_CODE}`;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// PLATEAUデータカタログAPIから三郷町の3D Tilesデータセット一覧を取得する。
// レスポンスは約2MBあるため、町分のみをlocalStorageにキャッシュする。
export async function fetchCityDatasets() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      return cached.datasets;
    }
  } catch {
    /* キャッシュ破損時は取得し直す */
  }

  const res = await fetch(PLATEAU_DATASETS_API);
  if (!res.ok) throw new Error(`データカタログAPIの取得に失敗 (HTTP ${res.status})`);
  const json = await res.json();
  const datasets = (json.datasets ?? []).filter(
    (d) => d.city_code === CITY_CODE || d.ward_code === CITY_CODE
  );
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), datasets }));
  } catch {
    /* 容量超過などは無視 */
  }
  return datasets;
}

// 建築物モデル(3D Tiles)を選ぶ。テクスチャ付き・高LODを優先する。
export function pickBuildingDatasets(datasets) {
  const bldg = datasets.filter(
    (d) =>
      d.type_en === 'bldg' &&
      typeof d.url === 'string' &&
      d.url.includes('tileset.json')
  );
  if (bldg.length === 0) return [];
  const score = (d) =>
    Number.parseFloat(d.lod ?? '0') * 10 + (d.texture ? 1 : 0);
  const best = Math.max(...bldg.map(score));
  return bldg.filter((d) => score(d) === best);
}

export async function loadBuildingTilesets(viewer, onStatus) {
  const datasets = await fetchCityDatasets();
  if (datasets.length === 0) {
    throw new Error('データカタログに三郷町(29343)のデータが見つかりませんでした');
  }
  const targets = pickBuildingDatasets(datasets);
  if (targets.length === 0) {
    throw new Error('建築物モデル(3D Tiles)が見つかりませんでした');
  }

  const tilesets = [];
  for (const d of targets) {
    onStatus?.(`建物モデル読込中: ${d.name}`);
    const tileset = await Cesium.Cesium3DTileset.fromUrl(d.url, {
      maximumScreenSpaceError: 16,
    });
    viewer.scene.primitives.add(tileset);
    tilesets.push(tileset);
  }
  return { tilesets, datasets };
}
