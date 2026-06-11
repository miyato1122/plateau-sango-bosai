import * as Cesium from 'cesium';
import {
  detectRiskProperties, parseFloodRank, estimateStoreys,
  createBuildingStats, accumulateBuilding, FLOOD_DEPTH_CLASSES,
} from './lib/geomath.js';

// PLATEAU 3D Tilesの建物属性 (CityGML災害リスク属性) を読み取り、
//   - 建物ごとの浸水リスク色分け
//   - 町全体の建物統計 (リスク別棟数・垂直避難困難数)
// を提供する。属性はタイルの読み込みに応じて漸進的に集計される。
const RISK_COLORS = [
  '#fef9c3', '#fdba74', '#f87171', '#dc2626', '#a21caf', '#581c87',
];

export class BuildingRiskAnalyzer {
  constructor() {
    this.stats = createBuildingStats();
    this.props = null;          // 検出した属性名 {rank, storeys, height}
    this.coloring = false;
    this.seen = new Set();      // gml_idで重複集計を防ぐ
    this.listeners = new Set(); // 統計更新の通知先
  }

  attach(tileset) {
    tileset.tileLoad.addEventListener((tile) => {
      try {
        this.#processContent(tile.content);
      } catch (err) {
        console.warn('建物属性の読み取りに失敗:', err);
      }
    });
  }

  onUpdate(fn) { this.listeners.add(fn); }

  #processContent(content) {
    if (!content?.featuresLength) return;
    let changed = false;
    for (let i = 0; i < content.featuresLength; i++) {
      const feature = content.getFeature(i);
      if (this.props === null) {
        this.props = detectRiskProperties(feature.getPropertyIds());
      }
      const id =
        feature.getProperty('gml_id') ?? feature.getProperty('gml:id') ?? null;
      const classIdx = this.props.rank
        ? parseFloodRank(feature.getProperty(this.props.rank))
        : -1;

      if (id === null || !this.seen.has(id)) {
        if (id !== null) this.seen.add(id);
        const storeys = estimateStoreys(
          this.props.storeys ? feature.getProperty(this.props.storeys) : null,
          this.props.height ? feature.getProperty(this.props.height) : null
        );
        accumulateBuilding(this.stats, classIdx, storeys);
        changed = true;
      }
      this.#applyColor(feature, classIdx);
    }
    if (changed) {
      for (const fn of this.listeners) fn(this.stats, this.props);
    }
  }

  #applyColor(feature, classIdx) {
    if (this.coloring && classIdx >= 0) {
      feature.color = Cesium.Color.fromCssColorString(RISK_COLORS[classIdx]);
    } else if (this.coloring) {
      feature.color = Cesium.Color.fromCssColorString('#e2e8f0');
    } else {
      feature.color = Cesium.Color.WHITE;
    }
  }

  // 色分けの切替。読み込み済みタイルにも遡って適用する。
  setColoring(tilesets, on) {
    this.coloring = on;
    for (const tileset of tilesets) {
      if (tileset.root) this.#walkTiles(tileset.root); // 読み込み済みタイルへ遡って適用
    }
  }

  #walkTiles(tile) {
    if (tile.content?.featuresLength) {
      for (let i = 0; i < tile.content.featuresLength; i++) {
        const feature = tile.content.getFeature(i);
        const classIdx = this.props?.rank
          ? parseFloodRank(feature.getProperty(this.props.rank))
          : -1;
        this.#applyColor(feature, classIdx);
      }
    }
    for (const child of tile.children ?? []) this.#walkTiles(child);
  }

  hasRiskAttributes() { return !!this.props?.rank; }
}

export { RISK_COLORS, FLOOD_DEPTH_CLASSES };
