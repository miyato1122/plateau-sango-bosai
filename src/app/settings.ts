// 表示設定 (言語・文字サイズ)・パネル開閉・キーボード操作
import { t, setLang, currentLang, applyStatic, LANGS } from '../i18n';
import { $, $input, toast, isMobile, openDialog, closeDialog } from './ui';
import { closeResultCard } from './diagnosis';

// 言語セレクタとdata-i18n適用。チップ等がt()を使うため、他モジュールより先に呼ぶ
export function initLanguage() {
  const langSelect = $('langSelect') as HTMLSelectElement;
  for (const { code, label } of LANGS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    langSelect.appendChild(opt);
  }
  langSelect.value = currentLang();
  langSelect.addEventListener('change', () =>
    setLang(langSelect.value as Parameters<typeof setLang>[0]),
  );
  applyStatic();
}

export function initSettings() {
  initPanel();
  initFontSize();
  initKeyboard();
  initFirstRunHint();
}

// ---- パネル開閉 ----
function initPanel() {
  const panel = $('panel');
  $('fabLayers').addEventListener('click', () => {
    if (panel.hidden) openDialog(panel, $('panelTitle'));
    else closeDialog(panel);
  });
  $('panelClose').addEventListener('click', () => closeDialog(panel));
  if (window.matchMedia('(min-width: 641px)').matches) panel.hidden = false;
}

// ---- 文字サイズ切替 ----
function initFontSize() {
  const FONT_KEY = 'sango-font-large';
  const fontToggle = $input('fontLarge');
  const applyFontSize = (large: boolean) => {
    document.body.classList.toggle('font-large', large);
    fontToggle.checked = large;
  };
  applyFontSize(localStorage.getItem(FONT_KEY) === '1');
  fontToggle.addEventListener('change', () => {
    applyFontSize(fontToggle.checked);
    localStorage.setItem(FONT_KEY, fontToggle.checked ? '1' : '0');
  });
}

// ---- Escapeでカード・パネルを閉じる ----
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('evacCard').hidden) return; // モーダルは自身のフォーカストラップが閉じる
    if (!$('resultCard').hidden) {
      closeResultCard();
      return;
    }
    if (!$('dashCard').hidden) {
      closeDialog($('dashCard'));
      return;
    }
    if (!$('panel').hidden && isMobile()) closeDialog($('panel'));
  });
}

// ---- 初回ヒント ----
function initFirstRunHint() {
  if (localStorage.getItem('sango-hint-shown')) return;
  setTimeout(() => {
    toast(t('hint.tap'), 7000);
    localStorage.setItem('sango-hint-shown', '1');
  }, 1500);
}
