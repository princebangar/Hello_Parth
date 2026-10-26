// Web: pages/restaurant/ExploreMore.jsx (/food/restaurant/explore and /settings) — "Explore more": restaurant card,
// the menu sections (Manage outlet, Settings, Orders, Help, Finance; a My Store partner has no Dining / Menu
// categories / Takeaway), search popup, "My profile" popup (edit owner, Logout, Logout from all devices), the Logout
// card + its popup, Delete Account (balance check -> balance warning -> "Type DELETE" popup), the Takeaway switch popup
// (restaurantAPI.updateTakeawaySettings) and the schedule-off popups.
// Data: restaurantAPI.refreshCurrentRestaurant() on mount and on the ownerDataUpdated / addressUpdated window events;
// the schedule-off entry from localStorage `restaurant_schedule_off`.
// Native:
// - KEPT-ALIVE TAB (RestaurantTabKeepAlive): the layout draws the one bottom bar, so this screen never renders
//   BottomNavOrders; its scroll content ends with useRestaurantNavSpace() room. What the web loaded on mount is loaded
//   again each time the tab becomes the one on screen (old data stays visible meanwhile); the window listeners run only
//   while the tab is shown; popups close when another tab / page opens (web: the page unmounted). Pull-to-refresh
//   (tint #B80B3D) reloads the same data; useTabScrollTop on the scroll view. Its StatusBar exists only while shown.
// - Log-out (Prince, 26 Oct, all apps): the popups close at once (no fade over the login screen) and the app goes to
//   /food/restaurant/login with replace; the web's 300 ms delay before that is dropped (as in the delivery app).
// - The schedule-off flow is kept although no item opens it on the web (no item has id 5 there): the web's date-range
//   calendar -> native date pickers (start / end), its time wheel -> the native TimePickerWheel from DaySlots.
// - framer-motion entrance animations -> none (content shows at once; the fade read as a blink); popups -> Dialog / Sheet / a top sheet
//   Modal for search (the web's fixed inset-0 layers above the bottom bar).
// - "Type DELETE" input: the Dialog is lifted by useKeyboardOffset(); search results are a KeyboardAwareScrollView.
// - Lenis smooth scrolling and the body scroll lock -> nothing (native scroll, Modals).
// - Firebase sign-out on log-out: the app never signs in to Firebase Auth, so it signs out only if an auth instance
//   already exists with a user (web: ensureFirebaseInitialized + signOut when a Google user was signed in).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { signOut } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Edit,
  FileText,
  IndianRupee,
  Info,
  LifeBuoy,
  LogOut,
  MapPin,
  MessageSquare,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  Truck,
  User,
  UserRound,
  X,
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, Dialog, KeyboardAwareScrollView, Sheet, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { useTabScrollTop, useTabShown } from '@/native/ui/tabShown';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';
import useKeyboardOffset from '@/modules/Taxi/shared/hooks/useKeyboardOffset';
import { clearModuleAuth, clearAuthData, getCurrentUser, isMyStorePartner } from '@food/utils/auth';
import { restaurantAPI, authAPI } from '@food/api';
import { formatRestaurantDisplayAddress } from '@food/utils/restaurantLocation';
import { showAccountDeletedToast } from '@/shared/utils/customToasts';
import { firebaseAuth } from '@food/firebase';
import { useRestaurantNavSpace } from '@food/components/restaurant/BottomNavOrders';
import { useRestaurantTabActive } from '@food/components/restaurant/restaurantTabPages';
import { TimePickerWheel } from './DaySlots';

const debugWarn = () => {};
const debugError = () => {};

const BRAND = restaurantTheme.brand;
const RED = '#FF3131';
const GRADIENT = [restaurantTheme.brand, restaurantTheme.brandDark];

// web: framer-motion entrance fade. App: shown at once (Prince, 27 Oct: the fade read as a blink on every open)
function FadeIn({ children, style }) {
  return <View style={style}>{children}</View>;
}

// border-2 border-x/30 border-t-x rounded-full animate-spin
function RingSpinner({ size = 20, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: alpha(color, 0.3),
        borderTopColor: color,
        transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
      }}
    />
  );
}

function GradientFill({ style }) {
  return <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, style]} />;
}

// Search popup: a white panel sliding down from the top (web: fixed top-0 h-screen, y -100% -> 0, spring)
function TopSheet({ open, onClose, children }) {
  const h = Dimensions.get('window').height;
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.spring(anim, { toValue: 1, damping: 30, stiffness: 300, mass: 1, useNativeDriver: true }).start();
      return undefined;
    }
    const a = Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => a.stop();
  }, [open, anim]);
  if (!mounted) return null;
  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.black, 0.5), opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.searchPanel,
          { height: h, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-h, 0] }) }] },
        ]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

// Takeaway toggle (w-14 h-8 track, 24 px thumb at x 4 / 28, spring)
function TakeawaySwitch({ on }) {
  const x = useRef(new Animated.Value(on ? 28 : 4)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: on ? 28 : 4, stiffness: 400, damping: 35, mass: 1, useNativeDriver: true }).start();
  }, [on, x]);
  return (
    <View style={[styles.twTrack, { backgroundColor: on ? colors.green[500] : colors.gray[300] }]}>
      <Animated.View style={[styles.twThumb, { transform: [{ translateX: x }] }]} />
    </View>
  );
}

// web <Sheet>-style popup header (sticky title + close)
function SheetHeader({ title, onClose }) {
  return (
    <View style={styles.sheetHead}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.gray[100] }]}>
        <X size={20} color={colors.gray[900]} />
      </Pressable>
    </View>
  );
}

