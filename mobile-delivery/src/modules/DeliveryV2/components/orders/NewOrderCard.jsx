// Web: components/orders/NewOrderCard.jsx — one order request in the Orders tab (collapsed row; expanded: pickup / drop,
// call + navigate buttons, time / distance, Slide to Accept, Pass). Also exports PickupMetricsValue (used by
// NewOrderModal). Native: tel: / Google Maps links open with Linking; the web's "scroll the opened card above the
// bottom bar" (window.scrollBy) is done by the screen's list: the card measures how far it reaches under the bar and
// hands that to the optional `onRequestScroll(overlap)` prop (OrdersV2 scrolls its ScrollView by it).
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Dimensions, Linking, Pressable, StyleSheet, View } from 'react-native';
import {
  ChefHat,
  ChevronDown,
  Clock,
  Lock,
  MapPin,
  Package,
  Volume2,
  VolumeX,
  Phone,
  Navigation,
} from 'lucide-react-native';
import { Text } from '@/native/ui';
import { colors, deliveryTheme, fonts } from '@/theme';
import { toast } from '@/lib/toast';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { computePickupMetrics, formatPickupRouteSummary } from '@/modules/DeliveryV2/utils/pickupMetrics';

/** Time / distance cell — live values or locating state (shared with NewOrderModal). */
export function PickupMetricsValue({ metrics, label, unit, style }) {
  const isReady = metrics?.isReady;

  return (
    <View style={style}>
      <Text style={metricStyles.label}>{label}</Text>
      {isReady ? (
        <Text style={metricStyles.value}>
          {unit === 'km'
            ? `${Number(metrics.distanceKm).toFixed(1)} km`
            : `${metrics.etaMins} mins`}
        </Text>
      ) : (
        <View style={metricStyles.locatingRow}>
          <ActivityIndicator size={14} color={colors.gray[500]} />
          <Text style={metricStyles.locating}>Locating…</Text>
        </View>
      )}
    </View>
  );
}

const metricStyles = StyleSheet.create({
  label: { fontSize: 10, lineHeight: 14, color: colors.gray[400], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900], fontVariant: ['tabular-nums'] },
  locatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locating: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[500] },
});

const openUrl = (url) => {
  Linking.openURL(url).catch(() => {});
};

