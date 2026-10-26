// Web: pages/DeliveryHomeV2.jsx — the rider home with its own Feed / Pocket / History / Profile tabs: dark header
// (profile photo, Online/Offline toggle, DEV "SIM" toggle, emergency / ID card / notifications), the Feed's live map
// with zoom / simulation / centre buttons, the trip panels (pickup, drop, verify & complete, summary), the incoming
// order popup (ringing until accept / pass), GPS tracking while online (HTTP + socket + Firebase for the active order),
// the 15 s heartbeat, the available-order poller and the emergency / notifications bottom popups.
// Same logic, texts, API calls and test buttons (the DEV "SIM" header toggle and the map's Play simulation button stay).
// Native (platform only):
//   - Kept-alive screen (DeliveryTabKeepAlive): the layout draws the bottom bar. What the web did while mounted runs only
//     while this screen is on screen (useDeliveryTabActive): authRefreshFailed listener, the simulation glide, the GPS
//     watch, the heartbeat, the available-order poller, the order-status / admin-notification / claimed-order
//     handling, the incoming-offer popup + ring. What the web loaded on mount (emergency numbers + profile photo,
//     current-trip sync, online status) loads again each time the screen becomes active (old data stays on screen).
//   - Background location: while online, setRiderBackgroundHandler (lib/riderLocation) gets each background location
//     and does what the GPS watch did with it (rider position, HTTP update, socket emitLocation + Firebase tracking for
//     the active order, auto-arrival). The watch callback and that handler share one function that reads the current
//     order / route / trip status / ETA from refs (the web's watch callback kept the values from when it started).
//   - The map is built after the brand splash (LiveMap waits for useSplashDone); popups are native Sheets; the trip
//     panels are absolute layers that end above the bottom bar like the web's bottom-[92px]; tel: / Google Maps links
//     open with Linking; window.location.reload after a session expiry -> a second replace-navigation to the login.
//   - The minimized trip panel slides in when restored; it is removed at once when minimized (no slide-out).
import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Animated, Dimensions, Easing, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, AlertTriangle,
  Plus, Minus, Navigation2, Target, Play, CheckCircle2, Clock, ChevronDown,
  Contact, Phone, Navigation, Package, Power,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { setRiderBackgroundHandler } from '@/lib/riderLocation';
import { AppImage, Sheet, Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';
import { useDeliveryStore, resolveOrderKey, mapDeliveryPhaseToTripStatus, dedupeOrdersByIdentity } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { useProximityCheck, formatTripDistanceKm } from '@/modules/DeliveryV2/hooks/useProximityCheck';
import { useOrderManager } from '@/modules/DeliveryV2/hooks/useOrderManager';
import { useDeliveryNotificationsContext } from '@/modules/DeliveryV2/components/DeliveryRealtimeShell';
import { writeOrderTracking } from '@food/realtimeTracking';
import { deliveryAPI } from '@food/api';
import { mapOrderLocations } from '@/modules/DeliveryV2/utils/orderMapping';

// Components
import LiveMap from '@/modules/DeliveryV2/components/map/LiveMap';
import { PickupActionModal } from '@/modules/DeliveryV2/components/modals/PickupActionModal';
import { NewOrderModal } from '@/modules/DeliveryV2/components/modals/NewOrderModal';
import { DeliveryVerificationModal } from '@/modules/DeliveryV2/components/modals/DeliveryVerificationModal';
import { OrderSummaryModal } from '@/modules/DeliveryV2/components/modals/OrderSummaryModal';
import ActionSlider from '@/modules/DeliveryV2/components/ui/ActionSlider';
import OrderSwitcher from '@/modules/DeliveryV2/components/orders/OrderSwitcher';

// Sub Pages
import PocketV2 from '@/modules/DeliveryV2/pages/PocketV2';
import HistoryV2 from '@/modules/DeliveryV2/pages/HistoryV2';
import ProfileV2 from '@/modules/DeliveryV2/pages/ProfileV2';

import { getHaversineDistance, calculateETA, calculateHeading } from '@/modules/DeliveryV2/utils/geo';
import { useCompanyName } from '@food/hooks/useCompanyName';
import useNotificationInbox from '@food/hooks/useNotificationInbox';
import { getAppRoutePath } from '@/shared/utils/nativeShell';
import { isOfferFresh } from '@/modules/DeliveryV2/utils/offerFreshness';
import { DeliveryTabActiveProvider, useDeliveryTabActive } from '../deliveryTabPages';
import { TabShownProvider, useTabShown } from '@/native/ui/tabShown';

// the tabs drawn inside DeliveryHomeV2 besides the Feed (memo: a Feed re-render does not re-render them)
const SUB_TABS = [['pocket', memo(PocketV2)], ['history', memo(HistoryV2)], ['profile', memo(ProfileV2)]];

// web /assets/images/profile_avatar.webp, bundled so it shows offline
const DEFAULT_AVATAR = require('../../../assets/public/images/profile_avatar.webp');

const roundedShadow = {
  elevation: 3,
  shadowColor: '#112743',
  shadowOpacity: 0.24,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 10 },
};

const openUrl = (url) => {
  Linking.openURL(url).catch(() => {});
};

/** animate-pulse */
function Pulse({ active = true, style, children }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      v.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

/** Minimal bottom-sheet popup (Restored from legacy FeedNavbar) */
function BottomPopup({ isOpen, onClose, title, children }) {
  return (
    <Sheet open={Boolean(isOpen)} onClose={onClose} backdropOpacity={0.4} style={styles.popupSheet}>
      <View style={styles.popupBody}>
        <View style={styles.popupHead}>
          <Text style={styles.popupTitle}>{title}</Text>
          <Pressable onPress={onClose} style={styles.popupClose}>
            <AlertTriangle size={16} color={colors.gray[500]} />
          </Pressable>
        </View>
        {children}
      </View>
    </Sheet>
  );
}

/** The Online / Offline switch — the Captain app's duty toggle (Prince, 26 Oct): near-black pill, white knob with a power
 * icon (green online, grey offline), green ONLINE / grey OFFLINE label, no outline. */
function OnlineToggle({ isOnline, onPress }) {
  const x = useRef(new Animated.Value(isOnline ? 72 : 0)).current;
  useEffect(() => {
    const a = Animated.spring(x, { toValue: isOnline ? 72 : 0, stiffness: 400, damping: 30, mass: 1, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [isOnline, x]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: isOnline }}
      style={[styles.toggle, isOnline ? styles.toggleOn : styles.toggleOff]}
    >
      <Animated.View style={[styles.toggleKnob, { transform: [{ translateX: x }] }]}>
        <Power size={14} color={isOnline ? colors.emerald[500] : colors.slate[400]} strokeWidth={3} />
      </Animated.View>
      <View style={styles.toggleLabelWrap}>
        <Text style={[styles.toggleText, isOnline ? styles.toggleTextOn : styles.toggleTextOff]}>{isOnline ? 'Online' : 'Offline'}</Text>
      </View>
    </Pressable>
  );
}

/** Slide-up entrance of the trip panels (web: spring y 100% -> 0). */
function SlideUp({ children }) {
  const y = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }).start();
  }, [y]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: y }] }]} pointerEvents="box-none">
      {children}
    </Animated.View>
  );
}

/**
 * DeliveryHomeV2 - Premium 1:1 Match with Original App UI.
 * Featuring logical tab switching for Feed, Pocket, History, and Profile.
 */