export default function ExploreMore() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabActive = useRestaurantTabActive();
  const tabShown = useTabShown();
  const navSpace = useRestaurantNavSpace();
  const keyboardOffset = useKeyboardOffset();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const scrollRef = useRef(null);
  useTabScrollTop(scrollRef);

  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Schedule off states
  const [scheduleOffOpen, setScheduleOffOpen] = useState(false);
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const [successPopupOpen, setSuccessPopupOpen] = useState(false);
  const [existingScheduleOpen, setExistingScheduleOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [startTime, setStartTime] = useState({ hour: '9', minute: '00', period: 'am' });
  const [endTime, setEndTime] = useState({ hour: '5', minute: '00', period: 'pm' });
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [iosCalendar, setIosCalendar] = useState(null); // 'start' | 'end' (iOS date sheet)
  const [iosCalendarValue, setIosCalendarValue] = useState(new Date());
  const [existingSchedule, setExistingSchedule] = useState(null);
  const [takeawayModalOpen, setTakeawayModalOpen] = useState(false);
  const [tempTakeawayEnabled, setTempTakeawayEnabled] = useState(false);
  const [isTakeawayUpdating, setIsTakeawayUpdating] = useState(false);

  // Account deletion states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteCaptcha, setDeleteCaptcha] = useState('');
  const [deleteFocused, setDeleteFocused] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBalanceWarning, setShowBalanceWarning] = useState(false);
  const [balanceData, setBalanceData] = useState({ balance: 0, type: 'Restaurant Available Balance' });
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  // signed out / account deleted: the popups go away at once, no fade over the login screen
  const [leaving, setLeaving] = useState(false);

  const STORAGE_KEY = 'restaurant_schedule_off';

  // Restaurant data state
  const [restaurantData, setRestaurantData] = useState(null);
  const [loadingRestaurant, setLoadingRestaurant] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleDeleteAccountClick = async () => {
    if (isCheckingBalance) return;
    setIsCheckingBalance(true);
    try {
      const response = await authAPI.checkBalance('restaurant');
      const payload = response?.data?.data ?? response?.data ?? {};
      const balance = Number(payload.balance || 0);
      const type = payload.type || 'Restaurant Available Balance';
      setDeleteCaptcha('');
      if (balance > 0) {
        setBalanceData({ balance, type });
        setShowBalanceWarning(true);
        return;
      }
      setDeleteConfirmOpen(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not verify your available balance');
    } finally {
      setIsCheckingBalance(false);
    }
  };

  // A popup belongs to this screen: when another tab / page opens, it closes (web: the page unmounted).
  useEffect(() => {
    if (tabActive) return;
    setProfileOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    setScheduleOffOpen(false);
    setDateTimePickerOpen(false);
    setSuccessPopupOpen(false);
    setExistingScheduleOpen(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setIosCalendar(null);
    setTakeawayModalOpen(false);
    setShowBalanceWarning(false);
    setDeleteConfirmOpen(false);
    setLogoutConfirmOpen(false);
  }, [tabActive]);

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const fetchRestaurantData = useCallback(async () => {
    try {
      setLoadingRestaurant(true);
      const response = await restaurantAPI.refreshCurrentRestaurant();
      const data = response?.data?.data?.restaurant || response?.data?.restaurant;
      if (data && mountedRef.current) {
        setRestaurantData(data);
      }
    } catch (error) {
      // Only log error if it's not a network/timeout error (backend might be down/slow)
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
        debugError('Error fetching restaurant data:', error);
      }
      // Continue with default values if fetch fails
    } finally {
      if (mountedRef.current) setLoadingRestaurant(false);
    }
  }, []);

  // Load existing schedule from localStorage
  const loadSchedule = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const schedule = JSON.parse(saved);
        // Convert date strings back to Date objects
        if (schedule.startDate) schedule.startDate = new Date(schedule.startDate);
        if (schedule.endDate) schedule.endDate = new Date(schedule.endDate);
        setExistingSchedule(schedule);
      }
    } catch (error) {
      debugError('Error loading schedule from localStorage:', error);
    }
  }, []);

  // Fetch restaurant data when the tab is shown (web: on mount) + the update events while it is shown
  useEffect(() => {
    if (!tabActive) return undefined;
    fetchRestaurantData();
    loadSchedule();

    const handleRestaurantDataUpdate = () => {
      fetchRestaurantData();
    };

    window.addEventListener('ownerDataUpdated', handleRestaurantDataUpdate);
    window.addEventListener('addressUpdated', handleRestaurantDataUpdate);

    return () => {
      window.removeEventListener('ownerDataUpdated', handleRestaurantDataUpdate);
      window.removeEventListener('addressUpdated', handleRestaurantDataUpdate);
    };
  }, [tabActive, fetchRestaurantData, loadSchedule]);

  const onRefresh = async () => {
    setRefreshing(true);
    loadSchedule();
    await fetchRestaurantData();
    if (mountedRef.current) setRefreshing(false);
  };

  const restaurantDisplayAddress = useMemo(() => {
    if (!restaurantData) return '';
    return formatRestaurantDisplayAddress(restaurantData.location, restaurantData);
  }, [restaurantData]);

  // Get user data from logged in session and restaurant data
  const userData = useMemo(() => {
    const sessionUser = getCurrentUser('restaurant');

    // Priority 1: Data from the currently logged in session user
    if (sessionUser && sessionUser.name && sessionUser.role) {
      return {
        name: sessionUser.name,
        phone: sessionUser.phone || restaurantData?.ownerPhone || restaurantData?.phone || 'N/A',
        email: sessionUser.email || restaurantData?.ownerEmail || restaurantData?.email || 'N/A',
        role: sessionUser.role.toUpperCase(),
        profileImage: sessionUser.profileImage || restaurantData?.profileImage,
      };
    }

    // Priority 2: Data from the restaurant document owner fields
    if (restaurantData) {
      return {
        name: restaurantData.ownerName || restaurantData.name || 'Restaurant Owner',
        phone: restaurantData.ownerPhone || restaurantData.phone || 'N/A',
        email: restaurantData.ownerEmail || restaurantData.email || 'N/A',
        role: 'OWNER',
        profileImage: restaurantData.profileImage,
      };
    }

    // Priority 3: Loading / Initial state
    return {
      name: loadingRestaurant ? 'Loading...' : 'Restaurant Owner',
      phone: '',
      email: '',
      role: 'OWNER',
    };
  }, [restaurantData, loadingRestaurant]);

  // Get restaurant display data
  const restaurantDisplayName = restaurantData?.name || 'Loading...';

  const signOutFirebase = async () => {
    // Sign out from Firebase if restaurant logged in via Google
    try {
      const currentUser = firebaseAuth?.currentUser;
      if (currentUser) {
        await signOut(firebaseAuth);
      }
    } catch (firebaseError) {
      // Continue even if Firebase logout fails
      debugWarn('Firebase logout failed, continuing with local cleanup:', firebaseError);
    }
  };

  const leaveToLogin = () => {
    setLeaving(true);
    setProfileOpen(false);
    setLogoutConfirmOpen(false);
    setDeleteConfirmOpen(false);
    navigate('/food/restaurant/login', { replace: true });
  };

  // Prince (27 Oct): log-out lands on the login screen at once. The backend logout (POST /food/auth/logout needs only
  // the refresh token, which restaurantAPI.logout() reads right here) and the Firebase sign-out finish in the
  // background; the web awaited both first. The login screen opens before the session is cleared, so the tab screens
  // and the bottom bar never show without a session for a frame.
  const handleLogout = () => {
    if (isLoggingOut) return; // Prevent multiple clicks

    setIsLoggingOut(true);
    restaurantAPI
      .logout()
      .catch((apiError) => debugWarn('Logout API call failed, continuing with local cleanup:', apiError))
      .finally(() => {
        if (mountedRef.current) setIsLoggingOut(false);
      });
    signOutFirebase();

    leaveToLogin();

    // Clear restaurant module authentication data
    clearModuleAuth('restaurant');
    localStorage.removeItem('restaurant_onboarding');
    localStorage.removeItem('restaurant_accessToken');
    localStorage.removeItem('restaurant_authenticated');
    localStorage.removeItem('restaurant_user');
    sessionStorage.removeItem('restaurantAuthData');

    // Dispatch auth change event to notify other components
    window.dispatchEvent(new Event('restaurantAuthChanged'));
  };

  const handleLogoutAllDevices = async () => {
    if (isLoggingOut) return; // Prevent multiple clicks

    setIsLoggingOut(true);
    setProfileOpen(false);

    try {
      // Call backend logout-all API
      try {
        await authAPI.logoutFromAllDevices('restaurant');
      } catch (apiError) {
        debugWarn('Logout API call failed, continuing with local cleanup:', apiError);
      }

      await signOutFirebase();

      // Clear auth for all modules (admin, restaurant, delivery, user)
      clearAuthData();

      // Clear any onboarding data from localStorage
      localStorage.removeItem('restaurant_onboarding');

      // Clear sessionStorage for all modules
      sessionStorage.removeItem('restaurantAuthData');
      sessionStorage.removeItem('adminAuthData');
      sessionStorage.removeItem('deliveryAuthData');
      sessionStorage.removeItem('userAuthData');

      // Dispatch auth change events to notify other components
      window.dispatchEvent(new Event('restaurantAuthChanged'));
      window.dispatchEvent(new Event('adminAuthChanged'));
      window.dispatchEvent(new Event('deliveryAuthChanged'));
      window.dispatchEvent(new Event('userAuthChanged'));

      leaveToLogin();
    } catch (error) {
      debugError('Error during logout from all devices:', error);
      clearAuthData();
      localStorage.removeItem('restaurant_onboarding');
      sessionStorage.removeItem('restaurantAuthData');
      sessionStorage.removeItem('adminAuthData');
      sessionStorage.removeItem('deliveryAuthData');
      sessionStorage.removeItem('userAuthData');
      window.dispatchEvent(new Event('restaurantAuthChanged'));
      leaveToLogin();
    } finally {
      if (mountedRef.current) setIsLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeleting || deleteCaptcha !== 'DELETE') return;
    setIsDeleting(true);
    try {
      await authAPI.deleteAccount('restaurant');
      showAccountDeletedToast();
      clearModuleAuth('restaurant');
      leaveToLogin();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete account');
    } finally {
      if (mountedRef.current) {
        setIsDeleting(false);
        setDeleteConfirmOpen(false);
      }
    }
  };

  const scheduleOffReasons = [
    'renovation or relocation of restaurant',
    'closed dur to festival',
    'permanently shut',
    'staff avaibility issues',
    'going out of station',
    'other',
  ];

  const handleScheduleOffClick = () => {
    // Check if there's an existing schedule
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const schedule = JSON.parse(saved);
        if (schedule.startDate) schedule.startDate = new Date(schedule.startDate);
        if (schedule.endDate) schedule.endDate = new Date(schedule.endDate);
        setExistingSchedule(schedule);
        setExistingScheduleOpen(true);
      } else {
        setScheduleOffOpen(true);
      }
    } catch (error) {
      debugError('Error checking schedule:', error);
      setScheduleOffOpen(true);
    }
  };

  const handleDeleteSchedule = () => {
    localStorage.removeItem(STORAGE_KEY);
    setExistingSchedule(null);
    setExistingScheduleOpen(false);
  };

  const handleReasonSelect = (reason) => {
    setSelectedReason(reason);
    setScheduleOffOpen(false);
    setDateTimePickerOpen(true);
  };

  const handleDateRangeChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
  };

  // web: one date-range calendar for both buttons; native: a date picker for the date that was tapped
  const openCalendar = (which) => {
    const current = (which === 'start' ? startDate : endDate) || startDate || new Date();
    const apply = (date) => {
      if (!date) return;
      if (which === 'start') handleDateRangeChange(date, endDate && endDate < date ? null : endDate);
      else handleDateRangeChange(startDate && date < startDate ? date : startDate, startDate && date < startDate ? startDate : date);
    };
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: 'date', onValueChange: (_e, date) => apply(date) });
      return;
    }
    setIosCalendarValue(current);
    setIosCalendar(which);
  };

  const handleStartTimeConfirm = (hour, minute, period) => {
    setStartTime({ hour, minute, period });
  };

  const handleEndTimeConfirm = (hour, minute, period) => {
    setEndTime({ hour, minute, period });
  };

  const formatTime = (time) => `${time.hour}:${time.minute} ${time.period.toUpperCase()}`;

  const formatDate = (date) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleSubmitScheduleOff = () => {
    if (!startDate || !endDate) {
      Alert.alert('', 'Please select start and end dates');
      return;
    }
    setDateTimePickerOpen(false);
    setSuccessPopupOpen(true);
  };

  // Section data
  // A My Store partner has no dining, takeaway or menu categories of its own.
  const isStorePartner = isMyStorePartner();
  const manageOutletItems = [
    { id: 1, label: 'Outlet info', icon: Info, route: '/food/restaurant/outlet-info' },
    { id: 2, label: 'Outlet timings', icon: Clock, route: '/food/restaurant/outlet-timings' },
    { id: 3, label: 'Dining Reservations', icon: Calendar, route: '/food/restaurant/reservations' },
    { id: 4, label: 'Menu categories', icon: Settings, route: '/food/restaurant/menu-categories' },
    { id: 6, label: 'Takeaway', icon: ShoppingBag },
  ].filter((item) => !(isStorePartner && [3, 4, 6].includes(item.id)));

  const settingsItems = [
    { id: 3, label: 'Delivery settings', icon: Truck, route: '/food/restaurant/delivery-settings' },
    { id: 4, label: 'Zone Setup', icon: MapPin, route: '/food/restaurant/zone-setup' },
  ];

  const ordersItems = [
    { id: 1, label: 'Order history', icon: FileText, route: '/food/restaurant/orders/all' },
    { id: 2, label: 'Complaints', icon: Star, route: '/food/restaurant/feedback?tab=complaints' },
    { id: 3, label: 'Reviews', icon: MessageSquare, route: '/food/restaurant/feedback' },
  ];

  const helpItems = [
    { id: 1, label: 'Support', icon: LifeBuoy, route: '/food/restaurant/help-centre/support' },
    { id: 2, label: 'Share your feedback', icon: Edit, route: '/food/restaurant/Share-Feedback' },
  ];

  const accountingItems = [
    { id: 1, label: 'Payout', icon: IndianRupee, route: '/food/restaurant/hub-finance' },
    { id: 2, label: 'Invoices', icon: Receipt, route: '/food/restaurant/hub-finance?tab=invoices' },
    { id: 3, label: 'Bank details', icon: Building2, route: '/food/restaurant/update-bank-details' },
  ];

  // All sections with their items
  const allSections = [
    { title: 'Manage outlet', items: manageOutletItems, key: 'manage-outlet' },
    { title: 'Settings', items: settingsItems, key: 'settings' },
    { title: 'Orders', items: ordersItems, key: 'orders' },
    { title: 'Help', items: helpItems, key: 'help' },
    { title: 'Finance', items: accountingItems, key: 'accounting' },
  ];

  // Filter logic
  const getFilteredSections = () => {
    if (!searchQuery.trim()) {
      return allSections;
    }
    const query = searchQuery.toLowerCase();
    return allSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.label.toLowerCase().includes(query)),
      }))
      .filter((section) => section.items.length > 0);
  };

  const filteredSections = getFilteredSections();

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  // grid grid-cols-3 gap-4 inside px-4
  const cellWidth = Math.floor((winW - sp(4) * 2 - sp(4) * 2) / 3);

  const renderSection = (title, items, delay = 0) => (
    <FadeIn delay={delay * 1000} duration={300} style={{ marginBottom: sp(8) }}>
      <FadeIn delay={(delay + 0.05) * 1000} duration={200} y={0}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </FadeIn>
      <View style={styles.grid}>
        {items.map((item, index) => {
          const IconComponent = item.icon;
          return (
            <FadeIn key={item.id} delay={(delay + 0.1 + index * 0.02) * 1000} duration={250} y={4} style={[styles.cell, { width: cellWidth }]}>
              <Pressable
                onPress={() => {
                  if (item.id === 5) {
                    // Schedule off card
                    handleScheduleOffClick();
                  } else if (item.id === 6) {
                    // Takeaway toggle
                    setTempTakeawayEnabled(restaurantData?.isTakeawayEnabled || false);
                    setTakeawayModalOpen(true);
                  } else if (item.route) {
                    navigate(item.route, { state: { from: location.pathname } });
                  }
                }}
                style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <View style={styles.tileIcon}>
                  <IconComponent size={32} color={colors.gray[900]} strokeWidth={1.5} />
                  {item.badge ? (
                    <View style={styles.tileBadge}>
                      <GradientFill />
                      <Text style={styles.tileBadgeText}>{item.badge}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
              <Text style={styles.tileLabel}>{item.label}</Text>
            </FadeIn>
          );
        })}
      </View>
    </FadeIn>
  );

  const profileImageUrl =
    userData.profileImage?.url || (typeof userData.profileImage === 'string' ? userData.profileImage : null);
  const sheetMaxH = winH * 0.9;
  const deleteDisabled = isDeleting || deleteCaptcha !== 'DELETE';

  return (
    <View style={styles.root} collapsable={false}>
      {/* shown (not "active"): the icons switch in the same frame as the tab, not after the route change */}
      {tabShown ? <StatusBar style="dark" /> : null}

      {/* Header */}
      <FadeIn duration={250} y={-8} style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => navigate('/food/restaurant')}
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
            >
              <ArrowLeft size={24} color={colors.gray[900]} />
            </Pressable>
            <Text style={styles.headerTitle}>Explore more</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => setSearchOpen(true)}
              accessibilityLabel="Search"
              style={({ pressed }) => [styles.searchBtn, pressed && { backgroundColor: colors.gray[100] }]}
            >
              <Search size={20} color={colors.gray[900]} />
            </Pressable>
            <Pressable
              onPress={() => setProfileOpen(true)}
              accessibilityLabel="Profile"
              style={({ pressed }) => [
                styles.profileBtn,
                profileOpen ? shadow.lg : { backgroundColor: pressed ? colors.gray[200] : colors.gray[100] },
              ]}
            >
              {profileOpen ? <GradientFill style={{ borderRadius: 9999 }} /> : null}
              <UserRound size={20} color={profileOpen ? colors.white : colors.gray[900]} />
            </Pressable>
          </View>
        </View>
      </FadeIn>

      {/* Main Content */}
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: sp(6) + Math.max(96, navSpace) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND]} tintColor={BRAND} />}
      >
        {/* Restaurant Information Card */}
        <FadeIn delay={50} duration={300}>
          <View style={styles.restCard}>
            <View style={styles.restRow}>
              <View style={styles.storeIcon}>
                <Store size={20} color={colors.gray[900]} />
              </View>
              <View style={styles.restText}>
                <Text style={styles.restName} numberOfLines={1}>
                  {restaurantDisplayName}
                </Text>
                {restaurantDisplayAddress ? (
                  <View style={styles.restAddrRow}>
                    <MapPin size={12} color={BRAND} style={{ marginTop: 2 }} />
                    <Text style={styles.restAddr}>{restaurantDisplayAddress}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </FadeIn>

        {/* Sections */}
        {filteredSections.length > 0 ? (
          filteredSections.map((section, index) => (
            <View key={section.key}>
              {renderSection(section.title, section.items, 0.1 + index * 0.05)}
              {index < filteredSections.length - 1 ? (
                <FadeIn delay={(0.25 + index * 0.05) * 1000} duration={200} y={0}>
                  <View style={styles.divider} />
                </FadeIn>
              ) : null}
            </View>
          ))
        ) : (
          <FadeIn duration={300} style={styles.noResults}>
            <Search size={64} color={colors.gray[300]} />
            <Text style={styles.noResultsTitle}>No results found</Text>
            <Text style={styles.noResultsText}>Try searching with different keywords</Text>
          </FadeIn>
        )}
        <FadeIn delay={450} duration={200} y={0}>
          <View style={styles.divider} />
        </FadeIn>

        <FadeIn delay={500} duration={250}>
          <Pressable
            onPress={() => setLogoutConfirmOpen(true)}
            style={({ pressed }) => [styles.logoutCard, pressed && { backgroundColor: colors.red[50], transform: [{ scale: 0.99 }] }]}
          >
            <View style={styles.cardLeft}>
              <View style={styles.logoutIcon}>
                <LogOut size={20} color={RED} style={{ marginLeft: 2 }} />
              </View>
              <View style={styles.shrink}>
                <Text style={styles.logoutTitle}>Logout</Text>
                <Text style={styles.cardSub}>Tap to logout from this device</Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.gray[300]} />
          </Pressable>
        </FadeIn>

        <FadeIn delay={550} duration={250}>
          <Pressable
            onPress={handleDeleteAccountClick}
            disabled={isCheckingBalance}
            style={({ pressed }) => [styles.deleteCard, pressed && { transform: [{ scale: 0.99 }] }]}
          >
            <View style={[styles.cardLeft, { gap: sp(3) }]}>
              <View style={styles.deleteIcon}>{isCheckingBalance ? <RingSpinner size={20} color={RED} /> : <Trash2 size={20} color={RED} />}</View>
              <View style={styles.shrink}>
                <Text style={styles.deleteTitle}>Delete Account</Text>
                <Text style={styles.cardSub}>Tap to delete your account</Text>
              </View>
            </View>
            <ChevronRight size={20} color={alpha(RED, 0.3)} />
          </Pressable>
        </FadeIn>
      </ScrollView>

      {/* Logout Popup */}
      <Dialog
        open={logoutConfirmOpen}
        onClose={() => {
          if (!isLoggingOut) setLogoutConfirmOpen(false);
        }}
        animateOut={!leaving}
        style={styles.logoutPopup}
      >
        <View style={styles.logoutPopupBody}>
          <View style={{ marginBottom: sp(3) }}>
            {profileImageUrl ? (
              <AppImage src={profileImageUrl} style={styles.bigAvatar} contentFit="cover" accessibilityLabel="Profile" />
            ) : (
              <View style={[styles.bigAvatar, styles.avatarEmpty]}>
                <User size={40} color={colors.gray[400]} />
              </View>
            )}
          </View>

          <Text style={styles.popupName}>{userData.name || 'Restaurant'}</Text>
          {userData.phone ? <Text style={[styles.popupPhone, { marginBottom: 2 }]}>{userData.phone}</Text> : null}
          {userData.email && userData.email !== 'N/A' ? <Text style={[styles.popupEmail, { marginBottom: sp(6) }]}>{userData.email}</Text> : null}

          <View style={styles.popupButtons}>
            <Pressable
              onPress={handleLogout}
              disabled={isLoggingOut}
              style={({ pressed }) => [styles.redBtn, isLoggingOut && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <Text style={styles.redBtnText}>{isLoggingOut ? 'Logging out...' : 'Logout'}</Text>
            </Pressable>
            <Pressable
              onPress={handleLogoutAllDevices}
              disabled={isLoggingOut}
              style={({ pressed }) => [styles.redOutlineBtn, isLoggingOut && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <Text style={styles.redOutlineText}>{isLoggingOut ? 'Logging out...' : 'Logout from all devices'}</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => setLogoutConfirmOpen(false)} disabled={isLoggingOut} style={[styles.cancelLink, isLoggingOut && { opacity: 0.5 }]}>
            {({ pressed }) => <Text style={[styles.cancelLinkText, pressed && { color: colors.gray[700] }]}>Cancel</Text>}
          </Pressable>
        </View>
      </Dialog>

      {/* Search Popup */}
      <TopSheet open={searchOpen} onClose={closeSearch}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.searchHead}>
          <Pressable onPress={closeSearch} accessibilityLabel="Close search" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View style={styles.searchInputWrap}>
            <TextInput
              placeholder="Search features..."
              placeholderTextColor={colors.gray[500]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={[styles.searchInput, searchFocused && styles.searchInputFocused]}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} accessibilityLabel="Clear search" style={({ pressed }) => [styles.clearBtn, pressed && { backgroundColor: colors.gray[200] }]}>
                <X size={16} color={colors.gray[600]} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Search Results */}
        <KeyboardAwareScrollView style={{ maxHeight: winH * 0.7 }} contentContainerStyle={{ paddingBottom: insets.bottom }}>
          {searchQuery.trim() ? (
            filteredSections.length > 0 ? (
              <View style={{ paddingHorizontal: sp(4), paddingVertical: sp(4) }}>
                {filteredSections.map((section, sIndex) => (
                  <View key={section.key} style={sIndex < filteredSections.length - 1 ? { marginBottom: sp(6) } : null}>
                    <Text style={styles.resultsTitle}>{section.title}</Text>
                    <View style={{ gap: sp(2) }}>
                      {section.items.map((item) => {
                        const IconComponent = item.icon;
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              if (item.id === 5) {
                                handleScheduleOffClick();
                              } else if (item.route) {
                                navigate(item.route, { state: { from: location.pathname } });
                              }
                              closeSearch();
                            }}
                            style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.gray[50] }]}
                          >
                            <View style={styles.storeIcon}>
                              <IconComponent size={20} color={colors.gray[900]} />
                            </View>
                            <Text style={styles.resultLabel}>{item.label}</Text>
                            {item.badge ? (
                              <View style={styles.resultBadge}>
                                <GradientFill />
                                <Text style={styles.resultBadgeText}>{item.badge}</Text>
                              </View>
                            ) : null}
                            <ChevronRight size={20} color={colors.gray[400]} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.searchEmpty}>
                <Search size={64} color={colors.gray[300]} />
                <Text style={styles.noResultsTitle}>No results found</Text>
                <Text style={styles.noResultsText}>Try searching with different keywords</Text>
              </View>
            )
          ) : (
            <View style={styles.searchEmpty}>
              <Search size={64} color={colors.gray[300]} />
              <Text style={styles.searchHintTitle}>Search for features</Text>
              <Text style={styles.noResultsText}>Type to search for outlet settings, orders, and more</Text>
            </View>
          )}
        </KeyboardAwareScrollView>
      </TopSheet>

      {/* Profile Popup */}
      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} animateOut={!leaving} backdropOpacity={0.5} style={styles.profilePopup}>
        <View style={styles.profileHead}>
          <Text style={styles.sheetTitle}>My profile</Text>
          <Pressable onPress={() => setProfileOpen(false)} accessibilityLabel="Close" style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <X size={20} color={colors.gray[900]} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: sp(6), paddingVertical: sp(6) }}>
          <View style={styles.profileRow}>
            <View style={styles.profileLeft}>
              <View style={styles.avatar}>
                {userData.profileImage?.url ? (
                  <AppImage src={userData.profileImage.url} style={styles.avatarImg} contentFit="cover" accessibilityLabel={userData.name} />
                ) : (
                  <User size={32} color={colors.gray[400]} />
                )}
              </View>
              <View style={styles.flexShrink}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {loadingRestaurant ? 'Loading...' : userData.name || 'Restaurant'}
                </Text>
                {userData.phone ? <Text style={[styles.popupPhone, { marginBottom: 2 }]}>{userData.phone}</Text> : null}
                {userData.email && userData.email !== 'N/A' ? (
                  <Text style={styles.popupEmail} numberOfLines={1}>
                    {userData.email}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* Edit Button */}
            <Pressable
              onPress={() => {
                setProfileOpen(false);
                navigate('/food/restaurant/edit-owner');
              }}
              accessibilityLabel="Edit Profile"
              style={({ pressed }) => [styles.editBtn, pressed && { backgroundColor: colors.gray[100] }]}
            >
              {({ pressed }) => <Edit size={16} color={pressed ? colors.gray[900] : colors.gray[600]} />}
            </Pressable>
          </View>
        </View>

        {/* Logout Buttons */}
        <View style={{ paddingHorizontal: sp(6), paddingBottom: sp(6), alignItems: 'center' }}>
          <View style={styles.popupButtons}>
            <Pressable
              onPress={handleLogout}
              disabled={isLoggingOut}
              style={({ pressed }) => [styles.redBtn, pressed && { backgroundColor: '#B91C1C', transform: [{ scale: 0.98 }] }, isLoggingOut && { opacity: 0.5 }]}
            >
              <Text style={styles.redBtnText}>{isLoggingOut ? 'Logging out...' : 'Logout'}</Text>
            </Pressable>
            <Pressable
              onPress={handleLogoutAllDevices}
              disabled={isLoggingOut}
              style={({ pressed }) => [styles.redOutlineBtn, pressed && { backgroundColor: colors.red[50], transform: [{ scale: 0.98 }] }, isLoggingOut && { opacity: 0.5 }]}
            >
              <Text style={styles.redOutlineText}>{isLoggingOut ? 'Logging out...' : 'Logout from all devices'}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setProfileOpen(false)} disabled={isLoggingOut} style={[styles.cancelLink, isLoggingOut && { opacity: 0.5 }]}>
            {({ pressed }) => <Text style={[styles.cancelLinkText, pressed && { color: colors.gray[700] }]}>Cancel</Text>}
          </Pressable>
        </View>
      </Dialog>

      {/* Schedule Off Reason Selection Popup */}
      <Sheet open={scheduleOffOpen} onClose={() => setScheduleOffOpen(false)} style={styles.sheet}>
        <SheetHeader title="Select reason" onClose={() => setScheduleOffOpen(false)} />
        <ScrollView style={{ maxHeight: sheetMaxH - 64 }} contentContainerStyle={{ paddingHorizontal: sp(6), paddingVertical: sp(4) }}>
          {scheduleOffReasons.map((reason, index) => (
            <Pressable
              key={reason}
              onPress={() => handleReasonSelect(reason)}
              style={({ pressed }) => [
                styles.reasonRow,
                index < scheduleOffReasons.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
                pressed && { backgroundColor: colors.gray[50] },
              ]}
            >
              <Text style={styles.reasonText}>{reason}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>

      {/* Date and Time Picker Popup */}
      <Sheet open={dateTimePickerOpen} onClose={() => setDateTimePickerOpen(false)} style={styles.sheet}>
        <SheetHeader title="Schedule off" onClose={() => setDateTimePickerOpen(false)} />
        <ScrollView style={{ maxHeight: sheetMaxH - 64 }} contentContainerStyle={{ paddingHorizontal: sp(6), paddingVertical: sp(6), gap: sp(6) }}>
          {/* Selected Reason */}
          {selectedReason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.detailLabel}>Reason</Text>
              <Text style={styles.detailValue}>{selectedReason}</Text>
            </View>
          ) : null}

          {/* Date Selection */}
          <View>
            <Text style={styles.pickGroupTitle}>Select dates</Text>
            <View style={{ gap: sp(3) }}>
              <View>
                <Text style={styles.pickLabel}>Start date</Text>
                <Pressable onPress={() => openCalendar('start')} style={({ pressed }) => [styles.pickField, pressed && { backgroundColor: colors.gray[100] }]}>
                  <Text style={styles.pickValue}>{formatDate(startDate)}</Text>
                  <Calendar size={20} color={colors.gray[500]} />
                </Pressable>
              </View>
              <View>
                <Text style={styles.pickLabel}>End date</Text>
                <Pressable onPress={() => openCalendar('end')} style={({ pressed }) => [styles.pickField, pressed && { backgroundColor: colors.gray[100] }]}>
                  <Text style={styles.pickValue}>{formatDate(endDate)}</Text>
                  <Calendar size={20} color={colors.gray[500]} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Time Selection */}
          <View>
            <Text style={styles.pickGroupTitle}>Select times</Text>
            <View style={{ gap: sp(3) }}>
              <View>
                <Text style={styles.pickLabel}>Start time</Text>
                <Pressable onPress={() => setShowStartTimePicker(true)} style={({ pressed }) => [styles.pickField, pressed && { backgroundColor: colors.gray[100] }]}>
                  <Text style={styles.pickValue}>{formatTime(startTime)}</Text>
                  <Clock size={20} color={colors.gray[500]} />
                </Pressable>
              </View>
              <View>
                <Text style={styles.pickLabel}>End time</Text>
                <Pressable onPress={() => setShowEndTimePicker(true)} style={({ pressed }) => [styles.pickField, pressed && { backgroundColor: colors.gray[100] }]}>
                  <Text style={styles.pickValue}>{formatTime(endTime)}</Text>
                  <Clock size={20} color={colors.gray[500]} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Submit Button */}
          <Pressable onPress={handleSubmitScheduleOff} style={({ pressed }) => [styles.gradBtnXl, { marginTop: sp(4) }, pressed && { transform: [{ scale: 0.98 }] }]}>
            <GradientFill />
            <Text style={styles.gradBtnText}>Submit</Text>
          </Pressable>
        </ScrollView>
      </Sheet>

      {/* Calendar (iOS: a date spinner in a sheet; Android opens its own date dialog) */}
      {Platform.OS !== 'android' ? (
        <Sheet open={Boolean(iosCalendar)} onClose={() => setIosCalendar(null)}>
          <View style={styles.iosSheet}>
            <DateTimePicker
              value={iosCalendarValue}
              mode="date"
              display="spinner"
              onValueChange={(_e, date) => {
                if (date) setIosCalendarValue(date);
              }}
            />
            <Pressable
              onPress={() => {
                const which = iosCalendar;
                const date = iosCalendarValue;
                setIosCalendar(null);
                if (which === 'start') handleDateRangeChange(date, endDate && endDate < date ? null : endDate);
                else handleDateRangeChange(startDate && date < startDate ? date : startDate, startDate && date < startDate ? startDate : date);
              }}
              style={styles.iosOk}
            >
              <Text style={styles.iosOkText}>OK</Text>
            </Pressable>
          </View>
        </Sheet>
      ) : null}

      {/* Start Time Picker */}
      <TimePickerWheel
        isOpen={showStartTimePicker}
        onClose={() => setShowStartTimePicker(false)}
        initialHour={startTime.hour}
        initialMinute={startTime.minute}
        initialPeriod={startTime.period}
        onConfirm={handleStartTimeConfirm}
        okBold
      />

      {/* End Time Picker */}
      <TimePickerWheel
        isOpen={showEndTimePicker}
        onClose={() => setShowEndTimePicker(false)}
        initialHour={endTime.hour}
        initialMinute={endTime.minute}
        initialPeriod={endTime.period}
        onConfirm={handleEndTimeConfirm}
        okBold
      />

      {/* Success Popup */}
      <Dialog open={successPopupOpen} onClose={() => setSuccessPopupOpen(false)} style={styles.successPopup}>
        <View style={{ alignItems: 'center', marginBottom: sp(4) }}>
          <View style={styles.successIcon}>
            <CheckCircle size={40} color={colors.green[600]} />
          </View>
        </View>
        <Text style={styles.successTitle}>Success!</Text>
        <Text style={styles.successText}>Restaurant is marked offline</Text>
        <Pressable
          onPress={() => {
            setSuccessPopupOpen(false);
            // Reset states
            setSelectedReason(null);
            setStartDate(null);
            setEndDate(null);
            setStartTime({ hour: '9', minute: '00', period: 'am' });
            setEndTime({ hour: '5', minute: '00', period: 'pm' });
          }}
          style={({ pressed }) => [styles.gradBtnXl, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <GradientFill />
          <Text style={[styles.gradBtnText, { fontSize: 14, lineHeight: 20 }]}>Done </Text>
        </Pressable>
      </Dialog>

      {/* Existing Schedule Popup */}
      <Sheet open={existingScheduleOpen && Boolean(existingSchedule)} onClose={() => setExistingScheduleOpen(false)} style={styles.sheet}>
        <SheetHeader title="Schedule off" onClose={() => setExistingScheduleOpen(false)} />
        {existingSchedule ? (
          <ScrollView style={{ maxHeight: sheetMaxH - 64 }} contentContainerStyle={{ paddingHorizontal: sp(6), paddingVertical: sp(6) }}>
            {/* Status Message */}
            <View style={styles.statusBox}>
              <Text style={styles.statusTitle}>Restaurant is scheduled off</Text>
              <Text style={styles.statusText}>Your restaurant is currently marked as offline</Text>
            </View>

            {/* Schedule Details */}
            <View style={{ gap: sp(4), marginBottom: sp(6) }}>
              {existingSchedule.reason ? (
                <View>
                  <Text style={styles.detailLabel}>Reason</Text>
                  <Text style={styles.detailValue}>{existingSchedule.reason}</Text>
                </View>
              ) : null}

              <View style={styles.twoCols}>
                <View style={styles.flex}>
                  <Text style={styles.detailLabel}>Start date</Text>
                  <Text style={styles.detailValue}>{formatDate(existingSchedule.startDate)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.detailLabel}>End date</Text>
                  <Text style={styles.detailValue}>{formatDate(existingSchedule.endDate)}</Text>
                </View>
              </View>

              <View style={styles.twoCols}>
                <View style={styles.flex}>
                  <Text style={styles.detailLabel}>Start time</Text>
                  <Text style={styles.detailValue}>{existingSchedule.startTime ? formatTime(existingSchedule.startTime) : ''}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.detailLabel}>End time</Text>
                  <Text style={styles.detailValue}>{existingSchedule.endTime ? formatTime(existingSchedule.endTime) : ''}</Text>
                </View>
              </View>
            </View>

            {/* Delete Button */}
            <Pressable onPress={handleDeleteSchedule} style={({ pressed }) => [styles.gradBtnMd, pressed && { opacity: 0.9 }]}>
              <GradientFill />
              <Text style={[styles.gradBtnText, { fontWeight: '600' }]}>Delete Schedule</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </Sheet>

      {/* Takeaway Toggle Modal */}
      <Dialog open={takeawayModalOpen} onClose={() => setTakeawayModalOpen(false)} style={styles.takeawayPopup}>
        <View style={styles.takeawayHead}>
          <Text style={styles.takeawayTitle}>Takeaway</Text>
          <Pressable onPress={() => setTakeawayModalOpen(false)} style={({ pressed }) => [styles.iconBtnRound, pressed && { backgroundColor: colors.gray[100] }]}>
            <X size={20} color={colors.gray[400]} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => setTempTakeawayEnabled(!tempTakeawayEnabled)}
          style={[
            styles.takeawayRow,
            tempTakeawayEnabled
              ? { backgroundColor: alpha(colors.green[50], 0.5), borderColor: colors.green[100] }
              : { backgroundColor: colors.gray[50], borderColor: colors.gray[100] },
          ]}
        >
          <View style={styles.takeawayLeft}>
            <LinearGradient colors={[colors.blue[500], colors.blue[700]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.takeawayIcon}>
              <ShoppingBag size={20} color={colors.white} strokeWidth={2.5} />
            </LinearGradient>
            <Text style={styles.takeawayLabel}>Takeaway orders</Text>
          </View>
          <TakeawaySwitch on={tempTakeawayEnabled} />
        </Pressable>

        <Text style={styles.takeawayText}>
          When enabled, customers can place takeaway orders from your restaurant. You can turn this off anytime.
        </Text>

        <Pressable
          disabled={isTakeawayUpdating}
          onPress={async () => {
            if (isTakeawayUpdating) return;
            setIsTakeawayUpdating(true);
            try {
              await restaurantAPI.updateTakeawaySettings({ isEnabled: tempTakeawayEnabled });
              // Update local restaurant data state
              setRestaurantData((prev) => ({ ...prev, isTakeawayEnabled: tempTakeawayEnabled }));
              setTakeawayModalOpen(false);
              toast.success(`Takeaway ${tempTakeawayEnabled ? 'enabled' : 'disabled'} successfully`, {
                duration: 2000,
              });
            } catch (error) {
              debugError('Error updating takeaway status:', error);
              toast.error('Failed to update takeaway status', {
                duration: 2000,
              });
            } finally {
              setIsTakeawayUpdating(false);
            }
          }}
          style={({ pressed }) => [styles.takeawaySave, isTakeawayUpdating && { opacity: 0.7 }, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <GradientFill />
          {isTakeawayUpdating ? <RingSpinner size={20} color={colors.white} /> : null}
          <Text style={styles.gradBtnText}>{isTakeawayUpdating ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </Dialog>

      {/* Balance Warning Popup */}
      <Dialog open={showBalanceWarning} onClose={() => setShowBalanceWarning(false)} style={styles.balancePopup}>
        <View style={{ alignItems: 'center', marginBottom: sp(4) }}>
          <View style={styles.balanceIcon}>
            <AlertTriangle size={32} color={restaurantTheme.primary} />
          </View>
        </View>
        <Text style={styles.successTitle}>Wait! Balance Found</Text>

        <View style={styles.balanceBox}>
          <Text style={styles.balanceType}>{balanceData.type}</Text>
          <Text style={styles.balanceAmount}>₹{balanceData.balance.toLocaleString('en-IN')}</Text>
        </View>

        <Text style={styles.balanceText}>
          You still have unsettled payout available to withdraw. Continue deleting your account or go to Payout to withdraw first.
        </Text>

        <View style={{ gap: sp(3) }}>
          <Pressable
            onPress={() => {
              setShowBalanceWarning(false);
              setDeleteCaptcha('');
              setDeleteConfirmOpen(true);
            }}
            style={({ pressed }) => [styles.grayBtn, pressed && { backgroundColor: colors.gray[200] }]}
          >
            <Text style={styles.grayBtnText}>Continue Anyway</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowBalanceWarning(false);
              navigate('/food/restaurant/hub-finance');
            }}
            style={styles.gradBtnH12}
          >
            <GradientFill />
            <Text style={styles.gradBtnText}>Go to Payout</Text>
          </Pressable>
        </View>
      </Dialog>

      {/* Delete Account Popup (rises above the keyboard while "Type DELETE" is focused) */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => {}}
        dismissible={false}
        backdropOpacity={0.6}
        animateOut={!leaving}
        style={[styles.deletePopup, keyboardOffset ? { marginBottom: keyboardOffset } : null]}
      >
        <View style={{ alignItems: 'center', marginBottom: sp(4) }}>
          <View style={styles.deletePopupIcon}>
            <Trash2 size={32} color={BRAND} />
          </View>
        </View>

        <Text style={styles.successTitle}>Delete Your Account?</Text>
        <Text style={[styles.balanceText, { marginBottom: sp(5) }]}>Are you sure you want to delete your account?</Text>

        <View style={styles.warnBox}>
          <View style={styles.warnHead}>
            <AlertTriangle size={16} color={BRAND} />
            <Text style={styles.warnLabel}>Warning</Text>
          </View>
          <Text style={styles.warnText}>Your account will be Deleted. Admin will keep your historical records for revenue reporting.</Text>
        </View>

        <View style={{ marginBottom: sp(6) }}>
          <TextInput
            placeholder="Type DELETE to confirm"
            placeholderTextColor={colors.gray[400]}
            value={deleteCaptcha}
            onChangeText={(v) => setDeleteCaptcha(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            onFocus={() => setDeleteFocused(true)}
            onBlur={() => setDeleteFocused(false)}
            style={[
              styles.deleteInput,
              deleteCaptcha ? styles.deleteInputFilled : null,
              deleteFocused && { borderColor: BRAND },
            ]}
          />
        </View>

        <View style={styles.deleteButtons}>
          <Pressable
            onPress={() => setDeleteConfirmOpen(false)}
            disabled={isDeleting}
            style={({ pressed }) => [styles.noCancelBtn, isDeleting && { opacity: 0.5 }, pressed && { backgroundColor: colors.gray[50] }]}
          >
            <Text style={styles.noCancelText}>No, Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleteDisabled}
            style={({ pressed }) => [styles.deleteAccountBtn, deleteDisabled && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <GradientFill />
            <Text style={[styles.gradBtnText, { fontSize: 14, lineHeight: 20 }]}>{isDeleting ? 'Deleting...' : 'Delete Account'}</Text>
          </Pressable>
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  shrink: { flexShrink: 1, minWidth: 0 },
  flexShrink: { flex: 1, minWidth: 0 },
  // header
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 50 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  backBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  searchBtn: { padding: sp(2), borderRadius: 8 },
  profileBtn: { padding: sp(2), borderRadius: 9999, overflow: 'hidden' },
  // content
  content: { paddingHorizontal: sp(4), paddingTop: sp(6) },
  restCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], paddingVertical: sp(3), paddingHorizontal: sp(4), marginBottom: sp(6), borderRadius: 8 },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  storeIcon: { padding: sp(2), backgroundColor: colors.gray[100], borderRadius: 8 },
  restText: { flex: 1, minWidth: 0 },
  restName: { fontSize: 17, lineHeight: 19, fontWeight: '700', color: colors.gray[900], letterSpacing: -0.4 },
  restAddrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(1), marginTop: 6, opacity: 0.9 },
  restAddr: { flex: 1, fontSize: 12, lineHeight: 19.5, fontWeight: '600', color: colors.gray[600] },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900], marginBottom: sp(4) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(4) },
  cell: { alignItems: 'center' },
  tile: {
    width: '100%',
    minHeight: 110,
    padding: sp(6),
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  tileIcon: { alignItems: 'center', justifyContent: 'center' },
  tileBadge: { position: 'absolute', top: -4, right: -4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  tileBadgeText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: '600' },
  tileLabel: { fontSize: 14, lineHeight: 17.5, color: colors.gray[700], textAlign: 'center', fontWeight: '400', marginTop: sp(3) },
  divider: { borderTopWidth: 1, borderTopColor: colors.gray[200], marginVertical: sp(6) },
  noResults: { alignItems: 'center', paddingVertical: sp(12) },
  noResultsTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.gray[900], marginTop: sp(4), marginBottom: sp(2) },
  noResultsText: { fontSize: 14, lineHeight: 20, color: colors.gray[500], textAlign: 'center' },
  // logout / delete cards
  logoutCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(3),
    borderRadius: 19.2,
    borderWidth: 1,
    borderColor: colors.red[100],
    backgroundColor: colors.white,
    paddingHorizontal: sp(4),
    paddingVertical: sp(4),
    marginBottom: sp(4),
    elevation: 2,
    shadowColor: '#DC2626',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: sp(4), flexShrink: 1, minWidth: 0 },
  logoutIcon: { height: 51.2, width: 51.2, borderRadius: 25.6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red[50] },
  logoutTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: RED, marginBottom: 2 },
  cardSub: { fontSize: 13, lineHeight: 18, color: colors.gray[500], fontWeight: '500' },
  deleteCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(3),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[100],
    backgroundColor: colors.white,
    paddingHorizontal: sp(4),
    paddingVertical: sp(5),
    ...shadow.sm,
  },
  deleteIcon: { height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1F2' },
  deleteTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: RED },
  // logout popup
  logoutPopup: { maxWidth: 340, borderRadius: 28.8, backgroundColor: colors.white, ...shadow['2xl'] },
  logoutPopupBody: { padding: sp(7), alignItems: 'center' },
  bigAvatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: colors.gray[50] },
  avatarEmpty: { backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  popupName: { fontSize: 19, lineHeight: 24, fontWeight: '900', color: '#1F2937', marginBottom: sp(1), textAlign: 'center' },
  popupPhone: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: colors.gray[500] },
  popupEmail: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: colors.gray[400] },
  popupButtons: { width: '100%', gap: sp(3) },
  redBtn: { width: '100%', borderRadius: 14, backgroundColor: '#DC2626', paddingVertical: 14, alignItems: 'center' },
  redBtnText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.white },
  redOutlineBtn: { width: '100%', borderRadius: 14, borderWidth: 1.5, borderColor: '#DC2626', backgroundColor: colors.white, paddingVertical: 14, alignItems: 'center' },
  redOutlineText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#DC2626' },
  cancelLink: { marginTop: sp(5) },
  cancelLinkText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#6B7280' },
  // search
  searchPanel: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.white, ...shadow.lg },
  searchHead: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  searchInputWrap: { flex: 1, justifyContent: 'center' },
  searchInput: {
    width: '100%',
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    paddingRight: sp(10),
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    fontSize: 16,
    lineHeight: 22,
    color: colors.gray[900],
  },
  searchInputFocused: { borderColor: BRAND },
  clearBtn: { position: 'absolute', right: sp(2), padding: sp(1), borderRadius: 9999 },
  resultsTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[500], marginBottom: sp(3), textTransform: 'uppercase', letterSpacing: 0.35 },
  resultRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: 8 },
  resultLabel: { flex: 1, fontSize: 16, lineHeight: 24, color: colors.gray[900] },
  resultBadge: { paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: 4, overflow: 'hidden' },
  resultBadgeText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  searchEmpty: { alignItems: 'center', paddingVertical: sp(12), paddingHorizontal: sp(4) },
  searchHintTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.gray[900], marginTop: sp(4), marginBottom: sp(1) },
  // profile popup
  profilePopup: { width: '92%', maxWidth: 384, borderRadius: 40, backgroundColor: colors.white, ...shadow['2xl'], shadowOpacity: 0.4 },
  profileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(6), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  iconBtn: { padding: 6, borderRadius: 8 },
  iconBtnRound: { padding: 6, borderRadius: 9999 },
  profileRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp(4), minWidth: 0 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.gray[50],
  },
  avatarImg: { width: '100%', height: '100%' },
  profileName: { fontSize: 17, lineHeight: 22, fontWeight: '900', color: '#1F2937', marginBottom: sp(1) },
  editBtn: { padding: sp(2), marginLeft: sp(2), backgroundColor: colors.gray[50], borderRadius: 9999 },
  // sheets
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: colors.white, ...shadow['2xl'] },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp(6),
    paddingVertical: sp(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  reasonRow: { width: '100%', paddingVertical: sp(4), paddingHorizontal: sp(4), borderRadius: 8 },
  reasonText: { fontSize: 16, lineHeight: 24, color: colors.gray[900] },
  reasonBox: { paddingBottom: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  detailLabel: { fontSize: 14, lineHeight: 20, color: colors.gray[500], marginBottom: sp(1) },
  detailValue: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.gray[900] },
  pickGroupTitle: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[700], marginBottom: sp(3) },
  pickLabel: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginBottom: sp(1) },
  pickField: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    backgroundColor: colors.gray[50],
  },
  pickValue: { fontSize: 16, lineHeight: 24, color: colors.gray[900] },
  gradBtnXl: { width: '100%', paddingVertical: 14, paddingHorizontal: sp(4), borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...shadow.md },
  gradBtnMd: { width: '100%', paddingVertical: sp(3), paddingHorizontal: sp(4), borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  gradBtnH12: { width: '100%', height: 48, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  gradBtnText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  iosSheet: { paddingTop: sp(4), paddingBottom: sp(4), alignItems: 'center' },
  iosOk: { marginTop: sp(2), paddingHorizontal: sp(6), paddingVertical: sp(3) },
  iosOkText: { color: BRAND, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  // success / existing schedule
  successPopup: { maxWidth: 384, borderRadius: 16, backgroundColor: colors.white, padding: sp(6), ...shadow['2xl'] },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.green[100], alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900], marginBottom: sp(2), textAlign: 'center' },
  successText: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginBottom: sp(6), textAlign: 'center' },
  statusBox: { marginBottom: sp(6), padding: sp(4), backgroundColor: colors.blue[50], borderRadius: 8, borderWidth: 1, borderColor: colors.blue[200] },
  statusTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900], marginBottom: sp(1) },
  statusText: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  twoCols: { flexDirection: 'row', gap: sp(4) },
  // takeaway
  takeawayPopup: { width: '90%', maxWidth: 384, borderRadius: 24, backgroundColor: colors.white, padding: sp(6), ...shadow['2xl'] },
  takeawayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(8) },
  takeawayTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  takeawayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: sp(4), borderRadius: 16, borderWidth: 1, marginBottom: sp(6) },
  takeawayLeft: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flexShrink: 1 },
  takeawayIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadow.sm, shadowColor: colors.blue[200] },
  takeawayLabel: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  twTrack: { width: 56, height: 32, borderRadius: 16 },
  twThumb: { position: 'absolute', top: 4, left: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white, ...shadow.md },
  takeawayText: { fontSize: 14, lineHeight: 20, color: colors.gray[500], paddingHorizontal: sp(1), marginBottom: sp(6) },
  takeawaySave: { width: '100%', paddingVertical: sp(4), borderRadius: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2) },
  // balance warning
  balancePopup: { maxWidth: 384, borderRadius: 24, backgroundColor: colors.white, padding: sp(6), borderWidth: 1, borderColor: restaurantTheme.primaryBorder, ...shadow['2xl'] },
  balanceIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.orange[100], alignItems: 'center', justifyContent: 'center' },
  balanceBox: { backgroundColor: colors.gray[50], borderRadius: 16, padding: sp(4), marginBottom: sp(5), alignItems: 'center' },
  balanceType: { fontSize: 10, lineHeight: 14, color: colors.gray[500], textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1, marginBottom: sp(1), textAlign: 'center' },
  balanceAmount: { fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.black },
  balanceText: { fontSize: 14, lineHeight: 22.75, color: colors.gray[500], marginBottom: sp(6), textAlign: 'center' },
  grayBtn: { width: '100%', height: 48, borderRadius: 14, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  grayBtnText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[700] },
  // delete account
  deletePopup: { maxWidth: 384, borderRadius: 24, backgroundColor: colors.white, padding: sp(6), borderWidth: 1, borderColor: colors.red[100], ...shadow['2xl'] },
  deletePopupIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.red[100], alignItems: 'center', justifyContent: 'center' },
  warnBox: { marginBottom: sp(5), backgroundColor: colors.red[50], borderLeftWidth: 4, borderLeftColor: colors.red[500], borderTopRightRadius: 14, borderBottomRightRadius: 14, padding: sp(3) },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginBottom: sp(1) },
  warnLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.red[700], textTransform: 'uppercase', letterSpacing: 0.6 },
  warnText: { fontSize: 11, lineHeight: 14, color: colors.red[800], fontWeight: '500' },
  deleteInput: {
    width: '100%',
    height: 48,
    paddingHorizontal: sp(4),
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gray[100],
    fontWeight: '500',
    fontSize: 16,
    textAlign: 'center',
    color: colors.gray[900],
    backgroundColor: colors.white,
  },
  deleteInputFilled: { fontWeight: '700', letterSpacing: 1.6 },
  deleteButtons: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  noCancelBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 2, borderColor: colors.gray[200], alignItems: 'center', justifyContent: 'center' },
  noCancelText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[800] },
  deleteAccountBtn: { flex: 1, height: 48, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
