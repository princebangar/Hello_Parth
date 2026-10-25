// Web: modules/Food/pages/user/orders/UserOrderDetails.jsx — order details (status, restaurant + items, bill, customer /
// payment / address), reorder, complaint, and the order summary PDF.
// jsPDF + autoTable -> the same summary laid out as HTML and turned into a PDF with @/lib/media printHtml (share sheet).
import React, { useEffect, useRef, useState } from "react"
import { Animated, Linking, Pressable, ScrollView, View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, ShoppingBag, Phone, Copy, Download, User, CreditCard, Calendar, MapPin, RotateCcw, FileText, X, Check } from "lucide-react-native"
import { useNavigate, useParams } from "@/lib/router"
import { AppImage, Screen, StatusBarSpacer, Text } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import { printHtml } from "@/lib/media"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { orderAPI, restaurantAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { toast } from "@/lib/toast"
import { getCompanyNameAsync } from "@food/utils/businessSettings"
import dishFallbackImage from "@food/assets/dish_fallback.webp"

const debugWarn = (..._args) => {}
const debugError = (..._args) => {}

const RED = "#DC2626"

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// h("td", ' style="..."', inner) -> the tag as an HTML string
const h = (name, attrs, ...children) => `<${name}${attrs || ""}>${children.join("")}</${name}>`

/** Tailwind animate-pulse on the "processing" bag icon. */
function Pulse({ children }) {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v])
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>
}

