import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gsiDemDecode,
  metersPerPixel,
  tileToLonLat,
  floodClassIndex,
  parseFloodRank,
  detectRiskProperties,
  estimateStoreys,
  deepFindFloodRank,
  createBuildingStats,
  accumulateBuilding,
  FLOOD_DEPTH_CLASSES,
  DEPTH_REPRESENTATIVE,
} from '../src/lib/geomath.js';

test('gsiDemDecode: 地理院標高PNG仕様', () => {
  assert.equal(gsiDemDecode(0, 0, 0), 0); // 標高0m
  assert.equal(gsiDemDecode(0, 0, 100), 1); // x=100 → 1.00m
  assert.ok(Math.abs(gsiDemDecode(0, 13, 136) - 34.64) < 1e-9); // x=3464 → 34.64m
  assert.equal(gsiDemDecode(128, 0, 0), null); // x=2^23 → 無効値
  assert.equal(gsiDemDecode(255, 255, 255), -0.01); // x=2^24-1 → -0.01m
});

test('metersPerPixel: 赤道z0と三郷町z15', () => {
  assert.ok(Math.abs(metersPerPixel(0, 0) - 156543) < 1);
  const m = metersPerPixel(15, 34.6);
  assert.ok(Math.abs(m - 3.93) < 0.05, `m=${m}`);
});

test('tileToLonLat: tileCoordsの逆変換', () => {
  const { lon, lat } = tileToLonLat(0, 0, 0);
  assert.equal(lon, -180);
  assert.ok(Math.abs(lat - 85.051) < 0.01);
  // z=1の(1,1)は原点
  const c = tileToLonLat(1, 1, 1);
  assert.equal(c.lon, 0);
  assert.ok(Math.abs(c.lat) < 1e-9);
});

test('floodClassIndex: 凡例色は添字、透明・非凡例色は-1', () => {
  FLOOD_DEPTH_CLASSES.forEach((cls, i) => {
    const [r, g, b] = cls.rgb;
    assert.equal(floodClassIndex({ r, g, b }), i);
  });
  assert.equal(floodClassIndex(null), -1);
  assert.equal(floodClassIndex({ r: 0, g: 0, b: 255 }), -1); // 凡例外の色
  assert.equal(DEPTH_REPRESENTATIVE.length, FLOOD_DEPTH_CLASSES.length);
});

test('parseFloodRank: 数値ランクと文字列表現', () => {
  // PLATEAU 浸水ランクコード (1〜6)
  assert.equal(parseFloodRank(1), 0);
  assert.equal(parseFloodRank(3), 2);
  assert.equal(parseFloodRank(6), 5);
  // 文字列表現
  assert.equal(parseFloodRank('0.5m未満'), 0);
  assert.equal(parseFloodRank('0.5m以上3m未満'), 1);
  assert.equal(parseFloodRank('3.0m以上5.0m未満'), 2);
  assert.equal(parseFloodRank('5m以上10m未満'), 3);
  assert.equal(parseFloodRank('20m以上'), 5);
  // 無効値
  assert.equal(parseFloodRank(null), -1);
  assert.equal(parseFloodRank(''), -1);
  assert.equal(parseFloodRank(0), -1);
  assert.equal(parseFloodRank('該当なし'), -1);
});

test('detectRiskProperties: 属性名の推定と想定最大優先', () => {
  const names = [
    'gml_id',
    'bldg:measuredHeight',
    'bldg:storeysAboveGround',
    '洪水浸水想定区域_計画規模_浸水ランク',
    '洪水浸水想定区域_想定最大規模_浸水ランク',
  ];
  const p = detectRiskProperties(names);
  assert.equal(p.rank, '洪水浸水想定区域_想定最大規模_浸水ランク');
  assert.equal(p.storeys, 'bldg:storeysAboveGround');
  assert.equal(p.height, 'bldg:measuredHeight');
  // リスク属性なし
  assert.equal(detectRiskProperties(['gml_id', 'name']).rank, null);
});

test('estimateStoreys: 階数優先、なければ高さ÷3m', () => {
  assert.equal(estimateStoreys(2, 12), 2);
  assert.equal(estimateStoreys(null, 9.5), 3);
  assert.equal(estimateStoreys(null, 2.5), 1); // 最低1階
  assert.equal(estimateStoreys(null, null), null);
  assert.equal(estimateStoreys('3', undefined), 3);
});

test('deepFindFloodRank: PLATEAU形式のネスト属性JSONからランク抽出', () => {
  // PLATEAU 3D Tilesのattributes JSON相当 (洪水語は親キー、ランクは末端キー)
  const plateauLike = JSON.stringify({
    'uro:BuildingRiskAttribute': [
      {
        'uro:RiverFloodingRiskAttribute': {
          'uro:description': '大和川流域',
          'uro:rank': '3.0m以上5.0m未満',
          'uro:scale': 'L2(想定最大規模)',
        },
      },
    ],
  });
  assert.equal(deepFindFloodRank(plateauLike), 2);

  // 計画規模と想定最大の両方がある場合は想定最大を優先
  const both = {
    洪水浸水想定区域: {
      計画規模: { 浸水ランク: 1 },
      想定最大規模: { 浸水ランク: 4 },
    },
  };
  assert.equal(deepFindFloodRank(both), 3);

  // 数値ランクの直接格納
  assert.equal(deepFindFloodRank({ 洪水浸水ランク: 2 }), 1);

  // 洪水と無関係なrankキーは拾わない
  assert.equal(deepFindFloodRank({ 土砂災害: { rank: 3 } }), -1);
  // 不正入力
  assert.equal(deepFindFloodRank('not-json'), -1);
  assert.equal(deepFindFloodRank(null), -1);
  assert.equal(deepFindFloodRank(42), -1);
});

test('accumulateBuilding: 集計と垂直避難困難判定', () => {
  const stats = createBuildingStats();
  accumulateBuilding(stats, -1, 2); // リスクなし
  accumulateBuilding(stats, 1, 1); // 0.5〜3m・平屋 → 垂直避難困難ではない (3m未満)
  accumulateBuilding(stats, 2, 2); // 3〜5m・2階建て → 垂直避難困難
  accumulateBuilding(stats, 3, 5); // 5〜10m・5階建て → 上階へ避難可
  accumulateBuilding(stats, 4, null); // 階数不明 → 困難判定はしない
  assert.equal(stats.total, 5);
  assert.equal(stats.noRisk, 1);
  assert.deepEqual(stats.byClass, [0, 1, 1, 1, 1, 0]);
  assert.equal(stats.verticalEvacuationRisk, 1);
});
