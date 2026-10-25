import React, { useMemo, useState, useEffect, useRef } from "react"
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ChevronLeft, ChevronRight, Plus, MapPin, Home, Building2, Briefcase, Phone, Crosshair } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "@/lib/toast"
import { locationAPI, userAPI } from "@food/api"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey.js"
import { AppMap, Marker, Circle, regionFor, toLatLng } from "@/native/ui/AppMap"
import { Text, TextInput } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"
const debugLog = (..._args) => {}
const debugWarn = (..._args) => {}
const debugError = (..._args) => {}

// Enable Maps if API Key is available, otherwise fallback to coordinates-only mode
const MAPS_ENABLED = !!globalThis.__ENV__?.VITE_GOOGLE_MAPS_API_KEY

// Hide basemap "tiles" (roads/labels/POIs) for pin-only UI — the web map's styles.
const PIN_ONLY_MAP_STYLE = [
  { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "all", stylers: [{ color: "#f3f4f6" }] },
]

// Nominatim asks every client to identify itself (the browser sent its own User-Agent / Referer).
const NOMINATIM_HEADERS = { Accept: "application/json", "User-Agent": "HelloParth/1.0 (https://helloparth.in)" }

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

const EMPTY_FORM = {
  street: "",
  city: "",
  state: "",
  zipCode: "",
  additionalDetails: "",
  label: "Home",
  phone: "",
}

/** The web's slideDown / slideUp keyframes with their delays */
function Slide({ dir = "down", delay = 0, children, style }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start()
  }, [v, delay])
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dir === "down" ? -10 : 10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  )
}

function Field({ s, t, style, ...props }) {
  return (
    <TextInput
      placeholderTextColor={t.dark ? colors.gray[500] : brandMuted}
      style={[s.input, style]}
      {...props}
    />
  )
}

const brandMuted = "#6f6150"

