// Web: modules/Taxi/modules/user/pages/Activity.jsx — the Rides tab: header, tab pills, the active-trip card and the
// trip / booking list (4 per page). APIs: GET /rides (limit 60 / category), userBusService.getMyBookings
// (GET /users/bus-bookings ...). The "All" list is prefetched (prefetchActivityAll) and kept in memory per customer.
// Colours of the active-trip card follow index.css's .user-app-theme remaps (see UserThemeContext).
import { useBottomNavSpace } from '@/native/ui/useBottomNavSpace';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ChevronRight, MapPin, ShieldCheck, User } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { useUserTheme, useUserPalette, USER_SHADOW } from '../../../shared/context/UserThemeContext';

import ActivityHeader from '../components/activity/ActivityHeader';
import ActivityTabs from '../components/activity/ActivityTabs';
import ActivityCard from '../components/activity/ActivityCard';
import ActivityPager from '../components/activity/ActivityPager';
import { ActivityEmptyState, ActivityErrorState, ActivityLoadingState, ActivitySupportState } from '../components/activity/ActivityStates';
import api from '../../../shared/api/axiosInstance';
import { toHistorySafeState } from '../../../shared/utils/historyState';
import userBusService from '../services/busService';
import { normalizeBusBooking, normalizeRide, PAGE_SIZE, TABS } from '../components/activity/activityHelpers';

import taxiFallback from '../../../assets/user-app/taxi.png';
import bikeFallback from '../../../assets/user-app/bike.png';
import parcelFallback from '../../../assets/user-app/parcel.png';
import busFallback from '../../../assets/user-app/bus.png';

import { CURRENT_RIDE_UPDATED_EVENT, getCurrentRide, isActiveCurrentRide } from '../services/currentRideService';

