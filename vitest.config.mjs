// 単体テストランナー (Vitest)。
// vite.config.js (vite-plugin-cesium) はブラウザビルド用のため読み込まない。
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
  },
});
