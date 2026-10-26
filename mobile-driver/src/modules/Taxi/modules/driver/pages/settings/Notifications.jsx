// Web: modules/Taxi/modules/driver/pages/settings/Notifications.jsx — the driver / owner inbox: admin & system alerts
// (remove one / clear all) and scheduled rides (live countdown; a tap opens the ride preview popup), 10 per page.
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import {
  ArrowLeft,
  Bell,
  AlertCircle,
  RefreshCw,
  Radio,
  Trash2,
  CalendarClock,
  ChevronRight,
  Clock3,
  MapPin,
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Skeleton, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { toast } from '@/lib/toast';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { clearAllDriverNotifications, deleteDriverNotification, getDriverNotifications, getDriverScheduledRides } from '../../services/registrationService';
import {
  getVisibleDriverNotifications,
  getMergedDriverNotifications,
  hideAllDriverNotifications,
  hideDriverNotification,
  markDriverNotificationsAsRead,
} from '../../utils/notificationState';
import IncomingRideRequest from '../IncomingRideRequest';
import { getScheduledRideCountdown } from '../../utils/scheduledRideTime';

const formatNotificationTime = (value) => {
  if (!value) {
    return 'Recently';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Schedule time not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Schedule time not available';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDistanceLabel = (meters) => {
  const value = Number(meters || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Nearby';
  }

  if (value < 1000) {
    return `${Math.round(value)} m`;
  }

  return `${(value / 1000).toFixed(1)} km`;
};

const formatFareLabel = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Rs 0';
  }

  return `Rs ${amount}`;
};

const createScheduledRidePreview = (ride) => ({
  rideId: ride.rideId,
  type: ride.type || ride.serviceType || 'ride',
  fare: formatFareLabel(ride.fare || ride.baseFare),
  distance: formatDistanceLabel(ride.estimatedDistanceMeters),
  payment: ride.paymentMethod || 'cash',
  pickup: ride.pickupAddress || 'Pickup point',
  drop: ride.dropAddress || 'Drop point',
  scheduledAt: ride.scheduledAt || null,
  customer: {
    name: ride.user?.name || 'Customer',
    phone: ride.user?.phone || '',
  },
  raw: {
    fare: ride.fare,
    baseFare: ride.baseFare,
    bookingMode: ride.bookingMode || 'normal',
    parcel: ride.parcel || null,
    intercity: ride.intercity || null,
    user: ride.user || null,
    pickupAddress: ride.pickupAddress || '',
    dropAddress: ride.dropAddress || '',
    scheduledAt: ride.scheduledAt || null,
    ride,
  },
});

// The web's blurred colour blobs (blur-3xl): a radial fade of the same colour.
const GlowBlob = ({ id, size, color, opacity, style }) => (
  <View pointerEvents="none" style={[{ position: 'absolute', width: size * 1.6, height: size * 1.6 }, style]}>
    <Svg width="100%" height="100%">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.6} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50%" cy="50%" r="50%" fill={`url(#${id})`} />
    </Svg>
  </View>
);

const SkeletonCard = () => (
  <View style={styles.skeletonCard}>
    <Skeleton width={40} height={40} rounded={12} style={{ backgroundColor: colors.slate[200] }} />
    <View style={styles.skeletonLines}>
      <Skeleton width="66%" height={12} rounded={999} style={{ backgroundColor: colors.slate[200] }} />
      <Skeleton width="100%" height={10} rounded={999} style={{ backgroundColor: colors.slate[100] }} />
      <Skeleton width="80%" height={10} rounded={999} style={{ backgroundColor: colors.slate[100] }} />
    </View>
  </View>
);

