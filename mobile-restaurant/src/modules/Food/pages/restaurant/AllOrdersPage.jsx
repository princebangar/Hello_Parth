// Web: pages/restaurant/AllOrdersPage.jsx — /food/restaurant/orders/all "Order History": search by order id, filter
// sheet (status / ratings / KPT delay / complaints / order type), date range popup (today / last 7 / last 30 / this
// month / custom calendar), order cards -> /orders/:id, new orders from the socket prepended live, copy id toast.
// Same API (GET restaurant orders page 1 limit 1000, filtered by date on the device), same texts and states.
// Native:
// - The web's DateRangeCalendar (components/ui/date-range-calendar, not part of the app) is drawn here with the same
//   grid (Mon-first, 6 weeks), colours and selection rules.
// - Popups (date range, calendar, filters, "Applying filters...") are native Modals (Dialog / Sheet).
// - framer-motion card entrance -> none (cards show at once; the fade read as a blink on the phone).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { ArrowLeft, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Filter, HelpCircle, Search, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Dialog, Screen, Sheet, Text, TextInput } from '@/native/ui';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { restaurantAPI } from '@food/api';
import { useRestaurantNotifications } from '@food/hooks/useRestaurantNotifications';

const debugError = () => {};

const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

// Date Range Helpers
const getToday = () => {
  const today = new Date();
  return { start: today, end: today };
};

const getLast7Days = () => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6); // includes today (7 days)
  return { start, end: today };
};

const getLast30Days = () => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 29);
  return { start, end: today };
};

const getThisMonth = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start, end: today };
};

const dateRangeOptions = [
  { label: 'today', getDates: getToday },
  { label: 'last 7 days', getDates: getLast7Days },
  { label: 'last 30 days', getDates: getLast30Days },
  { label: 'this month', getDates: getThisMonth },
  { label: 'custom date range', custom: true },
];

const capitalize = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());

// Filter categories and options
const filterCategories = [
  { id: 'Order status', label: 'Order status' },
  { id: 'Ratings', label: 'Ratings' },
  { id: 'KPT delay', label: 'KPT delay' },
  { id: 'Complaints', label: 'Complaints' },
  { id: 'Order type', label: 'Order type' },
];

const filterOptions = {
  'Order status': [
    { id: 'preparing', label: 'Preparing', key: 'orderStatus' },
    { id: 'ready', label: 'Ready', key: 'orderStatus' },
    { id: 'out-for-delivery', label: 'Out for delivery', key: 'orderStatus' },
    { id: 'delivered', label: 'Delivered', key: 'orderStatus' },
    { id: 'rejected', label: 'Rejected', key: 'orderStatus' },
    { id: 'cancelled', label: 'Cancelled', key: 'orderStatus' },
  ],
  Ratings: [
    { id: '5-star', label: '5★ or less', key: 'ratings', value: 5 },
    { id: '4-star', label: '4★ or less', key: 'ratings', value: 4 },
    { id: '3-star', label: '3★ or less', key: 'ratings', value: 3 },
    { id: '2-star', label: '2★ or less', key: 'ratings', value: 2 },
    { id: '1-star', label: '1★', key: 'ratings', value: 1 },
  ],
  'KPT delay': [
    { id: '0-10', label: '0-10 mins', key: 'kptDelay' },
    { id: '10-20', label: '10-20 mins', key: 'kptDelay' },
    { id: '20-30', label: '20-30 mins', key: 'kptDelay' },
    { id: '30-plus', label: '30+ mins', key: 'kptDelay' },
  ],
  Complaints: [
    { id: 'order-delayed', label: 'Order delayed', key: 'complaints' },
    { id: 'wrong-items', label: 'Wrong item(s) delivered', key: 'complaints' },
    { id: 'missing-items', label: 'Item(s) missing or not delivered', key: 'complaints' },
    { id: 'poor-taste', label: 'Poor taste or quality', key: 'complaints' },
    { id: 'poor-packaging', label: 'Poor packaging or spillage', key: 'complaints' },
    { id: 'out-of-stock', label: 'Item(s) out of stock', key: 'complaints' },
    { id: 'not-delivered', label: 'Order not delivered', key: 'complaints' },
  ],
  'Order type': [
    { id: 'takeaway', label: 'Takeaway', key: 'orderType' },
    { id: 'dining', label: 'Dining', key: 'orderType' },
    { id: 'home-delivery', label: 'Home delivery', key: 'orderType' },
    { id: 'self-delivery', label: 'Self delivery', key: 'orderType' },
    { id: 'food-rescue', label: 'Food rescue', key: 'orderType' },
    { id: 'large-order', label: 'Large order', key: 'orderType' },
    { id: 'veg-only', label: 'Veg only', key: 'orderType' },
    { id: 'irctc', label: 'IRCTC', key: 'orderType' },
    { id: 'replacement', label: 'Replacement', key: 'orderType' },
    { id: 'hospital', label: 'Hospital', key: 'orderType' },
  ],
};

