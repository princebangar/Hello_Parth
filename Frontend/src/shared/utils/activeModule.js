export const ACTIVE_MODULE_KEY = 'hello_parth_active_module'
export const NATIVE_LAST_ROUTE_KEY = 'native_last_route'
export const LOGIN_RETURN_TO_KEY = 'hello_parth_login_return_to'

export const FOOD_ADMIN_HOME = '/admin/food'
export const TAXI_ADMIN_HOME = '/taxi/admin/dashboard'
/** Cross-module overview for admins who can see both Food and Taxi. Rendered by the Food admin shell. */
export const GLOBAL_ADMIN_HOME = '/admin/global'

/** Logged-in consumer default — Taxi opens first on app/web launch. */
export const CONSUMER_POST_LOGIN_HOME = '/taxi/user'
/** Guest browse after "Skip for now" — Food allows limited access without login. */
export const CONSUMER_GUEST_HOME = '/food/user'

export function resolveConsumerPostLoginRoute() {
  return CONSUMER_POST_LOGIN_HOME
}

/**
 * App cold start / reopen.
 * Guests → login (Taxi is login-only; Skip for now opens Food).
 * Logged-in users → Taxi home first.
 */
/** True once either Food or Taxi has a stored consumer session (they share one login). */
export function isConsumerLoggedIn() {
  if (typeof localStorage === 'undefined') return false

  const foodToken = String(localStorage.getItem('user_accessToken') || '').trim()
  const taxiToken = String(localStorage.getItem('userToken') || '').trim()
  return Boolean(foodToken || taxiToken)
}

export function resolveAppColdStartRoute() {
  if (!isConsumerLoggedIn()) {
    return '/login'
  }

  return CONSUMER_POST_LOGIN_HOME
}

/**
 * The Taxi admin screens were written for a standalone app where they lived at /admin/<page>.
 * In this super-app /admin/* is the Food admin and Taxi is /taxi/admin/*, so every leftover
 * navigate('/admin/drivers/…') / Link to="/admin/pricing/…" in the Taxi admin used to dump the
 * admin into the Food dashboard. This maps those legacy URLs to their real Taxi address.
 */
const LEGACY_TAXI_ADMIN_SEGMENTS = new Set([
  'dashboard', 'cancellation-analytics', 'earnings', 'chat', 'trips', 'deliveries', 'ongoing',
  'bus-service', 'pooling', 'wallet', 'users', 'user-import', 'drivers', 'driver-import',
  'referrals', 'promotions', 'management', 'owners', 'owner-management', 'fleet', 'geo',
  'finance', 'pricing', 'safety', 'cms', 'support', 'reports', 'masters', 'settings', 'employees',
])

export function resolveLegacyTaxiAdminPath(pathname = '') {
  const match = /^\/admin\/([^/]+)(\/.*)?$/.exec(String(pathname || ''))
  if (!match || !LEGACY_TAXI_ADMIN_SEGMENTS.has(match[1])) return null

  const rest = match[2] || ''
  if (match[1] === 'owner-management') {
    return `/taxi/admin/owners${rest.replace(/^\/manage-owners/, '')}`
  }
  return `/taxi/admin/${match[1]}${rest}`
}

export function getModuleFromPath(pathname = '') {
  const path = String(pathname || '')
  if (path.startsWith('/taxi/')) return 'taxi'
  if (path.startsWith('/food/')) return 'food'
  if (path.startsWith('/admin')) return 'admin'
  return null
}

export function getModuleHomeRoute(module) {
  if (module === 'taxi') return '/taxi/user'
  if (module === 'food') return '/food/user'
  if (module === 'admin') return '/admin'
  return CONSUMER_POST_LOGIN_HOME
}

export function syncActiveModule(pathname = '') {
  if (typeof localStorage === 'undefined') return null

  const module = getModuleFromPath(pathname)
  if (module) {
    localStorage.setItem(ACTIVE_MODULE_KEY, module)
  }
  return module
}

const isAuthPath = (path = '') => {
  const value = String(path || '').split('?')[0]
  if (!value || value === '/login') return true
  return value.includes('/auth/login') || /\/login\/?$/.test(value)
}

/** Remember where consumer was before /login (survives replace redirects that drop location.state). */
export function rememberLoginReturnTo(pathname = '') {
  if (typeof sessionStorage === 'undefined') return
  const path = String(pathname || '').split('?')[0]
  if (!path || isAuthPath(path)) return
  if (!(path.startsWith('/taxi/') || path.startsWith('/food/user'))) return
  try {
    sessionStorage.setItem(LOGIN_RETURN_TO_KEY, path)
  } catch (_) {}
}

export function peekLoginReturnTo() {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    return String(sessionStorage.getItem(LOGIN_RETURN_TO_KEY) || '').trim()
  } catch (_) {
    return ''
  }
}

export function consumeLoginReturnTo() {
  const value = peekLoginReturnTo()
  if (typeof sessionStorage === 'undefined') return value
  try {
    sessionStorage.removeItem(LOGIN_RETURN_TO_KEY)
  } catch (_) {}
  return value
}

/** Warm Food admin chunks so Food ↔ Taxi admin tab switches stay SPA-smooth. */
export function prefetchFoodAdmin() {
  return Promise.all([
    import('../../modules/Food/components/admin/AdminRouter.jsx'),
    import('../../modules/Food/pages/admin/AdminHome.jsx'),
  ]).catch(() => {})
}

