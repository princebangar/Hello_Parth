// Web: pages/restaurant/WithdrawalHistoryPage.jsx — "Withdrawal History": Withdrawal Pending / Withdrawal Successful
// tabs over the restaurant's withdrawal requests (GET restaurantAPI.getWithdrawalHistory), loaded once on open.
// Same texts, mapping and filters.
// Native: the page renders BottomNavOrders itself like the web and leaves room for it at the end of the list; the
// list is a FlatList; the sticky header sits under the status bar.
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Wallet } from 'lucide-react-native';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import BottomNavOrders, { useRestaurantNavSpace } from '@food/components/restaurant/BottomNavOrders';
import { restaurantAPI } from '@food/api';

const debugError = () => {};

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';

const formatAmount = (amount) => amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function TabButton({ active, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tab, !active && styles.tabIdle, !active && pressed && { backgroundColor: colors.gray[200] }]}>
      {active ? (
        <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export default function WithdrawalHistoryPage() {
  const goBack = useRestaurantBackNavigation();
  const navSpace = useRestaurantNavSpace();
  const [withdrawalHistoryTab, setWithdrawalHistoryTab] = useState('pending');
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [loadingWithdrawalRequests, setLoadingWithdrawalRequests] = useState(false);

  // Fetch withdrawal requests on mount
  useEffect(() => {
    let alive = true;
    const fetchWithdrawalRequests = async () => {
      try {
        setLoadingWithdrawalRequests(true);
        const response = await restaurantAPI.getWithdrawalHistory();
        // API returns { success: true, data: [...] }
        const history = response?.data?.data || [];

        // Map backend fields to the local UI names
        const mapped = history.map((h) => ({
          id: h._id,
          amount: h.amount,
          status: h.status === 'approved' ? 'Approved' : h.status === 'rejected' ? 'Rejected' : 'Pending',
          requestedAt: h.createdAt,
          processedAt: h.processedAt,
        }));

        if (alive) setWithdrawalRequests(mapped);
      } catch (error) {
        if (error.response?.status !== 401) {
          debugError('Error fetching withdrawal requests:', error);
        }
      } finally {
        if (alive) setLoadingWithdrawalRequests(false);
      }
    };

    fetchWithdrawalRequests();
    return () => {
      alive = false;
    };
  }, []);

  const pending = withdrawalHistoryTab === 'pending';
  const rows = useMemo(
    () =>
      pending
        ? withdrawalRequests.filter((req) => req.status === 'Pending')
        : withdrawalRequests.filter((req) => req.status === 'Approved' || req.status === 'Processed'),
    [pending, withdrawalRequests],
  );

  const renderItem = ({ item: request }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.flex}>
          <Text style={styles.amount}>₹{formatAmount(request.amount)}</Text>
          <Text style={styles.date}>
            {pending ? `Requested: ${formatDateTime(request.requestedAt)}` : `Processed: ${formatDateTime(request.processedAt)}`}
          </Text>
        </View>
        {pending ? (
          <View style={[styles.badge, { backgroundColor: colors.yellow[100] }]}>
            <Text style={[styles.badgeText, { color: colors.yellow[800] }]}>Pending</Text>
          </View>
        ) : (
          <View style={[styles.badge, { backgroundColor: colors.green[100] }]}>
            <Text style={[styles.badgeText, { color: colors.green[800] }]}>{request.status === 'Approved' ? 'Approved' : 'Processed'}</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <Screen bg={colors.gray[100]} edges={[]}>
      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Withdrawal History</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <View style={styles.tabsRow}>
          <TabButton active={pending} label="Withdrawal Pending" onPress={() => setWithdrawalHistoryTab('pending')} />
          <TabButton active={!pending} label="Withdrawal Successful" onPress={() => setWithdrawalHistoryTab('successful')} />
        </View>
      </View>

      {/* Content */}
      {loadingWithdrawalRequests ? (
        <View style={[styles.content, { paddingBottom: navSpace }]}>
          <Text style={styles.loading}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: navSpace }]}
          data={rows}
          keyExtractor={(item, index) => String(item.id || index)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: sp(3) }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Wallet size={64} color={colors.gray[300]} style={{ marginBottom: sp(4) }} />
              <Text style={styles.emptyText}>{pending ? 'No pending withdrawal requests' : 'No successful withdrawals'}</Text>
            </View>
          }
        />
      )}

      <BottomNavOrders />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 40 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: 6, borderRadius: 10 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  tabsWrap: { backgroundColor: colors.white, paddingHorizontal: sp(4), paddingTop: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  tabsRow: { flexDirection: 'row', gap: sp(2) },
  tab: { flex: 1, paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tabIdle: { backgroundColor: colors.gray[100] },
  tabText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[600], textAlign: 'center' },
  tabTextActive: { color: colors.white },
  content: { paddingHorizontal: sp(4), paddingTop: sp(6) },
  loading: { paddingVertical: sp(8), textAlign: 'center', color: colors.gray[500], fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: colors.white, borderRadius: 10, padding: sp(4), borderWidth: 1, borderColor: colors.gray[200], ...shadow.sm },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  amount: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900], marginBottom: sp(2) },
  date: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  badge: { paddingHorizontal: sp(3), paddingVertical: sp(1), borderRadius: 9999 },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  empty: { alignItems: 'center', paddingVertical: sp(12) },
  emptyText: { color: colors.gray[500], fontSize: 18, lineHeight: 28, fontWeight: '500', textAlign: 'center' },
});
