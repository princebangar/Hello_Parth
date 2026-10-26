// Web: pages/IncomingRideRequest.jsx — the ride request popup of the captain (Taxi Home and every other driver screen):
// countdown ring + bar, fare / earning, pickup / stops / drop, rider, bids, Accept / Decline; and the read-only
// "scheduled trip" preview (mode="preview") with Close / Cancel ride.
// Native: the web's fixed bottom panel (data-driver-overlay, above the bottom bar) is a Sheet (native Modal), so it
// covers the floating bottom bar. The countdown is computed from timestamps (requestExpiresAt, or the moment the request
// arrived + its duration), so it stays right after the app was in the background. A live request cannot be dismissed
// by tapping outside or with the back button (web: no outside tap / back for it); the preview closes on both.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { Bike, Car, Clock, Navigation, Phone, Package, X } from 'lucide-react-native';
import { Sheet, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { getScheduledRideCountdown } from '../utils/scheduledRideTime';

const DEFAULT_ACCEPT_REJECT_SECONDS = 15;

const normalizePayment = (value = '') => String(value || 'cash').toUpperCase();

const getRequestExpiryTime = (data, requestDurationSeconds) => {
  const safeData = data || {};
  const rawExpiryTime = safeData.requestExpiresAt || safeData.raw?.requestExpiresAt;
  const expiryTimestamp = rawExpiryTime ? new Date(rawExpiryTime).getTime() : NaN;

  if (Number.isFinite(expiryTimestamp) && expiryTimestamp > Date.now()) {
    return expiryTimestamp;
  }

  // Native: counted from the moment the request arrived (receivedAt, set by the socket listener), not from the moment
  // the popup could first draw (that can be later when the request came in while the app was in the background).
  const receivedAt = Number(safeData.receivedAt);
  const base = Number.isFinite(receivedAt) && receivedAt > 0 && receivedAt <= Date.now() ? receivedAt : Date.now();
  return base + (requestDurationSeconds * 1000);
};

const getRequestDurationSeconds = (data) => {
  const safeData = data || {};
  const rawDuration = safeData.acceptRejectDurationSeconds ||
    safeData.expiresInSeconds ||
    safeData.raw?.acceptRejectDurationSeconds ||
    safeData.raw?.expiresInSeconds;
  const duration = Number(rawDuration);

  return Number.isFinite(duration) && duration > 0
    ? Math.ceil(duration)
    : DEFAULT_ACCEPT_REJECT_SECONDS;
};

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Schedule time not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Schedule time not available';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const chunk = (list, size) => {
  const rows = [];
  for (let index = 0; index < list.length; index += size) rows.push(list.slice(index, index + size));
  return rows;
};

const BLUE = colors.blue[600];
const RING_SIZE = 52;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// web: conic-gradient(#2563eb p%, #e2e8f0 0) behind a 42px white disc
const CountdownRing = ({ progress, timer }) => (
  <View style={styles.ring}>
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <SvgCircle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke={colors.slate[200]} strokeWidth={RING_STROKE} fill="none" />
      <SvgCircle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={BLUE}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress / 100)}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </Svg>
    <View style={styles.ringInner}>
      <Text style={styles.ringText}>{String(timer)}</Text>
    </View>
  </View>
);

const ProgressBar = ({ progress }) => {
  const anim = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: progress, duration: 350, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [anim, progress]);
  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={[styles.progressFill, { width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }]}
      />
    </View>
  );
};

const PressScale = ({ style, disabled, onPress, children, disabledOpacity = 0.6, accessibilityLabel }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    style={({ pressed }) => [style, pressed && !disabled && styles.pressed, disabled && { opacity: disabledOpacity }]}
  >
    {children}
  </Pressable>
);

