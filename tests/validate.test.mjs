import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseRoadsData, parseCatalogDatasets, isFeatureCollection } from '../src/lib/validate';

const GOOD_ROADS = {
  version: 1,
  nodes: [
    [135.69, 34.6],
    [135.691, 34.6],
  ],
  edges: [[0, 1, 92, -1, 0]],
};

test('parseRoadsData: 正常データはそのまま通す', () => {
  const parsed = parseRoadsData(GOOD_ROADS);
  assert.ok(parsed);
  assert.equal(parsed.edges.length, 1);
});

test('parseRoadsData: 壊れたデータはnull (静かな誤動作を防ぐ)', () => {
  assert.equal(parseRoadsData(null), null);
  assert.equal(parseRoadsData('roads'), null);
  assert.equal(parseRoadsData({ version: 2, nodes: [], edges: [] }), null); // 未知バージョン
  assert.equal(parseRoadsData({ ...GOOD_ROADS, nodes: [[135.69, 'x']] }), null); // 座標が数値でない
  assert.equal(parseRoadsData({ ...GOOD_ROADS, edges: [[0, 5, 92, -1, 0]] }), null); // ノード添字が範囲外
  assert.equal(parseRoadsData({ ...GOOD_ROADS, edges: [[0, 1, -3, -1, 0]] }), null); // 距離が負
  assert.equal(parseRoadsData({ ...GOOD_ROADS, edges: [[0, 1, 92]] }), null); // 要素不足
});

test('parseCatalogDatasets: datasets配列/素の配列/キャッシュ形式を受け付ける', () => {
  const list = [{ type_en: 'bldg', url: 'https://x/tileset.json' }];
  assert.deepEqual(parseCatalogDatasets({ datasets: list }), list);
  assert.deepEqual(parseCatalogDatasets(list), list);
  // 非オブジェクト要素は除外
  assert.deepEqual(parseCatalogDatasets([...list, 'junk', null]), list);
});

test('parseCatalogDatasets: 配列でない応答はnull', () => {
  assert.equal(parseCatalogDatasets(null), null);
  assert.equal(parseCatalogDatasets({ datasets: 'oops' }), null);
  assert.equal(parseCatalogDatasets({ items: [] }), null);
});

test('isFeatureCollection: FeatureCollectionのみ通す', () => {
  assert.equal(isFeatureCollection({ type: 'FeatureCollection', features: [] }), true);
  assert.equal(isFeatureCollection({ type: 'Feature' }), false);
  assert.equal(isFeatureCollection({ error: 'not found' }), false);
  assert.equal(isFeatureCollection(null), false);
});
