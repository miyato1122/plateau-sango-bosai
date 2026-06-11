// 三郷町 (奈良県) の基本設定
export const CITY_CODE = '29343';
export const CITY_NAME = '三郷町';

// 町域の概略バウンディングボックス (避難場所タイル取得・水面表示に使用)
export const CITY_BBOX = {
  west: 135.65,
  south: 34.565,
  east: 135.73,
  north: 34.625,
};

// 初期カメラ (南上空から市街地を見下ろす)。
// pitch -40°・高度3200mのとき注視点はカメラの約0.034°北 → 市街地中心(緯度34.60)に合わせる
export const HOME_VIEW = {
  lon: 135.695,
  lat: 34.566,
  height: 3200,
  heading: 0,
  pitch: -40,
};

// PLATEAU データカタログAPI (公式配信サービス)
// https://github.com/Project-PLATEAU/plateau-streaming-tutorial
export const PLATEAU_DATASETS_API =
  'https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets';

// PLATEAU-Terrain (Cesium Ion でホストされている地形アセット)。
// Ionトークンは公開アプリごとに自分のアカウントのものを使う必要があるため、
// ビルド時の環境変数 VITE_CESIUM_ION_TOKEN から注入する (.env.example 参照)。
// 未設定の場合は地理院標高タイル (GSI_DEM) による地形にフォールバックする。
export const PLATEAU_TERRAIN_ION_ASSET = 2488101;
export const PLATEAU_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

// 地理院タイル
export const GSI_PALE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
export const GSI_PHOTO =
  'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
export const GSI_DEM = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png';

// 地理院DEMは標高 (ジオイド基準)、Cesium/PLATEAUは楕円体高。
// 奈良盆地周辺のジオイド高 (ジオイド2011) ≈ +37.2m を加えて変換する。
export const GEOID_OFFSET = 37.2;
