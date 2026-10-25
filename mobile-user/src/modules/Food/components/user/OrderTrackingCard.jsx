import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { ChevronRight, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Text } from '@/native/ui';
import { alpha, colors, radius, sp } from '@/theme';
import { useOrders } from '@food/context/OrdersContext';
import { useProfile } from '@food/context/ProfileContext';
import { orderAPI } from '@food/api';
import { isModuleAuthenticated } from '@food/utils/auth';

// ---------------------------------------------------------------- cooking animation
function useLoop(duration, delay = 0, easing = Easing.out(Easing.quad)) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop;
    const start = setTimeout(() => {
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }));
      loop.start();
    }, delay);
    return () => {
      clearTimeout(start);
      loop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, duration, delay]);
  return v;
}

function Steam({ delay, rise }) {
  const v = useLoop(1500, delay);
  return (
    <Animated.View
      style={[
        cs.steam,
        {
          opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.8, 0] }),
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, rise[0], rise[1]] }) },
            { scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.2, 1] }) },
          ],
        },
      ]}
    />
  );
}

const CookingAnimation = memo(() => {
  const wobble = useLoop(600, 0, Easing.inOut(Easing.ease));
  const flame = useLoop(600, 0, Easing.inOut(Easing.ease));
  return (
    <View style={cs.box}>
      <View style={cs.steamRow}>
        <Steam delay={0} rise={[-8, -12]} />
        <Steam delay={500} rise={[-10, -15]} />
        <Steam delay={1000} rise={[-8, -12]} />
      </View>
      <Animated.View
        style={{
          marginTop: 4,
          zIndex: 10,
          transform: [{ rotate: wobble.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-2deg', '2deg', '-2deg'] }) }],
        }}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 10h12v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-6z" />
          <Rect x="5" y="8" width="14" height="2" rx="1" />
          <Path d="M12 8V5" />
          <Path d="M11 5h2v2h-2z" fill="#DC2626" />
          <Path d="M19 9l3-1v2l-3 1" fill="#DC2626" strokeWidth={1} />
          <Path d="M5 10H3v2h2" />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          cs.flameRow,
          {
            opacity: flame.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 0.8, 0.4] }),
            transform: [{ scaleX: flame.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.2, 0.8] }) }],
          },
        ]}
      >
        <View style={cs.flame} />
      </Animated.View>
    </View>
  );
});

const cs = StyleSheet.create({
  box: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    backgroundColor: colors.orange[50],
    borderWidth: 1,
    borderColor: colors.orange[100],
    overflow: 'visible',
    flexShrink: 0,
    elevation: 3,
    shadowColor: 'rgb(235,89,14)',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  steamRow: { position: 'absolute', top: -12, flexDirection: 'row', gap: 6 },
  steam: { width: 6, height: 12, borderRadius: 999, backgroundColor: alpha(colors.orange[400], 0.5) },
  flameRow: { position: 'absolute', bottom: 0, width: '100%', alignItems: 'center', zIndex: 0 },
  flame: { width: 16, height: 4, borderRadius: 999, backgroundColor: '#DC2626' },
});

// ---------------------------------------------------------------- order helpers (same as web)
const getOrderKey = (order) => order?.id || order?._id || order?.orderId || null;

const normalizeOrderToken = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

const getOrderStatus = (order) =>
  normalizeOrderToken(order?.orderStatus || order?.status || order?.deliveryState?.status || order?.deliveryStatus || '');

const getOrderPhase = (order) => normalizeOrderToken(order?.deliveryState?.currentPhase || order?.currentPhase || '');

const ACTIVE_PHASES = new Set([
  'created',
  'confirmed',
  'preparing',
  'accepted',
  'ready',
  'ready_for_pickup',
  'reached_pickup',
  'picked_up',
  'out_for_delivery',
  'en_route_to_delivery',
  'at_pickup',
  'at_drop',
  'reached_drop',
]);

const TERMINAL_STATUSES = new Set([
  'delivered',
  'cancelled',
  'canceled',
  'completed',
  'failed',
  'cancelled_by_user',
  'canceled_by_user',
  'cancelled_by_restaurant',
  'canceled_by_restaurant',
  'cancelled_by_admin',
  'canceled_by_admin',
]);

const isActiveOrder = (order) => {
  if (!order) return false;
  const status = getOrderStatus(order);
  const phase = getOrderPhase(order);
  if (TERMINAL_STATUSES.has(status)) return false;
  if (phase === 'completed' || phase === 'delivered') return false;
  if (order.scheduledAt && (status === 'confirmed' || status === 'created' || status === 'pending')) {
    return false;
  }
  if (!status && phase) return ACTIVE_PHASES.has(phase);
  if (!status) return false;
  return true;
};

