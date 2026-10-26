// Web: components/modals/DeliveryVerificationModal.jsx — the drop verification steps: 1) the 4-digit handover code
// (deliveryAPI.verifyDropOtp), 2) for cash / COD orders the payment panel (Show Payment QR = createCollectQr + 5 s
// getPaymentStatus polling, or Cash Payment) and 3) "Slide to Complete". Same steps, texts, API calls and rules.
// Native: each step is an absolute panel inside the Feed screen that ends above the bottom bar (web: fixed
// bottom-[104px]); a tap on the dim backdrop closes it like the web. Keyboard: the OTP panel rides on the keyboard
// (useKeyboardOffset) so the four code boxes stay above it while typing. The QR popup is a Dialog (web: fixed inset-0
// bg-black/80).
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ActivityIndicator, Animated, Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldCheck, DollarSign, CheckCircle2,
  QrCode, X, RefreshCw, Package,
} from 'lucide-react-native';
import { AppImage, Dialog, Text, TextInput, useBottomNavSpace } from '@/native/ui';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';
import { toast } from '@/lib/toast';
import { deliveryAPI } from '@food/api';
import { showUserFacingApiError } from '@/shared/utils/apiError';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import useKeyboardOffset from '@/modules/Taxi/shared/hooks/useKeyboardOffset';

const roundedShadow = {
  elevation: 3,
  shadowColor: '#112743',
  shadowOpacity: 0.24,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 10 },
};

const Backdrop = ({ onClose }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [opacity]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
    </Animated.View>
  );
};

