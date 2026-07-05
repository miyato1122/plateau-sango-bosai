// オフライン保存するタイルの列挙 (純粋ロジック — tests/ から単体テストされる)
import { tileCoords } from './geomath';

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Tile {
  z: number;
  x: number;
  y: number;
}

export interface TileSource {
  url: string;
  zooms: number[];
}

// bboxを覆うタイル範囲 (Webメルカトル)
export function tileRange(
  bbox: Bbox,
  z: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const a = tileCoords(bbox.west, bbox.north, z);
  const b = tileCoords(bbox.east, bbox.south, z);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

export function* enumerateTiles(bbox: Bbox, z: number): Generator<Tile> {
  const { x0, y0, x1, y1 } = tileRange(bbox, z);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) yield { z, x, y };
  }
}

export function fillTemplate(template: string, { z, x, y }: Tile): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

// オフライン保存対象のURL一覧を組み立てる。
//   sources: [{ url: テンプレート, zooms: [z, ...] }, ...]
export function buildOfflineTileList(bbox: Bbox, sources: TileSource[]): string[] {
  const urls: string[] = [];
  for (const { url, zooms } of sources) {
    for (const z of zooms) {
      for (const t of enumerateTiles(bbox, z)) urls.push(fillTemplate(url, t));
    }
  }
  return urls;
}
