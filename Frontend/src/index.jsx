import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './app/App.jsx'
import { isModuleAuthenticated } from './shared/utils/moduleAuth.js'
import { syncThemeForPath } from './shared/utils/theme.js'
import { NATIVE_LAST_ROUTE_KEY, resolveAppColdStartRoute, isConsumerLoggedIn } from './shared/utils/activeModule.js'
import { isNativeLikeShell, isNativeSessionRunning, markNativeSessionRunning } from './shared/utils/nativeShell.js'
import './shared/styles/global.css'

// ─── Quick-spicy Food Module Initialization ───────────────────────────────────

// Load food module business settings (favicon, title) — non-critical
import('./modules/Food/utils/businessSettings.js')
  .then(({ loadBusinessSettings }) => loadBusinessSettings())
  .catch(() => { /* Silently fail — settings load when admin authenticates */ })

function getInitialPathname() {
  if (typeof window === 'undefined') return '/'

  const hash = String(window.location?.hash || '')
  if (hash.startsWith('#/')) {
    return hash.slice(1).split('?')[0] || '/'
  }

  const pathname = String(window.location?.pathname || '/')
  return pathname.replace(/\/index\.html$/i, '') || '/'
}

// The consumer screens (Food / Taxi user app). Partner panels have their own logins and are not part of this.
const isConsumerPath = (p = '') => p === '/food' || p === '/user' || p.startsWith('/food/user') || p.startsWith('/user/') || p.startsWith('/taxi/user')
// Start pages that mean "the app's front door" and not a link to one particular screen.
const FRONT_DOOR_PATHS = new Set(['/food', '/food/user', '/food/user/home', '/taxi', '/taxi/user'])

function resolveNativeInitialRoute(freshLaunch) {
  if (typeof window === 'undefined') return '/login'

  const rawPathname = String(window.location?.pathname || '')
  const pathname = rawPathname.replace(/\/index\.html$/i, '') || '/'
  const storedRoute = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()

  // Routes that depend on React Router state (pickup/drop etc.) must never
  // be restored after an app restart — the state is gone, showing stale data.
  const TRANSIENT_SEGMENTS = [
    '/ride/select-vehicle', '/ride/select-location', '/ride/searching',
    '/ride/tracking', '/ride/complete', '/ride/chat',
    '/parcel/searching', '/parcel/tracking', '/parcel/details', '/parcel/contacts',
    '/intercity/details', '/intercity/confirm',
  ]
  const isTransient = (r) => TRANSIENT_SEGMENTS.some((s) => r.includes(s))

  // The app's start page is a fixed address of the site (often /food/user), not something the person chose. On a fresh
  // launch it must not let them straight into the app: someone who is not logged in starts at the login screen (they
  // get in as a guest only through "Skip for now"), and a logged-in person gets the usual first screen (Taxi) instead
  // of whichever app that fixed address happens to belong to.
  const bare = pathname.replace(/\/+$/, '') || '/'
  if (freshLaunch && bare !== '/' && isConsumerPath(bare)) {
    if (!isConsumerLoggedIn()) return '/login'
    if (FRONT_DOOR_PATHS.has(bare)) return resolveAppColdStartRoute()
  }

  // Explicit deep-link / in-app path still wins (except broken transient ride flows).
  if (pathname.startsWith('/taxi/')) return isTransient(pathname) ? '/taxi/user' : pathname
  if (pathname.startsWith('/food/')) return pathname
  if (pathname.startsWith('/restaurant')) return `/food${pathname}`
  if (pathname.startsWith('/delivery')) return `/food${pathname}`
  if (pathname.startsWith('/user')) return `/food${pathname}`
  if (pathname.startsWith('/admin')) return pathname

  // Cold start at `/` or blank: restore last consumer module home.
  if (storedRoute.startsWith('/taxi/') || storedRoute.startsWith('/food/') || storedRoute.startsWith('/admin')) {
    if (isModuleAuthenticated('restaurant') && storedRoute.startsWith('/food/restaurant')) {
      return storedRoute
    }
    if (isModuleAuthenticated('delivery') && storedRoute.startsWith('/food/delivery')) {
      return storedRoute
    }
    if (isModuleAuthenticated('admin') && storedRoute.startsWith('/admin')) {
      return storedRoute
    }
    return resolveAppColdStartRoute()
  }

  if (isModuleAuthenticated('restaurant')) return '/food/restaurant'
  if (isModuleAuthenticated('delivery')) return '/food/delivery'
  if (isModuleAuthenticated('admin')) return '/admin'
  if (isModuleAuthenticated('user')) return resolveAppColdStartRoute()

  return resolveAppColdStartRoute()
}

