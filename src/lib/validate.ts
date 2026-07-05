// 外部データ境界のランタイム検証 (純粋ロジック — tests/ から単体テストされる)。
// 配信側の仕様変更・破損データを「静かな誤動作」ではなく明確な不採用 (null) にする。
import type { RoadsData, RoadEdge, LonLat } from './route';
import type { CatalogDataset } from './geomath';

// 道路網データ (public/data/roads.json) の構造検証。
// ノード座標が有限値であること・エッジのノード添字が範囲内であることまで確認する
// (範囲外添字は経路探索で undefined 参照になり全機能が壊れるため)。
export function parseRoadsData(data: unknown): RoadsData | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1 || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) return null;

  const isNode = (n: unknown): n is LonLat =>
    Array.isArray(n) && Number.isFinite(n[0]) && Number.isFinite(n[1]);
  if (!d.nodes.every(isNode)) return null;

  const nNodes = d.nodes.length;
  const isEdge = (e: unknown): e is RoadEdge =>
    Array.isArray(e) &&
    e.length >= 5 &&
    e.slice(0, 5).every((v) => Number.isFinite(v)) &&
    Number.isInteger(e[0]) &&
    Number.isInteger(e[1]) &&
    e[0] >= 0 &&
    e[0] < nNodes &&
    e[1] >= 0 &&
    e[1] < nNodes &&
    e[2] >= 0;
  if (!d.edges.every(isEdge)) return null;

  return { version: 1, nodes: d.nodes as LonLat[], edges: d.edges as RoadEdge[] };
}

// PLATEAUデータカタログAPIのレスポンス (またはキャッシュ) からデータセット配列を取り出す。
// 配列でない・要素がオブジェクトでない場合は null (呼び出し側でフォールバック)。
export function parseCatalogDatasets(data: unknown): CatalogDataset[] | null {
  const list = Array.isArray(data)
    ? data
    : ((data as { datasets?: unknown } | null)?.datasets ?? null);
  if (!Array.isArray(list)) return null;
  return list.filter((d): d is CatalogDataset => typeof d === 'object' && d !== null);
}

// GeoJSON FeatureCollection の最低限の構造検証 (町データオーバーレイ用)
export function isFeatureCollection(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((data as { features?: unknown }).features)
  );
}
