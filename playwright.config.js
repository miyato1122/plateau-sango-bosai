import { defineConfig } from '@playwright/test';

// E2Eスモークテスト。外部API (PLATEAUカタログ・地理院タイル等) はすべて
// テスト側でモックするため、ネットワークに依存せず実行できる。
// ローカルでPlaywright管理外のChromiumを使う場合は PW_CHROMIUM にパスを設定。
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