export default function NewOrderCard({
  order,
  onAccept,
  onReject,
  acceptDisabled = false,
  disabledMessage = 'Complete an active order to accept more',
  expanded = false,
  onToggle,
  isMuted = false,
  onToggleMute,
  onRequestScroll,
}) {
  const riderLocation = useDeliveryStore((state) => state.riderLocation);
  const cardRef = useRef(null);

  // When the card opens, bring all of it (slider included) above the floating bottom bar.
  useEffect(() => {
    if (!expanded) return undefined;
    const timer = setTimeout(() => {
      // Scroll just far enough that the card's bottom (the slider) sits above the bar; on a short
      // phone the card's top may scroll away, but the slider must never stay under the bar.
      cardRef.current?.measureInWindow?.((x, y, w, h) => {
        const overlap = y + h - (Dimensions.get('window').height - 112);
        if (overlap > 0) onRequestScroll?.(overlap);
      });
    }, 160);
    return () => clearTimeout(timer);
  }, [expanded, onRequestScroll]);

  const metrics = useMemo(
    () => computePickupMetrics(order, riderLocation),
    [order, riderLocation],
  );
  const routeSummary = formatPickupRouteSummary(metrics);

  if (!order) return null;

  const earnings =
    order.earnings ||
    order.riderEarning ||
    0;
  const displayId = order?.orderId || order?.displayOrderId || order?._id;
  const restaurantName =
    order.restaurantName ||
    order.restaurant_name ||
    order.restaurantId?.restaurantName ||
    order.restaurantId?.name ||
    'Restaurant';
  const restaurantAddress =
    order.restaurantAddress ||
    order.restaurant_address ||
    order.restaurantId?.addressLine1 ||
    order.restaurantId?.location?.address ||
    'Address not available';
  const restaurantPhone =
    order.restaurantPhone ||
    order.restaurant_phone ||
    order.restaurantId?.primaryContactNumber ||
    order.restaurantId?.ownerPhone ||
    order.restaurantId?.phone ||
    '';
  const deliveryAddress = order?.deliveryAddress || {};
  const geoCoords =
    Array.isArray(deliveryAddress?.location?.coordinates) &&
    deliveryAddress.location.coordinates.length >= 2
      ? {
          lng: deliveryAddress.location.coordinates[0],
          lat: deliveryAddress.location.coordinates[1],
        }
      : null;
  const customerLocation = order.customerLocation || order.deliveryLocation || geoCoords || null;
  const addressPartsFromSchema = [
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const customerAddress =
    order.customerAddress ||
    order.customer_address ||
    (addressPartsFromSchema.length ? addressPartsFromSchema.join(', ') : '') ||
    (customerLocation?.lat != null && customerLocation?.lng != null
      ? `Lat ${Number(customerLocation.lat).toFixed(5)}, Lng ${Number(customerLocation.lng).toFixed(5)}`
      : 'Location not available');
  const customerName =
    order.userId?.name || order.customerName || order.user?.name || 'Customer';
  const customerPhone = order.userId?.phone || order.customerPhone || order.user?.phone || '';

  const handleCallRestaurant = () => {
    const num = String(restaurantPhone || '').replace(/\D/g, '');
    if (!num) {
      toast.error('Restaurant phone number not available');
      return;
    }
    openUrl(`tel:${num}`);
  };

  const handleNavigateToRestaurant = () => {
    const restCoords = order.restaurantLocation || order.restaurantId?.location || null;
    const lat = parseFloat(restCoords?.lat ?? restCoords?.latitude);
    const lng = parseFloat(restCoords?.lng ?? restCoords?.longitude);
    let mapsUrl;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    } else if (restaurantAddress) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurantAddress)}&travelmode=driving`;
    } else {
      toast.error('Restaurant location not available');
      return;
    }
    openUrl(mapsUrl);
  };

  const handleCallCustomer = () => {
    const num = String(customerPhone || '').replace(/\D/g, '');
    if (!num) {
      toast.error('Customer phone number not available');
      return;
    }
    openUrl(`tel:${num}`);
  };

  const handleNavigateToCustomer = () => {
    const lat = parseFloat(customerLocation?.lat ?? customerLocation?.latitude);
    const lng = parseFloat(customerLocation?.lng ?? customerLocation?.longitude);
    let mapsUrl;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    } else if (customerAddress) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customerAddress)}&travelmode=driving`;
    } else {
      toast.error('Customer location not available');
      return;
    }
    openUrl(mapsUrl);
  };

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={[styles.card, expanded ? styles.cardExpanded : styles.cardCollapsed]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => onToggle?.()}
          style={({ pressed }) => [styles.headerMain, pressed && { transform: [{ scale: 0.99 }] }]}
        >
          <View style={styles.headerIcon}>
            <Package size={20} color={colors.white} />
          </View>
          <View style={styles.flexMin}>
            <Text style={styles.kicker}>{`New Order #${displayId}`}</Text>
            <Text style={styles.restaurantTitle} numberOfLines={1}>{restaurantName}</Text>
            <Text style={[styles.summary, { color: metrics.isReady ? deliveryTheme.primary : colors.gray[500] }]}>
              {`₹${Number(earnings || 0).toFixed(2)} · ${routeSummary}`}
            </Text>
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          {acceptDisabled ? (
            <View style={styles.lockBadge}>
              <Lock size={14} color={colors.gray[500]} />
            </View>
          ) : null}
          <Pressable
            onPress={() => onToggleMute?.()}
            style={[styles.roundBtn, isMuted && styles.mutedBtn]}
            accessibilityLabel={isMuted ? 'Unmute order alerts' : 'Mute order alerts'}
          >
            {isMuted ? <VolumeX size={16} color={colors.red[600]} /> : <Volume2 size={16} color={colors.gray[500]} />}
          </Pressable>
          <Pressable
            onPress={() => onToggle?.()}
            style={styles.roundBtn}
            accessibilityLabel={expanded ? 'Collapse order' : 'Expand order'}
          >
            <View style={expanded ? styles.rotated : null}>
              <ChevronDown size={20} color={colors.gray[400]} />
            </View>
          </Pressable>
        </View>
      </View>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.route}>
            <View style={styles.rail}>
              <View style={[styles.dot, styles.dotPickup]} />
              <View style={styles.dash} />
              <View style={[styles.dot, styles.dotDrop]} />
            </View>
            <View style={styles.stops}>
              <View style={styles.stopRow}>
                <View style={styles.stopText}>
                  <View style={styles.stopKickerRow}>
                    <ChefHat size={14} color={deliveryTheme.primary} />
                    <Text style={styles.stopKicker}>Restaurant Pickup</Text>
                  </View>
                  <Text style={styles.stopName} numberOfLines={2}>{restaurantName}</Text>
                  <Text style={styles.stopSub} numberOfLines={2}>{restaurantAddress}</Text>
                </View>
                <View style={styles.stopBtns}>
                  <Pressable onPress={handleCallRestaurant} style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]} accessibilityLabel="Call restaurant">
                    <Phone size={16} color={deliveryTheme.primary} />
                  </Pressable>
                  <Pressable onPress={handleNavigateToRestaurant} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} accessibilityLabel="Navigate to restaurant">
                    <Navigation size={16} color={colors.white} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.stopRow}>
                <View style={styles.stopText}>
                  <View style={styles.stopKickerRow}>
                    <MapPin size={14} color={deliveryTheme.primary} />
                    <Text style={styles.stopKicker}>Customer Drop</Text>
                  </View>
                  <Text style={styles.stopName} numberOfLines={2}>{customerName}</Text>
                  {customerPhone ? <Text style={styles.stopSub}>{customerPhone}</Text> : null}
                  <Text style={styles.stopSub} numberOfLines={2}>{customerAddress}</Text>
                </View>
                <View style={styles.stopBtns}>
                  <Pressable onPress={handleCallCustomer} style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]} accessibilityLabel="Call customer">
                    <Phone size={16} color={deliveryTheme.primary} />
                  </Pressable>
                  <Pressable onPress={handleNavigateToCustomer} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} accessibilityLabel="Navigate to customer">
                    <Navigation size={16} color={colors.white} />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.metrics}>
            <View style={styles.metricCell}>
              <Clock size={16} color={deliveryTheme.primary} />
              <PickupMetricsValue metrics={metrics} label="Time" unit="min" />
            </View>
            <View style={styles.metricCell}>
              <MapPin size={16} color={colors.gray[400]} />
              <PickupMetricsValue metrics={metrics} label="Distance" unit="km" />
            </View>
          </View>

          {acceptDisabled ? (
            <View style={styles.disabledBox}>
              <Lock size={16} color={colors.amber[700]} style={styles.disabledIcon} />
              <Text style={styles.disabledText}>{disabledMessage}</Text>
            </View>
          ) : (
            <ActionSlider
              label="Slide to Accept"
              onConfirm={() => onAccept?.(order)}
              color="bg-black"
              successLabel="Order Accepted"
            />
          )}

          <Pressable onPress={() => onReject?.(order)} style={styles.passBtn}>
            {({ pressed }) => <Text style={[styles.passText, pressed && { color: colors.red[500] }]}>Pass this task</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const roundedShadow = {
  elevation: 3,
  shadowColor: '#112743',
  shadowOpacity: 0.24,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 10 },
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, overflow: 'hidden', ...roundedShadow },
  cardExpanded: { borderColor: deliveryTheme.primaryBorder, elevation: 6, shadowColor: deliveryTheme.primary, shadowOpacity: 0.1 },
  cardCollapsed: { borderColor: deliveryTheme.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },
  headerMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#15498b', alignItems: 'center', justifyContent: 'center' },
  flexMin: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.gray[400] },
  restaurantTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[950] },
  summary: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockBadge: { borderRadius: 9999, backgroundColor: colors.gray[100], borderWidth: 1, borderColor: colors.gray[200], padding: 6 },
  roundBtn: { borderRadius: 9999, padding: 8, borderWidth: 1, borderColor: 'transparent' },
  mutedBtn: { backgroundColor: colors.red[50], borderColor: colors.red[200] },
  rotated: { transform: [{ rotate: '180deg' }] },
  body: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 12, gap: 12, borderTopWidth: 1, borderTopColor: colors.gray[100] },
  route: { flexDirection: 'row', gap: 10 },
  rail: { alignItems: 'center', gap: 4, marginTop: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  dotPickup: { backgroundColor: deliveryTheme.primary, borderColor: colors.green[50] },
  dotDrop: { backgroundColor: deliveryTheme.primary, borderColor: colors.blue[50] },
  dash: { width: 2, flex: 1, minHeight: 24, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: colors.gray[200] },
  stops: { flex: 1, minWidth: 0, gap: 12 },
  stopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stopText: { flex: 1, minWidth: 0, paddingRight: 8 },
  stopKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  stopKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: deliveryTheme.primary },
  stopName: { fontSize: 14, lineHeight: 17, fontWeight: '700', color: colors.gray[950] },
  stopSub: { fontSize: 12, lineHeight: 17, color: colors.gray[500] },
  stopBtns: { flexDirection: 'row', gap: 6, marginTop: 4 },
  callBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: deliveryTheme.primarySoft,
    borderWidth: 1,
    borderColor: deliveryTheme.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[900], alignItems: 'center', justifyContent: 'center', elevation: 4 },
  pressed: { transform: [{ scale: 0.95 }] },
  metrics: { flexDirection: 'row', gap: 8 },
  metricCell: { flex: 1, padding: 8, backgroundColor: colors.gray[50], borderRadius: 14, borderWidth: 1, borderColor: colors.gray[100], flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabledBox: { borderRadius: 16, backgroundColor: colors.amber[50], borderWidth: 1, borderColor: deliveryTheme.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8, ...roundedShadow },
  disabledIcon: { marginTop: 2 },
  disabledText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.amber[800] },
  passBtn: { width: '100%', paddingVertical: 6, alignItems: 'center' },
  passText: { color: colors.gray[400], fontWeight: '700', fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1 },
});
