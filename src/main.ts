// さんごう防災3Dマップ — 起動シーケンス。
// 実装は src/app/ 配下 (共有状態は src/app/context.js の ctx に集約)。
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { initLanguage, initSettings } from './app/settings';
import { initViewer } from './app/viewer';
import { initLayers } from './app/layers';
import { initDiagnosis } from './app/diagnosis';
import { initSearch } from './app/search';
import { initOfflineUi } from './app/offline-ui';
import { initWeatherBanner } from './app/weather-ui';

initLanguage(); // 以降のUI構築が t() を使うため最初に
initViewer(); // ctx.viewer を設定
initLayers(); // 建物・ハザード・避難所・統計 (ctx.viewer に依存)
initDiagnosis(); // タップ診断・避難カード
initSearch(); // 現在地・住所検索・共有リンク
initSettings(); // パネル・文字サイズ・キーボード・初回ヒント
initOfflineUi(); // SW登録・町内データ保存・オフラインバッジ
initWeatherBanner(); // 気象警報
