// Web: modules/Taxi/modules/user/pages/Profile.jsx — Taxi profile: header, hero card with trips / rating / credits and
// the grouped menu, Appearance picker and the shared logout confirmation (Taxi blue).
// APIs: userAuthService.getCurrentUser (GET /users/me), getWallet (GET /users/wallet), GET /rides?page=1&limit=1.
// Scroll position is saved in sessionStorage (taxiProfileScrollPos) and restored on back, like the web.
import { StatusBarScrim } from '@/native/ui/StatusBarScrim';
import { useBottomNavSpace } from '@/native/ui/useBottomNavSpace';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Wallet,
  Bell,
  ShieldAlert,
  Power,
  ChevronRight,
  Headset,
  ScrollText,
  Lock,
  ReceiptText,
  MapPin,
  Star,
  Package,
  Gift,
  Tag,
  BusFront,
  ArrowLeft,
  History,
  Phone,
  Palette,
  Settings,
} from 'lucide-react-native';
import { useNavigate, useNavigationType, router } from '@/lib/router';
import { AppImage, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';

import { clearLocalUserSession, getLocalUserToken, userAuthService } from '../services/authService';
import { clearCurrentRide } from '../services/currentRideService';
import { socketService } from '../../../shared/api/socket';
import api from '../../../shared/api/axiosInstance';
import { useUserTheme, useUserPalette, USER_SHADOW } from '../../../shared/context/UserThemeContext';
import UserAppearanceDialog from '@/shared/components/UserAppearanceDialog.jsx';
import UserLogoutConfirmDialog from '@/shared/components/UserLogoutConfirmDialog.jsx';
import { preloadAuthApp } from '@/shared/utils/preloadLogin.js';
import { logoutWithTransition } from '@/shared/utils/logoutTransition.js';
import useReferralEnabled from '@/shared/hooks/useReferralEnabled';
import NumberSkeleton from '@/shared/components/NumberSkeleton';
// Same placeholder photo as the Food user profile (one account across the app).
import DEFAULT_AVATAR from '../../../../../assets/public/images/profile_avatar.webp';

const pickObject = (...values) => values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {};

// A number saved by an earlier visit, or null when there is none yet (the stat then shows a skeleton, not a fake 0).
const storedNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

// Grouped into headed sections like Food's profile — the first group stays unlabeled.
const menuSections = [
  {
    heading: null,
    items: [
      { icon: MapPin, title: 'Saved Addresses', sub: 'Home, office & others', path: '/taxi/user/profile/addresses' },
      { icon: Wallet, title: 'My Wallet', sub: 'Balance & transactions', path: '/taxi/user/wallet' },
      // Same shared appearance picker Food uses — no `path`, handled via id.
      { id: 'appearance', icon: Palette, title: 'Appearance', sub: 'Light' },
    ],
  },
  {
    heading: 'My Activity',
    items: [
      { icon: History, title: 'My Rides', sub: 'Rides, parcels & trips', path: '/taxi/user/activity' },
      { icon: BusFront, title: 'Bus Tickets', sub: 'Manage bus bookings', path: '/taxi/user/profile/bus-bookings' },
      { icon: Package, title: 'Subscriptions', sub: 'Ride plans & credits', path: '/taxi/user/profile/subscriptions' },
    ],
  },
  {
    heading: 'Rewards',
    items: [
      { icon: Gift, title: 'Refer & Earn', sub: 'Invite friends & get rewards', path: '/taxi/user/referral' },
      { icon: Tag, title: 'Promo Codes', sub: 'Offers you can use on a booking', path: '/taxi/user/promo' },
    ],
  },
  {
    heading: 'More',
    items: [
      { icon: Bell, title: 'Notifications', sub: 'Offers & alerts', path: '/taxi/user/profile/notifications' },
      { icon: ShieldAlert, title: 'Security & SOS', sub: 'Trust & safety settings', path: '/taxi/safety/sos' },
      { icon: Headset, title: 'Help & Support', sub: 'Help center & tickets', path: '/taxi/user/support/tickets' },
      { icon: ScrollText, title: 'Terms & Conditions', sub: 'Read service terms', path: '/user/terms' },
      { icon: Lock, title: 'Privacy Policy', sub: 'How your data is handled', path: '/user/privacy' },
      { icon: ReceiptText, title: 'Refund Policy', sub: 'Refunds and cancellations', path: '/food/user/profile/refund' },
      // Settings hub (Edit Profile + Delete Account) — directly above Log out.
      { icon: Settings, title: 'Settings', sub: 'Edit profile & account', path: '/taxi/user/profile/settings' },
      { id: 'logout', icon: Power, title: 'Log out', sub: 'Sign out of your account' },
    ],
  },
];

const Profile = () => {
  const bottomNavSpace = useBottomNavSpace(34);
  const navigate = useNavigate();
  // Back to the screen Profile was opened from; opened directly: Home.
  const goBack = () => {
    if (router.canGoBack()) navigate(-1);
    else navigate('/taxi/user');
  };
  const navType = useNavigationType();
  const { theme } = useUserTheme();
  const p = useUserPalette();
  const referralEnabled = useReferralEnabled();
  const scrollRef = useRef(null);
  // Global admin can switch the referral system off: its menu row disappears (and an emptied group with it).
  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => referralEnabled || item.path !== '/taxi/user/referral'),
    }))
    .filter((section) => section.items.length > 0);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false); // log-out confirmed: the popup goes at once
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Seed from what login already stored, so name/phone show immediately.
  const [profile, setProfile] = useState(() => {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
    } catch {
      stored = {};
    }
    return {
      name: stored?.name || '',
      phone: stored?.phone || '',
      profileImage: stored?.profileImage || '',
      // last known stats (saved below after every load) show at once; null = never loaded -> skeleton
      stats: {
        trips: storedNumber(stored?.totalRides),
        rating: storedNumber(stored?.rating),
        wallet: storedNumber(stored?.walletBalance),
      },
    };
  });

  // Coming back (POP) restores the saved scroll position; a fresh open starts at the top.
  useEffect(() => {
    if (navType === 'POP') {
      const savedScroll = sessionStorage.getItem('taxiProfileScrollPos');
      if (savedScroll) {
        const t = setTimeout(() => scrollRef.current?.scrollTo?.({ y: parseInt(savedScroll, 10), animated: false }), 50);
        return () => clearTimeout(t);
      }
    } else {
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    }
    return undefined;
  }, [navType]);

  const handleScroll = (e) => {
    sessionStorage.setItem('taxiProfileScrollPos', String(Math.round(e.nativeEvent.contentOffset.y)));
  };

  useEffect(() => {
    const token = getLocalUserToken();

    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      try {
        let stored = {};
        try {
          stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
        } catch {
          stored = {};
        }

        const [profileResponse, walletResponse, ridesResponse] = await Promise.allSettled([
          userAuthService.getCurrentUser(),
          userAuthService.getWallet(),
          api.get('/rides', { params: { page: 1, limit: 1 } }),
        ]);

        const profilePayload = profileResponse.status === 'fulfilled' ? profileResponse.value : {};
        const walletPayload = walletResponse.status === 'fulfilled' ? walletResponse.value : {};
        const ridesPayload = ridesResponse.status === 'fulfilled' ? ridesResponse.value : {};

        const profileData = pickObject(profilePayload?.data, profilePayload?.result, profilePayload);
        const user = pickObject(profileData?.user, profileData?.data?.user, profileData?.profile, profileData);
        const walletData = pickObject(walletPayload?.data, walletPayload?.wallet, walletPayload);
        const ridesData = pickObject(ridesPayload?.data, ridesPayload?.result, ridesPayload);
        const ridePagination = pickObject(ridesData?.pagination, ridesData?.data?.pagination);
        const dynamicTripCount = pickNumber(
          ridePagination.total,
          ridesData?.total,
          ridesData?.count,
          user.totalRides,
          user.total_trips,
          user.totalTrips,
          stored?.totalRides,
        );
        const dynamicWalletBalance = pickNumber(
          walletData.balance,
          walletData.walletBalance,
          walletData.amount,
          user.walletBalance,
          user.wallet?.balance,
          user.wallet_amount,
          stored?.walletBalance,
        );
        const dynamicRating = pickNumber(user.rating, user.avgRating, user.average_rating, stored?.rating);

        localStorage.setItem(
          'userInfo',
          JSON.stringify({
            ...stored,
            ...user,
            walletBalance: dynamicWalletBalance,
            totalRides: dynamicTripCount,
            rating: dynamicRating,
          }),
        );
        if (cancelled) return;
        setProfile({
          name: user.name || stored?.name || 'User',
          phone: user.phone || stored?.phone || '',
          profileImage: user.profileImage || user.profile_image || stored?.profileImage || '',
          stats: {
            trips: dynamicTripCount,
            rating: dynamicRating,
            wallet: dynamicWalletBalance,
          },
        });
      } catch (err) {
        console.error('Failed to load profile', err);
        if (cancelled) return;
        // nothing could be loaded: stop the skeletons, show what is known (or 0)
        setProfile((prev) => ({
          ...prev,
          stats: { trips: prev.stats.trips ?? 0, rating: prev.stats.rating ?? 0, wallet: prev.stats.wallet ?? 0 },
        }));
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    // Dim "Logging out..." cover + login screen preloaded: the page goes straight to login, no blank frame.
    await logoutWithTransition({
      navigate,
      signOut: () => {
        clearCurrentRide();
        socketService.disconnect();
        clearLocalUserSession();
      },
    });
  };

  const handleLogoutClick = () => {
    if (isLoggingOut) return;
    preloadAuthApp();
    setLogoutConfirmOpen(true);
  };

  return (
    <View style={[styles.page, { backgroundColor: p.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: bottomNavSpace }]}
        onScroll={handleScroll}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
      >
        {/* Header background (320 px) with its gradient */}
        <View pointerEvents="none" style={[styles.headerBg, { backgroundColor: p.profileHeaderBg }]}>
          <LinearGradient colors={p.profileHeaderGradient} style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.relative}>
          <StatusBarSpacer />
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.titleRow}>
              <Pressable
                onPress={goBack}
                accessibilityLabel="Back"
                style={({ pressed }) => [styles.backBtn, { backgroundColor: p.cardBg, borderColor: p.border }, pressed && { transform: [{ scale: 0.95 }] }]}
              >
                <ArrowLeft size={20} strokeWidth={2.5} color={p.textPrimary} />
              </Pressable>
              <Text style={[styles.title, { color: p.textPrimary }]}>Profile</Text>
            </View>

            {/* Profile Hero Card */}
            <View style={[styles.hero, { backgroundColor: p.cardBg, borderColor: p.border }, p.cardShadow]}>
              <View style={styles.heroRow}>
                <View style={[styles.avatar, { borderColor: p.border, backgroundColor: p.cardBg }, USER_SHADOW]}>
                  <AppImage src={profile.profileImage || DEFAULT_AVATAR} fallback={DEFAULT_AVATAR} accessibilityLabel="User" contentFit="cover" style={styles.fill} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.name, { color: p.textPrimary }]}>
                    {profile.name}
                  </Text>
                  <View style={styles.phoneRow}>
                    <Phone size={14} color={p.textSecondary} style={{ opacity: 0.6 }} />
                    <Text style={[styles.phone, { color: p.textSecondary }]}>{profile.phone ? `+91 ${profile.phone}` : 'Account Active'}</Text>
                  </View>
                  {/* Opens the edit form directly */}
                  <Pressable onPress={() => navigate('/taxi/user/profile/edit')} hitSlop={6} style={({ pressed }) => [styles.editRow, pressed && { opacity: 0.8 }]}>
                    <Text style={[styles.edit, { color: p.textSecondary }]}>Edit profile</Text>
                    <ChevronRight size={13} strokeWidth={3} color={p.textSecondary} />
                  </Pressable>
                </View>
              </View>

              {/* Quick Stats Row */}
              <View style={[styles.stats, { borderTopColor: p.border }]}>
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: p.textSecondary }]}>Total Trips</Text>
                  <View style={styles.statValueBox}>
                    {profile.stats.trips === null ? (
                      <NumberSkeleton fontSize={18} color={p.textPrimary} />
                    ) : (
                      <Text style={[styles.statValue, { color: p.textPrimary }]}>{profile.stats.trips}</Text>
                    )}
                  </View>
                </View>
                <View style={[styles.stat, styles.statMiddle, { borderColor: p.border }]}>
                  <Text style={[styles.statLabel, { color: p.textSecondary }]}>Rating</Text>
                  <View style={[styles.statValueBox, styles.ratingRow]}>
                    <Star size={14} color={p.accent} fill={colors.yellow[400]} />
                    {profile.stats.rating === null ? (
                      <NumberSkeleton fontSize={18} color={p.textPrimary} />
                    ) : (
                      <Text style={[styles.statValue, { color: p.textPrimary, marginTop: 4 }]}>{profile.stats.rating || '—'}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: p.textSecondary }]}>Credits</Text>
                  <View style={styles.statValueBox}>
                    {profile.stats.wallet === null ? (
                      <NumberSkeleton width="2.4em" fontSize={18} color={p.accent} />
                    ) : (
                      <Text style={[styles.statValue, { color: p.accent }]}>{`₹${profile.stats.wallet}`}</Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Menu Sections */}
          <View style={styles.menu}>
            {visibleSections.map((section, sIdx) => (
              <View key={section.heading || `section-${sIdx}`} style={styles.section}>
                {section.heading && (
                  <View style={styles.sectionHead}>
                    <View style={[styles.sectionBar, { backgroundColor: p.accent }]} />
                    <Text style={[styles.sectionTitle, { color: p.textPrimary }]}>{section.heading}</Text>
                  </View>
                )}
                <View style={styles.items}>
                  {section.items.map((item, iIdx) => {
                    const Icon = item.icon;
                    return (
                      <Pressable
                        key={iIdx}
                        onPress={() => {
                          if (item.id === 'appearance') return setAppearanceOpen(true);
                          if (item.id === 'logout') return handleLogoutClick();
                          return navigate(item.path);
                        }}
                        style={({ pressed }) => [
                          styles.item,
                          { backgroundColor: p.cardBg, borderColor: p.border },
                          p.cardShadow,
                          pressed && { transform: [{ scale: 0.98 }] },
                        ]}
                      >
                        <View style={[styles.itemIcon, { backgroundColor: p.cardSoft }]}>
                          <Icon size={19} color={p.textPrimary} strokeWidth={2.2} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemTitle, { color: p.textPrimary }]}>{item.title}</Text>
                          <Text style={[styles.itemSub, { color: p.textSecondary }]}>{item.id === 'appearance' ? theme : item.sub}</Text>
                        </View>
                        <ChevronRight size={18} strokeWidth={2.4} color={p.textMuted} style={{ flexShrink: 0 }} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <StatusBarScrim color={p.bg} />

      <UserAppearanceDialog open={appearanceOpen} onOpenChange={setAppearanceOpen} />

      {/* Same shared logout confirmation Food uses — Taxi recolours the icon / confirm button to its blue. */}
      <UserLogoutConfirmDialog
        // confirmed: the popup goes at once (its fade over the log-out cover looked like a flash)
        animateOut={!leaving}
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLeaving(true);
          setLogoutConfirmOpen(false);
          handleLogout();
        }}
        isLoggingOut={isLoggingOut}
        iconBgStyle={{ backgroundColor: alpha(colors.blue[600], 0.1) }}
        iconColor={colors.blue[600]}
        confirmButtonStyle={{ backgroundColor: colors.blue[600], shadowColor: colors.blue[600], shadowOpacity: 0.2 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  content: { flexGrow: 1, paddingBottom: 130 },
  headerBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320, overflow: 'hidden' },
  relative: { zIndex: 10 },
  headerSection: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  backBtn: { height: 40, width: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  hero: { borderRadius: 24, padding: 20, borderWidth: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  avatar: { width: 80, height: 80, borderRadius: 28, overflow: 'hidden', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, lineHeight: 28, fontWeight: '700', textTransform: 'capitalize' },
  phoneRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  phone: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  editRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  edit: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 12, marginTop: 24, paddingTop: 20, borderTopWidth: 1 },
  stat: { flex: 1, alignItems: 'center' },
  statMiddle: { borderLeftWidth: 1, borderRightWidth: 1 },
  statLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', textAlign: 'center' },
  statValueBox: { marginTop: 4, minHeight: 28, justifyContent: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  menu: { paddingHorizontal: 16, gap: 20 },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sectionBar: { width: 4, height: 16, borderRadius: 4 },
  sectionTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.65 },
  items: { gap: 10 },
  item: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 18, borderWidth: 1 },
  itemIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemTitle: { fontSize: 15, lineHeight: 19, fontWeight: '600', letterSpacing: -0.37 },
  itemSub: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: '500', textTransform: 'capitalize' },
});

export default Profile;
