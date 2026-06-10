# 作業記録 — さんごう防災3Dマップ

中断しても再開できるよう、作業の意思決定と進捗をここに記録する。
**再開時はまずこのファイルを読むこと。**

## プロジェクト概要

- 目的: 奈良県三郷町 (市区町村コード **29343**) のPLATEAU 2025データを活用し、自治体課題を解決するWebアプリを開発する
- 解決する課題: 大和川・竜田川沿いの洪水リスク、信貴山麓の土砂災害リスクの住民への可視化・自分ごと化
- 成果物: **さんごう防災3Dマップ** — CesiumJSでPLATEAU 3D建物 + ハザード情報 + 避難所を重畳表示する静的Webアプリ
- ブランチ: `claude/ecstatic-tesla-j7odvm`

## 環境制約 (重要 — 再開時に再確認不要、調査済み)

サンドボックスのネットワークポリシーで以下を確認済み (2026-06-10):

| ホスト | 可否 |
|---|---|
| registry.npmjs.org | ✅ 可 |
| raw.githubusercontent.com / github.com | ✅ 可 |
| www.geospatial.jp (CKAN) | ❌ 403 (allowlist外) |
| api.plateauview.mlit.go.jp | ❌ 403 |
| assets.cms.plateau.reearth.io | ❌ 403 |
| cyberjapandata.gsi.go.jp / disaportaldata.gsi.go.jp | ❌ 403 |
| unpkg.com / cdn.jsdelivr.net | ❌ 403 |

→ **PLATEAUデータ本体はこの環境にダウンロード不可。**
→ 対策: アプリは「実行時にユーザーのブラウザから」公開配信エンドポイントを直接読む設計にする。
   ビルド・依存解決はnpmのみで完結するため、この環境で開発・ビルド・コミットは可能。
   実ブラウザでのタイル読み込み確認はこの環境ではできない (ユーザー側で確認が必要)。

## データソース設計 (調査済み)

1. **PLATEAU 3D建物 (3D Tiles)**: 実行時に PLATEAU データカタログ GraphQL API で解決する。
   - エンドポイント: `https://api.plateauview.mlit.go.jp/datacatalog/graphql`
   - クエリ: `query { area(code: "29343") { datasets { id name type_id items { name format url } } } }`
   - 2025年度新規整備都市のためチュートリアルの固定URL一覧には未掲載。動的解決が唯一の確実な方法。
   - tileset.json は `assets.cms.plateau.reearth.io` 配下で配信される (ハッシュ入りURLのため事前ハードコード不可)。
2. **ハザードタイル (重ねるハザードマップ / 国土地理院)**: 固定URL。
   - 洪水浸水想定 (想定最大規模): `https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png`
   - 土石流警戒区域: `https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png`
   - 急傾斜地警戒区域: `https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png`
   - 地すべり警戒区域: `https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png`
3. **指定緊急避難場所 (国土地理院 GeoJSONタイル)**: 実行時取得。
   - `https://cyberjapandata.gsi.go.jp/xyz/skhb{01..08}/{z}/{x}/{y}.geojson` (災害種別ごとのレイヤ)
4. **ベースマップ**: 地理院タイル (淡色 `pale`、写真 `seamlessphoto`)。

三郷町の概況: 役場は約 (34.598N, 135.697E)。町域bbox概算 lon 135.66–135.72, lat 34.57–34.62。
カメラ初期位置はこの値を使い、3D Tiles読込後にバウンディングスフィアへフライする。

## 技術スタック

- Vite + vanilla JS + CesiumJS (npmから取得、CDN不使用 = サンドボックスでビルド検証可能)
- 静的サイト (GitHub Pages等にそのままデプロイ可)

## 機能一覧

- [x] F1: PLATEAU 3D建物表示 (GraphQL動的解決 + 失敗時のフォールバック・エラーメッセージ)
- [x] F2: ハザードレイヤ切替 (洪水/土砂3種、不透明度スライダー)
- [x] F3: 指定緊急避難場所の表示 (災害種別アイコン・クリックで詳細)
- [x] F4: 地点リスク診断 — クリック地点の浸水深をハザードタイルのピクセル色から判定して表示
- [x] F5: 浸水疑似体験 — 任意水位の水面を3D表示し建物と比較
- [x] F6: 最寄り避難所の距離・方向表示 (診断結果に含む)

## チェックポイント履歴

- **CP0** (2026-06-10): 調査完了・方針決定。本ファイル作成。 ← コミット `PROGRESS.md追加`
- **CP1/CP2** (2026-06-10): Vite+CesiumJS雛形、F1〜F6実装、`npm run build` 成功、`node --check` 全ファイル通過。データカタログはGraphQLでなくREST (`/datacatalog/plateau-datasets`、公式チュートリアルでスキーマ確認済) を採用。PLATEAU-Terrain (Ionアセット2488101、チュートリアル掲載公開トークン) を使用し、失敗時は楕円体へフォールバック。
- **CP3** (2026-06-10): README全面改訂、GitHub Pagesデプロイワークフロー追加、完了。

