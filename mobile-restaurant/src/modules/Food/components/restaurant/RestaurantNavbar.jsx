// Web: components/restaurant/RestaurantNavbar.jsx — the crimson rounded header of the restaurant panel (name, address,
// Online / Offline / Closed pill -> /status, bell with unread dot -> /notifications), the optional order search bar
// (broadcasts `restaurantSearchUpdated`) and the real-time "New Table Request!" popup. Same props, same texts.
// Native:
// - The header reaches under the status bar (its top padding includes the safe-area inset), so a screen that puts it
//   first must not add its own top inset.
// - The table-request popup (web: fixed top-20 card) is a transparent native Modal. The navbar is drawn by kept-alive
//   tab screens (Orders, Inventory) too: the popup shows only from the screen that is on screen
//   (useRestaurantTabActive), so two mounted navbars never show it twice.
// - backdrop-blur on the status pill -> the same translucent colours without blur.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, MapPin, Search, Utensils, X } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Text, TextInput } from '@/native/ui';
import { alpha, colors, restaurantTheme, sp } from '@/theme';
import { panelWords as sw } from '@food/utils/adminPartnerLabels';
import { restaurantAPI } from '@food/api';
import { formatRestaurantDisplayAddress } from '@food/utils/restaurantLocation';
import { getCachedSettings, loadBusinessSettings } from '@food/utils/businessSettings';
import useNotificationInbox from '@food/hooks/useNotificationInbox';
import { useRestaurantNotifications } from '@food/hooks/useRestaurantNotifications';
import { getRestaurantAvailabilityStatus } from '@food/utils/restaurantAvailability';
import { useRestaurantTabActive } from '@food/components/restaurant/restaurantTabPages';

const debugError = () => {};

const extractRestaurantPayload = (response) =>
  response?.data?.data?.restaurant ||
  response?.data?.restaurant ||
  response?.data?.data?.user ||
  response?.data?.user ||
  response?.data?.data ||
  null;

// Tailwind animate-ping (scale 1 -> 2, fade out, repeat)
function PingDot() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={[
        styles.dot,
        styles.pingDot,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
        },
      ]}
    />
  );
}

