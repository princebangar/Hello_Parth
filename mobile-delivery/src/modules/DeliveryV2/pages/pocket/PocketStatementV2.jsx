import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle,
  Clock
} from 'lucide-react-native';
import WeekSelector from '@/modules/DeliveryV2/components/WeekSelector';
import { deliveryAPI } from '@food/api';
import { toast } from '@/lib/toast';
import { Screen, Skeleton, Text } from '@/native/ui';
import { colors, shadow } from '@/theme';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const PAGE_BG = '#EEF3FB'; // bg-[#f6e9dc] (deliveryTheme.css)

const toLocalDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * PocketStatementV2 - 1:1 Match with Old PocketStatement UI.
 * Background: White/Sand
 * Font: Poppins
 */
export const PocketStatementV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();

  // Monday → Sunday (matches backend weekly range)
  const getInitialWeekRange = () => {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = (day + 6) % 7;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const [weekRange, setWeekRange] = useState(getInitialWeekRange);
  const [orders, setOrders] = useState([]);
  const [bonusTransactions, setBonusTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load trips (orders) and bonus for selected week
  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      const params = {
        period: 'weekly',
        date: toLocalDateKey(weekRange.start),
        status: 'Completed',
        limit: 1000
      };

      // Parallel fetch for speed
      const [tripRes, walletRes] = await Promise.all([
        deliveryAPI.getTripHistory(params),
        deliveryAPI.getWalletTransactions({ type: 'bonus', limit: 1000 })
      ]);

      setOrders(tripRes?.data?.data?.trips || []);
      setBonusTransactions(walletRes?.data?.data?.transactions || []);
    } catch {
      toast.error('Error loading pocket statement');
    } finally {
      setLoading(false);
    }
  }, [weekRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData({ silent: true });
    setRefreshing(false);
  };

  // Compute summary for selected week
  const summary = useMemo(() => {
    let totalEarning = 0;
    let totalBonus = 0;

    orders.forEach((trip) => {
      const earning =
        trip.deliveryEarning ||
        trip.deliveryPayout ||
        trip.payout ||
        trip.estimatedEarnings?.totalEarning ||
        0;
      totalEarning += earning;
    });

    bonusTransactions.forEach((b) => {
      const baseDate = b.date || b.createdAt;
      if (!baseDate) return;
      const d = new Date(baseDate);
      if (d >= weekRange.start && d <= weekRange.end) {
        totalBonus += b.amount || 0;
      }
    });

    return {
      totalEarning,
      totalBonus,
      grandTotal: totalEarning + totalBonus
    };
  }, [orders, bonusTransactions, weekRange]);

  const getOrderAmounts = (trip) => {
    const earning =
      trip.deliveryEarning ||
      trip.deliveryPayout ||
      trip.payout ||
      trip.estimatedEarnings?.totalEarning ||
      0;

    const orderId = trip.orderId || trip.id || trip._id;
    const bonusForOrder = bonusTransactions
      .filter((b) => b.orderId === orderId)
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    return {
      earning,
      bonus: bonusForOrder,
      total: earning + bonusForOrder
    };
  };

  const listHeader = (
    <View>
      <WeekSelector {...{ onChange: setWeekRange }} weekStartsOn={1} />

      {/* Summary (Original Grid Style) */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <CheckCircle size={16} color={PRIMARY} />
          <Text style={styles.summaryTitle}>POCKET SUMMARY</Text>
        </View>
        <View style={styles.summaryGrid}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Text style={styles.gridLabel}>ORDERS</Text>
            <View style={styles.gridValueBox}>
              {loading ? <Skeleton width={56} height={16} /> : <Text style={styles.gridValue}>{`₹${summary.totalEarning.toFixed(0)}`}</Text>}
            </View>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.gridLabel}>BONUS</Text>
            <View style={styles.gridValueBox}>
              {loading ? <Skeleton width={56} height={16} /> : <Text style={styles.gridValue}>{`₹${summary.totalBonus.toFixed(0)}`}</Text>}
            </View>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.gridLabel}>TOTAL</Text>
            <View style={styles.gridValueBox}>
              {loading ? <Skeleton width={56} height={16} /> : <Text style={[styles.gridValue, { color: PRIMARY }]}>{`₹${summary.grandTotal.toFixed(0)}`}</Text>}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item: trip, index }) => {
    const amounts = getOrderAmounts(trip);
    const createdAt = trip.deliveredAt || trip.completedAt || trip.createdAt || trip.orderTime;
    const dateText = createdAt
      ? new Date(createdAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
      : 'N/A';

    const orderId = trip.orderId || trip.id || trip._id;
    // bg-green-500 / bg-orange-500 / bg-blue-500 are all recoloured to the primary by deliveryTheme.css
    const dotColor = index % 3 === 0 ? PRIMARY : index % 3 === 1 ? PRIMARY : PRIMARY;

    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.orderTitle}>{`Order #${(orderId != null ? String(orderId).slice(-6) : '') || '...'}`}</Text>
              <Text style={styles.orderDate}>{String(dateText).toUpperCase()}</Text>
              {trip.restaurantName ? (
                <Text style={styles.restaurant}>{trip.restaurantName}</Text>
              ) : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ marginBottom: 8, alignItems: 'flex-end' }}>
              <Text style={styles.gridLabel}>EARNING</Text>
              <Text style={styles.amount}>{`₹${amounts.earning}`}</Text>
            </View>
            {amounts.bonus > 0 ? (
              <View style={{ marginBottom: 8, alignItems: 'flex-end' }}>
                <Text style={[styles.gridLabel, { color: PRIMARY }]}>BONUS</Text>
                <Text style={[styles.amount, { color: PRIMARY }]}>{`+ ₹${amounts.bonus}`}</Text>
              </View>
            ) : null}
            <View style={styles.totalBox}>
              <Text style={[styles.gridLabel, { color: colors.gray[800], marginBottom: 0 }]}>TOTAL</Text>
              <Text style={styles.totalAmount}>{`₹${amounts.total}`}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Screen bg={PAGE_BG} edges={['bottom']}>
      {/* Header (Old Style) */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[600]} />
        </Pressable>
        <Text style={styles.title}>Pocket statement</Text>
      </View>

      {/* Main Content */}
      <FlatList
        style={{ flex: 1 }}
        data={loading ? [] : orders}
        keyExtractor={(trip, index) => String(trip.orderId || trip.id || trip._id || index)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={styles.loadingText}>LOADING STATEMENT...</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Clock size={40} color={colors.gray[200]} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>No transactions</Text>
              <Text style={styles.emptyText}>Koi transaction nahi mili is hafta k liye.</Text>
            </View>
          )
        }
      />
    </Screen>
  );
};

