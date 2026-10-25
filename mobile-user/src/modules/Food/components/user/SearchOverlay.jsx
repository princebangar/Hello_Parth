import React, { useState, useEffect, useRef } from "react"
import { ActivityIndicator, Animated, FlatList, Modal, Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { X, Search, Clock, Mic } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { searchAPI } from "@/services/api"
import { useVoiceSearch } from "@food/hooks/useVoiceSearch"
import { AppImage, Text, TextInput } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"

const SEARCH_HISTORY_KEY = "user_recent_searches_v1"

const getImageUrl = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value
  if (typeof value === "object") {
    return (
      value.url ||
      value.secure_url ||
      value.imageUrl ||
      value.image ||
      value.src ||
      ""
    )
  }
  return ""
}

/** The web's CSS keyframes (fadeIn / slideDown / slideUp / scaleIn) with their delays. */
function Appear({ kind = "fade", delay = 0, children, style }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start()
  }, [v, delay])
  const transform =
    kind === "slideDown"
      ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }]
      : kind === "slideUp"
        ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
        : kind === "scale"
          ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }]
          : []
  return <Animated.View style={[style, { opacity: v, transform }]}>{children}</Animated.View>
}

function PulsingMic({ color }) {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v])
  return (
    <Animated.View style={{ opacity: v }}>
      <Mic size={20} color={color} />
    </Animated.View>
  )
}

