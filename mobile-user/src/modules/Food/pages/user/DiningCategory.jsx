// Native conversion of Frontend/src/modules/Food/pages/user/DiningCategory.jsx
// Route: /food/user/dining/:category. Sticky header -> View above the list; restaurant grid -> FlatList.
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { FlatList, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "expo-blur"
import { Link, useNavigate, useParams } from "@/lib/router"
import { ArrowLeft, BadgePercent, Bookmark, Clock, MapPin, Star, UtensilsCrossed } from "lucide-react-native"
import { FontAwesome6 } from "@expo/vector-icons"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { useLocationSelector } from "@food/components/user/UserLayout"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { useLocation as useLocationHook } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useProfile } from "@food/context/ProfileContext"
import { diningAPI } from "@food/api"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import { filterRestaurantsForVegMode } from "@food/utils/vegMode"
import { AppImage, Screen, Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, radius, sp, useTheme } from "@/theme"

const RED = "#DC2626"

const slugifyRestaurant = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const formatAddress = (restaurant) =>
  restaurant?.location?.addressLine1 ||
  restaurant?.location?.formattedAddress ||
  restaurant?.location?.address ||
  [restaurant?.location?.area || restaurant?.area, restaurant?.location?.city || restaurant?.city]
    .filter(Boolean)
    .join(", ") ||
  "Address unavailable"

