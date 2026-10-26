import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { ArrowLeft, Bell, Clock, Trash2 } from "lucide-react-native";
import { useNavigate } from "@/lib/router";
import { Screen, Text } from "@/native/ui";
import { alpha, colors, fonts } from "@/theme";
import {
  getDeliveryNotifications,
  saveDeliveryNotifications,
  markDeliveryNotificationAsRead,
} from "@food/utils/deliveryNotifications";
import useNotificationInbox from "@food/hooks/useNotificationInbox";

const PRIMARY = "#15498B"; // text-[#EB590E] / bg-[#EB590E] in the delivery theme

const toTimeLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const normalizeNotifications = (items = []) =>
  (Array.isArray(items) ? items : []).map((item, index) => ({
    id: String(item?.id || item?._id || `delivery-notification-${index}`),
    title: String(item?.title || "Notification").trim(),
    message: String(item?.message || item?.body || "").trim(),
    read: Boolean(item?.read),
    createdAt: item?.createdAt || item?.timestamp || Date.now(),
  }));

export default function NotificationsV2() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(() =>
    normalizeNotifications(getDeliveryNotifications())
  );
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    loading: broadcastLoading,
    markAsRead: markBroadcastAsRead,
    dismissAll: dismissAllBroadcastNotifications,
  } = useNotificationInbox("delivery", { limit: 100 });

  useEffect(() => {
    const syncNotifications = () => {
      setNotifications(normalizeNotifications(getDeliveryNotifications()));
    };

    window.addEventListener("deliveryNotificationsUpdated", syncNotifications);
    window.addEventListener("storage", syncNotifications);
    return () => {
      window.removeEventListener("deliveryNotificationsUpdated", syncNotifications);
      window.removeEventListener("storage", syncNotifications);
    };
  }, []);

  const mergedNotifications = [
    ...(broadcastNotifications || []).map((item) => ({
      ...item,
      source: "broadcast",
    })),
    ...(notifications || []).map((item) => ({
      ...item,
      source: "local",
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const unreadCount = notifications.filter((item) => !item.read).length + broadcastUnreadCount;

  const handleMarkAsRead = (id, source = "local") => {
    if (source === "broadcast") {
      markBroadcastAsRead(id);
      return;
    }
    markDeliveryNotificationAsRead(id);
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, read: true } : item
      )
    );
    window.dispatchEvent(new CustomEvent("deliveryNotificationsUpdated"));
  };

  const handleDismissAll = () => {
    setNotifications([]);
    saveDeliveryNotifications([]);
    dismissAllBroadcastNotifications();
    window.dispatchEvent(new CustomEvent("deliveryNotificationsUpdated"));
  };

  const renderItem = ({ item }) => (
    <Pressable
      onPress={() => handleMarkAsRead(item.id, item.source)}
      style={[styles.item, item.read ? styles.itemRead : styles.itemUnread]}
    >
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemMsg}>{item.message || "Delivery notification"}</Text>
        <View style={styles.timeRow}>
          <Clock size={14} color={colors.gray[500]} />
          <Text style={styles.timeText}>{toTimeLabel(item.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <Screen bg={colors.white}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigate("/food/delivery/profile")}
          style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <View style={styles.titleRow}>
          <Bell size={20} color={PRIMARY} />
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{String(unreadCount)}</Text>
            </View>
          ) : null}
        </View>
        {mergedNotifications.length > 0 ? (
          <Pressable
            onPress={handleDismissAll}
            style={({ pressed }) => [styles.clearBtn, pressed && { backgroundColor: colors.red[50] }]}
            accessibilityLabel="Clear all"
          >
            <Trash2 size={16} color={colors.red[600]} />
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      {broadcastLoading ? (
        <View style={styles.body}>
          <Text style={styles.empty}>Loading notifications...</Text>
        </View>
      ) : mergedNotifications.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.empty}>No notifications</Text>
        </View>
      ) : (
        <FlatList
          data={mergedNotifications}
          keyExtractor={(item) => `${item.source}-${item.id}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backBtn: { padding: 8, borderRadius: 9999 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { fontFamily: fonts.sora, fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.gray[900], letterSpacing: 0.16 },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 9999, backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
  clearText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.red[600] },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112 },
  empty: { textAlign: "center", fontSize: 14, lineHeight: 20, color: colors.gray[600], paddingVertical: 48 },
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112 },
  item: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  itemRead: { borderColor: colors.gray[200] },
  itemUnread: { borderColor: "#C3D0E1", backgroundColor: alpha(colors.orange[50], 0.4) },
  itemTitle: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[900] },
  itemMsg: { fontSize: 14, lineHeight: 20, color: colors.gray[700], marginTop: 2 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  timeText: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
});
