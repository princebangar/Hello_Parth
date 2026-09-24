// `USER_THEME_KEY` is the single source of truth for the Food+Taxi user
// app's theme — one user, one preference, one key. The other three used to
// each get written on every save; now they're kept only as read fallbacks
// so anyone with an old value saved under one of them doesn't lose their
// preference — new saves land only in USER_THEME_KEY.
export const FOOD_USER_THEME_KEY = "foodUserTheme";
export const APP_THEME_KEY = "appTheme";
export const USER_THEME_KEY = "userTheme";
export const TAXI_USER_THEME_KEY = "userAppTheme";
export const THEME_CHANGE_EVENT = "helloparth:theme-change";

const LEGACY_USER_THEME_KEYS = [FOOD_USER_THEME_KEY, APP_THEME_KEY, TAXI_USER_THEME_KEY];

const THEME_CSS_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--border",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
];

const LIGHT_THEME_VALUES = {
  "--background": "#ffffff",
  "--foreground": "oklch(0.2 0.05 50)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.2 0.05 50)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.2 0.05 50)",
  "--primary": "oklch(0.7 0.15 85)",
  "--primary-foreground": "oklch(0.15 0.05 50)",
  "--secondary": "oklch(0.95 0.02 90)",
  "--secondary-foreground": "oklch(0.3 0.08 60)",
  "--muted": "oklch(0.96 0.01 90)",
  "--muted-foreground": "oklch(0.5 0.05 50)",
  "--accent": "oklch(0.92 0.08 75)",
  "--accent-foreground": "oklch(0.25 0.06 55)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--border": "oklch(0.9 0.02 85)",
  "--input": "oklch(0.95 0.01 90)",
  "--ring": "oklch(0.7 0.15 85)",
  "--sidebar": "oklch(0.98 0.01 90)",
  "--sidebar-foreground": "oklch(0.2 0.05 50)",
  "--sidebar-primary": "oklch(0.7 0.15 85)",
  "--sidebar-primary-foreground": "oklch(0.15 0.05 50)",
  "--sidebar-accent": "oklch(0.95 0.02 90)",
  "--sidebar-accent-foreground": "oklch(0.3 0.08 60)",
  "--sidebar-border": "oklch(0.9 0.02 85)",
  "--sidebar-ring": "oklch(0.7 0.15 85)",
};

let reassertGeneration = 0;
let pendingRaf1 = null;
let pendingRaf2 = null;
let pendingTimeout = null;

