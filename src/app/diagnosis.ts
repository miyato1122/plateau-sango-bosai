// 地点リスク診断: タップ/検索地点の診断カード表示・避難所カード・
// 安全ルートボタン・わが家の避難カード起動
import * as Cesium from 'cesium';
import { CITY_BBOX } from '../config';
import { FLOOD_DEPTH_CLASSES } from '../hazards';
import { nearestShelter } from '../shelters';
import { diagnosePoint, type DiagnosisRisk } from '../risk';
import { compassIndex, type Shelter } from '../lib/geomath';
import type { BuildingInfo } from '../buildingrisk';
import { track } from '../lib/metrics';
import { t } from '../i18n';
import { openEvacCard } from '../evaccard';
import { loadRoads, showSafeRoute, clearRoute } from '../saferoute';
import { landslideTypeNames, kaokutoukaiTypeNames, walkMinutes } from './risk-text';
import { ctx } from './context';
import { requestRender } from './viewer';
import {
  $,
  toast,
  escapeHtml,
  listSep,
  isMobile,
  floodClassText,
  openDialog,
  closeDialog,
} from './ui';

export function initDiagnosis() {
  $('resultClose').addEventListener('click', closeResultCard);

  // わが家の避難カード
  $('makeCardBtn').addEventListener('click', () => {
    if (!ctx.lastDiagnosis) return;
    track('evac_card');
    openEvacCard(ctx.lastDiagnosis, ctx.shelters, toast).catch((err) => {
      console.error(err);
      toast(t('err.diag'));
    });
  });

  // 地図タップで診断。建物タップはその建物の診断、避難所タップは施設カード。
  const handler = new Cesium.ScreenSpaceEventHandler(ctx.viewer.canvas);
  handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const viewer = ctx.viewer;
    const picked: unknown = viewer.scene.pick(movement.position);
    const pickedId =
      Cesium.defined(picked) && typeof picked === 'object' && picked !== null && 'id' in picked
        ? (picked as { id: unknown }).id
        : undefined;

    // 避難所などのエンティティ → 専用カード
    if (pickedId instanceof Cesium.Entity && pickedId !== ctx.marker) {
      const shelter = (pickedId as Cesium.Entity & { sangoShelter?: Shelter }).sangoShelter;
      if (shelter) showShelterCard(shelter);
      return;
    }

    const cartesian =
      viewer.scene.pickPosition(movement.position) ??
      viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    if (!cartesian) return;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    let lon = Cesium.Math.toDegrees(carto.longitude);
    let lat = Cesium.Math.toDegrees(carto.latitude);

    // 建物 (3D Tiles) タップ → 建物の代表点で診断し、建物情報を添える
    if (picked instanceof Cesium.Cesium3DTileFeature) {
      const info = ctx.riskAnalyzer.describe(picked);
      if (Number.isFinite(info.lon) && Number.isFinite(info.lat)) {
        lon = info.lon;
        lat = info.lat;
      }
      runDiagnosis(lon, lat, t('diag.building'), buildingInfoRow(info));
      return;
    }
    runDiagnosis(lon, lat);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// 診断カードを閉じ、マーカー・経路表示も消す (閉じるボタン・Escで共用)
export function closeResultCard() {
  closeDialog($('resultCard'));
  if (ctx.marker) ctx.marker.show = false;
  clearRoute(ctx.viewer);
  requestRender();
}

function showMarker(lon: number, lat: number) {
  if (!ctx.marker) {
    ctx.marker = ctx.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString('#f97316'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  ctx.marker!.position = new Cesium.ConstantPositionProperty(
    Cesium.Cartesian3.fromDegrees(lon, lat),
  );
  ctx.marker!.show = true;
  requestRender();
}

const inCity = (lon: number, lat: number) =>
  lon >= CITY_BBOX.west &&
  lon <= CITY_BBOX.east &&
  lat >= CITY_BBOX.south &&
  lat <= CITY_BBOX.north;

export async function runDiagnosis(
  lon: number,
  lat: number,
  placeName?: string,
  extraRowHtml = '',
) {
  showMarker(lon, lat);
  clearRoute(ctx.viewer);
  requestRender();
  $('resultTitle').textContent = placeName ?? t('diag.title');
  $('resultBody').innerHTML = `<div class="loading-dots">${t('diag.loading')}</div>`;
  $('makeCardBtn').hidden = true;
  openDialog($('resultCard'), $('resultTitle'));
  if (isMobile()) $('panel').hidden = true; // モバイルでは結果カードと重なるため閉じる

  try {
    const risk = await diagnosePoint(lon, lat);
    ctx.lastDiagnosis = { lon, lat, name: placeName ?? null, risk };
    $('makeCardBtn').hidden = false;
    track('diagnosis');

    const { html, nearest } = buildResultBody(lon, lat, risk, extraRowHtml);
    $('resultBody').innerHTML = html;
    if (nearest) attachSafeRoute(lon, lat, nearest.shelter);
  } catch (err) {
    console.error(err);
    $('resultBody').innerHTML = `<p class="result-note">${t('err.diag')}</p>`;
  }
}

// ---- 診断カード本文の組み立て ----
// 行の並び: (建物情報) → 浸水 → 浸水継続時間 → 家屋倒壊等 → 土砂 → 最寄り避難所 → 注記

function buildResultBody(lon: number, lat: number, risk: DiagnosisRisk, extraRowHtml: string) {
  const rows: string[] = [];
  if (extraRowHtml) rows.push(extraRowHtml);

  rows.push(floodRow(risk.flood));

  // 浸水継続時間の想定区域 (長期間水が引かないおそれ) は浸水想定がある場合のみ意味を持つ
  if (risk.keizoku && risk.flood) {
    rows.push(`
        <div class="risk-row bad"><span class="icon">⏳</span>
          <div>${t('diag.keizoku')}</div></div>`);
  }

  // 家屋倒壊等氾濫想定区域 (浸水深によらず立退き避難が必要)
  const kkTypes = kaokutoukaiTypeNames(risk.kaokutoukai);
  if (kkTypes.length) {
    rows.push(`
        <div class="risk-row bad"><span class="icon">🏚️</span>
          <div>${t('diag.kaokutoukai', { types: kkTypes.map(escapeHtml).join(listSep()) })}
            <span class="advice">${t('diag.kaokutoukaiAdvice')}</span></div></div>`);
  }

  // 土砂災害: 特別警戒区域 (レッドゾーン) と警戒区域を分けて表示
  const specialTypes = landslideTypeNames(risk.landslide, 'special');
  const warningTypes = landslideTypeNames(risk.landslide, 'warning');
  rows.push(...landslideRows(specialTypes, warningTypes));

  // 最寄り避難所。対応災害フィルタは日本語の公式データ値と照合する
  const filter = risk.flood ? '洪水' : specialTypes.length + warningTypes.length ? '土砂' : null;
  const nearest = ctx.shelters.length ? nearestShelter(ctx.shelters, lon, lat, filter) : null;
  if (nearest) rows.push(shelterRow(lon, lat, nearest));

  if (!inCity(lon, lat)) {
    rows.push(`<p class="result-note">${t('note.outside')}</p>`);
  }
  rows.push(`<p class="result-note">${t('note.source')}</p>`);
  return { html: rows.join(''), nearest };
}

// 浸水深の行 (区域内なら凡例色チップ + 助言、区域外なら安全表示)
function floodRow(flood: DiagnosisRisk['flood']): string {
  if (!flood) {
    return `
        <div class="risk-row ok"><span class="icon">🌊</span>
          <div>${t('diag.floodSafe')}</div></div>`;
  }
  const cls = floodClassText(flood);
  const chip = `<span class="depth-chip" style="background:${cls.css}">${escapeHtml(cls.label)}</span>`;
  return `
        <div class="risk-row bad">
          <span class="icon">🌊</span>
          <div>${t('diag.flood', { chip })}
            <span class="advice">${escapeHtml(cls.advice ?? '')}</span></div>
        </div>`;
}

// 土砂災害の行 (特別警戒区域・警戒区域それぞれ。どちらも無ければ安全表示1行)
function landslideRows(specialTypes: string[], warningTypes: string[]): string[] {
  const rows: string[] = [];
  if (specialTypes.length) {
    rows.push(`
        <div class="risk-row bad"><span class="icon">⛰️</span>
          <div>${t('diag.landslideSpecial', { types: specialTypes.map(escapeHtml).join(listSep()) })}
            <span class="advice">${t('diag.landslideSpecialAdvice')}</span></div></div>`);
  }
  if (warningTypes.length) {
    rows.push(`
        <div class="risk-row bad"><span class="icon">⛰️</span>
          <div>${t('diag.landslide', { types: warningTypes.map(escapeHtml).join(listSep()) })}
            <span class="advice">${t('diag.landslideAdvice')}</span></div></div>`);
  }
  if (rows.length === 0) {
    rows.push(`
        <div class="risk-row ok"><span class="icon">⛰️</span>
          <div>${t('diag.landslideSafe')}</div></div>`);
  }
  return rows;
}

// 最寄り避難所の行 (方角・距離・徒歩分数 + Googleマップ経路リンク + 安全ルート差込先)
function shelterRow(
  lon: number,
  lat: number,
  { shelter: s, dist }: { shelter: Shelter; dist: number },
): string {
  const dir = t('dirs')[compassIndex(lon, lat, s.lon, s.lat)]!;
  const meta = t('shelter.meta', { dir, dist: Math.round(dist), min: walkMinutes(dist) });
  return `
        <div class="shelter-row">${t('shelter.nearest')}
          <div><b>${escapeHtml(s.name)}</b></div>
          <div class="meta">${escapeHtml(meta)}${s.kind ? `${listSep()}${escapeHtml(s.kind)}` : ''}</div>
          <a class="route-link" target="_blank" rel="noopener"
             href="https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${s.lat},${s.lon}&travelmode=walking">
             ${t('shelter.route')}</a>
          <div id="safeRouteBox"></div>
        </div>`;
}

// 安全避難ルートのボタン (道路網データ public/data/roads.json がある場合のみ表示)
async function attachSafeRoute(lon: number, lat: number, shelter: Shelter) {
  if (!(await loadRoads())) return;
  const box = $('safeRouteBox');
  if (!box || !document.contains(box)) return; // 診断が更新済みなら何もしない
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'action-btn route-btn';
  btn.textContent = t('route.button');
  const note = document.createElement('div');
  note.className = 'meta';
  box.append(btn, note);
  btn.addEventListener('click', async () => {
    note.textContent = t('route.calc');
    try {
      const sum = await showSafeRoute(ctx.viewer, { lon, lat }, shelter);
      if (!sum) {
        note.textContent = t('route.failed');
        return;
      }
      track('safe_route');
      const parts = [
        t('route.summary', {
          km: (sum.lengthM / 1000).toFixed(1),
          min: sum.minutes,
        }),
      ];
      if (sum.riskyM > 0) parts.push(t('route.risky', { m: Math.round(sum.riskyM) }));
      parts.push(t('route.note'));
      note.textContent = parts.join(' ');
      requestRender();
    } catch (err) {
      console.error(err);
      note.textContent = t('route.failed');
    }
  });
}

// 避難所カード (InfoBoxの代わり)
function showShelterCard(s: Shelter) {
  $('makeCardBtn').hidden = true;
  $('resultTitle').textContent = t('shelter.info');
  $('resultBody').innerHTML = `
    <div class="shelter-row">🏫 <b>${escapeHtml(s.name)}</b>
      <div class="meta">${escapeHtml(s.address)}${s.kind ? `${listSep()}${escapeHtml(s.kind)}` : ''}${s.capacity ? `${listSep()}${escapeHtml(t('shelter.capacity', { n: s.capacity }))}` : ''}</div>
      <div class="meta">${escapeHtml(t('shelter.disasters', { list: s.disasters.join('、') || t('shelter.noDisasters') }))}</div>
      <a class="route-link" target="_blank" rel="noopener"
         href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking">${t('shelter.route')}</a>
    </div>
    <p class="result-note">${s.official ? t('shelter.srcOfficial') : t('shelter.srcGsi')}</p>`;
  openDialog($('resultCard'), $('resultTitle'));
  if (isMobile()) $('panel').hidden = true;
}

// 建物クリック時の追加情報行
function buildingInfoRow(info: BuildingInfo) {
  const parts: string[] = [];
  if (info.usage) parts.push(escapeHtml(info.usage));
  if (info.height) parts.push(escapeHtml(t('bldg.height', { h: info.height.toFixed(1) })));
  if (info.storeys) parts.push(escapeHtml(t('bldg.storeys', { n: info.storeys })));
  if (parts.length === 0 && info.classIdx < 0) return '';
  const rank =
    info.classIdx >= 0
      ? `<div class="meta">${t('bldg.rankLabel')}
        <span class="depth-chip" style="background:${FLOOD_DEPTH_CLASSES[info.classIdx]!.css}">${escapeHtml(t('floodClasses')[info.classIdx]!.label)}</span>
        ${
          info.classIdx >= 2 && info.storeys != null && info.storeys <= 2
            ? `<b class="dash-danger">${escapeHtml(t('bldg.vertWarn'))}</b>`
            : ''
        }</div>`
      : '';
  return `<div class="risk-row"><span class="icon">🏠</span>
    <div>${parts.join(listSep()) || t('bldg.fallback')}${rank}</div></div>`;
}
