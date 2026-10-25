import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  LoaderCircle,
  MapPin,
  Search,
  Navigation,
  X,
  MapPinned,
  Check,
  AlertTriangle,
  User,
  Pencil,
  ArrowUpDown,
  Briefcase,
  Compass
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Overlay, Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { AppMap, regionFor } from '@/native/ui/AppMap';
import { makeStyles, useTheme } from '@/theme';
import { cleanGroundAddress } from '../../utils/preciseLocation';
import { localDateKey, localDateTimeMin } from '../../../../shared/utils/localDate';
import { userService } from '../../services/userService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER } from '../../../admin/utils/googleMaps';
import { googleMapsCompat } from '../../../../../../shared/maps/placesCompat';

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
});
const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };
const BRAND_BLUE = '#1E90FF';

const normalizeSearchValue = (value) => String(value || '').trim().toLowerCase();

const serializePackageForFlow = (pkg = {}) => ({
  id: pkg.id || '',
  serviceLocationId: pkg.serviceLocationId || '',
  serviceLocationName: pkg.serviceLocationName || '',
  packageTypeId: pkg.packageTypeId || '',
  packageTypeName: pkg.packageTypeName || '',
  destination: pkg.destination || '',
  availability: pkg.availability || 'available',
  vehicles: Array.isArray(pkg.vehicles)
    ? pkg.vehicles.map((vehicle, index) => ({
      id: vehicle.id || `${pkg.id || 'pkg'}:${vehicle.vehicleTypeId || index}`,
      vehicleTypeId: vehicle.vehicleTypeId || '',
      vehicleName: vehicle.vehicleName || 'Vehicle',
      capacity: Number(vehicle.capacity || 0),
      icon: vehicle.icon || '',
      iconType: vehicle.iconType || vehicle.vehicleName || 'car',
      dispatchType: String(vehicle.dispatchType || 'normal').trim().toLowerCase(),
      supportsBidding: ['bidding', 'both'].includes(String(vehicle.dispatchType || 'normal').trim().toLowerCase()),
      basePrice: Number(vehicle.basePrice || 0),
      freeDistance: Number(vehicle.freeDistance || 0),
      distancePrice: Number(vehicle.distancePrice || 0),
      freeTime: Number(vehicle.freeTime || 0),
      timePrice: Number(vehicle.timePrice || 0),
      serviceTax: Number(vehicle.serviceTax || 0),
      cancellationFee: Number(vehicle.cancellationFee || 0),
    }))
    : [],
});

const formatDateToDDMMYYYY = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}-${month}-${year}`;
};

const formatTimeTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayHour).padStart(2, '0')}:${minutes} ${ampm}`;
};

const normalizeSuggestionKey = (result) =>
  `${String(result?.title || '').trim().toLowerCase()}|${String(result?.address || '').trim().toLowerCase()}`;
const MAP_REVERSE_GEOCODE_DEBOUNCE_MS = 450;
const getLatLngCacheKey = (coords, precision = 5) =>
  `${Number(coords?.lat || 0).toFixed(precision)},${Number(coords?.lng || 0).toFixed(precision)}`;

const pad2 = (value) => String(value).padStart(2, '0');
// "YYYY-MM-DDTHH:mm" (the datetime-local value) -> local Date
const parseLocalDateTime = (value) => {
  const [datePart = '', timePart = '00:00'] = String(value || '').split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, hh || 0, mm || 0);
};

const Tap = ({ scale = 0.9, style, children, ...rest }) => (
  <Pressable {...rest} style={({ pressed }) => [style, pressed && { transform: [{ scale }] }]}>
    {children}
  </Pressable>
);

function Spinner({ size, color }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <LoaderCircle size={size} color={color} />
    </Animated.View>
  );
}

const IntercityHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState('');

  // Locations State
  const [fromCity, setFromCity] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);

  const [toCitySearch, setToCitySearch] = useState('');
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [isToFocused, setIsToFocused] = useState(false);
  // Any other place (not an admin route): picked from Google, priced by distance on the next screen.
  const [destinationPlace, setDestinationPlace] = useState(null);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [isQuoting, setIsQuoting] = useState(false);
  const [pickupCityName, setPickupCityName] = useState('');

  // Date and Time State - the trip start defaults to the earliest time a ride may be scheduled
  // (Admin > Transport Ride Settings > Schedule Ride: Minimum Minutes Ahead).
  const { settings: appSettings } = useSettings();
  const scheduleLeadMinutes = (() => {
    const value = Number(appSettings?.transportRide?.schedule_ride_min_minutes_ahead);
    return Number.isFinite(value) && value >= 0 ? value : 60;
  })();
  const earliestTripStart = new Date(Date.now() + scheduleLeadMinutes * 60 * 1000);
  const [travelDate, setTravelDate] = useState(() => localDateKey(0, earliestTripStart));

  const [travelTime, setTravelTime] = useState(() => (
    String(earliestTripStart.getHours()).padStart(2, '0') + ':' + String(earliestTripStart.getMinutes()).padStart(2, '0')
  ));

  const [tripType, setTripType] = useState('One Way');

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  // Explore Cabs opened the pickup map because the pickup was missing: after Confirm Pickup carry on to the vehicles
  const exploreAfterPickupRef = useRef(false);
  const [continueAfterPickup, setContinueAfterPickup] = useState(false);
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mapSearchInput, setMapSearchInput] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [isSearchingMapLocations, setIsSearchingMapLocations] = useState(false);
  const [isMapSearchFocused, setIsMapSearchFocused] = useState(false);
  const [isEditingPickup, setIsEditingPickup] = useState(false);
  // datetime-local picker natively: a date dialog, then a time dialog
  const [dateTimePicker, setDateTimePicker] = useState(null);
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);
  // where the native map last came to rest (the web read map.getCenter() on Confirm)
  const liveMapCenterRef = useRef(null);
  const mapSearchInputRef = useRef(null);
  const geocoderRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const mapSearchCacheRef = useRef(new Map());
  const latestMapSearchRef = useRef(0);
  const reverseGeocodeTimerRef = useRef(null);
  const reverseGeocodeCacheRef = useRef(new Map());
  const placeSelectionCacheRef = useRef(new Map());
  // the TO field's place on screen, for the suggestion list drawn over the page
  const rootRef = useRef(null);
  const toFieldRef = useRef(null);
  const [dropdownFrame, setDropdownFrame] = useState(null);

  // No script to load natively: the map and the Places classes are always available.
  const isLoaded = true;

  // Pin bounce while the map moves
  const pinLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pinLift, { toValue: isDragging || isGeocoding ? -15 : 0, stiffness: 300, damping: 20, mass: 1, useNativeDriver: true }).start();
  }, [isDragging, isGeocoding, pinLift]);

  // Suggestions dropdown: motion initial={{ opacity: 0, y: 8 }}
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    dropdownAnim.setValue(0);
    if (isToFocused) Animated.timing(dropdownAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [dropdownAnim, isToFocused]);

  useEffect(() => {
    const loadPackages = async () => {
      try {
        setLoading(true);
        const response = await userService.getIntercityPackages();
        const results = Array.isArray(response?.results) ? response.results : [];
        setPackages(results);

        // Initial setup for fromCity if results exist
        if (results.length > 0 && !fromCity && results[0]?.serviceLocationName) {
          setFromCity(results[0].serviceLocationName);
        }
      } catch (err) {
        setError('Could not load intercity packages');
      } finally {
        setLoading(false);
      }
    };
    loadPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoaded || !google?.maps?.places?.AutocompleteService) {
      return;
    }

    autocompleteServiceRef.current = autocompleteServiceRef.current || new google.maps.places.AutocompleteService();
    placesServiceRef.current = placesServiceRef.current || new google.maps.places.PlacesService(null);
    autocompleteSessionTokenRef.current = autocompleteSessionTokenRef.current
      || new google.maps.places.AutocompleteSessionToken();
  }, [isLoaded]);

  // Set current location on mount if allowed
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMapCenter(coords);
          setPickupCoords([coords.lng, coords.lat]);
          reverseGeocode(coords);
        },
        null,
        { enableHighAccuracy: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const reverseGeocode = (coords) => {
    if (!google?.maps?.Geocoder) return;

    const cacheKey = getLatLngCacheKey(coords);
    const cached = reverseGeocodeCacheRef.current.get(cacheKey);
    if (cached) {
      setPickupAddress(cached.address);
      setPickupCityName(cached.cityName || '');
      if (cached.cityName) {
        const matched = packages.find((pkg) => pkg.serviceLocationName.toLowerCase() === cached.cityName.toLowerCase());
        if (matched) {
          setFromCity(matched.serviceLocationName);
        }
      }
      return;
    }

    setIsGeocoding(true);
    const geocoder = geocoderRef.current || new google.maps.Geocoder();
    geocoderRef.current = geocoder;
    geocoder.geocode({ location: coords }, (results, status) => {
      setIsGeocoding(false);
      if (status === 'OK' && results?.[0]) {
        const address = cleanGroundAddress(results[0].formatted_address);
        setPickupAddress(address);

        // Find city name to filter packages
        const cityObj = (results[0].address_components || []).find(c =>
          c.types.includes('locality') || c.types.includes('administrative_area_level_2')
        );
        const cityName = cityObj?.long_name || '';
        setPickupCityName(cityName);
        reverseGeocodeCacheRef.current.set(cacheKey, {
          address,
          cityName,
        });

        if (cityObj) {
          // Check if this city exists in our packages
          const matched = packages.find(p => p.serviceLocationName.toLowerCase() === cityName.toLowerCase());
          if (matched) {
            setFromCity(matched.serviceLocationName);
          }
        }
      }
    });
  };

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

  const resolveSuggestionSelection = async (result) => {
    const cacheKey = String(result?.placeId || normalizeSuggestionKey(result));
    if (cacheKey) {
      const cached = placeSelectionCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const placesService = placesServiceRef.current;
    const geocoder = geocoderRef.current || (google?.maps?.Geocoder ? new google.maps.Geocoder() : null);
    geocoderRef.current = geocoder;

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
                address: cleanGroundAddress(place.formatted_address) || result.address || result.title || '',
                coords: { lat: placeLocation.lat(), lng: placeLocation.lng() },
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
                  address: cleanGroundAddress(geocodedPlace.formatted_address) || result.address || result.title || '',
                  coords: { lat: geocodedLocation.lat(), lng: geocodedLocation.lng() },
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

    return null;
  };

  // onIdle of the web map: the region the map came to rest on
  const handleMapIdle = (region) => {
    if (!region || !google?.maps?.Geocoder) return;
    const lat = region.latitude;
    const lng = region.longitude;
    liveMapCenterRef.current = { lat, lng };
    const diff = Math.abs(lat - lastCenterRef.current.lat) + Math.abs(lng - lastCenterRef.current.lng);

    if (diff < 0.00001) {
      setIsDragging(false);
      return;
    }

    lastCenterRef.current = { lat, lng };
    setIsDragging(false);
    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }

    reverseGeocodeTimerRef.current = setTimeout(() => {
      reverseGeocode({ lat, lng });
    }, MAP_REVERSE_GEOCODE_DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }
  }, []);

  // The web map follows its `center` prop; natively the camera is moved to the new center.
  useEffect(() => {
    if (!showMapPicker || !mapInstanceRef.current) return;
    mapInstanceRef.current.animateCamera({ center: { latitude: mapCenter.lat, longitude: mapCenter.lng } }, { duration: 300 });
  }, [mapCenter, showMapPicker]);

  const panAndZoom = (center) => {
    mapInstanceRef.current?.animateCamera({ center: { latitude: center.lat, longitude: center.lng }, zoom: 17 }, { duration: 400 });
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const nextCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapInstanceRef.current) {
          panAndZoom(nextCenter);
        } else {
          setMapCenter(nextCenter);
        }
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true }
    );
  };

  const handleOpenMapPicker = () => {
    const center = Array.isArray(pickupCoords) && pickupCoords.length === 2
      ? { lat: pickupCoords[1], lng: pickupCoords[0] }
      : mapCenter;

    setMapCenter(center);
    lastCenterRef.current = center;
    liveMapCenterRef.current = null;
    setMapSearchInput(pickupAddress || '');
    setMapSearchResults([]);
    setIsSearchingMapLocations(false);
    setIsMapSearchFocused(false);
    setIsEditingPickup(false);
    setShowMapPicker(true);
  };

  const handleEditPickup = () => {
    setIsEditingPickup(true);
    setMapSearchInput('');
    setMapSearchResults([]);
    setIsMapSearchFocused(true);

    setTimeout(() => {
      mapSearchInputRef.current?.focus();
    }, 0);
  };

  const handleMapSearchSuggestionSelect = async (result) => {
    const resolved = await resolveSuggestionSelection(result);
    if (!resolved?.coords) {
      return;
    }

    const nextCenter = resolved.coords;
    lastCenterRef.current = nextCenter;
    setMapCenter(nextCenter);
    setPickupAddress(resolved.address);
    setMapSearchInput(resolved.address);
    setMapSearchResults([]);
    setIsMapSearchFocused(false);
    setIsEditingPickup(false);
    resetAutocompleteSessionToken();

    if (mapInstanceRef.current) {
      panAndZoom(nextCenter);
    }
  };

  useEffect(() => {
    const trimmedQuery = mapSearchInput.trim();

    if (
      !showMapPicker
      || !isMapSearchFocused
      || !trimmedQuery
      || trimmedQuery.length < 4
      || !HAS_VALID_GOOGLE_MAPS_KEY
      || !autocompleteServiceRef.current
      || trimmedQuery === String(pickupAddress || '').trim()
    ) {
      setMapSearchResults([]);
      setIsSearchingMapLocations(false);
      return;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
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
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: trimmedQuery,
          componentRestrictions: { country: 'in' },
          sessionToken: getAutocompleteSessionToken(),
          locationBias: { center: mapCenter, radius: 30000 },
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
  }, [isMapSearchFocused, mapCenter, mapSearchInput, pickupAddress, showMapPicker]);

  // Places beyond the admin's routes: cities / towns matching what was typed (India only).
  useEffect(() => {
    const query = toCitySearch.trim();
    if (selectedPackage || destinationPlace || query.length < 3 || !isLoaded || !autocompleteServiceRef.current) {
      setPlaceSuggestions([]);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'in' },
          types: ['(cities)'],
          sessionToken: getAutocompleteSessionToken() || undefined,
        },
        (predictions, status) => {
          if (!active) return;
          const routeNames = new Set(packages.map((pkg) => normalizeSearchValue(pkg.destination)));
          setPlaceSuggestions(
            status === 'OK' && Array.isArray(predictions)
              ? predictions
                .map((prediction) => ({
                  placeId: prediction.place_id,
                  title: prediction.structured_formatting?.main_text || prediction.description,
                  subtitle: prediction.structured_formatting?.secondary_text || '',
                }))
                .filter((item) => !routeNames.has(normalizeSearchValue(item.title)))
                .slice(0, 5)
              : [],
          );
        },
      );
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toCitySearch, selectedPackage, destinationPlace, isLoaded, packages]);

  const pickDestinationPlace = async (suggestion) => {
    const geocoder = geocoderRef.current || (google?.maps?.Geocoder ? new google.maps.Geocoder() : null);
    geocoderRef.current = geocoder;
    if (!geocoder || !suggestion?.placeId) return;

    const resolved = await new Promise((resolve) => {
      geocoder.geocode({ placeId: suggestion.placeId }, (results, status) => {
        const placeLocation = results?.[0]?.geometry?.location;
        resolve(status === 'OK' && placeLocation ? {
          address: cleanGroundAddress(results[0].formatted_address) || suggestion.title,
          coords: [placeLocation.lng(), placeLocation.lat()],
        } : null);
      });
    });
    resetAutocompleteSessionToken();

    if (!resolved) {
      toast.error('Could not find that place. Please try another one.');
      return;
    }

    setSelectedPackage(null);
    setToCitySearch(suggestion.title);
    setDestinationPlace({ title: suggestion.title, placeId: suggestion.placeId, address: resolved.address, coords: resolved.coords });
    setPlaceSuggestions([]);
    setIsToFocused(false);
  };

  const filteredPackages = useMemo(() => {
    const query = normalizeSearchValue(toCitySearch);

    if (query) {
      return packages.filter((pkg) =>
        normalizeSearchValue(pkg.destination).includes(query) ||
        normalizeSearchValue(pkg.packageTypeName).includes(query) ||
        normalizeSearchValue(pkg.serviceLocationName).includes(query)
      );
    }

    return packages;
  }, [packages, toCitySearch]);

  const handleSwapLocations = () => {
    if (!pickupAddress && !toCitySearch && !selectedPackage) return;

    const prevPickupAddress = pickupAddress;
    const prevFromCity = fromCity;

    const newPickup = selectedPackage?.destination || toCitySearch || '';
    setPickupAddress(newPickup);
    setPickupCoords(null);

    const newDest = prevPickupAddress || prevFromCity || '';
    setToCitySearch(newDest);

    // Try to find a package that matches this reverse route
    const reversedPkg = packages.find(
      (pkg) =>
        pkg.serviceLocationName.toLowerCase().trim() === newPickup.toLowerCase().trim() &&
        pkg.destination.toLowerCase().trim() === newDest.toLowerCase().trim()
    );

    if (reversedPkg) {
      setSelectedPackage(reversedPkg);
      setFromCity(reversedPkg.serviceLocationName);
    } else {
      setSelectedPackage(null);
      if (newPickup) {
        setFromCity(newPickup);
      }
    }
  };

  const handleDateTimeChange = (val) => {
    // YYYY-MM-DDTHH:MM
    if (val) {
      const [d, tm] = val.split('T');
      setTravelDate(d);
      setTravelTime(tm);
    }
  };

  const triggerDateTimePicker = () => {
    setDateTimePicker({ step: 'date' });
  };

  const onDateTimePicked = (event, selected) => {
    const current = dateTimePicker;
    if (!selected || !current) {
      setDateTimePicker(null);
      return;
    }
    if (current.step === 'date') {
      setDateTimePicker({ step: 'time', date: selected });
      return;
    }
    const day = current.date;
    let picked = new Date(day.getFullYear(), day.getMonth(), day.getDate(), selected.getHours(), selected.getMinutes());
    // the input's `min`: a time before the earliest trip start is not accepted
    if (picked.getTime() < earliestTripStart.getTime()) picked = earliestTripStart;
    setDateTimePicker(null);
    handleDateTimeChange(`${picked.getFullYear()}-${pad2(picked.getMonth() + 1)}-${pad2(picked.getDate())}T${pad2(picked.getHours())}:${pad2(picked.getMinutes())}`);
  };

  const handleExploreCabs = () => {
    if (!pickupAddress) {
      toast.error('Please set your Pickup Location');
      exploreAfterPickupRef.current = true;
      setShowMapPicker(true);
      return;
    }

    if (!selectedPackage) {
      // Check if we can auto-match the current drop search query to a package
      const match = packages.find(p => p.destination.toLowerCase().trim() === toCitySearch.toLowerCase().trim());
      if (match) {
        setSelectedPackage(match);
        proceedWithPackage(match);
      } else if (destinationPlace) {
        proceedWithPlace(destinationPlace);
      } else {
        toast.error('Please select a valid Drop Location from the suggestions');
        openToSuggestions();
      }
      return;
    }

    proceedWithPackage(selectedPackage);
  };

  // A place that is not an admin route: ask the server for the distance-priced fare of every vehicle that can go there.
  const proceedWithPlace = async (place) => {
    if (isQuoting) return;
    if (!Array.isArray(pickupCoords) || pickupCoords.length !== 2) {
      toast.error('Please set your Pickup Location on the map');
      exploreAfterPickupRef.current = true;
      setShowMapPicker(true);
      return;
    }

    setIsQuoting(true);
    try {
      const quote = await userService.getIntercityQuote({
        pickupLng: pickupCoords[0],
        pickupLat: pickupCoords[1],
        dropLng: place.coords[0],
        dropLat: place.coords[1],
      });
      const vehicles = Array.isArray(quote?.vehicles) ? quote.vehicles : [];
      if (vehicles.length === 0) {
        toast.error('Outstation rides to this place are not available right now. Please try another place.');
        return;
      }

      const combinedScheduledAt = new Date(`${travelDate}T${travelTime}`);
      navigate(`${routePrefix}/intercity/vehicle`, {
        state: {
          fromCity: pickupCityName || fromCity || 'Pickup',
          toCity: place.title,
          tripType,
          rideMode: 'schedule',
          date: travelDate,
          scheduledAt: combinedScheduledAt.toISOString(),
          selectedPackages: [{
            id: 'outstation',
            serviceLocationId: quote?.serviceLocationId || '',
            serviceLocationName: pickupCityName || fromCity || '',
            packageTypeId: '',
            packageTypeName: 'Outstation',
            destination: place.title,
            availability: 'available',
            vehicles,
          }],
          pickupAddress,
          pickupCoords,
          serviceLocationId: quote?.serviceLocationId || '',
          destinationAddress: place.address,
          destinationCoords: place.coords,
          distance: Number(quote?.distanceKm || 0),
          isOutstation: true,
        },
      });
    } catch (error) {
      toast.error(error?.message || 'Could not get the fare for this place. Please try again.');
    } finally {
      setIsQuoting(false);
    }
  };

  const proceedWithPackage = (pkg) => {
    const flowPackage = serializePackageForFlow(pkg);
    const effectiveFromCity = flowPackage.serviceLocationName || fromCity || 'Pickup City';
    const combinedScheduledAt = new Date(`${travelDate}T${travelTime}`);

    navigate(`${routePrefix}/intercity/vehicle`, {
      state: {
        fromCity: effectiveFromCity,
        toCity: flowPackage.destination,
        tripType,
        rideMode: 'schedule',
        date: travelDate,
        scheduledAt: combinedScheduledAt.toISOString(),
        selectedPackages: [flowPackage],
        pickupAddress,
        pickupCoords
      }
    });
  };

  useEffect(() => {
    if (!continueAfterPickup || !pickupAddress) {
      return;
    }
    setContinueAfterPickup(false);
    const pkg = selectedPackage || packages.find((p) => p.destination.toLowerCase().trim() === toCitySearch.toLowerCase().trim());
    if (pkg) {
      proceedWithPackage(pkg);
    } else if (destinationPlace) {
      proceedWithPlace(destinationPlace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueAfterPickup, pickupAddress]);

  // Where the TO field sits inside the page: the suggestion list is drawn over the page right below it
  // (an absolute child outside its parent's box would not receive touches on Android).
  const measureToField = () => {
    const field = toFieldRef.current;
    const root = rootRef.current;
    if (!field || !root) return;
    root.measureInWindow((rx, ry) => {
      field.measureInWindow((fx, fy, fw, fh) => {
        setDropdownFrame({ left: fx - rx, top: fy - ry + fh + 8, width: fw });
      });
    });
  };

  const openToSuggestions = () => {
    measureToField();
    setIsToFocused(true);
  };

  const displayDateStr = formatDateToDDMMYYYY(travelDate);
  const displayTimeStr = formatTimeTo12Hour(travelTime);

  const confirmPickup = () => {
    const center = liveMapCenterRef.current;
    const lng = center?.lng ?? lastCenterRef.current.lng;
    const lat = center?.lat ?? lastCenterRef.current.lat;
    setPickupCoords([lng, lat]);
    setShowMapPicker(false);
    if (exploreAfterPickupRef.current) {
      exploreAfterPickupRef.current = false;
      setContinueAfterPickup(true);
    }
  };

  const pickerValue = dateTimePicker
    ? (dateTimePicker.step === 'date' ? parseLocalDateTime(`${travelDate}T${travelTime}`) : parseLocalDateTime(`${travelDate}T${travelTime}`))
    : null;
  const pickerMin = parseLocalDateTime(localDateTimeMin(earliestTripStart));

  return (
    <Screen edges={['bottom']} bg={u.bg} keyboard>
      <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
        {/* Map Picker Modal */}
        <Overlay open={showMapPicker} onClose={() => setShowMapPicker(false)} style={{ backgroundColor: u.card }}>
          <View style={{ flex: 1 }}>
            <View style={StyleSheet.absoluteFill}>
              {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                <AppMap
                  ref={mapInstanceRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={regionFor(mapCenter, 15)}
                  onPanDrag={() => setIsDragging(true)}
                  onRegionChangeComplete={handleMapIdle}
                />
              ) : (
                <View style={s.mapUnavailable}>
                  <AlertTriangle size={40} color="#fbbf24" />
                  <Text style={s.mapUnavailableText}>
                    Map service unavailable. Please check your connection or API key.
                  </Text>
                </View>
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

              <Tap onPress={handleUseCurrentLocation} style={s.locateButton}>
                {isLocating ? <Spinner size={24} color="#3b82f6" /> : <Navigation size={24} color={u.text} />}
              </Tap>
            </View>

            <LinearGradient
              colors={['#ffffff', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
              style={[s.mapTop, { paddingTop: Math.max(48, insets.top + 16) }]}
            >
              <View style={s.mapTopRow}>
                <Tap onPress={() => setShowMapPicker(false)} style={s.squareButton}>
                  <ArrowLeft size={20} color={u.text} strokeWidth={2.5} />
                </Tap>
                <View style={s.mapAddressCard}>
                  <View style={s.mapAddressHead}>
                    <Text style={s.mapAddressLabel}>PINPOINT PICKUP</Text>
                    <Pressable onPress={handleEditPickup} style={s.editPill}>
                      <Pencil size={10} color={u.text2} />
                      <Text style={s.editPillText}>EDIT</Text>
                    </Pressable>
                  </View>
                  <View style={s.mapAddressRow}>
                    {isEditingPickup ? (
                      <>
                        <Search size={14} color={u.text2} />
                        <TextInput
                          ref={mapSearchInputRef}
                          value={mapSearchInput}
                          onChangeText={setMapSearchInput}
                          onFocus={() => setIsMapSearchFocused(true)}
                          placeholder={isGeocoding ? 'Finding exact address...' : 'Search pickup location'}
                          placeholderTextColor="#94a3b8"
                          style={s.mapSearchInput}
                        />
                      </>
                    ) : (
                      <Text numberOfLines={1} style={s.mapAddressText}>
                        {isGeocoding ? 'Finding exact address...' : (pickupAddress || 'Set location on map')}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              {(isSearchingMapLocations || mapSearchResults.length > 0) ? (
                <View style={s.mapResults}>
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
            </LinearGradient>
          </View>

          <View style={[s.mapBottom, { paddingBottom: 48 + insets.bottom }]}>
            <Tap
              scale={0.98}
              onPress={confirmPickup}
              disabled={isGeocoding}
              style={[s.blueButton, isGeocoding ? { opacity: 0.4 } : null]}
            >
              <Check size={20} strokeWidth={3} color={u.text} />
              <Text style={s.blueButtonText}>CONFIRM PICKUP</Text>
            </Tap>
          </View>
        </Overlay>

        {/* Header */}
        <View style={s.headerWrap}>
          <StatusBarSpacer color={u.card} />
          <View style={s.header}>
            <Tap onPress={() => navigate(routePrefix || '/')} style={s.squareButton}>
              <ArrowLeft size={20} color={u.text} strokeWidth={2.5} />
            </Tap>
            <Text style={s.headerTitle}>Outstation Cabs</Text>
            <View style={s.userBubble}>
              <User size={18} strokeWidth={2.5} color="#2563eb" />
            </View>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 112 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isToFocused}
        >
          {/* Main Container Card */}
          <View style={s.mainCard}>
            {/* Subtitle Header */}
            <View style={s.subtitleRow}>
              <LinearGradient colors={['rgba(226,232,240,0)', '#e2e8f0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.subtitleLine} />
              <Text style={s.subtitleText}>INDIA&apos;S PREMIER INTERCITY CABS</Text>
              <LinearGradient colors={['#e2e8f0', 'rgba(226,232,240,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.subtitleLine} />
            </View>

            {/* Trip Type Toggle */}
            <View style={s.toggle}>
              {[
                { type: 'One Way', sub: 'Drop-off only' },
                { type: 'Round Trip', sub: 'Return with same cab' },
              ].map(({ type, sub }) => {
                const active = tripType === type;
                return (
                  <Pressable key={type} onPress={() => setTripType(type)} style={[s.toggleButton, active ? s.toggleButtonActive : null]}>
                    <Text style={[s.toggleTitle, active ? { color: u.text } : null]}>{type.toUpperCase()}</Text>
                    <Text style={[s.toggleSub, { color: active ? u.text : u.muted }]}>{sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Locations Fields Box */}
            <View style={s.locationsBox}>
              {/* FROM Field */}
              <Pressable onPress={handleOpenMapPicker} style={s.fromRow}>
                <View style={s.fieldIcon}>
                  <MapPin size={20} color={u.text2} />
                </View>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={[s.fieldLabel, { marginBottom: 6 }]}>FROM</Text>
                  <Text numberOfLines={1} style={s.fieldValue}>
                    {pickupAddress || 'Enter Pickup Location'}
                  </Text>
                </View>
              </Pressable>

              {/* TO Field */}
              <View ref={toFieldRef} collapsable={false} style={s.toRow}>
                <View style={s.fieldIcon}>
                  <MapPin size={20} color={BRAND_BLUE} />
                </View>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={[s.fieldLabel, { marginBottom: 4 }]}>TO</Text>
                  <TextInput
                    placeholder="Enter Drop Location"
                    placeholderTextColor="#94a3b8"
                    value={toCitySearch}
                    onChangeText={(text) => {
                      setToCitySearch(text);
                      if (selectedPackage && selectedPackage.destination !== text) {
                        setSelectedPackage(null);
                      }
                      if (destinationPlace && destinationPlace.title !== text) {
                        setDestinationPlace(null);
                      }
                    }}
                    onFocus={openToSuggestions}
                    style={s.toInput}
                  />
                </View>
                {toCitySearch ? (
                  <Pressable
                    onPress={() => {
                      setToCitySearch('');
                      setSelectedPackage(null);
                      setDestinationPlace(null);
                    }}
                    style={s.clearButton}
                  >
                    <X size={14} color={u.text2} />
                  </Pressable>
                ) : null}
              </View>

              {/* SWAP Button */}
              <Tap scale={0.95} onPress={handleSwapLocations} style={s.swapButton}>
                <ArrowUpDown size={15} color={BRAND_BLUE} />
              </Tap>
            </View>

            {/* TRIP START Picker */}
            <Pressable onPress={triggerDateTimePicker} style={s.tripStart}>
              <View style={s.tripStartIcon}>
                <Calendar size={18} color={BRAND_BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLabel, { marginBottom: 6 }]}>TRIP START</Text>
                <View style={s.tripStartValues}>
                  <Text style={s.tripStartDate}>{displayDateStr}</Text>
                  <Text style={s.tripStartTime}>{displayTimeStr}</Text>
                </View>
              </View>
              <ChevronRight size={16} color={u.text2} />
            </Pressable>

            {/* EXPLORE CABS Button */}
            <Pressable
              onPress={handleExploreCabs}
              disabled={isQuoting}
              style={({ pressed }) => [s.exploreButton, isQuoting ? { opacity: 0.7 } : null, pressed && { transform: [{ scale: 0.98 }], backgroundColor: '#E06610' }]}
            >
              <Text style={s.exploreText}>{isQuoting ? 'GETTING FARES...' : 'EXPLORE CABS'}</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Suggestions Dropdown Overlay */}
        {isToFocused ? (
          <>
            {/* Click Outside Handler Backdrop */}
            <Pressable style={[StyleSheet.absoluteFill, { zIndex: 40 }]} onPress={() => setIsToFocused(false)} />
            {dropdownFrame ? (
              <Animated.View
                style={[
                  s.dropdown,
                  { top: dropdownFrame.top, left: dropdownFrame.left - 2, width: dropdownFrame.width + 4 },
                  { opacity: dropdownAnim, transform: [{ translateY: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
                ]}
              >
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {loading ? (
                    <View style={s.dropdownLoading}>
                      <Spinner size={18} color="#3b82f6" />
                      <Text style={s.dropdownLoadingText}>Loading routes...</Text>
                    </View>
                  ) : (filteredPackages.length > 0 || placeSuggestions.length > 0) ? (
                    <>
                      {filteredPackages.map((pkg, index) => (
                        <Pressable
                          key={pkg.id}
                          onPress={() => {
                            setSelectedPackage(pkg);
                            setToCitySearch(pkg.destination);
                            setFromCity(pkg.serviceLocationName);
                            setIsToFocused(false);
                          }}
                          style={({ pressed }) => [
                            s.packageRow,
                            index === filteredPackages.length - 1 && placeSuggestions.length === 0 ? { borderBottomWidth: 0 } : null,
                            pressed && { backgroundColor: u.card },
                          ]}
                        >
                          {({ pressed }) => (
                            <>
                              <View style={{ minWidth: 0, flex: 1 }}>
                                <Text style={s.packageFrom}>{`FROM ${pkg.serviceLocationName}`.toUpperCase()}</Text>
                                <Text style={[s.packageTo, pressed && { color: '#2563eb' }]}>To {pkg.destination}</Text>
                              </View>
                              <View style={{ alignItems: 'flex-end', paddingLeft: 12 }}>
                                <Text style={s.packageStartsLabel}>STARTS FROM</Text>
                                <Text style={[s.packagePrice, pressed && { color: '#2563eb' }]}>
                                  ₹{pkg.vehicles?.[0]?.basePrice || '---'}
                                </Text>
                              </View>
                            </>
                          )}
                        </Pressable>
                      ))}
                      {placeSuggestions.length > 0 ? (
                        <>
                          <Text style={s.otherPlaces}>OTHER PLACES</Text>
                          {placeSuggestions.map((place, index) => (
                            <Pressable
                              key={place.placeId}
                              onPress={() => pickDestinationPlace(place)}
                              style={[s.placeRow, index === placeSuggestions.length - 1 ? { borderBottomWidth: 0 } : null]}
                            >
                              <MapPin size={16} color={u.text2} />
                              <View style={{ minWidth: 0, flex: 1 }}>
                                <Text numberOfLines={1} style={s.placeTitle}>{place.title}</Text>
                                {place.subtitle ? <Text numberOfLines={1} style={s.placeSubtitle}>{place.subtitle}</Text> : null}
                              </View>
                              <Text style={s.fareByDistance}>FARE BY DISTANCE</Text>
                            </Pressable>
                          ))}
                        </>
                      ) : null}
                    </>
                  ) : (
                    <View style={s.dropdownEmpty}>
                      <Text style={s.dropdownEmptyTitle}>No routes matching query</Text>
                      <Text style={s.dropdownEmptySub}>Check spelling or try a different city</Text>
                    </View>
                  )}
                </ScrollView>
              </Animated.View>
            ) : null}
          </>
        ) : null}

        {/* Bottom Navigation Bar */}
        <View style={[s.bottomNav, { paddingBottom: insets.bottom + 14 }]}>
          {/* ONE WAY */}
          <Pressable
            onPress={() => {
              setTripType('One Way');
            }}
            style={[s.navButton, tripType === 'One Way' ? s.navButtonActive : null]}
          >
            <Compass size={18} strokeWidth={2.5} color={tripType === 'One Way' ? u.text : u.muted} style={{ marginBottom: 2 }} />
            <Text style={[s.navText, { color: tripType === 'One Way' ? u.text : u.muted }]}>ONE WAY</Text>
          </Pressable>

          {/* ROUND TRIP */}
          <Pressable
            onPress={() => {
              setTripType('Round Trip');
            }}
            style={[s.navButton, tripType === 'Round Trip' ? s.navButtonActive : null]}
          >
            <Briefcase size={18} strokeWidth={2.5} color={tripType === 'Round Trip' ? u.text : u.muted} style={{ marginBottom: 2 }} />
            <Text style={[s.navText, { color: tripType === 'Round Trip' ? u.text : u.muted }]}>ROUND TRIP</Text>
          </Pressable>
        </View>
      </View>

      {dateTimePicker ? (
        <DateTimePicker
          key={dateTimePicker.step}
          mode={dateTimePicker.step}
          value={pickerValue}
          minimumDate={dateTimePicker.step === 'date' ? new Date(pickerMin.getFullYear(), pickerMin.getMonth(), pickerMin.getDate()) : undefined}
          display="default"
          onValueChange={onDateTimePicked}
          onDismiss={() => setDateTimePicker(null)}
        />
      ) : null}
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
    mapAddressCard: { flex: 1, minWidth: 0, backgroundColor: u.card, borderRadius: 24, borderWidth: 1, borderColor: '#eff6ff', paddingHorizontal: 20, paddingVertical: 16, ...USER_SHADOW },
    mapAddressHead: { marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    mapAddressLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2, color: '#2563eb' },
    editPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9999, backgroundColor: u.soft, paddingHorizontal: 10, paddingVertical: 4 },
    editPillText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, color: u.text2 },
    mapAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    mapSearchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: u.text, paddingVertical: 0 },
    mapAddressText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: u.text },
    mapResults: { marginTop: 16, borderRadius: 24, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 12, ...USER_SHADOW },
    searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 8 },
    searchingText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: u.muted },
    resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, paddingHorizontal: 4, paddingVertical: 12 },
    resultTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: u.text },
    resultAddress: { marginTop: 2, fontSize: 12, lineHeight: 20, fontWeight: '600', color: u.muted },
    mapUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: u.card, padding: 40 },
    mapUnavailableText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: u.muted, textAlign: 'center' },
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
    mapBottom: { paddingHorizontal: 24, paddingTop: 24, backgroundColor: u.card, borderTopWidth: 1, borderTopColor: u.border },
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
    headerWrap: { backgroundColor: u.card, borderBottomWidth: 1, borderBottomColor: u.border, zIndex: 30, ...USER_SHADOW },
    header: { paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: u.text },
    userBubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center' },
    mainCard: {
      backgroundColor: u.card,
      borderRadius: 28,
      padding: 24,
      borderWidth: 1,
      borderColor: u.border,
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
    },
    subtitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 },
    subtitleLine: { height: 1, flex: 1 },
    subtitleText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, color: '#3b82f6' },
    toggle: { flexDirection: 'row', borderWidth: 1, borderColor: u.border, borderRadius: 12, padding: 4, marginBottom: 20, backgroundColor: u.card },
    toggleButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    toggleButtonActive: { backgroundColor: BRAND_BLUE, ...USER_SHADOW },
    toggleTitle: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 0.33, color: u.text },
    toggleSub: { marginTop: 2, fontSize: 10.5, lineHeight: 12, opacity: 0.85 },
    locationsBox: { borderWidth: 1, borderColor: u.border, borderRadius: 16, backgroundColor: u.soft, padding: 2 },
    fromRow: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.8)' },
    fieldIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    fieldLabel: { fontSize: 10.5, lineHeight: 12, fontWeight: '700', letterSpacing: 0.5, color: u.text2 },
    fieldValue: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: u.text },
    toRow: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
    toInput: { marginTop: 2, padding: 0, fontSize: 15, fontWeight: '600', color: u.text, backgroundColor: 'transparent' },
    clearButton: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    swapButton: {
      position: 'absolute',
      right: 16,
      top: '50%',
      marginTop: -18,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: u.card,
      borderWidth: 1,
      borderColor: u.border,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
      ...USER_SHADOW,
    },
    tripStart: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: u.soft, borderWidth: 1, borderColor: '#D5E6F3', flexDirection: 'row', alignItems: 'center', gap: 16 },
    tripStartIcon: { width: 32, height: 32, borderRadius: 12, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center', ...USER_SHADOW },
    tripStartValues: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    tripStartDate: { fontSize: 15, lineHeight: 16, fontWeight: '700', color: u.text },
    tripStartTime: { fontSize: 12, lineHeight: 14, fontWeight: '500', color: u.muted },
    exploreButton: { marginTop: 20, width: '100%', backgroundColor: '#FF7A1A', paddingVertical: 16, borderRadius: 12, alignItems: 'center', ...USER_SHADOW },
    exploreText: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 1.5, color: u.text, textAlign: 'center' },
    dropdown: {
      position: 'absolute',
      maxHeight: 288,
      backgroundColor: u.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: u.border,
      zIndex: 50,
      overflow: 'hidden',
      ...USER_SHADOW,
      elevation: 12,
    },
    dropdownLoading: { padding: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    dropdownLoadingText: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: u.text2 },
    packageRow: { width: '100%', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: u.border },
    packageFrom: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1, color: u.text2, marginBottom: 2 },
    packageTo: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: u.text },
    packageStartsLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5, color: u.text2 },
    packagePrice: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: u.text },
    otherPlaces: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1, color: u.text2 },
    placeRow: { width: '100%', paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: u.border },
    placeTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: u.text },
    placeSubtitle: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: u.text2 },
    fareByDistance: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5, color: u.text2 },
    dropdownEmpty: { padding: 32, alignItems: 'center' },
    dropdownEmptyTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: u.text2, textAlign: 'center' },
    dropdownEmptySub: { marginTop: 2, fontSize: 11, lineHeight: 16, color: u.text2, textAlign: 'center' },
    bottomNav: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      backgroundColor: u.card,
      borderTopWidth: 1,
      borderTopColor: u.border,
      zIndex: 40,
      elevation: 8,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: -4 },
    },
    navButton: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    navButtonActive: { backgroundColor: BRAND_BLUE },
    navText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.3 },
  };
});

export default IntercityHome;
