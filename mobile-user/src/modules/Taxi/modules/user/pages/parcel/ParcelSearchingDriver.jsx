import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ShieldCheck, Phone, MessageCircle, CheckCircle2, AlertTriangle, Star } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Dialog, Screen, Text } from '@/native/ui';
import { AppMap, Marker, Polyline, regionFor, toLatLng as toMapCoordinate } from '@/native/ui/AppMap';
import { alpha, makeStyles, useTheme } from '@/theme';
import api from '../../../../shared/api/axiosInstance';
import CancellationFeeNotice from '../../components/CancellationFeeNotice';
import { socketService } from '../../../../shared/api/socket';
import { getLocalUserToken, userAuthService } from '../../services/authService';
import { getCurrentRide, isActiveCurrentRide, saveCurrentRide } from '../../services/currentRideService';
import { HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import LuxuryIcon from '@/assets/icons/Luxury.png';
import PremiumIcon from '@/assets/icons/Premium.png';
import SuvIcon from '@/assets/icons/SUV.png';
import BikeIcon from '@/assets/icons/bike.png';
import CarIcon from '@/assets/icons/car.png';
import AutoIcon from '@/assets/icons/auto.png';
import useRideChatUnread from '../../../shared/chat/useRideChatUnread';
import ChatUnreadBadge from '../../../shared/components/ChatUnreadBadge';
import { getUnpaidRideFromError, openUnpaidRidePayment } from '../../utils/unpaidRide';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

// Taxi/index.css `.user-app-theme` palette (the web remaps slate / white classes to these in both themes).
const userTokens = (dark) => ({
  bg: dark ? '#0a0a0a' : '#F1F4F9',
  card: dark ? '#141414' : '#FFFFFF',
  soft: dark ? '#1c1c1c' : '#E9EDF4',
  text: dark ? '#FFFFFF' : '#0B1220',
  text2: dark ? '#CBD5E1' : '#475569',
  border: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
  accent: '#FFC400',
  ink: '#0B1220',
});
const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

const unwrap = (response) => response?.data?.data || response?.data || response;
const unwrapLoginPayload = (response) => {
  const payload = unwrap(response);
  return payload?.token ? payload : payload?.data || {};
};

const generateOTP = () => String(Math.floor(1000 + Math.random() * 9000));
const DRIVER_PLACEHOLDER = { name: 'Delivery Captain', rating: '', vehicle: 'Bike', plate: 'Assigned', phone: '', eta: 2 };
const STAGES = { SEARCHING: 'searching', ACCEPTED: 'accepted' };
const ACTIVE_DELIVERY_POLL_MS = 8000;
const ACTIVE_DELIVERY_POLL_DELAY_MS = 6000;
const SEARCH_TIMEOUT_MS = 20000;
const CONSUMED_SEARCH_NONCE_PREFIX = 'helloparth_consumed_parcel_search_nonce:';
const ACTIVE_SEARCH_NONCES = new Set();
const ACTIVE_SEARCH_NONCE_CLEANUPS = new Map();

const withUserAuthorization = (token) => (
  token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {}
);

// Custom marker views are drawn into a bitmap: keep redrawing briefly so the first paint is complete, then stop.
const useMarkerTracking = (deps = []) => {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tracks;
};

const PinLocationMarker = ({ position, title, color, size = 34, zIndex = 1 }) => {
  const tracksViewChanges = useMarkerTracking([color, size]);
  return (
    <Marker coordinate={toMapCoordinate(position)} title={title} anchor={{ x: 0.5, y: (size - 2) / (size + Math.round(size * 0.28) - 2) }} zIndex={zIndex} tracksViewChanges={tracksViewChanges}>
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderWidth: 2,
            borderColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.9)' }} />
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: Math.round(size * 0.18),
            borderRightWidth: Math.round(size * 0.18),
            borderTopWidth: Math.round(size * 0.28),
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: color,
            marginTop: -2,
          }}
        />
      </View>
    </Marker>
  );
};

const readCoordinatePair = (...sources) => {
  for (const source of sources) {
    if (Array.isArray(source) && source.length >= 2) {
      const [lng, lat] = source;
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return [Number(lng), Number(lat)];
      }
    }

    const nestedCoords = source?.coordinates;
    if (Array.isArray(nestedCoords) && nestedCoords.length >= 2) {
      const [lng, lat] = nestedCoords;
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return [Number(lng), Number(lat)];
      }
    }

    const lat = Number(source?.lat ?? source?.latitude);
    const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
  }

  return null;
};

const toLatLng = (coords, fallback = { lat: 22.7196, lng: 75.8577 }) => {
  const pair = readCoordinatePair(coords);
  if (!pair) {
    return fallback;
  }

  return { lng: pair[0], lat: pair[1] };
};

const getVehicleIcon = (type = 'car') => {
  const val = String(type).toLowerCase();
  if (val.includes('bike') || val.includes('2wheel')) return BikeIcon;
  if (val.includes('auto')) return AutoIcon;
  if (val.includes('lux')) return LuxuryIcon;
  if (val.includes('premium')) return PremiumIcon;
  if (val.includes('suv')) return SuvIcon;
  return CarIcon;
};

const normalizeDriver = (driver = {}) => ({
  name: driver.name || 'Delivery Captain',
  rating: driver.rating || '',
  vehicle: driver.vehicle || driver.vehicleType || driver.vehicle_type || 'Bike',
  vehicleType: driver.vehicleType || driver.vehicle_type || driver.vehicle || 'Bike',
  plate: driver.plate || driver.vehicleNumber || driver.vehicle_number || 'Assigned',
  vehicleNumber: driver.vehicleNumber || driver.vehicle_number || driver.plate || 'Assigned',
  phone: driver.phone || driver.mobile || driver.phoneNumber || '',
  profileImage: driver.profileImage || driver.profile_image || driver.image || driver.avatar || driver.selfie || '',
  vehicleImage: driver.vehicleImage || driver.vehicle_image || driver.vehiclePhoto || driver.vehicle_photo || driver.vehicle?.image || '',
  vehicleColor: driver.vehicleColor || driver.vehicle_color || driver.vehicle?.vehicleColor || driver.vehicle?.vehicle_color || '',
  vehicleMake: driver.vehicleMake || driver.vehicle_make || driver.vehicle?.vehicleMake || driver.vehicle?.vehicle_make || '',
  vehicleModel: driver.vehicleModel || driver.vehicle_model || driver.vehicle?.vehicleModel || driver.vehicle?.vehicle_model || '',
  vehicleIconUrl: driver.vehicleIconUrl || driver.map_icon || driver.icon || '',
  eta: driver.eta || 2,
});

