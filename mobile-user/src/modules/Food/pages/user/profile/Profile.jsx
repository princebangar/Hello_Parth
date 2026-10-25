// Web: modules/Food/pages/user/profile/Profile.jsx — the Profile main tab (kept alive by MainTabKeepAlive).
// window scroll + sessionStorage "profileScrollPos" -> the ScrollView's offset (same key), and the list is registered
// with browseScrollMemory so the keep-alive tab switch can save / restore it like the other main tabs.
import { StatusBarScrim } from '@/native/ui/StatusBarScrim';
import { useBottomNavSpace } from '@/native/ui/useBottomNavSpace';
import { useState, useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Wallet,
  Tag,
  Leaf,
  Palette,
  Bookmark,
  Building2,
  Check,
  Info,
  Settings as SettingsIcon,
  Power,
  ShoppingCart,
  MapPin,
  Utensils,
  LifeBuoy,
} from "lucide-react-native";
import { Link, useNavigate, useNavigationType, useLocation } from "@/lib/router";
import { toast } from "@/lib/toast";
import { AppImage, Dialog as NativeDialog, Skeleton, Text } from "@/native/ui";
import { alpha, colors, makeStyles, shadow, sp, fontSize, useTheme } from "@/theme";

import { normalizeImageUrl } from "@food/utils/common";

import AnimatedPage from "@food/components/user/AnimatedPage";
import { useProfile } from "@food/context/ProfileContext";
import { useLocationSelector } from "@food/components/user/UserLayout";
import { Avatar } from "@food/components/ui/avatar";
import { useCompanyName } from "@food/hooks/useCompanyName";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog";
import { authAPI } from "@food/api";
import { clearModuleAuth } from "@food/utils/auth";
import { showAccountDeletedToast } from "@/shared/utils/customToasts";
import UserAppearanceDialog from "@/shared/components/UserAppearanceDialog.jsx";
import UserLogoutConfirmDialog from "@/shared/components/UserLogoutConfirmDialog.jsx";
import UserDeleteAccountDialog from "@/shared/components/UserDeleteAccountDialog.jsx";
import useBodyScrollLock from "@/shared/hooks/useBodyScrollLock.js";
import { preloadAuthApp } from "@/shared/utils/preloadLogin.js";
import {
  hideLogoutCover,
  hideLogoutCoverWhenLoginShown,
  logoutWithTransition,
  showLogoutCover,
} from "@/shared/utils/logoutTransition.js";
import { getFoodUserTheme, THEME_CHANGE_EVENT } from "@/shared/utils/theme.js";
import {
  formatSavedAddressSubtitle,
  performUserLogout,
} from "@/shared/utils/userSession.js";
import { resolveProfileBackPath } from "@food/utils/mainTabRoutes";
import { registerBrowseScroller, reportBrowseScroll } from "@food/utils/browseScrollMemory";

const DEFAULT_AVATAR = require("../../../../../assets/public/images/profile_avatar.webp");
const PROFILE_PATH = "/food/user/profile";

const debugLog = (...args) => { };
const debugWarn = (...args) => { };
const debugError = (...args) => { };

// Every row uses the same calm grey chip (same as the Log out row), no per-row colours.
function ProfileOptionIcon({ icon: Icon }) {
  const s = useStyles();
  const t = useTheme();
  return (
    <View style={s.iconChip}>
      <Icon size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
    </View>
  );
}

function OptionCard({ onPress, children }) {
  const s = useStyles();
  return (
    <Pressable onPress={onPress} style={s.optionCard}>
      {children}
    </Pressable>
  );
}

function RowChevron() {
  const t = useTheme();
  return <ChevronRight size={20} color={t.dark ? colors.gray[500] : colors.gray[400]} />;
}

function SectionTitle({ children }) {
  const s = useStyles();
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{children}</Text>
    </View>
  );
}

