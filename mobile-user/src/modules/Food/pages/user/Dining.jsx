// Native conversion of Frontend/src/modules/Food/pages/user/Dining.jsx (Dining tab of the Food main tabs).
// Platform changes only: sticky header -> a View above the list, restaurant grid -> FlatList, banner swipe ->
// touch handlers on the banner view, filter modal -> Sheet, whileInView entrance -> on-mount entrance.
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Animated, Easing, FlatList, LayoutAnimation, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Image as ExpoImage } from "expo-image"
import { Link, useNavigate } from "@/lib/router"
import { MapPin, Search, SlidersHorizontal, Star, X, ArrowDownUp, Timer, IndianRupee, Clock, Bookmark, UtensilsCrossed, Wallet } from "lucide-react-native"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Badge } from "@food/components/ui/badge"
import { Card, CardContent } from "@food/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@food/components/ui/avatar";
import AnimatedPage from "@food/components/user/AnimatedPage"
import { useLocation as useLocationHook, resolveServiceCity } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useProfile } from "@food/context/ProfileContext"
import { diningAPI } from "@food/api"
import OptimizedImage from "@food/components/OptimizedImage"
import { HeroBannerSkeleton } from "@food/components/ui/loading-skeletons"
import { isModuleAuthenticated } from "@food/utils/auth"
import { filterCategoriesForVegMode } from "@food/utils/vegMode"
import {
  buildFoodCacheKey,
  getFoodPageCache,
  setFoodPageCache,
} from "@food/utils/foodPageCache"
import { AppImage, Sheet, Text, resolveImageSource } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"

// eslint-disable-next-line no-unused-vars
const debugLog = (...args) => {}
// eslint-disable-next-line no-unused-vars
const debugWarn = (...args) => {}
// eslint-disable-next-line no-unused-vars
const debugError = (...args) => {}
const DINING_CACHE_TTL_MS = 15 * 60 * 1000
const RED = "#DC2626"

const isDiningCacheFresh = (cached) =>
  Boolean(cached?.ts && Date.now() - Number(cached.ts) < DINING_CACHE_TTL_MS)

const slugifyValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const getCoordinates = (restaurant) => {
  const latitude = restaurant?.location?.latitude
  const longitude = restaurant?.location?.longitude
  if (typeof latitude === "number" && typeof longitude === "number") {
    return { latitude, longitude }
  }

  const coords = restaurant?.location?.coordinates
  if (Array.isArray(coords) && coords.length === 2) {
    return { latitude: coords[1], longitude: coords[0] }
  }

  return null
}

const getDistanceKm = (userLocation, restaurant) => {
  const userLat = Number(userLocation?.latitude)
  const userLng = Number(userLocation?.longitude)
  const restaurantCoords = getCoordinates(restaurant)

  if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || !restaurantCoords) {
    return Number.POSITIVE_INFINITY
  }

  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(restaurantCoords.latitude - userLat)
  const dLng = toRadians(restaurantCoords.longitude - userLng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(userLat)) *
      Math.cos(toRadians(restaurantCoords.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const loadingCategoryCards = Array.from({ length: 6 }, (_, index) => `category-skeleton-${index}`)
const loadingRestaurantCards = Array.from({ length: 6 }, (_, index) => `restaurant-skeleton-${index}`)

// before:animate-[shimmer_2.2s_infinite] — a light band sweeping across the skeleton
export function Shimmer({ radiusValue = 0 }) {
  const x = useRef(new Animated.Value(0)).current
  const [w, setW] = useState(0)
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [x])
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[StyleSheet.absoluteFill, { overflow: "hidden", borderRadius: radiusValue }]}
    >
      {w > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w, w * 2] }) }] },
          ]}
        >
          <LinearGradient
            colors={["transparent", alpha("#ffffff", 0.3), "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  )
}

function DiningSectionHeaderSkeleton() {
  return (
    <View style={{ marginBottom: sp(6), paddingHorizontal: sp(1), gap: sp(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
        <View style={{ height: 32, width: 4, borderRadius: 9999, backgroundColor: "#f0dcca", overflow: "hidden" }}>
          <Shimmer />
        </View>
        <View style={{ height: 28, width: 224, maxWidth: "70%", borderRadius: 9999, backgroundColor: "#ead8c8", overflow: "hidden" }}>
          <Shimmer radiusValue={9999} />
        </View>
      </View>
      <View style={{ height: 28, width: 128, borderRadius: 9999, backgroundColor: "#f5e8ef", overflow: "hidden" }}>
        <Shimmer radiusValue={9999} />
      </View>
    </View>
  )
}

function DiningCategorySkeleton({ width }) {
  return (
    <View
      style={{
        width,
        height: 114,
        overflow: "hidden",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "#efe2d3",
        ...shadow.xs,
        shadowColor: "#3c0f3d",
      }}
    >
      <LinearGradient colors={["#fdfafc", "#f9f3f7"]} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 10, paddingHorizontal: sp(3), paddingTop: sp(3) }}>
        <View style={{ height: 12, width: 64, borderRadius: 9999, backgroundColor: "#f0dcca" }} />
        <View style={{ marginTop: sp(3), height: 16, width: 96, maxWidth: "100%", borderRadius: 9999, backgroundColor: "#ead2bc" }} />
        <View style={{ marginTop: sp(2), height: 16, width: 80, maxWidth: "100%", borderRadius: 9999, backgroundColor: "#f3e3d4" }} />
      </View>
      <LinearGradient
        colors={["#fcf4f9", "#f5e8f1"]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "64%", borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }}
      >
        <View style={{ position: "absolute", bottom: sp(3), left: sp(3), height: 56, width: 56, borderRadius: 28, backgroundColor: alpha("#ffffff", 0.45) }} />
      </LinearGradient>
      <Shimmer radiusValue={22} />
    </View>
  )
}

function DiningRestaurantSkeleton() {
  return (
    <View style={{ overflow: "hidden", borderRadius: radius["2xl"], backgroundColor: colors.white, ...shadow.md, borderWidth: 1, borderColor: "#efe2d3" }}>
      <View style={{ height: 192, overflow: "hidden" }}>
        <LinearGradient colors={["#fcf6fa", "#f9edf5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ position: "absolute", left: sp(4), top: sp(4), height: 32, width: 112, borderRadius: radius.lg, backgroundColor: alpha("#000000", 0.1) }} />
        <View style={{ position: "absolute", right: sp(4), top: sp(4), height: 36, width: 36, borderRadius: radius.lg, backgroundColor: alpha("#ffffff", 0.6) }} />
        <LinearGradient
          colors={[RED, alpha("#000000", 0.2 * 0)]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "40%" }}
        >
          <View style={{ flex: 1, justifyContent: "flex-end", paddingLeft: sp(4), paddingBottom: sp(4) }}>
            <View style={{ height: 10, width: 96, borderRadius: 9999, backgroundColor: alpha("#ffffff", 0.35) }} />
            <View style={{ marginTop: sp(2), height: 1, width: 96, backgroundColor: alpha("#ffffff", 0.25) }} />
            <View style={{ marginTop: sp(3), height: 16, width: 160, borderRadius: 9999, backgroundColor: alpha("#ffffff", 0.55) }} />
          </View>
        </LinearGradient>
        <Shimmer />
      </View>
      <View style={{ gap: sp(4), padding: sp(4) }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) }}>
          <View style={{ flex: 1 }}>
            <View style={{ height: 20, width: 160, borderRadius: 9999, backgroundColor: "#ead8c8" }} />
            <View style={{ marginTop: sp(2), height: 16, width: 96, borderRadius: 9999, backgroundColor: "#f2e7dd" }} />
          </View>
          <View style={{ height: 32, width: 48, borderRadius: radius.lg, backgroundColor: "#d7efe0" }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
          <View style={{ height: 16, width: 16, borderRadius: 8, backgroundColor: "#efe2d7" }} />
          <View style={{ height: 16, width: 96, borderRadius: 9999, backgroundColor: "#efe2d7" }} />
          <View style={{ height: 16, width: 16, borderRadius: 8, backgroundColor: "#f5ece4" }} />
          <View style={{ height: 16, width: 80, borderRadius: 9999, backgroundColor: "#f5ece4" }} />
        </View>
        <View style={{ height: 16, width: 192, borderRadius: 9999, backgroundColor: "#f0e1d3" }} />
      </View>
    </View>
  )
}

// initial { opacity: 0, y: 30, scale: 0.95 } -> visible (spring, stiffness 100, delay index * 0.1)
export function InViewEntrance({ index, children, style }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.spring(a, { toValue: 1, stiffness: 100, damping: 10 * 2, mass: 1, delay: index * 100, useNativeDriver: true })
    anim.start()
    return () => anim.stop()
  }, [a, index])
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
            { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

// initial { opacity: 0 } -> { opacity: 1 } (0.28s easeOut)
function FadeIn({ children, style }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.timing(a, { toValue: 1, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true })
    anim.start()
    return () => anim.stop()
  }, [a])
  return <Animated.View style={[style, { opacity: a }]}>{children}</Animated.View>
}

