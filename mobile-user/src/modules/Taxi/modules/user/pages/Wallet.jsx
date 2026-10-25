// Web: modules/Taxi/modules/user/pages/Wallet.jsx — balance, Add Money (Razorpay checkout or PhonePe redirect, chosen by
// the admin's payment gateway), Refer & Earn card, transaction history.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Plus, History, Gift } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Razorpay, loadRazorpayScript } from '@/lib/razorpay';
import { Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { userAuthService } from '../services/authService';
import { useSettings } from '../../../shared/context/SettingsContext';
import { USER_SHADOW, useUserPalette } from '../../../shared/context/UserThemeContext';
import { openExternalCheckout } from '../../../shared/utils/externalNavigation';
import { rememberPendingPhonePeRedirect } from '../../../shared/utils/phonePeResume';
import useReferralEnabled from '@/shared/hooks/useReferralEnabled';
import { getPageCache, setPageCache, userScopedCacheKey } from '@/shared/utils/pageCache';
import { recallLastKnown, rememberLastKnown } from '@/shared/utils/lastKnown';
import NumberSkeleton from '@/shared/components/NumberSkeleton';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

const PHONEPE_USER_WALLET_FLOW_KEY = 'user-wallet-topup';

const RECENT_TX_COUNT = 5;

const Wallet = () => {
  const navigate = useNavigate();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const activePaymentGateway = settings.paymentGateway || null;

  const [showAddMoney, setShowAddMoney] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [amountFocused, setAmountFocused] = React.useState(false);
  const [modalMounted, setModalMounted] = React.useState(false);
  const referralEnabled = useReferralEnabled();
  // Last wallet seen in this session is shown at once while the fresh one loads (no spinner on a repeat visit).
  const walletCacheKey = useMemo(() => userScopedCacheKey('taxi_wallet'), []);
  // this session's copy first, else the last wallet seen on this device (survives closing the app)
  const cachedWallet = useMemo(() => getPageCache(walletCacheKey) || recallLastKnown('taxi:wallet') || null, [walletCacheKey]);
  const [walletLoading, setWalletLoading] = React.useState(!cachedWallet);
  const [walletError, setWalletError] = React.useState('');
  const [wallet, setWallet] = React.useState(cachedWallet || { balance: 0, currency: 'INR', recentTransactions: [] });
  const [showAllTransactions, setShowAllTransactions] = React.useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const referScale = useRef(new Animated.Value(1)).current;
  const successTimer = useRef(null);

  useEffect(() => () => clearTimeout(successTimer.current), []);

  const basePath = useMemo(
    () => (getAppRoutePath().startsWith('/taxi/user') ? '/taxi/user' : ''),
    [],
  );

  const formatInr = (value) => {
    const amountValue = Number(value || 0);
    const fixed = Math.round(amountValue * 100) / 100;
    return fixed.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const splitMoney = (formatted) => {
    const [whole, decimals = '00'] = String(formatted).split('.');
    return { whole, decimals: (decimals || '00').padEnd(2, '0').slice(0, 2) };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const balanceText = useMemo(() => splitMoney(formatInr(wallet.balance)), [wallet.balance]);
  const walletTopUpGatewayLabel = activePaymentGateway?.label || 'payment gateway';
  const supportsWalletTopUp = activePaymentGateway?.supportsWalletTopUp === true;
  const walletTopUpMode = activePaymentGateway?.walletTopUpMode || '';
  const canTopUpWallet = supportsWalletTopUp && ['razorpay_checkout', 'phonepe_redirect'].includes(walletTopUpMode);

  const refreshWallet = async () => {
    setWalletError('');

    try {
      const response = await userAuthService.getWallet();
      const data = response?.data || {};
      const nextWallet = {
        balance: Number(data.balance || 0),
        currency: data.currency || 'INR',
        recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
      };
      setWallet(nextWallet);
      setPageCache(walletCacheKey, nextWallet);
      rememberLastKnown('taxi:wallet', nextWallet);
    } catch (err) {
      // A wallet already on screen stays; only a first load with nothing to show reports the failure.
      if (!cachedWallet && !getPageCache(walletCacheKey)) {
        setWalletError(err?.message || 'Failed to load wallet');
      }
    } finally {
      setWalletLoading(false);
    }
  };

  useEffect(() => {
    refreshWallet();
    Animated.timing(cardAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AnimatePresence: the Add Money sheet slides up and back down
  useEffect(() => {
    if (showAddMoney) setModalMounted(true);
    Animated.timing(sheetAnim, { toValue: showAddMoney ? 1 : 0, duration: 300, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !showAddMoney) setModalMounted(false);
    });
  }, [showAddMoney, sheetAnim]);

  useEffect(() => {
    if (!isSuccess) return;
    successAnim.setValue(0);
    Animated.timing(successAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [isSuccess, successAnim]);

  const handleAddMoney = async () => {
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return;

    setIsAdding(true);
    setWalletError('');

    try {
      if (!activePaymentGateway) {
        throw new Error('No payment gateway is enabled by admin right now.');
      }

      if (!supportsWalletTopUp || !canTopUpWallet) {
        throw new Error(`${walletTopUpGatewayLabel} is enabled by admin, but wallet top-up is not implemented for it yet.`);
      }

      if (walletTopUpMode === 'phonepe_redirect') {
        const sessionResponse = await userAuthService.createPhonePeWalletTopupOrder(amountValue);
        const session = sessionResponse?.data || {};

        if (!session.checkoutUrl) {
          throw new Error('Unable to start PhonePe payment');
        }

        rememberPendingPhonePeRedirect(PHONEPE_USER_WALLET_FLOW_KEY, {
          merchantTransactionId: session.merchantTransactionId,
          checkoutUrl: session.checkoutUrl,
        });
        const opened = await openExternalCheckout(session.checkoutUrl);
        if (!opened) {
          throw new Error('PhonePe checkout could not open outside the app WebView. Please update the app bridge or open this payment flow in your browser.');
        }
        setIsAdding(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (scriptLoaded === false) {
        throw new Error('Razorpay SDK failed to load');
      }

      const orderResponse = await userAuthService.createWalletTopupOrder(amountValue);
      const order = orderResponse?.data || {};

      if (!order.keyId || !order.orderId) {
        throw new Error('Unable to start payment');
      }

      let userInfo = {};
      try {
        userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      } catch {
        userInfo = {};
      }

      // The web added callback_url + redirect:true inside a phone WebView (Razorpay's popup could not return there).
      // The app's checkout runs in its own payment view and returns through the handler below, so no redirect.
      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: appName,
        description: 'Wallet Topup',
        order_id: order.orderId,
        prefill: {
          name: userInfo?.name || '',
          email: userInfo?.email || '',
          contact: userInfo?.phone ? `+91${userInfo.phone}` : '',
        },
        modal: {
          ondismiss: () => {
            setIsAdding(false);
          },
        },
        handler: async (response) => {
          try {
            const verifyResponse = await userAuthService.verifyWalletTopup(response);
            const data = verifyResponse?.data || {};
            setWallet({
              balance: Number(data.balance || 0),
              currency: data.currency || 'INR',
              recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
            });
            setIsSuccess(true);
            successTimer.current = setTimeout(() => {
              setIsSuccess(false);
              setShowAddMoney(false);
              setAmount('');
            }, 1400);
          } catch (err) {
            setWalletError(err?.message || 'Payment verification failed');
          } finally {
            setIsAdding(false);
          }
        },
        theme: {
          color: '#E85D04',
        },
      });

      rzp.on('payment.failed', (event) => {
        const message = event?.error?.description || event?.error?.reason || 'Payment failed';
        setWalletError(message);
        setIsAdding(false);
      });

      rzp.open();
    } catch (err) {
      setWalletError(err?.message || 'Topup failed');
      setIsAdding(false);
    }
  };

  const isDark = P.dark; // the web read useUserTheme(); same setting (userTheme)
  const refillDisabled = isAdding || !amount;
  const card = { backgroundColor: P.cardBg, borderColor: P.border };
  const txs = wallet.recentTransactions || [];

  return (
    <Screen bg={P.bg} edges={[]}>
      {modalMounted ? (
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => setShowAddMoney(false)}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.slate[950], 0.4), opacity: sheetAnim }]} />
          <View style={styles.modalWrap} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.sheet,
                USER_SHADOW,
                isDark ? { backgroundColor: P.cardBg, borderWidth: 1, borderColor: P.border } : { backgroundColor: P.cardBg },
                { transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] }) }] },
              ]}
            >
              <Pressable
                onPress={() => setShowAddMoney(false)}
                style={({ pressed }) => [styles.close, { backgroundColor: P.cardBg }, pressed && { transform: [{ scale: 0.9 }] }]}
              >
                <Plus size={20} color={isDark ? P.textMuted : P.textSecondary} style={{ transform: [{ rotate: '45deg' }] }} />
              </Pressable>

              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={[styles.sheetTitle, { color: P.textPrimary }]}>Add Money</Text>
                <Text style={[styles.sheetSub, { color: P.textSecondary }]}>
                  {(activePaymentGateway ? `Top-up via ${walletTopUpGatewayLabel}` : 'Select amount to top-up').toUpperCase()}
                </Text>
              </View>

              {isSuccess ? (
                <Animated.View
                  style={[
                    styles.success,
                    { opacity: successAnim, transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
                  ]}
                >
                  <View style={[styles.successIcon, { backgroundColor: P.cardSoft }]}>
                    <History size={32} color={colors.emerald[600]} />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.successTitle, { color: P.textPrimary }]}>Wallet Refilled!</Text>
                    <Text style={[styles.successSub, { color: P.textSecondary }]}>Balance updated successfully</Text>
                  </View>
                </Animated.View>
              ) : (
                <View style={{ gap: 32 }}>
                  <View>
                    <Text style={[styles.rupee, { color: P.textSecondary }]}>₹</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      value={amount}
                      onChangeText={setAmount}
                      onFocus={() => setAmountFocused(true)}
                      onBlur={() => setAmountFocused(false)}
                      placeholder="0.00"
                      placeholderTextColor={colors.slate[200]}
                      style={[styles.amountInput, card, amountFocused && { borderColor: P.accent, borderWidth: 2 }, { color: P.textPrimary }]}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {['100', '500', '1000'].map((val) => {
                      const on = amount === val;
                      return (
                        <Pressable
                          key={val}
                          onPress={() => setAmount(val)}
                          style={[styles.quick, on ? [{ backgroundColor: P.accent }, USER_SHADOW] : [card, { borderWidth: 1 }]]}
                        >
                          <Text style={[styles.quickText, { color: on ? P.accentInk : P.textSecondary }]}>+₹{val}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    onPress={handleAddMoney}
                    disabled={refillDisabled}
                    style={({ pressed }) => [
                      styles.refill,
                      refillDisabled ? { backgroundColor: P.cardSoft } : [{ backgroundColor: P.accent }, USER_SHADOW],
                      pressed && { transform: [{ scale: 0.95 }] },
                    ]}
                  >
                    <Text style={[styles.refillText, { color: refillDisabled ? P.textSecondary : P.accentInk }]}>
                      {isAdding ? 'Processing...' : 'Refill Wallet'}
                    </Text>
                    {!isAdding && <Plus size={18} color={refillDisabled ? P.textSecondary : P.accentInk} />}
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </View>
        </Modal>
      ) : null}

      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={[styles.row, { gap: 12 }]}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [styles.back, USER_SHADOW, card, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={P.textPrimary} />
          </Pressable>
          <Text style={[styles.h1, { color: P.textPrimary }]}>My Wallet</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 112 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Animated.View
            style={[
              styles.balanceCard,
              USER_SHADOW,
              isDark
                ? { backgroundColor: P.cardBg, borderColor: P.border }
                : { backgroundColor: '#FFFDF0', borderColor: alpha(colors.yellow[100], 0.7) },
              { opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
            ]}
          >
            <View style={{ gap: 32 }}>
              <View style={{ gap: 4 }}>
                <Text style={[styles.balanceLabel, { color: isDark ? P.textSecondary : P.textMuted }]}>AVAILABLE BALANCE</Text>
                {walletLoading ? (
                  <View style={{ height: 36, justifyContent: 'center' }}>
                    <NumberSkeleton width="4.5em" fontSize={30} color={P.textPrimary} style={{ alignSelf: 'flex-start' }} />
                  </View>
                ) : (
                  <Text style={[styles.balance, { color: P.textPrimary }]}>
                    ₹ {balanceText.whole}
                    <Text style={[styles.decimals, { color: isDark ? P.textSecondary : P.textMuted }]}>.{balanceText.decimals}</Text>
                  </Text>
                )}
                {walletError ? <Text style={[styles.note, { color: colors.rose[400] }]}>{walletError}</Text> : null}
                {activePaymentGateway && !canTopUpWallet ? (
                  <Text style={[styles.note, { color: colors.amber[300] }]}>
                    {walletTopUpGatewayLabel} is active, but wallet top-up is not available for it yet.
                  </Text>
                ) : null}
              </View>

              <View style={[styles.row, { gap: 12 }]}>
                <Pressable
                  onPress={() => {
                    setWalletError('');
                    setShowAddMoney(true);
                  }}
                  disabled={!canTopUpWallet}
                  style={({ pressed }) => [styles.addMoney, USER_SHADOW, { backgroundColor: P.cardBg }, pressed && { transform: [{ scale: 0.95 }] }]}
                >
                  <Plus size={16} strokeWidth={2.5} color={P.textPrimary} />
                  <Text style={[styles.addMoneyText, { color: P.textPrimary }]}>Add Money</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>

        {referralEnabled && (
          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <Animated.View style={{ transform: [{ scale: referScale }] }}>
              <Pressable
                onPress={() => navigate(`${basePath}/referral`)}
                onPressIn={() => Animated.spring(referScale, { toValue: 0.98, stiffness: 400, damping: 20, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(referScale, { toValue: 1, stiffness: 400, damping: 20, useNativeDriver: true }).start()}
                style={[styles.refer, USER_SHADOW, isDark ? card : { borderColor: colors.gray[200] }]}
              >
                {!isDark ? (
                  <LinearGradient
                    colors={[colors.amber[50], colors.yellow[50], alpha(colors.amber[100], 0.3)]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                {isDark ? (
                  <View style={[styles.referIcon, { backgroundColor: P.cardBg }]}>
                    <Gift size={20} color={P.textPrimary} />
                  </View>
                ) : (
                  <LinearGradient colors={[colors.violet[500], colors.indigo[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.referIcon, USER_SHADOW]}>
                    <Gift size={20} color={P.textPrimary} />
                  </LinearGradient>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.referTitle, { color: P.textPrimary }]}>Refer & Earn</Text>
                  <Text style={[styles.referSub, { color: isDark ? P.textSecondary : P.textMuted }]}>{`Invite friends to ${appName}`.toUpperCase()}</Text>
                </View>
                <ArrowLeft size={18} color={isDark ? colors.slate[600] : P.textPrimary} style={{ transform: [{ rotate: '180deg' }] }} />
              </Pressable>
            </Animated.View>
          </View>
        )}

        <View style={{ paddingHorizontal: 20, marginTop: 40 }}>
          <View style={styles.txHead}>
            <Text style={[styles.txLabel, { color: P.textSecondary }]}>TRANSACTION HISTORY</Text>
            {/* Activity is the rides list, not wallet history: the full wallet history opens right here. */}
            {(txs.length || 0) > RECENT_TX_COUNT && (
              <Pressable onPress={() => setShowAllTransactions((value) => !value)} hitSlop={8}>
                <Text style={[styles.txLabel, { color: P.textPrimary }]}>{showAllTransactions ? 'SHOW LESS' : 'VIEW ALL'}</Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.txList, USER_SHADOW, card]}>
            {walletLoading ? (
              <Text style={[styles.txEmpty, { color: P.textSecondary }]}>Loading transactions...</Text>
            ) : txs.length ? (
              (showAllTransactions ? txs : txs.slice(0, RECENT_TX_COUNT)).map((tx, index) => {
                const isDebit = tx.kind === 'debit';
                const title = tx.title || (isDebit ? 'Debit' : 'Credit');
                const sign = isDebit ? '-' : '+';
                const amountText = formatInr(tx.amount);
                const whenText = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                const iconBox = isDebit
                  ? { backgroundColor: P.cardBg, color: P.textSecondary }
                  : isDark
                    ? { backgroundColor: alpha(colors.emerald[950], 0.3), color: colors.emerald[400] }
                    : { backgroundColor: P.cardSoft, color: colors.emerald[600] };

                return (
                  <View
                    key={tx.id ?? index}
                    style={[
                      styles.tx,
                      index > 0 && { borderTopWidth: 1, borderTopColor: isDark ? alpha(colors.slate[800], 0.6) : colors.slate[50] },
                    ]}
                  >
                    <View style={[styles.txIcon, USER_SHADOW, { backgroundColor: iconBox.backgroundColor }]}>
                      {isDebit ? (
                        <ArrowLeft size={16} color={iconBox.color} style={{ transform: [{ rotate: '45deg' }] }} />
                      ) : (
                        <Plus size={16} color={iconBox.color} />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.txTitle, { color: P.textPrimary }]}>{title}</Text>
                      <Text style={[styles.txDate, { color: P.textSecondary }]}>{whenText.toUpperCase()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.txAmount, { color: isDebit ? P.textPrimary : colors.emerald[600] }]}>
                        {sign}₹{amountText}
                      </Text>
                      <Text style={[styles.txKind, { color: isDebit ? P.textSecondary : colors.emerald[400] }]}>
                        {isDebit ? 'DEBIT' : 'CREDIT'}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.txEmpty, { color: P.textSecondary }]}>No transactions yet</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  modalWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 448, borderRadius: 24, padding: 32, paddingBottom: 40, gap: 32 },
  close: { position: 'absolute', top: 24, right: 24, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  sheetTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  sheetSub: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  success: { alignItems: 'center', paddingVertical: 32, gap: 16 },
  successIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  successSub: { fontSize: 12, lineHeight: 16, fontWeight: '500', marginTop: 4 },
  rupee: { position: 'absolute', left: 24, top: 0, bottom: 0, textAlignVertical: 'center', lineHeight: 64, fontSize: 20, fontWeight: '600', zIndex: 2 },
  amountInput: { width: '100%', height: 64, borderWidth: 1, borderRadius: 16, paddingLeft: 48, paddingRight: 24, fontSize: 24, fontWeight: '600', textAlign: 'center' },
  quick: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  quickText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  refill: { width: '100%', height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  refillText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  back: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.47 },
  balanceCard: { borderRadius: 24, padding: 32, borderWidth: 1, overflow: 'hidden' },
  balanceLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  balance: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.75 },
  decimals: { fontSize: 20, lineHeight: 28 },
  note: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 8 },
  addMoney: { flex: 1, height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addMoneyText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  refer: { width: '100%', borderWidth: 1, borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  referIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  referTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  referSub: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  txHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 },
  txLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  txList: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  txEmpty: { padding: 32, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  txDate: { fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 2 },
  txAmount: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  txKind: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
});

export default Wallet;
