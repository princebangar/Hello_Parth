// Web: components/orders/OrderSwitcher.jsx — the row of accepted order chips in the Feed header (display only).
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/native/ui';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';
import { resolveOrderKey } from '@/modules/DeliveryV2/store/useDeliveryStore';

export default function OrderSwitcher({ orders = [], focusedOrderId }) {
  if (!Array.isArray(orders) || orders.length <= 1) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
        contentContainerStyle={styles.row}
        pointerEvents="none"
      >
        {orders.map((order) => {
          const orderId = resolveOrderKey(order);
          const label = order?.orderId || order?.displayOrderId || orderId;
          const isFocused = focusedOrderId === orderId;
          return (
            <View
              key={orderId}
              style={[styles.chip, isFocused ? styles.chipFocused : styles.chipIdle]}
              accessibilityState={{ selected: isFocused }}
            >
              <Text style={[styles.chipText, { color: isFocused ? colors.white : alpha(colors.white, 0.7) }]}>{`#${label}`}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, marginTop: 8 },
  scroller: { flexGrow: 0 },
  row: { gap: 8, paddingBottom: 4 },
  chip: { borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 8 },
  // bg-orange-500 -> delivery primary
  chipFocused: {
    backgroundColor: deliveryTheme.primary,
    elevation: 8,
    shadowColor: deliveryTheme.primary,
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  chipIdle: { backgroundColor: alpha(colors.white, 0.1), borderWidth: 1, borderColor: alpha(colors.white, 0.15) },
  chipText: { fontSize: 11, lineHeight: 16, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 11 * 0.05 },
});