const parsePrepMinutes = (preparationTime) => {
  if (!preparationTime) return null;
  const num = Number(preparationTime);
  if (Number.isFinite(num) && num > 0) return num;
  const match = String(preparationTime).match(/(\d+)\s*-\s*(\d+)/);
  if (match) return Number(match[2]);
  const single = String(preparationTime).match(/(\d+)/);
  if (single) return Number(single[1]);
  return null;
};

const getTimeRemaining = (order) => {
  if (!order) return null;
  const prepMins = parsePrepMinutes(order.preparationTime);
  if (prepMins && order.acceptedAt) {
    const acceptTime = new Date(order.acceptedAt);
    const targetTime = new Date(acceptTime.getTime() + prepMins * 60000);
    const diff = (targetTime - new Date()) / 60000;
    return Math.ceil(diff);
  }
  const orderTime = new Date(order.scheduledAt || order.createdAt || order.orderDate || order.created_at || order.date || Date.now());
  const isScheduled = !!order.scheduledAt;
  const estimatedMinutes = isScheduled ? 0 : order.estimatedDeliveryTime || order.estimatedTime || order.estimated_delivery_time || 35;
  const deliveryTime = new Date(orderTime.getTime() + estimatedMinutes * 60000);
  return Math.max(0, Math.ceil((deliveryTime - new Date()) / 60000));
};

function ordersFingerprint(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return '';
  return orders.map((o) => `${getOrderKey(o)}:${getOrderStatus(o)}`).join('|');
}

