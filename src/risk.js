import { HAZARD_LAYERS } from './hazards.js';
import {
  tileCoords, classifyFloodDepth, floodClassIndex, FLOOD_DEPTH_CLASSES,
  sampleGrid, majorityClassIndex, classifyLandslideZone,
} from './lib/geomath.js';

// ハザードタイルのピクセル色を直接読み取って地点リスクを判定する。
// タイルはCORS許可付きで配信されているためcanvasで解析できる。
// 判定は地点の周辺3×3サンプルの多数決で行い、区域境界・タイル境界での
// 1ピクセル判定のブレを抑える (中心ヒットは常に採用 = 安全側)。
const SAMPLE_ZOOM = 16;
const tileCache = new Map();

function loadTilePixels(urlTemplate, z, x, y) {
  const url = urlTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  if (tileCache.has(url)) return tileCache.get(url);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx);
    };
    img.onerror = () => resolve(null); // 区域外はタイル自体が404
    img.src = url;
  });
  tileCache.set(url, promise);
  return promise;
}

async function samplePixel(urlTemplate, lon, lat) {
  const { x, y, px, py } = tileCoords(lon, lat, SAMPLE_ZOOM);
  const ctx = await loadTilePixels(urlTemplate, SAMPLE_ZOOM, x, y);
  if (!ctx) return null;
  const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
  return a > 0 ? { r, g, b, a } : null;
}

// 3×3サンプル (中心が先頭)。同じタイルはキャッシュされるため追加コストは小さい
function samplePixels(urlTemplate, lon, lat) {
  return Promise.all(
    sampleGrid(lon, lat, SAMPLE_ZOOM).map((p) => samplePixel(urlTemplate, p.lon, p.lat))
  );
}

// 浸水深: 多数決でクラスを確定。凡例外の色 (深さ不明の塗り) は中心ピクセルで判定
function classifyFloodSamples(pixels) {
  const idx = majorityClassIndex(pixels.map((p) => floodClassIndex(p)));
  if (idx >= 0) return FLOOD_DEPTH_CLASSES[idx];
  return classifyFloodDepth(pixels[0]);
}

// 土砂: 特別警戒区域 (赤系) を優先し、次いで警戒区域。中心ヒットまたは2点以上で該当
function classifyLandslideSamples(pixels) {
  const zones = pixels.map((p) => classifyLandslideZone(p));
  const specials = zones.filter((z) => z === 'special').length;
  if (zones[0] === 'special' || specials >= 2) return 'special';
  const hits = zones.filter((z) => z !== null).length;
  if (zones[0] !== null || hits >= 2) return 'warning';
  return null;
}

// 指定地点の災害リスクをまとめて診断する。
// landslide の各値は null | 'warning' (警戒区域) | 'special' (特別警戒区域の可能性)
export async function diagnosePoint(lon, lat) {
  const [flood, dosekiryu, kyukeisha, jisuberi, keizoku] = await Promise.all([
    samplePixels(HAZARD_LAYERS.flood.url, lon, lat),
    samplePixels(HAZARD_LAYERS.dosekiryu.url, lon, lat),
    samplePixels(HAZARD_LAYERS.kyukeisha.url, lon, lat),
    samplePixels(HAZARD_LAYERS.jisuberi.url, lon, lat),
    samplePixel(HAZARD_LAYERS.keizoku.url, lon, lat), // 継続時間は区域内かどうかのみ判定
  ]);
  return {
    flood: classifyFloodSamples(flood),
    keizoku: keizoku !== null,
    landslide: {
      dosekiryu: classifyLandslideSamples(dosekiryu),
      kyukeisha: classifyLandslideSamples(kyukeisha),
      jisuberi: classifyLandslideSamples(jisuberi),
    },
  };
}
