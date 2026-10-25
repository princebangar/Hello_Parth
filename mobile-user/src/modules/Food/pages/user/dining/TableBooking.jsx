// Web: modules/Food/pages/user/dining/TableBooking.jsx — pick guests / date / lunch-dinner slot for a table booking,
// seats left per slot from the restaurant's bookings, then go to the confirmation (draft also kept in sessionStorage).
import React, { useEffect, useMemo, useState } from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft } from "lucide-react-native"
import { useLocation, useNavigate, useParams } from "@/lib/router"
import { Screen, Text } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { diningAPI, restaurantAPI } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import Loader from "@food/components/Loader"
import { toast } from "@/lib/toast"

const BOOKING_DRAFT_KEY = "food_dining_booking_draft_v1"

const buildDates = (count = 7) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index)
    return date
  })

const formatTimeValue = (value) => {
  if (!value) return null
  if (/[ap]m/i.test(value)) return value.toUpperCase()
  const date = new Date(`2000-01-01T${String(value).padStart(5, "0")}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
}

const parseTimeToMinutes = (value) => {
  if (!value) return null
  const raw = String(value).trim()

  const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmmMatch) {
    return Number(hhmmMatch[1]) * 60 + Number(hhmmMatch[2])
  }

  const meridiemMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (!meridiemMatch) return null

  let hour = Number(meridiemMatch[1])
  const minute = Number(meridiemMatch[2] || 0)
  const meridiem = meridiemMatch[3].toUpperCase()

  if (meridiem === "PM" && hour !== 12) hour += 12
  if (meridiem === "AM" && hour === 12) hour = 0

  return hour * 60 + minute
}

const getDayName = (date) => date.toLocaleDateString("en-US", { weekday: "long" })

const buildSlots = (timing) => {
  if (!timing || timing.isOpen === false) return []
  const opening = parseTimeToMinutes(timing.openingTime)
  let closing = parseTimeToMinutes(timing.closingTime)
  if (opening === null || closing === null) return []

  if (closing <= opening) {
    closing += 24 * 60
  }

  const slots = []
  let cursor = opening

  while (cursor <= closing) {
    const hours = Math.floor((cursor % (24 * 60)) / 60)
    const minutes = cursor % 60
    slots.push(formatTimeValue(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`))
    cursor += 30
  }

  return slots
}

const buildFallbackTiming = (restaurant) => {
  const openingTime = String(restaurant?.openingTime || restaurant?.diningSettings?.openingTime || "12:00").trim()
  const closingTime = String(restaurant?.closingTime || restaurant?.diningSettings?.closingTime || "23:00").trim()
  return { isOpen: true, openingTime, closingTime }
}

const getMealPeriod = (slot) => {
  if (!slot) return "all"
  const normalized = String(slot).toUpperCase()
  const match = normalized.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/)
  if (!match) return "all"

  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]

  if (meridiem === "PM" && hour !== 12) hour += 12
  if (meridiem === "AM" && hour === 12) hour = 0

  const totalMinutes = hour * 60 + minute
  if (totalMinutes < 17 * 60) return "lunch"
  return "dinner"
}

// "07:00 PM", "7:00 pm" and "19:00" are the same slot
const slotKey = (v) => {
  const m = String(v || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i)
  if (!m) return String(v || "").trim().toLowerCase()
  let h = Number(m[1]) % 12
  if (!m[3]) h = Number(m[1])
  else if (/^p/i.test(m[3])) h += 12
  return `${String(h).padStart(2, "0")}:${m[2]}`
}

