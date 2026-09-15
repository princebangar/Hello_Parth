import React, { createContext, useContext, useState, useEffect } from 'react';
import { applyTheme, getFoodUserTheme, saveFoodUserTheme, THEME_CHANGE_EVENT } from '@/shared/utils/theme';

const UserThemeContext = createContext({
  theme: 'light',
  toggleTheme: () => {},
});

export const UserThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => getFoodUserTheme());

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveFoodUserTheme(next);
      return next;
    });
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

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme === 'dark' ? '#07111f' : '#f6f7fb';
      applyTheme(theme);
      return () => {
        document.body.style.backgroundColor = '';
      };
    }
  }, [theme]);

  return (
    <UserThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </UserThemeContext.Provider>
  );
};

export const useUserTheme = () => useContext(UserThemeContext);
