// Web: modules/Taxi/modules/user/pages/bus/BusSeats.jsx — seat map (lower / upper deck), legend and the fixed
// "Proceed to Payment" bar.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors } from '@/theme';
import userBusService from '../../services/busService';
import { buildBusRouteState, toPlainData } from './busNavigationState';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDisplayRoute = (bus, fallbackFromCity = '', fallbackToCity = '') => ({
  fromCity: bus?.route?.originCity || bus?.fromCity || fallbackFromCity,
  toCity: bus?.route?.destinationCity || bus?.toCity || fallbackToCity,
});

const seatLegend = [
  { key: 'available', label: 'Available' },
  { key: 'selected', label: 'Selected' },
  { key: 'booked', label: 'Booked' },
  { key: 'sleeper', label: 'Sleeper' },
];

const resolveSeatPrice = (bus, seat) => {
  const variantPricing = bus?.variantPricing || {};
  const defaultPrice = Number(bus?.price || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolvedPrice = variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice;

  return Number.isFinite(Number(resolvedPrice)) ? Number(resolvedPrice) : defaultPrice;
};

const DECK_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } };
const SELECTED_SHADOW = { elevation: 4, shadowColor: '#020617', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } };

// motion.button whileTap={{ scale: 0.85 }}
const SeatButton = ({ disabled, onPress, style, children, accessibilityLabel }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => !disabled && to(0.85)}
        onPressOut={() => to(1)}
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

