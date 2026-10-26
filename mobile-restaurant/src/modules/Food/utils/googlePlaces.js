// Native version of the web's googlePlaces.js. The web loaded the google.maps JS SDK and merged three sources
// (legacy AutocompleteService + new AutocompleteSuggestion + backend text search). Natively there is no JS SDK:
// both autocomplete sources are the Places API (New) autocomplete from @/lib/google, the backend text search is
// unchanged. Exported functions and result shapes are the web's.
import { geocodeGooglePlaceId } from "./googleGeocoding"
import { geocodeAPI } from "@food/api"
import { autocomplete, newSessionToken } from "@/lib/google"

const normalizePlaceId = (placeId = "") => {
  const raw = String(placeId).trim()
  if (!raw) return ""
  return raw.startsWith("places/") ? raw.slice("places/".length) : raw
}

/** Web: loaded the Maps JS SDK. Natively the web services need nothing loaded; resolves to an empty namespace. */
export async function ensureGoogleMapsPlacesLoaded() {
  return { maps: { places: {} } }
}

export function mapGeocodeParsedToLocation(parsed) {
  if (!parsed) return null

  const placeName = parsed.placeName || parsed.premise || ""
  const streetLine =
    parsed.streetNumber && parsed.route
      ? `${parsed.streetNumber}, ${parsed.route}`
      : parsed.route || ""

  const addressLine1 =
    placeName ||
    streetLine ||
    parsed.address?.split(",")[0]?.trim() ||
    parsed.formattedAddress?.split(",")[0]?.trim() ||
    ""

  return {
    formattedAddress: parsed.formattedAddress || "",
    addressLine1,
    addressLine2: placeName && streetLine && !streetLine.includes(placeName) ? streetLine : "",
    area: parsed.area || "",
    city: parsed.city || "Indore",
    state: parsed.state || "Madhya Pradesh",
    pincode: parsed.pincode || "",
    landmark: placeName || "",
    latitude: Number(parsed.latitude),
    longitude: Number(parsed.longitude),
    placeName,
  }
}

function rankSuggestion(query, suggestion) {
  const q = String(query || "").trim().toLowerCase()
  const main = String(suggestion.mainText || suggestion.display || "").toLowerCase()
  const full = String(suggestion.display || "").toLowerCase()

  if (!q) return 0
  if (main === q || full === q) return 100
  if (main.startsWith(q) || full.startsWith(q)) return 80
  if (main.includes(q) || full.includes(q)) return 60
  if (suggestion.source === "text_search") return 55
  if (suggestion.source === "autocomplete_new") return 50
  return 30
}

function mergeSuggestions(query, lists = []) {
  const merged = new Map()

  for (const list of lists) {
    for (const item of list) {
      const placeId = normalizePlaceId(item.placeId || item.id)
      if (!placeId) continue

      const existing = merged.get(placeId)
      if (!existing || rankSuggestion(query, item) > rankSuggestion(query, existing)) {
        merged.set(placeId, {
          id: placeId,
          placeId,
          display: item.display || item.mainText || "",
          mainText: item.mainText || item.display || "",
          secondaryText: item.secondaryText || "",
          source: item.source || "autocomplete",
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
        })
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => rankSuggestion(query, b) - rankSuggestion(query, a))
    .slice(0, 8)
}

async function fetchNewAutocompletePredictions(query, options = {}) {
  try {
    const lat = Number(options.latitude)
    const lng = Number(options.longitude)
    const predictions = await autocomplete(query, {
      sessionToken: newSessionToken(),
      country: "in",
      radius: 50000,
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
    })

    return (predictions || []).map((prediction) => {
      const placeId = normalizePlaceId(prediction.place_id)
      const mainText = prediction.structured_formatting?.main_text || prediction.description || ""
      const secondaryText = prediction.structured_formatting?.secondary_text || ""
      return {
        id: placeId,
        placeId,
        display: prediction.description || `${mainText}${secondaryText ? `, ${secondaryText}` : ""}`,
        mainText,
        secondaryText,
        source: "autocomplete_new",
      }
    })
  } catch {
    return []
  }
}

async function fetchTextSearchPredictions(query, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 7000)

  try {
    const lat = Number(options.latitude)
    const lng = Number(options.longitude)

    const body = {
      textQuery: query,
      maxResultCount: 6,
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      body.latitude = lat
      body.longitude = lng
    }

    const response = await geocodeAPI.textSearch(body, { signal: controller.signal })
    const data = response?.data?.data
    const places = Array.isArray(data?.places) ? data.places : []

    return places.map((place) => {
      const placeId = normalizePlaceId(place.id)
      const mainText = place.displayName?.text || place.displayName || ""
      const formattedAddress = place.formattedAddress || ""
      return {
        id: placeId,
        placeId,
        display: formattedAddress || mainText,
        mainText: mainText || formattedAddress.split(",")[0] || "",
        secondaryText: formattedAddress && mainText ? formattedAddress : "",
        source: "text_search",
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
      }
    })
  } catch {
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch Google place suggestions using Places autocomplete + backend text search.
 */
export async function fetchPlaceSuggestions(input, options = {}) {
  const query = String(input || "").trim()
  if (query.length < 3) return []

  await ensureGoogleMapsPlacesLoaded()

  const [newResults, textResults] = await Promise.all([
    fetchNewAutocompletePredictions(query, options),
    fetchTextSearchPredictions(query, options),
  ])

  return mergeSuggestions(query, [textResults, newResults])
}

export async function resolvePlaceSuggestion(suggestion) {
  const placeId = normalizePlaceId(suggestion?.placeId || suggestion?.id)
  if (!placeId) throw new Error("Missing place id")

  const parsed = await geocodeGooglePlaceId(placeId)
  const location = mapGeocodeParsedToLocation(parsed)

  if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return location
  }

  if (Number.isFinite(suggestion?.latitude) && Number.isFinite(suggestion?.longitude)) {
    return {
      formattedAddress: suggestion.display || "",
      addressLine1: suggestion.mainText || suggestion.display || "",
      addressLine2: "",
      area: "",
      city: "Indore",
      state: "Madhya Pradesh",
      pincode: "",
      landmark: suggestion.mainText || "",
      latitude: Number(suggestion.latitude),
      longitude: Number(suggestion.longitude),
      placeName: suggestion.mainText || "",
    }
  }

  throw new Error("Could not resolve location coordinates")
}

export function formatLocationPreview(location) {
  if (!location) return ""
  const parts = []
  if (location.placeName || location.addressLine1) {
    parts.push((location.placeName || location.addressLine1).trim())
  }
  if (location.area) parts.push(location.area.trim())
  if (location.city) parts.push(location.city.trim())
  if (location.pincode) parts.push(location.pincode.trim())
  return parts.filter(Boolean).join(", ")
}
