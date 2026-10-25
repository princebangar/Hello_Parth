import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, MessageCircle, AlertTriangle, Shield, Star, ChevronLeft, Share2, Clock3 } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Dialog, Screen, Text } from '@/native/ui';
import { resolveImageSource } from '@/native/ui/AppImage';
import { AppMap, Marker, Polyline, regionFor, toLatLng as toMapLatLng } from '@/native/ui/AppMap';
import { alpha, colors, useTheme } from '@/theme';
import { socketService } from '../../../../shared/api/socket';
import api from '../../../../shared/api/axiosInstance';
import CancellationFeeNotice, { announceCancellationFee } from '../../components/CancellationFeeNotice';
import { BACKEND_ORIGIN } from '../../../../shared/api/runtimeConfig';
import { subscribeRideRealtime } from '../../../../shared/services/rideRealtime';
import { computeDrivingRoute } from '../../../../shared/utils/googleRoutes';
import { clearCurrentRide, getCurrentRide, saveCurrentRide } from '../../services/currentRideService';
import carIcon from '../../../../assets/icons/car.png';
import bikeIcon from '../../../../assets/icons/bike.png';
import autoIcon from '../../../../assets/icons/auto.png';
import deliveryIcon from '../../../../assets/icons/Delivery.png';
import { useSettings } from '../../../../shared/context/SettingsContext';
import useRideChatUnread from '../../../shared/chat/useRideChatUnread';
import ChatUnreadBadge from '../../../shared/components/ChatUnreadBadge';

// --user-* palette of modules/Taxi/index.css; the Taxi scope remaps bg-white / slate text / borders to it.
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
const ACCENT = '#FFC400';
const INK = '#0b1220';
// `.user-app-theme .shadow-*` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };
const FLOAT_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } };
// the bottom sheet slides this far down when it is closed (framer-motion animate={{ y: drawerOpen ? 0 : 420 }})
const DRAWER_CLOSED_Y = 420;


const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'delivered']);
const COMPLETED_TRACKING_STATUSES = new Set(['completed', 'delivered']);
const POST_RIDE_REDIRECT_STATUSES = new Set(['arrived', 'completed', 'delivered']);
const ROUTE_REFRESH_MIN_DISTANCE_METERS = 30;
const ROUTE_REFRESH_MIN_INTERVAL_MS = 4000;
const ROUTE_PROGRESS_CAPTURE_METERS = 40;
const ROUTE_DESTINATION_CHANGE_METERS = 15;
const MAX_ROUTE_CACHE_ENTRIES = 120;

const toLatLng = (coords, fallback = DEFAULT_CENTER) => {
  const [lng, lat] = coords || [];

  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return { lat: Number(lat), lng: Number(lng) };
  }

  return fallback;
};

const arePositionsNearlyEqual = (first, second, threshold = 0.0002) => (
  Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
  Math.abs(Number(first?.lng ?? 0) - Number(second?.lng ?? 0)) < threshold
);

// The route effect depends on routePath itself, so it must never swap in a fresh-but-identical array.
const keepRouteIfSame = (current, next) => (
  Array.isArray(current) &&
  current.length === next.length &&
  current.every((point, index) => arePositionsNearlyEqual(point, next[index], 0.000001))
    ? current
    : next
);

const toRadians = (value) => Number(value || 0) * (Math.PI / 180);

const getDistanceMeters = (first, second) => {
  if (!first || !second) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(Number(second.lat) - Number(first.lat));
  const deltaLng = toRadians(Number(second.lng) - Number(first.lng));
  const startLat = toRadians(first.lat);
  const endLat = toRadians(second.lat);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const normalizeHeading = (value, fallback = 0) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return ((numeric % 360) + 360) % 360;
};

const calculateBearing = (from, to, fallback = 0) => {
  if (!from || !to || arePositionsNearlyEqual(from, to, 0.00001)) {
    return fallback;
  }

  const fromLat = Number(from.lat) * (Math.PI / 180);
  const toLat = Number(to.lat) * (Math.PI / 180);
  const deltaLng = (Number(to.lng) - Number(from.lng)) * (Math.PI / 180);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);

  return normalizeHeading(Math.atan2(y, x) * (180 / Math.PI), fallback);
};

const getRouteHeading = (position, path = [], fallback = 0) => {
  const nextPoint = path.find((point) => !arePositionsNearlyEqual(position, point, 0.00001));
  return nextPoint ? calculateBearing(position, nextPoint, fallback) : fallback;
};


// Driver marker: the vehicle icon turned to the heading (web: an OverlayView with a rotated <img>).
const RotatingVehicleMarker = ({ position, iconUrl = carIcon, heading = 0, title = 'Driver' }) => {
  const [failed, setFailed] = useState(false);
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const source = resolveImageSource(failed ? carIcon : (iconUrl || carIcon));
  const sourceKey = typeof source === 'number' ? source : source?.uri;

  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);

  useEffect(() => {
    // re-snapshot the marker view once its image is in, then stop tracking (keeps the map smooth)
    setTracksViewChanges(true);
    const id = setTimeout(() => setTracksViewChanges(false), 800);
    return () => clearTimeout(id);
  }, [sourceKey]);

  return (
    <Marker
      coordinate={toMapLatLng(position)}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={normalizeHeading(heading)}
      flat
      title={title}
      zIndex={10}
      tracksViewChanges={tracksViewChanges}
    >
      <View style={markerStyles.vehicleBox} pointerEvents="none">
        <Image
          source={source}
          accessibilityLabel={title}
          style={markerStyles.vehicleImg}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </View>
    </Marker>
  );
};

const CircleLocationMarker = ({ position, color, title }) => (
  <Marker coordinate={toMapLatLng(position)} anchor={{ x: 0.5, y: 0.5 }} title={title} tracksViewChanges={false}>
    <View style={[markerStyles.circle, { backgroundColor: color }]} />
  </Marker>
);

const markerStyles = StyleSheet.create({
  vehicleBox: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  vehicleImg: { width: 48, height: 48 },
  circle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 3,
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});


const getTrackingVehicleIcon = (ride, driver) => {
  const customIcon = String(
    ride?.vehicleIconUrl ||
    ride?.vehicle?.vehicleIconUrl ||
    ride?.vehicle?.icon ||
    driver?.vehicleIconUrl ||
    driver?.map_icon ||
    driver?.icon ||
    '',
  ).trim();

  if (customIcon) return customIcon;

  const serviceType = String(ride?.serviceType || ride?.type || '').toLowerCase();
  const iconType = String(ride?.vehicleIconType || driver?.vehicleIconType || driver?.vehicleType || '').toLowerCase();

  if (serviceType === 'parcel') return deliveryIcon;
  if (iconType.includes('bike')) return bikeIcon;
  if (iconType.includes('auto')) return autoIcon;
  return carIcon;
};

const getInitials = (name = '') =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'DR';

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;
const isLikelyVehiclePhoto = (value = '') => /^(https?:|data:image\/|blob:|\/uploads\/|\/images\/)/i.test(String(value || '').trim());
const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const pickPreferredValue = (...values) => values.find((value) => String(value || '').trim()) || '';
const resolveAssetUrl = (value = '') => {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  if (/^(https?:|data:image\/|blob:)/i.test(raw)) {
    return raw;
  }

  // Root-level files like `/4_Taxi.png` are served from the frontend's public/ folder.
  if (/^\/[^/]+\.(png|jpe?g|svg|webp|gif)$/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('/')) {
    return `${BACKEND_ORIGIN}${raw}`;
  }

  return `${BACKEND_ORIGIN}/${raw.replace(/^\/+/, '')}`;
};

const buildRideShareText = ({ appName, driverName, vehicleNumber, pickupLabel, dropLabel, trackUrl }) =>
  `I'm riding with ${appName}!\nDriver: ${driverName} (${vehicleNumber || 'Assigned'})\nFrom: ${pickupLabel}\nTo: ${dropLabel}${trackUrl ? `\nTrack my ride live: ${trackUrl}` : ''}`;

const buildShareLinks = (text) => ({
  whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
  sms: `sms:?&body=${encodeURIComponent(text)}`,
});

