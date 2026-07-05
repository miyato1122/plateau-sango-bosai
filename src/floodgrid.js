import * as Cesium from 'cesium';
import { CITY_BBOX, GSI_DEM, GEOID_OFFSET } from './config.js';
import { HAZARD_LAYERS } from './hazards.js';
import {
  tileCoords,
  tileToLonLat,
  metersPerPixel,
  floodClassIndex,
  gsiDemDecode,
  DEPTH_REPRESENTATIVE,
  FLOOD_DEPTH_CLASSES,
} from './lib/geomath';

// 洪水浸水想定タイルを町全域でスキャンし、
//   1. 浸水深クラス別の面積統計
//   2. 63m格子の浸水セル (3D水柱表示用)
// を作る。標高は地理院DEMタイル (PNG標高) をデコードして付与する。
const FLOOD_Z = 15; // 3.9m/px
const BLOCK = 16; // 16px = 約63m格子
const DEM_Z = 14;

function loadTileData(urlTemplate, z, x, y) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, 256, 256).data);
    };
    img.onerror = () => resolve(null);
    img.src = urlTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  });
}

function tileRange(bbox, z) {
  const a = tileCoords(bbox.west, bbox.north, z);
  const b = tileCoords(bbox.east, bbox.south, z);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

// DEMタイルをまとめて取得し、経度緯度→標高 の関数を返す
async function buildElevationSampler(bbox) {
  const { x0, y0, x1, y1 } = tileRange(bbox, DEM_Z);
  const tiles = new Map();
  const jobs = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push(loadTileData(GSI_DEM, DEM_Z, x, y).then((d) => tiles.set(`${x}/${y}`, d)));
    }
  }
  await Promise.all(jobs);
  return (lon, lat) => {
    const { x, y, px, py } = tileCoords(lon, lat, DEM_Z);
    const data = tiles.get(`${x}/${y}`);
    if (!data) return null;
    const i = (py * 256 + px) * 4;
    if (data[i + 3] === 0) return null;
    const h = gsiDemDecode(data[i], data[i + 1], data[i + 2]);
    return h == null ? null : h + GEOID_OFFSET; // 楕円体高へ変換
  };
}

// 町全域の浸水タイルスキャン。結果はキャッシュして使い回す。
let scanPromise = null;
export function scanFloodGrid(onProgress) {
  scanPromise ??= (async () => {
    const bbox = CITY_BBOX;
    const { x0, y0, x1, y1 } = tileRange(bbox, FLOOD_Z);
    const total = (x1 - x0 + 1) * (y1 - y0 + 1);
    let done = 0;

    const areaPixels = Array.from({ length: FLOOD_DEPTH_CLASSES.length }).fill(0);
    const cells = [];
    const cellDeg = 360 / 2 ** FLOOD_Z / (256 / BLOCK); // 経度方向のセル幅

    const jobs = [];
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        jobs.push(
          loadTileData(HAZARD_LAYERS.flood.url, FLOOD_Z, tx, ty).then((data) => {
            done += 1;
            onProgress?.(done, total);
            if (!data) return; // 浸水なし地域はタイル自体が無い
            const nw = tileToLonLat(tx, ty, FLOOD_Z);
            const se = tileToLonLat(tx + 1, ty + 1, FLOOD_Z);
            for (let by = 0; by < 256 / BLOCK; by++) {
              for (let bx = 0; bx < 256 / BLOCK; bx++) {
                let maxIdx = -1;
                for (let py = by * BLOCK; py < (by + 1) * BLOCK; py++) {
                  for (let px = bx * BLOCK; px < (bx + 1) * BLOCK; px++) {
                    const i = (py * 256 + px) * 4;
                    if (data[i + 3] === 0) continue;
                    const idx = floodClassIndex({ r: data[i], g: data[i + 1], b: data[i + 2] });
                    if (idx >= 0) {
                      areaPixels[idx] += 1;
                      if (idx > maxIdx) maxIdx = idx;
                    }
                  }
                }
                if (maxIdx >= 0) {
                  const west = nw.lon + bx * cellDeg;
                  const north = nw.lat - (by * (nw.lat - se.lat) * BLOCK) / 256;
                  const south = nw.lat - ((by + 1) * (nw.lat - se.lat) * BLOCK) / 256;
                  cells.push({ west, east: west + cellDeg, north, south, classIdx: maxIdx });
                }
              }
            }
          }),
        );
      }
    }
    await Promise.all(jobs);

    // 面積 (km²): ピクセル面積 × クラス別ピクセル数
    const mpp = metersPerPixel(FLOOD_Z, (bbox.north + bbox.south) / 2);
    const areaKm2 = areaPixels.map((n) => (n * mpp * mpp) / 1e6);
    return { cells, areaKm2, totalKm2: areaKm2.reduce((a, b) => a + b, 0) };
  })();
  scanPromise.catch(() => {
    scanPromise = null;
  });
  return scanPromise;
}

// 浸水深を実高さの半透明水柱として3D表示する
const WATER_COLORS = ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#1d4ed8', '#312e81'];
let waterPrimitive = null;

export async function buildWaterColumns(viewer, onProgress) {
  if (waterPrimitive) return waterPrimitive;
  const [{ cells }, elevation] = await Promise.all([
    scanFloodGrid(onProgress),
    buildElevationSampler(CITY_BBOX),
  ]);
  const instances = [];
  for (const c of cells) {
    const lon = (c.west + c.east) / 2;
    const lat = (c.north + c.south) / 2;
    const base = elevation(lon, lat);
    if (base == null) continue;
    const depth = DEPTH_REPRESENTATIVE[c.classIdx];
    instances.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.RectangleGeometry({
          rectangle: Cesium.Rectangle.fromDegrees(c.west, c.south, c.east, c.north),
          height: base - 2, // 地形との隙間を防ぐため少し潜らせる
          extrudedHeight: base + depth,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString(WATER_COLORS[c.classIdx]).withAlpha(0.5),
          ),
        },
      }),
    );
  }
  if (instances.length === 0) return null;
  waterPrimitive = viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
      asynchronous: true,
    }),
  );
  waterPrimitive.show = false;
  return waterPrimitive;
}
