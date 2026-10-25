// Smooth hand-over from any signed-in screen (Food or Taxi) to the login page.
//
// Signing out tears the screen down before the login screen is up: Food's profile empties the moment the session is
// cleared. Without help the user sees an empty frame in between. So a dim "Logging out..." cover (same look as the
// log-out popup) goes up above every screen, and fades out once the login screen is really showing.
// The web put that cover straight onto <body>; in the app it is drawn by <LogoutTransitionCover /> in
// src/appstore/AppShell.jsx, which listens to the state kept here.
import { getAppRoutePath } from '@/shared/utils/nativeShell';

const FADE_MS = 220;
const MAX_COVER_MS = 4000;

let shown = false;
let maxTimer = null;
let checkTimer = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(shown));

/** For the cover component: fn(shown) now and on every change. Returns the unsubscribe function. */
export function subscribeLogoutCover(fn) {
  listeners.add(fn);
  fn(shown);
  return () => listeners.delete(fn);
}

export const LOGOUT_COVER_FADE_MS = FADE_MS;

export function showLogoutCover() {
  if (shown) return;
  shown = true;
  emit();
  // Never leave a full-screen cover behind, whatever happens.
  clearTimeout(maxTimer);
  maxTimer = setTimeout(hideLogoutCover, MAX_COVER_MS);
}

export function hideLogoutCover() {
  clearTimeout(maxTimer);
  clearTimeout(checkTimer);
  if (!shown) return;
  shown = false;
  emit();
}

/** Fades the cover out once the login screen is on screen. */
export function hideLogoutCoverWhenLoginShown() {
  const started = Date.now();
  const check = () => {
    const onLogin = getAppRoutePath().startsWith('/login');
    if (onLogin || Date.now() - started > MAX_COVER_MS - 500) {
      // a moment more so the login screen has painted under the cover before it fades
      checkTimer = setTimeout(hideLogoutCover, 80);
      return;
    }
    checkTimer = setTimeout(check, 16);
  };
  clearTimeout(checkTimer);
  checkTimer = setTimeout(check, 16);
}

/**
 * Logs out with no blank frame: cover on, sign out, go to the login page, cover off once it shows. `signOut` may be
 * async; a failing sign-out still ends on the login page, because the local session is what matters to the user.
 * (The web also downloaded the login screen's code in parallel; in the app it is already in the bundle.)
 */
export async function logoutWithTransition({ signOut, navigate, loginPath = '/login' }) {
  showLogoutCover();
  try {
    await Promise.resolve().then(signOut);
  } catch {
    // the local session is cleared by the caller's signOut either way
  }
  navigate(loginPath, { replace: true });
  hideLogoutCoverWhenLoginShown();
}
