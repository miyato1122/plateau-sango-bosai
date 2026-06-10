import { HAZARD_LAYERS, FLOOD_DEPTH_CLASSES } from './hazards.js';

// ハザードタイルのピクセル色を直接読み取って地点リスクを判定する。
// タイルはCORS許可付きで配信されているためcanvasで解析できる。
const SAMPLE_ZOOM = 16;
const tileCache = new Map();

function tileCoords(lon, lat, z) {
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return {
    x: Math.floor(xf),
    y: Math.floor(yf),
    px: Math.floor((xf - Math.floor(xf)) * 256),
    py: Math.floor((yf - Math.floor(yf)) * 256),
  };
}

async function loadTilePixels(urlTemplate, z, x, y) {
  const url = urlTemplate
    .replace('{z}', z).replace('{x}', x).replace('{y}', y);
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

function classifyFloodDepth(pixel) {
  if (!pixel) return null;
  let best = null;
  for (const cls of FLOOD_DEPTH_CLASSES) {
    const d =
      Math.abs(cls.rgb[0] - pixel.r) +
      Math.abs(cls.rgb[1] - pixel.g) +
      Math.abs(cls.rgb[2] - pixel.b);
    if (!best || d < best.d) best = { cls, d };
  }
  // 凡例色と十分近い場合のみ採用 (アンチエイリアス境界などの誤判定を防ぐ)
  return best && best.d <= 60 ? best.cls : { label: '浸水想定あり (深さ不明)', css: 'gray' };
}

// 指定地点の災害リスクをまとめて診断する
export async function diagnosePoint(lon, lat) {
  const [flood, dosekiryu, kyukeisha, jisuberi] = await Promise.all([
    samplePixel(HAZARD_LAYERS.flood.url, lon, lat),
    samplePixel(HAZARD_LAYERS.dosekiryu.url, lon, lat),
    samplePixel(HAZARD_LAYERS.kyukeisha.url, lon, lat),
    samplePixel(HAZARD_LAYERS.jisuberi.url, lon, lat),
  ]);
  return {
    flood: classifyFloodDepth(flood),
    landslide: {
      dosekiryu: !!dosekiryu,
      kyukeisha: !!kyukeisha,
      jisuberi: !!jisuberi,
    },
  };
}
