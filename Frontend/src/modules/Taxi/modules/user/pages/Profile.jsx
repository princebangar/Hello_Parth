import React, { useEffect, useState } from 'react';
import { useNavigate, useNavigationType, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Bell, Shield, LogOut, ChevronRight, HelpCircle, FileText,
  MapPin, Star, Package, Gift, Tag, Check, BusFront, ArrowLeft,
  CreditCard, History, Phone, Palette, Settings
} from 'lucide-react';
// ... removed BottomNavbar import ...

import { clearLocalUserSession, getLocalUserToken, userAuthService } from '../services/authService';
import { clearCurrentRide } from '../services/currentRideService';
import { socketService } from '../../../shared/api/socket';
import api from '../../../shared/api/axiosInstance';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import UserAppearanceDialog from '@/shared/components/UserAppearanceDialog.jsx';
import UserLogoutConfirmDialog from '@/shared/components/UserLogoutConfirmDialog.jsx';
import { preloadAuthApp } from '@/shared/utils/preloadLogin.js';
import { logoutWithTransition } from '@/shared/utils/logoutTransition.js';
import useReferralEnabled from '@/shared/hooks/useReferralEnabled';
import NumberSkeleton from '@/shared/components/NumberSkeleton';

const MotionDiv = motion.div;
const MotionButton = motion.button;
// Same placeholder photo as the Food user profile (one account across the app).
const DEFAULT_AVATAR = '/assets/images/profile_avatar.webp';

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

// Grouped into headed sections like Food's profile (small accent bar + label
// above each group) — the first group stays unlabeled, matching Food's own
// top cluster of account-level items.
const menuSections = [
  {
    heading: null,
    items: [
      { icon: MapPin, title: 'Saved Addresses', sub: 'Home, office & others', path: '/taxi/user/profile/addresses', bg: 'bg-emerald-50 dark:bg-emerald-950/30', color: 'text-emerald-600 dark:text-emerald-400' },
      // amber-400 (Tailwind's usual dark-mode partner for amber-600) reads
      // distinctly yellow rather than orange — amber-500 keeps this the
      // same "orange" family in both themes instead of shifting hue.
      { icon: Wallet, title: 'My Wallet', sub: 'Balance & transactions', path: '/taxi/user/wallet', bg: 'bg-amber-50 dark:bg-amber-950/30', color: 'text-amber-600 dark:text-amber-500' },
      // Same shared appearance picker Food uses — no `path`, handled via id.
      { id: 'appearance', icon: Palette, title: 'Appearance', sub: 'Light', bg: 'bg-yellow-50 dark:bg-yellow-950/30', color: 'text-yellow-600 dark:text-yellow-400' },
    ],
  },
  {
    heading: 'My Activity',
    items: [
      { icon: History, title: 'My Rides', sub: 'Rides, parcels & trips', path: '/taxi/user/activity', bg: 'bg-blue-50 dark:bg-blue-950/30', color: 'text-blue-600 dark:text-blue-400' },
      { icon: BusFront, title: 'Bus Tickets', sub: 'Manage bus bookings', path: '/taxi/user/profile/bus-bookings', bg: 'bg-orange-50 dark:bg-orange-950/30', color: 'text-orange-600 dark:text-orange-400' },
      { icon: Package, title: 'Subscriptions', sub: 'Ride plans & credits', path: '/taxi/user/profile/subscriptions', bg: 'bg-indigo-50 dark:bg-indigo-950/30', color: 'text-indigo-600 dark:text-indigo-400' },
    ],
  },
  {
    heading: 'Rewards',
    items: [
      { icon: Gift, title: 'Refer & Earn', sub: 'Invite friends & get rewards', path: '/taxi/user/referral', bg: 'bg-rose-50 dark:bg-rose-950/30', color: 'text-rose-600 dark:text-rose-400' },
      { icon: Tag, title: 'Promo Codes', sub: 'Offers you can use on a booking', path: '/taxi/user/promo', bg: 'bg-yellow-50 dark:bg-yellow-950/30', color: 'text-yellow-600 dark:text-yellow-400' },
    ],
  },
  {
    heading: 'More',
    items: [
      { icon: Bell, title: 'Notifications', sub: 'Offers & alerts', path: '/taxi/user/profile/notifications', bg: 'bg-purple-50 dark:bg-purple-950/30', color: 'text-purple-600 dark:text-purple-400' },
      { icon: Shield, title: 'Security & SOS', sub: 'Trust & safety settings', path: '/safety/sos', bg: 'bg-sky-50 dark:bg-sky-950/30', color: 'text-sky-600 dark:text-sky-400' },
      { icon: HelpCircle, title: 'Help & Support', sub: 'Help center & tickets', path: '/taxi/user/support/tickets', bg: 'bg-slate-50 dark:bg-slate-800/50', color: 'text-slate-600 dark:text-slate-400' },
      { icon: FileText, title: 'Terms & Conditions', sub: 'Read service terms', path: '/user/terms', bg: 'bg-orange-50 dark:bg-orange-950/30', color: 'text-orange-600 dark:text-orange-400' },
      { icon: Shield, title: 'Privacy Policy', sub: 'How your data is handled', path: '/user/privacy', bg: 'bg-emerald-50 dark:bg-emerald-950/30', color: 'text-emerald-600 dark:text-emerald-400' },
      { icon: CreditCard, title: 'Refund Policy', sub: 'Refunds and cancellations', path: '/food/user/profile/refund', bg: 'bg-indigo-50 dark:bg-indigo-950/30', color: 'text-indigo-600 dark:text-indigo-400' },
      // Settings hub (Edit Profile + Delete Account) — same spot Food puts
      // it: directly above Log out.
      { icon: Settings, title: 'Settings', sub: 'Edit profile & account', path: '/taxi/user/profile/settings', bg: 'bg-slate-50 dark:bg-slate-800/50', color: 'text-slate-600 dark:text-slate-400' },
      // Fixed navy — no `dark:` pair — so it stays the same colour in both
      // themes, same list-row style as every other item (matches Food's
      // flat "Log out" row instead of a standalone CTA button).
      { id: 'logout', icon: LogOut, title: 'Log out', sub: 'Sign out of your account', bg: 'bg-blue-600/10', color: 'text-blue-600' },
    ],
  },
];

