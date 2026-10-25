// Web: modules/Taxi/modules/user/pages/bus/BusDetails.jsx (route /bus/checkout) — passenger + contact details, live
// fare summary and the Razorpay payment (window.Razorpay -> @/lib/razorpay, same options and handlers).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, User, Phone, Mail, ChevronRight, Check, Loader2 } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { Razorpay, loadRazorpayScript } from '@/lib/razorpay';
import { Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors } from '@/theme';
import userBusService from '../../services/busService';
import { userAuthService } from '../../services/authService';
import { buildBusRouteState, toPlainData } from './busNavigationState';
import useKeyboardOffset from '../../../../shared/hooks/useKeyboardOffset';
import useTypingFocus from '../../../../shared/hooks/useTypingFocus';
import { formatBusTime } from '../../utils/busTime';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDisplayRoute = (bus, fallbackFromCity = '', fallbackToCity = '') => ({
  fromCity: bus?.route?.originCity || bus?.fromCity || fallbackFromCity,
  toCity: bus?.route?.destinationCity || bus?.toCity || fallbackToCity,
});

const resolveSeatPrice = (bus, seat) => {
  const variantPricing = bus?.variantPricing || {};
  const defaultPrice = Number(bus?.price || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolvedPrice = variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice;

  return Number.isFinite(Number(resolvedPrice)) ? Number(resolvedPrice) : defaultPrice;
};

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

const CURRENCY_SYMBOL = '₹';
const formatMoney = (value) => Number(value || 0).toLocaleString('en-IN');
const PLACEHOLDER = colors.slate[300];

const BusDetails = () => {
  const isTyping = useTypingFocus();
  // the Pay bar rides on top of the keyboard instead of staying hidden behind it
  const keyboardOffset = useKeyboardOffset();
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date, selectedSeats } = state;
  const displayRoute = getDisplayRoute(bus, fromCity, toCity);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [travellerMode, setTravellerMode] = useState('self');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [liveBus, setLiveBus] = useState(null);
  const [barHeight, setBarHeight] = useState(240);
  const payScale = useRef(new Animated.Value(1)).current;
  const pricingBus = liveBus || bus;
  const seatList = Array.isArray(selectedSeats) ? selectedSeats : [];
  const pricedSelectedSeats = useMemo(
    () => seatList.map((seat) => ({
      ...seat,
      price: resolveSeatPrice(pricingBus, seat),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pricingBus, selectedSeats],
  );
  const seatSubtotal = useMemo(
    () => pricedSelectedSeats.reduce((sum, seat) => sum + Number(seat?.price || 0), 0),
    [pricedSelectedSeats],
  );
  const serviceTaxPercentage = Math.max(0, Number(pricingBus?.serviceTaxPercentage || 0));
  const serviceTaxAmount = useMemo(
    () => Math.round((((seatSubtotal * serviceTaxPercentage) / 100) + Number.EPSILON) * 100) / 100,
    [seatSubtotal, serviceTaxPercentage],
  );
  const payableAmount = useMemo(
    () => Math.round(((seatSubtotal + serviceTaxAmount) + Number.EPSILON) * 100) / 100,
    [seatSubtotal, serviceTaxAmount],
  );

  const unwrapPayload = (response) => response?.data?.data || response?.data || response || {};
  const missingBooking = !bus || !selectedSeats?.length;

  useEffect(() => {
    let active = true;

    const storedProfile = (() => {
      try {
        return JSON.parse(localStorage.getItem('userInfo') || '{}');
      } catch {
        return {};
      }
    })();

    const applyProfile = (profile = {}, mode = travellerMode) => {
      if (!active) {
        return;
      }

      const nextProfile = {
        name: String(profile?.name || '').trim(),
        email: String(profile?.email || '').trim(),
        phone: String(profile?.phone || '').trim(),
      };

      setProfileData(nextProfile);

      if (mode === 'self') {
        setName(nextProfile.name || '');
        setEmail(nextProfile.email || '');
        setPhone(nextProfile.phone || '');
      }
    };

    applyProfile(storedProfile, travellerMode);

    const loadProfile = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || {};
        const normalizedUser = {
          name: user.name || storedProfile?.name || '',
          email: user.email || storedProfile?.email || '',
          phone: user.phone || storedProfile?.phone || '',
        };

        localStorage.setItem('userInfo', JSON.stringify({
          ...storedProfile,
          ...user,
        }));
        applyProfile(normalizedUser, travellerMode);
      } catch {
        applyProfile(storedProfile, travellerMode);
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (travellerMode === 'self' && profileData) {
      setName(profileData.name || '');
      setEmail(profileData.email || '');
      setPhone(profileData.phone || '');
    }
  }, [travellerMode, profileData]);

  useEffect(() => {
    if (!bus?.busServiceId || !bus?.scheduleId || !date) {
      return undefined;
    }

    let active = true;

    const loadLiveBus = async () => {
      try {
        const response = await userBusService.getSeatLayout({
          busServiceId: bus.busServiceId,
          scheduleId: bus.scheduleId,
          date,
        });

        if (!active) {
          return;
        }

        const nextBus = toPlainData(response?.data?.bus || response?.bus || null);
        if (nextBus) {
          setLiveBus(nextBus);
        }
      } catch {
        // Keep rendering with the routed bus snapshot if refresh fails.
      }
    };

    loadLiveBus();

    return () => {
      active = false;
    };
  }, [bus?.busServiceId, bus?.scheduleId, date]);

  // The web redirected while rendering; a native screen redirects right after mounting.
  useEffect(() => {
    if (missingBooking) navigate(`${routePrefix}/bus`, { replace: true });
  }, [missingBooking, navigate, routePrefix]);

  const applySelfProfile = () => {
    setTravellerMode('self');
    setName(profileData?.name || '');
    setEmail(profileData?.email || '');
    setPhone(profileData?.phone || '');
    setError('');
  };

  const switchToSomeoneElse = () => {
    setTravellerMode('other');
    setName('');
    setAge('');
    setGender('Male');
    setPhone('');
    setEmail('');
    setError('');
  };

  if (missingBooking) {
    return null;
  }

  const handleContinue = async () => {
    if (isPaying) return;

    // Email is optional (only used to mail the e-ticket); the backend accepts a booking without it.
    if (!name || !age || !phone) {
      setError('Please fill in all passenger details.');
      return;
    }

    setError('');
    setIsPaying(true);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (scriptLoaded === false) {
        throw new Error('Razorpay SDK failed to load');
      }

      const passenger = { name, age, gender, phone, email };
      const orderResponse = await userBusService.createBookingOrder({
        busServiceId: bus.busServiceId,
        scheduleId: bus.scheduleId,
        travelDate: date,
        seatIds: selectedSeats.map((seat) => seat.id),
        passenger,
      });
      const order = unwrapPayload(orderResponse);

      if (!order.keyId || !order.orderId) {
        throw new Error('Unable to start bus payment');
      }

      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: bus.operator || 'Bus Booking',
        description: `${displayRoute.fromCity} to ${displayRoute.toCity}`,
        order_id: order.orderId,
        prefill: {
          name,
          email,
          contact: phone,
        },
        modal: {
          ondismiss: () => {
            setIsPaying(false);
          },
        },
        theme: {
          color: '#C2410C',
        },
        handler: async (response) => {
          try {
            const verifyResponse = await userBusService.verifyBookingPayment(response);
            const booking = toPlainData(unwrapPayload(verifyResponse));
            navigate(`${routePrefix}/bus/confirm`, {
              replace: true,
              state: buildBusRouteState({
                booking,
                fromCity: displayRoute.fromCity,
                toCity: displayRoute.toCity,
                date,
              }),
            });
          } catch (verifyError) {
            setError(verifyError?.message || 'Payment verification failed');
            setIsPaying(false);
          }
        },
      });

      rzp.on('payment.failed', (event) => {
        const message = event?.error?.description || event?.error?.reason || 'Payment failed';
        setError(message);
        setIsPaying(false);
      });

      rzp.open();
    } catch (err) {
      setError(err?.message || 'Unable to continue with payment');
      setIsPaying(false);
    }
  };

  const compact = isTyping || keyboardOffset;
  const card = { backgroundColor: P.cardBg, borderColor: P.border };
  const fieldLabel = [styles.fieldLabel, { color: P.textSecondary }];

  return (
    // the fixed fare summary at the bottom is tall; the last fields must scroll clear of it (measured bar height).
    // While the keyboard is open only the Pay button stays (the summary would cover the field), so the gap shrinks to fit it.
    <Screen bg={P.bg} edges={[]} keyboard>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={styles.row}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [styles.backBtn, USER_SHADOW, card, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={P.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.h1, { color: P.textPrimary }]}>Passenger Details</Text>
            <Text style={[styles.kicker, { color: P.textSecondary, marginTop: 2 }]}>
              {`${selectedSeats.length} Seat(s) • ${displayRoute.fromCity} to ${displayRoute.toCity}`.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: (compact ? 112 : Math.max(416, barHeight + 24)) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, USER_SHADOW, { backgroundColor: P.bg }]}>
          <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 16 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: P.textSecondary, marginBottom: 8 }]}>
                {`${formatTravelDate(date)} • ${formatBusTime(bus.departure)}`.toUpperCase()}
              </Text>
              <Text style={[styles.heroTitle, { color: P.textPrimary }]}>{bus.operator}</Text>
              <Text style={[styles.heroType, { color: P.textSecondary }]}>{bus.type}</Text>
              <Text style={[styles.heroRoute, { color: P.textSecondary }]}>{displayRoute.fromCity} to {displayRoute.toCity}</Text>
            </View>
            <View style={[styles.seatsBox, { backgroundColor: P.cardSoft }]}>
              <Text style={[styles.kicker, { color: P.textSecondary, marginBottom: 4 }]}>SEATS</Text>
              <Text style={[styles.seatsText, { color: P.textPrimary }]}>{selectedSeats.map((seat) => seat.label || seat.id).join(', ')}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, USER_SHADOW, card]}>
          <View style={[styles.rowBetween, { gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h3, { color: P.textPrimary }]}>Primary Passenger</Text>
              <Text style={[styles.sub, { color: P.textMuted }]}>Choose who is travelling, then confirm the details below.</Text>
            </View>
            {profileLoading ? (
              <View style={[styles.loadingPill, { backgroundColor: P.cardBg }]}>
                <Spin>
                  <Loader2 size={12} color={P.textSecondary} />
                </Spin>
                <Text style={[styles.loadingPillText, { color: P.textSecondary }]}>LOADING</Text>
              </View>
            ) : null}
          </View>

          {/* Selected = accent border + soft fill + tick. */}
          <View style={[styles.row, { alignItems: 'stretch' }]}>
            {[
              { mode: 'self', label: 'Self', title: 'Use my profile', hint: 'Name, phone, and email auto-fill from your account.', onSelect: applySelfProfile },
              { mode: 'other', label: 'Other', title: 'Book for someone else', hint: 'Enter passenger details manually.', onSelect: switchToSomeoneElse },
            ].map(({ mode, label, title, hint, onSelect }) => {
              const selected = travellerMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={onSelect}
                  accessibilityState={{ selected }}
                  style={[
                    styles.modeCard,
                    selected ? { borderColor: colors.blue[500], borderWidth: 2, backgroundColor: P.cardSoft, padding: 11 } : card,
                  ]}
                >
                  {selected ? (
                    <View style={styles.tick}>
                      <Check size={12} strokeWidth={3} color={P.textPrimary} />
                    </View>
                  ) : null}
                  <Text style={[styles.modeLabel, { color: selected ? colors.blue[600] : P.textSecondary }]}>{label.toUpperCase()}</Text>
                  <Text style={[styles.modeTitle, { color: P.textPrimary }]}>{title}</Text>
                  <Text style={[styles.modeHint, { color: P.textMuted }]}>{hint}</Text>
                </Pressable>
              );
            })}
          </View>

          {travellerMode === 'self' && profileData ? (
            <View style={[styles.notice, { borderColor: colors.emerald[100], backgroundColor: P.cardSoft }]}>
              <Text style={styles.noticeText}>
                {profileData.email
                  ? `Using ${profileData.email} for the ticket confirmation.`
                  : 'Profile phone and name are filled. Add an email if you want the e-ticket mailed too.'}
              </Text>
            </View>
          ) : null}

          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={fieldLabel}>FULL NAME</Text>
              <View style={[styles.inputBox, card]}>
                <User size={16} color={P.textSecondary} />
                <TextInput
                  placeholder="Enter full name"
                  placeholderTextColor={PLACEHOLDER}
                  value={name}
                  onChangeText={setName}
                  style={[styles.input, { color: P.textPrimary }]}
                />
              </View>
            </View>

            <View style={[styles.row, { gap: 16, alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={fieldLabel}>AGE</Text>
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Age"
                  placeholderTextColor={PLACEHOLDER}
                  value={age}
                  onChangeText={setAge}
                  style={[styles.ageInput, card, { color: P.textPrimary }]}
                />
              </View>
              <View style={{ flex: 2, gap: 6 }}>
                <Text style={fieldLabel}>GENDER</Text>
                <View style={[styles.segment, card]}>
                  {['Male', 'Female', 'Other'].map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => setGender(item)}
                      style={[styles.segmentBtn, gender === item && [{ backgroundColor: P.cardBg }, USER_SHADOW]]}
                    >
                      <Text style={[styles.segmentText, { color: gender === item ? P.textPrimary : P.textMuted }]}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.section, USER_SHADOW, card]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.h3, { color: P.textPrimary }]}>Contact Info</Text>
            <View style={[styles.ticketPill, { backgroundColor: P.cardBg }]}>
              <Text style={[styles.ticketPillText, { color: P.textSecondary }]}>FOR E-TICKET</Text>
            </View>
          </View>

          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={fieldLabel}>MOBILE NUMBER</Text>
              <View style={[styles.inputBox, card]}>
                <Phone size={16} color={P.textSecondary} />
                <TextInput
                  keyboardType="phone-pad"
                  placeholder="Mobile number"
                  placeholderTextColor={PLACEHOLDER}
                  value={phone}
                  onChangeText={setPhone}
                  style={[styles.input, { color: P.textPrimary }]}
                />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={fieldLabel}>EMAIL ID</Text>
              <View style={[styles.inputBox, card]}>
                <Mail size={16} color={P.textSecondary} />
                <TextInput
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="Email address"
                  placeholderTextColor={PLACEHOLDER}
                  value={email}
                  onChangeText={setEmail}
                  style={[styles.input, { color: P.textPrimary }]}
                />
              </View>
            </View>
          </View>

          {error ? (
            <View style={[styles.notice, { borderColor: colors.rose[100], backgroundColor: P.cardSoft }]}>
              <Text style={[styles.noticeText, { color: colors.rose[600] }]}>{error}</Text>
            </View>
          ) : null}
        </View>

        {pricingBus?.cancellationPolicy ? (
          <View style={[styles.policy, { borderColor: colors.amber[100], backgroundColor: P.cardSoft }]}>
            <Text style={styles.policyLabel}>CANCELLATION POLICY</Text>
            <Text style={[styles.policyText, { color: P.textSecondary }]}>{pricingBus.cancellationPolicy}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* While the keyboard is open only the Pay button shows, so it never covers the field being typed in. */}
      <View
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        style={[
          styles.bar,
          {
            bottom: keyboardOffset,
            backgroundColor: P.cardBg,
            borderTopColor: P.border,
            paddingTop: compact ? 12 : 16,
            paddingBottom: (compact ? 12 : 32) + (compact ? 0 : insets.bottom),
          },
        ]}
      >
        {!compact ? (
          <View style={[styles.fare, USER_SHADOW, { borderColor: P.border, backgroundColor: P.cardSoft }]}>
            <View style={[styles.rowBetween, { marginBottom: 12 }]}>
              <View>
                <Text style={[styles.kicker, { color: P.textSecondary }]}>FARE SUMMARY</Text>
                <Text style={[styles.fareSeats, { color: P.textPrimary }]}>{selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''}</Text>
              </View>
              <View style={[styles.livePill, { backgroundColor: P.cardSoft }]}>
                <Check size={12} color={colors.emerald[600]} strokeWidth={3} />
                <Text style={styles.liveText}>Calculated live</Text>
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <View style={styles.rowBetween}>
                <Text style={[styles.fareLabel, { color: P.textSecondary }]}>Seat subtotal</Text>
                <Text style={[styles.fareValue, { color: P.textPrimary }]}>{CURRENCY_SYMBOL}{formatMoney(seatSubtotal)}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={[styles.fareLabel, { color: P.textSecondary }]}>Service tax ({serviceTaxPercentage}%)</Text>
                <Text style={[styles.fareValue, { color: P.textPrimary }]}>{CURRENCY_SYMBOL}{formatMoney(serviceTaxAmount)}</Text>
              </View>
              <View style={[styles.rowBetween, styles.totalRow, { borderTopColor: P.border }]}>
                <Text style={[styles.totalLabel, { color: P.textMuted }]}>PAYABLE AMOUNT</Text>
                <Text style={[styles.totalValue, { color: P.textPrimary }]}>{CURRENCY_SYMBOL}{formatMoney(payableAmount)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <Animated.View style={{ transform: [{ scale: payScale }] }}>
          <Pressable
            onPress={handleContinue}
            disabled={isPaying}
            onPressIn={() => Animated.spring(payScale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
            onPressOut={() => Animated.spring(payScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
            style={[styles.payBtn, USER_SHADOW, { backgroundColor: P.accent, opacity: isPaying ? 0.7 : 1 }]}
          >
            {isPaying ? (
              <Spin>
                <Loader2 size={20} color={P.accentInk} />
              </Spin>
            ) : (
              <Text style={[styles.payText, { color: P.accentInk }]}>{`Pay ${CURRENCY_SYMBOL}${formatMoney(payableAmount)}`}</Text>
            )}
            {!isPaying && <ChevronRight size={18} color={P.accentInk} />}
          </Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 24 },
  hero: { overflow: 'hidden', borderRadius: 28, padding: 24 },
  heroTitle: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  heroType: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  heroRoute: { marginTop: 12, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  seatsBox: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-end', maxWidth: '45%' },
  seatsText: { fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'right' },
  section: { borderRadius: 24, padding: 24, borderWidth: 1, gap: 24 },
  h3: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  sub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  loadingPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 8 },
  loadingPillText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.6 },
  modeCard: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  tick: { position: 'absolute', right: 12, top: 12, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.blue[500], alignItems: 'center', justifyContent: 'center' },
  modeLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8 },
  modeTitle: { marginTop: 4, paddingRight: 20, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  modeHint: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  notice: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  noticeText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.emerald[700] },
  fieldLabel: { marginLeft: 4, fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  input: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontWeight: '600', paddingVertical: 0, backgroundColor: 'transparent' },
  ageInput: { width: '100%', borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  segment: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  segmentText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  ticketPill: { borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 },
  ticketPillText: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  policy: { borderRadius: 24, borderWidth: 1, padding: 20 },
  policyLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8, color: colors.amber[600] },
  policyText: { marginTop: 8, fontSize: 14, lineHeight: 24, fontWeight: '600' },
  bar: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 20, borderTopWidth: 1, zIndex: 30 },
  fare: { marginBottom: 16, borderRadius: 24, borderWidth: 1, padding: 16 },
  fareSeats: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  liveText: { fontSize: 10, lineHeight: 14, fontWeight: '600', color: colors.emerald[700] },
  fareLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  fareValue: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 10 },
  totalLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.76 },
  totalValue: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  payBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  payText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
});

export default BusDetails;
