// Web: modules/Taxi/modules/user/pages/profile/BusBookingDetail.jsx (route /profile/bus-bookings/:id) — ticket,
// cancel selected seats with refund preview, fare details, review, cancellation policy.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, BusFront, Loader2, Phone, ReceiptText, Route, ShieldAlert, Star, Ticket, Clock, CalendarDays, Info } from 'lucide-react-native';
import { useLocation, useNavigate, useParams } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors } from '@/theme';
import userBusService from '../../services/busService';
import { formatBusTime } from '../../utils/busTime';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const formatMoney = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

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

const formatDurationCompact = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Direct';
  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?/gi, 'h')
    .replace(/hrs?/gi, 'h')
    .replace(/minutes?/gi, 'm')
    .replace(/mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

const unwrapPayload = (response) => response?.data?.data || response?.data || response || null;

// Window / aisle / sleeper seats can have different prices, so every seat carries its own amount.
const getSeatAmount = (booking, seatId) => {
  const seatIds = Array.isArray(booking?.seatIds) ? booking.seatIds.map(String) : [];
  const seatAmounts = Array.isArray(booking?.seatAmounts) ? booking.seatAmounts : [];
  const index = seatIds.indexOf(String(seatId));
  const amount = index >= 0 ? Number(seatAmounts[index]) : NaN;
  return Number.isFinite(amount) ? amount : Number(booking?.perSeatAmount || 0);
};

const computeSelectionQuote = (booking, selectedSeatIds) => {
  const seatCount = Number(booking?.seatSummary?.total || 0);
  const selectedCount = selectedSeatIds.length;
  const subtotal = Math.round(selectedSeatIds.reduce((sum, seatId) => sum + getSeatAmount(booking, seatId), 0) * 100) / 100;
  const rule = booking?.cancellation || {};
  let refundAmount = 0;

  if (selectedCount <= 0 || !rule.allowed) {
    return {
      subtotal: 0,
      refundAmount: 0,
      chargeAmount: 0,
    };
  }

  if (rule.refundType === 'percentage') {
    refundAmount = Math.round(subtotal * Math.min(100, Number(rule.refundValue || 0)) / 100 * 100) / 100;
  } else if (rule.refundType === 'fixed') {
    refundAmount = Math.min(subtotal, Math.round(Number(rule.refundValue || 0) * 100) / 100);
  }

  if (seatCount <= 0) {
    refundAmount = 0;
  }

  return {
    subtotal,
    refundAmount,
    chargeAmount: Math.max(0, Math.round((subtotal - refundAmount) * 100) / 100),
  };
};

const FadeIn = ({ from = { scale: 1, y: 0 }, style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [from.scale, 1] }) },
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const BusBookingDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const { id } = useParams();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [cancelling, setCancelling] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);

  useEffect(() => {
    let active = true;

    const loadBooking = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.getBookingById(id);
        if (!active) return;
        const nextBooking = unwrapPayload(response);
        setBooking(nextBooking);
        setSelectedSeatIds(Array.isArray(nextBooking?.activeSeatIds) ? nextBooking.activeSeatIds : []);
        setSelectedRating(Number(nextBooking?.review?.userRating || 0));
        setReviewComment(nextBooking?.review?.userComment || '');
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load booking details');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBooking();
    return () => {
      active = false;
    };
  }, [id]);

  const activeSeatIds = Array.isArray(booking?.activeSeatIds) ? booking.activeSeatIds : [];
  const activeSeatLabels = Array.isArray(booking?.activeSeatLabels) ? booking.activeSeatLabels : [];
  const canCancel = Boolean(booking?.cancellation?.allowed) && booking?.status === 'confirmed' && activeSeatIds.length > 0;
  const selectionQuote = computeSelectionQuote(booking, selectedSeatIds);
  const canRate = Boolean(booking?.review?.canRate);

  const toggleSeat = (seatId) => {
    setSelectedSeatIds((current) => (
      current.includes(seatId)
        ? current.filter((item) => item !== seatId)
        : [...current, seatId]
    ));
  };

  const handleCancelSeats = async () => {
    if (!booking || cancelling || selectedSeatIds.length === 0) return;

    try {
      setCancelling(true);
      const response = await userBusService.cancelBooking(booking.id, {
        seatIds: selectedSeatIds,
        travelDate: booking.travelDate,
      });
      const updatedBooking = unwrapPayload(response);
      setBooking(updatedBooking);
      setSelectedSeatIds(Array.isArray(updatedBooking?.activeSeatIds) ? updatedBooking.activeSeatIds : []);
      toast.success(response?.data?.message || response?.message || 'Selected seats cancelled successfully');
    } catch (err) {
      toast.error(err?.message || 'Unable to cancel selected seats');
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!booking || !canRate || savingReview) return;
    if (!selectedRating) {
      toast.error('Please select a rating');
      return;
    }

    try {
      setSavingReview(true);
      const response = await userBusService.submitBookingReview(booking.id, {
        rating: selectedRating,
        comment: reviewComment,
      });
      const updatedBooking = unwrapPayload(response);
      setBooking(updatedBooking);
      setSelectedRating(Number(updatedBooking?.review?.userRating || 0));
      setReviewComment(updatedBooking?.review?.userComment || '');
      toast.success(response?.data?.message || response?.message || 'Bus rating saved');
    } catch (err) {
      toast.error(err?.message || 'Unable to save bus rating');
    } finally {
      setSavingReview(false);
    }
  };

  const card = { backgroundColor: P.cardBg, borderColor: P.border };
  const tinyLabel = [styles.tinyLabel, { color: P.textSecondary }];

  const InfoBox = ({ icon: Icon, label, value }) => (
    <View style={[styles.infoBox, card]}>
      <View style={[styles.row, { gap: 8, marginBottom: 8 }]}>
        <Icon size={14} color={P.textSecondary} />
        <Text style={tinyLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, { color: P.textPrimary }]}>{value}</Text>
    </View>
  );

  return (
    <Screen bg={P.bg} edges={[]} keyboard>
      <StatusBarSpacer color={P.cardBg} />
      {/* Header */}
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={[styles.row, { gap: 16 }]}>
          <Pressable onPress={() => navigate(`${routePrefix}/profile/bus-bookings`)} style={[styles.back, { backgroundColor: P.cardBg }]}>
            <ArrowLeft size={20} color={P.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: P.textPrimary }]}>Ticket Details</Text>
            <Text style={[styles.kicker, { color: P.textSecondary }]}>{`Booking ID: ${booking?.bookingCode || '...'}`.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: 128 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={[styles.stateCard, USER_SHADOW, card]}>
            <Spin style={{ alignSelf: 'center', marginBottom: 12 }}>
              <Loader2 size={28} color={P.textSecondary} />
            </Spin>
            <Text style={[styles.stateText, { color: P.textPrimary }]}>Loading details...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.errorBox, { backgroundColor: P.cardSoft }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {(!loading && !error && booking) ? (
          <View style={{ gap: 24 }}>
            {/* Ticket Card */}
            <FadeIn from={{ scale: 0.98, y: 0 }} style={[styles.bigCard, USER_SHADOW, card, { padding: 0, overflow: 'hidden' }]}>
              <View style={[styles.ticketHead, { backgroundColor: P.cardBg }]}>
                <View>
                  <Text style={[styles.headLabel, { color: P.textSecondary }]}>PNR NUMBER</Text>
                  <Text style={[styles.pnr, { color: P.textPrimary }]}>{booking.bookingCode}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.headLabel, { color: P.textSecondary }]}>STATUS</Text>
                  <View style={[styles.statusPill, { backgroundColor: P.cardSoft, borderColor: alpha('#ffffff', 0.2) }]}>
                    <Text style={[styles.statusText, { color: P.textPrimary }]}>{String(booking.status || '').toUpperCase()}</Text>
                  </View>
                </View>
              </View>

              <View style={{ padding: 24, gap: 24 }}>
                {/* Route Header */}
                <View style={[styles.rowBetween, { gap: 16 }]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.city, { color: P.textPrimary }]}>{booking.bus?.fromCity || 'From'}</Text>
                    <Text style={[styles.cityTime, { color: P.textSecondary }]}>{String(formatBusTime(booking.bus?.departure) || '').toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
                    <View style={[styles.durPill, card]}>
                      <Text style={[styles.durText, { color: P.textSecondary }]}>{formatDurationCompact(booking.bus?.duration)}</Text>
                    </View>
                    <View style={[styles.dashed, { borderTopColor: P.border }]} />
                    <BusFront size={18} color={P.textSecondary} />
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text numberOfLines={1} style={[styles.city, { color: P.textPrimary }]}>{booking.bus?.toCity || 'To'}</Text>
                    <Text style={[styles.cityTime, { color: P.textSecondary }]}>{String(booking.bus?.arrival || '--:--').toUpperCase()}</Text>
                  </View>
                </View>

                {/* Operator Info */}
                <View style={[styles.infoBox, card]}>
                  <Text style={[tinyLabel, { marginBottom: 8 }]}>BUS & OPERATOR</Text>
                  <View style={[styles.row, { gap: 12 }]}>
                    <View style={[styles.avatar, { backgroundColor: P.cardBg }]}>
                      <Text style={[styles.avatarText, { color: P.textPrimary }]}>{String(booking.bus?.operator || 'B').charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoValue, { color: P.textPrimary }]}>{booking.bus?.operator || 'Bus Service'}</Text>
                      <Text style={[styles.opType, { color: P.textMuted }]}>{booking.bus?.type || 'Standard Service'}</Text>
                    </View>
                  </View>
                </View>

                {/* Info Grid */}
                <View style={[styles.row, { gap: 12, alignItems: 'stretch' }]}>
                  <InfoBox icon={CalendarDays} label="TRAVEL DATE" value={booking.travelDate || 'NA'} />
                  <InfoBox icon={Ticket} label="SEAT COUNT" value={`${activeSeatIds.length} Seats`} />
                </View>

                {/* More Info */}
                <View style={[styles.row, { gap: 12, alignItems: 'stretch' }]}>
                  <InfoBox icon={BusFront} label="BUS NUMBER" value={booking.bus?.registrationNumber || 'Pending'} />
                  <InfoBox icon={Phone} label="CONTACT" value={booking.bus?.driverPhone || 'Assigned soon'} />
                </View>

                {/* Locations */}
                <View style={[styles.infoBox, card, { padding: 20 }]}>
                  <View style={[styles.row, { gap: 8, marginBottom: 16 }]}>
                    <Route size={14} color={P.textSecondary} />
                    <Text style={tinyLabel}>ROUTE POINTS</Text>
                  </View>
                  <View style={{ gap: 16 }}>
                    <View style={styles.point}>
                      <View style={[styles.pointDot, { backgroundColor: colors.emerald[500] }]} />
                      <View style={[styles.pointLine, { backgroundColor: P.cardSoft }]} />
                      <Text style={[styles.pointLabel, { color: colors.emerald[600] }]}>PICKUP</Text>
                      <Text style={[styles.infoValue, { color: P.textPrimary }]}>{booking.bus?.pickupLocation || booking.bus?.fromCity}</Text>
                    </View>
                    <View style={styles.point}>
                      <View style={[styles.pointDot, { backgroundColor: colors.rose[500] }]} />
                      <Text style={[styles.pointLabel, { color: colors.rose[600] }]}>DROPOFF</Text>
                      <Text style={[styles.infoValue, { color: P.textPrimary }]}>{booking.bus?.dropLocation || booking.bus?.toCity}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </FadeIn>

            {/* Seat Summary & Cancellation Section */}
            <View style={[styles.bigCard, USER_SHADOW, card]}>
              <View style={[styles.row, { gap: 12, marginBottom: 24 }]}>
                <Ticket size={20} color={P.textPrimary} />
                <Text style={[styles.h2, { color: P.textPrimary }]}>Manage Seats</Text>
              </View>

              <View style={{ gap: 12 }}>
                {activeSeatIds.map((seatId, index) => {
                  const selected = selectedSeatIds.includes(seatId);
                  return (
                    <Pressable
                      key={seatId}
                      disabled={!canCancel}
                      onPress={() => toggleSeat(seatId)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected, disabled: !canCancel }}
                      style={[
                        styles.seatRow,
                        selected ? { backgroundColor: P.cardBg, borderColor: colors.slate[900] } : card,
                        !canCancel && { opacity: 0.7 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoValue, { color: P.textPrimary }]}>{activeSeatLabels[index] || seatId}</Text>
                        <Text style={[styles.seatSub, { color: selected ? P.textSecondary : P.textMuted }]}>
                          Active Seat • {formatMoney(getSeatAmount(booking, seatId), booking.currency)}
                        </Text>
                      </View>
                      {canCancel && (
                        <View style={[styles.check, { backgroundColor: P.cardBg, borderColor: P.border }]}>
                          {selected && <View style={[styles.checkInner, { backgroundColor: P.cardBg }]} />}
                        </View>
                      )}
                    </Pressable>
                  );
                })}

                {Array.isArray(booking.cancelledSeats) && booking.cancelledSeats.length > 0 && (
                  <View style={{ paddingTop: 16, gap: 12 }}>
                    <Text style={[styles.cancelledLabel, { color: P.textSecondary }]}>CANCELLED SEATS</Text>
                    {booking.cancelledSeats.map((seat) => (
                      <View key={seat.seatId} style={[styles.seatRow, { borderColor: P.border, backgroundColor: P.cardSoft }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.infoValue, { color: P.textSecondary }]}>{seat.seatLabel || seat.seatId}</Text>
                          <Text style={[styles.seatSubPlain, { color: P.textSecondary }]}>Cancelled {formatDateTime(seat.cancelledAt)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.infoValue, { color: P.textSecondary }]}>{formatMoney(seat.refundAmount, booking.currency)}</Text>
                          <Text style={[styles.refunded, { color: P.textSecondary }]}>REFUNDED</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Refund Preview */}
              {selectedSeatIds.length > 0 && (
                <FadeIn style={[styles.preview, card]}>
                  <View style={[styles.row, { gap: 8, marginBottom: 16 }]}>
                    <ReceiptText size={14} color={P.textPrimary} />
                    <Text style={[styles.previewTitle, { color: P.textPrimary }]}>REFUND PREVIEW</Text>
                  </View>
                  <View style={[styles.row, { gap: 16 }]}>
                    <View style={styles.quoteCol}>
                      <Text style={[styles.quoteLabel, { color: P.textSecondary }]}>TOTAL</Text>
                      <Text style={[styles.infoValue, { color: P.textPrimary }]}>{formatMoney(selectionQuote.subtotal, booking.currency)}</Text>
                    </View>
                    <View style={styles.quoteCol}>
                      <Text style={[styles.quoteLabel, { color: colors.emerald[600] }]}>REFUND</Text>
                      <Text style={[styles.infoValue, { color: colors.emerald[600] }]}>{formatMoney(selectionQuote.refundAmount, booking.currency)}</Text>
                    </View>
                    <View style={styles.quoteCol}>
                      <Text style={[styles.quoteLabel, { color: colors.rose[600] }]}>FEE</Text>
                      <Text style={[styles.infoValue, { color: colors.rose[600] }]}>{formatMoney(selectionQuote.chargeAmount, booking.currency)}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={handleCancelSeats}
                    disabled={cancelling}
                    style={({ pressed }) => [styles.cancelBtn, USER_SHADOW, pressed && { transform: [{ scale: 0.98 }] }]}
                  >
                    <Text style={[styles.btnText, { color: P.textPrimary }]}>{cancelling ? 'PROCESSING...' : 'CONFIRM CANCELLATION'}</Text>
                  </Pressable>
                </FadeIn>
              )}
            </View>

            {/* Fare details: what was charged for this ticket */}
            <View style={[styles.bigCard, USER_SHADOW, card]}>
              <Text style={[styles.h2, { color: P.textPrimary }]}>Fare details</Text>
              <View style={{ marginTop: 16, gap: 12 }}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.fareLabel, { color: P.textSecondary, flexShrink: 1 }]}>
                    Seat subtotal ({booking.fare?.seatCount || (booking.seatIds || []).length} seat{(booking.fare?.seatCount || (booking.seatIds || []).length) === 1 ? '' : 's'})
                  </Text>
                  <Text style={[styles.fareValue, { color: P.textPrimary }]}>{formatMoney(booking.fare?.seatSubtotal ?? booking.amount, booking.currency)}</Text>
                </View>
                {Number(booking.fare?.serviceTaxAmount || 0) > 0 ? (
                  <View style={styles.rowBetween}>
                    <Text style={[styles.fareLabel, { color: P.textSecondary }]}>Service tax ({Number(booking.fare?.serviceTaxPercentage || 0)}%)</Text>
                    <Text style={[styles.fareValue, { color: P.textPrimary }]}>{formatMoney(booking.fare.serviceTaxAmount, booking.currency)}</Text>
                  </View>
                ) : null}
                <View style={[styles.rowBetween, styles.totalRow, { borderTopColor: P.border }]}>
                  <Text style={[styles.totalLabel, { color: P.textMuted }]}>TOTAL PAID</Text>
                  <Text style={[styles.totalValue, { color: P.textPrimary }]}>{formatMoney(booking.fare?.total ?? booking.amount, booking.currency)}</Text>
                </View>
                {/* Money actually given back for cancelled seats (all cancellations together). */}
                {Number(booking.totalRefundedAmount || 0) > 0 ? (
                  <>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.fareLabel, { color: colors.emerald[700] }]}>Refunded</Text>
                      <Text style={[styles.fareValue, { color: colors.emerald[700] }]}>{formatMoney(booking.totalRefundedAmount, booking.currency)}</Text>
                    </View>
                    {Number(booking.totalChargedAmount || 0) > 0 ? (
                      <View style={styles.rowBetween}>
                        <Text style={[styles.fareLabel, { color: colors.rose[600] }]}>Cancellation charges</Text>
                        <Text style={[styles.fareValue, { color: colors.rose[600] }]}>{formatMoney(booking.totalChargedAmount, booking.currency)}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
                <Text style={[styles.payment, { color: P.textSecondary }]}>
                  Payment: {String(booking.payment?.status || 'paid').replace(/_/g, ' ')}
                  {booking.payment?.paymentId ? ` - ${booking.payment.paymentId}` : ''}
                </Text>
              </View>
            </View>

            {/* Rating Section */}
            <View style={[styles.bigCard, USER_SHADOW, card]}>
              <View style={[styles.rowBetween, { marginBottom: 24 }]}>
                <View style={[styles.row, { gap: 12 }]}>
                  <Star size={20} color={P.textPrimary} />
                  <Text style={[styles.h2, { color: P.textPrimary }]}>Your Review</Text>
                </View>
                {booking.review?.averageRating ? (
                  <View style={[styles.avgPill, { backgroundColor: P.cardSoft }]}>
                    <Star size={12} color={colors.amber[600]} fill={colors.amber[600]} />
                    <Text style={styles.avgText}>{Number(booking.review.averageRating).toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>

              {canRate ? (
                <View style={{ gap: 16 }}>
                  <View style={[styles.row, { justifyContent: 'center', gap: 8 }]}>
                    {[1, 2, 3, 4, 5].map((score) => {
                      const on = score <= selectedRating;
                      return (
                        <Pressable
                          key={score}
                          onPress={() => setSelectedRating(score)}
                          style={[styles.starBtn, { backgroundColor: on ? P.cardSoft : P.cardBg }]}
                        >
                          <Star size={24} color={on ? P.accent : colors.slate[200]} fill={on ? P.accent : 'transparent'} />
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    value={reviewComment}
                    onChangeText={setReviewComment}
                    placeholder="Tell us about your trip experience..."
                    multiline
                    textAlignVertical="top"
                    onFocus={() => setCommentFocused(true)}
                    onBlur={() => setCommentFocused(false)}
                    style={[
                      styles.textarea,
                      { backgroundColor: P.cardBg, borderColor: commentFocused ? P.accent : P.border, color: P.textPrimary },
                    ]}
                  />
                  <Pressable
                    onPress={handleSubmitReview}
                    disabled={savingReview || !selectedRating}
                    style={({ pressed }) => [styles.submit, USER_SHADOW, { backgroundColor: P.accent }, pressed && { transform: [{ scale: 0.98 }] }]}
                  >
                    <Text style={[styles.btnText, { color: P.accentInk }]}>{savingReview ? 'SAVING...' : 'SUBMIT REVIEW'}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.noReview, card]}>
                  <Info size={24} color={P.textSecondary} style={{ alignSelf: 'center', marginBottom: 8 }} />
                  <Text style={[styles.noReviewText, { color: P.textMuted }]}>
                    {booking.review?.tripCompleted
                      ? 'Review window is closed'
                      : 'You can rate this trip after completion'}
                  </Text>
                </View>
              )}
            </View>

            {/* Policy */}
            <View style={[styles.bigCard, USER_SHADOW, card]}>
              <View style={[styles.row, { gap: 12, marginBottom: 24 }]}>
                <ShieldAlert size={20} color={P.textPrimary} />
                <Text style={[styles.h2, { color: P.textPrimary }]}>Policies</Text>
              </View>
              <View style={{ gap: 16 }}>
                {(booking.cancellationPolicy?.rules || []).map((rule) => (
                  <View key={rule.id} style={[styles.infoBox, card]}>
                    <Text style={[styles.infoValue, { color: P.textPrimary }]}>{rule.label}</Text>
                    <View style={[styles.row, { gap: 8, marginTop: 8 }]}>
                      <Clock size={12} color={P.textSecondary} />
                      <Text style={[styles.ruleText, { color: P.textMuted }]}>{`${rule.hoursBeforeDeparture}h Before Departure`.toUpperCase()}</Text>
                    </View>
                    <View style={[styles.row, { gap: 8, marginTop: 4 }]}>
                      <ReceiptText size={12} color={P.textSecondary} />
                      <Text style={[styles.ruleText, { color: colors.emerald[600] }]}>
                        {(rule.refundType === 'percentage' ? `${rule.refundValue}% Refund` : `${formatMoney(rule.refundValue, booking.currency)} Refund`).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
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
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 24 },
  stateCard: { borderRadius: 24, padding: 48, borderWidth: 1, alignItems: 'center' },
  stateText: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  errorBox: { borderWidth: 1, borderColor: colors.rose[100], borderRadius: 16, padding: 16 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.rose[600], textAlign: 'center' },
  bigCard: { borderRadius: 32, borderWidth: 1, padding: 24 },
  ticketHead: { paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  pnr: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  city: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  cityTime: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  durPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 1 },
  durText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  dashed: { width: '100%', height: 1, borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 12 },
  infoBox: { flex: 1, borderRadius: 16, padding: 16, borderWidth: 1 },
  tinyLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', letterSpacing: 1.05 },
  infoValue: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  opType: { fontSize: 11, lineHeight: 16 },
  point: { paddingLeft: 24 },
  pointDot: { position: 'absolute', left: 0, top: 6, width: 8, height: 8, borderRadius: 4 },
  pointLine: { position: 'absolute', left: 3, top: 16, width: 2, height: 24 },
  pointLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', marginBottom: 2 },
  h2: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  seatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, borderWidth: 1 },
  seatSub: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  seatSubPlain: { fontSize: 10, lineHeight: 14 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkInner: { width: 10, height: 10, borderRadius: 2 },
  cancelledLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1 },
  refunded: { fontSize: 10.5, lineHeight: 14, fontWeight: '600' },
  preview: { marginTop: 24, padding: 20, borderRadius: 16, borderWidth: 1 },
  previewTitle: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6 },
  quoteCol: { flex: 1, alignItems: 'center' },
  quoteLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', marginBottom: 4 },
  cancelBtn: { width: '100%', marginTop: 20, paddingVertical: 16, backgroundColor: colors.rose[600], borderRadius: 16, alignItems: 'center' },
  btnText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
  fareLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  fareValue: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  totalRow: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 12 },
  totalLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.54 },
  totalValue: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  payment: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  avgPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999 },
  avgText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.amber[600] },
  starBtn: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  textarea: { width: '100%', minHeight: 120, borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  submit: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  noReview: { borderRadius: 16, padding: 24, borderWidth: 1 },
  noReviewText: { fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  ruleText: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1 },
});

export default BusBookingDetail;
