// UI文字列辞書: 標準の日本語 (全キーの正)。
// easy/en は typeof ja で型付けされ、キーの過不足はコンパイルエラーになる。
export const ja = {
  'brand.sub': '奈良県三郷町',
  'search.placeholder': '住所で探す (例: 勢野西1丁目)',
  'search.label': '住所検索',
  'fab.locate': '現在地を診断',
  'fab.locateTitle': '現在地のリスクを診断',
  'fab.home': '全体表示',
  'fab.dash': '町全体の統計',
  'fab.layers': 'レイヤ設定',

  'panel.title': 'レイヤと凡例',
  'panel.display': '表示設定',
  'panel.fontLarge': '文字を大きくする',
  'panel.lang': 'ことば / Language',
  'panel.hazard': '災害リスク',
  'panel.opacity': '重ね合わせの濃さ',
  'panel.water3d': '浸水深を3Dで体感',
  'panel.bldgrisk': '建物をリスク別に色分け',
  'panel.facilities': '防災施設・地図',
  'panel.shelters': '避難場所',
  'panel.route': '緊急輸送道路',
  'panel.border': '町域界',
  'panel.buildings': '3D建物 (PLATEAU)',
  'panel.photo': '航空写真',
  'panel.offline': 'オフライン利用',
  'panel.close': '閉じる',

  'offline.desc':
    '通信できない災害時に備えて、町内の地図とハザードデータを端末に保存できます (約10〜20MB)。保存後は電波がなくても地点診断と避難場所の確認ができます。',
  'offline.save': '町内データを端末に保存',
  'offline.none': 'まだ保存されていません',
  'offline.saved': '保存済み: {date} (タイル{count}件)',
  'offline.saving': '保存中… {done}/{total}',
  'offline.failed': '保存に失敗しました',
  'offline.unsupported': 'この端末・ブラウザでは利用できません',
  'offline.needOnline': 'オフラインのため保存できません。通信できる場所でお試しください。',
  'offline.done': '町内のデータを保存しました。電波がない場所でも診断できます。',
  'offline.badgeSaved': '📡 オフライン表示中 — 保存済みデータで診断できます',
  'offline.badgeNone': '📡 オフラインです — データ未保存のため表示が制限されます',
  'offline.delete': '保存したデータを削除',
  'offline.deleteConfirm': '端末に保存した町内データを削除します。よろしいですか？',
  'offline.deleted': '保存データを削除しました',
  'offline.usage': '端末の使用量: 約{mb}MB',

  'hazards.flood': '洪水浸水想定',
  'hazards.keizoku': '浸水継続時間',
  'hazards.kaokutoukai_hanran': '家屋倒壊 (氾濫流)',
  'hazards.kaokutoukai_kagan': '家屋倒壊 (河岸侵食)',
  'hazards.dosekiryu': '土石流',
  'hazards.kyukeisha': '急傾斜地',
  'hazards.jisuberi': '地すべり',

  floodClasses: [
    { label: '0.5m未満', advice: '床下浸水のおそれ' },
    { label: '0.5〜3.0m', advice: '1階が水没するおそれ。2階以上か避難場所へ' },
    { label: '3.0〜5.0m', advice: '2階まで水没するおそれ。早めの立退き避難を' },
    { label: '5.0〜10.0m', advice: '3階以上まで水没するおそれ。立退き避難が必要' },
    { label: '10.0〜20.0m', advice: '建物全体が水没するおそれ。立退き避難が必要' },
    { label: '20.0m以上', advice: '建物全体が水没するおそれ。立退き避難が必要' },
  ],
  'flood.unknown': '浸水想定あり (深さ不明)',
  'flood.unknownAdvice': '周囲より低い土地に注意してください',

  'diag.title': 'この地点のリスク',
  'diag.building': 'この建物のリスク',
  'diag.current': '現在地のリスク',
  'diag.loading': '診断中…',
  'diag.flood': '洪水で {chip} の浸水が想定されています',
  'diag.floodSafe': '洪水の浸水想定区域<b>外</b>です',
  'diag.landslide': '土砂災害警戒区域 (<b>{types}</b>) に該当する可能性があります',
  'diag.landslideAdvice': '大雨のときは早めに区域の外へ避難してください',
  'diag.landslideSpecial':
    '土砂災害<b>特別警戒区域</b> (<b>{types}</b>) に該当する可能性があります',
  'diag.landslideSpecialAdvice':
    '建物が壊れるおそれのある区域です。大雨のときは必ず区域の外へ立退き避難してください (タイル色からの参考判定)',
  'diag.landslideSafe': '土砂災害警戒区域<b>外</b>です',
  'diag.keizoku':
    '浸水した水が引くまで長時間かかるおそれがあります (浸水継続時間の想定区域内。「浸水継続時間」レイヤで確認できます)',
  'diag.kaokutoukai': '家屋倒壊等氾濫想定区域 (<b>{types}</b>) に該当する可能性があります',
  'diag.kaokutoukaiAdvice':
    '家が流失・倒壊するおそれのある区域です。浸水深によらず立退き避難が必要です',
  'ls.hanran': '氾濫流',
  'ls.kagan': '河岸侵食',
  'ls.dosekiryu': '土石流',
  'ls.kyukeisha': '急傾斜地の崩壊',
  'ls.jisuberi': '地すべり',

  'shelter.nearest': '🏃 最寄りの避難場所',
  'shelter.meta': '{dir}へ約{dist}m・徒歩約{min}分',
  'shelter.route': '経路を見る',
  'shelter.info': '避難場所の情報',
  'shelter.capacity': '収容{n}人',
  'shelter.disasters': '対応災害: {list}',
  'shelter.noDisasters': '指定なし',
  'shelter.srcOfficial': '出典: PLATEAU 三郷町関連データセット',
  'shelter.srcGsi': '出典: 国土地理院 指定緊急避難場所データ',

  'bldg.height': '高さ{h}m',
  'bldg.storeys': '約{n}階建て',
  'bldg.fallback': '建物',
  'bldg.rankLabel': 'この建物の浸水ランク (PLATEAU属性):',
  'bldg.vertWarn': ' — 2階建て以下のため屋内の垂直避難は困難です',
  'bldg.noAttr': 'この3D都市モデルには建物単位の浸水ランク属性が含まれていません',

  'note.outside': '⚠️ この地点は三郷町の外です。表示は全国データに基づく参考値です。',
  'note.source':
    '出典: ハザードマップポータルサイト (想定最大規模)。参考情報であり、実際の災害はこれと異なる場合があります。',

  'err.diag': '診断に失敗しました。通信状況をご確認のうえ、もう一度お試しください。',
  'err.search': '検索に失敗しました。通信状況をご確認ください。',
  'err.notFound': '「{q}」が見つかりませんでした',
  'geo.getting': '現在地を取得しています…',
  'geo.failed': '現在地を取得できませんでした。位置情報の許可を確認してください。',
  'geo.unsupported': 'この端末では現在地を取得できません',

  'dash.title': '📊 三郷町全体の浸水リスク統計',
  'dash.areaTitle': '浸水想定面積 (想定最大規模)',
  'dash.bldgTitle': '建物別リスク (PLATEAU属性)',
  'dash.scanning': '町全域のハザードタイルを解析中…',
  'dash.scanFailed': '面積統計の取得に失敗しました。通信状況をご確認ください。',
  'dash.areaHead': '想定最大規模の洪水で、町内 <b>約{km2} km²</b> が浸水するおそれがあります',
  'dash.areaNote': '出典: ハザードマップポータルサイト配信タイルの全域解析 (約63m格子)',
  'dash.bldgWait': '3D建物の読み込み待ちです。地図を表示したまましばらくお待ちください。',
  'dash.bldgNoAttr':
    'この3D都市モデルには建物単位の浸水ランク属性が含まれていないため、建物別統計は表示できません (面積統計をご利用ください)。',
  'dash.bldgHead':
    '読み込み済み <b>{total}棟</b> のうち <b>{atRisk}棟</b> に浸水想定、うち <b class="dash-danger">{vert}棟</b> は3m以上の浸水想定かつ2階建て以下 (垂直避難が困難)',
  'dash.bldgNote':
    'カメラで表示した範囲の建物から漸進的に集計されます。建物属性 (浸水ランク・階数) はPLATEAU CityGML由来です。',
  'dash.unitKm2': ' km²',
  'dash.unitBldg': '棟',

  'hint.tap': '地図をタップすると、その場所の災害リスクと最寄りの避難場所がわかります',
  dirs: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],

  'card.button': '🖨 わが家の避難カードを作る',
  'card.title': 'わが家の避難カード',
  'card.created': '作成日',
  'card.place': '対象の場所',
  'card.pointFallback': '地図で選んだ地点',
  'card.riskTitle': 'この場所の想定リスク',
  'card.policyTitle': 'わが家の避難方針',
  'card.levelsTitle': '警戒レベルと行動',
  'card.level3': '警戒レベル3<br>高齢者等避難',
  'card.level4': '警戒レベル4<br>避難指示',
  'card.level5': '警戒レベル5<br>緊急安全確保',
  'card.action3': '高齢者・障害のある方・小さな子ども連れは避難を開始。それ以外の人も準備を始める',
  'card.action4': '全員が危険な場所から避難する',
  'card.action5':
    'すでに災害が発生・切迫。命を守る最善の行動を (避難が間に合わない場合は屋内のより安全な場所へ)',
  'card.sheltersTitle': '避難先 (近い順)',
  'card.mapNote': '★=この場所 / ①②=避難場所。点線は位置関係の目安で経路ではありません',
  'card.memoTitle': '家族メモ (書き込んで冷蔵庫などに貼っておきましょう)',
  'card.memoMeet': 'はぐれたときの集合場所',
  'card.memoContact': '連絡方法 (災害用伝言ダイヤル 171 など)',
  'card.memoItems':
    '持ち出すもの: □水 □食料 □常備薬 □モバイルバッテリー □懐中電灯 □保険証のコピー □現金',
  'card.print': '印刷・PDF保存',
  'card.copyLink': 'この場所のリンクをコピー',
  'card.copied': 'リンクをコピーしました。家族に共有できます',
  'card.copyFailed': 'コピーできませんでした',
  'card.close': '閉じる',
  'card.disclaimer':
    '出典: ハザードマップポータルサイト・Project PLATEAU (参考情報)。実際の避難は三郷町の避難情報に従ってください。',

  'policy.floodLeave':
    '浸水想定 {label}: 立退き避難が必要です。浸水が始まる前に避難場所へ移動してください',
  'policy.floodVertical':
    '浸水想定 {label}: 早めの立退き避難が安全です。間に合わない場合は2階以上へ垂直避難',
  'policy.floodShallow':
    '浸水想定 {label}: 床下浸水のおそれ。気象情報と周囲の低い土地に注意してください',
  'policy.keizoku': '水が引くまで長時間かかる区域のため、自宅に留まる避難 (在宅避難) は危険です',
  'policy.lsSpecial':
    '土砂災害特別警戒区域の可能性: 大雨のときは必ず早めに区域の外へ立退き避難してください',
  'policy.lsWarning': '土砂災害警戒区域の可能性: 警戒レベル3で早めに避難を開始してください',
  'policy.kaokutoukai':
    '家屋倒壊等氾濫想定区域: 家が流失・倒壊するおそれがあるため、浸水深によらず必ず立退き避難してください',
  'policy.none':
    'この場所の想定リスクは低めです。それでも避難場所と経路を家族で確認しておきましょう',

  'route.button': '🛡 危険区域を避けるルートを表示',
  'route.calc': '計算中…',
  'route.summary': '危険区域を考慮した徒歩ルート: 約{km}km・約{min}分',
  'route.risky':
    '⚠️ うち約{m}mは浸水・土砂の想定区域内を通ります。災害時は通行できないおそれがあります',
  'route.note': '青=想定区域外 / 赤点線=想定区域内。参考情報であり実際の通行可否は保証されません',
  'route.failed': 'この地点付近の道路データがないため計算できませんでした',

  'weather.active': '三郷町に {list} が発表されています',
  'weather.link': '気象庁の情報を見る',

  'app.updateReady': 'アプリの新しいバージョンがあります — タップして更新',
};