export default function UserOrderDetails() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { replaceCart } = useCart()
  const { orderId } = useParams()
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const [order, setOrder] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failedItemImages, setFailedItemImages] = useState({})

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order && typeof response.data.order === "object") {
          orderData = response.data.order
        } else {
          toast.error("Order not found")
          navigate("/food/user/orders")
          return
        }

        setOrder(orderData)

        const restaurantId = orderData.restaurantId
        if (restaurantId && typeof restaurantId === "string" && !orderData.restaurant) {
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantId)
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              setRestaurant(restaurantResponse.data.data.restaurant)
            } else if (restaurantResponse?.data?.restaurant) {
              setRestaurant(restaurantResponse.data.restaurant)
            }
          } catch (restaurantError) {
            debugWarn("Failed to fetch restaurant details:", restaurantError)
          }
        }
      } catch (error) {
        debugError("Error fetching order details:", error)
        toast.error(error?.response?.data?.message || "Failed to load order details")
        navigate("/food/user/orders")
      } finally {
        setLoading(false)
      }
    }

    fetchOrderDetails()
  }, [orderId, navigate])

  const handleCopyOrderId = async () => {
    if (!order) return
    const id = order.orderId || order._id || orderId
    try {
      await navigator.clipboard.writeText(String(id))
      toast.success("Order ID copied")
    } catch {
      toast.error("Failed to copy Order ID")
    }
  }

  if (loading) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : colors.gray[50]} style={{ alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: t.dark ? colors.gray[400] : colors.gray[600], fontSize: 14, lineHeight: 20 }}>Loading order details...</Text>
      </Screen>
    )
  }

  if (!order) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : colors.gray[50]} style={{ alignItems: "center", justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Text style={{ color: t.dark ? colors.gray[300] : colors.gray[700], fontSize: 14, lineHeight: 20, fontWeight: "500" }}>Order not found</Text>
          <Pressable
            onPress={() => navigate("/food/user/orders")}
            style={({ pressed }) => [s.smallRedBtn, pressed && { backgroundColor: "#991B1B", transform: [{ scale: 0.95 }] }]}
          >
            <Text style={{ color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>Back to Orders</Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  const orderIdDisplay = order.orderId || order._id || orderId
  const restaurantObj = restaurant || order.restaurantId || order.restaurant || {}
  const restaurantName =
    order.restaurantName || restaurantObj.restaurantName || restaurantObj.name || (typeof restaurantObj === "string" ? restaurantObj : "") || "Restaurant"

  const restaurantLocation = (() => {
    const loc = restaurantObj.location || {}
    if (restaurantObj.address) return restaurantObj.address
    if (loc.formattedAddress) return loc.formattedAddress
    if (loc.address) return loc.address
    if (loc.street || loc.city) {
      const parts = [loc.street, loc.area, loc.city, loc.state, loc.zipCode || loc.pincode || loc.postalCode].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }
    if (loc.addressLine1) {
      const parts = [loc.addressLine1, loc.addressLine2, loc.city, loc.state].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }
    if (order.restaurantAddress) return order.restaurantAddress
    return "Address not available"
  })()

  const items = Array.isArray(order.items) ? order.items : []
  const pricing = order.pricing || {}

  const userName = order.userName || order.customerName || ""
  const userPhone = order.userPhone || order.customerPhone || ""
  const paymentMethod = order.payment?.method || "Online"
  const paymentDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : ""

  const addressText = (() => {
    const candidates = [order.deliveryAddress, order.address, order.deliveryAddressId, order.userAddress].filter(Boolean)
    for (const addr of candidates) {
      if (typeof addr === "string" && addr.trim()) return addr.trim()
      if (typeof addr === "object") {
        if (addr.formattedAddress) return addr.formattedAddress
        if (addr.address && typeof addr.address === "string") return addr.address
        const parts = [
          addr.houseNo || addr.houseNumber,
          addr.buildingName,
          addr.street || addr.streetAddress || addr.addressLine1,
          addr.addressLine2,
          addr.area || addr.locality || addr.neighbourhood,
          addr.landmark,
          addr.city || addr.town,
          addr.state,
          addr.zipCode || addr.pincode || addr.postalCode || addr.zip,
        ].filter(Boolean)
        if (parts.length) return parts.join(", ")
      }
    }
    return ""
  })()

  const savings = (pricing.discount || 0) + (pricing.originalItemTotal || 0) - (pricing.subtotal || 0)

  const restaurantPhone = restaurantObj.primaryContactNumber || restaurantObj.phone || restaurantObj.contactNumber || order.restaurantPhone || ""

  const handleCallRestaurant = () => {
    if (!restaurantPhone) {
      toast.error("Restaurant phone number not available")
      return
    }
    Linking.openURL(`tel:${restaurantPhone}`).catch(() => {})
  }

  const handleDownloadSummary = async () => {
    try {
      const companyName = await getCompanyNameAsync()
      const field = (label, value) => h("tr", "", h("td", ' class="k"', label), h("td", "", esc(value)))
      const rows = items
        .map((item, i) =>
          h(
            "tr",
            i % 2 ? ' class="alt"' : "",
            h("td", "", esc(item.variantName ? `${item.name || "Item"} (${item.variantName})` : item.name || "Item")),
            h("td", ' style="text-align:center"', esc(String(item.quantity || item.qty || 1))),
            h("td", ' style="text-align:right"', `Rs. ${Number(item.price || 0).toFixed(2)}`),
            h("td", ' style="text-align:right;font-weight:bold"', `Rs. ${Number((item.price || 0) * (item.quantity || item.qty || 1)).toFixed(2)}`),
          ),
        )
        .join("")
      const css = `body{font-family:Helvetica,Arial,sans-serif;font-size:10pt;color:#000;padding:24px 28px}
        h1{font-size:16pt;text-align:center;margin:0 0 18px}
        table.info td{padding:3px 0;vertical-align:top} td.k{font-weight:bold;width:120px}
        table.items{width:100%;border-collapse:collapse;margin-top:14px;font-size:9pt}
        table.items th{background:#000;color:#fff;font-weight:bold;font-size:10pt;padding:6px;text-align:left}
        table.items td{padding:6px} tr.alt td{background:#f5f5f5}
        .total{margin-top:14px;font-size:12pt;font-weight:bold;text-align:right}`
      const html = `<!DOCTYPE html>${h(
        "html",
        "",
        h("head", "", '<meta charset="utf-8"/>', h("style", "", css)),
        h(
          "body",
          "",
          h("h1", "", esc(`${companyName} Order: Summary and Receipt`)),
          h(
            "table",
            ' class="info"',
            field("Order ID:", orderIdDisplay),
            field("Order Time:", paymentDate || "N/A"),
            field("Customer Name:", userName || "Customer"),
            field("Delivery Address:", addressText || "N/A"),
            field("Restaurant Name:", restaurantName),
            field("Restaurant Address:", restaurantLocation || "N/A"),
          ),
          h(
            "table",
            ' class="items"',
            h(
              "thead",
              "",
              h("tr", "", h("th", "", "Item"), h("th", ' style="text-align:center"', "Quantity"), h("th", ' style="text-align:right"', "Unit Price"), h("th", ' style="text-align:right"', "Total Price")),
            ),
            h("tbody", "", rows),
          ),
          h("div", ' class="total"', `Total: &nbsp;&nbsp;Rs. ${Number(pricing.total || 0).toFixed(2)}`),
        ),
      )}`
      const fileName = `Order_Summary_${String(orderIdDisplay).replace(/[^\w-]+/g, "_")}_${Date.now()}.pdf`
      await printHtml(html, { filename: fileName })
      toast.success("Summary downloaded successfully!")
    } catch (error) {
      debugError("Error generating PDF:", error)
      toast.error("Failed to download summary")
    }
  }

  const handleReorder = (currentOrder) => {
    const restaurantTarget =
      restaurantObj.slug ||
      restaurantObj._id ||
      restaurantObj.restaurantId ||
      (typeof currentOrder?.restaurantId === "string" ? currentOrder.restaurantId : currentOrder?.restaurantId?._id)

    if (!restaurantTarget || !items.length) {
      toast.error("Order items or restaurant information not available")
      return
    }

    const reorderItems = items
      .map((item, index) => {
        const itemId = item.id || item.itemId || item._id
        if (!itemId) return null
        return {
          id: itemId,
          name: item.name || item.foodName || "Item",
          price: Number(item.price) || 0,
          image: item.image || "",
          restaurant: restaurantName,
          restaurantId: restaurantObj._id || restaurantObj.restaurantId || currentOrder?.restaurantId,
          description: item.description || "",
          isVeg: item.isVeg === true || item.foodType === "Veg",
          quantity: Math.max(1, Number(item.quantity || item.qty) || 1),
          reorderIndex: index,
        }
      })
      .filter(Boolean)

    if (!reorderItems.length) {
      toast.error("No reorderable items found in this order")
      return
    }

    replaceCart(reorderItems)
    toast.success("Items added to cart")
    navigate(`/food/user/restaurants/${restaurantTarget}`)
  }

  const isCancelled =
    order.status === "cancelled" || order.status === "cancelled_by_restaurant" || order.status === "restaurant_cancelled" || order.status?.includes("cancel")
  const isDelivered = order.status === "delivered"
  const statusTone = isCancelled
    ? { bg: t.dark ? alpha(colors.red[950], 0.2) : colors.red[50], fg: t.dark ? colors.red[400] : colors.red[600] }
    : isDelivered
      ? { bg: t.dark ? alpha(colors.green[950], 0.2) : colors.green[50], fg: t.dark ? colors.green[400] : colors.green[600] }
      : { bg: t.dark ? alpha(colors.amber[950], 0.2) : colors.amber[50], fg: t.dark ? colors.amber[400] : colors.amber[600] }

  const method = String(order.payment?.method || order.paymentMethod || "online").toLowerCase()
  const isCash = method === "cash" || method === "cod"
  const pmLower = String(paymentMethod).toLowerCase()
  const pmCash = pmLower === "cash" || pmLower === "cod"
  const cashPill = { bg: t.dark ? colors.gray[800] : colors.gray[100], fg: t.dark ? colors.gray[200] : colors.gray[800], border: t.dark ? colors.gray[700] : colors.gray[200] }
  const onlinePill = {
    bg: t.dark ? alpha(colors.green[950], 0.4) : colors.green[100],
    fg: t.dark ? colors.green[300] : colors.green[800],
    border: t.dark ? alpha(colors.green[900], 0.5) : colors.green[200],
  }

  const restaurantImage =
    restaurantObj.profileImage?.url ||
    restaurantObj.profileImage ||
    order.restaurantImage ||
    (Array.isArray(items) && items[0]?.image) ||
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80"

  const DetailRow = ({ icon: Icon, title, children }) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={s.detailIcon}>
        <Icon size={16} color={t.dark ? colors.gray[400] : colors.gray[600]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.detailTitle}>{title}</Text>
        {children}
      </View>
    </View>
  )

  return (
    <Screen edges={[]} bg={t.dark ? "#0a0a0a" : colors.gray[50]}>
      {/* Header */}
      <View style={s.header}>
        <StatusBarSpacer />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
          <Pressable onPress={goBack} style={({ pressed }) => [{ padding: 4, borderRadius: 9999 }, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
            <ArrowLeft size={24} color={t.dark ? colors.gray[300] : colors.gray[700]} />
          </Pressable>
          <Text style={s.headerTitle}>Order Details</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 96 + insets.bottom }}>
        {/* Status Card */}
        <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 14 }]}>
          <View style={[s.statusIcon, { backgroundColor: statusTone.bg }]}>
            {isCancelled ? (
              <X size={20} color={statusTone.fg} />
            ) : isDelivered ? (
              <Check size={20} color={statusTone.fg} />
            ) : (
              <Pulse>
                <ShoppingBag size={20} color={statusTone.fg} />
              </Pulse>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statusTitle}>
              {isDelivered
                ? order.orderType === "takeaway"
                  ? "Order Picked UP"
                  : "Order was delivered"
                : isCancelled
                  ? "Order was cancelled"
                  : "Order Status: " + (order.status?.toUpperCase() || "PROCESSING")}
            </Text>
            <Text style={s.statusSub}>{isDelivered ? "Thank you for ordering" : isCancelled ? "This order was not fulfilled" : "We are processing your order"}</Text>
          </View>
        </View>

        {/* Cancellation Details */}
        {isCancelled && (
          <View style={s.cancelBox}>
            <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: colors.red[500], marginTop: 6 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.cancelKicker}>Cancellation Reason</Text>
              <Text style={s.cancelReason}>{order.cancellationReason || "The restaurant was unable to fulfill this order."}</Text>
              <Text style={s.cancelNote}>Refund will be initiated to your source payment method.</Text>
            </View>
          </View>
        )}

        {/* Restaurant Info Card */}
        <View style={s.card}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <AppImage src={restaurantImage} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="cover" accessibilityLabel={restaurantName} />
              <View style={{ flex: 1 }}>
                <Text style={s.restName}>{restaurantName}</Text>
                <Text style={s.restLoc}>{restaurantLocation}</Text>
              </View>
            </View>
            <Pressable onPress={handleCallRestaurant} style={({ pressed }) => [s.callBtn, pressed && { backgroundColor: alpha(RED, 0.05) }]}>
              <Phone size={16} color={RED} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Text style={s.orderIdText}>Order ID: #{orderIdDisplay}</Text>
            <Pressable onPress={handleCopyOrderId} hitSlop={8}>
              <Copy size={12} color={t.dark ? colors.gray[500] : colors.gray[400]} />
            </Pressable>
          </View>

          {!!order.note && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
              <View style={s.notePill}>
                <Text style={s.noteText}>Note: {order.note}</Text>
              </View>
            </View>
          )}

          <View style={s.dashed} />

          {items.map((item, idx) => {
            const veg = item.isVeg === true || item.foodType === "Veg"
            const vegColor = veg ? colors.green[600] : colors.red[600]
            return (
              <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: idx === 0 ? 0 : 16, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View style={s.itemThumb}>
                    <AppImage
                      src={failedItemImages[idx] ? dishFallbackImage : item.image || dishFallbackImage}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      accessibilityLabel={item.name}
                      onError={() => setFailedItemImages((p) => ({ ...p, [idx]: true }))}
                    />
                  </View>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[s.vegBox, { borderColor: vegColor }]}>
                      <View style={{ flex: 1, alignSelf: "stretch", borderRadius: 9999, backgroundColor: vegColor }} />
                    </View>
                    <Text style={s.itemName}>
                      {item.quantity || item.qty || 1} x {item.name}
                      {item.variantName ? ` (${item.variantName})` : ""}
                    </Text>
                  </View>
                </View>
                <Text style={s.itemPrice}>₹{(item.price || 0).toFixed(2)}</Text>
              </View>
            )
          })}
        </View>

        {/* Restaurant Complaint - after delivery */}
        {order && order.status === "delivered" && (
          <Pressable
            onPress={() => {
              const orderMongoId = order._id || orderId
              if (!orderMongoId) {
                toast.error("Order ID not available. Please refresh the page.")
                return
              }
              const orderIdString = typeof orderMongoId === "object" && orderMongoId.toString ? orderMongoId.toString() : String(orderMongoId)
              // web: /user/complaints/submit/:id (redirected to /food/user/...)
              navigate(`/food/user/complaints/submit/${encodeURIComponent(orderIdString)}`)
            }}
            style={({ pressed }) => [s.complaintBtn, pressed && { backgroundColor: alpha(RED, 0.1) }]}
          >
            <FileText size={16} color={RED} />
            <Text style={{ color: RED, fontWeight: "600" }}>Restaurant Complaint</Text>
          </Pressable>
        )}

        {/* Bill Summary */}
        <View style={[s.card, { padding: 0, overflow: "hidden" }]}>
          <View style={s.billHead}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FileText size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
              <Text style={s.billTitle}>Bill Summary</Text>
            </View>
            <Pressable onPress={handleDownloadSummary} style={({ pressed }) => [s.billDl, pressed && { backgroundColor: alpha(RED, 0.2) }]}>
              <Download size={16} color={RED} />
            </Pressable>
          </View>

          <View style={{ padding: 16, gap: 8 }}>
            <View style={s.billRow}>
              <Text style={s.billLabel}>Item total</Text>
              <Text>
                {!!pricing.originalItemTotal && <Text style={s.strike}>₹{Number(pricing.originalItemTotal).toFixed(2)} </Text>}
                <Text style={s.billValue}>₹{Number(pricing.subtotal || pricing.total || 0).toFixed(2)}</Text>
              </Text>
            </View>
            <View style={s.billRow}>
              <Text style={s.billLabel}>GST (govt. taxes)</Text>
              <Text style={s.billValue}>₹{Number(pricing.tax || 0).toFixed(2)}</Text>
            </View>
            {order.orderType !== "takeaway" && order.orderType !== "dining" && (
              <View style={s.billRow}>
                <Text style={[s.billLabel, { color: t.dark ? colors.gray[500] : colors.gray[400], fontWeight: "500" }]}>Delivery fee</Text>
                {pricing.deliveryFee === 0 && (
                  <View style={s.freeTag}>
                    <Text style={{ color: RED, fontSize: 10, lineHeight: 14, fontWeight: "700" }}>FREE</Text>
                  </View>
                )}
                <Text style={{ fontSize: 14, lineHeight: 20, color: t.dark ? "#a04882" : RED, fontWeight: "500", textTransform: "uppercase" }}>
                  {pricing.deliveryFee ? `₹${Number(pricing.deliveryFee).toFixed(2)}` : "Free"}
                </Text>
              </View>
            )}
            {Number(pricing.platformFee || 0) > 0 && (
              <View style={s.billRow}>
                <Text style={s.billLabel}>Platform fee</Text>
                <Text style={s.billValue}>₹{Number(pricing.platformFee || 0).toFixed(2)}</Text>
              </View>
            )}
            {Number(pricing.subscriptionFee || 0) > 0 && (
              <View style={s.billRow}>
                <Text style={s.billLabel}>Subscription / other fees</Text>
                <Text style={s.billValue}>₹{Number(pricing.subscriptionFee || 0).toFixed(2)}</Text>
              </View>
            )}

            <View style={s.paidRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={s.paidText}>Paid</Text>
                {(() => {
                  const p = isCash ? cashPill : onlinePill
                  return (
                    <View style={[s.payPill, { marginLeft: 10, backgroundColor: p.bg, borderColor: p.border }]}>
                      <Text style={[s.payPillText, { fontSize: 10, color: p.fg }]}>{isCash ? "COD" : "Online"}</Text>
                    </View>
                  )
                })()}
              </View>
              <Text style={s.paidText}>₹{Number(pricing.total || 0).toFixed(2)}</Text>
            </View>
          </View>

          {savings > 0 && (
            <View style={s.savings}>
              <View style={{ position: "absolute", top: -6, left: 0, right: 0, height: 8, overflow: "hidden" }}>
                <Svg width="100%" height={8} viewBox="0 0 1200 120" preserveAspectRatio="none">
                  <Path
                    d="M0,0V46.29c47,0,47,69.5,94,69.5s47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5V0Z"
                    fill="#ffffff"
                  />
                </Svg>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 4 }}>
                <Text style={{ color: RED, fontWeight: "700", fontSize: 14, lineHeight: 20, textAlign: "center" }}>You saved ₹{Number(savings).toFixed(2)} on this order!</Text>
              </View>
            </View>
          )}
        </View>

        {/* User & Delivery Details */}
        <View style={[s.card, { gap: 16 }]}>
          <DetailRow icon={User} title="Customer Details">
            <Text style={s.detailText}>{userName || "Customer"}</Text>
            <Text style={s.detailPhone}>{userPhone}</Text>
          </DetailRow>
          <View style={s.hr} />
          <DetailRow icon={CreditCard} title="Payment Method">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Text style={{ fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] }}>Paid via</Text>
              {(() => {
                const p = pmCash ? cashPill : onlinePill
                return (
                  <View style={[s.payPill, { paddingHorizontal: 6, backgroundColor: p.bg, borderColor: p.border }]}>
                    <Text style={[s.payPillText, { fontSize: 9, color: p.fg }]}>{paymentMethod}</Text>
                  </View>
                )
              })()}
            </View>
          </DetailRow>
          <View style={s.hr} />
          <DetailRow icon={Calendar} title="Payment Date">
            <Text style={s.detailText}>{paymentDate}</Text>
          </DetailRow>
          {order.orderType !== "takeaway" && (
            <>
              <View style={s.hr} />
              <DetailRow icon={MapPin} title="Delivery Address">
                <Text style={[s.detailText, { lineHeight: 19.5 }]}>{addressText || "Address not available"}</Text>
              </DetailRow>
            </>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Buttons */}
      <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable onPress={() => handleReorder(order)} style={({ pressed }) => [s.reorderBtn, pressed && { backgroundColor: "#991B1B", transform: [{ scale: 0.95 }] }]}>
          <RotateCcw size={16} color={colors.white} />
          <Text style={{ color: colors.white, fontWeight: "600" }}>Reorder</Text>
        </Pressable>
        <Pressable onPress={handleDownloadSummary} style={({ pressed }) => [s.invoiceBtn, pressed && { backgroundColor: alpha(RED, 0.05) }]}>
          <Download size={16} color={RED} />
          <Text style={{ color: RED, fontWeight: "600" }}>Invoice</Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles((t) => {
  const cardBorder = t.dark ? colors.gray[800] : "#e6e0d1"
  return {
    header: { backgroundColor: t.dark ? "#121212" : colors.white, zIndex: 20, borderBottomWidth: 1, borderBottomColor: cardBorder, ...shadow.sm },
    headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[800] },
    smallRedBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: RED, ...shadow.md },
    card: { backgroundColor: t.dark ? "#121212" : colors.white, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: cardBorder, ...shadow.sm },
    statusIcon: { padding: 10, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    statusTitle: { fontWeight: "700", color: t.dark ? colors.gray[100] : colors.gray[800], lineHeight: 20 },
    statusSub: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 4 },
    cancelBox: {
      backgroundColor: t.dark ? alpha(colors.red[950], 0.1) : alpha(colors.red[50], 0.6),
      borderWidth: 1,
      borderColor: t.dark ? alpha(colors.red[900], 0.2) : alpha(colors.red[100], 0.6),
      borderRadius: 14,
      padding: 16,
      flexDirection: "row",
      gap: 12,
      alignItems: "flex-start",
      ...shadow.sm,
    },
    cancelKicker: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: t.dark ? colors.red[400] : colors.red[800], textTransform: "uppercase", letterSpacing: 1 },
    cancelReason: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[900] },
    cancelNote: { fontSize: 11, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500], paddingTop: 2 },
    restName: { fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[800] },
    restLoc: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] },
    callBtn: { width: 32, height: 32, borderRadius: 9999, borderWidth: 1, borderColor: alpha(RED, 0.2), alignItems: "center", justifyContent: "center" },
    orderIdText: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500], textTransform: "uppercase", letterSpacing: 0.3, fontWeight: "500" },
    notePill: {
      borderRadius: 9999,
      paddingHorizontal: 12,
      paddingVertical: 4,
      backgroundColor: t.dark ? alpha(colors.blue[900], 0.2) : colors.blue[50],
      borderWidth: 1,
      borderColor: t.dark ? colors.blue[800] : colors.blue[200],
    },
    noteText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: t.dark ? colors.blue[400] : colors.blue[700] },
    dashed: { borderTopWidth: 1, borderStyle: "dashed", borderTopColor: t.dark ? colors.gray[800] : colors.gray[200], marginVertical: 12 },
    itemThumb: { width: 64, height: 64, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: t.dark ? colors.gray[800] : colors.gray[100], ...shadow.sm },
    vegBox: { width: 12, height: 12, borderWidth: 1, padding: 1, alignItems: "center", justifyContent: "center" },
    itemName: { flex: 1, fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[300] : colors.gray[700], fontWeight: "500" },
    itemPrice: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[200] : colors.gray[800], fontWeight: "500" },
    complaintBtn: {
      width: "100%",
      backgroundColor: alpha(RED, 0.05),
      borderWidth: 1,
      borderColor: alpha(RED, 0.2),
      paddingVertical: 12,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    billHead: { padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100] },
    billTitle: { fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[800] },
    billDl: { width: 28, height: 28, borderRadius: 9999, backgroundColor: alpha(RED, 0.1), alignItems: "center", justifyContent: "center" },
    billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    billLabel: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[400] : colors.gray[500] },
    billValue: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[200] : colors.gray[800] },
    strike: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[500] : colors.gray[400], textDecorationLine: "line-through" },
    freeTag: { borderWidth: 1, borderColor: RED, paddingHorizontal: 4, borderRadius: 4, marginLeft: 4 },
    paidRow: { borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[100], marginVertical: 8, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    paidText: { fontWeight: "700", fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[100] : colors.gray[800] },
    payPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
    payPillText: { fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    savings: { position: "relative", backgroundColor: alpha(RED, 0.05), padding: 12, paddingBottom: 16, marginTop: 8 },
    detailIcon: { width: 36, height: 36, borderRadius: 9999, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], alignItems: "center", justifyContent: "center" },
    detailTitle: { fontWeight: "700", color: t.dark ? colors.gray[100] : colors.gray[800], fontSize: 14, lineHeight: 20 },
    detailText: { color: t.dark ? colors.gray[300] : colors.gray[600], fontSize: 12, lineHeight: 16, marginTop: 2, fontWeight: "500" },
    detailPhone: { color: t.dark ? colors.gray[500] : colors.gray[400], fontSize: 11, lineHeight: 16, marginTop: 2 },
    hr: { borderTopWidth: 1, borderTopColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[100] },
    bottomBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.dark ? "#121212" : colors.white,
      borderTopWidth: 1,
      borderTopColor: t.dark ? colors.gray[800] : colors.gray[200],
      paddingHorizontal: 16,
      paddingTop: 16,
      flexDirection: "row",
      gap: 12,
      zIndex: 20,
    },
    reorderBtn: { flex: 1, backgroundColor: RED, paddingVertical: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, ...shadow.md },
    invoiceBtn: {
      flex: 1,
      backgroundColor: t.dark ? "#1a1a1a" : colors.white,
      borderWidth: 1,
      borderColor: RED,
      paddingVertical: 12,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
  }
})
