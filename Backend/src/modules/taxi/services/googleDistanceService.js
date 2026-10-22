import { logger } from '../../../utils/logger.js';

/**
 * Road distance + drive time between two points from Google's Routes API (driving).
 * Uses the server key from Backend/.env. Returns null when the key is missing or Google cannot answer,
 * so callers keep whatever value they already had.
 */
// Routes API (computeRoutes): the current Google API. The old Distance Matrix API cannot be switched on for new Google
// projects, so it is not used at all any more.
const ROAD_DISTANCE_CACHE = new Map();
const ROAD_DISTANCE_TTL_MS = 6 * 60 * 60 * 1000;
const ROAD_DISTANCE_CACHE_MAX = 5000;

const fetchRoadDistanceFromRoutesApi = async (apiKey, oLat, oLng, dLat, dLng) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
        destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();
    const route = data?.routes?.[0];
    const meters = Number(route?.distanceMeters);
    if (Number.isFinite(meters) && meters > 0) {
      const seconds = Number.parseFloat(String(route?.duration || '0').replace('s', '')) || 0;
      return { km: Math.round(meters / 100) / 10, minutes: Math.round(seconds / 60) };
    }
    logger.warn(`[google-distance] Routes API: ${data?.error?.status || 'NO_ROUTE'} ${data?.error?.message || ''}`);
  } catch (error) {
    logger.warn(`[google-distance] Routes API: ${error.message}`);
  }
  return null;
};

export const fetchRoadDistance = async (origin, destination) => {
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const points = [origin?.lat, origin?.lng, destination?.lat, destination?.lng].map(Number);
  if (!apiKey || !points.every(Number.isFinite)) {
    return null;
  }

  const [oLat, oLng, dLat, dLng] = points;
  const cacheKey = points.map((value) => value.toFixed(4)).join(',');
  const cached = ROAD_DISTANCE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const fromRoutes = await fetchRoadDistanceFromRoutesApi(apiKey, oLat, oLng, dLat, dLng);
  if (fromRoutes) {
    if (ROAD_DISTANCE_CACHE.size >= ROAD_DISTANCE_CACHE_MAX) {
      ROAD_DISTANCE_CACHE.delete(ROAD_DISTANCE_CACHE.keys().next().value);
    }
    ROAD_DISTANCE_CACHE.set(cacheKey, { value: fromRoutes, expiresAt: Date.now() + ROAD_DISTANCE_TTL_MS });
    return fromRoutes;
  }

  return null;
};
