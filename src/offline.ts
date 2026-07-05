// オフライン利用: Service Worker登録と「町内データを保存」機能。
// 保存先キャッシュ名は src/sw.ts と一致させること。
import { CITY_BBOX, GSI_PALE, GSI_DEM } from './config';
import { HAZARD_LAYERS } from './hazards';
import { buildOfflineTileList } from './lib/offline-tiles';
// vite-plugin-pwa の仮想モジュール (型は vite-plugin-pwa/client が提供)
import { registerSW } from 'virtual:pwa-register';

const TILE_CACHE = 'sango-tiles-v1';
const APP_CACHE = 'sango-app-v1';
const META_KEY = 'sango-offline-meta';

// Service Workerを登録する。新バージョン検知時は onNeedRefresh(適用関数) を呼ぶ
// (適用関数を実行すると新SWへ切り替えてページを再読み込みする)。
export function registerServiceWorker(onNeedRefresh?: (apply: () => void) => void): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      onNeedRefresh?.(() => updateSW(true));
    },
    onRegisterError(err: unknown) {
      console.warn('Service Worker登録に失敗:', err);
    },
  });
}

export const offlineSupported = () => 'serviceWorker' in navigator && 'caches' in window;

export interface OfflineMeta {
  savedAt: number;
  ok: number;
  notFound: number;
  failed: number;
  total: number;
}

export function offlineMeta(): OfflineMeta | null {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as OfflineMeta | null;
  } catch {
    return null;
  }
}

// 端末ストレージの使用量 (MB)。取得できない環境ではnull
export async function offlineUsage(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    return est?.usage != null ? est.usage / 1048576 : null;
  } catch {
    return null;
  }
}

// 保存した町内データを削除する (タイル・避難所データ・保存メタ情報)
export async function clearOfflineArea(): Promise<void> {
  await caches.delete(TILE_CACHE);
  try {
    const appCache = await caches.open(APP_CACHE);
    await appCache.delete('./data/shelter.geojson');
  } catch {
    /* アプリ本体キャッシュはSWが管理するため失敗しても支障なし */
  }
  localStorage.removeItem(META_KEY);
}

// 町域をカバーするオフライン保存対象:
//   - 淡色地図 z11–16 (閲覧用ベースマップ)
//   - ハザード4系統 z16 (地点診断 risk.js の判定ズーム) + 洪水 z15 (面積統計)
//   - 標高 z14 (浸水3D表示)
function offlineSources() {
  return [
    { url: GSI_PALE, zooms: [11, 12, 13, 14, 15, 16] },
    { url: GSI_DEM, zooms: [14] },
    { url: HAZARD_LAYERS.flood.url, zooms: [15, 16] },
    { url: HAZARD_LAYERS.keizoku.url, zooms: [16] },
    { url: HAZARD_LAYERS.kaokutoukai_hanran.url, zooms: [16] },
    { url: HAZARD_LAYERS.kaokutoukai_kagan.url, zooms: [16] },
    { url: HAZARD_LAYERS.dosekiryu.url, zooms: [16] },
    { url: HAZARD_LAYERS.kyukeisha.url, zooms: [16] },
    { url: HAZARD_LAYERS.jisuberi.url, zooms: [16] },
  ];
}

// 町内の地図・ハザードタイルと避難所データを端末に保存する。
// ハザードタイルの404は「区域外」を意味する正常応答なので、
// オフラインでも同じ判定になるよう404として記録する。
export async function saveOfflineArea(onProgress?: (done: number, total: number) => void) {
  if (!offlineSupported()) {
    throw new Error('この端末・ブラウザはオフライン保存に対応していません');
  }
  // ストレージ逼迫時にブラウザが保存データを自動削除しないよう永続化を要求する
  // (災害時に頼るデータのため。拒否されても保存自体は続行)
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 非対応ブラウザでは何もしない */
  }
  const tileCache = await caches.open(TILE_CACHE);
  const appCache = await caches.open(APP_CACHE);

  const urls = buildOfflineTileList(CITY_BBOX, offlineSources());
  const total = urls.length + 1; // +1 = 避難所データ
  let done = 0;
  const counts = { ok: 0, notFound: 0, failed: 0 };

  const queue = [...urls];
  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) {
          await tileCache.put(url, res);
          counts.ok += 1;
        } else if (res.status === 404) {
          await tileCache.put(url, new Response(null, { status: 404 }));
          counts.notFound += 1;
        } else {
          counts.failed += 1;
        }
      } catch {
        counts.failed += 1;
      }
      done += 1;
      onProgress?.(done, total);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  // 避難所データ (同梱GeoJSON) も明示的に保存
  try {
    const res = await fetch('./data/shelter.geojson');
    if (res.ok) {
      await appCache.put('./data/shelter.geojson', res);
      counts.ok += 1;
    } else {
      counts.failed += 1;
    }
  } catch {
    counts.failed += 1;
  }
  done += 1;
  onProgress?.(done, total);

  if (counts.failed > total / 2) {
    throw new Error('通信エラーが多発しました。オンライン時にやり直してください');
  }
  const meta = { savedAt: Date.now(), ...counts, total };
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  return meta;
}

// オフライン状態バナーの制御。ページ側のUI要素に反映する。
export function watchOnlineState(onChange: (online: boolean) => void): void {
  const notify = () => onChange(navigator.onLine);
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  notify();
}
