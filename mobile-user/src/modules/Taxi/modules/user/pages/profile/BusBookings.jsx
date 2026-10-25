// Web: modules/Taxi/modules/user/pages/profile/BusBookings.jsx — the user's bus tickets: status filters, paged list,
// inline 1-5 star rating for completed trips.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, BusFront, CalendarDays, ChevronLeft, ChevronRight, Loader2, MoveRight, Star, Ticket } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors } from '@/theme';
import userBusService from '../../services/busService';
import { formatBusTime } from '../../utils/busTime';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const PAGE_SIZE = 8;
const FILTERS = [
  { id: 'all', label: 'All', status: '', tripState: '' },
  { id: 'upcoming', label: 'Upcoming', status: '', tripState: 'upcoming' },
  { id: 'completed', label: 'Completed', status: '', tripState: 'completed' },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled', tripState: 'cancelled' },
];

// text / border per status (their bg-*-50 / bg-slate-100 tint is the theme's card-soft)
const statusTone = (P) => ({
  confirmed: { backgroundColor: P.cardSoft, color: colors.emerald[700], borderColor: colors.emerald[100] },
  pending: { backgroundColor: P.cardSoft, color: colors.amber[700], borderColor: colors.amber[100] },
  failed: { backgroundColor: P.cardSoft, color: colors.rose[700], borderColor: colors.rose[100] },
  expired: { backgroundColor: P.cardSoft, color: P.textSecondary, borderColor: P.border },
  cancelled: { backgroundColor: P.cardSoft, color: P.textSecondary, borderColor: P.border },
});

