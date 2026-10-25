// Web: modules/Taxi/modules/user/components/BottomNavbar.jsx + index.css .user-bottom-nav* — the floating Taxi bottom
// bar (Home / Rides / [Bus] / Support), 72 px, radius 2rem, 24 px from the bottom, with a page-colour strip fading out
// behind it and a sliding active pill (framer-motion layoutId -> Animated spring between the measured tab boxes).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigate, useLocation } from '@/lib/router';
import { announceTabSwitch, navigateAfterTabSwitch, useAnnouncedTab } from '@/lib/tabSwitch';
import { AppImage, Text } from '@/native/ui';
import { alpha } from '@/theme';
import { useSettings, normalizeAssetUrl } from '../../../shared/context/SettingsContext';
import { useUserPalette } from '../../../shared/context/UserThemeContext';
import { preloadTaxiTab } from './tabPages';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
};

/** Height the bar takes from the bottom of the screen (bar + its 24 px offset), for screens that pad their lists. */
export const TAXI_BOTTOM_NAV_SPACE = 72 + 24;

const NavItem = ({ Icon, imageIcon, label, isActive, onPress, onPressIn, onLayout, p }) => {
  const scale = useRef(new Animated.Value(isActive ? 1.1 : 1)).current;
  useEffect(() => {
    Animated.timing(scale, { toValue: isActive ? 1.1 : 1, duration: 300, useNativeDriver: true }).start();
  }, [isActive, scale]);
  const color = isActive ? p.navActiveFg : p.navIdle;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={onPressIn}
      onLayout={onLayout}
      style={styles.item}
    >
      <View style={styles.itemInner}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {imageIcon ? (
            <AppImage src={imageIcon} contentFit="contain" style={[styles.imageIcon, { opacity: isActive ? 1 : 0.8 }]} />
          ) : (
            <Ionicons name={Icon} size={22} color={color} />
          )}
        </Animated.View>
        <Text style={[styles.label, { color }]}>{label}</Text>
      </View>
    </Pressable>
  );
};

const BottomNavbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { settings, modules } = useSettings();
  const p = useUserPalette();
  const insets = useSafeAreaInsets();
  const showBusService = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const busModule = (modules || []).find((m) => m.service_type === 'bus' || String(m.name || '').toLowerCase() === 'bus');
  // An icon the admin uploaded for the Bus module wins; otherwise the same filled icon set as the other tabs.
  const dynamicBusIcon = busModule?.mobile_menu_icon ? normalizeAssetUrl(busModule.mobile_menu_icon) : null;

  const navItems = [
    { id: 'ride', icon: 'home', label: 'Home', path: '/taxi/user' },
    { id: 'activity', icon: 'receipt', label: 'Rides', path: '/taxi/user/activity' },
    ...(showBusService ? [{ id: 'bus', icon: 'bus', imageIcon: dynamicBusIcon, label: 'Bus', path: '/taxi/user/bus' }] : []),
    { id: 'support', icon: 'headset', label: 'Support', path: '/taxi/user/support' },
  ];

  const routeIndex = navItems.findIndex(({ path }) =>
    path === '/taxi/user' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`),
  );
  // a tapped tab lights up at once (before its route has loaded); ids = UserMainTabKeepAlive tabs
  const shownId = useAnnouncedTab('taxi', navItems[routeIndex]?.id || null);
  const activeIndex = navItems.findIndex(({ id }) => id === shownId);

  // sliding pill (shared layoutId on the web): spring to the active tab's box
  const [layouts, setLayouts] = useState({});
  const pillX = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const placedRef = useRef(false);
  const activeLayout = activeIndex >= 0 ? layouts[navItems[activeIndex]?.label] : null;

  useEffect(() => {
    if (!activeLayout) return;
    const x = activeLayout.x + 4;
    const w = Math.max(0, activeLayout.width - 8);
    if (!placedRef.current) {
      placedRef.current = true;
      pillX.setValue(x);
      pillW.setValue(w);
      return;
    }
    Animated.parallel([
      Animated.spring(pillX, { toValue: x, stiffness: 400, damping: 30, useNativeDriver: false }),
      Animated.spring(pillW, { toValue: w, stiffness: 400, damping: 30, useNativeDriver: false }),
    ]).start();
  }, [activeLayout?.x, activeLayout?.width, pillX, pillW]); // eslint-disable-line react-hooks/exhaustive-deps

  const bottom = 24 + insets.bottom;

  return (
    <View pointerEvents="box-none" style={[styles.nav, { bottom }]} accessibilityLabel="Main navigation">
      {/* A solid strip (page colour) behind the floating bar, fading out above it */}
      <View pointerEvents="none" style={[styles.strip, { bottom: -bottom, height: 108 + insets.bottom }]}>
        <LinearGradient colors={[alpha(p.bg, 0), p.bg, p.bg]} locations={[0, 0.18, 1]} style={StyleSheet.absoluteFill} />
      </View>

      <View style={[styles.bar, { backgroundColor: p.navBg, borderColor: p.navBorder }]}>
        {activeLayout ? (
          <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: p.navActiveBg, left: pillX, width: pillW }]} />
        ) : null}
        {navItems.map(({ id, icon, imageIcon, label, path }, index) => (
          <NavItem
            key={label}
            Icon={icon}
            imageIcon={imageIcon}
            label={label}
            p={p}
            isActive={index === activeIndex}
            onPress={() => {
              announceTabSwitch('taxi', id);
              navigateAfterTabSwitch(() => navigate(path));
            }}
            // the screen's first data starts loading as soon as a finger lands, not when it lifts
            onPressIn={() => preloadTaxiTab(path)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              setLayouts((prev) => (prev[label]?.x === x && prev[label]?.width === width ? prev : { ...prev, [label]: { x, width } }));
            }}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  nav: { position: 'absolute', left: 24, right: 24, zIndex: 9997, alignItems: 'center' },
  strip: { position: 'absolute', left: -24, right: -24 },
  bar: {
    width: '100%',
    maxWidth: 448,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 72,
    paddingHorizontal: 8,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    // --user-nav-shadow: 0 15px 40px -10px rgba(0,0,0,0.3)
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 15 },
  },
  pill: { position: 'absolute', top: 12, height: 48, borderRadius: 24 },
  item: { flex: 1, minWidth: 0, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  itemInner: { zIndex: 10, alignItems: 'center', gap: 2 },
  imageIcon: { height: 20, width: 20 },
  label: { fontSize: 10, lineHeight: 10, fontWeight: '700', letterSpacing: -0.25, textTransform: 'uppercase' },
});

export default BottomNavbar;
