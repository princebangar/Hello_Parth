// Web: modules/Taxi/modules/user/components/activity/ActivityStates.jsx — support-empty / loading / error / empty states.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AlertCircle, Headset } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { colors } from '@/theme';
import TaxiPageSkeleton from '@/shared/components/TaxiPageSkeleton';
import { useUserPalette } from '../../../../shared/context/UserThemeContext';

const primaryShadow = { elevation: 6, shadowColor: '#FFC400', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } };

const useEnter = (rise = 0) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [v]);
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] };
};

const IconTile = ({ size, children, style }) => {
  const p = useUserPalette();
  return (
    <View style={[{ width: size, height: size, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: p.cardBg, borderWidth: 1, borderColor: p.border }, p.cardShadow, style]}>
      {children}
    </View>
  );
};

const PrimaryButton = ({ label, onPress, style }) => {
  const p = useUserPalette();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primary, { backgroundColor: p.accent }, primaryShadow, style, pressed && { transform: [{ scale: 0.95 }] }]}>
      <Text style={[styles.primaryText, { color: p.accentInk }]}>{label}</Text>
    </Pressable>
  );
};

export const ActivitySupportState = ({ onContact }) => {
  const p = useUserPalette();
  const enter = useEnter(10);
  return (
    <Animated.View style={[styles.center, { paddingVertical: 80, gap: 20 }, enter]}>
      <IconTile size={80}>
        <Headset size={34} color={p.textSecondary} />
      </IconTile>
      <View style={{ gap: 4, alignItems: 'center' }}>
        <Text style={[styles.h3, { color: p.textPrimary }]}>No support tickets</Text>
        <Text style={[styles.body, { color: p.textSecondary }]}>You haven&apos;t raised any support tickets yet.</Text>
      </View>
      <PrimaryButton label="Contact us" onPress={onContact} style={{ marginTop: 8, paddingHorizontal: 28 }} />
    </Animated.View>
  );
};

// The trip list while it loads: the same skeleton cards the Rides placeholder shows (TaxiPageSkeleton "activity").
export const ActivityLoadingState = () => <TaxiPageSkeleton variant="activity-list" />;

export const ActivityErrorState = ({ error, onRetry }) => {
  const p = useUserPalette();
  const enter = useEnter(0);
  return (
    <Animated.View style={[styles.center, { paddingVertical: 80, gap: 12 }, enter]}>
      <IconTile size={56}>
        <AlertCircle size={24} color={colors.rose[500]} strokeWidth={2.6} />
      </IconTile>
      <Text style={[styles.msg, { color: p.textPrimary }]}>{error}</Text>
      <PrimaryButton label="Retry" onPress={onRetry} style={{ marginTop: 8, paddingHorizontal: 24 }} />
    </Animated.View>
  );
};

export const ActivityEmptyState = ({ activeTab }) => {
  const p = useUserPalette();
  const enter = useEnter(0);
  return (
    <Animated.View style={[styles.center, { paddingVertical: 80, gap: 12 }, enter]}>
      <IconTile size={56}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: p.textMuted }}>-</Text>
      </IconTile>
      <Text style={[styles.msg, { color: p.textSecondary }]}>No {String(activeTab || '').toLowerCase()} found</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  h3: { fontSize: 17, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  msg: { fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
  primary: { borderRadius: 999, paddingVertical: 12 },
  primaryText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
