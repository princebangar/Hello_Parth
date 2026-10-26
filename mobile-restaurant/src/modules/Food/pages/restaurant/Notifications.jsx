// Web: pages/restaurant/Notifications.jsx — order updates (last 30 orders, by status) + admin broadcast notifications
// in one list, newest first; X removes one (orders: saved in localStorage, broadcasts: dismissed on the server),
// "Clear all", refresh button, tap on an unread broadcast marks it read. Same texts and rules.
// Native: the list is a FlatList; the header is a fixed row under the status bar.
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft, Bell, RefreshCw, X } from 'lucide-react-native';
import { Screen, Text } from '@/native/ui';
import { alpha, colors, restaurantTheme, sp } from '@/theme';
import { restaurantAPI } from '@food/api';
import useNotificationInbox from '@food/hooks/useNotificationInbox';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';

const debugError = () => {};

const DISMISSED_KEY = 'restaurant_dismissed_notifications';

const getStatusLabel = (status = '') => {
  const normalized = String(status).toLowerCase();
  if (normalized === 'confirmed') return 'New order received';
  if (normalized === 'preparing') return 'Order is preparing';
  if (normalized === 'ready') return 'Order is ready for pickup';
  if (normalized === 'out_for_delivery') return 'Order out for delivery';
  if (normalized === 'delivered') return 'Order delivered';
  if (normalized === 'cancelled') return 'Order cancelled';
  if (normalized === 'rejected') return 'Order rejected';
  return 'Order update';
};

const formatTime = (timestamp) =>
  timestamp
    ? new Date(timestamp).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : 'N/A';

export default function Notifications() {
  const goBack = useRestaurantBackNavigation();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(DISMISSED_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const {
    items: broadcastNotifications,
    loading: broadcastLoading,
    markAsRead: markBroadcastAsRead,
    dismiss: dismissBroadcastNotification,
    dismissAll: dismissAllBroadcastNotifications,
    refresh: refreshBroadcastNotifications,
  } = useNotificationInbox('restaurant', { limit: 100, pollMs: 5 * 60 * 1000 });

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await restaurantAPI.getOrders({ page: 1, limit: 30 });
      const rows = response?.data?.data?.orders || response?.data?.data?.data?.orders || [];
      setOrders(rows);
    } catch (error) {
      if (error.response?.status !== 401) {
        debugError('Error fetching notifications:', error);
      }
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedIds));
  }, [dismissedIds]);

  const notifications = useMemo(() => {
    const orderNotifications = (orders || [])
      .map((order) => {
        const id = order._id || order.orderId;
        const timestamp = order.updatedAt || order.createdAt;
        return {
          id,
          orderId: order.orderId || 'N/A',
          message: getStatusLabel(order.orderStatus || order.status),
          timeValue: timestamp ? new Date(timestamp).getTime() : 0,
          time: formatTime(timestamp),
        };
      })
      .filter((item) => item.id && !dismissedIds.includes(item.id));
    const broadcastRows = (broadcastNotifications || []).map((item) => ({
      id: item.id,
      message: item.title || 'Broadcast notification',
      detail: item.message || '',
      source: 'broadcast',
      read: item.read,
      timeValue: item.createdAt ? new Date(item.createdAt).getTime() : 0,
      time: formatTime(item.createdAt),
    }));

    return [...broadcastRows, ...orderNotifications].sort((a, b) => b.timeValue - a.timeValue);
  }, [broadcastNotifications, dismissedIds, orders]);

  const removeNotification = (id, source = 'order') => {
    if (source === 'broadcast') {
      dismissBroadcastNotification(id);
      return;
    }
    setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const clearAll = () => {
    dismissAllBroadcastNotifications();
    const ids = notifications
      .filter((item) => item.source !== 'broadcast')
      .map((n) => n.id)
      .filter(Boolean);
    setDismissedIds((prev) => [...new Set([...prev, ...ids])]);
  };

  const handleRefresh = async () => {
    await Promise.all([fetchNotifications(), refreshBroadcastNotifications()]);
  };

  const renderItem = ({ item }) => {
    const unreadBroadcast = item.source === 'broadcast' && !item.read;
    return (
      <Pressable
        onPress={item.source === 'broadcast' ? () => markBroadcastAsRead(item.id) : undefined}
        disabled={item.source !== 'broadcast'}
        style={[styles.card, unreadBroadcast ? styles.cardUnread : null]}
      >
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            {item.source === 'broadcast' ? <Bell size={16} color={restaurantTheme.brand} /> : null}
            <Text style={styles.message}>{item.message}</Text>
          </View>
          {item.source === 'broadcast' ? (
            <Text style={styles.sub}>{item.detail || 'Admin notification'}</Text>
          ) : (
            <Text style={styles.sub}>Order: {item.orderId}</Text>
          )}
          <Text style={styles.time}>{item.time}</Text>
        </View>
        <Pressable
          onPress={() => removeNotification(item.id, item.source)}
          accessibilityLabel="Remove notification"
          hitSlop={6}
          style={({ pressed }) => [styles.removeBtn, pressed && { backgroundColor: colors.gray[100] }]}
        >
          <X size={16} color={colors.gray[600]} />
        </Pressable>
      </Pressable>
    );
  };

  const busy = loading || broadcastLoading;

  return (
    <Screen bg={colors.white} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} accessibilityLabel="Back" style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable onPress={handleRefresh} accessibilityLabel="Refresh" style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
          <RefreshCw size={16} color={colors.gray[700]} />
        </Pressable>
      </View>

      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.content}
        data={busy ? [] : notifications}
        keyExtractor={(item, index) => `${item.source || 'order'}-${item.id || index}`}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: sp(2) }} />}
        ListHeaderComponent={
          !loading && notifications.length > 0 ? (
            <View style={styles.clearRow}>
              <Pressable onPress={clearAll} hitSlop={6}>
                <Text style={styles.clearText}>Clear all</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>{busy ? 'Loading notifications...' : 'No notifications'}</Text>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
    paddingBottom: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  iconBtn: { padding: sp(2), borderRadius: 9999 },
  iconBtnPressed: { backgroundColor: colors.gray[100] },
  headerTitle: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900] },
  content: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(28) },
  clearRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: sp(2) },
  clearText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: restaurantTheme.brand },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.gray[600], paddingVertical: sp(12) },
  card: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    padding: sp(3),
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: sp(3),
  },
  cardUnread: { borderColor: colors.blue[200], backgroundColor: alpha(colors.blue[50], 0.4) },
  cardBody: { flexShrink: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  message: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900], flexShrink: 1 },
  sub: { fontSize: 12, lineHeight: 16, color: colors.gray[600], marginTop: 2 },
  time: { fontSize: 12, lineHeight: 16, color: colors.gray[500], marginTop: sp(1) },
  removeBtn: { padding: 6, borderRadius: 9999 },
});