const normalizeLabel = (value = '') => String(value).trim().toLowerCase();

const normalizePreferredVehicleTypes = (value = '') =>
  String(value || '')
    .split(',')
    .map((entry) => normalizeLabel(entry))
    .filter(Boolean);

const normalizeVehicleLabel = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getVehicleTokens = (vehicle = {}) =>
  [
    vehicle.name,
    vehicle.vehicle_type,
    vehicle.label,
    vehicle.icon_types,
    vehicle.transport_type,
  ]
    .map(normalizeVehicleLabel)
    .filter(Boolean);

const findVehicleMatch = (types, preferredLabel) => {
  const exactMatch = types.find((type) => normalizeLabel(type.name || type.vehicle_type || type.label) === preferredLabel);
  if (exactMatch) return exactMatch;
  const transportMatch = types.find((type) => normalizeLabel(type.transport_type) === preferredLabel);
  if (transportMatch) return transportMatch;
  return types.find((type) => {
    const haystack = `${type.name || ''} ${type.vehicle_type || ''} ${type.label || ''} ${type.icon_types || ''} ${type.transport_type || ''}`.toLowerCase();
    return haystack.includes(preferredLabel);
  });
};

const pickParcelVehicles = (types = [], preferredType = '') => {
  const activeTypes = types.filter((type) => type.active !== false && Number(type.status ?? 1) !== 0);
  const preferredLabels = normalizePreferredVehicleTypes(preferredType).filter((entry) => entry !== 'both');
  const matches = [];

  for (const preferredLabel of preferredLabels) {
    const match = findVehicleMatch(activeTypes, preferredLabel);
    if (match && !matches.some((item) => String(item._id || item.id) === String(match._id || match.id))) {
      matches.push(match);
    }
  }

  if (matches.length > 0) return matches;

  if (!preferredLabels.length) {
    const parcelMatches = activeTypes.filter((type) => {
      const value = `${type.name || ''} ${type.icon_types || ''} ${type.transport_type || ''}`.toLowerCase();
      return value.includes('bike') || value.includes('delivery') || value.includes('parcel') || value.includes('car');
    });
    if (parcelMatches.length > 0) return parcelMatches;
    return activeTypes;
  }

  const parcelFirst = activeTypes.find((type) => {
    const value = `${type.name || ''} ${type.icon_types || ''} ${type.transport_type || ''}`.toLowerCase();
    return value.includes('bike') || value.includes('delivery') || value.includes('parcel');
  });

  return parcelFirst ? [parcelFirst] : activeTypes.slice(0, 1);
};

const findVehicleById = (types = [], vehicleId = '') =>
  types.find((type) => String(type?._id || type?.id) === String(vehicleId || '')) || null;

const findVehiclesByIds = (types = [], vehicleIds = []) => {
  const wantedIds = new Set(
    (Array.isArray(vehicleIds) ? vehicleIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );

  if (!wantedIds.size) {
    return [];
  }

  return types.filter((type) => wantedIds.has(String(type?._id || type?.id || '')));
};

const formatParcelFareLabel = (estimatedFare, fallbackFare) => {
  const minFare = Number(estimatedFare?.min);
  const maxFare = Number(estimatedFare?.max);
  const approxFare = Number(estimatedFare?.approx);
  const singleFare = Number(fallbackFare);

  if (Number.isFinite(minFare) && Number.isFinite(maxFare) && maxFare > minFare) {
    return `Rs ${Math.round(minFare)} - Rs ${Math.round(maxFare)}`;
  }

  if (Number.isFinite(approxFare)) {
    return `Rs ${Math.round(approxFare)}`;
  }

  if (Number.isFinite(minFare)) {
    return `Rs ${Math.round(minFare)}`;
  }

  if (Number.isFinite(singleFare)) {
    return `Rs ${Math.round(singleFare)}`;
  }

  return '--';
};

const isVehicleCompatibleWithGoodsType = (vehicle, goodsTypeFor = '') => {
  const allowedLabels = String(goodsTypeFor || 'both')
    .split(',')
    .map(normalizeVehicleLabel)
    .filter(Boolean);

  if (!allowedLabels.length || allowedLabels.includes('both') || allowedLabels.includes('all')) {
    return true;
  }

  const tokens = getVehicleTokens(vehicle);
  return allowedLabels.some((label) => tokens.some((token) => token.includes(label) || label.includes(token)));
};

// ---- searching radar (pulsing rings + rotating conic sweep around the pickup) ----
const RADAR_SIZE = 320;
const SWEEP_SLICES = 12;
const wedgePath = (startDeg, endDeg, r = RADAR_SIZE / 2) => {
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [r + r * Math.cos(rad), r + r * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startDeg);
  const [x2, y2] = toXY(endDeg);
  return `M${r},${r} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`;
};

function PulseRing({ delay }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 3000, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        styles.ring,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 4.5] }) }],
        },
      ]}
    />
  );
}

