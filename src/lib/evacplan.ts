// 避難カードの「わが家の避難方針」を診断結果から決める純粋ロジック。
// 返り値はi18n辞書のキー配列 (文言・翻訳は src/i18n.js が持つ)。
import type { LandslideZone } from './geomath';

export interface EvacInput {
  /** 浸水深クラス添字 (-1=区域外, 0=0.5m未満, 1=0.5〜3m, 2以上=3m以上) */
  floodIdx: number;
  /** 浸水継続時間の想定区域内か */
  keizoku: boolean;
  /** 土砂災害の区域種別 (種類ごと) */
  landslide: Record<string, LandslideZone> | null | undefined;
  /** 家屋倒壊等氾濫想定区域か */
  kaokutoukai?: boolean;
}

export function evacuationPolicies({
  floodIdx,
  keizoku,
  landslide,
  kaokutoukai = false,
}: EvacInput): string[] {
  const keys: string[] = [];
  // 家屋倒壊等氾濫想定区域は浸水深によらず立退き避難が必要
  if (kaokutoukai) {
    keys.push('policy.kaokutoukai');
  }
  // 3m以上、または浸水が長引く区域での浸水は立退き避難一択
  // (家屋倒壊等区域の場合は立退きを既に案内済みのため垂直避難の案内はしない)
  if (floodIdx >= 2 || (floodIdx >= 1 && keizoku)) {
    keys.push('policy.floodLeave');
  } else if (floodIdx === 1 && !kaokutoukai) {
    keys.push('policy.floodVertical');
  } else if (floodIdx === 0) {
    keys.push('policy.floodShallow');
  }
  if (keizoku && floodIdx >= 0) keys.push('policy.keizoku');

  const zones = Object.values(landslide ?? {});
  if (zones.includes('special')) {
    keys.push('policy.lsSpecial');
  } else if (zones.includes('warning')) {
    keys.push('policy.lsWarning');
  }

  if (keys.length === 0) keys.push('policy.none');
  return keys;
}
