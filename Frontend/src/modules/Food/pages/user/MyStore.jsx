import { useEffect, useMemo, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { ArrowLeft, Star, Store, Zap, MapPinOff } from "lucide-react"
import { Card, CardContent } from "@food/components/ui/card"
import { restaurantAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { useLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useProfile } from "@food/context/ProfileContext"
import { useDelayedLoading } from "@food/hooks/useDelayedLoading"
import { filterRestaurantsForVegMode } from "@food/utils/vegMode"
import { toFoodUserPath, getRestaurantRouteId } from "@food/utils/mainTabRoutes"
import RestaurantImageCarousel from "@food/components/user/RestaurantImageCarousel"
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons"
import useMyStoreEnabled from "@/shared/hooks/useMyStoreEnabled.js"

const BACKEND_ORIGIN = (API_BASE_URL || "").replace(/\/api\/v1\/?$/, "")

/**
 * "My Store" — Hello Parth's own brand stores in the user's zone. The only place
 * these stores are listed (they are kept out of delivery / takeaway / dining).
 * Cards look like the home restaurant cards; tapping one opens the normal
 * restaurant page, so menu, cart and checkout work as usual.
 */
export default function MyStore() {
  const myStoreEnabled = useMyStoreEnabled()
  const goBack = useAppBackNavigation()
  const { location } = useLocation()
  const { zoneId, isOutOfService } = useZone(location)
  const { vegMode, vegModeOption } = useProfile()
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const showSkeleton = useDelayedLoading(loading)

  const lat = Number(location?.latitude)
  const lng = Number(location?.longitude)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

  useEffect(() => {
    if (!zoneId) {
      // Still detecting the zone: keep the skeleton. Out of service: nothing to load.
      setStores([])
      setLoading(!isOutOfService)
      return undefined
    }
    let alive = true
    setLoading(true)
    setError("")
    restaurantAPI
      .getMyStores({ zoneId, ...(hasCoords ? { lat, lng } : {}) })
      .then((res) => {
        if (!alive) return
        const data = res?.data?.data || res?.data || {}
        setStores(Array.isArray(data.restaurants) ? data.restaurants : [])
      })
      .catch((err) => {
        if (!alive) return
        setStores([])
        setError(err?.response?.data?.message || "Could not load stores. Please try again.")
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [zoneId, isOutOfService, hasCoords, lat, lng])

  const visibleStores = useMemo(
    () => filterRestaurantsForVegMode(stores, { vegMode, vegModeOption }),
    [stores, vegMode, vegModeOption],
  )

  // Switched off by the Global admin: nothing to show here, send the customer to the Food home.
  if (!myStoreEnabled) return <Navigate to={toFoodUserPath("/user")} replace />

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-[#0a0a0a]/95">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition-all active:scale-90 dark:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5 text-gray-800 dark:text-gray-100" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight text-gray-900 dark:text-white">My Store</h1>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">Hello Parth brand stores near you</p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {showSkeleton && (
          <RestaurantGridSkeleton count={3} className="grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" compact />
        )}

        {!loading && error && (
          <p className="py-16 text-center text-sm text-red-500 dark:text-red-400">{error}</p>
        )}

        {!loading && !error && isOutOfService && !zoneId && (
          <div className="flex flex-col items-center py-16 text-center">
            <MapPinOff className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-base font-bold text-gray-800 dark:text-gray-200">We don&apos;t serve your area yet</p>
            <p className="mt-1 max-w-xs text-sm text-gray-500 dark:text-gray-400">
              Change your location to see the stores available near you.
            </p>
          </div>
        )}

        {!loading && !error && zoneId && visibleStores.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <Store className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-base font-bold text-gray-800 dark:text-gray-200">No stores in your area yet</p>
            <p className="mt-1 max-w-xs text-sm text-gray-500 dark:text-gray-400">
              Our brand stores will show up here as soon as they open near you.
            </p>
          </div>
        )}

        {!loading && !error && visibleStores.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {visibleStores.map((store, index) => {
              const routeId = getRestaurantRouteId(store)
              const rating = Number(store.rating)
              return (
                <Link
                  key={store.id || store._id || routeId}
                  to={toFoodUserPath(`/user/restaurants/${routeId}`)}
                  state={{ restaurantData: store }}
                  className="flex h-full"
                >
                  <Card className="group relative flex h-full w-full cursor-pointer flex-col gap-0 overflow-hidden rounded-[28px] border border-gray-200/70 bg-white py-0 shadow-md transition-all duration-300 hover:shadow-xl active:scale-[0.99] dark:border-gray-800/80 dark:bg-[#1a1a1a]">
                    <RestaurantImageCarousel
                      restaurant={store}
                      priority={index < 2}
                      backendOrigin={BACKEND_ORIGIN}
                      focusId={store.id || routeId}
                    />
                    <CardContent className="flex flex-grow flex-col p-3 pt-3 sm:p-4 sm:pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-2xl font-bold leading-tight tracking-tight text-[#1c1c1c] dark:text-white">
                            {store.name || store.restaurantName}
                          </h3>
                          {(store.estimatedDeliveryTime || store.distance) && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[#257d3c]">
                              <Zap className="h-4 w-4 fill-[#257d3c]" strokeWidth={2.5} />
                              {store.estimatedDeliveryTime && <span>{store.estimatedDeliveryTime}</span>}
                              {store.estimatedDeliveryTime && store.distance && (
                                <span className="mx-1 font-bold">|</span>
                              )}
                              {store.distance && <span>{store.distance}</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-[#257d3c] px-2 py-1 text-white">
                          <Star className="h-3.5 w-3.5 fill-white text-white" strokeWidth={0} />
                          <span className="text-sm font-bold tracking-tight">
                            {rating > 0 ? rating.toFixed(1) : "NEW"}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
