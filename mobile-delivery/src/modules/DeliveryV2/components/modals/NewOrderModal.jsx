// Web: components/modals/NewOrderModal.jsx — the incoming order popup on the Feed (earnings header + mute, pickup / drop
// with call + navigate, time / distance, Slide to Accept, Pass this task). Native: a bottom Sheet (the web's fixed
// inset-0 bg-black/60 panel above the bottom bar); a tap on the dim backdrop does nothing like on the web, the Android
// back button minimizes it (same as the handle). tel: / Google Maps links open with Linking.
import React, { useEffect, useMemo } from 'react';
import { BackHandler, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Clock, Phone, ChefHat, ChevronDown, Volume2, VolumeX, Navigation } from 'lucide-react-native';
import { Sheet, Text } from '@/native/ui';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';
import { toast } from '@/lib/toast';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { computePickupMetrics } from '@/modules/DeliveryV2/utils/pickupMetrics';
import { PickupMetricsValue } from '@/modules/DeliveryV2/components/orders/NewOrderCard';

const openUrl = (url) => {
  Linking.openURL(url).catch(() => {});
};

/**
 * NewOrderModal - Ported to Original 1:1 Theme with Slider Accept.
 * Matches the Hello Parth style Green Header + White Card.
 */
export const NewOrderModal = ({ order, onAccept, onReject, onMinimize, isMuted = false, onToggleMute }) => {
  const { riderLocation } = useDeliveryStore();

  const metrics = useMemo(
    () => computePickupMetrics(order, riderLocation),
    [order, riderLocation],
  );

  useEffect(() => {
    if (!order) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onMinimize?.();
      return true;
    });
    return () => sub.remove();
  }, [order, onMinimize]);

  if (!order) return null;

  // Only what the server says the rider earns — never an estimate.
  const earnings = order.earnings || order.riderEarning || 0;
  // "FOD-…" number (skip bare Mongo ids).
  const displayOrderId = [order.displayOrderId, order.orderId, order.order_id]
    .map((v) => String(v || '').trim())
    .find((v) => v && !/^[0-9a-f]{24}$/i.test(v)) || '';
  const restaurantName = order.restaurantName || order.restaurant_name || (order.restaurantId?.name) || 'Restaurant';
  const restaurantAddress = order.restaurantAddress || order.restaurant_address || (order.restaurantId?.location?.address) || 'Address not available';
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
  const customerName =
    order.customerName ||
    order.userId?.name ||
    order.user?.name ||
    order.deliveryAddress?.fullName ||
    order.deliveryAddress?.name ||
    'Customer';
  const customerPhone =
    order.customerPhone ||
    order.userPhone ||
    order.userId?.phone ||
    order.user?.phone ||
    order.deliveryAddress?.phone ||
    '';

  const addressPartsFromSchema = [
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  const customerAddress =
    order.customerAddress ||
    order.customer_address ||
    (addressPartsFromSchema.length ? addressPartsFromSchema.join(', ') : '') ||
    (customerLocation?.lat != null && customerLocation?.lng != null
      ? `Lat ${Number(customerLocation.lat).toFixed(5)}, Lng ${Number(customerLocation.lng).toFixed(5)}`
      : 'Location not available');

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
    <Sheet open onClose={onMinimize} dismissible={false} backdropOpacity={0.6} style={styles.sheet}>
      {/* Handle / Minimize */}
      <View style={styles.handleRow}>
        <Pressable onPress={onMinimize} style={({ pressed }) => [styles.handleBtn, pressed && styles.pressed]}>
          <ChevronDown size={24} color={colors.gray[400]} strokeWidth={3} />
        </Pressable>
      </View>

      {/* Header Ribbon */}
      <LinearGradient
        colors={['#15498b', '#000000']}
        start={{ x: 0.23, y: 0.85 }}
        end={{ x: 0.77, y: 0.15 }}
        style={styles.ribbon}
      >
        <View style={styles.flexMin}>
          <Text style={styles.ribbonKicker} numberOfLines={1}>
            {`Incoming Request${displayOrderId ? ` · #${displayOrderId}` : ''}`}
          </Text>
          <Text style={styles.ribbonAmount}>{`₹${Number(earnings || 0).toFixed(2)}`}</Text>
        </View>
        {onToggleMute ? (
          <Pressable
            onPress={() => onToggleMute()}
            style={[styles.muteBtn, isMuted ? styles.muteBtnOn : styles.muteBtnOff]}
            accessibilityLabel={isMuted ? 'Unmute order alerts' : 'Mute order alerts'}
          >
            {isMuted ? <VolumeX size={20} color={colors.rose[300]} /> : <Volume2 size={20} color={colors.white} />}
          </Pressable>
        ) : null}
      </LinearGradient>

      {/* Info Body */}
      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body} bounces={false}>
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
                  <ChefHat size={16} color={deliveryTheme.primary} />
                  <Text style={styles.stopKicker}>Restaurant Pickup</Text>
                </View>
                <Text style={styles.stopName} numberOfLines={2}>{restaurantName}</Text>
                <Text style={styles.stopSub} numberOfLines={2}>{restaurantAddress}</Text>
              </View>
              <View style={styles.stopBtns}>
                <Pressable onPress={handleCallRestaurant} style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]} accessibilityLabel="Call restaurant">
                  <Phone size={20} color={deliveryTheme.primary} />
                </Pressable>
                <Pressable onPress={handleNavigateToRestaurant} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} accessibilityLabel="Navigate to restaurant">
                  <Navigation size={20} color={colors.white} />
                </Pressable>
              </View>
            </View>

            <View style={styles.stopRow}>
              <View style={styles.stopText}>
                <View style={styles.stopKickerRow}>
                  <MapPin size={16} color={deliveryTheme.primary} />
                  <Text style={styles.stopKicker}>Customer Drop</Text>
                </View>
                <Text style={styles.stopName} numberOfLines={2}>{customerName}</Text>
                {customerPhone ? <Text style={styles.stopPhone}>{customerPhone}</Text> : null}
                <Text style={styles.stopSub} numberOfLines={2}>{customerAddress}</Text>
              </View>
              <View style={styles.stopBtns}>
                <Pressable onPress={handleCallCustomer} style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]} accessibilityLabel="Call customer">
                  <Phone size={20} color={deliveryTheme.primary} />
                </Pressable>
                <Pressable onPress={handleNavigateToCustomer} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} accessibilityLabel="Navigate to customer">
                  <Navigation size={20} color={colors.white} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metricCell}>
            <Clock size={20} color={deliveryTheme.primary} />
            <PickupMetricsValue metrics={metrics} label="Time" unit="min" />
          </View>
          <View style={styles.metricCell}>
            <MapPin size={20} color={colors.gray[400]} />
            <PickupMetricsValue metrics={metrics} label="Distance" unit="km" />
          </View>
        </View>
      </ScrollView>

      {/* Action Area: pinned under the scrolling details so the slider is always on screen */}
      <View style={styles.actions}>
        <ActionSlider
          label="Slide to Accept"
          onConfirm={() => onAccept(order)}
          color="bg-black"
          successLabel="Order Accepted ✓"
        />

        <Pressable onPress={onReject} style={({ pressed }) => [styles.passBtn, pressed && styles.pressed]}>
          <Text style={styles.passText}>Pass this task</Text>
        </Pressable>
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.white,
    maxHeight: '92%',
    paddingTop: 4,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: -20 },
  },
  handleRow: { width: '100%', alignItems: 'center', paddingBottom: 6, paddingTop: 4, marginBottom: -4, zIndex: 10, backgroundColor: colors.white },
  handleBtn: { padding: 4, borderRadius: 9999 },
  pressed: { transform: [{ scale: 0.95 }] },
  ribbon: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.white, 0.1),
  },
  flexMin: { flex: 1, minWidth: 0 },
  ribbonKicker: { color: alpha(colors.white, 0.8), fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  ribbonAmount: { color: colors.white, fontSize: 20, lineHeight: 28, fontFamily: fonts.sora, fontWeight: '700', letterSpacing: -1 },
  muteBtn: { borderRadius: 9999, padding: 10, borderWidth: 1 },
  muteBtnOn: { backgroundColor: alpha(colors.rose[500], 0.2), borderColor: alpha(colors.rose[500], 0.3) },
  muteBtnOff: { backgroundColor: alpha(colors.white, 0.1), borderColor: alpha(colors.white, 0.2) },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  route: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', gap: 4, marginTop: 6, paddingVertical: 4 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  dotPickup: { backgroundColor: deliveryTheme.primary, borderColor: colors.green[50] },
  dotDrop: { backgroundColor: deliveryTheme.primary, borderColor: colors.blue[50] },
  dash: { width: 2, flex: 1, minHeight: 32, borderLeftWidth: 2, borderColor: colors.gray[100] },
  stops: { flex: 1, minWidth: 0, gap: 12 },
  stopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stopText: { flex: 1, minWidth: 0, paddingRight: 8 },
  stopKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  stopKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: deliveryTheme.primary },
  stopName: { color: colors.gray[950], fontWeight: '700', fontSize: 14, lineHeight: 17 },
  stopPhone: { color: colors.gray[500], fontSize: 12, lineHeight: 16, fontWeight: '500' },
  stopSub: { color: colors.gray[500], fontSize: 12, lineHeight: 17, fontWeight: '500' },
  stopBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: deliveryTheme.primarySoft,
    borderWidth: 1,
    borderColor: deliveryTheme.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray[900], alignItems: 'center', justifyContent: 'center', elevation: 4 },
  metrics: { flexDirection: 'row', gap: 8 },
  metricCell: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.gray[50],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: deliveryTheme.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#112743',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  actions: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray[100], gap: 4 },
  passBtn: { width: '100%', paddingVertical: 8, alignItems: 'center' },
  passText: { color: colors.gray[400], fontWeight: '700', fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1 },
});

export default NewOrderModal;
