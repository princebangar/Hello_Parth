// Web: modules/Food/hooks/useRestaurantNotifications.js — one global restaurant socket for every user of the hook
// (new_order / new_dining_booking / play_notification_sound / order_status_update / admin_notification), the alert
// loop (replays the alert every 4.5 s until the order is accepted / rejected / cancelled / muted or the popup closes),
// the dining-request ring, muted + processed order ids saved in localStorage, the 15 s alert dedupe and the 8 s REST
// polling fallback. Same exports, same return value, same rules.
// Native changes (platform only):
//   - new Audio(...) / the fetched blob URL -> one expo-audio player of the bundled assets/sounds/restaurant_alert.mp3
//     (the web's /assets/media/restaurant_alert.mp3). Each ring restarts it from 0 like the web (currentTime = 0 +
//     play). The audio mode lets it play while the app is in the background / the screen is off.
//   - navigator.vibrate([200, 100, 200, 100, 300]) -> Vibration.vibrate([0, 200, 100, 200, 100, 300]) (Android
//     patterns start with a pause).
//   - The Flutter bridge (triggerWebViewNativeNotification / stopWebViewNativeNotification) and the browser
//     Notification / service-worker notification + its permission prompt -> nothing: Android shows the FCM push the
//     backend sends (channel restaurant_orders).
//   - The "unlock audio on the first tap" listener -> not needed (the player is created on the first ring).
//   - The globals the web read from localStorage when the module loaded are read on the first use of the hook (the
//     app's localStorage is filled from storage just before the first screen, after the modules have loaded).
//   - Object.keys(localStorage) -> localStorage.key(i) (the storage shim has no enumerable keys).
//   - Native addition: when the app comes back to the front (visibilitychange 'visible', fired from AppState) a socket
//     that dropped while the app was in the background reconnects at once, then the web's poll runs.
import { useEffect, useState, useCallback } from 'react';
import { Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import io from 'socket.io-client';
import { toast } from '@/lib/toast';
import { API_BASE_URL } from '@food/api/config';
import { restaurantAPI } from '@food/api';
import { dispatchNotificationInboxRefresh } from '@food/hooks/useNotificationInbox';
import { normalizeRestaurantOrderView } from '@food/utils/restaurantOrderPricing';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

// web: '/assets/media/restaurant_alert.mp3'
const alertSound = require('../../../../assets/sounds/restaurant_alert.mp3');
const VIBRATION_PATTERN = [0, 200, 100, 200, 100, 300];

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

const createAlertPlayer = () => {
  try {
    const player = createAudioPlayer(alertSound);
    player.volume = 1;
    return player;
  } catch {
    return null;
  }
};

// --------------------------------------------------------------------------
// GLOBAL SINGLETON STATE (Shared across all component hook instances)
// --------------------------------------------------------------------------
let globalIsMuted = false;
let globalMutedOrderIds = new Set();
let processedOrderIds = new Set();
let storedStateLoaded = false;

// web: read when the module loaded
const loadStoredState = () => {
  if (storedStateLoaded) return;
  storedStateLoaded = true;
  try {
    globalIsMuted = localStorage.getItem('restaurant_notifications_muted') === 'true';
  } catch (_) {}
  try {
    const saved = localStorage.getItem('restaurant_muted_order_ids');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        globalMutedOrderIds = new Set(parsed);
      }
    }
  } catch (_) {}
  try {
    const saved = localStorage.getItem('restaurant_processed_order_ids');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        processedOrderIds = new Set(parsed);
      }
    }
  } catch (_) {}
};

const saveMutedOrderIds = () => {
  try {
    localStorage.setItem('restaurant_muted_order_ids', JSON.stringify(Array.from(globalMutedOrderIds)));
  } catch (_) {}
};

let globalNewOrder = null;
let globalNewReservation = null;
let globalActiveOrder = null;

// Audio player reference
let globalAudio = null;
let globalAlertLoopTimer = null;
let globalAlertLoopStartedAt = 0;

// Socket and Polling references
let globalSocket = null;
let globalSocketConnected = false;
let globalActiveRestaurantId = null;
let globalPollingIntervalId = null;
let globalVisibilityListenerAdded = false;

const saveProcessedOrderIds = () => {
  try {
    const arr = Array.from(processedOrderIds).slice(-200);
    localStorage.setItem('restaurant_processed_order_ids', JSON.stringify(arr));
  } catch (e) {}
};

