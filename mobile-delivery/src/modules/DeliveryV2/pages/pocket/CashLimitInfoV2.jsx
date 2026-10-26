import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, HelpCircle, ShieldCheck } from 'lucide-react-native';
import { deliveryAPI } from '@food/api';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@food/utils/currency';
import { Screen, Text } from '@/native/ui';
import { alpha, colors, fonts, shadow } from '@/theme';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const PRIMARY_SOFT = '#E7EFFA';
const PAGE_BG = '#EEF3FB'; // bg-[#f6e9dc] (deliveryTheme.css)

const DetailRow = ({ label, value, subLabel }) => (
  <View style={styles.detailRow}>
    <View style={{ flex: 1, paddingRight: 16 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      {subLabel ? <Text style={styles.detailSub}>{subLabel}</Text> : null}
    </View>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

/**
 * CashLimitInfoV2 - 1:1 Match with Old AvailableCashLimit Component.
 * Features: Breakthrough of Total Limit, Cash in hand, Deductions, etc.
 * Background: #f6e9dc
 * Font: Poppins
 */
export const CashLimitInfoV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletState, setWalletState] = useState({
    totalCashLimit: 0,
    cashInHand: 0,
    deductions: 0,
    pocketWithdrawals: 0,
    availableCashLimit: 0
  });

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [walletRes, limitRes] = await Promise.all([
        deliveryAPI.getWallet(),
        deliveryAPI.getCashLimit().catch(() => null),
      ]);

      const wallet = walletRes?.data?.data?.wallet || {};
      const limitSettings = limitRes?.data?.data || {};

      const totalLimit = Number(
        wallet.totalCashLimit ?? limitSettings.deliveryCashLimit ?? 0,
      ) || 0;
      const cashInHand = Number(wallet.cashInHand) || 0;
      const deductions = Number(wallet.deductions) || 0;
      const withdrawals = Number(wallet.totalWithdrawn) || 0;
      const availableRaw = Number(wallet.availableCashLimit);
      const available = Number.isFinite(availableRaw)
        ? availableRaw
        : Math.max(0, totalLimit - cashInHand - deductions);

      setWalletState({
        totalCashLimit: totalLimit,
        cashInHand: cashInHand,
        deductions: deductions,
        pocketWithdrawals: withdrawals,
        availableCashLimit: available
      });
    } catch {
      toast.error('Failed to load cash limit details');
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

  return (
    <Screen bg={PAGE_BG} edges={['bottom']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[600]} />
        </Pressable>
        <Text style={styles.title}>Available cash limit</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>CHECKING LIMITS...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
        >
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.iconBox}>
                <ShieldCheck size={24} color={PRIMARY} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Total cash limit</Text>
                <Text style={styles.cardSub}>{String(formatCurrency(walletState.totalCashLimit)).toUpperCase()}</Text>
              </View>
            </View>

            <View style={{ gap: 4 }}>
              <DetailRow
                label="Total cash limit"
                value={formatCurrency(walletState.totalCashLimit)}
                subLabel="Max COD cash you can hold. Restored when you deposit/settle."
              />
              <DetailRow label="Cash in hand" value={formatCurrency(walletState.cashInHand)} />
              <DetailRow label="Deductions" value={formatCurrency(walletState.deductions)} />
              <DetailRow label="Pocket withdrawals" value={formatCurrency(walletState.pocketWithdrawals)} />

              <View style={styles.availableRow}>
                <Text style={styles.availableLabel}>AVAILABLE CASH LIMIT</Text>
                <Text style={styles.availableValue}>{formatCurrency(walletState.availableCashLimit)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.helpCard}>
            <HelpCircle size={22} color={PRIMARY} />
            <View style={{ flex: 1 }}>
              <Text style={styles.helpTitle}>HOW IT WORKS?</Text>
              <Text style={styles.helpText}>
                Your available limit is how much more COD cash you can collect. Cash orders reduce it. When you deposit (pay) your cash in hand, available limit increases automatically — the total limit itself does not change.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Okay stays in view at the bottom (it scrolled far down with the long page: Prince, 26 Oct), in the app's blue */}
      {!loading ? (
        <View style={styles.footer}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [styles.okBtn, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Text style={styles.okText}>Okay</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
};

export default CashLimitInfoV2;

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
  title: { fontSize: 18, lineHeight: 18, fontWeight: '700', color: colors.gray[900] },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { color: colors.gray[400], fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.gray[100], padding: 16, paddingBottom: 0, marginBottom: 14, overflow: 'hidden', ...shadow.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  iconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: PRIMARY_SOFT, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fonts.sora, fontSize: 17, lineHeight: 17, fontWeight: '900', letterSpacing: -0.4, marginBottom: 4, color: '#0F1724' },
  cardSub: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400], letterSpacing: 1 },
  detailRow: { paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  detailLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[800] },
  detailSub: { fontSize: 10, lineHeight: 12.5, color: colors.gray[400], fontWeight: '500', marginTop: 2 },
  detailValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.black },
  availableRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: alpha(colors.emerald[50], 0.5),
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  availableLabel: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.emerald[900], letterSpacing: -0.35 },
  availableValue: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: '900', color: PRIMARY },
  helpCard: { backgroundColor: colors.white, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
  helpTitle: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: colors.gray[500], letterSpacing: 1, marginBottom: 4 },
  helpText: { fontSize: 12, lineHeight: 18, color: colors.gray[500], fontWeight: '500' },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, backgroundColor: PAGE_BG },
  okBtn: { width: '100%', paddingVertical: 15, backgroundColor: PRIMARY, borderRadius: 14, alignItems: 'center', ...shadow.lg },
  okText: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: '800' },
});
