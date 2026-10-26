// Web: pages/restaurant/ZoneSetup.jsx — "Zone Setup" (/zone-setup): RestaurantNavbar (no search), back + title, the
// place search (Google autocomplete restricted to India, from 2 letters, 300 ms debounce), "Save Location"
// (PATCH profile { location }), the selected location box, the how-to card and the Google map (India at zoom 5;
// the saved outlet at zoom 17; tap the map to drop the pin, drag the pin to adjust, tap the pin for its info).
// Same API calls (GET current restaurant, PATCH /food/restaurant/profile), texts, toasts and alerts.
// Native:
// - the map is AppMap (react-native-maps, Google), built after the splash; map click -> onPress, the draggable
//   google.maps.Marker -> Marker draggable + onDragEnd, its InfoWindow -> the marker's own callout (title +
//   address); setCenter + setZoom -> animateToRegion(regionFor(point, 17)); the web's Map / Satellite control is a
//   small two-button bar in the same corner (mapType); Google's fullscreen button has no native counterpart (the map
//   is already 600 px tall in the page) and is left out;
// - the search uses the Places API (New) over HTTPS (@/lib/google autocomplete + placeDetails with one session token,
//   like the web's AutocompleteSuggestion); the suggestion list is drawn in the normal flow under the input (on
//   Android a view sticking out of its parent cannot be tapped);
// - the page is a KeyboardAwareScrollView (the search input stays above the keyboard); window.alert -> Alert.alert.
import React, { useEffect, useRef, useState } from "react"
import { Alert, Animated, Easing, Keyboard, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowLeft, Loader2, MapPin, Save, Search } from "lucide-react-native"
import { toast } from "@/lib/toast"
import { autocomplete, newSessionToken, placeDetails } from "@/lib/google"
import { KeyboardAwareScrollView, Screen, Text, TextInput } from "@/native/ui"
import { AppMap, Marker, regionFor } from "@/native/ui/AppMap"
import { useSplashDone } from "@/native/splashState"
import { colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import { panelWords as sw } from "@food/utils/adminPartnerLabels"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import RestaurantNavbar from "@food/components/restaurant/RestaurantNavbar"
import { restaurantAPI } from "@food/api"
import { reverseGeocodeWithGoogle } from "@food/utils/googleGeocoding"
import {
  buildRestaurantLocationUpdatePayload,
  dispatchRestaurantLocationUpdated,
  formatRestaurantDisplayAddress,
  normalizeRestaurantLocationFields,
} from "@food/utils/restaurantLocation"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
const debugError = (...args) => console.error("[ZoneSetup]", ...args)

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]
const INITIAL_LOCATION = { lat: 20.5937, lng: 78.9629 } // India center
const showAlert = (message) => Alert.alert("", String(message))

const parseCoordinate = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const getSavedLocationCoords = (location) => {
  if (!location) return null

  let lat = null
  let lng = null

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    lng = parseCoordinate(location.coordinates[0])
    lat = parseCoordinate(location.coordinates[1])
  }

  if (lat === null || lng === null) {
    lat = parseCoordinate(location.latitude)
    lng = parseCoordinate(location.longitude)
  }

  if (lat === null || lng === null) return null

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const swappedLat = lng
    const swappedLng = lat

    if (
      swappedLat >= -90 && swappedLat <= 90 &&
      swappedLng >= -180 && swappedLng <= 180
    ) {
      return { lat: swappedLat, lng: swappedLng }
    }

    return null
  }

  return { lat, lng }
}

