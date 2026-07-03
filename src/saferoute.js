// 安全避難ルートの表示 (道路網データがある場合のみ有効化)。
// public/data/roads.json は scripts/build-road-network.mjs で生成する。
import * as Cesium from 'cesium';
import { buildGraph, findRoute } from './lib/route.js';

let roadsPromise = null;
let graph = null;
let routeEntities = [];

// 道路網データの取得 (無ければnull = 機能は自動的に非表示)
export function loadRoads() {
  roadsPromise ??= fetch('./data/roads.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || data.version !== 1 || !Array.isArray(data.nodes)) return null;
      graph = buildGraph(data);
      return data;
    })
    .catch(() => null);
  return roadsPromise;
}

export function clearRoute(viewer) {
  for (const ent of routeEntities) viewer.entities.remove(ent);
  routeEntities = [];
}

// from→to の安全ルートを計算して3D表示する。
// 返り値: { lengthM, minutes, floodM, lsM } / 計算不能は null
export async function showSafeRoute(viewer, from, to) {
  const data = await loadRoads();
  if (!data) return null;
  const route = findRoute(data, [from.lon, from.lat], [to.lon, to.lat], graph);
  if (!route) return null;

  clearRoute(viewer);
  for (const seg of route.segments) {
    if (seg.coords.length < 2) continue;
    routeEntities.push(viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(seg.coords.flat()),
        clampToGround: true,
        width: seg.risky ? 7 : 8,
        material: seg.risky
          ? new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#dc2626'),
              dashLength: 12,
            })
          : Cesium.Color.fromCssColorString('#0f6fb8').withAlpha(0.95),
      },
    }));
  }
  return {
    lengthM: route.lengthM,
    minutes: Math.max(1, Math.ceil(route.lengthM / 80)),
    floodM: route.floodM,
    lsM: route.lsM,
    riskyM: route.riskyM,
  };
}
