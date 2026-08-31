import { Suspense, lazy, useEffect, useLayoutEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { prefetchFoodAdmin, prefetchTaxiAdmin } from '@/shared/utils/activeModule.js'

const FoodAdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter.jsx'))
const TaxiApp = lazy(() => import('../modules/Taxi/TaxiApp.jsx'))

/**
 * Keeps Food admin (/admin/*) and Taxi admin (/taxi/admin/*) mounted after first visit
 * so Food ↔ Taxi tab switches are instant (hide/show, no remount flash).
 */
export default function AdminModulesKeepAlive() {
  const location = useLocation()
  const isFoodAdmin = String(location.pathname || '').startsWith('/admin')
  const isTaxiAdmin = String(location.pathname || '').startsWith('/taxi/admin')
  const active = isFoodAdmin ? 'food' : isTaxiAdmin ? 'taxi' : null

  const [visitedFood, setVisitedFood] = useState(false)
  const [visitedTaxi, setVisitedTaxi] = useState(false)
  const [foodLocation, setFoodLocation] = useState(null)
  const [taxiLocation, setTaxiLocation] = useState(null)

  useLayoutEffect(() => {
    if (!active) return

    if (active === 'food') {
      setVisitedFood(true)
      setFoodLocation(location)
    }

    if (active === 'taxi') {
      setVisitedTaxi(true)
      setTaxiLocation(location)
    }
  }, [active, location])

  // Free memory when leaving admin entirely (user/driver/food consumer).
  useEffect(() => {
    if (active) return
    setVisitedFood(false)
    setVisitedTaxi(false)
    setFoodLocation(null)
    setTaxiLocation(null)
  }, [active])

  // Warm the sibling admin module as soon as either side is open.
  useEffect(() => {
    if (!active) return
    prefetchFoodAdmin()
    prefetchTaxiAdmin()
  }, [active])

  if (!active) return null

  // Active pane uses live location immediately (no blank first frame).
  // Inactive pane keeps frozen location so nested routes stay mounted.
  const showFood = active === 'food' || visitedFood
  const showTaxi = active === 'taxi' || visitedTaxi
  const effectiveFoodLocation = active === 'food' ? location : foodLocation
  const effectiveTaxiLocation = active === 'taxi' ? location : taxiLocation

  return (
    <>
      {showFood && effectiveFoodLocation ? (
        <div
          className="admin-module-keepalive admin-module-keepalive--food"
          style={{ display: active === 'food' ? 'block' : 'none' }}
          aria-hidden={active !== 'food'}
        >
          <Suspense fallback={null}>
            <Routes location={effectiveFoodLocation}>
              <Route path="/admin/*" element={<FoodAdminRouter />} />
            </Routes>
          </Suspense>
        </div>
      ) : null}

      {showTaxi && effectiveTaxiLocation ? (
        <div
          className="admin-module-keepalive admin-module-keepalive--taxi"
          style={{ display: active === 'taxi' ? 'block' : 'none' }}
          aria-hidden={active !== 'taxi'}
        >
          <Suspense fallback={null}>
            <Routes location={effectiveTaxiLocation}>
              <Route path="/taxi/*" element={<TaxiApp />} />
            </Routes>
          </Suspense>
        </div>
      ) : null}
    </>
  )
}

/** Placeholder route element — real UI is rendered by AdminModulesKeepAlive. */
export function AdminKeepAliveSlot() {
  return null
}
