import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Contact,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  User,
  X,
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Sheet, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { alpha, makeStyles, useTheme } from '@/theme';
import { cleanGroundAddress, loadRoadDistances } from '../../utils/preciseLocation';
import { HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import { googleMapsCompat } from '../../../../../../shared/maps/placesCompat';
import { userAuthService } from '../../services/authService';
import api from '../../../../shared/api/axiosInstance';
import { computeDrivingRoute, sumComputedRouteLegs } from '../../../../shared/utils/googleRoutes';
import { clearParcelPickerResult, peekParcelPickerResult } from '../../utils/parcelPickerResult';
import { getSavedLocation, getSavedLocationCoords } from '../../services/locationStore';
import {
  dedupePlaces,
  formatDistance,
  isAreaPlace,
  keepNearbyPredictions,
  loadAreaHints,
  loadPopularPlaces,
  nearbyAutocompleteRequest,
  withAreaHint,
} from '../../utils/nearbyPlaces';
import { PendingCancellationDueNotice } from '../../components/CancellationFeeNotice';

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
  ink: '#0B1220',
});
const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const PHONE_REGEX = /^[6-9]\d{9}$/;
const PARCEL_BOOKING_DRAFT_KEY = 'parcelBookingDraft';
const DELIVERY_CATEGORY_SEARCH_TOKENS = {
  trucks: ['truck', 'lcv', 'hcv', 'mcv', 'loader'],
  '2wheeler': ['bike', 'scooter', 'cycle', '2-wheeler'],
  movers: ['mover', 'packers'],
};
// Only a last-resort map viewport when nothing is known yet (centre of India) - never a city.
const DEFAULT_COORDS = { lat: 20.5937, lng: 78.9629 };

const unwrapResults = (response) => {
  const payload = response?.data?.data || response?.data || response;
  return payload?.results || payload?.zones || (Array.isArray(payload) ? payload : []);
};

const isZoneActive = (zone) => zone?.active !== false && Number(zone?.status ?? 1) !== 0;

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

