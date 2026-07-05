// 小さなUIユーティリティ (DOM取得・トースト・状態表示・エスケープ)
import { currentLang } from '../i18n.js';

export const $ = (id) => document.getElementById(id);

let toastTimer = null;
export function toast(message, ms = 4000) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

// パネル「データ取得状況」への行追加・更新。エラーはトーストでも通知
export function setStatus(id, text, state = 'loading') {
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

export function escapeHtml(text) {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
}

export const listSep = () => (currentLang() === 'en' ? ', ' : '・');

export const isMobile = () => window.matchMedia('(max-width: 640px)').matches;
