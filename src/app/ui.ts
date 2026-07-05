// 小さなUIユーティリティ (DOM取得・トースト・状態表示・エスケープ)
import { currentLang } from '../i18n';

// idは index.html に静的に存在するものだけを渡す前提 (存在しない場合は実行時エラー)
export const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
export const $input = (id: string): HTMLInputElement => $(id) as HTMLInputElement;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, ms = 4000): void {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

// パネル「データ取得状況」への行追加・更新。エラーはトーストでも通知
export function setStatus(
  id: string,
  text: string,
  state: 'loading' | 'ok' | 'warn' | 'error' = 'loading',
): void {
  let li = document.getElementById(`status-${id}`);
  if (!li) {
    li = document.createElement('li');
    li.id = `status-${id}`;
    $('statusList').appendChild(li);
  }
  li.textContent = text;
  li.dataset.state = state;
  if (state === 'error') toast(text);
}

export function escapeHtml(text: unknown): string {
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

export const listSep = () => (currentLang() === 'en' ? ', ' : '・');

export const isMobile = () => window.matchMedia('(max-width: 640px)').matches;
