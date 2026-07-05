// レイヤ類の初期化: 3D建物・ハザードチップ・凡例・航空写真・避難所・
// 町データオーバーレイ・建物リスク色分け・浸水3D水柱・統計ダッシュボード
import * as Cesium from 'cesium';
import { GSI_PHOTO } from '../config';
import { loadBuildingTilesets } from '../plateau';
import { createHazardLayer, HAZARD_LAYERS, FLOOD_DEPTH_CLASSES, type HazardKey } from '../hazards';
import { fetchShelters, addShelterEntities } from '../shelters';
import { loadCityOverlay, type OverlayKey } from '../citydata';
import { BuildingRiskAnalyzer } from '../buildingrisk';
import { buildWaterColumns } from '../floodgrid';
import { initDashboard } from '../dashboard';
import { t } from '../i18n';
import { ctx } from './context';
import { $, $input, toast, setStatus } from './ui';

const isChecked = (e: Event) => (e.target as HTMLInputElement).checked;

export function initLayers() {
  initBuildings();
  initHazardChips();
  initPhotoLayer();
  initShelters();
  initCityOverlays();
  initBuildingRiskColoring();
  initWater3d();
  initDashboard(ctx.riskAnalyzer);
}

// ---- PLATEAU 3D建物 + 建物単位リスク分析 ----
function initBuildings() {
  setStatus('bldg', '3D建物: データカタログ照会中…');
  ctx.riskAnalyzer = new BuildingRiskAnalyzer();
  loadBuildingTilesets(ctx.viewer, (msg) => setStatus('bldg', `3D建物: ${msg}`))
    .then(({ tilesets }) => {
      ctx.buildingTilesets = tilesets;
      for (const tileset of tilesets) {
        tileset.show = $input('layer-buildings').checked;
        ctx.riskAnalyzer.attach(tileset);
      }
      setStatus('bldg', '3D建物: 読み込み完了', 'ok');
    })
    .catch((err) => {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('bldg', `3D建物: 読み込み失敗 — ${msg}`, 'error');
    });
  $('layer-buildings').addEventListener('change', (e) => {
    for (const tileset of ctx.buildingTilesets) tileset.show = isChecked(e);
  });
}

// ---- ハザードレイヤ (チップUI) + 凡例 ----
function initHazardChips() {
  const opacityInput = $input('hazardOpacity');
  const chipsBox = $('hazardChips');
  const hazardLayers = {} as Record<HazardKey, Cesium.ImageryLayer>;
  for (const key of Object.keys(HAZARD_LAYERS) as HazardKey[]) {
    const def = HAZARD_LAYERS[key];
    hazardLayers[key] = createHazardLayer(ctx.viewer, key, Number(opacityInput.value) / 100);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.style.setProperty('--dot', def.color);
    chip.setAttribute('aria-pressed', 'false');
    chip.innerHTML = '<span class="dot"></span><span class="chip-label"></span>';
    chip.querySelector('.chip-label')!.textContent = t(`hazards.${key}`);
    chip.dataset.hazard = key;
    chip.addEventListener('click', () => {
      const on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(on));
      hazardLayers[key].show = on;
    });
    chipsBox.appendChild(chip);
    if (key === 'flood') chip.click(); // 洪水は初期表示
  }
  opacityInput.addEventListener('input', () => {
    const alpha = Number(opacityInput.value) / 100;
    for (const layer of Object.values(hazardLayers)) layer.alpha = alpha;
  });

  renderLegend();
  document.addEventListener('sango:langchange', () => {
    renderLegend();
    for (const chip of chipsBox.querySelectorAll<HTMLElement>('.chip')) {
      chip.querySelector('.chip-label')!.textContent = t(
        `hazards.${chip.dataset.hazard as HazardKey}`,
      );
    }
  });
}

// 凡例 (言語切替時に再描画)
function renderLegend() {
  const box = $('floodLegend');
  box.innerHTML = '';
  const classes = t('floodClasses');
  for (const [i, cls] of FLOOD_DEPTH_CLASSES.entries()) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch" style="background:${cls.css}"></span>`;
    li.append(classes[i]!.label);
    box.appendChild(li);
  }
}

