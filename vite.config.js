import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cesium from 'vite-plugin-cesium';
import { VitePWA } from 'vite-plugin-pwa';

// CesiumJS は Apache License 2.0。ライセンス全文と第三者ライセンス表記を
// ビルド成果物 (dist/cesium/) に同梱する義務があるためコピーする。
function bundleCesiumLicense() {
  return {
    name: 'bundle-cesium-license',
    closeBundle() {
      const src = fileURLToPath(new URL('./node_modules/cesium/', import.meta.url));
      const destDir = fileURLToPath(new URL('./dist/cesium/', import.meta.url));
      mkdirSync(destDir, { recursive: true });
      // LICENSE.md には Apache 2.0 本文と全ての第三者ライセンスが内包されている。
      // ThirdParty.json は依存ライブラリのライセンス一覧。
      for (const file of ['LICENSE.md', 'ThirdParty.json']) {
        if (existsSync(src + file)) copyFileSync(src + file, destDir + file);
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    cesium(),
    bundleCesiumLicense(),
    // Service Workerは手書き (src/sw.js) を維持し、ハッシュ付きアセットの
    // precache一覧の注入と更新検知 (virtual:pwa-register) のみプラグインに任せる。
    // Cesiumの静的ファイル群は巨大なためprecacheせず、実行時キャッシュに任せる。
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: false, // 登録は src/offline.js が行う
      manifest: false, // 既存の public/manifest.webmanifest を使う
      devOptions: { enabled: false },
      injectManifest: {
        globPatterns: ['index.html', 'manifest.webmanifest', 'assets/*.{js,css}', 'icons/*.png'],
      },
    }),
  ],
});
