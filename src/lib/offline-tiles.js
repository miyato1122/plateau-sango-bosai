// オフライン保存するタイルの列挙 (純粋ロジック — tests/ から単体テストされる)
import { tileCoords } from './geomath.js';

// bboxを覆うタイル範囲 (Webメルカトル)
export function tileRange(bbox, z) {
  const a = tileCoords(bbox.west, bbox.north, z);
  const b = tileCoords(bbox.east, bbox.south, z);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

export function* enumerateTiles(bbox, z) {
  const { x0, y0, x1, y1 } = tileRange(bbox, z);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) yield { z, x, y };
  }
}

export function fillTemplate(template, { z, x, y }) {
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

// オフライン保存対象のURL一覧を組み立てる。
//   sources: [{ url: テンプレート, zooms: [z, ...] }, ...]
export function buildOfflineTileList(bbox, sources) {
  const urls = [];
  for (const { url, zooms } of sources) {
    for (const z of zooms) {
      for (const t of enumerateTiles(bbox, z)) urls.push(fillTemplate(url, t));
    }
  }
  return urls;
}
