import React, { useEffect, useRef, useState } from "react"
import { useTabScrollTop } from '@/native/ui/tabShown'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native"
import {
  ChevronRight,
  Bike,
  Ticket,
  Star,
  LogOut,
  Briefcase,
  Trash2,
  AlertTriangle,
  Power
} from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { AppImage, Dialog, Text, TextInput, useBottomNavSpace } from "@/native/ui"
import { LinearGradient } from "expo-linear-gradient"
import { alpha, colors, deliveryTheme, fonts, shadow } from "@/theme"
import useKeyboardOffset from "@/modules/Taxi/shared/hooks/useKeyboardOffset"
import { deliveryAPI, authAPI } from "@food/api"
import { showUserFacingApiError } from "@/shared/utils/apiError"
import { showAccountDeletedToast } from "@/shared/utils/customToasts"
import { clearModuleAuth } from "@food/utils/auth"
import { useDeliveryTabActive } from "../deliveryTabPages"

// web /assets/images/profile_avatar.webp, bundled so it shows offline
const DEFAULT_AVATAR = require("../../../assets/public/images/profile_avatar.webp")
const PRIMARY = "#15498B"
const RED = "#FF3131"
const BLUE = deliveryTheme.primary

/**
 * ProfileV2 - 1:1 EXACT Restoration of the Legacy Profile Hub.
 * Matches ProfilePage.jsx exactly.
 * Rendered inside DeliveryHomeV2's Profile tab (kept alive): the web loaded the profile on mount, which here is each
 * time the tab becomes the one on screen (old data stays visible while it reloads).
 */
