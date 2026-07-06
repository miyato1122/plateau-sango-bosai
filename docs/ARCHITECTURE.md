# コード解説 (アーキテクチャガイド)

このドキュメントは「さんごう防災3Dマップ」のコードを **初めて読む人向けの道案内** です。
ディレクトリ構成 → 起動の流れ → 機能ごとのデータの流れ → 中核の仕組み → 変更するときの手引き、の順で説明します。

## 1. 全体像と設計方針

サーバーを持たない **静的Webサイト** (Vite + CesiumJS) です。GitHub Pagesにそのまま置けます。

| 方針 | 意味 |
|---|---|
| **データは実行時に公式配信から取得** | PLATEAU・地理院・気象庁の配信を直接読む。アプリに大容量データを同梱しない。配信が止まっても各系統が個別にフォールバック/縮退する |
| **プライバシー最優先** | 位置情報・診断結果はサーバーへ一切送らない。利用回数の記録も端末内 (localStorage) のみ (`src/lib/metrics.ts`) |
| **計算ロジックはUIから分離** | 「タイル座標変換」「色→浸水深判定」「経路探索」などは `src/lib/` の**純粋関数** (DOM・Cesiumに依存しない)。ここだけで単体テスト60件が回る |
| **型で守る** | 全ファイルstrict TypeScript。i18nの文言キー・避難方針キーもコンパイル時に検査される |
| **災害時を想定した堅牢性** | オフライン保存 (PWA)、省電力描画、外部配信の障害検知 (週次monitor) |

## 2. ディレクトリマップ

```
index.html            画面の骨組み (パネル・カード等のDOMはすべてここに静的定義)
src/
  main.ts             起動シーケンス (9行の初期化呼び出しのみ)
  config.ts           町の基本設定 (町域bbox・初期カメラ・タイルURL・Ionトークン)
  hazards.ts          ハザードレイヤ定義 (7系統のタイルURL・凡例色)
  style.css           全スタイル (CSS変数ベース。ダークモードは変数上書きで実現)
  sw.ts               Service Worker (キャッシュ戦略。tsconfig.sw.jsonで型検査)

  app/                ―― UI層 (画面の配線。1機能=1ファイル) ――
    context.ts        共有状態 ctx (viewer・避難所リスト・最終診断など)
    viewer.ts         Cesium Viewer生成・カメラ・3D地形・requestRender()
    layers.ts         レイヤ類の初期化 (建物・ハザードチップ・避難所・写真・水柱)
    diagnosis.ts      タップ診断 → 診断カード表示 (このアプリの中心機能)
    search.ts         現在地診断・住所検索・共有リンク (?loc=)
    settings.ts       言語・文字サイズ・パネル開閉・Escキー
    offline-ui.ts     SW登録・「町内データを保存/削除」・オフラインバッジ
    weather-ui.ts     気象警報バナー
    ui.ts             共通部品 ($ / toast / escapeHtml / ダイアログのフォーカス管理)
    risk-text.ts      診断結果→文言の共通変換 (診断カードと避難カードで共用)

  lib/                ―― 純粋ロジック (DOM/Cesium非依存。tests/で単体テスト) ――
    geomath.ts        タイル座標変換・色→浸水深判定・距離/方位・避難所パース
    route.ts          危険区域を避けるダイクストラ経路探索
    evacplan.ts       浸水深/土砂/家屋倒壊等 → 避難方針キーの決定
    jma.ts            気象庁 警報JSONの解析
    validate.ts       外部データの構造検証 (壊れたデータを黙って使わない)
    offline-tiles.ts  オフライン保存対象タイルの列挙
    metrics.ts        端末内のみの利用回数記録

  locales/            辞書 (ja=正、easy/enはtypeof jaでキー完全一致を型強制)
  i18n.ts             言語切替ロジック (t() / setLang / data-i18n適用)

  ―― Cesium統合層 (地図上の表示物とデータ取得) ――
  plateau.ts          PLATEAUデータカタログAPI → 3D建物タイルセット読込
  gsiterrain.ts       地理院標高タイル → Cesium地形 (Ion不通時のフォールバック)
  buildingrisk.ts     建物属性 (浸水ランク・階数) の集計と色分け
  floodgrid.ts        浸水タイル全域スキャン (面積統計・3D水柱の元データ)
  risk.ts             地点診断の本体 (タイル色のピクセル判定)
  shelters.ts         避難所データ取得 (3段フォールバック) とピン表示
  saferoute.ts        安全ルートの読み込み・3D描画
  citydata.ts         緊急輸送道路・町域界オーバーレイ
  dashboard.ts        町全体統計ダッシュボード
  evaccard.ts         わが家の避難カード (A4印刷)
  weather.ts          気象庁JSONの定期取得 (10分ごと)
  offline.ts          町内データの一括保存・削除・永続化 (persist)

scripts/              開発・運用スクリプト (roads.json生成、配色監視)
tests/                Vitest単体テスト (lib層 + 辞書整合性 + 実データ検証)
e2e/                  Playwright E2E (外部配信は全てモック) + axeアクセシビリティ検査
.github/workflows/    ci.yml (品質ゲート) / deploy.yml (Pages) / monitor.yml (週次監視)
```

