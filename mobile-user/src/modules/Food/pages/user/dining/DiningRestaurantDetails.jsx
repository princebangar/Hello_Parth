// Web: modules/Food/pages/user/dining/DiningRestaurantDetails.jsx — dining restaurant page (hero, menu / photos /
// about with sticky tabs, book-a-table guest sheet). Same lookups and fallbacks as the web.
// Sticky tab bar -> ScrollView stickyHeaderIndices; scrollIntoView -> scrollTo the section's measured offset.
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "expo-blur"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, CheckCircle2, IndianRupee, Loader2, MapPin, Share2, Ticket, X } from "lucide-react-native"
import { router } from "expo-router"
import { useLocation, useNavigate, useParams } from "@/lib/router"
import { AppImage, Screen, Sheet, Text } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import { Spin } from "@/shared/components/Loader"
import { restaurantAPI, diningAPI } from "@food/api"
import { useProfile } from "@food/context/ProfileContext"
import { getMenuFromResponse } from "@food/utils/menuItems"
import { isVegMenuItem } from "@food/utils/vegMode"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { isModuleAuthenticated } from "@food/utils/auth"
import { Button } from "@food/components/ui/button"
import { toast } from "@/lib/toast"

// The web calls debugError without defining it (a failed bookings fetch then threw into the outer catch and showed
// "Failed to load restaurant"); here it is the same no-op the other pages use.
const debugError = (..._args) => {}

const formatAddress = (restaurant) =>
  restaurant?.location?.formattedAddress ||
  restaurant?.location?.address ||
  restaurant?.location?.addressLine1 ||
  [restaurant?.location?.area || restaurant?.area, restaurant?.location?.city || restaurant?.city].filter(Boolean).join(", ")

const buildImageList = (restaurant) => {
  const candidates = [
    restaurant?.coverImage?.url,
    restaurant?.coverImage,
    ...(Array.isArray(restaurant?.coverImages) ? restaurant.coverImages.map((image) => image?.url || image) : []),
    ...(Array.isArray(restaurant?.menuImages) ? restaurant.menuImages.map((image) => image?.url || image) : []),
    restaurant?.profileImage?.url,
    restaurant?.profileImage,
  ]
  return candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
}

// Facilities are what the restaurant ticked when it asked for dining approval - nothing is invented here.
const buildFacilities = (restaurant) => {
  const facilities = Array.isArray(restaurant?.diningSettings?.facilities) ? [...restaurant.diningSettings.facilities] : []
  if (restaurant?.takeawaySettings?.isEnabled && !facilities.includes("Takeaway available")) facilities.push("Takeaway available")
  if (restaurant?.pureVegRestaurant === true && !facilities.includes("Vegetarian only")) facilities.push("Vegetarian only")
  return facilities
}

const buildFeaturedSections = (menuSections, vegMode = false) =>
  menuSections
    .map((section, index) => {
      const items = [
        ...(Array.isArray(section?.items) ? section.items : []),
        ...(Array.isArray(section?.subsections) ? section.subsections : []).flatMap((subsection) => subsection?.items || []),
      ]
      const visibleItems = vegMode ? items.filter(isVegMenuItem) : items
      if (vegMode && visibleItems.length === 0) return null
      return {
        id: `${section?.name || "section"}-${index}`,
        title: section?.name || "Menu",
        pages: visibleItems.length || 1,
      }
    })
    .filter(Boolean)
    .slice(0, 2)

