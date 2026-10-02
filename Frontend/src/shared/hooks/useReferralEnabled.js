import { useEffect, useState } from 'react';
import apiClient from '@/services/api/axios.js';

/**
 * Whether the customer referral system is switched on (Global admin > Customization Settings > Referral System).
 * One switch for Food and Taxi, so both wallets / profiles / referral pages read it from here.
 *
 * It rides on the public customization settings that both apps already load at start-up; the last answer is kept in
 * the same localStorage entry Food's location hook uses, so the right state shows on the very first paint. Until a
 * first answer exists the feature is shown (a failed request must never hide it).
 */
const STORAGE_KEY = 'helloparth_customization_settings';
const LOADED_EVENT = 'customizationSettingsLoaded';
const REFRESH_AFTER_MS = 60 * 1000;

let lastRefreshAt = 0;
let refreshing = null;

const readCachedFlag = () => {
  try {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return settings ? settings.referral_enabled !== false : true;
  } catch {
    return true;
  }
};

const refreshSettings = () => {
  if (refreshing || Date.now() - lastRefreshAt < REFRESH_AFTER_MS) return refreshing;

  refreshing = apiClient
    .get('/food/public/customization-settings')
    .then((response) => {
      const settings = response?.data?.data || response?.data;
      if (settings && typeof settings === 'object') {
        lastRefreshAt = Date.now();
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
          /* storage unavailable - the value still reaches this session through the event below */
        }
        window.dispatchEvent(new CustomEvent(LOADED_EVENT));
      }
    })
    .catch(() => {})
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
};

export default function useReferralEnabled() {
  const [enabled, setEnabled] = useState(readCachedFlag);

  useEffect(() => {
    const sync = () => setEnabled(readCachedFlag());
    window.addEventListener(LOADED_EVENT, sync);
    refreshSettings();
    return () => window.removeEventListener(LOADED_EVENT, sync);
  }, []);

  return enabled;
}
