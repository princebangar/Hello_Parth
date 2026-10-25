// Web: modules/Food/pages/user/dining/TableBookingSuccess.jsx — booking requested / confirmed ticket with live status
// (polls GET dining bookings every 10s, socket window event, refetch on visibility), confetti when confirmed.
import React, { useEffect, useRef, useState } from "react"
import { Animated, Pressable, ScrollView, View } from "react-native"
import { CheckCircle2, Calendar, Clock, Users, MapPin, Home, List, Info } from "lucide-react-native"
import { useLocation, useNavigate, Navigate } from "@/lib/router"
import { AppImage, Confetti, Screen, Text } from "@/native/ui"
import { alpha, colors, makeStyles, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { diningAPI } from "@food/api"
import { toast } from "@/lib/toast"

const CONFIRMED_STATUSES = ["accepted", "confirmed"]
const FINAL_STATUSES = ["accepted", "confirmed", "cancelled", "rejected"]

/** framer initial/animate entrance: opacity 0 -> 1 with an optional translateY / scale, after `delay` s. */
function Enter({ children, style, delay = 0, y = 0, scale = 1, animKey }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    v.setValue(0)
    const a = Animated.spring(v, { toValue: 1, delay: delay * 1000, useNativeDriver: true, damping: 18, stiffness: 140 })
    a.start()
    return () => a.stop()
  }, [v, delay, animKey])
  const transform = []
  if (y) transform.push({ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) })
  if (scale !== 1) transform.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) })
  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }), transform }]}>{children}</Animated.View>
}

