// Web: modules/Taxi/modules/driver/pages/DriverWallet.jsx — /taxi/driver/wallet: balance, minimum balance to get orders,
// available cash limit, Top up (Razorpay checkout or PhonePe redirect, chosen by the admin's payment gateway), Withdraw
// request, withdrawal requests, "How it reflects" guide, stat pills and the filtered transactions list.
// API: GET /drivers/wallet, GET /drivers/me, POST /drivers/wallet/top-up/razorpay/order, POST .../razorpay/verify,
// POST /drivers/wallet/top-up/phonepe/order, POST /drivers/wallet/withdrawals; socket 'driver:wallet:updated'.
// Native: a kept-alive bottom-bar tab (driverTabPages.js). The web loaded the wallet and listened to the socket while
// mounted; here the wallet is loaded again each time the tab becomes active (old data stays on screen) and the socket
// listener only runs while it is active. Pull-to-refresh = the header's refresh button.
// Razorpay: the web switched to callback_url + redirect:true inside a phone WebView (UPI intents could not open from
// Razorpay's popup there). The app's checkout (@/lib/razorpay) opens UPI apps itself and returns through the handler, so
// both top-up buttons use the web's handler flow (verify call, same texts).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  IndianRupee,
  RefreshCw,
  Wallet,
  X,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Razorpay, loadRazorpayScript as loadRazorpayCheckout } from '@/lib/razorpay';
import { Sheet, Text, TextInput, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import api from '../../../shared/api/axiosInstance';
import { socketService } from '../../../shared/api/socket';
import { useSettings } from '../../../shared/context/SettingsContext';
import { openExternalCheckout } from '../../../shared/utils/externalNavigation';
import { rememberPendingPhonePeRedirect } from '../../../shared/utils/phonePeResume';
import { getLocalDriverToken, readDriverCache, writeDriverCache } from '../services/registrationService';
import { useDriverTabActive } from '../driverTabPages';

const PHONEPE_DRIVER_WALLET_FLOW_KEY = 'driver-wallet-topup';

const emptyWallet = {
  balance: 0,
  cashLimit: 0,
  minimumBalanceForOrders: 0,
  availableForOrders: 0,
  isBlocked: false,
};

const money = (value) => {
  const amount = Number(value || 0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}Rs ${Math.abs(amount).toFixed(2)}`;
};

// Transaction amounts show their direction: +Rs 50.00 money in, -Rs 12.50 money out.
const signedMoney = (value) => {
  const amount = Number(value || 0);
  return `${amount > 0 ? '+' : ''}${money(amount)}`;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isEnabled = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const transactionLabel = (type = '') => {
  const labels = {
    ride_earning: 'Online ride earning',
    commission_deduction: 'Cash ride commission',
    top_up: 'Wallet top-up',
    adjustment: 'Wallet adjustment',
  };

  return labels[type] || String(type || 'Wallet transaction').replace(/_/g, ' ');
};

const withdrawalStatusMeta = (status = '') => {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'completed' || normalized === 'approved') {
    return { label: 'Approved', bg: colors.emerald[100], fg: colors.emerald[700] };
  }

  if (normalized === 'cancelled' || normalized === 'rejected') {
    return { label: 'Rejected', bg: colors.rose[100], fg: colors.rose[700] };
  }

  return { label: 'Pending', bg: colors.amber[100], fg: colors.amber[700] };
};

const transactionHint = (tx = {}) => {
  const payment = tx.metadata?.paymentMethod;
  const commission = tx.metadata?.commissionAmount;
  const fare = tx.metadata?.fare;
  const source = String(tx.metadata?.source || '').toLowerCase();

  if (tx.type === 'commission_deduction') {
    return `COD ride${fare ? ` of ${money(fare)}` : ''}${commission ? `, admin commission ${money(commission)}` : ''}`;
  }

  if (tx.type === 'ride_earning') {
    return `${payment === 'online' ? 'Online' : 'Ride'} payout after admin commission`;
  }

  if (tx.type === 'adjustment' && source === 'user_wallet_transfer') {
    return tx.description || 'Received from rider wallet';
  }

  return tx.description || 'Updated by wallet activity';
};

const shortenText = (value, maxLength = 88) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Updated by wallet activity';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3).trimEnd()}...`
    : normalized;
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Just now';

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const normalizeWalletResponse = (payload) => {
  const data = payload?.data || payload || {};
  return {
    wallet: data.wallet || emptyWallet,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    withdrawalRequests: Array.isArray(data.withdrawalRequests) ? data.withdrawalRequests : [],
    settings: data.settings || {},
  };
};

const WALLET_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ride_earning', label: 'Online rides' },
  { id: 'commission_deduction', label: 'Cash commission' },
  { id: 'top_up', label: 'Top-ups' },
  { id: 'adjustment', label: 'Adjustments' },
];

const StatPill = ({ label, value, tone = 'dark' }) => {
  const tones = {
    good: { bg: colors.emerald[50], fg: colors.emerald[700] },
    warn: { bg: colors.amber[50], fg: colors.amber[700] },
    dark: { bg: colors.slate[100], fg: colors.slate[700] },
  };
  const t = tones[tone] || tones.dark;

  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillLabel, { color: t.fg }]}>{label}</Text>
      <Text style={[styles.pillValue, { color: t.fg }]}>{value}</Text>
    </View>
  );
};

// Motion.div initial { opacity: 0, y: 8 } -> animate, delay min(index * 0.02, 0.18) s
const FadeInRow = ({ index, style, children }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration: 300, delay: Math.min(index * 20, 180), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim, index]);
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
};

