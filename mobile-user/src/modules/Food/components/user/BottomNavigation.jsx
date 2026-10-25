// Web: modules/Food/components/user/BottomNavigation.jsx — the floating Food tab bar (Delivery / Takeaway / Under 250 /
// Dining) on the main tabs. Same items, icons, colours (light + dark), active pill that springs between tabs, the
// dynamic under-250 price limit (GET /food/landing/settings/public) and hide-on-scroll-down / show-on-scroll-up.
// The web read window.scrollY; here the open tab's list offset comes from browseScrollMemory (the browse pages
// register their lists there).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useLocation, useNavigate } from '@/lib/router';
import { announceTabSwitch, navigateAfterTabSwitch, useAnnouncedTab } from '@/lib/tabSwitch';
import { Text } from '@/native/ui';
import { alpha, colors, useTheme } from '@/theme';
import api from '@food/api';
import { useProfile } from '@food/context/ProfileContext';
import { getCachedUnder250PriceLimit, getLandingSettingsPublic } from '@food/utils/foodPageCache';
import { subscribeBottomNavShow } from '@food/utils/bottomNavEvents';
import { getBrowseScrollY } from '@food/utils/browseScrollMemory';

const HIDE_LOCK_MS = 900;

const ICONS = {
  delivery: (color) => <MaterialIcons name="delivery-dining" size={22} color={color} />,
  takeaway: (color) => <Ionicons name="bag" size={22} color={color} />,
  under250: (color) => <Ionicons name="pricetag" size={22} color={color} />,
  dining: (color) => <Ionicons name="restaurant" size={22} color={color} />,
};

