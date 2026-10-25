import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bike, Car, HelpCircle, Repeat, Share2, Star } from 'lucide-react-native';
import { useLocation, useNavigate, useParams } from '@/lib/router';
import { AppImage, Screen, Text } from '@/native/ui';
import { alpha, colors, useTheme } from '@/theme';
import api from '../../../../shared/api/axiosInstance';
import { useSettings } from '../../../../shared/context/SettingsContext';

// --user-* palette of modules/Taxi/index.css; the Taxi scope remaps bg-white / gray text / borders to it.
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
// `.user-app-theme .shadow-*` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const unwrap = (response) => response?.data || response;

const formatLongDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Trip details';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const pickFirstString = (...values) => {
  for (const value of values) {
    const normalized = String(value || '').trim();

    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const coordLabel = (location, fallback) => {
  const [lng, lat] = location?.coordinates || [];
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }

  return fallback;
};

const formatMoney = (value) => Number(value || 0).toFixed(2);

const tap = (scale) => ({ pressed }) => (pressed ? { transform: [{ scale }] } : null);

// motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
const ShareToast = ({ visible, top, color }) => {
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
      pointerEvents="none"
      style={[styles.toast, SH, { top, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}
    >
      <Text style={[styles.toastText, { color }]}>Trip details copied</Text>
    </Animated.View>
  );
};

const RideDetail = () => {
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const [shareToast, setShareToast] = useState(false);
  const [ride, setRide] = useState(location.state?.ride || null);
  const [loading, setLoading] = useState(!location.state?.ride);
  const [error, setError] = useState('');
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  useEffect(() => {
    if (ride || !id) return undefined;

    let active = true;

    const loadRide = async () => {
      try {
        const response = await api.get(`/rides/${id}`);
        const payload = unwrap(response);
        if (active) setRide(payload);
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load trip details.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRide();

    return () => {
      active = false;
    };
  }, [id, ride]);

  const details = useMemo(() => {
    const driver = ride?.driver || ride?.driverId || {};
    const timeSource = ride?.completedAt || ride?.startedAt || ride?.acceptedAt || ride?.createdAt || ride?.updatedAt;
    const fare = Number(ride?.fare || 0);
    // Pickup waiting is added to the fare when the trip starts; it is not part of the taxed trip price.
    const waitingAmount = Math.max(0, Number(ride?.waitingCharge?.amount || 0));
    // ride.fare is what the rider pays (after the promo). The receipt lists Ride fare + Taxes - Promo discount, so
    // the tax split has to start from the price BEFORE the discount or the lines would not add up to the total.
    const discount = Math.max(0, Number(ride?.promo?.discount_amount || 0));
    // An earlier cancellation fee the rider owed is added to this fare when the trip starts; it is not taxed either.
    const earlierFeeAmount = Math.max(0, Number(ride?.cancellationDueCharge?.amount || 0));
    const taxableFare = Math.max(0, fare - waitingAmount - earlierFeeAmount + discount);
    // The fare already includes the tax % of the price the ride was booked with. Older rides did not record that
    // %, so they show only the total instead of a made-up split.
    const rawTaxPercent = ride?.pricingSnapshot?.service_tax;
    const taxPercent = rawTaxPercent === null || rawTaxPercent === undefined || rawTaxPercent === '' ? null : Number(rawTaxPercent);
    const taxes = Number.isFinite(taxPercent) && taxPercent >= 0
      ? Math.round((taxableFare - taxableFare / (1 + taxPercent / 100)) * 100) / 100
      : null;
    const tip = Math.max(0, Number(ride?.feedback?.tipAmount || 0));
    const driverRating = Number(driver.rating || 0);
    const status = String(ride?.status || ride?.liveStatus || 'trip').toLowerCase();
    const rideCode = String(ride?.rideId || ride?._id || ride?.id || id || 'ride');

    return {
      pickup: pickFirstString(
        ride?.pickupAddress,
        ride?.pickup?.address,
        ride?.pickup?.name,
      ) || coordLabel(ride?.pickupLocation || ride?.pickup, 'Pickup location'),
      drop: pickFirstString(
        ride?.dropAddress,
        ride?.drop?.address,
        ride?.drop?.name,
        ride?.destinationAddress,
      ) || coordLabel(ride?.dropLocation || ride?.drop, 'Drop location'),
      fare,
      taxes,
      taxPercent,
      discount,
      tip,
      baseFare: taxes === null ? null : Math.max(Math.round((taxableFare - taxes) * 100) / 100, 0),
      waitingAmount,
      earlierFeeAmount,
      waitingMinutes: Number(ride?.waitingCharge?.minutes || 0),
      timeSource,
      startTime: ride?.startedAt || ride?.acceptedAt || timeSource,
      endTime: ride?.completedAt || timeSource,
      statusLabel: status.charAt(0).toUpperCase() + status.slice(1),
      driverName: driver.name || 'Captain',
      rating: driverRating > 0 ? driverRating.toFixed(1) : 'New',
      plate: driver.vehicleNumber || 'Assigned',
      vehicle: driver.vehicleType || ride?.vehicleIconType || 'Taxi',
      paymentMethod: String(
        ride?.paymentMethod ||
        ride?.payment_method ||
        ride?.paymentType ||
        ride?.payment_type ||
        'cash',
      ).trim().toLowerCase() === 'cash' ? 'Cash' : 'Online',
      rideCode,
      shortRideCode: rideCode.length > 14 ? `${rideCode.slice(0, 6)}...${rideCode.slice(-4)}` : rideCode,
    };
  }, [ride]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShare = async () => {
    const text = `My ${appName} trip #${details.shortRideCode} - ${details.pickup} to ${details.drop} | Rs ${formatMoney(details.fare)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${appName} Trip`,
          text,
          url: window.location.href,
        });
        return;
      } catch (_error) {
        return;
      }
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard?.writeText(text).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
      });
    }
  };

  const goSupport = () => navigate(routePrefix ? `${routePrefix}/support` : '/ride/support');

  const fareRow = (label, value, key) => (
    <View key={key} style={styles.fareRow}>
      <Text style={[styles.fareLabel, { color: p.muted }]}>{label}</Text>
      <Text style={[styles.fareLabel, { color: p.text }]}>{value}</Text>
    </View>
  );

  const isScheduledOpen = ride?.scheduledAt && !['completed', 'cancelled'].includes(String(ride?.status || '').toLowerCase());

  return (
    <Screen bg={p.bg} edges={['top']}>
      <ShareToast visible={shareToast} top={insets.top + 16} color={p.text} />

      <View style={[styles.header, SH, { backgroundColor: p.card }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => navigate(-1)} style={(s) => [styles.back, tap(0.95)(s)]}>
            <ArrowLeft size={24} color={p.text} strokeWidth={3} />
          </Pressable>
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text numberOfLines={1} style={[styles.h1, { color: p.text }]} accessibilityLabel={`Trip ID: #${details.rideCode}`}>
              Trip ID: #{details.shortRideCode}
            </Text>
            <Text numberOfLines={1} style={[styles.sub, { color: p.sec }]}>
              {`${details.statusLabel}: ${formatLongDate(details.timeSource)}`.toUpperCase()}
            </Text>
          </View>
        </View>
        <Pressable onPress={handleShare} style={(s) => tap(0.9)(s)}>
          <Share2 size={20} color={p.sec} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={[styles.stateBox, SH, { backgroundColor: p.card, borderColor: colors.gray[50] }]}>
            <Text style={[styles.stateText, { color: p.muted }]}>Loading trip details...</Text>
          </View>
        )}

        {error ? (
          <View style={[styles.stateBox, SH, { backgroundColor: p.soft, borderColor: colors.red[100] }]}>
            <Text style={[styles.stateText, { color: colors.red[600] }]}>{error}</Text>
          </View>
        ) : null}

        {/* Scheduled ride that has not finished: show when it is and the OTP to give the driver at pickup. */}
        {isScheduledOpen ? (
          <View style={[styles.scheduled, SH]}>
            <Text style={styles.scheduledKicker}>SCHEDULED RIDE</Text>
            <Text style={[styles.scheduledDate, { color: p.text }]}>
              {formatLongDate(ride.scheduledAt)}, {formatTime(ride.scheduledAt)}
            </Text>
            {ride?.otp ? (
              <View style={[styles.otpRow, { backgroundColor: p.card }]}>
                <Text style={[styles.otpLabel, { color: p.muted }]}>Ride OTP - tell it to the driver at pickup</Text>
                <Text style={[styles.otp, { color: p.text }]}>{ride.otp}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.timeline}>
          <View style={[styles.timelineLine, { borderColor: p.border }]} />

          <View>
            <View style={[styles.stop, SH, { borderColor: colors.green[500], backgroundColor: p.card }]}>
              <View style={[styles.stopDot, { backgroundColor: colors.green[500] }]} />
            </View>
            <Text style={[styles.stopKicker, { color: p.sec }]}>PICKUP</Text>
            <Text style={[styles.stopText, { color: p.text }]}>{details.pickup}</Text>
            <Text style={[styles.stopTime, { color: p.sec }]}>{formatTime(details.startTime)}</Text>
          </View>

          <View>
            <View style={[styles.stop, SH, { borderColor: colors.orange[500], backgroundColor: p.card }]}>
              <View style={[styles.stopDot, { backgroundColor: colors.orange[500] }]} />
            </View>
            <Text style={[styles.stopKicker, { color: p.sec }]}>DROP</Text>
            <Text style={[styles.stopText, { color: p.text }]}>{details.drop}</Text>
            <Text style={[styles.stopTime, { color: p.sec }]}>{formatTime(details.endTime)}</Text>
          </View>
        </View>

        <View style={[styles.fareCard, SH, { backgroundColor: p.card }]}>
          <View style={styles.fareHead}>
            <View style={[styles.vehicleIcon, SH, { backgroundColor: p.card, borderColor: p.border }]}>
              {/bike/i.test(String(details.vehicle || '')) ? <Bike size={22} color={p.text} /> : <Car size={22} color={p.text} />}
            </View>
            <View>
              <Text style={[styles.vehicleTitle, { color: p.text }]}>{details.vehicle} Ride</Text>
              <Text style={[styles.vehicleSub, { color: p.sec }]}>{`Payment by ${details.paymentMethod}`.toUpperCase()}</Text>
            </View>
          </View>

          <View style={{ gap: 12, paddingTop: 8 }}>
            {details.taxes !== null ? (
              <>
                {fareRow('Ride Fare', `Rs ${formatMoney(details.baseFare)}`, 'base')}
                {fareRow(`Taxes & Fees (${details.taxPercent}%)`, `Rs ${formatMoney(details.taxes)}`, 'tax')}
              </>
            ) : null}
            {details.waitingAmount > 0 ? fareRow(`Waiting charge (${details.waitingMinutes} min)`, `Rs ${formatMoney(details.waitingAmount)}`, 'wait') : null}
            {details.earlierFeeAmount > 0 ? fareRow('Earlier cancellation fee', `Rs ${formatMoney(details.earlierFeeAmount)}`, 'fee') : null}
            {details.discount > 0 ? (
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: colors.emerald[600] }]}>Promo Discount</Text>
                <Text style={[styles.fareLabel, { color: colors.emerald[600] }]}>- Rs {formatMoney(details.discount)}</Text>
              </View>
            ) : null}
            <View style={[styles.fareRow, styles.totalRow]}>
              <Text style={[styles.total, { color: p.text }]}>{details.taxes === null ? 'Total Fare (incl. taxes)' : 'Total Fare'}</Text>
              <Text style={[styles.total, { color: p.text }]}>Rs {formatMoney(details.fare)}</Text>
            </View>
            {details.tip > 0 ? fareRow('Tip to driver', `Rs ${formatMoney(details.tip)}`, 'tip') : null}
          </View>
        </View>

        <View style={styles.driverCard}>
          <View style={[styles.row, { gap: 16, flexShrink: 1 }]}>
            <View style={[styles.driverAvatar, { backgroundColor: p.card }]}>
              <AppImage
                src={`https://ui-avatars.com/api/?name=${String(details.driverName).replace(' ', '+')}&background=f0f0f0&color=000`}
                accessibilityLabel={details.driverName}
                style={{ width: '100%', height: '100%', borderRadius: 14 }}
              />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.driverName, { color: p.text }]}>{details.driverName}</Text>
              <View style={[styles.row, { gap: 4 }]}>
                <Star size={12} color={colors.orange[600]} fill={colors.orange[600]} />
                <Text style={styles.driverRating}>{details.rating} - {details.plate}</Text>
              </View>
            </View>
          </View>
          <Pressable onPress={goSupport} style={(s) => [styles.supportBtn, { backgroundColor: p.card }, tap(0.95)(s)]}>
            <Text style={[styles.supportText, { color: p.text }]}>Support</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.bottom, { backgroundColor: p.card, paddingBottom: 40 + insets.bottom }]}>
        <Pressable
          onPress={() => {
            const vehicleTypeStr = String(ride?.vehicleIconType || ride?.vehicle?.icon_types || ride?.driver?.vehicleType || '').toLowerCase();
            const rebookCategory = vehicleTypeStr.includes('bike') || vehicleTypeStr.includes('scooty')
              ? 'bike'
              : vehicleTypeStr.includes('auto')
                ? 'auto'
                : 'car';

            navigate(`${routePrefix}/ride/select-location`, {
              state: {
                pickup: details.pickup,
                drop: details.drop,
                pickupCoords: ride?.pickupLocation?.coordinates || ride?.pickup?.coordinates || null,
                dropCoords: ride?.dropLocation?.coordinates || ride?.drop?.coordinates || null,
                selectedCategory: rebookCategory,
              },
            });
          }}
          style={(s) => [styles.rebook, SH, tap(0.95)(s)]}
        >
          <Repeat size={18} color={p.text} />
          <Text style={[styles.btnText, { color: p.text }]}>REBOOK RIDE</Text>
        </Pressable>
        <Pressable onPress={goSupport} style={(s) => [styles.help, { backgroundColor: p.card, borderColor: p.border }, tap(0.95)(s)]}>
          <HelpCircle size={18} color={p.text} />
          <Text style={[styles.btnText, { color: p.text }]}>HELP</Text>
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', zIndex: 50, backgroundColor: colors.gray[900], paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 },
  toastText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  header: { padding: 20, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.gray[50], zIndex: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, minWidth: 0, flex: 1 },
  back: { padding: 8, marginLeft: -8, marginTop: -8 },
  h1: { fontSize: 17, lineHeight: 19, fontWeight: '700' },
  sub: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 1.1 },
  body: { padding: 20, gap: 32 },
  stateBox: { borderRadius: 24, borderWidth: 1, padding: 20, alignItems: 'center' },
  stateText: { fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  scheduled: { borderRadius: 24, borderWidth: 1, borderColor: colors.purple[100], backgroundColor: colors.purple[50], padding: 20 },
  scheduledKicker: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, color: colors.purple[700] },
  scheduledDate: { marginTop: 4, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  otpRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.purple[100] },
  otpLabel: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  otp: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: 4 },
  timeline: { position: 'relative', paddingLeft: 32, gap: 24 },
  timelineLine: { position: 'absolute', left: 7, top: 8, bottom: 8, borderLeftWidth: 2, borderStyle: 'dashed' },
  stop: { position: 'absolute', left: -36, top: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stopDot: { width: 6, height: 6, borderRadius: 3 },
  stopKicker: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  stopText: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
  stopTime: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 4 },
  fareCard: { borderRadius: 32, padding: 24, borderWidth: 1, borderColor: colors.gray[50], gap: 16 },
  fareHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.gray[50] },
  vehicleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  vehicleTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  vehicleSub: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 1.1 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  fareLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.gray[50], paddingTop: 12 },
  total: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  driverCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: alpha(colors.orange[50], 0.5), borderRadius: 28, borderWidth: 1, borderColor: colors.orange[50] },
  driverAvatar: { width: 44, height: 44, borderRadius: 16, padding: 2, overflow: 'hidden', borderWidth: 1, borderColor: colors.orange[100] },
  driverName: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  driverRating: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.orange[600] },
  supportBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999, borderWidth: 1, borderColor: colors.orange[100] },
  supportText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  bottom: { padding: 24, borderTopWidth: 1, borderTopColor: colors.gray[50], flexDirection: 'row', gap: 16 },
  rebook: { flex: 2, backgroundColor: '#1C2833', paddingVertical: 20, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  help: { flex: 1, paddingVertical: 20, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4 },
});

export default RideDetail;
