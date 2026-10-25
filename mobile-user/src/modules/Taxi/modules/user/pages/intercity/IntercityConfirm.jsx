import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Calendar, CheckCircle2, Clock3, LoaderCircle, Navigation } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { alpha, makeStyles, useTheme } from '@/theme';
import api from '../../../../shared/api/axiosInstance';
import { getUnpaidRideFromError, openUnpaidRidePayment } from '../../utils/unpaidRide';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

// Taxi/index.css `.user-app-theme` palette (the web remaps slate / white classes to these in both themes).
const userTokens = (dark) => ({
  bg: dark ? '#0a0a0a' : '#F1F4F9',
  card: dark ? '#141414' : '#FFFFFF',
  text: dark ? '#FFFFFF' : '#0B1220',
  border: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
});
const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const generateIntercityBookingId = () =>
  'IC-' + Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');

const generateSearchNonce = () =>
  `intercity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function Spinner({ size, color }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <LoaderCircle size={size} color={color} />
    </Animated.View>
  );
}

const IntercityConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const s = useStyles();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const state = useMemo(() => location.state || {}, [location.state]);
  const [status, setStatus] = useState('saving');
  const [error, setError] = useState('');
  const requestStartedRef = useRef(false);
  const isScheduled = state.rideMode === 'schedule' && Boolean(state.scheduledAt);
  const isBiddingRide = String(state.bookingMode || '').trim().toLowerCase() === 'bidding';

  // motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter]);

  useEffect(() => {
    if (!state.pickup || !state.drop || !state.vehicle) {
      navigate(`${routePrefix}/intercity`, { replace: true });
      return;
    }

    if (!isScheduled || isBiddingRide) {
      const bookingId = state.bookingId || generateIntercityBookingId();

      navigate(`${routePrefix}/ride/searching`, {
        replace: true,
        state: {
          ...state,
          bookingId,
          searchNonce: state.searchNonce || generateSearchNonce(),
          vehicleTypeId: state.vehicleTypeId || state.vehicle?.vehicleTypeId || '',
          vehicleIconType: state.vehicleIconType || state.vehicle?.iconType || state.vehicle?.name || 'car',
          vehicleIconUrl: state.vehicleIconUrl || state.vehicle?.vehicleIconUrl || state.vehicle?.icon || '',
          paymentMethod: state.paymentMethod || 'Cash',
          serviceType: 'intercity',
          transport_type: 'intercity',
          bookingMode: isBiddingRide ? 'bidding' : (state.bookingMode || 'normal'),
          bidStepAmount: Number(state.bidStepAmount || 10),
          userMaxBidFare: Number(state.userMaxBidFare || state.fare || 0),
          intercity: {
            bookingId,
            fromCity: state.fromCity || '',
            toCity: state.toCity || '',
            tripType: state.tripType || 'One Way',
            travelDate: state.date || 'Ride Now',
            passengers: state.passengers || 1,
            distance: Number(state.distance || 0),
            vehicleName: state.vehicle?.name || state.vehicle?.id || 'Intercity Cab',
            packageId: state.vehicle?.packageId || '',
            packageTypeName: state.vehicle?.packageTypeName || 'Intercity',
          },
        },
      });
      return;
    }

    if (requestStartedRef.current) {
      return;
    }
    requestStartedRef.current = true;

    const bookingId = state.bookingId || generateIntercityBookingId();

    (async () => {
      try {
        await api.post('/rides', {
          pickup: state.pickupCoords,
          drop: state.dropCoords,
          pickupAddress: state.pickup,
          dropAddress: state.drop,
          service_location_id: state.serviceLocationId || '',
          fare: Number(state.fare || 0),
          vehicleTypeId: state.vehicleTypeId || state.vehicle?.vehicleTypeId || '',
          vehicleTypeIds: state.vehicleTypeId || state.vehicle?.vehicleTypeId ? [state.vehicleTypeId || state.vehicle?.vehicleTypeId] : [],
          vehicleIconType: state.vehicleIconType || state.vehicle?.iconType || state.vehicle?.name || 'car',
          vehicleIconUrl: state.vehicleIconUrl || state.vehicle?.vehicleIconUrl || state.vehicle?.icon || '',
          paymentMethod: state.paymentMethod || 'Cash',
          serviceType: 'intercity',
          transport_type: 'intercity',
          bookingMode: state.bookingMode || 'normal',
          userMaxBidFare: Number(state.userMaxBidFare || state.fare || 0),
          bidStepAmount: Number(state.bidStepAmount || 10),
          scheduledAt: state.scheduledAt,
          intercity: {
            bookingId,
            fromCity: state.fromCity || '',
            toCity: state.toCity || '',
            tripType: state.tripType || 'One Way',
            travelDate: state.travelDate || state.date || '',
            passengers: state.passengers || 1,
            distance: Number(state.distance || 0),
            vehicleName: state.vehicle?.name || state.vehicle?.id || 'Intercity Cab',
            packageId: state.vehicle?.packageId || '',
          },
        });
        setStatus('scheduled');
      } catch (requestError) {
        const unpaidRide = getUnpaidRideFromError(requestError);
        if (unpaidRide) {
          openUnpaidRidePayment(navigate, getAppRoutePath(), unpaidRide);
          return;
        }
        setStatus('error');
        setError(requestError?.message || 'Could not schedule this intercity ride.');
      }
    })();
  }, [isScheduled, navigate, routePrefix, state]);

  const formattedSchedule = useMemo(() => {
    if (!state.scheduledAt) {
      return '';
    }
    const parsed = new Date(state.scheduledAt);
    if (Number.isNaN(parsed.getTime())) {
      return state.scheduledAt;
    }
    return parsed.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [state.scheduledAt]);

  const iconTone = status === 'scheduled'
    ? { bg: alpha('#059669', 0.2), fg: '#34d399' }
    : status === 'error'
      ? { bg: alpha('#e11d48', 0.2), fg: '#fb7185' }
      : { bg: alpha('#2563eb', 0.2), fg: '#60a5fa' };

  return (
    <Screen bg={userTokens(t.dark).bg}>
      <View style={s.page}>
        <Animated.View
          style={[
            s.card,
            { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
          ]}
        >
          <View style={[s.iconBox, { backgroundColor: iconTone.bg }]}>
            {status === 'scheduled' ? <CheckCircle2 size={26} color={iconTone.fg} /> : <Navigation size={26} color={iconTone.fg} />}
          </View>
          <Text style={s.title}>
            {status === 'scheduled' ? 'Intercity ride scheduled' : status === 'error' ? 'Scheduling failed' : 'Scheduling your ride'}
          </Text>
          <Text style={s.subtitle}>
            {status === 'scheduled'
              ? 'Your booking has been saved. Drivers will be notified automatically at the scheduled time.'
              : status === 'error'
                ? error
                : 'Saving your intercity booking and preparing automatic driver notification.'}
          </Text>
          <View style={s.scheduleBox}>
            <View style={s.row}>
              <Calendar size={16} color="#93c5fd" />
              <Text style={s.rowLabel}>Scheduled For</Text>
            </View>
            <Text style={s.scheduleValue}>{formattedSchedule || state.date || 'Scheduled'}</Text>
            <View style={[s.row, { marginTop: 16 }]}>
              <Clock3 size={15} color="rgba(255,255,255,0.65)" />
              <Text style={s.route}>{`${state.fromCity} to ${state.toCity}`.toUpperCase()}</Text>
            </View>
          </View>
          {status === 'saving' ? (
            <View style={s.saving}>
              <Spinner size={18} color="#93c5fd" />
              <Text style={s.savingText}>SAVING SCHEDULE</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => navigate(routePrefix || '/')}
            style={({ pressed }) => [s.button, pressed && { opacity: 0.9 }]}
          >
            <Text style={s.buttonText}>{(status === 'error' ? 'Back to Home' : 'Done').toUpperCase()}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
};

const useStyles = makeStyles((t) => {
  const u = userTokens(t.dark);
  return {
    page: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: u.bg },
    card: {
      width: '100%',
      borderRadius: 32,
      borderWidth: 1,
      borderColor: u.border,
      backgroundColor: 'rgba(255,255,255,0.05)',
      paddingHorizontal: 24,
      paddingVertical: 32,
      alignItems: 'center',
      ...USER_SHADOW,
    },
    iconBox: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    title: { marginTop: 20, fontSize: 22, lineHeight: 28, fontWeight: '700', color: u.text, textAlign: 'center' },
    subtitle: { marginTop: 8, fontSize: 13, lineHeight: 19, fontWeight: '600', color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
    scheduleBox: {
      marginTop: 24,
      alignSelf: 'stretch',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: u.border,
      backgroundColor: 'rgba(255,255,255,0.05)',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: u.text },
    scheduleValue: { marginTop: 8, fontSize: 18, lineHeight: 28, fontWeight: '700', color: u.text },
    route: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1.9, color: 'rgba(255,255,255,0.65)' },
    saving: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    savingText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 2.2, color: '#93c5fd' },
    button: { marginTop: 24, height: 48, alignSelf: 'stretch', borderRadius: 18, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 2.2, color: u.text },
  };
});

export default IntercityConfirm;
