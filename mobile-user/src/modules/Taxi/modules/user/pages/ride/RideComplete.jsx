import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, CheckCircle2, ChevronRight, CreditCard, MessageSquare, Receipt, Share2, Star, Wallet } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Razorpay, loadRazorpayScript } from '@/lib/razorpay';
import { AppImage, Screen, Text, TextInput } from '@/native/ui';
import { alpha, colors, useTheme } from '@/theme';
import api from '../../../../shared/api/axiosInstance';
import { userAuthService } from '../../services/authService';
import { clearCurrentRide, getCurrentRide } from '../../services/currentRideService';
import carIcon from '../../../../assets/icons/car.png';
import bikeIcon from '../../../../assets/icons/bike.png';
import autoIcon from '../../../../assets/icons/auto.png';
import deliveryIcon from '../../../../assets/icons/Delivery.png';
import { useSettings } from '../../../../shared/context/SettingsContext';
import useUserPaymentSwitches from '@/shared/hooks/useUserPaymentSwitches';

const TIP_OPTIONS = [0, 20, 50, 100];
const PAYMENT_OPTIONS = [
  { id: 'cash', label: 'COD / Cash', sub: 'Pay driver directly', Icon: Banknote },
  { id: 'online', label: 'Online', sub: 'UPI, cards or Razorpay', Icon: CreditCard },
  { id: 'wallet', label: 'Wallet', sub: 'Use in-app wallet balance', Icon: Wallet },
];
const PAID_COLLECTION_STATUSES = new Set(['paid', 'captured', 'completed']);

// --user-* palette of modules/Taxi/index.css; the Taxi scope remaps bg-white / slate text / borders to it.
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
const ACCENT = '#FFC400';
const INK = '#0b1220';
// `.user-app-theme .shadow-*` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };
const CARD_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } };

const normalizePaymentChoice = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('wallet')) return 'wallet';
  if (normalized.includes('cash') || normalized.includes('cod')) return 'cash';
  return 'online';
};

const getInitials = (name = '') =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'DR';

const isLikelyVehiclePhoto = (value = '') => /^(https?:|data:image\/|blob:|\/uploads\/|\/images\/)/i.test(String(value || '').trim());
const isCollectionPaid = (collection = null) =>
  Boolean(collection?.paidAt) || PAID_COLLECTION_STATUSES.has(String(collection?.status || '').trim().toLowerCase());

const getVehicleIcon = (serviceType = 'ride', driver = {}) => {
  const customIcon = String(driver.vehicleIconUrl || driver.map_icon || driver.icon || '').trim();
  if (customIcon) return customIcon;

  const normalizedService = String(serviceType || '').toLowerCase();
  const iconType = String(driver.vehicleIconType || driver.vehicleType || '').toLowerCase();

  if (normalizedService === 'parcel') return deliveryIcon;
  if (iconType.includes('bike')) return bikeIcon;
  if (iconType.includes('auto')) return autoIcon;
  return carIcon;
};

// AnimatePresence fade (opacity, optional y) for the toast and the "feedback saved" overlay
const Presence = ({ visible, y = 0, style, pointerEvents, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(v, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, v]);
  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
};

