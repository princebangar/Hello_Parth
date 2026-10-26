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
 * LimitSettlementV2 - 1:1 Match with Old LimitSettlement UI.
 * Background: #f6e9dc (for consistency with Pocket)
 * Font: Poppins
 */
export const LimitSettlementV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      // Fetch deposit (cash limit settlement) transactions
      const response = await deliveryAPI.getWalletTransactions({
        type: 'deposit',
        limit: 100
      });

      if (response?.data?.success) {
        const fetched = response.data.data.transactions || [];
        setTransactions(fetched.map(t => ({
          id: t._id || t.id,
          amount: t.amount || 0,
          status: t.status || 'Pending',
          description: t.description || 'Available limit settlement',
          date: new Date(t.date || t.createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        })));
      }
    } catch {
      toast.error('Failed to load settlement history');
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

  const renderItem = ({ item: tx }) => {
    const statusInfo = getStatusInfo(tx.status);
    const StatusIcon = statusInfo.icon;
    return (
      <View style={[styles.card, { borderColor: statusInfo.borderColor }]}>
        <View style={styles.statusRow}>
          <StatusIcon size={16} color={statusInfo.color} />
          <View style={[styles.statusPill, { backgroundColor: statusInfo.bgColor }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{String(tx.status).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.amount}>{`₹${tx.amount}`}</Text>
        <Text style={styles.desc}>{tx.description}</Text>
        <Text style={styles.date}>{`Date: ${tx.date}`}</Text>
      </View>
    );
  };

  return (
    <Screen bg={PAGE_BG} edges={['bottom']}>
      {/* Header (Old UI Style) */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[600]} />
        </Pressable>
        <Text style={styles.title}>Available limit settlement</Text>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={PRIMARY} style={{ marginBottom: 16 }} />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={transactions}
          keyExtractor={(tx, index) => String(tx.id || index)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Clock size={32} color={colors.gray[200]} />
              </View>
              <Text style={styles.emptyTitle}>No settlement transactions</Text>
              <Text style={styles.emptyText}>
                Whenever you settle the available limit, the payment transactions will appear here.
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
};

export default LimitSettlementV2;

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
  title: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 128 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, marginTop: 24 },
  loadingText: { color: colors.gray[600], fontSize: 14, lineHeight: 20, fontWeight: '500' },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 16, paddingBottom: 28, borderWidth: 1, ...shadow.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
  amount: { color: colors.gray[900], fontSize: 20, lineHeight: 28, fontWeight: '700', marginBottom: 4 },
  desc: { color: colors.gray[600], fontSize: 14, lineHeight: 20, fontWeight: '500', marginBottom: 4 },
  date: { color: colors.gray[400], fontSize: 11, lineHeight: 16, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 16 },
  emptyIcon: { width: 64, height: 64, borderRadius: 9999, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.gray[100] },
  emptyTitle: { color: colors.gray[900], fontSize: 18, lineHeight: 28, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: colors.gray[400], fontSize: 12, lineHeight: 19.5, fontWeight: '600', textAlign: 'center' },
});
