import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Animated, Easing, Keyboard, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Plus, MapPin, Navigation, Home, Building2, Briefcase, X, Crosshair, Search, Pencil, Trash2 } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { autocomplete } from '@/lib/google';
import { AppMap } from '@/native/ui/AppMap';
import { Dialog, Screen, Skeleton, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors, makeStyles, shadow, sp, useTheme } from '@/theme';
import { getAddressSelectorTheme, resolveAddressSelectorUi } from '@/shared/utils/addressSelectorTheme.js';
import { BrandToastIcon } from '@/shared/utils/customToasts';
import { Button } from '@food/components/ui/button';
import { Input } from '@food/components/ui/input';
import { Label } from '@food/components/ui/label';
import { useLocation as useGeoLocation } from '@food/hooks/useLocation';
import { useProfile } from '@food/context/ProfileContext';
import AnimatedPage from '@food/components/user/AnimatedPage';
import useAppBackNavigation from '@food/hooks/useAppBackNavigation';
import { reverseGeocodeWithGoogle, geocodeGooglePlaceId, getFreshGpsCoordinates } from '@food/utils/googleGeocoding';

const debugError = () => {};

// Enable Maps if API Key is available, otherwise fallback to coordinates-only mode
const MAPS_ENABLED = !!globalThis.__ENV__?.VITE_GOOGLE_MAPS_API_KEY;

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || '').toLowerCase();
  if (label.includes('home')) return Home;
  if (label.includes('work') || label.includes('office')) return Briefcase;
  if (label.includes('building') || label.includes('apt')) return Building2;
  return Home;
};

const getAddressCoordinates = (address) => {
  const coords = address?.location?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const lat = Number(address?.latitude ?? address?.lat);
  const lng = Number(address?.longitude ?? address?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
};

const normalizeLabelForForm = (label) => {
  const value = String(label || 'Home').toLowerCase();
  if (value.includes('office') || value.includes('work')) return 'Work';
  if (value.includes('other')) return 'Other';
  return 'Home';
};

const formatAddressPreview = (address) => {
  if (!address) return '';
  return [address.additionalDetails, address.street, address.city, address.state, address.zipCode].filter(Boolean).join(', ');
};

const zoomDelta = (zoom) => 360 / 2 ** zoom;

// ---------------------------------------------------------------- native look of getAddressSelectorTheme()'s classes
const dk = '#0a0a0a';
function nativeUi(variant, dark) {
  if (variant === 'taxi') {
    const indigo = dark ? colors.indigo[400] : colors.indigo[600];
    return {
      pageGradient: dark ? null : ['#F8FAFC', '#F3F4F6', '#EEF2F7'],
      pageBg: dark ? dk : '#F8FAFC',
      header: {
        backgroundColor: dark ? '#171717' : alpha('#ffffff', 0.7),
        borderBottomColor: dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.7),
        paddingHorizontal: sp(5),
        gap: sp(3),
      },
      blurHeader: !dark,
      eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2.6, color: colors.slate[400], textTransform: 'uppercase' },
      headerTitle: { fontSize: 18, lineHeight: 18, fontWeight: '900', letterSpacing: -0.4, color: dark ? '#fafafa' : colors.slate[900] },
      headerTitleSimple: { fontSize: 20, lineHeight: 28, fontWeight: '900', letterSpacing: -0.4, color: dark ? '#fafafa' : colors.slate[900] },
      accent: indigo,
      accentBgSoft: dark ? alpha(colors.indigo[950], 0.3) : colors.indigo[50],
      suggestionPressed: dark ? alpha(colors.indigo[950], 0.3) : alpha(colors.indigo[50], 0.8),
      suggestionIconBg: dark ? alpha(colors.indigo[950], 0.2) : colors.indigo[50],
      locationText: dark ? colors.emerald[400] : colors.emerald[600],
      locationIconBg: dark ? alpha(colors.emerald[950], 0.2) : colors.emerald[50],
      btnPrimary: { backgroundColor: colors.slate[900] },
      btnPrimaryText: { fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.white },
      chipSelected: { backgroundColor: colors.slate[900], ...shadow.sm },
      chipSelectedText: colors.white,
      chipUnselected: { backgroundColor: dark ? colors.zinc[800] : colors.white, borderWidth: 1, borderColor: dark ? colors.zinc[700] : colors.zinc[200] },
      chipUnselectedText: dark ? colors.zinc[200] : colors.zinc[700],
      pinnedBox: {
        backgroundColor: dark ? alpha(colors.indigo[950], 0.3) : alpha(colors.indigo[50], 0.8),
        borderColor: dark ? colors.indigo[900] : colors.indigo[100],
        borderRadius: 18,
      },
      pinnedLabel: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: indigo },
      savedCard: {
        backgroundColor: dark ? '#171717' : alpha('#ffffff', 0.8),
        borderRadius: 22,
        borderColor: dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.8),
        elevation: 2,
        shadowColor: 'rgb(15,23,42)',
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
      },
      savedChevronBg: dark ? alpha(colors.indigo[950], 0.3) : colors.indigo[50],
      listSection: { backgroundColor: dark ? '#171717' : alpha('#ffffff', 0.75), borderBottomColor: dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.7) },
      divider: dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.7),
      listRowPressed: dark ? alpha('#262626', 0.4) : alpha('#ffffff', 0.9),
      searchSection: { backgroundColor: dark ? '#171717' : alpha('#ffffff', 0.7), borderBottomColor: dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.7) },
      footerBar: { backgroundColor: dark ? '#171717' : alpha('#ffffff', 0.9), borderTopColor: dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.7) },
      formBg: dark ? dk : '#F8FAFC',
    };
  }
  return {
    pageGradient: null,
    pageBg: dark ? dk : colors.white,
    header: {
      backgroundColor: dark ? '#1a1a1a' : colors.white,
      borderBottomColor: dark ? colors.gray[800] : colors.gray[100],
      paddingHorizontal: sp(4),
      gap: sp(4),
    },
    blurHeader: false,
    eyebrow: null,
    headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: dark ? colors.white : colors.gray[900] },
    headerTitleSimple: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: dark ? colors.white : colors.gray[900] },
    accent: '#DC2626',
    accentBgSoft: dark ? alpha(colors.red[950], 0.1) : colors.red[50],
    suggestionPressed: alpha('#DC2626', dark ? 0.1 : 0.05),
    suggestionIconBg: dark ? alpha(colors.red[950], 0.2) : colors.red[50],
    locationText: '#DC2626',
    locationIconBg: dark ? alpha(colors.red[950], 0.1) : colors.red[50],
    btnPrimary: { backgroundColor: '#DC2626' },
    btnPrimaryText: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.white },
    chipSelected: { backgroundColor: '#DC2626', ...shadow.sm },
    chipSelectedText: colors.white,
    chipUnselected: { backgroundColor: dark ? colors.zinc[800] : colors.zinc[100], borderWidth: 1, borderColor: dark ? colors.zinc[700] : colors.zinc[200] },
    chipUnselectedText: dark ? colors.zinc[200] : colors.zinc[700],
    pinnedBox: {
      backgroundColor: alpha('#DC2626', dark ? 0.1 : 0.05),
      borderColor: alpha('#DC2626', dark ? 0.2 : 0.1),
      borderRadius: 14,
    },
    pinnedLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: dark ? alpha('#DC2626', 0.8) : '#DC2626' },
    savedCard: { backgroundColor: dark ? '#1a1a1a' : colors.slate[50], borderRadius: 14, borderColor: 'transparent' },
    savedChevronBg: alpha('#DC2626', 0.1),
    listSection: { backgroundColor: dark ? dk : colors.white, borderBottomColor: dark ? alpha(colors.zinc[800], 0.6) : colors.zinc[100] },
    divider: dark ? alpha(colors.zinc[800], 0.4) : colors.zinc[100],
    listRowPressed: dark ? alpha(colors.zinc[900], 0.4) : colors.zinc[50],
    searchSection: { backgroundColor: dark ? dk : colors.white, borderBottomColor: dark ? alpha(colors.gray[800], 0.1) : '#e6e0d1' },
    footerBar: { backgroundColor: dark ? '#1a1a1a' : colors.white, borderTopColor: dark ? colors.gray[800] : '#e6e0d1' },
    formBg: dark ? dk : colors.white,
  };
}

