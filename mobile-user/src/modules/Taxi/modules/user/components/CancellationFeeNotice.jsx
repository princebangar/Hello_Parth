import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { Text } from '@/native/ui';
import { alpha, colors, makeStyles, sp } from '@/theme';
import api from '../../../shared/api/axiosInstance';

const unwrap = (response) => response?.data?.data || response?.data || response || {};
const money = (value) => `Rs ${Number(value || 0).toFixed(Number(value || 0) % 1 === 0 ? 0 : 2)}`;

/** After a cancel: one toast saying what happened to the fee (the cancel response carries it). */
export const announceCancellationFee = (response) => {
  const fee = unwrap(response)?.cancellationFee;
  if (!fee || !(Number(fee.amount) > 0)) {
    return;
  }
  toast(
    fee.status === 'paid'
      ? `${money(fee.amount)} cancellation fee was deducted from your wallet.`
      : `${money(fee.amount)} cancellation fee will be added to your next ride.`,
    { duration: 5000 },
  );
};

/**
 * What cancelling this ride costs the rider right now (Set Price > Cancellation Fee for User, set by the admin).
 * Used inside every "Cancel ride?" popup, so the rider sees the amount BEFORE confirming:
 *   - no driver assigned yet  -> free
 *   - driver assigned         -> the fee, taken from the wallet now, or added to the next ride if the wallet is short
 * `open` is the popup's visibility: the amount is fetched fresh every time the popup opens.
 */
export const useCancellationFee = (rideId, open) => {
  const [state, setState] = useState({ loading: false, fee: null });

  useEffect(() => {
    if (!open || !rideId) {
      return undefined;
    }

    let active = true;
    setState({ loading: true, fee: null });
    api.get(`/rides/${rideId}/cancellation-fee`)
      .then((response) => {
        if (active) setState({ loading: false, fee: unwrap(response) });
      })
      .catch(() => {
        // never block a cancel because the amount could not be loaded
        if (active) setState({ loading: false, fee: null });
      });

    return () => {
      active = false;
    };
  }, [open, rideId]);

  return state;
};

// animate-pulse (opacity 1 -> .5 -> 1, 2 s)
const usePulse = () => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
};

const CheckingFee = () => {
  const s = useStyles();
  const opacity = usePulse();
  return (
    <Animated.View style={[s.checking, { opacity }]}>
      <Text style={s.checkingText}>Checking cancellation fee...</Text>
    </Animated.View>
  );
};

const CancellationFeeNotice = ({ rideId, open = true }) => {
  const s = useStyles();
  const { loading, fee } = useCancellationFee(rideId, open);

  if (loading) {
    return <CheckingFee />;
  }

  if (!fee) {
    return null;
  }

  if (!fee.applies) {
    return (
      <View style={s.free}>
        <CheckCircle2 size={16} color={colors.emerald[600]} style={s.icon} />
        <Text style={s.freeText}>No cancellation fee - you can cancel for free.</Text>
      </View>
    );
  }

  const fromWallet = fee.payFrom === 'wallet';

  return (
    <View style={s.fee} testID="cancel-fee-notice">
      <View style={s.row}>
        <AlertTriangle size={16} color={colors.amber[600]} style={s.icon} />
        <View style={s.minW0}>
          <Text style={s.feeTitle}>Cancellation fee: {money(fee.feeAmount)}</Text>
          <Text style={s.feeSub}>Your captain has already been assigned, so cancelling now has a fee.</Text>
        </View>
      </View>
      <View style={[s.row, s.walletRow]}>
        <Wallet size={15} color={colors.amber[600]} style={s.icon} />
        <Text style={[s.walletText, s.flex1]}>
          {fromWallet
            ? `It will be deducted from your wallet now (balance ${money(fee.walletBalance)}).`
            : `Your wallet balance (${money(fee.walletBalance)}) is not enough, so ${money(fee.feeAmount)} will be added to the fare of your next ride.`}
        </Text>
      </View>
    </View>
  );
};

/**
 * Shown before booking: a cancellation fee the rider still owes from an earlier ride (wallet was short) is added to
 * the fare of the ride being booked once it starts. (`className` on the web -> `style` here.)
 */
export const PendingCancellationDueNotice = ({ style }) => {
  const s = useStyles();
  const [due, setDue] = useState(0);

  useEffect(() => {
    let active = true;
    api.get('/rides/cancellation-due/me')
      .then((response) => {
        if (active) setDue(Number(unwrap(response).amount || 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!(due > 0)) {
    return null;
  }

  return (
    <View style={[s.due, style]} testID="pending-due-notice">
      <AlertTriangle size={16} color={colors.amber[600]} style={s.icon} />
      <Text style={[s.dueText, s.flex1]}>
        {`${money(due)} cancellation fee from your earlier cancelled ride will be added to this ride's fare when the trip starts.`}
      </Text>
    </View>
  );
};

// Taxi user screens sit inside `.user-app-theme` (Taxi/index.css): bg-slate-50 -> card, bg-emerald-50 / bg-amber-50 ->
// card-soft, text-slate-400 -> secondary text, font-black -> 700, font-bold -> 600.
const useStyles = makeStyles((t) => {
  const card = t.dark ? '#141414' : '#FFFFFF';
  const soft = t.dark ? '#1c1c1c' : '#E9EDF4';
  const secondary = t.dark ? '#CBD5E1' : '#475569';
  return {
    flex1: { flex: 1 },
    minW0: { flex: 1, minWidth: 0 },
    icon: { marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(2.5) },
    checking: { marginBottom: sp(5), borderRadius: 16, backgroundColor: card, paddingHorizontal: sp(4), paddingVertical: sp(3) },
    checkingText: { textAlign: 'left', fontSize: 12, lineHeight: 16, fontWeight: '600', color: secondary },
    free: {
      marginBottom: sp(5), flexDirection: 'row', alignItems: 'flex-start', gap: sp(2.5), borderRadius: 16, borderWidth: 1,
      borderColor: colors.emerald[100], backgroundColor: soft, paddingHorizontal: sp(4), paddingVertical: sp(3),
    },
    freeText: { flex: 1, fontSize: 12, lineHeight: 15, fontWeight: '600', color: colors.emerald[700], textAlign: 'left' },
    fee: {
      marginBottom: sp(5), borderRadius: 16, borderWidth: 1, borderColor: colors.amber[200], backgroundColor: soft,
      paddingHorizontal: sp(4), paddingVertical: sp(3.5),
    },
    feeTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.amber[800], textAlign: 'left' },
    feeSub: { marginTop: 2, fontSize: 11.5, lineHeight: 14.5, fontWeight: '600', color: colors.amber[700], textAlign: 'left' },
    walletRow: { marginTop: sp(2.5), borderTopWidth: 1, borderTopColor: alpha(colors.amber[200], 0.7), paddingTop: sp(2.5) },
    walletText: { fontSize: 11.5, lineHeight: 14.5, fontWeight: '600', color: colors.amber[800], textAlign: 'left' },
    due: {
      flexDirection: 'row', alignItems: 'flex-start', gap: sp(2.5), borderRadius: 16, borderWidth: 1, borderColor: colors.amber[200],
      backgroundColor: soft, paddingHorizontal: sp(4), paddingVertical: sp(3),
    },
    dueText: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: colors.amber[800], textAlign: 'left' },
  };
});

export default CancellationFeeNotice;
