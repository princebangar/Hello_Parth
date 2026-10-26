// Web: pages/restaurant/DiningReservations.jsx (/reservations) — "Table Reservations": header (back, guest search,
// Queue / Media switch), the three stat cards, the phone Reservations / Photos & Menu switch, the dining controls
// (on / off switch, dining categories, cuisines, price for two, facilities, guest limit, "Save settings" -> admin
// approval request, pending notice + 15 s poll while a request is pending, approved / rejected toast), the restaurant /
// menu photo manager (upload several, choose the main one, remove), and the reservation queue (Priority / New /
// Today, Accept / Decline / Check-in / Check-out). Same API calls (GET current restaurant, GET bookings by restaurant,
// GET dining categories, GET pending dining request, POST dining update request, PATCH booking status, POST cover /
// menu images, PATCH profile cover / menu images), texts, states and toasts.
// Native:
// - The phone layout is the web's md:hidden branch (booking cards; the desktop table is not drawn).
// - <input type="file" multiple accept="image/*"> -> the gallery with several photos (expo-image-picker
//   allowsMultipleSelection; @/lib/media pickImage returns one photo only), sent as { uri, name, type } files to the
//   same upload calls.
// - The page scrolls in a KeyboardAwareScrollView (the "Average price for two" field stays above the keyboard); the
//   header with the guest search is fixed at the top (web: sticky).
// - The web uses <UtensilsCrossed> (category without an image) without importing it, which throws on the web as soon
//   as such a category is drawn; here the icon is imported so the intended placeholder shows.
// - Grids (stats, categories, photo thumbnails) are measured rows with the web's columns / gaps.
// - framer-motion entrance animations -> a short fade / slide.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Clock4,
  ImagePlus,
  MessageSquare,
  Phone,
  Search,
  Sparkles,
  UploadCloud,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { AppImage, KeyboardAwareScrollView, Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { alpha, brand, colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { diningAPI, restaurantAPI } from '@food/api';
import Loader from '@food/components/Loader';
import { DINING_CUISINES, DINING_FACILITIES } from '@food/constants/dining';

const debugError = () => {};

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark];
const PRIMARY = brand.primary; // shadcn --primary (text-primary / bg-primary / border-primary)

function BrandFill({ r = 0 }) {
  return <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />;
}

const getRestaurantFromResponse = (response) => response?.data?.data?.restaurant || response?.data?.restaurant || response?.data?.data || null;

const normalizeImageEntry = (entry) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const url = entry.trim();
    return url ? { url, publicId: null } : null;
  }
  const url = String(entry?.url || '').trim();
  if (!url) return null;
  return { url, publicId: entry?.publicId || null };
};

const getProfilePhotoUrl = (restaurant) => {
  const candidate = restaurant?.profileImage;
  if (!candidate) return '';
  if (typeof candidate === 'string') return candidate.trim();
  return String(candidate?.url || '').trim();
};

const getCoverImages = (restaurant) => {
  const base = Array.isArray(restaurant?.coverImages) ? restaurant.coverImages : [];
  return base.map(normalizeImageEntry).filter(Boolean);
};

const getMenuImages = (restaurant) => {
  const base = Array.isArray(restaurant?.menuImages) ? restaurant.menuImages : [];
  return base.map(normalizeImageEntry).filter(Boolean);
};

const getBookerName = (booking) => String(booking?.user?.name || booking?.customerName || booking?.bookedBy?.name || booking?.name || 'Guest').trim();

const getBookerPhone = (booking) =>
  String(booking?.user?.phone || booking?.phone || booking?.phoneNumber || booking?.mobile || booking?.bookedBy?.phone || '').trim();

// <input type="file" accept="image/*" multiple> -> gallery with several photos ([] when cancelled)
async function pickImageFiles(prefix) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    const err = new Error('Photo permission denied');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true });
  if (res.canceled || !Array.isArray(res.assets)) return [];
  return res.assets.map((a, i) => {
    const type = a.mimeType || 'image/jpeg';
    const ext = type.split('/')[1] || 'jpg';
    return { uri: a.uri, name: a.fileName || `${prefix}-${Date.now()}-${i}.${ext}`, type };
  });
}

/** CSS grid (grid-cols-N gap-X) for the phone width: measures the row and sizes the cells. */
function Grid({ cols, gap, children, style }) {
  const [w, setW] = useState(0);
  const items = React.Children.toArray(children);
  const cell = w > 0 ? (w - gap * (cols - 1)) / cols : 0;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? items.map((child, i) => <View key={child.key ?? i} style={{ width: cell }}>{child}</View>) : null}
    </View>
  );
}

// web: framer-motion entrance fade. App: shown at once (Prince, 27 Oct: the fade read as a blink on every open)
function FadeIn({ children, style }) {
  return <View style={style}>{children}</View>;
}

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
  return <Animated.View style={[styles.liveDot, { opacity: v }]} />;
}

function DiningSwitch({ on, disabled, onPress }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: on ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [on, v]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      style={[styles.switchTrack, { backgroundColor: on ? colors.emerald[600] : colors.slate[300] }]}
    >
      <Animated.View style={[styles.switchKnob, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [4, 24] }) }] }]} />
    </Pressable>
  );
}