export default function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = location.pathname;
  const [under250PriceLimit, setUnder250PriceLimit] = useState(() => getCachedUnder250PriceLimit(250));

  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(getBrowseScrollY(pathname));
  const accumulatedScrollUpRef = useRef(0);
  const accumulatedScrollDownRef = useRef(0);
  const isVisibleRef = useRef(true);
  const hideLockUntilRef = useRef(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const pill = useRef(new Animated.Value(0)).current;
  const [barWidth, setBarWidth] = useState(0);

  const showNavAtTop = useCallback(
    (lockMs = 0) => {
      accumulatedScrollDownRef.current = 0;
      accumulatedScrollUpRef.current = 0;
      lastScrollYRef.current = getBrowseScrollY(pathname);
      if (lockMs > 0) hideLockUntilRef.current = Date.now() + lockMs;
      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        setIsVisible(true);
      }
    },
    [pathname],
  );

  // Fetch landing settings to get dynamic price limit (shared cache)
  useEffect(() => {
    let cancelled = false;
    getLandingSettingsPublic(() => api.get('/food/landing/settings/public'))
      .then((settings) => {
        if (cancelled) return;
        if (settings && typeof settings.under250PriceLimit === 'number') setUnder250PriceLimit(settings.under250PriceLimit);
      })
      .catch(() => {
        if (!cancelled) setUnder250PriceLimit(250);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // After every route change / tab restore: force nav visible so first tap works.
  useEffect(() => {
    showNavAtTop(HIDE_LOCK_MS);
  }, [pathname, showNavAtTop]);

  useEffect(
    () =>
      subscribeBottomNavShow((e) => {
        const lockMs = Number(e?.detail?.lockMs) || HIDE_LOCK_MS;
        showNavAtTop(lockMs);
      }),
    [showNavAtTop],
  );

  // Hide on scroll down / show on scroll up (sampled from the open tab's list)
  useEffect(() => {
    const SHOW_THRESHOLD = 150;
    const HIDE_THRESHOLD = 80;

    const controlNavbar = (currentScrollY) => {
      const lastScrollY = lastScrollYRef.current;

      // Route/tab transition lock — scroll restore must not hide nav / eat taps
      if (Date.now() < hideLockUntilRef.current) {
        lastScrollYRef.current = currentScrollY;
        if (!isVisibleRef.current) {
          isVisibleRef.current = true;
          setIsVisible(true);
        }
        return;
      }

      // At the top of the page, always show the bar
      if (currentScrollY <= 50) {
        showNavAtTop();
        return;
      }

      if (currentScrollY > lastScrollY) {
        const delta = currentScrollY - lastScrollY;
        accumulatedScrollDownRef.current += delta;
        accumulatedScrollUpRef.current = 0;
        if (accumulatedScrollDownRef.current > HIDE_THRESHOLD && currentScrollY > 100) {
          if (isVisibleRef.current) {
            isVisibleRef.current = false;
            setIsVisible(false);
          }
        }
      } else {
        const delta = lastScrollY - currentScrollY;
        accumulatedScrollUpRef.current += delta;
        accumulatedScrollDownRef.current = 0;
        if (accumulatedScrollUpRef.current > SHOW_THRESHOLD) {
          if (!isVisibleRef.current) {
            isVisibleRef.current = true;
            setIsVisible(true);
          }
        }
      }

      lastScrollYRef.current = currentScrollY;
    };

    const timer = setInterval(() => {
      const y = getBrowseScrollY(pathname);
      if (y !== lastScrollYRef.current) controlNavbar(y);
      else if (y <= 50 && !isVisibleRef.current) showNavAtTop();
    }, 50);
    return () => clearInterval(timer);
  }, [pathname, showNavAtTop]);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isVisible ? 0 : 120,
      duration: 200,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [isVisible, translateY]);

  // Normalize pathname by removing trailing slash for consistent comparison
  const normalizedPath = pathname.replace(/\/$/, '') || '/';

  const { setOrderType } = useProfile();

  const isDining = normalizedPath === '/food/dining' || normalizedPath.startsWith('/food/user/dining');
  const isUnder250 = normalizedPath === '/food/under-250' || normalizedPath.startsWith('/food/user/under-250');
  const isProfile = normalizedPath.startsWith('/food/profile') || normalizedPath.startsWith('/food/user/profile');
  const isTakeawayPath = normalizedPath === '/food/user/takeaway' || normalizedPath.startsWith('/food/user/takeaway');
  const isDeliveryPath = normalizedPath === '/food' || normalizedPath === '/food/user' || normalizedPath === '/user' || normalizedPath === '/';

  // Path wins over orderType so Delivery never looks "stuck" inactive after tab switch
  const isTakeaway = isTakeawayPath;
  const isDelivery = isDeliveryPath && !isDining && !isUnder250 && !isProfile;

  const routeTabId = isDelivery ? 'delivery' : isTakeaway ? 'takeaway' : isUnder250 ? 'under250' : isDining ? 'dining' : null;
  // a tapped tab lights up at once (before its route has loaded)
  const shownTabId = useAnnouncedTab('food', routeTabId);
  const navItems = [
    { id: 'delivery', label: 'Delivery', to: '/food/user', orderType: 'delivery' },
    { id: 'takeaway', label: 'Takeaway', to: '/food/user/takeaway', orderType: 'takeaway' },
    { id: 'under250', label: `Under ₹${under250PriceLimit}`, to: '/food/user/under-250' },
    { id: 'dining', label: 'Dining', to: '/food/user/dining' },
  ].map((item) => ({ ...item, active: item.id === shownTabId }));
  const activeIndex = navItems.findIndex((item) => item.active);

  // layoutId="active-nav-bg": one pill that springs to the active tab
  useEffect(() => {
    if (activeIndex < 0) return;
    Animated.spring(pill, { toValue: activeIndex, stiffness: 400, damping: 30, mass: 1, useNativeDriver: true }).start();
  }, [activeIndex, pill]);

  const handleTabClick = (item) => {
    showNavAtTop(HIDE_LOCK_MS);
    const current = normalizedPath;
    const target = item.to.replace(/\/$/, '') || '/';
    // The tab shows at once; the order type (re-renders every cart / home consumer) and the route follow a frame later.
    announceTabSwitch('food', item.id);
    navigateAfterTabSwitch(() => {
      // Always navigate — even same-looking paths must leave Under250/Dining instantly
      navigate(item.to, { replace: current === target });
      // its own render pass, after the route's
      if (item.orderType && setOrderType) setTimeout(() => setOrderType(item.orderType), 0);
    });
  };

  const itemWidth = barWidth > 0 ? (barWidth - 2 - 16) / navItems.length : 0;
  const activeColor = '#DC2626';
  const idleColor = t.dark ? colors.gray[400] : colors.gray[600];

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityElementsHidden={!isVisible}
      style={[styles.wrap, { bottom: 24 + insets.bottom, transform: [{ translateY }] }]}
    >
      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={[
          styles.bar,
          { backgroundColor: t.dark ? '#1a1a1a' : colors.white, borderColor: t.dark ? alpha('#ffffff', 0.1) : colors.gray[100] },
        ]}
      >
        {itemWidth > 0 && activeIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              {
                width: itemWidth - 8,
                backgroundColor: t.dark ? alpha('#DC2626', 0.1) : '#FFF5F5',
                transform: [{ translateX: Animated.multiply(pill, itemWidth) }],
              },
            ]}
          />
        ) : null}
        {navItems.map((item) => {
          const color = item.active ? activeColor : idleColor;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: item.active }}
              onPress={() => handleTabClick(item)}
              style={styles.item}
            >
              <View style={{ alignItems: 'center', gap: 2 }}>
                <View style={item.active ? { transform: [{ scale: 1.1 }] } : null}>{ICONS[item.id](color)}</View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    { color: item.active ? activeColor : t.dark ? alpha(colors.gray[300], 0.6) : alpha(colors.gray[900], 0.7) },
                  ]}
                >
                  {item.id === 'under250' ? 'Under 250' : item.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, zIndex: 11000, elevation: 30, paddingHorizontal: 24 },
  bar: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    height: 72,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 15 },
    elevation: 14,
  },
  pill: { position: 'absolute', left: 12, top: 11, bottom: 11, borderRadius: 24 },
  item: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  label: { fontSize: 10, lineHeight: 10, fontWeight: '900', letterSpacing: -0.25, textTransform: 'uppercase' },
});