export default function SearchOverlay({ isOpen, onClose, searchValue, onSearchChange, autoStartVoice = false }) {
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const inputRef = useRef(null)
  const [allFoods, setAllFoods] = useState([])
  const [filteredFoods, setFilteredFoods] = useState([])
  const [recentSuggestions, setRecentSuggestions] = useState([])
  const [loadingFoods, setLoadingFoods] = useState(false)

  const { isListening, startListening, stopListening } = useVoiceSearch((transcript) => {
    onSearchChange(transcript)
  })

  useEffect(() => {
    if (isOpen && autoStartVoice) {
      startListening()
    }
  }, [isOpen, autoStartVoice, startListening])

  useEffect(() => {
    if (!isOpen) return undefined
    const id = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(id)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const loadRecentSuggestions = () => {
      try {
        const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) {
          setRecentSuggestions(parsed.filter((item) => typeof item === "string" && item.trim()).slice(0, 8))
          return
        }
      } catch {
        // Ignore parse errors.
      }
      setRecentSuggestions([])
    }

    loadRecentSuggestions()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const term = searchValue.trim()
    if (!term) {
      setAllFoods([])
      setFilteredFoods([])
      setLoadingFoods(false)
      return
    }

    const timer = setTimeout(async () => {
      setLoadingFoods(true)
      try {
        const res = await searchAPI.unifiedSearch({ q: term, limit: 40 })
        const results = res.data?.data?.restaurants || []
        const normalized = results
          .filter((item) => item?.matchedDish || item?.matchType === "food")
          .map((item, index) => ({
            id: item.matchedDishId || item._id || `dish-${index}`,
            name: item.matchedDish || item.restaurantName || item.name,
            image: getImageUrl(item.matchedDishImage || item.profileImage || item.image),
          }))

        setAllFoods(normalized)
        setFilteredFoods(normalized)
      } catch {
        setAllFoods([])
        setFilteredFoods([])
      } finally {
        setLoadingFoods(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [isOpen, searchValue])

  useEffect(() => {
    if (searchValue.trim() === "") {
      setFilteredFoods(allFoods)
    } else {
      const filtered = allFoods.filter((food) =>
        food.name.toLowerCase().includes(searchValue.toLowerCase())
      )
      setFilteredFoods(filtered)
    }
  }, [searchValue, allFoods])

  const saveRecentSearch = (term) => {
    const value = String(term || "").trim()
    if (!value) return

    setRecentSuggestions((prev) => {
      const next = [value, ...prev.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8)
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleSuggestionClick = (suggestion) => {
    onSearchChange(suggestion)
    inputRef.current?.focus()
  }

  const handleSearchSubmit = () => {
    if (searchValue.trim()) {
      saveRecentSearch(searchValue)
      navigate(`/food/user/search?q=${encodeURIComponent(searchValue.trim())}&mode=delivery`)
      onClose()
      onSearchChange("")
    }
  }

  const handleFoodClick = (food) => {
    saveRecentSearch(food.name)
    navigate(`/food/user/search?q=${encodeURIComponent(food.name)}&mode=delivery`)
    onClose()
    onSearchChange("")
  }

  if (!isOpen) return null

  const accent = t.dark ? "#F87171" : "#DC2626"

  const header = (
    <View>
      {/* Suggestions Row */}
      <Appear kind="slideDown" delay={100} style={{ marginBottom: sp(6) }}>
        <View style={s.recentTitleRow}>
          <Clock size={16} color="#DC2626" />
          <Text style={s.recentTitle}>Recent Searches</Text>
        </View>
        <View style={s.chips}>
          {recentSuggestions.slice(0, 8).map((suggestion, index) => (
            <Appear key={suggestion} kind="scale" delay={100 + index * 20}>
              <Pressable onPress={() => handleSuggestionClick(suggestion)} style={s.chip}>
                <Clock size={12} color="#DC2626" />
                <Text style={s.chipText}>{suggestion}</Text>
              </Pressable>
            </Appear>
          ))}
        </View>
      </Appear>

      <Appear delay={200}>
        <Text style={s.gridTitle}>
          {searchValue.trim() === "" ? "Start typing to search dishes" : `Search Results (${filteredFoods.length})`}
        </Text>
      </Appear>
    </View>
  )

  const empty = (
    <View style={s.empty}>
      {loadingFoods ? (
        <>
          <ActivityIndicator size="large" color={t.dark ? colors.gray[600] : colors.gray[300]} style={{ marginBottom: sp(4) }} />
          <Text style={s.emptyTitle}>Loading dishes from database...</Text>
        </>
      ) : (
        <>
          <Search size={48} color={t.dark ? colors.gray[600] : colors.gray[300]} style={{ marginBottom: sp(4) }} />
          <Text style={s.emptyTitle}>
            {searchValue.trim() ? `No results found for "${searchValue}"` : "No dishes found in database"}
          </Text>
          <Text style={s.emptySub}>
            {searchValue.trim() ? "Try a different search term" : "Type a dish name to see matching results"}
          </Text>
        </>
      )}
    </View>
  )

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[s.root, { paddingBottom: insets.bottom }]}>
        {/* Header with Search Bar */}
        <View style={[s.header, { paddingTop: insets.top }]}>
          <View style={s.headerRow}>
            <View style={s.inputWrap}>
              <View style={s.searchIcon} pointerEvents="none">
                <Search size={20} color={accent} strokeWidth={2.5} />
              </View>
              <TextInput
                ref={inputRef}
                value={searchValue}
                onChangeText={(text) => onSearchChange(text)}
                placeholder="Search dishes or restaurants"
                placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
                returnKeyType="search"
                onSubmitEditing={handleSearchSubmit}
                style={s.input}
              />
              <View style={s.inputRight}>
                <View style={s.divider} />
                {isListening ? (
                  <Pressable onPress={stopListening} style={s.micActive}>
                    <PulsingMic color={colors.red[500]} />
                  </Pressable>
                ) : (
                  <Pressable onPress={startListening} style={({ pressed }) => [s.micBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
                    <Mic size={20} color={accent} />
                  </Pressable>
                )}
              </View>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn} hitSlop={4}>
              <X size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
            </Pressable>
          </View>
        </View>

        <FlatList
          data={filteredFoods}
          keyExtractor={(food) => String(food.id)}
          numColumns={3}
          style={s.body}
          contentContainerStyle={s.bodyContent}
          columnWrapperStyle={{ gap: sp(3) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ItemSeparatorComponent={() => <View style={{ height: sp(3) }} />}
          renderItem={({ item: food, index }) => (
            <Appear kind="slideUp" delay={250 + 50 * (index % 12)} style={s.foodCell}>
              <Pressable onPress={() => handleFoodClick(food)} style={s.foodItem}>
                <View style={s.foodCircle}>
                  {food.image ? (
                    <AppImage src={food.image} style={s.foodImage} contentFit="cover" />
                  ) : (
                    <View style={s.foodPlaceholder}>
                      <Search size={20} color={colors.gray[400]} />
                    </View>
                  )}
                </View>
                <View style={{ paddingHorizontal: sp(1) }}>
                  <Text numberOfLines={2} style={s.foodName}>{food.name}</Text>
                </View>
              </Pressable>
            </Appear>
          )}
        />
      </View>
    </Modal>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  header: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100],
    ...shadow.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(4), paddingHorizontal: sp(4), paddingVertical: sp(4) },
  inputWrap: { flex: 1, justifyContent: "center" },
  searchIcon: { position: "absolute", left: sp(5), zIndex: 10 },
  input: {
    height: 52,
    width: "100%",
    paddingLeft: sp(14),
    paddingRight: sp(16),
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    borderRadius: radius["2xl"],
    ...fontSize.base,
    color: t.dark ? colors.white : colors.gray[900],
    ...shadow.sm,
  },
  inputRight: { position: "absolute", right: sp(4), flexDirection: "row", alignItems: "center", gap: sp(3) },
  divider: { height: 24, width: 1, backgroundColor: t.dark ? colors.gray[700] : colors.gray[200] },
  micBtn: { padding: sp(2.5), borderRadius: radius.xl },
  micActive: { padding: sp(2.5), borderRadius: radius.xl, backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50], ...shadow.sm },
  closeBtn: { width: 36, height: 36, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  bodyContent: { paddingHorizontal: sp(4), paddingVertical: sp(6) },
  recentTitleRow: { flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(4) },
  recentTitle: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: sp(2) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    borderRadius: 9999,
    backgroundColor: t.dark ? alpha(colors.orange[900], 0.2) : colors.orange[50],
    borderWidth: 1,
    borderColor: t.dark ? colors.orange[800] : colors.orange[200],
    ...shadow.sm,
  },
  chipText: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.gray[300] : colors.gray[700] },
  gridTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(4) },
  foodCell: { flex: 1 / 3, maxWidth: "31.5%" },
  foodItem: { alignItems: "center", gap: sp(2) },
  foodCircle: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 9999,
    overflow: "hidden",
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    padding: sp(1),
    ...shadow.md,
  },
  foodImage: { width: "100%", height: "100%", borderRadius: 9999 },
  foodPlaceholder: { flex: 1, borderRadius: 9999, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], alignItems: "center", justifyContent: "center" },
  foodName: { ...fontSize.xs, fontWeight: "600", color: t.dark ? colors.gray[200] : colors.gray[800], textAlign: "center" },
  empty: { alignItems: "center", paddingVertical: sp(12) },
  emptyTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.gray[400] : colors.gray[600], textAlign: "center" },
  emptySub: { ...fontSize.sm, color: colors.gray[500], marginTop: sp(2), textAlign: "center" },
}))
