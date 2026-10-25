// Web: modules/Taxi/modules/user/pages/Notifications.jsx — the Taxi inbox (server notifications + realtime ride /
// support notices), clear all / remove one, refresh. APIs: userAuthService.getNotifications (GET /users/notifications),
// clearAllNotifications (DELETE /users/notifications), deleteNotification (DELETE /users/notifications/:id).
// window.confirm -> Alert.alert. Colours follow index.css's .user-app-theme remaps (see UserThemeContext).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AlertCircle, ArrowLeft, Bell, Megaphone, RefreshCw, Trash2 } from 'lucide-react-native';
import { useNavigate, router } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, StatusBarSpacer, Text } from '@/native/ui';
import { colors } from '@/theme';
import { userAuthService } from '../services/authService';
import { useUserTheme, useUserPalette, USER_SHADOW } from '../../../shared/context/UserThemeContext';
import {
  USER_NOTIFICATIONS_UPDATED_EVENT,
  clearRealtimeNotifications,
  getRealtimeNotifications,
  isRealtimeNotification,
  removeRealtimeNotification,
} from '../utils/realtimeNotificationStore';
import { markTaxiNotificationsSeen } from '../utils/useTaxiNotificationUnread';
import NumberSkeleton from '@/shared/components/NumberSkeleton';
import { recallLastKnown, rememberLastKnown } from '@/shared/utils/lastKnown';

const NOTIFICATIONS_KEY = 'taxi:notifications';

const formatNotificationTime = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const usePulse = () => {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
};

const SkeletonCard = () => {
  const p = useUserPalette();
  const opacity = usePulse();
  return (
    <Animated.View style={[styles.skelCard, { backgroundColor: p.cardBg, borderColor: p.border, opacity }]}>
      <View style={[styles.skelIcon, { backgroundColor: p.cardSoft }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[styles.skelLine, { height: 12, width: '66%', backgroundColor: p.cardSoft }]} />
        <View style={[styles.skelLine, { height: 10, width: '100%', backgroundColor: p.cardSoft }]} />
        <View style={[styles.skelLine, { height: 10, width: '80%', backgroundColor: p.cardSoft }]} />
      </View>
    </Animated.View>
  );
};

const Spin = ({ spinning, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) {
      v.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spinning, v]);
  return <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>{children}</Animated.View>;
};

const NotificationRow = ({ n, onRemove }) => {
  const p = useUserPalette();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [v]);

  return (
    <Animated.View
      style={[
        styles.card,
        { borderColor: p.border, backgroundColor: p.cardBg },
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: p.cardSoft }]}>
        <Megaphone size={16} color={colors.blue[500]} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: p.textPrimary }]}>{n.title || 'Notification'}</Text>
          <View style={styles.cardActions}>
            <Text style={[styles.time, { color: p.textSecondary }]}>{formatNotificationTime(n.sentAt)}</Text>
            <Pressable onPress={() => onRemove(n.id)} hitSlop={6} style={{ padding: 6 }}>
              <Trash2 size={13} strokeWidth={2.5} color={p.textSecondary} />
            </Pressable>
          </View>
        </View>
        <Text style={[styles.body, { color: p.textMuted }]}>{n.body || 'No message'}</Text>

        {n.image ? (
          <View style={[styles.imageBox, { borderColor: p.border, backgroundColor: p.cardBg }]}>
            <AppImage src={n.image} accessibilityLabel="Notification content" contentFit="cover" style={styles.image} />
          </View>
        ) : null}

        {n.serviceLocationName ? <Text style={[styles.location, { color: p.textSecondary }]}>{n.serviceLocationName}</Text> : null}
      </View>
    </Animated.View>
  );
};