- **CP4** (2026-06-10): 関連データセット統合。経緯と現状:
  - 大容量zip (CityGML 116MB / 3D Tiles 35MB) は**不要**と判断 — アプリは配信APIストリーミングで動作するため
  - `29343_sango-cho_2025_related.zip` (17KB) はGoogle Drive MCP経由でbase64取得に成功したが、コンテキスト経由の転記でバイナリ再現に失敗 (CRC不一致)。**復元データは座標の正確性を保証できないため不採用**
  - 復元JSONからスキーマのみ確認: shelter.geojson = Point, 属性 `名称`/`住所`/`施設の種類`/`対象とする災害の分類`/`収容人数`/`レベル` (46件)
  - 統合コードは実装済み: `public/data/shelter.geojson` があれば町公式データを優先表示 (`fetchOfficialShelters`)、なければ地理院skhbにフォールバック。`emergency_route.geojson`/`border.geojson` も配置すればレイヤとして有効化される (`src/citydata.js`)
  - **正データはユーザーがGitHubにpushする** → 届いたら `public/data/` に展開して再ビルド・コミット

- **CP5** (2026-06-10): 全面改修 (ゴール対応)。
  - **データ復元の決着**: related.zipはストリーミング生成型で、ローカルヘッダCRC=0(データ記述子方式)。記述子CRCと照合した結果 **shelter.geojson(46件)とpark.geojsonはCRC32完全一致=無傷** と確定。`public/data/shelter.geojson` として同梱・採用。残り5ファイルは転記破損のため不採用とし、代わりに**データカタログAPIから実行時取得**する方式に変更 (避難施設・緊急輸送道路・町域界とも `type_en` で解決)。
  - **第三者監査による機能整理**: 浸水疑似体験を削除 (地形に依存しない平面水面は誤解を招き動作保証も不可)。診断の「モードボタン」を廃止し常時タップ診断に。開発者向け「読み込み状況」は折りたたみ+エラー時のみトースト。公園等の非防災レイヤは不採用。
  - **追加**: 現在地診断 (geolocation)、住所検索 (地理院ジオコーダ msearch.gsi.go.jp)、避難所への徒歩分数・方角・Googleマップ経路リンク、診断アドバイス文。
  - **UI刷新**: グラスモーフィズムのカード/チップ/スイッチ、FAB、モバイルはボトムシート+セーフエリア対応。
  - **動作保証**: 純粋ロジックを `src/lib/geomath.js` に分離し `npm test` で10テスト全合格 (実データ46件の座標・住所検証を含む)。ビルド成功。外部APIは3段フォールバック+状態表示。

- **CP6** (2026-06-10): 建物単位リスク診断+町全体統計ダッシュボード+高さ付き浸水3D表示。
  - `src/buildingrisk.js`: 3D Tilesの`tileLoad`で建物属性を漸進集計。浸水ランク属性名はパターン検出 (`detectRiskProperties`、想定最大規模を優先)、数値ランク(1〜6)と文字列表現の両方をパース (`parseFloodRank`)。gml_idで重複排除。リスク別色分けは読み込み済みタイルにも遡及適用。
  - `src/floodgrid.js`: 洪水タイルを町全域z15でスキャン(64タイル)し、面積統計(深さ別km²)と63m格子の浸水セルを生成。**地理院標高PNGタイル(dem_png z14)をデコードして基底標高を付与、ジオイド高+37.2mで楕円体高へ変換**し、代表水深の半透明水柱をPrimitive一括描画。
  - `src/dashboard.js`: 📊FABで統計モーダル。面積統計(全域・常時利用可)と建物統計(属性がある場合)を表示。建物属性が無いモデルでは面積統計へ誘導するフォールバック文言。
  - テスト18件全合格 (DEMデコード仕様・ランクパース・属性検出・垂直避難困難判定などを追加)。
  - 未検証リスク(実環境確認待ち): 三郷町2025モデルに浸水ランク属性が実際に含まれるか(無い場合は面積統計のみ動作)、ジオイド補正値の妥当性(±1m程度の誤差許容)。

## 残タスク / ユーザー側での確認事項

- [ ] 実ブラウザでの動作確認 (`npm install && npm run dev`)。サンドボックスでは外部タイルへの接続不可のため、データカタログAPI・地理院タイル・skhbタイルの実レスポンスは未検証。問題があれば画面の「データ読み込み状況」のエラーメッセージを参照。
- [ ] GitHub Pages公開する場合: mainへマージ + リポジトリ設定でPagesソースを「GitHub Actions」に変更。

## 再開手順

1. このファイルを読む
2. `git log --oneline` で最後のチェックポイントを確認
3. `npm install && npm run build` で状態確認
4. 未完了の機能 (上のチェックボックス) から再開
