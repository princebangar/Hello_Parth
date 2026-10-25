import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { X, ShieldCheck, Phone, MessageCircle, CheckCircle2, AlertTriangle, Star, Calendar, Clock3, LoaderCircle } from 'lucide-react-native';
import { useNavigate, useLocation, useBeforeLeave } from '@/lib/router';
import { AppImage, Dialog, Screen, Text } from '@/native/ui';
import { AppMap, Marker, Polyline, regionFor, toLatLng } from '@/native/ui/AppMap';
import { alpha, colors, makeStyles, sp, useTheme } from '@/theme';
import { socketService } from '../../../../shared/api/socket';
import api from '../../../../shared/api/axiosInstance';
import CancellationFeeNotice from '../../components/CancellationFeeNotice';
import { getLocalUserToken, userAuthService } from '../../services/authService';
import { getCurrentRide, isActiveCurrentRide, saveCurrentRide } from '../../services/currentRideService';
import { useBaseGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import { scheduleScheduledRideReminders } from '../../utils/upcomingRideReminderService';
import { toHistorySafeState } from '../../../../shared/utils/historyState';
import { getUnpaidRideFromError, openUnpaidRidePayment } from '../../utils/unpaidRide';
import { getAppRoutePath } from '@/shared/utils/nativeShell';
import useRideChatUnread from '../../../shared/chat/useRideChatUnread';
import ChatUnreadBadge from '../../../shared/components/ChatUnreadBadge';
import LuxuryIcon from '@/assets/icons/Luxury.png';
import PremiumIcon from '@/assets/icons/Premium.png';
import SuvIcon from '@/assets/icons/SUV.png';
import BikeIcon from '@/assets/icons/bike.png';
import CarIcon from '@/assets/icons/car.png';
import AutoIcon from '@/assets/icons/auto.png';

// The web map's `styles` (react-native-maps customMapStyle takes the same JSON).
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

const getVehicleIcon = (type = 'car') => {
  const val = String(type).toLowerCase();
  if (val.includes('bike')) return BikeIcon;
  if (val.includes('auto')) return AutoIcon;
  if (val.includes('lux')) return LuxuryIcon;
  if (val.includes('premium')) return PremiumIcon;
  if (val.includes('suv')) return SuvIcon;
  return CarIcon;
};

const SEARCH_FALLBACK_POLL_DELAY_MS = 10000;
const SEARCH_FALLBACK_POLL_INTERVAL_MS = 10000;

// A custom-view marker is drawn to a bitmap on Android: keep redrawing it for a moment (images load), then freeze it.
const useTrackViewChanges = (deps) => {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const timer = setTimeout(() => setTrack(false), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return track;
};

const PinLocationMarker = ({ position, title, color, size = 34, zIndex = 1 }) => {
  const tracks = useTrackViewChanges([color, size]);
  const coordinate = toLatLng(position);
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: (size - 2) / (size + Math.round(size * 0.28) - 2) }} zIndex={zIndex} tracksViewChanges={tracks} title={title}>
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={[styles.pinHead, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
          <View style={styles.pinDot} />
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

// A real online driver around the pickup (same vehicle type the rider booked) - one marker per driver.
const NearbyDriverMarker = React.memo(({ driver, iconUrl }) => {
  const [lng, lat] = driver?.location?.coordinates || [];
  const tracks = useTrackViewChanges([iconUrl]);
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return null;
  }

  return (
    <Marker coordinate={{ latitude: Number(lat), longitude: Number(lng) }} anchor={{ x: 0.5, y: 0.5 }} zIndex={50} tracksViewChanges={tracks} title={driver?.name || 'Nearby driver'}>
      <View style={styles.nearbyWrap} pointerEvents="none">
        <View style={styles.nearbyPulse} />
        <View style={styles.nearbyBadge}>
          <AppImage src={iconUrl || CarIcon} fallback={CarIcon} style={styles.nearbyIcon} contentFit="contain" transition={0} />
          <View style={styles.nearbyOnline} />
        </View>
      </View>
    </Marker>
  );
});

// The searching radar sat in an OverlayView on the pickup. Natively it is drawn above the map at the pickup's screen
// point (re-projected while the map moves), so it can animate (a marker bitmap cannot).
const useProjectedPoint = (mapRef, coordinate) => {
  const [point, setPoint] = useState(null);
  const latest = useRef(0);
  const project = useCallback(() => {
    const map = mapRef.current;
    if (!map || !coordinate) return;
    const id = ++latest.current;
    map.pointForCoordinate(coordinate).then((p) => {
      if (id === latest.current && p) setPoint({ x: p.x, y: p.y });
    }).catch(() => {});
  }, [mapRef, coordinate]);
  useEffect(() => {
    project();
  }, [project]);
  return [point, project];
};

const RadarRing = ({ delay }) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration: 3000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [delay, value]);
  return (
    <Animated.View
      style={[
        styles.radarRing,
        {
          opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 4.5] }) }],
        },
      ]}
    />
  );
};

const RadarSweep = () => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  // conic-gradient(rgba(249,115,22,.5) 0deg, transparent 60deg): a 60-degree wedge fading out
  const r = 160;
  const end = { x: r + r * Math.sin(Math.PI / 3), y: r - r * Math.cos(Math.PI / 3) };
  return (
    <Animated.View style={[styles.radarSweep, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      <Svg width={320} height={320}>
        <Defs>
          <SvgLinearGradient id="sweep" x1={r} y1={0} x2={end.x} y2={end.y + 40} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#f97316" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#f97316" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d={`M ${r} ${r} L ${r} 0 A ${r} ${r} 0 0 1 ${end.x} ${end.y} Z`} fill="url(#sweep)" />
      </Svg>
    </Animated.View>
  );
};

const SearchRadar = ({ point }) => {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade]);
  if (!point) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.radar, { left: point.x, top: point.y - 22, opacity: fade }]}>
      {[1, 2, 3, 4].map((i) => <RadarRing key={i} delay={i * 750} />)}
      <RadarSweep />
    </Animated.View>
  );
};

// Pulsing dot row: scale 1 -> 1.4 -> 1, opacity .3 -> 1 -> .3, grey -> orange -> grey (1.5 s, staggered).
const SearchDot = ({ index }) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]));
    const timer = setTimeout(() => loop.start(), index * 200);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [index, value]);
  return (
    <Animated.View
      style={[
        styles.searchDot,
        {
          opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.searchDotOrange, { opacity: value }]} />
    </Animated.View>
  );
};

const PulseDot = ({ style }) => {
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
      Animated.timing(value, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [value]);
  return <Animated.View style={[style, { opacity: value }]} />;
};

// animate-ping (scale 1 -> 2, opacity .75 -> 0, 1 s)
const PingDot = () => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: 1000, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [value]);
  return (
    <View style={styles.pingWrap}>
      <Animated.View
        style={[
          styles.pingHalo,
          {
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
            transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
          },
        ]}
      />
      <View style={styles.pingCore} />
    </View>
  );
};

const SpinIcon = ({ children }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>{children}</Animated.View>;
};

// framer-motion `initial -> animate` entrance (y + opacity [+ scale / x])
const useEntrance = ({ y = 0, x = 0, scale = 1, deps = [] } = {}) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    Animated.spring(value, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220, mass: 1 }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return {
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) },
      { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [x, 0] }) },
      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) },
    ],
  };
};

const ScalePressable = ({ scaleTo = 0.98, style, children, disabled, ...rest }) => (
  <Pressable disabled={disabled} {...rest} style={({ pressed }) => [style, pressed && !disabled ? { transform: [{ scale: scaleTo }] } : null]}>
    {children}
  </Pressable>
);

const NEARBY_DRIVERS_POLL_MS = 8000;
const NEARBY_DRIVERS_RADIUS_METERS = 5000;

const DRIVER_PLACEHOLDER = { name: 'Captain', rating: '', vehicle: 'Taxi', plate: 'Assigned', phone: '', eta: 2 };
const STAGES = { SEARCHING: 'searching', ACCEPTED: 'accepted', COMPLETING: 'completing' };
const CONSUMED_SEARCH_NONCE_PREFIX = 'helloparth_consumed_search_nonce:';
const ACTIVE_SEARCH_NONCES = new Set();
const ACTIVE_SEARCH_NONCE_CLEANUPS = new Map();