// The web's border spinner (animate-spin rounded-full border-2 border-X border-t-transparent)
function Spinner({ size = 16, color, width = 2, bottomOnly = false }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const border = bottomOnly
    ? { borderBottomWidth: width, borderBottomColor: color }
    : { borderWidth: width, borderColor: color, borderTopColor: 'transparent' };
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        border,
        { transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
      ]}
    />
  );
}

// Center pin over the map (animate-bounce-short + pulsing dot)
function CenterPin({ dark }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(bounce, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    const b = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [bounce, pulse]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={{ marginBottom: sp(8), alignItems: 'center' }}>
        <Animated.View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: dark ? alpha(colors.green[900], 0.3) : colors.green[100],
            alignItems: 'center',
            justifyContent: 'center',
            padding: 8,
            marginBottom: -6,
            ...shadow.sm,
            transform: [{ translateY: bounce.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] }) }],
          }}
        >
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green[600], alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white }}>
            <Animated.View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white, opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 1] }) }}
            />
          </View>
        </Animated.View>
        <View
          style={{
            width: 6,
            height: 24,
            backgroundColor: colors.green[600],
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.white,
            borderBottomLeftRadius: 999,
            borderBottomRightRadius: 999,
            ...shadow.xl,
          }}
        />
        <View style={{ position: 'absolute', bottom: -4, width: 12, height: 6, borderRadius: 999, backgroundColor: alpha('#000000', 0.2), transform: [{ scaleX: 1.5 }] }} />
      </View>
    </View>
  );
}

function AddressRemovedToast() {
  const t = useTheme();
  return (
    <View
      style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: sp(2),
        paddingHorizontal: sp(3),
        borderRadius: 16,
        backgroundColor: t.dark ? alpha(colors.zinc[900], 0.92) : alpha('#ffffff', 0.92),
        borderWidth: 1,
        borderColor: t.dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.6),
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      }}
    >
      <BrandToastIcon size="sm" />
      <Text style={{ fontSize: 13, lineHeight: 14, fontWeight: '600', color: t.dark ? colors.white : alpha(colors.gray[900], 0.9), paddingRight: 4 }}>
        Address Removed Successfully
      </Text>
    </View>
  );
}

const showAddressRemovedBrandedToast = () => {
  toast.custom(() => <AddressRemovedToast />, {
    id: 'address-removed-toast',
    duration: 4000,
    position: 'top-center',
    unstyled: true,
  });
};

function PageBg({ ui, children }) {
  return ui.pageGradient ? (
    <LinearGradient colors={ui.pageGradient} locations={[0, 0.38, 1]} style={{ flex: 1 }}>
      {children}
    </LinearGradient>
  ) : (
    <View style={{ flex: 1, backgroundColor: ui.pageBg }}>{children}</View>
  );
}

