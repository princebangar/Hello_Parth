import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, Loader2, RefreshCcw, X } from 'lucide-react-native';
import { useNavigate, useSearchParams } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors, makeStyles } from '@/theme';
import api from '../../../shared/api/axiosInstance';

const FLOWS = {
  'driver-wallet': {
    label: 'Driver wallet top-up',
    destination: '/taxi/driver/wallet',
    verify: (payload) => api.post('/drivers/wallet/top-up/razorpay/verify', payload),
  },
  'user-wallet': {
    label: 'User wallet top-up',
    destination: '/taxi/user/wallet',
    verify: (payload) => api.post('/users/wallet/razorpay/verify', payload),
  },
};

// Where Razorpay's redirect mode sends the customer back after a wallet top-up (/razorpay/status?flow=...).
const RazorpayStatusPage = () => {
  const s = useStyles();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');
  const [error, setError] = useState('');
  const [retrySeed, setRetrySeed] = useState(0);

  const flow = String(searchParams.get('flow') || '').trim().toLowerCase();
  const config = FLOWS[flow] || null;
  const callbackStatus = String(searchParams.get('status') || '').trim().toLowerCase();
  const payload = {
    razorpay_order_id: String(searchParams.get('razorpay_order_id') || '').trim(),
    razorpay_payment_id: String(searchParams.get('razorpay_payment_id') || '').trim(),
    razorpay_signature: String(searchParams.get('razorpay_signature') || '').trim(),
  };
  const providerError = String(searchParams.get('error_description') || searchParams.get('error_code') || '').trim();

  useEffect(() => {
    if (!config) {
      setStatus('failure');
      setError('Unsupported Razorpay flow.');
      return undefined;
    }

    if (callbackStatus === 'success') {
      setStatus('success');
      const timer = setTimeout(() => {
        navigate(config.destination, { replace: true });
      }, 2200);
      return () => clearTimeout(timer);
    }

    if (providerError) {
      setStatus('failure');
      setError(providerError);
      return undefined;
    }

    if (!payload.razorpay_order_id || !payload.razorpay_payment_id || !payload.razorpay_signature) {
      setStatus('failure');
      setError('Razorpay did not return the required payment verification details.');
      return undefined;
    }

    let active = true;
    let redirectTimer = null;

    const verifyPayment = async () => {
      try {
        setStatus('verifying');
        setError('');
        await config.verify(payload);

        if (!active) {
          return;
        }

        setStatus('success');
        redirectTimer = setTimeout(() => {
          navigate(config.destination, { replace: true });
        }, 2200);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setStatus('failure');
        setError(
          requestError?.response?.data?.message
          || requestError?.message
          || 'Payment verification failed.',
        );
      }
    };

    verifyPayment();

    return () => {
      active = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config,
    navigate,
    payload.razorpay_order_id,
    payload.razorpay_payment_id,
    payload.razorpay_signature,
    providerError,
    callbackStatus,
    retrySeed,
  ]);

  return (
    <Screen bg={colors.slate[50]} statusBarStyle="dark" style={s.page}>
      <View style={s.card}>
        <View style={s.iconRow}>
          {status === 'verifying' ? (
            <View style={[s.iconCircle, { backgroundColor: colors.blue[50] }]}>
              <Spin>
                <Loader2 size={36} color={colors.blue[600]} />
              </Spin>
            </View>
          ) : status === 'success' ? (
            <View style={[s.iconCircle, { backgroundColor: colors.emerald[50] }]}>
              <Check size={36} strokeWidth={3} color={colors.emerald[600]} />
            </View>
          ) : (
            <View style={[s.iconCircle, { backgroundColor: colors.rose[50] }]}>
              <X size={36} strokeWidth={3} color={colors.rose[600]} />
            </View>
          )}
        </View>

        {status === 'verifying' ? (
          <>
            <Text style={s.title}>Confirming payment</Text>
            <Text style={[s.sub, { color: colors.slate[500] }]}>Please wait while we verify your Razorpay transaction.</Text>
          </>
        ) : null}

        {status === 'success' ? (
          <>
            <Text style={s.title}>Payment successful</Text>
            <Text style={[s.sub, { color: colors.emerald[600] }]}>
              {config?.label || 'Payment'} was verified. Redirecting you back now.
            </Text>
          </>
        ) : null}

        {status === 'failure' ? (
          <>
            <Text style={s.title}>Verification failed</Text>
            <Text style={[s.sub, { color: colors.rose[600] }]}>{error || 'We could not verify your Razorpay payment.'}</Text>
            <View style={s.actions}>
              <Pressable onPress={() => setRetrySeed((current) => current + 1)} style={s.primary}>
                <RefreshCcw size={16} color={colors.white} />
                <Text style={[s.btnText, { color: colors.white }]}>Retry verification</Text>
              </Pressable>
              <Pressable onPress={() => navigate(config?.destination || '/', { replace: true })} style={s.secondary}>
                <Text style={[s.btnText, { color: colors.slate[600] }]}>Back to wallet</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
};

// The web page has no dark: variants (always light).
const useStyles = makeStyles(() => ({
  page: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 448,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    padding: 32,
    alignItems: 'center',
    shadowColor: colors.slate[200],
    shadowOpacity: 0.6,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  iconRow: { marginBottom: 24, alignItems: 'center' },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.slate[900], textAlign: 'center' },
  sub: { marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  actions: { marginTop: 24, width: '100%', gap: 12 },
  primary: {
    height: 48,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.slate[900],
  },
  secondary: {
    height: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  btnText: { fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.35 },
}));

export default RazorpayStatusPage;
