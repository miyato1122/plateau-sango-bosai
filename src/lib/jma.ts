// 気象庁 防災情報JSON (警報・注意報) の解析 (純粋ロジック — tests/ から単体テストされる)。
//
// データ: https://www.jma.go.jp/bosai/warning/data/warning/{都道府県コード}.json
//   奈良県 = 290000。areaTypes[].areas[] に市町村等のコードごとの警報配列が入る。
//   三郷町の市町村等コード (class20) = 2934300 (市区町村コード29343 + "00")。
// ※ コード体系は気象庁の内部仕様で予告なく変わり得るため、実環境での表示確認を推奨。

export type WarningLevel = 'special' | 'warning' | 'advisory';

export interface ActiveWarning {
  code: string;
  name: string;
  level: WarningLevel;
}

export interface WarningSummary {
  level: WarningLevel;
  names: string[];
}

/** 気象庁 warning JSON (必要なフィールドのみの緩い型) */
export interface JmaWarningFeed {
  areaTypes?: Array<{
    areas?: Array<{
      code?: string | number;
      warnings?: Array<{ code?: string | number | null; status?: string } | null> | null;
    } | null> | null;
  } | null> | null;
}

// 警報・注意報コード → 名称と区分
export const WARNING_CODES: Record<string, { name: string; level: WarningLevel }> = {
  '02': { name: '暴風雪警報', level: 'warning' },
  '03': { name: '大雨警報', level: 'warning' },
  '04': { name: '洪水警報', level: 'warning' },
  '05': { name: '暴風警報', level: 'warning' },
  '06': { name: '大雪警報', level: 'warning' },
  '07': { name: '波浪警報', level: 'warning' },
  '08': { name: '高潮警報', level: 'warning' },
  10: { name: '大雨注意報', level: 'advisory' },
  12: { name: '大雪注意報', level: 'advisory' },
  13: { name: '風雪注意報', level: 'advisory' },
  14: { name: '雷注意報', level: 'advisory' },
  15: { name: '強風注意報', level: 'advisory' },
  16: { name: '波浪注意報', level: 'advisory' },
  17: { name: '融雪注意報', level: 'advisory' },
  18: { name: '洪水注意報', level: 'advisory' },
  19: { name: '高潮注意報', level: 'advisory' },
  20: { name: '濃霧注意報', level: 'advisory' },
  21: { name: '乾燥注意報', level: 'advisory' },
  22: { name: 'なだれ注意報', level: 'advisory' },
  23: { name: '低温注意報', level: 'advisory' },
  24: { name: '霜注意報', level: 'advisory' },
  25: { name: '着氷注意報', level: 'advisory' },
  26: { name: '着雪注意報', level: 'advisory' },
  32: { name: '暴風雪特別警報', level: 'special' },
  33: { name: '大雨特別警報', level: 'special' },
  35: { name: '暴風特別警報', level: 'special' },
  36: { name: '大雪特別警報', level: 'special' },
  37: { name: '波浪特別警報', level: 'special' },
  38: { name: '高潮特別警報', level: 'special' },
};

const LEVEL_ORDER: Record<WarningLevel, number> = { special: 0, warning: 1, advisory: 2 };

// 警報JSONから対象地域の発表中の警報・注意報を取り出す。
// 返り値: [{ code, name, level }] を深刻度順に。対象地域が見つからなければ []。
export function parseWarnings(
  json: JmaWarningFeed | null | undefined,
  areaCode: string | number,
): ActiveWarning[] {
  const result: ActiveWarning[] = [];
  for (const areaType of json?.areaTypes ?? []) {
    for (const area of areaType?.areas ?? []) {
      if (String(area?.code) !== String(areaCode)) continue;
      for (const w of area?.warnings ?? []) {
        if (!w?.code) continue; // 「発表警報・注意報はなし」等
        if (w.status === '解除') continue;
        const def = WARNING_CODES[String(w.code)] ?? WARNING_CODES[Number(w.code)];
        result.push({
          code: String(w.code),
          name: def?.name ?? '気象警報・注意報',
          level: def?.level ?? 'warning', // 未知コードは安全側に警報扱い
        });
      }
    }
  }
  // 深刻度順・重複除去
  const seen = new Set<string>();
  return result
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
    .filter((w) => (seen.has(w.code) ? false : (seen.add(w.code), true)));
}

// バナー表示用の要約: 最も深刻な区分と名称一覧
export function summarizeWarnings(
  warnings: ActiveWarning[] | null | undefined,
): WarningSummary | null {
  if (!warnings || warnings.length === 0) return null;
  return {
    level: warnings[0].level,
    names: warnings.map((w) => w.name),
  };
}