const formatTimeLabel = (value) => {
  if (!value) return null
  if (/[ap]m/i.test(value)) return value.toUpperCase()
  const date = new Date(`2000-01-01T${String(value).padStart(5, "0")}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
}

export default function DiningRestaurantDetails() {
  const { category, slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { addFavorite, removeFavorite, isFavorite, vegMode } = useProfile()
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const [restaurant, setRestaurant] = useState(location.state?.restaurant || null)
  const [menuSections, setMenuSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedGuests, setSelectedGuests] = useState(2)
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("menu")
  const [currentBookings, setCurrentBookings] = useState([])
  const [, setIsFetchingBookings] = useState(false)
  const [outletTimings, setOutletTimings] = useState({})

  const scrollRef = useRef(null)
  const contentY = useRef(0)
  const sectionY = useRef({})

  const scrollToSection = (id) => {
    const y = sectionY.current[id]
    if (y == null) return
    scrollRef.current?.scrollTo({ y: contentY.current + y, animated: true })
  }

  const fetchRestaurantData = async () => {
    try {
      setLoading(true)
      setError(null)

      const routeRestaurant = location.state?.restaurant || null
      const preferredRestaurantLookup = routeRestaurant?._id || routeRestaurant?.restaurantId || routeRestaurant?.id || slug

      let restaurantResponse = null
      let resolvedRestaurant = null

      try {
        // Since we are in Dining, try diningAPI FIRST!
        const diningRes = await diningAPI.getRestaurantBySlug(slug)
        if (diningRes?.data?.success && diningRes?.data?.data) {
          resolvedRestaurant = diningRes.data.data?.restaurant || diningRes.data.data
          restaurantResponse = diningRes
        }
      } catch {
        // ignored
      }

      if (!resolvedRestaurant) {
        try {
          restaurantResponse = await restaurantAPI.getRestaurantById(preferredRestaurantLookup)
          if (restaurantResponse?.data?.success) {
            resolvedRestaurant = restaurantResponse.data.data?.restaurant || restaurantResponse.data.data
          }
        } catch {
          // Ignored
        }
      }

      if (!resolvedRestaurant && preferredRestaurantLookup !== slug) {
        try {
          restaurantResponse = await restaurantAPI.getRestaurantById(slug)
          if (restaurantResponse?.data?.success) {
            resolvedRestaurant = restaurantResponse.data.data?.restaurant || restaurantResponse.data.data
          }
        } catch {
          // Ignored
        }
      }

      if (!resolvedRestaurant) {
        try {
          const searchResponse = await diningAPI.getRestaurants({ limit: 100 })
          const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []
          const restaurantNameStr = slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
          const matchingRestaurant = restaurants.find((r) => {
            const nameToUse = r.restaurantName || r.name
            if (!nameToUse) return false
            return (
              r.slug === slug ||
              nameToUse.toLowerCase().replace(/\s+/g, "-") === slug.toLowerCase().replace(/\s+/g, "-") ||
              nameToUse.toLowerCase() === restaurantNameStr.toLowerCase() ||
              nameToUse.toLowerCase() === slug.toLowerCase()
            )
          })

          if (matchingRestaurant) {
            const fullResponse = await restaurantAPI.getRestaurantById(matchingRestaurant._id || matchingRestaurant.restaurantId || matchingRestaurant.slug)
            if (fullResponse?.data?.success) {
              restaurantResponse = fullResponse
              resolvedRestaurant = fullResponse.data.data?.restaurant || fullResponse.data.data
            } else {
              resolvedRestaurant = matchingRestaurant
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (!resolvedRestaurant) {
        setError("Restaurant not found")
        setRestaurant(null)
        return
      }

      setRestaurant(resolvedRestaurant)

      const restaurantId = resolvedRestaurant?._id || resolvedRestaurant?.id || slug

      if (isModuleAuthenticated("user")) {
        setIsFetchingBookings(true)
        try {
          const bookingsRes = await diningAPI.getRestaurantBookings(resolvedRestaurant)
          if (bookingsRes.data.success) {
            setCurrentBookings(Array.isArray(bookingsRes.data.data) ? bookingsRes.data.data : [])
          }
        } catch (err) {
          debugError("Error fetching bookings:", err)
        } finally {
          setIsFetchingBookings(false)
        }
      } else {
        setCurrentBookings([])
        setIsFetchingBookings(false)
      }

      restaurantAPI
        .getOutletTimingsByRestaurantId(restaurantId)
        .then((r) => setOutletTimings(r?.data?.data?.outletTimings || {}))
        .catch(() => {})

      const menuResponse = await restaurantAPI.getMenuByRestaurantId(restaurantId).catch(() => null)
      const resolvedMenu = menuResponse ? getMenuFromResponse(menuResponse) : null
      setMenuSections(Array.isArray(resolvedMenu?.sections) ? resolvedMenu.sections : [])
    } catch {
      setError("Failed to load restaurant")
      setRestaurant(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRestaurantData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.restaurant, slug])

  // Calculate current occupied seats
  const occupiedSeats = useMemo(() => {
    const now = new Date()
    const THIRTY_MINUTES = 30 * 60 * 1000
    return currentBookings
      .filter((b) => {
        const isApproved = b.status === "approved"
        const isPending = b.status === "pending"
        if (isApproved) return true
        if (isPending) {
          const createdAt = new Date(b.createdAt || b.date)
          return now - createdAt < THIRTY_MINUTES
        }
        return false
      })
      .reduce((sum, b) => sum + (Number(b.guests) || 0), 0)
  }, [currentBookings])

  const maxCapacity = restaurant?.diningSettings?.maxGuests || 6
  const remainingSeats = Math.max(0, maxCapacity - occupiedSeats)

  if (loading) {
    return (
      <Screen bg="#f6f7fb" statusBarStyle="dark" style={{ alignItems: "center", justifyContent: "center" }}>
        <Spin>
          <Loader2 size={32} color="#DC2626" />
        </Spin>
      </Screen>
    )
  }

  if (error || !restaurant) {
    return (
      <Screen bg="#f6f7fb" statusBarStyle="dark" style={{ alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 24, lineHeight: 32, fontWeight: "700", color: "#23180f", textAlign: "center" }}>Restaurant not found</Text>
        <Button onPress={goBack} variant="outline">
          Go Back
        </Button>
      </Screen>
    )
  }

  const restaurantName = restaurant.name || restaurant.restaurantName || "Restaurant"
  const address = formatAddress(restaurant) || "Address unavailable"
  const imageGallery = buildImageList(restaurant)
  const heroImage = imageGallery[0] || ""
  const menuPreviewImages = imageGallery.length > 0 ? imageGallery : [""]
  const featuredSections = buildFeaturedSections(menuSections, vegMode)
  const cuisines = Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0 ? restaurant.cuisines.join(", ") : ""
  const costForTwo = restaurant?.costForTwo ? `${"₹"}${restaurant.costForTwo} for two` : ""
  const diningCategoryNames = Array.isArray(restaurant?.diningCategories) ? restaurant.diningCategories.map((c) => c.name).filter(Boolean) : []
  const facilities = buildFacilities(restaurant)
  const rating = Number(restaurant?.rating || restaurant?.avgRating || 0).toFixed(1)
  const reviewCount = restaurant?.totalRatings || restaurant?.reviewCount || restaurant?.reviewsCount || 0
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" })
  const todayTiming = outletTimings?.[todayName] || null
  const rawOpeningTime = todayTiming?.openingTime || restaurant?.openingTime || restaurant?.diningSettings?.openingTime || "12:00"
  const rawClosingTime = todayTiming?.closingTime || restaurant?.closingTime || restaurant?.diningSettings?.closingTime || "23:59"
  const openingTime = formatTimeLabel(rawOpeningTime)
  const closingTime = formatTimeLabel(rawClosingTime)

  const isOpenNow = (() => {
    if (todayTiming?.isOpen === false) return false
    const parseMin = (val) => {
      if (!val) return null
      const raw = String(val).trim()
      const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/)
      if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2])
      const ampm = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
      if (ampm) {
        let h = Number(ampm[1])
        const m = Number(ampm[2] || 0)
        const period = ampm[3].toUpperCase()
        if (period === "PM" && h !== 12) h += 12
        if (period === "AM" && h === 12) h = 0
        return h * 60 + m
      }
      return null
    }
    const now = new Date()
    const cur = now.getHours() * 60 + now.getMinutes()
    const open = parseMin(rawOpeningTime)
    let close = parseMin(rawClosingTime)
    if (open === null || close === null) return true
    if (close <= open) close += 24 * 60
    return cur >= open && cur <= close
  })()
  const isDiningEnabled = restaurant?.diningSettings?.isEnabled !== false
  const topTabs = [
    { id: "menu", label: "Menu", target: "restaurant-menu" },
    { id: "photos", label: "Photos", target: "restaurant-photos" },
    { id: "about", label: "About", target: "restaurant-about" },
  ]

  const handleShare = async () => {
    const shareData = {
      title: restaurantName,
      text: `Check out ${restaurantName} on Hello Parth Food!`,
      url: window.location.href,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copied to clipboard!")
    } catch (err) {
      if (err?.name !== "AbortError") {
        toast.error("Sharing failed. Please try again.")
      }
    }
  }

  const restaurantFavoriteSlug = restaurant?.restaurantNameNormalized || restaurant?.slug || slug
  const favorite = isFavorite(restaurantFavoriteSlug)

  const handleBack = () => {
    // web: window.history.length > 1
    if (router.canGoBack()) {
      goBack()
      return
    }
    if (category) {
      navigate(`/food/user/dining/${category}`)
      return
    }
    navigate("/food/user/dining")
  }

  // Kept from the web (the favourite button is not rendered there either).
  const handleToggleFavorite = () => {
    if (favorite) {
      removeFavorite(restaurantFavoriteSlug)
      return
    }
    addFavorite({ slug: restaurantFavoriteSlug, name: restaurantName, cuisine: cuisines, rating, image: heroImage })
  }
  void handleToggleFavorite

  const handleContinueBooking = () => {
    if (!isDiningEnabled) return
    setIsBookingSheetOpen(false)
    navigate(`/food/user/dining/book/${slug}`, {
      state: { guestCount: selectedGuests, restaurant },
    })
  }

  const handleOpenBookingSheet = () => {
    if (!isDiningEnabled) return
    if (!isModuleAuthenticated("user")) {
      window.dispatchEvent(new CustomEvent("show-login-required"))
      return
    }
    setIsBookingSheetOpen(true)
  }

  const textMain = t.dark ? colors.slate[100] : "#23180f"
  const textSub = t.dark ? colors.slate[400] : "#7f7a73"
  const placeholderText = t.dark ? colors.slate[400] : "#a28868"
  const colW = (Math.min(width, 448) - 32 - 12) / 2

  const recordSection = (id) => (e) => {
    sectionY.current[id] = e.nativeEvent.layout.y
  }

  const photos = imageGallery.length > 0 ? imageGallery.slice(0, 4) : menuPreviewImages.slice(0, 2)
  const sheetDisabled = remainingSeats === 0 || selectedGuests > remainingSeats

  return (
    <Screen edges={[]} bg={t.dark ? colors.slate[950] : "#f6f7fb"} statusBarStyle="light">
      <ScrollView ref={scrollRef} stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 112 }}>
        {/* 0: hero + book button */}
        <View style={{ backgroundColor: t.dark ? colors.slate[950] : "#f6f7fb" }}>
          <View style={{ height: 392, overflow: "hidden" }}>
            {heroImage ? (
              <AppImage src={heroImage} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={restaurantName} />
            ) : (
              <LinearGradient colors={["#eadcc7", "#a09279", "#655749"]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.78)"]} style={StyleSheet.absoluteFill} />

            <View style={[s.heroTop, { paddingTop: insets.top + 12 }]}>
              <Pressable onPress={handleBack} style={({ pressed }) => [s.roundBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <ArrowLeft size={20} color={colors.white} />
              </Pressable>
              <Pressable onPress={handleShare} style={({ pressed }) => [s.roundBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <Share2 size={20} color={colors.white} />
              </Pressable>
            </View>

            <View style={s.heroBottom}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.heroName}>{restaurantName}</Text>
                  <Text style={s.heroAddress}>{address}</Text>
                  {!!(costForTwo || cuisines) && (
                    <Text style={s.heroMeta}>
                      {costForTwo}
                      {costForTwo && cuisines ? <Text style={{ color: alpha(colors.white, 0.65) }}>{"  •  "}</Text> : null}
                      {cuisines}
                    </Text>
                  )}
                  {diningCategoryNames.length > 0 && (
                    <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {diningCategoryNames.map((name) => (
                        <View key={name} style={s.catPill}>
                          <Text style={s.catText}>{name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={s.openPill}>
                    {isOpenNow ? <CheckCircle2 size={16} color="#48d597" /> : <View style={{ width: 16, height: 16, borderRadius: 9999, backgroundColor: colors.red[500] }} />}
                    <Text style={[s.openText, { color: isOpenNow ? "#48d597" : colors.red[400] }]}>{isOpenNow ? "Open now" : "Closed"}</Text>
                    {!!(openingTime && closingTime) && (
                      <>
                        <Text style={[s.openText, { color: alpha(colors.white, 0.7) }]}>|</Text>
                        <Text style={[s.openText, { color: colors.white }]}>
                          {openingTime} to {closingTime}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                <View style={s.ratingBox}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <Text style={s.ratingNum}>{rating}</Text>
                    <Text style={{ fontSize: 18, lineHeight: 22, color: "#18b54f" }}>★</Text>
                  </View>
                  <Text style={s.ratingSub}>{reviewCount} Reviews</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 12, paddingBottom: 4, paddingTop: 12 }}>
            <Pressable
              onPress={handleOpenBookingSheet}
              disabled={!isDiningEnabled}
              style={[s.bookPill, isDiningEnabled ? s.bookPillOn : s.bookPillOff]}
            >
              <Ticket size={15} color="#DC2626" />
              <Text style={[s.bookPillText, { color: isDiningEnabled ? (t.dark ? colors.slate[100] : "#2b2118") : "#c06a79" }]}>
                {isDiningEnabled ? "Book a table" : "Dining paused"}
              </Text>
            </Pressable>

            {!isDiningEnabled && (
              <View style={s.pausedNote}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.amber[800] }}>Dining bookings are currently turned off by the restaurant.</Text>
              </View>
            )}
          </View>
        </View>

        {/* 1: sticky tabs */}
        <View style={s.tabsBar}>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            {topTabs.map((tab) => {
              const active = activeTab === tab.id
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    setActiveTab(tab.id)
                    scrollToSection(tab.target)
                  }}
                  style={[
                    s.tab,
                    active
                      ? { borderColor: "#DC2626", backgroundColor: t.dark ? colors.slate[900] : colors.white }
                      : { borderColor: t.dark ? colors.slate[800] : "#ece9e1", backgroundColor: t.dark ? colors.slate[900] : "#fafafa" },
                  ]}
                >
                  <Text style={{ fontSize: 14, lineHeight: 20, color: active ? (t.dark ? colors.slate[100] : "#2a2018") : t.dark ? colors.slate[400] : "#8b8881" }}>{tab.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* 2: sections */}
        <View
          style={{ paddingHorizontal: 16, paddingTop: 8 }}
          onLayout={(e) => {
            contentY.current = e.nativeEvent.layout.y
          }}
        >
          <View style={{ marginTop: 8 }} onLayout={recordSection("restaurant-menu")}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
              <Text style={[s.h2, { color: textMain }]}>Menu</Text>
              <View style={s.dishPill}>
                <Text style={s.dishText}>
                  {featuredSections.length} {featuredSections.length === 1 ? "dish" : "dishes"}
                </Text>
              </View>
            </View>

            <View style={[s.grid2, { marginTop: 16 }]}>
              {(featuredSections.length > 0
                ? featuredSections
                : [
                    { id: "food", title: "Food", pages: 16 },
                    { id: "beverages", title: "Beverages", pages: 10 },
                  ]
              ).map((section, index) => (
                <View key={section.id} style={[s.menuCard, { width: colW }]}>
                  <View style={{ aspectRatio: 0.88, backgroundColor: t.dark ? colors.slate[800] : "#f7f1e7" }}>
                    {menuPreviewImages[index] ? (
                      <AppImage src={menuPreviewImages[index]} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={section.title} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, s.center]}>
                        {!t.dark && <LinearGradient colors={["#fff3e0", "#f3eadf"]} style={StyleSheet.absoluteFill} />}
                        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: placeholderText }}>Menu preview</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingBottom: 12, paddingTop: 8, alignItems: "center" }}>
                    <Text style={{ fontSize: 16, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.slate[100] : "#2b2218", textAlign: "center" }}>{section.title}</Text>
                    <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 16, color: textSub }}>{section.pages} pages</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={s.sectionDivided} onLayout={recordSection("restaurant-photos")}>
            <Text style={[s.h2, { color: textMain }]}>Photos</Text>
            <View style={[s.grid2, { marginTop: 16 }]}>
              {photos.map((image, index) => (
                <View
                  key={`${image || "placeholder"}-${index}`}
                  style={[
                    s.photo,
                    { backgroundColor: t.dark ? colors.slate[800] : "#f6efe4" },
                    index === 0 ? { width: colW * 2 + 12, aspectRatio: 1.72 } : { width: colW, aspectRatio: 1.08 },
                  ]}
                >
                  {image ? (
                    <AppImage src={image} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`${restaurantName} ${index + 1}`} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, s.center]}>
                      <Text style={{ fontSize: 14, lineHeight: 20, color: placeholderText }}>Photo coming soon</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          <View style={s.sectionDivided} onLayout={recordSection("restaurant-about")}>
            <Text style={[s.h2, { color: textMain }]}>About the restaurant</Text>
            <View style={s.aboutCard}>
              <View style={{ gap: 16 }}>
                {!!costForTwo && (
                  <View style={s.aboutRow}>
                    <IndianRupee size={16} color="#f0b500" style={{ marginTop: 2 }} />
                    <Text style={s.aboutText}>{costForTwo}</Text>
                  </View>
                )}
                {!!cuisines && (
                  <View style={s.aboutRow}>
                    <View style={{ marginTop: 7, width: 8, height: 8, borderRadius: 9999, backgroundColor: "#8a8f9d" }} />
                    <Text style={s.aboutText}>{cuisines}</Text>
                  </View>
                )}
                <View style={s.aboutRow}>
                  <MapPin size={16} color="#DC2626" style={{ marginTop: 2 }} />
                  <Text style={s.aboutText}>{address}</Text>
                </View>
              </View>

              {diningCategoryNames.length > 0 && (
                <View style={s.aboutSub}>
                  <Text style={[s.h3, { color: textMain }]}>Featured In</Text>
                  <View style={s.featured}>
                    <View style={{ aspectRatio: 1.2, backgroundColor: t.dark ? colors.slate[700] : "#efe8df" }}>
                      {heroImage ? (
                        <AppImage src={heroImage} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={restaurantName} />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, s.center]}>
                          <Text style={{ fontSize: 14, lineHeight: 20, color: placeholderText }}>Featured image</Text>
                        </View>
                      )}
                    </View>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]} style={s.featuredCaption}>
                      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.white }}>{diningCategoryNames.join(" • ")}</Text>
                    </LinearGradient>
                  </View>
                </View>
              )}

              {facilities.length > 0 && (
                <View style={s.aboutSub}>
                  <Text style={[s.h3, { color: textMain }]}>Facilities</Text>
                  <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
                    {facilities.slice(0, 6).map((facility) => (
                      <View key={facility} style={{ width: "50%", paddingRight: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 9999, borderWidth: 1, borderColor: "#8a8f9d" }} />
                        <Text style={[s.aboutText, { flex: 1 }]}>{facility}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed bottom bar */}
      <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          onPress={handleOpenBookingSheet}
          disabled={!isDiningEnabled}
          style={({ pressed }) => [s.bottomBtn, isDiningEnabled ? s.bottomBtnOn : s.bottomBtnOff, pressed && isDiningEnabled && { backgroundColor: t.dark ? colors.slate[800] : "#fdfafc" }]}
        >
          <Text style={[s.bottomBtnText, { color: isDiningEnabled ? (t.dark ? colors.purple[400] : "#DC2626") : t.dark ? colors.slate[600] : colors.gray[400] }]}>
            {isDiningEnabled ? "Book a table" : "Dining paused"}
          </Text>
        </Pressable>
      </View>

      {/* Guest sheet */}
      <Sheet open={isBookingSheetOpen} onClose={() => setIsBookingSheetOpen(false)} backdropOpacity={0.35} style={s.sheet}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 16 }}>
          <View style={s.grabber} />
          <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: textMain }]}>Select number of guests</Text>
              <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.dark ? colors.slate[400] : "#7b6651" }}>
                {remainingSeats > 0 ? `Only ${remainingSeats} out of ${maxCapacity} seats available now.` : "Fully booked for now. Try later!"}
              </Text>
            </View>
            <Pressable onPress={() => setIsBookingSheetOpen(false)} style={s.sheetClose}>
              <X size={16} color={t.dark ? colors.slate[300] : "#5b5b5b"} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, rowGap: 12 }}>
            {Array.from({ length: maxCapacity }, (_, index) => {
              const count = index + 1
              const isBooked = count <= occupiedSeats
              const isTooLarge = count > remainingSeats && !isBooked
              const active = selectedGuests === count
              let box = { borderColor: t.dark ? colors.slate[800] : "#ece7de", backgroundColor: t.dark ? colors.slate[800] : colors.white }
              let fg = textMain
              if (active) {
                box = { borderColor: "#DC2626", backgroundColor: t.dark ? alpha(colors.purple[950], 0.3) : "#fdfafc", transform: [{ scale: 1.02 }], ...shadow.sm }
                fg = "#DC2626"
              } else if (isBooked) {
                box = { borderColor: t.dark ? alpha(colors.red[900], 0.3) : colors.red[100], backgroundColor: t.dark ? alpha(colors.red[950], 0.2) : colors.red[50], opacity: 0.7 }
                fg = colors.red[400]
              } else if (isTooLarge) {
                box = { borderColor: t.dark ? colors.slate[800] : colors.gray[100], backgroundColor: t.dark ? colors.slate[950] : colors.gray[50] }
                fg = t.dark ? colors.slate[600] : colors.gray[300]
              }
              return (
                <View key={`sheet-${count}`} style={{ width: "25%", paddingHorizontal: 6 }}>
                  <Pressable disabled={isBooked || isTooLarge} onPress={() => setSelectedGuests(count)} style={[s.guestBtn, box]}>
                    {isBooked ? (
                      <View style={{ alignItems: "center", gap: 2 }}>
                        <Text style={{ fontSize: 10, lineHeight: 12, textTransform: "uppercase", fontWeight: "900", letterSpacing: -0.5, opacity: 0.6, color: fg }}>Booked</Text>
                        <Text style={[s.guestText, { color: fg }]}>{count}</Text>
                      </View>
                    ) : (
                      <Text style={[s.guestText, { color: fg }]}>{count}</Text>
                    )}
                  </Pressable>
                </View>
              )
            })}
          </View>

          <Pressable
            onPress={handleContinueBooking}
            disabled={sheetDisabled}
            style={({ pressed }) => [s.continueBtn, { backgroundColor: sheetDisabled ? colors.gray[200] : pressed ? "#991B1B" : "#DC2626" }]}
          >
            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "700", color: sheetDisabled ? colors.gray[400] : colors.white }}>
              {remainingSeats === 0 ? "Fully Booked" : "Continue"}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  center: { alignItems: "center", justifyContent: "center" },
  heroTop: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  roundBtn: { height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: alpha("#51586a", 0.75), overflow: "hidden" },
  heroBottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 16 },
  heroName: { fontSize: 36, lineHeight: 38, fontWeight: "900", letterSpacing: -1.08, color: colors.white },
  heroAddress: { marginTop: 8, maxWidth: "94%", fontSize: 14, lineHeight: 20, color: alpha(colors.white, 0.92) },
  heroMeta: { marginTop: 8, fontSize: 14, lineHeight: 20, color: alpha(colors.white, 0.9) },
  catPill: { borderRadius: 9999, backgroundColor: alpha(colors.white, 0.2), paddingHorizontal: 10, paddingVertical: 2 },
  catText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.white },
  openPill: { marginTop: 8, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 9999, backgroundColor: alpha(colors.black, 0.28), paddingHorizontal: 10, paddingVertical: 4 },
  openText: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  ratingBox: {
    marginBottom: 4,
    borderRadius: 18,
    backgroundColor: t.dark ? colors.slate[800] : colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    ...shadow.xl,
  },
  ratingNum: { fontSize: 31, lineHeight: 33, fontWeight: "900", color: t.dark ? colors.slate[100] : "#1f2328" },
  ratingSub: { marginTop: 4, fontSize: 13, lineHeight: 16, color: t.dark ? colors.slate[400] : "#6e7481" },
  bookPill: {
    height: 52,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    elevation: 3,
    shadowColor: "rgb(15,23,42)",
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  bookPillOn: { borderColor: t.dark ? colors.slate[800] : "#f1ebee", backgroundColor: t.dark ? colors.slate[900] : colors.white },
  bookPillOff: { borderColor: t.dark ? alpha(colors.red[900], 0.3) : "#f2d7da", backgroundColor: t.dark ? alpha(colors.red[950], 0.2) : "#fff5f6", opacity: 0.8 },
  bookPillText: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  pausedNote: { marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.amber[200], backgroundColor: colors.amber[50], paddingHorizontal: 16, paddingVertical: 12 },
  tabsBar: {
    zIndex: 30,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.slate[800] : "#ececf3",
    backgroundColor: t.dark ? alpha(colors.slate[950], 0.95) : alpha(colors.white, 0.95),
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tab: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 8 },
  h2: { fontSize: 28, lineHeight: 30, fontWeight: "900" },
  h3: { fontSize: 20, lineHeight: 28, fontWeight: "600" },
  dishPill: { borderRadius: 9999, backgroundColor: t.dark ? alpha(colors.orange[950], 0.3) : "#fff3e6", paddingHorizontal: 12, paddingVertical: 4 },
  dishText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: t.dark ? colors.orange[300] : "#e58a2c" },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  menuCard: { overflow: "hidden", borderRadius: 18, borderWidth: 1, borderColor: t.dark ? colors.slate[800] : "#ede8dd", backgroundColor: t.dark ? colors.slate[900] : colors.white },
  sectionDivided: { marginTop: 20, borderTopWidth: 1, borderTopColor: t.dark ? colors.slate[800] : "#e8e8ef", paddingTop: 16 },
  photo: { overflow: "hidden", borderRadius: 18 },
  aboutCard: { marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: t.dark ? colors.slate[800] : "#ececf4", backgroundColor: t.dark ? colors.slate[900] : "#fafbff", padding: 16 },
  aboutRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  aboutText: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.slate[400] : "#5f6474", flexShrink: 1 },
  aboutSub: { marginTop: 20, borderTopWidth: 1, borderTopColor: t.dark ? colors.slate[800] : "#e8e8ef", paddingTop: 16 },
  featured: { marginTop: 12, overflow: "hidden", borderRadius: 16, backgroundColor: t.dark ? colors.slate[800] : colors.white, ...shadow.sm },
  featuredCaption: { marginTop: -56, padding: 12, paddingTop: 40 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    borderTopWidth: 1,
    borderTopColor: t.dark ? colors.slate[800] : "#ebe5da",
    backgroundColor: t.dark ? alpha(colors.slate[950], 0.95) : alpha(colors.white, 0.95),
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  bottomBtn: { height: 48, width: "100%", borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  bottomBtnOn: { borderColor: "#FEE2E2", backgroundColor: t.dark ? colors.slate[900] : colors.white },
  bottomBtnOff: { borderColor: t.dark ? colors.slate[800] : colors.gray[200], backgroundColor: t.dark ? colors.slate[900] : colors.gray[50], opacity: 0.8 },
  bottomBtnText: { fontSize: 17, lineHeight: 24, fontWeight: "500" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: t.dark ? colors.slate[900] : colors.white,
    borderTopWidth: 1,
    borderTopColor: alpha(colors.white, 0.05),
    elevation: 20,
    shadowColor: "rgb(15,23,42)",
    shadowOpacity: 0.18,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: -20 },
  },
  grabber: { alignSelf: "center", marginBottom: 16, height: 6, width: 56, borderRadius: 9999, backgroundColor: t.dark ? colors.slate[700] : "#e7e5e4" },
  sheetTitle: { fontSize: 20, lineHeight: 28, fontWeight: "900" },
  sheetClose: { height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: t.dark ? colors.slate[800] : "#f5f5f5" },
  guestBtn: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  guestText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  continueBtn: { marginTop: 24, height: 48, width: "100%", borderRadius: 16, alignItems: "center", justifyContent: "center" },
}))
