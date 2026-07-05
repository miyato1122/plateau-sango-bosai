// わが家の避難カード — 診断結果からA4印刷用カードを生成する。
// 「一度見て終わり」の診断を、家に貼れる・家族で共有できる形に変える。
import { GSI_PALE } from './config';
import {
  FLOOD_DEPTH_CLASSES,
  nearestShelters,
  compassIndex,
  type FloodDepthInfo,
  type Shelter,
} from './lib/geomath';
import { evacuationPolicies } from './lib/evacplan';
import { t, currentLang, type MsgKey } from './i18n';
import type { LastDiagnosis } from './app/context';
import { openDialog, closeDialog, trapModal } from './app/ui';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function escapeHtml(text: unknown): string {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c as '&' | '<' | '>' | '"' | "'"],
  );
}

// 浸水深クラスの現在言語表記 (app/diagnosis.tsのfloodClassTextと同等の小ヘルパ)
function floodText(flood: FloodDepthInfo) {
  const idx = FLOOD_DEPTH_CLASSES.indexOf(flood as (typeof FLOOD_DEPTH_CLASSES)[number]);
  if (idx >= 0) return { ...t('floodClasses')[idx]!, css: flood.css, idx };
  return { label: t('flood.unknown'), advice: t('flood.unknownAdvice'), css: flood.css, idx: 1 };
}

const listSep = () => (currentLang() === 'en' ? ', ' : '・');

// 共有リンク (?loc=lat,lon&name=…)。個人情報はサーバーへ送らずURLにのみ載る
export function shareUrl({ lat, lon, name }: { lat: number; lon: number; name?: string | null }) {
  const base = `${location.origin}${location.pathname}`;
  const q = new URLSearchParams({ loc: `${lat.toFixed(5)},${lon.toFixed(5)}` });
  if (name) q.set('name', name);
  return `${base}?${q.toString()}`;
}

// ---- 簡易地図 (淡色地図タイル + 現在地・避難所マーカー) ----
interface Point {
  lon: number;
  lat: number;
}

const worldPx = (z: number) => 256 * 2 ** z;
const lonToPx = (lon: number, z: number) => ((lon + 180) / 360) * worldPx(z);
function latToPx(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * worldPx(z);
}

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = GSI_PALE.replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
  });
}

async function drawMap(canvas: HTMLCanvasElement, points: Point[]) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || points.length === 0) return;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, W, H);

  // 全ポイントが収まる最大ズーム (パディング50px)
  let z = 16;
  for (; z > 11; z--) {
    const xs = points.map((p) => lonToPx(p.lon, z));
    const ys = points.map((p) => latToPx(p.lat, z));
    if (Math.max(...xs) - Math.min(...xs) < W - 100 && Math.max(...ys) - Math.min(...ys) < H - 100)
      break;
  }
  const cx = points.reduce((a, p) => a + lonToPx(p.lon, z), 0) / points.length;
  const cy = points.reduce((a, p) => a + latToPx(p.lat, z), 0) / points.length;
  const originX = cx - W / 2;
  const originY = cy - H / 2;

  const t0 = { x: Math.floor(originX / 256), y: Math.floor(originY / 256) };
  const t1 = { x: Math.floor((originX + W) / 256), y: Math.floor((originY + H) / 256) };
  const jobs: Array<Promise<void>> = [];
  for (let tx = t0.x; tx <= t1.x; tx++) {
    for (let ty = t0.y; ty <= t1.y; ty++) {
      jobs.push(
        loadTile(z, tx, ty).then((img) => {
          if (img) ctx.drawImage(img, tx * 256 - originX, ty * 256 - originY);
        }),
      );
    }
  }
  await Promise.all(jobs);

  const toXY = (p: Point): [number, number] => [
    lonToPx(p.lon, z) - originX,
    latToPx(p.lat, z) - originY,
  ];
  // 現在地→避難所の直線 (経路ではなく位置関係の目安)
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#0f6fb8';
  ctx.lineWidth = 2.5;
  for (const p of points.slice(1)) {
    ctx.beginPath();
    ctx.moveTo(...toXY(points[0]!));
    ctx.lineTo(...toXY(p));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // マーカー
  const mark = (p: Point, color: string, label: string) => {
    const [x, y] = toXY(p);
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
  };
  points.slice(1).forEach((p, i) => mark(p, '#16a34a', String(i + 1)));
  mark(points[0]!, '#f97316', '★');
  // 出典表記
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgb(30 41 59 / 0.75)';
  ctx.fillText('地理院タイル', W - 4, H - 3);
}

