import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWarnings, summarizeWarnings, WARNING_CODES } from '../src/lib/jma.js';

// 気象庁 warning JSON の代表的な形 (奈良県 290000 相当の抜粋)
const FIXTURE = {
  reportDatetime: '2026-07-03T10:00:00+09:00',
  areaTypes: [
    {
      areas: [{ code: '290010', warnings: [{ code: '14', status: '発表' }] }],
    },
    {
      areas: [
        {
          code: '2934300',
          warnings: [
            { code: '10', status: '継続' }, // 大雨注意報
            { code: '03', status: '発表' }, // 大雨警報
            { code: '18', status: '解除' }, // 洪水注意報 (解除 → 除外)
            { code: null, status: '発表警報・注意報はなし' }, // 無効エントリ
          ],
        },
        { code: '2920600', warnings: [{ code: '33', status: '発表' }] },
      ],
    },
  ],
};

test('parseWarnings: 対象地域の発表中のみ・深刻度順・解除は除外', () => {
  const list = parseWarnings(FIXTURE, '2934300');
  assert.deepEqual(
    list.map((w) => w.code),
    ['03', '10'],
  ); // 警報が先
  assert.equal(list[0].name, '大雨警報');
  assert.equal(list[0].level, 'warning');
  assert.equal(list[1].level, 'advisory');
});

test('parseWarnings: 対象地域が無い・不正なJSONは空配列', () => {
  assert.deepEqual(parseWarnings(FIXTURE, '9999999'), []);
  assert.deepEqual(parseWarnings(null, '2934300'), []);
  assert.deepEqual(parseWarnings({}, '2934300'), []);
});

test('parseWarnings: 未知コードは安全側に警報扱い・重複は除去', () => {
  const json = {
    areaTypes: [
      {
        areas: [
          {
            code: '2934300',
            warnings: [
              { code: '99', status: '発表' },
              { code: '99', status: '継続' },
            ],
          },
        ],
      },
    ],
  };
  const list = parseWarnings(json, '2934300');
  assert.equal(list.length, 1);
  assert.equal(list[0].level, 'warning');
  assert.equal(list[0].name, '気象警報・注意報');
});

test('summarizeWarnings: 最深刻の区分と名称一覧 / 空はnull', () => {
  const special = parseWarnings(
    {
      areaTypes: [
        {
          areas: [
            {
              code: 'x',
              warnings: [
                { code: '10', status: '継続' },
                { code: '33', status: '発表' },
              ],
            },
          ],
        },
      ],
    },
    'x',
  );
  const sum = summarizeWarnings(special);
  assert.equal(sum.level, 'special');
  assert.deepEqual(sum.names, ['大雨特別警報', '大雨注意報']);
  assert.equal(summarizeWarnings([]), null);
});

test('WARNING_CODES: 特別警報/警報/注意報の区分が揃っている', () => {
  for (const def of Object.values(WARNING_CODES)) {
    assert.ok(['special', 'warning', 'advisory'].includes(def.level));
    assert.ok(def.name.length > 0);
  }
});
