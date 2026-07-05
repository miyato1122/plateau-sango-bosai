// オフラインUI: Service Worker登録・「町内データを保存」・オフラインバッジ
import {
  registerServiceWorker,
  offlineSupported,
  offlineMeta,
  offlineUsage,
  saveOfflineArea,
  clearOfflineArea,
  watchOnlineState,
} from '../offline';
import { track } from '../lib/metrics';
import { t, currentLang } from '../i18n';
import { $, toast } from './ui';

export function initOfflineUi() {
  registerServiceWorker((applyUpdate) => {
    const banner = $('updateBanner') as HTMLButtonElement;
    banner.textContent = `🔄 ${t('app.updateReady')}`;
    banner.hidden = false;
    banner.addEventListener('click', () => {
      banner.disabled = true;
      applyUpdate();
    });
  });
  initSaveButton();
  initBadge();
}

async function renderOfflineNote() {
  const meta = offlineMeta();
  $('offlineDelete').hidden = !meta;
  if (!meta) {
    $('offline-note').textContent = t('offline.none');
    return;
  }
  const d = new Date(meta.savedAt);
  const date =
    currentLang() === 'en'
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getMonth() + 1}月${d.getDate()}日`;
  let text = t('offline.saved', { date, count: meta.ok + meta.notFound });
  const usedMb = await offlineUsage();
  if (usedMb != null && offlineMeta()) {
    text += ` — ${t('offline.usage', { mb: Math.max(1, Math.round(usedMb)) })}`;
  }
  $('offline-note').textContent = text;
}

function initSaveButton() {
  const offlineSaveBtn = $('offlineSave') as HTMLButtonElement;
  if (!offlineSupported()) {
    offlineSaveBtn.disabled = true;
    $('offline-note').textContent = t('offline.unsupported');
    return;
  }
  void renderOfflineNote();
  document.addEventListener('sango:langchange', () => void renderOfflineNote());
  initDeleteButton();
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
      await renderOfflineNote();
      track('offline_save');
      toast(t('offline.done'));
    } catch (err) {
      console.error(err);
      $('offline-note').textContent = t('offline.failed');
      toast(err instanceof Error ? err.message : t('offline.failed'));
    } finally {
      offlineSaveBtn.disabled = false;
    }
  });
}

function initDeleteButton() {
  const deleteBtn = $('offlineDelete') as HTMLButtonElement;
  deleteBtn.addEventListener('click', async () => {
    if (!window.confirm(t('offline.deleteConfirm'))) return;
    deleteBtn.disabled = true;
    try {
      await clearOfflineArea();
      toast(t('offline.deleted'));
    } catch (err) {
      console.error(err);
      toast(t('offline.failed'));
    } finally {
      deleteBtn.disabled = false;
      await renderOfflineNote();
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
