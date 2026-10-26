// Helpers shared by the restaurant onboarding and the admin "Add restaurant" form:
// which service zone a picked location belongs to, and how to list location search results sensibly.

// Ray-casting point-in-polygon on a zone's {latitude, longitude} boundary.
export const isPointInZone = (lat, lng, zone) => {
  const points = (Array.isArray(zone?.coordinates) ? zone.coordinates : [])
    .map((c) => [Number(c?.latitude ?? c?.lat), Number(c?.longitude ?? c?.lng)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  if (points.length < 3) return false
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [yi, xi] = points[i]
    const [yj, xj] = points[j]
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

export const findZoneForPoint = (lat, lng, zones = []) => {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) return null
  return (Array.isArray(zones) ? zones : []).find((z) => z?.isActive !== false && isPointInZone(la, lo, z)) || null
}

export const getZoneLabel = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || ""

const zonePoints = (zones = []) =>
  (Array.isArray(zones) ? zones : []).flatMap((zone) =>
    (Array.isArray(zone?.coordinates) ? zone.coordinates : [])
      .map((c) => ({ lat: Number(c?.latitude ?? c?.lat), lng: Number(c?.longitude ?? c?.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
  )

/** Bounding box + centre of all service zones (null when there are none). */
export const getZonesArea = (zones = []) => {
  const pts = zonePoints(zones)
  if (pts.length === 0) return null
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const south = Math.min(...lats)
  const north = Math.max(...lats)
  const west = Math.min(...lngs)
  const east = Math.max(...lngs)
  return { south, north, west, east, center: { lat: (south + north) / 2, lng: (west + east) / 2 } }
}

const distanceKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * Search results from the map-less fallback search: the same place shows up several times (node / way / relation of
 * the same street) and results from far away states used to come first. One entry per place, nearest to the service
 * area first.
 */
export const rankLocationResults = (results = [], center = null, limit = 6) => {
  const seen = new Set()
  const unique = []
  for (const r of Array.isArray(results) ? results : []) {
    const parts = String(r?.display || "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean)
    // "Juni Indore Tahsil, Indore" and "Indore, Juni Indore Tahsil" are the same place
    const key = `${parts.slice(0, 2).sort().join("|")}|${String(r?.addr?.postcode || "").trim()}|${String(r?.addr?.state || "").trim().toLowerCase()}`
    if (!parts.length || seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  if (!center) return unique.slice(0, limit)
  return unique
    .map((r) => ({ r, d: Number.isFinite(r.lat) && Number.isFinite(r.lng) ? distanceKm(center, { lat: r.lat, lng: r.lng }) : Infinity }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.r)
}
