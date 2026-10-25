// Native port of the web's browse scroll memory (Home / category / under-250 lists).
// The web saved and restored `window.scrollY`; in the app every browse page scrolls its own FlatList / ScrollView.
// A page registers its list here (registerBrowseScroller) and reports its offset (reportBrowseScroll); the same
// save / peek / consume / restore API as the web then works against that list.
//
//   const listRef = useRef(null)
//   useEffect(() => registerBrowseScroller(path, {
//     scrollTo: (y) => listRef.current?.scrollToOffset({ offset: y, animated: false }),
//     getContentHeight: () => contentHeightRef.current,
//     getViewportHeight: () => viewportHeightRef.current,
//     scrollToFocus: (focusId) => false, // optional: scroll to a card by its focus id, return true when done
//   }), [path])
//   <FlatList onScroll={(e) => reportBrowseScroll(path, e.nativeEvent.contentOffset.y)}
//             onScrollBeginDrag={notifyBrowseUserIntent} ... />
import { getAppRoutePath } from '@/shared/utils/nativeShell'
const STORAGE_KEY = "food_browse_scroll_v1";
const CATEGORY_BACKUP_KEY = "food_category_browse_backup_v1";

/** In-memory last category→restaurant click — only overwritten on click, never cleared on restore. */
let categoryLastClickMemory = null;

/** Set true on every category restaurant click; cleared after scroll lock finishes. */
let categoryNeedsRestore = false;

/** Last known list scroll while category browse was visible. */
let lastCategoryWindowScrollY = 0;

let activeCategoryScrollLockCancel = null;

// ------------------------------------------------------------------ native list registry
/** normalized path -> { scrollTo, getContentHeight, getViewportHeight, scrollToFocus, lastY } */
const scrollers = new Map();
let activeScrollerPath = null;
/** Running restores listen here; any real drag/touch on a browse list cancels them (web: wheel/touch/pointer). */
const userIntentListeners = new Set();

/** Normalize paths so /food/user and /user match. */
export const normalizeBrowsePath = (path = "") => {
  let p = String(path).split("?")[0].trim();
  if (!p) return "/user";
  if (p.startsWith("/food")) p = p.slice(5) || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p === "/" || p === "/user" || p === "/user/home" || p === "/home") {
    return "/user";
  }
  if (p.endsWith("/") && p.length > 1) p = p.slice(0, -1);
  return p;
};

const CATEGORY_PATH_RE = /^\/user\/category\//;

/** Register the scrolling list of a browse page. Returns the unregister function (call it on unmount). */
export const registerBrowseScroller = (path, scroller) => {
  const key = normalizeBrowsePath(path);
  const entry = { lastY: 0, ...scroller };
  const prev = scrollers.get(key);
  if (prev && Number.isFinite(prev.lastY)) entry.lastY = prev.lastY;
  scrollers.set(key, entry);
  activeScrollerPath = key;
  return () => {
    if (scrollers.get(key) === entry) scrollers.delete(key);
    if (activeScrollerPath === key) activeScrollerPath = null;
  };
};

/** Mark a registered list as the visible one (keep-alive pages call this when they become active). */
export const setActiveBrowseScroller = (path) => {
  activeScrollerPath = normalizeBrowsePath(path);
};

/** Lists call this from onScroll with contentOffset.y (web: window scroll events). */
export const reportBrowseScroll = (path, scrollY) => {
  const key = normalizeBrowsePath(path);
  const y = Number(scrollY);
  if (!Number.isFinite(y)) return;
  const entry = scrollers.get(key);
  if (entry) entry.lastY = Math.max(0, y);
  if (CATEGORY_PATH_RE.test(key)) trackCategoryWindowScrollY(Math.max(0, y));
};

/** Lists call this from onScrollBeginDrag / onTouchStart — a user gesture always wins over a restore. */
export const notifyBrowseUserIntent = () => {
  Array.from(userIntentListeners).forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
};

const findScroller = (path) => {
  const key = path ? normalizeBrowsePath(path) : null;
  if (key && scrollers.has(key)) return scrollers.get(key);
  if (key && CATEGORY_PATH_RE.test(key)) {
    for (const [k, v] of scrollers) {
      if (CATEGORY_PATH_RE.test(k)) return v;
    }
  }
  if (!key && activeScrollerPath && scrollers.has(activeScrollerPath)) return scrollers.get(activeScrollerPath);
  return null;
};

