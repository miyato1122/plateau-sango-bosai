import * as Cesium from 'cesium';
import { CITY_BBOX } from './config.js';

// 大和川沿いの低地の標高 (m)。地形が読み込めた場合は実測値で上書きする。
const DEFAULT_BASE_ELEVATION = 35;

export class FloodSimulator {
  constructor(viewer) {
    this.viewer = viewer;
    this.baseElevation = DEFAULT_BASE_ELEVATION;
    this.depth = 0;
    this.entity = viewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(
          CITY_BBOX.west, CITY_BBOX.south, CITY_BBOX.east, CITY_BBOX.north
        ),
        material: Cesium.Color.fromCssColorString('#2e6fb7').withAlpha(0.55),
        height: this.baseElevation,
        heightReference: Cesium.HeightReference.NONE,
      },
      show: false,
    });
    this.#sampleBaseElevation();
  }

  // 地形プロバイダから低地の実標高を取得して水面の基準にする
  async #sampleBaseElevation() {
    try {
      const terrain = this.viewer.terrainProvider;
      if (!terrain || terrain instanceof Cesium.EllipsoidTerrainProvider) return;
      const positions = [Cesium.Cartographic.fromDegrees(135.700, 34.602)];
      const [sampled] = await Cesium.sampleTerrainMostDetailed(terrain, positions);
      if (Number.isFinite(sampled?.height)) {
        this.baseElevation = sampled.height;
        this.setDepth(this.depth);
      }
    } catch {
      /* 取得できなければ既定値のまま */
    }
  }

  setDepth(depthMeters) {
    this.depth = depthMeters;
    this.entity.show = depthMeters > 0;
    this.entity.rectangle.height = this.baseElevation + depthMeters;
  }
}
