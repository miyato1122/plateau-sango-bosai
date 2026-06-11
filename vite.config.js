import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cesium from 'vite-plugin-cesium';

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
  plugins: [cesium(), bundleCesiumLicense()],
});