/** Current offset of the visible browse list (web: window.scrollY). */
export const getBrowseScrollY = (path) => {
  const s = findScroller(path) || (activeScrollerPath ? scrollers.get(activeScrollerPath) : null);
  return Math.max(0, Number(s?.lastY) || 0);
};

const maxScrollOf = (s) =>
  Math.max(0, (Number(s?.getContentHeight?.()) || 0) - (Number(s?.getViewportHeight?.()) || 0));

const toScrollY = (scrollY) => {
  const n = Number(scrollY);
  if (Number.isFinite(n) && n >= 0) return n;
  return getBrowseScrollY();
};

export const trackCategoryWindowScrollY = (scrollY) => {
  const y = Number(scrollY);
  if (Number.isFinite(y) && y >= 0) {
    lastCategoryWindowScrollY = y;
  }
};

export const saveBrowseScroll = ({ path, scrollY, focusId, visibleCount } = {}) => {
  try {
    const normalizedPath = normalizeBrowsePath(path || getAppRoutePath());
    const isCategory = normalizedPath.includes("/category/");
    const payload = {
      path: normalizedPath,
      scrollY: isCategory
        ? Math.max(toScrollY(scrollY), lastCategoryWindowScrollY)
        : toScrollY(scrollY),
      focusId: focusId != null && focusId !== "" ? String(focusId) : null,
      ts: Date.now(),
    };
    const count = Number(visibleCount);
    if (Number.isFinite(count) && count > 0) {
      payload.visibleCount = Math.floor(count);
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    if (isCategory) {
      // Track last Y for restaurant-back restore, but do NOT arm
      // categoryNeedsRestore here — only explicit restaurant clicks should.
      lastCategoryWindowScrollY = payload.scrollY;
      sessionStorage.setItem(CATEGORY_BACKUP_KEY, JSON.stringify(payload));
    }
  } catch {
    // ignore
  }
};

/** Explicit category click save — always updates durable memory + restore flag. */
export const saveCategoryBrowseClick = ({ path, scrollY, focusId, visibleCount } = {}) => {
  const y = Math.max(toScrollY(scrollY), lastCategoryWindowScrollY);
  const payload = {
    path: normalizeBrowsePath(path || "/user/category/all"),
    scrollY: y,
    focusId: focusId != null && focusId !== "" ? String(focusId) : null,
    visibleCount:
      Number.isFinite(Number(visibleCount)) && Number(visibleCount) > 0
        ? Math.floor(Number(visibleCount))
        : undefined,
    ts: Date.now(),
  };
  categoryLastClickMemory = payload;
  categoryNeedsRestore = true;
  lastCategoryWindowScrollY = y;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    sessionStorage.setItem(CATEGORY_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  return payload;
};

export const getCategoryLastClick = () => {
  if (categoryLastClickMemory) return categoryLastClickMemory;
  return peekCategoryBrowseBackup();
};

export const categoryBrowseNeedsRestore = () => categoryNeedsRestore;

export const markCategoryBrowseRestored = () => {
  categoryNeedsRestore = false;
};

/** Scroll the list to the saved Y (or to the focused card when the list is not that long yet). */
const applyScroll = (scroller, targetY, focusId) => {
  if (!scroller) return;
  const maxScroll = maxScrollOf(scroller);
  if (focusId && targetY > maxScroll + 40) {
    if (scroller.scrollToFocus?.(focusId) === true) return;
    scroller.scrollTo?.(Math.min(targetY, maxScroll));
    return;
  }
  scroller.scrollTo?.(targetY);
};

/**
 * One-shot scroll restore after category becomes visible.
 * Stops as soon as position settles OR the user touches — never fights taps.
 */
export const runCategoryScrollLock = ({ durationMs = 100 } = {}) => {
  activeCategoryScrollLockCancel?.();

  const seed = getCategoryLastClick();
  if (!seed) return () => {};

  const start = Date.now();
  let cancelled = false;
  let rafId = 0;
  let userInterrupted = false;
  let frames = 0;

  const scrollerFor = () => findScroller(seed.path) || findScroller();

  const detachUserListeners = () => {
    userIntentListeners.delete(onUserIntent);
  };

  const finish = () => {
    if (cancelled) return;
    cancelled = true;
    markCategoryBrowseRestored();
    if (rafId) cancelAnimationFrame(rafId);
    detachUserListeners();
    if (activeCategoryScrollLockCancel === cancel) {
      activeCategoryScrollLockCancel = null;
    }
  };

  const apply = () => {
    if (cancelled || userInterrupted) return;
    const pending = getCategoryLastClick() || seed;
    const targetY = Math.max(0, Number(pending.scrollY) || lastCategoryWindowScrollY || 0);
    const focusId = pending.focusId ? String(pending.focusId) : null;
    applyScroll(scrollerFor(), targetY, focusId);
  };

  // Any real user gesture wins immediately — continuous scrollTo steals taps.
  function onUserIntent() {
    if (cancelled) return;
    userInterrupted = true;
    finish();
  }

  userIntentListeners.add(onUserIntent);

  const tick = () => {
    if (cancelled || userInterrupted) return;
    frames += 1;
    // Only re-apply a few times while layout expands — not every frame forever.
    if (frames <= 6 || frames % 3 === 0) apply();
    const pending = getCategoryLastClick() || seed;
    const targetY = Math.max(0, Number(pending.scrollY) || lastCategoryWindowScrollY || 0);
    const currentY = Number(scrollerFor()?.lastY) || 0;
    const settled = Math.abs(currentY - targetY) <= 12 && Date.now() - start > 24;
    if (settled || Date.now() - start >= durationMs) {
      finish();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  apply();
  rafId = requestAnimationFrame(tick);

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
    detachUserListeners();
    if (activeCategoryScrollLockCancel === cancel) {
      activeCategoryScrollLockCancel = null;
    }
  }

  activeCategoryScrollLockCancel = cancel;
  return cancel;
};

export const peekBrowseScroll = (path) => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.ts && Date.now() - Number(data.ts) > 30 * 60 * 1000) return null;

    const want = normalizeBrowsePath(path);
    const got = normalizeBrowsePath(data.path);
    if (want === got) return data;

    if (CATEGORY_PATH_RE.test(want) && CATEGORY_PATH_RE.test(got)) return data;

    return null;
  } catch {
    return null;
  }
};

