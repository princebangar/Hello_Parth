// The one theme file: every color, size, radius, shadow and font the screens use comes from here.
// Values are the web app's: Tailwind's default palette and scales (the web is styled with Tailwind), the CSS variables
// of Frontend/src/shared/styles/global.css, and the fonts loaded by Frontend/index.html.
//
// Usage in a screen:
//   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.dark ? colors.zinc[900] : colors.white, padding: sp(4) } }));
//   const s = useStyles();  // re-created only when light/dark changes
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

// ------------------------------------------------------------------ colors (Tailwind default palette)
export const colors = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
  gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827', 950: '#030712' },
  zinc: { 50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8', 400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a', 900: '#18181b', 950: '#09090b' },
  neutral: { 50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4', 400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040', 800: '#262626', 900: '#171717', 950: '#0a0a0a' },
  stone: { 50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1', 400: '#a8a29e', 500: '#78716c', 600: '#57534e', 700: '#44403c', 800: '#292524', 900: '#1c1917', 950: '#0c0a09' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a' },
  orange: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
  yellow: { 50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e', 900: '#713f12', 950: '#422006' },
  lime: { 50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314', 950: '#1a2e05' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16' },
  emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63', 950: '#083344' },
  sky: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49' },
  blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065' },
  purple: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87', 950: '#3b0764' },
  fuchsia: { 50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f', 900: '#701a75', 950: '#4a044e' },
  pink: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' },
};

/** "#rrggbb" + opacity 0..1 -> "rgba(...)" (Tailwind's bg-black/40 etc.) */
export function alpha(hex, opacity) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

// App brand / CSS-variable colors (global.css, index.html, project decisions)
export const brand = {
  primaryOrange: '#dc2626', // --color-primary-orange
  pageBg: '#ffffff', // --color-page-bg
  bootBg: '#fffdf9', // index.html background before the app paints
  bootBgDark: '#0b0b0b',
  foodBanner: '#9A1809', // Food home banner (maroon)
  taxiPageBg: '#f1f4f9', // Taxi screens background (index.html .tp)
  // shadcn-style CSS variables of global.css (oklch converted to sRGB)
  foreground: '#2e1f12',
  primary: '#d9a21b',
  primaryForeground: '#1c1209',
  secondary: '#f3f0e6',
  muted: '#f5f3ee',
  mutedForeground: '#6f6150',
  accent: '#f6e2b5',
  destructive: '#e7000b',
  border: '#e6e0d1',
  input: '#f2f0ea',
};

// ------------------------------------------------------------------ scales (Tailwind)
/** Tailwind spacing: sp(4) === 16 (p-4, gap-4, mt-4 ...). Accepts halves: sp(2.5) === 10. */
export const sp = (n) => n * 4;

export const fontSize = {
  '2xs': { fontSize: 10, lineHeight: 14 },
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl: { fontSize: 20, lineHeight: 28 },
  '2xl': { fontSize: 24, lineHeight: 32 },
  '3xl': { fontSize: 30, lineHeight: 36 },
  '4xl': { fontSize: 36, lineHeight: 40 },
  '5xl': { fontSize: 48, lineHeight: 48 },
};

// global.css overrides sm/md/lg/xl from --radius (10px): sm 6, md 8, lg 10, xl 14
export const radius = { none: 0, xs: 2, sm: 6, DEFAULT: 4, md: 8, lg: 10, xl: 14, '2xl': 16, '3xl': 24, full: 9999 };

// box-shadow -> Android elevation + iOS shadow (same visual weight as Tailwind's shadow-*)
export const shadow = {
  none: { elevation: 0, shadowOpacity: 0 },
  xs: { elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 1, shadowOffset: { width: 0, height: 1 } },
  sm: { elevation: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  DEFAULT: { elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  md: { elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  lg: { elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  xl: { elevation: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
  '2xl': { elevation: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 50, shadowOffset: { width: 0, height: 25 } },
};

// ------------------------------------------------------------------ fonts (bundled; see src/theme/fonts.js)
// On Android a custom font needs one family name per weight. <Text> from src/native/ui picks the right one from
// fontFamily + fontWeight, so screens can write { fontFamily: fonts.outfit, fontWeight: '700' } like CSS.
export const fonts = {
  poppins: 'Poppins',
  outfit: 'Outfit',
  inter: 'Inter',
  jakarta: 'Plus Jakarta Sans',
  nunito: 'Nunito Sans',
  sora: 'Sora',
  caveat: 'Caveat',
  pacifico: 'Pacifico',
};
export const DEFAULT_FONT = fonts.poppins; // body font of global.css (Taxi screens set Outfit, see Taxi/index.css)

// ------------------------------------------------------------------ light / dark
export const USER_THEME_KEY = 'userTheme';
export const THEME_CHANGE_EVENT = 'helloparth:theme-change';
const LEGACY_THEME_KEYS = ['foodUserTheme', 'appTheme', 'userAppTheme'];

const readStoredScheme = () => {
  try {
    const v = globalThis.localStorage?.getItem(USER_THEME_KEY) || LEGACY_THEME_KEYS.map((k) => globalThis.localStorage?.getItem(k)).find(Boolean);
    return String(v || '').toLowerCase() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const buildTheme = (scheme) => {
  const dark = scheme === 'dark';
  return {
    scheme,
    dark,
    // the user app's page background (light: white, dark: the web's #0b0b0b) and the usual text colors
    bg: dark ? brand.bootBgDark : colors.white,
    card: dark ? '#141414' : colors.white,
    text: dark ? colors.white : colors.gray[900],
    textMuted: dark ? colors.gray[400] : colors.gray[500],
    border: dark ? alpha('#ffffff', 0.1) : colors.gray[200],
  };
};

const ThemeContext = createContext(buildTheme('light'));

/**
 * Light/dark for the user app, from the same "userTheme" setting the web uses (saved by the Appearance dialog, which
 * also fires THEME_CHANGE_EVENT). Login/auth screens are light only on the web: wrap them in <ForceLight>.
 */
export function ThemeProvider({ children }) {
  const [scheme, setScheme] = useState(readStoredScheme);
  useEffect(() => {
    const onChange = (e) => setScheme(e?.detail?.theme === 'dark' ? 'dark' : readStoredScheme());
    globalThis.addEventListener?.(THEME_CHANGE_EVENT, onChange);
    return () => globalThis.removeEventListener?.(THEME_CHANGE_EVENT, onChange);
  }, []);
  const value = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const LIGHT = buildTheme('light');
export function ForceLight({ children }) {
  return <ThemeContext.Provider value={LIGHT}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** makeStyles((t) => ({...})) -> hook returning StyleSheet styles for the current light/dark theme. */
export function makeStyles(factory) {
  const cache = new Map();
  return function useStyles() {
    const t = useTheme();
    if (!cache.has(t.scheme)) cache.set(t.scheme, StyleSheet.create(factory(t)));
    return cache.get(t.scheme);
  };
}
