// 現在地診断・住所検索 (地理院ジオコーダ)・共有リンク (?loc=) の処理
import { t } from '../i18n';

/** 地理院ジオコーダの結果 (必要なフィールドのみ) */
interface GeocoderHit {
  geometry: { coordinates: [number, number] };
  properties?: { title?: string };
}
import { $, $input, toast } from './ui';
import { flyToPoint } from './viewer';
import { runDiagnosis } from './diagnosis';

export function initSearch() {
  initLocate();
  initAddressSearch();
  handleSharedLocation();
}

// ---- 現在地診断 ----
function initLocate() {
  $('fabLocate').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast(t('geo.unsupported'));
      return;
    }
    toast(t('geo.getting'), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lon, latitude: lat } = pos.coords;
        flyToPoint(lon, lat);
        runDiagnosis(lon, lat, t('diag.current'));
      },
      () => toast(t('geo.failed')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

// ---- 住所検索 (地理院ジオコーダ) ----
function initAddressSearch() {
  const search = async (query: string): Promise<GeocoderHit[]> => {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`,
    );
    if (!res.ok) return [];
    return res.json() as Promise<GeocoderHit[]>;
  };
  $('searchBar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $input('searchInput').value.trim();
    if (!q) return;
    try {
      let results = await search(q.includes('三郷') ? q : `奈良県生駒郡三郷町${q}`);
      if (!results.length) results = await search(q);
      if (!results.length) {
        toast(t('err.notFound', { q }));
        return;
      }
      const hit = results[0];
      const [lon, lat] = hit.geometry.coordinates;
      flyToPoint(lon, lat);
      runDiagnosis(lon, lat, hit.properties?.title ?? q);
      $input('searchInput').blur();
    } catch (err) {
      console.error(err);
      toast(t('err.search'));
    }
  });
}

// ---- 共有リンク (?loc=lat,lon&name=…) で開かれた場合はその地点を診断 ----
function handleSharedLocation() {
  const params = new URLSearchParams(location.search);
  const loc = params.get('loc');
  if (!loc) return;
  const [lat, lon] = loc.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  flyToPoint(lon, lat, 0);
  // 避難所データの読み込みを少し待ってから診断 (未着でも診断自体は動く)
  setTimeout(() => runDiagnosis(lon, lat, params.get('name') ?? undefined), 800);
}
