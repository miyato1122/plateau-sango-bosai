import { test, expect } from '@playwright/test';

// Service Worker登録の検証 (app.spec.js はSWを無効化しているため分離)。
// 外部配信が不通でもアプリシェルの登録・有効化が完了することを確認する。
test('Service Workerが登録され有効化される', async ({ page }) => {
  await page.goto('/');
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state ?? null;
  });
  expect(swState).toBe('activated');
  // アプリシェルの事前キャッシュが作成されている
  const cacheKeys = await page.evaluate(() => caches.keys());
  expect(cacheKeys.some((k) => k.startsWith('sango-app-'))).toBe(true);
});
