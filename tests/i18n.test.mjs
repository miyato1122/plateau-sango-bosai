import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, t, setLang, LANGS } from '../src/i18n.js';
import { FLOOD_DEPTH_CLASSES } from '../src/lib/geomath.js';

test('全言語の辞書キーが日本語辞書と一致する', () => {
  const jaKeys = Object.keys(DICTS.ja).sort();
  for (const lang of ['easy', 'en']) {
    assert.deepEqual(
      Object.keys(DICTS[lang]).sort(), jaKeys,
      `${lang} の辞書キーが ja と一致しない`
    );
  }
});

test('浸水深クラスの訳が全言語で6区分そろっている', () => {
  for (const [lang, dict] of Object.entries(DICTS)) {
    assert.equal(dict.floodClasses.length, FLOOD_DEPTH_CLASSES.length, lang);
    for (const cls of dict.floodClasses) {
      assert.ok(cls.label && cls.advice, `${lang}: label/advice欠落`);
    }
  }
});

test('t: プレースホルダ補間と未知キーのフォールバック', () => {
  setLang('en');
  assert.ok(t('err.notFound', { q: 'Tatsuno' }).includes('Tatsuno'));
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('ja');
  assert.equal(t('shelter.meta', { dir: '北', dist: 120, min: 2 }), '北へ約120m・徒歩約2分');
});

test('プレースホルダが言語間で一致する (訳漏れの検知)', () => {
  const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, jaVal] of Object.entries(DICTS.ja)) {
    if (typeof jaVal !== 'string') continue;
    for (const lang of ['easy', 'en']) {
      assert.deepEqual(
        params(DICTS[lang][key]), params(jaVal),
        `${lang}:${key} のプレースホルダが ja と異なる`
      );
    }
  }
});

test('LANGS: 3言語が定義されている', () => {
  assert.deepEqual(LANGS.map((l) => l.code), ['ja', 'easy', 'en']);
});
