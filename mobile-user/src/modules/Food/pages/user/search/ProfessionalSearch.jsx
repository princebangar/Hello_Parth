import React, { useState, useMemo, useRef, useEffect, useCallback, Suspense, lazy } from "react"
import { Animated, Dimensions, Pressable, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import {
  ArrowLeft, Star, Clock, Search, BadgePercent, Mic,
  X, Utensils, History, MapPin
} from "lucide-react-native"
import { useSearchParams, Link, useNavigate, useNavigationType } from "@/lib/router"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { searchAPI } from "@/services/api"
import OptimizedImage from "@food/components/OptimizedImage"
import { useVoiceSearch } from "@food/hooks/useVoiceSearch"
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons"
import { useProfile } from "@food/context/ProfileContext"
import {
  filterCategoriesForVegMode,
  filterRestaurantsForVegMode,
  isVegMenuItem,
  matchesVegRestaurantFilter,
} from "@food/utils/vegMode"
import { Screen, Skeleton, Text, TextInput } from "@/native/ui"
import { alpha, brand, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"
const CategoryPage = lazy(() => import("../CategoryPage"))

// Helper to resolve media URLs consistently
const getMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('http')) return url;

  // Use VITE_API_BASE_URL to derive the backend origin
  const apiBase = globalThis.__ENV__?.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
  const origin = apiBase.split('/api/v1')[0];

  return `${origin}${url.startsWith('/') ? url : '/' + url}`;
};

// Debounce hook for real-time search
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

const SEARCH_HISTORY_KEY = "professional_search_history_v1"

function PulsingView({ active, children, style }) {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!active) {
      v.setValue(1)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [active, v])
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>
}

/** animate-in fade-in slide-in-from-bottom-2 */
function FadeInUp({ children, style, onLayout }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }).start()
  }, [v])
  return (
    <Animated.View onLayout={onLayout} style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {children}
    </Animated.View>
  )
}

function MyStoreBadge({ style }) {
  return (
    <View style={[{ alignSelf: 'flex-start', backgroundColor: colors.rose[100], borderRadius: radius.sm, paddingHorizontal: sp(1.5), paddingVertical: 2 }, style]}>
      <Text style={{ fontSize: 9, lineHeight: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.25, color: colors.rose[700] }}>My Store</Text>
    </View>
  )
}

