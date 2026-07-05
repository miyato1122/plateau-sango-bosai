import { test } from 'vitest';
import assert from 'node:assert/strict';
import { edgeCost, nearestNode, findRoute, FLOOD_PENALTY } from '../src/lib/route';
import { waysToGraph } from '../scripts/build-road-network.mjs';

// 東西600m×2本の道 (北=安全、南=浸水) を持つ「はしご」型グラフ:
//   0 -- 1 -- 2   (北の道: 安全)
//   |         |
//   3 -- 4 -- 5   (南の道: 浸水 0.5〜3m)
// 経度0.003° ≈ 275m (この緯度)、縦は0.001° ≈ 111m
const LADDER = {
  version: 1,
  nodes: [
    [135.69, 34.6],
    [135.693, 34.6],
    [135.696, 34.6],
    [135.69, 34.599],
    [135.693, 34.599],
    [135.696, 34.599],
  ],
  edges: [
    [0, 1, 275, -1, 0],
    [1, 2, 275, -1, 0], // 北: 安全
    [3, 4, 275, 1, 0],
    [4, 5, 275, 1, 0], // 南: 浸水クラス1
    [0, 3, 111, -1, 0],
    [2, 5, 111, -1, 0], // 連絡路
  ],
};

test('edgeCost: 浸水・土砂のペナルティ係数', () => {
  assert.equal(edgeCost(100, -1, 0), 100);
  assert.equal(edgeCost(100, 0, 0), 100 * FLOOD_PENALTY[0]);
  assert.equal(edgeCost(100, 2, 0), 3000); // 3m以上は30倍
  assert.equal(edgeCost(100, -1, 1), 600); // 警戒区域6倍
  assert.equal(edgeCost(100, -1, 2), 3000); // 特別警戒区域30倍
  assert.equal(edgeCost(100, 2, 1), 3000); // 重複は最大値
});

test('nearestNode: 距離上限内の最寄りノード', () => {
  const hit = nearestNode(LADDER, 135.6901, 34.6001);
  assert.equal(hit.index, 0);
  assert.equal(nearestNode(LADDER, 135.5, 34.5), null); // 遠すぎる
});

test('findRoute: 浸水した近道より安全な迂回路を選ぶ', () => {
  // 南西角(3)→南東角(5)。直進550mは浸水路、北回り772mは安全
  const route = findRoute(LADDER, [135.69, 34.599], [135.696, 34.599]);
  assert.ok(route);
  assert.equal(route.riskyM, 0, '浸水区間を通らない');
  assert.ok(route.lengthM > 550, '遠回りを選んでいる');
  assert.deepEqual(route.coords[0], [135.69, 34.599]);
  assert.deepEqual(route.coords.at(-1), [135.696, 34.599]);
});

test('findRoute: 回避不能なら浸水区間を通り、危険距離を報告する', () => {
  const onlyFlooded = {
    ...LADDER,
    edges: [
      [3, 4, 275, 1, 0],
      [4, 5, 275, 1, 0],
    ],
    nodes: LADDER.nodes,
  };
  const route = findRoute(onlyFlooded, [135.69, 34.599], [135.696, 34.599]);
  assert.ok(route);
  assert.equal(Math.round(route.riskyM), 550);
  assert.equal(Math.round(route.floodM), 550);
  // 描画セグメントはリスク有無でまとまる
  assert.equal(route.segments.length, 1);
  assert.equal(route.segments[0].risky, true);
});

test('findRoute: 到達不能・道路網外は null', () => {
  const split = {
    ...LADDER,
    edges: [
      [0, 1, 275, -1, 0],
      [4, 5, 275, 1, 0],
    ], // 分断されたグラフ
  };
  assert.equal(findRoute(split, [135.69, 34.6], [135.696, 34.599]), null);
  assert.equal(findRoute(LADDER, [135.5, 34.5], [135.696, 34.599]), null);
});

test('waysToGraph: OSM way→ノード・エッジ (重複way排除・bbox外除外)', () => {
  const osm = {
    elements: [
      { type: 'node', id: 10, lon: 135.69, lat: 34.6 },
      { type: 'node', id: 11, lon: 135.691, lat: 34.6 },
      { type: 'node', id: 12, lon: 135.692, lat: 34.6 },
      { type: 'node', id: 13, lon: 100.0, lat: 0.0 }, // bbox外
      { type: 'way', id: 1, nodes: [10, 11, 12] },
      { type: 'way', id: 2, nodes: [12, 11] }, // 逆向きの重複
      { type: 'way', id: 3, nodes: [12, 13] }, // 片端がbbox外 (境界道路)
      { type: 'way', id: 4, nodes: [13, 14] }, // 両端bbox外 (node14は未定義でもある)
    ],
  };
  const g = waysToGraph(osm, { west: 135.65, south: 34.565, east: 135.73, north: 34.625 });
  // 境界をまたぐ道路 (12-13) は保持し、逆向き重複 (12-11) と両端域外は除外
  assert.equal(g.edges.length, 3);
  assert.equal(g.nodes.length, 4);
});
