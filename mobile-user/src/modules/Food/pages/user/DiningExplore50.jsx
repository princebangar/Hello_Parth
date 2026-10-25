// Native conversion of Frontend/src/modules/Food/pages/user/DiningExplore50.jsx
// Route: /food/user/dining/explore/upto50. DiningExploreNear.jsx is the same page (only the banner alt text and the
// filter sheet's active-tab colour differ), so both render DiningExploreScreen from this file.
//
// NOT converted on purpose: the web page lists a hard-coded array of six made-up restaurants ("IRIS",
// "Skyline Rooftop", ...) that do not exist in the backend. The app has no sample data, so the list here is empty
// (no API exists for this page on the web either). Everything else (banner, search, chips, filter sheet) is the web's.
import React, { useState, useCallback, useMemo } from "react"
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "expo-blur"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Link, useNavigate } from "@/lib/router"
import { MapPin, Search, Mic, SlidersHorizontal, Star, ArrowDownUp, Timer, IndianRupee, UtensilsCrossed, BadgePercent, Clock, Bookmark, ArrowLeft } from "lucide-react-native"
import { FontAwesome6 } from "@expo/vector-icons"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Card, CardContent } from "@food/components/ui/card"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { StatusBarScrim } from "@/native/ui/StatusBarScrim"
import { useSearchOverlay, useLocationSelector } from "@food/components/user/UserLayout"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { useLocation as useLocationHook } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { AppImage, Screen, Sheet, Text } from "@/native/ui"
import { alpha, colors, fontSize, radius, shadow, sp } from "@/theme"

const RED = "#DC2626"
// Using placeholder for upto 50 off banner (the web's own banner image)
const upto50off = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"

// The web's hard-coded demo restaurants are not shipped (see the note at the top).
const popularRestaurants = []

// <img onError={display:none}>
function HideOnErrorImage({ src, style }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) return null
  return <AppImage src={src} style={style} contentFit="cover" onError={() => setFailed(true)} />
}

