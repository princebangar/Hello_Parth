import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useBottomNavSpace } from '@/native/ui/useBottomNavSpace';
import { Animated, Easing, FlatList, Linking, PanResponder, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from "react-native"
import { Image as ExpoImage } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Star, Clock, MapPin, ArrowDownUp, Timer, ArrowRight, ChevronDown, Bookmark, Share2, Plus, Minus, X, Check, Utensils, Wallet } from "lucide-react-native"
import { Link, useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { AppImage, Dialog, Sheet, Skeleton, Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"
import { buildShareUrl, restaurantSharePath } from '@/shared/utils/shareLinks'
import { useLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import under250Banner from "@food/assets/under250_banner.jpg"
import AddToCartAnimation from "@food/components/user/AddToCartAnimation"
import OptimizedImage from "@food/components/OptimizedImage"
import api from "@food/api"
import { restaurantAPI, adminAPI } from "@food/api"
import { isModuleAuthenticated } from "@food/utils/auth"
import { calculateDistance, formatDistance } from "@food/utils/common"
import { hasFoodVariants, getDefaultFoodVariant, buildCartLineId } from "@food/utils/foodVariants"
import { isVegMenuItem, isNonVegCategoryScope } from "@food/utils/vegMode"
import {
  buildFoodCacheKey,
  getCachedUnder250PriceLimit,
  getFoodPageCache,
  getLandingSettingsPublic,
  setFoodPageCache,
} from "@food/utils/foodPageCache"
const getLineItemIdForDish = (item, variant = null) =>
  buildCartLineId(item?.id || item?._id || "", variant?.id || variant?._id || "")

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
const RUPEE_SYMBOL = "\u20B9"
const UNDER_250_FILTERS_STORAGE_KEY = "food-under-250-filters"
const UNDER250_LIST_MAX_VISIBLE = 12
const UNDER250_ITEMS_PER_RESTAURANT = 10
const UNDER250_PAGE_SIZE = 6
const UNDER250_CACHE_TTL_MS = 15 * 60 * 1000

const isUnder250CacheFresh = (cached) =>
  Boolean(
    cached?.restaurants?.length > 0 &&
      cached?.ts &&
      Date.now() - Number(cached.ts) < UNDER250_CACHE_TTL_MS,
  )

const mapUnder250Restaurants = (restaurantsRaw, location) => {
  const userLat = Number(location?.latitude)
  const userLng = Number(location?.longitude)

  return (Array.isArray(restaurantsRaw) ? restaurantsRaw : []).map((restaurant) => {
    const restaurantId = restaurant?.restaurantId || restaurant?.id || restaurant?._id

    const restaurantLocation = restaurant?.location
    const restaurantLat = Number(
      restaurantLocation?.latitude ??
        (Array.isArray(restaurantLocation?.coordinates)
          ? restaurantLocation.coordinates[1]
          : null),
    )
    const restaurantLng = Number(
      restaurantLocation?.longitude ??
        (Array.isArray(restaurantLocation?.coordinates)
          ? restaurantLocation.coordinates[0]
          : null),
    )
    const distanceInKm =
      Number.isFinite(userLat) &&
      Number.isFinite(userLng) &&
      Number.isFinite(restaurantLat) &&
      Number.isFinite(restaurantLng)
        ? calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
        : null

    const fallbackDistance =
      typeof restaurant?.distance === "number"
        ? formatDistance(restaurant.distance)
        : restaurant?.distance || ""

    const mappedItems = (restaurant.menuItems || [])
      .slice(0, UNDER250_ITEMS_PER_RESTAURANT)
      .map((item) => ({
        ...item,
        id: String(item.id || item._id),
        price: Number(item.price || 0),
        foodType: item.foodType || (item.isVeg ? "Veg" : "Non-Veg"),
        isVeg: isVegMenuItem(item),
        image: item?.image || "",
      }))
    const hasNonVegInPayload = mappedItems.some((item) => !item.isVeg)
    const hasNonVegMenu =
      restaurant?.hasNonVegMenu === true || hasNonVegInPayload
        ? true
        : restaurant?.hasNonVegMenu === false
          ? false
          : undefined

    return {
      ...restaurant,
      id: String(restaurantId),
      restaurantId: String(restaurantId),
      name: restaurant?.restaurantName || restaurant?.name || "Restaurant",
      rating: Number(restaurant?.rating || 0),
      totalRatings: Number(restaurant?.totalRatings || restaurant?.ratingCount || 0),
      deliveryTime:
        restaurant?.estimatedDeliveryTime ||
        (restaurant?.estimatedDeliveryTimeMinutes
          ? `${restaurant.estimatedDeliveryTimeMinutes} mins`
          : "30 mins"),
      distance: distanceInKm !== null ? formatDistance(distanceInKm) : fallbackDistance,
      distanceInKm,
      hasNonVegMenu,
      isPureVeg:
        hasNonVegMenu === true
          ? false
          : restaurant?.isPureVeg === true ||
            (hasNonVegMenu === false &&
              (restaurant?.pureVegRestaurant === true ||
                mappedItems.some((item) => item.isVeg))),
      menuItems: mappedItems,
    }
  })
}

const readUnder250Filters = () => {
  if (typeof window === "undefined") {
    return {
      selectedSort: null,
      activeCategory: null,
      under30MinsFilter: false,
    }
  }

  try {
    const raw = window.localStorage.getItem(UNDER_250_FILTERS_STORAGE_KEY)
    if (!raw) {
      return {
        selectedSort: null,
        activeCategory: null,
        under30MinsFilter: false,
      }
    }

    const parsed = JSON.parse(raw)
    return {
      selectedSort: typeof parsed?.selectedSort === "string" ? parsed.selectedSort : null,
      activeCategory: typeof parsed?.activeCategory === "string" ? parsed.activeCategory : null,
      under30MinsFilter: parsed?.under30MinsFilter === true,
    }
  } catch {
    return {
      selectedSort: null,
      activeCategory: null,
      under30MinsFilter: false,
    }
  }
}


export default function Under250({ isTabActive = true }) {
  const initialFiltersRef = useRef(readUnder250Filters())
  const { location } = useLocation()
  const { zoneId, zoneStatus, isInService, isOutOfService } = useZone(location)
  const { userProfile, vegMode, vegModeOption } = useProfile()

  const navigate = useNavigate()
  const { addToCart, updateQuantity, removeFromCart, getCartItem, cart } = useCart()
  const [activeCategory, setActiveCategory] = useState(initialFiltersRef.current.activeCategory)
  const [showSortPopup, setShowSortPopup] = useState(false)
  const [selectedSort, setSelectedSort] = useState(initialFiltersRef.current.selectedSort)
  const [draftSelectedSort, setDraftSelectedSort] = useState(initialFiltersRef.current.selectedSort)
  const [under30MinsFilter, setUnder30MinsFilter] = useState(initialFiltersRef.current.under30MinsFilter)
  const [showItemDetail, setShowItemDetail] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [itemDetailQuantity, setItemDetailQuantity] = useState(1)
  const [showShareOptions, setShowShareOptions] = useState(false)
  const [quantities, setQuantities] = useState({})
  const [bookmarkedItems, setBookmarkedItems] = useState(new Set())
  const [viewCartButtonBottom, setViewCartButtonBottom] = useState("bottom-[92px]")
  const lastScrollY = useRef(0)
  const itemDetailContentScrollTopRef = useRef(0)
  const itemDetailGestureRef = useRef({
    startY: 0,
    dragging: false,
  })
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [bannerImages, setBannerImages] = useState([])
  const [loadingBanner, setLoadingBanner] = useState(true)
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true)
  const [under250PriceLimit, setUnder250PriceLimit] = useState(() =>
    getCachedUnder250PriceLimit(250),
  )
  const cacheKey = buildFoodCacheKey("under250", {
    zoneId: zoneId || "none",
    limit: under250PriceLimit,
  })
  const cachedListRef = useRef(getFoodPageCache(cacheKey))
  const [under250Restaurants, setUnder250Restaurants] = useState(
    () => cachedListRef.current?.restaurants || [],
  )
  const [loadingRestaurants, setLoadingRestaurants] = useState(
    () => !(cachedListRef.current?.restaurants?.length > 0),
  )
  const [visibleRestaurantCount, setVisibleRestaurantCount] = useState(UNDER250_LIST_MAX_VISIBLE)
  const [hasScrolledPastBanner, setHasScrolledPastBanner] = useState(false)
  const autoSlideIntervalRef = useRef(null)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const touchEndXRef = useRef(0)
  const touchEndYRef = useRef(0)
  const isBannerSwipingRef = useRef(false)
  const fetchInflightRef = useRef(null)

  const sortOptions = [
    { id: null, label: 'Relevance' },
    { id: 'rating-high', label: 'Rating: High to Low' },
    { id: 'delivery-time-low', label: 'Estimated Time: Low to High' },
    { id: 'distance-low', label: 'Distance: Low to High' },
  ]

  const handleClearAll = () => {
    setSelectedSort(null)
    setDraftSelectedSort(null)
    setUnder30MinsFilter(false)
    setActiveCategory(null)
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(UNDER_250_FILTERS_STORAGE_KEY)
    }
  }

  const handleApply = () => {
    setSelectedSort(draftSelectedSort)
    setShowSortPopup(false)
  }

  // Helper function to parse delivery time (e.g., "12-15 mins" -> 12 or average)
  const parseDeliveryTime = (deliveryTime) => {
    if (typeof deliveryTime === "number" && Number.isFinite(deliveryTime)) return deliveryTime
    if (!deliveryTime) return 999 // Default high value for sorting
    const value = String(deliveryTime)
    const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/)
    if (rangeMatch) {
      return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2 // Average
    }
    const match = value.match(/(\d+)/)
    if (match) {
      return parseInt(match[1])
    }
    return 999
  }

  // Helper function to parse distance (e.g., "0.4 km" -> 0.4)
  const parseDistance = (distance) => {
    if (typeof distance === "number" && Number.isFinite(distance)) return distance
    if (!distance) return 999 // Default high value for sorting
    const value = String(distance)
    const match = value.match(/(\d+\.?\d*)/)
    if (match) {
      const numericValue = parseFloat(match[1])
      return value.toLowerCase().includes("m") && !value.toLowerCase().includes("km")
        ? numericValue / 1000
        : numericValue
    }
    return 999
  }

  // Sort and filter restaurants based on selected sort, filters, and veg mode
  const sortedAndFilteredRestaurants = useMemo(() => {
    let filtered = under250Restaurants.map((r) => ({
      ...r,
      menuItems: [...(r.menuItems || [])],
    }))

    // Veg mode: pure-veg restaurants only, or all restaurants with veg dishes only
    if (vegMode) {
      if (vegModeOption === "pure-veg") {
        filtered = filtered.filter((restaurant) => {
          // Full-menu signal from API (any price) — don't trust under-250 items alone
          if (restaurant?.hasNonVegMenu === true) return false
          if (restaurant?.isPureVeg === true) return true
          if (restaurant?.hasNonVegMenu === false) {
            // Menu scanned: no non-veg anywhere; allow even if admin flag is wrong/missing
            return true
          }
          const items = restaurant.menuItems || []
          const hasNonVegDish = items.some((item) => !isVegMenuItem(item))
          return restaurant?.pureVegRestaurant === true && !hasNonVegDish
        })
      }
      filtered = filtered
        .map((restaurant) => {
          const vegItems = (restaurant.menuItems || []).filter(isVegMenuItem)
          if (vegItems.length === 0) return null
          return { ...restaurant, menuItems: vegItems }
        })
        .filter(Boolean)
    }

    // Apply category filter
    if (activeCategory) {
      const selectedCat = categories.find((cat) => cat.id === activeCategory)
      if (selectedCat) {
        const catNameLower = String(selectedCat.name || "").toLowerCase()
        filtered = filtered
          .map((restaurant) => {
            const matches = restaurant.menuItems.filter((item) => {
              const itemCat = String(item.categoryName || item.category || item.sectionName || item.subsectionName || "").toLowerCase()
              const itemName = String(item.name || "").toLowerCase()
              const itemDesc = String(item.description || "").toLowerCase()
              return (
                (itemCat && (itemCat.includes(catNameLower) || catNameLower.includes(itemCat))) ||
                (itemName && (itemName.includes(catNameLower) || catNameLower.includes(itemName))) ||
                (itemDesc && itemDesc.includes(catNameLower))
              )
            })
            if (matches.length > 0) {
              return { ...restaurant, menuItems: matches }
            }
            return null
          })
          .filter(Boolean)
      }
    }

    // Apply "Under 30 mins" filter
    if (under30MinsFilter) {
      filtered = filtered.filter((restaurant) => {
        const deliveryTime = parseDeliveryTime(restaurant.deliveryTime)
        return deliveryTime <= 30
      })
    }

    // Apply sorting
    if (selectedSort === "rating-high") {
      filtered.sort((a, b) => {
        const ratingA = a.rating || 0
        const ratingB = b.rating || 0
        if (ratingB !== ratingA) {
          return ratingB - ratingA
        }
        return (b.menuItems?.length || 0) - (a.menuItems?.length || 0)
      })
    } else if (selectedSort === "delivery-time-low") {
      filtered.sort((a, b) => {
        const timeA = parseDeliveryTime(a.deliveryTime)
        const timeB = parseDeliveryTime(b.deliveryTime)
        if (timeA !== timeB) {
          return timeA - timeB
        }
        if ((b.rating || 0) !== (a.rating || 0)) {
          return (b.rating || 0) - (a.rating || 0)
        }
        return (a.originalIndex || 0) - (b.originalIndex || 0)
      })
    } else if (selectedSort === "distance-low") {
      filtered.sort((a, b) => {
        const distA = Number.isFinite(a.distanceInKm)
          ? a.distanceInKm
          : parseDistance(a.distance)
        const distB = Number.isFinite(b.distanceInKm)
          ? b.distanceInKm
          : parseDistance(b.distance)
        if (distA !== distB) {
          return distA - distB
        }
        if ((b.rating || 0) !== (a.rating || 0)) {
          return (b.rating || 0) - (a.rating || 0)
        }
        return (a.originalIndex || 0) - (b.originalIndex || 0)
      })
    }

    const sortedResult = filtered
      .map((restaurant, index) => ({ restaurant, index }))
      .sort((a, b) => {
        const aAvail = getRestaurantAvailabilityStatus(a.restaurant)
        const bAvail = getRestaurantAvailabilityStatus(b.restaurant)
        
        const aOpen = aAvail?.isOpen ? 1 : 0
        const bOpen = bAvail?.isOpen ? 1 : 0
        
        if (aOpen !== bOpen) {
          return bOpen - aOpen
        }
        
        return a.index - b.index
      })
      .map(item => item.restaurant)

    return sortedResult
  }, [
    under250Restaurants,
    selectedSort,
    under30MinsFilter,
    activeCategory,
    categories,
    vegMode,
    vegModeOption,
  ])

  const displayCategories = useMemo(() => {
    let baseCats = categories
    if (vegMode) {
      baseCats = baseCats.filter((cat) => !isNonVegCategoryScope(cat))
    }
    if (!under250Restaurants || under250Restaurants.length === 0) {
      return baseCats
    }

    const availableItems = under250Restaurants.flatMap((r) => r.menuItems || [])
    if (availableItems.length === 0) return baseCats

    return baseCats.filter((cat) => {
      const catNameLower = String(cat.name || "").toLowerCase().trim()
      const catWords = catNameLower.split(/\s+/).filter(w => w.length > 2)

      return availableItems.some((item) => {
        const itemCat = String(item.categoryName || item.category || item.sectionName || item.subsectionName || item.categoryId || "").toLowerCase().trim()
        const itemName = String(item.name || "").toLowerCase().trim()
        const itemDesc = String(item.description || "").toLowerCase().trim()

        if (itemCat && (itemCat.includes(catNameLower) || catNameLower.includes(itemCat))) return true
        if (itemName && (itemName.includes(catNameLower) || catNameLower.includes(itemName))) return true
        if (itemDesc && itemDesc.includes(catNameLower)) return true

        if (catWords.length > 0) {
          return catWords.some(word => itemCat.includes(word) || itemName.includes(word) || itemDesc.includes(word))
        }
        return false
      })
    })
  }, [categories, vegMode, under250Restaurants])

  // If active category was non-veg and veg mode turns on, clear it
  useEffect(() => {
    if (!vegMode || !activeCategory) return
    const selected = categories.find((cat) => cat.id === activeCategory)
    if (selected && isNonVegCategoryScope(selected)) {
      setActiveCategory(null)
    }
  }, [vegMode, activeCategory, categories])

  // Fetch under-50 banner from public API
  const loadBanner = useCallback((isCancelled = () => false) => {
    setLoadingBanner(true)
    const reqConfig = zoneId ? { params: { zoneId } } : {}
    return api.get('/food/hero-banners/under-250/public', reqConfig)
      .then((res) => {
        if (isCancelled()) return
        const data = res?.data?.data
        const list = Array.isArray(data?.banners) ? data.banners : (Array.isArray(data) ? data : [])
        const images = list
          .map((banner) => (typeof banner?.imageUrl === "string" ? banner.imageUrl.trim() : ""))
          .filter(Boolean)
        setBannerImages(images)
      })
      .catch(() => {
        if (!isCancelled()) setBannerImages([])
      })
      .finally(() => {
        if (!isCancelled()) setLoadingBanner(false)
      })
  }, [zoneId])

  useEffect(() => {
    let cancelled = false
    loadBanner(() => cancelled)
    return () => { cancelled = true }
  }, [loadBanner])

  // Fetch landing settings to get dynamic price limit (shared cache)
  useEffect(() => {
    let cancelled = false
    getLandingSettingsPublic(() =>
      api.get("/food/landing/settings/public", zoneId ? { params: { zoneId } } : {}),
    )
      .then((settings) => {
        if (cancelled) return
        if (settings && typeof settings.under250PriceLimit === "number") {
          setUnder250PriceLimit(settings.under250PriceLimit)
        }
      })
      .catch(() => {
        if (!cancelled) setUnder250PriceLimit(250)
      })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  useEffect(() => {
    setCurrentBannerIndex((prev) => {
      if (bannerImages.length === 0) return 0
      return Math.min(prev, bannerImages.length - 1)
    })
  }, [bannerImages.length])

  useEffect(() => {
    const urls = bannerImages.filter(Boolean)
    if (urls.length) ExpoImage.prefetch(urls).catch(() => {})
  }, [bannerImages])

  const startBannerAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) {
      clearInterval(autoSlideIntervalRef.current)
    }

    if (bannerImages.length <= 1) return

    autoSlideIntervalRef.current = setInterval(() => {
      if (!isBannerSwipingRef.current) {
        setIsTransitionEnabled(true)
        setCurrentBannerIndex((prev) => {
          if (prev >= bannerImages.length) return prev
          return prev + 1
        })
      }
    }, 3500)
  }, [bannerImages.length])

  // Handle snap-back when reaching the cloned slide at the end
  useEffect(() => {
    if (currentBannerIndex === bannerImages.length && bannerImages.length > 1) {
      const timer = setTimeout(() => {
        setIsTransitionEnabled(false)
        setCurrentBannerIndex(0)
      }, 500) // match transition duration
      return () => clearTimeout(timer)
    }
  }, [currentBannerIndex, bannerImages.length])

  // Re-enable transition after snap-back
  useEffect(() => {
    if (!isTransitionEnabled && currentBannerIndex === 0) {
      const timer = setTimeout(() => {
        setIsTransitionEnabled(true)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isTransitionEnabled, currentBannerIndex])

  const resetBannerAutoSlide = useCallback(() => {
    startBannerAutoSlide()
  }, [startBannerAutoSlide])

  useEffect(() => {
    startBannerAutoSlide()

    return () => {
      if (autoSlideIntervalRef.current) {
        clearInterval(autoSlideIntervalRef.current)
      }
    }
  }, [startBannerAutoSlide])

  const handleBannerTouchStart = useCallback(() => {
    if (bannerImages.length <= 1) return
    touchStartXRef.current = 0
    touchStartYRef.current = 0
    touchEndXRef.current = 0
    touchEndYRef.current = 0
    isBannerSwipingRef.current = true
  }, [bannerImages.length])

  const handleBannerTouchMove = useCallback((dx, dy) => {
    if (!isBannerSwipingRef.current) return
    touchEndXRef.current = dx
    touchEndYRef.current = dy
  }, [])

  const handleBannerTouchEnd = useCallback(() => {
    if (!isBannerSwipingRef.current || bannerImages.length <= 1) {
      isBannerSwipingRef.current = false
      return
    }

    const deltaX = touchEndXRef.current - touchStartXRef.current
    const deltaY = Math.abs(touchEndYRef.current - touchStartYRef.current)
    const minSwipeDistance = 40

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        if (currentBannerIndex === 0) {
          setIsTransitionEnabled(false)
          setCurrentBannerIndex(bannerImages.length)
          setTimeout(() => {
            setIsTransitionEnabled(true)
            setCurrentBannerIndex(bannerImages.length - 1)
          }, 50)
        } else {
          setIsTransitionEnabled(true)
          setCurrentBannerIndex((prev) => prev - 1)
        }
      } else {
        setIsTransitionEnabled(true)
        setCurrentBannerIndex((prev) => {
          if (prev >= bannerImages.length) return prev
          return prev + 1
        })
      }
      resetBannerAutoSlide()
    }

    isBannerSwipingRef.current = false
  }, [bannerImages.length, currentBannerIndex, resetBannerAutoSlide])

  // Recompute distances when GPS moves — do NOT refetch the heavy list
  useEffect(() => {
    const lat = Number(location?.latitude)
    const lng = Number(location?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    setUnder250Restaurants((prev) => {
      if (!prev.length) return prev
      let changed = false
      const next = prev.map((restaurant) => {
        const restaurantLocation = restaurant?.location
        const restaurantLat = Number(
          restaurantLocation?.latitude ??
            (Array.isArray(restaurantLocation?.coordinates)
              ? restaurantLocation.coordinates[1]
              : null),
        )
        const restaurantLng = Number(
          restaurantLocation?.longitude ??
            (Array.isArray(restaurantLocation?.coordinates)
              ? restaurantLocation.coordinates[0]
              : null),
        )
        if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
          return restaurant
        }
        const distanceInKm = calculateDistance(lat, lng, restaurantLat, restaurantLng)
        const distance = formatDistance(distanceInKm)
        if (restaurant.distanceInKm === distanceInKm && restaurant.distance === distance) {
          return restaurant
        }
        changed = true
        return { ...restaurant, distanceInKm, distance }
      })
      return changed ? next : prev
    })
  }, [location?.latitude, location?.longitude])

  // Progressive fetch: first 6 restaurants paint fast, rest append in background.
  // Fresh cache → show instantly, no full refresh on tab return. force = skip the cache (pull to refresh).
  const loadUnder250Restaurants = useCallback(async ({ force = false, isCancelled = () => false } = {}) => {
    if (!zoneId) {
      setLoadingRestaurants(false)
      return
    }

    const key = buildFoodCacheKey("under250", {
      zoneId,
      limit: under250PriceLimit,
    })
    const cached = force ? null : getFoodPageCache(key)

    if (isUnder250CacheFresh(cached)) {
      setUnder250Restaurants(mapUnder250Restaurants(cached.restaurants, location))
      setVisibleRestaurantCount(
        Math.max(UNDER250_LIST_MAX_VISIBLE, cached.restaurants.length),
      )
      setLoadingRestaurants(false)
      return
    }

    if (cached?.restaurants?.length) {
      setUnder250Restaurants(mapUnder250Restaurants(cached.restaurants, location))
      setLoadingRestaurants(false)
    } else if (under250Restaurants.length === 0) {
      setLoadingRestaurants(true)
    }

    const mergeUnique = (prev, incoming) => {
      const seen = new Set(prev.map((r) => String(r.id)))
      const next = [...prev]
      incoming.forEach((r) => {
        const id = String(r.id)
        if (seen.has(id)) return
        seen.add(id)
        next.push(r)
      })
      return next
    }

    try {
      // No "already in flight -> skip" guard: when this effect re-runs, the earlier run is cancelled and
      // never sets state, so skipping here left the list on its skeleton for good.
      fetchInflightRef.current = key

      let offset = 0
      let scanSkip = 0
      let hasMore = true
      let accumulatedRaw = cached?.restaurants?.length ? [...cached.restaurants] : []
      let page = 0

      while (hasMore && !isCancelled() && page < 25) {
        const response = await restaurantAPI.getRestaurantsUnder250({
          zoneId,
          priceLimit: under250PriceLimit,
          limit: UNDER250_PAGE_SIZE,
          offset,
          scanSkip: page === 0 ? 0 : scanSkip,
        })
        if (isCancelled()) return

        const data = response?.data?.data
        const batchRaw = Array.isArray(data?.restaurants) ? data.restaurants : []
        hasMore = data?.hasMore === true && batchRaw.length > 0
        scanSkip = Number(data?.scanSkip) || scanSkip
        offset = Number(data?.nextOffset) || offset + batchRaw.length

        if (batchRaw.length === 0) break

        accumulatedRaw = (() => {
          const seen = new Set(accumulatedRaw.map((r) => String(r._id || r.id || r.restaurantId)))
          const next = [...accumulatedRaw]
          batchRaw.forEach((r) => {
            const id = String(r._id || r.id || r.restaurantId)
            if (seen.has(id)) return
            seen.add(id)
            next.push(r)
          })
          return next
        })()

        const mappedBatch = mapUnder250Restaurants(batchRaw, location)
        setUnder250Restaurants((prev) =>
          page === 0 && !(cached?.restaurants?.length)
            ? mappedBatch
            : mergeUnique(prev, mappedBatch),
        )
        setVisibleRestaurantCount((n) =>
          Math.max(n, UNDER250_LIST_MAX_VISIBLE, (page + 1) * UNDER250_PAGE_SIZE),
        )
        setLoadingRestaurants(false)
        setFoodPageCache(key, { restaurants: accumulatedRaw, ts: Date.now() })

        page += 1
        if (!hasMore) break
        // Yield so UI stays responsive between pages
        await new Promise((r) => setTimeout(r, 50))
      }

      if (!isCancelled()) {
        setFoodPageCache(key, { restaurants: accumulatedRaw, ts: Date.now() })
        setLoadingRestaurants(false)
      }
    } catch (error) {
      if (!isCancelled()) {
        debugError("Error fetching restaurants under 250:", error)
        if (!(cached?.restaurants?.length > 0) && under250Restaurants.length === 0) {
          setUnder250Restaurants([])
        }
        setLoadingRestaurants(false)
      }
    } finally {
      if (fetchInflightRef.current === key) fetchInflightRef.current = null
    }
  }, [zoneId, under250PriceLimit, location, under250Restaurants.length])

  useEffect(() => {
    if (!isTabActive) return undefined
    let cancelled = false
    loadUnder250Restaurants({ isCancelled: () => cancelled })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location only used for mapping; GPS remapped separately
  }, [zoneId, under250PriceLimit, isTabActive])

  // Fetch categories from backend (no static fallback list)
  const fetchCategories = useCallback(async ({ showSkeleton = false, isCancelled = () => false } = {}) => {
    try {
      setLoadingCategories((prev) => showSkeleton || categories.length === 0 ? true : false)
      const response = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {})
      const categoriesRaw = Array.isArray(response?.data?.data?.categories)
        ? response.data.data.categories
        : []

      const mappedCategories = categoriesRaw
        .map((cat, index) => {
          const name = String(cat?.name || "").trim()
          if (!name) return null

          return {
            id: String(cat?.id || cat?._id || cat?.slug || `cat-${index}`),
            name,
            slug: String(cat?.slug || name.toLowerCase().replace(/\s+/g, "-")),
            foodTypeScope: String(cat?.foodTypeScope || cat?.type || "Both"),
            image:
              cat?.imageUrl ||
              cat?.image ||
              cat?.icon ||
              "",
          }
        })
        .filter(Boolean)

      if (!isCancelled()) {
        setCategories(mappedCategories)
        setLoadingCategories(false)
      }
    } catch (error) {
      debugError("Error fetching under-250 categories:", error)
      if (!isCancelled()) {
        setCategories([])
        setLoadingCategories(false)
      }
    }
  }, [zoneId, categories.length])

  useEffect(() => {
    let cancelled = false
    fetchCategories({ isCancelled: () => cancelled })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only reruns on zone change
  }, [zoneId])

  // Pull to refresh: the list and category row go back to their skeletons while they reload.
  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setUnder250Restaurants([])
    setLoadingRestaurants(true)
    try {
      await Promise.all([
        loadUnder250Restaurants({ force: true }),
        fetchCategories({ showSkeleton: true }),
        loadBanner(),
      ])
    } finally {
      setLoadingRestaurants(false)
      setRefreshing(false)
    }
  }, [loadUnder250Restaurants, fetchCategories, loadBanner])

  // Sync quantities from cart on mount. Keyed by "itemId::variantId" like the
  // cards look it up (a logged-in cart's line id is the server _id).
  useEffect(() => {
    const cartQuantities = {}
    cart.forEach((item) => {
      const key = buildCartLineId(item.itemId || item.productId || item.id, item.variantId || "")
      cartQuantities[key] = (cartQuantities[key] || 0) + (item.quantity || 0)
    })
    setQuantities(cartQuantities)
  }, [cart])

  useEffect(() => {
    if (!selectedItem || !showItemDetail) return

    const defaultVariant = getDefaultFoodVariant(selectedItem)
    const lineItemId = getLineItemIdForDish(selectedItem, defaultVariant)
    const existingQuantity = quantities[lineItemId] || 0
    if (existingQuantity > 0) {
      setItemDetailQuantity(existingQuantity)
    }
  }, [quantities, selectedItem, showItemDetail])

  useEffect(() => {
    if (!showSortPopup) return
    setDraftSelectedSort(selectedSort)
  }, [showSortPopup, selectedSort])

  // Keep-alive: leaving Under250 must unlock body + close sheets or Delivery taps feel dead
  useEffect(() => {
    if (isTabActive) return undefined
    setShowSortPopup(false)
    setShowItemDetail(false)
    setShowShareOptions(false)
    setSelectedItem(null)
    return undefined
  }, [isTabActive])

  useEffect(() => {
    if (typeof window === "undefined") return

    if (!selectedSort && !activeCategory && !under30MinsFilter) {
      window.localStorage.removeItem(UNDER_250_FILTERS_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(
      UNDER_250_FILTERS_STORAGE_KEY,
      JSON.stringify({
        selectedSort,
        activeCategory,
        under30MinsFilter,
      })
    )
  }, [selectedSort, activeCategory, under30MinsFilter])

  // Scroll detection for view cart button positioning (FlatList onScroll)
  const handleListScroll = useCallback((currentScrollY) => {
    {
      const scrollDifference = Math.abs(currentScrollY - lastScrollY.current)

      // Only update if scroll difference is significant (avoid flickering)
      if (scrollDifference < 5) {
        return
      }

      // Scroll down -> bottom-[72px], Scroll up -> bottom-[92px]
      if (currentScrollY > lastScrollY.current) {
        // Scrolling down
        setViewCartButtonBottom("bottom-[72px]")
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling up
        setViewCartButtonBottom("bottom-[92px]")
      }

      // Update banner scroll state for navbar transparency
      if (currentScrollY > 40) {
        setHasScrolledPastBanner(true)
      } else {
        setHasScrolledPastBanner(false)
      }

      lastScrollY.current = currentScrollY
    }
  }, [])

  // Helper function to update item quantity in both local state and cart
  const updateItemQuantity = async (item, newQuantity, event = null, restaurantName = null, preferredVariant = null) => {
    // Check authentication
    if (!isModuleAuthenticated('user')) {
      window.dispatchEvent(new CustomEvent('show-login-required'))
      return
    }

    // CRITICAL: Check if user is in service zone
    if (isOutOfService) {
      toast.error('You are outside the service zone. Please select a location within the service area.')
      return
    }

    const resolvedVariant = preferredVariant || getDefaultFoodVariant(item)
    const lineItemId = getLineItemIdForDish(item, resolvedVariant)

    // Find restaurant name from the item or use provided parameter
    const restaurant = restaurantName || item.restaurant || "Under 250"

    // Prepare cart item with all required properties
    const cartItem = {
      id: lineItemId,
      lineItemId,
      itemId: item.id,
      name: item.name,
      price: resolvedVariant?.price ?? item.price,
      variantId: resolvedVariant?.id || "",
      variantName: resolvedVariant?.name || "",
      variantPrice: resolvedVariant?.price ?? item.price,
      image: item.image,
      restaurant: restaurant,
      description: item.description || "",
      originalPrice: item.originalPrice || item.price,
      isVeg: item.isVeg === true,
      priceOnOtherPlatforms: null,
      otherPlatformGst: null,
    }

    // Get source position for animation from event target
    let sourcePosition = null
    if (event?.nativeEvent && Number.isFinite(event.nativeEvent.pageX)) {
      sourcePosition = {
        viewportX: event.nativeEvent.pageX,
        viewportY: event.nativeEvent.pageY,
        scrollX: 0,
        scrollY: lastScrollY.current || 0,
        itemId: lineItemId,
      }
    }

    const productInfo = {
      id: lineItemId,
      name: item.name,
      imageUrl: item.image,
    }
    const existingCartItem = getCartItem(lineItemId)
    const prevQuantity = existingCartItem?.quantity || 0
    if (newQuantity === prevQuantity) return

    setQuantities((prev) => ({
      ...prev,
      [lineItemId]: newQuantity,
    }))

    // Cart calls are async — await them so failures reach the user.
    let result
    if (newQuantity <= 0) {
      result = await removeFromCart(lineItemId, sourcePosition, productInfo)
    } else if (!existingCartItem) {
      result = await addToCart({ ...cartItem, quantity: newQuantity }, sourcePosition)
    } else if (
      newQuantity === prevQuantity + 1 &&
      sourcePosition &&
      (quantities[lineItemId] || 0) === prevQuantity
    ) {
      result = await addToCart(cartItem, sourcePosition)
    } else if (newQuantity < prevQuantity && sourcePosition) {
      result = await updateQuantity(lineItemId, newQuantity, sourcePosition, productInfo)
    } else {
      result = await updateQuantity(lineItemId, newQuantity)
    }

    if (result?.ok === false) {
      setQuantities((prev) => ({ ...prev, [lineItemId]: prevQuantity }))
      toast.error(result.error || 'Could not update cart. Please try again.')
    }
  }

  const closeItemDetail = useCallback(() => {
    setShowItemDetail(false)
    setShowShareOptions(false)
  }, [])

  const goToRestaurantForVariants = (item, restaurant) => {
    const restaurantSlug = restaurant.slug || restaurant.restaurantId || ""
    const itemId = item.id || item._id
    navigate(`/user/restaurants/${restaurantSlug}${itemId ? `?dish=${encodeURIComponent(itemId)}` : ""}`)
  }

  const handleItemClick = (item, restaurant) => {
    const availabilityStatus = getRestaurantAvailabilityStatus(restaurant)
    const isRestaurantOffline = !availabilityStatus.isOpen
    // Add restaurant info to item for display
    const itemWithRestaurant = {
      ...item,
      restaurant: restaurant.name,
      restaurantSlug: restaurant.slug || restaurant.restaurantId || "",
      description: item.description || `${item.name} from ${restaurant.name}`,
      customisable: item.customisable || false,
      notEligibleForCoupons: item.notEligibleForCoupons || false,
      isRestaurantOffline,
    }
    const defaultVariant = getDefaultFoodVariant(item)
    const lineItemId = getLineItemIdForDish(item, defaultVariant)
    const existingQuantity = quantities[lineItemId] || 0
    setItemDetailQuantity(existingQuantity > 0 ? existingQuantity : 1)
    setSelectedItem(itemWithRestaurant)
    setShowShareOptions(false)
    setShowItemDetail(true)
  }

  const handleBookmarkClick = (itemId) => {
    setBookmarkedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  const handleShareItem = async (item) => {
    if (!item) return

    const itemId = item.id || item._id
    const restaurantSlug = item.restaurantSlug || item.slug || ""
    const shareUrl = restaurantSlug
      ? buildShareUrl(restaurantSharePath(restaurantSlug, itemId))
      : window.location.href

    try {
      if (navigator.share) {
        await navigator.share({
          title: item.name || "Dish",
          text: `Check out ${item.name || "this dish"} from ${item.restaurant || "Under 250"}`,
          url: shareUrl,
        })
        return
      }
    } catch (error) {
      if (error?.name === "AbortError") return
    }

    setShowShareOptions(true)
  }

  const handleShareOption = async (type) => {
    if (!selectedItem) return

    const itemId = selectedItem.id || selectedItem._id
    const restaurantSlug = selectedItem.restaurantSlug || selectedItem.slug || ""
    const shareUrl = restaurantSlug
      ? buildShareUrl(restaurantSharePath(restaurantSlug, itemId))
      : window.location.href
    const shareText = `Check out ${selectedItem.name || "this dish"} from ${selectedItem.restaurant || "Under 250"}`
    const encodedUrl = encodeURIComponent(shareUrl)
    const encodedText = encodeURIComponent(`${shareText} ${shareUrl}`)

    try {
      if (type === "copy") {
        await navigator.clipboard.writeText(shareUrl)
        toast.success("Link copied to clipboard!")
      } else if (type === "whatsapp") {
        window.open(`https://wa.me/?text=${encodedText}`, "_blank", "noopener,noreferrer")
      } else if (type === "telegram") {
        window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer")
      } else if (type === "sms") {
        await Linking.openURL(`sms:?&body=${encodedText}`)
      } else if (type === "email") {
        await Linking.openURL(`mailto:?subject=${encodeURIComponent(selectedItem.name || "Dish")}&body=${encodedText}`)
      }
      setShowShareOptions(false)
    } catch {
      toast.error("Failed to share link")
    }
  }

  const handleItemDetailTouchStart = () => {
    if (!showItemDetail) return
    itemDetailGestureRef.current = {
      startY: 0,
      dragging: true,
    }
  }

  const handleItemDetailTouchEnd = (deltaY) => {
    if (!showItemDetail || !itemDetailGestureRef.current.dragging) return

    const contentScrollTop = itemDetailContentScrollTopRef.current || 0

    itemDetailGestureRef.current.dragging = false

    if (contentScrollTop <= 0 && deltaY > 80) {
      closeItemDetail()
    }
  }

  // Check if should show grayscale (only when user is out of service)
  const shouldShowGrayscale = isOutOfService
  // ---------------------------------------------------------------- native layout helpers
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  // h-[clamp(210px,34vw,430px)]
  const bannerHeight = Math.min(430, Math.max(210, screenWidth * 0.34))
  // web: "grayscale opacity-75"
  const grayStyle = s.grayscale

  const bannerSlides = bannerImages.length > 1
    ? [...bannerImages, bannerImages[0]]
    : (bannerImages.length > 0 ? bannerImages : [under250Banner])

  // translateX(-index * 100%) + "transform 500ms cubic-bezier(0.25, 1, 0.5, 1)"
  const bannerX = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const toValue = -currentBannerIndex * screenWidth
    if (isTransitionEnabled) {
      const anim = Animated.timing(bannerX, {
        toValue,
        duration: 500,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
        useNativeDriver: true,
      })
      anim.start()
      return () => anim.stop()
    }
    bannerX.setValue(toValue)
    return undefined
  }, [currentBannerIndex, isTransitionEnabled, screenWidth, bannerX])

  const bannerHandlersRef = useRef({})
  bannerHandlersRef.current = { handleBannerTouchStart, handleBannerTouchMove, handleBannerTouchEnd }
  const bannerPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => bannerHandlersRef.current.handleBannerTouchStart(),
        onPanResponderMove: (_, g) => bannerHandlersRef.current.handleBannerTouchMove(g.dx, g.dy),
        onPanResponderRelease: () => bannerHandlersRef.current.handleBannerTouchEnd(),
        onPanResponderTerminate: () => bannerHandlersRef.current.handleBannerTouchEnd(),
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  )

  // Item sheet: swipe down (content at top) closes it, like the web's touch/wheel handlers
  const detailHandlersRef = useRef({})
  detailHandlersRef.current = { handleItemDetailTouchStart, handleItemDetailTouchEnd }
  const detailPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) && (itemDetailContentScrollTopRef.current || 0) <= 0,
        onPanResponderGrant: () => detailHandlersRef.current.handleItemDetailTouchStart(),
        onPanResponderRelease: (_, g) => detailHandlersRef.current.handleItemDetailTouchEnd(g.dy),
        onPanResponderTerminate: (_, g) => detailHandlersRef.current.handleItemDetailTouchEnd(g.dy),
      }),
    [],
  )

  // Wallet / profile links ask for login first (web: onClick preventDefault + show-login-required)
  const openGuarded = (to) => {
    if (!isModuleAuthenticated('user')) {
      window.dispatchEvent(new CustomEvent('show-login-required'))
      return
    }
    navigate(to, { state: { from: "/food/user/under-250" } })
  }

  const listData = loadingRestaurants && under250Restaurants.length === 0
    ? []
    : sortedAndFilteredRestaurants.slice(0, visibleRestaurantCount)

  const renderMenuItem = (item, itemIndex, restaurant, isRestaurantOffline) => {
    const defaultVariant = getDefaultFoodVariant(item)
    const lineItemId = getLineItemIdForDish(item, defaultVariant)
    const quantity = quantities[lineItemId] || 0
    const isOffline = shouldShowGrayscale || isRestaurantOffline
    return (
      <Pressable
        key={item.id}
        onPress={() => handleItemClick(item, restaurant)}
        style={[s.itemCard, isOffline && grayStyle]}
      >
        {/* Item Image */}
        <View style={s.itemImageWrap}>
          <OptimizedImage
            src={item.image}
            alt={item.name}
            style={s.fill}
            objectFit="cover"
            sizes="(max-width: 640px) 200px, (max-width: 768px) 220px, 100vw"
            placeholder="blur"
            priority={itemIndex < 4}
          />
          {/* Veg Indicator */}
          {item.isVeg && (
            <View style={s.vegBadge}>
              <View style={s.vegBadgeDot} />
            </View>
          )}
        </View>

        {/* Item Details */}
        <View style={s.itemBody}>
          <View style={s.itemNameRow}>
            {item.isVeg && (
              <View style={s.vegSmall}>
                <View style={s.vegSmallDot} />
              </View>
            )}
            <Text style={s.itemName} numberOfLines={1}>
              1 x {item.name}
            </Text>
          </View>
          <View style={s.itemPriceRow}>
            <View>
              <Text style={s.itemPrice}>
                {RUPEE_SYMBOL}{Math.round(item.price)}
              </Text>
              {item.bestPrice && <Text style={s.bestPrice}>Best price</Text>}
            </View>
            {quantity > 0 && !isRestaurantOffline ? (
              <View style={s.qtyPill} onStartShouldSetResponder={() => true}>
                <Pressable
                  onPress={(e) => {
                    const defaultVariant = getDefaultFoodVariant(item)
                    updateItemQuantity(item, quantity - 1, e, restaurant.name, defaultVariant)
                  }}
                  style={({ pressed }) => [s.qtyBtn, pressed && { backgroundColor: alpha(colors.black, 0.2) }]}
                >
                  <Minus size={14} color={colors.white} />
                </Pressable>
                <Text style={s.qtyText}>{quantity}</Text>
                <Pressable
                  onPress={(e) => {
                    const defaultVariant = getDefaultFoodVariant(item)
                    updateItemQuantity(item, quantity + 1, e, restaurant.name, defaultVariant)
                  }}
                  style={({ pressed }) => [s.qtyBtn, pressed && { backgroundColor: alpha(colors.black, 0.2) }]}
                >
                  <Plus size={14} color={colors.white} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                disabled={isOffline}
                onPress={(e) => {
                  if (isOffline) return
                  // Variant picker lives on the restaurant page.
                  if (hasFoodVariants(item)) {
                    goToRestaurantForVariants(item, restaurant)
                  } else {
                    updateItemQuantity(item, 1, e, restaurant.name, null)
                  }
                }}
                style={({ pressed }) => [
                  s.addBtn,
                  isOffline ? s.addBtnOffline : s.addBtnOn,
                  pressed && !isOffline && { transform: [{ scale: 0.95 }], backgroundColor: "#991B1B" },
                ]}
              >
                <Text style={[s.addBtnText, isOffline && { color: colors.gray[400] }]}>Add</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  const renderRestaurant = ({ item: restaurant }) => {
    const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
    const availabilityStatus = getRestaurantAvailabilityStatus(restaurant)
    const isRestaurantOffline = !availabilityStatus.isOpen
    return (
      <View style={[s.restaurantSection, isRestaurantOffline && { opacity: 0.8 }]}>
        {/* Restaurant Header */}
        <View style={s.restaurantHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.restaurantName}>{restaurant.name}</Text>
            <View style={s.restaurantMeta}>
              <View style={s.metaItem}>
                <Clock size={14} color={t.dark ? colors.gray[400] : colors.gray[500]} strokeWidth={2.5} />
                <Text style={s.metaText}>{restaurant.deliveryTime}</Text>
              </View>
              <View style={s.metaItem}>
                <MapPin size={14} color={t.dark ? colors.gray[400] : colors.gray[500]} strokeWidth={2.5} />
                <Text style={s.metaText}>{restaurant.distance}</Text>
              </View>
              <View style={s.ratingChip}>
                <Star size={12} color={colors.white} fill={colors.white} />
                <Text style={s.ratingChipText}>{restaurant.rating}</Text>
              </View>
              <View style={s.metaDivider} />
              <Text style={s.ratingsCount}>
                {restaurant.totalRatings > 0 ? `${restaurant.totalRatings >= 1000 ? `${(restaurant.totalRatings / 1000).toFixed(1)}K` : restaurant.totalRatings}+ Ratings` : 'New'}
              </Text>
            </View>
          </View>
        </View>

        {/* Menu Items Horizontal Scroll */}
        {restaurant.menuItems && restaurant.menuItems.length > 0 && (
          <View style={{ gap: sp(2) }}>
            <ScrollView style={{ flexGrow: 0 }}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.itemsRow}
              nestedScrollEnabled
            >
              {restaurant.menuItems.map((item, itemIndex) => renderMenuItem(item, itemIndex, restaurant, isRestaurantOffline))}
            </ScrollView>

            {/* View Full Menu Button */}
            <View style={{ alignItems: "center", marginTop: sp(2) }}>
              <Link to={`/user/restaurants/${restaurantSlug}?under250=true`}>
                {({ pressed }) => (
                  <View style={[s.fullMenuBtn, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
                    <Text style={s.fullMenuText}>View full menu</Text>
                    <ArrowRight size={16} color={t.dark ? colors.gray[300] : colors.gray[700]} style={{ marginLeft: sp(2) }} />
                  </View>
                )}
              </Link>
            </View>
          </View>
        )}
      </View>
    )
  }

  const activeDotIndex = currentBannerIndex === bannerImages.length ? 0 : currentBannerIndex

  const listHeader = (
    <>
      {/* Banner Section */}
      <View style={[s.banner, { height: bannerHeight }]} {...bannerPan.panHandlers}>
        {/* Sliding Banner Container */}
        <Animated.View style={[s.bannerTrack, { width: screenWidth * bannerSlides.length, transform: [{ translateX: bannerX }] }]}>
          {bannerSlides.map((imgSrc, index) => (
            <View key={`${index}-${imgSrc}`} style={{ width: screenWidth, height: "100%" }}>
              <AppImage
                src={imgSrc}
                style={s.fill}
                contentFit="cover"
                contentPosition={{ top: "90%", left: "50%" }}
                priority={index === 0 ? "high" : "normal"}
              />
            </View>
          ))}
        </Animated.View>

        {/* Subtle gradient overlay to ensure navbar readability if needed */}
        <LinearGradient colors={[alpha(colors.black, 0.1), "transparent"]} style={[s.absFill, { zIndex: 10 }]} pointerEvents="none" />

        {/* Bottom Right Carousel Pagination Dots */}
        {bannerImages.length > 1 && (
          <View style={s.bannerDots}>
            {bannerImages.map((_, dotIndex) => (
              <Pressable
                key={dotIndex}
                onPress={() => {
                  setIsTransitionEnabled(true)
                  setCurrentBannerIndex(dotIndex)
                  resetBannerAutoSlide()
                }}
                hitSlop={4}
                accessibilityLabel={`Go to banner ${dotIndex + 1}`}
                style={[s.bannerDot, activeDotIndex === dotIndex ? s.bannerDotActive : s.bannerDotInactive]}
              />
            ))}
          </View>
        )}
      </View>

      <View style={s.contentTop}>
        {/* Categories */}
        <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoriesRow} nestedScrollEnabled>
          {/* All Button */}
          <Pressable onPress={() => setActiveCategory(null)} style={({ pressed }) => [s.categoryItem, pressed && { transform: [{ scale: 0.95 }] }]}>
            <View style={s.categoryCircleWrap}>
              {!activeCategory && <View style={s.categoryRing} />}
              {!activeCategory ? (
                <LinearGradient colors={["#DC2626", "#991B1B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.categoryCircle}>
                  <Utensils size={24} color={colors.white} />
                </LinearGradient>
              ) : (
                <View style={[s.categoryCircle, s.categoryCircleIdle]}>
                  <Utensils size={24} color={t.dark ? colors.gray[200] : colors.gray[700]} />
                </View>
              )}
            </View>
            <Text style={[s.categoryLabelBold, { color: !activeCategory ? "#DC2626" : t.dark ? colors.gray[200] : colors.gray[800] }]}>All</Text>
          </Pressable>
          {loadingCategories ? (
            [1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} style={s.categoryItem}>
                <Skeleton width={56} height={56} rounded={radius.full} />
                <Skeleton width={48} height={14} rounded={radius.sm} />
              </View>
            ))
          ) : (
            displayCategories.map((category) => {
              const isActive = activeCategory === category.id
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setActiveCategory(isActive ? null : category.id)}
                  style={({ pressed }) => [s.categoryItem, pressed && { transform: [{ scale: 0.95 }] }]}
                >
                  <View style={s.categoryCircleWrap}>
                    {isActive && <View style={s.categoryRing} />}
                    <View style={[s.categoryCircle, { backgroundColor: colors.white }]}>
                      <OptimizedImage
                        src={category.image}
                        alt={category.name}
                        style={s.fill}
                        objectFit="cover"
                        sizes="(max-width: 640px) 62px, (max-width: 768px) 96px, 112px"
                        placeholder="blur"
                      />
                    </View>
                  </View>
                  <Text style={[s.categoryLabel, isActive && { color: "#DC2626" }]}>
                    {category.name.length > 7 ? `${category.name.slice(0, 7)}...` : category.name}
                  </Text>
                </Pressable>
              )
            })
          )}
        </ScrollView>

        {/* Sort + Under 30 mins */}
        <View style={s.filtersRow}>
          <Pressable onPress={() => setShowSortPopup(true)} style={({ pressed }) => [s.filterBtn, s.filterBtnIdle, pressed && s.filterBtnIdlePressed]}>
            <ArrowDownUp size={16} color={t.dark ? colors.gray[300] : colors.gray[700]} style={{ transform: [{ rotate: "90deg" }] }} />
            <Text style={[s.filterText, { color: t.dark ? colors.gray[300] : colors.gray[700] }]}>
              {selectedSort ? sortOptions.find(opt => opt.id === selectedSort)?.label : 'Sort'}
            </Text>
            <ChevronDown size={12} color={t.dark ? colors.gray[300] : colors.gray[700]} />
          </Pressable>
          <Pressable
            onPress={() => setUnder30MinsFilter(!under30MinsFilter)}
            style={({ pressed }) => [
              s.filterBtn,
              { gap: sp(1.5) },
              under30MinsFilter ? s.filterBtnActive : s.filterBtnIdle,
              pressed && (under30MinsFilter ? { backgroundColor: "#991B1B" } : s.filterBtnIdlePressed),
            ]}
          >
            <Timer size={12} color={under30MinsFilter ? colors.white : t.dark ? colors.gray[300] : colors.gray[600]} />
            <Text style={[s.filterTextXs, { color: under30MinsFilter ? colors.white : t.dark ? colors.gray[300] : colors.gray[600] }]}>Under 30 mins</Text>
          </Pressable>
        </View>
      </View>
    </>
  )

  const listEmpty = loadingRestaurants && under250Restaurants.length === 0 ? (
    <View style={s.skeletonWrap}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ gap: sp(4) }}>
          {/* Skeleton Header */}
          <View style={{ gap: sp(2) }}>
            <Skeleton width={192} height={24} rounded={radius.lg} />
            <View style={{ flexDirection: "row", gap: sp(4) }}>
              <Skeleton width={96} height={16} rounded={radius.sm} />
              <Skeleton width={96} height={16} rounded={radius.sm} />
            </View>
          </View>
          {/* Skeleton Grid */}
          <View style={{ flexDirection: "row", gap: sp(4), overflow: "hidden", paddingBottom: sp(4) }}>
            {[1, 2, 3, 4].map((j) => (
              <View key={j} style={s.skeletonCard}>
                <Skeleton width="100%" height={128} rounded={radius.lg} />
                <Skeleton width="75%" height={16} rounded={radius.sm} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: sp(2) }}>
                  <Skeleton width={64} height={20} rounded={radius.sm} />
                  <Skeleton width={64} height={32} rounded={radius.sm} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  ) : (
    <View style={s.emptyWrap}>
      <Text style={s.emptyText}>
        {under250Restaurants.length === 0
          ? `No restaurants with dishes under ${RUPEE_SYMBOL}${under250PriceLimit} found.`
          : "No restaurants match the selected filters."}
      </Text>
    </View>
  )

  const listFooter = listData.length > 0 ? (
    visibleRestaurantCount < sortedAndFilteredRestaurants.length ? (
      <View style={s.showMoreWrap}>
        <Pressable
          onPress={() => setVisibleRestaurantCount((n) => n + UNDER250_LIST_MAX_VISIBLE)}
          style={({ pressed }) => [s.showMoreBtn, pressed && { backgroundColor: t.dark ? alpha("#f2f0ea", 0.5) : "#f6e2b5" }]}
        >
          <Text style={s.showMoreText}>Show more restaurants</Text>
        </Pressable>
      </View>
    ) : (
      <View style={{ height: 96 }} />
    )
  ) : null

  const detailItem = selectedItem
  const detailOffline = detailItem ? (shouldShowGrayscale || detailItem.isRestaurantOffline) : false
  const detailLineId = detailItem ? getLineItemIdForDish(detailItem, getDefaultFoodVariant(detailItem)) : ""
  const detailBookmarked = detailItem ? bookmarkedItems.has(detailItem.id) : false

  return (
    <View style={[s.root, shouldShowGrayscale && grayStyle]}>
      <FlatList
        data={listData}
        keyExtractor={(restaurant) => String(restaurant.id)}
        renderItem={renderRestaurant}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        contentContainerStyle={{ paddingBottom: 128 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#DC2626"]} progressViewOffset={insets.top + 64} />
        }
        onScroll={(e) => handleListScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        initialNumToRender={4}
        windowSize={7}
      />

      <View style={[s.header, { paddingTop: insets.top + sp(2) }]}>
        <View style={s.headerRow}>
          {/* Left: Takeaway-style heading (location only changeable from Delivery home) */}
          <View style={{ minWidth: 0 }}>
            <Text style={s.headerKicker}>BUDGET MEALS</Text>
            <Text style={s.headerTitle}>
              Under {RUPEE_SYMBOL}{under250PriceLimit}
            </Text>
          </View>

          {/* Right: Wallet & Profile Actions */}
          <View style={s.headerActions}>
            {/* Wallet Button */}
            <Pressable
              onPress={() => openGuarded("/food/user/wallet")}
              style={({ pressed }) => [s.walletBtn, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              <Wallet size={26} color={colors.white} strokeWidth={2.2} />
            </Pressable>

            {/* Profile Avatar */}
            <Pressable
              onPress={() => openGuarded("/food/user/profile")}
              style={({ pressed }) => [s.avatarRing, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <View style={s.avatar}>
                <AppImage
                  src={userProfile?.profileImage || "/assets/images/profile_avatar.webp"}
                  fallback="/assets/images/profile_avatar.webp"
                  style={s.fill}
                  contentFit="cover"
                />
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Sort Popup - Center Modal */}
      <Dialog open={showSortPopup} onClose={() => setShowSortPopup(false)} style={s.sortDialog}>
        {/* Header */}
        <View style={s.sortHeader}>
          <Text style={s.sortTitle}>Sort By</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
            <Pressable onPress={handleClearAll}>
              <Text style={s.clearAll}>Clear all</Text>
            </Pressable>
            <Pressable onPress={() => setShowSortPopup(false)} style={s.sortClose}>
              <X size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <View style={s.sortBody}>
          {sortOptions.map((option) => {
            const selected = selectedSort === option.id
            return (
              <Pressable
                key={option.id || 'relevance'}
                onPress={() => {
                  setDraftSelectedSort(option.id);
                  setSelectedSort(option.id);
                  setShowSortPopup(false);
                }}
                style={[s.sortOption, selected ? s.sortOptionOn : s.sortOptionOff]}
              >
                <Text style={[s.sortOptionText, { color: selected ? (t.dark ? "#FEE2E2" : "#DC2626") : t.dark ? colors.gray[300] : colors.gray[700] }]}>
                  {option.label}
                </Text>
                {selected && (
                  <View style={s.checkCircle}>
                    <Check size={12} color={colors.white} />
                  </View>
                )}
              </Pressable>
            )
          })}
        </View>

        {/* Footer */}
        <View style={s.sortFooter}>
          <Pressable onPress={() => setShowSortPopup(false)} style={({ pressed }) => [s.sortFooterBtn, s.sortCloseBtn, pressed && { backgroundColor: t.dark ? colors.gray[600] : colors.gray[900] }]}>
            <Text style={s.sortCloseBtnText}>Close</Text>
          </Pressable>
          <Pressable onPress={handleApply} style={({ pressed }) => [s.sortFooterBtn, s.sortApplyBtn, pressed && { backgroundColor: "#991B1B" }]}>
            <Text style={s.sortApplyText}>Apply</Text>
          </Pressable>
        </View>
      </Dialog>

      {/* Item Detail Bottom Sheet */}
      <Sheet open={showItemDetail && !!selectedItem} onClose={closeItemDetail} backdropOpacity={0.4} style={[s.detailSheet, { maxHeight: screenHeight * 0.9 }]}>
        {detailItem ? (
          <View {...detailPan.panHandlers} style={{ flexShrink: 1 }}>
            {/* Close Button - Top Center Above Popup with 4px gap */}
            <View style={s.detailCloseWrap}>
              <Pressable onPress={closeItemDetail} style={({ pressed }) => [s.detailClose, pressed && { backgroundColor: t.dark ? colors.gray[600] : colors.gray[900] }]}>
                <X size={20} color={colors.white} />
              </Pressable>
            </View>

            {/* Image Section */}
            <View style={[s.detailImage, detailOffline && grayStyle]}>
              <OptimizedImage
                src={detailItem.image}
                alt={detailItem.name}
                style={s.fill}
                objectFit="cover"
                sizes="100vw"
                priority={true}
                placeholder="blur"
              />
              {/* Bookmark and Share Icons Overlay */}
              <View style={s.detailIcons}>
                <Pressable
                  onPress={() => handleBookmarkClick(detailItem.id)}
                  style={[s.detailIconBtn, detailBookmarked ? s.detailIconBtnOn : s.detailIconBtnOff]}
                >
                  <Bookmark size={20} color={detailBookmarked ? colors.red[500] : colors.gray[600]} fill={detailBookmarked ? colors.red[500] : "none"} />
                </Pressable>
                <Pressable onPress={() => handleShareItem(detailItem)} style={[s.detailIconBtn, s.detailIconBtnOff]}>
                  <Share2 size={20} color={colors.gray[600]} />
                </Pressable>
              </View>
            </View>

            {/* Content Section */}
            <ScrollView
              style={s.detailContent}
              contentContainerStyle={s.detailContentInner}
              onScroll={(e) => { itemDetailContentScrollTopRef.current = e.nativeEvent.contentOffset.y }}
              scrollEventThrottle={16}
            >
              {/* Item Name and Indicator */}
              <View style={s.detailNameRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), flex: 1 }}>
                  {detailItem.isVeg && (
                    <View style={s.detailVeg}>
                      <View style={s.detailVegDot} />
                    </View>
                  )}
                  <Text style={s.detailName}>{detailItem.name}</Text>
                </View>
              </View>

              {/* Description */}
              <Text style={s.detailDesc}>
                {detailItem.description || `${detailItem.name} from ${detailItem.restaurant || 'Under 250'}`}
              </Text>

              {/* Highly Reordered Progress Bar */}
              {detailItem.customisable && (
                <View style={s.reorderRow}>
                  <View style={s.reorderTrack}>
                    <View style={s.reorderFill} />
                  </View>
                  <Text style={s.reorderText}>highly reordered</Text>
                </View>
              )}

              {/* Not Eligible for Coupons */}
              {detailItem.notEligibleForCoupons && (
                <Text style={s.notEligible}>NOT ELIGIBLE FOR COUPONS</Text>
              )}
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={s.detailBar}>
              {detailItem.isRestaurantOffline && (
                <Text style={s.closedText}>Restaurant is currently closed and not accepting orders.</Text>
              )}
              <View style={s.detailBarRow}>
                {/* Quantity Selector */}
                <View style={[s.detailQty, detailOffline && { opacity: 0.5 }]}>
                  <Pressable
                    onPress={() => {
                      if (!shouldShowGrayscale && !detailItem.isRestaurantOffline) {
                        setItemDetailQuantity((prev) => Math.max(1, prev - 1))
                      }
                    }}
                    disabled={itemDetailQuantity <= 1 || detailOffline}
                  >
                    <Minus size={20} color={(detailOffline || itemDetailQuantity <= 1) ? (t.dark ? colors.gray[600] : colors.gray[300]) : (t.dark ? colors.gray[400] : colors.gray[600])} />
                  </Pressable>
                  <Text style={[s.detailQtyText, { color: detailOffline ? (t.dark ? colors.gray[600] : colors.gray[400]) : (t.dark ? colors.white : colors.gray[900]) }]}>
                    {itemDetailQuantity}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!shouldShowGrayscale && !detailItem.isRestaurantOffline) {
                        setItemDetailQuantity((prev) => prev + 1)
                      }
                    }}
                    disabled={detailOffline}
                  >
                    <Plus size={20} color={detailOffline ? (t.dark ? colors.gray[600] : colors.gray[300]) : (t.dark ? colors.gray[400] : colors.gray[600])} />
                  </Pressable>
                </View>

                {/* Add / Update Item Button */}
                <Pressable
                  disabled={detailOffline}
                  onPress={(e) => {
                    if (!shouldShowGrayscale && !detailItem.isRestaurantOffline) {
                      if (hasFoodVariants(detailItem)) {
                        closeItemDetail()
                        goToRestaurantForVariants(detailItem, { slug: detailItem.restaurantSlug })
                        return
                      }
                      updateItemQuantity(detailItem, itemDetailQuantity, e, detailItem.restaurant, null)
                      closeItemDetail()
                    }
                  }}
                  style={({ pressed }) => [
                    s.detailAddBtn,
                    detailOffline ? s.detailAddBtnOff : s.detailAddBtnOn,
                    pressed && !detailOffline && { backgroundColor: "#991B1B" },
                  ]}
                >
                  <Text style={[s.detailAddText, detailOffline && { color: t.dark ? colors.gray[600] : colors.gray[500] }]}>
                    {hasFoodVariants(detailItem) ? "Choose option" : quantities[detailLineId] > 0 ? "Update item" : "Add item"}
                  </Text>
                  <Text style={[s.detailAddPrice, detailOffline && { color: t.dark ? colors.gray[600] : colors.gray[500] }]}>
                    {RUPEE_SYMBOL}{Math.round((getDefaultFoodVariant(detailItem)?.price ?? detailItem.price) * itemDetailQuantity)}
                  </Text>
                </Pressable>

                {/* Remove Button when item is in cart */}
                {quantities[detailLineId] > 0 && (
                  <Pressable
                    onPress={(e) => {
                      if (!shouldShowGrayscale && !detailItem.isRestaurantOffline) {
                        const defaultVariant = getDefaultFoodVariant(detailItem)
                        updateItemQuantity(detailItem, 0, e, detailItem.restaurant, defaultVariant)
                        closeItemDetail()
                      }
                    }}
                    style={({ pressed }) => [s.removeBtn, pressed && { backgroundColor: colors.red[50] }]}
                  >
                    <Text style={s.removeText}>Remove</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ) : null}
      </Sheet>

      {/* Share options */}
      <Sheet open={showShareOptions && !!selectedItem} onClose={() => setShowShareOptions(false)} backdropOpacity={0.4} style={s.shareSheet}>
        <View style={{ alignItems: "center", paddingBottom: sp(3) }}>
          <View style={s.handle} />
        </View>
        <View style={s.shareHeader}>
          <Text style={s.shareTitle}>Share dish</Text>
          <Pressable onPress={() => setShowShareOptions(false)}>
            <Text style={s.shareClose}>Close</Text>
          </Pressable>
        </View>
        <View style={s.shareGrid}>
          {[
            { id: "whatsapp", label: "WhatsApp" },
            { id: "telegram", label: "Telegram" },
            { id: "sms", label: "SMS" },
            { id: "email", label: "Email" },
            { id: "copy", label: "Copy Link" },
          ].map((option) => (
            <Pressable
              key={option.id}
              onPress={() => handleShareOption(option.id)}
              style={({ pressed }) => [s.shareOption, { width: (screenWidth - sp(8) - sp(3)) / 2 }, pressed && { borderColor: "#DC2626" }]}
            >
              {({ pressed }) => (
                <Text style={[s.shareOptionText, pressed && { color: "#DC2626" }]}>{option.label}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* Add to Cart Animation */}
      <AddToCartAnimation dynamicBottom={viewCartButtonBottom} />
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, position: "relative", backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  grayscale: { filter: "grayscale(1)", opacity: 0.75 },
  fill: { width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    paddingHorizontal: sp(4),
    paddingBottom: sp(2),
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: "#D91F3A",
    ...shadow.lg,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 10 },
  headerKicker: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: alpha(colors.white, 0.8), letterSpacing: 2, textShadowColor: alpha(colors.black, 0.15), textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 3 },
  headerTitle: { ...fontSize.xl, fontWeight: "700", color: colors.white, textShadowColor: alpha(colors.black, 0.15), textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 3 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: sp(3), flexShrink: 0 },
  walletBtn: { padding: sp(1.5), alignItems: "center", justifyContent: "center" },
  avatarRing: { height: 38, width: 38, borderRadius: radius.full, borderWidth: 1, borderColor: alpha(colors.red[500], 0.8), alignItems: "center", justifyContent: "center" },
  avatar: { height: 36, width: 36, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.white, overflow: "hidden", backgroundColor: t.dark ? colors.gray[800] : "#FFF5E6" },
  banner: { position: "relative", width: "100%", overflow: "hidden" },
  bannerTrack: { flexDirection: "row", height: "100%" },
  bannerDots: { position: "absolute", bottom: sp(3), right: sp(3), zIndex: 20, flexDirection: "row", alignItems: "center", gap: sp(1.5) },
  bannerDot: { height: 6, borderRadius: radius.full },
  bannerDotActive: { width: 16, backgroundColor: colors.white, ...shadow.sm },
  bannerDotInactive: { width: 6, backgroundColor: alpha(colors.white, 0.5) },
  contentTop: { paddingHorizontal: sp(3), paddingTop: sp(2) },
  categoriesRow: { gap: sp(3), paddingHorizontal: sp(2), paddingVertical: sp(2) },
  categoryItem: { alignItems: "center", gap: sp(2), width: 62 },
  categoryCircleWrap: { width: 56, height: 56, position: "relative" },
  categoryRing: { position: "absolute", top: -4, left: -4, width: 64, height: 64, borderRadius: radius.full, borderWidth: 2, borderColor: "#DC2626" },
  categoryCircle: { width: 56, height: 56, borderRadius: radius.full, overflow: "hidden", alignItems: "center", justifyContent: "center", ...shadow.md },
  categoryCircleIdle: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderWidth: 1, borderColor: t.dark ? colors.gray[800] : colors.gray[200] },
  categoryLabelBold: { ...fontSize.xs, fontWeight: "700", textAlign: "center", paddingBottom: sp(1) },
  categoryLabel: { ...fontSize.xs, fontWeight: "600", textAlign: "center", paddingBottom: sp(1), color: t.dark ? colors.gray[200] : colors.gray[800] },
  filtersRow: { flexDirection: "row", alignItems: "center", gap: sp(2), paddingVertical: sp(2) },
  filterBtn: { height: 32, paddingHorizontal: sp(3), borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: sp(2), flexShrink: 0, borderWidth: 1 },
  filterBtnIdle: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderColor: t.dark ? colors.gray[800] : colors.gray[200], ...shadow.xs },
  filterBtnIdlePressed: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] },
  filterBtnActive: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  filterText: { ...fontSize.sm, fontWeight: "500" },
  filterTextXs: { ...fontSize.xs, fontWeight: "500" },
  skeletonWrap: { paddingHorizontal: sp(3), paddingTop: sp(4), gap: sp(8) },
  skeletonCard: {
    flexShrink: 0,
    width: 200,
    height: 256,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    padding: sp(3),
    gap: sp(3),
    ...shadow.sm,
  },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: sp(12), paddingHorizontal: sp(3) },
  emptyText: { ...fontSize.base, color: t.dark ? colors.gray[400] : colors.gray[500], textAlign: "center" },
  restaurantSection: { paddingTop: sp(4), paddingHorizontal: sp(3) },
  restaurantHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: sp(3) },
  restaurantName: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(1) },
  restaurantMeta: { flexDirection: "row", alignItems: "center", gap: sp(2), marginTop: sp(1.5), flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: sp(1.5) },
  metaText: { ...fontSize.xs, fontWeight: "600", color: t.dark ? colors.gray[400] : colors.gray[500] },
  ratingChip: { flexDirection: "row", alignItems: "center", gap: sp(1), paddingHorizontal: sp(2), paddingVertical: sp(0.5), backgroundColor: "#267e3e", borderRadius: radius.md },
  ratingChipText: { fontSize: 10, lineHeight: 14, fontWeight: "900", color: colors.white },
  metaDivider: { height: 16, width: 1, backgroundColor: t.dark ? colors.gray[800] : colors.gray[200] },
  ratingsCount: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: t.dark ? colors.gray[500] : colors.gray[400] },
  itemsRow: { gap: sp(3), paddingBottom: sp(2) },
  itemCard: {
    flexShrink: 0,
    width: 200,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    overflow: "hidden",
    marginBottom: 6,
    ...shadow.md,
  },
  itemImageWrap: { position: "relative", width: "100%", height: 128, overflow: "hidden" },
  vegBadge: { position: "absolute", top: sp(2), left: sp(2), height: 16, width: 16, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.green[600], backgroundColor: colors.white, alignItems: "center", justifyContent: "center", zIndex: 10 },
  vegBadgeDot: { height: 8, width: 8, borderRadius: radius.full, backgroundColor: colors.green[600] },
  itemBody: { padding: sp(3) },
  itemNameRow: { flexDirection: "row", alignItems: "center", gap: sp(1), marginBottom: sp(1) },
  vegSmall: { height: 12, width: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.green[600], backgroundColor: t.dark ? alpha(colors.green[900], 0.2) : colors.green[50], alignItems: "center", justifyContent: "center" },
  vegSmallDot: { height: 6, width: 6, borderRadius: radius.full, backgroundColor: colors.green[600] },
  itemName: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900], flexShrink: 1 },
  itemPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemPrice: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  bestPrice: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[500] },
  qtyPill: { flexDirection: "row", alignItems: "center", gap: sp(1.5), backgroundColor: "#DC2626", borderRadius: radius.lg, padding: sp(1), ...shadow.md },
  qtyBtn: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  qtyText: { paddingHorizontal: sp(1), ...fontSize.xs, fontWeight: "700", minWidth: 20, textAlign: "center", color: colors.white },
  addBtn: { height: 28, paddingHorizontal: sp(3), borderRadius: radius.md, alignItems: "center", justifyContent: "center", ...shadow.md },
  addBtnOn: { backgroundColor: "#DC2626" },
  addBtnOffline: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], borderColor: t.dark ? colors.gray[700] : colors.gray[300], opacity: 0.5 },
  addBtnText: { ...fontSize.xs, fontWeight: "700", color: colors.white },
  fullMenuBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: t.dark ? "#1a1a1a" : colors.gray[50],
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    height: 36,
    paddingHorizontal: sp(4),
    ...shadow.xs,
  },
  fullMenuText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.white : colors.gray[700] },
  showMoreWrap: { alignItems: "center", paddingTop: sp(6), paddingBottom: sp(28) },
  showMoreBtn: {
    borderRadius: radius.full,
    paddingHorizontal: sp(6),
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.dark ? "#f2f0ea" : "#f2f0ea",
    backgroundColor: t.dark ? alpha("#f2f0ea", 0.3) : colors.white,
    ...shadow.xs,
  },
  showMoreText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? "#fafafa" : "#2e1f12" },
  sortDialog: { width: "100%", maxWidth: 384, backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderRadius: radius["2xl"], ...shadow["2xl"] },
  sortHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(5), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[200] },
  sortTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  clearAll: { color: t.dark ? "#FEE2E2" : "#DC2626", fontWeight: "500", ...fontSize.sm },
  sortClose: { padding: sp(1.5), borderRadius: radius.full, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] },
  sortBody: { paddingHorizontal: sp(5), paddingVertical: sp(4), gap: sp(3) },
  sortOption: { paddingHorizontal: sp(4), paddingVertical: sp(3.5), borderRadius: radius.xl, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sortOptionOn: { borderColor: "#DC2626", backgroundColor: t.dark ? alpha("#DC2626", 0.2) : "#fdfafc" },
  sortOptionOff: { borderColor: t.dark ? colors.gray[800] : colors.gray[200] },
  sortOptionText: { ...fontSize.sm, fontWeight: "500" },
  checkCircle: { width: 20, height: 20, borderRadius: radius.full, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sortFooter: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(5), paddingBottom: sp(5) },
  sortFooterBtn: { flex: 1, paddingVertical: sp(3), borderRadius: radius.xl, alignItems: "center" },
  sortCloseBtn: { backgroundColor: t.dark ? colors.gray[700] : colors.gray[800] },
  sortCloseBtnText: { fontWeight: "700", color: colors.white, ...fontSize.sm },
  sortApplyBtn: { backgroundColor: "#DC2626" },
  sortApplyText: { fontWeight: "600", color: colors.white, ...fontSize.sm },
  detailSheet: { overflow: "visible", backgroundColor: t.dark ? "#1a1a1a" : colors.white, ...shadow["2xl"] },
  detailCloseWrap: { position: "absolute", top: -44, left: 0, right: 0, alignItems: "center", zIndex: 12 },
  detailClose: { height: 40, width: 40, borderRadius: radius.full, backgroundColor: t.dark ? colors.gray[700] : colors.gray[800], alignItems: "center", justifyContent: "center", ...shadow.lg },
  detailImage: { position: "relative", width: "100%", height: 256, overflow: "hidden", borderTopLeftRadius: radius["3xl"], borderTopRightRadius: radius["3xl"] },
  detailIcons: { position: "absolute", bottom: sp(4), right: sp(4), flexDirection: "row", alignItems: "center", gap: sp(3) },
  detailIconBtn: { height: 40, width: 40, borderRadius: radius.full, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  detailIconBtnOn: { borderColor: colors.red[500], backgroundColor: colors.red[50] },
  detailIconBtnOff: { borderColor: colors.white, backgroundColor: alpha(colors.white, 0.9) },
  detailContent: { flexGrow: 0, flexShrink: 1 },
  detailContentInner: { paddingHorizontal: sp(4), paddingVertical: sp(4) },
  detailNameRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: sp(3) },
  detailVeg: { height: 20, width: 20, borderRadius: radius.sm, borderWidth: 2, borderColor: t.dark ? colors.green[500] : colors.green[600], backgroundColor: t.dark ? alpha(colors.green[900], 0.2) : colors.green[50], alignItems: "center", justifyContent: "center", flexShrink: 0 },
  detailVegDot: { height: 10, width: 10, borderRadius: radius.full, backgroundColor: t.dark ? colors.green[500] : colors.green[600] },
  detailName: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], flexShrink: 1 },
  detailDesc: { ...fontSize.sm, lineHeight: 22, color: t.dark ? colors.gray[400] : colors.gray[600], marginBottom: sp(4) },
  reorderRow: { flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(4) },
  reorderTrack: { flex: 1, height: 2, backgroundColor: colors.gray[200], borderRadius: radius.full, overflow: "hidden" },
  reorderFill: { height: "100%", width: "50%", backgroundColor: "#DC2626" },
  reorderText: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[600] },
  notEligible: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[500], marginBottom: sp(4) },
  detailBar: { borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[200], paddingHorizontal: sp(4), paddingVertical: sp(4), backgroundColor: t.dark ? "#1a1a1a" : colors.white },
  closedText: { ...fontSize.sm, fontWeight: "600", color: colors.red[500], marginBottom: sp(3), textAlign: "center" },
  detailBarRow: { flexDirection: "row", alignItems: "center", gap: sp(4) },
  detailQty: { flexDirection: "row", alignItems: "center", gap: sp(3), borderWidth: 2, borderColor: t.dark ? colors.gray[700] : colors.gray[300], borderRadius: radius.lg, paddingHorizontal: sp(3), height: 44 },
  detailQtyText: { ...fontSize.lg, fontWeight: "600", minWidth: 32, textAlign: "center" },
  detailAddBtn: { flex: 1, height: 44, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(2) },
  detailAddBtnOn: { backgroundColor: "#DC2626" },
  detailAddBtnOff: { backgroundColor: t.dark ? colors.gray[700] : colors.gray[300], opacity: 0.5 },
  detailAddText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
  detailAddPrice: { ...fontSize.base, fontWeight: "700", color: colors.white },
  removeBtn: { height: 44, paddingHorizontal: sp(3), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.red[200], alignItems: "center", justifyContent: "center", backgroundColor: t.dark ? alpha("#f2f0ea", 0.3) : colors.white },
  removeText: { ...fontSize.xs, fontWeight: "600", color: colors.red[600] },
  shareSheet: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, paddingHorizontal: sp(4), paddingTop: sp(4), ...shadow["2xl"] },
  handle: { width: 48, height: 4, backgroundColor: colors.gray[300], borderRadius: radius.full },
  shareHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: sp(4) },
  shareTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  shareClose: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[500] },
  shareGrid: { flexDirection: "row", flexWrap: "wrap", gap: sp(3), paddingBottom: sp(4) },
  shareOption: { borderRadius: radius["2xl"], borderWidth: 1, borderColor: t.dark ? colors.gray[700] : colors.gray[200], paddingHorizontal: sp(4), paddingVertical: sp(3) },
  shareOptionText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.gray[200] : colors.gray[800], textAlign: "center" },
}))
