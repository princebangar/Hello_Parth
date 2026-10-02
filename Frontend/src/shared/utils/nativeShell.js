/**
 * The installed Android / iOS app opens this site inside a WebView. There the app uses "#/route" addresses
 * (HashRouter - see app/providers.jsx), so the real screen is in the hash and window.location.pathname is just the
 * app's fixed start page (often "/food/user"), whatever screen the person is actually on.
 */
export function isNativeLikeShell() {
  if (typeof window === 'undefined') return false

  const protocol = String(window.location?.protocol || '').toLowerCase()
  const userAgent = String(window.navigator?.userAgent || '').toLowerCase()

  return (
    Boolean(window.flutter_inappwebview) ||
    Boolean(window.ReactNativeWebView) ||
    protocol === 'file:' ||
    userAgent.includes(' wv') ||
    userAgent.includes('; wv')
  )
}

/** The screen the person is on: the "#/..." part inside the app's WebView, the normal path in a browser. */
export function getAppRoutePath() {
  if (typeof window === 'undefined') return '/'

  const hash = String(window.location?.hash || '')
  if (hash.startsWith('#/') && isNativeLikeShell()) {
    return hash.slice(1).split('?')[0] || '/'
  }
  return String(window.location?.pathname || '/')
}

// sessionStorage lives exactly as long as the WebView page session: it survives a pull-to-refresh (reload) but is empty
// again after the app has been closed and opened anew. That is the difference between "the app was just launched" and
// "the person refreshed the screen they were on".
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
    // private mode etc. - every start is then treated as a fresh launch, which is the safe default
  }
}
