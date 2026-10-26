// Web: pages/DriverHome.jsx — Taxi Home of the captain (/taxi/driver/home, /dashboard): full-screen map with the
// vehicle marker, the floating blue header (scheduled rides, notifications, wallet balance), the Online / Offline
// toggle (wallet / documents / vehicle approval / daily selfie checks), wallet notices, today's summary card, the ride
// request popup with its alert sound, the socket listeners (requests, bids, wallet updates, reconnect recovery), the
// 10 s location updates while online, active-trip restore and the scheduled-rides sheet.
// Native:
// - A kept-alive bottom-bar tab (DriverTabKeepAlive): everything the web did while mounted (socket listeners, timers,
//   polling, alert sound, popups, focus / visibility listeners, the back-button guard) runs only while
//   useDriverTabActive() is true; the data loaded on mount loads again when the tab becomes active. The duty state, map
//   and data stay while the tab is hidden.
// - Online: the "You are online" background location service (@/lib/driverLocation) runs while the driver is online
//   (started / stopped from the duty state, also when it is restored from the cache or the server).
// - The web's history.pushState / popstate trap (Back never leaves Home) is an Android BackHandler while Home is on screen.
// - Map: react-native-maps (AppMap) with the same style; the web's persistent map / marker are not needed (the tab
//   stays mounted). Popups are Dialog / Sheet (native Modal) so they cover the floating bottom bar.
// - Daily selfie: the web's in-page camera preview (getUserMedia + Capture) is the phone's front camera
//   (expo-image-picker), shrunk like the web (1280 px, JPEG 0.82) and sent as the same base64 data URL.
// - The web's "unlock the alert sound on the first tap" is unlockRideRequestAlertSound() once on mount.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Alert,
    Animated,
    BackHandler,
    Dimensions,
    Easing,
    Image,
    LayoutAnimation,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { shrinkImage } from '@/lib/media';
import {
    Bell,
    CalendarClock,
    Camera,
    Navigation,
    Wallet,
    Clock,
    Power,
    Target,
    IndianRupee,
    ChevronRight,
    BarChart2,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Dialog, Sheet, Skeleton, Text, resolveImageSource } from '@/native/ui';
import { AppMap, Marker, regionFor } from '@/native/ui/AppMap';
import { useSplashDone } from '@/native/splashState';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { startOnlineLocationUpdates, stopOnlineLocationUpdates } from '@/lib/driverLocation';
import { alpha, colors } from '@/theme';

import DriverTopBar from '../../shared/components/DriverTopBar';
import { decodeJwtPayload } from '../../shared/chat/chatIdentity';
import IncomingRideRequest from './IncomingRideRequest';
import api from '../../../shared/api/axiosInstance';
import { uploadService } from '../../../shared/services/uploadService';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';
import { useDriverTabActive } from '../driverTabPages';

// Vehicle Icons for Map
import BikeIcon from '../../../assets/icons/bike.png';
import CarIcon from '../../../assets/icons/car.png';
import AutoIcon from '../../../assets/icons/auto.png';
import TruckIcon from '../../../assets/icons/truck.png';
import EhcvIcon from '../../../assets/icons/ehcv.png';
import HcvIcon from '../../../assets/icons/hcv.png';
import LcvIcon from '../../../assets/icons/LCV.png';
import McvIcon from '../../../assets/icons/mcv.png';
import LuxuryIcon from '../../../assets/icons/Luxury.png';
import PremiumIcon from '../../../assets/icons/Premium.png';
import SuvIcon from '../../../assets/icons/SUV.png';

import { socketService } from '../../../shared/api/socket';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { cancelDriverScheduledRide, getCurrentDriver, getDriverDocumentTemplates, getDriverNotifications, getDriverScheduledRides, getLocalDriverToken } from '../services/registrationService';
import { addLocalDriverNotification, getUnreadDriverNotificationCount, getVisibleDriverNotifications } from '../utils/notificationState';
import { getScheduledRideCountdown } from '../utils/scheduledRideTime';
import {
    playRideRequestAlertSound,
    stopRideRequestAlertSound,
    unlockRideRequestAlertSound,
} from '../utils/rideRequestAlertSound';

const DEFAULT_MAP_CENTER = {
    lat: 22.7196,
    lng: 75.8577,
};

const DEFAULT_MAP_COORDS = [75.8577, 22.7196];
const ONLINE_LOCATION_EMIT_MIN_DISTANCE_METERS = 25;
const ONLINE_LOCATION_EMIT_MIN_INTERVAL_MS = 12000;

const getGeoLocationErrorMessage = (error, { purpose = 'generic' } = {}) => {
    const code = Number(error?.code);

    if (code === 1) {
        return purpose === 'online'
            ? 'Please allow location permission to go online.'
            : 'Live location updates are paused. Please allow location permission.';
    }

    if (code === 2) {
        return 'Could not detect your current location.';
    }

    if (code === 3) {
        return purpose === 'online'
            ? 'Timed out while fetching your location. Please try again.'
            : 'Live location refresh timed out.';
    }

    return purpose === 'online'
        ? 'Could not fetch your location to go online.'
        : 'Could not update live location.';
};

const getCurrentCoords = ({ purpose = 'generic' } = {}) => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
        reject(new Error('Location is not available on this device.'));
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
        (error) => reject(new Error(getGeoLocationErrorMessage(error, { purpose }))),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 },
    );
});

const toLatLng = (coordinates) => {
    const [lng, lat] = coordinates || [];

    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        return DEFAULT_MAP_CENTER;
    }

    return { lat: Number(lat), lng: Number(lng) };
};

const toMapCoordinate = (position) => ({ latitude: position.lat, longitude: position.lng });

const getMapIconForVehicle = (iconType = '') => {
    const raw = String(iconType || '').trim();
    if (/^(https?:|data:image\/|blob:)/.test(raw)) {
        return raw;
    }
    // Root-level files like `/4_Taxi.png` are served from the frontend's public/ folder.
    if (/^\/[^/]+\.(png|jpe?g|svg|webp|gif)$/i.test(raw)) {
        return raw;
    }
    if (raw.startsWith('/')) {
        return `${BACKEND_ORIGIN}${raw}`;
    }
    if (/^(uploads\/|images\/)/.test(raw)) {
        return `${BACKEND_ORIGIN}/${raw}`;
    }

    const value = raw.toLowerCase();

    if (value.includes('bike')) return BikeIcon;
    if (value.includes('auto')) return AutoIcon;
    if (value.includes('ehc')) return EhcvIcon;
    if (value.includes('hcv')) return HcvIcon;
    if (value.includes('lcv')) return LcvIcon;
    if (value.includes('mcv')) return McvIcon;
    if (value.includes('truck')) return TruckIcon;
    if (value.includes('lux')) return LuxuryIcon;
    if (value.includes('premium')) return PremiumIcon;
    if (value.includes('suv')) return SuvIcon;

    return CarIcon;
};

const formatPoint = (point, fallback) => {
    const [lng, lat] = point?.coordinates || [];

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
    }

    return fallback;
};

const formatScheduledDateTime = (value) => {
    if (!value) {
        return 'Schedule time not available';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Schedule time not available';
    }

    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatDistanceLabel = (meters) => {
    const value = Number(meters || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return 'Nearby';
    }

    if (value < 1000) {
        return `${Math.round(value)} m`;
    }

    return `${(value / 1000).toFixed(1)} km`;
};

const formatFareLabel = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        return 'Rs 0';
    }

    return `Rs ${amount}`;
};

const normalizeTodaySummary = (value = {}) => ({
    dateKey: String(value?.dateKey || ''),
    earnings: Number(value?.earnings || 0),
    distanceMeters: Number(value?.distanceMeters || 0),
    rides: Number(value?.rides || 0),
    activeSeconds: Math.max(0, Math.round(Number(value?.activeSeconds || 0))),
});

