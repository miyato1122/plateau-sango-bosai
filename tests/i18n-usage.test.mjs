import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DICTS } from '../src/i18n';

// src配下とindex.htmlを走査し、t('キー') と data-i18n*="キー" の全リテラルが
// 辞書に実在することを検証する。TS化していないUI層 (.js) のキー誤りもここで捕まえる。
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(js|ts|mjs)$/.test(name)) files.push(p);
  }
  return files;
}

function collectUsedKeys() {
  const used = new Map(); // key -> 使用箇所
  const record = (key, where) => {
    if (!used.has(key)) used.set(key, where);
  };
  for (const file of walk('src')) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) {
      record(m[1], file);
    }
    // 動的キー (テンプレートリテラル) はプレフィックスのみ検証する
    for (const m of text.matchAll(/\bt\(\s*`([^`$]+)\$\{/g)) {
      record(`${m[1]}*`, file);
    }
  }
  const html = readFileSync('index.html', 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) {
    record(m[1], 'index.html');
  }
  return used;
}

test('t()とdata-i18nで使われる全キーが辞書に存在する', () => {
  const used = collectUsedKeys();
  assert.ok(used.size > 50, `検出キーが少なすぎる (${used.size}) — 走査の破損を疑う`);
  const jaKeys = Object.keys(DICTS.ja);
  const missing = [];
  for (const [key, where] of used) {
    if (key.endsWith('*')) {
      // 動的キー: プレフィックスに一致する辞書キーが1つ以上あること
      const prefix = key.slice(0, -1);
      if (!jaKeys.some((k) => k.startsWith(prefix))) missing.push(`${key} (${where})`);
    } else if (!(key in DICTS.ja)) {
      missing.push(`${key} (${where})`);
    }
  }
  assert.deepEqual(missing, [], `辞書に存在しないキー: ${missing.join(', ')}`);
});

test('辞書側の未使用キーを情報として検出できる (キー総数の下限チェック)', () => {
  // 未使用キーは失敗にしない (将来機能用の先行定義を許す) が、
  // 辞書とコードの対応が大きく崩れたら気づけるよう総数を確認する
  const used = collectUsedKeys();
  const literalUsed = [...used.keys()].filter((k) => !k.endsWith('*'));
  const coverage = literalUsed.filter((k) => k in DICTS.ja).length / literalUsed.length;
  assert.equal(coverage, 1);
});
