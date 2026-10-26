// Web: modules/Food/hooks/useDeliveryNotifications.js - the delivery socket (socket.io), the new-order queue in
// useDeliveryStore, the alert sound loop (ALERT_LOOP_MAX_MS 10 s, Feed popup ring until handled, 15 s re-trigger dedupe,
// muted orders saved in localStorage) and emitLocation. Same exports, same return value, same rules.
// Native changes (platform only):
//   - new Audio(...) -> one expo-audio player with the bundled assets/sounds/restaurant_alert.mp3 (the web's
//     /assets/media/restaurant_alert.mp3; both "original" and "hello_parth_tone" were that same file). The audio mode
//     lets it play with the app in the background / screen off (the "You are online" location service keeps the
//     process alive), so an offer that arrives over the socket while the phone is locked rings like on screen.
//   - navigator.vibrate(pattern) -> Vibration.vibrate([0, ...pattern]) (Android patterns start with a pause).
//   - The WebAudio synth fallback (when HTML5 audio was blocked) -> the vibration alone.
//   - The "unlock audio on the first tap" listener -> not needed; the player is prepared on mount.
//   - The Flutter bridge ping (triggerWebViewNativeNotification) and the browser Notification / service-worker
//     notification + its permission prompt -> nothing: Android shows the FCM push the backend sends (channel
//     "default", data.type "new_order").
//   - window.__deliverySocketDebug (a console helper) is not kept: the app never assigns globals.
//   - Native addition: when the app comes back to the front and the socket dropped while it was in the background,
//     it reconnects at once (next to the web's recoverDeliveryState on visibilitychange / focus).
import { useEffect, useRef, useState, useCallback } from 'react';
import { Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { isOfferFresh } from '@/modules/DeliveryV2/utils/offerFreshness';
import io from 'socket.io-client';
import { API_BASE_URL } from '@food/api/config';
import { deliveryAPI } from '@food/api';
import { dispatchNotificationInboxRefresh } from '@food/hooks/useNotificationInbox';
import { useDeliveryStore, resolveOrderKey, ordersShareIdentity } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { mapOrderLocations } from '@/modules/DeliveryV2/utils/orderMapping';
import {
  isOrderWithinOfferRange,
  sanitizeOrderDispatchMetrics,
} from '@/modules/DeliveryV2/utils/pickupMetrics';
import { toast } from '@/lib/toast';

// web: '/assets/media/restaurant_alert.mp3' for both sound choices
const alertSound = require('../../../../assets/sounds/restaurant_alert.mp3');
const originalSound = alertSound;
const VIBRATION_PATTERN = [0, 200, 100, 200, 100, 300]; // web: navigator.vibrate([200, 100, 200, 100, 300])

let audioModeSet = false;
const ensureAudioMode = () => {
  if (audioModeSet) return;
  audioModeSet = true;
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
  }).catch(() => {
    audioModeSet = false;
  });
};

const createAlertPlayer = (source) => {
  try {
    const player = createAudioPlayer(source);
    player.volume = 1;
    return player;
  } catch {
    return null;
  }
};

const shouldLogDeliverySocket = () => {
  try {
    return (
      __DEV__ ||
      window.localStorage.getItem('delivery_socket_debug') === '1' ||
      window.location.search.includes('delivery_socket_debug=1')
    );
  } catch {
    return __DEV__;
  }
};

const debugLog = (...args) => {
  if (shouldLogDeliverySocket()) {
    console.log('[DeliverySocket]', ...args);
  }
};
const debugWarn = (...args) => {
  if (shouldLogDeliverySocket()) {
    console.warn('[DeliverySocket]', ...args);
  }
};
const debugError = (...args) => {
  console.error('[DeliverySocket]', ...args);
};

const resolveAudioSource = (source) => source || alertSound;

const safeReadJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((ch) => `%${(`00${ch.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const resolveDeliveryPartnerIdFromClient = () => {
  try {
    const storedUser =
      safeReadJson('delivery_user') ||
      safeReadJson('deliveryUser') ||
      safeReadJson('user');

    const nestedCandidate =
      storedUser?.id ||
      storedUser?._id ||
      storedUser?.userId ||
      storedUser?.deliveryId ||
      storedUser?.deliveryPartnerId ||
      storedUser?.user?.id ||
      storedUser?.user?._id ||
      storedUser?.deliveryPartner?.id ||
      storedUser?.deliveryPartner?._id;

    if (nestedCandidate) return String(nestedCandidate);

    const token =
      localStorage.getItem('delivery_accessToken') ||
      localStorage.getItem('accessToken');
    const payload = decodeJwtPayload(token);
    const tokenCandidate =
      payload?.userId ||
      payload?.id ||
      payload?._id ||
      payload?.sub;

    return tokenCandidate ? String(tokenCandidate) : null;
  } catch {
    return null;
  }
};

export const useDeliveryNotifications = () => {
  // CRITICAL: All hooks must be called unconditionally and in the same order every render
  // Order: useRef -> useState -> useEffect -> useCallback
  
  // Step 1: All refs first (unconditional)
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const activeOrderRef = useRef(null);
  const alertLoopTimerRef = useRef(null);
  const alertLoopStartedAtRef = useRef(0);
  const lastAlertAtByOrderRef = useRef(new Map());
  const processedOrderIdsRef = useRef(new Set());
  const mutedOrderIdsRef = useRef((() => {
    const ids = new Set();
    {
      try {
        const saved = localStorage.getItem('delivery_muted_order_ids');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            parsed.forEach((id) => {
              const key = String(id || '').trim();
              if (key) ids.add(key);
            });
          }
        }
        localStorage.removeItem('delivery_notifications_muted');
      } catch (_) {}
    }
    return ids;
  })());
  const [muteUiTick, setMuteUiTick] = useState(0);
  
  // Step 2: All state hooks (unconditional)
  const [newOrder, setNewOrder] = useState(null);
  const [orderReady, setOrderReady] = useState(null);
  const [orderStatusUpdate, setOrderStatusUpdate] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [deliveryPartnerId, setDeliveryPartnerId] = useState(null);
  const [claimedOrderId, setClaimedOrderId] = useState(null); // set when another partner claims an order
  const [adminNotification, setAdminNotification] = useState(null);
  const joinedDeliveryRoomRef = useRef(null);
  const ALERT_LOOP_INTERVAL_MS = 1000;
  const ALERT_LOOP_MAX_MS = 10000; // 10 seconds max ring time per request as requested
  const ALERT_DEDUPE_MS = 15000;
  const DELIVERY_MUTED_ORDER_IDS_KEY = 'delivery_muted_order_ids';

  // Step 3: All callbacks before effects (unconditional)
  const getOrderAlertKey = (orderData = {}) => (
    String(
      orderData?.orderMongoId ||
      orderData?.order_mongo_id ||
      orderData?.orderId ||
      orderData?.order_id ||
      orderData?._id ||
      orderData?.id ||
      ''
    ).trim()
  );

  const collectOrderAlertKeys = (orderData) => {
    if (!orderData) return [];
    if (typeof orderData === 'string') {
      const key = String(orderData).trim();
      return key ? [key] : [];
    }
    return [
      ...new Set(
        [
          orderData.orderMongoId,
          orderData.order_mongo_id,
          orderData.orderId,
          orderData.order_id,
          orderData._id,
          orderData.id,
          orderData.mongoId,
        ]
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      ),
    ];
  };

  const saveMutedOrderIds = useCallback(() => {
    try {
      localStorage.setItem(
        DELIVERY_MUTED_ORDER_IDS_KEY,
        JSON.stringify([...mutedOrderIdsRef.current]),
      );
    } catch (_) {}
  }, []);

  const isOrderAlertMuted = useCallback((orderData) => {
    const keys = collectOrderAlertKeys(orderData);
    if (!keys.length) return false;
    return keys.some((key) => mutedOrderIdsRef.current.has(key));
  }, []);

  const clearOrderMuteState = useCallback(
    (orderData) => {
      const keys = collectOrderAlertKeys(orderData);
      if (!keys.length) return;
      let changed = false;
      keys.forEach((key) => {
        if (mutedOrderIdsRef.current.delete(key)) {
          changed = true;
        }
      });
      if (changed) {
        saveMutedOrderIds();
        setMuteUiTick((tick) => tick + 1);
      }
    },
    [saveMutedOrderIds],
  );

  const isProcessedOrder = useCallback((orderData) => {
    if (!orderData) return false;
    const ids = [
      orderData.orderMongoId,
      orderData.orderId,
      orderData._id,
      orderData.id,
      orderData.mongoId,
      orderData.order_id,
      orderData.order_mongo_id
    ].filter(Boolean);
    return ids.some(id => processedOrderIdsRef.current.has(String(id).trim()));
  }, []);

  const isOrderInAcceptedQueue = useCallback((orderData) => {
    if (!orderData) return false;
    const accepted = useDeliveryStore.getState().acceptedOrders || [];
    return accepted.some((item) => ordersShareIdentity(item, orderData));
  }, []);

  const markOrderIdsProcessed = useCallback((orderData) => {
    if (!orderData) return;
    const ids = [
      orderData.orderMongoId,
      orderData.order_mongo_id,
      orderData.orderId,
      orderData.order_id,
      orderData._id,
      orderData.id,
      orderData.mongoId,
    ].filter(Boolean);
    ids.forEach((id) => processedOrderIdsRef.current.add(String(id).trim()));
  }, []);

  const shouldProcessOrderAlert = (orderData = {}) => {
    const key = getOrderAlertKey(orderData);
    if (!key) return true;
    const now = Date.now();
    const last = lastAlertAtByOrderRef.current.get(key) || 0;
    if (now - last < ALERT_DEDUPE_MS) return false;
    lastAlertAtByOrderRef.current.set(key, now);
    return true;
  };

  const clearAlertLoopTimer = useCallback(() => {
    if (alertLoopTimerRef.current) {
      clearInterval(alertLoopTimerRef.current);
      alertLoopTimerRef.current = null;
    }
  }, []);

  const stopAlertLoop = useCallback(() => {
    clearAlertLoopTimer();
    alertLoopStartedAtRef.current = 0;

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.seekTo(0).catch(() => {});
        audioRef.current.loop = false;
      } catch (_) {}
    }
  }, [clearAlertLoopTimer]);

  // The ringtone itself loops (audio.loop); this timer only decides when it stops.
  const startAlertLoop = useCallback((playSoundFn, orderData, maxMs = ALERT_LOOP_MAX_MS) => {
    clearAlertLoopTimer();
    const targetOrder = orderData || activeOrderRef.current;
    if (!targetOrder || isOrderAlertMuted(targetOrder)) return;

    alertLoopStartedAtRef.current = Date.now();

    alertLoopTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - alertLoopStartedAtRef.current;
      if (elapsed >= maxMs || !activeOrderRef.current) {
        stopAlertLoop();
        return;
      }
    }, 1000);
  }, [clearAlertLoopTimer, isOrderAlertMuted, stopAlertLoop]);


  
  // web: WebAudio synth beep when HTML5 audio was blocked; the native fallback is the vibration alone
  const playSynthDeliveryBeep = useCallback(async () => {
    try {
      Vibration.vibrate(VIBRATION_PATTERN);
    } catch (err) {
      debugWarn('Fallback vibration failed:', err);
    }
  }, []);

  const playNotificationSound = useCallback((orderData = {}) => {
    if (isOrderAlertMuted(orderData)) {
      return;
    }

    try {
      try {
        Vibration.vibrate(VIBRATION_PATTERN);
      } catch (_) {}

      ensureAudioMode();
      const selectedSound = localStorage.getItem('delivery_alert_sound') || 'hello_parth_tone';
      const soundFile = selectedSound === 'original'
        ? resolveAudioSource(originalSound)
        : resolveAudioSource(alertSound);

      if (!audioRef.current) {
        audioRef.current = createAlertPlayer(soundFile);
        debugLog('Audio initialized with:', selectedSound === 'original' ? 'Original' : 'Hello Parth Tone');
      }

      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = 1.0;
        audioRef.current.loop = true;
        audioRef.current.seekTo(0).catch(() => {});
        audioRef.current.play();
      } else {
        void playSynthDeliveryBeep();
      }
    } catch (error) {
      debugWarn('Alert sound play failed, vibration fallback:', error);
      void playSynthDeliveryBeep();
    }
  }, [isOrderAlertMuted, playSynthDeliveryBeep]);

  const triggerOrderAlertFor10Sec = useCallback((orderData) => {
    const target = orderData || activeOrderRef.current || newOrder;
    if (!target) return;
    if (isOrderAlertMuted(target)) return;

    activeOrderRef.current = target;
    playNotificationSound(target);
    startAlertLoop(playNotificationSound, target);
  }, [isOrderAlertMuted, playNotificationSound, startAlertLoop, newOrder]);

  // Feed popup: ring until the rider accepts / passes (clearNewOrder or
  // stopSound), or the offer goes to someone else. The cap only stops a phone
  // left on the table from ringing forever for an offer that is long gone.
  const FEED_POPUP_RING_MAX_MS = 2 * 60 * 1000;
  const ringUntilHandled = useCallback((orderData) => {
    if (!orderData || isOrderAlertMuted(orderData)) return;
    const sameOrder = activeOrderRef.current && ordersShareIdentity(activeOrderRef.current, orderData);
    // Already ringing for this order and not past the cap: just keep going.
    if (sameOrder && alertLoopTimerRef.current && audioRef.current && audioRef.current.playing) {
      clearAlertLoopTimer();
      startAlertLoop(playNotificationSound, orderData, FEED_POPUP_RING_MAX_MS);
      return;
    }
    activeOrderRef.current = orderData;
    playNotificationSound(orderData);
    startAlertLoop(playNotificationSound, orderData, FEED_POPUP_RING_MAX_MS);
  }, [clearAlertLoopTimer, isOrderAlertMuted, playNotificationSound, startAlertLoop]);

  const setOrderAlertMuted = useCallback(
    (orderData, nextMuted) => {
      const keys = collectOrderAlertKeys(orderData);
      if (!keys.length) return;

      const muted = Boolean(nextMuted);
      keys.forEach((key) => {
        if (muted) {
          mutedOrderIdsRef.current.add(key);
        } else {
          mutedOrderIdsRef.current.delete(key);
        }
      });
      saveMutedOrderIds();
      setMuteUiTick((tick) => tick + 1);

      if (muted) {
        stopAlertLoop();
        return;
      }

      const targetOrder = orderData || activeOrderRef.current || newOrder;
      if (targetOrder) {
        activeOrderRef.current = targetOrder;
        triggerOrderAlertFor10Sec(targetOrder);
      }
    },
    [saveMutedOrderIds, stopAlertLoop, triggerOrderAlertFor10Sec, newOrder],
  );

  const toggleOrderAlertMuted = useCallback(
    (orderData) => {
      setOrderAlertMuted(orderData, !isOrderAlertMuted(orderData));
    },
    [isOrderAlertMuted, setOrderAlertMuted],
  );

  const stopAlertsWhenQueueEmpty = useCallback(() => {
    const pending = useDeliveryStore.getState().newOrders || [];
    if (pending.length === 0) {
      stopAlertLoop();
      activeOrderRef.current = null;
      setNewOrder(null);
    }
  }, [stopAlertLoop]);

  const handleIncomingOrderAlert = useCallback((orderData = {}) => {
    if (isOrderInAcceptedQueue(orderData)) {
      return;
    }
    if (isProcessedOrder(orderData)) {
      return;
    }
    if (!shouldProcessOrderAlert(orderData)) {
      return;
    }

    const mappedOrder = sanitizeOrderDispatchMetrics(mapOrderLocations(orderData) || orderData);
    const riderLocation = useDeliveryStore.getState().riderLocation;
    if (!isOrderWithinOfferRange(mappedOrder, riderLocation)) {
      debugLog('Ignored out-of-range order offer', {
        orderId: mappedOrder?.orderId || mappedOrder?._id,
      });
      return;
    }
    activeOrderRef.current = mappedOrder || { id: Date.now() };
    useDeliveryStore.getState().addNewOrder(mappedOrder);
    // Play first, then schedule loop (loop must not pause the first play)
    playNotificationSound(mappedOrder);
    startAlertLoop(playNotificationSound);
    // web: plus a browser notification while the tab was hidden - in the app Android shows the FCM push
  }, [isOrderInAcceptedQueue, isProcessedOrder, playNotificationSound, startAlertLoop]);

  const recoverDeliveryState = useCallback(async () => {
    if (!deliveryPartnerId) return;

    try {
      const [availableResult, currentTripResult] = await Promise.allSettled([
        deliveryAPI.getOrders({ limit: 20, page: 1 }),
        deliveryAPI.getCurrentDelivery(),
      ]);

      const currentPayload =
        currentTripResult.status === 'fulfilled'
          ? currentTripResult.value?.data?.data ??
            currentTripResult.value?.data ??
            null
          : null;

      const activeOrders = Array.isArray(currentPayload?.activeOrders)
        ? currentPayload.activeOrders
        : currentPayload?.activeOrder
          ? [currentPayload.activeOrder]
          : [];

      if (currentPayload?.capacity) {
        useDeliveryStore.getState().setCapacity(currentPayload.capacity);
      }

      if (activeOrders.length) {
        useDeliveryStore.getState().setAcceptedOrders(
          activeOrders.map(mapOrderLocations).filter(Boolean),
          { capacity: currentPayload?.capacity },
        );
        return;
      }

      if (currentPayload && (currentPayload._id || currentPayload.orderId)) {
        debugLog('Recovered current delivery trip after reconnect/focus:', currentPayload);
        setOrderStatusUpdate({
          ...currentPayload,
          recoverySource: 'delivery_reconnect',
        });
        return;
      }

      const availablePayload =
        availableResult.status === 'fulfilled'
          ? availableResult.value?.data?.data ??
            availableResult.value?.data ??
            {}
          : {};
      const availableOrders = Array.isArray(availablePayload?.docs)
        ? availablePayload.docs
        : Array.isArray(availablePayload?.items)
          ? availablePayload.items
          : Array.isArray(availablePayload)
            ? availablePayload
            : [];

      const newOffers = Array.isArray(availablePayload?.newOffers)
        ? availablePayload.newOffers
        : [];
      const offeredKeys = new Set(newOffers.map((offer) => String(offer?._id || offer?.orderMongoId || offer?.orderId || '')));

      const recoverableOrder = availableOrders.find((order) => {
        // Only an offer this rider can still take (not one they passed) and that is recent.
        if (!offeredKeys.has(String(order?._id || order?.orderMongoId || order?.orderId || ''))) return false;
        if (!isOfferFresh(order)) return false;

        const dispatchStatus = order?.dispatch?.status;
        const isEligibleStatus = ['unassigned', 'assigned'].includes(dispatchStatus) &&
          ['preparing', 'ready_for_pickup'].includes(order?.orderStatus);
          
        if (!isEligibleStatus) return false;
        
        // Ignore stale test/bugged orders older than 2 hours to prevent sound playing repeatedly on login
        const createdAt = new Date(order.createdAt || order.updatedAt).getTime();
        if (Date.now() - createdAt > 2 * 60 * 60 * 1000) {
          return false;
        }
        
        return true;
      });

      if (availablePayload?.capacity) {
        useDeliveryStore.getState().setCapacity(availablePayload.capacity);
      }

      newOffers.forEach((order) => useDeliveryStore.getState().addNewOrder(order));

      if (recoverableOrder && !isProcessedOrder(recoverableOrder)) {
        debugLog('Recovered available delivery order after reconnect/focus:', recoverableOrder);
        setNewOrder(recoverableOrder);
        useDeliveryStore.getState().addNewOrder(recoverableOrder);
        handleIncomingOrderAlert(recoverableOrder);
      }
    } catch (error) {
      debugWarn('Delivery recovery sync failed:', error?.message || error);
    }
  }, [deliveryPartnerId, handleIncomingOrderAlert, isProcessedOrder]);

  const joinDeliveryRoomIfPossible = useCallback(() => {
    if (!socketRef.current?.connected || !deliveryPartnerId) {
      return false;
    }

    if (joinedDeliveryRoomRef.current === deliveryPartnerId) {
      return true;
    }

    debugLog('Joining delivery room', {
      deliveryPartnerId,
      socketId: socketRef.current?.id,
    });
    socketRef.current.emit('join-delivery', deliveryPartnerId);
    joinedDeliveryRoomRef.current = deliveryPartnerId;
    return true;
  }, [deliveryPartnerId]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'hidden') return;
      if (!activeOrderRef.current) return;

      playNotificationSound(activeOrderRef.current);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [playNotificationSound]);

  // Initialize audio on mount - use selected preference from localStorage
  // (web: also an "unlock" on the first tap for the browser autoplay policy - not needed for a native player)
  useEffect(() => {
    ensureAudioMode();
    const selectedSound = localStorage.getItem('delivery_alert_sound') || 'hello_parth_tone';
    const soundFile = selectedSound === 'original'
      ? resolveAudioSource(originalSound)
      : resolveAudioSource(alertSound);

    if (!audioRef.current) {
      audioRef.current = createAlertPlayer(soundFile);
      if (audioRef.current) audioRef.current.volume = 0.7;
      debugLog('Audio initialized with:', selectedSound === 'original' ? 'Original' : 'Hello Parth Tone');
    }

    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.remove();
        } catch (_) {}
        audioRef.current = null;
      }
    };
  }, []);

  // Fetch delivery partner ID
  useEffect(() => {
    const fallbackId = resolveDeliveryPartnerIdFromClient();
    if (fallbackId) {
      setDeliveryPartnerId(fallbackId);
      debugLog('? Delivery Partner ID restored from local client auth:', fallbackId);
    }

    const fetchDeliveryPartnerId = async () => {
      try {
        const response = await deliveryAPI.getMe();
        if (response.data?.success && response.data.data) {
          const deliveryPartner = response.data.data.user || response.data.data.deliveryPartner;
          if (deliveryPartner) {
            const id = deliveryPartner.id?.toString() || 
                      deliveryPartner._id?.toString() || 
                      deliveryPartner.deliveryId;
            if (id) {
              setDeliveryPartnerId(id);
              debugLog('? Delivery Partner ID fetched:', id);
            } else {
              debugWarn('?? Could not extract delivery partner ID from response');
            }
          } else {
            debugWarn('?? No delivery partner data in API response');
          }
        } else {
          debugWarn('?? Could not fetch delivery partner ID from API');
        }
      } catch (error) {
        debugError('Error fetching delivery partner:', error);
      }
    };
    fetchDeliveryPartnerId();
  }, []);

  // Socket connection effect (no backend when API_BASE_URL is empty)
  useEffect(() => {
    if (!API_BASE_URL || !String(API_BASE_URL).trim()) {
      setIsConnected(false);
      return;
    }

    // IMPORTANT: Socket.IO server is on the origin (not /api/v1).
    // Our API baseURL is typically like: http://localhost:5000/api/v1
    // So for sockets we always connect to: http://localhost:5000
    let backendUrl = API_BASE_URL;
    try {
      const base =
        String(backendUrl).startsWith('http')
          ? undefined
          : window.location.origin;
      backendUrl = new URL(backendUrl, base).origin;
    } catch {
      // best-effort fallback: strip common API prefixes
      backendUrl = String(backendUrl || "")
        .replace(/\/api\/v\d+\/?$/i, "")
        .replace(/\/api\/?$/i, "")
        .replace(/\/+$/, "");

      if (!backendUrl || !backendUrl.startsWith('http')) {
        backendUrl = window.location.origin;
      }
    }
    
    // Backend uses default namespace; rooms handle role separation.
    const socketUrl = `${backendUrl}`;
    
    debugLog('?? Attempting to connect to Delivery Socket.IO:', socketUrl);
    debugLog('?? Backend URL:', backendUrl);
    debugLog('?? API_BASE_URL:', API_BASE_URL);
    debugLog('?? Delivery Partner ID:', deliveryPartnerId);
    debugLog('?? Environment: (ui-only mode)');
    
    // Block localhost only in production builds. In dev, localhost is expected.
    if (!__DEV__ && backendUrl.includes('localhost')) {
      debugError('? CRITICAL: Trying to connect Socket.IO to localhost in production!');
      debugError('?? Current socketUrl:', socketUrl);
      debugError('?? Current API_BASE_URL:', API_BASE_URL);
      setIsConnected(false);
      return;
    }
    
    // Validate backend URL format
    if (!backendUrl || !backendUrl.startsWith('http')) {
      debugError('? CRITICAL: Invalid backend URL format:', backendUrl);
      debugError('?? API_BASE_URL:', API_BASE_URL);
      debugError('?? Expected format: https://your-domain.com or ');
      return; // Don't try to connect with invalid URL
    }
    
    // Validate socket URL format
    try {
      new URL(socketUrl); // This will throw if URL is invalid
    } catch (urlError) {
      debugError('? CRITICAL: Invalid Socket.IO URL:', socketUrl);
      debugError('?? URL validation error:', urlError.message);
      debugError('?? Backend URL:', backendUrl);
      debugError('?? API_BASE_URL:', API_BASE_URL);
      return; // Don't try to connect with invalid URL
    }

    const token = localStorage.getItem('delivery_accessToken') || localStorage.getItem('accessToken');
    const tokenPreview = token ? `${String(token).slice(0, 12)}...` : null;
    debugLog('Preparing socket auth payload', {
      tokenPresent: Boolean(token),
      tokenPreview,
      deliveryPartnerId,
      socketUrl,
    });

    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'], // WebSocket first for instant connection
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      auth: {
        token: token || ""
      },
      query: token ? { token } : undefined,
    });

    debugLog('Socket.IO client created', {
      socketUrl,
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      tokenPresent: Boolean(token),
      tokenPreview,
      deliveryPartnerId,
    });

    socketRef.current.on('connect', () => {
      debugLog('Socket connected', {
        socketId: socketRef.current?.id,
        deliveryPartnerId,
        transport: socketRef.current?.io?.engine?.transport?.name || 'unknown',
      });
      setIsConnected(true);

      joinedDeliveryRoomRef.current = null;
      if (!joinDeliveryRoomIfPossible()) {
        debugLog('Socket connected before deliveryPartnerId was ready; waiting to join room.');
      }
      debugLog('Requesting resync after connect', {
        deliveryPartnerId,
        socketId: socketRef.current?.id,
      });
      socketRef.current.emit('resync');
      void recoverDeliveryState();
    });

    socketRef.current.on('delivery-room-joined', (data) => {
      debugLog('Delivery room joined successfully', data);
    });

    socketRef.current.on('resync_complete', (data) => {
      debugLog('Resync completed', data);
    });

    socketRef.current.on('connect_error', (error) => {
      debugError('Socket connection error', {
        message: error?.message,
        type: error?.type,
        description: error?.description,
        context: error?.context,
        data: error?.data,
        socketUrl,
        apiBaseUrl: API_BASE_URL,
        deliveryPartnerId,
        tokenPresent: Boolean(token),
        tokenPreview,
        transport: socketRef.current?.io?.engine?.transport?.name || 'unknown',
      });
      setIsConnected(false);
    });

    socketRef.current.on('disconnect', (reason) => {
      debugWarn('Socket disconnected', {
        reason,
        socketId: socketRef.current?.id,
        deliveryPartnerId,
      });
      setIsConnected(false);
      joinedDeliveryRoomRef.current = null;
      
      if (reason === 'io server disconnect') {
        socketRef.current.connect();
      }
    });

    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      debugWarn('Reconnection attempt', {
        attemptNumber,
        socketUrl,
        deliveryPartnerId,
      });
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      debugLog('Socket reconnected', {
        attemptNumber,
        socketId: socketRef.current?.id,
        deliveryPartnerId,
        transport: socketRef.current?.io?.engine?.transport?.name || 'unknown',
      });
      setIsConnected(true);

      joinedDeliveryRoomRef.current = null;
      joinDeliveryRoomIfPossible();
      socketRef.current.emit('resync');
      void recoverDeliveryState();
    });

    socketRef.current.on('new_order', (orderData) => {
      debugLog('New order received via socket', {
        orderId: orderData?.orderId || orderData?.orderMongoId || orderData?._id,
        dispatchStatus: orderData?.dispatch?.status,
      });
      if (isOrderInAcceptedQueue(orderData) || isProcessedOrder(orderData)) {
        return;
      }
      setNewOrder(orderData);
      handleIncomingOrderAlert(orderData);
    });

    // Same payload as new_order — also ring so retry-only offers are not silent
    socketRef.current.on('new_order_available', (orderData) => {
      debugLog('New order available received via socket', {
        orderId: orderData?.orderId || orderData?.orderMongoId || orderData?._id,
        phase: orderData?.phase || 'unknown',
        dispatchStatus: orderData?.dispatch?.status,
      });
      if (isOrderInAcceptedQueue(orderData) || isProcessedOrder(orderData)) {
        return;
      }
      setNewOrder(orderData);
      handleIncomingOrderAlert(orderData);
    });

    socketRef.current.on('active_orders', (orders = []) => {
      if (!Array.isArray(orders) || orders.length === 0) return;
      useDeliveryStore.getState().setAcceptedOrders(
        orders.map(mapOrderLocations).filter(Boolean),
      );
    });

    socketRef.current.on('delivery_capacity', (capacity) => {
      if (capacity) {
        useDeliveryStore.getState().setCapacity(capacity);
      }
    });

    socketRef.current.on('active_order', (orderData) => {
      if (!orderData) return;
      const mapped = mapOrderLocations(orderData);
      if (mapped) {
        markOrderIdsProcessed(mapped);
        clearOrderMuteState(mapped);
        useDeliveryStore.getState().acceptOrderToQueue(mapped);
        stopAlertLoop();
        activeOrderRef.current = null;
        setNewOrder(null);
      }
    });

    socketRef.current.on('play_notification_sound', (data) => {
      debugLog('play_notification_sound received', {
        orderId: data?.orderId || data?.orderMongoId || data?.order_id,
      });
      const normalizedData = {
        orderId: data?.orderId || data?.order_id,
        orderMongoId: data?.orderMongoId || data?.order_mongo_id,
        ...data
      };
      if (isOrderAlertMuted(normalizedData) || isOrderInAcceptedQueue(normalizedData) || isProcessedOrder(normalizedData)) {
        return;
      }
      handleIncomingOrderAlert(normalizedData);
    });

    socketRef.current.on('order_ready', (orderData) => {
      debugLog('order_ready received via socket', {
        orderId: orderData?.orderId || orderData?.orderMongoId || orderData?._id,
      });
      setOrderReady(orderData);
      playNotificationSound(orderData);
    });

    socketRef.current.on('order_status_update', (statusData) => {
      debugLog('?? Delivery order status update received via socket:', statusData);
      setOrderStatusUpdate(statusData || null);
    });

    socketRef.current.on('order_cancelled', (statusData) => {
      debugLog('?? Delivery order cancelled event received via socket:', statusData);
      setOrderStatusUpdate({
        ...(statusData || {}),
        status: 'cancelled'
      });
    });

    socketRef.current.on('order_deleted', (statusData) => {
      debugLog('?? Delivery order deleted event received via socket:', statusData);
      setOrderStatusUpdate({
        ...(statusData || {}),
        status: 'deleted'
      });
    });

    const handleOfferTakenElsewhere = (data, { showToast }) => {
      const claimedId = data?.orderId || data?.orderMongoId || data?.order_id;
      const claimedBy = String(data?.claimedBy || '');
      const isSelf =
        Boolean(claimedBy) &&
        Boolean(deliveryPartnerId) &&
        claimedBy === String(deliveryPartnerId);

      if (claimedId) {
        markOrderIdsProcessed({ _id: claimedId, orderId: claimedId, orderMongoId: claimedId });
        useDeliveryStore.getState().removeNewOrder(claimedId);
        setClaimedOrderId(claimedId);
      }

      if (showToast && !isSelf) {
        toast.info('This request accepted by another rider', {
          id: `order-claimed-${claimedId || 'unknown'}`,
          duration: 4000,
        });
      }

      const remaining = useDeliveryStore.getState().newOrders || [];
      if (remaining.length > 0) {
        const nextOffer = remaining[0];
        activeOrderRef.current = nextOffer;
        setNewOrder(nextOffer);
        if (!isOrderAlertMuted(nextOffer)) {
          playNotificationSound(nextOffer);
          startAlertLoop(playNotificationSound);
        } else {
          stopAlertLoop();
        }
        return;
      }

      stopAlertLoop();
      activeOrderRef.current = null;
      setNewOrder(null);
    };

    socketRef.current.on('order_reassigned_elsewhere', (data) => {
      debugLog('?? Order reassigned to another partner:', data);
      handleOfferTakenElsewhere(data, { showToast: true });
    });

    // Backend emits 'order_claimed' when another delivery boy accepts an offered order
    socketRef.current.on('order_claimed', (data) => {
      debugLog('?? order_claimed received - order taken by another partner:', data);
      handleOfferTakenElsewhere(data, { showToast: true });
    });

    socketRef.current.on('admin_notification', (payload) => {
      debugLog('Admin broadcast received via socket', payload);
      setAdminNotification(payload);
      dispatchNotificationInboxRefresh();
    });

    // Auth change/refresh listeners
    const handleAuthChange = () => {
      const newToken = localStorage.getItem('delivery_accessToken') || localStorage.getItem('accessToken');
      if (socketRef.current && newToken) {
        debugLog('?? Auth changed, updating socket token');
        socketRef.current.auth.token = newToken;
        // Only reconnect if not already connecting/connected or if token changed significantly
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
      }
    };

    const handleAuthRefreshed = (e) => {
      if (e.detail?.module === 'delivery' && socketRef.current && e.detail.token) {
        debugLog('?? Auth refreshed for delivery, updating socket token');
        socketRef.current.auth.token = e.detail.token;
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
      }
    };

    const handleWindowFocus = () => {
      void recoverDeliveryState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // native addition: a socket dropped while the app was in the background reconnects now
        if (socketRef.current && !socketRef.current.connected) {
          socketRef.current.connect();
        }
        void recoverDeliveryState();
      }
    };

    window.addEventListener('deliveryAuthChanged', handleAuthChange);
    window.addEventListener('authRefreshed', handleAuthRefreshed);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      debugLog('? Cleaning up socket connection...');
      stopAlertLoop();
      joinedDeliveryRoomRef.current = null;
      window.removeEventListener('deliveryAuthChanged', handleAuthChange);
      window.removeEventListener('authRefreshed', handleAuthRefreshed);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [deliveryPartnerId, handleIncomingOrderAlert, isOrderAlertMuted, isOrderInAcceptedQueue, isProcessedOrder, joinDeliveryRoomIfPossible, markOrderIdsProcessed, clearOrderMuteState, playNotificationSound, recoverDeliveryState, startAlertLoop, stopAlertLoop]);

  useEffect(() => {
    if (!deliveryPartnerId) {
      debugLog('? Waiting for deliveryPartnerId...');
      return;
    }

    joinDeliveryRoomIfPossible();

    if (socketRef.current?.connected) {
      debugLog('Requesting resync after deliveryPartnerId resolved', {
        deliveryPartnerId,
        socketId: socketRef.current?.id,
      });
      socketRef.current.emit('resync');
      void recoverDeliveryState();
    }
  }, [deliveryPartnerId, joinDeliveryRoomIfPossible, recoverDeliveryState]);

  // Helper functions
  const clearNewOrder = useCallback((orderOrId) => {
    const target = orderOrId || newOrder || activeOrderRef.current;
    if (target) {
      if (typeof target === 'object') {
        markOrderIdsProcessed(target);
        clearOrderMuteState(target);
      } else {
        processedOrderIdsRef.current.add(String(target).trim());
        clearOrderMuteState(target);
      }
    }
    stopAlertLoop();
    activeOrderRef.current = null;
    setNewOrder(null);
    const removeId =
      typeof target === 'object'
        ? resolveOrderKey(target)
        : String(target || '').trim();
    if (removeId) {
      useDeliveryStore.getState().removeNewOrder(removeId);
    }
    stopAlertsWhenQueueEmpty();
  }, [clearOrderMuteState, markOrderIdsProcessed, newOrder, stopAlertLoop, stopAlertsWhenQueueEmpty]);

  const clearClaimedOrderId = () => setClaimedOrderId(null);

  const clearOrderReady = () => {
    setOrderReady(null);
  };

  const clearOrderStatusUpdate = () => {
    setOrderStatusUpdate(null);
  };

  const clearAdminNotification = () => {
    setAdminNotification(null);
  };

  const emitLocation = useCallback((data) => {
    if (socketRef.current && socketRef.current.connected) {
      // debugLog('? Emitting location via socket:', data);
      socketRef.current.emit('update-location', data);
      return true;
    }
    return false;
  }, []);

  return {
    newOrder,
    clearNewOrder,
    orderReady,
    clearOrderReady,
    orderStatusUpdate,
    clearOrderStatusUpdate,
    adminNotification,
    clearAdminNotification,
    claimedOrderId,
    clearClaimedOrderId,
    isConnected,
    playNotificationSound,
    stopSound: stopAlertLoop,
    triggerOrderAlertFor10Sec,
    ringUntilHandled,
    isOrderAlertMuted,
    setOrderAlertMuted,
    toggleOrderAlertMuted,
    muteUiTick,
    emitLocation
  };
};
