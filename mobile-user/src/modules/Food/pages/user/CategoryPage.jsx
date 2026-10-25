import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, startTransition, useDeferredValue } from "react"
import { ActivityIndicator, FlatList, Pressable, ScrollView, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "expo-blur"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Star, Search, SlidersHorizontal, Bookmark, BadgePercent, MapPin, ArrowDownUp, Timer, IndianRupee, ShieldCheck, Grid2x2, Zap } from "lucide-react-native"
import { useParams, Link, useNavigate, useNavigationType } from "@/lib/router"
import { AppImage, Sheet, Skeleton, Text, TextInput } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"
import {
  CategoryChipRowSkeleton,
  LoadingSkeletonRegion,
  RestaurantGridSkeleton,
} from "@food/components/ui/loading-skeletons"

// Import shared food images - prevents duplication
import { foodImages } from "@food/constants/images"
import dishFallbackImage from "@food/assets/dish_fallback.webp"
import api from "@food/api"
import { restaurantAPI, adminAPI, searchAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { useProfile } from "@food/context/ProfileContext"
import {
  filterCategoriesForVegMode,
  isNonVegCategoryScope,
  isVegMenuItem,
} from "@food/utils/vegMode"
import { useLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useDelayedLoading } from "@food/hooks/useDelayedLoading"
import { getMenuFromResponse } from "@food/utils/menuItems"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import { compareRestaurantsByAvailabilityAndDistance } from "@food/utils/restaurantBrowseSort"
import { calculateDistance, formatDistance } from "@food/utils/common"
import {
  saveCategoryBrowseClick,
  getCategoryLastClick,
  categoryBrowseNeedsRestore,
  trackCategoryWindowScrollY,
  peekBrowseScroll,
  peekBrowseScrollAny,
  registerBrowseScroller,
  setActiveBrowseScroller,
  reportBrowseScroll,
  notifyBrowseUserIntent,
  getBrowseScrollY,
} from "@food/utils/browseScrollMemory"
import { toFoodUserPath, getRestaurantRouteId } from "@food/utils/mainTabRoutes"
import RestaurantImageCarousel from "@food/components/user/RestaurantImageCarousel"
import {
  peekCategoryListCache,
  setCategoryListCache,
  peekCategoryRestaurantsCache,
  setCategoryRestaurantsCache,
} from "../../utils/categoryCache"

/** Category chip photo; a broken backend image is hidden (web: onError display none). */
function CategoryChipImage({ uri, style }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <AppImage src={uri} style={style} contentFit="cover" onError={() => setFailed(true)} />
}

/** <img> with the web's onError -> dish fallback. */
function DishImage({ uri, style }) {
  return <AppImage src={uri || dishFallbackImage} fallback={dishFallbackImage} style={style} contentFit="cover" />
}

/** First paint: fewer restaurants + progressive menu enrichment */
const CATEGORY_FETCH_LIMIT = 18
const ALL_LIST_INITIAL_VISIBLE = 8
const ALL_LIST_LOAD_MORE = 6
const RECOMMENDED_MAX_ITEMS = 24
const MENU_ENRICH_BATCH = 3

// Filter options
const filterOptions = [
  { id: 'under-30-mins', label: 'Under 30 mins' },
  { id: 'price-match', label: 'Price Match', hasIcon: true },
  { id: 'flat-50-off', label: 'Flat 50% OFF', hasIcon: true },
  { id: 'under-250', label: 'Under ₹250' },
  { id: 'rating-4-plus', label: 'Rating 4.0+' },
]

// Mock data removed - using backend data only

const CATEGORY_PAGE_FILTERS_STORAGE_KEY = "food-category-page-filters-v1"

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

// In-memory cache to avoid localStorage quota limits and slow JSON parsing for large menus

export default function CategoryPage({
  embeddedCategorySlug = null,
  hideHeader = false,
  hideCategoryCarousel = false,
  hideFilters = false,
  disableAutoScroll = false,
  isBrowseActive = true,
}) {
  const params = useParams()
  const category = embeddedCategorySlug || params.category
  const navigate = useNavigate()
  const { vegMode, vegModeOption } = useProfile()
  const { location } = useLocation()
  const { zoneId, isOutOfService, loading: loadingZone } = useZone(location)
  const navType = useNavigationType()
  const recommendedSectionRef = useRef(null)
  const hasAutoScrolledRef = useRef(false)
  // native: the page's FlatList and measured positions (web read them from the DOM)
  const listRef = useRef(null)
  const listContentHeightRef = useRef(0)
  const listViewportHeightRef = useRef(0)
  const recommendedSectionYRef = useRef(null)
  const categoryChipXRef = useRef({})
  const categoryRailWidthRef = useRef(0)
  const filterSectionYRef = useRef({})



  // Let the network fetch effect handle clearing stale data if the zone actually changes.
  useEffect(() => {
    if (!isBrowseActive) return
    if (!loadingZone) return
    const cached = peekCategoryListCache(zoneId)
    if (Array.isArray(cached?.categories) && cached.categories.length > 1) return
    setLoadingCategories(true)
  }, [loadingZone, isBrowseActive, zoneId])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState(category?.toLowerCase() || 'all')
  // Always prefer URL/embedded slug so save+restore paths stay stable (not mongo id).
  const categoryBackPath = `/user/category/${String(
    embeddedCategorySlug || category || selectedCategory || "all",
  ).toLowerCase()}`
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [favorites, setFavorites] = useState(new Set())
  const [sortBy, setSortBy] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [activeScrollSection, setActiveScrollSection] = useState('sort')
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)
  const categoryScrollRef = useRef(null)
  const stickyHeaderRef = useRef(null)
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0)
  const menuEnrichmentRequestRef = useRef(0)
  const approvedFoodsCacheRef = useRef(null)
  const approvedFoodsInFlightRef = useRef(null)
  const hasRestoredCategoryFiltersRef = useRef(false)
  const lastFetchedCategoryRef = useRef(null)

  // State for categories from admin (seed from memory cache — no "No categories" flash)
  const [categories, setCategories] = useState(() => {
    const cached = peekCategoryListCache(zoneId)
    return Array.isArray(cached?.categories) && cached.categories.length > 0
      ? cached.categories
      : []
  })
  const [loadingCategories, setLoadingCategories] = useState(() => {
    const cached = peekCategoryListCache(zoneId)
    return !(Array.isArray(cached?.categories) && cached.categories.length > 1)
  })
  const [categoryKeywords, setCategoryKeywords] = useState(() => {
    const cached = peekCategoryListCache(zoneId)
    return cached?.keywords && typeof cached.keywords === "object" ? cached.keywords : {}
  })

  const displayCategories = useMemo(() => {
    if (!Array.isArray(categories)) return []
    if (!vegMode) return categories
    return categories.filter(
      (cat) => cat?.id === "all" || cat?.slug === "all" || !isNonVegCategoryScope(cat),
    )
  }, [categories, vegMode])

  // Clear non-veg category selection when veg mode turns on
  useEffect(() => {
    if (!vegMode || !selectedCategory || selectedCategory === "all") return
    const selected = categories.find(
      (cat) =>
        String(cat?.slug || "").toLowerCase() === String(selectedCategory).toLowerCase() ||
        String(cat?.id || "") === String(selectedCategory),
    )
    if (selected && isNonVegCategoryScope(selected)) {
      setSelectedCategory("all")
    }
  }, [vegMode, selectedCategory, categories])

  const activeCategory = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'all' || !categories) return null;
    return categories.find(c =>
      c.slug === selectedCategory ||
      c.id === selectedCategory ||
      c.name?.toLowerCase().replace(/\s+/g, '-') === selectedCategory
    );
  }, [selectedCategory, categories]);

  const activeCategoryIds = useMemo(() => {
    if (!activeCategory || !categories) return [];
    const targetName = activeCategory.name?.toLowerCase();
    return categories
      .filter(c => c.name?.toLowerCase() === targetName)
      .map(c => c.id)
      .filter(Boolean);
  }, [activeCategory, categories]);

  const [restaurantsData, setRestaurantsData] = useState(() => {
    const initialCategory = category?.toLowerCase() || 'all';
    const cached = peekCategoryRestaurantsCache(initialCategory, zoneId, [])
    return cached?.restaurants || []
  })
  const [loadingRestaurants, setLoadingRestaurants] = useState(() => {
    const initialCategory = category?.toLowerCase() || 'all';
    return !peekCategoryRestaurantsCache(initialCategory, zoneId, [])
  })
  const [isEnrichingMenus, setIsEnrichingMenus] = useState(false)
  const [approvedFoodsData, setApprovedFoodsData] = useState([])
  const [visibleAllCount, setVisibleAllCount] = useState(ALL_LIST_INITIAL_VISIBLE)
  const allListSentinelRef = useRef(null)
  const lastScrolledCategoryRef = useRef(null)
  const hasRestoredBrowseScrollRef = useRef(false)
  const savedScrollYRef = useRef(0)
  const liveScrollYRef = useRef(0)
  const savedVisibleCountRef = useRef(ALL_LIST_INITIAL_VISIBLE)
  // Skeleton only while chips are actually loading — don't hide behind restaurant cache
  const showCategorySkeleton = useDelayedLoading(
    (loadingCategories || loadingZone) && categories.length <= 1,
    { delay: 60, minDuration: 120 },
  )
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const BACKEND_ORIGIN = useMemo(() => API_BASE_URL.replace(/\/api\/?$/, ""), [])
  const slugify = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  const normalizeCategoryToken = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  const matchesCategoryText = (value, keywords) => {
    const normalizedValue = normalizeCategoryToken(value)
    if (!normalizedValue) return false

    return keywords.some((keyword) => {
      const normalizedKeyword = normalizeCategoryToken(keyword)
      if (!normalizedKeyword) return false
      return (
        normalizedValue === normalizedKeyword ||
        normalizedValue.includes(normalizedKeyword) ||
        slugify(normalizedValue) === slugify(normalizedKeyword)
      )
    })
  }
  const uniqueByRestaurant = (list) => {
    const seen = new Set()
    return list.filter((row) => {
      // Use distinct keys for dishes vs restaurants to prevent collisions
      const key = row.dishId ? `dish-${row.dishId}` : (row.restaurantId || row.id || `raw-${slugify(row.name)}`)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const toArray = (value) => {
    if (Array.isArray(value)) return value
    if (!value || typeof value !== "object") return []
    return Object.values(value).filter((entry) => entry && typeof entry === "object")
  }

  const normalizeMenu = (menu) => {
    const rawSections = toArray(menu?.sections)
    return {
      ...menu,
      sections: rawSections.map((section, sectionIndex) => ({
        ...section,
        id: String(section?.id || section?._id || `section-${sectionIndex}`),
        name: section?.name || section?.title || "Unnamed Section",
        items: toArray(section?.items).map((item, itemIndex) => ({
          ...item,
          id: String(item?.id || item?._id || `${sectionIndex}-${itemIndex}`),
        })),
        subsections: toArray(section?.subsections).map((subsection, subsectionIndex) => ({
          ...subsection,
          id: String(subsection?.id || subsection?._id || `subsection-${sectionIndex}-${subsectionIndex}`),
          name: subsection?.name || "Unnamed Subsection",
          items: toArray(subsection?.items).map((item, itemIndex) => ({
            ...item,
            id: String(item?.id || item?._id || `${sectionIndex}-${subsectionIndex}-${itemIndex}`),
          })),
        })),
      })),
    }
  }




  const buildFallbackMenuFromFoods = (foods, restaurant) => {
    const restaurantIds = new Set(
      [
        restaurant?.restaurantId,
        restaurant?.id,
        restaurant?.mongoId,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())
    )

    const restaurantName = String(restaurant?.name || "").trim().toLowerCase()
    const matchingFoods = foods.filter((food) => {
      const foodRestaurantId = String(food?.restaurantId || "").trim()
      const foodRestaurantName = String(food?.restaurantName || "").trim().toLowerCase()
      return (
        (foodRestaurantId && restaurantIds.has(foodRestaurantId)) ||
        (restaurantName && foodRestaurantName === restaurantName)
      )
    })

    if (matchingFoods.length === 0) {
      return null
    }

    const sectionsMap = new Map()
    matchingFoods.forEach((food, index) => {
      const sectionName = String(food?.categoryName || food?.category || "Varieties").trim() || "Varieties"
      const sectionKey = slugify(sectionName)
      if (!sectionsMap.has(sectionKey)) {
        sectionsMap.set(sectionKey, {
          id: sectionKey || `section-${index}`,
          name: sectionName,
          items: [],
          subsections: [],
        })
      }

      sectionsMap.get(sectionKey).items.push({
        id: String(food?.id || food?._id || `${sectionKey}-${index}`),
        _id: food?._id,
        name: food?.name || "Unnamed Item",
        description: food?.description || "",
        price: Number(food?.price || 0),
        originalPrice: Number(food?.originalPrice || food?.price || 0),
        image: normalizeImageUrl(food?.image),
        foodType: food?.foodType || "Non-Veg",
        isAvailable: food?.isAvailable !== false,
        categoryName: food?.categoryName || sectionName,
        category: food?.categoryName || sectionName,
        preparationTime: food?.preparationTime || "",
        approvalStatus: food?.approvalStatus || "approved",
      })
    })

    return {
      sections: Array.from(sectionsMap.values()),
    }
  }

  const getCategoryFallbackDishesFromApprovedFoods = (categoryId, restaurants) => {
    const keywords = getCategoryKeywords(categoryId)
    if (keywords.length === 0 || !Array.isArray(approvedFoodsData) || approvedFoodsData.length === 0) {
      return []
    }

    const restaurantsById = new Map()
    const restaurantsByName = new Map()
    ;(Array.isArray(restaurants) ? restaurants : []).forEach((restaurant) => {
      const idCandidates = [
        restaurant?.restaurantId,
        restaurant?.id,
        restaurant?.mongoId,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())

      idCandidates.forEach((value) => {
        if (!restaurantsById.has(value)) {
          restaurantsById.set(value, restaurant)
        }
      })

      const normalizedName = String(restaurant?.name || "").trim().toLowerCase()
      if (normalizedName && !restaurantsByName.has(normalizedName)) {
        restaurantsByName.set(normalizedName, restaurant)
      }
    })

    return approvedFoodsData
      .filter((food) => {
        if (food?.isAvailable === false) return false
        if (String(food?.approvalStatus || "").toLowerCase() !== "approved") return false

        const categoryName = String(food?.categoryName || food?.category || "").toLowerCase()
        const foodName = String(food?.name || "").toLowerCase()
        return (
          matchesCategoryText(categoryName, keywords) ||
          matchesCategoryText(foodName, keywords)
        )
      })
      .map((food, index) => {
        const restaurantId = String(food?.restaurantId || "").trim()
        const restaurantName = String(food?.restaurantName || "").trim()
        const matchedRestaurant =
          restaurantsById.get(restaurantId) ||
          restaurantsByName.get(restaurantName.toLowerCase()) ||
          null

        const fallbackRestaurantName = restaurantName || "Restaurant"
        const fallbackSlug = slugify(fallbackRestaurantName)
        const fallbackImage = normalizeImageUrl(food?.image)

        return {
          ...(matchedRestaurant || {}),
          id: `${restaurantId || fallbackSlug || "restaurant"}-${String(food?.id || food?._id || index)}`,
          restaurantId: restaurantId || matchedRestaurant?.restaurantId || matchedRestaurant?.id || null,
          mongoId: matchedRestaurant?.mongoId || matchedRestaurant?.id || null,
          slug: matchedRestaurant?.slug || fallbackSlug,
          name: matchedRestaurant?.name || fallbackRestaurantName,
          image: matchedRestaurant?.image || fallbackImage,
          images: Array.isArray(matchedRestaurant?.images) && matchedRestaurant.images.length > 0
            ? matchedRestaurant.images
            : (fallbackImage ? [fallbackImage] : []),
          cuisine: matchedRestaurant?.cuisine || null,
          rating: matchedRestaurant?.rating || null,
          deliveryTime: matchedRestaurant?.deliveryTime || null,
          distance: matchedRestaurant?.distance || null,
          offer: matchedRestaurant?.offer || null,
          featuredDish: matchedRestaurant?.featuredDish || food?.name || null,
          featuredPrice: matchedRestaurant?.featuredPrice || Number(food?.price || 0),
          menu: matchedRestaurant?.menu || null,
          dishId: String(food?.id || food?._id || `${restaurantId}-${index}`),
          categoryDish: food,
          categoryDishName: food?.name || "Unnamed Item",
          categoryDishPrice: Number(food?.price || 0),
          categoryDishImage: fallbackImage,
          categoryDishFoodType: food?.foodType || "Non-Veg",
        }
      })
  }

  const normalizeImageUrl = (value) => {
    if (!value) return ""

    const raw =
      typeof value === "string"
        ? value
        : typeof value === "object"
          ? (value.url || value.secure_url || value.imageUrl || value.image || value.src || value.path || "")
          : ""

    if (typeof raw !== "string") return ""
    const trimmed = raw.trim()
    if (!trimmed) return ""
    if (/^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed

    const appProtocol = typeof window !== "undefined" ? window.location?.protocol : ""
    const appHost = typeof window !== "undefined" ? window.location?.hostname : ""
    let normalized = trimmed
      .replace(/\\/g, "/")
      .replace(/^(https?):\/(?!\/)/i, "$1://")
      .replace(/^(https?:\/\/)(https?:\/\/)/i, "$1")

    if (/^\/\//.test(normalized)) {
      normalized = `${appProtocol || "https:"}${normalized}`
    }

    const hasSignedParams = (url) =>
      /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(url)

    if (/^https?:\/\//i.test(normalized)) {
      try {
        const parsed = new URL(normalized, window.location.origin)
        if (
          appHost &&
          appHost !== "localhost" &&
          appHost !== "127.0.0.1" &&
          /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
        ) {
          try {
            const backendUrl = new URL(BACKEND_ORIGIN)
            parsed.protocol = backendUrl.protocol
            parsed.hostname = backendUrl.hostname
            parsed.port = backendUrl.port
          } catch {
            parsed.protocol = window.location.protocol
            parsed.hostname = window.location.hostname
            if (window.location.port) parsed.port = window.location.port
          }
        }
        if (appProtocol === "https:" && parsed.protocol === "http:") {
          parsed.protocol = "https:"
        }
        const finalUrl = parsed.toString()
        return hasSignedParams(finalUrl) ? finalUrl : encodeURI(finalUrl)
      } catch {
        return normalized
      }
    }

    const absolutePath = normalized.startsWith("/")
      ? `${BACKEND_ORIGIN}${normalized}`
      : `${BACKEND_ORIGIN}/${normalized.replace(/^\.?\/*/, "")}`

    try {
      const parsed = new URL(absolutePath, window.location.origin)
      if (appProtocol === "https:" && parsed.protocol === "http:") {
        parsed.protocol = "https:"
      }
      const finalUrl = parsed.toString()
      return hasSignedParams(finalUrl) ? finalUrl : encodeURI(finalUrl)
    } catch {
      return absolutePath
    }
  }

  const currentFilterStorageKey = useMemo(
    () => slugify(selectedCategory || category || "all") || "all",
    [selectedCategory, category]
  )

  const parseFirstNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value
    const match = String(value || "").match(/(\d+(?:\.\d+)?)/)
    return match ? Number(match[1]) : null
  }

  const getComparableDeliveryTime = (row) => parseFirstNumber(row?.deliveryTime)

  const getComparableDistance = (row) => {
    const raw = String(row?.distance || "").trim().toLowerCase()
    if (!raw) return null

    const parsed = parseFirstNumber(raw)
    if (parsed == null) return null
    if (raw.includes("m") && !raw.includes("km")) {
      return parsed / 1000
    }
    return parsed
  }

  const getComparablePrice = (row) => {
    if (Array.isArray(row?.recommendedDishes) && row.recommendedDishes.length > 0) {
      const prices = row.recommendedDishes
        .map((dish) => Number(dish?.price))
        .filter((price) => Number.isFinite(price))
      if (prices.length > 0) return Math.min(...prices)
    }
    const raw = row?.categoryDishPrice ?? row?.featuredPrice ?? null
    const parsed = typeof raw === "number" ? raw : parseFirstNumber(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  const getComparableRating = (row) => {
    const parsed = typeof row?.rating === "number" ? row.rating : parseFirstNumber(row?.rating)
    return Number.isFinite(parsed) ? parsed : null
  }

  const matchesOfferText = (value, pattern) => pattern.test(String(value || ""))

  const applyFiltersAndSorting = (rows) => {
    let nextRows = Array.isArray(rows) ? [...rows] : []

    if (activeFilters.has('under-30-mins')) {
      nextRows = nextRows.filter((row) => {
        const time = getComparableDeliveryTime(row)
        return time != null && time <= 30
      })
    }

    if (activeFilters.has('delivery-under-45')) {
      nextRows = nextRows.filter((row) => {
        const time = getComparableDeliveryTime(row)
        return time != null && time <= 45
      })
    }

    if (activeFilters.has('rating-35-plus')) {
      nextRows = nextRows.filter((row) => {
        const rating = getComparableRating(row)
        return rating != null && rating >= 3.5
      })
    }

    if (activeFilters.has('rating-4-plus')) {
      nextRows = nextRows.filter((row) => {
        const rating = getComparableRating(row)
        return rating != null && rating >= 4.0
      })
    }

    if (activeFilters.has('rating-45-plus')) {
      nextRows = nextRows.filter((row) => {
        const rating = getComparableRating(row)
        return rating != null && rating >= 4.5
      })
    }

    if (activeFilters.has('distance-under-1km')) {
      nextRows = nextRows.filter((row) => {
        const distance = getComparableDistance(row)
        return distance != null && distance <= 1
      })
    }

    if (activeFilters.has('distance-under-2km')) {
      nextRows = nextRows.filter((row) => {
        const distance = getComparableDistance(row)
        return distance != null && distance <= 2
      })
    }

    if (activeFilters.has('price-under-200')) {
      nextRows = nextRows.filter((row) => {
        const price = getComparablePrice(row)
        return price != null && price <= 200
      })
    }

    if (activeFilters.has('under-250')) {
      nextRows = nextRows.filter((row) => {
        const price = getComparablePrice(row)
        return price != null && price <= 250
      })
    }

    if (activeFilters.has('price-under-500')) {
      nextRows = nextRows.filter((row) => {
        const price = getComparablePrice(row)
        return price != null && price <= 500
      })
    }

    if (activeFilters.has('flat-50-off')) {
      nextRows = nextRows.filter((row) => matchesOfferText(row?.offer, /50\s*%/i))
    }

    if (activeFilters.has('price-match')) {
      nextRows = nextRows.filter((row) =>
        matchesOfferText(row?.offer, /price\s*match/i) ||
        matchesOfferText(row?.priceRange, /price\s*match/i) ||
        matchesOfferText(row?.categoryDish?.description, /price\s*match/i)
      )
    }

    if (deferredSearchQuery.trim()) {
      const query = deferredSearchQuery.toLowerCase()
      nextRows = nextRows.filter((row) =>
        row.name?.toLowerCase().includes(query) ||
        row.cuisine?.toLowerCase().includes(query) ||
        row.featuredDish?.toLowerCase().includes(query) ||
        row.categoryDishName?.toLowerCase().includes(query) ||
        (Array.isArray(row.recommendedDishes) &&
          row.recommendedDishes.some((dish) =>
            String(dish?.name || "").toLowerCase().includes(query),
          ))
      )
    }

    if (sortBy) {
      nextRows.sort((left, right) => {
        if (sortBy === 'price-low' || sortBy === 'price-high') {
          const leftPrice = getComparablePrice(left)
          const rightPrice = getComparablePrice(right)
          if (leftPrice == null && rightPrice == null) return 0
          if (leftPrice == null) return 1
          if (rightPrice == null) return -1
          return sortBy === 'price-low' ? leftPrice - rightPrice : rightPrice - leftPrice
        }

        if (sortBy === 'rating-high' || sortBy === 'rating-low') {
          const leftRating = getComparableRating(left)
          const rightRating = getComparableRating(right)
          if (leftRating == null && rightRating == null) return 0
          if (leftRating == null) return 1
          if (rightRating == null) return -1
          return sortBy === 'rating-high' ? rightRating - leftRating : leftRating - rightRating
        }

        return 0
      })
    }

    const uniqueList = uniqueByRestaurant(nextRows)
    const sortedList = uniqueList
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const byBrowse = compareRestaurantsByAvailabilityAndDistance(a.row, b.row)
        if (byBrowse !== 0) return byBrowse
        return a.index - b.index
      })
      .map(item => item.row)

    return sortedList
  }

  // Fetch categories from admin API (memory-cached — no empty flash on reopen)
  useEffect(() => {
    if (loadingZone) return
    if (!isBrowseActive) return

    let isCancelled = false

    const fetchCategories = async () => {
      try {
        const cached = peekCategoryListCache(zoneId)
        if (Array.isArray(cached?.categories) && cached.categories.length > 1) {
          setCategories(cached.categories)
          if (cached.keywords) setCategoryKeywords(cached.keywords)
          setLoadingCategories(false)
          return
        }

        // Already loaded in this mount
        if (categories.length > 1) {
          setLoadingCategories(false)
          return
        }

        setLoadingCategories(true)
        const response = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {})

        if (isCancelled) return

        if (response.data && response.data.success && response.data.data && response.data.data.categories) {
          const categoriesArray = response.data.data.categories

          const transformedCategories = [
            { id: 'all', name: "All", image: null, slug: 'all' },
            ...categoriesArray.map((cat) => ({
              id: String(cat._id || cat.id || ''),
              name: cat.name,
              image: cat.image || foodImages[0],
              slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-'),
              type: cat.type,
              foodTypeScope: cat.foodTypeScope || cat.type || "",
            }))
          ]

          const keywordsMap = {}
          categoriesArray.forEach((cat) => {
            const categoryId = String(cat._id || cat.id || '')
            const categoryName = cat.name.toLowerCase()
            const words = categoryName.split(/[\s-]+/).filter(w => w.length > 0)
            keywordsMap[categoryId] = [categoryName, ...words]
          })

          setCategories(transformedCategories)
          setCategoryKeywords(keywordsMap)
          setCategoryListCache(zoneId, {
            categories: transformedCategories,
            keywords: keywordsMap,
          })
        } else if (categories.length === 0) {
          setCategories([{ id: 'all', name: "All", image: null, slug: 'all' }])
        }
      } catch (error) {
        if (isCancelled) return
        debugError('Error fetching categories:', error)
        if (categories.length === 0) {
          setCategories([{ id: 'all', name: "All", image: null, slug: 'all' }])
        }
      } finally {
        if (!isCancelled) setLoadingCategories(false)
      }
    }

    fetchCategories()

    return () => {
      isCancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from cache; avoid loop on categories.length
  }, [zoneId, loadingZone, isBrowseActive])

  // Helper function to check if menu has dishes matching category keywords
  const getCategoryKeywords = (categoryId) => {
    const raw = String(categoryId || "").trim().toLowerCase()
    const fromAdmin = categoryKeywords[raw]
    let keywords = []
    if (Array.isArray(fromAdmin) && fromAdmin.length > 0) {
      keywords = [...fromAdmin]
    } else {
      // Fallback: derive keywords from the slug in URL (e.g. "samosha" -> ["samosha"])
      // This prevents "no data" when admin categories don't include the slug.
      const parts = raw.split(/[\s-]+/).filter(Boolean)
      keywords = parts.length > 0 ? Array.from(new Set([raw, ...parts])) : []
    }

    // Add common variations/misspellings (e.g. "samosha" vs "samosa")
    if (keywords.includes('samosha') || keywords.includes('samosa')) {
      if (!keywords.includes('samosa')) keywords.push('samosa')
      if (!keywords.includes('samosha')) keywords.push('samosha')
    }

    return keywords
  }

  const checkCategoryInMenu = (menu, categoryId) => {
    if (!menu || !menu.sections || !Array.isArray(menu.sections)) {
      return false
    }

    const targetIds = activeCategoryIds
    const keywords = getCategoryKeywords(categoryId)

    for (const section of menu.sections) {
      const sectionNameLower = (section.name || '').toLowerCase()
      if (keywords.length > 0 && matchesCategoryText(sectionNameLower, keywords)) {
        return true
      }

      if (section.items && Array.isArray(section.items)) {
        for (const item of section.items) {
          const itemNameLower = (item.name || '').toLowerCase()
          const itemCategoryLower = (item.categoryName || item.category || '').toLowerCase()

          // Match by category ID
          if (targetIds.length > 0 && item.categoryId && targetIds.includes(String(item.categoryId))) {
            return true
          }

          // Match by name or category keywords
          if (
            keywords.length > 0 &&
            (matchesCategoryText(itemNameLower, keywords) ||
             matchesCategoryText(itemCategoryLower, keywords))
          ) {
            return true
          }
        }
      }

      if (section.subsections && Array.isArray(section.subsections)) {
        for (const subsection of section.subsections) {
          const subsectionNameLower = (subsection?.name || "").toLowerCase()
          if (keywords.length > 0 && matchesCategoryText(subsectionNameLower, keywords)) {
            return true
          }

          const subItems = Array.isArray(subsection?.items) ? subsection.items : []
          for (const item of subItems) {
            const itemNameLower = (item?.name || "").toLowerCase()
            const itemCategoryLower = (item?.categoryName || item?.category || "").toLowerCase()

            // Match by category ID
            if (targetIds.length > 0 && item.categoryId && targetIds.includes(String(item.categoryId))) {
              return true
            }

            // Match by name or category keywords
            if (
              keywords.length > 0 &&
              (matchesCategoryText(itemNameLower, keywords) ||
               matchesCategoryText(itemCategoryLower, keywords))
            ) {
              return true
            }
          }
        }
      }
    }

    return false
  }

  // Helper function to get ALL dishes matching a category from menu (returns array of dish info)
  const getAllCategoryDishesFromMenu = (menu, categoryId) => {
    if (!menu || !menu.sections || !Array.isArray(menu.sections)) {
      return []
    }

    const matchingDishes = []
    const targetIds = activeCategoryIds
    const keywords = getCategoryKeywords(categoryId)
    const seenItemIds = new Set() // Prevent duplicate items

    const addMatchingDish = (item, section, subsection = null) => {
      const itemId = item._id || item.id || `${item.name}-${item.price}`
      if (seenItemIds.has(String(itemId))) return
      seenItemIds.add(String(itemId))

      const originalPrice = item.originalPrice || item.price || 0
      const discountPercent = item.discountPercent || 0
      const finalPrice = discountPercent > 0
        ? Math.round(originalPrice * (1 - discountPercent / 100))
        : originalPrice

      const dishImage = normalizeImageUrl(
        item.image?.url || item.image || subsection?.image?.url || subsection?.image || section.image?.url || section.image
      )

      matchingDishes.push({
        name: item.name,
        price: finalPrice,
        image: dishImage,
        originalPrice: originalPrice,
        itemId: itemId,
        foodType: item.foodType,
      })
    }

    for (const section of menu.sections) {
      const sectionNameLower = (section?.name || "").toLowerCase()
      const sectionMatchesKeyword = keywords.length > 0 && matchesCategoryText(sectionNameLower, keywords)

      if (section.items && Array.isArray(section.items)) {
        for (const item of section.items) {
          const itemNameLower = (item.name || '').toLowerCase()
          const itemCategoryLower = (item.categoryName || item.category || '').toLowerCase()

          const matchesId = targetIds.length > 0 && item.categoryId && targetIds.includes(String(item.categoryId))
          const matchesKeyword = keywords.length > 0 && (
            sectionMatchesKeyword ||
            matchesCategoryText(itemNameLower, keywords) ||
            matchesCategoryText(itemCategoryLower, keywords)
          )

          if (matchesId || matchesKeyword) {
            addMatchingDish(item, section)
          }
        }
      }

      if (section.subsections && Array.isArray(section.subsections)) {
        for (const subsection of section.subsections) {
          const subsectionNameLower = (subsection?.name || "").toLowerCase()
          const subsectionMatchesKeyword = keywords.length > 0 && matchesCategoryText(subsectionNameLower, keywords)
          const subItems = Array.isArray(subsection?.items) ? subsection.items : []

          for (const item of subItems) {
            const itemNameLower = (item?.name || "").toLowerCase()
            const itemCategoryLower = (item?.categoryName || item?.category || "").toLowerCase()

            const matchesId = targetIds.length > 0 && item.categoryId && targetIds.includes(String(item.categoryId))
            const matchesKeyword = keywords.length > 0 && (
              sectionMatchesKeyword ||
              subsectionMatchesKeyword ||
              matchesCategoryText(itemNameLower, keywords) ||
              matchesCategoryText(itemCategoryLower, keywords)
            )

            if (matchesId || matchesKeyword) {
              addMatchingDish(item, section, subsection)
            }
          }
        }
      }
    }

    return matchingDishes
  }

  const toRecommendedDish = (dish, restaurant) => {
    const coverImage =
      restaurant?.image ||
      (Array.isArray(restaurant?.images) ? restaurant.images.find(Boolean) : "") ||
      ""
    const foodType = isVegMenuItem(dish) ? "Veg" : (dish?.foodType || dish?.categoryDishFoodType || "Non-Veg")
    return {
      id: dish?.itemId || dish?.id || dish?._id || `${dish?.name}-${dish?.price}`,
      name: dish?.name || "Unnamed Item",
      price: Number(dish?.price || 0),
      image: dish?.image || "",
      foodType,
    }
  }

  const buildRestaurantCardWithCategoryDishes = (restaurant, dishes) => {
    const recommendedDishes = (Array.isArray(dishes) ? dishes : [])
      .map((dish) => toRecommendedDish(dish, restaurant))
      .filter((dish) => dish.name)
    if (recommendedDishes.length === 0) return null

    const first = recommendedDishes[0]
    const restaurantId = restaurant?.id || restaurant?.restaurantId || restaurant?.mongoId || restaurant?.slug

    return {
      ...restaurant,
      id: restaurantId,
      recommendedDishes,
      dishId: first.id,
      categoryDishName: first.name,
      categoryDishPrice: first.price,
      categoryDishImage: first.image,
      categoryDishFoodType: first.foodType,
    }
  }

  /** One card per restaurant; category dishes go into recommendedDishes for Home-style carousel */
  const groupRestaurantsByCategoryDishes = (restaurants, categoryId) => {
    const cards = []
    ;(Array.isArray(restaurants) ? restaurants : []).forEach((restaurant) => {
      // Prefer search API dishes / already-built carousel dishes — skip waiting on full menus
      if (Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length > 0) {
        cards.push(restaurant)
        return
      }

      let categoryDishes = []
      if (Array.isArray(restaurant.categoryDishes) && restaurant.categoryDishes.length > 0) {
        categoryDishes = restaurant.categoryDishes.map((dish) => ({
          itemId: dish?._id || dish?.id || dish?.itemId,
          name: dish?.name,
          price: dish?.price,
          image: dish?.image,
          foodType: dish?.foodType,
        }))
      } else {
        if (!restaurant?.menu) return
        if (!checkCategoryInMenu(restaurant.menu, categoryId)) return
        categoryDishes = getAllCategoryDishesFromMenu(restaurant.menu, categoryId)
      }

      if (vegMode) {
        categoryDishes = categoryDishes.filter((dish) => isVegMenuItem(dish))
      }
      const card = buildRestaurantCardWithCategoryDishes(restaurant, categoryDishes)
      if (card) cards.push(card)
    })
    return cards
  }

  const groupFallbackDishesByRestaurant = (fallbackRows) => {
    const byRestaurant = new Map()

    ;(Array.isArray(fallbackRows) ? fallbackRows : []).forEach((row) => {
      const key = String(
        row?.restaurantId || row?.mongoId || row?.slug || row?.name || row?.id || "",
      ).trim()
      if (!key) return

      if (!byRestaurant.has(key)) {
        const restaurantId = row?.restaurantId || row?.mongoId || row?.slug || key
        byRestaurant.set(key, {
          ...row,
          id: restaurantId,
          recommendedDishes: [],
        })
      }

      const entry = byRestaurant.get(key)
      entry.recommendedDishes.push(
        toRecommendedDish(
          {
            itemId: row?.dishId,
            id: row?.dishId,
            name: row?.categoryDishName,
            price: row?.categoryDishPrice,
            image: row?.categoryDishImage,
            foodType: row?.categoryDishFoodType,
          },
          row,
        ),
      )
    })

    return Array.from(byRestaurant.values())
      .map((row) => {
        const dishes = row.recommendedDishes || []
        if (dishes.length === 0) return null
        const first = dishes[0]
        return {
          ...row,
          recommendedDishes: dishes,
          dishId: first.id,
          categoryDishName: first.name,
          categoryDishPrice: first.price,
          categoryDishImage: first.image,
          categoryDishFoodType: first.foodType,
        }
      })
      .filter(Boolean)
  }

  // Helper function to get FIRST featured dish for a category from menu (for backward compatibility)
  const getCategoryDishFromMenu = (menu, categoryId) => {
    const allDishes = getAllCategoryDishesFromMenu(menu, categoryId)
    return allDishes.length > 0 ? allDishes[0] : null
  }

  // Fetch restaurants from API
  useEffect(() => {
    if (!isBrowseActive) return;
    if (loadingZone || loadingCategories) return; // Prevent fetching while zone or categories are resolving

    let isCancelled = false

    const fetchRestaurants = async () => {
      try {
        const catKey = String(selectedCategory || "").toLowerCase()

        // Always prefer memory cache (slug + id keys) — instant revisit
        const cachedHit = peekCategoryRestaurantsCache(catKey, zoneId, categories)
        if (cachedHit?.restaurants) {
          setRestaurantsData(cachedHit.restaurants)
          setLoadingRestaurants(false)
          setIsEnrichingMenus(false)
          lastFetchedCategoryRef.current = catKey
          return
        }

        if (lastFetchedCategoryRef.current === catKey) {
          setLoadingRestaurants(false)
          return
        }

        // No cache yet — clear and load
        setRestaurantsData([])
        setLoadingRestaurants(true)
        // Pass coordinates and category to backend for server-side optimization
        const params = {
          limit: CATEGORY_FETCH_LIMIT,
          page: 1,
        }

        if (location?.latitude && location?.longitude) {
          params.lat = parseFloat(location.latitude.toFixed(4));
          params.lng = parseFloat(location.longitude.toFixed(4));
        }

        if (zoneId) {
          params.zoneId = zoneId;
        }

        // When zone is known, list by zone (not city name) so villages inside a
        // zone still see that zone's restaurants.
        const normalizedUserCity = String(location?.city || "")
          .trim()
          .toLowerCase();
        const hasUsableUserCity =
          normalizedUserCity &&
          normalizedUserCity !== "current location" &&
          normalizedUserCity !== "unknown city" &&
          normalizedUserCity !== "select location";
        if (!zoneId && hasUsableUserCity) {
          params.city = String(location.city).trim();
        }

        // Compute active category inside the effect to avoid it as a dependency
        const resolvedCategory = (selectedCategory && selectedCategory !== 'all' && categories?.length > 0)
          ? categories.find(c =>
              c.slug === selectedCategory ||
              c.id === selectedCategory ||
              c.name?.toLowerCase().replace(/\s+/g, '-') === selectedCategory
            )
          : null

        let response
        if (selectedCategory && selectedCategory !== 'all') {
          if (resolvedCategory && resolvedCategory.id && resolvedCategory.id !== 'all' && /^[0-9a-fA-F]{24}$/.test(resolvedCategory.id)) {
            response = await searchAPI.unifiedSearch({
              categoryId: resolvedCategory.id,
              zoneId: params.zoneId,
              lat: params.lat,
              lng: params.lng,
              limit: CATEGORY_FETCH_LIMIT,
              page: 1,
            })
          } else {
            // Fallback to text query if categories are still loading or if ID is not ObjectId
            response = await searchAPI.unifiedSearch({
              q: selectedCategory,
              zoneId: params.zoneId,
              lat: params.lat,
              lng: params.lng,
              limit: CATEGORY_FETCH_LIMIT,
              page: 1,
            })
          }
        } else {
          response = await restaurantAPI.getRestaurants(params)
        }

        if (isCancelled) return

        if (response.data && response.data.success && response.data.data && response.data.data.restaurants) {
          const restaurantsArray = response.data.data.restaurants

          // Helper function to check if value is a default/mock value
          const isDefaultValue = (value, fieldName) => {
            if (!value) return false

            const defaultOffers = [
              "Flat ₹50 OFF above ₹199",
              "Flat 50% OFF",
              "Flat ₹40 OFF above ₹149"
            ]
            const defaultDeliveryTimes = ["25-30 mins", "20-25 mins", "30-35 mins"]
            const defaultDistances = ["1.2 km", "1 km", "0.8 km"]
            const defaultFeaturedPrice = 249

            if (fieldName === 'offer' && defaultOffers.includes(value)) return true
            if (fieldName === 'deliveryTime' && defaultDeliveryTimes.includes(value)) return true
            if (fieldName === 'distance' && defaultDistances.includes(value)) return true
            if (fieldName === 'featuredPrice' && value === defaultFeaturedPrice) return true

            return false
          }

          // Transform restaurants - filter out default values
          const restaurantsWithIds = restaurantsArray
            .filter((restaurant) => {
              const displayName = String(restaurant.restaurantName || restaurant.name || "").trim()
              const hasName = displayName.length > 0
              return hasName
            })
            .map((restaurant) => {
              const deliveryTime =
                restaurant.deliveryTime ||
                restaurant.estimatedDeliveryTime ||
                (restaurant.estimatedDeliveryTimeMinutes
                  ? `${restaurant.estimatedDeliveryTimeMinutes} mins`
                  : "25-30 mins")

              const userLat = location?.latitude
              const userLng = location?.longitude
              const coords = restaurant.location?.coordinates
              const restaurantLat = Number(
                Array.isArray(coords) ? coords[1] : (restaurant.latitude ?? restaurant.lat),
              )
              const restaurantLng = Number(
                Array.isArray(coords) ? coords[0] : (restaurant.longitude ?? restaurant.lng),
              )
              let distanceInKm = Number(restaurant.distanceInKm ?? restaurant.distanceScore)
              if (!Number.isFinite(distanceInKm) || distanceInKm < 0) {
                distanceInKm = calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
              }
              let distance =
                restaurant.distance &&
                String(restaurant.distance).trim() &&
                !/^0\s*m$/i.test(String(restaurant.distance).trim())
                  ? restaurant.distance
                  : null
              if (!distance && Number.isFinite(distanceInKm) && distanceInKm >= 0) {
                distance = formatDistance(distanceInKm)
              }
              if (distance && /^0\s*m$/i.test(String(distance).trim())) {
                distance = null
              }

              let offer = restaurant.offer || null

              if (isDefaultValue(offer, 'offer')) offer = null

              const cuisine = restaurant.cuisines && restaurant.cuisines.length > 0
                ? restaurant.cuisines.join(", ")
                : null

              const coverImages = restaurant.coverImages && restaurant.coverImages.length > 0
                ? restaurant.coverImages.map(img => normalizeImageUrl(img.url || img)).filter(Boolean)
                : []

              const fallbackImages = restaurant.menuImages && restaurant.menuImages.length > 0
                ? restaurant.menuImages.map(img => normalizeImageUrl(img.url || img)).filter(Boolean)
                : []

              const allImages = coverImages.length > 0
                ? coverImages
                : (fallbackImages.length > 0
                  ? fallbackImages
                  : (restaurant.profileImage?.url ? [normalizeImageUrl(restaurant.profileImage.url)] : []))

              const image = allImages[0] || null
              const restaurantId = restaurant.restaurantId || restaurant._id

              let featuredDish = restaurant.featuredDish || null
              let featuredPrice = restaurant.featuredPrice || null

              if (featuredPrice && isDefaultValue(featuredPrice, 'featuredPrice')) {
                featuredPrice = null
              }

              const restaurantName = (restaurant.restaurantName || restaurant.name || "").toLowerCase()

              return {
                id: restaurantId,
                name: restaurant.restaurantName || restaurant.name,
                partnerType: restaurant.partnerType || 'restaurant',
                cuisine: cuisine,
                rating: restaurant.rating || null,
                deliveryTime: deliveryTime,
                distance: distance,
                distanceInKm: Number.isFinite(distanceInKm) ? distanceInKm : null,
                location: restaurant.location || null,
                topOrder: Number.isFinite(Number(restaurant.__topOrder ?? restaurant.topOrder))
                  ? Number(restaurant.__topOrder ?? restaurant.topOrder)
                  : 1000000,
                __topOrder: Number.isFinite(Number(restaurant.__topOrder ?? restaurant.topOrder))
                  ? Number(restaurant.__topOrder ?? restaurant.topOrder)
                  : 1000000,
                image: image,
                images: allImages,
                priceRange: restaurant.priceRange || null,
                featuredDish: featuredDish,
                featuredPrice: featuredPrice,
                offer: offer,
                slug: restaurant.slug || (restaurant.restaurantName || restaurant.name)?.toLowerCase().replace(/\s+/g, '-'),
                restaurantId: restaurantId,
                mongoId: restaurant._id || null,
                hasPaneer: false,
                category: 'all',
                isActive: restaurant.isActive !== false,
                isAcceptingOrders: restaurant.isAcceptingOrders !== false,
                openDays: Array.isArray(restaurant.openDays) ? restaurant.openDays : [],
                deliveryTimings: restaurant.deliveryTimings || null,
                outletTimings: restaurant.outletTimings || null,
                openingTime: restaurant.openingTime || restaurant?.deliveryTimings?.openingTime || null,
                closingTime: restaurant.closingTime || restaurant?.deliveryTimings?.closingTime || null,
                categoryDishes: Array.isArray(restaurant.categoryDishes)
                  ? restaurant.categoryDishes
                      .map((dish) => ({
                        itemId: dish?._id || dish?.id || dish?.itemId,
                        name: dish?.name,
                        price: Number(dish?.price || 0),
                        image: normalizeImageUrl(dish?.image) || dish?.image || null,
                        foodType: dish?.foodType || "Non-Veg",
                      }))
                      .filter((dish) => dish.name)
                  : [],
              }
            }).filter(Boolean)

          if (isCancelled) return

          lastFetchedCategoryRef.current = String(selectedCategory || "").toLowerCase()

          // Search already returned category dishes — paint instantly, skip N+1 menu fetches
          const withSearchDishes = restaurantsWithIds.map((restaurant) => {
            if (!Array.isArray(restaurant.categoryDishes) || restaurant.categoryDishes.length === 0) {
              return restaurant
            }
            return (
              buildRestaurantCardWithCategoryDishes(restaurant, restaurant.categoryDishes) ||
              restaurant
            )
          })
          const searchDishCoverage =
            withSearchDishes.filter(
              (r) => Array.isArray(r.recommendedDishes) && r.recommendedDishes.length > 0,
            ).length

          // Save immediately so switching away mid-enrichment still caches this category
          setCategoryRestaurantsCache(
            selectedCategory,
            zoneId,
            withSearchDishes,
            categories,
          )

          startTransition(() => {
            setRestaurantsData(withSearchDishes)
          })

          if (
            selectedCategory &&
            selectedCategory !== "all" &&
            searchDishCoverage > 0 &&
            searchDishCoverage >= Math.ceil(withSearchDishes.length * 0.5)
          ) {
            setIsEnrichingMenus(false)
            return
          }

          setIsEnrichingMenus(true)
          const enrichmentRequestId = ++menuEnrichmentRequestRef.current
          void (async () => {
            try {
              const transformedRestaurants = withSearchDishes.map((r) => ({ ...r }))

              for (let index = 0; index < withSearchDishes.length; index += MENU_ENRICH_BATCH) {
                if (isCancelled) return
                const batchRestaurants = withSearchDishes.slice(index, index + MENU_ENRICH_BATCH)
                const batchResults = await Promise.all(
                  batchRestaurants.map(async (restaurant) => {
                     // Already have category dishes from search — keep them
                     if (Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length > 0) {
                       return restaurant
                     }
                     try {
                      const lookupIds = [
                        restaurant.mongoId,
                        restaurant.restaurantId,
                        restaurant.id,
                      ]
                        .filter(Boolean)
                        .map((value) => String(value).trim())
                        .filter((value, valueIndex, arr) => arr.indexOf(value) === valueIndex)
                        .filter((value) => /^[0-9a-fA-F]{24}$/.test(value))

                      let menu = null
                      for (const lookupId of lookupIds) {
                        try {
                          const menuResponse = await restaurantAPI.getMenuByRestaurantId(lookupId)
                          const rawMenu = getMenuFromResponse(menuResponse)
                          const normalizedMenu = normalizeMenu(rawMenu)
                          if (menuResponse?.data?.success && normalizedMenu?.sections?.length > 0) {
                            menu = normalizedMenu
                            break
                          }
                        } catch (lookupError) {
                          if (lookupError?.response?.status !== 404) {
                            throw lookupError
                          }
                        }
                      }

                      if (menu?.sections?.length > 0) {
                        const hasPaneer = checkCategoryInMenu(menu, 'paneer-tikka')

                        let featuredDish = restaurant.featuredDish
                        let featuredPrice = restaurant.featuredPrice

                        if (!featuredDish || !featuredPrice) {
                          for (const section of (menu.sections || [])) {
                            if (section.items && section.items.length > 0) {
                              const firstItem = section.items[0]
                              if (!featuredDish) featuredDish = firstItem.name
                              if (!featuredPrice) {
                                const originalPrice = firstItem.originalPrice || firstItem.price || 0
                                const discountPercent = firstItem.discountPercent || 0
                                featuredPrice = discountPercent > 0
                                  ? Math.round(originalPrice * (1 - discountPercent / 100))
                                  : originalPrice
                              }
                              break
                            }
                          }
                        }

                        return {
                          ...restaurant,
                          menu: menu,
                          hasPaneer: hasPaneer,
                          featuredDish: featuredDish || null,
                          featuredPrice: featuredPrice || null,
                          categoryMatches: {},
                        }
                      }
                    } catch (error) {
                      debugWarn(`Failed to fetch menu for restaurant ${restaurant.restaurantId}:`, error)
                    }

                    return {
                      ...restaurant,
                      menu: null,
                      hasPaneer: false,
                      categoryMatches: {},
                    }
                  })
                )

                if (isCancelled || enrichmentRequestId !== menuEnrichmentRequestRef.current) return

                for (let i = 0; i < batchResults.length; i += 1) {
                  transformedRestaurants[index + i] = batchResults[i]
                }

                // Progressive UI update — first batches unlock Recommended quickly
                startTransition(() => {
                  setRestaurantsData([...transformedRestaurants])
                })
                // Keep cache fresh as batches complete (revisit stays instant)
                setCategoryRestaurantsCache(
                  selectedCategory,
                  zoneId,
                  transformedRestaurants,
                  categories,
                )
              }

              if (!isCancelled && enrichmentRequestId === menuEnrichmentRequestRef.current) {
                if (selectedCategory) {
                  setCategoryRestaurantsCache(
                    selectedCategory,
                    zoneId,
                    transformedRestaurants,
                    categories,
                  )
                }
              }
            } finally {
              if (!isCancelled && enrichmentRequestId === menuEnrichmentRequestRef.current) {
                setIsEnrichingMenus(false)
              }
            }
          })()
        } else {
          if (!isCancelled) setRestaurantsData([])
        }
      } catch (error) {
        debugError('Error fetching restaurants:', error)
        if (!isCancelled) setRestaurantsData([])
      } finally {
        if (!isCancelled) setLoadingRestaurants(false)
      }
    }

    fetchRestaurants()

    return () => {
      isCancelled = true
    }
  }, [zoneId, loadingZone, loadingCategories, location?.latitude, location?.longitude, location?.city, selectedCategory, isOutOfService, categories, isBrowseActive])

  // Update selected category when URL changes — hydrate restaurants from cache instantly
  useEffect(() => {
    let nextSlug = String(selectedCategory || "").toLowerCase()
    if (category && categories && categories.length > 0) {
      const categorySlug = category.toLowerCase()
      const matchedCategory = categories.find(cat =>
        cat.slug === categorySlug ||
        cat.id === categorySlug ||
        cat.name.toLowerCase().replace(/\s+/g, '-') === categorySlug
      )
      // Prefer URL slug (stable cache key) over mongo id
      nextSlug = matchedCategory?.slug
        ? String(matchedCategory.slug).toLowerCase()
        : categorySlug
      setSelectedCategory(nextSlug)
    } else if (category) {
      nextSlug = category.toLowerCase()
      setSelectedCategory(nextSlug)
    }

    const cached = peekCategoryRestaurantsCache(nextSlug, zoneId, categories)
    if (cached?.restaurants) {
      setRestaurantsData(cached.restaurants)
      setLoadingRestaurants(false)
      setIsEnrichingMenus(false)
      lastFetchedCategoryRef.current = nextSlug
    } else if (String(selectedCategory || "").toLowerCase() !== nextSlug) {
      setRestaurantsData([])
      setLoadingRestaurants(true)
      lastFetchedCategoryRef.current = null
    }
  }, [category, categories, zoneId])

  useEffect(() => {
    if (typeof window === "undefined" || !currentFilterStorageKey) return

    hasRestoredCategoryFiltersRef.current = false

    try {
      const raw = window.localStorage.getItem(CATEGORY_PAGE_FILTERS_STORAGE_KEY)
      if (!raw) return

      const stored = JSON.parse(raw)
      const categoryState = stored?.[currentFilterStorageKey]
      if (!categoryState || typeof categoryState !== "object") return

      setSortBy(categoryState.sortBy || null)
      setActiveFilters(new Set(Array.isArray(categoryState.activeFilters) ? categoryState.activeFilters : []))
    } catch {
      setSortBy(null)
      setActiveFilters(new Set())
    } finally {
      hasRestoredCategoryFiltersRef.current = true
    }
  }, [currentFilterStorageKey])

  useEffect(() => {
    if (typeof window === "undefined" || !currentFilterStorageKey) return
    if (!hasRestoredCategoryFiltersRef.current) return

    try {
      const raw = window.localStorage.getItem(CATEGORY_PAGE_FILTERS_STORAGE_KEY)
      const stored = raw ? JSON.parse(raw) : {}
      stored[currentFilterStorageKey] = {
        sortBy,
        activeFilters: Array.from(activeFilters),
      }
      window.localStorage.setItem(CATEGORY_PAGE_FILTERS_STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // Ignore storage failures and keep in-memory filters working.
    }
  }, [currentFilterStorageKey, sortBy, activeFilters])

  const centerSelectedCategoryChip = () => {
    const rail = categoryScrollRef.current
    if (!rail) return
    const selected = (Array.isArray(categories) ? categories : []).find(
      (cat) => selectedCategory === (cat.slug || cat.id) || selectedCategory === cat.id,
    )
    const box = selected ? categoryChipXRef.current[selected.id] : null
    if (!box) return
    // Horizontal rail only — never moves the page vertically (keeps back-restore intact).
    const x = Math.max(0, box.x - (categoryRailWidthRef.current / 2 - box.width / 2))
    rail.scrollTo({ x, animated: false })
  }

  useEffect(() => {
    const timer = setTimeout(centerSelectedCategoryChip, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, categories])

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
    // Show loading when filter is toggled
    setIsLoadingFilterResults(true)
    setTimeout(() => {
      setIsLoadingFilterResults(false)
    }, 500)
  }

  // Scroll tracking for filter modal (web: IntersectionObserver, band 20%..30% of the pane)
  const handleFilterPaneScroll = (event) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent
    const bandTop = contentOffset.y + layoutMeasurement.height * 0.2
    const entries = Object.entries(filterSectionYRef.current).sort((a, b) => a[1].y - b[1].y)
    let current = null
    entries.forEach(([sectionId, box]) => {
      if (box.y <= bandTop && box.y + box.height > bandTop) current = sectionId
    })
    if (current && current !== activeScrollSection) {
      setActiveScrollSection(current)
      setActiveFilterTab(current)
    }
  }

  const toggleFavorite = (id) => {
    setFavorites(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Recommended: one small card per matching dish (original horizontal 2-row slider).
  // All Restaurants (below): one card per restaurant with category dishes in carousel.
  const filteredRecommended = useMemo(() => {
    const sourceData = restaurantsData.length > 0 ? restaurantsData : []
    let filtered = [...sourceData]

    if (vegMode && vegModeOption === "pure-veg") {
      filtered = filtered.filter((r) => {
        if (r?.hasNonVegMenu === true) return false
        if (r?.isPureVeg === true || r?.hasNonVegMenu === false) return true
        return r?.pureVegRestaurant === true
      })
    }

    if (selectedCategory && selectedCategory !== 'all') {
      const expandedDishes = []

      filtered.forEach((r) => {
        let categoryDishes = []

        if (Array.isArray(r.recommendedDishes) && r.recommendedDishes.length > 0) {
          categoryDishes = r.recommendedDishes.map((dish) => ({
            itemId: dish?.id || dish?.itemId || dish?._id,
            name: dish?.name,
            price: dish?.price,
            image: dish?.image,
            foodType: dish?.foodType,
          }))
        } else if (Array.isArray(r.categoryDishes) && r.categoryDishes.length > 0) {
          categoryDishes = r.categoryDishes.map((dish) => ({
            itemId: dish?._id || dish?.id || dish?.itemId,
            name: dish?.name,
            price: dish?.price,
            image: dish?.image,
            foodType: dish?.foodType,
          }))
        } else {
          if (!r.menu) return
          if (!checkCategoryInMenu(r.menu, selectedCategory)) return
          categoryDishes = getAllCategoryDishesFromMenu(r.menu, selectedCategory)
        }

        if (categoryDishes.length === 0) return

        const validDishes = vegMode
          ? categoryDishes.filter((dish) => isVegMenuItem(dish))
          : categoryDishes

        const sourceRestaurantId = r.id || r.restaurantId || r.mongoId || r.slug

        validDishes.forEach((dishForCard) => {
          expandedDishes.push({
            ...r,
            id: `${sourceRestaurantId}-${dishForCard.itemId}`,
            sourceRestaurantId,
            dishId: dishForCard.itemId || `${sourceRestaurantId}-dish`,
            categoryDish: dishForCard,
            categoryDishName: dishForCard.name,
            categoryDishPrice: dishForCard.price,
            categoryDishImage: dishForCard.image,
            categoryDishFoodType: dishForCard.foodType,
          })
        })
      })

      filtered = expandedDishes

      if (filtered.length === 0) {
        const fallbackDishes = getCategoryFallbackDishesFromApprovedFoods(selectedCategory, sourceData)
        filtered = vegMode
          ? fallbackDishes.filter((dish) => dish.categoryDishFoodType === "Veg")
          : fallbackDishes
        filtered = filtered.map((row) => ({
          ...row,
          sourceRestaurantId: row.restaurantId || row.mongoId || row.slug || row.id,
        }))
        if (vegMode && vegModeOption === "pure-veg") {
          filtered = filtered.filter((r) => {
            if (r?.hasNonVegMenu === true) return false
            if (r?.isPureVeg === true || r?.hasNonVegMenu === false) return true
            return r?.pureVegRestaurant === true
          })
        }
      }
    }

    return applyFiltersAndSorting(filtered)
  }, [selectedCategory, activeFilters, deferredSearchQuery, restaurantsData, categoryKeywords, vegMode, vegModeOption, approvedFoodsData, sortBy])

  const filteredAllRestaurants = useMemo(() => {
    const sourceData = restaurantsData.length > 0 ? restaurantsData : []
    let filtered = [...sourceData]

    if (vegMode && vegModeOption === "pure-veg") {
      filtered = filtered.filter((r) => {
        if (r?.hasNonVegMenu === true) return false
        if (r?.isPureVeg === true || r?.hasNonVegMenu === false) return true
        return r?.pureVegRestaurant === true
      })
    }

    if (selectedCategory && selectedCategory !== 'all') {
      filtered = groupRestaurantsByCategoryDishes(filtered, selectedCategory)

      if (filtered.length === 0) {
        const fallbackDishes = getCategoryFallbackDishesFromApprovedFoods(selectedCategory, sourceData)
        const vegFiltered = vegMode
          ? fallbackDishes.filter((dish) => dish.categoryDishFoodType === "Veg" || isVegMenuItem({ foodType: dish.categoryDishFoodType }))
          : fallbackDishes
        filtered = groupFallbackDishesByRestaurant(vegFiltered)
        if (vegMode && vegModeOption === "pure-veg") {
          filtered = filtered.filter((r) => {
            if (r?.hasNonVegMenu === true) return false
            if (r?.isPureVeg === true || r?.hasNonVegMenu === false) return true
            return r?.pureVegRestaurant === true
          })
        }
      }
    }

    return applyFiltersAndSorting(filtered)
  }, [selectedCategory, activeFilters, deferredSearchQuery, restaurantsData, categoryKeywords, vegMode, vegModeOption, approvedFoodsData, sortBy])

  const showRestaurantSkeleton = useDelayedLoading(
    isLoadingFilterResults ||
      loadingRestaurants ||
      loadingZone ||
      loadingCategories ||
      (isEnrichingMenus &&
        filteredAllRestaurants.length === 0 &&
        filteredRecommended.length === 0),
    { delay: 80, minDuration: 280 }
  )

  const recommendedItems = useMemo(() => {
    const items = filteredRecommended.slice(0, RECOMMENDED_MAX_ITEMS)
    // Online first → pin order → nearest distance (same when all offline)
    return [...items]
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const byBrowse = compareRestaurantsByAvailabilityAndDistance(a.row, b.row)
        if (byBrowse !== 0) return byBrowse
        return a.index - b.index
      })
      .map((entry) => entry.row)
  }, [filteredRecommended])

  // Always show every matching restaurant in All Restaurants (do not hide ones that appear in Recommended dishes)
  const allRestaurantsWithoutRecommended = filteredAllRestaurants

  const visibleAllRestaurants = useMemo(
    () => allRestaurantsWithoutRecommended.slice(0, visibleAllCount),
    [allRestaurantsWithoutRecommended, visibleAllCount],
  )
  const visibleAllRestaurantsRef = useRef(visibleAllRestaurants)
  visibleAllRestaurantsRef.current = visibleAllRestaurants

  const isBootstrapping =
    (loadingRestaurants && restaurantsData.length === 0) ||
    loadingZone ||
    (loadingCategories && categories.length <= 1) ||
    (isEnrichingMenus && restaurantsData.length === 0) ||
    isLoadingFilterResults

  const isContentLoading = isBootstrapping || showRestaurantSkeleton

  const hasNoResults =
    !isBootstrapping &&
    !showRestaurantSkeleton &&
    allRestaurantsWithoutRecommended.length === 0 &&
    filteredRecommended.length === 0

  useEffect(() => {
    // Reset lazy window only when user changes category/filters — never on restaurant back.
    if (getCategoryLastClick() || peekBrowseScroll(categoryBackPath) || peekBrowseScrollAny()) return
    if (savedVisibleCountRef.current > ALL_LIST_INITIAL_VISIBLE) return
    setVisibleAllCount(ALL_LIST_INITIAL_VISIBLE)
  }, [selectedCategory, activeFilters, deferredSearchQuery, sortBy, categoryBackPath])

  const loadMoreAllRestaurants = () => {
    if (!isBrowseActive) return
    const total = allRestaurantsWithoutRecommended.length
    setVisibleAllCount((prev) => {
      if (prev >= total) return prev
      return Math.min(prev + ALL_LIST_LOAD_MORE, total)
    })
  }

  const handleCategorySelect = (category) => {
    const categorySlug = String(category.slug || category.id || "").toLowerCase()
    const cached = peekCategoryRestaurantsCache(categorySlug, zoneId, categories)
    if (cached?.restaurants) {
      setSelectedCategory(categorySlug)
      setRestaurantsData(cached.restaurants)
      setLoadingRestaurants(false)
      setIsEnrichingMenus(false)
      lastFetchedCategoryRef.current = categorySlug
    } else {
      setSelectedCategory(categorySlug)
      setRestaurantsData([])
      setLoadingRestaurants(true)
      lastFetchedCategoryRef.current = null
    }
    // Replace history so back always returns Home — don't stack category hops.
    if (categorySlug === 'all') {
      navigate(toFoodUserPath('/user/category/all'), { replace: true })
    } else {
      navigate(toFoodUserPath(`/user/category/${categorySlug}`), { replace: true })
    }
  }

  // Zone out-of-service → whole page grayscale. Per-card closed timing handled below.
  const shouldShowGrayscale = isOutOfService
  const isCategoryView = selectedCategory && selectedCategory !== 'all'

  const isRestaurantClosed = (restaurant) => {
    if (isOutOfService) return true
    const availability = getRestaurantAvailabilityStatus(restaurant)
    return !availability?.isOpen
  }

  const rememberBrowsePosition = (focusId) => {
    const y = Math.max(
      getBrowseScrollY(categoryBackPath),
      liveScrollYRef.current,
      savedScrollYRef.current,
    )
    const count = Math.max(visibleAllCount, ALL_LIST_INITIAL_VISIBLE)
    savedScrollYRef.current = y
    liveScrollYRef.current = y
    savedVisibleCountRef.current = count
    hasRestoredBrowseScrollRef.current = false
    trackCategoryWindowScrollY(y)
    saveCategoryBrowseClick({
      path: categoryBackPath,
      scrollY: y,
      focusId,
      visibleCount: count,
    })
  }

  // Track scroll while category is visible — click save can then avoid reading a raced 0
  useEffect(() => {
    if (!isBrowseActive) return undefined
    const unregister = registerBrowseScroller(categoryBackPath, {
      scrollTo: (y) => listRef.current?.scrollToOffset({ offset: Math.max(0, y), animated: false }),
      getContentHeight: () => listContentHeightRef.current,
      getViewportHeight: () => listViewportHeightRef.current,
      scrollToFocus: (focusId) => {
        const index = visibleAllRestaurantsRef.current.findIndex(
          (r) => String(r.id) === String(focusId) || String(r.sourceRestaurantId) === String(focusId),
        )
        if (index < 0 || !listRef.current) return false
        try {
          listRef.current.scrollToIndex({ index, animated: false, viewOffset: 72 })
          return true
        } catch {
          return false
        }
      },
    })
    setActiveBrowseScroller(categoryBackPath)
    trackCategoryWindowScrollY(liveScrollYRef.current)
    return unregister
  }, [isBrowseActive, categoryBackPath])

  // Header sits above the list (web: fixed header + spacer); its height comes from onLayout

  // Expand lazy list so target Y / focus card exist (does not own scroll restore)
  useLayoutEffect(() => {
    if (!isBrowseActive) return
    if (!categoryBrowseNeedsRestore()) return

    const total = allRestaurantsWithoutRecommended.length
    if (!total) return

    const pending = getCategoryLastClick()
    // Only expand to what was visible at click — full expand makes back feel laggy
    let needed = Math.min(
      Math.max(
        Number(pending?.visibleCount) || 0,
        savedVisibleCountRef.current,
        ALL_LIST_INITIAL_VISIBLE,
      ),
      total,
    )

    if (pending?.focusId) {
      const focusKey = String(pending.focusId)
      const focusIndex = allRestaurantsWithoutRecommended.findIndex(
        (r) => String(r.id) === focusKey || String(r.sourceRestaurantId) === focusKey,
      )
      if (focusIndex >= 0) {
        needed = Math.min(Math.max(needed, focusIndex + 1), total)
      }
    }

    if (needed > visibleAllCount) {
      setVisibleAllCount(needed)
    }
  }, [
    isBrowseActive,
    allRestaurantsWithoutRecommended.length,
    visibleAllCount,
  ])

  // Mark restored-intent so auto-scroll-to-recommended stays off; lock lives in KeepAlive
  useLayoutEffect(() => {
    if (!isBrowseActive) {
      hasRestoredBrowseScrollRef.current = false
      return
    }
    if (categoryBrowseNeedsRestore()) {
      hasRestoredBrowseScrollRef.current = true
      const pending = getCategoryLastClick()
      const targetY = Math.max(
        0,
        Number(pending?.scrollY) || liveScrollYRef.current || 0,
      )
      if (targetY > 0) {
        listRef.current?.scrollToOffset({ offset: targetY, animated: false })
      }
    }
  }, [isBrowseActive])

  // Auto-scroll to Recommended section on fresh navigation or category change (not on back)
  useEffect(() => {
    if (!isBrowseActive) return;
    if (disableAutoScroll) return;
    if (!embeddedCategorySlug) return;
    if (navType === "POP") return;
    if (hasRestoredBrowseScrollRef.current) return;
    if (getCategoryLastClick() || peekBrowseScroll(categoryBackPath) || peekBrowseScrollAny()) return;
    if (selectedCategory !== 'all' && filteredRecommended.length > 0 && recommendedSectionYRef.current != null) {
      const categoryChanged = lastScrolledCategoryRef.current !== selectedCategory;
      const isFreshMount = !hasAutoScrolledRef.current;

      if (categoryChanged || isFreshMount) {
        hasAutoScrolledRef.current = true
        lastScrolledCategoryRef.current = selectedCategory
        
        const timer = setTimeout(() => {
          if (recommendedSectionYRef.current != null && !hasRestoredBrowseScrollRef.current) {
            // the header is outside the list, so the section's own Y is the target
            const topOffset = recommendedSectionYRef.current
            listRef.current?.scrollToOffset({ offset: Math.max(0, topOffset), animated: true })
          }
        }, 80)
        
        return () => clearTimeout(timer)
      }
    }
  }, [navType, selectedCategory, filteredRecommended.length, disableAutoScroll, embeddedCategorySlug, isBrowseActive, categoryBackPath])

  // ---------------------------------------------------------------- native layout
  const t = useTheme()
  const s = useStyles()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // w-[calc((100vw-2rem-1.5rem)/3)]
  const recCardWidth = (screenWidth - 32 - 24) / 3
  const filtersHeightRef = useRef(0)
  const grayStyle = s.grayscale

  const renderRecCard = (restaurant) => {
    const closed = isRestaurantClosed(restaurant)
    const displayImg = isCategoryView
      ? (restaurant.categoryDishImage || dishFallbackImage)
      : (restaurant.categoryDishImage || restaurant.image || dishFallbackImage)
    return (
      <Link
        key={restaurant.id}
        to={toFoodUserPath(`/user/restaurants/${getRestaurantRouteId(restaurant)}${restaurant.dishId ? `?dish=${restaurant.dishId}` : ''}`)}
        state={{ restaurantData: restaurant, from: categoryBackPath }}
        onPress={() => rememberBrowsePosition(restaurant.id)}
        style={{ width: recCardWidth, flexShrink: 0 }}
      >
        <View style={(shouldShowGrayscale || closed) ? grayStyle : null}>
          <View style={[s.recImageWrap, { width: recCardWidth, height: recCardWidth }]}>
            <DishImage uri={displayImg} style={s.fill} />

            {restaurant.offer ? (
              <LinearGradient colors={["#DC2626", "#991B1B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.recOffer}>
                <Text style={s.recOfferText}>{restaurant.offer}</Text>
              </LinearGradient>
            ) : null}

            <View style={s.recRating}>
              <Text style={s.recRatingText}>
                {Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
              </Text>
              <Star size={10} color={colors.white} fill={colors.white} />
            </View>
          </View>

          <Text style={s.recTitle} numberOfLines={1}>
            {isCategoryView
              ? (restaurant.categoryDishName || restaurant.featuredDish || restaurant.name)
              : restaurant.name}
          </Text>
          {restaurant.partnerType === 'store' && (
            <View style={[s.storeTag, { marginTop: 2 }]}>
              <Text style={s.storeTagText}>MY STORE</Text>
            </View>
          )}
          {isCategoryView && (
            <Text style={s.recSub} numberOfLines={1}>
              {restaurant.name}
            </Text>
          )}
        </View>
      </Link>
    )
  }

  const renderRecommended = () => {
    if (isContentLoading && filteredRecommended.length === 0) {
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.edgeScroll, { flexGrow: 0 }]} contentContainerStyle={s.edgeScrollContent}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={`rec-skel-${i}`} style={{ width: recCardWidth, flexShrink: 0 }}>
              <Skeleton width={recCardWidth} height={recCardWidth} rounded={radius.xl} style={{ marginBottom: sp(2) }} />
              <Skeleton width="75%" height={12} rounded={radius.sm} style={{ marginBottom: sp(1) }} />
              <Skeleton width="50%" height={10} rounded={radius.sm} />
            </View>
          ))}
        </ScrollView>
      )
    }
    const recCount = recommendedItems.length
    const useTwoRows = recCount >= 6
    // Fixed card size for 1–N items (matches multi-item carousel width)
    if (!useTwoRows) {
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.edgeScroll, { flexGrow: 0 }]} contentContainerStyle={[s.edgeScrollContent, { minWidth: screenWidth }]} nestedScrollEnabled>
          {recommendedItems.map(renderRecCard)}
        </ScrollView>
      )
    }
    // 6+: exactly 2 rows — first 3 on top, next 3 below, then slide (no 3rd row)
    const topRow = []
    const bottomRow = []
    recommendedItems.forEach((item, index) => {
      if (Math.floor(index / 3) % 2 === 0) topRow.push(item)
      else bottomRow.push(item)
    })
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.edgeScroll, { flexGrow: 0 }]} contentContainerStyle={[s.edgeScrollContent, { minWidth: screenWidth, flexDirection: "column" }]} nestedScrollEnabled>
        <View style={{ flexDirection: "row", gap: sp(3) }}>{topRow.map(renderRecCard)}</View>
        <View style={{ flexDirection: "row", gap: sp(3) }}>{bottomRow.map(renderRecCard)}</View>
      </ScrollView>
    )
  }

  const renderFilterChip = (filter) => {
    const Icon = filter.icon
    const isActive = activeFilters.has(filter.id)
    return (
      <Pressable
        key={filter.id}
        onPress={() => toggleFilter(filter.id)}
        style={({ pressed }) => [
          s.chip,
          isActive ? s.chipActive : s.chipIdle,
          pressed && (isActive ? { backgroundColor: "#991B1B" } : s.chipIdlePressed),
        ]}
      >
        {Icon && <Icon size={14} color={isActive ? colors.white : t.dark ? colors.white : colors.gray[900]} />}
        <Text style={[s.chipText, { color: isActive ? colors.white : t.dark ? colors.white : colors.black }]}>{filter.label}</Text>
      </Pressable>
    )
  }

  const listHeader = (
    <>
      {/* Filters — scroll away with content (not sticky) */}
      {!hideFilters && (
        <View style={s.filtersWrap} onLayout={(e) => { filtersHeightRef.current = e.nativeEvent.layout.height }}>
          {/* Row 1 */}
          <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} nestedScrollEnabled>
            <Pressable onPress={() => setIsFilterOpen(true)} style={({ pressed }) => [s.chip, s.chipIdle, pressed && s.chipIdlePressed]}>
              <SlidersHorizontal size={14} color={t.dark ? colors.white : colors.gray[900]} />
              <Text style={[s.chipText, { color: t.dark ? colors.white : colors.black }]}>Filters</Text>
            </Pressable>
            {[
              { id: 'under-30-mins', label: 'Under 30 mins' },
              { id: 'delivery-under-45', label: 'Under 45 mins' },
              { id: 'rating-4-plus', label: 'Rating 4.0+' },
              { id: 'rating-45-plus', label: 'Rating 4.5+' },
            ].map(renderFilterChip)}
          </ScrollView>

          {/* Row 2 */}
          <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} nestedScrollEnabled>
            {[
              { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
              { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
              { id: 'flat-50-off', label: 'Flat 50% OFF' },
              { id: 'under-250', label: 'Under ₹250' },
            ].map(renderFilterChip)}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      <View style={s.content}>
        {/* RECOMMENDED FOR YOU — show skeleton while loading, avoid blank white boxes */}
        {selectedCategory !== 'all' && (isContentLoading || filteredRecommended.length > 0) && (
          <View
            ref={recommendedSectionRef}
            onLayout={(e) => {
              recommendedSectionYRef.current = (hideFilters ? 0 : filtersHeightRef.current) + sp(4) + e.nativeEvent.layout.y
            }}
          >
            <Text style={s.sectionHeading}>RECOMMENDED FOR YOU</Text>
            {renderRecommended()}
          </View>
        )}

        {/* ALL RESTAURANTS Section */}
        <View style={{ position: "relative" }}>
          <Text style={s.sectionHeading}>ALL RESTAURANTS</Text>

          {/* Loading overlay (shown above the dimmed cards) */}
          {showRestaurantSkeleton && visibleAllRestaurants.length > 0 && (
            <View style={s.loadingOverlay}>
              <LoadingSkeletonRegion label="Loading restaurants" style={{ padding: sp(1) }}>
                <RestaurantGridSkeleton count={4} compact />
              </LoadingSkeletonRegion>
            </View>
          )}

          {isContentLoading && visibleAllRestaurants.length === 0 ? (
            <View style={showRestaurantSkeleton ? { opacity: 0.5 } : null}>
              <RestaurantGridSkeleton count={4} compact />
            </View>
          ) : null}
        </View>
      </View>
    </>
  )

  const renderRestaurant = ({ item: restaurant }) => {
    const restaurantSlug = getRestaurantRouteId(restaurant) || "restaurant"
    const isFavorite = favorites.has(restaurant.id)
    const closed = isRestaurantClosed(restaurant)
    const singleImg = isCategoryView
      ? (restaurant.categoryDishImage || dishFallbackImage)
      : (restaurant.image || dishFallbackImage)

    return (
      <View style={[s.cardOuter, showRestaurantSkeleton && { opacity: 0.5 }]}>
        <Link
          to={toFoodUserPath(`/user/restaurants/${restaurantSlug}`)}
          state={{ restaurantData: restaurant, from: categoryBackPath }}
          onPress={() => rememberBrowsePosition(restaurant.id)}
        >
          <View style={[s.card, (shouldShowGrayscale || closed) && grayStyle]}>
            {/* Image Section — Home-style dish carousel when category dishes exist */}
            <View style={s.cardImage}>
              {isCategoryView && Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length > 0 ? (
                <RestaurantImageCarousel
                  restaurant={restaurant}
                  backendOrigin={BACKEND_ORIGIN}
                  style={{ height: 176 }}
                  roundedClass="rounded-t-md"
                  backFrom={categoryBackPath}
                  focusId={restaurant.id}
                  visibleCount={visibleAllCount}
                  categoryFallbackImage={dishFallbackImage}
                />
              ) : (
                <DishImage uri={singleImg} style={s.fill} />
              )}

              {/* Featured dish badge only when not using category dish carousel */}
              {!isCategoryView && (restaurant.categoryDishName || restaurant.featuredDish) ? (
                <View style={s.featuredWrap}>
                  <View style={s.featured}>
                    <BlurView intensity={8} tint="dark" style={s.absFill} />
                    <Text style={s.featuredText}>
                      {`${restaurant.categoryDishName || restaurant.featuredDish} • ₹${restaurant.categoryDishPrice || restaurant.featuredPrice}`}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Ad Badge */}
              {restaurant.isAd && (
                <View style={s.adBadge}>
                  <Text style={s.adText}>Ad</Text>
                </View>
              )}

              {/* Bookmark Icon - Top Right */}
              <Pressable
                onPress={() => toggleFavorite(restaurant.id)}
                style={({ pressed }) => [s.bookmarkBtn, pressed && { backgroundColor: t.dark ? "#2a2a2a" : colors.white }]}
              >
                <BlurView intensity={8} tint={t.dark ? "dark" : "light"} style={s.absFill} />
                <Bookmark
                  size={20}
                  color={isFavorite ? (t.dark ? colors.gray[200] : colors.gray[800]) : (t.dark ? colors.gray[400] : colors.gray[600])}
                  fill={isFavorite ? (t.dark ? colors.gray[200] : colors.gray[800]) : "none"}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {/* Content Section */}
            <View style={s.cardContent}>
              {/* Restaurant Name & Rating — delivery row matches Home */}
              <View style={s.cardTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cardName} numberOfLines={1}>
                    {restaurant.name}
                  </Text>
                  {restaurant.partnerType === 'store' && (
                    <View style={[s.storeTag, { marginTop: sp(1) }]}>
                      <Text style={s.storeTagText}>MY STORE</Text>
                    </View>
                  )}
                  <View style={s.deliveryRow}>
                    <Zap size={16} color="#257d3c" fill="#257d3c" strokeWidth={2.5} />
                    <Text style={s.deliveryText}>{restaurant.deliveryTime || "25-30 mins"}</Text>
                    {restaurant.distance ? (
                      <>
                        <Text style={[s.deliveryText, { marginHorizontal: sp(1), fontWeight: "700" }]}>|</Text>
                        <Text style={s.deliveryText}>{restaurant.distance}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
                <View style={s.ratingBadge}>
                  <Star size={14} color={colors.white} fill={colors.white} strokeWidth={0} />
                  <Text style={s.ratingText}>
                    {Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
                  </Text>
                </View>
              </View>

              {/* Offer Badge */}
              {restaurant.offer ? (
                <View style={s.offerRow}>
                  <BadgePercent size={16} color="#DC2626" strokeWidth={2} />
                  <Text style={s.offerText}>{restaurant.offer}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Link>
      </View>
    )
  }

  const listFooter = (
    <>
      {visibleAllCount < allRestaurantsWithoutRecommended.length && (
        <View style={s.loaderRow}>
          <ActivityIndicator size="small" color={colors.gray[400]} />
        </View>
      )}

      {/* Empty State — never flash while categories/menus still loading */}
      {hasNoResults && (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>
            {searchQuery
              ? `No restaurants found for "${searchQuery}"`
              : "No restaurants found with selected filters"}
          </Text>
          <Pressable
            onPress={() => {
              setIsLoadingFilterResults(true)
              setActiveFilters(new Set())
              setSearchQuery("")
              setSortBy(null)
              menuEnrichmentRequestRef.current += 1
              setIsEnrichingMenus(false)
              setTimeout(() => setIsLoadingFilterResults(false), 500)
            }}
            style={({ pressed }) => [s.outlineBtn, pressed && { backgroundColor: t.dark ? alpha("#f2f0ea", 0.5) : "#f6e2b5" }]}
          >
            <Text style={s.outlineBtnText}>Clear all filters</Text>
          </Pressable>
        </View>
      )}
    </>
  )

  const filterTabs = [
    { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
    { id: 'time', label: 'Time', icon: Timer },
    { id: 'rating', label: 'Rating', icon: Star },
    { id: 'distance', label: 'Distance', icon: MapPin },
    { id: 'price', label: 'Dish Price', icon: IndianRupee },
    { id: 'offers', label: 'Offers', icon: BadgePercent },
    { id: 'trust', label: 'Trust', icon: ShieldCheck },
  ]

  const sectionLayout = (id) => (e) => {
    filterSectionYRef.current[id] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }
  }

  // tile buttons of the filter sheet (Time / Rating / Distance / Offers)
  const renderTile = (id, label, Icon, { green = false, starFill = false } = {}) => {
    const on = activeFilters.has(id)
    const iconColor = on ? "#DC2626" : starFill ? (t.dark ? colors.gray[500] : colors.gray[400]) : (t.dark ? colors.gray[400] : colors.gray[600])
    return (
      <Pressable
        key={id}
        onPress={() => toggleFilter(id)}
        style={[s.tile, on ? (green ? s.optOnGreen : s.optOnRed) : s.optOff]}
      >
        <Icon size={24} color={iconColor} fill={starFill && on ? "#DC2626" : "none"} strokeWidth={starFill ? 2 : 1.5} />
        <Text style={[s.optText, { color: on ? "#DC2626" : t.dark ? colors.gray[300] : colors.gray[700] }]}>{label}</Text>
      </Pressable>
    )
  }

  const renderPriceRow = (id, label) => {
    const on = activeFilters.has(id)
    return (
      <Pressable key={id} onPress={() => toggleFilter(id)} style={[s.optRow, on ? s.optOnGreen : s.optOff]}>
        <Text style={[s.optText, { color: on ? "#DC2626" : t.dark ? colors.gray[300] : colors.gray[700] }]}>{label}</Text>
      </Pressable>
    )
  }

  return (
    <View style={[s.root, shouldShowGrayscale && grayStyle]}>
      {/* Header above the list (web: fixed header + spacer) */}
      <View
        ref={stickyHeaderRef}
        style={[s.header, { paddingTop: insets.top }]}
        onLayout={(e) => setStickyHeaderHeight(e.nativeEvent.layout.height)}
      >
        {/* Search Bar with Back Button */}
        {!hideHeader && (
          <View style={s.searchRow}>
            <Pressable
              onPress={() => navigate(toFoodUserPath("/user"), { replace: true })}
              style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}
            >
              <ArrowLeft size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
            </Pressable>

            <View style={{ flex: 1, position: "relative" }}>
              <View style={s.searchIcon} pointerEvents="none">
                <Search size={16} color={colors.gray[500]} />
              </View>
              <TextInput
                placeholder="Restaurant name or a dish..."
                placeholderTextColor={t.dark ? colors.gray[400] : colors.gray[600]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={s.searchInput}
                returnKeyType="search"
              />
            </View>
          </View>
        )}

        {/* Browse Category Section */}
        {!hideCategoryCarousel && (
          <ScrollView
            ref={categoryScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[s.rail, { flexGrow: 0 }]}
            contentContainerStyle={s.railContent}
            onLayout={(e) => { categoryRailWidthRef.current = e.nativeEvent.layout.width }}
          >
            {showCategorySkeleton || ((loadingCategories || loadingZone) && displayCategories.length <= 1) ? (
              <CategoryChipRowSkeleton style={{ paddingVertical: sp(3) }} />
            ) : displayCategories.length > 0 ? (
              displayCategories.map((cat) => {
                const categorySlug = cat.slug || cat.id
                const isSelected = selectedCategory === categorySlug || selectedCategory === cat.id
                const isAllCategory = categorySlug === "all" || cat.id === "all"
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => handleCategorySelect(cat)}
                    onLayout={(e) => {
                      categoryChipXRef.current[cat.id] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }
                      if (isSelected) centerSelectedCategoryChip()
                    }}
                    style={[s.catChip, isSelected && s.catChipSelected]}
                  >
                    {isAllCategory ? (
                      <View style={[s.catCircle, s.catCircleCenter, isSelected ? s.catCircleAllOn : s.catCircleAllOff]}>
                        <Grid2x2 size={24} color={isSelected ? "#DC2626" : t.dark ? colors.gray[400] : colors.gray[500]} />
                      </View>
                    ) : cat.image ? (
                      <View style={[s.catCircle, { borderColor: isSelected ? "#DC2626" : "transparent" }, isSelected && shadow.lg]}>
                        <CategoryChipImage uri={cat.image} style={s.fill} />
                      </View>
                    ) : (
                      <View
                        style={[s.catCircle, s.catCircleCenter, s.catInitials, isSelected && s.catCircleAllOn]}
                        accessibilityLabel={`${cat.name} category`}
                      >
                        <Text style={s.catInitialsText}>
                          {String(cat.name || "?").trim().slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={[s.catName, { color: isSelected ? "#DC2626" : t.dark ? colors.gray[400] : colors.gray[600] }]} numberOfLines={1}>
                      {cat.name}
                    </Text>
                  </Pressable>
                )
              })
            ) : (
              <View style={s.noCats}>
                <Text style={s.noCatsText}>No categories available</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={isContentLoading && visibleAllRestaurants.length === 0 ? [] : visibleAllRestaurants}
        keyExtractor={(restaurant, index) => String(restaurant.id || index)}
        renderItem={renderRestaurant}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ zIndex: 10 }}
        ListFooterComponent={listFooter}
        onEndReached={loadMoreAllRestaurants}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y
          liveScrollYRef.current = y
          reportBrowseScroll(categoryBackPath, y)
        }}
        scrollEventThrottle={32}
        onScrollBeginDrag={notifyBrowseUserIntent}
        onContentSizeChange={(w, h) => { listContentHeightRef.current = h }}
        onLayout={(e) => { listViewportHeightRef.current = e.nativeEvent.layout.height }}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={{ paddingBottom: sp(6) }}
        initialNumToRender={ALL_LIST_INITIAL_VISIBLE}
        windowSize={9}
      />

      {/* Filter Modal - Bottom Sheet */}
      <Sheet open={isFilterOpen} onClose={() => setIsFilterOpen(false)} style={[s.filterSheet, { height: screenHeight * 0.85 }]}>
        {/* Header */}
        <View style={s.filterHeader}>
          <Text style={s.filterTitle}>Filters and sorting</Text>
          <Pressable
            onPress={() => {
              setIsLoadingFilterResults(true)
              setActiveFilters(new Set())
              setSortBy(null)
              setTimeout(() => setIsLoadingFilterResults(false), 500)
            }}
          >
            <Text style={s.clearAll}>Clear all</Text>
          </Pressable>
        </View>

        {/* Body */}
        <View style={s.filterBody}>
          {/* Left Sidebar - Tabs */}
          <View style={s.filterTabs}>
            {filterTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeScrollSection === tab.id || activeFilterTab === tab.id
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    setActiveFilterTab(tab.id)
                    const section = filterSectionYRef.current[tab.id]
                    if (section && rightContentRef.current) {
                      rightContentRef.current.scrollTo({ y: section.y, animated: true })
                    }
                  }}
                  style={[s.filterTab, isActive && s.filterTabActive]}
                >
                  {isActive && <View style={s.filterTabBar} />}
                  <Icon size={20} color={isActive ? "#DC2626" : t.dark ? colors.gray[400] : colors.gray[500]} strokeWidth={1.5} />
                  <Text style={[s.filterTabText, { color: isActive ? "#DC2626" : t.dark ? colors.gray[400] : colors.gray[500] }]}>{tab.label}</Text>
                </Pressable>
              )
            })}
          </View>

          {/* Right Content Area - Scrollable */}
          <ScrollView
            ref={rightContentRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: sp(4) }}
            onScroll={handleFilterPaneScroll}
            scrollEventThrottle={32}
          >
            {/* Sort By Tab */}
            <View onLayout={sectionLayout('sort')} style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Sort by</Text>
              <View style={{ gap: sp(3) }}>
                {[
                  { id: null, label: 'Relevance' },
                  { id: 'price-low', label: 'Price: Low to High' },
                  { id: 'price-high', label: 'Price: High to Low' },
                  { id: 'rating-high', label: 'Rating: High to Low' },
                  { id: 'rating-low', label: 'Rating: Low to High' },
                ].map((option) => (
                  <Pressable
                    key={option.id || 'relevance'}
                    onPress={() => setSortBy(option.id)}
                    style={[s.optRow, sortBy === option.id ? s.optOnRed : s.optOff]}
                  >
                    <Text style={[s.optText, { color: sortBy === option.id ? (t.dark ? colors.green[400] : colors.green[600]) : t.dark ? colors.gray[300] : colors.gray[700] }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Time Tab */}
            <View onLayout={sectionLayout('time')} style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Estimated Time</Text>
              <View style={s.tileGrid}>
                {renderTile('under-30-mins', 'Under 30 mins', Timer)}
                {renderTile('delivery-under-45', 'Under 45 mins', Timer)}
              </View>
            </View>

            {/* Rating Tab */}
            <View onLayout={sectionLayout('rating')} style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Restaurant Rating</Text>
              <View style={s.tileGrid}>
                {renderTile('rating-35-plus', 'Rated 3.5+', Star, { starFill: true })}
                {renderTile('rating-4-plus', 'Rated 4.0+', Star, { green: true, starFill: true })}
                {renderTile('rating-45-plus', 'Rated 4.5+', Star, { green: true, starFill: true })}
              </View>
            </View>

            {/* Distance Tab */}
            <View onLayout={sectionLayout('distance')} style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Distance</Text>
              <View style={s.tileGrid}>
                {renderTile('distance-under-1km', 'Under 1 km', MapPin, { green: true })}
                {renderTile('distance-under-2km', 'Under 2 km', MapPin, { green: true })}
              </View>
            </View>

            {/* Price Tab */}
            <View onLayout={sectionLayout('price')} style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Dish Price</Text>
              <View style={{ gap: sp(3) }}>
                {renderPriceRow('price-under-200', 'Under ₹200')}
                {renderPriceRow('under-250', 'Under ₹250')}
                {renderPriceRow('price-under-500', 'Under ₹500')}
              </View>
            </View>

            {/* Offers Tab */}
            <View onLayout={sectionLayout('offers')} style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Offers</Text>
              <View style={s.tileGrid}>
                {renderTile('flat-50-off', 'Flat 50% OFF', BadgePercent, { green: true })}
                {renderTile('price-match', 'Price Match', BadgePercent, { green: true })}
              </View>
            </View>

            {/* Trust Markers Tab */}
            {activeFilterTab === 'trust' && (
              <View style={{ gap: sp(4) }}>
                <Text style={[s.filterSectionTitle, { marginBottom: 0 }]}>Trust Markers</Text>
                <View style={{ gap: sp(3) }}>
                  <Pressable style={[s.optRow, s.optOff]}>
                    <Text style={[s.optText, { color: t.dark ? colors.gray[300] : colors.gray[700] }]}>Top Rated</Text>
                  </Pressable>
                  <Pressable style={[s.optRow, s.optOff]}>
                    <Text style={[s.optText, { color: t.dark ? colors.gray[300] : colors.gray[700] }]}>Trusted by 1000+ users</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Footer */}
        <View style={s.filterFooter}>
          <Pressable onPress={() => setIsFilterOpen(false)} style={s.filterFooterBtn}>
            <Text style={s.filterCloseText}>Close</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setIsLoadingFilterResults(true)
              setIsFilterOpen(false)
              // Simulate loading for 500ms
              setTimeout(() => {
                setIsLoadingFilterResults(false)
              }, 500)
            }}
            style={({ pressed }) => [
              s.filterFooterBtn,
              s.showResultsBtn,
              activeFilters.size > 0 || sortBy ? s.showResultsOn : s.showResultsOff,
              pressed && (activeFilters.size > 0 || sortBy) && { backgroundColor: "#991B1B" },
            ]}
          >
            <Text style={[s.showResultsText, { color: activeFilters.size > 0 || sortBy ? colors.white : t.dark ? colors.gray[400] : colors.gray[500] }]}>
              {activeFilters.size > 0 || sortBy
                ? 'Show results'
                : 'Show results'}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  grayscale: { filter: "grayscale(1)", opacity: 0.75 },
  fill: { width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  header: { zIndex: 40, width: "100%", backgroundColor: t.dark ? "#1a1a1a" : colors.white, ...shadow.sm },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    paddingHorizontal: sp(3),
    paddingVertical: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100],
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.full, flexShrink: 0 },
  searchIcon: { position: "absolute", left: sp(3), top: 0, bottom: 0, justifyContent: "center", zIndex: 1 },
  searchInput: {
    paddingLeft: sp(10),
    paddingRight: sp(4),
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[300],
    backgroundColor: t.dark ? "#1a1a1a" : colors.gray[50],
    ...fontSize.sm,
    color: t.dark ? colors.white : colors.gray[900],
  },
  rail: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100] },
  railContent: { gap: sp(4), paddingHorizontal: sp(4), paddingVertical: sp(3) },
  catChip: { alignItems: "center", gap: sp(1.5), flexShrink: 0, paddingBottom: sp(2), borderBottomWidth: 2, borderBottomColor: "transparent" },
  catChipSelected: { borderBottomColor: "#DC2626" },
  catCircle: { width: 64, height: 64, borderRadius: radius.full, overflow: "hidden", borderWidth: 2 },
  catCircleCenter: { alignItems: "center", justifyContent: "center" },
  catCircleAllOn: { borderColor: "#DC2626", backgroundColor: alpha("#DC2626", t.dark ? 0.2 : 0.1), ...shadow.lg },
  catCircleAllOff: { borderColor: t.dark ? colors.gray[700] : colors.gray[200], backgroundColor: t.dark ? "#222222" : colors.white },
  catInitials: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], borderColor: "transparent" },
  catInitialsText: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[600] },
  catName: { ...fontSize.xs, fontWeight: "500" },
  noCats: { alignItems: "center", justifyContent: "center", paddingVertical: sp(4) },
  noCatsText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600] },
  filtersWrap: { backgroundColor: t.dark ? "#0a0a0a" : colors.white, paddingVertical: sp(3), gap: sp(2) },
  chipRow: { flexDirection: "row", alignItems: "center", gap: sp(2), paddingHorizontal: sp(4), paddingBottom: sp(1) },
  chip: { height: 28, paddingHorizontal: sp(2.5), borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: sp(1.5), flexShrink: 0, borderWidth: 1 },
  chipIdle: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderColor: t.dark ? colors.gray[800] : colors.gray[200], ...shadow.xs },
  chipIdlePressed: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] },
  chipActive: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  chipText: { ...fontSize.xs, fontWeight: "700" },
  content: { paddingHorizontal: sp(4), paddingTop: sp(4) },
  sectionHeading: { ...fontSize.xs, fontWeight: "600", color: t.dark ? colors.gray[500] : colors.gray[400], letterSpacing: 1.2, marginBottom: sp(4) },
  edgeScroll: { marginHorizontal: -sp(4) },
  edgeScrollContent: { paddingHorizontal: sp(4), paddingBottom: sp(1), gap: sp(3) },
  recImageWrap: { position: "relative", borderRadius: radius.xl, overflow: "hidden", marginBottom: sp(2), backgroundColor: t.dark ? colors.gray[800] : colors.gray[200] },
  recOffer: { position: "absolute", top: 6, left: 6, paddingHorizontal: sp(1.5), paddingVertical: sp(0.5), borderRadius: radius.sm, ...shadow.sm },
  recOfferText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  recRating: {
    position: "absolute",
    bottom: 0,
    left: 0,
    backgroundColor: colors.green[600],
    borderWidth: 4,
    borderColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: sp(1.5),
    paddingVertical: sp(0.5),
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  recRatingText: { color: colors.white, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  recTitle: { fontWeight: "600", color: t.dark ? colors.white : colors.gray[900], ...fontSize.xs },
  recSub: { fontSize: 10, lineHeight: 14, color: t.dark ? colors.gray[400] : colors.gray[500] },
  storeTag: { alignSelf: "flex-start", borderRadius: radius.sm, backgroundColor: colors.rose[100], paddingHorizontal: sp(1.5), paddingVertical: sp(0.5) },
  storeTagText: { fontSize: 9, lineHeight: 12, fontWeight: "700", letterSpacing: 0.4, color: colors.rose[700] },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderRadius: radius.lg,
    backgroundColor: t.dark ? alpha("#1a1a1a", 0.92) : alpha(colors.white, 0.92),
    minHeight: 200,
  },
  cardOuter: { paddingHorizontal: sp(4), marginBottom: sp(4) },
  card: { overflow: "hidden", backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderRadius: radius.md, ...shadow.md, width: "100%" },
  cardImage: { position: "relative", height: 176, width: "100%", overflow: "hidden", borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  featuredWrap: { position: "absolute", top: sp(3), left: sp(3), zIndex: 10 },
  featured: { backgroundColor: alpha(colors.gray[800], 0.8), paddingHorizontal: sp(3), paddingVertical: sp(1.5), borderRadius: radius.lg, overflow: "hidden" },
  featuredText: { color: colors.white, ...fontSize.xs, fontWeight: "500" },
  adBadge: { position: "absolute", top: sp(3), right: sp(14), zIndex: 3, backgroundColor: alpha(colors.black, 0.5), paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: radius.sm },
  adText: { color: colors.white, fontSize: 10, lineHeight: 14 },
  bookmarkBtn: {
    position: "absolute",
    top: sp(3),
    right: sp(3),
    zIndex: 3,
    height: 36,
    width: 36,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: t.dark ? alpha("#1a1a1a", 0.9) : alpha(colors.white, 0.9),
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: { padding: sp(3), flex: 1 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(2), marginBottom: sp(2) },
  cardName: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: t.dark ? colors.white : "#1c1c1c", letterSpacing: -0.4 },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: sp(1.5), marginTop: sp(2), flexWrap: "wrap" },
  deliveryText: { ...fontSize.sm, fontWeight: "600", color: "#257d3c" },
  ratingBadge: { flexShrink: 0, backgroundColor: "#257d3c", paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.lg, flexDirection: "row", alignItems: "center", gap: sp(1) },
  ratingText: { ...fontSize.sm, fontWeight: "700", letterSpacing: -0.3, color: colors.white },
  offerRow: { flexDirection: "row", alignItems: "center", gap: sp(2), marginTop: "auto" },
  offerText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.gray[300] : colors.gray[700] },
  loaderRow: { alignItems: "center", paddingVertical: sp(6) },
  emptyWrap: { alignItems: "center", paddingVertical: sp(12), paddingHorizontal: sp(4) },
  emptyText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500], textAlign: "center" },
  outlineBtn: {
    marginTop: sp(4),
    height: 36,
    paddingHorizontal: sp(4),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#f2f0ea",
    backgroundColor: t.dark ? alpha("#f2f0ea", 0.3) : colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.xs,
  },
  outlineBtnText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? "#fafafa" : "#2e1f12" },
  filterSheet: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, flexDirection: "column" },
  filterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[200] },
  filterTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  clearAll: { color: "#DC2626", fontWeight: "500", ...fontSize.sm },
  filterBody: { flex: 1, flexDirection: "row", overflow: "hidden" },
  filterTabs: { width: 96, backgroundColor: t.dark ? "#0a0a0a" : colors.gray[50], borderRightWidth: 1, borderRightColor: t.dark ? colors.gray[800] : colors.gray[200] },
  filterTab: { alignItems: "center", gap: sp(1), paddingVertical: sp(4), paddingHorizontal: sp(2), position: "relative" },
  filterTabActive: { backgroundColor: t.dark ? "#1a1a1a" : colors.white },
  filterTabBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: "#DC2626", borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm },
  filterTabText: { ...fontSize.xs, fontWeight: "500", lineHeight: 15, textAlign: "center" },
  filterSection: { marginBottom: sp(8) },
  filterSectionTitle: { ...fontSize.lg, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(4) },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: sp(3) },
  tile: { width: "47%", alignItems: "center", gap: sp(2), padding: sp(4), borderRadius: radius.xl, borderWidth: 1 },
  optRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: radius.xl, borderWidth: 1 },
  optOnRed: { borderColor: "#DC2626", backgroundColor: t.dark ? alpha("#DC2626", 0.2) : "#F9F9FB" },
  optOnGreen: { borderColor: colors.green[600], backgroundColor: t.dark ? alpha(colors.green[900], 0.2) : colors.green[50] },
  optOff: { borderColor: t.dark ? colors.gray[700] : colors.gray[200] },
  optText: { ...fontSize.sm, fontWeight: "500", textAlign: "center" },
  filterFooter: { flexDirection: "row", alignItems: "center", gap: sp(4), paddingHorizontal: sp(4), paddingVertical: sp(4), borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[200], backgroundColor: t.dark ? "#1a1a1a" : colors.white },
  filterFooterBtn: { flex: 1, paddingVertical: sp(3), alignItems: "center" },
  filterCloseText: { fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700], ...fontSize.sm },
  showResultsBtn: { borderRadius: radius.xl },
  showResultsOn: { backgroundColor: "#DC2626" },
  showResultsOff: { backgroundColor: t.dark ? colors.gray[700] : colors.gray[200] },
  showResultsText: { fontWeight: "600", ...fontSize.sm },
}))
