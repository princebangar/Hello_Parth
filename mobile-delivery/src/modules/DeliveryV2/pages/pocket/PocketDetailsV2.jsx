import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  Receipt
} from "lucide-react-native";
import { formatCurrency } from "@food/utils/currency";
import WeekSelector from "@/modules/DeliveryV2/components/WeekSelector";
import { deliveryAPI } from "@food/api";
import { Screen, Skeleton, Text } from "@/native/ui";
import { alpha, colors, fonts } from "@/theme";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

const PRIMARY = "#15498B";
const PRIMARY_SOFT = "#E7EFFA";
const PRIMARY_BORDER = "#C3D0E1";
const CARD_BORDER = "#D1DCEB"; // rounded-2xl / rounded-3xl border (deliveryTheme.css)
const RX = { elevation: 3, shadowColor: "#112743", shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } };

const toLocalDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
function FadeInUp({ delay = 0, style, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration: 300, delay, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim, delay]);
  return (
    <Animated.View
      style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

export const PocketDetailsV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();

  // Monday → Sunday (matches backend getWeekRange / Pocket earnings card)
  const getInitialWeekRange = () => {
    const now = new Date();
    const day = now.getDay(); // Sun=0 ... Sat=6
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
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [bonusTransactions, setBonusTransactions] = useState([]);
  const [summaryData, setSummaryData] = useState({ totalEarning: 0, totalBonus: 0, grandTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const dateKey = toLocalDateKey(weekRange.start);
      const response = await deliveryAPI.getPocketDetails({
        date: dateKey,
        limit: 2000
      });

      const payload = response?.data?.data || {};
      const trips = payload?.trips || payload?.orders || [];
      const payments = payload?.transactions?.payment || [];
      const bonuses = payload?.transactions?.bonus || [];
      const summary = payload?.summary || {};

      setOrders(Array.isArray(trips) ? trips : []);
      setPaymentTransactions(Array.isArray(payments) ? payments : []);
      setBonusTransactions(Array.isArray(bonuses) ? bonuses : []);
      setSummaryData({
        totalEarning: Number(summary.totalEarning) || 0,
        totalBonus: Number(summary.totalBonus) || 0,
        grandTotal: Number(summary.grandTotal) || 0,
      });
    } catch {
      setOrders([]);
      setPaymentTransactions([]);
      setBonusTransactions([]);
      setSummaryData({ totalEarning: 0, totalBonus: 0, grandTotal: 0 });
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

  const summary = useMemo(() => {
    let totalEarning = 0;
    let totalBonus = 0;
    paymentTransactions.forEach((p) => { totalEarning += p.amount || 0; });
    bonusTransactions.forEach((b) => { totalBonus += b.amount || 0; });
    return {
      totalEarning: summaryData.totalEarning || totalEarning,
      totalBonus: summaryData.totalBonus || totalBonus,
      grandTotal: summaryData.grandTotal || (summaryData.totalEarning || totalEarning) + (summaryData.totalBonus || totalBonus),
    };
  }, [paymentTransactions, bonusTransactions, summaryData]);

  const getOrderEarning = (orderId) => {
    const p = paymentTransactions.find(p => (p.orderId || p.metadata?.orderId) === orderId);
    if (p) return p.amount || 0;
    const order = orders.find(o => (o.orderId || o._id || o.id) === orderId);
    return order?.deliveryEarning || order?.earningAmount || order?.amount || 0;
  };

  const getOrderBonus = (orderId) => {
    const b = bonusTransactions.find(b => (b.orderId || b.metadata?.orderId) === orderId);
    return b ? b.amount : 0;
  };

  const listHeader = (
    <View style={{ gap: 24 }}>
      {/* ─── WEEK SELECTOR (Matching V2 Aesthetics) ─── */}
      <View style={styles.weekCard}>
        <WeekSelector
          {...{ onChange: setWeekRange }}
          weekStartsOn={1}
        />
      </View>

      {/* ─── SUMMARY CARD ─── */}
      <View style={styles.summaryCard}>
        <View pointerEvents="none" style={styles.glow} />
        <View>
          <View style={styles.summaryTop}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.kicker}>TOTAL PAYOUT</Text>
              <View style={{ minHeight: 40, justifyContent: "center" }}>
                {loading ? (
                  <Skeleton width={144} height={36} />
                ) : (
                  <Text style={styles.grandTotal}>{formatCurrency(summary.grandTotal)}</Text>
                )}
              </View>
            </View>
            <View style={styles.trendBox}>
              <TrendingUp size={24} color={PRIMARY} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TRIP EARNINGS</Text>
              <View style={{ minHeight: 24, justifyContent: "center" }}>
                {loading ? <Skeleton width={80} height={20} /> : <Text style={styles.statValue}>{formatCurrency(summary.totalEarning)}</Text>}
              </View>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>WEEKLY BONUS</Text>
              <View style={{ minHeight: 24, justifyContent: "center" }}>
                {loading ? <Skeleton width={80} height={20} /> : <Text style={[styles.statValue, { color: PRIMARY }]}>{`+${formatCurrency(summary.totalBonus)}`}</Text>}
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ─── ORDERS LIST ─── */}
      <View style={styles.listHead}>
        <Text style={styles.listTitle}>TRIPS HISTORY</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{`${orders.length} Orders`}</Text>
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item: order, index: idx }) => {
    const oid = order.orderId || order._id || order.id;
    const earning = getOrderEarning(oid);
    const bonus = getOrderBonus(oid);
    const isCod = order.paymentMethod?.toLowerCase() === "cod";
    return (
      <FadeInUp delay={idx * 50} style={styles.orderCard}>
        <View style={styles.orderLeft}>
          <View style={styles.packageBox}>
            <Package size={24} color={colors.gray[900]} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <View style={styles.orderTitleRow}>
              <Text style={styles.orderId}>{`#${String(oid ?? "").slice(-6).toUpperCase()}`}</Text>
              <Text style={styles.orderDate}>
                {`• ${new Date(order.deliveredAt || order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.restaurant} numberOfLines={1}>
              {String(order.restaurantName || order.restaurantId?.name || "Premium Restaurant").toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.orderAmount}>{formatCurrency(earning + bonus)}</Text>
          <View style={styles.badgeRow}>
            {bonus > 0 ? <Text style={styles.bonusText}>{`+${formatCurrency(bonus)} BP`}</Text> : null}
            <View
              style={[
                styles.methodPill,
                isCod
                  ? { backgroundColor: colors.amber[50], borderColor: colors.amber[100] }
                  : { backgroundColor: PRIMARY_SOFT, borderColor: PRIMARY_BORDER },
              ]}
            >
              <Text style={[styles.methodText, { color: isCod ? colors.amber[600] : PRIMARY }]}>
                {String(order.paymentMethod || "Online").toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </FadeInUp>
    );
  };

  return (
    <Screen bg={colors.gray[50]} edges={["bottom"]}>
      {/* ─── HEADER ─── */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
            <ArrowLeft size={20} color={colors.gray[900]} />
          </Pressable>
          <View>
            <Text style={styles.title}>POCKET DETAILS</Text>
            <Text style={styles.subtitle}>TRIPS &amp; EARNINGS HISTORY</Text>
          </View>
        </View>
        <View style={styles.receiptBox}>
          <Receipt size={20} color={PRIMARY} />
        </View>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={loading ? [] : orders}
        keyExtractor={(order, idx) => String(order.orderId || order._id || order.id || idx)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={styles.loadingText}>SYNCING HISTORY...</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Package size={32} color={colors.gray[200]} />
              </View>
              <Text style={styles.emptyTitle}>NO TRIPS FOUND</Text>
              <Text style={styles.emptyText}>CHECK ANOTHER WEEK RANGE</Text>
            </View>
          )
        }
      />
    </Screen>
  );
};

export default PocketDetailsV2;

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    paddingHorizontal: 17.6,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 100,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 16, flexShrink: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 9999, backgroundColor: colors.gray[50], alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.gray[100] },
  title: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: "900", color: colors.gray[950], letterSpacing: -1 },
  subtitle: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.gray[400], letterSpacing: 1, marginTop: 2 },
  receiptBox: { width: 40, height: 40, borderRadius: 14, backgroundColor: PRIMARY_SOFT, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: PRIMARY_BORDER },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 + 48 },
  weekCard: { backgroundColor: colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, ...RX },
  summaryCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 24, padding: 24, overflow: "hidden", ...RX },
  glow: { position: "absolute", top: -64, right: -64, width: 128, height: 128, borderRadius: 64, backgroundColor: alpha(colors.gray[100], 0.6) },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.gray[400], letterSpacing: 2, marginBottom: 4 },
  grandTotal: { fontFamily: fonts.sora, fontSize: 36, lineHeight: 40, fontWeight: "900", color: colors.gray[950], letterSpacing: -1.8 },
  trendBox: { width: 48, height: 48, backgroundColor: colors.gray[100], borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CARD_BORDER, ...RX },
  statBox: { flex: 1, backgroundColor: colors.gray[50], padding: 16, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER },
  statLabel: { fontSize: 9, lineHeight: 12, fontWeight: "700", color: colors.gray[400], letterSpacing: 0.9, marginBottom: 4 },
  statValue: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 24, fontWeight: "900", color: colors.gray[950] },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  listTitle: { fontFamily: fonts.sora, fontSize: 12, lineHeight: 16, fontWeight: "900", color: colors.gray[950], letterSpacing: 1.2 },
  countPill: { backgroundColor: colors.gray[200], paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999 },
  countText: { color: colors.gray[600], fontSize: 10, lineHeight: 14, fontWeight: "700" },
  loadingBox: { paddingVertical: 80, alignItems: "center" },
  loadingText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: colors.gray[400], letterSpacing: 1.2, marginTop: 16 },
  orderCard: { backgroundColor: colors.white, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: CARD_BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, ...RX },
  orderLeft: { flexDirection: "row", alignItems: "center", gap: 16, flexShrink: 1 },
  packageBox: { width: 48, height: 48, backgroundColor: colors.gray[50], borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CARD_BORDER },
  orderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  orderId: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: "900", color: colors.gray[950], letterSpacing: -0.35 },
  orderDate: { fontSize: 9, lineHeight: 12, fontWeight: "700", color: colors.gray[400], letterSpacing: 0.9 },
  restaurant: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.gray[500], letterSpacing: -0.25, maxWidth: 140 },
  orderAmount: { fontFamily: fonts.sora, fontSize: 16, lineHeight: 16, fontWeight: "900", color: colors.gray[950], marginBottom: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bonusText: { fontSize: 9, lineHeight: 12, fontWeight: "700", color: PRIMARY },
  methodPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  methodText: { fontFamily: fonts.sora, fontSize: 8, lineHeight: 12, fontWeight: "900" },
  emptyCard: { paddingVertical: 80, alignItems: "center", backgroundColor: colors.white, borderRadius: 32, borderWidth: 2, borderStyle: "dashed", borderColor: colors.gray[100] },
  emptyIcon: { width: 64, height: 64, backgroundColor: colors.gray[50], borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: "900", color: colors.gray[950], letterSpacing: -0.45 },
  emptyText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: colors.gray[400], letterSpacing: 1.2, marginTop: 4 },
});
