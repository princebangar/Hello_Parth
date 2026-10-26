import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  Wallet, IndianRupee,
  ShieldCheck, HelpCircle,
  Receipt, FileText, LayoutGrid, ChevronRight
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { deliveryAPI } from '@food/api';
import { toast } from '@/lib/toast';
import { showUserFacingApiError } from '@/shared/utils/apiError';
import { initRazorpayPayment } from "@food/utils/razorpay";
import { getCompanyNameAsync } from "@food/utils/businessSettings";
import { Sheet, Skeleton, Text, TextInput, useBottomNavSpace } from '@/native/ui';
import { alpha, colors, fonts, shadow } from '@/theme';
import { useDeliveryTabActive } from '../deliveryTabPages';

const PRIMARY = '#15498B'; // bg-[#ff8100], text-[#ff8100], text-blue-600, bg-green-500 ... (deliveryTheme.css)
const PRIMARY_SOFT = '#E7EFFA'; // bg-orange-50, bg-blue-50
const PRIMARY_BORDER = '#C3D0E1'; // border-orange-100, border-blue-100
const SOFT_BG = '#EEF3FB'; // bg-[#f6e9dc], bg-yellow-300/400
const CARD_BORDER = '#D1DCEB'; // rounded-2xl / rounded-3xl border
const RX = { elevation: 3, shadowColor: '#112743', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } };

