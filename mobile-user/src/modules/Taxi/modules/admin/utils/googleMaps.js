// Native: there is no JS SDK to load. The map is react-native-maps (AppMap) and geocoding / places / routes go through
// @/lib/google, so the loader hooks are "loaded" at once. They also hand out `google` — the window.google look-alike from
// placesCompat (Geocoder, places.AutocompleteService, places.PlacesService, LatLng ...) — for logic written against it.
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LOADER_ID, GOOGLE_MAPS_LIBRARIES } from '../../../../../shared/utils/googleMapsConfig';
import { googleMapsCompat, installPlacesCompat } from '../../../../../shared/maps/placesCompat';

export { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LOADER_ID, GOOGLE_MAPS_LIBRARIES };

export const HAS_VALID_GOOGLE_MAPS_KEY =
  typeof GOOGLE_MAPS_API_KEY === 'string' &&
  GOOGLE_MAPS_API_KEY.trim() !== '' &&
  GOOGLE_MAPS_API_KEY !== 'your-google-maps-browser-key';

export const INDIA_CENTER = { lat: 22.7196, lng: 75.8577 };
export const DELHI_CENTER = { lat: 28.6139, lng: 77.209 };

export const getLatLng = (source, fallback = INDIA_CENTER) => {
  const lat = Number(source?.lat ?? source?.latitude);
  const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return fallback;
};

/** The window.google look-alike (see shared/maps/placesCompat.js). */
export const getGoogleMaps = () => installPlacesCompat();

// One stable object: { isLoaded, loadError, google } like useJsApiLoader's result (+ the compat namespace).
const LOADER_STATE = Object.freeze({ isLoaded: true, loadError: undefined, google: googleMapsCompat });

const useGoogleMapsLoader = () => LOADER_STATE;

export const useBaseGoogleMapsLoader = () => useGoogleMapsLoader();

export const usePlacesGoogleMapsLoader = () => useGoogleMapsLoader();

export const useDrawingGoogleMapsLoader = () => useGoogleMapsLoader();

export const useAppGoogleMapsLoader = useGoogleMapsLoader;
