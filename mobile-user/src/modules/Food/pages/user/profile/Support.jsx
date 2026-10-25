// Web: modules/Food/pages/user/profile/Support.jsx — support tickets: pick type -> order / restaurant / other -> submit;
// "My Tickets" list. Step + selection survive in sessionStorage exactly as on the web.
import { StatusBarScrim } from '@/native/ui/StatusBarScrim';
import { useEffect, useRef, useState } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Building2, HelpCircle, ShoppingBag, ChevronRight } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"
import { Card, CardContent } from "@food/components/ui/card"
import { orderAPI, restaurantAPI, supportAPI, authAPI } from "@food/api"

const RED = "#DC2626"

function PickCard({ icon: Icon, title, text, onPress }) {
  const s = useStyles()
  const t = useTheme()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.pickCard, pressed && s.pickCardPressed]}>
      {({ pressed }) => (
        <>
          <View style={s.pickHead}>
            <View style={[s.pickIcon, pressed && { backgroundColor: alpha(RED, 0.1) }]}>
              <Icon size={20} color={pressed ? RED : t.dark ? colors.slate[300] : colors.slate[700]} />
            </View>
            <ChevronRight size={20} color={pressed ? RED : colors.slate[300]} />
          </View>
          <Text style={[s.pickTitle, pressed && { color: RED }]}>{title}</Text>
          <Text style={s.pickText}>{text}</Text>
        </>
      )}
    </Pressable>
  )
}