const formatTimerClock = (totalSeconds) => {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatWholeMinutes = (value) => `${Math.max(0, Math.floor(Number(value) || 0))} min`;
const getRouteCacheKey = (origin, destination) => {
  const serializePoint = (point) =>
    point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

  return `${serializePoint(origin)}|${serializePoint(destination)}`;
};

const trimRoutePathFromPosition = (path = [], position) => {
  if (!Array.isArray(path) || path.length < 2 || !position) {
    return null;
  }

  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  path.forEach((point, index) => {
    const distance = getDistanceMeters(position, point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  if (nearestIndex < 0 || nearestDistance > ROUTE_PROGRESS_CAPTURE_METERS) {
    return null;
  }

  if (nearestIndex >= path.length - 1) {
    return [position];
  }

  return [position, ...path.slice(nearestIndex + 1)];
};

const rememberRouteCacheEntry = (cache, key, value) => {
  cache.set(key, value);

  if (cache.size <= MAX_ROUTE_CACHE_ENTRIES) {
    return;
  }

  const firstKey = cache.keys().next().value;
  if (firstKey) {
    cache.delete(firstKey);
  }
};

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Pickup time pending';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Pickup time pending';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScheduledCountdownLabel = (value, now = Date.now()) => {
  const parsed = value ? new Date(value) : null;
  const time = parsed?.getTime?.() || NaN;

  if (!Number.isFinite(time)) {
    return '';
  }

  const diffMs = time - now;
  if (diffMs <= 0) {
    return 'Pickup window is open';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `Starts in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `Starts in ${hours}h ${minutes}m`;
  }

  return `Starts in ${minutes}m`;
};

const mergeDriverSnapshot = (baseDriver = {}, incomingDriver = {}) => {
  const safeBaseDriver = isPlainObject(baseDriver) ? baseDriver : {};
  const safeIncomingDriver = isPlainObject(incomingDriver) ? incomingDriver : {};
  const incomingVehicle = isPlainObject(safeIncomingDriver.vehicle) ? safeIncomingDriver.vehicle : {};
  const baseVehicle = isPlainObject(safeBaseDriver.vehicle) ? safeBaseDriver.vehicle : {};

  return {
    ...safeBaseDriver,
    ...safeIncomingDriver,
    profileImage: pickPreferredValue(
      safeIncomingDriver.profileImage,
      safeIncomingDriver.profile_image,
      safeIncomingDriver.image,
      safeIncomingDriver.avatar,
      safeIncomingDriver.selfie,
      safeBaseDriver.profileImage,
      safeBaseDriver.profile_image,
      safeBaseDriver.image,
      safeBaseDriver.avatar,
      safeBaseDriver.selfie,
    ),
    vehicleImage: pickPreferredValue(
      safeIncomingDriver.vehicleImage,
      safeIncomingDriver.vehicle_image,
      safeIncomingDriver.vehiclePhoto,
      safeIncomingDriver.vehicle_photo,
      incomingVehicle.vehicleImage,
      incomingVehicle.vehicle_image,
      incomingVehicle.image,
      incomingVehicle.photo,
      safeBaseDriver.vehicleImage,
      safeBaseDriver.vehicle_image,
      safeBaseDriver.vehiclePhoto,
      safeBaseDriver.vehicle_photo,
      baseVehicle.vehicleImage,
      baseVehicle.vehicle_image,
      baseVehicle.image,
      baseVehicle.photo,
    ),
    image: pickPreferredValue(safeIncomingDriver.image, safeIncomingDriver.profileImage, safeBaseDriver.image, safeBaseDriver.profileImage),
    avatar: pickPreferredValue(safeIncomingDriver.avatar, safeIncomingDriver.profileImage, safeBaseDriver.avatar, safeBaseDriver.profileImage),
    name: pickPreferredValue(safeIncomingDriver.name, safeBaseDriver.name),
    phone: pickPreferredValue(safeIncomingDriver.phone, safeIncomingDriver.mobile, safeIncomingDriver.phoneNumber, safeBaseDriver.phone, safeBaseDriver.mobile, safeBaseDriver.phoneNumber),
    vehicle: pickPreferredValue(
      typeof safeIncomingDriver.vehicle === 'string' ? safeIncomingDriver.vehicle : '',
      safeIncomingDriver.vehicleType,
      safeIncomingDriver.vehicle_type,
      incomingVehicle.name,
      incomingVehicle.vehicleType,
      incomingVehicle.vehicle_type,
      typeof safeBaseDriver.vehicle === 'string' ? safeBaseDriver.vehicle : '',
      safeBaseDriver.vehicleType,
      safeBaseDriver.vehicle_type,
      baseVehicle.name,
      baseVehicle.vehicleType,
      baseVehicle.vehicle_type,
    ),
    vehicleType: pickPreferredValue(
      safeIncomingDriver.vehicleType,
      safeIncomingDriver.vehicle_type,
      incomingVehicle.vehicleType,
      incomingVehicle.vehicle_type,
      safeBaseDriver.vehicleType,
      safeBaseDriver.vehicle_type,
      baseVehicle.vehicleType,
      baseVehicle.vehicle_type,
    ),
    vehicleNumber: pickPreferredValue(
      safeIncomingDriver.vehicleNumber,
      safeIncomingDriver.vehicle_number,
      safeIncomingDriver.plate,
      incomingVehicle.vehicleNumber,
      incomingVehicle.vehicle_number,
      incomingVehicle.plate,
      safeBaseDriver.vehicleNumber,
      safeBaseDriver.vehicle_number,
      safeBaseDriver.plate,
      baseVehicle.vehicleNumber,
      baseVehicle.vehicle_number,
      baseVehicle.plate,
    ),
    plate: pickPreferredValue(
      safeIncomingDriver.plate,
      safeIncomingDriver.vehicleNumber,
      safeIncomingDriver.vehicle_number,
      incomingVehicle.plate,
      incomingVehicle.vehicleNumber,
      incomingVehicle.vehicle_number,
      safeBaseDriver.plate,
      safeBaseDriver.vehicleNumber,
      safeBaseDriver.vehicle_number,
      baseVehicle.plate,
      baseVehicle.vehicleNumber,
      baseVehicle.vehicle_number,
    ),
    vehicleColor: pickPreferredValue(safeIncomingDriver.vehicleColor, safeIncomingDriver.vehicle_color, incomingVehicle.vehicleColor, incomingVehicle.vehicle_color, safeBaseDriver.vehicleColor, safeBaseDriver.vehicle_color, baseVehicle.vehicleColor, baseVehicle.vehicle_color),
    vehicleMake: pickPreferredValue(safeIncomingDriver.vehicleMake, safeIncomingDriver.vehicle_make, incomingVehicle.vehicleMake, incomingVehicle.vehicle_make, safeBaseDriver.vehicleMake, safeBaseDriver.vehicle_make, baseVehicle.vehicleMake, baseVehicle.vehicle_make),
    vehicleModel: pickPreferredValue(safeIncomingDriver.vehicleModel, safeIncomingDriver.vehicle_model, incomingVehicle.vehicleModel, incomingVehicle.vehicle_model, safeBaseDriver.vehicleModel, safeBaseDriver.vehicle_model, baseVehicle.vehicleModel, baseVehicle.vehicle_model),
    rating: pickPreferredValue(safeIncomingDriver.rating, safeBaseDriver.rating),
  };
};


const RideTracking = () => {
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const drawerY = useRef(new Animated.Value(0)).current;
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [rideRealtime, setRideRealtime] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [routeError, setRouteError] = useState('');
  const [map, setMap] = useState(null);
  const [driverImageFallback, setDriverImageFallback] = useState('');
  const [driverImageBroken, setDriverImageBroken] = useState(false);
  const [vehicleImageFallback, setVehicleImageFallback] = useState('');
  const [vehicleImageBroken, setVehicleImageBroken] = useState(false);
  const [arrivalClockFallbackAt, setArrivalClockFallbackAt] = useState('');
  const [waitingNow, setWaitingNow] = useState(Date.now());
  const [socketRealtimeHealthy, setSocketRealtimeHealthy] = useState(() => socketService.isConnected());
  const routeCacheRef = useRef(new Map());
  const lastResolvedRouteRef = useRef({
    origin: null,
    destination: null,
    resolvedAt: 0,
  });
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const navigate = useNavigate();
  const location = useLocation();
  const storedRide = useMemo(() => getCurrentRide(), []);
  const state = useMemo(() => location.state || storedRide || {}, [location.state, storedRide]);
  // The native map and the Routes API are always available (no JS loader as on the web).
  const isLoaded = true;
  const routeHome = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '/';
  const routeComplete = location.pathname.startsWith('/taxi/user') ? '/taxi/user/ride/complete' : '/ride/complete';
  const routeChat = location.pathname.startsWith('/taxi/user') ? '/taxi/user/ride/chat' : '/ride/chat';
  const routeSupport = location.pathname.startsWith('/taxi/user') ? '/taxi/user/support' : '/ride/support';
  const routeSos = location.pathname.startsWith('/taxi/user') ? '/taxi/user/safety/sos' : '/taxi/safety/sos';

  const rideId = state.rideId || '';
  const chatUnread = useRideChatUnread(rideId, 'user');
  const scheduledAt = rideRealtime?.scheduledAt || state.scheduledAt || null;
  const scheduledTimestamp = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
  const isScheduledRide = Number.isFinite(scheduledTimestamp);
  const isScheduledUpcoming = isScheduledRide && scheduledTimestamp > waitingNow;
  const scheduledCountdown = getScheduledCountdownLabel(scheduledAt, waitingNow);
  const scheduledDateLabel = formatScheduledDateTime(scheduledAt);
  const fare = rideRealtime?.fare || state.fare || 0;
  const paymentMethod = rideRealtime?.paymentMethod || state.paymentMethod || 'Cash';
  const fallbackDriver = useMemo(
    () => state.driver || { name: 'Captain', rating: '', vehicle: 'Taxi', plate: 'Assigned', phone: '', profileImage: '', vehicleImage: '' },
    [state.driver],
  );
  const pickupLabel = rideRealtime?.pickup?.address || state.pickup || 'Pickup location';
  const dropLabel = rideRealtime?.drop?.address || state.drop || 'Drop location';
  const pickupPosition = useMemo(
    () => toLatLng(rideRealtime?.pickup?.coordinates || state.pickupCoords),
    [rideRealtime?.pickup?.coordinates, state.pickupCoords],
  );
  const dropPosition = useMemo(
    () => toLatLng(rideRealtime?.drop?.coordinates || state.dropCoords, pickupPosition),
    [pickupPosition, rideRealtime?.drop?.coordinates, state.dropCoords],
  );
  const driverPosition = useMemo(
    () => toLatLng(rideRealtime?.driverLocation?.coordinates, pickupPosition),
    [pickupPosition, rideRealtime?.driverLocation?.coordinates],
  );
  const hasLiveDriverLocation = Boolean(rideRealtime?.driverLocation?.coordinates?.length);
  const tripStatus = String(rideRealtime?.status || state.liveStatus || state.status || 'accepted').toLowerCase();
  const otp = ['started', 'ongoing', 'arrived', 'completed'].includes(tripStatus)
    ? ''
    : String(rideRealtime?.otp || state.otp || state.ride_otp || '');
  const serviceType = String(state.serviceType || state.type || 'ride').toLowerCase();
  const activeDestination = useMemo(
    () => (['started', 'ongoing', 'arrived', 'completed'].includes(tripStatus) ? dropPosition : pickupPosition),
    [dropPosition, pickupPosition, tripStatus],
  );
  const driver = useMemo(
    () => mergeDriverSnapshot(fallbackDriver, rideRealtime?.driver || {}),
    [fallbackDriver, rideRealtime?.driver],
  );
  const trackingSnapshot = useMemo(
    () => ({
      ...state,
      ...(rideRealtime || {}),
      fare,
      paymentMethod,
      serviceType,
      vehicleIconType: rideRealtime?.vehicleIconType || state.vehicleIconType || '',
      vehicleIconUrl: rideRealtime?.vehicleIconUrl || state.vehicleIconUrl || '',
      driver,
    }),
    [driver, fare, paymentMethod, rideRealtime, serviceType, state],
  );
  const waitingPricing = rideRealtime?.pricingSnapshot || state.pricingSnapshot || {};
  const waitingChargePerMinute = Math.max(0, Number(waitingPricing?.waiting_charge ?? 0));
  const freeWaitingBeforeMinutes = Math.max(0, Number(waitingPricing?.free_waiting_before ?? 0));
  const waitingStartedAt = rideRealtime?.arrivedAt || state.arrivedAt || arrivalClockFallbackAt || '';
  const waitingElapsedSeconds = waitingStartedAt
    ? Math.max(0, Math.floor((waitingNow - new Date(waitingStartedAt).getTime()) / 1000))
    : 0;
  const freeWaitingRemainingSeconds = Math.max(0, freeWaitingBeforeMinutes * 60 - waitingElapsedSeconds);
  const waitingChargeableMinutes = Math.max(0, Math.ceil(waitingElapsedSeconds / 60) - freeWaitingBeforeMinutes);
  const isWaitingForOtp = Boolean(waitingStartedAt) && !['started', 'ongoing', 'arrived', 'completed', 'cancelled', 'delivered'].includes(tripStatus);
  const vehicleIcon = getTrackingVehicleIcon(trackingSnapshot, driver);
  const displayDriverHeading = useMemo(() => {
    if (Number.isFinite(Number(rideRealtime?.driverLocation?.heading))) {
      return normalizeHeading(rideRealtime.driverLocation.heading);
    }

    return getRouteHeading(
      driverPosition,
      routePath,
      calculateBearing(driverPosition, activeDestination),
    );
  }, [activeDestination, driverPosition, rideRealtime?.driverLocation?.heading, routePath]);
  const vehicleLabel = driver.vehicle || driver.vehicleType || (serviceType === 'parcel' ? 'Parcel' : 'Taxi');
  const nextDriverImage = resolveAssetUrl(
    driver.profileImage || driver.profile_image || driver.image || driver.avatar || driver.selfie || '',
  );
  const nextVehicleImage = resolveAssetUrl(
    driver.vehicleImage || driver.vehicle_image || driver.vehiclePhoto || driver.vehicle_photo || '',
  );
  const driverImage = driverImageBroken ? '' : (nextDriverImage || driverImageFallback);
  const vehicleImage = vehicleImageBroken ? '' : (nextVehicleImage || vehicleImageFallback);
  const hasVehiclePhoto = isLikelyVehiclePhoto(vehicleImage) && !vehicleImageBroken;
  const arrivalDriverName = driver.name || (serviceType === 'parcel' ? 'Agent' : 'Driver');
  const driverSubtitle = isWaitingForOtp
    ? `${arrivalDriverName} has arrived`
    : isScheduledUpcoming && !hasLiveDriverLocation
    ? 'Driver assigned. Live tracking starts closer to pickup time'
    : tripStatus === 'arrived'
    ? (serviceType === 'parcel' ? 'Parcel reached destination' : 'Driver reached destination')
    : tripStatus === 'started' || tripStatus === 'ongoing'
    ? (serviceType === 'parcel' ? 'Parcel picked up' : 'Trip started')
    : serviceType === 'parcel'
      ? 'Delivery agent is on the way'
      : 'Captain is on the way';
  const vehicleDetails = [driver.vehicleColor, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ');
  const activeRideEndpoint = serviceType === 'parcel' ? '/deliveries/active/me' : '/rides/active/me';
  const latestStateRef = useRef(state);
  const latestFallbackDriverRef = useRef(fallbackDriver);
  const latestDriverRef = useRef(driver);
  const latestTripStatusRef = useRef(tripStatus);
  const backoffCountRef = useRef(0);
  const pollTimerRef = useRef(null);
  const latestCompleteTrackingRef = useRef(() => {});
  const hasCompletedRedirectRef = useRef(false);
  const hasAutoFramedMapRef = useRef(false);
  const lastMapPanPositionRef = useRef(null);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    latestFallbackDriverRef.current = fallbackDriver;
  }, [fallbackDriver]);

  useEffect(() => {
    latestDriverRef.current = driver;
  }, [driver]);

  useEffect(() => {
    latestTripStatusRef.current = tripStatus;
  }, [tripStatus]);

  useEffect(() => {
    hasAutoFramedMapRef.current = false;
    lastMapPanPositionRef.current = null;
  }, [rideId, tripStatus, activeDestination.lat, activeDestination.lng]);

  const handleCancelRide = async () => {
    try {
      if (rideId) {
        announceCancellationFee(await api.patch(`/rides/${rideId}/cancel`));
      }
    } catch (_error) {
      // If the ride has already advanced or ended, we still clear the local state below.
    } finally {
      clearCurrentRide();
      navigate('/taxi/user');
    }
  };

  useEffect(() => {
    if (nextDriverImage) {
      setDriverImageFallback(nextDriverImage);
      setDriverImageBroken(false);
    }
  }, [nextDriverImage]);

  useEffect(() => {
    if (nextVehicleImage) {
      setVehicleImageFallback(nextVehicleImage);
      setVehicleImageBroken(false);
    }
  }, [nextVehicleImage]);

  useEffect(() => {
    if (rideRealtime?.arrivedAt || state.arrivedAt) {
      setArrivalClockFallbackAt('');
      return;
    }

    if (tripStatus === 'arriving') {
      setArrivalClockFallbackAt((current) => current || new Date().toISOString());
      return;
    }

    if (['started', 'ongoing', 'arrived', 'completed', 'cancelled', 'delivered'].includes(tripStatus)) {
      setArrivalClockFallbackAt('');
    }
  }, [rideRealtime?.arrivedAt, state.arrivedAt, tripStatus]);

  useEffect(() => {
    if (!isWaitingForOtp) {
      return undefined;
    }

    setWaitingNow(Date.now());
    const intervalId = window.setInterval(() => {
      setWaitingNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isWaitingForOtp]);

  const exitTracking = useMemo(
    () => () => {
      // We don't clear the ride on mount anymore to allow refreshes on the rating page.
      // clearCurrentRide() is now called after submission or when skipping.
      navigate(routeHome, { replace: true });
    },
    [navigate, routeHome],
  );

  const completeTracking = useMemo(
    () => (statusValue = 'completed') => {
      // JSON round-trip: API data arrives wrapped in Proxies (axiosInstance), and history.state
      // can't structured-clone a Proxy — navigate() would throw DataCloneError.
      const completedRideSnapshot = JSON.parse(JSON.stringify({
        ...state,
        rideId,
        fare,
        paymentMethod,
        driverPaymentCollection: rideRealtime?.driverPaymentCollection || state.driverPaymentCollection || null,
        pickup: pickupLabel,
        drop: dropLabel,
        driver,
        status: statusValue,
        liveStatus: statusValue,
        feedback: rideRealtime?.feedback || state.feedback || null,
        arrivedAt: rideRealtime?.arrivedAt || state.arrivedAt || '',
        completedAt: rideRealtime?.completedAt || rideRealtime?.arrivedAt || state.arrivedAt || Date.now(),
      }));

      saveCurrentRide(completedRideSnapshot);
      navigate(routeComplete, {
        replace: true,
        state: completedRideSnapshot,
        flushSync: true,
      });
    },
    [driver, dropLabel, fare, navigate, paymentMethod, pickupLabel, rideId, rideRealtime?.completedAt, rideRealtime?.feedback, routeComplete, state],
  );

  useEffect(() => {
    latestCompleteTrackingRef.current = completeTracking;
  }, [completeTracking]);

  useEffect(() => {
    hasCompletedRedirectRef.current = false;
  }, [rideId]);

  useEffect(() => {
    let active = true;

    if (!rideId) {
      exitTracking();
      return () => {
        active = false;
      };
    }

    const hydrateRideState = async () => {
      try {
        const response = await api.get(`/rides/${rideId}`);
        const payload = unwrapApiPayload(response);
        const nextStatus = String(payload?.liveStatus || payload?.status || '').toLowerCase();

        if (!active) {
          return;
        }

        if (POST_RIDE_REDIRECT_STATUSES.has(nextStatus)) {
          const mergedDriver = mergeDriverSnapshot(fallbackDriver, payload?.driver || {});
          setRideRealtime({
            pickup: {
              coordinates: payload?.pickupLocation?.coordinates,
              address: payload?.pickupAddress || latestStateRef.current.pickup || 'Pickup',
            },
            drop: {
              coordinates: payload?.dropLocation?.coordinates,
              address: payload?.dropAddress || latestStateRef.current.drop || 'Drop',
            },
            driverLocation: payload?.lastDriverLocation
              ? { coordinates: payload.lastDriverLocation.coordinates }
              : null,
            status: nextStatus,
            fare: payload?.fare || latestStateRef.current.fare || 0,
            paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
            vehicleIconType: payload?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
            vehicleIconUrl: payload?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
            scheduledAt: payload?.scheduledAt || latestStateRef.current.scheduledAt || null,
            otp: payload?.otp || latestStateRef.current.otp || latestStateRef.current.ride_otp || '',
            arrivedAt: payload?.arrivedAt || latestStateRef.current.arrivedAt || '',
            pricingSnapshot: payload?.pricingSnapshot || latestStateRef.current.pricingSnapshot || null,
            driverPaymentCollection: payload?.driverPaymentCollection || latestStateRef.current.driverPaymentCollection || null,
            completedAt: payload?.completedAt || null,
            feedback: payload?.feedback || null,
            driver: mergedDriver,
          });
          completeTracking(nextStatus);
          return;
        }

        if (TERMINAL_STATUSES.has(nextStatus)) {
          if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
            const mergedDriver = mergeDriverSnapshot(fallbackDriver, payload?.driver || {});
            setRideRealtime({
              pickup: {
                coordinates: payload?.pickupLocation?.coordinates,
                address: payload?.pickupAddress || latestStateRef.current.pickup || 'Pickup',
              },
              drop: {
                coordinates: payload?.dropLocation?.coordinates,
                address: payload?.dropAddress || latestStateRef.current.drop || 'Drop',
              },
              driverLocation: payload?.lastDriverLocation
                ? { coordinates: payload.lastDriverLocation.coordinates }
                : null,
              status: nextStatus,
              fare: payload?.fare || latestStateRef.current.fare || 0,
              paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
              vehicleIconType: payload?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
              vehicleIconUrl: payload?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
              scheduledAt: payload?.scheduledAt || latestStateRef.current.scheduledAt || null,
              otp: payload?.otp || latestStateRef.current.otp || latestStateRef.current.ride_otp || '',
              arrivedAt: payload?.arrivedAt || latestStateRef.current.arrivedAt || '',
              pricingSnapshot: payload?.pricingSnapshot || latestStateRef.current.pricingSnapshot || null,
              driverPaymentCollection: payload?.driverPaymentCollection || latestStateRef.current.driverPaymentCollection || null,
              completedAt: payload?.completedAt || null,
              feedback: payload?.feedback || null,
              driver: mergedDriver,
            });
            completeTracking(nextStatus);
            return;
          }
          exitTracking();
          return;
        }

        const mergedDriver = mergeDriverSnapshot(fallbackDriver, payload?.driver || {});

        setRideRealtime({
          pickup: {
            coordinates: payload?.pickupLocation?.coordinates,
            address: payload?.pickupAddress || latestStateRef.current.pickup || 'Pickup',
          },
          drop: {
            coordinates: payload?.dropLocation?.coordinates,
            address: payload?.dropAddress || latestStateRef.current.drop || 'Drop',
          },
          driverLocation: payload?.lastDriverLocation
            ? {
                coordinates: payload.lastDriverLocation.coordinates,
                heading: payload.lastDriverLocation.heading,
              }
            : null,
          status: payload?.liveStatus || payload?.status || 'accepted',
          fare: payload?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          vehicleIconType: payload?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
          vehicleIconUrl: payload?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
          scheduledAt: payload?.scheduledAt || latestStateRef.current.scheduledAt || null,
          otp: payload?.otp || latestStateRef.current.otp || latestStateRef.current.ride_otp || '',
          arrivedAt: payload?.arrivedAt || latestStateRef.current.arrivedAt || '',
          pricingSnapshot: payload?.pricingSnapshot || latestStateRef.current.pricingSnapshot || null,
          driverPaymentCollection: payload?.driverPaymentCollection || latestStateRef.current.driverPaymentCollection || null,
          completedAt: payload?.completedAt || null,
          feedback: payload?.feedback || null,
          driver: mergedDriver,
        });

        saveCurrentRide({
          ...latestStateRef.current,
          rideId,
          driver: mergedDriver,
          status: payload?.status || latestStateRef.current.status || 'accepted',
          liveStatus: payload?.liveStatus || payload?.status || latestStateRef.current.liveStatus || latestStateRef.current.status || 'accepted',
          scheduledAt: payload?.scheduledAt || latestStateRef.current.scheduledAt || null,
          arrivedAt: payload?.arrivedAt || latestStateRef.current.arrivedAt || '',
          pricingSnapshot: payload?.pricingSnapshot || latestStateRef.current.pricingSnapshot || null,
          driverPaymentCollection: payload?.driverPaymentCollection || latestStateRef.current.driverPaymentCollection || null,
        });
      } catch {
        // Let the active-ride validator decide whether the ride ended or the fetch was transient.
      }
    };

    const validateActiveRide = async () => {
      try {
        const activePayload = unwrapApiPayload(await api.get(activeRideEndpoint));
        const activeRideId = String(activePayload?.rideId || '');
        const activeStatus = String(activePayload?.liveStatus || activePayload?.status || '').toLowerCase();

        if (TERMINAL_STATUSES.has(activeStatus)) {
          if (active) {
            if (COMPLETED_TRACKING_STATUSES.has(activeStatus)) {
              completeTracking(activeStatus);
            } else {
              exitTracking();
            }
          }
          return false;
        }

        if (!activeRideId || activeRideId !== String(rideId) || activeStatus !== latestTripStatusRef.current) {
          await hydrateRideState().catch(() => {});
          return false;
        }

        return true;
      } catch (err) {
        console.error('Active ride validation failed:', err);
        throw err; // Re-throw to trigger polling backoff
      }
    };

    const runPoll = async () => {
      if (document.hidden || !active) {
        return;
      }

      try {
        await validateActiveRide();
        backoffCountRef.current = 0; // Reset on success
      } catch (_err) {
        backoffCountRef.current = Math.min(backoffCountRef.current + 1, 4); // Max backoff multiplier of 16x (approx 64s max delay)
      }

      if (active) {
        scheduleNext();
      }
    };

    const scheduleNext = () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      if (document.hidden || !active) {
        return;
      }

      const baseInterval = socketRealtimeHealthy ? 30000 : 4000;
      const backoffMultiplier = Math.pow(2, backoffCountRef.current);
      const delay = Math.min(baseInterval * backoffMultiplier, 60000);

      pollTimerRef.current = setTimeout(() => {
        runPoll();
      }, delay);
    };

    // Immediate sync and kickoff
    hydrateRideState();
    scheduleNext();

    const handleVisibilityChange = () => {
      if (!active) return;

      if (document.visibilityState === 'visible') {
        backoffCountRef.current = 0;
        hydrateRideState().catch(() => {});
        
        // Reconnect/re-verify the socket room join immediately on focus
        const currentSocket = socketService.connect({ role: 'user' });
        if (currentSocket) {
          socketService.emit('ride:join', { rideId });
        }

        scheduleNext();
      } else {
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeRideEndpoint, rideId, socketRealtimeHealthy]); // Added socketRealtimeHealthy to re-trigger scheduling automatically

  useEffect(() => {
    if (!TERMINAL_STATUSES.has(tripStatus)) {
      return;
    }

    if (COMPLETED_TRACKING_STATUSES.has(tripStatus)) {
      if (!hasCompletedRedirectRef.current) {
        hasCompletedRedirectRef.current = true;
        completeTracking(tripStatus);
      }
      return;
    }

    clearCurrentRide();
    const timeoutId = window.setTimeout(() => {
      navigate(routeHome, { replace: true });
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [navigate, routeHome, tripStatus]);

  useEffect(() => {
    if (!rideId) {
      return () => {};
    }

    const socket = socketService.connect({ role: 'user' });

    if (!socket) {
      setSocketRealtimeHealthy(false);
      return () => {};
    }

    setSocketRealtimeHealthy(socket.connected);

    const onRideState = (payload) => {
      if (!payload || String(payload.rideId || '') !== String(rideId)) {
        return;
      }

      const nextStatus = String(payload.liveStatus || payload.status || 'accepted').toLowerCase();

      const latestState = latestStateRef.current;
      const latestFallbackDriver = latestFallbackDriverRef.current;

      setRideRealtime((prev) => ({
        pickup: {
          coordinates: payload.pickupLocation?.coordinates,
          address: payload.pickupAddress || latestState.pickup || 'Pickup',
        },
        drop: {
          coordinates: payload.dropLocation?.coordinates,
          address: payload.dropAddress || latestState.drop || 'Drop',
        },
        driverLocation: payload.lastDriverLocation
          ? {
              coordinates: payload.lastDriverLocation.coordinates,
              heading: payload.lastDriverLocation.heading,
            }
          : null,
        status: payload.liveStatus || payload.status || 'accepted',
        fare: payload.fare || prev?.fare || latestState.fare || 0,
        paymentMethod: payload.paymentMethod || prev?.paymentMethod || latestState.paymentMethod || 'Cash',
        vehicleIconType: payload.vehicleIconType || prev?.vehicleIconType || latestState.vehicleIconType || '',
        vehicleIconUrl: payload.vehicleIconUrl || prev?.vehicleIconUrl || latestState.vehicleIconUrl || '',
        scheduledAt: payload.scheduledAt || prev?.scheduledAt || latestState.scheduledAt || null,
        otp: payload.otp || prev?.otp || latestState.otp || latestState.ride_otp || '',
        arrivedAt: payload.arrivedAt || prev?.arrivedAt || latestState.arrivedAt || '',
        pricingSnapshot: payload.pricingSnapshot || prev?.pricingSnapshot || latestState.pricingSnapshot || null,
        driverPaymentCollection: payload.driverPaymentCollection || prev?.driverPaymentCollection || latestState.driverPaymentCollection || null,
        completedAt: payload.completedAt || null,
        feedback: payload.feedback || null,
        driver: mergeDriverSnapshot(prev?.driver || latestFallbackDriver, payload.driver || {}),
      }));

      if (POST_RIDE_REDIRECT_STATUSES.has(nextStatus)) {
        latestCompleteTrackingRef.current(nextStatus);
        return;
      }

      if (nextStatus === 'cancelled') {
        clearCurrentRide();
      }
    };

    const onLocationUpdated = (payload) => {
      if (!payload || String(payload.rideId || '') !== String(rideId)) {
        return;
      }

      setRideRealtime((prev) => ({
        ...(prev || {}),
        driverLocation: {
          coordinates: payload.coordinates,
          heading: payload.heading ?? prev?.driverLocation?.heading ?? null,
        },
      }));
    };

    const onStatusUpdated = (payload) => {
      if (!payload || String(payload.rideId || '') !== String(rideId)) {
        return;
      }

      const nextStatus = payload.liveStatus || payload.status || 'accepted';
      const normalizedStatus = String(nextStatus).toLowerCase();

      if (POST_RIDE_REDIRECT_STATUSES.has(normalizedStatus)) {
        setRideRealtime((prev) => ({
          ...(prev || {}),
          status: normalizedStatus,
          arrivedAt: payload.arrivedAt || prev?.arrivedAt || null,
          driverPaymentCollection: payload.driverPaymentCollection || prev?.driverPaymentCollection || null,
          completedAt: payload.completedAt || prev?.completedAt || null,
        }));
        latestCompleteTrackingRef.current(normalizedStatus);
        return;
      }

      if (normalizedStatus === 'cancelled') {
        clearCurrentRide();
      } else {
        const latestState = latestStateRef.current;
        saveCurrentRide({
          ...latestState,
          rideId,
          driver: latestDriverRef.current,
          status: nextStatus,
          scheduledAt: payload.scheduledAt || latestState.scheduledAt || null,
          arrivedAt: payload.arrivedAt || latestState.arrivedAt || '',
          pricingSnapshot: payload.pricingSnapshot || latestState.pricingSnapshot || null,
          driverPaymentCollection: payload.driverPaymentCollection || latestState.driverPaymentCollection || null,
        });
      }

      setRideRealtime((prev) => ({
        ...(prev || {}),
        status: nextStatus,
        scheduledAt: payload.scheduledAt || prev?.scheduledAt || latestStateRef.current.scheduledAt || null,
        arrivedAt: payload.arrivedAt || prev?.arrivedAt || '',
        pricingSnapshot: payload.pricingSnapshot || prev?.pricingSnapshot || null,
        driverPaymentCollection: payload.driverPaymentCollection || prev?.driverPaymentCollection || null,
        completedAt: payload.completedAt || prev?.completedAt || null,
      }));
    };

    socketService.on('ride:state', onRideState);
    socketService.on('ride:driver-location:updated', onLocationUpdated);
    socketService.on('ride:status:updated', onStatusUpdated);
    socketService.emit('ride:join', { rideId });
    const onSocketConnect = () => {
      setSocketRealtimeHealthy(true);
      socketService.emit('ride:join', { rideId });
    };
    const onSocketDisconnect = () => setSocketRealtimeHealthy(false);
    const onSocketConnectError = () => setSocketRealtimeHealthy(false);
    socket.on('connect', onSocketConnect);
    socket.on('disconnect', onSocketDisconnect);
    socket.on('connect_error', onSocketConnectError);

    return () => {
      socketService.off('ride:state', onRideState);
      socketService.off('ride:driver-location:updated', onLocationUpdated);
      socketService.off('ride:status:updated', onStatusUpdated);
      socket.off('connect', onSocketConnect);
      socket.off('disconnect', onSocketDisconnect);
      socket.off('connect_error', onSocketConnectError);
    };
  }, [rideId]);

  useEffect(() => {
    if (!rideId || socketRealtimeHealthy) {
      return () => {};
    }

    return subscribeRideRealtime(
      rideId,
      (payload) => {
        if (!payload || String(payload.rideId || '') !== String(rideId)) {
          return;
        }

        const nextStatus = String(payload.liveStatus || payload.status || 'accepted').toLowerCase();
        const latestState = latestStateRef.current;
        const latestFallbackDriver = latestFallbackDriverRef.current;

        setRideRealtime((prev) => ({
          ...(prev || {}),
          pickup: payload.pickup || prev?.pickup || {
            coordinates: latestState.pickupCoords,
            address: latestState.pickup || 'Pickup',
          },
          drop: payload.drop || prev?.drop || {
            coordinates: latestState.dropCoords,
            address: latestState.drop || 'Drop',
          },
          driverLocation: payload.driverLocation || prev?.driverLocation || null,
          status: payload.liveStatus || payload.status || prev?.status || latestState.liveStatus || latestState.status || 'accepted',
          fare: payload.fare || prev?.fare || latestState.fare || 0,
          paymentMethod: payload.paymentMethod || prev?.paymentMethod || latestState.paymentMethod || 'Cash',
          vehicleIconType: payload.vehicleIconType || prev?.vehicleIconType || latestState.vehicleIconType || '',
          vehicleIconUrl: payload.vehicleIconUrl || prev?.vehicleIconUrl || latestState.vehicleIconUrl || '',
          scheduledAt: payload.scheduledAt || prev?.scheduledAt || latestState.scheduledAt || null,
          otp: payload.otp || prev?.otp || latestState.otp || latestState.ride_otp || '',
          acceptedAt: payload.acceptedAt || prev?.acceptedAt || latestState.acceptedAt || null,
          arrivedAt: payload.arrivedAt || prev?.arrivedAt || latestState.arrivedAt || '',
          startedAt: payload.startedAt || prev?.startedAt || latestState.startedAt || null,
          pricingSnapshot: payload.pricingSnapshot || prev?.pricingSnapshot || latestState.pricingSnapshot || null,
          driverPaymentCollection: payload.driverPaymentCollection || prev?.driverPaymentCollection || latestState.driverPaymentCollection || null,
          completedAt: payload.completedAt || prev?.completedAt || null,
          feedback: payload.feedback || prev?.feedback || null,
          driver: mergeDriverSnapshot(prev?.driver || latestFallbackDriver, payload.driver || {}),
        }));

        if (POST_RIDE_REDIRECT_STATUSES.has(nextStatus)) {
          latestCompleteTrackingRef.current(nextStatus);
        }
      },
      () => {},
    );
  }, [rideId, socketRealtimeHealthy]);

  useEffect(() => {
    if (isScheduledUpcoming && !hasLiveDriverLocation) {
      setRoutePath((current) => keepRouteIfSame(current, []));
      setRouteError('');
      lastResolvedRouteRef.current = {
        origin: null,
        destination: null,
        resolvedAt: 0,
      };
      return;
    }

    if (!isLoaded) {
      setRoutePath((current) => keepRouteIfSame(current, [driverPosition, activeDestination]));
      setRouteError('');
      return;
    }

    if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
      setRoutePath((current) => keepRouteIfSame(current, [driverPosition]));
      setRouteError('');
      return;
    }

    const trimmedRoutePath = trimRoutePathFromPosition(routePath, driverPosition);
    if (trimmedRoutePath) {
      const currentFirstPoint = routePath[0];
      const nextFirstPoint = trimmedRoutePath[0];
      const shouldUpdateRoutePath = routePath.length !== trimmedRoutePath.length ||
        !arePositionsNearlyEqual(currentFirstPoint, nextFirstPoint, 0.00001);

      if (shouldUpdateRoutePath) {
        setRoutePath(trimmedRoutePath);
      }
    }

    const now = Date.now();
    const lastResolvedRoute = lastResolvedRouteRef.current;
    const destinationChanged = !lastResolvedRoute.destination ||
      getDistanceMeters(lastResolvedRoute.destination, activeDestination) > ROUTE_DESTINATION_CHANGE_METERS;
    const movedEnough = !lastResolvedRoute.origin ||
      getDistanceMeters(lastResolvedRoute.origin, driverPosition) > ROUTE_REFRESH_MIN_DISTANCE_METERS;
    const staleEnough = now - Number(lastResolvedRoute.resolvedAt || 0) >= ROUTE_REFRESH_MIN_INTERVAL_MS;

    if (!destinationChanged && !(movedEnough && staleEnough)) {
      return;
    }

    const routeCacheKey = getRouteCacheKey(driverPosition, activeDestination);
    const cachedRoute = routeCacheRef.current.get(routeCacheKey);
    if (cachedRoute) {
      setRoutePath(cachedRoute.routePath);
      setRouteError(cachedRoute.routeError);
      lastResolvedRouteRef.current = {
        origin: driverPosition,
        destination: activeDestination,
        resolvedAt: now,
      };
      return;
    }

    let active = true;
    void (async () => {
      const result = await computeDrivingRoute({
        origin: driverPosition,
        destination: activeDestination,
      });

      if (!active) {
        return;
      }

      if (result.status === 'OK' && result.path.length) {
        rememberRouteCacheEntry(routeCacheRef.current, routeCacheKey, {
          routePath: result.path,
          routeError: '',
        });
        lastResolvedRouteRef.current = {
          origin: driverPosition,
          destination: activeDestination,
          resolvedAt: Date.now(),
        };
        setRoutePath(result.path);
        setRouteError('');
        return;
      }

      const fallbackRoute = [driverPosition, activeDestination];
      const nextRouteError = result.status || 'Directions unavailable';
      rememberRouteCacheEntry(routeCacheRef.current, routeCacheKey, {
        routePath: fallbackRoute,
        routeError: nextRouteError,
      });
      lastResolvedRouteRef.current = {
        origin: driverPosition,
        destination: activeDestination,
        resolvedAt: Date.now(),
      };
      setRoutePath(fallbackRoute);
      setRouteError(nextRouteError);
    })();

    return () => {
      active = false;
    };
  }, [activeDestination, driverPosition, hasLiveDriverLocation, isLoaded, isScheduledUpcoming, routePath]);

  useEffect(() => {
    if (!map) {
      return;
    }

    if (routePath.length > 1) {
      if (!hasAutoFramedMapRef.current) {
        map.fitToCoordinates([...routePath, driverPosition, activeDestination].map(toMapLatLng), {
          edgePadding: { top: 120, right: 48, bottom: 300, left: 48 },
          animated: true,
        });
        hasAutoFramedMapRef.current = true;
        lastMapPanPositionRef.current = driverPosition;
        return;
      }

      lastMapPanPositionRef.current = driverPosition;
      return;
    }

    if (!hasAutoFramedMapRef.current) {
      map.animateCamera({ center: toMapLatLng(driverPosition), zoom: 15 }, { duration: 400 });
      hasAutoFramedMapRef.current = true;
      lastMapPanPositionRef.current = driverPosition;
      return;
    }

    lastMapPanPositionRef.current = driverPosition;
  }, [activeDestination, driverPosition, map, routePath, tripStatus]);

  // One secret link per ride (made on the server the first time); it opens a public live map of this trip.
  const shareTrackUrlRef = useRef('');
  const [shareTrackUrl, setShareTrackUrl] = useState('');
  const getShareTrackUrl = async () => {
    if (shareTrackUrlRef.current) return shareTrackUrlRef.current;
    const shareRideId = rideId || getCurrentRide()?.rideId;
    if (!shareRideId) return '';
    try {
      const response = await api.post(`/rides/${shareRideId}/share`);
      const token = response?.data?.token || response?.token;
      if (!token) return '';
      const origin = /^https?:/i.test(window.location.origin) ? window.location.origin : 'https://helloparth.in';
      shareTrackUrlRef.current = `${origin}/taxi/track/${token}`;
      setShareTrackUrl(shareTrackUrlRef.current);
    } catch {
      shareTrackUrlRef.current = '';
    }
    return shareTrackUrlRef.current;
  };

  const handleShare = async () => {
    const trackUrl = await getShareTrackUrl();
    const text = buildRideShareText({
      appName,
      driverName: driver.name,
      vehicleNumber: driver.plate || driver.vehicleNumber,
      pickupLabel,
      dropLabel,
      trackUrl,
    });

    if (navigator.share) {
      try {
        await navigator.share({ title: `Track My Ride - ${appName}`, text });
        setShareSheetOpen(false);
        return;
      } catch (_error) {
        // Fall through to the explicit share options below.
      }
    }

    setShareSheetOpen(true);
  };

  const handleCopyShareText = async () => {
    const trackUrl = await getShareTrackUrl();
    const text = buildRideShareText({
      appName,
      driverName: driver.name,
      vehicleNumber: driver.plate || driver.vehicleNumber,
      pickupLabel,
      dropLabel,
      trackUrl,
    });

    navigator.clipboard?.writeText(text).then(() => {
      setShareToast(true);
      setShareSheetOpen(false);
      setTimeout(() => setShareToast(false), 2500);
    });
  };

  const handleCallDriver = () => {
    const phone = String(driver.phone || driver.mobile || driver.phoneNumber || '').replace(/[^\d+]/g, '');

    if (!phone) {
      Alert.alert('', 'Driver phone number is not available yet.');
      return;
    }

    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const openRideChat = () => {
    navigate(routeChat, {
      state: {
        rideId,
        peer: {
          name: driver.name || 'Driver',
          phone: driver.phone || driver.mobile || driver.phoneNumber || '',
          subtitle: 'Driver - Active now',
          role: 'Driver',
        },
      },
    });
  };


  useEffect(() => {
    Animated.spring(drawerY, {
      toValue: drawerOpen ? 0 : DRAWER_CLOSED_Y,
      useNativeDriver: true,
      damping: 26,
      stiffness: 220,
    }).start();
  }, [drawerOpen, drawerY]);

  const shareText = buildRideShareText({
    appName,
    driverName: driver.name,
    vehicleNumber: driver.plate || driver.vehicleNumber,
    pickupLabel,
    dropLabel,
    trackUrl: shareTrackUrl,
  });
  const shareLinks = buildShareLinks(shareText);
  const isDropLeg = ['started', 'ongoing', 'arrived', 'completed'].includes(tripStatus);
  const floatCard = { backgroundColor: p.card, borderColor: p.border };

  return (
    <Screen bg={p.card} edges={[]}>
      {/* Map (full screen behind the sheet) */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: p.soft }]}>
        <AppMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={regionFor(driverPosition, 14)}
          onMapReady={() => setMap(mapRef.current)}
          zoomControlEnabled
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {routePath.length > 1 && (
            <Polyline
              coordinates={routePath.map(toMapLatLng)}
              strokeColor={alpha('#111827', 0.9)}
              strokeWidth={5}
            />
          )}
          {driverPosition ? (
            <RotatingVehicleMarker
              position={driverPosition}
              title="Driver"
              iconUrl={vehicleIcon}
              heading={displayDriverHeading}
            />
          ) : null}
          <CircleLocationMarker
            position={activeDestination}
            title={isDropLeg ? 'Drop' : 'Pickup'}
            color={isDropLeg ? '#ef4444' : '#10b981'}
          />
        </AppMap>

        <Pressable
          onPress={() => navigate(routeHome)}
          style={({ pressed }) => [styles.mapBack, FLOAT_SHADOW, floatCard, { top: insets.top + 32 }, pressed && { transform: [{ scale: 0.9 }] }]}
        >
          <ChevronLeft size={18} color={p.text} strokeWidth={2.5} />
        </Pressable>

        <View style={[styles.routePill, FLOAT_SHADOW, floatCard, { top: insets.top + 32 }]}>
          <Text numberOfLines={1} style={[styles.routePillText, { color: p.muted }]}>{pickupLabel} → {dropLabel}</Text>
        </View>

        <Pressable
          onPress={() => navigate(routeSos)}
          style={({ pressed }) => [styles.safety, FLOAT_SHADOW, floatCard, { top: insets.top + 96 }, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Shield size={13} color={colors.blue[500]} strokeWidth={2.5} />
          <Text style={[styles.safetyText, { color: p.sec }]}>SAFETY</Text>
        </Pressable>

        {routeError ? (
          <View style={[styles.routeError, SH, { top: insets.top + 96, backgroundColor: p.card }]}>
            <Text style={[styles.routeErrorKicker, { color: p.sec }]}>ROUTE</Text>
            <Text style={[styles.routeErrorText, { color: p.sec }]}>Using fallback path while directions load.</Text>
          </View>
        ) : null}

        {isScheduledUpcoming ? (
          <View style={[styles.scheduledFloat, { top: insets.top + 132, backgroundColor: p.card }]}>
            <View style={styles.rowBetweenStart}>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={styles.greenKicker}>SCHEDULED RIDE</Text>
                <Text style={[styles.scheduledDate, { color: p.text }]}>{scheduledDateLabel}</Text>
                <Text style={[styles.smallMuted, { color: p.muted }]}>
                  {hasLiveDriverLocation
                    ? 'Your driver has started sharing location for this pickup.'
                    : 'Driver assigned. We will light up live movement here as pickup time gets closer.'}
                </Text>
              </View>
              <View style={[styles.countdownBox, { backgroundColor: p.soft }]}>
                <Text style={styles.greenKickerSm}>COUNTDOWN</Text>
                <Text style={[styles.countdownValue, { color: p.text }]}>{scheduledCountdown || 'Ready'}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* BOTTOM SHEET */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: p.card, paddingBottom: 24 + insets.bottom, transform: [{ translateY: drawerY }] },
        ]}
      >
        <Pressable onPress={() => setDrawerOpen(!drawerOpen)} hitSlop={12} style={styles.handleHit}>
          <View style={styles.handle} />
        </Pressable>

        <View style={styles.sheetBody}>
          {/* Header Section: Driver & OTP */}
          <View style={styles.rowBetweenStart}>
            <View style={{ flexDirection: 'row', gap: 12, minWidth: 0, flex: 1 }}>
              <View>
                <View style={styles.driverPhoto}>
                  {driverImage ? (
                    <AppImage
                      src={driverImage}
                      accessibilityLabel={driver.name || 'Driver'}
                      style={{ width: '100%', height: '100%', opacity: 0.9 }}
                      onError={() => setDriverImageBroken(true)}
                    />
                  ) : (
                    <View style={styles.centerFill}>
                      <Text style={styles.driverInitials}>{getInitials(driver.name)}</Text>
                    </View>
                  )}
                </View>
                {/* Car Badge */}
                <View style={[styles.carBadge, SH, { borderColor: p.border }]}>
                  <AppImage src={vehicleIcon} fallback={carIcon} accessibilityLabel="Vehicle icon" contentFit="contain" tintColor="#ffffff" style={{ width: 14, height: 14 }} />
                </View>
                {/* Rating Badge */}
                <View style={[styles.ratingBadge, SH, { borderColor: p.border }]}>
                  <Star size={9} color={INK} fill={colors.slate[900]} />
                  <Text style={styles.ratingBadgeText}>{driver.rating || 'New'}</Text>
                </View>
              </View>

              <View style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
                <Text numberOfLines={1} style={[styles.driverName, { color: p.text }]}>
                  {driver.name || 'James Bond'}
                </Text>
                <Text style={styles.driverStatus}>
                  {tripStatus === 'arrived' ? 'Reached destination' : tripStatus === 'started' || tripStatus === 'ongoing' ? 'Trip started' : driverSubtitle}
                </Text>
                <Text numberOfLines={1} style={[styles.plate, { color: p.sec }]}>
                  {`${driver.plate || 'MH12AB1234'} · ${vehicleLabel}`.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* OTP CARD - High Fidelity */}
            {otp ? (
              <View style={[styles.otpCard, SH, { backgroundColor: p.card, borderColor: p.border }]}>
                <Text style={styles.otpLabel}>OTP</Text>
                <Text style={[styles.otpValue, { color: p.text }]}>{otp}</Text>
              </View>
            ) : null}
          </View>

          {isScheduledRide ? (
            <View style={[styles.tripPlan, SH, { backgroundColor: p.soft }]}>
              <View style={styles.rowBetween}>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={styles.greenKickerSm}>TRIP PLAN</Text>
                  <Text style={[styles.scheduledDate, { color: p.text }]}>{scheduledDateLabel}</Text>
                  <Text style={[styles.smallMuted, { color: p.muted }]}>
                    {isScheduledUpcoming
                      ? 'We will switch from booking mode to live pickup tracking automatically as your slot approaches.'
                      : 'Your scheduled ride is now in its live service window.'}
                  </Text>
                </View>
                <View style={[styles.statusBox, SH, { backgroundColor: p.card }]}>
                  <Text style={[styles.kickerSm, { color: p.sec }]}>STATUS</Text>
                  <Text style={[styles.countdownValue, { color: p.text }]}>{isScheduledUpcoming ? scheduledCountdown || 'Ready' : 'Live now'}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {isWaitingForOtp && (
            <View style={[styles.waiting, SH]}>
              <View style={styles.rowBetween}>
                <View style={[styles.row, { gap: 12 }]}>
                  <View style={[styles.clockIcon, SH, { backgroundColor: p.card }]}>
                    <Clock3 size={18} strokeWidth={2.5} color={ACCENT} />
                  </View>
                  <View>
                    <Text style={styles.amberKicker}>WAITING CLOCK</Text>
                    <Text style={[styles.clock, { color: p.text }]}>{formatTimerClock(waitingElapsedSeconds)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.kickerSm, { color: p.sec }]}>FREE LEFT</Text>
                  <Text style={[styles.countdownValue, { color: p.text }]}>{formatTimerClock(freeWaitingRemainingSeconds)}</Text>
                </View>
              </View>
              <View style={styles.waitGrid}>
                <View style={[styles.waitBox, SH, { backgroundColor: p.card }]}>
                  <Text style={[styles.kickerSm, { color: p.sec }]}>FREE BEFORE RIDE</Text>
                  <Text style={[styles.countdownValue, { color: p.text }]}>{formatWholeMinutes(freeWaitingBeforeMinutes)}</Text>
                </View>
                <View style={[styles.waitBox, SH, { backgroundColor: p.card }]}>
                  <Text style={[styles.kickerSm, { color: p.sec }]}>WAITING CHARGE</Text>
                  <Text style={[styles.countdownValue, { color: p.text }]}>
                    Rs {waitingChargePerMinute}/min
                    {waitingChargeableMinutes > 0 ? ` • ${waitingChargeableMinutes} billable` : ''}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Detailed Vehicle Status Card - High Fidelity */}
          <View style={styles.vehicleCard}>
            <View style={[styles.vehiclePhoto, SH, { backgroundColor: p.card }]}>
              {hasVehiclePhoto ? (
                <AppImage
                  src={vehicleImage}
                  accessibilityLabel={vehicleLabel}
                  contentFit="contain"
                  style={{ width: '100%', height: '100%' }}
                  onError={() => setVehicleImageBroken(true)}
                />
              ) : (
                <AppImage src={vehicleIcon} fallback={carIcon} accessibilityLabel={vehicleLabel} contentFit="contain" style={{ width: 24, height: 24, opacity: 0.6 }} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kickerSm, { color: p.sec, marginBottom: 2 }]}>VEHICLE</Text>
              <Text numberOfLines={1} style={[styles.vehicleLabel, { color: p.text }]}>{vehicleLabel}</Text>
              <Text numberOfLines={1} style={[styles.vehicleDetails, { color: p.muted }]}>{vehicleDetails || 'Blue'}</Text>
            </View>
          </View>

          {/* High-Fidelity Action Grid */}
          <View style={styles.actions}>
            {[
              { id: 'call', icon: Phone, label: 'CALL', action: handleCallDriver },
              { id: 'chat', icon: MessageCircle, label: 'CHAT', action: openRideChat },
              { id: 'share', icon: Share2, label: 'SHARE', action: handleShare },
              { id: 'help', icon: AlertTriangle, label: 'HELP', action: () => navigate(routeSupport) },
            ].map((btn) => (
              <Pressable
                key={btn.id}
                onPress={btn.action}
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: p.card }, pressed && { transform: [{ scale: 0.94 }] }]}
              >
                <View style={{ padding: 2 }}>
                  <btn.icon size={18} color={p.text} strokeWidth={2} />
                  {btn.id === 'chat' ? <ChatUnreadBadge count={chatUnread} style={{ right: -14, top: -10 }} /> : null}
                </View>
                <Text style={[styles.actionLabel, { color: p.muted }]}>{btn.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Footer: Fare & Cancellation Section */}
          <View style={styles.footer}>
            <View>
              <Text style={[styles.kickerSm, { color: p.sec, marginBottom: 4 }]}>TOTAL FARE</Text>
              <View style={[styles.row, { gap: 8 }]}>
                <Text style={[styles.fare, { color: p.text }]}>Rs {fare}.00</Text>
                <View style={[styles.methodPill, SH, { backgroundColor: p.soft }]}>
                  <Text style={[styles.methodText, { color: p.sec }]}>{String(paymentMethod).toUpperCase()}</Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={() => setShowCancelConfirm(true)}
              style={({ pressed }) => [styles.cancelBtn, !pressed && styles.cancelShadow, { backgroundColor: p.card }, pressed && { transform: [{ scale: 0.96 }] }]}
            >
              <Text style={styles.cancelText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* Toast */}
      <ToastIn visible={shareToast} style={[styles.toast, SH, { top: insets.top + 16, backgroundColor: p.card }]}>
        <Text style={[styles.toastText, { color: p.text }]}>Ride details copied!</Text>
      </ToastIn>

      {/* Share sheet */}
      <ShareSheetModal open={shareSheetOpen} onClose={() => setShareSheetOpen(false)} cardStyle={[styles.shareCard, SH, { backgroundColor: p.card, marginBottom: 20 + insets.bottom }]}>
        <Text style={[styles.shareKicker, { color: p.sec }]}>SHARE RIDE</Text>
        <Text style={[styles.shareTitle, { color: p.text }]}>Send trip details</Text>
        <Text style={[styles.shareSub, { color: p.muted }]}>Choose how you want to share this ongoing ride.</Text>

        <View style={styles.shareGrid}>
          {navigator.share ? (
            <Pressable onPress={handleShare} style={[styles.shareOption, floatCard]}>
              <Text style={[styles.shareOptionTitle, { color: p.text }]}>System share</Text>
              <Text style={[styles.shareOptionSub, { color: p.muted }]}>Open phone share apps</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => Linking.openURL(shareLinks.whatsapp).catch(() => {})} style={[styles.shareOption, floatCard]}>
            <Text style={[styles.shareOptionTitle, { color: p.text }]}>WhatsApp</Text>
            <Text style={[styles.shareOptionSub, { color: p.muted }]}>Share in chat</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(shareLinks.sms).catch(() => {})} style={[styles.shareOption, floatCard]}>
            <Text style={[styles.shareOptionTitle, { color: p.text }]}>SMS</Text>
            <Text style={[styles.shareOptionSub, { color: p.muted }]}>Open messages</Text>
          </Pressable>
          <Pressable onPress={handleCopyShareText} style={[styles.shareOption, floatCard]}>
            <Text style={[styles.shareOptionTitle, { color: p.text }]}>Copy details</Text>
            <Text style={[styles.shareOptionSub, { color: p.muted }]}>Copy to clipboard</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => setShareSheetOpen(false)} style={styles.shareClose}>
          <Text style={styles.shareCloseText}>CLOSE</Text>
        </Pressable>
      </ShareSheetModal>

      {/* Cancel confirm */}
      <Dialog open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} style={[styles.dialog, SH, { backgroundColor: p.card }]}>
        <View style={[styles.dialogIcon, { backgroundColor: p.soft }]}>
          <AlertTriangle size={26} color={colors.red[400]} strokeWidth={2} />
        </View>
        <Text style={[styles.dialogTitle, { color: p.text }]}>Cancel your ride?</Text>
        <Text style={[styles.dialogText, { color: p.sec }]}>Your captain is already on the way.</Text>
        <CancellationFeeNotice rideId={rideId} />
        <View style={{ gap: 10 }}>
          <Pressable onPress={handleCancelRide} style={({ pressed }) => [styles.yesBtn, pressed && { transform: [{ scale: 0.97 }] }]}>
            <Text style={styles.yesText}>YES, CANCEL</Text>
          </Pressable>
          <Pressable onPress={() => setShowCancelConfirm(false)} style={styles.noBtn}>
            <Text style={[styles.noText, { color: p.sec }]}>NO, GO BACK</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
};

// AnimatePresence toast: fades in from y -16
const ToastIn = ({ visible, style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(v, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, v]);
  if (!mounted) return null;
  return (
    <Animated.View pointerEvents="none" style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
};

// fixed inset-0 backdrop (slate-950/45) with a card at the bottom that slides up 48 px
const ShareSheetModal = ({ open, onClose, cardStyle, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(v, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, v]);
  if (!mounted) return null;
  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.shareBackdrop, { opacity: v }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[cardStyle, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }] }]}>
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowBetweenStart: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapBack: { position: 'absolute', left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  routePill: { position: 'absolute', left: 64, right: 16, zIndex: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  routePillText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  safety: { position: 'absolute', right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 1 },
  safetyText: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  routeError: { position: 'absolute', left: 16, zIndex: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.amber[100], paddingHorizontal: 12, paddingVertical: 8 },
  routeErrorKicker: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1 },
  routeErrorText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  scheduledFloat: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.emerald[100],
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 5,
    shadowColor: '#10b981',
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  greenKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2, color: colors.emerald[700] },
  greenKickerSm: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 1.9, color: colors.emerald[700] },
  scheduledDate: { marginTop: 4, fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.4 },
  smallMuted: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  countdownBox: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
  countdownValue: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  kickerSm: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 1.9 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: alpha(colors.slate[100], 0.5),
    elevation: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 44,
    shadowOffset: { width: 0, height: -12 },
  },
  handleHit: { alignSelf: 'center', paddingTop: 10, paddingBottom: 14 },
  handle: { width: 48, height: 6, borderRadius: 9999, backgroundColor: alpha(colors.slate[200], 0.6) },
  sheetBody: { paddingHorizontal: 16, gap: 14 },
  driverPhoto: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: '#1d2333',
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  driverInitials: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  carBadge: { position: 'absolute', top: -4, right: -4, width: 24, height: 24, borderRadius: 8, backgroundColor: '#111827', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ratingBadge: { position: 'absolute', bottom: -4, right: -4, backgroundColor: ACCENT, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingBadgeText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', color: INK },
  driverName: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.4 },
  driverStatus: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: '#f97316', marginTop: 4, letterSpacing: -0.3 },
  plate: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 2, letterSpacing: 1.5 },
  otpCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 80 },
  otpLabel: { fontSize: 10.5, lineHeight: 11, fontWeight: '700', letterSpacing: 1.9, color: ACCENT, marginBottom: 4 },
  otpValue: { fontSize: 18, lineHeight: 20, fontWeight: '700', letterSpacing: -0.9 },
  tripPlan: { borderRadius: 22, borderWidth: 1, borderColor: colors.emerald[100], paddingHorizontal: 16, paddingVertical: 16 },
  statusBox: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
  waiting: { borderRadius: 24, borderWidth: 1, borderColor: colors.amber[100], backgroundColor: alpha(colors.amber[50], 0.7), paddingHorizontal: 16, paddingVertical: 16 },
  clockIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  amberKicker: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 2.3, color: colors.amber[600] },
  clock: { marginTop: 4, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.55 },
  waitGrid: { marginTop: 16, flexDirection: 'row', gap: 12 },
  waitBox: { flex: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    backgroundColor: alpha(colors.slate[50], 0.4),
    borderWidth: 1,
    borderColor: alpha(colors.slate[50], 0.8),
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  vehiclePhoto: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: alpha(colors.slate[100], 0.5), overflow: 'hidden', padding: 8, alignItems: 'center', justifyContent: 'center' },
  vehicleLabel: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
  vehicleDetails: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: alpha(colors.slate[100], 0.6),
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  actionLabel: { fontSize: 10.5, lineHeight: 11, fontWeight: '700', letterSpacing: 1 },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.slate[50] },
  fare: { fontSize: 19, lineHeight: 21, fontWeight: '700', letterSpacing: -0.5 },
  methodPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: alpha(colors.slate[200], 0.5) },
  methodText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  cancelBtn: { borderWidth: 2, borderColor: colors.slate[50], paddingHorizontal: 20, paddingVertical: 12, borderRadius: 18 },
  cancelShadow: { elevation: 4, shadowColor: '#ef4444', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  cancelText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.8, color: colors.red[500] },
  toast: { position: 'absolute', alignSelf: 'center', zIndex: 200, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  toastText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  shareBackdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(2,6,23,0.45)', paddingHorizontal: 16, paddingTop: 48 },
  shareCard: { width: '100%', maxWidth: 448, borderRadius: 28, padding: 20 },
  shareKicker: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 2.4 },
  shareTitle: { marginTop: 8, fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  shareSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  shareGrid: { marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shareOption: { width: '47.5%', flexGrow: 1, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 },
  shareOptionTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  shareOptionSub: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  shareClose: { marginTop: 16, height: 48, width: '100%', borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  shareCloseText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.9, color: INK },
  dialog: { width: '82%', maxWidth: 384, borderRadius: 28, padding: 28 },
  dialogIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  dialogTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  dialogText: { fontSize: 13, lineHeight: 21, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  yesBtn: { width: '100%', backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  yesText: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 1.3, color: INK },
  noBtn: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  noText: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 1.3 },
});

export default RideTracking;
