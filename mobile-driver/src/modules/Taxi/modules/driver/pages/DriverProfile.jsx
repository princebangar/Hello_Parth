// Web: modules/Taxi/modules/driver/pages/DriverProfile.jsx — the Profile / Account tab of the driver (/taxi/driver/profile)
// and the owner (/taxi/owner/profile): blue hero with the photo, rating, details card (phone, email, city, zone, colour,
// vehicle) and the menu (fleet management for an owner, account pages, benefits, legal & support, settings, log out).
// API: GET /drivers/me (getCurrentDriver), PATCH /drivers/me (updateDriverProfile, route booking toggle).
// Log out = the web's: clearDriverAuthState() (registration session, online cache, driver token / role / chatRole in
// storage) and replace to <prefix>/login; no API call.
// Native: a kept-alive bottom-bar tab (driverTabPages.js). The web loaded the driver on mount (every visit); here it is
// loaded again each time the tab becomes active (the old profile stays on screen). Pull-to-refresh reloads it.
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  User,
  Car,
  Bell,
  History,
  UserPlus,
  ChevronRight,
  Wallet,
  Gift,
  Award,
  Headset,
  IdCard,
  Lock,
  ReceiptText,
  ScrollText,
  ShieldAlert,
  Settings as SettingsIcon,
  Power,
  Mail,
  Phone,
  X,
  Landmark,
  MapPin,
  MapPinned,
  Hash,
  Palette,
  ChevronLeft,
  Pencil,
  Star,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { AppImage, Sheet, StatusBarScrim, Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import UserLogoutConfirmDialog from '@/shared/components/UserLogoutConfirmDialog.jsx';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import useBodyScrollLock from '../../../shared/hooks/useBodyScrollLock';
import { clearDriverAuthState, getCurrentDriver, readDriverCache, updateDriverProfile } from '../services/registrationService';
import { useDriverTabActive } from '../driverTabPages';

// Same placeholder photo as the Food user and delivery profiles.
const DEFAULT_AVATAR = require('../../../../../assets/public/images/profile_avatar.webp');

// One calm grey chip behind every menu icon (same look the Food profile always had).
const ICON_CHIP_BG = colors.slate[100];
const ICON_CHIP_FG = colors.slate[600];

const unwrapDriver = (response) => response?.data?.data || response?.data || response || null;
const ROUTE_BOOKING_STORAGE_KEY = 'driver_route_booking_preferences';

const readRouteBookingPreferences = () => {
  try {
    const raw = localStorage.getItem(ROUTE_BOOKING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, coordinates: null, label: '' };
  } catch {
    return { enabled: false, coordinates: null, label: '' };
  }
};

const writeRouteBookingPreferences = (nextValue) => {
  localStorage.setItem(ROUTE_BOOKING_STORAGE_KEY, JSON.stringify(nextValue));
  return nextValue;
};

const formatRouteBookingLabel = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return 'Receive requests from your selected area';
  }

  const [lng, lat] = coordinates;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return 'Receive requests from your selected area';
  }

  return `On - requests near the spot you pinned (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`;
};

const normalizeRouteBookingPreferences = (routeBooking = null) => {
  const coordinates = Array.isArray(routeBooking?.coordinates) && routeBooking.coordinates.length === 2
    ? routeBooking.coordinates
    : null;

  return {
    enabled: Boolean(routeBooking?.enabled && coordinates),
    coordinates,
    label: String(routeBooking?.label || (coordinates ? formatRouteBookingLabel(coordinates) : '')).trim(),
    updatedAt: routeBooking?.updatedAt || null,
  };
};

const normalizeBankDetails = (bankDetails = {}) => ({
  accountHolderName: String(bankDetails?.accountHolderName || '').trim(),
  upiId: String(bankDetails?.upiId || '').trim(),
  qrCodeImage: String(bankDetails?.qrCodeImage || '').trim(),
  accountNumber: String(bankDetails?.accountNumber || '').trim(),
  ifsc: String(bankDetails?.ifsc || '').trim().toUpperCase(),
  branchName: String(bankDetails?.branchName || '').trim(),
  updatedAt: bankDetails?.updatedAt || null,
});