/** Warm Taxi admin chunks so Food ↔ Taxi admin tab switches stay SPA-smooth. */
export function prefetchTaxiAdmin() {
  return Promise.all([
    import('../../modules/Taxi/TaxiApp.jsx'),
    import('../../modules/Taxi/modules/admin/components/AdminLayout.jsx'),
    import('../../modules/Taxi/modules/admin/pages/dashboard/MainDashboard.jsx'),
  ]).catch(() => {})
}

/** Warm Food user shell so Food ↔ Taxi user tab switches stay SPA-smooth. */
export function prefetchFoodUser() {
  return Promise.all([
    import('../../modules/Food/routes.jsx'),
  ]).catch(() => {})
}

/** Warm Taxi user shell + main tabs so Food ↔ Taxi / bottom-nav switches stay SPA-smooth. */
export function prefetchTaxiUser() {
  return Promise.all([
    import('../../modules/Taxi/TaxiApp.jsx'),
    import('../../modules/Taxi/modules/user/pages/Home.jsx'),
    import('../../modules/Taxi/modules/user/pages/Activity.jsx'),
    import('../../modules/Taxi/modules/user/pages/Profile.jsx'),
    import('../../modules/Taxi/modules/user/pages/ride/Support.jsx'),
  ]).catch(() => {})
}

/** Prefetch the sibling consumer vertical (call on idle / hover). */
export function prefetchSiblingUserVertical(currentVertical = 'food') {
  if (currentVertical === 'taxi') return prefetchFoodUser()
  return prefetchTaxiUser()
}

/**
 * Routes that rely on React Router state and must never be restored
 * after an app restart — the state would be lost, showing stale data.
 */
const TRANSIENT_ROUTE_SEGMENTS = [
  '/ride/select-vehicle',
  '/ride/select-location',
  '/ride/searching',
  '/ride/tracking',
  '/ride/complete',
  '/ride/chat',
  '/parcel/searching',
  '/parcel/tracking',
  '/parcel/details',
  '/parcel/contacts',
  '/intercity/details',
  '/intercity/confirm',
]

const isTransientRoute = (route) =>
  TRANSIENT_ROUTE_SEGMENTS.some((seg) => route.includes(seg))

/**
 * Auth-gated consumer paths that bounce guests back to /login.
 * Used by the login BACK button so we never re-enter the redirect loop.
 */
const AUTH_GATED_ROUTE_SEGMENTS = [
  '/activity',
  '/profile',
  '/wallet',
  '/support',
  '/ride/searching',
  '/ride/tracking',
  '/ride/complete',
  '/ride/chat',
  '/ride/detail',
  '/parcel/type',
  '/parcel/details',
  '/parcel/contacts',
  '/parcel/searching',
  '/parcel/tracking',
  '/parcel/detail',
  '/intercity/confirm',
  '/pooling/confirm',
  '/food/user/cart',
  '/food/user/checkout',
  '/food/user/orders',
  '/food/user/profile',
  '/food/user/wallet',
  '/food/user/address',
]

const isAuthGatedRoute = (route = '') => {
  const value = String(route || '').split('?')[0]
  if (!value) return false
  return AUTH_GATED_ROUTE_SEGMENTS.some((seg) => value.includes(seg))
}

const toPublicModuleHome = (route = '') => {
  const value = String(route || '')
  if (value.startsWith('/taxi/') || value === 'taxi') return '/taxi/user'
  if (value.startsWith('/food/') || value === 'food') return '/food/user'
  return ''
}

/**
 * Post-login destination for the consumer (/login) auth flow only.
 * Must never send users to admin/restaurant/delivery panels — those have
 * their own login screens.
 */
export function resolvePostLoginRoute() {
  return CONSUMER_POST_LOGIN_HOME
}

/**
 * Mark explicit guest browsing for Food when no login token exists.
 * Matches "Skip for now" semantics so super-app tab switches open Food home.
 */
export function ensureFoodGuestSession() {
  if (typeof localStorage === 'undefined') return
  const token = localStorage.getItem('user_accessToken')
  const authStatus = localStorage.getItem('user_authenticated')
  if (!token && authStatus === null) {
    localStorage.setItem('user_authenticated', 'false')
  }
}

/**
 * Back from /login while still logged out.
 * Guests always return to Food — Taxi routes are login-only and would loop.
 */
export function resolveLoginBackRoute(locationStateFrom) {
  const fromPath = String(locationStateFrom || '').trim().split('?')[0]
  const storedReturn = peekLoginReturnTo()
  const foodToken = typeof localStorage !== 'undefined'
    ? String(localStorage.getItem('user_accessToken') || '').trim()
    : ''
  const taxiToken = typeof localStorage !== 'undefined'
    ? String(localStorage.getItem('userToken') || '').trim()
    : ''
  const isLoggedIn = Boolean(foodToken || taxiToken)

  const hint = fromPath || storedReturn

  if (isLoggedIn && (hint.startsWith('/taxi/') || hint === 'taxi' || String(hint).includes('/taxi/'))) {
    return '/taxi/user'
  }

  // Default / guest: Food browse
  return '/food/user'
}
