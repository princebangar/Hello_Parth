import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';
import { applyTheme, getFoodUserTheme, saveFoodUserTheme, THEME_CHANGE_EVENT } from '@/shared/utils/theme';

const UserThemeContext = createContext({
  theme: 'light',
  toggleTheme: () => {},
});

// The div carrying the `user-app-theme` scope in TaxiApp.jsx's MainLayout.
const TAXI_APP_ROOT_ID = 'taxi-app-root';

export const UserThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => getFoodUserTheme());

  const toggleTheme = () => {
    // saveFoodUserTheme() dispatches THEME_CHANGE_EVENT, whose listener below
    // also calls setTheme — calling it from inside this setTheme's own
    // updater made that a reentrant setTheme-within-setTheme, which needed
    // 2-3 clicks to actually stick. Compute `next` from the current value
    // and call setTheme directly instead.
    const next = theme === 'dark' ? 'light' : 'dark';
    saveFoodUserTheme(next);
    setTheme(next);
  };

  useEffect(() => {
    const handleThemeChange = (e) => {
      if (e?.detail?.theme) {
        setTheme(e.detail.theme);
      } else {
        setTheme(getFoodUserTheme());
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  // Flip the `dark`/`light` class straight on the DOM node, synchronously,
  // instead of only through React's `className` on MainLayout. MainLayout
  // wraps every kept-alive tab (Ride/Rides/Bus/Support/Profile all stay
  // mounted at once) — waiting for a full React re-render of that whole
  // tree to see the class change is what made the switch feel like it
  // landed in two stages. A direct classList toggle updates every
  // `--user-*` CSS variable (and everything reading them) in one paint,
  // independent of how long the rest of the tree takes to reconcile.
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.getElementById(TAXI_APP_ROOT_ID);
    if (root) {
      root.classList.remove('dark', 'light');
      root.classList.add(theme);
    }
    document.body.style.backgroundColor = theme === 'dark' ? '#0a0a0a' : '#EFF5FD';
    applyTheme(theme);
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [theme]);

  return (
    <UserThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </UserThemeContext.Provider>
  );
};

export const useUserTheme = () => useContext(UserThemeContext);
