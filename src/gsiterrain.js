import * as Cesium from 'cesium';
import { GSI_DEM, GEOID_OFFSET } from './config';
import { gsiDemDecode } from './lib/geomath';

// 地理院標高タイル (dem_png) からCesium地形を生成するTerrainProvider。
// Cesium Ionトークン不要で日本全域の3D地形を表示できる。
// PLATEAU 3D Tilesは楕円体高基準のため、標高 (ジオイド基準) に
// GEOID_OFFSET を加えて建物の足元と地面を一致させる。
const MAX_LEVEL = 14; // dem_png (DEM10B 約10m解像度) の最大ズーム
const SAMPLES = 65; // 1タイルあたりの標高サンプル数 (65×65)

export class GsiTerrainProvider {
  constructor() {
    this.tilingScheme = new Cesium.WebMercatorTilingScheme();
    this.errorEvent = new Cesium.Event();
    this.credit = new Cesium.Credit('地理院標高タイル');
    this.availability = undefined;
    this.hasWaterMask = false;
    this.hasVertexNormals = false;
    this.ready = true;
    this._resource = new Cesium.Resource({ url: GSI_DEM });
    this._canvas = document.createElement('canvas');
    this._canvas.width = this._canvas.height = 256;
    this._context = this._canvas.getContext('2d', { willReadFrequently: true });
    this._levelZeroError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this.tilingScheme.ellipsoid,
      SAMPLES,
      this.tilingScheme.getNumberOfXTilesAtLevel(0),
    );
  }

  getLevelMaximumGeometricError(level) {
    return this._levelZeroError / (1 << level);
  }

  getTileDataAvailable(x, y, level) {
    return level <= MAX_LEVEL;
  }

  loadTileDataAvailability() {
    return undefined;
  }

  requestTileGeometry(x, y, level, request) {
    const resource = this._resource.getDerivedResource({
      templateValues: { z: level, x, y },
      request,
    });
    const promise = resource.fetchImage({ preferImageBitmap: true });
    if (!Cesium.defined(promise)) return undefined; // リクエスト過多時はCesium側が再試行する
    return (
      Promise.resolve(promise)
        .then((image) => this._decode(image, level))
        // 海域・日本域外などタイルが無い場合は標高0の平面 (子タイルなし) を返す
        .catch(() => this._flatTile())
    );
  }

  _flatTile() {
    return new Cesium.HeightmapTerrainData({
      buffer: new Float32Array(SAMPLES * SAMPLES).fill(GEOID_OFFSET),
      width: SAMPLES,
      height: SAMPLES,
      childTileMask: 0,
    });
  }

  _decode(image, level) {
    const size = 256;
    this._context.drawImage(image, 0, 0, size, size);
    const pixels = this._context.getImageData(0, 0, size, size).data;
    const heights = new Float32Array(SAMPLES * SAMPLES);
    for (let row = 0; row < SAMPLES; row++) {
      const py = Math.round((row * (size - 1)) / (SAMPLES - 1));
      for (let col = 0; col < SAMPLES; col++) {
        const px = Math.round((col * (size - 1)) / (SAMPLES - 1));
        const i = (py * size + px) * 4;
        const h =
          pixels[i + 3] === 0 ? null : gsiDemDecode(pixels[i], pixels[i + 1], pixels[i + 2]);
        heights[row * SAMPLES + col] = (h ?? 0) + GEOID_OFFSET;
      }
    }
    return new Cesium.HeightmapTerrainData({
      buffer: heights,
      width: SAMPLES,
      height: SAMPLES,
      childTileMask: level < MAX_LEVEL ? 15 : 0,
    });
  }
}
