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

// viewer/riskAnalyzer は起動シーケンス先頭で必ず設定される前提でnon-nullに型付けし、
// 万一初期化前に触れた場合は (undefinedのまま動き続けず) 即座に原因が分かるよう例外にする
let viewer: Viewer | null = null;
let riskAnalyzer: BuildingRiskAnalyzer | null = null;

function required<T>(value: T | null, name: string): T {
  if (!value) {
    throw new Error(`ctx.${name} が未初期化です。src/main.ts の起動順で先に初期化してください`);
  }
  return value;
}

export const ctx: AppContext = {
  get viewer() {
    return required(viewer, 'viewer');
  },
  set viewer(v: Viewer) {
    viewer = v;
  },
  get riskAnalyzer() {
    return required(riskAnalyzer, 'riskAnalyzer');
  },
  set riskAnalyzer(a: BuildingRiskAnalyzer) {
    riskAnalyzer = a;
  },
  shelters: [],
  buildingTilesets: [],
  lastDiagnosis: null,
  marker: null,
};