const formatTimeValue = (value) => {
  if (!value) return null
  if (/[ap]m/i.test(value)) return value.toUpperCase()
  const date = new Date(`2000-01-01T${String(value).padStart(5, "0")}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
}

const formatTimingLabel = (status) => {
  if (!status?.openingTime || !status?.closingTime) return "Timings not updated"
  return `${formatTimeValue(status.openingTime)} - ${formatTimeValue(status.closingTime)}`
}

const formatCategoryHeading = (category) =>
  String(category || "dining")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

// <img onError={display:none}>
function HideOnErrorImage({ src, style }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) return null
  return <AppImage src={src} style={style} contentFit="cover" onError={() => setFailed(true)} />
}

export default function DiningCategory() {
  const { category } = useParams()
  // eslint-disable-next-line no-unused-vars
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const t = useTheme()
  const s = useStyles()
  const { openLocationSelector } = useLocationSelector()
  const { location } = useLocationHook()
  // the dining list is per delivery zone: without zoneId the server returns nothing
  const { zoneId, loading: zoneLoading } = useZone(location)
  const { addFavorite, removeFavorite, isFavorite, vegMode, vegModeOption } = useProfile()

  const [restaurants, setRestaurants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchRestaurants = async () => {
      if (zoneLoading) return
      if (!zoneId) {
        setRestaurants([])
        setIsLoading(false)
        return
      }
      try {
        setIsLoading(true)
        const params = { zoneId }
        if (category) params.category = category
        if (location?.city) params.city = location.city
        const response = await diningAPI.getRestaurants(params)

        if (response?.data?.success) {
          const mapped = (Array.isArray(response.data.data) ? response.data.data : []).map((restaurant) => {
            const availability = getRestaurantAvailabilityStatus(restaurant)
            return {
              id: restaurant._id || restaurant.id,
              slug: restaurant.restaurantNameNormalized || slugifyRestaurant(restaurant.restaurantName || restaurant.name),
              name: restaurant.restaurantName || restaurant.name || "Restaurant",
              image:
                restaurant.coverImage ||
                restaurant.menuImages?.[0] ||
                restaurant.profileImage?.url ||
                restaurant.profileImage ||
                "",
              address: formatAddress(restaurant),
              cuisine:
                Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0
                  ? restaurant.cuisines.join(" • ")
                  : "Multi-cuisine",
              price: restaurant.costForTwo ? `Rs ${restaurant.costForTwo} for two` : "Price on request",
              rating: Number(restaurant.rating || restaurant.avgRating || 0).toFixed(1),
              offer: restaurant.offer || "Pre-book tables and dining offers",
              featuredDish: restaurant.featuredDish || "Chef's special",
              pureVegRestaurant:
                restaurant.pureVegRestaurant === true ||
                restaurant.diningSettings?.pureVegRestaurant === true,
              hasNonVegMenu: restaurant.hasNonVegMenu,
              isPureVeg: restaurant.isPureVeg,
              featuredPrice: restaurant.featuredPrice || null,
              availability,
            }
          })
          setRestaurants(mapped)
          setError(null)
        } else {
          setRestaurants([])
        }
      } catch (fetchError) {
        setError("Failed to load dining restaurants")
        setRestaurants([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRestaurants()
  }, [category, location?.city, zoneId, zoneLoading])

  const cityName = location?.city || "Select location"
  const heading = useMemo(() => formatCategoryHeading(category), [category])
  const visibleRestaurants = useMemo(
    () => filterRestaurantsForVegMode(restaurants, { vegMode, vegModeOption }),
    [restaurants, vegMode, vegModeOption],
  )

  const handleLocationClick = useCallback(() => {
    openLocationSelector()
  }, [openLocationSelector])

  const hero = (
    <View style={{ paddingHorizontal: sp(4), paddingTop: sp(6) }}>
      <View style={s.hero}>
        <LinearGradient
          colors={t.dark ? ["#161616", "#101010", "#1a1a1a"] : ["#fff4e7", "#ffffff", "#fff9f3"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
        />
        <View style={{ gap: sp(4) }}>
          <View>
            <Text style={s.heroEyebrow}>Dining Category</Text>
            <Text style={s.heroTitle}>{heading}</Text>
            <Text style={s.heroText}>
              Explore all restaurants linked to this dining category, check their timings, preview the menu, and jump straight into table booking.
            </Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <View style={s.countPill}>
              <MapPin size={16} color={RED} />
              <Text style={s.countPillText}>{visibleRestaurants.length} places found</Text>
            </View>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: sp(20) }}>
          <Text style={[s.stateText, { color: t.dark ? colors.gray[400] : "#7f6850" }]}>Loading dining restaurants...</Text>
        </View>
      ) : error ? (
        <View style={{ paddingVertical: sp(20) }}>
          <Text style={[s.stateText, { color: colors.red[600] }]}>{error}</Text>
        </View>
      ) : visibleRestaurants.length === 0 ? (
        <View style={s.empty}>
          <Text style={[s.stateText, { color: t.dark ? colors.gray[400] : "#7f6850" }]}>
            No restaurants are linked to this dining category yet.
          </Text>
        </View>
      ) : null}
    </View>
  )

  const renderRestaurant = ({ item: restaurant }) => {
    const favorite = isFavorite(restaurant.slug)

    const toggleFavorite = () => {
      if (favorite) {
        removeFavorite(restaurant.slug)
        return
      }

      addFavorite({
        slug: restaurant.slug,
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        rating: restaurant.rating,
        image: restaurant.image,
      })
    }

    return (
      <View style={{ paddingHorizontal: sp(4), marginBottom: sp(5) }}>
        <Link to={`/food/user/dining/${category}/${restaurant.slug}`} state={{ restaurant }} style={s.cardShadow}>
          <Card style={s.card}>
            <View style={s.cardImage}>
              <HideOnErrorImage src={restaurant.image} style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={[alpha("#000000", 0.8), alpha("#000000", 0.2), "transparent"]}
                locations={[0, 0.5, 1]}
                start={{ x: 0.5, y: 1 }}
                end={{ x: 0.5, y: 0 }}
                style={StyleSheet.absoluteFill}
              />

              <View style={s.cardTopRow}>
                <View style={s.featuredPill}>
                  <BlurView intensity={8} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 9999, overflow: "hidden" }]} />
                  <Text style={s.featuredText}>
                    {restaurant.featuredDish}
                    {restaurant.featuredPrice ? ` • ${"₹"}${restaurant.featuredPrice}` : ""}
                  </Text>
                </View>
                <Button variant="ghost" size="icon" onPress={toggleFavorite} style={s.bookmarkBtn}>
                  <Bookmark size={20} color={t.dark ? colors.white : "#2f2215"} fill={favorite ? (t.dark ? colors.white : "#2f2215") : "none"} />
                </Button>
              </View>

              <View style={s.cardBottom}>
                <Text style={s.reserve}>Reserve Your Table</Text>
                <Text style={s.offer}>{restaurant.offer}</Text>
              </View>
            </View>

            <CardContent style={s.cardContent}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.name} numberOfLines={1}>{restaurant.name}</Text>
                  <Text style={s.address} numberOfLines={2}>{restaurant.address}</Text>
                </View>
                <View style={s.rating}>
                  <Text style={s.ratingText}>{restaurant.rating}</Text>
                  <Star size={14} color={colors.white} fill={colors.white} />
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                <UtensilsCrossed size={16} color={RED} />
                <Text style={s.cuisine} numberOfLines={1}>{restaurant.cuisine}</Text>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp(2) }}>
                <View style={[s.statusPill, restaurant.availability?.isOpen ? s.openPill : s.closedPill]}>
                  <Clock size={14} color={restaurant.availability?.isOpen ? (t.dark ? colors.emerald[300] : colors.emerald[700]) : (t.dark ? colors.rose[300] : colors.rose[700])} />
                  <Text style={[s.pillText, { color: restaurant.availability?.isOpen ? (t.dark ? colors.emerald[300] : colors.emerald[700]) : (t.dark ? colors.rose[300] : colors.rose[700]) }]}>
                    {restaurant.availability?.isOpen ? "Open now" : "Closed now"}
                  </Text>
                </View>
                <View style={s.timingPill}>
                  <Text style={[s.pillText, { color: t.dark ? colors.orange[300] : "#a25b1f" }]}>{formatTimingLabel(restaurant.availability)}</Text>
                </View>
              </View>

              <View style={s.cardFooter}>
                <Text style={s.price}>{restaurant.price}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                  <BadgePercent size={16} color={RED} />
                  <Text style={s.menuBooking}>Menu & booking</Text>
                </View>
              </View>
            </CardContent>
          </Card>
        </Link>
      </View>
    )
  }

  return (
    <Screen bg={t.dark ? "#0a0a0a" : "#fffaf4"}>
      <AnimatedPage style={{ flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#fffaf4" }}>
        <View style={s.header}>
          <View style={s.headerInner}>
            <Button variant="ghost" size="icon" onPress={goBack} style={s.backBtn}>
              <ArrowLeft size={20} color={t.dark ? colors.white : "#2f2215"} />
            </Button>

            <Button variant="ghost" onPress={handleLocationClick} style={s.locationBtn}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                <FontAwesome6 name="location-dot" size={16} color={RED} />
                <View>
                  <Text style={s.diningIn}>Dining In</Text>
                  <Text style={s.city}>{cityName}</Text>
                </View>
              </View>
            </Button>
          </View>
        </View>

        <FlatList
          data={isLoading || error ? [] : visibleRestaurants}
          keyExtractor={(restaurant, index) => String(restaurant.id || index)}
          renderItem={renderRestaurant}
          ListHeaderComponent={hero}
          ListFooterComponent={<View style={{ height: sp(6) + 96 }} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 0 }}
        />
      </AnimatedPage>
    </Screen>
  )
}

const useStyles = makeStyles((t) => {
  const dark = t.dark
  return {
    header: {
      zIndex: 30,
      borderBottomWidth: 1,
      borderBottomColor: dark ? colors.gray[800] : "#efe2d2",
      backgroundColor: dark ? "rgba(10,10,10,0.95)" : "rgba(255,250,244,0.95)",
    },
    headerInner: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(4) },
    backBtn: { height: 40, width: 40, borderRadius: 20, borderWidth: 1, borderColor: dark ? colors.gray[700] : "#e7d8c5", backgroundColor: dark ? "#1a1a1a" : colors.white },
    locationBtn: { height: undefined, borderRadius: 9999, borderWidth: 1, borderColor: dark ? colors.gray[700] : "#e7d8c5", backgroundColor: dark ? "#1a1a1a" : colors.white, paddingHorizontal: sp(4), paddingVertical: sp(2), justifyContent: "flex-start" },
    diningIn: { ...fontSize.xs, fontWeight: "600", textTransform: "uppercase", letterSpacing: 2.9, color: dark ? colors.gray[400] : "#aa8b68" },
    city: { ...fontSize.sm, fontWeight: "700", color: dark ? colors.white : "#2f2215" },

    hero: {
      marginBottom: sp(6),
      borderRadius: 28,
      borderWidth: 1,
      borderColor: dark ? colors.gray[800] : "#f0dfca",
      padding: sp(6),
      elevation: 8,
      shadowColor: dark ? "#000000" : "#5a3714",
      shadowOpacity: dark ? 0.35 : 0.08,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 18 },
      backgroundColor: dark ? "#141414" : colors.white,
    },
    heroEyebrow: { marginBottom: sp(2), ...fontSize.xs, fontWeight: "600", textTransform: "uppercase", letterSpacing: 4.1, color: dark ? colors.orange[300] : "#c07a3a" },
    heroTitle: { ...fontSize["3xl"], fontWeight: "900", letterSpacing: -0.75, color: dark ? colors.white : "#23180f" },
    heroText: { marginTop: sp(2), ...fontSize.sm, color: dark ? colors.gray[300] : "#6b5641" },
    countPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: sp(2),
      borderRadius: 9999,
      backgroundColor: dark ? "#1a1a1a" : colors.white,
      paddingHorizontal: sp(4),
      paddingVertical: sp(2),
      borderWidth: dark ? 1 : 0,
      borderColor: colors.gray[700],
      elevation: 1,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    countPillText: { ...fontSize.sm, fontWeight: "600", color: dark ? colors.gray[300] : "#6b5641" },
    stateText: { ...fontSize.base, textAlign: "center" },
    empty: { borderRadius: 24, borderWidth: 1, borderStyle: "dashed", borderColor: dark ? colors.gray[800] : "#e8d9c5", backgroundColor: dark ? "#141414" : colors.white, paddingHorizontal: sp(6), paddingVertical: sp(16) },

    cardShadow: {
      borderRadius: 30,
      backgroundColor: dark ? "#141414" : colors.white,
      elevation: 8,
      shadowColor: dark ? "#000000" : "#111827",
      shadowOpacity: dark ? 0.35 : 0.08,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 18 },
    },
    card: { overflow: "hidden", borderRadius: 30, borderWidth: 1, borderColor: dark ? colors.gray[800] : "#f0dfca", backgroundColor: dark ? "#141414" : colors.white, paddingVertical: 0, gap: 0 },
    cardImage: { position: "relative", height: 256, overflow: "hidden" },
    cardTopRow: { position: "absolute", left: sp(4), right: sp(4), top: sp(4), flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) },
    featuredPill: { borderRadius: 9999, backgroundColor: alpha("#000000", 0.6), paddingHorizontal: sp(3), paddingVertical: 6, overflow: "hidden", flexShrink: 1 },
    featuredText: { ...fontSize.xs, fontWeight: "600", color: colors.white },
    bookmarkBtn: { height: 40, width: 40, borderRadius: 20, backgroundColor: dark ? alpha("#1f1f1f", 0.9) : alpha("#ffffff", 0.9) },
    cardBottom: { position: "absolute", bottom: sp(4), left: sp(4), right: sp(4) },
    reserve: { marginBottom: sp(2), fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 3.5, color: alpha("#ffffff", 0.8) },
    offer: { maxWidth: "85%", ...fontSize["2xl"], lineHeight: 30, fontWeight: "900", color: colors.white },
    cardContent: { gap: sp(4), padding: sp(5) },
    name: { fontSize: 22, lineHeight: 27.5, fontWeight: "900", color: dark ? colors.white : "#23180f" },
    address: { marginTop: sp(2), ...fontSize.sm, lineHeight: 24, color: dark ? colors.gray[300] : "#6b5641" },
    rating: { flexDirection: "row", alignItems: "center", gap: sp(1), borderRadius: radius["2xl"], backgroundColor: colors.emerald[600], paddingHorizontal: 10, paddingVertical: 6 },
    ratingText: { ...fontSize.sm, fontWeight: "700", color: colors.white },
    cuisine: { ...fontSize.sm, color: dark ? colors.gray[300] : "#5f4c39", flexShrink: 1 },
    statusPill: { flexDirection: "row", alignItems: "center", gap: sp(2), borderRadius: 9999, paddingHorizontal: sp(3), paddingVertical: 6 },
    openPill: { backgroundColor: dark ? alpha(colors.emerald[950], 0.4) : colors.emerald[50] },
    closedPill: { backgroundColor: dark ? alpha(colors.rose[950], 0.4) : colors.rose[50] },
    timingPill: { flexDirection: "row", alignItems: "center", borderRadius: 9999, backgroundColor: dark ? "#2a1d12" : "#fff4e7", paddingHorizontal: sp(3), paddingVertical: 6 },
    pillText: { ...fontSize.xs, fontWeight: "600" },
    cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderStyle: "dashed", borderTopColor: dark ? colors.gray[700] : "#ead7c0", paddingTop: sp(4) },
    price: { ...fontSize.sm, fontWeight: "600", color: dark ? colors.gray[200] : "#4c3b2c" },
    menuBooking: { ...fontSize.sm, fontWeight: "700", color: RED },
  }
})
