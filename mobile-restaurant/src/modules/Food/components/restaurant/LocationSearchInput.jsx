// Web: components/restaurant/LocationSearchInput.jsx — the outlet location search box (Edit Profile "Address &
// Location", Edit Address map page): 350 ms debounced Google place suggestions from 3 letters (biased to
// `biasLocation`), the "Nearby & matching places" list, resolve on tap -> onLocationSelect(location), clear button and
// spinner. Same props (label, placeholder, onLocationSelect, biasLocation; `style` = the web's className box,
// `dropdownStyle` = dropdownClassName), same texts and toast.
// Native:
// - the suggestions come from the converted @food/utils/googlePlaces (Places API (New) over HTTPS, no JS SDK);
// - the list is drawn in the normal flow right under the input instead of floating over the page (the web's
//   absolute dropdown): on Android a view that sticks out of its parent cannot be tapped;
// - the web selected on mousedown so the input's blur could not close the list first; here the list's taps work
//   while the keyboard is up (keyboardShouldPersistTaps="handled" on the screen's scroll view) and the keyboard is
//   closed when a place is picked.
import React, { useEffect, useRef, useState } from "react"
import { Animated, Easing, Keyboard, Pressable, StyleSheet, View } from "react-native"
import { Loader2, MapPin, Search, X } from "lucide-react-native"
import { toast } from "@/lib/toast"
import { Text, TextInput } from "@/native/ui"
import { alpha, colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import {
  ensureGoogleMapsPlacesLoaded,
  fetchPlaceSuggestions,
  resolvePlaceSuggestion,
} from "@food/utils/googlePlaces"

const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 3

function Spinner({ size = 16, color = restaurantTheme.brand }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [v])
  return (
    <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  )
}