const SeatDeck = ({ title, rows, selectedSeatIds, onToggle, P }) => {
  if (!rows?.length) return null;

  return (
    <View style={[styles.deck, DECK_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}>
      <View style={[styles.deckHead, { borderBottomColor: P.border }]}>
        <View style={[styles.deckTitleBox, { backgroundColor: P.cardBg }]}>
          <Text style={[styles.deckTitle, { color: P.textSecondary }]}>{String(title).toUpperCase()}</Text>
        </View>
        <View
          style={[
            styles.wheel,
            { borderTopColor: P.border, borderLeftColor: P.border, borderRightColor: 'transparent', borderBottomColor: 'transparent' },
          ]}
        >
          <View style={[styles.wheelInner, { borderColor: P.border }]} />
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {rows.map((row, rowIndex) => (
          <View key={`${title}-${rowIndex}`} style={styles.seatRow}>
            {(row.length ? row : [null]).map((seat, cellIndex) => {
              if (!seat || seat.kind !== 'seat') {
                return <View key={`${title}-${rowIndex}-${cellIndex}`} style={{ flex: 1 }} />;
              }

              const isBooked = seat.status === 'booked';
              const isSelected = selectedSeatIds.includes(seat.id);
              const isSleeper = seat.variant === 'sleeper';
              const box = isBooked
                ? { borderColor: P.border, backgroundColor: P.cardSoft }
                : isSelected
                  ? [{ borderColor: colors.slate[900], backgroundColor: P.accent }, SELECTED_SHADOW]
                  : isSleeper
                    ? { borderColor: colors.blue[200], backgroundColor: P.cardSoft }
                    : { borderColor: P.border, backgroundColor: P.cardBg };
              const labelColor = isSelected ? P.textPrimary : isBooked ? P.textMuted : isSleeper ? P.textSecondary : P.textSecondary;

              return (
                <SeatButton
                  key={seat.id}
                  disabled={isBooked}
                  onPress={() => onToggle(seat)}
                  accessibilityLabel={isBooked ? `Seat ${seat.label || seat.id} sold out` : `Seat ${seat.label || seat.id}`}
                  style={[
                    styles.seat,
                    box,
                    { minHeight: isSleeper ? 52 : 44, borderRadius: isSleeper ? 18 : 10 },
                  ]}
                >
                  {isSleeper ? (
                    <>
                      <View
                        style={[
                          styles.sleeperBar,
                          { backgroundColor: isBooked ? colors.slate[400] : isSelected ? colors.orange[300] : colors.blue[200] },
                        ]}
                      />
                      <View style={styles.sleeperLabel}>
                        <Text style={[styles.seatTextSleeper, { color: labelColor }]}>{seat.label || seat.id}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View
                        style={[
                          styles.seatTop,
                          { backgroundColor: isBooked ? colors.slate[400] : isSelected ? colors.orange[400] : P.cardSoft },
                        ]}
                      />
                      <Text style={[styles.seatText, { color: labelColor }]}>{seat.label || seat.id}</Text>
                    </>
                  )}
                </SeatButton>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

// AnimatePresence + motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
const SummaryPresence = ({ visible, children }) => {
  const v = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(v, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, v]);
  if (!mounted) return null;
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
};

const BusSeats = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date } = state;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seatLayout, setSeatLayout] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [barHeight, setBarHeight] = useState(128);
  const proceedScale = useRef(new Animated.Value(1)).current;
  const displayRoute = getDisplayRoute(seatLayout?.bus || bus, fromCity, toCity);

  useEffect(() => {
    if (!bus?.busServiceId || !bus?.scheduleId || !date) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return;
    }

    let active = true;

    const loadSeats = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.getSeatLayout({
          busServiceId: bus.busServiceId,
          scheduleId: bus.scheduleId,
          date,
        });
        if (!active) return;
        setSeatLayout(toPlainData(response?.data) || null);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Failed to load seat layout');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadSeats();

    return () => {
      active = false;
    };
  }, [bus?.busServiceId, bus?.scheduleId, date, navigate, routePrefix]);

  const toggleSeat = (seat) => {
    if (!seat || seat.status === 'booked') return;

    setSelectedSeats((current) =>
      current.some((item) => item.id === seat.id)
        ? current.filter((item) => item.id !== seat.id)
        : [...current, { id: seat.id, label: seat.label || seat.id, variant: seat.variant || 'seat', price: resolveSeatPrice(seatLayout?.bus || bus, seat) }],
    );
  };

  const totalFare = selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const canProceed = selectedSeats.length > 0 && !error && !loading;
  const card = { backgroundColor: P.cardBg, borderColor: P.border };

  return (
    <Screen bg={P.bg} edges={[]}>
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
            <Text numberOfLines={1} style={[styles.h1, { color: P.textPrimary }]}>Select Seats</Text>
            <Text style={[styles.kicker, { color: P.textSecondary, marginTop: 2 }]}>
              {`${bus?.operator || ''} • ${displayRoute.fromCity || ''} to ${displayRoute.toCity || ''}`.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: Math.max(128, barHeight + 16) }]} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={[styles.loadingCard, USER_SHADOW, card]}>
            <Spin>
              <Loader2 size={32} color={P.textSecondary} />
            </Spin>
            <Text style={[styles.loadingText, { color: P.textSecondary }]}>Loading seat map...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.errorBox, { backgroundColor: P.cardSoft, borderColor: colors.rose[100] }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!loading && !error ? (
          <>
            <SeatDeck
              title="Lower Deck"
              rows={seatLayout?.blueprint?.lowerDeck || []}
              selectedSeatIds={selectedSeats.map((seat) => seat.id)}
              onToggle={toggleSeat}
              P={P}
            />
            <SeatDeck
              title="Upper Deck"
              rows={seatLayout?.blueprint?.upperDeck || []}
              selectedSeatIds={selectedSeats.map((seat) => seat.id)}
              onToggle={toggleSeat}
              P={P}
            />

            <View style={[styles.legend, USER_SHADOW, card]}>
              {seatLegend.map((item) => {
                const swatch =
                  item.key === 'sleeper'
                    ? { borderRadius: 12, borderWidth: 1, borderColor: colors.blue[200], backgroundColor: P.cardSoft }
                    : {
                        borderRadius: 4,
                        borderWidth: 2,
                        ...(item.key === 'available'
                          ? { borderColor: P.border, backgroundColor: P.cardBg }
                          : item.key === 'selected'
                            ? { borderColor: colors.slate[900], backgroundColor: P.cardBg }
                            : { borderColor: P.border, backgroundColor: P.cardSoft }),
                      };
                return (
                  <View key={item.key} style={styles.legendItem}>
                    <View style={[styles.swatch, swatch]} />
                    <Text style={[styles.legendText, { color: P.textMuted }]}>{item.label.toUpperCase()}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        style={[styles.bar, { backgroundColor: P.cardBg, borderTopColor: P.border, paddingBottom: 32 + insets.bottom }]}
      >
        <SummaryPresence visible={selectedSeats.length > 0}>
          <View style={[styles.summary, card]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.kicker, { color: P.textSecondary, marginBottom: 4 }]}>
                {`${selectedSeats.length} Seat${selectedSeats.length > 1 ? 's' : ''} Selected`.toUpperCase()}
              </Text>
              <Text style={[styles.summarySeats, { color: P.textPrimary }]}>
                {selectedSeats.map((seat) => seat.label || seat.id).join(', ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.kicker, { color: P.textSecondary, marginBottom: 4 }]}>TOTAL</Text>
              <Text style={[styles.total, { color: P.textPrimary }]}>₹{totalFare}</Text>
            </View>
          </View>
        </SummaryPresence>

        <Animated.View style={{ transform: [{ scale: proceedScale }] }}>
          <Pressable
            disabled={!canProceed}
            onPressIn={() => Animated.spring(proceedScale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
            onPressOut={() => Animated.spring(proceedScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
            onPress={() =>
              navigate(`${routePrefix}/bus/checkout`, {
                state: buildBusRouteState(state, {
                  bus: seatLayout?.bus || bus,
                  selectedSeats,
                  totalFare,
                }),
              })
            }
            style={[styles.proceed, canProceed ? [{ backgroundColor: P.accent }, USER_SHADOW] : { backgroundColor: P.cardSoft }]}
          >
            <Text style={[styles.proceedText, { color: canProceed ? P.accentInk : P.textSecondary }]}>Proceed to Payment</Text>
            <ChevronRight size={18} color={canProceed ? P.accentInk : P.textSecondary} />
          </Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 24 },
  loadingCard: { borderRadius: 24, borderWidth: 1, padding: 48, alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  errorBox: { borderRadius: 16, borderWidth: 1, padding: 16 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.rose[600] },
  deck: { width: '100%', borderRadius: 28, padding: 20, borderWidth: 1 },
  deckHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderStyle: 'dashed' },
  deckTitleBox: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  deckTitle: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2 },
  wheel: { width: 40, height: 40, borderRadius: 20, borderWidth: 4, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  wheelInner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  seatRow: { flexDirection: 'row', gap: 12 },
  seat: { width: '100%', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sleeperBar: { position: 'absolute', left: 6, top: '14%', height: '72%', width: 8, borderRadius: 9999 },
  sleeperLabel: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingLeft: 20, paddingRight: 12 },
  seatTextSleeper: { fontSize: 10, lineHeight: 10, fontWeight: '700' },
  seatTop: { position: 'absolute', top: -4, height: 8, width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  seatText: { fontSize: 10.5, lineHeight: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  legendItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 16, height: 16 },
  legendText: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, zIndex: 30 },
  summary: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderWidth: 1 },
  summarySeats: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  total: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  proceed: { width: '100%', paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  proceedText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
});

export default BusSeats;
