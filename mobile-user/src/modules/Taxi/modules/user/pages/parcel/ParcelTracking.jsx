import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Phone,
  MessageCircle,
  AlertTriangle,
  Star,
  ChevronLeft,
  Share2,
  Package,
  CheckCircle2,
  Receipt,
  Clock,
  ShieldCheck,
  ChevronRight
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Dialog, Screen, Skeleton, Text, TextInput } from '@/native/ui';
import { AppMap, Marker, Polyline, regionFor, toLatLng as toMapCoordinate } from '@/native/ui/AppMap';
import { makeStyles, useTheme } from '@/theme';
import { socketService } from '../../../../shared/api/socket';
import api from '../../../../shared/api/axiosInstance';
import CancellationFeeNotice, { announceCancellationFee } from '../../components/CancellationFeeNotice';
import { BACKEND_ORIGIN } from '../../../../shared/api/runtimeConfig';
import { subscribeRideRealtime } from '../../../../shared/services/rideRealtime';
import { computeDrivingRoute } from '../../../../shared/utils/googleRoutes';
import { clearCurrentRide, getCurrentRide, saveCurrentRide } from '../../services/currentRideService';

// Assets (Using the same icons as RideTracking)
import carIcon from '../../../../assets/icons/car.png';
import bikeIcon from '../../../../assets/icons/bike.png';
import autoIcon from '../../../../assets/icons/auto.png';
import deliveryIcon from '../../../../assets/icons/Delivery.png';
import useRideChatUnread from '../../../shared/chat/useRideChatUnread';
import ChatUnreadBadge from '../../../shared/components/ChatUnreadBadge';

// Taxi/index.css `.user-app-theme` palette (the web remaps slate / white / gray classes to these in both themes).
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

const MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'delivered']);
const ACTIVE_RIDE_VALIDATE_MS = 4000;
const COMPLETED_TRACKING_STATUSES = new Set(['completed', 'delivered']);
const TIP_OPTIONS = [0, 20, 50, 100];
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
  if (!Number.isFinite(numeric)) return fallback;
  return ((numeric % 360) + 360) % 360;
};

const calculateBearing = (from, to, fallback = 0) => {
  if (!from || !to || arePositionsNearlyEqual(from, to, 0.00001)) return fallback;
  const fromLat = Number(from.lat) * (Math.PI / 180);
  const toLat = Number(to.lat) * (Math.PI / 180);
  const deltaLng = (Number(to.lng) - Number(from.lng)) * (Math.PI / 180);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return normalizeHeading(Math.atan2(y, x) * (180 / Math.PI), fallback);
};

const getRouteHeading = (position, path = [], fallback = 0) => {
  const nextPoint = path.find((point) => !arePositionsNearlyEqual(position, point, 0.00001));
  return nextPoint ? calculateBearing(position, nextPoint, fallback) : fallback;
};

// Marker views are drawn into a bitmap: keep redrawing for a moment after the icon changes so a remote image can paint.
const useMarkerTracking = (key) => {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 2000);
    return () => clearTimeout(id);
  }, [key]);
  return tracks;
};

const RotatingVehicleMarker = ({ position, iconUrl = deliveryIcon, heading = 0, title = 'Delivery Captain' }) => {
  const tracksViewChanges = useMarkerTracking(String(iconUrl));
  return (
    <Marker
      coordinate={toMapCoordinate(position)}
      title={title}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={normalizeHeading(heading)}
      tracksViewChanges={tracksViewChanges}
    >
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
        <AppImage src={iconUrl || deliveryIcon} fallback={deliveryIcon} style={{ width: 48, height: 48 }} contentFit="contain" transition={0} />
      </View>
    </Marker>
  );
};

const CircleLocationMarker = ({ position, color = '#ef4444', size = 14, title = 'Destination' }) => {
  const tracksViewChanges = useMarkerTracking(color);
  return (
    <Marker coordinate={toMapCoordinate(position)} title={title} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracksViewChanges}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#ffffff', backgroundColor: color }} />
    </Marker>
  );
};

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
  const iconType = String(ride?.vehicleIconType || driver?.vehicleIconType || driver?.vehicleType || '').toLowerCase();
  if (iconType.includes('bike')) return bikeIcon;
  if (iconType.includes('auto')) return autoIcon;
  if (iconType.includes('car')) return carIcon;
  return deliveryIcon;
};

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;

const resolveAssetUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(raw)) return raw;
  // Root-level files like `/4_Taxi.png` are served from the frontend's public/ folder.
  if (/^\/[^/]+\.(png|jpe?g|svg|webp|gif)$/i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${BACKEND_ORIGIN}${raw}`;
  return `${BACKEND_ORIGIN}/${raw.replace(/^\/+/, '')}`;
};

const mergeDriverSnapshot = (baseDriver = {}, incomingDriver = {}) => ({
  ...baseDriver,
  ...incomingDriver,
  profileImage: incomingDriver.profileImage || baseDriver.profileImage || '',
  vehicleImage: incomingDriver.vehicleImage || baseDriver.vehicleImage || '',
  name: incomingDriver.name || baseDriver.name || 'Delivery Captain',
  phone: incomingDriver.phone || baseDriver.phone || '',
  rating: incomingDriver.rating || baseDriver.rating || '',
  plate: incomingDriver.plate || baseDriver.plate || incomingDriver.vehicleNumber || baseDriver.vehicleNumber || 'Assigned',
});

const getInitials = (name = '') =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'DC';
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

function Enter({ from, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, damping: 22, stiffness: 160, useNativeDriver: true }).start();
  }, [v]);
  const transform = [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from.y || 0, 0] }) }];
  return <Animated.View style={[style, { opacity: from.fade ? v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) : 1, transform }]}>{children}</Animated.View>;
}

const Tap = ({ scale = 0.95, style, children, ...rest }) => (
  <Pressable {...rest} style={({ pressed }) => [style, pressed && { transform: [{ scale }] }]}>
    {children}
  </Pressable>
);

const ParcelTracking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const userHomeRoute = routePrefix || '/taxi/user';
  const storedRide = useMemo(() => getCurrentRide(), []);
  const state = useMemo(() => location.state || storedRide || {}, [location.state, storedRide]);
  const [rideRealtime, setRideRealtime] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [map, setMap] = useState(null);
  const mapRef = useRef(null);
  const [socketRealtimeHealthy, setSocketRealtimeHealthy] = useState(() => socketService.isConnected());
  const [rating, setRating] = useState(() => Number(state.feedback?.rating || 0));
  const [comment, setComment] = useState(() => state.feedback?.comment || '');
  const [selectedTip, setSelectedTip] = useState(() => Number(state.feedback?.tipAmount || 0));
  // Set once the sender touches rating / tip / note so live ride updates do not reset their choice.
  const feedbackEditedRef = useRef(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(Boolean(state.feedback?.submittedAt));
  const [feedbackError, setFeedbackError] = useState('');
  const [tipSettings, setTipSettings] = useState({
    enable_tips: '1',
    min_tip_amount: '10',
  });
  // No script to load natively: the map is always available.
  const isLoaded = true;
  const latestStateRef = useRef(state);
  const latestDriverRef = useRef(state.driver || {});
  const latestRideRealtimeRef = useRef(null);
  const hydrateRideStateRef = useRef(async () => {});
  const hasAutoFramedMapRef = useRef(false);
  const hasCompletedRedirectRef = useRef(false);
  const routeCacheRef = useRef(new Map());
  const lastResolvedRouteRef = useRef({
    origin: null,
    destination: null,
    resolvedAt: 0,
  });

  const rideId = state.rideId || '';
  const chatUnread = useRideChatUnread(rideId, 'user');
  const tripStatus = String(rideRealtime?.status || state.liveStatus || state.status || 'accepted').toLowerCase();

  const pickupPosition = useMemo(() => toLatLng(rideRealtime?.pickup?.coordinates || state.pickupCoords || [75.9048, 22.7039]), [rideRealtime?.pickup?.coordinates, state.pickupCoords]);
  const dropPosition = useMemo(() => toLatLng(rideRealtime?.drop?.coordinates || state.dropCoords || [75.8937, 22.7533], pickupPosition), [pickupPosition, rideRealtime?.drop?.coordinates, state.dropCoords]);
  const driverPosition = useMemo(() => toLatLng(rideRealtime?.driverLocation?.coordinates, pickupPosition), [pickupPosition, rideRealtime?.driverLocation?.coordinates]);
  const activeDestination = useMemo(
    () => (['started', 'ongoing', 'arrived', 'completed', 'delivered'].includes(tripStatus) ? dropPosition : pickupPosition),
    [dropPosition, pickupPosition, tripStatus],
  );

  const driver = useMemo(() => mergeDriverSnapshot(state.driver || {}, rideRealtime?.driver || {}), [state.driver, rideRealtime?.driver]);
  const vehicleIcon = getTrackingVehicleIcon(state, driver);
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
  const fare = rideRealtime?.fare || state.fare || 0;
  const otp = String(rideRealtime?.otp || state.otp || '');
  const completedAt = rideRealtime?.completedAt || state.completedAt || Date.now();
  const isDeliveryCompleted = COMPLETED_TRACKING_STATUSES.has(tripStatus);
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);
  const availableTipOptions = useMemo(
    () =>
      [...new Set([0, minimumTipAmount, ...TIP_OPTIONS].filter((amount) => Number.isFinite(amount) && amount >= 0))]
        .sort((left, right) => left - right),
    [minimumTipAmount],
  );
  const totalBill = Number(fare || 0) + Number(selectedTip || 0);
  const completedDateLabel = new Date(completedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const completedTimeLabel = new Date(completedAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  useEffect(() => {
    hasCompletedRedirectRef.current = false;
  }, [rideId]);

  useEffect(() => {
    const fetchTipSettings = async () => {
      try {
        const response = await api.get('/rides/app-settings/tip');
        const nextSettings = response?.data?.settings || response?.settings || {};
        setTipSettings((current) => ({
          ...current,
          ...nextSettings,
        }));
      } catch {
        // keep defaults for parcel feedback
      }
    };

    fetchTipSettings();
  }, []);

  useEffect(() => {
    const feedback = rideRealtime?.feedback || state.feedback || null;
    if (!feedback) {
      return;
    }

    if (feedback.submittedAt || !feedbackEditedRef.current) {
      setRating(Number(feedback.rating || 0));
      setComment(feedback.comment || '');
      setSelectedTip(Number(feedback.tipAmount || 0));
    }
    setIsFeedbackSubmitted(Boolean(feedback.submittedAt));
  }, [rideRealtime?.feedback, state.feedback]);

  useEffect(() => {
    let active = true;

    if (!rideId) {
      return () => {
        active = false;
      };
    }

    const hydrateRideState = async () => {
      try {
        const payload = unwrapApiPayload(await api.get(`/rides/${rideId}`));

        if (!active || !payload) {
          return;
        }

        const mergedDriver = mergeDriverSnapshot(latestStateRef.current.driver || {}, payload?.driver || {});
        const nextRealtime = {
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
            : latestRideRealtimeRef.current?.driverLocation || null,
          status: payload?.liveStatus || payload?.status || 'accepted',
          fare: payload?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          vehicleIconType: payload?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
          vehicleIconUrl: payload?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
          otp: payload?.otp || latestStateRef.current.otp || '',
          completedAt: payload?.completedAt || latestStateRef.current.completedAt || null,
          feedback: payload?.feedback || latestStateRef.current.feedback || null,
          driver: mergedDriver,
        };

        const nextStatus = String(nextRealtime.status || '').toLowerCase();
        if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
          setRideRealtime(nextRealtime);
          saveCurrentRide({
            ...latestStateRef.current,
            ...payload,
            rideId,
            driver: mergedDriver,
            fare: payload?.fare || latestStateRef.current.fare || 0,
            paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
            status: nextStatus,
            liveStatus: nextStatus,
            completedAt: payload?.completedAt || latestStateRef.current.completedAt || Date.now(),
            feedback: payload?.feedback || latestStateRef.current.feedback || null,
          });
          return;
        }

        if (TERMINAL_STATUSES.has(nextStatus)) {
          clearCurrentRide();
          navigate(userHomeRoute, { replace: true });
          return;
        }

        setRideRealtime(nextRealtime);
        saveCurrentRide({
          ...latestStateRef.current,
          rideId,
          driver: mergedDriver,
          status: payload?.status || latestStateRef.current.status || 'accepted',
          liveStatus: payload?.liveStatus || payload?.status || latestStateRef.current.liveStatus || 'accepted',
        });
      } catch {
        // socket updates continue to drive the UI
      }
    };

    hydrateRideStateRef.current = hydrateRideState;
    hydrateRideState();
    const intervalId = setInterval(hydrateRideState, ACTIVE_RIDE_VALIDATE_MS);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    latestDriverRef.current = driver;
  }, [driver]);

  useEffect(() => {
    latestRideRealtimeRef.current = rideRealtime;
  }, [rideRealtime]);

  useEffect(() => {
    if (!rideId) {
      return undefined;
    }

    const refreshTrackingState = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return;
      }

      socketService.connect({ role: 'user' });
      socketService.emit('ride:join', { rideId });

      const hydrate = hydrateRideStateRef.current;
      if (typeof hydrate === 'function') {
        Promise.resolve(hydrate()).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', refreshTrackingState);
    window.addEventListener('focus', refreshTrackingState);

    return () => {
      document.removeEventListener('visibilitychange', refreshTrackingState);
      window.removeEventListener('focus', refreshTrackingState);
    };
  }, [rideId]);

  useEffect(() => {
    hasAutoFramedMapRef.current = false;
  }, [rideId, tripStatus, activeDestination.lat, activeDestination.lng]);

  useEffect(() => {
    if (!tipsEnabled && selectedTip !== 0) {
      setSelectedTip(0);
      return;
    }

    if (tipsEnabled && minimumTipAmount > 0 && selectedTip > 0 && selectedTip < minimumTipAmount) {
      setSelectedTip(minimumTipAmount);
    }
  }, [minimumTipAmount, selectedTip, tipsEnabled]);

  // Socket & Polling
  useEffect(() => {
    if (!rideId) return;
    const socket = socketService.connect({ role: 'user' });
    if (!socket) {
      setSocketRealtimeHealthy(false);
      return;
    }

    const onRideState = (payload) => {
      if (String(payload?.rideId) !== String(rideId)) {
        return;
      }

      const nextStatus = String(payload?.liveStatus || payload?.status || '').toLowerCase();
      if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
        const mergedDriver = mergeDriverSnapshot(latestDriverRef.current, payload?.driver || {});
        setRideRealtime((prev) => ({
          ...(prev || {}),
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
            : prev?.driverLocation || latestRideRealtimeRef.current?.driverLocation || null,
          status: nextStatus,
          fare: payload?.fare || prev?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload?.paymentMethod || prev?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          vehicleIconType: payload?.vehicleIconType || prev?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
          vehicleIconUrl: payload?.vehicleIconUrl || prev?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
          otp: payload?.otp || prev?.otp || latestStateRef.current.otp || '',
          completedAt: payload?.completedAt || prev?.completedAt || Date.now(),
          feedback: payload?.feedback || prev?.feedback || null,
          driver: mergedDriver,
        }));
        saveCurrentRide({
          ...latestStateRef.current,
          ...payload,
          rideId,
          driver: mergedDriver,
          fare: payload?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          status: nextStatus,
          liveStatus: nextStatus,
          completedAt: payload?.completedAt || Date.now(),
          feedback: payload?.feedback || null,
        });
        return;
      }

      if (TERMINAL_STATUSES.has(nextStatus)) {
        clearCurrentRide();
        navigate(userHomeRoute, { replace: true });
        return;
      }

      const mergedDriver = mergeDriverSnapshot(latestDriverRef.current, payload?.driver || {});
      setRideRealtime((prev) => ({
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
          : prev?.driverLocation || null,
        status: payload?.liveStatus || payload?.status || prev?.status || 'accepted',
        fare: payload?.fare || prev?.fare || latestStateRef.current.fare || 0,
        paymentMethod: payload?.paymentMethod || prev?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
        vehicleIconType: payload?.vehicleIconType || prev?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
        vehicleIconUrl: payload?.vehicleIconUrl || prev?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
        otp: payload?.otp || prev?.otp || latestStateRef.current.otp || '',
        completedAt: payload?.completedAt || prev?.completedAt || null,
        feedback: payload?.feedback || prev?.feedback || null,
        driver: mergedDriver,
      }));
    };
    const onLocationUpdated = (payload) => {
      if (String(payload.rideId) === String(rideId)) {
        setRideRealtime(prev => ({
          ...prev,
          driverLocation: {
            coordinates: payload.coordinates,
            heading: payload.heading ?? prev?.driverLocation?.heading ?? null,
          }
        }));
      }
    };
    const onStatusUpdated = (payload) => {
      if (String(payload.rideId) === String(rideId)) {
        const nextStatus = String(payload.liveStatus || payload.status).toLowerCase();
        if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
          setRideRealtime((prev) => ({
            ...(prev || {}),
            status: nextStatus,
            completedAt: payload?.completedAt || prev?.completedAt || Date.now(),
            feedback: payload?.feedback || prev?.feedback || null,
          }));
          saveCurrentRide({
            ...latestStateRef.current,
            ...payload,
            rideId,
            driver: latestDriverRef.current,
            status: nextStatus,
            liveStatus: nextStatus,
            completedAt: payload?.completedAt || Date.now(),
            feedback: payload?.feedback || null,
          });
          return;
        }
        if (TERMINAL_STATUSES.has(nextStatus)) {
          clearCurrentRide();
          navigate(userHomeRoute, { replace: true });
          return;
        }
        setRideRealtime(prev => ({ ...prev, status: nextStatus }));
      }
    };

    socketService.on('ride:state', onRideState);
    socketService.on('ride:driver-location:updated', onLocationUpdated);
    socketService.on('ride:status:updated', onStatusUpdated);
    socketService.emit('ride:join', { rideId });
    setSocketRealtimeHealthy(socket.connected);
    const onSocketConnect = () => setSocketRealtimeHealthy(true);
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
  }, [rideId, navigate, routePrefix, userHomeRoute]);

  useEffect(() => {
    if (!TERMINAL_STATUSES.has(tripStatus)) {
      return;
    }

    if (COMPLETED_TRACKING_STATUSES.has(tripStatus)) {
      return;
    }

    clearCurrentRide();
    navigate(userHomeRoute, { replace: true });
  }, [navigate, tripStatus, userHomeRoute]);

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
        const mergedDriver = mergeDriverSnapshot(latestDriverRef.current, payload.driver || {});

        setRideRealtime((prev) => ({
          ...(prev || {}),
          pickup: payload.pickup || prev?.pickup || {
            coordinates: latestStateRef.current.pickupCoords,
            address: latestStateRef.current.pickup || 'Pickup',
          },
          drop: payload.drop || prev?.drop || {
            coordinates: latestStateRef.current.dropCoords,
            address: latestStateRef.current.drop || 'Drop',
          },
          driverLocation: payload.driverLocation || prev?.driverLocation || latestRideRealtimeRef.current?.driverLocation || null,
          status: payload.liveStatus || payload.status || prev?.status || 'accepted',
          fare: payload.fare || prev?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload.paymentMethod || prev?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          vehicleIconType: payload.vehicleIconType || prev?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
          vehicleIconUrl: payload.vehicleIconUrl || prev?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
          otp: payload.otp || prev?.otp || latestStateRef.current.otp || '',
          completedAt: payload.completedAt || prev?.completedAt || null,
          feedback: payload.feedback || prev?.feedback || null,
          driver: mergedDriver,
        }));

        if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
          saveCurrentRide({
            ...latestStateRef.current,
            ...payload,
            rideId,
            driver: mergedDriver,
            status: nextStatus,
            liveStatus: nextStatus,
            completedAt: payload.completedAt || Date.now(),
            feedback: payload.feedback || null,
          });
        }
      },
      () => {},
    );
  }, [rideId, socketRealtimeHealthy]);

  // Route Path Update
  useEffect(() => {
    // web: `!isLoaded || !window.google?.maps?.importLibrary` — natively the Routes API is called over HTTPS
    if (!isLoaded) {
      const nextPath = arePositionsNearlyEqual(driverPosition, activeDestination) ? [driverPosition] : [driverPosition, activeDestination];
      setRoutePath((current) => keepRouteIfSame(current, nextPath));
      return;
    }

    if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
      setRoutePath((current) => keepRouteIfSame(current, [driverPosition]));
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
      setRoutePath(cachedRoute);
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
        rememberRouteCacheEntry(routeCacheRef.current, routeCacheKey, result.path);
        lastResolvedRouteRef.current = {
          origin: driverPosition,
          destination: activeDestination,
          resolvedAt: Date.now(),
        };
        setRoutePath(result.path);
        return;
      }

      const fallbackRoute = [driverPosition, activeDestination];
      rememberRouteCacheEntry(routeCacheRef.current, routeCacheKey, fallbackRoute);
      lastResolvedRouteRef.current = {
        origin: driverPosition,
        destination: activeDestination,
        resolvedAt: Date.now(),
      };
      setRoutePath(fallbackRoute);
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDestination, driverPosition, isLoaded, routePath]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const panTo = (point) => map.animateCamera({ center: toMapCoordinate(point) }, { duration: 500 });

    if (routePath.length > 1) {
      if (!hasAutoFramedMapRef.current) {
        // bounds of the route + driver + destination, padded like the web's fitBounds
        map.fitToCoordinates(
          [...routePath, driverPosition, activeDestination].map(toMapCoordinate),
          { edgePadding: { top: 120, right: 48, bottom: 320, left: 48 }, animated: true },
        );
        hasAutoFramedMapRef.current = true;
        return;
      }

      panTo(driverPosition);
      return;
    }

    if (!hasAutoFramedMapRef.current) {
      map.animateCamera({ center: toMapCoordinate(driverPosition), zoom: 15 }, { duration: 500 });
      hasAutoFramedMapRef.current = true;
      return;
    }

    panTo(driverPosition);
  }, [activeDestination, driverPosition, map, routePath]);

  const handleCall = () => {
    if (driver.phone) Linking.openURL(`tel:${driver.phone}`).catch(() => {});
  };

  const handleShare = () => {
    const text = `Tracking my delivery! Driver: ${driver.name}, Vehicle: ${driver.plate}. Destination: ${state.drop}`;
    if (navigator.share) navigator.share({ title: 'Parcel Tracking', text });
    else {
      navigator.clipboard.writeText(text);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    }
  };

  const submitParcelFeedback = async () => {
    if (!rideId) {
      clearCurrentRide();
      navigate(userHomeRoute, { replace: true });
      return;
    }

    if (rating < 1) {
      setFeedbackError('Please rate your delivery driver before finishing.');
      return;
    }

    if (!tipsEnabled && Number(selectedTip || 0) > 0) {
      setFeedbackError('Tips are currently disabled.');
      return;
    }

    if (tipsEnabled && Number(selectedTip || 0) > 0 && minimumTipAmount > 0 && Number(selectedTip || 0) < minimumTipAmount) {
      setFeedbackError(`Minimum tip amount is Rs ${minimumTipAmount}.`);
      return;
    }

    try {
      setIsSubmittingFeedback(true);
      setFeedbackError('');
      const response = await api.patch(`/rides/${rideId}/feedback`, {
        rating,
        comment,
        tipAmount: selectedTip || 0,
      });
      const payload = unwrapApiPayload(response) || {};
      const feedback = payload?.feedback || {
        rating,
        comment,
        tipAmount: selectedTip || 0,
        submittedAt: new Date().toISOString(),
      };

      setRideRealtime((prev) => ({
        ...(prev || {}),
        feedback,
        completedAt: payload?.completedAt || prev?.completedAt || Date.now(),
      }));
      setIsFeedbackSubmitted(true);
      saveCurrentRide({
        ...latestStateRef.current,
        ...(rideRealtime || {}),
        rideId,
        driver,
        fare,
        paymentMethod: rideRealtime?.paymentMethod || state.paymentMethod || 'Cash',
        status: tripStatus,
        liveStatus: tripStatus,
        completedAt: payload?.completedAt || completedAt,
        feedback,
      });
    } catch (error) {
      setFeedbackError(error?.message || 'Could not submit feedback right now.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const isDropLeg = ['started', 'ongoing', 'arrived', 'completed'].includes(tripStatus);
  // The web card sits at the bottom of a non-scrolling page; here it scrolls inside itself when taller than the room.
  const cardMaxHeight = Dimensions.get('window').height - (insets.top + 104);

  return (
    <Screen edges={[]} bg={u.bg}>
      {/* Map Content */}
      <View style={StyleSheet.absoluteFill}>
        {isLoaded ? (
          <AppMap
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={regionFor(driverPosition, 15)}
            customMapStyle={MAP_STYLE}
            onMapReady={() => setMap(mapRef.current)}
          >
            {routePath.length > 0 && (
              <Polyline
                coordinates={routePath.map(toMapCoordinate)}
                strokeColor="rgba(15,23,42,0.9)"
                strokeWidth={6}
              />
            )}
            <RotatingVehicleMarker position={driverPosition} iconUrl={vehicleIcon} heading={displayDriverHeading} />
            <CircleLocationMarker
              position={activeDestination}
              title={isDropLeg ? 'Drop' : 'Pickup'}
              color={isDropLeg ? '#ef4444' : '#10b981'}
            />
          </AppMap>
        ) : (
          <Skeleton width="100%" height="100%" rounded={0} />
        )}
      </View>

      {/* Header Overlays */}
      <Enter from={{ y: -20, fade: true }} style={[s.headerRow, { top: 32 + insets.top }]}>
        <Pressable onPress={() => navigate(userHomeRoute, { replace: true })} style={s.backButton}>
          <ChevronLeft size={20} strokeWidth={2.5} color={u.text} />
        </Pressable>
        <View style={s.destinationCard}>
          <View style={s.destinationIcon}>
            <Package size={16} strokeWidth={2.5} color={u.text} />
          </View>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text style={s.destinationLabel}>DESTINATION</Text>
            <Text numberOfLines={1} style={s.destinationText}>
              {state.drop || 'Drop'}
            </Text>
          </View>
        </View>
      </Enter>

      {/* Toast Notification */}
      {shareToast ? (
        <View pointerEvents="none" style={s.toastWrap}>
          <Enter from={{ y: 20, fade: true }} style={s.toast}>
            <Text style={s.toastText}>Tracking link copied!</Text>
          </Enter>
        </View>
      ) : null}

      {/* Bottom Tracking Card */}
      <Enter from={{ y: 300 }} style={[s.card, { paddingBottom: 32 + insets.bottom, maxHeight: cardMaxHeight }]}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />

          {isDeliveryCompleted ? (
            <View style={{ gap: 20 }}>
              <View style={s.doneRow}>
                <View style={s.doneIcon}>
                  <CheckCircle2 size={22} color={u.text} />
                </View>
                <View>
                  <Text style={s.doneLabel}>PARCEL DELIVERED</Text>
                  <Text style={s.doneTitle}>Delivered successfully</Text>
                </View>
              </View>

              <View style={s.summary}>
                <View style={s.summaryHead}>
                  <View style={s.summaryHeadLeft}>
                    <View style={s.summaryIcon}>
                      <Receipt size={14} color="#fdba74" />
                    </View>
                    <View>
                      <Text style={s.summaryTitle}>Delivery Summary</Text>
                      <Text style={s.summaryDate}>{completedDateLabel} · {completedTimeLabel}</Text>
                    </View>
                  </View>
                  <Pressable onPress={handleShare} style={s.shareButton}>
                    <Share2 size={12} color={u.text} />
                    <Text style={s.shareText}>Share</Text>
                  </Pressable>
                </View>

                <View style={s.summaryBody}>
                  <View style={s.driverBox}>
                    <View style={s.initials}>
                      <Text style={s.initialsText}>{getInitials(driver.name)}</Text>
                    </View>
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <Text numberOfLines={1} style={s.driverBoxName}>{driver.name}</Text>
                      <Text numberOfLines={1} style={s.driverBoxMeta}>{driver.plate || 'Assigned'} · {driver.vehicle || 'Delivery Agent'}</Text>
                      <View style={s.ratingChip}>
                        <Star size={10} color={u.accent} fill="#eab308" />
                        <Text style={s.ratingChipText}>{driver.rating || 'New'}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={s.box}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ alignItems: 'center', paddingTop: 4 }}>
                        <View style={[s.routeDot, { backgroundColor: '#10b981' }]} />
                        <View style={s.routeDash} />
                        <View style={[s.routeDot, { backgroundColor: u.accent }]} />
                      </View>
                      <View style={{ minWidth: 0, flex: 1, gap: 12 }}>
                        <View>
                          <Text numberOfLines={1} style={s.routePlace}>{state.pickup || 'Pickup'}</Text>
                          <Text style={s.routeKind}>PICKUP</Text>
                        </View>
                        <View>
                          <Text numberOfLines={1} style={s.routePlace}>{state.drop || 'Drop'}</Text>
                          <Text style={s.routeKind}>DESTINATION</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={s.box}>
                    <View style={s.billRow}>
                      <Text style={s.billKey}>Delivery fare</Text>
                      <Text style={s.billValue}>Rs {Number(fare || 0).toFixed(2)}</Text>
                    </View>
                    <View style={[s.billRow, { marginTop: 8 }]}>
                      <Text style={s.billKey}>Tip</Text>
                      <Text style={s.billValue}>Rs {Number(selectedTip || 0).toFixed(2)}</Text>
                    </View>
                    <View style={[s.billRow, s.billTotalRow]}>
                      <Text style={s.billTotalKey}>Total</Text>
                      <Text style={s.billTotalValue}>Rs {totalBill.toFixed(2)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={s.panel}>
                {isFeedbackSubmitted ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={s.submittedLabel}>FEEDBACK SUBMITTED</Text>
                    <Text style={s.submittedText}>
                      Rating: {rating || 0}/5 {selectedTip > 0 ? `| Tip added: Rs ${Number(selectedTip || 0).toFixed(2)}` : '| No tip added'}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={s.panelLabel}>
                      {(tipsEnabled ? 'Tip your delivery driver' : 'Driver tips disabled').toUpperCase()}
                    </Text>
                    {tipsEnabled && minimumTipAmount > 0 ? (
                      <Text style={s.minTip}>Minimum tip amount: Rs {minimumTipAmount}</Text>
                    ) : null}
                    <View style={s.tips}>
                      {availableTipOptions.map((amount) => {
                        const active = selectedTip === amount;
                        const disabled = !tipsEnabled && amount > 0;
                        return (
                          <Pressable
                            key={amount}
                            onPress={() => {
                              feedbackEditedRef.current = true;
                              setSelectedTip(amount);
                              setFeedbackError('');
                            }}
                            disabled={disabled}
                            style={[s.tipChip, active ? s.tipChipActive : null, disabled ? { opacity: 0.5 } : null]}
                          >
                            <Text style={[s.tipChipText, active ? { color: u.ink } : null]}>
                              {amount === 0 ? 'No tip' : `Rs ${amount}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>

              <View style={[s.panel, { alignItems: 'center' }]}>
                <Text style={s.howTitle}>How was your delivery with {driver.name?.split(' ')[0] || 'your driver'}?</Text>
                <View style={s.stars}>
                  {[1, 2, 3, 4, 5].map((value) => {
                    const on = rating >= value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => {
                          feedbackEditedRef.current = true;
                          setRating(value);
                          setFeedbackError('');
                        }}
                        disabled={isFeedbackSubmitted}
                        style={[s.starButton, on ? s.starButtonOn : null]}
                      >
                        <Star size={19} color={on ? u.text : u.text2} fill={on ? '#ffffff' : 'none'} />
                      </Pressable>
                    );
                  })}
                </View>

                <View style={s.commentWrap}>
                  <TextInput
                    value={comment}
                    onChangeText={(text) => { feedbackEditedRef.current = true; setComment(text); }}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    editable={!isFeedbackSubmitted}
                    placeholder="Tell us about the delivery"
                    placeholderTextColor="#cbd5e1"
                    textAlignVertical="top"
                    style={s.comment}
                  />
                </View>

                {feedbackError ? <Text style={s.feedbackError}>{feedbackError}</Text> : null}

                <Pressable
                  onPress={submitParcelFeedback}
                  disabled={isSubmittingFeedback || isFeedbackSubmitted}
                  style={[s.submitButton, (isSubmittingFeedback || isFeedbackSubmitted) ? { opacity: 0.6 } : null]}
                >
                  <Text style={s.submitText}>
                    {isSubmittingFeedback ? 'Saving your feedback...' : isFeedbackSubmitted ? 'Feedback already saved' : 'Submit rating'}
                  </Text>
                  <ChevronRight size={16} color={u.ink} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    clearCurrentRide();
                    navigate(userHomeRoute, { replace: true });
                  }}
                  style={{ marginTop: 12 }}
                >
                  <Text style={s.continueHome}>Continue home</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ gap: 24 }}>
              {/* Driver Info Section */}
              <View style={s.liveRow}>
                <View style={s.liveLeft}>
                  <View>
                    <View style={s.avatar}>
                      <AppImage
                        src={`https://ui-avatars.com/api/?name=${driver.name.replace(' ', '+')}&background=0f172a&color=fff&bold=true`}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    </View>
                    <View style={s.avatarRating}>
                      <Star size={10} color="#fbbf24" fill="#fbbf24" />
                      <Text style={s.avatarRatingText}>{driver.rating || 'New'}</Text>
                    </View>
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={s.liveName}>{driver.name}</Text>
                    <Text style={s.livePlate}>{`${driver.plate} • ${driver.vehicle || 'Delivery Agent'}`.toUpperCase()}</Text>
                    <View style={s.liveStatusRow}>
                      <Clock size={12} strokeWidth={3} color={u.text} />
                      <Text style={s.liveStatusText}>
                        {tripStatus === 'arrived' || tripStatus === 'arriving'
                          ? 'DRIVER HAS ARRIVED'
                          : tripStatus === 'started' || tripStatus === 'ongoing'
                            ? 'HEADING TO DROP'
                            : 'ARRIVING SHORTLY'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* OTP Display */}
                {otp ? (
                  <View style={s.otpBox}>
                    <Text style={s.otpLabel}>OTP</Text>
                    <Text style={s.otpValue}>{otp}</Text>
                  </View>
                ) : null}
              </View>

              {/* Action Grid */}
              <View style={s.actionGrid}>
                <ActionButton icon={Phone} label="Call" onPress={handleCall} />
                <ActionButton icon={MessageCircle} label="Chat" badge={chatUnread} onPress={() => navigate(`${routePrefix}/ride/chat`, { state: { rideId, peer: driver } })} />
                <ActionButton icon={Share2} label="Share" onPress={handleShare} />
                <ActionButton icon={ShieldCheck} label="Safety" onPress={() => navigate(routePrefix ? `${routePrefix}/support` : '/ride/support')} color="dark" />
              </View>

              {/* Trip Footer */}
              <View style={s.tripFooter}>
                <View>
                  <Text style={s.fareLabel}>ESTIMATED FARE</Text>
                  <View style={s.fareRow}>
                    <Text style={s.fareValue}>₹{fare}</Text>
                    <View style={s.payPill}>
                      <Text style={s.payPillText}>{String(state.paymentMethod || 'Cash').toUpperCase()}</Text>
                    </View>
                  </View>
                </View>
                <Tap onPress={() => setShowCancelConfirm(true)} style={s.cancelButton}>
                  <Text style={s.cancelButtonText}>CANCEL</Text>
                </Tap>
              </View>
            </View>
          )}
        </ScrollView>
      </Enter>

      {/* Cancel Confirmation Modal */}
      <Dialog open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} backdropOpacity={0.4} style={s.dialog}>
        <View style={s.dialogIcon}>
          <AlertTriangle size={32} strokeWidth={2.5} color="#ef4444" />
        </View>
        <Text style={s.dialogTitle}>Cancel Delivery?</Text>
        <Text style={s.dialogText}>Your delivery agent is already moving.</Text>
        <CancellationFeeNotice rideId={rideId} />
        <View style={{ gap: 12, alignSelf: 'stretch' }}>
          <Tap
            scale={0.96}
            onPress={() => {
              api.patch(`/rides/${rideId}/cancel`).then(announceCancellationFee).catch(() => {}).finally(() => {
                clearCurrentRide();
                navigate(userHomeRoute, { replace: true });
              });
            }}
            style={s.dialogConfirm}
          >
            <Text style={s.dialogConfirmText}>YES, CANCEL</Text>
          </Tap>
          <Pressable onPress={() => setShowCancelConfirm(false)} style={s.dialogKeep}>
            <Text style={s.dialogKeepText}>KEEP TRACKING</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
};

