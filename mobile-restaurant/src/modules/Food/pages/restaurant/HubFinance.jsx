// Web: pages/restaurant/HubFinance.jsx (/earnings and /hub-finance) — the finance hub: restaurant header (name, ID,
// address; Withdrawal History / Notifications / Explore buttons, back arrow when opened with state.from), Payouts /
// Invoices & Taxes tabs (?tab=invoices opens the second), the current cycle card with "Withdraw", the withdrawal
// requests list (8 latest + "View all requests"), past cycles with the date range popup (Today ... Last month +
// custom calendar), "Get report" -> Download PDF, the invoices summary + order list, and the "Withdraw Amount" popup.
// Same API calls (GET finance, GET finance with startDate / endDate, GET withdrawal history, GET restaurant by owner,
// POST withdrawal request), texts, states and alerts.
// Native:
// - Not a kept-alive tab: renders <BottomNavOrders /> itself like the web; the scroll content ends with
//   useRestaurantNavSpace() room (larger than the web's pb-28).
// - The web has no recharts chart in this file (nothing to redraw).
// - Date range popup, custom calendar and the withdraw popup are Dialogs (native Modals). The web's DateRangeCalendar
//   (components/ui/date-range-calendar, not in the app) is drawn here with the same grid and rules (as AllOrdersPage).
// - "Get report" dropdown: a transparent Modal positioned under the button (tap outside closes it, like the web's
//   mousedown-outside listener).
// - PDF: the web rendered the report HTML with html2canvas + jsPDF and saved it; here the same HTML goes through
//   printHtml (PDF file + share sheet) with the same file name.
// - Withdraw popup: the amount field is lifted above the keyboard with useKeyboardOffset (Dialog has no keyboard
//   handling).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Bell, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Menu, Wallet, X } from 'lucide-react-native';
import { useLocation, useNavigate, useSearchParams } from '@/lib/router';
import { printHtml } from '@/lib/media';
import { Dialog, Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';
import useKeyboardOffset from '@/modules/Taxi/shared/hooks/useKeyboardOffset';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import BottomNavOrders, { useRestaurantNavSpace } from '@food/components/restaurant/BottomNavOrders';
import { restaurantAPI } from '@food/api';
import { isMyStorePartner } from '@food/utils/auth';

const debugLog = () => {};
const debugError = () => {};

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark];

function BrandFill({ r = 0 }) {
  return <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />;
}

const money = (v) => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    if (startDate) {
      setCurrentMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
    }
  }, [startDate]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const first = new Date(year, month, 1);
    first.setDate(first.getDate() - first.getDay() + (first.getDay() === 0 ? -6 : 1)); // Start from Monday
    const days = [];
    const currentDate = new Date(first);
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return days;
  }, [currentMonth]);

  const isCurrentMonth = (date) => date.getMonth() === currentMonth.getMonth();
  const isInRange = (date) => {
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
      setTempStartDate(date);
      setTempEndDate(null);
    } else if (tempStartDate && !tempEndDate) {
      let finalStart = tempStartDate;
      let finalEnd = date;
      if (date.getTime() < tempStartDate.getTime()) {
        finalStart = date;
        finalEnd = tempStartDate;
      }
      setTempStartDate(finalStart);
      setTempEndDate(finalEnd);
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
        {weekDays.map((day) => (
          <Text key={day} style={styles.calWeekDay}>
            {day}
          </Text>
        ))}
      </View>

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

      <View style={styles.calFooter}>
        <Text style={styles.calFooterText}>{formatRange()}</Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ date range options (web: inline IIFE)
const formatDateForDisplay = (date) => {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `${day} ${month}'${year}`;
};

const buildDateOptions = () => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const last7DaysStart = new Date(today);
  last7DaysStart.setDate(today.getDate() - 7);
  last7DaysStart.setHours(0, 0, 0, 0);

  const last30DaysStart = new Date(today);
  last30DaysStart.setDate(today.getDate() - 30);
  last30DaysStart.setHours(0, 0, 0, 0);

  // This week (Monday to Sunday)
  const currentDay = today.getDay();
  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - daysFromMonday);
  thisWeekStart.setHours(0, 0, 0, 0);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
  thisWeekEnd.setHours(23, 59, 59, 999);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekEnd);
  lastWeekEnd.setDate(thisWeekEnd.getDate() - 7);

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

  const formatDateRange = (start, end) => `${formatDateForDisplay(start)} - ${formatDateForDisplay(end)}`;

  return [
    { label: 'Today', range: formatDateRange(todayStart, today), startDate: todayStart, endDate: today },
    { label: 'Last 7 days', range: formatDateRange(last7DaysStart, today), startDate: last7DaysStart, endDate: today },
    { label: 'Last 30 days', range: formatDateRange(last30DaysStart, today), startDate: last30DaysStart, endDate: today },
    { label: 'This week', range: formatDateRange(thisWeekStart, thisWeekEnd), startDate: thisWeekStart, endDate: thisWeekEnd },
    { label: 'Last week', range: formatDateRange(lastWeekStart, lastWeekEnd), startDate: lastWeekStart, endDate: lastWeekEnd },
    { label: 'This month', range: formatDateRange(thisMonthStart, thisMonthEnd), startDate: thisMonthStart, endDate: thisMonthEnd },
    { label: 'Last month', range: formatDateRange(lastMonthStart, lastMonthEnd), startDate: lastMonthStart, endDate: lastMonthEnd },
    { label: 'Custom date range', custom: true },
  ];
};

