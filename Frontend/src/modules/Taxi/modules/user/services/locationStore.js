import {
  TAXI_LOCATION_STORAGE_KEY,
  TAXI_LOCATION_UPDATED_EVENT,
  readTaxiLocation,
  saveTaxiLocation,
} from '@/shared/utils/sharedUserLocation';

/**
 * Taxi's saved location (pickup point). It lives in the SHARED store (see shared/utils/sharedUserLocation.js) so Food
 * and Taxi always show the same spot: saving here also updates Food's location, and a change made in Food shows up
 * here. It only changes when the user changes it (Update button, dragging the pin, picking an address) or when a new
 * app session takes its first GPS fix.
 */
export const LOCATION_STORAGE_KEY = TAXI_LOCATION_STORAGE_KEY;
export const LOCATION_UPDATED_EVENT = TAXI_LOCATION_UPDATED_EVENT;

export const DEFAULT_LOCATION_LABEL = 'Choose your location';
export const DEFAULT_LOCATION_COORDS = [78.4867, 17.385];

export const getSavedLocation = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const saved = readTaxiLocation();
    const lat = Number(saved?.lat);
    const lon = Number(saved?.lon);
    const updatedAt = Number(saved?.updatedAt);
    const address = String(saved?.address || '').trim();

    return {
      address,
      area: String(saved?.area || '').trim(),
      state: String(saved?.state || '').trim(),
      pincode: String(saved?.pincode || '').trim(),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    };
  } catch {
    return null;
  }
};

export const getSavedLocationLabel = () => (
  String(getSavedLocation()?.address || '').trim() || DEFAULT_LOCATION_LABEL
);

export const getSavedLocationCoords = () => {
  const saved = getSavedLocation();
  if (saved && Number.isFinite(saved.lon) && Number.isFinite(saved.lat)) {
    return [saved.lon, saved.lat];
  }

  return null;
};

export const saveLocation = (nextLocation = {}) => saveTaxiLocation(nextLocation);
