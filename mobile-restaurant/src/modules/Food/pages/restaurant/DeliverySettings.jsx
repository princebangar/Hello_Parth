// Web: pages/restaurant/DeliverySettings.jsx — "Delivery Settings" (/delivery-settings): the "Turn on delivery" switch
// (GET current restaurant -> isAcceptingOrders, PATCH accepting-orders), the turn-off confirmation dialog, the note card
// and the page's own bottom toast. Same local keys, the same `restaurantStatusChanged` event, texts and flow.
// Native: the confirmation is a Dialog (native Modal); the bottom toast is an absolute view above the bottom safe area;
// framer-motion fades / springs -> Animated; lenis and the body-scroll lock -> nothing (native scroll / Modal).
import React, { useEffect, useRef, useState } from "react"
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AlertCircle, ArrowLeft, CheckCircle, Truck } from "lucide-react-native"
import { Dialog, Screen, StatusBarSpacer, Text } from "@/native/ui"
import { colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import { panelWords as sw } from "@food/utils/adminPartnerLabels"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Switch } from "@food/components/ui/switch"
import { Card, CardContent } from "@food/components/ui/card"
import { restaurantAPI } from "@food/api"
const debugError = () => {}

const DELIVERY_STATUS_KEY = "restaurant_delivery_status"
const RESTAURANT_ONLINE_STATUS_KEY = "restaurant_online_status"
const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]

/** motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} */
function FadeUp({ delay = 0, style, children }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }).start()
  }, [v, delay])
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {children}
    </Animated.View>
  )
}

/** Tailwind animate-pulse (opacity 1 -> 0.5 -> 1, 2s) */
function Pulse({ active, style, children }) {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!active) {
      v.setValue(1)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [active, v])
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>
}

