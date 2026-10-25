// Web: modules/Taxi/shared/context/UserThemeContext.jsx — the Taxi customer's light/dark theme (same saved "userTheme"
// setting as Food). The web flipped a `dark`/`light` class on #taxi-app-root, which switched every --user-* CSS
// variable of modules/Taxi/index.css ("User Theme Custom Variables"). Native: the theme comes from the app's
// ThemeProvider (@/theme, same key + THEME_CHANGE_EVENT), and the --user-* variables are `userPalette(dark)` /
// useUserPalette() so screens use the same tokens. Driver/owner/admin paths are light only (not part of this app).
import React, { createContext, useContext, useMemo } from 'react';
import { useTheme } from '@/theme';
import { saveFoodUserTheme } from '@/shared/utils/theme';

/**
 * The --user-* CSS variables of modules/Taxi/index.css, per theme. Also the colours index.css's `.user-app-theme`
 * !important overrides remap Tailwind classes to inside the Taxi customer screens:
 *   bg-white / bg-slate-50 / bg-gray-50 / bg-slate-900 / bg-zinc-900 ... -> cardBg
 *   bg-slate-100 / bg-gray-100 / bg-slate-200 / bg-*-50 tints ...        -> cardSoft
 *   text-slate-900/800 / text-gray-900/800 / text-black / text-white     -> textPrimary
 *   text-slate-700/600/400/300 / text-gray-700/600/400 / text-zinc-400   -> textSecondary
 *   text-slate-500 / text-gray-500 / text-zinc-500                        -> textMuted
 *   border-white / border-slate-100/200/300/800 / border-gray-100/200/300 -> border
 *   text-primary / text-amber-500 / text-orange-500 / text-yellow-400/500 -> accent
 *   bg-primary / bg-orange-500 / bg-amber-500 / bg-yellow-400/500         -> accent (text #0b1220)
 *   page wrappers (min-h-screen, main)                                    -> bg
 *   shadow-sm/md/lg/xl/2xl                                                -> 0 12px 30px -10px rgba(0,0,0,.15)
 *   font-black / font-extrabold -> 700, font-bold -> 600; text-[8px..9.5px] -> 10.5px; blur-2xl/3xl blobs hidden.
 */
const DARK = {
  bg: '#0a0a0a',
  cardBg: '#141414',
  cardSoft: '#1c1c1c',
  textPrimary: '#FFFFFF',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  border: 'rgba(255,255,255,0.12)',
  accent: '#FFC400',
  accentInk: '#0B1220',
  cardShadow: { elevation: 6, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  navBg: '#1a1a1a',
  navBorder: 'rgba(255,255,255,0.10)',
  navIdle: '#9CA3AF',
  navActiveBg: 'rgba(37,99,235,0.20)',
  navActiveFg: '#60A5FA',
  profileHeaderBg: '#0a0a0a',
  profileHeaderGradient: ['rgba(255,196,0,0.06)', 'rgba(10,10,10,1)'],
  serviceArtBg: 'rgba(255,196,0,0.14)',
  serviceArtFg: '#FFC400',
};

const LIGHT = {
  bg: '#F1F4F9',
  cardBg: '#FFFFFF',
  cardSoft: '#E9EDF4',
  textPrimary: '#0B1220',
  textSecondary: '#475569',
  textMuted: '#64748B',
  border: 'rgba(15,23,42,0.10)',
  accent: '#FFC400',
  accentInk: '#0B1220',
  cardShadow: { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  navBg: '#FFFFFF',
  navBorder: '#F3F4F6',
  navIdle: '#4B5563',
  navActiveBg: '#EAF1FF',
  navActiveFg: '#2563EB',
  profileHeaderBg: '#FFFFFF',
  profileHeaderGradient: ['rgba(238,242,255,0.5)', 'rgba(241,244,249,0)'],
  serviceArtBg: 'rgba(255,196,0,0.16)',
  serviceArtFg: '#8A6100',
};

// index.css `.user-app-theme .shadow-*` (same in both themes)
export const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

/** The Taxi customer palette (--user-* variables) for a theme. */
export const userPalette = (dark) => ({ ...(dark ? DARK : LIGHT), dark: Boolean(dark) });

const UserThemeContext = createContext({
  theme: 'light',
  toggleTheme: () => {},
});

export const UserThemeProvider = ({ children }) => {
  const t = useTheme();
  const theme = t.dark ? 'dark' : 'light';

  const value = useMemo(
    () => ({
      theme,
      // saveFoodUserTheme() stores "userTheme" and fires THEME_CHANGE_EVENT, which the app ThemeProvider follows.
      toggleTheme: () => saveFoodUserTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme],
  );

  return <UserThemeContext.Provider value={value}>{children}</UserThemeContext.Provider>;
};

export const useUserTheme = () => useContext(UserThemeContext);

/** The --user-* tokens for the current theme. */
export const useUserPalette = () => {
  const t = useTheme();
  return useMemo(() => userPalette(t.dark), [t.dark]);
};
