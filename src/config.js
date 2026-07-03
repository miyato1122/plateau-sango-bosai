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
// PLATEAUが配信しているアセットID・公開アクセストークンを既定値として利用する
// (出典: plateau-streaming-tutorial / terrain/plateau-terrain-streaming.md)。
// このトークンを使う場合はデータの帰属に PLATEAU_TERRAIN_CREDIT を記載すること。
// 独自のIonアカウントを使いたい場合は環境変数 VITE_CESIUM_ION_TOKEN で上書きできる。
export const PLATEAU_TERRAIN_ION_ASSET = 3258112;
export const PLATEAU_TERRAIN_DEFAULT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiODVhMmQ5OS1hOWZjLTQ3YmYtODlmNi1lNWUwY2MwOGUxYTMiLCJpZCI6MTQ5ODk3LCJpYXQiOjE2ODc5MzQ3NDN9.OG0mc3i7ZxGwHQjlMv3TRjiOvKWpzxglxmJRaUIykTY';
export const PLATEAU_ION_TOKEN =
  import.meta.env.VITE_CESIUM_ION_TOKEN || PLATEAU_TERRAIN_DEFAULT_TOKEN;

// PLATEAU-Terrain (配信された地形データ) 利用時に必須の帰属表記。
export const PLATEAU_TERRAIN_CREDIT =
  '地形データは、測量法に基づく国土地理院長承認（使用）R3JHs 778を得て使用';

// 地理院タイル
export const GSI_PALE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
export const GSI_PHOTO = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
export const GSI_DEM = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png';

// 地理院DEMは標高 (ジオイド基準)、Cesium/PLATEAUは楕円体高。
// 奈良盆地周辺のジオイド高 (ジオイド2011) ≈ +37.2m を加えて変換する。
export const GEOID_OFFSET = 37.2;
