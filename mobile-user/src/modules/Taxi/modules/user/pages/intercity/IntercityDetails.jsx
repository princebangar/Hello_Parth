import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Navigation, ChevronRight, LoaderCircle, AlertTriangle, X, Check, MapPinned, Search } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Overlay, Screen, Text, TextInput } from '@/native/ui';
import { AppMap, regionFor } from '@/native/ui/AppMap';
import { makeStyles, useTheme } from '@/theme';
import { cleanGroundAddress } from '../../utils/preciseLocation';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER } from '../../../admin/utils/googleMaps';
import { createPlacesAutocomplete, googleMapsCompat } from '../../../../../../shared/maps/placesCompat';
import api from '../../../../shared/api/axiosInstance';

// The web hands window.google to this logic; natively the same classes come from placesCompat.
const google = googleMapsCompat;

// Taxi/index.css `.user-app-theme` palette (the web remaps slate / white classes to these in both themes).
const userTokens = (dark) => ({
  bg: dark ? '#0a0a0a' : '#F1F4F9',
  card: dark ? '#141414' : '#FFFFFF',
  soft: dark ? '#1c1c1c' : '#E9EDF4',
  text: dark ? '#FFFFFF' : '#0B1220',
  text2: dark ? '#CBD5E1' : '#475569',
  muted: dark ? '#94A3B8' : '#64748B',
  border: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
  accent: '#FFC400',
});
const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const CITY_CENTERS = {
  Indore: { lat: 22.7196, lng: 75.8577 },
  Bhopal: { lat: 23.2599, lng: 77.4126 },
  Ujjain: { lat: 23.1765, lng: 75.7885 },
  Jabalpur: { lat: 23.1815, lng: 79.9864 },
  Ratlam: { lat: 23.3315, lng: 75.0367 },
  Dewas: { lat: 22.9676, lng: 76.0534 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Delhi: { lat: 28.6139, lng: 77.209 },
  Pune: { lat: 18.5204, lng: 73.8567 },
};

const getCityCenter = (city) => CITY_CENTERS[city] || INDIA_CENTER;
const getCityCoords = (city) => {
  const center = getCityCenter(city);
  return [center.lng, center.lat];
};
const unwrapApiPayload = (response) => response?.data?.data || response?.data || response || {};
const normalizeSuggestionKey = (result) =>
  `${String(result?.title || '').trim().toLowerCase()}|${String(result?.address || '').trim().toLowerCase()}`;
const MAP_REVERSE_GEOCODE_DEBOUNCE_MS = 450;
const getLatLngCacheKey = (coords, precision = 5) =>
  `${Number(coords?.lat || 0).toFixed(precision)},${Number(coords?.lng || 0).toFixed(precision)}`;

const generateIntercityBookingId = () =>
  'IC-' + Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');

const generateSearchNonce = () =>
  `intercity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const Tap = ({ scale = 0.95, style, children, ...rest }) => (
  <Pressable {...rest} style={({ pressed }) => [typeof style === 'function' ? style({ pressed }) : style, pressed && { transform: [{ scale }] }]}>
    {children}
  </Pressable>
);

function Spinner({ size, color, strokeWidth }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <LoaderCircle size={size} color={color} strokeWidth={strokeWidth} />
    </Animated.View>
  );
}

/**
 * <Autocomplete> of @react-google-maps/api wrapped around an <input>: Google drew its suggestion list under the field
 * and fired onPlaceChanged when one was picked. Natively the same widget object comes from placesCompat (headless), and
 * this draws its list under the field.
 */
function PlacesAutocompleteField({ onLoad, onPlaceChanged, options, value, onChangeText, inputStyle, focusStyle, placeholder }) {
  const s = useStyles();
  const [widget] = useState(() => createPlacesAutocomplete(null, options));
  const [predictions, setPredictions] = useState([]);
  const [focused, setFocused] = useState(false);
  const placeChangedRef = useRef(onPlaceChanged);
  placeChangedRef.current = onPlaceChanged;

  useEffect(() => {
    onLoad?.(widget);
    const listener = widget.addListener('place_changed', () => placeChangedRef.current?.());
    return () => {
      listener.remove();
      widget.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        value={value}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(text) => {
          onChangeText(text);
          widget.search(text, setPredictions);
        }}
        style={[inputStyle, focused ? focusStyle : null]}
      />
      {focused && predictions.length > 0 ? (
        <View style={s.pacContainer}>
          {predictions.map((item) => (
            <Pressable
              key={item.place_id || item.description}
              onPress={() => {
                setPredictions([]);
                widget.choose(item);
              }}
              style={({ pressed }) => [s.pacItem, pressed && { backgroundColor: '#ebf2fe' }]}
            >
              <MapPin size={14} color="#9ca3af" />
              <Text numberOfLines={1} style={s.pacText}>
                <Text style={s.pacMain}>{item.structured_formatting?.main_text || item.description}</Text>
                {item.structured_formatting?.secondary_text ? ` ${item.structured_formatting.secondary_text}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const IntercityDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const state = location.state || {};
  const { fromCity, toCity, vehicle } = state;

  const [pickup, setPickup] = useState(state.pickupAddress || '');
  const [drop, setDrop] = useState(state.destinationAddress || '');
  const [pickupCoords, setPickupCoords] = useState(state.pickupCoords || null);
  const [dropCoords, setDropCoords] = useState(state.destinationCoords || null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [activeMapField, setActiveMapField] = useState('pickup');
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [pickedAddress, setPickedAddress] = useState('Move the map to choose a location');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [mapSearchInput, setMapSearchInput] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [isSearchingMapLocations, setIsSearchingMapLocations] = useState(false);
  const [focusedField, setFocusedField] = useState('');
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);
  const geocoderRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const mapSearchCacheRef = useRef(new Map());
  const latestMapSearchRef = useRef(0);
  const reverseGeocodeTimerRef = useRef(null);
  const reverseGeocodeCacheRef = useRef(new Map());
  const placeSelectionCacheRef = useRef(new Map());
  // No script to load natively: the map and the Places classes are always available.
  const isLoaded = true;

  const [autocompletePickup, setAutocompletePickup] = useState(null);
  const [autocompleteDrop, setAutocompleteDrop] = useState(null);
  const [liveDriverCount, setLiveDriverCount] = useState(0);
  const [isFetchingDrivers, setIsFetchingDrivers] = useState(false);
  const [driverFetchError, setDriverFetchError] = useState('');
  const [isProceeding, setIsProceeding] = useState(false);
  const serviceLocationId = useMemo(
    () => state.serviceLocationId || state.selectedPackages?.[0]?.serviceLocationId || '',
    [state.serviceLocationId, state.selectedPackages]
  );

  const effectivePickupCoords = useMemo(
    () => pickupCoords || state.pickupCoords || getCityCoords(fromCity),
    [fromCity, pickupCoords, state.pickupCoords]
  );

  // Pin bounce while the map moves (motion.div animate={{ y: -15 }} spring)
  const pinLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pinLift, { toValue: isDragging || isGeocoding ? -15 : 0, stiffness: 300, damping: 20, mass: 1, useNativeDriver: true }).start();
  }, [isDragging, isGeocoding, pinLift]);

  useEffect(() => {
    if (!fromCity || !vehicle) {
      navigate(`${routePrefix}/intercity`, { replace: true });
    }
  }, [fromCity, navigate, routePrefix, vehicle]);

  useEffect(() => {
    if (!isLoaded || !google?.maps?.places?.AutocompleteService) {
      return;
    }

    autocompleteServiceRef.current = autocompleteServiceRef.current || new google.maps.places.AutocompleteService();
    placesServiceRef.current = placesServiceRef.current || new google.maps.places.PlacesService(null);
    autocompleteSessionTokenRef.current = autocompleteSessionTokenRef.current
      || new google.maps.places.AutocompleteSessionToken();
  }, [isLoaded]);

  useEffect(() => {
    let active = true;

    const loadNearbyDrivers = async () => {
      if (!vehicle?.vehicleTypeId || !Array.isArray(effectivePickupCoords)) {
        if (active) {
          setLiveDriverCount(0);
          setDriverFetchError('');
          setIsFetchingDrivers(false);
        }
        return;
      }

      try {
        if (active) {
          setIsFetchingDrivers(true);
          setDriverFetchError('');
        }

        const response = await api.get('/rides/available-drivers', {
          params: {
            vehicleTypeId: vehicle.vehicleTypeId,
            vehicleIconType: vehicle.iconType || vehicle.name || 'car',
            lng: effectivePickupCoords[0],
            lat: effectivePickupCoords[1],
            service_location_id: serviceLocationId,
            transport_type: 'intercity',
          },
        });

        if (!active) {
          return;
        }

        const availability = unwrapApiPayload(response);
        setLiveDriverCount(Number(availability?.totalDrivers || 0));
      } catch (error) {
        if (!active) {
          return;
        }

        setLiveDriverCount(0);
        setDriverFetchError(error?.message || 'Could not fetch live driver availability.');
      } finally {
        if (active) {
          setIsFetchingDrivers(false);
        }
      }
    };

    loadNearbyDrivers();

    return () => {
      active = false;
    };
  }, [effectivePickupCoords, serviceLocationId, vehicle]);

  // The web map follows its `center` prop; natively the camera is moved to the new center.
  useEffect(() => {
    if (!showMapPicker || !mapInstanceRef.current) return;
    mapInstanceRef.current.animateCamera({ center: { latitude: mapCenter.lat, longitude: mapCenter.lng } }, { duration: 300 });
  }, [mapCenter, showMapPicker]);

  useEffect(() => () => {
    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!showMapPicker || !mapSearchInput.trim() || mapSearchInput.trim().length < 3 || !HAS_VALID_GOOGLE_MAPS_KEY || !autocompleteServiceRef.current) {
      setMapSearchResults([]);
      setIsSearchingMapLocations(false);
      return;
    }

    const normalizedQuery = `${activeMapField}:${mapSearchInput.trim().toLowerCase()}`;
    const cached = mapSearchCacheRef.current.get(normalizedQuery);
    if (cached) {
      setMapSearchResults(cached);
      setIsSearchingMapLocations(false);
      return;
    }

    const requestId = latestMapSearchRef.current + 1;
    latestMapSearchRef.current = requestId;
    setIsSearchingMapLocations(true);

    const timeoutId = setTimeout(() => {
      const city = activeMapField === 'pickup' ? fromCity : toCity;

      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: mapSearchInput.trim(),
          componentRestrictions: { country: 'in' },
          sessionToken: getAutocompleteSessionToken(),
          ...(city ? { locationBias: { center: getCityCenter(city), radius: 30000 } } : {}),
        },
        (predictions = [], status) => {
          if (latestMapSearchRef.current !== requestId) {
            return;
          }

          const nextResults = status === 'OK'
            ? predictions.slice(0, 6).map((prediction) => ({
              title: prediction.structured_formatting?.main_text || prediction.description,
              address: prediction.description,
              placeId: prediction.place_id,
            }))
            : [];

          mapSearchCacheRef.current.set(normalizedQuery, nextResults);
          setMapSearchResults(nextResults);
          setIsSearchingMapLocations(false);
        },
      );
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapField, fromCity, mapSearchInput, showMapPicker, toCity]);

  if (!fromCity || !vehicle) {
    return null;
  }

  const handleContinue = async () => {
    if (!pickup.trim() || !drop.trim()) {
      Alert.alert('', 'Please enter both exact pickup and drop locations within the selected cities.');
      return;
    }

    const nextPickupCoords = pickupCoords || getCityCoords(fromCity);
    const nextDropCoords = dropCoords || getCityCoords(toCity);
    const bookingId = state.bookingId || generateIntercityBookingId();
    let availabilitySnapshot = {
      totalDrivers: liveDriverCount,
      fetchedAt: new Date().toISOString(),
    };

    if (vehicle?.vehicleTypeId && Array.isArray(nextPickupCoords)) {
      try {
        setIsProceeding(true);
        setDriverFetchError('');
        const response = await api.get('/rides/available-drivers', {
          params: {
            vehicleTypeId: vehicle.vehicleTypeId,
            vehicleIconType: vehicle.iconType || vehicle.name || 'car',
            lng: nextPickupCoords[0],
            lat: nextPickupCoords[1],
            service_location_id: serviceLocationId,
            transport_type: 'intercity',
          },
        });
        const availability = unwrapApiPayload(response);

        availabilitySnapshot = {
          ...availability,
          totalDrivers: Number(availability?.totalDrivers || 0),
          fetchedAt: new Date().toISOString(),
        };
        setLiveDriverCount(Number(availability?.totalDrivers || 0));
      } catch (error) {
        setDriverFetchError(error?.message || 'Could not fetch live driver availability.');
      } finally {
        setIsProceeding(false);
      }
    }

    const nextState = {
      ...state,
      bookingId,
      pickup,
      drop,
      pickupCoords: nextPickupCoords,
      dropCoords: nextDropCoords,
      searchNonce: generateSearchNonce(),
      vehicleTypeId: vehicle.vehicleTypeId || '',
      vehicleIconType: vehicle.iconType || vehicle.name || 'car',
      vehicleIconUrl: vehicle.vehicleIconUrl || vehicle.icon || '',
      paymentMethod: 'Cash',
      serviceType: 'intercity',
      transport_type: 'intercity',
      bookingMode: vehicle.supportsBidding ? 'bidding' : (state.bookingMode || 'normal'),
      bidStepAmount: Number(state.bidStepAmount || 10),
      userMaxBidFare: vehicle.supportsBidding
        ? Number(state.userMaxBidFare || state.fare || 0)
        : Number(state.fare || 0),
      intercity: {
        bookingId,
        fromCity,
        toCity,
        tripType: state.tripType || 'One Way',
        travelDate: state.date || 'Ride Now',
        passengers: state.passengers || 1,
        distance: Number(state.distance || 0),
        vehicleName: vehicle.name || vehicle.id || 'Intercity Cab',
        packageId: vehicle.packageId || '',
        packageTypeName: vehicle.packageTypeName || 'Intercity',
      },
      driverAvailability: availabilitySnapshot,
    };

    if (state.rideMode === 'schedule' && state.scheduledAt) {
      navigate(`${routePrefix}/intercity/confirm`, {
        state: nextState,
      });
      return;
    }

    navigate(`${routePrefix}/ride/searching`, {
      state: {
        ...nextState,
      }
    });
  };

  const handlePickupPlaceChanged = () => {
    if (autocompletePickup) {
      const place = autocompletePickup.getPlace();
      if (place && place.formatted_address) {
        setPickup(place.formatted_address);
        if (place.geometry) {
          setPickupCoords([place.geometry.location.lng(), place.geometry.location.lat()]);
        }
      }
    }
  };

  const handleDropPlaceChanged = () => {
    if (autocompleteDrop) {
      const place = autocompleteDrop.getPlace();
      if (place && place.formatted_address) {
        setDrop(place.formatted_address);
        if (place.geometry) {
          setDropCoords([place.geometry.location.lng(), place.geometry.location.lat()]);
        }
      }
    }
  };

  function getAutocompleteSessionToken() {
    if (!google?.maps?.places?.AutocompleteSessionToken) {
      return null;
    }

    if (!autocompleteSessionTokenRef.current) {
      autocompleteSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }

    return autocompleteSessionTokenRef.current;
  }

  const resetAutocompleteSessionToken = () => {
    if (!google?.maps?.places?.AutocompleteSessionToken) {
      autocompleteSessionTokenRef.current = null;
      return;
    }

    autocompleteSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
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

  const getPlacesService = () => {
    if (!google?.maps?.places?.PlacesService) {
      return null;
    }

    if (!placesServiceRef.current) {
      placesServiceRef.current = new google.maps.places.PlacesService(null);
    }

    return placesServiceRef.current;
  };

  const resolveSuggestionSelection = async (result) => {
    const cacheKey = String(result?.placeId || normalizeSuggestionKey(result));
    if (cacheKey) {
      const cached = placeSelectionCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
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
              const resolvedResult = {
                title: result.title || place.name || place.formatted_address,
                address: cleanGroundAddress(place.formatted_address) || result.address || result.title || '',
                coords: [placeLocation.lng(), placeLocation.lat()],
              };
              if (cacheKey) {
                placeSelectionCacheRef.current.set(cacheKey, resolvedResult);
              }
              resolve(resolvedResult);
              return;
            }

            if (!geocoder || !result.placeId) {
              resolve(null);
              return;
            }

            geocoder.geocode({ placeId: result.placeId }, (results, geocodeStatus) => {
              const geocodedPlace = results?.[0];
              const geocodedLocation = geocodedPlace?.geometry?.location;

              if (geocodeStatus === 'OK' && geocodedLocation) {
                const resolvedResult = {
                  title: result.title || geocodedPlace.formatted_address,
                  address: cleanGroundAddress(geocodedPlace.formatted_address) || result.address || result.title || '',
                  coords: [geocodedLocation.lng(), geocodedLocation.lat()],
                };
                if (cacheKey) {
                  placeSelectionCacheRef.current.set(cacheKey, resolvedResult);
                }
                resolve(resolvedResult);
                return;
              }

              resolve(null);
            });
          },
        );
      });
    }

    if (!geocoder || !result?.address) {
      return null;
    }

    return new Promise((resolve) => {
      geocoder.geocode({ address: result.address }, (results, status) => {
        const place = results?.[0];
        const placeLocation = place?.geometry?.location;

        if (status === 'OK' && placeLocation) {
          const resolvedResult = {
            title: result.title || place.formatted_address,
            address: cleanGroundAddress(place.formatted_address) || result.address || result.title || '',
            coords: [placeLocation.lng(), placeLocation.lat()],
          };
          if (cacheKey) {
            placeSelectionCacheRef.current.set(cacheKey, resolvedResult);
          }
          resolve(resolvedResult);
          return;
        }

        resolve(null);
      });
    });
  };

  const openMapPicker = (field) => {
    const savedCoords = field === 'pickup' ? pickupCoords : dropCoords;
    const savedAddress = field === 'pickup' ? pickup : drop;
    const cityCenter = getCityCenter(field === 'pickup' ? fromCity : toCity);
    const center = Array.isArray(savedCoords)
      ? { lat: savedCoords[1], lng: savedCoords[0] }
      : cityCenter;

    setActiveMapField(field);
    setMapCenter(center);
    lastCenterRef.current = center;
    setPickedAddress(savedAddress || (field === 'pickup' ? `${fromCity} location` : toCity));
    setMapSearchInput(savedAddress || '');
    setMapSearchResults([]);
    setIsSearchingMapLocations(false);
    setShowMapPicker(true);
  };

  // onIdle of the web map: the region the map came to rest on
  const handleMapIdle = (region) => {
    if (!region || !google?.maps?.Geocoder) return;

    const lat = region.latitude;
    const lng = region.longitude;
    const diff = Math.abs(lat - lastCenterRef.current.lat) + Math.abs(lng - lastCenterRef.current.lng);

    if (diff < 0.00001) {
      setIsDragging(false);
      return;
    }

    lastCenterRef.current = { lat, lng };
    setIsDragging(false);
    const cacheKey = getLatLngCacheKey({ lat, lng });
    const cached = reverseGeocodeCacheRef.current.get(cacheKey);
    if (cached) {
      setPickedAddress(cached);
      return;
    }

    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }

    reverseGeocodeTimerRef.current = setTimeout(() => {
      const geocoder = getGeocoder();
      if (!geocoder) {
        setPickedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        return;
      }

      setIsGeocoding(true);
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        setIsGeocoding(false);
        if (status === 'OK' && results?.[0]) {
          reverseGeocodeCacheRef.current.set(cacheKey, cleanGroundAddress(results[0].formatted_address));
          setPickedAddress(cleanGroundAddress(results[0].formatted_address));
          return;
        }

        setPickedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      });
    }, MAP_REVERSE_GEOCODE_DEBOUNCE_MS);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const nextCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapInstanceRef.current) {
          mapInstanceRef.current.animateCamera({ center: { latitude: nextCenter.lat, longitude: nextCenter.lng }, zoom: 17 }, { duration: 400 });
        } else {
          setMapCenter(nextCenter);
        }
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true }
    );
  };

  const handleMapSearchSuggestionSelect = async (result) => {
    const resolvedResult = await resolveSuggestionSelection(result);
    if (!resolvedResult?.coords) {
      return;
    }

    const [lng, lat] = resolvedResult.coords;
    const nextCenter = { lat, lng };
    lastCenterRef.current = nextCenter;
    setMapCenter(nextCenter);
    setPickedAddress(resolvedResult.address);
    setMapSearchInput(resolvedResult.address);
    setMapSearchResults([]);
    resetAutocompleteSessionToken();

    if (mapInstanceRef.current) {
      mapInstanceRef.current.animateCamera({ center: { latitude: nextCenter.lat, longitude: nextCenter.lng }, zoom: 17 }, { duration: 400 });
    }
  };

  const handleConfirmMapLocation = () => {
    const selectedCoords = [lastCenterRef.current.lng, lastCenterRef.current.lat];

    if (activeMapField === 'pickup') {
      setPickup(pickedAddress);
      setPickupCoords(selectedCoords);
    } else {
      setDrop(pickedAddress);
      setDropCoords(selectedCoords);
    }

    setShowMapPicker(false);
  };

  const mapTopPad = Math.max(48, insets.top + 16);

  return (
    <Screen edges={['bottom']} bg={u.bg} keyboard>
      <Overlay open={showMapPicker} onClose={() => setShowMapPicker(false)} style={{ backgroundColor: u.card }}>
        <View style={{ flex: 1 }}>
          <View style={StyleSheet.absoluteFill}>
            {!HAS_VALID_GOOGLE_MAPS_KEY ? (
              <View style={s.mapState}>
                <View style={s.mapStateCard}>
                  <View style={s.mapStateIcon}>
                    <X size={32} color="#fb7185" />
                  </View>
                  <Text style={s.mapStateTitle}>Map Key Missing</Text>
                  <Text style={s.mapStateText}>Add a valid maps key to select locations on the map.</Text>
                </View>
              </View>
            ) : (
              <AppMap
                ref={mapInstanceRef}
                style={StyleSheet.absoluteFill}
                initialRegion={regionFor(mapCenter, 15)}
                onPanDrag={() => setIsDragging(true)}
                onRegionChangeComplete={handleMapIdle}
              />
            )}

            {/* Pin Overlay */}
            <View pointerEvents="none" style={s.pinWrap}>
              <Animated.View style={{ alignItems: 'center', transform: [{ translateY: pinLift }] }}>
                <View style={s.pinHead}>
                  <MapPinned size={20} color="#ffffff" />
                </View>
                <View style={s.pinStick} />
              </Animated.View>
              <View style={s.pinShadow} />
            </View>

            <Pressable
              onPress={handleUseCurrentLocation}
              disabled={isLocating}
              style={({ pressed }) => [s.locateButton, isLocating ? { opacity: 0.7 } : null, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              {isLocating ? <Spinner size={24} color="#3b82f6" /> : <Navigation size={24} color={u.text} />}
            </Pressable>
          </View>

          <LinearGradient
            colors={['#ffffff', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
            style={[s.mapTop, { paddingTop: mapTopPad }]}
          >
            <View style={s.mapTopRow}>
              <Tap scale={0.9} onPress={() => setShowMapPicker(false)} style={s.squareButton}>
                <ArrowLeft size={20} color={u.text} strokeWidth={2.5} />
              </Tap>
              <View style={s.mapAddressCard}>
                <Text style={s.mapAddressLabel}>
                  {(activeMapField === 'pickup' ? `Pickup in ${fromCity}` : `Drop in ${toCity}`).toUpperCase()}
                </Text>
                <Text numberOfLines={1} style={s.mapAddressText}>
                  {isGeocoding ? 'Finding exact address...' : pickedAddress}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 16 }}>
              <Text style={s.manualLabel}>EDIT LOCATION MANUALLY</Text>
              <View style={s.manualBox}>
                <View style={s.manualRow}>
                  <Search size={16} color={u.text2} />
                  <TextInput
                    value={mapSearchInput}
                    onChangeText={setMapSearchInput}
                    placeholder={activeMapField === 'pickup' ? 'Search pickup address' : 'Search drop address'}
                    placeholderTextColor="#94a3b8"
                    style={s.manualInput}
                  />
                </View>
                {(isSearchingMapLocations || mapSearchResults.length > 0) ? (
                  <View style={s.resultsWrap}>
                    {isSearchingMapLocations ? (
                      <View style={s.searchingRow}>
                        <Spinner size={14} color="#3b82f6" />
                        <Text style={s.searchingText}>Searching suggestions...</Text>
                      </View>
                    ) : null}
                    {mapSearchResults.map((result) => (
                      <Pressable
                        key={normalizeSuggestionKey(result)}
                        onPress={() => handleMapSearchSuggestionSelect(result)}
                        style={s.resultRow}
                      >
                        <MapPin size={15} color="#3b82f6" style={{ marginTop: 2 }} />
                        <View style={{ minWidth: 0, flex: 1 }}>
                          <Text numberOfLines={1} style={s.resultTitle}>{result.title}</Text>
                          <Text style={s.resultAddress}>{result.address}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
            {activeMapField === 'drop' && (
              <View style={s.initialDestination}>
                <Text style={s.initialDestinationLabel}>INITIAL DESTINATION</Text>
                <Text numberOfLines={1} style={s.initialDestinationText}>{toCity}</Text>
              </View>
            )}
          </LinearGradient>
        </View>

        <View style={[s.mapBottom, { paddingBottom: 48 + insets.bottom }]}>
          <View style={s.confirmRow}>
            <View style={s.confirmIcon}>
              <MapPin size={24} color="#2563eb" />
            </View>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={s.confirmTitle}>Confirm Spot</Text>
              <Text numberOfLines={1} style={s.confirmAddress}>{pickedAddress}</Text>
            </View>
          </View>
          <Tap
            scale={0.98}
            onPress={handleConfirmMapLocation}
            disabled={isGeocoding}
            style={[s.blueButton, isGeocoding ? { opacity: 0.4 } : null]}
          >
            <Check size={20} strokeWidth={3} color={u.text} />
            <Text style={s.blueButtonText}>CONFIRM LOCATION</Text>
          </Tap>
        </View>
      </Overlay>

      {/* Main UI */}
      <View style={[s.header, { paddingTop: Math.max(48, insets.top + 16) }]}>
        <Tap scale={0.9} onPress={() => navigate(-1)} style={s.squareButton}>
          <ArrowLeft size={20} color={u.text} strokeWidth={2.5} />
        </Tap>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle}>Location Details</Text>
          <Text numberOfLines={1} style={s.headerSub}>{`${fromCity} → ${toCity}`.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 288 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Address Entry Card */}
        <View style={s.addressCard}>
          {/* Vertical dash line */}
          <View pointerEvents="none" style={s.dashLine} />

          {/* Pickup Section */}
          <View style={{ marginBottom: 40, zIndex: 2 }}>
            <Text style={[s.fieldLabel, { color: '#2563eb' }]}>{`PICKUP IN ${String(fromCity).toUpperCase()}`}</Text>
            <View style={s.fieldRow}>
              <View style={[s.fieldDot, { borderColor: '#dbeafe' }]}>
                <View style={s.pickupDotInner} />
              </View>
              {isLoaded && HAS_VALID_GOOGLE_MAPS_KEY ? (
                <PlacesAutocompleteField
                  onLoad={setAutocompletePickup}
                  onPlaceChanged={handlePickupPlaceChanged}
                  options={{ componentRestrictions: { country: 'in' } }}
                  placeholder="Building, street name, etc."
                  value={pickup}
                  onChangeText={(text) => {
                    setPickup(text);
                    setPickupCoords(null);
                  }}
                  inputStyle={s.input}
                  focusStyle={s.inputFocus}
                />
              ) : (
                <TextInput
                  placeholder="Building, street name, etc."
                  value={pickup}
                  onFocus={() => setFocusedField('pickup')}
                  onBlur={() => setFocusedField('')}
                  onChangeText={(text) => {
                    setPickup(text);
                    setPickupCoords(null);
                  }}
                  style={[s.input, { flex: 1 }, focusedField === 'pickup' ? s.inputFocus : null]}
                />
              )}
            </View>
            <Tap onPress={() => openMapPicker('pickup')} style={[s.mapSelect, { backgroundColor: u.soft, borderColor: 'rgba(219,234,254,0.5)' }]}>
              <MapPinned size={14} color="#1d4ed8" />
              <Text style={[s.mapSelectText, { color: '#1d4ed8' }]}>Map Selection</Text>
            </Tap>
          </View>

          {/* Drop Section */}
          <View style={{ zIndex: 1 }}>
            <Text style={[s.fieldLabel, { color: '#4f46e5' }]}>{`DROP IN ${String(toCity).toUpperCase()}`}</Text>
            <View style={s.fieldRow}>
              <View style={[s.fieldDot, { borderColor: '#e0e7ff' }]}>
                <MapPin size={14} color="#4f46e5" strokeWidth={3} />
              </View>
              {isLoaded && HAS_VALID_GOOGLE_MAPS_KEY ? (
                <PlacesAutocompleteField
                  onLoad={setAutocompleteDrop}
                  onPlaceChanged={handleDropPlaceChanged}
                  options={{ componentRestrictions: { country: 'in' } }}
                  placeholder="Station, mall, hotel name..."
                  value={drop}
                  onChangeText={(text) => {
                    setDrop(text);
                    setDropCoords(null);
                  }}
                  inputStyle={s.input}
                  focusStyle={s.inputFocus}
                />
              ) : (
                <TextInput
                  placeholder="Station, mall, hotel name..."
                  value={drop}
                  onFocus={() => setFocusedField('drop')}
                  onBlur={() => setFocusedField('')}
                  onChangeText={(text) => {
                    setDrop(text);
                    setDropCoords(null);
                  }}
                  style={[s.input, { flex: 1 }, focusedField === 'drop' ? s.inputFocus : null]}
                />
              )}
            </View>
            <Tap onPress={() => openMapPicker('drop')} style={[s.mapSelect, { backgroundColor: u.soft, borderColor: 'rgba(224,231,255,0.5)' }]}>
              <MapPinned size={14} color="#4338ca" />
              <Text style={[s.mapSelectText, { color: '#4338ca' }]}>Map Selection</Text>
            </Tap>
          </View>
        </View>
      </ScrollView>

      {/* Book CTA */}
      <LinearGradient
        pointerEvents="box-none"
        colors={['rgba(250,251,255,0)', 'rgba(250,251,255,0.95)', '#FAFBFF']}
        style={s.cta}
      >
        <View style={s.liveBox}>
          <View>
            <Text style={s.liveLabel}>LIVE FETCHING</Text>
            <Text style={s.liveCount}>
              {isFetchingDrivers ? 'Checking nearby drivers...' : `${liveDriverCount} drivers nearby`}
            </Text>
          </View>
          {isFetchingDrivers ? (
            <Spinner size={20} color="#3b82f6" />
          ) : (
            <View style={s.livePill}>
              <Text style={s.livePillText}>Live</Text>
            </View>
          )}
        </View>
        {driverFetchError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{driverFetchError}</Text>
          </View>
        ) : null}
        <Tap scale={0.97} onPress={handleContinue} disabled={isProceeding} style={s.blueButton}>
          {isProceeding ? (
            <>
              <Spinner size={20} color={u.text} strokeWidth={3} />
              <Text style={[s.blueButtonText, { letterSpacing: 3.2 }]}>FETCHING DRIVERS...</Text>
            </>
          ) : (
            <>
              <Text style={[s.blueButtonText, { letterSpacing: 3.2 }]}>PROCEED TO LIVE TRACKING</Text>
              <ChevronRight size={20} strokeWidth={3} color={u.text} />
            </>
          )}
        </Tap>
      </LinearGradient>
    </Screen>
  );
};

const useStyles = makeStyles((t) => {
  const u = userTokens(t.dark);
  return {
    // map picker
    mapTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: 24, paddingBottom: 24 },
    mapTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    squareButton: {
      width: 40,
      height: 40,
      borderRadius: 16,
      backgroundColor: u.card,
      borderWidth: 1,
      borderColor: u.border,
      alignItems: 'center',
      justifyContent: 'center',
      ...USER_SHADOW,
    },
    mapAddressCard: { flex: 1, minWidth: 0, backgroundColor: u.card, borderRadius: 24, borderWidth: 1, borderColor: '#eef2ff', paddingHorizontal: 20, paddingVertical: 16, ...USER_SHADOW },
    mapAddressLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2, color: '#2563eb', marginBottom: 4 },
    mapAddressText: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: u.text },
    manualLabel: { marginBottom: 8, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8, color: u.text2 },
    manualBox: { borderRadius: 24, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 12, ...USER_SHADOW },
    manualRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    manualInput: { flex: 1, fontSize: 14, fontWeight: '600', color: u.text, paddingVertical: 2 },
    resultsWrap: { marginTop: 12, borderTopWidth: 1, borderTopColor: u.border, paddingTop: 12 },
    searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 8 },
    searchingText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: u.muted },
    resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, paddingHorizontal: 4, paddingVertical: 12 },
    resultTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: u.text },
    resultAddress: { marginTop: 2, fontSize: 12, lineHeight: 20, fontWeight: '600', color: u.muted },
    initialDestination: { marginTop: 12, marginLeft: 52, borderRadius: 16, borderWidth: 1, borderColor: '#e0e7ff', backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 12, ...USER_SHADOW },
    initialDestinationLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8, color: '#4f46e5' },
    initialDestinationText: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '600', color: u.text },
    mapState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: u.soft, paddingHorizontal: 24 },
    mapStateCard: { maxWidth: 300, borderRadius: 32, backgroundColor: u.card, paddingHorizontal: 32, paddingVertical: 40, borderWidth: 1, borderColor: u.border, alignItems: 'center', ...USER_SHADOW },
    mapStateIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    mapStateTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: u.text, textAlign: 'center' },
    mapStateText: { marginTop: 8, fontSize: 13, lineHeight: 19, fontWeight: '600', color: u.muted, textAlign: 'center' },
    pinWrap: { position: 'absolute', top: '50%', left: '50%', width: 48, marginLeft: -24, marginTop: -64, alignItems: 'center', zIndex: 10 },
    pinHead: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#2563eb', borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', ...USER_SHADOW },
    pinStick: { width: 4, height: 24, backgroundColor: '#2563eb', marginTop: -8 },
    pinShadow: { position: 'absolute', bottom: -4, width: 16, height: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' },
    locateButton: {
      position: 'absolute',
      bottom: 40,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: u.card,
      borderWidth: 1,
      borderColor: u.border,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
      ...USER_SHADOW,
    },
    mapBottom: { paddingHorizontal: 24, paddingTop: 24, backgroundColor: u.card, borderTopWidth: 1, borderTopColor: '#eef2ff', gap: 20 },
    confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    confirmIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: u.soft, borderWidth: 1, borderColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
    confirmTitle: { fontSize: 16, lineHeight: 18, fontWeight: '700', color: u.text },
    confirmAddress: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '600', color: u.text2 },
    blueButton: {
      height: 64,
      width: '100%',
      backgroundColor: '#2563eb',
      borderRadius: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      ...USER_SHADOW,
      shadowColor: '#3b82f6',
    },
    // text-white is remapped to the theme's primary text colour inside the Taxi user app (index.css)
    blueButtonText: { fontSize: 16, lineHeight: 24, fontWeight: '700', letterSpacing: 1.6, color: u.text },
    // page
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#eef2ff',
      backgroundColor: u.card,
      paddingHorizontal: 24,
      paddingBottom: 24,
      zIndex: 30,
    },
    headerTitle: { fontSize: 20, lineHeight: 22, fontWeight: '700', letterSpacing: -0.5, color: u.text },
    headerSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1.2, color: u.text2 },
    addressCard: { backgroundColor: u.card, borderRadius: 32, padding: 24, borderWidth: 1, borderColor: '#eef2ff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
    dashLine: { position: 'absolute', left: 39, top: 74, bottom: 74, width: 2, backgroundColor: u.soft, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: u.border },
    fieldLabel: { marginLeft: 44, marginBottom: 8, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.65 },
    fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
    fieldDot: { width: 32, height: 32, marginTop: 12, borderRadius: 16, backgroundColor: u.soft, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    pickupDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3b82f6' },
    input: {
      height: 56,
      backgroundColor: u.card,
      borderWidth: 2,
      borderColor: u.border,
      borderRadius: 16,
      paddingHorizontal: 20,
      fontSize: 15,
      fontWeight: '600',
      color: u.text,
    },
    inputFocus: { borderColor: u.accent },
    mapSelect: { marginLeft: 48, marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
    mapSelectText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
    // Google's own suggestion list (.pac-container) is white in both themes
    pacContainer: { marginTop: 4, backgroundColor: '#ffffff', borderRadius: 4, borderTopWidth: 1, borderTopColor: '#d9d9d9', ...USER_SHADOW, elevation: 8 },
    pacItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e6e6e6' },
    pacText: { flex: 1, fontSize: 11, lineHeight: 20, color: '#999999' },
    pacMain: { fontSize: 13, color: '#333333' },
    cta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16, zIndex: 40 },
    liveBox: {
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderRadius: 16,
      backgroundColor: u.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: u.border,
      ...USER_SHADOW,
    },
    liveLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, color: u.text2 },
    liveCount: { marginTop: 4, fontSize: 15, lineHeight: 20, fontWeight: '700', color: u.text },
    livePill: { borderRadius: 9999, backgroundColor: u.soft, paddingHorizontal: 12, paddingVertical: 4 },
    livePillText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: '#1d4ed8' },
    errorBox: { marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ffe4e6', backgroundColor: u.soft, paddingHorizontal: 16, paddingVertical: 12 },
    errorText: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: '#f43f5e' },
  };
});

export default IntercityDetails;
