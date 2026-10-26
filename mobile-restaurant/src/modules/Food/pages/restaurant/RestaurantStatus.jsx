// Web: pages/restaurant/RestaurantStatus.jsx — "Restaurant status" (/status, opened from the navbar's status pill):
// restaurant name / id / area, the Delivery (My Store: "Store") status switch, the Takeaway switch (not for My Store),
// the current delivery slot from the outlet timings with "Details", the "outside your scheduled delivery timings"
// strip and the two dialogs (Outlet Timings Closed / Outside Delivery Timings). Same API calls
// (GET current restaurant, GET outlet timings, PATCH accepting-orders, PATCH takeaway settings), local key, events,
// timers and texts.
// Native: the dialogs use the converted shadcn Dialog kit (native Modal); lenis -> native scroll. The web's dialog
// icon is the literal text "??" (a broken emoji in the web source) — kept as the web shows it.
// Prince (27 Oct): the navbar said "Closed" (outside the outlet timings) while both switches here read ON. The page now
// asks the navbar's own helper (getRestaurantAvailabilityStatus) and, while the outlet is closed by its timings, shows
// both switches off with the reason ("Closed now · opens at …" / "Today is off"); turning one on opens the web's
// Outside Delivery Timings / Outlet Timings Closed dialog. The saved switch is not changed, so orders start again by
// themselves at opening time, as the navbar already showed.
import React, { useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, ChevronRight, Settings } from "lucide-react-native"
import { useLocation, useNavigate } from "@/lib/router"
import { Screen, StatusBarSpacer, Text } from "@/native/ui"
import { colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import { panelWords as sw } from "@food/utils/adminPartnerLabels"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Switch } from "@food/components/ui/switch"
import { Card, CardContent } from "@food/components/ui/card"
import { restaurantAPI } from "@food/api"
import { isMyStorePartner } from "@food/utils/auth"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
const debugLog = () => {}
const debugError = () => {}