function bootstrapNativeHashRoute() {
  if (!isNativeLikeShell() || typeof window === 'undefined') return

  // First start since the app was opened, or a reload (pull-to-refresh) of a session that is already running?
  const freshLaunch = !isNativeSessionRunning()
  markNativeSessionRunning()

  const currentHash = String(window.location?.hash || '')
  const hashPath = currentHash.startsWith('#') ? currentHash.slice(1).split('?')[0] : ''
  const rawPathname = String(window.location?.pathname || '')
  const pathname = rawPathname.replace(/\/index\.html$/i, '') || '/'

  if (!freshLaunch) {
    // Pull-to-refresh: stay on the screen the person was on. The address in the WebView still has the app's fixed start
    // page as its path (e.g. /food/user) - that must not win over where they were (it threw Taxi users into Food).
    if (hashPath.startsWith('/') && hashPath !== '/') return
    const last = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()
    if (last.startsWith('/taxi/') || last.startsWith('/food/') || last.startsWith('/admin')) {
      window.history.replaceState(null, '', `#${last}`)
      return
    }
  }

  const targetPath = resolveNativeInitialRoute(freshLaunch)
  const search = String(window.location?.search || '')

  if (currentHash.startsWith('#/')) {
    const nativePathPrefix = targetPath.startsWith('/taxi/')
      ? '/taxi/'
      : targetPath.startsWith('/food/')
        ? '/food/'
        : targetPath.startsWith('/admin')
          ? '/admin'
          : ''

    const hashMatchesPrefix = nativePathPrefix ? hashPath.startsWith(nativePathPrefix) : false;
    const pathSuggestsTaxi = pathname.startsWith('/taxi/');

    // Normalize stale hash routes in native shells (e.g. /taxi/... with #/food/...)
    if ((pathSuggestsTaxi && !hashPath.startsWith('/taxi/')) || !hashMatchesPrefix) {
      window.history.replaceState(null, '', `#${targetPath}${search}`)
    }
    return
  }

  window.history.replaceState(null, '', `#${targetPath}${search}`)
}

// Opening "/" while signed in used to render the router once just to redirect into the app, and that extra pass
// showed as a blank flash between the boot skeleton and the app skeleton. Do the same redirect before React starts.
function redirectSignedInStartToApp() {
  if (typeof window === 'undefined' || isNativeLikeShell()) return
  if (window.location.hash) return
  if ((window.location.pathname || '/') !== '/') return
  if (!isConsumerLoggedIn()) return
  window.history.replaceState(window.history.state, '', resolveAppColdStartRoute())
}

bootstrapNativeHashRoute()
redirectSignedInStartToApp()
syncThemeForPath(getInitialPathname())

// ─── Suppress known non-critical errors ──────────────────────────────────────

const originalError = console.error
console.error = (...args) => {
  const errorStr = args.join(' ')

  if (typeof args[0] === 'string' && (
    args[0].includes('chrome-extension://') ||
    args[0].includes('_$initialUrl') ||
    args[0].includes('_$onReInit') ||
    args[0].includes('_$bindListeners')
  )) return

  if (
    errorStr.includes('Timeout expired') ||
    errorStr.includes('GeolocationPositionError') ||
    errorStr.includes('Geolocation error') ||
    errorStr.includes('User denied Geolocation') ||
    errorStr.includes('permission denied')
  ) return

  const hasNetworkError = args.some(arg =>
    arg && typeof arg === 'object' &&
    (arg.name === 'AxiosError') &&
    (arg.code === 'ERR_NETWORK' || arg.message === 'Network Error')
  )
  if (hasNetworkError) return

  if (
    errorStr.includes('🌐 Network Error') ||
    errorStr.includes('Network Error - Backend server may not be running') ||
    (errorStr.includes('ERR_NETWORK') && errorStr.includes('AxiosError'))
  ) return

  if (
    errorStr.includes('Restaurant Socket connection error') ||
    errorStr.includes('xhr poll error') ||
    (errorStr.includes('WebSocket connection to') && errorStr.includes('socket.io') && errorStr.includes('failed'))
  ) return

  originalError.apply(console, args)
}

// A screen's file that the server no longer has (new version published): load the new page instead of going blank.
window.addEventListener('vite:preloadError', (event) => {
  // Only swallow the error when the page really is being reloaded. Swallowing it ALWAYS made the failed import()
  // resolve to undefined, and React.lazy then crashed with "Cannot read properties of undefined (reading 'default')"
  // on the Intercity / Bus screens of a phone still running an older version. Not reloading (a reload just happened):
  // let the real error through, the error screen handles it.
  if (reloadForNewVersion()) event.preventDefault()
})

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason || event
  const errorMsg = error?.message || String(error) || ''
  const errorName = error?.name || ''
  if (
    errorMsg.includes('Timeout expired') ||
    errorMsg.includes('User denied Geolocation') ||
    errorMsg.includes('permission denied') ||
    errorName === 'GeolocationPositionError'
  ) {
    event.preventDefault()
    return
  }
})

// ─────────────────────────────────────────────────────────────────────────────

import { AppProviders } from './app/providers.jsx'
import { reloadForNewVersion } from './shared/utils/chunkReload.js'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <AppProviders>
    <App />
  </AppProviders>
)
