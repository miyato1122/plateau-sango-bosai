import test from 'node:test';
import assert from 'node:assert/strict';
import { evacuationPolicies } from '../src/lib/evacplan.js';
import { nearestShelters } from '../src/lib/geomath.js';
import { DICTS } from '../src/i18n.js';

const LS_NONE = { dosekiryu: null, kyukeisha: null, jisuberi: null };

test('evacuationPolicies: 浸水深と継続時間による方針の選択', () => {
  // 3m以上 → 立退き
  assert.deepEqual(
    evacuationPolicies({ floodIdx: 2, keizoku: false, landslide: LS_NONE }),
    ['policy.floodLeave']
  );
  // 0.5〜3m 単独 → 垂直避難も可
  assert.deepEqual(
    evacuationPolicies({ floodIdx: 1, keizoku: false, landslide: LS_NONE }),
    ['policy.floodVertical']
  );
  // 0.5〜3m + 長期浸水 → 立退き (在宅避難は危険)
  assert.deepEqual(
    evacuationPolicies({ floodIdx: 1, keizoku: true, landslide: LS_NONE }),
    ['policy.floodLeave', 'policy.keizoku']
  );
  // 0.5m未満
  assert.deepEqual(
    evacuationPolicies({ floodIdx: 0, keizoku: false, landslide: LS_NONE }),
    ['policy.floodShallow']
  );
  // リスクなし
  assert.deepEqual(
    evacuationPolicies({ floodIdx: -1, keizoku: false, landslide: LS_NONE }),
    ['policy.none']
  );
});

test('evacuationPolicies: 家屋倒壊等氾濫想定区域は浸水深によらず立退き', () => {
  // 区域内 + 浸水0.5〜3m → 立退き案内が先頭、垂直避難は案内しない
  assert.deepEqual(
    evacuationPolicies({ floodIdx: 1, keizoku: false, landslide: LS_NONE, kaokutoukai: true }),
    ['policy.kaokutoukai']
  );
  // 区域内 + 3m以上 → 立退き2種 (区域と深さの両方の理由を提示)
  assert.deepEqual(
    evacuationPolicies({ floodIdx: 3, keizoku: false, landslide: LS_NONE, kaokutoukai: true }),
    ['policy.kaokutoukai', 'policy.floodLeave']
  );
  // 区域内のみ (浸水クラスなし)
  assert.deepEqual(
    evacuationPolicies({ floodIdx: -1, keizoku: false, landslide: LS_NONE, kaokutoukai: true }),
    ['policy.kaokutoukai']
  );
});

test('evacuationPolicies: 土砂災害は特別警戒区域を優先', () => {
  assert.deepEqual(
    evacuationPolicies({
      floodIdx: -1, keizoku: false,
      landslide: { dosekiryu: 'special', kyukeisha: 'warning', jisuberi: null },
    }),
    ['policy.lsSpecial']
  );
  assert.deepEqual(
    evacuationPolicies({
      floodIdx: 3, keizoku: false,
      landslide: { dosekiryu: null, kyukeisha: 'warning', jisuberi: null },
    }),
    ['policy.floodLeave', 'policy.lsWarning']
  );
});

test('evacuationPolicies: 全キーが3言語の辞書に存在する', () => {
  const allKeys = new Set();
  for (const floodIdx of [-1, 0, 1, 2]) {
    for (const keizoku of [false, true]) {
      for (const kaokutoukai of [false, true]) {
        for (const zone of [null, 'warning', 'special']) {
          evacuationPolicies({
            floodIdx, keizoku, kaokutoukai,
            landslide: { dosekiryu: zone, kyukeisha: null, jisuberi: null },
          }).forEach((k) => allKeys.add(k));
        }
      }
    }
  }
  for (const key of allKeys) {
    for (const lang of ['ja', 'easy', 'en']) {
      assert.equal(typeof DICTS[lang][key], 'string', `${lang}:${key}`);
    }
  }
});

test('nearestShelters: 近い順にn件、フィルタと空フォールバック', () => {
  const shelters = [
    { lon: 135.70, lat: 34.60, name: 'A', disasters: ['洪水'] },
    { lon: 135.71, lat: 34.60, name: 'B', disasters: ['土砂'] },
    { lon: 135.695, lat: 34.60, name: 'C', disasters: [] }, // 未指定は常に候補
    { lon: 135.72, lat: 34.60, name: 'D', disasters: ['洪水', '土砂'] },
  ];
  const near = nearestShelters(shelters, 135.694, 34.60, '洪水', 2);
  assert.deepEqual(near.map((x) => x.shelter.name), ['C', 'A']);
  assert.ok(near[0].dist < near[1].dist);
  // 該当フィルタなし → 全件から
  const fallback = nearestShelters(
    [{ lon: 135.70, lat: 34.60, name: 'X', disasters: ['土砂'] }],
    135.694, 34.60, '洪水', 2
  );
  assert.deepEqual(fallback.map((x) => x.shelter.name), ['X']);
});