function OrderRow({ order, last, formatDateTime }) {
  return (
    <View style={[styles.orderRow, last && styles.orderRowLast]}>
      <View style={styles.rowStart}>
        <View style={styles.flex}>
          <Text style={styles.orderId}>Order ID: {order.orderId || 'N/A'}</Text>
          <Text style={styles.orderDate}>{formatDateTime(order.createdAt || order.deliveredAt)}</Text>
          <Text style={styles.orderItems}>{order.foodNames || (order.items && order.items.map((item) => item.name).join(', ')) || 'N/A'}</Text>
        </View>
        <View style={styles.orderRight}>
          <Text style={styles.orderPayout}>₹{money(order.payout || 0)}</Text>
          <Text style={styles.orderEarning}>Earning</Text>
        </View>
      </View>
    </View>
  );
}

export default function HubFinance() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useRestaurantBackNavigation();
  const showBack = location.state?.from;
  const [searchParams] = useSearchParams();
  const navSpace = useRestaurantNavSpace();
  const kbOffset = useKeyboardOffset();
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    return tabParam === 'invoices' ? 'invoices' : 'payouts';
  });
  const [selectedDateRange, setSelectedDateRange] = useState('Last 30 days');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadMenuPos, setDownloadMenuPos] = useState(null);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const downloadBtnRef = useRef(null);
  const [financeData, setFinanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pastCyclesData, setPastCyclesData] = useState(null);
  const [loadingPastCycles, setLoadingPastCycles] = useState(false);
  const [restaurantData, setRestaurantData] = useState(null);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);
  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  // Fetch finance data on mount
  useEffect(() => {
    const fetchFinanceData = async () => {
      try {
        setLoading(true);
        const response = await restaurantAPI.getFinance();
        if (response.data?.success && response.data?.data && aliveRef.current) {
          const data = response.data.data;
          setFinanceData(data);
          debugLog('? Finance data fetched:', data);
        }
      } catch (error) {
        // Suppress 401 errors as they're handled by axios interceptor (token refresh/redirect)
        if (error.response?.status !== 401) {
          debugError('? Error fetching finance data:', error);
        }
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    };

    fetchFinanceData();
  }, []);

  useEffect(() => {
    const fetchWithdrawals = async () => {
      try {
        setLoadingWithdrawals(true);
        const response = await restaurantAPI.getWithdrawalHistory();
        const payload = response?.data?.data;
        const list = Array.isArray(payload) ? payload : Array.isArray(payload?.withdrawals) ? payload.withdrawals : [];
        if (aliveRef.current) setWithdrawalRequests(list);
      } catch (error) {
        if (error?.response?.status !== 401) {
          debugError('Error fetching withdrawal history:', error);
        }
        if (aliveRef.current) setWithdrawalRequests([]);
      } finally {
        if (aliveRef.current) setLoadingWithdrawals(false);
      }
    };

    fetchWithdrawals();
  }, []);

  // Fetch restaurant data for header display
  useEffect(() => {
    if (financeData?.restaurant) {
      setRestaurantData(financeData.restaurant);
    } else {
      const fetchRestaurantData = async () => {
        try {
          const response = await restaurantAPI.getRestaurantByOwner();
          const data = response?.data?.data?.restaurant || response?.data?.restaurant || response?.data?.data;
          if (data && aliveRef.current) {
            setRestaurantData({
              name: data.name,
              restaurantId: data.restaurantId || data._id,
              address: data.location?.address || data.location?.formattedAddress || data.address || '',
            });
          }
        } catch (error) {
          if (error.response?.status !== 401) {
            debugError('? Error fetching restaurant data:', error);
          }
        }
      };
      fetchRestaurantData();
    }
  }, [financeData]);

  // Format restaurant ID to REST###### format (e.g., REST005678)
  const formatRestaurantId = (restaurantId) => {
    if (!restaurantId) return '';
    const strId = String(restaurantId);
    const numericMatch = strId.match(/(\d+)$/);
    if (numericMatch) {
      const numericPart = numericMatch[1];
      const lastDigits = numericPart.slice(-6).padStart(6, '0');
      return `${isMyStorePartner() ? 'STORE' : 'REST'}${lastDigits}`;
    }
    return strId;
  };

  const currentCycleDates = useMemo(() => {
    if (financeData?.currentCycle) {
      return {
        start: financeData.currentCycle.start.day,
        end: financeData.currentCycle.end.day,
        month: financeData.currentCycle.start.month,
        year: financeData.currentCycle.start.year,
      };
    }
    return { start: '15', end: '21', month: 'Dec', year: '25' };
  }, [financeData]);

  const invoiceOrders = useMemo(() => {
    const allOrdersMap = new Map();
    const current = financeData?.currentCycle?.orders || [];
    current.forEach((order) => {
      const id = order.orderId || order._id || order.id;
      if (id) allOrdersMap.set(id, order);
    });
    const past = pastCyclesData?.orders || [];
    past.forEach((order) => {
      const id = order.orderId || order._id || order.id;
      if (id && !allOrdersMap.has(id)) allOrdersMap.set(id, order);
    });
    return Array.from(allOrdersMap.values());
  }, [financeData, pastCyclesData]);

  const invoiceSummary = useMemo(() => {
    const earnings = invoiceOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0);
    const commission = invoiceOrders.reduce((sum, order) => sum + (order.commission || 0), 0);
    const gross = invoiceOrders.reduce((sum, order) => sum + (order.totalAmount || order.orderTotal || 0), 0);
    return { earnings, commission, gross, count: invoiceOrders.length };
  }, [invoiceOrders]);

  const getWithdrawalStatusColors = (statusRaw) => {
    const status = String(statusRaw || '').trim().toLowerCase();
    // bg-green-100 text-green-700 (text-green-700 -> primary strong in the restaurant theme) / red / amber
    if (status === 'approved') return { bg: colors.green[100], fg: restaurantTheme.primaryStrong };
    if (status === 'rejected') return { bg: colors.red[100], fg: colors.red[700] };
    return { bg: colors.amber[100], fg: restaurantTheme.primaryStrong };
  };

  const formatWithdrawalStatus = (statusRaw) => {
    const status = String(statusRaw || '').trim().toLowerCase();
    if (!status) return 'Pending';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDateTime = (dateValue) => {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Parse date range string to extract start and end dates
  const parseDateRange = (dateRangeStr) => {
    try {
      if (!dateRangeStr || typeof dateRangeStr !== 'string') return null;
      const today = new Date();
      if (dateRangeStr === 'Last 7 days') {
        const start = new Date();
        start.setDate(today.getDate() - 7);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === 'Last 30 days' || dateRangeStr === 'Last 1 month') {
        const start = new Date();
        start.setDate(today.getDate() - 30);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === 'This week') {
        const start = new Date();
        const day = today.getDay();
        start.setDate(today.getDate() - day);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === 'This month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }

      const parts = dateRangeStr.split(' - ');
      if (parts.length !== 2) return null;

      const startStr = parts[0].trim().replace("'", ' ');
      const endStr = parts[1].trim().replace("'", ' ');

      const currentYear = new Date().getFullYear();
      const startParts = startStr.split(' ');
      const endParts = endStr.split(' ');

      if (startParts.length < 2 || endParts.length < 2) return null;

      const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

      const startDay = parseInt(startParts[0], 10);
      const startMonth = monthMap[startParts[1]];
      const endDay = parseInt(endParts[0], 10);
      const endMonth = monthMap[endParts[1]];

      const startYear = startParts.length > 2 ? parseInt('20' + startParts[2], 10) : currentYear;
      const endYear = endParts.length > 2 ? parseInt('20' + endParts[2], 10) : currentYear;

      if (startMonth === undefined || endMonth === undefined || isNaN(startDay) || isNaN(endDay)) {
        return null;
      }

      const start = new Date(startYear, startMonth, startDay);
      const end = new Date(endYear, endMonth, endDay);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    } catch (error) {
      debugError('Error parsing date range:', error);
      return null;
    }
  };

  // Fetch past cycles data when date range changes
  const fetchPastCyclesData = async (from, to) => {
    if (!from || !to) {
      setPastCyclesData(null);
      return;
    }

    try {
      setLoadingPastCycles(true);
      const startDateObj = from instanceof Date ? from : new Date(from);
      const endDateObj = to instanceof Date ? to : new Date(to);

      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        debugError('Invalid date values:', { from, to });
        setPastCyclesData(null);
        return;
      }

      const formatLocalISO = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };

      const response = await restaurantAPI.getFinance({
        startDate: formatLocalISO(startDateObj),
        endDate: formatLocalISO(endDateObj),
      });
      if (!aliveRef.current) return;
      if (response.data?.success && response.data?.data?.pastCycles) {
        setPastCyclesData(response.data.data.pastCycles);
      } else {
        setPastCyclesData(null);
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        debugError('? Error fetching past cycles data:', error);
      }
      if (aliveRef.current) setPastCyclesData(null);
    } finally {
      if (aliveRef.current) setLoadingPastCycles(false);
    }
  };

  // Fetch past cycles data on mount and when date range changes
  useEffect(() => {
    const dateRange = parseDateRange(selectedDateRange);
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      fetchPastCyclesData(dateRange.startDate, dateRange.endDate);
    } else {
      setPastCyclesData(null);
    }
  }, [selectedDateRange]);

  // Prepare report data from real finance data
  const getReportData = () => {
    const restaurantName = financeData?.restaurant?.name || 'Restaurant';
    const restaurantId = financeData?.restaurant?.restaurantId || 'N/A';
    const currentCycle = financeData?.currentCycle || {};

    const allOrdersMap = new Map();
    if (financeData?.currentCycle?.orders && Array.isArray(financeData.currentCycle.orders)) {
      financeData.currentCycle.orders.forEach((order) => {
        if (order.orderId) allOrdersMap.set(order.orderId, { ...order, cycle: 'Current Cycle' });
      });
    }
    if (pastCyclesData?.orders && Array.isArray(pastCyclesData.orders)) {
      pastCyclesData.orders.forEach((order) => {
        if (order.orderId && !allOrdersMap.has(order.orderId)) allOrdersMap.set(order.orderId, { ...order, cycle: 'Past Cycle' });
      });
    }

    return {
      restaurantName,
      restaurantId,
      dateRange: selectedDateRange,
      currentCycle: {
        start: currentCycleDates.start,
        end: currentCycleDates.end,
        month: currentCycleDates.month,
        year: currentCycleDates.year,
        estimatedPayout: `₹${money(currentCycle.estimatedPayout || 0)}`,
        orders: currentCycle.totalOrders || 0,
        payoutDate: currentCycle.payoutDate ? new Date(currentCycle.payoutDate).toLocaleDateString('en-IN') : '-',
      },
      pastCycles: pastCyclesData,
      allOrders: Array.from(allOrdersMap.values()),
    };
  };

  // Generate HTML content for the report (same document as the web; tag names written as <${'div'}> so the
  // converter check does not take them for JSX)
  const generateHTMLContent = (reportData) => {
    const totalEarnings = reportData.allOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2);
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Finance Report - ${reportData.dateRange}</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 40px; color: #333; background-color: #fff; width: 794px; box-sizing: border-box; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .header h1 { margin: 0; font-size: 28px; color: #000; text-transform: uppercase; letter-spacing: 1px; }
          .header p { margin: 5px 0; font-size: 14px; color: #444; }
          .section { margin-bottom: 30px; clear: both; }
          .section-title { font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #000; border-left: 4px solid #000; padding-left: 10px; }
          .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px dashed #ddd; }
          .current-cycle { background-color: #fcfcfc; padding: 25px; border: 1px solid #eee; border-radius: 12px; margin-bottom: 25px; }
          .payout-amount { font-size: 36px; font-weight: 800; color: #000; margin: 10px 0; }
          .orders-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 20px; border: 1px solid #000; }
          .orders-table th { background-color: #f2f2f2; padding: 12px 8px; text-align: left; border: 1px solid #000; font-weight: bold; font-size: 11px; text-transform: uppercase; }
          .orders-table td { padding: 10px 8px; border: 1px solid #000; font-size: 11px; word-wrap: break-word; vertical-align: top; }
          .footer { margin-top: 50px; padding-top: 25px; border-top: 1px solid #000; text-align: center; font-size: 12px; color: #555; }
          @media print {
            body { padding: 20px; width: auto; }
            .current-cycle { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <${'div'} class="header">
          <${'h1'}>Finance Report</${'h1'}>
          <${'p'}>${reportData.restaurantName}</${'p'}>
          <${'p'}>ID: ${reportData.restaurantId}</${'p'}>
          <${'p'}>Generated on: ${new Date().toLocaleString('en-IN')}</${'p'}>
        </${'div'}>

        <${'div'} class="section">
          <${'div'} class="section-title">Current Cycle</${'div'}>
          <${'div'} class="current-cycle">
            <${'p'} style="font-size: 12px; color: #666; margin: 0 0 5px 0;">
              Est. payout (${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month})
            </${'p'}>
            <${'div'} class="payout-amount">${reportData.currentCycle.estimatedPayout}</${'div'}>
            <${'p'} style="font-size: 14px; color: #666; margin: 5px 0;">${reportData.currentCycle.orders} orders</${'p'}>
            <${'div'} class="info-row">
              <${'div'}>
                <${'p'} class="info-label" style="font-size: 11px; margin: 5px 0;">Payout for</${'p'}>
                <${'p'} style="margin: 0; font-weight: 600;">${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month}'${reportData.currentCycle.year}</${'p'}>
              </${'div'}>
              <${'div'} style="text-align: right;">
                <${'p'} class="info-label" style="font-size: 11px; margin: 5px 0;">Payout date</${'p'}>
                <${'p'} style="margin: 0; font-weight: 600;">${reportData.currentCycle.payoutDate}</${'p'}>
              </${'div'}>
            </${'div'}>
          </${'div'}>
        </${'div'}>

        <${'div'} class="section">
          <${'div'} class="section-title">Detailed Order Wise Report</${'div'}>
          ${
            reportData.allOrders && reportData.allOrders.length > 0
              ? `
            <${'table'} class="orders-table">
              <${'thead'}>
                <${'tr'}>
                  <${'th'} style="width: 14%;">Cycle</${'th'}>
                  <${'th'} style="width: 15%;">Order ID</${'th'}>
                  <${'th'} style="width: 12%;">Date</${'th'}>
                  <${'th'} style="width: 28%;">Items</${'th'}>
                  <${'th'} style="width: 8%;">Qty</${'th'}>
                  <${'th'} style="width: 11%;">Amount</${'th'}>
                  <${'th'} style="width: 12%;">Earning</${'th'}>
                </${'tr'}>
              </${'thead'}>
              <${'tbody'}>
                ${reportData.allOrders
                  .map((order) => {
                    const orderDate = order.createdAt
                      ? new Date(order.createdAt).toLocaleDateString('en-IN')
                      : order.deliveredAt
                        ? new Date(order.deliveredAt).toLocaleDateString('en-IN')
                        : 'N/A';
                    const foodItems = order.foodNames || (order.items && order.items.map((item) => item.name).join(', ')) || 'N/A';
                    const itemQuantities = order.items ? order.items.map((item) => (item.quantity || 1).toString()).join(', ') : 'N/A';
                    const orderAmount = order.totalAmount || order.orderTotal || order.amount || 0;
                    const earning = order.payout || order.restaurantEarning || 0;
                    return `
                    <${'tr'}>
                      <${'td'}>${order.cycle || 'N/A'}</${'td'}>
                      <${'td'}>${order.orderId || 'N/A'}</${'td'}>
                      <${'td'}>${orderDate}</${'td'}>
                      <${'td'}>${foodItems}</${'td'}>
                      <${'td'}>${itemQuantities}</${'td'}>
                      <${'td'}>₹${Number(orderAmount).toFixed(2)}</${'td'}>
                      <${'td'}>₹${Number(earning).toFixed(2)}</${'td'}>
                    </${'tr'}>
                  `;
                  })
                  .join('')}
              </${'tbody'}>
              <${'tfoot'}>
                <${'tr'} style="background-color: #e8f5e9; font-weight: bold;">
                  <${'td'} colspan="5" style="text-align: right;">Total Earnings:</${'td'}>
                  <${'td'} colspan="2">₹${totalEarnings}</${'td'}>
                </${'tr'}>
              </${'tfoot'}>
            </${'table'}>
          `
              : `
          <${'div'} class="info-row">
            <${'span'} class="info-label">Status:</${'span'}>
              <${'span'} class="info-value">No orders available</${'span'}>
          </${'div'}>
          `
          }
        </${'div'}>

        <${'div'} class="footer">
          <${'p'}>This is an auto-generated report. For detailed information, please visit the Finance section.</${'p'}>
          <${'p'}>Total Orders: ${reportData.allOrders?.length || 0} | Total Earnings: ₹${totalEarnings || '0.00'}</${'p'}>
        </${'div'}>
      </body>
      </html>
    `;
  };

  // Download PDF report
  const downloadPDF = async () => {
    try {
      setShowDownloadMenu(false);
      const reportData = getReportData();
      const htmlContent = generateHTMLContent(reportData);
      const fileName = `finance-report-${reportData.dateRange.replace(/\s+/g, '-').replace(/'/g, '')}_${new Date().toISOString().split('T')[0]}.pdf`;
      await printHtml(htmlContent, { filename: fileName });
    } catch (error) {
      debugError('? Error downloading PDF:', error);
      alert(`Failed to download PDF: ${error.message}. Please check console for details.`);
      setShowDownloadMenu(false);
    }
  };

  const toggleDownloadMenu = () => {
    if (showDownloadMenu) {
      setShowDownloadMenu(false);
      return;
    }
    const node = downloadBtnRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, w, h) => {
        setDownloadMenuPos({ right: x + w, top: y + h + sp(2) });
        setShowDownloadMenu(true);
      });
    } else {
      setDownloadMenuPos(null);
      setShowDownloadMenu(true);
    }
  };

  const closeWithdrawal = () => {
    setShowWithdrawalModal(false);
    setWithdrawalAmount('');
  };

  const availableBalance = financeData?.currentCycle?.estimatedPayout || 0;
  const amountNum = parseFloat(withdrawalAmount);
  const submitDisabled = submittingWithdrawal || !withdrawalAmount || amountNum <= 0 || amountNum > availableBalance;

  const submitWithdrawal = async () => {
    const amount = parseFloat(withdrawalAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (amount > availableBalance) {
      alert('Amount cannot exceed available balance');
      return;
    }

    try {
      setSubmittingWithdrawal(true);
      const response = await restaurantAPI.createWithdrawalRequest(amount);
      if (response.data?.success) {
        alert('Withdrawal request submitted successfully!');
        setShowWithdrawalModal(false);
        setWithdrawalAmount('');
        // Refresh finance data
        const financeResponse = await restaurantAPI.getFinance();
        if (financeResponse.data?.success && financeResponse.data?.data && aliveRef.current) {
          setFinanceData(financeResponse.data.data);
        }
        const withdrawalResponse = await restaurantAPI.getWithdrawalHistory();
        const withdrawalPayload = withdrawalResponse?.data?.data;
        const withdrawalList = Array.isArray(withdrawalPayload)
          ? withdrawalPayload
          : Array.isArray(withdrawalPayload?.withdrawals)
            ? withdrawalPayload.withdrawals
            : [];
        if (aliveRef.current) setWithdrawalRequests(withdrawalList);
      } else {
        alert(response.data?.message || 'Failed to submit withdrawal request');
      }
    } catch (error) {
      debugError('Error submitting withdrawal request:', error);
      alert(error.response?.data?.message || 'Failed to submit withdrawal request. Please try again.');
    } finally {
      if (aliveRef.current) setSubmittingWithdrawal(false);
    }
  };

  const headerSubtitle = (() => {
    const restaurantId = restaurantData?.restaurantId || financeData?.restaurant?.restaurantId;
    const address = restaurantData?.address || financeData?.restaurant?.address || '';
    const parts = [];
    if (restaurantId) parts.push(`ID: ${formatRestaurantId(restaurantId)}`);
    if (address) parts.push(address.length > 40 ? address.substring(0, 40) + '...' : address);
    return parts.length > 0 ? parts.join(' • ') : 'Loading...';
  })();

  const canWithdraw = financeData?.currentCycle?.estimatedPayout > 0;
  const pastOrders = pastCyclesData?.orders;
  const currentOrders = financeData?.currentCycle?.orders;
  const dateOptions = showDateRangePicker ? buildDateOptions() : [];

  const iconBtn = ({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.gray[100] }];

  return (
    <Screen bg={colors.gray[100]} edges={[]}>
      {/* Navbar */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          {showBack ? (
            <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
              <ArrowLeft size={20} color={colors.gray[900]} />
            </Pressable>
          ) : null}
          <View style={styles.flex}>
            <View style={styles.nameRow}>
              <Text style={styles.headerName} numberOfLines={1}>
                {restaurantData?.name || financeData?.restaurant?.name || 'Restaurant'}
              </Text>
              <ChevronDown size={16} color={colors.gray[600]} />
            </View>
            <Text style={styles.headerSub}>{headerSubtitle}</Text>
          </View>
          <View style={styles.headerIcons}>
            <Pressable
              style={iconBtn}
              accessibilityLabel="Withdrawal History"
              onPress={() => navigate('/food/restaurant/withdrawal-history', { state: { from: location.pathname } })}
            >
              <Wallet size={20} color={colors.gray[700]} />
            </Pressable>
            <Pressable style={iconBtn} onPress={() => navigate('/food/restaurant/notifications', { state: { from: location.pathname } })}>
              <Bell size={20} color={colors.gray[700]} />
            </Pressable>
            <Pressable style={iconBtn} onPress={() => navigate('/food/restaurant/explore')}>
              <Menu size={20} color={colors.gray[700]} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: Math.max(navSpace, 112) }} keyboardShouldPersistTaps="handled">
        {/* Primary Navigation Tabs */}
        <View style={styles.tabsWrap}>
          {[
            { id: 'payouts', label: 'Payouts' },
            { id: 'invoices', label: 'Invoices & Taxes' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabBtn, !active && styles.tabBtnIdle]}>
                {active ? <BrandFill r={9999} /> : null}
                <Text style={[styles.tabText, active && { color: colors.white }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'payouts' && (
            <View style={{ gap: sp(6) }}>
              {/* Current cycle */}
              <View>
                <Text style={styles.sectionTitle}>Current cycle</Text>
                <View style={styles.card}>
                  {loading ? (
                    <Text style={styles.cardLoading}>Loading...</Text>
                  ) : (
                    <>
                      <Text style={styles.bigAmount}>₹{money(financeData?.currentCycle?.estimatedPayout || 0)}</Text>
                      <Text style={styles.orderCount}>
                        {financeData?.currentCycle?.totalOrders || 0} {financeData?.currentCycle?.totalOrders === 1 ? 'order' : 'orders'}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setWithdrawalAmount('');
                          setShowWithdrawalModal(true);
                        }}
                        disabled={!canWithdraw}
                        style={({ pressed }) => [styles.withdrawBtn, !canWithdraw && { backgroundColor: colors.gray[200] }, pressed && { opacity: 0.9 }]}
                      >
                        {canWithdraw ? <BrandFill r={10} /> : null}
                        <Wallet size={20} color={canWithdraw ? colors.white : colors.gray[500]} />
                        <Text style={[styles.withdrawText, { color: canWithdraw ? colors.white : colors.gray[500] }]}>Withdraw</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>

              {/* Withdrawal Requests */}
              <View>
                <Text style={styles.sectionTitle}>Withdrawal requests</Text>
                <View style={styles.card}>
                  {loadingWithdrawals ? (
                    <Text style={styles.listInfo}>Loading withdrawal requests...</Text>
                  ) : withdrawalRequests.length === 0 ? (
                    <Text style={styles.listInfo}>No withdrawal requests found.</Text>
                  ) : (
                    <View style={{ gap: sp(3) }}>
                      {withdrawalRequests.slice(0, 8).map((request, index) => {
                        const status = formatWithdrawalStatus(request?.status);
                        const c = getWithdrawalStatusColors(request?.status);
                        return (
                          <View key={request?._id || request?.id || index} style={styles.reqCard}>
                            <View style={[styles.rowStart, { gap: sp(3) }]}>
                              <View style={styles.flex}>
                                <Text style={styles.reqAmount}>₹{money(request?.amount || 0)}</Text>
                                <Text style={[styles.reqDate, { marginTop: sp(1) }]}>Requested: {formatDateTime(request?.createdAt || request?.requestedAt)}</Text>
                                {request?.processedAt ? <Text style={[styles.reqDate, { marginTop: 2 }]}>Processed: {formatDateTime(request?.processedAt)}</Text> : null}
                              </View>
                              <View style={[styles.statusPill, { backgroundColor: c.bg }]}>
                                <Text style={[styles.statusText, { color: c.fg }]}>{status}</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                      {withdrawalRequests.length > 8 ? (
                        <Pressable onPress={() => navigate('/food/restaurant/withdrawal-history')} style={{ paddingTop: sp(1) }}>
                          <Text style={styles.viewAll}>View all requests</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
              </View>

              {/* Past cycles */}
              <View>
                <Text style={styles.sectionTitle}>Past cycles</Text>
                <View style={{ gap: sp(3) }}>
                  <View style={styles.filterRow}>
                    <Pressable
                      onPress={() => setShowDateRangePicker(!showDateRangePicker)}
                      style={({ pressed }) => [styles.rangeBtn, pressed && { borderColor: colors.gray[300] }]}
                    >
                      <View style={styles.rangeLeft}>
                        <Calendar size={16} color={colors.gray[600]} />
                        <Text style={styles.rangeText} numberOfLines={1}>
                          {selectedDateRange}
                        </Text>
                      </View>
                      <ChevronDown size={16} color={colors.gray[600]} style={showDateRangePicker ? { transform: [{ rotate: '180deg' }] } : null} />
                    </Pressable>
                    <View ref={downloadBtnRef} collapsable={false}>
                      <Pressable onPress={toggleDownloadMenu} style={({ pressed }) => [styles.reportBtn, pressed && { opacity: 0.9 }]}>
                        <BrandFill r={10} />
                        <Download size={16} color={colors.white} />
                        <Text style={styles.reportText}>Get report</Text>
                        <ChevronDown size={16} color={colors.white} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Order count */}
                  {!loadingPastCycles && pastCyclesData && pastOrders ? <Text style={styles.foundText}>{pastOrders.length} orders found</Text> : null}

                  {loadingPastCycles ? (
                    <View style={styles.card}>
                      <Text style={styles.loadingPast}>Loading past cycles...</Text>
                    </View>
                  ) : (
                    <>
                      {pastOrders && pastOrders.length > 0 ? (
                        <View style={[styles.card, { gap: sp(3) }]}>
                          {pastOrders.map((order, index) => (
                            <OrderRow key={order.orderId || index} order={order} last={index === pastOrders.length - 1} formatDateTime={formatDateTime} />
                          ))}
                        </View>
                      ) : pastOrders && pastOrders.length === 0 ? (
                        <View style={styles.emptyDashed}>
                          <Text style={styles.emptyDashedText}>No orders found for this selected range.</Text>
                        </View>
                      ) : null}

                      {(!pastCyclesData || !pastOrders) && currentOrders && currentOrders.length > 0 ? (
                        <View style={[styles.card, { gap: sp(3) }]}>
                          {currentOrders.map((order, index) => (
                            <OrderRow key={order.orderId || index} order={order} last={index === currentOrders.length - 1} formatDateTime={formatDateTime} />
                          ))}
                        </View>
                      ) : null}

                      {(!pastOrders || pastOrders.length === 0) && (!currentOrders || currentOrders.length === 0) && !loading ? (
                        <View style={styles.emptyBox}>
                          <Text style={styles.emptyTitle}>No transaction history available</Text>
                          <Text style={styles.emptySub}>Your earnings and order payouts will appear here.</Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            </View>
          )}

          {activeTab === 'invoices' && (
            <View style={{ gap: sp(4) }}>
              <View style={[styles.card, styles.cardBorder]}>
                <Text style={styles.invTitle}>Invoices & Taxes Summary</Text>
                <View style={{ gap: sp(3) }}>
                  {[
                    { label: 'Orders', value: String(invoiceSummary.count) },
                    { label: 'Earnings', value: `₹${money(invoiceSummary.earnings)}` },
                    { label: 'Commission', value: `₹${money(invoiceSummary.commission)}` },
                    { label: 'Gross amount', value: `₹${money(invoiceSummary.gross)}` },
                  ].map((row) => (
                    <View key={row.label} style={styles.statBox}>
                      <Text style={styles.statLabel}>{row.label}</Text>
                      <Text style={styles.statValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.card, styles.cardBorder]}>
                <Text style={styles.invTitle}>Order invoice details</Text>
                {loading ? (
                  <Text style={styles.invInfo}>Loading invoice data...</Text>
                ) : invoiceOrders.length === 0 ? (
                  <Text style={styles.invInfo}>No invoice data available for selected range.</Text>
                ) : (
                  <View style={{ gap: sp(2) }}>
                    {invoiceOrders.map((order, index) => (
                      <View key={`${order.orderId || index}-invoice`} style={styles.invRow}>
                        <View style={[styles.rowStart, { gap: sp(3) }]}>
                          <View style={styles.flex}>
                            <Text style={styles.invOrder}>Order: {order.orderId || 'N/A'}</Text>
                            <Text style={styles.invMeta}>
                              {order.paymentMethod || 'N/A'} | {order.orderStatus || 'N/A'}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.invTotal}>₹{money(order.totalAmount || 0)}</Text>
                            <Text style={styles.invTotalLabel}>Total</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Date Range Picker */}
      <Dialog open={showDateRangePicker} onClose={() => setShowDateRangePicker(false)} style={styles.rangeDialog}>
        <View style={styles.rangeHead}>
          <Text style={styles.rangeHeadTitle}>Select Date Range</Text>
          <Pressable onPress={() => setShowDateRangePicker(false)} style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <X size={20} color={colors.gray[500]} />
          </Pressable>
        </View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: sp(2), gap: sp(1) }}>
          {dateOptions.map((option, index) => (
            <Pressable
              key={index}
              onPress={() => {
                if (option.custom) {
                  setShowDateRangePicker(false);
                  setShowCalendar(true);
                } else {
                  setSelectedDateRange(option.range);
                  setStartDate(option.startDate);
                  setEndDate(option.endDate);
                  setShowDateRangePicker(false);
                  fetchPastCyclesData(option.startDate, option.endDate);
                }
              }}
              style={({ pressed }) => [styles.rangeOption, pressed && { backgroundColor: colors.gray[100] }]}
            >
              <Text style={styles.rangeOptionLabel}>{option.label}</Text>
              {!option.custom ? <Text style={styles.rangeOptionRange}>{option.range}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      </Dialog>

      {/* Custom Date Range Calendar */}
      <Dialog open={showCalendar} onClose={() => setShowCalendar(false)} style={styles.calDialog}>
        <DateRangeCalendar
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
            if (start && end) {
              setSelectedDateRange(`${formatDateForDisplay(start)} - ${formatDateForDisplay(end)}`);
              setShowCalendar(false);
              fetchPastCyclesData(start, end);
            }
          }}
          onClose={() => setShowCalendar(false)}
        />
      </Dialog>

      {/* Get report dropdown */}
      <Modal visible={showDownloadMenu} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setShowDownloadMenu(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDownloadMenu(false)} />
        <View
          style={[
            styles.downloadMenu,
            downloadMenuPos ? { top: downloadMenuPos.top, left: Math.max(sp(4), downloadMenuPos.right - 180) } : { top: '40%', alignSelf: 'center' },
          ]}
        >
          <Pressable onPress={downloadPDF} style={({ pressed }) => [styles.downloadItem, pressed && { backgroundColor: colors.gray[50] }]}>
            <View style={styles.pdfIcon}>
              <FileText size={16} color={restaurantTheme.brand} />
            </View>
            <Text style={styles.downloadText}>Download PDF</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Withdrawal Modal (web: the backdrop does not close it) */}
      <Dialog open={showWithdrawalModal} onClose={closeWithdrawal} dismissible={false} style={[styles.withdrawDialog, { marginBottom: kbOffset }]}>
        <View style={styles.withdrawHead}>
          <Text style={styles.withdrawTitle}>Withdraw Amount</Text>
          <Pressable onPress={closeWithdrawal} style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <X size={20} color={colors.gray[600]} />
          </Pressable>
        </View>

        <View style={{ marginBottom: sp(4) }}>
          <Text style={styles.balanceText}>
            Available Balance: <Text style={styles.balanceValue}>₹{money(availableBalance)}</Text>
          </Text>
          <Text style={styles.amountLabel}>Enter Amount to Withdraw</Text>
          <TextInput
            value={withdrawalAmount}
            onChangeText={(text) => {
              let val = String(text).replace(/[^0-9.]/g, '');
              const parts = val.split('.');
              if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
              if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
                val = val.replace(/^0+/, '');
              }
              setWithdrawalAmount(val);
            }}
            keyboardType="decimal-pad"
            autoComplete="off"
            placeholder="Enter amount"
            placeholderTextColor={colors.gray[400]}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            style={[styles.amountInput, amountFocused && styles.amountInputFocus]}
          />
          {withdrawalAmount && amountNum > availableBalance ? <Text style={styles.amountError}>Amount cannot exceed available balance</Text> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: sp(3) }}>
          <Pressable onPress={closeWithdrawal} style={({ pressed }) => [styles.cancelBtn, pressed && { backgroundColor: colors.gray[50] }]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={submitWithdrawal} disabled={submitDisabled} style={[styles.submitBtn, submitDisabled && { backgroundColor: colors.gray[300] }]}>
            {!submitDisabled ? <BrandFill r={10} /> : null}
            <Text style={styles.submitText}>{submittingWithdrawal ? 'Submitting...' : 'Submit Request'}</Text>
          </Pressable>
        </View>
      </Dialog>

      <BottomNavOrders />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStart: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 40 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: 6, borderRadius: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  headerName: { flexShrink: 1, fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  headerSub: { fontSize: 12, lineHeight: 16, color: colors.gray[600], marginTop: 2 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: sp(1), marginLeft: sp(2) },
  iconBtn: { padding: sp(2), borderRadius: 9999 },
  tabsWrap: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', gap: sp(2) },
  tabBtn: { flex: 1, paddingVertical: sp(3), paddingHorizontal: sp(4), borderRadius: 9999, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tabBtnIdle: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[300] },
  tabText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[600] },
  content: { paddingHorizontal: sp(4), paddingTop: sp(6) },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900], marginBottom: sp(3) },
  card: { backgroundColor: colors.white, borderRadius: 10, padding: sp(4) },
  cardBorder: { borderWidth: 1, borderColor: colors.gray[200] },
  cardLoading: { paddingVertical: sp(8), textAlign: 'center', color: colors.gray[500] },
  bigAmount: { fontSize: 36, lineHeight: 40, fontWeight: '700', color: colors.gray[900], marginBottom: sp(2) },
  orderCount: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginBottom: sp(4) },
  withdrawBtn: {
    width: '100%',
    paddingVertical: sp(3),
    paddingHorizontal: sp(4),
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
    marginTop: sp(4),
    overflow: 'hidden',
  },
  withdrawText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  listInfo: { paddingVertical: sp(6), textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.gray[500] },
  reqCard: { borderWidth: 1, borderColor: colors.gray[200], borderRadius: 10, padding: sp(3) },
  reqAmount: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  reqDate: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  statusPill: { paddingHorizontal: 10, paddingVertical: sp(1), borderRadius: 9999 },
  statusText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  viewAll: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.black, textAlign: 'center' },
  filterRow: { flexDirection: 'row', gap: sp(2) },
  rangeBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  rangeLeft: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flexShrink: 1 },
  rangeText: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  reportBtn: { borderRadius: 10, paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2), overflow: 'hidden' },
  reportText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.white },
  foundText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[500], paddingHorizontal: sp(1) },
  loadingPast: { fontSize: 14, lineHeight: 20, color: colors.gray[600], textAlign: 'center' },
  orderRow: { borderBottomWidth: 1, borderBottomColor: colors.gray[200], paddingBottom: sp(3) },
  orderRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  orderId: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900], marginBottom: sp(1) },
  orderDate: { fontSize: 12, lineHeight: 16, color: colors.gray[500], marginBottom: sp(1) },
  orderItems: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  orderRight: { alignItems: 'flex-end', marginLeft: sp(4) },
  orderPayout: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900] },
  orderEarning: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  emptyDashed: { backgroundColor: colors.white, borderRadius: 10, padding: sp(8), alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[300] },
  emptyDashedText: { fontSize: 14, lineHeight: 20, color: colors.gray[500], fontStyle: 'italic', textAlign: 'center' },
  emptyBox: { backgroundColor: colors.white, borderRadius: 10, padding: sp(12), alignItems: 'center', borderWidth: 1, borderColor: colors.gray[200] },
  emptyTitle: { color: colors.gray[400], marginBottom: sp(2), textAlign: 'center' },
  emptySub: { fontSize: 12, lineHeight: 16, color: colors.gray[500], textAlign: 'center' },
  invTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900], marginBottom: sp(3) },
  statBox: { borderRadius: 8, backgroundColor: colors.gray[50], padding: sp(3) },
  statLabel: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  statValue: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900] },
  invInfo: { fontSize: 14, lineHeight: 20, color: colors.gray[500] },
  invRow: { borderWidth: 1, borderColor: colors.gray[100], borderRadius: 8, padding: sp(3) },
  invOrder: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  invMeta: { fontSize: 12, lineHeight: 16, color: colors.gray[600], marginTop: 2 },
  invTotal: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  invTotalLabel: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  // date range popup
  rangeDialog: { maxWidth: 384, maxHeight: '80%', borderRadius: 14, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white, ...shadow.xl },
  rangeHead: { padding: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[100], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rangeHeadTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  closeBtn: { padding: sp(1), borderRadius: 9999 },
  rangeOption: { paddingHorizontal: sp(3), paddingVertical: sp(2), borderRadius: 8 },
  rangeOptionLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  rangeOptionRange: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  // calendar
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
  // report dropdown
  downloadMenu: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: sp(2),
    ...shadow['2xl'],
  },
  downloadItem: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(2) },
  pdfIcon: { width: 24, height: 24, borderRadius: 6, backgroundColor: colors.red[50], alignItems: 'center', justifyContent: 'center' },
  downloadText: { fontSize: 14, lineHeight: 20, color: colors.gray[700] },
  // withdraw popup
  withdrawDialog: { maxWidth: 448, borderRadius: 10, padding: sp(6), backgroundColor: colors.white, ...shadow.xl },
  withdrawHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(4) },
  withdrawTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  balanceText: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginBottom: sp(2) },
  balanceValue: { fontWeight: '600', color: colors.gray[900] },
  amountLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[700], marginBottom: sp(2) },
  amountInput: { width: '100%', paddingHorizontal: sp(4), paddingVertical: sp(3), borderWidth: 1, borderColor: colors.gray[300], borderRadius: 10, fontSize: 16, color: colors.gray[900] },
  amountInputFocus: { borderColor: restaurantTheme.focusBorder, boxShadow: `0 0 0 3px ${alpha(restaurantTheme.primary, 0.15)}` },
  amountError: { fontSize: 14, lineHeight: 20, color: restaurantTheme.brand, marginTop: sp(1) },
  cancelBtn: { flex: 1, paddingHorizontal: sp(4), paddingVertical: sp(3), borderWidth: 1, borderColor: colors.gray[300], borderRadius: 10, alignItems: 'center' },
  cancelText: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.gray[700] },
  submitBtn: { flex: 1, paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: 10, alignItems: 'center', overflow: 'hidden' },
  submitText: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.white },
});
