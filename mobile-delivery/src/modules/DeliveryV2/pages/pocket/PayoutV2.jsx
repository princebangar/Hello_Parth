import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react-native';
import { deliveryAPI } from '@food/api';
import { toast } from '@/lib/toast';
import { Screen, Text } from '@/native/ui';
import { colors, shadow } from '@/theme';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const PRIMARY_SOFT = '#E7EFFA';
const PRIMARY_BORDER = '#C3D0E1';
const PAGE_BG = '#EEF3FB'; // bg-[#f6e9dc] (deliveryTheme.css)

/**
 * PayoutV2 - 1:1 Match with Old Payout UI.
 * Background: #f6e9dc (for consistency with Pocket) or gray-50 (original)
 * Font: Poppins
 */
export const PayoutV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      // Fetch withdrawal transactions
      const response = await deliveryAPI.getWalletTransactions({
        type: 'withdrawal',
        limit: 100
      });

      if (response?.data?.success) {
        // Only real withdrawal requests — never treat delivery earnings as payouts
        const transactions = (response.data.data.transactions || []).filter(
          (t) => String(t?.type || '').toLowerCase() === 'withdrawal'
        );
        setWithdrawals(transactions.map(t => ({
          id: t._id || t.id,
          amount: t.amount || 0,
          status: t.status || 'Pending',
          date: new Date(t.date || t.createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          processedAt: t.processedAt ? new Date(t.processedAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
          failureReason: t.failureReason || null
        })));
      }
    } catch {
      toast.error('Failed to load payout history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData({ silent: true });
    setRefreshing(false);
  };

  const getStatusInfo = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'approved':
        return {
          icon: CheckCircle2,
          color: PRIMARY, // text-green-600
          bgColor: PRIMARY_SOFT, // bg-green-50
          borderColor: colors.green[200]
        };
      case 'pending':
        return {
          icon: Clock,
          color: PRIMARY, // text-blue-600
          bgColor: PRIMARY_SOFT, // bg-blue-50
          borderColor: PRIMARY_BORDER // border-blue-200
        };
      case 'denied':
      case 'rejected':
        return {
          icon: XCircle,
          color: colors.red[600],
          bgColor: colors.red[50],
          borderColor: colors.red[200]
        };
      default:
        return {
          icon: Clock,
          color: colors.gray[600],
          bgColor: colors.gray[50],
          borderColor: colors.gray[200]
        };
    }
  };

  const renderItem = ({ item: withdrawal }) => {
    const statusInfo = getStatusInfo(withdrawal.status);
    const StatusIcon = statusInfo.icon;
    return (
      <View style={[styles.card, { borderColor: statusInfo.borderColor }]}>
        <View style={styles.statusRow}>
          <StatusIcon size={20} color={statusInfo.color} />
          <View style={[styles.statusPill, { backgroundColor: statusInfo.bgColor }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{String(withdrawal.status).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.amount}>{`₹${withdrawal.amount}`}</Text>
        <Text style={styles.meta}>{`Requested: ${withdrawal.date}`}</Text>
        {withdrawal.processedAt ? (
          <Text style={[styles.meta, { marginTop: 4 }]}>{`Processed: ${withdrawal.processedAt}`}</Text>
        ) : null}
        {withdrawal.failureReason ? (
          <Text style={styles.reason}>{`Reason: ${withdrawal.failureReason}`}</Text>
        ) : null}
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
        <Text style={styles.title}>Payout History</Text>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.gray[400]} />
          <Text style={styles.loadingText}>Loading payout history...</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={withdrawals}
          keyExtractor={(w, index) => String(w.id || index)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Clock size={32} color={colors.gray[200]} />
              </View>
              <Text style={styles.emptyTitle}>No payout history</Text>
              <Text style={styles.emptyText}>
                You haven&apos;t made any payout/withdrawal requests yet. Your history will appear here.
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
};

export default PayoutV2;

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
  title: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 96 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 16, marginTop: 24 },
  loadingText: { color: colors.gray[600], fontSize: 16, lineHeight: 24, marginTop: 16 },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 16, paddingBottom: 28, borderWidth: 1, ...shadow.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
  amount: { color: colors.gray[900], fontSize: 20, lineHeight: 28, fontWeight: '700', marginBottom: 4 },
  meta: { color: colors.gray[500], fontSize: 11, lineHeight: 16, fontWeight: '500' },
  reason: { color: colors.red[600], fontSize: 11, lineHeight: 16, marginTop: 8, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 9999, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 24, ...shadow.sm },
  emptyTitle: { color: colors.gray[900], fontSize: 18, lineHeight: 28, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: colors.gray[400], fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
});
