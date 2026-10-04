import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { THEME_CHANGE_EVENT } from "../shared/utils/theme.js";

// The phone status bar (meta theme-color) used to be set only by the Food home (red / festival banner colour) and was
// never reset, so every later page - white pages, dark mode, Taxi - kept a red status bar. On every page change (and
// theme change) we read the colour of whatever is painted at the very top of the page and use that.

const TRANSPARENT = /^(transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\))$/i;

const ensureMeta = () => {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  return meta;
};

const readTopColor = () => {
  const x = Math.max(1, Math.floor(window.innerWidth / 2));
  let el = document.elementFromPoint(x, 1);
  while (el && el !== document.documentElement) {
    // A banner image at the top paints its own colour; the page that shows it sets theme-color itself.
    if (el.tagName === "IMG" || el.tagName === "VIDEO" || el.tagName === "CANVAS") return null;
    const bg = window.getComputedStyle(el).backgroundColor;
    if (bg && !TRANSPARENT.test(bg)) return bg;
    el = el.parentElement;
  }
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
  return bodyBg && !TRANSPARENT.test(bodyBg) ? bodyBg : null;
};

const syncStatusBar = () => {
  try {
    const color = readTopColor();
    if (color) ensureMeta().setAttribute("content", color);
  } catch {
    // purely cosmetic
  }
};

export default function StatusBarSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    // pages paint their header after data/lazy chunks load, so look again a little later too
    const timers = [80, 600, 1500].map((ms) => window.setTimeout(syncStatusBar, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [pathname]);

  useEffect(() => {
    const onThemeChange = () => window.setTimeout(syncStatusBar, 50);
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  return null;
}
