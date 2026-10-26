// Native conversion of Frontend/src/modules/Taxi/modules/driver/pages/ActiveTrip.jsx (/taxi/driver/active-trip).
// Same flow, texts, socket events, API calls, storage keys and timings as the web screen; the map is react-native-maps
// (AppMap), the route comes from the same computeDrivingRoute util (Routes v2), the sheets are native views.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import simplify from 'simplify-js';
import {
    MessageSquare,
    Phone,
    ShieldAlert,
    Check,
    Banknote,
    QrCode,
    Scan,
    ChevronRight,
    Star,
    CheckCircle2,
    Package,
    User,
    ArrowUpRight,
    ArrowLeft,
    Clock3,
    MapPinned,
} from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { router as expoRouter } from 'expo-router';
import { toast } from '@/lib/toast';
import { AppImage, Screen, Text, TextInput, resolveImageSource } from '@/native/ui';
import { AppMap, Marker, Polyline, regionFor, toLatLng as toMapLatLng } from '@/native/ui/AppMap';
import { colors, alpha } from '@/theme';
import { Geocoder } from '@/shared/maps/placesCompat';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { socketService } from '../../../shared/api/socket';
import api from '../../../shared/api/axiosInstance';
import { computeDrivingRoute } from '../../../shared/utils/googleRoutes';
import autoIcon from '../../../assets/icons/auto.png';
import bikeIcon from '../../../assets/icons/bike.png';
import carIcon from '../../../assets/icons/car.png';
import { getLocalDriverToken } from '../services/registrationService';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';
import useTripSimulationEnabled from '@/shared/hooks/useTripSimulationEnabled';
import useRideChatUnread from '../../shared/chat/useRideChatUnread';
import ChatUnreadBadge from '../../shared/components/ChatUnreadBadge';

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const DEFAULT_DRIVER_COORDS = [75.8577, 22.7196];
const ARRIVAL_RADIUS_METERS = 100;
const ROUTE_SIMPLIFY_TOLERANCE = 0.00008;
const ROUTE_OFF_PATH_METERS = 45;
const ROUTE_REFRESH_DEBOUNCE_MS = 2500;
const DRIVER_LOCATION_EMIT_MIN_DISTANCE_METERS = 12;
const DRIVER_LOCATION_EMIT_MIN_INTERVAL_MS = 3000;

const mapStyles = [
    { elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eef2f7' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e2e8f0' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
];

const toLatLng = (coordinates, fallback = DEFAULT_CENTER) => {
    const [lng, lat] = coordinates || [];

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return { lat: Number(lat), lng: Number(lng) };
    }

    return fallback;
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

const createOffsetPosition = (position, latOffset = -0.0045, lngOffset = -0.0035) => ({
    lat: Number(position?.lat ?? DEFAULT_CENTER.lat) + latOffset,
    lng: Number(position?.lng ?? DEFAULT_CENTER.lng) + lngOffset,
});

const arePositionsNearlyEqual = (first, second, threshold = 0.0002) => (
    Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
    Math.abs(Number(first?.lng ?? 0) - Number(second?.lng ?? 0)) < threshold
);

const getAreaName = (address, fallback) => {
    const cleanAddress = String(address || '').trim();

    if (!cleanAddress) {
        return fallback;
    }

    const parts = cleanAddress
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    // "Block, 3rd floor, Corporate House, 307 B, Regal Cir, ..." - the first parts are the rider's unit / floor / plot
    // number, which tells a driver nothing about where to go. Skip those and show the building / street / area instead.
    const isUnitPart = (part) => /^\d/.test(part)
        || /\b(floor|flat|plot|shop|room|unit|wing|block|tower|suite|office|house\s*no|h\.?\s*no)\b/i.test(part);
    const placeParts = parts.filter((part) => !isUnitPart(part));

    return (placeParts.length ? placeParts : parts).slice(0, 2).join(', ') || fallback;
};

const formatAddressFromPoint = (point, fallback) => {
    const coordinates = readCoordinatePair(point);

    if (!coordinates) {
        return fallback;
    }

    const [lng, lat] = coordinates;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

const normalizeTripType = (job = {}) => {
    const value = String(job.type || job.serviceType || 'ride').toLowerCase();
    if (value === 'parcel') return 'parcel';
    if (value === 'intercity') return 'intercity';
    return 'ride';
};

const getTripTitle = (type) => {
    if (type === 'parcel') return 'Delivery';
    if (type === 'intercity') return 'Intercity Ride';
    return 'Taxi Ride';
};

const cleanPhoneNumber = (phone) => String(phone || '').replace(/[^\d+]/g, '');

const buildFallbackRoute = (origin, destination) => [origin, destination];
const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;
const hexToRgba = (hex, alpha = 1) => {
    const sanitized = String(hex || '').replace('#', '');

    if (sanitized.length !== 6) {
        return `rgba(15, 23, 42, ${alpha})`;
    }

    const red = Number.parseInt(sanitized.slice(0, 2), 16);
    const green = Number.parseInt(sanitized.slice(2, 4), 16);
    const blue = Number.parseInt(sanitized.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const getJobRideId = (job = {}) => String(job.rideId || job.id || job._id || job.requestId || '').trim();
const ACTIVE_TRIP_HYDRATION_RETRY_DELAYS_MS = [0, 700, 1500, 2500, 4000];

const resolveVehiclePreviewIcon = (iconUrl = '', fallback = carIcon) => {
    const raw = String(iconUrl || '').trim();

    if (!raw) {
        return fallback;
    }

    if (/^(https?:|data:image\/|blob:)/.test(raw)) {
        return raw;
    }

    // Root-level files like `/4_Taxi.png` live in the frontend's public/ folder, not on the backend.
    if (/^\/[^/]+\.(png|jpe?g|svg|webp|gif)$/i.test(raw)) {
        return raw;
    }

    if (raw.startsWith('/')) {
        return `${BACKEND_ORIGIN}${raw}`;
    }

    if (/^(uploads\/|images\/)/.test(raw)) {
        return `${BACKEND_ORIGIN}/${raw}`;
    }

    return raw;
};

const getActiveTripVehicleIcon = (ride = {}, driver = {}) => {
    const customIcon = String(
        ride?.vehicleIconUrl ||
        ride?.vehicle?.vehicleIconUrl ||
        ride?.vehicle?.icon ||
        driver?.vehicleIconUrl ||
        driver?.map_icon ||
        driver?.icon ||
        '',
    ).trim();

    if (customIcon) {
        return resolveVehiclePreviewIcon(customIcon, carIcon);
    }

    const iconType = String(
        ride?.vehicleIconType ||
        driver?.vehicleIconType ||
        driver?.vehicleType ||
        '',
    ).toLowerCase();

    if (iconType.includes('bike')) return bikeIcon;
    if (iconType.includes('auto')) return autoIcon;
    if (iconType.includes('car')) return carIcon;

    return carIcon;
};

const getActiveTripPhaseKey = (id) => (id ? `driverActiveTripPhase:${id}` : '');
const getActiveTripUiStateKey = (id) => (id ? `driverActiveTripUiState:${id}` : '');
const ACTIVE_TRIP_SESSION_KEY = 'driverActiveTripSnapshot';

const readStoredTripPhase = (id) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return '';

    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
};

const writeStoredTripPhase = (id, nextPhase) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return;

    try {
        localStorage.setItem(key, nextPhase);
    } catch {
        // Local storage can be blocked in private contexts; trip still works without it.
    }
};

const clearStoredTripPhase = (id) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return;

    try {
        localStorage.removeItem(key);
    } catch {
        // No-op.
    }
};

const readStoredTripUiState = (id) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return null;

    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeStoredTripUiState = (id, nextState) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return;

    try {
        localStorage.setItem(key, JSON.stringify(nextState));
    } catch {
        // Ignore storage failures and continue with in-memory state.
    }
};

const clearStoredTripUiState = (id) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return;

    try {
        localStorage.removeItem(key);
    } catch {
        // No-op.
    }
};

