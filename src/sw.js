/* さんごう防災3Dマップ Service Worker
 *
 * 方針:
 *   - アプリ本体 (同一オリジン): ハッシュ付きアセットはキャッシュ優先、
 *     ナビゲーションはネットワーク優先 (オフライン時はキャッシュしたシェル)
 *   - 地図タイル (地理院・ハザードマップポータル): キャッシュ優先。
 *     「オフラインに保存」機能 (src/offline.js) が同じキャッシュへ事前保存する
 *   - PLATEAUデータカタログAPI: ネットワーク優先 (オフライン時は前回結果)
 *   - 3D建物タイル (assets.cms.plateau.reearth.io): キャッシュ優先+エントリ数上限。
 *     事前保存はしないが「閲覧した範囲」は圏外でも3D表示できる (URLはハッシュ付き
 *     で不変のためキャッシュ優先が安全)
 *   - 地形・ジオコーダは素通し (オフライン価値が低いため)
 *
 * キャッシュ名は src/offline.js と一致させること。
 */
const VERSION = 'v1';
const APP_CACHE = `sango-app-${VERSION}`;
const TILE_CACHE = `sango-tiles-${VERSION}`;
const DATA_CACHE = `sango-data-${VERSION}`;
const TILES3D_CACHE = `sango-3dtiles-${VERSION}`;
// 3D建物キャッシュの上限 (1エントリ平均100〜300KB → 全体でおよそ40〜120MB)
const TILES3D_MAX_ENTRIES = 400;

const CORE_ASSETS = ['./', './index.html', './manifest.webmanifest'];
// ビルド時に vite-plugin-pwa がハッシュ付きアセット一覧を注入する
const PRECACHE_URLS = (self.__WB_MANIFEST || []).map((entry) =>
  typeof entry === 'string' ? entry : entry.url,
);

// タイル配信ホスト (キャッシュ優先の対象)
const TILE_HOSTS = ['cyberjapandata.gsi.go.jp', 'disaportaldata.gsi.go.jp'];
// PLATEAU 3D Tiles (建物) の配信ホスト
const TILES3D_HOST = 'assets.cms.plateau.reearth.io';

self.addEventListener('install', (event) => {
  // CORE_ASSETSとprecache一覧は同じファイルを指し得るため、絶対URLで重複排除する
  // (Cache.addAll は重複リクエストがあると失敗する)
  const urls = [
    ...new Set([...CORE_ASSETS, ...PRECACHE_URLS].map((u) => new URL(u, self.location.href).href)),
  ];
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(urls)));
});

// 新バージョンの適用は「更新があります」バナーの操作で行う
// (virtual:pwa-register の updateSW() がこのメッセージを送る)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [APP_CACHE, TILE_CACHE, DATA_CACHE, TILES3D_CACHE];
      for (const key of await caches.keys()) {
        if (!keep.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  // オフライン保存が記録した「404 = 区域外」も含めてキャッシュを正とする
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// キャッシュ優先 + エントリ数上限 (古いものから削除)。閲覧済み3D建物の保持に使う
async function cacheFirstCapped(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const clone = response.clone();
    cache.put(request, clone).then(async () => {
      const keys = await cache.keys();
      if (keys.length > maxEntries) {
        for (const key of keys.slice(0, keys.length - maxEntries)) {
          await cache.delete(key);
        }
      }
    });
  }
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl = null) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit =
      (await cache.match(request)) ?? (fallbackUrl ? await cache.match(fallbackUrl) : null);
    if (hit) return hit;
    throw err;
  }
}

// 同一オリジンの非ハッシュ資産 (データ・manifest等): キャッシュを返しつつ裏で更新
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return hit ?? (await refresh) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_CACHE, './index.html'));
    return;
  }

  if (url.origin === self.location.origin) {
    // Viteのハッシュ付きアセットとCesium静的ファイルは内容が変わらない
    if (url.pathname.includes('/assets/') || url.pathname.includes('/cesium/')) {
      event.respondWith(cacheFirst(request, APP_CACHE));
    } else {
      event.respondWith(staleWhileRevalidate(request, APP_CACHE));
    }
    return;
  }

  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, TILE_CACHE));
    return;
  }

  if (url.hostname === TILES3D_HOST) {
    event.respondWith(cacheFirstCapped(request, TILES3D_CACHE, TILES3D_MAX_ENTRIES));
    return;
  }

  if (url.hostname === 'api.plateauview.mlit.go.jp') {
    event.respondWith(networkFirst(request, DATA_CACHE));
  }
  // それ以外 (Cesium Ion地形・3D Tiles・ジオコーダ等) はブラウザに任せる
});
