import { test } from 'vitest';
import assert from 'node:assert/strict';
import { track, metricsSnapshot } from '../src/lib/metrics';

function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('track: 機能別の回数を積み上げる', () => {
  const s = fakeStorage();
  track('diagnosis', s);
  track('diagnosis', s);
  track('evac_card', s);
  const snap = metricsSnapshot(s);
  assert.equal(snap.counts.diagnosis, 2);
  assert.equal(snap.counts.evac_card, 1);
  assert.ok(snap.updatedAt > 0);
});

test('track: 壊れた保存値・ストレージ無しでも例外を出さない', () => {
  const broken = fakeStorage({ 'sango-metrics': '{{{' });
  assert.doesNotThrow(() => track('diagnosis', broken));
  assert.deepEqual(metricsSnapshot(broken).counts, {});
  assert.doesNotThrow(() => track('diagnosis', null));
  assert.deepEqual(metricsSnapshot(null).counts, {});
});

test('track: 位置情報など回数以外は保存されない (キー名のみ)', () => {
  const s = fakeStorage();
  track('safe_route', s);
  const raw = JSON.parse(s.getItem('sango-metrics'));
  assert.deepEqual(Object.keys(raw).sort(), ['counts', 'updatedAt']);
  assert.deepEqual(Object.keys(raw.counts), ['safe_route']);
});
