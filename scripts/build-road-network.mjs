// 三郷町の徒歩道路網 + ハザード注釈 (public/data/roads.json) を生成する。
//
// 使い方 (要インターネット接続 — OSM Overpass API と地理院配信タイルを取得):
//   node scripts/build-road-network.mjs
//
// 出典: 道路網は © OpenStreetMap contributors (ODbL)。
// 生成したroads.jsonを同梱・公開する場合はアプリの出典欄にOSMを記載すること
// (index.html には既に記載済み)。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import {
  distanceMeters,
  tileCoords,
  floodClassIndex,
  classifyLandslideZone,
} from '../src/lib/geomath.js';

// 町域bbox (src/config.js の CITY_BBOX と同値。configはVite依存のため直接記述)
const BBOX = { west: 135.65, south: 34.565, east: 135.73, north: 34.625 };
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const FLOOD_URL =
  'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png';
const LS_URLS = [
  'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
  'https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png',
  'https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png',
];
const SAMPLE_ZOOM = 16;

// 徒歩避難に使える道路種別
const WALKABLE = [
  'residential',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'service',
  'living_street',
  'footway',
  'path',
  'pedestrian',
  'track',
  'steps',
  'cycleway',
];

// ---- Overpass取得 ----
async function fetchOsmWays() {
  const query = `
    [out:json][timeout:180];
    way["highway"~"^(${WALKABLE.join('|')})$"]
      (${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    (._;>;);
    out body;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass APIの取得に失敗 (HTTP ${res.status})`);
  return res.json();
}

// ---- OSM → グラフ (純粋関数: テストされる) ----
// 全way構成ノードをグラフノードにし、way内の隣接ノード間をエッジにする。
// 道路のカーブ形状がそのまま経路描画に使える。
export function waysToGraph(osm, bbox = BBOX) {
  const nodeById = new Map();
  const ways = [];
  for (const el of osm.elements ?? []) {
    if (el.type === 'node') nodeById.set(el.id, [el.lon, el.lat]);
    else if (el.type === 'way' && Array.isArray(el.nodes)) ways.push(el.nodes);
  }
  const inBbox = ([lon, lat]) =>
    lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north;

  const indexById = new Map();
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const indexOf = (id) => {
    if (!indexById.has(id)) {
      indexById.set(id, nodes.length);
      nodes.push(nodeById.get(id));
    }
    return indexById.get(id);
  };
  for (const wayNodes of ways) {
    for (let i = 0; i + 1 < wayNodes.length; i++) {
      const aId = wayNodes[i];
      const bId = wayNodes[i + 1];
      const a = nodeById.get(aId);
      const b = nodeById.get(bId);
      if (!a || !b || (!inBbox(a) && !inBbox(b))) continue;
      const key = aId < bId ? `${aId}/${bId}` : `${bId}/${aId}`;
      if (seen.has(key)) continue; // 重複way (往復・重畳) の排除
      seen.add(key);
      const len = distanceMeters(a[0], a[1], b[0], b[1]);
      if (len === 0) continue;
      edges.push([indexOf(aId), indexOf(bId), Math.round(len * 10) / 10]);
    }
  }
  return { nodes, edges };
}

// ---- ハザードタイルのサンプリング ----
const tileCache = new Map();
async function loadTile(urlTemplate, z, x, y) {
  const url = urlTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  if (!tileCache.has(url)) {
    tileCache.set(
      url,
      (async () => {
        const res = await fetch(url).catch(() => null);
        if (!res || res.status === 404) return null; // 区域なし
        if (!res.ok) throw new Error(`タイル取得失敗 (HTTP ${res.status}) ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return PNG.sync.read(buf);
      })(),
    );
  }
  return tileCache.get(url);
}

async function samplePixel(urlTemplate, lon, lat) {
  const { x, y, px, py } = tileCoords(lon, lat, SAMPLE_ZOOM);
  const png = await loadTile(urlTemplate, SAMPLE_ZOOM, x, y);
  if (!png) return null;
  const i = (py * png.width + px) * 4;
  const a = png.data[i + 3];
  if (a === 0) return null;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a };
}

async function annotateEdge(nodes, edge) {
  const [a, b] = edge;
  const mid = [(nodes[a][0] + nodes[b][0]) / 2, (nodes[a][1] + nodes[b][1]) / 2];
  const flood = await samplePixel(FLOOD_URL, mid[0], mid[1]);
  const floodIdx = floodClassIndex(flood);
  let lsCode = 0;
  for (const url of LS_URLS) {
    const zone = classifyLandslideZone(await samplePixel(url, mid[0], mid[1]));
    if (zone === 'special') lsCode = 2;
    else if (zone === 'warning' && lsCode === 0) lsCode = 1;
  }
  // 凡例外の色の浸水塗り (深さ不明) も回避対象にする (0.5〜3m相当の扱い)
  const effectiveFlood = floodIdx >= 0 ? floodIdx : flood ? 1 : -1;
  return [...edge, effectiveFlood, lsCode];
}

// ---- メイン ----
async function main() {
  console.log('1/3 OSM道路網を取得中 (Overpass API)…');
  const osm = await fetchOsmWays();
  const { nodes, edges } = waysToGraph(osm);
  console.log(`   ノード ${nodes.length} / エッジ ${edges.length}`);
  if (edges.length === 0) throw new Error('道路が見つかりませんでした');

  console.log('2/3 ハザードタイルでエッジを注釈中…');
  const annotated = [];
  let done = 0;
  for (const edge of edges) {
    annotated.push(await annotateEdge(nodes, edge));
    done += 1;
    if (done % 500 === 0) console.log(`   ${done}/${edges.length}`);
  }
  const flooded = annotated.filter((e) => e[3] >= 0).length;
  const ls = annotated.filter((e) => e[4] > 0).length;
  console.log(`   浸水想定内エッジ ${flooded} / 土砂区域内エッジ ${ls}`);

  console.log('3/3 public/data/roads.json を書き出し中…');
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: '© OpenStreetMap contributors (ODbL) / ハザード: 重ねるハザードマップ',
    bbox: BBOX,
    nodes: nodes.map(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]),
    edges: annotated,
  };
  const dir = fileURLToPath(new URL('../public/data/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}roads.json`, JSON.stringify(out));
  console.log(`完了: ${dir}roads.json (${(JSON.stringify(out).length / 1e6).toFixed(1)}MB)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