const lastAlertAtByOrder = new Map();

// Hook subscribers
const subscribers = new Set();

const updateGlobalState = (updates) => {
  if ('isMuted' in updates) {
    globalIsMuted = updates.isMuted;
    try {
      localStorage.setItem('restaurant_notifications_muted', globalIsMuted ? 'true' : 'false');
    } catch (_) {}
  }
  if ('newOrder' in updates) {
    globalNewOrder = updates.newOrder;
  }
  if ('newReservation' in updates) {
    globalNewReservation = updates.newReservation;
  }
  if ('activeOrder' in updates) {
    globalActiveOrder = updates.activeOrder;
  }
  if ('socketConnected' in updates) {
    globalSocketConnected = updates.socketConnected;
  }

  subscribers.forEach((callback) => {
    try {
      callback({
        isMuted: globalIsMuted,
        mutedOrderIds: globalMutedOrderIds,
        newOrder: globalNewOrder,
        newReservation: globalNewReservation,
        isConnected: globalSocketConnected,
      });
    } catch (e) {
      // Ignore defunct subscribers
    }
  });
};

const stopGlobalAlertLoop = () => {
  if (globalAlertLoopTimer) {
    clearInterval(globalAlertLoopTimer);
    globalAlertLoopTimer = null;
  }
  globalAlertLoopStartedAt = 0;

  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('alert_start_')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}

  if (globalAudio) {
    try {
      globalAudio.pause();
      globalAudio.seekTo(0).catch(() => {});
    } catch (_) {}
  }
  try {
    Vibration.cancel();
  } catch (_) {}
};

const playGlobalNotificationSound = async (orderData = {}) => {
  try {
    loadStoredState();
    if (globalIsMuted || isOrderMuted(orderData)) return;
    try {
      Vibration.vibrate(VIBRATION_PATTERN);
    } catch (_) {}

    ensureAudioMode();
    if (!globalAudio) {
      globalAudio = createAlertPlayer();
    }

    if (globalAudio) {
      globalAudio.muted = false;
      globalAudio.volume = 1;
      globalAudio.loop = false;
      // web: currentTime = 0, then play()
      globalAudio
        .seekTo(0)
        .catch(() => {})
        .finally(() => {
          try {
            globalAudio?.play();
          } catch (_) {}
        });
    }
  } catch (error) {
    // ignore
  }
};

// Rings until the order is accepted / rejected / cancelled, the restaurant
// mutes it, or the popup closes (each of those calls stopGlobalAlertLoop).
// Table (dining) requests ring like orders do, until the restaurant opens or dismisses the popup.
let globalDiningLoopTimer = null;
const stopDiningAlertLoop = () => {
  if (globalDiningLoopTimer) {
    clearInterval(globalDiningLoopTimer);
    globalDiningLoopTimer = null;
  }
};
const startDiningAlertLoop = (bookingData) => {
  stopDiningAlertLoop();
  if (!globalIsMuted) playGlobalNotificationSound(bookingData);
  globalDiningLoopTimer = setInterval(() => {
    if (!globalNewReservation) {
      stopDiningAlertLoop();
      return;
    }
    if (!globalIsMuted) playGlobalNotificationSound(globalNewReservation);
  }, 4500);
};

const startGlobalAlertLoop = (orderData) => {
  stopGlobalAlertLoop();

  globalAlertLoopStartedAt = Date.now();
  globalActiveOrder = orderData;
  updateGlobalState({ activeOrder: orderData });

  const ALERT_LOOP_INTERVAL_MS = 4500;

  if (!globalIsMuted && !isOrderMuted(orderData)) {
    playGlobalNotificationSound(orderData);
  }

  globalAlertLoopTimer = setInterval(() => {
    if (!globalActiveOrder) {
      stopGlobalAlertLoop();
      return;
    }

    // Respect BOTH the global mute and the per-order mute — muting an order must
    // silence its alert even if the loop wasn't torn down for any reason.
    if (!globalIsMuted && !isOrderMuted(globalActiveOrder)) {
      playGlobalNotificationSound(globalActiveOrder);
    }
  }, ALERT_LOOP_INTERVAL_MS);
};