const RequestCard = ({
  data,
  timer,
  previewNow,
  requestDurationSeconds,
  isPreviewMode,
  onAccept,
  onDecline,
  onSubmitBid,
  onClose,
  isAccepting,
  onPreviewCancel,
  isPreviewCancelling,
  canPreviewCancel,
  previewCancelDisabledLabel,
}) => {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const maxCardHeight = Math.min(windowHeight - 24 - insets.top - Math.max(12, insets.bottom), 640);

  const isParcel = data.type === 'parcel';
  const isIntercity = data.type === 'intercity';
  const scheduledAt = data.scheduledAt || data.raw?.scheduledAt || data.raw?.ride?.scheduledAt || null;
  const isScheduledRequest = Boolean(scheduledAt);
  const title = isPreviewMode
    ? (isParcel ? 'Scheduled delivery' : isIntercity ? 'Scheduled intercity trip' : 'Scheduled ride')
    : (isScheduledRequest
      ? (isParcel ? 'Scheduled delivery request' : isIntercity ? 'Scheduled intercity request' : 'Scheduled ride request')
      : (isParcel ? 'New delivery request' : isIntercity ? 'New intercity request' : 'New ride request'));
  const intercityRoute = [data.raw?.intercity?.fromCity, data.raw?.intercity?.toCity].filter(Boolean).join(' to ');
  const category = data.raw?.parcel?.category || data.raw?.parcel?.weight || (isParcel ? 'Parcel delivery' : isIntercity ? intercityRoute || 'Intercity trip' : 'Passenger ride');
  const payment = normalizePayment(data.payment);
  const timerProgress = Math.max(0, Math.min(100, (timer / requestDurationSeconds) * 100));
  const pickupAddress = data.raw?.pickupAddress || data.pickup || 'Pickup point';
  const dropAddress = data.raw?.dropAddress || data.drop || 'Drop point';
  const rideStops = (Array.isArray(data.raw?.stops) ? data.raw.stops : Array.isArray(data.stops) ? data.stops : [])
    .map((stop) => String((stop && typeof stop === 'object' ? stop.address : stop) || '').trim())
    .filter(Boolean);
  const customerName = data.customer?.name || data.raw?.user?.name || 'Customer';
  const customerPhone = [data.customer?.countryCode, data.customer?.phone]
    .filter(Boolean)
    .join(' ')
    .trim() || data.raw?.user?.phone || '';
  const pricingNegotiationMode = String(data.raw?.pricingNegotiationMode || 'none').toLowerCase();
  const isBidding = pricingNegotiationMode === 'driver_bid' && (Boolean(data.raw?.bidding?.enabled) || String(data.raw?.bookingMode || '').toLowerCase() === 'bidding');
  const bidBaseFare = Number(data.raw?.bidding?.baseFare || data.raw?.baseFare || data.raw?.fare || 0);
  const bidFloorFare = Number(data.raw?.bidding?.bidFloorFare || bidBaseFare);
  const bidMaxFare = Number(data.raw?.bidding?.userMaxBidFare || data.raw?.userMaxBidFare || bidBaseFare);
  const bidStepAmount = Number(data.raw?.bidding?.bidStepAmount || 10);
  // The big number is what the driver earns (fare + promo paid by the platform - admin commission), not the rider fare.
  const requestFare = Number(data.raw?.fare || 0);
  const requestPromoDiscount = Math.max(0, Number(data.raw?.promoDiscount || 0));
  const requestCommissionType = Number(data.raw?.pricingSnapshot?.admin_commission_type_from_driver ?? 1);
  const requestCommissionValue = Math.max(0, Number(data.raw?.pricingSnapshot?.admin_commission_from_driver ?? 0));
  const requestGrossFare = requestFare + requestPromoDiscount;
  const requestCommission = requestCommissionType === 1
    ? Math.round(requestGrossFare * requestCommissionValue) / 100
    : Math.min(requestGrossFare, requestCommissionValue);
  const estimatedEarning = requestFare > 0 && !isBidding
    ? Math.max(0, Math.round((requestGrossFare - requestCommission) * 100) / 100)
    : null;
  const vehicleIconType = String(data.raw?.vehicleIconType || '').toLowerCase();
  const RideVehicleIcon = /bike|scooty|scooter/.test(vehicleIconType) ? Bike : Car;
  const tripMinutes = Math.round(Number(data.raw?.estimatedDurationMinutes || 0));
  const scheduledCountdown = getScheduledRideCountdown(scheduledAt, previewNow);
  const bidOptions = isBidding
    ? Array.from({ length: Math.max(1, Math.floor((bidMaxFare - bidFloorFare) / bidStepAmount) + 1) }, (_, index) => bidFloorFare + (index * bidStepAmount))
    : [];

  // One blue theme for every request type (taxi, parcel, intercity) - same as the rest of the driver apps.
  const TypeIcon = isParcel ? Package : isIntercity ? Navigation : RideVehicleIcon;
  const scheduleLine = isPreviewMode || isScheduledRequest ? formatScheduledDateTime(scheduledAt) : '';
  const closePreview = onClose || onDecline;
  const riderPreferences = Array.isArray(data.raw?.riderPreferences) ? data.raw.riderPreferences : [];

  return (
    <View style={[styles.card, { maxHeight: maxCardHeight }]}>
      {!isPreviewMode ? <ProgressBar progress={timerProgress} /> : null}

      {/* header */}
      <View style={styles.header}>
        <View style={styles.typeIcon}>
          <TypeIcon size={22} color={colors.white} />
        </View>
        <View style={styles.headerTexts}>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isPreviewMode ? 'Scheduled trip' : isScheduledRequest ? 'Scheduled request' : 'Ride offer'}
              </Text>
            </View>
          </View>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {scheduleLine ? `For ${scheduleLine}` : category}
          </Text>
        </View>
        {isPreviewMode ? (
          <PressScale onPress={closePreview} accessibilityLabel="Close" style={styles.closeBtn}>
            <X size={18} color={colors.slate[600]} />
          </PressScale>
        ) : (
          <CountdownRing progress={timerProgress} timer={timer} />
        )}
      </View>

      {/* body (scrolls on a short screen; the buttons below never leave the screen) */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        overScrollMode="never"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValue}>{data.distance || 'Nearby'}</Text>
            {tripMinutes > 0 ? <Text style={styles.statHint}>{`~${tripMinutes} min`}</Text> : null}
          </View>
          <View style={[styles.statCell, styles.statCellBlue]}>
            <Text style={[styles.statLabel, styles.statLabelOnBlue]}>{estimatedEarning !== null ? 'You earn' : 'Fare'}</Text>
            <Text style={styles.statFare}>{estimatedEarning !== null ? `Rs ${estimatedEarning}` : (data.fare || 'Rs 0')}</Text>
            {estimatedEarning !== null ? <Text style={styles.statFareHint}>{`Fare Rs ${requestFare}`}</Text> : null}
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Payment</Text>
            <View style={[styles.paymentPill, payment.includes('CASH') ? styles.paymentCash : styles.paymentOnline]}>
              <Text style={[styles.paymentText, { color: payment.includes('CASH') ? colors.amber[800] : colors.blue[800] }]}>
                {payment}
              </Text>
            </View>
          </View>
        </View>

        {isPreviewMode || isScheduledRequest ? (
          <View style={styles.scheduleBox}>
            <Clock size={18} color={BLUE} style={styles.scheduleIcon} />
            <View style={styles.flexShrink}>
              <Text style={styles.scheduleLine}>{scheduleLine}</Text>
              <Text style={styles.scheduleCountdown}>{scheduledCountdown}</Text>
              <Text style={styles.scheduleHint}>
                {isPreviewMode ? 'Booked for later. Cancel only if you cannot make this pickup.' : 'Accept only if you can commit to this pickup time.'}
              </Text>
            </View>
          </View>
        ) : null}

        {isIntercity ? (
          <View style={styles.intercityGrid}>
            <View style={styles.flexCell}>
              <Text style={styles.intercityLabel}>Trip</Text>
              <Text numberOfLines={1} style={styles.intercityValue}>{data.raw?.intercity?.tripType || 'Intercity'}</Text>
            </View>
            <View style={styles.flexCell}>
              <Text style={styles.intercityLabel}>Date</Text>
              <Text numberOfLines={1} style={styles.intercityValue}>{data.raw?.intercity?.travelDate || 'Today'}</Text>
            </View>
            <View style={styles.flexCell}>
              <Text style={styles.intercityLabel}>Pax</Text>
              <Text numberOfLines={1} style={styles.intercityValue}>{String(data.raw?.intercity?.passengers || 1)}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.routeBox}>
          <View style={styles.routeList}>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.emerald[100] }]}>
                <View style={[styles.routeDotInner, { backgroundColor: colors.emerald[600] }]} />
              </View>
              <View style={styles.flexCell}>
                <Text style={[styles.routeLabel, { color: colors.emerald[700] }]}>Pickup</Text>
                <Text style={styles.routeAddress}>{pickupAddress}</Text>
              </View>
            </View>
            {rideStops.map((stop, index) => (
              <View key={`stop-${index}`} style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: colors.amber[100] }]}>
                  <Text style={styles.stopNumber}>{String(index + 1)}</Text>
                </View>
                <View style={styles.flexCell}>
                  <Text style={[styles.routeLabel, { color: colors.amber[700] }]}>{`Stop ${index + 1}`}</Text>
                  <Text style={styles.routeAddress}>{stop}</Text>
                </View>
              </View>
            ))}
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.rose[100] }]}>
                <View style={[styles.routeDotInner, styles.routeDotSquare, { backgroundColor: colors.rose[600] }]} />
              </View>
              <View style={styles.flexCell}>
                <Text style={[styles.routeLabel, { color: colors.rose[700] }]}>Drop</Text>
                <Text style={styles.routeAddress}>{dropAddress}</Text>
              </View>
            </View>
          </View>
        </View>

        {riderPreferences.length > 0 ? (
          <View style={styles.prefsBox}>
            <Text style={styles.prefsLabel}>Rider wants</Text>
            <View style={styles.prefsList}>
              {riderPreferences.map((item) => (
                <View key={String(item)} style={styles.prefChip}>
                  <Text style={styles.prefChipText}>{String(item)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.riderBox}>
          <View style={styles.riderAvatar}>
            <Text style={styles.riderInitial}>{customerName.substring(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.flexCell}>
            <Text style={styles.riderLabel}>Rider</Text>
            <Text numberOfLines={1} style={styles.riderName}>{customerName}</Text>
          </View>
          {customerPhone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${String(customerPhone).replace(/\s+/g, '')}`).catch(() => {})}
              style={styles.callBtn}
            >
              <Phone size={11} strokeWidth={2.5} color={BLUE} />
              <Text style={styles.callText}>Call</Text>
            </Pressable>
          ) : null}
        </View>

        {isBidding && !isPreviewMode ? (
          <View style={styles.bidGrid}>
            {chunk(bidOptions.slice(0, 6), 3).map((row, rowIndex) => (
              <View key={`bid-row-${rowIndex}`} style={styles.bidRow}>
                {row.map((bidValue) => (
                  <PressScale
                    key={bidValue}
                    onPress={() => onSubmitBid?.(bidValue)}
                    disabled={isAccepting}
                    style={styles.bidBtn}
                  >
                    <Text style={styles.bidText}>{`Rs ${bidValue}`}</Text>
                  </PressScale>
                ))}
                {row.length < 3 ? Array.from({ length: 3 - row.length }).map((_, index) => (
                  <View key={`bid-gap-${index}`} style={styles.flexCell} />
                )) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* actions: always visible */}
      <View style={styles.actions}>
        {isPreviewMode ? (
          onPreviewCancel ? (
            <View style={styles.actionRow}>
              <PressScale onPress={closePreview} disabled={isPreviewCancelling} style={[styles.flexCell, styles.outlineBtn]}>
                <Text style={styles.outlineBtnText}>Close</Text>
              </PressScale>
              <PressScale
                onPress={() => {
                  if (canPreviewCancel) {
                    onPreviewCancel(data);
                  }
                }}
                disabled={isPreviewCancelling || !canPreviewCancel}
                style={[styles.flexCell, styles.roseBtn]}
              >
                <Text style={styles.solidBtnText}>
                  {isPreviewCancelling ? 'Cancelling...' : canPreviewCancel ? 'Cancel ride' : previewCancelDisabledLabel}
                </Text>
              </PressScale>
            </View>
          ) : (
            <PressScale onPress={closePreview} style={styles.blueBtnFull}>
              <Text style={styles.solidBtnText}>Close details</Text>
            </PressScale>
          )
        ) : (
          <>
            <View style={styles.actionRow}>
              <PressScale onPress={onDecline} disabled={isAccepting} accessibilityLabel="Decline" style={styles.declineBtn}>
                <X size={22} color={colors.slate[500]} />
              </PressScale>
              <PressScale
                onPress={() => (isBidding ? onSubmitBid?.(bidBaseFare) : onAccept(data))}
                disabled={isAccepting}
                disabledOpacity={0.7}
                style={styles.acceptBtn}
              >
                <Text style={styles.acceptText}>
                  {isAccepting ? (isBidding ? 'Submitting...' : 'Accepting...') : (isBidding ? 'Send Bid' : 'Accept ride')}
                </Text>
              </PressScale>
            </View>
            <Text style={styles.autoDecline}>Request auto-declines when the timer ends.</Text>
          </>
        )}
      </View>
    </View>
  );
};

const IncomingRideRequest = ({
  visible,
  onAccept,
  onDecline,
  onSubmitBid,
  onClose,
  requestData,
  isAccepting = false,
  onPreviewCancel,
  isPreviewCancelling = false,
  canPreviewCancel = true,
  previewCancelDisabledLabel = 'Cancel unavailable',
  // web: accepted but never shown
  previewCancelHelpText = '',
  mode = 'live',
}) => {
  const insets = useSafeAreaInsets();
  const isPreviewMode = mode === 'preview';
  const requestDurationSeconds = getRequestDurationSeconds(requestData);
  const [timer, setTimer] = useState(requestDurationSeconds);
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  const data = requestData;
  const onDeclineRef = useRef(onDecline);
  onDeclineRef.current = onDecline;
  // One fixed expiry per ride request, so parent re-renders can never restart the countdown.
  const expiryRef = useRef({ key: '', expiresAt: 0 });
  // the last request stays drawn while the sheet slides away
  const lastDataRef = useRef(null);
  if (visible && data) lastDataRef.current = data;
  const shownData = visible && data ? data : lastDataRef.current;

  useEffect(() => {
    if (isPreviewMode || !visible || !data?.rideId) {
      return undefined;
    }

    const requestKey = `${data.rideId}|${data.requestExpiresAt || data.raw?.requestExpiresAt || ''}`;
    if (expiryRef.current.key !== requestKey) {
      expiryRef.current = { key: requestKey, expiresAt: getRequestExpiryTime(data, requestDurationSeconds) };
    }
    const { expiresAt } = expiryRef.current;
    let hasExpired = false;

    const syncTimer = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimer(remainingSeconds);

      if (!hasExpired && remainingSeconds <= 0) {
        hasExpired = true;
        onDeclineRef.current?.();
      }
    };

    syncTimer();
    const interval = setInterval(syncTimer, 250);

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same triggers as the web (one countdown per request)
  }, [visible, requestDurationSeconds, data?.rideId, data?.requestExpiresAt, isPreviewMode]);

  useEffect(() => {
    if (!visible || !isPreviewMode) {
      return undefined;
    }

    setPreviewNow(Date.now());
    const interval = setInterval(() => {
      setPreviewNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [visible, isPreviewMode]);

  const open = Boolean(visible && data);

  return (
    <Sheet
      open={open}
      onClose={() => (onClose || onDecline)?.()}
      dismissible={isPreviewMode}
      backdropOpacity={0.5}
      style={[styles.sheet, { paddingBottom: Math.max(12, insets.bottom) }]}
    >
      {shownData ? (
        <RequestCard
          data={shownData}
          timer={timer}
          previewNow={previewNow}
          requestDurationSeconds={getRequestDurationSeconds(shownData)}
          isPreviewMode={isPreviewMode}
          onAccept={onAccept}
          onDecline={onDecline}
          onSubmitBid={onSubmitBid}
          onClose={onClose}
          isAccepting={isAccepting}
          onPreviewCancel={onPreviewCancel}
          isPreviewCancelling={isPreviewCancelling}
          canPreviewCancel={canPreviewCancel}
          previewCancelDisabledLabel={previewCancelDisabledLabel}
        />
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  // web: fixed inset-0 flex items-end justify-center bg-slate-950/50 px-3 pt-3 pb-[max(0.75rem,safe-area)]
  sheet: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'visible',
    paddingHorizontal: 12,
    paddingTop: 12,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 26,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 35,
    shadowOffset: { width: 0, height: 24 },
    elevation: 24,
  },
  progressTrack: { height: 4, width: '100%', backgroundColor: colors.slate[100] },
  progressFill: { height: '100%', backgroundColor: BLUE },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  typeIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  headerTexts: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row' },
  badge: { borderRadius: 9999, backgroundColor: colors.blue[50], paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45, color: BLUE },
  title: { marginTop: 2, fontSize: 17, lineHeight: 21, fontWeight: '900', color: colors.slate[900] },
  subtitle: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: 17, lineHeight: 17, fontWeight: '900', color: colors.slate[900] },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingHorizontal: 16, paddingVertical: 12 },
  statsGrid: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: alpha(colors.slate[50], 0.6),
  },
  statCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  statCellBlue: { backgroundColor: BLUE },
  statLabel: { fontSize: 9, lineHeight: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.45, color: colors.slate[400], textAlign: 'center' },
  statLabelOnBlue: { color: alpha(colors.white, 0.85) },
  statValue: { marginTop: 2, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[800], textAlign: 'center' },
  statHint: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400], textAlign: 'center' },
  statFare: { marginTop: 2, fontSize: 20, lineHeight: 22, fontWeight: '900', color: colors.white, textAlign: 'center' },
  statFareHint: { marginTop: 2, fontSize: 9, lineHeight: 13, fontWeight: '700', color: alpha(colors.white, 0.8), textAlign: 'center' },
  paymentPill: { marginTop: 4, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
  paymentCash: { backgroundColor: colors.amber[100] },
  paymentOnline: { backgroundColor: colors.blue[100] },
  paymentText: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
  scheduleBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.blue[100],
    backgroundColor: alpha(colors.blue[50], 0.6),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scheduleIcon: { marginTop: 2 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  scheduleLine: { fontSize: 13, lineHeight: 18, fontWeight: '900', color: colors.slate[800] },
  scheduleCountdown: { fontSize: 11, lineHeight: 16, fontWeight: '900', color: BLUE },
  scheduleHint: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  intercityGrid: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.blue[100],
    backgroundColor: alpha(colors.blue[50], 0.4),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  flexCell: { flex: 1, minWidth: 0 },
  intercityLabel: { fontSize: 9, lineHeight: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.45, color: colors.slate[400] },
  intercityValue: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: colors.slate[800] },
  routeBox: { marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 12 },
  routeList: { gap: 14 },
  routeLine: { position: 'absolute', top: 12, bottom: 12, left: 8, width: 2, backgroundColor: colors.slate[100] },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: { zIndex: 1, marginTop: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  routeDotInner: { width: 8, height: 8, borderRadius: 4 },
  routeDotSquare: { borderRadius: 2 },
  stopNumber: { fontSize: 9, lineHeight: 12, fontWeight: '900', color: colors.amber[700] },
  routeLabel: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45 },
  routeAddress: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.slate[800] },
  prefsBox: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.blue[100],
    backgroundColor: alpha(colors.blue[50], 0.5),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  prefsLabel: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45, color: BLUE },
  prefsList: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prefChip: {
    borderRadius: 9999,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  prefChipText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[700] },
  riderBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: alpha(colors.slate[50], 0.5),
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  riderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderInitial: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: colors.slate[600] },
  riderLabel: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45, color: colors.slate[400] },
  riderName: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: colors.slate[800] },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9999,
    backgroundColor: colors.blue[50],
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  callText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: BLUE },
  bidGrid: { marginTop: 12, gap: 8 },
  bidRow: { flexDirection: 'row', gap: 8 },
  bidBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.blue[100],
    backgroundColor: colors.blue[50],
    paddingVertical: 8,
    alignItems: 'center',
  },
  bidText: { fontSize: 11, lineHeight: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.275, color: BLUE },
  actions: { borderTopWidth: 1, borderTopColor: colors.slate[100], backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  outlineBtn: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.44, color: colors.slate[600] },
  roseBtn: { height: 48, borderRadius: 16, backgroundColor: colors.rose[500], paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  solidBtnText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.44, color: colors.white, textAlign: 'center' },
  blueBtnFull: { height: 48, width: '100%', borderRadius: 16, backgroundColor: BLUE, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  declineBtn: {
    width: 64,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: BLUE,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  acceptText: { fontSize: 13, lineHeight: 18, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.56, color: colors.white },
  autoDecline: { marginTop: 8, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400] },
  pressed: { transform: [{ scale: 0.95 }] },
});

export default IncomingRideRequest;