const ActionButton = ({ icon: Icon, label, onPress, color = 'gray', badge = 0 }) => {
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const dark = color === 'dark';
  const fg = dark ? u.ink : u.text2;
  return (
    <Tap scale={0.94} onPress={onPress} style={[s.actionButton, dark ? s.actionButtonDark : null]}>
      <Icon size={20} strokeWidth={2.5} color={fg} />
      <Text style={[s.actionLabel, { color: fg }]}>{label.toUpperCase()}</Text>
      <ChatUnreadBadge count={badge} style={{ right: 6, top: 6 }} />
    </Tap>
  );
};

const useStyles = makeStyles((t) => {
  const u = userTokens(t.dark);
  return {
    headerRow: { position: 'absolute', left: 16, right: 16, zIndex: 10, flexDirection: 'row', gap: 12 },
    backButton: { width: 48, height: 48, backgroundColor: u.card, borderRadius: 16, borderWidth: 1, borderColor: u.border, alignItems: 'center', justifyContent: 'center', ...USER_SHADOW },
    destinationCard: { flex: 1, minWidth: 0, backgroundColor: u.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: u.border, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', ...USER_SHADOW },
    destinationIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center' },
    destinationLabel: { fontSize: 10.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.9, color: u.muted },
    destinationText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: u.text },
    toastWrap: { position: 'absolute', bottom: 128, left: 0, right: 0, alignItems: 'center', zIndex: 50 },
    toast: { backgroundColor: '#111827', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999, ...USER_SHADOW },
    toastText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: u.text },
    card: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, backgroundColor: u.card, borderTopLeftRadius: 40, borderTopRightRadius: 40, paddingHorizontal: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: u.border, ...USER_SHADOW, shadowOffset: { width: 0, height: -20 } },
    handle: { width: 48, height: 6, borderRadius: 3, backgroundColor: u.soft, alignSelf: 'center', marginBottom: 24 },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    doneIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#10b981', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 8 } },
    doneLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.2, color: u.text2 },
    doneTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: u.text },
    summary: { overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, ...USER_SHADOW },
    summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 12 },
    summaryHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    summaryIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center' },
    summaryTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: u.text },
    summaryDate: { fontSize: 10, lineHeight: 14, fontWeight: '600', color: u.text2 },
    shareButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9999, backgroundColor: u.soft, paddingHorizontal: 12, paddingVertical: 6 },
    shareText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: u.text },
    summaryBody: { paddingHorizontal: 16, paddingVertical: 16, gap: 16 },
    driverBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: u.border, backgroundColor: u.soft, padding: 12 },
    initials: { width: 56, height: 56, borderRadius: 16, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    initialsText: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: u.text },
    driverBoxName: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: u.text },
    driverBoxMeta: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: u.muted },
    ratingChip: { marginTop: 4, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9999, backgroundColor: u.soft, paddingHorizontal: 8, paddingVertical: 2 },
    ratingChipText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: u.text },
    box: { borderRadius: 18, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, padding: 12 },
    routeDot: { width: 10, height: 10, borderRadius: 5 },
    routeDash: { height: 40, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: u.border },
    routePlace: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: u.text },
    routeKind: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: u.text2 },
    billRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    billKey: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: u.muted },
    billValue: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: u.text },
    billTotalRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: u.border, paddingTop: 12 },
    billTotalKey: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: u.text },
    billTotalValue: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: u.text },
    panel: { borderRadius: 20, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 16, ...USER_SHADOW },
    submittedLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.2, color: '#10b981', textAlign: 'center' },
    submittedText: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '600', color: u.muted, textAlign: 'center' },
    panelLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.2, color: u.text2, textAlign: 'center' },
    minTip: { marginTop: 8, fontSize: 11, lineHeight: 16, fontWeight: '600', color: u.muted, textAlign: 'center' },
    tips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
    tipChip: { borderRadius: 9999, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 8 },
    // bg-orange-500 is the yellow accent inside the Taxi user app (index.css)
    tipChipActive: { borderColor: '#f97316', backgroundColor: u.accent, elevation: 4, shadowColor: '#f97316', shadowOpacity: 0.24, shadowRadius: 9, shadowOffset: { width: 0, height: 8 } },
    tipChipText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: u.text2 },
    howTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: u.text, textAlign: 'center' },
    stars: { marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    starButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center' },
    starButtonOn: { backgroundColor: u.accent, elevation: 4, shadowColor: '#f97316', shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 10 } },
    commentWrap: { marginTop: 16, alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, borderColor: u.border, backgroundColor: u.soft, paddingHorizontal: 12, paddingVertical: 12 },
    comment: { minHeight: 76, borderRadius: 12, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '600', color: u.text },
    feedbackError: { marginTop: 12, fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#ef4444', textAlign: 'center' },
    // button.bg-slate-900 is the yellow accent button inside the Taxi user app (index.css)
    submitButton: { marginTop: 16, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: u.accent, paddingVertical: 14, ...USER_SHADOW },
    submitText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: u.ink },
    continueHome: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: u.muted, textAlign: 'center' },
    liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    liveLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 },
    avatar: { width: 64, height: 64, borderRadius: 24, backgroundColor: u.card, overflow: 'hidden', borderWidth: 2, borderColor: '#ffffff', ...USER_SHADOW },
    avatarRating: { position: 'absolute', bottom: -4, right: -4, backgroundColor: u.card, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 1, borderColor: u.border, flexDirection: 'row', alignItems: 'center', gap: 4, ...USER_SHADOW },
    avatarRatingText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: u.text },
    liveName: { fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -0.4, color: u.text },
    livePlate: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: -0.3, color: u.text2 },
    liveStatusRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveStatusText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.55, color: u.text },
    otpBox: { backgroundColor: u.soft, borderWidth: 1, borderColor: u.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
    otpLabel: { fontSize: 10.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1, color: u.muted, marginBottom: 2 },
    otpValue: { fontSize: 20, lineHeight: 22, fontWeight: '700', color: u.text },
    actionGrid: { flexDirection: 'row', gap: 12 },
    actionButton: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16, borderRadius: 24, borderWidth: 1, backgroundColor: u.card, borderColor: u.border },
    actionButtonDark: { backgroundColor: u.accent, borderColor: '#0f172a' },
    actionLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
    tripFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, borderTopWidth: 1, borderTopColor: '#f9fafb' },
    fareLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, color: u.text2, marginBottom: 4 },
    fareRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fareValue: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: u.text },
    payPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: u.soft },
    payPillText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, color: u.muted },
    cancelButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#fee2e2' },
    cancelButtonText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, color: '#ef4444' },
    dialog: { width: '85%', maxWidth: 384, borderRadius: 40, padding: 32, alignItems: 'center', backgroundColor: u.card, ...USER_SHADOW },
    dialogIcon: { width: 64, height: 64, borderRadius: 24, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    dialogTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: u.text, marginBottom: 8, textAlign: 'center' },
    dialogText: { fontSize: 14, lineHeight: 22, fontWeight: '600', color: u.text2, marginBottom: 20, textAlign: 'center' },
    dialogConfirm: { width: '100%', backgroundColor: '#ef4444', paddingVertical: 20, borderRadius: 24, alignItems: 'center', elevation: 6, shadowColor: '#ef4444', shadowOpacity: 0.2, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } },
    // text-white is remapped to the theme's primary text colour inside the Taxi user app (index.css)
    dialogConfirmText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4, color: u.text },
    dialogKeep: { width: '100%', paddingVertical: 16, alignItems: 'center' },
    dialogKeepText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4, color: u.text2 },
  };
});

export default ParcelTracking;
