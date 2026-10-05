import { useEffect, useState } from 'react';
import apiClient from '@/services/api/axios.js';

/**
 * App-wide settings the Global admin controls (Global > Customization Settings), as the customer apps see them:
 * referral switch, customer COD / wallet / online switches, maintenance, default location.
 * Both apps load them from the public endpoint at start-up; the last answer is kept in the same localStorage entry
 * Food's location hook uses, so the right state shows on the very first paint. Until a first answer exists nothing
 * is hidden (a failed request must never take a feature away).
 */
const STORAGE_KEY = 'helloparth_customization_settings';
const LOADED_EVENT = 'customizationSettingsLoaded';
const REFRESH_AFTER_MS = 60 * 1000;

let lastRefreshAt = 0;
let refreshing = null;

export const readCachedCustomization = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
  } catch {
    return {};
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

/** Re-renders with the newest cached settings; `select` picks the part the caller needs. */
export default function usePublicCustomization(select) {
  const [value, setValue] = useState(() => select(readCachedCustomization()));

  useEffect(() => {
    const sync = () => setValue(select(readCachedCustomization()));
    window.addEventListener(LOADED_EVENT, sync);
    refreshSettings();
    return () => window.removeEventListener(LOADED_EVENT, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}