export default function TableBookingSuccess() {
  const location = useLocation()
  const navigate = useNavigate()
  const t = useTheme()
  const s = useStyles()
  const { booking: initialBooking } = location.state || {}
  const [liveStatus, setLiveStatus] = useState(initialBooking?.status || "pending")
  const prevStatusRef = useRef(initialBooking?.status || "pending")
  const booking = initialBooking
  const [imgFailed, setImgFailed] = useState(false)
  const [confettiTick, setConfettiTick] = useState(0)
  const [confettiCount, setConfettiCount] = useState(50)
  const [origins, setOrigins] = useState({ l: { x: 0.2, y: 0.3 }, r: { x: 0.8, y: 0.3 } })

  // Poll for live status updates
  useEffect(() => {
    if (!booking?._id || FINAL_STATUSES.includes(liveStatus)) return undefined

    const fetchStatus = async () => {
      try {
        const res = await diningAPI.getBookings()
        if (res?.data?.success) {
          const all = Array.isArray(res.data.data) ? res.data.data : []
          const found = all.find((b) => String(b._id) === String(booking._id) || String(b.bookingId) === String(booking.bookingId))
          const newStatus = found?.status
          if (newStatus && newStatus !== prevStatusRef.current) {
            prevStatusRef.current = newStatus
            setLiveStatus(newStatus)
            if (CONFIRMED_STATUSES.includes(newStatus)) {
              toast.success("Your booking has been confirmed! 🎉")
            } else if (newStatus === "cancelled" || newStatus === "rejected") {
              toast.error("Your booking was not accepted.")
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)

    const onSocket = (e) => {
      const { bookingId, status } = e?.detail || {}
      if (bookingId && String(bookingId) === String(booking._id) && status) {
        prevStatusRef.current = status
        setLiveStatus(status)
      }
    }
    window.addEventListener("diningBookingStatusUpdate", onSocket)

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStatus()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      clearInterval(interval)
      window.removeEventListener("diningBookingStatusUpdate", onSocket)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [booking?._id, booking?.bookingId, liveStatus])

  const isConfirmed = CONFIRMED_STATUSES.includes(liveStatus)
  const isPending = liveStatus === "pending"

  useEffect(() => {
    if (!isConfirmed) return undefined
    // confetti for 3s from both sides (web: two bursts every 250ms with a shrinking count)
    const duration = 3 * 1000
    const animationEnd = Date.now() + duration
    const randomInRange = (min, max) => Math.random() * (max - min) + min
    const tick = () => {
      const timeLeft = animationEnd - Date.now()
      if (timeLeft <= 0) return false
      setConfettiCount(Math.max(8, Math.round(50 * (timeLeft / duration))))
      setOrigins({
        l: { x: randomInRange(0.1, 0.3), y: Math.max(0, Math.random() - 0.2) },
        r: { x: randomInRange(0.7, 0.9), y: Math.max(0, Math.random() - 0.2) },
      })
      setConfettiTick((n) => n + 1)
      return true
    }
    tick()
    const interval = setInterval(() => {
      if (!tick()) clearInterval(interval)
    }, 500)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!booking) {
    return <Navigate to="/food/user/dining" />
  }

  const formattedDate = new Date(booking.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  const loc = booking.restaurant?.location
  const locationText =
    typeof loc === "string"
      ? loc
      : loc?.addressLine1 || loc?.formattedAddress || loc?.address || `${loc?.city || ""}${loc?.area ? ", " + loc.area : ""}`
  const imageSrc = booking.restaurant?.image || booking.restaurant?.profileImage?.url || ""

  const Meta = ({ label, icon: Icon, value }) => (
    <View style={{ width: "50%", paddingHorizontal: 8, marginBottom: 16, gap: 4 }}>
      <Text style={s.metaLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon size={16} color={colors.red[500]} />
        <Text style={s.metaValue}>{value}</Text>
      </View>
    </View>
  )

  return (
    <Screen bg={t.dark ? colors.slate[950] : colors.white}>
      <AnimatedPage style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.page}>
          <Enter animKey={liveStatus} scale={0.5} style={[s.statusCircle, { backgroundColor: isPending ? (t.dark ? alpha(colors.amber[950], 0.2) : colors.amber[50]) : t.dark ? colors.slate[900] : "#F9F9FB" }]}>
            {isPending ? <Clock size={48} color={colors.amber[500]} /> : <CheckCircle2 size={48} color={colors.green[500]} />}
          </Enter>

          <Enter delay={0.2} y={20} style={{ alignItems: "center", gap: 8, marginBottom: 40 }}>
            <Text style={s.title}>{isPending ? "Booking Requested!" : "Seat Confirmed!"}</Text>
            <Text style={s.subtitle}>{isPending ? "Waiting for restaurant approval" : "Your table is ready for you"}</Text>
            <View style={{ paddingTop: 8 }}>
              <View style={s.idPill}>
                <Text style={s.idText}>BOOKING ID: {booking.bookingId}</Text>
              </View>
            </View>

            {isPending && (
              <View style={s.pendingBox}>
                <View style={s.pendingIcon}>
                  <Info size={16} color={colors.amber[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pendingTitle}>Waiting for Confirmation</Text>
                  <Text style={s.pendingText}>The restaurant will review and approve your request shortly. You'll be notified of the status.</Text>
                </View>
              </View>
            )}
          </Enter>

          {/* Ticket Card */}
          <Enter delay={0.4} y={30} style={s.ticket}>
            <View style={{ padding: 24, gap: 24, position: "relative" }}>
              <View style={[s.cutout, { left: -12 }]} />
              <View style={[s.cutout, { right: -12 }]} />

              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <View style={s.thumb}>
                  {!imgFailed && imageSrc ? (
                    <AppImage src={imageSrc} style={{ width: "100%", height: "100%", borderRadius: 12 }} contentFit="cover" onError={() => setImgFailed(true)} />
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.restName} numberOfLines={1}>
                    {booking.restaurant?.name || "The Great Indian Restaurant"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <MapPin size={12} color={t.dark ? colors.slate[500] : colors.gray[400]} />
                    <Text style={s.restLoc} numberOfLines={1}>
                      {locationText}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={s.metaGrid}>
                <Meta label="Date" icon={Calendar} value={formattedDate} />
                <Meta label="Time" icon={Clock} value={booking.timeSlot} />
                <Meta label="Guests" icon={Users} value={`${booking.guests} People`} />
                <View style={{ width: "50%", paddingHorizontal: 8, marginBottom: 16, gap: 4 }}>
                  <Text style={s.metaLabel}>Status</Text>
                  <View style={[s.statusPill, { backgroundColor: isPending ? colors.amber[500] : isConfirmed ? colors.emerald[500] : colors.red[500] }]}>
                    <Text style={s.statusPillText}>{isPending ? "PENDING" : isConfirmed ? "CONFIRMED" : String(liveStatus).toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            </View>
          </Enter>

          <Enter delay={0.6} style={{ marginTop: 48, width: "100%", maxWidth: 384, gap: 12 }}>
            <Pressable onPress={() => navigate("/food/user/bookings")} style={({ pressed }) => [s.btn, s.btnPrimary, pressed && { backgroundColor: colors.red[600] }]}>
              <List size={20} color={colors.white} />
              <Text style={[s.btnText, { color: colors.white }]}>View My Bookings</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate("/food/user")}
              style={({ pressed }) => [s.btn, s.btnOutline, pressed && { backgroundColor: t.dark ? colors.slate[800] : colors.slate[50] }]}
            >
              <Home size={20} color={t.dark ? colors.slate[300] : colors.slate[600]} />
              <Text style={[s.btnText, { color: t.dark ? colors.slate[300] : colors.slate[600] }]}>Go to Home</Text>
            </Pressable>
            <Text style={s.footnote}>Show this ticket at the restaurant for a smooth entry</Text>
          </Enter>
        </ScrollView>
      </AnimatedPage>
      <Confetti fire={confettiTick} particleCount={confettiCount} spread={180} origin={origins.l} duration={1800} />
      <Confetti fire={confettiTick} particleCount={confettiCount} spread={180} origin={origins.r} duration={1800} />
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  page: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, paddingBottom: 96 },
  statusCircle: { width: 80, height: 80, borderRadius: 9999, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "900", color: t.dark ? colors.slate[100] : colors.gray[900], textAlign: "center" },
  subtitle: { color: t.dark ? colors.slate[400] : colors.gray[500], fontWeight: "500", letterSpacing: 0.4, fontStyle: "italic", textAlign: "center" },
  idPill: {
    backgroundColor: t.dark ? colors.slate[900] : "#F9F9FB",
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.purple[400], 0.2) : alpha("#DC2626", 0.2),
  },
  idText: { color: t.dark ? colors.purple[400] : "#DC2626", fontSize: 12, lineHeight: 16, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2 },
  pendingBox: {
    marginTop: 24,
    maxWidth: 320,
    backgroundColor: t.dark ? alpha(colors.amber[950], 0.2) : colors.amber[50],
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.amber[900], 0.3) : colors.amber[100],
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    gap: 12,
  },
  pendingIcon: { backgroundColor: colors.amber[100], padding: 8, borderRadius: 12, alignSelf: "flex-start" },
  pendingTitle: { fontWeight: "700", color: t.dark ? colors.amber[300] : colors.amber[900], fontSize: 12, lineHeight: 16 },
  pendingText: { color: t.dark ? alpha(colors.amber[400], 0.8) : colors.amber[700], fontSize: 10, lineHeight: 16, marginTop: 4 },
  ticket: {
    width: "100%",
    maxWidth: 384,
    backgroundColor: t.dark ? colors.slate[900] : colors.slate[50],
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.dark ? colors.slate[800] : colors.slate[100],
    overflow: "hidden",
    ...(t.dark ? {} : { elevation: 10, shadowColor: colors.slate[200], shadowOpacity: 1, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } }),
  },
  cutout: {
    position: "absolute",
    top: "50%",
    marginTop: -12,
    width: 24,
    height: 24,
    backgroundColor: t.dark ? colors.slate[950] : colors.white,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: t.dark ? colors.slate[800] : colors.slate[100],
    zIndex: 2,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: t.dark ? colors.slate[800] : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.slate[700] : colors.slate[100],
    padding: 4,
  },
  restName: { fontWeight: "900", fontSize: 18, lineHeight: 28, color: t.dark ? colors.slate[100] : colors.gray[900] },
  restLoc: { flex: 1, fontSize: 12, lineHeight: 16, color: t.dark ? colors.slate[500] : colors.gray[400] },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
    paddingTop: 24,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: t.dark ? colors.slate[800] : colors.slate[200],
  },
  metaLabel: { fontSize: 10, lineHeight: 14, textTransform: "uppercase", fontWeight: "700", color: t.dark ? colors.slate[500] : colors.slate[400], letterSpacing: 0.5 },
  metaValue: { fontWeight: "700", color: t.dark ? colors.slate[200] : colors.gray[800] },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start" },
  statusPillText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  btn: { width: "100%", height: 56, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnPrimary: { backgroundColor: colors.red[500], elevation: 10, shadowColor: colors.red[100], shadowOpacity: 1, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
  btnOutline: { backgroundColor: t.dark ? colors.slate[900] : colors.white, borderWidth: 2, borderColor: t.dark ? colors.slate[800] : colors.slate[100] },
  btnText: { fontWeight: "700", fontSize: 18, lineHeight: 28 },
  footnote: { textAlign: "center", fontSize: 10, lineHeight: 14, fontWeight: "700", color: t.dark ? colors.slate[600] : colors.slate[300], textTransform: "uppercase", letterSpacing: 1, marginTop: 8 },
}))