const normalizeDriver = (driver = {}) => ({
  name: driver.name || 'Captain',
  rating: driver.rating || '',
  vehicle: driver.vehicle || driver.vehicleType || driver.vehicle_type || 'Taxi',
  vehicleType: driver.vehicleType || driver.vehicle_type || driver.vehicle || 'Taxi',
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

const formatCurrency = (amount) => `Rs ${Math.round(Number(amount) || 0)}`;

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Scheduled';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Scheduled';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildHistoryState = (value) => toHistorySafeState(value) || {};

const SearchingDriver = () => {
  const s = useStyles();
  const t = useTheme();
  const P = taxiPalette(t);
  const insets = useSafeAreaInsets();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = useMemo(() => location.state || {}, [location.state]);
  const [stage, setStage] = useState(STAGES.SEARCHING);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [driver, setDriver] = useState(DRIVER_PLACEHOLDER);
  const [rideOtp, setRideOtp] = useState('');
  const [searchStatus, setSearchStatus] = useState('Connecting with drivers nearby');
  // true once the server closed the search without a driver - the sheet then offers Try again / Back to home
  const [searchEnded, setSearchEnded] = useState(false);
  const [rideBids, setRideBids] = useState([]);
  const [biddingSummary, setBiddingSummary] = useState(() => ({
    bookingMode: String(routeState.bookingMode || 'normal'),
    pricingNegotiationMode: String(routeState.pricingNegotiationMode || 'none'),
    baseFare: Number(routeState.baseFare || routeState.fare || routeState.vehicle?.price || 0),
    bidFloorFare: Number(routeState.bidFloorFare || routeState.baseFare || routeState.fare || routeState.vehicle?.price || 0),
    userMaxBidFare: Number(routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 0),
    bidCeilingMaxFare: Number(routeState.bidCeilingMaxFare || routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 0),
    bidStepAmount: Number(routeState.bidStepAmount || 10),
    fareIncreaseWaitMinutes: Number(routeState.fareIncreaseWaitMinutes || 0),
    nextFareIncreaseAt: routeState.nextFareIncreaseAt || null,
  }));
  const [bidActionLoading, setBidActionLoading] = useState(false);
  const [scheduledStatus, setScheduledStatus] = useState(() => (routeState.scheduledAt ? 'saving' : 'idle'));
  const [scheduledError, setScheduledError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [fareHistory, setFareHistory] = useState(() => {
    const initialFare = Number(routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 0);
    return initialFare > 0 ? [initialFare] : [];
  });
  const timerRef = useRef(null);
  const activeRidePollRef = useRef(null);
  const activeRidePollStartTimeoutRef = useRef(null);
  const requestStartedRef = useRef(false);
  const cleanupSearchRef = useRef(null);
  const cleanupDelayRef = useRef(null);
  const trackingStartedRef = useRef(false);
  const driverRef = useRef(driver);
  const cancellingRef = useRef(false);
  const mapRef = useRef(null);
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const userHomeRoute = routePrefix || '/taxi/user';
  const selectedVehicleTypeId = useMemo(
    () => routeState.vehicleTypeId || routeState.vehicle?.vehicleTypeId,
    [routeState],
  );
  const activeRideIdRef = useRef('');
  // read on each render: the driver-found card re-renders once the ride is accepted
  const chatUnread = useRideChatUnread(activeRideIdRef.current || getCurrentRide()?.rideId || '', 'user');
  const searchNonce = String(routeState.searchNonce || '');
  const isDriverBidRide = biddingSummary.pricingNegotiationMode === 'driver_bid';
  const isUserIncrementRide = biddingSummary.pricingNegotiationMode === 'user_increment_only';
  const isBiddingRide = isDriverBidRide;
  const isScheduledRide = Boolean(routeState.scheduledAt);
  const isScheduledBiddingRide = isScheduledRide && isBiddingRide;
  const isSearching = stage === STAGES.SEARCHING;
  const isAccepted = stage === STAGES.ACCEPTED || stage === STAGES.COMPLETING;
  const fareIncreaseCountdownMs = Math.max(0, new Date(biddingSummary.nextFareIncreaseAt || 0).getTime() - now);
  const canIncreaseFare = !isUserIncrementRide || !biddingSummary.nextFareIncreaseAt || fareIncreaseCountdownMs <= 0;
  const formatCountdown = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };
  const fareIncreaseCountdownLabel = canIncreaseFare
    ? 'You can increase the fare now.'
    : `Next increase in ${formatCountdown(fareIncreaseCountdownMs)}`;

  const appendFareHistory = (fare) => {
    const normalizedFare = Math.round(Number(fare || 0));
    if (!Number.isFinite(normalizedFare) || normalizedFare <= 0) {
      return;
    }
    setFareHistory((current) => (
      current[current.length - 1] === normalizedFare ? current : [...current, normalizedFare]
    ));
  };

  const { isLoaded } = useBaseGoogleMapsLoader();

  const pickupPos = useMemo(
    () => (
      routeState.pickupCoords
        ? { lng: routeState.pickupCoords[0], lat: routeState.pickupCoords[1] }
        : { lat: 22.7196, lng: 75.8577 }
    ),
    [routeState.pickupCoords],
  );

  const dropPos = useMemo(
    () => (
      routeState.dropCoords
        ? { lng: routeState.dropCoords[0], lat: routeState.dropCoords[1] }
        : null
    ),
    [routeState.dropCoords],
  );
  const pickupLatLng = useMemo(() => toLatLng(pickupPos), [pickupPos]);
  const dropLatLng = useMemo(() => toLatLng(dropPos), [dropPos]);
  const [radarPoint, reprojectRadar] = useProjectedPoint(mapRef, pickupLatLng);
  const availableVehicleIcon = useMemo(
    () => (
      routeState.vehicleIconUrl ||
      routeState.vehicle?.vehicleIconUrl ||
      routeState.vehicle?.icon ||
      getVehicleIcon(routeState.vehicleIconType || routeState.vehicle?.iconType || routeState.vehicle?.name)
    ),
    [routeState.vehicle?.icon, routeState.vehicle?.iconType, routeState.vehicle?.name, routeState.vehicle?.vehicleIconUrl, routeState.vehicleIconType, routeState.vehicleIconUrl],
  );
  const formattedScheduledTime = useMemo(
    () => formatScheduledDateTime(routeState.scheduledAt),
    [routeState.scheduledAt],
  );

  // The map follows the pickup (web: <GoogleMap center={pickupPos}>).
  useEffect(() => {
    mapRef.current?.animateCamera?.({ center: pickupLatLng }, { duration: 300 });
  }, [pickupLatLng]);

  // While searching, show the drivers who are really online near the pickup (1 driver = 1 marker, none = no markers).
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const pickupLng = routeState.pickupCoords?.[0];
  const pickupLat = routeState.pickupCoords?.[1];
  const nearbyServiceLocationId = routeState.service_location_id || routeState.serviceLocationId || '';
  const nearbyTransportType = routeState.transport_type || routeState.transportType || routeState.vehicle?.transportType || 'taxi';
  useEffect(() => {
    if (!isSearching || !selectedVehicleTypeId || !Number.isFinite(Number(pickupLng)) || !Number.isFinite(Number(pickupLat))) {
      setNearbyDrivers([]);
      return undefined;
    }

    let active = true;
    const loadNearbyDrivers = async () => {
      try {
        const response = await api.get('/rides/available-drivers', {
          params: {
            vehicleTypeId: selectedVehicleTypeId,
            lng: pickupLng,
            lat: pickupLat,
            maxDistance: NEARBY_DRIVERS_RADIUS_METERS,
            service_location_id: nearbyServiceLocationId || undefined,
            transport_type: nearbyTransportType,
          },
        });
        const payload = unwrap(response);
        if (active) {
          setNearbyDrivers(Array.isArray(payload?.drivers) ? payload.drivers : []);
        }
      } catch {
        // the markers are decoration - keep whatever was last shown
      }
    };

    loadNearbyDrivers();
    const timer = setInterval(loadNearbyDrivers, NEARBY_DRIVERS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isSearching, selectedVehicleTypeId, pickupLng, pickupLat, nearbyServiceLocationId, nearbyTransportType]);

  const loadRideBids = async (rideId) => {
    const response = await userAuthService.getRideBids(rideId);
    const payload = unwrap(response);
    setRideBids(Array.isArray(payload?.bids) ? payload.bids : []);
    setBiddingSummary((current) => ({
      ...current,
      bookingMode: String(payload?.ride?.bookingMode || current.bookingMode || 'normal'),
      pricingNegotiationMode: String(payload?.ride?.pricingNegotiationMode || current.pricingNegotiationMode || 'none'),
      baseFare: Number(payload?.ride?.baseFare || current.baseFare || routeState.baseFare || 0),
      bidFloorFare: Number(payload?.ride?.bidFloorFare || current.bidFloorFare || routeState.bidFloorFare || routeState.baseFare || 0),
      userMaxBidFare: Number(payload?.ride?.userMaxBidFare || current.userMaxBidFare || routeState.userMaxBidFare || 0),
      bidCeilingMaxFare: Number(payload?.ride?.bidCeilingMaxFare || current.bidCeilingMaxFare || routeState.bidCeilingMaxFare || routeState.userMaxBidFare || 0),
      bidStepAmount: Number(payload?.ride?.bidStepAmount || current.bidStepAmount || routeState.bidStepAmount || 10),
      fareIncreaseWaitMinutes: Number(payload?.ride?.fareIncreaseWaitMinutes || current.fareIncreaseWaitMinutes || 0),
      nextFareIncreaseAt: payload?.ride?.nextFareIncreaseAt || current.nextFareIncreaseAt || null,
    }));
    appendFareHistory(payload?.ride?.userMaxBidFare);
  };

  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);

  useEffect(() => {
    if (!isUserIncrementRide || canIncreaseFare) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [canIncreaseFare, isUserIncrementRide]);

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
        navigate(`${routePrefix}/ride/tracking`, {
          replace: true,
          state: activeRide,
        });
        setRideOtp(activeRide?.otp || '');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, routePrefix, searchNonce]);

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

    if (!searchNonce || !selectedVehicleTypeId) {
      setSearchStatus('Vehicle type missing. Please select a vehicle again.');
      navigate(userHomeRoute, { replace: true });
      return undefined;
    }

    requestStartedRef.current = true;
    let disposed = false;

    const onRideSearchUpdate = ({ matchedDrivers, radius }) => {
      const radiusKm = radius ? (Number(radius) / 1000).toFixed(1) : '';
      setSearchStatus(
        matchedDrivers > 0
          ? `${matchedDrivers} captain${matchedDrivers > 1 ? 's' : ''} notified within ${radiusKm} km - waiting for acceptance`
          : `Searching within ${radiusKm} km`,
      );
    };

    const moveToTracking = ({ acceptedDriver, rideId, rideSnapshot }) => {
      if (disposed) {
        return;
      }

      if (trackingStartedRef.current) {
        return;
      }

      const nextDriver = normalizeDriver(acceptedDriver);
      const nextOtp = String(rideSnapshot?.otp || routeState?.otp || '');
      driverRef.current = nextDriver;
      setDriver(nextDriver);
      setStage(STAGES.ACCEPTED);
      setSearchStatus('Captain accepted your ride.');
      activeRideIdRef.current = String(rideId || activeRideIdRef.current || '');
      trackingStartedRef.current = true;
      saveCurrentRide({
        ...routeState,
        pickup: rideSnapshot?.pickupAddress || routeState.pickup,
        drop: rideSnapshot?.dropAddress || routeState.drop,
        pickupCoords: rideSnapshot?.pickupLocation?.coordinates || routeState.pickupCoords,
        dropCoords: rideSnapshot?.dropLocation?.coordinates || routeState.dropCoords,
        rideId: activeRideIdRef.current,
        otp: nextOtp,
        driver: nextDriver,
        fare: rideSnapshot?.fare || routeState.fare || routeState.baseFare || routeState.vehicle?.price || 0,
        vehicleIconUrl: rideSnapshot?.vehicleIconUrl || routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
        paymentMethod: routeState.paymentMethod || 'Cash',
        status: 'accepted',
      });
      setRideOtp(nextOtp);

      clearTimeout(timerRef.current);
      clearInterval(activeRidePollRef.current);
      timerRef.current = setTimeout(() => {
        navigate(`${routePrefix}/ride/tracking`, {
          replace: true,
          state: buildHistoryState({
            ...routeState,
            pickup: rideSnapshot?.pickupAddress || routeState.pickup,
            drop: rideSnapshot?.dropAddress || routeState.drop,
            pickupCoords: rideSnapshot?.pickupLocation?.coordinates || routeState.pickupCoords,
            dropCoords: rideSnapshot?.dropLocation?.coordinates || routeState.dropCoords,
            rideId: activeRideIdRef.current,
            otp: nextOtp,
            driver: nextDriver,
            fare: rideSnapshot?.fare || routeState.fare || routeState.baseFare || routeState.vehicle?.price || 0,
            vehicleIconUrl: rideSnapshot?.vehicleIconUrl || routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
            paymentMethod: routeState.paymentMethod || 'Cash',
          }),
        });
      }, 2200);
    };

    const onRideAccepted = ({ driver: acceptedDriver, rideId }) => {
      moveToTracking({ acceptedDriver, rideId });
    };

    const onRideBidUpdated = ({ rideId, bid, userMaxBidFare, bidStepAmount, bookingMode }) => {
      if (!rideId || String(rideId) !== String(activeRideIdRef.current || '')) {
        return;
      }

      if (bid) {
        setRideBids((current) => {
          const filtered = current.filter((item) => item.id !== bid.id);
          return [...filtered, bid].sort((first, second) => {
            const fareDelta = Number(first.bidFare || 0) - Number(second.bidFare || 0);
            if (fareDelta !== 0) return fareDelta;
            return new Date(first.createdAt || 0).getTime() - new Date(second.createdAt || 0).getTime();
          });
        });
      }

      setBiddingSummary((current) => ({
        ...current,
        bookingMode: String(bookingMode || current.bookingMode || 'normal'),
        pricingNegotiationMode: String(current.pricingNegotiationMode || 'driver_bid'),
        bidFloorFare: Number(current.bidFloorFare || routeState.bidFloorFare || current.baseFare || 0),
        userMaxBidFare: Number(userMaxBidFare || current.userMaxBidFare || 0),
        bidCeilingMaxFare: Number(current.bidCeilingMaxFare || routeState.bidCeilingMaxFare || userMaxBidFare || 0),
        bidStepAmount: Number(bidStepAmount || current.bidStepAmount || 10),
      }));
      setSearchStatus('Drivers are sending fare offers.');
    };

    const onRideBiddingUpdated = ({ rideId, userMaxBidFare, bidStepAmount, bookingMode, pricingNegotiationMode, baseFare, bidFloorFare, bidCeilingMaxFare, fareIncreaseWaitMinutes, nextFareIncreaseAt, fare }) => {
      if (!rideId || String(rideId) !== String(activeRideIdRef.current || '')) {
        return;
      }

      setBiddingSummary((current) => ({
        ...current,
        bookingMode: String(bookingMode || current.bookingMode || 'normal'),
        pricingNegotiationMode: String(pricingNegotiationMode || current.pricingNegotiationMode || 'none'),
        baseFare: Number(baseFare || current.baseFare || 0),
        bidFloorFare: Number(bidFloorFare || current.bidFloorFare || baseFare || fare || 0),
        userMaxBidFare: Number(userMaxBidFare || fare || current.userMaxBidFare || 0),
        bidCeilingMaxFare: Number(bidCeilingMaxFare || current.bidCeilingMaxFare || userMaxBidFare || fare || 0),
        bidStepAmount: Number(bidStepAmount || current.bidStepAmount || 10),
        fareIncreaseWaitMinutes: Number(fareIncreaseWaitMinutes || current.fareIncreaseWaitMinutes || 0),
        nextFareIncreaseAt: nextFareIncreaseAt || current.nextFareIncreaseAt || null,
      }));
      appendFareHistory(userMaxBidFare || fare);
    };

    const onRideState = (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) {
        return;
      }

      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        moveToTracking({ acceptedDriver: payload.driver, rideId: payload.rideId, rideSnapshot: payload });
      }
    };

    const hydrateAcceptedRide = async () => {
      if (disposed) {
        return null;
      }

      const activeResponse = await api.get('/rides/active/me');
      const activeRide = activeResponse?.data?.data || activeResponse?.data || activeResponse;

      if (!activeRide?.rideId) {
        return null;
      }

      return activeRide;
    };

    const onRideStatusUpdated = async (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) {
        return;
      }

      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        const activeRide = await hydrateAcceptedRide().catch(() => null);
        moveToTracking({
          acceptedDriver: activeRide?.driver || driverRef.current,
          rideId: payload.rideId,
          rideSnapshot: activeRide || payload,
        });
      }
    };

    const onRideCancelled = ({ reason }) => {
      const displayReason = reason === 'No drivers accepted the ride request'
        ? 'No drivers available nearby'
        : (reason || 'No drivers accepted the ride request.');
      setSearchStatus(displayReason);
      setSearchEnded(true);
      setStage(STAGES.SEARCHING);
    };

    const onError = ({ message }) => {
      setSearchStatus(message || 'Could not request ride.');
    };

    socketService.on('rideSearchUpdate', onRideSearchUpdate);
    socketService.on('rideAccepted', onRideAccepted);
    socketService.on('rideBidUpdated', onRideBidUpdated);
    socketService.on('rideBiddingUpdated', onRideBiddingUpdated);
    socketService.on('ride:state', onRideState);
    socketService.on('ride:status:updated', onRideStatusUpdated);
    socketService.on('rideCancelled', onRideCancelled);
    socketService.on('errorMessage', onError);

    cleanupSearchRef.current = () => {
      if (disposed) {
        return;
      }

      disposed = true;
      requestStartedRef.current = false;
      clearTimeout(timerRef.current);
      clearTimeout(activeRidePollStartTimeoutRef.current);
      clearInterval(activeRidePollRef.current);
      activeRidePollStartTimeoutRef.current = null;
      activeRidePollRef.current = null;
      socketService.off('rideSearchUpdate', onRideSearchUpdate);
      socketService.off('rideAccepted', onRideAccepted);
      socketService.off('rideBidUpdated', onRideBidUpdated);
      socketService.off('rideBiddingUpdated', onRideBiddingUpdated);
      socketService.off('ride:state', onRideState);
      socketService.off('ride:status:updated', onRideStatusUpdated);
      socketService.off('rideCancelled', onRideCancelled);
      socketService.off('errorMessage', onError);
    };

    (async () => {
      try {
        let userToken = getLocalUserToken();

        if (!userToken) {
          navigate('/login', { replace: true });
          return;
        }

        if (disposed) {
          return;
        }

        const rideRequestConfig = userToken
          ? {
            headers: {
              Authorization: `Bearer ${userToken}`,
            },
            timeout: 15000,
          }
          : { timeout: 15000 };

        if (!routeState.pickupCoords || !routeState.dropCoords) {
          throw new Error('Pickup and drop locations are missing. Please pick them again.');
        }

        const requestPayload = {
          pickup: routeState.pickupCoords,
          drop: routeState.dropCoords,
          pickupAddress: routeState.pickup || '',
          dropAddress: routeState.drop || '',
          stops: (Array.isArray(routeState.stops) ? routeState.stops : []).map((stop) => String(stop || '').trim()).filter(Boolean),
          fare: routeState.baseFare || routeState.fare || routeState.vehicle?.price || 0,
          estimatedDistanceMeters: routeState.estimatedDistanceMeters || 0,
          estimatedDurationMinutes: routeState.estimatedDurationMinutes || 0,
          vehicleTypeId: selectedVehicleTypeId,
          vehicleTypeIds: selectedVehicleTypeId ? [selectedVehicleTypeId] : [],
          vehicleIconType: routeState.vehicleIconType || routeState.vehicle?.iconType,
          vehicleIconUrl: routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
          paymentMethod: routeState.paymentMethod || 'Cash',
          serviceType: routeState.serviceType || 'ride',
          intercity: routeState.intercity || undefined,
          promo_code: routeState.promo_code || '',
          zone_id: routeState.zone_id || routeState.zoneId || '',
          service_location_id: routeState.service_location_id || routeState.serviceLocationId || '',
          transport_type: routeState.transport_type || routeState.transportType || routeState.vehicle?.transportType || 'taxi',
          bookingMode: routeState.bookingMode || 'normal',
          userMaxBidFare: routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 0,
          bidStepAmount: routeState.bidStepAmount || 10,
          scheduledAt: routeState.scheduledAt || null,
          preferences: Array.isArray(routeState.preferences) ? routeState.preferences : [],
          bookedFor: routeState.bookedFor || null,
        };

        const response = await api.post('/rides', requestPayload, rideRequestConfig);

        if (disposed) {
          return;
        }

        const payload = response?.data || response;
        const ride = payload?.data?.ride || payload?.ride || payload;
        const rideId = ride?._id || ride?.id || payload?.realtime?.rideId;
        const normalizedRideId = String(rideId || '');
        activeRideIdRef.current = normalizedRideId;
        if ((ride?.pricingNegotiationMode || routeState.pricingNegotiationMode || 'none') !== 'none') {
          setBiddingSummary({
            bookingMode: String(ride?.bookingMode || routeState.bookingMode || 'normal'),
            pricingNegotiationMode: String(ride?.pricingNegotiationMode || routeState.pricingNegotiationMode || 'none'),
            baseFare: Number(ride?.baseFare || routeState.baseFare || routeState.fare || 0),
            bidFloorFare: Number(ride?.bidFloorFare || routeState.bidFloorFare || routeState.baseFare || routeState.fare || 0),
            userMaxBidFare: Number(ride?.userMaxBidFare || routeState.userMaxBidFare || routeState.fare || 0),
            bidCeilingMaxFare: Number(ride?.bidCeilingMaxFare || routeState.bidCeilingMaxFare || routeState.userMaxBidFare || routeState.fare || 0),
            bidStepAmount: Number(ride?.bidStepAmount || routeState.bidStepAmount || 10),
            fareIncreaseWaitMinutes: Number(ride?.fareIncreaseWaitMinutes || routeState.fareIncreaseWaitMinutes || 0),
            nextFareIncreaseAt: ride?.nextFareIncreaseAt || routeState.nextFareIncreaseAt || null,
          });
          if ((ride?.pricingNegotiationMode || routeState.pricingNegotiationMode) === 'driver_bid') {
            loadRideBids(rideId).catch(() => { });
          }
          appendFareHistory(ride?.userMaxBidFare || ride?.fare);
        }
        if (isScheduledRide && !isScheduledBiddingRide) {
          scheduleScheduledRideReminders({
            ...ride,
            rideId: normalizedRideId,
            scheduledAt: ride?.scheduledAt || routeState.scheduledAt || null,
            pickupAddress: ride?.pickupAddress || routeState.pickup || '',
            dropAddress: ride?.dropAddress || routeState.drop || '',
            status: ride?.status || 'scheduled',
            liveStatus: ride?.liveStatus || 'scheduled',
          });
          setScheduledStatus('scheduled');
          setSearchStatus('Your ride has been scheduled successfully.');
          return;
        }
        const socket = socketService.connect({ role: 'user', token: userToken });

        if (socket && rideId) {
          socketService.emit('joinRide', { rideId });
          socketService.emit('ride:join', { rideId });
        }

        const pollActiveRide = async () => {
          if (disposed) {
            return;
          }

          try {
            const activeRide = await hydrateAcceptedRide();

            if (disposed || !activeRide?.rideId) {
              return;
            }

            const isThisRide = String(activeRide.rideId || '') === normalizedRideId;
            const isAcceptedRide = ['accepted', 'arriving', 'started', 'ongoing'].includes(String(activeRide.status || activeRide.liveStatus || '').toLowerCase());

            if (isThisRide && isAcceptedRide) {
              moveToTracking({
                acceptedDriver: activeRide.driver || driverRef.current,
                rideId: activeRide.rideId,
                rideSnapshot: activeRide,
              });
            }
          } catch (_error) {
            // Socket remains the primary path; polling is only a race-condition fallback.
          }
        };

        clearInterval(activeRidePollRef.current);
        activeRidePollRef.current = null;
        const startFallbackPolling = () => {
          if (disposed || trackingStartedRef.current) {
            return;
          }

          pollActiveRide();
          activeRidePollRef.current = setInterval(pollActiveRide, SEARCH_FALLBACK_POLL_INTERVAL_MS);
        };
        clearTimeout(activeRidePollStartTimeoutRef.current);
        activeRidePollStartTimeoutRef.current = setTimeout(
          startFallbackPolling,
          SEARCH_FALLBACK_POLL_DELAY_MS,
        );

        if (!disposed) {
          setSearchStatus(
            (ride?.pricingNegotiationMode || routeState.pricingNegotiationMode) === 'driver_bid'
              ? (isScheduledRide ? 'Scheduled ride created. Waiting for driver bids...' : 'Booking created. Waiting for driver bids...')
              : (ride?.pricingNegotiationMode || routeState.pricingNegotiationMode) === 'user_increment_only'
                ? 'Booking created. Notifying nearby drivers at your current fare...'
                : 'Booking created. Notifying nearby drivers...',
          );
        }
      } catch (error) {
        console.error('[searching-driver] Ride creation error:', error);
        const unpaidRide = getUnpaidRideFromError(error);
        if (!disposed && unpaidRide) {
          setSearchStatus(unpaidRide.message);
          setTimeout(() => { if (!disposed) openUnpaidRidePayment(navigate, getAppRoutePath(), unpaidRide); }, 1500);
          return;
        }
        if (!disposed) {
          const errorMessage = error?.response?.data?.message || error?.message || 'Network error or server down';
          const isNoDrivers = errorMessage.toLowerCase().includes('no driver') || errorMessage.toLowerCase().includes('not available');

          if (isScheduledRide && !isScheduledBiddingRide) {
            setScheduledStatus('error');
            setScheduledError(errorMessage);
            setSearchStatus(errorMessage);
            return;
          }
          setSearchStatus(isNoDrivers ? 'No drivers available nearby' : errorMessage);
          if (isNoDrivers) setSearchEnded(true);

          if (!isNoDrivers) {
            setTimeout(() => {
              if (!disposed) navigate(userHomeRoute, { replace: true });
            }, 3000);
          }
        }
      }
    })();

    return () => {
      cleanupDelayRef.current = setTimeout(() => {
        cleanupSearchRef.current?.();
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduledBiddingRide, isScheduledRide, navigate, routePrefix, routeState, searchNonce, selectedVehicleTypeId, userHomeRoute]);

  const handleCancel = useCallback(async () => {
    if (cancellingRef.current) {
      return;
    }

    cancellingRef.current = true;
    clearTimeout(timerRef.current);

    const rideId = activeRideIdRef.current;

    try {
      if (rideId) {
        await api.patch(`/rides/${rideId}/cancel`);
      }
    } catch (_error) {
      // Navigation still proceeds even if the cancel request races with another state update.
    }

    navigate(userHomeRoute, { replace: true });
  }, [navigate, userHomeRoute]);

  // Web: a pushed history guard turned the browser / Android back into the cancel flow while searching.
  useBeforeLeave(() => {
    if (trackingStartedRef.current || cancellingRef.current) {
      return false;
    }
    handleCancel();
    return true;
  }, isSearching && !trackingStartedRef.current);

  const handleAcceptBid = async (bidId) => {
    const rideId = activeRideIdRef.current;
    if (!rideId || !bidId || bidActionLoading) {
      return;
    }

    setBidActionLoading(true);
    try {
      await userAuthService.acceptRideBid(rideId, bidId);
      setSearchStatus('Confirming your selected bid...');
    } catch (error) {
      setSearchStatus(error?.message || 'Could not accept this bid.');
    } finally {
      setBidActionLoading(false);
    }
  };

  const handleIncreaseBid = async () => {
    const rideId = activeRideIdRef.current;
    if (!rideId || bidActionLoading) {
      return;
    }

    setBidActionLoading(true);
    try {
      const response = await userAuthService.increaseRideBidCeiling(rideId, 1);
      const payload = unwrap(response);
      setBiddingSummary((current) => ({
        ...current,
        bookingMode: String(payload?.bookingMode || current.bookingMode || 'bidding'),
        pricingNegotiationMode: String(payload?.pricingNegotiationMode || current.pricingNegotiationMode || 'none'),
        baseFare: Number(payload?.baseFare || current.baseFare || 0),
        bidFloorFare: Number(payload?.bidFloorFare || current.bidFloorFare || payload?.baseFare || 0),
        userMaxBidFare: Number(payload?.userMaxBidFare || payload?.fare || current.userMaxBidFare || 0),
        bidCeilingMaxFare: Number(payload?.bidCeilingMaxFare || current.bidCeilingMaxFare || payload?.userMaxBidFare || payload?.fare || 0),
        bidStepAmount: Number(payload?.bidStepAmount || current.bidStepAmount || 10),
        fareIncreaseWaitMinutes: Number(payload?.fareIncreaseWaitMinutes || current.fareIncreaseWaitMinutes || 0),
        nextFareIncreaseAt: payload?.nextFareIncreaseAt || current.nextFareIncreaseAt || null,
      }));
      appendFareHistory(payload?.userMaxBidFare || payload?.fare);
      setNow(Date.now());
      setSearchStatus(
        (payload?.pricingNegotiationMode || biddingSummary.pricingNegotiationMode) === 'user_increment_only'
          ? 'Raised the fare and resent the request to nearby drivers.'
          : 'Raised your max fare by one step.',
      );
    } catch (error) {
      setSearchStatus(error?.message || 'Could not increase bid ceiling.');
    } finally {
      setBidActionLoading(false);
    }
  };

  const navigateAfterCancel = async (nextState = {}) => {
    const rideId = activeRideIdRef.current;

    try {
      if (rideId) {
        await api.patch(`/rides/${rideId}/cancel`);
      }
    } catch {
      // Navigation should still proceed even if cancellation races with another update.
    }

    navigate(`${routePrefix}/ride/select-vehicle`, {
      replace: true,
      state: buildHistoryState({
        ...routeState,
        ...nextState,
      }),
    });
  };

  const scheduledEntrance = useEntrance({ y: 16 });
  const searchingEntrance = useEntrance({ y: 40, deps: [isSearching] });
  const acceptedEntrance = useEntrance({ y: 60, deps: [isAccepted] });
  const otpEntrance = useEntrance({ x: -20, scale: 0.8, deps: [isAccepted && Boolean(rideOtp)] });

  if (isScheduledRide && !isScheduledBiddingRide) {
    const iconTone = scheduledStatus === 'scheduled'
      ? colors.emerald[600]
      : scheduledStatus === 'error' ? colors.rose[600] : colors.blue[600];
    return (
      <Screen bg={P.bg} style={s.scheduledPage}>
        <Animated.View style={[s.scheduledCard, scheduledEntrance]}>
          <View style={s.scheduledIcon}>
            {scheduledStatus === 'scheduled'
              ? <CheckCircle2 size={26} color={iconTone} />
              : scheduledStatus === 'error'
                ? <AlertTriangle size={26} color={iconTone} />
                : <SpinIcon><LoaderCircle size={26} color={iconTone} /></SpinIcon>}
          </View>
          <Text style={s.scheduledTitle}>
            {scheduledStatus === 'scheduled' ? 'Ride scheduled' : scheduledStatus === 'error' ? 'Scheduling failed' : 'Scheduling your ride'}
          </Text>
          <Text style={s.scheduledText}>
            {scheduledStatus === 'scheduled'
              ? 'Your booking has been saved. Drivers will be notified automatically at the scheduled time.'
              : scheduledStatus === 'error'
                ? (scheduledError || 'Could not schedule this ride.')
                : 'Saving your booking and preparing automatic driver notification.'}
          </Text>
          <View style={s.scheduledBox}>
            <View style={s.rowCenter}>
              <Calendar size={16} color={colors.blue[600]} />
              <Text style={s.scheduledForLabel}>Scheduled For</Text>
            </View>
            <Text style={s.scheduledTime}>{formattedScheduledTime}</Text>
            <View style={s.scheduledRouteRow}>
              <Clock3 size={15} color={P.secondary} style={s.mt2} />
              <Text style={s.scheduledRoute}>{routeState.pickup || 'Pickup'} to {routeState.drop || 'Drop'}</Text>
            </View>
          </View>
          <Pressable onPress={() => navigate(userHomeRoute, { replace: true })} style={s.scheduledButton}>
            <Text style={s.scheduledButtonText}>{scheduledStatus === 'error' ? 'Back to Home' : 'Done'}</Text>
          </Pressable>
        </Animated.View>
      </Screen>
    );
  }

  const topOffset = insets.top + 32;

  return (
    <Screen bg={P.bg} edges={[]}>
      {/* MAP BACKGROUND */}
      <View style={StyleSheet.absoluteFill}>
        {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
          <AppMap
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={regionFor(pickupPos, 15)}
            customMapStyle={MAP_STYLE}
            onMapReady={reprojectRadar}
            onMapLoaded={reprojectRadar}
            onRegionChange={reprojectRadar}
            onRegionChangeComplete={reprojectRadar}
            onLayout={reprojectRadar}
          >
            <PinLocationMarker position={pickupPos} title="Pickup" color="#000000" zIndex={100} />

            {dropPos && (
              <PinLocationMarker position={dropPos} title="Drop" color="#f97316" />
            )}

            {isSearching && nearbyDrivers.map((nearbyDriver, index) => (
              <NearbyDriverMarker
                key={String(nearbyDriver.id || nearbyDriver._id || index)}
                driver={nearbyDriver}
                iconUrl={availableVehicleIcon}
              />
            ))}

            {dropLatLng && (
              <Polyline coordinates={[pickupLatLng, dropLatLng]} strokeColor={alpha('#0f172a', 0.2)} strokeWidth={4} />
            )}
            {dropLatLng && (
              <Polyline coordinates={[pickupLatLng, dropLatLng]} strokeColor="#0f172a" strokeWidth={4} lineDashPattern={[4, 6]} />
            )}
          </AppMap>
        ) : (
          <View style={s.mapFallback} />
        )}

        {isSearching && HAS_VALID_GOOGLE_MAPS_KEY && isLoaded && <SearchRadar point={radarPoint} />}

        <View style={[s.routeCard, { top: topOffset }]}>
          <Text style={s.routeLabel}>Current Route</Text>
          <Text style={s.routeText} numberOfLines={1}>{routeState.pickup || 'Pickup'} → {routeState.drop || 'Drop'}</Text>
        </View>

        {isAccepted && rideOtp ? (
          <Animated.View style={[s.otpCard, { top: insets.top + 88 }, otpEntrance]}>
            <Text style={s.otpValue}>{rideOtp}</Text>
            <Text style={s.otpLabel} numberOfLines={1}>Start OTP</Text>
          </Animated.View>
        ) : null}

        {(isSearching || isAccepted) && (
          <ScalePressable scaleTo={0.9} onPress={() => setShowCancelConfirm(true)} style={[s.closeButton, { top: topOffset }]}>
            <X size={16} color={P.text} strokeWidth={2.5} />
          </ScalePressable>
        )}
      </View>

      {/* Bottom card */}
      <View style={[s.bottomArea, { bottom: insets.bottom + 32 }]}>
        {/* Searching */}
        {isSearching && (
          <Animated.View style={[s.searchCard, searchingEntrance]}>
            <View style={s.handle} />

            <View style={s.searchHeading}>
              <Text style={s.searchTitle}>{searchEnded ? 'No drivers found' : 'Finding your ride'}</Text>
              <Text style={s.searchStatus}>{searchStatus}</Text>
            </View>

            <View style={s.dotsRow}>
              {[0, 1, 2, 3].map((i) => <SearchDot key={i} index={i} />)}
            </View>

            {isBiddingRide && (
              <View style={[s.offerBox, { borderColor: colors.orange[100] }]}>
                <View style={s.offerHead}>
                  <View style={s.flex1}>
                    <Text style={[s.offerKicker, { color: P.accent }]}>Bid Mode</Text>
                    <Text style={s.offerText}>Drivers can bid from {formatCurrency(biddingSummary.bidFloorFare || biddingSummary.baseFare)} up to {formatCurrency(biddingSummary.userMaxBidFare)}.</Text>
                  </View>
                  <Pressable disabled={bidActionLoading} onPress={handleIncreaseBid} style={[s.stepButton, bidActionLoading && s.disabled60]}>
                    <Text style={s.stepButtonText}>+{formatCurrency(biddingSummary.bidStepAmount)}</Text>
                  </Pressable>
                </View>
                <View style={s.gap2}>
                  {rideBids.length ? rideBids.map((bid) => (
                    <View key={bid.id} style={s.bidRow}>
                      <View style={s.minW0}>
                        <Text style={s.bidName} numberOfLines={1}>{bid.driver?.name || 'Driver'}</Text>
                        <Text style={s.bidSub} numberOfLines={1}>{bid.driver?.vehicleNumber || bid.driver?.vehicleType || 'Ride offer'}</Text>
                      </View>
                      <View style={s.bidRight}>
                        <Text style={s.bidFare}>{formatCurrency(bid.bidFare)}</Text>
                        <Pressable disabled={bidActionLoading} onPress={() => handleAcceptBid(bid.id)} style={[s.acceptButton, bidActionLoading && s.disabled60]}>
                          <Text style={s.acceptButtonText}>Accept</Text>
                        </Pressable>
                      </View>
                    </View>
                  )) : (
                    <View style={s.noBids}>
                      <Text style={s.noBidsText}>{"No bids yet. We're still reaching nearby drivers."}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {isUserIncrementRide && (
              <View style={[s.offerBox, { borderColor: colors.blue[100] }]}>
                <View style={s.offerHead}>
                  <View style={s.flex1}>
                    <Text style={[s.offerKicker, { color: colors.blue[600] }]}>Current Offer</Text>
                    <Text style={s.offerFare}>{formatCurrency(biddingSummary.userMaxBidFare)}</Text>
                  </View>
                  <Pressable disabled={bidActionLoading || !canIncreaseFare} onPress={handleIncreaseBid} style={[s.stepButton, (bidActionLoading || !canIncreaseFare) && s.disabled60]}>
                    <Text style={s.stepButtonText}>+{formatCurrency(biddingSummary.bidStepAmount)}</Text>
                  </Pressable>
                </View>
                <View style={[s.infoBox, { borderColor: colors.blue[100] }]}>
                  <Text style={s.infoText}>
                    {canIncreaseFare ? 'You can increase the fare now and rebroadcast the request.' : fareIncreaseCountdownLabel}
                  </Text>
                </View>
                {fareHistory.length > 0 && (
                  <View style={[s.infoBox, { borderColor: alpha(colors.blue[100], 0.8) }]}>
                    <Text style={s.historyLabel}>Fare History</Text>
                    <Text style={s.historyText}>{fareHistory.map((fare) => formatCurrency(fare)).join(' -> ')}</Text>
                  </View>
                )}
                <View style={s.twoCols}>
                  <Pressable onPress={() => navigateAfterCancel()} style={s.altButton}>
                    <Text style={s.altButtonText}>Try Another Vehicle</Text>
                  </Pressable>
                  <Pressable onPress={() => navigateAfterCancel({ rideMode: 'schedule' })} style={s.scheduleButton}>
                    <Text style={s.scheduleButtonText}>Schedule Instead</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={s.featureRow}>
              <View style={s.featureItem}>
                <View style={s.featureDotWrap}>
                  <PulseDot style={s.featureDot} />
                </View>
                <Text style={s.featureText}>Fast Matching</Text>
              </View>
              <View style={s.featureDivider} />
              <View style={s.featureItem}>
                <ShieldCheck size={20} color={colors.blue[500]} strokeWidth={2.5} />
                <Text style={s.featureText}>Top Safety</Text>
              </View>
            </View>

            {searchEnded ? (
              <View style={s.endedGrid}>
                <ScalePressable onPress={() => navigate(-1)} style={[s.endedButton, { backgroundColor: P.accent }]}>
                  <Text style={[s.endedButtonText, { color: P.ink }]}>Try again</Text>
                </ScalePressable>
                <ScalePressable onPress={() => navigate(userHomeRoute, { replace: true })} style={[s.endedButton, { backgroundColor: P.soft }]}>
                  <Text style={[s.endedButtonText, { color: P.secondary }]}>Back to home</Text>
                </ScalePressable>
              </View>
            ) : (
              <ScalePressable onPress={() => setShowCancelConfirm(true)} style={s.cancelSearch}>
                <Text style={s.cancelSearchText}>Cancel Search</Text>
              </ScalePressable>
            )}
          </Animated.View>
        )}

        {/* Accepted - Ride Confirmed Premium Card */}
        {isAccepted && (
          <Animated.View style={acceptedEntrance}>
            <View style={s.acceptedCard}>
              {/* Status Bar */}
              <View style={s.confirmedBar}>
                <View style={s.confirmedIcon}>
                  <CheckCircle2 size={12} color={P.text} strokeWidth={3} />
                </View>
                <Text style={s.confirmedText}>Captain confirmed</Text>
              </View>

              <View style={s.acceptedBody}>
                <View style={s.acceptedTop}>
                  <View style={s.flexShrink}>
                    {/* Driver Name and Rating */}
                    <View style={s.nameRow}>
                      <Text style={s.driverName}>{driver.name || 'Vishal K.'}</Text>
                      <View style={s.ratingPill}>
                        <Star size={10} color={P.accent} fill={colors.yellow[500]} />
                        <Text style={s.ratingText}>{driver.rating || 'New'}</Text>
                      </View>
                    </View>

                    <Text style={s.plate}>{driver.plate || 'MP13ZL3184'}</Text>

                    {/* Vehicle Details Pill */}
                    <View style={s.vehiclePill}>
                      <Text style={s.vehiclePillText}>
                        {[driver.vehicleColor, driver.vehicleMake, driver.vehicleModel, driver.vehicleType || 'Taxi'].filter(Boolean).join(' ') || 'White Dzire Taxi'}
                      </Text>
                    </View>
                  </View>

                  {/* Premium Overlaid Avatars */}
                  <View style={s.avatars}>
                    <View style={s.vehicleBox}>
                      <AppImage src={availableVehicleIcon || CarIcon} fallback={CarIcon} style={s.vehicleBoxIcon} contentFit="contain" tintColor="#ffffff" />
                    </View>
                    <View style={s.avatarCircle}>
                      <AppImage
                        src={`https://ui-avatars.com/api/?name=${(driver.name || 'VK').replace(' ', '+')}&background=cbd5e1&color=0f172a`}
                        style={s.fill}
                        contentFit="cover"
                      />
                    </View>
                  </View>
                </View>

                {/* High Density Actions */}
                <View style={s.actionsGrid}>
                  <ScalePressable scaleTo={0.96} onPress={() => Linking.openURL(`tel:${driver.phone}`).catch(() => {})} style={s.callButton}>
                    <Phone size={18} color={P.text} strokeWidth={2.5} />
                    <Text style={s.actionText}>Call</Text>
                  </ScalePressable>
                  <ScalePressable
                    scaleTo={0.96}
                    onPress={() => navigate(`${routePrefix}/ride/chat`, { state: buildHistoryState({ driver }) })}
                    style={s.chatButton}
                  >
                    <ChatUnreadBadge count={chatUnread} />
                    <MessageCircle size={18} color={P.text} strokeWidth={2.5} />
                    <Text style={s.actionText}>Chat</Text>
                  </ScalePressable>
                </View>
              </View>
            </View>

            {/* Status Indicator */}
            <View style={s.arrivingRow}>
              <PingDot />
              <Text style={s.arrivingText}>Captain is arriving</Text>
            </View>
          </Animated.View>
        )}
      </View>

      <Dialog open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} style={s.dialog}>
        <View style={s.dialogIcon}>
          <AlertTriangle size={26} color={colors.red[400]} strokeWidth={2} />
        </View>
        <Text style={s.dialogTitle}>Cancel ride?</Text>
        <Text style={s.dialogText}>{"We're still searching. Stop looking?"}</Text>
        <CancellationFeeNotice rideId={activeRideIdRef.current} />
        <View style={s.dialogButtons}>
          <ScalePressable scaleTo={0.97} onPress={handleCancel} style={s.dialogConfirm}>
            <Text style={s.dialogConfirmText}>Yes, Cancel</Text>
          </ScalePressable>
          <Pressable onPress={() => setShowCancelConfirm(false)} style={s.dialogKeep}>
            <Text style={s.dialogKeepText}>{isSearching ? 'Keep Searching' : 'Go Back'}</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
};

// Taxi customer palette (Taxi/index.css --user-* variables, light / dark). The `.user-app-theme` overrides map the
// screen's Tailwind classes onto it: bg-white / bg-slate-50 / bg-slate-950 -> card, tinted 50/100 backgrounds -> card-soft,
// text-slate-900 / text-white -> text, text-slate-400/600/700 -> secondary, text-slate-500 -> muted, light borders ->
// border, text-orange-500 / text-yellow-500 -> accent, button.bg-slate-900 -> accent button; font-black -> 700, bold -> 600.
const taxiPalette = (t) => (t.dark
  ? { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', secondary: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)', accent: '#FFC400', ink: '#0B1220' }
  : { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', secondary: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)', accent: '#FFC400', ink: '#0B1220' });

const themeShadow = { elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const styles = StyleSheet.create({
  pinWrap: { alignItems: 'center' },
  pinHead: { borderWidth: 2, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  pinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: alpha('#ffffff', 0.9) },
  nearbyWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nearbyPulse: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.emerald[400], 0.25), opacity: 0.5 },
  nearbyBadge: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#ffffff', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.28, shadowRadius: 7, shadowOffset: { width: 0, height: 6 },
  },
  nearbyIcon: { width: 24, height: 24 },
  nearbyOnline: { position: 'absolute', right: -2, top: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#ffffff', backgroundColor: colors.emerald[500] },
  radar: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  radarRing: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: alpha(colors.orange[400], 0.4), backgroundColor: alpha(colors.orange[400], 0.05),
  },
  radarSweep: { position: 'absolute', width: 320, height: 320, borderRadius: 160, overflow: 'hidden' },
  searchDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  searchDotOrange: { borderRadius: 5, backgroundColor: '#f97316' },
  pingWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  pingHalo: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald[400] },
  pingCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald[500] },
});

const useStyles = makeStyles((t) => {
  const P = taxiPalette(t);
  return {
    flex1: { flex: 1 },
    flexShrink: { flexShrink: 1, gap: 4 },
    minW0: { flex: 1, minWidth: 0 },
    fill: { width: '100%', height: '100%' },
    mt2: { marginTop: 2 },
    gap2: { gap: sp(2) },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    disabled60: { opacity: 0.6 },
    mapFallback: { flex: 1, backgroundColor: P.card },

    // scheduled
    scheduledPage: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(6) },
    scheduledCard: {
      width: '100%', borderRadius: 32, paddingHorizontal: sp(6), paddingVertical: sp(8), alignItems: 'center',
      backgroundColor: P.card, borderWidth: 1, borderColor: P.border,
      ...(t.dark
        ? { elevation: 6, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }
        : { elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }),
    },
    scheduledIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: P.soft },
    scheduledTitle: { marginTop: sp(5), fontSize: 22, lineHeight: 33, fontWeight: '700', color: P.text, textAlign: 'center' },
    scheduledText: { marginTop: sp(2), fontSize: 13, lineHeight: 19.5, fontWeight: '600', color: P.secondary, textAlign: 'center' },
    scheduledBox: { alignSelf: 'stretch', marginTop: sp(6), borderRadius: 24, paddingHorizontal: sp(4), paddingVertical: sp(4), backgroundColor: P.soft, borderWidth: 1, borderColor: P.border },
    scheduledForLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: P.text },
    scheduledTime: { marginTop: sp(2), fontSize: 18, lineHeight: 28, fontWeight: '700', color: P.text },
    scheduledRouteRow: { marginTop: sp(4), flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) },
    scheduledRoute: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: '600', color: P.secondary },
    scheduledButton: { alignSelf: 'stretch', marginTop: sp(6), height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: P.accent },
    scheduledButtonText: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 14 * 0.16, color: P.ink },

    // map overlays
    routeCard: {
      position: 'absolute', left: sp(4), right: sp(16), zIndex: 20, backgroundColor: P.card, borderRadius: 16, paddingHorizontal: sp(5), paddingVertical: sp(3),
      borderWidth: 1, borderColor: P.border, elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    },
    routeLabel: { fontSize: 10.5, lineHeight: 10.5, fontWeight: '600', color: P.secondary, textTransform: 'uppercase', letterSpacing: 1.05, marginBottom: 4 },
    routeText: { fontSize: 13, lineHeight: 16.25, fontWeight: '700', color: P.text },
    otpCard: {
      position: 'absolute', left: sp(4), zIndex: 20, backgroundColor: P.card, borderRadius: 12, padding: sp(3), minWidth: 70, borderWidth: 1, borderColor: P.border,
      elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    },
    otpValue: { fontSize: 18, lineHeight: 22.5, fontWeight: '700', color: '#1d4ed8', textAlign: 'center', letterSpacing: 0.9 },
    otpLabel: { marginTop: 2, fontSize: 10, lineHeight: 15, fontWeight: '600', color: P.secondary, textAlign: 'center' },
    closeButton: {
      position: 'absolute', right: sp(4), zIndex: 20, width: 40, height: 40, borderRadius: 12, backgroundColor: P.card, borderWidth: 1, borderColor: P.border,
      alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.1, shadowRadius: 7, shadowOffset: { width: 0, height: 4 },
    },

    // bottom card
    bottomArea: { position: 'absolute', left: sp(4), right: sp(4), zIndex: 20 },
    searchCard: {
      borderRadius: 32, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: sp(6), paddingTop: sp(3), paddingBottom: sp(6), gap: sp(5),
      elevation: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 25, shadowOffset: { width: 0, height: 20 },
    },
    handle: { width: 40, height: 6, borderRadius: 3, backgroundColor: P.soft, alignSelf: 'center' },
    searchHeading: { alignItems: 'center', gap: sp(1.5) },
    searchTitle: { fontSize: 22, lineHeight: 33, fontWeight: '700', color: P.text, letterSpacing: -0.55, textAlign: 'center' },
    searchStatus: { maxWidth: 260, fontSize: 13, lineHeight: 19.5, fontWeight: '600', color: P.secondary, textAlign: 'center' },
    dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: sp(2.5), paddingVertical: sp(1) },
    offerBox: { borderRadius: 24, borderWidth: 1, backgroundColor: P.soft, padding: sp(4), gap: sp(3) },
    offerHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) },
    offerKicker: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6 },
    offerText: { marginTop: sp(1), fontSize: 13, lineHeight: 19.5, fontWeight: '600', color: P.text },
    offerFare: { marginTop: sp(1), fontSize: 18, lineHeight: 27, fontWeight: '700', color: P.text },
    stepButton: { flexShrink: 0, borderRadius: 999, backgroundColor: P.card, paddingHorizontal: sp(3), paddingVertical: sp(2) },
    stepButtonText: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6, color: P.text },
    bidRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(3), borderRadius: 18, backgroundColor: P.card,
      paddingHorizontal: sp(3), paddingVertical: sp(3), borderWidth: 1, borderColor: colors.orange[100],
    },
    bidName: { fontSize: 13, lineHeight: 19.5, fontWeight: '700', color: P.text },
    bidSub: { fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.muted },
    bidRight: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
    bidFare: { fontSize: 15, lineHeight: 22.5, fontWeight: '700', color: P.text },
    acceptButton: { borderRadius: 999, backgroundColor: colors.emerald[500], paddingHorizontal: sp(3), paddingVertical: sp(2) },
    acceptButtonText: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6, color: P.text },
    noBids: { borderRadius: 18, backgroundColor: P.card, paddingHorizontal: sp(3), paddingVertical: sp(3), borderWidth: 1, borderColor: colors.orange[100] },
    noBidsText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: P.secondary },
    infoBox: { borderRadius: 18, borderWidth: 1, backgroundColor: P.card, paddingHorizontal: sp(3), paddingVertical: sp(3) },
    infoText: { fontSize: 11, lineHeight: 16.5, fontWeight: '700', color: P.secondary },
    historyLabel: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6, color: P.secondary },
    historyText: { marginTop: sp(2), fontSize: 12, lineHeight: 18, fontWeight: '700', color: P.text },
    twoCols: { flexDirection: 'row', gap: sp(2) },
    altButton: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: sp(3), paddingVertical: sp(3), alignItems: 'center', justifyContent: 'center' },
    altButtonText: { fontSize: 11, lineHeight: 16.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.32, color: P.secondary, textAlign: 'center' },
    scheduleButton: {
      flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.blue[200], backgroundColor: alpha(colors.blue[100], 0.7), paddingHorizontal: sp(3), paddingVertical: sp(3),
      alignItems: 'center', justifyContent: 'center',
    },
    scheduleButtonText: { fontSize: 11, lineHeight: 16.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.32, color: colors.blue[700], textAlign: 'center' },
    featureRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(5), paddingVertical: sp(4), borderRadius: 24,
      backgroundColor: P.soft, borderWidth: 1, borderColor: P.border,
    },
    featureItem: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    featureDotWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: P.soft, alignItems: 'center', justifyContent: 'center' },
    featureDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald[500] },
    featureText: { fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.secondary, textTransform: 'uppercase', letterSpacing: 0.55 },
    featureDivider: { width: 1, height: 32, backgroundColor: P.soft },
    endedGrid: { flexDirection: 'row', gap: sp(3) },
    endedButton: { flex: 1, paddingVertical: sp(4), borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    endedButtonText: { fontSize: 13, lineHeight: 19.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.04 },
    cancelSearch: { paddingVertical: 18, borderRadius: 22, backgroundColor: P.soft, borderWidth: 1, borderColor: alpha(colors.red[100], 0.5), alignItems: 'center', justifyContent: 'center' },
    cancelSearchText: { fontSize: 13, lineHeight: 19.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.3, color: colors.red[500] },

    // accepted
    acceptedCard: {
      overflow: 'hidden', borderRadius: 32, backgroundColor: P.card, borderWidth: 1, borderColor: P.border,
      elevation: 14, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 32, shadowOffset: { width: 0, height: 24 },
    },
    confirmedBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2.5), backgroundColor: P.soft, paddingVertical: sp(4),
      borderBottomWidth: 1, borderBottomColor: alpha(colors.emerald[100], 0.5),
    },
    confirmedIcon: {
      width: 20, height: 20, borderRadius: 10, backgroundColor: colors.emerald[500], alignItems: 'center', justifyContent: 'center',
      elevation: 3, shadowColor: '#10b981', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    },
    confirmedText: { fontSize: 14, lineHeight: 21, fontWeight: '700', color: colors.emerald[700], textTransform: 'uppercase', letterSpacing: 0.7 },
    acceptedBody: { padding: sp(6) },
    acceptedTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginBottom: 4 },
    driverName: { fontSize: 14, lineHeight: 21, fontWeight: '700', color: P.secondary, textTransform: 'uppercase', letterSpacing: 1.4 },
    ratingPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: alpha(colors.yellow[400], 0.1), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
      borderWidth: 1, borderColor: alpha(colors.yellow[400], 0.2),
    },
    ratingText: { fontSize: 11, lineHeight: 16.5, fontWeight: '700', color: colors.yellow[700] },
    plate: { fontSize: 28, lineHeight: 28, fontWeight: '700', letterSpacing: -1.4, color: P.text, marginBottom: sp(4), textTransform: 'uppercase' },
    vehiclePill: {
      alignSelf: 'flex-start', paddingHorizontal: sp(3), paddingVertical: sp(1), borderRadius: 999, backgroundColor: P.soft, borderWidth: 1, borderColor: alpha(colors.slate[200], 0.5),
    },
    vehiclePillText: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: P.secondary },
    avatars: { width: 96, height: 80, flexShrink: 0 },
    vehicleBox: {
      position: 'absolute', right: 0, top: 0, width: 80, height: 80, borderRadius: 24, backgroundColor: '#1d2333', borderWidth: 4, borderColor: P.border,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...themeShadow,
    },
    vehicleBoxIcon: { width: 48, height: 48, opacity: 0.9 },
    avatarCircle: {
      position: 'absolute', left: -8, bottom: 0, width: 64, height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 4, borderColor: P.border,
      backgroundColor: P.soft, ...themeShadow,
    },
    actionsGrid: { marginTop: sp(7), flexDirection: 'row', gap: sp(4) },
    callButton: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(3), borderRadius: 22, backgroundColor: P.card, paddingVertical: 18,
      borderWidth: 1, borderColor: alpha(colors.slate[200], 0.6),
    },
    chatButton: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(3), borderRadius: 22, backgroundColor: P.card, paddingVertical: 18,
      elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 12 },
    },
    actionText: { fontSize: 13, lineHeight: 13, fontWeight: '700', color: P.text, textTransform: 'uppercase', letterSpacing: 1.3 },
    arrivingRow: { marginTop: sp(5), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2.5) },
    arrivingText: { fontSize: 12, lineHeight: 12, fontWeight: '700', color: P.secondary, textTransform: 'uppercase', letterSpacing: 2.4 },

    // cancel dialog
    dialog: { width: '82%', maxWidth: 384, borderRadius: 28, padding: sp(7), backgroundColor: P.card, alignItems: 'stretch', ...themeShadow },
    dialogIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: P.soft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: sp(4) },
    dialogTitle: { fontSize: 18, lineHeight: 27, fontWeight: '600', color: P.text, marginBottom: 6, textAlign: 'center' },
    dialogText: { fontSize: 13, lineHeight: 21, fontWeight: '600', color: P.secondary, marginBottom: sp(4), textAlign: 'center' },
    dialogButtons: { gap: sp(2.5) },
    dialogConfirm: { width: '100%', backgroundColor: P.accent, paddingVertical: sp(3.5), borderRadius: 16, alignItems: 'center' },
    dialogConfirmText: { fontSize: 13, lineHeight: 19.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.3, color: P.ink },
    dialogKeep: { width: '100%', paddingVertical: sp(3.5), alignItems: 'center' },
    dialogKeepText: { fontSize: 13, lineHeight: 19.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.3, color: P.secondary },
  };
});

export default SearchingDriver;
