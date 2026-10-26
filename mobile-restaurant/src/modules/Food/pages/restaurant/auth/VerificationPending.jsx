// Web: modules/Food/pages/restaurant/auth/VerificationPending.jsx — "under review" / rejected / disabled screen of a
// restaurant (or My Store) partner. Polls the approval status every 15 s while the app is in front (and when it comes
// back to the front); approved -> logs in by itself with the pending ticket.
import React, { useEffect, useMemo, useState } from "react"
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Polygon } from "react-native-svg"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Clock3, ShieldCheck, AlertTriangle, X, Loader2 } from "lucide-react-native"
import { useLocation, useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { Text } from "@/native/ui"
import { StatusBar } from "@/native/ui/SectionStatusBar"
import { alpha, colors, fonts, restaurantTheme } from "@/theme"
import apiClient, { restaurantAPI } from "@food/api"
import {
  clearRestaurantPendingPhone,
  getModuleToken,
  getRestaurantPendingPhone,
  clearModuleAuth,
  getPendingTicket,
  clearPendingTicket,
  setAuthData,
  readLastPartnerRole,
  getPendingPartnerType,
} from "@food/utils/auth"
import { pw } from "@food/utils/adminPartnerLabels"
import { clearOnboardingFromLocalStorage } from "@food/utils/onboardingUtils"
import {
  enablePendingVerificationPush,
  getWebNotificationPermission,
  isNativeAppWebView,
  persistModuleFcmToken,
  setupPendingVerificationPushListeners,
  syncNativeAppPushToken,
  syncPendingPartnerFcmQuick,
} from "@food/utils/firebaseMessaging"
import { hardNavigate } from "@/shared/utils/nativeShell"

const REJECT_RED = "#E51A21"

function Spinner({ color = "#ffffff", size = 16 }) {
  const spin = React.useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  )
}

/** h-12 rounded-xl gradient button (bg-gradient-to-br / to-r) */
function GradientButton({ onPress, disabled, colorsList, end = { x: 1, y: 1 }, style, children }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btnShell, style, disabled && { opacity: 0.5 }, pressed && !disabled && { transform: [{ scale: 0.98 }] }]}
    >
      <LinearGradient colors={colorsList} start={{ x: 0, y: 0 }} end={end} style={styles.btn}>
        {typeof children === "string" ? <Text style={styles.btnTextWhite}>{children}</Text> : children}
      </LinearGradient>
    </Pressable>
  )
}

function OutlineButton({ onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, styles.outline, pressed && { transform: [{ scale: 0.98 }], backgroundColor: colors.slate[50] }]}
    >
      <Text style={styles.btnTextOutline}>{children}</Text>
    </Pressable>
  )
}

/** The arrow-shaped red tag (web: clip-path polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%)) + the white-edged diamond */
function RejectedTag({ label }) {
  const [w, setW] = useState(0)
  return (
    <View style={styles.tagWrap}>
      <View style={styles.tagBody} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={36} style={StyleSheet.absoluteFill}>
            <Polygon points={`0,0 ${w * 0.82},0 ${w},18 ${w * 0.82},36 0,36`} fill={REJECT_RED} />
          </Svg>
        ) : null}
        <Text style={styles.tagText}>{label}</Text>
      </View>
      <View style={styles.tagDiamond}>
        <View style={{ transform: [{ rotate: "-45deg" }] }}>
          <X size={16} color={colors.white} strokeWidth={4} />
        </View>
      </View>
    </View>
  )
}

