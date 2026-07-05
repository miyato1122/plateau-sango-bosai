// アプリ全体で共有する可変状態。ここに集約し、モジュール直下の裸の変数を作らない。
// 初期化の順序は src/main.ts を参照 (viewer は initViewer() が設定する)。
import type { Viewer, Entity, Cesium3DTileset } from 'cesium';
import type { Shelter } from '../lib/geomath';
import type { DiagnosisRisk } from '../risk';
import type { BuildingRiskAnalyzer } from '../buildingrisk';

export interface LastDiagnosis {
  lon: number;
  lat: number;
  name: string | null;
  risk: DiagnosisRisk;
}

interface AppContext {
  viewer: Viewer;
  shelters: Shelter[];
  buildingTilesets: Cesium3DTileset[];
  riskAnalyzer: BuildingRiskAnalyzer;
  lastDiagnosis: LastDiagnosis | null;
  marker: Entity | null;
}

// viewer/riskAnalyzer は起動シーケンス先頭で必ず設定されるため、
// 利用側の null チェックを省くために non-null として型付けする。
export const ctx: AppContext = {
  viewer: null as unknown as Viewer,
  shelters: [],
  buildingTilesets: [],
  riskAnalyzer: null as unknown as BuildingRiskAnalyzer,
  lastDiagnosis: null,
  marker: null,
};
