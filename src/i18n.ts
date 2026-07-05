// UI文字列の辞書と言語切替。
//   ja   = 標準の日本語
//   easy = やさしい日本語 (在住外国人・子ども・高齢者向け。短い文 + 読みがな)
//   en   = English
// 出典・ライセンス表記 (パネルfooter) は帰属の正確性のため日本語のまま。
// 「データ取得状況」は開発者向け診断表示のため翻訳対象外。
// 辞書本体は src/locales/*.ts (ja = 全キーの正、easy/en は typeof ja で完全一致を強制)
import { ja } from './locales/ja';
import { easy } from './locales/easy';
import { en } from './locales/en';

// テストからも参照する (キー整合性の検証)
export // 辞書の型: jaを正とし、easy/enはキー完全一致を型で強制する
type Dict = typeof ja;
/** t() に渡せる辞書キー (存在しないキーはTSコンパイルエラーになる) */
export type MsgKey = keyof Dict;
export type Lang = 'ja' | 'easy' | 'en';

const DICTS: Record<Lang, Dict> = { ja, easy, en };
export { DICTS }; // テストからも参照する (キー整合性の検証)

const LANG_KEY = 'sango-lang';
let current: Lang = 'ja';
try {
  const saved = localStorage.getItem(LANG_KEY) as Lang | null;
  if (saved && DICTS[saved]) current = saved;
} catch {
  /* localStorage不可の環境では既定言語 */
}

export const LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'ja', label: '日本語' },
  { code: 'easy', label: 'やさしいにほんご' },
  { code: 'en', label: 'English' },
];

export function currentLang(): Lang {
  return current;
}

// 現在言語の文言を返す。キーはコンパイル時に検査される (動的キーは as MsgKey で明示)。
// 値が配列 (floodClasses / dirs) のキーはそのまま配列を返す。
export function t<K extends MsgKey>(
  key: K,
  params: Record<string, unknown> | null = null,
): Dict[K] {
  const value = DICTS[current][key] ?? DICTS.ja[key] ?? key;
  if (typeof value !== 'string' || !params) return value as Dict[K];
  return value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? '')) as Dict[K];
}

// 属性値の辞書キーは実行時にしか分からないため、文字列tとして解決する
// (キーの実在は tests/i18n-usage.test.mjs が全HTML/JSを走査して検証する)
const tByName = (key: string): string => String(t(key as MsgKey));

// data-i18n属性を持つ静的要素へ現在言語を適用する
export function applyStatic(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = tByName(el.dataset.i18n ?? '');
  }
  for (const el of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    el.placeholder = tByName(el.dataset.i18nPlaceholder ?? '');
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    el.setAttribute('aria-label', tByName(el.dataset.i18nAria ?? ''));
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.title = tByName(el.dataset.i18nTitle ?? '');
  }
}

export function setLang(lang: Lang): void {
  if (!DICTS[lang]) return;
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* 保存不可は無視 */
  }
  if (typeof document === 'undefined') return; // Node (テスト) ではDOM反映なし
  document.documentElement.lang = lang === 'en' ? 'en' : 'ja';
  applyStatic();
  document.dispatchEvent(new CustomEvent('sango:langchange', { detail: { lang } }));
}
