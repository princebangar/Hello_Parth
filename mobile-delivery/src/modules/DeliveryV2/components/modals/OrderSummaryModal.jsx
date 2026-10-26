// Web: components/modals/OrderSummaryModal.jsx — the full-screen "Well Done!" page after a delivery (earnings credited,
// Go Back Home). Native: a full-screen Overlay (the web's fixed inset-0 bg-[#15498b]); the card scales in and the tick
// bounces like the web's animate-bounce. The Android back button does the same as "Go Back Home".
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CheckCircle, ArrowRight, Wallet, Star } from 'lucide-react-native';
import { Overlay, Text } from '@/native/ui';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';

/**
 * OrderSummaryModal - Ported to Original White/Green Theme.
 * Post-delivery success screen.
 */
export const OrderSummaryModal = ({ order, onDone }) => {
  // Only what the server credited — never an estimate.
  const earnings = order?.earnings || order?.riderEarning || 0;
  const orderRef = order?.displayOrderId || order?.orderId || '';

  const enter = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, stiffness: 200, damping: 20 }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 500, easing: Easing.bezier(0.8, 0, 1, 1), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 500, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enter, bounce]);

  return (
    <Overlay open onClose={onDone} style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <Animated.View
          style={[
            styles.content,
            { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
          ]}
        >
          {/* Success Icon (White Style) */}
          <Animated.View
            style={[styles.iconCircle, { transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) }] }]}
          >
            <CheckCircle size={56} color="#15498b" />
          </Animated.View>

          <Text style={styles.title}>Well Done!</Text>
          <Text style={styles.subtitle}>Trip completed successfully.</Text>

          <View style={styles.card}>
            <View style={styles.cardKickerRow}>
              <Star size={16} color={colors.orange[400]} fill={colors.orange[400]} />
              <Text style={styles.cardKicker}>Earnings Added</Text>
              <Star size={16} color={colors.orange[400]} fill={colors.orange[400]} />
            </View>

            <Text style={styles.amount}>{`₹${Number(earnings).toFixed(2)}`}</Text>

            <View style={styles.walletRow}>
              <Wallet size={20} color={deliveryTheme.primary} />
              <Text style={styles.walletText}>Transferred to Wallet</Text>
            </View>
          </View>

          <Pressable onPress={onDone} style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}>
            <Text style={styles.doneText}>Go Back Home</Text>
            <ArrowRight size={24} color={deliveryTheme.primary} />
          </Pressable>

          {orderRef ? (
            <View style={styles.refPill}>
              <Text style={styles.refText}>
                {'Order Ref: '}
                <Text style={styles.refId}>{orderRef}</Text>
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </Overlay>
  );
};

const styles = StyleSheet.create({
  page: { backgroundColor: '#15498b' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  content: { width: '100%', maxWidth: 384, alignItems: 'center' },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: 25 },
  },
  title: {
    color: colors.white,
    fontSize: 36,
    lineHeight: 40,
    fontFamily: fonts.sora,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: -0.9,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: deliveryTheme.border,
    alignItems: 'center',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: 25 },
  },
  cardKickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },
  cardKicker: { color: colors.gray[400], fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  amount: { color: colors.gray[950], fontSize: 48, lineHeight: 52, fontWeight: '700', marginBottom: 20, letterSpacing: -2.4 },
  walletRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
    backgroundColor: deliveryTheme.primarySoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: deliveryTheme.border,
  },
  walletText: { color: colors.green[700], fontSize: 14, lineHeight: 20, fontWeight: '700' },
  doneBtn: {
    width: '100%',
    height: 56,
    backgroundColor: colors.white,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  pressed: { transform: [{ scale: 0.95 }] },
  doneText: { color: deliveryTheme.primary, fontSize: 18, lineHeight: 28, fontWeight: '700' },
  refPill: {
    marginTop: 24,
    backgroundColor: alpha(colors.white, 0.1),
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
  },
  refText: { color: alpha(colors.white, 0.6), fontSize: 10, lineHeight: 16, fontWeight: '500', letterSpacing: 0.25 },
  refId: { fontWeight: '700', color: alpha(colors.white, 0.8), fontSize: 12 },
});

export default OrderSummaryModal;
