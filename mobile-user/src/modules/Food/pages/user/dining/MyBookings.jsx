// Web: modules/Food/pages/user/dining/MyBookings.jsx — the user's table bookings (poll 15s, socket window event,
// refetch on visibility) with a rate & review dialog for completed ones.
import React, { useState, useEffect } from "react"
import { FlatList, Pressable, View } from "react-native"
import { ArrowLeft, Calendar, Clock, Users, MapPin, Utensils, Star, X } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { AppImage, Dialog, Screen, Text, TextInput } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import { diningAPI } from "@food/api"
import Loader from "@food/components/Loader"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Badge } from "@food/components/ui/badge"
import { toast } from "@/lib/toast"
import { Button } from "@food/components/ui/button"

const debugError = (..._args) => {}

function ReviewModal({ booking, onClose, onSubmit }) {
  const t = useTheme()
  const s = useStyles()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)

  const handleSubmit = async () => {
    if (!comment.trim()) {
      toast.error("Please add a comment")
      return
    }
    setSubmitting(true)
    await onSubmit({ bookingId: booking._id, rating, comment })
    setSubmitting(false)
  }

  return (
    <Dialog open onClose={onClose} style={s.modal}>
      <View style={s.modalHead}>
        <Text style={s.modalTitle}>Review your experience</Text>
        <Pressable onPress={onClose} style={({ pressed }) => [{ padding: 8, borderRadius: 9999 }, pressed && { backgroundColor: t.dark ? colors.slate[800] : colors.slate[100] }]}>
          <X size={20} color={t.dark ? colors.slate[500] : colors.slate[400]} />
        </Pressable>
      </View>

      <View style={{ padding: 24, gap: 24 }}>
        <View style={{ alignItems: "center" }}>
          <Text style={s.modalQ}>How was your visit to {booking.restaurant?.name}?</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)} style={({ pressed }) => [{ padding: 4 }, pressed && { transform: [{ scale: 0.9 }] }]}>
                <Star
                  size={40}
                  color={star <= rating ? colors.yellow[400] : t.dark ? colors.slate[700] : colors.slate[200]}
                  fill={star <= rating ? colors.yellow[400] : "transparent"}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={s.modalLabel}>Share your feedback</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Write about the food, service, and atmosphere..."
            placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
            multiline
            textAlignVertical="top"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            cursorColor={t.dark ? "#ffffff" : "#0f172a"}
            style={[s.textarea, focused && { borderWidth: 2, borderColor: colors.red[500], padding: 14 }]}
          />
        </View>

        <Button
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [s.submit, pressed && { backgroundColor: colors.red[600] }]}
          textStyle={{ color: colors.white, fontWeight: "700" }}
        >
          {submitting ? "Submitting..." : "Submit Review"}
        </Button>
      </View>
    </Dialog>
  )
}

