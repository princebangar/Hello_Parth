// Web: DriverNavBar.jsx + driverChrome.css (.driver-nav*) — the floating bottom bar shared by every driver app (taxi,
// owner, bus). items: [{ key, label, Icon, active, onSelect, badge?, onPreload? }]
// White bar, 72 px high, 24 px above the screen edge (plus the Android navigation bar under it: the app draws edge to
// edge), 24 px from each side (12 px below 380 px width), max 448 px wide. With the keyboard open the window resizes
// (softwareKeyboardLayoutMode resize), so the bar rides on top of the keyboard like the web's.
import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/native/ui';
import { fonts } from '@/theme';

const BAR_HEIGHT = 72;
const BAR_GAP = 24;

// Selected tab (Prince, 26 Oct): a solid (filled) icon in the accent, slightly bigger, and a heavy label in the accent —
// no tinted pill behind it (Prince: cleaner without). Idle tabs: outline icons in grey.
// The icons come from Ionicons (filled + outline pairs, the Food bar's set) by tab label; unknown labels keep their
// lucide Icon. accent: the app's colour (Captain blue by default; the delivery app passes its own blue).
const ION_BY_LABEL = {
  home: 'home',
  history: 'time',
  milestone: 'trophy',
  profile: 'person',
  account: 'person',
  drivers: 'people',
  vehicle: 'car',
  bus: 'bus',
  schedule: 'calendar',
  desk: 'bus',
  bookings: 'clipboard',
  feed: 'grid',
  orders: 'cube',
  pocket: 'wallet',
};

function TabIcon({ label, Icon, active, accent }) {
  const color = active ? accent : '#64748B';
  const key = String(label).toLowerCase();
  if (key === 'wallet') return <MaterialIcons name="currency-rupee" size={22} color={color} />;
  const ion = ION_BY_LABEL[key];
  if (ion) return <Ionicons name={active ? ion : `${ion}-outline`} size={22} color={color} />;
  return <Icon size={21} strokeWidth={active ? 2.4 : 2} color={color} fill={active ? accent : 'none'} />;
}

const DriverNavBar = ({ items = [], accent = '#2563EB' }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sideGap = width <= 380 ? 12 : 24;
  const barWidth = Math.min(width - sideGap * 2, 448);
  const count = Math.max(items.length, 1);
  const labelSize = count >= 6 ? (width <= 380 ? 8 : 8.5) : 9;

  return (
    <View pointerEvents="box-none" style={[styles.nav, { bottom: BAR_GAP + insets.bottom }]}>
      <View style={[styles.bar, { width: barWidth }]} accessibilityRole="tablist">
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
              <View style={active ? styles.iconActive : null}>
                <TabIcon label={label} Icon={Icon} active={active} accent={accent} />
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
                  { fontSize: labelSize, letterSpacing: count >= 6 ? 0 : 0.18, color: active ? accent : '#64748B' },
                  active && styles.labelActive,
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
  iconActive: { transform: [{ scale: 1.1 }] },
  labelActive: { fontWeight: '900' },
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