const Notifications = () => {
  const navigate = useNavigate();
  // Back goes to the screen the bell was tapped on (Home, Profile ...). Opened directly: Home.
  const goBack = () => {
    if (router.canGoBack()) navigate(-1);
    else navigate('/taxi/user');
  };
  // The last list seen shows at once (and its count); it is refreshed in the background. Nothing seen yet -> skeletons.
  const [serverNotifications, setServerNotifications] = useState(() => {
    const remembered = recallLastKnown(NOTIFICATIONS_KEY);
    return Array.isArray(remembered) ? remembered : [];
  });
  const [loading, setLoading] = useState(() => !Array.isArray(recallLastKnown(NOTIFICATIONS_KEY)));
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(false);

  const notifications = useMemo(() => {
    const merged = [...serverNotifications, ...getRealtimeNotifications()];

    return merged
      .filter((notification) => notification?.id)
      .sort((left, right) => {
        const leftTime = new Date(left.sentAt || 0).getTime();
        const rightTime = new Date(right.sentAt || 0).getTime();
        return rightTime - leftTime;
      });
  }, [serverNotifications]);

  const fetchNotifications = async () => {
    setLoading(!Array.isArray(recallLastKnown(NOTIFICATIONS_KEY)));
    setError(null);
    try {
      const response = await userAuthService.getNotifications();
      const results = response?.data?.results || [];
      setServerNotifications(results);
      rememberLastKnown(NOTIFICATIONS_KEY, results);
    } catch (err) {
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening the list clears the bell badge; anything that arrives while it is open is seen too.
  useEffect(() => {
    markTaxiNotificationsSeen();
    return () => markTaxiNotificationsSeen();
  }, [notifications.length]);

  useEffect(() => {
    const handleRealtimeNotificationsUpdated = () => {
      setServerNotifications((current) => [...current]);
    };

    window.addEventListener(USER_NOTIFICATIONS_UPDATED_EVENT, handleRealtimeNotificationsUpdated);

    return () => {
      window.removeEventListener(USER_NOTIFICATIONS_UPDATED_EVENT, handleRealtimeNotificationsUpdated);
    };
  }, []);

  const clearAll = async () => {
    setClearing(true);
    try {
      await userAuthService.clearAllNotifications();
      clearRealtimeNotifications();
      setServerNotifications([]);
      rememberLastKnown(NOTIFICATIONS_KEY, []);
      toast.success('All notifications cleared');
    } catch (err) {
      toast.error(err?.message || 'Failed to clear notifications');
    } finally {
      setClearing(false);
    }
  };

  const handleClearAll = () => {
    if (notifications.length === 0) return;
    Alert.alert('', 'Are you sure you want to clear all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: clearAll },
    ]);
  };

  const handleRemoveSingle = async (id) => {
    if (isRealtimeNotification(id)) {
      removeRealtimeNotification(id);
      toast.success('Notification removed');
      return;
    }

    try {
      await userAuthService.deleteNotification(id);
      setServerNotifications((prev) => prev.filter((notification) => notification.id !== id));
      toast.success('Notification removed');
    } catch (err) {
      toast.error('Failed to remove notification');
    }
  };

  const totalCount = notifications.length;

  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';

  const listHeader = (
    <View style={{ gap: 10 }}>
      <View style={styles.toolbar}>
        <Text style={[styles.kicker, { color: p.textSecondary }]}>Admin & System Alerts</Text>
        <View style={styles.toolbarActions}>
          {notifications.length > 0 && (
            <Pressable
              onPress={handleClearAll}
              disabled={clearing || loading}
              style={({ pressed }) => [styles.toolBtn, (clearing || loading) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Trash2 size={12} strokeWidth={2.5} color={colors.rose[500]} />
              <Text style={[styles.toolText, { color: colors.rose[500] }]}>Clear All</Text>
            </Pressable>
          )}
          <Pressable onPress={fetchNotifications} style={({ pressed }) => [styles.toolBtn, { gap: 4 }, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Spin spinning={loading}>
              <RefreshCw size={12} strokeWidth={2.5} color={p.textMuted} />
            </Spin>
            <Text style={[styles.toolText, { color: p.textMuted }]}>Refresh</Text>
          </Pressable>
        </View>
      </View>

      {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}

      {error && !loading && (
        <View style={styles.stateBox}>
          <View style={[styles.stateIcon, { width: 64, height: 64, backgroundColor: p.cardBg, borderColor: p.border }]}>
            <AlertCircle size={28} color={colors.red[400]} strokeWidth={2} />
          </View>
          <Text style={[styles.stateTitle, { fontSize: 14, color: p.textSecondary }]}>{error}</Text>
          <Pressable onPress={fetchNotifications} style={({ pressed }) => [styles.retry, { backgroundColor: p.accent }, pressed && { transform: [{ scale: 0.95 }] }]}>
            <RefreshCw size={13} strokeWidth={2.5} color="#0b1220" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && notifications.length === 0 && (
        <View style={styles.stateBox}>
          <View style={[styles.stateIcon, { width: 80, height: 80, backgroundColor: p.cardBg, borderColor: p.border }]}>
            <Bell size={36} color={p.textSecondary} strokeWidth={1.5} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.stateTitle, { color: p.textSecondary }]}>You're all caught up</Text>
            <Text style={[styles.stateSub, { color: p.textSecondary }]}>No new notifications right now</Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: p.bg }]}>
      {/* Header (sticky on the web) */}
      <View style={[styles.header, { backgroundColor: p.cardBg, borderBottomColor: p.border }, isDark ? styles.headerShadowDark : styles.headerShadowLight]}>
        <StatusBarSpacer />
        <View style={styles.headerRow}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [styles.backBtn, { borderColor: p.border, backgroundColor: p.cardBg }, USER_SHADOW, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={p.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: p.textSecondary }]}>Inbox</Text>
            <Text style={[styles.h1, { color: p.textPrimary }]}>Notifications</Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: isDark ? p.accent : p.cardBg }, USER_SHADOW]}>
            {loading ? (
              <NumberSkeleton width="1.2em" fontSize={10} color={isDark ? '#0b1220' : p.textPrimary} />
            ) : (
              <Text style={[styles.countText, { color: isDark ? '#0b1220' : p.textPrimary }]}>{totalCount}</Text>
            )}
          </View>
        </View>
      </View>

      <FlatList
        data={!loading && !error ? notifications : []}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <NotificationRow n={item} onRemove={handleRemoveSingle} />}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponentStyle={{ marginBottom: 10 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  headerShadowDark: { elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  headerShadowLight: { elevation: 2, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  headerRow: { paddingTop: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2.7 },
  h1: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.47 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  countText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 112 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolText: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  skelCard: { borderRadius: 20, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  skelIcon: { width: 40, height: 40, borderRadius: 12 },
  skelLine: { borderRadius: 999 },
  stateBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 16 },
  stateIcon: { borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  stateSub: { marginTop: 4, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  retryText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, color: '#0b1220' },
  card: {
    position: 'relative',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  time: { fontSize: 10.5, fontWeight: '600', marginTop: 2 },
  body: { marginTop: 4, fontSize: 11, lineHeight: 18, fontWeight: '600' },
  imageBox: { marginTop: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  image: { width: '100%', height: 180 },
  location: { marginTop: 8, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
});

export default Notifications;
