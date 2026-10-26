import { navigateTo } from '@/lib/router'

/**
 * Native version of the web's WebView helpers. The web app ran inside the Flutter wrapper ("#/route" addresses under a
 * HashRouter); this app IS the native shell now: the current screen is the Expo Router route, which webCompat mirrors
 * into window.location.pathname / search.
 */
export function isNativeLikeShell() {
  return true
}

/** The screen the person is on (the current Expo Router path). */
export function getAppRoutePath() {
  if (typeof window === 'undefined') return '/'
  return String(window.location?.pathname || '/')
}

/** The screen's "?a=1" part. */
export function getAppRouteSearch() {
  if (typeof window === 'undefined') return ''
  return String(window.location?.search || '')
}

/**
 * The web did a full page load of an app screen here. In the app a page load does not exist: open the route instead
 * (replacing the current screen by default, like location.replace).
 */
export function hardNavigate(route, { replace = true } = {}) {
  navigateTo(route || '/', { replace })
}

// sessionStorage is memory only in the app (src/lib/storage.js): it is empty again after the app has been closed and
// opened anew - the same difference the web relied on between "the app was just launched" and "a screen was refreshed".
const NATIVE_SESSION_KEY = 'helloparth_native_session'

export function isNativeSessionRunning() {
  try {
    return sessionStorage.getItem(NATIVE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function markNativeSessionRunning() {
  try {
    sessionStorage.setItem(NATIVE_SESSION_KEY, '1')
  } catch {
    // every start is then treated as a fresh launch, which is the safe default
  }
}
