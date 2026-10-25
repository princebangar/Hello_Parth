// Web: modules/Food/pages/user/orders/Orders.jsx — "Your Orders": all pages of GET orders (poll 20s while visible),
// search, status/payment badges, ETA countdown, reorder, share restaurant, rate restaurant & delivery partner.
import React, { useState, useEffect, useRef } from "react"
import { Animated, FlatList, Linking, Pressable, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowLeft, Search, MoreVertical, ChevronRight, Star, RotateCcw, Loader2, Clock, X, Share2, MessageCircle, Send, Copy, Mail, MessagesSquare, Link2 } from "lucide-react-native"
import { buildShareUrl, restaurantSharePath } from "@/shared/utils/shareLinks"
import { useNavigate } from "@/lib/router"
import { AppImage, Dialog, Screen, Text, TextInput } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import { Spin } from "@/shared/components/Loader"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { orderAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { toast } from "@/lib/toast"
import { getCompanyNameAsync } from "@food/utils/businessSettings"

const debugError = (..._args) => {}

const RED = "#DC2626"
const FALLBACK_RESTAURANT_IMG = "https://images.unsplash.com/photo-1604908176997-125188eb3c52?auto=format&fit=crop&w=200&q=80"
const ERROR_RESTAURANT_IMG = "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=100&q=80"

/** Tailwind animate-pulse. */
function Pulse({ children, style }) {
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
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>
}

function RestaurantThumb({ src, alt, style }) {
  const [failed, setFailed] = useState(false)
  return <AppImage src={failed ? ERROR_RESTAURANT_IMG : src} style={style} contentFit="cover" accessibilityLabel={alt} onError={() => setFailed(true)} />
}

export default function Orders() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { replaceCart } = useCart()
  const t = useTheme()
  const s = useStyles()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [ratingModal, setRatingModal] = useState({ open: false, order: null })
  const [activeMenuOrderId, setActiveMenuOrderId] = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePayload, setSharePayload] = useState(null)
  const [selectedRestaurantRating, setSelectedRestaurantRating] = useState(null)
  const [selectedDeliveryRating, setSelectedDeliveryRating] = useState(null)
  const [restaurantFeedbackText, setRestaurantFeedbackText] = useState("")
  const [deliveryFeedbackText, setDeliveryFeedbackText] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)
  const [countdowns, setCountdowns] = useState({})
  const [focusedField, setFocusedField] = useState(null)
  const [shownRatingForOrders, setShownRatingForOrders] = useState(() => {
    try {
      const stored = localStorage.getItem("shownRatingForOrders")
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem("shownRatingForOrders", JSON.stringify(Array.from(shownRatingForOrders)))
    } catch (error) {
      debugError("Error saving shownRatingForOrders to localStorage:", error)
    }
  }, [shownRatingForOrders])

  const calculateCountdown = (order) => {
    if (!order || order.status === "delivered" || String(order.status).toLowerCase().includes("cancel")) {
      return null
    }
    if (order.preparationTime && order.acceptedAt) {
      const acceptedAt = new Date(order.acceptedAt)
      const now = new Date()
      const elapsedMinutes = Math.floor((now - acceptedAt) / (1000 * 60))
      const remainingMinutes = Math.max(0, order.preparationTime - elapsedMinutes)
      return remainingMinutes > 0 ? remainingMinutes : null
    }
    const createdAt = new Date(order.createdAt)
    const now = new Date()
    const elapsedMinutes = Math.floor((now - createdAt) / (1000 * 60))
    const maxETA = order.eta?.max || order.estimatedDeliveryTime || 30
    const remainingMinutes = Math.max(0, maxETA - elapsedMinutes)
    return remainingMinutes > 0 ? remainingMinutes : null
  }

  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns = {}
      orders.forEach((order) => {
        const remaining = calculateCountdown(order)
        if (remaining !== null) newCountdowns[order.id] = remaining
      })
      setCountdowns(newCountdowns)
    }
    updateCountdowns()
    const interval = setInterval(updateCountdowns, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders])

  const getOrderStatus = (order) => {
    const status = order.status
    if (status === "delivered" || status === "completed") return "delivered"
    if (status === "out_for_delivery" || status === "outForDelivery") return "outForDelivery"
    if (status === "ready" || status === "preparing") return "preparing"
    if (String(status).toLowerCase().includes("cancel")) return "cancelled"
    return status || "confirmed"
  }

  // The rating popup is intentionally NOT auto-triggered here (it lives in OrderTracking).

  useEffect(() => {
    const FETCH_LIMIT = 100

    const fetchAllOrders = async () => {
      const firstResponse = await orderAPI.getOrders({ limit: FETCH_LIMIT, page: 1 })

      let firstPageOrders = []
      let totalPages = 1

      if (firstResponse?.data?.success && firstResponse?.data?.data?.orders) {
        firstPageOrders = firstResponse.data.data.orders || []
        totalPages = firstResponse.data.data?.pagination?.pages || 1
      } else if (firstResponse?.data?.orders) {
        firstPageOrders = firstResponse.data.orders || []
        totalPages = firstResponse.data?.pagination?.pages || 1
      } else if (firstResponse?.data?.data && Array.isArray(firstResponse.data.data)) {
        firstPageOrders = firstResponse.data.data || []
      }

      if (totalPages <= 1) return firstPageOrders

      const pagePromises = []
      for (let p = 2; p <= totalPages; p += 1) {
        pagePromises.push(orderAPI.getOrders({ limit: FETCH_LIMIT, page: p }))
      }

      const pageResponses = await Promise.all(pagePromises)
      const remainingOrders = pageResponses.flatMap((resp) => {
        if (resp?.data?.success && resp?.data?.data?.orders) return resp.data.data.orders || []
        if (resp?.data?.orders) return resp.data.orders || []
        if (resp?.data?.data && Array.isArray(resp.data.data)) return resp.data.data || []
        return []
      })

      return [...firstPageOrders, ...remainingOrders]
    }

    let firstLoad = true
    let alive = true
    const fetchOrders = async () => {
      const silent = !firstLoad
      firstLoad = false
      try {
        if (!silent) setLoading(true)
        const ordersData = await fetchAllOrders()
        if (!alive) return

        if (ordersData.length > 0) {
          const transformedOrders = ordersData.map((order) => {
            const createdAt = order.createdAt ? new Date(order.createdAt) : new Date()
            const backendStatus = order.orderStatus || order.status
            const isCancelled =
              backendStatus === "cancelled" ||
              backendStatus === "cancelled_by_user" ||
              backendStatus === "cancelled_by_restaurant" ||
              backendStatus === "cancelled_by_admin"
            const cancellationReason = order.cancellationReason || ""
            const isRestaurantCancelled =
              isCancelled &&
              (order.cancelledBy === "restaurant" ||
                /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue|order not accepted within time limit|restaurant did not respond/i.test(
                  cancellationReason,
                ))
            const isUserCancelled = isCancelled && order.cancelledBy === "user"
            const originalStatus = backendStatus
            const restaurantRating = order.ratings?.restaurant?.rating || null
            const deliveryPartnerRating = order.ratings?.deliveryPartner?.rating || null

            return {
              id: order._id?.toString() || order.orderId || `ORD-${order._id}`,
              mongoId: order._id,
              orderId: order.orderId || order._id?.toString(),
              status: isRestaurantCancelled ? "restaurant_cancelled" : getOrderStatus({ ...order, status: backendStatus }),
              originalStatus,
              createdAt: createdAt.toISOString(),
              address: order.address || order.deliveryAddress || {},
              items: (order.items || []).map((item) => ({
                itemId: item.itemId || item._id || item.id,
                name: item.name || item.foodName || "Item",
                variantName: item.variantName || "",
                quantity: item.quantity || 1,
                price: item.price || 0,
                image: item.image || null,
                description: item.description || null,
                isVeg: item.isVeg === true || item.foodType === "Veg" || item.category === "veg" || item.type === "veg",
                _id: item._id || item.id,
                id: item.id || item._id,
              })),
              total: order.pricing?.total || order.total || 0,
              subtotal: order.pricing?.subtotal || 0,
              deliveryFee: order.pricing?.deliveryFee || 0,
              tax: order.pricing?.tax || 0,
              pricing: order.pricing || {},
              payment: order.payment || {},
              paymentMethod: order.payment?.method || order.paymentMethod,
              restaurant: order.restaurantId?.restaurantName || order.restaurantId?.name || order.restaurantName || "Restaurant",
              restaurantId: order.restaurantId?._id || order.restaurantId,
              restaurantSlug: order.restaurantId?.slug || null,
              restaurantImage: order.restaurantId?.profileImage?.url || order.restaurantId?.profileImage || null,
              restaurantLocation: order.restaurantId?.location?.area || order.restaurantId?.location?.city || order.address?.city || order.deliveryAddress?.city || "",
              restaurantRating,
              deliveryPartnerRating,
              ratings: order.ratings || {},
              rating: restaurantRating || null,
              review: order.review || null,
              tracking: order.tracking || {},
              cancellationReason,
              isRestaurantCancelled,
              isUserCancelled,
              cancelledBy: order.cancelledBy,
              eta: order.eta || { min: order.estimatedDeliveryTime || 30, max: order.estimatedDeliveryTime || 30 },
              estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
              preparationTime: order.preparationTime || 0,
              acceptedAt: order.acceptedAt || null,
              deliveredAt: order.deliveredAt || null,
              deliveryPartnerId: order.deliveryPartnerId?._id || order.deliveryPartnerId || null,
              deliveryPartnerName: order.deliveryPartnerId?.name || order.deliveryPartnerName || null,
              deliveryPartnerPhone: order.deliveryPartnerId?.phone || order.deliveryPartnerPhone || null,
              note: order.note || null,
              orderType: order.orderType || "delivery",
            }
          })

          transformedOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          setOrders((prev) => (JSON.stringify(prev) === JSON.stringify(transformedOrders) ? prev : transformedOrders))
        } else if (!silent) {
          setOrders([])
        }
      } catch (error) {
        debugError("Error fetching user orders:", error)
        let errorMessage = "Failed to load orders"
        if (error?.response?.status === 401) errorMessage = "Please login to view your orders"
        else if (error?.response?.data?.message) errorMessage = error.response.data.message
        if (!silent && alive) {
          toast.error(errorMessage)
          setOrders([])
        }
      } finally {
        if (!silent && alive) setLoading(false)
      }
    }

    fetchOrders()

    const pollInterval = setInterval(() => {
      if (document.visibilityState === "hidden") return
      fetchOrders()
    }, 20000)

    return () => {
      alive = false
      clearInterval(pollInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, "0")
    const month = date.toLocaleDateString("en-US", { month: "short" })
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    return `${day} ${month}, ${displayHours}:${minutes}${ampm}`
  }

  const filteredOrders = orders.filter((order) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const restaurantMatch = order.restaurant?.toLowerCase().includes(query)
    const itemsMatch = order.items.some((item) => (item.name || item.foodName || "").toLowerCase().includes(query))
    return restaurantMatch || itemsMatch
  })

  const ratingModalHasDeliveryPartner = !!(ratingModal.order?.deliveryPartnerId || ratingModal.order?.deliveryPartnerName)
  const ratingSubmitDisabled = submittingRating || selectedRestaurantRating === null || (ratingModalHasDeliveryPartner && selectedDeliveryRating === null)

  const handleReorder = (order) => {
    const restaurantTarget = order.restaurantSlug || order.restaurantId
    if (!restaurantTarget || !order.items?.length) {
      toast.info("Order items or restaurant information not available")
      return
    }
    const reorderItems = order.items
      .map((item, index) => {
        const itemId = item.id || item.itemId || item._id
        if (!itemId) return null
        return {
          id: itemId,
          name: item.name || item.foodName || "Item",
          price: Number(item.price) || 0,
          image: item.image || "",
          restaurant: order.restaurant || "Restaurant",
          restaurantId: order.restaurantId,
          description: item.description || "",
          isVeg: item.isVeg !== false,
          quantity: Math.max(1, Number(item.quantity) || 1),
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

  const toggleMenuForOrder = (orderId) => {
    setActiveMenuOrderId((current) => (current === orderId ? null : orderId))
  }

  const openShareModal = (payload) => {
    setSharePayload(payload)
    setShowShareModal(true)
  }

  const tryNativeShare = async (payload) => {
    if (typeof navigator === "undefined" || !navigator.share) return false
    try {
      await navigator.share(payload)
      return true
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled"
      return false
    }
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Link copied to clipboard!")
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const openShareTarget = (target) => {
    if (!sharePayload?.url) return
    const text = sharePayload.text || ""
    const url = sharePayload.url
    const encodedText = encodeURIComponent(text)
    const encodedUrl = encodeURIComponent(url)
    let shareLink = ""
    if (target === "whatsapp") shareLink = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
    else if (target === "telegram") shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    else if (target === "email") shareLink = `mailto:?subject=${encodeURIComponent(sharePayload.title || "Check this out")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
    else if (target === "sms") shareLink = `sms:?body=${encodeURIComponent(`${text} ${url}`)}`
    else if (target === "facebook") shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    else if (target === "x") shareLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${text} ${url}`)}`
    else if (target === "linkedin") shareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    if (shareLink) {
      Linking.openURL(shareLink).catch(() => {})
      setShowShareModal(false)
    }
  }

  const copyShareLink = async () => {
    if (!sharePayload?.url) return
    await copyToClipboard(sharePayload.url)
    setShowShareModal(false)
  }

  const handleSystemShareFromModal = async () => {
    if (!sharePayload) return
    const shared = await tryNativeShare(sharePayload)
    if (shared) setShowShareModal(false)
  }

  const handleShareRestaurant = async (order) => {
    try {
      const companyName = await getCompanyNameAsync()
      const location = order.restaurantLocation || `${order.address?.city || ""}, ${order.address?.state || ""}`.trim()
      const nameSlug = String(order.restaurant || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
      const restaurantPath = order.restaurantSlug || (order.restaurant && order.restaurant !== "Restaurant" ? nameSlug : "") || order.restaurantId
      const shareUrl = restaurantPath ? buildShareUrl(restaurantSharePath(restaurantPath)) : buildShareUrl(`/food/user/orders/${order.id}`)

      const shareText = `Check out ${order.restaurant} on ${companyName}.
Location: ${location || "Location not available"}
Order again from this restaurant in the ${companyName} app.`

      const payload = { title: order.restaurant, text: shareText, url: shareUrl }

      const shared = await tryNativeShare(payload)
      if (shared === "cancelled") return
      if (shared) return
      openShareModal(payload)
    } catch (error) {
      if (error?.name !== "AbortError") {
        debugError("Error sharing restaurant:", error)
        toast.error("Failed to share restaurant")
      }
    } finally {
      setActiveMenuOrderId(null)
    }
  }

  // web: /user/orders/... (redirected to /food/user/...)
  const handleViewOrderDetails = (order) => {
    setActiveMenuOrderId(null)
    const status = String(order.status || "").toLowerCase()
    const isTerminal = ["delivered", "cancelled", "completed", "failed"].includes(status) || status.includes("cancelled")
    if (isTerminal) navigate(`/food/user/orders/${order.id}/details`)
    else navigate(`/food/user/orders/${order.id}`)
  }

  const handleOpenRating = (order) => {
    setRatingModal({ open: true, order })
    setSelectedRestaurantRating(order.restaurantRating || null)
    setSelectedDeliveryRating(order.deliveryPartnerRating || null)
    setRestaurantFeedbackText(order.ratings?.restaurant?.comment || "")
    setDeliveryFeedbackText(order.ratings?.deliveryPartner?.comment || "")
  }

  const handleCloseRating = () => {
    setRatingModal({ open: false, order: null })
    setSelectedRestaurantRating(null)
    setSelectedDeliveryRating(null)
    setRestaurantFeedbackText("")
    setDeliveryFeedbackText("")
  }

  const handleSubmitRating = async () => {
    const hasDeliveryPartner = !!(ratingModal.order?.deliveryPartnerId || ratingModal.order?.deliveryPartnerName)
    const isMissingDeliveryRating = hasDeliveryPartner && selectedDeliveryRating === null
    if (!ratingModal.order || selectedRestaurantRating === null || isMissingDeliveryRating) {
      toast.error("Please select all required ratings first")
      return
    }
    try {
      setSubmittingRating(true)
      const order = ratingModal.order
      const response = await orderAPI.submitOrderRatings(order.id, {
        restaurantRating: selectedRestaurantRating,
        deliveryPartnerRating: hasDeliveryPartner ? selectedDeliveryRating : undefined,
        restaurantComment: restaurantFeedbackText || undefined,
        deliveryPartnerComment: hasDeliveryPartner ? deliveryFeedbackText || undefined : undefined,
      })
      const updatedOrder = response?.data?.data?.order || response?.data?.order || null

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                restaurantRating: updatedOrder?.ratings?.restaurant?.rating ?? selectedRestaurantRating,
                deliveryPartnerRating: updatedOrder?.ratings?.deliveryPartner?.rating ?? (hasDeliveryPartner ? selectedDeliveryRating : null),
                ratings: updatedOrder?.ratings || {
                  restaurant: { rating: selectedRestaurantRating, comment: restaurantFeedbackText || "" },
                  deliveryPartner: hasDeliveryPartner ? { rating: selectedDeliveryRating, comment: deliveryFeedbackText || "" } : undefined,
                },
                rating: updatedOrder?.ratings?.restaurant?.rating ?? selectedRestaurantRating,
              }
            : o,
        ),
      )

      toast.success("Thanks for rating your order!")
      const orderId = order.id || order._id || order.mongoId
      setShownRatingForOrders((prev) => new Set([...prev, orderId]))
      handleCloseRating()
    } catch (error) {
      debugError("Error submitting order ratings:", error)
      toast.error(error?.response?.data?.message || "Failed to submit ratings. Please try again.")
    } finally {
      setSubmittingRating(false)
    }
  }

  const header = (
    <View style={s.header}>
      <Pressable onPress={goBack} hitSlop={8}>
        <ArrowLeft size={24} color={t.dark ? colors.gray[300] : colors.gray[700]} />
      </Pressable>
      <Text style={s.headerTitle}>Your Orders</Text>
    </View>
  )

  if (loading) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : colors.gray[50]}>
        {header}
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 80 }}>
          <Spin>
            <Loader2 size={32} color={RED} />
          </Spin>
        </View>
      </Screen>
    )
  }

  if (orders.length === 0) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : colors.gray[50]}>
        {header}
        <View style={{ paddingHorizontal: 16, paddingVertical: 32, alignItems: "center" }}>
          <Text style={{ color: t.dark ? colors.gray[400] : colors.gray[600], textAlign: "center" }}>You haven't placed any orders yet</Text>
          {/* web: <Link to="/user"> (redirected to /food/user) */}
          <Pressable onPress={() => navigate("/food/user")} style={{ marginTop: 16 }}>
            <Text style={{ color: RED, fontWeight: "500" }}>Start Ordering</Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  const pill = (tone) => {
    const map = {
      red: { bg: t.dark ? alpha(colors.red[950], 0.4) : colors.red[50], fg: t.dark ? colors.red[300] : colors.red[700], border: t.dark ? alpha(colors.red[900], 0.5) : colors.red[200] },
      amber: { bg: t.dark ? alpha(colors.amber[950], 0.4) : colors.amber[50], fg: t.dark ? colors.amber[300] : colors.amber[700], border: t.dark ? alpha(colors.amber[900], 0.5) : colors.amber[200] },
      emerald: {
        bg: t.dark ? alpha(colors.emerald[950], 0.4) : colors.emerald[50],
        fg: t.dark ? colors.emerald[300] : colors.emerald[700],
        border: t.dark ? alpha(colors.emerald[900], 0.5) : colors.emerald[200],
      },
      green: { bg: colors.green[600], fg: colors.white, border: colors.green[600] },
    }
    return map[tone]
  }

  const StatusPill = ({ tone, children, pulse, wide }) => {
    const p = pill(tone)
    const body = (
      <View style={[s.statusPill, { backgroundColor: p.bg, borderColor: p.border }, tone === "green" && shadow.sm]}>
        <Text style={[s.statusPillText, { color: p.fg, letterSpacing: wide ? 1 : 0.5 }]}>{children}</Text>
      </View>
    )
    return pulse ? <Pulse>{body}</Pulse> : body
  }

  const renderOrder = ({ item: order }) => {
    const isCodOrWallet =
      order.payment?.method === "cash" ||
      order.payment?.method === "cod" ||
      order.payment?.method === "wallet" ||
      order.paymentMethod === "cash" ||
      order.paymentMethod === "cod" ||
      order.paymentMethod === "wallet"
    const isCancelled = order.status === "cancelled" || order.status === "restaurant_cancelled"
    const paymentFailed = !isCodOrWallet && !isCancelled && order.payment?.status === "failed"
    const isDelivered = order.status === "delivered"
    const isRestaurantCancelled = order.isRestaurantCancelled || order.status === "restaurant_cancelled"
    const isUserCancelled = order.isUserCancelled || (isCancelled && order.cancelledBy === "user")
    const firstItemImage = order.items?.[0]?.image
    const restaurantImage = order.restaurantImage || firstItemImage || FALLBACK_RESTAURANT_IMG
    const location = order.restaurantLocation || `${order.address?.city || ""}, ${order.address?.state || ""}`.trim() || "Location not available"

    let statusEl
    if (isRestaurantCancelled) statusEl = <StatusPill tone="red">Cancelled</StatusPill>
    else if (paymentFailed) statusEl = <StatusPill tone="red">Payment Failed</StatusPill>
    else if (isDelivered) statusEl = <StatusPill tone="green" wide>{order.orderType === "takeaway" ? "Picked UP" : "Delivered"}</StatusPill>
    else if (isUserCancelled || (isCancelled && order.cancelledBy === "user")) statusEl = <StatusPill tone="red">Cancelled By You</StatusPill>
    else if (isCancelled) statusEl = <StatusPill tone="red">Cancelled</StatusPill>
    else if (order.orderType === "takeaway" && (order.status === "ready" || order.status === "ready_for_pickup")) statusEl = <StatusPill tone="green" wide>Ready for Pickup</StatusPill>
    else
      statusEl = (
        <StatusPill tone="amber" pulse>
          {order.status === "preparing" ? "Preparing" : order.status === "outForDelivery" ? "Out for Delivery" : order.status === "placed" ? "Order Placed" : "Confirmed"}
        </StatusPill>
      )

    const payTone = order.payment?.status === "completed" || (isDelivered && isCodOrWallet) ? "emerald" : order.payment?.status === "failed" ? "red" : "amber"

    return (
      <View style={s.card}>
        {/* Card Header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <View style={s.restThumb}>
              <RestaurantThumb src={restaurantImage} alt={order.restaurant} style={{ width: "100%", height: "100%" }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={s.restName} numberOfLines={1}>
                  {order.restaurant}
                </Text>
                {order.orderType === "takeaway" ? (
                  <View style={[s.typePill, { backgroundColor: "#FEF3C7", borderColor: alpha("#F59E0B", 0.3) }]}>
                    <Text style={[s.typePillText, { color: "#D97706" }]}>🥡 Takeaway (Self-Pick)</Text>
                  </View>
                ) : order.orderType === "dining" ? (
                  <View style={[s.typePill, { backgroundColor: "#DBEAFE", borderColor: alpha("#3B82F6", 0.3) }]}>
                    <Text style={[s.typePillText, { color: "#2563EB" }]}>🍽️ Dining In</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.metaSmall}>
                Order ID: <Text style={{ fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700] }}>{order.orderId || order.id}</Text>
              </Text>
              <Text style={[s.metaSmall, { fontSize: 11 }]} numberOfLines={1}>
                {location}
              </Text>
              {!!order.deliveryPartnerName && (
                <Text style={{ fontSize: 12, lineHeight: 16, color: colors.gray[600], marginTop: 4 }}>
                  <Text style={{ fontWeight: "500", color: colors.gray[600] }}>Delivery:</Text> {order.deliveryPartnerName}
                  {order.deliveryPartnerPhone ? ` | ${order.deliveryPartnerPhone}` : ""}
                </Text>
              )}
              {!!order.restaurantId && (
                // web: /user/restaurants/:id (redirected to /food/user/...)
                <Pressable onPress={() => navigate(`/food/user/restaurants/${order.restaurantId}`)} style={{ marginTop: 4, alignSelf: "flex-start" }}>
                  {({ pressed }) => <Text style={{ fontSize: 12, lineHeight: 16, color: pressed ? "#991B1B" : RED, fontWeight: "500" }}>View menu {">"}</Text>}
                </Pressable>
              )}
            </View>
          </View>

          <Pressable onPress={() => toggleMenuForOrder(order.id)} style={({ pressed }) => [{ padding: 4, borderRadius: 9999 }, pressed && { backgroundColor: colors.gray[100] }]}>
            <MoreVertical size={20} color={colors.gray[400]} />
          </Pressable>
        </View>

        {activeMenuOrderId === order.id && (
          <View style={s.menu}>
            <Pressable onPress={() => handleShareRestaurant(order)} style={({ pressed }) => [s.menuItem, pressed && s.menuItemPressed]}>
              <Text style={s.menuText}>Share restaurant</Text>
            </Pressable>
            <Pressable onPress={() => handleViewOrderDetails(order)} style={({ pressed }) => [s.menuItem, pressed && s.menuItemPressed]}>
              <Text style={s.menuText}>Order details</Text>
            </Pressable>
          </View>
        )}

        <View style={s.dashed} />

        {/* Items (item photos are hidden below 640px on the web) */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
          {order.items && order.items.length > 0 ? (
            order.items.map((item, idx) => {
              const isVeg = item.isVeg === true || item.foodType === "Veg" || item.category === "veg" || item.type === "veg"
              const itemName = item.name || item.foodName || "Item"
              const itemQuantity = item.quantity || 1
              const itemPrice = item.price || 0
              const itemTotal = itemQuantity * itemPrice
              const vegColor = isVeg ? colors.green[600] : colors.red[600]
              return (
                <View key={item._id || item.id || item.itemId || idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={[s.vegBox, { borderColor: vegColor }]}>
                    <View style={{ flex: 1, alignSelf: "stretch", borderRadius: 9999, backgroundColor: vegColor }} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.itemName}>
                      {itemQuantity} x {itemName}
                    </Text>
                    {item.variantName ? <Text style={s.itemSub}>{item.variantName}</Text> : null}
                    {!!item.description && (
                      <Text style={s.itemSub} numberOfLines={1}>
                        {item.description}
                      </Text>
                    )}
                  </View>
                  <Text style={s.itemTotal}>
                    {"₹"}
                    {itemTotal.toFixed(2)}
                  </Text>
                </View>
              )
            })
          ) : (
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.gray[500] }}>No items found</Text>
          )}
        </View>

        {/* Order Summary (phone width: discount + total only) */}
        <View style={s.summary}>
          <View style={{ gap: 4 }}>
            {order.pricing?.discount > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 11, lineHeight: 16, color: colors.green[600] }}>Discount Applied</Text>
                <Text style={{ fontSize: 11, lineHeight: 16, color: colors.green[600], fontWeight: "500" }}>
                  -{"₹"}
                  {order.pricing.discount.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.totalLabel}>Total Bill</Text>
              <Text style={s.totalValue}>
                {"₹"}
                {order.total.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.hr} />

        {/* Footer */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, gap: 12 }}>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <View style={s.placedPill}>
                <Text style={s.placedText}>Placed: {formatDate(order.createdAt)}</Text>
              </View>
              <Text style={s.placedPlain}>
                {order.payment?.method === "cash" || order.payment?.method === "cod" ? "Cash on Delivery" : order.payment?.method === "wallet" ? "Wallet" : "Online"}
              </Text>
              {!!order.payment?.status && (
                <View style={[s.payPill, { backgroundColor: pill(payTone).bg, borderColor: pill(payTone).border }]}>
                  <Text style={[s.payPillText, { color: pill(payTone).fg }]}>{isDelivered && isCodOrWallet ? "Paid" : order.payment.status}</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>{statusEl}</View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 8, paddingTop: 4 }}>
            <View style={{ minWidth: 0, maxWidth: "100%", flexShrink: 1 }}>
              {isRestaurantCancelled ? (
                <View style={{ gap: 2 }}>
                  {!!order.cancellationReason && (
                    <Text style={{ fontSize: 12, lineHeight: 16, color: t.dark ? colors.red[400] : colors.red[500], fontWeight: "500", fontStyle: "italic" }} numberOfLines={1}>
                      Reason: {order.cancellationReason}
                    </Text>
                  )}
                  <Text style={{ fontSize: 10, lineHeight: 14, color: t.dark ? colors.gray[500] : colors.gray[400] }}>Refund processed in 24-48 hours</Text>
                </View>
              ) : paymentFailed ? (
                <Text style={{ fontSize: 12, lineHeight: 16, color: colors.red[500], fontWeight: "500" }}>Please try ordering again</Text>
              ) : isDelivered && order.restaurantRating && (!order.deliveryPartnerId || order.deliveryPartnerRating) ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] }}>Your rating:</Text>
                  <View style={s.ratedPill}>
                    <Text style={[s.ratedText, { opacity: 0.9 }]}>Food</Text>
                    <Text style={s.ratedText}>{order.restaurantRating}</Text>
                    <Star size={10} color={colors.white} fill={colors.white} />
                  </View>
                  {!!(order.deliveryPartnerId && order.deliveryPartnerRating) && (
                    <View style={s.ratedPill}>
                      <Text style={[s.ratedText, { opacity: 0.9 }]}>Delivery</Text>
                      <Text style={s.ratedText}>{order.deliveryPartnerRating}</Text>
                      <Star size={10} color={colors.white} fill={colors.white} />
                    </View>
                  )}
                </View>
              ) : isDelivered ? (
                <Pressable onPress={() => handleOpenRating(order)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {({ pressed }) => (
                    <>
                      <Star size={14} color={colors.slate[400]} />
                      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: pressed ? RED : t.dark ? colors.slate[400] : colors.slate[500] }}>
                        {order.orderType === "takeaway" ? "Rate Restaurant" : "Rate Restaurant & Delivery"}
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <View>
                  {!!countdowns[order.id] && countdowns[order.id] > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Pulse>
                        <Clock size={12} color={RED} />
                      </Pulse>
                      <Text style={{ fontSize: 12, lineHeight: 16, color: RED, fontWeight: "600" }}>
                        {countdowns[order.id]} min{countdowns[order.id] !== 1 ? "s" : ""} remaining
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginLeft: "auto" }}>
              <Pressable onPress={() => navigate(isDelivered || isCancelled ? `/food/user/orders/${order.id}/details` : `/food/user/orders/${order.id}`)}>
                {({ pressed }) => (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: pressed ? RED : t.dark ? colors.gray[400] : colors.gray[600] }}>View Details</Text>
                    <ChevronRight size={14} color={pressed ? RED : t.dark ? colors.gray[400] : colors.gray[600]} />
                  </View>
                )}
              </Pressable>

              {isDelivered && !paymentFailed && (
                <Pressable onPress={() => handleReorder(order)} style={({ pressed }) => [s.reorderBtn, pressed && { backgroundColor: "#991B1B", transform: [{ scale: 0.95 }] }]}>
                  <RotateCcw size={12} color={colors.white} />
                  <Text style={{ color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: "700" }}>Reorder</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    )
  }

  const StarRow = ({ value, onSelect, keyPrefix }) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
      {Array.from({ length: 5 }, (_, i) => i + 1).map((num) => {
        const isActive = (value || 0) >= num
        return (
          <Pressable key={`${keyPrefix}-${num}`} onPress={() => onSelect(num)} style={({ pressed }) => [{ padding: 8 }, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Star size={40} color={isActive ? colors.yellow[400] : colors.gray[300]} fill={isActive ? colors.yellow[400] : "transparent"} />
          </Pressable>
        )
      })}
    </View>
  )

  const SHARE_TARGETS = [
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: colors.green[600] },
    { id: "telegram", label: "Telegram", icon: Send, color: colors.sky[500] },
    { id: "email", label: "Email", icon: Mail, color: colors.rose[500] },
    { id: "sms", label: "SMS", icon: MessagesSquare, color: colors.violet[500] },
    { id: "facebook", label: "Facebook", icon: Share2, color: colors.blue[600] },
    { id: "x", label: "X", icon: Link2, color: t.dark ? colors.gray[100] : colors.gray[900] },
    { id: "linkedin", label: "LinkedIn", icon: Share2, color: colors.blue[700] },
    { id: "copy", label: "Copy link", icon: Copy, color: t.dark ? colors.gray[400] : colors.gray[600] },
  ]

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.gray[50]}>
      {header}
      <FlatList
        data={filteredOrders}
        keyExtractor={(o) => String(o.id)}
        renderItem={(info) => <View style={{ paddingHorizontal: 16 }}>{renderOrder(info)}</View>}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={s.searchWrap}>
            <View style={s.searchBox}>
              <Search size={20} color={RED} />
              <TextInput
                placeholder="Search by restaurant or dish"
                placeholderTextColor={colors.gray[400]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={s.searchInput}
                returnKeyType="search"
              />
            </View>
          </View>
        }
        ListHeaderComponentStyle={{ marginBottom: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16 }}>
            <View style={s.noMatch}>
              <Text style={{ color: t.dark ? colors.gray[400] : colors.gray[600], textAlign: "center" }}>No orders found matching your search</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={{ alignItems: "center", marginTop: 32, marginBottom: 16 }}>
            <Text style={s.branding}>Hello Parth Food</Text>
          </View>
        }
      />

      {/* Rating & Feedback Modal */}
      <Dialog open={ratingModal.open && !!ratingModal.order} onClose={handleCloseRating} backdropOpacity={0.6} style={s.rateDialog}>
        {ratingModal.order ? (
          <>
            <LinearGradient colors={[RED, "#991B1B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 24, paddingVertical: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Star size={20} color={colors.white} fill={colors.white} />
                  <Text style={{ fontSize: 20, lineHeight: 28, fontWeight: "700", color: colors.white }}>Rate Your Delivery</Text>
                </View>
                <Pressable onPress={handleCloseRating} style={({ pressed }) => [{ padding: 4, borderRadius: 9999 }, pressed && { backgroundColor: alpha(colors.white, 0.2) }]}>
                  <Text style={{ fontSize: 20, lineHeight: 28, color: alpha(colors.white, 0.8) }}>x</Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 14, lineHeight: 20, color: alpha(colors.white, 0.9) }}>{ratingModal.order.restaurant}</Text>
            </LinearGradient>

            <View style={{ paddingHorizontal: 24, paddingVertical: 24 }}>
              <View style={{ marginBottom: 24 }}>
                <Text style={s.rateLabel}>Restaurant rating (out of 5)</Text>
                <StarRow value={selectedRestaurantRating} onSelect={setSelectedRestaurantRating} keyPrefix="restaurant" />
                <TextInput
                  multiline
                  numberOfLines={2}
                  value={restaurantFeedbackText}
                  onChangeText={setRestaurantFeedbackText}
                  placeholder="Restaurant feedback (optional)"
                  placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
                  textAlignVertical="top"
                  onFocus={() => setFocusedField("restaurant")}
                  onBlur={() => setFocusedField(null)}
                  cursorColor={t.dark ? "#ffffff" : "#0f172a"}
                  style={[s.feedback, focusedField === "restaurant" && { borderColor: RED }]}
                />
              </View>

              {ratingModalHasDeliveryPartner && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={s.rateLabel}>Delivery partner rating (out of 5)</Text>
                  <StarRow value={selectedDeliveryRating} onSelect={setSelectedDeliveryRating} keyPrefix="delivery" />
                  <TextInput
                    multiline
                    numberOfLines={2}
                    value={deliveryFeedbackText}
                    onChangeText={setDeliveryFeedbackText}
                    placeholder="Delivery partner feedback (optional)"
                    placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
                    textAlignVertical="top"
                    onFocus={() => setFocusedField("delivery")}
                    onBlur={() => setFocusedField(null)}
                    cursorColor={t.dark ? "#ffffff" : "#0f172a"}
                    style={[s.feedback, focusedField === "delivery" && { borderColor: RED }]}
                  />
                </View>
              )}

              <Pressable disabled={ratingSubmitDisabled} onPress={handleSubmitRating} style={[{ borderRadius: 12, overflow: "hidden" }, ratingSubmitDisabled && { opacity: 0.5 }, shadow.lg]}>
                <LinearGradient colors={[RED, "#991B1B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                  {submittingRating ? (
                    <>
                      <Spin>
                        <Loader2 size={20} color={colors.white} />
                      </Spin>
                      <Text style={s.submitText}>Submitting...</Text>
                    </>
                  ) : (
                    <>
                      <Star size={20} color={colors.white} fill={colors.white} />
                      <Text style={s.submitText}>Submit Ratings</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              {ratingSubmitDisabled && <Text style={{ fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.red[500], marginTop: 8 }}>Please select all required ratings to continue</Text>}
            </View>
          </>
        ) : null}
      </Dialog>

      {/* Share modal (only when the system share sheet is not available) */}
      <Dialog open={showShareModal && !!sharePayload} onClose={() => setShowShareModal(false)} style={s.shareDialog}>
        <View style={s.shareHead}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[900] }}>Share restaurant</Text>
            <Text style={{ fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 2 }}>Choose an app to share this restaurant</Text>
          </View>
          <Pressable onPress={() => setShowShareModal(false)} accessibilityLabel="Close share modal" style={({ pressed }) => [{ padding: 8, borderRadius: 9999 }, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
            <X size={16} color={colors.gray[500]} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 20, paddingVertical: 20, gap: 12 }}>
          {typeof navigator !== "undefined" && !!navigator.share && (
            <Pressable onPress={handleSystemShareFromModal} style={({ pressed }) => [s.sysShare, pressed && { backgroundColor: "#991B1B" }]}>
              <Share2 size={16} color={colors.white} />
              <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.white }}>Share via apps</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, rowGap: 12 }}>
            {SHARE_TARGETS.map((target) => {
              const Icon = target.icon
              return (
                <View key={target.id} style={{ width: "33.333%", paddingHorizontal: 6 }}>
                  <Pressable
                    onPress={() => (target.id === "copy" ? copyShareLink() : openShareTarget(target.id))}
                    style={({ pressed }) => [s.shareTile, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}
                  >
                    <Icon size={20} color={target.color} />
                    <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "500", color: t.dark ? colors.gray[200] : colors.gray[700] }}>{target.label}</Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        </View>
      </Dialog>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  header: {
    backgroundColor: t.dark ? "#121212" : colors.white,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : "#e6e0d1",
    ...shadow.sm,
  },
  headerTitle: { marginLeft: 16, fontSize: 20, lineHeight: 28, fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[800] },
  searchWrap: { padding: 16, backgroundColor: t.dark ? "#121212" : colors.white, marginTop: 4, borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : "#e6e0d1" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...shadow.sm,
  },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 16, lineHeight: 22, color: t.dark ? colors.gray[300] : colors.gray[600] },
  noMatch: {
    backgroundColor: t.dark ? "#121212" : colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    padding: 32,
    ...shadow.sm,
  },
  card: {
    position: "relative",
    backgroundColor: t.dark ? "#121212" : colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    overflow: "hidden",
    ...shadow.sm,
  },
  restThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.gray[200], overflow: "hidden" },
  restName: { flexShrink: 1, fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[800], fontSize: 16, lineHeight: 20 },
  typePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, borderRadius: 9999, ...shadow.sm },
  typePillText: { fontSize: 9, lineHeight: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  metaSmall: { fontSize: 10, lineHeight: 14, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 2 },
  menu: {
    position: "absolute",
    right: 12,
    top: 40,
    zIndex: 20,
    width: 160,
    borderRadius: 14,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    paddingVertical: 4,
    ...shadow.lg,
  },
  menuItem: { paddingHorizontal: 12, paddingVertical: 8 },
  menuItemPressed: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] },
  menuText: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[200] : colors.gray[800] },
  dashed: { borderTopWidth: 1, borderStyle: "dashed", borderTopColor: t.dark ? colors.gray[800] : colors.gray[200], marginHorizontal: 16, marginVertical: 4 },
  vegBox: { width: 16, height: 16, borderWidth: 1, padding: 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  itemName: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[200] : colors.gray[800], fontWeight: "500" },
  itemSub: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 2 },
  itemTotal: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[800], textAlign: "right" },
  summary: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: t.dark ? "#1a1a1a" : colors.gray[50], borderRadius: 10, marginHorizontal: 12, marginBottom: 8 },
  totalLabel: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: t.dark ? colors.gray[200] : colors.gray[800] },
  totalValue: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: t.dark ? colors.gray[100] : colors.gray[900] },
  hr: { borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[100], marginHorizontal: 16, marginVertical: 8 },
  placedPill: {
    backgroundColor: t.dark ? alpha(colors.gray[800], 0.8) : colors.gray[100],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.gray[700], 0.5) : alpha(colors.gray[200], 0.5),
  },
  placedText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700] },
  placedPlain: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700] },
  payPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  payPillText: { fontSize: 10, lineHeight: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  statusPillText: { fontSize: 10, lineHeight: 14, fontWeight: "900", textTransform: "uppercase" },
  ratedPill: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.green[600], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, height: 18 },
  ratedText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  reorderBtn: { backgroundColor: RED, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 4, ...shadow.sm },
  branding: { fontSize: 36, lineHeight: 40, fontWeight: "900", color: t.dark ? colors.gray[800] : colors.gray[200], letterSpacing: -1.8, fontStyle: "italic", textTransform: "uppercase", textAlign: "center" },
  rateDialog: { maxWidth: 448, borderRadius: 24, backgroundColor: t.dark ? "#121212" : colors.white, borderWidth: t.dark ? 1 : 0, borderColor: colors.gray[800], ...shadow["2xl"] },
  rateLabel: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[900], marginBottom: 12 },
  feedback: {
    width: "100%",
    minHeight: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    color: t.dark ? colors.gray[200] : colors.gray[800],
  },
  submitBtn: { paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: "700" },
  shareDialog: { maxWidth: 384, borderRadius: 24, backgroundColor: t.dark ? "#121212" : colors.white, borderWidth: t.dark ? 1 : 0, borderColor: colors.gray[800], ...shadow["2xl"] },
  shareHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100], paddingHorizontal: 20, paddingVertical: 16 },
  sysShare: { width: "100%", borderRadius: 16, backgroundColor: RED, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  shareTile: { borderRadius: 16, borderWidth: 1, borderColor: t.dark ? colors.gray[800] : colors.gray[200], paddingHorizontal: 12, paddingVertical: 16, alignItems: "center", gap: 8 },
}))