const formatDateTime = (value) => {
  if (!value) return 'NA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'NA';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMoney = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const ACTIVE_FILTER_SHADOW = { elevation: 4, shadowColor: '#e2e8f0', shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } };

// motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
const FadeIn = ({ delay = 0, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
};

const BusBookings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const routePrefix = useMemo(() => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''), [location.pathname]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('all');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [ratingLoadingId, setRatingLoadingId] = useState('');
  const selectedFilter = FILTERS.find((item) => item.id === activeFilter) || FILTERS[0];
  const tones = useMemo(() => statusTone(P), [P]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter]);

  useEffect(() => {
    let active = true;

    const loadBookings = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.getMyBookings({
          page,
          limit: PAGE_SIZE,
          status: selectedFilter.status,
          tripState: selectedFilter.tripState,
        });
        if (!active) return;
        const payload = response?.data || {};
        setBookings(Array.isArray(payload.results) ? payload.results : []);
        setPagination(payload.pagination || {
          page,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: page > 1,
        });
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load bus bookings');
        setBookings([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBookings();
    return () => {
      active = false;
    };
  }, [page, selectedFilter.status, selectedFilter.tripState]);

  // The star sits inside the card: a native inner press never reaches the card, so no stopPropagation is needed.
  const handleInlineRating = async (event, bookingId, rating) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!bookingId || !rating || ratingLoadingId === bookingId) return;

    try {
      setRatingLoadingId(bookingId);
      const response = await userBusService.submitBookingReview(bookingId, { rating, comment: '' });
      const updatedBooking = response?.data?.data || response?.data || response || null;

      setBookings((current) => current.map((item) => (
        item.id === bookingId && updatedBooking ? updatedBooking : item
      )));
      toast.success(response?.data?.message || response?.message || 'Bus rating saved');
    } catch (err) {
      toast.error(err?.message || 'Unable to save bus rating');
    } finally {
      setRatingLoadingId('');
    }
  };

  const card = { backgroundColor: P.cardBg, borderColor: P.border };

  const listHeader = (
    <View style={{ gap: 16, marginBottom: 12 }}>
      {/* Compact Filters */}
      <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {FILTERS.map((filter) => {
          const on = activeFilter === filter.id;
          return (
            <Pressable
              key={filter.id}
              onPress={() => setActiveFilter(filter.id)}
              style={[
                styles.filter,
                on ? [{ backgroundColor: P.accent, borderColor: colors.slate[900] }, ACTIVE_FILTER_SHADOW] : card,
              ]}
            >
              <Text style={[styles.filterText, { color: on ? P.accentInk : P.textMuted }]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={[styles.stateCard, USER_SHADOW, card, { borderRadius: 16 }]}>
          <Spin style={{ alignSelf: 'center', marginBottom: 8 }}>
            <Loader2 size={24} color={P.textSecondary} />
          </Spin>
          <Text style={[styles.stateText, { color: P.textPrimary }]}>Loading trips...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={[styles.errorBox, { backgroundColor: P.cardSoft }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && bookings.length === 0 ? (
        <View style={[styles.stateCard, USER_SHADOW, card]}>
          <View style={[styles.emptyIcon, { backgroundColor: P.cardBg }]}>
            <BusFront size={32} color={P.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: P.textPrimary }]}>No bookings yet</Text>
          <Text style={[styles.emptySub, { color: P.textMuted }]}>Book your next journey now!</Text>
          <Pressable onPress={() => navigate(`${routePrefix}/bus`)} style={[styles.bookNow, { backgroundColor: P.accent }]}>
            <Text style={[styles.bookNowText, { color: P.accentInk }]}>Book Now</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const listFooter = !loading && !error && pagination.totalPages > 1 ? (
    <View style={[styles.pager, USER_SHADOW, card]}>
      <Pressable
        disabled={!pagination.hasPrevPage}
        onPress={() => setPage((current) => Math.max(1, current - 1))}
        style={[styles.pageBtn, { backgroundColor: P.cardBg, opacity: pagination.hasPrevPage ? 1 : 0.3 }]}
      >
        <ChevronLeft size={16} color={P.textPrimary} />
      </Pressable>
      <Text style={[styles.pageText, { color: P.textPrimary }]}>
        PAGE {pagination.page} / {pagination.totalPages}
      </Text>
      <Pressable
        disabled={!pagination.hasNextPage}
        onPress={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
        style={[styles.pageBtn, { backgroundColor: P.cardBg, opacity: pagination.hasNextPage ? 1 : 0.3 }]}
      >
        <ChevronRight size={16} color={P.textPrimary} />
      </Pressable>
    </View>
  ) : null;

  const renderBooking = ({ item: booking, index }) => {
    const tone = tones[booking.status] || { backgroundColor: P.cardBg, color: P.textSecondary, borderColor: P.border };
    return (
      <FadeIn delay={index * 30}>
        <Pressable
          onPress={() => navigate(`${routePrefix}/profile/bus-bookings/${booking.id}`)}
          style={({ pressed }) => [styles.booking, USER_SHADOW, card, pressed && { transform: [{ scale: 0.99 }] }]}
        >
          {/* Header Row: PNR & Status */}
          <View style={[styles.bookingHead, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
            <View style={[styles.row, { gap: 8 }]}>
              <Text style={[styles.pnrLabel, { color: P.textSecondary }]}>PNR</Text>
              <Text style={[styles.pnr, { color: P.textPrimary }]}>{booking.bookingCode}</Text>
            </View>
            <View style={[styles.status, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
              <Text style={[styles.statusText, { color: tone.color }]}>{String(booking.status || '').toUpperCase()}</Text>
            </View>
          </View>

          <View style={{ padding: 16 }}>
            {/* Route & Times */}
            <View style={[styles.rowBetween, { gap: 12, marginBottom: 16 }]}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.city, { color: P.textPrimary }]}>{booking.bus?.fromCity || 'From'}</Text>
                <Text style={[styles.time, { color: P.textMuted }]}>{formatBusTime(booking.bus?.departure)}</Text>
              </View>
              <View style={{ alignItems: 'center', paddingHorizontal: 4 }}>
                <View style={[styles.line, { backgroundColor: P.cardSoft }]}>
                  <View style={[styles.lineDot, { backgroundColor: P.cardSoft }]} />
                </View>
                <BusFront size={12} color={P.textSecondary} style={{ marginTop: 4 }} />
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text numberOfLines={1} style={[styles.city, { color: P.textPrimary }]}>{booking.bus?.toCity || 'To'}</Text>
                <Text style={[styles.time, { color: P.textMuted }]}>{booking.bus?.arrival || '--:--'}</Text>
              </View>
            </View>

            {/* Trip Details Bar */}
            <View style={[styles.detailsBar, card]}>
              <View style={[styles.row, { gap: 6 }]}>
                <CalendarDays size={12} color={P.textSecondary} />
                <Text style={[styles.detail, { color: P.textPrimary }]}>{booking.travelDate || 'NA'}</Text>
              </View>
              <View style={[styles.sep, { backgroundColor: P.cardSoft }]} />
              <View style={[styles.row, { gap: 6, flexShrink: 1 }]}>
                <Ticket size={12} color={P.textSecondary} />
                <Text numberOfLines={1} style={[styles.detail, { color: P.textPrimary, flexShrink: 1 }]}>{(booking.activeSeatLabels || []).join(', ') || 'NA'}</Text>
              </View>
              <View style={[styles.sep, { backgroundColor: P.cardSoft }]} />
              <Text style={[styles.detail, { color: P.textPrimary }]}>{formatMoney(booking.amount, booking.currency)}</Text>
            </View>

            {/* Rating or Footer Row */}
            {booking.review?.tripCompleted ? (
              <View style={[styles.footerRow, { borderTopColor: P.border }]}>
                <View style={[styles.row, { gap: 4 }]}>
                  {[1, 2, 3, 4, 5].map((score) => {
                    const activeScore = Number(booking.review?.userRating || 0);
                    const filled = score <= activeScore;
                    return (
                      <Pressable
                        key={`${booking.id}-rating-${score}`}
                        onPress={(event) => handleInlineRating(event, booking.id, score)}
                        style={{ padding: 2 }}
                        hitSlop={4}
                      >
                        <Star size={14} color={filled ? P.accent : colors.slate[200]} fill={filled ? P.accent : 'transparent'} />
                      </Pressable>
                    );
                  })}
                  <Text style={[styles.rateLabel, { color: P.textSecondary }]}>
                    {booking.review?.userRating ? 'RATED' : 'RATE TRIP'}
                  </Text>
                </View>
                <View style={[styles.row, { gap: 4 }]}>
                  <Text style={[styles.detailsLink, { color: P.textPrimary }]}>DETAILS</Text>
                  <MoveRight size={10} color={P.textPrimary} />
                </View>
              </View>
            ) : (
              <View style={[styles.footerRow, { borderTopColor: P.border }]}>
                <Text style={[styles.booked, { color: P.textSecondary }]}>{`Booked ${formatDateTime(booking.createdAt)}`.toUpperCase()}</Text>
                <View style={[styles.row, { gap: 4 }]}>
                  <Text style={[styles.detailsLink, { color: P.textPrimary }]}>DETAILS</Text>
                  <MoveRight size={10} color={P.textPrimary} />
                </View>
              </View>
            )}
          </View>
        </Pressable>
      </FadeIn>
    );
  };

  return (
    <Screen bg={P.bg} edges={[]}>
      <StatusBarSpacer color={P.cardBg} />
      {/* Header */}
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={[styles.row, { gap: 16 }]}>
          <Pressable onPress={() => navigate(`${routePrefix || '/taxi/user'}`)} style={[styles.back, { backgroundColor: P.cardBg }]}>
            <ArrowLeft size={20} color={P.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: P.textPrimary }]}>Bus Bookings</Text>
            <Text style={[styles.kicker, { color: P.textSecondary }]}>YOUR TRAVEL HISTORY</Text>
          </View>
        </View>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={!loading && !error ? bookings : []}
        keyExtractor={(booking, index) => String(booking?.id ?? index)}
        renderItem={renderBooking}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter ? <View style={{ marginTop: 16 }}>{listFooter}</View> : null}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 128 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  filter: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  stateCard: { borderRadius: 24, padding: 40, borderWidth: 1, alignItems: 'center' },
  stateText: { fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  errorBox: { borderWidth: 1, borderColor: colors.rose[100], borderRadius: 12, padding: 12 },
  errorText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.rose[600], textAlign: 'center' },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  emptySub: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  bookNow: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  bookNowText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  booking: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  bookingHead: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pnrLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', letterSpacing: 1.05 },
  pnr: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1 },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 1 },
  statusText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  city: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  time: { fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 2 },
  line: { width: 48, height: 1 },
  lineDot: { position: 'absolute', right: 0, top: -1.5, width: 4, height: 4, borderRadius: 2 },
  detailsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  detail: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  sep: { width: 1, height: 12 },
  footerRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rateLabel: { marginLeft: 4, fontSize: 10.5, lineHeight: 14, fontWeight: '600' },
  detailsLink: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  booked: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', letterSpacing: -0.26, flexShrink: 1 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1 },
  pageBtn: { padding: 8, borderRadius: 8 },
  pageText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
});

export default BusBookings;
