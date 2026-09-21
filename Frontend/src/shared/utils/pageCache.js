/**
 * Session-scoped page cache — shared by Food and Taxi user home pages.
 * In-memory first (instant remounts when switching Food <-> Taxi, since
 * each unmounts the other's component tree); sessionStorage mirrors it so a
 * hard reload within the same tab also stays warm. Cleared on tab close.
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

let listenersRegistered = false;

export function registerPageCacheLifecycle() {
  if (listenersRegistered || typeof window === "undefined") return;
  listenersRegistered = true;
  window.addEventListener("pagehide", () => {
    MEMORY.clear();
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
      });
    } catch {
      /* ignore */
    }
  });
}
