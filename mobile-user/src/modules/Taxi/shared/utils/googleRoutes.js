// Driving route between two points (and stops) — natively on the Routes API v2 through @/lib/google.
// Same exports and result shape as the web: { status, path: [{ lat, lng }], legs: [{ distanceMeters, durationMillis }], route }.
import { computeRoute } from '@/lib/google';
import { GOOGLE_MAPS_API_KEY } from '../../../../shared/utils/googleMapsConfig';
import { Geocoder, LatLngBounds } from '../../../../shared/maps/placesCompat';

const isFiniteCoordinate = (value) => Number.isFinite(Number(value));

const normalizePoint = (point) => {
  if (!point) return null;

  if (typeof point.lat === 'function' && typeof point.lng === 'function') {
    const lat = Number(point.lat());
    const lng = Number(point.lng());
    return isFiniteCoordinate(lat) && isFiniteCoordinate(lng) ? { lat, lng } : null;
  }

  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  return isFiniteCoordinate(lat) && isFiniteCoordinate(lng) ? { lat, lng } : null;
};

const normalizeIntermediate = (waypoint) => {
  if (!waypoint) return null;
  if (typeof waypoint === 'string') {
    const location = waypoint.trim();
    return location ? { location } : null;
  }
  if (typeof waypoint === 'object' && waypoint.location) {
    return waypoint;
  }

  const location = normalizePoint(waypoint);
  return location ? { location } : null;
};

const parseDurationSeconds = (value) => {
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }

  const match = /^([\d.]+)s$/i.exec(String(value || '').trim());
  return match ? Number(match[1]) : 0;
};

export const sumComputedRouteLegs = (legs = []) =>
  (Array.isArray(legs) ? legs : []).reduce(
    (totals, leg) => ({
      distanceMeters: totals.distanceMeters + Number(leg?.distanceMeters || 0),
      // `durationMillis` (Routes library shape) or a "123s" string (old Directions shape)
      durationSeconds: totals.durationSeconds + (Number.isFinite(Number(leg?.durationMillis)) ? Number(leg.durationMillis) / 1000 : parseDurationSeconds(leg?.duration)),
    }),
    { distanceMeters: 0, durationSeconds: 0 },
  );

// A stop is usually only a text label ("Sarafa Bazar"): it is geocoded near the trip (bounds bias) and passed on as a
// point. A label Google cannot place is left out of the route (the Routes call takes points only).
const resolveWaypointPoint = async (location, searchBounds, region) => {
  if (typeof location === 'string') {
    try {
      const { results } = await new Geocoder().geocode({ address: location, bounds: searchBounds, ...(region ? { region: String(region).trim().toLowerCase() } : {}) });
      return normalizePoint(results?.[0]?.geometry?.location);
    } catch {
      return null;
    }
  }
  return normalizePoint(location);
};

export const computeDrivingRoute = async ({
  origin,
  destination,
  intermediates = [],
  region,
  // eslint-disable-next-line no-unused-vars
  computeAlternativeRoutes = false,
} = {}) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return { status: 'LIBRARY_UNAVAILABLE', path: [], legs: [], route: null };
  }

  const from = normalizePoint(origin);
  const to = normalizePoint(destination);
  if (!from || !to) {
    return { status: 'INVALID_REQUEST', path: [], legs: [], route: null };
  }

  try {
    const tripBounds = new LatLngBounds(from, to);
    const sw = tripBounds.getSouthWest();
    const ne = tripBounds.getNorthEast();
    const searchBounds = { south: sw.lat() - 0.1, west: sw.lng() - 0.1, north: ne.lat() + 0.1, east: ne.lng() + 0.1 };

    const waypoints = [];
    for (const wp of (Array.isArray(intermediates) ? intermediates : []).map(normalizeIntermediate).filter(Boolean)) {
      const point = await resolveWaypointPoint(wp.location, searchBounds, region);
      if (point) waypoints.push(point);
    }

    const route = await computeRoute(from, to, { waypoints, travelMode: 'DRIVE' });
    const path = (route?.coordinates || []).map((c) => ({ lat: c.latitude, lng: c.longitude }));

    if (route && path.length > 0) {
      return {
        status: 'OK',
        path,
        // the Routes call returns the trip totals; they are handed out as one leg (sumComputedRouteLegs gives the same totals)
        legs: [{ distanceMeters: Number(route.distanceMeters || 0), durationMillis: Number(route.durationSeconds || 0) * 1000 }],
        route,
      };
    }

    return { status: 'ZERO_RESULTS', path: [], legs: [], route: null };
  } catch (routesError) {
    console.warn('Google Routes API failed:', routesError);
    return {
      status: 'ROUTE_COMPUTE_FAILED',
      path: [],
      legs: [],
      route: null,
    };
  }
};
