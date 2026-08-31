import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import {
  NATIVE_LAST_ROUTE_KEY,
  rememberLoginReturnTo,
  syncActiveModule,
  resolveAppColdStartRoute,
  prefetchFoodUser,
  prefetchTaxiUser,
  prefetchFoodAdmin,
  prefetchTaxiAdmin,
} from '../shared/utils/activeModule.js'
import AdminModulesKeepAlive, { AdminKeepAliveSlot } from './AdminModulesKeepAlive.jsx'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const TaxiApp = lazy(() => import('../modules/Taxi/TaxiApp'))
const AuthApp = lazy(() => import('../modules/auth/routes'))

// Avoid full-screen white spinner flash on Food ↔ Taxi switches.
const SoftFallback = () => <div className="min-h-screen bg-transparent" aria-hidden="true" />

const FoodAppWrapper = () => {
  const location = useLocation()
  const vertical = new URLSearchParams(location.search).get('vertical')

  // Taxi lives under /taxi/* only — never embed it on /food/user.
  if (
    location.pathname.replace(/\/$/, '') === '/food/user' &&
    vertical === 'taxi'
  ) {
    return <Navigate to="/taxi/user" replace />
  }

  return (
    <Suspense fallback={<SoftFallback />}>
      <FoodApp />
    </Suspense>
  )
}

const TaxiAppWrapper = () => (
  <Suspense fallback={<SoftFallback />}>
    <TaxiApp />
  </Suspense>
)

const RedirectToFood = () => {
  const location = useLocation()
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />
}

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    syncActiveModule(location.pathname)
    rememberLoginReturnTo(location.pathname)
  }, [location.pathname])

  // Warm sibling modules on idle so Food ↔ Taxi (user + admin) switches stay smooth.
  useEffect(() => {
    const path = location.pathname || ''
    const warm = () => {
      if (path.startsWith('/food/user') || path === '/food' || path.startsWith('/food/user/')) {
        prefetchTaxiUser()
      } else if (path.startsWith('/taxi/user')) {
        prefetchFoodUser()
      } else if (path.startsWith('/admin')) {
        prefetchTaxiAdmin()
      } else if (path.startsWith('/taxi/admin')) {
        prefetchFoodAdmin()
      }
    }

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 1200 })
      : window.setTimeout(warm, 300)

    return () => {
      if (window.cancelIdleCallback && typeof idle === 'number') {
        window.cancelIdleCallback(idle)
      } else {
        window.clearTimeout(idle)
      }
    }
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return

    const route = `${location.pathname || ''}${location.search || ''}`

    // Do NOT persist transient ride-flow routes that rely on React Router state.
    // If the app reopens on these pages the state is lost, showing stale data.
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
    const isTransient = TRANSIENT_ROUTE_SEGMENTS.some(seg => route.includes(seg))
    if (isTransient) {
      // Still remember module so cold start opens Taxi/Food home correctly.
      if (route.includes('/taxi/')) {
        localStorage.setItem(NATIVE_LAST_ROUTE_KEY, '/taxi/user')
      } else if (route.includes('/food/user')) {
        localStorage.setItem(NATIVE_LAST_ROUTE_KEY, '/food/user')
      }
      return
    }

    if (route.startsWith('/taxi/') || route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <>
      {/* Food ↔ Taxi admin: keep both shells mounted after first visit (instant hide/show). */}
      <AdminModulesKeepAlive />

      <Routes>
        <Route path="/" element={<Navigate to={resolveAppColdStartRoute()} replace />} />
        <Route path="/login/*" element={<Suspense fallback={<SoftFallback />}><AuthApp /></Suspense>} />
        <Route path="/food/*" element={<FoodAppWrapper />} />
        {/* More specific than /taxi/* — UI comes from AdminModulesKeepAlive. */}
        <Route path="/taxi/admin/*" element={<AdminKeepAliveSlot />} />
        <Route path="/taxi/*" element={<TaxiAppWrapper />} />
        {/* UI comes from AdminModulesKeepAlive. */}
        <Route path="/admin/*" element={<AdminKeepAliveSlot />} />
        <Route path="/user/*" element={<RedirectToFood />} />
        <Route path="/restaurant/*" element={<RedirectToFood />} />
        <Route path="/delivery/*" element={<RedirectToFood />} />
        <Route path="/usermain/*" element={<RedirectToFood />} />
        <Route path="/profile/*" element={<RedirectToFood />} />
        <Route path="/cart/*" element={<Navigate to="/food/user/cart" replace />} />
        <Route path="/orders/*" element={<RedirectToFood />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default AppRoutes