// web: the Badge classes per status (bg / text / border), restaurant theme applied
const statusBadgeColors = (status) => {
  const key = String(status || '').toLowerCase();
  if (key === 'pending') return { bg: restaurantTheme.primarySoft, fg: restaurantTheme.primary, border: colors.amber[200] };
  if (['accepted', 'confirmed'].includes(key)) return { bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0' };
  if (key === 'checked-in') return { bg: colors.orange[100], fg: restaurantTheme.primaryStrong, border: 'transparent' };
  if (key === 'completed') return { bg: colors.blue[100], fg: colors.blue[700], border: 'transparent' };
  return { bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5' };
};

export default function DiningReservations() {
  const goBack = useRestaurantBackNavigation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [restaurantPhoto, setRestaurantPhoto] = useState('');
  const [restaurantPhotos, setRestaurantPhotos] = useState([]);
  const [menuPhotos, setMenuPhotos] = useState([]);
  const [uploadingRestaurantPhoto, setUploadingRestaurantPhoto] = useState(false);
  const [uploadingMenuPhotos, setUploadingMenuPhotos] = useState(false);
  const [removingRestaurantPhoto, setRemovingRestaurantPhoto] = useState(false);
  const [removingMenuPhoto, setRemovingMenuPhoto] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [activeSection, setActiveSection] = useState('reservations');
  const [activeView, setActiveView] = useState('priority');
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [diningEnabled, setDiningEnabled] = useState(false);
  const [maxGuestsLimit, setMaxGuestsLimit] = useState(6);
  const [savingDiningSettings, setSavingDiningSettings] = useState(false);
  const [diningSettingsMessage, setDiningSettingsMessage] = useState('');
  const [diningSettingsError, setDiningSettingsError] = useState('');
  const [diningType, setDiningType] = useState([]);
  // dining details shown to customers - asked before the dining listing is approved
  const [diningCuisines, setDiningCuisines] = useState([]);
  const [costForTwo, setCostForTwo] = useState('');
  const [costFocused, setCostFocused] = useState(false);
  const [diningFacilities, setDiningFacilities] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [, setFetchingRequest] = useState(true);

  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  const syncRestaurantMediaState = (restaurantData) => {
    if (!aliveRef.current) return;
    setRestaurant(restaurantData || null);
    const coverImages = getCoverImages(restaurantData);
    const profileImage = getProfilePhotoUrl(restaurantData);
    setRestaurantPhotos(coverImages);
    setRestaurantPhoto(coverImages[0]?.url || profileImage);
    setMenuPhotos(getMenuImages(restaurantData));
    setDiningEnabled(Boolean(restaurantData?.diningSettings?.isEnabled));
    setMaxGuestsLimit(Math.max(1, parseInt(restaurantData?.diningSettings?.maxGuests, 10) || 6));

    const rawDiningType = restaurantData?.diningSettings?.diningType;
    setDiningType(Array.isArray(rawDiningType) ? rawDiningType : rawDiningType ? [rawDiningType].filter(Boolean) : []);
    setDiningCuisines(Array.isArray(restaurantData?.cuisines) ? restaurantData.cuisines : []);
    setCostForTwo(restaurantData?.costForTwo ? String(restaurantData.costForTwo) : '');
    setDiningFacilities(Array.isArray(restaurantData?.diningSettings?.facilities) ? restaurantData.diningSettings.facilities : []);
  };

  useEffect(() => {
    const fetchAll = async (isPoll = false) => {
      try {
        if (!isPoll) setLoading(true);

        const resResponse = await restaurantAPI.getCurrentRestaurant();
        if (resResponse.data.success) {
          const resData = getRestaurantFromResponse(resResponse);
          const restaurantId = resData?._id || resData?.id;

          if (restaurantId) {
            syncRestaurantMediaState(resData);

            if (!isPoll) {
              const bookingsResponse = await diningAPI.getRestaurantBookings(resData);
              if (bookingsResponse.data.success && aliveRef.current) {
                setBookings(Array.isArray(bookingsResponse.data.data) ? bookingsResponse.data.data : []);
              }

              const catRes = await diningAPI.getCategories();
              if (catRes.data.success && aliveRef.current) {
                setAvailableCategories(catRes.data.data || []);
              }
            }

            const requestRes = await restaurantAPI.getPendingDiningRequest();
            const newPendingRequest = requestRes.data.success && requestRes.data.data ? requestRes.data.data : null;

            if (pendingRequest && !newPendingRequest) {
              const updatedRes = await restaurantAPI.getCurrentRestaurant();
              const updatedData = getRestaurantFromResponse(updatedRes);

              // Simple check: if isEnabled matches what we requested, it was likely approved
              const requestedEnabled = pendingRequest.requestedSettings?.isEnabled;
              const currentEnabled = updatedData?.diningSettings?.isEnabled;

              if (requestedEnabled === currentEnabled) {
                toast.success('Dining settings updated and approved!');
              } else {
                toast.error('Your dining settings request was rejected by admin.');
              }

              syncRestaurantMediaState(updatedData);
            }

            if (!aliveRef.current) return;
            setPendingRequest(newPendingRequest);

            if (newPendingRequest?.requestedSettings) {
              setDiningEnabled(newPendingRequest.requestedSettings.isEnabled);
              setMaxGuestsLimit(newPendingRequest.requestedSettings.maxGuests);
              const reqType = newPendingRequest.requestedSettings.diningType;
              setDiningType(Array.isArray(reqType) ? reqType : reqType ? [reqType] : []);
            }
          }
        }
      } catch (error) {
        if (!isPoll) debugError('Error fetching dining data:', error);
      } finally {
        if (!isPoll && aliveRef.current) {
          setLoading(false);
          setFetchingRequest(false);
        }
      }
    };

    fetchAll();
    let interval;
    if (pendingRequest) {
      interval = setInterval(() => fetchAll(true), 15000);
    }
    return () => interval && clearInterval(interval);
    // web: re-runs only when the pending request changes (the poll reads the request it was started with)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRequest?._id]);

  const handleRestaurantPhotoUpload = async () => {
    if (uploadingRestaurantPhoto || removingRestaurantPhoto) return;
    let files = [];
    try {
      files = await pickImageFiles('restaurant-photo');
    } catch (error) {
      setUploadError(error?.message || 'Failed to upload restaurant photos.');
      return;
    }
    if (files.length === 0) return;

    setUploadError('');
    setUploadMessage('');
    setUploadingRestaurantPhoto(true);

    try {
      await restaurantAPI.uploadCoverImages(files);
      const refreshedResponse = await restaurantAPI.getCurrentRestaurant();
      const refreshedRestaurant = getRestaurantFromResponse(refreshedResponse);
      syncRestaurantMediaState(refreshedRestaurant);
      if (aliveRef.current) setUploadMessage(`Uploaded ${files.length} restaurant photo(s) successfully.`);
    } catch (error) {
      debugError('Error uploading restaurant photo:', error);
      if (aliveRef.current) setUploadError(error?.response?.data?.message || 'Failed to upload restaurant photos.');
    } finally {
      if (aliveRef.current) setUploadingRestaurantPhoto(false);
    }
  };

  const handleMenuPhotosUpload = async () => {
    if (uploadingMenuPhotos || removingMenuPhoto) return;
    let files = [];
    try {
      files = await pickImageFiles('menu-photo');
    } catch (error) {
      setUploadError(error?.message || 'Failed to upload menu photos.');
      return;
    }
    if (files.length === 0) return;

    setUploadError('');
    setUploadMessage('');
    setUploadingMenuPhotos(true);

    try {
      await restaurantAPI.uploadMenuImages(files);
      const refreshedResponse = await restaurantAPI.getCurrentRestaurant();
      syncRestaurantMediaState(getRestaurantFromResponse(refreshedResponse));
      if (aliveRef.current) setUploadMessage(`Uploaded ${files.length} menu photo(s) successfully.`);
    } catch (error) {
      debugError('Error saving menu photos:', error);
      if (aliveRef.current) setUploadError(error?.response?.data?.message || 'Failed to upload menu photos.');
    } finally {
      if (aliveRef.current) setUploadingMenuPhotos(false);
    }
  };

  const handleRemoveRestaurantPhoto = async (photoUrl) => {
    if (!photoUrl || removingRestaurantPhoto) return;

    setUploadError('');
    setUploadMessage('');
    setRemovingRestaurantPhoto(true);

    try {
      const nextCoverImages = restaurantPhotos.filter((photo) => photo.url !== photoUrl);
      const currentProfileImage = getProfilePhotoUrl(restaurant);
      const nextPrimaryPhoto = nextCoverImages[0]?.url || '';
      const shouldClearProfileImage = !nextPrimaryPhoto && currentProfileImage === photoUrl;

      const response = await restaurantAPI.updateProfile({
        coverImages: nextCoverImages.map((photo) => ({
          url: photo.url,
          ...(photo.publicId ? { publicId: photo.publicId } : {}),
        })),
        ...(shouldClearProfileImage ? { profileImage: '' } : {}),
      });

      const updatedRestaurant = getRestaurantFromResponse(response);
      if (updatedRestaurant) {
        syncRestaurantMediaState(updatedRestaurant);
      } else {
        const refreshedResponse = await restaurantAPI.getCurrentRestaurant();
        syncRestaurantMediaState(getRestaurantFromResponse(refreshedResponse));
      }

      if (aliveRef.current) setUploadMessage('Restaurant photo removed successfully.');
    } catch (error) {
      debugError('Error removing restaurant photo:', error);
      if (aliveRef.current) setUploadError(error?.response?.data?.message || 'Failed to remove restaurant photo.');
    } finally {
      if (aliveRef.current) setRemovingRestaurantPhoto(false);
    }
  };

  const handleRemoveMenuPhoto = async (photoUrl) => {
    if (!photoUrl || removingMenuPhoto) return;

    setUploadError('');
    setUploadMessage('');
    setRemovingMenuPhoto(true);

    try {
      const nextMenuPhotos = menuPhotos.filter((photo) => photo.url !== photoUrl);
      const response = await restaurantAPI.updateProfile({
        menuImages: nextMenuPhotos.map((photo) => ({
          url: photo.url,
          ...(photo.publicId ? { publicId: photo.publicId } : {}),
        })),
      });

      const updatedRestaurant = getRestaurantFromResponse(response);
      if (updatedRestaurant) {
        syncRestaurantMediaState(updatedRestaurant);
      } else {
        const refreshedResponse = await restaurantAPI.getCurrentRestaurant();
        syncRestaurantMediaState(getRestaurantFromResponse(refreshedResponse));
      }

      if (aliveRef.current) setUploadMessage('Menu photo removed successfully.');
    } catch (error) {
      debugError('Error removing menu photo:', error);
      if (aliveRef.current) setUploadError(error?.response?.data?.message || 'Failed to remove menu photo.');
    } finally {
      if (aliveRef.current) setRemovingMenuPhoto(false);
    }
  };

  const handleSaveDiningSettings = async () => {
    if (!restaurant || savingDiningSettings || pendingRequest) return;

    // only the admin's real dining categories count (old data carried a built-in "family-dining" that no admin
    // category matches - it was sent invisibly with every request)
    const knownSlugs = new Set((availableCategories || []).map((cat) => cat.slug));
    const chosenTypes = [...new Set((Array.isArray(diningType) ? diningType : [diningType]).filter((slug) => knownSlugs.has(slug)))];
    if (chosenTypes.length === 0) {
      setDiningSettingsError('Please select at least one dining category');
      toast.error('Dining category is required');
      return;
    }

    const nextMaxGuests = parseInt(maxGuestsLimit, 10) || 0;
    const nextCostForTwo = parseInt(costForTwo, 10) || 0;

    if (diningEnabled && diningCuisines.length === 0) {
      setDiningSettingsError('Please choose the cuisines you serve');
      toast.error('Cuisines are required');
      return;
    }

    if (diningEnabled && nextCostForTwo <= 0) {
      setDiningSettingsError('Please add the average price for two people');
      toast.error('Price for two is required');
      return;
    }

    if (diningEnabled && nextMaxGuests <= 0) {
      setDiningSettingsError('Guest limit must be at least 1 when dining is enabled');
      toast.error('Set at least 1 guest limit to enable dining');
      return;
    }

    const nextDiningSettings = {
      isEnabled: Boolean(diningEnabled),
      maxGuests: nextMaxGuests,
      diningType: chosenTypes,
      cuisines: diningCuisines,
      costForTwo: nextCostForTwo || null,
      facilities: diningFacilities,
    };

    setDiningSettingsError('');
    setDiningSettingsMessage('');
    setSavingDiningSettings(true);

    try {
      const response = await restaurantAPI.requestDiningUpdate(nextDiningSettings);
      if (response.data.success && aliveRef.current) {
        setPendingRequest(response.data.data);
        setDiningSettingsMessage('Update request sent to admin for approval.');
        toast.success('Request sent for approval');
      }
    } catch (error) {
      debugError('Error requesting dining settings update:', error);
      if (aliveRef.current) setDiningSettingsError(error?.response?.data?.message || 'Failed to submit request.');
      toast.error(error?.response?.data?.message || 'Failed to submit request');
    } finally {
      if (aliveRef.current) setSavingDiningSettings(false);
    }
  };

  const handleStatusUpdate = async (bookingId, newStatus) => {
    try {
      const response = await diningAPI.updateBookingStatusRestaurant(bookingId, newStatus);
      if (response.data.success) {
        if (aliveRef.current) setBookings((prev) => prev.map((b) => (b._id === bookingId ? { ...b, status: newStatus } : b)));
        toast.success(`Booking ${newStatus === 'accepted' ? 'confirmed' : 'declined'}`);
      }
    } catch (error) {
      debugError('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const getStatusPriority = (status) => {
    const key = String(status || '').toLowerCase();
    if (key === 'pending') return 0;
    if (key === 'confirmed') return 1;
    if (key === 'accepted') return 2;
    if (key === 'checked-in') return 3;
    if (key === 'completed') return 4;
    if (key === 'cancelled') return 5;
    return 6;
  };

  const getBookingTimestamp = (booking) => {
    const createdAtTs = new Date(booking?.createdAt || '').getTime();
    if (!Number.isNaN(createdAtTs)) return createdAtTs;
    const dateTs = new Date(booking?.date || '').getTime();
    if (!Number.isNaN(dateTs)) return dateTs;
    return 0;
  };

  const isToday = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date.toDateString() === new Date().toDateString();
  };

  const isNewRequest = (booking) => {
    if (String(booking?.status || '').toLowerCase() !== 'pending') return false;
    const createdAt = new Date(booking?.createdAt || booking?.date || '').getTime();
    if (Number.isNaN(createdAt)) return true;
    return Date.now() - createdAt <= 2 * 60 * 60 * 1000;
  };

  const sortedBookings = useMemo(
    () =>
      [...bookings].sort((a, b) => {
        const priorityDiff = getStatusPriority(a?.status) - getStatusPriority(b?.status);
        if (priorityDiff !== 0) return priorityDiff;
        return getBookingTimestamp(b) - getBookingTimestamp(a);
      }),
     
    [bookings],
  );

  const filteredBookings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedBookings
      .filter((booking) => {
        if (!term) return true;
        return (
          getBookerName(booking).toLowerCase().includes(term) ||
          String(booking?.bookingId || '').toLowerCase().includes(term) ||
          getBookerPhone(booking).toLowerCase().includes(term)
        );
      })
      .filter((booking) => {
        if (activeView === 'today') return isToday(booking?.date);
        if (activeView === 'new') return isNewRequest(booking);
        return true;
      });
     
  }, [sortedBookings, searchTerm, activeView]);

   
  const newRequestsCount = useMemo(() => bookings.filter((booking) => isNewRequest(booking)).length, [bookings]);

  if (loading) return <Loader />;

  const locked = Boolean(pendingRequest);
  const activeCount = bookings.filter((b) => ['pending', 'confirmed', 'accepted', 'checked-in'].includes(String(b.status || '').toLowerCase())).length;
  const todayCount = bookings.filter((b) => new Date(b.date).toDateString() === new Date().toDateString()).length;

  const stats = [
    { key: 'total', label: 'Total Bookings', value: bookings.length, icon: Users, iconBg: null, blob: alpha(colors.blue[50], 0.5) },
    { key: 'active', label: 'Active', value: activeCount, icon: CheckCircle2, iconBg: colors.emerald[600], blob: alpha(colors.green[50], 0.5) },
    // bg-orange-600 -> restaurant primary; bg-orange-50/50 stays a soft orange tint
    { key: 'today', label: "Today's Bookings", value: todayCount, icon: Clock4, iconBg: restaurantTheme.primary, blob: alpha(colors.orange[50], 0.5) },
  ];

  const sectionSwitchBtn = (id, label) => {
    const active = activeSection === id;
    return (
      <Pressable key={id} onPress={() => setActiveSection(id)} style={[styles.segBtn, active && styles.segBtnActive]}>
        <Text style={[styles.segText, { color: active ? colors.slate[900] : colors.slate[400] }]}>{label}</Text>
      </Pressable>
    );
  };

  const mobileSwitchBtn = (id, label) => {
    const active = activeSection === id;
    return (
      <Pressable key={id} onPress={() => setActiveSection(id)} style={styles.mSegBtn}>
        {active ? <BrandFill r={10} /> : null}
        <Text style={[styles.mSegText, { color: active ? colors.white : colors.slate[600] }]}>{label}</Text>
      </Pressable>
    );
  };

  const viewBtn = (id, label) => {
    const active = activeView === id;
    return (
      <Pressable key={id} onPress={() => setActiveView(id)} style={styles.viewBtn}>
        {active ? <BrandFill r={10} /> : null}
        <Text style={[styles.viewText, { color: active ? colors.white : colors.slate[500] }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Screen bg={colors.slate[50]} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={alpha(colors.white, 0.95)} />
        <View style={styles.headerInner}>
          <FadeIn from={{ x: -20 }} style={styles.headerTitleRow}>
            <Pressable
              onPress={goBack}
              accessibilityLabel="Back to explore"
              style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.slate[200] }]}
            >
              <ArrowLeft size={20} color={colors.slate[500]} />
            </Pressable>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>Table Reservations</Text>
              <PulseDot />
            </View>
            <Text style={styles.subtitle}>LIVE QUEUE MANAGEMENT</Text>
          </FadeIn>

          <View style={{ gap: sp(3) }}>
            <View style={styles.searchWrap}>
              <View style={styles.searchIcon} pointerEvents="none">
                <Search size={16} color={searchFocused ? colors.blue[500] : colors.slate[400]} />
              </View>
              <TextInput
                placeholder="Search guests..."
                placeholderTextColor={colors.slate[400]}
                value={searchTerm}
                onChangeText={setSearchTerm}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={[styles.searchInput, searchFocused && styles.searchInputFocus]}
              />
            </View>
            <View style={styles.segWrap}>
              {sectionSwitchBtn('reservations', 'QUEUE')}
              {sectionSwitchBtn('media', 'MEDIA')}
            </View>
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={styles.page}>
        {/* Stats */}
        <View style={{ gap: sp(4), marginBottom: sp(8) }}>
          {stats.map((st, i) => {
            const Icon = st.icon;
            return (
              <FadeIn key={st.key} delay={i * 100} style={styles.statCard}>
                <View style={[styles.statBlob, { backgroundColor: st.blob }]} />
                <View style={styles.statRow}>
                  <View style={[styles.statIcon, st.iconBg ? { backgroundColor: st.iconBg } : null]}>
                    {!st.iconBg ? <BrandFill r={14} /> : null}
                    <Icon size={24} color={colors.white} />
                  </View>
                  <View>
                    <Text style={styles.statLabel}>{st.label.toUpperCase()}</Text>
                    <Text style={styles.statValue}>{st.value}</Text>
                  </View>
                </View>
              </FadeIn>
            );
          })}
        </View>

        <View style={{ marginBottom: sp(6) }}>
          <View style={styles.mSegWrap}>
            {mobileSwitchBtn('reservations', 'Reservations')}
            {mobileSwitchBtn('media', 'Photos & Menu')}
          </View>
        </View>

        {activeSection === 'media' ? (
          <View style={{ marginBottom: sp(8) }}>
            <Pressable
              onPress={() => setShowMediaPanel((prev) => !prev)}
              style={({ pressed }) => [styles.mediaToggle, pressed && { backgroundColor: colors.slate[50] }]}
            >
              <View style={styles.flexShrink}>
                <Text style={styles.mediaToggleTitle}>Photos & Menu Manager</Text>
                <Text style={styles.mediaToggleSub}>Upload restaurant and menu images only when needed.</Text>
              </View>
              {showMediaPanel ? <ChevronUp size={20} color={colors.slate[500]} /> : <ChevronDown size={20} color={colors.slate[500]} />}
            </Pressable>
          </View>
        ) : null}

        {activeSection === 'media' && showMediaPanel ? (
          <View style={{ gap: sp(6), marginBottom: sp(8) }}>
            {/* Restaurant photos */}
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <View style={styles.flexShrink}>
                  <Text style={styles.panelTitle}>Restaurant Photos</Text>
                  <Text style={styles.panelSub}>Add multiple restaurant photos. The first one will be used as the main preview.</Text>
                </View>
                <Pressable
                  onPress={handleRestaurantPhotoUpload}
                  disabled={uploadingRestaurantPhoto || removingRestaurantPhoto}
                  style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
                >
                  <BrandFill r={14} />
                  <UploadCloud size={16} color={colors.white} />
                  <Text style={styles.addBtnText}>{uploadingRestaurantPhoto ? 'Uploading...' : 'Add Photos'}</Text>
                </Pressable>
              </View>

              <View style={styles.mainPhoto}>
                {restaurantPhoto ? (
                  <AppImage src={restaurantPhoto} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={styles.photoEmpty}>
                    <ImagePlus size={32} color={colors.slate[400]} style={{ marginBottom: sp(2) }} />
                    <Text style={styles.photoEmptyText}>No restaurant photo added yet</Text>
                  </View>
                )}
              </View>

              {restaurantPhotos.length > 0 ? (
                <Grid cols={3} gap={sp(3)} style={{ marginTop: sp(4) }}>
                  {restaurantPhotos.map((photo, index) => {
                    const isMain = restaurantPhoto === photo.url;
                    return (
                      <Pressable
                        key={`${photo.url}-${index}`}
                        onPress={() => setRestaurantPhoto(photo.url)}
                        style={[styles.thumb, isMain ? styles.thumbMain : null]}
                      >
                        <AppImage src={photo.url} style={StyleSheet.absoluteFill} contentFit="cover" />
                        <View style={styles.thumbLabel}>
                          <LinearGradient
                            colors={[restaurantTheme.brand, alpha(restaurantTheme.brandDark, 0.45)]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <Text style={styles.thumbLabelText}>{isMain ? 'Main' : `Photo ${index + 1}`}</Text>
                        </View>
                        <Pressable onPress={() => handleRemoveRestaurantPhoto(photo.url)} hitSlop={6} style={styles.removeBtn}>
                          <X size={14} color={colors.rose[600]} />
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </Grid>
              ) : null}
            </View>

            {/* Menu photos */}
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <View style={styles.flexShrink}>
                  <Text style={styles.panelTitle}>Menu Photos</Text>
                  <Text style={styles.panelSub}>Add menu photos and view previously uploaded photos.</Text>
                </View>
                <Pressable
                  onPress={handleMenuPhotosUpload}
                  disabled={uploadingMenuPhotos || removingMenuPhoto}
                  style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
                >
                  <BrandFill r={14} />
                  <UploadCloud size={16} color={colors.white} />
                  <Text style={styles.addBtnText}>{uploadingMenuPhotos ? 'Uploading...' : 'Add Photos'}</Text>
                </Pressable>
              </View>

              {menuPhotos.length > 0 ? (
                <Grid cols={2} gap={sp(3)} style={{ marginTop: sp(4) }}>
                  {menuPhotos.map((photo, index) => (
                    <View key={`${photo.url}-${index}`} style={styles.menuThumb}>
                      <AppImage src={photo.url} style={StyleSheet.absoluteFill} contentFit="cover" />
                      <Pressable onPress={() => handleRemoveMenuPhoto(photo.url)} disabled={removingMenuPhoto} hitSlop={6} style={styles.removeBtn}>
                        <X size={14} color={colors.rose[600]} />
                      </Pressable>
                    </View>
                  ))}
                </Grid>
              ) : (
                <View style={styles.menuEmpty}>
                  <ImagePlus size={28} color={colors.slate[400]} style={{ marginBottom: sp(2) }} />
                  <Text style={styles.photoEmptyText}>No menu photos added yet</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {activeSection === 'reservations' ? (
          <View style={styles.controls}>
            <View style={{ marginBottom: sp(6) }}>
              <Text style={styles.controlsEyebrow}>DINING CONTROLS</Text>
              <Text style={styles.controlsTitle}>Manage dining availability and booking limit</Text>
              <Text style={styles.controlsSub}>
                These settings update the same dining profile the guest booking flow reads, so restaurant changes are reflected on the user side too.
              </Text>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.statePill}>
                <View style={[styles.stateDot, { backgroundColor: diningEnabled ? colors.emerald[500] : colors.rose[500] }]} />
                <Text style={styles.stateText}>{diningEnabled ? 'Dining enabled' : 'Dining paused'}</Text>
              </View>

              <View style={styles.switchPill}>
                <Text style={styles.switchLabel}>Turn dining on/off</Text>
                <DiningSwitch
                  on={diningEnabled}
                  disabled={locked}
                  onPress={() => {
                    if (pendingRequest) return;
                    const newState = !diningEnabled;
                    setDiningEnabled(newState);
                    if (!newState) {
                      setMaxGuestsLimit(0);
                    } else if (maxGuestsLimit === 0) {
                      setMaxGuestsLimit(6);
                    }
                  }}
                />
              </View>
            </View>

            {/* Dining Categories Selection */}
            <View style={styles.block}>
              <View style={styles.blockLabelRow}>
                <Sparkles size={16} color={PRIMARY} />
                <Text style={styles.blockLabel}>Choose Dining Categories (Pick Multiple)</Text>
              </View>
              {availableCategories.length === 0 ? (
                <View style={styles.noCats}>
                  <Text style={styles.noCatsText}>No categories available. Please contact support.</Text>
                </View>
              ) : (
                <Grid cols={2} gap={sp(4)}>
                  {availableCategories.map((cat) => {
                    const isSelected = Array.isArray(diningType) && diningType.includes(cat.slug);
                    return (
                      <Pressable
                        key={cat._id}
                        onPress={() => {
                          if (pendingRequest) return;
                          if (isSelected) setDiningType(diningType.filter((s) => s !== cat.slug));
                          else setDiningType([...diningType, cat.slug]);
                        }}
                        disabled={locked}
                        style={({ pressed }) => [
                          styles.catCard,
                          isSelected ? styles.catCardOn : styles.catCardOff,
                          locked && { opacity: 0.8 },
                          !isSelected && pressed && !locked && { transform: [{ scale: 0.95 }] },
                        ]}
                      >
                        <View style={[styles.catImage, isSelected ? styles.catImageOn : styles.catImageOff]}>
                          {cat.imageUrl ? (
                            <AppImage src={cat.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                          ) : (
                            <View style={styles.catImageEmpty}>
                              <UtensilsCrossed size={24} color={colors.slate[300]} />
                            </View>
                          )}
                        </View>
                        <Text style={[styles.catName, { color: isSelected ? PRIMARY : colors.slate[600] }]}>{cat.name}</Text>
                        {isSelected ? (
                          <View style={styles.catCheck}>
                            <CheckCircle2 size={14} color={colors.white} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </Grid>
              )}
            </View>

            {/* Dining details shown to customers (asked before approval) */}
            <View style={[styles.block, { gap: sp(6) }]}>
              <View>
                <Text style={styles.fieldLabel}>Cuisines you serve *</Text>
                <Text style={styles.fieldHint}>Shown on your dining page and used in the customer cuisine filter</Text>
                <View style={styles.chipWrap}>
                  {DINING_CUISINES.map((cuisine) => {
                    const on = diningCuisines.includes(cuisine);
                    return (
                      <Pressable
                        key={cuisine}
                        disabled={locked}
                        onPress={() => setDiningCuisines(on ? diningCuisines.filter((c) => c !== cuisine) : [...diningCuisines, cuisine])}
                        style={[styles.chip, on ? styles.chipPrimaryOn : styles.chipOff, locked && { opacity: 0.8 }]}
                      >
                        <Text style={[styles.chipText, { color: on ? PRIMARY : colors.slate[600] }]}>{cuisine}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View>
                <Text style={styles.fieldLabel}>Average price for two (₹) *</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={costForTwo}
                  editable={!locked}
                  onChangeText={(text) => setCostForTwo(String(text).replace(/[^\d]/g, '').slice(0, 6))}
                  onFocus={() => setCostFocused(true)}
                  onBlur={() => setCostFocused(false)}
                  placeholder="e.g. 800"
                  placeholderTextColor={colors.slate[400]}
                  style={[styles.costInput, costFocused && styles.inputFocus, locked && { opacity: 0.6 }]}
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>Facilities</Text>
                <Text style={styles.fieldHint}>Pick what your place offers</Text>
                <View style={styles.chipWrap}>
                  {DINING_FACILITIES.map((facility) => {
                    const on = diningFacilities.includes(facility);
                    return (
                      <Pressable
                        key={facility}
                        disabled={locked}
                        onPress={() => setDiningFacilities(on ? diningFacilities.filter((f) => f !== facility) : [...diningFacilities, facility])}
                        style={[styles.chip, on ? styles.chipGreenOn : styles.chipOff, locked && { opacity: 0.8 }]}
                      >
                        <Text style={[styles.chipText, { color: on ? restaurantTheme.primaryStrong : colors.slate[600] }]}>{facility}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={[styles.block, { gap: sp(6) }]}>
              <View style={styles.guestRow}>
                <View style={[styles.flexShrink, { gap: sp(1) }]}>
                  <Text style={styles.fieldLabelPlain}>Maximum Guest Limit</Text>
                  <Text style={styles.fieldHintPlain}>Guests allowed per reservation</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => {
                      if (pendingRequest) return;
                      setMaxGuestsLimit(Math.max(0, maxGuestsLimit - 1));
                    }}
                    disabled={locked}
                    style={({ pressed }) => [styles.stepBtn, locked && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.9 }] }]}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{maxGuestsLimit}</Text>
                  <Pressable
                    onPress={() => {
                      if (pendingRequest) return;
                      setMaxGuestsLimit(parseInt(maxGuestsLimit, 10) + 1);
                    }}
                    disabled={locked}
                    style={({ pressed }) => [styles.stepBtn, locked && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.9 }] }]}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={handleSaveDiningSettings}
                disabled={savingDiningSettings || locked}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (savingDiningSettings || locked) && { opacity: 0.6 },
                  pressed && !(savingDiningSettings || locked) && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <BrandFill r={9999} />
                <Text style={styles.saveText}>{savingDiningSettings ? 'SAVING...' : pendingRequest ? 'APPROVAL PENDING' : 'SAVE SETTINGS'}</Text>
              </Pressable>
            </View>

            {pendingRequest ? (
              <View style={styles.pendingNote}>
                <Clock4 size={16} color={colors.amber[800]} />
                <Text style={styles.pendingText}>
                  Your recent changes are waiting for admin approval. You cannot make new changes until the current request is processed.
                </Text>
              </View>
            ) : null}

            {diningSettingsMessage || diningSettingsError ? (
              <View
                style={[
                  styles.msgBox,
                  diningSettingsError
                    ? { borderColor: colors.rose[200], backgroundColor: colors.rose[50] }
                    : { borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] },
                ]}
              >
                <Text style={[styles.msgText, { color: diningSettingsError ? colors.rose[700] : restaurantTheme.primaryStrong }]}>
                  {diningSettingsError || diningSettingsMessage}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {uploadMessage || uploadError ? (
          <View
            style={[
              styles.msgBox,
              { marginTop: 0, marginBottom: sp(6) },
              uploadError ? { backgroundColor: colors.red[50], borderColor: colors.red[200] } : { backgroundColor: colors.green[50], borderColor: colors.green[200] },
            ]}
          >
            <Text style={[styles.msgText, { color: uploadError ? colors.red[700] : restaurantTheme.primaryStrong }]}>{uploadError || uploadMessage}</Text>
          </View>
        ) : null}

        {/* Bookings List */}
        {activeSection === 'reservations' ? (
          <View style={{ gap: sp(4) }}>
            <View style={[styles.queueHead, { marginBottom: sp(2) }]}>
              <Text style={styles.queueTitle}>Reservation Queue</Text>
              <View style={styles.viewWrap}>
                {viewBtn('priority', 'Priority')}
                {viewBtn('new', `New (${newRequestsCount})`)}
                {viewBtn('today', 'Today')}
              </View>
            </View>

            {newRequestsCount > 0 ? (
              <View style={styles.newBanner}>
                <Sparkles size={16} color={colors.amber[800]} />
                <Text style={styles.newBannerText}>
                  {newRequestsCount} new reservation request{newRequestsCount > 1 ? 's' : ''} waiting for quick action.
                </Text>
              </View>
            ) : null}

            {filteredBookings.length > 0 ? (
              <View style={{ gap: sp(4) }}>
                {filteredBookings.map((booking) => {
                  const statusKey = String(booking.status || '').toLowerCase();
                  const badge = statusBadgeColors(booking.status);
                  const label = statusKey === 'pending' ? 'WAITING' : ['accepted', 'confirmed'].includes(statusKey) ? 'CONFIRMED' : String(booking.status || '').toUpperCase();
                  return (
                    <FadeIn key={booking._id} from={{ x: -10 }} style={[styles.bookingCard, isNewRequest(booking) && styles.bookingCardNew]}>
                      <View style={styles.bookingHead}>
                        <View style={styles.bookingWho}>
                          <View style={styles.bookingAvatar}>
                            <BrandFill r={20} />
                            <Text style={styles.bookingAvatarText}>{(getBookerName(booking).charAt(0) || '?').toUpperCase()}</Text>
                          </View>
                          <View style={styles.flexShrink}>
                            <Text style={styles.bookingName}>{getBookerName(booking)}</Text>
                            <Text style={styles.bookingId}>{`#${booking.bookingId}`.toUpperCase()}</Text>
                          </View>
                        </View>
                        <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                          <Text style={[styles.badgeText, { color: badge.fg }]}>{label}</Text>
                        </View>
                      </View>

                      <View style={styles.infoBox}>
                        <Grid cols={2} gap={sp(3)}>
                          <View style={styles.infoItem}>
                            <Calendar size={16} color={colors.blue[500]} />
                            <Text style={styles.infoText}>{new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</Text>
                          </View>
                          <View style={styles.infoItem}>
                            <Clock size={16} color={colors.blue[500]} />
                            <Text style={styles.infoText}>{booking.timeSlot}</Text>
                          </View>
                          <View style={styles.infoItem}>
                            <Users size={16} color={colors.blue[500]} />
                            <Text style={styles.infoText}>{booking.guests} Guests</Text>
                          </View>
                          <View style={styles.infoItem}>
                            <Phone size={16} color={colors.blue[500]} />
                            <Text style={[styles.infoText, styles.flexShrink]} numberOfLines={1}>
                              {getBookerPhone(booking) || 'No phone'}
                            </Text>
                          </View>
                        </Grid>
                      </View>

                      {booking.specialRequest ? (
                        <View style={styles.specialBox}>
                          <MessageSquare size={16} color={colors.blue[700]} style={{ marginTop: 2 }} />
                          <Text style={styles.specialText}>{booking.specialRequest}</Text>
                        </View>
                      ) : null}

                      <View style={styles.actionRow}>
                        {statusKey === 'pending' ? (
                          <Pressable onPress={() => handleStatusUpdate(booking._id, 'accepted')} style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.95 }]}>
                            <BrandFill r={14} />
                            <Text style={styles.actionTextWhite}>ACCEPT</Text>
                          </Pressable>
                        ) : null}
                        {statusKey === 'pending' ? (
                          <Pressable
                            onPress={() => handleStatusUpdate(booking._id, 'cancelled')}
                            style={({ pressed }) => [styles.actionBtn, styles.declineBtn, pressed && { backgroundColor: colors.slate[50] }]}
                          >
                            <Text style={styles.actionTextDecline}>DECLINE</Text>
                          </Pressable>
                        ) : null}
                        {booking.status === 'accepted' ? (
                          <Pressable
                            onPress={() => handleStatusUpdate(booking._id, 'checked-in')}
                            style={({ pressed }) => [styles.actionBtn, { backgroundColor: pressed ? restaurantTheme.primaryStrong : restaurantTheme.primary }]}
                          >
                            <Text style={styles.actionTextWhite}>CHECK-IN</Text>
                          </Pressable>
                        ) : null}
                        {booking.status === 'checked-in' ? (
                          <Pressable onPress={() => handleStatusUpdate(booking._id, 'completed')} style={styles.actionBtn}>
                            <BrandFill r={14} />
                            <Text style={styles.actionTextWhite}>CHECK-OUT</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </FadeIn>
                  );
                })}
              </View>
            ) : (
              <FadeIn from={{ scale: 0.9 }} style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Calendar size={40} color={colors.slate[300]} />
                </View>
                <Text style={styles.emptyTitle}>No reservations found</Text>
                <Text style={styles.emptySub}>When guests book a table, they will appear here in your live queue.</Text>
              </FadeIn>
            )}
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  // header (bg-white/80 backdrop-blur-xl sticky)
  header: { backgroundColor: alpha(colors.white, 0.95), borderBottomWidth: 1, borderBottomColor: colors.slate[100], zIndex: 30 },
  headerInner: { paddingHorizontal: sp(6), paddingVertical: sp(4), gap: sp(4) },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
  backBtn: { backgroundColor: colors.slate[100], padding: sp(2), borderRadius: 14, borderWidth: 1, borderColor: colors.slate[200] },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flexShrink: 1 },
  title: { flexShrink: 1, fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.slate[900], letterSpacing: -0.6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald[500] },
  subtitle: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400], letterSpacing: 1.2, marginTop: sp(1) },
  searchWrap: { justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: sp(4), zIndex: 1 },
  searchInput: {
    width: '100%',
    paddingLeft: 44,
    paddingRight: sp(4),
    paddingVertical: 10,
    backgroundColor: alpha(colors.slate[100], 0.5),
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
    fontSize: 14,
    fontWeight: '700',
    color: colors.slate[900],
  },
  searchInputFocus: { backgroundColor: colors.white, borderColor: restaurantTheme.focusBorder },
  segWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(1),
    backgroundColor: alpha(colors.slate[100], 0.5),
    padding: sp(1),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha(colors.slate[200], 0.5),
    alignSelf: 'flex-start',
  },
  segBtn: { paddingHorizontal: sp(4), paddingVertical: sp(2), borderRadius: 14 },
  segBtnActive: { backgroundColor: colors.white, transform: [{ scale: 1.02 }], ...shadow.md },
  segText: { fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 1.2 },
  page: { padding: sp(6), paddingBottom: sp(6) + 80 },
  // stats
  statCard: { backgroundColor: colors.white, padding: sp(6), borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], overflow: 'hidden', ...shadow.sm },
  statBlob: { position: 'absolute', top: -32, right: -32, width: 96, height: 96, borderBottomLeftRadius: 96 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
  statIcon: { padding: sp(3), borderRadius: 14, overflow: 'hidden', ...shadow.lg },
  statLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[500], letterSpacing: 0.7 },
  statValue: { fontSize: 16, lineHeight: 16, fontWeight: '900', color: colors.slate[900], marginTop: sp(1), paddingTop: 2 },
  // phone section switch
  mSegWrap: { flexDirection: 'row', alignItems: 'center', gap: sp(2), borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[200], padding: sp(1) },
  mSegBtn: { flex: 1, paddingHorizontal: sp(3), paddingVertical: sp(2), borderRadius: 10, alignItems: 'center', overflow: 'hidden' },
  mSegText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  // media
  mediaToggle: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    paddingHorizontal: sp(5),
    paddingVertical: sp(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(3),
  },
  mediaToggleTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.slate[900] },
  mediaToggleSub: { fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  panel: { backgroundColor: colors.white, padding: sp(6), borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], ...shadow.sm },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(4) },
  panelTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  panelSub: { fontSize: 14, lineHeight: 20, color: colors.slate[500], marginTop: sp(1) },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: sp(2), paddingHorizontal: sp(3), paddingVertical: sp(2), borderRadius: 14, overflow: 'hidden' },
  addBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.white },
  mainPhoto: { marginTop: sp(4), borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], height: 224 },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoEmptyText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[400] },
  thumb: { height: 80, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50] },
  thumbMain: { borderColor: colors.slate[900], boxShadow: `0 0 0 2px ${colors.slate[200]}` },
  thumbLabel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: sp(1), paddingVertical: 2, overflow: 'hidden' },
  thumbLabelText: { fontSize: 10, lineHeight: 14, fontWeight: '600', color: colors.white },
  removeBtn: {
    position: 'absolute',
    right: sp(1),
    top: sp(1),
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.white, 0.95),
    ...shadow.sm,
  },
  menuThumb: { height: 96, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50] },
  menuEmpty: {
    marginTop: sp(4),
    height: 112,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[300],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  // dining controls
  controls: { marginBottom: sp(6), borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: sp(5), ...shadow.sm },
  controlsEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 2.6, color: colors.slate[400] },
  controlsTitle: { marginTop: sp(1), fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900] },
  controlsSub: { marginTop: sp(1), fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp(4), marginBottom: sp(8) },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
  },
  stateDot: { width: 10, height: 10, borderRadius: 5 },
  stateText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[700] },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
  },
  switchLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[700] },
  switchTrack: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center' },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, ...shadow.DEFAULT },
  block: { marginTop: sp(8), borderTopWidth: 1, borderTopColor: colors.slate[100], paddingTop: sp(6) },
  blockLabelRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginBottom: sp(4) },
  blockLabel: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
  noCats: {
    paddingVertical: sp(10),
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.slate[100],
    borderRadius: 16,
    backgroundColor: alpha(colors.slate[50], 0.5),
  },
  noCatsText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[400], textAlign: 'center' },
  catCard: { alignItems: 'center', padding: sp(4), borderRadius: 16, borderWidth: 2 },
  catCardOn: { borderColor: PRIMARY, backgroundColor: alpha(PRIMARY, 0.05), transform: [{ scale: 1.02 }], ...shadow.md },
  catCardOff: { borderColor: colors.slate[100], backgroundColor: colors.white },
  catImage: { width: 64, height: 64, borderRadius: 16, marginBottom: sp(3), overflow: 'hidden', borderWidth: 1, ...shadow.sm },
  catImageOn: { borderColor: alpha(PRIMARY, 0.2), transform: [{ scale: 1.05 }] },
  catImageOff: { backgroundColor: colors.white, borderColor: colors.slate[100] },
  catImageEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.slate[50] },
  catName: { fontSize: 13, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  catCheck: { position: 'absolute', top: sp(2), right: sp(2), backgroundColor: PRIMARY, borderRadius: 9999, padding: sp(1), ...shadow.sm },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900], marginBottom: sp(1) },
  fieldHint: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.slate[500], marginBottom: sp(3) },
  fieldLabelPlain: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
  fieldHintPlain: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.slate[500] },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  chip: { paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: 9999, borderWidth: 1 },
  chipOff: { borderColor: colors.slate[200], backgroundColor: colors.white },
  chipPrimaryOn: { borderColor: PRIMARY, backgroundColor: alpha(PRIMARY, 0.1) },
  chipGreenOn: { borderColor: colors.emerald[500], backgroundColor: colors.emerald[50] },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  costInput: {
    width: 192,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[200],
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[900],
  },
  inputFocus: { borderColor: restaurantTheme.focusBorder, boxShadow: `0 0 0 3px ${alpha(restaurantTheme.primary, 0.15)}` },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: sp(6) },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(4),
    backgroundColor: alpha(colors.slate[100], 0.8),
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.white, ...shadow.sm },
  stepBtnText: { fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.slate[600] },
  stepValue: { width: 32, textAlign: 'center', fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[800] },
  saveBtn: { borderRadius: 9999, paddingHorizontal: sp(10), paddingVertical: sp(4), alignItems: 'center', overflow: 'hidden', ...shadow.xl },
  saveText: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.white, letterSpacing: 1.4 },
  pendingNote: {
    marginTop: sp(6),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.amber[200],
    backgroundColor: restaurantTheme.primarySoft,
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
  },
  pendingText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.amber[800] },
  msgBox: { marginTop: sp(4), borderRadius: 14, borderWidth: 1, paddingHorizontal: sp(4), paddingVertical: sp(3) },
  msgText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  // queue
  queueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(2) },
  queueTitle: { flexShrink: 1, fontWeight: '700', color: colors.slate[800] },
  viewWrap: { flexDirection: 'row', alignItems: 'center', gap: sp(2), borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[200], padding: sp(1) },
  viewBtn: { paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: 10, overflow: 'hidden' },
  viewText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  newBanner: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.amber[200],
    backgroundColor: restaurantTheme.primarySoft,
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
  },
  newBannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.amber[800] },
  bookingCard: { backgroundColor: colors.white, borderRadius: 16, padding: sp(4), borderWidth: 1, borderColor: colors.slate[100], ...shadow.sm },
  bookingCardNew: { borderWidth: 2, borderColor: colors.amber[400], padding: sp(4) - 1 },
  bookingHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: sp(4), gap: sp(2) },
  bookingWho: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flexShrink: 1 },
  bookingAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bookingAvatarText: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.white },
  bookingName: { fontSize: 16, lineHeight: 18, fontWeight: '900', color: colors.slate[900] },
  bookingId: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400], marginTop: sp(1), letterSpacing: 1 },
  badge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontSize: 9, lineHeight: 14, fontWeight: '900', letterSpacing: 0.5 },
  infoBox: { padding: sp(3), backgroundColor: colors.slate[50], borderRadius: 14, marginBottom: sp(4) },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  infoText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[700] },
  specialBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp(2),
    padding: sp(3),
    backgroundColor: colors.blue[50],
    borderRadius: 14,
    marginBottom: sp(4),
    borderWidth: 1,
    borderColor: colors.blue[100],
  },
  specialText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.blue[700] },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center', overflow: 'hidden' },
  declineBtn: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.rose[200] },
  actionTextWhite: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.white, letterSpacing: 1.2 },
  actionTextDecline: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.slate[600], letterSpacing: 1.2 },
  emptyCard: { backgroundColor: colors.white, borderRadius: 24, padding: sp(16), alignItems: 'center', borderWidth: 1, borderColor: colors.slate[100], ...shadow.sm },
  emptyIcon: { backgroundColor: colors.slate[50], width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: sp(6) },
  emptyTitle: { fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.slate[800], textAlign: 'center' },
  emptySub: { color: colors.slate[500], marginTop: sp(2), maxWidth: 320, textAlign: 'center' },
});
