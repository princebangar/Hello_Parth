export const FOOD_USER_LOCATION_KEY = "userLocation"
export const TAXI_LOCATION_STORAGE_KEY = "helloparth:lastLocation"
export const TAXI_LOCATION_UPDATED_EVENT = "helloparth:location-updated"
export const FOOD_LOCATION_UPDATED_EVENT = "userLocationUpdated"
export const LOCATION_ALLOWED_KEY = "helloparth_location_allowed"
/**
 * sessionStorage marker: "this app session has already taken its GPS fix". Whichever app (Taxi or Food) opens first
 * takes it and sets the marker; the other app then simply uses the saved location instead of asking for GPS again,
 * so switching Taxi <-> Food never changes the location - only the user can (Update button / picking an address).
 * Cleared when the tab / WebView is closed (new app session) and on logout.
 */
export const LOCATION_SESSION_KEY = "helloparth_location_session"

export function markLocationSessionFetched() {
  try {
    sessionStorage.setItem(LOCATION_SESSION_KEY, "1")
  } catch {}
}

export function hasLocationSessionFetched() {
  try {
    return sessionStorage.getItem(LOCATION_SESSION_KEY) === "1"
  } catch {
    return false
  }
}

export function getFoodStyleLocationParts(foodLoc = {}) {
  const area = String(foodLoc?.area || foodLoc?.subLocality || foodLoc?.mainTitle || foodLoc?.neighborhood || "").trim()
  const city = String(foodLoc?.city || "").trim()
  const state = String(foodLoc?.state || "").trim()
  const pincode = String(foodLoc?.pincode || foodLoc?.zipCode || foodLoc?.postalCode || "").trim()
  const cityLower = city.toLowerCase()
  const stateLower = state.toLowerCase()

  let title = ""
  if (area && !/^-?\d+(\.\d+)?$/.test(area)) {
    const areaLower = area.toLowerCase()
    if (areaLower !== cityLower && areaLower !== stateLower) {
      title = area
    }
  }

  if (!title) {
    const source = String(foodLoc?.address || foodLoc?.formattedAddress || "").trim()
    if (source && source.toLowerCase() !== "select location") {
      const parts = source.split(",").map((p) => p.trim()).filter(Boolean)
      for (const part of parts) {
        const partLower = part.toLowerCase()
        if (
          partLower &&
          partLower !== cityLower &&
          partLower !== stateLower &&
          !/^-?\d/.test(part) &&
          part.length > 2
        ) {
          title = part
          break
        }
      }
    }
  }

  if (!title) title = area || city || "Select Location"

  let subtitle = ""
  if (state && pincode) subtitle = `${state}, ${pincode}`
  else if (state) subtitle = state
  else if (pincode) subtitle = pincode

  return { title, subtitle, city, state, pincode }
}

export function readSharedFoodLocation() {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(FOOD_USER_LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const lat = toFiniteNumber(parsed?.latitude ?? parsed?.lat)
    const lon = toFiniteNumber(parsed?.longitude ?? parsed?.lng ?? parsed?.lon)
    if (lat == null || lon == null) return parsed
    return parsed
  } catch {
    return null
  }
}

export function getSharedLocationLabel() {
  const food = readSharedFoodLocation()
  if (food) {
    const { title } = getFoodStyleLocationParts(food)
    if (title && title !== "Select Location") return title
  }
  try {
    const taxi = JSON.parse(localStorage.getItem(TAXI_LOCATION_STORAGE_KEY) || "{}")
    const address = String(taxi?.address || "").trim()
    if (address) return address.split(",")[0].trim() || address
  } catch {}
  return ""
}

export function locationPartsFromGoogleResult(result) {
  const components = Array.isArray(result?.address_components) ? result.address_components : []
  const get = (types) => {
    const match = components.find((c) => types.some((t) => (c.types || []).includes(t)))
    return String(match?.long_name || "").trim()
  }
  const area =
    get(["sublocality_level_1"]) ||
    get(["sublocality"]) ||
    get(["neighborhood"]) ||
    ""
  const state = get(["administrative_area_level_1"])
  const pincode = get(["postal_code"])
  const title = area || String(result?.formatted_address || "").split(",")[0]?.trim() || ""
  const subtitle = [state, pincode].filter(Boolean).join(", ")
  return {
    title,
    subtitle,
    area: title,
    state,
    pincode,
    address: [title, subtitle].filter(Boolean).join(", "),
  }
}

const toFiniteNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const emitLocationEvents = () => {
  try {
    window.dispatchEvent(new CustomEvent(FOOD_LOCATION_UPDATED_EVENT))
  } catch {}
  try {
    window.dispatchEvent(new Event(TAXI_LOCATION_UPDATED_EVENT))
  } catch {}
}

const parseJson = (raw) => {
  try {
    const parsed = JSON.parse(raw || "null")
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

/** Taxi's saved location (the shared record both apps use). */
export function readTaxiLocation() {
  if (typeof window === "undefined") return {}
  return parseJson(localStorage.getItem(TAXI_LOCATION_STORAGE_KEY)) || {}
}

const MOVED_THRESHOLD = 0.0005 // ~55 m

/** Keeps Food's saved location on the same spot as Taxi's. Food-only details (city, zone ...) are left as they are. */
function mirrorTaxiLocationToFood(taxiLoc) {
  const lat = toFiniteNumber(taxiLoc?.lat)
  const lon = toFiniteNumber(taxiLoc?.lon)
  if (lat == null || lon == null) return

  const existingFood = parseJson(localStorage.getItem(FOOD_USER_LOCATION_KEY)) || {}
  const address = String(taxiLoc.address || "").trim()
  const foodPayload = { ...existingFood, latitude: lat, longitude: lon }
  if (address) {
    const area = String(taxiLoc.area || "").trim() || getFoodStyleLocationParts({ address }).title
    foodPayload.address = address
    foodPayload.formattedAddress = address
    if (area && area !== "Select Location") foodPayload.area = area
    if (taxiLoc.state) foodPayload.state = taxiLoc.state
    if (taxiLoc.pincode) foodPayload.pincode = taxiLoc.pincode
  }
  try {
    localStorage.setItem(FOOD_USER_LOCATION_KEY, JSON.stringify(foodPayload))
  } catch {}
}

/**
 * Taxi's way to save its location (used by Taxi's locationStore): writes the shared store, mirrors the spot into
 * Food's store and tells every listener once.
 */
export function saveTaxiLocation(partial = {}) {
  if (typeof window === "undefined") return null
  const next = { ...readTaxiLocation(), ...partial }
  try {
    localStorage.setItem(TAXI_LOCATION_STORAGE_KEY, JSON.stringify(next))
  } catch {}
  mirrorTaxiLocationToFood(next)
  emitLocationEvents()
  return next
}

export function persistFoodUserLocation(foodLoc, { touch = true } = {}) {
  if (typeof window === "undefined" || !foodLoc || typeof foodLoc !== "object") return foodLoc

  const lat = toFiniteNumber(foodLoc.latitude ?? foodLoc.lat)
  const lon = toFiniteNumber(foodLoc.longitude ?? foodLoc.lng ?? foodLoc.lon)
  const parts = getFoodStyleLocationParts(foodLoc)
  const address = parts.title && parts.title !== "Select Location"
    ? [parts.title, parts.subtitle].filter(Boolean).join(", ")
    : String(foodLoc.formattedAddress || foodLoc.address || foodLoc.area || "").trim()
  const foodPayload = {
    ...foodLoc,
    ...(lat != null ? { latitude: lat } : {}),
    ...(lon != null ? { longitude: lon } : {}),
  }
  if (parts.title && parts.title !== "Select Location") foodPayload.area = parts.title
  if (!foodPayload.address && address) foodPayload.address = address
  if (!foodPayload.formattedAddress && address) foodPayload.formattedAddress = address

  try {
    localStorage.setItem(FOOD_USER_LOCATION_KEY, JSON.stringify(foodPayload))
  } catch {}

  if (lat != null && lon != null) {
    // Re-saving an already-saved fix (app start) must not make it look freshly detected.
    const previousTaxi = parseJson(localStorage.getItem(TAXI_LOCATION_STORAGE_KEY)) || {}
    try {
      localStorage.setItem(
        TAXI_LOCATION_STORAGE_KEY,
        JSON.stringify({
          address: address || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          area: parts.title || foodLoc.area || "",
          lat,
          lon,
          updatedAt: touch ? Date.now() : toFiniteNumber(previousTaxi.updatedAt) ?? Date.now(),
        }),
      )
    } catch {}
  }

  emitLocationEvents()
  return foodPayload
}

export function persistTaxiUserLocation(taxiLoc = {}) {
  if (typeof window === "undefined") return taxiLoc

  const previousTaxi = (() => {
    try {
      return JSON.parse(localStorage.getItem(TAXI_LOCATION_STORAGE_KEY) || "{}")
    } catch {
      return {}
    }
  })()
  const next = { ...previousTaxi, ...taxiLoc }
  const lat = toFiniteNumber(next.lat)
  const lon = toFiniteNumber(next.lon)
  const incomingArea = String(next.area || "").trim()
  const address = String(
    incomingArea
      ? [incomingArea, next.state, next.pincode].filter(Boolean).join(", ")
      : next.address || "",
  ).trim()
  const payload = {
    ...next,
    address,
    area: incomingArea || previousTaxi.area || (address ? address.split(",")[0].trim() : ""),
    lat,
    lon,
    updatedAt: Date.now(),
  }

  try {
    localStorage.setItem(TAXI_LOCATION_STORAGE_KEY, JSON.stringify(payload))
  } catch {}

  if (lat != null && lon != null) {
    let existingFood = {}
    try {
      existingFood = JSON.parse(localStorage.getItem(FOOD_USER_LOCATION_KEY) || "{}")
    } catch {}
    const foodPayload = {
      ...existingFood,
      latitude: lat,
      longitude: lon,
      address: incomingArea ? payload.address : (existingFood.address || address),
      formattedAddress: incomingArea ? payload.address : (existingFood.formattedAddress || address),
      area: incomingArea || existingFood.area || existingFood.subLocality || "",
      ...(next.state ? { state: next.state } : {}),
      ...(next.pincode ? { pincode: next.pincode } : {}),
    }
    try {
      localStorage.setItem(FOOD_USER_LOCATION_KEY, JSON.stringify(foodPayload))
    } catch {}
  }

  emitLocationEvents()
  return payload
}

export function markLocationAllowed() {
  try {
    localStorage.setItem(LOCATION_ALLOWED_KEY, "true")
  } catch {}
}

/**
 * Drops the shared last-known-location data on logout — Food and Taxi both
 * read/write it, so a shared device shouldn't hand the next person who
 * logs in the previous person's saved address. Called from both apps'
 * logout paths.
 */
export function clearSharedUserLocation() {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(FOOD_USER_LOCATION_KEY)
    localStorage.removeItem(TAXI_LOCATION_STORAGE_KEY)
    localStorage.removeItem(LOCATION_ALLOWED_KEY)
    sessionStorage.removeItem(LOCATION_SESSION_KEY)
  } catch {}
}

export function syncSharedLocationStoresOnBoot() {
  if (typeof window === "undefined") return
  try {
    const foodRaw = localStorage.getItem(FOOD_USER_LOCATION_KEY)
    const food = foodRaw ? JSON.parse(foodRaw) : null
    const taxi = readTaxiLocation()
    const foodLat = toFiniteNumber(food?.latitude)
    const foodLon = toFiniteNumber(food?.longitude)
    const taxiLat = toFiniteNumber(taxi?.lat)
    const taxiLon = toFiniteNumber(taxi?.lon)

    if (foodLat != null && foodLon != null) {
      persistFoodUserLocation(food, { touch: false })
      return
    }
    if (taxiLat != null && taxiLon != null && (foodLat == null || foodLon == null)) {
      saveTaxiLocation({})
    }
  } catch {}
}
