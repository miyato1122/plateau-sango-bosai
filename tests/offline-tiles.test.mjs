import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  tileRange,
  enumerateTiles,
  fillTemplate,
  buildOfflineTileList,
} from '../src/lib/offline-tiles';
import { tileCoords } from '../src/lib/geomath';

// 三郷町のbbox (src/config.js と同じ値)
const BBOX = { west: 135.65, south: 34.565, east: 135.73, north: 34.625 };

test('tileRange: bboxの四隅を包含する', () => {
  const z = 16;
  const r = tileRange(BBOX, z);
  const nw = tileCoords(BBOX.west, BBOX.north, z);
  const se = tileCoords(BBOX.east, BBOX.south, z);
  assert.equal(r.x0, nw.x);
  assert.equal(r.y0, nw.y);
  assert.equal(r.x1, se.x);
  assert.equal(r.y1, se.y);
  assert.ok(r.x1 >= r.x0 && r.y1 >= r.y0);
});

test('enumerateTiles: 役場地点のタイルが含まれる', () => {
  const z = 16;
  const townHall = tileCoords(135.697, 34.598, z); // 三郷町役場付近
  const tiles = [...enumerateTiles(BBOX, z)];
  assert.ok(tiles.some((t) => t.x === townHall.x && t.y === townHall.y));
  // 町域規模 (約7km×7km) でタイル数が妥当な範囲に収まる
  assert.ok(tiles.length > 100 && tiles.length < 500, `z16 tiles=${tiles.length}`);
});

test('fillTemplate: URLテンプレートを展開する', () => {
  assert.equal(
    fillTemplate('https://example.com/{z}/{x}/{y}.png', { z: 16, x: 57460, y: 25980 }),
    'https://example.com/16/57460/25980.png',
  );
});

test('buildOfflineTileList: ズームごとに全タイルを列挙し重複しない', () => {
  const urls = buildOfflineTileList(BBOX, [
    { url: 'https://a.example/{z}/{x}/{y}.png', zooms: [11, 12] },
    { url: 'https://b.example/{z}/{x}/{y}.png', zooms: [11] },
  ]);
  const expected = [...enumerateTiles(BBOX, 11)].length * 2 + [...enumerateTiles(BBOX, 12)].length;
  assert.equal(urls.length, expected);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((u) => !u.includes('{')));
});

test('buildOfflineTileList: 低ズームは高ズームよりタイル数が少ない', () => {
  const low = buildOfflineTileList(BBOX, [{ url: 'x/{z}/{x}/{y}', zooms: [11] }]);
  const high = buildOfflineTileList(BBOX, [{ url: 'x/{z}/{x}/{y}', zooms: [16] }]);
  assert.ok(low.length < high.length);
});
