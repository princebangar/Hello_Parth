import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "expo-router";
import {
  USER_THEME_KEY,
  THEME_CHANGE_EVENT,
  cancelScheduledFoodThemeReassert,
  isUserAppPath,
  reassertFoodUserTheme,
  scheduleFoodThemeReassert,
  syncThemeForPath,
} from "../shared/utils/theme.js";

// Same rules as the web: the user screens (Food, Taxi user) keep the saved Food+Taxi theme; the rest is light.
// The ThemeProvider (src/theme) renders the result; login / auth screens force light with <ForceLight>.
export default function ThemeSync() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    cancelScheduledFoodThemeReassert();
    syncThemeForPath(pathname);

    if (isUserAppPath(pathname)) {
      scheduleFoodThemeReassert(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    // "pageshow" = the app came back to the foreground (src/lib/webCompat.js)
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
      if (event?.key && event.key !== USER_THEME_KEY) return;
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
