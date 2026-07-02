// 外部ライブラリに依存しない純粋ロジック。tests/ から単体テストされる。

// 浸水深の公式凡例色 (重ねるハザードマップ標準)
export const FLOOD_DEPTH_CLASSES = [
  { rgb: [247, 245, 169], label: '0.5m未満', advice: '床下浸水のおそれ', css: 'rgb(247,245,169)' },
  { rgb: [255, 216, 192], label: '0.5〜3.0m', advice: '1階が水没するおそれ。2階以上か避難場所へ', css: 'rgb(255,216,192)' },
  { rgb: [255, 183, 183], label: '3.0〜5.0m', advice: '2階まで水没するおそれ。早めの立退き避難を', css: 'rgb(255,183,183)' },
  { rgb: [255, 145, 145], label: '5.0〜10.0m', advice: '3階以上まで水没するおそれ。立退き避難が必要', css: 'rgb(255,145,145)' },
  { rgb: [242, 133, 201], label: '10.0〜20.0m', advice: '建物全体が水没するおそれ。立退き避難が必要', css: 'rgb(242,133,201)' },
  { rgb: [220, 122, 220], label: '20.0m以上', advice: '建物全体が水没するおそれ。立退き避難が必要', css: 'rgb(220,122,220)' },
];

// 経度緯度 → タイル座標とタイル内ピクセル位置 (Webメルカトル)
export function tileCoords(lon, lat, z, tileSize = 256) {
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return {
    x: Math.floor(xf),
    y: Math.floor(yf),
    px: Math.min(tileSize - 1, Math.floor((xf - Math.floor(xf)) * tileSize)),
    py: Math.min(tileSize - 1, Math.floor((yf - Math.floor(yf)) * tileSize)),
  };
}

// ピクセル色 → 浸水深クラス。凡例色と十分近い場合のみ深さを確定する。
export function classifyFloodDepth(pixel, tolerance = 60) {
  if (!pixel) return null;
  let best = null;
  for (const cls of FLOOD_DEPTH_CLASSES) {
    const d =
      Math.abs(cls.rgb[0] - pixel.r) +
      Math.abs(cls.rgb[1] - pixel.g) +
      Math.abs(cls.rgb[2] - pixel.b);
    if (!best || d < best.d) best = { cls, d };
  }
  return best.d <= tolerance
    ? best.cls
    : { label: '浸水想定あり (深さ不明)', advice: '周囲より低い土地に注意してください', css: '#9e9e9e' };
}

// ハバーサイン距離 (m)
export function distanceMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 始点から見た方位 (8方位の添字 0=北, 1=北東, …, 7=北西)
export function compassIndex(lon1, lat1, lon2, lat2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return Math.round(deg / 45) % 8;
}

// 始点から見た方位 (8方位の日本語)
export function compassDirection(lon1, lat1, lon2, lat2) {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return dirs[compassIndex(lon1, lat1, lon2, lat2)];
}

// PLATEAU関連データセット「避難施設」GeoJSONのパース
export function parseOfficialShelters(geojson) {
  const shelters = [];
  for (const f of geojson?.features ?? []) {
    if (f?.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const p = f.properties ?? {};
    const capacity = p['収容人数'];
    shelters.push({
      lon, lat,
      name: p['名称'] ?? '避難施設',
      address: p['住所'] ?? '',
      kind: p['施設の種類'] ?? '',
      capacity: capacity > 0 ? capacity : null,
      disasters: String(p['対象とする災害の分類'] ?? '')
        .split(/[、,;／/]/)
        .map((s) => s.trim())
        .filter((s) => s && s !== '指定なし'),
      official: true,
    });
  }
  return shelters;
}

// 最寄り避難場所。disasterFilter指定時は対応災害で絞り、該当なしなら全件で再探索。
export function nearestShelter(shelters, lon, lat, disasterFilter = null) {
  const pick = (filter) => {
    let best = null;
    for (const s of shelters) {
      if (filter && s.disasters.length > 0 && !s.disasters.some((d) => d.includes(filter))) {
        continue;
      }
      const dist = distanceMeters(lon, lat, s.lon, s.lat);
      if (!best || dist < best.dist) best = { shelter: s, dist };
    }
    return best;
  };
  return pick(disasterFilter) ?? pick(null);
}

// 各浸水深クラスの代表水深 (m) — 3D水柱の高さに使う (クラス幅の中庸値)
export const DEPTH_REPRESENTATIVE = [0.3, 1.5, 4, 7.5, 15, 22];

// ピクセル色 → 浸水深クラスの添字 (-1 = 浸水なし/判定不能)
export function floodClassIndex(pixel, tolerance = 60) {
  const cls = classifyFloodDepth(pixel, tolerance);
  if (!cls) return -1;
  return FLOOD_DEPTH_CLASSES.indexOf(cls); // 「深さ不明」は -1 になる
}

// Webメルカトルのピクセル解像度 (m/px)
export function metersPerPixel(z, lat, tileSize = 256) {
  return (
    (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (2 ** z * tileSize)
  );
}

// タイル座標 → 北西角の経度緯度
export function tileToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: (latRad * 180) / Math.PI };
}

// 地理院 標高PNGタイルのデコード (https://maps.gsi.go.jp/development/demtile.html)
// x = r*65536 + g*256 + b。x < 2^23 → h = x*0.01m、x = 2^23 → 無効、x > 2^23 → h = (x-2^24)*0.01m
export function gsiDemDecode(r, g, b) {
  const x = r * 65536 + g * 256 + b;
  if (x === 8388608) return null;
  return (x < 8388608 ? x : x - 16777216) * 0.01;
}