const getCurrentRideIcon = (ride) => {
  const customIcon = String(ride?.vehicleIconUrl || ride?.vehicle?.vehicleIconUrl || ride?.vehicle?.icon || ride?.driver?.vehicleIconUrl || '').trim();

  if (customIcon && !customIcon.includes('localhost') && !customIcon.startsWith('/')) {
    return customIcon;
  }

  const serviceType = String(ride?.serviceType || ride?.type || '').toLowerCase();
  const iconType = String(ride?.vehicleIconType || ride?.driver?.vehicleIconType || ride?.driver?.vehicleType || '').toLowerCase();

  if (serviceType === 'parcel' || serviceType === 'delivery') {
    return parcelFallback;
  }
  if (iconType.includes('bike')) {
    return bikeFallback;
  }
  if (iconType.includes('auto')) {
    return taxiFallback;
  }
  if (serviceType === 'bus') {
    return busFallback;
  }
  return taxiFallback;
};

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Scheduled time pending';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Scheduled time pending';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScheduledCountdownLabel = (value, now = Date.now()) => {
  const parsed = value ? new Date(value) : null;
  const time = parsed?.getTime?.() || NaN;

  if (!Number.isFinite(time)) {
    return '';
  }

  const diffMs = time - now;
  if (diffMs <= 0) {
    return 'Pickup window is opening now';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `Starts in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `Starts in ${hours}h ${minutes}m`;
  }

  return `Starts in ${minutes}m`;
};

const AGGREGATE_FETCH_LIMIT = 60;

// The "All" list (rides + bus, newest first) is fetched ahead of time and kept here, so opening Rides shows the list
// straight away and only refreshes it in the background. Kept per signed-in customer; memory only.
let allActivitiesCache = null; // { owner, merged }
let allActivitiesInflight = null;

const activityOwner = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user_user') || localStorage.getItem('userInfo') || 'null');
    return String(user?._id || user?.id || 'anon');
  } catch {
    return 'anon';
  }
};

const readAllActivitiesCache = () => (allActivitiesCache && allActivitiesCache.owner === activityOwner() ? allActivitiesCache.merged : null);

const getPayload = (response) => response?.data?.data || response?.data || response || {};

const sortLatestFirst = (items = []) => [...items].sort((left, right) => Number(right.sortTimestamp || 0) - Number(left.sortTimestamp || 0));

const fetchAllActivities = async () => {
  const [ridesResult, busResult] = await Promise.allSettled([
    api.get('/rides', { params: { limit: AGGREGATE_FETCH_LIMIT, page: 1 } }),
    userBusService.getMyBookings({ page: 1, limit: AGGREGATE_FETCH_LIMIT }),
  ]);

  const ridePayload = ridesResult.status === 'fulfilled' ? getPayload(ridesResult.value) : {};
  const busPayload = busResult.status === 'fulfilled' ? getPayload(busResult.value) : {};
  const rides = Array.isArray(ridePayload?.results) ? ridePayload.results : [];
  const bookings = Array.isArray(busPayload?.results) ? busPayload.results : [];

  const merged = sortLatestFirst([...rides.map(normalizeRide).filter((item) => item.id), ...bookings.map(normalizeBusBooking).filter((item) => item.id)]);
  allActivitiesCache = { owner: activityOwner(), merged };
  return merged;
};

/** Start fetching the "All" list now (no-op while a request is already running). Never rejects. */
export const prefetchActivityAll = () => {
  if (!localStorage.getItem('userToken') && !localStorage.getItem('user_accessToken')) return Promise.resolve(null);
  if (!allActivitiesInflight) {
    allActivitiesInflight = fetchAllActivities().finally(() => {
      allActivitiesInflight = null;
    });
  }
  return allActivitiesInflight.catch(() => null);
};

const buildLocalPagination = (items, page) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;

  return {
    results: items.slice(startIndex, startIndex + PAGE_SIZE),
    pagination: {
      page: safePage,
      limit: PAGE_SIZE,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
};

const getRideCategoryForTab = (tab) => {
  if (tab === 'Rides') return 'rides';
  if (tab === 'Parcels') return 'parcels';
  if (tab === 'Outstation') return 'outstation';
  if (tab === 'Scheduled') return 'scheduled';
  return '';
};

const getHelperText = (tab) => {
  if (tab === 'Support') return 'Tickets and help requests';
  if (tab === 'Bus') return 'Your bus tickets, travel timings, and operator details';
  if (tab === 'Outstation') return 'Long-distance trips and outstation deliveries';
  if (tab === 'Scheduled') return 'Bookings reserved for a later pickup time';
  return 'Your recent trips, deliveries, and bookings';
};

const EMPTY_PAGINATION = { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false };

const PulseDot = ({ color }) => {
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
  return <Animated.View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: color, opacity: v }} />;
};

const Activity = () => {
  const bottomNavSpace = useBottomNavSpace();
  const [activeTab, setActiveTab] = useState('All');
  // the cached "All" list (see prefetchActivityAll) is used for the first paint when there is one
  const [firstPage] = useState(() => {
    const merged = readAllActivitiesCache();
    return merged ? buildLocalPagination(merged, 1) : null;
  });
  const [activities, setActivities] = useState(() => firstPage?.results || []);
  const [loading, setLoading] = useState(() => !firstPage);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState(() => firstPage?.pagination || EMPTY_PAGINATION);
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const scrollRef = useRef(null);

  const [currentRide, setCurrentRide] = useState(() => {
    const ride = getCurrentRide();
    return isActiveCurrentRide(ride) ? ride : null;
  });
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const refreshCurrentRide = () => {
      const ride = getCurrentRide();
      setCurrentRide(isActiveCurrentRide(ride) ? ride : null);
    };

    refreshCurrentRide();
    window.addEventListener('storage', refreshCurrentRide);
    window.addEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);

    return () => {
      window.removeEventListener('storage', refreshCurrentRide);
      window.removeEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);
    };
  }, []);

  const shouldTickClock = Number.isFinite(currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN);

  useEffect(() => {
    if (!shouldTickClock) {
      return undefined;
    }

    const timer = setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [shouldTickClock]);

  const driverName = currentRide?.driver?.name || 'Captain';
  const serviceType = String(currentRide?.serviceType || currentRide?.type || 'ride').toLowerCase();
  const vehicleLabel = currentRide?.driver?.vehicle || currentRide?.driver?.vehicleType || (serviceType === 'parcel' ? 'Parcel' : 'Taxi');
  const currentRideIcon = getCurrentRideIcon(currentRide);
  const trackingPath = serviceType === 'parcel' ? `${routePrefix}/parcel/tracking` : `${routePrefix}/ride/tracking`;
  const rideStage = String(currentRide?.liveStatus || currentRide?.status || 'accepted').toLowerCase();
  const hasAssignedDriver = Boolean(currentRide?.driver?._id || currentRide?.driver?.id || currentRide?.driver?.name);
  const scheduledTimestamp = currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN;
  const isScheduledRide = Number.isFinite(scheduledTimestamp);
  const isScheduledUpcoming = isScheduledRide && scheduledTimestamp > clockNow;
  const isScheduledAcceptedRide =
    ['ride', 'intercity'].includes(serviceType) && isScheduledUpcoming && hasAssignedDriver && ['accepted', 'arriving'].includes(rideStage);
  const rideStageLabel =
    rideStage === 'started'
      ? serviceType === 'parcel'
        ? 'Parcel in transit'
        : 'Ride in progress'
      : rideStage === 'arrived'
        ? serviceType === 'parcel'
          ? 'Parcel reached destination'
          : `${driverName} reached destination`
        : rideStage === 'arriving'
          ? serviceType === 'parcel'
            ? `${driverName} reached sender`
            : `${driverName} has arrived`
          : serviceType === 'parcel'
            ? 'Parcel booked'
            : 'Ride booked';
  const rideStageContextLabel = isScheduledAcceptedRide ? 'Driver assigned for your scheduled trip' : rideStageLabel;
  const scheduledDateLabel = formatScheduledDateTime(currentRide?.scheduledAt);
  const scheduledCountdown = getScheduledCountdownLabel(currentRide?.scheduledAt, clockNow);

  // force = skip the remembered "All" list and show the skeleton (pull to refresh).
  const loadActivities = useCallback(async ({ force = false, isActive = () => true } = {}) => {
    // Rides "All" with a remembered list: show it at once and just refresh it in the background.
    const remembered = !force && activeTab === 'All' ? readAllActivitiesCache() : null;
    if (remembered) {
      const rememberedPage = buildLocalPagination(remembered, currentPage);
      setActivities(rememberedPage.results);
      setPagination(rememberedPage.pagination);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      if (activeTab === 'Support') {
        if (!isActive()) return;
        setActivities([]);
        setPagination(EMPTY_PAGINATION);
        return;
      }

      let nextActivities = [];
      let nextPagination = null;

      if (activeTab === 'Bus') {
        const response = await userBusService.getMyBookings({
          page: currentPage,
          limit: PAGE_SIZE,
        });
        const payload = getPayload(response);
        const bookings = Array.isArray(payload?.results) ? payload.results : [];
        nextActivities = bookings.map(normalizeBusBooking).filter((item) => item.id);
        nextPagination = payload?.pagination || null;
      } else if (activeTab === 'All') {
        // a fetch that is already running (started by prefetchActivityAll) is joined instead of repeated
        const merged = await (allActivitiesInflight ||
          (allActivitiesInflight = fetchAllActivities().finally(() => {
            allActivitiesInflight = null;
          })));
        if (!merged) throw new Error('Could not load your ride history.');
        const localPage = buildLocalPagination(merged, currentPage);
        nextActivities = localPage.results;
        nextPagination = localPage.pagination;
      } else if (activeTab === 'Rides') {
        const ridesResponse = await api.get('/rides', {
          params: {
            limit: AGGREGATE_FETCH_LIMIT,
            page: 1,
            category: 'rides',
          },
        });

        const ridePayload = getPayload(ridesResponse);
        const rides = Array.isArray(ridePayload?.results) ? ridePayload.results : [];

        const merged = sortLatestFirst(rides.map(normalizeRide).filter((item) => item.id));
        const localPage = buildLocalPagination(merged, currentPage);
        nextActivities = localPage.results;
        nextPagination = localPage.pagination;
      } else {
        const response = await api.get('/rides', {
          params: {
            limit: PAGE_SIZE,
            page: currentPage,
            category: getRideCategoryForTab(activeTab),
          },
        });
        const payload = getPayload(response);
        const rides = Array.isArray(payload?.results) ? payload.results : [];

        nextActivities = rides.map(normalizeRide).filter((ride) => ride.id);
        nextPagination = payload?.pagination || null;
      }

      if (!isActive()) {
        return;
      }

      setActivities(nextActivities);
      setPagination(
        nextPagination || {
          page: currentPage,
          limit: PAGE_SIZE,
          total: nextActivities.length,
          totalPages: Math.max(1, Math.ceil(nextActivities.length / PAGE_SIZE)),
          hasNextPage: false,
          hasPrevPage: currentPage > 1,
        },
      );
    } catch (loadError) {
      if (!isActive()) {
        return;
      }

      setError(loadError?.message || 'Could not load your ride history.');
      setActivities([]);
      setPagination(EMPTY_PAGINATION);
    } finally {
      if (isActive()) {
        setLoading(false);
      }
    }
  }, [activeTab, currentPage]);

  useEffect(() => {
    let active = true;
    loadActivities({ isActive: () => active });
    return () => {
      active = false;
    };
  }, [loadActivities, reloadKey]);

  // Pull to refresh: the list goes back to its skeleton while it reloads.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoading(true);
    const ride = getCurrentRide();
    setCurrentRide(isActiveCurrentRide(ride) ? ride : null);
    try {
      await loadActivities({ force: true });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadActivities]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const handleItemClick = (item) => {
    if (item.type === 'bus') {
      navigate(`${routePrefix}/profile/bus-bookings/${item.id}`);
    } else if (item.type === 'parcel') {
      navigate(`${routePrefix}/parcel/detail/${item.id}`);
    } else {
      navigate(`${routePrefix}/ride/detail/${item.id}`, {
        state: toHistorySafeState({ ride: item.ride }),
      });
    }
  };
  const helperText = useMemo(() => getHelperText(activeTab), [activeTab]);

  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';

  return (
    <View style={[styles.page, { backgroundColor: p.bg }]}>
      <StatusBarSpacer color={p.cardBg} />
      <ScrollView
        ref={scrollRef}
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: bottomNavSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[p.accent]} />}
      >
        <ActivityHeader helperText={helperText} onBack={() => navigate(-1)} />
        <ActivityTabs tabs={TABS} activeTab={activeTab} onSelect={setActiveTab} />

        <View style={styles.body}>
          {/* Dynamic Active Ride Card */}
          {currentRide && (
            <View style={{ marginBottom: 16 }}>
              <Pressable
                onPress={() => navigate(trackingPath, { state: currentRide })}
                style={[styles.rideCard, { backgroundColor: p.cardBg, borderColor: p.border }, p.cardShadow]}
              >
                <View style={styles.rowBetween}>
                  <View style={[styles.pill, { backgroundColor: isDark ? alpha(colors.yellow[400], 0.1) : p.cardSoft }]}>
                    <ShieldCheck size={11} strokeWidth={3} color={isDark ? p.accent : colors.emerald[700]} />
                    <Text style={[styles.caps, { letterSpacing: 1.3, color: isDark ? p.accent : colors.emerald[700] }]}>Active Trip</Text>
                  </View>
                  <View style={styles.liveRow}>
                    <PulseDot color={isDark ? p.accent : colors.emerald[500]} />
                    <Text style={[styles.caps, { letterSpacing: 1.5, color: isDark ? p.accent : colors.emerald[600] }]}>Live Status</Text>
                  </View>
                </View>

                <View style={[styles.rowBetween, { marginTop: 16, alignItems: 'flex-end' }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.stage, { color: p.textPrimary }]}>{rideStageContextLabel}</Text>
                    <Text style={[styles.stageSub, { color: p.textPrimary }]}>{isScheduledAcceptedRide ? scheduledDateLabel : 'Active Booking'}</Text>
                  </View>
                  <View style={{ marginBottom: 4 }}>
                    <View style={[styles.iconBox, { backgroundColor: isDark ? p.cardBg : p.cardSoft, borderColor: p.border }, USER_SHADOW]}>
                      <AppImage src={currentRideIcon} contentFit="contain" style={{ height: 32, width: 32 }} />
                    </View>
                  </View>
                </View>

                <View style={[styles.addrRow, { marginTop: 16 }]}>
                  <MapPin size={12} color={isDark ? p.accent : colors.emerald[500]} strokeWidth={2.5} />
                  <Text numberOfLines={1} style={[styles.addr, { color: p.textPrimary }]}>
                    {currentRide.pickup || 'Pickup location'}
                  </Text>
                </View>
                <View style={[styles.addrRow, { marginTop: 4 }]}>
                  {/* text-orange-500 is remapped to the accent colour */}
                  <MapPin size={12} color={p.accent} strokeWidth={2.5} />
                  <Text numberOfLines={1} style={[styles.addr, { color: p.textPrimary }]}>
                    {currentRide.drop || 'Drop location'}
                  </Text>
                </View>

                {isScheduledAcceptedRide ? (
                  <View style={styles.chipsRow}>
                    <View style={[styles.chip, { backgroundColor: isDark ? p.cardBg : colors.sky[50] }]}>
                      <User size={11} color={isDark ? p.textSecondary : colors.sky[700]} />
                      <Text style={[styles.chipText, { color: isDark ? p.textSecondary : colors.sky[700] }]}>{driverName}</Text>
                    </View>
                    {scheduledCountdown ? (
                      <View style={[styles.chip, { backgroundColor: isDark ? p.cardBg : p.cardSoft }]}>
                        <Text style={[styles.chipText, { color: p.textSecondary }]}>{scheduledCountdown}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={[styles.driverRow, { backgroundColor: isDark ? p.cardSoft : p.cardBg, borderColor: p.border }]}>
                  <View style={styles.driverLeft}>
                    <View
                      style={[
                        styles.avatar,
                        isDark ? { backgroundColor: p.cardBg, borderColor: p.border } : { backgroundColor: p.cardSoft, borderColor: colors.emerald[100] },
                      ]}
                    >
                      <User size={16} color={isDark ? p.accent : colors.emerald[600]} />
                    </View>
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <Text style={[styles.metaCaps, { color: p.textPrimary }]}>Driver & Vehicle</Text>
                      <Text numberOfLines={1} style={[styles.metaValue, { color: p.textPrimary }]}>
                        {driverName} • {vehicleLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.fareRow}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.metaCaps, { color: p.textPrimary }]}>Fare</Text>
                      <Text style={[styles.metaValue, { color: p.textPrimary }]}>₹{Number(currentRide?.fare || 0).toFixed(0)}</Text>
                    </View>
                    <View style={[styles.chevronBox, { backgroundColor: isDark ? p.accent : p.cardBg }, USER_SHADOW]}>
                      <ChevronRight size={16} strokeWidth={3} color={isDark ? '#0b1220' : p.textPrimary} />
                    </View>
                  </View>
                </View>
              </Pressable>
            </View>
          )}

          {activeTab === 'Support' ? (
            <ActivitySupportState onContact={() => navigate('/taxi/user/support')} />
          ) : loading ? (
            <ActivityLoadingState />
          ) : error ? (
            <ActivityErrorState error={error} onRetry={() => setReloadKey((current) => current + 1)} />
          ) : activities.length === 0 ? (
            <ActivityEmptyState activeTab={activeTab} />
          ) : (
            <View style={styles.list}>
              {activities.map((activity) => (
                <View key={activity.id}>
                  <ActivityCard {...activity} onPress={() => handleItemClick(activity)} />
                </View>
              ))}
              <ActivityPager
                pagination={pagination}
                onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                onNext={() => setCurrentPage((page) => Math.min(pagination.totalPages, page + 1))}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 112 },
  body: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  rideCard: { width: '100%', overflow: 'hidden', borderRadius: 22, padding: 20, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  caps: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stage: { fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.47 },
  stageSub: { marginTop: 4, fontSize: 12, fontWeight: '500', opacity: 0.7 },
  iconBox: { height: 48, width: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, opacity: 0.75 },
  addr: { flex: 1, fontSize: 11, fontWeight: '500' },
  chipsRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 10, fontWeight: '500' },
  driverRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 12, borderWidth: 1 },
  driverLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
  avatar: { height: 32, width: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metaCaps: { fontSize: 10.5, lineHeight: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.5 },
  metaValue: { marginTop: 2, fontSize: 12.5, fontWeight: '600' },
  fareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chevronBox: { height: 28, width: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 12, paddingBottom: 8 },
});

export default Activity;
