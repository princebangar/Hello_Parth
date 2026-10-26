import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigate } from '@/lib/router';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';
import { deliveryAPI } from '@food/api';
import { toast } from '@/lib/toast';
import { showUserFacingApiError } from '@/shared/utils/apiError';
import { formatCurrency } from '@food/utils/currency';
import { KeyboardAwareScrollView, Screen, Text, TextInput } from '@/native/ui';
import { alpha, colors, fonts, shadow } from '@/theme';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const PAGE_BG = '#EEF3FB'; // bg-[#f6e9dc] (deliveryTheme.css)
const BANNER_BG = '#EEF3FB'; // bg-yellow-400 (deliveryTheme.css)

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
 * PocketBalanceV2 - 1:1 Match with Old PocketBalance Page.
 * Features: Big Withdraw amount display, Withdraw button, and Detail rows.
 * Background: #f6e9dc
 * Font: Poppins
 */
export const PocketBalanceV2 = () => {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [walletState, setWalletState] = useState({
    pocketBalance: 0,
    weeklyEarnings: 0,
    totalBonus: 0,
    totalWithdrawn: 0,
    cashCollected: 0,
    deductions: 0,
    withdrawalLimit: 100,
    withdrawableAmount: 0,
    canWithdraw: false
  });
  const [withdrawalStatus, setWithdrawalStatus] = useState({
    status: 'No request',
    updatedAt: null
  });
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [, earningsRes, walletRes, withdrawalRes] = await Promise.all([
        deliveryAPI.getProfile(),
        deliveryAPI.getEarnings({ period: 'week' }),
        deliveryAPI.getWallet(),
        deliveryAPI.getWalletTransactions({ type: 'withdrawal', limit: 1 })
      ]);

      const summary = earningsRes?.data?.data?.summary || {};
      const wallet = walletRes?.data?.data?.wallet || {};
      const withdrawalTx = withdrawalRes?.data?.data?.transactions?.[0] || null;

      // Use wallet data from backend instead of non-existent profile.walletBalance
      const pocketBalance = Number(wallet.pocketBalance) || 0;
      const withdrawalLimit = Number(wallet.deliveryWithdrawalLimit) || 100;
      const withdrawableAmount = pocketBalance; // Backend pocketBalance is already the withdrawable amount

      setWalletState({
        pocketBalance: pocketBalance,
        weeklyEarnings: Number(summary.totalEarnings) || 0,
        totalBonus: Number(wallet.totalBonus) || 0,
        totalWithdrawn: Number(wallet.totalWithdrawn) || 0,
        cashCollected: Number(wallet.cashInHand) || 0,
        deductions: 0, // (web: always 0)
        withdrawalLimit,
        withdrawableAmount,
        canWithdraw: withdrawableAmount >= withdrawalLimit
      });

      if (withdrawalTx) {
        const rawStatus = String(withdrawalTx.status || 'Pending').toLowerCase();
        const statusLabel = rawStatus === 'approved' || rawStatus === 'completed'
          ? 'Approved'
          : rawStatus === 'rejected' || rawStatus === 'denied'
            ? 'Rejected'
            : 'Pending';
        const updatedAt = withdrawalTx.processedAt || withdrawalTx.updatedAt || withdrawalTx.createdAt || null;
        setWithdrawalStatus({
          status: statusLabel,
          updatedAt: updatedAt ? new Date(updatedAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : null
        });
      } else {
        setWithdrawalStatus({ status: 'No request', updatedAt: null });
      }
    } catch {
      toast.error('Failed to load pocket details');
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

  const parsedWithdrawAmount = parseFloat(withdrawAmount);
  const hasPendingWithdrawal = String(withdrawalStatus.status || '').toLowerCase() === 'pending';
  const isValidWithdrawAmount =
    Number.isFinite(parsedWithdrawAmount) &&
    parsedWithdrawAmount >= walletState.withdrawalLimit &&
    parsedWithdrawAmount <= walletState.withdrawableAmount;

  const handleWithdrawAmountChange = (text) => {
    let val = String(text || '').replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = `${parts[0]}.${parts.slice(1).join('')}`;
    if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
      val = val.replace(/^0+/, '');
    }
    setWithdrawAmount(val);
  };

  const handleWithdraw = async () => {
    if (hasPendingWithdrawal) {
      toast.error('You already have a pending withdrawal request');
      return;
    }
    if (!isValidWithdrawAmount) {
      if (!Number.isFinite(parsedWithdrawAmount) || parsedWithdrawAmount <= 0) {
        toast.error('Please enter the amount you want to withdraw');
      } else if (parsedWithdrawAmount < walletState.withdrawalLimit) {
        toast.error(`Minimum withdrawal amount is ₹${walletState.withdrawalLimit}`);
      } else {
        toast.error('Amount cannot exceed withdrawable balance');
      }
      return;
    }

    // Simplified verification
    const profileRes = await deliveryAPI.getProfile();
    const profile = profileRes?.data?.data?.profile || {};
    const bank = profile?.documents?.bankDetails;

    if (!bank?.accountNumber) {
      toast.error("Please add bank details first");
      navigate("/food/delivery/profile/details");
      return;
    }

    setWithdrawSubmitting(true);
    try {
      const res = await deliveryAPI.createWithdrawalRequest({
        amount: parsedWithdrawAmount,
        paymentMethod: 'bank_transfer'
      });
      if (res?.data?.success) {
        toast.success("Withdrawal request submitted");
        setWithdrawAmount('');
        goBack();
      }
    } catch (err) {
      showUserFacingApiError(err, 'Withdrawal failed');
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const inputDisabled = !walletState.canWithdraw || hasPendingWithdrawal || withdrawSubmitting;
  const buttonEnabled = walletState.canWithdraw && !hasPendingWithdrawal && isValidWithdrawAmount;

  return (
    <Screen bg={PAGE_BG} edges={['bottom']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[600]} />
        </Pressable>
        <Text style={styles.title}>Pocket balance</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>LOADING BALANCE...</Text>
        </View>
      ) : (
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 128 }}
          extraOffset={110}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
        >
          {/* Warning Banner */}
          {!walletState.canWithdraw ? (
            <View style={styles.banner}>
              <AlertTriangle size={20} color={colors.gray[950]} />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.bannerTitle}>Withdraw currently disabled</Text>
                <Text style={styles.bannerText}>
                  {walletState.withdrawableAmount <= 0 ? 'Withdrawable amount is ₹0' : `Minimum withdrawal requirement is ₹${walletState.withdrawalLimit}`}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Top Withdraw Section */}
          <View style={styles.topCard}>
            <Text style={styles.topLabel}>WITHDRAWABLE AMOUNT</Text>
            <Text style={styles.topAmount}>{`₹${walletState.withdrawableAmount.toFixed(0)}`}</Text>

            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>ENTER AMOUNT TO WITHDRAW</Text>
              <View style={[styles.inputWrap, inputDisabled && { opacity: 0.5 }]}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  value={withdrawAmount}
                  onChangeText={handleWithdrawAmountChange}
                  editable={!inputDisabled}
                  keyboardType="decimal-pad"
                  placeholder={`Min ₹${walletState.withdrawalLimit}`}
                  placeholderTextColor={colors.gray[400]}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  style={[styles.input, inputFocused && styles.inputFocused]}
                />
              </View>
              {withdrawAmount && Number.isFinite(parsedWithdrawAmount) && parsedWithdrawAmount > walletState.withdrawableAmount ? (
                <Text style={styles.errorText}>{`Amount cannot exceed ₹${walletState.withdrawableAmount.toFixed(0)}`}</Text>
              ) : null}
              {withdrawAmount && Number.isFinite(parsedWithdrawAmount) && parsedWithdrawAmount > 0 && parsedWithdrawAmount < walletState.withdrawalLimit ? (
                <Text style={styles.errorText}>{`Minimum withdrawal is ₹${walletState.withdrawalLimit}`}</Text>
              ) : null}
              {hasPendingWithdrawal ? (
                <Text style={[styles.errorText, { color: colors.amber[600] }]}>
                  A withdrawal request is already pending admin approval.
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={handleWithdraw}
              disabled={!walletState.canWithdraw || hasPendingWithdrawal || !isValidWithdrawAmount || withdrawSubmitting}
              style={({ pressed }) => [
                styles.withdrawBtn,
                buttonEnabled ? { backgroundColor: colors.black } : { backgroundColor: colors.gray[100] },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              {withdrawSubmitting ? <ActivityIndicator size="small" color={buttonEnabled ? colors.white : colors.gray[400]} /> : null}
              <Text style={[styles.withdrawText, { color: buttonEnabled ? colors.white : colors.gray[400] }]}>
                {withdrawSubmitting ? 'Processing...' : 'Withdraw'}
              </Text>
            </Pressable>
          </View>

          {/* Details Section */}
          <View style={styles.detailsHead}>
            <Text style={styles.detailsHeadText}>POCKET DETAILS</Text>
          </View>

          <View style={{ backgroundColor: colors.white, paddingHorizontal: 16 }}>
            <DetailRow label="Earnings" value={formatCurrency(walletState.weeklyEarnings)} />
            <DetailRow label="Bonus" value={formatCurrency(walletState.totalBonus)} />
            <DetailRow label="Amount withdrawn" value={formatCurrency(walletState.totalWithdrawn)} />
            <DetailRow label="Cash collected" value={formatCurrency(walletState.cashCollected)} />
            <DetailRow label="Deductions" value={formatCurrency(walletState.deductions)} />
            <DetailRow label="Pocket balance" value={formatCurrency(walletState.pocketBalance)} />
            <DetailRow
              label="Withdrawal status"
              value={withdrawalStatus.status}
              subLabel={withdrawalStatus.updatedAt ? `Updated: ${withdrawalStatus.updatedAt}` : 'Admin approval status'}
            />
            <DetailRow
              label="Min. withdrawal amount"
              value={formatCurrency(walletState.withdrawalLimit)}
              subLabel="Withdrawal allowed only when withdrawable amount reaches this limit."
            />
            <DetailRow label="Withdrawable amount" value={formatCurrency(walletState.withdrawableAmount)} />
          </View>
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
};

export default PocketBalanceV2;

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
  banner: { backgroundColor: BANNER_BG, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderBottomWidth: 1, borderBottomColor: alpha(colors.yellow[500], 0.1) },
  bannerTitle: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.gray[950] },
  bannerText: { fontSize: 10, lineHeight: 12.5, fontWeight: '500', opacity: 0.8, marginTop: 4, color: colors.gray[950] },
  topCard: { backgroundColor: colors.white, padding: 32, marginBottom: 16, alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: colors.gray[100], ...shadow.sm },
  topLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.gray[400], letterSpacing: 1.2, marginBottom: 8, textAlign: 'center' },
  topAmount: { fontFamily: fonts.sora, fontSize: 48, lineHeight: 52, fontWeight: '900', color: colors.black, marginBottom: 16, letterSpacing: -2.4, textAlign: 'center' },
  inputLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400], letterSpacing: 1, marginBottom: 8 },
  inputWrap: { justifyContent: 'center' },
  rupee: { position: 'absolute', left: 16, zIndex: 1, fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[400] },
  input: {
    width: '100%',
    paddingLeft: 32,
    paddingRight: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DEE7',
    backgroundColor: colors.white,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F1724',
  },
  inputFocused: { borderColor: '#8AA4C5' },
  errorText: { fontSize: 11, lineHeight: 16, color: colors.red[500], fontWeight: '600', marginTop: 8 },
  withdrawBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow.lg },
  withdrawText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  detailsHead: { backgroundColor: alpha(colors.gray[100], 0.5), paddingVertical: 8, paddingHorizontal: 16 },
  detailsHeadText: { fontFamily: fonts.sora, fontSize: 10, lineHeight: 14, fontWeight: '900', color: colors.gray[400], letterSpacing: 1, textAlign: 'center' },
  detailRow: { paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  detailLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[800] },
  detailSub: { fontSize: 10, lineHeight: 12.5, color: colors.gray[400], fontWeight: '500', marginTop: 2 },
  detailValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.black },
});
