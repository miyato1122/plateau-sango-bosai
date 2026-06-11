import * as Cesium from 'cesium';
export { FLOOD_DEPTH_CLASSES } from './lib/geomath.js';

// 重ねるハザードマップ (国土地理院 disaportal) の配信タイル
export const HAZARD_LAYERS = {
  flood: {
    label: '洪水浸水想定',
    color: '#2196f3',
    url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  dosekiryu: {
    label: '土石流',
    color: '#8d6e63',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  kyukeisha: {
    label: '急傾斜地',
    color: '#ff7043',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  jisuberi: {
    label: '地すべり',
    color: '#9575cd',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
};

export function createHazardLayer(viewer, key, alpha) {
  const def = HAZARD_LAYERS[key];
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: def.url,
    maximumLevel: def.maxZoom,
    credit: new Cesium.Credit('ハザードマップポータルサイト'),
  });
  const layer = viewer.imageryLayers.addImageryProvider(provider);
  layer.alpha = alpha;
  layer.show = false;
  return layer;
}