function TableRequestPopup({ reservation, onClose, onView }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [anim]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={[styles.popupRoot, { paddingTop: insets.top + 80 }]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.popupCard,
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }] },
          ]}
        >
          <View style={styles.popupTop}>
            <View style={styles.popupIcon}>
              <Utensils size={24} color={restaurantTheme.brand} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.popupTitle}>New Table Request!</Text>
              <Text style={styles.popupText} numberOfLines={1}>
                {reservation.user?.name || 'A Guest'} has requested a table for {reservation.guests} people.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.popupClose}>
              <X size={16} color={colors.slate[400]} />
            </Pressable>
          </View>
          <View style={styles.popupActions}>
            <Pressable onPress={onView} style={styles.popupViewBtn}>
              <LinearGradient
                colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.popupViewText}>VIEW REQUEST</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.popupLaterBtn}>
              <Text style={styles.popupLaterText}>LATER</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function RestaurantNavbar({
  restaurantName: propRestaurantName,
  location: propLocation,
  showSearch = true,
  hideSearch = false,
  showOfflineOnlineTag = true,
  showNotifications = true,
}) {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const insets = useSafeAreaInsets();
  const tabActive = useRestaurantTabActive();
  // native: a kept-alive tab (Orders / Inventory) shows this navbar again without mounting it; what the web loaded on
  // mount is loaded again each time the tab is shown again, keeping the old data on screen meanwhile
  const visitRef = useRef({ prev: tabActive, count: 0 });
  if (tabActive && !visitRef.current.prev) visitRef.current.count += 1;
  visitRef.current.prev = tabActive;
  const visitCount = visitRef.current.count;
  const hasDataRef = useRef(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [status, setStatus] = useState('Offline');
  const [restaurantData, setRestaurantData] = useState(null);
  const [loading, setLoading] = useState(true);
  // web: business settings were loaded for branding (company name / logo); the header never showed them
  const [, setCompanyName] = useState('');
  const [, setLogoUrl] = useState(null);
  const searchTimeoutRef = useRef(null);
  const { unreadCount } = useNotificationInbox('restaurant', { limit: 20, pollMs: 5 * 60 * 1000 });
  const { newReservation, clearNewReservation } = useRestaurantNotifications();

  // Global search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchValue.trim() === '') {
      // Dispatch empty search event
      window.dispatchEvent(
        new CustomEvent('restaurantSearchUpdated', {
          detail: { query: '', results: [], isLoading: false },
        }),
      );
      return;
    }

    // Set loading state
    window.dispatchEvent(
      new CustomEvent('restaurantSearchUpdated', {
        detail: { query: searchValue, results: [], isLoading: true },
      }),
    );

    // Debounce search API call
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await restaurantAPI.getOrders({
          page: 1,
          limit: 100,
          search: searchValue,
        });

        if (response.data.success) {
          window.dispatchEvent(
            new CustomEvent('restaurantSearchUpdated', {
              detail: {
                query: searchValue,
                results: response.data.data.orders || [],
                isLoading: false,
              },
            }),
          );
        }
      } catch (error) {
        debugError('Search error:', error);
        window.dispatchEvent(
          new CustomEvent('restaurantSearchUpdated', {
            detail: { query: searchValue, results: [], isLoading: false, error },
          }),
        );
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchValue]);

  // Load business settings for branding
  useEffect(() => {
    const loadSettings = async () => {
      const cached = getCachedSettings();
      if (cached) {
        if (cached.companyName) setCompanyName(cached.companyName);
        if (cached.logo?.url) setLogoUrl(cached.logo.url);
      } else {
        const settings = await loadBusinessSettings();
        if (settings) {
          if (settings.companyName) setCompanyName(settings.companyName);
          if (settings.logo?.url) setLogoUrl(settings.logo.url);
        }
      }
    };
    loadSettings();

    const handleSettingsUpdate = () => {
      const cached = getCachedSettings();
      if (cached) {
        if (cached.companyName) setCompanyName(cached.companyName);
        if (cached.logo?.url) setLogoUrl(cached.logo.url);
      }
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
  }, []);

  // Fetch restaurant data on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        if (!hasDataRef.current) setLoading(true);
        const response = await restaurantAPI.refreshCurrentRestaurant();
        const data = extractRestaurantPayload(response);
        if (data) {
          hasDataRef.current = true;
          setRestaurantData(data);
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError('Error fetching restaurant data:', error);
        }
        // Continue with default values if fetch fails
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurantData();

    const handleRestaurantDataUpdate = () => {
      fetchRestaurantData();
    };

    window.addEventListener('ownerDataUpdated', handleRestaurantDataUpdate);
    window.addEventListener('addressUpdated', handleRestaurantDataUpdate);

    return () => {
      window.removeEventListener('ownerDataUpdated', handleRestaurantDataUpdate);
      window.removeEventListener('addressUpdated', handleRestaurantDataUpdate);
    };
  }, [visitCount]);

  // Get restaurant name (use prop if provided, otherwise use fetched data)
  const restaurantName = propRestaurantName || restaurantData?.name || sw('Restaurant');

  const [restaurantAddress, setRestaurantAddress] = useState('');

  // Update location when restaurantData or propLocation changes
  useEffect(() => {
    if (propLocation && propLocation.trim() !== '') {
      setRestaurantAddress(propLocation.trim());
      return;
    }

    if (restaurantData) {
      setRestaurantAddress(formatRestaurantDisplayAddress(restaurantData.location, restaurantData));
    } else {
      setRestaurantAddress('');
    }
  }, [restaurantData, propLocation]);

  // Weekly outlet schedule — the toggle alone isn't enough: on a closed day /
  // outside hours the restaurant can't take orders, so it must not read "Online".
  const [outletTimings, setOutletTimings] = useState(null);
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    let active = true;
    const loadTimings = () =>
      restaurantAPI
        .getOutletTimings()
        .then((res) => {
          const timings = res?.data?.data?.outletTimings || res?.data?.outletTimings || null;
          if (active && timings) setOutletTimings(timings);
        })
        .catch(() => {});
    loadTimings();
    window.addEventListener('outletTimingsUpdated', loadTimings);
    // Re-check open/closed every minute (opening/closing time can pass while the page is open).
    const tick = setInterval(() => setClockTick((t) => t + 1), 60 * 1000);
    return () => {
      active = false;
      window.removeEventListener('outletTimingsUpdated', loadTimings);
      clearInterval(tick);
    };
  }, [visitCount]);

  // Load status from localStorage on mount and listen for changes
  useEffect(() => {
    const isOpenBySchedule = () => {
      if (!restaurantData) return true;
      return getRestaurantAvailabilityStatus(
        { ...restaurantData, outletTimings: outletTimings || restaurantData.outletTimings },
        new Date(),
        { ignoreOperationalStatus: true },
      ).isOpen;
    };
    const applyStatus = (toggleOnline) => {
      if (!toggleOnline) setStatus('Offline');
      else setStatus(isOpenBySchedule() ? 'Online' : 'Closed');
    };
    const updateStatus = () => {
      try {
        const savedStatus = localStorage.getItem('restaurant_online_status');
        if (savedStatus !== null) {
          applyStatus(Boolean(JSON.parse(savedStatus)));
        } else {
          // If not stored yet, fallback to backend value (when available).
          applyStatus(Boolean(restaurantData?.isAcceptingOrders));
        }
      } catch (error) {
        debugError('Error loading restaurant status:', error);
        applyStatus(Boolean(restaurantData?.isAcceptingOrders));
      }
    };

    // Load initial status
    updateStatus();

    // Listen for status changes from RestaurantStatus page
    const handleStatusChange = (event) => {
      applyStatus(Boolean(event.detail?.isOnline));
    };

    window.addEventListener('restaurantStatusChanged', handleStatusChange);

    return () => {
      window.removeEventListener('restaurantStatusChanged', handleStatusChange);
    };
  }, [restaurantData, outletTimings, clockTick]);

  const handleStatusClick = () => {
    navigate('/food/restaurant/status', { state: { from: routerLocation.pathname } });
  };

  const handleSearchClose = () => {
    setSearchValue('');
  };

  const handleNotificationsClick = () => {
    navigate('/food/restaurant/notifications', { state: { from: routerLocation.pathname } });
  };

  const isOnline = status === 'Online';

  return (
    <>
      <View style={styles.headerShadow}>
        <LinearGradient
          colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top }]}
        >
          {/* Top Navbar */}
          <View style={styles.topRow}>
            {/* Left Side - Restaurant Info */}
            <View style={styles.left}>
              <View style={styles.minW0}>
                {/* Restaurant Name */}
                <Text style={styles.name} numberOfLines={1}>
                  {loading ? 'Loading...' : restaurantName || sw('Restaurant')}
                </Text>
                {!loading && restaurantAddress && restaurantAddress.trim() !== '' ? (
                  <View style={styles.addressRow}>
                    <MapPin size={10} color={alpha(colors.white, 0.8)} />
                    <Text style={styles.address} numberOfLines={1}>
                      {restaurantAddress}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Right Side - Interactive Elements */}
            <View style={styles.right}>
              {/* Offline/Online Status Tag */}
              {showOfflineOnlineTag ? (
                <Pressable
                  onPress={handleStatusClick}
                  style={({ pressed }) => [
                    styles.statusPill,
                    isOnline ? styles.statusOnline : styles.statusOffline,
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <View style={styles.dotWrap}>
                    <View style={[styles.dot, { backgroundColor: isOnline ? colors.emerald[400] : alpha(colors.white, 0.3) }]} />
                    {isOnline ? <PingDot /> : null}
                  </View>
                  <Text style={[styles.statusText, { color: isOnline ? colors.white : alpha(colors.white, 0.7) }]}>{status}</Text>
                </Pressable>
              ) : null}

              {/* Notifications Icon */}
              {showNotifications ? (
                <Pressable
                  onPress={handleNotificationsClick}
                  accessibilityLabel="Notifications"
                  style={({ pressed }) => [styles.bellBtn, pressed && { backgroundColor: alpha(colors.white, 0.1) }]}
                >
                  <Bell size={20} color={colors.white} />
                  {unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
                </Pressable>
              ) : null}
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Persistent Search Bar - Outside the bordered navbar div */}
      {showSearch && !hideSearch ? (
        <View style={styles.searchWrap}>
          <View>
            <View style={styles.searchIcon} pointerEvents="none">
              <Search size={18} color={searchFocused ? restaurantTheme.brand : colors.slate[400]} />
            </View>
            <TextInput
              value={searchValue}
              onChangeText={setSearchValue}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search by order ID or dish name"
              placeholderTextColor={colors.slate[400]}
              returnKeyType="search"
              style={[styles.searchInput, searchFocused && styles.searchInputFocused]}
            />
            {searchValue ? (
              <Pressable onPress={handleSearchClose} style={styles.searchClear} hitSlop={8}>
                <X size={16} color={colors.slate[400]} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Real-time Dining Booking Popup */}
      {newReservation && tabActive ? (
        <TableRequestPopup
          reservation={newReservation}
          onClose={clearNewReservation}
          onView={() => {
            clearNewReservation();
            navigate('/food/restaurant/dining-reservations');
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  minW0: { minWidth: 0, flexShrink: 1 },
  headerShadow: {
    zIndex: 10,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    backgroundColor: restaurantTheme.brandDark,
    elevation: 10,
    shadowColor: '#B80B3D',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  header: { width: '100%', borderBottomLeftRadius: 35, borderBottomRightRadius: 35, paddingBottom: sp(2), overflow: 'hidden' },
  topRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flex: 1, minWidth: 0, paddingRight: sp(2), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  name: { fontSize: 17, lineHeight: 19, fontWeight: '700', color: colors.white, letterSpacing: -0.4 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1), marginTop: 6, opacity: 0.9 },
  address: { fontSize: 11, lineHeight: 15, color: alpha(colors.white, 0.9), fontWeight: '500', flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(1),
    paddingHorizontal: sp(2),
    paddingVertical: sp(1),
    borderRadius: 9999,
    borderWidth: 1,
  },
  statusOnline: { backgroundColor: alpha(colors.white, 0.15), borderColor: alpha(colors.white, 0.2) },
  statusOffline: { backgroundColor: alpha('#B80B3D', 0.6), borderColor: alpha(colors.white, 0.1) },
  dotWrap: { width: 6, height: 6, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pingDot: { position: 'absolute', backgroundColor: colors.emerald[400] },
  statusText: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 2 },
  bellBtn: { padding: 10, borderRadius: 9999 },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.emerald[400],
    borderWidth: 2,
    borderColor: '#B80B3D',
  },
  searchWrap: { paddingHorizontal: sp(4), paddingVertical: sp(3), backgroundColor: colors.white },
  searchIcon: { position: 'absolute', left: sp(3), top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  searchInput: {
    width: '100%',
    paddingLeft: 40,
    paddingRight: sp(4),
    paddingVertical: sp(3),
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.slate[100],
    borderRadius: 16,
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[900],
  },
  searchInputFocused: { borderColor: alpha('#B80B3D', 0.2) },
  searchClear: { position: 'absolute', right: sp(3), top: 0, bottom: 0, justifyContent: 'center' },
  popupRoot: { flex: 1, paddingHorizontal: sp(4) },
  popupCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: alpha('#B80B3D', 0.1),
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  popupTop: { padding: sp(4), flexDirection: 'row', alignItems: 'center', gap: sp(4) },
  popupIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.red[50], alignItems: 'center', justifyContent: 'center' },
  popupTitle: { fontWeight: '900', color: colors.slate[900], fontSize: 14, lineHeight: 20 },
  popupText: { fontSize: 12, lineHeight: 16, color: colors.slate[500], fontWeight: '500', marginTop: 2 },
  popupClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  popupActions: { backgroundColor: colors.slate[50], padding: sp(3), flexDirection: 'row', gap: sp(2) },
  popupViewBtn: { flex: 1, height: 40, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  popupViewText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
  popupLaterBtn: {
    paddingHorizontal: sp(4),
    height: 40,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupLaterText: { color: colors.slate[600], fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
});
