import * as Cesium from 'cesium';
import { fetchCityDatasets } from './plateau';
import { findGeoJsonDataset } from './lib/geomath';
import { isFeatureCollection } from './lib/validate';

// 町データオーバーレイ (PLATEAU関連データセット)。
// データカタログAPIで実行時にURLを解決し、なければ同梱ファイルを使う。
export type OverlayKey = 'emergency_route' | 'border';
interface OverlayDef {
  typeEn: string;
  localFile: string;
  options: object;
}

const OVERLAYS: Record<OverlayKey, OverlayDef> = {
  emergency_route: {
    typeEn: 'emergency_route',
    localFile: './data/emergency_route.geojson',
    options: {
      stroke: Cesium.Color.fromCssColorString('#d32f2f'),
      strokeWidth: 4,
      clampToGround: true,
    },
  },
  border: {
    typeEn: 'border',
    localFile: './data/border.geojson',
    options: {
      stroke: Cesium.Color.fromCssColorString('#5b21b6'),
      strokeWidth: 3,
      fill: Cesium.Color.TRANSPARENT,
      clampToGround: true,
    },
  },
};

export async function loadCityOverlay(
  viewer: Cesium.Viewer,
  key: OverlayKey,
): Promise<Cesium.GeoJsonDataSource | null> {
  const def = OVERLAYS[key];
  let geojson: unknown = null;

  try {
    const datasets = await fetchCityDatasets();
    const ds = findGeoJsonDataset(datasets, def.typeEn);
    if (ds?.url) {
      const res = await fetch(ds.url);
      if (res.ok) {
        const json = await res.json();
        if (isFeatureCollection(json)) geojson = json;
      }
    }
  } catch {
    /* カタログ不通時は同梱ファイルへ */
  }
  if (!geojson) {
    const res = await fetch(def.localFile).catch(() => null);
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (isFeatureCollection(json)) geojson = json;
    }
  }
  if (!geojson) return null;

  const ds = await Cesium.GeoJsonDataSource.load(geojson, def.options);
  ds.show = false;
  await viewer.dataSources.add(ds);
  return ds;
}