function Spinner({ size = 20, color = colors.white }) {
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

export default function ZoneSetup() {
  const goBack = useRestaurantBackNavigation()
  const splashDone = useSplashDone()
  const mapInstanceRef = useRef(null)
  const sessionTokenRef = useRef(null)
  const debounceRef = useRef(null)
  const geocodeDebounceRef = useRef(null)
  const blurTimerRef = useRef(null)
  const locationRef = useRef(null)
  const unmountedRef = useRef(false)

  const [mapAllowed, setMapAllowed] = useState(false) // API key checked (web: the Maps script loaded)
  const [mapLoading, setMapLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [locationSearch, setLocationSearch] = useState("")
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [marker, setMarker] = useState(null) // { lat, lng, address }
  const [mapType, setMapType] = useState("standard")
  const [searchFocused, setSearchFocused] = useState(false)

  useEffect(
    () => () => {
      unmountedRef.current = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current)
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    },
    [],
  )

  const updateMarker = (lat, lng, address) => {
    setMarker({ lat: Number(lat), lng: Number(lng), address })
  }

  const applyResolvedLocation = (fields) => {
    const next = normalizeRestaurantLocationFields(fields)
    if (!next) return
    locationRef.current = next
    setSelectedLocation(next)
    if (next.latitude != null) updateMarker(next.latitude, next.longitude, formatRestaurantDisplayAddress(next))
  }

  const updateLocationFromCoords = async (nextLat, nextLng) => {
    if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current)

    geocodeDebounceRef.current = setTimeout(async () => {
      try {
        setGeocoding(true)
        const parsed = await reverseGeocodeWithGoogle(nextLat, nextLng)
        if (unmountedRef.current) return
        applyResolvedLocation(parsed.locationFields || {
          ...(locationRef.current || {}),
          latitude: nextLat,
          longitude: nextLng,
          formattedAddress: `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`,
        })
      } catch (error) {
        if (unmountedRef.current) return
        debugError("Reverse geocode failed:", error)
        applyResolvedLocation({
          ...(locationRef.current || {}),
          latitude: nextLat,
          longitude: nextLng,
          formattedAddress: `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`,
        })
      } finally {
        if (!unmountedRef.current) setGeocoding(false)
      }
    }, 450)
  }

  const fetchRestaurantData = async () => {
    try {
      const response = await restaurantAPI.getCurrentRestaurant()
      const data = response?.data?.data?.restaurant || response?.data?.restaurant
      if (data && !unmountedRef.current) {
        setRestaurantData(data)
      }
    } catch (error) {
      debugError("Error fetching restaurant data:", error)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      let apiKey = null
      try {
        apiKey = await getGoogleMapsApiKey()
        if (!apiKey || apiKey.trim() === "") {
          debugError("API key is empty or not found in database")
          setMapLoading(false)
          showAlert("Google Maps API key not found in database. Please contact administrator to add the API key in admin panel.")
          return
        }
      } catch (apiKeyError) {
        debugError("Error fetching API key from database:", apiKeyError)
        setMapLoading(false)
        showAlert("Failed to fetch Google Maps API key from database. Please check your connection or contact administrator.")
        return
      }
      setMapAllowed(true)
    } catch (error) {
      debugError("Error loading Google Maps:", error)
      setMapLoading(false)
      showAlert("Failed to load Google Maps. Please refresh the page or contact administrator.")
    }
  }

  useEffect(() => {
    fetchRestaurantData()
    loadGoogleMaps()
  }, [])

  // Fetch place suggestions from the Places API (New) autocomplete (web: AutocompleteSuggestion).
  const fetchSuggestions = async (input) => {
    if (!input || input.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    try {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = newSessionToken()
      }

      const results = await autocomplete(input, {
        sessionToken: sessionTokenRef.current,
        country: "in", // Restrict to India
      })
      if (unmountedRef.current) return

      const mapped = (results || []).filter(Boolean)
      setSuggestions(mapped)
      setShowSuggestions(mapped.length > 0)
    } catch (err) {
      debugError("Error fetching suggestions:", err)
      if (unmountedRef.current) return
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  const handleSearchChange = (value) => {
    setLocationSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300)
  }

  const handleSelectSuggestion = async (prediction) => {
    try {
      Keyboard.dismiss()
      const place = await placeDetails(prediction.place_id, { sessionToken: sessionTokenRef.current || undefined })
      if (!mapInstanceRef.current) return

      const lat = Number(place?.geometry?.location?.lat)
      const lng = Number(place?.geometry?.location?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Place has no location")

      mapInstanceRef.current.animateToRegion(regionFor({ lat, lng }, 17), 300)

      setLocationSearch(place.formatted_address || place.name || "")
      setSuggestions([])
      setShowSuggestions(false)
      sessionTokenRef.current = null
      await updateLocationFromCoords(lat, lng)
    } catch (err) {
      debugError("Error resolving selected place:", err)
    }
  }

  // Load existing restaurant location when data is fetched
  useEffect(() => {
    if (restaurantData?.location && mapInstanceRef.current && !mapLoading) {
      const location = restaurantData.location
      const savedCoords = getSavedLocationCoords(location)

      if (savedCoords) {
        const { lat, lng } = savedCoords
        mapInstanceRef.current.animateToRegion(regionFor({ lat, lng }, 17), 300)

        const normalized = normalizeRestaurantLocationFields(location)
        if (normalized) {
          applyResolvedLocation(normalized)
        } else {
          updateLocationFromCoords(lat, lng)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantData, mapLoading])

  // web: map.addListener('click', ...)
  const handleMapPress = (event) => {
    const coordinate = event?.nativeEvent?.coordinate
    if (!coordinate) return
    const lat = coordinate.latitude
    const lng = coordinate.longitude
    updateMarker(lat, lng, "Resolving address...")
    updateLocationFromCoords(lat, lng)
  }

  const handleSaveLocation = async () => {
    if (!selectedLocation?.latitude || !selectedLocation?.longitude) {
      toast.error("Please select a location on the map first")
      return
    }

    try {
      setSaving(true)

      const response = await restaurantAPI.updateProfile({
        location: buildRestaurantLocationUpdatePayload(selectedLocation),
      })

      if (response?.data?.data?.restaurant) {
        setRestaurantData(response.data.data.restaurant)
        toast.success("Location saved successfully", { duration: 4000 })
        dispatchRestaurantLocationUpdated()
      } else {
        throw new Error("Failed to save location")
      }
    } catch (error) {
      debugError("Error saving location:", error)
      toast.error(error.response?.data?.message || "Failed to save location. Please try again.")
    } finally {
      if (!unmountedRef.current) setSaving(false)
    }
  }

  const selectedAddress = formatRestaurantDisplayAddress(selectedLocation, restaurantData)
  const saveDisabled = !selectedLocation || saving

  return (
    <Screen bg={colors.gray[50]} edges={[]}>
      <RestaurantNavbar hideSearch />
      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={s.content} extraOffset={sp(4)}>
        {/* Header */}
        <View style={s.headerRow}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={colors.gray[700]} />
          </Pressable>
          <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.headerIcon}>
            <MapPin size={20} color={colors.white} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Zone Setup</Text>
            <Text style={s.subtitle}>{sw("Set your restaurant location on the map")}</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={s.searchCard}>
          <View style={{ gap: sp(3) }}>
            <View style={s.searchWrap}>
              <View style={s.searchIcon} pointerEvents="none">
                <Search size={20} color={colors.gray[400]} />
              </View>
              <TextInput
                value={locationSearch}
                onChangeText={handleSearchChange}
                onFocus={() => {
                  setSearchFocused(true)
                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
                  if (suggestions.length > 0) setShowSuggestions(true)
                }}
                onBlur={() => {
                  setSearchFocused(false)
                  blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150)
                }}
                placeholder={sw("Search for your restaurant location...")}
                placeholderTextColor={colors.gray[400]}
                returnKeyType="search"
                style={[s.searchInput, searchFocused && s.searchInputFocused]}
              />
            </View>
            {showSuggestions && suggestions.length > 0 ? (
              <View style={s.suggestions}>
                {suggestions.map((prediction, idx) => {
                  const main = prediction.structured_formatting?.main_text || prediction.description || ""
                  const secondary = prediction.structured_formatting?.secondary_text || ""
                  return (
                    <Pressable
                      key={prediction.place_id || idx}
                      onPress={() => handleSelectSuggestion(prediction)}
                      style={({ pressed }) => [
                        s.suggestion,
                        idx < suggestions.length - 1 && s.suggestionBorder,
                        pressed && { backgroundColor: colors.gray[50] },
                      ]}
                    >
                      <View style={{ marginTop: 2 }}>
                        <MapPin size={16} color={restaurantTheme.brand} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.suggestionMain}>{main}</Text>
                        {secondary ? <Text style={s.suggestionSub}>{secondary}</Text> : null}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ) : null}
            <Pressable
              onPress={handleSaveLocation}
              disabled={saveDisabled}
              style={({ pressed }) => [s.saveBtn, pressed && !saveDisabled && { opacity: 0.95 }]}
            >
              <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              {saving ? (
                <>
                  <Spinner size={20} />
                  <Text style={s.saveText}>Saving...</Text>
                </>
              ) : (
                <>
                  <Save size={20} color={colors.white} />
                  <Text style={s.saveText}>Save Location</Text>
                </>
              )}
            </Pressable>
          </View>
          {selectedLocation ? (
            <View style={s.selectedBox}>
              <Text style={s.selectedText}>
                <Text style={[s.selectedText, { fontWeight: "700" }]}>Selected Location:</Text> {selectedAddress || "Resolving address..."}
              </Text>
              <Text style={s.coordsText}>
                Coordinates: {Number(selectedLocation.latitude).toFixed(6)}, {Number(selectedLocation.longitude).toFixed(6)}
              </Text>
              {geocoding ? <Text style={s.updatingText}>Updating address details...</Text> : null}
            </View>
          ) : null}
        </View>

        {/* Instructions */}
        <View style={s.howCard}>
          <Text style={s.howTitle}>How to set your location:</Text>
          <View style={{ gap: sp(1) }}>
            {[
              "Search for your location using the search bar above, or",
              "Click anywhere on the map to place a pin at that location",
              "You can drag the pin to adjust the exact position",
              sw('Click "Save Location" to save your restaurant location'),
            ].map((line) => (
              <Text key={line} style={s.howItem}>{`•  ${line}`}</Text>
            ))}
          </View>
        </View>

        {/* Map Container */}
        <View style={s.mapCard} collapsable={false}>
          <View style={s.mapBox} collapsable={false}>
            {splashDone && mapAllowed ? (
              <AppMap
                ref={mapInstanceRef}
                style={StyleSheet.absoluteFill}
                initialRegion={regionFor(INITIAL_LOCATION, 5)}
                mapType={mapType}
                zoomControlEnabled
                onMapReady={() => setMapLoading(false)}
                onPress={handleMapPress}
              >
                {marker && Number.isFinite(marker.lat) && Number.isFinite(marker.lng) ? (
                  <Marker
                    coordinate={{ latitude: marker.lat, longitude: marker.lng }}
                    draggable
                    title="Restaurant Location"
                    description={marker.address || `${marker.lat.toFixed(6)}, ${marker.lng.toFixed(6)}`}
                    onDragEnd={(event) => {
                      const c = event?.nativeEvent?.coordinate
                      if (c) updateLocationFromCoords(c.latitude, c.longitude)
                    }}
                  />
                ) : null}
              </AppMap>
            ) : null}
          </View>
          {!mapLoading ? (
            <View style={s.mapTypeBar}>
              <Pressable onPress={() => setMapType("standard")} style={[s.mapTypeBtn, s.mapTypeBtnLeft]}>
                <Text style={[s.mapTypeText, mapType === "standard" && s.mapTypeTextOn]}>Map</Text>
              </Pressable>
              <Pressable onPress={() => setMapType("satellite")} style={s.mapTypeBtn}>
                <Text style={[s.mapTypeText, mapType === "satellite" && s.mapTypeTextOn]}>Satellite</Text>
              </Pressable>
            </View>
          ) : null}
          {mapLoading ? (
            <View style={s.mapLoading}>
              <View style={{ alignItems: "center" }}>
                <View style={{ marginBottom: sp(2) }}>
                  <Spinner size={32} color={restaurantTheme.brand} />
                </View>
                <Text style={s.mapLoadingText}>Loading map...</Text>
                <Text style={s.mapLoadingHint}>If this takes too long, please refresh the page</Text>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const s = StyleSheet.create({
  content: { padding: sp(4) },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(6) },
  backBtn: { padding: sp(2), borderRadius: 9999 },
  headerIcon: { width: 40, height: 40, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  title: { ...fontSize["2xl"], fontWeight: "700", color: colors.gray[900] },
  subtitle: { ...fontSize.sm, color: colors.gray[600] },
  searchCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: sp(3),
    marginBottom: sp(6),
    ...shadow.sm,
  },
  searchWrap: { position: "relative", justifyContent: "center" },
  searchIcon: { position: "absolute", left: sp(3), zIndex: 1 },
  searchInput: {
    width: "100%",
    paddingLeft: sp(10),
    paddingRight: sp(4),
    paddingVertical: sp(3.5),
    ...fontSize.sm,
    color: colors.gray[900],
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  searchInputFocused: { borderColor: restaurantTheme.focusBorder },
  suggestions: {
    marginTop: -sp(2),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.lg,
  },
  suggestion: { flexDirection: "row", alignItems: "flex-start", gap: sp(2.5), paddingHorizontal: sp(3), paddingVertical: sp(3) },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  suggestionMain: { ...fontSize.sm, lineHeight: 19, fontWeight: "500", color: colors.gray[900] },
  suggestionSub: { ...fontSize.xs, lineHeight: 16, color: colors.gray[500], marginTop: 2 },
  saveBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(2),
    paddingHorizontal: sp(6),
    paddingVertical: sp(3.5),
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  saveText: { color: colors.white, ...fontSize.sm, fontWeight: "600" },
  selectedBox: {
    marginTop: sp(3),
    padding: sp(3),
    backgroundColor: colors.green[50],
    borderWidth: 1,
    borderColor: colors.green[200],
    borderRadius: radius.lg,
  },
  selectedText: { ...fontSize.sm, color: colors.gray[700] },
  coordsText: { ...fontSize.xs, color: colors.gray[500], marginTop: sp(1) },
  updatingText: { ...fontSize.xs, color: restaurantTheme.brand, marginTop: sp(1) },
  howCard: {
    backgroundColor: colors.blue[50],
    borderWidth: 1,
    borderColor: colors.blue[200],
    borderRadius: radius.lg,
    padding: sp(4),
    marginBottom: sp(6),
  },
  howTitle: { ...fontSize.sm, fontWeight: "600", color: colors.blue[900], marginBottom: sp(2) },
  howItem: { ...fontSize.sm, color: colors.blue[800] },
  mapCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: "hidden",
    position: "relative",
    ...shadow.sm,
  },
  mapBox: { width: "100%", height: 600 },
  mapTypeBar: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: 2,
    ...shadow.md,
  },
  mapTypeBtn: { paddingHorizontal: sp(3), paddingVertical: sp(2) },
  mapTypeBtnLeft: { borderRightWidth: 1, borderRightColor: colors.gray[200] },
  mapTypeText: { fontSize: 13, lineHeight: 18, color: colors.gray[600] },
  mapTypeTextOn: { color: colors.black, fontWeight: "600" },
  mapLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  mapLoadingText: { ...fontSize.base, color: colors.gray[600] },
  mapLoadingHint: { ...fontSize.xs, color: colors.gray[400], marginTop: sp(2) },
})
