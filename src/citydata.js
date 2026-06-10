import * as Cesium from 'cesium';

// PLATEAU関連データセット (public/data/に同梱したGeoJSON) のオーバーレイ。
// ファイルが未配置 (404) のレイヤは黙ってスキップする。
const OVERLAYS = {
  emergency_route: {
    file: './data/emergency_route.geojson',
    label: '緊急輸送道路',
    options: {
      stroke: Cesium.Color.fromCssColorString('#d32f2f'),
      strokeWidth: 4,
      clampToGround: true,
    },
  },
  border: {
    file: './data/border.geojson',
    label: '町域界',
    options: {
      stroke: Cesium.Color.fromCssColorString('#4a148c'),
      strokeWidth: 3,
      fill: Cesium.Color.TRANSPARENT,
      clampToGround: true,
    },
  },
};

export async function loadCityOverlay(viewer, key) {
  const def = OVERLAYS[key];
  const res = await fetch(def.file).catch(() => null);
  if (!res?.ok) return null;
  const geojson = await res.json();
  const ds = await Cesium.GeoJsonDataSource.load(geojson, def.options);
  ds.show = false;
  await viewer.dataSources.add(ds);
  return ds;
}