## 3. 起動の流れ (`src/main.ts`)

初期化は9つの `init*()` を **この順で** 呼ぶだけです。順序に意味があります:

1. `initLanguage()` — 以降のUI構築が `t()` (翻訳) を使うため最初
2. `initViewer()` — Cesium Viewerを作り `ctx.viewer` に設定 (以降はこれに依存)
3. `initLayers()` → `initDiagnosis()` → `initSearch()` → `initSettings()` → `initOfflineUi()` → `initWeatherBanner()`

共有状態は `src/app/context.ts` の `ctx` に集約しています。`ctx.viewer` を初期化前に触ると
「起動順を確認せよ」という例外が出る (fail-fast) ので、順序ミスはすぐ気づけます。

## 4. 機能ごとのデータの流れ

### 4-1. タップ診断 (中心機能)

```
地図タップ (app/diagnosis.ts)
  → Cesiumのpickで「建物 / 避難所ピン / 地面」を判別
  → 経緯度を確定して runDiagnosis(lon, lat)
    → risk.ts diagnosePoint(): ハザードタイル7系統のPNGを取得し、
       その地点のピクセル色を読む (canvasで1pxずつ)
       ・判定は周辺3×3ピクセルの多数決 (区域境界のブレを抑える。中心ヒットは常に採用=安全側)
       ・色→浸水深クラスの対応表は lib/geomath.ts の FLOOD_DEPTH_CLASSES (公式凡例色)
       ・タイルが404 = その地点に区域なし (正常応答として扱う)
    → buildResultBody(): 判定結果をカードのHTML行に組み立て
       (浸水 → 継続時間 → 家屋倒壊等 → 土砂 → 最寄り避難所 → 注記 の順)
```

**重要な前提**: 診断は「配信タイルの色」に依存します。配信側が配色を変えると誤判定になるため、
週次の `monitor.yml` (palette ジョブ) がアプリと同じ分類器で整合を監視しています (§7)。

### 4-2. わが家の避難カード (`evaccard.ts`)

診断結果 (`ctx.lastDiagnosis`) から A4印刷用HTMLを生成します。
「どう避難すべきか」の判断は `lib/evacplan.ts` の純粋関数 `evacuationPolicies()` が行い、
evaccard側は文言化と紙面レイアウトだけを担当します (判断ロジックは単体テストで網羅済み)。
共有リンクは `?loc=緯度,経度&name=…` をURLに載せるだけで、サーバーには何も送りません。

### 4-3. 安全避難ルート (`saferoute.ts` + `lib/route.ts`)

`public/data/roads.json` (OSM道路網 + ハザード注釈。`npm run build:roads` で生成) があるときだけ有効。
ダイクストラ法の**コストに危険度ペナルティを掛ける**のが肝です:
浸水0.5〜3m=距離6倍、3m以上=30倍、土砂特別警戒=30倍 (`FLOOD_PENALTY`/`LS_PENALTY`)。
「多少遠回りでも危険区域を避ける。回避不能なら通すが赤点線で明示」という挙動になります。

### 4-4. オフライン対応 (PWA)

二段構えです:

- **Service Worker (`sw.ts`)** — 閲覧したものを自動キャッシュ。
  キャッシュは4つ: アプリ本体 / 地図・ハザードタイル / カタログAPI / 3D建物 (上限400件のLRU)。
  新バージョン検知時は「タップして更新」バナー経由でのみ切り替え (勝手にリロードしない)
- **「町内データを保存」(`offline.ts`)** — 町域のタイルを一括ダウンロードして事前保存。
  `navigator.storage.persist()` でブラウザの自動削除を防止。ハザードタイルの404も
  「区域外」として記録するので、オフラインでも診断結果がオンライン時と一致する

### 4-5. 町全体統計 (`floodgrid.ts` + `dashboard.ts`)

洪水タイルを町全域分 (z15) スキャンし、ピクセル数×ピクセル面積で浸水想定面積を集計。
同じスキャン結果から63m格子の「浸水セル」を作り、標高タイル (DEMをRGBから復号) と
組み合わせて実高さの半透明水柱を3D表示します (`buildWaterColumns`)。