export default function VerificationPending() {
  const navigate = useNavigate()
  const location = useLocation()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [pushPermission, setPushPermission] = useState(() => getWebNotificationPermission())
  const [enablingPush, setEnablingPush] = useState(false)

  const [localStatus, setLocalStatus] = useState(() => {
    if (location.state?.isDisabled) {
      return "banned"
    }
    if (location.state?.isRejected !== undefined) {
      return location.state.isRejected ? "rejected" : "pending"
    }
    return localStorage.getItem("restaurant_pendingStatus") || "pending"
  })

  const [localMessage, setLocalMessage] = useState(() => {
    if (location.state?.message) {
      return location.state.message
    }
    return localStorage.getItem("restaurant_pendingMessage") || ""
  })

  const pendingPhone = useMemo(() => {
    return (
      location.state?.phone ||
      getRestaurantPendingPhone() ||
      ""
    )
  }, [location.state?.phone])

  // My Store accounts see "store" instead of "restaurant" on this screen
  const partnerKind = getPendingPartnerType() === "store" ? "store" : "restaurant"
  const w = (t) => pw(t, partnerKind)

  const parsedMessage = useMemo(() => {
    if (localStatus === "banned") {
      return {
        text: "Your restaurant has been disabled.",
        reason: "Disabled by admin",
      }
    }

    if (!localMessage) {
      return { text: "Your restaurant registration has been rejected. Please contact support.", reason: "" }
    }

    const parts = localMessage.split(/Reason:\s*/i)
    if (parts.length > 1) {
      return {
        text: parts[0].trim(),
        reason: parts[1].trim(),
      }
    }
    const colonParts = localMessage.split(/:\s*/)
    if (colonParts.length > 1 && colonParts[0].toLowerCase().includes("rejected")) {
      return {
        text: colonParts[0].trim() + ".",
        reason: colonParts[1].trim(),
      }
    }
    return {
      text: localMessage,
      reason: "",
    }
  }, [localMessage, localStatus])

  const isDisabledByAdmin = localStatus === "banned"
  const isRejectedView = localStatus === "rejected" || localStatus === "banned"

  const syncFcmBeforeLeave = () => {
    const phone = pendingPhone || getRestaurantPendingPhone() || ""
    if (phone) syncPendingPartnerFcmQuick("restaurant", phone)
  }

  useEffect(() => {
    let cancelled = false

    const syncPushToken = async () => {
      const phone =
        pendingPhone ||
        getRestaurantPendingPhone() ||
        ""

      await setupPendingVerificationPushListeners("restaurant")

      if (cancelled) return

      if (phone) {
        if (isNativeAppWebView()) {
          void syncNativeAppPushToken("restaurant", phone)
        } else {
          syncPendingPartnerFcmQuick("restaurant", phone)
        }
      }

      if (getModuleToken("restaurant")) {
        void persistModuleFcmToken("restaurant").catch(() => {})
      }

      if (!cancelled) {
        setPushPermission(getWebNotificationPermission())
      }
    }

    void syncPushToken()

    return () => {
      cancelled = true
    }
  }, [pendingPhone])

  const handleEnablePush = async () => {
    const phone = pendingPhone || getRestaurantPendingPhone() || ""
    if (!phone || enablingPush) return
    setEnablingPush(true)
    try {
      const saved = await enablePendingVerificationPush("restaurant", phone)
      setPushPermission(getWebNotificationPermission())
      if (saved) {
        toast.success("Push notifications enabled")
      } else if (getWebNotificationPermission() === "denied") {
        toast.error("Notifications blocked. Enable them in browser settings.")
      }
    } finally {
      setEnablingPush(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    // No session yet (pending accounts get none): poll with the pending ticket
    // from OTP. Approved → the response carries a login session, so the
    // dashboard opens straight away without logging in again.
    const checkWithPendingTicket = async () => {
      const ticket = getPendingTicket("restaurant")
      if (!ticket) return
      try {
        const res = await apiClient.post(
          "/food/auth/restaurant/pending-status",
          { pendingTicket: ticket },
          { contextModule: "restaurant" },
        )
        const data = res?.data?.data || {}
        if (cancelled) return
        const status = String(data.status || "").toLowerCase()
        if (status === "approved" && data.accessToken) {
          setAuthData("restaurant", data.accessToken, data.user, data.refreshToken)
          window.dispatchEvent(new Event("restaurantAuthChanged"))
          clearPendingTicket("restaurant")
          clearRestaurantPendingPhone()
          localStorage.removeItem("restaurant_pendingStatus")
          localStorage.removeItem("restaurant_pendingMessage")
          toast.success(w("Your restaurant is approved! 🎉"))
          hardNavigate("/food/restaurant")
        } else if (status === "rejected") {
          const msg = data.rejectionReason
            ? `Your restaurant registration has been rejected. Reason: ${data.rejectionReason}`
            : "Your restaurant registration has been rejected. Please contact support."
          setLocalStatus("rejected")
          setLocalMessage(msg)
          localStorage.setItem("restaurant_pendingStatus", "rejected")
          localStorage.setItem("restaurant_pendingMessage", msg)
        } else if (status === "pending") {
          setLocalStatus("pending")
          localStorage.setItem("restaurant_pendingStatus", "pending")
        }
      } catch (err) {
        // Ticket expired/invalid: drop it, the restaurant can still log in manually.
        if (err?.response?.status === 401) clearPendingTicket("restaurant")
      }
    }

    const checkApprovalStatus = async () => {
      const token = getModuleToken("restaurant")
      if (!token) {
        await checkWithPendingTicket()
        if (!cancelled) setCheckingStatus(false)
        return
      }

      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant =
          response?.data?.data?.restaurant ||
          response?.data?.restaurant ||
          response?.data?.data?.user ||
          response?.data?.user

        if (cancelled) return

        const status = String(restaurant?.status || "").toLowerCase()

        // Sync back to stored user status to keep ProtectedRoute up-to-date
        const storedUser = localStorage.getItem("restaurant_user")
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser)
            parsed.status = status
            if (restaurant?.rejectionReason) {
              parsed.rejectionReason = restaurant.rejectionReason
            }
            localStorage.setItem("restaurant_user", JSON.stringify(parsed))
          } catch {
            // ignore
          }
        }

        if (status === "approved") {
          clearRestaurantPendingPhone()
          localStorage.removeItem("restaurant_pendingStatus")
          localStorage.removeItem("restaurant_pendingMessage")
          navigate("/food/restaurant", { replace: true })
          return
        } else if (status === "banned") {
          setLocalStatus("banned")
          const msg = "Your restaurant has been disabled. Reason: Disabled by admin"
          setLocalMessage(msg)
          localStorage.setItem("restaurant_pendingStatus", "banned")
          localStorage.setItem("restaurant_pendingMessage", msg)
        } else if (status === "rejected") {
          setLocalStatus("rejected")
          const msg = restaurant.rejectionReason
            ? `Your restaurant registration has been rejected. Reason: ${restaurant.rejectionReason}`
            : "Your restaurant registration has been rejected. Please contact support."
          setLocalMessage(msg)
          localStorage.setItem("restaurant_pendingStatus", "rejected")
          localStorage.setItem("restaurant_pendingMessage", msg)
        } else if (status === "pending") {
          setLocalStatus("pending")
          localStorage.setItem("restaurant_pendingStatus", "pending")
        }
      } catch {
        // Keep the pending screen visible if the status check fails.
      } finally {
        if (!cancelled) setCheckingStatus(false)
      }
    }

    checkApprovalStatus()

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkApprovalStatus()
      }
    }

    // webCompat: visibilitychange follows the app going to / coming back from the background
    window.addEventListener("focus", handleVisibilityOrFocus)
    document.addEventListener("visibilitychange", handleVisibilityOrFocus)
    // Auto-refresh while the screen is open, so approval shows up by itself.
    const pollId = setInterval(() => {
      if (document.visibilityState === "visible") checkApprovalStatus()
    }, 15000)

    return () => {
      cancelled = true
      clearInterval(pollId)
      window.removeEventListener("focus", handleVisibilityOrFocus)
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const backToLogin = () => {
    syncFcmBeforeLeave()
    clearModuleAuth("restaurant")
    clearRestaurantPendingPhone()
    localStorage.removeItem("restaurant_pendingStatus")
    localStorage.removeItem("restaurant_pendingMessage")
    navigate("/food/restaurant/login", { replace: true })
  }

  const padTop = Math.max(16, insets.top)
  const padBottom = Math.max(16, insets.bottom)

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={isDisabledByAdmin ? ["#FFF5F5", "#FFEBEB", "#FEF2F2"] : [colors.slate[50], colors.slate[100], colors.zinc[100]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingTop: padTop, paddingBottom: padBottom, minHeight: height }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.column, { minHeight: height - 32 }]}>
          <View style={styles.card}>
            <View style={styles.iconRow}>
              {isRejectedView ? (
                <RejectedTag label={isDisabledByAdmin ? "DISABLED" : "REJECTED"} />
              ) : (
                <View style={styles.clockCircle}>
                  {/* text-amber-600 -> restaurant primary */}
                  <Clock3 size={32} color={restaurantTheme.primary} />
                </View>
              )}
            </View>

            <View style={styles.textBlock}>
              {isRejectedView ? (
                <>
                  <Text style={styles.h1}>{isDisabledByAdmin ? w("Restaurant Disabled") : "Registration Rejected"}</Text>
                  <Text style={styles.body}>{isDisabledByAdmin ? w("Your restaurant has been disabled.") : w(parsedMessage.text)}</Text>
                  {parsedMessage.reason && !isDisabledByAdmin ? (
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>Reason for Rejection:</Text>
                      <Text style={styles.reasonText}>{parsedMessage.reason}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.eyebrow}>VERIFICATION PENDING</Text>
                  <Text style={styles.h1Small}>{w("Your restaurant is")}</Text>
                  <Text style={styles.h1Small}>{"under review"}</Text>
                  <Text style={styles.body}>
                    {w("Admin received your onboarding details successfully. Our team will verify your restaurant and activate your dashboard once approval is complete.")}
                  </Text>
                </>
              )}
              {checkingStatus ? (
                <Text style={styles.checking}>CHECKING LATEST APPROVAL STATUS...</Text>
              ) : (
                <View style={styles.checkingSpacer} />
              )}
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                {isRejectedView ? (
                  <>
                    <AlertTriangle size={20} color={colors.red[600]} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>What to do next</Text>
                      <Text style={styles.infoText}>
                        {isDisabledByAdmin
                          ? "Please reach out to support for more details or assistance regarding your account status."
                          : "Please review the reason above or reach out to support. You can register a new account if you need to submit new details."}
                      </Text>
                      {pendingPhone ? (
                        <Text style={styles.phoneLine}>
                          {"Registered phone: "}
                          <Text style={styles.phoneValue}>{pendingPhone}</Text>
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={20} color={colors.emerald[600]} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>What happens next</Text>
                      <Text style={styles.infoText}>We will notify you by email and push notification once verification is approved.</Text>
                      {pendingPhone ? (
                        <Text style={styles.phoneLine}>
                          {"Registered phone: "}
                          <Text style={styles.phoneValue}>{pendingPhone}</Text>
                        </Text>
                      ) : null}
                    </View>
                  </>
                )}
              </View>
            </View>

            <View style={{ gap: 12 }}>
              {isDisabledByAdmin ? (
                <>
                  <GradientButton
                    onPress={() => navigate("/food/restaurant/help-content")}
                    colorsList={[colors.blue[500], colors.blue[600], colors.blue[700]]}
                    end={{ x: 1, y: 0 }}
                    style={styles.blueShadow}
                  >
                    Contact Support
                  </GradientButton>
                  <OutlineButton onPress={backToLogin}>Back to login</OutlineButton>
                </>
              ) : localStatus === "rejected" ? (
                <>
                  <GradientButton
                    onPress={() => {
                      clearOnboardingFromLocalStorage()
                      localStorage.removeItem("restaurant_pendingStatus")
                      localStorage.removeItem("restaurant_pendingMessage")
                      navigate(`/food/restaurant/onboarding?step=1${readLastPartnerRole() === "store" ? "&type=store" : ""}`, { replace: true })
                    }}
                    colorsList={[restaurantTheme.brand, restaurantTheme.brandDark]}
                  >
                    Re-apply
                  </GradientButton>
                  <OutlineButton onPress={backToLogin}>Back to login</OutlineButton>
                </>
              ) : (
                <>
                  {pushPermission !== "granted" && pushPermission !== "unsupported" && !isNativeAppWebView() ? (
                    <GradientButton
                      onPress={handleEnablePush}
                      disabled={enablingPush}
                      colorsList={[colors.emerald[600], colors.emerald[600]]}
                    >
                      {enablingPush ? (
                        <View style={styles.rowCenter}>
                          <Spinner />
                          <Text style={styles.btnTextWhite}>Enabling...</Text>
                        </View>
                      ) : (
                        "Allow Mail Notifications"
                      )}
                    </GradientButton>
                  ) : null}
                  <GradientButton onPress={backToLogin} colorsList={[restaurantTheme.brand, restaurantTheme.brandDark]}>
                    Back to login
                  </GradientButton>
                </>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { paddingHorizontal: 16 },
  column: { width: "100%", maxWidth: 448, alignSelf: "center", justifyContent: "center", paddingVertical: 8 },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    padding: 20,
    elevation: 10,
    shadowColor: colors.slate[900],
    shadowOpacity: 0.08,
    shadowRadius: 35,
    shadowOffset: { width: 0, height: 24 },
  },
  iconRow: { marginBottom: 16, alignItems: "center", justifyContent: "center" },
  // bg-amber-100 stays amber (only amber-50 is recoloured)
  clockCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.amber[100], alignItems: "center", justifyContent: "center" },
  tagWrap: { height: 36, flexDirection: "row", alignItems: "center", marginVertical: 8 },
  tagBody: {
    height: 36,
    paddingLeft: 32,
    paddingRight: 40,
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    overflow: "hidden",
  },
  tagText: { color: colors.white, fontFamily: fonts.outfit, fontWeight: "800", fontSize: 13, lineHeight: 14, letterSpacing: 2.6 },
  tagDiamond: {
    position: "absolute",
    left: -16,
    top: 2,
    width: 32,
    height: 32,
    backgroundColor: REJECT_RED,
    borderWidth: 3,
    borderColor: colors.white,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  textBlock: { marginBottom: 16, alignItems: "center" },
  h1: { fontSize: 20, lineHeight: 28, fontWeight: "800", color: colors.slate[950], textAlign: "center" },
  // text-amber-600 -> restaurant primary
  eyebrow: { marginBottom: 8, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 3.8, color: restaurantTheme.primary, textAlign: "center" },
  h1Small: { maxWidth: 304, fontSize: 15, lineHeight: 20, fontWeight: "800", color: colors.slate[950], textAlign: "center" },
  body: { marginTop: 12, fontSize: 14, lineHeight: 24, color: colors.slate[600], textAlign: "center" },
  reasonBox: { marginTop: 16, alignSelf: "stretch", padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.red[100], backgroundColor: alpha(colors.red[50], 0.5) },
  reasonLabel: { color: colors.red[600], fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
  reasonText: { color: colors.slate[800], fontSize: 14, lineHeight: 22, fontWeight: "500" },
  checking: { marginTop: 12, minHeight: 16, fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 2.1, color: colors.slate[400], textAlign: "center" },
  checkingSpacer: { marginTop: 12, minHeight: 16 },
  infoBox: { marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 14 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.slate[900] },
  infoText: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate[700] },
  phoneLine: { marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  phoneValue: { fontWeight: "500", color: colors.slate[700] },
  btnShell: { borderRadius: 14 },
  blueShadow: { elevation: 6, shadowColor: colors.blue[500], shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  btn: { height: 48, width: "100%", borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  outline: { borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white },
  btnTextWhite: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: "600" },
  btnTextOutline: { color: colors.slate[700], fontSize: 16, lineHeight: 24, fontWeight: "600" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
})