export default function AddressSelectorPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const goBack = useAppBackNavigation();
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const uiTheme = useMemo(() => getAddressSelectorTheme(resolveAddressSelectorUi(routerLocation.state)), [routerLocation.state]);
  const ui = useMemo(() => nativeUi(uiTheme.variant, t.dark), [uiTheme.variant, t.dark]);
  const { location, requestLocation, requestLocationFast } = useGeoLocation();
  const { addresses = [], addAddress, updateAddress, deleteAddress, setDefaultAddress, isAuthenticated, loading: profileLoading } = useProfile();
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [isDeletingAddress, setIsDeletingAddress] = useState(false);
  const deleteCloseTimerRef = useRef(null);
  const [mapPosition, setMapPosition] = useState(() => {
    try {
      const stored = localStorage.getItem('userLocation');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Number.isFinite(parsed?.latitude) && Number.isFinite(parsed?.longitude)) {
          return [parsed.latitude, parsed.longitude];
        }
      }
    } catch {
      // ignore
    }
    return [22.7196, 75.8577];
  });
  const [addressFormData, setAddressFormData] = useState({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    additionalDetails: '',
    label: 'Home',
    phone: '',
  });
  const [isFetchingLocationState, setIsFetchingLocationState] = useState(false);
  const [mapGpsLoading, setMapGpsLoading] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const googleMapRef = useRef(null);
  const mapReadyRef = useRef(false);
  const [currentAddress, setCurrentAddress] = useState('');
  const [addressAutocompleteValue, setAddressAutocompleteValue] = useState('');
  const [keywordAddressSuggestions, setKeywordAddressSuggestions] = useState([]);
  const [isKeywordSearching, setIsKeywordSearching] = useState(false);
  const googleMapsLoaded = MAPS_ENABLED;
  const geocodeDebounceRef = useRef(null);
  const initialMapCenterRef = useRef(mapPosition);
  const pendingMapCenterRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [keyboardInset, setKeyboardInset] = useState(0);
  const formScrollRef = useRef(null);
  const formScrollTopRef = useRef(0);
  const formViewportHRef = useRef(0);
  const formCardYRef = useRef(0);
  const fieldLayoutRef = useRef({});

  const ENABLE_LOCATION_REVERSE_GEOCODE = globalThis.__ENV__?.VITE_ENABLE_LOCATION_REVERSE_GEOCODE !== 'false';
  const getAddressId = (address) => address?.id || address?._id || null;

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialog((prev) => (prev ? { ...prev, phase: 'exit' } : null));
    if (deleteCloseTimerRef.current) clearTimeout(deleteCloseTimerRef.current);
    deleteCloseTimerRef.current = setTimeout(() => {
      setDeleteDialog(null);
      deleteCloseTimerRef.current = null;
    }, 220);
  }, []);

  useEffect(() => {
    return () => {
      if (deleteCloseTimerRef.current) clearTimeout(deleteCloseTimerRef.current);
      if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current);
    };
  }, []);

  const handleBack = () => {
    goBack();
  };

  // Load the map key: the app ships it in the env (the web fetched it before loading the Maps JS SDK)
  // Instant: reuse location Home already has. Do NOT call requestLocation() on open.
  useEffect(() => {
    const applyLoc = (loc) => {
      if (!loc) return;
      const formatted = loc.formattedAddress || loc.address || '';
      const cleanFormatted = formatted.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '').replace(/,\s*India$/, '');
      if (cleanFormatted) setCurrentAddress(cleanFormatted);
      if (Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) {
        const coords = [Number(loc.latitude), Number(loc.longitude)];
        setMapPosition(coords);
        initialMapCenterRef.current = coords;
      }
    };

    applyLoc(location);
    try {
      const stored = localStorage.getItem('userLocation');
      if (stored) applyLoc(JSON.parse(stored));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const formatted = location?.formattedAddress || location?.address;
    const cleanFormatted = formatted ? formatted.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '').replace(/,\s*India$/, '') : '';
    if (cleanFormatted) setCurrentAddress(cleanFormatted);
  }, [location?.formattedAddress, location?.address, location?.latitude, location?.longitude]);

  // Google Places autocomplete search
  useEffect(() => {
    const q = String(addressAutocompleteValue || '').trim();
    if (!googleMapsLoaded || q.length < 3) {
      setKeywordAddressSuggestions([]);
      setIsKeywordSearching(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsKeywordSearching(true);
      const opts = { country: 'in' };
      if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
        opts.lat = location.latitude;
        opts.lng = location.longitude;
        opts.radius = 50000;
      }
      autocomplete(q, opts)
        .then((predictions) => {
          if (cancelled) return;
          setIsKeywordSearching(false);
          if (!Array.isArray(predictions) || predictions.length === 0) {
            setKeywordAddressSuggestions([]);
            return;
          }
          setKeywordAddressSuggestions(
            predictions.slice(0, 6).map((p) => ({
              id: p.place_id,
              placeId: p.place_id,
              display: p.description,
            })),
          );
        })
        .catch(() => {
          if (cancelled) return;
          setIsKeywordSearching(false);
          setKeywordAddressSuggestions([]);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addressAutocompleteValue, googleMapsLoaded, location?.latitude, location?.longitude]);

  const applyGeocodedAddressToForm = useCallback((parsed, formattedOverride) => {
    const formatted = formattedOverride || parsed?.formattedAddress || parsed?.address || '';
    const cleanFormatted = formatted.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '').replace(/,\s*India$/, '');
    setCurrentAddress(cleanFormatted);

    setAddressFormData((prev) => {
      let streetVal = parsed?.area || parsed?.address || formatted.split(',')[0] || prev.street;
      if (streetVal) {
        streetVal = streetVal
          .replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '')
          .replace(/,\s*India$/, '')
          .trim();
        if (streetVal.endsWith(',')) streetVal = streetVal.slice(0, -1).trim();
      }
      return {
        ...prev,
        street: streetVal || prev.street,
        city: parsed?.city || prev.city,
        state: parsed?.state || prev.state,
        zipCode: parsed?.pincode || prev.zipCode,
      };
    });
  }, []);

  const handleMapMoveEnd = useCallback(
    async (lat, lng) => {
      if (!ENABLE_LOCATION_REVERSE_GEOCODE) return;
      if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current);
      geocodeDebounceRef.current = setTimeout(async () => {
        try {
          const parsed = await reverseGeocodeWithGoogle(lat, lng);
          applyGeocodedAddressToForm(parsed);
        } catch (e) {
          debugError('Reverse geocode error:', e);
        }
      }, 400);
    },
    [ENABLE_LOCATION_REVERSE_GEOCODE, applyGeocodedAddressToForm],
  );

  // Map shown with the form: loading until the native map is ready
  useEffect(() => {
    if (!MAPS_ENABLED || !showAddressForm) return;
    mapReadyRef.current = false;
    setMapLoading(true);
  }, [showAddressForm]);

  const onMapReady = () => {
    mapReadyRef.current = true;
    setMapLoading(false);
    if (pendingMapCenterRef.current && googleMapRef.current) {
      const pending = pendingMapCenterRef.current;
      googleMapRef.current.animateToRegion(
        { latitude: pending.lat, longitude: pending.lng, latitudeDelta: zoomDelta(pending.zoom || 17), longitudeDelta: zoomDelta(pending.zoom || 17) },
        300,
      );
      pendingMapCenterRef.current = null;
    }
  };

  // "idle": the center of the map is the chosen location
  const onRegionChangeComplete = (region) => {
    const lat = region.latitude;
    const lng = region.longitude;
    setMapPosition([lat, lng]);
    handleMapMoveEnd(lat, lng);
  };

  const handleUseCurrentLocation = async () => {
    try {
      setIsFetchingLocationState(true);
      const loc = typeof requestLocationFast === 'function' ? await requestLocationFast() : await requestLocation();
      if (loc) {
        sessionStorage.setItem('manual_location_update', 'true');
        localStorage.setItem('deliveryAddressMode', 'current');
        window.dispatchEvent(new CustomEvent('userLocationUpdated'));
        handleBack();
      } else {
        setIsFetchingLocationState(false);
      }
    } catch (e) {
      setIsFetchingLocationState(false);
      toast.error('Failed to get current location', { id: 'geo' });
    }
  };

  const handleSelectSavedAddress = async (address) => {
    const id = getAddressId(address);
    if (id) {
      sessionStorage.setItem('manual_location_update', 'true');
      setDefaultAddress(id);
      try {
        localStorage.setItem('deliveryAddressMode', 'saved');
        window.dispatchEvent(new CustomEvent('userLocationUpdated'));
        handleBack();
      } catch (e) {
        console.error('Failed to select saved address:', e);
      }
    }
  };

  const panMapToCoordinates = useCallback(async (latitude, longitude, zoom = 17) => {
    setMapPosition([latitude, longitude]);
    initialMapCenterRef.current = [latitude, longitude];

    const tryPan = () => {
      if (!googleMapRef.current || !mapReadyRef.current) return false;
      googleMapRef.current.animateToRegion({ latitude, longitude, latitudeDelta: zoomDelta(zoom), longitudeDelta: zoomDelta(zoom) }, 300);
      return true;
    };

    if (tryPan()) return;

    pendingMapCenterRef.current = { lat: latitude, lng: longitude, zoom };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!pendingMapCenterRef.current) return;
      if (tryPan()) {
        pendingMapCenterRef.current = null;
        return;
      }
    }
  }, []);

  const handleCenterMapOnMyLocation = async () => {
    if (mapGpsLoading) return;
    setMapGpsLoading(true);
    try {
      const coords = await getFreshGpsCoordinates();
      const { latitude, longitude } = coords;
      await panMapToCoordinates(latitude, longitude);
      const parsed = await reverseGeocodeWithGoogle(latitude, longitude);
      applyGeocodedAddressToForm(parsed);
      toast.success('Moved to your current location', { id: 'geo-map' });
    } catch (err) {
      console.error('Map GPS error:', err);
      if (location?.latitude && location?.longitude) {
        await panMapToCoordinates(location.latitude, location.longitude);
        applyGeocodedAddressToForm(location, location.formattedAddress || location.address);
        toast.info('Using last known location', { id: 'geo-map' });
      } else {
        toast.error('Allow location permission to use GPS', { id: 'geo-map' });
      }
    } finally {
      setMapGpsLoading(false);
    }
  };

  const handleSelectOuterSuggestion = async (sug) => {
    setIsFetchingLocationState(true);
    try {
      let lat;
      let lng;
      let display;
      let parsed;

      if (sug.placeId) {
        parsed = await geocodeGooglePlaceId(sug.placeId);
        lat = parsed.latitude;
        lng = parsed.longitude;
        display = parsed.formattedAddress;
      } else if (sug.lat && sug.lng) {
        lat = sug.lat;
        lng = sug.lng;
        display = sug.display;
        parsed = await reverseGeocodeWithGoogle(lat, lng);
      } else {
        toast.error('Could not resolve location coordinates');
        return;
      }

      const finalLoc = {
        latitude: lat,
        longitude: lng,
        city: parsed.city || '',
        state: parsed.state || '',
        country: parsed.country || 'India',
        area: parsed.area || '',
        address: parsed.address || display,
        formattedAddress: display || parsed.formattedAddress,
        pincode: parsed.pincode || '',
      };

      localStorage.setItem('userLocation', JSON.stringify(finalLoc));
      sessionStorage.setItem('manual_location_update', 'true');
      localStorage.setItem('deliveryAddressMode', 'current');
      window.dispatchEvent(new CustomEvent('userLocationUpdated'));
      handleBack();
    } catch (err) {
      console.error('Error selecting search suggestion:', err);
      toast.error('Failed to select location');
    } finally {
      setIsFetchingLocationState(false);
    }
  };

  const handleSelectMapSuggestion = async (sug) => {
    try {
      const parsed = await geocodeGooglePlaceId(sug.placeId || sug.id);
      const lat = parsed.latitude;
      const lng = parsed.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        toast.error('Could not resolve location coordinates');
        return;
      }
      await panMapToCoordinates(lat, lng);
      setAddressAutocompleteValue(parsed.formattedAddress || sug.display || '');
      applyGeocodedAddressToForm(parsed);
      setKeywordAddressSuggestions([]);
    } catch (err) {
      console.error('Error selecting map suggestion:', err);
      toast.error('Failed to select location');
    }
  };

  const resolveExistingLocation = useCallback(() => {
    if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
      return location;
    }
    try {
      const stored = localStorage.getItem('userLocation');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Number.isFinite(parsed?.latitude) && Number.isFinite(parsed?.longitude)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    if (Number.isFinite(mapPosition[0]) && Number.isFinite(mapPosition[1])) {
      return {
        latitude: mapPosition[0],
        longitude: mapPosition[1],
        formattedAddress: currentAddress,
        address: currentAddress,
      };
    }
    return null;
  }, [location, mapPosition, currentAddress]);

  const handleAddAddressClick = () => {
    if (!isAuthenticated) {
      toast.info('Please login to add an address');
      navigate('/login');
      return;
    }

    setEditingAddressId(null);
    setAddressAutocompleteValue('');
    setKeywordAddressSuggestions([]);

    const loc = resolveExistingLocation();
    if (loc?.latitude && loc?.longitude) {
      initialMapCenterRef.current = [loc.latitude, loc.longitude];
      setMapPosition([loc.latitude, loc.longitude]);
      applyGeocodedAddressToForm(loc, loc.formattedAddress || loc.address || currentAddress);
    }

    setShowAddressForm(true);
  };

  // Checkout's Home / Work / Other chip with no saved address of that type opens this page straight into "add address".
  const presetAddLabel = routerLocation.state?.addLabel;
  const presetAddHandledRef = useRef(false);
  useEffect(() => {
    if (presetAddHandledRef.current || !presetAddLabel || profileLoading) return;
    presetAddHandledRef.current = true;
    handleAddAddressClick();
    setAddressFormData((prev) => ({ ...prev, label: normalizeLabelForForm(presetAddLabel) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetAddLabel, profileLoading]);

  const handleEditAddressClick = (addr) => {
    if (!isAuthenticated) {
      toast.info('Please login to edit an address');
      navigate('/login');
      return;
    }

    const id = getAddressId(addr);
    if (!id) return;

    const coords = getAddressCoordinates(addr);
    setEditingAddressId(id);
    setAddressAutocompleteValue('');
    setKeywordAddressSuggestions([]);
    setAddressFormData({
      street: addr.street || '',
      city: addr.city || '',
      state: addr.state || '',
      zipCode: addr.zipCode || '',
      additionalDetails: addr.additionalDetails || '',
      label: normalizeLabelForForm(addr.label),
      phone: addr.phone || '',
    });
    setCurrentAddress([addr.additionalDetails, addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean).join(', '));

    if (coords) {
      initialMapCenterRef.current = [coords.lat, coords.lng];
      setMapPosition([coords.lat, coords.lng]);
    }

    setShowAddressForm(true);
  };

  const handleDeleteAddressClick = (addr) => {
    if (!isAuthenticated) {
      toast.info('Please login to delete an address');
      navigate('/login');
      return;
    }
    if (deleteCloseTimerRef.current) clearTimeout(deleteCloseTimerRef.current);
    setDeleteDialog({ address: addr, phase: 'open' });
  };

  const confirmDeleteAddress = async () => {
    const id = getAddressId(deleteDialog?.address);
    if (!id) {
      closeDeleteDialog();
      return;
    }

    setIsDeletingAddress(true);
    try {
      await deleteAddress(id);
      closeDeleteDialog();
      showAddressRemovedBrandedToast(uiTheme);
    } catch {
      toast.error('Failed to delete address');
    } finally {
      setIsDeletingAddress(false);
    }
  };

  const handleCancelAddressForm = () => {
    setAddressAutocompleteValue('');
    setKeywordAddressSuggestions([]);
    setEditingAddressId(null);
    setShowAddressForm(false);
    if (routerLocation.state?.addLabel) handleBack();
  };

  // Keyboard height (the web reads it from visualViewport)
  useEffect(() => {
    if (!showAddressForm) return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardInset(Math.max(0, e?.endCoordinates?.height || 0)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
      setKeyboardInset(0);
    };
  }, [showAddressForm]);

  const scrollFieldIntoView = useCallback(
    (fieldName) => {
      setTimeout(() => {
        try {
          const layout = fieldLayoutRef.current?.[fieldName];
          const host = formScrollRef.current;
          if (!layout || !host) return;
          const top = formCardYRef.current + layout.y;
          const bottom = top + layout.height;
          const scrollTop = formScrollTopRef.current;
          const viewport = formViewportHRef.current;
          const safeBottom = scrollTop + viewport - 90;
          const overBy = bottom - safeBottom;
          if (overBy > 0) {
            host.scrollTo({ y: scrollTop + overBy + 24, animated: true });
            return;
          }
          if (top < scrollTop + 70) {
            host.scrollTo({ y: Math.max(0, top - 70 - 12), animated: true });
          }
        } catch {
          // Ignore scrolling errors.
        }
      }, 320);
    },
    [],
  );

  const handleAddressFormSubmit = async () => {
    if (!isAuthenticated) {
      toast.info('Please login to save an address');
      navigate('/login');
      return;
    }
    if (!addressFormData.street || !addressFormData.city) {
      toast.error('Please fill required fields');
      return;
    }
    setLoadingAddress(true);
    try {
      const payload = {
        ...addressFormData,
        label: addressFormData.label === 'Work' ? 'Office' : addressFormData.label,
        location: { type: 'Point', coordinates: [mapPosition[1], mapPosition[0]] },
        latitude: mapPosition[0],
        longitude: mapPosition[1],
      };

      const locationData = () => ({
        latitude: mapPosition[0],
        longitude: mapPosition[1],
        city: addressFormData.city || '',
        state: addressFormData.state || '',
        address: [addressFormData.street, addressFormData.city, addressFormData.state, addressFormData.zipCode].filter(Boolean).join(', '),
        area: addressFormData.additionalDetails || addressFormData.street || '',
        pincode: addressFormData.zipCode || '',
        formattedAddress: [addressFormData.street, addressFormData.city, addressFormData.state, addressFormData.zipCode].filter(Boolean).join(', '),
      });

      if (editingAddressId) {
        const updated = await updateAddress(editingAddressId, payload);
        if (updated) {
          try {
            const defaultAddr = addresses.find((a) => a.isDefault) || updated;
            const isEditingDefault = String(getAddressId(defaultAddr)) === String(editingAddressId) || Boolean(updated?.isDefault);
            if (isEditingDefault) {
              sessionStorage.setItem('manual_location_update', 'true');
              localStorage.setItem('deliveryAddressMode', 'saved');
              localStorage.setItem('userLocation', JSON.stringify(locationData()));
              window.dispatchEvent(new CustomEvent('userLocationUpdated'));
            }
          } catch {
            // ignore
          }
          toast.success('Address updated');
          setEditingAddressId(null);
          setShowAddressForm(false);
        }
        return;
      }

      const created = await addAddress(payload);
      if (created) {
        const id = getAddressId(created);
        if (id) await setDefaultAddress(id);
        try {
          sessionStorage.setItem('manual_location_update', 'true');
          localStorage.setItem('deliveryAddressMode', 'saved');
          localStorage.setItem('userLocation', JSON.stringify(locationData()));
          window.dispatchEvent(new CustomEvent('userLocationUpdated'));
        } catch {
          // ignore
        }
        handleBack();
      }
    } catch (error) {
      toast.error('Failed to save address');
    } finally {
      setLoadingAddress(false);
    }
  };

  const baseMapHeight = Math.max(260, Math.min(420, Math.round(windowHeight * 0.45)));

  useEffect(() => {
    if (!showAddressForm) return;
    scrollY.setValue(0);
    formScrollTopRef.current = 0;
  }, [showAddressForm, scrollY]);

  const searchIconColor = t.dark ? colors.neutral[500] : colors.neutral[400];

  const renderSearchInput = (placeholder) => (
    <View style={s.searchWrap}>
      <View pointerEvents="none" style={s.searchIcon}>
        <Search size={20} color={searchIconColor} />
      </View>
      <Input
        value={addressAutocompleteValue}
        onChangeText={setAddressAutocompleteValue}
        placeholder={placeholder}
        placeholderTextColor={searchIconColor}
        style={s.mapSearchInput}
      />
      {addressAutocompleteValue ? (
        <Pressable
          onPress={() => setAddressAutocompleteValue('')}
          hitSlop={6}
          style={({ pressed }) => [s.clearBtn, pressed && { backgroundColor: t.dark ? colors.zinc[800] : colors.zinc[200] }]}
        >
          <X size={16} color={colors.zinc[400]} />
        </Pressable>
      ) : null}
    </View>
  );

  const renderHeader = (onBack, title, simple) => {
    const content = (
      <View style={[s.header, ui.header]}>
        <Button variant="ghost" size="icon" onPress={onBack} style={{ borderRadius: 999 }}>
          <ChevronLeft size={24} color={t.dark ? colors.white : colors.gray[900]} />
        </Button>
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          {ui.eyebrow && uiTheme.listPageEyebrow ? <Text style={ui.eyebrow}>{uiTheme.listPageEyebrow}</Text> : null}
          <Text style={simple ? ui.headerTitleSimple : ui.headerTitle}>{title}</Text>
        </View>
      </View>
    );
    return (
      <View>
        <StatusBarSpacer color={ui.header.backgroundColor} />
        {ui.blurHeader ? (
          <BlurView intensity={30} tint="light" style={{ overflow: 'hidden' }}>
            {content}
          </BlurView>
        ) : (
          content
        )}
      </View>
    );
  };

  if (showAddressForm) {
    const mapHeight = baseMapHeight;
    const initial = initialMapCenterRef.current;
    const setFieldLayout = (name) => (e) => {
      fieldLayoutRef.current[name] = e.nativeEvent.layout;
    };
    const chip = ({ value, label }) => {
      const isSelected = addressFormData.label === value;
      return (
        <Pressable
          key={value}
          onPress={() => setAddressFormData({ ...addressFormData, label: value })}
          style={[s.chip, isSelected ? ui.chipSelected : ui.chipUnselected]}
        >
          <Text style={[s.chipText, { color: isSelected ? ui.chipSelectedText : ui.chipUnselectedText }]}>{label}</Text>
        </Pressable>
      );
    };

    return (
      <Screen edges={['bottom']} bg={ui.formBg}>
        <AnimatedPage style={s.fill}>
          <PageBg ui={ui}>
            {renderHeader(handleCancelAddressForm, editingAddressId ? uiTheme.formHeaderTitleEdit : uiTheme.formHeaderTitleAdd, false)}

            <Animated.ScrollView
              ref={formScrollRef}
              style={s.fill}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 96 + keyboardInset }}
              scrollEventThrottle={16}
              onLayout={(e) => {
                formViewportHRef.current = e.nativeEvent.layout.height - keyboardInset;
              }}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                useNativeDriver: true,
                listener: (e) => {
                  formScrollTopRef.current = e.nativeEvent.contentOffset.y;
                },
              })}
            >
              {/* Map Section - Parallax */}
              <Animated.View
                style={{
                  height: mapHeight,
                  zIndex: 0,
                  transform: [{ translateY: Animated.multiply(scrollY, 0.4) }],
                  opacity: scrollY.interpolate({ inputRange: [0, 300], outputRange: [1, 0.4], extrapolate: 'clamp' }),
                }}
              >
                <View style={[StyleSheet.absoluteFill, { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
                  {MAPS_ENABLED ? (
                    <AppMap
                      ref={googleMapRef}
                      style={StyleSheet.absoluteFill}
                      initialRegion={{
                        latitude: initial[0],
                        longitude: initial[1],
                        latitudeDelta: zoomDelta(16),
                        longitudeDelta: zoomDelta(16),
                      }}
                      zoomControlEnabled
                      onMapReady={onMapReady}
                      onRegionChangeComplete={onRegionChangeComplete}
                    />
                  ) : null}
                </View>

                <CenterPin dark={t.dark} />

                {mapLoading && (
                  <View style={[StyleSheet.absoluteFill, s.mapLoading]}>
                    <Spinner size={32} color={ui.accent} bottomOnly />
                  </View>
                )}

                <View style={s.gpsBtnWrap}>
                  <Button onPress={handleCenterMapOnMyLocation} disabled={mapGpsLoading} style={s.gpsBtn} textStyle={s.gpsBtnText}>
                    <View style={s.rowCenter}>
                      {mapGpsLoading ? (
                        <View style={{ marginRight: sp(2) }}>
                          <Spinner size={16} color={ui.accent} />
                        </View>
                      ) : (
                        <Navigation size={16} color={ui.accent} style={{ marginRight: sp(2) }} />
                      )}
                      <Text style={s.gpsBtnText}>{mapGpsLoading ? 'Locating...' : 'Use My Location'}</Text>
                    </View>
                  </Button>
                </View>

                <View style={s.mapSearchPos}>
                  <View style={[s.relative, shadow['2xl']]}>
                    {renderSearchInput('Search area, street, landmark...')}
                    {isKeywordSearching && (
                      <View pointerEvents="none" style={s.searchSpinner}>
                        <Spinner size={16} color={ui.accent} />
                      </View>
                    )}
                  </View>
                  {keywordAddressSuggestions.length > 0 && (
                    <View style={s.mapSuggestions}>
                      <Text style={s.mapSuggestionsHead}>SUGGESTIONS</Text>
                      {keywordAddressSuggestions.map((sug, idx) => (
                        <Pressable
                          key={sug.id}
                          onPress={() => handleSelectMapSuggestion(sug)}
                          style={({ pressed }) => [
                            s.mapSuggestion,
                            idx < keywordAddressSuggestions.length - 1 && s.mapSuggestionBorder,
                            pressed && { backgroundColor: ui.suggestionPressed },
                          ]}
                        >
                          <MapPin size={16} color={colors.gray[400]} style={{ marginTop: 4 }} />
                          <View style={{ minWidth: 0, flex: 1 }}>
                            <Text style={s.mapSuggestionText} numberOfLines={1}>
                              {sug.display}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </Animated.View>

              <View
                style={s.formCard}
                onLayout={(e) => {
                  formCardYRef.current = e.nativeEvent.layout.y;
                }}
              >
                <View style={[s.pinnedBox, ui.pinnedBox]}>
                  <MapPin size={20} color={ui.accent} style={{ marginTop: 2 }} />
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={[ui.pinnedLabel, { marginBottom: 4 }]}>PINNED LOCATION</Text>
                    <Text style={s.pinnedText} numberOfLines={2}>
                      {currentAddress || 'Select a location on map'}
                    </Text>
                  </View>
                </View>

                <View>
                  <View onLayout={setFieldLayout('street')}>
                    <Label style={s.labelBold}>Primary Address (Street / Area / Landmark)</Label>
                    <Input
                      placeholder="Search or drag to update street/area"
                      value={addressFormData.street}
                      onChangeText={(v) => setAddressFormData({ ...addressFormData, street: v })}
                      onFocus={() => scrollFieldIntoView('street')}
                      style={[s.formInput, s.formInputMuted, { marginBottom: sp(4) }]}
                    />
                  </View>

                  <View onLayout={setFieldLayout('additionalDetails')}>
                    <Label style={[s.labelBold, { color: t.dark ? colors.gray[300] : colors.gray[700] }]}>
                      Secondary Address (House No. / Flat / Floor)
                    </Label>
                    <Input
                      placeholder="E.g. Flat 402, 4th Floor, Sunrise Apartments"
                      value={addressFormData.additionalDetails}
                      onChangeText={(v) => setAddressFormData({ ...addressFormData, additionalDetails: v })}
                      onFocus={() => scrollFieldIntoView('additionalDetails')}
                      style={[s.formInput, { borderColor: t.dark ? colors.gray[800] : colors.gray[200] }]}
                    />
                  </View>
                </View>

                <View style={s.grid2}>
                  <View style={s.flex1} onLayout={setFieldLayout('city')}>
                    <Label style={s.labelXs}>City</Label>
                    <Input
                      value={addressFormData.city}
                      onChangeText={(v) => setAddressFormData({ ...addressFormData, city: v })}
                      onFocus={() => scrollFieldIntoView('city')}
                      style={s.formInput}
                    />
                  </View>
                  <View style={s.flex1} onLayout={setFieldLayout('state')}>
                    <Label style={s.labelXs}>State</Label>
                    <Input
                      value={addressFormData.state}
                      onChangeText={(v) => setAddressFormData({ ...addressFormData, state: v })}
                      onFocus={() => scrollFieldIntoView('state')}
                      style={s.formInput}
                    />
                  </View>
                </View>

                <View onLayout={setFieldLayout('zipCode')}>
                  <Label style={s.labelXs}>Pincode / ZIP</Label>
                  <Input
                    placeholder="Pincode"
                    value={addressFormData.zipCode || ''}
                    onChangeText={(v) => setAddressFormData({ ...addressFormData, zipCode: v })}
                    onFocus={() => scrollFieldIntoView('zipCode')}
                    style={s.formInput}
                  />
                </View>

                <View>
                  <Label style={s.labelBold}>Save address as</Label>
                  <View style={s.chipRow}>
                    {[
                      { value: 'Home', label: 'Home' },
                      { value: 'Work', label: 'Work' },
                      { value: 'Other', label: 'Other' },
                    ].map(chip)}
                  </View>
                </View>
              </View>
            </Animated.ScrollView>

            <View style={[s.footerBar, ui.footerBar, { bottom: keyboardInset }]}>
              <Button style={[s.btnPrimary, ui.btnPrimary]} textStyle={ui.btnPrimaryText} onPress={handleAddressFormSubmit} disabled={loadingAddress}>
                {loadingAddress ? (editingAddressId ? 'Updating...' : 'Saving...') : editingAddressId ? 'Update Address' : 'Save Address & Proceed'}
              </Button>
            </View>
          </PageBg>
        </AnimatedPage>
      </Screen>
    );
  }

  const deleteOpen = Boolean(deleteDialog) && deleteDialog.phase !== 'exit';

  return (
    <Screen edges={['bottom']} bg={ui.pageBg}>
      <AnimatedPage style={s.fill}>
        <PageBg ui={ui}>
          {renderHeader(handleBack, uiTheme.listPageTitle, true)}

          <Animated.ScrollView style={s.fill} contentContainerStyle={{ paddingBottom: sp(10) }} keyboardShouldPersistTaps="handled">
            {/* Search Bar */}
            <View style={[s.searchSection, ui.searchSection]}>{renderSearchInput('Search for area, street name...')}</View>

            {/* Search Suggestions List */}
            {keywordAddressSuggestions.length > 0 && (
              <View style={s.outerSuggestions}>
                {keywordAddressSuggestions.map((sug, idx) => {
                  const title = sug.display.split(',')[0] || sug.display;
                  const subtitle = sug.display.split(',').slice(1).join(',').trim() || sug.display;
                  return (
                    <Pressable
                      key={sug.id}
                      onPress={() => handleSelectOuterSuggestion(sug)}
                      style={({ pressed }) => [
                        s.outerSuggestion,
                        idx > 0 && { borderTopWidth: 1, borderTopColor: t.dark ? '#1f1f23' : colors.zinc[100] },
                        pressed && { backgroundColor: ui.suggestionPressed },
                      ]}
                    >
                      <View style={[s.sugIcon, { backgroundColor: ui.suggestionIconBg }]}>
                        <MapPin size={18} color={ui.accent} />
                      </View>
                      <View style={{ minWidth: 0, flex: 1 }}>
                        <Text style={s.sugTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={s.sugSub} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={t.dark ? colors.zinc[600] : colors.zinc[300]} style={{ marginTop: 10 }} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {isKeywordSearching && (
              <View style={s.searchingBox}>
                <Spinner size={16} color={ui.accent} />
                <Text style={s.searchingText}>Searching location...</Text>
              </View>
            )}

            {/* Action Rows: Use Current Location & Add Address */}
            <View style={[s.listSection, ui.listSection]}>
              <Pressable onPress={handleUseCurrentLocation} style={({ pressed }) => [s.actionRow, pressed && { backgroundColor: ui.listRowPressed }]}>
                <View style={[s.actionIcon, { backgroundColor: ui.locationIconBg }]}>
                  <Crosshair size={20} color={ui.locationText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.actionTitle, { color: ui.locationText }]}>Use current location</Text>
                  <Text style={s.actionSub} numberOfLines={1}>
                    {currentAddress
                      ? currentAddress.replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '').replace(/,\s*India$/, '')
                      : 'Enable GPS for accuracy'}
                  </Text>
                </View>
                <ChevronRight size={20} color={t.dark ? colors.zinc[600] : colors.zinc[300]} />
              </Pressable>

              <Pressable
                onPress={handleAddAddressClick}
                style={({ pressed }) => [s.actionRow, { borderTopWidth: 1, borderTopColor: ui.divider }, pressed && { backgroundColor: ui.listRowPressed }]}
              >
                <View style={[s.actionIcon, { backgroundColor: ui.accentBgSoft }]}>
                  <Plus size={20} color={ui.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.actionTitle, { color: ui.accent }]}>Add Address</Text>
                </View>
                <ChevronRight size={20} color={t.dark ? colors.zinc[600] : colors.zinc[300]} />
              </Pressable>
            </View>

            <View style={{ padding: sp(6) }}>
              <View style={s.savedHead}>
                <Text style={s.savedHeadText}>SAVED ADDRESSES</Text>
              </View>

              <View style={{ gap: sp(4) }}>
                {profileLoading && addresses.length === 0 ? (
                  [1, 2].map((i) => (
                    <View key={i} style={s.skeletonCard}>
                      <Skeleton width={40} height={40} rounded={20} style={{ backgroundColor: t.dark ? colors.gray[800] : colors.gray[200] }} />
                      <View style={{ flex: 1, gap: sp(2) }}>
                        <Skeleton width="25%" height={16} rounded={4} style={{ backgroundColor: t.dark ? colors.gray[800] : colors.gray[200] }} />
                        <Skeleton width="75%" height={12} rounded={4} style={{ backgroundColor: t.dark ? colors.gray[800] : colors.gray[200] }} />
                      </View>
                    </View>
                  ))
                ) : addresses.length === 0 ? (
                  <View style={s.noSaved}>
                    <MapPin size={48} color={colors.gray[400]} style={{ marginBottom: sp(2) }} />
                    <Text style={{ color: t.text }}>No addresses saved yet</Text>
                  </View>
                ) : (
                  addresses.map((addr, idx) => {
                    const Icon = getAddressIcon(addr);
                    const addressLine = [addr.additionalDetails, addr.street, addr.city, addr.state]
                      .filter(Boolean)
                      .join(', ')
                      .replace(/^[a-z0-9]{2,8}\+[a-z0-9]{0,3}[,\s]*/i, '');
                    return (
                      <View key={getAddressId(addr) || idx} style={[s.savedCard, ui.savedCard]}>
                        <Pressable onPress={() => handleSelectSavedAddress(addr)} style={s.savedMain}>
                          <View style={s.savedIcon}>
                            <Icon size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={s.savedTitleRow}>
                              <Text style={s.savedTitle} numberOfLines={1}>
                                {addr.label || 'Address'}
                              </Text>
                              <View style={[s.savedChevron, { backgroundColor: ui.savedChevronBg }]}>
                                <ChevronRight size={16} color={ui.accent} strokeWidth={2.5} />
                              </View>
                            </View>
                            <Text style={s.savedLine} numberOfLines={2}>
                              {addressLine}
                            </Text>
                          </View>
                        </Pressable>
                        <View style={s.savedActions}>
                          <Pressable onPress={() => handleEditAddressClick(addr)} style={s.roundAction} accessibilityLabel="Edit address">
                            {({ pressed }) => <Pencil size={16} color={pressed ? ui.accent : colors.gray[500]} />}
                          </Pressable>
                          <Pressable onPress={() => handleDeleteAddressClick(addr)} style={s.roundAction} accessibilityLabel="Delete address">
                            {({ pressed }) => <Trash2 size={16} color={pressed ? colors.red[600] : colors.gray[500]} />}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </Animated.ScrollView>
        </PageBg>

        {isFetchingLocationState && (
          <View style={[StyleSheet.absoluteFill, s.fetchOverlay]}>
            <BlurView intensity={12} tint={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: t.dark ? alpha(dk, 0.6) : alpha('#ffffff', 0.6) }]} />
            <View style={{ width: 40, height: 40 }}>
              <View style={[StyleSheet.absoluteFill, { borderRadius: 20, borderWidth: 3, borderColor: alpha(colors.gray[100], 0.3) }]} />
              <View style={StyleSheet.absoluteFill}>
                <Spinner size={40} width={3} color={ui.accent} />
              </View>
            </View>
            <Text style={s.fetchText}>Fetching Location...</Text>
          </View>
        )}

        <Dialog open={deleteOpen} onClose={() => !isDeletingAddress && closeDeleteDialog()} dismissible={!isDeletingAddress} backdropOpacity={0.45} style={s.deleteDialog}>
          {deleteDialog ? (
            <View style={s.deleteBody}>
              <View style={{ alignItems: 'center' }}>
                <View style={s.deleteRing}>
                  <View style={s.deleteIconWrap}>
                    <Trash2 size={24} color={colors.red[600]} />
                  </View>
                </View>
                <View style={{ gap: sp(2), width: '100%' }}>
                  <Text style={s.deleteTitle}>Delete address?</Text>
                  <Text style={s.deleteText}>This action cannot be undone. You will need to add this address again.</Text>
                </View>
              </View>

              <View style={s.deletePreview}>
                <Text style={s.deletePreviewLabel}>{String(deleteDialog.address?.label || 'Address').toUpperCase()}</Text>
                <Text style={s.deletePreviewText}>{formatAddressPreview(deleteDialog.address) || 'Saved delivery address'}</Text>
              </View>

              <View style={{ marginTop: sp(6), gap: sp(3) }}>
                <Button onPress={confirmDeleteAddress} disabled={isDeletingAddress} style={s.deleteBtn} textStyle={s.deleteBtnText}>
                  {isDeletingAddress ? 'Deleting...' : 'Delete address'}
                </Button>
                <Button variant="ghost" onPress={closeDeleteDialog} disabled={isDeletingAddress} style={s.cancelBtn} textStyle={s.cancelBtnText}>
                  Cancel
                </Button>
              </View>
            </View>
          ) : null}
        </Dialog>
      </AnimatedPage>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  relative: { position: 'relative' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: sp(4), borderBottomWidth: 1 },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 0, top: 0, bottom: 0, paddingLeft: sp(4), justifyContent: 'center', zIndex: 2 },
  mapSearchInput: {
    paddingLeft: 48,
    paddingRight: 40,
    height: 56,
    backgroundColor: t.dark ? '#1a1a1a' : colors.white,
    borderWidth: 2,
    borderColor: t.dark ? colors.zinc[700] : alpha(colors.zinc[200], 0.9),
    borderRadius: 16,
    color: t.dark ? colors.zinc[50] : colors.zinc[900],
    fontWeight: '500',
    fontSize: 14,
    ...shadow.sm,
  },
  clearBtn: { position: 'absolute', right: 14, padding: 4, borderRadius: 999 },
  searchSpinner: { position: 'absolute', right: 40, top: 0, bottom: 0, justifyContent: 'center' },
  mapSearchPos: { position: 'absolute', top: sp(4), left: sp(4), right: sp(4), zIndex: 20 },
  mapSuggestions: {
    marginTop: sp(2),
    backgroundColor: t.dark ? '#1a1a1a' : colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    overflow: 'hidden',
    zIndex: 30,
    ...shadow['2xl'],
  },
  mapSuggestionsHead: {
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.gray[400],
    backgroundColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[50],
  },
  mapSuggestion: { width: '100%', paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) },
  mapSuggestionBorder: { borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[50] },
  mapSuggestionText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.dark ? colors.white : colors.gray[900] },
  mapLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha('#ffffff', 0.5), zIndex: 10 },
  gpsBtnWrap: { position: 'absolute', bottom: sp(10), right: sp(4), zIndex: 10 },
  gpsBtn: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], borderRadius: 999, height: 48, paddingHorizontal: sp(6), ...shadow.xl },
  gpsBtnText: { color: colors.black, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  formCard: {
    position: 'relative',
    backgroundColor: t.dark ? '#0a0a0a' : colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -32,
    zIndex: 10,
    padding: sp(4),
    gap: sp(6),
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -12 },
  },
  pinnedBox: { borderWidth: 1, padding: sp(4), flexDirection: 'row', gap: sp(3) },
  pinnedText: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[300] : colors.gray[700] },
  labelBold: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginBottom: sp(2) },
  labelXs: { fontSize: 12, lineHeight: 16, marginBottom: sp(1) },
  formInput: { height: 48, borderRadius: 14 },
  formInputMuted: { backgroundColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[50] },
  grid2: { flexDirection: 'row', gap: sp(4) },
  chipRow: { flexDirection: 'row', gap: sp(2) },
  chip: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  footerBar: { position: 'absolute', left: 0, right: 0, padding: sp(4), borderTopWidth: 1 },
  btnPrimary: { width: '100%', height: 48 },
  searchSection: { padding: sp(4), borderBottomWidth: 1 },
  outerSuggestions: {
    marginHorizontal: sp(4),
    marginTop: sp(2),
    marginBottom: sp(4),
    backgroundColor: t.dark ? colors.zinc[900] : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.zinc[800] : '#ececee',
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 50,
    ...shadow.xl,
  },
  outerSuggestion: { width: '100%', paddingHorizontal: sp(4), paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  sugIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  sugTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: t.dark ? colors.zinc[50] : colors.zinc[900] },
  sugSub: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.zinc[400] : colors.zinc[500], marginTop: 2 },
  searchingBox: {
    marginHorizontal: sp(4),
    marginTop: sp(2),
    marginBottom: sp(4),
    padding: sp(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
    backgroundColor: t.dark ? alpha(colors.zinc[900], 0.5) : colors.zinc[50],
    borderRadius: 14,
  },
  searchingText: { fontSize: 12, lineHeight: 16, color: colors.zinc[500] },
  listSection: { borderBottomWidth: 1 },
  actionRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: sp(4), paddingVertical: sp(4), paddingHorizontal: sp(6) },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontWeight: '700', fontSize: 15, lineHeight: 22 },
  actionSub: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.zinc[500] : colors.zinc[400], marginTop: 2 },
  savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(4) },
  savedHeadText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, color: t.dark ? colors.zinc[500] : colors.zinc[400] },
  skeletonCard: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: sp(4), padding: sp(4), backgroundColor: t.dark ? '#1a1a1a' : colors.slate[50], borderRadius: 14 },
  noSaved: { alignItems: 'center', paddingVertical: sp(10), opacity: 0.5 },
  savedCard: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), padding: sp(4), borderWidth: 1 },
  savedMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), minWidth: 0, paddingRight: 4 },
  savedIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.dark ? colors.gray[800] : colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  savedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  savedTitle: { fontWeight: '700', color: t.dark ? colors.white : colors.gray[900], textTransform: 'capitalize', flexShrink: 1 },
  savedChevron: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  savedLine: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 4, paddingRight: sp(2) },
  savedActions: { gap: 6, paddingTop: 4 },
  roundAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.dark ? colors.gray[800] : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fetchOverlay: { zIndex: 10000, alignItems: 'center', justifyContent: 'center' },
  fetchText: { marginTop: sp(4), fontSize: 13, fontWeight: '700', color: t.dark ? colors.gray[200] : colors.gray[800], letterSpacing: -0.3 },
  deleteDialog: { maxWidth: 340, borderRadius: 24, backgroundColor: t.dark ? '#1a1a1a' : colors.white, ...shadow['2xl'] },
  deleteBody: { paddingHorizontal: sp(6), paddingTop: sp(8), paddingBottom: sp(6) },
  deleteRing: { padding: 8, borderRadius: 999, backgroundColor: t.dark ? alpha(colors.red[950], 0.2) : alpha(colors.red[50], 0.6), marginTop: -8, marginBottom: sp(4) - 8 },
  deleteIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.dark ? alpha(colors.red[950], 0.3) : colors.red[50], alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: t.dark ? colors.white : colors.zinc[900], textAlign: 'center' },
  deleteText: { fontSize: 14, lineHeight: 22, color: t.dark ? colors.zinc[400] : colors.zinc[500], textAlign: 'center' },
  deletePreview: {
    marginTop: sp(5),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.dark ? colors.zinc[800] : colors.zinc[100],
    backgroundColor: t.dark ? alpha(colors.zinc[900], 0.6) : colors.zinc[50],
    paddingHorizontal: sp(4),
    paddingVertical: 14,
  },
  deletePreviewLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, color: t.dark ? colors.zinc[500] : colors.zinc[400], marginBottom: 4 },
  deletePreviewText: { fontSize: 14, lineHeight: 22, fontWeight: '500', color: t.dark ? colors.zinc[100] : colors.zinc[800] },
  deleteBtn: { width: '100%', height: 48, borderRadius: 14, backgroundColor: colors.red[600], ...shadow.sm },
  deleteBtnText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  cancelBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.dark ? colors.zinc[700] : alpha(colors.zinc[200], 0.8),
    backgroundColor: t.dark ? alpha(colors.zinc[800], 0.9) : colors.zinc[100],
    ...shadow.sm,
  },
  cancelBtnText: { color: t.dark ? colors.zinc[100] : colors.zinc[700], fontWeight: '600', fontSize: 15 },
}));
