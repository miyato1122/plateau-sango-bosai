import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockExternal } from './helpers.mjs';

// アクセシビリティ検査:
//   1. axe-core による自動検査 (主要な画面状態ごと)
//   2. ダイアログのフォーカス管理 (開くと中へ移り、閉じると呼び出し元へ戻る)
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await mockExternal(page);
  await page.goto('/');
});

// Cesium本体が生成するUI (クレジット表記等) は本アプリの管理外のため対象から外す
function axeCheck(page) {
  return new AxeBuilder({ page }).exclude('#cesiumContainer').analyze();
}

test('axe: 起動直後 (レイヤパネル表示) に違反がない', async ({ page }) => {
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#hazardChips .chip')).toHaveCount(7);
  const { violations } = await axeCheck(page);
  expect(violations).toEqual([]);
});

test('axe: 診断カード表示中に違反がない', async ({ page }) => {
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#resultBody')).toContainText('0.5〜3.0m', { timeout: 15000 });
  const { violations } = await axeCheck(page);
  expect(violations).toEqual([]);
});

test('axe: 避難カード (モーダル) 表示中に違反がない', async ({ page }) => {
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#makeCardBtn')).toBeVisible({ timeout: 15000 });
  await page.click('#makeCardBtn');
  await expect(page.locator('#evacCard .ec-sheet')).toBeVisible();
  const { violations } = await axeCheck(page);
  expect(violations).toEqual([]);
});

test('axe: ダークモードでも起動時・診断カードに違反がない', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('#hazardChips .chip')).toHaveCount(7);
  expect((await axeCheck(page)).violations).toEqual([]);
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#resultBody')).toContainText('0.5〜3.0m', { timeout: 15000 });
  expect((await axeCheck(page)).violations).toEqual([]);
});

test('フォーカス管理: 診断カードは開くと見出しへ移り、Escで閉じると検索欄へ戻る', async ({
  page,
}) => {
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#resultCard')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resultTitle')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#resultCard')).toBeHidden();
  await expect(page.locator('#searchInput')).toBeFocused();
});

test('フォーカス管理: 統計ダッシュボードは開閉でボタンとの間を往復する', async ({ page }) => {
  await page.click('#fabDash');
  await expect(page.locator('#dashCard')).toBeVisible();
  await expect(page.locator('#dashTitle')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#dashCard')).toBeHidden();
  await expect(page.locator('#fabDash')).toBeFocused();
});

test('フォーカス管理: 避難カードはフォーカスを閉じ込め、Escで閉じられる', async ({ page }) => {
  await page.fill('#searchInput', '勢野西');
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#makeCardBtn')).toBeVisible({ timeout: 15000 });
  await page.click('#makeCardBtn');
  await expect(page.locator('#evacCard')).toBeVisible();
  await expect(page.locator('#ecPrint')).toBeFocused();
  // Tabを進めてもモーダルの中に留まる (最後の要素から先頭へ循環)
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      document.getElementById('evacCard').contains(document.activeElement),
    );
    expect(inside).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#evacCard')).toBeHidden();
  // 呼び出し元 (カード作成ボタン) へ戻る
  await expect(page.locator('#makeCardBtn')).toBeFocused();
});