export default function DeliverySettings() {
  const goBack = useRestaurantBackNavigation()
  const insets = useSafeAreaInsets()
  const [deliveryStatus, setDeliveryStatus] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [savingStatus, setSavingStatus] = useState(false)
  const statusScale = useRef(new Animated.Value(1)).current
  const toastAnim = useRef(new Animated.Value(0)).current
  const [toastMounted, setToastMounted] = useState(false)
  const timersRef = useRef([])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  // motion.div animate={{ scale: deliveryStatus ? 1.05 : 1 }}
  useEffect(() => {
    Animated.timing(statusScale, { toValue: deliveryStatus ? 1.05 : 1, duration: 200, useNativeDriver: true }).start()
  }, [deliveryStatus, statusScale])

  // toast: spring in from y 50, out to y 50
  useEffect(() => {
    if (showSuccessToast) {
      setToastMounted(true)
      Animated.spring(toastAnim, { toValue: 1, damping: 25, stiffness: 300, useNativeDriver: true }).start()
      return undefined
    }
    const a = Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true })
    a.start(({ finished }) => {
      if (finished) setToastMounted(false)
    })
    return () => a.stop()
  }, [showSuccessToast, toastAnim])

  const syncStatusLocally = (status) => {
    const value = Boolean(status)
    try {
      localStorage.setItem(DELIVERY_STATUS_KEY, JSON.stringify(value))
      localStorage.setItem(RESTAURANT_ONLINE_STATUS_KEY, JSON.stringify(value))
    } catch (error) {
      debugError("Error saving delivery status locally:", error)
    }

    window.dispatchEvent(new CustomEvent("restaurantStatusChanged", {
      detail: { isOnline: value },
    }))
  }

  // Load delivery status from backend on mount
  useEffect(() => {
    let cancelled = false

    const loadDeliveryStatus = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant =
          response?.data?.data?.restaurant ||
          response?.data?.restaurant ||
          null
        const nextStatus = restaurant?.isAcceptingOrders === true
        if (!cancelled) {
          setDeliveryStatus(nextStatus)
          syncStatusLocally(nextStatus)
        }
      } catch (error) {
        try {
          const savedStatus = localStorage.getItem(DELIVERY_STATUS_KEY)
          if (!cancelled && savedStatus !== null) {
            setDeliveryStatus(JSON.parse(savedStatus))
          }
        } catch (_) {
          // ignore
        }

        if (error.code !== "ERR_NETWORK" && error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
          debugError("Error loading delivery status:", error)
        }
      }
    }

    loadDeliveryStatus()

    return () => {
      cancelled = true
    }
  }, [])

  // Keep backward-compatible local key in sync if another screen updates it.
  useEffect(() => {
    try {
      const savedStatus = localStorage.getItem(DELIVERY_STATUS_KEY)
      if (savedStatus !== null) {
        setDeliveryStatus(JSON.parse(savedStatus))
      }
    } catch (error) {
      if (error.code !== "ERR_NETWORK" && error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
        debugError("Error loading delivery status:", error)
      }
    }
  }, [])

  // Outlet timings are stored in DB now; this screen no longer gates delivery toggle by local schedule.
  const canEnableDelivery = true

  const showToast = (message) => {
    setToastMessage(message)
    setShowSuccessToast(true)
    timersRef.current.push(setTimeout(() => setShowSuccessToast(false), 3000))
  }

  const saveDeliveryStatus = (status) => {
    const value = Boolean(status)
    setDeliveryStatus(value)
    syncStatusLocally(value)

    if (value) {
      showToast("Delivery is now ON - You're receiving orders")
    } else {
      showToast("Delivery is now OFF - Not receiving orders")
    }
  }

  const saveDeliveryStatusToBackend = async (status) => {
    const previousStatus = deliveryStatus
    const nextStatus = Boolean(status)

    try {
      setSavingStatus(true)
      saveDeliveryStatus(nextStatus)
      await restaurantAPI.updateAcceptingOrders(nextStatus)
    } catch (error) {
      setDeliveryStatus(previousStatus)
      syncStatusLocally(previousStatus)
      debugError("Error updating delivery status:", error)
      showToast(error?.response?.data?.message || "Error updating delivery status")
      return
    } finally {
      setSavingStatus(false)
    }
  }

  const handleDeliveryStatusChange = (checked) => {
    if (savingStatus) return

    // If turning ON and outside outlet timings, show warning
    if (checked && !canEnableDelivery) {
      setPendingStatus(checked)
      setShowConfirmDialog(true)
      return
    }

    // If turning OFF, show confirmation
    if (!checked && deliveryStatus) {
      setPendingStatus(checked)
      setShowConfirmDialog(true)
      return
    }

    // Otherwise, update directly
    void saveDeliveryStatusToBackend(checked)
  }

  const handleConfirmStatusChange = () => {
    void saveDeliveryStatusToBackend(pendingStatus)
    setShowConfirmDialog(false)

    // Show warning if enabled outside timings
    if (pendingStatus && !canEnableDelivery) {
      setShowWarning(true)
      timersRef.current.push(setTimeout(() => setShowWarning(false), 5000))
    }
  }

  const handleCancelStatusChange = () => {
    setShowConfirmDialog(false)
    setPendingStatus(deliveryStatus)
  }

  return (
    <Screen bg={colors.gray[100]} edges={[]}>
      {/* Header */}
      <View style={s.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={s.headerRow}>
          <Pressable
            onPress={goBack}
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
          >
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View style={s.flex}>
            <Text style={s.headerTitle}>Delivery Settings</Text>
            <Text style={s.headerSub}>Manage your delivery status</Text>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView style={s.flex} contentContainerStyle={[s.content, { paddingBottom: sp(6) + insets.bottom }]}>
        <FadeUp>
          <Card style={s.card}>
            <CardContent style={{ padding: sp(4) }}>
              <View style={s.cardHead}>
                <View style={s.truckBox}>
                  <Truck size={20} color={colors.gray[900]} />
                </View>
                <View>
                  <Text style={s.cardTitle}>Delivery Status</Text>
                  <Text style={s.cardSub}>Control when you receive delivery orders</Text>
                </View>
              </View>

              <View style={s.toggleRow}>
                <View style={s.flex}>
                  <Text style={s.toggleTitle}>Turn on delivery</Text>
                  <Animated.View style={[s.statusRow, { transform: [{ scale: statusScale }] }]}>
                    <Pulse
                      active={deliveryStatus}
                      style={[s.statusDot, { backgroundColor: deliveryStatus ? colors.green[500] : colors.gray[600] }]}
                    />
                    <Text style={s.cardSub}>{deliveryStatus ? "Receiving orders" : "Not receiving orders"}</Text>
                  </Animated.View>
                  {!canEnableDelivery && !deliveryStatus ? (
                    <FadeUp style={s.noteRow}>
                      <AlertCircle size={12} color={restaurantTheme.primary} />
                      <Text style={[s.noteText, { color: restaurantTheme.primary }]}>You are outside outlet timings</Text>
                    </FadeUp>
                  ) : null}
                  {showWarning && deliveryStatus ? (
                    <Pulse active style={s.noteRow}>
                      <AlertCircle size={12} color={restaurantTheme.brand} />
                      <Text style={[s.noteText, { color: restaurantTheme.brand }]}>Warning: Delivery enabled outside outlet timings!</Text>
                    </Pulse>
                  ) : null}
                </View>
                <Switch
                  checked={deliveryStatus}
                  onCheckedChange={handleDeliveryStatusChange}
                  disabled={savingStatus}
                  style={{ marginLeft: sp(4), backgroundColor: deliveryStatus ? colors.green[500] : colors.gray[300] }}
                />
              </View>
            </CardContent>
          </Card>
        </FadeUp>

        {/* Info Card */}
        <FadeUp delay={100} style={{ marginTop: sp(4) }}>
          <Card style={[s.card, { backgroundColor: colors.blue[50], borderColor: colors.blue[200] }]}>
            <CardContent style={{ padding: sp(4) }}>
              <Text style={s.infoText}>
                <Text style={[s.infoText, { fontWeight: "700" }]}>Note:</Text>{" "}
                {sw("When delivery is turned off, customers won't be able to place delivery orders from your restaurant. You can turn it back on anytime.")}
              </Text>
            </CardContent>
          </Card>
        </FadeUp>
      </ScrollView>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onClose={handleCancelStatusChange} style={s.dialog}>
        <View style={s.dialogIconWrap}>
          <View style={[s.dialogIcon, { backgroundColor: pendingStatus ? colors.orange[100] : colors.red[100] }]}>
            <AlertCircle size={40} color={pendingStatus ? restaurantTheme.primary : restaurantTheme.brand} />
          </View>
        </View>

        <Text style={s.dialogTitle}>{pendingStatus ? "Enable Delivery?" : "Disable Delivery?"}</Text>

        <Text style={s.dialogText}>
          {pendingStatus
            ? !canEnableDelivery
              ? "You are currently outside your outlet timings. Are you sure you want to enable delivery?"
              : "You will start receiving delivery orders. Make sure you're ready to accept orders."
            : "Customers won't be able to place delivery orders. You can turn it back on anytime."}
        </Text>

        <View style={s.dialogBtns}>
          <Pressable
            onPress={handleCancelStatusChange}
            style={({ pressed }) => [s.dialogBtn, { backgroundColor: pressed ? colors.gray[200] : colors.gray[100] }]}
          >
            <Text style={[s.dialogBtnText, { color: colors.gray[900] }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirmStatusChange}
            style={({ pressed }) => [
              s.dialogBtn,
              { overflow: "hidden" },
              pendingStatus && { backgroundColor: pressed ? colors.green[700] : colors.green[600] },
            ]}
          >
            {!pendingStatus ? (
              <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            ) : null}
            <Text style={[s.dialogBtnText, { color: colors.white }]}>{pendingStatus ? "Enable" : "Disable"}</Text>
          </Pressable>
        </View>
      </Dialog>

      {/* Success Toast */}
      {toastMounted ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.toastWrap,
            {
              bottom: sp(6) + insets.bottom,
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) }],
            },
          ]}
        >
          <View style={s.toast}>
            <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <CheckCircle size={20} color={colors.green[400]} />
            <Text style={s.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      ) : null}
    </Screen>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3) },
  backBtn: { padding: sp(1.5), borderRadius: radius.lg },
  headerTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
  headerSub: { ...fontSize.sm, color: colors.gray[500], marginTop: 2 },
  content: { paddingHorizontal: sp(4), paddingTop: sp(6) },
  card: { backgroundColor: colors.white, borderColor: colors.gray[200], ...shadow.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(6) },
  truckBox: { padding: sp(2), backgroundColor: colors.gray[100], borderRadius: radius.lg },
  cardTitle: { ...fontSize.base, fontWeight: "700", color: colors.gray[900] },
  cardSub: { ...fontSize.sm, color: colors.gray[500] },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleTitle: { ...fontSize.base, fontWeight: "700", color: colors.gray[900], marginBottom: sp(1.5) },
  statusRow: { flexDirection: "row", alignItems: "center", gap: sp(2), alignSelf: "flex-start" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: sp(1), marginTop: sp(2) },
  noteText: { ...fontSize.xs },
  infoText: { ...fontSize.sm, color: colors.gray[700] },
  dialog: { maxWidth: 384, padding: sp(6), backgroundColor: colors.white, ...shadow["2xl"] },
  dialogIconWrap: { alignItems: "center", marginBottom: sp(4) },
  dialogIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  dialogTitle: { ...fontSize.xl, fontWeight: "700", color: colors.gray[900], marginBottom: sp(2), textAlign: "center" },
  dialogText: { ...fontSize.sm, color: colors.gray[600], marginBottom: sp(6), textAlign: "center" },
  dialogBtns: { flexDirection: "row", gap: sp(3) },
  dialogBtn: { flex: 1, paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: radius.lg, alignItems: "center" },
  dialogBtnText: { ...fontSize.base, fontWeight: "600" },
  toastWrap: { position: "absolute", left: 0, right: 0, paddingHorizontal: sp(4), alignItems: "center" },
  toast: {
    width: "100%",
    maxWidth: 448,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3),
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow["2xl"],
  },
  toastText: { flex: 1, ...fontSize.sm, fontWeight: "500", color: colors.white },
})