function SearchRadar() {
  const fade = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [fade, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View pointerEvents="none" style={[styles.radar, { opacity: fade }]}>
      {[1, 2, 3, 4].map((i) => <PulseRing key={i} delay={i * 750} />)}
      <Animated.View style={[styles.sweep, { transform: [{ rotate }] }]}>
        <Svg width={RADAR_SIZE} height={RADAR_SIZE}>
          {Array.from({ length: SWEEP_SLICES }).map((_, i) => (
            <Path
              key={i}
              d={wedgePath((60 / SWEEP_SLICES) * i, (60 / SWEEP_SLICES) * (i + 1) + 0.5)}
              fill={`rgba(249,115,22,${(0.5 * (1 - i / SWEEP_SLICES)).toFixed(3)})`}
            />
          ))}
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

function SearchingDots() {
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2, 3].map((i) => <SearchingDot key={i} delay={i * 200} />)}
    </View>
  );
}

function SearchingDot({ delay }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 750, useNativeDriver: false }),
      Animated.timing(v, { toValue: 0, duration: 750, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          backgroundColor: v.interpolate({ inputRange: [0, 1], outputRange: ['#e2e8f0', '#f97316'] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
        },
      ]}
    />
  );
}

function PulseDot() {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', opacity: v }} />;
}

function PingDot() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: 8, height: 8 }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#34d399',
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
        }}
      />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
    </View>
  );
}

// AnimatePresence entrance for the bottom cards / the OTP badge
function Enter({ from, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, damping: 20, stiffness: 180, useNativeDriver: true }).start();
  }, [v]);
  const transform = [];
  if (from.y != null) transform.push({ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) });
  if (from.x != null) transform.push({ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [from.x, 0] }) });
  if (from.scale != null) transform.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from.scale, 1] }) });
  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform }]}>{children}</Animated.View>;
}

const Tap = ({ scale = 0.96, style, children, ...rest }) => (
  <Pressable {...rest} style={({ pressed }) => [style, pressed && { transform: [{ scale }] }]}>
    {children}
  </Pressable>
);