export function normalizeTheme(theme) {
  return String(theme || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

export function getFoodUserTheme() {
  if (typeof localStorage === "undefined") return "light";

  const primary = localStorage.getItem(USER_THEME_KEY);
  if (primary) return normalizeTheme(primary);

  // Migration read only — an existing value saved under one of the old
  // per-app keys before this consolidation. Never written to anymore.
  for (const key of LEGACY_USER_THEME_KEYS) {
    const stored = localStorage.getItem(key);
    if (stored) return normalizeTheme(stored);
  }

  return "light";
}

function clearNestedThemeClasses() {
  if (typeof document === "undefined") return;

  document.body?.classList.remove("dark", "light");
  document.getElementById("root")?.classList.remove("dark", "light");
}

function applyInlineThemeVars(root, useDarkTheme) {
  if (useDarkTheme) {
    for (const varName of THEME_CSS_VARS) {
      root.style.removeProperty(varName);
    }
    return;
  }

  for (const [varName, value] of Object.entries(LIGHT_THEME_VALUES)) {
    root.style.setProperty(varName, value);
  }
}

// Many cards/headers carry `transition-all` / `transition-colors`, so a theme
// flip made their bg/border/text colours animate over ~300ms from the old
// theme's values — a visible "half light, half dark" frame (dark card with
// light-theme text) before everything settled. While switching, suppress
// every transition so the whole UI swaps colours in a single paint.
const THEME_SWITCHING_CLASS = "theme-switching";
const THEME_SWITCHING_STYLE_ID = "theme-switching-style";
let switchRaf1 = null;
let switchRaf2 = null;

function suspendTransitionsForThemeSwitch(root) {
  if (typeof window === "undefined") return;

  if (!document.getElementById(THEME_SWITCHING_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = THEME_SWITCHING_STYLE_ID;
    style.textContent = `html.${THEME_SWITCHING_CLASS} *, html.${THEME_SWITCHING_CLASS} *::before, html.${THEME_SWITCHING_CLASS} *::after { transition: none !important; }`;
    document.head.appendChild(style);
  }

  root.classList.add(THEME_SWITCHING_CLASS);

  if (switchRaf1 !== null) cancelAnimationFrame(switchRaf1);
  if (switchRaf2 !== null) cancelAnimationFrame(switchRaf2);

  // Two frames: covers the React commit (isDark-driven inline styles, the
  // taxi-app-root class flip in a layout effect) so those also land with
  // transitions off, then restores normal hover/press transitions.
  switchRaf1 = window.requestAnimationFrame(() => {
    switchRaf1 = null;
    switchRaf2 = window.requestAnimationFrame(() => {
      switchRaf2 = null;
      root.classList.remove(THEME_SWITCHING_CLASS);
    });
  });
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;

  const resolvedTheme = normalizeTheme(theme);
  const useDarkTheme = resolvedTheme === "dark";
  const root = document.documentElement;

  const previousTheme = root.dataset.theme;
  if (previousTheme && previousTheme !== resolvedTheme) {
    suspendTransitionsForThemeSwitch(root);
  }

  clearNestedThemeClasses();

  root.classList.remove("dark", "light");
  root.classList.add(resolvedTheme);
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = useDarkTheme ? "dark" : "light";
  applyInlineThemeVars(root, useDarkTheme);
}

export function applyFoodUserTheme() {
  const theme = getFoodUserTheme();
  applyTheme(theme);
  return theme;
}

export function saveFoodUserTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(USER_THEME_KEY, normalizedTheme);
  }

  applyTheme(normalizedTheme);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: normalizedTheme } }),
    );
  }

  return normalizedTheme;
}

export function applySavedTheme() {
  const savedTheme =
    typeof localStorage !== "undefined"
      ? normalizeTheme(localStorage.getItem(APP_THEME_KEY))
      : "light";

  applyTheme(savedTheme);
  return savedTheme;
}

export function reassertFoodUserTheme() {
  const theme = getFoodUserTheme();
  applyTheme(theme);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(USER_THEME_KEY, theme);
  }

  return theme;
}

export function isUserAppPath(pathname = "") {
  const path = String(pathname || "");
  return path.startsWith("/food/") || path.startsWith("/taxi/user");
}

export function syncThemeForPath(pathname = "") {
  if (isUserAppPath(pathname)) {
    return reassertFoodUserTheme();
  }

  return applySavedTheme();
}

export function cancelScheduledFoodThemeReassert() {
  reassertGeneration += 1;

  if (pendingRaf1 !== null) {
    cancelAnimationFrame(pendingRaf1);
    pendingRaf1 = null;
  }

  if (pendingRaf2 !== null) {
    cancelAnimationFrame(pendingRaf2);
    pendingRaf2 = null;
  }

  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
}

export function scheduleFoodThemeReassert(pathname) {
  if (typeof window === "undefined") return;

  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");

  if (!isUserAppPath(path)) return;

  cancelScheduledFoodThemeReassert();
  const generation = reassertGeneration;

  const runIfValid = () => {
    if (generation !== reassertGeneration) return;
    if (!isUserAppPath(window.location.pathname)) return;
    reassertFoodUserTheme();
  };

  reassertFoodUserTheme();

  pendingRaf1 = window.requestAnimationFrame(() => {
    pendingRaf1 = null;
    runIfValid();
    pendingRaf2 = window.requestAnimationFrame(() => {
      pendingRaf2 = null;
      runIfValid();
    });
  });

  pendingTimeout = window.setTimeout(() => {
    pendingTimeout = null;
    runIfValid();
  }, 0);
}
