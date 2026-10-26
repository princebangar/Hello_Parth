// Browser globals the ported (non-UI) web code relies on, backed by native modules.
// Loaded first from index.js, before any app module is evaluated.
//
// What is provided: localStorage/sessionStorage, window/document events (CustomEvent, visibilitychange, online/offline),
// window.location (reflects the current Expo Router route, origin = the production site), window.open,
// navigator.geolocation (expo-location, foreground only), navigator.onLine, navigator.clipboard, navigator.share,
// navigator.vibrate, matchMedia('(prefers-color-scheme: dark)') and import.meta.env (as globalThis.__ENV__).
// What is NOT provided on purpose: the DOM (document.getElementById, createElement, ...). Screens must not use it.
import { Alert, AppState, Appearance, Dimensions, Linking, Share, Vibration } from 'react-native';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as Network from 'expo-network';
import { ENV } from '../config/env';
import { localStorageShim, sessionStorageShim } from './storage';

const g = globalThis;

// React Native defines some of these globals itself, read-only (e.g. navigator in RN 0.88: a plain assignment throws
// "Cannot assign to read-only property" and stops the app at start). Every global is therefore set with
// defineProperty; a property React Native has locked for good is left as it is (with a warning) instead of crashing.
function setProp(obj, key, value) {
  try {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    if (d && !d.configurable) {
      if ('value' in d && d.writable) {
        obj[key] = value;
        return true;
      }
      if (d.value === value) return true;
      console.warn(`[webCompat] ${key} is locked by React Native; left unchanged`);
      return false;
    }
    Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true });
    return true;
  } catch (err) {
    console.warn(`[webCompat] could not set ${key}`, err);
    return false;
  }
}

setProp(g, '__ENV__', ENV);

// ---------------------------------------------------------------- events
class EventShim {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
    this.defaultPrevented = false;
    this.timeStamp = Date.now();
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {}
  stopImmediatePropagation() {}
}

const makeTarget = () => {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (typeof fn !== 'function' && typeof fn?.handleEvent !== 'function') return;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(event) {
      const set = listeners.get(event?.type);
      if (!set) return true;
      for (const fn of [...set]) {
        try {
          if (typeof fn === 'function') fn(event);
          else fn.handleEvent(event);
        } catch (err) {
          console.warn(`[webCompat] "${event.type}" listener failed`, err);
        }
      }
      return !event.defaultPrevented;
    },
  };
};

if (typeof g.Event === 'undefined') setProp(g, 'Event', EventShim);
if (typeof g.CustomEvent === 'undefined') setProp(g, 'CustomEvent', EventShim);

const windowTarget = makeTarget();
const documentTarget = makeTarget();
setProp(g, 'addEventListener', windowTarget.addEventListener);
setProp(g, 'removeEventListener', windowTarget.removeEventListener);
setProp(g, 'dispatchEvent', windowTarget.dispatchEvent);

// RN's `window` is the global object already; make sure it is.
if (typeof g.window === 'undefined') setProp(g, 'window', g);

// ---------------------------------------------------------------- storage
// Web code checks `typeof Storage === 'undefined'` before saving a session ("localStorage is not available").
function StorageShim() {}
if (typeof g.Storage === 'undefined') setProp(g, 'Storage', StorageShim);
setProp(g, 'localStorage', localStorageShim);
setProp(g, 'sessionStorage', sessionStorageShim);

