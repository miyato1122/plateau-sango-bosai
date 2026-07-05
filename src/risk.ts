import { HAZARD_LAYERS } from './hazards';
import {
  tileCoords,
  classifyFloodDepth,
  floodClassIndex,
  FLOOD_DEPTH_CLASSES,
  sampleGrid,
  majorityClassIndex,
  classifyLandslideZone,
  type Pixel,
  type FloodDepthInfo,
  type LandslideZone,
} from './lib/geomath';

/** 地点診断の結果 */
export interface DiagnosisRisk {
  /** 浸水深 (区域外はnull。凡例外の色は「深さ不明」) */
  flood: FloodDepthInfo | null;
  /** 浸水継続時間の想定区域内か */
  keizoku: boolean;
  /** 家屋倒壊等氾濫想定区域 (氾濫流/河岸侵食) の該当 */
  kaokutoukai: { hanran: boolean; kagan: boolean };
  /** 土砂災害の区域種別 (種類ごと) */
  landslide: {
    dosekiryu: LandslideZone;
    kyukeisha: LandslideZone;
    jisuberi: LandslideZone;
  };
}

// ハザードタイルのピクセル色を直接読み取って地点リスクを判定する。
// タイルはCORS許可付きで配信されているためcanvasで解析できる。
// 判定は地点の周辺3×3サンプルの多数決で行い、区域境界・タイル境界での
// 1ピクセル判定のブレを抑える (中心ヒットは常に採用 = 安全側)。
const SAMPLE_ZOOM = 16;
// タイル1枚はcanvasのピクセルデータ約256KBを保持するため、上限付きLRUで
// 長時間の連続利用 (出前講座デモ等) でもメモリを ~24MB に抑える
const TILE_CACHE_MAX = 96;
const tileCache = new Map<string, Promise<CanvasRenderingContext2D | null>>();

function loadTilePixels(
  urlTemplate: string,
  z: number,
  x: number,
  y: number,
): Promise<CanvasRenderingContext2D | null> {
  const url = urlTemplate
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  const cached = tileCache.get(url);
  if (cached) {
    // 触れたエントリを末尾へ移して新しい扱いにする (Mapは挿入順を保持)
    tileCache.delete(url);
    tileCache.set(url, cached);
    return cached;
  }
  const promise = new Promise<CanvasRenderingContext2D | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx);
    };
    img.onerror = () => resolve(null); // 区域外はタイル自体が404
    img.src = url;
  });
  tileCache.set(url, promise);
  if (tileCache.size > TILE_CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest) tileCache.delete(oldest);
  }
  return promise;
}

async function samplePixel(urlTemplate: string, lon: number, lat: number): Promise<Pixel | null> {
  const { x, y, px, py } = tileCoords(lon, lat, SAMPLE_ZOOM);
  const ctx = await loadTilePixels(urlTemplate, SAMPLE_ZOOM, x, y);
  if (!ctx) return null;
  const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
  return a! > 0 ? { r: r!, g: g!, b: b!, a: a! } : null;
}

// 3×3サンプル (中心が先頭)。同じタイルはキャッシュされるため追加コストは小さい
function samplePixels(urlTemplate: string, lon: number, lat: number): Promise<Array<Pixel | null>> {
  return Promise.all(
    sampleGrid(lon, lat, SAMPLE_ZOOM).map((p) => samplePixel(urlTemplate, p.lon, p.lat)),
  );
}

// 浸水深: 多数決でクラスを確定。凡例外の色 (深さ不明の塗り) は中心ピクセルで判定
function classifyFloodSamples(pixels: Array<Pixel | null>): FloodDepthInfo | null {
  const idx = majorityClassIndex(pixels.map((p) => floodClassIndex(p)));
  if (idx >= 0) return FLOOD_DEPTH_CLASSES[idx];
  return classifyFloodDepth(pixels[0]);
}

// 土砂: 特別警戒区域 (赤系) を優先し、次いで警戒区域。中心ヒットまたは2点以上で該当
function classifyLandslideSamples(pixels: Array<Pixel | null>): LandslideZone {
  const zones = pixels.map((p) => classifyLandslideZone(p));
  const specials = zones.filter((z) => z === 'special').length;
  if (zones[0] === 'special' || specials >= 2) return 'special';
  const hits = zones.filter((z) => z !== null).length;
  if (zones[0] !== null || hits >= 2) return 'warning';
  return null;
}

// 区域内かどうかの多数決 (中心ヒットまたは2点以上)
function presence(pixels: Array<Pixel | null>): boolean {
  const hits = pixels.filter((p) => p !== null).length;
  return pixels[0] !== null || hits >= 2;
}

// 指定地点の災害リスクをまとめて診断する。
export async function diagnosePoint(lon: number, lat: number): Promise<DiagnosisRisk> {
  const [flood, dosekiryu, kyukeisha, jisuberi, keizoku, hanran, kagan] = await Promise.all([
    samplePixels(HAZARD_LAYERS.flood.url, lon, lat),
    samplePixels(HAZARD_LAYERS.dosekiryu.url, lon, lat),
    samplePixels(HAZARD_LAYERS.kyukeisha.url, lon, lat),
    samplePixels(HAZARD_LAYERS.jisuberi.url, lon, lat),
    samplePixel(HAZARD_LAYERS.keizoku.url, lon, lat), // 継続時間は区域内かどうかのみ判定
    samplePixels(HAZARD_LAYERS.kaokutoukai_hanran.url, lon, lat),
    samplePixels(HAZARD_LAYERS.kaokutoukai_kagan.url, lon, lat),
  ]);
  return {
    flood: classifyFloodSamples(flood),
    keizoku: keizoku !== null,
    kaokutoukai: {
      hanran: presence(hanran),
      kagan: presence(kagan),
    },
    landslide: {
      dosekiryu: classifyLandslideSamples(dosekiryu),
      kyukeisha: classifyLandslideSamples(kyukeisha),
      jisuberi: classifyLandslideSamples(jisuberi),
    },
  };
}