const EMPTY_FILTERS = { orderStatus: [], ratings: [], kptDelay: [], complaints: [], orderType: [] };

function BrandFill({ r = 0, horizontal = false }) {
  return (
    <LinearGradient
      colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
      start={{ x: 0, y: 0 }}
      end={horizontal ? { x: 1, y: 0 } : { x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { borderRadius: r }]}
    />
  );
}

const CheckSvg = ({ size = 20, color = colors.green[400] }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>
    <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </Svg>
);

// ------------------------------------------------------------------ web components/ui/date-range-calendar.tsx
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DateRangeCalendar({ startDate, endDate, onDateRangeChange, onClose }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);
  const closeTimer = useRef(null);
  useEffect(() => () => closeTimer.current && clearTimeout(closeTimer.current), []);

  // Sync current month with selected dates
  useEffect(() => {
    if (startDate) {
      setCurrentMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
    }
  }, [startDate]);

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const first = new Date(firstDay);
    first.setDate(first.getDate() - first.getDay() + (first.getDay() === 0 ? -6 : 1)); // Start from Monday
    const days = [];
    const currentDate = new Date(first);
    // Generate 6 weeks (42 days)
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return days;
  }, [currentMonth]);

  const isCurrentMonth = (date) => date.getMonth() === currentMonth.getMonth();
  const isInRange = (date) => {
    if (!tempStartDate && !tempEndDate) return false;
    if (tempStartDate && tempEndDate) {
      const t = date.getTime();
      return t >= tempStartDate.getTime() && t <= tempEndDate.getTime();
    }
    return false;
  };
  const isStartDate = (date) => Boolean(tempStartDate) && date.toDateString() === tempStartDate.toDateString();
  const isEndDate = (date) => Boolean(tempEndDate) && date.toDateString() === tempEndDate.toDateString();

  const handleDateClick = (date) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      // Start new selection
      setTempStartDate(date);
      setTempEndDate(null);
    } else if (tempStartDate && !tempEndDate) {
      // Select end date
      let finalStart = tempStartDate;
      let finalEnd = date;
      if (date.getTime() < tempStartDate.getTime()) {
        // If clicked date is before start date, swap them
        finalStart = date;
        finalEnd = tempStartDate;
      }
      setTempStartDate(finalStart);
      setTempEndDate(finalEnd);
      // Apply the selection
      onDateRangeChange(finalStart, finalEnd);
      if (onClose) {
        closeTimer.current = setTimeout(() => onClose(), 300);
      }
    }
  };

  const fmt = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const formatRange = () => {
    if (tempStartDate && tempEndDate) return `${fmt(tempStartDate)} - ${fmt(tempEndDate)}`;
    if (tempStartDate) return `${fmt(tempStartDate)} - Select end date`;
    return 'Select start date';
  };

  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) weeks.push(calendarDays.slice(i, i + 7));

  return (
    <View style={styles.cal}>
      {/* Header */}
      <View style={[styles.rowBetween, { marginBottom: sp(4) }]}>
        <Pressable
          onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
          style={({ pressed }) => [styles.calNav, pressed && { backgroundColor: colors.gray[100] }]}
        >
          <ChevronLeft size={16} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.calMonth}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </Text>
        <Pressable
          onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
          style={({ pressed }) => [styles.calNav, pressed && { backgroundColor: colors.gray[100] }]}
        >
          <ChevronRight size={16} color={colors.gray[900]} />
        </Pressable>
      </View>

      {/* Week days header */}
      <View style={[styles.calRow, { marginBottom: sp(2) }]}>
        {weekDays.map((day) => (
          <Text key={day} style={styles.calWeekDay}>
            {day}
          </Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={{ gap: sp(1) }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.calRow}>
            {week.map((date, index) => {
              const isCurrentMonthDay = isCurrentMonth(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const inRange = isInRange(date);
              const edge = isStartDate(date) || isEndDate(date);
              let bg = 'transparent';
              let fg = isCurrentMonthDay ? colors.gray[900] : colors.gray[400];
              let weight = '400';
              if (edge) {
                bg = colors.green[500];
                fg = colors.white;
                weight = '600';
              } else if (inRange) {
                bg = colors.green[100];
                fg = restaurantTheme.primaryStrong;
              } else if (isToday) {
                bg = colors.blue[50];
                fg = colors.blue[600];
                weight = '500';
              }
              return (
                <View key={index} style={styles.calCell}>
                  <Pressable
                    onPress={() => handleDateClick(date)}
                    style={({ pressed }) => [styles.calDay, { backgroundColor: pressed && bg === 'transparent' ? colors.gray[100] : bg }]}
                  >
                    <Text style={{ fontSize: 12, lineHeight: 16, color: fg, fontWeight: weight }}>{date.getDate()}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Selected date range display */}
      <View style={styles.calFooter}>
        <Text style={styles.calFooterText}>{formatRange()}</Text>
      </View>
    </View>
  );
}

function OrderCard({ order, index, onPress, onCopy, getStatusStyle }) {
  // web: framer-motion card entrance. App: shown at once (Prince, 27 Oct: the fade read as a blink)
  const status = getStatusStyle(order.status);
  return (
    <View>
      <Pressable onPress={onPress} style={styles.card}>
        {/* Status and Order ID Row */}
        <View style={[styles.rowBetween, { alignItems: 'flex-start', marginBottom: sp(3) }]}>
          <View style={[styles.rowGap2, { flexWrap: 'wrap', flex: 1 }]}>
            <View style={[styles.badge, { backgroundColor: status.bg, overflow: 'hidden' }]}>
              {status.gradient ? <BrandFill r={4} /> : null}
              <Text style={styles.badgeText}>{order.status}</Text>
            </View>
            {order.tags
              ? order.tags.map((tag, idx) => {
                  let bg = colors.green[600];
                  if (tag === 'TAKEAWAY') bg = restaurantTheme.primary;
                  else if (tag === 'DINING') bg = colors.blue[600];
                  else if (tag === 'HOME DELIVERY') bg = colors.slate[600];
                  return (
                    <View key={idx} style={[styles.badge, { backgroundColor: bg }]}>
                      <Text style={styles.badgeText}>{tag}</Text>
                    </View>
                  );
                })
              : null}
          </View>
          <View style={styles.rowGap2}>
            <Text style={styles.xsGray}>
              {order.date}, {order.time}
            </Text>
            <ChevronRight size={16} color={colors.gray[400]} />
          </View>
        </View>

        {/* Order ID */}
        <View style={[styles.rowGap2, { marginBottom: sp(2) }]}>
          <Text style={styles.idText}>ID: {order.id}</Text>
          <Pressable onPress={onCopy} accessibilityLabel="Copy order ID" hitSlop={6} style={({ pressed }) => [styles.copyBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <Copy size={16} color={colors.gray[500]} />
          </Pressable>
        </View>

        {/* Restaurant Info */}
        <Text style={[styles.sm, { color: colors.gray[900], marginBottom: sp(1) }]}>
          {order.restaurant}, {order.address}
        </Text>

        {/* Customer Info */}
        <Text style={[styles.sm, { color: colors.gray[600], marginBottom: sp(3) }]}>Ordered by {order.customer}</Text>

        {/* Divider */}
        <View style={styles.dashed} />

        {/* Order Items */}
        <View style={{ gap: sp(2) }}>
          {order.items.slice(0, 2).map((item, idx) => (
            <View key={idx} style={styles.rowBetween}>
              <Text style={[styles.sm, { color: colors.gray[900], flex: 1 }]}>
                {item.quantity} x {item.name}
              </Text>
              <Text style={[styles.sm, { color: colors.gray[500] }]}>{formatMoney(item.price)}</Text>
            </View>
          ))}
          {order.items.length > 2 ? <Text style={styles.moreItems}>+{order.items.length - 2} more items</Text> : null}
        </View>

        {/* Price Footer */}
        <View style={styles.priceFooter}>
          <Text style={styles.totalLabel}>TOTAL AMOUNT</Text>
          <Text style={styles.totalValue}>{formatMoney(order.totalPrice)}</Text>
        </View>

        {/* Reason/Status Message */}
        {order.reason ? (
          <View style={styles.reasonBox}>
            <Text style={[styles.sm, { color: restaurantTheme.brand }]}>{order.reason}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export default function AllOrdersPage() {
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();
  const { height: winH } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDateRangePopup, setShowDateRangePopup] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState(dateRangeOptions[1]); // Default to "last 7 days"
  const [startDate, setStartDate] = useState(() => dateRangeOptions[1].getDates().start);
  const [endDate, setEndDate] = useState(() => dateRangeOptions[1].getDates().end);

  // Filter states
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [activeFilterCategory, setActiveFilterCategory] = useState('Order status');
  const [filterSearch, setFilterSearch] = useState('');
  const [isApplyingFilters, setIsApplyingFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef(null);

  // Real data states
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restaurantData, setRestaurantData] = useState(null);
  const { newOrder } = useRestaurantNotifications();

  useEffect(() => {
    Animated.timing(toastAnim, { toValue: showToast ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [showToast, toastAnim]);
  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

  // Fetch restaurant data
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        const data = response?.data?.data?.restaurant || response?.data?.restaurant;
        if (data) {
          setRestaurantData(data);
        }
      } catch (err) {
        // Suppress 401 errors as they're handled by axios interceptor
        if (err.response?.status !== 401) {
          debugError('Error fetching restaurant data:', err);
        }
      }
    };
    fetchRestaurantData();
  }, []);

  // Transform API order to component format
  const transformOrder = useCallback(
    (order) => {
      const createdAt = new Date(order.createdAt);
      const date = createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const time = createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      // Format address (backend: deliveryAddress)
      const addr = order.deliveryAddress || order.address || null;
      const address =
        order.orderType === 'takeaway'
          ? 'Self-Pickup Order'
          : addr?.formattedAddress || addr?.address || (addr?.street ? `${addr.street}, ${addr.city || ''}`.trim() : '') || 'Address not available';

      // Get restaurant name
      const restaurantName = restaurantData?.name || order.restaurantId?.name || 'Restaurant';

      // Get customer name
      const customerName = order.userId?.name || order.customerName || 'Customer';

      // Format items
      const items = (order.items || []).map((item) => ({
        name: item.name || 'Item',
        quantity: item.quantity || 1,
        price: item.price || 0,
      }));

      // Determine status (backend: orderStatus)
      let status = (order.orderStatus || order.status || 'created').toUpperCase();
      if (status === 'OUT_FOR_DELIVERY' || status === 'OUT FOR DELIVERY') status = 'OUT FOR DELIVERY';

      // Get rejection/cancellation reason
      let reason = null;
      if (status === 'REJECTED' && order.rejectionReason) {
        reason = `Rejected by Restaurant: ${order.rejectionReason}`;
      } else if (status === 'CANCELLED' && order.cancellationReason) {
        reason = `Cancelled by ${order.cancelledBy === 'customer' ? 'customer' : 'restaurant'}: ${order.cancellationReason}`;
      } else if (status === 'REJECTED') {
        reason = 'Rejected by Restaurant';
      } else if (status === 'CANCELLED') {
        reason = 'Cancelled by customer';
      }

      // Determine tags based on order properties
      const tags = [];
      if (order.scheduledAt) tags.push('SCHEDULED');
      if (order.orderType === 'takeaway') {
        tags.push('TAKEAWAY');
      } else if (order.orderType === 'dining') {
        tags.push('DINING');
      } else {
        tags.push('HOME DELIVERY');
      }
      // Check if all items are veg
      const allVeg = items.every((item) => item.isVeg !== false);
      if (allVeg && items.length > 0) tags.push('VEG ONLY');

      return {
        id: order.orderId || order._id?.toString() || '',
        status,
        date,
        time,
        restaurant: restaurantName,
        address,
        customer: customerName,
        items,
        totalPrice: order.pricing?.total || 0,
        reason,
        tags: tags.length > 0 ? tags : undefined,
        createdAt: order.createdAt,
        mongoId: order._id?.toString(),
        orderType: order.orderType || 'delivery',
      };
    },
    [restaurantData],
  );

  // Fetch orders from backend
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = {
          page: 1,
          limit: 1000, // Get all orders, we'll filter by date on frontend
        };

        const response = await restaurantAPI.getOrders(params);

        if (response.data?.success && response.data.data?.orders) {
          const transformedOrders = response.data.data.orders.map(transformOrder);

          // Filter by date range
          const filteredByDate = transformedOrders.filter((order) => {
            if (!order.createdAt) return false;
            const orderDate = new Date(order.createdAt);
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return orderDate >= start && orderDate <= end;
          });

          setOrders(filteredByDate);
        } else {
          setOrders([]);
        }
      } catch (err) {
        // Suppress 401 errors as they're handled by axios interceptor
        if (err.response?.status !== 401) {
          debugError('Error fetching orders:', err);
          setError(err.message || 'Failed to fetch orders');
        }
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [startDate, endDate, transformOrder]);

  // Realtime: instantly prepend new orders (no refresh)
  useEffect(() => {
    if (!newOrder) return;
    setOrders((prev) => {
      const id = String(newOrder?.orderId || newOrder?._id || '');
      if (!id) return prev;
      if (prev.some((o) => String(o.id) === id || String(o.mongoId) === String(newOrder?._id))) {
        return prev;
      }
      const transformed = transformOrder(newOrder);
      return [transformed, ...prev];
    });
  }, [newOrder, transformOrder]);

  const handleDateRangeChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);

    if (start && end) {
      setSelectedDateRange({ label: 'custom date range', start, end, custom: true });
      setShowCalendar(false);
    }
  };

  const handleDateRangeSelect = (option) => {
    if (option.custom) {
      setShowDateRangePopup(false);
      setShowCalendar(true);
    } else {
      const dates = option.getDates();
      setSelectedDateRange(option);
      setStartDate(dates.start);
      setEndDate(dates.end);
      setShowDateRangePopup(false);
    }
  };

  const formatDateRange = () => {
    if (!startDate || !endDate) return 'Select date range';
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const month = startDate.toLocaleString('en-US', { month: 'short' });
    const year = startDate.getFullYear().toString().slice(-2);
    return `${startDay} - ${endDay} ${month}'${year}`;
  };

  const handleCopyOrderId = (orderId) => {
    navigator.clipboard.writeText(orderId);
    setShowToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), 2000);
  };

  const handleFilterToggle = (option) => {
    const key = option.key;
    const value = option.id;

    // For ratings, only allow one selection (radio button behavior)
    if (key === 'ratings') {
      setFilters((prev) => ({
        ...prev,
        [key]: prev[key].includes(value) ? [] : [value],
      }));
    } else {
      // For other filters, allow multiple selections (checkbox behavior)
      setFilters((prev) => ({
        ...prev,
        [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
      }));
    }
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setFilterSearch('');
  };

  const handleApplyFilters = async () => {
    setIsApplyingFilters(true);
    // web: a short delay before the sheet closes
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsApplyingFilters(false);
    setShowFilterPopup(false);
  };

  const isFilterChecked = (option) => filters[option.key]?.includes(option.id) || false;

  const hasActiveFilters = () => Object.values(filters).some((arr) => arr.length > 0);
  const activeFilterCount = Object.values(filters).flat().length;

  const getStatusStyle = (status) => {
    switch (status) {
      case 'REJECTED':
      case 'CANCELLED':
        return { bg: colors.red[700] };
      case 'DELIVERED':
        return { bg: colors.green[600] };
      case 'PREPARING':
        return { bg: colors.yellow[600] };
      case 'READY':
        return { bg: restaurantTheme.brand, gradient: true };
      case 'OUT FOR DELIVERY':
        return { bg: colors.purple[600] };
      default:
        return { bg: colors.gray[600] };
    }
  };

  const filteredOrders = orders.filter((order) => {
    // Search filter - search in order ID (both full ID and numeric part)
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase().trim();
      const orderIdLower = order.id.toLowerCase();
      // Extract numeric part from order ID (e.g., "ORD-1768751659979-588" -> "1768751659979588")
      const numericPart = order.id.replace(/\D/g, '');
      if (!orderIdLower.includes(searchLower) && !numericPart.includes(searchLower)) {
        return false;
      }
    }

    // Order status filter
    if (filters.orderStatus.length > 0) {
      const statusMap = {
        preparing: 'PREPARING',
        ready: 'READY',
        'out-for-delivery': 'OUT FOR DELIVERY',
        delivered: 'DELIVERED',
        rejected: 'REJECTED',
        cancelled: 'CANCELLED',
      };
      const matchesStatus = filters.orderStatus.some((statusId) => statusMap[statusId] === order.status);
      if (!matchesStatus) return false;
    }

    // Order type filter
    if (filters.orderType.length > 0) {
      const hasMatchingTag = order.tags?.some((tag) => {
        const tagLower = tag.toLowerCase().replace(/\s+/g, '-');
        return filters.orderType.includes(tagLower);
      });
      if (!hasMatchingTag) return false;
    }

    return true;
  });

  const listHeader = (
    <View>
      {/* Search and Filter Section */}
      <View style={styles.searchSection}>
        {/* Search Bar */}
        <View style={styles.rowGap2}>
          <View style={styles.flex}>
            <View style={styles.searchIcon} pointerEvents="none">
              <Search size={20} color={colors.gray[400]} />
            </View>
            <TextInput
              placeholder="Search by order ID"
              placeholderTextColor={colors.gray[400]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={[styles.searchInput, searchFocused && styles.inputFocused]}
            />
          </View>
          <Pressable
            onPress={() => setShowFilterPopup(true)}
            accessibilityLabel="Filter"
            style={[styles.filterBtn, hasActiveFilters() ? styles.filterBtnActive : null]}
          >
            <Filter size={20} color={hasActiveFilters() ? restaurantTheme.brand : colors.gray[900]} />
            {hasActiveFilters() ? (
              <View style={styles.filterCount}>
                <BrandFill r={8} />
                <Text style={styles.filterCountText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Date Range Selector */}
        <Pressable
          onPress={() => setShowDateRangePopup(true)}
          style={({ pressed }) => [styles.dateBtn, pressed && { backgroundColor: colors.gray[50] }]}
        >
          <View>
            <Text style={styles.dateLabel}>{capitalize(selectedDateRange.label)}</Text>
            <Text style={[styles.xsGray, { marginTop: 2 }]}>{formatDateRange()}</Text>
          </View>
          <View style={styles.rowGap2}>
            <Calendar size={16} color={colors.gray[400]} />
            <ChevronDown size={16} color={colors.gray[400]} />
          </View>
        </Pressable>
      </View>

      {/* Active Filters Summary */}
      {hasActiveFilters() ? (
        <View style={{ paddingHorizontal: sp(4), paddingBottom: sp(2) }}>
          <View style={styles.activeFilters}>
            <View style={styles.rowGap2}>
              <Filter size={16} color={restaurantTheme.brand} />
              <Text style={[styles.sm, { color: colors.blue[900] }]}>
                <Text style={{ fontWeight: '600', color: colors.blue[900] }}>{activeFilterCount}</Text> filter{activeFilterCount !== 1 ? 's' : ''} applied
              </Text>
            </View>
            <Pressable onPress={handleClearFilters} hitSlop={6}>
              <Text style={styles.clearAllLink}>Clear all</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={[styles.stateBox, { marginHorizontal: sp(4) }]}>
          <ActivityIndicator size={32} color={restaurantTheme.brand} />
          <Text style={[styles.sm, { color: colors.gray[600] }]}>Loading orders...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={[styles.stateBox, { marginHorizontal: sp(4) }]}>
          <Text style={[styles.sm, { color: restaurantTheme.brand, fontWeight: '500' }]}>Error loading orders</Text>
          <Text style={styles.xsGray}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  const showList = !loading && !error;
  const visibleOptions = (filterOptions[activeFilterCategory] || []).filter((option) => option.label.toLowerCase().includes(filterSearch.toLowerCase()));

  return (
    <Screen bg={colors.gray[100]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.rowGap3}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Order History</Text>
            <Text style={styles.xsGray}>
              {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'} found
            </Text>
          </View>
          <Pressable
            onPress={() => navigate('/food/restaurant/support')}
            accessibilityLabel="Help"
            style={({ pressed }) => [styles.helpBtn, pressed && { backgroundColor: colors.gray[100] }]}
          >
            <HelpCircle size={20} color={colors.gray[900]} />
          </Pressable>
        </View>
      </View>

      <FlatList
        style={styles.flex}
        data={showList ? filteredOrders : []}
        keyExtractor={(order, i) => String(order.id || order.mongoId || i)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingBottom: sp(24) }}
        ItemSeparatorComponent={() => <View style={{ height: sp(3) }} />}
        renderItem={({ item: order, index }) => (
          <View style={{ paddingHorizontal: sp(4) }}>
            <OrderCard
              order={order}
              index={index}
              getStatusStyle={getStatusStyle}
              onPress={() => navigate(`/food/restaurant/orders/${order.id}`, { state: { mongoId: order.mongoId } })}
              onCopy={() => handleCopyOrderId(order.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          showList ? (
            <View style={[styles.stateBox, { marginHorizontal: sp(4) }]}>
              <Text style={[styles.sm, { color: colors.gray[900], fontWeight: '500' }]}>No orders found</Text>
              <Text style={styles.xsGray}>Try changing the date range or search filters.</Text>
            </View>
          ) : null
        }
      />

      {/* Date Range Popup */}
      <Dialog open={showDateRangePopup} onClose={() => setShowDateRangePopup(false)} style={styles.datePopup}>
        <View style={[styles.datePopupHead]}>
          <Text style={styles.popupTitle}>Select date range</Text>
          <Pressable onPress={() => setShowDateRangePopup(false)} accessibilityLabel="Close" style={styles.backBtn}>
            <X size={20} color={colors.gray[900]} />
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: winH * 0.8 - 70 }} contentContainerStyle={{ padding: sp(2), gap: sp(1) }}>
          {dateRangeOptions.map((option) => {
            const isSelected = selectedDateRange?.label?.toLowerCase() === option.label.toLowerCase();
            let sub = null;
            if (!option.custom) {
              const dates = option.getDates();
              const s = dates.start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
              const e = dates.end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
              sub = `${s} - ${e}`;
            }
            return (
              <Pressable
                key={option.label}
                onPress={() => handleDateRangeSelect(option)}
                style={({ pressed }) => [
                  styles.rangeOption,
                  isSelected ? styles.rangeOptionSelected : null,
                  pressed && !isSelected && { backgroundColor: colors.gray[50] },
                ]}
              >
                <View>
                  <Text style={styles.rangeLabel}>{capitalize(option.label)}</Text>
                  {sub ? <Text style={[styles.xsGray, { marginTop: 2 }]}>{sub}</Text> : null}
                </View>
                {isSelected ? <Text style={styles.selectedText}>Selected</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Dialog>

      {/* Calendar Popup */}
      <Dialog open={showCalendar} onClose={() => setShowCalendar(false)} style={styles.calDialog}>
        <DateRangeCalendar
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={handleDateRangeChange}
          onClose={() => setShowCalendar(false)}
        />
      </Dialog>

      {/* Filter Popup */}
      <Sheet open={showFilterPopup} onClose={() => setShowFilterPopup(false)} style={[styles.filterSheet, { height: winH * 0.65 }]}>
        {/* Drag Handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.filterHead}>
          <Text style={styles.popupTitle}>Filters</Text>
          <Pressable onPress={() => setShowFilterPopup(false)} accessibilityLabel="Close" style={styles.backBtn}>
            <X size={20} color={colors.gray[900]} />
          </Pressable>
        </View>

        {/* Main Content */}
        <View style={styles.filterMain}>
          {/* Sidebar Categories */}
          <ScrollView style={styles.sidebar}>
            {filterCategories.map((category) => {
              const active = activeFilterCategory === category.id;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => {
                    setActiveFilterCategory(category.id);
                    setFilterSearch('');
                  }}
                  style={[styles.catBtn, active ? styles.catBtnActive : null]}
                >
                  <Text style={[styles.catText, active ? styles.catTextActive : null]}>{category.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Filter Options */}
          <View style={styles.flex}>
            {/* Search Bar */}
            <View style={styles.filterSearchWrap}>
              <View>
                <View style={[styles.searchIcon, { left: sp(3) }]} pointerEvents="none">
                  <Search size={16} color={colors.gray[400]} />
                </View>
                <TextInput
                  placeholder="Search"
                  placeholderTextColor={colors.gray[400]}
                  value={filterSearch}
                  onChangeText={setFilterSearch}
                  style={styles.filterSearchInput}
                />
              </View>
            </View>

            {/* Options List */}
            <ScrollView style={styles.flex} contentContainerStyle={{ paddingHorizontal: sp(3), paddingVertical: sp(2) }} keyboardShouldPersistTaps="handled">
              {visibleOptions.map((option) => {
                const isChecked = isFilterChecked(option);
                const isRadio = activeFilterCategory === 'Ratings';
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => handleFilterToggle(option)}
                    style={({ pressed }) => [styles.optionRow, pressed && { backgroundColor: colors.gray[50] }]}
                  >
                    {isRadio ? (
                      <View style={[styles.radio, { borderColor: isChecked ? restaurantTheme.brand : colors.gray[300] }]}>
                        {isChecked ? (
                          <View style={styles.radioDot}>
                            <BrandFill r={6} />
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <View style={[styles.checkbox, isChecked ? styles.checkboxOn : null]}>
                        {isChecked ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
                      </View>
                    )}
                    <Text style={styles.optionLabel}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Footer Actions */}
        <View style={styles.filterFooter}>
          <Pressable onPress={handleClearFilters} style={({ pressed }) => [styles.clearBtn, pressed && { backgroundColor: colors.gray[50] }]}>
            <Text style={styles.clearBtnText}>Clear all</Text>
          </Pressable>
          <Pressable onPress={handleApplyFilters} disabled={isApplyingFilters} style={[styles.applyBtn, isApplyingFilters && { opacity: 0.5 }]}>
            <BrandFill r={10} />
            {isApplyingFilters ? (
              <>
                <ActivityIndicator size={16} color={colors.white} />
                <Text style={styles.applyText}>Applying...</Text>
              </>
            ) : (
              <Text style={styles.applyText}>Apply</Text>
            )}
          </Pressable>
        </View>
      </Sheet>

      {/* Loading Overlay (web: shown while applying with the sheet closed) */}
      <Modal visible={isApplyingFilters && !showFilterPopup} transparent statusBarTranslucent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.applyingOverlay}>
          <ActivityIndicator size={40} color={restaurantTheme.brand} />
          <Text style={[styles.sm, { fontWeight: '500', color: colors.gray[900] }]}>Applying filters...</Text>
        </View>
      </Modal>

      {/* Toast Notification */}
      <View pointerEvents="none" style={styles.toastWrap}>
        <Animated.View
          style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) }] }]}
        >
          <BrandFill r={10} />
          <CheckSvg />
          <Text style={styles.toastText}>Order ID copied to clipboard</Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rowGap2: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  rowGap3: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sm: { fontSize: 14, lineHeight: 20 },
  xsGray: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], paddingHorizontal: sp(4), paddingVertical: sp(3), zIndex: 50 },
  backBtn: { padding: 6, borderRadius: 10 },
  helpBtn: { padding: sp(2), borderRadius: 10 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  searchSection: { paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(3) },
  searchIcon: { position: 'absolute', left: sp(3), top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  searchInput: {
    paddingLeft: 40,
    paddingRight: sp(4),
    paddingVertical: 10,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    fontSize: 14,
    color: colors.gray[900],
  },
  inputFocused: { borderColor: restaurantTheme.focusBorder },
  filterBtn: { padding: 10, borderWidth: 1, borderRadius: 10, backgroundColor: colors.gray[50], borderColor: colors.gray[200] },
  filterBtnActive: { backgroundColor: colors.blue[50], borderColor: colors.blue[500] },
  filterCount: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  filterCountText: { color: colors.white, fontSize: 10, lineHeight: 12, fontWeight: '700' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
  },
  dateLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  activeFilters: {
    backgroundColor: colors.blue[50],
    borderWidth: 1,
    borderColor: colors.blue[200],
    borderRadius: 10,
    padding: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearAllLink: { fontSize: 12, lineHeight: 16, color: restaurantTheme.brand, fontWeight: '500' },
  stateBox: { alignItems: 'center', gap: sp(3), paddingVertical: sp(12), backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.gray[200] },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], borderRadius: 10, padding: sp(4) },
  badge: { paddingHorizontal: sp(2.5), paddingVertical: sp(1), borderRadius: 4 },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.white },
  idText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  copyBtn: { padding: sp(1), borderRadius: 4 },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[300], marginVertical: sp(3) },
  moreItems: { fontSize: 12, lineHeight: 16, color: restaurantTheme.brand, fontWeight: '500' },
  priceFooter: { marginTop: sp(3), paddingTop: sp(3), borderTopWidth: 1, borderTopColor: colors.gray[100], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.gray[500], letterSpacing: 0.6 },
  totalValue: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  reasonBox: { marginTop: sp(3), paddingTop: sp(3), borderTopWidth: 1, borderTopColor: colors.gray[200] },
  datePopup: { maxWidth: 384, borderRadius: 14, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white },
  datePopupHead: { padding: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[100], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  popupTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  rangeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
  },
  rangeOptionSelected: { borderColor: colors.blue[500], backgroundColor: colors.blue[50] },
  rangeLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  selectedText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: restaurantTheme.brand },
  calDialog: { maxWidth: 384, backgroundColor: 'transparent' },
  cal: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.gray[200], padding: sp(4), width: '100%', ...shadow.lg },
  calNav: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  calMonth: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  calRow: { flexDirection: 'row', gap: sp(1) },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.gray[500], paddingVertical: sp(1) },
  calCell: { flex: 1, alignItems: 'center' },
  calDay: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  calFooter: { marginTop: sp(4), paddingTop: sp(4), borderTopWidth: 1, borderTopColor: colors.gray[200] },
  calFooterText: { fontSize: 12, lineHeight: 16, color: colors.gray[600], textAlign: 'center', fontWeight: '500' },
  filterSheet: { backgroundColor: colors.white, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  handleWrap: { alignItems: 'center', paddingTop: sp(2), paddingBottom: sp(1) },
  handle: { width: 40, height: 4, backgroundColor: colors.gray[300], borderRadius: 2 },
  filterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(4), paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  filterMain: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  sidebar: { width: 112, flexGrow: 0, backgroundColor: colors.gray[50], borderRightWidth: 1, borderRightColor: colors.gray[200] },
  catBtn: { paddingHorizontal: sp(2), paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  catBtnActive: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.gray[200], borderLeftColor: colors.black },
  catText: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  catTextActive: { color: colors.gray[900], fontWeight: '600' },
  filterSearchWrap: { padding: sp(3), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  filterSearchInput: {
    paddingLeft: 36,
    paddingRight: sp(3),
    paddingVertical: sp(2),
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    fontSize: 14,
    color: colors.gray[900],
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: sp(2), borderRadius: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, overflow: 'hidden' },
  checkbox: { width: 20, height: 20, borderWidth: 2, borderColor: colors.gray[300], borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.green[600], borderColor: colors.green[600] },
  optionLabel: { marginLeft: sp(3), fontSize: 14, lineHeight: 20, color: colors.gray[900], flexShrink: 1 },
  filterFooter: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3), borderTopWidth: 1, borderTopColor: colors.gray[200], backgroundColor: colors.white },
  clearBtn: { flex: 1, paddingHorizontal: sp(4), paddingVertical: 10, borderWidth: 1, borderColor: colors.gray[300], borderRadius: 10, alignItems: 'center' },
  clearBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  applyBtn: { flex: 1, flexDirection: 'row', gap: sp(2), paddingHorizontal: sp(4), paddingVertical: 10, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.white },
  applyingOverlay: { flex: 1, backgroundColor: alpha(colors.white, 0.8), alignItems: 'center', justifyContent: 'center', gap: sp(3) },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', zIndex: 60 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: sp(2), paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: 10, overflow: 'hidden', ...shadow.lg },
  toastText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