function OrderTrackingCardInner({ hasBottomNav = true }) {
  const navigate = useNavigate();
  const { orders: contextOrders } = useOrders();
  const { orderType } = useProfile();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [apiOrders, setApiOrders] = useState([]);
  const [hasFetchedApi, setHasFetchedApi] = useState(false);
  const [activeOrderOverride, setActiveOrderOverride] = useState(null);
  const lastRefreshRef = useRef(0);
  const lastApiFingerprintRef = useRef('');
  const activeOrderKeyRef = useRef('');
  const activeOrderSnapshotRef = useRef(null);
  const [invalidOrderIds, setInvalidOrderIds] = useState(new Set());
  const verifyingKeysRef = useRef(new Set());
  const lastVerifyTimeRef = useRef({});
  const isFetchingOrdersRef = useRef(false);
  const lastFetchOrdersTimeRef = useRef(0);

  const fetchOrders = useCallback(async () => {
    if (!isModuleAuthenticated('user')) {
      setHasFetchedApi(true);
      return;
    }
    if (isFetchingOrdersRef.current) return;
    const now = Date.now();
    if (now - lastFetchOrdersTimeRef.current < 2000) return;
    isFetchingOrdersRef.current = true;
    try {
      const response = await orderAPI.getOrders({ limit: 10, page: 1 });
      let nextOrders = [];

      if (response?.data?.success && response?.data?.data?.orders) {
        nextOrders = response.data.data.orders;
      } else if (response?.data?.orders) {
        nextOrders = response.data.orders;
      } else if (response?.data?.data?.data && Array.isArray(response.data.data.data)) {
        nextOrders = response.data.data.data;
      } else if (response?.data?.data?.docs && Array.isArray(response.data.data.docs)) {
        nextOrders = response.data.data.docs;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        nextOrders = response.data.data;
      }

      const list = Array.isArray(nextOrders) ? nextOrders : [];
      const fp = ordersFingerprint(list);
      if (fp !== lastApiFingerprintRef.current) {
        lastApiFingerprintRef.current = fp;
        setApiOrders(list);
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        localStorage.removeItem('user_accessToken');
        localStorage.removeItem('accessToken');
      }
      if (lastApiFingerprintRef.current !== '') {
        lastApiFingerprintRef.current = '';
        setApiOrders([]);
      }
    } finally {
      lastFetchOrdersTimeRef.current = Date.now();
      isFetchingOrdersRef.current = false;
      setHasFetchedApi(true);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const uniqueOrders = useMemo(() => {
    const isMongoObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));
    const serverKeys = new Set((apiOrders || []).map((o) => String(getOrderKey(o) || '')).filter(Boolean));
    const seen = new Set();

    return [...apiOrders, ...(contextOrders || [])].filter((order) => {
      const key = getOrderKey(order);
      if (!key || seen.has(key)) return false;
      if (invalidOrderIds.has(key)) return false;
      if (hasFetchedApi && isMongoObjectId(key) && !serverKeys.has(String(key))) return false;
      seen.add(key);
      return true;
    });
  }, [contextOrders, apiOrders, invalidOrderIds, hasFetchedApi]);

  const activeOrder = useMemo(() => {
    const currentTabType = orderType || 'delivery';
    const filteredOrders = uniqueOrders.filter((order) => {
      const type = order?.orderType || 'delivery';
      return type === currentTabType;
    });

    const candidate = filteredOrders.find((order) => isActiveOrder(order)) || null;
    if (!candidate) return null;
    const overrideKey = getOrderKey(activeOrderOverride);
    const candidateKey = getOrderKey(candidate);
    if (overrideKey && candidateKey && overrideKey === candidateKey) return activeOrderOverride;
    return candidate;
  }, [uniqueOrders, activeOrderOverride, orderType]);

  useEffect(() => {
    const key = String(getOrderKey(activeOrder) || '');
    activeOrderKeyRef.current = key;
    activeOrderSnapshotRef.current = activeOrder;
  }, [activeOrder]);

  useEffect(() => {
    const handleOrderStatusNotification = async (event) => {
      const detail = event?.detail || {};
      const incomingKey = String(detail?.orderMongoId || detail?.orderId || '').trim();
      const currentKey = activeOrderKeyRef.current;
      if (!incomingKey || !currentKey) return;
      if (incomingKey !== currentKey) return;

      const snap = activeOrderSnapshotRef.current;

      setActiveOrderOverride((prev) => ({
        ...(prev || snap || {}),
        orderStatus: detail?.orderStatus || prev?.orderStatus || snap?.orderStatus,
        deliveryState: detail?.deliveryState
          ? { ...(prev?.deliveryState || snap?.deliveryState || {}), ...detail.deliveryState }
          : prev?.deliveryState || snap?.deliveryState,
        status: detail?.status || prev?.status || snap?.status,
      }));

      const now = Date.now();
      if (now - lastRefreshRef.current < 1500) return;
      lastRefreshRef.current = now;

      try {
        const response = await orderAPI.getOrderDetails(incomingKey);
        const fresh = response?.data?.data?.order || response?.data?.order || response?.data?.data || null;
        if (fresh) setActiveOrderOverride(fresh);
      } catch (error) {
        if (error?.response?.status === 404 || error?.response?.status === 400) {
          setInvalidOrderIds((prev) => {
            const next = new Set(prev);
            next.add(incomingKey);
            return next;
          });
        }
      }
    };

    const handleOrderPlaced = () => {
      fetchOrders();
    };

    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);
    window.addEventListener('order-placed', handleOrderPlaced);

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);
      window.removeEventListener('order-placed', handleOrderPlaced);
    };
  }, [fetchOrders]);

  useEffect(() => {
    if (!activeOrder) {
      setTimeRemaining((prev) => (prev !== null ? null : prev));
      return undefined;
    }
    const tick = () => {
      const next = getTimeRemaining(activeOrder);
      setTimeRemaining((prev) => (prev === next ? prev : next));
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [activeOrder]);

  useEffect(() => {
    const key = getOrderKey(activeOrder);
    if (!key || invalidOrderIds.has(key)) return;
    const isRecentlyConfirmed = apiOrders.some((o) => getOrderKey(o) === key);
    if (isRecentlyConfirmed) return;
    if (verifyingKeysRef.current.has(key)) return;
    const now = Date.now();
    const lastVerify = lastVerifyTimeRef.current[key] || 0;
    if (now - lastVerify < 8000) return;

    const verifyOrderExists = async () => {
      verifyingKeysRef.current.add(key);
      lastVerifyTimeRef.current[key] = Date.now();
      try {
        await orderAPI.getOrderDetails(key);
      } catch (error) {
        if (error?.response?.status === 404 || error?.response?.status === 400) {
          setInvalidOrderIds((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        }
      } finally {
        verifyingKeysRef.current.delete(key);
      }
    };

    verifyOrderExists();
  }, [activeOrder, apiOrders, invalidOrderIds]);

  const [dismissedKey, setDismissedKey] = useState(null);

  const shouldShow = useMemo(() => {
    if (!activeOrder) return false;
    const currentOrderKey = activeOrder.id || activeOrder._id || activeOrder.orderId;
    if (dismissedKey === currentOrderKey) return false;
    const orderStatus = getOrderStatus(activeOrder) || 'preparing';
    const orderPhase = getOrderPhase(activeOrder);
    if (TERMINAL_STATUSES.has(orderStatus) || orderPhase === 'cancelled' || orderPhase === 'canceled') {
      return false;
    }
    return true;
  }, [activeOrder, dismissedKey]);

  const currentOrderKey = activeOrder ? activeOrder.id || activeOrder._id || activeOrder.orderId : null;

  const restaurantName = useMemo(() => {
    if (!activeOrder) return 'Restaurant';
    return (
      activeOrder.restaurant ||
      activeOrder.restaurantName ||
      activeOrder.restaurantId?.restaurantName ||
      activeOrder.restaurantId?.name ||
      'Restaurant'
    );
  }, [activeOrder]);

  const orderStatus = activeOrder ? getOrderStatus(activeOrder) : 'preparing';
  const orderPhase = activeOrder ? getOrderPhase(activeOrder) : '';

  const isPreparingExpired = useMemo(() => {
    const s = String(orderStatus);
    const isPreparing = s === 'preparing' || s === 'accepted' || s === 'processed';
    return Boolean(isPreparing && activeOrder?.preparationTime && activeOrder?.acceptedAt && timeRemaining !== null && timeRemaining <= 0);
  }, [orderStatus, activeOrder, timeRemaining]);

  const statusText = useMemo(() => {
    if (!activeOrder) return '';
    const s = String(orderStatus);
    const p = String(orderPhase);

    if (s === 'confirmed' || s === 'placed' || s === 'created' || s === 'pending') {
      return 'Waiting for restaurant to accept';
    }
    if (s === 'preparing' || s === 'accepted' || s === 'processed') {
      if (activeOrder?.preparationTime && activeOrder?.acceptedAt && timeRemaining !== null && timeRemaining <= 0) {
        return 'Waiting for restaurant';
      }
      return 'Preparing your order';
    }
    if (s === 'ready_for_pickup' || s === 'ready') return 'Ready for pickup';
    if (s === 'reached_pickup' || p === 'at_pickup') return 'Delivery partner reached restaurant';
    if (s === 'picked_up' || p === 'en_route_to_delivery' || s === 'out_for_delivery') return 'On the way';
    if (s === 'reached_drop' || p === 'at_drop' || s === 'at_drop') return 'Arrived near you';
    if (s === 'delivered' || p === 'delivered' || p === 'completed') return 'Delivered';
    return 'Waiting for restaurant to accept';
  }, [activeOrder, orderStatus, orderPhase, timeRemaining]);

  // AnimatePresence: keep the card mounted while it slides out
  const [rendered, setRendered] = useState(shouldShow ? activeOrder : null);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (shouldShow) {
      setRendered(activeOrder);
      Animated.spring(anim, { toValue: 1, damping: 25, stiffness: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setRendered(null);
      });
    }
  }, [shouldShow, activeOrder, anim]);

  const liveProps = {
    activeOrder,
    currentOrderKey,
    hasBottomNav,
    timeRemaining,
    statusText,
    restaurantName,
    orderStatus,
    orderType,
    isPreparingExpired,
  };
  const lastPropsRef = useRef(liveProps);
  if (shouldShow) lastPropsRef.current = liveProps;

  if (!rendered) return null;

  return <TrackingCardContent anim={anim} {...lastPropsRef.current} setDismissedKey={setDismissedKey} navigate={navigate} />;
}

function Badge({ gradient, borderColor, glow, small, big, singleLine, upperBig }) {
  return (
    <View style={[s.badgeShadow, { shadowColor: glow }]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.badge, { borderColor }, singleLine ? { paddingVertical: sp(2.5) } : null]}
      >
        {singleLine ? (
          <Text style={s.badgeSingle}>{singleLine}</Text>
        ) : (
          <>
            <Text style={[s.badgeSmall, small.color ? { color: small.color } : null]}>{small.text}</Text>
            <Text style={[s.badgeBig, upperBig ? { textTransform: 'uppercase' } : null]}>{big}</Text>
          </>
        )}
      </LinearGradient>
    </View>
  );
}

