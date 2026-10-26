// Web: components/restaurant/BottomNavOrders.jsx — the restaurant panel's floating bottom bar (crimson gradient pill,
// Orders / Inventory / Feedback / Explore, a pulsing dot on Orders for a new order / reservation and on Feedback for
// unread notifications).
// Native:
// - On the four tab paths the restaurant layout draws ONE bar (RestaurantApp) — the tab screens must not render it.
//   Other pages that drew it on the web (HubFinance, Hyperpure, OutletInfo, WithdrawalHistoryPage) render it
//   themselves, like the web.
// - A tap lights the tab at once and announces it to the kept-alive layer (lib/tabSwitch); the router follows.
// - Selected tab (Prince, delivery / Captain bars): solid icon + heavy label, no tinted pill — here white on the web's
//   crimson bar; idle tabs: outline icons in white/78.
// - Tab screens leave room for it at their end: useRestaurantNavSpace().
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocationNow, useNavigate } from '@/lib/router';
import { announceTabSwitch, navigateAfterTabSwitch } from '@/lib/tabSwitch';
import { Text } from '@/native/ui';
import { alpha, restaurantTheme } from '@/theme';
import useNotificationInbox from '@food/hooks/useNotificationInbox';
import { useRestaurantNotifications } from '@food/hooks/useRestaurantNotifications';
import { resolveRestaurantLayer } from './restaurantTabPages';

// bar: py-2 around buttons of py-2 + 18 px icon + gap-1 + 11 px label
export const RESTAURANT_NAV_HEIGHT = 66;
const NAV_BOTTOM = 12; // pb-[max(0.75rem, env(safe-area-inset-bottom))]

/** Room a scrolling page needs at its end so its last card clears the bar (+ the Android navigation bar under it). */
export function useRestaurantNavSpace(extra = 16) {
  const insets = useSafeAreaInsets();
  return RESTAURANT_NAV_HEIGHT + NAV_BOTTOM + insets.bottom + extra;
}

const getOrdersTabs = (basePath = '/food/restaurant') => [
  { id: 'orders', label: 'Orders', icon: 'document-text', route: `${basePath}` },
  { id: 'inventory', label: 'Inventory', icon: 'cube', route: `${basePath}/inventory` },
  { id: 'feedback', label: 'Feedback', icon: 'chatbox-ellipses', route: `${basePath}/feedback` },
  { id: 'explore', label: 'Explore', icon: 'compass', route: `${basePath}/explore` },
];

const findActiveTab = (tabs, pathname) =>
  tabs
    .slice()
    .sort((a, b) => b.route.length - a.route.length)
    .find((tab) => pathname === tab.route || pathname.startsWith(tab.route + '/'));

function PulseDot() {
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
  return (
    <Animated.View style={[styles.dot, { opacity: v }]}>
      <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function BottomNavOrders({ activeTabOverride }) {
  const navigate = useNavigate();
  const { pathname } = useLocationNow();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const basePath = '/food/restaurant';

  const { unreadCount } = useNotificationInbox('restaurant', { limit: 20, pollMs: 60 * 1000 });
  const { newOrder, newReservation } = useRestaurantNotifications();

  const tabs = useMemo(() => getOrdersTabs(basePath), [basePath]);
  const routeTab = useMemo(() => {
    if (activeTabOverride) return activeTabOverride;
    // the second path of a tab screen (/reviews = Feedback, /menu = Inventory, /settings = Explore) lights up its tab;
    // the web matched only the tab's own route and showed Orders as selected there
    const layer = resolveRestaurantLayer(pathname);
    if (layer) return layer;
    const match = findActiveTab(tabs, pathname);
    return match?.id || 'orders';
  }, [tabs, pathname, activeTabOverride]);

  // the tapped tab lights up at once; the screen (and the real route) catches up behind it
  const [pendingTab, setPendingTab] = useState(null);
  useEffect(() => {
    setPendingTab(null);
  }, [pathname]);
  const activeTab = pendingTab || routeTab;

  const isInternalPage = pathname.includes('/create-offers') || pathname.includes('/help-centre/support');
  if (isInternalPage) {
    return null;
  }

  const handleTabClick = (tab) => {
    if (tab.route && tab.route !== pathname) {
      setPendingTab(tab.id);
      announceTabSwitch('restaurant', tab.id);
      navigateAfterTabSwitch(() => navigate(tab.route));
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: NAV_BOTTOM + insets.bottom }]}>
      <View style={[styles.barShadow, { width: Math.min(width - 16, 448) }]}>
        <LinearGradient
          colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bar}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const showDot = (tab.id === 'orders' && (newOrder || newReservation)) || (tab.id === 'feedback' && unreadCount > 0);
            return (
              <Pressable
                key={tab.id}
                onPress={() => handleTabClick(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [styles.tab, pressed && { transform: [{ scale: 0.95 }] }]}
              >
                <Ionicons name={isActive ? tab.icon : `${tab.icon}-outline`} size={isActive ? 19 : 18} color={isActive ? '#FFFFFF' : alpha('#FFFFFF', 0.78)} />
                {showDot ? <PulseDot /> : null}
                <Text numberOfLines={1} style={[styles.label, isActive ? styles.labelActive : null]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </LinearGradient>
      </View>
    </View>
  );
}

export default memo(BottomNavOrders);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 40, elevation: 40 },
  barShadow: {
    borderRadius: 30,
    shadowColor: '#7E3866',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    backgroundColor: restaurantTheme.brandDark,
  },
  bar: {
    borderRadius: 30,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    gap: 4,
  },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 9999 },
  label: { fontSize: 11, lineHeight: 12, color: alpha('#FFFFFF', 0.78), fontWeight: '500' },
  labelActive: { color: '#FFFFFF', fontWeight: '800' },
  dot: {
    position: 'absolute',
    top: 8,
    right: '25%',
    width: 8,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: restaurantTheme.brand,
    zIndex: 20,
  },
});
