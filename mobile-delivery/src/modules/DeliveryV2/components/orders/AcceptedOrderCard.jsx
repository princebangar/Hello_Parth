// Web: components/orders/AcceptedOrderCard.jsx — one accepted order in the Orders tab (tap = focus it on the Feed).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Package } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';
import {
  resolveOrderKey,
  mapDeliveryPhaseToTripStatus,
  useDeliveryStore,
} from '@/modules/DeliveryV2/store/useDeliveryStore';

const phaseLabel = (order, session) => {
  const tripStatus = session?.tripStatus || mapDeliveryPhaseToTripStatus(order);
  switch (tripStatus) {
    case 'REACHED_PICKUP':
      return 'At Pickup';
    case 'PICKED_UP':
      return 'Delivering';
    case 'REACHED_DROP':
      return 'At Drop';
    case 'COMPLETED':
      return 'Completed';
    default:
      return 'Picking Up';
  }
};

export default function AcceptedOrderCard({ order, focused = false, onSelect }) {
  const orderId = resolveOrderKey(order);
  const session = useDeliveryStore((state) =>
    orderId ? state.orderSessions[orderId] : null,
  );
  const displayId = order?.displayOrderId || order?.orderId || orderId;
  const restaurantName =
    order?.restaurantName ||
    order?.restaurantId?.restaurantName ||
    order?.restaurantId?.name ||
    'Restaurant';
  const earning = Number(order?.riderEarning ?? order?.earnings ?? order?.deliveryEarning ?? 0) || 0;

  return (
    <Pressable
      onPress={() => onSelect?.(order)}
      style={({ pressed }) => [styles.card, focused ? styles.cardFocused : styles.cardIdle, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.icon}>
            <Package size={20} color={colors.white} strokeWidth={2.25} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.kicker}>{`Order #${displayId}`}</Text>
            <Text style={styles.name} numberOfLines={1}>{restaurantName}</Text>
            <Text style={styles.phase}>{phaseLabel(order, session)}</Text>
            <Text style={styles.earning}>{`Earning ₹${earning.toFixed(2)}`}</Text>
          </View>
        </View>
        <ChevronRight size={20} color={focused ? deliveryTheme.primary : colors.gray[300]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    // rounded-2xl in the delivery theme
    elevation: 3,
    shadowColor: '#112743',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  cardFocused: { borderColor: alpha(deliveryTheme.primary, 0.35), backgroundColor: '#e7effa' },
  cardIdle: { borderColor: deliveryTheme.border, backgroundColor: colors.white },
  pressed: { transform: [{ scale: 0.98 }] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: deliveryTheme.primary },
  texts: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.gray[500] },
  name: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[950] },
  phase: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: deliveryTheme.primary, marginTop: 2 },
  // text-emerald-600 -> delivery primary
  earning: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: deliveryTheme.primary, marginTop: 2 },
});
