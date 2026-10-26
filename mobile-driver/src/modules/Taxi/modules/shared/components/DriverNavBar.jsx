// Web: DriverNavBar.jsx + driverChrome.css (.driver-nav*) — the floating bottom bar shared by every driver app (taxi,
// owner, bus). items: [{ key, label, Icon, active, onSelect, badge?, onPreload? }]
// The blue pill is one view that is always mounted and slides to the active tab (transform 0.28s
// cubic-bezier(0.32, 0.72, 0, 1)), so a tapped tab never blinks.
// White bar, 72 px high, 24 px above the screen edge (plus the Android navigation bar under it: the app draws edge to
// edge), 24 px from each side (12 px below 380 px width), max 448 px wide. With the keyboard open the window resizes
// (softwareKeyboardLayoutMode resize), so the bar rides on top of the keyboard like the web's.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/native/ui';
import { fonts } from '@/theme';

const BAR_HEIGHT = 72;
const BAR_GAP = 24;

const DriverNavBar = ({ items = [] }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sideGap = width <= 380 ? 12 : 24;
  const barWidth = Math.min(width - sideGap * 2, 448);
  const count = Math.max(items.length, 1);
  const pillWidth = (barWidth - 16) / count;
  const activeIndex = items.findIndex((item) => item.active);

  const x = useRef(new Animated.Value(Math.max(activeIndex, 0) * pillWidth)).current;
  const opacity = useRef(new Animated.Value(activeIndex < 0 ? 0 : 1)).current;
  const [laidOut, setLaidOut] = useState(false);

  useEffect(() => {
    const to = Math.max(activeIndex, 0) * pillWidth;
    if (!laidOut) {
      x.setValue(to);
      return;
    }
    Animated.timing(x, {
      toValue: to,
      duration: 280,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, pillWidth, laidOut, x]);

  useEffect(() => {
    Animated.timing(opacity, { toValue: activeIndex < 0 ? 0 : 1, duration: 150, useNativeDriver: true }).start();
  }, [activeIndex, opacity]);

  const labelSize = count >= 6 ? (width <= 380 ? 8 : 8.5) : 9;

  return (
    <View pointerEvents="box-none" style={[styles.nav, { bottom: BAR_GAP + insets.bottom }]}>
      <View style={[styles.bar, { width: barWidth }]} onLayout={() => setLaidOut(true)} accessibilityRole="tablist">
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: pillWidth, opacity, transform: [{ translateX: x }] }]}
        />
        {items.map(({ key, label, Icon, active, onSelect, badge, onPreload }) => (
          <Pressable
            key={key}
            onPress={onSelect}
            onPressIn={onPreload}
            accessibilityRole="tab"
            accessibilityState={{ selected: Boolean(active) }}
            accessibilityLabel={label}
            style={styles.item}
          >
            <View style={styles.itemInner}>
              <View>
                <Icon size={21} strokeWidth={active ? 2.4 : 2} color={active ? '#FFFFFF' : '#64748B'} />
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                ellipsizeMode="clip"
                style={[
                  styles.label,
                  { fontSize: labelSize, letterSpacing: count >= 6 ? 0 : 0.18, color: active ? '#FFFFFF' : '#64748B' },
                ]}
              >
                {String(label).toUpperCase()}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

export const DRIVER_NAV_HEIGHT = BAR_HEIGHT;
export const DRIVER_NAV_GAP = BAR_GAP;

const styles = StyleSheet.create({
  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9997,
    elevation: 30,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: BAR_HEIGHT,
    paddingHorizontal: 8,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 14,
  },
  pill: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: 8,
    borderRadius: 24,
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 4,
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  itemInner: { alignItems: 'center', gap: 2, maxWidth: '100%' },
  label: {
    fontFamily: fonts.outfit,
    fontWeight: '700',
    lineHeight: 11,
    includeFontPadding: false,
    maxWidth: '100%',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: '#EA580C',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', lineHeight: 12, includeFontPadding: false },
});

export default DriverNavBar;