export default function ProfessionalSearch() {
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const navigate = useNavigate()
  const { location: userCoords } = useGeoLocation()
  const { zoneId } = useZone(userCoords)
  const { vegMode, vegModeOption } = useProfile()
  const searchMode = searchParams.get("mode") || "delivery"
  const isTakeawaySearch = searchMode === "takeaway"

  const [query, setQuery] = useState(initialQuery)
  const debouncedQuery = useDebounce(query, 500)

  const [results, setResults] = useState({ restaurants: [], dishes: [] })
  const [loading, setLoading] = useState(false)
  const { isListening, startListening, stopListening } = useVoiceSearch((transcript) => {
    setQuery(transcript)
    addToHistory(transcript)
  })
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(searchParams.get("cat") || null)
  const [history, setHistory] = useState([])
  const scrollRef = useRef(null)
  const resultsYRef = useRef(null)

  const scrollToResults = useCallback(() => {
    if (resultsYRef.current == null) return
    scrollRef.current?.scrollTo({ y: Math.max(0, resultsYRef.current), animated: true })
  }, [])

  // Load search history
  useEffect(() => {
    const savedHistory = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (savedHistory) setHistory(JSON.parse(savedHistory))
    fetchCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navType = useNavigationType()
  const prevQueryRef = useRef(query);
  const hasInitialScrolledRef = useRef(false);

  // Auto-scroll to results only when query ACTUALLY changes OR on fresh navigation (not BACK/FORWARD)
  useEffect(() => {
    const queryChanged = prevQueryRef.current !== query;
    const isFreshMount = !hasInitialScrolledRef.current;

    if (!loading && query && resultsYRef.current != null) {
      if (queryChanged || (isFreshMount && navType !== "POP")) {
        prevQueryRef.current = query;
        hasInitialScrolledRef.current = true;

        const timer = setTimeout(scrollToResults, 50);
        return () => clearTimeout(timer);
      }
    }
    return undefined
  }, [loading, query, navType, scrollToResults])

  // Auto-scroll to results when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const timer = setTimeout(scrollToResults, 80);
      return () => clearTimeout(timer);
    }
    return undefined
  }, [selectedCategoryId, scrollToResults])

  const fetchCategories = async () => {
    try {
      const res = await searchAPI.getAdminCategories({ zoneId })
      if (res.data?.success) setCategories(res.data.data.categories || [])
    } catch (err) {
      console.error("Failed to fetch categories", err)
    }
  }

  const visibleCategories = useMemo(
    () => filterCategoriesForVegMode(categories, vegMode),
    [categories, vegMode],
  )

  // If a non-veg category was selected before veg mode turned on, clear it
  useEffect(() => {
    if (!vegMode || !selectedCategoryId) return
    const stillVisible = visibleCategories.some(
      (c) => String(c._id || c.id) === String(selectedCategoryId),
    )
    if (!stillVisible) setSelectedCategoryId(null)
  }, [vegMode, selectedCategoryId, visibleCategories])

  const addToHistory = (term) => {
    const newHistory = [term, ...history.filter(h => h !== term)].slice(0, 5)
    setHistory(newHistory)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
  }

  const performSearch = useCallback(async (searchTerm, catId) => {
    if (!searchTerm && !catId) {
      setResults({ restaurants: [], dishes: [] })
      return
    }

    if (!zoneId) {
      setResults({ restaurants: [], dishes: [] })
      return
    }

    setLoading(true)
    try {
      const res = await searchAPI.unifiedSearch({
        q: searchTerm,
        categoryId: catId,
        lat: userCoords?.latitude,
        lng: userCoords?.longitude,
        limit: 50,
        zoneId,
        orderType: searchMode,
        ...(vegMode ? { isVeg: "true" } : {}),
      })

      const all = res.data?.success ? (res.data.data?.restaurants || []) : []
      const restaurantsRaw = all.filter(r => r.matchType === 'restaurant' || !r.matchType)
      const dishesRaw = all.filter(r => r.matchType === 'food')

      const restaurants = filterRestaurantsForVegMode(restaurantsRaw, {
        vegMode,
        vegModeOption,
      })
      const dishes = dishesRaw
        .filter((r) => !vegMode || isVegMenuItem({
          foodType: r.matchedDishFoodType || r.foodType,
          isVeg: r.isVeg,
        }))
        .filter((r) => matchesVegRestaurantFilter(r, { vegMode, vegModeOption }))

      setResults({ restaurants, dishes })
    } catch (err) {
      console.error("Search failed", err)
      setResults({ restaurants: [], dishes: [] })
    } finally {
      setLoading(false)
    }
  }, [userCoords, zoneId, searchMode, vegMode, vegModeOption])

  useEffect(() => {
    performSearch(debouncedQuery, selectedCategoryId)
    if (debouncedQuery) {
      setSearchParams({ q: debouncedQuery, ...(selectedCategoryId ? { cat: selectedCategoryId } : {}) }, { replace: true })
    }
    // setSearchParams changes with the URL it writes; the web's react-router setter was stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedCategoryId, performSearch])

  // Speech Recognition Implementation
  const handleVoiceSearch = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const handleClear = () => {
    setQuery("")
    setSelectedCategoryId(null)
    setSearchParams({}, { replace: true })
    setResults({ restaurants: [], dishes: [] })
  }

  const handleCategoryClick = (id) => {
    if (selectedCategoryId === id) {
      scrollToResults()
    } else {
      setSelectedCategoryId(id)
      setSearchParams({ ...Object.fromEntries(searchParams), cat: id }, { replace: true })
    }
  }

  const selectedCategoryObj = categories.find(c => c._id === selectedCategoryId)
  const selectedCategorySlug = selectedCategoryObj?.slug || selectedCategoryObj?._id || selectedCategoryObj?.name?.toLowerCase().replace(/\s+/g, '-')

  const onResultsLayout = (e) => {
    resultsYRef.current = e.nativeEvent.layout.y
  }

  return (
    <Screen edges={['bottom']} bg={t.dark ? colors.zinc[950] : colors.slate[50]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + sp(2) }]}>
        <View style={s.headerRow}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [s.backBtn, pressed && { transform: [{ scale: 0.9 }] }]}
          >
            <ArrowLeft size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
          </Pressable>

          <View style={s.inputWrap}>
            <View style={s.searchIcon} pointerEvents="none">
              <Search size={16} color="#DC2626" strokeWidth={2.5} />
            </View>
            <TextInput
              // a search opened with words already (voice search, a suggestion) shows its results: no keyboard on top
              autoFocus={!initialQuery}
              placeholder={isTakeawaySearch ? "Search takeaway restaurants..." : "Search dishes or restaurants"}
              placeholderTextColor={t.dark ? colors.zinc[400] : colors.gray[500]}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              style={s.input}
            />

            <View style={s.inputRight}>
              {!!query && (
                <Pressable onPress={handleClear} style={s.clearBtn} hitSlop={4}>
                  <X size={16} color={colors.gray[400]} />
                </Pressable>
              )}
              <View style={s.divider} />
              <Pressable onPress={handleVoiceSearch} style={({ pressed }) => [s.micBtn, isListening && { backgroundColor: colors.red[50] }, pressed && { transform: [{ scale: 0.95 }] }]}>
                <PulsingView active={isListening}>
                  <Mic size={20} color={isListening ? colors.red[500] : '#DC2626'} />
                </PulsingView>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* Categories */}
        {!query && !isTakeawaySearch && (
          <View style={{ marginBottom: sp(8) }}>
            <View style={s.sectionHead}>
              <Text style={s.sectionLabel}>Top Categories</Text>
              {visibleCategories.length > 8 && (
                <Text style={s.swipe}>Swipe for more</Text>
              )}
            </View>
            {categories.length === 0 ? (
              <View style={s.catGrid}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <View key={i} style={s.catCell}>
                    <Skeleton width={60} height={60} rounded={22} style={{ marginBottom: sp(2), backgroundColor: t.dark ? colors.zinc[800] : colors.gray[100] }} />
                    <Skeleton width={48} height={12} rounded={radius.sm} style={{ backgroundColor: t.dark ? colors.zinc[800] : colors.gray[100] }} />
                  </View>
                ))}
              </View>
            ) : visibleCategories.length === 0 ? (
              <Text style={s.noVeg}>No veg categories available</Text>
            ) : (
              <View style={s.catGrid}>
                {visibleCategories.map((cat) => {
                  const selected = selectedCategoryId === cat._id
                  return (
                    <Pressable
                      key={cat._id}
                      onPress={() => handleCategoryClick(cat._id)}
                      style={({ pressed }) => [s.catCell, pressed && { transform: [{ scale: 0.95 }] }]}
                    >
                      <View style={[s.catTile, selected ? s.catTileSelected : null]}>
                        <View style={s.catTileInner}>
                          {cat.image ? (
                            <OptimizedImage
                              src={getMediaUrl(cat.image)}
                              alt={cat.name}
                              style={{ width: '100%', height: '100%' }}
                            />
                          ) : (
                            <View style={s.catPlaceholder}>
                              <Utensils size={24} color={colors.gray[200]} />
                            </View>
                          )}
                        </View>
                      </View>
                      <Text numberOfLines={1} style={[s.catName, selected && { color: '#DC2626' }]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {/* Loading Skeleton */}
        {loading && !selectedCategorySlug && (
          <View style={{ marginTop: sp(6), gap: sp(6) }}>
            <View style={[s.sectionHead, { marginBottom: 0 }]}>
              <Skeleton width={128} height={16} rounded={radius.sm} style={{ backgroundColor: t.dark ? colors.zinc[800] : colors.gray[100] }} />
              <Skeleton width={64} height={16} rounded={radius.sm} style={{ backgroundColor: t.dark ? colors.zinc[800] : colors.gray[100] }} />
            </View>
            <RestaurantGridSkeleton count={4} />
          </View>
        )}

        {/* Recent History */}
        {!query && !loading && history.length > 0 && (
          <View style={{ marginBottom: sp(8) }}>
            <Text style={s.historyTitle}>Recently Searched</Text>
            <View style={s.historyRow}>
              {history.map((term, i) => (
                <Pressable key={i} onPress={() => setQuery(term)} style={s.historyChip}>
                  <History size={12} color={t.dark ? colors.zinc[400] : colors.slate[600]} />
                  <Text style={s.historyText}>{term}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Search Results or Embedded Category Page */}
        {selectedCategorySlug ? (
          <View onLayout={onResultsLayout} style={s.embedded}>
            <Suspense fallback={<View style={{ padding: sp(4) }}><RestaurantGridSkeleton count={4} /></View>}>
              <CategoryPage
                key={selectedCategorySlug}
                embeddedCategorySlug={selectedCategorySlug}
                hideHeader={true}
                hideCategoryCarousel={true}
                hideFilters={true}
                disableAutoScroll={true}
              />
            </Suspense>
          </View>
        ) : !loading && !!query && (
          <FadeInUp onLayout={onResultsLayout} style={{ gap: sp(8) }}>

            {/* Dish Results Section */}
            {results.dishes.length > 0 && (
              <View>
                <View style={s.sectionHead}>
                  <Text style={s.resultsLabel}>Matched Dishes</Text>
                  <Text style={s.countPill}>{results.dishes.length} results</Text>
                </View>
                <View style={{ gap: sp(4) }}>
                  {results.dishes.map((r) => (
                    <Link
                      to={`/food/user/restaurants/${r.slug || r._id}${r.matchedDishId ? `?dish=${r.matchedDishId}` : ''}`}
                      key={r._id}
                      style={({ pressed }) => [s.dishCard, pressed && { transform: [{ scale: 0.98 }] }]}
                    >
                      <View style={s.dishImageBox}>
                        <OptimizedImage
                          src={getMediaUrl(r.matchedDishImage || r.profileImage || r.image || (Array.isArray(r.images) && r.images[0]))}
                          style={{ width: '100%', height: '100%' }}
                          fallback="/placeholder-dish.jpg"
                        />
                        {r.pureVegRestaurant && (
                          <View style={s.vegMark}>
                            <View style={s.vegDot} />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, paddingVertical: sp(1) }}>
                        <View style={s.dishTag}>
                          <Text style={s.dishTagText}>{r.matchedDish || query}</Text>
                        </View>
                        <Text numberOfLines={1} style={s.dishRestName}>{r.restaurantName}</Text>
                        {r.partnerType === 'store' && <MyStoreBadge style={{ marginTop: 2 }} />}
                        <View style={s.dishMeta}>
                          <View style={s.metaItem}>
                            <Star size={12} color="#DC2626" fill="#DC2626" />
                            <Text style={s.metaRating}>{r.rating || "New"}</Text>
                          </View>
                          <Text style={s.metaDot}>•</Text>
                          <View style={s.metaItem}>
                            <Clock size={12} color={t.dark ? colors.zinc[400] : colors.gray[500]} />
                            <Text style={s.metaText}>{r.estimatedDeliveryTime || "30-40 mins"}</Text>
                          </View>
                          <Text style={s.metaDot}>•</Text>
                          <Text numberOfLines={1} style={[s.metaText, { flexShrink: 1 }]}>{r.cuisines?.slice(0, 2).join(", ")}</Text>
                        </View>
                      </View>
                    </Link>
                  ))}
                </View>
              </View>
            )}

            {/* Restaurant Results Section */}
            {results.restaurants.length > 0 && (
              <View>
                <View style={s.sectionHead}>
                  <Text style={s.resultsLabel}>Restaurants</Text>
                  <Text style={s.countPill}>{results.restaurants.length} stores</Text>
                </View>
                <View style={{ gap: sp(6) }}>
                  {results.restaurants.map((r) => (
                    <Link
                      to={`/food/user/restaurants/${r.slug || r._id}`}
                      key={r._id}
                      style={({ pressed }) => [pressed && { transform: [{ scale: 0.98 }] }]}
                    >
                      <View style={s.restImageBox}>
                        <OptimizedImage
                          src={getMediaUrl(r.profileImage || r.image || (Array.isArray(r.images) && r.images[0]))}
                          style={{ width: '100%', height: '100%' }}
                          fallback="/placeholder-restaurant.jpg"
                        />
                        <LinearGradient
                          colors={[alpha(colors.black, 0.8), alpha(colors.black, 0.2), 'transparent']}
                          start={{ x: 0, y: 1 }}
                          end={{ x: 0, y: 0 }}
                          style={[s.fill, { opacity: 0.8 }]}
                        />
                        <View style={s.restBottom}>
                          <View style={{ minWidth: 0, flex: 1, marginRight: sp(2) }}>
                            <Text numberOfLines={1} style={s.restName}>{r.restaurantName}</Text>
                            {r.partnerType === 'store' && <MyStoreBadge style={{ marginBottom: sp(1.5) }} />}
                            <Text numberOfLines={1} style={s.restCuisines}>{r.cuisines?.join(", ")}</Text>
                          </View>
                          <View style={s.ratingPill}>
                            <Star size={16} color={colors.white} fill={colors.white} />
                            <Text style={s.ratingText}>{r.rating || "4.0"}</Text>
                          </View>
                        </View>
                        {!!r.offer && (
                          <View style={s.offerRibbon}>
                            <BadgePercent size={14} color={colors.white} />
                            <Text numberOfLines={1} style={s.offerText}>{r.offer}</Text>
                          </View>
                        )}
                      </View>
                      <View style={s.restFooter}>
                        <View style={s.restFooterMeta}>
                          <View style={s.metaItem}>
                            <Clock size={14} color="#DC2626" />
                            <Text style={s.footerMetaText}>{r.estimatedDeliveryTime || "30 mins"}</Text>
                          </View>
                          <Text style={s.metaDot}>•</Text>
                          <View style={s.metaItem}>
                            <MapPin size={14} color="#DC2626" />
                            <Text style={s.footerMetaText}>{r.location?.area || "Nearby"}</Text>
                          </View>
                        </View>
                        <LinearGradient colors={['#DC2626', '#F87171']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.viewMenu}>
                          <Text style={s.viewMenuText}>View Menu</Text>
                        </LinearGradient>
                      </View>
                    </Link>
                  ))}
                </View>
              </View>
            )}

            {/* Empty State */}
            {!loading && results.restaurants.length === 0 && results.dishes.length === 0 && (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Search size={32} color={colors.slate[300]} />
                </View>
                <Text style={s.emptyTitle}>We couldn't find any results</Text>
                <Text style={s.emptySub}>Maybe try searching for something else or check your spelling</Text>
                <Pressable onPress={handleClear} style={s.clearAll}>
                  <Text style={s.clearAllText}>Clear all filters</Text>
                </Pressable>
              </View>
            )}

          </FadeInUp>
        )}
      </ScrollView>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  header: {
    zIndex: 50,
    backgroundColor: t.dark ? alpha(colors.zinc[900], 0.8) : alpha(colors.white, 0.8),
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.zinc[800] : colors.gray[100],
    paddingHorizontal: sp(3),
    paddingBottom: sp(2),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  backBtn: { padding: sp(1.5), borderRadius: 9999 },
  inputWrap: { flex: 1, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: sp(3.5), zIndex: 1 },
  input: {
    height: 40,
    paddingLeft: sp(10),
    paddingRight: sp(12),
    backgroundColor: t.dark ? alpha(colors.zinc[800], 0.5) : colors.gray[50],
    borderWidth: 1,
    borderColor: t.dark ? colors.zinc[700] : colors.gray[100],
    borderRadius: radius['2xl'],
    ...fontSize.sm,
    color: t.dark ? colors.white : brand.foreground,
  },
  inputRight: { position: 'absolute', right: sp(1.5), flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  clearBtn: { padding: sp(1.5) },
  divider: { width: 1, height: 16, backgroundColor: t.dark ? colors.zinc[700] : colors.gray[200], marginHorizontal: 2 },
  micBtn: { padding: sp(1.5), borderRadius: radius.xl },
  body: { padding: sp(4), paddingBottom: sp(8) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(5), paddingHorizontal: sp(1) },
  sectionLabel: { ...fontSize.xs, fontWeight: '900', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 1.2 },
  swipe: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: -0.5 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: sp(3), rowGap: sp(6) },
  catCell: { width: '22%', alignItems: 'center' },
  catTile: {
    width: 60,
    height: 60,
    borderRadius: 22,
    marginBottom: sp(2),
    borderWidth: 2,
    borderColor: t.dark ? colors.zinc[800] : colors.gray[50],
    backgroundColor: t.dark ? colors.zinc[900] : colors.white,
    ...shadow.sm,
  },
  catTileSelected: { borderColor: '#DC2626', ...shadow.md, shadowColor: '#DC2626', shadowOpacity: 0.05 },
  catTileInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, overflow: 'hidden' },
  catPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray[50] },
  catName: { fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center', color: t.dark ? colors.zinc[400] : colors.gray[500] },
  noVeg: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500], paddingHorizontal: sp(1) },
  historyTitle: { ...fontSize.sm, fontWeight: '600', color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: sp(2), paddingHorizontal: sp(1) },
  historyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  historyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    paddingHorizontal: sp(3),
    paddingVertical: sp(1.5),
    backgroundColor: t.dark ? colors.zinc[900] : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.zinc[800] : colors.slate[200],
    borderRadius: 9999,
  },
  historyText: { ...fontSize.sm, color: t.dark ? colors.zinc[400] : colors.slate[600] },
  embedded: { marginTop: sp(4), marginHorizontal: -sp(4), minHeight: Dimensions.get('window').height * 0.85 },
  resultsLabel: { ...fontSize.sm, fontWeight: '900', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 1.4 },
  countPill: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: colors.gray[400],
    backgroundColor: t.dark ? colors.zinc[900] : colors.gray[100],
    paddingHorizontal: sp(2),
    paddingVertical: 2,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  dishCard: {
    flexDirection: 'row',
    gap: sp(4),
    padding: sp(3),
    backgroundColor: t.dark ? colors.zinc[900] : colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.dark ? colors.zinc[800] : colors.gray[100],
    overflow: 'hidden',
    ...shadow.sm,
  },
  dishImageBox: { width: 96, height: 96, borderRadius: radius['2xl'], overflow: 'hidden', backgroundColor: t.dark ? colors.zinc[800] : colors.gray[50] },
  vegMark: { position: 'absolute', top: 6, left: 6, width: 16, height: 16, borderWidth: 1, borderColor: colors.green[600], padding: 1.5, backgroundColor: colors.white, borderRadius: 2, ...shadow.sm },
  vegDot: { flex: 1, backgroundColor: colors.green[600], borderRadius: 9999 },
  dishTag: { alignSelf: 'flex-start', marginBottom: sp(1), paddingHorizontal: sp(2), paddingVertical: 2, backgroundColor: alpha('#DC2626', 0.05), borderRadius: 9999 },
  dishTagText: { color: '#F87171', fontSize: 9, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45 },
  dishRestName: { ...fontSize.base, fontWeight: '900', color: t.dark ? colors.white : colors.gray[900] },
  dishMeta: { flexDirection: 'row', alignItems: 'center', gap: sp(3), marginTop: sp(2) },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  metaRating: { fontSize: 11, lineHeight: 16, fontWeight: '900', color: t.dark ? colors.white : colors.gray[900] },
  metaText: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: t.dark ? colors.zinc[400] : colors.gray[500] },
  metaDot: { color: colors.gray[200], fontSize: 11 },
  restImageBox: { borderRadius: 32, overflow: 'hidden', aspectRatio: 16 / 10, marginBottom: sp(4), backgroundColor: t.dark ? colors.zinc[800] : colors.gray[100], ...shadow.xl },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  restBottom: { position: 'absolute', bottom: sp(4), left: sp(5), right: sp(5), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  restName: { ...fontSize.xl, fontWeight: '900', color: colors.white, marginBottom: sp(1.5) },
  restCuisines: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: alpha(colors.white, 0.8), textTransform: 'uppercase', letterSpacing: 0.55 },
  ratingPill: {
    backgroundColor: alpha(colors.white, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    paddingHorizontal: sp(3),
    paddingVertical: sp(1.5),
    borderRadius: radius['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(1.5),
  },
  ratingText: { ...fontSize.sm, fontWeight: '900', color: colors.white },
  offerRibbon: {
    position: 'absolute',
    top: sp(5),
    left: 0,
    backgroundColor: '#DC2626',
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    borderTopRightRadius: radius['2xl'],
    borderBottomRightRadius: radius['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(1.5),
    ...shadow.xl,
  },
  offerText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: -0.5 },
  restFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(2) },
  restFooterMeta: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flexShrink: 1 },
  footerMetaText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: t.dark ? colors.zinc[400] : colors.gray[500], textTransform: 'uppercase', letterSpacing: -0.3 },
  viewMenu: { paddingHorizontal: sp(3), paddingVertical: sp(1.5), borderRadius: 9999, ...shadow.lg, shadowColor: '#DC2626', shadowOpacity: 0.2 },
  viewMenuText: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: colors.white, textTransform: 'uppercase', letterSpacing: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: sp(20) },
  emptyIcon: { width: 80, height: 80, backgroundColor: t.dark ? colors.zinc[900] : colors.slate[100], borderRadius: 9999, alignItems: 'center', justifyContent: 'center', marginBottom: sp(4) },
  emptyTitle: { ...fontSize.xl, fontWeight: '700', color: t.dark ? colors.white : colors.slate[900], marginBottom: sp(2), textAlign: 'center' },
  emptySub: { ...fontSize.sm, color: colors.slate[500], maxWidth: 320, textAlign: 'center' },
  clearAll: { marginTop: sp(6), borderRadius: radius.xl, borderWidth: 1, borderColor: colors.rose[500], height: 36, paddingHorizontal: sp(4), alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? alpha(brand.input, 0.3) : colors.white },
  clearAllText: { ...fontSize.sm, fontWeight: '500', color: colors.rose[500] },
}))