const icon = (Icon) => <Icon size={20} color={ICON_CHIP_FG} />;

const DriverProfile = () => {
  const tabScrollRef = useRef(null);
  useTabScrollTop(tabScrollRef);
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const tabActive = useDriverTabActive();
  const { height: windowHeight } = useWindowDimensions();
  const [routeBookingPreferences, setRouteBookingPreferences] = useState(() => readRouteBookingPreferences());
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [leaving, setLeaving] = useState(false); // signed out: the popup goes away at once, no fade over the login screen
  // The top of the page (photo, details, first list) is drawn first; the rest of the list follows a frame later,
  // so opening Profile does not wait for the whole long page.
  const [showFullList, setShowFullList] = useState(false);
  useEffect(() => {
    let timer = null;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setShowFullList(true), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  const [legalModal, setLegalModal] = useState(null);
  // The page behind the policy sheet must not scroll while it is open.
  useBodyScrollLock(Boolean(legalModal));
  // Home already loaded the driver: show it at once, refresh quietly.
  const [driver, setDriver] = useState(() => readDriverCache('me') || null);
  const [isLoading, setIsLoading] = useState(() => !readDriverCache('me'));
  const [error, setError] = useState('');
  const [routeBookingBusy, setRouteBookingBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const role = localStorage.getItem('role') || 'driver';
  const isOwner = role === 'owner';
  const routePrefix = isOwner ? '/taxi/owner' : '/taxi/driver';

  const loadDriver = useCallback(async (isActive = () => true) => {
    setError('');

    try {
      const response = await getCurrentDriver();
      if (!isActive()) return;
      const nextDriver = unwrapDriver(response);
      setDriver(nextDriver);
      const nextRouteBooking = normalizeRouteBookingPreferences(nextDriver?.routeBooking);
      setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
    } catch (err) {
      if (!isActive()) return;
      setError(err?.message || 'Unable to load driver profile');
    } finally {
      if (isActive()) {
        setIsLoading(false);
      }
    }
  }, []);

  // web: on mount (every visit) -> here: every time the tab is shown
  useEffect(() => {
    if (!tabActive) return undefined;
    let active = true;
    loadDriver(() => active);
    return () => {
      active = false;
    };
  }, [tabActive, loadDriver]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadDriver();
    } finally {
      setRefreshing(false);
    }
  };

  const openLegal = (type) => {
    const contentMap = {
      terms: {
        title: 'Terms and Conditions',
        Icon: ScrollText,
        description: 'General rules for using the Hello Parth platform.',
        content: `By using the Hello Parth platform, you agree to comply with all applicable transport regulations and our safety standards.

Key Highlights:
• Professionalism: Drivers and Staff must maintain a high standard of service.
• Vehicle Readiness: All vehicles listed must be in active, roadworthy condition.
• Compliance: You must ensure all permits and insurance are valid.
• Platform Fees: Hello Parth charges a service fee for every successful booking handled.
• Account Security: You are responsible for keeping your credentials and biometric data secure.`,
      },
      privacy: {
        title: 'Privacy Policy',
        Icon: Lock,
        description: 'How we handle your data and biometrics.',
        content: `Hello Parth takes data security seriously. We collect specific information to ensure safety and service quality.

Data Collected:
• Biometrics: Fingerprint hashes are stored encrypted (AES-256) for verification only. Raw images are never stored permanently.
• Location: Live GPS tracking is used during active bookings for safety.
• Contact: Phone and email are used for booking updates and support.
• Vehicle Data: Inspection logs and photos are kept for insurance purposes.

We do not share your biometric data with third-party advertising networks.`,
      },
      refund: {
        title: 'Refund Policy',
        Icon: ReceiptText,
        description: 'Cancellation and refund guidelines.',
        content: `Transparent refund rules for customers and partners.

Booking Cancellations:
• Customer-initiated: Refund varies based on how close the pickup time is.
• Operator-initiated: If a vehicle fails inspection, a full refund is processed to the customer.
• Service Center Fees: Fees for inspections are non-refundable once the inspection report is generated.

Processing Time: Refunds are typically credited back to the original payment method within 5-7 working days.`,
      },
    };
    setLegalModal(contentMap[type]);
  };

  const handleLogout = () => {
    clearDriverAuthState();
    setLeaving(true);
    setIsLogoutOpen(false);
    navigate(`${routePrefix}/login`, { replace: true });
  };

  // Dynamic Section Data with Project-mapped Paths
  const driverName = useMemo(() => {
    if (!driver?.name) return 'Driver';
    return String(driver.name);
  }, [driver?.name]);

  const driverPhone = useMemo(() => driver?.phone || 'N/A', [driver?.phone]);
  const driverEmail = useMemo(() => driver?.email || 'N/A', [driver?.email]);
  const driverVehicle = useMemo(() => {
    const parts = [driver?.registerFor, driver?.vehicleType].filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : 'N/A';
  }, [driver?.registerFor, driver?.vehicleType]);
  const driverLocation = useMemo(() => driver?.city || 'N/A', [driver?.city]);
  const driverZone = useMemo(() => driver?.zone?.name || 'N/A', [driver?.zone?.name]);
  const driverNumber = useMemo(() => driver?.vehicleNumber || 'N/A', [driver?.vehicleNumber]);
  const driverColor = useMemo(() => driver?.vehicleColor || 'N/A', [driver?.vehicleColor]);
  const driverRating = useMemo(() => Number(driver?.rating || 0), [driver?.rating]);
  const bankDetails = useMemo(() => normalizeBankDetails(driver?.bankDetails), [driver?.bankDetails]);
  const bankDetailsSubtitle = useMemo(() => {
    if (bankDetails.accountHolderName) return bankDetails.accountHolderName;
    if (bankDetails.upiId) return bankDetails.upiId;
    if (bankDetails.accountNumber) return `A/C ${bankDetails.accountNumber.slice(-4).padStart(bankDetails.accountNumber.length, '*')}`;
    return 'Add UPI, QR and bank account';
  }, [bankDetails.accountHolderName, bankDetails.accountNumber, bankDetails.upiId]);

  const hasProfileImage = Boolean(driver?.profileImage);
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => {
    setAvatarBroken(false);
  }, [driver?.profileImage]);
  const avatarSrc = hasProfileImage && !avatarBroken ? driver.profileImage : DEFAULT_AVATAR;

  const openBankDetails = () => {
    navigate(`${routePrefix}/profile/bank-details`);
  };

  const handleRouteBookingToggle = async () => {
    if (routeBookingBusy) {
      return;
    }

    if (routeBookingPreferences.enabled) {
      setRouteBookingBusy(true);
      setError('');
      try {
        const response = await updateDriverProfile({
          routeBooking: {
            enabled: false,
          },
        });
        const nextRouteBooking = normalizeRouteBookingPreferences(
          unwrapDriver(response)?.routeBooking || { enabled: false },
        );
        setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Could not update route booking.');
      } finally {
        setRouteBookingBusy(false);
      }
      return;
    }

    if (!navigator.geolocation) {
      setError('Location is not available on this device.');
      return;
    }

    setRouteBookingBusy(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextCoordinates = [position.coords.longitude, position.coords.latitude];
        const nextLabel = formatRouteBookingLabel(nextCoordinates);

        try {
          const response = await updateDriverProfile({
            routeBooking: {
              enabled: true,
              coordinates: nextCoordinates,
              label: nextLabel,
            },
          });
          const nextRouteBooking = normalizeRouteBookingPreferences(
            unwrapDriver(response)?.routeBooking || {
              enabled: true,
              coordinates: nextCoordinates,
              label: nextLabel,
            },
          );
          setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
        } catch (err) {
          setError(err?.response?.data?.message || err?.message || 'Could not update route booking.');
        } finally {
          setRouteBookingBusy(false);
        }
      },
      () => {
        setRouteBookingBusy(false);
        setError('Please allow location permission to enable route booking.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const sections = [
    ...(isOwner ? [{
      title: 'Fleet Management',
      items: [
        { id: 'fleet', label: 'Manage Fleet', icon: icon(Car), path: `${routePrefix}/vehicle-fleet` },
        { id: 'drivers', label: 'Manage Drivers', icon: icon(UserPlus), path: `${routePrefix}/manage-drivers` },
      ],
    }] : []),
    {
      title: 'Your Account',
      items: [
        { id: 'personal', label: 'Personal Information', sub: 'Name, phone, email, photo', icon: icon(User), path: `${routePrefix}/edit-profile` },
        { id: 'wallet', label: 'Wallet', sub: 'Balance and earnings', icon: icon(Wallet), path: `${routePrefix}/wallet` },
        { id: 'bankDetails', label: 'Bank Details', sub: bankDetailsSubtitle, icon: icon(Landmark), action: openBankDetails },
        ...(!isOwner ? [
          { id: 'vehicle', label: 'My Vehicle', sub: 'Your vehicle details', icon: icon(Car), path: `${routePrefix}/vehicle-fleet` },
        ] : []),
        { id: 'docs', label: 'Documents', sub: 'Your uploaded documents', icon: icon(IdCard), path: `${routePrefix}/documents` },
        { id: 'history', label: 'Ride History', sub: 'Your past trips', icon: icon(History), path: `${routePrefix}/history` },
        { id: 'notifications', label: 'Notifications', sub: 'Alerts and updates', icon: icon(Bell), path: `${routePrefix}/notifications` },
      ],
    },
    {
      title: 'Benefits',
      items: [
        { id: 'refer', label: 'Refer & Earn', icon: icon(Gift), path: `${routePrefix}/referral` },
        ...(!isOwner ? [{ id: 'incentives', label: 'Incentives', icon: icon(Award), path: `${routePrefix}/incentives` }] : []),
        ...(!isOwner ? [{ id: 'sos', label: 'Emergency SOS', icon: icon(ShieldAlert), path: `${routePrefix}/security` }] : []),
      ],
    },
    {
      title: 'Legal & Support',
      continues: true,
      items: [
        { id: 'help', label: 'Help & Support', icon: icon(Headset), path: `${routePrefix}/help-support` },
        { id: 'terms', label: 'Terms & Conditions', icon: icon(ScrollText), action: () => openLegal('terms') },
        { id: 'privacy', label: 'Privacy Policy', icon: icon(Lock), action: () => openLegal('privacy') },
        { id: 'refund', label: 'Refund Policy', icon: icon(ReceiptText), action: () => openLegal('refund') },
      ],
    },
    {
      title: '',
      items: [
        { id: 'settings', label: 'Settings', icon: icon(SettingsIcon), path: `${routePrefix}/settings` },
        { id: 'logout', label: 'Log out', icon: icon(Power), action: () => setIsLogoutOpen(true) },
      ],
    },
  ];

  const infoRows = [
    [
      { label: 'Phone', value: driverPhone, Icon: Phone },
      { label: 'Email', value: driverEmail, Icon: Mail },
    ],
    [
      { label: 'City', value: driverLocation, Icon: MapPin },
      { label: 'Zone', value: driverZone, Icon: MapPinned },
      { label: 'Color', value: driverColor, Icon: Palette },
    ],
    [
      { label: 'Vehicle Type', value: driverVehicle, Icon: Car },
      { label: 'Vehicle No.', value: driverNumber, Icon: Hash },
    ],
  ];

  const LegalIcon = legalModal?.Icon;
  // the hero scrolls away under the (light) status bar icons: a blue strip appears once the page has scrolled
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (e) => {
    const next = e.nativeEvent.contentOffset.y > 4;
    if (next !== scrolled) setScrolled(next);
  };

  return (
    <View style={styles.root}>
      {tabActive ? <StatusBar style="light" /> : null}
      <ScrollView ref={tabScrollRef}
        style={styles.flex1}
        contentContainerStyle={{ paddingBottom: bottomSpace }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue[600]]} tintColor={colors.white} progressViewOffset={insets.top} />}
      >
        {/* Hero: blue gradient with a soft swoosh and a wave edge; the photo sits on the wave (reference design) */}
        <View style={styles.hero}>
          {/* linear-gradient(110deg, #0e2a7a 0%, #1e4fd0 52%, #3d84f5 100%) */}
          <LinearGradient
            colors={['#0e2a7a', '#1e4fd0', '#3d84f5']}
            locations={[0, 0.52, 1]}
            start={{ x: 0, y: 0.32 }}
            end={{ x: 1, y: 0.68 }}
            style={StyleSheet.absoluteFill}
          />
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 160" preserveAspectRatio="none" pointerEvents="none">
            <Path d="M190 0 C230 40 262 70 330 80 C370 86 390 96 400 110 L400 0 Z" fill="rgba(255,255,255,0.10)" />
            <Path d="M290 0 C300 30 332 50 400 52 L400 0 Z" fill="rgba(255,255,255,0.08)" />
          </Svg>
          <View style={[styles.heroRow, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={() => navigate(-1)}
              style={({ pressed }) => [styles.heroBack, pressed ? styles.pressed90 : null]}
              accessibilityLabel="Back"
            >
              <ChevronLeft size={28} strokeWidth={2.2} color={colors.white} />
            </Pressable>
            <View style={styles.heroTitles}>
              <Text style={styles.heroTitle}>Profile</Text>
              <Text style={styles.heroSub}>Your information, your way</Text>
            </View>
          </View>
          {/* The white runs 1px past the hero's bottom: two anti-aliased edges on the same fractional pixel left a
              hairline behind the name on phones. */}
          <Svg style={styles.wave} viewBox="0 0 400 56" preserveAspectRatio="none" pointerEvents="none">
            <Path d="M0 56 V30 C70 22 150 30 230 26 C305 22 355 6 400 0 V56 Z" fill="rgba(255,255,255,0.28)" />
            <Path d="M0 56 V40 C80 32 160 44 240 36 C310 29 360 18 400 12 V56 Z" fill="#ffffff" />
          </Svg>
        </View>

        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <AppImage
                src={avatarSrc}
                fallback={DEFAULT_AVATAR}
                onError={() => setAvatarBroken(true)}
                style={styles.avatar}
                accessibilityLabel={driverName}
              />
            </View>
            <Pressable
              onPress={() => navigate(`${routePrefix}/edit-profile`)}
              accessibilityLabel="Edit profile"
              style={({ pressed }) => [styles.editWrap, pressed ? styles.pressed90 : null]}
            >
              <LinearGradient colors={['#1d4ed8', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editBtn}>
                <Pencil size={14} strokeWidth={2.5} color={colors.white} />
              </LinearGradient>
            </Pressable>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={1}>
              {isLoading ? 'Loading...' : driverName}
            </Text>
            <View style={styles.ratingRow}>
              <Star size={15} color={colors.amber[400]} fill={colors.amber[400]} />
              <Text style={styles.ratingText}>{driverRating > 0 ? `${driverRating.toFixed(1)} Rating` : 'New - no ratings yet'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          {error ? (
            <Text style={styles.infoError}>{error}</Text>
          ) : (
            infoRows.map((row, rowIndex) => (
              <View key={rowIndex} style={[styles.infoRow, rowIndex > 0 ? styles.infoRowBorder : null]}>
                {row.map(({ label, value, Icon }, cellIndex) => {
                  // first row: the email gets the wider half, so it fits on 360px phones too
                  const flex = row.length === 3 ? 1 : rowIndex === 0 ? (cellIndex === 0 ? 0.82 : 1.18) : 1;
                  return (
                    <View key={label} style={[styles.infoCell, { flex }, cellIndex > 0 ? styles.infoCellBorder : null]}>
                      <View style={styles.infoIcon}>
                        <Icon size={15} color={ICON_CHIP_FG} />
                      </View>
                      <View style={styles.minW0}>
                        <Text style={styles.infoLabel}>{label}</Text>
                        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>

        {/* List Menu */}
        <View style={styles.menu}>
          {(showFullList ? sections : sections.slice(0, 1)).map((section, sIdx) => (
            <View key={sIdx} style={section.title ? styles.sectionPad : null}>
              {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
              <View>
                {section.items.map((item, itemIndex) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      if (item.action) item.action();
                      else if (item.path) navigate(item.path, item.state ? { state: item.state } : undefined);
                    }}
                    style={({ pressed }) => [styles.item, pressed && item.type !== 'toggle' ? styles.itemPressed : null]}
                  >
                    <View style={styles.itemIcon}>{item.icon}</View>
                    {/* the divider starts at the text, like the reference */}
                    <View
                      style={[
                        styles.itemBody,
                        itemIndex < section.items.length - 1 || (section.continues && showFullList) ? styles.itemDivider : null,
                      ]}
                    >
                      <View style={styles.minW0}>
                        <Text style={styles.itemLabel}>{item.label}</Text>
                        {item.sub ? <Text style={styles.itemSub} numberOfLines={1}>{item.sub}</Text> : null}
                      </View>
                      {item.type === 'toggle' ? (
                        <Pressable
                          onPress={handleRouteBookingToggle}
                          disabled={routeBookingBusy}
                          style={[
                            styles.toggle,
                            { backgroundColor: routeBookingPreferences.enabled ? driverTheme.button : colors.slate[200] },
                            routeBookingBusy ? styles.dim70 : null,
                          ]}
                        >
                          <View style={[styles.toggleKnob, { left: routeBookingPreferences.enabled ? 20 : 2 }]} />
                        </Pressable>
                      ) : (
                        <ChevronRight size={18} color={colors.slate[400]} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <UserLogoutConfirmDialog
        animateOut={!leaving}
        open={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        onConfirm={handleLogout}
        iconBgStyle={{ backgroundColor: alpha(colors.blue[600], 0.1) }}
        iconColor={colors.blue[600]}
        confirmButtonStyle={{ backgroundColor: colors.blue[600] }}
      />

      {/* Legal Modal (data-driver-overlay: covers the bottom bar) */}
      <Sheet
        open={Boolean(legalModal)}
        onClose={() => setLegalModal(null)}
        backdropOpacity={0.45}
        style={[styles.legalSheet, { paddingBottom: 32 + insets.bottom }]}
      >
        {legalModal ? (
          <View style={styles.legalCard}>
            <View style={styles.legalHead}>
              <View style={styles.legalIcon}>
                <LegalIcon size={28} color={colors.slate[900]} />
              </View>
              <Pressable onPress={() => setLegalModal(null)} style={styles.legalClose} accessibilityLabel="Close">
                <X size={20} color={colors.slate[500]} />
              </Pressable>
            </View>

            <View style={styles.legalTitles}>
              <Text style={styles.legalTitle}>{legalModal.title}</Text>
              <Text style={styles.legalDesc}>{legalModal.description}</Text>
            </View>

            <ScrollView style={[styles.legalScroll, { maxHeight: windowHeight * 0.4 }]} contentContainerStyle={styles.legalScrollContent}>
              <Text style={styles.legalBody}>{legalModal.content}</Text>
            </ScrollView>

            {/* bg-slate-950 button: the partner blue on the web (forced) */}
            <Pressable
              onPress={() => setLegalModal(null)}
              style={({ pressed }) => [styles.legalBtn, pressed ? styles.pressed95 : null]}
            >
              <Text style={styles.legalBtnText}>Understood</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
      {scrolled ? <StatusBarScrim color="#1e4fd0" /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex1: { flex: 1 },
  minW0: { minWidth: 0, flexShrink: 1 },
  pressed90: { transform: [{ scale: 0.9 }] },
  pressed95: { transform: [{ scale: 0.95 }] },
  dim70: { opacity: 0.7 },
  hero: { position: 'relative' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingBottom: 56 },
  heroBack: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroTitles: { paddingTop: 2 },
  heroTitle: { fontSize: 28, lineHeight: 35, fontWeight: '700', color: colors.white },
  heroSub: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '500', color: alpha(colors.white, 0.85) },
  wave: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 56, width: '100%' },
  identity: { zIndex: 10, marginTop: -42, flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingHorizontal: 20 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.white,
    padding: 4,
    elevation: 8,
    shadowColor: '#0e2a7a',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  avatar: { width: '100%', height: '100%', borderRadius: 44 },
  editWrap: { position: 'absolute', bottom: 4, right: 0, borderRadius: 16, ...shadow.md },
  editBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, minWidth: 0, paddingTop: 44 },
  name: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#0f1b4c' },
  ratingRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: colors.slate[500] },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 22,
    backgroundColor: colors.white,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.slate[100],
    elevation: 6,
    shadowColor: '#0e2a7a',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
  },
  infoError: { padding: 12, fontSize: 11, lineHeight: 16, fontWeight: '500', color: colors.rose[500] },
  infoRow: { flexDirection: 'row' },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: colors.slate[100] },
  infoCell: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, paddingHorizontal: 10, paddingVertical: 12 },
  infoCellBorder: { borderLeftWidth: 1, borderLeftColor: colors.slate[100] },
  infoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: ICON_CHIP_BG, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoLabel: { fontSize: 10, lineHeight: 14, fontWeight: '500', color: colors.slate[400] },
  infoValue: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[900] },
  menu: { gap: 4 },
  sectionPad: { paddingTop: 24 },
  sectionTitle: { paddingHorizontal: 24, marginBottom: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.92, color: '#5a6b8f' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 24, paddingRight: 20 },
  itemPressed: { backgroundColor: '#F5F8FF' },
  itemIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: ICON_CHIP_BG, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemBody: { flex: 1, minWidth: 0, minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: colors.slate[100] },
  itemLabel: { fontSize: 15, lineHeight: 22, fontWeight: '600', letterSpacing: -0.375, color: '#0f1b4c' },
  itemSub: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.slate[400] },
  toggle: { width: 40, height: 22, borderRadius: 11 },
  toggleKnob: { position: 'absolute', top: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.white, ...shadow.sm },
  legalSheet: { backgroundColor: 'transparent', paddingHorizontal: 16, overflow: 'visible' },
  legalCard: { width: '100%', borderRadius: 32, backgroundColor: colors.white, padding: 32, overflow: 'hidden', ...shadow['2xl'] },
  legalHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  legalIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.slate[50], borderWidth: 1, borderColor: colors.slate[100], alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  legalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  legalTitles: { marginTop: 24 },
  legalTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.slate[950] },
  legalDesc: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[500] },
  legalScroll: { marginTop: 32 },
  legalScrollContent: { paddingRight: 8 },
  legalBody: { fontSize: 14, lineHeight: 28, fontWeight: '500', color: colors.slate[700] },
  legalBtn: { marginTop: 32, width: '100%', borderRadius: 16, paddingVertical: 16, backgroundColor: driverTheme.button, alignItems: 'center', ...shadow.xl },
  legalBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.white },
});

export default DriverProfile;
