// Web: modules/Food/pages/user/Notifications.jsx — local order/OTP alerts (localStorage "food_user_notifications")
// merged with the admin broadcast inbox (useNotificationInbox). Same logic and events.
import React, { useState, useEffect, useMemo } from "react"
import { FlatList, Pressable, View } from "react-native"
import { ArrowLeft, Bell, CheckCircle2, Clock, Tag, Gift, AlertCircle, Trash2, X } from "lucide-react-native"
import { Link } from "@/lib/router"
import { Screen, Skeleton, Text } from "@/native/ui"
import { alpha, colors, makeStyles, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardContent } from "@food/components/ui/card"
import { Badge } from "@food/components/ui/badge"
import useNotificationInbox from "@food/hooks/useNotificationInbox"

const STORAGE_KEY = "food_user_notifications"

// Icon mapping for dynamic icons
const ICON_MAP = {
  CheckCircle2,
  Tag,
  Gift,
  AlertCircle,
  Bell,
}

/** Stored items carry the web's Tailwind text colour class ("text-[#991B1B]", "text-blue-600"): resolve it. */
const colorFromClass = (cls, fallback) => {
  const str = String(cls || "")
  const hex = str.match(/text-\[(#[0-9a-fA-F]{3,8})\]/)
  if (hex) return hex[1]
  const named = str.match(/text-([a-z]+)-(\d{2,3})/)
  if (named && colors[named[1]]?.[named[2]]) return colors[named[1]][named[2]]
  if (/text-white/.test(str)) return colors.white
  return fallback
}

/** Old demo seeds that were baked into the UI — never show these as real alerts. */
const isLegacyMockNotification = (item) => {
  if (!item || typeof item !== "object") return true
  const id = String(item.id || "")
  const title = String(item.title || "")
  const message = String(item.message || "")
  if (id === "1" || id === "2") return true
  if (title === "Order Confirmed" && message.includes("#12345")) return true
  if (title === "Special Offer" && message.includes("50% off")) return true
  return false
}

const readLocalNotifications = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => !isLegacyMockNotification(item))
  } catch {
    return []
  }
}