const isOwnerManagedDriverProfile = (driver = {}) =>
  Boolean(
    driver?.owner_id
    || driver?.ownerId
    || driver?.fleet_id
    || driver?.fleetId
    || driver?.owner?._id,
  );

const withDriverAuthorization = (config = {}) => {
  const token = getLocalDriverToken();

  if (!token) {
    return config;
  }

  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
};

const readDriverInfo = () => {
  try {
    return JSON.parse(localStorage.getItem('driverInfo') || '{}');
  } catch {
    return {};
  }
};

const prefillContactFor = (driverInfo) => {
  const driverPhone = driverInfo?.phone || driverInfo?.mobile || '';
  const cleanedPhoneDigits = String(driverPhone).replace(/\D/g, '');
  const finalPhoneDigits = (cleanedPhoneDigits.length === 12 && cleanedPhoneDigits.startsWith('91')) ? cleanedPhoneDigits.slice(2) : cleanedPhoneDigits;
  return finalPhoneDigits.length === 10 ? `+91${finalPhoneDigits}` : '';
};

const DriverWallet = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const tabActive = useDriverTabActive();
  const { settings: appSettings } = useSettings();
  const appName = appSettings.general?.app_name || 'App';
  const activePaymentGateway = appSettings.paymentGateway || null;
  // The wallet from the last visit shows at once; the fresh one replaces it.
  const cachedWalletPage = readDriverCache('walletPage');
  const [wallet, setWallet] = useState(() => cachedWalletPage?.wallet || emptyWallet);
  const [transactions, setTransactions] = useState(() => cachedWalletPage?.transactions || []);
  const [withdrawalRequests, setWithdrawalRequests] = useState(() => cachedWalletPage?.withdrawalRequests || []);
  const [settings, setSettings] = useState(() => cachedWalletPage?.settings || {});
  const [loading, setLoading] = useState(() => !cachedWalletPage);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('500');
  const [processingTopUp, setProcessingTopUp] = useState(false);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [processingWithdraw, setProcessingWithdraw] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  // Shown inside the sheet itself — the page-level `error` banner sits behind the sheet's overlay.
  const [withdrawError, setWithdrawError] = useState('');
  const [payoutDetailsMissing, setPayoutDetailsMissing] = useState(false);
  const [driverProfile, setDriverProfile] = useState(() => cachedWalletPage?.driverProfile || {
    salary: 0,
    isOwnerManagedDriver: false,
  });
  const timersRef = useRef([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const later = (fn, ms) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  const loadWallet = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    setError('');

    try {
      const token = getLocalDriverToken();
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        navigate('/taxi/driver/login', { replace: true });
        return;
      }

      const authConfig = withDriverAuthorization();
      const [walletResponse, profileResponse] = await Promise.all([
        api.get('/drivers/wallet', authConfig),
        api.get('/drivers/me', authConfig).catch(() => null),
      ]);
      const next = normalizeWalletResponse(walletResponse);
      const profile = profileResponse?.data?.data || profileResponse?.data || profileResponse || {};
      setWallet(next.wallet);
      setTransactions(next.transactions);
      setWithdrawalRequests(next.withdrawalRequests);
      setSettings(next.settings);
      const nextDriverProfile = {
        salary: toNumber(profile.salary, 0),
        isOwnerManagedDriver: isOwnerManagedDriverProfile(profile),
      };
      setDriverProfile(nextDriverProfile);
      writeDriverCache('walletPage', { ...next, driverProfile: nextDriverProfile });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Could not load wallet.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  // web: on mount (every visit) -> here: every time the tab is shown; the socket listener only while it is shown
  useEffect(() => {
    if (!tabActive) return undefined;
    loadWallet({ quiet: true });

    const token = getLocalDriverToken();
    const socket = token ? socketService.connect({ role: 'driver' }) : null;
    const onWalletUpdated = (payload) => {
      if (payload?.wallet) setWallet(payload.wallet);
      if (payload?.transaction) {
        setTransactions((previous) => [
          payload.transaction,
          ...previous.filter((item) => item._id !== payload.transaction._id),
        ].slice(0, 50));
      }
    };

    if (socket) socketService.on('driver:wallet:updated', onWalletUpdated);

    return () => {
      socketService.off('driver:wallet:updated', onWalletUpdated);
    };
  }, [tabActive, loadWallet]);

  const rules = useMemo(() => {
    const minimumBalance = toNumber(
      wallet.minimumBalanceForOrders,
      toNumber(settings.driver_wallet_minimum_amount_to_get_an_order, 0),
    );
    const availableForOrders = toNumber(wallet.availableForOrders, toNumber(wallet.balance) - minimumBalance);
    const minimumTopUp = toNumber(wallet.minimumTopUpAmount, toNumber(settings.minimum_amount_added_to_wallet, 0));
    const minimumTransferAmount = toNumber(wallet.minimumTransferAmount, toNumber(settings.minimum_wallet_amount_for_transfer, 0));
    const walletEnabled = wallet.isWalletEnabled ?? isEnabled(settings.show_wallet_feature_for_driver, true);
    const transferEnabled = wallet.isTransferEnabled ?? isEnabled(settings.enable_wallet_transfer_driver, true);
    const canReceiveOrders = walletEnabled && !wallet.isBlocked && availableForOrders >= 0;

    return {
      minimumBalance,
      availableForOrders,
      minimumTopUp,
      minimumTransferAmount,
      walletEnabled,
      transferEnabled,
      canReceiveOrders,
    };
  }, [settings, wallet]);

  const quickAmounts = useMemo(() => {
    const base = Math.max(rules.minimumTopUp, 100);
    return [base, base * 2, base * 5].map((amount) => String(Math.round(amount)));
  }, [rules.minimumTopUp]);

  const walletSummary = useMemo(() => {
    const onlineRideEarnings = transactions
      .filter((tx) => tx.type === 'ride_earning')
      .reduce((sum, tx) => sum + Math.max(Number(tx.amount || 0), 0), 0);
    const cashRideCommission = transactions
      .filter((tx) => tx.type === 'commission_deduction')
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
    const totalAppEarnings = transactions
      .filter((tx) => ['ride_earning', 'adjustment'].includes(tx.type))
      .reduce((sum, tx) => {
        const amount = Number(tx.amount || 0);
        const source = String(tx.metadata?.source || tx.metadata?.category || '').toLowerCase();

        if (tx.type === 'ride_earning') {
          return sum + Math.max(amount, 0);
        }

        return source === 'driver_incentive' ? sum + Math.max(amount, 0) : sum;
      }, 0);

    return {
      totalAppEarnings,
      onlineRideEarnings,
      cashRideCommission,
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (activeFilter === 'all') {
      return transactions;
    }

    return transactions.filter((tx) => tx.type === activeFilter);
  }, [activeFilter, transactions]);

  const recentTransactions = useMemo(() => filteredTransactions.slice(0, 20), [filteredTransactions]);
  const recentWithdrawalRequests = useMemo(
    () => withdrawalRequests.slice(0, 5),
    [withdrawalRequests],
  );
  const walletTopUpGatewayLabel = activePaymentGateway?.label || 'payment gateway';
  const supportsWalletTopUp = activePaymentGateway?.supportsWalletTopUp === true;
  const walletTopUpMode = activePaymentGateway?.walletTopUpMode || '';
  const canTopUpWallet = supportsWalletTopUp && ['razorpay_checkout', 'phonepe_redirect'].includes(walletTopUpMode);

  // web: injected checkout.js; the app's checkout is always available (resolves true)
  const loadRazorpayScript = useCallback(() => loadRazorpayCheckout().then(() => true, () => false), []);

  const applyVerifiedTopUp = (result) => {
    if (result?.wallet) {
      setWallet(result.wallet);
    }
    if (result?.transaction) {
      setTransactions((previous) => [
        result.transaction,
        ...previous.filter((item) => item._id !== result.transaction._id),
      ].slice(0, 50));
    }

    setTopUpSuccess(true);
    later(() => {
      setTopUpSuccess(false);
      setShowTopUp(false);
      setTopUpAmount('500');
    }, 1400);
  };

  const verifyTopUp = async (response) => {
    try {
      const verifyResponse = await api.post('/drivers/wallet/top-up/razorpay/verify', {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      }, withDriverAuthorization());

      applyVerifiedTopUp(verifyResponse?.data || verifyResponse || {});
    } catch (verifyError) {
      setError(verifyError?.message || 'Payment verification failed');
    } finally {
      setProcessingTopUp(false);
    }
  };

  const openCheckout = (orderData) => {
    const driverInfo = readDriverInfo();
    const rzp = new Razorpay({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: appName,
      description: 'Wallet Topup',
      order_id: orderData.orderId,
      prefill: {
        name: driverInfo?.name || driverInfo?.full_name || '',
        email: driverInfo?.email || '',
        contact: prefillContactFor(driverInfo),
      },
      modal: {
        ondismiss: () => {
          setProcessingTopUp(false);
        },
      },
      theme: {
        color: '#E85D04',
      },
      handler: verifyTopUp,
    });

    rzp.on('payment.failed', (event) => {
      const message = event?.error?.description || event?.error?.reason || 'Payment failed';
      setError(message);
      setProcessingTopUp(false);
    });
    rzp.open();
  };

  const handleTopUp = async () => {
    const amount = Number(topUpAmount);

    if (!rules.walletEnabled) {
      setError('Wallet is disabled by admin.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid top-up amount.');
      return;
    }

    if (rules.minimumTopUp > 0 && amount < rules.minimumTopUp) {
      setError(`Minimum top-up amount is Rs ${rules.minimumTopUp}.`);
      return;
    }

    setProcessingTopUp(true);
    setError('');

    try {
      if (!activePaymentGateway) {
        throw new Error('No payment gateway is enabled by admin right now.');
      }

      if (!supportsWalletTopUp || !canTopUpWallet) {
        throw new Error(`${walletTopUpGatewayLabel} is enabled by admin, but driver wallet top-up is not implemented for it yet.`);
      }

      if (walletTopUpMode === 'phonepe_redirect') {
        const sessionResponse = await api.post('/drivers/wallet/top-up/phonepe/order', {
          amount,
        }, withDriverAuthorization());
        const session = sessionResponse?.data || sessionResponse || {};

        if (!session?.checkoutUrl) {
          throw new Error('Could not initiate PhonePe payment. Please try again.');
        }

        rememberPendingPhonePeRedirect(PHONEPE_DRIVER_WALLET_FLOW_KEY, {
          merchantTransactionId: session.merchantTransactionId,
          checkoutUrl: session.checkoutUrl,
        });
        const opened = await openExternalCheckout(session.checkoutUrl);
        if (!opened) {
          throw new Error('PhonePe checkout could not open outside the app WebView. Please update the app bridge or open this payment flow in your browser.');
        }
        setProcessingTopUp(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Razorpay SDK failed to load. Please check your internet connection.');
      }

      // 1. Create order on backend
      const orderResponse = await api.post('/drivers/wallet/top-up/razorpay/order', {
        amount,
      }, withDriverAuthorization());
      const orderData = orderResponse?.data || orderResponse;

      if (!orderData?.orderId && !orderData?.checkoutUrl) {
        throw new Error('Could not initiate payment. Please try again.');
      }

      if (orderData?.checkoutUrl) {
        const opened = await openExternalCheckout(orderData.checkoutUrl);
        if (!opened) {
          throw new Error('Razorpay checkout could not open outside the app WebView. Please update the app bridge or open this payment flow in your browser.');
        }
        setProcessingTopUp(false);
        return;
      }

      // 2. Open Razorpay checkout (the web's handler flow, see the note at the top)
      openCheckout(orderData);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Top-up request failed.');
      setProcessingTopUp(false);
    }
  };

  const handleUserStyleTopUp = async () => {
    const amount = Number(topUpAmount);

    if (!rules.walletEnabled) {
      setError('Wallet is disabled by admin.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid top-up amount.');
      return;
    }

    if (rules.minimumTopUp > 0 && amount < rules.minimumTopUp) {
      setError(`Minimum top-up amount is Rs ${rules.minimumTopUp}.`);
      return;
    }

    setProcessingTopUp(true);
    setError('');

    try {
      if (!activePaymentGateway) {
        throw new Error('No payment gateway is enabled by admin right now.');
      }

      if (!supportsWalletTopUp || walletTopUpMode !== 'razorpay_checkout') {
        throw new Error(`${walletTopUpGatewayLabel} is enabled by admin, but this test flow needs Razorpay wallet top-up.`);
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Razorpay SDK failed to load');
      }

      const orderResponse = await api.post('/drivers/wallet/top-up/razorpay/order', {
        amount,
      }, withDriverAuthorization());
      const orderData = orderResponse?.data || orderResponse || {};

      if (!orderData?.orderId || !orderData?.keyId) {
        throw new Error('Unable to start payment');
      }

      openCheckout(orderData);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Top-up request failed.');
      setProcessingTopUp(false);
    }
  };

  const closeWithdrawSheet = () => {
    setShowWithdraw(false);
    setWithdrawError('');
    setPayoutDetailsMissing(false);
  };

  const handleWithdrawRequest = async () => {
    const amount = Number(withdrawAmount);
    setPayoutDetailsMissing(false);

    if (!rules.transferEnabled) {
      setWithdrawError('Withdrawals are disabled by admin.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawError('Enter a valid withdrawal amount.');
      return;
    }

    if (rules.minimumTransferAmount > 0 && amount < rules.minimumTransferAmount) {
      setWithdrawError(`Minimum withdrawal amount is Rs ${rules.minimumTransferAmount}.`);
      return;
    }

    if (amount > Number(wallet.balance || 0)) {
      setWithdrawError('Withdrawal amount cannot exceed current balance.');
      return;
    }

    setProcessingWithdraw(true);
    setWithdrawError('');

    try {
      const response = await api.post('/drivers/wallet/withdrawals', {
        amount,
        payment_method: 'bank_transfer',
      }, withDriverAuthorization());
      const payload = response?.data || response || {};

      if (payload?.request) {
        setWithdrawalRequests((previous) => [
          payload.request,
          ...previous.filter((item) => item._id !== payload.request._id),
        ].slice(0, 10));
      }

      setWithdrawSuccess(true);
      later(() => {
        setWithdrawSuccess(false);
        setShowWithdraw(false);
        setWithdrawAmount('');
      }, 1800);
    } catch (requestError) {
      setPayoutDetailsMissing(requestError?.details?.code === 'PAYOUT_DETAILS_REQUIRED');
      setWithdrawError(requestError?.response?.data?.message || requestError?.message || requestError?.error || 'Could not send withdrawal request.');
    } finally {
      setProcessingWithdraw(false);
    }
  };

  const statusCopy = rules.walletEnabled
    ? rules.canReceiveOrders
      ? 'Ready for orders'
      : 'Top up to receive orders'
    : 'Wallet disabled';

  const walletIntro = driverProfile.isOwnerManagedDriver
    ? 'Monthly salary and wallet activity'
    : 'Cash commission and online earnings';

  const topUpDisabled = !rules.walletEnabled || !canTopUpWallet;
  const testTopUpDisabled = processingTopUp || !rules.walletEnabled || walletTopUpMode !== 'razorpay_checkout';
  const withdrawDisabled = !rules.transferEnabled || Number(wallet.balance || 0) <= 0;

  return (
    <View style={styles.root}>
      {tabActive ? <StatusBar style="dark" /> : null}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigate(-1)} style={styles.roundBtn} accessibilityLabel="Go back">
          <ArrowLeft size={18} color={colors.slate[900]} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Driver wallet</Text>
          <Text style={styles.headerSub}>{walletIntro}</Text>
        </View>
        <Pressable
          onPress={() => loadWallet()}
          disabled={refreshing}
          style={[styles.roundBtn, refreshing ? styles.dim60 : null]}
          accessibilityLabel="Refresh wallet"
        >
          {refreshing ? (
            <Spin>
              <RefreshCw size={18} color={colors.slate[900]} />
            </Spin>
          ) : (
            <RefreshCw size={18} color={colors.slate[900]} />
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadWallet()} colors={[colors.emerald[700]]} tintColor={colors.emerald[700]} />}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <Spin>
              <RefreshCw size={28} color={colors.emerald[700]} />
            </Spin>
            <Text style={styles.loadingText}>Loading wallet...</Text>
          </View>
        ) : (
          <View style={styles.main}>
            <View style={styles.balanceCard}>
              <View style={styles.balanceTop}>
                <View style={styles.flexShrink}>
                  <Text style={styles.balanceLabel}>Current balance</Text>
                  <Text style={styles.balanceValue}>{money(wallet.balance)}</Text>
                  <View style={[styles.statusChip, { backgroundColor: rules.canReceiveOrders ? alpha(colors.emerald[400], 0.15) : alpha(colors.amber[400], 0.15) }]}>
                    <Text style={[styles.statusChipText, { color: rules.canReceiveOrders ? colors.emerald[200] : colors.amber[200] }]}>{statusCopy}</Text>
                  </View>
                </View>
                <View style={styles.walletIcon}>
                  <Wallet size={26} color={colors.white} />
                </View>
              </View>

              {driverProfile.isOwnerManagedDriver ? (
                <LinearGradient
                  colors={[alpha(colors.white, 0.12), alpha(colors.white, 0.05)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.salaryBox}
                >
                  <View style={styles.salaryRow}>
                    <View style={styles.flexShrink}>
                      <Text style={styles.darkLabel}>Monthly salary</Text>
                      <Text style={styles.salaryValue}>{money(driverProfile.salary)}</Text>
                      <Text style={styles.salaryNote}>Set by fleet owner for this driver profile</Text>
                    </View>
                    <View style={styles.salaryIcon}>
                      <IndianRupee size={22} color={colors.emerald[200]} />
                    </View>
                  </View>
                </LinearGradient>
              ) : null}

              <View style={[styles.limitGrid, driverProfile.isOwnerManagedDriver ? styles.limitGridCol : null]}>
                <View style={styles.limitCell}>
                  <Text style={styles.darkLabel}>Minimum needed</Text>
                  <Text style={styles.limitValue}>{money(rules.minimumBalance)}</Text>
                </View>
                <View style={styles.limitCell}>
                  <Text style={styles.darkLabel}>Available cash limit</Text>
                  <Text style={[styles.limitValue, { color: rules.availableForOrders >= 0 ? colors.emerald[200] : colors.amber[200] }]}>
                    {money(rules.availableForOrders)}
                  </Text>
                </View>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <AlertCircle size={18} color={colors.rose[700]} style={styles.errorIcon} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {activePaymentGateway && !canTopUpWallet ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>{walletTopUpGatewayLabel} is active, but driver wallet top-up is not available for it yet.</Text>
              </View>
            ) : null}

            <View>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => setShowTopUp(true)}
                  disabled={topUpDisabled}
                  style={[styles.actionBtn, { backgroundColor: topUpDisabled ? colors.slate[200] : '#009b72' }]}
                >
                  <Text style={[styles.actionText, { color: topUpDisabled ? colors.slate[400] : colors.white }]}>Top up</Text>
                  <ArrowUpRight size={17} color={topUpDisabled ? colors.slate[400] : colors.white} />
                </Pressable>
                {/* bg-slate-900 button: the partner blue on the web (forced, also when disabled) */}
                <Pressable
                  onPress={() => {
                    setWithdrawError('');
                    setPayoutDetailsMissing(false);
                    setShowWithdraw(true);
                  }}
                  disabled={withdrawDisabled}
                  style={[styles.actionBtn, { backgroundColor: driverTheme.button }]}
                >
                  <Text style={[styles.actionText, { color: colors.white }]}>Withdraw</Text>
                  <ArrowDownLeft size={17} color={colors.white} />
                </Pressable>
              </View>
              <Pressable
                onPress={handleUserStyleTopUp}
                disabled={testTopUpDisabled}
                style={[styles.testBtn, testTopUpDisabled ? styles.testBtnOff : null]}
              >
                {processingTopUp ? (
                  <Spin>
                    <RefreshCw size={17} color={testTopUpDisabled ? colors.slate[400] : colors.emerald[800]} />
                  </Spin>
                ) : (
                  <Text style={[styles.actionText, { color: testTopUpDisabled ? colors.slate[400] : colors.emerald[800] }]}>Add money test</Text>
                )}
                <ArrowUpRight size={17} color={testTopUpDisabled ? colors.slate[400] : colors.emerald[800]} />
              </Pressable>
            </View>

            {recentWithdrawalRequests.length > 0 ? (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Withdrawal requests</Text>
                  <Text style={styles.mutedSmall}>{recentWithdrawalRequests.length} recent</Text>
                </View>
                <View style={styles.gap2}>
                  {recentWithdrawalRequests.map((request) => {
                    const statusMeta = withdrawalStatusMeta(request.status);

                    return (
                      <View key={request._id || request.transactionId} style={styles.requestRow}>
                        <View>
                          <Text style={styles.requestAmount}>{money(request.amount)}</Text>
                          <Text style={styles.requestDate}>{formatDate(request.createdAt)}</Text>
                        </View>
                        <View style={[styles.requestBadge, { backgroundColor: statusMeta.bg }]}>
                          <Text style={[styles.requestBadgeText, { color: statusMeta.fg }]}>{statusMeta.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <View style={styles.guideHead}>
                <IndianRupee size={18} color={colors.emerald[700]} />
                <Text style={styles.cardTitle}>
                  {driverProfile.isOwnerManagedDriver ? 'Wallet activity guide' : 'How it reflects'}
                </Text>
              </View>
              <View style={styles.gap2}>
                <View style={styles.guideBox}>
                  <Text style={styles.guideTitle}>
                    {driverProfile.isOwnerManagedDriver ? 'Monthly salary' : 'Cash / COD ride'}
                  </Text>
                  <Text style={styles.guideText}>
                    {driverProfile.isOwnerManagedDriver
                      ? 'This fixed amount is the monthly salary configured by the fleet owner for this driver.'
                      : 'Driver collects the full cash fare. Wallet deducts only admin commission.'}
                  </Text>
                </View>
                <View style={styles.guideBox}>
                  <Text style={styles.guideTitle}>
                    {driverProfile.isOwnerManagedDriver ? 'Wallet balance' : 'Online ride'}
                  </Text>
                  <Text style={styles.guideText}>
                    {driverProfile.isOwnerManagedDriver
                      ? 'Wallet entries here still show live collections, transfers, top-ups, and deductions separately from salary.'
                      : 'Platform receives the fare. Wallet credits driver earning after commission.'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.gap3}>
              {driverProfile.isOwnerManagedDriver ? (
                <StatPill label="Monthly salary" value={money(driverProfile.salary)} tone="good" />
              ) : null}
              <StatPill label={`${appName} earnings`} value={money(walletSummary.totalAppEarnings)} tone="good" />
              <StatPill label="Top-up minimum" value={money(rules.minimumTopUp)} tone="dark" />
              <View style={styles.row2}>
                <View style={styles.flex1}>
                  <StatPill label="Online earnings" value={money(walletSummary.onlineRideEarnings)} tone="good" />
                </View>
                <View style={styles.flex1}>
                  <StatPill label="Cash commission" value={money(walletSummary.cashRideCommission)} tone="warn" />
                </View>
              </View>
            </View>

            <View style={styles.gap3}>
              <View style={styles.txHead}>
                <View style={styles.flexShrink}>
                  <Text style={styles.cardTitle}>Recent transactions</Text>
                  <Text style={styles.txHeadSub}>Filter earnings and wallet entries by type</Text>
                </View>
                <Text style={styles.mutedSmall}>{recentTransactions.length} shown</Text>
              </View>

              <ScrollView
                horizontal
                style={styles.filterScroll}
                contentContainerStyle={styles.filterRow}
                showsHorizontalScrollIndicator={false}
              >
                {WALLET_FILTERS.map((filter) => {
                  const on = activeFilter === filter.id;
                  return (
                    <Pressable
                      key={filter.id}
                      onPress={() => setActiveFilter(filter.id)}
                      style={[styles.filterChip, on ? { backgroundColor: driverTheme.button } : styles.filterChipOff]}
                    >
                      <Text style={[styles.filterText, { color: on ? colors.white : colors.slate[500] }]}>{filter.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {recentTransactions.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Clock3 size={30} color={colors.slate[300]} />
                  <Text style={styles.emptyTitle}>No transactions yet</Text>
                  <Text style={styles.emptyText}>No entries match the selected earnings filter.</Text>
                </View>
              ) : (
                recentTransactions.map((tx, index) => {
                  const isDebit = Number(tx.amount || 0) < 0;
                  const tint = isDebit ? colors.rose[600] : colors.emerald[700];
                  return (
                    <FadeInRow key={tx._id || tx.id || index} index={index} style={styles.txRow}>
                      <View style={styles.txLeft}>
                        <View style={[styles.txIcon, { backgroundColor: isDebit ? colors.rose[50] : colors.emerald[50] }]}>
                          {isDebit ? <ArrowDownLeft size={18} color={tint} /> : <ArrowUpRight size={18} color={tint} />}
                        </View>
                        <View style={styles.flexShrink}>
                          <Text style={styles.txTitle}>{transactionLabel(tx.type)}</Text>
                          <Text style={styles.txHint}>{shortenText(transactionHint(tx))}</Text>
                          <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                        </View>
                      </View>
                      <View style={styles.txRight}>
                        <Text style={[styles.txAmount, { color: tint }]}>{signedMoney(tx.amount)}</Text>
                        <Text style={styles.txBal}>Bal {money(tx.balanceAfter)}</Text>
                      </View>
                    </FadeInRow>
                  );
                })
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Top-up sheet (data-driver-overlay: covers the bottom bar) */}
      <Sheet open={showTopUp} onClose={() => setShowTopUp(false)} backdropOpacity={0.55} style={[styles.sheet, { paddingBottom: 32 + insets.bottom }]}>
        <View style={styles.sheetHead}>
          <View style={styles.flexShrink}>
            <Text style={styles.sheetTitle}>Top up wallet</Text>
            <Text style={styles.sheetSub}>
              {`Minimum amount: ${money(rules.minimumTopUp)}${activePaymentGateway ? ` • Via ${walletTopUpGatewayLabel}` : ''}`}
            </Text>
          </View>
          <Pressable onPress={() => setShowTopUp(false)} style={styles.closeBtn} accessibilityLabel="Close top-up">
            <X size={18} color={colors.slate[600]} />
          </Pressable>
        </View>

        {topUpSuccess ? (
          <View style={styles.successBox}>
            <View style={styles.successIcon}>
              <CheckCircle2 size={38} strokeWidth={3} color={colors.emerald[700]} />
            </View>
            <Text style={styles.successTitle}>Wallet updated</Text>
          </View>
        ) : (
          <View style={styles.gap4}>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Amount</Text>
              <TextInput
                keyboardType="numeric"
                value={topUpAmount}
                onChangeText={setTopUpAmount}
                style={styles.amountInput}
              />
            </View>
            <View style={styles.quickRow}>
              {quickAmounts.map((amount) => (
                <Pressable key={amount} onPress={() => setTopUpAmount(amount)} style={styles.quickBtn}>
                  <Text style={styles.quickText}>{money(amount)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={handleTopUp}
              disabled={processingTopUp || !rules.walletEnabled}
              style={[styles.sheetBtn, { backgroundColor: processingTopUp || !rules.walletEnabled ? colors.slate[200] : '#101521' }]}
            >
              {processingTopUp ? (
                <Spin>
                  <RefreshCw size={18} color={colors.slate[400]} />
                </Spin>
              ) : (
                <Text style={[styles.sheetBtnText, { color: rules.walletEnabled ? colors.white : colors.slate[400] }]}>Add money</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleUserStyleTopUp}
              disabled={testTopUpDisabled}
              style={[styles.sheetBtn, styles.testBtnBorder, testTopUpDisabled ? styles.testBtnOff : null]}
            >
              {processingTopUp ? (
                <Spin>
                  <RefreshCw size={18} color={colors.slate[400]} />
                </Spin>
              ) : (
                <Text style={[styles.sheetBtnText, { color: testTopUpDisabled ? colors.slate[400] : colors.emerald[800] }]}>Add money test</Text>
              )}
            </Pressable>
          </View>
        )}
      </Sheet>

      {/* Withdraw sheet (data-driver-overlay) */}
      <Sheet open={showWithdraw} onClose={closeWithdrawSheet} backdropOpacity={0.55} style={[styles.sheet, { paddingBottom: 32 + insets.bottom }]}>
        <View style={styles.sheetHead}>
          <View style={styles.flexShrink}>
            <Text style={styles.sheetTitle}>Withdraw to admin request</Text>
            <Text style={styles.sheetSub}>{`Minimum amount: ${money(rules.minimumTransferAmount)}`}</Text>
          </View>
          <Pressable onPress={closeWithdrawSheet} style={styles.closeBtn} accessibilityLabel="Close withdrawal">
            <X size={18} color={colors.slate[600]} />
          </Pressable>
        </View>

        {withdrawSuccess ? (
          <View style={styles.successBox}>
            <View style={styles.successIcon}>
              <CheckCircle2 size={38} strokeWidth={3} color={colors.emerald[700]} />
            </View>
            <Text style={styles.successTitle}>Request sent</Text>
            <Text style={styles.successSub}>Admin will review your withdrawal request.</Text>
          </View>
        ) : (
          <View style={styles.gap4}>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Withdrawal amount</Text>
              <TextInput
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={colors.slate[400]}
              />
              <Text style={styles.availableText}>{`Available balance: ${money(wallet.balance)}`}</Text>
            </View>
            {withdrawError ? (
              <View style={styles.withdrawError}>
                <Text style={styles.withdrawErrorText}>{withdrawError}</Text>
                {payoutDetailsMissing ? (
                  <Pressable
                    onPress={() => {
                      setShowWithdraw(false);
                      navigate('/taxi/driver/profile/bank-details');
                    }}
                    style={styles.payoutBtn}
                  >
                    <Text style={styles.payoutBtnText}>Add payout details</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {/* bg-slate-900 button: the partner blue on the web (forced) */}
            <Pressable
              onPress={handleWithdrawRequest}
              disabled={processingWithdraw || !rules.transferEnabled}
              style={[styles.sheetBtn, { backgroundColor: driverTheme.button }]}
            >
              {processingWithdraw ? (
                <Spin>
                  <RefreshCw size={18} color={colors.white} />
                </Spin>
              ) : (
                <Text style={[styles.sheetBtnText, { color: colors.white }]}>Send request</Text>
              )}
            </Pressable>
          </View>
        )}
      </Sheet>
    </View>
  );
};

const black = { fontWeight: '900' };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f1e8' },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  dim60: { opacity: 0.6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f1e8',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  headerCenter: { alignItems: 'center', flexShrink: 1, paddingHorizontal: 8 },
  headerTitle: { fontSize: 18, lineHeight: 28, ...black, letterSpacing: -0.45, color: colors.slate[950] },
  headerSub: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[500], textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  loadingBox: { minHeight: 420, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, lineHeight: 20, ...black, color: colors.slate[500] },
  main: { gap: 16 },
  balanceCard: { borderRadius: 32, backgroundColor: '#101521', padding: 20, overflow: 'hidden', ...shadow.xl },
  balanceTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  balanceLabel: { fontSize: 12, lineHeight: 16, ...black, textTransform: 'uppercase', letterSpacing: 2.16, color: alpha(colors.white, 0.45) },
  balanceValue: { marginTop: 8, fontSize: 36, lineHeight: 40, ...black, letterSpacing: -0.9, color: colors.white },
  statusChip: { marginTop: 12, alignSelf: 'flex-start', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  statusChipText: { fontSize: 12, lineHeight: 16, ...black },
  walletIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), alignItems: 'center', justifyContent: 'center' },
  salaryBox: { marginTop: 20, borderRadius: 24, borderWidth: 1, borderColor: alpha(colors.white, 0.1), padding: 16 },
  salaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  darkLabel: { fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 1.6, color: alpha(colors.white, 0.45) },
  salaryValue: { marginTop: 4, fontSize: 24, lineHeight: 32, ...black, color: colors.emerald[200] },
  salaryNote: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: alpha(colors.white, 0.55) },
  salaryIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: alpha(colors.emerald[400], 0.15), alignItems: 'center', justifyContent: 'center' },
  limitGrid: { marginTop: 20, flexDirection: 'row', gap: 12 },
  limitGridCol: { flexDirection: 'column' },
  limitCell: { flex: 1, borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), padding: 12 },
  limitValue: { marginTop: 4, fontSize: 18, lineHeight: 28, ...black, color: colors.white },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], padding: 16 },
  errorIcon: { marginTop: 2 },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.rose[700] },
  warnBox: { borderRadius: 16, borderWidth: 1, borderColor: colors.amber[100], backgroundColor: colors.amber[50], padding: 16 },
  warnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.amber[700] },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow.sm },
  actionText: { fontSize: 14, lineHeight: 20, ...black, textTransform: 'uppercase', letterSpacing: 1.12 },
  testBtn: {
    marginTop: 12,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.emerald[200],
    backgroundColor: colors.emerald[50],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadow.sm,
  },
  testBtnBorder: { borderWidth: 1, borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] },
  testBtnOff: { borderColor: colors.slate[100], backgroundColor: colors.slate[100] },
  card: { borderRadius: 27, backgroundColor: colors.white, padding: 16, ...shadow.sm },
  cardHead: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, lineHeight: 20, ...black, color: colors.slate[950] },
  mutedSmall: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[500] },
  gap2: { gap: 8 },
  gap3: { gap: 12 },
  gap4: { gap: 16 },
  row2: { flexDirection: 'row', gap: 12 },
  requestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, backgroundColor: colors.slate[50], padding: 12 },
  requestAmount: { fontSize: 14, lineHeight: 20, ...black, color: colors.slate[900] },
  requestDate: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[500] },
  requestBadge: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  requestBadgeText: { fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 1.6 },
  guideHead: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  guideBox: { borderRadius: 16, backgroundColor: colors.slate[50], padding: 12 },
  guideTitle: { fontSize: 14, lineHeight: 20, ...black, color: colors.slate[900] },
  guideText: { marginTop: 4, fontSize: 12, lineHeight: 19.5, fontWeight: '700', color: colors.slate[500] },
  pill: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  pillLabel: { fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 1.6, opacity: 0.7 },
  pillValue: { marginTop: 4, fontSize: 16, lineHeight: 24, ...black },
  txHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  txHeadSub: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[500] },
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: 8, paddingBottom: 4 },
  filterChip: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 8 },
  filterChipOff: { backgroundColor: colors.white, ...shadow.sm },
  filterText: { fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 1.6 },
  emptyCard: { borderRadius: 27, backgroundColor: colors.white, padding: 32, alignItems: 'center', ...shadow.sm },
  emptyTitle: { marginTop: 12, fontSize: 14, lineHeight: 20, ...black, color: colors.slate[700], textAlign: 'center' },
  emptyText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400], textAlign: 'center' },
  txRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 22, backgroundColor: colors.white, padding: 16, ...shadow.sm },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minWidth: 0 },
  txIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txTitle: { fontSize: 14, lineHeight: 20, ...black, color: colors.slate[950] },
  txHint: { marginTop: 2, fontSize: 12, lineHeight: 20, fontWeight: '700', color: colors.slate[500] },
  txDate: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[400] },
  txRight: { flexShrink: 0, alignItems: 'flex-end' },
  txAmount: { fontSize: 14, lineHeight: 20, ...black },
  txBal: { marginTop: 4, fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', color: colors.slate[400] },
  sheet: { left: 12, right: 12, backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, ...shadow['2xl'] },
  sheetHead: { marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { fontSize: 20, lineHeight: 28, ...black, color: colors.slate[950] },
  sheetSub: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[500] },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  successBox: { alignItems: 'center', paddingVertical: 40 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.emerald[50], alignItems: 'center', justifyContent: 'center' },
  successTitle: { marginTop: 16, fontSize: 18, lineHeight: 28, ...black, color: colors.slate[950] },
  successSub: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[500], textAlign: 'center' },
  amountBox: { borderRadius: 24, backgroundColor: colors.slate[50], padding: 20, alignItems: 'center' },
  amountLabel: { fontSize: 12, lineHeight: 16, ...black, textTransform: 'uppercase', letterSpacing: 1.92, color: colors.slate[400] },
  amountInput: { marginTop: 8, width: '100%', textAlign: 'center', fontSize: 36, lineHeight: 44, ...black, color: colors.slate[950], padding: 0 },
  availableText: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[500] },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, paddingVertical: 12, alignItems: 'center', ...shadow.sm },
  quickText: { fontSize: 14, lineHeight: 20, ...black, color: colors.slate[700] },
  sheetBtn: { height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetBtnText: { fontSize: 14, lineHeight: 20, ...black, textTransform: 'uppercase', letterSpacing: 1.4 },
  withdrawError: { borderRadius: 16, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], paddingHorizontal: 16, paddingVertical: 12 },
  withdrawErrorText: { fontSize: 14, lineHeight: 22.75, fontWeight: '700', color: colors.rose[600] },
  payoutBtn: { marginTop: 12, height: 40, borderRadius: 14, backgroundColor: colors.rose[600], alignItems: 'center', justifyContent: 'center' },
  payoutBtnText: { fontSize: 12, lineHeight: 16, ...black, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.white },
});

export default DriverWallet;
