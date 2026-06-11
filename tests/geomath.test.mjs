import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tileCoords, classifyFloodDepth, distanceMeters, compassDirection,
  parseOfficialShelters, nearestShelter, pickBuildingDatasets, findGeoJsonDataset,
  FLOOD_DEPTH_CLASSES,
} from '../src/lib/geomath.js';

const CITY_BBOX = { west: 65, south: 34.565, east: 135.73, north: 34.625 };
CITY_BBOX.west = 135.65;

test('tileCoords: 原点と既知タイル', () => {
  assert.deepEqual(tileCoords(0, 0, 0), { x: 0, y: 0, px: 128, py: 128 });
  // 経度0,緯度0はz=1で(1,1)タイルの左上角
  const t = tileCoords(0, 0, 1);
  assert.equal(t.x, 1);
  assert.equal(t.y, 1);
  // 三郷町役場付近 (z=16) が日本の範囲のタイルに入る
  const s = tileCoords(135.697, 34.598, 16);
  assert.ok(s.x > 57000 && s.x < 58000, `x=${s.x}`);
  assert.ok(s.y > 25000 && s.y < 27000, `y=${s.y}`);
  assert.ok(s.px >= 0 && s.px <= 255 && s.py >= 0 && s.py <= 255);
});

test('tileCoords: 北に行くほどyが小さい', () => {
  const south = tileCoords(135.7, 34.0, 14);
  const north = tileCoords(135.7, 35.0, 14);
  assert.ok(north.y < south.y);
});

test('classifyFloodDepth: 凡例色の完全一致と近似', () => {
  for (const cls of FLOOD_DEPTH_CLASSES) {
    const [r, g, b] = cls.rgb;
    assert.equal(classifyFloodDepth({ r, g, b }).label, cls.label);
    // タイル縁のアンチエイリアスを想定した±10のズレも同クラスに
    const near = classifyFloodDepth({ r: r - 10, g, b: Math.min(255, b + 10) });
    assert.equal(near.label, cls.label);
  }
});

test('classifyFloodDepth: 凡例から遠い色は「深さ不明」、null入力はnull', () => {
  assert.equal(classifyFloodDepth({ r: 0, g: 0, b: 255 }).label, '浸水想定あり (深さ不明)');
  assert.equal(classifyFloodDepth(null), null);
});

test('distanceMeters: 同一点0m・緯度1度≒111.2km', () => {
  assert.equal(distanceMeters(135.7, 34.6, 135.7, 34.6), 0);
  const d = distanceMeters(135.7, 34.0, 135.7, 35.0);
  assert.ok(Math.abs(d - 111195) < 1200, `d=${d}`);
});

test('compassDirection: 4方位', () => {
  assert.equal(compassDirection(135.7, 34.6, 135.7, 34.7), '北');
  assert.equal(compassDirection(135.7, 34.6, 135.8, 34.6), '東');
  assert.equal(compassDirection(135.7, 34.6, 135.7, 34.5), '南');
  assert.equal(compassDirection(135.7, 34.6, 135.6, 34.6), '西');
});

test('parseOfficialShelters: 同梱の三郷町公式データを検証', () => {
  const geojson = JSON.parse(readFileSync(new URL('../public/data/shelter.geojson', import.meta.url)));
  const shelters = parseOfficialShelters(geojson);
  assert.equal(shelters.length, 46);
  for (const s of shelters) {
    assert.ok(s.name.length > 0);
    assert.match(s.address, /三郷町/, `町外の住所: ${s.address} (${s.name})`);
    assert.ok(
      s.lon >= CITY_BBOX.west && s.lon <= CITY_BBOX.east &&
      s.lat >= CITY_BBOX.south && s.lat <= CITY_BBOX.north,
      `町域外の座標: ${s.name} (${s.lon}, ${s.lat})`
    );
  }
});

test('nearestShelter: 距離順と災害種別フィルタ', () => {
  const shelters = [
    { name: '近いが洪水非対応', lon: 135.700, lat: 34.600, disasters: ['地震'] },
    { name: '遠いが洪水対応', lon: 135.710, lat: 34.610, disasters: ['洪水', '地震'] },
    { name: '指定なし', lon: 135.705, lat: 34.605, disasters: [] },
  ];
  const noFilter = nearestShelter(shelters, 135.7005, 34.6005);
  assert.equal(noFilter.shelter.name, '近いが洪水非対応');
  // 洪水フィルタ時は非対応をスキップ (災害指定なしは常に候補)
  const flood = nearestShelter(shelters, 135.7005, 34.6005, '洪水');
  assert.equal(flood.shelter.name, '指定なし');
  // 該当0件なら全件で再探索
  const none = nearestShelter(
    [{ name: 'A', lon: 135.7, lat: 34.6, disasters: ['地震'] }],
    135.7, 34.6, '洪水'
  );
  assert.equal(none.shelter.name, 'A');
});

test('pickBuildingDatasets: 高LOD・テクスチャ優先', () => {
  const ds = [
    { type_en: 'bldg', lod: '1', texture: false, url: 'https://x/lod1/tileset.json' },
    { type_en: 'bldg', lod: '2', texture: true, url: 'https://x/lod2/tileset.json' },
    { type_en: 'bldg', lod: '2', texture: false, url: 'https://x/lod2nt/tileset.json' },
    { type_en: 'luse', lod: '2', texture: true, url: 'https://x/luse/tileset.json' },
    { type_en: 'bldg', lod: '3', texture: true, url: 'https://x/not-tileset/data.zip' },
  ];
  const picked = pickBuildingDatasets(ds);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].url, 'https://x/lod2/tileset.json');
  assert.deepEqual(pickBuildingDatasets([]), []);
});

test('findGeoJsonDataset: type_enとGeoJSON形式で絞り込み', () => {
  const ds = [
    { type_en: 'shelter', url: 'https://x/shelter.zip' },
    { type_en: 'shelter', url: 'https://x/shelter.geojson' },
    { type_en: 'emergency_route', url: 'https://x/er.geojson?v=1' },
  ];
  assert.equal(findGeoJsonDataset(ds, 'shelter').url, 'https://x/shelter.geojson');
  assert.equal(findGeoJsonDataset(ds, 'emergency_route').url, 'https://x/er.geojson?v=1');
  assert.equal(findGeoJsonDataset(ds, 'border'), null);
});
