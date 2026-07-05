// 気象警報バナー (三郷町に警報・注意報が発表中のときだけ表示)
import { startWeatherWatch, JMA_PAGE_URL } from '../weather';
import { t } from '../i18n';
import { $, listSep } from './ui.js';

export function initWeatherBanner() {
  startWeatherWatch((summary) => {
    const banner = $('weatherBanner');
    if (!summary) {
      banner.hidden = true;
      return;
    }
    banner.textContent = `⚠️ ${t('weather.active', {
      list: summary.names.join(listSep()),
    })} — ${t('weather.link')}`;
    banner.href = JMA_PAGE_URL;
    banner.dataset.level = summary.level;
    banner.hidden = false;
  });
}
