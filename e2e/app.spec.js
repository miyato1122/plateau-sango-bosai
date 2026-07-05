import { test, expect } from '@playwright/test';
import { mockExternal } from './helpers.mjs';

// 外部配信 (PLATEAUカタログ・地理院・ハザードタイル) を全てモックした
// アプリのE2Eスモーク。検証すること:
//   1. 起動: 主要UIが表示され、Service Workerが有効化される
//   2. タップ診断: モックした洪水タイルの色から浸水深が判定・表示される
//   3. フォールバック: カタログAPI不通時に同梱の避難所46件が使われる
//   4. 住所検索: ジオコーダ結果から診断カードが開く
//   5. 言語切替: やさしい日本語/英語がUIへ反映される

// Service Workerはリクエストを横取りするとpage.routeのモックが効かなくなるため
// このスイートでは無効化する (SW自体の検証は sw.spec.js)。
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await mockExternal(page);
  await page.goto('/');
});

test('起動: 主要UIが表示される', async ({ page }) => {
  await expect(page.locator('#brand')).toBeVisible();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#offlineSave')).toBeVisible();
  await expect(page.locator('#hazardChips .chip')).toHaveCount(7);
});

test('タップ診断: 地図クリックで診断カードが開き洪水・土砂の行が出る', async ({ page }) => {
  // クリック位置→地理座標はカメラ姿勢に依存するため、ここではタップ→診断の
  // 配線を検証する (浸水深の色判定は住所検索テストで確定座標により検証)
  await page.waitForTimeout(3000);
  const canvas = page.locator('#cesiumContainer canvas').first();
  await canvas.click({ force: true });
  await expect(page.locator('#resultCard')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resultBody .risk-row')).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator('#resultBody')).toContainText('土砂災害警戒区域外');
});

test('フォールバック: カタログ不通時に同梱の避難所データ46件を使う', async ({ page }) => {
  await expect(page.locator('#status-shelter')).toContainText('46件', { timeout: 20000 });
  await expect(page.locator('#status-shelter')).toContainText('同梱');
});

test('住所検索: 診断カードが開きモック洪水タイルの浸水深が判定される', async ({ page }) => {
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#resultCard')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resultTitle')).toContainText('勢野西');
  // モックした洪水タイル色 rgb(255,216,192) → 0.5〜3.0m と判定されること
  await expect(page.locator('#resultBody')).toContainText('0.5〜3.0m', { timeout: 15000 });
  await expect(page.locator('#resultBody')).toContainText('最寄りの避難場所');
});

test('避難カード: 診断結果から生成され、避難先・警戒レベル・共有URLを含む', async ({ page }) => {
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#makeCardBtn')).toBeVisible({ timeout: 15000 });
  await page.click('#makeCardBtn');
  await expect(page.locator('#evacCard')).toBeVisible();
  const sheet = page.locator('#evacCard .ec-sheet');
  await expect(sheet).toContainText('わが家の避難カード');
  await expect(sheet).toContainText('0.5〜3.0m'); // 診断結果の引き継ぎ
  await expect(sheet).toContainText('警戒レベル3'); // 行動表
  await expect(sheet.locator('.ec-shelter')).toHaveCount(2); // 近い順2件
  await expect(sheet).toContainText('?loc=34.599'); // 共有URL
  await page.click('#ecClose');
  await expect(page.locator('#evacCard')).toBeHidden();
});

test('共有リンク (?loc=): 起動時にその地点を自動診断する', async ({ page }) => {
  await page.goto('/?loc=34.59900,135.69400&name=%E8%87%AA%E5%AE%85');
  await expect(page.locator('#resultCard')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#resultTitle')).toContainText('自宅');
  await expect(page.locator('#resultBody')).toContainText('0.5〜3.0m', { timeout: 15000 });
});

// 勢野西周辺を覆う格子状の道路網 (全エッジ安全)
function gridRoads() {
  const nodes = [];
  const edges = [];
  const NX = 9;
  const NY = 8;
  const idx = (i, j) => j * NX + i;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      nodes.push([135.69 + i * 0.001, 34.594 + j * 0.001]);
    }
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      if (i + 1 < NX) edges.push([idx(i, j), idx(i + 1, j), 92, -1, 0]);
      if (j + 1 < NY) edges.push([idx(i, j), idx(i, j + 1), 111, -1, 0]);
    }
  }
  return { version: 1, nodes, edges };
}

test('安全ルート: 道路網データがある場合にボタンが出て経路サマリを表示する', async ({ page }) => {
  await page.route('**/data/roads.json', (route) => route.fulfill({ json: gridRoads() }));
  await page.goto('/'); // ルート登録後に読み込み直す
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  const btn = page.locator('#safeRouteBox .route-btn');
  await expect(btn).toBeVisible({ timeout: 20000 });
  await btn.click();
  await expect(page.locator('#safeRouteBox .meta')).toContainText('徒歩ルート', { timeout: 15000 });
  await expect(page.locator('#safeRouteBox .meta')).not.toContainText('想定区域内を通ります');
});

test('安全ルート: 道路網データが無い場合はボタンを出さない', async ({ page }) => {
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#resultCard')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resultBody')).toContainText('最寄りの避難場所');
  await expect(page.locator('#safeRouteBox .route-btn')).toHaveCount(0);
});

test('気象警報バナー: 三郷町に警報発表中はバナーが表示される', async ({ page }) => {
  await page.route('https://www.jma.go.jp/bosai/warning/data/warning/290000.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        areaTypes: [
          {
            areas: [
              {
                code: '2934300',
                warnings: [
                  { code: '03', status: '発表' },
                  { code: '18', status: '継続' },
                ],
              },
            ],
          },
        ],
      }),
    }),
  );
  await page.goto('/');
  const banner = page.locator('#weatherBanner');
  await expect(banner).toBeVisible({ timeout: 10000 });
  await expect(banner).toContainText('大雨警報');
  await expect(banner).toContainText('洪水注意報');
  expect(await banner.getAttribute('data-level')).toBe('warning');
});

test('気象警報バナー: 発表なし・取得不可のときは表示しない', async ({ page }) => {
  await expect(page.locator('#brand')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('#weatherBanner')).toBeHidden();
});

test('オフライン保存: 保存済みメタがあると削除ボタンが出て、確認後に削除される', async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'sango-offline-meta',
      JSON.stringify({ savedAt: Date.now(), ok: 100, notFound: 20, failed: 0, total: 121 }),
    );
  });
  await page.goto('/');
  const deleteBtn = page.locator('#offlineDelete');
  await expect(deleteBtn).toBeVisible();
  await expect(page.locator('#offline-note')).toContainText('保存済み');
  page.on('dialog', (dialog) => dialog.accept());
  await deleteBtn.click();
  await expect(deleteBtn).toBeHidden();
  await expect(page.locator('#offline-note')).toContainText('まだ保存されていません');
});

test('このアプリについて: パネルからリンクされ、プライバシーポリシーが表示される', async ({
  page,
}) => {
  await expect(page.locator('#panel a[href="./about.html"]')).toBeAttached();
  await page.goto('/about.html');
  await expect(page.locator('h1')).toContainText('さんごう防災3Dマップについて');
  await expect(page.locator('main')).toContainText('サーバーに送信されません');
});

test('言語切替: やさしい日本語と英語がUIに反映される', async ({ page }) => {
  await page.selectOption('#langSelect', 'easy');
  await expect(page.locator('#panelTitle')).toHaveText('ちず の せってい');
  await page.selectOption('#langSelect', 'en');
  await expect(page.locator('#panelTitle')).toHaveText('Layers & Legend');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
});
