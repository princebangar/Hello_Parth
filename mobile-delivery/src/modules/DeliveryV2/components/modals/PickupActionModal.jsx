// Web: components/modals/PickupActionModal.jsx — the pickup panel on the Feed (restaurant + customer cards with call /
// navigate, Slide to Reach, bill photo upload (camera / gallery), Slide to Pick Up, user note, order items).
// Native: the web panel was `fixed inset-x-0 top-0 bottom-[92px]` so the bottom bar stayed reachable (multi-order: the
// rider must still open the Orders tab); here it is an absolute layer inside the Feed screen that DeliveryHomeV2 sizes
// to end above the bottom bar (not a native Modal, which would cover the bar). The photo comes from the system camera /
// gallery (@food/utils/imageUploadUtils openCamera / openGallery, same calls) and is uploaded with the same
// uploadAPI.uploadMedia(file, { folder: 'helloparth/delivery/bills' }). tel: / Google Maps links open with Linking.
import React, { useState } from 'react';
import { ActivityIndicator, Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ChefHat, MapPin, Phone,
  ChevronDown, ChevronUp, Package,
  Navigation, CheckCircle2, Camera, Image as ImageIcon,
} from 'lucide-react-native';
import { AppImage, Text, useBottomNavSpace } from '@/native/ui';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';
import { toast } from '@/lib/toast';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { uploadAPI } from '@food/api';
import { showUserFacingApiError } from '@/shared/utils/apiError';
import { formatTripDistanceKm } from '@/modules/DeliveryV2/hooks/useProximityCheck';
import { openCamera, openGallery } from '@food/utils/imageUploadUtils';

const openUrl = (url) => {
  Linking.openURL(url).catch(() => {});
};

/**
 * PickupActionModal - Unified White/Green Theme with Slider Actions.
 * Includes Bill Upload feature prior to pickup.
 */
