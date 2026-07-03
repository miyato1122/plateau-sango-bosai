// PWAアイコン (public/icons/*.png) をSVGから生成する。
// 使い方: node scripts/generate-icons.mjs
// 前提: Chromium (環境変数 CHROMIUM_PATH、既定 /opt/pw-browsers/chromium)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

// 盾 + 波のアプリアイコン。フォントに依存しない純ベクター。
function iconSvg(size, { maskable = false } = {}) {
  const rx = maskable ? 0 : Math.round(size * 0.1875);
  const scale = maskable ? 0.68 : 0.8; // maskableはセーフゾーン(中央80%)に収める
  const t = `translate(${(size * (1 - scale)) / 2} ${(size * (1 - scale)) / 2}) scale(${(size * scale) / 512})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#0f3a5f"/>
  <g transform="${t}">
    <path id="shield" d="M256 28 L448 92 V252 c0 118 -80 190 -192 232 C144 442 64 370 64 252 V92 Z"
      fill="#ffffff"/>
    <clipPath id="clip"><path d="M256 28 L448 92 V252 c0 118 -80 190 -192 232 C144 442 64 370 64 252 V92 Z"/></clipPath>
    <g clip-path="url(#clip)">
      <path d="M64 300 q48 -36 96 0 t96 0 t96 0 t96 0 V484 H64 Z" fill="#38bdf8"/>
      <path d="M64 356 q48 -36 96 0 t96 0 t96 0 t96 0 V484 H64 Z" fill="#0284c7"/>
    </g>
    <path d="M256 28 L448 92 V252 c0 118 -80 190 -192 232 C144 442 64 370 64 252 V92 Z"
      fill="none" stroke="#0f3a5f" stroke-width="20"/>
  </g>
</svg>`;
}

const jobs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
for (const { file, size, maskable } of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}</style>${iconSvg(size, { maskable })}`);
  await page.locator('svg').screenshot({
    omitBackground: !maskable,
    path: new URL(`../public/icons/${file}`, import.meta.url).pathname,
  });
  console.log('generated', file);
}
await browser.close();