// ---------------------------------------------------------------- location (fed by src/lib/router.js)
const SITE_ORIGIN = String(ENV.VITE_PUBLIC_APP_URL || 'https://helloparth.in').replace(/\/$/, '');
const route = { pathname: '/', search: '' };
export const setCompatRoute = (pathname, search = '') => {
  route.pathname = pathname || '/';
  route.search = search ? (search.startsWith('?') ? search : `?${search}`) : '';
};
let navigateHandler = null;
export const setCompatNavigate = (fn) => {
  navigateHandler = fn;
};
const goTo = (href, replace) => {
  const value = String(href || '');
  const isOtherScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:/i.test(value); // tel:, sms:, mailto:, upi:, intent:
  if (isOtherScheme || (/^https?:\/\//i.test(value) && !value.startsWith(SITE_ORIGIN))) {
    Linking.openURL(value).catch(() => {});
    return;
  }
  const path = value.startsWith(SITE_ORIGIN) ? value.slice(SITE_ORIGIN.length) || '/' : value;
  navigateHandler?.(path, { replace });
};
const hostname = SITE_ORIGIN.replace(/^https?:\/\//, '');
setProp(g, 'location', {
  get href() {
    return `${SITE_ORIGIN}${route.pathname}${route.search}`;
  },
  set href(v) {
    goTo(v, false);
  },
  get pathname() {
    return route.pathname;
  },
  get search() {
    return route.search;
  },
  hash: '',
  origin: SITE_ORIGIN,
  protocol: 'https:',
  host: hostname,
  hostname,
  port: '',
  assign: (v) => goTo(v, false),
  replace: (v) => goTo(v, true),
  reload: () => {},
  toString() {
    return this.href;
  },
});
setProp(g, 'history', g.history || {
  get length() {
    return 1;
  },
  state: null,
  back: () => navigateHandler?.(-1),
  go: (n) => navigateHandler?.(n),
  pushState: () => {},
  replaceState: () => {},
});

setProp(g, 'open', (url) => {
  if (url) Linking.openURL(String(url)).catch(() => {});
  return null;
});
setProp(g, 'scrollTo', g.scrollTo || (() => {}));
setProp(g, 'requestIdleCallback', g.requestIdleCallback || ((cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 1)));
setProp(g, 'cancelIdleCallback', g.cancelIdleCallback || ((id) => clearTimeout(id)));

try {
  Object.defineProperty(g, 'innerWidth', { configurable: true, get: () => Dimensions.get('window').width });
} catch {
  // locked by React Native
}
try {
  Object.defineProperty(g, 'innerHeight', { configurable: true, get: () => Dimensions.get('window').height });
} catch {
  // locked by React Native
}

setProp(g, 'matchMedia', (query) => {
  const q = String(query || '');
  const evaluate = () => {
    if (q.includes('prefers-color-scheme: dark')) return Appearance.getColorScheme() === 'dark';
    if (q.includes('display-mode: standalone')) return true;
    const max = /max-width:\s*(\d+)px/.exec(q);
    if (max) return Dimensions.get('window').width <= Number(max[1]);
    const min = /min-width:\s*(\d+)px/.exec(q);
    if (min) return Dimensions.get('window').width >= Number(min[1]);
    return false;
  };
  const listeners = new Set();
  let sub = null;
  const mql = {
    media: q,
    get matches() {
      return evaluate();
    },
    addEventListener: (_t, fn) => {
      listeners.add(fn);
      if (!sub && q.includes('prefers-color-scheme')) {
        sub = Appearance.addChangeListener(() => listeners.forEach((l) => l({ matches: evaluate(), media: q })));
      }
    },
    removeEventListener: (_t, fn) => {
      listeners.delete(fn);
      if (!listeners.size && sub) {
        sub.remove();
        sub = null;
      }
    },
  };
  mql.addListener = (fn) => mql.addEventListener('change', fn);
  mql.removeListener = (fn) => mql.removeEventListener('change', fn);
  return mql;
});

// ---------------------------------------------------------------- document (events + visibility only)
let visibilityState = AppState.currentState === 'active' ? 'visible' : 'hidden';
setProp(g, 'document', {
  get visibilityState() {
    return visibilityState;
  },
  get hidden() {
    return visibilityState !== 'visible';
  },
  addEventListener: documentTarget.addEventListener,
  removeEventListener: documentTarget.removeEventListener,
  dispatchEvent: documentTarget.dispatchEvent,
});
AppState.addEventListener('change', (state) => {
  const next = state === 'active' ? 'visible' : 'hidden';
  if (next === visibilityState) return;
  visibilityState = next;
  documentTarget.dispatchEvent(new EventShim('visibilitychange'));
  windowTarget.dispatchEvent(new EventShim(next === 'visible' ? 'focus' : 'blur'));
  // No pagehide/pageshow: in a browser those mean the page is unloaded, and web code clears caches on them.
  // Going to the background keeps the app (and its memory) alive, like a hidden tab.
});

setProp(g, 'alert', (message) => Alert.alert('', String(message ?? '')));

// ---------------------------------------------------------------- navigator
// React Native's own navigator ({ product: 'ReactNative' ... }) is kept and extended; if it cannot be extended, a new
// object that inherits from it becomes the global navigator.
let nav = g.navigator;
if (!nav || !Object.isExtensible(nav)) {
  nav = Object.create(nav || null);
  setProp(g, 'navigator', nav);
}
let online = true;
Network.getNetworkStateAsync()
  .then((s) => {
    online = s.isConnected !== false && s.isInternetReachable !== false;
  })
  .catch(() => {});
Network.addNetworkStateListener?.((s) => {
  const next = s.isConnected !== false && s.isInternetReachable !== false;
  if (next === online) return;
  online = next;
  windowTarget.dispatchEvent(new EventShim(next ? 'online' : 'offline'));
});
try {
  Object.defineProperty(nav, 'onLine', { configurable: true, get: () => online });
} catch {
  // locked by React Native
}
setProp(nav, 'userAgent', nav.userAgent || 'HelloParthNative/1.0 (Android)');
setProp(nav, 'vibrate', (pattern) => {
  try {
    Vibration.vibrate(pattern ?? 200);
    return true;
  } catch {
    return false;
  }
});
setProp(nav, 'clipboard', { writeText: (text) => Clipboard.setStringAsync(String(text ?? '')), readText: () => Clipboard.getStringAsync() });
setProp(nav, 'share', async ({ title, text, url } = {}) => {
  const message = [text, url].filter(Boolean).join('\n');
  await Share.share({ title, message: message || title || '' });
});
setProp(nav, 'canShare', () => true);

// Geolocation, shaped like the W3C API the web screens call. Foreground only.
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;
const geoError = (code, message) => ({ code, message, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT });
const toPosition = (loc) => ({
  coords: {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 0,
    altitude: loc.coords.altitude ?? null,
    altitudeAccuracy: loc.coords.altitudeAccuracy ?? null,
    heading: loc.coords.heading ?? null,
    speed: loc.coords.speed ?? null,
  },
  timestamp: loc.timestamp || Date.now(),
});
const ensurePermission = async () => {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted;
};
const accuracyFor = (options) => (options?.enableHighAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced);
const watches = new Map();
let watchSeq = 1;
setProp(nav, 'geolocation', {
  getCurrentPosition(success, error, options = {}) {
    (async () => {
      if (!(await ensurePermission())) throw geoError(PERMISSION_DENIED, 'User denied Geolocation');
      if (options.maximumAge > 0) {
        const last = await Location.getLastKnownPositionAsync({ maxAge: options.maximumAge }).catch(() => null);
        if (last) return last;
      }
      const timeout = Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : 30000;
      return Promise.race([
        Location.getCurrentPositionAsync({ accuracy: accuracyFor(options) }),
        new Promise((_, reject) => setTimeout(() => reject(geoError(TIMEOUT, 'Timeout expired')), timeout)),
      ]);
    })()
      .then((loc) => success?.(toPosition(loc)))
      .catch((err) => error?.(err?.code ? err : geoError(POSITION_UNAVAILABLE, String(err?.message || err))));
  },
  watchPosition(success, error, options = {}) {
    const id = watchSeq++;
    watches.set(id, null);
    (async () => {
      if (!(await ensurePermission())) throw geoError(PERMISSION_DENIED, 'User denied Geolocation');
      const sub = await Location.watchPositionAsync(
        { accuracy: accuracyFor(options), distanceInterval: 5, timeInterval: 3000 },
        (loc) => success?.(toPosition(loc)),
      );
      if (watches.has(id)) watches.set(id, sub);
      else sub.remove();
    })().catch((err) => error?.(err?.code ? err : geoError(POSITION_UNAVAILABLE, String(err?.message || err))));
    return id;
  },
  clearWatch(id) {
    const sub = watches.get(id);
    sub?.remove?.();
    watches.delete(id);
  },
});
setProp(nav, 'permissions', {
  async query({ name } = {}) {
    let state = 'prompt';
    if (name === 'geolocation') {
      const p = await Location.getForegroundPermissionsAsync().catch(() => null);
      state = p?.granted ? 'granted' : p && !p.canAskAgain ? 'denied' : 'prompt';
    }
    return { state, onchange: null, addEventListener() {}, removeEventListener() {} };
  },
});
