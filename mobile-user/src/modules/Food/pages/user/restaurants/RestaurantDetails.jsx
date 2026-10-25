// Native conversion of Frontend/src/modules/Food/pages/user/restaurants/RestaurantDetails.jsx
// Route: /food/user/restaurants/:slug  (menu, filters, category chips, dish popup with variants, sheets, share)
//
// Platform changes only (logic, API calls, texts and states are the web's):
// - the page scrolls in a SectionList (one section per menu section; window scroll on the web)
// - fixed overlays / portals -> Sheet / Dialog from @/native/ui (Android back closes them)
// - the draggable "Menu" button -> PanResponder with the same constraints
// - add-to-cart source position -> the press event's window coordinates (getBoundingClientRect on the web)
// - window.open(share link) -> Linking.openURL; image preloading -> expo-image prefetch / cache
import { useState, useEffect, useRef, Component, useMemo, useCallback } from "react"
import React from "react"
import {
  Animated,
  Easing,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native"
import { Image as ExpoImage } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Path, Text as SvgText } from "react-native-svg"
import { buildShareUrl, restaurantSharePath } from '@/shared/utils/shareLinks'
import { useParams, useNavigate, useSearchParams, useLocation as useRouterLocation } from "@/lib/router"
import { restaurantAPI, diningAPI, orderAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { toast } from "@/lib/toast"
import { useLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { filterPublicOffers } from "@food/utils/offerUtils"
import {
  ArrowLeft,
  Search,
  MoreVertical,
  MapPin,
  Clock,
  ChevronDown,
  Star,
  SlidersHorizontal,
  Utensils,
  Flame,
  Bookmark,
  Share2,
  Plus,
  Minus,
  X,
  RotateCcw,
  Zap,
  Check,
  AlertCircle,
  Copy,
  MessageCircle,
  Send,
  Mail,
  Info,
  Phone,
  Store,
} from "lucide-react-native"
import { Button } from "@food/components/ui/button"
import { Checkbox } from "@food/components/ui/checkbox"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import AddToCartAnimation from "@food/components/user/AddToCartAnimation"
import { getCompanyNameAsync } from "@food/utils/businessSettings"
import { isModuleAuthenticated } from "@food/utils/auth"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { isMongoObjectId, toRestaurantUrlSlug } from "@food/utils/mainTabRoutes"
import {
  buildCartLineId,
  getDefaultFoodVariant,
  getFoodDisplayPrice,
  getFoodPriceLabel,
  getFoodVariants,
  hasFoodVariants,
} from "@food/utils/foodVariants"
import { RestaurantDetailSkeleton } from "@food/components/ui/loading-skeletons"
import OptimizedImage from "@food/components/OptimizedImage"
import { isVegMenuItem } from "@food/utils/vegMode"
import dishFallbackImage from "@food/assets/dish_fallback.webp"
import { networkErrorMessage, NO_INTERNET_MESSAGE, SERVER_UNREACHABLE_MESSAGE } from "@/shared/utils/networkError"
import { AppImage, Dialog, Screen, Sheet, Skeleton, Text, TextInput, resolveImageSource } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"

const fssaiLogo = "/assets/images/fssai.png?v=3"

// eslint-disable-next-line no-unused-vars
const debugLog = (...args) => { }
// eslint-disable-next-line no-unused-vars
const debugWarn = (...args) => { }
// eslint-disable-next-line no-unused-vars
const debugError = (...args) => { }

const FOOD_IMAGE_FALLBACK = dishFallbackImage
const RUPEE_SYMBOL = "₹"
const RESTAURANT_DETAILS_FILTERS_STORAGE_KEY = "food-restaurant-details-filters"
const RED = "#DC2626"

// kept from the web (imported but unused there as well)
void orderAPI
void API_BASE_URL
void getFoodPriceLabel

const ScallopBadge = ({ size = 24, color = "#2563EB" }) => (
  <Svg viewBox="0 0 100 100" width={size} height={size} style={{ flexShrink: 0 }}>
    <Path
      fill={color}
      d="M 86.29 42.78 Q 95.00 50.00 86.29 57.22 Q 91.57 67.22 80.76 70.56 Q 81.82 81.82 70.56 80.76 Q 67.22 91.57 57.22 86.29 Q 50.00 95.00 42.78 86.29 Q 32.78 91.57 29.44 80.76 Q 18.18 81.82 19.24 70.56 Q 8.43 67.22 13.71 57.22 Q 5.00 50.00 13.71 42.78 Q 8.43 32.78 19.24 29.44 Q 18.18 18.18 29.44 19.24 Q 32.78 8.43 42.78 13.71 Q 50.00 5.00 57.22 13.71 Q 67.22 8.43 70.56 19.24 Q 81.82 18.18 80.76 29.44 Q 91.57 32.78 86.29 42.78 Z"
    />
    <SvgText x="50" y="63" textAnchor="middle" fontSize="42" fontWeight="900" fill="white">
      %
    </SvgText>
  </Svg>
)

const AnimatedText = Animated.createAnimatedComponent(Text)

// AnimatePresence mode="wait" text swap: fade out 0.2s, swap, fade in 0.2s
function FadeSwapText({ text, style }) {
  const [shown, setShown] = useState(text)
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (text === shown) return undefined
    const out = Animated.timing(opacity, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    out.start(({ finished }) => {
      if (!finished) return
      setShown(text)
      Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start()
    })
    return () => out.stop()
  }, [text, shown, opacity])
  return (
    <AnimatedText numberOfLines={1} style={[style, { opacity }]}>
      {shown}
    </AnimatedText>
  )
}

// Recommended-section dish highlight: red wash fading in, a light sweep crossing once, red glow outline.
function DishHighlight({ dark }) {
  const fade = useRef(new Animated.Value(0)).current
  const sweep = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  const { width } = useWindowDimensions()
  useEffect(() => {
    const a = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.1, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]),
    ])
    a.start()
    return () => a.stop()
  }, [fade, sweep, pulse])
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius["2xl"], overflow: "hidden", backgroundColor: alpha("#ef4444", dark ? 0.1 : 0.05), opacity: fade },
        ]}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-0.4 * width, width] }) }] },
          ]}
        >
          <LinearGradient
            colors={["transparent", alpha("#ef4444", 0.4), "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -1.5,
          left: -1.5,
          right: -1.5,
          bottom: -1.5,
          borderRadius: radius["2xl"],
          borderWidth: 2,
          borderColor: alpha(colors.red[600], 0.8),
          opacity: fade,
          shadowColor: "#dc2626",
          shadowOpacity: 0.3,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius["2xl"], backgroundColor: alpha(RED, 0.1), opacity: pulse.interpolate({ inputRange: [0, 0.1], outputRange: [0, 1] }) }]}
      />
    </>
  )
}

// initial { opacity: 0, scale: 0.8|0.9 } -> { opacity: 1, scale: 1 }
function PopIn({ from = 0.8, spring = false, style, children }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = spring
      ? Animated.spring(a, { toValue: 1, damping: 20, stiffness: 300, mass: 1, useNativeDriver: true })
      : Animated.timing(a, { toValue: 1, duration: 300, useNativeDriver: true })
    anim.start()
    return () => anim.stop()
  }, [a, spring])
  return (
    <Animated.View style={[style, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }] }]}>
      {children}
    </Animated.View>
  )
}

// The web's draggable floating "Menu" button (framer-motion drag with constraints, no momentum).
function DraggableMenuButton({ windowSize, buttonWidth, buttonHeight, bottom, onLayoutSize, children }) {
  const startX = (windowSize.width - buttonWidth) / 2
  const pos = useRef(new Animated.ValueXY({ x: startX, y: 0 })).current
  const current = useRef({ x: startX, y: 0 })
  const placed = useRef(false)
  const scale = useRef(new Animated.Value(1)).current
  const limits = useRef({})
  limits.current = {
    left: 0,
    right: windowSize.width - buttonWidth,
    top: -(windowSize.height - buttonHeight - bottom),
    bottom,
  }

  useEffect(() => {
    // initial x centres the button once its real width is known
    if (placed.current) return
    const x = (windowSize.width - buttonWidth) / 2
    current.current = { x, y: 0 }
    pos.setValue(current.current)
  }, [windowSize.width, buttonWidth, pos])

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          placed.current = true
          Animated.timing(scale, { toValue: 1.02, duration: 120, useNativeDriver: false }).start()
        },
        onPanResponderMove: (_, g) => {
          const l = limits.current
          pos.setValue({
            x: clamp(current.current.x + g.dx, l.left, l.right),
            y: clamp(current.current.y + g.dy, l.top, l.bottom),
          })
        },
        onPanResponderRelease: (_, g) => {
          const l = limits.current
          current.current = {
            x: clamp(current.current.x + g.dx, l.left, l.right),
            y: clamp(current.current.y + g.dy, l.top, l.bottom),
          }
          pos.setValue(current.current)
          Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: false }).start()
        },
        onPanResponderTerminate: () => {
          Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: false }).start()
        },
      }),
    [pos, scale],
  )

  return (
    <Animated.View
      {...responder.panHandlers}
      onLayout={(e) => onLayoutSize?.(e.nativeEvent.layout)}
      style={{
        position: "absolute",
        left: 0,
        bottom,
        zIndex: 9998,
        elevation: 20,
        transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }],
      }}
    >
      {children}
    </Animated.View>
  )
}

