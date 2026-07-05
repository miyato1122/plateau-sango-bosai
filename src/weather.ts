// 気象警報・注意報の監視 (気象庁 防災情報JSON)。
// 取得できないときは静かに非表示のまま (アプリの他機能へ影響させない)。
import { parseWarnings, summarizeWarnings, type WarningSummary } from './lib/jma';

// 奈良県の警報JSONと三郷町の地域コード。コード体系は気象庁の内部仕様のため、
// 変更された場合は対象地域が見つからず「表示なし」に縮退する (誤表示はしない)。
export const JMA_WARNING_URL = 'https://www.jma.go.jp/bosai/warning/data/warning/290000.json';
export const SANGO_AREA_CODE = '2934300';
// 詳細ページ (バナーから案内する公式ページ)
export const JMA_PAGE_URL =
  'https://www.jma.go.jp/bosai/warning/#area_type=class20s&area_code=2934300';

const REFRESH_MS = 10 * 60 * 1000;

async function fetchSummary(): Promise<WarningSummary | null> {
  const res = await fetch(JMA_WARNING_URL, { cache: 'no-cache' });
  if (!res.ok) return null;
  const json = await res.json();
  return summarizeWarnings(parseWarnings(json, SANGO_AREA_CODE));
}

// 警報状態の監視を開始する。onChange(summary|null) を初回+10分ごと+復帰時に呼ぶ。
export function startWeatherWatch(onChange: (summary: WarningSummary | null) => void): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      onChange(await fetchSummary());
    } catch {
      onChange(null); // 取得不可 → 非表示 (誤った「発表なし」表示をしない文言にする)
    }
  };
  tick();
  const timer = setInterval(tick, REFRESH_MS);
  window.addEventListener('online', tick);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', tick);
  };
}
