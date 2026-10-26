// Web: BusDriverLiveRoute.jsx (/taxi/driver/bus-home/live-route) — live bus control: start / pause / resume /
// complete / reset the journey, the route map and the bus GPS that is sent to the server.
// Native differences (platform only):
// - Map: AppMap (react-native-maps, Google) instead of @react-google-maps/api. The same markers (the web's SVG pins,
//   drawn with react-native-svg), the grey remaining-route line and the red live trail. fitBounds -> fitToCoordinates,
//   panTo / setZoom -> animateCamera. "Manual View" starts when the driver drags or pinches the map (web: dragstart /
//   zoom_changed that the page did not cause). The web's controlled `center` prop re-centred the map whenever the
//   bus moved; the same is done with setCamera.
// - GPS: navigator.geolocation (webCompat over expo-location), same watch options, same send rule (every 120 m or
//   8 s), same 20 s live-trip refresh. The web does not keep the screen on and does not open Google Maps, so this page
//   does neither.
// - window.confirm -> Alert with Cancel / OK.
// - Font: the web page sets 'Plus Jakarta Sans' on its root, so the page is a FontScope of that family.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  Clock3,
  LocateFixed,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route as RouteIcon,
  RotateCcw,
  Square,
} from 'lucide-react-native';
import simplify from 'simplify-js';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { FontScope, StatusBarScrim, Text } from '@/native/ui';
import { AppMap, Marker, Polyline, regionFor, toLatLng as toMapLatLng } from '@/native/ui/AppMap';
import { alpha, colors, driverTheme, fonts, shadow } from '@/theme';
import { HAS_VALID_GOOGLE_MAPS_KEY } from '../../admin/utils/googleMaps';
import { computeDrivingRoute } from '../../../shared/utils/googleRoutes';
import { getCurrentDriver } from '../services/registrationService';
import {
  getBusDriverLiveTrip,
  startBusDriverLiveTrip,
  updateBusDriverLiveLocation,
  updateBusDriverLiveTripStatus,
} from '../services/busDriverService';
import { formatClockTime } from '../../../shared/utils/clockTime';

const PAGE_BG = '#f6f7fb';
const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const LIVE_SYNC_DISTANCE_KM = 0.12;
const LIVE_SYNC_INTERVAL_MS = 8000;
const LIVE_TRAIL_MAX_DISTANCE_KM = 2.5;
const LIVE_TRAIL_MAX_POINTS = 80;

const STOP_TYPE_TONE = {
  pickup: { bg: colors.emerald[50], text: colors.emerald[700], border: colors.emerald[200] },
  drop: { bg: colors.rose[50], text: colors.rose[700], border: colors.rose[200] },
  both: { bg: colors.indigo[50], text: colors.indigo[700], border: colors.indigo[200] },
};
const DEFAULT_STOP_TONE = { bg: colors.slate[100], text: colors.slate[600], border: colors.slate[200] };

const STATUS_TONE = {
  idle: { bg: colors.slate[100], text: colors.slate[700], border: colors.slate[200] },
  in_progress: { bg: colors.emerald[50], text: colors.emerald[700], border: colors.emerald[200] },
  paused: { bg: colors.amber[50], text: colors.amber[700], border: colors.amber[200] },
  completed: { bg: colors.sky[50], text: colors.sky[700], border: colors.sky[200] },
};

const unwrap = (response) => response?.data?.data || response?.data || response;

const formatDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createToday = () => formatDateKey(new Date());

