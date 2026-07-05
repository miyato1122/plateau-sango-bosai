// Cesium Viewer の生成・初期カメラ・3D地形
import * as Cesium from 'cesium';
import {
  HOME_VIEW,
  GSI_PALE,
  PLATEAU_TERRAIN_ION_ASSET,
  PLATEAU_ION_TOKEN,
  PLATEAU_TERRAIN_CREDIT,
} from '../config';
import { GsiTerrainProvider } from '../gsiterrain';
import { ctx } from './context';
import { $, setStatus } from './ui';

export function initViewer(): Cesium.Viewer {
  // トークンがある場合のみ設定 (空のままだとCesium同梱の既定トークンに依存してしまう)
  if (PLATEAU_ION_TOKEN) Cesium.Ion.defaultAccessToken = PLATEAU_ION_TOKEN;

  const viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayer: new Cesium.ImageryLayer(
      new Cesium.UrlTemplateImageryProvider({
        url: GSI_PALE,
        maximumLevel: 18,
        credit: new Cesium.Credit('地理院タイル'),
      }),
    ),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false, // 生属性テーブルは出さず、独自カードで表示する
    selectionIndicator: false,
    // 地図はほぼ静的なので、変化があったときだけ描画してバッテリー消費を抑える。
    // カメラ移動・タイル読込はCesiumが自動で再描画し、レイヤ表示切替などの
    // 明示的な変更は requestRender() (下記) で通知する
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });
  viewer.scene.globe.depthTestAgainstTerrain = true;
  // 既定のダブルクリック(エンティティへズーム)も無効化
  viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  ctx.viewer = viewer;
  flyHome(0);
  $('fabHome').addEventListener('click', () => flyHome());
  setupTerrain();
  return viewer;
}

// requestRenderMode時にCesiumが自動検知しない変更 (レイヤ表示・エンティティ更新等) の後に呼ぶ
export function requestRender(): void {
  ctx.viewer.scene.requestRender();
}

export function flyHome(duration = 1.2): void {
  ctx.viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(HOME_VIEW.lon, HOME_VIEW.lat, HOME_VIEW.height),
    orientation: {
      heading: Cesium.Math.toRadians(HOME_VIEW.heading),
      pitch: Cesium.Math.toRadians(HOME_VIEW.pitch),
      roll: 0,
    },
    duration,
  });
}

// 診断地点の上空へ移動 (現在地・住所検索・共有リンクで共通)
export function flyToPoint(lon: number, lat: number, duration = 1.5): void {
  ctx.viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.008, 1500),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
    duration,
  });
}

// 3D地形 (既定で PLATEAU-Terrain、取得不可時は地理院標高タイルへフォールバック)
async function setupTerrain() {
  if (PLATEAU_ION_TOKEN) {
    try {
      setStatus('terrain', '地形 (PLATEAU-Terrain): 読み込み中…');
      ctx.viewer.terrainProvider =
        await Cesium.CesiumTerrainProvider.fromIonAssetId(PLATEAU_TERRAIN_ION_ASSET);
      // 配信された地形データ利用時に必須の帰属表記をクレジット表示に追加
      ctx.viewer.creditDisplay.addStaticCredit(new Cesium.Credit(PLATEAU_TERRAIN_CREDIT));
      setStatus('terrain', '地形 (PLATEAU-Terrain): 読み込み完了', 'ok');
      return;
    } catch {
      /* 取得不可の場合は地理院標高タイルへフォールバック */
    }
  }
  ctx.viewer.terrainProvider = new GsiTerrainProvider();
  requestRender();
  setStatus('terrain', '地形 (地理院標高タイル): 有効', 'ok');
}
