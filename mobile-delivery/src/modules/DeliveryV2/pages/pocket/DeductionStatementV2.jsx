import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import WeekSelector from '@/modules/DeliveryV2/components/WeekSelector';
import { deliveryAPI } from '@food/api';
import { formatCurrency } from '@food/utils/currency';
import { toast } from '@/lib/toast';
import { Screen, Text } from '@/native/ui';
import { colors, shadow } from '@/theme';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const PAGE_BG = '#EEF3FB'; // bg-[#f6e9dc] (deliveryTheme.css)

/**
 * DeductionStatementV2 - 1:1 Match with Old DeductionStatement UI.
 * Background: #f6e9dc
 * Font: Poppins
 */
export const DeductionStatementV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deductions, setDeductions] = useState([]);
  const [weekRange, setWeekRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - new Date().getDay())),
    end: new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 6))
  });

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await deliveryAPI.getWalletTransactions({
        type: 'deduction',
        limit: 100
      });

      if (response?.data?.success) {
        const all = response.data.data.transactions || [];
        const filtered = all.filter((t) => {
          const type = String(t.type || '').trim().toLowerCase();
          const isManualDeduction = type === 'withdrawal' || type === 'deposit';
          if (!isManualDeduction) return false;

          const baseDate = t.date || t.createdAt;
          const d = new Date(baseDate);
          return d >= weekRange.start && d <= weekRange.end;
        });
        setDeductions(filtered);
      }
    } catch {
      toast.error('Failed to load deductions');
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

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          {/* bg-green-500 / bg-orange-500 / bg-blue-500 -> primary (deliveryTheme.css) */}
          <View style={styles.dot} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.desc}>{item.description || 'System Deduction'}</Text>
            <Text style={styles.date}>
              {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.amount}>{`-${formatCurrency(item.amount)}`}</Text>
      </View>
    </View>
  );

  return (
    <Screen bg={PAGE_BG} edges={['bottom']}>
      {/* Header (Old Style) */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[600]} />
        </Pressable>
        <Text style={styles.title}>Deduction statement</Text>
      </View>

      {/* Main Content */}
      <FlatList
        style={{ flex: 1 }}
        data={loading ? [] : deductions}
        keyExtractor={(item, index) => String(item._id || index)}
        renderItem={renderItem}
        ListHeaderComponent={<WeekSelector {...{ onChange: setWeekRange }} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={PRIMARY} style={{ marginBottom: 16 }} />
              <Text style={styles.loadingText}>Loading deductions...</Text>
            </View>
          ) : (
            <View style={styles.centerBox}>
              {/* Classic Empty State Illustration */}
              <View style={{ gap: 8, marginBottom: 24 }}>
                {[...Array(3)].map((_, i) => (
                  <View key={i} style={styles.ghostCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={[styles.dot, { marginTop: 4 }]} />
                      <View style={{ flex: 1, gap: 8 }}>
                        <View style={[styles.ghostLine, { width: '75%' }]} />
                        <View style={[styles.ghostLine, { width: '50%' }]} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.emptyTitle}>No transactions</Text>
              <Text style={styles.emptyText}>Is hafton mein koi deduction nahi hui.</Text>
            </View>
          )
        }
        ListFooterComponent={deductions.length > 0 && !loading ? <View style={{ height: 24 }} /> : null}
      />
    </Screen>
  );
};

export default DeductionStatementV2;

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
  centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  loadingText: { color: colors.gray[600], fontSize: 14, lineHeight: 20, fontWeight: '500' },
  ghostCard: { backgroundColor: colors.white, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.gray[100], width: 256, opacity: 0.5, ...shadow.sm },
  ghostLine: { height: 6, backgroundColor: colors.gray[100], borderRadius: 4 },
  emptyTitle: { color: colors.gray[600], fontSize: 16, lineHeight: 24, fontWeight: '700' },
  emptyText: { color: colors.gray[400], fontSize: 12, lineHeight: 16, fontWeight: '500', marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY },
  desc: { color: colors.gray[900], fontSize: 14, lineHeight: 18, fontWeight: '700' },
  date: { color: colors.gray[400], fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 4, letterSpacing: -0.25 },
  amount: { color: colors.red[600], fontSize: 16, lineHeight: 24, fontWeight: '700' },
});