### 4-6. 気象警報バナー (`weather.ts` + `lib/jma.ts`)

気象庁の防災情報JSON (奈良県=290000) を10分ごとに取得し、三郷町 (2934300) の
発表中の警報・注意報だけをバナー表示。取得失敗時は**静かに非表示** (誤表示より安全)。

## 5. 中核の仕組み

### タイル座標と色判定 (`lib/geomath.ts`)

地図タイルは「ズームz・列x・行y」で世界を分割したPNG画像です。
`tileCoords(lon, lat, z)` が経緯度→タイル番号+タイル内ピクセル位置を計算し、
`floodClassIndex(pixel)` がRGB値を公式凡例色と (許容誤差つきで) 照合します。
土砂の特別警戒区域 (レッドゾーン) は公式凡例が画像のみのため**色相ヒューリスティック**による参考判定です。

### 描画は「変化があったときだけ」(`app/viewer.ts`)

Cesiumの `requestRenderMode` を有効にし、レイヤ切替やマーカー移動など
Cesiumが自動検知しない変更の後に `requestRender()` を呼びます。
避難時にバッテリー残量が命綱になるため、無変化時のGPU消費をゼロに近づけています。
**新しく表示物を追加・変更するコードを書いたら、直後に `requestRender()` を呼ぶこと。**

### i18n が型で守られる仕組み (`i18n.ts` + `locales/`)

`locales/ja.ts` が全キーの「正」で、`easy`/`en` は `typeof ja` で型付けされているため
キーの過不足はコンパイルエラーになります。`t('diag.flood')` のキーも `MsgKey` 型で検査され、
存在しないキーはビルドが通りません。さらに `tests/i18n-usage.test.mjs` が
コードとHTMLを走査して「使われているのに辞書にないキー」を検出します。

### ダークモード (`style.css`)

色はすべて `:root` のCSS変数 (`--ink` / `--card-bg` / `--surface` など) に集約されており、
`@media (prefers-color-scheme: dark)` で**変数を上書きするだけ**で全UIが切り替わります。
例外は2つ: 浸水深チップ (公式凡例色のため文字色を濃色固定) と、
避難カードの紙面 (印刷前提のためライト固定 — `.ec-sheet` 内で変数をライト値に再定義)。

## 6. テストと品質ゲート

| ゲート | 対象 | 実行 |
|---|---|---|
| `npm run typecheck` | 全ファイルの型検査 (本体 + sw.ts) | CI必須 |
| `npm run lint` / `npm run fmt:check` | oxlint (警告=エラー) / oxfmt | CI必須 |
| `npm test` | lib層の単体テスト60件 + 辞書整合性 + 同梱データ検証 | CI必須 |
| `npm run test:e2e` | Playwright 21件 — 起動/診断/避難カード/ルート/オフライン削除/言語/SW + **axeアクセシビリティ検査 (ライト・ダーク両方)** | CI必須 |
| `monitor.yml` | 週次: 外部配信の疎通 + **ハザードタイル配色とアプリ分類器の整合** | 自動 (赤=対応が必要) |

E2Eは外部配信を**すべてモック**しています (`e2e/helpers.mjs`)。つまりCIは「配信側の変化」を
検知できません — それを補うのが週次monitorです。

## 7. よくある変更の手引き

| やりたいこと | 触る場所 |
|---|---|
| 文言を変える・言語を足す | `src/locales/*.ts` (キーを増やしたら3言語すべてに。型が過不足を教えてくれる) |
| ハザードレイヤを足す | `src/hazards.ts` に定義を追加 → チップUIは自動生成。診断にも使うなら `src/risk.ts` へ |
| 避難方針の判断を変える | `src/lib/evacplan.ts` + `tests/evacplan.test.mjs` (必ずテストとセットで) |
| 色・見た目を変える | `src/style.css` の CSS変数。ダークモード側 (`prefers-color-scheme`) の値も確認 |
| 対象自治体を変える | `src/config.ts` (CITY_CODE/CITY_BBOX/初期カメラ) + `src/weather.ts` の地域コード + 同梱避難所データ |
| 保存対象タイルを変える | `src/offline.ts` の `offlineSources()` |
| 依存を更新する | Dependabot PRを確認。**Cesiumのメジャー更新はCI緑でも実機確認** (READMEの保守メモ参照) |

変更後は `npm run typecheck && npm run lint && npm test` → 大きい変更なら `npm run test:e2e` まで回してからコミットしてください。