export default function LocationSearchInput({
  label = "Search location",
  placeholder = "Search area, street, landmark...",
  onLocationSelect,
  biasLocation = null,
  style,
  dropdownStyle,
}) {
  const inputRef = useRef(null)
  const skipSearchRef = useRef(false)
  const selectionLockRef = useRef(false)
  const activeRequestRef = useRef(0)
  const biasLocationRef = useRef(biasLocation)

  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState([])
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    let cancelled = false
    ensureGoogleMapsPlacesLoaded()
      .then(() => {
        if (!cancelled) setGoogleMapsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setGoogleMapsLoaded(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    biasLocationRef.current = biasLocation
  }, [biasLocation])

  useEffect(() => {
    const trimmed = String(query || "").trim()

    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return undefined
    }

    if (selectionLockRef.current) {
      return undefined
    }

    if (!googleMapsLoaded || trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setDropdownOpen(false)
      setIsSearching(false)
      return undefined
    }

    const requestId = ++activeRequestRef.current

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true)
        const bias = biasLocationRef.current
        const results = await fetchPlaceSuggestions(trimmed, {
          latitude: bias?.latitude,
          longitude: bias?.longitude,
        })

        if (requestId !== activeRequestRef.current) return
        if (selectionLockRef.current) return

        setSuggestions(results)
        setDropdownOpen(results.length > 0)
      } catch {
        if (requestId !== activeRequestRef.current) return
        setSuggestions([])
        setDropdownOpen(false)
      } finally {
        if (requestId === activeRequestRef.current) {
          setIsSearching(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, googleMapsLoaded])

  const closeDropdown = () => {
    activeRequestRef.current += 1
    setDropdownOpen(false)
    setSuggestions([])
    setIsSearching(false)
  }

  const handleQueryChange = (value) => {
    selectionLockRef.current = false
    setQuery(value)
    if (!String(value || "").trim()) {
      closeDropdown()
    }
  }

  const handleClear = () => {
    skipSearchRef.current = true
    selectionLockRef.current = false
    setQuery("")
    closeDropdown()
    inputRef.current?.focus()
  }

  const handleSelectSuggestion = async (suggestion) => {
    closeDropdown()
    selectionLockRef.current = true
    inputRef.current?.blur()
    Keyboard.dismiss()

    try {
      setIsResolving(true)
      const location = await resolvePlaceSuggestion(suggestion)

      skipSearchRef.current = true
      setQuery(suggestion.mainText || suggestion.display || location.formattedAddress || "")

      onLocationSelect?.(location)
    } catch (error) {
      console.error("[LocationSearchInput] resolve failed:", error)
      selectionLockRef.current = false
      toast.error("Failed to load selected location. Please try again.")
    } finally {
      setIsResolving(false)
    }
  }

  const showDropdown = dropdownOpen && suggestions.length > 0 && !isResolving
  const disabled = !googleMapsLoaded || isResolving

  return (
    <View style={style}>
      {label ? <Text style={s.label}>{label}</Text> : null}

      <View style={[s.inputWrap, shadow.sm]}>
        <View style={s.searchIcon} pointerEvents="none">
          <Search size={16} color={colors.gray[400]} />
        </View>
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={handleQueryChange}
          onFocus={() => {
            setFocused(true)
            if (!selectionLockRef.current && suggestions.length > 0 && !isResolving) {
              setDropdownOpen(true)
            }
          }}
          onBlur={() => setFocused(false)}
          placeholder={googleMapsLoaded ? placeholder : "Loading search..."}
          placeholderTextColor={colors.gray[400]}
          editable={!disabled}
          returnKeyType="search"
          style={[s.input, focused && s.inputFocused, disabled && { opacity: 0.6 }]}
        />
        {query && !isSearching && !isResolving ? (
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [s.rightIcon, s.clearBtn, pressed && { backgroundColor: colors.gray[100] }]}
            accessibilityLabel="Clear search"
            hitSlop={6}
          >
            <X size={16} color={colors.gray[400]} />
          </Pressable>
        ) : null}
        {isSearching || isResolving ? (
          <View style={s.rightIcon} pointerEvents="none">
            <Spinner />
          </View>
        ) : null}
      </View>

      {showDropdown ? (
        <View style={[s.dropdown, dropdownStyle]}>
          <Text style={s.dropdownTitle}>Nearby & matching places</Text>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.id || index}
              onPress={() => handleSelectSuggestion(suggestion)}
              style={({ pressed }) => [
                s.option,
                index < suggestions.length - 1 && s.optionBorder,
                pressed && { backgroundColor: alpha(restaurantTheme.brand, 0.05) },
              ]}
            >
              <View style={{ marginTop: 2 }}>
                <MapPin size={16} color={restaurantTheme.brand} />
              </View>
              <View style={s.optionText}>
                <Text style={s.optionMain} numberOfLines={1}>
                  {suggestion.mainText || suggestion.display}
                </Text>
                {suggestion.secondaryText ? (
                  <Text style={s.optionSub} numberOfLines={1}>{suggestion.secondaryText}</Text>
                ) : suggestion.display && suggestion.display !== suggestion.mainText ? (
                  <Text style={s.optionSub} numberOfLines={1}>{suggestion.display}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  label: {
    ...fontSize.xs,
    fontWeight: "700",
    color: colors.gray[700],
    marginBottom: sp(1.5),
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  inputWrap: { position: "relative", borderRadius: radius.xl, backgroundColor: colors.white, justifyContent: "center" },
  searchIcon: { position: "absolute", left: sp(3), zIndex: 1 },
  input: {
    width: "100%",
    paddingLeft: sp(10),
    paddingRight: sp(10),
    paddingVertical: sp(3),
    ...fontSize.sm,
    color: colors.gray[900],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.xl,
    backgroundColor: colors.white,
  },
  inputFocused: { borderColor: restaurantTheme.brand },
  rightIcon: { position: "absolute", right: sp(3) },
  clearBtn: { padding: sp(1), borderRadius: 9999 },
  dropdown: {
    marginTop: sp(2),
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.gray[100],
    overflow: "hidden",
    ...shadow["2xl"],
  },
  dropdownTitle: {
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.gray[400],
    backgroundColor: colors.gray[50],
  },
  option: { width: "100%", paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: "row", alignItems: "flex-start", gap: sp(3) },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray[50] },
  optionText: { flex: 1, minWidth: 0 },
  optionMain: { ...fontSize.sm, fontWeight: "600", color: colors.gray[900] },
  optionSub: { ...fontSize.xs, color: colors.gray[500] },
})
