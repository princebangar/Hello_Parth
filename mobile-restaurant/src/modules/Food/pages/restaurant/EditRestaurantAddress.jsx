// Web: pages/restaurant/EditRestaurantAddress.jsx — "Select from map" of Edit Profile (/edit-address): restaurant name
// + address preview header, place search (LocationSearchInput), a Google map with a fixed "Your outlet location" pin
// (the map centre is the chosen point, reverse geocoded 450 ms after the map stops), the "Selected location" panel,
// "Update Address" and the "Select an option" popup (minor pin correction -> back to Edit Profile with the new
// location; full address update -> the FSSAI alert). Same API calls (GET current restaurant), texts, alerts and zoom
// levels (15, 17 after a search).
// Native:
// - the map is AppMap (react-native-maps, Google); it is built after the splash and once the start point is known; the
//   map's "idle" listener is onRegionChangeComplete; panTo + setZoom -> animateToRegion(regionFor(point, 17));
// - Edit Profile is still mounted under this page (a native stack keeps it), so "Proceed to update" and the header back
//   arrow hand the result to it (sessionStorage key below, read when Edit Profile is focused again) and go back,
//   instead of opening a second Edit Profile on top (the web pushed /edit-owner with { updatedLocation } in its state).
//   If Edit Profile is not the page below, the web's navigation is used unchanged;
// - the search suggestions push the header down while they show (see LocationSearchInput), instead of floating over
//   the map; the map keeps its own wrapper (never restyled) so Google does not rebuild its surface;
// - window.alert -> Alert.alert; lenis -> nothing; "Select an option" uses the converted BottomPopup (native sheet).
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useNavigation } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react-native"
import { useLocation, useNavigate } from "@/lib/router"
import { Screen, StatusBarSpacer, Text } from "@/native/ui"
import { AppMap, regionFor } from "@/native/ui/AppMap"
import { useSplashDone } from "@/native/splashState"
import { alpha, colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
// relative path: same file as @delivery/components/BottomPopup (scripts/check-converted.cjs has no @delivery alias)
import BottomPopup from "../../../DeliveryV2/components/BottomPopup"
import LocationSearchInput from "@food/components/restaurant/LocationSearchInput"
import { restaurantAPI } from "@food/api"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { reverseGeocodeWithGoogle } from "@food/utils/googleGeocoding"
import { formatLocationPreview } from "@food/utils/googlePlaces"

const debugError = (...args) => console.error("[EditRestaurantAddress]", ...args)

const MAP_ZOOM = 15
const MAP_ZOOM_SELECTED = 17

const DEFAULT_LAT = 22.7196
const DEFAULT_LNG = 75.8577

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]
// Native hand-off to the Edit Profile page below this one (read by EditOwner on focus).
const EDIT_OWNER_MAP_RETURN_KEY = "restaurant_edit_owner_map_return"
const SHEET_MIN_HEIGHT = 280

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
      swappedLat >= -90 &&
      swappedLat <= 90 &&
      swappedLng >= -180 &&
      swappedLng <= 180
    ) {
      return { lat: swappedLat, lng: swappedLng }
    }

    return null
  }

  return { lat, lng }
}

const toLocationFields = (source = {}) => ({
  formattedAddress: source.formattedAddress || "",
  addressLine1: source.addressLine1 || source.placeName || "",
  addressLine2: source.addressLine2 || "",
  area: source.area || "",
  city: source.city || "",
  state: source.state || "",
  pincode: source.pincode || "",
  landmark: source.landmark || source.placeName || "",
  latitude: source.latitude,
  longitude: source.longitude,
  placeName: source.placeName || source.addressLine1 || "",
})

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

function Radio({ selected }) {
  return (
    <View style={[s.radio, selected ? { borderColor: restaurantTheme.brand } : { borderColor: colors.gray[300] }]}>
      {selected ? (
        <>
          <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 9999 }]} />
          <View style={s.radioDot} />
        </>
      ) : null}
    </View>
  )
}