export default PocketStatementV2;

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backBtn: { padding: 8, borderRadius: 10 },
  title: { fontSize: 20, lineHeight: 20, fontWeight: '700', color: colors.gray[900] },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 128 },
  summaryCard: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.gray[100], padding: 20, marginTop: 16, ...shadow.sm },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  summaryTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[800], letterSpacing: -0.35 },
  summaryGrid: { flexDirection: 'row', gap: 16 },
  gridLabel: { fontSize: 10, lineHeight: 14, color: colors.gray[400], fontWeight: '700', marginBottom: 4 },
  gridValueBox: { minHeight: 20, justifyContent: 'center' },
  gridValue: { fontSize: 16, lineHeight: 16, fontWeight: '700', color: colors.black },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { color: colors.gray[400], fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
  emptyCard: { backgroundColor: colors.white, borderRadius: 14, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
  emptyTitle: { color: colors.gray[900], fontSize: 18, lineHeight: 28, fontWeight: '700', marginBottom: 4 },
  emptyText: { color: colors.gray[400], fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  orderTitle: { color: colors.gray[900], fontSize: 14, lineHeight: 20, fontWeight: '700', marginBottom: 2 },
  orderDate: { color: colors.gray[400], fontSize: 11, lineHeight: 16, fontWeight: '700', marginBottom: 4, letterSpacing: -0.3 },
  restaurant: { color: colors.gray[500], fontSize: 12, lineHeight: 16, fontWeight: '500', fontStyle: 'italic' },
  amount: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.black },
  totalBox: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.gray[50], alignItems: 'flex-end' },
  totalAmount: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: PRIMARY },
});
