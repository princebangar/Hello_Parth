import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  USER_THEME_KEY,
  THEME_CHANGE_EVENT,
  cancelScheduledFoodThemeReassert,
  isUserAppPath,
  reassertFoodUserTheme,
  scheduleFoodThemeReassert,
  syncThemeForPath,
} from "../shared/utils/theme.js";

export default function ThemeSync() {
  const location = useLocation();
  const pathname = location.pathname;

  useLayoutEffect(() => {
    cancelScheduledFoodThemeReassert();
    syncThemeForPath(pathname);

    if (isUserAppPath(pathname)) {
      scheduleFoodThemeReassert(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    const handlePageshow = () => {
      cancelScheduledFoodThemeReassert();
      syncThemeForPath(pathname);

      if (isUserAppPath(pathname)) {
        scheduleFoodThemeReassert(pathname);
      }
    };

    const handleThemeChange = () => {
      if (isUserAppPath(pathname)) {
        reassertFoodUserTheme();
        scheduleFoodThemeReassert(pathname);
      }
    };

    const handleStorage = (event) => {
      if (event.key && event.key !== USER_THEME_KEY) return;
      if (isUserAppPath(pathname)) {
        reassertFoodUserTheme();
      }
    };

    window.addEventListener("pageshow", handlePageshow);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("pageshow", handlePageshow);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [pathname]);

  return null;
}