/** The panel frame shared by the three steps (web: fixed inset-x-0 top-0 bottom-[104px] ... + the white sheet). */
const StepPanel = ({ onClose, children, liftWithKeyboard = false }) => {
  const navBottom = useBottomNavSpace(8);
  const keyboard = useKeyboardOffset();
  const bottom = liftWithKeyboard && keyboard > 0 ? Math.max(navBottom, keyboard + 8) : navBottom;
  const slide = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }).start();
  }, [slide]);
  const maxHeight = Dimensions.get('window').height - bottom - 28; // web: max-h-[calc(100dvh-132px)]

  return (
    <View style={[styles.stepLayer, { bottom }]} pointerEvents="box-none">
      <Backdrop onClose={onClose} />
      <Animated.View style={[styles.sheet, { maxHeight, transform: [{ translateY: slide }] }]}>
        <ScrollView contentContainerStyle={styles.sheetContent} bounces={false} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const DeliveryInstructionsPanel = ({ note }) => {
  const text = String(note || '').trim();
  if (!text) return null;

  return (
    <View style={styles.instructions}>
      <LinearGradient colors={['#15498B', '#040C17']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.instructionsHead}>
        <View style={styles.instructionsHeadRow}>
          <View style={styles.instructionsIcon}>
            <Package size={20} color={colors.white} />
          </View>
          <View>
            <Text style={styles.instructionsKicker}>Delivery instruction</Text>
            <Text style={styles.instructionsSub}>Read before handover</Text>
          </View>
        </View>
      </LinearGradient>
      <View style={styles.instructionsBody}>
        <Text style={styles.instructionsText}>{`“${text}”`}</Text>
      </View>
    </View>
  );
};

const OtpModal = ({ order, onVerified, onClose }) => {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  // a wrong code is shown right under the boxes (a toast alone was easy to miss behind this sheet)
  const [otpError, setOtpError] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref0 = useRef(null);
  const ref1 = useRef(null);
  const ref2 = useRef(null);
  const ref3 = useRef(null);
  const inputRefs = [ref0, ref1, ref2, ref3];

  useEffect(() => {
    const savedCode = order?.deliveryVerification?.dropOtp?.code;
    if (savedCode && String(savedCode).length === 4) {
      setOtp(String(savedCode).split(''));
    }
    const timer = setTimeout(() => {
      ref0.current?.focus();
    }, 500);
    return () => clearTimeout(timer);
  }, [order?.deliveryVerification?.dropOtp?.code]);

  const orderId = order.orderId || order._id || 'ORD';

  const handleOtpChange = (index, value) => {
    if (value && !/^\d+$/.test(value)) return;
    if (otpError) setOtpError('');
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);
    if (value && index < 3) inputRefs[index + 1].current?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.nativeEvent?.key === 'Backspace' && !otp[index] && index > 0) inputRefs[index - 1].current?.focus();
  };

  const verifyOtp = async () => {
    const otpString = otp.join('');
    if (otpString.length < 4) return;
    setIsVerifyingOtp(true);
    setOtpError('');
    try {
      const res = await deliveryAPI.verifyDropOtp(orderId, otpString);
      if (res?.data?.success) {
        setIsOtpVerified(true);
        setTimeout(() => onVerified(otpString), 600);
      }
    } catch (err) {
      const apiMessage = err?.response?.data?.message || err?.message || '';
      setOtpError(/otp|code|invalid|incorrect|wrong/i.test(apiMessage) && apiMessage ? apiMessage : 'Wrong code. Ask the customer for the 4-digit delivery code and try again.');
      showUserFacingApiError(err, 'Invalid OTP entered');
      throw err;
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const isAlreadyVerified = order?.deliveryVerification?.dropOtp?.verified;
  const invalid = Boolean(otpError) && !isOtpVerified;

  return (
    <StepPanel onClose={onClose} liftWithKeyboard>
      <View style={styles.grabber} />
      <View style={styles.stepHeader}>
        <View style={styles.stepHeaderLeft}>
          <View style={[styles.stepIcon, isOtpVerified ? styles.stepIconOk : styles.stepIconIdle]}>
            <ShieldCheck size={28} color={isOtpVerified ? deliveryTheme.primary : colors.gray[500]} />
          </View>
          <View>
            <Text style={styles.stepTitle}>Handover Code</Text>
            <Text style={styles.stepSub}>Step 1 of Verification</Text>
          </View>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <X size={20} color={colors.gray[400]} />
        </Pressable>
      </View>

      <DeliveryInstructionsPanel note={order?.note} />

      <View style={styles.otpRow}>
        {otp.map((digit, i) => (
          <TextInput
            key={i}
            ref={inputRefs[i]}
            keyboardType="number-pad"
            editable={!isOtpVerified}
            value={digit}
            onChangeText={(text) => handleOtpChange(i, text)}
            onKeyPress={(e) => handleKeyDown(i, e)}
            onFocus={() => setFocusedIndex(i)}
            onBlur={() => setFocusedIndex((cur) => (cur === i ? -1 : cur))}
            selectTextOnFocus
            textAlign="center"
            style={[
              styles.otpInput,
              isOtpVerified && styles.otpInputVerified,
              focusedIndex === i && !invalid && styles.otpInputFocused,
              invalid && styles.otpInputInvalid,
            ]}
          />
        ))}
      </View>
      {otpError ? (
        <Text accessibilityRole="alert" style={styles.otpError}>{otpError}</Text>
      ) : null}

      <ActionSlider
        key="action-otp"
        label={isVerifyingOtp ? 'Verifying...' : isAlreadyVerified ? 'Code already verified ✓' : 'Slide to Verify OTP'}
        successLabel="Verified!"
        disabled={otp.some((d) => !d) || isVerifyingOtp || isOtpVerified || isAlreadyVerified}
        onConfirm={verifyOtp}
        color="bg-gray-900"
      />
    </StepPanel>
  );
};

const PaymentModal = ({ order, otpString, onComplete, onClose }) => {
  const [showQrModal, setShowQrModal] = useState(false);
  const [collectQrLink, setCollectQrLink] = useState(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const isInitialPaid = ['paid', 'captured', 'authorized'].includes(String(order.payment?.status || '').toLowerCase());
  const [paymentStatus, setPaymentStatus] = useState(isInitialPaid ? 'paid' : 'idle');
  const [isSyncing, setIsSyncing] = useState(false);
  const pollingRef = useRef(null);

  const orderId = order.orderId || order._id || 'ORD';
  const amountToCollect = order.pricing?.total || order.amountToCollect || 0;

  const checkPaymentSync = useCallback(async () => {
    try {
      const res = await deliveryAPI.getPaymentStatus(orderId);
      const data = res?.data?.data || res?.data || {};
      const status = String(data?.payment?.status || '').toLowerCase();
      if (['paid', 'captured', 'authorized'].includes(status)) {
        setPaymentStatus('paid');
        if (pollingRef.current) clearInterval(pollingRef.current);
        setShowQrModal(false);
      }
    } catch (e) { /* next poll tries again */ }
  }, [orderId]);

  const handleManualCheck = async () => {
    setIsSyncing(true);
    await checkPaymentSync();
    setTimeout(() => setIsSyncing(false), 800);
  };

  useEffect(() => {
    if (paymentStatus === 'pending' || (amountToCollect > 0 && paymentStatus !== 'paid')) {
      pollingRef.current = setInterval(checkPaymentSync, 5000);
    }
    return () => clearInterval(pollingRef.current);
  }, [paymentStatus, amountToCollect, checkPaymentSync]);

  const generateQr = async () => {
    setIsGeneratingQr(true);
    try {
      const res = await deliveryAPI.createCollectQr(orderId, {
        name: order.userName || 'Customer',
        phone: order.userPhone || '',
      });
      const data = res?.data?.data || res?.data || {};
      const link = data.imageUrl || data.shortUrl || data.image || null;
      if (link) {
        setCollectQrLink(link);
        setPaymentStatus('pending');
        setShowQrModal(true);
      } else {
        toast.error('Could not generate QR code');
      }
    } catch (e) {
      showUserFacingApiError(e, 'QR Generation failed');
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const isPaid = paymentStatus === 'paid';
  const [isCashPayment, setIsCashPayment] = useState(false);

  // Toggle handlers
  const handleCashSelection = () => {
    setIsCashPayment(true);
  };

  const handleQrSelection = () => {
    setIsCashPayment(false);
    generateQr();
  };

  const qrIsImage = collectQrLink?.startsWith('http') || collectQrLink?.startsWith('data:');
  const qrActive = !isCashPayment && paymentStatus === 'pending';

  return (
    <>
      <StepPanel onClose={onClose}>
        <View style={styles.grabber} />
        <View style={styles.stepHeader}>
          <View style={styles.stepHeaderLeft}>
            <View style={[styles.stepIcon, isPaid ? styles.stepIconOk : styles.stepIconAmber]}>
              <DollarSign size={28} color={isPaid ? deliveryTheme.primary : colors.amber[600]} />
            </View>
            <View>
              <Text style={styles.stepTitle}>Collect Payment</Text>
              <Text style={styles.stepSub}>Step 2 of Verification</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={colors.gray[400]} />
          </Pressable>
        </View>

        <DeliveryInstructionsPanel note={order?.note} />

        <View style={styles.payBox}>
          <View style={styles.payTop}>
            <View>
              <Text style={styles.payKicker}>{isPaid ? 'Amount Paid Online' : 'Cash to Collect'}</Text>
              <Text style={styles.payAmount}>{`₹${amountToCollect.toFixed(2)}`}</Text>
            </View>
            {isPaid ? (
              <View style={styles.paidPill}>
                <Text style={styles.paidPillText}>PAID ✓</Text>
              </View>
            ) : null}
          </View>

          {!isPaid ? (
            <View style={styles.payBtns}>
              <Pressable
                onPress={handleQrSelection}
                disabled={isGeneratingQr}
                style={[styles.payBtn, qrActive ? styles.payBtnQrActive : styles.payBtnIdle]}
              >
                {isGeneratingQr ? <ActivityIndicator size={16} color={colors.amber[800]} /> : <QrCode size={20} color={qrActive ? colors.amber[900] : colors.amber[800]} />}
                <Text style={[styles.payBtnText, { color: qrActive ? colors.amber[900] : colors.amber[800] }]}>
                  {paymentStatus === 'pending' && !isCashPayment ? 'QR Active - Waiting...' : 'Show Payment QR'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleCashSelection}
                style={[styles.payBtn, isCashPayment ? styles.payBtnCash : styles.payBtnIdle]}
              >
                <DollarSign size={20} color={isCashPayment ? colors.white : colors.amber[800]} />
                <Text style={[styles.payBtnText, { color: isCashPayment ? colors.white : colors.amber[800] }]}>Cash Payment</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* If the driver collects physical cash, they can directly slide this, bypassing QR. Unless cash is selected or it's paid, lock slider. */}
        <ActionSlider
          key="action-payment"
          label={isCashPayment ? 'Slide to Confirm Cash' : 'Slide to Complete Order'}
          successLabel="Delivered! ✓"
          disabled={!isPaid && !isCashPayment}
          onConfirm={async () => {
            // Pass the payment method to completion if needed (a failure resets the slider)
            await onComplete(otpString, isCashPayment ? 'cash' : 'qr');
          }}
          color="bg-green-600"
        />
      </StepPanel>

      <Dialog open={showQrModal} onClose={() => setShowQrModal(false)} backdropOpacity={0.8} style={styles.qrDialog}>
        <View style={styles.qrCard}>
          <Text style={styles.qrTitle}>Scan to Pay</Text>
          <Text style={styles.qrSub}>{`Order Total: ₹${amountToCollect.toFixed(2)}`}</Text>
          <View style={styles.qrWrap}>
            <View style={styles.qrFrame}>
              {collectQrLink ? (
                qrIsImage ? (
                  <View style={styles.qrCropBox}>
                    <AppImage
                      src={collectQrLink}
                      contentFit="cover"
                      style={[StyleSheet.absoluteFill, styles.qrImageCropped]}
                      accessibilityLabel="Razorpay QR"
                    />
                  </View>
                ) : (
                  <AppImage
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(collectQrLink)}`}
                    contentFit="contain"
                    style={styles.qrImagePlain}
                    accessibilityLabel="Razorpay QR"
                  />
                )
              ) : null}
            </View>
            <Pressable
              onPress={handleManualCheck}
              disabled={isSyncing}
              style={({ pressed }) => [styles.checkBtn, isSyncing && styles.disabled, pressed && styles.pressed]}
            >
              {isSyncing ? <ActivityIndicator size={16} color={colors.white} /> : <RefreshCw size={16} color={colors.white} />}
              <Text style={styles.checkBtnText}>Check Payment Status</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => setShowQrModal(false)} style={({ pressed }) => [styles.closeQrBtn, pressed && styles.pressed]}>
            <Text style={styles.closeQrText}>Close QR</Text>
          </Pressable>
        </View>
      </Dialog>
    </>
  );
};

export const DeliveryVerificationModal = ({ order, onComplete, onClose }) => {
  const alreadyVerified = !!order?.deliveryVerification?.dropOtp?.verified;
  const paymentMethod = (
    order?.paymentMethod ||
    order?.payment?.method ||
    order?.transaction?.payment?.method ||
    order?.transaction?.paymentMethod ||
    'cod'
  ).toLowerCase();
  const isCod = ['cash', 'cod', 'cash_on_delivery', 'razorpay_qr'].includes(paymentMethod);

  // Determine initial step: skip OTP if already verified
  const [step, setStep] = useState(() => {
    if (alreadyVerified) {
      return isCod ? 'payment' : 'complete';
    }
    return 'otp';
  });
  const [verifiedOtp, setVerifiedOtp] = useState(alreadyVerified ? (order.deliveryVerification.dropOtp.code || '') : '');

  const handleOtpVerified = (otpValue) => {
    setVerifiedOtp(otpValue);
    // After OTP is verified: COD → show payment panel, Online → show complete button
    setStep(isCod ? 'payment' : 'complete');
  };

  // If OTP was already verified on mount and it's a non-COD order, auto-complete
  useEffect(() => {
    if (step === 'complete' && !isCod) {
      onComplete(verifiedOtp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  if (!order) return null;

  const close = onClose || (() => { });

  if (step === 'otp') {
    return <OtpModal key="otp-modal" order={order} onVerified={handleOtpVerified} onClose={close} />;
  }
  if (step === 'payment') {
    return <PaymentModal key="payment-modal" order={order} otpString={verifiedOtp} onComplete={onComplete} onClose={close} />;
  }
  if (step === 'complete') {
    return (
      <StepPanel key="complete-modal" onClose={close}>
        <View style={styles.grabber} />
        <View style={[styles.stepHeaderLeft, styles.completeHeader]}>
          <View style={[styles.stepIcon, styles.stepIconOk]}>
            <CheckCircle2 size={28} color={deliveryTheme.primary} />
          </View>
          <View>
            <Text style={styles.stepTitle}>OTP Verified</Text>
            <Text style={[styles.stepSub, { color: deliveryTheme.primary }]}>Payment Received Online</Text>
          </View>
        </View>
        <ActionSlider
          key="action-complete"
          label="Slide to Complete Delivery"
          successLabel="Delivered! ✓"
          onConfirm={async () => {
            await onComplete(verifiedOtp);
          }}
          color="bg-green-600"
        />
      </StepPanel>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: alpha(colors.black, 0.4) },
  stepLayer: { position: 'absolute', left: 0, right: 0, top: 0, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: -20 },
  },
  sheetContent: { padding: 16, paddingBottom: 24 },
  grabber: { width: 48, height: 6, backgroundColor: colors.gray[200], borderRadius: 9999, alignSelf: 'center', marginBottom: 24 },
  stepHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  stepHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  completeHeader: { marginBottom: 32 },
  stepIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  stepIconOk: { backgroundColor: colors.green[100] },
  stepIconIdle: { backgroundColor: colors.gray[100] },
  stepIconAmber: { backgroundColor: colors.amber[100] },
  stepTitle: { fontSize: 20, lineHeight: 28, fontFamily: fonts.sora, fontWeight: '700', color: colors.gray[900], letterSpacing: 0.2 },
  stepSub: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.gray[400] },
  closeBtn: { padding: 8, backgroundColor: colors.gray[50], borderRadius: 9999 },
  instructions: { width: '100%', borderRadius: 24, marginBottom: 24, overflow: 'hidden', borderWidth: 1, borderColor: deliveryTheme.primaryBorder, ...roundedShadow },
  instructionsHead: { paddingHorizontal: 17.6, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  instructionsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  instructionsIcon: { width: 36, height: 36, backgroundColor: alpha(colors.white, 0.2), borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  instructionsKicker: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', color: colors.white, textTransform: 'uppercase', letterSpacing: 2 },
  instructionsSub: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: alpha(colors.white, 0.9) },
  instructionsBody: { backgroundColor: deliveryTheme.primarySoft, paddingHorizontal: 20, paddingVertical: 16 },
  instructionsText: { fontSize: 14, lineHeight: 22, fontWeight: '700', color: colors.gray[950] },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 24 },
  otpInput: {
    width: 48,
    height: 64,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: deliveryTheme.inputBorder,
    borderRadius: 16,
    fontSize: 24,
    fontWeight: '700',
    color: deliveryTheme.text,
    padding: 0,
  },
  // bg-green-50 (delivery theme: primary soft); the theme keeps the input border / text colours
  otpInputVerified: { backgroundColor: deliveryTheme.primarySoft },
  otpInputFocused: { borderColor: '#8AA4C5' },
  otpInputInvalid: { borderColor: '#EF4444', backgroundColor: '#FEF2F2', color: '#B91C1C' },
  otpError: { marginTop: -12, marginBottom: 20, textAlign: 'center', fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.red[600] },
  payBox: { backgroundColor: colors.amber[50], borderRadius: 24, padding: 16, borderWidth: 1, borderColor: deliveryTheme.border, marginBottom: 24, ...roundedShadow },
  payTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  payKicker: { color: colors.amber[700], fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  payAmount: { color: colors.amber[950], fontSize: 30, lineHeight: 36, fontWeight: '700' },
  paidPill: { backgroundColor: deliveryTheme.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999 },
  paidPillText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  payBtns: { gap: 12 },
  payBtn: { width: '100%', paddingVertical: 14, borderWidth: 2, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: deliveryTheme.border, ...roundedShadow },
  payBtnIdle: { backgroundColor: colors.white },
  payBtnQrActive: { backgroundColor: colors.amber[100] },
  payBtnCash: { backgroundColor: '#15498b', shadowColor: '#15498b', shadowOpacity: 0.3, elevation: 8 },
  payBtnText: { fontWeight: '700', fontSize: 11, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1.1 },
  qrDialog: { maxWidth: 384, borderRadius: 24, backgroundColor: colors.white },
  qrCard: { padding: 20, alignItems: 'center' },
  qrTitle: { color: colors.gray[950], fontWeight: '700', fontSize: 20, lineHeight: 28, marginBottom: 8, fontFamily: fonts.sora },
  qrSub: { color: colors.gray[500], fontSize: 14, lineHeight: 20, marginBottom: 32, fontWeight: '500' },
  qrWrap: { alignItems: 'center', gap: 16, backgroundColor: colors.gray[50], borderRadius: 24, borderWidth: 2, borderColor: deliveryTheme.border, padding: 12, marginBottom: 16, width: '100%' },
  qrFrame: { width: 256, height: 256, borderRadius: 16, borderWidth: 2, borderColor: deliveryTheme.border, backgroundColor: colors.white, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 6 },
  qrCropBox: { width: '100%', height: '100%', overflow: 'hidden' },
  // web: object-cover scale-[1.60] -translate-y-[6%] translate-x-[0.8%] (crops Razorpay's QR card to the code)
  qrImageCropped: { transform: [{ translateX: 2 }, { translateY: -15 }, { scale: 1.6 }] },
  qrImagePlain: { width: '100%', height: '100%', padding: 8 },
  checkBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#15498b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, elevation: 8, shadowColor: '#15498b', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  checkBtnText: { color: colors.white, fontSize: 12, lineHeight: 16, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  disabled: { opacity: 0.6 },
  pressed: { transform: [{ scale: 0.95 }] },
  closeQrBtn: { width: '100%', paddingVertical: 14, backgroundColor: colors.gray[900], borderRadius: 16, alignItems: 'center', elevation: 8 },
  closeQrText: { color: colors.white, fontWeight: '700', fontSize: 12, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1.2 },
});
