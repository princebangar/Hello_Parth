export const ACTIVE_MODULE_KEY = 'hello_parth_active_module'
export const NATIVE_LAST_ROUTE_KEY = 'native_last_route'
export const LOGIN_RETURN_TO_KEY = 'hello_parth_login_return_to'

export const FOOD_ADMIN_HOME = '/admin/food'
export const TAXI_ADMIN_HOME = '/taxi/admin/dashboard'

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
  return '/food/user'
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
  '/rental/vehicle',
  '/rental/schedule',
  '/rental/kyc',
  '/rental/deposit',
  '/rental/confirmed',
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
  '/rental/kyc',
  '/rental/deposit',
  '/rental/confirmed',
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
 * their own login screens. Leftover `hello_parth_active_module=admin` or
 * `native_last_route=/admin/...` from an earlier admin visit must not
 * override a normal user login.
 */
export function resolvePostLoginRoute() {
  if (typeof localStorage === 'undefined') return '/food/user'

  const storedReturn = peekLoginReturnTo()
  if (storedReturn && !isAuthPath(storedReturn)) {
    if (isTransientRoute(storedReturn)) {
      return storedReturn.startsWith('/taxi/') ? '/taxi/user' : '/food/user'
    }
    return storedReturn
  }

  const storedRoute = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()

  // Never restore transient ride-flow routes — state is lost on restart.
  if (isTransientRoute(storedRoute)) {
    if (storedRoute.startsWith('/taxi/')) return '/taxi/user'
    return '/food/user'
  }

  if (storedRoute.startsWith('/taxi/')) return storedRoute.split('?')[0]
  if (storedRoute.startsWith('/food/user')) return '/food/user'
  if (
    storedRoute.startsWith('/food/') &&
    !storedRoute.startsWith('/food/restaurant') &&
    !storedRoute.startsWith('/food/delivery') &&
    !storedRoute.startsWith('/food/admin')
  ) {
    return storedRoute.split('?')[0]
  }

  const activeModule = String(localStorage.getItem(ACTIVE_MODULE_KEY) || '').trim()
  if (activeModule === 'taxi') return '/taxi/user'
  // food (or anything else, including stale "admin") → consumer home
  return '/food/user'
}

/**
 * Back from /login while still logged out.
 * Never return auth-gated routes (e.g. /taxi/user/activity) — they redirect
 * straight back to /login and look like a broken back button.
 */
export function resolveLoginBackRoute(locationStateFrom) {
  const fromPath = String(locationStateFrom || '').trim().split('?')[0]
  const storedReturn = peekLoginReturnTo()
  const activeModule = typeof localStorage !== 'undefined'
    ? String(localStorage.getItem(ACTIVE_MODULE_KEY) || '').trim()
    : ''

  const hint = fromPath || storedReturn || activeModule

  if (hint.startsWith('/taxi/') || hint === 'taxi' || hint.includes('/taxi/')) {
    return '/taxi/user'
  }
  if (hint.startsWith('/food/') || hint === 'food') {
    return '/food/user'
  }

  // Default: prefer taxi home if module unknown but last gated path was taxi-ish
  if (isAuthGatedRoute(fromPath) || isAuthGatedRoute(storedReturn)) {
    return toPublicModuleHome(fromPath || storedReturn) || '/taxi/user'
  }

  return '/taxi/user'
}
