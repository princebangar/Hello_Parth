// Web: modules/Food/components/user/PageNavbar.jsx — the Food page header (logo, location picker, wallet, cart,
// profile). Same props, logic (location text rules, one-time location fetch, business-settings logo) and look.
import React, { useState, useEffect, useRef, useMemo } from "react"
import { Pressable, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ChevronDown, ShoppingCart, Wallet } from "lucide-react-native"
import { Link, useNavigate, useLocation as useRouteLocation } from "@/lib/router"
import { AppImage, Text } from "@/native/ui"
import { alpha, colors, shadow, useTheme } from "@/theme"
import { Button } from "@food/components/ui/button"
import { useLocation } from "@food/hooks/useLocation"
import { useCart } from "@food/context/CartContext"
import { useLocationSelector } from "./UserLayout"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"
import { Avatar, AvatarFallback, AvatarImage } from "@food/components/ui/avatar"
import { useProfile } from "@food/context/ProfileContext"
import { isModuleAuthenticated } from "@food/utils/auth"

const DEFAULT_AVATAR = require("../../../../assets/public/images/profile_avatar.webp")
const debugError = (...args) => {}

export default function PageNavbar({
  textColor = "white",
  zIndex = 20,
  showProfile = false,
  showLogo = true,
  showCart = true,
  showWallet = true,
  onNavClick,
  variant = "default" // "default", "reddish", or "transparent"
}) {
  const routerLocation = useRouteLocation()
  const { userProfile } = useProfile()
  const { location, loading, requestLocation } = useLocation()
  const { getCartCount } = useCart()
  const { openLocationSelector } = useLocationSelector()
  const cartCount = getCartCount()
  const [logoUrl, setLogoUrl] = useState(null)
  const [companyName, setCompanyName] = useState(null)
  const autoLocationAttemptedRef = useRef(false)
  const requestLocationRef = useRef(requestLocation)
  const enableLocationDebugLogs = false
  const debugLog = (...args) => {
    if (enableLocationDebugLogs && globalThis.__ENV__?.DEV) {
      debugLog(...args)
    }
  }

  useEffect(() => {
    requestLocationRef.current = requestLocation
  }, [requestLocation])

  // Fallback: if permission is granted but location is still missing, fetch once.
  useEffect(() => {
    if (autoLocationAttemptedRef.current || loading || !requestLocationRef.current) return

    const hasMissingOrPlaceholderLocation =
      !location ||
      location.formattedAddress === "Select location" ||
      location.city === "Current Location"

    if (!hasMissingOrPlaceholderLocation) return

    autoLocationAttemptedRef.current = true

    let cancelled = false
    const timeoutId = setTimeout(async () => {
      try {
        let isGranted = false
        if (navigator.permissions?.query) {
          const result = await navigator.permissions.query({ name: "geolocation" })
          isGranted = result.state === "granted"
        }
        if (!isGranted) return

        const fetchedLocation = await requestLocationRef.current()
        if (cancelled) return
        if (
          fetchedLocation &&
          fetchedLocation.formattedAddress !== "Select location" &&
          fetchedLocation.city !== "Current Location"
        ) {
          debugLog("Location fetched successfully:", fetchedLocation)
        }
      } catch (err) {
        if (!cancelled) debugLog("Location fetch failed:", err)
      }
    }, 600)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [location, loading])

  // Reset one-time auto-attempt if location becomes valid, so future invalid states can retry.
  useEffect(() => {
    if (location &&
      location.formattedAddress !== "Select location" &&
      location.city !== "Current Location") {
      autoLocationAttemptedRef.current = false
    }
  }, [location])

  // Load business settings logo
  useEffect(() => {
    const loadLogo = async () => {
      try {
        // First check cache
        let cached = getCachedSettings()
        if (cached) {
          if (cached.logo?.url) {
            setLogoUrl(cached.logo.url)
          }
          if (cached.companyName) {
            setCompanyName(cached.companyName)
          }
        }

        // Always try to load fresh data to ensure we have the latest
        const settings = await loadBusinessSettings()
        if (settings) {
          if (settings.logo?.url) {
            setLogoUrl(settings.logo.url)
          }
          if (settings.companyName) {
            setCompanyName(settings.companyName)
          }
        }
      } catch (error) {
        debugError('Error loading logo:', error)
      }
    }

    // Load immediately
    loadLogo()

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      if (cached) {
        if (cached.logo?.url) {
          setLogoUrl(cached.logo.url)
        }
        if (cached.companyName) {
          setCompanyName(cached.companyName)
        }
      }
    }
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)

    return () => {
      window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
    }
  }, [])

  // Function to extract location parts for display
  // Main location: First 2 parts only (e.g., "Mama Loca, G-2")
  // Sub location: City and State (e.g., "New Palasia, Indore")
  const getLocationDisplay = (fullAddress, city, state, area) => {
    if (!fullAddress) {
      // Fallback: Use area and city/state if available
      if (area) {
        return {
          main: area,
          sub: city && state ? `${city}, ${state}` : city || state || ""
        }
      }
      if (city) {
        return {
          main: city,
          sub: state || ""
        }
      }
      return { main: "Select location", sub: "" }
    }

    // Split address by comma
    const parts = fullAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)

    // Main location: First 2 parts only (e.g., "Mama Loca, G-2")
    let mainLocation = ""
    if (parts.length >= 2) {
      mainLocation = parts.slice(0, 2).join(', ')
    } else if (parts.length >= 1) {
      mainLocation = parts[0]
    }

    // Sub location: City and State (prefer from location object, fallback to address parts)
    let subLocation = ""
    if (city && state) {
      subLocation = `${city}, ${state}`
    } else if (city) {
      subLocation = city
    } else if (state) {
      subLocation = state
    }

    return {
      main: mainLocation || "Select location",
      sub: subLocation
    }
  }

  // Get display location parts
  // Priority: formattedAddress (complete) > address > area/city
  // IMPORTANT: Sub location ALWAYS uses city and state from location object, never from address parts
  const locationDisplay = useMemo(() => {
    let mainLocation = ""
    let subLocation = ""

    // Debug: Log the entire location object
    debugLog("?? PageNavbar - Full Location Object:", {
      location,
      address: location?.address,
      formattedAddress: location?.formattedAddress,
      area: location?.area,
      city: location?.city,
      state: location?.state
    })

    // Get main location - prioritize area name over coordinates
    // Check if address/formattedAddress contains coordinates pattern (e.g., "22.7282, 75.8843")
    const isCoordinates = (str) => {
      if (!str) return false
      // Pattern: number.number, number.number (latitude, longitude)
      const coordPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/
      return coordPattern.test(str.trim())
    }

    // Priority 0: Use mainTitle (HELLO PARTH-STYLE) - Exact building/cafe name
    // This is the most accurate - directly from Google Maps components
    // If mainTitle is available, show it with area if area is different
    if (location?.mainTitle && location.mainTitle.trim() !== "" && location.mainTitle !== "Location Found") {
      mainLocation = location.mainTitle;
      // If area is available and different from mainTitle, append it
      if (location?.area && location.area.trim() !== "" &&
        location.area.toLowerCase() !== location.mainTitle.toLowerCase() &&
        location.area.toLowerCase() !== location?.city?.toLowerCase()) {
        mainLocation = `${location.mainTitle}, ${location.area}`;
      }
      debugLog("??? HELLO PARTH-STYLE: Using mainTitle for display:", mainLocation);
    }

    // Priority 1: Use formattedAddress if it contains complete detailed address (has multiple parts)
    // Format: "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia, Indore, Madhya Pradesh 452001"
    if (!mainLocation && location?.formattedAddress && !isCoordinates(location.formattedAddress) && location.formattedAddress !== "Select location") {
      const formattedParts = location.formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)

      // Check if formattedAddress has complete address (4+ parts means it has POI, building, area, city, state)
      if (formattedParts.length >= 4) {
        debugLog("?? Using formattedAddress (complete address detected):", location.formattedAddress)

        // Extract locality parts (everything before city)
        // Find city index
        let cityIndex = -1
        if (location?.city) {
          cityIndex = formattedParts.findIndex(part =>
            part.toLowerCase() === location.city.toLowerCase() ||
            part.toLowerCase().includes(location.city.toLowerCase())
          )
        }

        // If city not found, look for state (city is usually before state)
        if (cityIndex === -1 && location?.state) {
          const stateIndex = formattedParts.findIndex(part =>
            part.toLowerCase().includes("madhya") ||
            part.toLowerCase().includes("pradesh") ||
            part.toLowerCase().includes(location.state.toLowerCase())
          )
          if (stateIndex > 0) {
            cityIndex = stateIndex - 1
          }
        }

        // Extract locality parts (POI, building, floor, area) - everything before city
        if (cityIndex > 0) {
          const localityParts = formattedParts.slice(0, cityIndex)
          if (localityParts.length > 0) {
            mainLocation = localityParts.join(', ')
            debugLog("??? Extracted locality from complete formattedAddress:", mainLocation)
          }
        } else {
          // If city not found, take first 3-4 parts (usually POI, building, floor, area)
          const localityParts = formattedParts.slice(0, Math.min(4, formattedParts.length - 2))
          if (localityParts.length > 0) {
            mainLocation = localityParts.join(', ')
            debugLog("??? Using first parts from formattedAddress:", mainLocation)
          }
        }
      }
    }

    // Priority 2: Use address field (it has the extracted locality from Google Maps)
    // This is more reliable as it's already processed by useLocation hook
    // Address field contains: "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia"
    if (!mainLocation && location?.address && !isCoordinates(location.address) && location.address !== "Select location") {
      debugLog("?? Processing address field (Priority 2):", location.address)

      // Check if address already contains locality (not just city)
      const addressParts = location.address.split(',').map(p => p.trim()).filter(p => p.length > 0)
      const cityInAddress = addressParts.some(part =>
        part.toLowerCase() === location?.city?.toLowerCase() ||
        part.toLowerCase() === "indore" ||
        part.toLowerCase() === "bhopal"
      )

      // If address doesn't contain city name, it's likely the locality
      if (!cityInAddress && addressParts.length > 0) {
        mainLocation = location.address
        debugLog("? Using address field as locality:", mainLocation)
      } else {
        // Address contains city, extract locality parts before city
        const filteredParts = addressParts.filter(part => {
          if (/^\d{6}$/.test(part)) return false
          if (part.toLowerCase() === "india" || part.length > 25) return false
          return true
        })

        let cityIndex = filteredParts.findIndex(part =>
          part.toLowerCase() === location?.city?.toLowerCase() ||
          part.toLowerCase() === "indore" ||
          part.toLowerCase() === "bhopal"
        )

        if (cityIndex > 0) {
          mainLocation = filteredParts.slice(0, cityIndex).join(', ')
          debugLog("? Extracted locality from address field:", mainLocation)
        } else if (filteredParts.length >= 3) {
          mainLocation = filteredParts.slice(0, 3).join(', ')
          debugLog("? Using first 3 parts from address:", mainLocation)
        }
      }
    }

    // Priority 2: Use formattedAddress to extract exact locality (e.g., "Princess center, 5th Floor, New Palasia")
    if (!mainLocation && location?.formattedAddress &&
      !isCoordinates(location.formattedAddress) &&
      location.formattedAddress !== "Select location") {
      debugLog("?? Processing formattedAddress (Priority 2):", location.formattedAddress)
      const parts = location.formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)
      debugLog("?? Address parts:", parts)

      // Remove pincode and country from parts (they're usually at the end)
      const filteredParts = parts.filter(part => {
        // Skip 6-digit pincode (standalone or with state)
        if (/^\d{6}$/.test(part)) return false
        // Skip parts that are just pincode (e.g., "Madhya Pradesh 452001" - we'll handle this)
        if (/^\d{6}$/.test(part.split(' ').pop())) {
          // Remove pincode from part (e.g., "Madhya Pradesh 452001" -> "Madhya Pradesh")
          return part.replace(/\s+\d{6}$/, '').trim()
        }
        // Skip "India" or country names
        if (part.toLowerCase() === "india" || part.length > 25) return false
        return true
      })
      debugLog("?? Filtered parts (without pincode/country):", filteredParts)

      // Extract locality parts (building, floor, area) - usually first 3 parts before city
      // Format: "Princess center, 5th Floor, New Palasia, Indore, Madhya Pradesh 452001"
      // We want: "Princess center, 5th Floor, New Palasia"

      // Find city index - check multiple ways
      let cityIndex = -1

      // Method 1: Check exact match with location.city
      if (location?.city) {
        cityIndex = filteredParts.findIndex(part =>
          part.toLowerCase() === location.city.toLowerCase()
        )
        debugLog(`?? City index (exact match with "${location.city}"):`, cityIndex)
      }

      // Method 2: Check common city names (case-insensitive)
      if (cityIndex === -1) {
        const commonCities = ["Indore", "indore", "Bhopal", "bhopal", "Mumbai", "mumbai", "Delhi", "delhi"]
        cityIndex = filteredParts.findIndex(part =>
          commonCities.some(city => part.toLowerCase() === city.toLowerCase())
        )
        debugLog("?? City index (common cities):", cityIndex)
      }

      // Method 3: Check if part contains state name (usually comes after city)
      if (cityIndex === -1 && location?.state) {
        const stateIndex = filteredParts.findIndex(part =>
          part.toLowerCase().includes(location.state.toLowerCase()) ||
          part.toLowerCase().includes("madhya") ||
          part.toLowerCase().includes("pradesh")
        )
        if (stateIndex > 0) {
          // City is usually one position before state
          cityIndex = stateIndex - 1
          debugLog("?? City index (before state):", cityIndex)
        }
      }

      // Method 4: Check for "Madhya Pradesh" or other state names
      if (cityIndex === -1) {
        const stateIndex = filteredParts.findIndex(part =>
          part.toLowerCase().includes("madhya") ||
          part.toLowerCase().includes("pradesh") ||
          part.toLowerCase().includes("maharashtra") ||
          part.toLowerCase().includes("gujarat")
        )
        if (stateIndex > 0) {
          cityIndex = stateIndex - 1
          debugLog("?? City index (before state name):", cityIndex)
        }
      }

      if (cityIndex > 0) {
        // Take all parts before city (building, floor, area)
        const localityParts = filteredParts.slice(0, cityIndex)
        if (localityParts.length > 0) {
          mainLocation = localityParts.join(', ')
          debugLog("??? Using exact locality from formattedAddress:", mainLocation)
        } else {
          debugLog("No locality parts found before city")
        }
      } else {
        // City not found, try to find state and take parts before it
        const stateIndex = filteredParts.findIndex(part =>
          part.toLowerCase().includes("madhya") ||
          part.toLowerCase().includes("pradesh") ||
          (location?.state && part.toLowerCase().includes(location.state.toLowerCase()))
        )

        if (stateIndex > 0) {
          // Take first 3 parts before state (usually building, floor, area)
          const localityParts = filteredParts.slice(0, Math.min(3, stateIndex))
          if (localityParts.length > 0) {
            mainLocation = localityParts.join(', ')
            debugLog("??? Using parts before state from formattedAddress:", mainLocation)
          }
        }

        // If still no mainLocation, use first 3 parts as fallback
        if (!mainLocation && filteredParts.length >= 3) {
          mainLocation = filteredParts.slice(0, 3).join(', ')
          debugLog("??? Using first 3 parts from formattedAddress (fallback):", mainLocation)
        } else if (!mainLocation && filteredParts.length >= 2) {
          mainLocation = filteredParts.slice(0, 2).join(', ')
          debugLog("? Using first 2 parts from formattedAddress (fallback):", mainLocation)
        } else if (!mainLocation && filteredParts.length >= 1) {
          const firstPart = filteredParts[0]
          if (!isCoordinates(firstPart) && firstPart.length > 2) {
            mainLocation = firstPart
            debugLog("? Using first part from formattedAddress (fallback):", mainLocation)
          }
        }
      }

      if (!mainLocation) {
        debugLog("Could not extract locality from formattedAddress")
      } else {
        debugLog("?????? Final mainLocation extracted:", mainLocation)
      }
    }
    // Priority 2: Use address field if formattedAddress not available or didn't work
    if (!mainLocation &&
      location?.address &&
      !isCoordinates(location.address) &&
      location.address !== "Select location") {
      debugLog("?? Processing address field:", location.address)
      const parts = location.address.split(',').map(part => part.trim()).filter(part => part.length > 0)
      debugLog("?? Address parts:", parts)

      // Remove pincode, country, and placeholder values
      const filteredParts = parts.filter(part => {
        if (/^\d{6}$/.test(part)) return false
        if (part.toLowerCase() === "india" || part.length > 25) return false
        if (part.toLowerCase() === "select location" || part.toLowerCase() === "current location") return false
        return true
      })
      debugLog("?? Filtered parts:", filteredParts)

      // If filtered parts is empty or only has placeholder, skip this priority
      if (filteredParts.length === 0 ||
        (filteredParts.length === 1 &&
          (filteredParts[0].toLowerCase() === "select location" ||
            filteredParts[0].toLowerCase() === "current location"))) {
        debugLog("?? Address field only contains placeholder, skipping")
        // Don't set mainLocation, continue to next priority
      } else {

        // Find city index - same logic as formattedAddress
        let cityIndex = -1

        if (location?.city) {
          cityIndex = filteredParts.findIndex(part =>
            part.toLowerCase() === location.city.toLowerCase()
          )
        }

        if (cityIndex === -1) {
          const commonCities = ["Indore", "indore", "Bhopal", "bhopal"]
          cityIndex = filteredParts.findIndex(part =>
            commonCities.some(city => part.toLowerCase().includes(city.toLowerCase()))
          )
        }

        if (cityIndex === -1 && location?.state) {
          const stateIndex = filteredParts.findIndex(part =>
            part.toLowerCase().includes(location.state.toLowerCase())
          )
          if (stateIndex > 0) {
            cityIndex = stateIndex - 1
          }
        }

        if (cityIndex > 0) {
          const localityParts = filteredParts.slice(0, cityIndex)
          if (localityParts.length > 0) {
            mainLocation = localityParts.join(', ')
            debugLog("? Using exact locality from address:", mainLocation)
          }
        } else if (filteredParts.length >= 3) {
          mainLocation = filteredParts.slice(0, 3).join(', ')
          debugLog("? Using first 3 parts from address:", mainLocation)
        } else if (filteredParts.length >= 2) {
          mainLocation = filteredParts.slice(0, 2).join(', ')
          debugLog("? Using first 2 parts from address:", mainLocation)
        } else if (filteredParts.length >= 1) {
          const firstPart = filteredParts[0]
          if (!isCoordinates(firstPart) &&
            firstPart.length > 2 &&
            firstPart.toLowerCase() !== "select location" &&
            firstPart.toLowerCase() !== "current location") {
            mainLocation = firstPart
            debugLog("? Using first part from address:", mainLocation)
          }
        }
      }
    }
    // Priority 3: Try to extract from formattedAddress or address again with simpler logic
    if (!mainLocation) {
      // Try to get first 3 parts from any available address field
      const addressToUse = location?.formattedAddress || location?.address || ""
      if (addressToUse &&
        !isCoordinates(addressToUse) &&
        addressToUse !== "Select location" &&
        addressToUse.trim() !== "") {
        const parts = addressToUse.split(',').map(part => part.trim()).filter(part => part.length > 0)
        const filteredParts = parts.filter(part => {
          if (/^\d{6}$/.test(part)) return false // Skip pincode
          if (part.toLowerCase() === "india" || part.length > 25) return false // Skip country
          return true
        })

        // If we have 3+ parts, take first 3 (usually building, floor, area)
        if (filteredParts.length >= 3) {
          mainLocation = filteredParts.slice(0, 3).join(', ')
          debugLog("? Using first 3 parts as fallback:", mainLocation)
        } else if (filteredParts.length >= 2) {
          mainLocation = filteredParts.slice(0, 2).join(', ')
          debugLog("? Using first 2 parts as fallback:", mainLocation)
        } else if (filteredParts.length >= 1) {
          const firstPart = filteredParts[0]
          if (!isCoordinates(firstPart) && firstPart.length > 2) {
            mainLocation = firstPart
            debugLog("? Using first part as fallback:", mainLocation)
          }
        }
      }
    }

    // Priority 4: Force extract from formattedAddress if still no mainLocation
    // This is a last resort to get locality before falling back to city
    if (!mainLocation &&
      location?.formattedAddress &&
      !isCoordinates(location.formattedAddress) &&
      location.formattedAddress !== "Select location") {
      debugLog("?????? FORCE EXTRACTING from formattedAddress (last resort):", location.formattedAddress)
      const parts = location.formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)
      const filteredParts = parts.filter(part => {
        if (/^\d{6}$/.test(part)) return false
        if (part.toLowerCase() === "india" || part.length > 25) return false
        return true
      })

      // Force take first 3 parts (building, floor, area) - ignore city detection
      if (filteredParts.length >= 3) {
        // Check if 3rd part is city, if yes take first 2
        const thirdPart = filteredParts[2].toLowerCase()
        if (thirdPart === "indore" || thirdPart === location?.city?.toLowerCase()) {
          mainLocation = filteredParts.slice(0, 2).join(', ')
          debugLog("??? FORCE: Using first 2 parts (3rd is city):", mainLocation)
        } else {
          mainLocation = filteredParts.slice(0, 3).join(', ')
          debugLog("??? FORCE: Using first 3 parts:", mainLocation)
        }
      } else if (filteredParts.length >= 2) {
        mainLocation = filteredParts.slice(0, 2).join(', ')
        debugLog("??? FORCE: Using first 2 parts:", mainLocation)
      } else if (filteredParts.length >= 1) {
        const firstPart = filteredParts[0]
        if (!isCoordinates(firstPart) && firstPart.length > 2 && firstPart.toLowerCase() !== location?.city?.toLowerCase()) {
          mainLocation = firstPart
          debugLog("??? FORCE: Using first part:", mainLocation)
        }
      }
    }

    // Priority 5: Use area name if address extraction failed (fallback)
    // Show area + city format if both available, otherwise just area
    if (!mainLocation && location?.area && location.area.trim() !== "" && !isCoordinates(location.area)) {
      // If we have both area and city, show "Area, City" format
      if (location?.city && location.city.trim() !== "" && location.city !== "Unknown City" &&
        location.area.toLowerCase() !== location.city.toLowerCase()) {
        mainLocation = `${location.area}, ${location.city}`
        debugLog("? Using area + city:", mainLocation)
      } else {
        mainLocation = location.area
        debugLog("? Using area name:", mainLocation)
      }
    }
    // Priority 6: Use city ONLY if nothing else worked (last resort)
    // Skip if city is "Current Location" or "Select location" - these are placeholders
    else if (!mainLocation && location?.city &&
      location.city.trim() !== "" &&
      location.city !== "Unknown City" &&
      location.city !== "Current Location" &&
      location.city !== "Select location") {
      mainLocation = location.city
      debugLog("?????? FALLBACK: Using city (no locality found):", mainLocation)
    }
    // Final fallback: Show "Select location" instead of coordinates
    else if (!mainLocation) {
      mainLocation = "Select location"
      debugLog("?? No valid location found, showing placeholder")
    }

    // If mainLocation is still coordinates, replace with area or city
    if (isCoordinates(mainLocation)) {
      if (location?.area && location.area.trim() !== "") {
        mainLocation = location.area
      } else if (location?.city && location.city.trim() !== "" && location.city !== "Unknown City") {
        mainLocation = location.city
      } else {
        mainLocation = "Select location"
      }
      debugLog("?? Replaced coordinates with:", mainLocation)
    }

    // Final check: If mainLocation is just city name, try one more time to extract from formattedAddress
    if (mainLocation && (mainLocation.toLowerCase() === location?.city?.toLowerCase() || mainLocation === "Indore")) {
      debugLog("?????? MainLocation is city, trying to extract locality one more time...")

      // First priority: Check if area is available in location object
      if (location?.area && location.area.trim() !== "" &&
        location.area.toLowerCase() !== location?.city?.toLowerCase() &&
        !isCoordinates(location.area)) {
        mainLocation = `${location.area}, ${location.city}`
        debugLog("??? Using area from location object:", mainLocation)
      } else if (location?.formattedAddress && !isCoordinates(location.formattedAddress)) {
        // Second priority: Extract area from formattedAddress (before city)
        const parts = location.formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)
        debugLog("?? Extracting area from formattedAddress parts:", parts)

        // Find city index
        let cityIndex = -1
        if (location?.city) {
          cityIndex = parts.findIndex(part =>
            part.toLowerCase() === location.city.toLowerCase() ||
            part.toLowerCase().includes(location.city.toLowerCase())
          )
        }

        // If city found, take parts before city as area
        if (cityIndex > 0) {
          const areaParts = parts.slice(0, cityIndex)
          if (areaParts.length > 0) {
            // Take the last part before city as area (usually sublocality like "New Palasia")
            const extractedArea = areaParts[areaParts.length - 1]
            if (extractedArea && extractedArea.toLowerCase() !== location.city.toLowerCase() &&
              !extractedArea.match(/^\d+/) && extractedArea.length > 2 &&
              !extractedArea.toLowerCase().includes("madhya") &&
              !extractedArea.toLowerCase().includes("pradesh")) {
              mainLocation = `${extractedArea}, ${location.city}`
              debugLog("??? Extracted area from formattedAddress (before city):", mainLocation)
            } else if (areaParts.length >= 2) {
              // Take last 2 parts before city
              const lastTwoParts = areaParts.slice(-2)
              if (lastTwoParts.every(p => p.toLowerCase() !== location.city.toLowerCase())) {
                mainLocation = lastTwoParts.join(', ')
                debugLog("??? Extracted area (2 parts) from formattedAddress:", mainLocation)
              }
            }
          }
        } else {
          // City not found, filter out city/state and take first parts
          const filteredParts = parts.filter(part => {
            if (/^\d{6}$/.test(part)) return false
            if (part.toLowerCase() === "india" || part.length > 25) return false
            if (part.toLowerCase() === "indore" || part.toLowerCase() === location?.city?.toLowerCase()) return false
            if (part.toLowerCase().includes("madhya") || part.toLowerCase().includes("pradesh")) return false
            return true
          })

          if (filteredParts.length >= 1) {
            const extractedArea = filteredParts[0]
            if (extractedArea && extractedArea.toLowerCase() !== location.city.toLowerCase() &&
              extractedArea.length > 2 && !extractedArea.match(/^\d+/)) {
              mainLocation = `${extractedArea}, ${location.city}`
              debugLog("??? Extracted area (first part) from formattedAddress:", mainLocation)
            }
          }
        }
      }
    }

    // Final check: If mainLocation is still just city, try to add area if available
    if (mainLocation && mainLocation.toLowerCase() === location?.city?.toLowerCase()) {
      // First try location.area field
      if (location?.area && location.area.trim() !== "" &&
        location.area.toLowerCase() !== location.city.toLowerCase() &&
        !isCoordinates(location.area)) {
        mainLocation = `${location.area}, ${location.city}`
        debugLog("??? Added area to city display:", mainLocation)
      }
      // If area field is empty, try to extract from formattedAddress one more time
      else if (location?.formattedAddress && !isCoordinates(location.formattedAddress)) {
        const parts = location.formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)
        // Look for parts that might be sublocality (usually 2nd or 3rd part before city)
        if (parts.length >= 3) {
          // Try second-to-last part before city/state
          for (let i = parts.length - 3; i >= 0; i--) {
            const part = parts[i]
            if (part && part.toLowerCase() !== location.city.toLowerCase() &&
              !part.match(/^\d+/) && part.length > 2 &&
              !part.toLowerCase().includes("madhya") &&
              !part.toLowerCase().includes("pradesh") &&
              part.toLowerCase() !== "india") {
              mainLocation = `${part}, ${location.city}`
              debugLog("??? Last resort: Extracted area from formattedAddress:", mainLocation)
              break
            }
          }
        }
      }
    }

    // Sub location: ALWAYS use city and state from location object ONLY (never from address parts)
    // Check if city and state exist in location object
    const hasCity = location?.city && location.city.trim() !== "" && location.city !== "Unknown City"
    const hasState = location?.state && location.state.trim() !== ""

    if (hasCity && hasState) {
      subLocation = `${location.city}, ${location.state}`
    } else if (hasCity) {
      subLocation = location.city
    } else if (hasState) {
      subLocation = location.state
    } else {
      // If city/state not available in location object, try to extract from formattedAddress
      // This is a fallback - formattedAddress format: "Mama Loca, G-2, Princess Center 6/3, Opposite Manpasand Garden, New Palasia, Indore, 452001, India"
      if (location?.formattedAddress) {
        const parts = location.formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)

        debugLog("?? Extracting city/state from formattedAddress:", {
          formattedAddress: location.formattedAddress,
          parts: parts,
          partsLength: parts.length
        })

        // For Indian addresses: city and state are usually before pincode (which is a 6-digit number)
        // Format: "Mama Loca, G-2, Princess Center 6/3, Opposite Manpasand Garden, New Palasia, Indore, 452001, India"
        if (parts.length >= 4) {
          // Method 1: Find pincode index (6-digit number)
          const pincodeIndex = parts.findIndex(part => /^\d{6}$/.test(part))

          debugLog("?? Pincode index:", pincodeIndex)

          if (pincodeIndex > 1 && pincodeIndex !== -1) {
            // City is 2 positions before pincode, State is 1 position before pincode
            const cityPart = parts[pincodeIndex - 2]
            const statePart = parts[pincodeIndex - 1]

            debugLog("?? Extracted from pincode position:", { cityPart, statePart, pincodeIndex })

            // Validate: both should be non-empty and not numbers
            if (cityPart && statePart &&
              !cityPart.match(/^\d+$/) &&
              !statePart.match(/^\d+$/) &&
              cityPart.length > 2 &&
              statePart.length > 2) {
              subLocation = `${cityPart}, ${statePart}`
              debugLog("? Using extracted city/state (pincode method):", subLocation)
            }
          }

          // Method 2: If pincode not found or extraction failed, try alternative method
          if (!subLocation && parts.length >= 4) {
            // Last part is usually "India", second last might be pincode
            const lastPart = parts[parts.length - 1]
            const secondLastPart = parts[parts.length - 2]

            debugLog("?? Trying India method:", { lastPart, secondLastPart })

            // If last part is "India" and second last is pincode (6-digit)
            if (lastPart === "India" && /^\d{6}$/.test(secondLastPart)) {
              // City and state are 3 and 4 positions before "India"
              // Format: "..., New Palasia, Indore, 452001, India"
              // parts[length-1] = "India"
              // parts[length-2] = "452001" (pincode)
              // parts[length-3] = "Indore" (state)
              // parts[length-4] = "New Palasia" (city)
              const cityPart = parts[parts.length - 4]
              const statePart = parts[parts.length - 3]

              debugLog("?? Extracted from India position:", { cityPart, statePart })

              if (cityPart && statePart &&
                !cityPart.match(/^\d+$/) &&
                !statePart.match(/^\d+$/) &&
                cityPart.length > 2 &&
                statePart.length > 2) {
                subLocation = `${cityPart}, ${statePart}`
                debugLog("? Using extracted city/state (India method):", subLocation)
              }
            }
          }

          // Method 3: Direct extraction - if we have 8 parts, city and state are at index 4 and 5
          // Format: "Mama Loca, G-2, Princess Center 6/3, Opposite Manpasand Garden, New Palasia, Indore, 452001, India"
          // parts[4] = "New Palasia" (city), parts[5] = "Indore" (state)
          if (!subLocation && parts.length >= 6) {
            // If we have pincode at index 6, city and state are at 4 and 5
            const pincodeIndex = parts.findIndex(part => /^\d{6}$/.test(part))
            if (pincodeIndex === 6 && parts.length >= 7) {
              const cityPart = parts[4]
              const statePart = parts[5]

              debugLog("?? Direct extraction (index method):", { cityPart, statePart, pincodeIndex })

              if (cityPart && statePart &&
                !cityPart.match(/^\d+$/) &&
                !statePart.match(/^\d+$/) &&
                cityPart.length > 2 &&
                statePart.length > 2) {
                subLocation = `${cityPart}, ${statePart}`
                debugLog("? Using extracted city/state (direct index method):", subLocation)
              }
            }
          }

          // Method 4: Simple fallback - if we have 6+ parts, always try parts[4] and parts[5]
          // This is the most reliable method for the given address format
          // Format: "Mama Loca, G-2, Princess Center 6/3, Opposite Manpasand Garden, New Palasia, Indore, 452001, India"
          // parts[0] = "Mama Loca", parts[1] = "G-2", parts[2] = "Princess Center 6/3", parts[3] = "Opposite Manpasand Garden"
          // parts[4] = "New Palasia" (city), parts[5] = "Indore" (state)
          if (!subLocation && parts.length >= 6) {
            // Directly use parts[4] and parts[5] - these are ALWAYS city and state for this format
            const cityPart = parts[4]
            const statePart = parts[5]

            debugLog("?? Simple fallback (parts[4] and parts[5]):", {
              cityPart,
              statePart,
              partsLength: parts.length,
              allParts: parts
            })

            // Less strict validation - just check they're not numbers and not empty
            if (cityPart && statePart &&
              !cityPart.match(/^\d+$/) &&
              !statePart.match(/^\d+$/) &&
              cityPart.length > 1 &&
              statePart.length > 1) {
              subLocation = `${cityPart}, ${statePart}`
              debugLog("? Using extracted city/state (simple fallback):", subLocation)
            } else {
              debugLog("?? Validation failed for parts[4] and parts[5]:", { cityPart, statePart })
            }
          }
        }
      }

      // Also try from address field if formattedAddress didn't work
      if (!subLocation && location?.address && location.address !== location?.formattedAddress) {
        const parts = location.address.split(',').map(part => part.trim()).filter(part => part.length > 0)
        debugLog("?? Trying address field:", { address: location.address, parts })

        if (parts.length >= 4) {
          const pincodeIndex = parts.findIndex(part => /^\d{6}$/.test(part))
          if (pincodeIndex > 1 && pincodeIndex !== -1) {
            const cityPart = parts[pincodeIndex - 2]
            const statePart = parts[pincodeIndex - 1]
            if (cityPart && statePart &&
              !cityPart.match(/^\d+$/) &&
              !statePart.match(/^\d+$/) &&
              cityPart.length > 2 &&
              statePart.length > 2) {
              subLocation = `${cityPart}, ${statePart}`
              debugLog("? Using extracted city/state from address field:", subLocation)
            }
          }
        }
      }

      // If still empty, leave it empty
      if (!subLocation) {
        subLocation = ""
        debugLog("?? Could not extract city/state from address")
      }
    }

    // Debug log
    debugLog("?? PageNavbar Location Display:", {
      location: location,
      city: location?.city,
      state: location?.state,
      hasCity,
      hasState,
      mainLocation,
      subLocation,
      formattedAddress: location?.formattedAddress,
      address: location?.address,
      finalSubLocation: subLocation || "EMPTY"
    })

    // CRITICAL: Ensure subLocation is NEVER from address parts[1] and parts[2]
    // If subLocation looks like "G-2, Princess Center 6/3", it's wrong - force extraction
    if (subLocation && (subLocation.includes("G-2") || subLocation.includes("Princess Center"))) {
      debugLog("WRONG subLocation detected:", subLocation)
      debugLog("Forcing re-extraction from formattedAddress")

      // Force re-extraction
      if (location?.formattedAddress) {
        const parts = location.formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)
        if (parts.length >= 6) {
          const cityPart = parts[4]
          const statePart = parts[5]
          if (cityPart && statePart &&
            !cityPart.match(/^\d+$/) &&
            !statePart.match(/^\d+$/) &&
            cityPart.length > 1 &&
            statePart.length > 1) {
            subLocation = `${cityPart}, ${statePart}`
            debugLog("??? FORCED extraction - New subLocation:", subLocation)
          }
        }
      }
    }

    const areaDisplay = location?.area && location.area.trim() ? location.area.trim() : "Select Location"
    const cityDisplay = location?.city || "Indore"
    const fullAddressDisplay = location?.address || location?.formattedAddress || ""
    
    return {
      area: areaDisplay,
      city: cityDisplay,
      address: fullAddressDisplay
    }
  }, [location])

  const { area: areaName, city: cityName, address: fullAddress } = locationDisplay
  const savedAddressLabel = useMemo(() => {
    if (location?.label && String(location.label).trim()) {
      return String(location.label).trim()
    }
    try {
      const stored = localStorage.getItem("userLocation")
      if (!stored) return ""
      const parsed = JSON.parse(stored)
      return parsed?.label && String(parsed.label).trim() ? String(parsed.label).trim() : ""
    } catch {
      return ""
    }
  }, [location?.label])

  const displayArea = useMemo(() => {
    let name = areaName || "Select Location"
    if (/^-?\d+(\.\d+)?$/.test(name.trim())) {
      return "Current Location"
    }
    const isPlusCode = /^[a-z0-9]{2,8}\+[a-z0-9]{0,3}/i.test(name.trim());
    if (isPlusCode) {
      return cityName || "Select Location"
    }
    return name
  }, [areaName, cityName])

  const displayAddress = useMemo(() => {
    if (savedAddressLabel) return `Delivering to ${savedAddressLabel}`
    
    const city = location?.city || "";
    const state = location?.state || "";
    const pincode = location?.pincode || "";

    const parts = [];
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (pincode) parts.push(pincode);
    if (parts.length > 0) return parts.join(', ');
    
    let addr = fullAddress || ""
    if (cityName) {
      addr = addr.replace(new RegExp(`,?\\s*${cityName}\\s*`, 'gi'), '').trim()
    }
    if (areaName && areaName.length > 3) {
      addr = addr.replace(new RegExp(`^${areaName},?\\s*`, 'i'), '').trim()
    }
    if (/^-?\d+\.\d+,\s*-?\\s*\d+\.\d+$/.test(fullAddress.trim()) || /^-?\d+\.\d+,\s*-?\\s*\d+\.\d+$/.test(addr.trim()) || !addr || addr === ",") {
      return "Pinpoint location"
    }
    return addr
  }, [fullAddress, cityName, areaName, savedAddressLabel, location])
  const displayCity = ""

  const handleLocationClick = () => {
    // Open location selector overlay
    openLocationSelector()
  }

  const isReddish = variant === "reddish"
  const isTransparent = variant === "transparent"
  const finalTextColorClass = (isReddish || isTransparent) ? "text-[#1a1a1a]" : (textColor === "white" ? "text-white" : "text-[#DC2626]")
  const finalIconColor = (isReddish || isTransparent) ? "text-[#1a1a1a]" : (textColor === "white" ? "text-white" : "text-[#DC2626]")
  
  const initials = useMemo(() => {
    if (!userProfile) return ""
    const name = userProfile.firstName || userProfile.name || ""
    return name[0]?.toUpperCase() || "U"
  }, [userProfile])

  const zIndexClass = zIndex === 50 ? "z-50" : "z-20"

  const t = useTheme()
  const navigate = useNavigate()
  const textColorValue = (isReddish || isTransparent) ? "#1a1a1a" : (textColor === "white" ? "#ffffff" : "#DC2626")
  const iconColorValue = textColorValue
  const [logoAspect, setLogoAspect] = useState(1)
  const leftAligned = isReddish || isTransparent

  // Links that need a login first: guests get the login popup (web: e.preventDefault() + show-login-required).
  const openIfSignedIn = (to) => {
    if (!isModuleAuthenticated("user")) {
      window.dispatchEvent(new CustomEvent("show-login-required"))
      return
    }
    navigate(to, { state: { from: routerLocation.pathname } })
  }

  // h-9 w-auto object-contain scale-[1.6] origin-left
  const logoImage = (src, onError) => (
    <AppImage
      src={src}
      contentFit="contain"
      onLoad={(e) => {
        const w = e?.source?.width
        const h = e?.source?.height
        if (w && h) setLogoAspect(w / h)
      }}
      onError={onError}
      style={{ height: 36, width: 36 * logoAspect, transform: [{ translateX: (36 * logoAspect * 0.6) / 2 }, { scale: 1.6 }] }}
    />
  )

  const navStyle = [
    { position: "relative", zIndex: zIndex === 50 ? 50 : 20, width: "100%", paddingHorizontal: 12, paddingVertical: 2 },
    isReddish && { borderBottomWidth: 1, borderBottomColor: colors.gray[100], ...shadow.sm },
  ]

  const badgeBorder = t.dark ? "#1a1a1a" : "#ffffff"

  const nav = (
    <>
      {isReddish ? (
        <LinearGradient
          colors={["#ffffff", "#f8fafc", "#ffffff"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {/* Left: Company Logo */}
        {showLogo && (
          <Link to="/food/user" style={{ flexShrink: 0, marginRight: 12 }}>
            {logoUrl ? (
              logoImage(logoUrl, () => setLogoUrl(null))
            ) : companyName ? (
              <Text style={{ fontSize: 18, lineHeight: 28, fontWeight: "700", color: textColorValue }}>{companyName}</Text>
            ) : (
              logoImage(DEFAULT_BRAND_LOGO)
            )}
          </Link>
        )}

        {/* Center/Left: Location Selector */}
        <View
          pointerEvents="box-none"
          style={[
            { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
            leftAligned ? { justifyContent: "flex-start" } : { justifyContent: "center", position: "absolute", left: 0, right: 0 },
          ]}
        >
          <Button
            variant="ghost"
            onPress={handleLocationClick}
            disabled={loading}
            style={({ pressed }) => [
              { height: "auto", paddingHorizontal: 0, paddingVertical: 0, flexShrink: 0, backgroundColor: "transparent" },
              leftAligned && { flexDirection: "row", alignItems: "center", gap: 6 },
              pressed && { backgroundColor: "transparent" },
            ]}
          >
            {loading ? (
              <Text style={{ fontSize: 14, fontWeight: "700", color: textColorValue }}>Loading...</Text>
            ) : (
              <View style={{ flexDirection: "column", alignItems: leftAligned ? "flex-start" : "center", minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 4 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 15, fontWeight: "900", color: textColorValue, maxWidth: 140 }}>
                    {displayArea}
                  </Text>
                  <ChevronDown size={14} strokeWidth={3.5} color={iconColorValue} />
                </View>
                {(displayAddress || displayCity) && (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 10,
                      lineHeight: 12.5,
                      fontWeight: "700",
                      color: colors.gray[500],
                      maxWidth: 140,
                      textAlign: leftAligned ? "left" : "center",
                      marginTop: 2,
                    }}
                  >
                    {displayAddress}
                    {displayAddress && displayCity ? ", " : ""}
                    {displayCity}
                  </Text>
                )}
              </View>
            )}
          </Button>
        </View>

        {/* Right: Actions (Wallet & Cart) */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
          {showWallet && (
            <Pressable
              accessibilityLabel="My Wallet"
              onPress={() => openIfSignedIn("/food/user/wallet")}
              style={({ pressed }) => [{ height: 32, width: 32, borderRadius: 9999 }, pressed && { opacity: 0.8 }]}
            >
              {isTransparent ? (
                <LinearGradient
                  colors={["#FF4D4D", "#DC2626", "#991B1B"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    height: "100%",
                    width: "100%",
                    borderRadius: 9999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: alpha("#ffffff", 0.1),
                  }}
                >
                  <Wallet size={18} strokeWidth={2.5} color="#ffffff" />
                </LinearGradient>
              ) : (
                <View
                  style={[
                    { height: "100%", width: "100%", borderRadius: 9999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
                    isReddish
                      ? { backgroundColor: "#ffffff", borderColor: alpha(colors.gray[200], 0.5), ...shadow.sm }
                      : { backgroundColor: alpha("#ffffff", 0.1), borderColor: alpha("#ffffff", 0.2) },
                  ]}
                >
                  <Wallet size={18} strokeWidth={2.5} color={iconColorValue} />
                </View>
              )}
            </Pressable>
          )}

          {showCart && (
            <Link
              to="/food/user/cart"
              state={{ from: routerLocation.pathname }}
              accessibilityLabel="Cart"
              style={({ pressed }) => [{ position: "relative", height: 36, width: 36, borderRadius: 9999 }, pressed && { opacity: 0.8 }]}
            >
              <View
                style={[
                  { height: "100%", width: "100%", borderRadius: 9999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
                  leftAligned
                    ? { backgroundColor: "#ffffff", borderColor: alpha(colors.gray[200], 0.5), ...shadow.sm }
                    : { backgroundColor: alpha("#ffffff", 0.1), borderColor: alpha("#ffffff", 0.2) },
                ]}
              >
                <ShoppingCart size={20} strokeWidth={2.5} color={iconColorValue} />
              </View>
              {cartCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    backgroundColor: "#DC2626",
                    height: 16,
                    minWidth: 16,
                    borderRadius: 9999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: badgeBorder,
                  }}
                >
                  <Text style={{ color: "#ffffff", fontSize: 10, lineHeight: 12, fontWeight: "700" }}>{cartCount > 99 ? "99+" : cartCount}</Text>
                </View>
              )}
            </Link>
          )}

          {showProfile && (
            <Pressable onPress={() => openIfSignedIn("/food/user/profile")} accessibilityLabel="Profile">
              {({ pressed }) => (
                <Avatar
                  style={[
                    { height: 36, width: 36, borderRadius: 9999, borderWidth: 1, borderColor: "#ffffff", overflow: "hidden" },
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <AvatarImage src={userProfile?.profileImage?.url || userProfile?.profileImage || DEFAULT_AVATAR} />
                  <AvatarFallback style={{ backgroundColor: "#DC2626" }}>
                    <AppImage src={DEFAULT_AVATAR} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                  </AvatarFallback>
                </Avatar>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </>
  )

  return onNavClick ? (
    <Pressable onPress={onNavClick} style={navStyle}>
      {nav}
    </Pressable>
  ) : (
    <View style={navStyle}>{nav}</View>
  )
}
