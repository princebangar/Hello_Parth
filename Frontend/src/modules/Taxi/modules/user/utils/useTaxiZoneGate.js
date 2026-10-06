import { useEffect, useState } from 'react';
import api from '../../../shared/api/axiosInstance';
import { getSavedLocation, LOCATION_UPDATED_EVENT } from '../services/locationStore';

/**
 * Is the customer's saved location inside any active Taxi zone? When it is not, the Taxi home shows the same
 * "out of zone" screen as Food. No active Taxi zone configured at all = out of zone everywhere.
 */
const ZONES_TTL_MS = 60 * 1000;
let zonesCache = { ts: 0, paths: null };
let zonesInFlight = null;

const toPoint = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (point && typeof point === 'object') {
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.longitude ?? point.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  return null;
};

const toPath = (zone) => {
  const source = Array.isArray(zone?.coordinates?.[0]) && Array.isArray(zone?.coordinates?.[0]?.[0])
    ? zone.coordinates[0]
    : zone?.coordinates;
  return Array.isArray(source) ? source.map(toPoint).filter(Boolean) : [];
};

const isInside = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { lng: xi, lat: yi } = polygon[i];
    const { lng: xj, lat: yj } = polygon[j];
    if (((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi)) {
      inside = !inside;
    }
  }
  return inside;
};

const loadZonePaths = async () => {
  if (zonesCache.paths && Date.now() - zonesCache.ts < ZONES_TTL_MS) return zonesCache.paths;
  if (!zonesInFlight) {
    zonesInFlight = api.get('/users/zones')
      .then((response) => {
        const payload = response?.data?.data || response?.data || response;
        const list = payload?.results || payload?.zones || (Array.isArray(payload) ? payload : []);
        const paths = list
          .filter((zone) => zone?.active !== false && Number(zone?.status ?? 1) !== 0)
          .map(toPath)
          .filter((path) => path.length >= 3);
        zonesCache = { ts: Date.now(), paths };
        return paths;
      })
      .finally(() => { zonesInFlight = null; });
  }
  return zonesInFlight;
};

export default function useTaxiZoneGate() {
  const [outOfZone, setOutOfZone] = useState(false);

  useEffect(() => {
    let active = true;

    const check = async () => {
      const saved = getSavedLocation();
      if (!Number.isFinite(saved?.lat) || !Number.isFinite(saved?.lon)) {
        if (active) setOutOfZone(false);
        return;
      }
      try {
        const paths = await loadZonePaths();
        if (!active) return;
        const point = { lat: saved.lat, lng: saved.lon };
        setOutOfZone(!paths.some((path) => isInside(point, path))); // no active zone at all = Taxi not live yet
      } catch {
        if (active) setOutOfZone(false); // can't tell → don't block
      }
    };

    check();
    window.addEventListener(LOCATION_UPDATED_EVENT, check);
    return () => {
      active = false;
      window.removeEventListener(LOCATION_UPDATED_EVENT, check);
    };
  }, []);

  return outOfZone;
}