const parseDateKey = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const formatDisplayDate = (value) => {
  if (!value) return 'No date selected';
  const date = parseDateKey(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const toLatLng = (source, fallback = null) => {
  const lat = Number(source?.lat ?? source?.latitude);
  const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return fallback;
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const getDistanceKm = (pointA, pointB) => {
  if (!pointA || !pointB) return 0;

  const lat1 = Number(pointA.lat);
  const lng1 = Number(pointA.lng);
  const lat2 = Number(pointB.lat);
  const lng2 = Number(pointB.lng);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const simplifyLatLngPath = (points, tolerance = 0.0006) => {
  const normalized = (Array.isArray(points) ? points : [])
    .map((point) => toLatLng(point))
    .filter(Boolean);

  if (normalized.length <= 2) {
    return normalized;
  }

  return simplify(
    normalized.map((point) => ({ x: point.lng, y: point.lat, ...point })),
    tolerance,
    true,
  ).map((point) => ({ lat: point.y, lng: point.x }));
};

const buildFallbackRoute = (origin, destination) => [origin, destination].filter(Boolean);

const getPathDistanceKm = (points = []) =>
  (Array.isArray(points) ? points : []).reduce((total, point, index, items) => {
    if (index === 0) return total;
    return total + getDistanceKm(items[index - 1], point);
  }, 0);

const trimLiveTrail = (points = []) => {
  const normalized = (Array.isArray(points) ? points : [])
    .map((point) => {
      const coords = toLatLng(point);
      return coords ? { ...point, ...coords } : null;
    })
    .filter(Boolean)
    .slice(-LIVE_TRAIL_MAX_POINTS);

  if (normalized.length <= 2) {
    return normalized;
  }

  const kept = [normalized[normalized.length - 1]];
  let distanceKm = 0;

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const nextPoint = kept[kept.length - 1];
    const candidate = normalized[index];
    distanceKm += getDistanceKm(candidate, nextPoint);

    if (distanceKm > LIVE_TRAIL_MAX_DISTANCE_KM) {
      break;
    }

    kept.push(candidate);
  }

  return kept.reverse();
};

const getStatusLabel = (status) =>
  ({
    idle: 'Waiting to start',
    in_progress: 'Journey in progress',
    paused: 'Tracking paused',
    completed: 'Journey completed',
  }[String(status || '').toLowerCase()] || 'Waiting to start');

const getCurrentPositionAsync = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Live GPS is not available on this device'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speedKmph: Number.isFinite(position.coords.speed) ? position.coords.speed * 3.6 : null,
          recordedAt: new Date().toISOString(),
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });

const buildRouteMetrics = (routePath, currentLocation) => {
  if (!routePath.length || !currentLocation) {
    return {
      totalDistanceKm: 0,
      coveredDistanceKm: 0,
      remainingDistanceKm: 0,
      progressPercent: 0,
    };
  }

  const cumulative = [0];
  for (let index = 1; index < routePath.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + getDistanceKm(routePath[index - 1], routePath[index]);
  }

  const totalDistanceKm = cumulative[cumulative.length - 1] || 0;
  if (totalDistanceKm <= 0) {
    return {
      totalDistanceKm,
      coveredDistanceKm: 0,
      remainingDistanceKm: 0,
      progressPercent: 0,
    };
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  routePath.forEach((point, index) => {
    const distance = getDistanceKm(point, currentLocation);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  const coveredDistanceKm = cumulative[nearestIndex] || 0;
  const remainingDistanceKm = Math.max(0, totalDistanceKm - coveredDistanceKm);
  const progressPercent = Math.max(0, Math.min(100, (coveredDistanceKm / totalDistanceKm) * 100));

  return {
    totalDistanceKm,
    coveredDistanceKm,
    remainingDistanceKm,
    progressPercent,
  };
};

const findNearestRouteIndex = (routePath, currentLocation) => {
  if (!Array.isArray(routePath) || !routePath.length || !currentLocation) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  routePath.forEach((point, index) => {
    const distance = getDistanceKm(point, currentLocation);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
};

const buildRemainingRoutePath = (routePath, currentLocation) => {
  const normalizedRoute = (Array.isArray(routePath) ? routePath : [])
    .map((point) => toLatLng(point))
    .filter(Boolean);
  const currentPoint = toLatLng(currentLocation);

  if (normalizedRoute.length <= 1) {
    return normalizedRoute;
  }

  if (!currentPoint) {
    return normalizedRoute;
  }

  const nearestIndex = findNearestRouteIndex(normalizedRoute, currentPoint);
  const remainingRoute = normalizedRoute.slice(Math.min(nearestIndex + 1, normalizedRoute.length - 1));
  const firstRemainingPoint = remainingRoute[0];

  if (firstRemainingPoint && getDistanceKm(currentPoint, firstRemainingPoint) < 0.03) {
    return [firstRemainingPoint, ...remainingRoute.slice(1)];
  }

  return [currentPoint, ...remainingRoute];
};
const getRouteCacheKey = (origin, destination) => {
  const serializePoint = (point) =>
    point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

  return `${serializePoint(origin)}|${serializePoint(destination)}`;
};

// ------------------------------------------------------------------ the web's SVG marker icons

/** A custom marker view is drawn once, then the bitmap is kept (tracksViewChanges off after the first paint). */
const useTracksOnce = () => {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracks(false), 800);
    return () => clearTimeout(timer);
  }, []);
  return tracks;
};

const OriginPin = () => (
  <Svg width={38} height={46} viewBox="0 0 38 46" fill="none">
    <Path d="M19 2C10.2 2 3 9 3 17.6C3 29.2 19 44 19 44C19 44 35 29.2 35 17.6C35 9 27.8 2 19 2Z" fill="#16A34A" />
    <SvgCircle cx="19" cy="18" r="7" fill="white" />
    <Path d="M16 18.2L18.1 20.3L22.8 15.7" stroke="#16A34A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const DestinationPin = () => (
  <Svg width={38} height={46} viewBox="0 0 38 46" fill="none">
    <Path d="M19 2C10.2 2 3 9 3 17.6C3 29.2 19 44 19 44C19 44 35 29.2 35 17.6C35 9 27.8 2 19 2Z" fill="#DC2626" />
    <SvgCircle cx="19" cy="18" r="7" fill="white" />
    <SvgCircle cx="19" cy="18" r="3.4" fill="#DC2626" />
  </Svg>
);

const BusPin = () => (
  <Svg width={44} height={56} viewBox="0 0 44 56" fill="none">
    <Path d="M22 2C11.5 2 3 10.4 3 20.8C3 34.4 22 54 22 54C22 54 41 34.4 41 20.8C41 10.4 32.5 2 22 2Z" fill="#2563EB" />
    <SvgCircle cx="22" cy="21" r="12" fill="white" />
    <Path
      d="M15.5 16.8C15.5 14.7013 17.2013 13 19.3 13H24.7C26.7987 13 28.5 14.7013 28.5 16.8V24.2C28.5 25.626 27.396 26.8 26 26.8V28.2C26 28.7523 25.5523 29.2 25 29.2H24.4C23.8477 29.2 23.4 28.7523 23.4 28.2V26.8H20.6V28.2C20.6 28.7523 20.1523 29.2 19.6 29.2H19C18.4477 29.2 18 28.7523 18 28.2V26.8C16.604 26.8 15.5 25.626 15.5 24.2V16.8Z"
      fill="#2563EB"
    />
    <Path d="M18 16.4H26V20.2H18V16.4Z" fill="#BFDBFE" />
    <SvgCircle cx="19.8" cy="23.4" r="1.5" fill="#0F172A" />
    <SvgCircle cx="24.2" cy="23.4" r="1.5" fill="#0F172A" />
  </Svg>
);

// anchors of the web icons: (19, 44) of 38x46 and (22, 54) of 44x56
const PIN_ANCHOR = { x: 19 / 38, y: 44 / 46 };
const BUS_ANCHOR = { x: 22 / 44, y: 54 / 56 };

const SvgMarker = ({ coordinate, title, anchor, children }) => {
  const tracks = useTracksOnce();
  return (
    <Marker coordinate={coordinate} title={title} anchor={anchor} tracksViewChanges={tracks}>
      {children}
    </Marker>
  );
};

const InfoTile = ({ label, title, sub, Icon }) => (
  <View style={s.tile}>
    {Icon ? (
      <View style={s.iconLabel}>
        <Icon size={14} color={colors.slate[400]} />
        <Text style={s.cap11b}>{label}</Text>
      </View>
    ) : (
      <Text style={s.cap10}>{label}</Text>
    )}
    <Text style={[s.textSmBlack, { marginTop: 8 }]}>{title}</Text>
    <Text style={[s.textSm, { marginTop: 4, color: colors.slate[500] }]}>{sub}</Text>
  </View>
);

const BusDriverLiveRoute = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const seededState = location.state || {};
  const mapRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSyncedPointRef = useRef(null);
  const lastSyncedAtRef = useRef(0);
  const routeCacheRef = useRef(new Map());
  const hasAutoFittedRef = useRef(false);
  const programmaticCameraRef = useRef(false);
  const seededProfileRef = useRef(seededState.profile || null);
  const [profile, setProfile] = useState(seededState.profile || null);
  const [travelDate, setTravelDate] = useState(seededState.travelDate || '');
  const [selectedScheduleId, setSelectedScheduleId] = useState(seededState.selectedScheduleId || '');
  const [routePath, setRoutePath] = useState([]);
  const [trailPoints, setTrailPoints] = useState([]);
  const [loading, setLoading] = useState(!seededState.profile);
  const [syncingTrip, setSyncingTrip] = useState(false);
  const [tripActionPending, setTripActionPending] = useState(false);
  const [locationPermissionError, setLocationPermissionError] = useState('');
  const [isFollowingBus, setIsFollowingBus] = useState(true);
  // web: mapRef is set in GoogleMap onLoad; here onMapReady
  const [mapLoaded, setMapLoaded] = useState(false);
  const isMapReady = HAS_VALID_GOOGLE_MAPS_KEY;

  const releaseProgrammaticCameraLock = useCallback(() => {
    setTimeout(() => {
      programmaticCameraRef.current = false;
    }, 220);
  }, []);

  const fitMapToPoints = useCallback((points) => {
    if (!mapRef.current || !Array.isArray(points) || !points.length) {
      return;
    }

    const coordinates = points
      .map((point) => toLatLng(point))
      .filter(Boolean)
      .map((point) => toMapLatLng(point));

    if (coordinates.length) {
      programmaticCameraRef.current = true;
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
        animated: true,
      });
      releaseProgrammaticCameraLock();
    }
  }, [releaseProgrammaticCameraLock]);

  const centerMapOnPoint = useCallback(async (point, zoom = 15, force = false) => {
    const normalized = toLatLng(point);
    const map = mapRef.current;
    if (!map || !normalized) {
      return;
    }

    let camera = null;
    try {
      camera = await map.getCamera();
    } catch {
      camera = null;
    }
    const currentZoom = Number(camera?.zoom || 0);
    const centerPoint = camera?.center
      ? { lat: camera.center.latitude, lng: camera.center.longitude }
      : null;
    const distanceFromCenterKm = centerPoint ? getDistanceKm(centerPoint, normalized) : Number.POSITIVE_INFINITY;

    programmaticCameraRef.current = true;

    const nextCamera = {};
    if (force || distanceFromCenterKm > 0.08) {
      nextCamera.center = toMapLatLng(normalized);
    }

    if (force || currentZoom < zoom - 0.3 || currentZoom > zoom + 1.2) {
      nextCamera.zoom = zoom;
    }

    if (nextCamera.center || nextCamera.zoom) {
      mapRef.current?.animateCamera(nextCamera, { duration: 400 });
    }

    releaseProgrammaticCameraLock();
  }, [releaseProgrammaticCameraLock]);

  const mergeProfileAndTrip = useCallback((baseProfile, liveTripPayload) => {
    if (!baseProfile) {
      return null;
    }

    return {
      ...baseProfile,
      busService: baseProfile.busService
        ? {
            ...baseProfile.busService,
            liveTracking: liveTripPayload?.liveTracking || baseProfile.busService.liveTracking || null,
            route: liveTripPayload?.route || baseProfile.busService.route || {},
            schedules: Array.isArray(liveTripPayload?.schedules)
              ? liveTripPayload.schedules
              : baseProfile.busService.schedules || [],
          }
        : baseProfile.busService,
    };
  }, []);

  const syncLiveTrip = useCallback(async () => {
    setSyncingTrip(true);
    try {
      const tripResponse = await getBusDriverLiveTrip();
      const tripData = unwrap(tripResponse);
      setProfile((currentProfile) => {
        const seed = currentProfile || seededProfileRef.current;
        return mergeProfileAndTrip(seed, tripData);
      });
      setTrailPoints(trimLiveTrail(tripData?.liveTracking?.recentPath));
      if (tripData?.liveTracking?.travelDate && !travelDate) {
        setTravelDate(tripData.liveTracking.travelDate);
      }
      if (tripData?.liveTracking?.scheduleId && !selectedScheduleId) {
        setSelectedScheduleId(tripData.liveTracking.scheduleId);
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to load live journey data');
    } finally {
      setSyncingTrip(false);
    }
  }, [mergeProfileAndTrip, selectedScheduleId, travelDate]);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const response = await getCurrentDriver();
        const data = unwrap(response);
        if (!active) return;
        seededProfileRef.current = data;
        setProfile(data);

        const firstSchedule = Array.isArray(data?.busService?.schedules) ? data.busService.schedules[0] : null;
        const liveScheduleId = data?.busService?.liveTracking?.scheduleId || '';
        const liveTravelDate = data?.busService?.liveTracking?.travelDate || '';

        if (!selectedScheduleId) {
          setSelectedScheduleId(seededState.selectedScheduleId || liveScheduleId || firstSchedule?.id || '');
        }
        if (!travelDate) {
          setTravelDate(seededState.travelDate || liveTravelDate || createToday());
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Unable to load live route details');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [seededState.selectedScheduleId, seededState.travelDate, selectedScheduleId, travelDate]);

  useEffect(() => {
    if (profile?.busService) {
      setTrailPoints(trimLiveTrail(profile.busService.liveTracking?.recentPath));
    }
  }, [profile?.busService]);

  useEffect(() => {
    syncLiveTrip();
  }, [syncLiveTrip]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      syncLiveTrip();
    }, 20000);

    return () => clearInterval(intervalId);
  }, [syncLiveTrip]);

  const busService = profile?.busService || null;
  const liveTracking = busService?.liveTracking || {
    status: 'idle',
    scheduleId: '',
    travelDate: '',
    currentLocation: null,
    recentPath: [],
    totalDistanceKm: 0,
  };
  const schedules = Array.isArray(busService?.schedules) ? busService.schedules : [];
  const effectiveScheduleId = liveTracking?.scheduleId || selectedScheduleId || schedules[0]?.id || '';
  const effectiveTravelDate = liveTracking?.travelDate || travelDate || createToday();
  const selectedSchedule =
    schedules.find((item) => item.id === effectiveScheduleId) ||
    schedules.find((item) => item.id === selectedScheduleId) ||
    schedules[0] ||
    null;
  const routeStops = Array.isArray(busService?.route?.stops) ? busService.route.stops : [];
  const pickupStops = routeStops.filter((stop) => stop?.stopType === 'pickup' || stop?.stopType === 'both');
  const dropStops = routeStops.filter((stop) => stop?.stopType === 'drop' || stop?.stopType === 'both');
  const originLat = busService?.route?.originCoords?.lat;
  const originLng = busService?.route?.originCoords?.lng;
  const destinationLat = busService?.route?.destinationCoords?.lat;
  const destinationLng = busService?.route?.destinationCoords?.lng;
  const originPoint = useMemo(
    () => toLatLng(busService?.route?.originCoords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originLat, originLng],
  );
  const destinationPoint = useMemo(
    () => toLatLng(busService?.route?.destinationCoords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [destinationLat, destinationLng],
  );
  const currentLat = liveTracking?.currentLocation?.lat;
  const currentLng = liveTracking?.currentLocation?.lng;
  const currentBusPoint = useMemo(
    () => toLatLng(liveTracking?.currentLocation) || toLatLng(trailPoints[trailPoints.length - 1]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentLat, currentLng, trailPoints],
  );
  const routeEndpoints = useMemo(
    () => [originPoint, destinationPoint].filter(Boolean),
    [destinationPoint, originPoint],
  );
  const mapCenter = useMemo(() => {
    if (currentBusPoint) {
      return currentBusPoint;
    }

    if (routeEndpoints.length === 0) {
      return DEFAULT_CENTER;
    }

    if (routeEndpoints.length === 1) {
      return routeEndpoints[0];
    }

    return {
      lat: (routeEndpoints[0].lat + routeEndpoints[1].lat) / 2,
      lng: (routeEndpoints[0].lng + routeEndpoints[1].lng) / 2,
    };
  }, [currentBusPoint, routeEndpoints]);

  const simplifiedTrail = useMemo(() => simplifyLatLngPath(trailPoints, 0.00035), [trailPoints]);
  const remainingRoutePath = useMemo(
    () => buildRemainingRoutePath(routePath, currentBusPoint),
    [currentBusPoint, routePath],
  );
  const shouldShowLiveTrail = useMemo(() => {
    const status = String(liveTracking?.status || '').toLowerCase();
    return (
      ['in_progress', 'paused'].includes(status) &&
      simplifiedTrail.length >= 3 &&
      getPathDistanceKm(simplifiedTrail) >= 0.15
    );
  }, [liveTracking?.status, simplifiedTrail]);
  const routeMetrics = useMemo(
    () => buildRouteMetrics(routePath, currentBusPoint),
    [currentBusPoint, routePath],
  );
  const recenterOnBus = useCallback((zoom = 16) => {
    if (currentBusPoint) {
      centerMapOnPoint(currentBusPoint, zoom, true);
      setIsFollowingBus(true);
      return;
    }

    fitMapToPoints([...routePath, ...routeEndpoints].filter(Boolean));
  }, [centerMapOnPoint, currentBusPoint, fitMapToPoints, routeEndpoints, routePath]);

  useEffect(() => {
    if (!isMapReady || routeEndpoints.length < 2) {
      setRoutePath(buildFallbackRoute(originPoint, destinationPoint));
      return undefined;
    }

    const routeCacheKey = getRouteCacheKey(routeEndpoints[0], routeEndpoints[1]);
    const cachedRoute = routeCacheRef.current.get(routeCacheKey);
    if (cachedRoute) {
      setRoutePath(cachedRoute);
      return undefined;
    }

    let active = true;
    void (async () => {
      const result = await computeDrivingRoute({
        origin: routeEndpoints[0],
        destination: routeEndpoints[1],
        region: 'IN',
      });

      if (!active) {
        return;
      }

      if (result.status === 'OK') {
        const nextRoutePath = result.path.length > 1 ? result.path : buildFallbackRoute(originPoint, destinationPoint);
        routeCacheRef.current.set(routeCacheKey, nextRoutePath);
        setRoutePath(nextRoutePath);
        return;
      }

      const fallbackRoute = buildFallbackRoute(originPoint, destinationPoint);
      routeCacheRef.current.set(routeCacheKey, fallbackRoute);
      setRoutePath(fallbackRoute);
    })();

    return () => {
      active = false;
    };
  }, [destinationPoint, isMapReady, originPoint, routeEndpoints]);

  // Web: <GoogleMap center={mapCenter}> moved the map (setCenter) whenever the centre point changed.
  const appliedCenterRef = useRef(null);
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const last = appliedCenterRef.current;
    if (last && last.lat === mapCenter.lat && last.lng === mapCenter.lng) return;
    appliedCenterRef.current = mapCenter;
    if (!last) return; // the first centre is the map's initialRegion
    mapRef.current.setCamera({ center: toMapLatLng(mapCenter) });
  }, [mapCenter, mapLoaded]);

  useEffect(() => {
    if (!isMapReady || !mapLoaded || hasAutoFittedRef.current) {
      return;
    }

    if (currentBusPoint) {
      centerMapOnPoint(currentBusPoint, 16, true);
      hasAutoFittedRef.current = true;
      return;
    }

    const visiblePoints = [...routePath, ...routeEndpoints].filter(Boolean);
    if (visiblePoints.length > 1) {
      fitMapToPoints(visiblePoints);
      hasAutoFittedRef.current = true;
    }
  }, [centerMapOnPoint, currentBusPoint, fitMapToPoints, isMapReady, mapLoaded, routeEndpoints, routePath]);

  const stopTrackingWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const applyLiveTripPayload = useCallback((payload) => {
    setProfile((currentProfile) => mergeProfileAndTrip(currentProfile || seededProfileRef.current, payload));
    setTrailPoints(trimLiveTrail(payload?.liveTracking?.recentPath));
    if (payload?.liveTracking?.travelDate) {
      setTravelDate(payload.liveTracking.travelDate);
    }
    if (payload?.liveTracking?.scheduleId) {
      setSelectedScheduleId(payload.liveTracking.scheduleId);
    }
  }, [mergeProfileAndTrip]);

  const pushLiveLocation = useCallback(async (point) => {
    const now = Date.now();
    const lastPoint = lastSyncedPointRef.current;
    const lastSyncedAt = lastSyncedAtRef.current;
    const movedDistanceKm = lastPoint ? getDistanceKm(lastPoint, point) : Number.POSITIVE_INFINITY;
    const shouldSync =
      !lastPoint ||
      movedDistanceKm >= LIVE_SYNC_DISTANCE_KM ||
      now - lastSyncedAt >= LIVE_SYNC_INTERVAL_MS;

    if (!shouldSync) {
      return;
    }

    lastSyncedPointRef.current = point;
    lastSyncedAtRef.current = now;

    try {
      const response = await updateBusDriverLiveLocation({
        scheduleId: effectiveScheduleId,
        travelDate: effectiveTravelDate,
        location: point,
      });
      applyLiveTripPayload(unwrap(response));
    } catch (error) {
      toast.error(error?.message || 'Unable to sync live bus location');
    }
  }, [applyLiveTripPayload, effectiveScheduleId, effectiveTravelDate]);

  const handleIncomingLocation = useCallback((point) => {
    if (!point) {
      return;
    }

    setLocationPermissionError('');
    setTrailPoints((current) => trimLiveTrail([...current, point]));
    setProfile((currentProfile) => {
      if (!currentProfile?.busService) {
        return currentProfile;
      }

      const nextRecentPath = trimLiveTrail([
        ...(currentProfile.busService.liveTracking?.recentPath || []),
        point,
      ]);
      const nextLiveTracking = {
        ...(currentProfile.busService.liveTracking || {}),
        currentLocation: point,
        recentPath: nextRecentPath,
        lastUpdatedAt: new Date().toISOString(),
      };

      return {
        ...currentProfile,
        busService: {
          ...currentProfile.busService,
          liveTracking: nextLiveTracking,
        },
      };
    });
    if (isFollowingBus) {
      centerMapOnPoint(point, 16, false);
    }
    pushLiveLocation(point);
  }, [centerMapOnPoint, isFollowingBus, pushLiveLocation]);

  const startTrackingWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationPermissionError('Live GPS is not available on this device.');
      return;
    }

    stopTrackingWatch();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        handleIncomingLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speedKmph: Number.isFinite(position.coords.speed) ? position.coords.speed * 3.6 : null,
          recordedAt: new Date().toISOString(),
        });
      },
      (error) => {
        const message = error?.message || 'Location permission was denied';
        setLocationPermissionError(message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );
  }, [handleIncomingLocation, stopTrackingWatch]);

  useEffect(() => {
    if (String(liveTracking?.status || '') === 'in_progress') {
      startTrackingWatch();
      return () => {
        stopTrackingWatch();
      };
    }

    stopTrackingWatch();
    return undefined;
  }, [liveTracking?.status, startTrackingWatch, stopTrackingWatch]);

  useEffect(() => () => stopTrackingWatch(), [stopTrackingWatch]);

  const handleStartJourney = async () => {
    if (!effectiveScheduleId) {
      toast.error('Pick a schedule first before starting the journey');
      return;
    }

    if (!effectiveTravelDate) {
      toast.error('Pick a travel date first before starting the journey');
      return;
    }

    setTripActionPending(true);
    try {
      let initialLocation = null;
      try {
        initialLocation = await getCurrentPositionAsync();
      } catch (error) {
        setLocationPermissionError(error?.message || 'Unable to read current location');
      }

      const response = await startBusDriverLiveTrip({
        scheduleId: effectiveScheduleId,
        travelDate: effectiveTravelDate,
        ...(initialLocation ? { location: initialLocation } : {}),
      });
      applyLiveTripPayload(unwrap(response));
      if (initialLocation) {
        lastSyncedPointRef.current = initialLocation;
        lastSyncedAtRef.current = Date.now();
        centerMapOnPoint(initialLocation, 16, true);
      }
      setIsFollowingBus(true);
      startTrackingWatch();
      toast.success('Journey tracking started');
    } catch (error) {
      toast.error(error?.message || 'Unable to start the journey');
    } finally {
      setTripActionPending(false);
    }
  };

  const handleTripStatusChange = async (action, successMessage) => {
    setTripActionPending(true);
    try {
      const response = await updateBusDriverLiveTripStatus({ action });
      applyLiveTripPayload(unwrap(response));

      if (action === 'pause' || action === 'complete' || action === 'reset') {
        stopTrackingWatch();
      }

      if (action === 'resume') {
        setIsFollowingBus(true);
        startTrackingWatch();
      }

      if (action === 'reset') {
        setTrailPoints([]);
        lastSyncedPointRef.current = null;
        lastSyncedAtRef.current = 0;
      }

      toast.success(successMessage);
    } catch (error) {
      toast.error(error?.message || 'Unable to update journey status');
    } finally {
      setTripActionPending(false);
    }
  };

  const confirmComplete = () => {
    Alert.alert('', 'Has the bus reached its destination? This completes the trip and tells the passengers.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: () => handleTripStatusChange('complete', 'Trip completed - passengers are notified') },
    ]);
  };

  if (loading) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator size="large" color={colors.slate[900]} />
      </View>
    );
  }

  if (!busService) {
    return (
      <FontScope family={fonts.jakarta}>
        <View style={[s.root, { paddingHorizontal: 20, paddingTop: insets.top + 32 }]}>
          <View style={[s.card, { padding: 24 }]}>
            <Pressable onPress={() => navigate('/taxi/driver/bus-home')} style={[s.backLight, { marginBottom: 20 }]}>
              <ArrowLeft size={18} color={colors.slate[900]} />
            </Pressable>
            <Text style={s.textLgBlack}>No bus route is available right now.</Text>
            <Text style={[s.textSm, { marginTop: 8, color: colors.slate[500] }]}>Assign the bus service first from admin, then reopen this page.</Text>
          </View>
          <StatusBarScrim color={PAGE_BG} />
        </View>
      </FontScope>
    );
  }

  const status = String(liveTracking?.status || '');
  const liveStatusTone = STATUS_TONE[String(liveTracking?.status || 'idle')] || STATUS_TONE.idle;
  const headerSub = `${formatDisplayDate(effectiveTravelDate)} ${selectedSchedule?.label ? `• ${selectedSchedule.label}` : ''} ${selectedSchedule?.departureTime ? `• ${formatClockTime(selectedSchedule.departureTime)}` : ''}`;
  const speed = liveTracking?.currentLocation?.speedKmph;

  const renderActionButton = ({ key, onPress, bg, Icon, label, outline }) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={tripActionPending}
      style={[
        s.actionBtn,
        outline ? s.actionBtnOutline : { backgroundColor: bg, ...shadow.lg },
        tripActionPending ? { opacity: 0.6 } : null,
      ]}
    >
      <Icon size={15} color={colors.white} />
      <Text style={s.actionBtnText}>{label}</Text>
    </Pressable>
  );

  return (
    <FontScope family={fonts.jakarta}>
      <View style={s.root}>
        <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: 40 + insets.bottom }]}>
          <View style={s.headerCard}>
            <View style={s.headerTop}>
              <View style={s.rowStart}>
                <Pressable onPress={() => navigate('/taxi/driver/bus-home')} style={s.backDark}>
                  <ArrowLeft size={18} color={colors.white} />
                </Pressable>
                <View style={s.shrink}>
                  <Text style={[s.cap11, { color: alpha(colors.white, 0.55) }]}>Live Bus Control</Text>
                  <Text style={s.headerTitle}>
                    {`${busService.route?.originCity || 'Origin'} to ${busService.route?.destinationCity || 'Destination'}`}
                  </Text>
                  <Text style={[s.textSm, { marginTop: 4, color: alpha(colors.white, 0.7) }]}>{headerSub}</Text>
                </View>
              </View>

              <View style={s.actionWrap}>
                <View style={[s.statusPill, { backgroundColor: liveStatusTone.bg, borderColor: liveStatusTone.border }]}>
                  <Text style={[s.statusPillText, { color: liveStatusTone.text }]}>{getStatusLabel(liveTracking?.status)}</Text>
                </View>
                {status === 'idle'
                  ? renderActionButton({ key: 'start', onPress: handleStartJourney, bg: colors.emerald[500], Icon: Play, label: 'Start Journey' })
                  : null}
                {status === 'in_progress'
                  ? renderActionButton({ key: 'pause', onPress: () => handleTripStatusChange('pause', 'Journey paused'), bg: colors.amber[500], Icon: Pause, label: 'Pause' })
                  : null}
                {status === 'paused'
                  ? renderActionButton({ key: 'resume', onPress: () => handleTripStatusChange('resume', 'Journey resumed'), bg: colors.sky[500], Icon: Play, label: 'Resume' })
                  : null}
                {['in_progress', 'paused'].includes(status)
                  ? renderActionButton({ key: 'complete', onPress: confirmComplete, bg: colors.emerald[500], Icon: Square, label: 'Reached destination' })
                  : null}
                {status === 'completed'
                  ? renderActionButton({ key: 'reset', onPress: () => handleTripStatusChange('reset', 'Journey reset'), Icon: RotateCcw, label: 'Reset', outline: true })
                  : null}
              </View>
            </View>

            <View style={[s.gap3, { marginTop: 20 }]}>
              {[
                { label: 'Pickup Stops', value: pickupStops.length },
                { label: 'Drop Stops', value: dropStops.length },
                { label: 'Tracked Distance', value: `${Number(liveTracking?.totalDistanceKm || 0).toFixed(1)} km` },
                { label: 'Route Progress', value: `${routeMetrics.progressPercent.toFixed(0)}%` },
              ].map((item) => (
                <View key={item.label} style={s.headerTile}>
                  <Text style={[s.cap10, { color: alpha(colors.white, 0.5) }]}>{item.label}</Text>
                  <Text style={s.headerTileValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[s.card, { padding: 16 }]}>
            <View style={{ marginBottom: 16 }}>
              <Text style={s.cap11}>Live Route Map</Text>
              <Text style={[s.textLgBlack, { marginTop: 4 }]}>{busService.route?.routeName || 'Standard route'}</Text>
              <Text style={[s.textSm, { marginTop: 4, color: colors.slate[500] }]}>Grey starts from the live bus and shows only the remaining road route.</Text>
            </View>

            <View style={s.mapBox}>
              {isMapReady ? (
                <AppMap
                  ref={mapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={regionFor(mapCenter, routeEndpoints.length > 1 ? 6 : 8)}
                  zoomControlEnabled
                  onMapReady={() => {
                    hasAutoFittedRef.current = false;
                    setMapLoaded(true);
                  }}
                  onPanDrag={() => setIsFollowingBus(false)}
                  onRegionChangeComplete={(region, details) => {
                    if (details?.isGesture && mapRef.current && !programmaticCameraRef.current) {
                      setIsFollowingBus(false);
                    }
                  }}
                >
                  {originPoint ? (
                    <SvgMarker coordinate={toMapLatLng(originPoint)} title={busService.route?.originCity || 'Origin'} anchor={PIN_ANCHOR}>
                      <OriginPin />
                    </SvgMarker>
                  ) : null}
                  {destinationPoint ? (
                    <SvgMarker coordinate={toMapLatLng(destinationPoint)} title={busService.route?.destinationCity || 'Destination'} anchor={PIN_ANCHOR}>
                      <DestinationPin />
                    </SvgMarker>
                  ) : null}
                  {remainingRoutePath.length > 1 ? (
                    <Polyline
                      coordinates={remainingRoutePath.map((point) => toMapLatLng(point))}
                      strokeColor={alpha('#334155', 0.9)}
                      strokeWidth={5}
                    />
                  ) : null}
                  {shouldShowLiveTrail ? (
                    <Polyline
                      coordinates={simplifiedTrail.map((point) => toMapLatLng(point))}
                      strokeColor={alpha('#dc2626', 0.96)}
                      strokeWidth={6}
                      zIndex={2}
                    />
                  ) : null}
                  {currentBusPoint ? (
                    <SvgMarker coordinate={toMapLatLng(currentBusPoint)} title={busService.busName || 'Live bus'} anchor={BUS_ANCHOR}>
                      <BusPin />
                    </SvgMarker>
                  ) : null}
                </AppMap>
              ) : (
                <View style={[s.center, { flex: 1, paddingHorizontal: 24 }]}>
                  <Text style={s.mapFallback}>Route map will appear once Google Maps is ready.</Text>
                </View>
              )}
            </View>

            <View style={s.mapActions}>
              <Pressable onPress={() => recenterOnBus(16)} style={[s.mapBtn, s.mapBtnPrimary]}>
                <Navigation size={15} color={colors.white} />
                <Text style={[s.mapBtnText, { color: colors.white }]}>{currentBusPoint ? 'Recenter Bus' : 'Center Route'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIsFollowingBus(false);
                  fitMapToPoints([...routePath, ...routeEndpoints].filter(Boolean));
                }}
                style={[s.mapBtn, s.mapBtnSecondary]}
              >
                <LocateFixed size={15} color={colors.slate[700]} />
                <Text style={[s.mapBtnText, { color: colors.slate[700] }]}>Route Fit</Text>
              </Pressable>
              <View style={[s.mapBtn, { backgroundColor: isFollowingBus ? colors.emerald[50] : colors.slate[100] }]}>
                <Text style={[s.mapBtnText, { color: isFollowingBus ? colors.emerald[700] : colors.slate[600] }]}>
                  {isFollowingBus ? 'Following Bus' : 'Manual View'}
                </Text>
              </View>
            </View>

            {locationPermissionError ? (
              <View style={s.warnBox}>
                <Text style={s.warnText}>{locationPermissionError}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.card}>
            <View style={s.iconLabel}>
              <Navigation size={16} color={colors.slate[500]} />
              <Text style={s.cap11}>Journey Snapshot</Text>
            </View>

            <View style={[s.gap3, { marginTop: 16 }]}>
              <InfoTile
                label="Current Bus Position"
                title={currentBusPoint ? `${currentBusPoint.lat.toFixed(6)}, ${currentBusPoint.lng.toFixed(6)}` : 'Waiting for live GPS'}
                sub={speed ? `${speed.toFixed(0)} km/h` : 'Speed unavailable'}
              />
              <InfoTile
                label="Remaining Route"
                title={`${routeMetrics.remainingDistanceKm.toFixed(1)} km`}
                sub={`Planned road path ${routeMetrics.totalDistanceKm.toFixed(1)} km`}
              />
              <InfoTile
                label="Pickup Coordinates"
                title={busService.route?.originCity || 'Origin not set'}
                sub={originPoint ? `${originPoint.lat.toFixed(6)}, ${originPoint.lng.toFixed(6)}` : 'Coordinates not saved'}
              />
              <InfoTile
                label="Destination Coordinates"
                title={busService.route?.destinationCity || 'Destination not set'}
                sub={destinationPoint ? `${destinationPoint.lat.toFixed(6)}, ${destinationPoint.lng.toFixed(6)}` : 'Coordinates not saved'}
              />
            </View>
          </View>

          <View style={[s.card, s.gap3]}>
            <InfoTile
              Icon={Bus}
              label="Driver"
              title={busService.driverName || profile?.name || 'Driver'}
              sub={busService.driverPhone || profile?.phone || 'No phone'}
            />
            <InfoTile
              Icon={CalendarDays}
              label="Schedule"
              title={selectedSchedule?.label || 'Schedule not set'}
              sub={`${formatClockTime(selectedSchedule?.departureTime)} to ${formatClockTime(selectedSchedule?.arrivalTime)}`}
            />
            <InfoTile
              Icon={Clock3}
              label="Last Update"
              title={liveTracking?.lastUpdatedAt ? new Date(liveTracking.lastUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() : '--:--'}
              sub={syncingTrip ? 'Refreshing live trip...' : 'Live sync active'}
            />
            <InfoTile
              Icon={RouteIcon}
              label="Trail Points"
              title={String(trailPoints.length)}
              sub={shouldShowLiveTrail ? 'Live trail visible' : 'Trail hidden until real movement'}
            />
          </View>

          <View style={s.card}>
            <View style={s.iconLabel}>
              <RouteIcon size={16} color={colors.slate[500]} />
              <Text style={s.cap11}>Route Stops</Text>
            </View>

            <View style={[s.gap3, { marginTop: 16 }]}>
              {routeStops.length ? routeStops.map((stop, index) => {
                const stopTone = STOP_TYPE_TONE[stop?.stopType] || DEFAULT_STOP_TONE;

                return (
                  <View key={stop?.id || `route-stop-${index}`} style={s.stopCard}>
                    <View style={s.rowBetweenStart}>
                      <View style={s.shrink}>
                        <Text style={s.textSmBlack}>{stop?.city || 'City not set'}</Text>
                        <Text style={[s.textSm, { marginTop: 4, color: colors.slate[600] }]}>{stop?.pointName || 'Point not set'}</Text>
                        <Text style={s.stopTime}>{`${formatClockTime(stop?.arrivalTime)} to ${formatClockTime(stop?.departureTime)}`}</Text>
                      </View>
                      <View style={[s.stopChip, { backgroundColor: stopTone.bg, borderColor: stopTone.border }]}>
                        <Text style={[s.stopChipText, { color: stopTone.text }]}>{stop?.stopType || 'stop'}</Text>
                      </View>
                    </View>
                  </View>
                );
              }) : (
                <View style={s.dashedNote}>
                  <Text style={s.dashedNoteText}>No route stops are configured for this bus service yet.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={s.card}>
            <View style={s.iconLabel}>
              <MapPin size={16} color={colors.slate[500]} />
              <Text style={s.cap11}>Routing Meta</Text>
            </View>

            <View style={[s.gap3, { marginTop: 16 }]}>
              <InfoTile
                label="Admin Route Distance"
                title={String(busService.route?.distanceKm || 'NA')}
                sub={String(busService.route?.durationHours || 'Duration not set')}
              />
              <InfoTile
                label="Live Tracking Mode"
                title="Browser GPS + simplified trail"
                sub="Smoothed with `simplify-js` for cleaner real-time movement."
              />
            </View>
          </View>
        </ScrollView>
        <StatusBarScrim color={PAGE_BG} />
      </View>
    </FontScope>
  );
};

const cardBase = {
  borderRadius: 28,
  borderWidth: 1,
  borderColor: colors.slate[200],
  backgroundColor: colors.white,
  padding: 20,
  ...shadow.sm,
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, gap: 20 },
  shrink: { flexShrink: 1, minWidth: 0 },
  gap3: { gap: 12 },
  rowStart: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowBetweenStart: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  iconLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  cap10: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6, color: colors.slate[400] },
  cap11: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.98, color: colors.slate[400] },
  cap11b: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.76, color: colors.slate[400] },
  textSm: { fontSize: 14, lineHeight: 20, color: colors.slate[900] },
  textSmBlack: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  textLgBlack: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900] },

  card: cardBase,
  tile: { borderRadius: 16, backgroundColor: colors.slate[50], padding: 16 },

  headerCard: {
    borderRadius: 30,
    backgroundColor: '#10213b',
    padding: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
  headerTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  headerTitle: { marginTop: 8, fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.white },
  backDark: { width: 44, height: 44, borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), alignItems: 'center', justifyContent: 'center' },
  backLight: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  statusPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  statusPillText: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.54 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  actionBtnOutline: { borderWidth: 1, borderColor: alpha(colors.white, 0.2), backgroundColor: alpha(colors.white, 0.1) },
  actionBtnText: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.54, color: colors.white },
  headerTile: { borderRadius: 16, backgroundColor: alpha(colors.white, 0.08), padding: 12 },
  headerTileValue: { marginTop: 8, fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.white },

  mapBox: {
    height: 480,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
  },
  mapFallback: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[500], textAlign: 'center' },
  mapActions: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  // web: bg-slate-900 button -> the partner button colour (driver-theme CSS)
  mapBtnPrimary: { backgroundColor: driverTheme.button, ...shadow.lg },
  mapBtnSecondary: { borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50] },
  mapBtnText: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.54 },
  warnBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.amber[200], backgroundColor: colors.amber[50], paddingHorizontal: 16, paddingVertical: 12 },
  warnText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.amber[700] },

  stopCard: { borderRadius: 22, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.7), padding: 16 },
  stopTime: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  stopChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  stopChipText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
  dashedNote: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 16 },
  dashedNoteText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[500] },
});

export default BusDriverLiveRoute;