export default function MyBookings() {
  const navigate = useNavigate()
  const t = useTheme()
  const s = useStyles()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [failedImages, setFailedImages] = useState({})

  const getStatusLabel = (status) => {
    const key = String(status || "").toLowerCase()
    if (key === "pending") return "Approval Reqd"
    if (key === "accepted" || key === "confirmed") return "Confirmed"
    if (key === "checked-in") return "Checked-in"
    if (key === "completed") return "Completed"
    if (key === "cancelled") return "Cancelled"
    return String(status || "unknown")
  }

  const getStatusBadge = (status) => {
    const key = String(status || "").toLowerCase()
    if (key === "pending") return { bg: colors.amber[100], fg: colors.amber[700] }
    if (key === "accepted" || key === "confirmed") return { bg: colors.green[100], fg: colors.green[700], bold: true }
    if (key === "checked-in") return { bg: "#F9F9FB", fg: "#DC2626" }
    if (key === "completed") return { bg: colors.blue[100], fg: colors.blue[700] }
    if (key === "cancelled") return { bg: colors.red[100], fg: colors.red[700] }
    return { bg: colors.slate[100], fg: colors.slate[700] }
  }

  const fetchBookings = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true)
      const response = await diningAPI.getBookings()
      if (response.data.success) {
        setBookings(response.data.data)
      }
    } catch (error) {
      debugError("Error fetching bookings:", error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchBookings()

    const interval = setInterval(() => fetchBookings({ silent: true }), 15000)

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchBookings({ silent: true })
    }
    document.addEventListener("visibilitychange", onVisible)

    const onSocketUpdate = (e) => {
      const { bookingId, status } = e?.detail || {}
      if (bookingId && status) {
        setBookings((prev) => prev.map((b) => (String(b._id) === String(bookingId) ? { ...b, status } : b)))
      } else {
        fetchBookings({ silent: true })
      }
    }
    window.addEventListener("diningBookingStatusUpdate", onSocketUpdate)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("diningBookingStatusUpdate", onSocketUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReviewSubmit = async (reviewData) => {
    try {
      const response = await diningAPI.createReview(reviewData)
      if (response.data.success) {
        toast.success("Review submitted! Thank you for your feedback.")
        setSelectedBooking(null)
      }
    } catch (error) {
      debugError("Error submitting review:", error)
      toast.error(error.response?.data?.message || "Failed to submit review")
    }
  }

  if (loading) return <Loader />

  const Chip = ({ icon: Icon, children }) => (
    <View style={s.chip}>
      <Icon size={12} color={t.dark ? colors.gray[300] : colors.gray[600]} />
      <Text style={s.chipText}>{children}</Text>
    </View>
  )

  const renderItem = ({ item: booking }) => {
    const loc = booking.restaurant?.location
    const locationText =
      typeof loc === "string" ? loc : loc?.addressLine1 || loc?.formattedAddress || loc?.address || `${loc?.city || ""}${loc?.area ? ", " + loc.area : ""}`
    const badge = getStatusBadge(booking.status)
    const img = booking.restaurant?.image || booking.restaurant?.profileImage?.url || ""
    return (
      <View style={s.card}>
        <View style={s.thumb}>
          {img && !failedImages[booking._id] ? (
            <AppImage
              src={img}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              accessibilityLabel={booking.restaurant?.name}
              onError={() => setFailedImages((p) => ({ ...p, [booking._id]: true }))}
            />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <Text style={s.name} numberOfLines={1}>
              {booking.restaurant?.name}
            </Text>
            <Badge
              style={{ backgroundColor: badge.bg, borderColor: "transparent", opacity: t.dark ? 0.8 : 1 }}
              textStyle={{ color: badge.fg, fontWeight: badge.bold ? "700" : "500" }}
            >
              {getStatusLabel(booking.status)}
            </Badge>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <MapPin size={12} color={t.dark ? colors.gray[400] : colors.gray[500]} />
            <Text style={s.loc} numberOfLines={1}>
              {locationText}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12, flexWrap: "wrap", rowGap: 6 }}>
            <Chip icon={Calendar}>{new Date(booking.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Chip>
            <Chip icon={Clock}>{booking.timeSlot}</Chip>
            <Chip icon={Users}>{`${booking.guests} Guests`}</Chip>
          </View>

          {booking.status === "completed" && (
            <Pressable onPress={() => setSelectedBooking(booking)} style={({ pressed }) => [s.rateBtn, pressed && { backgroundColor: colors.red[100] }]}>
              <Text style={s.rateText}>RATE & REVIEW</Text>
            </Pressable>
          )}
        </View>
      </View>
    )
  }

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.slate[50]}>
      <AnimatedPage style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable onPress={() => navigate(-1)} hitSlop={8}>
            <ArrowLeft size={24} color={t.dark ? colors.white : colors.gray[700]} />
          </Pressable>
          <Text style={s.headerTitle}>My Table Bookings</Text>
        </View>

        <FlatList
          data={bookings}
          keyExtractor={(b, i) => String(b._id ?? i)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 16 + 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 80 }}>
              <View style={s.emptyIcon}>
                <Utensils size={32} color={t.dark ? colors.gray[600] : colors.slate[300]} />
              </View>
              <Text style={s.emptyTitle}>No bookings yet</Text>
              <Text style={s.emptyText}>Book your favorite restaurant for a great dining experience!</Text>
              {/* web: <Link to="/dining"> (not a route there); the app opens the Dining tab */}
              <Pressable onPress={() => navigate("/food/user/dining")} style={s.bookBtn}>
                <Text style={s.bookText}>Book a table</Text>
              </Pressable>
            </View>
          }
        />
      </AnimatedPage>

      {selectedBooking && <ReviewModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} onSubmit={handleReviewSubmit} />}
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  header: {
    backgroundColor: t.dark ? "#0a0a0a" : colors.white,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : "#e6e0d1",
    ...shadow.sm,
  },
  headerTitle: { marginLeft: 16, fontSize: 20, lineHeight: 28, fontWeight: "600", color: t.dark ? colors.white : colors.gray[800] },
  card: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.slate[100],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    ...shadow.sm,
  },
  thumb: { width: 80, height: 80, borderRadius: 12, overflow: "hidden", backgroundColor: t.dark ? colors.gray[800] : colors.slate[100] },
  name: { flex: 1, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  loc: { flex: 1, fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: t.dark ? colors.gray[800] : colors.slate[100], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  chipText: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: t.dark ? colors.gray[300] : colors.gray[600] },
  rateBtn: {
    marginTop: 12,
    width: "100%",
    paddingVertical: 8,
    backgroundColor: t.dark ? alpha(colors.red[950], 0.2) : colors.red[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.red[900], 0.3) : colors.red[100],
    alignItems: "center",
  },
  rateText: { color: t.dark ? colors.red[400] : colors.red[600], fontSize: 11, lineHeight: 16, fontWeight: "700" },
  emptyIcon: { backgroundColor: t.dark ? colors.gray[800] : colors.slate[100], width: 64, height: 64, borderRadius: 9999, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: t.dark ? colors.white : colors.gray[800] },
  emptyText: { color: t.dark ? colors.gray[400] : colors.gray[500], fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: "center" },
  bookBtn: { marginTop: 24, backgroundColor: colors.red[500], paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, ...shadow.lg, shadowColor: colors.red[200] },
  bookText: { color: colors.white, fontWeight: "700" },
  modal: { maxWidth: 448, backgroundColor: t.dark ? colors.slate[900] : colors.white, borderRadius: 24, borderWidth: t.dark ? 1 : 0, borderColor: colors.slate[800], ...shadow["2xl"] },
  modalHead: { padding: 24, borderBottomWidth: 1, borderBottomColor: t.dark ? colors.slate[800] : colors.slate[100], flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 20, lineHeight: 28, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900], flex: 1 },
  modalQ: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.slate[500], marginBottom: 12, textAlign: "center" },
  modalLabel: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: t.dark ? colors.gray[300] : colors.slate[700] },
  textarea: { width: "100%", height: 128, padding: 16, backgroundColor: t.dark ? colors.slate[800] : colors.slate[50], borderRadius: 16, fontSize: 14, lineHeight: 20, color: t.dark ? colors.white : colors.gray[900] },
  submit: { width: "100%", backgroundColor: colors.red[500], height: 48, borderRadius: 16, ...shadow.lg, shadowColor: colors.red[200] },
}))