const RideComplete = () => {
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const storedRide = useMemo(() => getCurrentRide(), []);
  const state = useMemo(() => location.state || storedRide || {}, [location.state, storedRide]);

  const [rating, setRating] = useState(() => Number(state.feedback?.rating || 0));
  const [comment, setComment] = useState(() => state.feedback?.comment || '');
  const [selectedTip, setSelectedTip] = useState(() => Number(state.feedback?.tipAmount || 0));
  // True once the rider touches rating / tip / note: the 5-second ride refresh must not overwrite their choice.
  const feedbackEditedRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(Boolean(state.feedback?.submittedAt));
  const [showSubmittedOverlay, setShowSubmittedOverlay] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [error, setError] = useState('');
  const [vehicleImageBroken, setVehicleImageBroken] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(() => normalizePaymentChoice(state.paymentMethod || 'Cash'));
  const [walletSnapshot, setWalletSnapshot] = useState({ balance: 0, currency: 'INR' });
  const [walletLoading, setWalletLoading] = useState(false);
  const [paymentCollection, setPaymentCollection] = useState(() => state.driverPaymentCollection || null);
  const [rideLiveStatus, setRideLiveStatus] = useState(() => String(state.liveStatus || state.status || '').toLowerCase());
  // Server copy of the ride: fills the receipt (tax, waiting charge, promo) and the driver card when the page was opened
  // without full state (e.g. from the "pay your previous ride" redirect).
  const [serverRide, setServerRide] = useState(null);
  const [tipSettings, setTipSettings] = useState({
    enable_tips: '1',
    min_tip_amount: '10',
  });
  const [noteFocused, setNoteFocused] = useState(false);

  const routeHome = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '/';
  const rideId = state.rideId || '';
  const fare = Number(serverRide?.fare ?? state.fare ?? 0);
  const paymentMethod = state.paymentMethod || 'Cash';
  // eslint-disable-next-line no-unused-vars
  const paymentMethodLabel = PAYMENT_OPTIONS.find((option) => option.id === selectedPaymentMethod)?.label || paymentMethod;
  // Global admin can switch customer wallet / online payment off for the whole app.
  const paySwitches = useUserPaymentSwitches();
  const payWithOptions = [
    { id: 'online', label: 'Online', sub: 'UPI, card or netbanking', enabled: paySwitches.online },
    { id: 'wallet', label: 'Wallet', sub: `Balance Rs ${Number(walletSnapshot.balance || 0).toFixed(2)}`, enabled: paySwitches.wallet },
  ].filter((option) => option.enabled);
  const selectedPayMethodUnavailable =
    selectedPaymentMethod !== 'cash' && !payWithOptions.some((option) => option.id === selectedPaymentMethod);

  useEffect(() => {
    if (selectedPayMethodUnavailable && payWithOptions.length) {
      setSelectedPaymentMethod(payWithOptions[0].id);
    }
  }, [selectedPayMethodUnavailable, payWithOptions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickup = serverRide?.pickupAddress || state.pickup || 'Pickup';
  const drop = serverRide?.dropAddress || state.drop || 'Drop';
  const serviceType = String(state.serviceType || state.type || 'ride').toLowerCase();
  // GET /rides/:id sends the driver populated under driverId
  const serverDriver = [serverRide?.driver, serverRide?.driverId].find((item) => item && typeof item === 'object' && item.name) || null;
  const driver = state.driver || (serverDriver ? {
    name: serverDriver.name || 'Captain',
    rating: serverDriver.rating || '',
    vehicle: serverDriver.vehicleType || 'Taxi',
    vehicleType: serverDriver.vehicleType || '',
    plate: serverDriver.vehicleNumber || 'Assigned',
    profileImage: serverDriver.profileImage || '',
    vehicleImage: serverDriver.vehicleImage || '',
  } : null) || {
    name: 'Captain',
    rating: '',
    vehicle: serviceType === 'parcel' ? 'Delivery' : 'Taxi',
    plate: 'Assigned',
    profileImage: '',
    vehicleImage: '',
  };

  const driverImage = driver.profileImage || '';
  const vehicleLabel = driver.vehicle || driver.vehicleType || (serviceType === 'parcel' ? 'Delivery' : 'Taxi');
  const hasVehiclePhoto = isLikelyVehiclePhoto(driver.vehicleImage) && !vehicleImageBroken;
  const vehicleVisual = hasVehiclePhoto ? driver.vehicleImage : getVehicleIcon(serviceType, {
    ...driver,
    vehicleIconUrl: driver.vehicleIconUrl || state.vehicleIconUrl || state.vehicle?.vehicleIconUrl || state.vehicle?.icon || '',
  });
  const totalBill = fare + Number(selectedTip || 0);
  // Same split as the ride detail page: price before the promo -> tax part + base, then waiting charge and promo lines.
  const receiptWaiting = Math.max(0, Number(serverRide?.waitingCharge?.amount || 0));
  const receiptDiscount = Math.max(0, Number(serverRide?.promo?.discount_amount || 0));
  const receiptTaxPercentRaw = serverRide?.pricingSnapshot?.service_tax;
  const receiptTaxPercent = receiptTaxPercentRaw === null || receiptTaxPercentRaw === undefined || receiptTaxPercentRaw === '' ? null : Number(receiptTaxPercentRaw);
  const receiptEarlierFee = Math.max(0, Number(serverRide?.cancellationDueCharge?.amount || 0));
  const receiptTaxable = Math.max(0, fare - receiptWaiting - receiptEarlierFee + receiptDiscount);
  const receiptTax = Number.isFinite(receiptTaxPercent) && receiptTaxPercent > 0
    ? Math.round((receiptTaxable - receiptTaxable / (1 + receiptTaxPercent / 100)) * 100) / 100
    : 0;
  const receiptBase = Math.round((receiptTaxable - receiptTax) * 100) / 100;
  const fareDueNow = isCollectionPaid(paymentCollection) ? 0 : fare;
  const payableNow = fareDueNow + Number(selectedTip || 0);
  const isRideFinalized = ['completed', 'delivered'].includes(rideLiveStatus) || Boolean(state.feedback?.submittedAt);
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);
  const availableTipOptions = useMemo(() => {
    if (!tipsEnabled) {
      return [0];
    }

    const nextOptions = [...new Set([0, minimumTipAmount, ...TIP_OPTIONS].filter((amount) => Number.isFinite(amount) && amount >= 0))]
      .sort((left, right) => left - right);

    return nextOptions;
  }, [minimumTipAmount, tipsEnabled]);
  const rideDate = new Date(state.completedAt || state.arrivedAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rideTime = new Date(state.completedAt || state.arrivedAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  useEffect(() => {
    const fetchTipSettings = async () => {
      try {
        const response = await api.get('/rides/app-settings/tip');
        const nextSettings = response?.data?.settings || response?.settings || {};
        setTipSettings((current) => ({
          ...current,
          ...nextSettings,
        }));
      } catch (tipError) {
        console.error('Failed to load tip settings:', tipError);
      }
    };

    fetchTipSettings();
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateCompletedRide = async () => {
      if (!rideId) return;

      try {
        const response = await api.get(`/rides/${rideId}`);
        const payload = response?.data?.data || response?.data || response || {};
        const feedback = payload?.feedback || null;
        const nextLiveStatus = String(payload?.liveStatus || payload?.status || '').toLowerCase();

        if (active) {
          setServerRide(payload || null);
          setPaymentCollection(payload?.driverPaymentCollection || null);
          setRideLiveStatus(nextLiveStatus);
        }

        if (!active || !feedback) {
          return;
        }

        // The server copy only replaces what is on screen once feedback was really submitted; before that it
        // holds defaults (no rating, no tip) and used to wipe the rider's selection every 5 seconds.
        if (feedback.submittedAt || !feedbackEditedRef.current) {
          setRating(Number(feedback.rating || 0));
          setComment(feedback.comment || '');
          setSelectedTip(Number(feedback.tipAmount || 0));
        }
        setIsSubmitted(Boolean(feedback.submittedAt));
      } catch (rideError) {
        console.error('Failed to refresh completed ride receipt:', rideError);
      }
    };

    hydrateCompletedRide();
    const refreshTimer = setInterval(() => {
      hydrateCompletedRide();
    }, 5000);

    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [rideId]);

  useEffect(() => {
    setVehicleImageBroken(false);
  }, [driver.vehicleImage]);

  useEffect(() => {
    let active = true;

    const loadWalletSnapshot = async () => {
      // Needed for the "Pay with" choice (online / wallet) shown while an online ride is still unpaid.
      if (selectedPaymentMethod === 'cash') {
        return;
      }

      try {
        setWalletLoading(true);
        const response = await userAuthService.getWallet();
        const wallet = response?.data?.wallet || response?.wallet || response?.data || response || {};

        if (!active) {
          return;
        }

        setWalletSnapshot({
          balance: Number(wallet.balance || 0),
          currency: wallet.currency || 'INR',
        });
      } catch (walletError) {
        if (!active) {
          return;
        }

        setWalletSnapshot((current) => ({
          ...current,
          balance: Number(current.balance || 0),
        }));
      } finally {
        if (active) {
          setWalletLoading(false);
        }
      }
    };

    loadWalletSnapshot();

    return () => {
      active = false;
    };
  }, [selectedPaymentMethod]);

  useEffect(() => {
    if (!tipsEnabled && selectedTip !== 0) {
      setSelectedTip(0);
      return;
    }

    if (
      tipsEnabled &&
      Number.isFinite(minimumTipAmount) &&
      minimumTipAmount > 0 &&
      selectedTip > 0 &&
      selectedTip < minimumTipAmount
    ) {
      setSelectedTip(minimumTipAmount);
    }
  }, [minimumTipAmount, selectedTip, tipsEnabled]);

  useEffect(() => {
    if (!rideId && !isSubmitted) {
      navigate(routeHome, { replace: true });
    }
  }, [isSubmitted, navigate, rideId, routeHome]);

  const handleShare = async () => {
    const text = `${appName} Receipt\n${rideDate} ${rideTime}\nDriver: ${driver.name}\nFrom: ${pickup}\nTo: ${drop}\nTotal: Rs ${totalBill}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${appName} Receipt`, text });
        return;
      } catch (_error) {
        return;
      }
    }

    navigator.clipboard?.writeText(text).then(() => {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2200);
    });
  };

  const submitFeedback = async () => {
    if (!rideId) {
      navigate(routeHome, { replace: true });
      return;
    }

    if (rating < 1) {
      setError('Please rate your driver before finishing.');
      return;
    }

    if (!isRideFinalized) {
      setError('Waiting for the driver to finish the trip. You can rate as soon as the ride is finalized.');
      return;
    }

    if (!tipsEnabled && Number(selectedTip || 0) > 0) {
      setError('Tips are currently disabled.');
      return;
    }

    if (tipsEnabled && Number(selectedTip || 0) > 0 && minimumTipAmount > 0 && Number(selectedTip || 0) < minimumTipAmount) {
      setError(`Minimum tip amount is Rs ${minimumTipAmount}.`);
      return;
    }

    if (selectedPayMethodUnavailable && Number(payableNow || 0) > 0) {
      setError('Online and wallet payments are currently unavailable. Please try again later.');
      return;
    }

    if (selectedPaymentMethod === 'wallet' && Number(payableNow || 0) > Number(walletSnapshot.balance || 0)) {
      setError('Wallet balance is too low for this payment amount.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      let response;

      const userInfo = (() => {
        try {
          return JSON.parse(localStorage.getItem('userInfo') || '{}');
        } catch {
          return {};
        }
      })();

      // Opens Razorpay for an order the backend created, then verifies it; resolves with the verify response.
      const payWithRazorpay = async ({ orderPath, verifyPath, description, cancelledMessage, failedMessage }) => {
        const scriptLoaded = await loadRazorpayScript();
        if (scriptLoaded === false) {
          throw new Error('Razorpay SDK failed to load');
        }

        const orderResponse = await api.post(orderPath, {
          rating,
          comment,
          tipAmount: selectedTip || 0,
        });
        const order = orderResponse?.data || orderResponse || {};

        if (!order.keyId || !order.orderId) {
          throw new Error('Unable to start the payment');
        }

        return new Promise((resolve, reject) => {
          const rzp = new Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency || 'INR',
            name: appName,
            description,
            order_id: order.orderId,
            prefill: {
              name: userInfo?.name || '',
              email: userInfo?.email || '',
              contact: userInfo?.phone ? `+91${userInfo.phone}` : '',
            },
            modal: {
              ondismiss: () => reject(new Error(cancelledMessage)),
            },
            handler: async (paymentResponse) => {
              try {
                const verifyResponse = await api.post(verifyPath, {
                  ...paymentResponse,
                  rating,
                  comment,
                  tipAmount: selectedTip || 0,
                });
                resolve(verifyResponse);
              } catch (verifyError) {
                reject(new Error(verifyError?.message || 'Payment verification failed'));
              }
            },
            theme: {
              color: '#0f172a',
            },
          });

          rzp.on('payment.failed', (event) => {
            reject(new Error(event?.error?.description || event?.error?.reason || failedMessage));
          });

          rzp.open();
        });
      };

      if (Number(payableNow || 0) > 0 && selectedPaymentMethod === 'online') {
        response = await payWithRazorpay({
          orderPath: `/rides/${rideId}/complete-payment/razorpay/order`,
          verifyPath: `/rides/${rideId}/complete-payment/razorpay/verify`,
          description: `Ride payment for ${driver.name || 'driver'}`,
          cancelledMessage: 'Ride payment was cancelled',
          failedMessage: 'Ride payment failed',
        });
      } else if (Number(payableNow || 0) > 0 && selectedPaymentMethod === 'wallet') {
        response = await api.post(`/rides/${rideId}/complete-payment/wallet`, {
          rating,
          comment,
          tipAmount: selectedTip || 0,
        });
      } else if (Number(selectedTip || 0) > 0) {
        // Cash ride: the fare went to the driver in cash, the tip is paid online straight into the driver's wallet.
        response = await payWithRazorpay({
          orderPath: `/rides/${rideId}/tip/razorpay/order`,
          verifyPath: `/rides/${rideId}/tip/razorpay/verify`,
          description: `Tip for ${driver.name || 'driver'}`,
          cancelledMessage: 'Tip payment was cancelled',
          failedMessage: 'Tip payment failed',
        });
      } else {
        response = await api.patch(`/rides/${rideId}/feedback`, {
          rating,
          comment,
          tipAmount: 0,
        });
      }

      const payload = response?.data?.data || response?.data || response;
      if (payload?.feedback) {
        setRating(Number(payload.feedback.rating || rating));
        setComment(payload.feedback.comment || comment);
        setSelectedTip(Number(payload.feedback.tipAmount || 0));
      }
      if (payload?.driverPaymentCollection) {
        setPaymentCollection(payload.driverPaymentCollection);
      }
      setIsSubmitted(true);
      setShowSubmittedOverlay(true);
      clearCurrentRide();
    } catch (submitError) {
      setError(submitError?.message || 'Could not submit feedback right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const receiptLine = (label, value, color, key) => (
    <View key={key} style={[styles.lineRow, { marginTop: 8 }]}>
      <Text style={[styles.lineLabel, { color: color || p.muted }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: color || p.text }]}>{value}</Text>
    </View>
  );

  const submitDisabled = isSubmitting || isSubmitted || !isRideFinalized;
  const box = { borderColor: p.border, backgroundColor: p.card };

  return (
    <Screen bg={p.bg} edges={['top']}>
      <Presence visible={shareToast} y={-12} pointerEvents="none" style={[styles.toast, SH, { top: insets.top + 16, backgroundColor: p.card }]}>
        <Text style={[styles.toastText, { color: p.text }]}>Receipt copied</Text>
      </Presence>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {state.unpaidNotice && fareDueNow > 0 ? (
          <View style={[styles.unpaid, { backgroundColor: p.soft }]}>
            <Text style={styles.unpaidText}>{state.unpaidNotice} Pay below, then you can book again.</Text>
          </View>
        ) : null}
        <View style={styles.titleRow}>
          <View style={[styles.doneCircle, styles.doneGlow]}>
            <CheckCircle2 size={24} color={p.text} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.kicker, { color: p.sec }]}>
              {(isRideFinalized
                ? (serviceType === 'parcel' ? 'Delivery Completed' : 'Ride Completed')
                : 'Reached Destination').toUpperCase()}
            </Text>
            <Text style={[styles.h1, { color: p.text }]}>
              {isRideFinalized
                ? (serviceType === 'parcel' ? 'Package delivered' : 'You have arrived')
                : (serviceType === 'parcel' ? 'Package reached destination' : 'Driver reached destination')}
            </Text>
          </View>
        </View>

        {!isRideFinalized ? (
          <View style={styles.finalizing}>
            <Text style={styles.finalizingKicker}>FINALIZING TRIP</Text>
            <Text style={styles.finalizingText}>
              The driver has marked destination arrival. This page will unlock rating and payment as soon as the trip is finalized.
            </Text>
          </View>
        ) : null}

        <View style={[styles.receipt, CARD_SHADOW, box]}>
          <View style={[styles.receiptHead, { backgroundColor: p.card }]}>
            <View style={[styles.row, { gap: 10 }]}>
              <View style={[styles.receiptIcon, { backgroundColor: p.soft }]}>
                <Receipt size={14} color={colors.orange[300]} />
              </View>
              <View>
                <Text style={[styles.receiptTitle, { color: p.text }]}>Trip Receipt</Text>
                <Text style={[styles.receiptDate, { color: p.sec }]}>{rideDate} · {rideTime}</Text>
              </View>
            </View>
            <Pressable onPress={handleShare} style={[styles.shareBtn, { backgroundColor: p.soft }]}>
              <Share2 size={12} color={p.text} />
              <Text style={[styles.shareText, { color: p.text }]}>Share</Text>
            </Pressable>
          </View>

          <View style={{ gap: 16, paddingHorizontal: 16, paddingVertical: 16 }}>
            <View style={[styles.driverRow, { borderColor: p.border, backgroundColor: p.soft }]}>
              <View style={[styles.driverAvatar, { borderColor: p.border, backgroundColor: p.soft }]}>
                {driverImage ? (
                  <AppImage src={driverImage} accessibilityLabel={driver.name} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <View style={[styles.initials, { backgroundColor: p.card }]}>
                    <Text style={[styles.initialsText, { color: p.text }]}>{getInitials(driver.name)}</Text>
                  </View>
                )}
              </View>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text numberOfLines={1} style={[styles.driverName, { color: p.text }]}>{driver.name}</Text>
                <Text numberOfLines={1} style={[styles.driverSub, { color: p.muted }]}>
                  {driver.vehicleNumber || driver.plate || 'Assigned'} · {vehicleLabel}
                </Text>
                <View style={[styles.ratingPill, { backgroundColor: p.soft }]}>
                  <Star size={10} color={colors.yellow[500]} fill={colors.yellow[500]} />
                  <Text style={[styles.ratingText, { color: p.text }]}>{driver.rating || 'New'}</Text>
                </View>
              </View>
              <View style={[styles.vehicleBox, { borderColor: p.border, backgroundColor: p.card }]}>
                <AppImage
                  src={vehicleVisual}
                  accessibilityLabel={vehicleLabel}
                  contentFit={hasVehiclePhoto ? 'contain' : 'cover'}
                  style={[{ width: '100%', height: '100%' }, hasVehiclePhoto && { backgroundColor: p.card }]}
                  onError={() => setVehicleImageBroken(true)}
                />
              </View>
            </View>

            <View style={[styles.innerBox, box]}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center', paddingTop: 4 }}>
                  <View style={[styles.routeDot, { backgroundColor: colors.emerald[500] }]} />
                  <View style={[styles.routeLine, { borderColor: p.border }]} />
                  <View style={[styles.routeDot, { backgroundColor: colors.orange[500] }]} />
                </View>
                <View style={{ minWidth: 0, flex: 1, gap: 12 }}>
                  <View>
                    <Text style={[styles.place, { color: p.text }]}>{pickup}</Text>
                    <Text style={[styles.placeLabel, { color: p.sec }]}>PICKUP</Text>
                  </View>
                  <View>
                    <Text style={[styles.place, { color: p.text }]}>{drop}</Text>
                    <Text style={[styles.placeLabel, { color: p.sec }]}>DROP</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.innerBox, box]}>
              <View style={styles.lineRow}>
                <Text style={[styles.lineLabel, { color: p.muted }]}>Ride fare</Text>
                <Text style={[styles.lineValue, { color: p.text }]}>Rs {receiptBase.toFixed(2)}</Text>
              </View>
              {receiptTax > 0 ? receiptLine(`Taxes & fees (${receiptTaxPercent}%)`, `Rs ${receiptTax.toFixed(2)}`, null, 'tax') : null}
              {receiptWaiting > 0 ? receiptLine(`Waiting charge (${Number(serverRide?.waitingCharge?.minutes || 0)} min)`, `Rs ${receiptWaiting.toFixed(2)}`, null, 'wait') : null}
              {receiptEarlierFee > 0 ? receiptLine('Earlier cancellation fee', `Rs ${receiptEarlierFee.toFixed(2)}`, null, 'fee') : null}
              {receiptDiscount > 0 ? receiptLine(`Promo ${serverRide?.promo?.code || ''}`, `- Rs ${receiptDiscount.toFixed(2)}`, colors.emerald[600], 'promo') : null}
              {receiptLine('Tip', `Rs ${Number(selectedTip || 0).toFixed(2)}`, null, 'tip')}
              <View style={[styles.lineRow, styles.totalRow, { borderTopColor: p.border }]}>
                <Text style={[styles.totalLabel, { color: p.text }]}>Total</Text>
                <Text style={[styles.totalValue, { color: p.text }]}>Rs {totalBill.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </View>

        {!isSubmitted && selectedPaymentMethod !== 'cash' && fareDueNow > 0 ? (
          <View style={[styles.panel, CARD_SHADOW, box]}>
            <Text style={[styles.panelKicker, { color: p.sec }]}>PAY WITH</Text>
            <View style={styles.payGrid}>
              {payWithOptions.map((option) => {
                const selected = selectedPaymentMethod === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => { setSelectedPaymentMethod(option.id); setError(''); }}
                    style={[styles.payOption, selected ? { borderColor: colors.orange[500], backgroundColor: p.soft } : { borderColor: p.border, backgroundColor: p.card }]}
                  >
                    <Text style={[styles.payLabel, { color: p.text }]}>{option.label}</Text>
                    <Text style={[styles.paySub, { color: p.muted }]}>{walletLoading && option.id === 'wallet' ? 'Checking balance...' : option.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!payWithOptions.length ? (
              <Text style={styles.payError}>Online and wallet payments are currently unavailable. Please try again later.</Text>
            ) : null}
            {selectedPaymentMethod === 'wallet' && Number(payableNow || 0) > Number(walletSnapshot.balance || 0) ? (
              <Text style={styles.payError}>
                Wallet balance is lower than Rs {Number(payableNow || 0).toFixed(2)}. Add money in Wallet or pay online.
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.panel, CARD_SHADOW, box]}>
          {isSubmitted ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.panelKicker, { color: colors.emerald[500] }]}>FEEDBACK SUBMITTED</Text>
              <Text style={[styles.submittedText, { color: p.muted }]}>
                Rating: {rating || 0}/5 {selectedTip > 0 ? `| Tip added: Rs ${Number(selectedTip || 0).toFixed(2)}` : '| No tip added'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.panelKicker, { color: p.sec }]}>
                {(tipsEnabled ? 'Tip your driver' : 'Driver tips disabled').toUpperCase()}
              </Text>
              {tipsEnabled && minimumTipAmount > 0 ? (
                <Text style={[styles.minTip, { color: p.muted }]}>Minimum tip amount: Rs {minimumTipAmount}</Text>
              ) : null}
              <View style={styles.tips}>
                {availableTipOptions.map((amount) => {
                  const selected = selectedTip === amount;
                  const disabled = !tipsEnabled && amount > 0;
                  return (
                    <Pressable
                      key={amount}
                      onPress={() => {
                        feedbackEditedRef.current = true;
                        setSelectedTip(amount);
                        setError('');
                      }}
                      disabled={disabled}
                      style={[
                        styles.tipChip,
                        selected ? [styles.tipSelected, { backgroundColor: ACCENT }] : { borderColor: p.border, backgroundColor: p.card },
                        disabled && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={[styles.tipText, { color: selected ? INK : p.sec }]}>{amount === 0 ? 'No tip' : `Rs ${amount}`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View style={[styles.panel, CARD_SHADOW, box, { alignItems: 'stretch' }]}>
          <Text style={[styles.question, { color: p.text }]}>How was your trip with {driver.name?.split(' ')[0] || 'your driver'}?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((value) => {
              const on = rating >= value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    feedbackEditedRef.current = true;
                    setRating(value);
                    setError('');
                  }}
                  disabled={isSubmitted}
                  style={[styles.starBtn, on ? [styles.starOn, { backgroundColor: ACCENT }] : { backgroundColor: p.soft }]}
                >
                  <Star size={19} color={on ? p.text : p.sec} fill={on ? '#ffffff' : 'none'} />
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.noteBox, { borderColor: p.border, backgroundColor: p.soft }]}>
            <View style={styles.noteHead}>
              <MessageSquare size={14} color={p.sec} />
              <Text style={[styles.noteLabel, { color: p.sec }]}>ADD A NOTE</Text>
            </View>
            <TextInput
              value={comment}
              onChangeText={(value) => { feedbackEditedRef.current = true; setComment(value); }}
              multiline
              numberOfLines={3}
              maxLength={500}
              editable={!isSubmitted}
              placeholder="Tell us about the trip"
              placeholderTextColor={colors.slate[300]}
              textAlignVertical="top"
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              style={[styles.note, { borderColor: noteFocused ? ACCENT : p.border, backgroundColor: p.card, color: p.text }]}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={submitFeedback}
            disabled={submitDisabled}
            style={[styles.submit, styles.submitShadow, submitDisabled && { opacity: 0.6 }]}
          >
            <Text style={styles.submitText}>
              {isSubmitting
                ? 'Saving your feedback...'
                : isSubmitted
                  ? 'Feedback already saved'
                  : !isRideFinalized
                    ? 'Waiting for driver to finalize trip'
                  : 'Submit rating'}
            </Text>
            <ChevronRight size={16} color={INK} />
          </Pressable>

          <Pressable
            onPress={() => {
              clearCurrentRide();
              navigate(routeHome, { replace: true });
            }}
            style={{ marginTop: 12, alignSelf: 'center' }}
          >
            <Text style={[styles.skip, { color: p.muted }]}>Skip and go home</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Presence visible={showSubmittedOverlay} style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: p.card }]}>
        <View style={[styles.overlayCircle, styles.doneGlowLg]}>
          <CheckCircle2 size={30} color={p.text} />
        </View>
        <Text style={[styles.overlayTitle, { color: p.text }]}>Thanks for rating your driver</Text>
        <Text style={[styles.overlaySub, { color: p.muted }]}>Your feedback has been saved successfully.</Text>
        <Pressable onPress={() => navigate(routeHome, { replace: true })} style={[styles.continueBtn, styles.submitShadow]}>
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      </Presence>
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', zIndex: 50, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  toastText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 40, gap: 16 },
  unpaid: { borderRadius: 16, borderWidth: 1, borderColor: colors.amber[200], paddingHorizontal: 16, paddingVertical: 12 },
  unpaidText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.amber[800] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.emerald[500], alignItems: 'center', justifyContent: 'center' },
  doneGlow: { elevation: 6, shadowColor: '#10b981', shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  doneGlowLg: { elevation: 8, shadowColor: '#10b981', shadowOpacity: 0.28, shadowRadius: 25, shadowOffset: { width: 0, height: 10 } },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.2 },
  h1: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  finalizing: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.amber[100],
    backgroundColor: alpha(colors.amber[50], 0.9),
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#f59e0b',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  finalizingKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8, color: colors.amber[700] },
  finalizingText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.amber[900], textAlign: 'center' },
  receipt: { overflow: 'hidden', borderRadius: 22, borderWidth: 1 },
  receiptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  receiptIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  receiptTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  receiptDate: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
  shareText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 12 },
  driverAvatar: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  initials: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  driverName: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  driverSub: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  ratingPill: { marginTop: 4, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
  ratingText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  vehicleBox: { width: 64, height: 56, borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  innerBox: { borderRadius: 18, borderWidth: 1, padding: 12 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { height: 40, borderLeftWidth: 1, borderStyle: 'dashed' },
  place: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  placeLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4 },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  lineValue: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  totalRow: { marginTop: 12, borderTopWidth: 1, paddingTop: 12 },
  totalLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  totalValue: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  panel: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 },
  panelKicker: { textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.2 },
  payGrid: { marginTop: 12, flexDirection: 'row', gap: 8 },
  payOption: { flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  payLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  paySub: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  payError: { marginTop: 8, textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.red[500] },
  submittedText: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  minTip: { marginTop: 8, textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  tips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  tipChip: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  tipSelected: { borderColor: colors.orange[500], elevation: 4, shadowColor: '#f97316', shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  tipText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  question: { fontSize: 16, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  stars: { marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  starBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  starOn: { elevation: 4, shadowColor: '#f97316', shadowOpacity: 0.24, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  noteBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  noteHead: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.5 },
  note: { width: '100%', minHeight: 76, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '600' },
  error: { marginTop: 12, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.red[500], textAlign: 'center' },
  submit: { marginTop: 16, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: ACCENT, paddingVertical: 14 },
  submitShadow: { elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  submitText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: INK },
  skip: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  overlay: { zIndex: 50, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  overlayCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.emerald[500], alignItems: 'center', justifyContent: 'center' },
  overlayTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  overlaySub: { fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  continueBtn: { marginTop: 8, borderRadius: 16, backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 12 },
  continueText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: INK },
});

export default RideComplete;
