// Web: components/restaurant/ResendNotificationButton.jsx — small blue "Resend" pill that pings the delivery partners
// again for an order (POST resend-delivery-notification). Same texts, same toasts.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { Loader2, Volume2 } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { Text } from '@/native/ui';
import { colors, sp } from '@/theme';
import { restaurantAPI } from '@food/api';

const debugError = () => {};

function Spinner({ size, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

export default function ResendNotificationButton({ orderId, mongoId, onSuccess }) {
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    if (loading) return;

    try {
      setLoading(true);
      const id = mongoId || orderId;
      const response = await restaurantAPI.resendDeliveryNotification(id);

      if (response.data?.success) {
        toast.success('Resend successful');
        // Refresh orders if onSuccess callback is provided
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(response.data?.message || 'Failed to send notification');
      }
    } catch (error) {
      debugError('Error resending notification:', error);
      toast.error(error.response?.data?.message || 'Failed to send notification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handleResend}
      disabled={loading}
      accessibilityLabel="Resend notification to delivery partners"
      hitSlop={6}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, loading && styles.disabled]}
    >
      {loading ? (
        <>
          <Spinner size={12} color={colors.blue[700]} />
          <Text style={styles.label}>Sending...</Text>
        </>
      ) : (
        <>
          <Volume2 size={12} color={colors.blue[700]} />
          <Text style={styles.label}>Resend</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: sp(1),
    paddingHorizontal: sp(2),
    paddingVertical: sp(0.5),
    borderRadius: 9999,
    backgroundColor: colors.blue[100],
    borderWidth: 1,
    borderColor: colors.blue[300],
  },
  pressed: { backgroundColor: colors.blue[200] },
  disabled: { opacity: 0.5 },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '500', color: colors.blue[700] },
});
