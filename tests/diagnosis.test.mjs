import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleGrid, majorityClassIndex, classifyLandslideZone, tileCoords,
} from '../src/lib/geomath.js';

test('sampleGrid: 中心を先頭に9点を返し、間隔は1ピクセル相当', () => {
  const z = 16;
  const pts = sampleGrid(135.697, 34.598, z);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], { lon: 135.697, lat: 34.598 });
  const lonPerPx = 360 / (2 ** z * 256);
  for (const p of pts.slice(1)) {
    assert.ok(Math.abs(p.lon - 135.697) <= lonPerPx * 1.001);
    assert.ok(Math.abs(p.lat - 34.598) <= lonPerPx * 1.001);
  }
  // 全点が互いに異なる
  assert.equal(new Set(pts.map((p) => `${p.lon},${p.lat}`)).size, 9);
});

test('sampleGrid: タイル境界をまたぐ点は隣のタイル座標になる', () => {
  const z = 16;
  // タイル左端ぎりぎりの経度を作る
  const n = 2 ** z;
  const lonEdge = (57460 / n) * 360 - 180 + 1e-9;
  const pts = sampleGrid(lonEdge, 34.598, z);
  const tiles = new Set(pts.map((p) => tileCoords(p.lon, p.lat, z).x));
  assert.ok(tiles.size >= 2, '左隣のタイルもサンプルされる');
});

test('majorityClassIndex: 多数決と安全側タイブレーク', () => {
  // 中心ヒットは常に採用
  assert.equal(majorityClassIndex([2, -1, -1, -1, -1, -1, -1, -1, -1]), 2);
  // 中心なしでも2点以上で採用 (境界の取りこぼし防止)
  assert.equal(majorityClassIndex([-1, 1, 1, -1, -1, -1, -1, -1, -1]), 1);
  // 孤立1点のノイズは不採用
  assert.equal(majorityClassIndex([-1, 3, -1, -1, -1, -1, -1, -1, -1]), -1);
  // 最頻値を採用
  assert.equal(majorityClassIndex([1, 1, 1, 2, 2, 1, -1, -1, -1]), 1);
  // 同数なら深い方 (安全側)
  assert.equal(majorityClassIndex([1, 2, 1, 2, -1, -1, -1, -1, -1]), 2);
  // 全て区域外
  assert.equal(majorityClassIndex(new Array(9).fill(-1)), -1);
});

test('classifyLandslideZone: 黄系=警戒区域 / 赤系=特別警戒区域 / 透明=区域外', () => {
  assert.equal(classifyLandslideZone(null), null);
  assert.equal(classifyLandslideZone({ r: 250, g: 230, b: 24, a: 0 }), null);
  // 警戒区域 (黄系)
  assert.equal(classifyLandslideZone({ r: 250, g: 230, b: 24, a: 255 }), 'warning');
  assert.equal(classifyLandslideZone({ r: 252, g: 249, b: 155, a: 255 }), 'warning');
  // 特別警戒区域 (赤系)
  assert.equal(classifyLandslideZone({ r: 255, g: 40, b: 0, a: 255 }), 'special');
  assert.equal(classifyLandslideZone({ r: 203, g: 76, b: 107, a: 255 }), 'special');
  // 赤とは言えない淡い色は警戒区域扱い (安全側に倒しすぎない)
  assert.equal(classifyLandslideZone({ r: 180, g: 150, b: 120, a: 255 }), 'warning');
});