const ParcelSearchingDriver = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const routeState = useMemo(() => location.state || {}, [location.state]);
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const userHomeRoute = routePrefix || '/taxi/user';
  const [stage, setStage] = useState(STAGES.SEARCHING);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [otp] = useState(generateOTP);
  const [driver, setDriver] = useState(DRIVER_PLACEHOLDER);
  const [searchStatus, setSearchStatus] = useState('Preparing dispatch...');
  const [bookingError, setBookingError] = useState('');
  const activeRidePollRef = useRef(null);
  const activeRidePollStartTimeoutRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const requestStartedRef = useRef(false);
  const cleanupSearchRef = useRef(null);
  const cleanupDelayRef = useRef(null);
  const acceptedTimerRef = useRef(null);
  const driverRef = useRef(driver);
  const activeRideIdRef = useRef('');
  // read on each render: the driver-found card re-renders once the ride is accepted
  const chatUnread = useRideChatUnread(activeRideIdRef.current || getCurrentRide()?.rideId || '', 'user');
  const trackingStartedRef = useRef(false);
  const searchNonce = String(routeState.searchNonce || '');
  const preferredVehicleType = String(
    routeState.goodsTypeFor ||
    routeState.selectedGoodsType?.goodsTypeFor ||
    routeState.selectedGoodsType?.goods_types_for ||
    routeState.selectedGoodsType?.goods_type_for ||
    '',
  ).trim();
  // No script to load natively: the map is always available.
  const isLoaded = true;
  const mapRef = useRef(null);
  const [radarPoint, setRadarPoint] = useState(null);
  const resolvedPickupCoords = useMemo(
    () => readCoordinatePair(routeState.pickupCoords, routeState.pickupLocation, routeState.pickup),
    [routeState.pickup, routeState.pickupCoords, routeState.pickupLocation],
  );
  const resolvedDropCoords = useMemo(
    () => readCoordinatePair(routeState.dropCoords, routeState.dropLocation, routeState.drop),
    [routeState.drop, routeState.dropCoords, routeState.dropLocation],
  );

  const pickupPos = useMemo(
    () => toLatLng(resolvedPickupCoords),
    [resolvedPickupCoords],
  );

  const dropPos = useMemo(
    () => (resolvedDropCoords ? toLatLng(resolvedDropCoords, null) : null),
    [resolvedDropCoords],
  );

  const availableVehicleIcon = useMemo(
    () => (
      routeState.vehicleIconUrl ||
      routeState.vehicle?.vehicleIconUrl ||
      routeState.vehicle?.icon ||
      getVehicleIcon(routeState.vehicleIconType || routeState.vehicle?.iconType || preferredVehicleType || 'bike')
    ),
    [preferredVehicleType, routeState.vehicle, routeState.vehicleIconType, routeState.vehicleIconUrl],
  );

  const expectedFareLabel = useMemo(
    () => formatParcelFareLabel(routeState.estimatedFare, routeState.fare),
    [routeState.estimatedFare, routeState.fare],
  );
  const expectedFareMeta = useMemo(() => {
    const distanceKm = Number(routeState.estimatedDistanceKm);
    const serviceTaxPercentage = Number(routeState.estimatedFare?.serviceTaxPercentage || 0);
    const serviceTaxLabel = serviceTaxPercentage > 0
      ? ` Includes ${serviceTaxPercentage.toFixed(2)}% service tax.`
      : '';
    if (Number.isFinite(distanceKm) && distanceKm > 0) {
      return `Estimated for about ${distanceKm.toFixed(1)} km.${serviceTaxLabel}`;
    }

    return `Based on the current parcel route.${serviceTaxLabel}`;
  }, [routeState.estimatedDistanceKm, routeState.estimatedFare?.serviceTaxPercentage]);

  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);

  useEffect(() => {
    if (!searchNonce) {
      navigate(userHomeRoute, { replace: true });
      return;
    }

    const nonceKey = `${CONSUMED_SEARCH_NONCE_PREFIX}${searchNonce}`;
    const pendingCleanup = ACTIVE_SEARCH_NONCE_CLEANUPS.get(searchNonce);
    if (pendingCleanup) {
      clearTimeout(pendingCleanup);
      ACTIVE_SEARCH_NONCE_CLEANUPS.delete(searchNonce);
    }

    if (ACTIVE_SEARCH_NONCES.has(searchNonce)) {
      return () => {
        const cleanupId = setTimeout(() => {
          ACTIVE_SEARCH_NONCES.delete(searchNonce);
          ACTIVE_SEARCH_NONCE_CLEANUPS.delete(searchNonce);
        }, 0);
        ACTIVE_SEARCH_NONCE_CLEANUPS.set(searchNonce, cleanupId);
      };
    }

    if (sessionStorage.getItem(nonceKey)) {
      const activeRide = getCurrentRide();
      if (isActiveCurrentRide(activeRide)) {
        navigate(`${routePrefix}/parcel/tracking`, { replace: true, state: activeRide });
        return;
      }
      navigate(userHomeRoute, { replace: true });
      return;
    }

    sessionStorage.setItem(nonceKey, '1');
    ACTIVE_SEARCH_NONCES.add(searchNonce);

    return () => {
      const cleanupId = setTimeout(() => {
        ACTIVE_SEARCH_NONCES.delete(searchNonce);
        ACTIVE_SEARCH_NONCE_CLEANUPS.delete(searchNonce);
      }, 0);
      ACTIVE_SEARCH_NONCE_CLEANUPS.set(searchNonce, cleanupId);
    };
  }, [navigate, routePrefix, searchNonce, userHomeRoute]);

  useEffect(() => {
    if (cleanupDelayRef.current) {
      clearTimeout(cleanupDelayRef.current);
      cleanupDelayRef.current = null;
    }

    if (requestStartedRef.current) {
      return () => {
        cleanupDelayRef.current = setTimeout(() => {
          cleanupSearchRef.current?.();
        }, 0);
      };
    }

    if (!searchNonce) {
      navigate(userHomeRoute, { replace: true });
      return undefined;
    }

    requestStartedRef.current = true;
    let disposed = false;

    const moveToTracking = ({ acceptedDriver, rideId, rideSnapshot }) => {
      if (disposed || trackingStartedRef.current) return;
      const nextDriver = normalizeDriver(acceptedDriver);
      driverRef.current = nextDriver;
      setDriver(nextDriver);
      setStage(STAGES.ACCEPTED);
      setSearchStatus('Captain accepted your parcel request.');
      activeRideIdRef.current = String(rideId || activeRideIdRef.current || '');
      trackingStartedRef.current = true;

      const nextRide = {
        ...routeState,
        type: 'parcel',
        serviceType: 'parcel',
        pickup: rideSnapshot?.pickupAddress || routeState.pickup,
        drop: rideSnapshot?.dropAddress || routeState.drop,
        pickupCoords: readCoordinatePair(
          rideSnapshot?.pickup?.coordinates,
          rideSnapshot?.pickupLocation?.coordinates,
          routeState.pickupCoords,
        ) || resolvedPickupCoords,
        dropCoords: readCoordinatePair(
          rideSnapshot?.drop?.coordinates,
          rideSnapshot?.dropLocation?.coordinates,
          routeState.dropCoords,
        ) || resolvedDropCoords,
        rideId: activeRideIdRef.current,
        otp,
        driver: nextDriver,
        fare: rideSnapshot?.fare ?? routeState.fare ?? routeState.estimatedFare?.min ?? null,
        vehicleIconUrl: rideSnapshot?.vehicleIconUrl || routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
        paymentMethod: routeState.paymentMethod || 'Cash',
        status: 'accepted',
        parcel: rideSnapshot?.parcel || routeState.parcel || null,
      };

      saveCurrentRide(nextRide);
      clearInterval(activeRidePollRef.current);
      clearTimeout(searchTimeoutRef.current);
      clearTimeout(acceptedTimerRef.current);
      acceptedTimerRef.current = setTimeout(() => {
        navigate(`${routePrefix}/parcel/tracking`, { replace: true, state: nextRide });
      }, 2200);
    };

    const hydrateAcceptedDelivery = async (token) => {
      if (disposed) return null;
      const activeResponse = await api.get('/deliveries/active/me', {
        ...withUserAuthorization(token),
        params: { t: Date.now() },
      });
      const activeDelivery = unwrap(activeResponse);
      if (!activeDelivery?.rideId) return null;
      return activeDelivery;
    };

    const onRideSearchUpdate = ({ matchedDrivers, radius }) => {
      const radiusKm = radius ? (Number(radius) / 1000).toFixed(1) : '';
      setSearchStatus(
        matchedDrivers > 0
          ? `${matchedDrivers} captain${matchedDrivers > 1 ? 's' : ''} notified within ${radiusKm} km`
          : `Searching within ${radiusKm} km`,
      );
    };

    const onRideAccepted = ({ driver: acceptedDriver, rideId, parcel }) => {
      moveToTracking({ acceptedDriver, rideId, rideSnapshot: { fare: routeState.fare, parcel } });
    };

    const onRideState = (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) return;
      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        moveToTracking({ acceptedDriver: payload.driver, rideId: payload.rideId, rideSnapshot: payload });
      }
    };

    const onRideStatusUpdated = async (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) return;
      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        const activeDelivery = await hydrateAcceptedDelivery(getLocalUserToken()).catch(() => null);
        moveToTracking({
          acceptedDriver: activeDelivery?.driver || driverRef.current,
          rideId: payload.rideId,
          rideSnapshot: activeDelivery || payload,
        });
      }
    };

    const onRideCancelled = ({ reason }) => {
      const nextMessage = reason || 'Search timed out.';
      setBookingError(nextMessage);
      setSearchStatus(nextMessage);
      setStage(STAGES.SEARCHING);
      clearTimeout(searchTimeoutRef.current);
    };

    const onError = ({ message }) => {
      const nextMessage = message || 'Error occurred.';
      setBookingError(nextMessage);
      setSearchStatus(nextMessage);
      clearTimeout(searchTimeoutRef.current);
    };

    socketService.on('rideSearchUpdate', onRideSearchUpdate);
    socketService.on('rideAccepted', onRideAccepted);
    socketService.on('ride:state', onRideState);
    socketService.on('ride:status:updated', onRideStatusUpdated);
    socketService.on('rideCancelled', onRideCancelled);
    socketService.on('errorMessage', onError);

    cleanupSearchRef.current = () => {
      if (disposed) return;
      disposed = true;
      requestStartedRef.current = false;
      clearInterval(activeRidePollRef.current);
      clearTimeout(activeRidePollStartTimeoutRef.current);
      clearTimeout(searchTimeoutRef.current);
      clearTimeout(acceptedTimerRef.current);
      activeRidePollStartTimeoutRef.current = null;
      activeRidePollRef.current = null;
      socketService.off('rideSearchUpdate', onRideSearchUpdate);
      socketService.off('rideAccepted', onRideAccepted);
      socketService.off('ride:state', onRideState);
      socketService.off('ride:status:updated', onRideStatusUpdated);
      socketService.off('rideCancelled', onRideCancelled);
      socketService.off('errorMessage', onError);
    };

    (async () => {
      try {
        let userToken = getLocalUserToken();
        if (!userToken) {
          // Same call as the web (authService has no loginDemoUser there either, so this throws into the catch below).
          const loginResponse = await userAuthService.loginDemoUser();
          const loginPayload = unwrapLoginPayload(loginResponse);
          if (loginPayload?.token) {
            userToken = loginPayload.token;
            localStorage.setItem('token', userToken);
            localStorage.setItem('userToken', userToken);
            localStorage.setItem('role', 'user');
            localStorage.setItem('userInfo', JSON.stringify(loginPayload.user || {}));
          }
        }
        if (disposed) return;

        const vehicleCatalogResponse = await api.get('/users/vehicle-types');
        if (disposed) return;

        const vehicleCatalog = unwrap(vehicleCatalogResponse);
        const vehicleTypes = vehicleCatalog?.vehicle_types || vehicleCatalog?.results || (Array.isArray(vehicleCatalog) ? vehicleCatalog : []);
        const requestedVehicles = findVehiclesByIds(vehicleTypes, routeState.selectedVehicleIds);
        const requestedVehicle = findVehicleById(vehicleTypes, routeState.selectedVehicleId);
        const requestedVehicleTypes = requestedVehicles.filter((vehicle) => isVehicleCompatibleWithGoodsType(vehicle, preferredVehicleType));
        const selectedVehicleTypes = requestedVehicleTypes.length > 0
          ? requestedVehicleTypes
          : requestedVehicle && isVehicleCompatibleWithGoodsType(requestedVehicle, preferredVehicleType)
            ? [requestedVehicle]
            : pickParcelVehicles(vehicleTypes, preferredVehicleType);
        const selectedVehicleType = selectedVehicleTypes[0];
        const selectedVehicleTypeIds = selectedVehicleTypes.map((type) => type?._id || type?.id).filter(Boolean);

        if (selectedVehicleTypeIds.length === 0) {
          throw new Error('No vehicles available.');
        }

        const rideRequestConfig = userToken ? { headers: { Authorization: `Bearer ${userToken}` } } : {};
        const parcelPayload = {
          ...(routeState.parcel || {}),
          category: routeState.parcel?.category || routeState.parcelType || 'Parcel',
          weight: routeState.parcel?.weight || routeState.weight || 'Under 5kg',
          description: routeState.parcel?.description || routeState.description || '',
          deliveryScope: routeState.parcel?.deliveryScope || routeState.deliveryScope || 'city',
          isOutstation: Boolean(routeState.parcel?.isOutstation || routeState.isOutstation || routeState.deliveryScope === 'outstation'),
          senderName: routeState.parcel?.senderName || routeState.senderName || '',
          senderMobile: routeState.parcel?.senderMobile || routeState.senderMobile || '',
          receiverName: routeState.parcel?.receiverName || routeState.receiverName || '',
          receiverMobile: routeState.parcel?.receiverMobile || routeState.receiverMobile || '',
          goodsTypeFor: preferredVehicleType || routeState.parcel?.goodsTypeFor || 'both',
          deliveryCategory: routeState.parcel?.deliveryCategory || routeState.deliveryCategory || '',
        };

        const socket = socketService.connect({ role: 'user', token: userToken });
        if (!resolvedPickupCoords || !resolvedDropCoords) {
          throw new Error('Pickup and drop locations are missing. Please pick them again.');
        }

        const response = await api.post('/deliveries', {
          pickup: resolvedPickupCoords,
          drop: resolvedDropCoords,
          pickupAddress: routeState.pickup || '',
          dropAddress: routeState.drop || '',
          fare: routeState.fare ?? routeState.estimatedFare?.min ?? null,
          estimatedDistanceMeters: Math.round(Number(routeState.estimatedDistanceKm || 0) * 1000),
          vehicleTypeId: selectedVehicleTypeIds[0],
          vehicleTypeIds: selectedVehicleTypeIds,
          vehicleIconType: selectedVehicleType.icon_types || 'bike',
          vehicleIconUrl: selectedVehicleType.map_icon || selectedVehicleType.icon || selectedVehicleType.image || '',
          paymentMethod: routeState.paymentMethod || 'Cash',
          type: 'parcel',
          parcel: parcelPayload,
        }, rideRequestConfig);

        if (disposed) return;

        const payload = unwrap(response);
        const rideId = payload?.rideId || payload?.realtime?.rideId || payload?.ride?._id || payload?._id || payload?.id;
        activeRideIdRef.current = String(rideId || '');

        if (socket && rideId) {
          socketService.emit('joinRide', { rideId });
          socketService.emit('ride:join', { rideId });
        }

        const pollActiveRide = async () => {
          if (disposed) return;
          try {
            const activeRide = await hydrateAcceptedDelivery(userToken);
            if (disposed || !activeRide?.rideId) return;
            const isThisRide = String(activeRide.rideId || '') === String(rideId || '');
            const rideState = String(activeRide.status || activeRide.liveStatus || '').toLowerCase();
            const isAcceptedRide = ['accepted', 'arriving', 'started', 'ongoing'].includes(rideState);

            if (isThisRide && ['searching', 'pending'].includes(rideState)) {
              setStage(STAGES.SEARCHING);
              setSearchStatus('Broadcasted to nearby captains...');
            }
            if (isThisRide && isAcceptedRide) {
              moveToTracking({ acceptedDriver: activeRide.driver || driverRef.current, rideId: activeRide.rideId, rideSnapshot: activeRide });
            }
          } catch {
            // Socket remains the primary path; polling is only a race-condition fallback.
          }
        };

        clearInterval(activeRidePollRef.current);
        activeRidePollRef.current = null;
        const startFallbackPolling = () => {
          if (disposed || trackingStartedRef.current) return;
          pollActiveRide();
          activeRidePollRef.current = setInterval(pollActiveRide, ACTIVE_DELIVERY_POLL_MS);
        };
        clearTimeout(activeRidePollStartTimeoutRef.current);
        activeRidePollStartTimeoutRef.current = setTimeout(
          startFallbackPolling,
          ACTIVE_DELIVERY_POLL_DELAY_MS,
        );
        if (!disposed) {
          setSearchStatus('Booking created. Notifying nearby captains...');
        }

        searchTimeoutRef.current = setTimeout(async () => {
          if (disposed || trackingStartedRef.current) return;
          const activeRide = await hydrateAcceptedDelivery(userToken).catch(() => null);
          const rideState = String(activeRide?.status || activeRide?.liveStatus || '').toLowerCase();
          if (!activeRide?.rideId || rideState === 'cancelled') {
            setBookingError('No response from captains.');
            setSearchStatus('Try again in a moment.');
            clearInterval(activeRidePollRef.current);
            return;
          }
          if (['accepted', 'arriving', 'started', 'ongoing'].includes(rideState)) {
            moveToTracking({ acceptedDriver: activeRide.driver || driverRef.current, rideId: activeRide.rideId, rideSnapshot: activeRide });
          }
        }, SEARCH_TIMEOUT_MS);
      } catch (error) {
        if (disposed) return;
        const unpaidRide = getUnpaidRideFromError(error);
        if (unpaidRide) {
          setSearchStatus(unpaidRide.message);
          setTimeout(() => { if (!disposed) openUnpaidRidePayment(navigate, getAppRoutePath(), unpaidRide); }, 1500);
          return;
        }
        const errorMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Dispatch failed.';
        setBookingError(errorMessage);
        setSearchStatus(errorMessage);
        clearTimeout(searchTimeoutRef.current);
      }
    })();

    return () => {
      cleanupDelayRef.current = setTimeout(() => {
        cleanupSearchRef.current?.();
      }, 0);
    };
  }, [navigate, otp, preferredVehicleType, resolvedDropCoords, resolvedPickupCoords, routePrefix, routeState, searchNonce, userHomeRoute]);

  const handleCancel = async () => {
    clearInterval(activeRidePollRef.current);
    clearTimeout(searchTimeoutRef.current);
    clearTimeout(acceptedTimerRef.current);

    const rideId = activeRideIdRef.current;

    try {
      if (rideId) {
        await api.patch(`/rides/${rideId}/cancel`);
      }
    } catch (_error) {
      // Navigation still proceeds even if the cancel request races with another state update.
    }

    navigate(userHomeRoute, { replace: true });
  };

  // GoogleMap center={pickupPos}: follow the pickup when it changes
  useEffect(() => {
    mapRef.current?.animateCamera({ center: toMapCoordinate(pickupPos) }, { duration: 300 });
  }, [pickupPos]);

  // The radar is an OverlayView on the web (it moves with the map); natively it is drawn over the map at the pickup's
  // screen point, recomputed while the map moves.
  const updateRadarPoint = useCallback(() => {
    const map = mapRef.current;
    if (!map?.pointForCoordinate) return;
    map.pointForCoordinate(toMapCoordinate(pickupPos)).then((point) => {
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) setRadarPoint(point);
    }).catch(() => {});
  }, [pickupPos]);

  const isSearching = stage === STAGES.SEARCHING;
  const isAccepted = stage === STAGES.ACCEPTED;

  return (
    <Screen edges={[]} bg={u.bg}>
      <View style={StyleSheet.absoluteFill}>
        {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
          <AppMap
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={regionFor(pickupPos, 15)}
            customMapStyle={MAP_STYLE}
            onMapReady={updateRadarPoint}
            onRegionChange={updateRadarPoint}
            onRegionChangeComplete={updateRadarPoint}
          >
            <PinLocationMarker position={pickupPos} title="Pickup" color="#000000" zIndex={100} />

            {dropPos && (
              <PinLocationMarker position={dropPos} title="Drop" color="#f97316" />
            )}

            {dropPos && (
              <>
                <Polyline
                  coordinates={[toMapCoordinate(pickupPos), toMapCoordinate(dropPos)]}
                  strokeColor="rgba(15,23,42,0.2)"
                  strokeWidth={4}
                />
                <Polyline
                  coordinates={[toMapCoordinate(pickupPos), toMapCoordinate(dropPos)]}
                  strokeColor="#0f172a"
                  strokeWidth={4}
                  lineDashPattern={[4, 6]}
                />
              </>
            )}
          </AppMap>
        ) : (
          <View style={{ flex: 1, backgroundColor: u.card }} />
        )}

        {isSearching && radarPoint ? (
          <View pointerEvents="none" style={[s.radarAnchor, { left: radarPoint.x, top: radarPoint.y - 22 }]}>
            <SearchRadar />
          </View>
        ) : null}
      </View>

      <View style={[s.routeCard, { top: 32 + insets.top }]}>
        <Text style={s.routeLabel}>PARCEL ROUTE</Text>
        <Text numberOfLines={1} style={s.routeText}>{routeState.pickup || 'Pickup'} to {routeState.drop || 'Drop'}</Text>
      </View>

      {isAccepted && otp ? (
        <Enter from={{ scale: 0.8, x: -20 }} style={[s.otpBadge, { top: 88 + insets.top }]}>
          <Text style={s.otpValue}>{otp}</Text>
          <Text style={s.otpLabel}>Pickup OTP</Text>
        </Enter>
      ) : null}

      {(isSearching || isAccepted) && (
        <Tap scale={0.9} onPress={() => setShowCancelConfirm(true)} style={[s.closeButton, { top: 32 + insets.top }]}>
          <X size={16} color={u.text} strokeWidth={2.5} />
        </Tap>
      )}

      <View style={[s.bottomArea, { bottom: 32 + insets.bottom }]}>
        {isSearching && (
          <Enter key="searching" from={{ y: 40 }} style={s.searchCard}>
            <View style={s.handle} />

            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={s.searchTitle}>Finding your delivery captain</Text>
              <Text style={s.searchStatus}>{searchStatus}</Text>
            </View>

            <LinearGradient
              colors={['#fff7ed', '#ffffff', '#fffbeb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.priceBox}
            >
              <Text style={s.priceLabel}>EXPECTED PRICE</Text>
              <Text style={s.priceValue}>{expectedFareLabel}</Text>
              <Text style={s.priceMeta}>{expectedFareMeta}</Text>
            </LinearGradient>

            <SearchingDots />

            <View style={s.infoRow}>
              <View style={s.infoItem}>
                <View style={s.infoBubble}>
                  <PulseDot />
                </View>
                <Text style={s.infoText}>FAST DISPATCH</Text>
              </View>
              <View style={s.infoDivider} />
              <View style={s.infoItem}>
                <ShieldCheck size={20} color="#3b82f6" strokeWidth={2.5} />
                <Text style={s.infoText}>PARCEL SAFETY</Text>
              </View>
            </View>

            {bookingError ? (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{bookingError}</Text>
              </View>
            ) : null}

            <Tap scale={0.98} onPress={() => setShowCancelConfirm(true)} style={s.cancelSearch}>
              <Text style={s.cancelSearchText}>CANCEL SEARCH</Text>
            </Tap>
          </Enter>
        )}

        {isAccepted && (
          <Enter key="accepted" from={{ y: 60 }}>
            <View style={s.acceptedCard}>
              <View style={s.acceptedHead}>
                <View style={s.acceptedCheck}>
                  <CheckCircle2 size={12} color={u.text} strokeWidth={3} />
                </View>
                <Text style={s.acceptedTitle}>CAPTAIN CONFIRMED</Text>
              </View>

              <View style={{ padding: 24 }}>
                <View style={s.driverRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={s.driverNameRow}>
                      <Text numberOfLines={1} style={s.driverName}>{String(driver.name || 'Captain').toUpperCase()}</Text>
                      <View style={s.ratingPill}>
                        <Star size={10} color={u.accent} fill="#eab308" />
                        <Text style={s.ratingText}>{driver.rating || 'New'}</Text>
                      </View>
                    </View>

                    <Text style={s.plate}>{String(driver.plate || 'Assigned').toUpperCase()}</Text>

                    <View style={s.vehiclePill}>
                      <Text style={s.vehiclePillText}>
                        {[driver.vehicleColor, driver.vehicleMake, driver.vehicleModel, driver.vehicleType || 'Delivery Vehicle'].filter(Boolean).join(' ') || 'Delivery Vehicle'}
                      </Text>
                    </View>
                  </View>

                  <View style={s.photos}>
                    <View style={s.vehiclePhoto}>
                      <AppImage
                        src={driver.vehicleIconUrl || availableVehicleIcon || BikeIcon}
                        style={{ width: 48, height: 48, opacity: 0.9 }}
                        tintColor="#ffffff"
                        contentFit="contain"
                      />
                    </View>
                    <View style={s.driverPhoto}>
                      <AppImage
                        src={driver.profileImage || `https://ui-avatars.com/api/?name=${(driver.name || 'DC').replace(' ', '+')}&background=cbd5e1&color=0f172a`}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    </View>
                  </View>
                </View>

                <View style={s.actions}>
                  <Tap onPress={() => Linking.openURL(`tel:${driver.phone}`).catch(() => {})} style={s.callButton}>
                    <Phone size={18} color={u.text} strokeWidth={2.5} />
                    <Text style={s.actionText}>CALL</Text>
                  </Tap>
                  <Tap onPress={() => navigate(`${routePrefix}/parcel/chat`, { state: { driver } })} style={s.chatButton}>
                    <ChatUnreadBadge count={chatUnread} />
                    <MessageCircle size={18} color={u.text} strokeWidth={2.5} />
                    <Text style={s.actionText}>CHAT</Text>
                  </Tap>
                </View>
              </View>
            </View>

            <View style={s.arrivingRow}>
              <PingDot />
              <Text style={s.arrivingText}>CAPTAIN IS ARRIVING</Text>
            </View>
          </Enter>
        )}
      </View>

      <Dialog open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} style={s.dialog}>
        <View style={s.dialogIcon}>
          <AlertTriangle size={26} color="#f87171" strokeWidth={2} />
        </View>
        <Text style={s.dialogTitle}>Cancel parcel search?</Text>
        <Text style={s.dialogText}>We&apos;re still searching nearby captains. Stop looking?</Text>
        <CancellationFeeNotice rideId={activeRideIdRef.current} />
        <View style={{ gap: 10, alignSelf: 'stretch' }}>
          <Tap scale={0.97} onPress={handleCancel} style={s.dialogConfirm}>
            <Text style={s.dialogConfirmText}>YES, CANCEL</Text>
          </Tap>
          <Pressable onPress={() => setShowCancelConfirm(false)} style={s.dialogKeep}>
            <Text style={s.dialogKeepText}>{isSearching ? 'KEEP SEARCHING' : 'GO BACK'}</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
};

const styles = StyleSheet.create({
  radar: { width: RADAR_SIZE, height: RADAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(251,146,60,0.4)',
    backgroundColor: 'rgba(251,146,60,0.05)',
  },
  sweep: { position: 'absolute', width: RADAR_SIZE, height: RADAR_SIZE, borderRadius: RADAR_SIZE / 2, overflow: 'hidden' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

const useStyles = makeStyles((t) => {
  const u = userTokens(t.dark);
  return {
    radarAnchor: { position: 'absolute', width: RADAR_SIZE, height: RADAR_SIZE, marginLeft: -RADAR_SIZE / 2, marginTop: -RADAR_SIZE / 2 },
    routeCard: { position: 'absolute', left: 16, right: 64, zIndex: 20, backgroundColor: u.card, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: u.border, ...USER_SHADOW },
    routeLabel: { fontSize: 10.5, lineHeight: 12, fontWeight: '600', letterSpacing: 1, color: u.text2, marginBottom: 4 },
    routeText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: u.text },
    otpBadge: { position: 'absolute', left: 16, zIndex: 20, backgroundColor: u.card, borderRadius: 12, padding: 12, minWidth: 70, borderWidth: 1, borderColor: u.border, ...USER_SHADOW },
    otpValue: { fontSize: 18, lineHeight: 22, fontWeight: '700', color: '#1d4ed8', textAlign: 'center', letterSpacing: 0.9 },
    otpLabel: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '600', color: u.text2, textAlign: 'center' },
    closeButton: { position: 'absolute', right: 16, zIndex: 20, width: 40, height: 40, backgroundColor: u.card, borderRadius: 12, borderWidth: 1, borderColor: u.border, alignItems: 'center', justifyContent: 'center', ...USER_SHADOW },
    bottomArea: { position: 'absolute', left: 16, right: 16, zIndex: 20 },
    searchCard: { borderRadius: 32, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, gap: 20, ...USER_SHADOW },
    handle: { width: 40, height: 6, borderRadius: 3, backgroundColor: u.soft, alignSelf: 'center', marginBottom: 8 },
    searchTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, color: u.text, textAlign: 'center' },
    searchStatus: { maxWidth: 260, fontSize: 13, lineHeight: 19, fontWeight: '600', color: u.text2, textAlign: 'center' },
    priceBox: { borderRadius: 24, borderWidth: 1, borderColor: '#ffedd5', paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
    // text-orange-500 is the yellow accent inside the Taxi user app (index.css)
    priceLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.6, color: u.accent },
    priceValue: { marginTop: 4, fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: u.text, textAlign: 'center' },
    priceMeta: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600', color: u.text2, textAlign: 'center' },
    infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 24, backgroundColor: u.card, borderWidth: 1, borderColor: u.border },
    infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    infoBubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center' },
    infoText: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0.55, color: u.text2 },
    infoDivider: { width: 1, height: 32, backgroundColor: u.soft },
    errorBox: { borderRadius: 22, borderWidth: 1, borderColor: '#fee2e2', backgroundColor: u.soft, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
    errorText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#ef4444', textAlign: 'center' },
    cancelSearch: { width: '100%', paddingVertical: 18, borderRadius: 22, backgroundColor: u.soft, borderWidth: 1, borderColor: 'rgba(254,226,226,0.5)', alignItems: 'center' },
    cancelSearchText: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 1.3, color: '#ef4444' },
    acceptedCard: { overflow: 'hidden', borderRadius: 32, backgroundColor: u.card, borderWidth: 1, borderColor: u.border, ...USER_SHADOW },
    acceptedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: u.soft, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(209,250,229,0.5)' },
    acceptedCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
    acceptedTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 0.35, color: '#047857' },
    driverRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    driverNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    driverName: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4, color: u.text2 },
    ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(250,204,21,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)' },
    ratingText: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#a16207' },
    plate: { fontSize: 28, lineHeight: 28, fontWeight: '700', letterSpacing: -1.4, color: u.text, marginBottom: 16 },
    vehiclePill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999, backgroundColor: u.soft, borderWidth: 1, borderColor: 'rgba(226,232,240,0.5)' },
    vehiclePillText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: u.text2 },
    photos: { width: 96, height: 80 },
    vehiclePhoto: { position: 'absolute', right: 0, top: 0, width: 80, height: 80, borderRadius: 24, backgroundColor: '#1d2333', borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...USER_SHADOW },
    driverPhoto: { position: 'absolute', left: -8, bottom: 0, width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: '#ffffff', backgroundColor: u.soft, overflow: 'hidden', ...USER_SHADOW },
    actions: { marginTop: 28, flexDirection: 'row', gap: 16 },
    callButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 22, backgroundColor: u.card, paddingVertical: 18, borderWidth: 1, borderColor: 'rgba(226,232,240,0.6)' },
    chatButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 22, backgroundColor: u.card, paddingVertical: 18, ...USER_SHADOW },
    actionText: { fontSize: 13, lineHeight: 14, fontWeight: '700', letterSpacing: 1.3, color: u.text },
    arrivingRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    arrivingText: { fontSize: 12, lineHeight: 14, fontWeight: '700', letterSpacing: 2.4, color: u.text2 },
    dialog: { width: '82%', maxWidth: 384, borderRadius: 28, padding: 28, alignItems: 'center', backgroundColor: u.card, ...USER_SHADOW },
    dialogIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    dialogTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: u.text, marginBottom: 6, textAlign: 'center' },
    dialogText: { fontSize: 13, lineHeight: 21, fontWeight: '600', color: u.text2, marginBottom: 16, textAlign: 'center' },
    // button.bg-slate-900 is the yellow accent button inside the Taxi user app (index.css)
    dialogConfirm: { width: '100%', backgroundColor: u.accent, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
    dialogConfirmText: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 1.3, color: u.ink },
    dialogKeep: { width: '100%', paddingVertical: 14, alignItems: 'center' },
    dialogKeepText: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 1.3, color: u.text2 },
  };
});

export default ParcelSearchingDriver;