export default function Dining({ isTabActive = true }) {
  // eslint-disable-next-line no-unused-vars
  const navigate = useNavigate()
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const [heroSearch, setHeroSearch] = useState("")
  const [diningSearchOpen, setDiningSearchOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)

  // (The web locks the page scroll behind the open filter sheet; the native Sheet is a modal.)
  const listRef = useRef(null)
  const { location } = useLocationHook()
  const { zoneId, loading: zoneLoading } = useZone(location)
  const { addFavorite, removeFavorite, isFavorite, vegMode, vegModeOption, userProfile } = useProfile()

  // eslint-disable-next-line no-unused-vars
  const initials = useMemo(() => {
    if (!userProfile) return "";
    const name = userProfile.firstName || userProfile.name || "";
    return name[0]?.toUpperCase() || "U";
  }, [userProfile]);

  const [categories, setCategories] = useState([])
  const [restaurantList, setRestaurantList] = useState([])
  const [loading, setLoading] = useState(true)
  const diningCacheKeyRef = useRef(null)
  const [diningHeroBanners, setDiningHeroBanners] = useState([])
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  const autoSlideIntervalRef = useRef(null)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const touchEndXRef = useRef(0)
  const touchEndYRef = useRef(0)
  const isBannerSwipingRef = useRef(false)

  const resolveLocationForDining = useCallback(() => {
    const fromHook = location || {}
    const cityFromHook = String(fromHook?.city || "").trim()
    const hasValidHookCity = cityFromHook && cityFromHook.toLowerCase() !== "current location"

    if (hasValidHookCity) {
      return fromHook
    }

    try {
      const raw = localStorage.getItem("userLocation")
      if (!raw) return fromHook
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" ? { ...fromHook, ...parsed } : fromHook
    } catch {
      return fromHook
    }
  }, [location])

  // force = skip the page cache (pull to refresh).
  const fetchDiningData = useCallback(async ({ force = false } = {}) => {
    try {
      const activeLocation = resolveLocationForDining()
      const lat = Number(activeLocation?.latitude)
      const lng = Number(activeLocation?.longitude)
      const cityRaw = resolveServiceCity({
        locality: activeLocation?.city || "",
        formattedAddress:
          activeLocation?.formattedAddress || activeLocation?.address || "",
        fallback: String(activeLocation?.city || "").trim(),
      })
      const city =
        cityRaw && cityRaw.toLowerCase() !== "current location" ? cityRaw : ""

      const restaurantParams = {}
      if (city) restaurantParams.city = city
      if (zoneId) restaurantParams.zoneId = zoneId
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        restaurantParams.lat = lat
        restaurantParams.lng = lng
      }

      if (!zoneId) {
        setDiningHeroBanners([])
        setCategories([])
        setRestaurantList([])
        setLoading(false)
        return
      }

      const cacheKey = buildFoodCacheKey("dining", {
        zoneId,
        city: city || "",
      })
      diningCacheKeyRef.current = cacheKey
      const cached = force ? null : getFoodPageCache(cacheKey)

      if (isDiningCacheFresh(cached) && cached.restaurants) {
        setDiningHeroBanners(cached.banners || [])
        setCategories(cached.categories || [])
        setRestaurantList(cached.restaurants || [])
        setLoading(false)
        return
      }

      if (cached?.restaurants?.length) {
        setDiningHeroBanners(cached.banners || [])
        setCategories(cached.categories || [])
        setRestaurantList(cached.restaurants || [])
        setLoading(false)
      } else {
        setLoading(true)
      }

      const [bannerResponse, cats, rests] = await Promise.all([
        diningAPI.getHeroBanners().catch(() => ({ data: { success: false, data: { banners: [] } } })),
        diningAPI.getCategories(),
        diningAPI.getRestaurants(restaurantParams),
      ])

      const heroBanners = Array.isArray(bannerResponse?.data?.data?.banners)
        ? bannerResponse.data.data.banners
            .map((banner, index) => {
              const imageUrl = String(banner?.imageUrl || "").trim()
              if (!imageUrl) return null

              return {
                id: String(banner?._id || banner?.id || `dining-banner-${index}`),
                imageUrl,
                tagline: String(banner?.title || banner?.tagline || "").trim(),
                promoCode: String(banner?.ctaText || banner?.promoCode || "").trim(),
              }
            })
            .filter(Boolean)
        : []

      const nextCategories = cats?.data?.success ? (cats.data.data || []) : []
      const nextRestaurants = rests?.data?.success ? (rests.data.data || []) : []

      setDiningHeroBanners(heroBanners)
      setCategories(nextCategories)
      setRestaurantList(nextRestaurants)
      setFoodPageCache(cacheKey, {
        banners: heroBanners,
        categories: nextCategories,
        restaurants: nextRestaurants,
        ts: Date.now(),
      })
    } catch (error) {
      debugError("Failed to fetch dining data", error)
      if (!getFoodPageCache(diningCacheKeyRef.current)?.restaurants?.length) {
        setDiningHeroBanners([])
        setCategories([])
        setRestaurantList([])
      }
    } finally {
      setLoading(false)
    }
  }, [resolveLocationForDining, zoneId])

  useEffect(() => {
    if (!isTabActive) return undefined
    fetchDiningData()
    return undefined
  }, [fetchDiningData, isTabActive])

  // Pull to refresh: the page goes back to its skeleton while it reloads.
  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setLoading(true)
    try {
      await fetchDiningData({ force: true })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetchDiningData])

  const safeCategories = useMemo(() => {
    return (Array.isArray(categories) ? categories : [])
      .filter((category) => {
        const categoryName = String(category?.name || "").trim()
        return categoryName.length > 0
      })
      .map((category) => ({
        ...category,
        name: String(category?.name || "").trim(),
        slug: String(category?.slug || category?.name || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        imageUrl: String(category?.imageUrl || "").trim()
      }))
  }, [categories])

  const normalizedRestaurantList = useMemo(() => {
    return (Array.isArray(restaurantList) ? restaurantList : [])
      .filter((restaurant) => {
        const name = String(restaurant?.restaurantName || restaurant?.name || "").trim()
        return name.length > 0
      })
      .sort((a, b) => {
        const aEnabled = a?.diningSettings?.isEnabled === true
        const bEnabled = b?.diningSettings?.isEnabled === true
        if (aEnabled && !bEnabled) return -1
        if (!aEnabled && bEnabled) return 1
        return 0
      })
      .map((restaurant, index) => {
        const distanceKm = getDistanceKm(location, restaurant)
        const restaurantName = String(restaurant?.restaurantName || restaurant?.name || "").trim()
        return {
          ...restaurant,
          id: restaurant?._id || restaurant?.id || `restaurant-${index}`,
          name: restaurantName,
          slug: String(restaurant?.restaurantNameNormalized || "").trim() || slugifyValue(restaurantName),
          cuisine: Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0
            ? restaurant.cuisines.join(", ")
            : "Multi-cuisine",
          image: String(
            restaurant?.coverImages?.[0]?.url ||
            restaurant?.coverImages?.[0] ||
            restaurant?.coverImage ||
            restaurant?.menuImages?.[0]?.url ||
            restaurant?.menuImages?.[0] ||
            restaurant?.profileImage?.url ||
            restaurant?.profileImage ||
            ""
          ).trim(),
          offer: String(restaurant?.offer || "Pre-book table").trim(),
          featuredDish: String(restaurant?.featuredDish || "Chef's special").trim(),
          featuredPrice: Number(restaurant?.featuredPrice || 0),
          rating: Number(restaurant?.rating || restaurant?.avgRating || 0),
          deliveryTime: String(
            restaurant?.estimatedDeliveryTime ||
            restaurant?.deliveryTime ||
            (restaurant?.estimatedDeliveryTimeMinutes ? `${restaurant.estimatedDeliveryTimeMinutes} mins` : "30-40 mins")
          ).trim(),
          distanceValue: distanceKm,
          pureVegRestaurant:
            restaurant?.pureVegRestaurant === true ||
            restaurant?.diningSettings?.pureVegRestaurant === true,
          hasNonVegMenu:
            restaurant?.hasNonVegMenu === true
              ? true
              : restaurant?.hasNonVegMenu === false
                ? false
                : undefined,
          isPureVeg:
            restaurant?.hasNonVegMenu === true
              ? false
              : restaurant?.isPureVeg === true ||
                restaurant?.hasNonVegMenu === false,
          diningType: (() => {
            const rawType = restaurant?.diningSettings?.diningType
            let types = []
            if (Array.isArray(rawType)) {
              types = rawType
            } else if (typeof rawType === "string" && rawType.trim()) {
              types = rawType.split(",")
            } else if (restaurant?.categories && Array.isArray(restaurant.categories)) {
              types = restaurant.categories.map(c => typeof c === 'string' ? c : c.slug || c.name)
            }

            const uniqueTypes = Array.from(new Set(types.map(type => slugifyValue(type)).filter(Boolean)))
            return uniqueTypes[0] || "family-dining"
          })(),
          isEnabled: restaurant?.diningSettings?.isEnabled === true,
        }
      })
  }, [restaurantList, location])

  // eslint-disable-next-line no-unused-vars
  const categoryRestaurantKeys = useMemo(() => {
    const keySet = new Set()

    normalizedRestaurantList.forEach((restaurant) => {
      const rawCategories = []

      // 1. Existing categories from the platform categories mapping
      if (Array.isArray(restaurant?.categories)) {
        rawCategories.push(...restaurant.categories)
      }

      // 2. New diningType array from diningSettings
      const dSettingsType = restaurant?.diningSettings?.diningType
      if (Array.isArray(dSettingsType)) {
        rawCategories.push(...dSettingsType)
      } else if (typeof dSettingsType === "string" && dSettingsType) {
        rawCategories.push(dSettingsType)
      }

      rawCategories.forEach((category) => {
        if (!category) return

        if (typeof category === "string") {
          const normalized = slugifyValue(category)
          if (normalized) keySet.add(normalized)
          return
        }

        if (typeof category === "object") {
          const slug = slugifyValue(category?.slug || category?.name || category?.title || "")
          if (slug) keySet.add(slug)
        }
      })
    })

    return keySet
  }, [normalizedRestaurantList])

  const filteredCategories = useMemo(
    () => filterCategoriesForVegMode(safeCategories, vegMode),
    [safeCategories, vegMode],
  )

  const nearbyPopularRestaurants = useMemo(() => {
    const within10Km = normalizedRestaurantList
      .filter((restaurant) => Number.isFinite(restaurant.distanceValue) && restaurant.distanceValue <= 10)
      .sort((a, b) => a.distanceValue - b.distanceValue)

    return within10Km.length > 0 ? within10Km : normalizedRestaurantList
  }, [normalizedRestaurantList])

  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
  }

  const filteredRestaurants = useMemo(() => {
    let filtered = nearbyPopularRestaurants.filter(
      (restaurant) => restaurant?.diningSettings?.isEnabled === true,
    )

    // Pure veg mode: only restaurants with no non-veg menu (full menu scan from API)
    if (vegMode && vegModeOption === "pure-veg") {
      filtered = filtered.filter((restaurant) => {
        if (restaurant?.hasNonVegMenu === true) return false
        if (restaurant?.isPureVeg === true) return true
        if (restaurant?.hasNonVegMenu === false) return true
        return (
          restaurant?.pureVegRestaurant === true ||
          restaurant?.diningSettings?.pureVegRestaurant === true
        )
      })
    }

    if (activeFilters.has('delivery-under-30')) {
      filtered = filtered.filter(r => {
        const timeStr = String(r.deliveryTime || '')
        const timeMatch = timeStr.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1], 10) <= 30
      })
    }
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeStr = String(r.deliveryTime || '')
        const timeMatch = timeStr.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1], 10) <= 45
      })
    }
    if (activeFilters.has('distance-under-1km')) {
      filtered = filtered.filter(r => (r.distanceValue || 0) <= 1.0)
    }
    if (activeFilters.has('distance-under-2km')) {
      filtered = filtered.filter(r => (r.distanceValue || 0) <= 2.0)
    }
    if (activeFilters.has('rating-35-plus')) {
      filtered = filtered.filter(r => r.rating >= 3.5)
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('rating-45-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
    }

    // Apply cuisine filter
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase()))
    }

    // Apply search query (restaurant name only)
    if (heroSearch.trim()) {
      const q = heroSearch.trim().toLowerCase()
      filtered = filtered.filter(r =>
        String(r.name || r.restaurantName || '').toLowerCase().includes(q)
      )
    }

    // Apply sorting
    if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    }

    return filtered
  }, [nearbyPopularRestaurants, activeFilters, selectedCuisine, sortBy, heroSearch, vegMode, vegModeOption])

  // Cuisine filter options come from the cuisines the listed restaurants really chose
  const availableCuisines = useMemo(() => {
    const set = new Set()
    for (const r of nearbyPopularRestaurants || []) {
      String(r.cuisine || "")
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c && c.toLowerCase() !== "multi-cuisine")
        .forEach((c) => set.add(c))
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [nearbyPopularRestaurants])

  const diningSearchQuery = heroSearch.trim()
  const isDiningSearching = diningSearchQuery.length > 0
  const showPageSkeleton = (loading || zoneLoading) && !isDiningSearching
  const showDiningSearchEmpty =
    isDiningSearching && !loading && filteredRestaurants.length === 0

  useEffect(() => {
    if (!isDiningSearching) return
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true })
  }, [isDiningSearching, diningSearchQuery])

  useEffect(() => {
    setCurrentBannerIndex((prev) => {
      if (diningHeroBanners.length === 0) return 0
      return Math.min(prev, diningHeroBanners.length - 1)
    })
  }, [diningHeroBanners.length])

  useEffect(() => {
    const urls = diningHeroBanners.map((banner) => resolveImageSource(banner?.imageUrl)?.uri).filter(Boolean)
    if (urls.length) ExpoImage.prefetch(urls, "memory-disk").catch(() => {})
  }, [diningHeroBanners])

  const startBannerAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) {
      clearInterval(autoSlideIntervalRef.current)
    }

    if (diningHeroBanners.length <= 1) return

    autoSlideIntervalRef.current = setInterval(() => {
      if (!isBannerSwipingRef.current) {
        setCurrentBannerIndex((prev) => (prev + 1) % diningHeroBanners.length)
      }
    }, 3500)
  }, [diningHeroBanners.length])

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

  const handleBannerTouchStart = useCallback((event) => {
    if (diningHeroBanners.length <= 1) return
    const touch = event.nativeEvent.touches?.[0] || event.nativeEvent
    touchStartXRef.current = touch.pageX
    touchStartYRef.current = touch.pageY
    touchEndXRef.current = touch.pageX
    touchEndYRef.current = touch.pageY
    isBannerSwipingRef.current = true
  }, [diningHeroBanners.length])

  const handleBannerTouchMove = useCallback((event) => {
    if (!isBannerSwipingRef.current) return
    const touch = event.nativeEvent.touches?.[0] || event.nativeEvent
    touchEndXRef.current = touch.pageX
    touchEndYRef.current = touch.pageY
  }, [])

  const handleBannerTouchEnd = useCallback(() => {
    if (!isBannerSwipingRef.current || diningHeroBanners.length <= 1) {
      isBannerSwipingRef.current = false
      return
    }

    const deltaX = touchEndXRef.current - touchStartXRef.current
    const deltaY = Math.abs(touchEndYRef.current - touchStartYRef.current)
    const minSwipeDistance = 40

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      setCurrentBannerIndex((prev) => {
        if (deltaX > 0) {
          return (prev - 1 + diningHeroBanners.length) % diningHeroBanners.length
        }
        return (prev + 1) % diningHeroBanners.length
      })
      resetBannerAutoSlide()
    }

    isBannerSwipingRef.current = false
  }, [diningHeroBanners.length, resetBannerAutoSlide])

  // banner slide: translateX(-index * 100%) with a 500ms ease-out transition
  const bannerWidth = screenWidth - sp(3) * 2
  const bannerHeight = screenHeight * 0.24
  const bannerX = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(bannerX, {
      toValue: -currentBannerIndex * bannerWidth,
      duration: 500,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [currentBannerIndex, bannerWidth, bannerX])

  const toggleSearchOpen = (open) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(240, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity))
    setDiningSearchOpen(open)
  }

  const requireLogin = (e) => {
    if (!isModuleAuthenticated('user')) {
      e?.preventDefault?.();
      window.dispatchEvent(new CustomEvent('show-login-required'));
    }
  }

  const categoryWidth = (screenWidth - sp(3) * 2 - 10 * 2) / 3

  // ------------------------------------------------------------ header (sticky on the web)
  const header = (
    <View style={[s.header, { paddingTop: insets.top }]}>
      <View style={s.headerInner}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {/* Left: Takeaway-style heading (location only changeable from Delivery home) */}
          <View style={{ minWidth: 0 }}>
            <Text style={s.headerEyebrow}>Table Booking</Text>
            <Text style={s.headerTitle}>Dining</Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
            <Pressable
              onPress={() => toggleSearchOpen(true)}
              accessibilityLabel="Search dining restaurants"
              style={({ pressed }) => [s.searchBtn, diningSearchOpen ? s.searchBtnOpen : s.searchBtnClosed, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Search size={20} color={diningSearchOpen ? RED : colors.white} strokeWidth={2.5} />
            </Pressable>
            <Link
              to="/food/user/wallet"
              state={{ from: '/food/user' }}
              onPress={requireLogin}
              style={({ pressed }) => [s.walletBtn, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              <Wallet size={18} color={colors.white} strokeWidth={2} />
            </Link>

            <Link
              to="/food/user/profile"
              state={{ from: "/food/user/dining" }}
              onPress={requireLogin}
              style={({ pressed }) => [s.avatarBtn, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Avatar style={{ height: "100%", width: "100%", backgroundColor: "#FFF5E6" }}>
                <AvatarImage
                  src={userProfile?.profileImage || "/assets/images/profile_avatar.webp"}
                  alt="Profile"
                  style={{ width: "100%", height: "100%" }}
                />
                <AvatarFallback style={{ backgroundColor: "#FFF5E6" }}>
                  <AppImage src="/assets/images/profile_avatar.webp" style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </AvatarFallback>
              </Avatar>
            </Link>
          </View>
        </View>

        {diningSearchOpen && (
          <SearchBarIn>
            <View style={s.searchBar}>
              <Search size={16} color={RED} strokeWidth={2.5} style={{ marginLeft: sp(2) }} />
              <View style={{ flex: 1, paddingHorizontal: sp(3) }}>
                <Input
                  autoFocus
                  value={heroSearch}
                  onChangeText={setHeroSearch}
                  style={s.searchInput}
                  placeholder="Search dining restaurants..."
                  placeholderTextColor={colors.gray[400]}
                  returnKeyType="search"
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {heroSearch ? (
                  <Pressable onPress={() => setHeroSearch("")} style={s.clearBtn} accessibilityLabel="Clear search">
                    <X size={14} color={t.dark ? colors.gray[300] : colors.gray[500]} strokeWidth={2.5} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setHeroSearch("");
                    toggleSearchOpen(false);
                  }}
                  style={s.closeSearchBtn}
                  accessibilityLabel="Close search"
                >
                  <X size={16} color={RED} strokeWidth={2.5} />
                </Pressable>
              </View>
            </View>
          </SearchBarIn>
        )}
      </View>
    </View>
  )

  const banner = !isDiningSearching ? (
    <View style={{ paddingHorizontal: sp(3), paddingTop: sp(5), paddingBottom: sp(3) }}>
      {showPageSkeleton ? (
        <HeroBannerSkeleton style={{ height: bannerHeight, borderRadius: 22, ...shadow.lg }} />
      ) : (
        <FadeIn style={[s.bannerBox, { height: bannerHeight }]}>
          {diningHeroBanners.length > 0 ? (
            <View
              style={{ height: "100%", width: "100%" }}
              onTouchStart={handleBannerTouchStart}
              onTouchMove={handleBannerTouchMove}
              onTouchEnd={handleBannerTouchEnd}
              onTouchCancel={handleBannerTouchEnd}
            >
              <Animated.View style={{ flexDirection: "row", height: "100%", transform: [{ translateX: bannerX }] }}>
                {diningHeroBanners.map((banner, index) => (
                  <View key={banner.id} style={{ height: "100%", width: bannerWidth }}>
                    <OptimizedImage
                      src={banner.imageUrl}
                      alt={`Dining Banner ${index + 1}`}
                      style={{ width: "100%", height: "100%" }}
                      objectFit="cover"
                      priority={index === 0}
                    />
                    <View style={s.bannerTextWrap}>
                      <View style={s.bannerTextBox}>
                        {banner.promoCode ? <Text style={s.bannerPromo}>{banner.promoCode}</Text> : null}
                        {banner.tagline ? <Text style={s.bannerTagline}>{banner.tagline}</Text> : null}
                      </View>
                    </View>
                  </View>
                ))}
              </Animated.View>
              {diningHeroBanners.length > 1 && (
                <View style={s.dotsWrap} pointerEvents="box-none">
                  <View style={s.dots}>
                    {diningHeroBanners.map((banner, index) => (
                      <Pressable
                        key={`${banner.id}-dot`}
                        accessibilityLabel={`Go to dining banner ${index + 1}`}
                        hitSlop={6}
                        onPress={() => {
                          setCurrentBannerIndex(index)
                          resetBannerAutoSlide()
                        }}
                        style={[s.dot, currentBannerIndex === index ? s.dotActive : null]}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={{ height: "100%", width: "100%" }}>
              <LinearGradient colors={["#fff5e8", "#fffdf9", "#ffe3cf"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={[alpha("#eb590e", 0.22), "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0.45, y: 0.45 }} style={StyleSheet.absoluteFill} />
              <View style={{ position: "absolute", bottom: sp(6), left: sp(6), maxWidth: "70%" }}>
                <Text style={s.fallbackEyebrow}>Dining</Text>
                <Text style={s.fallbackTitle}>Fresh dining picks near you</Text>
                <Text style={s.fallbackText}>Banner will appear here as soon as a dining hero banner is available.</Text>
              </View>
            </View>
          )}
        </FadeIn>
      )}
    </View>
  ) : null

  const filterChips = [
    { id: 'delivery-under-30', label: 'Under 30 mins' },
    { id: 'delivery-under-45', label: 'Under 45 mins' },
    { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
    { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
    { id: 'rating-35-plus', label: '3.5+ Rating' },
    { id: 'rating-4-plus', label: '4.0+ Rating' },
    { id: 'rating-45-plus', label: '4.5+ Rating' },
  ]

  const listHeader = (
    <View>
      {banner}
      <View style={{ paddingHorizontal: sp(3), paddingTop: isDiningSearching ? sp(2) : sp(3) }}>
        {showPageSkeleton ? (
          <>
            {!isDiningSearching && (
              <View style={s.categoryGrid}>
                {loadingCategoryCards.map((key) => (
                  <DiningCategorySkeleton key={key} width={categoryWidth} />
                ))}
              </View>
            )}

            <View style={{ marginBottom: sp(4), marginTop: isDiningSearching ? 0 : sp(4) }}>
              {!isDiningSearching && <DiningSectionHeaderSkeleton />}

              <View style={{ marginBottom: sp(4), paddingVertical: sp(1) }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), overflow: "hidden", paddingBottom: sp(1) }}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <View
                      key={`filter-skeleton-${index}`}
                      style={{ height: 32, borderRadius: radius.md, borderWidth: 1, borderColor: "#efe3d7", backgroundColor: "#fff7f1", width: index === 0 ? 90 : index % 2 === 0 ? 122 : 108, overflow: "hidden" }}
                    >
                      <Shimmer radiusValue={radius.md} />
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ gap: sp(4) }}>
                {loadingRestaurantCards.map((key) => (
                  <DiningRestaurantSkeleton key={key} />
                ))}
              </View>
            </View>
          </>
        ) : (
          <FadeIn>
            {/* Categories Section */}
            {!isDiningSearching && (
              <View style={s.categoryGrid}>
                {filteredCategories.map((category, index) => (
                  // web: /user/dining/<slug>, which the app router redirects to /food/user/dining/<slug>
                  <Link key={category._id || category.id || index} to={`/food/user/dining/${category.slug}`}>
                    <View style={[s.categoryCard, { width: categoryWidth }]}>
                      <View style={{ flex: 1, padding: 10 }}>
                        <Text style={s.categoryName}>{category.name}</Text>
                        <View style={s.categoryImageBox}>
                          {category.imageUrl ? (
                            <OptimizedImage
                              src={category.imageUrl}
                              alt={category.name}
                              style={{ width: "100%", height: "100%" }}
                              objectFit="contain"
                              priority={index < 6}
                            />
                          ) : (
                            <View style={{ flex: 1 }}>
                              <LinearGradient colors={["#fff7ee", "#fff1e1"]} style={StyleSheet.absoluteFill} />
                              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "60%", borderTopLeftRadius: 999, borderTopRightRadius: 999, backgroundColor: alpha("#ffffff", 0.3) }} />
                              <Shimmer />
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </Link>
                ))}
              </View>
            )}

            {/* Popular Restaurants Around You Section */}
            <View style={{ marginTop: isDiningSearching ? 0 : sp(4) }}>
              {!showDiningSearchEmpty && (
                <View style={{ marginBottom: sp(6), paddingHorizontal: sp(1), gap: sp(3) }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
                    <View style={s.titleBar} />
                    <Text style={s.sectionTitle} numberOfLines={1}>
                      {isDiningSearching ? "Search Results" : "Popular Restaurants Within 10km"}
                    </Text>
                  </View>
                  {!isDiningSearching && (
                    <View style={{ flexDirection: "row" }}>
                      <View style={s.countPill}>
                        <Text style={s.countPillText}>{filteredRestaurants.length} NEARBY PLACES</Text>
                      </View>
                    </View>
                  )}
                  {isDiningSearching && filteredRestaurants.length > 0 && (
                    <View style={{ flexDirection: "row" }}>
                      <View style={s.countPill}>
                        <Text style={s.countPillText}>
                          {filteredRestaurants.length} RESULT{filteredRestaurants.length === 1 ? "" : "S"}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {!isDiningSearching ? (
                <View style={{ paddingVertical: sp(1), marginBottom: sp(4) }}>
                  <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 6, paddingVertical: sp(1) }}>
                    {/* Filter Button - Opens Modal */}
                    <Button variant="outline" onPress={() => setIsFilterOpen(true)} style={s.chip}>
                      <SlidersHorizontal size={12} color={t.dark ? colors.gray[300] : colors.gray[700]} />
                      <Text style={s.chipText}>Filters</Text>
                    </Button>

                    {/* Filter Buttons */}
                    {filterChips.map((filter) => {
                      const Icon = filter.icon
                      const isActive = activeFilters.has(filter.id)
                      return (
                        <Button key={filter.id} variant="outline" onPress={() => toggleFilter(filter.id)} style={[s.chip, isActive && s.chipActive]}>
                          {Icon && (
                            <Icon
                              size={12}
                              color={isActive ? colors.white : (t.dark ? colors.gray[300] : colors.gray[600])}
                              fill={isActive ? colors.white : "none"}
                            />
                          )}
                          <Text style={[s.chipText, isActive && { color: colors.white }]}>{filter.label}</Text>
                        </Button>
                      )
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </FadeIn>
        )}
      </View>
    </View>
  )

  const renderRestaurant = ({ item: restaurant, index }) => {
    const restaurantSlug = restaurant.slug || encodeURIComponent(restaurant.name)
    const diningDetailPath = `/food/user/dining/${restaurant.diningType}/${restaurantSlug}`
    const favorite = isFavorite(restaurantSlug)
    const isFirstTwo = index < 2

    const handleToggleFavorite = () => {
      if (favorite) {
        removeFavorite(restaurantSlug)
      } else {
        addFavorite({
          slug: restaurantSlug,
          name: restaurant.name,
          cuisine: restaurant.cuisine,
          rating: restaurant.rating,
          deliveryTime: restaurant.deliveryTime,
          distance: restaurant.distance,
          image: restaurant.image
        })
      }
    }

    const showFeatured = restaurant.featuredDish && restaurant.featuredDish !== "Chef's special" && restaurant.featuredPrice > 0

    return (
      <InViewEntrance index={index} style={{ paddingHorizontal: sp(3), marginBottom: sp(4) }}>
        <View style={s.cardShadow}>
          <Link to={diningDetailPath} state={{ restaurant }} style={{ borderRadius: 22 }}>
            <Card style={s.card}>
              {/* Image Section */}
              <View style={s.cardImage}>
                <View style={StyleSheet.absoluteFill}>
                  {restaurant.image ? (
                    <OptimizedImage
                      src={restaurant.image}
                      alt={restaurant.name}
                      style={{ width: "100%", height: "100%" }}
                      objectFit="cover"
                      priority={index < 3}
                    />
                  ) : (
                    <View style={{ flex: 1 }}>
                      <LinearGradient colors={["#fff5e8", "#fffaf4", "#ffe5d0"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <LinearGradient colors={[alpha("#eb590e", 0.24), "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 0.4 }} style={StyleSheet.absoluteFill} />
                      <Shimmer />
                    </View>
                  )}
                </View>

                {/* Featured Dish Badge - Top Left */}
                {showFeatured && (
                  <View style={{ position: "absolute", top: sp(3), left: sp(3), zIndex: 10 }}>
                    <View style={[s.featured, { backgroundColor: alpha(colors.gray[800], isFirstTwo ? 0.9 : 0.8) }, isFirstTwo && shadow.lg]}>
                      <Text style={s.featuredText}>
                        {restaurant.featuredDish} • ₹{restaurant.featuredPrice}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Bookmark Icon - Top Right */}
                <View style={{ position: "absolute", top: sp(3), right: sp(3), zIndex: 10 }}>
                  <Button variant="ghost" size="icon" style={s.bookmarkBtn} onPress={handleToggleFavorite}>
                    <Bookmark
                      size={20}
                      strokeWidth={2}
                      color={favorite ? (t.dark ? colors.gray[200] : colors.gray[800]) : (t.dark ? colors.gray[400] : colors.gray[600])}
                      fill={favorite ? (t.dark ? colors.gray[200] : colors.gray[800]) : "none"}
                    />
                  </Button>
                </View>

                {/* Red Section - Bottom 40% */}
                <LinearGradient colors={[RED, "transparent"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.cardBand}>
                  <View style={{ flex: 1, justifyContent: "flex-end", paddingLeft: sp(4), paddingBottom: sp(4) }}>
                    <Text style={s.bandEyebrow}>PRE-BOOK TABLE</Text>
                    <View style={{ height: 1, backgroundColor: alpha("#ffffff", 0.3), marginBottom: sp(2), width: 96 }} />
                    <Text style={s.bandOffer}>{restaurant.offer}</Text>
                  </View>
                </LinearGradient>
              </View>

              {/* Content Section */}
              <CardContent style={s.cardContent}>
                {/* Restaurant Name & Rating */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: isFirstTwo ? sp(2) : sp(3), marginBottom: sp(2) }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.cardName} numberOfLines={1}>{restaurant.name}</Text>
                  </View>
                  <View style={[s.ratingBadge, { backgroundColor: isFirstTwo ? colors.green[600] : "#267e3e" }, !isFirstTwo && shadow.sm]}>
                    <Text style={[s.ratingText, !isFirstTwo && { lineHeight: 14 }]}>{isFirstTwo ? restaurant.rating : (restaurant.rating || "0")}</Text>
                    <Star size={12} color={colors.white} fill={colors.white} />
                  </View>
                </View>

                {isFirstTwo ? (
                  <>
                    {/* Delivery Time & Distance */}
                    <View style={[s.metaRow, { gap: sp(1) }]}>
                      <Clock size={16} strokeWidth={1.5} color={s.metaText.color} />
                      <Text style={[s.metaText, { fontWeight: "500" }]}>{restaurant.deliveryTime}</Text>
                      <Text style={[s.metaText, { marginHorizontal: sp(1) }]}>|</Text>
                      <Text style={[s.metaText, { fontWeight: "500" }]}>{restaurant.distance}</Text>
                    </View>

                    {/* Dining Status Badge */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), marginTop: sp(1) }}>
                      <Badge variant="outline" style={[s.statusBadge, restaurant.isEnabled ? s.statusOn : s.statusOff]}>
                        <Text style={[s.statusText, { color: restaurant.isEnabled ? colors.green[700] : "#6b2c5f" }]}>
                          {restaurant.isEnabled ? "ON" : "OFF"}
                        </Text>
                      </Badge>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.slate[700] }}>Pre-book table</Text>
                    </View>
                  </>
                ) : (
                  <>
                    {/* Meta Info Row (Time | Distance) */}
                    <View style={[s.metaRow, { gap: 6, marginBottom: 10 }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1) }}>
                        <Clock size={16} strokeWidth={2} color={colors.gray[400]} />
                        <Text style={[s.metaText, { fontWeight: "500" }]}>{restaurant.deliveryTime}</Text>
                      </View>
                      <Text style={[s.metaText, { marginHorizontal: 2, color: colors.gray[300] }]}>|</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1) }}>
                        <MapPin size={14} strokeWidth={2} color={colors.gray[400]} />
                        <Text style={[s.metaText, { fontWeight: "500" }]}>{restaurant.distance || "Distance unavailable"}</Text>
                      </View>
                    </View>

                    {/* Pre-book Table Promo */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                      <Badge variant="outline" style={[s.statusBadge, restaurant.isEnabled ? s.statusOn : s.statusOff]}>
                        <Text style={[s.statusText, { color: restaurant.isEnabled ? colors.green[700] : "#6b2c5f" }]}>
                          {restaurant.isEnabled ? "ON" : "OFF"}
                        </Text>
                      </Badge>
                      <Text style={{ ...fontSize.sm, fontWeight: "700", color: t.dark ? colors.gray[400] : colors.gray[600] }}>Pre-book table</Text>
                    </View>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        </View>
      </InViewEntrance>
    )
  }

  const listEmpty = showPageSkeleton ? null : showDiningSearchEmpty ? (
    <View style={s.searchEmpty}>
      <View style={s.searchEmptyIcon}>
        <Search size={28} color={t.dark ? colors.gray[500] : colors.gray[300]} />
      </View>
      <Text style={s.searchEmptyTitle}>
        No dining restaurants found for &quot;{diningSearchQuery}&quot;
      </Text>
      <Text style={s.searchEmptySub}>Search by restaurant name only</Text>
    </View>
  ) : (
    <View style={{ paddingHorizontal: sp(3) }}>
      <View style={s.noRestaurants}>
        <Text style={s.noRestaurantsText}>
          No popular dining restaurants were found within 10 km for the current location.
        </Text>
      </View>
    </View>
  )

  const filterTabs = [
    { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
    { id: 'time', label: 'Time', icon: Timer },
    { id: 'rating', label: 'Rating', icon: Star },
    { id: 'distance', label: 'Distance', icon: MapPin },
    { id: 'price', label: 'Dish Price', icon: IndianRupee },
    { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
  ]

  const tile = (active) => [s.tile, active ? s.tileActive : s.tileIdle]
  const tileText = (active) => [s.tileText, active ? { color: RED } : null]
  const hasAnyFilter = activeFilters.size > 0 || sortBy || selectedCuisine

  return (
    <AnimatedPage style={[{ flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white }]}>
      {header}

      <FlatList
        ref={listRef}
        data={showPageSkeleton ? [] : filteredRestaurants}
        keyExtractor={(restaurant) => String(restaurant._id || restaurant.id)}
        renderItem={renderRestaurant}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: 160 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[RED]} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        windowSize={7}
      />

      {/* Filter Modal */}
      <Sheet open={isFilterOpen} onClose={() => setIsFilterOpen(false)} backdropOpacity={0.5} style={[s.sheet, { maxHeight: screenHeight * 0.85 }]}>
        {/* Header */}
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle}>Filters and sorting</Text>
          <Pressable
            onPress={() => {
              setActiveFilters(new Set())
              setSortBy(null)
              setSelectedCuisine(null)
            }}
          >
            <Text style={{ color: RED, fontWeight: "500", ...fontSize.sm }}>Clear all</Text>
          </Pressable>
        </View>

        {/* Body */}
        <View style={{ flexDirection: "row", flexShrink: 1, minHeight: 320 }}>
          {/* Left Sidebar - Tabs */}
          <View style={s.tabsCol}>
            {filterTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeFilterTab === tab.id
              return (
                <Pressable key={tab.id} onPress={() => setActiveFilterTab(tab.id)} style={[s.tabBtn, isActive && s.tabBtnActive]}>
                  {isActive && <View style={s.tabIndicator} />}
                  <Icon size={20} strokeWidth={1.5} color={isActive ? RED : (t.dark ? colors.gray[400] : colors.gray[500])} />
                  <Text style={[s.tabText, { color: isActive ? RED : (t.dark ? colors.gray[400] : colors.gray[500]) }]}>{tab.label}</Text>
                </Pressable>
              )
            })}
          </View>

          {/* Right Content Area - Scrollable */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: sp(4) }}>
            {/* Sort By Tab */}
            {activeFilterTab === 'sort' && (
              <View style={{ marginBottom: sp(8) }}>
                <Text style={s.tabTitle}>Sort by</Text>
                <View style={{ gap: sp(3) }}>
                  {[
                    { id: null, label: 'Relevance' },
                    { id: 'rating-high', label: 'Rating: High to Low' },
                    { id: 'rating-low', label: 'Rating: Low to High' },
                  ].map((option) => (
                    <Pressable key={option.id || 'relevance'} onPress={() => setSortBy(option.id)} style={[s.option, sortBy === option.id ? s.tileActive : s.tileIdle]}>
                      <Text style={[s.tileText, sortBy === option.id ? { color: RED } : null]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Time Tab */}
            {activeFilterTab === 'time' && (
              <View style={{ marginBottom: sp(8) }}>
                <Text style={s.tabTitle}>Estimated Time</Text>
                <View style={s.grid2}>
                  {[
                    { id: 'delivery-under-30', label: 'Under 30 mins' },
                    { id: 'delivery-under-45', label: 'Under 45 mins' },
                  ].map((opt) => (
                    <Pressable key={opt.id} onPress={() => toggleFilter(opt.id)} style={tile(activeFilters.has(opt.id))}>
                      <Timer size={24} strokeWidth={1.5} color={activeFilters.has(opt.id) ? RED : (t.dark ? colors.gray[400] : colors.gray[600])} />
                      <Text style={tileText(activeFilters.has(opt.id))}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Rating Tab */}
            {activeFilterTab === 'rating' && (
              <View style={{ marginBottom: sp(8) }}>
                <Text style={s.tabTitle}>Restaurant Rating</Text>
                <View style={s.grid2}>
                  {[
                    { id: 'rating-35-plus', label: 'Rated 3.5+' },
                    { id: 'rating-4-plus', label: 'Rated 4.0+' },
                    { id: 'rating-45-plus', label: 'Rated 4.5+' },
                  ].map((opt) => {
                    const active = activeFilters.has(opt.id)
                    return (
                      <Pressable key={opt.id} onPress={() => toggleFilter(opt.id)} style={tile(active)}>
                        <Star size={24} color={active ? RED : (t.dark ? colors.gray[500] : colors.gray[400])} fill={active ? RED : "none"} />
                        <Text style={tileText(active)}>{opt.label}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}

            {/* Distance Tab */}
            {activeFilterTab === 'distance' && (
              <View style={{ marginBottom: sp(8) }}>
                <Text style={s.tabTitle}>Distance</Text>
                <View style={s.grid2}>
                  {[
                    { id: 'distance-under-1km', label: 'Under 1 km' },
                    { id: 'distance-under-2km', label: 'Under 2 km' },
                  ].map((opt) => (
                    <Pressable key={opt.id} onPress={() => toggleFilter(opt.id)} style={tile(activeFilters.has(opt.id))}>
                      <MapPin size={24} strokeWidth={1.5} color={activeFilters.has(opt.id) ? RED : (t.dark ? colors.gray[400] : colors.gray[600])} />
                      <Text style={tileText(activeFilters.has(opt.id))}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Price Tab */}
            {activeFilterTab === 'price' && (
              <View style={{ marginBottom: sp(8) }}>
                <Text style={s.tabTitle}>Dish Price</Text>
                <View style={{ gap: sp(3) }}>
                  {[
                    { id: 'price-under-200', label: 'Under ₹200' },
                    { id: 'price-under-500', label: 'Under ₹500' },
                  ].map((opt) => {
                    const active = activeFilters.has(opt.id)
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => toggleFilter(opt.id)}
                        style={[s.option, { paddingVertical: sp(3) }, active ? { borderColor: RED, backgroundColor: alpha(RED, t.dark ? 0.2 : 0.1) } : s.tileIdle]}
                      >
                        <Text style={tileText(active)}>{opt.label}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}

            {/* Cuisine Tab */}
            {activeFilterTab === 'cuisine' && (
              <View style={{ marginBottom: sp(8) }}>
                <Text style={s.tabTitle}>Cuisine</Text>
                <View style={s.grid2}>
                  {availableCuisines.length === 0 && (
                    <Text style={{ width: "100%", ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500] }}>No cuisines to filter by yet.</Text>
                  )}
                  {availableCuisines.map((cuisine) => (
                    <Pressable
                      key={cuisine}
                      onPress={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                      style={[s.option, s.half, { paddingVertical: sp(3), alignItems: "center" }, selectedCuisine === cuisine ? s.tileActive : s.tileIdle]}
                    >
                      <Text style={[tileText(selectedCuisine === cuisine), { textAlign: "center" }]}>{cuisine}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Footer */}
        <View style={s.sheetFooter}>
          <Pressable onPress={() => setIsFilterOpen(false)} style={{ flex: 1, paddingVertical: sp(3), alignItems: "center" }}>
            <Text style={{ fontWeight: "600", ...fontSize.sm, color: t.dark ? colors.gray[300] : colors.gray[700] }}>Close</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsFilterOpen(false)}
            style={({ pressed }) => [
              s.showBtn,
              hasAnyFilter ? { backgroundColor: pressed ? "#991B1B" : RED } : { backgroundColor: t.dark ? colors.gray[700] : colors.gray[200] },
            ]}
          >
            <Text style={{ fontWeight: "600", ...fontSize.sm, color: hasAnyFilter ? colors.white : (t.dark ? colors.gray[400] : colors.gray[500]) }}>
              {hasAnyFilter
                ? `Show ${filteredRestaurants.length} results`
                : 'Show results'}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    </AnimatedPage>
  )
}

// Search bar reveal: { height: 0, opacity: 0 } -> auto (spring) + inner { y: -8, scale: 0.97 } -> 0 / 1
function SearchBarIn({ children }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.spring(a, { toValue: 1, stiffness: 460, damping: 30, mass: 0.72, useNativeDriver: true })
    anim.start()
    return () => anim.stop()
  }, [a])
  return (
    <Animated.View
      style={{
        marginTop: sp(3),
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
        transform: [
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  )
}

const useStyles = makeStyles((t) => {
  const dark = t.dark
  return {
    header: {
      zIndex: 100,
      width: "100%",
      backgroundColor: dark ? "#0a0a0a" : "#D91F3A",
      borderBottomLeftRadius: 32,
      borderBottomRightRadius: 32,
      borderBottomWidth: 2,
      borderBottomColor: alpha("#ffffff", 0.2),
    },
    headerInner: { paddingTop: sp(3), paddingBottom: 14, paddingHorizontal: sp(4) },
    headerEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.gray[200], textTransform: "uppercase", letterSpacing: 2 },
    headerTitle: { ...fontSize.xl, fontWeight: "700", color: colors.white },
    searchBtn: { padding: 10, borderRadius: 9999 },
    searchBtnOpen: { backgroundColor: colors.white },
    searchBtnClosed: { backgroundColor: alpha("#ffffff", 0.1), borderWidth: 1, borderColor: alpha("#ffffff", 0.2) },
    walletBtn: { height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: alpha("#ffffff", 0.1), borderWidth: 1, borderColor: colors.white },
    avatarBtn: { height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, borderWidth: 1, borderColor: colors.white, overflow: "hidden" },
    searchBar: {
      backgroundColor: dark ? "#1a1a1a" : colors.gray[50],
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: dark ? colors.gray[800] : colors.gray[200],
      padding: sp(2),
      flexDirection: "row",
      alignItems: "center",
    },
    searchInput: { height: 24, width: "100%", backgroundColor: "transparent", borderWidth: 0, fontSize: 13, fontWeight: "700", color: dark ? colors.white : colors.gray[700], padding: 0, paddingHorizontal: 0 },
    clearBtn: { height: 28, width: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: dark ? colors.gray[700] : alpha(colors.gray[200], 0.9) },
    closeSearchBtn: { height: 28, width: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: alpha(RED, 0.1) },

    bannerBox: { width: "100%", borderRadius: 22, overflow: "hidden", ...shadow.lg },
    bannerTextWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: sp(4) },
    bannerTextBox: { maxWidth: "75%", borderRadius: radius["2xl"], paddingHorizontal: sp(3), paddingVertical: sp(3) },
    bannerPromo: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 3.3, color: alpha("#ffffff", 0.85) },
    bannerTagline: { marginTop: sp(2), ...fontSize.lg, lineHeight: 22.5, fontWeight: "700", color: colors.white },
    dotsWrap: { position: "absolute", bottom: sp(4), left: 0, right: 0, alignItems: "center", zIndex: 10 },
    dots: { flexDirection: "row", alignItems: "center", gap: sp(2), borderRadius: 9999, backgroundColor: alpha("#000000", 0.25), paddingHorizontal: sp(3), paddingVertical: 6 },
    dot: { height: 8, width: 8, borderRadius: 4, backgroundColor: alpha("#ffffff", 0.55) },
    dotActive: { width: 20, backgroundColor: colors.white },
    fallbackEyebrow: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 3.7, color: "#b46f37" },
    fallbackTitle: { marginTop: sp(2), ...fontSize["2xl"], fontWeight: "900", color: "#2e1d11" },
    fallbackText: { marginTop: sp(2), ...fontSize.sm, fontWeight: "500", color: "#6d5744" },

    categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    categoryCard: { height: 114, overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: "#ece5dc", backgroundColor: "#fdfaf8" },
    categoryName: { fontFamily: "Poppins", fontSize: 12, lineHeight: 15, fontWeight: "700", letterSpacing: -0.3, color: "#2d2722", marginBottom: sp(1) },
    categoryImageBox: { flex: 1, overflow: "hidden", borderRadius: radius.xl, backgroundColor: alpha("#ffffff", 0.4) },

    titleBar: { height: 32, width: 4, backgroundColor: "#ef4f5f", borderRadius: 9999, shadowColor: "#ef4f5f", shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 3 },
    sectionTitle: { ...fontSize.xl, fontWeight: "900", color: dark ? colors.white : colors.gray[900], letterSpacing: -0.5, flexShrink: 1 },
    countPill: { paddingHorizontal: sp(3), paddingVertical: sp(1), backgroundColor: dark ? alpha(colors.red[950], 0.3) : colors.red[50], borderWidth: 1, borderColor: dark ? alpha(colors.red[900], 0.5) : colors.red[100], borderRadius: 9999, ...shadow.sm },
    countPillText: { fontSize: 10, fontWeight: "900", color: "#ef4f5f", textTransform: "uppercase", letterSpacing: 1 },
    chip: {
      height: 28,
      paddingHorizontal: sp(2),
      borderRadius: 9999,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: dark ? "#1a1a1a" : colors.white,
      borderWidth: 1,
      borderColor: dark ? colors.gray[800] : colors.gray[200],
    },
    chipActive: { backgroundColor: RED, borderColor: RED },
    chipText: { ...fontSize.xs, fontWeight: "700", color: dark ? colors.white : colors.black },

    cardShadow: { borderRadius: 22, backgroundColor: dark ? "#1a1a1a" : colors.white, ...shadow.md },
    card: { overflow: "hidden", borderWidth: 0, backgroundColor: dark ? "#1a1a1a" : colors.white, paddingVertical: 0, borderRadius: 22, gap: 0 },
    cardImage: { position: "relative", height: 176, width: "100%" },
    featured: { paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: radius.lg },
    featuredText: { ...fontSize.xs, fontWeight: "500", color: colors.white },
    bookmarkBtn: { height: 36, width: 36, backgroundColor: dark ? alpha("#1a1a1a", 0.9) : alpha("#ffffff", 0.9), borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
    cardBand: { position: "absolute", bottom: 0, left: 0, right: 0, height: "40%" },
    bandEyebrow: { ...fontSize.xs, fontWeight: "500", color: colors.white, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: sp(1) },
    bandOffer: { ...fontSize.base, fontWeight: "700", color: colors.white },
    cardContent: { padding: 10, paddingTop: 6, borderTopWidth: 0 },
    cardName: { ...fontSize.lg, fontWeight: "700", color: dark ? colors.white : colors.gray[900] },
    ratingBadge: { flexShrink: 0, paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.lg, flexDirection: "row", alignItems: "center", gap: sp(1) },
    ratingText: { ...fontSize.sm, fontWeight: "700", color: colors.white },
    metaRow: { flexDirection: "row", alignItems: "center", marginBottom: sp(2) },
    metaText: { ...fontSize.sm, color: dark ? colors.gray[400] : colors.gray[500] },
    statusBadge: { paddingHorizontal: sp(2), paddingVertical: 0, height: 20, borderWidth: 1, justifyContent: "center" },
    statusOn: { backgroundColor: colors.green[50], borderColor: colors.green[200] },
    // bg-plum-50 / text-plum-700 / border-plum-100 are not Tailwind colours (no CSS is generated on the web):
    // the outline badge keeps its default look there; we keep that default here.
    statusOff: {},
    statusText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },

    searchEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: sp(16), paddingHorizontal: sp(6) },
    searchEmptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: dark ? colors.gray[800] : colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: sp(4) },
    searchEmptyTitle: { ...fontSize.base, fontWeight: "700", color: dark ? colors.gray[200] : colors.gray[800], textAlign: "center" },
    searchEmptySub: { ...fontSize.sm, color: dark ? colors.gray[400] : colors.gray[500], marginTop: 6, maxWidth: 320, textAlign: "center" },
    noRestaurants: { borderRadius: radius["2xl"], borderWidth: 1, borderStyle: "dashed", borderColor: "#eadfce", backgroundColor: "#fffaf4", paddingHorizontal: sp(6), paddingVertical: sp(12) },
    noRestaurantsText: { ...fontSize.sm, fontWeight: "500", color: colors.gray[500], textAlign: "center" },

    sheet: { backgroundColor: dark ? "#1a1a1a" : colors.white },
    sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: dark ? colors.gray[800] : colors.gray[200] },
    sheetTitle: { ...fontSize.lg, fontWeight: "700", color: dark ? colors.white : colors.gray[900] },
    tabsCol: { width: 96, backgroundColor: dark ? "#0a0a0a" : colors.gray[50], borderRightWidth: 1, borderRightColor: dark ? colors.gray[800] : colors.gray[200] },
    tabBtn: { alignItems: "center", gap: sp(1), paddingVertical: sp(4), paddingHorizontal: sp(2) },
    tabBtnActive: { backgroundColor: dark ? "#1a1a1a" : colors.white },
    tabIndicator: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: RED, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
    tabText: { ...fontSize.xs, lineHeight: 15, fontWeight: "500", textAlign: "center" },
    tabTitle: { ...fontSize.lg, fontWeight: "600", color: dark ? colors.white : colors.gray[900], marginBottom: sp(4) },
    grid2: { flexDirection: "row", flexWrap: "wrap", gap: sp(3) },
    half: { width: "47%" },
    tile: { width: "47%", alignItems: "center", gap: sp(2), padding: sp(4), borderRadius: radius.xl, borderWidth: 1 },
    tileActive: { borderColor: RED, backgroundColor: dark ? alpha(RED, 0.2) : "#F9F9FB" },
    tileIdle: { borderColor: dark ? colors.gray[700] : colors.gray[200] },
    tileText: { ...fontSize.sm, fontWeight: "500", color: dark ? colors.gray[300] : colors.gray[700], textAlign: "center" },
    option: { paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: radius.xl, borderWidth: 1 },
    sheetFooter: { flexDirection: "row", alignItems: "center", gap: sp(4), paddingHorizontal: sp(4), paddingVertical: sp(4), borderTopWidth: 1, borderTopColor: dark ? colors.gray[800] : colors.gray[200], backgroundColor: dark ? "#1a1a1a" : colors.white },
    showBtn: { flex: 1, paddingVertical: sp(3), borderRadius: radius.xl, alignItems: "center" },
  }
})
