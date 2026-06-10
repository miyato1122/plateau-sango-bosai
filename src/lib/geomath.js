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

// 始点から見た方位 (8方位の日本語)
export function compassDirection(lon1, lat1, lon2, lat2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return dirs[Math.round(deg / 45) % 8];
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
