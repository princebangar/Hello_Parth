import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import {
  FOOD_ADMIN_HOME,
  TAXI_ADMIN_HOME,
  prefetchFoodAdmin,
  prefetchTaxiAdmin,
  resolveLegacyTaxiAdminPath,
} from '@/shared/utils/activeModule.js'
import { getModuleAccess, readAdminProfile } from '@/shared/utils/adminAccess.js'

import { FoodAdminRouter, TaxiApp } from '@/shared/utils/appChunks.js'

// Where the not-yet-opened sibling pane is parked while it warms up hidden.
const warmLocation = (pathname) => ({ pathname, search: '', hash: '', state: null, key: `warm-${pathname}` });
const WARM_DELAY_MS = 2000;

/**
 * Keeps Food admin (/admin/*) and Taxi admin (/taxi/admin/*) mounted so Food ↔ Taxi tab switches are instant
 * (hide/show, no remount flash).
 *
 * The other panel is not left for the first click: a couple of seconds after the open one has settled it is
 * mounted hidden in the background (chunks, providers, first screen), so even the FIRST switch is only a
 * show/hide. Waiting for the click made that first switch mount a whole panel on screen, which is what showed up
 * as a flash. Only done for an admin who may open the other panel.
 */
export default function AdminModulesKeepAlive() {
  const location = useLocation()
  const legacyTaxiTarget = resolveLegacyTaxiAdminPath(location.pathname)
  const isFoodAdmin = !legacyTaxiTarget && String(location.pathname || '').startsWith('/admin')
  const isTaxiAdmin = String(location.pathname || '').startsWith('/taxi/admin')
  const active = isFoodAdmin ? 'food' : isTaxiAdmin ? 'taxi' : null

  const [visitedFood, setVisitedFood] = useState(false)
  const [visitedTaxi, setVisitedTaxi] = useState(false)
  const [foodLocation, setFoodLocation] = useState(null)
  const [taxiLocation, setTaxiLocation] = useState(null)
  const [warmFood, setWarmFood] = useState(false)
  const [warmTaxi, setWarmTaxi] = useState(false)

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
    setWarmFood(false)
    setWarmTaxi(false)
  }, [active])

  // Mount the sibling panel hidden once the open one has had a moment to settle.
  useEffect(() => {
    if (!active) return undefined
    const sibling = active === 'food' ? 'taxi' : 'food'
    if (!getModuleAccess(readAdminProfile())[sibling]) return undefined

    let idleId = null
    const timer = window.setTimeout(() => {
      const mount = () => (sibling === 'taxi' ? setWarmTaxi(true) : setWarmFood(true))
      if (window.requestIdleCallback) idleId = window.requestIdleCallback(mount, { timeout: 3000 })
      else mount()
    }, WARM_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
      if (idleId !== null && window.cancelIdleCallback) window.cancelIdleCallback(idleId)
    }
  }, [active])

  // Warm the sibling admin module as soon as either side is open.
  useEffect(() => {
    if (!active) return
    prefetchFoodAdmin()
    prefetchTaxiAdmin()
  }, [active])

  // Old-Taxi links (/admin/drivers/…) -> real Taxi admin URL, without ever mounting the Food shell.
  if (legacyTaxiTarget) {
    return <Navigate to={`${legacyTaxiTarget}${location.search}${location.hash}`} replace />
  }

  if (!active) return null

  // Active pane uses live location immediately (no blank first frame).
  // Inactive pane keeps frozen location so nested routes stay mounted.
  const showFood = active === 'food' || visitedFood || warmFood
  const showTaxi = active === 'taxi' || visitedTaxi || warmTaxi
  const effectiveFoodLocation = active === 'food' ? location : foodLocation || (warmFood ? warmLocation(FOOD_ADMIN_HOME) : null)
  const effectiveTaxiLocation = active === 'taxi' ? location : taxiLocation || (warmTaxi ? warmLocation(TAXI_ADMIN_HOME) : null)

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