const isProcessedOrder = (orderData) => {
  if (!orderData) return false;
  const ids = [
    orderData.orderMongoId,
    orderData.orderId,
    orderData._id,
    orderData.id,
    orderData.mongoId,
    orderData.order_id,
    orderData.order_mongo_id,
  ].filter(Boolean);
  return ids.some((id) => processedOrderIds.has(String(id).trim()));
};

const getOrderAlertKey = (orderData = {}) =>
  String(
    orderData?.orderMongoId ||
      orderData?.order_mongo_id ||
      orderData?.orderId ||
      orderData?.order_id ||
      orderData?._id ||
      orderData?.id ||
      '',
  ).trim();

// True if ANY of the order's id variants is muted. Different call sites resolve
// the "order id" with slightly different priorities, so checking all variants
// avoids a mute being missed just because a different id field was stored.
const isOrderMuted = (orderData = {}) => {
  const ids = [
    orderData?.orderMongoId,
    orderData?.order_mongo_id,
    orderData?.orderId,
    orderData?.order_id,
    orderData?._id,
    orderData?.id,
  ]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  return ids.some((id) => globalMutedOrderIds.has(id));
};

const shouldProcessOrderAlert = (orderData = {}) => {
  const key = getOrderAlertKey(orderData);
  if (!key) return true;
  const now = Date.now();
  const last = lastAlertAtByOrder.get(key) || 0;
  const ALERT_DEDUPE_MS = 15000;
  if (now - last < ALERT_DEDUPE_MS) return false;
  lastAlertAtByOrder.set(key, now);
  return true;
};

/**
 * Hook for restaurant to receive real-time order notifications with sound
 * @returns {object} - { newOrder, playSound, isConnected, isMuted, setMuted, clearNewOrder, stopSound }
 */