function RestaurantDetailsContent() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const routerLocation = useRouterLocation()
  const goBack = useAppBackNavigation()
  const [searchParams, setSearchParams] = useSearchParams()
  const showOnlyUnder250 = searchParams.get('under250') === 'true'
  const targetDishId = useMemo(() => String(searchParams.get('dish') || '').trim(), [searchParams])
  const { addToCart, updateQuantity, removeFromCart, getCartItem, cart, itemCount } = useCart()
  const { vegMode, addDishFavorite, removeDishFavorite, isDishFavorite, getDishFavorites, getFavorites, addFavorite, removeFavorite, isFavorite, orderType, getDefaultAddress } = useProfile()
  const seededRestaurant = routerLocation.state?.restaurantData || null
  const seededMongoId = useMemo(() => {
    const candidates = [
      seededRestaurant?.mongoId,
      seededRestaurant?._id,
      seededRestaurant?.restaurantId,
      seededRestaurant?.id,
    ]
    for (const c of candidates) {
      const v = String(c || "").trim()
      if (isMongoObjectId(v)) return v
    }
    return ""
  }, [seededRestaurant])

  // Veg mode ON: never keep a Non-veg chip selected
  useEffect(() => {
    if (!vegMode) return
    setFilters((prev) =>
      prev.vegNonVeg === "non-veg" ? { ...prev, vegNonVeg: null } : prev,
    )
  }, [vegMode])
  const { location: userLocation } = useLocation() // Get user's current location
  // Same point the Home cards use (the location chosen in the header); saved address only as fallback.
  const distanceOrigin = useMemo(() => {
    if (
      Number.isFinite(Number(userLocation?.latitude)) &&
      Number.isFinite(Number(userLocation?.longitude))
    ) {
      return {
        latitude: Number(userLocation.latitude),
        longitude: Number(userLocation.longitude),
      }
    }
    const saved = getDefaultAddress?.() || null
    const coords = saved?.location?.coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0])
      const lat = Number(coords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng }
      }
    }
    const lat = Number(saved?.latitude ?? saved?.lat)
    const lng = Number(saved?.longitude ?? saved?.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng }
    }
    if (
      Number.isFinite(Number(userLocation?.latitude)) &&
      Number.isFinite(Number(userLocation?.longitude))
    ) {
      return {
        latitude: Number(userLocation.latitude),
        longitude: Number(userLocation.longitude),
      }
    }
    return null
  }, [getDefaultAddress, userLocation?.latitude, userLocation?.longitude])
  const { zoneId, zone, loading: loadingZone, isOutOfService } = useZone(userLocation) // Get user's zone for zone-based filtering
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [quantities, setQuantities] = useState({})
  const [showManageCollections, setShowManageCollections] = useState(false)
  const [menuButtonWidth, setMenuButtonWidth] = useState(120)
  const [menuButtonHeight, setMenuButtonHeight] = useState(48)
  // window resize listener -> useWindowDimensions
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const windowSize = { width: windowWidth, height: windowHeight }
  // the page's scroll container (window on the web)
  const listRef = useRef(null)
  const [showItemDetail, setShowItemDetail] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedVariantId, setSelectedVariantId] = useState("")
  // Quantity picked in the dish popup; only written to the cart on "Add item".
  const [itemDetailQty, setItemDetailQty] = useState(1)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showLocationSheet, setShowLocationSheet] = useState(false)
  const [showScheduleSheet, setShowScheduleSheet] = useState(false)

  const [allOffers, setAllOffers] = useState([])
  const [loadingOffers, setLoadingOffers] = useState(true)
  const [showOffersSheet, setShowOffersSheet] = useState(false)
  const [currentCouponIndex, setCurrentCouponIndex] = useState(0)

  const formatCouponStripText = (coupon) => {
    if (!coupon) return ""
    const minOrderValue = Number(coupon.minOrderValue)
    const minOrderText = Number.isFinite(minOrderValue) && minOrderValue > 0 ? ` above ₹${minOrderValue}` : ""
    if (coupon.discountType === "percentage") {
      const discountPercentage = coupon.discountPercentage ?? coupon.discountValue ?? 0
      const limitText = coupon.maxDiscount ? ` up to ₹${coupon.maxDiscount}` : ""
      return `${discountPercentage}% OFF${minOrderText}${limitText}`
    }
    const value = coupon.originalPrice || coupon.discountValue || 0
    return `Flat ₹${value} OFF${minOrderText}`
  }

  const formatCouponTitle = (coupon) => {
    return formatCouponStripText(coupon)
  }

  const handleCopyCoupon = (code) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code)
        .then(() => {
          toast.success(`Coupon code ${code} copied!`)
        })
        .catch((err) => {
          debugError("Failed to copy coupon code:", err)
          toast.error("Failed to copy code.")
        })
    } else {
      toast.success(`Coupon code ${code} copied!`)
    }
  }

  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null)
  const [expandedCoupons, setExpandedCoupons] = useState(new Set())
  const [showMenuSheet, setShowMenuSheet] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [availabilityTick, setAvailabilityTick] = useState(Date.now())
  const [showMenuOptionsSheet, setShowMenuOptionsSheet] = useState(false)
  const showMoreInfo = searchParams.get('info') === 'true'
  const setShowMoreInfo = (val) => {
    if (val) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('info', 'true')
        return next
      }, { replace: true })
    } else {
      // Never navigate(-1) here — that pops restaurant→category and feels like stuck back.
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('info')
        return next
      }, { replace: true })
    }
  }
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePayload, setSharePayload] = useState(null)
  const [expandedAddButtons, setExpandedAddButtons] = useState(new Set())
  const [expandedSections, setExpandedSections] = useState(new Set([0])) // Default: Recommended section is expanded
  const [highlightedDishId, setHighlightedDishId] = useState(null)
  const [loadingMenuItems, setLoadingMenuItems] = useState(true)
  const [selectedMenuCategory, setSelectedMenuCategory] = useState("all")
  const dishCardRefs = useRef({})
  const hasScrolledRef = useRef(false)

  // First 5 dishes render at once; the rest after the first scroll (list onScroll) or 1.5s.
  const [loadRemaining, setLoadRemaining] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadRemaining(true)
    }, 1500)

    return () => {
      clearTimeout(timer)
    }
  }, [])


  const getLineItemIdForDish = (item, variant = null) =>
    buildCartLineId(item?.id || item?._id || "", variant?.id || variant?._id || "")

  const getVariantForDish = (item, preferredVariantId = "") => {
    const variants = getFoodVariants(item)
    if (variants.length === 0) return null
    return variants.find((variant) => String(variant.id) === String(preferredVariantId || "")) || variants[0]
  }

  const getDishQuantity = (item, preferredVariantId = "") => {
    if (preferredVariantId) {
      const variant = getVariantForDish(item, preferredVariantId)
      const lineItemId = getLineItemIdForDish(item, variant)
      return quantities[lineItemId] || 0
    }
    if (hasFoodVariants(item)) {
      const variants = getFoodVariants(item)
      return variants.reduce((sum, v) => {
        const lineItemId = getLineItemIdForDish(item, v)
        return sum + (quantities[lineItemId] || 0)
      }, 0)
    }
    const lineItemId = getLineItemIdForDish(item, null)
    return quantities[lineItemId] || 0
  }

  // For a variant dish, returns the single variant currently in the cart (if
  // exactly one is present) so the +/- stepper can adjust it directly like a
  // normal item. Returns null when 0 or 2+ variants are in the cart, in which
  // case the +/- opens the variant picker instead (avoids ambiguous updates).
  const getSoleActiveVariant = (item) => {
    if (!hasFoodVariants(item)) return null
    const variants = getFoodVariants(item)
    const active = variants.filter(
      (v) => (quantities[getLineItemIdForDish(item, v)] || 0) > 0
    )
    return active.length === 1 ? active[0] : null
  }

  // Initialize filters from localStorage if available
  const [filters, setFilters] = useState(() => {
    if (typeof window === "undefined" || !slug) {
      return {
        sortBy: null,
        vegNonVeg: null,
        highlyReordered: false,
        spicy: false,
      }
    }
    try {
      const raw = window.localStorage.getItem(RESTAURANT_DETAILS_FILTERS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const savedFilters = parsed?.[slug]
        if (savedFilters && typeof savedFilters === "object") {
          return {
            sortBy:
              savedFilters.sortBy === "low-to-high" || savedFilters.sortBy === "high-to-low"
                ? savedFilters.sortBy
                : null,
            vegNonVeg:
              savedFilters.vegNonVeg === "veg" || savedFilters.vegNonVeg === "non-veg"
                ? savedFilters.vegNonVeg
                : null,
            highlyReordered: savedFilters.highlyReordered === true,
            spicy: savedFilters.spicy === true,
          }
        }
      }
    } catch (error) {
      debugWarn("Failed to initialize restaurant filters from localStorage:", error)
    }
    return {
      sortBy: null,
      vegNonVeg: null,
      highlyReordered: false,
      spicy: false,
    }
  })

  // Restaurant data state
  const [restaurant, setRestaurant] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [restaurantError, setRestaurantError] = useState(null)
  const fetchedRestaurantRef = useRef(false) // Track if restaurant has been fetched for current slug
  const fetchedSlugRef = useRef(null)

  const coupons = useMemo(() => {
    if (!allOffers || allOffers.length === 0) return []

    const rId = restaurant?.id || restaurant?.restaurantId || restaurant?.mongoId || restaurant?._id

    return filterPublicOffers(allOffers, {
      restaurantId: rId,
      restaurantSlug: slug,
      restaurant,
      orderType,
      requireShowInCart: true,
    }).map((o) => {
      const isPct = o.discountType === "percentage"
      return {
        couponCode: o.couponCode,
        discountType: o.discountType,
        discountPercentage: isPct ? Number(o.discountValue) || 0 : 0,
        originalPrice: isPct ? 0 : Number(o.discountValue || 0),
        discountedPrice: 0,
        minOrderValue: Number(o.minOrderValue) > 0 ? Number(o.minOrderValue) : null,
        minOrder: Number(o.minOrderValue) > 0 ? Number(o.minOrderValue) : 0,
        maxDiscount: o.maxDiscount != null ? Number(o.maxDiscount) : null,
        customerGroup: o.customerScope || "all",
        isGlobalCoupon: true,
        endDate: o.endDate || null,
        showInCart: o.showInCart !== false,
        couponType: o.couponType || "all",
      }
    })
  }, [allOffers, restaurant, orderType, slug])

  // Fetch active public offers from API (runs on mount/slug change)
  useEffect(() => {
    if (!slug) return

    const fetchOffers = async () => {
      setLoadingOffers(true)
      try {
        const res = await restaurantAPI.getPublicOffers(
          restaurant?.partnerType === "store" ? { partnerType: "store" } : {},
        )
        const list = res?.data?.data?.allOffers || res?.data?.allOffers || []
        setAllOffers(list)
      } catch (err) {
        debugError("Failed to fetch public offers:", err)
      } finally {
        setLoadingOffers(false)
      }
    }

    fetchOffers()
  }, [slug, restaurant?.partnerType])

  const couponsKey = (coupons || []).map((c) => c.couponCode || "").join(",")

  // Reset coupon carousel index when coupons change (only if codes or length change)
  useEffect(() => {
    setCurrentCouponIndex(0)
  }, [couponsKey])

  // Automatically cycle through coupons (carousel)
  useEffect(() => {
    if (coupons.length <= 1) return
    const timer = setInterval(() => {
      setCurrentCouponIndex((prev) => (prev + 1) % coupons.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [couponsKey, coupons.length])

  // (Body scroll lock while a sheet is open: native sheets are modals, the page behind cannot scroll.)

  useEffect(() => {
    const intervalId = setInterval(() => {
      setAvailabilityTick(Date.now())
    }, 60000)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    // Reset state when entering a new restaurant page to prevent flash of old content
    fetchedRestaurantRef.current = false
    fetchedSlugRef.current = null
    setCurrentCouponIndex(0)
    setSelectedMenuCategory("all")
    setRestaurantError(null)

    // Instant header from navigation state (name/image) while full API loads
    if (seededRestaurant) {
      const seedName =
        seededRestaurant.name ||
        seededRestaurant.restaurantName ||
        "Restaurant"
      const seedId =
        seededMongoId ||
        seededRestaurant.mongoId ||
        seededRestaurant._id ||
        seededRestaurant.restaurantId ||
        null
      setRestaurant({
        id: seedId,
        mongoId: seededMongoId || seedId,
        name: seedName,
        cuisine: seededRestaurant.cuisine || seededRestaurant.topCategory || "",
        rating: seededRestaurant.rating || 0,
        reviews: seededRestaurant.reviews || seededRestaurant.totalRatings || 0,
        deliveryTime: seededRestaurant.deliveryTime || "25-30 mins",
        // Don't seed distance from home card — wait for cart-matched driving API.
        distance: "",
        distanceInKm: null,
        distanceMode: null,
        distanceOriginKey: null,
        location: seededRestaurant.location || "",
        image: seededRestaurant.image || seededRestaurant.profileImage || null,
        coverImages: seededRestaurant.coverImages || [],
        menuImages: seededRestaurant.menuImages || [],
        menuSections: [],
        slug,
        restaurantId: seedId,
        outletTimings: seededRestaurant.outletTimings || null,
        deliveryTimings: seededRestaurant.deliveryTimings || null,
        isActive: seededRestaurant.isActive !== false,
        isAcceptingOrders: seededRestaurant.isAcceptingOrders !== false,
      })
      setLoadingRestaurant(false)
      setLoadingMenuItems(true)
    } else {
      setRestaurant(null)
      setLoadingRestaurant(true)
      setLoadingMenuItems(true)
    }
    setAllOffers([])
    setLoadingOffers(true)
  }, [slug, seededRestaurant, seededMongoId])

  // Fetch restaurant data from API
  useEffect(() => {
    const fetchRestaurant = async () => {
      if (!slug) return

      // Prevent re-fetching for the same slug+origin once driving distance is resolved.
      // If delivery-address origin changes, refetch so distance matches cart.
      const originKey =
        Number.isFinite(Number(distanceOrigin?.latitude)) &&
        Number.isFinite(Number(distanceOrigin?.longitude))
          ? `${Number(distanceOrigin.latitude)},${Number(distanceOrigin.longitude)}`
          : ""
      const hasDrivingDistance =
        restaurant?.distanceMode === "driving" ||
        (Number.isFinite(Number(restaurant?.distanceInKm)) && Number(restaurant.distanceInKm) > 0)
      const sameOrigin = Boolean(originKey) && restaurant?.distanceOriginKey === originKey
      if (
        fetchedRestaurantRef.current &&
        fetchedSlugRef.current === slug &&
        restaurant &&
        sameOrigin &&
        hasDrivingDistance
      ) {
        return
      }
      if (
        fetchedRestaurantRef.current &&
        fetchedSlugRef.current === slug &&
        restaurant &&
        !originKey
      ) {
        return
      }

      try {
        // Keep the existing page visible on background retries.
        setLoadingRestaurant(!fetchedRestaurantRef.current && !restaurant)
        setRestaurantError(null)

        debugLog('Fetching restaurant with slug:', slug)
        let response = null
        let apiRestaurant = null

        // Try dining API only for slug deep-links (skip when we already have ObjectId from nav state)
        if (!seededMongoId && !isMongoObjectId(slug)) {
          try {
            // same lat/lng as the restaurant API below, otherwise this answer has no distance for the header
            const slugLocationParams =
              Number.isFinite(Number(distanceOrigin?.latitude)) && Number.isFinite(Number(distanceOrigin?.longitude))
                ? { lat: Number(distanceOrigin.latitude), lng: Number(distanceOrigin.longitude) }
                : {}
            response = await diningAPI.getRestaurantBySlug(slug, { params: slugLocationParams })
            if (response?.data?.success && response?.data?.data) {
              apiRestaurant = response.data.data
              debugLog('? Found restaurant in dining API:', apiRestaurant)
            } else {
              debugLog('? Dining API returned no restaurant, falling back to restaurant API...')
            }
          } catch (diningError) {
            if (diningError?.response?.status === 404) {
              debugLog('? Restaurant not found in dining API, trying restaurant API...')
            } else {
              debugWarn('? Dining API failed, trying restaurant API...', diningError?.message)
            }
          }
        }

        // Restaurant API: ObjectId first (root cause fix). Slug is only fallback for deep links.
        if (!apiRestaurant) {
          try {
            const lookupKeys = []
            if (seededMongoId) lookupKeys.push(seededMongoId)
            if (isMongoObjectId(slug)) lookupKeys.push(slug)
            // Only hit slug endpoint when we have no ObjectId (avoids noisy 404s like naviscafe)
            if (!seededMongoId && !isMongoObjectId(slug) && slug) lookupKeys.push(slug)

            for (const key of lookupKeys) {
              try {
                const locationParams = {}
                if (
                  Number.isFinite(Number(distanceOrigin?.latitude)) &&
                  Number.isFinite(Number(distanceOrigin?.longitude))
                ) {
                  locationParams.lat = Number(distanceOrigin.latitude)
                  locationParams.lng = Number(distanceOrigin.longitude)
                }
                response = await restaurantAPI.getRestaurantById(key, {
                  params: locationParams,
                })
                if (response?.data?.success && response?.data?.data) {
                  apiRestaurant = response.data.data
                  debugLog('? Found restaurant in restaurant API by key:', key)
                  break
                }
              } catch (directLookupError) {
                debugLog('? Lookup failed for key:', key)
              }
            }

            if (!apiRestaurant) {
              // Deep-link fallback: resolve pretty slug via list, then fetch by ObjectId
              debugLog('? Direct lookup failed, trying search by name...')

              const searchVariants = zoneId
                ? [{ limit: 100, zoneId: zoneId, _ts: Date.now() }, { limit: 100, _ts: Date.now() }]
                : [{ limit: 100, _ts: Date.now() }]

              const slugCompact = String(slug || "").toLowerCase().replace(/[^a-z0-9]/g, "")
              const slugHyphen = String(slug || "").toLowerCase()

              for (const searchParams of searchVariants) {
                try {
                  const searchResponse = await restaurantAPI.getRestaurants(searchParams, { noCache: true })
                  const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []

                  const matchingRestaurant = restaurants.find(r => {
                    const name = String(r.restaurantName || r.name || "").toLowerCase()
                    const nameSlug = toRestaurantUrlSlug(name)
                    const nameCompact = name.replace(/[^a-z0-9]/g, "")
                    const rSlug = toRestaurantUrlSlug(r.slug || "")
                    return (
                      rSlug === slugHyphen ||
                      nameSlug === slugHyphen ||
                      nameCompact === slugCompact ||
                      String(r._id) === seededMongoId ||
                      String(r.restaurantId) === seededMongoId
                    )
                  })

                  if (matchingRestaurant) {
                    const locationParams = {}
                    if (
                      Number.isFinite(Number(distanceOrigin?.latitude)) &&
                      Number.isFinite(Number(distanceOrigin?.longitude))
                    ) {
                      locationParams.lat = Number(distanceOrigin.latitude)
                      locationParams.lng = Number(distanceOrigin.longitude)
                    }
                    const fullResponse = await restaurantAPI.getRestaurantById(
                      matchingRestaurant._id || matchingRestaurant.restaurantId,
                      { params: locationParams },
                    )
                    if (fullResponse.data && fullResponse.data.success && fullResponse.data.data) {
                      apiRestaurant = fullResponse.data.data
                      debugLog('? Found restaurant in restaurant API by name search:', apiRestaurant)
                      break
                    }
                  }
                } catch (searchError) {
                  debugWarn('? Search fallback failed for params:', searchParams, searchError?.message)
                }
              }
            }
          } catch (restaurantError) {
            debugError('? Restaurant not found in restaurant API either:', restaurantError)
          }
        }

        if (apiRestaurant) {
          debugLog('? Fetched restaurant from API:', apiRestaurant)
          debugLog('? Restaurant data keys:', Object.keys(apiRestaurant))
          debugLog('? Restaurant name field:', apiRestaurant?.name)
          debugLog('? Restaurant restaurantId:', apiRestaurant?.restaurantId)
          debugLog('? Restaurant _id:', apiRestaurant?._id)
          debugLog('? Restaurant.restaurant:', apiRestaurant?.restaurant)

          // Check if this is a dining restaurant with nested restaurant data
          const actualRestaurant = apiRestaurant?.restaurant || apiRestaurant

          // Helper function to format address with zone and pin code
          const formatRestaurantAddress = (locationObj) => {
            if (!locationObj) return "Location"

            // If location is a string, return it as is
            if (typeof locationObj === 'string') {
              return locationObj
            }

            // PRIORITY 1: Use formattedAddress if it's complete and has pin code
            // formattedAddress usually has the most complete information from Google Maps
            if (locationObj.formattedAddress && locationObj.formattedAddress.trim() !== "" && locationObj.formattedAddress !== "Select location") {
              const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(locationObj.formattedAddress.trim())
              if (!isCoordinates) {
                const formattedAddr = locationObj.formattedAddress.trim()
                // Check if it contains a pin code (6 digit number)
                const hasPinCode = /\b\d{6}\b/.test(formattedAddr)
                // If it has pin code, it's complete - use it directly
                if (hasPinCode) {
                  // Clean up the address - remove Google Plus Code if present (e.g., "PV6X+JXX, ")
                  const cleanedAddr = formattedAddr.replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                  return cleanedAddr
                }
                // If it has multiple parts (3+), it's likely complete
                if (formattedAddr.split(',').length >= 3) {
                  const cleanedAddr = formattedAddr.replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                  return cleanedAddr
                }
              }
            }

            // PRIORITY 2: Build address from location object components (with zone and pin code)
            // This ensures we always show zone and pin code if available
            const addressParts = []

            // Add addressLine1 if available
            if (locationObj.addressLine1 && locationObj.addressLine1.trim() !== "") {
              addressParts.push(locationObj.addressLine1.trim())
            }

            // Add addressLine2 if available
            if (locationObj.addressLine2 && locationObj.addressLine2.trim() !== "") {
              addressParts.push(locationObj.addressLine2.trim())
            }

            // Add area (zone) if available
            if (locationObj.area && locationObj.area.trim() !== "") {
              addressParts.push(locationObj.area.trim())
            }

            // Add city if available
            if (locationObj.city && locationObj.city.trim() !== "") {
              addressParts.push(locationObj.city.trim())
            }

            // Add state if available
            if (locationObj.state && locationObj.state.trim() !== "") {
              addressParts.push(locationObj.state.trim())
            }

            // Add pin code (priority: pincode > zipCode > postalCode)
            const pinCode = locationObj.pincode || locationObj.zipCode || locationObj.postalCode
            if (pinCode && pinCode.toString().trim() !== "") {
              addressParts.push(pinCode.toString().trim())
            }

            // If we have at least 3 parts (complete address), use it
            if (addressParts.length >= 3) {
              return addressParts.join(', ')
            }

            // If we have at least 2 parts, use it
            if (addressParts.length >= 2) {
              return addressParts.join(', ')
            }

            // PRIORITY 3: Fallback to formattedAddress (even if incomplete)
            if (locationObj.formattedAddress && locationObj.formattedAddress.trim() !== "" && locationObj.formattedAddress !== "Select location") {
              const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(locationObj.formattedAddress.trim())
              if (!isCoordinates) {
                const cleanedAddr = locationObj.formattedAddress.trim().replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                return cleanedAddr
              }
            }

            // PRIORITY 4: Fallback to address field
            if (locationObj.address && locationObj.address.trim() !== "") {
              return locationObj.address.trim()
            }

            // PRIORITY 5: Last fallback - use area or city
            return locationObj.area || locationObj.city || "Location"
          }

          // Get location object for address formatting
          const locationObj = actualRestaurant?.location || apiRestaurant?.location
          debugLog('? Location Object for formatting:', locationObj)
          debugLog('? formattedAddress field:', locationObj?.formattedAddress)
          const formattedAddress = formatRestaurantAddress(locationObj)
          debugLog('? Final Formatted Address:', formattedAddress)

          // Calculate distance from user to restaurant using SAME backend
          // driving-distance API as cart / home list (not air/haversine).
          const restaurantLat = locationObj?.latitude || (locationObj?.coordinates && Array.isArray(locationObj.coordinates) ? locationObj.coordinates[1] : null)
          const restaurantLng = locationObj?.longitude || (locationObj?.coordinates && Array.isArray(locationObj.coordinates) ? locationObj.coordinates[0] : null)

          debugLog('? Restaurant coordinates:', { restaurantLat, restaurantLng, locationObj })

          const userLat = distanceOrigin?.latitude
          const userLng = distanceOrigin?.longitude

          debugLog('? User location (cart-matched):', { userLat, userLng, distanceOrigin })

          const apiDistance =
            actualRestaurant?.distance ||
            apiRestaurant?.distance ||
            actualRestaurant?.distanceFromUser ||
            apiRestaurant?.distanceFromUser ||
            null
          const apiDistanceInKm = Number(
            actualRestaurant?.distanceInKm ?? apiRestaurant?.distanceInKm,
          )
          const calculatedDistance =
            (actualRestaurant?.distanceMode === 'driving' || apiRestaurant?.distanceMode === 'driving') &&
            apiDistance
              ? apiDistance
              : Number.isFinite(apiDistanceInKm) && apiDistanceInKm > 0
                ? (apiDistanceInKm >= 1
                    ? `${apiDistanceInKm.toFixed(1)} km`
                    : `${Math.round(apiDistanceInKm * 1000)} m`)
                : apiDistance || null

          if (!calculatedDistance) {
            debugWarn('? Driving distance missing from API — pass lat/lng on restaurant fetch', {
              hasUserLocation: !!(userLat && userLng),
              hasRestaurantLocation: !!(restaurantLat && restaurantLng),
              distanceMode: actualRestaurant?.distanceMode || apiRestaurant?.distanceMode,
            })
          } else {
            debugLog('? Using backend driving distance:', calculatedDistance)
          }

          // Resolve display category/cuisine with broad API compatibility
          const categoryFromArray = (list) => {
            if (!Array.isArray(list) || list.length === 0) return null
            const firstEntry = list[0]
            if (typeof firstEntry === "string") return firstEntry
            if (firstEntry && typeof firstEntry === "object") {
              return firstEntry.name || firstEntry.label || firstEntry.title || null
            }
            return null
          }

          const resolvedTopCategory =
            actualRestaurant?.topCategory ||
            apiRestaurant?.topCategory ||
            categoryFromArray(actualRestaurant?.topCategories) ||
            categoryFromArray(apiRestaurant?.topCategories) ||
            categoryFromArray(actualRestaurant?.cuisines) ||
            categoryFromArray(apiRestaurant?.cuisines) ||
            categoryFromArray(actualRestaurant?.categories) ||
            categoryFromArray(apiRestaurant?.categories) ||
            actualRestaurant?.cuisine ||
            apiRestaurant?.cuisine ||
            actualRestaurant?.category ||
            apiRestaurant?.category ||
            "Multi-cuisine"

          const onboardingStep2 = actualRestaurant?.onboarding?.step2 || apiRestaurant?.onboarding?.step2 || {}
          const onboardingStep4 = actualRestaurant?.onboarding?.step4 || apiRestaurant?.onboarding?.step4 || {}
          const normalizedProfileImage = actualRestaurant?.profileImage || apiRestaurant?.profileImage || onboardingStep2?.profileImageUrl || null
          const normalizedCoverImages =
            Array.isArray(actualRestaurant?.coverImages) && actualRestaurant.coverImages.length > 0
              ? actualRestaurant.coverImages
              : Array.isArray(apiRestaurant?.coverImages) && apiRestaurant.coverImages.length > 0
                ? apiRestaurant.coverImages
                : []
          const normalizedMenuImages =
            Array.isArray(actualRestaurant?.menuImages) && actualRestaurant.menuImages.length > 0
              ? actualRestaurant.menuImages
              : Array.isArray(apiRestaurant?.menuImages) && apiRestaurant.menuImages.length > 0
                ? apiRestaurant.menuImages
                : Array.isArray(onboardingStep2?.menuImageUrls)
                  ? onboardingStep2.menuImageUrls
                  : []
          const normalizedRestaurantOffers = actualRestaurant?.restaurantOffers || apiRestaurant?.restaurantOffers || {}

          // Transform API data to match expected format with comprehensive fallbacks
          // Handle both dining restaurant and regular restaurant data structures
          const transformedRestaurant = {
            id: actualRestaurant?.restaurantId || actualRestaurant?._id || actualRestaurant?.id || apiRestaurant?.restaurantId || apiRestaurant?._id || null,
            mongoId: actualRestaurant?._id || apiRestaurant?._id || null,
            name:
              actualRestaurant?.name ||
              actualRestaurant?.restaurantName ||
              apiRestaurant?.name ||
              apiRestaurant?.restaurantName ||
              "Unknown Restaurant",
            cuisine: resolvedTopCategory,
            topCategory: resolvedTopCategory,
            rating: actualRestaurant?.rating || apiRestaurant?.rating || actualRestaurant?.averageRating || apiRestaurant?.averageRating || 0,
            reviews: actualRestaurant?.totalRatings || apiRestaurant?.totalRatings || actualRestaurant?.reviewCount || apiRestaurant?.reviewCount || actualRestaurant?.reviews?.length || apiRestaurant?.reviews?.length || 0,
            deliveryTime: actualRestaurant?.estimatedDeliveryTime || apiRestaurant?.estimatedDeliveryTime || actualRestaurant?.deliveryTime || apiRestaurant?.deliveryTime || actualRestaurant?.avgDeliveryTime || apiRestaurant?.avgDeliveryTime || "25-30 mins",
            distance: calculatedDistance || actualRestaurant?.distance || apiRestaurant?.distance || actualRestaurant?.distanceFromUser || apiRestaurant?.distanceFromUser || "",
            distanceInKm: Number.isFinite(apiDistanceInKm) ? apiDistanceInKm : (actualRestaurant?.distanceInKm ?? apiRestaurant?.distanceInKm ?? null),
            distanceMode: actualRestaurant?.distanceMode || apiRestaurant?.distanceMode || null,
            distanceOriginKey:
              Number.isFinite(Number(distanceOrigin?.latitude)) &&
              Number.isFinite(Number(distanceOrigin?.longitude))
                ? `${Number(distanceOrigin.latitude)},${Number(distanceOrigin.longitude)}`
                : null,
            location: formattedAddress,
            locationObject: locationObj, // Store full location object for reference
            image: normalizedCoverImages?.[0]?.url
              || normalizedCoverImages?.[0]
              || normalizedProfileImage?.url
              || normalizedProfileImage
              || (normalizedMenuImages.length > 0
                ? (normalizedMenuImages[0]?.url || normalizedMenuImages[0])
                : null)
              || actualRestaurant?.image
              || apiRestaurant?.image
              || null,
            priceRange: actualRestaurant?.priceRange || apiRestaurant?.priceRange || onboardingStep4?.priceRange || "$$",
            offers: Array.isArray(actualRestaurant?.offers) ? actualRestaurant.offers : (Array.isArray(apiRestaurant?.offers) ? apiRestaurant.offers : []), // Will be populated from menu/offers API later
            offerText: actualRestaurant?.offer || apiRestaurant?.offer || onboardingStep4?.offer || "FLAT 50% OFF",
            offerCount: actualRestaurant?.offerCount || apiRestaurant?.offerCount || 0,
            restaurantOffers: {
              goldOffer: {
                title: normalizedRestaurantOffers?.goldOffer?.title || "Gold exclusive offer",
                description: apiRestaurant?.restaurantOffers?.goldOffer?.description || "Free delivery above ₹99",
                unlockText: normalizedRestaurantOffers?.goldOffer?.unlockText || "join Gold to unlock",
                buttonText: apiRestaurant?.restaurantOffers?.goldOffer?.buttonText || "Add Gold - ₹1",
              },
              coupons: Array.isArray(normalizedRestaurantOffers?.coupons)
                ? normalizedRestaurantOffers.coupons
                : [],
            },
            outlets: Array.isArray(actualRestaurant?.outlets) ? actualRestaurant.outlets : (Array.isArray(apiRestaurant?.outlets) ? apiRestaurant.outlets : []),
            categories: Array.isArray(actualRestaurant?.categories) ? actualRestaurant.categories : (Array.isArray(apiRestaurant?.categories) ? apiRestaurant.categories : []),
            menu: Array.isArray(actualRestaurant?.menu) ? actualRestaurant.menu : (Array.isArray(apiRestaurant?.menu) ? apiRestaurant.menu : []),
            slug: actualRestaurant?.slug?.replace(/[\s\/]+/g, '-') || apiRestaurant?.slug?.replace(/[\s\/]+/g, '-') || actualRestaurant?.name?.toLowerCase().replace(/[\s\/]+/g, '-') || apiRestaurant?.name?.toLowerCase().replace(/[\s\/]+/g, '-') || slug || "unknown",
            restaurantId: actualRestaurant?.restaurantId || actualRestaurant?._id || actualRestaurant?.id || apiRestaurant?.restaurantId || apiRestaurant?._id || apiRestaurant?.id || null,
            // Add other fields with defaults
            featuredDish: actualRestaurant?.featuredDish || apiRestaurant?.featuredDish || onboardingStep4?.featuredDish || "Special Dish",
            featuredPrice: actualRestaurant?.featuredPrice || apiRestaurant?.featuredPrice || onboardingStep4?.featuredPrice || 249,
            // Additional safety fields
            openDays: Array.isArray(actualRestaurant?.openDays)
              ? actualRestaurant.openDays
              : (Array.isArray(apiRestaurant?.openDays) ? apiRestaurant.openDays : (Array.isArray(onboardingStep2?.openDays) ? onboardingStep2.openDays : [])),
            deliveryTimings: actualRestaurant?.deliveryTimings || apiRestaurant?.deliveryTimings || {
              openingTime: actualRestaurant?.openingTime || apiRestaurant?.openingTime || onboardingStep2?.deliveryTimings?.openingTime || "09:00",
              closingTime: actualRestaurant?.closingTime || apiRestaurant?.closingTime || onboardingStep2?.deliveryTimings?.closingTime || "22:00",
            },
            outletTimings: actualRestaurant?.outletTimings || apiRestaurant?.outletTimings || null,
            cuisines: Array.isArray(actualRestaurant?.cuisines) ? actualRestaurant.cuisines : (Array.isArray(apiRestaurant?.cuisines) ? apiRestaurant.cuisines : (Array.isArray(onboardingStep2?.cuisines) ? onboardingStep2.cuisines : [])),
            profileImage: normalizedProfileImage,
            coverImages: normalizedCoverImages,
            menuImages: normalizedMenuImages,
            // Menu sections for display (will be populated from menu API)
            menuSections: [],
            // Onboarding data including FSSAI license
            onboarding: actualRestaurant?.onboarding || apiRestaurant?.onboarding || null,
            ownerName: actualRestaurant?.ownerName || apiRestaurant?.ownerName || actualRestaurant?.onboarding?.step1?.ownerName || apiRestaurant?.onboarding?.step1?.ownerName || null,
            fssaiNumber: actualRestaurant?.fssaiNumber || apiRestaurant?.fssaiNumber || actualRestaurant?.onboarding?.step3?.fssai?.registrationNumber || apiRestaurant?.onboarding?.step3?.fssai?.registrationNumber || null,
            gstNumber: actualRestaurant?.gstNumber || apiRestaurant?.gstNumber || actualRestaurant?.onboarding?.step3?.gst?.gstNumber || apiRestaurant?.onboarding?.step3?.gst?.gstNumber || null,
            gstRegistered: typeof actualRestaurant?.gstRegistered === 'boolean' ? actualRestaurant.gstRegistered : (typeof apiRestaurant?.gstRegistered === 'boolean' ? apiRestaurant.gstRegistered : (actualRestaurant?.onboarding?.step3?.gst?.isRegistered || apiRestaurant?.onboarding?.step3?.gst?.isRegistered || false)),
            phone: actualRestaurant?.primaryContactNumber || actualRestaurant?.ownerPhone || apiRestaurant?.primaryContactNumber || apiRestaurant?.ownerPhone || actualRestaurant?.phone || apiRestaurant?.phone || "",
            diningSettings: actualRestaurant?.diningSettings || apiRestaurant?.diningSettings || null,
            takeawaySettings: actualRestaurant?.takeawaySettings || apiRestaurant?.takeawaySettings || null,
            // Availability fields for grayscale styling
            isActive: actualRestaurant?.isActive !== false, // Default to true if not specified
            isAcceptingOrders: actualRestaurant?.isAcceptingOrders !== false, // Default to true if not specified
          }

          debugLog('? Transformed restaurant:', transformedRestaurant)
          debugLog('? Restaurant ID for menu fetch:', transformedRestaurant.id)

          if (!transformedRestaurant.id) {
            debugError('? No restaurant ID found! Cannot fetch menu.')
          }

          setRestaurant(transformedRestaurant)
          fetchedRestaurantRef.current = true // Mark as fetched
          fetchedSlugRef.current = slug

          // Menu / outlet / inventory: Mongo ObjectId only (never name-slug — that caused 30s cancels)
          const objectIdForApis = [
            seededMongoId,
            transformedRestaurant.mongoId,
            actualRestaurant?._id,
            apiRestaurant?._id,
            transformedRestaurant.id,
            transformedRestaurant.restaurantId,
          ]
            .map((v) => String(v || "").trim())
            .find((v) => isMongoObjectId(v))

          setLoadingMenuItems(true)
          if (!objectIdForApis) {
            debugWarn('? No Mongo ObjectId for menu/timings — skipping secondary fetches')
            setLoadingMenuItems(false)
          } else {
            const hasPreviousOrderForRestaurant = !!actualRestaurant?.hasOrderedBefore || !!apiRestaurant?.hasOrderedBefore

            const [outletResult, menuResult] = await Promise.allSettled([
              restaurantAPI.getOutletTimingsByRestaurantId(objectIdForApis),
              restaurantAPI.getMenuByRestaurantId(objectIdForApis),
            ])

            if (outletResult.status === "fulfilled") {
              const outletTimingsData =
                outletResult.value?.data?.data?.outletTimings ||
                outletResult.value?.data?.outletTimings
              if (outletTimingsData) {
                setRestaurant((prev) => (prev ? { ...prev, outletTimings: outletTimingsData } : prev))
              }
            } else {
              debugWarn("Outlet timings fetch failed, falling back to delivery timings:", outletResult.reason?.message)
            }

            try {
              const menuResponse =
                menuResult.status === "fulfilled" && menuResult.value?.data?.success
                  ? menuResult.value
                  : null
              if (!menuResponse) {
                if (menuResult.status === "rejected" && menuResult.reason?.response?.status !== 404) {
                  throw menuResult.reason
                }
                throw Object.assign(new Error('Menu not found'), { response: { status: 404 } })
              }
              debugLog('? Menu resolved using ObjectId:', objectIdForApis)
              if (menuResponse.data && menuResponse.data.success && menuResponse.data.data && menuResponse.data.data.menu) {
                const rawSections = menuResponse.data.data.menu.sections || []
                const toArray = (value) => {
                  if (Array.isArray(value)) return value
                  if (!value || typeof value !== "object") return []
                  return Object.values(value).filter((entry) => entry && typeof entry === "object")
                }
                const normalizeItem = (item = {}) => {
                  const isRecommended = item.isRecommended === true || item.isRecommended === 1 || String(item.isRecommended) === "true"
                  const isSpicy = item.isSpicy === true || item.isSpicy === 1 || String(item.isSpicy) === "true"
                  let foodType = item.foodType || "Non-Veg"
                  if (typeof foodType === 'string') {
                    if (foodType.toLowerCase() === 'veg') foodType = 'Veg'
                    else if (foodType.toLowerCase() === 'non-veg' || foodType.toLowerCase() === 'nonveg') foodType = 'Non-Veg'
                  }

                  // Derive isVeg strictly from foodType
                  const isVeg = foodType === 'Veg'

                  return {
                    ...item,
                    id: String(item.id || item._id || `${Date.now()}-${Math.random()}`),
                    name: item.name || "Unnamed Item",
                    foodType,
                    isVeg, // Explicitly set isVeg
                    price: getFoodDisplayPrice(item),
                    variants: getFoodVariants(item),
                    variations: getFoodVariants(item),
                    isAvailable: item.isAvailable !== false,
                    isRecommended,
                    isSpicy,
                    description: typeof item.description === "string" ? item.description : "",
                  }
                }
                const menuSections = toArray(rawSections).map((section, sectionIndex) => ({
                  ...section,
                  id: String(section.id || section._id || `section-${sectionIndex}`),
                  name: section.name || section.title || "Unnamed Section",
                  items: toArray(section.items).map(normalizeItem),
                  subsections: toArray(section.subsections).map((subsection, subsectionIndex) => ({
                    ...subsection,
                    id: String(subsection.id || subsection._id || `subsection-${sectionIndex}-${subsectionIndex}`),
                    name: subsection.name || "Unnamed Subsection",
                    items: toArray(subsection.items).map(normalizeItem),
                  })),
                }))

                // Collect all recommended items from all sections
                // Only include items that are both recommended (isRecommended === true) AND available (isAvailable !== false)
                const recommendedItems = []
                menuSections.forEach(section => {
                  // Check direct items - only include if isRecommended is explicitly true (strict check) AND item is available
                  if (section.items && Array.isArray(section.items)) {
                    section.items.forEach(item => {
                      // Strict check: isRecommended must be exactly boolean true
                      // This will exclude: false, undefined, null, 0, "", and any other falsy values
                      if (isRecommendedItem(item) && item.isAvailable !== false) {
                        recommendedItems.push(item)
                      }
                    })
                  }
                  // Check subsection items - only include if isRecommended is explicitly true (strict check) AND item is available
                  if (section.subsections && Array.isArray(section.subsections)) {
                    section.subsections.forEach(subsection => {
                      if (subsection.items && Array.isArray(subsection.items)) {
                        subsection.items.forEach(item => {
                          // Strict check: isRecommended must be exactly boolean true
                          // This will exclude: false, undefined, null, 0, "", and any other falsy values
                          if (isRecommendedItem(item) && item.isAvailable !== false) {
                            recommendedItems.push(item)
                          }
                        })
                      }
                    })
                  }
                })

                // Debug log to verify recommended items and their isRecommended values
                debugLog('Recommended items collected:', recommendedItems.map(item => ({
                  name: item.name,
                  isRecommended: item.isRecommended,
                  isRecommendedType: typeof item.isRecommended,
                  preparationTime: item.preparationTime
                })))

                // Debug log to check preparationTime in menu sections
                debugLog('Menu sections with preparationTime:', menuSections.map(section => ({
                  sectionName: section.name,
                  items: section.items?.map(item => ({
                    name: item.name,
                    preparationTime: item.preparationTime
                  })) || []
                })))

                // Dynamically inject the specifically searched dish at the very top of Recommended if targetDishId is present
                if (targetDishId) {
                  const allItemsInMenu = []
                  menuSections.forEach(s => {
                    if (s.items) allItemsInMenu.push(...s.items)
                    if (s.subsections) {
                      s.subsections.forEach(ss => {
                        if (ss.items) allItemsInMenu.push(...ss.items)
                      })
                    }
                  })
                  const matchedItem = allItemsInMenu.find(item => String(item.id || item._id || "").trim() === targetDishId)
                  if (matchedItem) {
                    // Check if it's already in recommendedItems, if so remove it
                    const existingIdx = recommendedItems.findIndex(item => String(item.id || item._id || "").trim() === targetDishId)
                    if (existingIdx > -1) {
                      recommendedItems.splice(existingIdx, 1)
                    }
                    // Add/Move to the very front
                    recommendedItems.unshift(matchedItem)
                    debugLog('Moved matched item to front of Recommended:', matchedItem.name)
                  }
                }

                // Deduplicate "Recommended for you" sections
                let finalMenuSections = menuSections.filter(s => {
                  const name = (s.name || s.title || "").toLowerCase().trim()
                  return name !== "recommended" && name !== "recommended for you"
                })

                if (recommendedItems.length > 0) {
                  finalMenuSections = [{ name: "Recommended for you", items: recommendedItems, subsections: [] }, ...finalMenuSections]
                }

                setRestaurant(prev => ({
                  ...prev,
                  menuSections: finalMenuSections,
                }))

                // Set all sections as expanded by default so users don't have to manually click
                const defaultExpandedSections = new Set(
                  finalMenuSections.map((_, idx) => idx)
                )

                // Also expand all sub-sections by default
                finalMenuSections.forEach((section, originalIndex) => {
                  if (section.subsections && Array.isArray(section.subsections)) {
                    section.subsections.forEach((_, subIndex) => {
                      defaultExpandedSections.add(`${originalIndex}-${subIndex}`)
                    })
                  }
                })

                setExpandedSections(defaultExpandedSections)

                debugLog('Fetched menu sections with recommended items:', finalMenuSections)
              }
            } catch (menuError) {
              if (menuError.response && menuError.response.status === 404) {
                debugLog('? Menu not found for this restaurant (might be a dining-only listing).')
              } else {
                debugError('? Error fetching menu:', menuError)
              }
            } finally {
              setLoadingMenuItems(false)
            }

            try {
              debugLog('? Fetching inventory for restaurant ID:', objectIdForApis)
              const inventoryResponse = await restaurantAPI.getInventoryByRestaurantId(objectIdForApis)
              if (inventoryResponse?.data?.success && inventoryResponse?.data?.data?.inventory) {
                const inventoryCategories = inventoryResponse.data.data.inventory.categories || []

                // Normalize inventory categories to ensure proper structure
                const normalizedInventory = inventoryCategories.map((category, index) => ({
                  id: category.id || `category-${index}`,
                  name: category.name || "Unnamed Category",
                  description: category.description || "",
                  itemCount: category.itemCount || (category.items?.length || 0),
                  inStock: category.inStock !== undefined ? category.inStock : true,
                  items: Array.isArray(category.items) ? category.items.map(item => ({
                    id: String(item.id || Date.now() + Math.random()),
                    name: item.name || "Unnamed Item",
                    inStock: item.inStock !== undefined ? item.inStock : true,
                    isVeg: item.isVeg !== undefined ? item.isVeg : true,
                    stockQuantity: item.stockQuantity || "Unlimited",
                    unit: item.unit || "piece",
                    expiryDate: item.expiryDate || null,
                    lastRestocked: item.lastRestocked || null,
                  })) : [],
                  order: category.order !== undefined ? category.order : index,
                }))

                setRestaurant(prev => ({
                  ...prev,
                  inventory: normalizedInventory,
                }))
                debugLog('? Fetched and normalized inventory categories:', normalizedInventory)
              }
            } catch (inventoryError) {
              if (inventoryError.response && inventoryError.response.status === 404) {
                debugLog('? Inventory not found for this restaurant (might be a dining-only listing).')
              } else {
                debugError('? Error fetching inventory:', inventoryError)
              }
            }
          }
        } else {
          debugError('? No restaurant data found in API response')
          debugError('? Response:', response)
          debugError('? apiRestaurant:', apiRestaurant)
          if (!fetchedRestaurantRef.current) {
            setRestaurantError('Restaurant not found')
            setRestaurant(null)
          }
        }
      } catch (error) {
        // Check if it's a network error (backend not running)
        const isNetworkError = error.code === 'ERR_NETWORK' || error.message === 'Network Error'

        // Check if it's a 404 error (restaurant doesn't exist)
        const is404Error = error.response?.status === 404

        if (isNetworkError) {
          // Network error - backend is not running
          // Don't show "Restaurant not found" for network errors
          // The axios interceptor will show a toast notification
          debugError('Network error fetching restaurant (backend may not be running):', error)
          if (!fetchedRestaurantRef.current) {
            setRestaurantError(networkErrorMessage())
            setRestaurant(null)
          }
        } else if (is404Error) {
          // 404 error - restaurant doesn't exist in database
          debugLog(`Restaurant "${slug}" not found in database`)
          if (!fetchedRestaurantRef.current) {
            setRestaurantError('Restaurant not found')
            setRestaurant(null)
          }
        } else {
          // Other errors
          debugError('Error fetching restaurant:', error)
          if (!fetchedRestaurantRef.current) {
            setRestaurantError(error.message || 'Failed to load restaurant')
            setRestaurant(null)
          }
        }
      } finally {
        setLoadingRestaurant(false)
        setLoadingMenuItems(false)
      }
    }

    // Reset fetched flag only when URL slug changes.
    // Do not compare with restaurant.slug because canonical API slug may differ
    // from route slug (e.g. "restaurant-2513"), causing refetch loops.
    if (fetchedRestaurantRef.current && fetchedSlugRef.current !== slug) {
      fetchedRestaurantRef.current = false
      fetchedSlugRef.current = null
    }

    fetchRestaurant()
  }, [slug, zoneId, seededMongoId, distanceOrigin?.latitude, distanceOrigin?.longitude])

  // Track previous values to prevent unnecessary recalculations
  const prevCoordsRef = useRef({ userLat: null, userLng: null, restaurantLat: null, restaurantLng: null })
  const prevDistanceRef = useRef(null)

  // Extract restaurant coordinates as stable values (not array references)
  const restaurantLat = restaurant?.locationObject?.latitude ||
    (restaurant?.locationObject?.coordinates && Array.isArray(restaurant.locationObject.coordinates)
      ? restaurant.locationObject.coordinates[1]
      : null)
  const restaurantLng = restaurant?.locationObject?.longitude ||
    (restaurant?.locationObject?.coordinates && Array.isArray(restaurant.locationObject.coordinates)
      ? restaurant.locationObject.coordinates[0]
      : null)



  // Sync quantities from cart on mount and when restaurant changes.
  // Keyed by "itemId::variantId" (what the menu looks up) — a logged-in cart's
  // line id is the server's Mongo _id, so keying by item.id never matched and
  // every dish kept showing ADD after it was added.
  useEffect(() => {
    if (!restaurant || !restaurant.name) return

    const cartQuantities = {}
    cart.forEach((item) => {
      const key = buildCartLineId(item.itemId || item.productId || item.id, item.variantId || "")
      cartQuantities[key] = (cartQuantities[key] || 0) + (item.quantity || 0)
    })
    setQuantities(cartQuantities)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.name, cart])

  // Pick the variant to show when the dish popup opens: the one already in the
  // cart, else the first. Only on open — re-running on every quantity change
  // snapped the selection back while the user was picking a different variant.
  useEffect(() => {
    if (!selectedItem) {
      setSelectedVariantId("")
      return
    }
    const variants = getFoodVariants(selectedItem)
    const variantInCart = variants.find(v => {
      const lineItemId = getLineItemIdForDish(selectedItem, v)
      return quantities[lineItemId] > 0
    })
    const initialVariant = variantInCart || getDefaultFoodVariant(selectedItem)
    setSelectedVariantId(initialVariant?.id || "")
    setItemDetailQty(Math.max(1, quantities[getLineItemIdForDish(selectedItem, initialVariant)] || 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem])

  // Helper function to update item quantity in both local state and cart
  const updateItemQuantity = async (item, newQuantity, event = null, preferredVariant = null) => {
    // Check authentication
    if (!isModuleAuthenticated('user')) {
      window.dispatchEvent(new CustomEvent('show-login-required'))
      return
    }

    // CRITICAL: Check if user is in service zone or restaurant is available
    if (isOutOfService) {
      toast.error('You are outside the service zone. Please select a location within the service area.');
      return;
    }

    const availability = getRestaurantAvailabilityStatus(restaurant)
    if (!availability.isOpen) {
      toast.error("Restaurant is currently offline. Please try again later.")
      return
    }

    const resolvedVariant = preferredVariant || getDefaultFoodVariant(item)
    const lineItemId = getLineItemIdForDish(item, resolvedVariant)

    // CRITICAL: Validate restaurant data before adding to cart
    if (!restaurant || !restaurant.name) {
      debugError('? Cannot add item to cart: Restaurant data is missing!');
      toast.error('Restaurant information is missing. Please refresh the page.');
      return;
    }

    // Ensure we have a valid restaurantId
    const validRestaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id;
    if (!validRestaurantId) {
      debugError('? Cannot add item to cart: Restaurant ID is missing!', {
        restaurant: restaurant,
        restaurantId: restaurant?.restaurantId,
        _id: restaurant?._id,
        id: restaurant?.id
      });
      toast.error('Restaurant ID is missing. Please refresh the page.');
      return;
    }

    // Log for debugging
    debugLog('? Adding item to cart:', {
      itemName: item.name,
      restaurantName: restaurant.name,
      restaurantId: validRestaurantId,
      restaurant_id: restaurant._id,
      restaurant_restaurantId: restaurant.restaurantId
    });

    // Prepare cart item with all required properties (selling price already includes admin markup).
    const cartItem = {
      id: lineItemId,
      lineItemId,
      itemId: item.id,
      name: item.name,
      price: resolvedVariant?.price ?? item.price,
      basePrice: resolvedVariant?.basePrice ?? item.basePrice ?? resolvedVariant?.price ?? item.price,
      markupAmount: resolvedVariant?.markupAmount ?? item.markupAmount ?? 0,
      variantId: resolvedVariant?.id || "",
      variantName: resolvedVariant?.name || "",
      variantPrice: resolvedVariant?.price ?? item.price,
      image: item.image,
      restaurant: restaurant.name, // Use restaurant.name directly (already validated)
      restaurantId: validRestaurantId, // Use validated restaurantId
      restaurantZoneId: restaurant.zoneId ? String(restaurant.zoneId) : "",
      description: item.description,
      isVeg: item.isVeg === true, // Use strict check
      foodType: item.foodType, // Include foodType for robustness
      preparationTime: item.preparationTime, // Add preparationTime property
      pricingScope: resolvedVariant?.pricingScope ?? item.pricingScope ?? null,
      appliedPricingType: resolvedVariant?.appliedPricingType ?? item.appliedPricingType ?? null,
      appliedPricingValue: resolvedVariant?.appliedPricingValue ?? item.appliedPricingValue ?? null,
    }

    // Get source position for animation from event target
    // Prefer currentTarget (the button) over target (might be icon inside button)
    let sourcePosition = null
    // Native press event: the touch point in window coordinates (the web used the button's rect centre).
    const touch = event?.nativeEvent
    if (touch && Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY)) {
      sourcePosition = {
        viewportX: touch.pageX,
        viewportY: touch.pageY,
        scrollX: 0,
        scrollY: 0,
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

    // Optimistic UI; the cart sync effect overwrites it with the server's answer.
    setQuantities((prev) => ({
      ...prev,
      [lineItemId]: newQuantity,
    }))

    // Cart calls are async — the old code read `result.ok` off the Promise, so
    // every failure (other restaurant in cart, item unavailable…) was silent.
    let result
    if (newQuantity <= 0) {
      result = await removeFromCart(lineItemId, sourcePosition, productInfo)
    } else if (!existingCartItem) {
      // New line: send the wanted quantity in one call (add-then-update raced).
      result = await addToCart({ ...cartItem, quantity: newQuantity }, sourcePosition)
    } else if (
      newQuantity === prevQuantity + 1 &&
      sourcePosition &&
      (quantities[lineItemId] || 0) === prevQuantity
    ) {
      // Plain +1 with nothing in flight: add call (plays the fly-to-cart animation).
      // During rapid taps fall through to an absolute set so taps can't double count.
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

  const isRecommendedSection = (section) => {
    const sectionName = section?.name || section?.title || ""
    if (typeof sectionName !== "string") return false
    const name = sectionName.trim().toLowerCase()
    return name === "recommended for you" || name === "result for your search"
  }

  const isRecommendedItem = (item) => {
    return item.isRecommended === true && typeof item.isRecommended === "boolean"
  }

  const getSectionDisplayName = (section) => {
    if (isRecommendedSection(section)) {
      return "Recommended for you"
    }
    if (section?.name && typeof section.name === "string" && section.name.trim()) {
      return section.name.trim()
    }
    if (section?.title && typeof section.title === "string" && section.title.trim()) {
      return section.title.trim()
    }
    return "Unnamed Section"
  }

  const normalizeMenuCategoryId = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

  const toRenderableArray = (value) => {
    if (Array.isArray(value)) return value
    if (!value || typeof value !== "object") return []
    return Object.values(value).filter((entry) => entry && typeof entry === "object")
  }

  const getSectionCategoryImage = (section) => {
    const directImage = typeof section?.image === "string" ? section.image.trim() : ""
    if (directImage) return directImage

    const firstSectionItemImage = toRenderableArray(section?.items).find(
      (item) => typeof item?.image === "string" && item.image.trim(),
    )?.image
    if (firstSectionItemImage) return firstSectionItemImage

    const firstSubsectionImage = toRenderableArray(section?.subsections)
      .flatMap((subsection) => toRenderableArray(subsection?.items))
      .find((item) => typeof item?.image === "string" && item.image.trim())?.image

    return firstSubsectionImage || ""
  }

  // Menu categories - built from raw sections but item count respects veg mode inline
  const menuCategories = useMemo(() => {
    if (!restaurant?.menuSections || !Array.isArray(restaurant.menuSections)) return []

    return restaurant.menuSections
      .map((section, index) => {
        if (isRecommendedSection(section)) return null

        const sectionTitle = getSectionDisplayName(section)

        // Count only items that pass veg mode filter
        const countVisibleItems = (items) =>
          toRenderableArray(items).filter((item) => {
            if (item?.isAvailable === false) return false
            if (vegMode && !isVegMenuItem(item)) return false
            return true
          }).length

        const itemCount = countVisibleItems(section?.items)
        const subsectionCount = toRenderableArray(section?.subsections)
          .reduce((sum, sub) => sum + countVisibleItems(sub?.items), 0)
        const totalCount = itemCount + subsectionCount

        if (totalCount <= 0) return null

        return {
          id: normalizeMenuCategoryId(section?.categoryId || sectionTitle || index) || `section-${index}`,
          name: sectionTitle,
          image: getSectionCategoryImage(section),
          count: totalCount,
          sectionIndex: index,
        }
      })
      .filter(Boolean)
  }, [restaurant?.menuSections, vegMode])

  // Count active filters
  const getActiveFilterCount = () => {
    let count = 0
    if (filters.sortBy) count++
    if (filters.vegNonVeg) count++
    if (filters.highlyReordered) count++
    if (filters.spicy) count++
    return count
  }

  const activeFilterCount = getActiveFilterCount()

  useEffect(() => {
    if (typeof window === "undefined" || !slug) return

    try {
      const raw = window.localStorage.getItem(RESTAURANT_DETAILS_FILTERS_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      const nextState = parsed && typeof parsed === "object" ? parsed : {}
      nextState[slug] = filters
      window.localStorage.setItem(RESTAURANT_DETAILS_FILTERS_STORAGE_KEY, JSON.stringify(nextState))
    } catch (error) {
      debugWarn("Failed to persist restaurant filters:", error)
    }
  }, [filters, slug])

  useEffect(() => {
    if (selectedMenuCategory === "all") return
    const categoryStillVisible = menuCategories.some((category) => category.id === selectedMenuCategory)
    if (!categoryStillVisible) {
      setSelectedMenuCategory("all")
    }
  }, [menuCategories, selectedMenuCategory])

  // Handle bookmark click
  const handleBookmarkClick = (item) => {
    const restaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id
    if (!restaurantId) {
      toast.error("Restaurant information is missing")
      return
    }

    const dishId = item.id || item._id
    if (!dishId) {
      toast.error("Dish information is missing")
      return
    }

    const isFavorite = isDishFavorite(dishId, restaurantId)

    if (isFavorite) {
      // If already bookmarked, remove it
      removeDishFavorite(dishId, restaurantId)
      toast.success("Dish removed from favorites")
    } else {
      // Add to favorites
      const dishData = {
        id: dishId,
        name: item.name,
        description: item.description,
        price: item.price,
        originalPrice: item.originalPrice,
        image: item.image,
        restaurantId: restaurantId,
        restaurantName: restaurant?.name || "",
        restaurantSlug: restaurant?.slug || slug || "",
        foodType: item.foodType,
        isSpicy: item.isSpicy,
        customisable: item.customisable,
      }
      addDishFavorite(dishData)
      toast.success("Dish added to favorites")
    }
  }

  // Handle add to collection
  const handleAddToCollection = () => {
    const restaurantSlug = restaurant?.slug || slug || ""

    if (!restaurantSlug) {
      toast.error("Restaurant information is missing")
      return
    }

    if (!restaurant) {
      toast.error("Restaurant data not available")
      return
    }

    const isAlreadyFavorite = isFavorite(restaurantSlug)

    if (isAlreadyFavorite) {
      // Remove from collection
      removeFavorite(restaurantSlug)
      toast.success("Restaurant removed from collection")
    } else {
      // Add to collection
      addFavorite({
        slug: restaurantSlug,
        name: restaurant.name || "",
        cuisine: restaurant.cuisine || "",
        rating: restaurant.rating || 0,
        deliveryTime: restaurant.deliveryTime || restaurant.estimatedDeliveryTime || "",
        distance: restaurant.distance || "",
        priceRange: restaurant.priceRange || "",
        image: restaurant.profileImageUrl?.url || restaurant.image || ""
      })
      toast.success("Restaurant added to collection")
    }

    setShowMenuOptionsSheet(false)
  }

  // Handle share restaurant
  const handleShareRestaurant = async () => {
    const companyName = await getCompanyNameAsync()
    const restaurantSlug = restaurant?.slug || slug || ""
    const restaurantName = restaurant?.name || "this restaurant"

    // Create share URL
    const shareUrl = buildShareUrl(restaurantSharePath(restaurantSlug))
    const shareText = `Check out ${restaurantName} on ${companyName}! ${shareUrl}`

    const payload = {
      title: restaurantName,
      text: shareText,
      url: shareUrl,
    }

    if (isMobileDevice()) {
      openShareModal(payload)
      setShowMenuOptionsSheet(false)
      return
    }

    const shared = await tryNativeShare(payload)
    if (shared === "cancelled") {
      setShowMenuOptionsSheet(false)
      return
    }
    if (shared) {
      toast.success("Restaurant shared successfully")
      setShowMenuOptionsSheet(false)
      return
    }

    openShareModal(payload)
    setShowMenuOptionsSheet(false)
  }



  // Handle share click
  const handleShareClick = async (item) => {
    const dishId = item.id || item._id
    const restaurantSlug = restaurant?.slug || slug || ""

    // Create share URL
    const shareUrl = buildShareUrl(restaurantSharePath(restaurantSlug, dishId))
    const shareText = `Check out ${item.name} from ${restaurant?.name || "this restaurant"}! ${shareUrl}`

    const payload = {
      title: `${item.name} - ${restaurant?.name || ""}`,
      text: shareText,
      url: shareUrl,
    }

    if (isMobileDevice()) {
      openShareModal(payload)
      return
    }

    const shared = await tryNativeShare(payload)
    if (shared === "cancelled") return
    if (shared) {
      toast.success("Dish shared successfully")
      return
    }

    openShareModal(payload)
  }

  // Copy to clipboard helper
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Link copied to clipboard!")
    } catch (error) {
      toast.error("Failed to copy link")
    }
  }

  const isMobileDevice = () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false
    const mobileUA = /Android|iPhone|iPad|iPod|Windows Phone|Opera Mini|IEMobile/i.test(navigator.userAgent)
    const smallViewport = window.matchMedia?.("(max-width: 768px)")?.matches
    return Boolean(mobileUA || smallViewport)
  }

  const openShareModal = (payload) => {
    setSharePayload(payload)
    setShowShareModal(true)
  }

  const tryNativeShare = async (payload) => {
    if (typeof navigator === "undefined" || !navigator.share) return false
    try {
      await navigator.share(payload)
      return true
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled"
      return false
    }
  }

  const openShareTarget = (target) => {
    if (!sharePayload?.url) return

    const text = sharePayload.text || ""
    const url = sharePayload.url
    const encodedText = encodeURIComponent(text)
    const encodedUrl = encodeURIComponent(url)

    let shareLink = ""

    if (target === "whatsapp") {
      shareLink = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
    } else if (target === "telegram") {
      shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    } else if (target === "email") {
      shareLink = `mailto:?subject=${encodeURIComponent(sharePayload.title || "Check this out")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
    }

    if (shareLink) {
      Linking.openURL(shareLink).catch(() => {})
      setShowShareModal(false)
    }
  }

  const copyShareLink = async () => {
    if (!sharePayload?.url) return
    await copyToClipboard(sharePayload.url)
    setShowShareModal(false)
  }

  const handleSystemShareFromModal = async () => {
    if (!sharePayload) return
    const shared = await tryNativeShare(sharePayload)
    if (shared) {
      setShowShareModal(false)
      toast.success("Shared successfully")
    }
  }

  // Prefetch only when we don't already have the list image decoded
  const preloadDishImage = (src) =>
    new Promise((resolve) => {
      const resolved = resolveImageSource(src)
      if (!resolved?.uri) {
        resolve()
        return
      }
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const timeoutId = setTimeout(finish, 500)
      ExpoImage.prefetch(resolved.uri, "memory-disk")
        .catch(() => {})
        .finally(() => {
          clearTimeout(timeoutId)
          finish()
        })
    })

  const itemDetailOpenSeqRef = useRef(0)

  // Reuse the exact URL the list already loaded (srcset/webp). Raw item.image is a
  // different URL, so the browser treats the popup as a fresh download otherwise.
  // eslint-disable-next-line no-unused-vars
  const handleItemClick = async (item, event) => {
    const seq = ++itemDetailOpenSeqRef.current
    // expo-image caches the list thumbnail by URL (memory-disk), so the popup paints from the same cache.
    const imageSrc = item?.image || ""
    setSelectedItem({ ...item, displayImage: imageSrc })

    const cacheKey = resolveImageSource(imageSrc)?.uri || ""
    const alreadyReady = Boolean(cacheKey && (await ExpoImage.getCachePathAsync(cacheKey).catch(() => null)))
    if (!alreadyReady) {
      await preloadDishImage(imageSrc)
    }
    if (seq !== itemDetailOpenSeqRef.current) return
    setShowItemDetail(true)
  }

  const closeItemDetail = () => {
    setShowItemDetail(false)
  }

  // Helper function to calculate final price after discount
  const getFinalPrice = (item) => {
    // If discount exists, calculate from originalPrice, otherwise use price directly
    if (item.originalPrice && item.discountAmount && item.discountAmount > 0) {
      // Calculate discounted price from originalPrice
      let discountedPrice = item.originalPrice;
      if (item.discountType === 'Percent') {
        discountedPrice = item.originalPrice - (item.originalPrice * item.discountAmount / 100);
      } else if (item.discountType === 'Fixed') {
        discountedPrice = item.originalPrice - item.discountAmount;
      }
      return Math.max(0, discountedPrice);
    }
    // Otherwise, use price as the final price
    return Math.max(0, item.price || 0);
  };

  // Filter menu items based on active filters
  const filterMenuItems = (items) => {
    if (!items) return items

    return items.filter((item) => {
      // Under 250 filter (when coming from Under 250 page)
      if (showOnlyUnder250) {
        const finalPrice = getFinalPrice(item);
        if (finalPrice > 250) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const itemName = item.name?.toLowerCase() || ""
        if (!itemName.includes(query)) return false
      }

      // VegMode filter - when vegMode is ON, show only Veg items
      // When vegMode is false/null/undefined, show all items (Veg and Non-Veg)
      if (vegMode === true) {
        if (!isVegMenuItem(item)) return false
      }

      // Veg/Non-veg filter (local filter override) — Non-veg chip disabled while vegMode is ON
      if (filters.vegNonVeg === "veg") {
        if (!isVegMenuItem(item)) return false
      }
      if (!vegMode && filters.vegNonVeg === "non-veg") {
        if (isVegMenuItem(item)) return false
      }

      if (filters.highlyReordered && !isRecommendedItem(item)) return false
      if (filters.spicy && item.isSpicy !== true) return false

      return true
    })
  }

  // Sort items based on sortBy filter
  const sortMenuItems = (items) => {
    if (!items) return items
    if (!filters.sortBy) return items

    const sorted = [...items]
    if (filters.sortBy === "low-to-high") {
      return sorted.sort((a, b) => getFinalPrice(a) - getFinalPrice(b))
    } else if (filters.sortBy === "high-to-low") {
      return sorted.sort((a, b) => getFinalPrice(b) - getFinalPrice(a))
    }
    return sorted
  }

  const getSectionSortValue = (section) => {
    const allItems = [
      ...toRenderableArray(section?.items),
      ...toRenderableArray(section?.subsections).flatMap((subsection) => toRenderableArray(subsection?.items)),
    ]

    if (allItems.length === 0) return null

    const prices = allItems
      .map((item) => getFinalPrice(item))
      .filter((price) => Number.isFinite(price))

    if (prices.length === 0) return null

    if (filters.sortBy === "low-to-high") {
      return Math.min(...prices)
    }

    if (filters.sortBy === "high-to-low") {
      return Math.max(...prices)
    }

    return null
  }

  // Helper function to check if a section has any items under Rs 250
  const sectionHasItemsUnder250 = (section) => {
    if (!showOnlyUnder250) return true; // If not filtering, show all sections

    // Check direct items
    if (section.items && section.items.length > 0) {
      const hasUnder250Items = section.items.some(item => {
        if (item.isAvailable === false) return false;
        const finalPrice = getFinalPrice(item);
        return finalPrice <= 250;
      });
      if (hasUnder250Items) return true;
    }

    // Check subsection items
    if (section.subsections && section.subsections.length > 0) {
      for (const subsection of section.subsections) {
        if (subsection.items && subsection.items.length > 0) {
          const hasUnder250Items = subsection.items.some(item => {
            if (item.isAvailable === false) return false;
            const finalPrice = getFinalPrice(item);
            return finalPrice <= 250;
          });
          if (hasUnder250Items) return true;
        }
      }
    }

    return false;
  }

  // Build renderable sections from the current filter state so section/subsection visibility
  // stays in sync with the actual filtered items shown on screen.
  const getFilteredSections = () => {
    if (!restaurant?.menuSections) return []

    const visibleSections = restaurant.menuSections
      .map((section, index) => {
        const filteredItems = sortMenuItems(
          filterMenuItems(
            toRenderableArray(section?.items).filter((item) => item?.isAvailable !== false)
          )
        )

        const filteredSubsections = toRenderableArray(section?.subsections)
          .map((subsection) => ({
            ...subsection,
            items: sortMenuItems(
              filterMenuItems(
                toRenderableArray(subsection?.items).filter((item) => item?.isAvailable !== false)
              )
            ),
          }))
          .filter((subsection) => subsection.items.length > 0)

        return {
          section: {
            ...section,
            items: filteredItems,
            subsections: filteredSubsections,
          },
          originalIndex: index,
        }
      })
      .filter(({ section }) => {
        if (selectedMenuCategory !== "all") {
          if (isRecommendedSection(section)) return false
          const sectionCategoryId = normalizeMenuCategoryId(section?.categoryId || getSectionDisplayName(section))
          if (sectionCategoryId !== selectedMenuCategory) {
            return false
          }
        }

        const hasVisibleItems = toRenderableArray(section?.items).length > 0
        const hasVisibleSubsections = toRenderableArray(section?.subsections).length > 0
        return hasVisibleItems || hasVisibleSubsections
      })

    if (!filters.sortBy) {
      return visibleSections
    }

    return [...visibleSections].sort((left, right) => {
      const leftValue = getSectionSortValue(left.section)
      const rightValue = getSectionSortValue(right.section)

      if (leftValue == null && rightValue == null) return 0
      if (leftValue == null) return 1
      if (rightValue == null) return -1

      return filters.sortBy === "low-to-high"
        ? leftValue - rightValue
        : rightValue - leftValue
    })
  }

  const hasActiveMenuFilters = Boolean(
    showOnlyUnder250 ||
    searchQuery.trim() ||
    vegMode === true ||
    filters.sortBy ||
    filters.vegNonVeg ||
    filters.highlyReordered ||
    filters.spicy
  )

  // User-explicitly-applied filters (excludes vegMode — vegMode is a global preference, not a manual filter)
  const hasUserAppliedFilters = Boolean(
    showOnlyUnder250 ||
    searchQuery.trim() ||
    filters.sortBy ||
    filters.vegNonVeg ||
    filters.highlyReordered ||
    filters.spicy
  )

  const filteredSections = useMemo(
    () => getFilteredSections(),
    [restaurant?.menuSections, showOnlyUnder250, searchQuery, vegMode, filters, selectedMenuCategory]
  )

  // Menu button size comes from its onLayout (offsetWidth/offsetHeight on the web).

  useEffect(() => {
    if (!hasActiveMenuFilters) return

    const nextExpanded = new Set()
    filteredSections.forEach(({ section, originalIndex }) => {
      nextExpanded.add(originalIndex)
      toRenderableArray(section?.subsections).forEach((_, subIndex) => {
        nextExpanded.add(`${originalIndex}-${subIndex}`)
      })
    })

    setExpandedSections(nextExpanded)
  }, [filteredSections, hasActiveMenuFilters])

  useEffect(() => {
    if (!restaurant?.menuSections || !targetDishId) return

    let matchedItem = null
    const sectionKeysToExpand = new Set()

    restaurant.menuSections.forEach((section, originalIndex) => {
      const sectionItems = toRenderableArray(section?.items)
      const matchedSectionItem = sectionItems.find(
        (item) => String(item?.id || item?._id || "").trim() === targetDishId,
      )

      if (matchedSectionItem && !matchedItem) {
        matchedItem = matchedSectionItem
        sectionKeysToExpand.add(originalIndex)
      }

      const sectionSubsections = toRenderableArray(section?.subsections)
      sectionSubsections.forEach((subsection, subIndex) => {
        const subsectionItems = toRenderableArray(subsection?.items)
        const matchedSubsectionItem = subsectionItems.find(
          (item) => String(item?.id || item?._id || "").trim() === targetDishId,
        )

        if (matchedSubsectionItem && !matchedItem) {
          matchedItem = matchedSubsectionItem
          sectionKeysToExpand.add(originalIndex)
          sectionKeysToExpand.add(`${originalIndex}-${subIndex}`)
        }
      })
    })

    if (!matchedItem || hasScrolledRef.current) return

    hasScrolledRef.current = true

    setExpandedSections((prev) => {
      const next = new Set(prev)
      sectionKeysToExpand.forEach((key) => next.add(key))
      return next
    })

    // Ensure we start at the top of the page on mount
    listRef.current?.getScrollResponder?.()?.scrollTo?.({ y: 0, animated: false })

    // Delay applying the highlight slightly so the transition can smoothly fade it in
    const applyHighlightTimer = setTimeout(() => {
      setHighlightedDishId(targetDishId)
    }, 50)

    const highlightTimer = setTimeout(() => {
      setHighlightedDishId(null)
    }, 3000)

    return () => {
      clearTimeout(applyHighlightTimer)
      clearTimeout(highlightTimer)
    }
  }, [loadingMenuItems, targetDishId])

  // Highlight offers/texts for the blue offer line
  const highlightOffers = [
    "Upto 50% OFF",
    restaurant?.offerText || "",
    ...(Array.isArray(restaurant?.offers) ? restaurant.offers.map((offer) => offer?.title || "") : []),
  ]
  const rotatingOffers = highlightOffers
    .map((offer) => String(offer || "").trim())
    .filter(Boolean)
  const offersForDisplay = rotatingOffers.length > 0 ? rotatingOffers : ["Offers available"]
  const activeOfferText = offersForDisplay[highlightIndex % offersForDisplay.length]
  const offerIndicatorCount = Math.min(offersForDisplay.length, 5)
  const activeOfferIndicator = offerIndicatorCount > 0 ? highlightIndex % offerIndicatorCount : 0
  const primaryOffer = Array.isArray(restaurant?.offers) && restaurant.offers.length > 0
    ? restaurant.offers[0]
    : null
  const offerHeadline = primaryOffer?.title || restaurant?.offerText || activeOfferText
  const offerSubline =
    primaryOffer?.description ||
    primaryOffer?.subtitle ||
    (primaryOffer?.code ? `Use ${primaryOffer.code}` : "Tap to view all offers")

  // Auto-rotate images every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => {
        const offersLength = Array.isArray(restaurant?.offers) && restaurant.offers.length > 0
          ? restaurant.offers.length
          : 1
        return (prev + 1) % offersLength
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [restaurant?.offers?.length || 0])

  // Auto-rotate highlight offer text every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setHighlightIndex((prev) => (prev + 1) % highlightOffers.length)
    }, 2000)

    return () => clearInterval(interval)
  }, [highlightOffers.length])


  const t = useTheme()
  const s = useStyles()

  // ------------------------------------------------------------ list data (one SectionList section per menu section)
  // Same rendering rules as the web's map: the first 5 dishes render at once, the rest once loadRemaining is true.
  const listSections = useMemo(() => {
    let overallItemCount = 0
    const out = []
    filteredSections.forEach(({ section, originalIndex }, sectionIndex) => {
      const isRecommended = isRecommendedSection(section)
      const sectionItems = toRenderableArray(section?.items)
      const sectionSubsections = toRenderableArray(section?.subsections)
      const totalItemsInThisSection =
        sectionItems.length + sectionSubsections.reduce((sum, sub) => sum + toRenderableArray(sub?.items).length, 0)
      const sectionStartIdx = overallItemCount
      const hasPriorityItems = sectionStartIdx < 5

      if (!hasPriorityItems && !loadRemaining) {
        overallItemCount += totalItemsInThisSection
        return
      }

      const isExpanded = expandedSections.has(originalIndex)
      const data = []

      if (isExpanded && isRecommended && !loadingMenuItems && sectionItems.length === 0) {
        data.push({ type: "noRecommended", key: `norec-${originalIndex}` })
      }
      if (isExpanded && loadingMenuItems) {
        data.push({ type: "loading", key: `loading-${originalIndex}` })
      }
      if (isExpanded && sectionItems.length > 0) {
        const rows = []
        sectionItems.forEach((item) => {
          const currentItemIndex = overallItemCount++
          const isPriority = currentItemIndex < 5 || loadRemaining
          if (!isPriority) return
          rows.push({ type: "item", key: `item-${originalIndex}-${item.id}`, item, isRecommended, isPriority })
        })
        if (rows.length) rows[rows.length - 1].isLast = true
        data.push(...rows)
      }
      if (isExpanded && sectionSubsections.length > 0) {
        sectionSubsections.forEach((subsection, subIndex) => {
          const subsectionKey = `${originalIndex}-${subIndex}`
          const isSubsectionExpanded = expandedSections.has(subsectionKey)
          const subsectionItems = toRenderableArray(subsection?.items)
          data.push({
            type: "subHeader",
            key: `sub-${subsectionKey}`,
            subsection,
            subsectionKey,
            isSubsectionExpanded,
            first: subIndex === 0,
          })
          if (isSubsectionExpanded && subsectionItems.length > 0) {
            const rows = []
            subsectionItems.forEach((item) => {
              const currentItemIndex = overallItemCount++
              const isPriority = currentItemIndex < 5 || loadRemaining
              if (!isPriority) return
              rows.push({ type: "subItem", key: `subitem-${subsectionKey}-${item.id}`, item, isPriority })
            })
            if (rows.length) rows[rows.length - 1].isLast = true
            data.push(...rows)
          }
        })
      }

      out.push({ key: `menu-section-${originalIndex}-${sectionIndex}`, section, originalIndex, isExpanded, data })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSections, expandedSections, loadingMenuItems, loadRemaining])

  const scrollToMenuSection = useCallback(
    (sectionIndex) => {
      setLoadRemaining(true)
      setTimeout(() => {
        const idx = listSections.findIndex((entry) => entry.originalIndex === sectionIndex)
        if (idx < 0) return
        try {
          // scroll-mt-20: keep 80px above the section title
          listRef.current?.scrollToLocation?.({ sectionIndex: idx, itemIndex: 0, viewOffset: 80, animated: true })
        } catch (e) {
          debugWarn("scrollToLocation failed", e)
        }
      }, 300) // Small delay to allow sheet to close
    },
    [listSections],
  )

  // Show loading state
  if (loadingRestaurant || loadingOffers) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
        <RestaurantDetailSkeleton />
      </Screen>
    )
  }

  // Show error state if restaurant not found or network error
  if (restaurantError && !restaurant) {
    const isNetworkError = restaurantError === NO_INTERNET_MESSAGE || restaurantError === SERVER_UNREACHABLE_MESSAGE
    const isNotFoundError = restaurantError === 'Restaurant not found'

    return (
      <Screen bg={colors.gray[50]}>
        <AnimatedPage style={s.errorPage}>
          <View style={{ alignItems: "center", gap: sp(4) }}>
            <AlertCircle size={48} color={isNetworkError ? RED : colors.red[500]} />
            <View style={{ alignItems: "center" }}>
              <Text style={s.errorTitle}>
                {isNetworkError ? 'Connection Error' : isNotFoundError ? 'Restaurant not found' : 'Error'}
              </Text>
              <Text style={s.errorText}>{restaurantError}</Text>
              <Button onPress={goBack} variant="outline">
                <Text style={s.outlineBtnText}>Go Back</Text>
              </Button>
            </View>
          </View>
        </AnimatedPage>
      </Screen>
    )
  }

  // Show error if restaurant is still null
  if (!restaurant) {
    return (
      <Screen bg={colors.gray[50]}>
        <AnimatedPage style={s.errorPage}>
          <View style={{ alignItems: "center", gap: sp(4) }}>
            <AlertCircle size={48} color={colors.red[500]} />
            <Text style={{ ...fontSize.sm, color: colors.gray[600] }}>Restaurant not found</Text>
            <Button onPress={goBack} variant="outline">
              <Text style={s.outlineBtnText}>Go Back</Text>
            </Button>
          </View>
        </AnimatedPage>
      </Screen>
    )
  }

  const availabilityStatus = getRestaurantAvailabilityStatus(restaurant, new Date(availabilityTick))
  const isRestaurantOffline = !availabilityStatus.isOpen
  const shouldShowGrayscale = isOutOfService || isRestaurantOffline

  if (showMoreInfo) {
    const ownerName = restaurant?.ownerName || "";
    const gstNumber = typeof restaurant?.gstNumber === "string" ? restaurant.gstNumber.trim() : "";
    const fssaiNumber = restaurant?.fssaiNumber || "";
    const address = restaurant?.location || "";
    const phone = restaurant?.phone || "";

    const maskGST = (gst) => {
      if (!gst) return "";
      const trimmed = gst.trim();
      if (trimmed.length < 15) return trimmed;
      return trimmed.substring(0, 2) + "X".repeat(10) + trimmed.substring(12);
    };

    const formatTimeLabel = (timeValue) => {
      if (!timeValue) return "";
      const parts = timeValue.split(":");
      if (parts.length < 2) return timeValue;
      let hour = parseInt(parts[0], 10);
      const minute = parseInt(parts[1], 10);
      if (isNaN(hour) || isNaN(minute)) return timeValue;
      const period = hour >= 12 ? "pm" : "am";
      const hour12 = hour % 12 || 12;
      const formattedMin = String(minute).padStart(2, "0");
      return `${hour12}:${formattedMin} ${period}`;
    };

    const getProvidesText = () => {
      const isDiningEnabled = restaurant?.diningSettings?.isEnabled === true;
      const isTakeawayEnabled = restaurant?.takeawaySettings?.isEnabled === true;

      const services = ["delivery"];
      if (isDiningEnabled) services.push("dining");
      if (isTakeawayEnabled) services.push("takeaway");

      if (services.length === 1) {
        return "Provides delivery";
      } else if (services.length === 2) {
        return `Provides both ${services[0]} & ${services[1]}`;
      } else {
        return `Provides ${services[0]}, ${services[1]} & ${services[2]}`;
      }
    };

    // legal rows: last:border-b-0 last:pb-0
    const legalRows = [
      { key: "legal", label: "Legal Name", value: ownerName || "Not Provided", wide: false },
      ...(gstNumber ? [{ key: "gst", label: "GST Number", value: maskGST(gstNumber), wide: true }] : []),
    ]

    return (
      <Screen bg={t.dark ? "#0f0f0f" : colors.gray[50]}>
        <AnimatedPage style={{ flex: 1, backgroundColor: t.dark ? "#0f0f0f" : colors.gray[50] }}>
          {/* Header - Back arrow */}
          <View style={s.infoHeader}>
            <Button variant="outline" size="icon" style={s.roundIconBtn} onPress={() => setShowMoreInfo(false)}>
              <ArrowLeft size={20} color={t.dark ? colors.white : colors.gray[900]} />
            </Button>
          </View>

          {/* Content Section */}
          <ScrollView contentContainerStyle={s.infoContent}>
            {/* Card 1: Restaurant Info & Call Button & Timings */}
            <View style={s.infoCard}>
              <Text style={s.infoName}>{restaurant?.name || "Restaurant Name"}</Text>

              <Text style={s.infoAddress}>{address}</Text>

              {phone ? (
                <View style={s.callRow}>
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
                    accessibilityLabel={`Call ${restaurant?.name}`}
                    style={({ pressed }) => [s.callBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    <Phone size={20} color={RED} />
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.callTitle}>Contact to restaurant</Text>
                    <Text style={s.callSub}>
                      Contact restaurant directly for any inquiries, order updates, or support
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Separator line & Timings / Provisions */}
              <View style={s.infoTimings}>
                {/* Timing info */}
                <View style={s.infoLine}>
                  <Clock size={16} color={t.dark ? colors.gray[400] : colors.gray[500]} style={{ marginTop: 2 }} />
                  {availabilityStatus?.isOpen ? (
                    <Text style={s.infoLineText}>
                      <Text style={{ color: t.dark ? colors.green[500] : colors.green[600], fontWeight: "600" }}>Open now</Text>
                      {availabilityStatus?.closingTime ? <Text> • Closes {formatTimeLabel(availabilityStatus.closingTime)}</Text> : null}
                    </Text>
                  ) : (
                    <Text style={s.infoLineText}>
                      <Text style={{ color: t.dark ? colors.red[500] : colors.red[600], fontWeight: "600" }}>Closed now</Text>
                      {availabilityStatus?.openingTime ? <Text> • Opens at {formatTimeLabel(availabilityStatus.openingTime)}</Text> : null}
                    </Text>
                  )}
                </View>

                {/* Service info */}
                <View style={s.infoLine}>
                  <Store size={16} color={t.dark ? colors.gray[400] : colors.gray[500]} style={{ marginTop: 2 }} />
                  <Text style={s.infoLineText}>{getProvidesText()}</Text>
                </View>
              </View>
            </View>

            {/* Card 2: Legal Details Card */}
            <View style={[s.infoCard, { marginTop: sp(4), gap: sp(4) }]}>
              {legalRows.map((row, i) => {
                const isLast = i === legalRows.length - 1 && !fssaiNumber
                return (
                  <View key={row.key} style={isLast ? null : s.legalRow}>
                    <Text style={s.legalLabel}>{row.label}</Text>
                    <Text style={[s.legalValue, row.wide && { letterSpacing: 0.4 }]}>{row.value}</Text>
                  </View>
                )
              })}

              {/* FSSAI Lic No */}
              {fssaiNumber ? (
                <View style={{ paddingTop: sp(1) }}>
                  <AppImage src={fssaiLogo} style={{ height: 32, width: 64, opacity: 0.8 }} contentFit="contain" contentPosition="left" />
                  <Text style={s.fssaiNo}>Lic. No. {fssaiNumber}</Text>
                </View>
              ) : null}
            </View>

            {/* Go back to menu button */}
            <View style={{ marginTop: sp(8) }}>
              <Pressable
                onPress={() => setShowMoreInfo(false)}
                style={({ pressed }) => [s.backToMenuBtn, pressed && { backgroundColor: "#B91C1C", transform: [{ scale: 0.98 }] }]}
              >
                <Text style={s.backToMenuText}>Go back to menu</Text>
              </Pressable>
            </View>
          </ScrollView>
        </AnimatedPage>
      </Screen>
    )
  }

  const restaurantIdForFavorites = restaurant?.restaurantId || restaurant?._id || restaurant?.id
  const chipText = t.dark ? colors.white : colors.gray[900]

  // ------------------------------------------------------------ list header: top bar, summary, offers, chips
  const renderOffersStrip = () => {
    // Determine if restaurant has any dishes (after menu loads)
    const totalDishCount = !loadingMenuItems && restaurant?.menuSections
      ? restaurant.menuSections.reduce((sum, sec) => sum + (sec.items?.length || 0), 0)
      : null // null = still loading / unknown
    const restaurantHasDishes = totalDishCount === null ? true : totalDishCount > 0

    if (!restaurantHasDishes) return null

    if (loadingOffers) return (
      // Skeleton placeholder - shows immediately while offers load
      <View style={s.offersStrip}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), flex: 1, marginRight: sp(4) }}>
          <Skeleton width={24} height={24} rounded={12} />
          <Skeleton width={160} height={14} rounded={radius.sm} />
        </View>
        <Skeleton width={56} height={12} rounded={radius.sm} />
      </View>
    )

    if (!coupons || coupons.length === 0) return null

    return (
      <Pressable
        onPress={() => setShowOffersSheet(true)}
        style={({ pressed }) => [s.offersStrip, pressed && { backgroundColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[50] }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), overflow: "hidden", flex: 1, marginRight: sp(4) }}>
          <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
            <ScallopBadge size={24} />
          </View>
          <View style={{ flex: 1, height: 20, overflow: "hidden", justifyContent: "center", minWidth: 0 }}>
            <FadeSwapText text={formatCouponStripText(coupons[currentCouponIndex])} style={s.couponStripText} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1), paddingLeft: sp(2), flexShrink: 0 }}>
          <Text style={s.offerCount}>{coupons.length} offer{coupons.length > 1 ? "s" : ""}</Text>
          <ChevronDown size={16} color={s.offerCount.color} />
        </View>
      </Pressable>
    )
  }

  const listHeader = (
    <View>
      {/* Header - Back, Search, Menu */}
      <View style={s.topBar}>
        {/* Back Button */}
        <Button variant="outline" size="icon" style={s.roundIconBtn} onPress={goBack}>
          <ArrowLeft size={20} color={chipText} />
        </Button>

        {/* Right side: Search pill + menu */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3), flexShrink: 1 }}>
          {!showSearch ? (
            <Button variant="outline" style={s.searchPill} onPress={() => setShowSearch(true)}>
              <Search size={16} color={chipText} />
              <Text style={[s.searchPillText, { color: chipText }]}>Search</Text>
            </Button>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), flex: 1, maxWidth: 448 }}>
              <View style={{ flex: 1, justifyContent: "center" }}>
                <View style={s.searchIconLeft} pointerEvents="none">
                  <Search size={16} color={colors.gray[400]} />
                </View>
                <TextInput
                  placeholder="Search for dishes..."
                  placeholderTextColor={colors.gray[400]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={s.searchInput}
                  autoFocus
                  returnKeyType="search"
                  selectionColor={RED}
                  onBlur={() => {
                    if (!searchQuery) {
                      setShowSearch(false)
                    }
                  }}
                />
                {searchQuery ? (
                  <Pressable
                    onPress={() => {
                      setSearchQuery("")
                      setShowSearch(false)
                    }}
                    hitSlop={8}
                    style={s.searchClear}
                  >
                    <X size={16} color={colors.gray[400]} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
          <Button variant="outline" size="icon" style={s.roundIconBtn} onPress={() => setShowMenuOptionsSheet(true)}>
            <MoreVertical size={20} color={chipText} />
          </Button>
        </View>
      </View>

      {/* Main Content Card */}
      <View style={s.mainCard}>
        {/* Restaurant Summary */}
        <View style={s.summaryCard}>
          <LinearGradient
            colors={[RED, "#8a4b77", "#b36b8f"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.summaryBar}
          />
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.restaurantName}>{restaurant?.name || "Unknown Restaurant"}</Text>
              <View style={s.cuisineRow}>
                <Utensils size={16} color={s.metaText.color} />
                <Text style={s.metaText}>{restaurant?.topCategory || restaurant?.cuisine || "Multi-cuisine"}</Text>
              </View>
            </View>
            <View style={{ alignItems: "center" }}>
              <View style={s.ratingPill}>
                <Star size={12} color={colors.white} fill={colors.white} />
                <Text style={s.ratingPillText}>
                  {Number(restaurant?.rating || 0) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
                </Text>
              </View>
              <Text style={s.ratingsCount} numberOfLines={1}>
                {Number(restaurant?.rating || 0) > 0 ? (
                  restaurant.reviews === 1
                    ? "1 rating"
                    : `${(restaurant.reviews || 0).toLocaleString()}${restaurant.reviews >= 100 ? '+' : ''} ratings`
                ) : "No ratings yet"}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3) }}>
            <Pressable style={s.locationBtn} onPress={() => setShowLocationSheet(true)}>
              <MapPin size={16} color={s.metaText.color} />
              <Text style={[s.metaText, { flexShrink: 1 }]} numberOfLines={1}>
                {[restaurant?.distance, restaurant?.location || "Location"].filter(Boolean).join(" | ")}
              </Text>
              <ChevronDown size={16} color={colors.gray[500]} />
            </Pressable>
            <View style={[s.openBadge, { backgroundColor: isRestaurantOffline ? colors.rose[600] : "#257d3c" }]}>
              {isRestaurantOffline ? (
                <Text style={s.openBadgeText}>Offline</Text>
              ) : (
                <>
                  <Text style={s.openBadgeText}>Open</Text>
                  <Text style={s.openBadgeText}>now</Text>
                </>
              )}
            </View>
          </View>

          <View style={s.cuisineRow}>
            <Clock size={16} color={s.metaText.color} />
            <Text style={s.metaText}>{restaurant?.deliveryTime || "25-30 mins"}</Text>
          </View>
        </View>

        {isRestaurantOffline && (
          <View style={s.offlineBanner}>
            <Text style={s.offlineBannerText}>
              {restaurant?.name || "This restaurant"} is currently offline. Orders are unavailable right now.
            </Text>
          </View>
        )}

        {/* Offers strip — only shown when restaurant has dishes */}
        {renderOffersStrip()}

        {/* Filter/Category Buttons */}
        {restaurant?.menuSections && Array.isArray(restaurant.menuSections) && restaurant.menuSections.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[s.chipsScroller, { flexGrow: 0 }]}
            contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(3) }}
          >
            <View style={{ gap: sp(2) }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                <Button variant="outline" size="sm" style={s.filterChip} onPress={() => setShowFilterSheet(true)}>
                  <SlidersHorizontal size={16} color={chipText} />
                  <Text style={[s.chipText, { color: chipText }]}>Filters</Text>
                  {activeFilterCount > 0 && (
                    <View style={s.filterBadge}>
                      <Text style={s.filterBadgeText}>{activeFilterCount}</Text>
                    </View>
                  )}
                  <ChevronDown size={12} color={chipText} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  style={[s.filterChip, s.roundChip, filters.vegNonVeg === "veg" && s.vegChipActive]}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      vegNonVeg: prev.vegNonVeg === "veg" ? null : "veg",
                    }))
                  }
                >
                  <View style={[s.dot12, { backgroundColor: colors.green[600] }]} />
                  <Text
                    style={[
                      s.chipText,
                      { color: chipText },
                      filters.vegNonVeg === "veg" && { color: t.dark ? colors.green[400] : colors.green[700], fontWeight: "700" },
                    ]}
                  >
                    Veg
                  </Text>
                  {filters.vegNonVeg === "veg" && <X size={12} color={t.dark ? colors.gray[400] : colors.gray[600]} />}
                </Button>
                {!vegMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    style={[s.filterChip, s.roundChip, filters.vegNonVeg === "non-veg" && s.nonVegChipActive]}
                    onPress={() =>
                      setFilters((prev) => ({
                        ...prev,
                        vegNonVeg: prev.vegNonVeg === "non-veg" ? null : "non-veg",
                      }))
                    }
                  >
                    <View style={[s.dot12, { backgroundColor: colors.red[600] }]} />
                    <Text
                      style={[
                        s.chipText,
                        { color: chipText },
                        filters.vegNonVeg === "non-veg" && { color: t.dark ? colors.red[400] : colors.red[600] },
                      ]}
                    >
                      Non-veg
                    </Text>
                    {filters.vegNonVeg === "non-veg" && <X size={12} color={t.dark ? colors.gray[400] : colors.gray[600]} />}
                  </Button>
                )}
              </View>

              {menuCategories.length > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                  <Pressable
                    onPress={() => setSelectedMenuCategory("all")}
                    style={[s.catChip, selectedMenuCategory === "all" ? s.catChipActive : s.catChipIdle]}
                  >
                    <Text style={[s.catChipText, selectedMenuCategory === "all" ? { color: RED } : s.catChipIdleText]}>All</Text>
                  </Pressable>
                  {menuCategories.map((category) => (
                    <Pressable
                      key={category.id}
                      onPress={() => setSelectedMenuCategory(category.id)}
                      style={[s.catChip, selectedMenuCategory === category.id ? s.catChipActive : s.catChipIdle]}
                    >
                      {category.image ? (
                        <CategoryThumb src={category.image} style={s.catThumb} />
                      ) : (
                        <View style={s.catInitial}>
                          <Text style={s.catInitialText}>{category.name?.charAt(0) || "C"}</Text>
                        </View>
                      )}
                      <Text style={[s.catChipText, selectedMenuCategory === category.id ? { color: RED } : s.catChipIdleText]}>
                        {category.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  )

  // ------------------------------------------------------------ dish rows
  const renderStepperOrAdd = (item, quantity, animatedVariant) => {
    if (quantity > 0) {
      const Wrapper = animatedVariant ? PopIn : View
      return (
        <View style={s.addBtnAnchor} pointerEvents="box-none">
          <Wrapper style={[s.stepper, shouldShowGrayscale && s.stepperDisabled]}>
            <Pressable
              hitSlop={6}
              onPress={(e) => {
                if (shouldShowGrayscale) return
                const sole = getSoleActiveVariant(item)
                if (hasFoodVariants(item) && !sole) {
                  handleItemClick(item)
                } else {
                  updateItemQuantity(item, Math.max(0, quantity - 1), e, sole)
                }
              }}
              disabled={shouldShowGrayscale}
            >
              <Minus size={14} color={shouldShowGrayscale ? colors.gray[400] : RED} />
            </Pressable>
            <Text style={[s.stepperQty, shouldShowGrayscale && { color: colors.gray[400] }]}>{quantity}</Text>
            <Pressable
              hitSlop={6}
              onPress={(e) => {
                if (shouldShowGrayscale) return
                const sole = getSoleActiveVariant(item)
                if (hasFoodVariants(item) && !sole) {
                  handleItemClick(item)
                } else {
                  updateItemQuantity(item, quantity + 1, e, sole)
                }
              }}
              disabled={shouldShowGrayscale}
            >
              <Plus size={14} strokeWidth={3} color={shouldShowGrayscale ? colors.gray[400] : RED} />
            </Pressable>
          </Wrapper>
        </View>
      )
    }
    const Wrapper = animatedVariant ? PopIn : View
    return (
      <View style={s.addBtnAnchor} pointerEvents="box-none">
        <Wrapper {...(animatedVariant ? { from: 0.9, spring: true } : {})}>
          <Pressable
            onPress={(e) => {
              if (shouldShowGrayscale) return
              // Dishes with variants: let the user pick one first.
              if (hasFoodVariants(item)) {
                handleItemClick(item, e)
              } else {
                updateItemQuantity(item, 1, e, null)
              }
            }}
            disabled={shouldShowGrayscale}
            style={({ pressed }) => [
              s.addBtn,
              shouldShowGrayscale && s.addBtnDisabled,
              pressed && !shouldShowGrayscale && { backgroundColor: "#FFF5F5", transform: [{ scale: 0.95 }] },
            ]}
          >
            <Text style={[s.addBtnText, shouldShowGrayscale && { color: colors.gray[400] }]}>ADD</Text>
            <Plus size={14} strokeWidth={3} color={shouldShowGrayscale ? colors.gray[400] : RED} />
          </Pressable>
        </Wrapper>
      </View>
    )
  }

  const renderDish = (row) => {
    const { item, isRecommended, isPriority, isLast, type } = row
    const isSub = type === "subItem"
    const quantity = getDishQuantity(item)
    // Determine veg/non-veg based on foodType
    const isVeg = item.foodType === "Veg"
    const highlighted = highlightedDishId === item.id && (isSub || isRecommended)
    const favored = isDishFavorite(item.id, restaurantIdForFavorites)
    const vegColor = isSub ? (isVeg ? "#8CC63F" : RED) : (isVeg ? colors.green[600] : colors.red[600])

    return (
      <View
        style={[
          s.dishRow,
          highlighted && !isSub ? s.dishRowNoBorder : isLast ? s.dishRowNoBorder : s.dishRowBorder,
          highlighted && { backgroundColor: alpha(RED, t.dark ? 0.0625 : 0.02), borderRadius: radius["2xl"] },
          highlighted && isSub && { borderWidth: 2, borderColor: RED },
        ]}
      >
        {/* Vibrant Red Background Gradient Highlight - Recommended Section Only */}
        {highlighted && !isSub && <DishHighlight dark={t.dark} />}

        {/* Left Side - Details */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.dishTitleRow}>
            <View style={[s.vegBox, { borderColor: vegColor }]}>
              <View style={[s.vegDot, { backgroundColor: vegColor }]} />
            </View>
            <Text style={s.dishName}>{item.name}</Text>
          </View>

          <View style={{ gap: 2, marginTop: sp(1) }}>
            {hasFoodVariants(item) && <Text style={s.startingFrom}>Starting from</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
              <Text style={s.dishPrice}>₹{Math.round(getFoodDisplayPrice(item))}</Text>
              {/* Preparation Time - Show if available */}
              {item.preparationTime && String(item.preparationTime).trim() ? (
                <View style={s.prepPill}>
                  <Clock size={12} color={colors.gray[500]} />
                  <Text style={s.prepText}>{String(item.preparationTime).trim()}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Description - Show if available */}
          {item.description ? (
            <Text style={s.dishDesc} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {/* Mobile action buttons */}
          <View style={{ flexDirection: "row", gap: sp(4), marginTop: sp(3) }}>
            <Pressable
              onPress={() => handleBookmarkClick(item)}
              style={[s.iconSquare, favored ? s.iconSquareActive : null]}
            >
              <Bookmark
                size={18}
                color={favored ? colors.red[500] : t.dark ? colors.gray[400] : colors.gray[600]}
                fill={favored ? colors.red[500] : "none"}
              />
            </Pressable>
            <Pressable onPress={() => handleShareClick(item)} style={s.iconSquare}>
              <Share2 size={18} color={t.dark ? colors.gray[400] : colors.gray[600]} />
            </Pressable>
          </View>
        </View>

        {/* Right Side - Image and Add Button */}
        <View style={s.dishMedia}>
          <Pressable
            onPress={(e) => handleItemClick(item, e)}
            style={s.dishImageBtn}
            accessibilityLabel={`View ${item.name} details`}
          >
            <OptimizedImage
              src={item.image || FOOD_IMAGE_FALLBACK}
              alt={item.name}
              priority={isPriority}
              style={s.dishImage}
              objectFit="cover"
              fallbackImage={FOOD_IMAGE_FALLBACK}
            />
          </Pressable>
          {renderStepperOrAdd(item, quantity, isSub)}
        </View>
      </View>
    )
  }

  const renderRow = ({ item: row }) => {
    if (row.type === "noRecommended") {
      return (
        <View style={{ paddingVertical: sp(8), paddingHorizontal: sp(4), alignItems: "center" }}>
          <Text style={{ ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500] }}>No dish recommended</Text>
        </View>
      )
    }
    if (row.type === "loading") {
      return (
        <View style={{ gap: sp(3), paddingHorizontal: sp(5), paddingVertical: sp(2) }}>
          <Skeleton height={96} rounded={radius["2xl"]} style={{ backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }} />
          <Skeleton height={96} rounded={radius["2xl"]} style={{ backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }} />
        </View>
      )
    }
    if (row.type === "subHeader") {
      return (
        <View style={[s.subHeader, { marginTop: row.first ? 0 : sp(4) }]}>
          <Text style={s.subTitle}>{row.subsection?.name || row.subsection?.title || "Subsection"}</Text>
          <Pressable
            hitSlop={6}
            onPress={() => {
              setExpandedSections(prev => {
                const newSet = new Set(prev)
                if (newSet.has(row.subsectionKey)) {
                  newSet.delete(row.subsectionKey)
                } else {
                  newSet.add(row.subsectionKey)
                }
                return newSet
              })
            }}
            style={({ pressed }) => [s.chevronBtn, pressed && s.chevronBtnPressed]}
          >
            <ChevronDown
              size={16}
              color={t.dark ? colors.gray[400] : colors.gray[500]}
              style={{ transform: [{ rotate: row.isSubsectionExpanded ? "0deg" : "-90deg" }] }}
            />
          </Pressable>
        </View>
      )
    }
    return <View style={{ paddingHorizontal: sp(4) }}>{renderDish(row)}</View>
  }

  const renderSectionHeader = ({ section: entry }) => {
    const { section, originalIndex, isExpanded } = entry
    return (
      <View style={[s.sectionHeader, { marginTop: sp(6) }]}>
        <View style={{ gap: sp(1), flex: 1 }}>
          <Text style={s.sectionTitle}>
            {(section?.name && typeof section.name === 'string' && section.name.trim())
              ? section.name.trim()
              : (section?.title && typeof section.title === 'string' && section.title.trim())
                ? section.title.trim()
                : "Unnamed Section"}
          </Text>
          {section.subtitle ? (
            <Pressable>
              <Text style={s.sectionSubtitle}>{section.subtitle}</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          hitSlop={6}
          onPress={() => {
            setExpandedSections(prev => {
              const newSet = new Set(prev)
              if (newSet.has(originalIndex)) {
                newSet.delete(originalIndex)
              } else {
                newSet.add(originalIndex)
              }
              return newSet
            })
          }}
          style={({ pressed }) => [s.chevronBtn, pressed && s.chevronBtnPressed]}
        >
          <ChevronDown
            size={20}
            color={t.dark ? colors.gray[400] : colors.gray[600]}
            style={{ transform: [{ rotate: isExpanded ? "0deg" : "-90deg" }] }}
          />
        </Pressable>
      </View>
    )
  }

  const renderEmpty = () => {
    if (filteredSections.length === 0 && hasUserAppliedFilters) {
      return (
        <View style={s.emptyFiltered}>
          <Text style={s.emptyFilteredTitle}>No dishes match the selected filters.</Text>
          <Text style={s.emptyFilteredSub}>Clear filters or try a different combination.</Text>
        </View>
      )
    }
    if (filteredSections.length === 0 && !hasUserAppliedFilters && !loadingMenuItems) {
      // Check if the raw menu has any dishes at all (before veg filtering)
      const rawSections = restaurant?.menuSections || [];
      const rawHasAnyDish = rawSections.some(sec =>
        (Array.isArray(sec?.items) && sec.items.length > 0) ||
        (Array.isArray(sec?.subsections) && sec.subsections.some(sub => Array.isArray(sub?.items) && sub.items.length > 0))
      );
      const showNoVegMessage = vegMode && rawHasAnyDish;

      return (
        <View style={s.emptyMenu}>
          <View style={s.emptyMenuIcon}>
            <Utensils size={48} color={colors.gray[400]} />
          </View>
          {showNoVegMessage ? (
            <>
              <Text style={s.emptyMenuTitle}>No Veg Dishes Available</Text>
              <Text style={s.emptyMenuText}>
                {restaurant?.name || "This restaurant"} doesn't have any veg dishes on their menu right now.
              </Text>
            </>
          ) : (
            <>
              <Text style={s.emptyMenuTitle}>Menu Coming Soon</Text>
              <Text style={s.emptyMenuText}>
                {restaurant?.name || "This restaurant"} is still setting up their menu. We'll notify you as soon as their delicious dishes are available!
              </Text>
            </>
          )}
        </View>
      )
    }
    return null
  }

  const listFooter = (
    <View style={{ paddingTop: sp(6) }}>
      {/* FSSAI License Information - Bottom of page */}
      {restaurant?.onboarding?.step3?.fssai?.registrationNumber ? (
        <View style={[s.fssaiFooter, { marginBottom: 96 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: sp(4) }}>
            <View style={s.fssaiLogoBox}>
              <AppImage src={fssaiLogo} style={{ width: "100%", height: "100%" }} contentFit="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fssaiFooterLabel}>License No.</Text>
              <Text style={s.fssaiFooterValue}>{restaurant?.onboarding?.step3?.fssai?.registrationNumber}</Text>
            </View>
          </View>
        </View>
      ) : (
        // room for the floating Menu button / cart pill (the web page ends here; overlays float above it)
        <View style={{ height: 96 }} />
      )}
    </View>
  )

  // Variant / quantity popup price
  const detailVariant = selectedItem ? getVariantForDish(selectedItem, selectedVariantId) : null
  const detailInCart = selectedItem ? getDishQuantity(selectedItem, selectedVariantId) : 0

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
      <AnimatedPage
        instant
        style={[{ flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white }, shouldShowGrayscale && s.grayscale]}
      >
        <SectionList
          ref={listRef}
          sections={listSections}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={listFooter}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={11}
          onScrollBeginDrag={() => {
            if (!loadRemaining) setLoadRemaining(true)
          }}
          onScrollToIndexFailed={(info) => {
            listRef.current?.getScrollResponder?.()?.scrollTo?.({ y: info.averageItemLength * info.index, animated: false })
          }}
        />

        {/* Floating Menu Button (draggable) */}
        {!showFilterSheet && !showMenuSheet && !showMenuOptionsSheet && restaurant && filteredSections.length > 0 && (
          <DraggableMenuButton
            windowSize={windowSize}
            buttonWidth={menuButtonWidth}
            buttonHeight={menuButtonHeight}
            bottom={itemCount > 0 ? 150 : 80}
            onLayoutSize={(layout) => {
              if (layout.width && layout.width !== menuButtonWidth) setMenuButtonWidth(layout.width)
              if (layout.height && layout.height !== menuButtonHeight) setMenuButtonHeight(layout.height)
            }}
          >
            <Button size="lg" style={s.menuFab} onPress={() => setShowMenuSheet(true)}>
              <Utensils size={20} color={colors.white} />
              <Text style={s.menuFabText}>Menu</Text>
            </Button>
          </DraggableMenuButton>
        )}

        {/* Add to Cart Animation Component */}
        <AddToCartAnimation bottomOffset={80} linkTo="/food/user/cart" hideOnPages={true} />
      </AnimatedPage>

      {/* Menu Categories Bottom Sheet */}
      <Sheet open={showMenuSheet} onClose={() => setShowMenuSheet(false)} backdropOpacity={0.4} style={[s.sheet, { maxHeight: windowHeight * 0.85 }]}>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(6), gap: sp(1) }}>
          {menuCategories.map((category, index) => (
            <Pressable
              key={index}
              style={({ pressed }) => [s.menuSheetRow, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}
              onPress={() => {
                setShowMenuSheet(false)
                // Scroll to category section
                scrollToMenuSection(category.sectionIndex)
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3), minWidth: 0, flex: 1 }}>
                {category.image ? (
                  <CategoryThumb src={category.image} style={s.menuSheetThumb} />
                ) : (
                  <View style={s.menuSheetInitial}>
                    <Text style={s.menuSheetInitialText}>{category.name?.charAt(0) || "C"}</Text>
                  </View>
                )}
                <Text style={s.menuSheetName} numberOfLines={1}>{category.name}</Text>
              </View>
              <Text style={s.menuSheetCount}>{category.count}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Close Button */}
        <View style={s.sheetFooter}>
          <Button style={s.redWideBtn} onPress={() => setShowMenuSheet(false)}>
            <X size={16} color={colors.white} />
            <Text style={s.redWideBtnText}>Close</Text>
          </Button>
        </View>
      </Sheet>

      {/* Filters and Sorting Bottom Sheet */}
      <Sheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)} backdropOpacity={0.4} style={[s.sheet, { height: windowHeight * 0.8 }]}>
        {/* Header with X button */}
        <View style={s.filterHeader}>
          <Text style={s.filterTitle}>Filters and Sorting</Text>
          <Pressable onPress={() => setShowFilterSheet(false)} style={({ pressed }) => [s.circleBtn, pressed && s.chevronBtnPressed]}>
            <X size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
          </Pressable>
        </View>

        {/* Scrollable Content */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(3), gap: sp(4) }}>
          {/* Sort by */}
          <View style={{ gap: sp(2) }}>
            <Text style={s.filterGroupTitle}>Sort by:</Text>
            <View style={{ gap: 6 }}>
              {[
                { id: "low-to-high", label: "Price - low to high" },
                { id: "high-to-low", label: "Price - high to low" },
              ].map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      sortBy: prev.sortBy === opt.id ? null : opt.id,
                    }))
                  }
                  style={[s.filterOption, filters.sortBy === opt.id ? s.filterOptionBlue : s.filterOptionIdle]}
                >
                  <Text style={[s.filterOptionText, filters.sortBy === opt.id ? { color: t.dark ? colors.blue[400] : colors.blue[700] } : s.filterOptionIdleText]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Veg/Non-veg preference */}
          <View style={{ gap: sp(2) }}>
            <Text style={s.filterGroupTitle}>Veg/Non-veg preference:</Text>
            <View style={{ flexDirection: "row", gap: sp(2) }}>
              <Pressable
                onPress={() =>
                  setFilters((prev) => ({
                    ...prev,
                    vegNonVeg: prev.vegNonVeg === "veg" ? null : "veg",
                  }))
                }
                style={[s.filterOption, s.filterOptionRow, { flex: 1 }, filters.vegNonVeg === "veg" ? s.filterOptionGreen : s.filterOptionIdle]}
              >
                <View style={[s.dot16, { backgroundColor: t.dark ? colors.green[500] : colors.green[600] }]} />
                <Text style={[s.filterOptionText, { fontWeight: "500" }, filters.vegNonVeg === "veg" ? { color: t.dark ? colors.green[400] : colors.green[700] } : s.filterOptionIdleText]}>
                  Veg
                </Text>
              </Pressable>
              {!vegMode && (
                <Pressable
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      vegNonVeg: prev.vegNonVeg === "non-veg" ? null : "non-veg",
                    }))
                  }
                  style={[s.filterOption, s.filterOptionRow, { flex: 1 }, filters.vegNonVeg === "non-veg" ? s.filterOptionRedNv : s.filterOptionIdle]}
                >
                  <View style={[s.dot16, { backgroundColor: colors.red[600] }]} />
                  <Text style={[s.filterOptionText, { fontWeight: "500" }, filters.vegNonVeg === "non-veg" ? { color: t.dark ? colors.gray[300] : colors.red[600] } : s.filterOptionIdleText]}>
                    Non-veg
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Top picks */}
          <View style={{ gap: sp(2) }}>
            <Text style={s.filterGroupTitle}>Top picks:</Text>
            <Pressable
              onPress={() =>
                setFilters((prev) => ({
                  ...prev,
                  highlyReordered: !prev.highlyReordered,
                }))
              }
              style={[s.filterOption, s.filterOptionRow, filters.highlyReordered ? s.filterOptionBrand : s.filterOptionIdle]}
            >
              <RotateCcw size={16} color={filters.highlyReordered ? RED : s.filterOptionIdleText.color} />
              <Text style={[s.filterOptionText, { fontWeight: "500" }, filters.highlyReordered ? { color: RED } : s.filterOptionIdleText]}>
                Highly reordered
              </Text>
            </Pressable>
          </View>

          {/* Dietary preference */}
          <View style={{ gap: sp(2) }}>
            <Text style={s.filterGroupTitle}>Dietary preference:</Text>
            <Pressable
              onPress={() =>
                setFilters((prev) => ({
                  ...prev,
                  spicy: !prev.spicy,
                }))
              }
              style={[s.filterOption, s.filterOptionRow, filters.spicy ? s.filterOptionRed : s.filterOptionIdle]}
            >
              <Flame size={16} color={filters.spicy ? (t.dark ? colors.red[400] : colors.red[700]) : s.filterOptionIdleText.color} />
              <Text style={[s.filterOptionText, { fontWeight: "500" }, filters.spicy ? { color: t.dark ? colors.red[400] : colors.red[700] } : s.filterOptionIdleText]}>
                Spicy
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Bottom Action Bar */}
        <View style={[s.sheetFooter, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: sp(3) }]}>
          <Pressable
            onPress={() => {
              setFilters({
                sortBy: null,
                vegNonVeg: null,
                highlyReordered: false,
                spicy: false,
              })
            }}
          >
            <Text style={{ color: t.dark ? colors.red[400] : colors.red[600], fontWeight: "500", ...fontSize.sm }}>Clear All</Text>
          </Pressable>
          <Button style={s.applyBtn} onPress={() => setShowFilterSheet(false)}>
            <Text style={s.redWideBtnText}>Apply {activeFilterCount > 0 && `(${activeFilterCount})`}</Text>
          </Button>
        </View>
      </Sheet>

      {/* Location Outlets — centred modal */}
      <Dialog
        open={showLocationSheet}
        onClose={() => setShowLocationSheet(false)}
        backdropOpacity={0.4}
        style={[s.locationDialog, { width: windowWidth * 0.88, maxHeight: windowHeight * 0.8 }]}
      >
        {/* Header */}
        <View style={s.locationHeader}>
          <Text style={[s.filterTitle, { fontWeight: "700", flex: 1 }]}>{restaurant?.name || "Unknown Restaurant"}</Text>
          <Pressable onPress={() => setShowLocationSheet(false)} style={({ pressed }) => [s.smallCircleBtn, pressed && s.chevronBtnPressed]}>
            <X size={16} color={colors.gray[400]} />
          </Pressable>
        </View>

        {/* Outlets List */}
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: sp(4), paddingBottom: sp(4) }}>
          {restaurant?.outlets && Array.isArray(restaurant.outlets) && restaurant.outlets.length > 0 ? (
            <View style={{ gap: sp(2) }}>
              {restaurant.outlets.map((outlet, outletIndex) => (
                <View key={outlet?.id || `outlet-${outletIndex}`} style={s.outletCard}>
                  {outlet?.isNearest && (
                    <View style={s.nearestTag}>
                      <Zap size={14} color={RED} fill={RED} />
                      <Text style={s.nearestText}>Nearest available outlet</Text>
                    </View>
                  )}
                  <Text style={s.outletTitle}>{outlet?.location || "Location"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(4) }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
                      <View style={s.outletMeta}>
                        <Clock size={14} color={s.outletMetaText.color} />
                        <Text style={s.outletMetaText}>{outlet?.deliveryTime || "25-30 mins"}</Text>
                      </View>
                      <View style={s.outletMeta}>
                        <MapPin size={14} color={s.outletMetaText.color} />
                        <Text style={s.outletMetaText}>{outlet?.distance || "--"}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <View style={s.outletMeta}>
                        <Star size={14} color={t.dark ? colors.green[500] : "#8CC63F"} fill={t.dark ? colors.green[500] : "#8CC63F"} />
                        <Text style={[s.outletMetaText, { fontWeight: "500", color: t.dark ? colors.white : colors.gray[900] }]}>
                          {outlet?.rating ? outlet.rating : "NEW"}
                        </Text>
                      </View>
                      <Text style={[s.outletMetaText, { color: t.dark ? colors.gray[400] : colors.gray[500] }]}>
                        {(outlet?.reviews || 0) === 1 ? "1 rating" : (outlet?.reviews || 0) < 100
                          ? `${outlet?.reviews || 0} ratings`
                          : (outlet?.reviews || 0) < 1000
                            ? `${Math.floor((outlet?.reviews || 0) / 100) * 100}+ ratings`
                            : `${((outlet?.reviews || 0) / 1000).toFixed(1)}K+ ratings`}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ paddingTop: sp(1), paddingBottom: sp(3) }}>
              <Text style={s.addressLabel}>Restaurant Address</Text>
              <View style={s.addressBox}>
                <MapPin size={16} color={colors.red[500]} style={{ marginTop: 2 }} />
                <Text style={s.addressText}>{restaurant?.location || "Address not available"}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        {restaurant?.outlets && Array.isArray(restaurant.outlets) && restaurant.outlets.length > 5 && (
          <View style={[s.sheetFooter, { paddingVertical: sp(3) }]}>
            <Pressable style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(2) }}>
              <Text style={{ color: t.dark ? colors.red[400] : colors.red[600], fontWeight: "500", ...fontSize.sm }}>
                See all {restaurant.outlets.length} outlets
              </Text>
              <ChevronDown size={16} color={t.dark ? colors.red[400] : colors.red[600]} />
            </Pressable>
          </View>
        )}
      </Dialog>

      {/* Manage Collections Modal */}
      <Sheet open={showManageCollections} onClose={() => setShowManageCollections(false)} backdropOpacity={0.4} style={s.sheet}>
        {/* Header */}
        <View style={[s.filterHeader, { paddingTop: sp(6), paddingBottom: sp(4) }]}>
          <Text style={[s.filterTitle, { fontWeight: "700" }]}>Manage Collections</Text>
          <Pressable onPress={() => setShowManageCollections(false)} style={s.darkCircleBtn}>
            <X size={16} color={colors.white} />
          </Pressable>
        </View>

        {/* Collections List */}
        <View style={{ paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(2) }}>
          {/* Bookmarks Collection */}
          <View style={s.collectionRow}>
            <View style={s.collectionIcon}>
              <Bookmark size={24} color={t.dark ? colors.red[400] : colors.red[500]} fill={t.dark ? colors.red[400] : colors.red[500]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={s.collectionName}>Bookmarks</Text>
                {selectedItem && (
                  <Checkbox
                    checked={isDishFavorite(selectedItem.id, restaurantIdForFavorites)}
                    onCheckedChange={(checked) => {
                      if (!checked && selectedItem) {
                        const restaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id
                        removeDishFavorite(selectedItem.id, restaurantId)
                        setShowManageCollections(false)
                      }
                    }}
                    style={{ height: 20, width: 20, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.green[500] }}
                    checkedStyle={{ backgroundColor: colors.green[500], borderColor: colors.green[500] }}
                  />
                )}
                {!selectedItem && (
                  <View style={s.checkedBox}>
                    <Check size={12} color={colors.white} />
                  </View>
                )}
              </View>
              <Text style={s.collectionSub}>
                {getDishFavorites().length} dishes • {getFavorites().length} restaurant
              </Text>
            </View>
          </View>

          {/* Create new Collection */}
          <Pressable
            style={({ pressed }) => [s.collectionRow, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}
            onPress={() => setShowManageCollections(false)}
          >
            <View style={s.collectionIcon}>
              <Plus size={24} color={t.dark ? colors.red[400] : colors.red[500]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.collectionName}>Create new Collection</Text>
            </View>
          </Pressable>
        </View>

        {/* Done Button */}
        <View style={s.sheetFooter}>
          <Button style={[s.redWideBtn, { paddingVertical: sp(3), height: undefined }]} onPress={() => setShowManageCollections(false)}>
            <Text style={s.redWideBtnText}>Done</Text>
          </Button>
        </View>
      </Sheet>

      {/* Item Detail Modal */}
      <Dialog
        open={Boolean(showItemDetail && selectedItem)}
        onClose={closeItemDetail}
        backdropOpacity={0.5}
        style={[s.itemDialog, { maxHeight: windowHeight * 0.9 }]}
      >
        {selectedItem ? (
          <>
            {/* Close Button - Inside Top Right */}
            <Pressable onPress={closeItemDetail} style={s.itemClose}>
              <X size={20} color={colors.white} />
            </Pressable>

            {/* Image Section */}
            <View style={s.itemImageWrap}>
              <AppImage
                src={selectedItem.displayImage || selectedItem.image || FOOD_IMAGE_FALLBACK}
                fallback={FOOD_IMAGE_FALLBACK}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={0}
              />
            </View>

            {/* Content Section */}
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(4) }}>
              {/* Item Name and Indicator */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(3) }}>
                <View
                  style={[
                    s.itemVegBox,
                    t.dark
                      ? { borderColor: colors.gray[600], backgroundColor: alpha(colors.gray[900], 0.3) }
                      : selectedItem.foodType === "Veg"
                        ? { borderColor: colors.green[600], backgroundColor: colors.green[50] }
                        : { borderColor: colors.red[600], backgroundColor: colors.red[50] },
                  ]}
                >
                  <View style={[s.itemVegDot, { backgroundColor: selectedItem.foodType === "Veg" ? colors.green[600] : colors.red[600] }]} />
                </View>
                <Text style={s.itemName}>{selectedItem.name}</Text>
              </View>

              {/* Description */}
              <Text style={s.itemDesc}>{selectedItem.description}</Text>

              {/* Not Eligible for Coupons */}
              {selectedItem.notEligibleForCoupons ? (
                <Text style={s.notEligible}>NOT ELIGIBLE FOR COUPONS</Text>
              ) : null}

              {hasFoodVariants(selectedItem) && (
                <View style={{ marginBottom: sp(4) }}>
                  <Text style={s.chooseVariant}>Choose a variant</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp(2) }}>
                    {getFoodVariants(selectedItem).map((variant) => {
                      const active = String(selectedVariantId || "") === String(variant.id)
                      return (
                        <Pressable
                          key={variant.id}
                          onPress={() => {
                            setSelectedVariantId(variant.id)
                            setItemDetailQty(Math.max(1, getDishQuantity(selectedItem, variant.id)))
                          }}
                          style={[s.variantChip, active ? s.variantChipActive : s.variantChipIdle]}
                        >
                          <Text style={[s.variantChipText, active ? { color: t.dark ? colors.red[200] : colors.red[600] } : { color: t.dark ? colors.gray[300] : colors.gray[700] }]}>
                            {variant.name} · {RUPEE_SYMBOL}{Math.round(variant.price)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={s.itemBar}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                {/* Quantity Selector */}
                <View style={[s.qtyBox, shouldShowGrayscale && { opacity: 0.5 }]}>
                  {(() => {
                    const minusDisabled = shouldShowGrayscale || itemDetailQty <= (detailInCart > 0 ? 0 : 1)
                    return (
                      <Pressable
                        onPress={() => setItemDetailQty((q) => Math.max(0, q - 1))}
                        disabled={minusDisabled}
                        hitSlop={6}
                      >
                        <Minus size={20} color={minusDisabled ? (t.dark ? colors.gray[600] : colors.gray[300]) : (t.dark ? colors.gray[400] : colors.gray[600])} />
                      </Pressable>
                    )
                  })()}
                  <Text style={[s.qtyText, shouldShowGrayscale && { color: t.dark ? colors.gray[600] : colors.gray[400] }]}>
                    {itemDetailQty}
                  </Text>
                  <Pressable
                    onPress={() => setItemDetailQty((q) => Math.min(99, q + 1))}
                    disabled={shouldShowGrayscale}
                    hitSlop={6}
                  >
                    <Plus size={20} color={shouldShowGrayscale ? (t.dark ? colors.gray[600] : colors.gray[300]) : (t.dark ? colors.gray[400] : colors.gray[600])} />
                  </Pressable>
                </View>

                {/* Add Item Button — commits the picked variant + quantity */}
                <Button
                  style={[s.addItemBtn, shouldShowGrayscale ? s.addItemBtnDisabled : null]}
                  onPress={(e) => {
                    if (!shouldShowGrayscale) {
                      updateItemQuantity(
                        selectedItem,
                        itemDetailQty,
                        e,
                        getVariantForDish(selectedItem, selectedVariantId),
                      )
                      closeItemDetail()
                    }
                  }}
                  disabled={shouldShowGrayscale}
                >
                  <Text style={[s.addItemText, shouldShowGrayscale && s.addItemTextDisabled]} numberOfLines={1}>
                    {detailInCart > 0
                      ? (itemDetailQty === 0 ? "Remove" : "Update cart")
                      : "Add item"}
                  </Text>
                  <Text style={[s.addItemPrice, shouldShowGrayscale && s.addItemTextDisabled]} numberOfLines={1}>
                    {(() => {
                      const unitPrice = Number(detailVariant?.price ?? selectedItem.price) || 0
                      const totalText = `${RUPEE_SYMBOL}${Math.round(unitPrice * Math.max(1, itemDetailQty))}`
                      return detailVariant ? `${detailVariant.name} · ${totalText}` : totalText
                    })()}
                  </Text>
                </Button>
              </View>
            </View>
          </>
        ) : null}
      </Dialog>

      {/* Schedule Delivery Time Modal */}
      <Sheet open={showScheduleSheet} onClose={() => setShowScheduleSheet(false)} backdropOpacity={0.4} style={[s.sheet, s.sheetOverflow, { maxHeight: windowHeight * 0.6 }]}>
        {/* Close Button - Centered Overlapping */}
        <View style={s.scheduleCloseWrap} pointerEvents="box-none">
          <Pressable onPress={() => setShowScheduleSheet(false)} style={s.scheduleClose}>
            <X size={20} color={colors.white} />
          </Pressable>
        </View>

        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: sp(4), paddingTop: sp(10), paddingBottom: sp(4) }}>
          {/* Title */}
          <Text style={[s.filterTitle, { fontWeight: "700", marginBottom: sp(4), textAlign: "center" }]}>Select your delivery time</Text>

          {/* Date Selection */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: sp(3), paddingBottom: sp(2) }} style={[{ marginBottom: sp(4) }, { flexGrow: 0 }]}>
            {(() => {
              const today = new Date()
              const tomorrow = new Date(today)
              tomorrow.setDate(tomorrow.getDate() + 1)
              const dayAfter = new Date(today)
              dayAfter.setDate(dayAfter.getDate() + 2)

              const dates = [
                { date: today, label: "Today" },
                { date: tomorrow, label: "Tomorrow" },
                { date: dayAfter, label: dayAfter.toLocaleDateString('en-US', { weekday: 'short' }) }
              ]

              return dates.map((entry, index) => {
                const dateStr = entry.date.toISOString().split('T')[0]
                const day = String(entry.date.getDate()).padStart(2, '0')
                const month = entry.date.toLocaleDateString('en-US', { month: 'short' })
                const isSelected = selectedDate === dateStr

                return (
                  <Pressable key={index} onPress={() => setSelectedDate(dateStr)} style={{ alignItems: "center", gap: 2, paddingBottom: sp(1) }}>
                    <Text style={[{ ...fontSize.sm, fontWeight: "500" }, { color: isSelected ? (t.dark ? colors.white : colors.gray[900]) : (t.dark ? colors.gray[400] : colors.gray[500]) }]}>
                      {day} {month} {entry.label}
                    </Text>
                    {isSelected && <View style={{ height: 2, alignSelf: "stretch", backgroundColor: colors.red[500], marginTop: 2 }} />}
                  </Pressable>
                )
              })
            })()}
          </ScrollView>

          {/* Time Slot Selection */}
          <View style={{ gap: sp(2), marginBottom: sp(4) }}>
            {["6:30 - 7 PM", "7 - 7:30 PM", "7:30 - 8 PM", "8 - 8:30 PM"].map((slot, index) => {
              const isSelected = selectedTimeSlot === slot
              return (
                <Pressable
                  key={index}
                  onPress={() => setSelectedTimeSlot(slot)}
                  style={[s.slot, isSelected ? s.slotActive : s.slotIdle]}
                >
                  <Text style={[{ ...fontSize.sm, fontWeight: "500" }, { color: isSelected ? (t.dark ? colors.white : colors.gray[900]) : (t.dark ? colors.gray[300] : colors.gray[600]) }]}>
                    {slot}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </ScrollView>

        {/* Confirm Button - Fixed at bottom */}
        <View style={{ paddingHorizontal: sp(4), paddingBottom: sp(4), paddingTop: sp(2), borderTopWidth: 1, borderTopColor: colors.gray[100] }}>
          <Button
            style={[s.redWideBtn, { backgroundColor: colors.red[500], paddingVertical: sp(3), height: undefined }]}
            onPress={() => {
              setShowScheduleSheet(false)
              // Handle schedule confirmation
            }}
          >
            <Text style={[s.redWideBtnText, { fontWeight: "600" }]}>Confirm</Text>
          </Button>
        </View>
      </Sheet>

      {/* Menu Options Bottom Sheet */}
      <Sheet open={showMenuOptionsSheet} onClose={() => setShowMenuOptionsSheet(false)} backdropOpacity={0.4} style={[s.sheet, { maxHeight: windowHeight * 0.7 }]}>
        {/* Header */}
        <View style={[s.filterHeader, { paddingTop: sp(6), paddingBottom: sp(4) }]}>
          <Text style={[s.filterTitle, { fontWeight: "700" }]}>{restaurant?.name || "Unknown Restaurant"}</Text>
        </View>

        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(4) }}>
          {/* Menu Options List */}
          <View style={{ gap: sp(1) }}>
            {/* Add to Collection */}
            <Pressable
              style={({ pressed }) => [s.optionRow, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}
              onPress={handleAddToCollection}
            >
              <Bookmark size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
              <Text style={s.optionText}>
                {isFavorite(restaurant?.slug || slug || "") ? "Remove from Collection" : "Add to Collection"}
              </Text>
            </Pressable>

            {/* Share this restaurant */}
            <Pressable
              style={({ pressed }) => [s.optionRow, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}
              onPress={handleShareRestaurant}
            >
              <Share2 size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
              <Text style={s.optionText}>Share this restaurant</Text>
            </Pressable>

            {/* See more about this restaurant */}
            <Pressable
              style={({ pressed }) => [s.optionRow, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}
              onPress={() => {
                setShowMenuOptionsSheet(false)
                setShowMoreInfo(true)
              }}
            >
              <Info size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
              <Text style={s.optionText}>See more about this restaurant</Text>
            </Pressable>
          </View>

          {/* Disclaimer Text */}
          <View style={{ marginTop: sp(6), paddingHorizontal: sp(2) }}>
            <Text style={{ ...fontSize.xs, color: colors.gray[500], lineHeight: 19.5 }}>
              Menu items, prices, photos and descriptions are set directly by the restaurant. In case you see any incorrect information, please report it to us.
            </Text>
          </View>

          {/* FSSAI License Information */}
          {restaurant?.onboarding?.step3?.fssai?.registrationNumber ? (
            <View style={s.optionsFssai}>
              <View style={s.optionsFssaiLogo}>
                <AppImage src={fssaiLogo} style={{ width: "100%", height: "100%" }} contentFit="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.optionsFssaiLabel}>Lic. No.</Text>
                <Text style={s.optionsFssaiValue}>{restaurant?.onboarding?.step3?.fssai?.registrationNumber}</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom Handle */}
        <View style={{ paddingHorizontal: sp(4), paddingBottom: sp(2), paddingTop: sp(2), alignItems: "center" }}>
          <View style={{ height: 4, width: 48, backgroundColor: colors.gray[300], borderRadius: 9999 }} />
        </View>
      </Sheet>

      {/* Share Modal */}
      <Dialog
        open={Boolean(showShareModal && sharePayload)}
        onClose={() => setShowShareModal(false)}
        backdropOpacity={0.5}
        style={[s.shareDialog, { width: windowWidth * 0.92 }]}
      >
        <View style={s.shareHeader}>
          <Text style={[s.filterTitle, { flex: 1 }]} numberOfLines={1}>Share</Text>
          <Pressable onPress={() => setShowShareModal(false)} accessibilityLabel="Close share modal" style={{ padding: sp(1), borderRadius: radius.md }}>
            <X size={16} color={t.dark ? colors.gray[300] : colors.gray[600]} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: sp(5), paddingVertical: sp(4), gap: sp(2) }}>
          {typeof navigator !== "undefined" && navigator.share && (
            <ShareRow icon={Share2} label="Share via system apps" onPress={handleSystemShareFromModal} />
          )}
          <ShareRow icon={MessageCircle} label="WhatsApp" onPress={() => openShareTarget("whatsapp")} />
          <ShareRow icon={Send} label="Telegram" onPress={() => openShareTarget("telegram")} />
          <ShareRow icon={Mail} label="Email" onPress={() => openShareTarget("email")} />
          <ShareRow icon={Copy} label="Copy link" onPress={copyShareLink} />
        </View>
      </Dialog>

      {/* Offers Bottom Sheet */}
      <Sheet open={showOffersSheet} onClose={() => setShowOffersSheet(false)} backdropOpacity={0.6} style={[s.sheet, s.sheetOverflow, s.offersSheet]}>
        {/* Close Button - above the sheet */}
        <View style={s.offersCloseWrap} pointerEvents="box-none">
          <Pressable onPress={() => setShowOffersSheet(false)} accessibilityLabel="Close coupons" style={s.offersClose}>
            <X size={20} color={colors.white} />
          </Pressable>
        </View>

        <View style={{ maxHeight: windowHeight * 0.8 }}>
          <View style={s.offersHeader}>
            <Text style={s.offersTitle}>Offers at {restaurant?.name || "this restaurant"}</Text>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: sp(5), gap: sp(4) }}>
            <Text style={s.offersSection}>Restaurant coupons</Text>
            <View style={{ gap: sp(3), paddingBottom: sp(6) }}>
              {coupons.map((coupon, idx) => (
                <View key={coupon.couponCode || idx} style={s.couponCard}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: sp(4) }}>
                    {/* Blue Scallop Badge */}
                    <ScallopBadge size={40} />

                    {/* Coupon details */}
                    <View style={{ flex: 1, minWidth: 0, paddingRight: sp(6) }}>
                      <Text style={s.couponTitle}>{formatCouponTitle(coupon)}</Text>
                      <Text style={s.couponUse}>
                        Use code <Text style={s.couponCode}>{coupon.couponCode}</Text>
                      </Text>

                      {/* Dashed Copy Box */}
                      <View style={{ marginTop: 14, flexDirection: "row" }}>
                        <Pressable onPress={() => handleCopyCoupon(coupon.couponCode)} style={s.copyBox}>
                          <Text style={s.copyBoxText}>{coupon.couponCode}</Text>
                          <Copy size={12} color={t.dark ? colors.blue[400] : colors.blue[600]} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Sheet>
    </Screen>
  )
}

function ShareRow({ icon: Icon, label, onPress }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: sp(3),
          paddingHorizontal: sp(3),
          paddingVertical: sp(3),
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.dark ? colors.gray[700] : colors.gray[200],
        },
        pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] },
      ]}
    >
      <Icon size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
      <Text style={{ ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.white : colors.gray[900] }}>{label}</Text>
    </Pressable>
  )
}

// category image; hidden when it fails (the web set display:none onError)
function CategoryThumb({ src, style }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <AppImage src={src} style={style} contentFit="cover" onError={() => setFailed(true)} />
}

class RestaurantDetailsErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    debugError("RestaurantDetails crashed:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Screen bg={colors.gray[50]}>
          <AnimatedPage style={{ flex: 1, backgroundColor: colors.gray[50], alignItems: "center", justifyContent: "center", paddingHorizontal: sp(4) }}>
            <View style={{ alignItems: "center", gap: sp(4) }}>
              <AlertCircle size={48} color={colors.red[500]} />
              <View style={{ alignItems: "center" }}>
                <Text style={{ ...fontSize.lg, fontWeight: "600", color: colors.gray[900], marginBottom: sp(1), textAlign: "center" }}>
                  Something went wrong
                </Text>
                <Text style={{ ...fontSize.sm, color: colors.gray[600], marginBottom: sp(4), maxWidth: 448, textAlign: "center" }}>
                  We could not load this restaurant page right now.
                </Text>
                {/* window.location.reload() -> remount the page */}
                <Button onPress={() => this.setState({ hasError: false })} variant="outline">
                  <Text style={{ ...fontSize.sm, fontWeight: "500", color: colors.gray[900] }}>Reload Page</Text>
                </Button>
              </View>
            </View>
          </AnimatedPage>
        </Screen>
      )
    }

    return this.props.children
  }
}

export default function RestaurantDetails() {
  return (
    <RestaurantDetailsErrorBoundary>
      <RestaurantDetailsContent />
    </RestaurantDetailsErrorBoundary>
  )
}

const useStyles = makeStyles((t) => {
  const dark = t.dark
  const card = dark ? "#1a1a1a" : colors.white
  const border100 = dark ? colors.gray[800] : colors.gray[100]
  const border200 = dark ? colors.gray[800] : colors.gray[200]
  const text900 = dark ? colors.white : colors.gray[900]
  const text700 = dark ? colors.gray[300] : colors.gray[700]
  const text500 = dark ? colors.gray[400] : colors.gray[500]
  return {
    grayscale: { filter: [{ grayscale: 1 }], opacity: 0.75 },
    errorPage: { flex: 1, backgroundColor: colors.gray[50], alignItems: "center", justifyContent: "center", paddingHorizontal: sp(4) },
    errorTitle: { ...fontSize.lg, fontWeight: "600", color: text900, marginBottom: sp(1), textAlign: "center" },
    errorText: { ...fontSize.sm, color: colors.gray[600], marginBottom: sp(4), maxWidth: 448, textAlign: "center" },
    outlineBtnText: { ...fontSize.sm, fontWeight: "500", color: colors.gray[900] },

    // more info
    infoHeader: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(4), flexDirection: "row", alignItems: "center" },
    infoContent: { paddingHorizontal: sp(4), paddingTop: sp(2), paddingBottom: sp(12) },
    infoCard: { backgroundColor: card, borderRadius: radius["2xl"], padding: sp(5), borderWidth: 1, borderColor: border100, ...shadow.sm },
    infoName: { ...fontSize.xl, fontWeight: "700", color: text900 },
    infoAddress: { ...fontSize.sm, lineHeight: 22.75, color: text500, marginTop: sp(2), paddingBottom: sp(4), borderBottomWidth: 1, borderBottomColor: border100 },
    callRow: { paddingTop: sp(4), paddingBottom: sp(4), flexDirection: "row", alignItems: "center", gap: 14 },
    callBtn: {
      height: 48,
      width: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: dark ? alpha(colors.red[900], 0.3) : colors.red[200],
      backgroundColor: dark ? alpha(colors.red[900], 0.2) : colors.red[50],
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      ...shadow.sm,
    },
    callTitle: { ...fontSize.sm, fontWeight: "600", color: dark ? colors.gray[200] : colors.gray[800] },
    callSub: { ...fontSize.xs, lineHeight: 19.5, color: text500, marginTop: 2 },
    infoTimings: { paddingTop: sp(4), borderTopWidth: 1, borderTopColor: border100, gap: sp(3) },
    infoLine: { flexDirection: "row", alignItems: "center", gap: 10 },
    infoLineText: { ...fontSize.sm, color: text700, flexShrink: 1 },
    legalRow: { paddingBottom: sp(3), borderBottomWidth: 1, borderBottomColor: border100 },
    legalLabel: { ...fontSize.xs, textTransform: "uppercase", letterSpacing: 0.6, color: dark ? colors.gray[500] : colors.gray[400], fontWeight: "500" },
    legalValue: { ...fontSize.base, fontWeight: "600", color: text900, marginTop: sp(1) },
    fssaiNo: { ...fontSize.sm, color: text500, marginTop: 6, fontWeight: "500" },
    backToMenuBtn: {
      width: "100%",
      backgroundColor: RED,
      paddingVertical: 14,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
      ...shadow.md,
      shadowColor: colors.red[500],
    },
    backToMenuText: { ...fontSize.base, fontWeight: "700", color: colors.white },

    // header
    topBar: { paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(2), flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: dark ? "#0a0a0a" : colors.white, gap: sp(3) },
    roundIconBtn: { borderRadius: 9999, height: 40, width: 40, borderWidth: 1, borderColor: border200, backgroundColor: dark ? "#1a1a1a" : colors.white, ...shadow.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: 0 },
    searchPill: { borderRadius: 9999, height: 40, paddingHorizontal: sp(4), borderWidth: 1, borderColor: border200, backgroundColor: dark ? "#1a1a1a" : colors.white, ...shadow.sm, flexDirection: "row", alignItems: "center", gap: sp(2) },
    searchPillText: { ...fontSize.sm, fontWeight: "500" },
    searchIconLeft: { position: "absolute", left: 12, zIndex: 1 },
    searchInput: {
      width: "100%",
      paddingLeft: 40,
      paddingRight: 40,
      paddingVertical: sp(2),
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: border200,
      backgroundColor: dark ? "#1a1a1a" : colors.white,
      ...fontSize.sm,
      color: dark ? colors.white : colors.gray[900],
      ...shadow.sm,
    },
    searchClear: { position: "absolute", right: 12 },

    mainCard: { backgroundColor: dark ? "#0a0a0a" : colors.white, borderTopLeftRadius: radius["3xl"], borderTopRightRadius: radius["3xl"], paddingHorizontal: sp(4), paddingTop: sp(4), gap: sp(3) },
    summaryCard: {
      borderRadius: radius["3xl"],
      borderWidth: 1,
      borderColor: border100,
      backgroundColor: card,
      padding: sp(4),
      gap: sp(4),
      overflow: "hidden",
      elevation: 6,
      shadowColor: "#0f172a",
      shadowOpacity: 0.08,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 16 },
    },
    summaryBar: { position: "absolute", left: 0, right: 0, top: 0, height: 6 },
    restaurantName: { ...fontSize["2xl"], lineHeight: 30, fontWeight: "700", color: text900 },
    cuisineRow: { marginTop: sp(1), flexDirection: "row", alignItems: "center", gap: sp(2) },
    metaText: { ...fontSize.sm, color: text700 },
    ratingPill: { flexDirection: "row", alignItems: "center", gap: sp(1), borderRadius: 9999, paddingHorizontal: 10, paddingVertical: sp(1), backgroundColor: "#257d3c", ...shadow.sm },
    ratingPillText: { ...fontSize.xs, fontWeight: "600", color: colors.white },
    ratingsCount: { marginTop: sp(1), ...fontSize.xs, color: colors.gray[500], textAlign: "center" },
    locationBtn: { flexDirection: "row", alignItems: "center", gap: sp(1), minWidth: 0, flexShrink: 1 },
    openBadge: { alignItems: "center", justifyContent: "center", borderRadius: radius.xl, paddingHorizontal: 10, paddingVertical: sp(1), ...shadow.sm },
    openBadgeText: { fontSize: 10, lineHeight: 12.5, fontWeight: "700", color: colors.white },
    offlineBanner: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.rose[200], backgroundColor: colors.rose[50], paddingHorizontal: sp(3), paddingVertical: sp(2) },
    offlineBannerText: { ...fontSize.sm, color: colors.rose[700] },
    offersStrip: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: border200,
      backgroundColor: card,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.xl,
      marginBottom: sp(3),
      ...shadow.sm,
    },
    couponStripText: { ...fontSize.xs, fontWeight: "600", color: dark ? colors.gray[200] : colors.gray[800] },
    offerCount: { ...fontSize.xs, fontWeight: "600", color: text500 },
    chipsScroller: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.gray[200], marginHorizontal: -sp(4) },
    filterChip: {
      height: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: sp(3),
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: dark ? colors.gray[700] : colors.gray[300],
      backgroundColor: dark ? "#1a1a1a" : colors.white,
    },
    roundChip: { borderRadius: 9999 },
    vegChipActive: { borderColor: dark ? colors.green[500] : colors.green[600], backgroundColor: dark ? alpha(colors.green[900], 0.2) : colors.green[50] },
    nonVegChipActive: { borderColor: dark ? colors.red[500] : colors.red[600], backgroundColor: dark ? alpha(colors.red[900], 0.2) : colors.red[50] },
    chipText: { ...fontSize.sm, fontWeight: "500" },
    dot12: { height: 12, width: 12, borderRadius: 6 },
    dot16: { height: 16, width: 16, borderRadius: 8 },
    filterBadge: { position: "absolute", top: -4, right: -4, height: 20, width: 20, borderRadius: 10, backgroundColor: colors.red[500], alignItems: "center", justifyContent: "center" },
    filterBadgeText: { ...fontSize.xs, fontWeight: "600", color: colors.white },
    catChip: { flexDirection: "row", alignItems: "center", gap: sp(2), borderRadius: 9999, borderWidth: 1, paddingHorizontal: sp(3), paddingVertical: 6 },
    catChipActive: { borderColor: RED, backgroundColor: alpha(RED, 0.082) },
    catChipIdle: { borderColor: dark ? colors.gray[700] : colors.gray[300], backgroundColor: dark ? "#1a1a1a" : colors.white },
    catChipText: { ...fontSize.sm, fontWeight: "600" },
    catChipIdleText: { color: text700 },
    catThumb: { height: 24, width: 24, borderRadius: 12, borderWidth: 1, borderColor: alpha("#ffffff", 0.7) },
    catInitial: { height: 24, width: 24, borderRadius: 12, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center" },
    catInitialText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", color: colors.gray[500] },

    // sections
    sectionHeader: { paddingHorizontal: sp(4), flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sp(1) },
    sectionTitle: { ...fontSize.lg, fontWeight: "700", color: text900 },
    sectionSubtitle: { ...fontSize.sm, color: dark ? colors.blue[400] : colors.blue[600], textDecorationLine: "underline" },
    chevronBtn: { padding: sp(1), borderRadius: radius.sm },
    chevronBtnPressed: { backgroundColor: dark ? colors.gray[800] : colors.gray[100] },
    subHeader: { paddingHorizontal: sp(4), flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sp(4) },
    subTitle: { ...fontSize.base, fontWeight: "600", color: text900, flex: 1 },

    // dish
    dishRow: { flexDirection: "row", gap: sp(4), padding: sp(4) },
    dishRowBorder: { borderBottomWidth: 1, borderBottomColor: border100 },
    dishRowNoBorder: { borderBottomWidth: 0 },
    dishTitleRow: { flexDirection: "row", alignItems: "center", gap: sp(2) },
    vegBox: { width: 16, height: 16, borderWidth: 2, borderRadius: 2, padding: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    vegDot: { width: "100%", height: "100%", borderRadius: 9999 },
    dishName: { fontWeight: "700", color: dark ? colors.white : colors.gray[800], fontSize: 18, lineHeight: 22.5, flexShrink: 1 },
    startingFrom: { ...fontSize.xs, fontWeight: "500", color: text500 },
    dishPrice: { ...fontSize.base, fontWeight: "600", color: text900 },
    prepPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: dark ? colors.gray[800] : colors.gray[100], paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999 },
    prepText: { ...fontSize.xs, fontWeight: "500", color: dark ? colors.gray[400] : colors.gray[600] },
    dishDesc: { ...fontSize.sm, color: text500, marginTop: sp(1) },
    iconSquare: { padding: 6, borderWidth: 1, borderRadius: radius.lg, borderColor: dark ? colors.gray[700] : colors.gray[300] },
    iconSquareActive: { borderColor: colors.red[500], backgroundColor: dark ? alpha(colors.red[900], 0.2) : colors.red[50] },
    dishMedia: { position: "relative", width: 128, height: 128, flexShrink: 0 },
    dishImageBtn: { width: "100%", height: "100%", borderRadius: radius["2xl"], overflow: "hidden" },
    dishImage: { width: "100%", height: "100%", borderRadius: radius["2xl"] },
    addBtnAnchor: { position: "absolute", left: 0, right: 0, bottom: -8, alignItems: "center" },
    addBtn: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: RED,
      paddingHorizontal: sp(6),
      paddingVertical: 6,
      borderRadius: radius.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: sp(1),
      ...shadow.md,
    },
    addBtnDisabled: { backgroundColor: colors.gray[50], borderColor: colors.gray[300], opacity: 0.5 },
    addBtnText: { fontWeight: "700", color: RED, ...fontSize.base },
    stepper: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: RED,
      paddingHorizontal: sp(4),
      paddingVertical: 6,
      borderRadius: radius.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: sp(1),
      ...shadow.md,
    },
    stepperDisabled: { backgroundColor: colors.gray[50], borderColor: colors.gray[300], opacity: 0.5 },
    stepperQty: { marginHorizontal: sp(2), ...fontSize.sm, fontWeight: "700", color: RED },

    // empty states
    emptyFiltered: { marginHorizontal: sp(4), marginTop: sp(6), borderRadius: radius["2xl"], borderWidth: 1, borderStyle: "dashed", borderColor: dark ? colors.gray[700] : colors.gray[300], backgroundColor: card, paddingHorizontal: sp(5), paddingVertical: sp(8), alignItems: "center" },
    emptyFilteredTitle: { ...fontSize.sm, fontWeight: "500", color: text700, textAlign: "center" },
    emptyFilteredSub: { ...fontSize.xs, color: text500, marginTop: sp(2), textAlign: "center" },
    emptyMenu: { alignItems: "center", justifyContent: "center", paddingVertical: sp(16), paddingHorizontal: sp(8) },
    emptyMenuIcon: { backgroundColor: dark ? alpha(colors.gray[800], 0.5) : colors.gray[100], padding: sp(6), borderRadius: 9999, marginBottom: sp(6) },
    emptyMenuTitle: { ...fontSize.xl, fontWeight: "700", color: dark ? colors.white : colors.gray[800], marginBottom: sp(2), textAlign: "center" },
    emptyMenuText: { ...fontSize.sm, color: text500, maxWidth: 320, textAlign: "center" },

    // footer
    fssaiFooter: { paddingHorizontal: sp(4), paddingVertical: sp(4), marginTop: sp(2), borderTopWidth: 1, borderStyle: "dashed", borderColor: border200, backgroundColor: dark ? alpha("#ffffff", 0.05) : alpha(colors.gray[50], 0.3), marginHorizontal: sp(4), borderRadius: radius.xl },
    fssaiLogoBox: { height: 48, width: 80, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderRadius: radius.lg, padding: 6, borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
    fssaiFooterLabel: { fontSize: 10, color: dark ? colors.gray[500] : colors.gray[400], textTransform: "uppercase", letterSpacing: 1, fontWeight: "700", marginBottom: sp(1) },
    fssaiFooterValue: { ...fontSize.sm, fontWeight: "600", color: dark ? colors.gray[300] : colors.gray[600], fontFamily: "monospace", letterSpacing: 0.35 },

    // menu fab
    menuFab: { backgroundColor: "#5a5e66", flexDirection: "row", alignItems: "center", gap: 10, ...shadow.lg, borderWidth: 1, borderColor: alpha("#ffffff", 0.1), paddingHorizontal: sp(6), paddingVertical: sp(3), height: undefined, borderRadius: 22 },
    menuFabText: { fontSize: 17, fontWeight: "500", letterSpacing: 0.4, color: colors.white },

    // sheets
    sheet: { backgroundColor: card },
    sheetOverflow: { overflow: "visible" },
    sheetFooter: { borderTopWidth: 1, borderTopColor: border200, paddingHorizontal: sp(4), paddingVertical: sp(4), backgroundColor: card },
    redWideBtn: { width: "100%", backgroundColor: RED, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(2), paddingVertical: sp(6), height: undefined, borderRadius: radius.xl, ...shadow.lg },
    redWideBtnText: { ...fontSize.sm, fontWeight: "700", color: colors.white },
    applyBtn: { backgroundColor: RED, paddingHorizontal: sp(6), paddingVertical: 10, height: undefined, borderRadius: radius.lg },
    menuSheetRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: sp(3), paddingHorizontal: sp(2), borderRadius: radius.lg },
    menuSheetThumb: { height: 40, width: 40, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray[200] },
    menuSheetInitial: { height: 40, width: 40, borderRadius: radius.xl, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center" },
    menuSheetInitialText: { ...fontSize.sm, fontWeight: "700", textTransform: "uppercase", color: colors.gray[500] },
    menuSheetName: { ...fontSize.base, fontWeight: "500", color: text900, flexShrink: 1 },
    menuSheetCount: { ...fontSize.sm, color: text500, marginLeft: sp(2) },
    filterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(2), borderBottomWidth: 1, borderBottomColor: border200 },
    filterTitle: { ...fontSize.lg, fontWeight: "600", color: text900 },
    circleBtn: { padding: sp(2), borderRadius: 9999 },
    smallCircleBtn: { padding: 6, borderRadius: 9999, flexShrink: 0 },
    darkCircleBtn: { height: 32, width: 32, borderRadius: 16, backgroundColor: dark ? colors.gray[600] : colors.gray[700], alignItems: "center", justifyContent: "center" },
    filterGroupTitle: { ...fontSize.sm, fontWeight: "600", color: text900 },
    filterOption: { paddingHorizontal: sp(4), paddingVertical: 10, borderRadius: radius.lg, borderWidth: 2 },
    filterOptionRow: { flexDirection: "row", alignItems: "center", gap: sp(2) },
    filterOptionIdle: { borderColor: dark ? colors.gray[700] : colors.gray[200], backgroundColor: dark ? "#2a2a2a" : colors.white },
    filterOptionIdleText: { color: text700 },
    filterOptionBlue: { borderColor: dark ? colors.blue[400] : colors.blue[500], backgroundColor: dark ? alpha(colors.blue[900], 0.3) : colors.blue[50] },
    filterOptionGreen: { borderColor: dark ? colors.green[500] : colors.green[600], backgroundColor: dark ? alpha(colors.green[900], 0.3) : colors.green[50] },
    filterOptionRedNv: { borderColor: colors.red[600], backgroundColor: dark ? alpha(colors.red[900], 0.3) : colors.red[50] },
    filterOptionRed: { borderColor: dark ? colors.red[400] : colors.red[500], backgroundColor: dark ? alpha(colors.red[900], 0.3) : colors.red[50] },
    filterOptionBrand: { borderColor: RED, backgroundColor: dark ? alpha(RED, 0.2) : "#F9F9FB" },
    filterOptionText: { ...fontSize.base },

    // location dialog
    locationDialog: { maxWidth: 384, borderRadius: radius["3xl"], backgroundColor: card, ...shadow["2xl"] },
    locationHeader: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(3), flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(2) },
    outletCard: { padding: sp(3), borderRadius: radius.lg, borderWidth: 1, borderColor: dark ? colors.gray[700] : colors.gray[200], backgroundColor: dark ? "#2a2a2a" : colors.white },
    nearestTag: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: sp(2), paddingHorizontal: sp(2), paddingVertical: sp(1), backgroundColor: dark ? alpha(RED, 0.2) : "#F9F9FB", borderRadius: radius.md },
    nearestText: { ...fontSize.xs, fontWeight: "600", color: RED },
    outletTitle: { ...fontSize.sm, fontWeight: "600", color: text900, marginBottom: sp(2) },
    outletMeta: { flexDirection: "row", alignItems: "center", gap: sp(1) },
    outletMetaText: { ...fontSize.xs, color: dark ? colors.gray[400] : colors.gray[600] },
    addressLabel: { ...fontSize.xs, fontWeight: "600", color: dark ? colors.gray[500] : colors.gray[400], textTransform: "uppercase", letterSpacing: 0.6, marginBottom: sp(2) },
    addressBox: { flexDirection: "row", alignItems: "flex-start", gap: sp(3), padding: sp(3), borderRadius: radius.xl, backgroundColor: dark ? "#2a2a2a" : colors.gray[50], borderWidth: 1, borderColor: dark ? colors.gray[700] : colors.gray[100] },
    addressText: { ...fontSize.sm, lineHeight: 22.75, color: text700, flex: 1 },

    // collections
    collectionRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: sp(3), padding: sp(3), borderRadius: radius.lg },
    collectionIcon: { height: 48, width: 48, borderRadius: radius.lg, backgroundColor: dark ? alpha(colors.pink[900], 0.3) : colors.pink[100], alignItems: "center", justifyContent: "center", flexShrink: 0 },
    collectionName: { ...fontSize.base, fontWeight: "500", color: text900 },
    collectionSub: { ...fontSize.sm, color: text500, marginTop: sp(1) },
    checkedBox: { height: 20, width: 20, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.red[500], backgroundColor: colors.red[500], alignItems: "center", justifyContent: "center" },

    // item detail
    itemDialog: { maxWidth: 450, borderRadius: radius["3xl"], backgroundColor: card, ...shadow["2xl"] },
    itemClose: { position: "absolute", top: sp(4), right: sp(4), zIndex: 10, elevation: 10, height: 32, width: 32, borderRadius: 16, backgroundColor: alpha(colors.gray[900], 0.9), alignItems: "center", justifyContent: "center", ...shadow.md },
    itemImageWrap: { width: "100%", height: 256, overflow: "hidden", borderTopLeftRadius: radius["3xl"], borderTopRightRadius: radius["3xl"], backgroundColor: dark ? colors.gray[800] : colors.gray[100] },
    itemVegBox: { height: 20, width: 20, borderRadius: radius.sm, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    itemVegDot: { height: 10, width: 10, borderRadius: 5 },
    itemName: { ...fontSize.xl, fontWeight: "700", color: text900, flex: 1 },
    itemDesc: { ...fontSize.sm, lineHeight: 22.75, color: dark ? colors.gray[400] : colors.gray[600], marginBottom: sp(4) },
    notEligible: { ...fontSize.xs, fontWeight: "500", color: text500, marginBottom: sp(4) },
    chooseVariant: { ...fontSize.sm, fontWeight: "600", color: text900, marginBottom: sp(2) },
    variantChip: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: sp(3), paddingVertical: 6 },
    variantChipActive: { borderColor: dark ? colors.red[400] : colors.red[500], backgroundColor: dark ? alpha(colors.red[900], 0.3) : colors.red[50] },
    variantChipIdle: { borderColor: dark ? colors.gray[700] : colors.gray[200], backgroundColor: dark ? "#2a2a2a" : colors.white },
    variantChipText: { ...fontSize.sm, fontWeight: "500" },
    itemBar: { borderTopWidth: 1, borderTopColor: border200, paddingHorizontal: sp(3), paddingVertical: sp(4), backgroundColor: card, borderBottomLeftRadius: radius["3xl"], borderBottomRightRadius: radius["3xl"] },
    qtyBox: { flexDirection: "row", alignItems: "center", gap: sp(1), borderWidth: 2, borderColor: dark ? colors.gray[700] : colors.gray[300], borderRadius: radius.lg, paddingHorizontal: sp(2), height: 44, backgroundColor: dark ? "#2a2a2a" : colors.white },
    qtyText: { ...fontSize.lg, fontWeight: "600", minWidth: 24, textAlign: "center", color: text900 },
    addItemBtn: { flex: 1, height: 44, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(1), paddingHorizontal: sp(1), backgroundColor: colors.red[500] },
    addItemBtnDisabled: { backgroundColor: dark ? colors.gray[700] : colors.gray[300], opacity: 0.5 },
    addItemText: { ...fontSize.sm, fontWeight: "600", color: colors.white, flexShrink: 1 },
    addItemTextDisabled: { color: dark ? colors.gray[600] : colors.gray[500] },
    addItemPrice: { ...fontSize.sm, fontWeight: "700", color: colors.white, flexShrink: 1 },

    // schedule
    scheduleCloseWrap: { position: "absolute", top: -20, left: 0, right: 0, alignItems: "center", zIndex: 10, elevation: 10 },
    scheduleClose: { height: 40, width: 40, borderRadius: 20, backgroundColor: colors.gray[800], alignItems: "center", justifyContent: "center", ...shadow.lg },
    slot: { width: "100%", paddingHorizontal: sp(4), paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1 },
    slotActive: { backgroundColor: dark ? colors.gray[800] : colors.gray[100], borderColor: dark ? colors.gray[600] : colors.gray[300] },
    slotIdle: { backgroundColor: dark ? "#2a2a2a" : colors.white, borderColor: "transparent" },

    // menu options
    optionRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: sp(4), paddingHorizontal: sp(2), paddingVertical: sp(3), borderRadius: radius.lg },
    optionText: { ...fontSize.base, color: text900 },
    optionsFssai: { marginTop: sp(4), paddingHorizontal: sp(2), paddingTop: sp(4), borderTopWidth: 1, borderTopColor: border100, flexDirection: "row", alignItems: "center", gap: sp(3), opacity: 0.8, marginBottom: sp(2) },
    optionsFssaiLogo: { height: 32, width: 56, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderRadius: radius.sm, padding: sp(1), borderWidth: 1, borderColor: colors.gray[100] },
    optionsFssaiLabel: { fontSize: 10, color: text500, textTransform: "uppercase", letterSpacing: 0.25, fontWeight: "500" },
    optionsFssaiValue: { ...fontSize.xs, fontWeight: "600", color: text700 },

    // share
    shareDialog: { maxWidth: 448, borderRadius: radius["2xl"], backgroundColor: card, ...shadow["2xl"] },
    shareHeader: { paddingHorizontal: sp(5), paddingTop: sp(5), paddingBottom: sp(3), borderBottomWidth: 1, borderBottomColor: border200, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3) },

    // offers
    offersSheet: { borderWidth: 1, borderColor: border100, ...shadow["2xl"] },
    offersCloseWrap: { position: "absolute", top: -64, left: 0, right: 0, alignItems: "center", zIndex: 10, elevation: 10 },
    offersClose: { width: 48, height: 48, borderRadius: 24, backgroundColor: alpha(colors.neutral[800], 0.8), borderWidth: 1, borderColor: alpha("#ffffff", 0.15), alignItems: "center", justifyContent: "center", ...shadow.lg },
    offersHeader: { paddingHorizontal: sp(5), paddingTop: sp(6), paddingBottom: sp(4), borderBottomWidth: 1, borderBottomColor: border100 },
    offersTitle: { ...fontSize.xl, fontWeight: "700", color: dark ? colors.gray[100] : colors.gray[900] },
    offersSection: { ...fontSize.xs, fontWeight: "700", color: dark ? colors.gray[500] : colors.gray[400], textTransform: "uppercase", letterSpacing: 0.6 },
    couponCard: { borderWidth: 1, borderColor: dark ? "#222222" : colors.gray[100], borderRadius: radius["2xl"], padding: sp(4), backgroundColor: dark ? "#222222" : colors.white, overflow: "hidden", ...shadow.sm },
    couponTitle: { ...fontSize.base, lineHeight: 20, fontWeight: "700", color: dark ? colors.gray[50] : colors.gray[950] },
    couponUse: { ...fontSize.xs, color: text500, marginTop: sp(1) },
    couponCode: { fontWeight: "600", color: dark ? colors.gray[200] : colors.gray[700] },
    copyBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: sp(2),
      paddingHorizontal: sp(3),
      paddingVertical: 6,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: dark ? alpha(colors.blue[900], 0.5) : colors.blue[200],
      backgroundColor: dark ? alpha(colors.blue[950], 0.2) : alpha(colors.blue[50], 0.5),
      borderRadius: radius.lg,
    },
    copyBoxText: { ...fontSize.xs, fontWeight: "700", color: dark ? colors.blue[400] : colors.blue[600] },
  }
})