const readStoredUserInfo = () => {
  try {
    return JSON.parse(window.localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const readParcelBookingDraft = () => {
  try {
    return JSON.parse(window.sessionStorage.getItem(PARCEL_BOOKING_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
};

const coordPairToLatLng = (coords, fallback = DEFAULT_COORDS) => {
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return fallback;
};

const latLngToCoordPair = (position) => [Number(position.lng), Number(position.lat)];

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (fromCoords, toCoords) => {
  const from = coordPairToLatLng(fromCoords, null);
  const to = coordPairToLatLng(toCoords, null);

  if (!from || !to) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const normalizeDeliveryPricing = (vehicle = {}) => {
  const basePrice = Number(vehicle?.delivery_distance_pricing?.base_price ?? 0);
  const baseDistance = Number(
    vehicle?.delivery_distance_pricing?.base_distance
      ?? vehicle?.delivery_distance_pricing?.free_distance
      ?? 0,
  );
  const distancePrice = Number(vehicle?.delivery_distance_pricing?.distance_price ?? 0);
  const serviceTaxPercentage = Number(vehicle?.service_tax ?? 0);

  return {
    enabled: Boolean(
      vehicle?.delivery_distance_pricing?.enabled ||
      basePrice > 0 ||
      distancePrice > 0
    ),
    basePrice,
    baseDistance,
    distancePrice,
    serviceTaxPercentage,
  };
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateVehicleFare = (vehicle, distanceKm) => {
  const pricing = normalizeDeliveryPricing(vehicle);
  if (!pricing.enabled) {
    return null;
  }

  const normalizedDistanceKm = Math.max(Number(distanceKm || 0), 0);
  const extraDistanceKm = Math.max(normalizedDistanceKm - pricing.baseDistance, 0);
  const distanceCharge = extraDistanceKm * pricing.distancePrice;
  const subtotal = pricing.basePrice + distanceCharge;
  const serviceTaxAmount = (subtotal * pricing.serviceTaxPercentage) / 100;
  const total = subtotal + serviceTaxAmount;

  return {
    total: Math.max(0, roundCurrency(total)),
    subtotal: roundCurrency(subtotal),
    basePrice: pricing.basePrice,
    baseDistance: pricing.baseDistance,
    distancePrice: pricing.distancePrice,
    extraDistanceKm: roundCurrency(extraDistanceKm),
    distanceCharge: roundCurrency(distanceCharge),
    serviceTaxPercentage: roundCurrency(pricing.serviceTaxPercentage),
    serviceTaxAmount: roundCurrency(serviceTaxAmount),
  };
};

const formatLatLngLabel = (position) => `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
const getLatLngCacheKey = (position, precision = 5) =>
  `${Number(position?.lat || 0).toFixed(precision)},${Number(position?.lng || 0).toFixed(precision)}`;
const getCoordPairCacheKey = (coords, precision = 5) =>
  Array.isArray(coords) && coords.length >= 2
    ? `${Number(coords[1] || 0).toFixed(precision)},${Number(coords[0] || 0).toFixed(precision)}`
    : '';
const getParcelRouteCacheKey = (pickupCoords, dropCoords) =>
  `${getCoordPairCacheKey(pickupCoords)}|${getCoordPairCacheKey(dropCoords)}`;
const COORDINATE_LABEL_REGEX = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const isCoordinateLabel = (value = '') => COORDINATE_LABEL_REGEX.test(String(value || '').trim());
const getVehicleId = (vehicle) => String(vehicle?._id || vehicle?.id || '').trim();
const isDeliveryVehicle = (vehicle) => vehicle?.active && ['delivery', 'both'].includes(String(vehicle?.transport_type || '').trim().toLowerCase());
const matchesDeliveryCategory = (vehicle, categoryId) => {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  if (!normalizedCategoryId) return false;

  const configuredCategory = String(vehicle?.delivery_category || '').trim().toLowerCase();
  if (configuredCategory) {
    return configuredCategory === normalizedCategoryId;
  }

  const searchTokens = DELIVERY_CATEGORY_SEARCH_TOKENS[normalizedCategoryId] || [];
  const vehicleName = String(vehicle?.name || '').toLowerCase();
  const iconType = String(vehicle?.icon_types || '').toLowerCase();
  return searchTokens.some((token) => vehicleName.includes(token) || iconType.includes(token));
};

const PhoneInput = ({ label, value, onValueChange, error, name, onClearError, disabled = false }) => {
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const isValid = value && PHONE_REGEX.test(value);
  const boxTone = error
    ? { borderColor: t.dark ? 'rgba(153,27,27,0.4)' : '#fecaca', backgroundColor: u.soft }
    : isValid
      ? { borderColor: t.dark ? 'rgba(6,95,70,0.4)' : '#d1fae5', backgroundColor: u.soft }
      : { borderColor: u.border, backgroundColor: u.card };
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.phoneLabel}>{String(label).toUpperCase()}</Text>
      <View style={[s.phoneBox, boxTone]}>
        <Phone size={18} color={error ? '#ef4444' : isValid ? '#10b981' : u.text2} />
        <TextInput
          keyboardType="phone-pad"
          maxLength={10}
          editable={!disabled}
          style={s.phoneInput}
          value={value}
          placeholder="10-digit mobile number"
          placeholderTextColor="#cbd5e1"
          onChangeText={(text) => {
            const nextValue = text.replace(/\D/g, '');
            onValueChange(nextValue);
            if (onClearError) onClearError(name, nextValue);
          }}
        />
        {isValid ? <CheckCircle2 size={18} color="#10b981" /> : null}
      </View>
      {error ? (
        <View style={s.phoneErrorRow}>
          <AlertCircle size={11} strokeWidth={3} color="#ef4444" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const ContactDetailsSheet = ({
  open,
  onClose,
  onSave,
  senderName,
  setSenderName,
  senderMobile,
  setSenderMobile,
  useSelfForReceiver,
  setUseSelfForReceiver,
  receiverName,
  setReceiverName,
  receiverMobile,
  setReceiverMobile,
  errors,
  clearError,
}) => {
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const nameBox = (hasError) => (hasError
    ? { borderColor: t.dark ? 'rgba(153,27,27,0.4)' : '#fecaca', backgroundColor: u.soft }
    : { borderColor: u.border, backgroundColor: u.card });

  return (
    <Sheet open={open} onClose={onClose} backdropOpacity={0.4} style={s.sheet}>
      <View style={s.sheetHeader}>
        <View>
          <Text style={s.sheetEyebrow}>BOOKING DETAILS</Text>
          <Text style={s.sheetTitle}>Sender & receiver</Text>
        </View>
        <Pressable onPress={onClose} style={s.sheetClose}>
          <X size={18} color={u.muted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ maxHeight: Dimensions.get('window').height * 0.75 }}
        contentContainerStyle={s.sheetBody}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 16 }}>
          <View style={s.blockHead}>
            <View style={s.blockIcon}>
              <User size={16} color={t.dark ? '#34d399' : '#059669'} />
            </View>
            <Text style={s.blockTitle}>Sender</Text>
          </View>

          <View style={{ gap: 8 }}>
            <View style={[s.nameBox, nameBox(errors.senderName)]}>
              <User size={16} color={u.text2} />
              <TextInput
                value={senderName}
                placeholder="Sender name"
                placeholderTextColor="#cbd5e1"
                onChangeText={(text) => {
                  setSenderName(text);
                  clearError('senderName');
                }}
                style={s.nameInput}
              />
            </View>
            {errors.senderName ? <Text style={s.errorText}>{errors.senderName}</Text> : null}
          </View>

          <PhoneInput label="Mobile Number" value={senderMobile} onValueChange={setSenderMobile} error={errors.senderMobile} name="senderMobile" onClearError={clearError} />
        </View>

        <View style={{ gap: 16 }}>
          <View style={s.blockHead}>
            <View style={s.blockIcon}>
              <Contact size={16} color={t.dark ? '#fb923c' : '#ea580c'} />
            </View>
            <Text style={s.blockTitle}>Receiver</Text>
          </View>

          <Pressable onPress={() => setUseSelfForReceiver(!useSelfForReceiver)} style={s.selfRow}>
            <View
              style={[
                s.checkbox,
                useSelfForReceiver
                  ? { backgroundColor: t.dark ? '#ffffff' : '#0f172a', borderColor: t.dark ? '#ffffff' : '#0f172a' }
                  : null,
              ]}
            >
              {useSelfForReceiver ? <CheckCircle2 size={12} color={u.text} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.selfTitle}>Same as Sender</Text>
              <Text style={s.selfSub}>Use sender&apos;s name and mobile for receiver</Text>
            </View>
          </Pressable>

          <View style={{ gap: 8 }}>
            <View style={[s.nameBox, nameBox(errors.receiverName), useSelfForReceiver ? { opacity: 0.7 } : null]}>
              <User size={16} color={u.text2} />
              <TextInput
                value={receiverName}
                placeholder="Receiver name"
                placeholderTextColor="#cbd5e1"
                editable={!useSelfForReceiver}
                onChangeText={(text) => {
                  setReceiverName(text);
                  clearError('receiverName');
                }}
                style={s.nameInput}
              />
            </View>
            {errors.receiverName ? <Text style={s.errorText}>{errors.receiverName}</Text> : null}
          </View>

          <PhoneInput label="Mobile Number" value={receiverMobile} onValueChange={setReceiverMobile} error={errors.receiverMobile} name="receiverMobile" onClearError={clearError} disabled={useSelfForReceiver} />
        </View>
      </ScrollView>

      <View style={s.sheetFooter}>
        <Pressable onPress={onSave} style={({ pressed }) => [s.saveButton, pressed && { opacity: 0.9 }]}>
          <Text style={s.saveText}>Save Details</Text>
          <ChevronRight size={16} color={u.ink} />
        </Pressable>
      </View>
    </Sheet>
  );
};

function FadeUp({ delay = 0, y = 20, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function PulseView({ style, children }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

const SenderReceiverDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const isDark = t.dark;
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  // No script to load natively: Geocoder / Places / Routes are always available (when a key is configured).
  const isGoogleMapsLoaded = HAS_VALID_GOOGLE_MAPS_KEY;
  const storedParcelDraft = useMemo(() => readParcelBookingDraft(), []);
  // The place picker comes back with one history step, so this screen gets its old router state again:
  // the place just picked is handed over separately and wins over that state.
  const pickerResult = useMemo(() => peekParcelPickerResult() || {}, []);
  useEffect(() => { clearParcelPickerResult(); }, []);
  const parcelState = useMemo(
    () => ({ ...storedParcelDraft, ...(location.state || {}), ...pickerResult }),
    [location.state, storedParcelDraft, pickerResult],
  );
  const storedUser = useMemo(() => readStoredUserInfo(), []);
  const [senderName, setSenderName] = useState(() => parcelState.senderName || storedUser?.name || '');
  const [senderMobile, setSenderMobile] = useState(() => parcelState.senderMobile || storedUser?.phone || '');
  const [useSelfForReceiver, setUseSelfForReceiver] = useState(() => {
    const receiverNameSeed = String(parcelState.receiverName || '').trim();
    const receiverMobileSeed = String(parcelState.receiverMobile || '').trim();
    const userNameSeed = String(storedUser?.name || '').trim();
    const userPhoneSeed = String(storedUser?.phone || '').trim();
    return Boolean(
      receiverNameSeed &&
      receiverMobileSeed &&
      receiverNameSeed === userNameSeed &&
      receiverMobileSeed === userPhoneSeed,
    );
  });
  const [receiverName, setReceiverName] = useState(() => parcelState.receiverName || '');
  const [receiverMobile, setReceiverMobile] = useState(() => parcelState.receiverMobile || '');
  // The location the user already chose (shown in the header) is the pickup at once; GPS is only asked when there is none.
  const [pickup, setPickup] = useState(() => parcelState.pickup || (getSavedLocationCoords() ? getSavedLocation()?.address : '') || '');
  const [drop, setDrop] = useState(() => parcelState.drop || '');
  const [pickupCoords, setPickupCoords] = useState(() => parcelState.pickupCoords || getSavedLocationCoords() || null);
  const [dropCoords, setDropCoords] = useState(() => parcelState.dropCoords || null);
  const [activeInput, setActiveInput] = useState(() => {
    const seed = { ...(location.state || {}), ...pickerResult };
    if (seed.activeInput === 'pickup' || seed.editPickup) {
      return 'pickup';
    }
    return 'drop';
  });
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [, setIsLocatingPickup] = useState(false);
  const [errors, setErrors] = useState({});
  // "What are you sending?" - the goods types the admin created (Admin > Goods Types). The choice decides which vehicles fit.
  const [goodsTypes, setGoodsTypes] = useState([]);
  const [selectedGoodsId, setSelectedGoodsId] = useState(() => String(parcelState.selectedGoodsType?._id || parcelState.selectedGoodsType?.id || ''));
  useEffect(() => {
    let active = true;
    api.get('/users/goods-types')
      .then((response) => {
        const payload = response?.data?.data || response?.data || response;
        const list = Array.isArray(payload?.results) ? payload.results : (Array.isArray(payload) ? payload : []);
        if (active) setGoodsTypes(list.filter((item) => Number(item.active ?? 1) === 1 && (item.name || item.goods_type_name)));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const selectedGoods = goodsTypes.find((item) => String(item._id || item.id) === selectedGoodsId) || null;
  const [recoveredSelectedVehicles, setRecoveredSelectedVehicles] = useState([]);
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [, setZones] = useState([]);
  const [, setZonePaths] = useState([]);
  const [routeEstimate, setRouteEstimate] = useState({ distanceKm: 0, durationMinutes: 0, source: 'air' });
  const autoPickupRequestedRef = useRef(false);
  const livePickupHydratedRef = useRef(false);
  const dropInputRef = useRef(null);
  const dropGeocodeTimerRef = useRef(null);
  const dropSuggestionTimerRef = useRef(null);
  const dropSuggestionCacheRef = useRef(new Map());
  const autocompleteServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const addressLookupCacheRef = useRef(new Map());
  const placeIdLookupCacheRef = useRef(new Map());
  const routeEstimateCacheRef = useRef(new Map());
  const scrollRef = useRef(null);
  const goodsSectionYRef = useRef(0);

  useEffect(() => {
    window.sessionStorage.setItem(PARCEL_BOOKING_DRAFT_KEY, JSON.stringify({
      ...parcelState,
      senderName,
      senderMobile,
      receiverName,
      receiverMobile,
      pickup,
      drop,
      pickupCoords,
      dropCoords,
    }));
  }, [drop, dropCoords, parcelState, pickup, pickupCoords, receiverMobile, receiverName, senderMobile, senderName]);

  useEffect(() => {
    let active = true;

    const loadZoneData = async () => {
      try {
        const zonesResponse = await api.get('/users/zones');
        if (!active) {
          return;
        }

        const allZones = unwrapResults(zonesResponse).filter(isZoneActive);
        const allPaths = allZones.map(normalizeZonePath).filter((path) => path.length >= 3);

        setZones(allZones);
        setZonePaths(allPaths);
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
  }, []);

  useEffect(() => {
    if (dropInputRef.current) {
      dropInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateSenderDetails = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || response?.data?.data || {};

        if (!active || (!user?.name && !user?.phone)) return;

        const nextName = user.name || '';
        const nextPhone = user.phone || '';

        if (nextName || nextPhone) {
          window.localStorage.setItem('userInfo', JSON.stringify({ ...storedUser, ...user }));
        }

        setSenderName((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.name || '').trim() ? nextName || current : current));
        setSenderMobile((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.phone || '').trim() ? nextPhone || current : current));
      } catch {
        // ignore and keep fallback info
      }
    };

    hydrateSenderDetails();

    return () => {
      active = false;
    };
  }, [storedUser]);

  useEffect(() => {
    const selectedVehicleIds = Array.isArray(parcelState.selectedVehicleIds)
      ? parcelState.selectedVehicleIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const selectedVehicleId = String(parcelState.selectedVehicleId || '').trim();
    const selectedIdSet = new Set([...selectedVehicleIds, selectedVehicleId].filter(Boolean));
    const deliveryCategory = String(parcelState.deliveryCategory || parcelState.category || '').trim().toLowerCase();

    if (!selectedIdSet.size && !deliveryCategory) {
      setRecoveredSelectedVehicles([]);
      return undefined;
    }

    let active = true;

    const recoverSelectedVehicles = async () => {
      try {
        const response = await api.get('/users/vehicle-types');
        const items = response?.data?.results || response?.results || response?.data?.data?.results || [];
        const deliveryVehicles = Array.isArray(items) ? items.filter(isDeliveryVehicle) : [];

        let matchedVehicles = deliveryVehicles.filter((vehicle) => selectedIdSet.has(getVehicleId(vehicle)));
        if (matchedVehicles.length === 0 && deliveryCategory) {
          matchedVehicles = deliveryVehicles.filter((vehicle) => matchesDeliveryCategory(vehicle, deliveryCategory));
        }

        if (!active) return;
        setRecoveredSelectedVehicles(matchedVehicles);
      } catch {
        if (!active) return;
        setRecoveredSelectedVehicles([]);
      }
    };

    recoverSelectedVehicles();

    return () => {
      active = false;
    };
  }, [parcelState.category, parcelState.deliveryCategory, parcelState.selectedVehicle, parcelState.selectedVehicleId, parcelState.selectedVehicleIds, parcelState.selectedVehicles]);

  const query = useMemo(() => (activeInput === 'pickup' ? pickup : drop), [activeInput, drop, pickup]);

  // Popular places around the pickup, nearest first - looked up live, never a fixed city list.
  const [popularNearby, setPopularNearby] = useState([]);
  const popularOriginLng = Array.isArray(pickupCoords) ? pickupCoords[0] : null;
  const popularOriginLat = Array.isArray(pickupCoords) ? pickupCoords[1] : null;
  useEffect(() => {
    if (!isGoogleMapsLoaded || !google?.maps?.places?.PlacesService
      || !Number.isFinite(Number(popularOriginLat)) || !Number.isFinite(Number(popularOriginLng))) {
      return undefined;
    }
    let cancelled = false;
    const placesService = new google.maps.places.PlacesService(null);
    loadPopularPlaces(google, placesService, [Number(popularOriginLng), Number(popularOriginLat)]).then((places) => {
      if (!cancelled) setPopularNearby(places);
    });
    return () => {
      cancelled = true;
    };
  }, [isGoogleMapsLoaded, popularOriginLat, popularOriginLng]);

  // Landmark for area results ("Vijay Nagar" -> near Bhawarkua Square), so two areas with one name can be told apart.
  const [areaHints, setAreaHints] = useState({});
  useEffect(() => {
    if (!isGoogleMapsLoaded || !google?.maps) return undefined;
    const wanted = googleSuggestions.filter((item) => item.placeId && isAreaPlace(item.types) && areaHints[item.placeId] === undefined);
    if (wanted.length === 0) return undefined;
    let cancelled = false;
    loadAreaHints(google, wanted).then((found) => {
      if (cancelled) return;
      setAreaHints((prev) => {
        const next = { ...prev };
        wanted.forEach((item) => { next[item.placeId] = found[item.placeId] || ''; });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleSuggestions, isGoogleMapsLoaded]);

  // The distance on a row is the road distance from the pickup (what Google Maps shows, same as the ride screen), not
  // the straight line. null = Google has no road route / the service is off: the straight-line figure is shown then.
  const [roadMeters, setRoadMeters] = useState({});
  const roadKey = (item) => String(item?.placeId || (Array.isArray(item?.coords) ? item.coords.join(',') : item?.title || ''));
  useEffect(() => { setRoadMeters({}); }, [popularOriginLat, popularOriginLng]);
  useEffect(() => {
    if (!isGoogleMapsLoaded || !google?.maps
      || !Number.isFinite(Number(popularOriginLat)) || !Number.isFinite(Number(popularOriginLng))) {
      return undefined;
    }
    const wanted = [...googleSuggestions, ...popularNearby]
      .filter((item) => (item.placeId || Array.isArray(item.coords)) && roadMeters[roadKey(item)] === undefined)
      .slice(0, 10);
    if (wanted.length === 0) return undefined;
    let cancelled = false;
    loadRoadDistances(google, [Number(popularOriginLng), Number(popularOriginLat)], wanted).then((meters) => {
      if (cancelled) return;
      setRoadMeters((prev) => {
        const next = { ...prev };
        wanted.forEach((item, index) => {
          next[roadKey(item)] = meters && Number.isFinite(meters[index]) ? meters[index] : null;
        });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleSuggestions, popularNearby, isGoogleMapsLoaded, popularOriginLat, popularOriginLng]);
  const distanceTextFor = (item) => {
    const meters = roadMeters[roadKey(item)];
    if (Number.isFinite(meters)) return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
    return meters === null ? item.distanceLabel || '' : '';
  };
  const selectedAreaHint = (suggestion) => (suggestion?.placeId && isAreaPlace(suggestion.types) ? areaHints[suggestion.placeId] || '' : '');

  const selectedVehicles = useMemo(() => {
    if (Array.isArray(recoveredSelectedVehicles) && recoveredSelectedVehicles.length) {
      return recoveredSelectedVehicles;
    }
    return [];
  }, [recoveredSelectedVehicles]);
  const primarySelectedVehicle = useMemo(() => {
    return selectedVehicles[0] || null;
  }, [selectedVehicles]);
  const estimatedDistanceKm = useMemo(
    () => calculateDistanceKm(pickupCoords, dropCoords),
    [dropCoords, pickupCoords],
  );
  const effectiveDistanceKm = Number(routeEstimate?.distanceKm || 0) > 0
    ? Number(routeEstimate.distanceKm)
    : estimatedDistanceKm;

  useEffect(() => {
    let active = true;
    const routeCacheKey = getParcelRouteCacheKey(pickupCoords, dropCoords);

    if (!Array.isArray(pickupCoords) || pickupCoords.length !== 2 || !Array.isArray(dropCoords) || dropCoords.length !== 2) {
      setRouteEstimate({ distanceKm: 0, durationMinutes: 0, source: 'air' });
      return undefined;
    }

    // web: `!isLoaded || !window.google?.maps?.importLibrary` — natively the Routes API is called over HTTPS
    if (!isGoogleMapsLoaded) {
      setRouteEstimate({ distanceKm: estimatedDistanceKm, durationMinutes: 0, source: 'air' });
      return undefined;
    }

    const cachedRouteEstimate = routeEstimateCacheRef.current.get(routeCacheKey);
    if (cachedRouteEstimate) {
      setRouteEstimate(cachedRouteEstimate);
      return undefined;
    }

    void (async () => {
      const result = await computeDrivingRoute({
        origin: coordPairToLatLng(pickupCoords),
        destination: coordPairToLatLng(dropCoords),
      });

      if (!active) {
        return;
      }

      if (result.status !== 'OK' || !result.legs.length) {
        const fallbackEstimate = { distanceKm: estimatedDistanceKm, durationMinutes: 0, source: 'air' };
        routeEstimateCacheRef.current.set(routeCacheKey, fallbackEstimate);
        setRouteEstimate(fallbackEstimate);
        return;
      }

      const totals = sumComputedRouteLegs(result.legs);
      const nextRouteEstimate = {
        distanceKm: roundCurrency(totals.distanceMeters / 1000),
        durationMinutes: Math.max(0, Math.ceil(totals.durationSeconds / 60)),
        source: 'road',
      };
      routeEstimateCacheRef.current.set(routeCacheKey, nextRouteEstimate);
      setRouteEstimate(nextRouteEstimate);
    })();

    return () => {
      active = false;
    };
  }, [dropCoords, estimatedDistanceKm, isGoogleMapsLoaded, pickupCoords]);

  const estimatedFare = useMemo(() => {
    if (!drop.trim()) {
      return null;
    }

    const primaryFare = calculateVehicleFare(primarySelectedVehicle, effectiveDistanceKm);
    if (!Number.isFinite(primaryFare?.total)) {
      return null;
    }

    return {
      min: primaryFare.total,
      max: primaryFare.total,
      approx: Math.round(primaryFare.total),
      dynamic: true,
      minBaseDistance: Number(primaryFare.baseDistance || 0),
      maxBaseDistance: Number(primaryFare.baseDistance || 0),
      subtotal: Number(primaryFare.subtotal || 0),
      serviceTaxPercentage: Number(primaryFare.serviceTaxPercentage || 0),
      serviceTaxAmount: Number(primaryFare.serviceTaxAmount || 0),
    };
  }, [drop, effectiveDistanceKm, primarySelectedVehicle]);

  const validate = () => {
    const nextErrors = {};
    if (!senderName.trim()) nextErrors.senderName = 'Sender name is required';
    if (!PHONE_REGEX.test(senderMobile)) nextErrors.senderMobile = 'Enter a valid 10-digit number';
    if (!receiverName.trim()) nextErrors.receiverName = 'Receiver name is required';
    if (!PHONE_REGEX.test(receiverMobile)) nextErrors.receiverMobile = 'Enter a valid 10-digit number';
    if (!pickup.trim()) nextErrors.pickup = 'Pickup location is required';
    if (!drop.trim()) nextErrors.drop = 'Drop location is required';
    if (goodsTypes.length > 0 && !selectedGoods) nextErrors.goods = 'Select what you are sending';
    setErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      nextErrors,
    };
  };

  const clearError = (key) => {
    if (!errors[key]) return;
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const syncReceiverWithSelf = () => {
    const nextName = String(storedUser?.name || senderName || '').trim();
    const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

    setReceiverName(nextName);
    setReceiverMobile(nextPhone);
    setErrors((prev) => ({
      ...prev,
      receiverName: '',
      receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
    }));
  };

  useEffect(() => {
    if (!useSelfForReceiver) return;
    const timer = setTimeout(() => {
      const nextName = String(storedUser?.name || senderName || '').trim();
      const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

      setReceiverName(nextName);
      setReceiverMobile(nextPhone);
      setErrors((prev) => ({
        ...prev,
        receiverName: '',
        receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
      }));
    }, 0);

    return () => clearTimeout(timer);
  }, [senderMobile, senderName, storedUser, useSelfForReceiver]);

  const validatePhoneField = (key, value) => {
    const trimmedValue = String(value || '').trim();

    setErrors((prev) => {
      const nextError = trimmedValue && !PHONE_REGEX.test(trimmedValue) ? 'Enter a valid 10-digit number' : '';
      if (prev[key] === nextError) return prev;
      return { ...prev, [key]: nextError };
    });
  };

  const clearPhoneError = (key, value) => {
    validatePhoneField(key, value);
  };

  const openSharedLocationPicker = (targetInput) => {
    navigate(`${routePrefix}/ride/select-location`, {
      state: {
        ...parcelState,
        flow: 'parcel',
        returnTo: `${routePrefix}/parcel/details`,
        openMapPicker: true,
        activeInput: targetInput,
        editPickup: targetInput === 'pickup',
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        senderName,
        senderMobile,
        receiverName,
        receiverMobile,
      },
    });
  };

  const resolveAddressFromCoords = useEffectEvent((position) =>
    new Promise((resolve) => {
      const cacheKey = getLatLngCacheKey(position);
      const cachedAddress = addressLookupCacheRef.current.get(cacheKey);
      if (cachedAddress) {
        resolve(cachedAddress);
        return;
      }

      if (!isGoogleMapsLoaded || !google?.maps?.Geocoder) {
        resolve(formatLatLngLabel(position));
        return;
      }
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results?.[0]?.formatted_address) {
          addressLookupCacheRef.current.set(cacheKey, cleanGroundAddress(results[0].formatted_address));
          resolve(cleanGroundAddress(results[0].formatted_address));
          return;
        }
        resolve(formatLatLngLabel(position));
      });
    }));

  // plain function (not useEffectEvent): the submit/suggestion handlers call it, and effect events may only be called from effects
  const resolveCoordsFromAddress = ((address) =>
    new Promise((resolve) => {
      const trimmedAddress = String(address || '').trim();
      const cacheKey = trimmedAddress.toLowerCase();
      const cachedCoords = addressLookupCacheRef.current.get(cacheKey);
      if (cachedCoords) {
        resolve(cachedCoords);
        return;
      }

      if (!trimmedAddress || !isGoogleMapsLoaded || !google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new google.maps.Geocoder();
      const addressQuery = /indore/i.test(trimmedAddress) ? trimmedAddress : `${trimmedAddress}, Indore`;

      geocoder.geocode({ address: addressQuery }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        const resolvedCoords = latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() });
        addressLookupCacheRef.current.set(cacheKey, resolvedCoords);
        resolve(resolvedCoords);
      });
    }));

  // plain function (not useEffectEvent): the submit/suggestion handlers call it, and effect events may only be called from effects
  const resolveCoordsFromPlaceId = ((placeId) =>
    new Promise((resolve) => {
      const trimmedPlaceId = String(placeId || '').trim();
      const cachedCoords = placeIdLookupCacheRef.current.get(trimmedPlaceId);
      if (cachedCoords) {
        resolve(cachedCoords);
        return;
      }

      if (!trimmedPlaceId || !isGoogleMapsLoaded || !google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ placeId: trimmedPlaceId }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        const resolvedCoords = latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() });
        placeIdLookupCacheRef.current.set(trimmedPlaceId, resolvedCoords);
        resolve(resolvedCoords);
      });
    }));

  const requestCurrentPickupLocation = useEffectEvent(() => {
    if (!navigator.geolocation) {
      setErrors((prev) => ({ ...prev, pickup: 'Current location is not available' }));
      return;
    }

    setIsLocatingPickup(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        const coords = latLngToCoordPair(next);
        const address = await resolveAddressFromCoords(next);
        setPickupCoords(coords);
        setPickup(address || formatLatLngLabel(next));
        clearError('pickup');
        setIsLocatingPickup(false);
      },
      () => {
        setIsLocatingPickup(false);
        setErrors((prev) => ({ ...prev, pickup: 'Location permission denied' }));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });

  useEffect(() => {
    if (autoPickupRequestedRef.current || livePickupHydratedRef.current) return;
    if (pickup && pickupCoords) return;
    autoPickupRequestedRef.current = true;
    livePickupHydratedRef.current = true;
    const timer = setTimeout(() => {
      requestCurrentPickupLocation();
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pickupCoords || !pickup || !isCoordinateLabel(pickup) || !isGoogleMapsLoaded) {
      return;
    }

    let active = true;

    resolveAddressFromCoords(coordPairToLatLng(pickupCoords)).then((resolvedAddress) => {
      if (!active || !resolvedAddress || isCoordinateLabel(resolvedAddress)) {
        return;
      }

      setPickup((current) => (isCoordinateLabel(current) ? resolvedAddress : current));
    });

    return () => {
      active = false;
    };
  }, [isGoogleMapsLoaded, pickup, pickupCoords]);

  useEffect(() => {
    const trimmedQuery = String(query || '').trim();

    clearTimeout(dropGeocodeTimerRef.current);
    clearTimeout(dropSuggestionTimerRef.current);

    if (!trimmedQuery) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (!isGoogleMapsLoaded || isCoordinateLabel(trimmedQuery)) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (trimmedQuery.length < 3 || !google?.maps?.places?.AutocompleteService) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}|${activeInput}|${Array.isArray(pickupCoords) ? pickupCoords.join(',') : ''}`;
    const cachedSuggestions = dropSuggestionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setGoogleSuggestions(cachedSuggestions);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    let active = true;
    dropSuggestionTimerRef.current = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
      }
      if (!autocompleteSessionTokenRef.current && google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }

      setIsFetchingSuggestions(true);
      const request = {
        input: trimmedQuery,
        componentRestrictions: { country: 'in' },
        types: ['geocode'],
        sessionToken: autocompleteSessionTokenRef.current || undefined,
      };

      // City parcels stay in the pickup's neighbourhood; outstation parcels may go anywhere.
      const isOutstationParcel = Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation');
      if (!isOutstationParcel && Array.isArray(pickupCoords)) {
        Object.assign(request, nearbyAutocompleteRequest(google, coordPairToLatLng(pickupCoords, null)));
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (!active) {
          return;
        }

        const normalizedSuggestions =
          status === 'OK'
            ? dedupePlaces(keepNearbyPredictions(predictions).map((prediction) => ({
                id: prediction.place_id || prediction.description,
                label: prediction.structured_formatting?.main_text || prediction.description,
                title: prediction.structured_formatting?.main_text || prediction.description,
                address: prediction.description || '',
                secondaryText: prediction.structured_formatting?.secondary_text || '',
                description: prediction.description || '',
                placeId: prediction.place_id || '',
                types: prediction.types || [],
                distanceLabel: Number.isFinite(prediction.distance_meters) ? formatDistance(prediction.distance_meters / 1000) : '',
                source: 'google',
              }))).slice(0, 5)
            : [];

        dropSuggestionCacheRef.current.set(cacheKey, normalizedSuggestions);
        setGoogleSuggestions(normalizedSuggestions);
        setIsFetchingSuggestions(false);
      });
    }, 350);

    return () => {
      active = false;
      clearTimeout(dropGeocodeTimerRef.current);
      clearTimeout(dropSuggestionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isGoogleMapsLoaded, pickupCoords, activeInput]);

  const applySuggestion = async (type, suggestion) => {
    const baseValue = typeof suggestion === 'string' ? suggestion : suggestion?.title || suggestion?.label || suggestion?.description || '';
    // "Vijay Nagar" at Bhawarkua is saved as "Vijay Nagar, near Bhawarkua Square", never as the bare ambiguous name.
    const value = withAreaHint(baseValue, selectedAreaHint(suggestion));

    if (type === 'pickup') {
      setPickup(value);
      if (Array.isArray(suggestion?.coords) && suggestion.coords.length === 2) {
        setPickupCoords(suggestion.coords);
      } else if (suggestion?.placeId) {
        const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
        setPickupCoords(resolvedCoords);
      }
      clearError('pickup');
      setActiveInput('drop');
      return;
    }

    setDrop(value);
    if (Array.isArray(suggestion?.coords) && suggestion.coords.length === 2) {
      setDropCoords(suggestion.coords);
    } else if (suggestion?.placeId) {
      const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
      setDropCoords(resolvedCoords);
      if (autocompleteSessionTokenRef.current && google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
    }
    setGoogleSuggestions([]);
    clearError('drop');
  };

  const handleProceed = async ({ fromContactSheet = false } = {}) => {
    const { isValid, nextErrors } = validate();

    if (!isValid) {
      if (nextErrors.senderName || nextErrors.senderMobile || nextErrors.receiverName || nextErrors.receiverMobile) {
        setIsContactSheetOpen(true);
        return;
      }

      if (fromContactSheet) {
        setIsContactSheetOpen(false);
      }
      if (nextErrors.goods) {
        // scrollIntoView({ behavior: 'smooth', block: 'center' })
        scrollRef.current?.scrollTo({ y: Math.max(0, goodsSectionYRef.current - Dimensions.get('window').height / 3), animated: true });
      }
      return;
    }

    let resolvedPickupCoords = pickupCoords;
    let resolvedDropCoords = dropCoords;

    if (!resolvedPickupCoords && pickup.trim()) {
      resolvedPickupCoords = await resolveCoordsFromAddress(pickup);
      if (resolvedPickupCoords) {
        setPickupCoords(resolvedPickupCoords);
      }
    }

    if (!resolvedDropCoords && drop.trim()) {
      resolvedDropCoords = await resolveCoordsFromAddress(drop);
      if (resolvedDropCoords) {
        setDropCoords(resolvedDropCoords);
      }
    }

    if (!resolvedPickupCoords || !resolvedDropCoords) {
      setErrors((prev) => ({
        ...prev,
        ...(!resolvedPickupCoords ? { pickup: 'Could not find this pickup on the map. Pick it from the suggestions.' } : {}),
        ...(!resolvedDropCoords ? { drop: 'Could not find this drop on the map. Pick it from the suggestions.' } : {}),
      }));
      setIsContactSheetOpen(false);
      return;
    }

    setIsContactSheetOpen(false);
    navigate(`${routePrefix}/parcel/searching`, {
      state: {
        ...parcelState,
        pickup,
        drop,
        pickupCoords: resolvedPickupCoords,
        dropCoords: resolvedDropCoords,
        senderName,
        senderMobile,
        receiverName,
        receiverMobile,
        paymentMethod: 'Cash',
        fare: estimatedFare?.approx ?? estimatedFare?.min ?? null,
        estimatedFare,
        // Same distance the fare above was priced on (road route when available), so every screen shows one km.
        estimatedDistanceKm: effectiveDistanceKm,
        deliveryScope: parcelState.deliveryScope || 'city',
        isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
        parcel: {
          category: selectedGoods ? (selectedGoods.name || selectedGoods.goods_type_name) : (parcelState.parcelType || 'Parcel'),
          weight: parcelState.weight || 'Under 5kg',
          description: parcelState.description || '',
          deliveryCategory: parcelState.deliveryCategory || parcelState.parcel?.deliveryCategory || '',
          goodsTypeFor: (selectedGoods && selectedGoods.goods_types_for) || parcelState.goodsTypeFor || parcelState.parcel?.goodsTypeFor || '',
          deliveryScope: parcelState.deliveryScope || 'city',
          isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
          senderName,
          senderMobile,
          receiverName,
          receiverMobile,
        },
        isParcel: true,
        searchNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
  };

  const fieldBox = (field) => {
    const active = activeInput === field;
    const hasError = Boolean(errors[field]);
    if (active) {
      return [s.fieldBox, { borderColor: hasError ? '#f87171' : (isDark ? '#ffffff' : '#0f172a') }, s.fieldBoxRing];
    }
    return [s.fieldBox, { borderColor: u.border }];
  };

  const suggestionMeta = (item) => `${distanceTextFor(item) ? `${distanceTextFor(item)} • ` : ''}${selectedAreaHint(item) ? `Near ${selectedAreaHint(item)} • ` : ''}${item.secondaryText}`;

  return (
    <Screen edges={['bottom']} bg={u.bg} keyboard>
      <ContactDetailsSheet
        open={isContactSheetOpen}
        onClose={() => setIsContactSheetOpen(false)}
        onSave={() => handleProceed({ fromContactSheet: true })}
        senderName={senderName}
        setSenderName={setSenderName}
        senderMobile={senderMobile}
        setSenderMobile={setSenderMobile}
        useSelfForReceiver={useSelfForReceiver}
        setUseSelfForReceiver={(checked) => {
          setUseSelfForReceiver(checked);
          if (!checked) {
            return;
          }
          syncReceiverWithSelf();
        }}
        receiverName={receiverName}
        setReceiverName={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverName(value);
        }}
        receiverMobile={receiverMobile}
        setReceiverMobile={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverMobile(value);
        }}
        errors={errors}
        clearError={(key, value) => {
          if (key === 'senderMobile' || key === 'receiverMobile') {
            clearPhoneError(key, value);
            return;
          }
          clearError(key);
        }}
      />

      <View style={[s.header, { borderBottomColor: isDark ? 'rgba(39,39,42,0.8)' : 'rgba(241,245,249,0.8)' }]}>
        <StatusBarSpacer color={u.card} />
        <View style={s.headerRow}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [s.backButton, { borderColor: isDark ? '#27272a' : 'rgba(226,232,240,0.6)' }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={20} color={u.text} strokeWidth={2.5} />
          </Pressable>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text style={s.headerEyebrow}>PARCEL DELIVERY</Text>
            <Text numberOfLines={1} style={s.headerTitle}>Details & Address</Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 112 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeUp style={s.addressCard}>
          <View style={{ gap: 12 }}>
            {/* Pickup Row */}
            <View style={s.addressRow}>
              <View style={[s.dot, { borderColor: '#047857' }]}>
                <View style={[s.dotInner, { backgroundColor: '#047857' }]} />
              </View>
              <Pressable style={fieldBox('pickup')} onPress={() => setActiveInput('pickup')}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.fieldLabel}>PICK UP FROM</Text>
                  <TextInput
                    value={pickup}
                    onChangeText={(text) => {
                      setPickup(text);
                      clearError('pickup');
                    }}
                    onFocus={() => setActiveInput('pickup')}
                    placeholder="Search pickup location..."
                    style={s.fieldInput}
                  />
                </View>
                {pickup.length > 0 && activeInput === 'pickup' && (
                  <Pressable onPress={() => setPickup('')} hitSlop={8} style={{ marginLeft: 8 }}>
                    <X size={16} color="#cbd5e1" />
                  </Pressable>
                )}
              </Pressable>
            </View>

            {/* Dotted connector */}
            <View style={s.connector} />

            {/* Drop Row */}
            <View style={s.addressRow}>
              <View style={[s.dot, { borderColor: '#ea580c' }]}>
                <View style={[s.dotInner, { backgroundColor: '#ea580c' }]} />
              </View>
              <Pressable style={fieldBox('drop')} onPress={() => setActiveInput('drop')}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.fieldLabel}>DELIVER TO</Text>
                  <TextInput
                    ref={dropInputRef}
                    value={drop}
                    autoFocus={activeInput === 'drop'}
                    onFocus={() => setActiveInput('drop')}
                    onChangeText={(text) => {
                      setDrop(text);
                      clearError('drop');
                    }}
                    placeholder="Search drop location..."
                    style={s.fieldInput}
                  />
                </View>
                {drop.length > 0 && activeInput === 'drop' && (
                  <Pressable onPress={() => setDrop('')} hitSlop={8} style={{ marginLeft: 8 }}>
                    <X size={16} color="#cbd5e1" />
                  </Pressable>
                )}
              </Pressable>
            </View>
          </View>
        </FadeUp>

        {/* Action Pills */}
        <View style={s.pills}>
          <Pressable
            onPress={() => openSharedLocationPicker(activeInput)}
            style={({ pressed }) => [s.pill, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <MapPin size={16} color={u.text} strokeWidth={2.5} />
            <Text style={s.pillText}>Pin on map</Text>
          </Pressable>

          <Pressable
            onPress={() => setIsContactSheetOpen(true)}
            style={({ pressed }) => [s.pill, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <User size={16} color={u.text} strokeWidth={2.5} />
            <Text style={s.pillText}>Contact Details</Text>
          </Pressable>
        </View>

        {/* Contact details badge */}
        {(senderName || receiverName) ? (
          <LinearGradient
            colors={['rgba(248,250,252,0.7)', 'rgba(241,245,249,0.3)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.contactBadge}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              {senderName ? (
                <View style={s.contactRow}>
                  <View style={[s.contactDot, { backgroundColor: '#10b981' }]} />
                  <Text style={s.contactKey}>SENDER:</Text>
                  <Text numberOfLines={1} style={s.contactValue}>{senderName} ({senderMobile})</Text>
                </View>
              ) : null}
              {receiverName ? (
                <View style={s.contactRow}>
                  <View style={[s.contactDot, { backgroundColor: '#f43f5e' }]} />
                  <Text style={s.contactKey}>RECEIVER:</Text>
                  <Text numberOfLines={1} style={s.contactValue}>{receiverName} ({receiverMobile})</Text>
                </View>
              ) : null}
            </View>
            <Pressable onPress={() => setIsContactSheetOpen(true)} style={s.editButton}>
              <Text style={s.editButtonText}>EDIT</Text>
            </Pressable>
          </LinearGradient>
        ) : null}

        <View style={s.suggestions}>
          <Text style={s.suggestionsTitle}>
            {query.trim().length > 0 ? 'SEARCH RESULTS' : 'SUGGESTIONS'}
          </Text>

          {googleSuggestions.length > 0 ? (
            <View style={{ gap: 8 }}>
              {googleSuggestions.map((item) => (
                <Pressable key={item.id} onPress={() => applySuggestion(activeInput, item)} style={s.suggestionRow}>
                  <View style={s.suggestionIcon}>
                    <Navigation size={14} color={u.text} fill={alpha('#0f172a', 0.1)} />
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text numberOfLines={1} style={s.suggestionTitle}>{item.label}</Text>
                    {item.secondaryText || item.distanceLabel ? (
                      <Text style={s.suggestionMeta}>{suggestionMeta(item)}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {!query.trim().length && popularNearby.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={s.popularTitle}>POPULAR NEAR YOU</Text>
              {popularNearby.map((item) => (
                <Pressable key={item.placeId || item.title} onPress={() => applySuggestion(activeInput, item)} style={s.suggestionRow}>
                  <View style={s.suggestionIcon}>
                    <MapPin size={14} color="#10b981" />
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text numberOfLines={1} style={s.suggestionTitle}>{item.title}</Text>
                    <Text numberOfLines={1} style={s.suggestionMeta}>
                      {distanceTextFor(item) ? `${distanceTextFor(item)} • ` : ''}{item.address}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {Boolean(query) && isFetchingSuggestions ? (
            <PulseView style={s.finding}>
              <Text style={s.findingText}>FINDING SUGGESTIONS...</Text>
            </PulseView>
          ) : null}
        </View>

        {goodsTypes.length > 0 ? (
          <View
            onLayout={(event) => { goodsSectionYRef.current = event.nativeEvent.layout.y; }}
            style={[s.goods, { borderColor: errors.goods ? '#fca5a5' : u.border }]}
          >
            <Text style={s.goodsTitle}>WHAT ARE YOU SENDING?</Text>
            <View style={s.goodsChips}>
              {goodsTypes.map((item) => {
                const id = String(item._id || item.id);
                const active = id === selectedGoodsId;
                return (
                  <Pressable
                    key={id}
                    onPress={() => { setSelectedGoodsId(id); clearError('goods'); }}
                    style={[s.goodsChip, active ? s.goodsChipActive : null]}
                  >
                    <Text style={[s.goodsChipText, active ? { color: u.ink } : null]}>{item.name || item.goods_type_name}</Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.goods ? <Text style={[s.errorText, { marginTop: 8 }]}>{errors.goods}</Text> : null}
          </View>
        ) : null}

        <PendingCancellationDueNotice style={{ marginTop: 20 }} />

        <FadeUp delay={120} y={0}>
          <LinearGradient
            colors={isDark ? ['#0f172a', '#020617'] : ['#fef3c7', '#fef9c3', '#fefce8']}
            start={{ x: 0, y: 0 }}
            end={isDark ? { x: 1, y: 1 } : { x: 1, y: 0 }}
            style={[s.fareCard, { borderColor: isDark ? u.border : 'rgba(254,240,138,0.6)' }]}
          >
            <View style={s.fareRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.fareLabel, { color: isDark ? u.text2 : u.muted }]}>APPROX. DELIVERY FARE</Text>
                <Text style={s.fareValue}>
                  {estimatedFare ? `Rs ${estimatedFare.approx ?? estimatedFare.min}` : '--'}
                </Text>
                <Text style={[s.fareSub, { color: isDark ? u.text : u.text2 }]}>
                  {estimatedFare
                    ? `Based on ${routeEstimate.source === 'road' ? 'road' : 'approx'} travel of ${effectiveDistanceKm.toFixed(1)} km`
                    : 'Enter drop location to view live fare'}
                </Text>
                {estimatedFare ? (
                  <>
                    <Text style={s.fareNote}>
                      Base fare covers {estimatedFare.minBaseDistance === estimatedFare.maxBaseDistance
                        ? `${estimatedFare.maxBaseDistance.toFixed(1)} km`
                        : `${estimatedFare.minBaseDistance.toFixed(1)}-${estimatedFare.maxBaseDistance.toFixed(1)} km`}
                      {' '}before extra charges.
                    </Text>
                    <Text style={s.fareNote}>
                      Subtotal Rs {Number(estimatedFare.subtotal || 0).toFixed(2)} + service tax {Number(estimatedFare.serviceTaxPercentage || 0).toFixed(2)}% (Rs {Number(estimatedFare.serviceTaxAmount || 0).toFixed(2)})
                    </Text>
                  </>
                ) : null}
              </View>
              <View
                style={[
                  s.fareIcon,
                  isDark
                    ? { backgroundColor: u.soft, borderColor: u.border }
                    : { backgroundColor: u.card, borderColor: 'rgba(226,232,240,0.6)', ...USER_SHADOW },
                ]}
              >
                <PackageCheck size={28} color={isDark ? '#34d399' : '#059669'} />
              </View>
            </View>
          </LinearGradient>
        </FadeUp>
      </ScrollView>

      <View pointerEvents="box-none" style={[s.bottom, { paddingBottom: 24 + insets.bottom }]}>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)', '#ffffff']}
          style={s.bottomFade}
        />
        <Pressable
          onPress={() => handleProceed()}
          style={({ pressed }) => [s.proceedButton, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <Text style={s.proceedText}>
            {drop ? 'Confirm Receiver Details' : 'Select Drop Location'}
          </Text>
          <ChevronRight size={20} color={u.ink} />
        </Pressable>
      </View>
    </Screen>
  );
};

const useStyles = makeStyles((t) => {
  const u = userTokens(t.dark);
  return {
    // contact sheet
    sheet: { borderTopLeftRadius: 34, borderTopRightRadius: 34, backgroundColor: u.card, ...USER_SHADOW },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: u.border, paddingHorizontal: 20, paddingVertical: 16 },
    sheetEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2, color: u.text2 },
    sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4, color: u.text },
    sheetClose: { width: 40, height: 40, borderRadius: 16, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    sheetBody: { paddingHorizontal: 20, paddingVertical: 20, gap: 24 },
    blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    blockIcon: { width: 32, height: 32, borderRadius: 12, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center' },
    blockTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: u.text },
    nameBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
    nameInput: { flex: 1, fontSize: 14, fontWeight: '600', color: u.text, backgroundColor: 'transparent', paddingVertical: 0 },
    errorText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: '#ef4444' },
    phoneLabel: { marginLeft: 4, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, color: u.text2 },
    phoneBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 16 },
    phoneInput: { flex: 1, fontSize: 15, fontWeight: '600', color: u.text, backgroundColor: 'transparent', paddingVertical: 0 },
    phoneErrorRow: { marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    selfRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 16 },
    checkbox: { width: 20, height: 20, borderRadius: 8, borderWidth: 2, borderColor: u.border, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    selfTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: u.text },
    selfSub: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: u.text2 },
    sheetFooter: { borderTopWidth: 1, borderTopColor: u.border, paddingHorizontal: 20, paddingVertical: 16 },
    // button.bg-slate-900 is the yellow accent button inside the Taxi user app (index.css)
    saveButton: { height: 56, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, backgroundColor: u.accent, elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 14 } },
    saveText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: u.ink },
    // page
    header: { backgroundColor: u.card, borderBottomWidth: 1, zIndex: 50 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
    backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center', ...USER_SHADOW },
    headerEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, color: u.text },
    headerTitle: { marginTop: 2, fontSize: 18, lineHeight: 20, fontWeight: '600', letterSpacing: -0.4, color: u.text },
    addressCard: { borderRadius: 32, backgroundColor: u.card, padding: 20, borderWidth: 1, borderColor: u.border, elevation: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
    addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    dotInner: { width: 6, height: 6, borderRadius: 3 },
    fieldBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
    fieldBoxRing: { shadowColor: t.dark ? '#ffffff' : '#020617', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } },
    fieldLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5, color: u.text2 },
    fieldInput: { marginTop: 2, fontSize: 14, fontWeight: '600', color: u.text, backgroundColor: 'transparent', paddingVertical: 0 },
    connector: { marginLeft: 9, height: 8, width: 1.5, borderLeftWidth: 1.5, borderStyle: 'dotted', borderColor: t.dark ? 'rgba(39,39,42,0.6)' : 'rgba(203,213,225,0.7)' },
    pills: { flexDirection: 'row', gap: 12, marginVertical: 20, zIndex: 10 },
    pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: u.card, borderWidth: 1, borderColor: u.border, borderRadius: 16, paddingVertical: 14, ...USER_SHADOW },
    pillText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: u.text },
    contactBadge: { marginHorizontal: 4, marginBottom: 20, borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: '#0f172a', borderWidth: 1, borderColor: u.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, ...USER_SHADOW },
    contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    contactDot: { width: 6, height: 6, borderRadius: 3 },
    contactKey: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5, color: u.text },
    contactValue: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: u.text2 },
    editButton: { backgroundColor: u.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: u.border, ...USER_SHADOW },
    editButtonText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.5, color: u.text },
    suggestions: { marginTop: 20, gap: 20, paddingHorizontal: 8 },
    suggestionsTitle: { marginLeft: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 2.4, color: u.text2 },
    suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 14, ...USER_SHADOW },
    suggestionIcon: { marginTop: 2, width: 32, height: 32, borderRadius: 12, backgroundColor: u.card, borderWidth: 1, borderColor: u.border, alignItems: 'center', justifyContent: 'center' },
    suggestionTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: u.text },
    suggestionMeta: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '600', color: u.text2 },
    popularTitle: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.76, color: u.text2 },
    finding: { borderRadius: 16, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 12, ...USER_SHADOW },
    findingText: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 2, color: u.text2 },
    goods: { marginTop: 24, borderRadius: 24, borderWidth: 1, backgroundColor: u.card, padding: 16, ...USER_SHADOW },
    goodsTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 1.8, color: u.muted },
    goodsChips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    goodsChip: { borderRadius: 9999, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 8 },
    goodsChipActive: { borderColor: '#0f172a', backgroundColor: u.accent },
    goodsChipText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: u.text2 },
    fareCard: { marginTop: 32, borderRadius: 30, padding: 24, borderWidth: 1, overflow: 'hidden', ...USER_SHADOW },
    fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    fareLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2 },
    fareValue: { marginTop: 4, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.75, color: u.text },
    fareSub: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600' },
    fareNote: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '600', color: u.muted },
    fareIcon: { width: 56, height: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, paddingHorizontal: 24, paddingTop: 24 },
    bottomFade: { position: 'absolute', left: 24, right: 24, bottom: 0, height: 128 },
    proceedButton: { height: 64, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: u.accent, elevation: 10, shadowColor: '#0f172a', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 20 } },
    proceedText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: u.ink },
  };
});

export default SenderReceiverDetails;