const TrackingCardContent = memo(
  ({
    anim,
    activeOrder,
    currentOrderKey,
    hasBottomNav,
    timeRemaining,
    statusText,
    restaurantName,
    orderStatus,
    orderType,
    isPreparingExpired,
    setDismissedKey,
    navigate,
  }) => {
    const insets = useSafeAreaInsets();

    const renderBadge = () => {
      const isTakeawayOrDining =
        orderType === 'takeaway' || orderType === 'dining' || activeOrder?.orderType === 'takeaway' || activeOrder?.orderType === 'dining';
      const rawStatus = getOrderStatus(activeOrder);
      const rawPhase = getOrderPhase(activeOrder);
      const isReadyOrder = rawStatus === 'ready' || rawStatus === 'ready_for_pickup' || orderStatus === 'ready' || orderStatus === 'ready_for_pickup';
      const isAccepted = !['created', 'pending', 'confirmed', 'placed', ''].includes(rawStatus);

      if (!isAccepted) {
        return (
          <Badge
            gradient={[colors.amber[500], colors.orange[500]]}
            borderColor={colors.amber[400]}
            glow={colors.orange[500]}
            small={{ text: 'ORDER' }}
            big="placed"
            upperBig
          />
        );
      }
      if (isTakeawayOrDining && isReadyOrder) {
        return <Badge gradient={[colors.green[600], colors.emerald[500]]} borderColor={colors.green[400]} glow={colors.green[600]} singleLine="PICK NOW" />;
      }
      if (isPreparingExpired) {
        return <Badge gradient={['#DC2626', '#D94E0A']} borderColor={colors.orange[200]} glow="#DC2626" small={{ text: 'ORDER' }} big="Preparing" />;
      }
      if (rawStatus === 'reached_drop' || orderStatus === 'reached_drop' || rawPhase === 'at_drop') {
        return (
          <Badge
            gradient={[colors.green[600], colors.emerald[500]]}
            borderColor={colors.green[400]}
            glow={colors.green[600]}
            small={{ text: 'RIDER', color: colors.green[50] }}
            big="Arrived!"
          />
        );
      }
      return (
        <Badge
          gradient={['#DC2626', '#D94E0A']}
          borderColor={colors.orange[200]}
          glow="#DC2626"
          small={{ text: isTakeawayOrDining ? 'READY IN' : 'ARRIVING IN' }}
          big={timeRemaining !== null && timeRemaining > 0 ? `${timeRemaining} min` : '--'}
        />
      );
    };

    return (
      <Animated.View
        pointerEvents="box-none"
        style={[
          s.fixed,
          { bottom: (hasBottomNav ? sp(32) : sp(6)) + insets.bottom },
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }],
          },
        ]}
      >
        <Pressable
          onPress={() => {
            navigate(`/food/user/orders/${activeOrder.id || activeOrder._id || activeOrder.orderId}`);
          }}
          style={s.card}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[alpha(colors.orange[50], 0.5), alpha('#ffffff', 0.4), alpha('#ffffff', 0.8)]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.6, borderRadius: 20 }]}
          />

          <Pressable
            onPress={() => {
              setDismissedKey(currentOrderKey);
            }}
            hitSlop={6}
            style={({ pressed }) => [s.close, pressed ? { backgroundColor: alpha(colors.orange[100], 0.8) } : null]}
          >
            <X size={14} color={colors.orange[400]} />
          </Pressable>

          <View style={s.row}>
            <CookingAnimation />

            <View style={s.textCol}>
              <Text style={s.name} numberOfLines={1}>
                {restaurantName}
              </Text>
              <View style={s.statusRow}>
                <Text style={s.status} numberOfLines={1}>
                  {statusText}
                </Text>
                <ChevronRight size={14} color="#DC2626" />
              </View>
            </View>

            {renderBadge()}
          </View>
        </Pressable>
      </Animated.View>
    );
  },
);