const readStoredActiveTripSnapshot = () => {
    try {
        const raw = localStorage.getItem(ACTIVE_TRIP_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeStoredActiveTripSnapshot = (snapshot) => {
    try {
        localStorage.setItem(ACTIVE_TRIP_SESSION_KEY, JSON.stringify(snapshot));
    } catch {
        // Ignore storage failures.
    }
};

const clearStoredActiveTripSnapshot = () => {
    try {
        localStorage.removeItem(ACTIVE_TRIP_SESSION_KEY);
    } catch {
        // No-op.
    }
};

const isSnapshotForRide = (snapshot, rideId = '') => {
    const snapshotRideId = getJobRideId(snapshot?.request?.raw || snapshot?.request || snapshot || {});
    const normalizedRideId = String(rideId || '').trim();

    if (!snapshotRideId || !normalizedRideId) {
        return false;
    }

    return snapshotRideId === normalizedRideId;
};

const readStoredDriverCoords = () => {
    try {
        const stored = JSON.parse(localStorage.getItem('driverInfo') || '{}');
        const coordinates = stored?.location?.coordinates || stored?.coordinates;

        if (Array.isArray(coordinates) && coordinates.length === 2) {
            const [lng, lat] = coordinates;
            if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
                return [Number(lng), Number(lat)];
            }
        }
    } catch {
        // Ignore storage parsing issues and fall back to live geolocation.
    }

    return null;
};

const resolvePhaseFromJob = (job = {}) => {
    const rideId = getJobRideId(job);
    const explicitPhase = String(job.phase || '').toLowerCase();
    const storedPhase = readStoredTripPhase(rideId);
    const liveStatus = String(job.liveStatus || job.status || '').toLowerCase();

    if (liveStatus === 'cancelled' || liveStatus === 'canceled') {
        return 'cancelled';
    }

    if (['to_pickup', 'otp_verification', 'in_trip', 'payment_confirm', 'review'].includes(explicitPhase)) {
        return explicitPhase;
    }

    if (['to_pickup', 'otp_verification', 'in_trip', 'payment_confirm', 'review'].includes(storedPhase)) {
        return storedPhase;
    }

    if (liveStatus === 'arriving') return 'otp_verification';
    if (liveStatus === 'started' || liveStatus === 'ongoing') return 'in_trip';
    if (liveStatus === 'arrived') return 'payment_confirm';
    if (liveStatus === 'completed') return 'review';

    return 'to_pickup';
};
const withDriverAuthorization = (token) => (
    token
        ? {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        : {}
);

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

const getCurrentCoords = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
        reject(new Error('Location is not available on this device.'));
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('Please allow location permission to continue tracking.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
});

const parseFareAmount = (value) => {
    const numeric = Number(String(value || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
};

const formatCurrencyAmount = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return 'Rs 0';
    }

    const hasDecimals = Math.abs(numeric % 1) > 0.001;
    return `Rs ${hasDecimals ? numeric.toFixed(2) : Math.round(numeric)}`;
};

const formatDateTimeLabel = (value, fallback = '--') => {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const formatDurationLabel = (start, end = Date.now()) => {
    if (!start) {
        return '--';
    }

    const startTime = new Date(start).getTime();
    const endTime = typeof end === 'string' || end instanceof Date ? new Date(end).getTime() : Number(end);

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        return '--';
    }

    const totalMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes} min`;
};

const computeCommissionSummary = ({ fare = 0, promoDiscount = 0, pricingSnapshot = null, explicitCommissionAmount, explicitDriverEarnings }) => {
    // Promo discounts are paid by the platform: commission and earning are worked out on the fare before the discount.
    const normalizedFare = Math.max(0, Number(fare || 0)) + Math.max(0, Number(promoDiscount || 0));
    const commissionType = Number(pricingSnapshot?.admin_commission_type_from_driver ?? 1);
    const commissionValue = Math.max(0, Number(pricingSnapshot?.admin_commission_from_driver ?? 0));
    const fallbackCommissionAmount = commissionType === 1
        ? Math.round(((normalizedFare * commissionValue) / 100) * 100) / 100
        : Math.min(normalizedFare, commissionValue);
    const normalizedExplicitCommission = Number(explicitCommissionAmount);
    const normalizedExplicitDriverEarnings = Number(explicitDriverEarnings);
    const hasSettledExplicitCommission = Number.isFinite(normalizedExplicitCommission) && (
        normalizedExplicitCommission > 0
        || normalizedFare <= 0
        || fallbackCommissionAmount <= 0
    );
    const commissionAmount = hasSettledExplicitCommission
        ? Math.max(0, normalizedExplicitCommission)
        : fallbackCommissionAmount;
    const derivedDriverEarnings = Math.max(normalizedFare - commissionAmount, 0);
    const hasSettledExplicitDriverEarnings = Number.isFinite(normalizedExplicitDriverEarnings) && (
        normalizedExplicitDriverEarnings > 0
        || normalizedFare <= 0
        || derivedDriverEarnings <= 0
    );
    const driverEarnings = hasSettledExplicitDriverEarnings
        ? Math.max(0, normalizedExplicitDriverEarnings)
        : derivedDriverEarnings;

    return {
        commissionAmount,
        driverEarnings,
        commissionType,
        commissionValue,
        commissionLabel: commissionType === 1 ? `${commissionValue}%` : formatCurrencyAmount(commissionValue),
    };
};

const getSimulationPath = ({ routePath = [], from, to }) => {
    const path = routePath.length > 1 ? routePath : [from, to].filter(Boolean);
    const points = path
        .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));
    // The road route ends on the nearest road; finish on the exact pin (parcel delivery needs to be within 100 m of it).
    const target = to && Number.isFinite(Number(to.lat)) && Number.isFinite(Number(to.lng))
        ? { lat: Number(to.lat), lng: Number(to.lng) }
        : null;
    const last = points[points.length - 1];
    if (target && last && (last.lat !== target.lat || last.lng !== target.lng)) {
        points.push(target);
    }
    return points;
};
const getRouteCacheKey = (origin, destination) => {
    const serializePoint = (point) =>
        point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

    return `${serializePoint(origin)}|${serializePoint(destination)}`;
};

const toRadians = (value) => Number(value) * (Math.PI / 180);

const getDistanceMeters = (from, to) => {
    if (!from || !to) {
        return 0;
    }

    const fromLat = Number(from.lat);
    const fromLng = Number(from.lng);
    const toLat = Number(to.lat);
    const toLng = Number(to.lng);

    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
        return 0;
    }

    const earthRadiusMeters = 6371000;
    const deltaLat = toRadians(toLat - fromLat);
    const deltaLng = toRadians(toLng - fromLng);
    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
};

const simplifyRoutePath = (points, tolerance = ROUTE_SIMPLIFY_TOLERANCE) => {
    const normalized = (Array.isArray(points) ? points : [])
        .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));

    if (normalized.length <= 2) {
        return normalized;
    }

    const simplified = simplify(
        normalized.map((point) => ({ x: point.lng, y: point.lat })),
        tolerance,
        true,
    ).map((point) => ({ lat: point.y, lng: point.x }));

    const firstPoint = normalized[0];
    const lastPoint = normalized[normalized.length - 1];
    const nextPath = simplified.slice();

    if (!arePositionsNearlyEqual(nextPath[0], firstPoint, 0.000001)) {
        nextPath.unshift(firstPoint);
    }

    if (!arePositionsNearlyEqual(nextPath[nextPath.length - 1], lastPoint, 0.000001)) {
        nextPath.push(lastPoint);
    }

    return nextPath;
};

const projectPointOnSegment = (point, segmentStart, segmentEnd) => {
    const ax = Number(segmentStart?.lng);
    const ay = Number(segmentStart?.lat);
    const bx = Number(segmentEnd?.lng);
    const by = Number(segmentEnd?.lat);
    const px = Number(point?.lng);
    const py = Number(point?.lat);

    if (![ax, ay, bx, by, px, py].every(Number.isFinite)) {
        return null;
    }

    const abx = bx - ax;
    const aby = by - ay;
    const abLengthSquared = (abx * abx) + (aby * aby);

    if (abLengthSquared <= 0) {
        return { lat: ay, lng: ax, ratio: 0 };
    }

    const apx = px - ax;
    const apy = py - ay;
    const ratio = Math.max(0, Math.min(1, ((apx * abx) + (apy * aby)) / abLengthSquared));

    return {
        lat: ay + (aby * ratio),
        lng: ax + (abx * ratio),
        ratio,
    };
};

const trimRoutePathFromPosition = (points, position) => {
    const normalizedPath = (Array.isArray(points) ? points : [])
        .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));

    if (!position || normalizedPath.length === 0) {
        return {
            path: normalizedPath,
            distanceMeters: Number.POSITIVE_INFINITY,
            advanced: false,
        };
    }

    if (normalizedPath.length === 1) {
        return {
            path: [position],
            distanceMeters: getDistanceMeters(position, normalizedPath[0]),
            advanced: !arePositionsNearlyEqual(position, normalizedPath[0], 0.00001),
        };
    }

    let closestDistanceMeters = Number.POSITIVE_INFINITY;
    let closestSegmentIndex = 0;
    let closestProjectedPoint = normalizedPath[0];

    for (let index = 0; index < normalizedPath.length - 1; index += 1) {
        const projected = projectPointOnSegment(position, normalizedPath[index], normalizedPath[index + 1]);
        if (!projected) {
            continue;
        }

        const distanceMeters = getDistanceMeters(position, projected);
        if (distanceMeters < closestDistanceMeters) {
            closestDistanceMeters = distanceMeters;
            closestSegmentIndex = index;
            closestProjectedPoint = { lat: projected.lat, lng: projected.lng };
        }
    }

    const remainingPath = [
        position,
        closestProjectedPoint,
        ...normalizedPath.slice(closestSegmentIndex + 1),
    ].filter((point, index, items) => (
        index === 0 || !arePositionsNearlyEqual(point, items[index - 1], 0.000001)
    ));

    return {
        path: simplifyRoutePath(remainingPath),
        distanceMeters: closestDistanceMeters,
        advanced: closestSegmentIndex > 0 || !arePositionsNearlyEqual(position, normalizedPath[0], 0.00005),
    };
};

const arePathsEquivalent = (first = [], second = [], threshold = 0.00001) => {
    if (first.length !== second.length) {
        return false;
    }

    return first.every((point, index) => arePositionsNearlyEqual(point, second[index], threshold));
};

const formatDistanceLabel = (meters) => {
    const distance = Number(meters || 0);

    if (!Number.isFinite(distance) || distance <= 0) {
        return 'Nearby';
    }

    if (distance < 1000) {
        return `${Math.max(50, Math.round(distance / 10) * 10)} m away`;
    }

    return `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)} km away`;
};

const formatTimerClock = (totalSeconds) => {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatWholeMinutes = (value) => `${Math.max(0, Math.floor(Number(value) || 0))} min`;

const buildPersistedTripState = (job = {}, overrides = {}) => {
    const mergedJob = {
        ...job,
        ...overrides,
    };
    const currentRideId = getJobRideId(mergedJob);
    const currentType = normalizeTripType(mergedJob);

    if (!currentRideId) {
        return null;
    }

    return {
        type: currentType,
        rideId: currentRideId,
        phase: mergedJob.phase || '',
        otp: mergedJob.otp || '',
        arrivedAt: mergedJob.arrivedAt || '',
        paymentMethod: mergedJob.paymentMethod || 'Cash',
        pricingSnapshot: mergedJob.pricingSnapshot || null,
        currentDriverCoords: mergedJob.lastDriverLocation?.coordinates || mergedJob.driverLocation?.coordinates || null,
        request: {
            type: currentType,
            title: getTripTitle(currentType),
            fare: `Rs ${mergedJob.fare || 0}`,
            payment: mergedJob.paymentMethod || 'Cash',
            pickup: getAreaName(mergedJob.pickupAddress, formatAddressFromPoint(mergedJob.pickupLocation, 'Pickup area')),
            drop: getAreaName(mergedJob.dropAddress, formatAddressFromPoint(mergedJob.dropLocation, 'Drop area')),
            requestId: currentRideId,
            rideId: currentRideId,
            raw: mergedJob,
        },
    };
};

const buildDriverPaymentCollection = ({ mode = '', status = '', paymentQr = null } = {}) => {
    const normalizedMode = String(mode || '').trim().toLowerCase();

    if (!normalizedMode) {
        return null;
    }

    if (normalizedMode === 'online') {
        return {
            method: 'online',
            source: 'driver_qr',
            qrId: paymentQr?.id || '',
            status: status === 'success' ? 'paid' : 'pending',
            paidAt: status === 'success' ? new Date().toISOString() : null,
        };
    }

    if (normalizedMode === 'cash') {
        return {
            method: 'cash',
            source: 'driver_cash',
            status: 'paid',
            paidAt: new Date().toISOString(),
        };
    }

    return {
        method: normalizedMode,
        status: status === 'success' ? 'paid' : 'pending',
        paidAt: status === 'success' ? new Date().toISOString() : null,
    };
};

// Driver marker: the vehicle icon turned to the heading (web: an OverlayView with a rotated <img>, centred on the point).
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
            zIndex={30}
            tracksViewChanges={tracksViewChanges}
        >
            <View style={s.vehicleMarkerBox} pointerEvents="none">
                <Image
                    source={source}
                    accessibilityLabel={title}
                    style={s.vehicleMarkerImg}
                    resizeMode="contain"
                    onError={() => setFailed(true)}
                />
            </View>
        </Marker>
    );
};

const PULSE_EASING = Easing.bezier(0.4, 0, 0.6, 1);

// Tailwind animate-pulse: opacity 1 -> 0.5 -> 1 every 2 s.
const usePulse = (enabled = true) => {
    const value = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!enabled) {
            value.setValue(1);
            return undefined;
        }

        const loop = Animated.loop(Animated.sequence([
            Animated.timing(value, { toValue: 0.5, duration: 1000, easing: PULSE_EASING, useNativeDriver: true }),
            Animated.timing(value, { toValue: 1, duration: 1000, easing: PULSE_EASING, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [enabled, value]);

    return value;
};

const PulseView = ({ enabled = true, style, children }) => {
    const opacity = usePulse(enabled);
    return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
};

// framer-motion initial={{ opacity: 0 }} animate={{ opacity: 1 }}
const FadeIn = ({ style, children }) => {
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.timing(opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true });
        animation.start();
        return () => animation.stop();
    }, [opacity]);

    return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
};

// Pressable with the web's whileTap / active:scale-* feedback.
const PressScale = ({ scale = 0.95, style, disabled, children, ...rest }) => (
    <Pressable
        disabled={disabled}
        style={({ pressed }) => [
            ...(Array.isArray(style) ? style : [style]),
            pressed && !disabled ? { transform: [{ scale }] } : null,
        ]}
        {...rest}
    >
        {children}
    </Pressable>
);

// One phase card of the bottom sheet (web: Motion.div y 100% -> 0 with framer's default spring, or a fade for the
// review card). `scroll` = .trip-sheet-scroll: at most 85% of the screen high, scrolling inside itself.
const PhaseSheet = ({ animation = 'slide', scroll = true, padding = 20, borderTopColor = colors.slate[100], style, children }) => {
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const progress = useRef(new Animated.Value(animation === 'fade' ? 0 : windowHeight)).current;
    const startedRef = useRef(false);

    useEffect(() => {
        if (animation !== 'fade') {
            return undefined;
        }

        const fade = Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true });
        fade.start();
        return () => fade.stop();
    }, [animation, progress]);

    const handleLayout = (event) => {
        if (animation === 'fade' || startedRef.current) {
            return;
        }

        startedRef.current = true;
        // start exactly one sheet height below its place (y: '100%')
        progress.setValue(Math.max(1, event.nativeEvent.layout.height));
        Animated.spring(progress, { toValue: 0, stiffness: 500, damping: 25, mass: 1, restSpeedThreshold: 10, useNativeDriver: true }).start();
    };

    const animatedStyle = animation === 'fade' ? { opacity: progress } : { transform: [{ translateY: progress }] };
    const contentStyle = { padding, paddingBottom: 32 + insets.bottom };

    return (
        <Animated.View onLayout={handleLayout} style={[s.sheet, { borderTopColor }, animatedStyle, style]}>
            {scroll ? (
                <ScrollView
                    style={{ maxHeight: windowHeight * 0.85, flexGrow: 0 }}
                    contentContainerStyle={contentStyle}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    overScrollMode="never"
                    bounces={false}
                    nestedScrollEnabled
                >
                    {children}
                </ScrollView>
            ) : (
                <View style={contentStyle}>{children}</View>
            )}
        </Animated.View>
    );
};

// The emerald scan line running up and down the QR (web: top 5% -> 95% -> 5%, 2.5 s, easeInOut, forever).
const QR_BOX_HEIGHT = 256;
const LaserScanLine = () => {
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const easing = Easing.inOut(Easing.ease);
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(progress, { toValue: 1, duration: 1250, easing, useNativeDriver: true }),
            Animated.timing(progress, { toValue: 0, duration: 1250, easing, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [progress]);

    const translateY = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [QR_BOX_HEIGHT * 0.05, QR_BOX_HEIGHT * 0.95],
    });

    return (
        <Animated.View pointerEvents="none" style={[s.laserLine, { transform: [{ translateY }] }]}>
            <LinearGradient
                colors={['rgba(52, 211, 153, 0)', '#34d399', 'rgba(52, 211, 153, 0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
            />
        </Animated.View>
    );
};

// QR image with the web's zoom (scale 2.85 + translateY -2.5%, 0.4 s cubic-bezier(0.16, 1, 0.3, 1)).
const QR_IMAGE_SIZE = QR_BOX_HEIGHT - 24;
const QrPaymentImage = ({ uri, zoomed, zoomable, label }) => {
    const zoom = useRef(new Animated.Value(zoomable && zoomed ? 1 : 0)).current;

    useEffect(() => {
        const animation = Animated.timing(zoom, {
            toValue: zoomable && zoomed ? 1 : 0,
            duration: 400,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            useNativeDriver: true,
        });
        animation.start();
        return () => animation.stop();
    }, [zoom, zoomed, zoomable]);

    const transform = zoomable
        ? [
            { scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 2.85] }) },
            { translateY: zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -(QR_IMAGE_SIZE * 0.025)] }) },
        ]
        : undefined;

    return (
        <Animated.View style={[s.qrImageWrap, transform ? { transform } : null]}>
            <AppImage src={uri} accessibilityLabel={label} style={s.qrImage} contentFit="contain" />
        </Animated.View>
    );
};

const letterSpacing = (em, size) => em * size;

// <p className="text-[Npx] font-black uppercase tracking-[Xem] text-..."> used all over the sheet
const capsLabel = (size, color, em = 0.2, weight = '900') => ({
    fontSize: size,
    lineHeight: Math.round(size * 1.4),
    fontWeight: weight,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing(em, size),
    color,
});

const ActiveTrip = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const insets = useSafeAreaInsets();
    const routeState = useMemo(() => location.state || {}, [location.state]);
    const routeRideId = routeState?.rideId || routeState?.request?.rideId || '';
    const storedActiveTripSnapshot = useMemo(() => {
        const snapshot = readStoredActiveTripSnapshot();
        return isSnapshotForRide(snapshot, routeRideId) ? snapshot : null;
    }, [routeRideId]);
    const [hydratedTripState, setHydratedTripState] = useState(() => storedActiveTripSnapshot);
    const routeOtp = routeState?.request?.raw?.otp || routeState?.request?.otp || routeState?.otp || '';
    const [isHydratingTrip, setIsHydratingTrip] = useState(!routeRideId || !routeOtp);
    const exitToDriverHome = React.useCallback((statusMessage = '') => {
        if (routeRideId) {
            clearStoredTripPhase(routeRideId);
            clearStoredTripUiState(routeRideId);
        }
        clearStoredActiveTripSnapshot();

        navigate('/taxi/driver/home', {
            replace: true,
            state: statusMessage ? { statusMessage } : undefined,
        });
    }, [navigate, routeRideId]);

    useEffect(() => {
        let active = true;
        const hasRestorableRouteState = Boolean(routeRideId && routeOtp);

        if (hasRestorableRouteState) {
            setIsHydratingTrip(false);
        }

        const hydrateTripState = async () => {
            let lastRestoreError = '';
            let restoredActiveTrip = false;
            // true when the server itself answered "no active trip for you" (not a network failure)
            let serverSaysNoTrip = false;

            try {
                for (let attemptIndex = 0; attemptIndex < ACTIVE_TRIP_HYDRATION_RETRY_DELAYS_MS.length; attemptIndex += 1) {
                    const delayMs = ACTIVE_TRIP_HYDRATION_RETRY_DELAYS_MS[attemptIndex];

                    if (delayMs > 0) {
                        await new Promise((resolve) => setTimeout(resolve, delayMs));
                    }

                    if (!active) {
                        return;
                    }

                    const driverToken = getLocalDriverToken();
                    const [activeDelivery, activeRide] = await Promise.allSettled([
                        api.get('/deliveries/active/me', withDriverAuthorization(driverToken)),
                        api.get('/rides/active/me', withDriverAuthorization(driverToken)),
                    ]);

                    if (!active) {
                        return;
                    }

                    const deliveryPayload =
                        activeDelivery.status === 'fulfilled' ? unwrapApiPayload(activeDelivery.value) : null;
                    const ridePayload =
                        activeRide.status === 'fulfilled' ? unwrapApiPayload(activeRide.value) : null;

                    const currentJob = getJobRideId(deliveryPayload)
                        ? deliveryPayload
                        : getJobRideId(ridePayload)
                            ? ridePayload
                            : null;
                    const currentRideId = getJobRideId(currentJob);
                    const currentStatus = String(currentJob?.liveStatus || currentJob?.status || '').toLowerCase();
                    serverSaysNoTrip = !currentRideId
                        && activeDelivery.status === 'fulfilled'
                        && activeRide.status === 'fulfilled';

                    if (currentRideId && currentStatus !== 'cancelled' && currentStatus !== 'canceled') {
                        const restoredPhase = resolvePhaseFromJob(currentJob);
                        const nextPersistedState = buildPersistedTripState(currentJob, {
                            phase: restoredPhase,
                        });

                        setHydratedTripState(nextPersistedState);
                        writeStoredActiveTripSnapshot(nextPersistedState);
                        setPhase(restoredPhase);
                        restoredActiveTrip = true;
                        return;
                    }

                    if (currentRideId && (currentStatus === 'cancelled' || currentStatus === 'canceled')) {
                        lastRestoreError = 'Ride was cancelled or is no longer active.';
                        break;
                    }
                }
            } catch {
                lastRestoreError = 'Could not restore active trip.';
            } finally {
                if (active) {
                    const fallbackSnapshot = readStoredActiveTripSnapshot();
                    const matchingFallbackSnapshot = isSnapshotForRide(fallbackSnapshot, routeRideId)
                        ? fallbackSnapshot
                        : null;
                    if (restoredActiveTrip) {
                        setIsHydratingTrip(false);
                        return;
                    }

                    if (serverSaysNoTrip && !lastRestoreError) {
                        // The server has no active trip for this captain: the screen was only a saved copy (a ride that was
                        // never really accepted, or already cancelled). Do not let it be "driven" and "dropped".
                        exitToDriverHome('This ride is not assigned to you (it may have been taken or cancelled).');
                    } else if (matchingFallbackSnapshot) {
                        setHydratedTripState(matchingFallbackSnapshot);
                        setPhase(resolvePhaseFromJob(matchingFallbackSnapshot?.request?.raw || matchingFallbackSnapshot));
                    } else if (lastRestoreError) {
                        exitToDriverHome(lastRestoreError);
                    } else {
                        exitToDriverHome('Ride was cancelled or is no longer active.');
                    }

                    setIsHydratingTrip(false);
                }
            }
        };

        hydrateTripState();

        return () => {
            active = false;
        };
    }, [exitToDriverHome, routeOtp, routeRideId]);

    const effectiveState = hydratedTripState || routeState;

    const tripType = effectiveState?.type || 'ride';
    const isParcel = tripType === 'parcel';
    // (a new {} each render when missing, exactly like the web: the effects below depend on these on purpose)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const liveRequest = effectiveState?.request || {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const liveRaw = liveRequest.raw || {};
    const rideId = getJobRideId(liveRequest) || getJobRideId(effectiveState);
    const chatUnread = useRideChatUnread(rideId, 'driver');
    const [resolvedPickupCoords, setResolvedPickupCoords] = useState(null);
    const [resolvedDropCoords, setResolvedDropCoords] = useState(null);
    const vehicleIconUrl = getActiveTripVehicleIcon(
        {
            ...effectiveState,
            ...liveRequest,
            ...liveRaw,
            vehicle: liveRaw?.vehicle || liveRequest?.vehicle || effectiveState?.vehicle || null,
        },
        liveRaw?.driver || liveRequest?.raw?.driver || liveRequest?.driver || effectiveState?.driver || {},
    );

    const pickupAddressLabel = String(
        liveRaw?.pickupAddress ||
        liveRequest?.pickup ||
        effectiveState?.request?.pickup ||
        effectiveState?.pickupAddress ||
        '',
    ).trim();
    // Stops the rider added on the way, in order.
    const rideStops = (Array.isArray(liveRaw?.stops) ? liveRaw.stops : Array.isArray(effectiveState?.stops) ? effectiveState.stops : [])
        .map((stop) => String((stop && typeof stop === 'object' ? stop.address : stop) || '').trim())
        .filter(Boolean);
    const dropAddressLabel = String(
        liveRaw?.dropAddress ||
        liveRequest?.drop ||
        effectiveState?.request?.drop ||
        effectiveState?.dropAddress ||
        '',
    ).trim();

    const pickupCoords = useMemo(
        () => readCoordinatePair(
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            effectiveState?.pickup,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            effectiveState?.pickupCoords,
        ) || resolvedPickupCoords || DEFAULT_DRIVER_COORDS,
        [
            effectiveState?.pickup,
            effectiveState?.pickupCoords,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            resolvedPickupCoords,
        ],
    );
    const dropCoords = useMemo(
        () => readCoordinatePair(
            liveRaw?.drop,
            liveRaw?.dropLocation,
            liveRequest?.drop,
            liveRequest?.dropLocation,
            liveRequest?.raw?.drop,
            liveRequest?.raw?.dropLocation,
            effectiveState?.drop,
            effectiveState?.dropLocation,
            effectiveState?.request?.raw?.drop,
            effectiveState?.request?.raw?.dropLocation,
            effectiveState?.dropCoords,
        ) || resolvedDropCoords || [75.8937, 22.7533],
        [effectiveState?.drop, effectiveState?.dropCoords, effectiveState?.dropLocation, effectiveState?.request?.raw?.drop, effectiveState?.request?.raw?.dropLocation, liveRaw?.drop, liveRaw?.dropLocation, liveRequest?.drop, liveRequest?.dropLocation, liveRequest?.raw?.drop, liveRequest?.raw?.dropLocation, resolvedDropCoords],
    );
    const assignedDriverCoords = readCoordinatePair(
        liveRaw?.driverLocation,
        liveRequest?.driverLocation,
        effectiveState?.driverCoords,
        effectiveState?.currentDriverCoords,
        readStoredDriverCoords(),
    );

    const pickupPosition = useMemo(() => toLatLng(pickupCoords), [pickupCoords]);
    const dropPosition = useMemo(() => toLatLng(dropCoords), [dropCoords]);
    const initialDriverPosition = useMemo(
        () => assignedDriverCoords ? toLatLng(assignedDriverCoords, pickupPosition) : createOffsetPosition(pickupPosition),
        [assignedDriverCoords, pickupPosition],
    );

    const [phase, setPhase] = useState(() => {
        const initialState = isSnapshotForRide(storedActiveTripSnapshot, routeRideId)
            ? storedActiveTripSnapshot
            : routeState;
        const initialJob = initialState?.request?.raw || initialState?.request || initialState || {};

        return resolvePhaseFromJob({
            ...initialJob,
            rideId: routeRideId || getJobRideId(initialState?.request || initialState),
            phase: initialState?.phase || initialJob?.phase || '',
        });
    });
    const [otp, setOtp] = useState(['', '', '', '']);
    // Each PIN box's value also lives in a ref: two quick key presses in a row must not build the PIN from stale state.
    const otpValuesRef = useRef(['', '', '', '']);
    const otpInputRefs = useRef([]);
    const [otpError, setOtpError] = useState('');
    const [selectedRating, setSelectedRating] = useState(0);
    const [driverPaymentStatus, setDriverPaymentStatus] = useState('pending');
    const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
    const [paymentQr, setPaymentQr] = useState(null);
    const [paymentQrError, setPaymentQrError] = useState('');
    const [isGeneratingPaymentQr, setIsGeneratingPaymentQr] = useState(false);
    const [qrZoomed, setQrZoomed] = useState(true);
    const [arrivalGuardError, setArrivalGuardError] = useState('');
    const [localArrivedAt, setLocalArrivedAt] = useState('');
    const [destinationReachedAt, setDestinationReachedAt] = useState('');
    const [waitingNow, setWaitingNow] = useState(Date.now());
    const mapRef = useRef(null);
    const [map, setMap] = useState(null);
    const [driverPosition, setDriverPosition] = useState(initialDriverPosition);
    const [driverHeading, setDriverHeading] = useState(null);
    const [routePath, setRoutePath] = useState([]);
    const [routeError, setRouteError] = useState('');
    const isSimulationAllowed = useTripSimulationEnabled();
    const [isSimulationEnabled, setIsSimulationEnabled] = useState(false);
    const [isSimulationRunning, setIsSimulationRunning] = useState(false);
    const [simulationStep, setSimulationStep] = useState(0);
    const { isLoaded, loadError } = useBaseGoogleMapsLoader();
    const simulationPathRef = React.useRef([]);
    const simulationTimerRef = React.useRef(null);
    const isSimulationEnabledRef = React.useRef(false);
    const routeCacheRef = React.useRef(new Map());
    const hasResolvedLivePositionRef = React.useRef(false);
    const hasHydratedUiStateRef = React.useRef(false);
    const mapFrameKeyRef = React.useRef('');
    const lastRouteRefreshAtRef = React.useRef(0);
    const routeTrimStateRef = React.useRef({ distanceMeters: Number.POSITIVE_INFINITY, shouldRefresh: false });
    const lastDriverLocationEmitRef = React.useRef({
        position: null,
        emittedAt: 0,
    });
    const previousDestinationRef = React.useRef(null);

    const activeDestination = useMemo(
        () => (phase === 'to_pickup' || phase === 'otp_verification' ? pickupPosition : dropPosition),
        [dropPosition, phase, pickupPosition],
    );
    const pickupDistanceMeters = useMemo(
        () => getDistanceMeters(driverPosition, pickupPosition),
        [driverPosition, pickupPosition],
    );
    const dropDistanceMeters = useMemo(
        () => getDistanceMeters(driverPosition, dropPosition),
        [driverPosition, dropPosition],
    );
    const riderDistanceLabel = useMemo(
        () => formatDistanceLabel(pickupDistanceMeters),
        [pickupDistanceMeters],
    );

    useEffect(() => {
        const currentStatus = String(
            liveRaw?.liveStatus ||
            liveRaw?.status ||
            liveRequest?.liveStatus ||
            liveRequest?.status ||
            effectiveState?.liveStatus ||
            effectiveState?.status ||
            '',
        ).toLowerCase();

        if (currentStatus === 'cancelled' || currentStatus === 'canceled' || phase === 'cancelled') {
            exitToDriverHome('Ride was cancelled by the user.');
        }
    }, [effectiveState?.liveStatus, effectiveState?.status, exitToDriverHome, liveRaw?.liveStatus, liveRaw?.status, liveRequest?.liveStatus, liveRequest?.status, phase]);

    // True once the ride is finished (collecting payment / rating) - from then on "no active ride" is not a cancel.
    const tripFinishedRef = React.useRef(false);
    tripFinishedRef.current = ['payment_confirm', 'review', 'complete', 'completed'].includes(String(phase || ''));

    useEffect(() => {
        const currentRideId = rideId || routeRideId;

        if (!currentRideId) {
            return undefined;
        }

        const socket = socketService.connect({ role: 'driver' });
        const onSocketConnect = () => {
            socketService.emit('ride:join', { rideId: currentRideId });
        };
        if (socket) {
            socketService.emit('ride:join', { rideId: currentRideId });
            socket.on('connect', onSocketConnect);
        }

        const handleTripClosed = (payload = {}) => {
            if (String(payload.rideId || '') !== String(currentRideId)) {
                return;
            }

            const closeReason = String(payload.reason || '').toLowerCase();
            if (closeReason === 'accepted-by-another-driver' || tripFinishedRef.current) {
                return;
            }

            clearStoredTripPhase(currentRideId);
            clearStoredTripUiState(currentRideId);
            exitToDriverHome(payload.message || 'Ride was cancelled by the user.');
        };

        const handleRideStatusUpdated = (payload = {}) => {
            if (String(payload.rideId || '') !== String(currentRideId)) {
                return;
            }

            const nextStatus = String(payload.liveStatus || payload.status || '').toLowerCase();
            if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled by the user.');
            }
        };

        const handleRideState = (payload) => {
            if (!payload) {
                if (tripFinishedRef.current) {
                    return;
                }
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled or is no longer active.');
                return;
            }

            if (String(payload.rideId || payload._id || '') !== String(currentRideId)) {
                return;
            }

            const nextStatus = String(payload.liveStatus || payload.status || '').toLowerCase();
            if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled by the user.');
            }
        };

        // The arrive / start / destination buttons move the screen first and tell the server through the socket. When the
        // server refuses ("Ride cannot move from...", "Assigned ride not found", ...) the screen used to stay ahead of the
        // ride. Now the captain sees the reason and the screen goes back to what the server has (or leaves a dead trip).
        const handleStatusRefused = async ({ message } = {}) => {
            if (!/cannot move|not found|assigned|unsupported ride status|no longer|invalid ride pin|not allowed/i.test(String(message || ''))) {
                return;
            }
            toast.error(message);
            try {
                const driverToken = getLocalDriverToken();
                const response = await api.get(
                    isParcel ? '/deliveries/active/me' : '/rides/active/me',
                    withDriverAuthorization(driverToken),
                );
                const job = unwrapApiPayload(response);
                if (!getJobRideId(job)) {
                    if (!tripFinishedRef.current) {
                        exitToDriverHome(message);
                    }
                    return;
                }
                setPhase(resolvePhaseFromJob(job));
            } catch {
                // offline right now: leave the screen as it is
            }
        };

        socketService.on('rideRequestClosed', handleTripClosed);
        socketService.on('rideCancelled', handleTripClosed);
        socketService.on('ride:status:updated', handleRideStatusUpdated);
        socketService.on('ride:state', handleRideState);
        socketService.on('errorMessage', handleStatusRefused);

        return () => {
            socketService.off('rideRequestClosed', handleTripClosed);
            socketService.off('rideCancelled', handleTripClosed);
            socketService.off('ride:status:updated', handleRideStatusUpdated);
            socketService.off('ride:state', handleRideState);
            socketService.off('errorMessage', handleStatusRefused);
            if (socket) {
                socket.off('connect', onSocketConnect);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same dependencies as the web screen
    }, [exitToDriverHome, rideId, routeRideId]);

    useEffect(() => {
        if (!rideId) {
            return;
        }

        writeStoredTripPhase(rideId, phase);
    }, [phase, rideId]);

    useEffect(() => {
        if (!rideId || hasHydratedUiStateRef.current) {
            return;
        }

        const storedUiState = readStoredTripUiState(rideId);
        hasHydratedUiStateRef.current = true;

        if (!storedUiState) {
            return;
        }

        if (typeof storedUiState.selectedPaymentMode === 'string') {
            setSelectedPaymentMode(storedUiState.selectedPaymentMode);
        }

        if (typeof storedUiState.driverPaymentStatus === 'string') {
            setDriverPaymentStatus(storedUiState.driverPaymentStatus);
        }

        if (storedUiState.paymentQr && typeof storedUiState.paymentQr === 'object') {
            setPaymentQr(storedUiState.paymentQr);
        }

        if (typeof storedUiState.paymentQrError === 'string') {
            setPaymentQrError(storedUiState.paymentQrError);
        }

        if (typeof storedUiState.selectedRating === 'number') {
            setSelectedRating(storedUiState.selectedRating);
        }

        if (typeof storedUiState.localArrivedAt === 'string') {
            setLocalArrivedAt(storedUiState.localArrivedAt);
        }
    }, [rideId]);

    useEffect(() => {
        if (!rideId || !hasHydratedUiStateRef.current) {
            return;
        }

        writeStoredTripUiState(rideId, {
            selectedPaymentMode,
            driverPaymentStatus,
            paymentQr,
            paymentQrError,
            selectedRating,
            localArrivedAt,
        });
    }, [driverPaymentStatus, localArrivedAt, paymentQr, paymentQrError, rideId, selectedPaymentMode, selectedRating]);

    useEffect(() => {
        if (!rideId || !effectiveState) {
            return;
        }

        const rawJob = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest?.raw || liveRequest
                : effectiveState?.request?.raw || effectiveState;

        const derivedLiveStatus =
            phase === 'otp_verification'
                ? 'arriving'
                : phase === 'in_trip'
                    ? 'started'
                    : phase === 'payment_confirm'
                        ? 'arrived'
                        : phase === 'review'
                            ? 'completed'
                            : rawJob?.liveStatus || rawJob?.status || 'accepted';
        const derivedStatus =
            phase === 'in_trip' || phase === 'payment_confirm'
                ? 'ongoing'
                : phase === 'review'
                    ? 'completed'
                    : rawJob?.status || derivedLiveStatus;
        const nextPersistedState = buildPersistedTripState(rawJob, {
            phase,
            liveStatus: derivedLiveStatus,
            status: derivedStatus,
            arrivedAt: phase === 'otp_verification' ? (localArrivedAt || rawJob?.arrivedAt || '') : '',
        });
        if (nextPersistedState) {
            writeStoredActiveTripSnapshot(nextPersistedState);
        }
    }, [effectiveState, liveRaw, liveRequest, localArrivedAt, phase, rideId]);

    useEffect(() => {
        if (!rideId || hydratedTripState) {
            return;
        }

        const routeJob = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest
                : effectiveState;

        const restoredPhase = resolvePhaseFromJob({
            ...routeJob,
            rideId,
        });

        setPhase((current) => (current === 'to_pickup' ? restoredPhase : current));
    }, [effectiveState, hydratedTripState, liveRaw, liveRequest, rideId]);

    useEffect(() => {
        setResolvedPickupCoords(null);
        setResolvedDropCoords(null);
    }, [rideId]);

    useEffect(() => {
        if (!isLoaded) {
            return;
        }

        const geocoder = new Geocoder();
        let active = true;

        const resolveAddressCoords = (address, setter) => {
            const trimmedAddress = String(address || '').trim();

            if (!trimmedAddress) {
                return;
            }

            geocoder.geocode({ address: trimmedAddress }, (results, status) => {
                if (!active || status !== 'OK' || !results?.[0]?.geometry?.location) {
                    return;
                }

                const locationPoint = results[0].geometry.location;
                setter([locationPoint.lng(), locationPoint.lat()]);
            }).catch(() => {});
        };

        if (!readCoordinatePair(
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            effectiveState?.pickup,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            effectiveState?.pickupCoords,
        ) && pickupAddressLabel) {
            resolveAddressCoords(pickupAddressLabel, setResolvedPickupCoords);
        }

        if (!readCoordinatePair(
            liveRaw?.drop,
            liveRaw?.dropLocation,
            liveRequest?.drop,
            liveRequest?.dropLocation,
            liveRequest?.raw?.drop,
            liveRequest?.raw?.dropLocation,
            effectiveState?.drop,
            effectiveState?.dropLocation,
            effectiveState?.request?.raw?.drop,
            effectiveState?.request?.raw?.dropLocation,
            effectiveState?.dropCoords,
        ) && dropAddressLabel) {
            resolveAddressCoords(dropAddressLabel, setResolvedDropCoords);
        }

        return () => {
            active = false;
        };
    }, [
        dropAddressLabel,
        effectiveState?.dropCoords,
        effectiveState?.drop,
        effectiveState?.dropLocation,
        effectiveState?.pickup,
        effectiveState?.pickupCoords,
        effectiveState?.pickupLocation,
        effectiveState?.request?.raw?.drop,
        effectiveState?.request?.raw?.dropLocation,
        effectiveState?.request?.raw?.pickup,
        effectiveState?.request?.raw?.pickupLocation,
        isLoaded,
        liveRaw?.drop,
        liveRaw?.dropLocation,
        liveRaw?.pickup,
        liveRaw?.pickupLocation,
        liveRequest?.drop,
        liveRequest?.dropLocation,
        liveRequest?.pickup,
        liveRequest?.pickupLocation,
        liveRequest?.raw?.drop,
        liveRequest?.raw?.dropLocation,
        liveRequest?.raw?.pickup,
        liveRequest?.raw?.pickupLocation,
        pickupAddressLabel,
    ]);

    const tripData = isParcel ? {
        sender: {
            name: liveRaw.parcel?.senderName || 'Sender',
            rating: '',
            phone: liveRaw.parcel?.senderMobile || '',
        },
        receiver: {
            name: liveRaw.parcel?.receiverName || 'Receiver',
            phone: liveRaw.parcel?.receiverMobile || '',
        },
        pickup: getAreaName(liveRaw.pickupAddress || liveRequest?.pickup, formatAddressFromPoint(liveRaw.pickupLocation, 'Pickup area')),
        drop: getAreaName(liveRaw.dropAddress || liveRequest?.drop, formatAddressFromPoint(liveRaw.dropLocation, 'Drop area')),
        fare: `Rs ${liveRaw.fare || effectiveState?.fare || 0}`,
        payment: effectiveState?.paymentMethod || 'Online'
    } : {
        user: {
            name: liveRaw.user?.name || liveRequest?.user?.name || 'Passenger',
            rating: liveRaw.user?.rating || liveRequest?.user?.rating || '',
            phone: liveRaw.user?.phone || liveRequest?.user?.phone || '',
        },
        pickup: getAreaName(liveRaw.pickupAddress || liveRequest?.pickup, formatAddressFromPoint(liveRaw.pickupLocation, 'Pickup area')),
        drop: getAreaName(liveRaw.dropAddress || liveRequest?.drop, formatAddressFromPoint(liveRaw.dropLocation, 'Drop area')),
        fare: `Rs ${liveRaw.fare || effectiveState?.fare || 0}`,
        payment: liveRequest?.payment || effectiveState?.paymentMethod || 'Online'
    };

    const displayFare = liveRequest?.fare || tripData.fare;
    const fareAmount = parseFareAmount(displayFare);
    const expectedOtp = String(liveRaw?.otp || liveRequest?.otp || effectiveState?.otp || '');
    const waitingPricing = liveRaw?.pricingSnapshot || liveRequest?.raw?.pricingSnapshot || effectiveState?.pricingSnapshot || {};
    const allowedPaymentModes = (() => {
        const rawItems = Array.isArray(waitingPricing?.allowed_payment_methods) ? waitingPricing.allowed_payment_methods : [];
        const normalized = [...new Set(
            rawItems
                .map((item) => String(item || '').trim().toLowerCase())
                .filter((item) => item === 'cash' || item === 'online')
        )];

        return normalized.length ? normalized : ['cash', 'online'];
    })();
    const waitingChargePerMinute = Math.max(0, Number(waitingPricing?.waiting_charge ?? 0));
    const freeWaitingBeforeMinutes = Math.max(0, Number(waitingPricing?.free_waiting_before ?? 0));
    const waitingStartedAt = localArrivedAt || liveRaw?.arrivedAt || liveRequest?.raw?.arrivedAt || effectiveState?.arrivedAt || '';
    const waitingElapsedSeconds = waitingStartedAt
        ? Math.max(0, Math.floor((waitingNow - new Date(waitingStartedAt).getTime()) / 1000))
        : 0;
    const freeWaitingRemainingSeconds = Math.max(0, freeWaitingBeforeMinutes * 60 - waitingElapsedSeconds);
    const waitingChargeableMinutes = Math.max(0, Math.ceil(waitingElapsedSeconds / 60) - freeWaitingBeforeMinutes);
    const canMarkArrived = pickupDistanceMeters <= ARRIVAL_RADIUS_METERS;
    const canDeliverParcel = dropDistanceMeters <= ARRIVAL_RADIUS_METERS;
    const isWaitingForOtp = phase === 'otp_verification' && Boolean(waitingStartedAt);
    const pickupContact = isParcel ? tripData.sender : tripData.user;
    const destinationContact = isParcel ? tripData.receiver : tripData.user;
    const tripStartedAt = liveRaw?.startedAt || liveRequest?.raw?.startedAt || effectiveState?.startedAt || '';
    // `arrivedAt` on the ride is the arrival at *pickup*; the summary needs the drop-off time.
    const tripArrivedAt = destinationReachedAt || liveRaw?.completedAt || liveRequest?.raw?.completedAt || effectiveState?.completedAt || '';
    const tripDurationLabel = formatDurationLabel(tripStartedAt, tripArrivedAt || Date.now());
    const tripSummaryTitle = isParcel ? 'Delivery Summary' : 'Ride Summary';
    const tripSummarySubtitle = isParcel ? 'Review the delivery details before you close the order.' : 'Review the trip details before you close the ride.';
    const destinationRoleLabel = isParcel ? 'Receiver' : 'Rider';
    const paymentModeLabel = selectedPaymentMode
        ? (selectedPaymentMode === 'cash' ? 'Cash' : 'Online')
        : (effectiveState?.paymentMethod || liveRequest?.payment || tripData.payment || 'Pending');
    // The rider's earlier unpaid cancellation fee is part of the fare to collect, but not part of the trip earning.
    const earlierFeeAmount = Math.max(0, Number(liveRaw?.cancellationDueCharge?.amount ?? effectiveState?.cancellationDueCharge?.amount ?? 0));
    const commissionSummary = computeCommissionSummary({
        fare: Math.max(0, fareAmount - earlierFeeAmount),
        promoDiscount: Number(liveRaw?.promo?.discount_amount ?? effectiveState?.promo?.discount_amount ?? liveRequest?.raw?.promoDiscount ?? 0),
        pricingSnapshot: waitingPricing,
        explicitCommissionAmount: liveRaw?.commissionAmount ?? effectiveState?.commissionAmount,
        explicitDriverEarnings: liveRaw?.driverEarnings ?? effectiveState?.driverEarnings,
    });
    const paymentCollectionLabel = isParcel ? 'receiver' : 'rider';
    const routeStrokeColor = '#000000';
    const routeAccentSoft = hexToRgba(routeStrokeColor, 0.08);
    // web routeAccentMuted (rgba(0,0,0,.18)) is the colour of the action-button shadows: see actionShadow below
    const routeAccentBorder = hexToRgba(routeStrokeColor, 0.18);
    const simulationTotalSteps = Math.max(0, simulationPathRef.current.length - 1);
    const simulationProgress = simulationTotalSteps > 0
        ? Math.min(100, Math.round((simulationStep / simulationTotalSteps) * 100))
        : 0;
    const displayDriverHeading = useMemo(() => {
        if (Number.isFinite(Number(driverHeading))) {
            return normalizeHeading(driverHeading);
        }

        return getRouteHeading(
            driverPosition,
            routePath,
            calculateBearing(driverPosition, activeDestination),
        );
    }, [activeDestination, driverHeading, driverPosition, routePath]);
    const displayDriverHeadingRef = React.useRef(displayDriverHeading);
    // web: box-shadow 0 18px 30px rgba(0,0,0,.18) / 0 16px 28px on the black action buttons
    const actionShadow = { shadowColor: routeStrokeColor, shadowOpacity: 0.18, shadowRadius: 15, shadowOffset: { width: 0, height: 18 }, elevation: 10 };
    const actionShadowSmall = { shadowColor: routeStrokeColor, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 16 }, elevation: 9 };

    const callContact = (phone) => {
        const cleanPhone = cleanPhoneNumber(phone);

        if (!cleanPhone) {
            Alert.alert('', 'Phone number is not available for this trip yet.');
            return;
        }

        Linking.openURL(`tel:${cleanPhone}`).catch(() => {});
    };

    const openTripChat = () => {
        navigate('/taxi/driver/chat', {
            state: {
                rideId,
                peer: {
                    name: pickupContact?.name || 'Passenger',
                    phone: pickupContact?.phone || '',
                    subtitle: `${isParcel ? 'Sender' : 'Passenger'} - Active now`,
                    role: isParcel ? 'Sender' : 'Passenger',
                },
            },
        });
    };

    const openSupportChat = () => {
        navigate('/taxi/driver/support/chat', {
            state: {
                rideId,
                backPath: '/taxi/driver/active-trip',
                backState: {
                    ...effectiveState,
                    rideId,
                },
            },
        });
    };

    const triggerEmergencySos = () => {
        Linking.openURL('tel:112').catch(() => {});
    };

    const publishRideStatus = (nextStatus, paymentMode = '') => {
        if (!rideId) {
            return;
        }

        const driverPaymentCollection = nextStatus === 'completed'
            ? buildDriverPaymentCollection({
                mode: paymentMode || selectedPaymentMode,
                status: driverPaymentStatus,
                paymentQr,
            })
            : null;

        socketService.emit('ride:status:update', {
            rideId,
            status: nextStatus,
            paymentMethod: paymentMode || undefined,
            ...(driverPaymentCollection ? { driverPaymentCollection } : {}),
        });
    };

    const completeRideAndExit = async () => {
        const paymentMode = selectedPaymentMode || effectiveState?.paymentMethod || liveRequest?.payment || '';

        try {
            if (rideId) {
                const driverToken = getLocalDriverToken();
                await api.patch(
                    `/rides/${rideId}/status`,
                    {
                        status: 'completed',
                        paymentMethod: paymentMode || undefined,
                        driverPaymentCollection: buildDriverPaymentCollection({
                            mode: paymentMode,
                            status: driverPaymentStatus,
                            paymentQr,
                        }) || undefined,
                    },
                    withDriverAuthorization(driverToken),
                );
            }
        } catch (completeError) {
            // The server ANSWERED with a refusal (not assigned to you / wrong state): say so and stay, do not close the trip
            // on the captain's side while the rider's side never moved. Only a network failure falls through to the socket.
            if (Number(completeError?.status) >= 400 && Number(completeError?.status) < 500) {
                toast.error(completeError?.message || 'The server did not accept this - the trip is not closed.');
                return;
            }
        }

        publishRideStatus('completed', paymentMode);
        clearStoredTripPhase(rideId);
        clearStoredTripUiState(rideId);
        navigate('/taxi/driver/home');
    };

    const completeRideForUserSync = async (paymentMode = '') => {
        if (!rideId) {
            return;
        }

        try {
            const driverToken = getLocalDriverToken();
            await api.patch(
                `/rides/${rideId}/status`,
                {
                    status: 'completed',
                    paymentMethod: paymentMode || undefined,
                    driverPaymentCollection: buildDriverPaymentCollection({
                        mode: paymentMode,
                        status: driverPaymentStatus,
                        paymentQr,
                    }) || undefined,
                },
                withDriverAuthorization(driverToken),
            );
        } catch {
            // The socket publish below remains as a realtime fallback for the rider side.
        }

        publishRideStatus('completed', paymentMode);
    };

    useEffect(() => {
        if (!waitingStartedAt || phase !== 'otp_verification') {
            return undefined;
        }

        setWaitingNow(Date.now());
        const intervalId = setInterval(() => {
            setWaitingNow(Date.now());
        }, 1000);

        return () => clearInterval(intervalId);
    }, [phase, waitingStartedAt]);

    const publishDriverLocation = (position, heading = displayDriverHeading, { speed = null, force = false } = {}) => {
        if (!rideId || !position) {
            return;
        }

        const now = Date.now();
        const lastEmission = lastDriverLocationEmitRef.current;
        const movedDistance = getDistanceMeters(lastEmission.position, position);
        const shouldEmit = force ||
            !lastEmission.position ||
            movedDistance >= DRIVER_LOCATION_EMIT_MIN_DISTANCE_METERS ||
            now - Number(lastEmission.emittedAt || 0) >= DRIVER_LOCATION_EMIT_MIN_INTERVAL_MS;

        if (!shouldEmit) {
            return;
        }

        socketService.emit('ride:driver-location:update', {
            rideId,
            coordinates: [position.lng, position.lat],
            heading: normalizeHeading(heading),
            speed,
            simulated: isSimulationEnabledRef.current,
        });

        lastDriverLocationEmitRef.current = {
            position,
            emittedAt: now,
        };
    };

    const stopSimulationTimer = () => {
        if (simulationTimerRef.current) {
            clearInterval(simulationTimerRef.current);
            simulationTimerRef.current = null;
        }
    };

    const startSimulation = () => {
        const nextPath = getSimulationPath({
            routePath,
            from: driverPosition,
            to: activeDestination,
        });

        if (nextPath.length < 2) {
            return;
        }

        stopSimulationTimer();
        simulationPathRef.current = nextPath;
        const nextHeading = getRouteHeading(nextPath[0], nextPath.slice(1), displayDriverHeading);
        setSimulationStep(0);
        setIsSimulationEnabled(true);
        setIsSimulationRunning(true);
        setRoutePath(nextPath);
        setDriverPosition(nextPath[0]);
        setDriverHeading(nextHeading);
        publishDriverLocation(nextPath[0], nextHeading);
    };

    const pauseSimulation = () => {
        stopSimulationTimer();
        setIsSimulationRunning(false);
    };

    const resumeSimulation = () => {
        // finished path (or none): plan a fresh one from here to the current destination
        if (simulationPathRef.current.length < 2 || simulationStep >= simulationPathRef.current.length - 1) {
            startSimulation();
            return;
        }

        setIsSimulationEnabled(true);
        setIsSimulationRunning(true);
    };

    const resetSimulation = () => {
        stopSimulationTimer();
        simulationPathRef.current = [];
        setIsSimulationEnabled(false);
        setIsSimulationRunning(false);
        setSimulationStep(0);
        setDriverPosition(initialDriverPosition);
        const nextHeading = calculateBearing(initialDriverPosition, activeDestination, displayDriverHeading);
        setDriverHeading(nextHeading);
        publishDriverLocation(initialDriverPosition, nextHeading);
    };

    const generatePaymentQr = async () => {
        if (!rideId || !fareAmount) {
            setPaymentQrError('Ride fare is missing.');
            return;
        }

        setIsGeneratingPaymentQr(true);
        setPaymentQrError('');
        setPaymentQr(null);

        try {
            const response = await api.post('/drivers/payments/qr', {
                rideId,
                amount: fareAmount,
            });
            const qr = response?.data?.data || response?.data || {};

            if (!qr.imageUrl) {
                throw new Error('Payment QR image was not returned.');
            }

            setPaymentQr(qr);
            setDriverPaymentStatus('qr_generated');
        } catch (error) {
            setDriverPaymentStatus('pending');
            setPaymentQrError(error?.response?.data?.message || error?.message || 'Could not generate payment QR.');
        } finally {
            setIsGeneratingPaymentQr(false);
        }
    };

    const refreshPaymentStatus = async () => {
        if (!rideId || !paymentQr?.id) {
            return;
        }

        try {
            const response = await api.get('/drivers/payments/qr/status', {
                params: { rideId },
            });
            const status = response?.data?.data || response?.data || {};

            if (status?.paid || ['paid', 'captured', 'completed'].includes(String(status?.status || '').toLowerCase())) {
                setPaymentQr((current) => ({
                    ...(current || paymentQr),
                    status: status.status,
                    paidAt: status.paidAt || Date.now(),
                }));
                setPaymentQrError('');
                setDriverPaymentStatus('success');
            }
        } catch (error) {
            const message = error?.response?.data?.message || error?.message || '';
            if (message) {
                setPaymentQrError(message);
            }
        }
    };

    const handlePaymentModeSelect = (modeId) => {
        setSelectedPaymentMode(modeId);

        if (modeId === 'online') {
            generatePaymentQr();
            return;
        }

        setPaymentQr(null);
        setPaymentQrError('');
        setDriverPaymentStatus('success');
    };

    useEffect(() => {
        if (driverPaymentStatus !== 'qr_generated' || !paymentQr?.id) {
            return undefined;
        }

        refreshPaymentStatus();
        const intervalId = setInterval(refreshPaymentStatus, 3000);

        return () => clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same dependencies as the web screen
    }, [driverPaymentStatus, paymentQr?.id, rideId]);

    // After a wrong PIN the cursor goes back to the first box and the keyboard opens again (blur first, so Android
    // treats it as a new focus after the keyboard was dismissed). The digits stay, like on the web.
    const refocusFirstOtpBox = () => {
        setTimeout(() => {
            const first = otpInputRefs.current[0];
            first?.blur?.();
            first?.focus?.();
        }, 150);
    };

    const startTripAfterOtp = async (enteredOtp) => {
        if (String(enteredOtp).length !== 4) {
            setOtpError('Enter the full 4 digit PIN.');
            return;
        }

        let resolvedExpectedOtp = String(expectedOtp || '');

        try {
            const driverToken = getLocalDriverToken();
            const endpoint = isParcel ? '/deliveries/active/me' : '/rides/active/me';
            const response = await api.get(endpoint, withDriverAuthorization(driverToken));
            const latestActiveJob = unwrapApiPayload(response);
            const latestRideId = getJobRideId(latestActiveJob);

            if (latestRideId && String(latestRideId) === String(rideId || routeRideId || '')) {
                resolvedExpectedOtp = String(latestActiveJob?.otp || resolvedExpectedOtp || '');

                const latestPersistedState = buildPersistedTripState(latestActiveJob, {
                    phase,
                    arrivedAt: localArrivedAt || latestActiveJob?.arrivedAt || '',
                });

                if (latestPersistedState) {
                    setHydratedTripState(latestPersistedState);
                    writeStoredActiveTripSnapshot(latestPersistedState);
                }
            }
        } catch {
            // Fall back to the currently hydrated OTP if the refresh request fails.
        }

        if (String(enteredOtp) !== resolvedExpectedOtp) {
            setOtpError('Wrong PIN. Ask the passenger again.');
            refocusFirstOtpBox();
            return;
        }

        let startedRide = null;
        try {
            if (rideId) {
                const driverToken = getLocalDriverToken();
                const startResponse = await api.patch(
                    `/rides/${rideId}/status`,
                    { status: 'started', otp: String(enteredOtp) },
                    withDriverAuthorization(driverToken),
                );
                startedRide = unwrapApiPayload(startResponse);
            }
        } catch (startError) {
            setOtpError(
                startError?.response?.data?.error
                || startError?.response?.data?.message
                || 'Could not start the trip. Check your connection and try again.',
            );
            return;
        }

        setOtpError('');
        setLocalArrivedAt('');
        setPhase('in_trip');
        const startedAtIso = new Date().toISOString();
        const rawJobForSnapshot = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest?.raw || liveRequest
                : effectiveState?.request?.raw || effectiveState;
        // The server adds the pickup waiting charge to the fare at start; show the amount it returned.
        const serverFare = Number(startedRide?.fare);
        const waitingAmount = Number(startedRide?.waitingCharge?.amount || 0);
        if (waitingAmount > 0) {
            toast.success(`Waiting charge Rs ${waitingAmount} added (${startedRide.waitingCharge.minutes} min)`);
        }
        const optimisticSnapshot = buildPersistedTripState(rawJobForSnapshot, {
            phase: 'in_trip',
            liveStatus: 'started',
            status: 'ongoing',
            startedAt: startedAtIso,
            arrivedAt: '',
            ...(Number.isFinite(serverFare) && serverFare > 0 ? { fare: serverFare } : {}),
            ...(waitingAmount > 0 ? { waitingCharge: startedRide.waitingCharge } : {}),
        });

        if (optimisticSnapshot) {
            writeStoredActiveTripSnapshot(optimisticSnapshot);
            setHydratedTripState(optimisticSnapshot);
        }

        publishRideStatus('started');
    };

    useEffect(() => {
        isSimulationEnabledRef.current = isSimulationEnabled;
    }, [isSimulationEnabled]);

    useEffect(() => {
        displayDriverHeadingRef.current = displayDriverHeading;
    }, [displayDriverHeading]);

    useEffect(() => {
        if (!isSimulationEnabled && !hasResolvedLivePositionRef.current) {
            setDriverPosition((currentPosition) =>
                arePositionsNearlyEqual(currentPosition, initialDriverPosition) ? currentPosition : initialDriverPosition,
            );
        }
    }, [initialDriverPosition, isSimulationEnabled]);

    useEffect(() => {
        let watchId = null;
        let cancelled = false;
        const socket = socketService.connect({ role: 'driver' });

        if (socket && rideId) {
            socketService.emit('ride:join', { rideId });
        }

        getCurrentCoords()
            .then((position) => {
                if (!cancelled && !isSimulationEnabledRef.current) {
                    hasResolvedLivePositionRef.current = true;
                    setDriverPosition((previousPosition) => {
                        const nextHeading = calculateBearing(previousPosition, position, displayDriverHeadingRef.current);
                        setDriverHeading(nextHeading);
                        publishDriverLocation(position, nextHeading, { force: true });
                        return position;
                    });
                }
            })
            .catch(() => {});

        if (!navigator.geolocation) {
            return () => {
                cancelled = true;
            };
        }

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                if (cancelled || isSimulationEnabledRef.current) {
                    return;
                }

                const nextPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                };

                setDriverPosition((previousPosition) => {
                    hasResolvedLivePositionRef.current = true;
                    const nextHeading = normalizeHeading(
                        pos.coords.heading,
                        calculateBearing(previousPosition, nextPosition, displayDriverHeadingRef.current),
                    );
                    setDriverHeading(nextHeading);
                    if (rideId) {
                        publishDriverLocation(nextPosition, nextHeading, {
                            speed: pos.coords.speed,
                        });
                    }
                    return nextPosition;
                });
            },
            () => {},
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 15000,
            },
        );

        return () => {
            cancelled = true;
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same dependencies as the web screen
    }, [rideId]);

    useEffect(() => {
        stopSimulationTimer();

        if (!isSimulationRunning || simulationPathRef.current.length < 2) {
            return undefined;
        }

        simulationTimerRef.current = setInterval(() => {
            setSimulationStep((currentStep) => {
                const nextStep = Math.min(currentStep + 1, simulationPathRef.current.length - 1);
                const previousPosition = simulationPathRef.current[currentStep];
                const nextPosition = simulationPathRef.current[nextStep];

                if (nextPosition) {
                    const nextHeading = calculateBearing(
                        previousPosition,
                        nextPosition,
                        getRouteHeading(nextPosition, simulationPathRef.current.slice(nextStep + 1), displayDriverHeadingRef.current),
                    );
                    setDriverPosition(nextPosition);
                    setDriverHeading(nextHeading);
                    setRoutePath(simulationPathRef.current.slice(nextStep));
                    publishDriverLocation(nextPosition, nextHeading);
                    // map.panTo
                    map?.animateCamera({ center: toMapLatLng(nextPosition) }, { duration: 300 });
                }

                if (nextStep >= simulationPathRef.current.length - 1) {
                    stopSimulationTimer();
                    setIsSimulationRunning(false);
                }

                return nextStep;
            });
        }, 750);

        return () => stopSimulationTimer();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same dependencies as the web screen
    }, [isSimulationRunning, map, rideId]);

    useEffect(() => () => stopSimulationTimer(), []);

    useEffect(() => {
        const destinationChanged = !previousDestinationRef.current ||
            !arePositionsNearlyEqual(previousDestinationRef.current, activeDestination, 0.00001);
        previousDestinationRef.current = activeDestination;

        if (isSimulationEnabled && !destinationChanged) {
            return;
        }

        // New leg (pickup -> drop): drop the finished path so Start/Resume drives to the new destination.
        // Simulation stays on, so real GPS does not pull the driver back.
        if (isSimulationEnabled && destinationChanged) {
            stopSimulationTimer();
            simulationPathRef.current = [];
            setIsSimulationRunning(false);
            setSimulationStep(0);
        }

        if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
            const nextPath = [driverPosition];
            setRoutePath((currentPath) => (arePathsEquivalent(currentPath, nextPath) ? currentPath : nextPath));
            setRouteError('');
            routeTrimStateRef.current = { distanceMeters: 0, shouldRefresh: false };
            return;
        }

        if (routePath.length > 1 && !destinationChanged) {
            const trimmedRoute = trimRoutePathFromPosition(routePath, driverPosition);
            routeTrimStateRef.current = {
                distanceMeters: trimmedRoute.distanceMeters,
                shouldRefresh: trimmedRoute.distanceMeters > ROUTE_OFF_PATH_METERS,
            };

            if (!routeTrimStateRef.current.shouldRefresh && !arePathsEquivalent(routePath, trimmedRoute.path)) {
                setRoutePath(trimmedRoute.path);
            }

            if (!routeTrimStateRef.current.shouldRefresh) {
                setRouteError('');
                return;
            }
        }

        // web: Google Maps JS library not loaded -> straight line, no "fallback" notice
        if (!isLoaded || !HAS_VALID_GOOGLE_MAPS_KEY) {
            const fallbackRoute = buildFallbackRoute(driverPosition, activeDestination);
            setRoutePath(fallbackRoute);
            if (isSimulationEnabled && destinationChanged) {
                stopSimulationTimer();
                simulationPathRef.current = fallbackRoute;
                setSimulationStep(0);
                setDriverPosition(fallbackRoute[0]);
                const nextHeading = getRouteHeading(fallbackRoute[0], fallbackRoute.slice(1), displayDriverHeadingRef.current);
                setDriverHeading(nextHeading);
                publishDriverLocation(fallbackRoute[0], nextHeading);
                setIsSimulationRunning(true);
            }
            setRouteError('');
            return;
        }

        const now = Date.now();
        if (now - lastRouteRefreshAtRef.current < ROUTE_REFRESH_DEBOUNCE_MS) {
            return;
        }

        const routeCacheKey = getRouteCacheKey(driverPosition, activeDestination);
        const cachedRoute = routeCacheRef.current.get(routeCacheKey);
        if (cachedRoute) {
            if (!arePathsEquivalent(routePath, cachedRoute.routePath)) {
                setRoutePath(cachedRoute.routePath);
            }
            if (isSimulationEnabled && destinationChanged) {
                stopSimulationTimer();
                simulationPathRef.current = cachedRoute.routePath;
                setSimulationStep(0);
                setDriverPosition(cachedRoute.routePath[0]);
                const nextHeading = getRouteHeading(cachedRoute.routePath[0], cachedRoute.routePath.slice(1), displayDriverHeadingRef.current);
                setDriverHeading(nextHeading);
                publishDriverLocation(cachedRoute.routePath[0], nextHeading);
                setIsSimulationRunning(true);
            }
            setRouteError(cachedRoute.routeError);
            routeTrimStateRef.current = { distanceMeters: 0, shouldRefresh: false };
            return;
        }

        lastRouteRefreshAtRef.current = now;
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
                const nextPath = simplifyRoutePath(result.path);
                routeCacheRef.current.set(routeCacheKey, {
                    routePath: nextPath,
                    routeError: '',
                });
                setRoutePath(nextPath);

                if (isSimulationEnabled && destinationChanged) {
                    stopSimulationTimer();
                    simulationPathRef.current = nextPath;
                    setSimulationStep(0);
                    setDriverPosition(nextPath[0]);
                    const nextHeading = getRouteHeading(nextPath[0], nextPath.slice(1), displayDriverHeadingRef.current);
                    setDriverHeading(nextHeading);
                    publishDriverLocation(nextPath[0], nextHeading);
                    setIsSimulationRunning(true);
                }

                routeTrimStateRef.current = { distanceMeters: 0, shouldRefresh: false };
                setRouteError('');
                return;
            }

            const fallbackRoute = buildFallbackRoute(driverPosition, activeDestination);
            const nextRouteError = result.status || 'Directions unavailable';
            routeCacheRef.current.set(routeCacheKey, {
                routePath: fallbackRoute,
                routeError: nextRouteError,
            });
            setRoutePath(fallbackRoute);

            if (isSimulationEnabled && destinationChanged) {
                stopSimulationTimer();
                simulationPathRef.current = fallbackRoute;
                setSimulationStep(0);
                setDriverPosition(fallbackRoute[0]);
                const nextHeading = getRouteHeading(fallbackRoute[0], fallbackRoute.slice(1), displayDriverHeadingRef.current);
                setDriverHeading(nextHeading);
                publishDriverLocation(fallbackRoute[0], nextHeading);
                setIsSimulationRunning(true);
            }

            routeTrimStateRef.current = { distanceMeters: Number.POSITIVE_INFINITY, shouldRefresh: false };
            setRouteError(nextRouteError);
        })();

        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same dependencies as the web screen
    }, [activeDestination, driverPosition, isLoaded, isSimulationEnabled, routePath]);

    useEffect(() => {
        if (!map) {
            return;
        }

        if (isSimulationRunning) {
            // map.panTo
            map.animateCamera({ center: toMapLatLng(driverPosition) }, { duration: 300 });
            return;
        }

        const frameKey = [
            phase,
            activeDestination?.lat?.toFixed?.(5) || activeDestination?.lat,
            activeDestination?.lng?.toFixed?.(5) || activeDestination?.lng,
            routePath.length > 1 ? 'route' : 'direct',
        ].join(':');

        if (mapFrameKeyRef.current === frameKey) {
            return;
        }

        mapFrameKeyRef.current = frameKey;

        if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
            // map.setCenter + map.setZoom(15)
            map.setCamera({ center: toMapLatLng(driverPosition), zoom: 15 });
            return;
        }

        // map.fitBounds(bounds, padding)
        if (routePath.length > 1) {
            const padding = 72;
            map.fitToCoordinates([...routePath, driverPosition, activeDestination].map(toMapLatLng), {
                edgePadding: { top: padding, right: padding, bottom: padding, left: padding },
                animated: true,
            });
            return;
        }

        const padding = 80;
        map.fitToCoordinates([driverPosition, activeDestination].map(toMapLatLng), {
            edgePadding: { top: padding, right: padding, bottom: padding, left: padding },
            animated: true,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same dependencies as the web screen
    }, [activeDestination, driverPosition, isSimulationRunning, map, routePath]);

    const setOtpValues = (nextOtp) => {
        otpValuesRef.current = nextOtp;
        setOtp(nextOtp);
    };

    const handleOTPChange = (index, rawValue) => {
        const typed = String(rawValue ?? '');
        if (!/^\d*$/.test(typed)) return;
        // typing into a box that already has a digit gives two characters: keep the new one (web: maxLength 1)
        const value = typed.slice(-1);
        const nextOtp = [...otpValuesRef.current];
        nextOtp[index] = value;
        setOtpValues(nextOtp);

        const enteredOtp = nextOtp.join('');

        if (enteredOtp.length === 4) {
            // last box filled: put the keyboard away
            Keyboard.dismiss();
        } else if (value && index < 3) {
            otpInputRefs.current[index + 1]?.focus?.();
        }

        setOtpError('');

        if (enteredOtp.length === 4 && expectedOtp && enteredOtp === expectedOtp) {
            setTimeout(() => startTripAfterOtp(enteredOtp), 250);
            return;
        }

        if (enteredOtp.length === 4 && expectedOtp) {
            setOtpError('Incorrect PIN. Please enter the PIN shown to the passenger.');
            refocusFirstOtpBox();
        }
    };

    const handleOTPKeyDown = (index, event) => {
        if (event?.nativeEvent?.key !== 'Backspace') {
            return;
        }

        if (otpValuesRef.current[index]) {
            const nextOtp = [...otpValuesRef.current];
            nextOtp[index] = '';
            setOtpValues(nextOtp);
            setOtpError('');
            return;
        }

        if (index > 0) {
            otpInputRefs.current[index - 1]?.focus?.();
        }
    };

    const isDevBuild = Boolean(globalThis.__ENV__?.DEV);
    const isPickupLeg = phase === 'to_pickup' || phase === 'otp_verification';
    const paymentActionEnabled = ['success', 'pay_later'].includes(driverPaymentStatus) && selectedPaymentMode !== 'cash';
    const paymentActionColor = paymentActionEnabled ? '#ffffff' : colors.slate[300];
    const paymentModes = [
        { id: 'cash', label: 'Cash', icon: Banknote },
        { id: 'online', label: 'Online', icon: Scan },
    ].filter((mode) => allowedPaymentModes.includes(mode.id));
    const isInlineQrImage = String(paymentQr?.imageUrl || '').startsWith('data:image/');
    const radiusPill = (unlocked) => (unlocked
        ? { box: { backgroundColor: colors.emerald[50], borderColor: colors.emerald[100] }, text: colors.emerald[600] }
        : { box: { backgroundColor: colors.amber[50], borderColor: colors.amber[100] }, text: colors.amber[600] });
    const arrivalPill = radiusPill(canMarkArrived);
    const deliveryPill = radiusPill(canDeliverParcel);
    const routeDashes = Array.from({ length: 7 });

    return (
        <Screen bg={colors.slate[200]} edges={[]} statusBarStyle="dark" keyboard>
            <View style={s.root}>
                <View style={[StyleSheet.absoluteFill, s.mapLayer]}>
                    {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                        <View style={s.mapMessageWrap}>
                            <View style={s.mapMessageCard}>
                                <Text style={s.mapMessageTitle}>Google Maps key missing</Text>
                                <Text style={s.mapMessageBody}>Set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</Text>
                            </View>
                        </View>
                    ) : loadError ? (
                        <View style={s.mapMessageWrap}>
                            <View style={s.mapMessageCard}>
                                <Text style={s.mapMessageTitle}>Google Maps failed to load</Text>
                                <Text style={s.mapMessageBody}>Check the browser key restrictions and reload.</Text>
                            </View>
                        </View>
                    ) : isLoaded ? (
                        <AppMap
                            ref={mapRef}
                            style={StyleSheet.absoluteFill}
                            initialRegion={regionFor(pickupPosition, 14)}
                            onMapReady={() => setMap(mapRef.current)}
                            customMapStyle={mapStyles}
                            zoomControlEnabled
                            rotateEnabled={false}
                            pitchEnabled={false}
                        >
                            {routePath.length > 1 ? (
                                <Polyline
                                    coordinates={routePath.map(toMapLatLng)}
                                    strokeColor={hexToRgba('#000000', 0.16)}
                                    strokeWidth={9}
                                    zIndex={10}
                                />
                            ) : null}
                            {routePath.length > 1 ? (
                                <Polyline
                                    coordinates={routePath.map(toMapLatLng)}
                                    strokeColor={hexToRgba(routeStrokeColor, 0.95)}
                                    strokeWidth={5}
                                    zIndex={20}
                                />
                            ) : null}
                            <RotatingVehicleMarker
                                position={driverPosition}
                                iconUrl={vehicleIconUrl}
                                heading={displayDriverHeading}
                                title="Driver"
                            />
                            <Marker
                                coordinate={toMapLatLng(activeDestination)}
                                anchor={{ x: 0.5, y: 0.5 }}
                                title={isPickupLeg ? 'Pickup' : 'Drop'}
                                zIndex={25}
                                tracksViewChanges={false}
                            >
                                <View style={[s.destinationDot, { backgroundColor: routeStrokeColor }]} />
                            </Marker>
                        </AppMap>
                    ) : (
                        <View style={s.mapMessageWrap}>
                            <View style={s.mapLoadingCard}>
                                <Text style={s.mapLoadingText}>Loading map</Text>
                            </View>
                        </View>
                    )}

                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.7)']}
                        style={s.mapBottomFade}
                    />

                    <PressScale
                        // web: history back; opened straight from a notification / cold start there is no screen below -> Home
                        onPress={() => (expoRouter.canGoBack() ? navigate(-1) : navigate('/taxi/driver/home', { replace: true }))}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                        style={[s.backButton, { top: insets.top + 32 }]}
                    >
                        <ArrowLeft size={18} color={colors.slate[900]} />
                    </PressScale>

                    <View style={[s.liveCard, { top: insets.top + 32 }]}>
                        <View style={[s.liveIconBox, { backgroundColor: routeStrokeColor }]}>
                            <AppImage src={vehicleIconUrl} accessibilityLabel="Vehicle" style={s.liveIcon} contentFit="contain" />
                        </View>
                        <View style={s.liveTextCol}>
                            {/* The card is dark; routeStrokeColor is black, so the label used to disappear into it. */}
                            <View style={s.liveLabelRow}>
                                <PulseView style={s.liveDot} />
                                <Text style={s.liveLabel}>Driver Live</Text>
                                <ArrowUpRight size={12} strokeWidth={3} color={colors.emerald[400]} />
                            </View>
                            <Text style={s.liveTitle} numberOfLines={1}>
                                {isPickupLeg ? `Near ${tripData.pickup}` : `Toward ${tripData.drop}`}
                            </Text>
                        </View>
                    </View>

                    <View style={[s.statRow, { top: insets.top + 112 }]}>
                        <View style={[s.statCard, { flexGrow: 1.25, minWidth: 0 }]}>
                            <Text style={s.statLabel}>Trip Stage</Text>
                            <Text style={s.statValue} numberOfLines={1}>
                                {phase === 'to_pickup' ? 'Heading To Pickup' : phase === 'otp_verification' ? 'Verify OTP' : phase === 'in_trip' ? 'On Trip' : phase === 'payment_confirm' ? 'Collect Payment' : 'Complete'}
                            </Text>
                        </View>
                        <View style={[s.statCard, { flexGrow: 0.75, minWidth: 72 }]}>
                            <Text style={s.statLabel}>ETA</Text>
                            <View style={s.statValueRow}>
                                <Clock3 size={12} color={routeStrokeColor} />
                                <Text style={[s.statValue, s.statValueInRow]} numberOfLines={1}>
                                    {Number(liveRaw?.estimatedDurationMinutes) > 0 && phase !== 'to_pickup' ? `${Math.round(Number(liveRaw.estimatedDurationMinutes))} mins` : '--'}
                                </Text>
                            </View>
                        </View>
                        <View style={[s.statCard, { flexGrow: 1, minWidth: 104 }]}>
                            <Text style={s.statLabel}>Route</Text>
                            <View style={s.statValueRow}>
                                <MapPinned size={12} color={colors.slate[500]} />
                                <Text style={[s.statValue, s.statValueInRow]} numberOfLines={1}>{phase === 'to_pickup' ? 'Pickup First' : 'To Destination'}</Text>
                            </View>
                        </View>
                    </View>

                    {routeError ? (
                        <View style={[s.routeErrorCard, { top: insets.top + 176, borderColor: routeAccentBorder }]}>
                            <Text style={[capsLabel(8, routeStrokeColor, 0.22, '600')]}>Route</Text>
                            <Text style={s.routeErrorText}>Using fallback path while directions load.</Text>
                        </View>
                    ) : null}

                    {/* Fake-GPS test tool: dev builds, or when the Global admin turned "Trip Simulation" on (off by default). */}
                    {(isDevBuild || isSimulationAllowed) ? (
                        <View style={[s.simCard, { top: insets.top + 176 }]}>
                            <View style={s.simHeader}>
                                <View style={s.simHeaderText}>
                                    <Text style={capsLabel(8, colors.slate[400], 0.22)}>Simulation</Text>
                                    <Text style={s.simState} numberOfLines={1}>
                                        {isSimulationRunning ? 'Following route' : isSimulationEnabled ? 'Paused' : 'Real GPS'}
                                    </Text>
                                </View>
                                <PulseView
                                    enabled={isSimulationRunning}
                                    style={[s.simDot, { backgroundColor: isSimulationEnabled ? routeStrokeColor : colors.slate[300] }]}
                                />
                            </View>
                            <View style={s.simTrack}>
                                <View
                                    style={[s.simFill, { backgroundColor: routeStrokeColor, width: `${isSimulationEnabled ? simulationProgress : 0}%` }]}
                                />
                            </View>
                            <View style={s.simButtons}>
                                <PressScale
                                    onPress={isSimulationRunning ? pauseSimulation : isSimulationEnabled ? resumeSimulation : startSimulation}
                                    style={[s.simButton, { backgroundColor: routeStrokeColor }]}
                                >
                                    <Text style={[s.simButtonText, { color: '#ffffff' }]}>
                                        {isSimulationRunning ? 'Pause' : isSimulationEnabled ? 'Resume' : 'Start'}
                                    </Text>
                                </PressScale>
                                <PressScale
                                    onPress={resetSimulation}
                                    disabled={!isSimulationEnabled}
                                    style={[s.simButton, s.simResetButton, !isSimulationEnabled ? { opacity: 0.4 } : null]}
                                >
                                    <Text style={[s.simButtonText, { color: colors.slate[500] }]}>Reset</Text>
                                </PressScale>
                            </View>
                            <Text style={s.simNote}>
                                Test mode emits live location events along this polyline.
                            </Text>
                        </View>
                    ) : null}
                </View>

                <View style={s.sheetDock} pointerEvents="box-none">
                    {phase === 'to_pickup' ? (
                        <PhaseSheet key="to_pickup" padding={20}>
                            <View style={[s.rowBetween, { marginBottom: 24 }]}>
                                <View style={[s.rowCenter, { gap: 12, flexShrink: 1 }]}>
                                    <View style={s.contactAvatar}>
                                        {isParcel ? <Package size={22} color={colors.slate[900]} /> : <User size={22} color={colors.slate[400]} />}
                                    </View>
                                    <View style={{ gap: 2, flexShrink: 1 }}>
                                        <Text style={s.contactName}>
                                            {isParcel ? tripData.sender.name : tripData.user.name}
                                        </Text>
                                        <View style={[s.rowCenter, { gap: 6, opacity: 0.6 }]}>
                                            <Star size={10} fill={routeStrokeColor} color={colors.black} />
                                            <Text style={s.contactMeta}>
                                                {(isParcel ? tripData.sender.rating : tripData.user.rating) || 'New'} • {riderDistanceLabel}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                                <View style={[s.rowCenter, { gap: 8 }]}>
                                    <PressScale onPress={openTripChat} style={s.contactAction} accessibilityLabel="Open trip chat">
                                        <MessageSquare size={18} strokeWidth={2.5} color={colors.slate[600]} />
                                        <ChatUnreadBadge count={chatUnread} />
                                    </PressScale>
                                    <PressScale onPress={() => callContact(pickupContact?.phone)} style={s.contactAction} accessibilityLabel="Call contact">
                                        <Phone size={18} strokeWidth={2.5} color={routeStrokeColor} />
                                    </PressScale>
                                </View>
                            </View>
                            <View style={s.radiusCard}>
                                <View style={[s.rowBetween, { gap: 12 }]}>
                                    <View style={{ flexShrink: 1 }}>
                                        <Text style={capsLabel(9, colors.slate[400], 0.22)}>Arrival Radius</Text>
                                        <Text style={s.radiusValue}>
                                            {Math.round(pickupDistanceMeters)} m away from pickup
                                        </Text>
                                    </View>
                                    <View style={[s.radiusPill, arrivalPill.box]}>
                                        <Text style={capsLabel(10, arrivalPill.text, 0.16)}>
                                            {canMarkArrived ? 'Unlocked' : 'Within 100 m'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            {arrivalGuardError ? (
                                <Text style={s.guardError}>
                                    {arrivalGuardError}
                                </Text>
                            ) : null}
                            <PressScale
                                scale={0.98}
                                onPress={() => {
                                    if (!canMarkArrived) {
                                        setArrivalGuardError('Reach within 100 meters of pickup before marking arrived.');
                                        return;
                                    }

                                    setArrivalGuardError('');
                                    setLocalArrivedAt(new Date().toISOString());
                                    setPhase('otp_verification');
                                    publishRideStatus('arriving');
                                }}
                                style={[s.bigAction, { borderRadius: 16, backgroundColor: routeStrokeColor }, actionShadow, canMarkArrived ? null : { opacity: 0.7 }]}
                            >
                                <Text style={s.bigActionText}>{isParcel ? 'Arrived at Sender' : 'I Have Arrived'}</Text>
                                <CheckCircle2 size={18} strokeWidth={3} color="#ffffff" />
                            </PressScale>
                        </PhaseSheet>
                    ) : null}

                    {phase === 'otp_verification' ? (
                        <PhaseSheet key="otp_verification" padding={24}>
                            <View style={{ alignItems: 'center', marginBottom: 24 }}>
                                <Text style={s.pinTitle}>Security Pin</Text>
                                <Text style={s.pinSubtitle}>
                                    Ask <Text style={{ color: colors.slate[900] }}>{isParcel ? 'Sender' : 'Passenger'}</Text> for Start PIN
                                </Text>
                            </View>
                            {isWaitingForOtp ? (
                                <View style={s.waitCard}>
                                    <View style={[s.rowBetween, { gap: 12 }]}>
                                        <View style={[s.rowCenter, { gap: 12 }]}>
                                            <View style={s.waitIcon}>
                                                <Clock3 size={18} strokeWidth={2.5} color={colors.amber[500]} />
                                            </View>
                                            <View>
                                                <Text style={capsLabel(9, colors.amber[600], 0.22)}>Waiting Clock</Text>
                                                <Text style={s.waitClock}>{formatTimerClock(waitingElapsedSeconds)}</Text>
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={capsLabel(9, colors.slate[400], 0.18)}>Free Left</Text>
                                            <Text style={s.waitValue}>{formatTimerClock(freeWaitingRemainingSeconds)}</Text>
                                        </View>
                                    </View>
                                    <View style={[s.gridRow, { marginTop: 16 }]}>
                                        <View style={s.waitTile}>
                                            <Text style={capsLabel(9, colors.slate[400], 0.18)}>Free Before Ride</Text>
                                            <Text style={s.waitValue}>{formatWholeMinutes(freeWaitingBeforeMinutes)}</Text>
                                        </View>
                                        <View style={s.waitTile}>
                                            <Text style={capsLabel(9, colors.slate[400], 0.18)}>Waiting Charge</Text>
                                            <Text style={s.waitValue}>
                                                Rs {waitingChargePerMinute}/min
                                                {waitingChargeableMinutes > 0 ? ` • ${waitingChargeableMinutes} billable` : ''}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ) : null}
                            <View style={s.otpRow}>
                                {otp.map((digit, index) => (
                                    <TextInput
                                        key={index}
                                        ref={(input) => {
                                            otpInputRefs.current[index] = input;
                                        }}
                                        keyboardType="number-pad"
                                        inputMode="numeric"
                                        value={digit}
                                        onChangeText={(text) => handleOTPChange(index, text)}
                                        onKeyPress={(event) => handleOTPKeyDown(index, event)}
                                        selectTextOnFocus
                                        style={[s.otpBox, { borderColor: routeAccentBorder }]}
                                    />
                                ))}
                            </View>
                            {otpError ? (
                                <Text style={s.otpError}>
                                    {otpError}
                                </Text>
                            ) : null}
                            <PressScale
                                onPress={() => startTripAfterOtp(otpValuesRef.current.join(''))}
                                style={[s.submitPin, { backgroundColor: routeStrokeColor }, actionShadowSmall]}
                            >
                                <Text style={s.submitPinText}>Submit PIN</Text>
                            </PressScale>
                            <View style={[s.rowCenter, { gap: 12 }]}>
                                <PressScale
                                    onPress={() => {
                                        setLocalArrivedAt('');
                                        setArrivalGuardError('');
                                        setPhase('to_pickup');
                                        publishRideStatus('accepted');
                                    }}
                                    style={[s.halfButton, s.goBackButton]}
                                >
                                    <Text style={[s.halfButtonText, { color: colors.slate[400] }]}>Go Back</Text>
                                </PressScale>
                                <PressScale onPress={openSupportChat} style={[s.halfButton, { backgroundColor: routeAccentSoft }]}>
                                    <Text style={[s.halfButtonText, { color: routeStrokeColor }]}>Support</Text>
                                </PressScale>
                            </View>
                        </PhaseSheet>
                    ) : null}

                    {phase === 'in_trip' ? (
                        <PhaseSheet key="in_trip" padding={20}>
                            <View style={s.destinationCard}>
                                <View style={[s.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[capsLabel(9, routeStrokeColor, 0.22, '600'), { lineHeight: 9, marginBottom: 6 }]}>Destination</Text>
                                        <Text style={s.destinationText}>
                                            {tripData.drop}
                                        </Text>
                                        {rideStops.length > 0 ? (
                                            <Text style={s.stopsText}>
                                                Stops on the way: {rideStops.map((stop, index) => `${index + 1}. ${stop}`).join('  ')}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <PressScale
                                        scale={0.9}
                                        onPress={triggerEmergencySos}
                                        style={[s.sosButton, { backgroundColor: routeAccentSoft, borderColor: routeAccentBorder }]}
                                        accessibilityLabel="Call emergency SOS"
                                    >
                                        <ShieldAlert size={22} strokeWidth={2.5} color={routeStrokeColor} />
                                    </PressScale>
                                </View>
                            </View>
                            <View style={s.tripContactRow}>
                                <View style={[s.rowCenter, { gap: 12, flexShrink: 1 }]}>
                                    <View style={s.tripContactIcon}>
                                        {isParcel ? <Package size={18} color="#ffffff" /> : <View style={{ opacity: 0.4 }}><User size={18} color="#ffffff" /></View>}
                                    </View>
                                    <View style={{ minWidth: 0, flexShrink: 1, gap: 2 }}>
                                        <Text style={s.tripContactName} numberOfLines={1}>{isParcel ? tripData.receiver.name : tripData.user.name}</Text>
                                        <Text style={s.tripContactRole}>{isParcel ? 'Receiver' : 'Passenger'}</Text>
                                    </View>
                                </View>
                                <Pressable onPress={() => callContact(destinationContact?.phone)} style={s.tripContactCall} accessibilityLabel="Call destination contact">
                                    <Phone size={16} strokeWidth={2.5} color={routeStrokeColor} />
                                </Pressable>
                            </View>
                            {isParcel ? (
                                <View style={s.radiusCard}>
                                    <View style={[s.rowBetween, { gap: 12 }]}>
                                        <View style={{ flexShrink: 1 }}>
                                            <Text style={capsLabel(9, colors.slate[400], 0.22)}>Delivery Radius</Text>
                                            <Text style={s.radiusValue}>
                                                {Math.round(dropDistanceMeters)} m away from receiver
                                            </Text>
                                        </View>
                                        <View style={[s.radiusPill, deliveryPill.box]}>
                                            <Text style={capsLabel(10, deliveryPill.text, 0.16)}>
                                                {canDeliverParcel ? 'Unlocked' : 'Within 100 m'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ) : null}
                            {isParcel && arrivalGuardError ? (
                                <Text style={s.guardError}>
                                    {arrivalGuardError}
                                </Text>
                            ) : null}
                            <PressScale
                                scale={0.96}
                                onPress={() => {
                                    if (isParcel && !canDeliverParcel) {
                                        setArrivalGuardError('Reach within 100 meters of receiver before delivering parcel.');
                                        return;
                                    }

                                    setArrivalGuardError('');
                                    setDestinationReachedAt(new Date().toISOString());
                                    publishRideStatus('arrived');
                                    setSelectedPaymentMode('');
                                    setPaymentQr(null);
                                    setPaymentQrError('');
                                    setDriverPaymentStatus('pending');
                                    setPhase('payment_confirm');
                                }}
                                style={[s.bigAction, { backgroundColor: routeStrokeColor }, actionShadow, isParcel && !canDeliverParcel ? { opacity: 0.7 } : null]}
                            >
                                <Text style={s.bigActionText}>{isParcel ? 'Deliver Parcel' : 'Arrived at Destination'}</Text>
                                <ChevronRight size={18} strokeWidth={3} color="#ffffff" />
                            </PressScale>
                        </PhaseSheet>
                    ) : null}

                    {phase === 'payment_confirm' ? (
                        <PhaseSheet key="payment_confirm" padding={24}>
                            <View style={{ alignItems: 'center', marginBottom: 24 }}>
                                <View style={[s.payStatusIcon, { backgroundColor: driverPaymentStatus === 'success' ? routeStrokeColor : '#0f172a' }]}>
                                    {driverPaymentStatus === 'success'
                                        ? <Check size={32} strokeWidth={4} color="#ffffff" />
                                        : <QrCode size={32} strokeWidth={2} color="#ffffff" />}
                                </View>
                                <Text style={s.payTitle}>
                                    {driverPaymentStatus === 'success' ? 'Payment Success!' : tripSummaryTitle}
                                </Text>
                                <Text style={s.paySubtitle}>
                                    {driverPaymentStatus === 'success' ? 'Ready to close this trip' : tripSummarySubtitle}
                                </Text>
                            </View>
                            <View style={s.summaryCard}>
                                <LinearGradient colors={['#f8fafc', '#ffffff']} style={StyleSheet.absoluteFill} pointerEvents="none" />
                                <View style={s.summaryHead}>
                                    <View style={[s.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
                                        <View style={{ minWidth: 0, flexShrink: 1 }}>
                                            <Text style={capsLabel(10, routeStrokeColor, 0.24)}>
                                                {tripSummaryTitle}
                                            </Text>
                                            <Text style={s.summaryFare}>{displayFare}</Text>
                                            <Text style={s.summaryNote}>
                                                {isParcel ? 'Parcel delivered and awaiting payment confirmation.' : 'Passenger reached destination and ready to complete.'}
                                            </Text>
                                        </View>
                                        <View style={[s.summaryPayment, { backgroundColor: routeAccentSoft }]}>
                                            <Text style={capsLabel(9, colors.slate[500], 0.2)}>Payment</Text>
                                            <Text style={s.summaryPaymentValue}>{paymentModeLabel}</Text>
                                        </View>
                                    </View>
                                </View>
                                <View style={s.summaryTiles}>
                                    <View style={s.gridRow}>
                                        <View style={s.summaryTile}>
                                            <View style={[s.rowCenter, { gap: 8 }]}>
                                                <Clock3 size={14} strokeWidth={2.5} color={colors.slate[500]} />
                                                <Text style={capsLabel(9, colors.slate[500], 0.2)}>Trip Started</Text>
                                            </View>
                                            <Text style={s.summaryTileValue}>{formatDateTimeLabel(tripStartedAt)}</Text>
                                        </View>
                                        <View style={s.summaryTile}>
                                            <View style={[s.rowCenter, { gap: 8 }]}>
                                                <CheckCircle2 size={14} strokeWidth={2.5} color={colors.slate[500]} />
                                                <Text style={capsLabel(9, colors.slate[500], 0.2)}>Reached At</Text>
                                            </View>
                                            <Text style={s.summaryTileValue}>{formatDateTimeLabel(tripArrivedAt)}</Text>
                                        </View>
                                    </View>
                                    <View style={s.gridRow}>
                                        <View style={s.summaryTile}>
                                            <View style={[s.rowCenter, { gap: 8 }]}>
                                                <ArrowUpRight size={14} strokeWidth={2.5} color={colors.slate[500]} />
                                                <Text style={capsLabel(9, colors.slate[500], 0.2)}>Trip Duration</Text>
                                            </View>
                                            <Text style={s.summaryTileValue}>{tripDurationLabel}</Text>
                                        </View>
                                        <View style={s.summaryTile}>
                                            <View style={[s.rowCenter, { gap: 8 }]}>
                                                <Banknote size={14} strokeWidth={2.5} color={colors.slate[500]} />
                                                <Text style={capsLabel(9, colors.slate[500], 0.2)}>Your Earnings</Text>
                                            </View>
                                            <Text style={s.summaryTileValue}>{formatCurrencyAmount(commissionSummary.driverEarnings)}</Text>
                                        </View>
                                    </View>
                                </View>
                                <View style={s.summarySection}>
                                    <View style={s.summaryInnerCard}>
                                        <View style={[s.rowCenter, { alignItems: 'flex-start', gap: 12 }]}>
                                            <View style={s.routeRail}>
                                                <View style={[s.routeRailDot, { backgroundColor: colors.emerald[500] }]} />
                                                <View style={s.routeRailDashes}>
                                                    {routeDashes.map((_, index) => (
                                                        <View key={`dash-${index}`} style={s.routeRailDash} />
                                                    ))}
                                                </View>
                                                <View style={[s.routeRailDot, { backgroundColor: colors.rose[500] }]} />
                                            </View>
                                            <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
                                                <View>
                                                    <Text style={capsLabel(9, colors.slate[400], 0.22)}>Pickup</Text>
                                                    <Text style={s.routeStopText}>{tripData.pickup}</Text>
                                                </View>
                                                {rideStops.map((stop, index) => (
                                                    <View key={`stop-${index}`}>
                                                        <Text style={capsLabel(9, colors.amber[600], 0.22)}>Stop {index + 1}</Text>
                                                        <Text style={s.routeStopText}>{stop}</Text>
                                                    </View>
                                                ))}
                                                <View>
                                                    <Text style={capsLabel(9, colors.slate[400], 0.22)}>Destination</Text>
                                                    <Text style={s.routeStopText}>{tripData.drop}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={[s.summaryInnerCard, { marginTop: 16 }]}>
                                        <View style={[s.rowBetween, { gap: 12 }]}>
                                            <View style={[s.rowCenter, { gap: 12, flexShrink: 1 }]}>
                                                <View style={s.summaryContactIcon}>
                                                    {isParcel ? <Package size={18} strokeWidth={2.5} color="#ffffff" /> : <User size={18} strokeWidth={2.5} color="#ffffff" />}
                                                </View>
                                                <View style={{ minWidth: 0, flexShrink: 1 }}>
                                                    <Text style={capsLabel(9, colors.slate[400], 0.2)}>{destinationRoleLabel}</Text>
                                                    <Text style={s.summaryContactName} numberOfLines={1}>{destinationContact?.name || '--'}</Text>
                                                    <Text style={s.summaryContactPhone}>{destinationContact?.phone || 'Phone not available'}</Text>
                                                </View>
                                            </View>
                                            <Pressable onPress={() => callContact(destinationContact?.phone)} style={s.summaryCall} accessibilityLabel="Call destination contact">
                                                <Phone size={16} strokeWidth={2.5} color={colors.slate[700]} />
                                            </Pressable>
                                        </View>
                                    </View>
                                </View>
                                <View style={[s.summarySection, s.gridRow]}>
                                    <View style={s.splitTile}>
                                        <Text style={capsLabel(9, colors.slate[400], 0.2)}>Trip Fare</Text>
                                        <Text style={s.splitValue}>{formatCurrencyAmount(fareAmount)}</Text>
                                    </View>
                                    <View style={s.splitTile}>
                                        <Text style={capsLabel(9, colors.slate[400], 0.2)}>Admin Cut</Text>
                                        <Text style={s.splitValue}>{formatCurrencyAmount(commissionSummary.commissionAmount)}</Text>
                                        <Text style={[capsLabel(9, colors.slate[400], 0.18, '700'), { marginTop: 4 }]}>{commissionSummary.commissionLabel}</Text>
                                    </View>
                                    <View style={[s.splitTile, s.splitTileDark, { backgroundColor: routeStrokeColor }]}>
                                        <Text style={capsLabel(9, 'rgba(255, 255, 255, 0.65)', 0.2)}>Driver Gets</Text>
                                        <Text style={[s.splitValue, { color: '#ffffff' }]}>{formatCurrencyAmount(commissionSummary.driverEarnings)}</Text>
                                    </View>
                                </View>
                                {earlierFeeAmount > 0 ? (
                                    <View style={s.earlierFeeBox}>
                                        <Text style={s.earlierFeeText}>
                                            Trip Fare includes {formatCurrencyAmount(earlierFeeAmount)} the rider owed from an earlier cancelled ride. Collect it too - it goes to the platform and is not part of your earning.
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                            {driverPaymentStatus === 'pending' ? (
                                <View style={[s.gridRow, { marginBottom: 24 }]}>
                                    {paymentModes.map((mode) => {
                                        const ModeIcon = mode.icon;
                                        const isSelected = selectedPaymentMode === mode.id;
                                        return (
                                            <Pressable
                                                key={mode.id}
                                                onPress={() => handlePaymentModeSelect(mode.id)}
                                                disabled={isGeneratingPaymentQr}
                                                style={[s.modeButton, isSelected ? { borderColor: routeStrokeColor, backgroundColor: routeAccentSoft } : null]}
                                            >
                                                <ModeIcon size={22} strokeWidth={2.5} color={isSelected ? routeStrokeColor : colors.slate[400]} />
                                                <Text style={s.modeLabel}>
                                                    {mode.id === 'online' && isGeneratingPaymentQr ? 'Generating' : mode.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ) : null}
                            {paymentQrError ? (
                                <View style={s.qrErrorBox}>
                                    <Text style={s.qrErrorText}>{paymentQrError}</Text>
                                    {/* No QR (network / Razorpay issue) must not trap the driver: the rider can still pay in the app. */}
                                    {selectedPaymentMode === 'online' && driverPaymentStatus === 'pending' ? (
                                        <Pressable onPress={() => { setPaymentQrError(''); setDriverPaymentStatus('pay_later'); }} style={{ marginTop: 8 }}>
                                            <Text style={s.qrErrorLink}>{paymentCollectionLabel === 'receiver' ? 'Receiver' : 'Rider'} will pay in the app</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            ) : null}
                            {selectedPaymentMode === 'cash' && driverPaymentStatus === 'success' ? (
                                <FadeIn style={s.cashCard}>
                                    <View style={[s.cashIcon, { backgroundColor: routeStrokeColor }]}>
                                        <Banknote size={24} strokeWidth={2.5} color="#ffffff" />
                                    </View>
                                    <Text style={capsLabel(10, colors.emerald[700], 0.18)}>Cash Selected</Text>
                                    <Text style={s.cashTitle}>Collect {displayFare} from the {paymentCollectionLabel}</Text>
                                    <Text style={s.cashNote}>
                                        Once you have the cash in hand, tap below to close this {isParcel ? 'delivery' : 'ride'}.
                                    </Text>
                                    <Pressable
                                        onPress={async () => {
                                            await completeRideForUserSync('cash');
                                            setPhase('review');
                                        }}
                                        style={[s.cashButton, { backgroundColor: routeStrokeColor }, actionShadowSmall]}
                                    >
                                        <Text style={s.cashButtonText}>Cash Received</Text>
                                    </Pressable>
                                </FadeIn>
                            ) : null}
                            {driverPaymentStatus === 'qr_generated' ? (
                                <FadeIn style={[s.qrCard, { backgroundColor: routeStrokeColor }]}>
                                    <Pressable
                                        onPress={() => !isInlineQrImage && setQrZoomed(!qrZoomed)}
                                        disabled={isInlineQrImage}
                                        style={({ pressed }) => [s.qrBox, pressed && !isInlineQrImage ? { transform: [{ scale: 0.98 }] } : null]}
                                    >
                                        <QrPaymentImage
                                            uri={paymentQr?.imageUrl}
                                            zoomed={qrZoomed}
                                            zoomable={!isInlineQrImage}
                                            label={`Payment QR for ${displayFare}`}
                                        />
                                        {/* Floating badge for zoom/fit state */}
                                        {!isInlineQrImage ? (
                                            <View style={s.qrBadge}>
                                                <PulseView>
                                                    <Scan size={10} strokeWidth={2.5} color={colors.emerald[400]} />
                                                </PulseView>
                                                <Text style={s.qrBadgeText}>{qrZoomed ? 'ZOOMED' : 'FIT'}</Text>
                                            </View>
                                        ) : null}
                                        {/* Glowing High-Tech Emerald Laser Scan Line */}
                                        <LaserScanLine />
                                    </Pressable>
                                    <Text style={s.qrTitle}>Scan to pay {displayFare}</Text>
                                    <Pressable onPress={() => !isInlineQrImage && setQrZoomed(!qrZoomed)} disabled={isInlineQrImage}>
                                        <Text style={s.qrHint}>
                                            {isInlineQrImage
                                                ? 'Razorpay collection QR for this ride'
                                                : qrZoomed
                                                    ? 'Tap QR to see full Razorpay receipt'
                                                    : 'Tap QR to zoom scan area'}
                                        </Text>
                                    </Pressable>
                                    {paymentQr?.linkUrl ? (
                                        <Pressable onPress={() => Linking.openURL(String(paymentQr.linkUrl)).catch(() => {})} style={{ marginBottom: 12 }}>
                                            <Text style={s.qrLink}>Open payment link</Text>
                                        </Pressable>
                                    ) : null}
                                    <Text style={s.qrAutoNote}>Payment is detected automatically when the {paymentCollectionLabel} pays this QR.</Text>
                                    <Pressable onPress={() => setDriverPaymentStatus('pay_later')} style={s.qrPayLater}>
                                        <Text style={s.qrPayLaterText}>{paymentCollectionLabel === 'receiver' ? 'Receiver' : 'Rider'} will pay in the app</Text>
                                    </Pressable>
                                </FadeIn>
                            ) : null}
                            {driverPaymentStatus === 'pay_later' && selectedPaymentMode !== 'cash' ? (
                                <View style={s.payLaterBox}>
                                    <Text style={s.payLaterText}>
                                        Online payment pending. Your earning of {formatCurrencyAmount(commissionSummary.driverEarnings)} is added to your wallet as soon as the {paymentCollectionLabel} pays in the app.
                                    </Text>
                                    <Pressable onPress={() => setDriverPaymentStatus(paymentQr?.id ? 'qr_generated' : 'pending')} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                                        <Text style={s.payLaterLink}>Back to QR / cash</Text>
                                    </Pressable>
                                </View>
                            ) : null}
                            <PressScale
                                scale={0.96}
                                disabled={!paymentActionEnabled}
                                onPress={async () => {
                                    const paymentMode = selectedPaymentMode || effectiveState?.paymentMethod || liveRequest?.payment || '';
                                    await completeRideForUserSync(paymentMode);
                                    setPhase('review');
                                }}
                                style={[
                                    s.bigAction,
                                    shadowXl,
                                    paymentActionEnabled
                                        ? [{ backgroundColor: routeStrokeColor }, actionShadow]
                                        : { backgroundColor: colors.slate[100] },
                                ]}
                            >
                                <Text style={[s.bigActionText, { color: paymentActionColor }]}>
                                    {selectedPaymentMode === 'cash'
                                        ? 'Use Cash Received Button'
                                        : driverPaymentStatus === 'success'
                                            ? 'Finalize Earnings'
                                            : driverPaymentStatus === 'pay_later'
                                                ? 'Close trip'
                                                : 'Waiting for payment...'}
                                </Text>
                                <ChevronRight size={18} strokeWidth={3} color={paymentActionColor} />
                            </PressScale>
                        </PhaseSheet>
                    ) : null}

                    {phase === 'review' ? (
                        <PhaseSheet key="review" animation="fade" scroll={false} padding={24} borderTopColor={colors.slate[50]}>
                            <View style={s.reviewHead}>
                                <View style={[s.reviewIcon, { backgroundColor: routeStrokeColor }]}>
                                    <User size={24} color="#ffffff" />
                                </View>
                                <Text style={s.reviewTitle}>Rate Experience</Text>
                                <View style={[s.rowCenter, { justifyContent: 'center', gap: 8 }]}>
                                    {[1, 2, 3, 4, 5].map((score) => (
                                        <Pressable key={score} onPress={() => setSelectedRating(score)} hitSlop={4} accessibilityLabel={`${score} star`}>
                                            <Star
                                                size={28}
                                                strokeWidth={2}
                                                color={score <= selectedRating ? routeStrokeColor : colors.slate[100]}
                                                fill={score <= selectedRating ? routeStrokeColor : 'transparent'}
                                            />
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                            <PressScale onPress={completeRideAndExit} style={[s.bigAction, { backgroundColor: routeStrokeColor }, actionShadow]}>
                                <Text style={s.bigActionText}>Done</Text>
                                <Check size={20} strokeWidth={4} color="#ffffff" />
                            </PressScale>
                        </PhaseSheet>
                    ) : null}
                </View>

                {isHydratingTrip ? (
                    <View style={s.hydratingOverlay}>
                        <View style={s.hydratingCard}>
                            <Text style={s.hydratingText}>Restoring active trip...</Text>
                        </View>
                    </View>
                ) : null}
            </View>
        </Screen>
    );
};

const shadowXl = { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 25, shadowOffset: { width: 0, height: 20 }, elevation: 12 };
const shadowLg = { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 8 };
const shadowSm = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 };
const shadow2xl = { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 50, shadowOffset: { width: 0, height: 25 }, elevation: 16 };
// shadow-[0_8px_22px_rgba(15,23,42,0.04)] / shadow-[0_8px_20px_rgba(15,23,42,0.04)]
const shadowSoft = { shadowColor: colors.slate[900], shadowOpacity: 0.04, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 2 };

const s = StyleSheet.create({
    root: { flex: 1, overflow: 'hidden', backgroundColor: colors.slate[200] },
    mapLayer: { overflow: 'hidden', backgroundColor: colors.slate[200] },
    mapMessageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.slate[200] },
    mapMessageCard: { borderRadius: 18, backgroundColor: alpha('#ffffff', 0.9), paddingHorizontal: 16, paddingVertical: 16, alignItems: 'center', ...shadowSm },
    mapMessageTitle: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[900], textAlign: 'center' },
    mapMessageBody: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[500], textAlign: 'center' },
    mapLoadingCard: { borderRadius: 16, backgroundColor: alpha('#ffffff', 0.9), paddingHorizontal: 16, paddingVertical: 12, ...shadowSm },
    mapLoadingText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[700] },
    mapBottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 176 },
    vehicleMarkerBox: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    vehicleMarkerImg: { width: 48, height: 48 },
    destinationDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#ffffff' },

    backButton: {
        position: 'absolute',
        left: 16,
        zIndex: 50,
        width: 40,
        height: 40,
        borderRadius: 16,
        backgroundColor: alpha('#ffffff', 0.95),
        borderWidth: 1,
        borderColor: alpha('#ffffff', 0.8),
        alignItems: 'center',
        justifyContent: 'center',
        ...shadowLg,
    },
    liveCard: {
        position: 'absolute',
        left: 64,
        right: 16,
        zIndex: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: alpha(colors.slate[900], 0.92),
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: alpha('#ffffff', 0.1),
        ...shadow2xl,
    },
    liveIconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadowXl },
    liveIcon: { width: 28, height: 28 },
    liveTextCol: { flex: 1, overflow: 'hidden', gap: 2 },
    liveLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.emerald[400] },
    liveLabel: { fontSize: 9, lineHeight: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: letterSpacing(0.05, 9), color: colors.emerald[400] },
    liveTitle: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: '#ffffff', textTransform: 'uppercase' },

    statRow: { position: 'absolute', left: 16, right: 16, zIndex: 40, flexDirection: 'row', gap: 8 },
    statCard: {
        flexBasis: 0,
        flexShrink: 1,
        borderRadius: 16,
        backgroundColor: alpha('#ffffff', 0.92),
        borderWidth: 1,
        borderColor: alpha('#ffffff', 0.8),
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...shadowLg,
    },
    statLabel: capsLabel(8, colors.slate[400], 0.22),
    statValue: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '900', color: colors.slate[900] },
    statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    statValueInRow: { marginTop: 0, flexShrink: 1 },

    routeErrorCard: {
        position: 'absolute',
        right: 16,
        zIndex: 40,
        minWidth: 148,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: alpha('#ffffff', 0.92),
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...shadowLg,
    },
    routeErrorText: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '600', color: colors.slate[700] },

    simCard: {
        position: 'absolute',
        left: 16,
        zIndex: 40,
        width: 190,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: alpha('#ffffff', 0.8),
        backgroundColor: alpha('#ffffff', 0.94),
        paddingHorizontal: 12,
        paddingVertical: 12,
        ...shadowLg,
    },
    simHeader: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    simHeaderText: { minWidth: 0, flexShrink: 1 },
    simState: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '900', color: colors.slate[900] },
    simDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    simTrack: { marginBottom: 8, height: 6, overflow: 'hidden', borderRadius: 9999, backgroundColor: colors.slate[100] },
    simFill: { height: '100%', borderRadius: 9999 },
    simButtons: { flexDirection: 'row', gap: 8 },
    simButton: { flex: 1, height: 36, borderRadius: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
    simResetButton: { borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.slate[50] },
    simButtonText: { fontSize: 9, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 9) },
    simNote: { marginTop: 8, fontSize: 9, lineHeight: 11, fontWeight: '600', color: colors.slate[400] },

    sheetDock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40 },
    sheet: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        borderTopWidth: 1,
        ...shadow2xl,
    },

    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowCenter: { flexDirection: 'row', alignItems: 'center' },
    gridRow: { flexDirection: 'row', gap: 12 },

    contactAvatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.slate[50], borderWidth: 1, borderColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
    contactName: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.slate[900], letterSpacing: letterSpacing(-0.025, 15), textTransform: 'uppercase' },
    contactMeta: { fontSize: 9, lineHeight: 12, fontWeight: '600', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 9) },
    contactAction: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },

    radiusCard: { marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: alpha(colors.slate[50], 0.8), paddingHorizontal: 16, paddingVertical: 12 },
    radiusValue: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.slate[900] },
    radiusPill: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
    guardError: {
        marginTop: -4,
        marginBottom: 16,
        textAlign: 'center',
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '900',
        color: colors.red[500],
        textTransform: 'uppercase',
        letterSpacing: letterSpacing(0.05, 11),
    },
    bigAction: { width: '100%', height: 60, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    bigActionText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#ffffff', textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 14) },

    pinTitle: { fontSize: 20, lineHeight: 22, fontWeight: '600', color: colors.slate[900], letterSpacing: letterSpacing(-0.025, 20), textTransform: 'uppercase', textAlign: 'center' },
    pinSubtitle: { marginTop: 8, fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400], letterSpacing: letterSpacing(0.025, 10), textTransform: 'uppercase', textAlign: 'center' },
    waitCard: { marginBottom: 24, borderRadius: 24, borderWidth: 1, borderColor: colors.amber[100], backgroundColor: alpha(colors.amber[50], 0.7), paddingHorizontal: 16, paddingVertical: 16, ...shadowSm },
    waitIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', ...shadowSm },
    waitClock: { marginTop: 4, fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: letterSpacing(-0.025, 22), color: colors.slate[900] },
    waitValue: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '900', color: colors.slate[900] },
    waitTile: { flex: 1, borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 12, ...shadowSm },
    otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 32 },
    otpBox: {
        width: 48,
        height: 64,
        backgroundColor: colors.slate[50],
        borderWidth: 2,
        borderRadius: 16,
        textAlign: 'center',
        fontSize: 30,
        fontWeight: '600',
        color: colors.slate[900],
        padding: 0,
    },
    otpError: {
        marginTop: -20,
        marginBottom: 20,
        textAlign: 'center',
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '900',
        color: colors.red[500],
        textTransform: 'uppercase',
        letterSpacing: letterSpacing(0.05, 11),
    },
    submitPin: { marginBottom: 12, height: 52, width: '100%', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    submitPinText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: letterSpacing(0.1, 12), color: '#ffffff' },
    halfButton: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    goBackButton: { borderWidth: 2, borderColor: colors.slate[100] },
    halfButtonText: { fontSize: 12, lineHeight: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 12) },

    destinationCard: {
        marginBottom: 20,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: alpha(colors.slate[50], 0.85),
        paddingHorizontal: 16,
        paddingVertical: 14,
        // shadow-[0_2px_10px_rgba(15,23,42,0.04)]
        shadowColor: colors.slate[900],
        shadowOpacity: 0.04,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    destinationText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.slate[900], letterSpacing: letterSpacing(-0.025, 15) },
    stopsText: { marginTop: 6, fontSize: 12, lineHeight: 20, fontWeight: '700', color: colors.amber[700] },
    sosButton: { flexShrink: 0, width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', ...shadowSm },
    tripContactRow: {
        backgroundColor: colors.slate[50],
        borderRadius: 16,
        padding: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.slate[100],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    tripContactIcon: { width: 40, height: 40, backgroundColor: colors.slate[900], borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    tripContactName: { fontSize: 13, lineHeight: 15, fontWeight: '600', color: colors.slate[900], textTransform: 'uppercase' },
    tripContactRole: { fontSize: 8, lineHeight: 11, fontWeight: '600', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 8) },
    tripContactCall: { flexShrink: 0, width: 36, height: 36, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },

    payStatusIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...shadowLg },
    payTitle: { fontSize: 24, lineHeight: 32, fontWeight: '600', color: colors.slate[900], textTransform: 'uppercase', textAlign: 'center' },
    paySubtitle: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 12), textAlign: 'center' },
    summaryCard: {
        marginBottom: 24,
        overflow: 'hidden',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: '#ffffff',
        // shadow-[0_18px_45px_rgba(15,23,42,0.07)]
        shadowColor: colors.slate[900],
        shadowOpacity: 0.07,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 18 },
        elevation: 4,
    },
    summaryHead: { borderBottomWidth: 1, borderBottomColor: colors.slate[100], paddingHorizontal: 20, paddingVertical: 16 },
    summaryFare: { marginTop: 8, fontSize: 24, lineHeight: 32, fontWeight: '900', letterSpacing: letterSpacing(-0.025, 24), color: colors.slate[900] },
    summaryNote: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
    summaryPayment: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
    summaryPaymentValue: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '900', color: colors.slate[900], textAlign: 'right' },
    summaryTiles: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
    summaryTile: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12 },
    summaryTileValue: { marginTop: 8, fontSize: 13, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
    summarySection: { borderTopWidth: 1, borderTopColor: colors.slate[100], paddingHorizontal: 20, paddingVertical: 16 },
    summaryInnerCard: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: '#ffffff', padding: 16, ...shadowSoft },
    routeRail: { marginTop: 4, alignItems: 'center' },
    routeRailDot: { width: 12, height: 12, borderRadius: 6 },
    routeRailDashes: { marginVertical: 4, height: 40, justifyContent: 'space-between', alignItems: 'center' },
    routeRailDash: { width: 1, height: 3, backgroundColor: colors.slate[200] },
    routeStopText: { marginTop: 4, fontSize: 13, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
    summaryContactIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.slate[900], alignItems: 'center', justifyContent: 'center' },
    summaryContactName: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
    summaryContactPhone: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
    summaryCall: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
    splitTile: { flex: 1, borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', ...shadowSoft },
    // shadow-[0_10px_24px_rgba(15,23,42,0.12)]
    splitTileDark: { shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
    splitValue: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900], textAlign: 'center' },
    earlierFeeBox: { borderTopWidth: 1, borderTopColor: colors.slate[100], paddingHorizontal: 20, paddingVertical: 12 },
    earlierFeeText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.amber[600] },

    modeButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 2,
        // Tailwind's default border colour (global.css --border)
        borderColor: '#e6e0d1',
        backgroundColor: alpha(colors.slate[50], 0.5),
    },
    modeLabel: { marginTop: 8, fontSize: 9, lineHeight: 12, fontWeight: '600', color: colors.slate[900], textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 9) },
    qrErrorBox: { marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: colors.red[100], backgroundColor: colors.red[50], paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
    qrErrorText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.red[500], textAlign: 'center' },
    qrErrorLink: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 10), color: colors.red[600], textDecorationLine: 'underline', textAlign: 'center' },
    cashCard: { marginBottom: 24, borderRadius: 24, borderWidth: 1, borderColor: colors.emerald[100], backgroundColor: alpha(colors.emerald[50], 0.8), padding: 20, alignItems: 'center', ...shadowLg },
    cashIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...shadowLg },
    cashTitle: { marginTop: 8, fontSize: 16, lineHeight: 22, fontWeight: '900', color: colors.slate[900], textAlign: 'center' },
    cashNote: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.slate[500], textAlign: 'center' },
    cashButton: { marginTop: 16, width: '100%', borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    cashButtonText: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: letterSpacing(0.16, 11), color: '#ffffff' },
    qrCard: { borderRadius: 24, padding: 20, marginBottom: 24, alignItems: 'center', ...shadow2xl },
    qrBox: {
        marginBottom: 12,
        height: QR_BOX_HEIGHT,
        width: '100%',
        maxWidth: QR_BOX_HEIGHT,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: '#ffffff',
        padding: 12,
        overflow: 'hidden',
    },
    qrImageWrap: { width: '100%', height: '100%' },
    qrImage: { width: '100%', height: '100%' },
    qrBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: alpha(colors.slate[900], 0.7),
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: alpha('#ffffff', 0.1),
        ...shadowLg,
    },
    qrBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: '#ffffff' },
    laserLine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        // shadow-[0_0_10px_#34d399]
        shadowColor: '#34d399',
        shadowOpacity: 1,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 0 },
    },
    qrTitle: { color: '#ffffff', fontWeight: '600', fontSize: 14, lineHeight: 20, textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 14), textAlign: 'center' },
    qrHint: { color: alpha('#ffffff', 0.45), fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 4, marginBottom: 16, textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 10), textAlign: 'center' },
    qrLink: { fontSize: 10, lineHeight: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 10), color: alpha('#ffffff', 0.7), textDecorationLine: 'underline', textAlign: 'center' },
    qrAutoNote: { marginBottom: 8, fontSize: 10, lineHeight: 14, fontWeight: '600', color: alpha('#ffffff', 0.6), textAlign: 'center' },
    qrPayLater: { width: '100%', paddingVertical: 12, backgroundColor: alpha('#ffffff', 0.1), borderRadius: 14, borderWidth: 1, borderColor: alpha('#ffffff', 0.05), alignItems: 'center', justifyContent: 'center' },
    qrPayLaterText: { color: '#ffffff', fontSize: 10, lineHeight: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 10), textAlign: 'center' },
    payLaterBox: { marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.amber[100], backgroundColor: colors.amber[50], paddingHorizontal: 16, paddingVertical: 12 },
    payLaterText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.amber[800] },
    payLaterLink: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: letterSpacing(0.025, 10), color: colors.amber[700], textDecorationLine: 'underline' },

    reviewHead: { marginBottom: 32, gap: 16, alignItems: 'center' },
    reviewIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadowLg },
    reviewTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.slate[900], textTransform: 'uppercase', letterSpacing: letterSpacing(-0.025, 20), textAlign: 'center' },

    hydratingOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        elevation: 30,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: alpha(colors.slate[200], 0.9),
    },
    hydratingCard: { borderRadius: 16, backgroundColor: alpha('#ffffff', 0.95), paddingHorizontal: 16, paddingVertical: 12, ...shadowSm },
    hydratingText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[700] },
});

export default ActiveTrip;