// ---- 航空写真 ----
function initPhotoLayer() {
  let photoLayer: Cesium.ImageryLayer | null = null;
  $('layer-photo').addEventListener('change', (e) => {
    if (isChecked(e) && !photoLayer) {
      photoLayer = ctx.viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: GSI_PHOTO,
          maximumLevel: 18,
          credit: new Cesium.Credit('地理院タイル (写真)'),
        }),
        1, // ベースの直上・ハザードの下
      );
    } else if (photoLayer) {
      photoLayer.show = isChecked(e);
    }
  });
}

// ---- 避難場所 ----
function initShelters() {
  setStatus('shelter', '避難場所: 読み込み中…');
  let shelterEntities: Cesium.Entity[] = [];
  fetchShelters()
    .then(({ shelters: list, source }) => {
      ctx.shelters = list;
      shelterEntities = addShelterEntities(ctx.viewer, list);
      for (const ent of shelterEntities) ent.show = $input('layer-shelters').checked;
      setStatus('shelter', `避難場所: ${list.length}件 (${source})`, 'ok');
    })
    .catch((err) => {
      console.error(err);
      setStatus('shelter', '避難場所: 読み込み失敗', 'error');
    });
  $('layer-shelters').addEventListener('change', (e) => {
    for (const ent of shelterEntities) ent.show = isChecked(e);
  });
}

// ---- 町データオーバーレイ (緊急輸送道路・町域界) ----
function initCityOverlays() {
  const overlays: Array<[OverlayKey, string]> = [
    ['emergency_route', 'er-note'],
    ['border', 'border-note'],
  ];
  for (const [key, noteId] of overlays) {
    const checkbox = $input(`layer-${key}`);
    const note = $(noteId);
    loadCityOverlay(ctx.viewer, key)
      .then((ds) => {
        if (!ds) {
          note.textContent = '(データ取得不可)';
          return;
        }
        checkbox.disabled = false;
        note.textContent = '';
        checkbox.addEventListener('change', (e) => {
          ds.show = isChecked(e);
        });
      })
      .catch(() => {
        note.textContent = '(データ取得不可)';
      });
  }
}

// ---- 建物リスク色分け ----
function initBuildingRiskColoring() {
  $('layer-bldgrisk').addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const analyzer = ctx.riskAnalyzer;
    if (target.checked && !analyzer.hasRiskAttributes()) {
      $('bldgrisk-note').textContent =
        analyzer.stats.total === 0
          ? '(建物の読み込み待ち)'
          : '(この都市モデルに浸水ランク属性なし)';
      if (analyzer.stats.total > 0) {
        // 属性が無い場合はチェックを戻す
        target.checked = false;
        toast(t('bldg.noAttr'));
        return;
      }
    } else {
      $('bldgrisk-note').textContent = '';
    }
    analyzer.setColoring(ctx.buildingTilesets, target.checked);
    ctx.viewer.scene.requestRender?.();
  });
}

// ---- 浸水深の3D表示 (高さ付き水柱) ----
function initWater3d() {
  let waterPrimitive: Cesium.Primitive | null = null;
  let waterLoading = false;
  $('layer-water3d').addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const note = $('water3d-note');
    if (waterPrimitive) {
      waterPrimitive.show = target.checked;
      return;
    }
    if (!target.checked || waterLoading) return;
    waterLoading = true;
    try {
      note.textContent = '(解析中…)';
      waterPrimitive = await buildWaterColumns(ctx.viewer, (done, total) => {
        note.textContent = `(解析中… ${done}/${total})`;
      });
      if (!waterPrimitive) {
        note.textContent = '(データ取得不可)';
        target.checked = false;
        return;
      }
      note.textContent = '';
      waterPrimitive.show = $input('layer-water3d').checked;
    } catch (err) {
      console.error(err);
      note.textContent = '(取得失敗)';
      target.checked = false;
      toast('浸水深データの解析に失敗しました');
    } finally {
      waterLoading = false;
    }
  });
}
