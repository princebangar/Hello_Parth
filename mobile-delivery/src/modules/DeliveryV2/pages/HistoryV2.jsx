import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, ChevronDown, Gift, X,
  Clock, Search
} from 'lucide-react-native';
import { deliveryAPI } from '@food/api';
import { toast } from '@/lib/toast';
import { Sheet, Skeleton, Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, deliveryTheme, fonts, shadow } from '@/theme';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';
import { useDeliveryTabActive } from '../deliveryTabPages';

const PRIMARY = '#15498B'; // text-[#10B981], bg-[#10B981], text-orange-500/600 (deliveryTheme.css)
const PRIMARY_SOFT = '#E7EFFA'; // bg-green-50, bg-orange-50, bg-green-500/10
const PRIMARY_BORDER = '#C3D0E1'; // border-green-100, border-green-500/20
const CARD_BORDER = '#D1DCEB'; // rounded-2xl border
const RX = { elevation: 3, shadowColor: '#112743', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } };

const HISTORY_PREFS_KEY = 'delivery_trip_history_prefs_v1';

const toLocalDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateKey = (key) => {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null;
  const [y, m, d] = String(key).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

const loadHistoryPrefs = () => {
  try {
    const raw = localStorage.getItem(HISTORY_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * HistoryV2 - EXACT 1:1 Match with User Screenshot.
 * Theme: Clean White
 * Accent: Emerald Green (#10B981)
 * Font: Poppins
 * Rendered inside DeliveryHomeV2's History tab (kept alive, no Home header on this tab): the web loaded the trips on
 * mount, which here is each time the tab becomes the one on screen (old trips stay visible while they reload).
 */
export const HistoryV2 = () => {
  const tabScrollRef = useRef(null);
  useTabScrollTop(tabScrollRef);
  const goBack = useDeliveryBackNavigation();
  const tabActive = useDeliveryTabActive();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const savedPrefs = useMemo(() => loadHistoryPrefs(), []);
  const [activeTab, setActiveTab] = useState(() => {
    const tab = String(savedPrefs?.activeTab || 'daily').toLowerCase();
    return ['daily', 'weekly', 'monthly'].includes(tab) ? tab : 'daily';
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    return parseLocalDateKey(savedPrefs?.selectedDate) || new Date();
  });
  const [selectedTripType, setSelectedTripType] = useState(() => {
    const type = savedPrefs?.selectedTripType || 'ALL TRIPS';
    return ['ALL TRIPS', 'Completed', 'Cancelled', 'Pending'].includes(type) ? type : 'ALL TRIPS';
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTripTypePicker, setShowTripTypePicker] = useState(false);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusTransactions, setBonusTransactions] = useState([]);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [topBlockHeight, setTopBlockHeight] = useState(0);
  const requestIdRef = useRef(0);
  const lastFilterKeyRef = useRef(null);

  const tripTypes = ["ALL TRIPS", "Completed", "Cancelled", "Pending"];

  // Popups belong to this screen: when another page / tab opens, they close (web: the page unmounted).
  useEffect(() => {
    if (tabActive) return;
    setShowDatePicker(false);
    setShowTripTypePicker(false);
    setShowBonusModal(false);
  }, [tabActive]);

  // Persist filters so refresh / remount keeps yesterday (etc.) selected
  useEffect(() => {
    try {
      localStorage.setItem(
        HISTORY_PREFS_KEY,
        JSON.stringify({
          activeTab,
          selectedDate: toLocalDateKey(selectedDate),
          selectedTripType,
        }),
      );
    } catch {
      // ignore quota / private mode
    }
  }, [activeTab, selectedDate, selectedTripType]);

  // Fetch Logic
  const fetchTrips = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const dateStr = toLocalDateKey(selectedDate);
    const filterKey = `${activeTab}|${dateStr}|${selectedTripType}`;
    // a new filter shows the loader (web); a revisit / pull-to-refresh keeps the old trips on screen
    if (lastFilterKeyRef.current !== filterKey) {
      lastFilterKeyRef.current = filterKey;
      setLoading(true);
    }
    try {
      const params = {
        period: activeTab,
        date: dateStr,
        status: selectedTripType !== "ALL TRIPS" ? selectedTripType : undefined,
        limit: 1000
      };

      const response = await deliveryAPI.getTripHistory(params);
      if (requestId !== requestIdRef.current) return;
      if (response.data?.success) {
        setTrips(response.data.data.trips || []);
      } else {
        setTrips([]);
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setTrips([]);
      toast.error("Failed to load history");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [selectedDate, activeTab, selectedTripType]);

  useEffect(() => {
    if (!tabActive) return undefined;
    fetchTrips();
    return () => {
      // a newer request (or leaving) makes this one stale
      requestIdRef.current += 1;
    };
  }, [tabActive, fetchTrips]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTrips();
    setRefreshing(false);
  };

  // Bonus Logic
  useEffect(() => {
    if (showBonusModal) {
      const fetchBonus = async () => {
        setBonusLoading(true);
        try {
          const res = await deliveryAPI.getWalletTransactions({ type: 'bonus', limit: 50 });
          if (res.data?.success) setBonusTransactions(res.data.data.transactions || []);
        } catch { toast.error("Failed to load bonuses"); }
        finally { setBonusLoading(false); }
      };
      fetchBonus();
    }
  }, [showBonusModal]);

  const formatDateDisplay = (date) => {
    if (activeTab === 'monthly') {
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() ? `This month: ${label}` : label;
    }
    if (activeTab === 'weekly') {
      const start = new Date(date);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const f = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      return `${f(start)} - ${f(end)}`;
    }
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const day = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

    if (date.toDateString() === today.toDateString()) return `Today: ${day}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday: ${day}`;
    return day;
  };

  const recentDates = useMemo(() => {
    if (activeTab === 'monthly') {
      return [...Array(12)].map((_, i) => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        return d;
      });
    }
    if (activeTab === 'weekly') {
      return [...Array(12)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        return d;
      });
    }
    return [...Array(30)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d;
    });
  }, [activeTab]);

  const isSameSelection = (a, b) => {
    if (activeTab === 'monthly') return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    if (activeTab === 'weekly') return formatDateDisplay(a) === formatDateDisplay(b);
    return a.toDateString() === b.toDateString();
  };

  const metrics = useMemo(() => {
    return trips.reduce((acc, trip) => {
      const status = String(trip.status || '').toLowerCase();
      if (status === 'completed') {
        acc.earnings += Number(trip.deliveryEarning ?? trip.amount ?? trip.earningAmount ?? 0) || 0;
        const method = String(trip.paymentMethod || '').toLowerCase();
        const isCOD =
          method === 'cash' ||
          method === 'cod' ||
          method === 'cash on delivery';
        if (isCOD) {
          const collected = Number(trip.codCollectedAmount);
          const due = Number(trip.codAmount);
          const fallback = Number(trip.orderTotal);
          const amount = Number.isFinite(collected) && collected > 0
            ? collected
            : Number.isFinite(due) && due > 0
              ? due
              : (Number.isFinite(fallback) ? fallback : 0);
          acc.cod += amount;
        }
      }
      return acc;
    }, { earnings: 0, cod: 0 });
  }, [trips]);

  const extractItems = (trip) => {
    const items = trip.items || trip.orderItems || [];
    if (items.length === 0) return 'Standard Delivery';
    const first = items[0];
    const qty = first.quantity || first.qty || 1;
    const name = first.name || first.itemName || 'Item';
    return `${qty}x ${name}${items.length > 1 ? ` +${items.length - 1} more` : ''}`;
  };

  const renderTrip = ({ item: trip }) => {
    const isCompleted = (trip.status || '').toLowerCase() === 'completed';
    const isCancelled = (trip.status || '').toLowerCase() === 'cancelled';
    const payout = Number(trip.deliveryEarning ?? trip.amount ?? trip.earningAmount ?? 0) || 0;
    const collectedRaw = Number(trip.codCollectedAmount);
    const dueRaw = Number(trip.codAmount);
    const totalRaw = Number(trip.orderTotal);
    const collection = Number.isFinite(collectedRaw) && collectedRaw > 0
      ? collectedRaw
      : Number.isFinite(dueRaw) && dueRaw > 0
        ? dueRaw
        : (Number.isFinite(totalRaw) ? totalRaw : 0);
    const isQR = (trip.paymentMethod || '').toLowerCase() === 'razorpay_qr';
    const isCOD = (trip.paymentMethod || '').toLowerCase() === 'cash' || (trip.paymentMethod || '').toLowerCase() === 'cod';

    return (
      <View style={styles.tripCard}>
        <View style={styles.tripTop}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.tripId}>{trip.orderId || 'ORDER-ID'}</Text>
            <Text style={styles.tripRestaurant}>{trip.restaurant || trip.restaurantName || 'Sayaji'}</Text>
            <Text style={styles.tripItems} numberOfLines={1}>{extractItems(trip)}</Text>
          </View>
          <Text style={[styles.tripStatus, { color: isCompleted ? PRIMARY : isCancelled ? colors.red[500] : PRIMARY }]}>
            {trip.status || 'Status'}
          </Text>
        </View>

        <View style={styles.methodRow}>
          <View style={[styles.methodPill, { backgroundColor: PRIMARY_SOFT }]}>
            <Text style={[styles.methodText, { color: PRIMARY }]}>{isQR ? 'COD (QR)' : isCOD ? 'COD' : 'Online'}</Text>
          </View>
        </View>

        <View style={styles.tripGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.gridLabel}>Time</Text>
            <Text style={styles.gridValue}>{trip.time || '--:--'}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.gridLabel}>COD</Text>
            <Text style={styles.gridValue}>{`₹${collection.toFixed(2)}`}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.gridLabel}>Earning</Text>
            <Text style={styles.gridValue}>{`₹${payout.toFixed(2)}`}</Text>
          </View>
        </View>
      </View>
    );
  };

  const summaryBanner = (
    <View style={styles.summary}>
      <View>
        <Text style={styles.summaryLabel}>COD Collected</Text>
        <View style={styles.summaryValueBox}>
          {loading ? <Skeleton width={96} height={28} /> : <Text style={styles.summaryValue}>{`₹${metrics.cod.toFixed(2)}`}</Text>}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.summaryLabel}>Earnings</Text>
        <View style={[styles.summaryValueBox, { alignItems: 'flex-end' }]}>
          {loading ? <Skeleton width={96} height={28} /> : <Text style={styles.summaryValue}>{`₹${metrics.earnings.toFixed(2)}`}</Text>}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {tabActive ? <StatusBar style="light" /> : null}

      <View onLayout={(e) => setTopBlockHeight(e.nativeEvent.layout.height)} style={{ zIndex: 100 }}>
        {/* 1. Header (Premium V2 Styled) */}
        <LinearGradient
          colors={[deliveryTheme.headerFrom, deliveryTheme.headerTo]}
          start={{ x: 0.33, y: 0 }}
          end={{ x: 0.67, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.headerLeft}>
            <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
              <ArrowLeft size={20} color={colors.white} />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>TRIP HISTORY</Text>
              <Text style={styles.headerSub}>YOUR DELIVERY MILESTONES</Text>
            </View>
          </View>
          <Pressable onPress={() => setShowBonusModal(true)} style={({ pressed }) => [styles.giftBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
            <Gift size={20} color={PRIMARY} />
            {bonusTransactions.length > 0 ? (
              <View style={styles.giftBadge}>
                <Text style={styles.giftBadgeText}>{String(bonusTransactions.length)}</Text>
              </View>
            ) : null}
          </Pressable>
        </LinearGradient>

        {/* 2. Selection Tabs (Matched to Image) */}
        <View style={styles.tabs}>
          {['daily', 'weekly', 'monthly'].map((tab) => (
            <Pressable
              key={tab}
              onPress={() => { if (tab !== activeTab) { setActiveTab(tab); setSelectedDate(new Date()); setShowDatePicker(false); } }}
              style={styles.tabBtn}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? PRIMARY : colors.gray[400] }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              {activeTab === tab ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          ))}
        </View>

        {/* 3. Filter Controls (Matched to Image) */}
        <View style={styles.filters}>
          <Pressable
            onPress={() => { setShowDatePicker(!showDatePicker); setShowTripTypePicker(false); }}
            style={[styles.filterBtn, { flex: 1 }]}
          >
            <Text style={styles.filterText} numberOfLines={1}>{formatDateDisplay(selectedDate)}</Text>
            <ChevronDown size={16} color={colors.gray[400]} style={showDatePicker ? { transform: [{ rotate: '180deg' }] } : null} />
          </Pressable>
          <Pressable
            onPress={() => { setShowTripTypePicker(!showTripTypePicker); setShowDatePicker(false); }}
            style={[styles.filterBtn, { width: 140 }]}
          >
            <Text style={styles.filterText} numberOfLines={1}>{selectedTripType}</Text>
            <ChevronDown size={16} color={colors.gray[400]} style={showTripTypePicker ? { transform: [{ rotate: '180deg' }] } : null} />
          </Pressable>
        </View>
      </View>

      {/* 4. Page Content */}
      <FlatList ref={tabScrollRef}
        style={{ flex: 1 }}
        data={loading ? [] : trips}
        keyExtractor={(trip, idx) => String(trip.orderId || idx)}
        renderItem={renderTrip}
        ListHeaderComponent={summaryBanner}
        ListHeaderComponentStyle={{ marginBottom: 20 }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomSpace }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={styles.loadingText}>Fetching trips...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Clock size={48} color={colors.gray[100]} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>NO TRIPS RECORDED</Text>
            </View>
          )
        }
      />

      {/* Dropdowns */}
      {showDatePicker ? (
        <View style={[styles.dropdown, { left: 16, right: 16, top: topBlockHeight + 4, maxHeight: 300 }]}>
          <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 8 }}>
            {recentDates.map((date, idx) => {
              const selected = isSameSelection(date, selectedDate);
              return (
                <Pressable
                  key={idx}
                  onPress={() => { setSelectedDate(date); setShowDatePicker(false); }}
                  style={({ pressed }) => [styles.option, selected ? { backgroundColor: PRIMARY_SOFT } : pressed && { backgroundColor: colors.gray[50] }]}
                >
                  <Text style={[styles.optionText, selected && { color: PRIMARY, fontWeight: '700' }]}>{formatDateDisplay(date)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      {showTripTypePicker ? (
        <View style={[styles.dropdown, { right: 16, width: 192, top: topBlockHeight + 4, padding: 8 }]}>
          {tripTypes.map((type, idx) => {
            const selected = type === selectedTripType;
            return (
              <Pressable
                key={idx}
                onPress={() => { setSelectedTripType(type); setShowTripTypePicker(false); }}
                style={({ pressed }) => [styles.option, selected ? { backgroundColor: PRIMARY_SOFT } : pressed && { backgroundColor: colors.gray[50] }]}
              >
                <Text style={[styles.optionText, selected && { color: PRIMARY, fontWeight: '700' }]}>{type}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Bonus Drawer (The Gift Modal) */}
      <Sheet open={showBonusModal} onClose={() => setShowBonusModal(false)} backdropOpacity={0.6} style={[styles.sheet, { paddingBottom: 32 + insets.bottom }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 }}>
            <View style={styles.sheetIcon}>
              <Gift size={24} color={PRIMARY} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.sheetTitle}>Incentive Records</Text>
              <Text style={styles.sheetSub}>Extra bonuses credited by team</Text>
            </View>
          </View>
          <Pressable onPress={() => setShowBonusModal(false)} style={{ padding: 8 }}>
            <X size={20} color={colors.gray[400]} />
          </Pressable>
        </View>

        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 16, paddingRight: 4 }}>
          {bonusLoading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : bonusTransactions.length > 0 ? bonusTransactions.map((tx, i) => (
            <View key={i} style={styles.bonusCard}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.bonusAmount}>{`₹${Number(tx.amount || 0).toFixed(2)}`}</Text>
                <Text style={styles.bonusDesc} numberOfLines={1}>{tx.description || 'Bonus Payout'}</Text>
                <Text style={styles.bonusDate}>{new Date(tx.createdAt || tx.date).toLocaleDateString()}</Text>
              </View>
              <View style={styles.deliveredPill}>
                <Text style={styles.deliveredText}>DELIVERED</Text>
              </View>
            </View>
          )) : (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <Search size={48} color={colors.gray[100]} style={{ marginBottom: 16 }} />
              <Text style={styles.nothingText}>Nothing to show</Text>
            </View>
          )}
        </ScrollView>

        <Pressable
          onPress={() => setShowBonusModal(false)}
          style={({ pressed }) => [styles.okBtn, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Text style={styles.okText}>Okay, Got it</Text>
        </Pressable>
      </Sheet>
    </View>
  );
};

export default HistoryV2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.white, 0.1),
    paddingHorizontal: 17.6,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 9999, backgroundColor: alpha(colors.white, 0.1), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: alpha(colors.white, 0.1) },
  headerTitle: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.white, letterSpacing: -1 },
  headerSub: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[500], letterSpacing: 1, marginTop: 2 },
  giftBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: PRIMARY_SOFT, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: PRIMARY_BORDER },
  giftBadge: { position: 'absolute', top: -4, right: -4, width: 20, height: 20, backgroundColor: PRIMARY, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white, ...shadow.sm },
  giftBadgeText: { color: colors.white, fontSize: 10, lineHeight: 12, fontWeight: '700' },
  tabs: { backgroundColor: colors.white, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 32, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  tabBtn: { paddingVertical: 16 },
  tabText: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  tabIndicator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: PRIMARY },
  filters: { backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', gap: 12 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: colors.gray[100], borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  filterText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[800], flexShrink: 1 },
  dropdown: { position: 'absolute', zIndex: 200, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, overflow: 'hidden', ...shadow['2xl'] },
  option: { width: '100%', padding: 16, borderRadius: 14 },
  optionText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[700] },
  summary: { backgroundColor: '#E9F9F4', borderRadius: 16, padding: 17.6, borderWidth: 1, borderColor: CARD_BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...RX },
  summaryLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: PRIMARY, marginBottom: 4 },
  summaryValueBox: { minHeight: 28, justifyContent: 'center' },
  summaryValue: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[950] },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { color: colors.gray[400], fontSize: 12, lineHeight: 16, fontWeight: '500' },
  emptyBox: { paddingVertical: 80, alignItems: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[400], letterSpacing: 1.4 },
  tripCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: CARD_BORDER, ...RX },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  tripId: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[950] },
  tripRestaurant: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[500], marginTop: 2 },
  tripItems: { fontSize: 12, lineHeight: 16, color: colors.gray[400], fontWeight: '500', marginTop: 2 },
  tripStatus: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 12 },
  methodPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999 },
  methodText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  tripGrid: { flexDirection: 'row', gap: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.gray[50] },
  gridLabel: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: colors.gray[400], marginBottom: 4 },
  gridValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[950] },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 32, maxHeight: '85%', ...shadow['2xl'] },
  sheetHandle: { width: 48, height: 4, backgroundColor: colors.gray[100], borderRadius: 9999, alignSelf: 'center', marginBottom: 32 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  sheetIcon: { width: 48, height: 48, backgroundColor: PRIMARY_SOFT, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: PRIMARY_BORDER },
  sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[950] },
  sheetSub: { fontSize: 12, lineHeight: 16, color: colors.gray[400], fontWeight: '500' },
  bonusCard: { backgroundColor: colors.gray[50], borderRadius: 16, padding: 20, borderWidth: 1, borderColor: CARD_BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, ...RX },
  bonusAmount: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[950], marginBottom: 2 },
  bonusDesc: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[600] },
  bonusDate: { fontSize: 10, lineHeight: 14, color: colors.gray[400], fontWeight: '500', marginTop: 4 },
  deliveredPill: { backgroundColor: colors.green[100], paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999 },
  deliveredText: { color: PRIMARY, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  nothingText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[400] },
  okBtn: { width: '100%', paddingVertical: 20, backgroundColor: colors.black, borderRadius: 16, alignItems: 'center', marginTop: 32 },
  okText: { color: colors.white, fontWeight: '700', fontSize: 16, lineHeight: 24 },
});
