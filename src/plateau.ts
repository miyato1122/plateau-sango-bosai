import * as Cesium from 'cesium';
import { CITY_CODE, PLATEAU_DATASETS_API } from './config';
import { pickBuildingDatasets } from './lib/geomath';
import { parseCatalogDatasets } from './lib/validate';

const CACHE_KEY = `plateau-datasets-${CITY_CODE}`;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// PLATEAUデータカタログAPIから三郷町のデータセット一覧を取得する。
// レスポンスは約2MBあるため、町分のみをlocalStorageにキャッシュする。
let inflight = null;
export function fetchCityDatasets() {
  inflight ??= (async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
      if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        const datasets = parseCatalogDatasets(cached.datasets);
        if (datasets) return datasets;
      }
    } catch {
      /* キャッシュ破損時は取得し直す */
    }
    const res = await fetch(PLATEAU_DATASETS_API);
    if (!res.ok) throw new Error(`データカタログAPIの取得に失敗 (HTTP ${res.status})`);
    const json = await res.json();
    const all = parseCatalogDatasets(json);
    if (!all) throw new Error('データカタログAPIの応答形式が想定と異なります');
    const datasets = all.filter((d) => d.city_code === CITY_CODE || d.ward_code === CITY_CODE);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), datasets }));
    } catch {
      /* 容量超過などは無視 */
    }
    return datasets;
  })();
  inflight.catch(() => {
    inflight = null; // 失敗時は次回再試行できるようにする
  });
  return inflight;
}

export async function loadBuildingTilesets(
  viewer: Cesium.Viewer,
  onStatus?: (msg: string) => void,
) {
  const datasets = await fetchCityDatasets();
  if (datasets.length === 0) {
    throw new Error('データカタログに三郷町(29343)のデータが見つかりませんでした');
  }
  const targets = pickBuildingDatasets(datasets);
  if (targets.length === 0) {
    throw new Error('建築物モデル(3D Tiles)が見つかりませんでした');
  }

  const tilesets: Cesium.Cesium3DTileset[] = [];
  for (const d of targets) {
    if (typeof d.url !== 'string') continue;
    onStatus?.(`建物モデル読込中: ${String(d.name ?? '')}`);
    const tileset = await Cesium.Cesium3DTileset.fromUrl(d.url, {
      maximumScreenSpaceError: 16,
    });
    viewer.scene.primitives.add(tileset);
    tilesets.push(tileset);
  }
  return { tilesets, datasets };
}
