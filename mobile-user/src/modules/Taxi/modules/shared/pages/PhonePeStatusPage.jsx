import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Check, X, Loader2, AlertTriangle, ArrowRight, RefreshCcw } from 'lucide-react-native';
import { useNavigate, useSearchParams } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { colors, makeStyles } from '@/theme';
import api from '../../../shared/api/axiosInstance';
import { userAuthService } from '../../user/services/authService';
import {
  clearPendingPhonePeRedirect,
  readPendingPhonePeRedirect,
  resolvePendingPhonePeTransaction,
} from '../../../shared/utils/phonePeResume';

const FLOWS = {
  'user-wallet': {
    flowKey: 'user-wallet-topup',
    targetPath: '/taxi/user/wallet',
    label: 'Wallet top-up',
    paidRedirectPath: '/taxi/user/wallet',
    verify: (merchantTransactionId) => userAuthService.verifyPhonePeWalletTopup(merchantTransactionId),
  },
  'driver-wallet': {
    flowKey: 'driver-wallet-topup',
    targetPath: '/taxi/driver/wallet',
    label: 'Driver wallet top-up',
    paidRedirectPath: '/taxi/driver/wallet',
    verify: (merchantTransactionId) => api.get(`/drivers/wallet/top-up/phonepe/status/${merchantTransactionId}`),
  },
};

const normalizeResponse = (response) => response?.data || response || {};

const buildPhonePeFailureMessage = (payload = {}) => {
  const data = payload?.data || {};
  const providerMessage = String(
    data.providerMessage || payload?.message || 'Transaction Rejected',
  ).trim();
  const code = String(data.code || '').trim();
  const state = String(data.state || '').trim();

  return [providerMessage, code ? `Code: ${code}` : '', state ? `State: ${state}` : '']
    .filter(Boolean)
    .join(' | ');
};

/** framer-motion's initial -> animate on mount: fade (and optional scale / y) in. */
function FadeIn({ children, style, scale = false, y = 0, spring = false }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = spring
      ? Animated.spring(v, { toValue: 1, damping: 12, stiffness: 100, useNativeDriver: true })
      : Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true });
    anim.start();
  }, [v, spring]);
  const transform = [];
  if (scale) transform.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) });
  if (y) transform.push({ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) });
  return <Animated.View style={[style, { opacity: v, transform }]}>{children}</Animated.View>;
}

/** The verifying icon: scales in and turns (one turn every 2 s, linear, forever). */
function SpinningIcon({ children, style }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(scale, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(rot, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [scale, rot]);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[style, { transform: [{ scale }, { rotate }] }]}>{children}</Animated.View>;
}

/** One of the three dots: opacity 0.3 -> 1 -> 0.3 every second, each 0.2 s after the previous one. */
function PulseDot({ delay }) {
  const v = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 500, useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [v, delay]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue[400], opacity: v }} />;
}

function ProgressBar({ ratio }) {
  const v = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    Animated.timing(v, { toValue: ratio, duration: 300, useNativeDriver: false }).start();
  }, [v, ratio]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 4, backgroundColor: colors.slate[100] }}>
      <Animated.View style={{ height: '100%', backgroundColor: colors.blue[500], width: Animated.multiply(v, w) }} />
    </View>
  );
}