export default function Profile() {
  const bottomNavSpace = useBottomNavSpace();
  const { userProfile, vegMode, setVegMode, vegModeOption, setVegModeOption, getDefaultAddress, addresses, updateUserProfile } =
    useProfile();
  const { openLocationSelector } = useLocationSelector();
  const navigate = useNavigate();
  const location = useLocation();
  const companyName = useCompanyName();
  const s = useStyles();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const defaultAddress = getDefaultAddress?.();
  const savedAddressSummary = formatSavedAddressSubtitle(addresses, defaultAddress);

  // Popup states
  const [vegModeOpen, setVegModeOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBalanceWarning, setShowBalanceWarning] = useState(false);
  const [balanceData, setBalanceData] = useState({ balance: 0, type: "Wallet" });
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  const navType = useNavigationType();

  const scrollRef = useRef(null);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);

  useEffect(() => {
    return registerBrowseScroller(PROFILE_PATH, {
      scrollTo: (y) => scrollRef.current?.scrollTo({ y, animated: false }),
      getContentHeight: () => contentHeightRef.current,
      getViewportHeight: () => viewportHeightRef.current,
    });
  }, []);

  // Scroll Restoration
  useEffect(() => {
    let timer = null;
    if (navType === "POP") {
      const savedScroll = sessionStorage.getItem("profileScrollPos");
      if (savedScroll) {
        timer = setTimeout(() => scrollRef.current?.scrollTo({ y: parseInt(savedScroll, 10), animated: false }), 50);
      }
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [navType]);

  const handleScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    sessionStorage.setItem("profileScrollPos", String(Math.max(0, Math.round(y))));
    reportBrowseScroll(PROFILE_PATH, y);
  };

  // Lock scroll when any popup is open (native dialogs are modal already)
  useBodyScrollLock(logoutConfirmOpen || deleteAccountOpen || showBalanceWarning || vegModeOpen || appearanceOpen);

  const handleVegModeUpdate = (nextValue) => {
    setVegMode(nextValue);
    localStorage.setItem("userVegMode", String(nextValue));
  };

  const handleVegModeOptionUpdate = (nextOption) => {
    setVegModeOption(nextOption);
    if (!vegMode) {
      setVegMode(true);
      localStorage.setItem("userVegMode", "true");
    }
  };

  const [appearanceTheme, setAppearanceTheme] = useState(() => getFoodUserTheme());

  useEffect(() => {
    const syncTheme = () => setAppearanceTheme(getFoodUserTheme());
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const displayName = userProfile?.name || userProfile?.phone || "User";
  // Only show email if it exists and is valid, otherwise show phone or "Not available"
  const hasValidEmail =
    userProfile?.email &&
    userProfile.email.trim() !== "" &&
    userProfile.email.includes("@");

  // Handle logout
  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      // Dim "Logging out..." cover: the page goes straight to login, no blank frame.
      await logoutWithTransition({ navigate, signOut: performUserLogout });
    } catch (err) {
      debugError("Error during logout:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleLogoutClick = () => {
    if (isLoggingOut) return;
    preloadAuthApp();
    setLogoutConfirmOpen(true);
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await authAPI.deleteAccount("user");

      showAccountDeletedToast();

      // Cover the screen first so the page being torn down is never seen empty
      showLogoutCover();
      // Clear user module authentication data
      clearModuleAuth("user");

      // Dispatch auth change event to notify other components
      window.dispatchEvent(new Event("userAuthChanged"));

      // Navigate to sign in page
      await preloadAuthApp();
      navigate("/login", { replace: true });
      hideLogoutCoverWhenLoginShown();
    } catch (error) {
      hideLogoutCover();
      debugError("Error deleting account:", error);
      toast.error(error?.response?.data?.message || "Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
      setDeleteAccountOpen(false);
    }
  };

  const profileImageValid =
    userProfile?.profileImage &&
    typeof userProfile.profileImage === "string" &&
    userProfile.profileImage.trim() !== "" &&
    userProfile.profileImage !== "null" &&
    userProfile.profileImage !== "undefined";
  const avatarSrc =
    userProfile?.localImagePreview || profileImageValid
      ? userProfile?.localImagePreview || normalizeImageUrl(userProfile.profileImage)
      : DEFAULT_AVATAR;

  const vegOptionStyle = (active, offStyle) => [s.vegOption, active ? (offStyle ? s.vegOptionOffActive : s.vegOptionActive) : s.vegOptionIdle];
  const vegRadioStyle = (active, offStyle) => [s.vegRadio, active ? (offStyle ? s.vegRadioOffActive : s.vegRadioActive) : s.vegRadioIdle];
  const leafColor = (active) => (active ? colors.green[600] : colors.gray[400]);

  return (
    <AnimatedPage style={s.page}>
      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={(e) => {
          viewportHeightRef.current = e.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_w, h) => {
          contentHeightRef.current = h;
        }}
        contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: bottomNavSpace }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: Back Arrow */}
        <View style={s.headerRow}>
          <Pressable
            onPress={() => navigate(resolveProfileBackPath(location.state?.from))}
            style={({ pressed }) => [s.backButton, pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={t.dark ? colors.white : colors.black} />
          </Pressable>
        </View>

        {/* Profile Info Card */}
        <View style={s.profileCard}>
          <View style={s.profileRow}>
            <View>
              <Avatar style={s.avatar}>
                <AppImage src={avatarSrc} fallback={DEFAULT_AVATAR} style={s.avatarImage} contentFit="cover" accessibilityLabel={displayName} />
              </Avatar>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.displayName}>{displayName}</Text>
              {hasValidEmail && <Text style={s.contactText}>{userProfile.email}</Text>}
              {userProfile?.phone && <Text style={s.contactText}>{userProfile.phone}</Text>}
              {!hasValidEmail && !userProfile?.phone && <Text style={s.notAvailable}>Not available</Text>}
              <Link to="/food/user/profile/edit" style={s.editLink}>
                <Text style={s.editLinkText}>Edit profile</Text>
                <Text style={s.editLinkArrow}>▶</Text>
              </Link>
            </View>
          </View>
        </View>

        {/* Account Options */}
        <View style={s.accountGroup}>
          <OptionCard onPress={() => navigate("/food/user/wallet", { state: { from: "/food/user/profile" } })}>
            <View style={s.rowLeft}>
              <ProfileOptionIcon icon={Wallet} />
              <Text style={s.rowLabel}>My Wallet</Text>
            </View>
            <View style={s.rowRight}>
              {walletBalance === null ? (
                <Skeleton width={48} height={16} rounded={4} style={{ backgroundColor: t.dark ? colors.gray[700] : colors.gray[200] }} />
              ) : (
                <Text style={s.walletAmount}>
                  {"₹"}
                  {Number(walletBalance).toFixed(0)}
                </Text>
              )}
              <RowChevron />
            </View>
          </OptionCard>

          <OptionCard onPress={() => navigate("/food/user/profile/coupons")}>
            <View style={s.rowLeft}>
              <ProfileOptionIcon icon={Tag} />
              <Text style={s.rowLabel}>Your coupons</Text>
            </View>
            <RowChevron />
          </OptionCard>

          <OptionCard onPress={() => navigate("/food/user/cart")}>
            <View style={s.rowLeft}>
              <ProfileOptionIcon icon={ShoppingCart} />
              <Text style={s.rowLabel}>Your cart</Text>
            </View>
            <RowChevron />
          </OptionCard>

          <OptionCard onPress={openLocationSelector}>
            <View style={[s.rowLeft, { flex: 1, minWidth: 0 }]}>
              <ProfileOptionIcon icon={MapPin} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowLabel}>Saved addresses</Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {savedAddressSummary}
                </Text>
              </View>
            </View>
            <View style={s.rowRight}>
              <View style={s.countPill}>
                <Text style={s.countPillText}>{addresses?.length || 0}</Text>
              </View>
              <RowChevron />
            </View>
          </OptionCard>

          <OptionCard onPress={() => setVegModeOpen(true)}>
            <View style={s.rowLeft}>
              <ProfileOptionIcon icon={Leaf} />
              <Text style={s.rowLabel}>Veg Mode</Text>
            </View>
            <View style={s.rowRight}>
              <Text style={s.rowLabel}>
                {vegMode ? (vegModeOption === "pure-veg" ? "Pure Veg" : "All restaurants") : "OFF"}
              </Text>
              <ChevronRight size={20} color={colors.gray[400]} />
            </View>
          </OptionCard>

          <OptionCard onPress={() => setAppearanceOpen(true)}>
            <View style={s.rowLeft}>
              <ProfileOptionIcon icon={Palette} />
              <Text style={s.rowLabel}>Appearance</Text>
            </View>
            <View style={s.rowRight}>
              <Text style={[s.rowLabel, { textTransform: "capitalize" }]}>{appearanceTheme}</Text>
              <ChevronRight size={20} color={colors.gray[400]} />
            </View>
          </OptionCard>
        </View>

        {/* Collections Section */}
        <View style={s.section}>
          <SectionTitle>Collections</SectionTitle>
          <OptionCard onPress={() => navigate("/food/user/profile/favorites")}>
            <View style={s.rowLeft}>
              <ProfileOptionIcon icon={Bookmark} />
              <Text style={s.rowLabel}>Your collections</Text>
            </View>
            <RowChevron />
          </OptionCard>
        </View>

        {/* Dining Section */}
        <View style={s.section}>
          <SectionTitle>Dining Bookings</SectionTitle>
          <OptionCard onPress={() => navigate("/food/user/profile/dining-bookings")}>
            <View style={s.rowLeft}>
              <ProfileOptionIcon icon={Utensils} />
              <View>
                <Text style={s.rowLabel}>Your reservations</Text>
                <Text style={s.rowTiny}>View table booking status</Text>
              </View>
            </View>
            <RowChevron />
          </OptionCard>
        </View>

        {/* Food Orders Section */}
        <View style={s.section}>
          <SectionTitle>Food Orders</SectionTitle>
          <View style={s.stack}>
            <OptionCard onPress={() => navigate("/food/user/orders", { state: { from: "profile", backTo: "/food/user/profile" } })}>
              <View style={s.rowLeft}>
                <ProfileOptionIcon icon={Building2} />
                <Text style={s.rowLabel}>Your orders</Text>
              </View>
              <RowChevron />
            </OptionCard>
          </View>
        </View>

        {/* More Section */}
        <View style={s.moreSection}>
          <SectionTitle>More</SectionTitle>
          <View style={s.stack}>
            <OptionCard onPress={() => navigate("/food/user/profile/support")}>
              <View style={s.rowLeft}>
                <ProfileOptionIcon icon={LifeBuoy} />
                <Text style={s.rowLabel}>Help & Support</Text>
              </View>
              <RowChevron />
            </OptionCard>

            <OptionCard onPress={() => navigate("/food/user/profile/about")}>
              <View style={s.rowLeft}>
                <ProfileOptionIcon icon={Info} />
                <Text style={s.rowLabel}>About</Text>
              </View>
              <RowChevron />
            </OptionCard>

            <OptionCard onPress={() => navigate("/food/user/profile/report-safety-emergency")}>
              <View style={s.rowLeft}>
                <ProfileOptionIcon icon={AlertTriangle} />
                <Text style={s.rowLabel}>Report a safety emergency</Text>
              </View>
              <RowChevron />
            </OptionCard>

            <OptionCard onPress={() => navigate("/food/user/profile/settings")}>
              <View style={s.rowLeft}>
                <ProfileOptionIcon icon={SettingsIcon} />
                <Text style={s.rowLabel}>Settings</Text>
              </View>
              <RowChevron />
            </OptionCard>

            <OptionCard onPress={handleLogoutClick}>
              <View style={s.rowLeft}>
                <ProfileOptionIcon icon={Power} />
                <Text style={[s.rowLabel, { fontWeight: "700" }]}>{isLoggingOut ? "Logging out..." : "Log out"}</Text>
              </View>
              <RowChevron />
            </OptionCard>
          </View>
        </View>
      </ScrollView>
      <StatusBarScrim color={t.dark ? "#0a0a0a" : "#f5f5f5"} />

      {/* Veg Mode Popup */}
      <Dialog open={vegModeOpen} onOpenChange={setVegModeOpen}>
        <DialogContent style={s.vegDialog}>
          <DialogHeader style={s.vegDialogHeader}>
            <DialogTitle style={s.vegDialogTitle}>Veg Mode</DialogTitle>
            <DialogDescription style={s.vegDialogDesc}>
              Filter restaurants and dishes based on your dietary preferences
            </DialogDescription>
          </DialogHeader>
          <View style={s.vegOptions}>
            <Pressable
              onPress={() => {
                handleVegModeOptionUpdate("all");
                setVegModeOpen(false);
              }}
              style={vegOptionStyle(vegMode && vegModeOption === "all")}
            >
              <View style={s.vegOptionLeft}>
                <View style={vegRadioStyle(vegMode && vegModeOption === "all")}>
                  {vegMode && vegModeOption === "all" && <Check size={12} color={colors.white} />}
                </View>
                <View>
                  <Text style={s.vegOptionTitle}>All restaurants</Text>
                  <Text style={s.vegOptionSub}>Veg dishes from every restaurant</Text>
                </View>
              </View>
              <Leaf size={20} color={leafColor(vegMode && vegModeOption === "all")} />
            </Pressable>
            <Pressable
              onPress={() => {
                handleVegModeOptionUpdate("pure-veg");
                setVegModeOpen(false);
              }}
              style={vegOptionStyle(vegMode && vegModeOption === "pure-veg")}
            >
              <View style={s.vegOptionLeft}>
                <View style={vegRadioStyle(vegMode && vegModeOption === "pure-veg")}>
                  {vegMode && vegModeOption === "pure-veg" && <Check size={12} color={colors.white} />}
                </View>
                <View>
                  <Text style={s.vegOptionTitle}>Pure Veg restaurants only</Text>
                  <Text style={s.vegOptionSub}>Hide restaurants that serve non-veg</Text>
                </View>
              </View>
              <Leaf size={20} color={leafColor(vegMode && vegModeOption === "pure-veg")} />
            </Pressable>
            <Pressable
              onPress={() => {
                handleVegModeUpdate(false);
                setVegModeOpen(false);
              }}
              style={vegOptionStyle(!vegMode, true)}
            >
              <View style={s.vegOptionLeft}>
                <View style={vegRadioStyle(!vegMode, true)}>{!vegMode && <Check size={12} color={colors.white} />}</View>
                <View>
                  <Text style={s.vegOptionTitle}>Veg Mode OFF</Text>
                  <Text style={s.vegOptionSub}>Show all options</Text>
                </View>
              </View>
            </Pressable>
          </View>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Popup */}
      <UserLogoutConfirmDialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          handleLogout();
        }}
        isLoggingOut={isLoggingOut}
      />

      <UserAppearanceDialog open={appearanceOpen} onOpenChange={setAppearanceOpen} />

      {/* Balance Warning Popup */}
      <NativeDialog open={showBalanceWarning} onClose={() => {}} dismissible={false} backdropOpacity={0.8} style={s.balanceCard}>
        <View style={s.balanceHead}>
          <View style={s.balanceIconWrap}>
            <AlertTriangle size={32} color={t.dark ? colors.orange[400] : colors.orange[600]} />
          </View>
          <Text style={s.balanceTitle}>Wait! Balance Found</Text>
        </View>

        <View style={s.balanceBox}>
          <Text style={s.balanceType}>{balanceData.type}</Text>
          <Text style={s.balanceAmount}>₹{balanceData.balance.toLocaleString("en-IN")}</Text>
        </View>

        <Text style={s.balanceText}>
          You still have money in your wallet. Do you want to continue deleting your account or go back and withdraw?
        </Text>

        <View style={s.balanceActions}>
          <Pressable
            onPress={() => {
              setShowBalanceWarning(false);
              setDeleteAccountOpen(true);
            }}
            style={({ pressed }) => [s.balanceContinue, pressed && { backgroundColor: t.dark ? colors.gray[700] : colors.gray[200] }]}
          >
            <Text style={s.balanceContinueText}>Continue Anyway</Text>
          </Pressable>
          <Pressable onPress={() => setShowBalanceWarning(false)} style={s.balanceCancel}>
            <Text style={s.balanceCancelText}>Cancel & Withdraw</Text>
          </Pressable>
        </View>
      </NativeDialog>

      {/* Delete Account Confirmation */}
      <UserDeleteAccountDialog
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onConfirm={handleDeleteAccount}
        isDeleting={isDeleting}
      />
    </AnimatedPage>
  );
}

