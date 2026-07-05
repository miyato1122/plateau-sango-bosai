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

// ---- ダイアログのフォーカス管理 ----
// スクリーンリーダー・キーボード利用者がカードの開閉に気づけるように、
// 開くとき: 呼び出し元を記録して見出し等へフォーカスを移す
// 閉じるとき: フォーカスがカード内にあれば呼び出し元へ戻す
const dialogTriggers = new WeakMap<HTMLElement, HTMLElement | null>();

export function openDialog(dialog: HTMLElement, focusTarget?: HTMLElement | null): void {
  // 呼び出し元は閉→開の遷移時のみ記録する (開いたまま診断をやり直しても最初の呼び出し元へ戻す)
  if (dialog.hidden) {
    const active = document.activeElement;
    dialogTriggers.set(dialog, active instanceof HTMLElement ? active : null);
  }
  dialog.hidden = false;
  const target = focusTarget ?? dialog.querySelector<HTMLElement>('h1, h2, button');
  if (!target) return;
  if (!target.matches('button, a[href], input, select, textarea, [tabindex]')) {
    target.setAttribute('tabindex', '-1');
  }
  target.focus({ preventScroll: true });
}

export function closeDialog(dialog: HTMLElement): void {
  if (dialog.hidden) return;
  const hadFocus = dialog.contains(document.activeElement);
  dialog.hidden = true;
  const trigger = dialogTriggers.get(dialog);
  dialogTriggers.delete(dialog);
  // 地図操作中などカード外にフォーカスがある場合は奪わない
  if (hadFocus && trigger && document.contains(trigger)) {
    trigger.focus({ preventScroll: true });
  }
}

// モーダル用のフォーカストラップ (Tabを内側で循環させ、Escapeで閉じる)。
// 戻り値の関数で解除する。
export function trapModal(overlay: HTMLElement, onClose: () => void): () => void {
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = overlay.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!overlay.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeydown);
  return () => document.removeEventListener('keydown', onKeydown);
}