const Profile = () => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  // Back to the screen Profile was opened from; opened directly: Home.
  const goBack = () => {
    if (routerLocation.key !== 'default') navigate(-1);
    else navigate('/taxi/user');
  };
  const navType = useNavigationType();
  const { theme } = useUserTheme();
  const referralEnabled = useReferralEnabled();
  // Global admin can switch the referral system off: its menu row disappears (and an emptied group with it).
  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => referralEnabled || item.path !== '/taxi/user/referral'),
    }))
    .filter((section) => section.items.length > 0);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Seed from what login already stored, so name/phone show immediately
  // instead of a blank "Account Active" placeholder until the network
  // fetch below resolves — the fetch still runs to refresh stats.
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
      }
    };
  });

  // Settings/Edit-profile aren't kept-alive tabs, so navigating into them
  // fully unmounts Profile — coming back with the browser/back-button
  // remounts it fresh at scroll 0 unless we restore it ourselves. Same
  // pattern Food's own Profile page uses.
  useEffect(() => {
    if (navType === 'POP') {
      const savedScroll = sessionStorage.getItem('taxiProfileScrollPos');
      if (savedScroll) {
        setTimeout(() => window.scrollTo(0, parseInt(savedScroll, 10)), 50);
      }
    } else {
      window.scrollTo(0, 0);
    }

    const handleScroll = () => {
      sessionStorage.setItem('taxiProfileScrollPos', window.scrollY.toString());
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [navType]);

  useEffect(() => {
    const token = getLocalUserToken();

    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

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

        const profileData = pickObject(
          profilePayload?.data,
          profilePayload?.result,
          profilePayload,
        );
        const user = pickObject(
          profileData?.user,
          profileData?.data?.user,
          profileData?.profile,
          profileData,
        );
        const walletData = pickObject(
          walletPayload?.data,
          walletPayload?.wallet,
          walletPayload,
        );
        const ridesData = pickObject(
          ridesPayload?.data,
          ridesPayload?.result,
          ridesPayload,
        );
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
        const dynamicRating = pickNumber(
          user.rating,
          user.avgRating,
          user.average_rating,
          stored?.rating,
        );
        
        setProfile({
          name: user.name || stored?.name || 'User',
          phone: user.phone || stored?.phone || '',
          profileImage: user.profileImage || user.profile_image || stored?.profileImage || '',
          stats: {
            trips: dynamicTripCount,
            rating: dynamicRating,
            wallet: dynamicWalletBalance,
          }
        });
        localStorage.setItem('userInfo', JSON.stringify({
          ...stored,
          ...user,
          walletBalance: dynamicWalletBalance,
          totalRides: dynamicTripCount,
          rating: dynamicRating,
        }));
      } catch (err) {
        console.error('Failed to load profile', err);
        // nothing could be loaded: stop the skeletons, show what is known (or 0)
        setProfile((prev) => ({
          ...prev,
          stats: { trips: prev.stats.trips ?? 0, rating: prev.stats.rating ?? 0, wallet: prev.stats.wallet ?? 0 },
        }));
      }
    };

    loadProfile();
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
    }
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto pb-[130px] relative overflow-x-hidden user-app-theme">
      {/* Premium Header Background — no border-bottom here: it's a fixed
          h-80 (320px) layer sitting *behind* the hero card (z-0 vs the
          card's own opaque background), so as soon as any content above it
          pushed the card's bottom edge past that fixed height, the line
          started showing at the card's left/right edges where the card
          doesn't cover it — an artifact of a hard-coded line at a height
          decoupled from the actual content. The gradient below already
          fades the background out, so the crisp line was never needed. */}
      <div
        style={{
          background: 'var(--user-profile-header-bg)',
        }}
        className="absolute top-0 inset-x-0 h-80 overflow-hidden transition-all duration-300"
      >
        <div 
          style={{ background: 'var(--user-profile-header-gradient)' }}
          className="absolute inset-0 transition-all duration-300" 
        />
      </div>

      <div className="relative z-10">
        {/* Header Section */}
        <div className="px-4 pt-8 pb-8">
          <div className="flex items-center gap-3 mb-8">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full border active:scale-95 transition-transform"
              style={{ backgroundColor: 'var(--user-card-bg)', borderColor: 'var(--user-border)', color: 'var(--user-text-primary)' }}
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
            </button>
            <h1 className="font-['Outfit'] text-2xl font-extrabold text-[var(--user-text-primary)] tracking-tight">Profile</h1>
          </div>

          {/* Profile Hero Card */}
          <MotionDiv
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[24px] p-5 border"
            style={{
              backgroundColor: 'var(--user-card-bg)',
              borderColor: 'var(--user-border)',
              boxShadow: 'var(--user-card-shadow)',
              color: 'var(--user-text-primary)'
            }}
          >
            <div className="flex items-center gap-5">
              <div className="relative">
                <div 
                  style={{ borderColor: 'var(--user-border)' }}
                  className="w-20 h-20 rounded-[28px] bg-slate-950 flex items-center justify-center shadow-lg overflow-hidden border-2"
                >
                  {profile.profileImage ? (
                    <img 
                      src={profile.profileImage} 
                      alt="User" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img src={DEFAULT_AVATAR} alt="User" className="w-full h-full object-cover" />
                  )}
                </div>
                {/* Border colour matches the card behind it (not a flat
                    `border-white`) so the badge reads as cut into the
                    corner — a hardcoded white ring here showed up as a
                    stray bright line against the dark-theme card. */}
                <div
                  style={{ borderColor: 'var(--user-card-bg)' }}
                  className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-lg border-2 flex items-center justify-center shadow-sm"
                >
                  <Check size={14} className="text-white" strokeWidth={4} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-['Outfit'] text-[22px] font-extrabold truncate capitalize leading-tight">
                  {profile.name}
                </h2>
                <p
                  style={{ color: 'var(--user-text-secondary)' }}
                  className="text-[14px] font-bold mt-1 flex items-center gap-1.5"
                >
                   <Phone size={14} className="opacity-60" />
                   {profile.phone ? `+91 ${profile.phone}` : 'Account Active'}
                </p>
                {/* Same spot/label as Food's "Edit profile" link — opens the
                    edit form directly (same destination the old standalone
                    "Profile Settings" menu row used to open), independent
                    of the "Settings" hub item further down the list. */}
                <button
                  type="button"
                  onClick={() => navigate('/taxi/user/profile/edit')}
                  style={{ color: 'var(--user-text-secondary)' }}
                  className="inline-flex items-center gap-0.5 text-[13px] font-bold mt-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  Edit profile
                  <ChevronRight size={13} strokeWidth={3} />
                </button>
              </div>
            </div>

            {/* Quick Stats Row */}
            <div 
              style={{ borderColor: 'var(--user-border)' }}
              className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t"
            >
              <div className="text-center">
                <p 
                  style={{ color: 'var(--user-text-secondary)' }}
                  className="text-[12px] font-medium"
                >
                  Total Trips
                </p>
                <p className="font-['Outfit'] text-[18px] font-extrabold mt-1">{profile.stats.trips === null ? <NumberSkeleton /> : profile.stats.trips}</p>
              </div>
              <div 
                style={{ borderColor: 'var(--user-border)' }}
                className="text-center border-x"
              >
                <p 
                  style={{ color: 'var(--user-text-secondary)' }}
                  className="text-[12px] font-medium"
                >
                  Rating
                </p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Star size={14} className="text-yellow-400 fill-yellow-400" />
                  <p className="font-['Outfit'] text-[18px] font-extrabold mt-1">{profile.stats.rating === null ? <NumberSkeleton /> : profile.stats.rating || '—'}</p>
                </div>
              </div>
              <div className="text-center">
                <p 
                  style={{ color: 'var(--user-text-secondary)' }}
                  className="text-[12px] font-medium"
                >
                  Credits
                </p>
                <p 
                  style={{ color: 'var(--user-accent)' }}
                  className="font-['Outfit'] text-[18px] font-extrabold mt-1"
                >
                  {profile.stats.wallet === null ? <NumberSkeleton width="2.4em" /> : `₹${profile.stats.wallet}`}
                </p>
              </div>
            </div>
          </MotionDiv>
        </div>

        {/* Menu Sections — `initial={false}` skips the mount fade/stagger
            entirely. It's not just decorative: since each section only has
            text (no background of its own), while it's mid-fade the parent's
            background (not yet settled) shows through behind it — on a
            theme switch that read as sections being "half updated". */}
        <motion.div
          variants={containerVariants}
          initial={false}
          animate="visible"
          className="px-4 space-y-5"
        >
          {visibleSections.map((section, sIdx) => (
            <div key={section.heading || `section-${sIdx}`} className="space-y-3">
              {section.heading && (
                <div className="flex items-center gap-2 px-1">
                  <div style={{ backgroundColor: 'var(--user-accent)' }} className="w-1 h-4 rounded" />
                  <h3
                    style={{ color: 'var(--user-text-primary)' }}
                    className="text-[13px] font-bold uppercase tracking-wider"
                  >
                    {section.heading}
                  </h3>
                </div>
              )}
              <div className="space-y-2.5">
                {section.items.map((item, iIdx) => (
                  <MotionButton
                    key={iIdx}
                    variants={itemVariants}
                    initial={false}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (item.id === 'appearance') return setAppearanceOpen(true);
                      if (item.id === 'logout') return handleLogoutClick();
                      return navigate(item.path);
                    }}
                    style={{
                      backgroundColor: 'var(--user-card-bg)',
                      borderColor: 'var(--user-border)',
                      boxShadow: 'var(--user-card-shadow)',
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-[18px] border text-left cursor-pointer"
                  >
                    <div
                      className={`w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 ${item.id === 'logout' ? item.bg : ''}`}
                      style={item.id === 'logout' ? undefined : { background: 'var(--user-card-soft)' }}
                    >
                      <item.icon
                        size={19}
                        className={item.id === 'logout' ? item.color : ''}
                        style={item.id === 'logout' ? undefined : { color: 'var(--user-text-primary)' }}
                        strokeWidth={2.2}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[15px] font-bold leading-tight tracking-tight">{item.title}</p>
                      <p
                        style={{ color: 'var(--user-text-secondary)' }}
                        className="text-[12px] font-medium mt-0.5 capitalize"
                      >
                        {item.id === 'appearance' ? theme : item.sub}
                      </p>
                    </div>
                    <ChevronRight size={18} strokeWidth={2.4} className="shrink-0" style={{ color: 'var(--user-text-muted)' }} />
                  </MotionButton>
                ))}
              </div>
            </div>
          ))}

        </motion.div>
      </div>

      <UserAppearanceDialog open={appearanceOpen} onOpenChange={setAppearanceOpen} />

      {/* Same shared logout confirmation Food uses — Taxi just recolours the
          icon/confirm button to its own blue instead of Food's red. */}
      <UserLogoutConfirmDialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          handleLogout();
        }}
        isLoggingOut={isLoggingOut}
        iconBgClassName="bg-blue-600/10"
        iconClassName="text-blue-600"
        confirmButtonClassName="bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
      />
    </div>
  );
};

export default Profile;
