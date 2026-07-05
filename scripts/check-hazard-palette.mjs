// ハザードタイルの配色変更を検知する監視スクリプト (週次monitor用)。
//
// 地点診断 (src/risk.ts) はハザードタイルのピクセル色を凡例色と照合して
// 判定するため、配信側が配色を変更すると「静かに誤判定」になる。
// E2Eは配信をモックしているのでこの変化はCIでは捕まらない。
// ここでは町内の洪水浸水想定タイルを実際に取得し、アプリと同じ分類器
// (floodClassIndex) に通して、凡例色に分類できるピクセルが失われたら
// 失敗させることで配色変更・配信仕様変更に気づけるようにする。
//
//   実行: npx tsx scripts/check-hazard-palette.mjs
import { PNG } from 'pngjs';
import { tileCoords, floodClassIndex } from '../src/lib/geomath';

// 町域bbox (src/config.ts の CITY_BBOX と同値。configはVite依存のため直接記述)
const BBOX = { west: 135.65, south: 34.565, east: 135.73, north: 34.625 };
// 洪水浸水想定 (想定最大規模) タイル (src/hazards.ts flood.url と同値)
const FLOOD_URL =
  'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png';
const Z = 15; // 面積統計 (src/floodgrid.ts) と同じズーム

const a = tileCoords(BBOX.west, BBOX.north, Z);
const b = tileCoords(BBOX.east, BBOX.south, Z);

let tilesOk = 0;
let sampled = 0; // 不透明 (=何らかの区域塗り) ピクセル数
let classified = 0; // 凡例色に分類できたピクセル数

for (let x = a.x; x <= b.x; x++) {
  for (let y = a.y; y <= b.y; y++) {
    const url = FLOOD_URL.replace('{z}', String(Z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    const res = await fetch(url);
    if (res.status === 404) {
      // 区域なし地点の正常応答
      console.log(`404 (区域なし) ${url}`);
      continue;
    }
    if (!res.ok) {
      console.error(`::error::タイル取得失敗 (HTTP ${res.status}) ${url}`);
      process.exit(1);
    }
    tilesOk += 1;
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    for (let i = 0; i < png.width * png.height; i++) {
      const alpha = png.data[i * 4 + 3];
      if (alpha === 0) continue;
      sampled += 1;
      const idx = floodClassIndex({
        r: png.data[i * 4],
        g: png.data[i * 4 + 1],
        b: png.data[i * 4 + 2],
        a: alpha,
      });
      if (idx >= 0) classified += 1;
    }
  }
}

const ratio = sampled > 0 ? classified / sampled : 0;
console.log(
  `タイル${tilesOk}枚取得 / 有色ピクセル${sampled} / 凡例色に分類${classified} (${(ratio * 100).toFixed(1)}%)`,
);

if (tilesOk === 0) {
  console.error('::error::洪水タイルが1枚も取得できません (配信停止または座標仕様の変更)');
  process.exit(1);
}
if (sampled === 0) {
  console.error('::error::浸水想定の塗りが検出できません (タイル内容の仕様変更の可能性)');
  process.exit(1);
}
if (classified === 0) {
  console.error(
    '::error::凡例色に分類できるピクセルがありません — 配信側の配色変更の可能性。' +
      'src/lib/geomath.ts の FLOOD_DEPTH_CLASSES を公式凡例と照合してください',
  );
  process.exit(1);
}
if (ratio < 0.5) {
  console.warn(
    `::warning::凡例色に分類できる割合が${(ratio * 100).toFixed(1)}%に低下しています。配色の部分変更の可能性があります`,
  );
}
console.log('OK: 配色はアプリの分類器と整合しています');
