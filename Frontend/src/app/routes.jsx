import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import Loader from '../shared/components/Loader.jsx'
import {
  NATIVE_LAST_ROUTE_KEY,
  rememberLoginReturnTo,
  syncActiveModule,
  resolveAppColdStartRoute,
} from '../shared/utils/activeModule.js'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const TaxiApp = lazy(() => import('../modules/Taxi/TaxiApp'))
const AuthApp = lazy(() => import('../modules/auth/routes'))

const PageLoader = () => <Loader />

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
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const TaxiAppWrapper = () => (
  <Suspense fallback={<PageLoader />}>
    <TaxiApp />
  </Suspense>
)

const RedirectToFood = () => {
  const location = useLocation()
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />
}

const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    syncActiveModule(location.pathname)
    rememberLoginReturnTo(location.pathname)
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
    <Routes>
      <Route path="/" element={<Navigate to={resolveAppColdStartRoute()} replace />} />
      <Route path="/login/*" element={<Suspense fallback={<PageLoader />}><AuthApp /></Suspense>} />
      <Route path="/food/*" element={<FoodAppWrapper />} />
      <Route path="/taxi/*" element={<TaxiAppWrapper />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRouter />
          </Suspense>
        }
      />
      <Route path="/user/*" element={<RedirectToFood />} />
      <Route path="/restaurant/*" element={<RedirectToFood />} />
      <Route path="/delivery/*" element={<RedirectToFood />} />
      <Route path="/usermain/*" element={<RedirectToFood />} />
      <Route path="/profile/*" element={<RedirectToFood />} />
      <Route path="/cart/*" element={<Navigate to="/food/user/cart" replace />} />
      <Route path="/orders/*" element={<RedirectToFood />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
