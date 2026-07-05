// E2E共通ヘルパ: 外部配信のモックとタイル画像生成
import { PNG } from 'pngjs';

// 一色塗りの256pxタイルPNGを生成する (ハザードタイルのモック用)
export function solidTile(r, g, b) {
  const png = new PNG({ width: 256, height: 256 });
  for (let i = 0; i < 256 * 256; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

// 洪水浸水想定タイル (0.5〜3.0mの凡例色)
export const FLOOD_TILE_05_30 = solidTile(255, 216, 192);

// 外部配信 (PLATEAUカタログ・地理院・ハザードタイル・気象庁・Cesium Ion) を
// すべてモックする。Playwrightは後から登録したルートを優先するため、
// 汎用404を先に登録してから個別モックを重ねる。
export async function mockExternal(page) {
  // PLATEAUデータカタログ: 不通を再現 (同梱データへのフォールバックを検証)
  await page.route('https://api.plateauview.mlit.go.jp/**', (route) => route.abort());
  // crossOrigin付きの画像読込・fetchが通るようCORSヘッダを必ず返す
  const cors = { 'access-control-allow-origin': '*' };
  // 土砂3種などは404 (=区域外)、洪水タイルは一色のモック
  await page.route('https://disaportaldata.gsi.go.jp/**', (route) =>
    route.fulfill({ status: 404, headers: cors, body: '' }),
  );
  await page.route(
    'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/**',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: cors,
        body: FLOOD_TILE_05_30,
      }),
  );
  // 地理院タイル (ベースマップ・標高・skhb): 404で応答
  await page.route('https://cyberjapandata.gsi.go.jp/**', (route) =>
    route.fulfill({ status: 404, headers: cors, body: '' }),
  );
  // ジオコーダ: 勢野西の固定結果
  await page.route('https://msearch.gsi.go.jp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify([
        {
          geometry: { coordinates: [135.694, 34.599] },
          properties: { title: '奈良県生駒郡三郷町勢野西' },
        },
      ]),
    }),
  );
  // 気象庁: 既定は「発表なし」
  await page.route('https://www.jma.go.jp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({ areaTypes: [] }),
    }),
  );
  // Cesium Ion (地形) は不通に
  await page.route('https://api.cesium.com/**', (route) => route.abort());
  await page.route('https://assets.ion.cesium.com/**', (route) => route.abort());
}
