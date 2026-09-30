import { logger } from '../../../utils/logger.js';

/**
 * Road distance + drive time between two points from Google's Distance Matrix API (driving).
 * Uses the server key from Backend/.env. Returns null when the key is missing or Google cannot answer,
 * so callers keep whatever value they already had.
 */
export const fetchRoadDistance = async (origin, destination) => {
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const points = [origin?.lat, origin?.lng, destination?.lat, destination?.lng].map(Number);
  if (!apiKey || !points.every(Number.isFinite)) {
    return null;
  }

  const [oLat, oLng, dLat, dLng] = points;
  const params = new URLSearchParams({
    origins: `${oLat},${oLng}`,
    destinations: `${dLat},${dLng}`,
    mode: 'driving',
    key: apiKey,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();
    const element = data?.rows?.[0]?.elements?.[0];

    if (data?.status === 'OK' && element?.status === 'OK' && Number(element.distance?.value) > 0) {
      return {
        km: Math.round(Number(element.distance.value) / 100) / 10,
        minutes: Math.round(Number(element.duration?.value || 0) / 60),
      };
    }
    logger.warn(`[google-distance] ${data?.status || 'NO_STATUS'} ${element?.status || ''} ${data?.error_message || ''}`);
  } catch (error) {
    logger.warn(`[google-distance] ${error.message}`);
  }

  return null;
};