// ---- カード生成 ----
// diag: { lon, lat, name, risk } / shelters: 全避難所リスト
export async function openEvacCard(
  diag: LastDiagnosis,
  shelters: Shelter[],
  toast?: (message: string) => void,
) {
  const { lon, lat, risk } = diag;
  const name = diag.name ?? t('card.pointFallback');
  const flood = risk.flood ? floodText(risk.flood) : null;
  const floodIdx = flood ? flood.idx : -1;

  // リスク要約行
  const riskRows: string[] = [];
  if (flood) {
    riskRows.push(
      `<li>🌊 ${t('diag.flood', {
        chip: `<span class="depth-chip" style="background:${flood.css}">${escapeHtml(flood.label)}</span>`,
      })}</li>`,
    );
  } else {
    riskRows.push(`<li>🌊 ${t('diag.floodSafe')}</li>`);
  }
  if (risk.keizoku && flood) riskRows.push(`<li>⏳ ${t('diag.keizoku')}</li>`);
  const kk = risk.kaokutoukai;
  const kkTypes = [kk.hanran && t('ls.hanran'), kk.kagan && t('ls.kagan')].filter(
    (v): v is string => Boolean(v),
  );
  if (kkTypes.length) {
    riskRows.push(
      `<li>🏚️ ${t('diag.kaokutoukai', { types: kkTypes.map(escapeHtml).join(listSep()) })}</li>`,
    );
  }
  const ls = risk.landslide;
  const typesOf = (zone: 'special' | 'warning') =>
    [
      ls.dosekiryu === zone && t('ls.dosekiryu'),
      ls.kyukeisha === zone && t('ls.kyukeisha'),
      ls.jisuberi === zone && t('ls.jisuberi'),
    ].filter((v): v is string => Boolean(v));
  const special = typesOf('special');
  const warning = typesOf('warning');
  if (special.length) {
    riskRows.push(
      `<li>⛰️ ${t('diag.landslideSpecial', { types: special.map(escapeHtml).join(listSep()) })}</li>`,
    );
  }
  if (warning.length) {
    riskRows.push(
      `<li>⛰️ ${t('diag.landslide', { types: warning.map(escapeHtml).join(listSep()) })}</li>`,
    );
  }
  if (!special.length && !warning.length) riskRows.push(`<li>⛰️ ${t('diag.landslideSafe')}</li>`);

  // 避難方針
  const zone = special.length ? 'special' : warning.length ? 'warning' : null;
  const policies = evacuationPolicies({
    floodIdx,
    keizoku: risk.keizoku,
    landslide: risk.landslide,
    kaokutoukai: kkTypes.length > 0,
  }).map((key) => t(key as MsgKey, { label: flood?.label ?? '' }));

  // 避難先 (近い順2件)
  const filter = flood ? '洪水' : zone ? '土砂' : null;
  const nearest = nearestShelters(shelters, lon, lat, filter, 2);
  const shelterRows = nearest
    .map(({ shelter: s, dist }, i) => {
      const minutes = Math.max(1, Math.ceil(dist / 80));
      const dir = t('dirs')[compassIndex(lon, lat, s.lon, s.lat)]!;
      return `
      <div class="ec-shelter">
        <span class="ec-shelter-no">${i + 1}</span>
        <div>
          <b>${escapeHtml(s.name)}</b>
          <div class="ec-meta">${escapeHtml(s.address)}</div>
          <div class="ec-meta">${escapeHtml(t('shelter.meta', { dir, dist: Math.round(dist), min: minutes }))}</div>
        </div>
      </div>`;
    })
    .join('');

  const now = new Date();
  const dateStr =
    currentLang() === 'en'
      ? now.toLocaleDateString('en-US')
      : `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

  const overlay = $('evacCard');
  overlay.innerHTML = `
    <div class="ec-sheet" role="document">
      <header class="ec-head" role="presentation">
        <h1>🛡️ ${t('card.title')}</h1>
        <div class="ec-sub">${t('card.created')}: ${dateStr}｜さんごう防災3Dマップ</div>
      </header>
      <section>
        <h2>📍 ${t('card.place')}</h2>
        <p class="ec-place">${escapeHtml(name)} <small>(${lat.toFixed(5)}, ${lon.toFixed(5)})</small></p>
      </section>
      <section>
        <h2>⚠️ ${t('card.riskTitle')}</h2>
        <ul class="ec-risks">${riskRows.join('')}</ul>
      </section>
      <section>
        <h2>🏃 ${t('card.policyTitle')}</h2>
        <ul class="ec-policies">${policies.map((p) => `<li>${p}</li>`).join('')}</ul>
      </section>
      <section>
        <h2>🚨 ${t('card.levelsTitle')}</h2>
        <table class="ec-levels">
          <tr><th>${t('card.level3')}</th><td>${t('card.action3')}</td></tr>
          <tr><th>${t('card.level4')}</th><td>${t('card.action4')}</td></tr>
          <tr><th>${t('card.level5')}</th><td>${t('card.action5')}</td></tr>
        </table>
      </section>
      <section>
        <h2>🏫 ${t('card.sheltersTitle')}</h2>
        <div class="ec-shelter-wrap">
          <div>${shelterRows || `<p class="ec-meta">${t('dash.bldgWait')}</p>`}</div>
          <div class="ec-map-box">
            <canvas id="ecMap" width="460" height="320"></canvas>
            <div class="ec-meta">${t('card.mapNote')}</div>
          </div>
        </div>
      </section>
      <section>
        <h2>📝 ${t('card.memoTitle')}</h2>
        <div class="ec-memo">
          <div>${t('card.memoMeet')}: <span class="ec-line"></span></div>
          <div>${t('card.memoContact')}: <span class="ec-line"></span></div>
          <div>${t('card.memoItems')}</div>
        </div>
      </section>
      <footer class="ec-foot">
        <div>${t('card.disclaimer')}</div>
        <div class="ec-url">${escapeHtml(shareUrl({ lat, lon, name: diag.name }))}</div>
      </footer>
    </div>
    <div class="ec-actions no-print">
      <button type="button" class="action-btn" id="ecPrint">🖨 ${t('card.print')}</button>
      <button type="button" class="action-btn ec-secondary" id="ecCopy">🔗 ${t('card.copyLink')}</button>
      <button type="button" class="action-btn ec-secondary" id="ecClose">✕ ${t('card.close')}</button>
    </div>`;
  // 印刷用の全画面モーダル: フォーカスを閉じ込め、Escapeでも閉じられるようにする
  openDialog(overlay, overlay.querySelector<HTMLElement>('#ecPrint'));
  const untrap = trapModal(overlay, close);
  function close() {
    untrap();
    closeDialog(overlay);
  }

  $('ecPrint').addEventListener('click', () => window.print());
  $('ecClose').addEventListener('click', close);
  $('ecCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl({ lat, lon, name: diag.name }));
      toast?.(t('card.copied'));
    } catch {
      toast?.(t('card.copyFailed'));
    }
  });

  // 地図は非同期に描画 (タイル不通でもマーカーは出す)
  drawMap($('ecMap') as HTMLCanvasElement, [{ lon, lat }, ...nearest.map((n) => n.shelter)]).catch(
    () => {},
  );
}
