import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MapPin, X, Plus, Minus, Check, Map as MapIcon, LoaderCircle, Navigation, AlertTriangle, ChevronRight } from 'lucide-react-native';
import { router, useLocation, useNavigate } from '@/lib/router';
import { Overlay, Screen, Text, TextInput } from '@/native/ui';
import { AppMap, regionFor } from '@/native/ui/AppMap';
import { alpha, colors, makeStyles, sp, useTheme } from '@/theme';
import { useAppGoogleMapsLoader, INDIA_CENTER, HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import api from '../../../../shared/api/axiosInstance';
import { getSavedLocation, getSavedLocationCoords, saveLocation } from '../../services/locationStore';
import {
  dedupePlaces,
  distanceBetweenKm,
  formatDistance,
  isAreaPlace,
  keepNearbyPredictions,
  loadAreaHints,
  loadPopularPlaces,
  nearbyAutocompleteRequest,
  withAreaHint,
} from '../../utils/nearbyPlaces';
import { cleanGroundAddress, cleanRecentPlace, getBestPosition, loadRoadDistances, pickBestGeocodeResult } from '../../utils/preciseLocation';
import { getAppRoutePath } from '@/shared/utils/nativeShell';
import { saveParcelPickerResult } from '../../utils/parcelPickerResult';
import LocationOffDialog from '../../components/LocationOffDialog';

// A long address in a field that is not being edited shows its beginning (Android showed the end: pincode, state).
const TEXT_START = { start: 0, end: 0 };

const MAP_REVERSE_GEOCODE_DEBOUNCE_MS = 500;
const getLatLngCacheKey = (coords, precision = 5) =>
  `${Number(coords?.lat || 0).toFixed(precision)},${Number(coords?.lng || 0).toFixed(precision)}`;
const formatRoadDistance = (meters) => (meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`);
const sanitizeLocationInput = (value) => String(value || '').replace(/^\s+/g, '').replace(/\s{2,}/g, ' ');
// Pickups saved from this screen are stamped "now" so they count as fresh for a while.
const savePickup = (location) => saveLocation({ ...location, updatedAt: Date.now() });
// A city ride longer than this is almost certainly a wrong pick (or belongs to Intercity).
const MAX_CITY_RIDE_KM = 100;
const MAX_RIDE_STOPS = 3;

const unwrapResults = (response) => {
  const payload = response?.data?.data || response?.data || response;
  return payload?.results || payload?.zones || (Array.isArray(payload) ? payload : []);
};

const getZoneServiceLocationId = (zone) =>
  zone?.service_location_id?._id
  || zone?.service_location_id?.id
  || zone?.service_location_id
  || zone?.service_location?._id
  || zone?.service_location?.id
  || zone?.service_location
  || '';

const isZoneActive = (zone) => zone?.active !== false && Number(zone?.status ?? 1) !== 0;

const getZoneId = (zone) => zone?._id || zone?.id || '';

const toZonePoint = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    const [lng, lat] = point;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng) };
    }
  }

  if (point && typeof point === 'object') {
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.longitude ?? point.lon);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
};

const normalizeZonePath = (zone) => {
  const source = Array.isArray(zone?.coordinates?.[0]) && Array.isArray(zone?.coordinates?.[0]?.[0])
    ? zone.coordinates[0]
    : zone?.coordinates;

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map(toZonePoint).filter(Boolean);
};

const getBoundsFromPaths = (paths) => {
  if (!paths.length) {
    return null;
  }

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  paths.forEach((path) => {
    path.forEach((point) => {
      north = Math.max(north, point.lat);
      south = Math.min(south, point.lat);
      east = Math.max(east, point.lng);
      west = Math.min(west, point.lng);
    });
  });

  if (![north, south, east, west].every(Number.isFinite)) {
    return null;
  }

  return { north, south, east, west };
};

const isPointInPolygon = (point, polygon) => {
  if (!point || polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const isPointInAnyZone = (point, zonePaths) => {
  if (!zonePaths.length) {
    return true;
  }

  return zonePaths.some((path) => isPointInPolygon(point, path));
};

const findMatchingZone = (coords, zones = []) => {
  if (!Array.isArray(coords) || coords.length !== 2 || !Array.isArray(zones) || !zones.length) {
    return null;
  }

  const [lng, lat] = coords;
  const point = { lat: Number(lat), lng: Number(lng) };

  return zones.find((zone) => {
    const zonePath = normalizeZonePath(zone);
    return zonePath.length >= 3 && isPointInPolygon(point, zonePath);
  }) || null;
};

const saveRecentLocation = (address, coords) => {
  if (!address || address.trim().length === 0) return;
  try {
    const key = 'helloparth:recentLocations';
    let list = [];
    const saved = localStorage.getItem(key);
    if (saved) {
      list = JSON.parse(saved);
    }
    if (!Array.isArray(list)) list = [];
    list = list.filter(item => item.address.toLowerCase() !== address.toLowerCase());
    const name = address.split(',')[0].trim();
    list.unshift({
      name: name,
      address: address,
      lat: coords ? coords[1] : null,
      lon: coords ? coords[0] : null,
      distance: coords ? 'Recent' : '',
    });
    list = list.slice(0, 5);
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('helloparth:recent-locations-updated'));
  } catch (e) {
    console.error('Error saving recent location:', e);
  }
};

const SpinIcon = ({ children, style }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return <Animated.View style={[style, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>{children}</Animated.View>;
};

const PulseText = ({ style, children }) => {
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
      Animated.timing(value, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [value]);
  return <Animated.View style={{ opacity: value }}><Text style={style}>{children}</Text></Animated.View>;
};

// border-l-[1.5px] border-dotted (an 8 px tall dotted line)
const DottedConnector = ({ style }) => {
  const s = useStyles();
  return (
    <View style={[s.connector, style]}>
      <View style={s.connectorDot} />
      <View style={s.connectorDot} />
      <View style={s.connectorDot} />
    </View>
  );
};

// framer-motion entrance (initial -> animate) used for the stops, the bottom button and the map picker.
const useAppear = (from) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(value, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
  }, [value]);
  return { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] };
};

const AppearView = ({ from = 0, style, children }) => {
  const anim = useAppear(from);
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
};

const PressScale = ({ scaleTo = 0.99, style, children, disabled, ...rest }) => (
  <Pressable disabled={disabled} {...rest} style={({ pressed }) => [style, pressed && !disabled ? { transform: [{ scale: scaleTo }] } : null]}>
    {children}
  </Pressable>
);

// A field's "active" ring (ring-2 ring-*-200) and the theme's focus ring (Taxi/index.css: accent border + 1 px accent ring).
const FieldRing = ({ active, focused, ringColor, radius }) => {
  const P = taxiPalette(useTheme());
  if (focused) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: -1, left: -1, right: -1, bottom: -1, borderRadius: radius + 1, borderWidth: 2, borderColor: P.accent }]} />;
  }
  if (active) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: -3, left: -3, right: -3, bottom: -3, borderRadius: radius + 3, borderWidth: 2, borderColor: ringColor }]} />;
  }
  return null;
};

const SelectLocation = () => {
  const s = useStyles();
  const t = useTheme();
  const P = taxiPalette(t);
  const insets = useSafeAreaInsets();
  const location = useLocation();
  const routeState = location.state || {};
  const serviceLocationId = routeState.service_location_id || routeState.serviceLocationId || '';
  const routeActiveInput = routeState.activeInput === 'pickup' || routeState.activeInput === 'drop'
    ? routeState.activeInput
    : 'drop';
  const isParcelFlow = routeState.flow === 'parcel' || String(routeState.returnTo || '').includes('/parcel/details');
  const isIntercityRoute = Boolean(
    routeState.intercity
    || routeState.serviceType === 'intercity'
    || routeState.transport_type === 'intercity'
    || routeState.transportType === 'intercity',
  );
  const savedLocation = getSavedLocation();
  // The location the user already chose (the one shown in the Food / Taxi header, one shared store) is the pickup, at
  // once - no GPS wait on every ride. It needs coordinates too; without them the pickup is detected from the device.
  const savedPickupCoords = getSavedLocationCoords();
  const savedPickupLabel = savedPickupCoords ? String(savedLocation?.address || '').trim() : '';
  // Coming from the out-of-zone screen the saved place is the one that is NOT served: start with an empty pickup,
  // which fills itself with the device's current location (or lets the user type another one).
  const fromOutOfZone = Boolean(routeState.fromOutOfZone);
  const [pickup, setPickup] = useState(() => routeState.pickup || (fromOutOfZone ? '' : savedPickupLabel) || '');
  // True once the user has typed in the active field. A prefilled address that was never edited must not
  // be searched as if it were a query (that gave "No results for <the whole address>").
  const [userTyped, setUserTyped] = useState(false);
  const [drop, setDrop] = useState(() => routeState.drop || '');
  const [pickupCoords, setPickupCoords] = useState(() => routeState.pickupCoords || (fromOutOfZone ? null : savedPickupCoords) || null);
  const [locationError, setLocationError] = useState('');
  const [tripError, setTripError] = useState('');
  const [isResolvingCurrentLocation, setIsResolvingCurrentLocation] = useState(false);
  const [nearbyPopular, setNearbyPopular] = useState([]);
  const [dropCoords, setDropCoords] = useState(() => routeState.dropCoords || null);
  const [stops, setStops] = useState(() => routeState.stops || []);          // array of stop strings
  const [activeInput, setActiveInput] = useState(routeActiveInput); // 'pickup' | 'drop' | stopIdx
  const [focusedInput, setFocusedInput] = useState(null);
  const [showMapPicker, setShowMapPicker] = useState(Boolean(routeState.openMapPicker));
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [pickedAddress, setPickedAddress] = useState('Loading address...');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  // 'denied' | 'off' while the 'turn on location' dialog is open
  const [locationOffReason, setLocationOffReason] = useState(null);
  const [zones, setZones] = useState([]);
  const [zonePaths, setZonePaths] = useState([]);
  const [remoteResults, setRemoteResults] = useState([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);
  const reverseGeocodeTimerRef = useRef(null);
  // The pickup is filled from the device ONCE per visit. Clearing it (X / deleting the text) must leave the field empty
  // for typing - re-detecting on every empty pickup refilled it at once and made manual entry impossible.
  const autoPickupDoneRef = useRef(false);
  const pickupInputRef = useRef(null);
  const lastReverseGeocodedCenterRef = useRef(null);
  const geocoderRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const searchCacheRef = useRef(new Map());
  const latestSearchRef = useRef(0);
  const coordsLookupCacheRef = useRef(new Map());
  const placeSelectionCacheRef = useRef(new Map());
  const reverseGeocodeCacheRef = useRef(new Map());
  // `google`: the window.google look-alike (shared/maps/placesCompat) - same classes and callbacks as the web code used.
  const { isLoaded, loadError, google } = useAppGoogleMapsLoader();
  const navigate = useNavigate();
  const routePrefix = getAppRoutePath().startsWith('/taxi/user') ? '/taxi/user' : '';
  const parcelReturnPath = routeState.returnTo || `${routePrefix}/parcel/details`;
  // Parcel: this screen was opened on top of the details screen, so returning is one step back - pushing the details
  // screen again stacked an entry per location change and Android back had to be pressed that many times.
  const goBackToParcel = ({ state }) => {
    saveParcelPickerResult(state);
    if (routeState.returnTo && router.canGoBack()) {
      navigate(-1);
      return;
    }
    navigate(parcelReturnPath, { replace: true, state });
  };

  const zoneBounds = useMemo(() => getBoundsFromPaths(zonePaths), [zonePaths]);

  useEffect(() => {
    let active = true;

    const loadZoneData = async () => {
      if (!serviceLocationId) {
        setZones([]);
        setZonePaths([]);
        return;
      }

      try {
        const zonesResponse = await api.get('/users/zones');
        if (!active) {
          return;
        }

        const matchingZones = unwrapResults(zonesResponse)
          .filter((zone) => isZoneActive(zone));
        const matchingPaths = matchingZones
          .map(normalizeZonePath)
          .filter((path) => path.length >= 3);

        setZones(matchingZones);
        setZonePaths(matchingPaths);
      } catch {
        if (active) {
          setZones([]);
          setZonePaths([]);
        }
      }
    };

    loadZoneData();

    return () => {
      active = false;
    };
  }, [serviceLocationId]);

  useEffect(() => {
    if (!isLoaded || !google?.maps?.places?.AutocompleteService) {
      return;
    }

    autocompleteServiceRef.current = autocompleteServiceRef.current || new google.maps.places.AutocompleteService();
    placesServiceRef.current = placesServiceRef.current || new google.maps.places.PlacesService(null);
    autocompleteSessionTokenRef.current = autocompleteSessionTokenRef.current
      || new google.maps.places.AutocompleteSessionToken();
  }, [isLoaded, google]);

  const getAutocompleteSessionToken = () => {
    if (!google?.maps?.places?.AutocompleteSessionToken) {
      return null;
    }

    if (!autocompleteSessionTokenRef.current) {
      autocompleteSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }

    return autocompleteSessionTokenRef.current;
  };

  const resetAutocompleteSessionToken = () => {
    if (!google?.maps?.places?.AutocompleteSessionToken) {
      autocompleteSessionTokenRef.current = null;
      return;
    }

    autocompleteSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
  };

  const getPlacesService = () => {
    if (!google?.maps?.places?.PlacesService) {
      return null;
    }

    if (!placesServiceRef.current) {
      placesServiceRef.current = new google.maps.places.PlacesService(null);
    }

    return placesServiceRef.current;
  };

  const getGeocoder = () => {
    if (!google?.maps?.Geocoder) {
      return null;
    }

    if (!geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }

    return geocoderRef.current;
  };

  // Pickup must always come from the device's real current location — never a hardcoded city default.
  // If geolocation or the Maps API is unavailable, surface an error instead of silently faking a place.
  useEffect(() => {
    if (pickup || isParcelFlow || autoPickupDoneRef.current) {
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('Location access is not supported on this device. Please select your pickup manually.');
      return;
    }

    if (!HAS_VALID_GOOGLE_MAPS_KEY || loadError) {
      setLocationError('Map service is unavailable right now. Please select your pickup location manually.');
      return;
    }

    if (!isLoaded) {
      return;
    }

    let cancelled = false;
    setIsResolvingCurrentLocation(true);
    setLocationError('');

    const handleSuccess = (pos) => {
      if (cancelled) return;
      autoPickupDoneRef.current = true;
      const { latitude, longitude } = pos.coords;
      const coords = [longitude, latitude];
      const geocoder = getGeocoder();

      if (!geocoder) {
        setIsResolvingCurrentLocation(false);
        setLocationError('Map service is unavailable right now. Please select your pickup location manually.');
        return;
      }

      geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
        if (cancelled) return;
        setIsResolvingCurrentLocation(false);

        const best = status === 'OK' ? pickBestGeocodeResult(results) : null;
        if (best) {
          const addr = best.formatted_address;
          setPickup(addr);
          setPickupCoords(coords);
          savePickup({ address: addr, lat: latitude, lon: longitude });
          return;
        }

        setLocationError('Could not determine your address. Please select your pickup location manually.');
      });
    };

    const handleFailure = () => {
      if (cancelled) return;
      autoPickupDoneRef.current = true;
      setIsResolvingCurrentLocation(false);
      setLocationError('Could not access your current location. Please allow location access or select manually.');
    };

    // Waits (a few seconds at most) for a tight GPS fix, so the pickup is the building the user stands in.
    getBestPosition({ maxWaitMs: 7000 }).then(handleSuccess, handleFailure);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, isParcelFlow, isLoaded, loadError]);

  // "Popular Locations" must reflect places near the user's own current location, never a fixed city.
  // Popular spots of a few kinds (malls, landmarks, stations, temples, hospitals) around the pickup, nearest first.
  useEffect(() => {
    if (!isLoaded || !Array.isArray(pickupCoords) || pickupCoords.length !== 2) {
      return;
    }

    const placesService = getPlacesService();
    if (!placesService) {
      return;
    }

    const [lng, lat] = pickupCoords;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return;
    }

    let cancelled = false;
    loadPopularPlaces(google, placesService, pickupCoords).then((places) => {
      if (!cancelled) setNearbyPopular(places);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, pickupCoords]);

  // Resolves a typed place to coordinates. Never invents a location: returns null when it cannot be found.
  const resolveCoords = async (label, fallback = null) => {
    if (!label || !String(label).trim()) {
      return fallback;
    }

    const cacheKey = String(label).trim().toLowerCase();
    const cachedCoords = coordsLookupCacheRef.current.get(cacheKey);
    if (cachedCoords) {
      return cachedCoords;
    }

    if (!google?.maps?.Geocoder) {
      return fallback;
    }

    const geocoder = getGeocoder();
    if (!geocoder) {
      return fallback;
    }

    return new Promise((resolve) => {
      geocoder.geocode({ address: String(label).trim() }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          const resultLocation = results[0].geometry.location;
          const resolvedCoords = [resultLocation.lng(), resultLocation.lat()];
          coordsLookupCacheRef.current.set(cacheKey, resolvedCoords);
          resolve(resolvedCoords);
          return;
        }

        resolve(fallback);
      });
    });
  };

  const resolvePlaceSelection = async (result) => {
    if (Array.isArray(result?.coords) && result.coords.length === 2) {
      return {
        title: result.title,
        address: result.address || result.title,
        coords: result.coords,
      };
    }

    const cacheKey = String(result?.placeId || `${result?.title || ''}|${result?.address || ''}`.trim().toLowerCase());
    const cachedSelection = placeSelectionCacheRef.current.get(cacheKey);
    if (cachedSelection) {
      return cachedSelection;
    }

    const geocoder = getGeocoder();
    const placesService = getPlacesService();

    if (result?.placeId && placesService) {
      return new Promise((resolve) => {
        placesService.getDetails(
          {
            placeId: result.placeId,
            sessionToken: getAutocompleteSessionToken(),
            fields: ['formatted_address', 'geometry.location', 'name'],
          },
          (place, status) => {
            const placeLocation = place?.geometry?.location;

            if (status === 'OK' && placeLocation) {
              const resolvedSelection = {
                title: result.title || place.name || place.formatted_address,
                address: cleanGroundAddress(place.formatted_address) || result.address || result.title || '',
                coords: [placeLocation.lng(), placeLocation.lat()],
              };
              placeSelectionCacheRef.current.set(cacheKey, resolvedSelection);
              resolve(resolvedSelection);
              return;
            }

            if (geocoder) {
              geocoder.geocode({ placeId: result.placeId }, (results, geocodeStatus) => {
                const geocodedPlace = results?.[0];
                const geocodedLocation = geocodedPlace?.geometry?.location;

                if (geocodeStatus === 'OK' && geocodedLocation) {
                  const resolvedSelection = {
                    title: result.title || geocodedPlace.formatted_address,
                    address: cleanGroundAddress(geocodedPlace.formatted_address) || result.address || result.title || '',
                    coords: [geocodedLocation.lng(), geocodedLocation.lat()],
                  };
                  placeSelectionCacheRef.current.set(cacheKey, resolvedSelection);
                  resolve(resolvedSelection);
                  return;
                }

                resolve({
                  title: result?.title || '',
                  address: result?.address || result?.title || '',
                  coords: null,
                });
              });
              return;
            }

            resolve({
              title: result?.title || '',
              address: result?.address || result?.title || '',
              coords: null,
            });
          },
        );
      });
    }

    if (!geocoder) {
      return {
        title: result?.title || '',
        address: result?.address || result?.title || '',
        coords: await resolveCoords(result?.address || result?.title || ''),
      };
    }

    const coords = await resolveCoords(result?.address || result?.title || '');
    const resolvedSelection = {
      title: result?.title || '',
      address: result?.address || result?.title || '',
      coords,
    };
    if (coords) {
      placeSelectionCacheRef.current.set(cacheKey, resolvedSelection);
    }
    return resolvedSelection;
  };

  // eslint-disable-next-line no-unused-vars
  const validateZoneSelection = (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) {
      return false;
    }

    const [lng, lat] = coords;
    const point = { lat: Number(lat), lng: Number(lng) };

    return isPointInAnyZone(point, zonePaths);
  };

  const getQuery = () => {
    if (activeInput === 'pickup') return pickup;
    if (activeInput === 'drop') return drop;
    if (typeof activeInput === 'number') return stops[activeInput] || '';
    return '';
  };

  const query = getQuery();
  const currentZone = useMemo(() => findMatchingZone(pickupCoords, zones), [pickupCoords, zones]);

  // Places near the pickup; if Google gave fewer than 3, the user's last booked places fill in so the list is never empty.
  const recentPlaces = useMemo(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('helloparth:recentLocations') || '[]');
      return (Array.isArray(saved) ? saved : [])
        .filter((item) => item?.address && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
        .map(cleanRecentPlace)
        .map((item) => ({
          title: item.name || String(item.address).split(',')[0],
          address: item.address,
          coords: [Number(item.lon), Number(item.lat)],
          distanceLabel: '',
        }));
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyPopular]);
  const usingRecentFallback = nearbyPopular.length < 3 && recentPlaces.length > 0;
  const popularSuggestions = useMemo(
    () => (usingRecentFallback ? dedupePlaces([...nearbyPopular, ...recentPlaces]).slice(0, 4) : nearbyPopular),
    [usingRecentFallback, nearbyPopular, recentPlaces],
  );
  // Typed searches are kept near where the ride starts.
  const searchOrigin = useMemo(() => {
    const source = pickupCoords || savedPickupCoords;
    if (!Array.isArray(source) || source.length !== 2) return null;
    const [lng, lat] = source.map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupCoords, savedPickupCoords?.[0], savedPickupCoords?.[1]]);
  const searchOriginKey = searchOrigin ? `${searchOrigin.lat.toFixed(2)},${searchOrigin.lng.toFixed(2)}` : '';

  useEffect(() => {
    setUserTyped(false);
  }, [activeInput]);

  const isInitialDefault = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return false;
    if (!userTyped) return true;

    if (activeInput === 'pickup') {
      const defaultPickup = String(routeState.pickup || '').trim();
      const currentSaved = String(savedPickupLabel || '').trim();
      return trimmedQuery === defaultPickup || trimmedQuery === currentSaved;
    }

    if (activeInput === 'drop') {
      const defaultDrop = String(routeState.drop || '').trim();
      return trimmedQuery === defaultDrop;
    }

    if (typeof activeInput === 'number') {
      const defaultStop = String(routeState.stops?.[activeInput] || '').trim();
      return trimmedQuery === defaultStop;
    }

    return false;
  }, [query, userTyped, activeInput, routeState.pickup, routeState.drop, routeState.stops, savedPickupLabel]);

  const localSearchResults = useMemo(
    () => (query.trim().length >= 1 && !isInitialDefault ? [] : popularSuggestions),
    [popularSuggestions, query, isInitialDefault],
  );

  useEffect(() => {
    if (isInitialDefault || !query.trim() || query.trim().length < 3 || !HAS_VALID_GOOGLE_MAPS_KEY || !autocompleteServiceRef.current) {
      setRemoteResults([]);
      setIsSearchingLocations(false);
      return;
    }

    const normalizedQuery = `${query.trim().toLowerCase()}|${searchOriginKey}`;
    const cached = searchCacheRef.current.get(normalizedQuery);
    if (cached) {
      setRemoteResults(cached);
      setIsSearchingLocations(false);
      return;
    }

    const requestId = latestSearchRef.current + 1;
    latestSearchRef.current = requestId;
    setIsSearchingLocations(true);

    const timeoutId = setTimeout(() => {
      const request = {
        input: query.trim(),
        componentRestrictions: { country: 'in' },
        sessionToken: getAutocompleteSessionToken(),
      };

      if (searchOrigin && !isIntercityRoute) {
        // Only places near the pickup — never another city or state.
        Object.assign(request, nearbyAutocompleteRequest(google, searchOrigin));
      } else if (zoneBounds) {
        request.bounds = zoneBounds;
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (latestSearchRef.current !== requestId) {
          return;
        }

        const nearby = status === 'OK' ? keepNearbyPredictions(predictions) : [];
        const nextResults = dedupePlaces(nearby.map((prediction) => ({
          title: prediction.structured_formatting?.main_text || prediction.description,
          address: prediction.description,
          placeId: prediction.place_id,
          types: prediction.types || [],
          distanceLabel: Number.isFinite(prediction.distance_meters) ? formatDistance(prediction.distance_meters / 1000) : '',
        }))).slice(0, 6);

        searchCacheRef.current.set(normalizedQuery, nextResults);
        setRemoteResults(nextResults);
        setIsSearchingLocations(false);
      });
    }, 350);

    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, zoneBounds, searchOriginKey]);

  // The same place must show up once, however Google spells it.
  const searchResults = useMemo(
    () => dedupePlaces([...remoteResults, ...localSearchResults]),
    [localSearchResults, remoteResults],
  );

  // Landmark for area results ("Vijay Nagar" -> near Bhawarkua Square), so two areas with one name can be told apart.
  const [areaHints, setAreaHints] = useState({});
  useEffect(() => {
    if (!isLoaded || !google?.maps) return undefined;
    const wanted = searchResults.filter((place) => place.placeId && isAreaPlace(place.types) && areaHints[place.placeId] === undefined);
    if (wanted.length === 0) return undefined;
    let cancelled = false;
    loadAreaHints(google, wanted).then((found) => {
      if (cancelled) return;
      setAreaHints((prev) => {
        const next = { ...prev };
        wanted.forEach((place) => { next[place.placeId] = found[place.placeId] || ''; });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults, isLoaded]);
  const areaHintFor = (place) => (place?.placeId && isAreaPlace(place.types) ? areaHints[place.placeId] || '' : '');

  // The distance on each row is the road distance from the pickup (what Google Maps shows), not the straight line.
  const [roadMeters, setRoadMeters] = useState({});
  const placeKey = (place) => String(place?.placeId || (Array.isArray(place?.coords) ? place.coords.join(',') : place?.title || ''));
  const roadOrigin = Array.isArray(pickupCoords) && pickupCoords.length === 2 ? pickupCoords : savedPickupCoords;
  useEffect(() => {
    if (!isLoaded || !google?.maps || !Array.isArray(roadOrigin) || roadOrigin.length !== 2) return undefined;
    const wanted = searchResults
      .filter((place) => (Array.isArray(place.coords) || place.placeId) && roadMeters[placeKey(place)] === undefined)
      .slice(0, 10);
    if (wanted.length === 0) return undefined;
    let cancelled = false;
    loadRoadDistances(google, roadOrigin, wanted).then((meters) => {
      if (cancelled) return;
      setRoadMeters((prev) => {
        const next = { ...prev };
        wanted.forEach((place, index) => {
          // null = Google has no road route / the service is off: remembered so it is not asked again
          next[placeKey(place)] = meters && Number.isFinite(meters[index]) ? meters[index] : null;
        });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults, isLoaded, roadOrigin?.[0], roadOrigin?.[1]]);
  // A new pickup means new distances.
  useEffect(() => { setRoadMeters({}); }, [roadOrigin?.[0], roadOrigin?.[1]]);
  const distanceTextFor = (place) => {
    const meters = roadMeters[placeKey(place)];
    if (Number.isFinite(meters)) return formatRoadDistance(meters);
    // not known (yet): no number at all rather than a straight-line one - unless Google could not route it
    return meters === null ? place.distanceLabel || '' : '';
  };

  const getMapStartCoord = () => {
    const activeCoords = activeInput === 'drop' ? dropCoords : pickupCoords;

    if (Array.isArray(activeCoords) && activeCoords.length === 2) {
      return { lat: activeCoords[1], lng: activeCoords[0] };
    }

    if (activeInput === 'drop' && Array.isArray(pickupCoords) && pickupCoords.length === 2) {
      return { lat: pickupCoords[1], lng: pickupCoords[0] };
    }

    if (Array.isArray(pickupCoords) && pickupCoords.length === 2) {
      return { lat: pickupCoords[1], lng: pickupCoords[0] };
    }

    return INDIA_CENTER;
  };

  const shouldSkipReverseGeocode = (nextCenter, threshold = 0.00015) => (
    Math.abs(Number(nextCenter?.lat ?? 0) - Number(lastReverseGeocodedCenterRef.current?.lat ?? 0)) < threshold
    && Math.abs(Number(nextCenter?.lng ?? 0) - Number(lastReverseGeocodedCenterRef.current?.lng ?? 0)) < threshold
  );

  const reverseGeocodeMapCenter = (nextCenter, fallbackLabel = '') => {
    const cacheKey = getLatLngCacheKey(nextCenter);
    const cachedAddress = reverseGeocodeCacheRef.current.get(cacheKey);
    if (cachedAddress) {
      lastReverseGeocodedCenterRef.current = nextCenter;
      setPickedAddress(cachedAddress);
      return;
    }

    const geocoder = getGeocoder();
    if (!geocoder) {
      setPickedAddress(fallbackLabel || `${nextCenter.lat.toFixed(5)}, ${nextCenter.lng.toFixed(5)}`);
      return;
    }

    setIsGeocoding(true);
    geocoder.geocode({ location: nextCenter }, (results, status) => {
      setIsGeocoding(false);
      lastReverseGeocodedCenterRef.current = nextCenter;

      const pickedResult = status === 'OK' ? pickBestGeocodeResult(results) : null;
      if (pickedResult?.formatted_address) {
        reverseGeocodeCacheRef.current.set(cacheKey, pickedResult.formatted_address);
        setPickedAddress(pickedResult.formatted_address);
        return;
      }

      setPickedAddress(fallbackLabel || `${nextCenter.lat.toFixed(5)}, ${nextCenter.lng.toFixed(5)}`);
    });
  };

  const showMapToast = () => {
    const startCoord = getMapStartCoord();
    const seedAddress = activeInput === 'drop' ? drop : pickup;

    setMapCenter(startCoord);
    lastCenterRef.current = startCoord;
    setPickedAddress(String(seedAddress || '').trim() || 'Loading address...');
    setShowMapPicker(true);
  };

  useEffect(() => {
    if (!showMapPicker) {
      return;
    }

    const startCoord = getMapStartCoord();
    const seedAddress = activeInput === 'drop' ? drop : pickup;
    setMapCenter(startCoord);
    lastCenterRef.current = startCoord;
    setPickedAddress(String(seedAddress || '').trim() || 'Loading address...');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMapPicker, activeInput, pickupCoords, dropCoords, pickup, drop]);

  useEffect(() => {
    if (!showMapPicker || !google?.maps?.Geocoder) {
      return;
    }

    const startCoord = getMapStartCoord();
    reverseGeocodeMapCenter(
      startCoord,
      `${startCoord.lat.toFixed(5)}, ${startCoord.lng.toFixed(5)}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMapPicker, activeInput, pickupCoords, dropCoords]);

  // <GoogleMap center={mapCenter}>: a new centre moves the map there.
  useEffect(() => {
    if (!mapInstanceRef.current || !mapCenter) return;
    mapInstanceRef.current.animateCamera({ center: { latitude: mapCenter.lat, longitude: mapCenter.lng } }, { duration: 250 });
  }, [mapCenter]);

  useEffect(() => () => {
    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }
  }, []);

  // onIdle: the region the map settled on (react-native-maps onRegionChangeComplete).
  const handleMapIdle = (region) => {
    if (!mapInstanceRef.current || !region) return;
    const lat = region.latitude;
    const lng = region.longitude;

    // Only update and geocode if the center has actually changed significantly
    const dist = Math.abs(lat - lastCenterRef.current.lat) + Math.abs(lng - lastCenterRef.current.lng);
    if (dist < 0.00001) {
      setIsDragging(false);
      return;
    }

    lastCenterRef.current = { lat, lng };
    setIsDragging(false);
    const nextCenter = { lat, lng };

    if (shouldSkipReverseGeocode(nextCenter)) {
      return;
    }

    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }

    reverseGeocodeTimerRef.current = setTimeout(() => {
      reverseGeocodeMapCenter(
        nextCenter,
        `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      );
    }, MAP_REVERSE_GEOCODE_DEBOUNCE_MS);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);

    const handleSuccess = (pos) => {
      setIsLocating(false);
      const newCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      if (mapInstanceRef.current) {
        mapInstanceRef.current.animateCamera({ center: newCoords, zoom: 17 }, { duration: 400 });
      }
    };

    getBestPosition({ maxWaitMs: 7000 }).then(handleSuccess, (error) => {
      setIsLocating(false);
      setLocationOffReason(error?.code === 1 ? 'denied' : 'off');
    });
  };

  const handleConfirmNavigate = async (optionalDrop, optionalDropCoords = null) => {
    const finalDrop = optionalDrop || drop;
    const finalPickup = pickup;

    if (!finalPickup || finalPickup.trim().length === 0) return;
    if (!finalDrop || finalDrop.trim().length === 0) return;

    const resolvedPickupCoords = pickupCoords || await resolveCoords(finalPickup);
    const resolvedDropCoords = optionalDropCoords || dropCoords || await resolveCoords(finalDrop);

    if (!Array.isArray(resolvedPickupCoords) || !Array.isArray(resolvedDropCoords)) {
      setTripError('We could not find that place on the map. Please pick it from the suggestions or choose it on the map.');
      return;
    }

    const tripKm = distanceBetweenKm(resolvedPickupCoords, resolvedDropCoords);
    if (!isParcelFlow && !isIntercityRoute && Number.isFinite(tripKm) && tripKm > MAX_CITY_RIDE_KM) {
      setTripError(`That drop is about ${Math.round(tripKm)} km away, too far for a city ride. Please choose a place near you.`);
      return;
    }
    setTripError('');

    if (isParcelFlow) {
      goBackToParcel({
        state: {
          ...routeState,
          pickup: finalPickup,
          drop: finalDrop,
          pickupCoords: resolvedPickupCoords,
          dropCoords: resolvedDropCoords,
          activeInput: 'drop',
          editPickup: false,
          openMapPicker: false,
        },
      });
      return;
    }

    savePickup({
      address: finalPickup,
      lat: resolvedPickupCoords[1],
      lon: resolvedPickupCoords[0],
    });

    saveRecentLocation(finalPickup, resolvedPickupCoords);
    saveRecentLocation(finalDrop, resolvedDropCoords);

    const matchedPickupZone = findMatchingZone(resolvedPickupCoords, zones);
    const nextServiceLocationId = getZoneServiceLocationId(matchedPickupZone) || '';
    const nextZoneId = getZoneId(matchedPickupZone) || '';

    navigate(`${routePrefix}/ride/select-vehicle`, {
      state: {
        ...routeState,
        pickup: finalPickup,
        drop: finalDrop,
        stops: stops.filter(s => s.trim().length > 0),
        pickupCoords: resolvedPickupCoords,
        dropCoords: resolvedDropCoords,
        service_location_id: nextServiceLocationId,
        zone_id: nextZoneId,
        selectedCategory: routeState.selectedCategory, // Forward category filter
      },
    });
  };

  const returnParcelSelection = (targetInput, address, coords) => {
    goBackToParcel({
      state: {
        ...routeState,
        pickup: targetInput === 'pickup' ? address : pickup,
        drop: targetInput === 'drop' ? address : drop,
        pickupCoords: targetInput === 'pickup' ? coords : pickupCoords,
        dropCoords: targetInput === 'drop' ? coords : dropCoords,
        activeInput: targetInput,
        editPickup: targetInput === 'pickup',
        openMapPicker: false,
      },
    });
  };

  const handleParcelBack = (keepMapPicker = false) => {
    goBackToParcel({
      state: {
        ...routeState,
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        activeInput,
        editPickup: activeInput === 'pickup',
        openMapPicker: keepMapPicker,
      },
    });
  };

  const handleScreenBack = () => {
    if (isParcelFlow) {
      handleParcelBack(false);
      return;
    }
    navigate(-1);
  };

  const handleMapBack = () => {
    if (isParcelFlow) {
      handleParcelBack(false);
      return;
    }
    setShowMapPicker(false);
  };

  const handleConfirmMapLocation = () => {
    const finalAddress = pickedAddress;
    const selectedCoords = [lastCenterRef.current.lng, lastCenterRef.current.lat];

    if (activeInput === 'pickup') {
      if (isParcelFlow) {
        returnParcelSelection('pickup', finalAddress, selectedCoords);
        return;
      }
      setPickup(finalAddress);
      setPickupCoords(selectedCoords);
      savePickup({
        address: finalAddress,
        lat: selectedCoords[1],
        lon: selectedCoords[0],
      });
      saveRecentLocation(finalAddress, selectedCoords);
      setActiveInput('drop');
    } else if (activeInput === 'drop') {
      if (isParcelFlow) {
        returnParcelSelection('drop', finalAddress, selectedCoords);
        return;
      }
      setDrop(finalAddress);
      setDropCoords(selectedCoords);
      saveRecentLocation(finalAddress, selectedCoords);
      // Auto-navigate if it's the destination
      handleConfirmNavigate(finalAddress, selectedCoords);
    } else if (typeof activeInput === 'number') {
      updateStop(activeInput, finalAddress);
      saveRecentLocation(finalAddress, selectedCoords);
    }
    setShowMapPicker(false);
  };

  const handleUseCurrentLocationResult = () => {
    if (!navigator.geolocation) {
      setLocationOffReason('off');
      return;
    }
    setIsLocating(true);

    const handleSuccess = (pos) => {
      setIsLocating(false);
      const { latitude, longitude } = pos.coords;
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
        const best = status === 'OK' ? pickBestGeocodeResult(results) : null;
        if (best) {
          const addr = best.formatted_address;
          const coords = [longitude, latitude];
          if (isParcelFlow) {
            returnParcelSelection(activeInput, addr, coords);
            return;
          }
          if (activeInput === 'drop') {
            setDrop(addr);
            setDropCoords(coords);
            handleConfirmNavigate(addr, coords);
          } else {
            handleSelectResult(addr, coords);
          }
        } else {
          const raw = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          const coords = [longitude, latitude];
          if (isParcelFlow) {
            returnParcelSelection(activeInput, raw, coords);
            return;
          }
          if (activeInput === 'drop') {
            setDrop(raw);
            setDropCoords(coords);
            handleConfirmNavigate(raw, coords);
          } else {
            handleSelectResult(raw, coords);
          }
        }
      });
    };

    getBestPosition({ maxWaitMs: 7000 }).then(handleSuccess, () => setIsLocating(false));
  };


  // Add a new empty stop
  const addStop = () => {
    // The ride keeps up to 3 stops (the server stores no more).
    if (stops.length >= MAX_RIDE_STOPS) return;
    setStops(prev => [...prev, '']);
    setActiveInput(stops.length); // focus the new stop
  };

  // Remove a stop by index
  const removeStop = (idx) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
    setActiveInput('drop');
  };

  // Update a stop value
  const updateStop = (idx, val) => {
    setStops(prev => prev.map((stop, i) => i === idx ? val : stop));
  };

  // When a suggestion is tapped
  const handleSelectResult = async (result, selectedCoords = null) => {
    const normalizedResult = typeof result === 'string'
      ? { title: result, address: result, coords: selectedCoords }
      : result;
    const resolvedSelection = await resolvePlaceSelection(normalizedResult);
    // "Vijay Nagar" at Bhawarkua is saved as "Vijay Nagar, near Bhawarkua Square", never as the bare ambiguous name.
    const finalTitle = withAreaHint(resolvedSelection.title || resolvedSelection.address, areaHintFor(normalizedResult));
    const resolvedCoords = selectedCoords || resolvedSelection.coords;

    resetAutocompleteSessionToken();

    if (!Array.isArray(resolvedCoords)) {
      setTripError('We could not find that place on the map. Please try another suggestion or choose it on the map.');
      return;
    }
    setTripError('');

    if (activeInput === 'pickup') {
      if (isParcelFlow) {
        returnParcelSelection('pickup', finalTitle, resolvedCoords);
        return;
      }
      setPickup(finalTitle);
      setPickupCoords(resolvedCoords);
      savePickup({
        address: finalTitle,
        lat: resolvedCoords[1],
        lon: resolvedCoords[0],
      });
      saveRecentLocation(finalTitle, resolvedCoords);
      setActiveInput('drop');
    } else if (activeInput === 'drop') {
      if (isParcelFlow) {
        returnParcelSelection('drop', finalTitle, resolvedCoords);
        return;
      }
      setDrop(finalTitle);
      setDropCoords(resolvedCoords);
      saveRecentLocation(finalTitle, resolvedCoords);
      handleConfirmNavigate(finalTitle, resolvedCoords);
    } else if (typeof activeInput === 'number') {
      updateStop(activeInput, finalTitle);
      saveRecentLocation(finalTitle, resolvedCoords);
      // Move to next stop or drop
      if (activeInput < stops.length - 1) {
        setActiveInput(activeInput + 1);
      } else {
        setActiveInput('drop');
      }
    }
  };

  // Central pin lifts while the map is dragged / the address is looked up (spring, stiffness 300, damping 20).
  const pinLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pinLift, { toValue: isDragging || isGeocoding ? -12 : 0, stiffness: 300, damping: 20, useNativeDriver: true }).start();
  }, [isDragging, isGeocoding, pinLift]);

  // isSearchingLocations is kept like the web (it has no indicator on the mobile layout)
  void isSearchingLocations;

  const headerTitle = query.trim().length > 0 && !isInitialDefault
    ? 'Search Results'
    : usingRecentFallback
      ? 'Recent places'
      : currentZone?.name ? `Popular near you in ${currentZone.name}` : 'Popular near you';

  return (
    <Screen bg={P.bg} edges={['bottom']} keyboard>
      <Overlay open={showMapPicker} onClose={handleMapBack} style={{ backgroundColor: P.card }}>
        <View style={s.fill}>
          {/* Map Area */}
          <View style={s.mapArea}>
            {!HAS_VALID_GOOGLE_MAPS_KEY ? (
              <View style={s.mapStateWrap}>
                <View style={s.mapStateCard}>
                  <View style={s.mapStateIcon}>
                    <X size={32} color={colors.rose[400]} />
                  </View>
                  <Text style={s.mapStateTitle}>Config Error</Text>
                  <Text style={s.mapStateText}>Google Maps API Key is missing.</Text>
                </View>
              </View>
            ) : loadError ? (
              <View style={s.mapStateWrap}>
                <View style={s.mapStateCard}>
                  <View style={s.mapStateIcon}>
                    <AlertTriangle size={32} color={colors.rose[400]} />
                  </View>
                  <Text style={s.mapStateTitle}>Load Failed</Text>
                  <Text style={s.mapStateText}>Map could not be loaded. Please check your browser console or network.</Text>
                </View>
              </View>
            ) : isLoaded ? (
              <AppMap
                ref={mapInstanceRef}
                style={StyleSheet.absoluteFill}
                initialRegion={regionFor(mapCenter, 16)}
                onRegionChangeComplete={handleMapIdle}
                onPanDrag={() => { if (!isDragging) setIsDragging(true); }}
                toolbarEnabled={false}
              />
            ) : (
              <View style={s.mapLoading}>
                <View>
                  <SpinIcon><LoaderCircle size={44} color={P.secondary} /></SpinIcon>
                  <View style={[StyleSheet.absoluteFill, s.center]}>
                    <MapIcon size={18} color={P.soft} />
                  </View>
                </View>
                <PulseText style={s.mapLoadingText}>Initializing Maps</PulseText>
              </View>
            )}

            {/* Map Header */}
            <LinearGradient
              colors={['#ffffff', alpha('#ffffff', 0.8), alpha('#ffffff', 0)]}
              style={[s.mapHeader, { paddingTop: Math.max(40, insets.top + 12) }]}
              pointerEvents="box-none"
            >
              <View style={s.mapHeaderRow}>
                <PressScale scaleTo={0.95} onPress={handleMapBack} style={s.mapBack}>
                  <ArrowLeft size={20} color={P.text} strokeWidth={2.5} />
                </PressScale>
                <View style={s.mapAddressCard}>
                  <Text style={s.mapAddressLabel}>Select Point</Text>
                  <Text style={s.mapAddressText} numberOfLines={1}>{isGeocoding ? 'Locating...' : pickedAddress}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Central Pin - Uber Style */}
            <View pointerEvents="none" style={s.centerPinAnchor}>
              <View style={s.centerPinBox}>
                <Animated.View style={[s.centerPinBody, { transform: [{ translateY: pinLift }] }]}>
                  <View style={s.centerPinHead}>
                    <View style={s.unrotate}>
                      <MapIcon size={18} color={P.text} fill={alpha('#ffffff', 0.2)} />
                    </View>
                  </View>
                  {/* Stick */}
                  <View style={s.centerPinStick} />
                </Animated.View>
                {/* Shadow Dot */}
                <View style={s.centerPinShadow} />
              </View>
            </View>

            {/* Current Location FAB */}
            <PressScale scaleTo={0.9} onPress={handleUseCurrentLocation} disabled={isLocating} style={s.fab}>
              {isLocating ? (
                <SpinIcon><LoaderCircle size={20} color={P.secondary} /></SpinIcon>
              ) : (
                <Navigation size={20} color={P.text} fill={alpha('#0f172a', 0.1)} />
              )}
            </PressScale>
          </View>

          {/* Confirm Actions */}
          <View style={[s.confirmArea, { paddingBottom: Math.max(40, insets.bottom + 16) }]}>
            <View style={s.confirmRow}>
              <View style={s.confirmIcon}>
                <MapPin size={20} color={P.secondary} />
              </View>
              <View style={s.minW0}>
                <Text style={s.confirmTitle}>Confirm Spot</Text>
                <Text style={s.confirmAddress} numberOfLines={1}>{pickedAddress}</Text>
              </View>
            </View>
            <PressScale scaleTo={0.98} onPress={handleConfirmMapLocation} disabled={isGeocoding} style={[s.confirmButton, isGeocoding && s.disabled50]}>
              <Check size={18} strokeWidth={3} color={P.ink} />
              <Text style={s.confirmButtonText}>Confirm Location</Text>
            </PressScale>
          </View>
        </View>
      </Overlay>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          <PressScale scaleTo={0.95} onPress={handleScreenBack} style={s.headerBack}>
            <ArrowLeft size={22} color={P.text} strokeWidth={3} />
          </PressScale>
          <View style={s.minW0}>
            <Text style={s.headerKicker}>Ride</Text>
            <Text style={s.headerTitle} numberOfLines={1}>Where to?</Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.fill} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Input Card */}
        <View style={s.inputCardWrap}>
          <View style={s.inputCard}>
            {/* Pickup Row */}
            <View style={s.fieldRow}>
              <View style={[s.marker, { borderColor: colors.emerald[700] }]}>
                <View style={[s.markerDot, { backgroundColor: colors.emerald[700] }]} />
              </View>
              <Pressable style={s.field} onPress={() => { setActiveInput('pickup'); pickupInputRef.current?.focus(); }}>
                <FieldRing active={activeInput === 'pickup'} focused={focusedInput === 'pickup'} ringColor={colors.emerald[200]} radius={12} />
                <TextInput
                  ref={pickupInputRef}
                  value={pickup}
                  onChangeText={(value) => { setUserTyped(true); setPickup(sanitizeLocationInput(value)); }}
                  onFocus={() => {
                    setActiveInput('pickup');
                    setFocusedInput('pickup');
                  }}
                  onBlur={() => setFocusedInput((current) => (current === 'pickup' ? null : current))}
                  // Typing replaces the shown address instead of appending to it.
                  selectTextOnFocus
                  selection={focusedInput === 'pickup' ? undefined : TEXT_START}
                  placeholder={isResolvingCurrentLocation ? 'Detecting your location...' : 'Your pickup location'}
                  placeholderTextColor={colors.slate[300]}
                  style={s.input}
                />
                {isResolvingCurrentLocation && (
                  <SpinIcon style={s.ml2}><LoaderCircle size={16} color={P.secondary} /></SpinIcon>
                )}
                {!isResolvingCurrentLocation && pickup.length > 0 && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      autoPickupDoneRef.current = true;
                      setUserTyped(true);
                      setPickup('');
                      setPickupCoords(null);
                      setActiveInput('pickup');
                      pickupInputRef.current?.focus();
                    }}
                    style={s.ml2}
                  >
                    <X size={16} color={P.secondary} />
                  </Pressable>
                )}
              </Pressable>
            </View>

            {!pickup && locationError ? (
              <View style={s.locationError}>
                <AlertTriangle size={13} color={colors.rose[500]} style={s.mt2} />
                <Text style={s.locationErrorText}>{locationError}</Text>
              </View>
            ) : null}

            {/* Dotted connector */}
            <DottedConnector />

            {/* Dynamic Stops */}
            {stops.map((stop, idx) => {
              const filled = stop.trim().length > 0;
              return (
                // eslint-disable-next-line react/no-array-index-key
                <AppearView key={`stop-${idx}`} style={s.stopWrap}>
                  <View style={s.fieldRow}>
                    <View style={[s.marker, { borderColor: colors.indigo[500] }]}>
                      <View style={[s.markerDot, { backgroundColor: colors.indigo[500] }]} />
                    </View>
                    <Pressable
                      style={[s.field, filled ? s.stopFilled : s.stopEmpty]}
                      onPress={() => setActiveInput(idx)}
                    >
                      <FieldRing active={activeInput === idx} focused={focusedInput === idx} ringColor={colors.indigo[200]} radius={12} />
                      <TextInput
                        value={stop}
                        selection={focusedInput === idx ? undefined : TEXT_START}
                        autoFocus={activeInput === idx}
                        placeholder={`Stop ${idx + 1} location...`}
                        placeholderTextColor={filled ? colors.slate[300] : colors.indigo[300]}
                        onFocus={() => { setActiveInput(idx); setFocusedInput(idx); }}
                        onBlur={() => setFocusedInput((current) => (current === idx ? null : current))}
                        onChangeText={(value) => { setUserTyped(true); updateStop(idx, sanitizeLocationInput(value)); }}
                        style={s.input}
                      />
                      {stop.length > 0 && (
                        <Pressable hitSlop={8} onPress={() => updateStop(idx, '')} style={s.ml2}>
                          <X size={16} color={colors.indigo[300]} />
                        </Pressable>
                      )}
                    </Pressable>
                    <PressScale scaleTo={0.95} onPress={() => removeStop(idx)} style={s.removeStop}>
                      <Minus size={14} color={colors.rose[500]} strokeWidth={3} />
                    </PressScale>
                  </View>
                  {/* Connector after each stop */}
                  <DottedConnector style={s.mt3} />
                </AppearView>
              );
            })}

            {/* Drop Row */}
            <View style={s.fieldRow}>
              <View style={[s.marker, { borderColor: colors.orange[600] }]}>
                <View style={[s.markerDot, { backgroundColor: colors.orange[600] }]} />
              </View>
              <Pressable style={s.field} onPress={() => setActiveInput('drop')}>
                <FieldRing active={activeInput === 'drop'} focused={focusedInput === 'drop'} ringColor={colors.orange[200]} radius={12} />
                <TextInput
                  value={drop}
                  selection={focusedInput === 'drop' ? undefined : TEXT_START}
                  placeholder="Enter drop location..."
                  placeholderTextColor={colors.slate[300]}
                  onFocus={() => { setActiveInput('drop'); setFocusedInput('drop'); }}
                  onBlur={() => setFocusedInput((current) => (current === 'drop' ? null : current))}
                  onChangeText={(value) => { setUserTyped(true); setDrop(sanitizeLocationInput(value)); }}
                  style={s.input}
                />
                {drop.length > 0 && (
                  <Pressable hitSlop={8} onPress={() => setDrop('')} style={s.ml2}>
                    <X size={16} color={P.secondary} />
                  </Pressable>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* Action Pills */}
        <View style={s.pills}>
          <PressScale scaleTo={0.95} onPress={showMapToast} style={s.pill}>
            <MapPin size={16} color={P.text} />
            <Text style={s.pillText}>Select on map</Text>
          </PressScale>
          <PressScale scaleTo={0.95} onPress={addStop} disabled={stops.length >= MAX_RIDE_STOPS} style={[s.pill, stops.length >= MAX_RIDE_STOPS && s.disabled50]}>
            <View style={s.plusBox}>
              <Plus size={12} color={P.text} strokeWidth={3} />
            </View>
            <Text style={s.pillText}>Add stop {stops.length > 0 ? `(${stops.length})` : ''}</Text>
          </PressScale>
        </View>

        {/* Stop count chips */}
        {stops.length > 0 && (
          <View style={s.chipsWrap}>
            <View style={s.chips}>
              {stops.map((stop, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <View key={idx} style={s.chip}>
                  <View style={s.chipDot} />
                  <Text style={s.chipText} numberOfLines={1}>{stop.trim() || `Stop ${idx + 1}`}</Text>
                  <Pressable hitSlop={8} onPress={() => removeStop(idx)}>
                    <X size={11} color={P.secondary} strokeWidth={3} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Search Results */}
        <View style={s.resultsWrap}>
          <Text style={s.resultsTitle}>{headerTitle}</Text>

          <View style={s.resultsCard}>
            {/* Quick Go to Current Location */}
            <PressScale onPress={handleUseCurrentLocationResult} style={s.currentRow}>
              <View style={s.currentIcon}>
                {isLocating ? (
                  <SpinIcon><LoaderCircle size={18} color="#5B9BD5" /></SpinIcon>
                ) : (
                  <Navigation size={18} color="#5B9BD5" fill="#E8EEF7" />
                )}
              </View>
              <View style={s.flex1}>
                <Text style={s.currentTitle}>Use Current Location</Text>
                <Text style={s.currentSub}>Perfect for accurate pickup</Text>
              </View>
              <ChevronRight size={16} color={P.secondary} />
            </PressScale>

            <LocationOffDialog
              open={Boolean(locationOffReason)}
              reason={locationOffReason}
              onClose={() => setLocationOffReason(null)}
              onRetry={() => {
                setLocationOffReason(null);
                handleUseCurrentLocationResult();
              }}
            />

            {searchResults.map((result, idx) => {
              const distanceText = distanceTextFor(result);
              const hint = areaHintFor(result);
              return (
                <PressScale
                  // eslint-disable-next-line react/no-array-index-key
                  key={idx}
                  onPress={() => handleSelectResult(result)}
                  style={[s.resultRow, idx === searchResults.length - 1 && s.noBorder]}
                >
                  <View style={s.resultIcon}>
                    <MapPin size={18} strokeWidth={2.6} color={P.muted} />
                  </View>
                  <View style={s.minW0}>
                    <Text style={s.resultTitle}>{result.title}</Text>
                    <Text style={s.resultSub} numberOfLines={1}>
                      {distanceText ? `${distanceText} • ` : ''}{hint ? `Near ${hint} • ` : ''}{result.address}
                    </Text>
                  </View>
                </PressScale>
              );
            })}

            {searchResults.length === 0 && (
              <View style={s.empty}>
                {query.trim().length > 0 ? (
                  <>
                    <Text style={s.emptyTitle}>
                      No results for <Text style={s.emptyQuery}>{`"${query}"`}</Text>
                    </Text>
                    <Text style={s.emptySub}>Try a different search term</Text>
                  </>
                ) : (
                  <Text style={s.emptyHint}>
                    {isResolvingCurrentLocation
                      ? 'Finding places near you...'
                      : locationError || 'Search for a location to get started.'}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {tripError ? (
          <View style={s.tripErrorWrap}>
            <View style={s.tripError}>
              <AlertTriangle size={14} color={colors.rose[600]} style={s.mt2} />
              <Text style={s.tripErrorText}>{tripError}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Persistent Confirm Button */}
      {pickup && drop ? (
        <AppearView from={80} style={[s.confirmFloating, { bottom: insets.bottom + 24 }]}>
          <PressScale scaleTo={0.98} onPress={() => handleConfirmNavigate()} style={s.proceedButton}>
            <Text style={s.proceedText}>{"Confirm & Proceed"}</Text>
            <ChevronRight size={18} strokeWidth={3} color={P.ink} style={s.chevronFaded} />
          </PressScale>
        </AppearView>
      ) : null}
    </Screen>
  );
};

// Taxi customer palette (Taxi/index.css --user-* variables, light / dark). The `.user-app-theme` overrides map the
// screen's Tailwind classes onto it: bg-white(/70..95) / bg-slate-50 / bg-slate-900 -> card, tinted 50/100 backgrounds ->
// card-soft, text-slate-900 / text-white -> text, text-slate-300/400/600/700 -> secondary, text-slate-500 -> muted, light
// borders -> border, button.bg-slate-900 -> accent button, inputs: focus = accent border + ring; font-bold -> 600.
const taxiPalette = (t) => (t.dark
  ? { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', secondary: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)', accent: '#FFC400', ink: '#0B1220' }
  : { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', secondary: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)', accent: '#FFC400', ink: '#0B1220' });

const themeShadow = { elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const useStyles = makeStyles((t) => {
  const P = taxiPalette(t);
  return {
    fill: { flex: 1 },
    flex1: { flex: 1 },
    minW0: { flex: 1, minWidth: 0 },
    center: { alignItems: 'center', justifyContent: 'center' },
    mt2: { marginTop: 2 },
    mt3: { marginTop: sp(3) },
    ml2: { marginLeft: sp(2), flexShrink: 0 },
    disabled50: { opacity: 0.5 },
    noBorder: { borderBottomWidth: 0 },
    scrollContent: { paddingBottom: sp(6) },

    // header
    header: {
      backgroundColor: P.card, borderBottomWidth: 1, borderBottomColor: alpha('#ffffff', 0.7), zIndex: 30,
      elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 10 },
    },
    headerRow: { paddingHorizontal: sp(5), paddingVertical: sp(4), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    headerBack: { padding: sp(2), marginLeft: -sp(2), borderRadius: 999 },
    headerKicker: { fontSize: 10, lineHeight: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: P.secondary },
    headerTitle: { marginTop: 2, fontSize: 20, lineHeight: 20, fontWeight: '600', color: P.text, letterSpacing: -0.5 },

    // input card
    inputCardWrap: { paddingHorizontal: sp(5), paddingTop: sp(4), zIndex: 10 },
    inputCard: {
      backgroundColor: P.card, borderRadius: 22, padding: sp(4), borderWidth: 1, borderColor: P.border, gap: sp(3),
      elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 18 },
    },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    marker: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, backgroundColor: P.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    markerDot: { width: 6, height: 6, borderRadius: 3 },
    field: {
      flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: P.card, borderWidth: 1, borderColor: P.border, borderRadius: 12,
      paddingHorizontal: sp(3), paddingVertical: sp(2.5),
    },
    stopFilled: {
      backgroundColor: P.card, borderColor: colors.indigo[200],
      elevation: 3, shadowColor: '#6366f1', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 10 },
    },
    stopEmpty: { backgroundColor: P.soft, borderColor: alpha(colors.indigo[100], 0.7) },
    input: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500', color: P.text, paddingVertical: 0 },
    stopWrap: { marginHorizontal: -4, paddingHorizontal: 4, paddingTop: 4 },
    removeStop: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: P.soft, borderWidth: 1, borderColor: colors.rose[100], alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    locationError: { marginLeft: sp(8), flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    locationErrorText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600', color: colors.rose[500] },
    connector: { marginLeft: 9, height: 8, width: 1.5, justifyContent: 'space-between' },
    connectorDot: { width: 1.5, height: 1.5, borderRadius: 1, backgroundColor: alpha(colors.slate[300], 0.7) },

    // pills
    pills: { flexDirection: 'row', gap: sp(3), paddingHorizontal: sp(5), marginVertical: sp(4), zIndex: 10 },
    pill: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2), backgroundColor: P.card, borderWidth: 1, borderColor: P.border,
      borderRadius: 999, paddingVertical: sp(2.5), elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 13, shadowOffset: { width: 0, height: 12 },
    },
    pillText: { fontSize: 13, lineHeight: 19.5, fontWeight: '600', color: P.text },
    plusBox: { width: 16, height: 16, borderRadius: 4, backgroundColor: colors.indigo[500], alignItems: 'center', justifyContent: 'center' },

    // chips
    chipsWrap: { paddingHorizontal: sp(5), marginBottom: sp(2), zIndex: 10 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: P.card, borderWidth: 1, borderColor: P.border, borderRadius: 999,
      paddingHorizontal: sp(3), paddingVertical: sp(1), ...themeShadow,
    },
    chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.indigo[400] },
    chipText: { maxWidth: 110, fontSize: 12, lineHeight: 18, fontWeight: '600', color: P.secondary },

    // results
    resultsWrap: { paddingHorizontal: sp(5), marginBottom: sp(4), paddingBottom: sp(20), zIndex: 10 },
    resultsTitle: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: P.secondary, marginBottom: sp(3), marginLeft: sp(1), textTransform: 'uppercase', letterSpacing: 1.4 },
    resultsCard: {
      backgroundColor: P.card, borderRadius: 16, borderWidth: 1, borderColor: P.border, overflow: 'hidden',
      elevation: 5, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 17, shadowOffset: { width: 0, height: 14 },
    },
    currentRow: {
      flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3.5),
      borderBottomWidth: 1, borderBottomColor: alpha('#ffffff', 0.7), backgroundColor: alpha('#E8EEF7', 0.5),
    },
    currentIcon: {
      width: 40, height: 40, borderRadius: 16, backgroundColor: P.card, borderWidth: 1, borderColor: alpha('#5B9BD5', 0.3),
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...themeShadow,
    },
    currentTitle: { fontSize: 15, lineHeight: 18.75, fontWeight: '600', color: P.text },
    currentSub: { marginTop: 2, fontSize: 12, lineHeight: 18, fontWeight: '500', color: P.secondary },
    resultRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3),
      borderBottomWidth: 1, borderBottomColor: alpha('#ffffff', 0.7),
    },
    resultIcon: {
      marginTop: 2, width: 40, height: 40, borderRadius: 16, backgroundColor: P.card, borderWidth: 1, borderColor: P.border,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...themeShadow,
    },
    resultTitle: { fontSize: 15, lineHeight: 18.75, fontWeight: '600', color: P.text },
    resultSub: { marginTop: sp(1), fontSize: 13, lineHeight: 19.5, fontWeight: '500', color: P.muted },
    empty: { alignItems: 'center', paddingVertical: sp(10), paddingHorizontal: sp(4) },
    emptyTitle: { fontSize: 15, lineHeight: 22.5, fontWeight: '600', color: P.secondary, textAlign: 'center' },
    emptyQuery: { color: P.text },
    emptySub: { marginTop: sp(1), fontSize: 13, lineHeight: 19.5, fontWeight: '500', color: P.secondary, textAlign: 'center' },
    emptyHint: { fontSize: 13, lineHeight: 19.5, fontWeight: '500', color: P.secondary, textAlign: 'center' },
    tripErrorWrap: { paddingHorizontal: sp(5), marginBottom: sp(24), zIndex: 10 },
    tripError: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: 12, backgroundColor: P.soft, borderWidth: 1, borderColor: colors.rose[100],
      paddingHorizontal: sp(3), paddingVertical: sp(2),
    },
    tripErrorText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600', color: colors.rose[600] },

    // floating confirm
    confirmFloating: { position: 'absolute', left: sp(5), right: sp(5), zIndex: 40 },
    proceedButton: {
      width: '100%', backgroundColor: '#f8e001', paddingVertical: sp(4), borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2),
      elevation: 8, shadowColor: '#f8e001', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 8 },
    },
    proceedText: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: P.ink },
    chevronFaded: { opacity: 0.6 },

    // map picker
    mapArea: { flex: 1, backgroundColor: P.soft },
    mapHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: sp(5), paddingBottom: sp(4) },
    mapHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    mapBack: {
      width: 40, height: 40, backgroundColor: P.card, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P.border, ...themeShadow,
    },
    mapAddressCard: { flex: 1, minWidth: 0, backgroundColor: P.card, borderRadius: 16, borderWidth: 1, borderColor: P.border, paddingHorizontal: sp(4), paddingVertical: sp(3), ...themeShadow },
    mapAddressLabel: { fontSize: 10, lineHeight: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: P.secondary, marginBottom: 2 },
    mapAddressText: { fontSize: 14, lineHeight: 17.5, fontWeight: '600', color: P.text },
    mapStateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: P.soft, paddingHorizontal: sp(6) },
    mapStateCard: { borderRadius: 24, backgroundColor: P.card, paddingHorizontal: sp(8), paddingVertical: sp(10), borderWidth: 1, borderColor: P.border, alignItems: 'center', ...themeShadow },
    mapStateIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: P.soft, alignItems: 'center', justifyContent: 'center', marginBottom: sp(4) },
    mapStateTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: P.text, textAlign: 'center' },
    mapStateText: { marginTop: sp(2), fontSize: 13, lineHeight: 19.5, fontWeight: '500', color: P.muted, textAlign: 'center' },
    mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: sp(4), backgroundColor: P.card },
    mapLoadingText: { fontSize: 12, lineHeight: 18, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 2.4, color: P.secondary },
    centerPinAnchor: { position: 'absolute', top: '50%', left: '50%', zIndex: 10 },
    centerPinBox: { transform: [{ translateX: -20 }, { translateY: -56 }], width: 40, height: 56, alignItems: 'center' },
    centerPinBody: { alignItems: 'center' },
    centerPinHead: {
      width: 40, height: 40, backgroundColor: P.card, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: P.border,
      transform: [{ rotate: '45deg' }], ...themeShadow,
    },
    unrotate: { transform: [{ rotate: '-45deg' }] },
    centerPinStick: { width: 4, height: 20, backgroundColor: P.card, marginTop: -8, ...themeShadow },
    centerPinShadow: { position: 'absolute', bottom: -4, alignSelf: 'center', width: 8, height: 4, borderRadius: 4, backgroundColor: alpha('#000000', 0.3) },
    fab: {
      position: 'absolute', bottom: sp(6), right: sp(5), width: 48, height: 48, backgroundColor: P.card, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: P.border, zIndex: 20, ...themeShadow,
    },
    confirmArea: { paddingHorizontal: sp(5), paddingTop: sp(4), backgroundColor: P.card, borderTopWidth: 1, borderTopColor: P.border, gap: sp(4) },
    confirmRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingVertical: sp(1), paddingHorizontal: sp(1) },
    confirmIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: P.card, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    confirmTitle: { fontSize: 15, lineHeight: 15, fontWeight: '600', color: P.text },
    confirmAddress: { marginTop: sp(1), fontSize: 12, lineHeight: 18, fontWeight: '500', color: P.secondary },
    confirmButton: {
      width: '100%', backgroundColor: P.accent, paddingVertical: sp(4), borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2),
      ...themeShadow,
    },
    confirmButtonText: { fontSize: 15, lineHeight: 22.5, fontWeight: '600', color: P.ink },
  };
});

export default SelectLocation;
