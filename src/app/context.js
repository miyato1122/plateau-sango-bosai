// アプリ全体で共有する可変状態。ここに集約し、モジュール直下の裸の変数を作らない。
// 初期化の順序は src/main.js を参照 (viewer は initViewer() が設定する)。
export const ctx = {
  /** @type {import('cesium').Viewer | null} */
  viewer: null,
  /** 避難所一覧 (fetchShelters の結果) */
  shelters: [],
  /** PLATEAU建物の3D Tilesets */
  buildingTilesets: [],
  /** 建物リスク分析器 (BuildingRiskAnalyzer) */
  riskAnalyzer: null,
  /** 直近の診断結果 { lon, lat, name, risk } — 避難カード生成に使う */
  lastDiagnosis: null,
  /** 診断地点マーカー (Cesium Entity) */
  marker: null,
};
