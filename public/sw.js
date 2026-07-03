/* さんごう防災3Dマップ Service Worker
 *
 * 方針:
 *   - アプリ本体 (同一オリジン): ハッシュ付きアセットはキャッシュ優先、
 *     ナビゲーションはネットワーク優先 (オフライン時はキャッシュしたシェル)
 *   - 地図タイル (地理院・ハザードマップポータル): キャッシュ優先。
 *     「オフラインに保存」機能 (src/offline.js) が同じキャッシュへ事前保存する
 *   - PLATEAUデータカタログAPI: ネットワーク優先 (オフライン時は前回結果)
 *   - 3D Tiles配信 (assets.cms.plateau.reearth.io)・地形・ジオコーダは素通し
 *     (大容量またはオフライン価値が低いため)
 *
 * キャッシュ名は src/offline.js と一致させること。
 */
const VERSION = 'v1';
const APP_CACHE = `sango-app-${VERSION}`;
const TILE_CACHE = `sango-tiles-${VERSION}`;
const DATA_CACHE = `sango-data-${VERSION}`;

const CORE_ASSETS = ['./', './index.html', './manifest.webmanifest'];

// タイル配信ホスト (キャッシュ優先の対象)
const TILE_HOSTS = ['cyberjapandata.gsi.go.jp', 'disaportaldata.gsi.go.jp'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [APP_CACHE, TILE_CACHE, DATA_CACHE];
      for (const key of await caches.keys()) {
        if (!keep.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
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

async function networkFirst(request, cacheName, fallbackUrl = null) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit =
      (await cache.match(request)) ??
      (fallbackUrl ? await cache.match(fallbackUrl) : null);
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

  if (url.hostname === 'api.plateauview.mlit.go.jp') {
    event.respondWith(networkFirst(request, DATA_CACHE));
  }
  // それ以外 (Cesium Ion地形・3D Tiles・ジオコーダ等) はブラウザに任せる
});
