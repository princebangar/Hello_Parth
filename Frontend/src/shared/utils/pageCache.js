/**
 * Session-scoped page cache — shared by Food and Taxi user home pages.
 * In-memory first (instant remounts when switching Food <-> Taxi, since
 * each unmounts the other's component tree); sessionStorage mirrors it so a
 * reload / hard reload within the same tab also stays warm. sessionStorage goes away with the tab, and anything
 * older than 30 minutes is dropped at start-up (it used to be wiped on every "pagehide", which also fires on reload).
 *
 * Mirrors Food's `foodPageCache.js` pattern (that file stays as-is — it's
 * working and used in many places — this is the generic version for
 * anything new, including Taxi).
 */

const MEMORY = new Map();
const CACHE_PREFIX = "app_page_cache_";

export function getPageCache(key) {
  if (MEMORY.has(key)) {
    return MEMORY.get(key);
  }
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    MEMORY.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function setPageCache(key, data) {
  MEMORY.set(key, data);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(data));
  } catch {
    /* quota exceeded — in-memory still works */
  }
}

export function removePageCache(key) {
  MEMORY.delete(key);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
}

const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const CACHE_STARTED_AT_KEY = "app_page_cache_started_at";

/** Keeps a reload warm but drops a cache that has been around for too long. Safe to call many times. */
export function registerPageCacheLifecycle() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const startedAt = Number(sessionStorage.getItem(CACHE_STARTED_AT_KEY) || 0);
    if (startedAt && Date.now() - startedAt <= CACHE_MAX_AGE_MS) return;
    MEMORY.clear();
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
    });
    sessionStorage.setItem(CACHE_STARTED_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Cache key that is private to the signed-in customer, so a wallet / order list cached for one account is never shown
 * to the next account that signs in on the same tab.
 */
export function userScopedCacheKey(base) {
  let id = "anon";
  try {
    for (const storageKey of ["user_user", "userInfo"]) {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
      const found = parsed?._id || parsed?.id;
      if (found) {
        id = String(found);
        break;
      }
    }
  } catch {
    /* anonymous cache */
  }
  return `${base}:${id}`;
}

// Start-up pruning happens as soon as the module is loaded, whoever reads the cache first.
registerPageCacheLifecycle();
