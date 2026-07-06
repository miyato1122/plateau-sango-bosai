// 診断結果 (DiagnosisRisk) を表示用の文言に変換する共通ヘルパ。
// 診断カード (app/diagnosis.ts) と避難カード (evaccard.ts) の両方で使う。
import { t } from '../i18n';
import type { DiagnosisRisk } from '../risk';

/** 土砂災害3種 (土石流・急傾斜地・地すべり) のうち、指定区分に該当する種類名の一覧 */
export function landslideTypeNames(
  landslide: DiagnosisRisk['landslide'],
  zone: 'special' | 'warning',
): string[] {
  return [
    landslide.dosekiryu === zone && t('ls.dosekiryu'),
    landslide.kyukeisha === zone && t('ls.kyukeisha'),
    landslide.jisuberi === zone && t('ls.jisuberi'),
  ].filter((v): v is string => Boolean(v));
}

/** 家屋倒壊等氾濫想定区域の該当種類名 (氾濫流・河岸侵食) の一覧 */
export function kaokutoukaiTypeNames(kaokutoukai: DiagnosisRisk['kaokutoukai']): string[] {
  return [kaokutoukai.hanran && t('ls.hanran'), kaokutoukai.kagan && t('ls.kagan')].filter(
    (v): v is string => Boolean(v),
  );
}

/** 徒歩の所要分数 (80m/分で概算、最低1分) */
export const walkMinutes = (distM: number): number => Math.max(1, Math.ceil(distM / 80));