const RESTAURANT_ONLINE_STATUS_KEY = "restaurant_online_status"
const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]
// toLocaleDateString('en-US', { weekday: 'long' }) without depending on Intl data
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const weekdayLong = (d) => WEEKDAYS[d.getDay()]
// toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) -> "Oct 26"
const dayMonthShort = (d) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`

const persistRestaurantOnlineStatus = (isOnline) => {
  try {
    localStorage.setItem(RESTAURANT_ONLINE_STATUS_KEY, JSON.stringify(Boolean(isOnline)))
  } catch (error) {
    debugError("Error persisting restaurant online status:", error)
  }
}

// Last known switch position, so coming back to this screen (e.g. from Details) shows it right away
// instead of flipping off -> on after the fetch.
const readCachedOnlineStatus = () => {
  try {
    return JSON.parse(localStorage.getItem(RESTAURANT_ONLINE_STATUS_KEY)) === true
  } catch {
    return false
  }
}

function GradientButton({ onPress, children }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.gradBtn, pressed && { opacity: 0.9 }]}>
      <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={s.gradBtnText}>{children}</Text>
    </Pressable>
  )
}

export default function RestaurantStatus() {
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useRestaurantBackNavigation()
  const insets = useSafeAreaInsets()
  const [deliveryStatus, setDeliveryStatus] = useState(readCachedOnlineStatus)
  const [takeawayStatus, setTakeawayStatus] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [isWithinTimings, setIsWithinTimings] = useState(null) // null = not calculated yet
  const [showOutletClosedDialog, setShowOutletClosedDialog] = useState(false)
  const [showOutsideTimingsDialog, setShowOutsideTimingsDialog] = useState(false)
  const [isDayClosed, setIsDayClosed] = useState(false)
  const [outletTimings, setOutletTimings] = useState(null)

  // Update current date/time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // Fetch restaurant data from backend
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          setRestaurantData(data)
          if (data.takeawaySettings) {
            setTakeawayStatus(data.takeawaySettings.isEnabled)
          }
        }
      } catch (error) {
        if (error.code !== "ERR_NETWORK" && error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
          debugError("Error fetching restaurant data:", error)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [])

  // Load outlet timings from backend (DB)
  useEffect(() => {
    const loadOutletTimings = () => {
      restaurantAPI
        .getOutletTimings()
        .then((res) => {
          const data = res?.data?.data?.outletTimings || res?.data?.outletTimings
          if (data) setOutletTimings(data)
        })
        .catch((error) => {
          debugError("Error loading outlet timings:", error)
        })
    }

    loadOutletTimings()

    // Listen for outlet timings updates
    window.addEventListener("outletTimingsUpdated", loadOutletTimings)

    return () => {
      window.removeEventListener("outletTimingsUpdated", loadOutletTimings)
    }
  }, [])

  // Check if restaurant is currently open based on outlet timings only
  useEffect(() => {
    const checkIfOpen = () => {
      const now = new Date()
      const currentDayFull = weekdayLong(now)
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTimeInMinutes = currentHour * 60 + currentMinute

      const outletTimingsData = outletTimings

      if (!outletTimingsData || !outletTimingsData[currentDayFull]) {
        // No outlet timings configured for today yet
        setIsDayClosed(false)
        setIsWithinTimings(true)
        return
      }

      const dayData = outletTimingsData[currentDayFull]
      if (dayData.isOpen === false) {
        setIsDayClosed(true)
        setIsWithinTimings(false)
        setShowOutletClosedDialog(true)
        return
      }

      if (!dayData.openingTime || !dayData.closingTime) {
        setIsDayClosed(false)
        setIsWithinTimings(true)
        return
      }

      const [openHour, openMinute] = dayData.openingTime.split(":").map(Number)
      const [closeHour, closeMinute] = dayData.closingTime.split(":").map(Number)

      const openingTimeInMinutes = openHour * 60 + openMinute
      const closingTimeInMinutes = closeHour * 60 + closeMinute

      let isWithin = false
      if (closingTimeInMinutes > openingTimeInMinutes) {
        isWithin = currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes <= closingTimeInMinutes
      } else {
        isWithin = currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes <= closingTimeInMinutes
      }

      setIsDayClosed(false)
      setIsWithinTimings(isWithin)
    }

    checkIfOpen()
    // Recheck every minute
    const interval = setInterval(checkIfOpen, 60000)

    const handleOutletTimingsUpdate = () => {
      checkIfOpen()
    }
    window.addEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)

    return () => {
      clearInterval(interval)
      window.removeEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)
    }
  }, [currentDateTime, outletTimings])

  // Load delivery status from backend
  useEffect(() => {
    const loadDeliveryStatus = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant = response?.data?.data?.restaurant || response?.data?.restaurant
        if (restaurant?.isAcceptingOrders !== undefined) {
          setDeliveryStatus(restaurant.isAcceptingOrders)
          if (restaurant.takeawaySettings) {
            setTakeawayStatus(restaurant.takeawaySettings.isEnabled)
          }
          try {
            localStorage.setItem("restaurant_online_status", JSON.stringify(Boolean(restaurant.isAcceptingOrders)))
          } catch {
            // ignore
          }
          persistRestaurantOnlineStatus(restaurant.isAcceptingOrders)
          // Dispatch event to update navbar
          window.dispatchEvent(new CustomEvent("restaurantStatusChanged", {
            detail: { isOnline: restaurant.isAcceptingOrders },
          }))
        }
      } catch (error) {
        if (error.code !== "ERR_NETWORK" && error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
          debugError("Error loading delivery status:", error)
        }
        // A failed refresh keeps the last known state instead of showing the store as offline.
      }
    }

    loadDeliveryStatus()
  }, [])

  // Same open / closed answer as the navbar pill (outlet timings only, the switch itself is ignored)
  const schedule = restaurantData
    ? getRestaurantAvailabilityStatus(
      { ...restaurantData, outletTimings: outletTimings || restaurantData.outletTimings },
      currentDateTime,
      { ignoreOperationalStatus: true },
    )
    : null
  const closedNow = Boolean(schedule && !schedule.isOpen)
  const closedDayOff = closedNow && (isDayClosed || schedule.reason === "day-closed" || schedule.reason === "closed-day")

  const showClosedDialog = () => {
    if (closedDayOff) setShowOutletClosedDialog(true)
    else setShowOutsideTimingsDialog(true)
  }

  // Handle delivery status change
  const handleDeliveryStatusChange = async (checked) => {
    // Closed by the outlet timings (day off / outside hours): don't allow turning on
    if (checked && (closedNow || isDayClosed || isWithinTimings === false)) {
      showClosedDialog()
      return
    }

    setDeliveryStatus(checked)
    try {
      try {
        await restaurantAPI.updateAcceptingOrders(checked)
        debugLog("Delivery status updated in backend:", checked)
        persistRestaurantOnlineStatus(checked)
      } catch (apiError) {
        debugError("Error updating delivery status in backend:", apiError)
        // Revert local toggle if backend fails.
        setDeliveryStatus((prev) => !prev)
        persistRestaurantOnlineStatus(!checked)
        return
      }

      try {
        localStorage.setItem("restaurant_online_status", JSON.stringify(Boolean(checked)))
      } catch {
        // ignore
      }

      // Dispatch custom event for navbar to listen
      window.dispatchEvent(new CustomEvent("restaurantStatusChanged", {
        detail: { isOnline: checked },
      }))
    } catch (error) {
      debugError("Error saving delivery status:", error)
    }
  }

  // Handle takeaway status change
  const handleTakeawayStatusChange = async (checked) => {
    if (checked && closedNow) {
      showClosedDialog()
      return
    }
    setTakeawayStatus(checked)
    try {
      await restaurantAPI.updateTakeawaySettings({ isEnabled: checked })
      debugLog("Takeaway status updated in backend:", checked)
    } catch (error) {
      debugError("Error saving takeaway status:", error)
      setTakeawayStatus((prev) => !prev)
    }
  }

  // Handle dialog close and navigate to outlet timings
  const handleGoToOutletTimings = () => {
    setShowOutletClosedDialog(false)
    navigate("/food/restaurant/outlet-timings", { state: { from: location.pathname } })
  }

  // Format time from 24-hour to 12-hour format
  const formatTime12Hour = (time24) => {
    if (!time24) return ""
    const [hours, minutes] = time24.split(":").map(Number)
    const period = hours >= 12 ? "pm" : "am"
    const hours12 = hours % 12 || 12
    const minutesStr = minutes.toString().padStart(2, "0")
    return `${hours12}:${minutesStr} ${period}`
  }

  // Get delivery timings for current day (outlet timings only)
  const getCurrentDayTimings = () => {
    const now = new Date()
    const currentDayFull = weekdayLong(now)

    // Single source of truth: outlet timings
    if (outletTimings && outletTimings[currentDayFull]) {
      const dayData = outletTimings[currentDayFull]
      if (dayData.isOpen && dayData.openingTime && dayData.closingTime) {
        return {
          openingTime: formatTime12Hour(dayData.openingTime),
          closingTime: formatTime12Hour(dayData.closingTime),
        }
      }
    }

    return null
  }

  // Format address
  const formatAddress = (loc) => {
    if (!loc) return ""
    const parts = []
    if (loc.area) parts.push(loc.area.trim())
    if (loc.city) parts.push(loc.city.trim())
    return parts.join(", ") || ""
  }

  const slotText = (() => {
    if (loading) return "Loading..."
    // If current day is closed, show "Today is Off"
    if (isDayClosed) return "Today is Off"
    const timings = getCurrentDayTimings()
    if (timings) {
      const dateStr = dayMonthShort(currentDateTime)
      return `${dateStr}, ${timings.openingTime} - ${timings.closingTime}`
    }
    return "Not configured"
  })()

  const idLine = (() => {
    if (loading) return "Loading..."
    const idPart = restaurantData?.id ? `ID: ${String(restaurantData.id).slice(-5)}` : ""
    const address = restaurantData?.location ? formatAddress(restaurantData.location) : ""
    return `${idPart}${address ? ` | ${address}` : ""}`
  })()

  const myStore = isMyStorePartner()

  const closedText = closedDayOff
    ? "Closed now · today is off"
    : `Closed now · opens at ${formatTime12Hour(schedule?.openingTime) || "your outlet time"}`
  const deliveryOn = deliveryStatus && !closedNow
  const takeawayOn = takeawayStatus && !closedNow

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
            <Text style={s.headerTitle}>{sw("Restaurant status")}</Text>
            <Text style={s.headerSub}>{sw("You are mapped to 1 restaurant")}</Text>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView style={s.flex} contentContainerStyle={[s.content, { paddingBottom: sp(6) + insets.bottom }]}>
        {/* Restaurant Information Card */}
        <Card style={s.infoCard}>
          <CardContent style={s.infoCardContent}>
            <View style={s.nameRow}>
              <View style={s.nameCol}>
                <Text style={s.name}>{loading ? "Loading..." : (restaurantData?.name || "Restaurant")}</Text>
                <Text style={s.sub}>{idLine}</Text>
              </View>
              <Pressable
                onPress={() => {
                  // Navigate to restaurant settings
                  navigate("/food/restaurant/explore", { state: { from: location.pathname } })
                }}
                style={({ pressed }) => [s.settingsBtn, { backgroundColor: pressed ? colors.gray[300] : colors.gray[200] }]}
                accessibilityLabel="Explore more"
              >
                <Settings size={20} color={colors.gray[600]} />
              </Pressable>
            </View>

            <View style={s.switchRow}>
              <View style={s.flex}>
                <Text style={s.switchTitle}>{myStore ? "Store status" : "Delivery status"}</Text>
                <View style={s.dotRow}>
                  <View style={[s.dot, { backgroundColor: deliveryOn ? colors.green[500] : closedNow ? colors.red[500] : colors.gray[600] }]} />
                  <Text style={[s.sub, closedNow && s.closedSub]}>
                    {closedNow ? closedText : deliveryStatus ? "Receiving orders" : "Not receiving orders"}
                  </Text>
                </View>
              </View>
              <Switch
                checked={deliveryOn}
                onCheckedChange={handleDeliveryStatusChange}
                style={{ marginLeft: sp(4), backgroundColor: deliveryOn ? colors.green[600] : colors.gray[300] }}
              />
            </View>

            {!myStore ? (
              <View style={s.switchRow}>
                <View style={s.flex}>
                  <Text style={s.switchTitle}>Takeaway status</Text>
                  <View style={s.dotRow}>
                    <View style={[s.dot, { backgroundColor: takeawayOn ? colors.green[500] : closedNow ? colors.red[500] : colors.gray[600] }]} />
                    <Text style={[s.sub, closedNow && s.closedSub]}>
                      {closedNow ? closedText : takeawayStatus ? "Pickup orders are enabled" : "Pickup orders are disabled"}
                    </Text>
                  </View>
                </View>
                <Switch
                  checked={takeawayOn}
                  onCheckedChange={handleTakeawayStatusChange}
                  style={{ marginLeft: sp(4), backgroundColor: takeawayOn ? colors.green[600] : colors.gray[300] }}
                />
              </View>
            ) : null}

            <View>
              <Text style={s.slotLabel}>Current delivery slot</Text>
              <View style={s.slotRow}>
                <Text style={s.slotValue}>{slotText}</Text>
                {!isDayClosed ? (
                  <Pressable
                    onPress={() => navigate("/food/restaurant/outlet-timings", { state: { from: location.pathname } })}
                    style={s.detailsBtn}
                  >
                    <Text style={s.detailsText}>Details</Text>
                    <ChevronRight size={16} color={restaurantTheme.brand} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Warning Message - Only show if outside timings AND day is not closed */}
        {(closedNow || !isWithinTimings) && restaurantData && !closedDayOff ? (
          <View style={s.warning}>
            <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.warningBadge}>
              <Text style={s.warningBang}>!</Text>
            </LinearGradient>
            <Text style={s.warningText}>You are currently outside your scheduled delivery timings.</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Outlet Closed Dialog */}
      <Dialog open={showOutletClosedDialog} onOpenChange={setShowOutletClosedDialog}>
        <DialogContent style={s.dialog}>
          <DialogHeader>
            <View style={s.dialogIcon}>
              <Text style={s.dialogIconText}>??</Text>
            </View>
            <DialogTitle style={s.dialogTitle}>Outlet Timings Closed</DialogTitle>
          </DialogHeader>
          <DialogFooter style={s.dialogFooter}>
            <Button onPress={() => setShowOutletClosedDialog(false)} variant="outline" style={s.fullBtn}>
              Cancel
            </Button>
            <GradientButton onPress={handleGoToOutletTimings}>Go to Outlet Timings</GradientButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outside Timings Dialog */}
      <Dialog open={showOutsideTimingsDialog} onOpenChange={setShowOutsideTimingsDialog}>
        <DialogContent style={s.dialog}>
          <DialogHeader>
            <View style={s.dialogIcon}>
              <Text style={s.dialogIconText}>??</Text>
            </View>
            <DialogTitle style={s.dialogTitle}>Outside Delivery Timings</DialogTitle>
            <DialogDescription style={s.dialogDesc}>
              You are currently outside your scheduled delivery timings. Please change outlet timings to enable delivery status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={s.dialogFooter}>
            <Button onPress={() => setShowOutsideTimingsDialog(false)} variant="outline" style={s.fullBtn}>
              Cancel
            </Button>
            <GradientButton
              onPress={() => {
                setShowOutsideTimingsDialog(false)
                navigate("/food/restaurant/outlet-timings", { state: { from: location.pathname } })
              }}
            >
              Change Outlet Timings
            </GradientButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  infoCard: {
    backgroundColor: colors.gray[50],
    borderWidth: 0,
    paddingVertical: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    ...shadow.sm,
  },
  infoCardContent: { padding: sp(4), gap: sp(6) },
  nameRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  nameCol: { flex: 1, minWidth: 0 },
  name: { ...fontSize.base, fontWeight: "700", color: colors.gray[900], marginBottom: sp(1) },
  sub: { ...fontSize.sm, color: colors.gray[500] },
  closedSub: { color: colors.red[600], fontWeight: "600" },
  settingsBtn: { marginLeft: sp(3), padding: sp(2), borderRadius: 9999 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchTitle: { ...fontSize.base, fontWeight: "700", color: colors.gray[900], marginBottom: sp(1.5) },
  dotRow: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  dot: { width: 8, height: 8, borderRadius: 4 },
  slotLabel: { ...fontSize.sm, color: colors.gray[700], marginBottom: sp(2) },
  slotRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slotValue: { flexShrink: 1, ...fontSize.base, fontWeight: "700", color: colors.gray[900] },
  detailsBtn: { flexDirection: "row", alignItems: "center", gap: sp(1) },
  detailsText: { ...fontSize.sm, fontWeight: "500", color: restaurantTheme.brand },
  warning: {
    backgroundColor: colors.pink[50],
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    padding: sp(4),
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(3),
  },
  warningBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  warningBang: { color: colors.white, ...fontSize.xs, fontWeight: "700" },
  warningText: { flex: 1, ...fontSize.sm, color: colors.gray[700] },
  dialog: { width: "90%", padding: sp(4), gap: sp(2) },
  dialogIcon: {
    alignSelf: "center",
    marginBottom: sp(3),
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.orange[100],
  },
  dialogIconText: { ...fontSize.base },
  dialogTitle: { ...fontSize.lg, fontWeight: "600", color: colors.gray[900], textAlign: "center" },
  dialogDesc: { marginTop: sp(2), ...fontSize.sm, color: colors.gray[600] },
  dialogFooter: { flexDirection: "column", gap: sp(2) },
  fullBtn: { width: "100%" },
  gradBtn: {
    width: "100%",
    height: 36,
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp(4),
  },
  gradBtnText: { color: colors.white, ...fontSize.sm, fontWeight: "500" },
})
