// Web: pages/restaurant/OrdersMain.jsx — the restaurant home (/food/restaurant, /food/restaurant/orders): crimson navbar,
// live-dish banner / popup, order search, filter chips (All / Preparing / Ready / Out for delivery / Completed /
// Cancelled), Takeaway Orders + Dining Booking buttons, verification / dining-request cards, the order lists (10 s
// polling, ETA countdown, auto "ready" when the prep time is over, Mark ready, Resend to delivery partners, Verify &
// Complete takeaway with the customer OTP), and the new-order popup (queue of socket + polled orders, accept-time
// countdown + auto-reject, slide to accept, prep time, mute, reject reasons) with the alert ring from
// useRestaurantNotifications. Same API calls, states, texts and rules.
// Native:
// - Kept-alive bottom-bar screen (RestaurantTabKeepAlive): no BottomNavOrders here, content ends with
//   useRestaurantNavSpace(); everything the web ran while mounted (polling, the popup queue / countdown / auto-reject,
//   the ring control, window listeners, the onboarding redirect) runs only while useRestaurantTabActive() is true;
//   data is loaded again when the tab is shown again (old data stays on screen meanwhile); pull-to-refresh reloads
//   it with the lists' own "Loading..." state; useTabScrollTop on the content scroll.
// - Leaving the tab closes the popup like the web's unmount did (the order stays queued and shows again, with its
//   countdown recalculated, when the tab is back); the ring is left to the shared hook, as on the web.
// - The popups (new order, reject, cancel, takeaway OTP, order details) are native Modals (Dialog). The takeaway OTP
//   dialog moves above the keyboard (useKeyboardOffset).
// - Slide to accept: a PanResponder on the handle (same 0.45 threshold; a tap on the handle accepts, like the web's
//   click). The web's unused swipe-between-tabs handlers and the unused jsPDF receipt (handlePrint referenced an
//   undefined variable and was never wired to a button) are not carried over.
// - The web's error boundary is kept ("Reload Page" mounts the screen again instead of a page reload).
import React, { Component, memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, Dialog, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { useTabScrollTop, useTabShown } from '@/native/ui/tabShown';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';
import useKeyboardOffset from '@/modules/Taxi/shared/hooks/useKeyboardOffset';
import { hardNavigate } from '@/shared/utils/nativeShell';
import { isMyStorePartner } from '@food/utils/auth';
import { checkOnboardingStatus, isRestaurantOnboardingComplete } from '@food/utils/onboardingUtils';
import { useRestaurantNavSpace } from '@food/components/restaurant/BottomNavOrders';
import { useRestaurantTabActive } from '@food/components/restaurant/restaurantTabPages';
import RestaurantNavbar from '@food/components/restaurant/RestaurantNavbar';
import { LiveDishBanner, LiveDishPopup } from '@food/components/restaurant/LiveDishNotice';
import { restaurantAPI, diningAPI } from '@food/api';
import { useRestaurantNotifications } from '@food/hooks/useRestaurantNotifications';
import ResendNotificationButton from '@food/components/restaurant/ResendNotificationButton';
import {
  getRestaurantItemLineTotal,
  getRestaurantOrderTotal,
  getMenuItemLevelMarkupTotal,
  getOrderMarkupTotal,
  getCustomerFacingOrderTotal,
} from '@food/utils/restaurantOrderPricing';

const debugLog = () => {};
const debugError = () => {};

const BRAND = restaurantTheme.brand;
const BRAND_DARK = restaurantTheme.brandDark;

// Top filter tabs
const filterTabs = [
  { id: 'all', label: 'All' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'out-for-delivery', label: 'Out for delivery' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

// Active statuses come first (group 0), terminal statuses come after (group 1)
const allOrdersStatusGroup = {
  pending: 0,
  confirmed: 0,
  preparing: 0,
  ready: 0,
  out_for_delivery: 0,
  delivered: 1,
  completed: 1,
  picked_up: 1,
  cancelled: 1,
};

// Within active group: lower priority number = higher urgency
const allOrdersStatusPriority = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  delivered: 6,
  completed: 6,
  picked_up: 6,
  cancelled: 7,
};

const getAllOrdersTimestamp = (order) =>
  order?.cancelledAt || order?.deliveredAt || order?.updatedAt || order?.createdAt || new Date().toISOString();

const TERMINAL_STATUSES = new Set(['delivered', 'completed', 'picked_up', 'cancelled']);
const HIDDEN_FROM_ORDERS_TAB = new Set(['cancelled', 'canceled', 'delivered', 'completed', 'picked_up', 'refunded']);

const itemsSummaryOf = (order) =>
  order.items?.map((item) => `${item.quantity}x ${item.name}${item.variantName ? ` (${item.variantName})` : ''}`).join(', ') || 'No items';

const transformOrderForList = (order) => {
  const normalizedStatus = String(order?.status || '').toLowerCase();
  // Filter out cancelled, delivered, refunded, completed orders from front of Orders tab
  if (HIDDEN_FROM_ORDERS_TAB.has(normalizedStatus)) return null;
  const isTerminal = TERMINAL_STATUSES.has(order.status);
  // Dining orders are handled via Dining Booking tab, not the food order list
  if (String(order.orderType || '').toLowerCase() === 'dining') return null;
  return {
    orderId: order.orderId || order._id,
    mongoId: order._id,
    status: order.status || 'pending',
    customerName: order.userId?.name || order.customerName || 'Customer',
    type: order.orderType === 'takeaway' ? 'Takeaway' : order.orderType === 'dining' ? 'Dining' : 'Home Delivery',
    tableOrToken: null,
    timePlaced: new Date(getAllOrdersTimestamp(order)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    eta: null,
    itemsSummary: itemsSummaryOf(order),
    photoUrl: order.items?.[0]?.image || null,
    photoAlt: order.items?.[0]?.name || 'Order',
    paymentMethod: order.paymentMethod || order.payment?.method || null,
    payableTotal: Number(order.pricing?.customerTotal ?? order.pricing?.total ?? order.total ?? 0) || 0,
    deliveryPartnerId: order.deliveryPartnerId || null,
    dispatchStatus: order.dispatch?.status || null,
    preparingTimestamp: order.tracking?.preparing?.timestamp
      ? new Date(order.tracking.preparing.timestamp)
      : order.acceptedAt
        ? new Date(order.acceptedAt)
        : new Date(order.createdAt || Date.now()),
    initialETA: Number(order.preparationTime) > 0 ? Number(order.preparationTime) : null,
    // For active orders: sort by creation time (newest first within same status)
    // For terminal orders: sort by the most recent event (cancelledAt/deliveredAt/updatedAt)
    sortTimestamp: isTerminal ? new Date(getAllOrdersTimestamp(order)).getTime() : new Date(order.createdAt || Date.now()).getTime(),
    restaurantNote: order.restaurantNote || null,
    acceptedAt: order.acceptedAt || null,
  };
};

const sortListOrders = (a, b) => {
  // Group 0 = active orders, Group 1 = terminal (delivered/cancelled)
  const groupA = allOrdersStatusGroup[a.status] ?? 0;
  const groupB = allOrdersStatusGroup[b.status] ?? 0;
  if (groupA !== groupB) return groupA - groupB;
  if (groupA === 0) {
    // Within active orders: sort by status urgency first, then newest created first
    const priorityDiff = (allOrdersStatusPriority[a.status] ?? 999) - (allOrdersStatusPriority[b.status] ?? 999);
    if (priorityDiff !== 0) return priorityDiff;
    return b.sortTimestamp - a.sortTimestamp;
  }
  // Within terminal orders: sort purely by most recent event (newest first)
  return b.sortTimestamp - a.sortTimestamp;
};

const etaFor = (order, currentTime) => {
  const remainingMs = order.initialETA * 60000 - (currentTime - order.preparingTimestamp);
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  return remainingMinutes <= 0 ? '0 mins' : `${remainingMinutes} mins`;
};

// ------------------------------------------------------------------ small native pieces
function BrandFill({ r = 0, horizontal = false, style }) {
  return (
    <LinearGradient
      colors={[BRAND, BRAND_DARK]}
      start={{ x: 0, y: 0 }}
      end={horizontal ? { x: 1, y: 0 } : { x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { borderRadius: r }, style]}
    />
  );
}

function Spin({ size = 16, color = colors.gray[500] }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

// Tailwind animate-pulse
function Pulse({ children, style }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

// Tailwind animate-bounce
function Bounce({ children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>{children}</Animated.View>;
}

// Tailwind animate-ping dot
function PingDot({ color, size = 8 }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
          },
        ]}
      />
    </View>
  );
}

// web: framer-motion entrance fade. App: shown at once (Prince, 27 Oct: the fade read as a blink on every open)
function FadeIn({ children, style }) {
  return <View style={style}>{children}</View>;
}

const CheckMark = ({ size = 12, color = colors.white, width = 3 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>
    <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={width} d="M5 13l4 4L19 7" />
  </Svg>
);

function SectionHeader({ title, right }) {
  return (
    <View style={s.sectionHead}>
      {typeof title === 'string' ? <Text style={s.sectionTitle}>{title}</Text> : title}
      {right}
    </View>
  );
}

function ListLoading({ title }) {
  return (
    <View style={s.listWrap}>
      <SectionHeader title={title} right={<Spin size={16} color={colors.gray[500]} />} />
      <Text style={s.listEmpty}>Loading...</Text>
    </View>
  );
}

function OrderPhoto({ uri, alt, size = 64, small = false }) {
  return (
    <View style={[s.photoBox, { width: size, height: size }]}>
      {uri ? (
        <AppImage src={uri} style={s.fill} contentFit="cover" />
      ) : small ? (
        <View style={[s.fill, s.center, { padding: 4, backgroundColor: colors.slate[50] }]}>
          <Text style={s.photoAltSmall}>{String(alt || '').toUpperCase()}</Text>
        </View>
      ) : (
        <LinearGradient colors={[colors.gray[50], colors.gray[100]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.fill, s.center, { paddingHorizontal: 4 }]}>
          <Text style={s.photoAlt}>{alt}</Text>
        </LinearGradient>
      )}
    </View>
  );
}

const capitalizeWords = (v) => String(v || '').replace(/\b\w/g, (c) => c.toUpperCase());

// ------------------------------------------------------------------ Completed Orders List Component
function CompletedOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const completedOrders = response.data.data.orders.filter((order) => order.status === 'delivered' || order.status === 'completed');

          const transformedOrders = completedOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || 'delivered',
            customerName: order.userId?.name || order.customerName || 'Customer',
            type: order.orderType === 'takeaway' ? 'Takeaway' : order.orderType === 'dining' ? 'Dining' : 'Home Delivery',
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            deliveredAt: order.deliveredAt || order.updatedAt || order.createdAt,
            itemsSummary: itemsSummaryOf(order),
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || 'Order',
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
            payableTotal: Number(order.pricing?.customerTotal ?? order.pricing?.total ?? order.total ?? 0) || 0,
          }));

          transformedOrders.sort((a, b) => new Date(b.deliveredAt) - new Date(a.deliveredAt));

          setOrders(transformedOrders);
          setLoading(false);
        } else {
          setOrders([]);
          setLoading(false);
        }
      } catch (error) {
        if (!isMounted) return;
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError('Error fetching completed orders:', error);
        }
        setOrders([]);
        setLoading(false);
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) return <ListLoading title="Completed orders" />;

  return (
    <View style={s.listWrap}>
      <SectionHeader title="Completed orders" right={<Text style={s.xsGray}>{orders.length} total</Text>} />
      {orders.length === 0 ? (
        <Text style={s.listEmpty}>No completed orders yet</Text>
      ) : (
        <View>
          {orders.map((order) => {
            const deliveredDate = order.deliveredAt
              ? new Date(order.deliveredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'N/A';

            return (
              <View key={order.orderId || order.mongoId} style={s.histCard}>
                <Pressable
                  onPress={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: 'Delivered',
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: deliveredDate,
                      itemsSummary: order.itemsSummary,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  style={s.histRow}
                >
                  <OrderPhoto uri={order.photoUrl} alt={order.photoAlt} />
                  <View style={s.histBody}>
                    <View style={s.rowBetweenStart}>
                      <View style={s.flexShrink}>
                        <Text style={s.histId}>Order #{order.orderId}</Text>
                        <Text style={s.histCustomer}>{capitalizeWords(order.customerName)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[s.histBadge, { borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] }]}>
                          <View style={[s.dot4, { backgroundColor: colors.emerald[500] }]} />
                          <Text style={[s.histBadgeText, { color: colors.emerald[600] }]}>{order.type === 'Takeaway' ? 'Picked Up' : 'Delivered'}</Text>
                        </View>
                        <Text style={s.histDate}>{deliveredDate}</Text>
                      </View>
                    </View>
                    <View style={{ marginTop: sp(2) }}>
                      <Text style={s.histItems} numberOfLines={1}>
                        {order.itemsSummary}
                      </Text>
                    </View>
                    <View style={[s.rowBetweenEnd, { marginTop: sp(2) }]}>
                      <Text style={s.histType}>{order.type}</Text>
                      <View style={s.amountRow}>
                        <Text style={s.histType}>Amount</Text>
                        <Text style={s.histAmount}>₹{order.amount.toFixed(2)}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ Cancelled Orders List Component
function CancelledOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter cancelled orders (both restaurant and user cancelled)
          const cancelledOrders = response.data.data.orders.filter((order) => order.status === 'cancelled');

          const transformedOrders = cancelledOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || 'cancelled',
            customerName: order.userId?.name || order.customerName || 'Customer',
            type: order.orderType === 'takeaway' ? 'Takeaway' : order.orderType === 'dining' ? 'Dining' : 'Home Delivery',
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            cancelledAt: order.cancelledAt || order.updatedAt || order.createdAt,
            cancelledBy: order.cancelledBy || 'unknown',
            cancellationReason: order.cancellationReason || 'No reason provided',
            itemsSummary: itemsSummaryOf(order),
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || 'Order',
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
            payableTotal: Number(order.pricing?.customerTotal ?? order.pricing?.total ?? order.total ?? 0) || 0,
            restaurantNote: order.restaurantNote || null,
          }));

          transformedOrders.sort((a, b) => new Date(b.cancelledAt) - new Date(a.cancelledAt));

          setOrders(transformedOrders);
          setLoading(false);
        } else {
          setOrders([]);
          setLoading(false);
        }
      } catch (error) {
        if (!isMounted) return;
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError('Error fetching cancelled orders:', error);
        }
        setOrders([]);
        setLoading(false);
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) return <ListLoading title="Cancelled orders" />;

  return (
    <View style={s.listWrap}>
      <SectionHeader title="Cancelled orders" right={<Text style={s.xsGray}>{orders.length} total</Text>} />
      {orders.length === 0 ? (
        <Text style={s.listEmpty}>No cancelled orders yet</Text>
      ) : (
        <View>
          {orders.map((order) => {
            const cancelledDate = order.cancelledAt
              ? new Date(order.cancelledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'N/A';

            const cancelledByText =
              order.cancelledBy === 'user' ? 'Cancelled by User' : order.cancelledBy === 'restaurant' ? 'Cancelled by Restaurant' : 'Cancelled';
            const byUser = order.cancelledBy === 'user';

            return (
              <View key={order.orderId || order.mongoId} style={s.histCard}>
                <Pressable
                  onPress={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: 'Cancelled',
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: cancelledDate,
                      itemsSummary: order.itemsSummary,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  style={s.histRow}
                >
                  <OrderPhoto uri={order.photoUrl} alt={order.photoAlt} />
                  <View style={s.histBody}>
                    <View style={s.rowBetweenStart}>
                      <View style={s.flexShrink}>
                        <Text style={s.histId}>Order #{order.orderId}</Text>
                        <Text style={s.histCustomer}>{capitalizeWords(order.customerName)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View
                          style={[
                            s.histBadge,
                            byUser
                              ? { borderColor: restaurantTheme.primaryBorder, backgroundColor: restaurantTheme.primarySoft }
                              : { borderColor: colors.rose[200], backgroundColor: colors.rose[50] },
                          ]}
                        >
                          <View style={[s.dot4, { backgroundColor: byUser ? restaurantTheme.primary : colors.rose[500] }]} />
                          <Text style={[s.histBadgeText, { color: byUser ? restaurantTheme.primary : colors.rose[600] }]}>{cancelledByText}</Text>
                        </View>
                        <Text style={s.histDate}>{cancelledDate}</Text>
                      </View>
                    </View>
                    <View style={{ marginTop: sp(2) }}>
                      <Text style={s.histItems} numberOfLines={1}>
                        {order.itemsSummary}
                      </Text>
                      {order.cancellationReason ? (
                        <Text style={s.histReason} numberOfLines={1}>
                          Reason: {order.cancellationReason}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[s.rowBetweenEnd, { marginTop: sp(2) }]}>
                      <Text style={s.histType}>{order.type}</Text>
                      <View style={s.amountRow}>
                        <Text style={s.histType}>Amount</Text>
                        <Text style={s.histAmount}>₹{order.amount.toFixed(2)}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ Table Bookings List Component
function TableBookings({ active = true }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleStatusUpdate = async (bookingId, newStatus) => {
    try {
      const response = await diningAPI.updateBookingStatusRestaurant(bookingId, newStatus);
      if (response.data.success) {
        setBookings((prev) => prev.map((b) => (b._id === bookingId ? { ...b, status: newStatus } : b)));
        toast.success(`Booking ${newStatus === 'accepted' ? 'accepted' : 'declined'}`);
      }
    } catch (error) {
      debugError('Error updating booking status:', error);
      toast.error('Failed to update booking status');
    }
  };

  useEffect(() => {
    // native: polls only while the Orders tab is on screen (the web screen was unmounted otherwise)
    if (!active) return undefined;
    let isMounted = true;
    let cachedRestaurant = null;

    const fetchBookings = async () => {
      try {
        let restaurant = cachedRestaurant;
        if (!restaurant) {
          const res = await restaurantAPI.getCurrentRestaurant();
          restaurant = res.data?.data?.restaurant || res.data?.restaurant || res.data?.data;
          cachedRestaurant = restaurant;
        }
        const restaurantId = restaurant?._id || restaurant?.id;

        if (restaurantId) {
          const response = await diningAPI.getRestaurantBookings(restaurant);
          if (isMounted && response.data.success) {
            setBookings(response.data.data);
          }
        }
      } catch (error) {
        debugError('Error fetching table bookings:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchBookings();
    const interval = setInterval(fetchBookings, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [active]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await restaurantAPI.getCurrentRestaurant();
      const restaurant = res.data?.data?.restaurant || res.data?.restaurant || res.data?.data;
      const response = await diningAPI.getRestaurantBookings(restaurant);
      if (response.data.success) {
        setBookings(response.data.data);
        toast.success('Bookings refreshed');
      }
    } catch {
      toast.error('Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Text style={s.bookingsLoading}>Loading bookings...</Text>;

  return (
    <View style={[s.listWrap, { paddingHorizontal: 4 }]}>
      <View style={[s.sectionHead, { marginBottom: sp(4), paddingHorizontal: 4 }]}>
        <Text style={s.sectionTitle}>Dining Bookings</Text>
        <View style={s.rowGap3}>
          <Pressable onPress={handleRefresh} hitSlop={6}>
            <Text style={s.refreshLink}>REFRESH</Text>
          </Pressable>
          <Text style={[s.xsGray, { fontWeight: '500' }]}>({bookings.length})</Text>
        </View>
      </View>

      {bookings.length === 0 ? (
        <View style={s.bookingsEmpty}>
          <Text style={{ color: colors.gray[400], fontSize: 14, lineHeight: 20 }}>No dining bookings yet</Text>
        </View>
      ) : (
        <View style={{ gap: sp(3) }}>
          {bookings.map((booking) => {
            const statusConfig = (() => {
              const st = String(booking.status || '').toLowerCase();
              if (st === 'pending') return { color: '#B80B3D', bg: '#FDF2F4', border: '#FBCFE8', text: 'APPROVAL REQ' };
              if (['accepted', 'confirmed'].includes(st)) return { color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0', text: 'CONFIRMED' };
              if (st === 'checked-in') return { color: '#F97316', bg: '#FFF7ED', border: '#FFEDD5', text: 'CHECKED-IN' };
              if (st === 'completed') return { color: '#3B82F6', bg: '#EFF6FF', border: '#DBEAFE', text: 'COMPLETED' };
              // cancelled/rejected/declined
              return { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5', text: 'CANCELLED' };
            })();

            return (
              <View key={booking._id} style={s.bookingCard}>
                <View style={[s.rowBetweenStart, { marginBottom: sp(3) }]}>
                  <View style={s.flex}>
                    <Text style={s.bookingName}>{booking.user?.name}</Text>
                    <Text style={s.bookingPhone}>{booking.user?.phone || 'No phone'}</Text>
                  </View>
                  <View style={[s.bookingStatus, { backgroundColor: statusConfig.bg, borderColor: statusConfig.border }]}>
                    <Text style={[s.bookingStatusText, { color: statusConfig.color }]}>{statusConfig.text}</Text>
                  </View>
                </View>

                <View style={s.bookingMeta}>
                  <View style={s.metaItem}>
                    <Calendar size={14} color={colors.gray[400]} />
                    <Text style={s.metaText}>{new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</Text>
                  </View>
                  <View style={s.metaItem}>
                    <Clock size={14} color={colors.gray[400]} />
                    <Text style={s.metaText}>{booking.timeSlot}</Text>
                  </View>
                  <View style={s.metaItem}>
                    <Users size={14} color={colors.gray[400]} />
                    <Text style={s.metaText}>{booking.guests} Guests</Text>
                  </View>
                </View>

                {booking.specialRequest ? (
                  <View style={s.specialBox}>
                    <View style={{ marginTop: 2 }}>
                      <MessageSquare size={12} color={colors.blue[700]} />
                    </View>
                    <Text style={s.specialText} numberOfLines={2}>
                      {booking.specialRequest}
                    </Text>
                  </View>
                ) : null}

                {String(booking.status || '').toLowerCase() === 'pending' ? (
                  <View style={[s.rowGap2, { marginTop: sp(4) }]}>
                    <Pressable onPress={() => handleStatusUpdate(booking._id, 'accepted')} style={s.bookingAccept}>
                      <BrandFill r={14} />
                      <Text style={s.bookingAcceptText}>ACCEPT</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleStatusUpdate(booking._id, 'cancelled')}
                      style={({ pressed }) => [s.bookingDecline, pressed && { backgroundColor: colors.slate[50] }]}
                    >
                      <Text style={s.bookingDeclineText}>DECLINE</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ All orders / Takeaway orders
function useActiveOrdersList({ refreshToken, active, takeawayOnly, label }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});

  useEffect(() => {
    // native: the 10 s poll + countdown run only while the Orders tab is on screen
    if (!active) return undefined;
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();
        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const transformedOrders = response.data.data.orders
            .filter((o) => !takeawayOnly || String(o.orderType || '').toLowerCase() === 'takeaway')
            .map(transformOrderForList)
            .filter(Boolean)
            .sort(sortListOrders);
          setOrders(transformedOrders);
        } else {
          setOrders([]);
        }
      } catch (error) {
        if (!isMounted) return;
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404 && error.response?.status !== 401) {
          debugError(`Error fetching ${label}:`, error);
        }
        setOrders([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    const intervalId = setInterval(fetchOrders, 10000);

    const handleVisibility = () => {
      if (!document.hidden) {
        fetchOrders();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const countdownIntervalId = setInterval(() => {
      if (isMounted) setCurrentTime(new Date());
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      clearInterval(countdownIntervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshToken, active, takeawayOnly, label]);

  const handleMarkReady = async ({ orderId, mongoId }) => {
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) =>
        prev.map((order) => ((order.mongoId || order.orderId) === orderKey ? { ...order, status: 'ready', eta: null, sortTimestamp: Date.now() } : order)),
      );
      toast.success('Order marked as ready');
    } catch (error) {
      debugError('Error marking order as ready:', error);
      toast.error(error.response?.data?.message || 'Failed to mark order as ready');
    } finally {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: false }));
    }
  };

  return { orders, loading, currentTime, markingReadyOrderIds, handleMarkReady };
}

function renderActiveOrderCards(list, { onSelectOrder, onCancel, onVerifyTakeaway }) {
  const { orders, currentTime, markingReadyOrderIds, handleMarkReady } = list;
  return orders.map((order) => {
    const normalizedStatus = String(order.status || '').toLowerCase();
    let etaDisplay = order.eta;
    if (normalizedStatus === 'preparing' && order.preparingTimestamp && order.initialETA > 0) {
      etaDisplay = etaFor(order, currentTime);
    }
    return (
      <OrderCard
        key={order.orderId || order.mongoId}
        {...order}
        eta={etaDisplay}
        onSelect={onSelectOrder}
        onCancel={normalizedStatus === 'preparing' ? onCancel : undefined}
        onMarkReady={normalizedStatus === 'preparing' ? handleMarkReady : undefined}
        isMarkingReady={Boolean(markingReadyOrderIds[order.mongoId || order.orderId])}
        onVerifyTakeaway={onVerifyTakeaway}
      />
    );
  });
}

function AllOrders({ onSelectOrder, onCancel, onVerifyTakeaway, refreshToken = 0, active = true }) {
  const navigate = useNavigate();
  const list = useActiveOrdersList({ refreshToken, active, takeawayOnly: false, label: 'all orders' });

  if (list.loading) return <ListLoading title="All orders" />;

  return (
    <View style={s.listWrap}>
      <SectionHeader
        title={
          <View style={s.rowGap2}>
            <Text style={s.sectionTitle}>All orders</Text>
            <Text style={s.xsGray}>({list.orders.length})</Text>
          </View>
        }
        right={
          <Pressable onPress={() => navigate('/food/restaurant/orders/all', { state: { from: '/food/restaurant' } })} hitSlop={8} style={s.rowGap1}>
            <Text style={s.historyLink}>Full History</Text>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={BRAND}>
              <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
            </Svg>
          </Pressable>
        }
      />
      {list.orders.length === 0 ? (
        <Text style={s.listEmpty}>No orders found</Text>
      ) : (
        <View>{renderActiveOrderCards(list, { onSelectOrder, onCancel, onVerifyTakeaway })}</View>
      )}
    </View>
  );
}

// Takeaway Orders Component — same data as AllOrders but filtered to Takeaway type only
function TakeawayOrders({ onSelectOrder, onCancel, onVerifyTakeaway, refreshToken = 0, active = true }) {
  const list = useActiveOrdersList({ refreshToken, active, takeawayOnly: true, label: 'takeaway orders' });

  if (list.loading) return <ListLoading title="Takeaway orders" />;

  return (
    <View style={s.listWrap}>
      <SectionHeader
        title={
          <View style={s.rowGap2}>
            <Text style={s.sectionTitle}>Takeaway orders</Text>
            <Text style={s.xsGray}>({list.orders.length})</Text>
          </View>
        }
      />
      {list.orders.length === 0 ? (
        <Text style={s.listEmpty}>No takeaway orders found</Text>
      ) : (
        <View>{renderActiveOrderCards(list, { onSelectOrder, onCancel, onVerifyTakeaway })}</View>
      )}
    </View>
  );
}

// Search Results Component
function SearchResults({ query, results, isLoading, onSelectOrder, onVerifyTakeaway }) {
  if (isLoading) {
    return (
      <View style={s.searching}>
        <View style={{ marginBottom: sp(4) }}>
          <Spin size={32} color={restaurantTheme.primary} />
        </View>
        <Text style={{ color: colors.gray[500], fontSize: 14, lineHeight: 20 }}>Searching for &quot;{query}&quot;...</Text>
      </View>
    );
  }

  // web: transformOrderForList can return null for hidden statuses; the web then crashed on the spread — keep the
  // rows the web could show
  const transformedResults = (results || []).map(transformOrderForList).filter(Boolean);

  return (
    <View style={s.listWrap}>
      <View style={[s.rowGap2, { marginBottom: sp(4), flexWrap: 'wrap' }]}>
        <Text style={s.sectionTitle}>Search results for</Text>
        <View style={s.queryPill}>
          <Text style={s.queryText}>&quot;{query}&quot;</Text>
        </View>
        <Text style={[s.xsGray, { fontWeight: '500', marginLeft: 4 }]}>({transformedResults.length})</Text>
      </View>

      {transformedResults.length === 0 ? (
        <View style={s.noResults}>
          <View style={s.noResultsIcon}>
            <Search size={32} color={colors.gray[300]} />
          </View>
          <Text style={s.noResultsTitle}>No results found</Text>
          <Text style={[s.xsGray, { textAlign: 'center' }]}>Try searching for a different order ID or customer name</Text>
        </View>
      ) : (
        <View style={{ gap: sp(3) }}>
          {transformedResults.map((order) => (
            <OrderCard key={order.orderId || order.mongoId} {...order} onSelect={onSelectOrder} onVerifyTakeaway={onVerifyTakeaway} />
          ))}
        </View>
      )}
    </View>
  );
}

// Helper to calculate initial countdown based on order creation time
const isTakeawayOrder = (order) => String(order?.orderType || order?.type || '').toLowerCase() === 'takeaway';

const resolveAcceptOrderTimeoutSeconds = (order, deliveryTimeoutSeconds, takeawayTimeoutSeconds) => {
  if (isTakeawayOrder(order)) return takeawayTimeoutSeconds;
  return deliveryTimeoutSeconds;
};

const getInitialCountdown = (order, timeoutSeconds) => {
  if (!timeoutSeconds || timeoutSeconds <= 0) return 0;
  if (!order?.createdAt) return timeoutSeconds;
  const now = Date.now();
  const created = new Date(order.createdAt).getTime();
  const diffInSeconds = Math.floor((now - created) / 1000);
  const remaining = timeoutSeconds - diffInSeconds;
  return Math.max(0, Math.min(timeoutSeconds, remaining));
};

class OrdersErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, stack: '', componentStack: '', resetKey: 0 };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[OrdersMain] Render error:', error, info);
    this.setState({ stack: error?.stack || '', componentStack: info?.componentStack || '' });
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || 'Unknown error';
      const stack = this.state.stack || '';
      const comp = this.state.componentStack || '';
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16 }}>
          <Text style={{ color: '#B80B3D', fontWeight: '700', marginBottom: 8, fontSize: 16 }}>Something went wrong</Text>
          <Text style={{ fontSize: 12, color: '#B80B3D', fontWeight: '600', marginBottom: 8 }}>{msg}</Text>
          {stack ? (
            <Text style={{ fontSize: 9, color: '#555', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 6, marginBottom: 8 }}>{stack.slice(0, 800)}</Text>
          ) : null}
          {comp ? (
            <Text style={{ fontSize: 9, color: '#777', backgroundColor: '#fafafa', padding: 8, borderRadius: 6, marginBottom: 12 }}>{comp.slice(0, 400)}</Text>
          ) : null}
          <Pressable
            onPress={() => this.setState((st) => ({ hasError: false, error: null, stack: '', componentStack: '', resetKey: st.resetKey + 1 }))}
            style={{ alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#B80B3D', borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Reload Page</Text>
          </Pressable>
        </ScrollView>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

const rejectReasons = ['Restaurant is too busy', 'Item not available', 'Outside delivery area', 'Kitchen closing soon', 'Technical issue', 'Other reason'];

const resolveOrderActionId = (orderLike) => {
  const raw = orderLike?.orderMongoId || orderLike?._id || orderLike?.orderId || orderLike?.order_id || orderLike?.id;
  const value = raw == null ? '' : String(raw).trim();
  return value || null;
};

const normalizeOrderStatusValue = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');

const isUserCancelledStatus = (statusValue) => normalizeOrderStatusValue(statusValue) === 'cancelled_by_user';

const isAnyCancelledStatus = (statusValue) => {
  const normalized = normalizeOrderStatusValue(statusValue);
  return normalized === 'cancelled' || normalized === 'cancelled_by_user' || normalized === 'cancelled_by_restaurant' || normalized === 'cancelled_by_admin';
};

const getPopupOrderTotal = getRestaurantOrderTotal;
const getRestaurantItemAmount = getRestaurantItemLineTotal;

// Format countdown time
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

function OrdersMainInner() {
  const navigate = useNavigate();
  const tabActive = useRestaurantTabActive();
  const tabShown = useTabShown();
  const tabActiveRef = useRef(tabActive);
  tabActiveRef.current = tabActive;
  const navSpace = useRestaurantNavSpace();
  const kbOffset = useKeyboardOffset();
  const { height: winH } = useWindowDimensions();

  // Data the web loaded on mount is loaded again each time the tab is shown again (counted during render so the
  // lists see the new value in the same render as `active`).
  const activationRef = useRef({ prev: tabActive, count: 0 });
  if (tabActive && !activationRef.current.prev) activationRef.current.count += 1;
  activationRef.current.prev = tabActive;
  const activationCount = activationRef.current.count;

  // Restaurant notifications hook for real-time orders
  const { newOrder, clearNewOrder, stopSound, startAlertLoop, mutedOrderIds = new Set(), muteOrders, unmuteOrder } = useRestaurantNotifications();
  const [activeFilter, setActiveFilter] = useState('all');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const contentRef = useRef(null);
  const filterBarRef = useRef(null);
  const filterTabLayouts = useRef({});
  const filterBarWidth = useRef(0);
  useTabScrollTop(contentRef);

  // Pull to refresh (native)
  const [refreshing, setRefreshing] = useState(false);
  const [pullTick, setPullTick] = useState(0);

  // New order popup states
  const [showNewOrderPopup, setShowNewOrderPopup] = useState(false);
  const [popupOrder, setPopupOrder] = useState(null); // Store order for popup (from Socket.IO or API)
  const [prepTime, setPrepTime] = useState(11);
  const [deliveryAcceptOrderTimeoutSeconds, setDeliveryAcceptOrderTimeoutSeconds] = useState(null);
  const [takeawayAcceptOrderTimeoutSeconds, setTakeawayAcceptOrderTimeoutSeconds] = useState(null);
  const deliveryAcceptOrderTimeoutSecondsRef = useRef(null);
  const takeawayAcceptOrderTimeoutSecondsRef = useRef(null);
  const [countdown, setCountdown] = useState(0);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejectingOrder, setIsRejectingOrder] = useState(false);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [acceptSwipeProgress, setAcceptSwipeProgress] = useState(0);
  const acceptSwipeProgressRef = useRef(0);
  const [orderQueue, setOrderQueue] = useState([]);
  const orderQueueRef = useRef([]);
  const autoRejectInitiatedRef = useRef(false);

  const setSwipeProgress = useCallback((v) => {
    acceptSwipeProgressRef.current = v;
    setAcceptSwipeProgress(v);
  }, []);

  useEffect(() => {
    orderQueueRef.current = orderQueue;
  }, [orderQueue]);

  useEffect(() => {
    deliveryAcceptOrderTimeoutSecondsRef.current = deliveryAcceptOrderTimeoutSeconds;
  }, [deliveryAcceptOrderTimeoutSeconds]);

  useEffect(() => {
    takeawayAcceptOrderTimeoutSecondsRef.current = takeawayAcceptOrderTimeoutSeconds;
  }, [takeawayAcceptOrderTimeoutSeconds]);

  useEffect(() => {
    if (!tabActive) return undefined;
    let cancelled = false;

    const loadRestaurantSettings = async () => {
      try {
        const res = await restaurantAPI.getRestaurantSettings();
        const data = res?.data?.data || {};
        const deliveryMinutes = Number(data.deliveryAcceptOrderTimeMinutes);
        const takeawayMinutes = Number(data.takeawayAcceptOrderTimeMinutes);

        if (!cancelled) {
          if (Number.isFinite(deliveryMinutes) && deliveryMinutes >= 1 && deliveryMinutes <= 60) {
            setDeliveryAcceptOrderTimeoutSeconds(Math.round(deliveryMinutes) * 60);
          } else {
            setDeliveryAcceptOrderTimeoutSeconds(null);
          }

          if (Number.isFinite(takeawayMinutes) && takeawayMinutes >= 1 && takeawayMinutes <= 60) {
            setTakeawayAcceptOrderTimeoutSeconds(Math.round(takeawayMinutes) * 60);
          } else {
            setTakeawayAcceptOrderTimeoutSeconds(null);
          }
        }
      } catch (error) {
        debugError('Failed to load restaurant accept order time:', error);
      }
    };

    loadRestaurantSettings();
    const refreshInterval = setInterval(loadRestaurantSettings, 30000);
    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, [tabActive, pullTick]);

  // Keep refs in sync to avoid stale state inside one-time event handlers.
  const showNewOrderPopupRef = useRef(showNewOrderPopup);
  useEffect(() => {
    showNewOrderPopupRef.current = showNewOrderPopup;
  }, [showNewOrderPopup]);

  // Native: leaving the tab closes the popups like the web's unmount did; the order stays in the queue and is shown
  // again (countdown recalculated from createdAt) when the tab is back.
  useEffect(() => {
    if (tabActive) return;
    setShowRejectPopup(false);
    setRejectReason('');
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    setShowCancelPopup(false);
    setOrderToCancel(null);
    setCancelReason('');
    setShowVerifyTakeawayPopup(false);
    setVerifyingOrder(null);
    setTakeawayOtpInput('');
    setIsSheetOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive]);

  // Manage displaying the next order from the queue with a slight delay
  useEffect(() => {
    if (!tabActive) return undefined;
    if (!showNewOrderPopup && orderQueue.length > 0 && !showRejectPopup) {
      const timer = setTimeout(() => {
        if (tabActiveRef.current && !showNewOrderPopupRef.current && orderQueueRef.current.length > 0 && !showRejectPopup) {
          const nextOrder = orderQueueRef.current[0];
          const activeTimeout = resolveAcceptOrderTimeoutSeconds(nextOrder, deliveryAcceptOrderTimeoutSecondsRef.current, takeawayAcceptOrderTimeoutSecondsRef.current);
          // No admin accept-time set → still show the popup, just without the
          // countdown/auto-reject (the old early return hid every new order).
          setPopupOrder(nextOrder);
          setShowNewOrderPopup(true);
          setCountdown(getInitialCountdown(nextOrder, activeTimeout));
        }
      }, 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [tabActive, orderQueue, showNewOrderPopup, showRejectPopup, deliveryAcceptOrderTimeoutSeconds, takeawayAcceptOrderTimeoutSeconds]);

  // Trigger sound alert when any unmuted order exists in active popup or queue
  // (native: only while the tab is on screen — elsewhere the shared hook keeps ringing, like the web after unmount)
  useEffect(() => {
    if (!tabActive) return;
    if (!showNewOrderPopup) {
      if (stopSound) stopSound();
      return;
    }

    const activeOrder = popupOrder || newOrder;
    const activeId = resolveOrderActionId(activeOrder);

    let soundingOrder = null;
    if (activeOrder && activeId && !mutedOrderIds.has(activeId)) {
      soundingOrder = activeOrder;
    } else {
      // Find first unmuted order in queue
      for (const order of orderQueue) {
        const oid = resolveOrderActionId(order);
        if (oid && !mutedOrderIds.has(oid)) {
          soundingOrder = order;
          break;
        }
      }
    }

    if (soundingOrder) {
      if (startAlertLoop) startAlertLoop(soundingOrder);
    } else if (stopSound) {
      stopSound();
    }
  }, [tabActive, showNewOrderPopup, popupOrder, newOrder, orderQueue, mutedOrderIds, startAlertLoop, stopSound]);

  // Takeaway OTP verification states
  const [showVerifyTakeawayPopup, setShowVerifyTakeawayPopup] = useState(false);
  const [verifyingOrder, setVerifyingOrder] = useState(null);
  const [takeawayOtpInput, setTakeawayOtpInput] = useState('');
  const [isSubmittingVerifyTakeaway, setIsSubmittingVerifyTakeaway] = useState(false);
  const otpInputRef = useRef(null);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const isAcceptingOrderRef = useRef(false);
  isAcceptingOrderRef.current = isAcceptingOrder;
  const shownOrdersRef = useRef(new Set()); // Track orders already shown in popup
  const acceptSliderWidthRef = useRef(320);
  const [acceptSliderWidth, setAcceptSliderWidth] = useState(320);
  const acceptSwipeActiveRef = useRef(false);
  const acceptTriggeredRef = useRef(false);
  const [restaurantStatus, setRestaurantStatus] = useState({
    isActive: null,
    rejectionReason: null,
    onboarding: null,
    isLoading: true,
  });
  const [isReverifying, setIsReverifying] = useState(false);

  // Pending counts for tabs
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [activeTakeawayCount, setActiveTakeawayCount] = useState(0);
  const [pendingDiningRequest, setPendingDiningRequest] = useState(null);

  // Fetch pending counts and settings
  useEffect(() => {
    if (!tabActive) return undefined;
    const fetchCounts = async () => {
      try {
        // Fetch current restaurant data
        const resRes = await restaurantAPI.getCurrentRestaurant();
        const restaurantData = resRes.data?.data?.restaurant || resRes.data?.restaurant || resRes.data?.data;

        if (restaurantData?._id || restaurantData?.id) {
          // 1. Fetch bookings
          const res = await diningAPI.getRestaurantBookings(restaurantData);
          if (res.data.success) {
            const bookings = Array.isArray(res.data.data) ? res.data.data : [];
            const pending = bookings.filter((b) => String(b.status).toLowerCase() === 'pending').length;

            // If new pending booking found, maybe show toast
            if (pending > pendingBookingsCount) {
              toast.info(`New dining booking request! Check the "Dining Booking" tab.`);
            }
            setPendingBookingsCount(pending);
          }

          // 2. Fetch pending dining request (for restaurant's own request to enable/update dining)
          const requestRes = await restaurantAPI.getPendingDiningRequest();
          if (requestRes.data.success && requestRes.data.data) {
            setPendingDiningRequest(requestRes.data.data);
          } else {
            setPendingDiningRequest(null);
          }
        }

        // 3. Fetch pending orders
        const ordersRes = await restaurantAPI.getOrders({ page: 1, limit: 100 });
        if (ordersRes.data.success) {
          const orders = Array.isArray(ordersRes.data.data?.orders) ? ordersRes.data.data.orders : [];
          const pending = orders.filter(
            (o) => String(o.status).toLowerCase() === 'pending' || String(o.status).toLowerCase() === 'created' || String(o.status).toLowerCase() === 'confirmed',
          ).length;
          setPendingOrdersCount(pending);

          // Count active (non-terminal) takeaway orders for the button badge
          const activeStatuses = new Set(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'created']);
          const takeawayActive = orders.filter(
            (o) => String(o.orderType || '').toLowerCase() === 'takeaway' && activeStatuses.has(String(o.status || o.orderStatus || '').toLowerCase()),
          ).length;
          setActiveTakeawayCount(takeawayActive);
        }
      } catch (error) {
        // Non-blocking
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, pullTick]);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Global search listener (native: only while this tab is on screen — the Inventory tab's navbar stays mounted too)
  useEffect(() => {
    if (!tabActive) return undefined;
    const handleSearch = (event) => {
      const { query, results, isLoading } = event.detail;
      setSearchQuery(query || '');
      setSearchResults(results || []);
      setIsSearching(isLoading || false);
    };

    window.addEventListener('restaurantSearchUpdated', handleSearch);
    return () => window.removeEventListener('restaurantSearchUpdated', handleSearch);
  }, [tabActive]);

  const markOrderAsShown = (orderLike) => {
    const keys = [orderLike?.orderMongoId, orderLike?.orderId, orderLike?._id, orderLike?.id].map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
    for (const k of keys) shownOrdersRef.current.add(k);
  };

  const hasOrderBeenShown = (orderLike) => {
    const keys = [orderLike?.orderMongoId, orderLike?.orderId, orderLike?._id, orderLike?.id].map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
    return keys.some((k) => shownOrdersRef.current.has(k));
  };

  const lastOrderToastRef = useRef({ key: '', at: 0 });

  // Mobile error logging — only async rejections (safe, fires outside render)
  useEffect(() => {
    if (!tabActive) return undefined;
    const handleRejection = (event) => {
      const reason = event?.reason?.message || String(event?.reason || 'Promise rejected');
      console.error('[OrdersMain] unhandledrejection:', event?.reason);
      setTimeout(() => {
        toast.error(`[Async Error] ${reason}`, { duration: 10000, id: 'async-error' });
      }, 100);
    };
    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, [tabActive]);

  // Fetch restaurant verification status
  const fetchRestaurantStatusRef = useRef(null);
  useEffect(() => {
    if (!tabActive) return undefined;
    const fetchRestaurantStatus = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        const restaurant = response?.data?.data?.restaurant || response?.data?.restaurant;

        if (restaurant) {
          setRestaurantStatus({
            isActive: restaurant.isActive,
            rejectionReason: restaurant.rejectionReason || null,
            onboarding: restaurant.onboarding || null,
            isLoading: false,
          });

          // Check if onboarding is incomplete and redirect if needed
          // isRestaurantOnboardingComplete now handles 'pending' and existing restaurant IDs
          if (!isRestaurantOnboardingComplete(restaurant)) {
            const incompleteStep = await checkOnboardingStatus();

            // native: no navigation while the tab is hidden
            if (incompleteStep && tabActiveRef.current) {
              navigate(`/food/restaurant/onboarding?step=${incompleteStep}`, {
                replace: true,
              });
              return;
            }
          }
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError('Error fetching restaurant status:', error);
        }
        // Set loading to false so UI doesn't stay in loading state
        setRestaurantStatus((prev) => ({ ...prev, isLoading: false }));
      }
    };
    fetchRestaurantStatusRef.current = fetchRestaurantStatus;

    fetchRestaurantStatus();

    // Listen for restaurant profile updates
    const handleProfileRefresh = () => {
      fetchRestaurantStatus();
    };

    window.addEventListener('restaurantProfileRefresh', handleProfileRefresh);

    return () => {
      window.removeEventListener('restaurantProfileRefresh', handleProfileRefresh);
    };
  }, [navigate, tabActive, pullTick]);

  // Handle reverify (resubmit for approval)
  const handleReverify = async () => {
    try {
      setIsReverifying(true);
      await restaurantAPI.reverify();

      // Refresh restaurant status
      const response = await restaurantAPI.getCurrentRestaurant();
      const restaurant = response?.data?.data?.restaurant || response?.data?.restaurant;
      if (restaurant) {
        setRestaurantStatus({
          isActive: restaurant.isActive,
          rejectionReason: restaurant.rejectionReason || null,
          onboarding: restaurant.onboarding || null,
          isLoading: false,
        });
      }

      // Trigger profile refresh event
      window.dispatchEvent(new Event('restaurantProfileRefresh'));

      alert('Restaurant reverified successfully! Verification will be done in 24 hours.');
    } catch (error) {
      // Don't log network/timeout errors (backend might be down)
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
        debugError('Error reverifying restaurant:', error);
      }

      // Handle 401 Unauthorized errors (token expired/invalid)
      if (error.response?.status === 401) {
        const errorMessage = error.response?.data?.message || 'Your session has expired. Please login again.';
        alert(errorMessage);
        // The axios interceptor should handle redirecting to login
        // But if it doesn't, we can manually redirect
        if (!error.response?.data?.message?.includes('inactive')) {
          // Only redirect if it's not an "inactive" error (which we handle differently)
          setTimeout(() => {
            hardNavigate('/food/restaurant/login', { replace: false });
          }, 1500);
        }
      } else {
        // Other errors (400, 500, etc.)
        const errorMessage = error.response?.data?.message || 'Failed to reverify restaurant. Please try again.';
        alert(errorMessage);
      }
    } finally {
      setIsReverifying(false);
    }
  };

  const [ordersRefreshToken, setOrdersRefreshToken] = useState(0);
  const requestOrdersRefresh = () => setOrdersRefreshToken((t) => t + 1);
  // the lists reload on a parent request and each time the tab is shown again
  const listRefreshToken = `${ordersRefreshToken}:${activationCount}`;

  // Show new order popup when real order notification arrives from Socket.IO
  useEffect(() => {
    if (newOrder) {
      debugLog('New order received via Socket.IO:', newOrder);

      if (isAnyCancelledStatus(newOrder?.status || newOrder?.orderStatus)) {
        const cancelledId = resolveOrderActionId(newOrder);
        setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== cancelledId));
        clearNewOrder(cancelledId);
        return;
      }

      if (!hasOrderBeenShown(newOrder)) {
        markOrderAsShown(newOrder);
        const newId = resolveOrderActionId(newOrder);
        setOrderQueue((prev) => {
          const exists = prev.some((o) => resolveOrderActionId(o) === newId);
          if (!exists) {
            return [...prev, newOrder];
          }
          return prev;
        });
        requestOrdersRefresh();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOrder]);

  useEffect(() => {
    const onRestaurantOrderStatusUpdate = (event) => {
      const payload = event?.detail || {};
      const payloadStatus = payload?.orderStatus || payload?.status;
      const normalizedPayloadStatus = normalizeOrderStatusValue(payloadStatus);
      // Admin accept moves the order straight to "preparing", so rely on the
      // acceptedBy flag (any status) rather than a specific status value.
      const isAdminAccepted = payload?.acceptedBy === 'admin';

      if (!isAnyCancelledStatus(payloadStatus) && !isAdminAccepted) return;

      const activeOrder = popupOrder || newOrder;
      if (!activeOrder) return;

      const activeIds = [activeOrder?.orderMongoId, activeOrder?.orderId, activeOrder?._id, activeOrder?.id].map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
      const payloadIds = [payload?.orderMongoId, payload?.orderId, payload?._id, payload?.id].map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);

      const isSameOrder = payloadIds.some((id) => activeIds.includes(id));
      if (!isSameOrder) {
        const cancelledId = payload?.orderMongoId || payload?.orderId || payload?._id || payload?.id;
        if (cancelledId) {
          setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== cancelledId));
        }
        return;
      }

      const cancelledStatus = normalizedPayloadStatus;
      const toastKey = `${payload?.orderMongoId || payload?.orderId || payload?._id || payload?.id || activeOrder?.orderMongoId || activeOrder?.orderId || activeOrder?._id || activeOrder?.id || 'unknown'}:${cancelledStatus}`;
      const now = Date.now();
      if (lastOrderToastRef.current.key === toastKey && now - lastOrderToastRef.current.at < 5000) {
        return;
      }
      lastOrderToastRef.current = { key: toastKey, at: now };

      setShowRejectPopup(false);

      const targetId = payload?.orderMongoId || payload?.orderId || payload?._id || payload?.id;

      if (isAdminAccepted) {
        // Admin already accepted this order — close the popup entirely instead of showing it as cancelled.
        setShowNewOrderPopup(false);
        setPopupOrder(null);
      } else {
        setPopupOrder((prev) => {
          const base = prev || activeOrder || {};
          return { ...base, status: cancelledStatus, orderStatus: cancelledStatus };
        });
      }

      if (targetId) {
        setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== targetId));
      }
      clearNewOrder();
    };

    window.addEventListener('restaurantOrderStatusUpdate', onRestaurantOrderStatusUpdate);
    return () => window.removeEventListener('restaurantOrderStatusUpdate', onRestaurantOrderStatusUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupOrder, newOrder]);

  const activePopupOrder = popupOrder || newOrder;
  const activePopupOrderId = resolveOrderActionId(activePopupOrder);
  const isCurrentOrderMuted = activePopupOrderId ? mutedOrderIds.has(activePopupOrderId) : false;

  // Check for confirmed orders that haven't been shown in popup yet
  useEffect(() => {
    if (!tabActive) return undefined;
    const checkOrdersToPopup = async () => {
      try {
        const response = await restaurantAPI.getOrders();
        if (response.data?.success && response.data.data?.orders) {
          const targetOrders = response.data.data.orders.filter((order) => {
            if (hasOrderBeenShown(order)) return false;

            const orderId = order.orderMongoId || order._id || order.orderId;
            const inQueue = orderQueueRef.current.some((o) => resolveOrderActionId(o) === String(orderId));
            if (inQueue) return false;

            // New orders are saved as "created" and wait here for accept/reject.
            // getOrders() rewrites `status` ("created" -> "confirmed", and anything
            // unknown -> "confirmed"), so read the raw backend orderStatus.
            const status = String(order.orderStatus || order.status || '').toLowerCase();
            if (status !== 'created' && status !== 'pending') return false;

            const now = Date.now();
            if (order.scheduledAt) {
              return new Date(order.scheduledAt).getTime() <= now + 30 * 60000;
            }
            // Skip stale leftovers so a login doesn't pop (and ring for) old orders.
            const createdAt = new Date(order.createdAt || 0).getTime();
            return Boolean(createdAt) && now - createdAt <= 30 * 60000;
          });

          // Queue all matching orders
          if (targetOrders.length > 0) {
            const newQueueItems = [];
            for (const orderToPopup of targetOrders) {
              const orderMongoId = orderToPopup.orderMongoId || orderToPopup._id;
              markOrderAsShown({ orderId: orderToPopup.orderId, orderMongoId, _id: orderToPopup._id });

              // Same restaurant-facing shape the socket sends, so the popup
              // shows customer, bill and notes exactly as for a live order.
              newQueueItems.push({
                ...orderToPopup,
                orderMongoId,
                total: orderToPopup.total ?? orderToPopup.pricing?.total ?? 0,
                paymentMethod: orderToPopup.paymentMethod || orderToPopup.payment?.method || null,
                orderType: orderToPopup.orderType || 'delivery',
              });
            }

            if (newQueueItems.length > 0) {
              setOrderQueue((prev) => {
                const filteredNew = newQueueItems.filter((item) => !prev.some((o) => resolveOrderActionId(o) === resolveOrderActionId(item)));
                return [...prev, ...filteredNew];
              });
            }
          }
        }
      } catch (error) {
        if (error.response?.status !== 401) {
          debugError('Error checking orders to popup:', error);
        }
      }
    };

    // Check once on mount, and then every 8 seconds
    checkOrdersToPopup();
    const intervalId = setInterval(checkOrdersToPopup, 8000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, pullTick]);

  useEffect(() => {
    if (!tabActive) return undefined;
    const orderToReject = popupOrder || newOrder;
    const timeoutSeconds = resolveAcceptOrderTimeoutSeconds(orderToReject, deliveryAcceptOrderTimeoutSecondsRef.current, takeawayAcceptOrderTimeoutSecondsRef.current);
    if (!timeoutSeconds || timeoutSeconds <= 0) return undefined;

    if (showNewOrderPopup && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (showNewOrderPopup && countdown === 0) {
      // Auto-reject when timer hits zero
      const orderId = resolveOrderActionId(orderToReject);

      if (orderId && !isAcceptingOrder) {
        if (autoRejectInitiatedRef.current) return undefined;

        // Safety: Double check if order has genuinely expired using createdAt
        const orderTime = orderToReject?.createdAt ? new Date(orderToReject.createdAt).getTime() : Date.now();
        const secondsElapsed = Math.floor((Date.now() - orderTime) / 1000);

        if (secondsElapsed >= timeoutSeconds - 5) {
          autoRejectInitiatedRef.current = true;
          debugLog('Timer expired. Auto-rejecting order:', orderId);
          if (stopSound) {
            stopSound();
          }

          // Instantly close the reject reasons popup
          setShowRejectPopup(false);

          // Show cancelled status in the main popup
          setPopupOrder((prev) => {
            const base = prev || orderToReject || {};
            return { ...base, status: 'cancelled', orderStatus: 'cancelled' };
          });

          // Remove from queue
          setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== orderId));

          restaurantAPI
            .rejectOrder(orderId, 'No response from restaurant (Auto-rejected)')
            .then(() => {
              toast.info('Order auto-rejected due to no response');
              requestOrdersRefresh();
              // The 2.5s timer in the other useEffect will close the main popup
            })
            .catch((err) => {
              debugError('Auto-reject failed:', err);
              setShowNewOrderPopup(false);
            });
        } else {
          // If time is still remaining in reality, correct the countdown state instead of auto-cancelling!
          const remaining = Math.max(0, timeoutSeconds - secondsElapsed);
          setCountdown(remaining);
        }
      } else {
        setShowRejectPopup(false);
        setShowNewOrderPopup(false);
        setPopupOrder(null);
        if (orderId) {
          setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== orderId));
        }
      }
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, showNewOrderPopup, countdown, popupOrder, newOrder, isAcceptingOrder]);

  useEffect(() => {
    if (!showNewOrderPopup) {
      setSwipeProgress(0);
      setIsAcceptingOrder(false);
      acceptSwipeActiveRef.current = false;
      autoRejectInitiatedRef.current = false;
      acceptTriggeredRef.current = false;
      setIsDetailsExpanded(false);
    }
  }, [showNewOrderPopup, setSwipeProgress]);

  // An accept attempt finished (success or error) — allow the next one.
  useEffect(() => {
    if (!isAcceptingOrder) acceptTriggeredRef.current = false;
  }, [isAcceptingOrder]);

  useEffect(() => {
    if (!showNewOrderPopup) return undefined;

    const activeOrder = popupOrder || newOrder;
    const popupStatus = activeOrder?.orderStatus || activeOrder?.status;

    if (!isAnyCancelledStatus(popupStatus)) return undefined;

    const timer = setTimeout(() => {
      const activeId = resolveOrderActionId(activeOrder);
      setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== activeId));

      setShowNewOrderPopup(false);
      setPopupOrder(null);
      clearNewOrder(activeId);
      setCountdown(0);
      setPrepTime(11);
    }, 2500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewOrderPopup, popupOrder, newOrder]);

  // Handle accept order
  const handleAcceptOrder = async () => {
    if (isAcceptingOrderRef.current) return;
    isAcceptingOrderRef.current = true;
    setIsAcceptingOrder(true);

    if (stopSound) {
      stopSound();
    }

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToAccept = popupOrder || newOrder;

    // Ensure this order can't re-trigger fallback popup by using a different id key.
    markOrderAsShown(orderToAccept);

    // Accept order only from the explicit popup payload.
    const orderId = resolveOrderActionId(orderToAccept);

    // Synchronously stop ringtone & mark as processed before API call
    if (clearNewOrder) {
      clearNewOrder(orderToAccept || orderId);
    }

    if (orderId) {
      try {
        await restaurantAPI.acceptOrder(orderId, prepTime);
        toast.success('Order accepted successfully');
        requestOrdersRefresh();
      } catch (error) {
        debugError('Error accepting order:', error);
        const errorMessage = error.response?.data?.message || error.message || '';

        // If order already moved to a forward status, treat as success
        if (errorMessage.includes('further ahead') || errorMessage.includes('cannot be moved backwards')) {
          toast.success('Order already accepted');
          requestOrdersRefresh();
          // fall through to close popup
        } else if (error.response?.status === 404) {
          toast.error('Order not found. It may have been cancelled or already processed.');
          setIsAcceptingOrder(false);
          setSwipeProgress(0);
          return;
        } else {
          toast.error(errorMessage || 'Failed to accept order. Please try again.');
          setIsAcceptingOrder(false);
          setSwipeProgress(0);
          return;
        }
      }
    } else {
      toast.error('Unable to accept this order: order id missing');
      setIsAcceptingOrder(false);
      setSwipeProgress(0);
      return;
    }

    setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== orderId));
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder(orderId);
    setCountdown(0);
    setPrepTime(11);
    setSwipeProgress(0);
    setIsAcceptingOrder(false);
  };

  const handleAcceptRef = useRef(handleAcceptOrder);
  handleAcceptRef.current = handleAcceptOrder;

  const triggerSwipeAccept = () => {
    // A swipe end and a tap on the handle can both land here before isAcceptingOrder flips; accept only once.
    if (isAcceptingOrderRef.current || acceptTriggeredRef.current) return;
    acceptTriggeredRef.current = true;
    const activeOrder = popupOrder || newOrder;
    const orderId = activeOrder?.orderMongoId || activeOrder?.orderId || activeOrder?._id || activeOrder?.id;
    if (stopSound) stopSound();
    if (clearNewOrder) clearNewOrder(orderId);

    setSwipeProgress(1);
    setTimeout(() => {
      handleAcceptRef.current();
    }, 160);
  };
  const triggerSwipeAcceptRef = useRef(triggerSwipeAccept);
  triggerSwipeAcceptRef.current = triggerSwipeAccept;

  // web: mouse / touch handlers on the handle + window move / end listeners
  const swipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isAcceptingOrderRef.current,
      onMoveShouldSetPanResponder: () => !isAcceptingOrderRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (isAcceptingOrderRef.current) return;
        acceptSwipeActiveRef.current = true;
      },
      onPanResponderMove: (_e, g) => {
        if (!acceptSwipeActiveRef.current || isAcceptingOrderRef.current) return;
        const deltaX = Math.max(g.dx, 0);
        // web getAcceptSliderMetrics: handle 56 + padding 8 on each side
        const maxTravel = Math.max(acceptSliderWidthRef.current - 56 - 8 * 2, 1);
        const v = Math.min(deltaX / maxTravel, 1);
        acceptSwipeProgressRef.current = v;
        setAcceptSwipeProgress(v);
      },
      onPanResponderRelease: (_e, g) => {
        const wasTap = Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6;
        if (!acceptSwipeActiveRef.current || isAcceptingOrderRef.current) return;
        acceptSwipeActiveRef.current = false;
        if (acceptSwipeProgressRef.current >= 0.45 || wasTap) {
          // web: a swipe past 45 % accepts; a click on the handle accepts too
          triggerSwipeAcceptRef.current();
          return;
        }
        acceptSwipeProgressRef.current = 0;
        setAcceptSwipeProgress(0);
      },
      onPanResponderTerminate: () => {
        if (!acceptSwipeActiveRef.current) return;
        acceptSwipeActiveRef.current = false;
        if (acceptSwipeProgressRef.current >= 0.45) {
          triggerSwipeAcceptRef.current();
          return;
        }
        acceptSwipeProgressRef.current = 0;
        setAcceptSwipeProgress(0);
      },
    }),
  ).current;

  // Handle reject order modal opening
  const handleRejectClick = () => {
    setShowRejectPopup(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason || isRejectingOrder) return;
    setIsRejectingOrder(true);

    const orderToReject = popupOrder || newOrder;

    if (stopSound) {
      stopSound();
    }

    const orderId = orderToReject?.orderMongoId || orderToReject?.orderId || orderToReject?._id || orderToReject?.id;

    // Optimistically update status in local memory instantly (0ms delay)
    if (orderId) {
      restaurantAPI.optimisticallyUpdateOrderStatus(orderId, 'cancelled_by_restaurant');
    }

    // Reject order via API if we have a real order
    if (orderToReject?.orderMongoId || orderToReject?.orderId) {
      try {
        await restaurantAPI.rejectOrder(orderId, rejectReason);
        toast.info('Order rejected successfully');
      } catch (error) {
        debugError('Error rejecting order:', error);
        const errorMessage = error.response?.data?.message || error.message || '';
        // If order was already cancelled or status conflict, handle gracefully without alert
        if (errorMessage.includes('already') || errorMessage.includes('cancelled') || error.response?.status === 400 || error.response?.status === 409) {
          debugLog('Order already rejected/cancelled');
        } else {
          toast.error(errorMessage || 'Failed to reject order. Please try again.');
          setIsRejectingOrder(false);
          return;
        }
      }
    }

    const targetId = resolveOrderActionId(orderToReject);
    setOrderQueue((prev) => prev.filter((o) => resolveOrderActionId(o) !== targetId));

    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder(orderId);
    setRejectReason('');
    setCountdown(0);
    setPrepTime(11);
    setIsRejectingOrder(false);
    requestOrdersRefresh();
  };

  const handleRejectCancel = () => {
    if (isRejectingOrder) return;
    setShowRejectPopup(false);
    setRejectReason('');
  };

  // Handle cancel order (for preparing orders)
  const handleCancelClick = (order) => {
    setOrderToCancel(order);
    setShowCancelPopup(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim() || !orderToCancel || isCancellingOrder) return;
    setIsCancellingOrder(true);

    try {
      const orderId = orderToCancel.mongoId || orderToCancel.orderId;
      if (orderId) {
        restaurantAPI.optimisticallyUpdateOrderStatus(orderId, 'cancelled_by_restaurant');
      }
      await restaurantAPI.rejectOrder(orderId, cancelReason.trim());
      toast.success('Order cancelled successfully');
      setShowCancelPopup(false);
      setOrderToCancel(null);
      setCancelReason('');
      requestOrdersRefresh();
    } catch (error) {
      debugError('Error cancelling order:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const handleCancelPopupClose = () => {
    setShowCancelPopup(false);
    setOrderToCancel(null);
    setCancelReason('');
  };

  // Handle takeaway verification modal opening
  const handleVerifyTakeawayClick = (order) => {
    setVerifyingOrder(order);
    setTakeawayOtpInput('');
    setShowVerifyTakeawayPopup(true);
  };

  // Handle OTP verification and order completion
  const handleVerifyTakeawayConfirm = async () => {
    if (!verifyingOrder || !takeawayOtpInput.trim()) return;

    setIsSubmittingVerifyTakeaway(true);
    try {
      const orderId = verifyingOrder.mongoId || verifyingOrder.orderId;
      await restaurantAPI.completeTakeawayOrder(orderId, takeawayOtpInput.trim());

      toast.success('Order verified & completed successfully');
      requestOrdersRefresh();
      setShowVerifyTakeawayPopup(false);
      setVerifyingOrder(null);
      setTakeawayOtpInput('');
    } catch (error) {
      debugError('Error verifying takeaway order:', error);
      toast.error(error.response?.data?.message || 'Invalid OTP');
      // Clear input and refocus so restaurant can retry quickly
      setTakeawayOtpInput('');
      setTimeout(() => otpInputRef.current?.focus(), 50);
    } finally {
      setIsSubmittingVerifyTakeaway(false);
    }
  };

  const handleVerifyTakeawayClose = () => {
    setShowVerifyTakeawayPopup(false);
    setVerifyingOrder(null);
    setTakeawayOtpInput('');
  };

  // Toggle mute
  const toggleMute = () => {
    const activeOrder = popupOrder || newOrder;
    const activeId = resolveOrderActionId(activeOrder);
    if (!activeId) return;

    // Check if there are any unmuted orders in active popup or queue
    const allPendingOrders = [activeOrder, ...orderQueue].filter(Boolean);
    const hasUnmuted = allPendingOrders.some((o) => {
      const oid = resolveOrderActionId(o);
      return oid && !mutedOrderIds.has(oid);
    });

    if (hasUnmuted) {
      // Mute all pending orders
      const idsToMute = allPendingOrders.map(resolveOrderActionId).filter(Boolean);
      if (muteOrders) muteOrders(idsToMute);
    } else if (unmuteOrder) {
      // Unmute the active popup order
      unmuteOrder(activeId);
    }
  };

  // Scroll filter bar to show active button with smooth animation
  const scrollToFilter = (index) => {
    const tab = filterTabs[index];
    const layout = tab && filterTabLayouts.current[tab.id];
    if (filterBarRef.current && layout) {
      const scrollLeft = layout.x - filterBarWidth.current / 2 + layout.width / 2;
      filterBarRef.current.scrollTo({ x: Math.max(0, scrollLeft), animated: true });
    }
  };

  // Scroll to active filter on change with smooth animation
  useEffect(() => {
    const index = filterTabs.findIndex((tab) => tab.id === activeFilter);
    if (index >= 0) {
      requestAnimationFrame(() => scrollToFilter(index));
    }
  }, [activeFilter]);

  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    setIsSheetOpen(true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPullTick((t) => t + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  const renderContent = () => {
    if (searchQuery.trim() !== '') {
      return (
        <SearchResults
          query={searchQuery}
          results={searchResults}
          isLoading={isSearching}
          onSelectOrder={handleSelectOrder}
          onVerifyTakeaway={handleVerifyTakeawayClick}
        />
      );
    }

    switch (activeFilter) {
      case 'all':
        return (
          <AllOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            onVerifyTakeaway={handleVerifyTakeawayClick}
            refreshToken={listRefreshToken}
            active={tabActive}
          />
        );
      case 'preparing':
        return (
          <PreparingOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            refreshToken={listRefreshToken}
            onStatusChanged={requestOrdersRefresh}
            active={tabActive}
          />
        );
      case 'ready':
        return <ReadyOrders onSelectOrder={handleSelectOrder} onVerifyTakeaway={handleVerifyTakeawayClick} refreshToken={listRefreshToken} />;
      case 'out-for-delivery':
        return <OutForDeliveryOrders onSelectOrder={handleSelectOrder} refreshToken={listRefreshToken} />;
      case 'completed':
        return <CompletedOrders onSelectOrder={handleSelectOrder} refreshToken={listRefreshToken} />;
      case 'table-booking':
        return <TableBookings active={tabActive} />;
      case 'takeaway-orders':
        return (
          <TakeawayOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            onVerifyTakeaway={handleVerifyTakeawayClick}
            refreshToken={listRefreshToken}
            active={tabActive}
          />
        );
      case 'cancelled':
        return <CancelledOrders onSelectOrder={handleSelectOrder} refreshToken={listRefreshToken} />;
      default:
        return <EmptyState />;
    }
  };

  // native: a closing popup keeps showing its last order while it fades out (no blank card)
  const shownPopupRef = useRef({});
  if (activePopupOrder) shownPopupRef.current.order = activePopupOrder;
  if (orderToCancel) shownPopupRef.current.cancel = orderToCancel;
  if (verifyingOrder) shownPopupRef.current.verify = verifyingOrder;
  const popupShownOrder = activePopupOrder || shownPopupRef.current.order;
  const cancelShownOrder = orderToCancel || shownPopupRef.current.cancel;
  const verifyShownOrder = verifyingOrder || shownPopupRef.current.verify;
  const popupTimeoutSeconds = resolveAcceptOrderTimeoutSeconds(activePopupOrder, deliveryAcceptOrderTimeoutSeconds, takeawayAcceptOrderTimeoutSeconds);
  const showsTopButtons =
    !isMyStorePartner() &&
    searchQuery.trim() === '' &&
    (activeFilter === 'all' ||
      activeFilter === 'preparing' ||
      activeFilter === 'ready' ||
      activeFilter === 'out-for-delivery' ||
      activeFilter === 'table-booking' ||
      activeFilter === 'takeaway-orders');

  return (
    <View style={s.root} collapsable={false}>
      {/* shown (not "active"): the icons switch in the same frame as the tab, not after the route change */}
      {tabShown ? <StatusBar style="light" /> : null}
      <View style={{ zIndex: 50 }}>
        <RestaurantNavbar showNotifications={true} hideSearch={true} />
      </View>

      {/* Approved but nothing for customers to order yet: say so (banner here, popup once per session) */}
      <LiveDishBanner style={{ marginHorizontal: sp(4), marginTop: sp(2) }} reloadKey={`${activationCount}:${pullTick}`} />
      {tabActive ? <LiveDishPopup /> : null}

      {/* Top Filter Bar */}
      <View style={s.filterArea}>
        {/* Search Bar - Moved here to look like part of the content area */}
        <View style={{ paddingVertical: sp(3) }}>
          <View>
            <View style={s.searchIcon} pointerEvents="none">
              <Search size={18} color={searchFocused ? BRAND : colors.slate[400]} />
            </View>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search by order ID or dish name"
              placeholderTextColor={colors.slate[400]}
              returnKeyType="search"
              style={[s.searchInput, searchFocused && { borderColor: alpha('#B80B3D', 0.2) }]}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} style={s.searchClear} hitSlop={8}>
                <X size={16} color={colors.slate[400]} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          ref={filterBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={s.filterBar}
          onLayout={(e) => {
            filterBarWidth.current = e.nativeEvent.layout.width;
          }}
        >
          {filterTabs.map((tab, index) => (
            <FilterChip
              key={tab.id}
              label={tab.label}
              active={activeFilter === tab.id}
              badge={tab.id === 'all' && pendingOrdersCount > 0 ? pendingOrdersCount : 0}
              onLayout={(e) => {
                filterTabLayouts.current[tab.id] = e.nativeEvent.layout;
              }}
              onPress={() => {
                if (!isTransitioning) {
                  setIsTransitioning(true);
                  setActiveFilter(tab.id);
                  scrollToFilter(index);
                  setTimeout(() => setIsTransitioning(false), 300);
                }
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* Content Area - Scrollable */}
      <ScrollView
        ref={contentRef}
        style={s.flex}
        contentContainerStyle={{ paddingHorizontal: sp(4), paddingBottom: Math.max(96, navSpace) }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND]} tintColor={BRAND} />}
      >
        {/* Verification Pending Card - Show if onboarding is complete (all 4 steps) and restaurant is not active */}
        {!restaurantStatus.isLoading && !restaurantStatus.isActive && restaurantStatus.onboarding?.completedSteps === 4 ? (
          <FadeIn delay={100} style={[s.statusCard, { borderColor: restaurantStatus.rejectionReason ? colors.red[200] : colors.yellow[200] }]}>
            {restaurantStatus.rejectionReason ? (
              <>
                <View style={[s.rowGap3, { alignItems: 'flex-start', marginBottom: sp(3) }]}>
                  <View style={s.deniedIcon}>
                    <AlertCircle size={20} color={BRAND} />
                  </View>
                  <View style={s.flex}>
                    <Text style={s.deniedTitle}>Denied Verification</Text>
                    <View style={s.reasonBox}>
                      <Text style={s.reasonLabel}>Reason for Rejection:</Text>
                      <View style={{ gap: 4 }}>
                        {restaurantStatus.rejectionReason.split('\n').filter((line) => line.trim()).length > 1 ? (
                          restaurantStatus.rejectionReason
                            .split('\n')
                            .map((point, index) =>
                              point.trim() ? (
                                <Text key={index} style={s.reasonText}>
                                  {'• '}
                                  {point.trim()}
                                </Text>
                              ) : null,
                            )
                        ) : (
                          <Text style={s.reasonText}>{restaurantStatus.rejectionReason}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
                <Text style={s.reverifyHint}>Please correct the above issues and click &quot;Reverify&quot; to resubmit your request for approval.</Text>
                <Pressable onPress={handleReverify} disabled={isReverifying} style={[s.reverifyBtn, isReverifying && { opacity: 0.5 }]}>
                  <BrandFill r={10} />
                  {isReverifying ? (
                    <>
                      <Spin size={16} color={colors.white} />
                      <Text style={s.reverifyText}>Submitting...</Text>
                    </>
                  ) : (
                    <Text style={s.reverifyText}>Reverify</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.verifyTitle}>Verification Done in 24 Hours</Text>
                <Text style={s.verifyText}>Your account is under verification. You&apos;ll be notified once approved.</Text>
              </>
            )}
          </FadeIn>
        ) : null}

        {/* Dining Approval Pending Card */}
        {pendingDiningRequest ? (
          <FadeIn style={[s.statusCard, { borderColor: colors.blue[200] }]}>
            <View style={[s.rowGap3, { marginBottom: sp(2) }]}>
              <View style={s.diningIcon}>
                <Clock size={16} color={BRAND} />
              </View>
              <Text style={s.diningTitle}>Dining Activation Request Pending</Text>
            </View>
            <Text style={s.verifyText}>
              Your request to {pendingDiningRequest.requestedSettings?.isEnabled ? 'enable' : 'update'} dining services is being reviewed by our team.
              You&apos;ll be notified via SMS/Dashboard once it&apos;s approved.
            </Text>
            <View style={[s.rowGap2, { marginTop: sp(3) }]}>
              <View style={{ width: 8, height: 8 }}>
                <PingDot color={colors.blue[400]} />
                <View style={[StyleSheet.absoluteFill, { borderRadius: 4, backgroundColor: colors.blue[500] }]} />
              </View>
              <Text style={s.underReview}>UNDER REVIEW</Text>
            </View>
          </FadeIn>
        ) : null}

        {showsTopButtons ? (
          <View style={s.topButtons}>
            {/* Takeaway Orders button — count hidden on 'all' tab */}
            <PillButton
              active={activeFilter === 'takeaway-orders'}
              onPress={() => setActiveFilter(activeFilter === 'takeaway-orders' ? 'all' : 'takeaway-orders')}
              label="Takeaway Orders"
              badge={activeTakeawayCount > 0 && activeFilter !== 'all' ? activeTakeawayCount : 0}
              badgeStyle={{ bg: colors.amber[100], fg: restaurantTheme.primaryStrong }}
              dotColor={restaurantTheme.primary}
            />
            {/* Table Booking button */}
            <PillButton
              active={activeFilter === 'table-booking'}
              onPress={() => setActiveFilter(activeFilter === 'table-booking' ? 'all' : 'table-booking')}
              label="Dining Booking"
              badge={pendingBookingsCount}
              badgeStyle={{ bg: colors.red[100], fg: BRAND }}
              dotGradient
            />
          </View>
        ) : null}

        <FadeIn key={`${activeFilter}:${pullTick}`} fromX={20} fromY={0}>
          {renderContent()}
        </FadeIn>
      </ScrollView>

      {/* New Order Popup */}
      <Dialog
        open={tabActive && showNewOrderPopup && Boolean(popupOrder || newOrder)}
        dismissible={false}
        backdropOpacity={0.6}
        style={[s.orderPopup, { maxHeight: winH * 0.85 }]}
      >
        {popupShownOrder ? (
          <NewOrderPopupBody
            order={popupShownOrder}
            isMuted={isCurrentOrderMuted}
            onToggleMute={toggleMute}
            isDetailsExpanded={isDetailsExpanded}
            setIsDetailsExpanded={setIsDetailsExpanded}
            prepTime={prepTime}
            setPrepTime={setPrepTime}
            popupTimeoutSeconds={popupTimeoutSeconds}
            countdown={countdown}
            isAcceptingOrder={isAcceptingOrder}
            acceptSwipeProgress={acceptSwipeProgress}
            sliderWidth={acceptSliderWidth}
            onSliderLayout={(w) => {
              acceptSliderWidthRef.current = w;
              setAcceptSliderWidth(w);
            }}
            swipeHandlers={swipeResponder.panHandlers}
            onReject={handleRejectClick}
          />
        ) : null}
      </Dialog>

      {/* Reject Order Popup */}
      <Dialog open={tabActive && showRejectPopup} onClose={handleRejectCancel} backdropOpacity={0.6} style={[s.reasonPopup, { maxHeight: winH * 0.92 }]}>
        <View style={s.reasonHead}>
          <Text style={s.reasonTitle}>Reject Order {(popupOrder || newOrder)?.orderId || '#Order'}</Text>
          <Text style={s.reasonSub}>Please select a reason for rejecting this order</Text>
        </View>
        <ScrollView style={s.flexShrink} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(3), gap: sp(2) }}>
          {rejectReasons.map((reason) => {
            const on = rejectReason === reason;
            return (
              <Pressable key={reason} onPress={() => setRejectReason(reason)} style={[s.reasonOption, on ? s.reasonOptionOn : null]}>
                <View style={s.rowBetween}>
                  <Text style={[s.reasonOptionText, { color: on ? BRAND : colors.gray[900] }]}>{reason}</Text>
                  {on ? (
                    <View style={s.reasonCheck}>
                      <BrandFill r={10} />
                      <CheckMark />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={s.reasonFooter}>
          <Pressable onPress={handleRejectCancel} disabled={isRejectingOrder} style={[s.reasonCancel, isRejectingOrder && { opacity: 0.5 }]}>
            <Text style={s.reasonCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleRejectConfirm}
            disabled={!rejectReason || isRejectingOrder}
            style={[s.reasonConfirm, !rejectReason ? { backgroundColor: colors.gray[200] } : s.confirmShadow, isRejectingOrder && { opacity: 0.9 }]}
          >
            {rejectReason ? <BrandFill r={10} /> : null}
            {isRejectingOrder ? (
              <>
                <Spin size={16} color={colors.white} />
                <Text style={s.reasonConfirmText}>Confirming...</Text>
              </>
            ) : (
              <Text style={[s.reasonConfirmText, !rejectReason && { color: colors.gray[400] }]}>Confirm Rejection</Text>
            )}
          </Pressable>
        </View>
      </Dialog>

      {/* Cancel Order Popup */}
      <Dialog
        open={tabActive && showCancelPopup && Boolean(orderToCancel)}
        onClose={handleCancelPopupClose}
        backdropOpacity={0.6}
        style={[s.reasonPopup, { maxHeight: winH * 0.92 }]}
      >
        <View style={s.reasonHead}>
          <Text style={s.reasonTitle}>Cancel Order {cancelShownOrder?.orderId || '#Order'}</Text>
          <Text style={s.reasonSub}>Please provide a reason for cancelling this order</Text>
        </View>
        <ScrollView style={s.flexShrink} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(3), gap: sp(2) }}>
          {rejectReasons.map((reason) => {
            const on = cancelReason === reason;
            return (
              <Pressable
                key={reason}
                onPress={() => setCancelReason(reason)}
                style={[s.cancelOption, on ? { borderColor: colors.red[500], backgroundColor: colors.red[50] } : null]}
              >
                <View style={s.rowGap3}>
                  <View style={[s.cancelRadio, { borderColor: on ? colors.red[500] : colors.gray[300] }]}>
                    {on ? <BrandFill r={10} /> : null}
                    {on ? <CheckMark /> : null}
                  </View>
                  <Text style={[s.reasonOptionText, { color: on ? colors.red[700] : colors.gray[700] }]}>{reason}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={s.reasonFooter}>
          <Pressable onPress={handleCancelPopupClose} disabled={isCancellingOrder} style={[s.reasonCancel, isCancellingOrder && { opacity: 0.5 }]}>
            <Text style={s.reasonCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleCancelConfirm}
            disabled={!cancelReason || isCancellingOrder}
            style={[s.reasonConfirm, !cancelReason ? { backgroundColor: colors.gray[200] } : s.confirmShadow, isCancellingOrder && { opacity: 0.9 }]}
          >
            {cancelReason ? <BrandFill r={10} /> : null}
            {isCancellingOrder ? (
              <>
                <Spin size={16} color={colors.white} />
                <Text style={s.reasonConfirmText}>Confirming...</Text>
              </>
            ) : (
              <Text style={[s.reasonConfirmText, !cancelReason && { color: colors.gray[400] }]}>Confirm Cancellation</Text>
            )}
          </Pressable>
        </View>
      </Dialog>

      {/* Verify & Complete Takeaway OTP Popup */}
      <Dialog
        open={tabActive && showVerifyTakeawayPopup && Boolean(verifyingOrder)}
        onClose={handleVerifyTakeawayClose}
        backdropOpacity={0.7}
        style={[s.otpPopup, kbOffset ? { marginBottom: kbOffset } : null]}
      >
        {verifyShownOrder ? (
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: winH - kbOffset - 48 }}>
            {/* Gradient Header */}
            <View style={s.otpHeader}>
              <BrandFill />
              {/* decorative circles */}
              <View style={[s.otpCircle, { top: -24, right: -24, width: 96, height: 96, backgroundColor: alpha(colors.white, 0.1) }]} />
              <View style={[s.otpCircle, { bottom: -16, left: -16, width: 80, height: 80, backgroundColor: alpha(colors.white, 0.05) }]} />
              {/* Bag Icon */}
              <View style={s.otpBag}>
                <ShoppingBag size={28} color={colors.white} />
              </View>
              <Text style={s.otpTitle}>Verify Takeaway</Text>
              <Text style={s.otpSub}>SELF-PICKUP VERIFICATION</Text>
            </View>

            {/* Pull-up card */}
            <View style={{ paddingHorizontal: sp(5), marginTop: -20, zIndex: 10 }}>
              <View style={s.otpOrderCard}>
                <View style={s.otpPhoto}>
                  {verifyShownOrder.photoUrl ? (
                    <AppImage src={verifyShownOrder.photoUrl} style={s.fill} contentFit="cover" />
                  ) : (
                    <View style={[s.fill, s.center]}>
                      <ShoppingBag size={24} color={colors.slate[300]} />
                    </View>
                  )}
                </View>
                <View style={s.flex}>
                  <View style={[s.rowGap1, { flexWrap: 'wrap', gap: 6 }]}>
                    <Text style={s.otpOrderLabel}>ORDER</Text>
                    <Text style={s.otpOrderId}>#{verifyShownOrder.orderId}</Text>
                  </View>
                  <Text style={s.otpCustomer} numberOfLines={1}>
                    {verifyShownOrder.customerName}
                  </Text>
                  <Text style={s.otpItems} numberOfLines={1}>
                    {verifyShownOrder.itemsSummary}
                  </Text>
                </View>
              </View>
            </View>

            {/* Amount: cash must be collected before handing the food over */}
            {Number(verifyShownOrder.payableTotal) > 0 ? (
              <View style={{ paddingHorizontal: sp(5), paddingTop: sp(4) }}>
                {['cash', 'cod'].includes(String(verifyShownOrder.paymentMethod || '').toLowerCase().trim()) ? (
                  <View style={s.cashBox}>
                    <Text style={s.cashLabel}>COLLECT CASH FROM CUSTOMER</Text>
                    <Text style={s.cashValue}>₹{Number(verifyShownOrder.payableTotal).toFixed(2)}</Text>
                  </View>
                ) : (
                  <View style={s.paidBox}>
                    <Text style={s.paidLabel}>PAID ONLINE · ₹{Number(verifyShownOrder.payableTotal).toFixed(2)}</Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* OTP Section */}
            <View style={{ paddingHorizontal: sp(5), paddingTop: sp(5), paddingBottom: sp(2) }}>
              <Text style={s.otpInputLabel}>ENTER 4-DIGIT CUSTOMER OTP</Text>
              <OtpInput
                inputRef={otpInputRef}
                value={takeawayOtpInput}
                onChangeText={(v) => setTakeawayOtpInput(v.replace(/\D/g, '').slice(0, 4))}
              />
            </View>

            {/* Actions */}
            <View style={s.otpActions}>
              <Pressable onPress={handleVerifyTakeawayClose} style={({ pressed }) => [s.otpCancel, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.slate[50] }]}>
                <Text style={s.otpCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={handleVerifyTakeawayConfirm}
                disabled={isSubmittingVerifyTakeaway || takeawayOtpInput.length < 4}
                style={({ pressed }) => [
                  s.otpConfirm,
                  takeawayOtpInput.length < 4 ? { backgroundColor: '#94a3b8', opacity: 0.4 } : s.otpConfirmShadow,
                  isSubmittingVerifyTakeaway && { opacity: 0.4 },
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                {takeawayOtpInput.length < 4 ? null : <BrandFill r={16} />}
                <Text style={s.otpConfirmText}>{isSubmittingVerifyTakeaway ? 'VERIFYING…' : 'COMPLETE ORDER'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
      </Dialog>

      {/* Centered Modal for Order Details */}
      <Dialog open={tabActive && isSheetOpen && Boolean(selectedOrder)} onClose={() => setIsSheetOpen(false)} backdropOpacity={0.6} style={[s.detailsPopup, { maxHeight: winH * 0.85 }]}>
        {selectedOrder ? <OrderDetailsBody order={selectedOrder} onClose={() => setIsSheetOpen(false)} /> : null}
      </Dialog>
    </View>
  );
}

export default function OrdersMain() {
  return (
    <OrdersErrorBoundary>
      <OrdersMainInner />
    </OrdersErrorBoundary>
  );
}

// ------------------------------------------------------------------ popup pieces
function FilterChip({ label, active, badge, onPress, onLayout }) {
  const v = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: active ? 1 : 0, duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true }).start();
  }, [active, v]);
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      onPressIn={() => Animated.timing(press, { toValue: 0.95, duration: 100, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 1, duration: 150, useNativeDriver: true }).start()}
    >
      <Animated.View
        style={[
          s.chip,
          !active && { backgroundColor: colors.white },
          {
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
            transform: [{ scale: Animated.multiply(press, v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })) }],
          },
        ]}
      >
        {active ? <BrandFill r={9999} /> : null}
        <View style={s.rowGap2}>
          <View style={[s.rowGap1, { gap: 6 }]}>
            <Text style={[s.chipText, { color: active ? colors.white : colors.black }]}>{label}</Text>
            {badge > 0 ? (
              <View style={[s.countPill, { backgroundColor: colors.amber[100] }]}>
                <Text style={[s.countPillText, { color: restaurantTheme.primaryStrong }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {badge > 0 ? (
            <Pulse style={s.chipDot}>
              <BrandFill r={4} />
            </Pulse>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

function PillButton({ active, onPress, label, badge, badgeStyle, dotColor, dotGradient }) {
  const v = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: active ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [active, v]);
  return (
    <Pressable
      onPress={onPress}
      style={s.flex}
      onPressIn={() => Animated.timing(press, { toValue: 0.95, duration: 100, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 1, duration: 150, useNativeDriver: true }).start()}
    >
      <Animated.View
        style={[
          s.pillBtn,
          !active && { backgroundColor: colors.white },
          { transform: [{ scale: Animated.multiply(press, v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })) }] },
        ]}
      >
        {active ? <BrandFill r={9999} /> : null}
        <View style={[s.rowGap2, { justifyContent: 'center' }]}>
          <View style={[s.rowGap1, { gap: 6 }]}>
            <Text style={[s.pillText, { color: active ? colors.white : colors.black }]} numberOfLines={1}>
              {label}
            </Text>
            {badge > 0 ? (
              <Bounce>
                <View style={[s.countPill, { backgroundColor: badgeStyle.bg }]}>
                  <Text style={[s.countPillText, { color: badgeStyle.fg }]}>{badge}</Text>
                </View>
              </Bounce>
            ) : null}
          </View>
          {badge > 0 ? <Pulse style={[s.chipDot, dotColor ? { backgroundColor: dotColor } : null]}>{dotGradient ? <BrandFill r={4} /> : null}</Pulse> : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

function OtpInput({ inputRef, value, onChangeText }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={inputRef}
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={4}
      value={value}
      onChangeText={onChangeText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder="••••"
      placeholderTextColor={colors.slate[300]}
      selectionColor={BRAND}
      cursorColor={BRAND}
      style={[s.otpInput, focused && { borderColor: BRAND }]}
    />
  );
}

function PopupItem({ item }) {
  const isVeg = item.isVeg !== false && item.veg !== false && !String(item.type || '').toLowerCase().includes('non');
  const variantText =
    (typeof item.variantName === 'string' && item.variantName.trim()) ||
    (typeof item.variant === 'string' && item.variant.trim()) ||
    (typeof item.variant === 'object' && item.variant?.name) ||
    (typeof item.selectedVariant === 'string' && item.selectedVariant.trim()) ||
    (typeof item.selectedVariant === 'object' && item.selectedVariant?.name) ||
    (typeof item.variant_name === 'string' && item.variant_name.trim()) ||
    (typeof item.variation === 'string' && item.variation.trim()) ||
    (typeof item.variation === 'object' && item.variation?.name) ||
    (typeof item.size === 'string' && item.size.trim()) ||
    (typeof item.portion === 'string' && item.portion.trim()) ||
    (typeof item.option === 'string' && item.option.trim()) ||
    (typeof item.choice === 'string' && item.choice.trim()) ||
    '';
  const itemAddons = Array.isArray(item.addons) ? item.addons : Array.isArray(item.selectedAddons) ? item.selectedAddons : [];
  const itemMarkup = getMenuItemLevelMarkupTotal(item);
  const itemBase = getRestaurantItemAmount(item);

  return (
    <LinearGradient
      colors={[alpha(colors.slate[50], 0.9), colors.white, alpha(colors.slate[50], 0.7)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={s.popItem}
    >
      <View style={s.popItemLeft}>
        {/* Veg / Non-Veg Icon */}
        <View
          style={[
            s.vegBox,
            isVeg
              ? { borderColor: colors.emerald[600], backgroundColor: alpha(colors.emerald[50], 0.8) }
              : { borderColor: colors.rose[600], backgroundColor: alpha(colors.rose[50], 0.8) },
          ]}
        >
          <View style={[s.vegDot, { backgroundColor: isVeg ? colors.emerald[600] : colors.rose[600] }]} />
        </View>

        {/* Prominent Quantity Badge */}
        <View style={s.qtyPill}>
          <Text style={s.qtyText}>{item.quantity}×</Text>
        </View>

        {/* Item Name & Variant */}
        <View style={s.flex}>
          <Text style={s.popItemName}>{item.name}</Text>
          {variantText ? (
            <View style={s.wrapRow}>
              <View style={s.variantPill}>
                <Pulse>
                  <View style={s.variantDot} />
                </Pulse>
                <Text style={s.variantText}>{variantText}</Text>
              </View>
            </View>
          ) : null}
          {itemAddons.length > 0 ? (
            <View style={s.wrapRow}>
              {itemAddons.map((addon, aIdx) => (
                <View key={aIdx} style={s.addonPill}>
                  <Text style={s.addonText}>+ {typeof addon === 'string' ? addon : addon.name}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* Item Price: base + menu-item admin markup (if any) */}
      <View style={{ marginLeft: sp(2), alignItems: 'flex-end' }}>
        <View style={s.priceBox}>
          <Text style={s.priceText}>₹{itemBase}</Text>
        </View>
        {itemMarkup > 0 ? (
          <View style={{ marginTop: 4, alignItems: 'flex-end' }}>
            <Text style={s.markupText}>+ ₹{itemMarkup} admin</Text>
            <Text style={s.markupTotal}>Total ₹{Math.round((itemBase + itemMarkup) * 100) / 100}</Text>
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

function CountdownBar({ fraction }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: fraction, duration: 1000, easing: Easing.linear, useNativeDriver: false }).start();
  }, [fraction, v]);
  return (
    <Animated.View style={[s.countdownBar, { width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
      <BrandFill />
    </Animated.View>
  );
}

function NewOrderPopupBody({
  order,
  isMuted,
  onToggleMute,
  isDetailsExpanded,
  setIsDetailsExpanded,
  prepTime,
  setPrepTime,
  popupTimeoutSeconds,
  countdown,
  isAcceptingOrder,
  acceptSwipeProgress,
  sliderWidth,
  onSliderLayout,
  swipeHandlers,
  onReject,
}) {
  const oType = String(order.orderType || order.type || '').toLowerCase().trim();
  const isTakeawayHeader = order.orderType === 'takeaway' || order.type === 'Takeaway';
  const isDiningHeader = order.orderType === 'dining' || order.type === 'Dining';

  // Home Delivery address
  const addrObj = order.customerAddress || order.deliveryAddress || order.address;
  let displayAddress = '';
  if (addrObj) {
    if (typeof addrObj === 'string') {
      displayAddress = addrObj;
    } else {
      displayAddress = [addrObj.street || addrObj.addressLine1 || addrObj.label, addrObj.addressLine2, addrObj.city, addrObj.pincode || addrObj.zipCode]
        .filter(Boolean)
        .join(', ');
    }
  }

  const orderItems = order.items || [];
  const ALWAYS_SHOW = 4;
  const visibleItems = orderItems.slice(0, ALWAYS_SHOW);
  const extraItems = orderItems.slice(ALWAYS_SHOW);
  const hasExtra = extraItems.length > 0;
  const formattedTime = order.createdAt
    ? new Date(order.createdAt)
        .toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
        .replace(/ am/i, ' AM')
        .replace(/ pm/i, ' PM')
    : 'Just now';

  const restaurantBill = getPopupOrderTotal(order);
  const adminMarkup = getOrderMarkupTotal(order);
  const customerBill = getCustomerFacingOrderTotal(order);

  const rawPay = order.paymentMethod || order.payment?.method;
  const m = rawPay != null ? String(rawPay).toLowerCase().trim() : '';
  const isCod = m === 'cash' || m === 'cod';

  const popupStatus = order.orderStatus || order.status;
  const userCancelled = isUserCancelledStatus(popupStatus);
  const anyCancelled = isAnyCancelledStatus(popupStatus);

  // web: handle x = progress * (slider width - 40 handle - 16)
  const maxTravel = Math.max(sliderWidth - 40 - 16, 0);

  return (
    <View style={s.popupInner}>
      {/* Header */}
      <View style={s.popupHeader}>
        <View style={s.flex}>
          <View style={[s.rowGap2, { flexWrap: 'wrap' }]}>
            <Text style={s.popupOrderId} numberOfLines={1}>
              {order.orderId || '#Order'}
            </Text>
            {isTakeawayHeader ? (
              <View style={[s.typeTag, { backgroundColor: colors.orange[100] }]}>
                <Text style={[s.typeTagText, { color: restaurantTheme.primaryStrong }]}>TAKEAWAY</Text>
              </View>
            ) : isDiningHeader ? (
              <View style={[s.typeTag, { backgroundColor: colors.blue[100] }]}>
                <Text style={[s.typeTagText, { color: colors.blue[700] }]}>DINING</Text>
              </View>
            ) : (
              <View style={[s.typeTag, { backgroundColor: colors.green[100] }]}>
                <Text style={[s.typeTagText, { color: restaurantTheme.primaryStrong }]}>HOME DELIVERY</Text>
              </View>
            )}
          </View>
          <Text style={[s.xsGray, { marginTop: 2 }]}>{order.restaurantName || 'Restaurant'}</Text>
        </View>
        <Pressable onPress={onToggleMute} accessibilityLabel={isMuted ? 'Unmute' : 'Mute'} style={({ pressed }) => [s.muteBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          {isMuted ? <VolumeX size={20} color={colors.gray[700]} /> : <Volume2 size={20} color={colors.gray[700]} />}
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView style={s.flexShrink} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(4) }}>
        {/* Order Type Banner/Card */}
        {oType === 'takeaway' ? (
          <View style={[s.typeCard, { backgroundColor: restaurantTheme.primarySoft, borderColor: restaurantTheme.primaryBorder }]}>
            <View style={[s.typeCardIcon, { backgroundColor: colors.orange[100] }]}>
              <ShoppingBag size={16} color={restaurantTheme.primary} />
            </View>
            <View style={s.flex}>
              <Text style={[s.typeCardLabel, { color: colors.orange[800] }]}>TAKEAWAY ORDER</Text>
              <Text style={[s.typeCardText, { color: colors.orange[950] }]}>Customer will pick up from restaurant.</Text>
            </View>
          </View>
        ) : oType === 'dining' ? (
          <View style={[s.typeCard, { backgroundColor: colors.blue[50], borderColor: colors.blue[200] }]}>
            <View style={[s.typeCardIcon, { backgroundColor: colors.blue[100] }]}>
              <Users size={16} color={colors.blue[600]} />
            </View>
            <View style={s.flex}>
              <Text style={[s.typeCardLabel, { color: colors.blue[800] }]}>DINING ORDER</Text>
              <Text style={[s.typeCardText, { color: colors.blue[950] }]}>For in-restaurant dining. Table service.</Text>
            </View>
          </View>
        ) : (
          <View style={[s.typeCard, { backgroundColor: colors.green[50], borderColor: colors.green[200] }]}>
            <View style={[s.typeCardIcon, { backgroundColor: colors.green[100] }]}>
              <MapPin size={16} color={colors.green[600]} />
            </View>
            <View style={s.flex}>
              <Text style={[s.typeCardLabel, { color: colors.green[800] }]}>HOME DELIVERY ORDER</Text>
              <Text style={[s.typeCardText, { color: colors.green[950] }]}>{displayAddress ? `Deliver to: ${displayAddress}` : 'Deliver to customer address.'}</Text>
            </View>
          </View>
        )}

        {/* Restaurant Note */}
        {order.restaurantNote ? (
          <View style={s.popNote}>
            <View style={[s.rowGap2, { marginBottom: 4 }]}>
              <FileText size={16} color={BRAND} />
              <Text style={s.popNoteLabel}>NOTE FOR RESTAURANT</Text>
            </View>
            <Text style={s.popNoteText}>{order.restaurantNote}</Text>
          </View>
        ) : null}

        {/* Details Section — first 4 always visible, extra items expandable */}
        <View style={{ marginBottom: sp(4) }}>
          <View style={s.detailsHead}>
            <View style={s.rowGap2}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.gray[700]}>
                <Path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </Svg>
              <Text style={s.detailsTitle}>Details</Text>
              <Text style={s.xsGray}>
                ({orderItems.length} item{orderItems.length !== 1 ? 's' : ''})
              </Text>
            </View>
            <Text style={[s.xsGray, { fontWeight: '600' }]}>{formattedTime}</Text>
          </View>

          {/* Always-visible first 4 items */}
          <View style={{ gap: sp(3) }}>
            {visibleItems.map((item, index) => (
              <PopupItem key={index} item={item} />
            ))}
          </View>

          {/* Expand/collapse extra items */}
          {hasExtra ? (
            <>
              {isDetailsExpanded ? (
                <FadeIn fromY={0} style={{ marginTop: sp(3), gap: sp(3) }}>
                  {extraItems.map((item, i) => (
                    <PopupItem key={ALWAYS_SHOW + i} item={item} />
                  ))}
                </FadeIn>
              ) : null}
              <Pressable onPress={() => setIsDetailsExpanded(!isDetailsExpanded)} style={({ pressed }) => [s.moreBtn, pressed && { backgroundColor: colors.gray[50] }]}>
                {isDetailsExpanded ? (
                  <>
                    <ChevronUp size={16} color={colors.gray[500]} />
                    <Text style={s.moreText}>Show less</Text>
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} color={colors.gray[500]} />
                    <Text style={s.moreText}>
                      +{extraItems.length} more item{extraItems.length !== 1 ? 's' : ''}
                    </Text>
                  </>
                )}
              </Pressable>
            </>
          ) : null}
        </View>

        {/* Total bill — restaurant base + admin markup breakdown */}
        <View style={s.billRow}>
          <View style={s.rowBetween}>
            <View style={s.rowGap2}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.gray[700]}>
                <Path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                />
              </Svg>
              <Text style={s.detailsTitle}>Total bill</Text>
            </View>
            {adminMarkup > 0 ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.billValue}>
                  ₹{restaurantBill} <Text style={s.billMarkup}>+ ₹{adminMarkup}</Text>
                </Text>
                <Text style={s.billCustomer}>Customer total ₹{customerBill}</Text>
              </View>
            ) : (
              <Text style={s.billValue}>₹{restaurantBill}</Text>
            )}
          </View>
        </View>

        {/* Payment method: treat cash/cod (any case) as COD */}
        <View style={[s.rowBetween, { marginBottom: sp(4), paddingVertical: sp(2) }]}>
          <Text style={s.popLabel}>Payment</Text>
          <Text style={[s.payValue, { color: isCod ? restaurantTheme.primary : colors.green[600] }]}>
            {isCod ? (String(order.orderType || '').toLowerCase() === 'takeaway' ? `Cash at pickup · collect ₹${customerBill}` : 'Cash on Delivery') : 'Paid'}
          </Text>
        </View>

        {/* Preparation time */}
        <View style={{ marginBottom: sp(4) }}>
          <View style={[s.rowBetween, { marginBottom: sp(3) }]}>
            <Text style={s.popLabel}>Preparation time</Text>
            <View style={s.rowGap2}>
              <Pressable onPress={() => setPrepTime(Math.max(1, prepTime - 1))} style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: colors.gray[200] }]}>
                <Minus size={16} color={colors.gray[700]} />
              </Pressable>
              <Text style={s.prepValue}>{prepTime} mins</Text>
              <Pressable onPress={() => setPrepTime(prepTime + 1)} style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: colors.gray[200] }]}>
                <Plus size={16} color={colors.gray[700]} />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={s.popupFooter}>
        {anyCancelled ? (
          <View style={s.cancelledBox}>
            <Text style={s.cancelledTitle}>{userCancelled ? 'Order canceled by user' : 'Order cancelled'}</Text>
            <Text style={s.cancelledText}>This order is no longer available for acceptance.</Text>
          </View>
        ) : (
          <View style={{ gap: sp(3) }}>
            <View style={s.slider} onLayout={(e) => onSliderLayout(e.nativeEvent.layout.width)}>
              <BrandFill r={16} />
              <CountdownBar fraction={popupTimeoutSeconds > 0 ? Math.max(0, Math.min(1, countdown / popupTimeoutSeconds)) : 1} />
              <View style={s.sliderLabelWrap} pointerEvents="none">
                <Text style={s.sliderLabel}>
                  {isAcceptingOrder ? 'Accepting order...' : popupTimeoutSeconds > 0 ? `Slide to accept (${formatTime(countdown)})` : 'Slide to accept'}
                </Text>
              </View>
              <View {...swipeHandlers} style={[s.sliderHandle, { transform: [{ translateX: acceptSwipeProgress * maxTravel }] }]}>
                <Text style={s.sliderHandleText}>›</Text>
              </View>
            </View>

            <Pressable onPress={onReject} disabled={isAcceptingOrder} style={({ pressed }) => [s.rejectBtn, pressed && { backgroundColor: colors.red[50] }, isAcceptingOrder && { opacity: 0.6 }]}>
              <Text style={s.rejectText}>Reject Order</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function OrderDetailsBody({ order: selectedOrder, onClose }) {
  const st = String(selectedOrder.status).toLowerCase();
  const isDone = selectedOrder.status === 'Ready' || st === 'delivered' || st === 'completed' || st === 'picked_up' || st === 'ready';
  const isBad = st === 'cancelled' || st === 'rejected';
  const tone = isDone
    ? { border: colors.emerald[500], fg: colors.emerald[600], bg: colors.emerald[50], dot: colors.emerald[500] }
    : isBad
      ? { border: colors.rose[500], fg: colors.rose[600], bg: colors.rose[50], dot: colors.rose[500] }
      : { border: colors.slate[800], fg: colors.slate[900], bg: colors.slate[50], dot: colors.slate[800] };
  const raw = selectedOrder.paymentMethod;
  const normalized = raw != null ? String(raw).toLowerCase().trim() : '';
  const isCod = normalized === 'cash' || normalized === 'cod';

  return (
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: sp(5) }}>
      {/* Header drag handle / bar */}
      <View style={{ alignItems: 'center', marginBottom: sp(2) }}>
        <View style={s.handleBar} />
      </View>

      <View style={[s.rowBetweenStart, { marginBottom: sp(2) }]}>
        <View style={s.flexShrink}>
          <Text style={s.detTitle}>Order #{selectedOrder.orderId}</Text>
          <Text style={s.detCustomer}>{selectedOrder.customerName}</Text>
          <Text style={s.detType}>
            {selectedOrder.type}
            {selectedOrder.tableOrToken ? ` • ${selectedOrder.tableOrToken}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[s.detStatus, { borderColor: tone.border, backgroundColor: tone.bg }]}>
            <View style={[s.dot6, { backgroundColor: tone.dot }]} />
            <Text style={[s.detStatusText, { color: tone.fg }]}>
              {String(st === 'delivered' && selectedOrder.type === 'Takeaway' ? 'Picked Up' : selectedOrder.status).toUpperCase()}
            </Text>
          </View>
          <Text style={s.detTime}>{selectedOrder.timePlaced}</Text>
          {/* Delivery Resend Button - Only for preparing/ready orders with no partner */}
          {selectedOrder.type !== 'Takeaway' && selectedOrder.type !== 'Dining' && (st === 'preparing' || st === 'ready') && !selectedOrder.deliveryPartnerId ? (
            <View style={{ marginTop: 4 }}>
              <ResendNotificationButton orderId={selectedOrder.orderId} mongoId={selectedOrder.mongoId} onSuccess={onClose} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={s.detDivider} />

      <View style={{ marginBottom: sp(4) }}>
        <Text style={s.detItemsLabel}>ITEMS</Text>
        <View style={{ gap: sp(2) }}>
          {String(selectedOrder.itemsSummary || '')
            .split(/,\s*/)
            .filter(Boolean)
            .map((itemStr, idx) => (
              <View key={idx} style={s.detItem}>
                <View style={[s.dot8, { backgroundColor: BRAND }]} />
                <Text style={s.detItemText}>{itemStr}</Text>
              </View>
            ))}
        </View>
      </View>

      <View style={s.detMeta}>
        {/* Hide ETA for ready orders */}
        {selectedOrder.status !== 'ready' && selectedOrder.eta ? (
          <Text style={s.detMetaText}>
            ETA: <Text style={[s.detMetaText, { fontWeight: '700', color: colors.black }]}>{selectedOrder.eta}</Text>
          </Text>
        ) : null}
        <Text style={s.detMetaText}>
          Payment:{' '}
          <Text style={[s.detMetaText, { fontWeight: '700', color: isCod ? restaurantTheme.primaryStrong : colors.black }]}>{isCod ? 'Cash on Delivery' : 'Paid online'}</Text>
        </Text>
      </View>

      {selectedOrder.status === 'cancelled' && selectedOrder.cancellationReason ? (
        <View style={[s.detNote, { backgroundColor: colors.red[50], borderColor: colors.red[100] }]}>
          <Text style={[s.detNoteLabel, { color: BRAND }]}>CANCELLATION REASON</Text>
          <Text style={[s.detNoteText, { color: colors.red[700] }]}>{selectedOrder.cancellationReason}</Text>
        </View>
      ) : null}

      {selectedOrder.status === 'rejected' && selectedOrder.rejectionReason ? (
        <View style={[s.detNote, { backgroundColor: restaurantTheme.primarySoft, borderColor: colors.amber[100] }]}>
          <Text style={[s.detNoteLabel, { color: restaurantTheme.primary }]}>REJECTION REASON</Text>
          <Text style={[s.detNoteText, { color: restaurantTheme.primaryStrong }]}>{selectedOrder.rejectionReason}</Text>
        </View>
      ) : null}

      {selectedOrder.restaurantNote ? (
        <View style={[s.detNote, { backgroundColor: colors.blue[50], borderColor: colors.blue[100] }]}>
          <Text style={[s.detNoteLabel, { color: BRAND }]}>NOTE FOR RESTAURANT</Text>
          <Text style={[s.detNoteText, { color: colors.blue[700] }]}>{selectedOrder.restaurantNote}</Text>
        </View>
      ) : null}

      <Pressable onPress={onClose} style={({ pressed }) => [s.detClose, pressed && { transform: [{ scale: 0.98 }] }]}>
        <BrandFill r={14} />
        <Text style={s.detCloseText}>Close</Text>
      </Pressable>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ Order Card Component
const OrderCard = memo(function OrderCard({
  orderId,
  mongoId,
  status,
  customerName,
  type,
  tableOrToken,
  timePlaced,
  eta,
  itemsSummary,
  paymentMethod,
  payableTotal = 0,
  photoUrl,
  photoAlt,
  deliveryPartnerId,
  dispatchStatus,
  onSelect,
  onCancel,
  onMarkReady,
  isMarkingReady = false,
  restaurantNote = null,
  onVerifyTakeaway,
  acceptedAt = null,
  adminStatusNote,
}) {
  const normalizedStatus = String(status || '').toLowerCase();
  const normalizedType = String(type || '').toLowerCase();
  const isReady = normalizedStatus === 'ready';
  const isPreparing = normalizedStatus === 'preparing';
  const brandColor = '#B80B3D';

  const isAccepted = !!acceptedAt;
  const isWaitingAcceptance = !isAccepted && (normalizedStatus === 'confirmed' || normalizedStatus === 'pending' || normalizedStatus === 'created');

  const statusLabel =
    normalizedStatus === 'delivered' && normalizedType === 'takeaway'
      ? 'Picked Up'
      : normalizedStatus === 'placed'
        ? 'Order Placed'
        : isWaitingAcceptance
          ? 'Pending'
          : String(status || '')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());

  const statusTone =
    isReady || normalizedStatus === 'delivered' || normalizedStatus === 'completed' || normalizedStatus === 'picked_up'
      ? { bg: colors.emerald[50], fg: colors.emerald[600], border: colors.emerald[100] }
      : isWaitingAcceptance || normalizedStatus === 'confirmed'
        ? { bg: restaurantTheme.primarySoft, fg: restaurantTheme.primary, border: colors.amber[100] }
        : normalizedStatus.includes('cancel') || normalizedStatus.includes('reject') || normalizedStatus === 'failed'
          ? { bg: colors.rose[50], fg: colors.rose[600], border: colors.rose[100] }
          : { bg: colors.slate[50], fg: colors.slate[500], border: colors.slate[100] };

  const badge = (
    <View style={[s.cardBadge, { backgroundColor: statusTone.bg, borderColor: statusTone.border }]}>
      <Text style={[s.cardBadgeText, { color: statusTone.fg }]}>{statusLabel.toUpperCase()}</Text>
    </View>
  );

  return (
    <View style={s.orderCard}>
      <View style={[s.cardStripe, { backgroundColor: brandColor }]} />

      <Pressable
        onPress={() => onSelect?.({ orderId, status, customerName, type, tableOrToken, timePlaced, eta, itemsSummary, paymentMethod, restaurantNote })}
        style={({ pressed }) => [s.cardRow, pressed && { backgroundColor: colors.slate[50] }]}
      >
        {/* Photo Container - Centered vertically and slightly larger */}
        <OrderPhoto uri={photoUrl} alt={photoAlt} size={60} small />

        {/* Content Area */}
        <View style={s.flex}>
          {/* Top Row: ID & Status Badge */}
          <View style={[s.rowBetween, { gap: sp(2), marginBottom: 6 }]}>
            <Text style={s.cardId} numberOfLines={1}>
              #<Text style={[s.cardId, { color: brandColor }]}>{orderId}</Text>
            </Text>

            <View style={[s.rowGap1, { gap: 6, flexShrink: 0 }]}>
              {isWaitingAcceptance ? <Pulse>{badge}</Pulse> : badge}

              {adminStatusNote ? (
                <Text style={s.adminNote} numberOfLines={1}>
                  {adminStatusNote}
                </Text>
              ) : null}

              {isPreparing && onCancel ? (
                <Pressable onPress={() => onCancel({ orderId, mongoId, customerName })} hitSlop={6} style={s.cardCancel}>
                  <X size={12} color={colors.rose[500]} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Customer & Type */}
          <View style={[s.rowBetween, { gap: sp(2), marginBottom: 4 }]}>
            <Text style={s.cardCustomer} numberOfLines={1}>
              {String(customerName || '').toUpperCase()}
            </Text>
            {normalizedType === 'takeaway' ? (
              <View style={[s.cardType, { backgroundColor: restaurantTheme.primarySoft, borderColor: alpha(colors.amber[200], 0.5) }]}>
                <Text style={[s.cardTypeText, { color: '#D97706' }]}>TAKEAWAY</Text>
              </View>
            ) : normalizedType === 'dining' ? (
              <View style={[s.cardType, { backgroundColor: colors.blue[50], borderColor: alpha(colors.blue[200], 0.5) }]}>
                <Text style={[s.cardTypeText, { color: colors.blue[600] }]}>DINING</Text>
              </View>
            ) : (
              <View style={[s.cardType, { backgroundColor: colors.slate[50], borderColor: alpha(colors.slate[200], 0.5) }]}>
                <Text style={[s.cardTypeText, { color: colors.slate[500] }]}>{String(type || '').toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Items Summary - Line by line */}
          <View style={{ marginBottom: 6, gap: 4 }}>
            {String(itemsSummary || '')
              .split(/,\s*/)
              .filter(Boolean)
              .map((itemStr, idx) => (
                <View key={idx} style={[s.rowGap1, { gap: 6 }]}>
                  <View style={[s.dot6, { backgroundColor: BRAND }]} />
                  <Text style={s.cardItem}>{itemStr}</Text>
                </View>
              ))}
          </View>

          {/* Takeaway + cash: restaurant collects the whole bill at the counter */}
          {normalizedType === 'takeaway' &&
          ['cash', 'cod'].includes(String(paymentMethod || '').toLowerCase().trim()) &&
          payableTotal > 0 &&
          !normalizedStatus.includes('cancel') ? (
            <View style={s.collectCash}>
              <Text style={s.collectCashText}>Collect cash: ₹{payableTotal.toFixed(2)}</Text>
            </View>
          ) : null}

          {/* Time Placed */}
          <Text style={s.cardTime}>{String(timePlaced || '').toUpperCase()}</Text>

          {restaurantNote ? (
            <View style={s.cardNote}>
              <Text style={s.cardNoteText} numberOfLines={1}>
                Note: {restaurantNote}
              </Text>
            </View>
          ) : null}

          {/* Bottom Actions Row - Only shown if actions/ETA exist */}
          {(!isReady && eta) || isPreparing || isReady || normalizedStatus === 'confirmed' ? (
            <View style={s.cardActions}>
              <View style={{ gap: 2 }}>
                {!isReady && eta ? (
                  <View style={s.rowGap1}>
                    <Text style={s.etaLabel}>ETA</Text>
                    <Text style={s.etaValue}>{eta}</Text>
                  </View>
                ) : null}
              </View>

              <View style={[s.rowGap1, { gap: 6, flexWrap: 'wrap', flexShrink: 0 }]}>
                {isPreparing || isReady || normalizedStatus === 'confirmed' ? (
                  <>
                    {deliveryPartnerId ? (
                      <View style={s.driverTick} accessibilityLabel="Driver Assigned">
                        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.emerald[600]} strokeWidth={3}>
                          <Polyline points="20 6 9 17 4 12" />
                        </Svg>
                      </View>
                    ) : null}

                    {dispatchStatus && normalizedType !== 'takeaway' && normalizedType !== 'dining' && !isWaitingAcceptance ? (
                      <View style={s.dispatchPill}>
                        <Text style={s.dispatchText}>{String(dispatchStatus).toUpperCase()}</Text>
                      </View>
                    ) : null}

                    {(isPreparing || isReady) &&
                    normalizedType !== 'takeaway' &&
                    normalizedType !== 'dining' &&
                    dispatchStatus !== 'accepted' &&
                    !deliveryPartnerId &&
                    !isWaitingAcceptance ? (
                      <ResendNotificationButton orderId={orderId} mongoId={mongoId} />
                    ) : null}

                    {isPreparing && onMarkReady ? (
                      <Pressable
                        onPress={() => onMarkReady({ orderId, mongoId, customerName })}
                        disabled={isMarkingReady}
                        style={({ pressed }) => [s.cardBtn, { backgroundColor: brandColor }, pressed && { transform: [{ scale: 0.95 }] }, isMarkingReady && { opacity: 0.7 }]}
                      >
                        {isMarkingReady ? (
                          <Pulse>
                            <Text style={s.cardBtnText}>MARK READY</Text>
                          </Pulse>
                        ) : (
                          <Text style={s.cardBtnText}>MARK READY</Text>
                        )}
                      </Pressable>
                    ) : null}

                    {isReady && normalizedType === 'takeaway' && onVerifyTakeaway ? (
                      <Pressable
                        onPress={() => onVerifyTakeaway({ orderId, mongoId, customerName, photoUrl, photoAlt, type, itemsSummary, paymentMethod, payableTotal })}
                        style={({ pressed }) => [s.cardBtn, { backgroundColor: brandColor }, pressed && { transform: [{ scale: 0.95 }] }]}
                      >
                        <Text style={s.cardBtnText}>VERIFY &amp; COMPLETE</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

// ------------------------------------------------------------------ Preparing Orders List
function PreparingOrders({ onSelectOrder, onCancel, refreshToken = 0, onStatusChanged, active = true }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});
  const isFetchingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        // Fetch all orders and filter for 'preparing' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // 'confirmed' orders should only appear in popup notification, not in preparing list
          const preparingOrders = response.data.data.orders.filter(
            (order) => order.status === 'preparing' && String(order.orderType || '').toLowerCase() !== 'dining',
          );

          const transformedOrders = preparingOrders.map((order) => {
            const initialETA = Number(order.preparationTime) > 0 ? Number(order.preparationTime) : null; // minutes picked on accept
            const preparingTimestamp = order.tracking?.preparing?.timestamp
              ? new Date(order.tracking.preparing.timestamp)
              : order.acceptedAt
                ? new Date(order.acceptedAt)
                : new Date(order.createdAt); // Fallback to createdAt if preparing timestamp not available

            return {
              orderId: order.orderId || order._id,
              mongoId: order._id,
              status: order.status || 'preparing',
              customerName: order.userId?.name || 'Customer',
              type:
                order.orderType === 'takeaway'
                  ? 'Takeaway'
                  : order.orderType === 'dining'
                    ? 'Dining'
                    : order.deliveryFleet === 'standard'
                      ? 'Home Delivery'
                      : 'Express Delivery',
              tableOrToken: null,
              timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              initialETA,
              preparingTimestamp,
              itemsSummary: itemsSummaryOf(order),
              photoUrl: order.items?.[0]?.image || null,
              photoAlt: order.items?.[0]?.name || 'Order',
              deliveryPartnerId: order.deliveryPartnerId || null,
              dispatchStatus: order.dispatch?.status || null,
              paymentMethod: order.paymentMethod || order.payment?.method || null,
              payableTotal: Number(order.pricing?.customerTotal ?? order.pricing?.total ?? order.total ?? 0) || 0,
              restaurantNote: order.restaurantNote || null,
            };
          });

          setOrders(transformedOrders);
          setLoading(false);
        } else {
          setOrders([]);
          setLoading(false);
        }
      } catch (error) {
        if (!isMounted) return;
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404 && error.response?.status !== 401) {
          debugError('Error fetching preparing orders:', error);
        }
        setOrders([]);
        setLoading(false);
      } finally {
        isFetchingRef.current = false;
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  // Update countdown every second (native: while the tab is on screen)
  useEffect(() => {
    if (!active) return undefined;
    setCurrentTime(new Date());
    const countdownIntervalId = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(countdownIntervalId);
  }, [active]);

  // Track which orders have been marked as ready to avoid duplicate API calls
  const markedReadyOrdersRef = useRef(new Set());

  // Auto-mark orders as ready when ETA reaches 0 (native: while the tab is on screen)
  useEffect(() => {
    if (!active || orders.length === 0) return undefined;

    const checkAndMarkReady = async () => {
      const now = new Date();
      for (const order of orders) {
        const orderKey = order.mongoId || order.orderId;

        // Skip if already marked as ready
        if (markedReadyOrdersRef.current.has(orderKey)) continue;

        // No prep time chosen (old order): nothing to count down or auto-complete
        if (!(order.initialETA > 0)) continue;

        // Calculate remaining ETA
        const elapsedMs = now - order.preparingTimestamp;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const remainingMinutes = Math.max(0, order.initialETA - elapsedMinutes);

        // If ETA has reached 0 (or slightly past), mark as ready
        if (remainingMinutes <= 0 && order.status === 'preparing') {
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          const totalETASeconds = order.initialETA * 60;

          // Mark as ready when ETA time has elapsed (with 2 second buffer)
          if (elapsedSeconds >= totalETASeconds - 2) {
            try {
              markedReadyOrdersRef.current.add(orderKey); // Mark as processing
              await restaurantAPI.markOrderReady(order.mongoId || order.orderId);
              onStatusChanged?.();
              // Order will be removed from preparing list on next fetch
            } catch (error) {
              const status = error.response?.status;
              const msg = (error.response?.data?.message || error.message || '').toLowerCase();
              // If 400 and message says order cannot be marked ready (e.g. already ready),
              // treat as idempotent - backend cron or another client already marked it.
              if (status === 400 && (msg.includes('cannot be marked as ready') || msg.includes('current status'))) {
                // Keep in markedReadyOrdersRef so we don't retry; order will disappear on next fetch
              } else {
                debugError(`Failed to auto-mark order ${order.orderId} as ready:`, error);
                markedReadyOrdersRef.current.delete(orderKey);
              }
            }
          }
        }
      }
    };

    // Check every 2 seconds for orders that need to be marked ready
    const readyCheckInterval = setInterval(checkAndMarkReady, 2000);
    return () => clearInterval(readyCheckInterval);
  }, [orders, onStatusChanged, active]);

  // Clear marked orders when orders list changes (orders moved to ready)
  useEffect(() => {
    const currentOrderKeys = new Set(orders.map((o) => o.mongoId || o.orderId));
    for (const key of markedReadyOrdersRef.current) {
      if (!currentOrderKeys.has(key)) markedReadyOrdersRef.current.delete(key);
    }
  }, [orders]);

  const handleMarkReady = async ({ orderId, mongoId, customerName }) => {
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) => prev.filter((order) => (order.mongoId || order.orderId) !== orderKey));
      toast.success(`Order ${orderId} marked ready${customerName ? ` for ${customerName}` : ''}`);
      onStatusChanged?.();
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || 'Failed to mark order as ready';
      if (status === 400 && String(message).toLowerCase().includes('current status')) {
        setOrders((prev) => prev.filter((order) => (order.mongoId || order.orderId) !== orderKey));
        toast.success(`Order ${orderId} is already ready`);
        onStatusChanged?.();
      } else {
        toast.error(message);
      }
    } finally {
      setMarkingReadyOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderKey];
        return next;
      });
    }
  };

  if (loading) return <ListLoading title="Preparing orders" />;

  return (
    <View style={s.listWrap}>
      <SectionHeader title="Preparing orders" right={<Text style={s.xsGray}>{orders.length} active</Text>} />
      {orders.length === 0 ? (
        <Text style={s.listEmpty}>No orders in preparation</Text>
      ) : (
        <View>
          {orders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              orderId={order.orderId}
              mongoId={order.mongoId}
              status={order.status}
              customerName={order.customerName}
              type={order.type}
              tableOrToken={order.tableOrToken}
              timePlaced={order.timePlaced}
              eta={order.initialETA > 0 ? etaFor(order, currentTime) : ''}
              itemsSummary={order.itemsSummary}
              photoUrl={order.photoUrl}
              photoAlt={order.photoAlt}
              paymentMethod={order.paymentMethod}
              payableTotal={order.payableTotal}
              deliveryPartnerId={order.deliveryPartnerId}
              dispatchStatus={order.dispatchStatus}
              onSelect={onSelectOrder}
              onCancel={onCancel}
              onMarkReady={handleMarkReady}
              isMarkingReady={Boolean(markingReadyOrderIds[order.mongoId || order.orderId])}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ Ready / Out for delivery lists
function useStatusList(refreshToken, statusValue, excludeDining, label) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const filtered = response.data.data.orders.filter(
            (order) => order.status === statusValue && (!excludeDining || String(order.orderType || '').toLowerCase() !== 'dining'),
          );

          const transformedOrders = filtered.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || statusValue,
            customerName: order.userId?.name || 'Customer',
            type:
              order.orderType === 'takeaway'
                ? 'Takeaway'
                : order.orderType === 'dining'
                  ? 'Dining'
                  : order.deliveryFleet === 'standard'
                    ? 'Home Delivery'
                    : 'Express Delivery',
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            eta: null, // Don't show ETA for ready / out for delivery orders
            itemsSummary: itemsSummaryOf(order),
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || 'Order',
            paymentMethod: order.paymentMethod || order.payment?.method || null,
            payableTotal: Number(order.pricing?.customerTotal ?? order.pricing?.total ?? order.total ?? 0) || 0,
            deliveryPartnerId: order.deliveryPartnerId || null,
            dispatchStatus: order.dispatch?.status || null,
            restaurantNote: order.restaurantNote || null,
          }));

          setOrders(transformedOrders);
          setLoading(false);
        } else {
          setOrders([]);
          setLoading(false);
        }
      } catch (error) {
        if (!isMounted) return;
        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError(`Error fetching ${label}:`, error);
        }
        setOrders([]);
        setLoading(false);
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken, statusValue, excludeDining, label]); // Re-fetch only when parent requests it

  return { orders, loading };
}

function ReadyOrders({ onSelectOrder, onVerifyTakeaway, refreshToken = 0 }) {
  const { orders, loading } = useStatusList(refreshToken, 'ready', true, 'ready orders');

  if (loading) return <ListLoading title="Ready for pickup" />;

  return (
    <View style={s.listWrap}>
      <SectionHeader title="Ready for pickup" right={<Text style={s.xsGray}>{orders.length} active</Text>} />
      {orders.length === 0 ? (
        <Text style={s.listEmpty}>No orders ready for pickup</Text>
      ) : (
        <View>
          {orders.map((order) => (
            <OrderCard key={order.orderId || order.mongoId} {...order} onSelect={onSelectOrder} onVerifyTakeaway={onVerifyTakeaway} />
          ))}
        </View>
      )}
    </View>
  );
}

// Out for Delivery Orders List
const OutForDeliveryOrders = ({ onSelectOrder, refreshToken = 0 }) => {
  const { orders, loading } = useStatusList(refreshToken, 'out_for_delivery', false, 'out for delivery orders');

  if (loading) return <ListLoading title="Out for delivery" />;

  return (
    <View style={s.listWrap}>
      <SectionHeader title="Out for delivery" right={<Text style={s.xsGray}>{orders.length} active</Text>} />
      {orders.length === 0 ? (
        <Text style={s.listEmpty}>No orders out for delivery</Text>
      ) : (
        <View>
          {orders.map((order) => (
            <OrderCard key={order.orderId || order.mongoId} {...order} onSelect={onSelectOrder} />
          ))}
        </View>
      )}
    </View>
  );
};

// Empty State Component (web: only reached for an unknown filter id)
function EmptyState({ message = 'Temporarily closed' }) {
  const stroke = colors.gray[300];
  return (
    <View style={s.emptyState}>
      {/* Store Illustration */}
      <View style={{ marginBottom: sp(6) }}>
        <Svg width={200} height={200} viewBox="0 0 200 200" fill="none">
          <Rect x="40" y="80" width="120" height="80" stroke={stroke} strokeWidth="2" fill="white" />
          <Path d="M30 80 L100 50 L170 80" stroke={stroke} strokeWidth="2" fill="white" />
          <Rect x="60" y="100" width="30" height="60" stroke={stroke} strokeWidth="2" fill="white" />
          <Rect x="110" y="100" width="30" height="60" stroke={stroke} strokeWidth="2" fill="white" />
          <Rect x="70" y="140" width="40" height="25" stroke={stroke} strokeWidth="1.5" fill="white" />
          <SvgText x="85" y="155" fontSize="8" fill={stroke} textAnchor="middle">
            CLOSED
          </SvgText>
          <Rect x="80" y="170" width="40" height="20" stroke={stroke} strokeWidth="1.5" fill="white" />
        </Svg>
      </View>

      {/* Message */}
      <Text style={s.emptyTitle}>{message}</Text>

      {/* View Status Button */}
      <Pressable
        onPress={() => {
          // If message is related to rejection/offline, go to status page, otherwise refresh orders
          if (message?.toLowerCase().includes('rejected') || message?.toLowerCase().includes('closed')) {
            hardNavigate('/food/restaurant/status', { replace: false });
          } else {
            window.dispatchEvent(new Event('restaurantProfileRefresh'));
          }
        }}
        style={s.emptyBtn}
      >
        <BrandFill r={10} />
        <Text style={s.emptyBtnText}>View status</Text>
      </Pressable>
    </View>
  );
}

// ------------------------------------------------------------------ styles
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray[100] },
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
  rowGap1: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  rowGap2: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  rowGap3: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBetweenStart: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(2) },
  rowBetweenEnd: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: sp(2) },
  xsGray: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  dot4: { width: 4, height: 4, borderRadius: 2 },
  dot6: { width: 6, height: 6, borderRadius: 3 },
  dot8: { width: 8, height: 8, borderRadius: 4 },

  // filter area
  filterArea: { zIndex: 40, backgroundColor: colors.gray[100], paddingHorizontal: sp(4), paddingBottom: sp(2) },
  searchIcon: { position: 'absolute', left: sp(3), top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  searchInput: {
    width: '100%',
    paddingLeft: 40,
    paddingRight: sp(4),
    paddingVertical: sp(3),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[100],
    borderRadius: 16,
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[900],
    ...shadow.sm,
  },
  searchClear: { position: 'absolute', right: sp(3), top: 0, bottom: 0, justifyContent: 'center' },
  filterBar: { gap: sp(2), paddingVertical: sp(1), paddingHorizontal: 2 },
  chip: { paddingHorizontal: sp(6), paddingVertical: 14, borderRadius: 9999, overflow: 'hidden' },
  chipText: { fontWeight: '500', fontSize: 14, lineHeight: 20 },
  chipDot: { width: 8, height: 8, borderRadius: 4, overflow: 'hidden' },
  countPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999 },
  countPillText: { fontSize: 10, lineHeight: 12, fontWeight: '900' },

  // status cards
  statusCard: { marginTop: sp(4), marginBottom: sp(4), borderRadius: 16, paddingHorizontal: sp(6), paddingVertical: sp(4), backgroundColor: colors.white, borderWidth: 1, ...shadow.sm },
  deniedIcon: { borderRadius: 9999, padding: sp(2), backgroundColor: colors.red[100] },
  deniedTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: BRAND, marginBottom: sp(2) },
  reasonBox: { backgroundColor: colors.red[50], borderWidth: 1, borderColor: colors.red[200], borderRadius: 10, padding: sp(3), marginBottom: sp(3) },
  reasonLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.red[800], marginBottom: sp(2) },
  reasonText: { fontSize: 12, lineHeight: 16, color: colors.red[700] },
  reverifyHint: { fontSize: 14, lineHeight: 20, color: colors.gray[700], marginBottom: sp(3) },
  reverifyBtn: { width: '100%', paddingHorizontal: sp(6), paddingVertical: 10, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', gap: sp(2), alignItems: 'center', justifyContent: 'center' },
  reverifyText: { color: colors.white, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  verifyTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900], marginBottom: sp(1) },
  verifyText: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  diningIcon: { padding: sp(2), borderRadius: 9999, backgroundColor: colors.blue[100] },
  diningTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  underReview: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: colors.blue[500], letterSpacing: 1 },
  topButtons: { paddingVertical: sp(2), flexDirection: 'row', justifyContent: 'center', gap: sp(3), width: '100%' },
  pillBtn: { paddingVertical: sp(3), borderRadius: 9999, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray[200], alignItems: 'center', ...shadow.sm },
  pillText: { fontWeight: '700', fontSize: 14, lineHeight: 20 },

  // lists
  listWrap: { paddingTop: sp(4), paddingBottom: sp(6) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(3) },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.black },
  listEmpty: { textAlign: 'center', paddingVertical: sp(8), color: colors.gray[500], fontSize: 14, lineHeight: 20 },
  historyLink: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: BRAND },
  searching: { alignItems: 'center', justifyContent: 'center', padding: 80 },
  queryPill: { backgroundColor: colors.gray[200], paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 4 },
  queryText: { fontSize: 14, lineHeight: 20, color: colors.gray[700], fontStyle: 'italic' },
  noResults: { backgroundColor: colors.white, borderRadius: 16, padding: 40, alignItems: 'center', ...shadow.sm },
  noResultsIcon: { width: 64, height: 64, backgroundColor: colors.gray[100], borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: sp(4) },
  noResultsTitle: { color: colors.gray[900], fontWeight: '700', marginBottom: sp(1), fontSize: 16, lineHeight: 24 },

  // history (completed / cancelled) cards
  histCard: { width: '100%', backgroundColor: colors.white, borderRadius: 14, padding: sp(3), marginBottom: 10, borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
  histRow: { flexDirection: 'row', gap: sp(3), alignItems: 'stretch' },
  photoBox: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center', alignSelf: 'center', borderWidth: 1, borderColor: colors.gray[100] },
  photoAlt: { fontSize: 9, lineHeight: 11, fontWeight: '500', color: colors.gray[400], textAlign: 'center' },
  photoAltSmall: { fontSize: 8, lineHeight: 9, fontWeight: '700', color: colors.slate[300], textAlign: 'center' },
  histBody: { flex: 1, minHeight: 80, justifyContent: 'space-between', minWidth: 0 },
  histId: { fontSize: 13, lineHeight: 15, fontWeight: '700', color: colors.slate[900] },
  histCustomer: { fontSize: 10, lineHeight: 14, color: colors.gray[500], marginTop: 4, fontWeight: '500' },
  histBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999, borderWidth: 1 },
  histBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: '700' },
  histDate: { fontSize: 9, lineHeight: 12, color: colors.gray[400], fontWeight: '500' },
  histItems: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  histReason: { fontSize: 10, lineHeight: 14, color: BRAND, marginTop: 4 },
  histType: { fontSize: 11, lineHeight: 15, color: colors.gray[500] },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  histAmount: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.black },

  // dining bookings
  bookingsLoading: { textAlign: 'center', paddingVertical: 40, color: colors.gray[400], fontSize: 16, lineHeight: 24 },
  refreshLink: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: '#dc2626', letterSpacing: 1 },
  bookingsEmpty: { alignItems: 'center', paddingVertical: sp(12), backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.gray[200] },
  bookingCard: { backgroundColor: colors.white, borderRadius: 16, padding: sp(4), borderWidth: 1, borderColor: colors.gray[200], ...shadow.sm },
  bookingName: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900] },
  bookingPhone: { fontSize: 11, lineHeight: 15, color: colors.gray[500] },
  bookingStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1, ...shadow.sm },
  bookingStatusText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  bookingMeta: { flexDirection: 'row', alignItems: 'center', gap: sp(4), backgroundColor: colors.gray[50], padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.gray[100], flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, lineHeight: 15, color: colors.gray[600] },
  specialBox: { marginTop: sp(3), padding: sp(2), backgroundColor: alpha(colors.blue[50], 0.5), borderRadius: 10, borderWidth: 1, borderColor: alpha(colors.blue[100], 0.5), flexDirection: 'row', gap: 4, alignItems: 'flex-start' },
  specialText: { fontSize: 10, lineHeight: 14, color: colors.blue[700], fontStyle: 'italic', flex: 1 },
  bookingAccept: { flex: 1, paddingVertical: sp(2), borderRadius: 14, overflow: 'hidden', alignItems: 'center', ...shadow.sm },
  bookingAcceptText: { color: colors.white, fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1.1 },
  bookingDecline: { flex: 1, paddingVertical: sp(2), backgroundColor: colors.white, borderWidth: 1, borderColor: colors.rose[200], borderRadius: 14, alignItems: 'center' },
  bookingDeclineText: { color: colors.slate[600], fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1.1 },

  // order card
  orderCard: { width: '100%', backgroundColor: colors.white, borderRadius: 14, marginBottom: sp(3), borderWidth: 1, borderColor: colors.slate[100], overflow: 'hidden', ...shadow.sm },
  cardStripe: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4 },
  cardRow: { flexDirection: 'row', gap: sp(3), alignItems: 'center', padding: sp(3), paddingLeft: sp(3) + 4 },
  cardId: { fontSize: 11, lineHeight: 15, fontWeight: '900', color: colors.slate[900], flexShrink: 1 },
  cardBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, borderWidth: 1 },
  cardBadgeText: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.6 },
  adminNote: { marginTop: 4, fontSize: 8, lineHeight: 11, fontWeight: '500', color: colors.slate[500], fontStyle: 'italic', maxWidth: 150 },
  cardCancel: { padding: 4, borderRadius: 9999, backgroundColor: colors.rose[50] },
  cardCustomer: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: colors.slate[500], letterSpacing: -0.2, maxWidth: '65%', flexShrink: 1 },
  cardType: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, borderWidth: 1 },
  cardTypeText: { fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: -0.2 },
  cardItem: { fontSize: 12, lineHeight: 15, color: colors.slate[900], fontWeight: '800', flexShrink: 1 },
  collectCash: { marginBottom: 6, alignSelf: 'flex-start', paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 6, backgroundColor: restaurantTheme.primarySoft, borderWidth: 1, borderColor: colors.amber[200] },
  collectCashText: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: restaurantTheme.primaryStrong },
  cardTime: { fontSize: 9, lineHeight: 12, color: colors.slate[400], fontWeight: '700', letterSpacing: -0.2, marginBottom: 4 },
  cardNote: { marginBottom: sp(2), paddingHorizontal: sp(2), paddingVertical: 4, backgroundColor: colors.blue[50], borderWidth: 1, borderColor: colors.blue[100], borderRadius: 6 },
  cardNoteText: { fontSize: 9, lineHeight: 12, color: colors.blue[700], fontWeight: '700', fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: sp(2), paddingTop: sp(2), borderTopWidth: 1, borderTopColor: colors.slate[50], marginTop: 6 },
  etaLabel: { fontSize: 8, lineHeight: 11, fontWeight: '700', color: colors.slate[400] },
  etaValue: { fontSize: 11, lineHeight: 15, fontWeight: '900', color: colors.slate[800] },
  driverTick: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.emerald[100], alignItems: 'center', justifyContent: 'center' },
  dispatchPill: { borderWidth: 1, borderColor: colors.slate[100], borderRadius: 9999, paddingHorizontal: sp(2), paddingVertical: 2 },
  dispatchText: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.6, color: colors.slate[400] },
  cardBtn: { paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: 10, ...shadow.sm },
  cardBtnText: { fontSize: 9, lineHeight: 12, fontWeight: '900', color: colors.white },

  // new order popup
  orderPopup: { maxWidth: 448, borderRadius: 16, backgroundColor: colors.white, ...shadow['2xl'] },
  popupInner: { flexShrink: 1 },
  popupHeader: { paddingHorizontal: sp(4), paddingVertical: sp(3), backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  popupOrderId: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  typeTag: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 9999 },
  typeTagText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  muteBtn: { padding: sp(2), borderRadius: 10 },
  typeCard: { marginBottom: sp(4), borderWidth: 1, borderRadius: 14, padding: sp(3), flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) },
  typeCardIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  typeCardLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  typeCardText: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  popNote: { marginBottom: sp(4), backgroundColor: colors.blue[50], borderWidth: 1, borderColor: colors.blue[200], borderRadius: 10, padding: sp(3) },
  popNoteLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.blue[800], letterSpacing: 0.5 },
  popNoteText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.blue[900] },
  detailsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: sp(2), borderBottomWidth: 1, borderBottomColor: colors.gray[200], marginBottom: sp(3) },
  detailsTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  popItem: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3), padding: sp(3), borderRadius: 14, borderWidth: 1, borderColor: alpha(colors.slate[200], 0.9) },
  popItemLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 },
  vegBox: { width: 16, height: 16, borderWidth: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  qtyPill: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 10, backgroundColor: colors.gray[900], borderWidth: 1, borderColor: colors.gray[800] },
  qtyText: { color: colors.amber[400], fontWeight: '900', fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  popItemName: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: colors.gray[950] },
  wrapRow: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  variantPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.rose[100], borderWidth: 2, borderColor: colors.rose[300], paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 },
  variantDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose[600] },
  variantText: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.rose[900] },
  addonPill: { backgroundColor: colors.slate[100], borderWidth: 1, borderColor: colors.slate[300], paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8 },
  addonText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[800] },
  priceBox: { backgroundColor: alpha(colors.gray[100], 0.9), borderWidth: 1, borderColor: colors.gray[200], paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  priceText: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.gray[900] },
  markupText: { fontSize: 10, lineHeight: 13, fontWeight: '600', color: colors.rose[700] },
  markupTotal: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: colors.gray[900] },
  moreBtn: { marginTop: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[300] },
  moreText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.gray[500] },
  billRow: { marginBottom: sp(4), paddingVertical: sp(3), borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.gray[200] },
  billValue: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  billMarkup: { fontSize: 16, lineHeight: 24, color: colors.rose[700], fontWeight: '600' },
  billCustomer: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[600] },
  popLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[700] },
  payValue: { fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  stepBtn: { padding: 6, backgroundColor: colors.gray[100], borderRadius: 9999 },
  prepValue: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900], minWidth: 60, textAlign: 'center' },
  popupFooter: { paddingHorizontal: sp(4), paddingBottom: sp(4), paddingTop: sp(3), borderTopWidth: 1, borderTopColor: colors.gray[200], backgroundColor: colors.white },
  cancelledBox: { borderRadius: 14, borderWidth: 1, borderColor: colors.red[200], backgroundColor: colors.red[50], paddingHorizontal: sp(4), paddingVertical: sp(3) },
  cancelledTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.red[700] },
  cancelledText: { marginTop: 4, fontSize: 12, lineHeight: 16, color: BRAND },
  slider: { height: 56, borderRadius: 16, overflow: 'hidden', justifyContent: 'center' },
  countdownBar: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  sliderLabelWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 },
  sliderLabel: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: colors.white, textAlign: 'center' },
  sliderHandle: { position: 'absolute', left: 8, top: 8, width: 40, height: 40, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', zIndex: 20, ...shadow.md },
  sliderHandleText: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  rejectBtn: { width: '100%', backgroundColor: colors.white, borderWidth: 2, borderColor: colors.red[500], paddingVertical: sp(3), borderRadius: 10, alignItems: 'center' },
  rejectText: { color: BRAND, fontWeight: '600', fontSize: 14, lineHeight: 20 },

  // reject / cancel reasons
  reasonPopup: { maxWidth: 448, borderRadius: 16, backgroundColor: colors.white, ...shadow['2xl'] },
  reasonHead: { paddingHorizontal: sp(4), paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  reasonTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  reasonSub: { fontSize: 12, lineHeight: 16, color: colors.gray[500], marginTop: 4 },
  reasonOption: { padding: sp(3), borderRadius: 10, borderWidth: 2, borderColor: colors.gray[200], backgroundColor: colors.white },
  reasonOptionOn: { borderColor: BRAND, backgroundColor: colors.red[50] },
  reasonOptionText: { fontSize: 14, lineHeight: 20, fontWeight: '500', flexShrink: 1 },
  reasonCheck: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cancelOption: { paddingHorizontal: sp(3), paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.gray[200] },
  cancelRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  reasonFooter: { paddingHorizontal: sp(4), paddingVertical: sp(3), backgroundColor: colors.gray[50], borderTopWidth: 1, borderTopColor: colors.gray[200], flexDirection: 'row', gap: sp(2) },
  reasonCancel: { flex: 1, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.gray[300], paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  reasonCancelText: { color: colors.gray[700], fontWeight: '600', fontSize: 14, lineHeight: 20 },
  reasonConfirm: { flex: 1, paddingVertical: 10, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', gap: sp(2), alignItems: 'center', justifyContent: 'center' },
  confirmShadow: { elevation: 4, shadowColor: '#7f1d1d', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  reasonConfirmText: { color: colors.white, fontWeight: '600', fontSize: 14, lineHeight: 20 },

  // takeaway OTP
  otpPopup: { width: '95%', maxWidth: 384, borderRadius: 24, backgroundColor: colors.white, ...shadow['2xl'] },
  otpHeader: { paddingHorizontal: sp(6), paddingTop: sp(6), paddingBottom: sp(8), alignItems: 'center', overflow: 'hidden' },
  otpCircle: { position: 'absolute', borderRadius: 9999 },
  otpBag: { width: 56, height: 56, borderRadius: 16, backgroundColor: alpha(colors.white, 0.2), alignItems: 'center', justifyContent: 'center', marginBottom: sp(3), ...shadow.lg },
  otpTitle: { color: colors.white, fontWeight: '900', fontSize: 18, lineHeight: 28, letterSpacing: -0.4 },
  otpSub: { color: alpha(colors.white, 0.7), fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 1.1, marginTop: 2 },
  otpOrderCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], padding: sp(4), flexDirection: 'row', alignItems: 'center', gap: sp(3), ...shadow.lg },
  otpPhoto: { width: 56, height: 56, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.slate[100], ...shadow.sm },
  otpOrderLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400], letterSpacing: 0.5 },
  otpOrderId: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  otpCustomer: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[700], marginTop: 2 },
  otpItems: { fontSize: 12, lineHeight: 16, color: colors.slate[400], fontStyle: 'italic' },
  cashBox: { borderRadius: 16, backgroundColor: restaurantTheme.primarySoft, borderWidth: 1, borderColor: colors.amber[200], paddingHorizontal: sp(4), paddingVertical: sp(3), alignItems: 'center' },
  cashLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, color: restaurantTheme.primaryStrong },
  cashValue: { fontSize: 30, lineHeight: 36, fontWeight: '900', color: colors.amber[800], marginTop: 2 },
  paidBox: { borderRadius: 16, backgroundColor: colors.emerald[50], borderWidth: 1, borderColor: colors.emerald[200], paddingHorizontal: sp(4), paddingVertical: sp(2), alignItems: 'center' },
  paidLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, color: restaurantTheme.primaryStrong },
  otpInputLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: colors.slate[400], letterSpacing: 1, marginBottom: sp(3), textAlign: 'center' },
  otpInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '900',
    letterSpacing: 28,
    paddingLeft: 14,
    paddingVertical: sp(4),
    borderWidth: 2,
    borderColor: colors.slate[200],
    borderRadius: 16,
    backgroundColor: colors.slate[50],
    color: colors.slate[800],
    fontFamily: 'monospace',
  },
  otpActions: { flexDirection: 'row', gap: sp(3), paddingHorizontal: sp(5), paddingTop: sp(3), paddingBottom: sp(6) },
  otpCancel: { flex: 1, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.slate[200], paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  otpCancelText: { color: colors.slate[500], fontWeight: '900', fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  otpConfirm: { flex: 1, paddingVertical: 14, borderRadius: 16, overflow: 'hidden', alignItems: 'center' },
  otpConfirmShadow: { elevation: 8, shadowColor: '#DC2626', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  otpConfirmText: { color: colors.white, fontWeight: '900', fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },

  // order details modal
  detailsPopup: { maxWidth: 384, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[100], ...shadow['2xl'] },
  handleBar: { height: 4, width: 40, borderRadius: 2, backgroundColor: colors.gray[200] },
  detTitle: { fontSize: 16, lineHeight: 24, fontWeight: '800', color: colors.black },
  detCustomer: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.gray[600], marginTop: 2 },
  detType: { fontSize: 12, lineHeight: 16, color: colors.gray[500], marginTop: 2, fontWeight: '500' },
  detStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  detStatusText: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.5 },
  detTime: { fontSize: 11, lineHeight: 15, fontWeight: '500', color: colors.gray[400] },
  detDivider: { borderTopWidth: 1, borderTopColor: colors.gray[100], marginVertical: sp(3) },
  detItemsLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: colors.gray[900], marginBottom: sp(2), letterSpacing: 0.3 },
  detItem: { flexDirection: 'row', alignItems: 'center', gap: sp(2), backgroundColor: colors.slate[50], paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: alpha(colors.slate[200], 0.8), ...shadow.sm },
  detItemText: { fontSize: 14, lineHeight: 19, color: colors.slate[900], fontWeight: '700', flexShrink: 1 },
  detMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(4), backgroundColor: alpha(colors.gray[50], 0.8), paddingHorizontal: sp(3), paddingVertical: sp(2), borderRadius: 10 },
  detMetaText: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  detNote: { marginBottom: sp(4), padding: sp(3), borderWidth: 1, borderRadius: 14 },
  detNoteLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', marginBottom: 4 },
  detNoteText: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  detClose: { width: '100%', paddingVertical: sp(3), borderRadius: 14, overflow: 'hidden', alignItems: 'center', ...shadow.md },
  detCloseText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '700' },

  // empty state
  emptyState: { alignItems: 'center', justifyContent: 'center', minHeight: 400, paddingVertical: sp(12) },
  emptyTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.gray[600], marginBottom: sp(4), textAlign: 'center' },
  emptyBtn: { paddingHorizontal: sp(6), paddingVertical: sp(3), borderRadius: 10, overflow: 'hidden' },
  emptyBtnText: { color: colors.white, fontWeight: '500', fontSize: 16, lineHeight: 24 },
});