// 建物属性値 → 浸水深クラス添字。
// PLATEAUの浸水ランク (数値1〜6) と文字列表現 ("0.5m未満" "3.0m以上5.0m未満" 等) の両方に対応。
const RANK_BOUNDS = [0, 0.5, 3, 5, 10, 20];
export function parseFloodRank(value) {
  if (value == null || value === '') return -1;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 1 && value <= 6) return Math.round(value) - 1;
    return -1;
  }
  const text = String(value);
  const m = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (!m) return -1;
  const num = Number.parseFloat(m[1]);
  if (/未満/.test(text) && !/以上/.test(text)) {
    // "0.5m未満" → 上限がnum
    for (let i = RANK_BOUNDS.length - 1; i >= 0; i--) {
      if (num > RANK_BOUNDS[i]) return i;
    }
    return 0;
  }
  // "3.0m以上…" / "20m以上" → 下限がnum
  for (let i = RANK_BOUNDS.length - 1; i >= 0; i--) {
    if (num >= RANK_BOUNDS[i]) return i;
  }
  return -1;
}

// 3D Tilesの属性名一覧から浸水ランク・階数・高さの属性を推定する
export function detectRiskProperties(names) {
  const rankCandidates = names.filter(
    (n) => /(浸水|洪水|flood)/i.test(n) && /(ランク|rank|深)/i.test(n)
  );
  // 想定最大規模 (L2) を優先、計画規模のみの属性は後回し
  rankCandidates.sort((a, b) => {
    const score = (n) => (/想定最大|L2/i.test(n) ? 0 : /計画規模|L1/i.test(n) ? 2 : 1);
    return score(a) - score(b);
  });
  return {
    rank: rankCandidates[0] ?? null,
    storeys: names.find((n) => /storeysAboveGround|地上.*階数/i.test(n)) ?? null,
    height: names.find((n) => /measuredHeight|計測.*高さ/i.test(n)) ?? null,
  };
}

// 階数の推定 (階数属性がなければ高さ÷3mで概算)
export function estimateStoreys(storeysValue, heightValue) {
  const s = Number(storeysValue);
  if (Number.isFinite(s) && s > 0) return Math.round(s);
  const h = Number(heightValue);
  if (Number.isFinite(h) && h > 0) return Math.max(1, Math.round(h / 3));
  return null;
}

// ネストしたオブジェクト (またはJSON文字列) から浸水ランク値を探す。
// PLATEAUの3D Tilesでは拡張属性が `attributes` プロパティにJSONとして
// 格納されることがあるため、キーを再帰探索して最良候補を返す。
// 洪水を示す語はパス全体 (例: RiverFloodingRiskAttribute)、
// ランクを示す語は末端キー (例: uro:rank) に現れるため別々に判定する。
export function deepFindFloodRank(value) {
  let obj = value;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return -1; }
  }
  if (obj == null || typeof obj !== 'object') return -1;
  const hits = [];
  const walk = (node, path) => {
    if (node == null || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      const fullPath = `${path}/${k}`;
      if (
        (typeof v === 'number' || typeof v === 'string') &&
        /(ランク|rank)/i.test(k) &&
        /(浸水|洪水|flood)/i.test(fullPath)
      ) {
        hits.push({ path: fullPath, value: v });
      } else if (typeof v === 'object') {
        walk(v, fullPath);
      }
    }
  };
  walk(obj, '');
  if (hits.length === 0) return -1;
  // 想定最大規模 (L2) のキーパスを優先
  hits.sort((a, b) => {
    const score = (h) => (/想定最大|L2/i.test(h.path) ? 0 : /計画規模|L1/i.test(h.path) ? 2 : 1);
    return score(a) - score(b);
  });
  for (const h of hits) {
    const idx = parseFloodRank(h.value);
    if (idx >= 0) return idx;
  }
  return -1;
}


// 建物リスク統計のアキュムレータ
export function createBuildingStats() {
  return {
    total: 0,
    byClass: new Array(FLOOD_DEPTH_CLASSES.length).fill(0),
    noRisk: 0,
    verticalEvacuationRisk: 0, // 3m以上の浸水想定かつ2階建て以下
  };
}

export function accumulateBuilding(stats, classIdx, storeys) {
  stats.total += 1;
  if (classIdx < 0) {
    stats.noRisk += 1;
    return;
  }
  stats.byClass[classIdx] += 1;
  if (classIdx >= 2 && storeys != null && storeys <= 2) {
    stats.verticalEvacuationRisk += 1;
  }
}

// PLATEAUデータカタログから建築物3D Tilesを選ぶ (高LOD・テクスチャ優先)
export function pickBuildingDatasets(datasets) {
  const bldg = datasets.filter(
    (d) =>
      d.type_en === 'bldg' &&
      typeof d.url === 'string' &&
      d.url.includes('tileset.json')
  );
  if (bldg.length === 0) return [];
  const score = (d) => Number.parseFloat(d.lod ?? '0') * 10 + (d.texture ? 1 : 0);
  const best = Math.max(...bldg.map(score));
  return bldg.filter((d) => score(d) === best);
}

// データカタログからGeoJSON系の関連データセット (避難施設・緊急輸送道路等) を探す
export function findGeoJsonDataset(datasets, typeEn) {
  return (
    datasets.find(
      (d) =>
        d.type_en === typeEn &&
        typeof d.url === 'string' &&
        /\.geojson(\?|$)/i.test(d.url)
    ) ?? null
  );
}
