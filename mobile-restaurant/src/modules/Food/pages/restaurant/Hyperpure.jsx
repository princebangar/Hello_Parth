// Web: pages/restaurant/Hyperpure.jsx — placeholder page ("This page is under development", as on the web) with the
// bottom bar.
// Native: the fade-in (framer-motion opacity 0 -> 1) is an Animated fade; the page renders BottomNavOrders itself like
// the web (not a kept-alive tab) and keeps room for it at its end.
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Leaf } from 'lucide-react-native';
import { Screen, Text } from '@/native/ui';
import { colors, sp } from '@/theme';
import BottomNavOrders, { useRestaurantNavSpace } from '@food/components/restaurant/BottomNavOrders';

export default function Hyperpure() {
  const navSpace = useRestaurantNavSpace();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <Screen bg={colors.gray[100]} edges={['top']}>
      <View style={[styles.root, { paddingBottom: Math.max(sp(24), navSpace) }]}>
        <Animated.View style={[styles.center, { opacity: fade }]}>
          <View style={styles.inner}>
            <Leaf size={64} color={colors.gray[400]} style={styles.icon} />
            <Text style={styles.title}>Hyperpure</Text>
            <Text style={styles.sub}>This page is under development</Text>
          </View>
        </Animated.View>
      </View>
      <BottomNavOrders />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center' },
  icon: { marginBottom: sp(4) },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900], marginBottom: sp(2) },
  sub: { fontSize: 16, lineHeight: 24, color: colors.gray[600] },
});
