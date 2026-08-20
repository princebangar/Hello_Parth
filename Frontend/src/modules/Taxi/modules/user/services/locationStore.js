import { persistTaxiUserLocation, TAXI_LOCATION_STORAGE_KEY, TAXI_LOCATION_UPDATED_EVENT, getSharedLocationLabel } from '@/shared/utils/sharedUserLocation';

export const LOCATION_STORAGE_KEY = TAXI_LOCATION_STORAGE_KEY;
export const LOCATION_UPDATED_EVENT = TAXI_LOCATION_UPDATED_EVENT;

export const DEFAULT_LOCATION_LABEL = 'Choose your location';
export const DEFAULT_LOCATION_COORDS = [78.4867, 17.385];

export const getSavedLocation = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
    const lat = Number(saved?.lat);
    const lon = Number(saved?.lon);
    const updatedAt = Number(saved?.updatedAt);
    const address = String(saved?.address || '').trim();

    return {
      address,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    };
  } catch {
    return null;
  }
};

export const getSavedLocationLabel = () => (
  String(getSharedLocationLabel() || getSavedLocation()?.address || '').trim() || DEFAULT_LOCATION_LABEL
);

export const getSavedLocationCoords = () => {
  const saved = getSavedLocation();
  if (saved && Number.isFinite(saved.lon) && Number.isFinite(saved.lat)) {
    return [saved.lon, saved.lat];
  }

  return null;
};

export const saveLocation = (nextLocation = {}) => {
  if (typeof window === 'undefined') {
    return null;
  }

  return persistTaxiUserLocation(nextLocation);
};