const s = StyleSheet.create({
  fixed: { position: 'absolute', left: sp(4), right: sp(4), zIndex: 40 },
  card: {
    position: 'relative',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: sp(4),
    borderWidth: 1,
    borderColor: alpha(colors.orange[100], 0.6),
    elevation: 8,
    shadowColor: 'rgb(235,89,14)',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
  },
  close: {
    position: 'absolute',
    top: sp(2),
    right: sp(2),
    padding: 6,
    borderRadius: 999,
    backgroundColor: alpha(colors.orange[50], 0.8),
    zIndex: 20,
    elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(4), zIndex: 10, width: '100%' },
  textCol: { flex: 1, minWidth: 0, paddingRight: sp(4) },
  name: { color: colors.gray[900], fontWeight: '700', fontSize: 16, lineHeight: 24, letterSpacing: -0.4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  status: { color: colors.gray[500], fontWeight: '500', fontSize: 12, lineHeight: 16, flexShrink: 1 },
  badgeShadow: { borderRadius: radius.xl, elevation: 6, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, flexShrink: 0 },
  badge: {
    borderRadius: radius.xl,
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeSmall: { color: colors.orange[50], fontSize: 10, lineHeight: 12, fontWeight: '700', letterSpacing: 0.5, opacity: 0.95, marginBottom: 2 },
  badgeBig: { color: colors.white, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  badgeSingle: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 0.6 },
});

const OrderTrackingCard = memo(OrderTrackingCardInner);
export default OrderTrackingCard;