export default function Support() {
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(() => sessionStorage.getItem("support_step") || "pick")
  const [type, setType] = useState(() => sessionStorage.getItem("support_type") || "")
  const [orders, setOrders] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(() => {
    const saved = sessionStorage.getItem("support_selectedOrder");
    return saved ? JSON.parse(saved) : null;
  })
  const [selectedRestaurant, setSelectedRestaurant] = useState(() => {
    const saved = sessionStorage.getItem("support_selectedRestaurant");
    return saved ? JSON.parse(saved) : null;
  })
  const [issueType, setIssueType] = useState(() => sessionStorage.getItem("support_issueType") || "")
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [tickets, setTickets] = useState([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingRestaurants, setLoadingRestaurants] = useState(false)
  const [orderSearch, setOrderSearch] = useState("")
  const [restaurantSearch, setRestaurantSearch] = useState("")
  const [orderSearchFocused, setOrderSearchFocused] = useState(false)
  const [restaurantSearchFocused, setRestaurantSearchFocused] = useState(false)
  const blurTimers = useRef([])

  useEffect(() => () => blurTimers.current.forEach(clearTimeout), [])

  useEffect(() => {
    sessionStorage.setItem("support_step", step)
    sessionStorage.setItem("support_type", type)
    sessionStorage.setItem("support_issueType", issueType)
    if (selectedOrder) sessionStorage.setItem("support_selectedOrder", JSON.stringify(selectedOrder))
    else sessionStorage.removeItem("support_selectedOrder")
    if (selectedRestaurant) sessionStorage.setItem("support_selectedRestaurant", JSON.stringify(selectedRestaurant))
    else sessionStorage.removeItem("support_selectedRestaurant")
  }, [step, type, issueType, selectedOrder, selectedRestaurant])

  useEffect(() => {
    setLoadingTickets(true)
    authAPI
      .getCurrentUser()
      .catch(() => null)
      .finally(async () => {
        try {
          const res = await supportAPI.getMyTickets()
          const list = res?.data?.data?.tickets || res?.data?.tickets || []
          setTickets(list)
        } catch (_) {}
        setLoadingTickets(false)
      })

    // If we restored state and need orders/restaurants loaded for current step
    if (step === "choose_order" || step === "order_issue") fetchOrders()
    if (step === "choose_restaurant" || step === "restaurant_issue") fetchRestaurants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const orderIssues = ["Item missing", "Wrong item", "Not delivered", "Payment issue"]
  const restaurantIssues = ["Bad service", "Wrong info", "Other"]

  const fetchOrders = async () => {
    setLoadingOrders(true)
    try {
      const res = await orderAPI.getOrders({ limit: 10, page: 1 })
      const list = res?.data?.data?.orders || res?.data?.orders || []
      setOrders(list)
    } catch {
      toast.error("Failed to load orders")
    } finally {
      setLoadingOrders(false)
    }
  }

  const fetchRestaurants = async () => {
    setLoadingRestaurants(true)
    try {
      const res = await restaurantAPI.getRestaurants({ limit: 20, page: 1 })
      const list = res?.data?.data?.restaurants || res?.data?.restaurants || []
      setRestaurants(list)
    } catch {
      toast.error("Failed to load restaurants")
    } finally {
      setLoadingRestaurants(false)
    }
  }

  const handlePick = (t) => {
    setType(t)
    setOrderSearch("")
    setRestaurantSearch("")
    if (t === "order") {
      fetchOrders()
      setStep("choose_order")
    } else if (t === "restaurant") {
      fetchRestaurants()
      setStep("choose_restaurant")
    } else {
      setStep("other_form")
    }
  }

  const submitTicket = async (payload) => {
    setSubmitting(true)
    try {
      const res = await supportAPI.createTicket(payload)
      const data = res?.data
      if (!data?.success) throw new Error(data?.message || "Failed")
      toast.success("Ticket created")
      setTickets((prev) => [data?.data?.ticket, ...prev])
      setStep("pick")
      setType("")
      setSelectedOrder(null)
      setSelectedRestaurant(null)
      setIssueType("")
      setSubject("")
      setDescription("")
    } catch (e) {
      const message =
        e?.response?.data?.message ||
        e?.message ||
        "Failed to create ticket"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const statusTone = (status) => {
    const st = String(status || "").toLowerCase()
    if (st === "resolved" || st === "closed") return { bg: colors.green[100], fg: colors.green[700] }
    if (st === "open") return { bg: colors.amber[100], fg: colors.amber[700] }
    return { bg: colors.slate[100], fg: colors.slate[700] }
  }

  const getOrderLabel = (order) => {
    const restaurantName = order?.restaurantName || order?.restaurantId?.restaurantName || order?.restaurant?.restaurantName || "Restaurant"
    const dateValue = order?.createdAt || order?.date
    const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString() : "No date"
    const amount = order?.pricing?.total ?? order?.total ?? 0
    return `${restaurantName} • ${dateLabel} • ₹${amount}`
  }

  const getRestaurantLabel = (restaurant) => {
    const name = restaurant?.restaurantName || restaurant?.name || "Restaurant"
    const location = restaurant?.city || restaurant?.area || ""
    return `${name}${location ? ` • ${location}` : ""}`
  }

  const filteredOrders = orders.filter((order) => {
    const q = orderSearch.trim().toLowerCase()
    if (!q) return true
    const restaurantName = (order?.restaurantName || order?.restaurant?.restaurantName || "").toLowerCase()
    const orderId = String(order?._id || order?.id || "").toLowerCase()
    return restaurantName.includes(q) || orderId.includes(q)
  })

  const filteredRestaurants = restaurants.filter((restaurant) => {
    const q = restaurantSearch.trim().toLowerCase()
    if (!q) return true
    const name = String(restaurant?.restaurantName || restaurant?.name || "").toLowerCase()
    const city = String(restaurant?.city || restaurant?.area || "").toLowerCase()
    const id = String(restaurant?._id || restaurant?.id || "").toLowerCase()
    return name.includes(q) || city.includes(q) || id.includes(q)
  })

  const handleOrderSearchChange = (value) => {
    setOrderSearch(value)
  }

  const handleRestaurantSearchChange = (value) => {
    setRestaurantSearch(value)
  }

  const navigate = useNavigate()

  const handleTopBack = () => {
    if (step === "pick") {
      navigate(-1);
      return;
    }
    if (step === "order_issue") setStep("choose_order");
    else if (step === "restaurant_issue") setStep("choose_restaurant");
    else setStep("pick");
  }

  const blurLater = (setter) => () => {
    blurTimers.current.push(setTimeout(() => setter(false), 200))
  }

  const ticketList = (
    <Card style={s.whiteCard}>
      <CardContent style={{ padding: sp(4) }}>
        <View style={s.ticketsHead}>
          <Text style={s.ticketsTitle}>My Tickets</Text>
          <View style={s.countPill}>
            <Text style={s.countText}>{tickets.length}</Text>
          </View>
        </View>

        {loadingTickets ? (
          <Text style={s.slateMuted}>Loading tickets...</Text>
        ) : tickets.length === 0 ? (
          <Text style={s.slateMuted}>No tickets yet</Text>
        ) : (
          <View style={{ gap: sp(2) }}>
            {tickets.map((tk, index) => {
              const tone = statusTone(tk?.status)
              return (
                <View key={String(tk?._id || tk?.id || index)} style={s.ticket}>
                  <View style={s.ticketRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.ticketTitle}>
                        #{String(tk?._id || tk?.id).slice(-6)} • {tk?.type} • {tk?.issueType}
                      </Text>
                      <Text style={s.ticketDate}>{new Date(tk?.createdAt).toLocaleDateString()}</Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: tone.bg }]}>
                      <Text style={[s.statusText, { color: tone.fg }]}>{tk?.status}</Text>
                    </View>
                  </View>
                  {tk?.adminResponse ? <Text style={s.reply}>Reply: {tk.adminResponse}</Text> : null}
                </View>
              )
            })}
          </View>
        )}
      </CardContent>
    </Card>
  )

  const stepHeader = (title, text) => (
    <View style={s.stepHead}>
      <Text style={s.stepTitle}>{title}</Text>
      <Text style={s.stepText}>{text}</Text>
    </View>
  )

  const goBackButton = (
    <View style={s.goBackWrap}>
      <Button variant="outline" onPress={() => setStep("pick")} style={s.goBackButton} textStyle={s.goBackText}>
        Go Back
      </Button>
    </View>
  )

  const submitButton = (onPress, disabled) => (
    <Button
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.submitButton, pressed && { backgroundColor: "#B91C1C" }]}
      textStyle={s.submitText}
    >
      {submitting ? "Submitting..." : "Submit Ticket"}
    </Button>
  )

  const issueGrid = (list) => (
    <View style={s.issueGrid}>
      {list.map((it) => (
        <Button key={it} variant={issueType === it ? "default" : "outline"} onPress={() => setIssueType(it)} style={s.issueButton}>
          {it}
        </Button>
      ))}
    </View>
  )

  const fieldStyle = s.field

  return (
    <AnimatedPage style={s.page}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(20) }]}
      >
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={handleTopBack} style={({ pressed }) => [s.backButton, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityLabel="Go back">
            <ArrowLeft size={20} color={t.dark ? colors.white : colors.slate[800]} />
          </Pressable>
          <Text style={s.headerTitle}>Help & Support</Text>
        </View>

        <Card style={s.heroCard}>
          <LinearGradient
            colors={t.dark ? [alpha(RED, 0.1), "#1a1a1a"] : [alpha(RED, 0.05), colors.white]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.fill}
            pointerEvents="none"
          />
          <CardContent style={{ padding: sp(5) }}>
            <View style={s.glow} pointerEvents="none" />
            <View>
              <Text style={s.heroTitle}>How can we help you?</Text>
              <Text style={s.heroText}>Raise a support ticket and track updates seamlessly.</Text>
            </View>
          </CardContent>
        </Card>

        <Card style={[s.whiteCard, { marginBottom: sp(3) }]}>
          <CardContent style={{ padding: sp(4), gap: sp(4) }}>
            {step === "pick" && (
              <View style={{ gap: sp(3) }}>
                <PickCard icon={ShoppingBag} title="Order Issue" text="Missing item, wrong item, delivery issue" onPress={() => handlePick("order")} />
                <PickCard icon={Building2} title="Restaurant Issue" text="Service, listing info, behavior report" onPress={() => handlePick("restaurant")} />
                <PickCard icon={HelpCircle} title="Other Issue" text="Account, app, payment or general query" onPress={() => handlePick("other")} />
              </View>
            )}

            {step === "choose_order" && (
              <View style={{ gap: sp(4) }}>
                {stepHeader("Order Issue", "Select an order below to report your issue")}
                {loadingOrders ? (
                  <Text style={s.infoBox}>Loading orders...</Text>
                ) : orders.length > 0 ? (
                  <View style={{ gap: sp(2) }}>
                    <Input
                      value={orderSearch}
                      onChangeText={handleOrderSearchChange}
                      onFocus={() => setOrderSearchFocused(true)}
                      onBlur={blurLater(setOrderSearchFocused)}
                      placeholder="Search order"
                      placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                      style={[fieldStyle, { marginBottom: sp(3) }]}
                    />
                    {orderSearchFocused && orderSearch.trim().length > 0 && (
                      <ScrollView style={s.resultsBox} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <View style={{ gap: sp(1) }}>
                          {filteredOrders.map((o, index) => (
                            <Pressable
                              key={String(o?._id || o?.id || index)}
                              onPress={() => {
                                setSelectedOrder(o)
                                setStep("order_issue")
                              }}
                              style={({ pressed }) => [s.resultItem, { padding: 14 }, pressed && s.resultItemPressed]}
                            >
                              <Text style={s.resultText}>{getOrderLabel(o)}</Text>
                            </Pressable>
                          ))}
                          {filteredOrders.length === 0 && <Text style={s.noMatch}>No matching orders found</Text>}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                ) : (
                  <Text style={s.infoBox}>No recent orders found</Text>
                )}
                {goBackButton}
              </View>
            )}

            {step === "order_issue" && selectedOrder && (
              <View style={{ gap: sp(4) }}>
                {stepHeader("Order Issue Details", "What went wrong with your order?")}
                {issueGrid(orderIssues)}
                <Textarea
                  placeholder="Describe the issue (optional)"
                  placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                  value={description}
                  onChangeText={setDescription}
                  style={[fieldStyle, s.textarea, { minHeight: 100 }]}
                />
                <View style={s.actions}>
                  {submitButton(
                    () => submitTicket({ type: "order", orderId: selectedOrder._id || selectedOrder.id, issueType, description }),
                    !issueType || submitting,
                  )}
                  <Button variant="outline" onPress={() => setStep("pick")} style={s.cancelButton}>
                    Cancel
                  </Button>
                </View>
              </View>
            )}

            {step === "choose_restaurant" && (
              <View style={{ gap: sp(4) }}>
                {stepHeader("Restaurant Issue", "Select a restaurant below to report your issue")}
                {loadingRestaurants ? (
                  <Text style={s.infoBox}>Loading restaurants...</Text>
                ) : restaurants.length > 0 ? (
                  <View style={{ gap: sp(2) }}>
                    <Input
                      value={restaurantSearch}
                      onChangeText={handleRestaurantSearchChange}
                      onFocus={() => setRestaurantSearchFocused(true)}
                      onBlur={blurLater(setRestaurantSearchFocused)}
                      placeholder="Search restaurant"
                      placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                      style={[fieldStyle, { marginBottom: sp(3) }]}
                    />
                    {restaurantSearchFocused && restaurantSearch.trim().length > 0 && (
                      <ScrollView style={s.resultsBox} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <View style={{ gap: sp(1) }}>
                          {filteredRestaurants.map((r, index) => (
                            <Pressable
                              key={String(r?._id || r?.id || index)}
                              onPress={() => {
                                setSelectedRestaurant(r)
                                setStep("restaurant_issue")
                              }}
                              style={({ pressed }) => [s.resultItem, { padding: sp(3), borderRadius: 8 }, pressed && s.resultItemPressed]}
                            >
                              <Text style={[s.resultText, { ...fontSize.sm }]}>{getRestaurantLabel(r)}</Text>
                            </Pressable>
                          ))}
                          {filteredRestaurants.length === 0 && <Text style={s.noMatch}>No matching restaurants found</Text>}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                ) : (
                  <Text style={s.infoBox}>No restaurants found</Text>
                )}
                {goBackButton}
              </View>
            )}

            {step === "restaurant_issue" && selectedRestaurant && (
              <View style={{ gap: sp(4) }}>
                {stepHeader("Restaurant Issue Details", "What went wrong with the restaurant?")}
                {issueGrid(restaurantIssues)}
                <Textarea
                  placeholder="Describe the issue (optional)"
                  placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                  value={description}
                  onChangeText={setDescription}
                  style={[fieldStyle, s.textarea, { minHeight: 100 }]}
                />
                <View style={s.actions}>
                  {submitButton(
                    () => submitTicket({ type: "restaurant", restaurantId: selectedRestaurant._id || selectedRestaurant.id, issueType, description }),
                    !issueType || submitting,
                  )}
                  <Button variant="outline" onPress={() => setStep("pick")} style={s.cancelButton}>
                    Cancel
                  </Button>
                </View>
              </View>
            )}

            {step === "other_form" && (
              <View style={{ gap: sp(4) }}>
                <Text style={s.otherTitle}>Other Issue Details</Text>
                <Input
                  placeholder="Subject"
                  placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                  value={subject}
                  onChangeText={setSubject}
                  style={fieldStyle}
                />
                <Textarea
                  placeholder="Describe your issue"
                  placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                  value={description}
                  onChangeText={setDescription}
                  style={[fieldStyle, s.textarea, { minHeight: 120 }]}
                />
                <View style={s.actions}>
                  {submitButton(() => submitTicket({ type: "other", issueType: subject || "Other", description }), !subject || submitting)}
                  <Button
                    variant="outline"
                    onPress={() => {
                      setSubject("")
                      setDescription("")
                      setStep("pick")
                    }}
                    style={s.cancelButton}
                  >
                    Cancel
                  </Button>
                </View>
              </View>
            )}
          </CardContent>
        </Card>

        {ticketList}
      </ScrollView>
      <StatusBarScrim color={t.dark ? "#0a0a0a" : "#f5f5f5"} />
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => {
  const card = t.dark ? "#1a1a1a" : colors.white
  return {
    page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
    content: { paddingHorizontal: sp(4) },
    fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    header: { flexDirection: "row", alignItems: "center", marginBottom: sp(6) },
    backButton: {
      height: 40,
      width: 40,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: card,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.slate[100],
      elevation: 2,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
    headerTitle: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900], marginLeft: sp(4) },
    heroCard: {
      backgroundColor: "transparent",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : alpha(RED, 0.1),
      marginBottom: sp(5),
      overflow: "hidden",
      ...shadow.sm,
    },
    glow: { position: "absolute", top: -40, right: -40, width: 128, height: 128, borderRadius: 9999, backgroundColor: alpha(RED, 0.1), opacity: 0.6 },
    heroTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900] },
    heroText: { ...fontSize.sm, color: t.dark ? colors.slate[400] : colors.slate[600], marginTop: 6 },
    whiteCard: { backgroundColor: card, borderRadius: 14, borderWidth: 1, borderColor: t.dark ? colors.gray[800] : colors.slate[200], ...shadow.sm },
    pickCard: {
      width: "100%",
      backgroundColor: card,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.slate[100],
      borderRadius: 16,
      padding: sp(5),
    },
    pickCardPressed: { borderColor: t.dark ? alpha(RED, 0.5) : alpha(RED, 0.3) },
    pickHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    pickIcon: { backgroundColor: t.dark ? alpha(colors.gray[800], 0.8) : colors.slate[50], borderRadius: 9999, padding: sp(3) },
    pickTitle: { marginTop: sp(4), ...fontSize.base, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900] },
    pickText: { ...fontSize.sm, lineHeight: 22, color: t.dark ? colors.gray[400] : colors.slate[500], marginTop: 6 },
    stepHead: { borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.slate[100], paddingBottom: sp(3) },
    stepTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900] },
    stepText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.slate[500], marginTop: sp(1) },
    infoBox: {
      ...fontSize.sm,
      color: colors.slate[500],
      backgroundColor: t.dark ? "#111111" : colors.slate[50],
      padding: sp(4),
      borderRadius: 14,
      textAlign: "center",
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.slate[100],
      overflow: "hidden",
    },
    field: {
      height: 48,
      backgroundColor: t.dark ? "#111111" : colors.slate[50],
      borderColor: t.dark ? colors.gray[800] : colors.slate[200],
      borderRadius: 14,
      fontSize: 16,
      color: t.dark ? colors.white : colors.slate[900],
    },
    textarea: { height: undefined, padding: sp(4), textAlignVertical: "top" },
    resultsBox: {
      maxHeight: 250,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.slate[200],
      borderRadius: 10,
      padding: 6,
      backgroundColor: t.dark ? "#111111" : colors.slate[50],
    },
    resultItem: { borderRadius: 10, borderWidth: 1, borderColor: colors.transparent },
    resultItemPressed: { backgroundColor: t.dark ? "#222222" : colors.white, borderColor: t.dark ? colors.gray[700] : colors.slate[200] },
    resultText: { ...fontSize.sm, color: t.dark ? colors.slate[300] : colors.slate[700] },
    noMatch: { ...fontSize.sm, color: colors.slate[500], padding: sp(3), textAlign: "center" },
    goBackWrap: { paddingTop: sp(4), marginTop: sp(2), borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.slate[100] },
    goBackButton: { width: "100%", height: 48, borderRadius: 14, borderColor: t.dark ? colors.gray[800] : colors.slate[200] },
    goBackText: { fontWeight: "600", color: t.dark ? colors.slate[300] : colors.slate[700] },
    issueGrid: { flexDirection: "row", flexWrap: "wrap", gap: sp(2) },
    issueButton: { flexBasis: "47%", flexGrow: 1 },
    actions: { gap: sp(3), marginTop: sp(4) },
    submitButton: {
      backgroundColor: RED,
      height: 48,
      borderRadius: 14,
      elevation: 4,
      shadowColor: RED,
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    submitText: { fontWeight: "600", color: colors.white },
    cancelButton: { height: 48, borderRadius: 14, borderColor: t.dark ? colors.gray[800] : colors.slate[200] },
    otherTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.white : colors.slate[900] },
    ticketsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sp(3) },
    ticketsTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
    countPill: { paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: 4, backgroundColor: t.dark ? colors.slate[800] : colors.slate[100] },
    countText: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.slate[300] : colors.slate[600] },
    slateMuted: { ...fontSize.sm, color: colors.slate[500] },
    ticket: { borderWidth: 1, borderColor: t.dark ? colors.slate[700] : colors.slate[200], borderRadius: 10, padding: sp(3), backgroundColor: t.dark ? "#171717" : colors.white },
    ticketRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) },
    ticketTitle: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.white : colors.slate[900] },
    ticketDate: { ...fontSize.xs, color: colors.slate[500], marginTop: sp(1) },
    statusPill: { paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: 9999 },
    statusText: { fontSize: 11, lineHeight: 16, fontWeight: "600" },
    reply: { ...fontSize.xs, color: t.dark ? colors.slate[300] : colors.slate[600], marginTop: sp(2) },
  }
})