const RING_R = 45;
const RING_C = 2 * Math.PI * RING_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// <svg -rotate-90> + motion.circle pathLength 0 -> progress (1.5 s easeOut)
function ProgressRing({ progress, color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: progress, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [anim, progress]);
  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] });
  return (
    <View style={{ width: 112, height: 112, transform: [{ rotate: '-90deg' }] }}>
      <Svg width={112} height={112} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r={RING_R} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <AnimatedCircle
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${RING_C} ${RING_C}`}
          strokeDashoffset={dashOffset}
          opacity={progress > 0 ? 1 : 0}
        />
      </Svg>
    </View>
  );
}

// animate-pulse
function PulseDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

/**
 * PocketV2 - 1:1 Match with Old PocketPage UI.
 * Background: #f6e9dc
 * Font: Poppins
 * Rendered inside DeliveryHomeV2's Pocket tab (kept alive): the web loaded the data on mount, which here is each time
 * the tab becomes the one on screen (old data stays visible while it reloads).
 */
export const PocketV2 = () => {
  const tabScrollRef = useRef(null);
  useTabScrollTop(tabScrollRef);
  const navigate = useNavigate();
  const tabActive = useDeliveryTabActive();
  const bottomSpace = useBottomNavSpace();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnceRef = useRef(false);
  const [walletState, setWalletState] = useState({
    totalBalance: 0,
    cashInHand: 0,
    availableCashLimit: 0,
    totalCashLimit: 0,
    pendingCashSubmission: 0,
    availableToDeposit: 0,
    weeklyEarnings: 0,
    weeklyOrders: 0,
    payoutAmount: 0,
    payoutPeriod: 'Current Week',
    bankDetailsFilled: false
  });

  const [activeOffer, setActiveOffer] = useState({
    targetAmount: 0,
    targetOrders: 0,
    currentOrders: 0,
    currentEarnings: 0,
    validTill: '',
    isLive: false
  });

  const [showDepositPopup, setShowDepositPopup] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositMode, setDepositMode] = useState("cash"); // cash | online
  const [inputFocused, setInputFocused] = useState(false);

  const applyWalletFromApi = (wallet = {}) => {
    if (!wallet || typeof wallet !== "object") return;
    setWalletState((prev) => ({
      ...prev,
      totalBalance: Number(wallet.pocketBalance) || prev.totalBalance,
      cashInHand: Number(wallet.cashInHand) ?? prev.cashInHand,
      availableCashLimit: Number(wallet.availableCashLimit) ?? prev.availableCashLimit,
      totalCashLimit: Number(wallet.totalCashLimit) ?? prev.totalCashLimit,
      pendingCashSubmission: Number(wallet.pendingCashSubmission) ?? prev.pendingCashSubmission,
      availableToDeposit:
        wallet.availableToDeposit != null
          ? Number(wallet.availableToDeposit)
          : Math.max(0, Number(wallet.cashInHand ?? prev.cashInHand) - Number(wallet.pendingCashSubmission ?? prev.pendingCashSubmission)),
      payoutAmount:
        wallet.lastPayout?.amount != null
          ? Number(wallet.lastPayout.amount)
          : 0,
      payoutPeriod: wallet.lastPayout?.date
        ? new Date(wallet.lastPayout.date).toLocaleDateString()
        : 'No recent payout',
    }));
    window.dispatchEvent(new CustomEvent("deliveryWalletStateUpdated"));
  };

  const refreshWalletSilent = async () => {
    try {
      const walletRes = await deliveryAPI.getWallet();
      const wallet = walletRes?.data?.data?.wallet || {};
      applyWalletFromApi(wallet);
    } catch {
      // keep existing wallet state if refresh fails
    }
  };
  const refreshWalletSilentRef = useRef(refreshWalletSilent);
  refreshWalletSilentRef.current = refreshWalletSilent;

  const openDepositPopup = () => {
    setDepositMode("cash");
    setDepositAmount("");
    setShowDepositPopup(true);
    refreshWalletSilent();
  };

  const closeDepositPopup = () => {
    setShowDepositPopup(false);
    setDepositMode("cash");
    setDepositAmount("");
    setDepositing(false);
  };

  // The popup belongs to this screen: when another page / tab opens, it closes (web: the page unmounted).
  useEffect(() => {
    if (tabActive) return;
    setShowDepositPopup(false);
  }, [tabActive]);

  // web: listeners while the page was mounted -> here while the tab is on screen
  useEffect(() => {
    if (!tabActive) return undefined;
    const handleWalletRefresh = () => {
      refreshWalletSilentRef.current();
    };
    window.addEventListener("delivery-wallet-refresh", handleWalletRefresh);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshWalletSilentRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("delivery-wallet-refresh", handleWalletRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tabActive]);

  const fetchData = useCallback(async () => {
    try {
      if (!loadedOnceRef.current) setLoading(true);
      const [profileRes, earningsRes, walletRes] = await Promise.all([
        deliveryAPI.getProfile(),
        deliveryAPI.getEarnings({ period: 'week' }),
        deliveryAPI.getWallet()
      ]);

      const profile = profileRes?.data?.data?.profile || {};
      const summary = earningsRes?.data?.data?.summary || {};
      const wallet = walletRes?.data?.data?.wallet || {};
      const activeAddonsRes = await deliveryAPI.getActiveEarningAddons().catch(() => null);
      const activeOfferPayload =
        activeAddonsRes?.data?.data?.activeOffer ||
        activeAddonsRes?.data?.activeOffer ||
        null;

      const bankDetails = profile?.documents?.bankDetails;
      const isFilled = !!(bankDetails?.accountNumber);

      setWalletState({
        totalBalance: Number(wallet.pocketBalance) || 0,
        cashInHand: Number(wallet.cashInHand) || 0,
        availableCashLimit: Number(wallet.availableCashLimit) || 0,
        totalCashLimit: Number(wallet.totalCashLimit) || 0,
        pendingCashSubmission: Number(wallet.pendingCashSubmission) || 0,
        availableToDeposit:
          wallet.availableToDeposit != null
            ? Number(wallet.availableToDeposit)
            : Math.max(0, Number(wallet.cashInHand) || 0),
        weeklyEarnings: Number(summary.totalEarnings) || 0,
        weeklyOrders: Number(summary.totalOrders) || 0,
        payoutAmount: Number(wallet.lastPayout?.amount) || 0,
        payoutPeriod: wallet.lastPayout?.date
          ? new Date(wallet.lastPayout.date).toLocaleDateString()
          : 'No recent payout',
        bankDetailsFilled: isFilled
      });

      setActiveOffer({
        targetAmount: Number(activeOfferPayload?.targetAmount) || 0,
        targetOrders: Number(activeOfferPayload?.targetOrders) || 0,
        currentOrders: Number(activeOfferPayload?.currentOrders) || 0,
        currentEarnings: Number(activeOfferPayload?.currentEarnings) || 0,
        validTill: activeOfferPayload?.validTill || '',
        isLive: Boolean(activeOfferPayload)
      });
    } catch (err) {
      showUserFacingApiError(err, 'Failed to load wallet data');
    } finally {
      loadedOnceRef.current = true;
      setLoading(false);
    }
  }, []);

  // web: loaded on mount -> here each time the tab becomes active (old data stays on screen)
  useEffect(() => {
    if (!tabActive) return;
    fetchData();
  }, [tabActive, fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleDeposit = async () => {
    if (!canDepositMore) return;
    const amt = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum ₹1)");
      return;
    }

    if (amt > walletState.availableToDeposit) {
      const pendingNote = walletState.pendingCashSubmission > 0
        ? ` (₹${walletState.pendingCashSubmission} already pending admin confirmation)`
        : "";
      toast.error(`Deposit amount cannot exceed available cash (₹${walletState.availableToDeposit})${pendingNote}`);
      return;
    }

    try {
      setDepositing(true);
      const orderRes = await deliveryAPI.createDepositOrder(amt);
      const data = orderRes?.data?.data;
      const rp = data?.razorpay;

      if (!rp?.orderId) {
        toast.error("Payment initialization failed");
        setDepositing(false);
        return;
      }

      const profileRes = await deliveryAPI.getProfile();
      const profile = profileRes?.data?.data?.profile || {};
      const companyName = await getCompanyNameAsync();

      await initRazorpayPayment({
        key: rp.key,
        amount: rp.amount,
        currency: rp.currency || "INR",
        order_id: rp.orderId,
        name: companyName,
        description: `Cash limit deposit - ₹${amt}`,
        prefill: {
          name: profile.name,
          email: profile.email,
          contact: profile.phone
        },
        handler: async (res) => {
          try {
            const verifyRes = await deliveryAPI.verifyDepositPayment({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
              amount: amt
            });
            if (verifyRes?.data?.success) {
              toast.success("Deposit successful");
              applyWalletFromApi(verifyRes?.data?.data?.wallet);
              closeDepositPopup();
            }
          } catch {
            toast.error("Verification failed");
          } finally {
            setDepositing(false);
          }
        },
        onError: () => setDepositing(false),
        onClose: () => setDepositing(false)
      });
    } catch (err) {
      setDepositing(false);
      showUserFacingApiError(err, "Deposit failed to start");
    }
  };

  const handleCashSubmit = async () => {
    if (!canDepositMore) return;
    const amt = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum ₹1)");
      return;
    }

    if (amt > walletState.availableToDeposit) {
      const pendingNote = walletState.pendingCashSubmission > 0
        ? ` (₹${walletState.pendingCashSubmission} already pending admin confirmation)`
        : "";
      toast.error(`Amount cannot exceed available cash (₹${walletState.availableToDeposit})${pendingNote}`);
      return;
    }

    try {
      setDepositing(true);
      const res = await deliveryAPI.submitCashDeposit(amt);
      if (res?.data?.success) {
        toast.success("Cash submitted successfully. Waiting for admin confirmation.");
        applyWalletFromApi(res?.data?.data?.wallet);
        setDepositAmount("");
        setDepositMode("cash");
      } else {
        showUserFacingApiError(
          { response: { data: { message: res?.data?.message } } },
          "Cash submission failed",
        );
      }
    } catch (err) {
      showUserFacingApiError(err, "Cash submission failed");
    } finally {
      setDepositing(false);
    }
  };

  const hasPendingCashSubmission = walletState.pendingCashSubmission > 0;
  const canDepositMore = walletState.availableToDeposit > 0;
  const isDepositInputDisabled = !canDepositMore;
  const isSubmitDisabled = isDepositInputDisabled || depositing || !String(depositAmount).trim();

  const ordersProgress = activeOffer.targetOrders > 0 ? Math.min(activeOffer.currentOrders / activeOffer.targetOrders, 1) : 0;
  const earningsProgress = activeOffer.targetAmount > 0 ? Math.min(activeOffer.currentEarnings / activeOffer.targetAmount, 1) : 0;
  const hasActiveOffer = activeOffer.isLive && (activeOffer.targetAmount > 0 || activeOffer.targetOrders > 0);

  const formatOfferValidTill = (validTill) => {
    if (!validTill) return '';
    const parsed = new Date(validTill);
    if (Number.isNaN(parsed.getTime())) return String(validTill);
    return parsed.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getCurrentWeekRange = () => {
    // Monday → Sunday (IST-friendly local browser clock for India riders)
    const now = new Date();
    const day = now.getDay(); // Sun=0 ... Sat=6
    const mondayOffset = (day + 6) % 7; // Mon=0 ... Sun=6
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const formatDate = (d) => `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const modeButton = (mode, label) => {
    const active = depositMode === mode;
    return (
      <Pressable
        onPress={() => { setDepositMode(mode); setDepositAmount(""); }}
        style={[styles.modeBtn, active ? styles.modeBtnActive : styles.modeBtnIdle]}
      >
        <Text style={[styles.modeText, { color: active ? colors.white : colors.gray[600] }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView ref={tabScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: bottomSpace }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} tintColor={PRIMARY} />}
      >
        {/* 1. BANK DETAILS BANNER */}
        {!loading && !walletState.bankDetailsFilled ? (
          <View style={styles.bankBanner}>
            <View style={styles.bankIcon}>
              <FileText size={28} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bankTitle}>Submit bank details</Text>
              <Text style={styles.bankText}>PAN &amp; bank details required for payouts</Text>
            </View>
            <Pressable onPress={() => navigate('/food/delivery/profile/details')} style={styles.bankBtn}>
              <Text style={styles.bankBtnText}>Submit</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.inner}>
          {/* 2. WEEKLY EARNINGS CARD */}
          <Pressable
            onPress={() => navigate('/food/delivery/pocket/details')}
            style={({ pressed }) => [styles.earningsCard, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <Text style={styles.earningsLabel}>{`EARNINGS: ${getCurrentWeekRange().toUpperCase()}`}</Text>
            <View style={styles.earningsValueBox}>
              {loading ? <Skeleton width={112} height={40} /> : <Text style={styles.earningsValue}>{`₹${walletState.weeklyEarnings.toFixed(0)}`}</Text>}
            </View>
          </Pressable>

          {/* 3. EARNINGS GUARANTEE - API DRIVEN (NO STATIC VALUES) */}
          {hasActiveOffer ? (
            <View style={styles.offerCard}>
              <View style={styles.offerHead}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.offerTitle}>Earnings Guarantee</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.offerValid}>{`VALID TILL ${formatOfferValidTill(activeOffer.validTill).toUpperCase()}`}</Text>
                    {activeOffer.isLive ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <PulseDot />
                        <Text style={styles.liveText}>LIVE</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.targetBox}>
                  <Text style={styles.targetAmount}>{`₹${activeOffer.targetAmount}`}</Text>
                  <Text style={styles.targetOrders}>{`${activeOffer.targetOrders} ORDERS`}</Text>
                </View>
              </View>

              <View style={styles.ringsRow}>
                {/* Orders Circle */}
                <View style={{ alignItems: 'center' }}>
                  <View style={styles.ringBox}>
                    <ProgressRing progress={ordersProgress} color="#000" />
                    <View style={styles.ringCenter}>
                      <Text style={styles.ringValue}>{String(activeOffer.currentOrders)}</Text>
                      <Text style={styles.ringSub}>{`OF ${activeOffer.targetOrders}`}</Text>
                    </View>
                  </View>
                  <Text style={styles.ringLabel}>ORDERS DONE</Text>
                </View>

                {/* Earnings Circle */}
                <View style={{ alignItems: 'center' }}>
                  <View style={styles.ringBox}>
                    <ProgressRing progress={earningsProgress} color="#ff8100" />
                    <View style={[styles.ringCenter, { paddingHorizontal: 8 }]}>
                      <Text style={styles.ringEarned} numberOfLines={1}>{`₹${activeOffer.currentEarnings}`}</Text>
                      <HelpCircle size={10} color={colors.gray[300]} style={{ marginTop: 4 }} />
                    </View>
                  </View>
                  <Text style={styles.ringLabel}>EARNED YET</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* 4. POCKET ACTION BUTTONS */}
          <View style={styles.actionsCard}>
            <Pressable
              onPress={() => navigate('/food/delivery/pocket/balance')}
              style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.gray[50] }]}
            >
              <View style={styles.actionLeft}>
                <View style={styles.actionIcon}>
                  <Wallet size={24} color={colors.black} />
                </View>
                <View>
                  <Text style={styles.actionTitle}>Pocket balance</Text>
                  <Text style={styles.actionSub}>WITHDRAWAL HUB</Text>
                </View>
              </View>
              <View style={styles.actionRight}>
                <View style={styles.actionValueBox}>
                  {loading ? <Skeleton width={64} height={20} /> : <Text style={styles.actionValue}>{`₹${walletState.totalBalance.toFixed(2)}`}</Text>}
                </View>
                <ChevronRight size={16} color={colors.gray[300]} />
              </View>
            </Pressable>

            <Pressable
              onPress={() => navigate('/food/delivery/pocket/cash-limit')}
              style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.gray[50] }]}
            >
              <View style={styles.actionLeft}>
                <View style={styles.actionIcon}>
                  <ShieldCheck size={24} color={colors.black} />
                </View>
                <View>
                  <Text style={styles.actionTitle}>Available cash limit</Text>
                  <Text style={styles.actionSub}>SPEND CONTROL</Text>
                </View>
              </View>
              <View style={styles.actionRight}>
                <View style={styles.actionValueBox}>
                  {loading ? <Skeleton width={64} height={20} /> : <Text style={styles.actionValue}>{`₹${walletState.availableCashLimit.toFixed(2)}`}</Text>}
                </View>
                <ChevronRight size={16} color={colors.gray[300]} />
              </View>
            </Pressable>

            <View style={{ padding: 20 }}>
              <Pressable
                onPress={openDepositPopup}
                style={({ pressed }) => [styles.depositBtn, pressed && { transform: [{ scale: 0.95 }] }]}
              >
                <Text style={styles.depositBtnText}>Deposit Cash</Text>
              </Pressable>
            </View>
          </View>

          {/* 5. MORE SERVICES - Vertical List */}
          <View style={{ gap: 16 }}>
            <View style={styles.grid}>
              <Pressable
                onPress={() => navigate('/food/delivery/pocket/payout')}
                style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: PRIMARY_SOFT, borderColor: PRIMARY_BORDER }]}>
                  <IndianRupee size={20} color={PRIMARY} />
                </View>
                <Text style={styles.tileKicker}>LAST PAYOUT</Text>
                <View style={{ minHeight: 24, marginBottom: 4, justifyContent: 'center' }}>
                  {loading ? <Skeleton width={64} height={24} /> : <Text style={styles.tileValue}>{`₹${walletState.payoutAmount}`}</Text>}
                </View>
                <Text style={styles.tileSub}>PREV WEEK INFO</Text>
              </Pressable>

              <Pressable
                onPress={() => navigate('/food/delivery/pocket/limit-settlement')}
                style={({ pressed }) => [styles.tile, styles.tileBetween, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: PRIMARY_SOFT, borderColor: PRIMARY_BORDER }]}>
                  <Receipt size={20} color={PRIMARY} />
                </View>
                <Text style={styles.tileTitle}>Limit Settlement</Text>
              </Pressable>
            </View>

            <View style={styles.grid}>
              <Pressable
                onPress={() => navigate('/food/delivery/pocket/deductions')}
                style={({ pressed }) => [styles.tile, styles.tileBetween, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: colors.red[50], borderColor: colors.red[100] }]}>
                  <FileText size={20} color={colors.red[600]} />
                </View>
                <Text style={styles.tileTitle}>Deduction List</Text>
              </Pressable>

              <Pressable
                onPress={() => navigate('/food/delivery/pocket/details')}
                style={({ pressed }) => [styles.tile, styles.tileBetween, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: colors.purple[50], borderColor: colors.purple[100] }]}>
                  <LayoutGrid size={20} color={colors.purple[600]} />
                </View>
                <Text style={styles.tileTitle}>Pocket statement</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* DEPOSIT MODAL - RESTORED 1:1 */}
      <Sheet open={showDepositPopup} onClose={closeDepositPopup} backdropOpacity={0.8} style={styles.sheet}>
        <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={styles.sheetContent}>
          <Pressable onPress={closeDepositPopup} style={styles.handleBtn} accessibilityLabel="Close deposit popup">
            <View style={styles.handle} />
          </Pressable>

          {hasPendingCashSubmission ? (
            <View style={styles.pendingBox}>
              <Text style={styles.pendingText}>{`You already paid ₹${walletState.pendingCashSubmission.toLocaleString("en-IN")}`}</Text>
              <Text style={styles.pendingSub}>WAITING FOR ADMIN CONFIRMATION</Text>
            </View>
          ) : null}

          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={styles.sheetIcon}>
              <IndianRupee size={40} color={PRIMARY} />
            </View>
            <Text style={styles.sheetTitle}>Deposit Cash</Text>
            <Text style={styles.sheetSub}>SETTLE HAND DUES</Text>
          </View>

          <View style={styles.depositBox}>
            <View style={styles.cashRow}>
              <Text style={styles.cashLabel}>CASH IN YOUR HAND</Text>
              <Text style={styles.cashValue}>{`₹${walletState.cashInHand}`}</Text>
            </View>

            <View style={styles.modeRow}>
              {modeButton("cash", "SUBMIT BY CASH")}
              {modeButton("online", "DEPOSIT ONLINE")}
            </View>

            <View style={{ justifyContent: 'center' }}>
              <IndianRupee size={20} color={colors.gray[400]} style={styles.inputIcon} />
              <TextInput
                key={depositMode}
                keyboardType="numeric"
                value={depositAmount}
                onChangeText={setDepositAmount}
                placeholder={depositMode === "cash" ? "Cash amount" : "Enter amount to deposit"}
                placeholderTextColor={colors.gray[400]}
                editable={!isDepositInputDisabled}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                style={[
                  styles.input,
                  inputFocused && styles.inputFocused,
                  isDepositInputDisabled && { backgroundColor: colors.gray[100], color: colors.gray[400] },
                ]}
              />
            </View>

            {canDepositMore ? (
              <Text style={styles.depositHint}>
                {depositMode === "cash"
                  ? "MINIMUM ₹1 • ADMIN CONFIRMATION REQUIRED"
                  : "MINIMUM DEPOSIT ₹1 • INSTANT LIMIT UPDATE"}
              </Text>
            ) : (
              // the box is locked when there is nothing to deposit: say why (Prince, 26 Oct)
              <Text style={styles.depositLockedHint}>
                {walletState.pendingCashSubmission > 0
                  ? "Your cash submission is waiting for admin confirmation. You can deposit again once it is confirmed."
                  : "No cash in hand to deposit right now. Cash you collect on COD orders will show here."}
              </Text>
            )}
          </View>

          <View style={{ gap: 12 }}>
            <Pressable
              onPress={depositMode === "cash" ? handleCashSubmit : handleDeposit}
              disabled={isSubmitDisabled}
              style={({ pressed }) => [
                styles.submitBtn,
                isSubmitDisabled ? { backgroundColor: colors.blue[100] } : { backgroundColor: PRIMARY, ...shadow.xl },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              {depositing ? (
                <ActivityIndicator size="small" color={isSubmitDisabled ? colors.blue[400] : colors.white} />
              ) : (
                <ShieldCheck size={20} color={isSubmitDisabled ? colors.blue[400] : colors.white} />
              )}
              <Text style={[styles.submitText, { color: isSubmitDisabled ? colors.blue[400] : colors.white }]}>
                {depositing
                  ? "Processing..."
                  : depositMode === "cash"
                    ? "Cash Submit"
                    : "Proceed to Pay"}
              </Text>
            </Pressable>
            <Pressable onPress={closeDepositPopup} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={styles.laterText}>MAYBE LATER</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
};

export default PocketV2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SOFT_BG },
  bankBanner: { backgroundColor: SOFT_BG, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: alpha(colors.yellow[500], 0.2) },
  bankIcon: { width: 48, height: 48, backgroundColor: colors.black, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...shadow.lg },
  bankTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.black, marginBottom: 2 },
  bankText: { fontSize: 12, lineHeight: 16, color: alpha(colors.black, 0.8), fontWeight: '500' },
  bankBtn: { backgroundColor: SOFT_BG, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, ...shadow.sm },
  bankBtnText: { color: colors.black, fontWeight: '700', fontSize: 12, lineHeight: 16 },
  inner: { paddingHorizontal: 16, paddingVertical: 24, backgroundColor: colors.gray[100] },
  earningsCard: { backgroundColor: colors.white, borderRadius: 14, padding: 17.6, borderWidth: 1, borderColor: colors.gray[100], alignItems: 'center', marginBottom: 20, ...shadow.sm },
  earningsLabel: { color: colors.gray[500], fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8, textAlign: 'center' },
  earningsValueBox: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  earningsValue: { fontFamily: fonts.sora, fontSize: 36, lineHeight: 40, fontWeight: '900', color: colors.black, letterSpacing: -1.8 },
  offerCard: { backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: CARD_BORDER, marginBottom: 24, ...RX },
  offerHead: { backgroundColor: colors.black, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  offerTitle: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 18, fontWeight: '900', color: colors.white, marginBottom: 4 },
  offerValid: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400], letterSpacing: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PRIMARY },
  liveText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: PRIMARY },
  targetBox: { backgroundColor: alpha(colors.white, 0.1), paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: alpha(colors.white, 0.05) },
  targetAmount: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 18, fontWeight: '900', color: colors.white, marginBottom: 2 },
  targetOrders: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: colors.gray[400] },
  ringsRow: { padding: 32, paddingBottom: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 32 },
  ringBox: { width: 112, height: 112 },
  ringCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 20, fontWeight: '900', color: colors.black },
  ringSub: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: colors.gray[400], marginTop: 2 },
  ringEarned: { fontFamily: fonts.sora, fontSize: 16, lineHeight: 16, fontWeight: '900', color: colors.black },
  ringLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[500], letterSpacing: 1, marginTop: 16 },
  actionsCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, overflow: 'hidden', marginBottom: 24, ...RX },
  actionRow: { width: '100%', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.gray[50], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 },
  actionIcon: { width: 48, height: 48, backgroundColor: colors.gray[50], borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray[100] },
  actionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[800] },
  actionSub: { fontSize: 10, lineHeight: 14, color: colors.gray[400], fontWeight: '700', letterSpacing: -0.25 },
  actionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionValueBox: { minWidth: 72, alignItems: 'flex-end' },
  actionValue: { fontFamily: fonts.sora, fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.black },
  depositBtn: { width: '100%', paddingVertical: 16, backgroundColor: PRIMARY, borderRadius: 14, alignItems: 'center', ...shadow.lg },
  depositBtnText: { color: colors.white, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', gap: 16 },
  tile: { flex: 1, backgroundColor: colors.white, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, ...RX },
  tileBetween: { justifyContent: 'space-between' },
  tileIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1 },
  tileKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400], letterSpacing: 1, marginBottom: 6 },
  tileValue: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 20, fontWeight: '900', color: colors.black },
  tileSub: { fontSize: 9, lineHeight: 12, color: colors.gray[400], fontWeight: '700', letterSpacing: -0.2 },
  tileTitle: { fontSize: 14, lineHeight: 17.5, fontWeight: '700', color: colors.gray[800] },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 40, borderTopRightRadius: 40, maxHeight: '92%', ...shadow['2xl'] },
  sheetContent: { padding: 32, paddingBottom: 48 },
  handleBtn: { width: '100%', alignItems: 'center', paddingVertical: 12, marginBottom: 20, marginTop: -8 },
  handle: { width: 64, height: 6, backgroundColor: colors.gray[300], borderRadius: 9999 },
  pendingBox: { marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: colors.amber[200], backgroundColor: colors.amber[50], paddingHorizontal: 16, paddingVertical: 16 },
  pendingText: { fontSize: 14, lineHeight: 22.75, fontWeight: '700', color: colors.amber[900], textAlign: 'center' },
  pendingSub: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.amber[700], marginTop: 4, letterSpacing: 0.3, textAlign: 'center' },
  sheetIcon: { width: 80, height: 80, backgroundColor: PRIMARY_SOFT, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: PRIMARY_BORDER },
  sheetTitle: { fontFamily: fonts.sora, fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.black, marginBottom: 4 },
  sheetSub: { fontSize: 14, lineHeight: 20, color: colors.gray[400], fontWeight: '700', letterSpacing: 1.4 },
  depositBox: { backgroundColor: colors.gray[50], borderRadius: 16, padding: 17.6, marginBottom: 24, borderWidth: 1, borderColor: CARD_BORDER },
  cashRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cashLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.gray[400] },
  cashValue: { fontFamily: fonts.sora, fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.black },
  modeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  modeBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY, ...shadow.lg },
  modeBtnIdle: { backgroundColor: colors.white, borderColor: colors.gray[200] },
  modeText: { fontFamily: fonts.sora, fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 0.3 },
  inputIcon: { position: 'absolute', left: 16, zIndex: 1 },
  input: {
    width: '100%',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E8DEE7',
    borderRadius: 14,
    paddingVertical: 16,
    paddingLeft: 48,
    paddingRight: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#0F1724',
  },
  inputFocused: { borderColor: '#8AA4C5' },
  depositHint: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400], marginTop: 12, textAlign: 'center', letterSpacing: -0.25 },
  depositLockedHint: { marginTop: 10, fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.gray[500], textAlign: "center" },
  submitBtn: { width: '100%', paddingVertical: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  submitText: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  laterText: { color: colors.gray[400], fontWeight: '700', fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
});
