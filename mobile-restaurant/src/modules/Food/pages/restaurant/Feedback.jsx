// Web: pages/restaurant/Feedback.jsx — the Feedback tab (/feedback and /reviews): "Showing data for" header with the
// support button, Complaints / Reviews pills (?tab=complaints opens Complaints; swipe sideways to switch), complaints
// with the date range sheet (today ... last 5 days + custom calendar) and the issue-type filter sheet, reviews built
// from the delivered orders (search, sort / rating filter sheet). Same API calls (GET current restaurant, GET
// complaints with fromDate / toDate / complaintType / search, GET orders status=delivered page by page), texts and
// rules.
// Native (kept-alive tab, see CONVERSION_GUIDE section 7):
// - RestaurantTabKeepAlive renders this screen once; useRestaurantTabActive() says whether it is on screen. What the
//   web loaded on mount (restaurant -> reviews, complaints on the Complaints tab) is loaded again each time the tab
//   is shown again (old data stays meanwhile); popups only show while the tab is active; the status bar is set only
//   while active. The bottom bar is drawn by the layout: the content ends with useRestaurantNavSpace() room.
// - The ?tab= query is read from the frozen-aware location (a hidden tab does not react to another page's URL).
// - Main scroll = KeyboardAwareScrollView (review search field), pull-to-refresh reloads what opening the screen
//   loads, useTabScrollTop starts it at the top after another tab was shown.
// - Popups (date range, filters) are Sheets; the custom range calendar is a Dialog. The web's DateRangeCalendar
//   (components/ui, not in the app) is drawn here with the same grid and rules.
// - framer-motion slide / fade -> the Sheet / Dialog animations.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, HelpCircle, Search, SlidersHorizontal, Star, X } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Dialog, KeyboardAwareScrollView, Sheet, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { useTabScrollTop, useTabShown } from '@/native/ui/tabShown';
import { StatusBarSpacer } from '@/native/ui/Screen';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { useRestaurantNavSpace } from '@food/components/restaurant/BottomNavOrders';
import { useRestaurantTabActive } from '@food/components/restaurant/restaurantTabPages';
import { restaurantAPI } from '@food/api';

const debugError = () => {};

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark];
const BRAND_COLOR = restaurantTheme.brand;

function BrandFill({ r = 0 }) {
  return <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />;
}

const tabs = [
  { id: 'complaints', label: 'Complaints' },
  { id: 'reviews', label: 'Reviews' },
];

const DATE_RANGE_KEYS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'last5days', 'custom'];
// web: range.replace(/([A-Z])/g, ' $1').trim() + CSS capitalize
const dateRangeLabel = (range) =>
  range === 'last5days'
    ? 'Last 5 Days'
    : range
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

const ISSUE_TYPES = ['Food Quality', 'Wrong Item', 'Missing Item', 'Packaging Issue', 'Late Delivery', 'Other'];
const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'bestRated', label: 'Best rated' },
  { id: 'worstRated', label: 'Worst rated' },
];

const normalizeOrderStatus = (order) => String(order?.status || order?.orderStatus || '').toLowerCase();

const normalizeRating = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return Math.min(5, Math.round(parsed * 10) / 10);
};

const extractReviewRating = (order) =>
  normalizeRating(order?.review?.rating ?? order?.ratings?.restaurant?.rating ?? order?.feedback?.rating ?? order?.rating);

const extractReviewText = (order) => {
  const raw =
    order?.review?.comment ?? order?.review?.text ?? order?.ratings?.restaurant?.comment ?? order?.feedback?.comment ?? order?.feedback?.text ?? '';
  const normalized = String(raw || '').trim();
  return normalized || 'No review text';
};

const toComparableId = (value) => String(value?._id || value || '').trim();

const getDateRanges = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const last5DaysStart = new Date(today);
  last5DaysStart.setDate(last5DaysStart.getDate() - 4);

  const thisWeekStart = new Date(today);
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  thisWeekStart.setDate(diff);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  lastWeekEnd.setHours(23, 59, 59, 999);

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  lastMonthEnd.setHours(23, 59, 59, 999);

  return {
    today,
    yesterday,
    thisWeekStart,
    thisWeekEnd: new Date(),
    lastWeekStart,
    lastWeekEnd,
    thisMonthStart,
    thisMonthEnd: new Date(),
    lastMonthStart,
    lastMonthEnd,
    last5DaysStart,
    last5DaysEnd: new Date(),
  };
};

