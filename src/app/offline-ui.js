// オフラインUI: Service Worker登録・「町内データを保存」・オフラインバッジ
import {
  registerServiceWorker,
  offlineSupported,
  offlineMeta,
  saveOfflineArea,
  watchOnlineState,
} from '../offline.js';
import { track } from '../lib/metrics.js';
import { t, currentLang } from '../i18n.js';
import { $, toast } from './ui.js';

export function initOfflineUi() {
  registerServiceWorker();
  initSaveButton();
  initBadge();
}

function renderOfflineNote() {
  const meta = offlineMeta();
  if (!meta) {
    $('offline-note').textContent = t('offline.none');
    return;
  }
  const d = new Date(meta.savedAt);
  const date =
    currentLang() === 'en'
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getMonth() + 1}月${d.getDate()}日`;
  $('offline-note').textContent = t('offline.saved', { date, count: meta.ok + meta.notFound });
}

function initSaveButton() {
  const offlineSaveBtn = $('offlineSave');
  if (!offlineSupported()) {
    offlineSaveBtn.disabled = true;
    $('offline-note').textContent = t('offline.unsupported');
    return;
  }
  renderOfflineNote();
  document.addEventListener('sango:langchange', renderOfflineNote);
  offlineSaveBtn.addEventListener('click', async () => {
    if (!navigator.onLine) {
      toast(t('offline.needOnline'));
      return;
    }
    offlineSaveBtn.disabled = true;
    try {
      await saveOfflineArea((done, total) => {
        $('offline-note').textContent = t('offline.saving', { done, total });
      });
      renderOfflineNote();
      track('offline_save');
      toast(t('offline.done'));
    } catch (err) {
      console.error(err);
      $('offline-note').textContent = t('offline.failed');
      toast(err.message ?? t('offline.failed'));
    } finally {
      offlineSaveBtn.disabled = false;
    }
  });
}

function initBadge() {
  watchOnlineState((online) => {
    const badge = $('offlineBadge');
    badge.hidden = online;
    if (!online) {
      badge.textContent = offlineMeta() ? t('offline.badgeSaved') : t('offline.badgeNone');
    }
  });
}