/** The shared page (light only on the web: no dark: classes). */
export function DiningExploreScreen({ bannerImage, bannerAlt, activeTabColor }) {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { height: screenHeight } = useWindowDimensions()
  const [heroSearch, setHeroSearch] = useState("")
  // past the banner the list would scroll under the status bar icons: a white strip + dark icons from there on
  const [pastBanner, setPastBanner] = useState(false)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const { openSearch, closeSearch, setSearchValue } = useSearchOverlay()
  const { openLocationSelector } = useLocationSelector()
  // eslint-disable-next-line no-unused-vars
  const { location, loading } = useLocationHook()
  const { addFavorite, removeFavorite, isFavorite } = useProfile()
  const cityName = location?.city || "Select"
  // eslint-disable-next-line no-unused-vars
  const stateName = location?.state || "Location"

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
    let filtered = [...popularRestaurants]

    if (activeFilters.has('delivery-under-30')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 30
      })
    }
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 45
      })
    }
    if (activeFilters.has('distance-under-1km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 1.0
      })
    }
    if (activeFilters.has('distance-under-2km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 2.0
      })
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

    // Apply sorting
    if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    }

    return filtered
  }, [activeFilters, selectedCuisine, sortBy])

  const handleLocationClick = useCallback(() => {
    openLocationSelector()
  }, [openLocationSelector])

  const handleSearchFocus = useCallback(() => {
    if (heroSearch) {
      setSearchValue(heroSearch)
    }
    openSearch()
  }, [heroSearch, openSearch, setSearchValue])

  const chips = [
    { id: 'delivery-under-30', label: 'Under 30 mins' },
    { id: 'delivery-under-45', label: 'Under 45 mins' },
    { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
    { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
    { id: 'rating-35-plus', label: '3.5+ Rating' },
    { id: 'rating-4-plus', label: '4.0+ Rating' },
    { id: 'rating-45-plus', label: '4.5+ Rating' },
  ]

  const tabs = [
    { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
    { id: 'time', label: 'Time', icon: Timer },
    { id: 'rating', label: 'Rating', icon: Star },
    { id: 'distance', label: 'Distance', icon: MapPin },
    { id: 'price', label: 'Dish Price', icon: IndianRupee },
    { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
  ]

  const tileStyle = (active) => [s.tile, active ? s.greenActive : s.idle]
  const tileText = (active) => [s.tileText, active && { color: colors.green[600] }]
  const hasAnyFilter = activeFilters.size > 0 || sortBy || selectedCuisine

  return (
    <Screen bg={colors.white} edges={["bottom"]} statusBarStyle={pastBanner ? "dark" : "light"}>
      <AnimatedPage style={{ flex: 1, backgroundColor: colors.white }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const past = e.nativeEvent.contentOffset.y > screenHeight * 0.3
            setPastBanner((prev) => (prev === past ? prev : past))
          }}
        >
          {/* Banner Section with Back Button and Location */}
          <View style={[s.banner, { minHeight: screenHeight * 0.39 }]}>
            {/* Background banner */}
            <View style={StyleSheet.absoluteFill}>
              <AppImage src={bannerImage} accessibilityLabel={bannerAlt} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </View>

            {/* Navbar with Back Button - Overlay on top of image */}
            <View style={s.nav}>
              <BlurView intensity={6} tint="default" style={StyleSheet.absoluteFill} />
              <SafeTop />
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(3), paddingVertical: sp(3) }}>
                {/* Back Button */}
                <Button variant="ghost" size="icon" onPress={goBack} style={s.backBtn}>
                  <ArrowLeft size={20} color={colors.gray[800]} strokeWidth={2.5} />
                </Button>

                {/* Location with Dotted Underline */}
                <Button variant="ghost" onPress={handleLocationClick} style={s.locationBtn}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), minWidth: 0 }}>
                    <FontAwesome6 name="location-dot" size={16} color={colors.white} />
                    <Text style={s.cityText} numberOfLines={1}>{cityName}</Text>
                  </View>
                </Button>
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={{ paddingHorizontal: sp(4), paddingTop: sp(6) }}>
            {/* Search Bar */}
            <View style={{ marginBottom: sp(6), justifyContent: "center" }}>
              <Input
                value={heroSearch}
                onChangeText={setHeroSearch}
                onFocus={handleSearchFocus}
                onSubmitEditing={() => {
                  // web: onKeyDown Enter
                  if (heroSearch.trim()) {
                    // web: /user/search?q=..., redirected by the app router to /food/user/search
                    navigate(`/food/user/search?q=${encodeURIComponent(heroSearch.trim())}`)
                    closeSearch()
                    setHeroSearch("")
                  }
                }}
                returnKeyType="search"
                placeholder="Search for restaurants, cuisines, dishes..."
                style={s.searchInput}
              />
              <View style={{ position: "absolute", left: sp(4) }} pointerEvents="none">
                <Search size={20} color={colors.gray[400]} />
              </View>
              <View style={{ position: "absolute", right: sp(2) }}>
                <Button
                  variant="ghost"
                  size="icon"
                  style={{ height: 32, width: 32, borderRadius: 16 }}
                  onPress={() => {
                    // Voice search functionality (empty on the web)
                  }}
                >
                  <Mic size={16} color={colors.gray[500]} />
                </Button>
              </View>
            </View>

            {/* Popular Restaurants Around You Section */}
            <View style={{ marginBottom: sp(4), marginTop: sp(2) }}>
              <View style={{ marginBottom: sp(6), alignItems: "center" }}>
                <Text style={s.sectionTitle}>POPULAR RESTAURANTS AROUND YOU</Text>
              </View>

              {/* Filters */}
              <View style={{ paddingVertical: sp(1), marginBottom: sp(4) }}>
                <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 6, paddingVertical: sp(1) }}>
                  {/* Filter Button - Opens Modal */}
                  <Button variant="outline" onPress={() => setIsFilterOpen(true)} style={s.chip}>
                    <SlidersHorizontal size={12} color={colors.gray[700]} />
                    <Text style={s.chipText}>Filters</Text>
                  </Button>

                  {/* Filter Buttons */}
                  {chips.map((filter) => {
                    const Icon = filter.icon
                    const isActive = activeFilters.has(filter.id)
                    return (
                      <Button key={filter.id} variant="outline" onPress={() => toggleFilter(filter.id)} style={[s.chip, isActive && s.chipActive]}>
                        {Icon && <Icon size={12} color={isActive ? colors.white : colors.gray[600]} fill={isActive ? colors.white : "none"} />}
                        <Text style={s.chipText}>{filter.label}</Text>
                      </Button>
                    )
                  })}
                </ScrollView>
              </View>

              {/* Restaurant Cards */}
              <View style={{ gap: sp(4) }}>
                {filteredRestaurants.map((restaurant) => {
                  const restaurantSlug = restaurant.name.toLowerCase().replace(/\s+/g, "-")
                  const favorite = isFavorite(restaurantSlug)

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

                  return (
                    // web: /user/restaurants/<slug> -> /food/user/restaurants/<slug>
                    <Link key={restaurant.id} to={`/food/user/restaurants/${restaurantSlug}`} style={s.cardShadow}>
                      <Card style={s.card}>
                        {/* Image Section */}
                        <View style={s.cardImage}>
                          <HideOnErrorImage src={restaurant.image} style={StyleSheet.absoluteFill} />

                          {/* Featured Dish Badge - Top Left */}
                          <View style={{ position: "absolute", top: sp(3), left: sp(3) }}>
                            <View style={s.featured}>
                              <Text style={s.featuredText}>
                                {restaurant.featuredDish} • ₹{restaurant.featuredPrice}
                              </Text>
                            </View>
                          </View>

                          {/* Bookmark Icon - Top Right */}
                          <View style={{ position: "absolute", top: sp(3), right: sp(3) }}>
                            <Button variant="ghost" size="icon" style={s.bookmarkBtn} onPress={handleToggleFavorite}>
                              <Bookmark size={20} strokeWidth={2} color={favorite ? colors.gray[800] : colors.gray[600]} fill={favorite ? colors.gray[800] : "none"} />
                            </Button>
                          </View>

                          {/* Red Section - Bottom 40% */}
                          <LinearGradient colors={[RED, "transparent"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.band}>
                            <View style={{ flex: 1, justifyContent: "flex-end", paddingLeft: sp(4), paddingBottom: sp(4) }}>
                              <Text style={s.bandEyebrow}>PRE-BOOK TABLE</Text>
                              <View style={{ height: 1, backgroundColor: alpha("#ffffff", 0.3), marginBottom: sp(2), width: 96 }} />
                              <Text style={s.bandOffer}>{restaurant.offer}</Text>
                            </View>
                          </LinearGradient>
                        </View>

                        {/* Content Section */}
                        <CardContent style={{ padding: sp(3) }}>
                          {/* Restaurant Name & Rating */}
                          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(2), marginBottom: sp(2) }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={s.name} numberOfLines={1}>{restaurant.name}</Text>
                            </View>
                            <View style={s.rating}>
                              <Text style={s.ratingText}>{restaurant.rating}</Text>
                              <Star size={12} color={colors.white} fill={colors.white} />
                            </View>
                          </View>

                          {/* Delivery Time & Distance */}
                          <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1), marginBottom: sp(2) }}>
                            <Clock size={16} strokeWidth={1.5} color={colors.gray[500]} />
                            <Text style={s.meta}>{restaurant.deliveryTime}</Text>
                            <Text style={[s.meta, { marginHorizontal: sp(1), fontWeight: "400" }]}>|</Text>
                            <Text style={s.meta}>{restaurant.distance}</Text>
                          </View>

                          {/* Offer Badge */}
                          {restaurant.offer ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                              <BadgePercent size={16} strokeWidth={2} color={RED} />
                              <Text style={{ ...fontSize.sm, color: colors.gray[700], fontWeight: "500" }}>{restaurant.offer}</Text>
                            </View>
                          ) : null}
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </View>
            </View>
          </View>
        </ScrollView>
      </AnimatedPage>
      {pastBanner ? <StatusBarScrim color={colors.white} /> : null}

      {/* Filter Modal */}
      <Sheet open={isFilterOpen} onClose={() => setIsFilterOpen(false)} backdropOpacity={0.5} style={{ backgroundColor: colors.white, maxHeight: screenHeight * 0.85 }}>
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
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeFilterTab === tab.id
              return (
                <Pressable key={tab.id} onPress={() => setActiveFilterTab(tab.id)} style={[s.tabBtn, isActive && { backgroundColor: colors.white }]}>
                  {isActive && <View style={s.tabIndicator} />}
                  <Icon size={20} strokeWidth={1.5} color={isActive ? activeTabColor : colors.gray[500]} />
                  <Text style={[s.tabText, { color: isActive ? activeTabColor : colors.gray[500] }]}>{tab.label}</Text>
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
                    <Pressable key={option.id || 'relevance'} onPress={() => setSortBy(option.id)} style={[s.option, sortBy === option.id ? s.greenActive : s.idle]}>
                      <Text style={tileText(sortBy === option.id)}>{option.label}</Text>
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
                    <Pressable key={opt.id} onPress={() => toggleFilter(opt.id)} style={tileStyle(activeFilters.has(opt.id))}>
                      <Timer size={24} strokeWidth={1.5} color={activeFilters.has(opt.id) ? colors.green[600] : colors.gray[600]} />
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
                      <Pressable key={opt.id} onPress={() => toggleFilter(opt.id)} style={tileStyle(active)}>
                        <Star size={24} color={active ? colors.green[600] : colors.gray[400]} fill={active ? colors.green[600] : "none"} />
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
                    <Pressable key={opt.id} onPress={() => toggleFilter(opt.id)} style={tileStyle(activeFilters.has(opt.id))}>
                      <MapPin size={24} strokeWidth={1.5} color={activeFilters.has(opt.id) ? colors.green[600] : colors.gray[600]} />
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
                  ].map((opt) => (
                    <Pressable key={opt.id} onPress={() => toggleFilter(opt.id)} style={[s.option, activeFilters.has(opt.id) ? s.greenActive : s.idle]}>
                      <Text style={tileText(activeFilters.has(opt.id))}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Cuisine Tab */}
            {activeFilterTab === 'cuisine' && (
              <View style={{ marginBottom: sp(8) }}>
                <Text style={s.tabTitle}>Cuisine</Text>
                <View style={s.grid2}>
                  {['Continental', 'Italian', 'Asian', 'Indian', 'Chinese', 'American', 'Seafood', 'Cafe'].map((cuisine) => (
                    <Pressable
                      key={cuisine}
                      onPress={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                      style={[s.option, s.half, { alignItems: "center" }, selectedCuisine === cuisine ? s.greenActive : s.idle]}
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
            <Text style={{ fontWeight: "600", ...fontSize.base, color: colors.gray[700] }}>Close</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsFilterOpen(false)}
            style={({ pressed }) => [
              s.showBtn,
              { backgroundColor: hasAnyFilter ? (pressed ? colors.green[700] : colors.green[600]) : colors.gray[200] },
            ]}
          >
            <Text style={{ fontWeight: "600", ...fontSize.base, color: hasAnyFilter ? colors.white : colors.gray[500] }}>
              {hasAnyFilter
                ? `Show ${filteredRestaurants.length} results`
                : 'Show results'}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    </Screen>
  )
}

// The banner runs under the status bar (the nav sits on the image), so the nav is pushed below it.
function SafeTop() {
  const insets = useSafeAreaInsets()
  return <View style={{ height: insets.top }} />
}

export default function DiningExplore50() {
  return <DiningExploreScreen bannerImage={upto50off} bannerAlt="Up to 50% Off" activeTabColor={colors.green[600]} />
}

const s = StyleSheet.create({
  banner: { position: "relative", width: "100%", overflow: "hidden" },
  nav: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, width: "100%" },
  backBtn: { height: 36, width: 36, backgroundColor: alpha("#ffffff", 0.9), borderRadius: 18, flexShrink: 0 },
  locationBtn: { borderRadius: 9999, paddingHorizontal: sp(3), paddingVertical: sp(2), height: undefined, flexShrink: 1 },
  cityText: { ...fontSize.sm, fontWeight: "600", color: colors.white, borderBottomWidth: 2, borderStyle: "dotted", borderBottomColor: colors.white, flexShrink: 1 },
  searchInput: {
    width: "100%",
    height: 48,
    paddingLeft: 48,
    paddingRight: 48,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    ...shadow.sm,
    ...fontSize.base,
  },
  sectionTitle: { paddingHorizontal: sp(3), ...fontSize.sm, fontWeight: "600", color: colors.gray[500], textTransform: "uppercase", letterSpacing: 0.35, textAlign: "center" },
  chip: { height: 28, paddingHorizontal: sp(2), paddingVertical: 0, borderRadius: 9999, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200] },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { ...fontSize.xs, fontWeight: "700", color: colors.black },
  cardShadow: { borderRadius: radius["2xl"], backgroundColor: colors.white, ...shadow.md },
  card: { overflow: "hidden", borderWidth: 0, backgroundColor: colors.white, paddingVertical: 0, borderRadius: radius["2xl"], gap: 0 },
  cardImage: { position: "relative", height: 192, width: "100%", overflow: "hidden", borderTopLeftRadius: radius["2xl"], borderTopRightRadius: radius["2xl"] },
  featured: { backgroundColor: alpha(colors.gray[800], 0.8), paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: radius.lg },
  featuredText: { ...fontSize.xs, fontWeight: "500", color: colors.white },
  bookmarkBtn: { height: 36, width: 36, backgroundColor: alpha("#ffffff", 0.9), borderRadius: radius.lg },
  band: { position: "absolute", bottom: 0, left: 0, right: 0, height: "40%" },
  bandEyebrow: { ...fontSize.xs, fontWeight: "500", color: colors.white, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: sp(1) },
  bandOffer: { ...fontSize.base, fontWeight: "700", color: colors.white },
  name: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
  rating: { flexShrink: 0, backgroundColor: colors.green[600], paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.lg, flexDirection: "row", alignItems: "center", gap: sp(1) },
  ratingText: { ...fontSize.sm, fontWeight: "700", color: colors.white },
  meta: { ...fontSize.sm, fontWeight: "500", color: colors.gray[500] },

  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  sheetTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
  tabsCol: { width: 96, backgroundColor: colors.gray[50], borderRightWidth: 1, borderRightColor: colors.gray[200] },
  tabBtn: { alignItems: "center", gap: sp(1), paddingVertical: sp(4), paddingHorizontal: sp(2) },
  tabIndicator: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: RED, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  tabText: { ...fontSize.xs, lineHeight: 15, fontWeight: "500", textAlign: "center" },
  tabTitle: { ...fontSize.lg, fontWeight: "600", color: colors.gray[900], marginBottom: sp(4) },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: sp(3) },
  half: { width: "47%" },
  tile: { width: "47%", alignItems: "center", gap: sp(2), padding: sp(4), borderRadius: radius.xl, borderWidth: 1 },
  option: { paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: radius.xl, borderWidth: 1 },
  greenActive: { borderColor: colors.green[500], backgroundColor: colors.green[50] },
  idle: { borderColor: colors.gray[200] },
  tileText: { ...fontSize.sm, fontWeight: "500", color: colors.gray[700] },
  sheetFooter: { flexDirection: "row", alignItems: "center", gap: sp(4), paddingHorizontal: sp(4), paddingVertical: sp(4), borderTopWidth: 1, borderTopColor: colors.gray[200], backgroundColor: colors.white },
  showBtn: { flex: 1, paddingVertical: sp(3), borderRadius: radius.xl, alignItems: "center" },
})
