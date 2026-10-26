// Synchronous localStorage / sessionStorage for the ported web code.
// - Values live in memory so getItem() stays synchronous, exactly like the browser API the web code was written for.
// - Auth tokens (any key with "token" in it) are persisted in SecureStore, everything else in AsyncStorage.
// - sessionStorage is memory only: it is empty again after the app is closed, like a WebView page session.
// hydrateStorage() must finish before the first screen renders (the root layout waits for it).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const PREFIX = 'ls:';
const SECURE_INDEX_KEY = 'ls-secure-index';
const isSecureKey = (key) => /token/i.test(String(key));
// SecureStore keys may only hold letters, digits, ".", "-" and "_".
const secureKeyFor = (key) => `ls_${String(key).replace(/[^A-Za-z0-9._-]/g, '_')}`;

const local = new Map();
const secureKeys = new Set();
let hydrated = false;

const persistSecureIndex = () => {
  AsyncStorage.setItem(SECURE_INDEX_KEY, JSON.stringify([...secureKeys])).catch(() => {});
};

export async function hydrateStorage() {
  if (hydrated) return;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
    for (const [k, v] of pairs) if (v != null) local.set(k.slice(PREFIX.length), v);
  } catch {
    // unreadable storage: start empty
  }
  try {
    const index = JSON.parse((await AsyncStorage.getItem(SECURE_INDEX_KEY)) || '[]');
    await Promise.all(
      index.map(async (key) => {
        const v = await SecureStore.getItemAsync(secureKeyFor(key));
        if (v != null) {
          local.set(key, v);
          secureKeys.add(key);
        }
      }),
    );
  } catch {
    // no tokens stored
  }
  hydrated = true;
}

export const isStorageHydrated = () => hydrated;

function makeStorage({ persist, mem }) {
  return {
    get length() {
      return mem.size;
    },
    key(i) {
      return [...mem.keys()][i] ?? null;
    },
    getItem(key) {
      const v = mem.get(String(key));
      return v === undefined ? null : v;
    },
    setItem(key, value) {
      const k = String(key);
      const v = String(value);
      mem.set(k, v);
      if (!persist) return;
      if (isSecureKey(k)) {
        SecureStore.setItemAsync(secureKeyFor(k), v).catch(() => {});
        if (!secureKeys.has(k)) {
          secureKeys.add(k);
          persistSecureIndex();
        }
      } else {
        AsyncStorage.setItem(PREFIX + k, v).catch(() => {});
      }
    },
    removeItem(key) {
      const k = String(key);
      mem.delete(k);
      if (!persist) return;
      if (secureKeys.has(k)) {
        SecureStore.deleteItemAsync(secureKeyFor(k)).catch(() => {});
        secureKeys.delete(k);
        persistSecureIndex();
      } else {
        AsyncStorage.removeItem(PREFIX + k).catch(() => {});
      }
    },
    clear() {
      const keys = [...mem.keys()];
      keys.forEach((k) => this.removeItem(k));
    },
  };
}

// Like the browser's Storage: Object.keys(localStorage) / for..in list the stored keys (not the methods), and
// localStorage.someKey reads an item.
function asBrowserStorage(api, mem) {
  return new Proxy(api, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
      return mem.has(prop) ? mem.get(prop) : undefined;
    },
    set(target, prop, value) {
      if (prop in target || typeof prop === 'symbol') return Reflect.set(target, prop, value);
      target.setItem(prop, value);
      return true;
    },
    deleteProperty(target, prop) {
      target.removeItem(prop);
      return true;
    },
    has(target, prop) {
      return prop in target || mem.has(prop);
    },
    ownKeys() {
      return [...mem.keys()];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (!mem.has(prop)) return undefined;
      return { value: mem.get(prop), writable: true, enumerable: true, configurable: true };
    },
  });
}

const sessionMem = new Map();
export const localStorageShim = asBrowserStorage(makeStorage({ persist: true, mem: local }), local);
export const sessionStorageShim = asBrowserStorage(makeStorage({ persist: false, mem: sessionMem }), sessionMem);