export default function Notifications() {
  const t = useTheme()
  const s = useStyles()
  const [notificationsList, setNotificationsList] = useState(() => readLocalNotifications())
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    markAsRead: markBroadcastAsRead,
    dismiss: dismissBroadcastNotification,
    dismissAll: dismissAllBroadcastNotifications,
    loading: isLoadingInbox,
  } = useNotificationInbox("user", { limit: 100 })

  // One-time purge of legacy mock seeds stuck in localStorage
  useEffect(() => {
    const cleaned = readLocalNotifications()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    } catch {
      /* ignore */
    }
    setNotificationsList(cleaned)
  }, [])

  // Persistence: Save to localStorage whenever list updates
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notificationsList))
    } catch {
      /* ignore */
    }
    queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent("notificationsUpdated", {
          detail: { count: notificationsList.filter((n) => !n.read).length },
        }),
      )
    })
  }, [notificationsList])

  // Keep in sync when UserLayout (or others) write order alerts to localStorage
  useEffect(() => {
    const syncFromStorage = () => {
      const next = readLocalNotifications()
      setNotificationsList((prev) => {
        try {
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev
        } catch {
          /* fall through */
        }
        return next
      })
    }
    const onStorage = (e) => {
      if (e?.key === STORAGE_KEY) syncFromStorage()
    }
    window.addEventListener("notificationsUpdated", syncFromStorage)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("notificationsUpdated", syncFromStorage)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  // OTP alerts only (order status is owned by UserLayout to avoid duplicates)
  useEffect(() => {
    const handleDeliveryOtp = (event) => {
      const { orderId, otp, message, orderType } = event?.detail || {}
      const isTakeaway = orderType === "takeaway"
      const newNotification = {
        id: `otp-${orderId || "x"}-${otp || Date.now()}`,
        type: "alert",
        title: isTakeaway ? "Takeaway OTP Received" : "Delivery OTP Received",
        message: message || `Your OTP for order #${orderId} is ${otp}`,
        time: "Just now",
        timestamp: Date.now(),
        read: false,
        icon: "AlertCircle",
        iconColor: "text-[#991B1B]",
      }
      setNotificationsList((prev) => {
        const cleaned = prev.filter((item) => !isLegacyMockNotification(item))
        const dedupeKey = `otp-${orderId || "x"}`
        const already = cleaned.some(
          (n) => String(n.id || "").startsWith(dedupeKey) || (n.title === newNotification.title && n.message === newNotification.message),
        )
        if (already) return prev
        return [newNotification, ...cleaned].slice(0, 100)
      })
    }

    window.addEventListener("deliveryOtpReceived", handleDeliveryOtp)
    return () => window.removeEventListener("deliveryOtpReceived", handleDeliveryOtp)
  }, [])

  const mergedNotifications = useMemo(() => {
    const localItems = (notificationsList || [])
      .filter((item) => !isLegacyMockNotification(item))
      .map((item) => ({ ...item, source: "local" }))
    const broadcastItems = (broadcastNotifications || []).map((item) => ({
      ...item,
      source: "broadcast",
      type: "broadcast",
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "Just now",
      timestamp: item.createdAt || Date.now(),
      icon: "Bell",
      iconColor: "text-blue-600",
    }))

    return [...broadcastItems, ...localItems].sort(
      (a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime(),
    )
  }, [broadcastNotifications, notificationsList])

  const unreadCount = notificationsList.filter((n) => !n.read && !isLegacyMockNotification(n)).length + broadcastUnreadCount

  const handleMarkAsRead = (id, source = "local") => {
    if (source === "broadcast") {
      markBroadcastAsRead(id)
      return
    }
    setNotificationsList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const handleClearAll = () => {
    setNotificationsList([])
    dismissAllBroadcastNotifications()
  }

  const handleDeleteOne = (id, source = "local") => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id)
      return
    }
    setNotificationsList((prev) => prev.filter((notification) => notification.id !== id))
  }

  const iconBg = (type) => {
    if (type === "order") return t.dark ? alpha(colors.green[900], 0.4) : colors.green[100]
    if (type === "offer") return t.dark ? alpha(colors.red[900], 0.4) : colors.red[100]
    if (type === "broadcast") return t.dark ? alpha(colors.blue[900], 0.4) : colors.blue[100]
    return t.dark ? alpha(colors.orange[900], 0.4) : colors.orange[100]
  }

  const header = (
    <View style={s.header}>
      <Link to="/food/user" style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: t.dark ? alpha(colors.white, 0.08) : "#f6e2b5" }]}>
        <ArrowLeft size={16} color={t.dark ? "#fafafa" : "#270e01"} />
      </Link>
      <View style={s.titleRow}>
        <Bell size={20} color="#DC2626" fill="#DC2626" />
        <Text style={s.title}>Notifications</Text>
        {unreadCount > 0 && (
          <Badge style={{ backgroundColor: colors.green[500], borderColor: "transparent" }} textStyle={{ color: colors.white, fontSize: 12 }}>
            {String(unreadCount)}
          </Badge>
        )}
      </View>
      {mergedNotifications.length > 0 && (
        <Pressable onPress={handleClearAll} style={s.clearBtn}>
          {({ pressed }) => (
            <>
              <Trash2 size={16} color={pressed ? colors.red[500] : colors.gray[500]} />
              <Text style={[s.clearText, pressed && { color: colors.red[500] }]}>Clear All</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  )

  const renderItem = ({ item: notification }) => {
    const Icon = ICON_MAP[notification.icon] || Bell
    const unread = !notification.read
    return (
      <Card
        onPress={() => handleMarkAsRead(notification.id, notification.source)}
        style={[s.card, unread ? s.cardUnread : s.cardRead]}
      >
        {unread && <View style={s.dot} />}
        <CardContent style={{ padding: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={[s.iconCircle, { backgroundColor: iconBg(notification.type) }]}>
              <Icon size={20} color={colorFromClass(notification.iconColor, t.dark ? colors.white : colors.gray[900])} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.itemTop}>
                <Text style={[s.itemTitle, { color: unread ? (t.dark ? colors.white : colors.gray[900]) : t.dark ? colors.gray[300] : colors.gray[700] }]}>
                  {notification.title}
                </Text>
                <Pressable
                  accessibilityLabel="Delete notification"
                  onPress={() => handleDeleteOne(notification.id, notification.source)}
                  style={({ pressed }) => [s.delBtn, pressed && { backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50] }]}
                  hitSlop={6}
                >
                  {({ pressed }) => <X size={16} color={pressed ? colors.red[500] : colors.gray[400]} />}
                </Pressable>
              </View>
              <Text style={s.message}>{notification.message}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Clock size={12} color={t.dark ? colors.gray[400] : colors.gray[500]} />
                <Text style={s.time}>{notification.time}</Text>
              </View>
            </View>
          </View>
        </CardContent>
      </Card>
    )
  }

  const loadingView = (
    <View style={{ gap: 12, paddingTop: 4 }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={s.skelCard}>
          <Skeleton width={40} height={40} rounded={9999} />
          <View style={{ flex: 1, gap: 8, paddingVertical: 4 }}>
            <Skeleton width="33%" height={16} rounded={4} />
            <Skeleton width="83%" height={14} rounded={4} />
            <Skeleton width="25%" height={12} rounded={4} />
          </View>
        </View>
      ))}
    </View>
  )

  const emptyView = (
    <View style={s.empty}>
      <Bell size={64} color={t.dark ? colors.gray[600] : colors.gray[300]} />
      <Text style={s.emptyTitle}>No notifications</Text>
      <Text style={s.emptyText}>You're all caught up!</Text>
    </View>
  )

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
      <AnimatedPage style={{ flex: 1 }}>
        <FlatList
          data={isLoadingInbox && mergedNotifications.length === 0 ? [] : mergedNotifications}
          keyExtractor={(n) => `${n.source}-${n.id}`}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={isLoadingInbox && mergedNotifications.length === 0 ? loadingView : emptyView}
          contentContainerStyle={s.list}
        />
      </AnimatedPage>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  list: { paddingHorizontal: 12, paddingVertical: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backBtn: { width: 32, height: 32, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: t.dark ? colors.white : colors.gray[800] },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, height: 32, borderRadius: 8 },
  clearText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.gray[500] },
  card: { position: "relative", paddingVertical: 4, gap: 0, borderWidth: 1 },
  cardUnread: {
    backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : alpha(colors.red[50], 0.5),
    borderColor: t.dark ? colors.red[800] : colors.red[200],
  },
  cardRead: { backgroundColor: t.dark ? colors.gray[800] : colors.white, borderColor: t.dark ? colors.gray[700] : colors.gray[200] },
  dot: { position: "absolute", top: 8, right: 8, width: 10, height: 10, backgroundColor: "#DC2626", borderRadius: 9999, zIndex: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  itemTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  itemTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", flex: 1 },
  delBtn: { borderRadius: 9999, padding: 4 },
  message: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[600], marginBottom: 8 },
  time: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] },
  skelCard: {
    backgroundColor: t.dark ? colors.gray[800] : colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: { fontSize: 18, lineHeight: 28, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700], marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[400] : colors.gray[500] },
}))