export default function EditRestaurantAddress() {
  const navigate = useNavigate()
  const navigation = useNavigation()
  const routerLocation = useLocation()
  const insets = useSafeAreaInsets()
  const splashDone = useSplashDone()
  // This page's own route state (the shared location follows whatever page is on top).
  const routeStateRef = useRef(routerLocation.state)
  const routeState = routeStateRef.current
  const editOwnerPath = routeState?.from || "/food/restaurant/edit-owner"
  const outletFrom = routeState?.outletFrom || "/food/restaurant/outlet-info"
  const returnTab = routeState?.returnTab || "restaurant"

  const mapInstanceRef = useRef(null)
  const mapReadyRef = useRef(false)
  const geocodeDebounceRef = useRef(null)
  const skipIdleGeocodeRef = useRef(false)
  const skipResetTimerRef = useRef(null)
  const pendingMapCenterRef = useRef(null)
  const initialCoordsRef = useRef({ lat: DEFAULT_LAT, lng: DEFAULT_LNG })
  const locationRef = useRef(null)
  const hasPrefilledLocationRef = useRef(false)
  const mapInitializedRef = useRef(false)
  const unmountedRef = useRef(false)

  const [restaurantName, setRestaurantName] = useState("")
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState(null) // where the map starts (web: the center passed to initializeMap)
  const [geocoding, setGeocoding] = useState(false)
  const [showSelectOptionDialog, setShowSelectOptionDialog] = useState(false)
  const [selectedOption, setSelectedOption] = useState("minor_correction")
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)
  const [hasMovedPin, setHasMovedPin] = useState(false)

  useEffect(
    () => () => {
      unmountedRef.current = true
      if (skipResetTimerRef.current) clearTimeout(skipResetTimerRef.current)
    },
    [],
  )

  const applyResolvedLocation = useCallback((fields, markMoved = true) => {
    const next = toLocationFields(fields)
    locationRef.current = next
    setSelectedLocation(next)
    if (next.latitude != null) setLat(Number(next.latitude))
    if (next.longitude != null) setLng(Number(next.longitude))
    if (markMoved) setHasMovedPin(true)
  }, [])

  /** Edit Profile directly under this page in the stack? */
  const editOwnerIsBelow = useCallback(() => {
    try {
      const state = navigation?.getState?.()
      const routes = state?.routes || []
      const index = typeof state?.index === "number" ? state.index : routes.length - 1
      const prev = routes[index - 1]
      return Boolean(prev && /(^|\/)edit-owner$/.test(String(prev.name || "")))
    } catch {
      return false
    }
  }, [navigation])

  const returnToEditOwner = useCallback(
    (updatedLocation) => {
      if (editOwnerIsBelow()) {
        try {
          sessionStorage.setItem(
            EDIT_OWNER_MAP_RETURN_KEY,
            JSON.stringify({ activeTab: returnTab, ...(updatedLocation ? { updatedLocation } : {}) }),
          )
        } catch {
          // ignore storage errors
        }
        navigate(-1)
        return
      }
      navigate(editOwnerPath, {
        state: {
          from: outletFrom,
          activeTab: returnTab,
          ...(updatedLocation ? { updatedLocation } : {}),
        },
      })
    },
    [editOwnerIsBelow, navigate, editOwnerPath, outletFrom, returnTab],
  )

  const goBackToEditOwner = useCallback(() => {
    returnToEditOwner(null)
  }, [returnToEditOwner])

  const updateAddressFromCoords = useCallback(
    async (nextLat, nextLng, markMoved = true) => {
      setLat(nextLat)
      setLng(nextLng)
      if (markMoved) setHasMovedPin(true)

      if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current)

      geocodeDebounceRef.current = setTimeout(async () => {
        try {
          if (markMoved) {
            setGeocoding(true)
          }
          const parsed = await reverseGeocodeWithGoogle(nextLat, nextLng)
          if (unmountedRef.current) return
          const fields = parsed.locationFields || {
            ...toLocationFields(parsed),
            latitude: nextLat,
            longitude: nextLng,
          }

          applyResolvedLocation(
            {
              ...fields,
              latitude: nextLat,
              longitude: nextLng,
            },
            markMoved,
          )
        } catch (error) {
          if (unmountedRef.current) return
          debugError("Reverse geocode failed:", error)
          applyResolvedLocation(
            {
              ...(locationRef.current || {}),
              latitude: nextLat,
              longitude: nextLng,
              formattedAddress: `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`,
            },
            markMoved,
          )
        } finally {
          if (markMoved && !unmountedRef.current) {
            setGeocoding(false)
          }
        }
      }, markMoved ? 450 : 0)
    },
    [applyResolvedLocation],
  )

  // The next "idle" after a programmatic move is ours: skip it (web: a 400 ms flag after panTo; a native camera
  // animation can end later than that, so the flag is cleared by that idle, with a fallback timer).
  const armSkipIdle = useCallback(() => {
    skipIdleGeocodeRef.current = true
    if (skipResetTimerRef.current) clearTimeout(skipResetTimerRef.current)
    skipResetTimerRef.current = setTimeout(() => {
      skipIdleGeocodeRef.current = false
    }, 1500)
  }, [])

  const panMapToCoordinates = useCallback(
    async (latitude, longitude, zoom = MAP_ZOOM_SELECTED) => {
      const nextLat = Number(latitude)
      const nextLng = Number(longitude)
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return

      setLat(nextLat)
      setLng(nextLng)
      armSkipIdle()

      const map = mapInstanceRef.current
      if (map && mapReadyRef.current) {
        map.animateToRegion(regionFor({ lat: nextLat, lng: nextLng }, zoom), 300)
        return
      }

      // map not ready yet: onMapReady moves it there
      pendingMapCenterRef.current = { lat: nextLat, lng: nextLng, zoom }
    },
    [armSkipIdle],
  )

  const loadGoogleMaps = useCallback(async (centerLat, centerLng) => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      if (!apiKey?.trim()) {
        setMapLoading(false)
        showAlert("Google Maps API key not found. Please contact administrator.")
        return
      }
      setMapCenter({ lat: centerLat, lng: centerLng })
    } catch (error) {
      debugError("Error loading Google Maps:", error)
      setMapLoading(false)
      showAlert("Failed to load map. Please refresh and try again.")
    }
  }, [])

  const handleMapReady = () => {
    mapReadyRef.current = true
    if (pendingMapCenterRef.current && mapInstanceRef.current) {
      const pending = pendingMapCenterRef.current
      armSkipIdle()
      mapInstanceRef.current.animateToRegion(regionFor({ lat: pending.lat, lng: pending.lng }, pending.zoom || MAP_ZOOM_SELECTED), 300)
      pendingMapCenterRef.current = null
    }
    setMapLoading(false)
  }

  // web: map.addListener("idle", ...)
  const handleRegionChangeComplete = (region) => {
    if (!mapReadyRef.current) return
    if (skipIdleGeocodeRef.current) {
      skipIdleGeocodeRef.current = false
      if (skipResetTimerRef.current) clearTimeout(skipResetTimerRef.current)
      return
    }

    const nextLat = region.latitude
    const nextLng = region.longitude
    const initial = initialCoordsRef.current

    const moved =
      Math.abs(nextLat - initial.lat) > 0.00001 ||
      Math.abs(nextLng - initial.lng) > 0.00001

    // Skip the first idle after map load when we already have saved outlet details.
    if (!mapInitializedRef.current) {
      mapInitializedRef.current = true
      if (!moved && hasPrefilledLocationRef.current) {
        return
      }
    }

    if (!moved && hasPrefilledLocationRef.current) {
      return
    }

    updateAddressFromCoords(nextLat, nextLng, moved)
  }

  const applyLocationData = useCallback(
    (locationData, name = "") => {
      if (name) setRestaurantName(name)

      if (locationData) {
        const fields = toLocationFields(locationData)
        hasPrefilledLocationRef.current = Boolean(
          fields.addressLine1 || fields.formattedAddress || fields.area || fields.city,
        )
        applyResolvedLocation(fields, false)

        const savedCoords = getSavedLocationCoords(locationData)
        const nextLat = savedCoords?.lat ?? DEFAULT_LAT
        const nextLng = savedCoords?.lng ?? DEFAULT_LNG

        initialCoordsRef.current = { lat: nextLat, lng: nextLng }
        setLat(nextLat)
        setLng(nextLng)
        loadGoogleMaps(nextLat, nextLng)
        return
      }

      initialCoordsRef.current = { lat: DEFAULT_LAT, lng: DEFAULT_LNG }
      loadGoogleMaps(DEFAULT_LAT, DEFAULT_LNG)
    },
    [applyResolvedLocation, loadGoogleMaps],
  )

  useEffect(() => {
    let cancelled = false
    const fetchRestaurantData = async () => {
      const passedLocation = routeStateRef.current?.currentLocation

      if (passedLocation) {
        applyLocationData(passedLocation, "")
        setLoading(false)

        restaurantAPI
          .getCurrentRestaurant()
          .then((response) => {
            if (cancelled) return
            const data = response?.data?.data?.restaurant || response?.data?.restaurant
            if (data?.name || data?.restaurantName) {
              setRestaurantName(data.name || data.restaurantName || "")
            }
          })
          .catch(() => {})
        return
      }

      try {
        setLoading(true)

        const response = await restaurantAPI.getCurrentRestaurant()
        if (cancelled) return
        const data = response?.data?.data?.restaurant || response?.data?.restaurant

        if (data) {
          applyLocationData(data.location, data.name || data.restaurantName || "")
        } else {
          applyLocationData(null)
        }
      } catch (error) {
        if (cancelled) return
        if (
          error.code !== "ERR_NETWORK" &&
          error.code !== "ECONNABORTED" &&
          !error.message?.includes("timeout")
        ) {
          debugError("Error fetching restaurant data:", error)
        }

        try {
          const savedName =
            localStorage.getItem("restaurant_name") ||
            localStorage.getItem("restaurantName") ||
            ""
          setRestaurantName(savedName)
        } catch (e) {
          debugError("Error loading from localStorage:", e)
        }
        applyLocationData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRestaurantData()

    return () => {
      cancelled = true
      if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current)
    }
  }, [applyLocationData])

  const handleSearchLocationSelect = async (location) => {
    if (!location?.latitude || !location?.longitude) return

    if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current)
    setGeocoding(false)
    hasPrefilledLocationRef.current = false

    applyResolvedLocation(location, true)
    await panMapToCoordinates(location.latitude, location.longitude, MAP_ZOOM_SELECTED)
  }

  const handleUpdateClick = () => {
    if (!hasMovedPin) {
      showAlert("Please move the map or search your outlet location before updating.")
      return
    }
    setShowSelectOptionDialog(true)
  }

  const handleProceedUpdate = () => {
    if (selectedOption === "update_address") {
      showAlert("For major address updates, FSSAI verification may be required. Please contact support.")
      setShowSelectOptionDialog(false)
      return
    }

    const currentLocation = locationRef.current || selectedLocation || {}
    const updatedLocation = {
      ...currentLocation,
      latitude: lat,
      longitude: lng,
      coordinates: [lng, lat],
      formattedAddress:
        currentLocation.formattedAddress ||
        formatLocationPreview(currentLocation) ||
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    }

    setShowSelectOptionDialog(false)
    returnToEditOwner(updatedLocation)
  }

  const previewText = formatLocationPreview(selectedLocation)
  const simplifiedAddress = previewText || "Set your outlet location"
  const updateDisabled = loading || mapLoading || geocoding

  return (
    <Screen bg={colors.white} edges={[]}>
      <View style={s.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={s.headerInner}>
          <View style={s.headerRow}>
            <Pressable
              onPress={goBackToEditOwner}
              style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={24} color={restaurantTheme.brand} />
            </Pressable>
            <View style={s.headerText}>
              <View style={s.nameRow}>
                <Text style={s.name} numberOfLines={1}>{restaurantName}</Text>
                <ChevronDown size={16} color={colors.gray[900]} />
              </View>
              <Text style={s.address} numberOfLines={1}>{simplifiedAddress}</Text>
            </View>
          </View>

          <View style={{ marginTop: sp(3) }}>
            <LocationSearchInput
              label=""
              placeholder="Search area, street, landmark..."
              biasLocation={{ latitude: lat, longitude: lng }}
              onLocationSelect={handleSearchLocationSelect}
            />
          </View>
        </View>
      </View>

      <View style={s.body} collapsable={false}>
        <View style={s.mapArea} collapsable={false}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
            {splashDone && mapCenter ? (
              <AppMap
                ref={mapInstanceRef}
                style={StyleSheet.absoluteFill}
                initialRegion={regionFor(mapCenter, MAP_ZOOM)}
                zoomControlEnabled
                onMapReady={handleMapReady}
                onRegionChangeComplete={handleRegionChangeComplete}
              />
            ) : null}
          </View>

          {mapLoading ? (
            <View style={s.mapLoading}>
              <View style={{ alignItems: "center" }}>
                <View style={{ marginBottom: sp(2) }}>
                  <Spinner size={32} />
                </View>
                <Text style={s.mapLoadingText}>Loading map...</Text>
              </View>
            </View>
          ) : null}

          {/* web: absolute top-[36%] left-1/2 -translate-x-1/2 -translate-y-full */}
          <View style={s.pinLayer} pointerEvents="none">
            <View style={s.pinTip}>
              <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={s.pinTipTitle}>Your outlet location</Text>
              <Text style={s.pinTipSub}>Drag map or search above</Text>
            </View>
            <View style={s.pinDot} />
            <View style={s.pinStem} />
          </View>
        </View>

        <View style={[s.sheet, { paddingBottom: insets.bottom }]}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>Selected location</Text>

          {geocoding && hasMovedPin ? (
            <View style={s.fetching}>
              <Spinner size={16} />
              <Text style={s.fetchingText}>Fetching exact place details...</Text>
            </View>
          ) : selectedLocation ? (
            <View style={s.details}>
              {selectedLocation.placeName || selectedLocation.addressLine1 ? (
                <View>
                  <Text style={s.fieldLabel}>Place</Text>
                  <Text style={s.placeValue}>{selectedLocation.placeName || selectedLocation.addressLine1}</Text>
                </View>
              ) : null}
              {selectedLocation.addressLine2 ? (
                <View>
                  <Text style={s.fieldLabel}>Street</Text>
                  <Text style={s.fieldValue}>{selectedLocation.addressLine2}</Text>
                </View>
              ) : null}
              <View style={s.grid}>
                <View style={s.gridCell}>
                  <Text style={s.fieldLabel}>Area</Text>
                  <Text style={s.fieldValue}>{selectedLocation.area || "—"}</Text>
                </View>
                <View style={s.gridCell}>
                  <Text style={s.fieldLabel}>City</Text>
                  <Text style={s.fieldValue}>{selectedLocation.city || "—"}</Text>
                </View>
                <View style={s.gridCell}>
                  <Text style={s.fieldLabel}>Pincode</Text>
                  <Text style={s.fieldValue}>{selectedLocation.pincode || "—"}</Text>
                </View>
                <View style={s.gridCell}>
                  <Text style={s.fieldLabel}>State</Text>
                  <Text style={s.fieldValue}>{selectedLocation.state || "—"}</Text>
                </View>
              </View>
              {hasMovedPin ? (
                <Text style={s.coords}>
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={s.emptyText}>Search your outlet or drag the map until the pin is on your exact location.</Text>
          )}

          <View style={{ paddingBottom: sp(4) }}>
            <Pressable
              onPress={handleUpdateClick}
              disabled={updateDisabled}
              style={({ pressed }) => [s.primaryBtn, updateDisabled && { opacity: 0.6 }, pressed && !updateDisabled && { transform: [{ scale: 0.98 }] }]}
            >
              <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={s.primaryBtnText}>Update Address</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <BottomPopup
        isOpen={showSelectOptionDialog}
        onClose={() => setShowSelectOptionDialog(false)}
        title="Select an option"
        maxHeight="auto"
      >
        <View>
          <Pressable onPress={() => setSelectedOption("update_address")} style={[s.optionRow, s.optionRowDashed]}>
            <View style={s.optionTextWrap}>
              <Text style={s.optionTitle}>Update outlet address (FSSAI required)</Text>
              <Text style={s.optionSub}>{previewText}</Text>
            </View>
            <View style={{ marginLeft: sp(4) }}>
              <Radio selected={selectedOption === "update_address"} />
            </View>
          </Pressable>

          <Pressable onPress={() => setSelectedOption("minor_correction")} style={s.optionRow}>
            <View style={s.optionTextWrap}>
              <Text style={s.optionTitle}>Make a minor correction to the location pin</Text>
              <Text style={s.optionSub}>If location pin on the map is slightly misplaced</Text>
            </View>
            <View style={{ marginLeft: sp(4) }}>
              <Radio selected={selectedOption === "minor_correction"} />
            </View>
          </Pressable>

          <Pressable
            onPress={handleProceedUpdate}
            style={({ pressed }) => [s.primaryBtn, { marginTop: sp(6) }, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={s.primaryBtnText}>Proceed to update</Text>
          </Pressable>
        </View>
      </BottomPopup>
    </Screen>
  )
}

const s = StyleSheet.create({
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 2 },
  headerInner: { paddingHorizontal: sp(4), paddingVertical: sp(3) },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  backBtn: { padding: sp(1.5), borderRadius: radius.lg },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: sp(1) },
  name: { flexShrink: 1, ...fontSize.base, fontWeight: "700", color: colors.gray[900] },
  address: { ...fontSize.xs, color: colors.gray[600] },
  body: { flex: 1, minHeight: 0, overflow: "hidden" },
  mapArea: { position: "absolute", left: 0, right: 0, top: 0, bottom: SHEET_MIN_HEIGHT },
  mapLoading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(colors.white, 0.8), alignItems: "center", justifyContent: "center", zIndex: 3 },
  mapLoadingText: { ...fontSize.sm, color: colors.gray[600] },
  pinLayer: { position: "absolute", left: 0, right: 0, top: 0, height: "36%", alignItems: "center", justifyContent: "flex-end", zIndex: 1 },
  pinTip: {
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    borderRadius: radius.lg,
    marginBottom: sp(2),
    maxWidth: 220,
    alignItems: "center",
    overflow: "hidden",
    ...shadow.lg,
  },
  pinTipTitle: { ...fontSize.xs, fontWeight: "600", color: colors.white, textAlign: "center" },
  pinTipSub: { fontSize: 10, lineHeight: 14, color: alpha(colors.white, 0.8), textAlign: "center" },
  pinDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: restaurantTheme.brand, borderWidth: 3, borderColor: colors.white, ...shadow.lg },
  pinStem: { width: 2, height: 12, backgroundColor: restaurantTheme.brand },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: SHEET_MIN_HEIGHT,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius["3xl"],
    borderTopRightRadius: radius["3xl"],
    paddingHorizontal: sp(4),
    paddingTop: sp(5),
    zIndex: 2,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
  },
  handle: { width: 40, height: 4, backgroundColor: colors.gray[200], borderRadius: 9999, alignSelf: "center", marginBottom: sp(4) },
  sheetTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900], marginBottom: sp(3) },
  fetching: { flexDirection: "row", alignItems: "flex-start", gap: sp(2), marginBottom: sp(4), minHeight: 148 },
  fetchingText: { ...fontSize.sm, color: colors.gray[500] },
  details: { gap: sp(2), marginBottom: sp(4), minHeight: 148 },
  fieldLabel: { fontSize: 10, lineHeight: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, color: colors.gray[500] },
  placeValue: { ...fontSize.base, fontWeight: "600", color: colors.gray[900] },
  fieldValue: { ...fontSize.sm, color: colors.gray[800] },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: sp(3) },
  gridCell: { width: "50%", paddingRight: sp(1.5) },
  coords: { fontSize: 11, lineHeight: 16, color: colors.gray[400], paddingTop: sp(1) },
  emptyText: { ...fontSize.sm, color: colors.gray[500], marginBottom: sp(4) },
  primaryBtn: {
    width: "100%",
    paddingVertical: sp(4),
    borderRadius: radius.xl,
    overflow: "hidden",
    alignItems: "center",
    ...shadow.lg,
    shadowColor: restaurantTheme.brand,
    shadowOpacity: 0.2,
  },
  primaryBtnText: { color: colors.white, fontWeight: "700", ...fontSize.base },
  optionRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingVertical: sp(4) },
  optionRowDashed: { borderBottomWidth: 1, borderBottomColor: colors.gray[300], borderStyle: "dashed" },
  optionTextWrap: { flex: 1 },
  optionTitle: { ...fontSize.base, fontWeight: "600", color: colors.gray[900], marginBottom: sp(1) },
  optionSub: { ...fontSize.sm, color: colors.gray[500] },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
})