export const PickupActionModal = ({
  order,
  status,
  isWithinRange,
  distanceToTarget,
  eta,
  onReachedPickup,
  onPickedUp,
  onMinimize,
}) => {
  const [showItems, setShowItems] = useState(false);
  const [isUploadingBill, setIsUploadingBill] = useState(false);
  const [billImageUploaded, setBillImageUploaded] = useState(false);
  const [billImageUrl, setBillImageUrl] = useState(null);
  // web: bottom-[92px] (the bottom bar stays reachable)
  const navSpace = useBottomNavSpace(-4);

  if (!order) return null;

  const handleBillImageSelect = async (file) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    setIsUploadingBill(true);
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: 'helloparth/delivery/bills' });
      if (res?.data?.success && res?.data?.data) {
        setBillImageUrl(res.data.data.url || res.data.data.secure_url);
        setBillImageUploaded(true);
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      showUserFacingApiError(err, 'Failed to upload bill image');
      setBillImageUploaded(false);
      setBillImageUrl(null);
    } finally {
      setIsUploadingBill(false);
    }
  };

  const handleTakeCameraPhoto = () => {
    openCamera({
      onSelectFile: (file) => handleBillImageSelect(file),
      fileNamePrefix: `bill-${order.orderId || order._id}`,
    });
  };

  const handlePickFromGallery = () => {
    openGallery({
      onSelectFile: handleBillImageSelect,
      fileNamePrefix: `bill-${order.orderId || order._id}`,
    });
  };

  const isAtPickup = status === 'REACHED_PICKUP';
  const restaurant = order.restaurantId || order.restaurant || {};
  const restaurantName =
    order.restaurantName ||
    order.restaurant_name ||
    restaurant.restaurantName ||
    restaurant.name ||
    'Restaurant';
  const restaurantAddress =
    order.restaurantAddress ||
    order.restaurant_address ||
    order.restaurantLocation?.address ||
    [restaurant.addressLine1, restaurant.addressLine2, restaurant.area, restaurant.city, restaurant.state, restaurant.pincode]
      .filter(Boolean)
      .join(', ') ||
    restaurant.location?.address ||
    '';
  const restaurantPhone =
    order.restaurantPhone ||
    order.restaurant_phone ||
    restaurant.primaryContactNumber ||
    restaurant.ownerPhone ||
    restaurant.phone ||
    '';
  const restaurantCoords = order.restaurantLocation || null;
  const items = order.items || [];
  const restaurantLogo =
    order.restaurantImage ||
    restaurant.profileImage ||
    restaurant.logo ||
    order.restaurant?.logo ||
    order.restaurant?.profileImage ||
    'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';

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

  const customerAddress =
    order.customerAddress ||
    order.customer_address ||
    [
      order.deliveryAddress?.street,
      order.deliveryAddress?.additionalDetails,
      order.deliveryAddress?.landmark,
      order.deliveryAddress?.area,
      order.deliveryAddress?.city,
      order.deliveryAddress?.state,
      order.deliveryAddress?.zipCode || order.deliveryAddress?.pincode,
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(', ') ||
    '';

  const customerLocation = order.customerLocation || order.deliveryLocation || null;

  const handleCallRestaurant = () => {
    const num = String(restaurantPhone || '').replace(/\D/g, '');
    if (!num) {
      toast.error('Restaurant number not available');
      return;
    }
    openUrl(`tel:${num}`);
  };

  const handleNavigateToRestaurant = () => {
    const lat = parseFloat(restaurantCoords?.lat ?? restaurantCoords?.latitude);
    const lng = parseFloat(restaurantCoords?.lng ?? restaurantCoords?.longitude);
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
      toast.error('Customer number not available');
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

  const distanceLabel = formatTripDistanceKm(distanceToTarget) === '--'
    ? 'Locating restaurant…'
    : `${formatTripDistanceKm(distanceToTarget)} km • ${eta || '--'} min to Store`;

  return (
    <View style={[styles.layer, { bottom: navSpace }]} pointerEvents="box-none">
      {/* Background Dim */}
      <View style={styles.dim} />

      <View style={[styles.sheet, { maxHeight: Dimensions.get('window').height * 0.84 }]}>
        <ScrollView contentContainerStyle={styles.sheetContent} bounces={false} keyboardShouldPersistTaps="handled">
          {/* Handle / Minimize */}
          <View style={styles.handleRow}>
            <Pressable onPress={onMinimize} style={({ pressed }) => [styles.handleBtn, pressed && styles.pressed]}>
              <ChevronDown size={24} color={colors.gray[400]} strokeWidth={3} />
            </Pressable>
          </View>

          {/* Restaurant Header Card */}
          <View style={[styles.partyRow, styles.partyRowFirst]}>
            <View style={styles.partyMain}>
              <View style={styles.logoBox}>
                <AppImage src={restaurantLogo} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
              <View style={styles.partyText}>
                <View style={styles.kickerRow}>
                  <ChefHat size={14} color={deliveryTheme.primary} />
                  <Text style={styles.kicker}>Restaurant Pickup</Text>
                </View>
                <Text style={styles.partyName} numberOfLines={1}>{restaurantName}</Text>
                {restaurantAddress ? (
                  <Text style={styles.partyAddress} numberOfLines={2}>{restaurantAddress}</Text>
                ) : null}
                <View style={styles.statusRow}>
                  {isAtPickup ? (
                    <Text style={[styles.statusText, styles.statusReached]}>Reached Location √</Text>
                  ) : (
                    <Text style={[styles.statusText, { color: deliveryTheme.primary }]}>{distanceLabel}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.partyBtns}>
              <Pressable onPress={handleCallRestaurant} style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]} accessibilityLabel="Call restaurant">
                <Phone size={20} color={deliveryTheme.primary} />
              </Pressable>
              <Pressable onPress={handleNavigateToRestaurant} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} accessibilityLabel="Navigate to restaurant">
                <Navigation size={20} color={colors.white} />
              </Pressable>
            </View>
          </View>

          {/* Customer Drop Card */}
          <View style={[styles.partyRow, styles.partyRowSecond]}>
            <View style={styles.partyMain}>
              <View style={styles.pinBox}>
                <MapPin size={24} color={deliveryTheme.primary} />
              </View>
              <View style={styles.partyText}>
                <View style={styles.kickerRow}>
                  <MapPin size={14} color={deliveryTheme.primary} />
                  <Text style={styles.kicker}>Customer Drop</Text>
                </View>
                <Text style={styles.partyName} numberOfLines={1}>{customerName}</Text>
                {customerAddress ? (
                  <Text style={styles.partyAddress} numberOfLines={2}>{customerAddress}</Text>
                ) : null}
                {customerPhone ? (
                  <Text style={styles.partyPhone}>{customerPhone}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.partyBtns}>
              <Pressable onPress={handleCallCustomer} style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]} accessibilityLabel="Call customer">
                <Phone size={20} color={deliveryTheme.primary} />
              </Pressable>
              <Pressable onPress={handleNavigateToCustomer} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} accessibilityLabel="Navigate to customer">
                <Navigation size={20} color={colors.white} />
              </Pressable>
            </View>
          </View>

          {/* Action Sliders */}
          <View style={styles.actions}>
            {!isAtPickup ? (
              <View>
                <Text style={styles.sliderHint}>Ready - Swipe to confirm arrival</Text>
                <ActionSlider
                  key="action-reach"
                  label="Slide to Reach"
                  successLabel="Reached!"
                  disabled={false}
                  onConfirm={onReachedPickup}
                  color="bg-green-600"
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <View style={styles.billRow}>
                  {!billImageUploaded && !isUploadingBill ? (
                    <>
                      <Pressable onPress={handleTakeCameraPhoto} style={({ pressed }) => [styles.billBtn, styles.cameraBtn, pressed && styles.pressed]}>
                        <Camera size={20} color={colors.white} />
                        <Text style={[styles.billBtnText, { color: colors.white }]}>Camera</Text>
                      </Pressable>
                      <Pressable onPress={handlePickFromGallery} style={({ pressed }) => [styles.billBtn, styles.galleryBtn, pressed && styles.pressed]}>
                        <ImageIcon size={20} color={deliveryTheme.primary} />
                        <Text style={[styles.billBtnText, { color: deliveryTheme.primary }]}>Gallery</Text>
                      </Pressable>
                    </>
                  ) : null}

                  {isUploadingBill ? (
                    <View style={[styles.billStatus, styles.billUploading]}>
                      <ActivityIndicator size={16} color={colors.gray[400]} />
                      <Text style={[styles.billBtnText, { color: colors.gray[400] }]}>Uploading...</Text>
                    </View>
                  ) : null}

                  {billImageUploaded ? (
                    <View style={[styles.billStatus, styles.billDone]}>
                      <CheckCircle2 size={16} color={colors.green[700]} />
                      <Text style={[styles.billBtnText, { color: colors.green[700] }]}>Bill Uploaded</Text>
                    </View>
                  ) : null}
                </View>

                <View>
                  <Text style={styles.sliderHint}>Swipe to pick up</Text>
                  <ActionSlider
                    key="action-pickup"
                    label="Slide to Pick Up"
                    successLabel="Picked Up!"
                    disabled={false}
                    onConfirm={() => onPickedUp(billImageUrl)}
                    color="bg-orange-500"
                  />
                </View>
              </View>
            )}

            {/* Delivery Instructions (User Note) */}
            {order?.note ? (
              <View style={styles.noteBox}>
                <ChefHat size={20} color={deliveryTheme.primary} style={styles.noteIcon} />
                <View style={styles.flexMin}>
                  <Text style={styles.noteKicker}>User Instructions</Text>
                  <Text style={styles.noteText}>{`"${order.note}"`}</Text>
                </View>
              </View>
            ) : null}

            {/* Collapsible Order Summary */}
            <Pressable onPress={() => setShowItems(!showItems)} style={styles.itemsToggle}>
              <View style={styles.itemsToggleLeft}>
                <Package size={20} color={colors.gray[400]} />
                <Text style={styles.itemsToggleText}>{`Order Details (${items.length || 0})`}</Text>
              </View>
              {showItems ? <ChevronDown size={16} color={colors.gray[900]} /> : <ChevronUp size={16} color={colors.gray[900]} />}
            </Pressable>

            {showItems ? (
              <View style={styles.itemsList}>
                {items.map((item, idx) => (
                  <View key={idx} style={[styles.itemRow, idx === items.length - 1 && styles.itemRowLast]}>
                    <View style={styles.flexMin}>
                      <Text style={styles.itemName}>{item.name || 'Item Name'}</Text>
                      {item.variantName ? (
                        <Text style={styles.itemVariant}>{item.variantName}</Text>
                      ) : null}
                    </View>
                    <View style={styles.qtyPill}>
                      <Text style={styles.qtyText}>{`x${item.quantity || 1}`}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const roundedShadow = {
  elevation: 3,
  shadowColor: '#112743',
  shadowOpacity: 0.24,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 10 },
};

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: alpha(colors.black, 0.4) },
  sheet: {
    width: '100%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: -20 },
  },
  sheetContent: { padding: 16, paddingBottom: 24 },
  flexMin: { flex: 1, minWidth: 0 },
  handleRow: { width: '100%', alignItems: 'center', paddingBottom: 8, paddingTop: 4 },
  handleBtn: { padding: 4, borderRadius: 9999 },
  pressed: { transform: [{ scale: 0.95 }] },
  partyRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  partyRowFirst: { marginBottom: 16 },
  partyRowSecond: { marginBottom: 20 },
  partyMain: { flexDirection: 'row', gap: 12, flex: 1, minWidth: 0 },
  logoBox: {
    width: 52,
    height: 52,
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: deliveryTheme.border,
    ...roundedShadow,
  },
  pinBox: {
    width: 52,
    height: 52,
    backgroundColor: deliveryTheme.primarySoft,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: deliveryTheme.primaryBorder,
    ...roundedShadow,
  },
  partyText: { flex: 1, minWidth: 0, paddingRight: 4 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: deliveryTheme.primary },
  partyName: { color: colors.gray[950], fontSize: 16, lineHeight: 20, fontWeight: '700', marginTop: 2 },
  partyAddress: { color: colors.gray[500], fontSize: 12, lineHeight: 17, fontWeight: '500', marginTop: 2 },
  partyPhone: { color: colors.gray[500], fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  statusReached: { color: deliveryTheme.primary, fontFamily: fonts.sora, fontWeight: '800' },
  partyBtns: { flexDirection: 'row', gap: 8, marginLeft: 4 },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: deliveryTheme.primarySoft,
    borderWidth: 1,
    borderColor: deliveryTheme.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gray[900], alignItems: 'center', justifyContent: 'center', elevation: 4 },
  actions: { gap: 16 },
  sliderHint: { textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, color: deliveryTheme.primary },
  billRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, width: '100%' },
  billBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 16, ...roundedShadow },
  cameraBtn: { backgroundColor: colors.gray[900], elevation: 8 },
  galleryBtn: { backgroundColor: deliveryTheme.primarySoft, borderWidth: 1, borderColor: deliveryTheme.primaryBorder },
  billBtnText: { fontWeight: '700', fontSize: 11, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1.1 },
  billStatus: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  billUploading: { backgroundColor: colors.gray[50] },
  billDone: { backgroundColor: colors.green[100] },
  noteBox: { backgroundColor: deliveryTheme.primarySoft, borderWidth: 1, borderColor: deliveryTheme.primaryBorder, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', ...roundedShadow },
  noteIcon: { marginTop: 2 },
  noteKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: deliveryTheme.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  noteText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: colors.gray[800] },
  itemsToggle: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: colors.gray[50], borderRadius: 16, borderWidth: 1, borderColor: deliveryTheme.border, ...roundedShadow },
  itemsToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemsToggleText: { color: colors.gray[900], fontWeight: '700', fontSize: 12, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1.2 },
  itemsList: { overflow: 'hidden', gap: 8, paddingHorizontal: 4 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.gray[50] },
  itemRowLast: { borderBottomWidth: 0 },
  itemName: { color: colors.gray[700], fontSize: 14, lineHeight: 20, fontWeight: '700' },
  itemVariant: { fontSize: 12, lineHeight: 16, color: colors.gray[500], fontWeight: '500', marginTop: 2 },
  qtyPill: { backgroundColor: deliveryTheme.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginLeft: 8 },
  qtyText: { color: deliveryTheme.primary, fontWeight: '700', fontSize: 12, lineHeight: 16 },
});

export default PickupActionModal;