export default function TableBooking() {
  const { slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()

  const [restaurant, setRestaurant] = useState(location.state?.restaurant || null)
  const [loading, setLoading] = useState(!location.state?.restaurant)
  const [outletTimings, setOutletTimings] = useState({})
  const [selectedGuests, setSelectedGuests] = useState(location.state?.guestCount || 2)
  const [selectedDate, setSelectedDate] = useState(() => {
    const initial = location.state?.selectedDate ? new Date(location.state.selectedDate) : new Date()
    return Number.isNaN(initial.getTime()) ? new Date() : initial
  })
  const [selectedSlot, setSelectedSlot] = useState(location.state?.selectedTime || null)
  const [selectedMealPeriod, setSelectedMealPeriod] = useState("lunch")
  const [currentBookings, setCurrentBookings] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())

  // Real-time update for slots filtering
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  const fetchRestaurant = async () => {
    try {
      setLoading(true)
      const response = await diningAPI.getRestaurantBySlug(slug)
      if (response?.data?.success) {
        const apiRestaurant = response?.data?.data?.restaurant || response?.data?.data
        setRestaurant(apiRestaurant || null)

        const restaurantId = apiRestaurant?._id || apiRestaurant?.id || slug

        try {
          const bookingsRes = await diningAPI.getRestaurantBookings(apiRestaurant)
          if (bookingsRes.data.success) {
            setCurrentBookings(Array.isArray(bookingsRes.data.data) ? bookingsRes.data.data : [])
          }
        } catch (err) {
          console.error("Error fetching bookings:", err)
        }

        const timingsResponse = await restaurantAPI.getOutletTimingsByRestaurantId(restaurantId)
        setOutletTimings(timingsResponse?.data?.data?.outletTimings || {})
      }
    } catch {
      setRestaurant(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (location.state?.restaurant) {
      const restaurantId = location.state.restaurant?._id || location.state.restaurant?.id || slug
      restaurantAPI
        .getOutletTimingsByRestaurantId(restaurantId)
        .then((response) => setOutletTimings(response?.data?.data?.outletTimings || {}))
        .catch(() => setOutletTimings({}))

      diningAPI
        .getRestaurantBookings(location.state.restaurant)
        .then((res) => {
          if (res.data.success) setCurrentBookings(Array.isArray(res.data.data) ? res.data.data : [])
        })
        .catch(() => {})

      setLoading(false)
      return
    }

    fetchRestaurant()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.restaurant, slug])

  const occupiedSeats = useMemo(() => {
    const now = new Date()
    const THIRTY_MINUTES = 30 * 60 * 1000
    return currentBookings
      .filter((b) => {
        const isApproved = b.status === "approved" || b.status === "accepted" || b.status === "confirmed"
        const isPending = b.status === "pending"
        if (isApproved) return true
        if (isPending) {
          const createdAt = new Date(b.createdAt || b.date)
          return now - createdAt < THIRTY_MINUTES
        }
        return false
      })
      .reduce((sum, b) => sum + (Number(b.guests) || 0), 0)
  }, [currentBookings])

  const maxCapacity = restaurant?.diningSettings?.maxGuests || 10
  const remainingSeats = Math.max(0, maxCapacity - occupiedSeats)

  // Seats are counted per slot (this date + this time), same rule the server enforces when the table is booked.
  const seatsLeftInSlot = (slot) => {
    const THIRTY_MINUTES = 30 * 60 * 1000
    const now = Date.now()
    const day = selectedDate.toDateString()
    const taken = currentBookings
      .filter((b) => {
        if (slotKey(b.timeSlot) !== slotKey(slot)) return false
        if (new Date(b.date).toDateString() !== day) return false
        if (["approved", "accepted", "confirmed", "checked-in"].includes(b.status)) return true
        return b.status === "pending" && now - new Date(b.createdAt || b.date).getTime() < THIRTY_MINUTES
      })
      .reduce((sum, b) => sum + (Number(b.guests) || 0), 0)
    return Math.max(0, maxCapacity - taken)
  }

  const dates = useMemo(() => buildDates(7), [])
  const selectedDayTiming = useMemo(() => {
    const fromOutletTimings = outletTimings?.[getDayName(selectedDate)] || null
    if (fromOutletTimings && fromOutletTimings.isOpen !== false) {
      return fromOutletTimings
    }
    return buildFallbackTiming(restaurant)
  }, [outletTimings, selectedDate, restaurant])
  const allSlots = useMemo(() => buildSlots(selectedDayTiming), [selectedDayTiming])

  const availableSlots = useMemo(() => {
    const isToday = selectedDate.toDateString() === currentTime.toDateString()
    if (!isToday) return allSlots
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
    const buffer = 15
    return allSlots.filter((slot) => {
      const slotMinutes = parseTimeToMinutes(slot)
      return slotMinutes > currentMinutes + buffer
    })
  }, [allSlots, selectedDate, currentTime])

  const filteredSlots = useMemo(() => availableSlots.filter((slot) => getMealPeriod(slot) === selectedMealPeriod), [availableSlots, selectedMealPeriod])

  useEffect(() => {
    if (!selectedSlot && filteredSlots.length > 0) {
      setSelectedSlot(filteredSlots[0])
      return
    }
    if (selectedSlot && filteredSlots.length > 0 && !filteredSlots.includes(selectedSlot)) {
      setSelectedSlot(filteredSlots[0])
      return
    }
    if (filteredSlots.length === 0) {
      setSelectedSlot(null)
    }
  }, [filteredSlots, selectedSlot])

  useEffect(() => {
    if (availableSlots.length === 0) return
    const hasLunch = availableSlots.some((slot) => getMealPeriod(slot) === "lunch")
    const hasDinner = availableSlots.some((slot) => getMealPeriod(slot) === "dinner")
    if (selectedMealPeriod === "lunch" && !hasLunch && hasDinner) setSelectedMealPeriod("dinner")
    if (selectedMealPeriod === "dinner" && !hasDinner && hasLunch) setSelectedMealPeriod("lunch")
  }, [availableSlots, selectedMealPeriod])

  if (loading) return <Loader />
  if (!restaurant) {
    return (
      <Screen bg={t.dark ? "#0d0d0d" : "#f5f6fb"}>
        <Text style={{ padding: 24, textAlign: "center" }}>Restaurant not found</Text>
      </Screen>
    )
  }

  const isDiningEnabled = restaurant?.diningSettings?.isEnabled !== false
  const canProceed = Boolean(isDiningEnabled && restaurant && selectedSlot && selectedDate && selectedGuests)

  const handleProceed = () => {
    if (!isDiningEnabled) {
      toast.error("Dining bookings are currently paused for this restaurant.")
      return
    }
    if (!canProceed) {
      toast.error("Please select date, time, and guests to continue.")
      return
    }

    const bookingDraft = {
      restaurant: {
        _id: restaurant?._id || restaurant?.id || restaurant?.restaurant?._id || restaurant?.restaurant?.id || null,
        id: restaurant?.id || restaurant?._id || restaurant?.restaurant?.id || restaurant?.restaurant?._id || null,
        name: restaurant?.name || restaurant?.restaurantName || "Restaurant",
        restaurantName: restaurant?.restaurantName || restaurant?.name || "Restaurant",
        profileImage: restaurant?.profileImage || restaurant?.restaurant?.profileImage || null,
        image: restaurant?.image || restaurant?.restaurant?.image || restaurant?.profileImage?.url || "",
        location: restaurant?.location || restaurant?.restaurant?.location || null,
        slug: restaurant?.slug || slug || "",
        diningSettings: restaurant?.diningSettings || restaurant?.restaurant?.diningSettings || null,
      },
      guests: selectedGuests,
      date: selectedDate,
      timeSlot: selectedSlot,
      discount: selectedSlot,
    }

    try {
      sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(bookingDraft))
    } catch {
      /* ignore */
    }

    navigate("/food/user/dining/book-confirmation", { state: bookingDraft })
  }

  const ACTIVE_BORDER = "#ef8f98"
  const ACTIVE_BG = t.dark ? "#2a1519" : "#fffaf9"
  const IDLE_BORDER = t.dark ? alpha(colors.white, 0.1) : "#ececf2"
  const IDLE_BG = t.dark ? "#242424" : colors.white

  return (
    <Screen edges={[]} bg={t.dark ? "#0d0d0d" : "#f5f6fb"} statusBarStyle={t.dark ? "light" : "dark"}>
      <AnimatedPage style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
          <View style={{ position: "relative", overflow: "hidden", paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 40 }}>
            <LinearGradient
              colors={t.dark ? ["#1a1008", "#120f08", "#0d0d0d"] : ["#ffe7c6", "#fff1d7", "#f5f6fb"]}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={[t.dark ? "rgba(255,200,100,0.08)" : "rgba(255,255,255,0.65)", "transparent"]}
              style={{ position: "absolute", left: 0, right: 0, top: 0, height: 96 }}
            />
            <View style={{ zIndex: 10 }}>
              <Pressable onPress={goBack} style={s.backBtn}>
                <ArrowLeft size={20} color={t.dark ? colors.gray[200] : "#383838"} />
              </Pressable>
              <View style={{ marginTop: 24, alignItems: "center" }}>
                <Text style={s.title}>Book a table</Text>
                <Text style={s.subtitle}>{restaurant.name || restaurant.restaurantName}</Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: -16, paddingHorizontal: 16, gap: 16 }}>
            {!isDiningEnabled && (
              <View style={s.paused}>
                <Text style={s.pausedTitle}>Dining bookings are paused by this restaurant.</Text>
                <Text style={s.pausedText}>You can still view details, but new table bookings are disabled right now.</Text>
              </View>
            )}

            <View style={s.section}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <Text style={s.sectionTitle}>Select number of guests</Text>
                <View style={s.leftPill}>
                  <Text style={s.leftText}>{remainingSeats} left</Text>
                </View>
              </View>

              <View style={s.grid5}>
                {Array.from({ length: maxCapacity }, (_, index) => {
                  const count = index + 1
                  const isBooked = count <= occupiedSeats
                  const isTooLarge = count > remainingSeats && !isBooked
                  const active = selectedGuests === count
                  let boxStyle = { borderColor: IDLE_BORDER, backgroundColor: IDLE_BG }
                  let textColor = t.dark ? colors.gray[300] : "#444b5f"
                  if (active) {
                    boxStyle = { borderColor: ACTIVE_BORDER, backgroundColor: ACTIVE_BG, ...shadow.sm }
                    textColor = "#d64f63"
                  } else if (isBooked) {
                    boxStyle = { borderColor: alpha(colors.red[900], 0.2), backgroundColor: alpha(colors.red[900], 0.1) }
                    textColor = t.dark ? colors.red[800] : alpha(colors.red[700], 0.3)
                  } else if (isTooLarge) {
                    boxStyle = { borderColor: alpha(colors.white, 0.05), backgroundColor: alpha(colors.white, 0.05) }
                    textColor = t.dark ? colors.gray[600] : alpha(colors.gray[700], 0.2)
                  }
                  return (
                    <View key={count} style={s.grid5Cell}>
                      <Pressable disabled={isBooked || isTooLarge} onPress={() => setSelectedGuests(count)} style={[s.guestBtn, boxStyle]}>
                        <Text style={[s.guestText, { color: textColor }]}>{isBooked ? "X" : count}</Text>
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Select date</Text>
              <View style={[s.grid3, { marginTop: 16 }]}>
                {dates.slice(0, 3).map((date, index) => {
                  const active = selectedDate.toDateString() === date.toDateString()
                  return (
                    <View key={date.toISOString()} style={s.grid3Cell}>
                      <Pressable
                        onPress={() => setSelectedDate(date)}
                        style={[s.dateBtn, { borderColor: active ? ACTIVE_BORDER : IDLE_BORDER, backgroundColor: active ? ACTIVE_BG : IDLE_BG }]}
                      >
                        <Text style={s.dateDay}>
                          {index === 0 ? "Today" : index === 1 ? "Tomorrow" : date.toLocaleDateString("en-IN", { weekday: "long" })}
                        </Text>
                        <Text style={s.dateSub}>{date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</Text>
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Select time of day</Text>
              <View style={{ marginTop: 16, flexDirection: "row", gap: 8 }}>
                {[
                  { id: "lunch", label: "Lunch" },
                  { id: "dinner", label: "Dinner" },
                ].map((period) => {
                  const active = selectedMealPeriod === period.id
                  return (
                    <Pressable
                      key={period.id}
                      onPress={() => setSelectedMealPeriod(period.id)}
                      style={[
                        s.periodBtn,
                        active
                          ? { borderColor: ACTIVE_BORDER, backgroundColor: t.dark ? "#2a1519" : colors.white }
                          : { borderColor: IDLE_BORDER, backgroundColor: t.dark ? "#242424" : "#fafafc" },
                      ]}
                    >
                      <Text style={[s.periodText, { color: active ? "#d64f63" : t.dark ? colors.gray[400] : "#666f82" }]}>{period.label}</Text>
                    </Pressable>
                  )
                })}
              </View>

              <View style={[s.grid3, { marginTop: 16 }]}>
                {filteredSlots.length === 0 ? (
                  <View style={[s.noSlots, { marginHorizontal: 6 }]}>
                    <Text style={s.noSlotsText}>No {selectedMealPeriod} slots available for the selected date.</Text>
                  </View>
                ) : (
                  filteredSlots.map((slot) => {
                    const active = selectedSlot === slot
                    const seatsLeft = seatsLeftInSlot(slot)
                    const full = seatsLeft <= 0
                    const tooFew = !full && seatsLeft < selectedGuests
                    const blocked = full || tooFew
                    const box = blocked
                      ? { borderColor: IDLE_BORDER, backgroundColor: t.dark ? "#1c1c1c" : "#f1f2f6", opacity: 0.6 }
                      : active
                        ? { borderColor: ACTIVE_BORDER, backgroundColor: ACTIVE_BG }
                        : { borderColor: IDLE_BORDER, backgroundColor: IDLE_BG }
                    const seatColor = full ? colors.red[500] : seatsLeft <= 3 ? colors.amber[600] : t.dark ? colors.blue[400] : "#2d5ea8"
                    return (
                      <View key={slot} style={s.grid3Cell}>
                        <Pressable disabled={blocked} onPress={() => setSelectedSlot(slot)} style={[s.slotBtn, box]}>
                          <Text style={s.slotText}>{slot}</Text>
                          <Text style={[s.seatText, { color: seatColor }]}>{full ? "Full" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}</Text>
                        </Pressable>
                      </View>
                    )
                  })
                )}
              </View>
            </View>

            <View style={[s.section, { borderRadius: 18, paddingVertical: 20, alignItems: "center" }]}>
              <Text style={s.hint}>Select your preferred time slot to view available booking options</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[s.bottomBar, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <Pressable disabled={!canProceed} onPress={handleProceed} style={({ pressed }) => [pressed && canProceed && { transform: [{ scale: 0.98 }] }]}>
            {canProceed ? (
              <LinearGradient colors={["#DC2626", "#7f1010"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.proceed}>
                <Text style={[s.proceedText, { color: colors.white }]}>Proceed to confirmation</Text>
              </LinearGradient>
            ) : (
              <View style={[s.proceed, { backgroundColor: t.dark ? "#2a2a2a" : "#a4abba" }]}>
                <Text style={[s.proceedText, { color: t.dark ? alpha(colors.white, 0.4) : alpha(colors.white, 0.95) }]}>
                  {!isDiningEnabled ? "Dining paused" : "Select a time slot to proceed"}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </AnimatedPage>
    </Screen>
  )
}

const sectionShadow = { elevation: 3, shadowColor: "rgb(15,23,42)", shadowOpacity: 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } }

const useStyles = makeStyles((t) => ({
  backBtn: { height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: t.dark ? "#1e1e1e" : colors.white, ...shadow.sm },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: -0.75, color: t.dark ? colors.white : "#25314a" },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.gray[400] : "#636363" },
  paused: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.dark ? colors.amber[800] : colors.amber[200],
    backgroundColor: t.dark ? alpha(colors.amber[900], 0.2) : colors.amber[50],
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  pausedTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: t.dark ? colors.amber[400] : colors.amber[900] },
  pausedText: { marginTop: 4, fontSize: 12, lineHeight: 16, color: t.dark ? colors.amber[500] : colors.amber[800] },
  section: {
    borderRadius: 22,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    padding: 16,
    ...(t.dark ? { borderWidth: 1, borderColor: alpha(colors.white, 0.05) } : sectionShadow),
  },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.gray[200] : "#2f3545" },
  leftPill: { backgroundColor: t.dark ? "#2a1a1a" : "#fdfafc", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  leftText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: t.dark ? colors.red[400] : "#DC2626" },
  grid5: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, rowGap: 8 },
  grid5Cell: { width: "20%", paddingHorizontal: 4 },
  guestBtn: { height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1 },
  guestText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  grid3: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, rowGap: 12 },
  grid3Cell: { width: "33.333%", paddingHorizontal: 6 },
  dateBtn: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 16, alignItems: "center" },
  dateDay: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.gray[200] : "#444b5f", textAlign: "center" },
  dateSub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[500] : "#7b8191" },
  periodBtn: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  periodText: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  noSlots: { flex: 1, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: t.dark ? alpha(colors.white, 0.1) : "#e5e7ef", paddingHorizontal: 16, paddingVertical: 32 },
  noSlotsText: { textAlign: "center", fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[500] : "#7c8394" },
  slotBtn: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 16, alignItems: "center" },
  slotText: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.gray[200] : "#334155", textAlign: "center" },
  seatText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: "500", textAlign: "center" },
  hint: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[500] : "#6f7687", textAlign: "center" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 70,
    borderTopWidth: 1,
    borderTopColor: t.dark ? alpha(colors.white, 0.1) : "#e6e7ef",
    backgroundColor: t.dark ? "#0d0d0d" : "#f5f6fb",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  proceed: { height: 56, width: "100%", borderRadius: 16, alignItems: "center", justifyContent: "center" },
  proceedText: { fontSize: 18, lineHeight: 28, fontWeight: "700" },
}))