const useStyles = makeStyles((t) => {
  const card = t.dark ? "#1a1a1a" : colors.white;
  const title = t.dark ? colors.white : colors.gray[900];
  const muted = t.dark ? colors.gray[400] : colors.gray[500];
  return {
    page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
    content: { paddingHorizontal: sp(4), paddingBottom: sp(20) },
    headerRow: { flexDirection: "row", alignItems: "center", marginBottom: sp(5) },
    backButton: {
      height: 44,
      width: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.dark ? alpha("#1a1a1a", 0.7) : alpha(colors.white, 0.7),
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: t.dark ? alpha(colors.white, 0.1) : alpha(colors.black, 0.1),
      elevation: 3,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 2 },
    },
    profileCard: {
      backgroundColor: card,
      borderRadius: 20,
      overflow: "hidden",
      padding: sp(4),
      shadowColor: "#000",
      shadowOpacity: 0.02,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
    },
    profileRow: { flexDirection: "row", alignItems: "center", gap: sp(4) },
    avatar: {
      height: 64,
      width: 64,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.gray[100],
      backgroundColor: "transparent",
      ...shadow.sm,
    },
    avatarImage: { width: "100%", height: "100%", borderRadius: 9999 },
    displayName: { fontSize: 19, lineHeight: 23, fontWeight: "700", color: title, textTransform: "capitalize" },
    contactText: { fontSize: 13, lineHeight: 18, color: muted, marginTop: 2 },
    notAvailable: { fontSize: 13, lineHeight: 18, color: colors.gray[400], marginTop: 2 },
    editLink: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: sp(1) },
    editLinkText: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: t.dark ? colors.gray[300] : colors.gray[700] },
    editLinkArrow: { fontSize: 9, lineHeight: 9, marginLeft: sp(1), color: muted },
    accountGroup: { gap: sp(2), marginBottom: sp(3), marginTop: sp(3) },
    optionCard: {
      backgroundColor: card,
      borderRadius: 14,
      padding: sp(4),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      ...shadow.sm,
    },
    rowLeft: { flexDirection: "row", alignItems: "center", gap: sp(3) },
    rowRight: { flexDirection: "row", alignItems: "center", gap: sp(2) },
    rowLabel: { ...fontSize.base, fontWeight: "500", color: title },
    rowSub: { ...fontSize.xs, color: muted },
    rowTiny: { fontSize: 10, lineHeight: 14, color: colors.gray[500] },
    walletAmount: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.green[400] : colors.green[600] },
    iconChip: {
      backgroundColor: t.dark ? colors.gray[800] : colors.gray[100],
      borderRadius: 16,
      padding: sp(2.5),
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    countPill: {
      paddingHorizontal: sp(2),
      paddingVertical: sp(1),
      borderRadius: 4,
      backgroundColor: t.dark ? colors.gray[800] : colors.gray[100],
    },
    countPillText: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.gray[300] : colors.gray[700] },
    section: { marginBottom: sp(3) },
    moreSection: { marginBottom: sp(8), paddingBottom: sp(8) },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(2), paddingHorizontal: sp(1) },
    sectionBar: { width: 4, height: 16, backgroundColor: "#DC2626", borderRadius: 4 },
    sectionTitle: { ...fontSize.base, fontWeight: "600", color: title },
    stack: { gap: sp(2) },
    // Veg mode dialog
    vegDialog: { maxWidth: 384, borderRadius: 16, padding: 0, overflow: "hidden", backgroundColor: card, borderColor: t.dark ? colors.gray[800] : alpha("#e6e0d1", 1) },
    vegDialogHeader: { padding: sp(5), paddingBottom: sp(3) },
    vegDialogTitle: { ...fontSize.lg, fontWeight: "700", color: title },
    vegDialogDesc: { ...fontSize.sm, color: muted },
    vegOptions: { gap: sp(2), paddingHorizontal: sp(5), paddingBottom: sp(5) },
    vegOption: {
      width: "100%",
      padding: sp(3),
      borderRadius: 14,
      borderWidth: 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    vegOptionActive: { borderColor: colors.green[600], backgroundColor: t.dark ? alpha(colors.green[900], 0.2) : colors.green[50] },
    vegOptionOffActive: { borderColor: "#991B1B", backgroundColor: t.dark ? alpha("#7F1D1D", 0.1) : "#fdfafc" },
    vegOptionIdle: { borderColor: t.dark ? colors.gray[800] : colors.gray[200], backgroundColor: t.dark ? "#111111" : colors.white },
    vegOptionLeft: { flexDirection: "row", alignItems: "center", gap: sp(3), flexShrink: 1 },
    vegRadio: { width: 20, height: 20, borderRadius: 9999, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    vegRadioActive: { borderColor: colors.green[600], backgroundColor: colors.green[600] },
    vegRadioOffActive: { borderColor: "#991B1B", backgroundColor: "#991B1B" },
    vegRadioIdle: { borderColor: colors.gray[300] },
    vegOptionTitle: { ...fontSize.sm, fontWeight: "500", color: title },
    vegOptionSub: { ...fontSize.xs, color: muted },
    // Balance warning
    balanceCard: { maxWidth: 384, borderRadius: 16, padding: sp(6), backgroundColor: card, ...shadow["2xl"] },
    balanceHead: { alignItems: "center", marginBottom: sp(4) },
    balanceIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 9999,
      backgroundColor: t.dark ? alpha(colors.orange[900], 0.2) : colors.orange[100],
      alignItems: "center",
      justifyContent: "center",
      marginBottom: sp(3),
    },
    balanceTitle: { ...fontSize.xl, fontWeight: "900", color: title, textAlign: "center" },
    balanceBox: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50], borderRadius: 12, padding: sp(4), marginBottom: sp(5), alignItems: "center" },
    balanceType: { fontSize: 10, lineHeight: 14, color: colors.gray[500], textTransform: "uppercase", fontWeight: "900", letterSpacing: 1, marginBottom: sp(1) },
    balanceAmount: { ...fontSize["3xl"], fontWeight: "900", color: t.dark ? colors.white : colors.black },
    balanceText: { ...fontSize.sm, lineHeight: 22, color: t.dark ? colors.gray[300] : colors.gray[600], marginBottom: sp(6), textAlign: "center" },
    balanceActions: { gap: sp(3) },
    balanceContinue: { width: "100%", height: 48, borderRadius: 12, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], alignItems: "center", justifyContent: "center" },
    balanceContinueText: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.gray[300] : colors.gray[700] },
    balanceCancel: { width: "100%", height: 48, borderRadius: 12, backgroundColor: t.dark ? colors.white : colors.black, alignItems: "center", justifyContent: "center" },
    balanceCancelText: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.black : colors.white },
  };
});
