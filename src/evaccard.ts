// わが家の避難カード — 診断結果からA4印刷用カードを生成する。
// 「一度見て終わり」の診断を、家に貼れる・家族で共有できる形に変える。
import { GSI_PALE } from './config';
import { nearestShelters, compassIndex, type Shelter } from './lib/geomath';
import { evacuationPolicies } from './lib/evacplan';
import { t, currentLang } from './i18n';
import type { LastDiagnosis } from './app/context';
import type { DiagnosisRisk } from './risk';
import { landslideTypeNames, kaokutoukaiTypeNames, walkMinutes } from './app/risk-text';
import {
  $,
  escapeHtml,
  listSep,
  floodClassText,
  openDialog,
  closeDialog,
  trapModal,
} from './app/ui';

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
// 手順: ①リスク要約 → ②避難方針 → ③避難先2件 → ④A4カードHTMLの流し込み → ⑤ボタン配線と地図描画
export async function openEvacCard(
  diag: LastDiagnosis,
  shelters: Shelter[],
  toast?: (message: string) => void,
) {
  const { lon, lat, risk } = diag;
  const name = diag.name ?? t('card.pointFallback');
  const flood = risk.flood ? floodClassText(risk.flood) : null;

  // ① リスク要約 (診断カードと同じ判定結果を箇条書きにする)
  const special = landslideTypeNames(risk.landslide, 'special');
  const warning = landslideTypeNames(risk.landslide, 'warning');
  const kkTypes = kaokutoukaiTypeNames(risk.kaokutoukai);
  const riskRows = buildRiskList(risk, flood, kkTypes, special, warning);

  // ② わが家の避難方針 (判断ロジックは lib/evacplan.ts。ここでは文言化のみ)
  const policies = evacuationPolicies({
    floodIdx: flood ? flood.idx : -1,
    keizoku: risk.keizoku,
    landslide: risk.landslide,
    kaokutoukai: kkTypes.length > 0,
  }).map((key) => t(key, { label: flood?.label ?? '' }));

  // ③ 避難先 (近い順2件)。対応災害フィルタは日本語の公式データ値と照合する
  const filter = flood ? '洪水' : special.length + warning.length ? '土砂' : null;
  const nearest = nearestShelters(shelters, lon, lat, filter, 2);
  const shelterRows = nearest.map((n, i) => shelterCardRow(lon, lat, n, i)).join('');

  // ④ A4カードのHTMLを流し込む
  const overlay = $('evacCard');
  overlay.innerHTML = cardHtml({
    name,
    lon,
    lat,
    riskRows,
    policies,
    shelterRows,
    share: shareUrl({ lat, lon, name: diag.name }),
  });

  // ⑤ 印刷用の全画面モーダル: フォーカスを閉じ込め、Escapeでも閉じられるようにする
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

// リスク要約の箇条書き。並びは診断カードと同じ: 浸水 → 継続時間 → 家屋倒壊等 → 土砂
function buildRiskList(
  risk: DiagnosisRisk,
  flood: ReturnType<typeof floodClassText> | null,
  kkTypes: string[],
  special: string[],
  warning: string[],
): string[] {
  const rows: string[] = [];
  if (flood) {
    rows.push(
      `<li>🌊 ${t('diag.flood', {
        chip: `<span class="depth-chip" style="background:${flood.css}">${escapeHtml(flood.label)}</span>`,
      })}</li>`,
    );
  } else {
    rows.push(`<li>🌊 ${t('diag.floodSafe')}</li>`);
  }
  if (risk.keizoku && flood) rows.push(`<li>⏳ ${t('diag.keizoku')}</li>`);
  if (kkTypes.length) {
    rows.push(
      `<li>🏚️ ${t('diag.kaokutoukai', { types: kkTypes.map(escapeHtml).join(listSep()) })}</li>`,
    );
  }
  if (special.length) {
    rows.push(
      `<li>⛰️ ${t('diag.landslideSpecial', { types: special.map(escapeHtml).join(listSep()) })}</li>`,
    );
  }
  if (warning.length) {
    rows.push(
      `<li>⛰️ ${t('diag.landslide', { types: warning.map(escapeHtml).join(listSep()) })}</li>`,
    );
  }
  if (!special.length && !warning.length) rows.push(`<li>⛰️ ${t('diag.landslideSafe')}</li>`);
  return rows;
}

// 避難先1件分の行 (番号バッジ + 名称・住所・方角/距離/徒歩分数)
function shelterCardRow(
  lon: number,
  lat: number,
  { shelter: s, dist }: { shelter: Shelter; dist: number },
  index: number,
): string {
  const dir = t('dirs')[compassIndex(lon, lat, s.lon, s.lat)]!;
  return `
      <div class="ec-shelter">
        <span class="ec-shelter-no">${index + 1}</span>
        <div>
          <b>${escapeHtml(s.name)}</b>
          <div class="ec-meta">${escapeHtml(s.address)}</div>
          <div class="ec-meta">${escapeHtml(t('shelter.meta', { dir, dist: Math.round(dist), min: walkMinutes(dist) }))}</div>
        </div>
      </div>`;
}

// 作成日の表記 (印刷カードのヘッダ用)
function createdDateLabel(): string {
  const now = new Date();
  return currentLang() === 'en'
    ? now.toLocaleDateString('en-US')
    : `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

// A4印刷カード全体のHTML。セクション構成:
//   場所 → リスク → 避難方針 → 警戒レベル別行動 → 避難先 (+位置図) → 家族メモ → 免責/共有URL
function cardHtml(parts: {
  name: string;
  lon: number;
  lat: number;
  riskRows: string[];
  policies: string[];
  shelterRows: string;
  share: string;
}): string {
  const { name, lon, lat, riskRows, policies, shelterRows, share } = parts;
  return `
    <div class="ec-sheet" role="document">
      <header class="ec-head" role="presentation">
        <h1>🛡️ ${t('card.title')}</h1>
        <div class="ec-sub">${t('card.created')}: ${createdDateLabel()}｜さんごう防災3Dマップ</div>
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
        <div class="ec-url">${escapeHtml(share)}</div>
      </footer>
    </div>
    <div class="ec-actions no-print">
      <button type="button" class="action-btn" id="ecPrint">🖨 ${t('card.print')}</button>
      <button type="button" class="action-btn ec-secondary" id="ecCopy">🔗 ${t('card.copyLink')}</button>
      <button type="button" class="action-btn ec-secondary" id="ecClose">✕ ${t('card.close')}</button>
    </div>`;
}
