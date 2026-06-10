import * as Cesium from 'cesium';

// 重ねるハザードマップ (国土地理院 disaportal) の配信タイル
export const HAZARD_LAYERS = {
  flood: {
    label: '洪水浸水想定区域 (想定最大規模)',
    url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  dosekiryu: {
    label: '土砂災害警戒区域 (土石流)',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  kyukeisha: {
    label: '土砂災害警戒区域 (急傾斜地の崩壊)',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  jisuberi: {
    label: '土砂災害警戒区域 (地すべり)',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
};

// 浸水深の公式凡例色 (重ねるハザードマップ標準)
export const FLOOD_DEPTH_CLASSES = [
  { rgb: [247, 245, 169], label: '0.5m未満', css: 'rgb(247,245,169)' },
  { rgb: [255, 216, 192], label: '0.5〜3.0m', css: 'rgb(255,216,192)' },
  { rgb: [255, 183, 183], label: '3.0〜5.0m', css: 'rgb(255,183,183)' },
  { rgb: [255, 145, 145], label: '5.0〜10.0m', css: 'rgb(255,145,145)' },
  { rgb: [242, 133, 201], label: '10.0〜20.0m', css: 'rgb(242,133,201)' },
  { rgb: [220, 122, 220], label: '20.0m以上', css: 'rgb(220,122,220)' },
];

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
