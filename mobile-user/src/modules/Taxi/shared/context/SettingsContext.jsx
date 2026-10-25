// Web: modules/Taxi/shared/context/SettingsContext.jsx — the Taxi start-up settings (GET /users/bootstrap), cached in
// localStorage (appSettingsCache:v1) so the first Taxi screen has them at once, refreshed on resume / online / focus.
// Not reproduced (no DOM): document.title and the admin theme CSS variables on <html> (admin panel only).
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../api/axiosInstance';
import { BACKEND_ORIGIN } from '../api/runtimeConfig';
import { preloadBannerImage } from '@/shared/utils/bannerImage';

const SETTINGS_CACHE_KEY = 'appSettingsCache:v1';

export const normalizeAssetUrl = (url = '') => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${BACKEND_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const DEFAULT_SETTINGS_CONTEXT = {
  settings: {
    general: {
      app_name: 'Hello Parth Taxi',
      logo: '',
      favicon: '',
    },
    customization: {
      admin_theme_color: '',
      currency_symbol: '',
    },
    transportRide: {
      enable_bus_service: '0',
    },
    bidRide: {
      bidding_low_percentage: '10',
      bidding_high_percentage: '20',
      bidding_amount_increase_or_decrease: '10',
      user_bidding_low_percentage: '10',
      user_bidding_high_percentage: '20',
      user_bidding_amount_increase_or_decrease: '10',
      user_fare_increase_wait_minutes: '2',
    },
    paymentGateway: null,
    userHomeSettings: {},
    homeBanner: {},
  },
  modules: [],
  loading: true,
  hasBootstrapSettings: false,
  settingsFresh: false,
  refreshSettings: () => {},
};
const SettingsContext = createContext(DEFAULT_SETTINGS_CONTEXT);

const normalizeBooleanSetting = (value, fallback = '0') => {
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'number') {
    return value === 1 ? '1' : '0';
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
    return '1';
  }

  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
    return '0';
  }

  return fallback;
};

const normalizeTransportRideSettings = (settings = {}) => ({
  ...settings,
  enable_bus_service: normalizeBooleanSetting(settings?.enable_bus_service, '0'),
});

const buildSettingsState = (payload = {}) => ({
  general: {
    ...(payload?.general || {}),
    logo: normalizeAssetUrl(payload?.general?.logo),
    favicon: normalizeAssetUrl(payload?.general?.favicon),
  },
  customization: payload?.customization || {},
  transportRide: normalizeTransportRideSettings(payload?.transportRide || {}),
  bidRide: payload?.bidRide || DEFAULT_SETTINGS_CONTEXT.settings.bidRide,
  paymentGateway: payload?.paymentGateway || null,
  userHomeSettings: payload?.userHomeSettings || {},
  homeBanner: payload?.homeBanner || {},
});

const readCachedSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return buildSettingsState(parsed);
  } catch {
    return null;
  }
};

const writeCachedSettings = (settings) => {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Cache writes are best-effort only.
  }
};

const settingsFromBootstrap = (data = {}) =>
  buildSettingsState({
    general: data.settings?.general || {},
    customization: data.settings?.customization || {},
    transportRide: data.settings?.transportRide || {},
    bidRide: data.settings?.bidRide || DEFAULT_SETTINGS_CONTEXT.settings.bidRide,
    paymentGateway: data.settings?.paymentGateway || null,
    userHomeSettings: data.settings?.userHomeSettings || {},
    homeBanner: data.settings?.homeBanner || {},
  });

// When the start-up settings last arrived (from the provider or from the warm-up below). While they are recent, the
// Taxi home knows for sure whether a banner image is uploaded and does not have to wait for them again.
const FRESH_FOR_MS = 5 * 60 * 1000;
let bootstrapArrivedAt = 0;
const bootstrapIsFresh = () => bootstrapArrivedAt > 0 && Date.now() - bootstrapArrivedAt < FRESH_FOR_MS;

/**
 * Starts downloading the Taxi home banner ahead of time: the uploaded picture when there is one, otherwise the
 * default design's vehicle picture.
 */
const warmHomeBanner = (settings) => {
  const uploaded = normalizeAssetUrl(settings?.homeBanner?.taxiImageUrl);
  if (uploaded) {
    preloadBannerImage(uploaded);
    return;
  }
  import('../../modules/user/components/TaxiHeroBanner').then((mod) => mod.preloadHeroArt()).catch(() => {});
};

/**
 * Downloads the public start-up settings ahead of time (the login screen calls this while the person types their
 * number; Food calls it too) and stores them in the cache SettingsProvider reads when Taxi opens. Needs no login;
 * never throws.
 */
export const prefetchTaxiSettings = async () => {
  if (bootstrapIsFresh()) {
    warmHomeBanner(readCachedSettings());
    return;
  }
  try {
    // Warm-up read made from the OTHER app (Food): runs behind that screen's own requests.
    const response = await api.get('/users/bootstrap', { background: true });
    const fresh = settingsFromBootstrap(response?.data?.data || response?.data || {});
    writeCachedSettings(fresh);
    bootstrapArrivedAt = Date.now();
    warmHomeBanner(fresh);
  } catch {
    // purely an optimisation
    warmHomeBanner(readCachedSettings());
  }
};

export const SettingsProvider = ({ children }) => {
  const [cachedSettings] = useState(readCachedSettings);
  const [settings, setSettings] = useState(cachedSettings || DEFAULT_SETTINGS_CONTEXT.settings);
  // Cached settings already have something to show — no loading state just because a background refresh will run.
  const [loading, setLoading] = useState(!cachedSettings);
  const [hasBootstrapSettings, setHasBootstrapSettings] = useState(Boolean(cachedSettings));
  // True once there is an answer from the server (not just the saved copy): only then is it certain whether a home
  // banner image is uploaded. Stays true when the provider is mounted again within a few minutes.
  const [settingsFresh, setSettingsFresh] = useState(bootstrapIsFresh);
  const [modules, setModules] = useState([]);

  const lastFetchAtRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchSettings = async () => {
    lastFetchAtRef.current = Date.now();
    try {
      const response = await api.get('/users/bootstrap');
      const data = response?.data?.data || response?.data || {};

      const nextSettings = settingsFromBootstrap(data);
      writeCachedSettings(nextSettings);
      bootstrapArrivedAt = Date.now();
      if (!mountedRef.current) return;

      setSettings(nextSettings);
      setModules(data.modules || []);
      setHasBootstrapSettings(true);
    } catch (err) {
      console.error('[SettingsContext] Failed to fetch bootstrap settings:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        // Also after a failure: the answer is not coming, so show what is saved (or the default banner).
        setSettingsFresh(true);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchSettings();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Skip resume-refreshes that land within a few seconds of the last fetch.
    const MIN_REFRESH_GAP_MS = 4000;
    const refreshOnResume = () => {
      if (Date.now() - lastFetchAtRef.current < MIN_REFRESH_GAP_MS) return;
      fetchSettings();
    };

    window.addEventListener('pageshow', refreshOnResume);
    window.addEventListener('online', refreshOnResume);
    window.addEventListener('focus', refreshOnResume);

    return () => {
      window.removeEventListener('pageshow', refreshOnResume);
      window.removeEventListener('online', refreshOnResume);
      window.removeEventListener('focus', refreshOnResume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSettings = () => fetchSettings();

  return (
    <SettingsContext.Provider value={{ settings, modules, loading, hasBootstrapSettings, settingsFresh, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  return useContext(SettingsContext);
};