export default function DeliveryHomeV2({ tab = 'feed' }) {
  const navigate = useNavigate();
  const tabActive = useDeliveryTabActive();
  const layerShown = useTabShown();
  const insets = useSafeAreaInsets();
  const navBottom92 = useBottomNavSpace(-4); // web: bottom-[92px]
  const navBottom100 = useBottomNavSpace(4); // web: bottom-[100px]
  const navBottom112 = useBottomNavSpace(16); // web: bottom-28
  const { isOnline, toggleOnline, acceptedOrders, focusedOrderId, orderSessions, setRiderLocation, setAcceptedOrders, setCapacity, setFocusedOrder, updateOrderSession, removeAcceptedOrder } = useDeliveryStore();
  const activeOrder = useDeliveryStore((state) => state.getFocusedOrder());
  const tripStatus = useDeliveryStore((state) => state.getFocusedTripStatus());
  const focusedSession = focusedOrderId ? orderSessions[focusedOrderId] || {} : {};
  const showVerification = Boolean(focusedSession.showVerification);
  const isModalMinimized = Boolean(focusedSession.isModalMinimized);
  const setShowVerification = (value) => {
    if (!focusedOrderId) return;
    updateOrderSession(focusedOrderId, { showVerification: value });
  };
  const setIsModalMinimized = (value) => {
    if (!focusedOrderId) return;
    updateOrderSession(focusedOrderId, { isModalMinimized: value });
  };
  const { isWithinRange, distanceToTarget } = useProximityCheck();
  const { acceptOrder, reachPickup, pickUpOrder, reachDrop, completeDelivery, resetTrip } = useOrderManager();
  const { clearNewOrder, orderStatusUpdate, clearOrderStatusUpdate, claimedOrderId, clearClaimedOrderId, adminNotification, clearAdminNotification, isConnected: isSocketConnected, emitLocation, ringUntilHandled, stopSound, isOrderAlertMuted, toggleOrderAlertMuted, muteUiTick } = useDeliveryNotificationsContext();

  // Incoming-order popup. A rider with no active order gets every new offer
  // as a popup right here (ringing until accept / pass). Once they carry an
  // order (multi-order limit set in admin), further offers stay in the Orders
  // tab with its short ring, as before.
  const newOrders = useDeliveryStore((state) => state.newOrders);
  const [dismissedOfferKey, setDismissedOfferKey] = useState(null);
  const [offerActionBusy, setOfferActionBusy] = useState(false);
  const feedOffer = tabActive && isOnline && acceptedOrders.length === 0
    ? dedupeOrdersByIdentity(newOrders).find((order) => resolveOrderKey(order) !== dismissedOfferKey && isOfferFresh(order)) || null
    : null;
  const feedOfferKey = feedOffer ? resolveOrderKey(feedOffer) : null;

  useEffect(() => {
    if (!feedOffer || isOrderAlertMuted(feedOffer)) return;
    ringUntilHandled(feedOffer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedOfferKey, muteUiTick]);

  const handleFeedOfferAccept = async (order) => {
    if (offerActionBusy) return;
    setOfferActionBusy(true);
    stopSound?.();
    try {
      await acceptOrder(order);
      clearNewOrder(order);
      setFocusedOrder(resolveOrderKey(order));
      toast.success('Order accepted');
      if (currentTab !== 'feed') navigate('/food/delivery/feed');
    } catch {
      // useOrderManager already showed the reason
    } finally {
      setOfferActionBusy(false);
    }
  };

  const handleFeedOfferPass = async (order) => {
    const orderId = resolveOrderKey(order);
    stopSound?.();
    try {
      if (orderId) await deliveryAPI.rejectOrder(orderId);
    } catch (error) {
      console.warn('[DeliveryHomeV2] reject failed:', error?.message || error);
    } finally {
      clearNewOrder(order);
    }
  };

  const handleFeedOfferMinimize = (order) => {
    setDismissedOfferKey(resolveOrderKey(order));
    stopSound?.();
    toast('Order request kept in the Orders tab');
  };
  useCompanyName();
  const { items: broadcastItems, unreadCount: notificationUnreadCount, markAsRead: markBroadcastAsRead, dismissAll: dismissAllBroadcast } = useNotificationInbox('delivery', { limit: 20 });

  const [cashLimitNotice, setCashLimitNotice] = useState(null);
  // web: currentTab state copied from the tab prop in an effect (one render late). Here it is the prop itself, so a
  // bottom-bar tap shows the new tab in the same render (no frame of the previous tab).
  const currentTab = tab;
  // Feed / Pocket / History / Profile stay mounted after their first visit and are only shown / hidden (the web
  // rebuilt them — the live map too — on every tab change: a black map and the old tab for ~1 s on a phone).
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tab]));
  if (!visitedTabs.has(tab)) setVisitedTabs(new Set([...visitedTabs, tab]));
  const [showNotifications, setShowNotifications] = useState(false);

  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [emergencyNumbers, setEmergencyNumbers] = useState({
    medicalEmergency: '',
    accidentHelpline: '',
    contactPolice: '',
    insurance: '',
  });

  const [eta, setEta] = useState(null);
  const lastLocationSentAt = useRef(0);
  const lastCoordRef = useRef(null);
  const rollingSpeedRef = useRef([]);
  const lastAutoArrivalRef = useRef({ PICKING_UP: false, PICKED_UP: false });

  const [zoom, setZoom] = useState(14);
  const [isSimMode, setIsSimMode] = useState(false);
  const [simPath, setSimPath] = useState([]);
  const [simIndex, setSimIndex] = useState(0);
  const [, setSimProgress] = useState(0); // 0 to 1 between points
  const [activePolyline, setActivePolyline] = useState(null);
  const mapRef = useRef(null);
  const simInitializedRef = useRef(false);

  // latest values for the GPS watch + the background handler
  const liveRef = useRef({});
  liveRef.current = { activeOrder, activePolyline, tripStatus, eta, distanceToTarget, isSimMode, reachPickup, reachDrop, emitLocation };

  const isLoggingOut = useRef(false);
  const gpsBlockedToastShown = useRef(false);
  const handleLogout = useCallback(() => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    // 1. Clear tokens and state
    localStorage.removeItem('delivery_accessToken');
    localStorage.removeItem('delivery_refreshToken');
    localStorage.removeItem('delivery_authenticated');
    localStorage.removeItem('delivery_user');

    // 2. Alert user and redirect
    toast.error('Session Expired', { description: 'Please log in again.' });
    navigate('/food/delivery/login', { replace: true });

    // web: a full page reload after a delay if not already on login — here a second replace-navigation
    setTimeout(() => {
      if (!getAppRoutePath().includes('/login')) {
        navigate('/food/delivery/login', { replace: true });
      }
    }, 1500);
  }, [navigate]);

  useEffect(() => {
    if (!tabActive) return undefined;
    const onAuthFailure = (e) => {
      if (e.detail?.module === 'delivery') {
        handleLogout();
      }
    };
    window.addEventListener('authRefreshFailed', onAuthFailure);
    return () => window.removeEventListener('authRefreshFailed', onAuthFailure);
  }, [handleLogout, tabActive]);

  // 0. Auto-Simulation Effect (High-Precision Smooth Glide)
  const lastSimUpdateSentAt = useRef(0);
  useEffect(() => {
    let interval;
    if (tabActive && isSimMode && simPath.length > 1 && simIndex < simPath.length - 1) {
      interval = setInterval(() => {
        setSimProgress((prev) => {
          const nextProgress = prev + 0.08; // 8% movement per tick

          if (nextProgress >= 1) {
            setSimIndex((idx) => idx + 1);
            return 0; // Move to next segment
          }

          const currentPoint = simPath[simIndex];
          const nextPoint = simPath[simIndex + 1];

          if (currentPoint && nextPoint) {
            // Linear Interpolation (LERP)
            const lat = currentPoint.lat + (nextPoint.lat - currentPoint.lat) * nextProgress;
            const lng = currentPoint.lng + (nextPoint.lng - currentPoint.lng) * nextProgress;
            const heading = calculateHeading(currentPoint.lat, currentPoint.lng, nextPoint.lat, nextPoint.lng);

            setRiderLocation({ lat, lng, heading });

            if (mapRef.current) {
              mapRef.current.panTo({ lat, lng });
            }

            // Sync with backend every 2 seconds during simulation so customer sees it
            const now = Date.now();
            if (now - lastSimUpdateSentAt.current >= 2000) {
              lastSimUpdateSentAt.current = now;
              const payload = {
                lat,
                lng,
                heading,
                orderId: activeOrder?.orderId || activeOrder?._id,
                status: 'on_the_way',
                polyline: activePolyline, // Include polyline in every stream update for resilience
              };
              // A. HTTP Backup
              deliveryAPI.updateLocation(lat, lng, true, { heading }).catch(() => {});

              // B. SOCKET LIVE
              if (payload.orderId) emitLocation(payload);

              // C. FIREBASE REALTIME DB (Persistent Route for Customer Map)
              if (payload.orderId) {
                writeOrderTracking(payload.orderId, {
                  lat,
                  lng,
                  heading,
                  polyline: activePolyline,
                  status: tripStatus,
                  eta, // Publish live ETA to Firebase
                }).catch(() => {});
              }
            }
          }
          return nextProgress;
        });
      }, 50); // 20 FPS movement
    }
    return () => clearInterval(interval);
  }, [tabActive, isSimMode, simPath, simIndex, activeOrder, emitLocation, activePolyline, eta, tripStatus, setRiderLocation]);

  // Fetch Emergency numbers and Profile (web: on mount; here each time the screen becomes active)
  useEffect(() => {
    if (!tabActive) return;
    (async () => {
      try {
        const [emergencyRes, profileRes] = await Promise.all([
          deliveryAPI.getEmergencyHelp(),
          deliveryAPI.getProfile(),
        ]);
        if (emergencyRes?.data?.success && emergencyRes.data.data) {
          setEmergencyNumbers(emergencyRes.data.data);
        }
        if (profileRes?.data?.success && profileRes.data.data?.profile) {
          const profile = profileRes.data.data.profile;
          setProfileImage(profile.profileImage?.url || profile.documents?.photo || null);
        }
      } catch (err) { console.warn('Navbar Data Fetch Error:', err); }
    })();
  }, [tabActive]);

  const emergencyOptions = [
    { title: 'Medical Emergency', subtitle: 'Call an ambulance', color: colors.red[600], phone: emergencyNumbers.medicalEmergency },
    { title: 'Accident Helpline', subtitle: 'Report an accident', color: deliveryTheme.primary, phone: emergencyNumbers.accidentHelpline },
    { title: 'Contact Police', subtitle: 'Nearest police support', color: deliveryTheme.primary, phone: emergencyNumbers.contactPolice },
    { title: 'Insurance', subtitle: 'Policy & claim help', color: deliveryTheme.primary, phone: emergencyNumbers.insurance },
  ];

  // Reset simulation when trip phase/order/mode changes.
  // Do not reset on each route refresh, otherwise marker appears frozen.
  useEffect(() => {
    if (isSimMode) {
      setSimIndex(0);
      setSimProgress(0);
      simInitializedRef.current = false;
    } else {
      simInitializedRef.current = false;
    }
  }, [tripStatus, isSimMode, activeOrder?._id]);

  // Ensure simulation starts from the first route point once route is ready.
  useEffect(() => {
    if (!isSimMode || simInitializedRef.current || simPath.length < 2) return;
    const start = simPath[0];
    if (
      start &&
      Number.isFinite(Number(start.lat)) &&
      Number.isFinite(Number(start.lng))
    ) {
      setRiderLocation({ lat: Number(start.lat), lng: Number(start.lng), heading: 0 });
      simInitializedRef.current = true;
    }
  }, [isSimMode, simPath, setRiderLocation]);

  // Fallback path for simulation when the Routes API doesn't return a usable path.
  useEffect(() => {
    if (!isSimMode || simPath.length > 1 || !activeOrder) return;

    const parsePoint = (raw) => {
      if (!raw) return null;
      const lat = Number(raw.lat ?? raw.latitude);
      const lng = Number(raw.lng ?? raw.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    };

    const rider = useDeliveryStore.getState().riderLocation;
    const riderPoint = parsePoint(rider);
    const targetPoint =
      tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP'
        ? parsePoint(activeOrder.customerLocation)
        : parsePoint(activeOrder.restaurantLocation);

    if (!riderPoint || !targetPoint) return;

    const distance = getHaversineDistance(
      riderPoint.lat,
      riderPoint.lng,
      targetPoint.lat,
      targetPoint.lng,
    );
    if (!Number.isFinite(distance) || distance < 10) return;

    const steps = 60;
    const fallbackPath = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return {
        lat: riderPoint.lat + (targetPoint.lat - riderPoint.lat) * t,
        lng: riderPoint.lng + (targetPoint.lng - riderPoint.lng) * t,
      };
    });

    setSimPath(fallbackPath);
  }, [isSimMode, simPath, activeOrder, tripStatus]);

  // Auto-restore modal when status or content changes
  useEffect(() => {
    setIsModalMinimized(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStatus, focusedOrderId]);

  // 1. Initial Sync (Force sync with server to avoid 'stuck' persistent state) — on each activation
  useEffect(() => {
    if (!tabActive) return;
    const syncWithServer = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        const payload = response?.data?.data || {};
        const activeOrders = Array.isArray(payload.activeOrders)
          ? payload.activeOrders
          : payload.activeOrder
            ? [payload.activeOrder]
            : [];

        if (payload.capacity) {
          setCapacity(payload.capacity);
        }

        if (activeOrders.length) {
          const mapped = activeOrders.map(mapOrderLocations).filter(Boolean);
          setAcceptedOrders(mapped, { capacity: payload.capacity });

          mapped.forEach((order) => {
            const orderId = resolveOrderKey(order);
            const backendStatus = String(
              order.deliveryStatus ||
                order.orderState?.status ||
                order.orderStatus ||
                order.status ||
                '',
            ).toLowerCase();
            const currentPhase = order.deliveryState?.currentPhase;
            let nextStatus = mapDeliveryPhaseToTripStatus(order);
            if (['delivered', 'completed'].includes(backendStatus)) nextStatus = 'COMPLETED';
            else if (currentPhase === 'at_drop' || backendStatus === 'reached_drop') nextStatus = 'REACHED_DROP';
            else if (['picked_up', 'delivering'].includes(backendStatus)) nextStatus = 'PICKED_UP';
            else if (currentPhase === 'at_pickup' || backendStatus === 'reached_pickup') nextStatus = 'REACHED_PICKUP';
            updateOrderSession(orderId, { tripStatus: nextStatus });
          });
        }
      } catch (err) {
        console.error('Order Sync Failed:', err);
      }
    };
    syncWithServer();
  }, [tabActive, setAcceptedOrders, setCapacity, updateOrderSession]);

  // 1.5 Professional Unified ETA Calculation Hook
  useEffect(() => {
    // If we have distance, calculate ETA. Fallback to 8m/s (28km/h) avg if GPS speed is unknown.
    if (distanceToTarget != null && distanceToTarget !== Infinity) {
      const avgSpeed = rollingSpeedRef.current.length > 0
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length
        : 8;

      setEta(calculateETA(distanceToTarget, avgSpeed));
    } else {
      setEta(null);
    }
  }, [distanceToTarget]);

  // 2. Online/Offline Status Sync (Low Frequency) — web: on mount + on change
  useEffect(() => {
    if (!tabActive) return;
    deliveryAPI.updateOnlineStatus(isOnline).catch(() => {});
  }, [isOnline, tabActive]);

  // One GPS position -> what the web's watchPosition callback did (also used for background positions)
  const handleRiderPosition = useCallback((coords) => {
    const live = liveRef.current;
    // CRITICAL: In Simulation Mode, we disable actual GPS to prevent overwriting our test position
    if (live.isSimMode) return;

    const { latitude: lat, longitude: lng } = coords;
    const heading = coords.heading > 0 ? coords.heading : 0;
    const speed = coords.speed > 0 ? coords.speed : 0;
    const now = Date.now();

    const currentRiderPos = { lat, lng, heading: heading || 0 };
    setRiderLocation(currentRiderPos);

    // Calculate Rolling Average Speed for Smart ETA
    if (speed && speed > 0) {
      rollingSpeedRef.current = [...rollingSpeedRef.current.slice(-4), speed]; // keep last 5 points
    }

    const { tripStatus: status, distanceToTarget: distance, activeOrder: order, activePolyline: polyline, eta: liveEta } = live;

    // Phase 11: Geo-fencing Auto-arrival (within 100m) - Disabled in DEV so UI steps can be tested manually
    if (!live.isSimMode && !__DEV__ && distance && distance <= 100 && !lastAutoArrivalRef.current[status]) {
      if (status === 'PICKING_UP') {
        lastAutoArrivalRef.current[status] = true;
        live.reachPickup().catch(() => { lastAutoArrivalRef.current[status] = false; });
      } else if (status === 'PICKED_UP') {
        lastAutoArrivalRef.current[status] = true;
        live.reachDrop().catch(() => { lastAutoArrivalRef.current[status] = false; });
      }
    }

    if (distance > 200) {
      lastAutoArrivalRef.current[status] = false;
    }

    // Check threshold for Sync (distance-based or 7s time-based)
    const distMoved = lastCoordRef.current
      ? getHaversineDistance(lat, lng, lastCoordRef.current.lat, lastCoordRef.current.lng)
      : 1000;

    if (distMoved >= 25 || (now - lastLocationSentAt.current >= 7000)) {
      lastLocationSentAt.current = now;
      lastCoordRef.current = { lat, lng };

      const payload = {
        lat,
        lng,
        heading: heading || 0,
        speed: speed || 0,
        accuracy: coords.accuracy,
        orderId: order?.orderId || order?._id,
        status: 'on_the_way',
        polyline,
      };

      deliveryAPI.updateLocation(lat, lng, true, {
        heading: heading || 0,
        speed: speed || 0,
        accuracy: coords.accuracy,
      }).catch(() => {});

      if (payload.orderId) live.emitLocation(payload);

      if (payload.orderId) {
        writeOrderTracking(payload.orderId, {
          lat,
          lng,
          heading: heading || 0,
          polyline,
          status,
          eta: liveEta,
        }).catch(() => {});
      }
    }
  }, [setRiderLocation]);

  // Offline: one position for the map, so the rider's bike shows (with "Go online to get orders") while offline too
  // (Prince, 26 Oct). Only the map: nothing is sent to the server while offline.
  useEffect(() => {
    if (!tabActive || isOnline || currentTab !== 'feed') return;
    navigator.geolocation.getCurrentPosition((pos) => {
      if (liveRef.current.isSimMode || useDeliveryStore.getState().isOnline) return;
      setRiderLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, heading: 0 });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 60000 });
  }, [tabActive, isOnline, currentTab, setRiderLocation]);

  // 3. Location logic (Smart Frequency Tracking) — Feed map only, while on screen
  useEffect(() => {
    if (!tabActive || !isOnline || currentTab !== 'feed') {
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition((pos) => {
      handleRiderPosition(pos.coords);
    }, () => {
      // Never use a fake city (Indore) in production — that made Distance/Arrival show 800+ km.
      if (__DEV__) {
        console.warn('GPS Denied - Falling back to Indore for local testing only');
        const fallbackPos = { lat: 22.7196, lng: 75.8577, heading: 0 };
        if (!useDeliveryStore.getState().riderLocation) {
          setRiderLocation(fallbackPos);
        }
      }
      if (!gpsBlockedToastShown.current) {
        gpsBlockedToastShown.current = true;
        toast.error('Location unavailable', {
          id: 'gps-blocked',
          description: __DEV__
            ? 'Dev: using Indore test location.'
            : 'Enable GPS for accurate distance and navigation.',
        });
      }
    }, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [tabActive, isOnline, currentTab, setRiderLocation, isSimMode, handleRiderPosition]);

  // Native: background positions from the "You are online" service get the same handling while online
  useEffect(() => {
    if (!isOnline) return undefined;
    return setRiderBackgroundHandler((location) => {
      const c = location?.coords || {};
      if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
      handleRiderPosition(c);
    });
  }, [isOnline, handleRiderPosition]);

  // 3.5. Background Ping / Heartbeat
  // If watchPosition stops firing (e.g. device stationary), this pings the backend periodically.
  // This keeps the token fresh (via 401 interceptor) and keeps the Delivery Partner "online" in the backend.
  useEffect(() => {
    if (!isOnline || !tabActive) return undefined;

    const pingInterval = setInterval(() => {
      const now = Date.now();
      // If no natural GPS update happened in the last 15 seconds, force a ping
      if (now - lastLocationSentAt.current >= 15000 && lastCoordRef.current) {
        lastLocationSentAt.current = now;
        deliveryAPI.updateLocation(
          lastCoordRef.current.lat,
          lastCoordRef.current.lng,
          true,
          { heading: 0, speed: 0, accuracy: null },
        ).catch(() => {});
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(pingInterval);
  }, [isOnline, tabActive]);

  useEffect(() => {
    if (!tabActive || !claimedOrderId) return;
    clearNewOrder(claimedOrderId);
    clearClaimedOrderId();
  }, [tabActive, claimedOrderId, clearNewOrder, clearClaimedOrderId]);

  useEffect(() => {
    if (!tabActive || !isOnline) return undefined;
    if (currentTab !== 'feed' && currentTab !== 'orders') return undefined;

    let cancelled = false;

    const hydrateAvailableOrder = async () => {
      try {
        const currentResponse = await deliveryAPI.getCurrentDelivery();
        const currentPayload = currentResponse?.data?.data || {};
        const activeOrders = Array.isArray(currentPayload.activeOrders)
          ? currentPayload.activeOrders
          : currentPayload.activeOrder
            ? [currentPayload.activeOrder]
            : [];

        if (!cancelled && currentPayload.capacity) {
          setCapacity(currentPayload.capacity);
        }

        if (!cancelled && activeOrders.length) {
          setAcceptedOrders(
            activeOrders.map(mapOrderLocations).filter(Boolean),
            { capacity: currentPayload.capacity },
          );
        }

        const availableResponse = await deliveryAPI.getOrders({ limit: 20, page: 1 });
        const availablePayload =
          availableResponse?.data?.data ||
          availableResponse?.data ||
          {};

        const nextCashLimitNotice =
          availablePayload?.cashLimit?.blocked ? availablePayload.cashLimit : null;
        if (!cancelled) setCashLimitNotice(nextCashLimitNotice);

        if (!cancelled && availablePayload.capacity) {
          setCapacity(availablePayload.capacity);
        }

        const newOffers = Array.isArray(availablePayload.newOffers)
          ? availablePayload.newOffers
          : [];

        if (!cancelled) {
          newOffers.forEach((order) => useDeliveryStore.getState().addNewOrder(order));
          if (newOffers.length) setCashLimitNotice(null);
        }
      } catch (error) {
        console.warn('[DeliveryHomeV2] Available order fallback sync failed:', error?.message || error);
      }
    };

    void hydrateAvailableOrder();
    const poller = setInterval(() => {
      if (!document.hidden) {
        void hydrateAvailableOrder();
      }
    }, isSocketConnected ? 12000 : 5000);

    const handleVisibility = () => {
      if (!document.hidden) {
        void hydrateAvailableOrder();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(poller);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tabActive, currentTab, isOnline, isSocketConnected, setAcceptedOrders, setCapacity]);

  useEffect(() => {
    if (!tabActive) return;
    if (orderStatusUpdate) {
      if (orderStatusUpdate.status === 'cancelled') {
        toast.error('Order cancelled');
        const cancelledId =
          orderStatusUpdate.orderId ||
          orderStatusUpdate.orderMongoId ||
          orderStatusUpdate._id;
        if (cancelledId) {
          removeAcceptedOrder(cancelledId);
        } else {
          resetTrip();
        }
      }
      clearOrderStatusUpdate();
    }
  }, [tabActive, orderStatusUpdate, resetTrip, clearOrderStatusUpdate, removeAcceptedOrder]);

  // Handle Real-time Admin Notifications
  useEffect(() => {
    if (!tabActive) return;
    if (adminNotification) {
      toast.info(adminNotification.title || 'New Notification', {
        description: adminNotification.message || adminNotification.body || '',
        duration: 8000,
        action: {
          label: 'View',
          onClick: () => setShowNotifications(true),
        },
      });
      clearAdminNotification();
    }
  }, [tabActive, adminNotification, clearAdminNotification]);

  const handleCenterMap = () => {
    if (mapRef.current && useDeliveryStore.getState().riderLocation) {
      const loc = useDeliveryStore.getState().riderLocation;
      mapRef.current.panTo({
        lat: parseFloat(loc.lat || loc.latitude),
        lng: parseFloat(loc.lng || loc.longitude),
      });
    }
  };

  const handleMapClick = () => {
    if (activeOrder || showVerification) {
      setIsModalMinimized(true);
    }
  };

  const handleToggleOnline = () => {
    const nextState = !isOnline;
    toggleOnline(); // Store action
    if (nextState) {
      // Try to get location and sync immediately so we are visible for dispatch right away
      navigator.geolocation.getCurrentPosition((pos) => {
        deliveryAPI.updateLocation(pos.coords.latitude, pos.coords.longitude, true).catch(() => {});
      }, (err) => console.warn('Online sync position failed:', err), { enableHighAccuracy: true });
    } else {
      deliveryAPI.updateOnlineStatus(false).catch(() => {});
    }
  };

  const handleSimButton = () => {
    const nextSimState = !isSimMode;
    setIsSimMode(nextSimState);

    if (nextSimState) {
      toast.warning('Simulation Mode Active');

      const parsePoint = (raw) => {
        if (!raw) return null;
        const lat = Number(raw.lat ?? raw.latitude);
        const lng = Number(raw.lng ?? raw.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng };
      };

      const target =
        tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP'
          ? parsePoint(activeOrder?.customerLocation)
          : parsePoint(activeOrder?.restaurantLocation);

      const currentRider = useDeliveryStore.getState().riderLocation;
      const riderPoint = parsePoint(currentRider) || (target
        ? { lat: target.lat + 0.001, lng: target.lng + 0.001 }
        : null);

      if (riderPoint) {
        setRiderLocation({ lat: riderPoint.lat, lng: riderPoint.lng, heading: 0 });
      }

      if (riderPoint && target && (!simPath || simPath.length < 2)) {
        const steps = 60;
        const fallbackPath = Array.from({ length: steps + 1 }, (_, i) => {
          const t = i / steps;
          return {
            lat: riderPoint.lat + (target.lat - riderPoint.lat) * t,
            lng: riderPoint.lng + (target.lng - riderPoint.lng) * t,
          };
        });
        setSimPath(fallbackPath);
      }
    }
  };

  const handleCallCustomer = () => {
    const raw =
      activeOrder?.customerPhone ||
      activeOrder?.userPhone ||
      activeOrder?.userId?.phone ||
      activeOrder?.user?.phone ||
      activeOrder?.deliveryAddress?.phone ||
      '';
    const num = String(raw).replace(/\D/g, '');
    if (!num) {
      toast.error('Customer number not available');
      return;
    }
    openUrl(`tel:${num}`);
  };

  const handleNavigateCustomer = () => {
    const loc = activeOrder?.customerLocation;
    const lat = parseFloat(loc?.lat ?? loc?.latitude);
    const lng = parseFloat(loc?.lng ?? loc?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Customer location not available');
      return;
    }
    openUrl(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
  };

  const dropAddress =
    activeOrder?.customerAddress ||
    [
      activeOrder?.deliveryAddress?.street,
      activeOrder?.deliveryAddress?.additionalDetails,
      activeOrder?.deliveryAddress?.landmark,
      activeOrder?.deliveryAddress?.area,
      activeOrder?.deliveryAddress?.city,
      activeOrder?.deliveryAddress?.state,
      activeOrder?.deliveryAddress?.zipCode || activeOrder?.deliveryAddress?.pincode,
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(', ');

  const headerTop = insets.top;

  return (
    <View collapsable={false} style={styles.root}>
      {tabActive && currentTab !== 'history' ? <StatusBar style="light" /> : null}

      {/* ─── 2. MAIN CONTENT ─── */}
      <View collapsable={false} style={styles.main}>
        {visitedTabs.has('feed') ? (
          // the Feed (live map) is never hidden with opacity (the map stops drawing and comes back black): the other
          // tabs are drawn over it on an opaque page background. collapsable={false}: with pointerEvents 'auto' Fabric
          // flattened this View away and with 'none' it brought it back, moving the map to a new parent — Android then
          // rebuilt the map's surface (grey, black, tile by tile) on every return to the Feed (recorded, 26 Oct)
          <View collapsable={false} style={StyleSheet.absoluteFill} pointerEvents={currentTab === 'feed' ? 'auto' : 'none'}>
            <LiveMap
              onMapLoad={(m) => { mapRef.current = m; }}
              onMapClick={handleMapClick}
              onPathReceived={setSimPath}
              onPolylineReceived={(poly) => {
                setActivePolyline(poly);
                // If we have an order, push the INITIAL polyline to Firebase immediately for the customer
                const orderId = activeOrder?.orderId || activeOrder?._id;
                if (orderId && poly) {
                  writeOrderTracking(orderId, { polyline: poly, status: tripStatus, eta }).catch(() => {});
                }
              }}
              zoom={zoom}
            />

            {/* SIMULATION INDICATOR */}
            {isSimMode ? (
              <View style={[styles.simBar, { top: headerTop + 180 }]}>
                <View style={styles.simBarLeft}>
                  <Pulse style={styles.simBarIcon}>
                    <Play size={16} color={colors.white} fill={colors.white} />
                  </Pulse>
                  <View>
                    <Text style={styles.simBarKicker}>Auto Navigation Active</Text>
                    <Text style={styles.simBarText}>Following actual road path...</Text>
                  </View>
                </View>
                <Pressable onPress={() => setIsSimMode(false)} style={styles.simStop}>
                  <Text style={styles.simStopText}>Stop</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.mapControls, { bottom: navBottom112 }]}>
              <View style={styles.zoomBox}>
                <Pressable onPress={() => setZoom((z) => Math.min(22, z + 1))} style={({ pressed }) => [styles.zoomBtn, styles.zoomBtnTop, pressed && styles.pressedSmall]} accessibilityLabel="Zoom in">
                  <Plus size={20} color={colors.gray[900]} strokeWidth={2.75} />
                </Pressable>
                <Pressable onPress={() => setZoom((z) => Math.max(8, z - 1))} style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressedSmall]} accessibilityLabel="Zoom out">
                  <Minus size={20} color={colors.gray[900]} strokeWidth={2.75} />
                </Pressable>
              </View>
              <Pressable onPress={handleSimButton} style={[styles.fab, isSimMode ? styles.fabSim : styles.fabIdle]}>
                <View style={[styles.fabRing, { borderColor: isSimMode ? colors.white : deliveryTheme.primary }]}>
                  <Pulse active={isSimMode}>
                    <Play size={16} color={isSimMode ? colors.white : deliveryTheme.primary} fill={isSimMode ? colors.white : deliveryTheme.primary} style={styles.playNudge} />
                  </Pulse>
                </View>
              </Pressable>
              <Pressable
                onPress={() => mapRef.current?.setOptions({ gestureHandling: 'greedy' })}
                style={({ pressed }) => [styles.fab, styles.fabIdle, pressed && styles.pressedSmall]}
              >
                <View style={[styles.fabRing, { borderColor: deliveryTheme.primary }]}>
                  <Navigation2 size={16} color={deliveryTheme.primary} />
                </View>
              </Pressable>
              <Pressable onPress={handleCenterMap} style={({ pressed }) => [styles.fab, styles.fabIdle, pressed && styles.pressedSmall]}>
                <Target size={28} color={colors.gray[900]} />
              </Pressable>
            </View>
          </View>
        ) : null}
        {SUB_TABS.map(([key, Page]) =>
          visitedTabs.has(key) ? (
            <View
              key={key}
              style={[StyleSheet.absoluteFill, { paddingTop: key === 'history' ? 0 : headerTop + 120 }, currentTab !== key && styles.tabHidden]}
              pointerEvents={currentTab === key ? 'auto' : 'none'}
            >
              <LinearGradient pointerEvents="none" colors={[deliveryTheme.pageFrom, deliveryTheme.pageTo]} style={StyleSheet.absoluteFill} />
              <TabShownProvider value={layerShown && currentTab === key}>
                <DeliveryTabActiveProvider value={tabActive && currentTab === key}>
                  <Page />
                </DeliveryTabActiveProvider>
              </TabShownProvider>
            </View>
          ) : null,
        )}
      </View>

      {/* ─── 1. TOP HEADER ─── */}
      {currentTab !== 'history' ? (
        <LinearGradient
          colors={[deliveryTheme.headerFrom, deliveryTheme.headerTo]}
          start={{ x: 0.33, y: 0 }}
          end={{ x: 0.67, y: 1 }}
          style={[styles.header, { paddingTop: headerTop }]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Pressable
                onPress={() => navigate('/food/delivery/profile')}
                style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
              >
                <AppImage src={profileImage || DEFAULT_AVATAR} style={styles.avatarImg} contentFit="cover" accessibilityLabel="Profile" />
              </Pressable>
              <OnlineToggle isOnline={isOnline} onPress={handleToggleOnline} />

              {/* DEV SIMULATION TOGGLE */}
              {__DEV__ ? (
                <Pressable onPress={() => setIsSimMode(!isSimMode)}>
                  <Pulse active={isSimMode} style={[styles.simToggle, isSimMode ? styles.simToggleOn : styles.simToggleOff]}>
                    <Text style={[styles.simToggleText, { color: isSimMode ? colors.white : alpha(colors.white, 0.4) }]}>SIM</Text>
                  </Pulse>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.headerRight}>
              <Pressable onPress={() => setShowEmergencyPopup(true)} style={({ pressed }) => [styles.headerBtn, styles.headerBtnRed, pressed && styles.pressed]}>
                <AlertTriangle size={16} color={colors.red[500]} />
              </Pressable>
              <Pressable onPress={() => navigate('/food/delivery/help/id-card')} style={({ pressed }) => [styles.headerBtn, styles.headerBtnBlue, pressed && styles.pressed]}>
                <Contact size={16} color={deliveryTheme.primary} />
              </Pressable>
              <Pressable onPress={() => setShowNotifications(true)} style={({ pressed }) => [styles.headerBtn, styles.headerBtnWhite, pressed && styles.pressed]}>
                <Bell size={16} color={colors.white} />
                {notificationUnreadCount > 0 ? (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{notificationUnreadCount > 9 ? '9+' : String(notificationUnreadCount)}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          {/* ─── LIVE STATUS / PROGRESS BADGE ─── */}
          {currentTab === 'feed' ? (
            <View style={styles.statusWrap}>
              {activeOrder ? (
                <View style={styles.statGrid}>
                  {/* LEFT: DISTANCE */}
                  <View style={styles.statCard}>
                    <View style={styles.statTexts}>
                      <Text style={styles.statKicker}>Distance</Text>
                      <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{formatTripDistanceKm(distanceToTarget)}</Text>
                        <Text style={styles.statUnit}>KM</Text>
                      </View>
                    </View>
                    <View style={styles.statIcon}>
                      <View style={styles.rotate45}>
                        <Navigation2 size={16} color={deliveryTheme.primary} />
                      </View>
                    </View>
                  </View>

                  {/* RIGHT: TIME */}
                  <View style={styles.statCard}>
                    <View style={styles.statTexts}>
                      <Text style={styles.statKicker}>Arrival</Text>
                      <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{eta ? String(eta) : '--'}</Text>
                        <Text style={styles.statUnit}>MIN</Text>
                      </View>
                    </View>
                    <View style={styles.statIcon}>
                      <Clock size={16} color={deliveryTheme.primary} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.systemCard}>
                  <View style={styles.systemRow}>
                    <View style={styles.systemDotWrap}>
                      <Pulse active={isOnline} style={[styles.systemDot, { backgroundColor: isOnline ? deliveryTheme.primary : colors.gray[500] }]} />
                    </View>
                    <View>
                      <Text style={styles.systemTitle}>{isOnline ? 'System Online' : 'System Offline'}</Text>
                      <Text style={styles.systemSub}>{isOnline ? 'Waiting for order requests' : 'Go online to receive orders'}</Text>
                    </View>
                  </View>
                </View>
              )}

              {!activeOrder && cashLimitNotice?.blocked ? (
                <View style={styles.cashLimit}>
                  <Text style={styles.cashLimitKicker}>Cash Limit Alert</Text>
                  <Text style={styles.cashLimitText}>{cashLimitNotice?.message || 'Please deposit your amount to get orders.'}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {currentTab === 'feed' && acceptedOrders.length > 1 ? (
            <OrderSwitcher
              orders={acceptedOrders}
              focusedOrderId={focusedOrderId}
            />
          ) : null}
        </LinearGradient>
      ) : null}

      {/* OVERLAYS (feed tab only — must not appear over History/Profile/Pocket) */}
      {currentTab === 'feed' && !isModalMinimized ? (
        <SlideUp key={`${focusedOrderId || 'none'}`}>
          {(tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') ? (
            <PickupActionModal
              order={activeOrder}
              status={tripStatus}
              isWithinRange={isWithinRange}
              distanceToTarget={distanceToTarget}
              eta={eta}
              onReachedPickup={reachPickup}
              onPickedUp={(billImageUrl) => pickUpOrder(billImageUrl)}
              onMinimize={() => setIsModalMinimized(true)}
            />
          ) : null}
          {(tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') ? (
            <View style={[styles.dropWrap, { bottom: navBottom92 + 16 }]} pointerEvents="box-none">
              {tripStatus === 'PICKED_UP' ? (
                <View style={styles.dropCard}>
                  {/* Handle / Minimize */}
                  <View style={styles.dropHandleRow}>
                    <Pressable onPress={() => setIsModalMinimized(true)} style={({ pressed }) => [styles.dropHandle, pressed && styles.pressed]}>
                      <ChevronDown size={24} color={colors.gray[400]} strokeWidth={3} />
                    </Pressable>
                  </View>
                  <View style={styles.dropTop}>
                    <View style={styles.dropTopLeft}>
                      <View style={styles.dropAvatar}>
                        <AppImage
                          src={activeOrder?.user?.logo || activeOrder?.user?.profileImage || activeOrder?.userId?.profileImage || 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png'}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          accessibilityLabel="User"
                        />
                      </View>
                      <View style={styles.flexMin}>
                        <Text style={styles.dropName}>
                          {activeOrder?.customerName ||
                            activeOrder?.userId?.name ||
                            activeOrder?.user?.name ||
                            activeOrder?.deliveryAddress?.fullName ||
                            activeOrder?.deliveryAddress?.name ||
                            'Customer'}
                        </Text>
                        {dropAddress ? <Text style={styles.dropAddress}>{dropAddress}</Text> : null}
                        <Text style={styles.dropStatus}>
                          {isWithinRange
                            ? 'Ready - Swipe to Arrive √'
                            : formatTripDistanceKm(distanceToTarget) === '--'
                              ? 'Locating customer…'
                              : `${formatTripDistanceKm(distanceToTarget)} km • ${eta || '--'} min Arrival`}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dropBtns}>
                      <Pressable onPress={handleCallCustomer} style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]} accessibilityLabel="Call customer">
                        <Phone size={20} color={deliveryTheme.primary} />
                      </Pressable>
                      <Pressable onPress={handleNavigateCustomer} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} accessibilityLabel="Navigate to customer">
                        <Navigation size={20} color={colors.white} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Customer Instructions Panel */}
                  {activeOrder?.note ? (
                    <View style={styles.dropNote}>
                      <View style={styles.dropNoteIcon}>
                        <Package size={20} color={deliveryTheme.primary} />
                      </View>
                      <View style={styles.flexMin}>
                        <Text style={styles.dropNoteKicker}>Drop Message</Text>
                        <Text style={styles.dropNoteText}>{`"${activeOrder.note}"`}</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.fullWidth}>
                    <ActionSlider label="Slide to Arrive" successLabel="Arrived ✓" disabled={false} onConfirm={reachDrop} color="bg-blue-600" />
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => setShowVerification(true)} style={({ pressed }) => [styles.verifyBtnWrap, pressed && styles.pressed]}>
                  <LinearGradient colors={['#15498b', '#000000']} start={{ x: 0.23, y: 0.85 }} end={{ x: 0.77, y: 0.15 }} style={styles.verifyBtn}>
                    <CheckCircle2 size={24} color={colors.white} />
                    <Text style={styles.verifyText}>VERIFY & COMPLETE</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          ) : null}
          {showVerification && tripStatus !== 'COMPLETED' ? (
            <DeliveryVerificationModal
              order={activeOrder}
              onComplete={async (otp, paymentOverride) => {
                const res = await completeDelivery(otp, paymentOverride);
                setShowVerification(false);
                return res;
              }}
              onClose={() => setShowVerification(false)}
            />
          ) : null}
          {tripStatus === 'COMPLETED' ? <OrderSummaryModal order={activeOrder} onDone={() => { resetTrip(activeOrder); navigate('/food/delivery', { replace: true }); }} /> : null}
        </SlideUp>
      ) : null}

      {/* ─── MODALS RESTORED FROM OLD UI ─── */}
      <BottomPopup isOpen={tabActive && showEmergencyPopup} title="Emergency Help" onClose={() => setShowEmergencyPopup(false)}>
        <View style={styles.emergencyList}>
          {emergencyOptions.map((opt, i) => (
            <Pressable
              key={i}
              onPress={() => {
                const num = opt.phone?.replace(/\D/g, '');
                if (num) openUrl(`tel:${num}`);
                else toast.error('Number not configured');
              }}
              style={({ pressed }) => [styles.emergencyItem, pressed && styles.pressed]}
            >
              <View style={styles.emergencyIcon}>
                <AlertTriangle size={24} color={opt.color} />
              </View>
              <View>
                <Text style={styles.emergencyTitle}>{opt.title}</Text>
                <Text style={styles.emergencySub}>{opt.subtitle}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </BottomPopup>

      <BottomPopup
        isOpen={tabActive && showNotifications}
        title="Notifications"
        onClose={() => {
          setShowNotifications(false);
        }}
      >
        <ScrollView style={[styles.notifScroll, { maxHeight: Dimensions.get('window').height * 0.6 }]} contentContainerStyle={styles.notifContent}>
          {broadcastItems && broadcastItems.length > 0 ? (
            <>
              <View style={styles.clearRow}>
                <Pressable
                  onPress={() => {
                    dismissAllBroadcast();
                    toast.success('All notifications cleared');
                  }}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearText}>Clear All</Text>
                </Pressable>
              </View>
              <View style={styles.notifList}>
                {broadcastItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      markBroadcastAsRead(item.id);
                      if (item.link) {
                        // Handle link if present
                        const path = item.link.startsWith('/') ? item.link : `/${item.link}`;
                        navigate(path);
                        setShowNotifications(false);
                      }
                    }}
                    style={({ pressed }) => [styles.notifItem, item.read ? styles.notifRead : styles.notifUnread, pressed && { transform: [{ scale: 0.98 }] }]}
                  >
                    <View style={styles.notifRow}>
                      <View style={[styles.notifIcon, item.read ? styles.notifIconRead : styles.notifIconUnread]}>
                        <Bell size={16} color={item.read ? colors.gray[500] : colors.white} />
                      </View>
                      <View style={styles.flexMin}>
                        <View style={styles.notifTitleRow}>
                          <Text style={[styles.notifTitle, { color: item.read ? colors.gray[600] : colors.gray[950] }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.notifTime}>
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={[styles.notifMsg, { color: item.read ? colors.gray[500] : colors.gray[700] }]} numberOfLines={item.read ? 2 : undefined}>
                          {item.message}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.notifEmpty}>
              <View style={styles.notifEmptyIcon}>
                <Bell size={28} color={colors.gray[300]} />
              </View>
              <Text style={styles.notifEmptyTitle}>No Notifications</Text>
              <Text style={styles.notifEmptySub}>System notifications for order requests and updates will appear here.</Text>
            </View>
          )}
        </ScrollView>
        <View style={styles.historyBtnWrap}>
          <Pressable
            onPress={() => {
              setShowNotifications(false);
              navigate('/food/delivery/notifications');
            }}
            style={({ pressed }) => [styles.historyBtn, pressed && styles.pressed]}
          >
            <Text style={styles.historyBtnText}>View Notification History</Text>
          </Pressable>
        </View>
      </BottomPopup>

      {/* Incoming order popup (rider with no active order) */}
      {feedOffer ? (
        <NewOrderModal
          key={feedOfferKey}
          order={feedOffer}
          onAccept={handleFeedOfferAccept}
          onReject={() => handleFeedOfferPass(feedOffer)}
          onMinimize={() => handleFeedOfferMinimize(feedOffer)}
          isMuted={isOrderAlertMuted(feedOffer)}
          onToggleMute={() => toggleOrderAlertMuted(feedOffer)}
        />
      ) : null}

      {/* Floating Minimize/Restore Toggle - Above navbar (feed tab only) */}
      {currentTab === 'feed' && isModalMinimized && (activeOrder || showVerification) ? (
        <View style={[styles.restoreWrap, { bottom: navBottom100 }]}>
          <Pressable onPress={() => setIsModalMinimized(false)} style={styles.restoreBtn}>
            <View style={styles.restoreTexts}>
              <Text style={styles.restoreKicker}>Order Action Pending</Text>
              <Text style={styles.restoreText}>Tap to open delivery panel</Text>
            </View>
            <View style={styles.restoreIcon}>
              <Plus size={20} color={colors.white} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', backgroundColor: colors.white, overflow: 'hidden' },
  main: { flex: 1 },
  tabHidden: { opacity: 0 },
  flexMin: { flex: 1, minWidth: 0 },
  fullWidth: { width: '100%' },
  pressed: { transform: [{ scale: 0.95 }] },
  pressedSmall: { transform: [{ scale: 0.9 }] },

  // header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.white, 0.1),
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: 25 },
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: alpha(colors.white, 0.2), padding: 2, overflow: 'hidden', backgroundColor: alpha(colors.white, 0.05) },
  avatarImg: { width: '100%', height: '100%', borderRadius: 18 },
  // the Captain app's duty toggle (DriverHome dutyToggle)
  toggle: { width: 112, height: 40, borderRadius: 20, padding: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.slate[900], shadowColor: colors.black, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  toggleOn: { shadowOpacity: 0.25 },
  toggleOff: { shadowOpacity: 0.15 },
  toggleKnob: { position: 'absolute', left: 4, top: 4, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: colors.black, shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  toggleLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingLeft: 8 },
  toggleText: { fontSize: 9, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9 },
  toggleTextOn: { color: colors.emerald[400], marginRight: 24 },
  toggleTextOff: { color: colors.slate[400], marginLeft: 24 },
  simToggle: { paddingHorizontal: 12, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  simToggleOn: { backgroundColor: deliveryTheme.primary, borderColor: colors.orange[400] },
  simToggleOff: { backgroundColor: alpha(colors.white, 0.1), borderColor: alpha(colors.white, 0.2) },
  simToggleText: { fontSize: 9, lineHeight: 12, fontFamily: fonts.sora, fontWeight: '900' },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, elevation: 8 },
  headerBtnRed: { backgroundColor: alpha(colors.red[500], 0.1), borderColor: alpha(colors.red[500], 0.2) },
  headerBtnBlue: { backgroundColor: deliveryTheme.primarySoft, borderColor: deliveryTheme.primaryBorder },
  headerBtnWhite: { backgroundColor: alpha(colors.white, 0.1), borderColor: alpha(colors.white, 0.1) },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: deliveryTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  bellBadgeText: { fontSize: 9, lineHeight: 11, fontFamily: fonts.sora, fontWeight: '900', color: colors.white },
  statusWrap: { paddingHorizontal: 12, marginTop: 4 },
  statGrid: { flexDirection: 'row', gap: 12, width: '100%' },
  statCard: {
    flex: 1,
    backgroundColor: deliveryTheme.primary,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: deliveryTheme.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...roundedShadow,
  },
  statTexts: { flexDirection: 'column' },
  statKicker: { fontSize: 9, lineHeight: 12, color: alpha(colors.white, 0.7), fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.35, marginBottom: 4 },
  statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  statValue: { fontSize: 24, lineHeight: 24, fontFamily: fonts.sora, fontWeight: '900', color: colors.white, letterSpacing: -1.2 },
  statUnit: { fontSize: 11, lineHeight: 14, color: alpha(colors.white, 0.8), fontWeight: '700', marginBottom: 2 },
  statIcon: { width: 36, height: 36, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  rotate45: { transform: [{ rotate: '45deg' }] },
  systemCard: { backgroundColor: alpha(colors.white, 0.05), borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  systemDotWrap: { width: 40, height: 40, backgroundColor: deliveryTheme.primarySoft, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  systemDot: { width: 8, height: 8, borderRadius: 4 },
  systemTitle: { color: colors.white, fontFamily: fonts.sora, fontWeight: '900', fontSize: 11, lineHeight: 12, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 4 },
  systemSub: { color: colors.gray[400], fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: -0.25 },
  cashLimit: { marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: deliveryTheme.border, backgroundColor: alpha(colors.amber[500], 0.1), paddingHorizontal: 16, paddingVertical: 12, ...roundedShadow },
  cashLimitKicker: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4, color: colors.amber[200] },
  cashLimitText: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.amber[100] },

  // map
  simBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    backgroundColor: alpha(colors.black, 0.8),
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 16,
  },
  simBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  simBarIcon: { width: 32, height: 32, backgroundColor: deliveryTheme.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  simBarKicker: { color: deliveryTheme.primary, fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  simBarText: { color: colors.white, fontSize: 11, lineHeight: 16, fontWeight: '500' },
  simStop: { backgroundColor: alpha(colors.white, 0.1), paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: alpha(colors.white, 0.1) },
  simStopText: { color: alpha(colors.white, 0.5), fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  mapControls: { position: 'absolute', right: 16, flexDirection: 'column', gap: 16, zIndex: 120 },
  zoomBox: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: deliveryTheme.border, overflow: 'hidden', elevation: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 50, shadowOffset: { width: 0, height: 25 } },
  zoomBtn: { padding: 12, alignItems: 'center' },
  zoomBtnTop: { borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray[100], elevation: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 50, shadowOffset: { width: 0, height: 25 } },
  fabIdle: { backgroundColor: colors.white },
  fabSim: { backgroundColor: deliveryTheme.primary },
  fabRing: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  playNudge: { marginLeft: 2 },

  // trip panels
  dropWrap: { position: 'absolute', left: 0, right: 0, zIndex: 120, paddingHorizontal: 16 },
  dropCard: {
    backgroundColor: colors.white,
    borderRadius: 48,
    padding: 32,
    borderWidth: 1,
    borderColor: colors.gray[100],
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: -20 },
  },
  dropHandleRow: { width: '100%', alignItems: 'center', paddingBottom: 16, marginTop: -8 },
  dropHandle: { padding: 4, borderRadius: 9999 },
  dropTop: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start', marginBottom: 40, paddingHorizontal: 8, gap: 12 },
  dropTopLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, flex: 1, minWidth: 0 },
  dropAvatar: { width: 64, height: 64, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  dropName: { color: colors.gray[950], fontSize: 20, lineHeight: 24, fontFamily: fonts.sora, fontWeight: '700' },
  dropAddress: { color: colors.gray[500], fontSize: 12, lineHeight: 17, fontWeight: '500', marginTop: 6 },
  dropStatus: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, marginTop: 6, color: deliveryTheme.primary },
  dropBtns: { flexDirection: 'row', gap: 8 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: deliveryTheme.primarySoft, borderWidth: 1, borderColor: deliveryTheme.primaryBorder, alignItems: 'center', justifyContent: 'center' },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gray[900], alignItems: 'center', justifyContent: 'center', elevation: 8 },
  dropNote: { width: '100%', backgroundColor: deliveryTheme.primarySoft, borderWidth: 1, borderColor: deliveryTheme.primaryBorder, borderRadius: 24, padding: 20, marginBottom: 32, flexDirection: 'row', gap: 16, alignItems: 'flex-start', marginHorizontal: 8, ...roundedShadow },
  dropNoteIcon: { width: 40, height: 40, backgroundColor: colors.white, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  dropNoteKicker: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', color: deliveryTheme.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, opacity: 0.8 },
  dropNoteText: { fontSize: 14, lineHeight: 22, fontWeight: '700', color: colors.gray[950], textTransform: 'capitalize' },
  verifyBtnWrap: { width: '100%', borderRadius: 16, elevation: 14, shadowColor: '#15498b', shadowOpacity: 0.42, shadowRadius: 34, shadowOffset: { width: 0, height: 14 } },
  verifyBtn: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: deliveryTheme.border,
  },
  verifyText: { color: colors.white, fontWeight: '700', fontSize: 12, lineHeight: 16, letterSpacing: 12 * 0.14 },
  restoreWrap: { position: 'absolute', left: 0, right: 0, zIndex: 300, paddingHorizontal: 17.6 },
  restoreBtn: {
    width: '100%',
    backgroundColor: alpha(colors.gray[900], 0.9),
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 17.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: deliveryTheme.border,
    elevation: 16,
  },
  restoreTexts: { alignItems: 'flex-start', gap: 2 },
  restoreKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.gray[400] },
  restoreText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.white },
  restoreIcon: { backgroundColor: deliveryTheme.primary, padding: 8, borderRadius: 14 },

  // bottom popups
  popupSheet: { backgroundColor: colors.white },
  popupBody: { padding: 17.6 },
  popupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  popupTitle: { fontSize: 20, lineHeight: 28, fontFamily: fonts.sora, fontWeight: '900', color: colors.gray[900], textTransform: 'uppercase', letterSpacing: -0.5 },
  popupClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  emergencyList: { gap: 16, paddingVertical: 8 },
  emergencyItem: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16, backgroundColor: colors.gray[50], borderRadius: 16, borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  emergencyIcon: { width: 48, height: 48, backgroundColor: colors.white, borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 1 },
  emergencyTitle: { fontFamily: fonts.sora, fontWeight: '700', color: colors.gray[900], fontSize: 16, lineHeight: 24 },
  emergencySub: { fontSize: 12, lineHeight: 16, color: colors.gray[500], fontWeight: '500' },
  notifScroll: { marginTop: -8, flexGrow: 0 },
  notifContent: { gap: 12, paddingRight: 4 },
  clearRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  clearBtn: { backgroundColor: colors.red[50], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999 },
  clearText: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.red[500] },
  notifList: { gap: 10 },
  notifItem: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  notifRead: { backgroundColor: colors.gray[50] },
  notifUnread: { backgroundColor: deliveryTheme.primarySoft },
  notifRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  notifIcon: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notifIconRead: { backgroundColor: colors.gray[200] },
  notifIconUnread: { backgroundColor: deliveryTheme.primary, elevation: 8 },
  notifTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  notifTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  notifTime: { fontSize: 9, lineHeight: 12, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', color: colors.gray[400], paddingTop: 2 },
  notifMsg: { fontSize: 12, lineHeight: 19, marginTop: 2 },
  notifEmpty: { paddingVertical: 80, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  notifEmptyIcon: { width: 64, height: 64, backgroundColor: colors.gray[50], borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  notifEmptyTitle: { fontSize: 14, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', color: colors.gray[900], textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8, textAlign: 'center' },
  notifEmptySub: { fontSize: 12, lineHeight: 19, color: colors.gray[400], fontWeight: '700', textTransform: 'uppercase', letterSpacing: -0.3, textAlign: 'center' },
  historyBtnWrap: { marginTop: 32, marginBottom: 8 },
  historyBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, backgroundColor: colors.gray[950], alignItems: 'center', elevation: 12, shadowColor: colors.gray[950], shadowOpacity: 0.2, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
  historyBtnText: { color: colors.white, fontSize: 12, lineHeight: 16, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.4 },
});