// ------------------------------------------------------------------ web components/ui/date-range-calendar.tsx
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DateRangeCalendar({ startDate, endDate, onDateRangeChange, onClose }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);
  const closeTimer = useRef(null);
  useEffect(() => () => closeTimer.current && clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (startDate) setCurrentMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
  }, [startDate]);

  const calendarDays = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    first.setDate(first.getDate() - first.getDay() + (first.getDay() === 0 ? -6 : 1)); // Start from Monday
    const days = [];
    const cur = new Date(first);
    for (let i = 0; i < 42; i++) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [currentMonth]);

  const isInRange = (date) => {
    if (tempStartDate && tempEndDate) {
      const t = date.getTime();
      return t >= tempStartDate.getTime() && t <= tempEndDate.getTime();
    }
    return false;
  };
  const isEdge = (date) =>
    (Boolean(tempStartDate) && date.toDateString() === tempStartDate.toDateString()) ||
    (Boolean(tempEndDate) && date.toDateString() === tempEndDate.toDateString());

  const handleDateClick = (date) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(date);
      setTempEndDate(null);
    } else {
      let finalStart = tempStartDate;
      let finalEnd = date;
      if (date.getTime() < tempStartDate.getTime()) {
        finalStart = date;
        finalEnd = tempStartDate;
      }
      setTempStartDate(finalStart);
      setTempEndDate(finalEnd);
      onDateRangeChange(finalStart, finalEnd);
      if (onClose) closeTimer.current = setTimeout(() => onClose(), 300);
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
      <View style={[styles.calRow, { marginBottom: sp(2) }]}>
        {weekDays.map((d) => (
          <Text key={d} style={styles.calWeekDay}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ gap: sp(1) }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.calRow}>
            {week.map((date, index) => {
              const isToday = date.toDateString() === new Date().toDateString();
              let bg = 'transparent';
              let fg = date.getMonth() === currentMonth.getMonth() ? colors.gray[900] : colors.gray[400];
              let weight = '400';
              if (isEdge(date)) {
                bg = colors.green[500];
                fg = colors.white;
                weight = '600';
              } else if (isInRange(date)) {
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
      <View style={styles.calFooter}>
        <Text style={styles.calFooterText}>{formatRange()}</Text>
      </View>
    </View>
  );
}

function Chip({ active, onPress, children }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, !active && styles.chipIdle, !active && pressed && { backgroundColor: colors.slate[100] }]}>
      {active ? <BrandFill r={14} /> : null}
      {children(active)}
    </Pressable>
  );
}

export default function Feedback() {
  const tabActive = useRestaurantTabActive();
  const tabShown = useTabShown();
  const navSpace = useRestaurantNavSpace();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useRestaurantBackNavigation();
  const showBack = location.state?.from;
  const tabFromUrl = useMemo(() => new URLSearchParams(location.search || '').get('tab'), [location.search]);
  const [activeTab, setActiveTab] = useState(tabFromUrl === 'complaints' ? 'complaints' : 'reviews');
  const scrollRef = useRef(null);
  useTabScrollTop(scrollRef);

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabFromUrl === 'complaints') setActiveTab('complaints');
    else setActiveTab('reviews');
  }, [tabFromUrl]);

  // Swipe gesture refs
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const [reviews, setReviews] = useState([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterValues, setFilterValues] = useState({ duration: null, sortBy: 'newest', reviewType: [] });
  const [displayedReviews, setDisplayedReviews] = useState([]);
  const [reviewSearchQuery, setReviewSearchQuery] = useState('');

  const [isComplaintsFilterOpen, setIsComplaintsFilterOpen] = useState(false);
  const [complaintsFilterValues, setComplaintsFilterValues] = useState({ issueType: [], reasons: [] });
  const [complaintsSearchQuery, setComplaintsSearchQuery] = useState('');

  const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState('last5days');
  const [customDateRange, setCustomDateRange] = useState({ start: null, end: null });
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);
  const [isComplaintsLoading, setIsComplaintsLoading] = useState(false);
  const [complaints, setComplaints] = useState([]);
  const [complaintsReloadKey, setComplaintsReloadKey] = useState(0);

  const [restaurantData, setRestaurantData] = useState(null);
  const [isLoadingRestaurant, setIsLoadingRestaurant] = useState(true);
  const [, setIsLoadingReviews] = useState(true);
  const [, setRatingSummary] = useState({ averageRating: 0, totalRatings: 0, totalReviews: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const aliveRef = useRef(true);
  const reviewsPromiseRef = useRef(null);
  const timersRef = useRef([]);
  useEffect(
    () => () => {
      aliveRef.current = false;
      timersRef.current.forEach(clearTimeout);
    },
    [],
  );
  const later = (fn, ms) => {
    timersRef.current.push(setTimeout(() => aliveRef.current && fn(), ms));
  };

  const fetchRestaurantData = useCallback(async () => {
    try {
      setIsLoadingRestaurant(true);
      const response = await restaurantAPI.getCurrentRestaurant();
      if (response.data?.success && response.data.data?.restaurant && aliveRef.current) {
        setRestaurantData(response.data.data.restaurant);
      }
    } catch (error) {
      debugError('Error fetching restaurant data:', error);
    } finally {
      if (aliveRef.current) setIsLoadingRestaurant(false);
    }
  }, []);

  useEffect(() => {
    fetchRestaurantData();
  }, [fetchRestaurantData]);

  useEffect(() => {
    const fetchComplaints = async () => {
      if (activeTab !== 'complaints') return;

      try {
        setIsComplaintsLoading(true);
        const dateRanges = getDateRanges();
        let fromDate = null;
        let toDate = null;

        switch (selectedDateRange) {
          case 'today':
            fromDate = dateRanges.today;
            toDate = new Date();
            break;
          case 'yesterday':
            fromDate = dateRanges.yesterday;
            toDate = new Date(dateRanges.yesterday);
            toDate.setHours(23, 59, 59, 999);
            break;
          case 'thisWeek':
            fromDate = dateRanges.thisWeekStart;
            toDate = dateRanges.thisWeekEnd;
            break;
          case 'lastWeek':
            fromDate = dateRanges.lastWeekStart;
            toDate = dateRanges.lastWeekEnd;
            break;
          case 'thisMonth':
            fromDate = dateRanges.thisMonthStart;
            toDate = dateRanges.thisMonthEnd;
            break;
          case 'lastMonth':
            fromDate = dateRanges.lastMonthStart;
            toDate = dateRanges.lastMonthEnd;
            break;
          case 'last5days':
            fromDate = dateRanges.last5DaysStart;
            toDate = dateRanges.last5DaysEnd;
            break;
          case 'custom':
            if (customDateRange.start && customDateRange.end) {
              fromDate = customDateRange.start;
              toDate = customDateRange.end;
            }
            break;
          default:
            break;
        }

        const params = {};
        if (fromDate) params.fromDate = fromDate.toISOString();
        if (toDate) params.toDate = toDate.toISOString();
        if (complaintsFilterValues.issueType?.length > 0) {
          params.complaintType = complaintsFilterValues.issueType[0];
        }
        if (complaintsSearchQuery) params.search = complaintsSearchQuery;

        const response = await restaurantAPI.getComplaints(params);
        if (!aliveRef.current) return;
        if (response?.data?.success && response.data.data?.complaints) {
          setComplaints(response.data.data.complaints);
        } else {
          setComplaints([]);
        }
      } catch (error) {
        debugError('Error fetching complaints:', error);
        if (aliveRef.current) setComplaints([]);
      } finally {
        if (aliveRef.current) setIsComplaintsLoading(false);
      }
    };

    fetchComplaints();
  }, [activeTab, selectedDateRange, customDateRange, complaintsFilterValues, complaintsSearchQuery, complaintsReloadKey]);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        setIsLoadingReviews(true);
        let allOrders = [];
        let page = 1;
        let hasMore = true;
        const limit = 1000;
        const maxPages = 50;

        while (hasMore && page <= maxPages) {
          try {
            const response = await restaurantAPI.getOrders({ page, limit, status: 'delivered' });
            if (response.data?.success && response.data.data?.orders) {
              const orders = response.data.data.orders;
              allOrders = [...allOrders, ...orders];
              const totalPages = response.data.data.pagination?.totalPages || response.data.data.totalPages || 1;
              if (orders.length < limit || (totalPages > 0 && page >= totalPages)) {
                hasMore = false;
              } else {
                page++;
              }
            } else {
              hasMore = false;
            }
          } catch {
            hasMore = false;
          }
        }

        const transformedReviews = allOrders
          .filter((order) => normalizeOrderStatus(order) === 'delivered')
          .map((order, index) => {
            const orderDate = new Date(order.createdAt || order.deliveredAt || Date.now());
            const day = orderDate.getDate();
            const month = orderDate.toLocaleDateString('en-GB', { month: 'short' });
            const year = orderDate.getFullYear();
            const formattedDate = `${day} ${month}, ${year}`;

            const userName = order.userId?.name || order.customerName || 'Customer';
            const userImage = order.userId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`;
            const outlet = order.restaurantName || restaurantData?.name || 'Restaurant';

            const rating = extractReviewRating(order);
            const reviewText = extractReviewText(order);

            const userOrdersCount = allOrders.filter((o) => toComparableId(o.userId) === toComparableId(order.userId)).length;

            return {
              id: order._id || order.orderId || `review-${index}`,
              orderNumber: order.orderId || order.orderNumber || String(index),
              outlet,
              userName,
              userImage,
              ordersCount: userOrdersCount,
              rating,
              date: formattedDate,
              reviewText,
              orderData: order,
            };
          })
          .filter((review) => review.rating !== null || (review.reviewText && review.reviewText !== 'No review text'));

        const ratings = transformedReviews.map((r) => r.rating).filter((r) => r !== null);
        const averageRating = ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1) : 0;

        if (!aliveRef.current) return;
        setRatingSummary({
          averageRating: parseFloat(averageRating),
          totalRatings: ratings.length,
          totalReviews: transformedReviews.length,
        });
        setReviews(transformedReviews);
      } catch (error) {
        debugError('Error fetching reviews:', error);
      } finally {
        if (aliveRef.current) setIsLoadingReviews(false);
      }
    };

    if (!isLoadingRestaurant) reviewsPromiseRef.current = fetchReviews();
  }, [isLoadingRestaurant, restaurantData]);

  useEffect(() => {
    let filtered = [...reviews];
    if (filterValues.reviewType?.length) {
      filtered = filtered.filter((review) => filterValues.reviewType.includes(Math.round(Number(review.rating) || 0)));
    }
    const query = reviewSearchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((review) =>
        [review.userName, review.reviewText, review.orderNumber].some((value) => String(value || '').toLowerCase().includes(query)),
      );
    }
    if (filterValues.sortBy) {
      filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (filterValues.sortBy === 'newest') return dateB - dateA;
        if (filterValues.sortBy === 'oldest') return dateA - dateB;
        if (filterValues.sortBy === 'bestRated') return (b.rating ?? 0) - (a.rating ?? 0);
        if (filterValues.sortBy === 'worstRated') return (a.rating ?? 0) - (b.rating ?? 0);
        return 0;
      });
    }
    setDisplayedReviews(filtered);
  }, [reviews, filterValues, reviewSearchQuery]);

  // Native: the web rebuilt this screen (and loaded its data again) on every visit; here it stays mounted, so the
  // same data is loaded again each time the tab is shown again (old data stays on screen meanwhile).
  const wasActiveRef = useRef(tabActive);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = tabActive;
    if (!tabActive) {
      setIsDateSelectorOpen(false);
      setIsCustomDateOpen(false);
      setIsFilterOpen(false);
      setIsComplaintsFilterOpen(false);
      return;
    }
    if (wasActive) return;
    fetchRestaurantData(); // -> reviews (effect above)
    setComplaintsReloadKey((k) => k + 1);
  }, [tabActive, fetchRestaurantData]);

  // Pull to refresh: what opening the screen loads (restaurant -> reviews, complaints on the Complaints tab)
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setComplaintsReloadKey((k) => k + 1);
      await fetchRestaurantData();
      // the reviews load starts from the effect once the restaurant has loaded
      await new Promise((r) => setTimeout(r, 50));
      await reviewsPromiseRef.current;
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [fetchRestaurantData]);

  const handleFilterReset = () => {
    setFilterValues({ duration: null, sortBy: 'newest', reviewType: [] });
    setReviewSearchQuery('');
  };
  const handleFilterApply = () => {
    setIsFilterOpen(false);
  };

  const handleComplaintsFilterApply = () => {
    setIsComplaintsLoading(true);
    setIsComplaintsFilterOpen(false);
    later(() => setIsComplaintsLoading(false), 200);
  };
  const handleComplaintsFilterReset = () => {
    setComplaintsFilterValues({ issueType: [], reasons: [] });
    setComplaintsSearchQuery('');
    setIsComplaintsLoading(true);
    later(() => setIsComplaintsLoading(false), 200);
  };

  const handleDateRangeSelect = (range) => {
    setSelectedDateRange(range);
    if (range === 'custom') setIsCustomDateOpen(true);
    else {
      setIsDateSelectorOpen(false);
      setIsComplaintsLoading(true);
      later(() => setIsComplaintsLoading(false), 200);
    }
  };

  const handleCustomDateApply = () => {
    setIsCustomDateOpen(false);
    setIsDateSelectorOpen(false);
    setIsComplaintsLoading(true);
    later(() => setIsComplaintsLoading(false), 200);
  };

  // Swipe between the two tabs (web: touchstart / touchmove / touchend on the page)
  const handleTouchStart = (e) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchStartY.current = e.nativeEvent.pageY;
    isSwiping.current = false;
  };
  const handleTouchMove = (e) => {
    const deltaX = Math.abs(e.nativeEvent.pageX - touchStartX.current);
    const deltaY = Math.abs(e.nativeEvent.pageY - touchStartY.current);
    if (deltaX > deltaY && deltaX > 10) isSwiping.current = true;
    if (isSwiping.current) touchEndX.current = e.nativeEvent.pageX;
  };
  const handleTouchEnd = () => {
    if (!isSwiping.current) return;
    const swipeDistance = touchStartX.current - touchEndX.current;
    if (Math.abs(swipeDistance) > 50) {
      if (swipeDistance > 0) setActiveTab('reviews');
      else setActiveTab('complaints');
    }
  };

  const reviewFilterActive = filterValues.reviewType?.length > 0 || filterValues.sortBy !== 'newest';

  return (
    <View style={styles.root} collapsable={false} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {/* shown (not "active"): the icons switch in the same frame as the tab, not after the route change */}
      {tabShown ? <StatusBar style="dark" /> : null}

      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerInner}>
          <View style={styles.rowBetween}>
            <View style={styles.headerLeft}>
              {showBack ? (
                <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
                  <ArrowLeft size={20} color={colors.gray[900]} />
                </Pressable>
              ) : null}
              <View style={styles.flexShrink}>
                <Text style={styles.showingFor}>SHOWING DATA FOR</Text>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {restaurantData?.name || 'Restaurant'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => navigate('/food/restaurant/help-centre/support', { state: { from: location.pathname } })}
              accessibilityLabel="Open support"
              style={({ pressed }) => [styles.helpBtn, pressed && { backgroundColor: colors.gray[100], transform: [{ scale: 0.95 }] }]}
            >
              <HelpCircle size={24} color={colors.gray[700]} />
            </Pressable>
          </View>

          <View style={styles.tabsRow}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabPill, !active && styles.tabPillIdle]}>
                  {active ? <BrandFill r={9999} /> : null}
                  <Text style={[styles.tabPillText, active && { color: colors.white }]}>{tab.label}</Text>
                  {tab.id === 'complaints' && complaints.length > 0 && activeTab !== 'complaints' ? (
                    <View style={styles.tabDot}>
                      <BrandFill r={9999} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(navSpace, sp(4) + 80) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND_COLOR]} tintColor={BRAND_COLOR} />}
      >
        {activeTab === 'complaints' ? (
          <View style={{ gap: sp(4) }}>
            <View style={styles.toolRow}>
              <Pressable onPress={() => setIsDateSelectorOpen(true)} style={[styles.toolBox, styles.dateBtn]}>
                <View>
                  <Text style={styles.dateValue}>{selectedDateRange}</Text>
                  <Text style={styles.dateHint}>Select date range</Text>
                </View>
                <Calendar size={16} color={colors.gray[400]} />
              </Pressable>
              <Pressable onPress={() => setIsComplaintsFilterOpen(true)} style={styles.toolBox}>
                <SlidersHorizontal size={16} color={colors.gray[900]} />
              </Pressable>
            </View>

            {isComplaintsLoading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator color={colors.gray[400]} />
              </View>
            ) : complaints.length === 0 ? (
              <View style={styles.noComplaints}>
                <Text style={styles.noComplaintsText}>No complaints found</Text>
              </View>
            ) : (
              <View style={{ gap: sp(4) }}>
                {complaints.map((complaint) => {
                  const open = complaint.status === 'open';
                  return (
                    <View key={complaint._id} style={styles.card}>
                      <View style={styles.rowBetween}>
                        <View style={[styles.statusPill, { backgroundColor: open ? colors.orange[100] : colors.green[100] }]}>
                          <Text style={[styles.statusText, { color: open ? restaurantTheme.primary : colors.green[600] }]}>
                            {String(complaint.status || 'open').toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.complaintDate}>{new Date(complaint.createdAt).toLocaleDateString()}</Text>
                      </View>

                      <View style={styles.userRow}>
                        <View style={styles.initial}>
                          <Text style={styles.initialText}>{complaint.userId?.name?.[0] || 'U'}</Text>
                        </View>
                        <View>
                          <Text style={styles.userName}>{complaint.userId?.name || 'Customer'}</Text>
                          <Text style={styles.orderRef}>{`Order #${complaint.orderId?.orderId || 'N/A'}`.toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={styles.quoteBox}>
                        <Text style={styles.issueType}>{String(complaint.issueType || '').toUpperCase()}</Text>
                        <Text style={styles.description}>{complaint.description}</Text>
                      </View>

                      {complaint.adminResponse ? (
                        <View style={styles.adminBox}>
                          <Text style={styles.adminLabel}>ADMIN RESPONSE</Text>
                          <Text style={styles.adminText}>{complaint.adminResponse}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: sp(4) }}>
            <View style={styles.toolRow}>
              <View style={[styles.toolBox, styles.searchBox, searchFocused && { borderColor: restaurantTheme.focusBorder }]}>
                <Search size={16} color={colors.gray[400]} />
                <TextInput
                  value={reviewSearchQuery}
                  onChangeText={setReviewSearchQuery}
                  placeholder="Search reviews"
                  placeholderTextColor={colors.gray[400]}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
              </View>
              <Pressable onPress={() => setIsFilterOpen(true)} accessibilityLabel="Filter reviews" style={styles.toolBox}>
                <SlidersHorizontal size={16} color={colors.gray[900]} />
                {reviewFilterActive ? <View style={styles.filterDot} /> : null}
              </Pressable>
            </View>

            <View style={{ gap: sp(4) }}>
              {displayedReviews.length === 0 ? (
                <Text style={styles.noReviews}>{reviews.length === 0 ? 'No reviews yet' : 'No reviews match these filters'}</Text>
              ) : null}
              {displayedReviews.map((review) => (
                <View key={review.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.reviewMeta}>{`Order #${review.orderNumber}`.toUpperCase()}</Text>
                    <Text style={styles.reviewMeta}>{String(review.date).toUpperCase()}</Text>
                  </View>
                  <View style={styles.userRow}>
                    <AppImage src={review.userImage} style={styles.avatar} contentFit="cover" />
                    <Text style={styles.userName}>{review.userName}</Text>
                    <View style={styles.ratingPill}>
                      <Text style={styles.ratingText}>{review.rating == null ? '' : String(review.rating)}</Text>
                      <Star size={8} color={colors.white} fill={colors.white} />
                    </View>
                  </View>
                  <View style={styles.quoteBox}>
                    <Text style={styles.reviewText}>"{review.reviewText}"</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      {/* Date Selector Popup */}
      <Sheet open={isDateSelectorOpen && tabActive} onClose={() => setIsDateSelectorOpen(false)} style={styles.dateSheet}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        <View style={[styles.rowBetween, { marginBottom: sp(4) }]}>
          <Text style={styles.sheetTitle}>Select Date Range</Text>
          <Pressable onPress={() => setIsDateSelectorOpen(false)} hitSlop={8}>
            <X size={20} color={restaurantTheme.text} />
          </Pressable>
        </View>
        <View style={styles.rangeGrid}>
          {DATE_RANGE_KEYS.map((range) => {
            const active = selectedDateRange === range;
            return (
              <Pressable key={range} onPress={() => handleDateRangeSelect(range)} style={[styles.rangeBtn, active ? styles.rangeBtnActive : styles.rangeBtnIdle]}>
                {active ? <BrandFill r={12} /> : null}
                <Text style={[styles.rangeBtnText, { color: active ? colors.white : colors.gray[600] }]}>{dateRangeLabel(range)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* Custom Date Range Picker */}
      <Dialog open={isCustomDateOpen && tabActive} onClose={() => setIsCustomDateOpen(false)} style={styles.customDialog}>
        <DateRangeCalendar
          startDate={customDateRange.start}
          endDate={customDateRange.end}
          onDateRangeChange={(start, end) => {
            setCustomDateRange({ start, end });
          }}
          onClose={() => setIsCustomDateOpen(false)}
        />
        <Pressable onPress={handleCustomDateApply} style={({ pressed }) => [styles.applyCustom, pressed && { transform: [{ scale: 0.98 }] }]}>
          <BrandFill r={16} />
          <Text style={styles.applyText}>Apply Custom Range</Text>
        </Pressable>
      </Dialog>

      {/* Reviews Filter Popup */}
      <Sheet open={isFilterOpen && tabActive} onClose={() => setIsFilterOpen(false)} backdropOpacity={0.4} style={styles.filterSheet}>
        <View style={styles.filterInner}>
          <View style={[styles.rowBetween, { marginBottom: sp(6) }]}>
            <Text style={styles.filterTitle}>Filters</Text>
            <Pressable onPress={() => setIsFilterOpen(false)} style={({ pressed }) => [styles.filterClose, pressed && { backgroundColor: colors.slate[50] }]}>
              <X size={20} color={colors.slate[400]} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: sp(6), marginBottom: sp(6) }}>
            <View>
              <Text style={styles.filterHeading}>SORT BY</Text>
              <View style={styles.chipWrap}>
                {SORT_OPTIONS.map((option) => (
                  <Chip key={option.id} active={filterValues.sortBy === option.id} onPress={() => setFilterValues((current) => ({ ...current, sortBy: option.id }))}>
                    {(active) => <Text style={[styles.chipText, { color: active ? colors.white : colors.slate[600] }]}>{option.label}</Text>}
                  </Chip>
                ))}
              </View>
            </View>
            <View>
              <Text style={styles.filterHeading}>RATING</Text>
              <View style={styles.chipWrap}>
                {[5, 4, 3, 2, 1].map((stars) => (
                  <Chip
                    key={stars}
                    active={filterValues.reviewType?.includes(stars)}
                    onPress={() =>
                      setFilterValues((current) => {
                        const selected = current.reviewType || [];
                        return {
                          ...current,
                          reviewType: selected.includes(stars) ? selected.filter((value) => value !== stars) : [...selected, stars],
                        };
                      })
                    }
                  >
                    {(active) => (
                      <>
                        <Text style={[styles.chipText, { color: active ? colors.white : colors.slate[600] }]}>{stars}</Text>
                        <Star size={14} color={active ? colors.white : colors.slate[600]} fill={active ? colors.white : colors.slate[600]} />
                      </>
                    )}
                  </Chip>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.filterFooter}>
            <Pressable onPress={handleFilterReset} style={styles.resetBtn}>
              {({ pressed }) => <Text style={[styles.resetText, pressed && { color: colors.slate[900] }]}>Reset</Text>}
            </Pressable>
            <Pressable onPress={handleFilterApply} style={({ pressed }) => [styles.applyBtn, pressed && { transform: [{ scale: 0.98 }] }]}>
              <BrandFill r={16} />
              <Text style={styles.applyText}>Apply Filters</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>

      {/* Complaints Filter Popup */}
      <Sheet open={isComplaintsFilterOpen && tabActive} onClose={() => setIsComplaintsFilterOpen(false)} backdropOpacity={0.4} style={styles.filterSheet}>
        <View style={styles.filterInner}>
          <View style={[styles.rowBetween, { marginBottom: sp(6) }]}>
            <Text style={styles.filterTitle}>Filters</Text>
            <Pressable
              onPress={() => setIsComplaintsFilterOpen(false)}
              style={({ pressed }) => [styles.filterClose, pressed && { backgroundColor: colors.slate[50] }]}
            >
              <X size={20} color={colors.slate[400]} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ marginBottom: sp(6) }}>
            <Text style={styles.filterHeading}>ISSUE TYPE</Text>
            <View style={styles.chipWrap}>
              {/* Same values the customer picks on Submit Complaint, so the filter matches stored complaints */}
              {ISSUE_TYPES.map((type) => (
                <Chip
                  key={type}
                  active={complaintsFilterValues.issueType?.includes(type)}
                  onPress={() => {
                    const current = complaintsFilterValues.issueType || [];
                    setComplaintsFilterValues({ ...complaintsFilterValues, issueType: current.includes(type) ? [] : [type] });
                  }}
                >
                  {(active) => <Text style={[styles.chipText, { color: active ? colors.white : colors.slate[600] }]}>{type}</Text>}
                </Chip>
              ))}
            </View>
          </ScrollView>

          <View style={styles.filterFooter}>
            <Pressable onPress={handleComplaintsFilterReset} style={styles.resetBtn}>
              {({ pressed }) => <Text style={[styles.resetText, pressed && { color: colors.slate[900] }]}>Reset</Text>}
            </Pressable>
            <Pressable onPress={handleComplaintsFilterApply} style={({ pressed }) => [styles.applyBtn, pressed && { transform: [{ scale: 0.98 }] }]}>
              <BrandFill r={16} />
              <Text style={styles.applyText}>Apply Filters</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray[100] },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 40 },
  headerInner: { paddingHorizontal: sp(4), paddingVertical: sp(3) },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flexShrink: 1 },
  backBtn: { padding: 6, borderRadius: 10 },
  showingFor: { fontSize: 10, lineHeight: 14, letterSpacing: 0.5, color: colors.gray[500] },
  restaurantName: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  helpBtn: { padding: sp(1), borderRadius: 9999 },
  tabsRow: { flexDirection: 'row', gap: sp(2), marginTop: sp(4) },
  tabPill: { paddingHorizontal: sp(6), paddingVertical: sp(2), borderRadius: 9999 },
  tabPillIdle: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200] },
  tabPillText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[600] },
  tabDot: { position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.white, overflow: 'hidden' },
  content: { padding: sp(4) },
  toolRow: { flexDirection: 'row', gap: sp(2) },
  toolBox: { backgroundColor: colors.white, padding: sp(3), borderRadius: 14, borderWidth: 1, borderColor: colors.gray[200], justifyContent: 'center' },
  dateBtn: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateValue: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.gray[900] },
  dateHint: { fontSize: 10, lineHeight: 14, color: colors.gray[500] },
  loaderWrap: { alignItems: 'center', padding: sp(10) },
  noComplaints: { alignItems: 'center', paddingVertical: sp(20), backgroundColor: colors.gray[50], borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[200] },
  noComplaintsText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[500] },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: sp(4), borderWidth: 1, borderColor: colors.gray[100], gap: sp(3), ...shadow.sm },
  statusPill: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999 },
  statusText: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: -0.4 },
  complaintDate: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400] },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  initial: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  initialText: { fontWeight: '700', color: colors.gray[400] },
  userName: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900] },
  orderRef: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[500] },
  quoteBox: { backgroundColor: colors.gray[50], borderRadius: 14, padding: sp(3) },
  issueType: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: BRAND_COLOR, marginBottom: sp(1) },
  description: { fontSize: 14, lineHeight: 22, fontWeight: '600', color: colors.gray[800] },
  adminBox: { backgroundColor: colors.blue[50], borderRadius: 14, padding: sp(3), borderWidth: 1, borderColor: colors.blue[100] },
  adminLabel: { fontSize: 9, lineHeight: 12, fontWeight: '900', color: BRAND_COLOR, marginBottom: sp(1) },
  adminText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.blue[900] },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp(2), paddingVertical: 0, minHeight: 44 },
  searchInput: { flex: 1, fontSize: 14, color: colors.gray[900], paddingVertical: sp(3) },
  filterDot: { position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND_COLOR, borderWidth: 2, borderColor: colors.white },
  noReviews: { paddingVertical: sp(10), textAlign: 'center', fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[500] },
  reviewMeta: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400] },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.gray[100] },
  ratingPill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(1),
    backgroundColor: colors.green[600],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.white },
  reviewText: { fontSize: 14, lineHeight: 20, fontWeight: '500', fontStyle: 'italic', color: colors.gray[800] },
  // date sheet
  dateSheet: { backgroundColor: colors.white, padding: sp(4), ...shadow['2xl'] },
  handleWrap: { alignItems: 'center', marginBottom: sp(4) },
  handle: { height: 4, width: 40, borderRadius: 9999, backgroundColor: colors.gray[300] },
  sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: restaurantTheme.text },
  rangeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3), marginBottom: sp(6) },
  rangeBtn: { width: '48%', flexGrow: 1, paddingVertical: sp(3), borderRadius: 12, borderWidth: 2, alignItems: 'center', overflow: 'hidden' },
  rangeBtnActive: { borderColor: colors.black },
  rangeBtnIdle: { borderColor: colors.gray[100], backgroundColor: colors.white },
  rangeBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  // custom range
  customDialog: { width: '90%', maxWidth: 384, borderRadius: 24, padding: sp(6), backgroundColor: colors.white, ...shadow['2xl'] },
  applyCustom: { width: '100%', paddingVertical: sp(4), borderRadius: 16, alignItems: 'center', marginTop: sp(4), overflow: 'hidden', ...shadow.xl },
  applyText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.white },
  // filter sheets
  filterSheet: { backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '80%', ...shadow['2xl'] },
  filterInner: { padding: sp(6), flexShrink: 1 },
  filterTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  filterClose: { padding: sp(2), borderRadius: 9999 },
  filterHeading: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400], letterSpacing: 1.2, marginBottom: sp(4) },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: sp(1), paddingHorizontal: sp(4), paddingVertical: 10, borderRadius: 14, overflow: 'hidden' },
  chipIdle: { backgroundColor: colors.slate[50] },
  chipText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  filterFooter: { flexDirection: 'row', gap: sp(3) },
  resetBtn: { flex: 1, paddingVertical: sp(4), borderRadius: 16, alignItems: 'center' },
  resetText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.slate[400] },
  applyBtn: { flex: 2, paddingVertical: sp(4), borderRadius: 16, alignItems: 'center', overflow: 'hidden', ...shadow.xl },
  // calendar
  cal: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.gray[200], padding: sp(4), width: '100%', ...shadow.lg },
  calNav: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  calMonth: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  calRow: { flexDirection: 'row', gap: sp(1) },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.gray[500], paddingVertical: sp(1) },
  calCell: { flex: 1, alignItems: 'center' },
  calDay: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  calFooter: { marginTop: sp(4), paddingTop: sp(4), borderTopWidth: 1, borderTopColor: colors.gray[200] },
  calFooterText: { fontSize: 12, lineHeight: 16, color: colors.gray[600], textAlign: 'center', fontWeight: '500' },
});
