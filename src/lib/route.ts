// 危険区域を避ける徒歩ルート探索 (純粋ロジック — tests/ から単体テストされる)。
//
// 道路網データ (public/data/roads.json) の形式:
//   {
//     version: 1,
//     nodes: [[lon, lat], ...],
//     edges: [[a, b, lengthM, floodIdx, lsCode], ...]
//   }
//   floodIdx: 浸水深クラス添字 (-1=区域外, 0..5)
//   lsCode:   0=区域外, 1=土砂災害警戒区域, 2=特別警戒区域
// scripts/build-road-network.mjs がOSM+ハザードタイルから生成する。
import { distanceMeters } from './geomath';

export type LonLat = [number, number];
/** [a, b, lengthM, floodIdx, lsCode] */
export type RoadEdge = [number, number, number, number, number];

export interface RoadsData {
  version: number;
  nodes: LonLat[];
  edges: RoadEdge[];
}

interface AdjEdge {
  to: number;
  len: number;
  cost: number;
  floodIdx: number;
  lsCode: number;
}

export type Adjacency = AdjEdge[][];

export interface RouteSegment {
  risky: boolean;
  coords: LonLat[];
}

export interface RouteResult {
  coords: LonLat[];
  lengthM: number;
  floodM: number;
  lsM: number;
  riskyM: number;
  segments: RouteSegment[];
}

// リスク加重: 距離に乗じるペナルティ係数。
// 「多少遠回りでも浸水域を避ける。ただし回避不能なら通す」バランス。
//   浅い浸水(〜0.5m)=2倍 / 0.5〜3m=6倍 / 3m以上=30倍
//   土砂警戒区域=6倍 / 特別警戒区域=30倍
export const FLOOD_PENALTY = [2, 6, 30, 30, 30, 30];
export const LS_PENALTY = [1, 6, 30];

export function edgeCost(lengthM: number, floodIdx: number, lsCode: number): number {
  let factor = 1;
  if (floodIdx >= 0) factor = Math.max(factor, FLOOD_PENALTY[Math.min(floodIdx, 5)]);
  if (lsCode > 0) factor = Math.max(factor, LS_PENALTY[Math.min(lsCode, 2)]);
  return lengthM * factor;
}

// 隣接リスト構築
export function buildGraph(data: RoadsData): Adjacency {
  const adj: Adjacency = Array.from({ length: data.nodes.length }, () => []);
  for (const [a, b, len, floodIdx, lsCode] of data.edges) {
    const cost = edgeCost(len, floodIdx, lsCode);
    adj[a].push({ to: b, len, cost, floodIdx, lsCode });
    adj[b].push({ to: a, len, cost, floodIdx, lsCode });
  }
  return adj;
}

// 最も近いノード。maxDistM以内に無ければ null (道路網の外)
export function nearestNode(
  data: RoadsData,
  lon: number,
  lat: number,
  maxDistM = 400,
): { index: number; dist: number } | null {
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < data.nodes.length; i++) {
    const [nlon, nlat] = data.nodes[i];
    const d = distanceMeters(lon, lat, nlon, nlat);
    if (d <= maxDistM && (!best || d < best.dist)) best = { index: i, dist: d };
  }
  return best;
}

// 二分ヒープ (優先度付きキュー)
class MinHeap {
  private items: Array<{ priority: number; value: number }> = [];

  push(priority: number, value: number): void {
    const items = this.items;
    items.push({ priority, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): { priority: number; value: number } | null {
    const items = this.items;
    if (items.length === 0) return null;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].priority < items[m].priority) m = l;
        if (r < items.length && items[r].priority < items[m].priority) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

// ダイクストラ法で from→to の最小コスト経路を探索する。
// 返り値: { coords, lengthM, floodM, lsM, riskyM, segments } / 経路なしは null
//   coords: [[lon,lat], ...] (出発地点・到着地点のスナップ元は含まない)
//   segments: [{ coords, risky }] — 描画用にリスク有無で分割した区間
export function findRoute(
  data: RoadsData,
  fromLonLat: LonLat,
  toLonLat: LonLat,
  adj: Adjacency | null = null,
): RouteResult | null {
  const from = nearestNode(data, fromLonLat[0], fromLonLat[1]);
  const to = nearestNode(data, toLonLat[0], toLonLat[1]);
  if (!from || !to) return null;
  const graph = adj ?? buildGraph(data);

  const dist: number[] = Array.from({ length: data.nodes.length }).fill(Infinity) as number[];
  const prev: number[] = Array.from({ length: data.nodes.length }).fill(-1) as number[];
  const prevEdge: Array<AdjEdge | null> = Array.from({ length: data.nodes.length }, () => null);
  dist[from.index] = 0;
  const heap = new MinHeap();
  heap.push(0, from.index);
  while (heap.size > 0) {
    const { priority, value: u } = heap.pop()!;
    if (priority > dist[u]) continue; // 古いエントリ
    if (u === to.index) break;
    for (const edge of graph[u]) {
      const nd = dist[u] + edge.cost;
      if (nd < dist[edge.to]) {
        dist[edge.to] = nd;
        prev[edge.to] = u;
        prevEdge[edge.to] = edge;
        heap.push(nd, edge.to);
      }
    }
  }
  if (!Number.isFinite(dist[to.index])) return null;

  // 経路復元
  const nodePath: number[] = [];
  const edgePath: AdjEdge[] = [];
  for (let u = to.index; u !== -1; u = prev[u]) {
    nodePath.push(u);
    const e = prevEdge[u];
    if (e) edgePath.push(e);
  }
  nodePath.reverse();
  edgePath.reverse();

  const coords = nodePath.map((i) => data.nodes[i]);
  let lengthM = 0;
  let floodM = 0;
  let lsM = 0;
  let riskyM = 0;
  const segments: RouteSegment[] = [];
  for (let i = 0; i < edgePath.length; i++) {
    const e = edgePath[i];
    lengthM += e.len;
    if (e.floodIdx >= 0) floodM += e.len;
    if (e.lsCode > 0) lsM += e.len;
    const risky = e.floodIdx >= 0 || e.lsCode > 0;
    if (risky) riskyM += e.len;
    const pair: [LonLat, LonLat] = [coords[i], coords[i + 1]];
    const last = segments[segments.length - 1];
    if (last && last.risky === risky) {
      last.coords.push(pair[1]);
    } else {
      segments.push({ risky, coords: [...pair] });
    }
  }
  return { coords, lengthM, floodM, lsM, riskyM, segments };
}