// Paise are shown when the amount has them (₹152.50), whole rupees stay short (₹150).
const formatSummaryMoney = (value) => {
    const amount = Math.round(Number(value || 0) * 100) / 100;
    const hasPaise = Math.abs(amount % 1) > 0;
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: hasPaise ? 2 : 0, maximumFractionDigits: 2 })}`;
};

const formatSummaryDistance = (meters) => {
    const value = Number(meters || 0);

    if (!Number.isFinite(value) || value <= 0) {
        return '0 km';
    }

    const km = value / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
};

const isOwnerManagedDriverProfile = (driver = {}) => {
    const accountType = String(
        driver?.accountType
        || driver?.onboarding?.accountType
        || driver?.onboarding?.role
        || driver?.role
        || '',
    ).toLowerCase();

    return Boolean(
        driver?.owner_id
        || driver?.ownerId
        || driver?.fleet_id
        || driver?.fleetId
        || driver?.owner?._id
        || driver?.onboarding?.owner_id
        || ['fleet_driver', 'fleet_drivers'].includes(accountType),
    );
};

const getWalletAlertState = (wallet = {}, { ignoreRestrictions = false } = {}) => {
    const balance = Number(wallet.balance || 0);
    const cashLimit = Math.max(0, Number(wallet.cashLimit || 0));
    const minimumBalanceForOrders = Number(wallet.minimumBalanceForOrders || 0);
    const cashLimitUsed = Math.max(0, balance < 0 ? Math.abs(balance) : 0);
    const remainingCashLimit = Math.max(0, cashLimit - cashLimitUsed);
    const warningThreshold = cashLimit > 0
        ? Math.min(cashLimit, Math.max(50, cashLimit * 0.15))
        : 0;
    const belowMinimumBalance = balance < minimumBalanceForOrders;
    const cashLimitExceeded = cashLimit > 0 && remainingCashLimit <= 0;
    const rawBlocked = Boolean(wallet.isBlocked) || belowMinimumBalance || cashLimitExceeded;
    const isBlocked = ignoreRestrictions ? false : rawBlocked;
    const isWarning = ignoreRestrictions ? false : (!isBlocked && cashLimitUsed > 0 && remainingCashLimit <= warningThreshold);

    return {
        balance,
        cashLimit,
        minimumBalanceForOrders,
        cashLimitUsed,
        remainingCashLimit,
        warningThreshold,
        belowMinimumBalance: ignoreRestrictions ? false : belowMinimumBalance,
        cashLimitExceeded: ignoreRestrictions ? false : cashLimitExceeded,
        isBlocked,
        isWarning,
    };
};

const isScheduledRideForFuture = (value) => {
    if (!value) {
        return false;
    }

    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
};

const createScheduledRidePreview = (ride) => ({
    rideId: ride.rideId,
    type: ride.type || ride.serviceType || 'ride',
    fare: formatFareLabel(ride.fare || ride.baseFare),
    distance: formatDistanceLabel(ride.estimatedDistanceMeters),
    payment: ride.paymentMethod || 'cash',
    pickup: ride.pickupAddress || 'Pickup point',
    drop: ride.dropAddress || 'Drop point',
    scheduledAt: ride.scheduledAt || null,
    customer: {
        name: ride.user?.name || 'Customer',
        phone: ride.user?.phone || '',
    },
    driverId: ride.driverId || '',
    isAssignedToCurrentDriver: Boolean(ride.isAssignedToCurrentDriver),
    raw: {
        fare: ride.fare,
        baseFare: ride.baseFare,
        bookingMode: ride.bookingMode || 'normal',
        parcel: ride.parcel || null,
        intercity: ride.intercity || null,
        user: ride.user || null,
        pickupAddress: ride.pickupAddress || '',
        dropAddress: ride.dropAddress || '',
        scheduledAt: ride.scheduledAt || null,
        ride,
    },
});

const getJobRideId = (job = {}) => String(job?.rideId || job?.id || job?._id || job?.requestId || '').trim();

const normalizeJobType = (job = {}) => {
    const value = String(job.type || job.serviceType || 'ride').toLowerCase();
    if (value === 'parcel') return 'parcel';
    if (value === 'intercity') return 'intercity';
    return 'ride';
};

const getJobTitle = (type) => {
    if (type === 'parcel') return 'Delivery';
    if (type === 'intercity') return 'Intercity Ride';
    return 'Taxi Ride';
};

const getPointCoordinates = (point) => {
    const [lng, lat] = point?.coordinates || [];

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return {
            lat: Number(lat),
            lng: Number(lng),
        };
    }

    return null;
};

const calculateDistanceMeters = (startPoint, endPoint) => {
    const start = getPointCoordinates(startPoint);
    const end = getPointCoordinates(endPoint);

    if (!start || !end) {
        return 0;
    }

    const earthRadiusMeters = 6371000;
    const toRadians = (value) => (value * Math.PI) / 180;
    const deltaLat = toRadians(end.lat - start.lat);
    const deltaLng = toRadians(end.lng - start.lng);
    const startLat = toRadians(start.lat);
    const endLat = toRadians(end.lat);
    const haversine =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
    const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    return earthRadiusMeters * arc;
};

const calculateCoordinateDistanceMeters = (startCoordinates, endCoordinates) => {
    if (!Array.isArray(startCoordinates) || !Array.isArray(endCoordinates)) {
        return Number.POSITIVE_INFINITY;
    }

    return calculateDistanceMeters(
        { coordinates: startCoordinates },
        { coordinates: endCoordinates },
    );
};

const formatTripDistance = (job = {}) => {
    const estimatedMeters = Number(
        job.estimatedDistanceMeters ||
        job.raw?.estimatedDistanceMeters ||
        calculateDistanceMeters(
            job.pickupLocation || job.raw?.pickupLocation,
            job.dropLocation || job.raw?.dropLocation,
        ) ||
        0,
    );

    if (Number.isFinite(estimatedMeters) && estimatedMeters > 0) {
        return estimatedMeters < 1000
            ? `${Math.max(50, Math.round(estimatedMeters / 10) * 10)} m`
            : `${(estimatedMeters / 1000).toFixed(estimatedMeters >= 10000 ? 0 : 1)} km`;
    }

    if (job.intercity?.distance) {
        return `${job.intercity.distance} km`;
    }

    if (job.raw?.intercity?.distance) {
        return `${job.raw.intercity.distance} km`;
    }

    if (job.radius) {
        return `within ${(Number(job.radius) / 1000).toFixed(1)} km`;
    }

    if (job.raw?.radius) {
        return `within ${(Number(job.raw.radius) / 1000).toFixed(1)} km`;
    }

    return 'nearby';
};

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;
const withDriverAuthorization = (token) => (
    token
        ? {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        : {}
);

const readStoredDriverInfo = () => {
    try {
        return JSON.parse(localStorage.getItem('driverInfo') || '{}');
    } catch {
        return {};
    }
};

const persistStoredDriverInfo = (updates = {}) => {
    const current = readStoredDriverInfo();
    const next = {
        ...current,
        ...updates,
    };
    localStorage.setItem('driverInfo', JSON.stringify(next));
    return next;
};

const readStoredDriverCoords = () => {
    const stored = readStoredDriverInfo();
    const coordinates = stored?.location?.coordinates || stored?.coordinates;

    if (Array.isArray(coordinates) && coordinates.length === 2) {
        const [lng, lat] = coordinates;
        if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
            return [Number(lng), Number(lat)];
        }
    }

    return null;
};

const getDocumentExpiryValue = (document = {}) => (
    document?.expiryDate
    || document?.expiry_date
    || document?.expiry
    || document?.expiresAt
    || null
);

const getDocumentReviewStatus = (document = {}) => String(
    document?.approvalStatus
    || document?.reviewStatus
    || document?.status
    || '',
).trim().toLowerCase();

const getDocumentReason = (document = {}) => String(
    document?.comment
    || document?.remarks
    || document?.reason
    || document?.admin_comment
    || document?.rejection_reason
    || '',
).trim();

const isExpiredDateValue = (value) => {
    if (!value) {
        return false;
    }

    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
};

const DRIVER_ROUTE_BOOKING_STORAGE_KEY = 'driver_route_booking_preferences';
const DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY = 'driver_vehicle_reapproval_pending';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// India calendar day - must match the server's selfie day key
const getTodaySelfieKey = () => {
    try {
        const value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        if (DATE_KEY_PATTERN.test(value)) return value;
    } catch {
        // Intl without time zones: computed below
    }
    // India is UTC+05:30 all year
    return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
};

const readRouteBookingPreferences = () => {
    try {
        const raw = localStorage.getItem(DRIVER_ROUTE_BOOKING_STORAGE_KEY);
        return raw ? JSON.parse(raw) : { enabled: false, coordinates: null, label: '' };
    } catch {
        return { enabled: false, coordinates: null, label: '' };
    }
};

const writeRouteBookingPreferences = (nextValue) => {
    localStorage.setItem(DRIVER_ROUTE_BOOKING_STORAGE_KEY, JSON.stringify(nextValue));
    return nextValue;
};

const normalizeRouteBookingPreferences = (routeBooking = null) => {
    const coordinates = Array.isArray(routeBooking?.coordinates) && routeBooking.coordinates.length === 2
        ? routeBooking.coordinates
        : null;

    return {
        enabled: Boolean(routeBooking?.enabled && coordinates),
        coordinates,
        label: String(routeBooking?.label || '').trim(),
        updatedAt: routeBooking?.updatedAt || null,
    };
};

const isDriverVehicleApprovalPending = (driver = {}) =>
    driver?.approve === false || String(driver?.status || '').toLowerCase() === 'pending';

const hasSelfieForToday = (onlineSelfie = null) =>
    String(onlineSelfie?.forDate || '').trim() === getTodaySelfieKey() &&
    Boolean(String(onlineSelfie?.imageUrl || '').trim());

const mapStyles = [
  { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
  { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
  { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }] },
  { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
  { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }
];

const DRIVER_ONLINE_CACHE_KEY = 'driver_is_online_cache';

// Last balance / summary seen in this app session (memory only): coming back to Home shows them at once; an app
// start shows the skeleton until the server answers.
const homeSessionValues = new Map();

// Today's date on this phone: a remembered summary from yesterday is never shown as today's.
const localDateKey = () => {
    try {
        const value = new Date().toLocaleDateString('en-CA');
        if (DATE_KEY_PATTERN.test(value)) return value;
    } catch {
        // computed below
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const BLUE = colors.blue[600];
const PARTNER_BUTTON = '#2563EB'; // Taxi index.css .driver-theme: bg-black / bg-slate-900 / bg-slate-950 buttons

// Same pulse bar as the wallet chip, in slate for the white summary card; same height as the number (no jump).
const SummaryNumberSkeleton = () => (
    <Skeleton width={40} height={14} rounded={6} style={styles.summarySkeleton} />
);

// web: animate-pulse dot
const PulseDot = () => {
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [opacity]);
    return <Animated.View style={[styles.pulseDot, { opacity }]} />;
};

// web: AnimatePresence + motion.div (fade + small slide / scale in and out). Keeps the last content while it fades out.
const FadePresence = ({ show, style, children, offsetY = 10, scaleFrom = 0.96, pointerEvents }) => {
    const anim = useRef(new Animated.Value(show ? 1 : 0)).current;
    const [mounted, setMounted] = useState(show);
    const lastChildren = useRef(children);
    if (show) lastChildren.current = children;

    useEffect(() => {
        if (show) setMounted(true);
        const a = Animated.timing(anim, {
            toValue: show ? 1 : 0,
            duration: show ? 220 : 180,
            easing: show ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
            useNativeDriver: true,
        });
        a.start(({ finished }) => {
            if (finished && !show) setMounted(false);
        });
        return () => a.stop();
    }, [anim, show]);

    if (!mounted && !show) return null;
    return (
        <Animated.View
            pointerEvents={pointerEvents}
            style={[
                style,
                {
                    opacity: anim,
                    transform: [
                        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [offsetY, 0] }) },
                        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) },
                    ],
                },
            ]}
        >
            {show ? children : lastChildren.current}
        </Animated.View>
    );
};

// The driver's vehicle on the map (web: one google.maps.Marker, 40x40, anchored at its centre).
const VehicleMarker = ({ position, icon }) => {
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const settleTimerRef = useRef(null);
    const source = useMemo(() => resolveImageSource(icon), [icon]);

    useEffect(() => {
        setTracksViewChanges(true);
    }, [source]);

    useEffect(() => () => clearTimeout(settleTimerRef.current), []);

    const settle = () => {
        clearTimeout(settleTimerRef.current);
        // the marker bitmap is taken from the drawn image: keep tracking for a moment after it loaded
        settleTimerRef.current = setTimeout(() => setTracksViewChanges(false), 300);
    };

    return (
        <Marker
            coordinate={toMapCoordinate(position)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={tracksViewChanges}
        >
            <Image source={source} style={styles.vehicleIcon} resizeMode="contain" onLoad={settle} onError={settle} />
        </Marker>
    );
};

const PressScale = ({ style, onPress, disabled, children, scale = 0.95, accessibilityLabel }) => (
    <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [style, pressed && !disabled && { transform: [{ scale }] }]}
    >
        {children}
    </Pressable>
);

const DriverHome = () => {
    const navigate = useNavigate();
    const tabActive = useDriverTabActive();
    const tabActiveRef = useRef(tabActive);
    tabActiveRef.current = tabActive;
    const insets = useSafeAreaInsets();
    const storedDriverInfo = useMemo(() => readStoredDriverInfo(), []);
    // What this driver saw earlier in this session: coming back to Home shows today's summary and the balance at
    // once instead of 0. Keyed by driver, so another account on the phone never sees them.
    const lastKnownPrefix = useMemo(() => {
        const payload = decodeJwtPayload(getLocalDriverToken());
        return `driver:${payload?.sub || payload?.id || 'unknown'}`;
    }, []);
    const rememberedSummary = useMemo(() => {
        const saved = homeSessionValues.get(`${lastKnownPrefix}:todaySummary`);
        return saved?.date === localDateKey() ? saved.summary : undefined;
    }, [lastKnownPrefix]);
    const rememberedWallet = useMemo(() => homeSessionValues.get(`${lastKnownPrefix}:wallet`), [lastKnownPrefix]);
    const [isOwnerManagedDriver, setIsOwnerManagedDriver] = useState(() => isOwnerManagedDriverProfile(storedDriverInfo));
    // Last known duty state, so coming back to Home shows Online right away instead of Offline -> Online after the
    // profile fetch.
    const [isOnline, setIsOnline] = useState(() => {
        try {
            return localStorage.getItem(DRIVER_ONLINE_CACHE_KEY) === 'true';
        } catch {
            return false;
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem(DRIVER_ONLINE_CACHE_KEY, isOnline ? 'true' : 'false');
        } catch {
            // storage unavailable: the fetch still sets the state
        }
    }, [isOnline]);
    const [showRequest, setShowRequest] = useState(false);

    const [currentRequest, setCurrentRequest] = useState(null);
    const [todaySummary, setTodaySummary] = useState(() => normalizeTodaySummary(rememberedSummary));
    const [summaryLoaded, setSummaryLoaded] = useState(() => rememberedSummary !== undefined);
    const [isTodaySummaryExpanded, setIsTodaySummaryExpanded] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const [driverCoords, setDriverCoords] = useState(() => readStoredDriverCoords());
    const [statusMessage, setStatusMessage] = useState('');
    // web: kept but not drawn
    const [, setSocketStatus] = useState('offline');
    const [notificationCount, setNotificationCount] = useState(0);
    const [scheduledRideCount, setScheduledRideCount] = useState(0);
    const [scheduledRides, setScheduledRides] = useState([]);
    const [isScheduleSheetOpen, setIsScheduleSheetOpen] = useState(false);
    const [isScheduleLoading, setIsScheduleLoading] = useState(false);
    const [selectedScheduledRide, setSelectedScheduledRide] = useState(null);
    const [scheduleNow, setScheduleNow] = useState(() => Date.now());
    const [cancellingScheduledRideId, setCancellingScheduledRideId] = useState('');
    const [acceptingRideId, setAcceptingRideId] = useState('');
    const [isHydratingDriver, setIsHydratingDriver] = useState(true);
    const [isTogglingDuty, setIsTogglingDuty] = useState(false);
    const [showOfflineConfirm, setShowOfflineConfirm] = useState(false);
    const [showOnlineSelfiePrompt, setShowOnlineSelfiePrompt] = useState(false);
    const [selfieUploading, setSelfieUploading] = useState(false);
    const [selfieError, setSelfieError] = useState('');
    const [onlineSelfie, setOnlineSelfie] = useState(null);
    // web: kept in storage for the route-booking screens, not drawn here
    const [, setRouteBookingPreferences] = useState(() => readRouteBookingPreferences());
    const [vehicleReapprovalPending, setVehicleReapprovalPending] = useState(() => localStorage.getItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY) === 'true');
    const [driverDocuments, setDriverDocuments] = useState({});
    const [documentTemplates, setDocumentTemplates] = useState([]);
    const [vehicleIconType, setVehicleIconType] = useState(
        () => storedDriverInfo?.vehicleIconType || storedDriverInfo?.vehicleType || 'car',
    );
    const [vehicleIconUrl, setVehicleIconUrl] = useState(
        () => storedDriverInfo?.vehicleIconUrl || '',
    );
    // Balance + summary show a skeleton only when nothing is known yet (first visit); never a made-up "0".
    // The balance chip shows the pulse bar on every visit until this visit's balance arrives (his choice); the
    // summary card keeps the last numbers instead.
    const [walletLoaded, setWalletLoaded] = useState(false);
    useEffect(() => {
        if (!tabActive) {
            return undefined;
        }
        // a new visit (web: Home mounted again)
        setWalletLoaded(false);
        // the request failed / hangs: stop pulsing after a while
        const timer = setTimeout(() => {
            setWalletLoaded(true);
            setSummaryLoaded(true);
        }, 6000);
        return () => clearTimeout(timer);
    }, [tabActive]);
    const [walletSummary, setWalletSummary] = useState(() => ({
        balance: 0,
        cashLimit: 500,
        minimumBalanceForOrders: 0,
        availableForOrders: 0,
        isBlocked: false,
        ...(rememberedWallet || {}),
    }));
    const applyWallet = useCallback((wallet) => {
        setWalletSummary(wallet);
        setWalletLoaded(true);
        homeSessionValues.set(`${lastKnownPrefix}:wallet`, wallet);
    }, [lastKnownPrefix]);
    const applyTodaySummary = useCallback((value) => {
        const next = normalizeTodaySummary(value);
        setTodaySummary(next);
        setSummaryLoaded(true);
        homeSessionValues.set(`${lastKnownPrefix}:todaySummary`, { date: localDateKey(), summary: next });
    }, [lastKnownPrefix]);
    const driverCoordsRef = useRef(readStoredDriverCoords());
    const acceptingRideIdRef = useRef('');
    const currentRequestRef = useRef(null);
    const recoveryTimeoutsRef = useRef([]);
    const acceptRecoveryTimeoutsRef = useRef([]);
    const recoveryInFlightRef = useRef(false);
    const lastDutyToggleAtRef = useRef(0);
    const lastOnlineLocationEmitRef = useRef({
        coordinates: null,
        emittedAt: 0,
    });
    const mapRef = useRef(null);
    const driverPosition = useMemo(() => toLatLng(driverCoords || DEFAULT_MAP_COORDS), [driverCoords]);
    // the map opens where the driver was last seen; later positions pan it
    const [initialRegion] = useState(() => regionFor(driverPosition, 15));
    const mapVehicleIcon = useMemo(
        () => getMapIconForVehicle(vehicleIconUrl || vehicleIconType),
        [vehicleIconType, vehicleIconUrl],
    );

    const walletAlertState = useMemo(
        () => getWalletAlertState(walletSummary, { ignoreRestrictions: isOwnerManagedDriver }),
        [walletSummary, isOwnerManagedDriver],
    );
    // Fleet driver: rides come only while the OWNER's wallet meets the admin minimum.
    const ownerWalletLow = isOwnerManagedDriver && Boolean(walletSummary.ownerWallet?.isBelowMinimum);
    const ownerWalletMinimum = Math.max(0, Number(walletSummary.ownerWallet?.minimumBalanceForOrders || 0));
    // Shown every time Home opens while the wallet is too low ("Later" only hides it until the next visit / go-online try).
    const lowWalletPopupKind = !walletLoaded ? '' : ownerWalletLow ? 'owner' : walletAlertState.isBlocked ? 'self' : '';
    const [lowWalletPopupOpen, setLowWalletPopupOpen] = useState(false);
    useEffect(() => {
        setLowWalletPopupOpen(Boolean(lowWalletPopupKind));
    }, [lowWalletPopupKind]);
    // the popup's text stays while it fades out
    const lastLowWalletKindRef = useRef('');
    if (lowWalletPopupKind) lastLowWalletKindRef.current = lowWalletPopupKind;
    const shownLowWalletKind = lowWalletPopupKind || lastLowWalletKindRef.current;

    const walletNotice = useMemo(() => {
        if (ownerWalletLow) {
            return {
                title: 'Owner wallet is low',
                message: `Your owner must keep at least Rs ${ownerWalletMinimum} in their wallet for you to receive rides.`,
                tone: 'danger',
                hideTopUp: true,
            };
        }

        if (walletAlertState.isBlocked) {
            return {
                title: walletAlertState.belowMinimumBalance ? 'Top up to go online' : 'Cash limit reached',
                message: walletAlertState.belowMinimumBalance
                    ? `Keep your wallet at or above Rs ${Math.max(0, walletAlertState.minimumBalanceForOrders)} to receive orders.`
                    : 'Add money to keep receiving ride requests.',
                tone: 'danger',
            };
        }

        if (walletAlertState.isWarning) {
            return {
                title: 'Wallet running low',
                message: 'Top up soon to keep receiving orders smoothly.',
                tone: 'warning',
            };
        }

        return null;
    }, [walletAlertState, ownerWalletLow, ownerWalletMinimum]);

    const { loadError: mapLoadError } = useBaseGoogleMapsLoader();

    // web: history.pushState + popstate put Home back on every Back press (Back never leaves Home). Android: the
    // hardware Back is swallowed while Home is the screen on top (a popup's own Modal takes Back first).
    useEffect(() => {
        if (!tabActive) {
            return undefined;
        }

        const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);

        return () => {
            subscription.remove();
        };
    }, [tabActive]);

    // The ride request popup (and every other popup) belongs to the visit: the web dropped them when Home unmounted.
    useEffect(() => {
        if (tabActive) {
            return;
        }
        if (currentRequestRef.current) {
            stopRideRequestAlertSound();
        }
        setShowRequest(false);
        setCurrentRequest(null);
        acceptingRideIdRef.current = '';
        setAcceptingRideId('');
        setShowOfflineConfirm(false);
        setShowOnlineSelfiePrompt(false);
        setSelfieError('');
        setIsScheduleSheetOpen(false);
        setSelectedScheduledRide(null);
        setStatusMessage('');
        setIsTodaySummaryExpanded(true);
    }, [tabActive]);

    const refreshNotificationCount = useCallback(async () => {
        try {
            const response = await getDriverNotifications();
            const results = response?.data?.results || [];
            const visibleNotifications = getVisibleDriverNotifications(results);
            setNotificationCount(getUnreadDriverNotificationCount(visibleNotifications));
        } catch {
            setNotificationCount(0);
        }
    }, []);

    const loadScheduledRides = useCallback(async () => {
        setIsScheduleLoading(true);

        try {
            const response = await getDriverScheduledRides({ limit: 20 });
            const results = response?.data?.results || [];
            const nextScheduledRides = results
                .filter((ride) => ride?.scheduledAt)
                .sort((firstRide, secondRide) => new Date(firstRide.scheduledAt).getTime() - new Date(secondRide.scheduledAt).getTime());

            setScheduledRides(nextScheduledRides);
            setScheduledRideCount(nextScheduledRides.length);
        } catch {
            setScheduledRides([]);
            setScheduledRideCount(0);
        } finally {
            setIsScheduleLoading(false);
        }
    }, []);

    const handleCancelScheduledRide = useCallback(async (ride) => {
        const rideId = String(ride?.rideId || '');

        if (!rideId || cancellingScheduledRideId) {
            return;
        }

        // web: window.confirm
        const confirmed = await new Promise((resolve) => {
            Alert.alert(
                '',
                'Cancel this scheduled ride? The user will be notified immediately.',
                [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'OK', onPress: () => resolve(true) },
                ],
                { cancelable: true, onDismiss: () => resolve(false) },
            );
        });
        if (!confirmed) {
            return;
        }

        setCancellingScheduledRideId(rideId);

        try {
            await cancelDriverScheduledRide(rideId);
            toast.success('Scheduled ride cancelled. User notified.', {
                duration: 3200,
            });
            setSelectedScheduledRide(null);
            await loadScheduledRides();
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Failed to cancel scheduled ride');
        } finally {
            setCancellingScheduledRideId('');
        }
    }, [cancellingScheduledRideId, loadScheduledRides]);

    // web: unlocked the alert sound on the first pointerdown / keydown; here the player is prepared once
    useEffect(() => {
        unlockRideRequestAlertSound();
    }, []);

    useEffect(() => {
        if (!tabActive) {
            return undefined;
        }

        refreshNotificationCount();
        loadScheduledRides();

        const handleFocus = () => {
            refreshNotificationCount();
            loadScheduledRides();
        };
        const refreshInterval = setInterval(() => {
            refreshNotificationCount();
            loadScheduledRides();
        }, 30000);

        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(refreshInterval);
            window.removeEventListener('focus', handleFocus);
        };
    }, [loadScheduledRides, refreshNotificationCount, tabActive]);

    useEffect(() => {
        if (!tabActive || scheduledRides.length === 0) {
            return undefined;
        }

        const interval = setInterval(() => {
            setScheduleNow(Date.now());
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }, [scheduledRides.length, tabActive]);

    useEffect(() => {
        currentRequestRef.current = currentRequest;
    }, [currentRequest]);

    const emitOnlineLocationUpdate = useCallback((coordinates, { force = false } = {}) => {
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
            return false;
        }

        const now = Date.now();
        const lastEmission = lastOnlineLocationEmitRef.current;
        const movedDistance = calculateCoordinateDistanceMeters(lastEmission.coordinates, coordinates);
        const shouldEmit = force ||
            !Array.isArray(lastEmission.coordinates) ||
            movedDistance >= ONLINE_LOCATION_EMIT_MIN_DISTANCE_METERS ||
            now - Number(lastEmission.emittedAt || 0) >= ONLINE_LOCATION_EMIT_MIN_INTERVAL_MS;

        if (!shouldEmit) {
            return false;
        }

        socketService.emit('locationUpdate', { coordinates });
        lastOnlineLocationEmitRef.current = {
            coordinates,
            emittedAt: now,
        };
        return true;
    }, []);

    useEffect(() => {
        if (!tabActive) {
            return undefined;
        }

        const syncLocalDriverPreferences = () => {
            setRouteBookingPreferences(readRouteBookingPreferences());
            setVehicleReapprovalPending(localStorage.getItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY) === 'true');
        };

        // web: read again when Home mounted (useState initialisers)
        syncLocalDriverPreferences();
        window.addEventListener('focus', syncLocalDriverPreferences);
        return () => {
            window.removeEventListener('focus', syncLocalDriverPreferences);
        };
    }, [tabActive]);

    useEffect(() => {
        if (!tabActive || !isOnline || !showRequest || !currentRequest?.rideId) {
            return undefined;
        }

        playRideRequestAlertSound();

        const replayAlert = () => {
            if (document.visibilityState === 'visible' && currentRequestRef.current?.rideId) {
                playRideRequestAlertSound();
            }
        };

        window.addEventListener('focus', replayAlert);
        window.addEventListener('pageshow', replayAlert);
        document.addEventListener('visibilitychange', replayAlert);

        return () => {
            window.removeEventListener('focus', replayAlert);
            window.removeEventListener('pageshow', replayAlert);
            document.removeEventListener('visibilitychange', replayAlert);
        };
    }, [currentRequest?.rideId, isOnline, showRequest, tabActive]);

    const clearRecoveryBurst = useCallback(() => {
        recoveryTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
        recoveryTimeoutsRef.current = [];
    }, []);

    useEffect(() => clearRecoveryBurst, [clearRecoveryBurst]);

    const clearAcceptRecovery = useCallback(() => {
        acceptRecoveryTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
        acceptRecoveryTimeoutsRef.current = [];
    }, []);

    useEffect(() => clearAcceptRecovery, [clearAcceptRecovery]);

    // web: these timers died with the page when another tab opened
    useEffect(() => {
        if (!tabActive) {
            clearRecoveryBurst();
            clearAcceptRecovery();
        }
    }, [clearAcceptRecovery, clearRecoveryBurst, tabActive]);

    const fetchActiveJob = useCallback(async (type = 'ride') => {
        const normalizedType = String(type || 'ride').toLowerCase();
        const endpoint = normalizedType === 'parcel' ? '/deliveries/active/me' : '/rides/active/me';
        const driverToken = getLocalDriverToken();
        const response = await api.get(endpoint, {
            ...withDriverAuthorization(driverToken),
            params: { t: Date.now(), type: normalizedType },
        });
        return unwrapApiPayload(response);
    }, []);

    const openActiveJob = useCallback((job) => {
        const currentRideId = getJobRideId(job);

        if (!currentRideId) {
            return false;
        }

        // a hidden tab never navigates (web: Home was not mounted then)
        if (!tabActiveRef.current) {
            return false;
        }

        clearAcceptRecovery();

        const currentType = normalizeJobType(job);

        navigate('/taxi/driver/active-trip', {
            replace: true,
            state: {
                type: currentType,
                rideId: currentRideId,
                otp: job.otp || '',
                request: {
                    type: currentType,
                    title: getJobTitle(currentType),
                    fare: `Rs ${job.fare || 0}`,
                    payment: job.paymentMethod || 'Cash',
                    pickup: job.pickupAddress || formatPoint(job.pickupLocation, 'Pickup Location'),
                    drop: job.dropAddress || formatPoint(job.dropLocation, 'Drop Location'),
                    distance: formatTripDistance(job),
                    requestId: currentRideId,
                    rideId: currentRideId,
                    otp: job.otp || '',
                    raw: job,
                },
                currentDriverCoords: driverCoordsRef.current || job.lastDriverLocation?.coordinates || null,
            },
        });

        return true;
    }, [clearAcceptRecovery, navigate]);

    const scheduleAcceptRecovery = useCallback((type = 'ride') => {
        clearAcceptRecovery();

        [700, 1500, 3000, 5000].forEach((delay) => {
            const timeoutId = setTimeout(async () => {
                if (!acceptingRideIdRef.current) {
                    return;
                }

                try {
                    const activeJob = await fetchActiveJob(type);
                    if (getJobRideId(activeJob)) {
                        openActiveJob(activeJob);
                    }
                } catch {
                    // Let later retries continue if the active job is not visible yet.
                }
            }, delay);

            acceptRecoveryTimeoutsRef.current.push(timeoutId);
        });
    }, [clearAcceptRecovery, fetchActiveJob, openActiveJob]);

    const panMapTo = useCallback((position) => {
        mapRef.current?.animateCamera?.({ center: toMapCoordinate(position) }, { duration: 400 });
    }, []);

    const updateDriverLocation = useCallback(async ({ quiet = false } = {}) => {
        try {
            const coordinates = await getCurrentCoords({ purpose: 'online' });
            driverCoordsRef.current = coordinates;
            setDriverCoords(coordinates);
            persistStoredDriverInfo({
                location: {
                    coordinates,
                },
                coordinates,
            });
            panMapTo(toLatLng(coordinates));
            if (!quiet) {
                setStatusMessage('Current location updated.');
            }
            return coordinates;
        } catch (error) {
            if (!quiet) {
                setStatusMessage(error.message || 'Could not fetch current location.');
            }
            throw error;
        }
    }, [panMapTo]);

    useEffect(() => {
        if (!tabActive) {
            return;
        }
        updateDriverLocation({ quiet: true }).catch(() => {});
    }, [tabActive, updateDriverLocation]);

    const hydrateDriverState = useCallback(async () => {
        const [response, templateResponse] = await Promise.all([
            getCurrentDriver(),
            getDriverDocumentTemplates().catch(() => null),
        ]);
        const driver = response?.data?.data || response?.data || response;
        const savedCoords = driver?.location?.coordinates;

        setVehicleIconType(driver?.vehicleIconType || driver?.vehicleType || 'car');
        setVehicleIconUrl(driver?.vehicleIconUrl || '');
        setIsOnline(Boolean(driver?.isOnline));
        setIsOwnerManagedDriver(isOwnerManagedDriverProfile(driver));
        applyTodaySummary(driver?.todaySummary);
        if (driver?.wallet) {
            applyWallet(driver.wallet);
        }
        setOnlineSelfie(driver?.onlineSelfie || null);
        setDriverDocuments(driver?.documents || {});
        setRouteBookingPreferences(writeRouteBookingPreferences(normalizeRouteBookingPreferences(driver?.routeBooking)));
        const nextVehicleApprovalPending = isDriverVehicleApprovalPending(driver);
        setVehicleReapprovalPending(nextVehicleApprovalPending);
        if (nextVehicleApprovalPending) {
            localStorage.setItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY, 'true');
        } else {
            localStorage.removeItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY);
        }
        const templateResults = templateResponse?.data?.data?.results || templateResponse?.data?.results || [];
        setDocumentTemplates(Array.isArray(templateResults) ? templateResults : []);

        const storedDriverInfoSnapshot = readStoredDriverInfo();
        persistStoredDriverInfo({
            owner_id: driver?.owner_id || storedDriverInfoSnapshot?.owner_id || null,
            vehicleIconType: driver?.vehicleIconType || storedDriverInfoSnapshot?.vehicleIconType || '',
            vehicleType: driver?.vehicleType || storedDriverInfoSnapshot?.vehicleType || '',
            vehicleIconUrl: driver?.vehicleIconUrl || storedDriverInfoSnapshot?.vehicleIconUrl || '',
        });

        if (Array.isArray(savedCoords) && savedCoords.length === 2) {
            driverCoordsRef.current = savedCoords;
            setDriverCoords(savedCoords);
            persistStoredDriverInfo({
                location: {
                    coordinates: savedCoords,
                },
                coordinates: savedCoords,
            });
        }

        return driver;
    }, [applyTodaySummary, applyWallet]);

    const refreshTodaySummary = useCallback(async () => {
        const response = await getCurrentDriver();
        const driver = response?.data?.data || response?.data || response;

        applyTodaySummary(driver?.todaySummary);
        if (driver?.wallet) {
            applyWallet(driver.wallet);
        }

        return driver;
    }, [applyTodaySummary, applyWallet]);

    const expiredDocumentNames = useMemo(() => {
        const flattenedTemplates = Array.isArray(documentTemplates)
            ? documentTemplates.flatMap((template) =>
                Array.isArray(template?.fields)
                    ? template.fields.map((field) => ({
                        key: field?.key,
                        label: field?.label || field?.name || field?.key || 'Document',
                        hasExpiryDate: Boolean(template?.has_expiry_date),
                    }))
                    : [],
            )
            : [];

        return flattenedTemplates
            .filter((field) => field.key && field.hasExpiryDate)
            .filter((field) => isExpiredDateValue(getDocumentExpiryValue(driverDocuments?.[field.key])))
            .map((field) => field.label);
    }, [documentTemplates, driverDocuments]);

    const rejectedDocumentNotes = useMemo(() => {
        const flattenedTemplates = Array.isArray(documentTemplates)
            ? documentTemplates.flatMap((template) =>
                Array.isArray(template?.fields)
                    ? template.fields.map((field) => ({
                        key: field?.key,
                        label: field?.label || field?.name || field?.key || 'Document',
                    }))
                    : [],
            )
            : [];

        return flattenedTemplates
            .map((field) => {
                const document = driverDocuments?.[field.key];
                const reviewStatus = getDocumentReviewStatus(document);
                if (!['rejected', 'declined'].includes(reviewStatus)) {
                    return null;
                }

                return {
                    label: field.label,
                    reason: getDocumentReason(document),
                };
            })
            .filter(Boolean);
    }, [documentTemplates, driverDocuments]);

    // web: on mount (every visit to Home): driver profile + an unfinished trip, which is opened at once
    useEffect(() => {
        if (!tabActive) {
            return undefined;
        }

        let active = true;

        setIsHydratingDriver(true);

        (async () => {
            try {
                const [, activeDelivery, activeRide] = await Promise.allSettled([
                    hydrateDriverState(),
                    fetchActiveJob('parcel'),
                    fetchActiveJob('ride'),
                ]);

                if (!active) {
                    return;
                }

                const deliveryPayload =
                    activeDelivery.status === 'fulfilled' ? activeDelivery.value : null;
                const ridePayload =
                    activeRide.status === 'fulfilled' ? activeRide.value : null;

                const currentJob = getJobRideId(deliveryPayload)
                    ? deliveryPayload
                    : getJobRideId(ridePayload)
                        ? ridePayload
                        : null;

                if (getJobRideId(currentJob)) {
                    openActiveJob(currentJob);
                    return;
                }
            } catch {
                if (active) {
                    setStatusMessage('Could not restore driver status.');
                }
            } finally {
                if (active) {
                    setIsHydratingDriver(false);
                }
            }
        })();

        return () => {
            active = false;
        };
    }, [fetchActiveJob, hydrateDriverState, openActiveJob, tabActive]);

    // The "You are online" location service follows the duty state (a finished toggle, the cached state on start,
    // the server's state after the profile fetch). It keeps running while another tab or page is open.
    useEffect(() => {
        if (isTogglingDuty) {
            return;
        }
        if (isOnline) {
            // false = location refused: the web's own location messages tell the driver (going online needs a position)
            startOnlineLocationUpdates().catch(() => {});
        } else {
            stopOnlineLocationUpdates().catch(() => {});
        }
    }, [isOnline, isTogglingDuty]);

    useEffect(() => {
        if (!tabActive) {
            return undefined;
        }

        let cancelled = false;

        const syncSummary = async () => {
            try {
                await refreshTodaySummary();
            } catch {
                if (!cancelled) {
                    console.warn('[driver-home] failed to refresh today summary');
                }
            }
        };

        syncSummary();
        const intervalId = setInterval(syncSummary, isOnline ? 30000 : 120000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncSummary();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isOnline, refreshTodaySummary, tabActive]);

    useEffect(() => {
        if (mapReady && driverCoords) {
            panMapTo(toLatLng(driverCoords));
        }
    }, [mapReady, driverCoords, panMapTo]);

    const recenterMap = useCallback(async () => {
        try {
            setStatusMessage('Recentering map...');
            await updateDriverLocation({ quiet: true });
            setStatusMessage('Map recentered to your location.');
        } catch (error) {
            setStatusMessage(error.message || 'Could not recenter map.');
        }
    }, [updateDriverLocation]);

    const goOnline = useCallback(async (selfieImageUrl = '') => {
        if (vehicleReapprovalPending) {
            setStatusMessage('Vehicle update is pending admin approval. Please wait before going online.');
            return;
        }

        if (walletAlertState.isBlocked) {
            setStatusMessage(
                walletAlertState.belowMinimumBalance
                    ? `Keep your wallet at or above Rs ${Math.max(0, walletAlertState.minimumBalanceForOrders)} to go online.`
                    : 'Cash limit exceeded. Please top up your wallet to go online.',
            );
            setLowWalletPopupOpen(true);
            return;
        }

        if (expiredDocumentNames.length > 0) {
            setStatusMessage(`Please reupload expired documents: ${expiredDocumentNames.join(', ')}.`);
            return;
        }

        if (rejectedDocumentNotes.length > 0) {
            const firstRejected = rejectedDocumentNotes[0];
            setStatusMessage(
                firstRejected?.reason
                    ? `${firstRejected.label} was rejected: ${firstRejected.reason}`
                    : `Please reupload rejected documents: ${rejectedDocumentNotes.map((item) => item.label).join(', ')}.`,
            );
            return;
        }

        setIsTogglingDuty(true);
        try {
            console.info('[driver-home] goOnline requested');
            setStatusMessage('Going online...');

            // OPTIMIZATION: Use last known coords to speed up the transition
            // instead of waiting for a fresh GPS lock (which can take 2-6 seconds)
            let coordinates = driverCoordsRef.current;

            if (!coordinates) {
                // If we really don't have any coords yet, we MUST wait for them once
                coordinates = await updateDriverLocation({ quiet: true });
            } else {
                // Refresh location in background for better accuracy without blocking the UI
                updateDriverLocation({ quiet: true }).catch(() => {});
            }

            console.info('[driver-home] using coordinates for online status', coordinates);
            const socket = socketService.connect({ role: 'driver' });

            if (!socket) {
                console.warn('[driver-home] socket connect skipped because token was missing');
                setIsOnline(false);
                setStatusMessage('Driver session missing. Please login again.');
                return;
            }

            setIsOnline(true);
            const response = await api.patch('/drivers/online', {
                location: coordinates,
                ...(selfieImageUrl ? { selfieImageUrl } : {}),
            });
            const driver = response?.data?.data || response?.data || response;
            console.info('[driver-home] online API response', {
                isOnline: driver?.isOnline,
                zoneId: driver?.zoneId || null,
                vehicleTypeId: driver?.vehicleTypeId || null,
            });
            setIsOnline(Boolean(driver?.isOnline));
            setVehicleIconUrl((current) => driver?.vehicleIconUrl || current);
            setOnlineSelfie(driver?.onlineSelfie || null);

            // Sync current state with server response
            const finalCoords = (Array.isArray(driver?.location?.coordinates) && driver.location.coordinates.length === 2)
                ? driver.location.coordinates
                : coordinates;

            driverCoordsRef.current = finalCoords;
            setDriverCoords(finalCoords);
            persistStoredDriverInfo({
                location: {
                    coordinates: finalCoords,
                },
                coordinates: finalCoords,
            });
            emitOnlineLocationUpdate(finalCoords, { force: true });

            setStatusMessage('You are online. Waiting for nearby bookings.');
            refreshTodaySummary().catch(() => {});
        } catch (error) {
            console.error('[driver-home] goOnline failed', error);
            setIsOnline(false);
            socketService.disconnect();
            const nextMessage = error?.response?.data?.message || error.message || 'Could not go online.';
            setStatusMessage(nextMessage);
            if (String(nextMessage).toLowerCase().includes('selfie is required')) {
                setShowOnlineSelfiePrompt(true);
            }
        } finally {
            setIsTogglingDuty(false);
        }
    }, [emitOnlineLocationUpdate, expiredDocumentNames, rejectedDocumentNotes, refreshTodaySummary, updateDriverLocation, vehicleReapprovalPending, walletAlertState]);

    const goOffline = useCallback(async () => {
        setIsTogglingDuty(true);
        setIsOnline(false);
        try {
            setStatusMessage('Going offline...');
            const response = await api.patch('/drivers/offline');
            const driver = response?.data?.data || response?.data || response;
            setIsOnline(Boolean(driver?.isOnline));
            setIsOnline(false);
            setShowRequest(false);
            setCurrentRequest(null);
            setStatusMessage('You are offline.');
            socketService.disconnect();
            refreshTodaySummary().catch(() => {});
        } catch (error) {
            setIsOnline(true);
            setStatusMessage(error.message || 'Could not go offline.');
        } finally {
            setIsTogglingDuty(false);
        }
    }, [refreshTodaySummary]);

    const handleDutyToggle = useCallback(() => {
        const now = Date.now();
        if (now - lastDutyToggleAtRef.current < 600) {
            return;
        }
        lastDutyToggleAtRef.current = now;

        if (isTogglingDuty) {
            return;
        }

        setStatusMessage(isOnline ? 'Preparing to go offline...' : 'Checking online requirements...');

        if (isOnline) {
            setShowOfflineConfirm(true);
            return;
        }

        if (vehicleReapprovalPending) {
            setStatusMessage('Vehicle update is pending admin approval. Please wait before going online.');
            return;
        }

        if (walletAlertState.isBlocked) {
            setStatusMessage(
                walletAlertState.belowMinimumBalance
                    ? `Keep your wallet at or above Rs ${Math.max(0, walletAlertState.minimumBalanceForOrders)} to go online.`
                    : 'Cash limit exceeded. Please top up your wallet to go online.',
            );
            setLowWalletPopupOpen(true);
            return;
        }

        if (expiredDocumentNames.length > 0) {
            setStatusMessage(`Please reupload expired documents: ${expiredDocumentNames.join(', ')}.`);
            return;
        }

        if (rejectedDocumentNotes.length > 0) {
            const firstRejected = rejectedDocumentNotes[0];
            setStatusMessage(
                firstRejected?.reason
                    ? `${firstRejected.label} was rejected: ${firstRejected.reason}`
                    : `Please reupload rejected documents: ${rejectedDocumentNotes.map((item) => item.label).join(', ')}.`,
            );
            return;
        }

        if (hasSelfieForToday(onlineSelfie)) {
            goOnline();
            return;
        }

        setSelfieError('');
        setShowOnlineSelfiePrompt(true);
    }, [
        expiredDocumentNames,
        goOnline,
        isOnline,
        isTogglingDuty,
        onlineSelfie,
        rejectedDocumentNotes,
        vehicleReapprovalPending,
        walletAlertState,
    ]);

    const uploadSelfieDataUrl = useCallback(async (sourceDataUrl) => {
        setSelfieUploading(true);
        setSelfieError('');

        try {
            // web: re-encoded on a canvas (max 1280 px, JPEG 0.82); done before this call by shrinkImage
            setStatusMessage('Processing selfie...');
            const base64Image = sourceDataUrl;

            setStatusMessage('Uploading selfie...');
            const uploadResult = await uploadService.uploadImage(base64Image, 'driver-online-selfies');
            const selfieUrl = uploadResult?.url || uploadResult?.secureUrl || '';

            if (!selfieUrl) {
                throw new Error('Selfie upload did not return an image URL');
            }

            setOnlineSelfie({
                imageUrl: selfieUrl,
                capturedAt: new Date().toISOString(),
                forDate: getTodaySelfieKey(),
            });
            setShowOnlineSelfiePrompt(false);
            await goOnline(selfieUrl);
        } catch (error) {
            setSelfieError(error?.message || 'Failed to upload selfie');
            setStatusMessage(error?.message || 'Failed to upload selfie');
        } finally {
            setSelfieUploading(false);
        }
    }, [goOnline]);

    // web: getUserMedia (front camera) with a live preview + Capture, falling back to <input capture="user">.
    // Native: the phone's front camera; the photo comes back as base64 (the web's data URL) for the same upload.
    const openSelfieCamera = useCallback(async () => {
        try {
            setSelfieError('');
            setStatusMessage('Opening camera...');
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
                throw new Error('Could not access the camera.');
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                cameraType: ImagePicker.CameraType.front,
                quality: 1,
                exif: false,
            });
            const asset = result?.canceled ? null : result?.assets?.[0];
            if (!asset?.uri) {
                return;
            }
            // web: canvas re-encode, max 1280 px, JPEG 0.82
            const shrunk = await shrinkImage(asset.uri, { width: asset.width, height: asset.height, maxSide: 1280, quality: 0.82, base64: true });
            await uploadSelfieDataUrl(`data:image/jpeg;base64,${shrunk.base64}`);
        } catch (error) {
            const message = error?.message || 'Could not access the camera.';
            setSelfieError(message);
            setStatusMessage(message);
        }
    }, [uploadSelfieDataUrl]);

    const recoverRealtimeSession = useCallback(async () => {
        if (!isOnline || isHydratingDriver || isTogglingDuty) {
            return;
        }

        if (recoveryInFlightRef.current) {
            return;
        }

        recoveryInFlightRef.current = true;

        try {
            const socket = socketService.connect({ role: 'driver' });

            if (!socket) {
                return;
            }

            let nextCoords = driverCoordsRef.current;

            if (!nextCoords) {
                try {
                    nextCoords = await updateDriverLocation({ quiet: true });
                } catch {
                    nextCoords = driverCoordsRef.current;
                }
            }

            if (nextCoords) {
                emitOnlineLocationUpdate(nextCoords, { force: true });
            }

            try {
                const [activeDelivery, activeRide] = await Promise.allSettled([
                    fetchActiveJob('parcel'),
                    fetchActiveJob('ride'),
                ]);
                const deliveryPayload = activeDelivery.status === 'fulfilled' ? activeDelivery.value : null;
                const ridePayload = activeRide.status === 'fulfilled' ? activeRide.value : null;
                const currentJob = getJobRideId(deliveryPayload)
                    ? deliveryPayload
                    : getJobRideId(ridePayload)
                        ? ridePayload
                        : null;

                if (getJobRideId(currentJob)) {
                    openActiveJob(currentJob);
                    return;
                }
            } catch {
                // Realtime recovery should continue even if active-job hydration fails.
            }

            // Background re-sync is silent: no "synced / refreshed" banner popping up over the map.
        } finally {
            recoveryInFlightRef.current = false;
        }
    }, [emitOnlineLocationUpdate, fetchActiveJob, isHydratingDriver, isOnline, isTogglingDuty, openActiveJob, updateDriverLocation]);

    const scheduleRecoveryBurst = useCallback(() => {
        if (!isOnline || isHydratingDriver || isTogglingDuty) {
            return;
        }

        clearRecoveryBurst();

        [0, 1500, 5000, 10000].forEach((delay) => {
            const timeoutId = setTimeout(() => {
                recoverRealtimeSession().catch(() => {});
            }, delay);

            recoveryTimeoutsRef.current.push(timeoutId);
        });
    }, [clearRecoveryBurst, isHydratingDriver, isOnline, isTogglingDuty, recoverRealtimeSession]);

    // Socket Integration (while Home is on screen; offline disconnects at any time like the web)
    useEffect(() => {
        if (isOnline && tabActive) {
            console.info('[driver-home] socket effect starting for online driver');
            const socket = socketService.connect({ role: 'driver' });

            if (!socket) {
                console.warn('[driver-home] socket effect could not get a socket');
                setStatusMessage('Driver session missing. Please login again.');
                setIsOnline(false);
                setSocketStatus('offline');
                return undefined;
            }

            setSocketStatus(socket.connected ? 'connected' : 'reconnecting');

            if (driverCoordsRef.current) {
                emitOnlineLocationUpdate(driverCoordsRef.current, { force: true });
                console.info('[driver-home] emitted initial locationUpdate from effect', driverCoordsRef.current);
            }

            const onSocketConnect = () => {
                clearRecoveryBurst();
                setSocketStatus('connected');
            };
            const onSocketDisconnect = () => {
                setSocketStatus('offline');
                scheduleRecoveryBurst({ reason: 'disconnect' });
            };
            const onSocketReconnectAttempt = () => setSocketStatus('reconnecting');
            const onSocketConnectError = () => {
                setSocketStatus('reconnecting');
                scheduleRecoveryBurst({ reason: 'connect-error' });
            };

            const onRideRequest = (data) => {
                console.info('[driver-home] rideRequest received', data);
                const requestType = normalizeJobType(data);
                const request = {
                    type: requestType,
                    title: getJobTitle(requestType),
                    fare: `Rs ${data.fare || 0}`,
                    payment: data.paymentMethod || 'Cash',
                    pickup: data.pickupAddress || formatPoint(data.pickupLocation, 'Pickup Location'),
                    drop: data.dropAddress || formatPoint(data.dropLocation, 'Drop Location'),
                    distance: formatTripDistance(data),
                    requestId: data.rideId,
                    rideId: data.rideId,
                    acceptRejectDurationSeconds: data.acceptRejectDurationSeconds || data.expiresInSeconds,
                    // native: the countdown runs from the moment the request arrived (see IncomingRideRequest)
                    receivedAt: Date.now(),
                    bookingMode: data.bookingMode || 'normal',
                    bidding: data.bidding || { enabled: false },
                    raw: data,
                };
                setCurrentRequest(request);
                setShowRequest(true);
                playRideRequestAlertSound();
                setStatusMessage('New booking received.');
            };

            const onRideRequestClosed = ({ rideId, reason, message }) => {
                console.info('[driver-home] rideRequestClosed received', { rideId, reason, message });
                if (acceptingRideIdRef.current && acceptingRideIdRef.current === rideId) {
                    clearAcceptRecovery();
                    return;
                }
                const activeRequest = currentRequestRef.current;
                if (!activeRequest?.rideId || activeRequest.rideId === rideId) {
                    setShowRequest(false);
                    setCurrentRequest(null);
                    stopRideRequestAlertSound();
                    if (reason === 'user-cancelled') {
                        setStatusMessage(message || 'User cancelled the ride.');
                    } else if (reason === 'deleted-by-admin') {
                        setStatusMessage('Ride was cancelled by admin.');
                    } else if (reason === 'unmatched') {
                        setStatusMessage('Ride request expired without a match.');
                    }
                }
            };

            const onSocketError = ({ message } = {}) => {
                console.error('[driver-home] socket errorMessage received', message);
                setStatusMessage(message || 'Socket error.');
                if (acceptingRideIdRef.current) {
                    toast.error(message || 'Could not accept this ride.');
                    setShowRequest(false);
                    setCurrentRequest(null);
                    stopRideRequestAlertSound();
                }
                if (String(message || '').toLowerCase().includes('no longer available')) {
                    setShowRequest(false);
                    setCurrentRequest(null);
                    stopRideRequestAlertSound();
                }
                clearAcceptRecovery();
                acceptingRideIdRef.current = '';
                setAcceptingRideId('');
            };

            const onRideBidSubmitted = ({ rideId }) => {
                if (!rideId || rideId !== acceptingRideIdRef.current) {
                    return;
                }

                setAcceptingRideId('');
                setStatusMessage('Bid submitted. Waiting for rider response.');
            };

            const onRideBiddingUpdated = (payload = {}) => {
                if (!payload?.rideId) {
                    return;
                }

                setCurrentRequest((current) => {
                    if (!current?.rideId || current.rideId !== payload.rideId) {
                        return current;
                    }

                    const pricingNegotiationMode = payload.pricingNegotiationMode || current.raw?.pricingNegotiationMode || 'none';
                    const isDriverBidMode = pricingNegotiationMode === 'driver_bid';

                    return {
                        ...current,
                        fare: `Rs ${payload.fare || current.raw?.fare || 0}`,
                        bookingMode: payload.bookingMode || current.bookingMode || 'normal',
                        raw: {
                            ...(current.raw || {}),
                            fare: payload.fare || current.raw?.fare || 0,
                            bookingMode: payload.bookingMode || current.raw?.bookingMode || 'bidding',
                            pricingNegotiationMode,
                            fareIncreaseWaitMinutes: payload.fareIncreaseWaitMinutes || current.raw?.fareIncreaseWaitMinutes || 0,
                            nextFareIncreaseAt: payload.nextFareIncreaseAt || current.raw?.nextFareIncreaseAt || null,
                            bidding: {
                                ...(current.raw?.bidding || {}),
                                enabled: isDriverBidMode,
                                baseFare: payload.baseFare || current.raw?.bidding?.baseFare || current.raw?.baseFare || current.raw?.fare || 0,
                                userMaxBidFare: payload.userMaxBidFare || payload.fare || current.raw?.bidding?.userMaxBidFare || current.raw?.userMaxBidFare || 0,
                                bidStepAmount: payload.bidStepAmount || current.raw?.bidding?.bidStepAmount || 10,
                            },
                        },
                    };
                });
            };

            const openAcceptedRide = async (payload) => {
                if (!payload?.rideId || payload.rideId !== acceptingRideIdRef.current) {
                    return;
                }

                const activeRequest = currentRequestRef.current;
                const nextType = activeRequest?.type || 'ride';
                const scheduledAt = activeRequest?.raw?.scheduledAt || payload?.scheduledAt || null;
                let currentJob = null;

                try {
                    currentJob = await fetchActiveJob(nextType);
                } catch {
                    currentJob = null;
                }

                setShowRequest(false);
                stopRideRequestAlertSound();
                clearAcceptRecovery();
                acceptingRideIdRef.current = '';
                setAcceptingRideId('');
                if (isScheduledRideForFuture(scheduledAt)) {
                    setStatusMessage(`Scheduled ride confirmed for ${formatScheduledDateTime(scheduledAt)}.`);
                    loadScheduledRides();
                    return;
                }

                if (!tabActiveRef.current) {
                    return;
                }

                navigate('/taxi/driver/active-trip', {
                    state: {
                        type: nextType,
                        rideId: currentJob?.rideId || payload.rideId,
                        otp: currentJob?.otp || payload?.otp || activeRequest?.raw?.otp || '',
                        request: {
                            ...activeRequest,
                            rideId: currentJob?.rideId || payload.rideId,
                            otp: currentJob?.otp || payload?.otp || activeRequest?.raw?.otp || '',
                            raw: currentJob || {
                                ...(activeRequest?.raw || {}),
                                otp: payload?.otp || activeRequest?.raw?.otp || '',
                                status: payload.status,
                                liveStatus: payload.liveStatus,
                                acceptedAt: payload.acceptedAt,
                            },
                        },
                        currentDriverCoords: driverCoordsRef.current || readStoredDriverCoords() || null,
                    },
                });
            };

            const onWalletUpdated = (payload) => {
                if (payload?.wallet) {
                    applyWallet(payload.wallet);

                    const nextWalletAlertState = getWalletAlertState(payload.wallet, {
                        ignoreRestrictions: isOwnerManagedDriver,
                    });

                    if (nextWalletAlertState.isBlocked) {
                        setShowRequest(false);
                        setCurrentRequest(null);
                        stopRideRequestAlertSound();
                        setStatusMessage(
                            nextWalletAlertState.belowMinimumBalance
                                ? `Keep your wallet at or above Rs ${Math.max(0, nextWalletAlertState.minimumBalanceForOrders)} to receive new ride requests.`
                                : 'Cash limit exceeded. Top up to receive new ride requests.',
                        );
                    } else if (nextWalletAlertState.isWarning) {
                        setStatusMessage('Available cash limit is getting low. Top up soon.');
                    }
                }

                if (payload?.notification) {
                    addLocalDriverNotification({
                        id: payload.notification.id || `wallet-${Date.now()}`,
                        title: payload.notification.title || 'Payment received',
                        body: payload.notification.body || 'A rider payment was received.',
                        sentAt: payload.notification.sentAt || new Date().toISOString(),
                        source: 'wallet_event',
                    });
                    refreshNotificationCount();
                }
            };

            socketService.on('rideRequest', onRideRequest);
            socketService.on('rideRequestClosed', onRideRequestClosed);
            socketService.on('errorMessage', onSocketError);
            socketService.on('rideAccepted', openAcceptedRide);
            socketService.on('rideBidSubmitted', onRideBidSubmitted);
            socketService.on('rideBiddingUpdated', onRideBiddingUpdated);
            socketService.on('driver:wallet:updated', onWalletUpdated);
            console.info('[driver-home] socket listeners registered');
            socket.on('connect', onSocketConnect);
            socket.on('disconnect', onSocketDisconnect);
            socket.on('connect_error', onSocketConnectError);
            socket.io.on('reconnect_attempt', onSocketReconnectAttempt);

            const locationInterval = setInterval(() => {
                getCurrentCoords({ purpose: 'background' })
                    .then((coordinates) => {
                        driverCoordsRef.current = coordinates;
                        setDriverCoords(coordinates);
                        persistStoredDriverInfo({
                            location: {
                                coordinates,
                            },
                            coordinates,
                        });
                        const emitted = emitOnlineLocationUpdate(coordinates);
                        if (emitted) {
                            console.info('[driver-home] periodic locationUpdate emitted', coordinates);
                        }
                    })
                    .catch((error) => {
                        console.warn('[driver-home] periodic location update skipped', error?.message || error);
                        setStatusMessage(error.message || 'Could not update live location.');
                    });
            }, 10000);

            return () => {
                console.info('[driver-home] cleaning up socket listeners');
                socketService.off('rideRequest', onRideRequest);
                socketService.off('rideRequestClosed', onRideRequestClosed);
                socketService.off('errorMessage', onSocketError);
                socketService.off('rideAccepted', openAcceptedRide);
                socketService.off('rideBidSubmitted', onRideBidSubmitted);
                socketService.off('rideBiddingUpdated', onRideBiddingUpdated);
                socketService.off('driver:wallet:updated', onWalletUpdated);
                socket.off('connect', onSocketConnect);
                socket.off('disconnect', onSocketDisconnect);
                socket.off('connect_error', onSocketConnectError);
                socket.io.off('reconnect_attempt', onSocketReconnectAttempt);
                clearInterval(locationInterval);
            };
        }
        if (!isOnline) {
            console.info('[driver-home] driver offline, disconnecting socket');
            clearRecoveryBurst();
            setSocketStatus('offline');
            socketService.disconnect();
        }
        return undefined;
    }, [applyWallet, clearAcceptRecovery, clearRecoveryBurst, emitOnlineLocationUpdate, fetchActiveJob, isOnline, isOwnerManagedDriver, loadScheduledRides, navigate, refreshNotificationCount, scheduleRecoveryBurst, tabActive]);

    useEffect(() => {
        if (!isOnline || !tabActive) {
            return undefined;
        }

        const handleVisibilityRecovery = () => {
            if (document.visibilityState === 'visible') {
                scheduleRecoveryBurst({ reason: 'visibility' });
            }
        };

        const handleWindowFocus = () => {
            scheduleRecoveryBurst({ reason: 'focus' });
        };

        const handlePageShow = () => {
            scheduleRecoveryBurst({ reason: 'pageshow' });
        };

        const handleNetworkOnline = () => {
            scheduleRecoveryBurst({ reason: 'network' });
        };

        document.addEventListener('visibilitychange', handleVisibilityRecovery);
        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('pageshow', handlePageShow);
        window.addEventListener('online', handleNetworkOnline);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityRecovery);
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('pageshow', handlePageShow);
            window.removeEventListener('online', handleNetworkOnline);
        };
    }, [isOnline, scheduleRecoveryBurst, tabActive]);

    useEffect(() => {
        if (!isOnline || !tabActive) {
            return undefined;
        }

        const healthCheckInterval = setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return;
            }

            if (!socketService.isConnected()) {
                setSocketStatus('reconnecting');
                scheduleRecoveryBurst({ reason: 'health-check' });
            }
        }, 8000);

        return () => {
            clearInterval(healthCheckInterval);
        };
    }, [isOnline, scheduleRecoveryBurst, tabActive]);

    const liveActiveSeconds = Math.max(0, Number(todaySummary.activeSeconds || 0));
    const dutyHours = Math.floor(liveActiveSeconds / 3600);
    const dutyMins = Math.floor((liveActiveSeconds % 3600) / 60);
    // under an hour only the minutes ("3m", not "0h 3m")
    const activeTimeLabel = dutyHours > 0 ? `${dutyHours}h ${dutyMins}m` : `${dutyMins}m`;

    const handleAccept = () => {
        if (!currentRequest?.rideId || acceptingRideId) {
            return;
        }

        const acceptedRequestType = currentRequest.type || 'ride';
        acceptingRideIdRef.current = currentRequest.rideId;
        setAcceptingRideId(currentRequest.rideId);
        setStatusMessage('Accepting ride...');
        stopRideRequestAlertSound();
        // The request stays on screen ("Accepting...") until the server confirms: 'rideAccepted' opens the trip, a refusal
        // shows its reason. (It used to open the trip screen at once, so a refused accept - ride taken by someone else,
        // wallet rule... - still let the captain "drive" and "drop" a ride the rider never saw.)
        socketService.emit('acceptRide', { rideId: currentRequest.rideId });
        scheduleAcceptRecovery(acceptedRequestType);
        const acceptedRideId = currentRequest.rideId;
        setTimeout(() => {
            if (acceptingRideIdRef.current && acceptingRideIdRef.current === acceptedRideId) {
                acceptingRideIdRef.current = '';
                setAcceptingRideId('');
                setShowRequest(false);
                setCurrentRequest(null);
                setStatusMessage('Could not accept this ride. It may have been taken - wait for the next request.');
                toast.error('Could not accept this ride. It may have been taken by another captain.');
            }
        }, 9000);
    };

    const handleDecline = () => {
        if (currentRequest?.rideId) {
            socketService.emit('rejectRide', { rideId: currentRequest.rideId });
        }
        stopRideRequestAlertSound();
        setShowRequest(false);
    };

    const handleSubmitBid = (bidFare) => {
        if (!currentRequest?.rideId || acceptingRideId || currentRequest?.raw?.pricingNegotiationMode !== 'driver_bid') {
            return;
        }

        acceptingRideIdRef.current = currentRequest.rideId;
        setAcceptingRideId(currentRequest.rideId);
        setStatusMessage('Submitting bid...');
        stopRideRequestAlertSound();
        socketService.emit('submitRideBid', { rideId: currentRequest.rideId, bidFare });
    };

    // --- duty toggle knob (web: motion x 0 -> 72, spring 400 / 30)
    const knobX = useRef(new Animated.Value(isOnline ? 72 : 0)).current;
    useEffect(() => {
        const a = Animated.spring(knobX, { toValue: isOnline ? 72 : 0, stiffness: 400, damping: 30, mass: 1, useNativeDriver: true });
        a.start();
        return () => a.stop();
    }, [isOnline, knobX]);

    // --- today's summary chevron (web: rotate 90 / -90 in 0.2 s)
    const chevronRotation = useRef(new Animated.Value(isTodaySummaryExpanded ? 1 : 0)).current;
    useEffect(() => {
        const a = Animated.timing(chevronRotation, { toValue: isTodaySummaryExpanded ? 1 : 0, duration: 200, useNativeDriver: true });
        a.start();
        return () => a.stop();
    }, [chevronRotation, isTodaySummaryExpanded]);

    const toggleTodaySummary = () => {
        // web: height auto <-> 0 with opacity in 0.24 s
        LayoutAnimation.configureNext(LayoutAnimation.create(240, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
        setIsTodaySummaryExpanded((current) => !current);
    };

    // the map is built after the brand splash has gone (building it under the splash froze the splash animation)
    const splashDone = useSplashDone();
    const mapsReady = HAS_VALID_GOOGLE_MAPS_KEY && !mapLoadError && splashDone;
    const [mapPainted, setMapPainted] = useState(false);
    const windowHeight = Dimensions.get('window').height;
    const lastNoticeRef = useRef(null);
    if (walletNotice) lastNoticeRef.current = walletNotice;

    return (
        <View style={styles.root}>
            {tabActive ? <StatusBar style="light" /> : null}

            {/* Overlay for Ride Request Modal */}
            <IncomingRideRequest
                visible={tabActive && showRequest && Boolean(currentRequest)}
                requestData={currentRequest}
                isAccepting={Boolean(acceptingRideId)}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onSubmitBid={handleSubmitBid}
            />
            <IncomingRideRequest
                visible={tabActive && Boolean(selectedScheduledRide)}
                requestData={selectedScheduledRide}
                mode="preview"
                onPreviewCancel={handleCancelScheduledRide}
                isPreviewCancelling={cancellingScheduledRideId === selectedScheduledRide?.rideId}
                canPreviewCancel={Boolean(selectedScheduledRide?.isAssignedToCurrentDriver)}
                previewCancelDisabledLabel="Not assigned yet"
                previewCancelHelpText={
                    selectedScheduledRide?.isAssignedToCurrentDriver
                        ? 'Cancelling here will also notify the user immediately.'
                        : 'This scheduled request is visible to you, but only a ride already assigned to you can be cancelled from here.'
                }
                onClose={() => setSelectedScheduledRide(null)}
                onDecline={() => setSelectedScheduledRide(null)}
            />

            {/* Go offline? */}
            <Dialog
                open={tabActive && showOfflineConfirm}
                onClose={() => setShowOfflineConfirm(false)}
                backdropOpacity={0.45}
                style={styles.dialogCard}
            >
                <Text style={styles.dialogTitle}>Go offline?</Text>
                <Text style={styles.dialogBody}>New ride requests will stop until you go online again.</Text>
                <View style={styles.dialogActions}>
                    <PressScale scale={0.97} onPress={() => setShowOfflineConfirm(false)} style={[styles.flexCell, styles.outlineBlueBtn]}>
                        <Text numberOfLines={1} style={styles.outlineBlueBtnText}>Stay Online</Text>
                    </PressScale>
                    <PressScale
                        scale={0.97}
                        onPress={() => {
                            setShowOfflineConfirm(false);
                            goOffline();
                        }}
                        style={[styles.flexCell, styles.gradientBtnShadow]}
                    >
                        <LinearGradient colors={[colors.blue[700], colors.blue[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientBtn}>
                            <Text numberOfLines={1} style={styles.gradientBtnText}>Go Offline</Text>
                        </LinearGradient>
                    </PressScale>
                </View>
            </Dialog>

            {/* Low wallet */}
            <Dialog
                open={tabActive && lowWalletPopupOpen && Boolean(lowWalletPopupKind)}
                onClose={() => setLowWalletPopupOpen(false)}
                backdropOpacity={0.45}
                style={styles.dialogCard}
            >
                <View style={styles.lowWalletIcon}>
                    <Wallet size={22} strokeWidth={2.6} color={colors.rose[600]} />
                </View>
                {shownLowWalletKind === 'owner' ? (
                    <>
                        <Text accessibilityRole="header" style={[styles.dialogTitle, styles.mt4]}>Owner wallet balance is low</Text>
                        <Text style={styles.dialogBody}>
                            {`Your fleet owner's wallet has less than Rs ${ownerWalletMinimum}. You will not receive any ride requests until your owner adds money to their wallet.`}
                        </Text>
                        <Text style={styles.dialogBody}>
                            {`Please ask your owner to keep at least Rs ${ownerWalletMinimum} in their wallet.`}
                        </Text>
                        <PressScale scale={0.97} onPress={() => setLowWalletPopupOpen(false)} style={[styles.gradientBtnShadow, styles.mt6]}>
                            <LinearGradient colors={[colors.blue[700], colors.blue[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientBtn}>
                                <Text style={styles.gradientBtnText}>OK, got it</Text>
                            </LinearGradient>
                        </PressScale>
                    </>
                ) : (
                    <>
                        <Text accessibilityRole="header" style={[styles.dialogTitle, styles.mt4]}>Add money to your wallet</Text>
                        <Text style={styles.dialogBody}>
                            {`Your wallet balance is Rs ${Number(walletSummary.balance || 0).toFixed(0)}. ${walletAlertState.minimumBalanceForOrders > 0
                                ? `Keep at least Rs ${walletAlertState.minimumBalanceForOrders} in your wallet, otherwise you will not receive any ride requests.`
                                : 'Your cash limit is used up. Add money to your wallet, otherwise you will not receive any ride requests.'}`}
                        </Text>
                        <View style={styles.dialogActions}>
                            <PressScale scale={0.97} onPress={() => setLowWalletPopupOpen(false)} style={[styles.flexCell, styles.outlineBlueBtn]}>
                                <Text numberOfLines={1} style={styles.outlineBlueBtnText}>Later</Text>
                            </PressScale>
                            <PressScale
                                scale={0.97}
                                onPress={() => {
                                    setLowWalletPopupOpen(false);
                                    navigate('/taxi/driver/wallet');
                                }}
                                style={[styles.flexCell, styles.gradientBtnShadow]}
                            >
                                <LinearGradient colors={[colors.blue[700], colors.blue[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientBtn}>
                                    <Text numberOfLines={1} style={styles.gradientBtnText}>Add Money</Text>
                                </LinearGradient>
                            </PressScale>
                        </View>
                    </>
                )}
            </Dialog>

            {/* Daily selfie */}
            <Dialog
                open={tabActive && showOnlineSelfiePrompt}
                onClose={() => !selfieUploading && setShowOnlineSelfiePrompt(false)}
                dismissible={!selfieUploading}
                backdropOpacity={0.5}
                style={styles.dialogCard}
            >
                <Text style={styles.selfieEyebrow}>Daily check-in</Text>
                <Text style={styles.selfieTitle}>Upload today's selfie</Text>
                <Text style={styles.dialogBody}>
                    Before going online, submit a fresh selfie for today. This helps verify the driver account as part of the daily check-in.
                </Text>

                {selfieError ? (
                    <View style={styles.selfieErrorBox}>
                        <Text style={styles.selfieErrorText}>{selfieError}</Text>
                    </View>
                ) : null}

                <View style={[styles.dialogActions, styles.mt5]}>
                    <Pressable
                        disabled={selfieUploading}
                        onPress={() => {
                            setShowOnlineSelfiePrompt(false);
                        }}
                        style={[styles.flexCell, styles.selfieCancelBtn, selfieUploading && styles.disabled]}
                    >
                        <Text numberOfLines={1} style={styles.selfieCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                        disabled={selfieUploading}
                        onPress={openSelfieCamera}
                        style={[styles.flexCell, styles.selfieTakeBtn, selfieUploading && styles.disabled]}
                    >
                        <Camera size={14} color={colors.white} />
                        <Text numberOfLines={1} style={styles.selfieTakeText}>{selfieUploading ? 'Uploading...' : 'Take New Selfie'}</Text>
                    </Pressable>
                </View>
            </Dialog>

            {/* Scheduled rides */}
            <Sheet
                open={tabActive && isScheduleSheetOpen}
                onClose={() => setIsScheduleSheetOpen(false)}
                backdropOpacity={0.45}
                style={[styles.scheduleSheet, { maxHeight: windowHeight * 0.78, paddingBottom: 20 + insets.bottom }]}
            >
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                    <View style={styles.flexCell}>
                        <Text style={styles.sheetEyebrow}>Schedule</Text>
                        <Text style={styles.sheetTitle}>Scheduled rides</Text>
                        <Text style={styles.sheetSubtitle}>Upcoming scheduled requests available for this driver.</Text>
                    </View>
                    <PressScale onPress={() => setIsScheduleSheetOpen(false)} style={styles.sheetClose}>
                        <ChevronRight size={18} color={colors.slate[500]} style={styles.rotate45} />
                    </PressScale>
                </View>

                <ScrollView
                    style={[styles.sheetList, { maxHeight: windowHeight * 0.58 }]}
                    contentContainerStyle={styles.sheetListContent}
                    refreshControl={<RefreshControl refreshing={false} onRefresh={loadScheduledRides} colors={[BLUE]} tintColor={BLUE} />}
                >
                    {isScheduleLoading ? (
                        Array.from({ length: 3 }).map((_, index) => (
                            <View key={index} style={styles.scheduleSkeletonCard}>
                                <Skeleton width="50%" height={12} rounded={9999} style={styles.skeletonSlate200} />
                                <Skeleton width="100%" height={10} rounded={9999} style={[styles.skeletonSlate100, styles.mt3]} />
                                <Skeleton width="80%" height={10} rounded={9999} style={[styles.skeletonSlate100, styles.mt2]} />
                            </View>
                        ))
                    ) : scheduledRides.length === 0 ? (
                        <View style={styles.scheduleEmpty}>
                            <View style={styles.scheduleEmptyIcon}>
                                <CalendarClock size={28} strokeWidth={1.8} color={colors.slate[300]} />
                            </View>
                            <Text style={styles.scheduleEmptyTitle}>No scheduled rides yet</Text>
                            <Text style={styles.scheduleEmptyText}>Scheduled bookings will show here when they are assigned.</Text>
                        </View>
                    ) : (
                        scheduledRides.map((ride) => (
                            <PressScale
                                key={ride.rideId}
                                scale={0.99}
                                onPress={() => setSelectedScheduledRide(createScheduledRidePreview(ride))}
                                style={styles.scheduleCard}
                            >
                                <View style={styles.scheduleCardRow}>
                                    <View style={styles.scheduleCardIcon}>
                                        <CalendarClock size={18} strokeWidth={2.2} color={BLUE} />
                                    </View>
                                    <View style={styles.flexCell}>
                                        <View style={styles.scheduleCardTop}>
                                            <View style={styles.flexCell}>
                                                <Text numberOfLines={1} style={styles.scheduleCardTitle}>
                                                    {ride.type === 'parcel' ? 'Scheduled delivery' : ride.type === 'intercity' ? 'Scheduled intercity ride' : 'Scheduled ride'}
                                                </Text>
                                                <Text style={styles.scheduleCardWhen}>{formatScheduledDateTime(ride.scheduledAt)}</Text>
                                                <Text style={styles.scheduleCardCountdown}>{getScheduledRideCountdown(ride.scheduledAt, scheduleNow)}</Text>
                                            </View>
                                            <View style={styles.scheduleFarePill}>
                                                <Text style={styles.scheduleFareText}>{formatFareLabel(ride.fare || ride.baseFare)}</Text>
                                            </View>
                                        </View>
                                        <Text numberOfLines={1} style={styles.scheduleCardRider}>
                                            {`${ride.user?.name || 'Customer'}${ride.user?.phone ? ` • ${ride.user.phone}` : ''}`}
                                        </Text>
                                        <Text numberOfLines={1} style={[styles.scheduleCardAddress, styles.mt2]}>
                                            {`Pickup: ${ride.pickupAddress || 'Pickup point'}`}
                                        </Text>
                                        <Text numberOfLines={1} style={[styles.scheduleCardAddress, styles.mt1]}>
                                            {`Drop: ${ride.dropAddress || 'Drop point'}`}
                                        </Text>
                                    </View>
                                </View>
                            </PressScale>
                        ))
                    )}
                </ScrollView>
            </Sheet>

            {/* --- MAP BACKGROUND --- */}
            <View style={StyleSheet.absoluteFill}>
                {mapsReady ? (
                    <AppMap
                        ref={mapRef}
                        style={StyleSheet.absoluteFill}
                        initialRegion={initialRegion}
                        customMapStyle={mapStyles}
                        zoomControlEnabled={false}
                        rotateEnabled={false}
                        pitchEnabled={false}
                        moveOnMarkerPress={false}
                        onMapReady={() => setMapReady(true)}
                        onMapLoaded={() => setMapPainted(true)}
                    >
                        <VehicleMarker position={driverPosition} icon={mapVehicleIcon} />
                    </AppMap>
                ) : null}
                {/* stays on top until the map has drawn its tiles (no bare grey map in between) */}
                {!mapsReady || !mapPainted ? (
                    <View style={[StyleSheet.absoluteFill, styles.mapPlaceholder]}>
                        <View style={styles.mapPlaceholderInner}>
                            <Skeleton width={64} height={64} rounded={32} style={styles.mapPlaceholderDot} />
                            <Text style={styles.mapPlaceholderText}>
                                {!HAS_VALID_GOOGLE_MAPS_KEY ? 'Map unavailable. Configure Google Maps key.' : mapLoadError ? 'Map could not load. Check your internet connection.' : 'Loading map...'}
                            </Text>
                        </View>
                    </View>
                ) : null}
            </View>

            {/* Status Based Background Overlay */}
            <FadePresence show={!isOnline} offsetY={0} scaleFrom={1} pointerEvents="none" style={styles.offlineOverlay}>
                <LinearGradient
                    pointerEvents="none"
                    colors={['transparent', 'transparent', alpha(colors.slate[900], 0.1)]}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                />
            </FadePresence>

            <View style={styles.recenterWrap} pointerEvents="box-none">
                <Pressable
                    onPress={recenterMap}
                    accessibilityRole="button"
                    accessibilityLabel="Recenter map"
                    style={({ pressed }) => [styles.recenterBtn, pressed && styles.pressed90]}
                >
                    <Target size={20} strokeWidth={2.4} color={colors.slate[900]} />
                </Pressable>
            </View>

            {/* --- BOTTOM FLOATING UI --- */}
            {/* Sits just above the floating bottom bar (24px from the edge + 72px tall + safe area). */}
            <View style={[styles.bottomUi, { bottom: 88 + insets.bottom }]} pointerEvents="box-none">
                <FadePresence show={Boolean(statusMessage)} style={styles.statusBox}>
                    <Text style={styles.statusText}>{statusMessage}</Text>
                    {/documents/i.test(statusMessage) ? (
                        <PressScale onPress={() => navigate('/taxi/driver/documents')} style={styles.statusDocsBtn}>
                            <Text style={styles.statusDocsText}>Open Documents</Text>
                        </PressScale>
                    ) : null}
                </FadePresence>

                {/* Today's Stats Summary - Visible in both offline and online modes */}
                <View style={styles.summaryCard}>
                    <Pressable
                        onPress={toggleTodaySummary}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isTodaySummaryExpanded }}
                        accessibilityLabel={isTodaySummaryExpanded ? 'Collapse today summary' : 'Expand today summary'}
                        style={styles.summaryHeader}
                    >
                        <View style={styles.summaryHeaderLeft}>
                            <Text style={styles.summaryTitle}>Today's Summary</Text>
                            <PulseDot />
                        </View>
                        <Animated.View
                            style={[
                                styles.summaryChevron,
                                { transform: [{ rotate: chevronRotation.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '90deg'] }) }] },
                            ]}
                        >
                            <ChevronRight size={16} strokeWidth={2.8} color={colors.slate[500]} />
                        </Animated.View>
                    </Pressable>

                    {isTodaySummaryExpanded ? (
                        <View style={styles.summaryContent}>
                            <View style={styles.summaryGrid}>
                                <View style={styles.summaryCell}>
                                    <View style={styles.summaryIcon}>
                                        <IndianRupee size={18} strokeWidth={2.5} color={colors.slate[600]} />
                                    </View>
                                    {summaryLoaded ? <Text style={styles.summaryValue}>{formatSummaryMoney(todaySummary.earnings)}</Text> : <SummaryNumberSkeleton />}
                                    <Text style={styles.summaryLabel}>Earnings</Text>
                                </View>

                                <View style={styles.summaryCell}>
                                    <View style={styles.summaryIcon}>
                                        <Clock size={18} strokeWidth={2.5} color={colors.slate[600]} />
                                    </View>
                                    {summaryLoaded ? <Text style={styles.summaryValue}>{activeTimeLabel}</Text> : <SummaryNumberSkeleton />}
                                    <Text style={styles.summaryLabel}>Active</Text>
                                </View>

                                <View style={styles.summaryCell}>
                                    <View style={styles.summaryIcon}>
                                        <Navigation size={18} strokeWidth={2.5} color={colors.slate[600]} />
                                    </View>
                                    {summaryLoaded ? <Text style={styles.summaryValue}>{formatSummaryDistance(todaySummary.distanceMeters)}</Text> : <SummaryNumberSkeleton />}
                                    <Text style={styles.summaryLabel}>Distance</Text>
                                </View>

                                <View style={styles.summaryCell}>
                                    <View style={styles.summaryIcon}>
                                        <BarChart2 size={18} strokeWidth={2.5} color={colors.slate[600]} />
                                    </View>
                                    {summaryLoaded ? <Text style={styles.summaryValue}>{String(todaySummary.rides)}</Text> : <SummaryNumberSkeleton />}
                                    <Text style={styles.summaryLabel}>Rides</Text>
                                </View>
                            </View>
                        </View>
                    ) : null}
                </View>
            </View>

            <DriverTopBar floating>
                <PressScale
                    scale={0.9}
                    onPress={() => {
                        loadScheduledRides();
                        setIsScheduleSheetOpen(true);
                    }}
                    style={styles.glassBtn}
                >
                    <CalendarClock size={18} color={colors.white} />
                    {scheduledRideCount > 0 ? (
                        <View style={[styles.countBadge, styles.countBadgeBlue]}>
                            <Text style={styles.countBadgeText}>{scheduledRideCount > 99 ? '99+' : String(scheduledRideCount)}</Text>
                        </View>
                    ) : null}
                </PressScale>

                <PressScale scale={0.9} onPress={() => navigate('/taxi/driver/notifications')} style={styles.glassBtn}>
                    <Bell size={18} color={colors.white} />
                    {notificationCount > 0 ? (
                        <View style={[styles.countBadge, styles.countBadgeRose]}>
                            <Text style={styles.countBadgeText}>{notificationCount > 99 ? '99+' : String(notificationCount)}</Text>
                        </View>
                    ) : null}
                </PressScale>
                <PressScale onPress={() => navigate('/taxi/driver/wallet')} style={styles.walletChip}>
                    <IndianRupee size={12} color={colors.emerald[400]} strokeWidth={3} />
                    {walletLoaded ? (
                        <Text style={styles.walletChipText}>
                            {Number(walletSummary.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </Text>
                    ) : (
                        <Skeleton width={36} height={14} rounded={6} style={styles.walletChipSkeleton} />
                    )}
                </PressScale>
            </DriverTopBar>

            {/* --- DUTY TOGGLE (under the header) --- */}
            <View style={[styles.dutyWrap, { top: 82 + insets.top }]} pointerEvents="box-none">
                <Pressable
                    disabled={isTogglingDuty}
                    onPress={handleDutyToggle}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: isOnline, disabled: isTogglingDuty }}
                    style={[styles.dutyToggle, isOnline ? styles.dutyToggleOnline : styles.dutyToggleOffline]}
                >
                    <Animated.View style={[styles.dutyKnob, { transform: [{ translateX: knobX }] }]}>
                        <Power size={14} color={isOnline ? colors.emerald[500] : colors.slate[400]} strokeWidth={3} />
                    </Animated.View>
                    <View style={styles.dutyLabelWrap}>
                        <Text style={[styles.dutyLabel, isOnline ? styles.dutyLabelOnline : styles.dutyLabelOffline]}>
                            {isOnline ? 'Online' : 'Offline'}
                        </Text>
                    </View>
                </Pressable>
            </View>

            {walletNotice || lastNoticeRef.current ? (
                <FadePresence show={Boolean(walletNotice)} offsetY={0} scaleFrom={1} style={[styles.noticeWrap, { top: 148 + insets.top }]}>
                    {(() => {
                        const notice = walletNotice || lastNoticeRef.current;
                        const danger = notice.tone === 'danger';
                        return (
                            <View style={[styles.noticeCard, { borderColor: danger ? colors.rose[100] : colors.amber[100] }]}>
                                <View style={[styles.noticeIcon, { backgroundColor: danger ? colors.rose[50] : colors.amber[50] }]}>
                                    <Wallet size={18} strokeWidth={2.6} color={danger ? colors.rose[600] : colors.amber[600]} />
                                </View>
                                <View style={styles.flexCell}>
                                    <View style={styles.noticeTitleRow}>
                                        <Text numberOfLines={1} style={styles.noticeTitle}>{notice.title}</Text>
                                        <View style={[styles.noticePill, { backgroundColor: danger ? colors.rose[50] : colors.amber[50] }]}>
                                            <Text style={[styles.noticePillText, { color: danger ? colors.rose[600] : colors.amber[600] }]}>
                                                {`Rs ${Number(walletSummary.balance || 0).toFixed(0)}`}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={styles.noticeMessage}>{notice.message}</Text>
                                </View>
                                {notice.hideTopUp ? null : (
                                    <PressScale onPress={() => navigate('/taxi/driver/wallet')} style={styles.topUpBtn}>
                                        <Text style={styles.topUpText}>Top up</Text>
                                    </PressScale>
                                )}
                            </View>
                        );
                    })()}
                </FadePresence>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: colors.gray[200] },
    flexCell: { flex: 1, minWidth: 0 },
    mt1: { marginTop: 4 },
    mt2: { marginTop: 8 },
    mt3: { marginTop: 12 },
    mt4: { marginTop: 16 },
    mt5: { marginTop: 20 },
    mt6: { marginTop: 24 },
    disabled: { opacity: 0.6 },
    pressed90: { transform: [{ scale: 0.9 }] },
    rotate45: { transform: [{ rotate: '45deg' }] },
    vehicleIcon: { width: 40, height: 40 },

    // --- map
    mapPlaceholder: { backgroundColor: colors.slate[200], alignItems: 'center', justifyContent: 'center' },
    mapPlaceholderInner: { alignItems: 'center', paddingHorizontal: 40 },
    mapPlaceholderDot: { backgroundColor: colors.slate[300], marginBottom: 16 },
    mapPlaceholderText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[500], textAlign: 'center' },
    offlineOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10 },

    recenterWrap: { position: 'absolute', right: 20, top: '50%', marginTop: -24, zIndex: 30, elevation: 9 },
    recenterBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: alpha(colors.white, 0.95),
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.slate[900],
        shadowOpacity: 0.16,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 12 },
        elevation: 9,
    },

    // --- header buttons (driverChrome.css .driver-glass-btn)
    glassBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.35)',
        backgroundColor: 'rgba(255, 255, 255, 0.16)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    countBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        height: 16,
        minWidth: 16,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: colors.white,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countBadgeBlue: { backgroundColor: BLUE },
    countBadgeRose: { backgroundColor: colors.rose[500] },
    countBadgeText: { fontSize: 8, lineHeight: 10, fontWeight: '900', color: colors.white },
    walletChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: alpha(colors.white, 0.1),
        backgroundColor: colors.black,
        paddingHorizontal: 12,
        paddingVertical: 6,
        shadowColor: colors.black,
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
    },
    walletChipText: { fontSize: 13, lineHeight: 18, fontWeight: '900', letterSpacing: -0.325, color: colors.white },
    walletChipSkeleton: { marginVertical: 2, backgroundColor: alpha(colors.white, 0.25) },

    // --- duty toggle
    dutyWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 40, elevation: 10 },
    dutyToggle: {
        width: 112,
        height: 40,
        borderRadius: 20,
        padding: 4,
        flexDirection: 'row',
        alignItems: 'center',
        // a dark (near-black) switch with a green ONLINE / grey OFFLINE label, not the partner blue
        backgroundColor: colors.slate[900],
        shadowColor: colors.black,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
    },
    dutyToggleOnline: { shadowOpacity: 0.25 },
    dutyToggleOffline: { shadowOpacity: 0.15 },
    dutyKnob: {
        position: 'absolute',
        left: 4,
        top: 4,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.black,
        shadowOpacity: 0.08,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
    dutyLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingLeft: 8 },
    dutyLabel: { fontSize: 9, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9 },
    dutyLabelOnline: { color: colors.emerald[400], marginRight: 24 },
    dutyLabelOffline: { color: colors.slate[400], marginLeft: 24 },

    // --- wallet notice
    noticeWrap: { position: 'absolute', left: 16, right: 16, zIndex: 40, elevation: 10 },
    noticeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 21.6,
        borderWidth: 1,
        backgroundColor: alpha(colors.white, 0.95),
        paddingHorizontal: 14,
        paddingVertical: 12,
        shadowColor: colors.slate[900],
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 16 },
        elevation: 10,
    },
    noticeIcon: { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    noticeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    noticeTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '900', letterSpacing: -0.35, color: colors.slate[950] },
    noticePill: { borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
    noticePillText: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
    noticeMessage: { marginTop: 2, fontSize: 12, lineHeight: 16.5, fontWeight: '600', color: colors.slate[500] },
    topUpBtn: {
        borderRadius: 9999,
        backgroundColor: PARTNER_BUTTON,
        paddingHorizontal: 12,
        paddingVertical: 8,
        shadowColor: colors.black,
        shadowOpacity: 0.08,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
    topUpText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.white },

    // --- bottom floating UI
    bottomUi: {
        position: 'absolute',
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 16,
        zIndex: 60,
        elevation: 12,
        flexDirection: 'column',
    },
    statusBox: {
        marginBottom: 16,
        alignSelf: 'center',
        maxWidth: 280,
        borderRadius: 16,
        backgroundColor: alpha(colors.slate[900], 0.92),
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
        shadowColor: colors.black,
        shadowOpacity: 0.25,
        shadowRadius: 25,
        shadowOffset: { width: 0, height: 25 },
        elevation: 16,
    },
    statusText: { fontSize: 12, lineHeight: 19.5, fontWeight: '700', color: colors.white, textAlign: 'center' },
    statusDocsBtn: { marginTop: 8, borderRadius: 9999, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 6 },
    statusDocsText: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[900] },
    summaryCard: {
        width: '100%',
        overflow: 'hidden',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: colors.white,
        shadowColor: colors.black,
        shadowOpacity: 0.1,
        shadowRadius: 25,
        shadowOffset: { width: 0, height: 20 },
        elevation: 12,
    },
    summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
    summaryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    summaryTitle: { fontSize: 13, lineHeight: 18, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3, color: colors.slate[400] },
    pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.emerald[500] },
    summaryChevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
    summaryContent: { overflow: 'hidden', paddingHorizontal: 20, paddingBottom: 20 },
    summaryGrid: { flexDirection: 'row', gap: 8 },
    summaryCell: { flex: 1, alignItems: 'center' },
    summaryIcon: { marginBottom: 8, width: 40, height: 40, borderRadius: 16, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
    summaryValue: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
    summaryLabel: { fontSize: 9, lineHeight: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: -0.225, color: colors.slate[400] },
    summarySkeleton: { marginVertical: 3, backgroundColor: colors.slate[200] },

    // --- dialogs (web: w-[calc(100%-2.5rem)] max-w-sm rounded-[28px] p-6)
    dialogCard: {
        maxWidth: 384,
        marginHorizontal: 4,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: alpha(colors.white, 0.7),
        backgroundColor: colors.white,
        padding: 24,
        overflow: 'visible',
        shadowColor: colors.slate[900],
        shadowOpacity: 0.22,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 24 },
        elevation: 16,
    },
    dialogTitle: { fontSize: 19, lineHeight: 26, fontWeight: '900', letterSpacing: -0.475, color: colors.slate[950] },
    dialogBody: { marginTop: 8, fontSize: 13, lineHeight: 21, fontWeight: '600', color: colors.slate[500] },
    dialogActions: { marginTop: 24, flexDirection: 'row', gap: 12 },
    outlineBlueBtn: {
        height: 48,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: colors.blue[700],
        backgroundColor: colors.white,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    outlineBlueBtnText: { fontSize: 13, lineHeight: 18, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.52, color: colors.blue[700] },
    gradientBtnShadow: {
        borderRadius: 16,
        shadowColor: colors.blue[700],
        shadowOpacity: 0.32,
        shadowRadius: 11,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
    },
    gradientBtn: { height: 48, borderRadius: 16, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
    gradientBtnText: { fontSize: 13, lineHeight: 18, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.52, color: colors.white },
    lowWalletIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.rose[50], alignItems: 'center', justifyContent: 'center' },
    selfieEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.8, color: colors.emerald[500] },
    selfieTitle: { marginTop: 8, fontSize: 20, lineHeight: 28, fontWeight: '900', letterSpacing: -0.5, color: colors.slate[950] },
    selfieErrorBox: {
        marginTop: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.rose[100],
        backgroundColor: colors.rose[50],
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    selfieErrorText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.rose[600] },
    selfieCancelBtn: {
        height: 48,
        overflow: 'hidden',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.slate[200],
        backgroundColor: colors.slate[50],
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selfieCancelText: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.88, color: colors.slate[500] },
    selfieTakeBtn: {
        height: 48,
        borderRadius: 16,
        backgroundColor: colors.emerald[500],
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        shadowColor: colors.emerald[500],
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 14 },
        elevation: 6,
    },
    selfieTakeText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: colors.white },

    // --- scheduled rides sheet
    scheduleSheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        borderWidth: 1,
        borderColor: alpha(colors.white, 0.7),
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    sheetHandle: { alignSelf: 'center', width: 56, height: 6, borderRadius: 3, backgroundColor: colors.slate[200] },
    sheetHeader: { marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    sheetEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, color: colors.blue[500] },
    sheetTitle: { marginTop: 4, fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: -0.55, color: colors.slate[950] },
    sheetSubtitle: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
    sheetClose: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.slate[200],
        backgroundColor: colors.slate[50],
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetList: { marginTop: 16, flexGrow: 0 },
    sheetListContent: { gap: 12, paddingRight: 4 },
    scheduleSkeletonCard: {
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: colors.slate[50],
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    skeletonSlate200: { backgroundColor: colors.slate[200] },
    skeletonSlate100: { backgroundColor: colors.slate[100] },
    scheduleEmpty: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: colors.slate[50],
        paddingHorizontal: 20,
        paddingVertical: 40,
        alignItems: 'center',
    },
    scheduleEmptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 22,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.black,
        shadowOpacity: 0.05,
        shadowRadius: 1,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
    scheduleEmptyTitle: { marginTop: 16, fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.slate[700], textAlign: 'center' },
    scheduleEmptyText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400], textAlign: 'center' },
    scheduleCard: {
        width: '100%',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: colors.slate[50],
        paddingHorizontal: 16,
        paddingVertical: 16,
        shadowColor: colors.black,
        shadowOpacity: 0.05,
        shadowRadius: 1,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
    scheduleCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    scheduleCardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blue[100], alignItems: 'center', justifyContent: 'center' },
    scheduleCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    scheduleCardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[950] },
    scheduleCardWhen: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.6, color: colors.blue[500] },
    scheduleCardCountdown: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '900', color: colors.emerald[600] },
    scheduleFarePill: { borderRadius: 9999, backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 4 },
    scheduleFareText: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45, color: colors.slate[500] },
    scheduleCardRider: { marginTop: 12, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[500] },
    scheduleCardAddress: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[700] },
});

export default DriverHome;
