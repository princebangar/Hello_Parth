// Web: components/restaurant/NewOrderNotification.jsx — the global "New Order!" card (green header, total, items with
// veg dot / quantity / variant / add-ons, first 4 items + "more items", takeaway / dining / address box, estimated
// time, note, Dismiss + View Order). Shown by RestaurantRealtimeShell on pages that have no accept / reject popup.
// Native: the web's fixed card at the top of the page (framer-motion spring from y -50) is a transparent native Modal
// (so it sits above every page and the bottom bar) with the same spring; Android Back = Dismiss. The card body scrolls
// when an order is taller than the screen (the web card simply ran off the page).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronDown, ChevronUp, Clock, IndianRupee, MapPin, ShoppingBag, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';

function PulseView({ children }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
}

function ItemImage({ uri }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <View style={styles.itemImageWrap}>
      <AppImage src={uri} style={styles.fill} contentFit="cover" onError={() => setHidden(true)} />
    </View>
  );
}

/**
 * New Order Notification Component
 * Displays a notification popup when a new order is received
 */
export default function NewOrderNotification({ order, onClose, onViewOrder }) {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [showAllItems, setShowAllItems] = useState(false);
  const VISIBLE_LIMIT = 4;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!order) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, damping: 25, stiffness: 300, useNativeDriver: true }).start();
  }, [order, anim]);

  if (!order) return null;

  const handleViewOrder = () => {
    if (onViewOrder) {
      onViewOrder(order);
    } else {
      navigate(`/restaurant/orders/${order.orderMongoId || order.orderId}`);
    }
    onClose();
  };

  const visibleItems = showAllItems ? order.items : order.items?.slice(0, VISIBLE_LIMIT);

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + sp(4) }]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            { maxHeight: height - insets.top - insets.bottom - sp(8) },
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-50, 0] }) }] },
          ]}
        >
          {/* Header with bell icon */}
          <LinearGradient colors={[colors.green[500], colors.green[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.bellCircle}>
                <PulseView>
                  <Bell size={24} color={colors.white} />
                </PulseView>
              </View>
              <View style={styles.flexShrink}>
                <View style={styles.titleRow}>
                  <Text style={styles.headerTitle}>New Order!</Text>
                  {order.orderType === 'takeaway' ? (
                    <View style={[styles.typePill, { backgroundColor: colors.orange[100] }]}>
                      <Text style={[styles.typePillText, { color: restaurantTheme.primaryStrong }]}>TAKEAWAY</Text>
                    </View>
                  ) : order.orderType === 'dining' ? (
                    <View style={[styles.typePill, { backgroundColor: colors.blue[100] }]}>
                      <Text style={[styles.typePillText, { color: colors.blue[700] }]}>DINING</Text>
                    </View>
                  ) : (
                    <View style={[styles.typePill, { backgroundColor: colors.green[100] }]}>
                      <Text style={[styles.typePillText, { color: restaurantTheme.primaryStrong }]}>HOME DELIVERY</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.headerSub}>Order #{order.orderId}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: alpha(colors.white, 0.3) }]}>
              <X size={20} color={colors.white} />
            </Pressable>
          </LinearGradient>

          {/* Order Details */}
          <ScrollView style={styles.flexShrink} contentContainerStyle={styles.body} bounces={false}>
            <View style={styles.stack4}>
              {/* Total Amount */}
              <View style={styles.totalBox}>
                <View style={styles.rowGap2}>
                  <IndianRupee size={20} color={colors.green[600]} />
                  <Text style={styles.totalLabel}>Total Amount</Text>
                </View>
                <Text style={styles.totalValue}>₹{order.total?.toFixed(2) || '0.00'}</Text>
              </View>

              {/* Items */}
              <View>
                <Text style={styles.itemsHeading}>ORDER ITEMS ({order.items?.length || 0})</Text>
                <View style={styles.stack25}>
                  {visibleItems?.map((item, index) => {
                    const isVeg = item.isVeg !== false && item.veg !== false && !String(item.type || '').toLowerCase().includes('non');
                    const variantText =
                      (typeof item.variantName === 'string' && item.variantName.trim()) ||
                      (typeof item.variant === 'string' && item.variant.trim()) ||
                      (typeof item.variant === 'object' && item.variant?.name) ||
                      (typeof item.selectedVariant === 'string' && item.selectedVariant.trim()) ||
                      (typeof item.selectedVariant === 'object' && item.selectedVariant?.name) ||
                      (typeof item.variant_name === 'string' && item.variant_name.trim()) ||
                      (typeof item.variation === 'string' && item.variation.trim()) ||
                      (typeof item.variation === 'object' && item.variation?.name) ||
                      (typeof item.size === 'string' && item.size.trim()) ||
                      (typeof item.portion === 'string' && item.portion.trim()) ||
                      (typeof item.option === 'string' && item.option.trim()) ||
                      (typeof item.choice === 'string' && item.choice.trim()) ||
                      '';
                    const itemAddons = Array.isArray(item.addons) ? item.addons : Array.isArray(item.selectedAddons) ? item.selectedAddons : [];

                    return (
                      <LinearGradient
                        key={index}
                        colors={[alpha(colors.slate[50], 0.9), colors.white, alpha(colors.slate[50], 0.7)]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.itemCard}
                      >
                        <View style={styles.itemLeft}>
                          <View
                            style={[
                              styles.vegBox,
                              isVeg
                                ? { borderColor: colors.emerald[600], backgroundColor: alpha(colors.emerald[50], 0.8) }
                                : { borderColor: colors.rose[600], backgroundColor: alpha(colors.rose[50], 0.8) },
                            ]}
                          >
                            <View style={[styles.vegDot, { backgroundColor: isVeg ? colors.emerald[600] : colors.rose[600] }]} />
                          </View>
                          <View style={styles.qtyPill}>
                            <Text style={styles.qtyText}>{item.quantity}×</Text>
                          </View>
                          {item.image ? <ItemImage uri={item.image} /> : null}
                          <View style={styles.itemTextCol}>
                            <Text style={styles.itemName}>{item.name}</Text>
                            {variantText ? (
                              <View style={styles.wrapRow}>
                                <View style={styles.variantPill}>
                                  <PulseView>
                                    <View style={styles.variantDot} />
                                  </PulseView>
                                  <Text style={styles.variantText}>{variantText}</Text>
                                </View>
                              </View>
                            ) : null}
                            {itemAddons.length > 0 ? (
                              <View style={styles.wrapRow}>
                                {itemAddons.map((addon, aIdx) => (
                                  <View key={aIdx} style={styles.addonPill}>
                                    <Text style={styles.addonText}>+ {typeof addon === 'string' ? addon : addon.name}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.priceBox}>
                          <Text style={styles.priceText}>₹{(item.price * item.quantity).toFixed(2)}</Text>
                        </View>
                      </LinearGradient>
                    );
                  })}

                  {/* Expand / Collapse button */}
                  {order.items?.length > VISIBLE_LIMIT ? (
                    <Pressable
                      onPress={() => setShowAllItems((prev) => !prev)}
                      style={({ pressed }) => [styles.moreBtn, pressed && { backgroundColor: colors.gray[50] }]}
                    >
                      {showAllItems ? (
                        <>
                          <ChevronUp size={16} color={colors.gray[500]} />
                          <Text style={styles.moreText}>Show less</Text>
                        </>
                      ) : (
                        <>
                          <ChevronDown size={16} color={colors.gray[500]} />
                          <Text style={styles.moreText}>+{order.items.length - VISIBLE_LIMIT} more items</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Takeaway / Delivery Address */}
              {order.orderType === 'takeaway' ? (
                <View style={[styles.typeBox, { backgroundColor: restaurantTheme.primarySoft, borderColor: restaurantTheme.primaryBorder }]}>
                  <View style={styles.iconTop}>
                    <ShoppingBag size={16} color={restaurantTheme.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.typeBoxLabel, { color: restaurantTheme.primaryStrong }]}>Order Type</Text>
                    <Text style={[styles.typeBoxText, { color: colors.orange[950] }]}>Takeaway — Customer will pick up from restaurant.</Text>
                  </View>
                </View>
              ) : order.orderType === 'dining' ? (
                <View style={[styles.typeBox, { backgroundColor: colors.blue[50], borderColor: colors.blue[100] }]}>
                  <View style={styles.iconTop}>
                    <ShoppingBag size={16} color={colors.blue[600]} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.typeBoxLabel, { color: colors.blue[700] }]}>Order Type</Text>
                    <Text style={[styles.typeBoxText, { color: colors.blue[950] }]}>Dining — In-restaurant table service.</Text>
                  </View>
                </View>
              ) : order.customerAddress ? (
                <View style={styles.addressBox}>
                  <View style={styles.iconTop}>
                    <MapPin size={16} color={colors.gray[500]} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.addressLabel}>Delivery Address</Text>
                    <Text style={styles.addressText}>
                      {order.customerAddress.street || order.customerAddress.label || 'Address'}
                      {order.customerAddress.city ? `, ${order.customerAddress.city}` : ''}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Estimated Time */}
              {order.estimatedDeliveryTime ? (
                <View style={styles.rowGap2}>
                  <Clock size={16} color={colors.gray[600]} />
                  <Text style={styles.estText}>Est. delivery: {order.estimatedDeliveryTime} mins</Text>
                </View>
              ) : null}

              {/* Note */}
              {order.note ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>Note:</Text>
                  <Text style={styles.noteText}>{order.note}</Text>
                </View>
              ) : null}
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={({ pressed }) => [styles.dismissBtn, pressed && { backgroundColor: colors.gray[200] }]}>
                <Text style={styles.dismissText}>Dismiss</Text>
              </Pressable>
              <Pressable onPress={handleViewOrder} style={({ pressed }) => [styles.viewBtn, pressed && { backgroundColor: colors.green[700] }]}>
                <ShoppingBag size={20} color={colors.white} />
                <Text style={styles.viewText}>View Order</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  root: { flex: 1, paddingHorizontal: sp(4), alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 448,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.green[500],
    overflow: 'hidden',
    ...shadow['2xl'],
  },
  header: { paddingHorizontal: sp(6), paddingVertical: sp(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flexShrink: 1 },
  bellCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: alpha(colors.white, 0.2), alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flexWrap: 'wrap' },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 18, lineHeight: 28 },
  typePill: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999 },
  typePillText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  headerSub: { color: alpha(colors.white, 0.9), fontSize: 14, lineHeight: 20 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: alpha(colors.white, 0.2), alignItems: 'center', justifyContent: 'center' },
  body: { padding: sp(6) },
  stack4: { gap: sp(4) },
  stack25: { gap: sp(2.5) },
  rowGap2: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  totalBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: sp(4), backgroundColor: colors.green[50], borderRadius: 14 },
  totalLabel: { color: colors.gray[600], fontWeight: '500', fontSize: 16, lineHeight: 24 },
  totalValue: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.green[600] },
  itemsHeading: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.gray[500], letterSpacing: 0.6, marginBottom: sp(3) },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: sp(3),
    padding: sp(3),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: alpha(colors.slate[200], 0.9),
  },
  itemLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(2.5), flex: 1, minWidth: 0 },
  vegBox: { width: 16, height: 16, borderWidth: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  qtyPill: {
    paddingHorizontal: sp(2),
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.gray[900],
    borderWidth: 1,
    borderColor: colors.gray[800],
  },
  qtyText: { color: colors.amber[400], fontWeight: '900', fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  itemImageWrap: { width: 32, height: 32, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.gray[200], marginTop: 2 },
  itemTextCol: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: colors.gray[950] },
  wrapRow: { marginTop: sp(1), flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp(1) },
  variantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.rose[100],
    borderWidth: 2,
    borderColor: colors.rose[300],
    paddingHorizontal: sp(2.5),
    paddingVertical: 2,
    borderRadius: 10,
  },
  variantDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose[600] },
  variantText: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.rose[900] },
  addonPill: {
    backgroundColor: colors.slate[100],
    borderWidth: 1,
    borderColor: colors.slate[300],
    paddingHorizontal: sp(2.5),
    paddingVertical: 2,
    borderRadius: 8,
  },
  addonText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[800] },
  priceBox: {
    marginLeft: sp(2),
    backgroundColor: alpha(colors.gray[100], 0.9),
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingHorizontal: sp(2.5),
    paddingVertical: sp(1),
    borderRadius: 10,
  },
  priceText: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.gray[900] },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: sp(2),
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray[300],
  },
  moreText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.gray[500] },
  typeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(2.5), padding: sp(3), borderRadius: 10, borderWidth: 1 },
  iconTop: { marginTop: 2 },
  typeBoxLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginBottom: 2 },
  typeBoxText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  addressBox: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(2), padding: sp(3), backgroundColor: colors.gray[50], borderRadius: 10 },
  addressLabel: { fontSize: 12, lineHeight: 16, color: colors.gray[500], marginBottom: sp(1) },
  addressText: { fontSize: 14, lineHeight: 20, color: colors.gray[800] },
  estText: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  noteBox: { padding: sp(3), backgroundColor: colors.yellow[50], borderRadius: 10, borderWidth: 1, borderColor: colors.yellow[200] },
  noteLabel: { fontSize: 12, lineHeight: 16, color: colors.yellow[800], fontWeight: '500', marginBottom: sp(1) },
  noteText: { fontSize: 14, lineHeight: 20, color: colors.yellow[900] },
  actions: { flexDirection: 'row', gap: sp(3), marginTop: sp(6) },
  dismissBtn: { flex: 1, paddingHorizontal: sp(4), paddingVertical: sp(3), backgroundColor: colors.gray[100], borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dismissText: { color: colors.gray[700], fontWeight: '600', fontSize: 16, lineHeight: 24 },
  viewBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: sp(2),
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    backgroundColor: colors.green[600],
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewText: { color: colors.white, fontWeight: '600', fontSize: 16, lineHeight: 24 },
});