export const ProfileV2 = () => {
  const tabScrollRef = useRef(null)
  useTabScrollTop(tabScrollRef)
  const navigate = useNavigate()
  const tabActive = useDeliveryTabActive()
  const bottomSpace = useBottomNavSpace()
  const keyboardOffset = useKeyboardOffset()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [referralReward, setReferralReward] = useState(0)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)
  const [leaving, setLeaving] = useState(false) // signed out: the popup goes away at once, no fade over the login screen
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteCaptcha, setDeleteCaptcha] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [showBalanceWarning, setShowBalanceWarning] = useState(false)
  const [balanceData] = useState({ balance: 0, type: "Wallet" })
  const [isCheckingBalance] = useState(false)
  const loadedOnceRef = useRef(false)

  // A popup belongs to this screen: when another page / tab opens, it closes (web: the page unmounted).
  useEffect(() => {
    if (tabActive) return
    setShowLogoutConfirm(false)
    setDeleteAccountOpen(false)
    setShowBalanceWarning(false)
  }, [tabActive])

  // Fetch profile data
  useEffect(() => {
    if (!tabActive) return undefined
    let cancelled = false
    const fetchProfile = async () => {
      try {
        if (!loadedOnceRef.current) setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (!cancelled && response?.data?.success && response?.data?.data?.profile) {
          setProfile(response.data.data.profile)
        }
      } catch (error) {
        if (!cancelled) showUserFacingApiError(error, "Failed to load profile data")
      } finally {
        loadedOnceRef.current = true
        if (!cancelled) setLoading(false)
      }
    }
    fetchProfile()
    return () => {
      cancelled = true
    }
  }, [tabActive])

  useEffect(() => {
    if (!tabActive) return
    deliveryAPI.getReferralStats().then((res) => {
      const reward = res?.data?.data?.stats?.rewardAmount
      setReferralReward(Number(reward) || 0)
    }).catch(() => {})
  }, [tabActive])

  const refId = profile?._id || profile?.id || profile?.referralCode || ""
  const referralLink = refId ? `${window.location.origin}/food/delivery/signup?ref=${encodeURIComponent(String(refId))}` : ""
  // (web: handleShareReferral is defined but no button uses it)
  void referralLink
  void referralReward

  const handleLogout = async () => {
    if (logoutSubmitting) return
    try {
      setLogoutSubmitting(true)
      await deliveryAPI.logout()
    } catch {
      // ignore
    }
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    setLeaving(true)
    setShowLogoutConfirm(false)
    navigate("/food/delivery/login", { replace: true })
    setLogoutSubmitting(false)
  }

  const handleLogoutAllDevices = async () => {
    if (logoutSubmitting) return
    try {
      setLogoutSubmitting(true)
      await authAPI.logoutFromAllDevices("delivery")
    } catch {
      // ignore
    }
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    setLeaving(true)
    setShowLogoutConfirm(false)
    navigate("/food/delivery/login", { replace: true })
    setLogoutSubmitting(false)
  }

  const handleDeleteAccount = async () => {
    if (isDeleting || deleteCaptcha !== "DELETE") return
    setIsDeleting(true)
    try {
      await authAPI.deleteAccount("delivery")
      showAccountDeletedToast()
      clearModuleAuth("delivery")
      setDeleteAccountOpen(false)
      navigate("/food/delivery/login", { replace: true })
    } catch (err) {
      showUserFacingApiError(err, "Failed to delete account")
    } finally {
      setIsDeleting(false)
      setDeleteAccountOpen(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={colors.gray[600]} />
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[700] }}>Loading profile...</Text>
        </View>
      </View>
    )
  }

  const avatar = profile?.profileImage?.url || DEFAULT_AVATAR

  return (
    <View style={styles.root}>
      <ScrollView ref={tabScrollRef} nestedScrollEnabled contentContainerStyle={{ paddingBottom: bottomSpace }} showsVerticalScrollIndicator={false}>
        {/* Profile Header Block */}
        <View style={styles.headerBlock}>
          <Pressable onPress={() => navigate("/food/delivery/profile/details")} style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Text style={styles.name}>{profile?.name || ""}</Text>
                <ChevronRight size={20} color={colors.gray[400]} />
              </View>
              <Text style={styles.deliveryId}>{profile?.deliveryId || ""}</Text>
            </View>
            <View style={styles.avatarWrap}>
              <AppImage src={avatar} fallback={DEFAULT_AVATAR} style={styles.avatar} contentFit="cover" accessibilityLabel="Profile" />
              <View style={styles.briefcase}>
                <Briefcase size={16} color={colors.gray[600]} />
              </View>
            </View>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
          {/* Navigation Buttons */}
          <View style={styles.navGrid}>
            <Pressable
              onPress={() => navigate("/food/delivery/history", { state: { from: "/food/delivery/profile" } })} // Back (arrow) returns to the profile
              style={({ pressed }) => [styles.navBtn, pressed && { backgroundColor: colors.gray[50] }]}
            >
              <View style={styles.navIcon}>
                <Bike size={24} color={colors.gray[700]} />
              </View>
              <Text style={styles.navText}>Trips history</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate("/food/delivery/profile/reviews")}
              style={({ pressed }) => [styles.navBtn, pressed && { backgroundColor: colors.gray[50] }]}
            >
              <View style={styles.navIcon}>
                <Star size={24} color={PRIMARY} />
              </View>
              <Text style={styles.navText}>My reviews</Text>
            </Pressable>
          </View>

          {/* Sections */}
          <View style={{ gap: 16 }}>
            {/* Support Section */}
            <View>
              <Text style={styles.sectionTitle}>SUPPORT</Text>
              <Pressable
                onPress={() => navigate("/food/delivery/help/tickets")}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Ticket size={20} color={colors.gray[700]} />
                  <Text style={styles.navText}>Support tickets</Text>
                </View>
                <ChevronRight size={20} color={colors.gray[300]} />
              </Pressable>
            </View>

            {/* Logout Section */}
            <View style={{ paddingTop: 8 }}>
              <Pressable
                onPress={() => setShowLogoutConfirm(true)}
                style={({ pressed }) => [styles.dangerRow, { borderColor: colors.red[100] }, pressed && { backgroundColor: colors.red[100] }]}
              >
                <View style={styles.dangerLeft}>
                  <View style={[styles.dangerIcon, { backgroundColor: colors.red[50] }]}>
                    <LogOut size={20} color={RED} style={{ marginLeft: 2 }} />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.dangerTitle}>Logout</Text>
                    <Text style={styles.dangerSub}>Tap to logout from this device</Text>
                  </View>
                </View>
                <ChevronRight size={18} color={colors.gray[300]} />
              </Pressable>
            </View>

            {/* Delete Account */}
            <View>
              <Pressable
                onPress={() => {
                  setDeleteCaptcha("")
                  setDeleteAccountOpen(true)
                }}
                style={({ pressed }) => [styles.dangerRow, { borderColor: colors.red[50] }, pressed && { backgroundColor: colors.red[100], transform: [{ scale: 0.99 }] }]}
              >
                <View style={styles.dangerLeft}>
                  <View style={[styles.dangerIcon, { backgroundColor: "#FFF1F2" }]}>
                    {isCheckingBalance ? <ActivityIndicator size="small" color={RED} /> : <Trash2 size={20} color={RED} />}
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.dangerTitle}>Delete Account</Text>
                    <Text style={styles.dangerSub}>Tap to delete your account</Text>
                  </View>
                </View>
                <ChevronRight size={18} color={alpha(RED, 0.3)} />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Logout Confirm Popup — Prince (26 Oct): the Captain app's log-out popup (glow + power icon, Cancel | Log out),
          in the delivery blue, keeping this app's second button "Logout from all devices" */}
      <Dialog
        animateOut={!leaving}
        open={showLogoutConfirm}
        onClose={logoutSubmitting ? undefined : () => setShowLogoutConfirm(false)}
        dismissible={!logoutSubmitting}
        backdropOpacity={0.65}
        style={styles.logoutCard}
      >
        <View accessibilityRole="alert" accessibilityLabel="Log out" style={styles.logoutBody}>
          <LinearGradient pointerEvents="none" colors={[alpha(BLUE, 0.12), alpha(BLUE, 0)]} style={styles.logoutBand} />
          <View style={styles.logoutIconRing}>
            <LinearGradient colors={[alpha(BLUE, 0.16), alpha(BLUE, 0.06)]} style={styles.logoutIconInner}>
              <Power size={30} color={BLUE} strokeWidth={2.4} />
            </LinearGradient>
          </View>
          <Text style={styles.logoutTitle}>Log out?</Text>
          <Text style={styles.logoutText}>Are you sure you want to log out?</Text>

          <View style={styles.logoutRow}>
            <Pressable
              onPress={() => setShowLogoutConfirm(false)}
              disabled={logoutSubmitting}
              style={({ pressed }) => [styles.logoutNoBtn, pressed && styles.logoutPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.logoutNoText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleLogout}
              disabled={logoutSubmitting}
              style={({ pressed }) => [styles.logoutYesWrap, pressed && styles.logoutPressed]}
              accessibilityRole="button"
            >
              <LinearGradient colors={[BLUE, BLUE]} style={styles.logoutYesBtn}>
                {logoutSubmitting ? <ActivityIndicator size="small" color={colors.white} /> : <LogOut size={18} color={colors.white} strokeWidth={2.4} />}
                <Text style={styles.logoutYesText}>{logoutSubmitting ? "Logging out..." : "Logout"}</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <Pressable
            onPress={handleLogoutAllDevices}
            disabled={logoutSubmitting}
            style={({ pressed }) => [styles.logoutAllBtn, logoutSubmitting && { opacity: 0.5 }, pressed && styles.logoutPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.logoutAllText}>{logoutSubmitting ? "Logging out..." : "Logout from all devices"}</Text>
          </Pressable>
        </View>
      </Dialog>

      {/* Balance Warning Popup */}
      <Dialog open={showBalanceWarning} onClose={() => {}} dismissible={false} backdropOpacity={0.8} style={styles.popupCard}>
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View style={[styles.popupIcon, { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.orange[100] }]}>
            <AlertTriangle size={32} color={PRIMARY} />
          </View>
          <Text style={styles.popupTitle}>Wait! Balance Found</Text>
        </View>

        <View style={styles.balanceBox}>
          <Text style={styles.balanceType}>{String(balanceData.type).toUpperCase()}</Text>
          <Text style={styles.balanceValue}>{`₹${balanceData.balance.toLocaleString("en-IN")}`}</Text>
        </View>

        <Text style={[styles.popupText, { marginBottom: 24 }]}>
          You still have money in your account. Do you want to continue deleting your account or go back and withdraw?
        </Text>

        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => {
              setShowBalanceWarning(false)
              setDeleteCaptcha("")
              setDeleteAccountOpen(true)
            }}
            style={({ pressed }) => [styles.grayBtn, pressed && { backgroundColor: colors.gray[200] }]}
          >
            <Text style={styles.grayBtnText}>Continue Anyway</Text>
          </Pressable>
          <Pressable onPress={() => setShowBalanceWarning(false)} style={({ pressed }) => [styles.blackBtn, pressed && { backgroundColor: colors.gray[900] }]}>
            <Text style={styles.blackBtnText}>Cancel & Withdraw</Text>
          </Pressable>
        </View>
      </Dialog>

      {/* Delete Account Popup (the dialog rises above the keyboard while "Type DELETE" is focused) */}
      <Dialog
        open={deleteAccountOpen}
        onClose={() => {}}
        dismissible={false}
        backdropOpacity={0.8}
        style={[styles.popupCard, keyboardOffset ? { marginBottom: keyboardOffset } : null]}
      >
        {/* Icon + Title centered */}
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View style={[styles.popupIcon, { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.red[100] }]}>
            <Trash2 size={28} color={colors.red[600]} />
          </View>
          <Text style={styles.popupTitle}>Delete Your Account?</Text>
        </View>

        <Text style={[styles.popupText, { marginBottom: 16 }]}>Are you sure you want to delete your account?</Text>

        <View style={styles.warnBox}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <AlertTriangle size={16} color={colors.red[600]} />
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.red[700] }}>Warning</Text>
          </View>
          <Text style={{ fontSize: 12, lineHeight: 19, color: colors.red[700] }}>
            Your account will be Deleted. Admin will keep your historical records for revenue reporting.
          </Text>
        </View>

        <View style={{ marginBottom: 24 }}>
          <DeleteInput value={deleteCaptcha} onValue={setDeleteCaptcha} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => setDeleteAccountOpen(false)} style={({ pressed }) => [styles.cancelBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteAccount}
            disabled={isDeleting || deleteCaptcha !== "DELETE"}
            style={({ pressed }) => [
              styles.deleteBtn,
              (isDeleting || deleteCaptcha !== "DELETE") && { opacity: 0.6 },
              pressed && { backgroundColor: colors.red[800] },
            ]}
          >
            <Text style={styles.deleteBtnText}>{isDeleting ? "Deleting..." : "Delete Account"}</Text>
          </Pressable>
        </View>
      </Dialog>
    </View>
  )
}