export const useRestaurantNotifications = () => {
  loadStoredState();
  const [localState, setLocalState] = useState(() => ({
    isMuted: globalIsMuted,
    mutedOrderIds: globalMutedOrderIds,
    newOrder: globalNewOrder,
    newReservation: globalNewReservation,
    isConnected: globalSocketConnected,
  }));

  const [restaurantId, setRestaurantId] = useState(null);

  // Subscribe to global updates
  useEffect(() => {
    const callback = (newState) => {
      setLocalState(newState);
    };
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }, []);

  // Fetch restaurant ID from API on mount
  useEffect(() => {
    const fetchRestaurantId = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        if (response.data?.success && response.data.data?.restaurant) {
          const restaurant = response.data.data.restaurant;
          if (restaurant.status !== 'approved') {
            return;
          }
          const id = restaurant._id?.toString() || restaurant.restaurantId;
          setRestaurantId(id);
        }
      } catch (error) {
        // ignore
      }
    };
    fetchRestaurantId();
  }, []);

  const handleIncomingOrderAlert = useCallback((orderData, source = 'unknown') => {
    const isSocket = source === 'socket';
    const normalizedOrder = normalizeRestaurantOrderView(orderData);

    if (isProcessedOrder(normalizedOrder)) {
      return;
    }

    if (normalizedOrder?.scheduledAt) {
      const scheduledTime = new Date(normalizedOrder.scheduledAt).getTime();
      const now = Date.now();
      if (scheduledTime > now + 15 * 60000) {
        return;
      }
    }

    const deduped = !shouldProcessOrderAlert(normalizedOrder);
    if (deduped && !isSocket) {
      return;
    }

    updateGlobalState({ newOrder: normalizedOrder });

    if (!isOrderMuted(normalizedOrder)) {
      // startGlobalAlertLoop already plays the sound immediately (and then loops),
      // so we must NOT play here as well — that caused the double sound.
      startGlobalAlertLoop(normalizedOrder);
    }
    // web: a browser notification while the tab was hidden — the app gets the FCM push instead
  }, []);

  // Handle socket connection and listeners globally
  useEffect(() => {
    if (!API_BASE_URL || !String(API_BASE_URL).trim()) {
      updateGlobalState({ socketConnected: false });
      return;
    }
    if (!restaurantId) {
      return;
    }

    // Check if we need to initialize or update socket
    if (globalSocket && globalActiveRestaurantId === restaurantId) {
      return;
    }

    if (globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
      globalSocketConnected = false;
      updateGlobalState({ socketConnected: false });
    }

    globalActiveRestaurantId = restaurantId;

    let backendUrl = API_BASE_URL;
    try {
      const urlObj = new URL(backendUrl);
      let pathname = urlObj.pathname.replace(/^\/api\/?$/, '');
      backendUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${pathname}`;
    } catch (e) {
      backendUrl = backendUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
      if (backendUrl.startsWith('https:') || backendUrl.startsWith('http:')) {
        const protocolMatch = backendUrl.match(/^(https?):/i);
        if (protocolMatch) {
          const protocol = protocolMatch[1].toLowerCase();
          const cleanPath = backendUrl.substring(protocol.length + 1).replace(/^\/+/, '');
          backendUrl = `${protocol}://${cleanPath}`;
        }
      }
    }
    backendUrl = backendUrl.replace(/^(https?):\/+/gi, '$1://').replace(/\/+$/, '');
    // web: a localhost backend in a production deployment was refused; the app is always the production shell
    // (window.location is https://helloparth.in), so the same rule applies to a localhost API URL.
    const backendIsLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    if (backendIsLocalhost && !__DEV__) {
      updateGlobalState({ socketConnected: false });
      return;
    }

    let socketOrigin = backendUrl;
    try {
      socketOrigin = new URL(backendUrl).origin;
    } catch {
      socketOrigin = String(backendUrl || '')
        .replace(/\/api\/v\d+\/?$/i, '')
        .replace(/\/api\/?$/i, '')
        .replace(/\/+$/, '');
    }
    if (!socketOrigin || socketOrigin === 'null') {
      const m = String(backendUrl).match(/^(https?:\/\/[^/]+)/i);
      socketOrigin = m ? m[1] : socketOrigin;
    }

    const socketUrl = `${socketOrigin}`;

    if (!/^https?:\/\/[^/]+/i.test(socketUrl)) {
      updateGlobalState({ socketConnected: false });
      return;
    }

    globalSocket = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      autoConnect: true,
      auth: {
        token: localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken'),
      },
    });

    globalSocket.on('connect', () => {
      globalSocketConnected = true;
      updateGlobalState({ socketConnected: true });
      globalSocket?.emit('join-restaurant', restaurantId);
    });

    globalSocket.on('connect_error', () => {
      globalSocketConnected = false;
      updateGlobalState({ socketConnected: false });
    });

    globalSocket.on('disconnect', (reason) => {
      globalSocketConnected = false;
      updateGlobalState({ socketConnected: false });
      if (reason === 'io server disconnect') {
        globalSocket?.connect();
      }
    });

    globalSocket.on('reconnect', () => {
      globalSocketConnected = true;
      updateGlobalState({ socketConnected: true });
      globalSocket?.emit('join-restaurant', restaurantId);
    });

    globalSocket.on('new_order', (orderData) => {
      const normalizedOrder = normalizeRestaurantOrderView({
        ...orderData,
        orderMongoId: orderData?.orderMongoId || orderData?._id || orderData?.order_id,
        orderId: orderData?.orderId || orderData?.order_id || orderData?._id,
      });
      updateGlobalState({ newOrder: normalizedOrder });
      handleIncomingOrderAlert(normalizedOrder, 'socket');
    });

    globalSocket.on('new_dining_booking', (bookingData) => {
      updateGlobalState({ newReservation: bookingData });
      startDiningAlertLoop(bookingData);
    });

    globalSocket.on('play_notification_sound', (data) => {
      const normalizedData = {
        orderId: data?.orderId || data?.order_id,
        orderMongoId: data?.orderMongoId || data?.order_meta_id || data?.order_mongo_id,
        ...data,
      };
      handleIncomingOrderAlert(normalizedData, 'socket');
    });

    globalSocket.on('order_status_update', (data) => {
      window.dispatchEvent(
        new CustomEvent('restaurantOrderStatusUpdate', {
          detail: data || {},
        }),
      );
      const status = String(data?.orderStatus || data?.status || '').toLowerCase();

      // A Mongo ObjectId is a 24-char hex string — not a human order id, so don't show it.
      const isMongoId = (val) => /^[0-9a-fA-F]{24}$/.test(String(val || '').trim());
      const friendlyOrderId = (() => {
        const candidate = data?.orderId || data?.order_id || '';
        return candidate && !isMongoId(candidate) ? `#${candidate}` : '';
      })();

      // Order accepted — stop popup & sound immediately. Admin accept moves the
      // order straight to "preparing", so treat that (and the acceptedBy flag) as
      // accepted too, otherwise the restaurant popup would not dismiss.
      if (status === 'confirmed' || status === 'accepted' || status === 'preparing' || data?.acceptedBy === 'admin') {
        const orderId = data?.orderMongoId || data?._id || data?.orderId || data?.order_id;
        if (orderId) {
          const cleanId = String(orderId).trim();
          processedOrderIds.add(cleanId);
          globalMutedOrderIds.delete(cleanId);
        }
        stopGlobalAlertLoop();
        updateGlobalState({ newOrder: null, activeOrder: null, mutedOrderIds: new Set(globalMutedOrderIds) });
        // Toast only if admin accepted (not restaurant itself)
        if (data?.acceptedBy === 'admin') {
          toast.success(`Order ${friendlyOrderId} Accepted By Admin`, {
            duration: 6000,
            id: `admin-accepted-${data?.orderId || Date.now()}`,
          });
        }
        dispatchNotificationInboxRefresh();
      }

      if (status === 'cancelled_by_admin') {
        toast.error(`Order ${friendlyOrderId} Rejected By Admin`, {
          duration: 6000,
          id: `admin-rejected-${data?.orderId || Date.now()}`,
        });
        dispatchNotificationInboxRefresh();
      }

      if (status === 'delivered') {
        // Only announce a delivery for an order this restaurant actually tracked as
        // a real order (a valid display id). Guards against stray/stale events that
        // carry only a Mongo id firing a bogus "delivered" toast on new orders.
        if (friendlyOrderId) {
          toast.success(`Order ${friendlyOrderId} delivered successfully!`, {
            description: 'The order has been delivered to the customer.',
            duration: 6000,
            id: `delivered-${data?.orderId || Date.now()}`,
          });
        }
        dispatchNotificationInboxRefresh();
      }
    });

    globalSocket.on('admin_notification', () => {
      dispatchNotificationInboxRefresh();
    });

    return () => {
      // Don't disconnect here to keep active room listeners alive across components
    };
  }, [restaurantId, handleIncomingOrderAlert]);

  // Handle REST polling fallback globally
  useEffect(() => {
    if (!restaurantId) return;
    if (globalPollingIntervalId) return;

    const ALERT_POLL_MS = 8000;

    const pollOrders = async () => {
      try {
        const token = localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken');
        const isAuthPage =
          getAppRoutePath().includes('/login') || getAppRoutePath().includes('/otp') || getAppRoutePath().includes('/signup');

        if (!token || isAuthPage) {
          if (globalActiveOrder) {
            globalActiveOrder = null;
            updateGlobalState({ activeOrder: null });
            stopGlobalAlertLoop();
          }
          return;
        }

        const response = await restaurantAPI.getOrders({ page: 1, limit: 30 });
        const rows = response?.data?.data?.orders || response?.data?.data?.data?.orders || [];

        const confirmed = (rows || [])
          .filter((o) => {
            // Only show alert for orders that are still pending/created (not yet accepted by admin).
            // Rows arrive normalized (backend "created" shows as status "confirmed"),
            // so read the raw backend status.
            const status = String(o?.orderStatus || o?.status || '').toLowerCase();
            if (status !== 'created' && status !== 'pending') return false;
            if (isProcessedOrder(o)) return false;

            if (o.scheduledAt) {
              const scheduledTime = new Date(o.scheduledAt).getTime();
              const now = Date.now();
              // Rings from 30 min before the slot until 30 min after it; a long-past scheduled order that was never
              // accepted must not ring every time the app is opened.
              return scheduledTime <= now + 30 * 60000 && scheduledTime >= now - 30 * 60000;
            }

            // Ignore stale test/bugged orders older than 30 minutes to prevent sound playing repeatedly on login
            const createdAt = new Date(o.createdAt || o.updatedAt || 0).getTime();
            if (!createdAt || Date.now() - createdAt > 30 * 60 * 1000) {
              return false;
            }

            return true;
          })
          .sort((a, b) => {
            const at = a?.updatedAt || a?.createdAt || 0;
            const bt = b?.updatedAt || b?.createdAt || 0;
            return new Date(bt).getTime() - new Date(at).getTime();
          });

        if (confirmed.length > 0) {
          confirmed.slice(0, 5).forEach((o) => {
            const orderId = o.orderMongoId || o.orderId || o._id || o.id;
            const currentOrderId = globalNewOrder?.orderMongoId || globalNewOrder?.orderId || globalNewOrder?._id || globalNewOrder?.id;
            if (String(orderId) !== String(currentOrderId)) {
              handleIncomingOrderAlert(o, 'poll');
            }
          });
        } else {
          // web: once per session the native shell was told to stop a ringtone left over from an earlier order —
          // the app has no separate shell ringtone (the alert below is the only one).
          // If there are NO pending orders, ensure we clear any stale active order that might be playing sound
          if (globalActiveOrder) {
            globalActiveOrder = null;
            updateGlobalState({ activeOrder: null });
            stopGlobalAlertLoop();
          }
        }
      } catch (error) {
        // ignore
      }
    };

    pollOrders();
    globalPollingIntervalId = setInterval(pollOrders, ALERT_POLL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // native addition: a socket that dropped while the app was in the background reconnects now
        if (globalSocket && !globalSocket.connected) {
          try {
            globalSocket.connect();
          } catch (_) {}
        }
        pollOrders();
      }
    };

    if (!globalVisibilityListenerAdded) {
      globalVisibilityListenerAdded = true;
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      // Polling remains alive globally
    };
  }, [restaurantId, handleIncomingOrderAlert]);

  const setMuted = useCallback((nextMuted) => {
    const muted = Boolean(nextMuted);
    updateGlobalState({ isMuted: muted });
    if (muted) {
      stopGlobalAlertLoop();
    } else if (globalActiveOrder) {
      playGlobalNotificationSound(globalActiveOrder);
      startGlobalAlertLoop(globalActiveOrder);
    }
  }, []);

  const clearNewOrder = useCallback((orderOrId) => {
    let targetId = null;
    if (orderOrId) {
      if (typeof orderOrId === 'object') {
        const ids = [
          orderOrId.orderMongoId,
          orderOrId.orderId,
          orderOrId._id,
          orderOrId.id,
          orderOrId.mongoId,
          orderOrId.order_id,
          orderOrId.order_mongo_id,
        ].filter(Boolean);
        ids.forEach((id) => {
          const cleanId = String(id).trim();
          processedOrderIds.add(cleanId);
          globalMutedOrderIds.delete(cleanId);
        });
        targetId = getOrderAlertKey(orderOrId);
      } else {
        targetId = String(orderOrId).trim();
        processedOrderIds.add(targetId);
        globalMutedOrderIds.delete(targetId);
      }
      saveProcessedOrderIds();
      saveMutedOrderIds();
    }
    stopGlobalAlertLoop();
    updateGlobalState({ newOrder: null, activeOrder: null, mutedOrderIds: new Set(globalMutedOrderIds) });
  }, []);

  const muteOrders = useCallback((orderIds) => {
    if (!Array.isArray(orderIds)) return;
    orderIds.forEach((id) => {
      if (id) globalMutedOrderIds.add(String(id).trim());
    });
    saveMutedOrderIds();

    // Stop alarm loop if active order is among the muted ones
    if (globalActiveOrder && isOrderMuted(globalActiveOrder)) {
      stopGlobalAlertLoop();
    }

    updateGlobalState({ mutedOrderIds: new Set(globalMutedOrderIds) });
  }, []);

  const unmuteOrder = useCallback((orderId) => {
    if (!orderId) return;
    const cleanId = String(orderId).trim();
    globalMutedOrderIds.delete(cleanId);
    saveMutedOrderIds();

    // Restart the alert for the active order once it is no longer muted.
    if (globalActiveOrder && !isOrderMuted(globalActiveOrder)) {
      startGlobalAlertLoop(globalActiveOrder);
    }

    updateGlobalState({ mutedOrderIds: new Set(globalMutedOrderIds) });
  }, []);

  const clearNewReservation = useCallback(() => {
    stopDiningAlertLoop();
    updateGlobalState({ newReservation: null });
  }, []);

  return {
    newOrder: localState.newOrder,
    newReservation: localState.newReservation,
    clearNewOrder,
    clearNewReservation,
    isConnected: localState.isConnected,
    isMuted: localState.isMuted,
    setMuted,
    playNotificationSound: playGlobalNotificationSound,
    stopSound: stopGlobalAlertLoop,
    startAlertLoop: startGlobalAlertLoop,
    mutedOrderIds: localState.mutedOrderIds || new Set(),
    muteOrders,
    unmuteOrder,
  };
};
