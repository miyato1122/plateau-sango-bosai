// 表示設定 (言語・文字サイズ)・パネル開閉・キーボード操作
import { t, setLang, currentLang, applyStatic, LANGS } from '../i18n';
import { $, toast, isMobile } from './ui.js';
import { closeResultCard } from './diagnosis.js';

// 言語セレクタとdata-i18n適用。チップ等がt()を使うため、他モジュールより先に呼ぶ
export function initLanguage() {
  const langSelect = $('langSelect');
  for (const { code, label } of LANGS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    langSelect.appendChild(opt);
  }
  langSelect.value = currentLang();
  langSelect.addEventListener('change', () => setLang(langSelect.value));
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
    panel.hidden = !panel.hidden;
  });
  $('panelClose').addEventListener('click', () => {
    panel.hidden = true;
  });
  if (window.matchMedia('(min-width: 641px)').matches) panel.hidden = false;
}

// ---- 文字サイズ切替 ----
function initFontSize() {
  const FONT_KEY = 'sango-font-large';
  const fontToggle = $('fontLarge');
  const applyFontSize = (large) => {
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
    if (!$('resultCard').hidden) {
      closeResultCard();
      return;
    }
    if (!$('dashCard').hidden) {
      $('dashCard').hidden = true;
      return;
    }
    if (!$('panel').hidden && isMobile()) $('panel').hidden = true;
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
