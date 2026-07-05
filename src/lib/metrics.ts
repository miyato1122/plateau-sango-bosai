// 利用回数の記録 (プライバシー配慮・端末内のみ)。
//
// 方針 (public/about.html の 3-2 に記載):
//   - 記録するのは「どの機能が何回使われたか」の回数のみ
//   - 位置情報・診断結果・個人を特定できる情報は一切記録しない
//   - 端末の外には送信しない (localStorage のみ)
//
// 将来アクセス解析を導入する場合は、この track() が唯一の計測ポイントになる。
// 導入時は個人を特定しない方式を採用し、about.html で事前告知すること (KPI設計書参照)。
const KEY = 'sango-metrics';

/** localStorage互換の最小インターフェース (テストで差し替え可能) */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MetricsSnapshot {
  counts: Record<string, number>;
  updatedAt?: number;
}

const defaultStorage = (): StorageLike | null => {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
};

export function track(event: string, storage: StorageLike | null = defaultStorage()): void {
  if (!storage || typeof event !== 'string' || !event) return;
  try {
    const data = JSON.parse(storage.getItem(KEY) ?? '{}') as MetricsSnapshot;
    data.counts ??= {};
    data.counts[event] = (data.counts[event] ?? 0) + 1;
    data.updatedAt = Date.now();
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 記録できなくても機能には影響させない */
  }
}

// 端末内の集計値を読む (出前講座等でその場の利用数を見せる・不具合調査用)
export function metricsSnapshot(storage: StorageLike | null = defaultStorage()): MetricsSnapshot {
  if (!storage) return { counts: {} };
  try {
    const data = JSON.parse(storage.getItem(KEY) ?? '{}') as Partial<MetricsSnapshot>;
    return { counts: {}, ...data };
  } catch {
    return { counts: {} };
  }
}