// Where PhonePe sends the customer back after a wallet top-up (/phonepe/status?flow=...).
const PhonePeStatusPage = () => {
  const s = useStyles();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');
  // eslint-disable-next-line no-unused-vars
  const [message, setMessage] = useState('Please wait while we confirm your transaction with PhonePe. Do not refresh or go back.');
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [retrySeed, setRetrySeed] = useState(0);
  const maxRetries = 10;
  const pollInterval = useRef(null);
  const redirectTimer = useRef(null);

  const flow = String(searchParams.get('flow') || '').trim();
  const config = FLOWS[flow] || null;
  const merchantTransactionId = config
    ? resolvePendingPhonePeTransaction(config.flowKey, `?${searchParams.toString()}`)
    : '';
  const pendingPayload = config ? readPendingPhonePeRedirect(config.flowKey) || {} : {};

  const destinationUrl = useMemo(() => {
    if (!config?.targetPath) return '/';
    if (config.paidRedirectPath) return config.paidRedirectPath;
    if (!merchantTransactionId) return config.targetPath;
    return `${config.targetPath}?phonepe_txn=${encodeURIComponent(merchantTransactionId)}`;
  }, [config?.paidRedirectPath, config?.targetPath, merchantTransactionId]);

  useEffect(() => {
    if (!config || !merchantTransactionId) {
      setStatus('failure');
      setError('Invalid payment reference');
      return undefined;
    }

    const verify = async () => {
      try {
        const response = await config.verify(merchantTransactionId);
        const payload = normalizeResponse(response);
        const data = payload?.data || {};
        const nextStatus = String(data.status || payload.status || '').trim().toLowerCase();

        if (nextStatus === 'paid') {
          clearPendingPhonePeRedirect(config.flowKey);
          setStatus('success');
          if (pollInterval.current) clearInterval(pollInterval.current);
          redirectTimer.current = setTimeout(() => {
            navigate(destinationUrl, { replace: true });
          }, 4000);
          return;
        }

        if (nextStatus === 'failed') {
          setStatus('failure');
          setError(buildPhonePeFailureMessage(payload));
          if (pollInterval.current) clearInterval(pollInterval.current);
          return;
        }

        setRetryCount((current) => current + 1);
      } catch (err) {
        const statusCode = err?.response?.status;
        const isNetworkError = !err?.response;

        if (isNetworkError) {
          setStatus('timeout');
          setError('Cannot reach the backend. If PhonePe opened this on another device/app, localhost URLs will not work.');
          if (pollInterval.current) clearInterval(pollInterval.current);
          return;
        }

        if (statusCode === 401) {
          setStatus('failure');
          setError('Your session is missing or expired. Please log in again and check your payment history.');
          if (pollInterval.current) clearInterval(pollInterval.current);
          return;
        }

        setRetryCount((current) => current + 1);
      }
    };

    verify();
    pollInterval.current = setInterval(() => {
      setRetryCount((current) => {
        if (current >= maxRetries) {
          setStatus('timeout');
          if (pollInterval.current) clearInterval(pollInterval.current);
          return current;
        }

        verify();
        return current;
      });
    }, 3000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, destinationUrl, merchantTransactionId, navigate, retrySeed]);

  const handleManualRetry = () => {
    setRetryCount(0);
    setStatus('verifying');
    setError('');
    setRetrySeed((current) => current + 1);
  };

  return (
    <Screen bg={colors.slate[50]} statusBarStyle="dark" style={s.page}>
      <FadeIn y={20} style={s.card}>
        {status === 'success' && <FadeIn scale={0.8} style={[s.glow, { backgroundColor: colors.emerald[50] }]} />}
        {(status === 'failure' || status === 'timeout') && <FadeIn scale={0.8} style={[s.glow, { backgroundColor: colors.rose[50] }]} />}

        <View style={{ zIndex: 10, alignItems: 'center', width: '100%' }}>
          <View style={s.iconRow}>
            {status === 'verifying' && (
              <SpinningIcon key="verifying" style={[s.iconCircle, { backgroundColor: colors.blue[50] }]}>
                <Loader2 size={40} color={colors.blue[500]} />
              </SpinningIcon>
            )}

            {status === 'success' && (
              <FadeIn key="success" scale={0.5} spring style={[s.iconCircle, s.iconShadow, { backgroundColor: colors.emerald[100], shadowColor: colors.emerald[100] }]}>
                <Check size={40} strokeWidth={3} color={colors.emerald[600]} />
              </FadeIn>
            )}

            {status === 'failure' && (
              <FadeIn key="failure" scale={0.5} style={[s.iconCircle, s.iconShadow, { backgroundColor: colors.rose[100], shadowColor: colors.rose[100] }]}>
                <X size={40} strokeWidth={3} color={colors.rose[600]} />
              </FadeIn>
            )}

            {status === 'timeout' && (
              <FadeIn key="timeout" scale={0.5} style={[s.iconCircle, s.iconShadow, { backgroundColor: colors.amber[100], shadowColor: colors.amber[100] }]}>
                <AlertTriangle size={40} strokeWidth={3} color={colors.amber[600]} />
              </FadeIn>
            )}
          </View>

          {status === 'verifying' && (
            <FadeIn key="text-verifying" style={s.block}>
              <Text style={[s.title, { fontWeight: '900' }]}>Verifying Payment</Text>
              <Text style={s.body}>Please wait while we confirm your transaction with PhonePe. Do not refresh or go back.</Text>
              <View style={s.dots}>
                {[0, 1, 2].map((i) => (
                  <PulseDot key={i} delay={i * 200} />
                ))}
              </View>
            </FadeIn>
          )}

          {status === 'success' && (
            <FadeIn key="text-success" style={s.block}>
              <Text style={s.title}>Payment Successful</Text>
              <Text style={[s.tag, { color: colors.emerald[600] }]}>{config?.label || 'Payment'} confirmed</Text>
              <View style={s.refBox}>
                <View style={s.refRow}>
                  <Text style={s.refLabel}>Reference</Text>
                  <Text style={s.refValue}>#{merchantTransactionId?.slice(-8).toUpperCase()}</Text>
                </View>
                <View style={s.refDivider} />
                <Text style={s.refNote}>Redirecting in 4 seconds...</Text>
              </View>
              <Pressable
                onPress={() => navigate(destinationUrl, { replace: true })}
                style={({ pressed }) => [s.btn, { backgroundColor: pressed ? colors.emerald[700] : colors.emerald[600] }]}
              >
                <Text style={s.btnText}>Continue</Text>
                <ArrowRight size={18} color={colors.white} />
              </Pressable>
            </FadeIn>
          )}

          {status === 'failure' && (
            <FadeIn key="text-failure" style={s.block}>
              <Text style={s.title}>Payment Failed</Text>
              <Text style={[s.tag, { color: colors.rose[600] }]}>{error || 'Transaction Rejected'}</Text>
              <Text style={[s.body, { marginBottom: 32 }]}>Oops! Something went wrong with the transaction. Your money, if debited, should be refunded automatically by PhonePe.</Text>
              <View style={s.btnCol}>
                <Pressable
                  onPress={() => navigate(destinationUrl, { replace: true })}
                  style={({ pressed }) => [s.btn, { backgroundColor: pressed ? colors.black : colors.slate[900] }]}
                >
                  <Text style={s.btnText}>Go Back</Text>
                </Pressable>
              </View>
            </FadeIn>
          )}

          {status === 'timeout' && (
            <FadeIn key="text-timeout" style={s.block}>
              <Text style={s.title}>Payment Pending</Text>
              <Text style={[s.tag, { color: colors.amber[600] }]}>Awaiting Confirmation</Text>
              <View style={s.pendingBox}>
                <AlertTriangle size={18} color={colors.amber[600]} style={{ marginTop: 2 }} />
                <Text style={s.pendingText}>
                  We have not received confirmation from PhonePe yet. This can happen due to bank delays. Please check again in a few minutes.
                </Text>
              </View>
              <View style={s.btnCol}>
                <Pressable
                  onPress={handleManualRetry}
                  style={({ pressed }) => [s.btn, { backgroundColor: pressed ? colors.amber[700] : colors.amber[600] }]}
                >
                  <RefreshCcw size={18} color={colors.white} />
                  <Text style={s.btnText}>Check Again</Text>
                </Pressable>
                <Pressable onPress={() => navigate(destinationUrl, { replace: true })} style={[s.btn, s.outlineBtn]}>
                  <Text style={[s.btnText, { color: colors.slate[600] }]}>Go Back</Text>
                </Pressable>
              </View>
            </FadeIn>
          )}

          {pendingPayload?.merchantTransactionId ? (
            <Text style={s.ref}>Ref {String(pendingPayload.merchantTransactionId).slice(-10).toUpperCase()}</Text>
          ) : null}
        </View>

        {status === 'verifying' && <ProgressBar ratio={retryCount / maxRetries} />}
      </FadeIn>
    </Screen>
  );
};

// The web page has no dark: variants (always light).
const useStyles = makeStyles(() => ({
  page: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: {
    maxWidth: 448,
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 40,
    padding: 32,
    borderWidth: 1,
    borderColor: colors.slate[100],
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: colors.slate[200],
    shadowOpacity: 1,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: 25 },
    elevation: 16,
  },
  // blur-3xl circle behind the content (blur is not available on a plain view: a soft, very light circle)
  glow: { position: 'absolute', top: -96, right: -96, width: 256, height: 256, borderRadius: 128, opacity: 0.9 },
  iconRow: { marginBottom: 32, alignItems: 'center' },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  iconShadow: { shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  block: { width: '100%', alignItems: 'center' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.slate[800], marginBottom: 8, textTransform: 'uppercase', letterSpacing: -0.6, textAlign: 'center' },
  body: { color: colors.slate[500], fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
  tag: { fontSize: 14, lineHeight: 20, fontWeight: '900', marginBottom: 24, textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'center' },
  dots: { marginTop: 24, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  refBox: { width: '100%', backgroundColor: colors.slate[50], borderRadius: 16, padding: 16, marginBottom: 32, borderWidth: 1, borderColor: colors.slate[100] },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  refLabel: { fontSize: 10, fontWeight: '700', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 1 },
  refValue: { fontSize: 12, fontWeight: '900', color: colors.slate[700] },
  refDivider: { height: 1, backgroundColor: colors.slate[200], marginVertical: 8 },
  refNote: { fontSize: 11, color: colors.slate[500], fontWeight: '500', textAlign: 'left' },
  btnCol: { width: '100%', gap: 12 },
  btn: { width: '100%', height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlineBtn: { borderWidth: 1, borderColor: colors.slate[200], backgroundColor: 'transparent' },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  pendingBox: {
    width: '100%',
    backgroundColor: colors.amber[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: colors.amber[100],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pendingText: { flex: 1, fontSize: 12, lineHeight: 19.5, color: colors.amber[800], fontWeight: '500', textAlign: 'left' },
  ref: { marginTop: 16, fontSize: 10, fontWeight: '700', letterSpacing: 1.8, color: colors.slate[400], textTransform: 'uppercase' },
}));

export default PhonePeStatusPage;