export default function LocationSelectorOverlay({ isOpen, onClose }) {
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const { location, loading, requestLocation } = useGeoLocation()
  const navigate = useNavigate()
  const { addresses = [], addAddress, updateAddress, setDefaultAddress, userProfile, isAuthenticated } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState(EMPTY_FORM)
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const googleMapRef = useRef(null) // native map instance
  const mapReadyRef = useRef(false)
  const [greenMarkerPos, setGreenMarkerPos] = useState(null) // Green marker for address selection
  const [userDot, setUserDot] = useState(null) // Blue dot + accuracy circle for user location
  const watchPositionIdRef = useRef(null) // Geolocation watchPosition ID
  const [currentAddress, setCurrentAddress] = useState("")
  const [addressAutocompleteValue, setAddressAutocompleteValue] = useState("")
  const [keywordAddressSuggestions, setKeywordAddressSuggestions] = useState([])
  const [isKeywordSearching, setIsKeywordSearching] = useState(false)
  const [lockMapToAutocomplete, setLockMapToAutocomplete] = useState(true)
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  // Backend reverse geocode (on by default unless explicitly disabled)
  const ENABLE_LOCATION_REVERSE_GEOCODE =
    globalThis.__ENV__?.VITE_ENABLE_LOCATION_REVERSE_GEOCODE !== "false"
  // Nominatim keyword search (on by default unless explicitly disabled)
  const ENABLE_NOMINATIM_SEARCH = globalThis.__ENV__?.VITE_ENABLE_NOMINATIM_SEARCH !== "false"
  const getAddressId = (address) => address?.id || address?._id || null

  const addressAutocompleteSuggestions = useMemo(() => {
    const q = String(addressAutocompleteValue || "").trim().toLowerCase()
    if (!q) return []
    const list = Array.isArray(addresses) ? addresses : []
    return list
      .map((addr) => {
        const text = [
          addr?.label,
          addr?.additionalDetails,
          addr?.street,
          addr?.city,
          addr?.state,
          addr?.zipCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return { addr, text }
      })
      .filter((x) => x.text.includes(q))
      .slice(0, 6)
      .map((x) => x.addr)
  }, [addresses, addressAutocompleteValue])

  useEffect(() => {
    if (!showAddressForm) return
    const q = String(addressAutocompleteValue || "").trim()
    if (!ENABLE_NOMINATIM_SEARCH) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }
    if (q.length < 3) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }

    const timer = setTimeout(async () => {
      try {
        setIsKeywordSearching(true)
        // Reference point for "nearest" sorting.
        // Prefer currently selected map position, fallback to live location, then Indore default.
        const refLat = Number.isFinite(mapPosition?.[0]) ? Number(mapPosition[0]) : (location?.latitude ?? 22.7196)
        const refLng = Number.isFinite(mapPosition?.[1]) ? Number(mapPosition[1]) : (location?.longitude ?? 75.8577)

        const url =
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: NOMINATIM_HEADERS })
        const json = await res.json()
        const list = Array.isArray(json) ? json : []
        const mapped = list.map((r) => ({
          id: r.place_id || r.osm_id || `${r.lat},${r.lon}`,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          address: r.address || {},
        }))
        const withDistance = mapped
          .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
          .map((x) => ({
            ...x,
            distanceMeters: calculateDistance(refLat, refLng, x.lat, x.lng),
          }))
          .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
          .slice(0, 4)

        setKeywordAddressSuggestions(withDistance)
      } catch (e) {
        setKeywordAddressSuggestions([])
      } finally {
        setIsKeywordSearching(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [
    addressAutocompleteValue,
    showAddressForm,
    location?.latitude,
    location?.longitude,
    mapPosition,
    ENABLE_NOMINATIM_SEARCH,
  ])

  // Load Google Maps API key
  useEffect(() => {
    if (!MAPS_ENABLED) return
    getGoogleMapsApiKey().then((key) => {
      setGOOGLE_MAPS_API_KEY(key)
    })
  }, [])
  const reverseGeocodeTimeoutRef = useRef(null) // Debounce timeout for reverse geocoding
  const lastReverseGeocodeCoordsRef = useRef(null) // Track last coordinates to avoid duplicate calls

  useEffect(() => () => {
    if (reverseGeocodeTimeoutRef.current) clearTimeout(reverseGeocodeTimeoutRef.current)
  }, [])

  // Current location display - Show complete formatted address (SAVED ADDRESSES FORMAT)
  const currentLocationText = (() => {
    if (currentAddress &&
      currentAddress !== "Select location" &&
      !currentAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      let fullAddress = currentAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      return fullAddress
    }

    if (addressFormData.additionalDetails &&
      addressFormData.additionalDetails !== "Select location" &&
      addressFormData.additionalDetails.trim() !== "") {
      let fullAddress = addressFormData.additionalDetails
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      const addressParts = [fullAddress]
      if (addressFormData.city) addressParts.push(addressFormData.city)
      if (addressFormData.state) {
        if (addressFormData.zipCode) {
          addressParts.push(`${addressFormData.state} ${addressFormData.zipCode}`)
        } else {
          addressParts.push(addressFormData.state)
        }
      } else if (addressFormData.zipCode) {
        addressParts.push(addressFormData.zipCode)
      }
      return addressParts.join(', ')
    }

    if (location?.formattedAddress &&
      location.formattedAddress !== "Select location" &&
      !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      let fullAddress = location.formattedAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      return fullAddress
    }

    if (location?.address || location?.area || location?.street) {
      const addressParts = []
      if (location.address && location.address !== "Select location") {
        addressParts.push(location.address)
      } else if (location.area) {
        addressParts.push(location.area)
      } else if (location.street) {
        addressParts.push(location.street)
      }
      if (location.city) {
        addressParts.push(location.city)
      }
      if (location.state) {
        addressParts.push(location.state)
      }
      if (location.postalCode) {
        addressParts.push(location.postalCode)
      }
      if (addressParts.length > 0) {
        return addressParts.join(', ')
      }
    }

    if (location?.area && location?.city && location?.state) {
      const parts = [location.area, location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return parts.join(', ')
    }

    if (location?.city && location?.state) {
      const parts = [location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return parts.join(', ')
    }

    return location?.city || location?.area || "Detecting location..."
  })()

  // Update the blue dot from the location hook (while the map is shown)
  useEffect(() => {
    if (location?.latitude && location?.longitude && showAddressForm) {
      setUserDot({
        lat: location.latitude,
        lng: location.longitude,
        accuracy: Math.max(location.accuracy || 50, 20),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    location?.latitude || null,
    location?.longitude || null,
    location?.accuracy || null,
  ])

  const initialLocation = location?.latitude && location?.longitude
    ? { lat: location.latitude, lng: location.longitude }
    : { lat: 22.7196, lng: 75.8577 }

  // Map (re)initialisation: the web re-created the map whenever the form opened or the live location changed —
  // centre + green marker go back to the current location, then live tracking starts.
  useEffect(() => {
    if (!MAPS_ENABLED) {
      if (mapLoading) setMapLoading(false)
      return undefined
    }

    if (!showAddressForm || !GOOGLE_MAPS_API_KEY) {
      return undefined
    }

    let isMounted = true
    if (!mapReadyRef.current) setMapLoading(true)
    setGreenMarkerPos(initialLocation)
    if (mapReadyRef.current) {
      googleMapRef.current?.animateToRegion(regionFor(initialLocation, 15), 300)
    }

    const startTracking = () => {
      if (!isMounted) return
      const createBlueDotWithCircle = (position, accuracyValue) => {
        if (!isMounted) return
        setUserDot({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.max(accuracyValue || 50, 20), // Minimum 20m
        })
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!isMounted) return
            createBlueDotWithCircle(position, position.coords.accuracy)
          },
          (error) => {
            debugWarn("Geolocation getCurrentPosition error:", error)
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )

        if (watchPositionIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchPositionIdRef.current)
        }
        watchPositionIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            if (!isMounted) return
            createBlueDotWithCircle(position, position.coords.accuracy)
          },
          (error) => {
            if (error.code !== 3) {
              debugWarn("Geolocation watchPosition error:", error)
            }
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        )
      }
    }

    // wait for the map to be ready (the web's 'idle' listener)
    let poll = null
    if (mapReadyRef.current) startTracking()
    else {
      poll = setInterval(() => {
        if (mapReadyRef.current) {
          clearInterval(poll)
          poll = null
          startTracking()
        }
      }, 100)
    }

    return () => {
      isMounted = false
      if (poll) clearInterval(poll)
      if (watchPositionIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current)
        watchPositionIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddressForm, GOOGLE_MAPS_API_KEY, location?.latitude, location?.longitude])

  useEffect(() => {
    if (!showAddressForm) {
      mapReadyRef.current = false
      setUserDot(null)
    }
  }, [showAddressForm])

  const panMapTo = (lat, lng) => {
    if (!googleMapRef.current || !mapReadyRef.current) return false
    googleMapRef.current.animateToRegion(regionFor({ lat, lng }, 17), 400)
    setGreenMarkerPos({ lat, lng })
    return true
  }

  const MAP_MOVE_DEBOUNCE_MS = 1000
  const MAP_MOVE_MIN_PAN_METERS = 50

  const handleMapMoveEnd = async (lat, lng) => {
    const roundedLat = parseFloat(lat.toFixed(6))
    const roundedLng = parseFloat(lng.toFixed(6))
    const coordLabel = `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`

    const last = lastReverseGeocodeCoordsRef.current
    if (last) {
      const lastLat = parseFloat(last.lat.toFixed(6))
      const lastLng = parseFloat(last.lng.toFixed(6))
      if (lastLat === roundedLat && lastLng === roundedLng) {
        return
      }
      const movedM = calculateDistance(last.lat, last.lng, roundedLat, roundedLng)
      if (movedM < MAP_MOVE_MIN_PAN_METERS) {
        return
      }
    }

    if (reverseGeocodeTimeoutRef.current) {
      clearTimeout(reverseGeocodeTimeoutRef.current)
    }

    reverseGeocodeTimeoutRef.current = setTimeout(async () => {
      lastReverseGeocodeCoordsRef.current = { lat: roundedLat, lng: roundedLng }

      if (!ENABLE_LOCATION_REVERSE_GEOCODE) {
        setCurrentAddress(coordLabel)
        setAddressFormData((prev) => ({
          ...prev,
          additionalDetails: coordLabel || prev.additionalDetails,
        }))
        return
      }

      setLoadingAddress(true)
      try {
        let formattedAddress = ""
        let city = ""
        let state = ""
        let area = ""
        let street = ""
        let streetNumber = ""
        let postalCode = ""
        let pointOfInterest = ""
        let premise = ""

        const nominatimReverse = async () => {
          const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${roundedLat}&lon=${roundedLng}&addressdetails=1`
          const nomRes = await fetch(nominatimUrl, { headers: NOMINATIM_HEADERS })
          return nomRes.json()
        }

        try {
          const response = await locationAPI.reverseGeocode(roundedLat, roundedLng)
          const backendData = response?.data?.data
          const result = backendData?.results?.[0] || backendData?.result?.[0] || null
          if (result) {
            formattedAddress = result.formatted_address || result.formattedAddress || ""
            const addressComponents = result.address_components || {}
            city = addressComponents.city || ""
            state = addressComponents.state || ""
            area = addressComponents.area || ""
          } else {
            const nomJson = await nominatimReverse()
            if (nomJson && nomJson.display_name) {
              formattedAddress = nomJson.display_name
              const a = nomJson.address || {}
              city = a.city || a.town || a.village || ""
              state = a.state || ""
              area = a.suburb || a.neighbourhood || ""
            }
          }
        } catch (backendError) {
          debugError("Backend reverse geocode failed, trying Nominatim fallback:", backendError)
          try {
            const nomJson = await nominatimReverse()
            if (nomJson && nomJson.display_name) {
              formattedAddress = nomJson.display_name
              const a = nomJson.address || {}
              city = a.city || a.town || a.village || ""
              state = a.state || ""
              area = a.suburb || a.neighbourhood || ""
            } else {
              formattedAddress = coordLabel
            }
          } catch (nomError) {
            formattedAddress = coordLabel
          }
        }

        if (formattedAddress || city || state) {
          if (!formattedAddress || formattedAddress.split(",").length < 3) {
            const addressParts = []
            if (pointOfInterest) addressParts.push(pointOfInterest)
            if (premise && premise !== pointOfInterest) addressParts.push(premise)
            if (streetNumber && street) addressParts.push(`${streetNumber} ${street}`)
            else if (street) addressParts.push(street)
            else if (area) addressParts.push(area)
            if (city) addressParts.push(city)
            if (state) {
              if (postalCode) addressParts.push(`${state} ${postalCode}`)
              else addressParts.push(state)
            }
            formattedAddress = addressParts.join(", ")
          }

          if (!street && formattedAddress) {
            const parts = formattedAddress.split(",").map((p) => p.trim()).filter((p) => p.length > 0)
            if (parts.length > 0) {
              street = parts[0]
            }
          }

          if (!area) {
            area = pointOfInterest || premise || street || ""
          }

          if (formattedAddress) {
            formattedAddress = formattedAddress.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, "").trim()
            if (formattedAddress.endsWith(", India")) {
              formattedAddress = formattedAddress.replace(", India", "").trim()
            }
          }
          if (street) street = street.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, "").trim()
          if (area) area = area.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, "").trim()
          if (pointOfInterest) pointOfInterest = pointOfInterest.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, "").trim()
          if (premise) premise = premise.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, "").trim()

          setCurrentAddress(formattedAddress || coordLabel)

          const fullAddressForField =
            formattedAddress ||
            (pointOfInterest && city && state ? `${pointOfInterest}, ${city}, ${state}` : "") ||
            (premise && city && state ? `${premise}, ${city}, ${state}` : "") ||
            (street && city && state ? `${street}, ${city}, ${state}` : "") ||
            (area && city && state ? `${area}, ${city}, ${state}` : "") ||
            (city && state ? `${city}, ${state}` : "") ||
            ""

          setAddressFormData((prev) => ({
            ...prev,
            street: street || prev.street,
            city: city || prev.city,
            state: state || prev.state,
            zipCode: postalCode || prev.zipCode,
            additionalDetails: fullAddressForField || prev.additionalDetails,
          }))
        } else {
          setCurrentAddress(coordLabel)
        }
      } catch (error) {
        debugError("Error reverse geocoding:", error)
        setCurrentAddress(coordLabel)
      } finally {
        setLoadingAddress(false)
      }
    }, MAP_MOVE_DEBOUNCE_MS)
  }

  const locationErrorMessage = (raceError) => {
    let errorMessage = "Could not get location. Please try again."
    if (raceError.message.includes("permission") || raceError.message.includes("denied")) {
      errorMessage = "Location permission denied. Please enable location access in your browser settings."
    } else if (raceError.message.includes("timeout") || raceError.message.includes("longer")) {
      errorMessage = "Location request timed out. Please check your GPS settings and try again."
    } else if (raceError.message.includes("unavailable")) {
      errorMessage = "Location information is unavailable. Please check your device settings."
    }
    return errorMessage
  }

  const handleUseCurrentLocation = async () => {
    try {
      if (!navigator.geolocation) {
        toast.error("Location services are not supported in your browser", {
          duration: 3000,
        })
        return
      }

      const locationPromise = requestLocation()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Location request is taking longer than expected. Please check your GPS settings.")), 15000)
      )

      let locationData
      try {
        locationData = await Promise.race([locationPromise, timeoutPromise])

        if (!locationData || (!locationData.latitude || !locationData.longitude)) {
          throw new Error("Invalid location data received")
        }
      } catch (raceError) {
        debugWarn("Location request failed or timed out:", raceError.message)

        const stored = localStorage.getItem("userLocation")
        if (stored) {
          try {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              locationData = cachedLocation
              toast.info("Using your last known location", {
                id: "location-request",
                duration: 2000,
              })
            } else {
              throw new Error("Invalid cached location")
            }
          } catch (cacheErr) {
            toast.error(locationErrorMessage(raceError), {
              id: "location-request",
              duration: 5000,
            })
            return
          }
        } else {
          toast.error(locationErrorMessage(raceError), {
            id: "location-request",
            duration: 5000,
          })
          return
        }
      }

      if (!locationData) {
        toast.error("Could not get location. Please try again.", { id: "location-request" })
        return
      }

      if (!locationData.latitude || !locationData.longitude) {
        toast.error("Invalid location data received. Please try again.", { id: "location-request" })
        return
      }

      // Save location to backend with ALL fields
      if (locationData?.latitude && locationData?.longitude) {
        try {
          await userAPI.updateLocation({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            address: locationData.address || locationData.formattedAddress || "",
            city: locationData.city || "",
            state: locationData.state || "",
            area: locationData.area || "",
            formattedAddress: locationData.formattedAddress || locationData.address || "",
            accuracy: locationData.accuracy,
            postalCode: locationData.postalCode,
            street: locationData.street,
            streetNumber: locationData.streetNumber
          })
        } catch (backendError) {
          if (backendError.code !== 'ERR_NETWORK' && backendError.message !== 'Network Error') {
            debugError("Error saving location to backend:", backendError)
          }
        }
      }

      if (locationData?.latitude && locationData?.longitude) {
        setMapPosition([locationData.latitude, locationData.longitude])

        if (locationData.formattedAddress) {
          setCurrentAddress(locationData.formattedAddress)
          setAddressFormData(prev => ({
            ...prev,
            street: locationData.street || locationData.area || prev.street,
            city: locationData.city || prev.city,
            state: locationData.state || prev.state,
            zipCode: locationData.postalCode || prev.zipCode,
            additionalDetails: locationData.formattedAddress || prev.additionalDetails,
          }))
        }

        if (panMapTo(locationData.latitude, locationData.longitude)) {
          setTimeout(async () => {
            await handleMapMoveEnd(locationData.latitude, locationData.longitude)
          }, 500)
        } else {
          setTimeout(async () => {
            await handleMapMoveEnd(locationData.latitude, locationData.longitude)
          }, 300)
        }
      }

      // Requirement: when user taps "Use current location" from delivery-location selector,
      // don't open the "Add address" form. Just close and return to homepage.
      try {
        localStorage.setItem("deliveryAddressMode", "current");
      } catch {}
      setShowAddressForm(false)
      setAddressFormData((prev) => ({
        ...prev,
        street: locationData.street || locationData.area || prev.street,
        city: locationData.city || prev.city,
        state: locationData.state || prev.state,
        zipCode: locationData.postalCode || prev.zipCode,
        additionalDetails: locationData.formattedAddress || prev.additionalDetails,
        phone: prev.phone || userProfile?.phone || "",
      }))
      onClose()

      const addressPreview = locationData?.formattedAddress || locationData?.address || "Location updated"
      toast.success(`Location ready: ${addressPreview.split(',').slice(0, 2).join(', ')}`, {
        id: "location-request",
        duration: 2400,
      })
    } catch (error) {
      if (error.code === 1 || error.message?.includes("denied") || error.message?.includes("permission")) {
        toast.error("Location permission denied. Please enable location access in your browser settings.", {
          id: "location-request",
          duration: 4000,
        })
      } else if (error.code === 2 || error.message?.includes("unavailable")) {
        toast.error("Location unavailable. Please check your GPS settings.", {
          id: "location-request",
          duration: 3000,
        })
      } else if (error.code === 3 || error.message?.includes("timeout")) {
        toast.error("Location request timed out. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
      } else {
        toast.error("Failed to get location. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
      }
    }
  }

  const handleAddAddress = () => {
    if (!isAuthenticated) {
      toast.info("Please login to add an address", {
        description: "You'll be redirected to the login page",
        duration: 3000,
      })
      onClose()
      navigate("/login")
      return
    }
    setShowAddressForm(true)
    if (location?.latitude && location?.longitude) {
      setMapPosition([location.latitude, location.longitude])
      setAddressFormData(prev => ({
        ...prev,
        city: location.city || "",
        state: location.state || "",
        street: location.address || location.area || "",
        phone: userProfile?.phone || "",
      }))
    }
  }

  const handleAddressFormChange = (name) => (value) => {
    setAddressFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleUseCurrentLocationForAddress = async () => {
    try {
      if (!navigator.geolocation) {
        toast.error("Location services are not supported")
        return
      }

      toast.loading("Getting your fresh location...", { id: "current-location" })

      const locationPromise = requestLocation(true, true) // forceFresh = true, updateDB = true
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Location timeout")), 10000)
      )

      let locationData
      try {
        locationData = await Promise.race([locationPromise, timeoutPromise])
      } catch (raceError) {
        const stored = localStorage.getItem("userLocation")
        if (stored) {
          try {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              locationData = cachedLocation
            } else {
              throw new Error("Invalid cached location")
            }
          } catch (cacheErr) {
            toast.error("Could not get location. Please try again.", { id: "current-location" })
            return
          }
        } else {
          toast.error("Could not get location. Please try again.", { id: "current-location" })
          return
        }
      }

      if (!locationData?.latitude || !locationData?.longitude) {
        toast.error("Could not get your location. Please try again.", { id: "current-location" })
        return
      }

      const lat = parseFloat(locationData.latitude)
      const lng = parseFloat(locationData.longitude)

      if (isNaN(lat) || isNaN(lng)) {
        toast.error("Invalid location coordinates", { id: "current-location" })
        return
      }

      setMapPosition([lat, lng])
      toast.success("Location updated", { id: "current-location" })

      if (panMapTo(lat, lng)) {
        setUserDot({ lat, lng, accuracy: Math.max(locationData?.accuracy || 50, 20) })
        setTimeout(async () => {
          await handleMapMoveEnd(lat, lng)
          toast.success("Location updated!", { id: "current-location" })
        }, 200)
      } else {
        setTimeout(async () => {
          await handleMapMoveEnd(lat, lng)
          toast.success("Location updated!", { id: "current-location" })
        }, 200)
      }
    } catch (error) {
      debugError("Error getting current location:", error)

      if (error.message && (error.message.includes("timeout") || error.message.includes("Timeout"))) {
        try {
          const stored = localStorage.getItem("userLocation")
          if (stored) {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              setMapPosition([cachedLocation.latitude, cachedLocation.longitude])
              if (panMapTo(cachedLocation.latitude, cachedLocation.longitude)) {
                setTimeout(async () => {
                  await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude);
                  toast.success("Using cached location", { id: "current-location" });
                }, 500);
              } else {
                setTimeout(async () => {
                  await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude)
                  toast.success("Using cached location", { id: "current-location" })
                }, 300)
              }
              return
            }
          }
        } catch (cacheErr) {
          debugWarn("Failed to use cached location:", cacheErr)
        }

        toast.warning("Location request timed out. Please try again or check your GPS settings.", { id: "current-location" })
      } else {
        toast.error("Failed to get current location: " + (error.message || "Unknown error"), { id: "current-location" })
      }
    }
  }

  const handleAddressFormSubmit = async () => {
    let addressToSave = null

    // Validate required fields (zipCode is optional)
    if (!addressFormData.street || !addressFormData.city || !addressFormData.state) {
      toast.error("Please fill in all required fields (Street, City, State)")
      return
    }

    // Validate that we have coordinates
    if (!mapPosition || mapPosition.length !== 2 || !mapPosition[0] || !mapPosition[1]) {
      toast.error("Please select a location on the map")
      return
    }

    setLoadingAddress(true)
    try {
      // Backend label enum: ['Home', 'Office', 'Other'] - not 'Work'
      let normalizedLabel = addressFormData.label || "Home"
      if (normalizedLabel === "Work") {
        normalizedLabel = "Office"
      }
      if (!["Home", "Office", "Other"].includes(normalizedLabel)) {
        normalizedLabel = "Other"
      }

      const trimmedStreet = addressFormData.street.trim()
      const trimmedCity = addressFormData.city.trim()
      const trimmedState = addressFormData.state.trim()

      if (!trimmedStreet || !trimmedCity || !trimmedState) {
        toast.error("Street, City, and State cannot be empty")
        setLoadingAddress(false)
        return
      }

      addressToSave = {
        label: normalizedLabel,
        street: trimmedStreet,
        additionalDetails: (addressFormData.additionalDetails || "").trim(),
        city: trimmedCity,
        state: trimmedState,
        zipCode: (addressFormData.zipCode || "").trim(),
        latitude: mapPosition[0],
        longitude: mapPosition[1],
      }

      const existingAddressWithSameLabel = addresses.find(addr => addr.label === normalizedLabel)
      const existingAddressId = existingAddressWithSameLabel?.id || existingAddressWithSameLabel?._id

      let savedAddress = null
      if (existingAddressWithSameLabel && existingAddressId) {
        savedAddress = await updateAddress(existingAddressId, addressToSave)
        toast.success(`Address updated for ${normalizedLabel}!`)
      } else {
        savedAddress = await addAddress(addressToSave)
        toast.success(`Address saved as ${normalizedLabel}!`)
      }

      const savedAddressId = getAddressId(savedAddress) || existingAddressId
      if (savedAddressId) {
        setDefaultAddress(savedAddressId)
        try {
          localStorage.setItem("deliveryAddressMode", "saved")
        } catch {}
      }

      try {
        const locationData = {
          label: addressToSave.label || "Home",
          city: addressToSave.city,
          state: addressToSave.state,
          address: `${addressToSave.street}, ${addressToSave.city}`,
          area: addressToSave.additionalDetails || "",
          zipCode: addressToSave.zipCode,
          latitude: addressToSave.latitude,
          longitude: addressToSave.longitude,
          formattedAddress: `${addressToSave.street}, ${addressToSave.city}, ${addressToSave.state}`
        }
        localStorage.setItem("userLocation", JSON.stringify(locationData))
        window.dispatchEvent(new CustomEvent("userLocationUpdated"))
      } catch (locationErr) {
        debugError("Failed to update userLocation after save:", locationErr)
      }

      setAddressFormData(EMPTY_FORM)
      setShowAddressForm(false)
      setLoadingAddress(false)

      onClose()
    } catch (error) {
      debugError("Error saving address:", error)

      let errorMessage = "Failed to add address. Please try again."
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid address data. Please check all fields."
      } else if (error.response?.status === 500) {
        errorMessage = "Server error. Please try again later."
      }

      toast.error(errorMessage)
      setLoadingAddress(false)
    }
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
    setAddressAutocompleteValue("")
    setKeywordAddressSuggestions([])
    setIsKeywordSearching(false)
    setLockMapToAutocomplete(true)
    setAddressFormData(EMPTY_FORM)
  }

  const handleSelectSavedAddress = async (address) => {
    try {
      const coordinates = address.location?.coordinates || []
      const longitude = coordinates[0]
      const latitude = coordinates[1]

      if (latitude && longitude) {
        await userAPI.updateLocation({
          latitude,
          longitude,
          address: `${address.street}, ${address.city}`,
          city: address.city,
          state: address.state,
          area: address.additionalDetails || "",
          formattedAddress: `${address.street}, ${address.city}, ${address.state}`
        })
      }

      const locationData = {
        label: address.label || "Home",
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: `${address.street}, ${address.city}, ${address.state}`
      }
      localStorage.setItem("userLocation", JSON.stringify(locationData))
      try {
        window.dispatchEvent(new CustomEvent("userLocationUpdated"))
      } catch (evtErr) {
        debugWarn("Failed to dispatch custom event:", evtErr)
      }

      setMapPosition([latitude, longitude])

      setAddressFormData({
        street: address.street || "",
        city: address.city || "",
        state: address.state || "",
        zipCode: address.zipCode || "",
        additionalDetails: address.additionalDetails || "",
        label: address.label || "Home",
        phone: address.phone || "",
      })

      if (latitude && longitude && panMapTo(latitude, longitude)) {
        setTimeout(async () => {
          await handleMapMoveEnd(latitude, longitude)
          toast.success("Location updated!", { id: "saved-address" })
        }, 500)
      } else {
        setTimeout(async () => {
          await handleMapMoveEnd(latitude, longitude)
          toast.success("Location updated!", { id: "saved-address" })
        }, 300)
      }

      const selectedAddressId = getAddressId(address)
      if (selectedAddressId) {
        setDefaultAddress(selectedAddressId)
      }
      try {
        localStorage.setItem("deliveryAddressMode", "saved");
      } catch {}
      onClose()
    } catch (error) {
      debugError("Error selecting saved address:", error)
      toast.error("Failed to update location. Please try again.")
    }
  }

  if (!isOpen) return null

  const green = t.dark ? colors.green[400] : colors.green[600]

  // If showing address form, render full-screen address form
  if (showAddressForm) {
    const showKeywordList =
      addressAutocompleteValue.trim().length > 0 &&
      (keywordAddressSuggestions.length > 0 || addressAutocompleteSuggestions.length > 0)
    return (
      <Modal visible animationType="none" statusBarTranslucent onRequestClose={handleCancelAddressForm}>
        <View style={[s.formRoot, { paddingBottom: 0 }]}>
          {/* Header */}
          <View style={[s.formHeader, { paddingTop: insets.top + sp(3) }]}>
            <View style={s.headerRow}>
              <Pressable onPress={handleCancelAddressForm} style={s.iconBtn}>
                <ChevronLeft size={24} color={t.dark ? colors.gray[300] : colors.gray[700]} />
              </Pressable>
              <Text style={s.formTitle}>Select delivery location</Text>
            </View>
          </View>

          {/* Map Section - Google Maps */}
          <View style={{ height: Math.max(windowHeight * 0.35, 250) }}>
            <View style={s.mapBox}>
              {MAPS_ENABLED && !!GOOGLE_MAPS_API_KEY && (
                <AppMap
                  ref={googleMapRef}
                  style={{ width: "100%", height: "100%" }}
                  initialRegion={regionFor(initialLocation, 15)}
                  customMapStyle={PIN_ONLY_MAP_STYLE}
                  scrollEnabled={!lockMapToAutocomplete}
                  zoomEnabled={!lockMapToAutocomplete}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  zoomControlEnabled
                  onMapReady={() => {
                    mapReadyRef.current = true
                    setMapLoading(false)
                  }}
                >
                  {!!greenMarkerPos && (
                    <Marker coordinate={toLatLng(greenMarkerPos)} pinColor="green" title="Selected location" />
                  )}
                  {!!userDot && (
                    <Circle
                      center={toLatLng(userDot)}
                      radius={userDot.accuracy}
                      strokeColor={alpha("#4285F4", 0.4)}
                      strokeWidth={1}
                      fillColor={alpha("#4285F4", 0.15)}
                      zIndex={1}
                    />
                  )}
                  {!!userDot && (
                    <Marker coordinate={toLatLng(userDot)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title="Your location" zIndex={2}>
                      <View style={s.blueDot} />
                    </Marker>
                  )}
                </AppMap>
              )}
            </View>

            {/* Loading State */}
            {mapLoading && (
              <View style={s.mapOverlay}>
                <View style={{ alignItems: "center" }}>
                  <ActivityIndicator size="large" color={colors.green[600]} style={{ marginBottom: sp(2) }} />
                  <Text style={s.mapOverlayText}>Loading map...</Text>
                </View>
              </View>
            )}

            {/* API Key Missing Error */}
            {!GOOGLE_MAPS_API_KEY && !mapLoading && (
              <View style={[s.mapOverlay, { backgroundColor: t.dark ? colors.gray[900] : colors.gray[100] }]}>
                <View style={{ alignItems: "center", padding: sp(4) }}>
                  <MapPin size={48} color={colors.gray[400]} style={{ marginBottom: sp(2) }} />
                  <Text style={s.mapOverlayText}>Google Maps API key not found</Text>
                  <Text style={s.mapOverlaySub}>Please set VITE_GOOGLE_MAPS_API_KEY in .env file</Text>
                </View>
              </View>
            )}

            {/* Use Current Location Button */}
            <View style={s.useCurrentWrap} pointerEvents="box-none">
              <Pressable
                onPress={handleUseCurrentLocationForAddress}
                disabled={mapLoading}
                style={({ pressed }) => [s.useCurrentBtn, mapLoading && { opacity: 0.5 }, pressed && { backgroundColor: t.dark ? alpha(colors.green[900], 0.2) : colors.green[50] }]}
              >
                <Crosshair size={16} color={green} strokeWidth={2.5} />
                <Text style={[s.useCurrentText, { color: green }]}>Use current location</Text>
              </Pressable>
            </View>
          </View>

          {/* Form Section - Scrollable */}
          <ScrollView style={s.formScroll} contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
            {/* Autocomplete address selection */}
            <View style={{ zIndex: 50 }}>
              <Text style={s.label}>Address (Autocomplete)</Text>
              <View>
                <Field
                  s={s}
                  t={t}
                  value={addressAutocompleteValue}
                  onChangeText={setAddressAutocompleteValue}
                  placeholder="Type a keyword (area, street, landmark)..."
                />

                {showKeywordList && (
                  <View style={s.suggestBox}>
                    {isKeywordSearching && (
                      <View style={{ paddingHorizontal: sp(4), paddingVertical: sp(3) }}>
                        <Text style={s.searchingText}>Searching…</Text>
                      </View>
                    )}

                    {keywordAddressSuggestions.map((p, i) => (
                      <Pressable
                        key={String(p.id)}
                        onPress={async () => {
                          const latitude = p.lat
                          const longitude = p.lng

                          setAddressAutocompleteValue(p.display || "")
                          setKeywordAddressSuggestions([])

                          const a = p.address || {}
                          const city = a.city || a.town || a.village || a.county || ""
                          const state = a.state || ""
                          const zipCode = a.postcode || ""
                          const street =
                            a.road ||
                            a.neighbourhood ||
                            a.suburb ||
                            a.hamlet ||
                            (String(p.display || "").split(",")[0] || "").trim()

                          setCurrentAddress(p.display || "")
                          setAddressFormData((prev) => ({
                            ...prev,
                            street: street || prev.street,
                            city: city || prev.city,
                            state: state || prev.state,
                            zipCode: zipCode || prev.zipCode,
                          }))

                          setMapPosition([latitude, longitude])
                          try {
                            panMapTo(latitude, longitude)
                          } catch {}
                          try {
                            await handleMapMoveEnd(latitude, longitude)
                          } catch {}
                        }}
                        style={({ pressed }) => [s.suggestItem, i === keywordAddressSuggestions.length - 1 && { borderBottomWidth: 0 }, pressed && s.pressedRow]}
                      >
                        <Text numberOfLines={1} style={s.suggestTitle}>{p.display}</Text>
                        <Text numberOfLines={1} style={s.suggestSub}>
                          {p.address?.city || p.address?.town || p.address?.village || p.address?.state || " "}
                        </Text>
                      </Pressable>
                    ))}

                    {/* Fallback: saved addresses matching the keyword */}
                    {keywordAddressSuggestions.length === 0 &&
                      addressAutocompleteSuggestions.map((addr, i) => {
                        const id = getAddressId(addr) || `${addr?.label}-${addr?.street}-${addr?.city}`
                        const title = addr?.label || "Saved address"
                        const subtitle = [
                          addr?.additionalDetails,
                          addr?.street,
                          addr?.city,
                          addr?.state,
                          addr?.zipCode,
                        ]
                          .filter(Boolean)
                          .join(", ")
                        return (
                          <Pressable
                            key={String(id)}
                            onPress={() => {
                              setAddressAutocompleteValue("")
                              handleSelectSavedAddress(addr)
                            }}
                            style={({ pressed }) => [s.suggestItem, i === addressAutocompleteSuggestions.length - 1 && { borderBottomWidth: 0 }, pressed && s.pressedRow]}
                          >
                            <Text numberOfLines={1} style={s.suggestTitle}>{title}</Text>
                            <Text numberOfLines={1} style={s.suggestSub}>{subtitle}</Text>
                          </Pressable>
                        )
                      })}
                  </View>
                )}
              </View>
              <Text style={s.hint}>
                Search by keyword to get address suggestions; selecting one will pin it on the map.
              </Text>
            </View>

            {/* Address Details */}
            <View>
              <Text style={s.label}>Address details*</Text>
              <Field
                s={s}
                t={t}
                placeholder="E.g. Floor, House no."
                value={addressFormData.additionalDetails}
                onChangeText={handleAddressFormChange("additionalDetails")}
              />
            </View>

            {/* Receiver Details */}
            <View style={{ marginBottom: sp(6) }}>
              <Text style={s.label}>Receiver details for this address</Text>
              <View style={s.receiver}>
                <Phone size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.receiverText}>
                    {userProfile?.name || "User"}, {addressFormData.phone || userProfile?.phone || "Add phone"}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.gray[400]} />
              </View>
            </View>

            {/* Save Address As */}
            <View>
              <Text style={s.label}>Save address as</Text>
              <View style={{ flexDirection: "row", gap: sp(2) }}>
                {["Home", "Work", "Other"].map((label) => {
                  const active = addressFormData.label === label
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setAddressFormData(prev => ({ ...prev, label }))}
                      style={({ pressed }) => [s.labelBtn, active ? s.labelBtnActive : s.labelBtnIdle, pressed && active && { backgroundColor: colors.green[700] }]}
                    >
                      <Text style={[s.labelBtnText, active && { color: colors.white }]}>{label}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Manual address fields (auto-filled from Google Maps, editable by user) */}
            <View style={{ gap: sp(3) }}>
              <Text style={[s.label, { marginBottom: 0 }]}>Address (Manual or Auto-fill)</Text>
              <Field s={s} t={t} placeholder="Street / Area *" value={addressFormData.street} onChangeText={handleAddressFormChange("street")} />
              <View style={{ flexDirection: "row", gap: sp(2) }}>
                <Field s={s} t={t} style={{ flex: 1 }} placeholder="City *" value={addressFormData.city} onChangeText={handleAddressFormChange("city")} />
                <Field s={s} t={t} style={{ flex: 1 }} placeholder="State *" value={addressFormData.state} onChangeText={handleAddressFormChange("state")} />
              </View>
              <Field s={s} t={t} placeholder="Pincode (optional)" value={addressFormData.zipCode || ""} onChangeText={handleAddressFormChange("zipCode")} keyboardType="number-pad" />
              <Text style={[s.hint, { marginTop: 0 }]}>
                Tip: Use map/current location for auto-detection, or type details manually.
              </Text>
            </View>
          </ScrollView>

          {/* Save Address Button */}
          <View style={[s.saveBar, { paddingBottom: sp(4) + insets.bottom }]}>
            <Pressable
              onPress={handleAddressFormSubmit}
              disabled={loadingAddress}
              style={({ pressed }) => [s.saveBtn, loadingAddress && { opacity: 0.5 }, pressed && { backgroundColor: colors.green[700] }]}
            >
              <Text style={s.saveText}>{loadingAddress ? "Loading..." : "Save address"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    )
  }

  const savedList = addresses.filter((address, index, self) => {
    // Filter out duplicate addresses with same label - keep only first occurrence
    const firstIndex = self.findIndex(addr => addr.label === address.label)
    return index === firstIndex
  })

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => onClose()}>
      <View style={s.root}>
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top }]}>
          <View style={[s.headerRow, { paddingHorizontal: sp(4), paddingVertical: sp(4) }]}>
            <Pressable onPress={() => onClose()} style={[s.iconBtn, { marginLeft: -sp(2) }]}>
              <ChevronLeft size={24} color={t.dark ? colors.gray[300] : colors.gray[700]} />
            </Pressable>
            <Text style={s.title}>Select a location</Text>
          </View>
        </View>

        {/* Scrollable Content */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: sp(6) + insets.bottom }} showsVerticalScrollIndicator={false}>
          {/* Use Current Location */}
          <Slide delay={100} style={s.actionsBox}>
            <Pressable
              onPress={handleUseCurrentLocation}
              disabled={loading}
              style={({ pressed }) => [s.actionRow, pressed && s.pressedRow]}
            >
              <View style={s.actionLeft}>
                <View style={s.greenCircle}>
                  <Crosshair size={20} color={green} strokeWidth={2.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.actionTitle}>Use current location</Text>
                  <Text style={s.actionSub}>
                    {loading ? "Getting location..." : (currentLocationText ? currentLocationText.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '') : "")}
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color={t.dark ? colors.gray[500] : colors.gray[400]} />
            </Pressable>

            {/* Add Address */}
            <Pressable
              onPress={handleAddAddress}
              style={({ pressed }) => [s.actionRow, s.actionRowBorder, pressed && s.pressedRow]}
            >
              <View style={s.actionLeft}>
                <View style={s.greenCircle}>
                  <Plus size={20} color={green} />
                </View>
                <Text style={s.actionTitle}>Add Address</Text>
              </View>
              <ChevronRight size={20} color={t.dark ? colors.gray[500] : colors.gray[400]} />
            </Pressable>
          </Slide>

          {/* Saved Addresses Section */}
          {addresses.length > 0 && (
            <Slide delay={200} style={{ marginTop: sp(2) }}>
              <View style={{ paddingHorizontal: sp(4), paddingVertical: sp(3) }}>
                <Text style={s.savedHeading}>Saved Addresses</Text>
              </View>
              <View style={s.savedBox}>
                {savedList.map((address, index) => {
                  const IconComponent = getAddressIcon(address)
                  return (
                    <Slide key={String(address.id || address._id || index)} dir="up" delay={250 + index * 50} style={{ paddingHorizontal: sp(4) }}>
                      <View style={[{ paddingVertical: sp(4) }, index !== 0 && s.savedDivider]}>
                        <Pressable
                          onPress={() => handleSelectSavedAddress(address)}
                          style={({ pressed }) => [s.savedRow, pressed && s.pressedRow]}
                        >
                          <View style={s.savedIcon}>
                            <IconComponent size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.savedTitle}>
                              {address.label || address.additionalDetails || "Home"}
                            </Text>
                            <Text style={s.savedSub}>
                              {[
                                address.additionalDetails,
                                address.street,
                                address.city,
                                address.state,
                                address.zipCode
                              ].filter(Boolean).join(", ").replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '')}
                            </Text>
                            <Text style={s.savedSub}>
                              Phone number: {address.phone || userProfile?.phone || "Not provided"}
                            </Text>
                          </View>
                        </Pressable>
                      </View>
                    </Slide>
                  )
                })}
              </View>
            </Slide>
          )}
        </ScrollView>
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(4) },
  iconBtn: { width: 36, height: 36, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  title: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  actionsBox: { paddingHorizontal: sp(4), paddingVertical: sp(2), backgroundColor: t.dark ? "#1a1a1a" : colors.white },
  actionRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: sp(4), borderRadius: radius.lg },
  actionRowBorder: { borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[100] },
  pressedRow: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: sp(4), flex: 1, paddingRight: sp(2) },
  greenCircle: { height: 40, width: 40, borderRadius: 9999, backgroundColor: t.dark ? alpha(colors.green[900], 0.2) : colors.green[50], alignItems: "center", justifyContent: "center" },
  actionTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.green[400] : colors.green[700] },
  actionSub: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500] },
  savedHeading: { ...fontSize.xs, fontWeight: "600", color: t.dark ? colors.gray[400] : colors.gray[500], letterSpacing: 0.6, textTransform: "uppercase" },
  savedBox: { backgroundColor: t.dark ? "#1a1a1a" : colors.white },
  savedDivider: { borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[100] },
  savedRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(4), borderRadius: radius.lg, padding: sp(2), margin: -sp(2) },
  savedIcon: { height: 40, width: 40, borderRadius: 9999, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], alignItems: "center", justifyContent: "center" },
  savedTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  savedSub: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500] },
  // address form
  formRoot: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white, overflow: "hidden" },
  formHeader: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100],
    paddingHorizontal: sp(4),
    paddingBottom: sp(3),
  },
  formTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  mapBox: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.dark ? colors.gray[800] : colors.gray[200] },
  mapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.dark ? alpha(colors.gray[900], 0.75) : alpha(colors.gray[100], 0.75),
    zIndex: 20,
  },
  mapOverlayText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600], textAlign: "center" },
  mapOverlaySub: { ...fontSize.xs, color: colors.gray[500], marginTop: sp(1), textAlign: "center" },
  blueDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#4285F4", borderWidth: 3, borderColor: colors.white, ...shadow.DEFAULT },
  useCurrentWrap: { position: "absolute", bottom: sp(4), left: 0, right: 0, alignItems: "center", zIndex: 10 },
  useCurrentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.green[600],
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    ...shadow.lg,
  },
  useCurrentText: { ...fontSize.sm, fontWeight: "500" },
  formScroll: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  formContent: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(48), gap: sp(4) },
  label: { ...fontSize.sm, lineHeight: 14, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700], marginBottom: sp(2) },
  input: {
    height: 36,
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    paddingHorizontal: sp(3),
    paddingVertical: sp(1),
    ...fontSize.base,
    color: t.dark ? colors.white : "#2e1f12",
    ...shadow.xs,
  },
  suggestBox: {
    marginTop: sp(2),
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    overflow: "hidden",
    ...shadow.xl,
  },
  searchingText: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[600] },
  suggestItem: { paddingHorizontal: sp(4), paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100] },
  suggestTitle: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  suggestSub: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[600] },
  hint: { marginTop: sp(2), ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[500] },
  receiver: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    borderRadius: radius.lg,
    padding: sp(3),
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3),
  },
  receiverText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.white : colors.gray[900] },
  labelBtn: { flex: 1, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: sp(4) },
  labelBtnActive: { backgroundColor: colors.green[600], ...shadow.xs },
  labelBtnIdle: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderWidth: 1, borderColor: t.dark ? alpha("#f2f0ea", 1) : "#f2f0ea", ...shadow.xs },
  labelBtnText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.white : "#2e1f12" },
  saveBar: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderTopWidth: 1,
    borderTopColor: t.dark ? colors.gray[800] : colors.gray[200],
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
  },
  saveBtn: { width: "100%", height: 48, borderRadius: radius.md, backgroundColor: colors.green[600], alignItems: "center", justifyContent: "center" },
  saveText: { ...fontSize.base, fontWeight: "600", color: colors.white },
}))
