// Native version of the web's theme helper. Same keys, events and exports; instead of toggling the <html> class the
// app's ThemeProvider (src/theme) listens to THEME_CHANGE_EVENT and re-renders in light or dark.
// `USER_THEME_KEY` is the single source of truth for the Food+Taxi user app's theme; the other keys are read-only
// fallbacks for values saved before that consolidation.
export const FOOD_USER_THEME_KEY = 'foodUserTheme';
export const APP_THEME_KEY = 'appTheme';
export const USER_THEME_KEY = 'userTheme';
export const TAXI_USER_THEME_KEY = 'userAppTheme';
export const THEME_CHANGE_EVENT = 'helloparth:theme-change';

const LEGACY_USER_THEME_KEYS = [FOOD_USER_THEME_KEY, APP_THEME_KEY, TAXI_USER_THEME_KEY];

export function normalizeTheme(theme) {
  return String(theme || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

export function getFoodUserTheme() {
  const primary = localStorage.getItem(USER_THEME_KEY);
  if (primary) return normalizeTheme(primary);
  for (const key of LEGACY_USER_THEME_KEYS) {
    const stored = localStorage.getItem(key);
    if (stored) return normalizeTheme(stored);
  }
  return 'light';
}

/** No DOM in the app: the ThemeProvider renders the theme. Kept for callers. */
export function applyTheme(theme) {
  return normalizeTheme(theme);
}

export function applyFoodUserTheme() {
  return getFoodUserTheme();
}

export function saveFoodUserTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  localStorage.setItem(USER_THEME_KEY, normalizedTheme);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: normalizedTheme } }));
  return normalizedTheme;
}

// Admin, driver/owner and auth screens are light-mode only on the web (wrap them in <ForceLight> from src/theme).
export function applySavedTheme() {
  return 'light';
}

export function reassertFoodUserTheme() {
  const theme = getFoodUserTheme();
  localStorage.setItem(USER_THEME_KEY, theme);
  return theme;
}

export function isUserAppPath(pathname = '') {
  const path = String(pathname || '');
  return path.startsWith('/food/') || path.startsWith('/taxi/user');
}

export function syncThemeForPath(pathname = '') {
  return isUserAppPath(pathname) ? reassertFoodUserTheme() : applySavedTheme();
}

export function cancelScheduledFoodThemeReassert() {}

export function scheduleFoodThemeReassert() {
  reassertFoodUserTheme();
}
