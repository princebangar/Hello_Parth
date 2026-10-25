// Web: modules/Taxi/modules/user/pages/bus/BusConfirm.jsx — e-ticket after a paid bus booking (share, My Bookings, Home).
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Ticket, Home, Share2, Phone, Route, BusFront } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { colors } from '@/theme';
import { scheduleBusBookingReminders } from '../../utils/upcomingRideReminderService';
import { formatBusTime } from '../../utils/busTime';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const formatTravelDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch (err) {
    return dateStr;
  }
};

const formatDurationCompact = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return 'Direct';
  }

  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?/gi, 'h')
    .replace(/hrs?/gi, 'h')
    .replace(/minutes?/gi, 'm')
    .replace(/mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

const formatBusRegistrationNumber = (value = '') => String(value || '').trim().toUpperCase();

// motion.div initial / animate with a delay (fade + slide up)
const Enter = ({ delay = 0, distance = 10, style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>{children}</Animated.View>;
};

const PressScale = ({ flex, style, onPress, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Animated.View style={{ flex, transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={() => to(0.98)} onPressOut={() => to(1)} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
};

const BusConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const routePrefix = getRoutePrefix(location.pathname);
  const state = location.state || {};
  const { booking, fromCity, toCity, date } = state;
  const pop = useRef(new Animated.Value(0)).current;
  const hasBooking = Boolean(booking?.bookingCode);

  useEffect(() => {
    if (booking?.bookingCode) {
      scheduleBusBookingReminders(booking);
    }
  }, [booking]);

  // The web redirected while rendering; a native screen redirects right after mounting.
  useEffect(() => {
    if (!hasBooking) navigate(`${routePrefix}/bus`, { replace: true });
  }, [hasBooking, navigate, routePrefix]);

  // initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 20 }}
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, damping: 20, stiffness: 100, mass: 1, useNativeDriver: true }).start();
  }, [pop]);

  if (!hasBooking) {
    return null;
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Bus Ticket',
          text: `Ticket ${booking.bookingCode} for ${booking.bus?.fromCity || fromCity} to ${booking.bus?.toCity || toCity} on ${booking.travelDate || date}. Seats: ${(booking.seatLabels || booking.seatIds || []).join(', ')}`,
        });
      }
    } catch {
      // ignore share cancellation
    }
  };

  const card = { backgroundColor: P.cardBg, borderColor: P.border };
  const label = { color: P.textSecondary };

  return (
    <Screen bg={P.bg} edges={[]}>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.h1, { color: P.textPrimary }]}>E-Ticket</Text>
          <Pressable onPress={handleShare} style={[styles.shareBtn, { backgroundColor: P.cardBg }]}>
            <Share2 size={18} color={P.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: 128 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.okCircle, USER_SHADOW, { backgroundColor: P.cardBg, opacity: pop, transform: [{ scale: pop }] }]}>
          <CheckCircle2 size={32} color={P.textPrimary} />
        </Animated.View>

        <Enter delay={100} style={{ alignItems: 'center', marginBottom: 40 }}>
          <Text style={[styles.kicker, label, { marginBottom: 4 }]}>BOOKING CONFIRMED</Text>
          <Text style={[styles.h2, { color: P.textPrimary }]}>Your ticket is ready</Text>
        </Enter>

        <Enter delay={200} distance={20} style={[styles.ticket, USER_SHADOW, card]}>
          <View style={[styles.ticketHead, { backgroundColor: P.cardBg }]}>
            <View style={[styles.rowBetween, { marginBottom: 32 }]}>
              <View>
                <Text style={[styles.kicker, label, { marginBottom: 4 }]}>PNR NUMBER</Text>
                <Text style={[styles.pnr, { color: P.textPrimary }]}>{booking.bookingCode}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.kicker, label, { marginBottom: 4 }]}>SEAT(S)</Text>
                <Text style={[styles.seats, { color: P.textPrimary }]}>{(booking.seatLabels || booking.seatIds || []).join(', ')}</Text>
              </View>
            </View>

            <Text style={[styles.operator, { color: P.textPrimary }]}>{booking.bus?.operator}</Text>
            <Text style={[styles.busType, label]}>
              {booking.bus?.type}
              {booking.bus?.registrationNumber ? ` • ${formatBusRegistrationNumber(booking.bus.registrationNumber)}` : ''}
            </Text>
          </View>

          <View style={styles.ticketBody}>
            <View style={[styles.rowBetween, { gap: 16 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.time, { color: P.textPrimary }]}>{formatBusTime(booking.bus?.departure)}</Text>
                <Text numberOfLines={1} style={[styles.kicker, label, { marginTop: 4 }]}>{String(booking.bus?.fromCity || fromCity || '').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
                <View style={[styles.durationPill, { backgroundColor: P.cardBg }]}>
                  <Text style={[styles.tiny, { color: P.textMuted }]}>{formatDurationCompact(booking.bus?.duration)}</Text>
                </View>
                <View style={[styles.dashed, { borderTopColor: P.border }]} />
                <Text style={[styles.tiny, label]}>{formatTravelDate(booking.travelDate || date)}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.time, { color: P.textPrimary }]}>{formatBusTime(booking.bus?.arrival)}</Text>
                <Text numberOfLines={1} style={[styles.kicker, label, { marginTop: 4 }]}>{String(booking.bus?.toCity || toCity || '').toUpperCase()}</Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <View style={[styles.box, card]}>
                <View style={[styles.row, { gap: 8 }]}>
                  <BusFront size={15} color={P.textMuted} />
                  <Text style={[styles.boxLabel, { color: P.textMuted }]}>BUS NUMBER</Text>
                </View>
                <Text style={[styles.boxValue, { color: P.textPrimary }]}>
                  {booking.bus?.registrationNumber
                    ? formatBusRegistrationNumber(booking.bus.registrationNumber)
                    : 'Will be shared soon'}
                </Text>
              </View>
              <View style={[styles.box, card]}>
                <View style={[styles.row, { gap: 8 }]}>
                  <Phone size={15} color={P.textMuted} />
                  <Text style={[styles.boxLabel, { color: P.textMuted }]}>DRIVER CONTACT</Text>
                </View>
                <Text style={[styles.boxValue, { color: P.textPrimary }]}>{booking.bus?.driverPhone || booking.bus?.driverName || 'Assigned before departure'}</Text>
              </View>
            </View>

            <View style={[styles.box, card, { padding: 20 }]}>
              <View style={[styles.row, { gap: 8 }]}>
                <Route size={15} color={P.textMuted} />
                <Text style={[styles.boxLabel, { color: P.textMuted }]}>PICKUP & DROP</Text>
              </View>
              <View style={{ marginTop: 12, gap: 12 }}>
                <View>
                  <Text style={[styles.pointLabel, { color: colors.emerald[600] }]}>PICKUP</Text>
                  <Text style={[styles.boxValue, { color: P.textPrimary, marginTop: 4 }]}>{booking.bus?.pickupLocation || booking.bus?.fromCity || fromCity}</Text>
                </View>
                <View>
                  <Text style={[styles.pointLabel, { color: colors.rose[600] }]}>DROP</Text>
                  <Text style={[styles.boxValue, { color: P.textPrimary, marginTop: 4 }]}>{booking.bus?.dropLocation || booking.bus?.toCity || toCity}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.box, card, styles.rowBetween, { padding: 20 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kicker, label, { marginBottom: 4 }]}>PASSENGER</Text>
                <Text style={[styles.passenger, { color: P.textPrimary }]}>
                  {booking.passenger?.name}
                  <Text style={{ color: P.textSecondary, fontWeight: '500' }}>
                    {`  (${booking.passenger?.age ?? ''}${String(booking.passenger?.gender || '').charAt(0)})`}
                  </Text>
                </Text>
                <Text style={[styles.paid, { color: P.textMuted }]}>Paid ₹{Number(booking.amount || 0)}</Text>
              </View>
              <View style={{ maxWidth: 120, alignItems: 'flex-end' }}>
                <Ticket size={22} color={P.textPrimary} strokeWidth={1.8} />
                <Text style={[styles.showCode, { color: P.textMuted }]}>Show ticket code {booking.bookingCode} to the bus driver</Text>
              </View>
            </View>
          </View>
        </Enter>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: P.cardBg, borderTopColor: P.border, paddingBottom: 32 + insets.bottom }]}>
        <PressScale onPress={() => navigate(`${routePrefix}/profile/bus-bookings`)} flex={1} style={[styles.barBtn, card, { borderWidth: 1 }]}>
          <Text style={[styles.barText, { color: P.textSecondary }]}>My Bookings</Text>
        </PressScale>
        <PressScale onPress={() => navigate(`${routePrefix}` || '/')} flex={2} style={[styles.barBtn, USER_SHADOW, { backgroundColor: P.accent }]}>
          <Home size={18} color={P.accentInk} />
          <Text style={[styles.barText, { color: P.accentInk }]}>Home</Text>
        </PressScale>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  shareBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' },
  okCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  h2: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  ticket: { width: '100%', borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  ticketHead: { padding: 24 },
  pnr: { fontSize: 18, lineHeight: 28, fontWeight: '600', letterSpacing: 1.8 },
  seats: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  operator: { fontSize: 20, lineHeight: 28, fontWeight: '600', marginBottom: 4 },
  busType: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  ticketBody: { padding: 24, gap: 32 },
  time: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  durationPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999 },
  tiny: { fontSize: 10.5, lineHeight: 14, fontWeight: '600' },
  dashed: { width: '100%', height: 1, borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 8 },
  box: { borderRadius: 16, borderWidth: 1, padding: 16 },
  boxLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8 },
  boxValue: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  pointLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.6 },
  passenger: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  paid: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  showCode: { marginTop: 4, fontSize: 10, lineHeight: 12, fontWeight: '600', textAlign: 'right' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1 },
  barBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  barText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});

export default BusConfirm;
