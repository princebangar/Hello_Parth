import React, { useEffect, useMemo, useState } from "react"
import { AppState, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Polygon } from "react-native-svg"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Clock3, ShieldCheck, AlertTriangle, X } from "lucide-react-native"
import { useLocation, useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { Text } from "@/native/ui"
import { StatusBar } from "@/native/ui/SectionStatusBar"
import { alpha, colors, fonts } from "@/theme"
import apiClient from "@food/api"
import { clearModuleAuth, getPendingTicket, clearPendingTicket, setAuthData } from "@food/utils/auth"
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

function PrimaryButton({ onPress, children }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryShell, pressed && { transform: [{ scale: 0.98 }] }]}>
      <LinearGradient colors={["#0E4B9C", "#021024"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
        <Text style={styles.btnTextWhite}>{children}</Text>
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

/** The arrow-shaped "REJECTED" tag (web: clip-path polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%)) */
function RejectedTag() {
  const [w, setW] = useState(0)
  return (
    <View style={styles.tagWrap}>
      <View style={styles.tagBody} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={36} style={StyleSheet.absoluteFill}>
            <Polygon points={`0,0 ${w * 0.82},0 ${w},18 ${w * 0.82},36 0,36`} fill="#0E4B9C" />
          </Svg>
        ) : null}
        <Text style={styles.tagText}>REJECTED</Text>
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

  // Latest status from the auto-refresh poll (overrides what we navigated in with).
  const [liveStatus, setLiveStatus] = useState(null)
  const [liveMessage, setLiveMessage] = useState("")

  const localStatus = useMemo(() => {
    if (liveStatus) return liveStatus
    if (location.state?.isRejected) return "rejected"
    return sessionStorage.getItem("delivery_pendingStatus") || "pending"
  }, [location.state?.isRejected, liveStatus])

  const localMessage = useMemo(() => {
    if (liveMessage) return liveMessage
    if (location.state?.message) return location.state.message
    return sessionStorage.getItem("delivery_pendingMessage") || ""
  }, [location.state?.message, liveMessage])

  // Auto-refresh: poll with the pending ticket from OTP. Approved → the reply
  // carries a login session, so the app opens without logging in again.
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const ticket = getPendingTicket("delivery")
      if (!ticket || AppState.currentState !== "active") return
      try {
        const res = await apiClient.post(
          "/food/auth/delivery/pending-status",
          { pendingTicket: ticket },
          { contextModule: "delivery" },
        )
        const data = res?.data?.data || {}
        if (cancelled) return
        const status = String(data.status || "").toLowerCase()
        if (status === "approved" && data.accessToken) {
          setAuthData("delivery", data.accessToken, data.user, data.refreshToken)
          clearPendingTicket("delivery")
          sessionStorage.removeItem("delivery_pendingPhone")
          sessionStorage.removeItem("delivery_pendingStatus")
          sessionStorage.removeItem("delivery_pendingMessage")
          sessionStorage.removeItem("delivery_pendingRejectionReason")
          toast.success("Your account is approved! 🎉")
          hardNavigate("/food/delivery")
        } else if (status === "rejected") {
          const msg = data.rejectionReason
            ? `Your delivery partner application has been rejected. Reason: ${data.rejectionReason}`
            : "Your delivery partner application has been rejected. Please contact support."
          sessionStorage.setItem("delivery_pendingStatus", "rejected")
          sessionStorage.setItem("delivery_pendingMessage", msg)
          setLiveStatus("rejected")
          setLiveMessage(msg)
        } else if (status === "pending") {
          setLiveStatus("pending")
        }
      } catch (err) {
        if (err?.response?.status === 401) clearPendingTicket("delivery")
      }
    }
    check()
    const pollId = setInterval(check, 15000)
    // web: window focus + visibilitychange
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check()
    })
    return () => {
      cancelled = true
      clearInterval(pollId)
      sub.remove()
    }
  }, [])

  const pendingPhone = useMemo(() => {
    return (
      location.state?.phone ||
      sessionStorage.getItem("delivery_pendingPhone") ||
      ""
    )
  }, [location.state?.phone])

  const rejectionReason = useMemo(() => {
    return (
      location.state?.rejectionReason ||
      sessionStorage.getItem("delivery_pendingRejectionReason") ||
      ""
    )
  }, [location.state?.rejectionReason])

  const parsedMessage = useMemo(() => {
    if (!localMessage) {
      return {
        text: "Your delivery partner application has been rejected. Please contact support.",
        reason: rejectionReason || "",
      }
    }

    const parts = localMessage.split(/Reason:\s*/i)
    if (parts.length > 1) {
      return { text: parts[0].trim(), reason: parts[1].trim() }
    }

    return { text: localMessage, reason: rejectionReason || "" }
  }, [localMessage, rejectionReason])

  const isRejected = localStatus === "rejected"
  const [pushPermission, setPushPermission] = useState(() => getWebNotificationPermission())
  const [enablingPush, setEnablingPush] = useState(false)

  useEffect(() => {
    let cancelled = false

    const syncPushToken = async () => {
      if (!pendingPhone) return
      await setupPendingVerificationPushListeners("delivery")

      if (cancelled) return

      if (isNativeAppWebView()) {
        void syncNativeAppPushToken("delivery", pendingPhone)
      } else {
        syncPendingPartnerFcmQuick("delivery", pendingPhone)
      }

      if (typeof localStorage !== "undefined" && localStorage.getItem("delivery_accessToken")) {
        void persistModuleFcmToken("delivery").catch(() => {})
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
    if (!pendingPhone || enablingPush) return
    setEnablingPush(true)
    try {
      await enablePendingVerificationPush("delivery", pendingPhone)
      setPushPermission(getWebNotificationPermission())
    } finally {
      setEnablingPush(false)
    }
  }

  const clearPendingState = () => {
    sessionStorage.removeItem("delivery_pendingPhone")
    sessionStorage.removeItem("delivery_pendingStatus")
    sessionStorage.removeItem("delivery_pendingMessage")
    sessionStorage.removeItem("delivery_pendingRejectionReason")
    sessionStorage.removeItem("deliverySignupDetails")
    sessionStorage.removeItem("deliveryNeedsRegistration")
  }

  const handleBackToLogin = () => {
    if (pendingPhone) {
      syncPendingPartnerFcmQuick("delivery", pendingPhone)
    }
    clearModuleAuth("delivery")
    clearPendingState()
    navigate("/food/delivery/login", { replace: true })
  }

  const handleReapply = () => {
    const digits = String(pendingPhone || "").replace(/\D/g, "").slice(-10)
    sessionStorage.setItem("deliveryNeedsRegistration", "true")
    sessionStorage.setItem(
      "deliverySignupDetails",
      JSON.stringify({
        name: "",
        phone: digits,
        countryCode: "+91",
      }),
    )
    clearPendingState()
    navigate("/food/delivery/signup/details", { replace: true })
  }

  const padTop = Math.max(16, insets.top)
  const padBottom = Math.max(16, insets.bottom)

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={isRejected ? ["#FFF5F5", "#FFEBEB", "#FEF2F2"] : [colors.slate[50], "#F4F8FE", colors.slate[100]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        overScrollMode="never"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: padTop, paddingBottom: padBottom, minHeight: height }}
      >
        <View style={[styles.column, { minHeight: height - padTop - padBottom }]}>
          <View style={styles.card}>
            <View style={styles.iconRow}>
              {isRejected ? (
                <RejectedTag />
              ) : (
                <View style={styles.clockCircle}>
                  <Clock3 size={32} color={colors.amber[600]} />
                </View>
              )}
            </View>

            <View style={styles.textBlock}>
              {isRejected ? (
                <>
                  <Text style={styles.rejectedTitle}>Application Rejected</Text>
                  <Text style={styles.body}>{parsedMessage.text}</Text>
                  {parsedMessage.reason ? (
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>REASON FOR REJECTION:</Text>
                      <Text style={styles.reasonText}>{parsedMessage.reason}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.eyebrow}>VERIFICATION PENDING</Text>
                  <View style={{ maxWidth: 304, alignSelf: "center" }}>
                    <Text style={styles.pendingTitle}>Your delivery account is</Text>
                    <Text style={styles.pendingTitle}>{"under review"}</Text>
                  </View>
                  <Text style={styles.body}>
                    Admin received your onboarding details successfully. Our team will verify your delivery account and activate your dashboard once approval is complete.
                  </Text>
                </>
              )}
            </View>

            <View style={styles.infoBox}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                {isRejected ? (
                  <AlertTriangle size={20} color={colors.red[600]} style={{ marginTop: 2 }} />
                ) : (
                  <ShieldCheck size={20} color="#0E4B9C" style={{ marginTop: 2 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>{isRejected ? "What to do next" : "What happens next"}</Text>
                  <Text style={[styles.infoText, { marginTop: 4 }]}>
                    {isRejected
                      ? "Please review the reason above or reach out to support. You can register a new account if you need to submit new details."
                      : "We will notify you by email and push notification once verification is approved."}
                  </Text>
                  {pendingPhone ? (
                    <Text style={[styles.infoText, { marginTop: 8, color: colors.slate[500] }]}>
                      {"Registered phone: "}
                      <Text style={{ fontWeight: "500", color: colors.slate[700] }}>{pendingPhone}</Text>
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              {isRejected ? (
                <>
                  <PrimaryButton onPress={handleReapply}>Re-apply</PrimaryButton>
                  <OutlineButton onPress={handleBackToLogin}>Back to login</OutlineButton>
                </>
              ) : (
                <>
                  {pushPermission !== "granted" && pushPermission !== "unsupported" && !isNativeAppWebView() ? (
                    <Pressable
                      disabled={enablingPush}
                      onPress={handleEnablePush}
                      style={({ pressed }) => [styles.btn, { backgroundColor: "#15498B" }, enablingPush && { opacity: 0.7 }, pressed && { transform: [{ scale: 0.98 }] }]}
                    >
                      <Text style={styles.btnTextWhite}>{enablingPush ? "Enabling..." : "Allow Mail Notifications"}</Text>
                    </Pressable>
                  ) : null}
                  <PrimaryButton onPress={handleBackToLogin}>Back to login</PrimaryButton>
                </>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

// deliveryTheme.css: rounded-2xl / rounded-3xl get a soft shadow + border #D1DCEB
const RX = { elevation: 3, shadowColor: "#112743", shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } }

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { width: "100%", maxWidth: 448, alignSelf: "center", justifyContent: "center", paddingVertical: 8 },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    padding: 20,
    elevation: 6,
    shadowColor: "#0E4B9C",
    shadowOpacity: 0.08,
    shadowRadius: 35,
    shadowOffset: { width: 0, height: 24 },
  },
  iconRow: { marginBottom: 16, alignItems: "center", justifyContent: "center" },
  clockCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.amber[100], alignItems: "center", justifyContent: "center" },
  tagWrap: { marginVertical: 8, height: 36, flexDirection: "row", alignItems: "center" },
  tagBody: { height: 36, paddingLeft: 32, paddingRight: 40, justifyContent: "center", borderTopLeftRadius: 6, borderBottomLeftRadius: 6, overflow: "hidden" },
  tagText: { color: colors.white, fontFamily: fonts.sora, fontWeight: "800", fontSize: 13, lineHeight: 13, letterSpacing: 2.6 },
  tagDiamond: {
    position: "absolute",
    left: -16,
    top: 2,
    width: 32,
    height: 32,
    backgroundColor: "#0E4B9C",
    borderWidth: 3,
    borderColor: colors.white,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 8,
  },
  textBlock: { marginBottom: 16, alignItems: "stretch" },
  rejectedTitle: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: "800", color: colors.slate[950], textAlign: "center" },
  eyebrow: { marginBottom: 8, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 3.8, color: colors.amber[600], textAlign: "center" },
  pendingTitle: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.slate[950], textAlign: "center" },
  body: { marginTop: 12, fontSize: 14, lineHeight: 24, color: colors.slate[600], textAlign: "center" },
  reasonBox: { marginTop: 16, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "#D1DCEB", ...RX, backgroundColor: alpha(colors.red[50], 0.5) },
  reasonLabel: { color: colors.red[600], fontSize: 12, lineHeight: 16, fontFamily: fonts.sora, fontWeight: "800", letterSpacing: 1.2, marginBottom: 4 },
  reasonText: { color: colors.slate[800], fontSize: 14, lineHeight: 22, fontWeight: "500" },
  infoBox: { marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: "#D1DCEB", ...RX, backgroundColor: colors.slate[50], padding: 14 },
  infoTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.slate[900] },
  infoText: { fontSize: 14, lineHeight: 20, color: colors.slate[700] },
  primaryShell: { borderRadius: 9999, elevation: 5, shadowColor: "#0E4B9C", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  btn: { height: 48, width: "100%", borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  outline: { borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white },
  btnTextWhite: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.white },
  btnTextOutline: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.slate[700] },
})