// w-full h-auto max-h-[180px] object-cover: the picture's own height, at most 180.
const NotificationImage = ({ uri }) => {
  const [width, setWidth] = useState(0);
  const [aspect, setAspect] = useState(0);
  const height = width && aspect ? Math.min(width / aspect, 180) : 180;
  return (
    <View style={styles.imageWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <AppImage
        src={uri}
        accessibilityLabel="Notification content"
        style={{ width: '100%', height }}
        contentFit="cover"
        onLoad={(e) => {
          const w = Number(e?.source?.width || 0);
          const h = Number(e?.source?.height || 0);
          if (w > 0 && h > 0) setAspect(w / h);
        }}
      />
    </View>
  );
};

const DriverNotifications = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [activeTab, setActiveTab] = useState('alerts');
  const [alertItems, setAlertItems] = useState([]);
  const [scheduledRides, setScheduledRides] = useState([]);
  const [selectedScheduledRide, setSelectedScheduledRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduledError, setScheduledError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());

  const [alertsPage, setAlertsPage] = useState(1);
  const [schedulePage, setSchedulePage] = useState(1);
  const [hasMoreAlerts, setHasMoreAlerts] = useState(false);
  const [hasMoreSchedule, setHasMoreSchedule] = useState(false);
  const pageSize = 10;

  const handleClearAll = async () => {
    if (alertItems.length === 0) return;

    setClearing(true);
    try {
      // Saved on the server (per captain), so cleared items do not come back when the app is reopened.
      // The local list is only a fast copy of the same thing.
      await clearAllDriverNotifications();
      hideAllDriverNotifications(alertItems.map((notification) => notification.id || notification._id));
      setAlertItems([]);
      toast.success('All notifications cleared');
    } catch {
      toast.error('Failed to clear notifications');
    } finally {
      setClearing(false);
    }
  };

  const handleRemoveSingle = async (id) => {
    try {
      await deleteDriverNotification(id).catch(() => null);
      hideDriverNotification(id);
      setAlertItems((prev) => prev.filter((notification) => String(notification.id || notification._id) !== String(id)));
      toast.success('Notification removed');
    } catch {
      toast.error('Failed to remove notification');
    }
  };

  const loadAllData = async (targetPage = 1) => {
    if (activeTab === 'alerts') setLoading(true);
    else setScheduledLoading(true);

    setError('');
    setScheduledError('');

    try {
      if (activeTab === 'alerts') {
        const res = await getDriverNotifications({ page: targetPage, limit: pageSize });
        const results = res?.data?.results || [];
        const total = res?.data?.totalCount || results.length;

        const visibleNotifications = getVisibleDriverNotifications(results);
        setAlertItems(visibleNotifications);
        setHasMoreAlerts(targetPage * pageSize < total);
        setAlertsPage(targetPage);

        if (results.length > 0) {
          markDriverNotificationsAsRead(getMergedDriverNotifications(results).map((n) => n.id || n._id));
        }
      } else {
        const res = await getDriverScheduledRides({ page: targetPage, limit: pageSize });
        const results = res?.data?.results || [];
        const total = res?.data?.totalCount || results.length;

        const nextScheduledRides = results
          .filter((ride) => ride?.scheduledAt)
          .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

        setScheduledRides(nextScheduledRides);
        setHasMoreSchedule(targetPage * pageSize < total);
        setSchedulePage(targetPage);
      }
    } catch (err) {
      if (activeTab === 'alerts') setError(err?.message || 'Failed to load notifications');
      else setScheduledError(err?.message || 'Failed to load scheduled rides');
    } finally {
      setLoading(false);
      setScheduledLoading(false);
    }
  };

  useEffect(() => {
    loadAllData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the web reloads on a tab change only
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'schedule' || scheduledRides.length === 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      setScheduleNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [activeTab, scheduledRides.length]);

  const totalCount = useMemo(
    () => (activeTab === 'schedule' ? scheduledRides.length : alertItems.length),
    [activeTab, alertItems.length, scheduledRides.length],
  );

  const currentPage = activeTab === 'alerts' ? alertsPage : schedulePage;
  const anyLoading = loading || scheduledLoading;

  const listData = activeTab === 'alerts'
    ? (!loading && !error ? alertItems : [])
    : (!scheduledLoading && !scheduledError ? scheduledRides : []);

  const renderAlert = (notification) => (
    <View style={styles.alertCard}>
      <View style={[styles.itemIcon, { backgroundColor: colors.emerald[50] }]}>
        <Radio size={16} color={colors.emerald[500]} strokeWidth={2.3} />
      </View>
      <View style={styles.itemBody}>
        <View style={styles.alertHead}>
          <Text style={styles.alertTitle}>{notification.title || 'Notification'}</Text>
          <View style={styles.alertMeta}>
            <Text style={styles.alertTime}>{formatNotificationTime(notification.sentAt)}</Text>
            <Pressable onPress={() => handleRemoveSingle(notification.id)} style={styles.removeBtn} hitSlop={6}>
              {({ pressed }) => <Trash2 size={13} strokeWidth={2.5} color={pressed ? colors.rose[500] : colors.slate[300]} />}
            </Pressable>
          </View>
        </View>
        <Text style={styles.alertText}>{notification.body || 'No message'}</Text>

        {notification.image ? <NotificationImage uri={notification.image} /> : null}

        {notification.serviceLocationName ? (
          <Text style={styles.alertLocation}>{notification.serviceLocationName}</Text>
        ) : null}
      </View>
    </View>
  );

  const renderScheduled = (ride) => (
    <Pressable
      onPress={() => setSelectedScheduledRide(createScheduledRidePreview(ride))}
      style={({ pressed }) => [styles.scheduleCard, pressed && styles.pressed99]}
    >
      <View style={styles.scheduleRow}>
        <View style={[styles.itemIcon, { backgroundColor: colors.blue[50] }]}>
          <CalendarClock size={16} color={colors.blue[600]} strokeWidth={2.3} />
        </View>
        <View style={styles.itemBody}>
          <View style={styles.scheduleHead}>
            <View style={styles.scheduleTitles}>
              <Text style={styles.alertTitle}>
                {ride.type === 'parcel' ? 'Scheduled delivery' : ride.type === 'intercity' ? 'Scheduled intercity ride' : 'Scheduled ride'}
              </Text>
              <Text style={styles.scheduleWhen}>{formatScheduledDateTime(ride.scheduledAt)}</Text>
              <Text style={styles.scheduleCountdown}>{getScheduledRideCountdown(ride.scheduledAt, scheduleNow)}</Text>
            </View>
            <ChevronRight size={16} color={colors.slate[300]} strokeWidth={2.5} style={{ marginTop: 2 }} />
          </View>

          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Fare</Text>
              <Text style={styles.statValue}>{formatFareLabel(ride.fare || ride.baseFare)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>{formatDistanceLabel(ride.estimatedDistanceMeters)}</Text>
            </View>
          </View>

          <View style={styles.detailList}>
            <View style={styles.detailRow}>
              <Clock3 size={13} color={colors.blue[500]} strokeWidth={2.3} style={{ marginTop: 2 }} />
              <Text style={styles.detailText}>{ride.user?.name || 'Customer'}{ride.user?.phone ? ` • ${ride.user.phone}` : ''}</Text>
            </View>
            <View style={styles.detailRow}>
              <MapPin size={13} color={colors.emerald[500]} strokeWidth={2.3} style={{ marginTop: 2 }} />
              <Text numberOfLines={1} style={styles.detailText}>{ride.pickupAddress || 'Pickup point'}</Text>
            </View>
            <View style={styles.detailRow}>
              <MapPin size={13} color={colors.orange[500]} strokeWidth={2.3} style={{ marginTop: 2 }} />
              <Text numberOfLines={1} style={styles.detailText}>{ride.dropAddress || 'Drop point'}</Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );

  const renderError = (message) => (
    <View style={styles.stateBox}>
      <View style={[styles.stateIcon, { width: 64, height: 64 }]}>
        <AlertCircle size={28} color={colors.red[400]} strokeWidth={2} />
      </View>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={() => loadAllData(1)} style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed95]}>
        <RefreshCw size={13} strokeWidth={2.5} color={colors.white} />
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );

  const listHeader = (
    <View style={styles.listTop}>
      <View style={styles.tabs}>
        {[
          { id: 'alerts', label: 'Alerts', count: alertItems.length },
          { id: 'schedule', label: 'Schedule', count: scheduledRides.length },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const tint = isActive ? colors.white : colors.slate[500];

          return (
            <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tab, isActive && styles.tabActive]}>
              {tab.id === 'schedule' ? <CalendarClock size={14} strokeWidth={2.4} color={tint} /> : <Radio size={14} strokeWidth={2.4} color={tint} />}
              <Text style={[styles.tabText, { color: tint }]}>{tab.label}</Text>
              <View style={[styles.tabCount, { backgroundColor: isActive ? alpha(colors.white, 0.15) : colors.slate[100] }]}>
                <Text style={[styles.tabCountText, { color: tint }]}>{tab.count}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>{activeTab === 'schedule' ? 'Scheduled Rides' : 'Admin & System Alerts'}</Text>
        <Text style={styles.sectionCount}>{totalCount} visible</Text>
      </View>

      {activeTab === 'alerts' && loading ? [0, 1, 2, 3].map((index) => <SkeletonCard key={index} />) : null}
      {activeTab === 'schedule' && scheduledLoading ? [0, 1, 2].map((index) => <SkeletonCard key={index} />) : null}

      {activeTab === 'alerts' && error && !loading ? renderError(error) : null}
      {activeTab === 'schedule' && scheduledError && !scheduledLoading ? renderError(scheduledError) : null}

      {activeTab === 'alerts' && !loading && !error && alertItems.length === 0 ? (
        <View style={styles.stateBox}>
          <View style={[styles.stateIcon, { width: 80, height: 80 }]}>
            <Bell size={36} color={colors.slate[300]} strokeWidth={1.5} />
          </View>
          <View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>Admin and payment notifications will appear here automatically</Text>
          </View>
        </View>
      ) : null}

      {activeTab === 'schedule' && !scheduledLoading && !scheduledError && scheduledRides.length === 0 ? (
        <View style={styles.stateBox}>
          <View style={[styles.stateIcon, { width: 80, height: 80 }]}>
            <CalendarClock size={34} color={colors.slate[300]} strokeWidth={1.7} />
          </View>
          <View>
            <Text style={styles.emptyTitle}>No scheduled rides yet</Text>
            <Text style={styles.emptyText}>Scheduled bookings tied to this driver will show here with pickup, drop, rider info, and time.</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  const showPager = (activeTab === 'alerts' && alertItems.length > 0) || (activeTab === 'schedule' && scheduledRides.length > 0);
  const prevDisabled = currentPage === 1 || anyLoading;
  const nextDisabled = !(activeTab === 'alerts' ? hasMoreAlerts : hasMoreSchedule) || anyLoading;
  const listFooter = showPager ? (
    <View style={styles.pager}>
      <Pressable
        disabled={prevDisabled}
        onPress={() => loadAllData(currentPage - 1)}
        style={({ pressed }) => [styles.pagerBtn, prevDisabled && styles.pagerDisabled, pressed && styles.pressed95]}
      >
        <ArrowLeft size={14} strokeWidth={2.5} color={colors.slate[600]} />
        <Text style={styles.pagerText}>Prev</Text>
      </Pressable>
      <Text style={styles.pagerLabel}>Page {currentPage}</Text>
      <Pressable
        disabled={nextDisabled}
        onPress={() => loadAllData(currentPage + 1)}
        style={({ pressed }) => [styles.pagerBtn, nextDisabled && styles.pagerDisabled, pressed && styles.pressed95]}
      >
        <Text style={styles.pagerText}>Next</Text>
        <ChevronRight size={14} strokeWidth={2.5} color={colors.slate[600]} />
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#F8FAFC', '#F3F4F6', '#EEF2F7']} locations={[0, 0.38, 1]} style={StyleSheet.absoluteFill} />
      <GlowBlob id="nGlowA" size={176} color={colors.blue[100]} opacity={0.6} style={{ top: -64 - 53, right: -40 - 53 }} />
      <GlowBlob id="nGlowB" size={208} color={colors.slate[100]} opacity={0.7} style={{ top: 208 - 62, left: -60 - 62 }} />

      <IncomingRideRequest
        visible={Boolean(selectedScheduledRide)}
        requestData={selectedScheduledRide}
        mode="preview"
        onClose={() => setSelectedScheduledRide(null)}
        onDecline={() => setSelectedScheduledRide(null)}
      />

      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/${routePrefix === '/taxi/owner' ? 'dashboard' : 'home'}`)}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, pressed && styles.pressed95]}
          >
            <ArrowLeft size={18} color={colors.slate[900]} strokeWidth={2.5} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={styles.kicker}>Inbox</Text>
            <Text style={styles.headerTitle}>Notifications</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{totalCount}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => loadAllData(currentPage)}
            disabled={anyLoading}
            style={({ pressed }) => [styles.pillBtn, styles.refreshBtn, anyLoading && styles.disabled50, pressed && styles.pressed95]}
          >
            {anyLoading ? (
              <Spin>
                <RefreshCw size={12} strokeWidth={2.5} color={colors.slate[600]} />
              </Spin>
            ) : (
              <RefreshCw size={12} strokeWidth={2.5} color={colors.slate[600]} />
            )}
            <Text style={[styles.pillText, { color: colors.slate[600] }]}>Refresh</Text>
          </Pressable>
          {activeTab === 'alerts' ? (
            <Pressable
              onPress={handleClearAll}
              disabled={clearing || loading || alertItems.length === 0}
              style={({ pressed }) => [
                styles.pillBtn,
                styles.clearBtn,
                (clearing || loading || alertItems.length === 0) && styles.disabled50,
                pressed && styles.pressed95,
              ]}
            >
              <Trash2 size={12} strokeWidth={2.5} color={colors.rose[500]} />
              <Text style={[styles.pillText, { color: colors.rose[500] }]}>Clear All</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        style={styles.flex1}
        data={listData}
        keyExtractor={(item, index) => String(activeTab === 'alerts' ? item.id || item._id || index : item.rideId || index)}
        renderItem={({ item }) => (activeTab === 'alerts' ? renderAlert(item) : renderScheduled(item))}
        ItemSeparatorComponent={ItemGap}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={[styles.listContent, { paddingBottom: 48 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const ItemGap = () => <View style={{ height: 10 }} />;

export default DriverNotifications;

const CARD_SHADOW = {
  elevation: 3,
  shadowColor: '#0f172a',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
};

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  flex1: { flex: 1 },
  header: {
    zIndex: 20,
    backgroundColor: alpha(colors.white, 0.9),
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.white, 0.8),
    elevation: 3,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    backgroundColor: alpha(colors.white, 0.9),
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  pressed95: { transform: [{ scale: 0.95 }] },
  pressed99: { transform: [{ scale: 0.99 }] },
  headerTitles: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.34, color: colors.slate[400] },
  headerTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.48, color: colors.slate[900] },
  countBadge: { backgroundColor: colors.slate[900], paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, ...shadow.sm },
  countBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: colors.white },
  headerActions: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  pillBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  refreshBtn: { borderColor: colors.slate[200], backgroundColor: colors.white },
  clearBtn: { borderColor: colors.rose[100], backgroundColor: colors.rose[50] },
  pillText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  disabled50: { opacity: 0.5 },
  listContent: { width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16 },
  listTop: { gap: 10, marginBottom: 10 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    backgroundColor: alpha(colors.white, 0.7),
    padding: 4,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 12 },
  // bg-slate-900 button: the partner button colour (Taxi blue, white text)
  tabActive: {
    backgroundColor: driverTheme.button,
    elevation: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  tabText: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.76 },
  tabCount: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tabCountText: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.44 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.6, color: colors.slate[400] },
  sectionCount: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.8, color: colors.slate[400] },
  skeletonCard: {
    borderRadius: 20,
    backgroundColor: alpha(colors.white, 0.7),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  skeletonLines: { flex: 1, gap: 8 },
  stateBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 16 },
  stateIcon: {
    backgroundColor: alpha(colors.white, 0.8),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[700], textAlign: 'center' },
  // bg-slate-900 button: the partner button colour (Taxi blue, white text)
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: driverTheme.button, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  retryText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.white },
  emptyTitle: { fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.slate[700], textAlign: 'center' },
  emptyText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400], marginTop: 4, textAlign: 'center' },
  alertCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    backgroundColor: colors.white,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...CARD_SHADOW,
  },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, minWidth: 0 },
  alertHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  alertTitle: { flexShrink: 1, fontSize: 13, lineHeight: 16, fontWeight: '900', color: colors.slate[900] },
  alertMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertTime: { fontSize: 9, lineHeight: 13, fontWeight: '700', color: colors.slate[400], marginTop: 2 },
  removeBtn: { padding: 6 },
  alertText: { fontSize: 11, lineHeight: 18, fontWeight: '700', color: colors.slate[500], marginTop: 4 },
  imageWrap: { marginTop: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.slate[50], ...shadow.sm },
  alertLocation: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9, color: colors.slate[300], marginTop: 8 },
  scheduleCard: { width: '100%', borderRadius: 20, borderWidth: 1, borderColor: alpha(colors.white, 0.8), backgroundColor: colors.white, padding: 16, ...CARD_SHADOW },
  scheduleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  scheduleHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  scheduleTitles: { flexShrink: 1, minWidth: 0 },
  scheduleWhen: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.8, color: colors.blue[500] },
  scheduleCountdown: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '900', color: colors.emerald[600] },
  statRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 8 },
  statLabel: { fontSize: 8, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: colors.slate[400] },
  statValue: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '900', color: colors.slate[900] },
  detailList: { marginTop: 12, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { flex: 1, fontSize: 11, lineHeight: 18, fontWeight: '700', color: colors.slate[600] },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 24, paddingHorizontal: 4 },
  pagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    ...shadow.sm,
  },
  pagerDisabled: { opacity: 0.4 },
  pagerText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.slate[600] },
  pagerLabel: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[400] },
});