export const peekBrowseScrollAny = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.ts && Date.now() - Number(data.ts) > 30 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
};

export const peekCategoryBrowseBackup = () => {
  try {
    const raw = sessionStorage.getItem(CATEGORY_BACKUP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.ts && Date.now() - Number(data.ts) > 30 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
};

export const consumeBrowseScroll = (path) => {
  const data = peekBrowseScroll(path) || peekBrowseScrollAny();
  if (!data) return null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return data;
};

export const clearBrowseScroll = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

/**
 * Restore the exact list offset (no scroll-to-card centring).
 * Retries briefly while lazy lists expand; any user touch cancels immediately.
 */
export const restoreBrowseScroll = (saved, { retries = 12, onDone } = {}) => {
  if (!saved) {
    onDone?.(false);
    return () => {};
  }

  const targetY = Math.max(0, Number(saved.scrollY) || 0);
  const focusId = saved.focusId ? String(saved.focusId) : null;
  let attempt = 0;
  let cancelled = false;
  let rafId = 0;

  const scrollerFor = () => findScroller(saved.path) || findScroller();

  const detachUserListeners = () => {
    userIntentListeners.delete(onUserIntent);
  };

  const stop = (ok) => {
    if (cancelled) return;
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
    detachUserListeners();
    onDone?.(ok);
  };

  function onUserIntent() {
    stop(false);
  }

  const apply = () => {
    if (cancelled) return;
    applyScroll(scrollerFor(), targetY, focusId);
  };

  const run = () => {
    if (cancelled) return;
    attempt += 1;
    if (attempt <= 4 || attempt % 3 === 0) apply();

    const scroller = scrollerFor();
    const maxScroll = maxScrollOf(scroller);
    const closeEnough = Math.abs((Number(scroller?.lastY) || 0) - targetY) <= 12;
    const canReach = targetY <= maxScroll + 24;
    const focusReached = Boolean(focusId && scroller?.scrollToFocus && attempt >= 4);

    if (closeEnough || (canReach && attempt >= 3) || focusReached || attempt >= retries) {
      if (!cancelled) apply();
      stop(closeEnough || canReach || focusReached);
      return;
    }

    rafId = requestAnimationFrame(run);
  };

  userIntentListeners.add(onUserIntent);

  apply();
  rafId = requestAnimationFrame(run);

  return () => stop(false);
};