function DeleteInput({ value, onValue }) {
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      placeholder="Type DELETE to confirm"
      value={value}
      onChangeText={(text) => onValue(text.toUpperCase())}
      autoCapitalize="characters"
      autoCorrect={false}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholderTextColor={colors.gray[400]}
      style={[
        styles.deleteInput,
        focused && { borderColor: colors.red[500] },
        value ? { fontWeight: "700", letterSpacing: 1.5 } : { fontWeight: "500" },
      ]}
    />
  )
}

export default ProfileV2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray[100] },
  loadingWrap: { flex: 1, minHeight: 400, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center" },
  headerBlock: { backgroundColor: colors.white, padding: 16, width: "100%", ...shadow.sm },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  name: { fontSize: 24, lineHeight: 32, fontWeight: "700", fontFamily: fonts.sora, color: colors.gray[900], flexShrink: 1, letterSpacing: 0.24 },
  deliveryId: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginBottom: 12, fontWeight: "500" },
  avatarWrap: { marginLeft: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.gray[200] },
  briefcase: { position: "absolute", bottom: 0, right: 0, backgroundColor: colors.white, borderRadius: 9999, padding: 8, borderWidth: 2, borderColor: colors.white, ...shadow.md },
  navGrid: { flexDirection: "row", gap: 12, marginBottom: 24 },
  navBtn: { flex: 1, backgroundColor: colors.white, borderRadius: 14, padding: 16, alignItems: "center", gap: 8, borderWidth: 1, borderColor: "transparent" },
  navIcon: { borderRadius: 9999, backgroundColor: colors.gray[50], padding: 12 },
  navText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.gray[900] },
  sectionTitle: { color: colors.gray[400], fontSize: 10, fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 2, marginBottom: 12, paddingHorizontal: 4 },
  row: { backgroundColor: colors.white, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dangerRow: {
    backgroundColor: colors.white,
    borderRadius: 19.2,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    elevation: 1,
    shadowColor: "#DC2626",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dangerLeft: { flexDirection: "row", alignItems: "center", gap: 16, flexShrink: 1 },
  dangerIcon: { height: 51.2, width: 51.2, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  dangerTitle: { fontSize: 17, lineHeight: 24, fontWeight: "700", color: RED, marginBottom: 2 },
  dangerSub: { fontSize: 13, lineHeight: 18, color: colors.gray[500], fontWeight: "500" },
  logoutCard: { maxWidth: 360, borderRadius: 28, backgroundColor: colors.white, ...shadow["2xl"] },
  logoutBody: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22, alignItems: "center", overflow: "hidden" },
  logoutBand: { position: "absolute", top: 0, left: 0, right: 0, height: 130 },
  logoutIconRing: { width: 76, height: 76, borderRadius: 38, padding: 6, marginBottom: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: alpha(BLUE, 0.22) },
  logoutIconInner: { flex: 1, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  logoutTitle: { fontSize: 22, lineHeight: 28, fontWeight: "800", color: colors.gray[900], textAlign: "center" },
  logoutText: { fontSize: 14, lineHeight: 21, color: colors.gray[500], marginTop: 6, marginBottom: 24, textAlign: "center" },
  logoutRow: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" },
  logoutNoBtn: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: colors.gray[200], backgroundColor: colors.gray[50], alignItems: "center", justifyContent: "center" },
  logoutNoText: { fontSize: 16, fontWeight: "700", color: colors.gray[700] },
  logoutYesWrap: { flex: 1, height: 50, borderRadius: 16, ...shadow.lg, shadowColor: BLUE, shadowOpacity: 0.35 },
  logoutYesBtn: { flex: 1, borderRadius: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  logoutYesText: { fontSize: 16, fontWeight: "800", color: colors.white },
  logoutAllBtn: { alignSelf: "stretch", height: 50, marginTop: 12, borderRadius: 16, borderWidth: 1.5, borderColor: BLUE, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  logoutAllText: { fontSize: 15, fontWeight: "700", color: BLUE },
  logoutPressed: { transform: [{ scale: 0.96 }] },
  cancelText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: "#6B7280" },
  popupCard: { maxWidth: 384, borderRadius: 16, backgroundColor: colors.white, padding: 24, borderWidth: 1, borderColor: "#D1DCEB", ...shadow["2xl"] },
  popupIcon: { alignItems: "center", justifyContent: "center", marginBottom: 12 },
  popupTitle: { fontSize: 20, lineHeight: 28, fontFamily: fonts.sora, fontWeight: "900", color: colors.gray[900], textAlign: "center" },
  popupText: { fontSize: 14, lineHeight: 22, color: colors.gray[600], textAlign: "center" },
  balanceBox: { backgroundColor: colors.gray[50], borderRadius: 14, padding: 16, marginBottom: 20, alignItems: "center" },
  balanceType: { fontSize: 12, lineHeight: 16, color: colors.gray[500], fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 1.2, marginBottom: 4 },
  balanceValue: { fontSize: 30, lineHeight: 36, fontFamily: fonts.sora, fontWeight: "900", color: colors.black },
  grayBtn: { width: "100%", height: 48, borderRadius: 14, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center" },
  grayBtnText: { fontSize: 16, fontWeight: "700", color: colors.gray[700] },
  blackBtn: { width: "100%", height: 48, borderRadius: 14, backgroundColor: colors.black, alignItems: "center", justifyContent: "center" },
  blackBtnText: { fontSize: 16, fontWeight: "700", color: colors.white },
  warnBox: { marginBottom: 16, backgroundColor: colors.red[50], borderLeftWidth: 4, borderLeftColor: colors.red[500], borderTopRightRadius: 14, borderBottomRightRadius: 14, padding: 12 },
  deleteInput: { width: "100%", height: 48, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2, borderColor: colors.gray[200], textAlign: "center", fontSize: 16, color: "#0F1724", backgroundColor: colors.white },
  cancelBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 2, borderColor: colors.gray[300], alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 16, fontWeight: "700", color: colors.gray[700] },
  deleteBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.red[600], alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: colors.red[600], shadowOpacity: 0.2, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  deleteBtnText: { fontSize: 16, fontWeight: "700", color: colors.white },
})
