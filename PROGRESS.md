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
- **CP1**: Viteプロジェクト雛形 + 依存導入 + ビルド成功
- **CP2**: F1〜F6 実装完了・`npm run build` 成功
- **CP3**: README整備・最終コミット/プッシュ完了

## 再開手順

1. このファイルを読む
2. `git log --oneline` で最後のチェックポイントを確認
3. `npm install && npm run build` で状態確認
4. 未完了の機能 (上のチェックボックス) から再開
