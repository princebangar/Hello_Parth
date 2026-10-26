// Web: modules/Taxi/modules/driver/pages/RideRequests.jsx — "Trip History": type tabs (All / Rides / Deliveries, + Bus
// for an owner), status filter, completion rate / total earned / trips on record, and the activity log.
// API: GET /drivers/rides/history (getDriverRideHistory { limit: 100 }); owner also getOwnerBusBookings().
// Native: on /taxi/driver/history a kept-alive bottom-bar tab (driverTabPages.js), on /taxi/owner/history an ordinary
// page. The web loaded the history on mount (every visit); here it is loaded again each time the tab becomes active,
// keeping the old list on screen. Pull-to-refresh reloads it; the error's Retry (web: page reload) loads it again.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  Bus,
  Car,
  Calendar,
  Clock,
  Filter,
  IndianRupee,
  Loader2,
  MapPin,
  Package,
  TrendingUp,
  User,
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { getDriverRideHistory, getOwnerBusBookings, readDriverCache, writeDriverCache } from '../services/registrationService';
import { useDriverTabActive } from '../driverTabPages';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'ride', label: 'Rides' },
  { id: 'parcel', label: 'Deliveries' },
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All statuses' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'active', label: 'Active / Pending' },
];

const unwrap = (response) => response?.data?.results || response?.results || response?.data?.data?.results || [];

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const formatDateLabel = (value) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatShortDate = (value) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const formatStatus = (status) => {
  const normalized = String(status || 'searching').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getRideTimeSource = (ride) => ride.completedAt || ride.startedAt || ride.acceptedAt || ride.createdAt || ride.updatedAt;

const buildLocationLabel = (address, point, fallback) => {
  if (address) {
    return address;
  }

  const [lng, lat] = point?.coordinates || [];
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }

  return fallback;
};

const getDriverEarnings = (ride) => {
  const storedEarnings = Number(ride?.driverEarnings);
  if (Number.isFinite(storedEarnings) && storedEarnings > 0) {
    return storedEarnings;
  }

  const fare = Number(ride?.fare || 0);
  const commission = Number(ride?.commissionAmount || 0);
  if (commission > 0) {
    return Math.max(fare - commission, 0);
  }

  return fare;
};

const normalizePaymentLabel = (ride = {}) => {
  const rawValue = ride?.paymentMethod
    || ride?.payment_method
    || ride?.paymentType
    || ride?.payment_type
    || '';
  const normalized = String(rawValue || '').trim().toLowerCase();

  if (!normalized) {
    const collectionStatus = String(ride?.driverPaymentCollection?.status || '').trim().toLowerCase();
    const providerMode = String(ride?.driverPaymentCollection?.providerMode || '').trim().toLowerCase();

    if (
      ['paid', 'captured', 'completed'].includes(collectionStatus)
      && (providerMode.includes('upi') || providerMode.includes('card') || providerMode.includes('qr') || providerMode.includes('online'))
    ) {
      return 'ONLINE';
    }

    return 'CASH';
  }

  if (normalized.includes('online') || normalized.includes('upi') || normalized.includes('card') || normalized.includes('qr')) {
    return 'ONLINE';
  }

  if (normalized === 'cash') {
    return 'CASH';
  }

  return normalized.toUpperCase();
};

const normalizeRide = (ride) => {
  const type = String(ride?.serviceType || ride?.type || 'ride').toLowerCase() === 'parcel' ? 'parcel' : 'ride';
  const status = formatStatus(ride?.status || ride?.liveStatus);
  const timeSource = getRideTimeSource(ride);
  const passengerName = ride?.user?.name || 'Passenger';
  // A cancelled trip earned nothing (the old fallback showed the full fare).
  const earnings = status === 'Cancelled' ? 0 : getDriverEarnings(ride);

  // An owner reads the history of the whole fleet: which driver drove it, in which vehicle, and what the admin kept.
  const fleetDriver = ride?.driver && typeof ride.driver === 'object' ? ride.driver : null;
  const fleetVehicle = fleetDriver
    ? [[fleetDriver.vehicleMake, fleetDriver.vehicleModel].filter(Boolean).join(' '), fleetDriver.vehicleNumber].filter(Boolean).join(' - ')
    : '';
  const commission = Number(ride?.commissionAmount || 0);

  return {
    id: ride?.rideId || ride?._id || '',
    type,
    driverName: fleetDriver?.name || '',
    driverVehicle: fleetVehicle,
    commissionLabel: commission > 0 && status !== 'Cancelled' ? formatCurrency(commission) : '',
    title: type === 'parcel' ? 'Delivery job' : 'Ride trip',
    subtitle: `Customer: ${passengerName}`,
    dateLabel: formatDateLabel(timeSource),
    shortDate: formatShortDate(timeSource),
    earnings,
    earningsLabel: formatCurrency(earnings),
    fareLabel: formatCurrency(ride?.fare || 0),
    pickup: buildLocationLabel(ride?.pickupAddress, ride?.pickupLocation, 'Pickup'),
    drop: buildLocationLabel(ride?.dropAddress, ride?.dropLocation, 'Drop'),
    status,
    paymentMethod: normalizePaymentLabel(ride),
    distanceKm: Number(ride?.estimatedDistanceMeters || 0) / 1000,
  };
};

// A bus ticket sold on the owner's bus: shown in the same history with its route, seats and amount.
const normalizeBusBooking = (booking) => {
  const route = booking?.routeSnapshot || {};
  const status = booking?.status === 'cancelled' ? 'Cancelled' : booking?.status === 'confirmed' ? 'Booked' : formatStatus(booking?.status);
  const paid = ['paid', 'partially_refunded', 'manual_reserved'].includes(String(booking?.payment?.status || '').toLowerCase());
  const seats = (booking?.activeSeats || []).map((seat) => seat.seatLabel || seat.seatId).filter(Boolean).join(', ');
  const timeSource = booking?.travelDate ? `${booking.travelDate}T00:00:00` : booking?.createdAt;
  const amount = status === 'Cancelled' ? 0 : Number(booking?.amount || 0);
  return {
    id: `bus-${booking?.id}`,
    type: 'bus',
    driverName: '',
    driverVehicle: [route.busName, route.coachType].filter(Boolean).join(' - '),
    commissionLabel: '',
    title: 'Bus trip',
    subtitle: `Passenger: ${booking?.passenger?.name || booking?.user?.name || 'Passenger'}${seats ? ` - Seats ${seats}` : ''}`,
    dateLabel: `Travel ${formatShortDate(timeSource)} - ${route.departureTime || ''}`.trim(),
    shortDate: formatShortDate(timeSource),
    earnings: amount,
    earningsLabel: formatCurrency(amount),
    fareLabel: formatCurrency(booking?.amount || 0),
    pickup: route.originCity || 'Origin',
    drop: route.destinationCity || 'Destination',
    status,
    paymentMethod: paid ? 'PAID' : 'UNPAID',
    distanceKm: 0,
    sortTime: new Date(booking?.createdAt || 0).getTime() || 0,
  };
};

const statusBadgeColors = (status) => {
  if (status === 'Completed' || status === 'Delivered' || status === 'Booked') {
    return { bg: colors.emerald[50], fg: colors.emerald[700], border: colors.emerald[100] };
  }

  if (status === 'Cancelled') {
    return { bg: colors.rose[50], fg: colors.rose[700], border: colors.rose[100] };
  }

  return { bg: colors.amber[50], fg: colors.amber[700], border: colors.amber[100] };
};

// Motion.div initial { opacity: 0, y: 8 } -> animate
const FadeInCard = ({ style, children }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim]);
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
};

const RideRequests = () => {
  const tabScrollRef = useRef(null);
  useTabScrollTop(tabScrollRef);
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const tabActive = useDriverTabActive();
  const isOwnerView = useLocation().pathname.startsWith('/taxi/owner');
  const [activeTab, setActiveTab] = useState('all');
  const [busTrips, setBusTrips] = useState([]);
  // The list from the last visit shows at once; the fresh one replaces it.
  const [rides, setRides] = useState(() => (readDriverCache('history') || []).map(normalizeRide).filter((ride) => ride.id));
  const [loading, setLoading] = useState(() => !readDriverCache('history'));
  const [error, setError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    setError('');

    try {
      const response = await getDriverRideHistory({ limit: 100 });
      const results = unwrap(response);

      if (!activeRef.current) {
        return;
      }

      writeDriverCache('history', results);
      setRides(results.map(normalizeRide).filter((ride) => ride.id));

      if (isOwnerView) {
        try {
          const busResponse = await getOwnerBusBookings();
          const list = busResponse?.data?.data?.bookings || busResponse?.data?.bookings || busResponse?.data?.data?.results || [];
          if (activeRef.current) setBusTrips((Array.isArray(list) ? list : []).map(normalizeBusBooking).filter((trip) => trip.id));
        } catch {
          if (activeRef.current) setBusTrips([]);
        }
      }
    } catch (loadError) {
      if (!activeRef.current) {
        return;
      }

      setRides([]);
      setError(loadError?.message || 'Could not load driver history.');
    } finally {
      if (activeRef.current) {
        setLoading(false);
      }
    }
  }, [isOwnerView]);

  // web: on mount (every visit) -> here: every time the tab is shown (an ordinary page: once)
  useEffect(() => {
    if (!tabActive) return;
    loadHistory();
  }, [tabActive, loadHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadHistory();
    } finally {
      setRefreshing(false);
    }
  };

  const retry = () => {
    setLoading(true);
    loadHistory();
  };

  const allTrips = useMemo(
    () => (isOwnerView && busTrips.length
      ? [...rides, ...busTrips].sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
      : rides),
    [busTrips, isOwnerView, rides],
  );

  const filteredHistory = useMemo(
    () => {
      const byType = activeTab === 'all' ? allTrips : allTrips.filter((item) => item.type === activeTab);

      if (statusFilter === 'completed') {
        return byType.filter((item) => ['Completed', 'Delivered'].includes(item.status));
      }

      if (statusFilter === 'cancelled') {
        return byType.filter((item) => item.status === 'Cancelled');
      }

      if (statusFilter === 'active') {
        return byType.filter((item) => !['Completed', 'Delivered', 'Cancelled'].includes(item.status));
      }

      return byType;
    },
    [activeTab, allTrips, statusFilter],
  );

  const categoryHistory = useMemo(
    () => (activeTab === 'all' ? allTrips : allTrips.filter((item) => item.type === activeTab)),
    [activeTab, allTrips],
  );

  const stats = useMemo(() => {
    const completedTrips = categoryHistory.filter((item) => ['Completed', 'Delivered', 'Booked'].includes(item.status));
    const totalEarnings = completedTrips.reduce((sum, item) => sum + item.earnings, 0);
    const completionRate = categoryHistory.length ? Math.round((completedTrips.length / categoryHistory.length) * 100) : 0;

    return {
      totalEarnings: formatCurrency(totalEarnings),
      completionRate: `${completionRate}%`,
      totalTrips: categoryHistory.length,
    };
  }, [categoryHistory]);

  const filterOn = isFilterOpen || statusFilter !== 'all';

  const renderTrip = (item) => {
    const badge = statusBadgeColors(item.status);
    const TypeIcon = item.type === 'parcel' ? Package : item.type === 'bus' ? Bus : item.driverName ? Car : Bike;
    return (
      <FadeInCard key={item.id} style={styles.tripCard}>
        <View style={styles.tripHead}>
          <View style={styles.tripHeadLeft}>
            <View style={[styles.typeIcon, { backgroundColor: item.type === 'parcel' ? colors.blue[50] : colors.slate[100] }]}>
              <TypeIcon size={18} strokeWidth={2.5} color={item.type === 'parcel' ? colors.blue[600] : colors.slate[900]} />
            </View>
            <View style={styles.tripTitles}>
              <Text style={styles.tripTitle}>{item.title}</Text>
              <Text style={styles.tripSub}>{item.subtitle}</Text>
              <Text style={styles.tripDate}>{item.dateLabel}</Text>
            </View>
          </View>
          <View style={styles.tripHeadRight}>
            <Text style={styles.earnedLabel}>{item.type === 'bus' ? 'Ticket amount' : isOwnerView ? 'Driver earned' : 'You earned'}</Text>
            <Text style={styles.earnedValue}>{item.earningsLabel}</Text>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
              <Text style={[styles.statusBadgeText, { color: badge.fg }]}>{item.status}</Text>
            </View>
          </View>
        </View>

        {item.driverName || item.driverVehicle ? (
          <View style={styles.fleetBox}>
            {item.driverName ? <Text style={styles.fleetDriver}>{`Driver: ${item.driverName}`}</Text> : null}
            {item.driverVehicle ? <Text style={styles.fleetLine}>{`${item.type === 'bus' ? 'Bus' : 'Vehicle'}: ${item.driverVehicle}`}</Text> : null}
            {item.commissionLabel ? <Text style={styles.fleetLine}>{`Admin commission: ${item.commissionLabel}`}</Text> : null}
          </View>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Trip Date</Text>
            <View style={styles.metaValueRow}>
              <Calendar size={12} color={colors.slate[700]} />
              <Text style={styles.metaValue}>{item.shortDate}</Text>
            </View>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Payment type</Text>
            <View style={styles.metaValueRow}>
              <IndianRupee size={12} color={colors.slate[700]} />
              <Text style={styles.metaValue}>{item.paymentMethod}</Text>
            </View>
          </View>
        </View>

        <View style={styles.stops}>
          <View style={styles.stopRow}>
            <View style={[styles.stopDot, { borderColor: colors.slate[900] }]} />
            <View style={styles.stopBody}>
              <Text style={styles.stopLabel}>Pickup</Text>
              <Text style={styles.stopText}>{item.pickup}</Text>
            </View>
          </View>
          <View style={styles.stopRow}>
            <View style={[styles.stopDot, { borderColor: colors.rose[500] }]} />
            <View style={styles.stopBody}>
              <Text style={styles.stopLabel}>Drop</Text>
              <Text style={styles.stopText}>{item.drop}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footRow}>
          <View style={styles.footLeft}>
            <User size={12} color={colors.slate[500]} />
            <Text style={styles.footText} numberOfLines={1}>{item.subtitle}</Text>
          </View>
          <View style={styles.footRight}>
            {item.type === 'bus' ? null : (
              <View style={styles.footItem}>
                <MapPin size={12} color={colors.slate[500]} />
                <Text style={styles.footText}>{`${item.distanceKm.toFixed(1)} km`}</Text>
              </View>
            )}
            <Text style={styles.footText}>{`Fare ${item.fareLabel}`}</Text>
          </View>
        </View>
      </FadeInCard>
    );
  };

  return (
    <View style={styles.root}>
      {tabActive ? <StatusBar style="dark" /> : null}
      <View style={[styles.header, { paddingTop: insets.top + 8 + 12 }]}>
        <Pressable onPress={() => navigate(-1)} style={styles.headBtn} accessibilityLabel="Back">
          <ArrowLeft size={16} color={colors.slate[900]} />
        </Pressable>
        <Text style={styles.headTitle}>Trip History</Text>
        <Pressable
          onPress={() => setIsFilterOpen((value) => !value)}
          style={[styles.headBtn, { borderColor: filterOn ? colors.slate[900] : colors.slate[100] }]}
          accessibilityLabel={statusFilter !== 'all' ? 'Filter (on)' : 'Filter'}
        >
          <Filter size={16} color={filterOn ? colors.slate[900] : colors.slate[400]} />
          {statusFilter !== 'all' ? <View style={styles.filterDot} /> : null}
        </Pressable>
      </View>

      <ScrollView ref={tabScrollRef}
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.slate[500]]} tintColor={colors.slate[500]} />}
      >
        {isFilterOpen ? (
          <View style={styles.filterPanel}>
            <Text style={styles.filterPanelTitle}>Filter history</Text>
            <View style={styles.filterGrid}>
              {STATUS_FILTERS.map((filter) => {
                const on = statusFilter === filter.id;
                return (
                  <Pressable
                    key={filter.id}
                    onPress={() => {
                      setStatusFilter(filter.id);
                      setIsFilterOpen(false);
                    }}
                    style={[styles.filterOption, { backgroundColor: on ? driverTheme.button : colors.slate[50] }]}
                  >
                    <Text style={[styles.filterOptionText, { color: on ? colors.white : colors.slate[500] }]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {statusFilter !== 'all' && !isFilterOpen ? (
          <Pressable onPress={() => setStatusFilter('all')} style={styles.showingChip}>
            <Text style={styles.showingText}>{`Showing: ${STATUS_FILTERS.find((filter) => filter.id === statusFilter)?.label || statusFilter}`}</Text>
            <Text style={styles.showingX}>✕</Text>
          </Pressable>
        ) : null}

        <View style={styles.tabs}>
          {(isOwnerView ? [...TABS, { id: 'bus', label: 'Bus' }] : TABS).map((tab) => {
            const on = activeTab === tab.id;
            return (
              <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tab, on ? styles.tabOn : null]}>
                <Text style={[styles.tabText, { color: on ? colors.slate[900] : colors.slate[400] }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Completion Rate</Text>
            <View style={styles.statValueRow}>
              <View style={[styles.statIcon, { backgroundColor: colors.emerald[50] }]}>
                <TrendingUp size={14} color={colors.emerald[500]} />
              </View>
              <Text style={styles.statValue}>{stats.completionRate}</Text>
            </View>
          </View>
          <View style={[styles.statCard, styles.statCardDark]}>
            <Text style={[styles.statLabel, { color: alpha(colors.white, 0.4) }]}>Total Earned</Text>
            <View style={styles.statValueRow}>
              <View style={[styles.statIcon, { backgroundColor: alpha(colors.white, 0.1) }]}>
                <IndianRupee size={12} color={colors.white} />
              </View>
              <Text style={[styles.statValue, styles.statValueShrink, { color: colors.white }]}>{stats.totalEarnings}</Text>
            </View>
          </View>
        </View>

        <View style={styles.recordCard}>
          <Text style={styles.recordLabel}>Trips on record</Text>
          <Text style={styles.recordValue}>{stats.totalTrips}</Text>
        </View>

        <View style={styles.log}>
          <Text style={styles.logTitle}>Activity Log</Text>

          {loading ? (
            <View style={styles.stateCard}>
              <Spin>
                <Loader2 size={22} color={colors.slate[500]} />
              </Spin>
              <Text style={[styles.stateText, { color: colors.slate[600] }]}>Loading trip history</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <AlertCircle size={22} color={colors.rose[500]} />
              <Text style={[styles.stateText, { color: colors.slate[700] }]}>{error}</Text>
              <Pressable onPress={retry} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : filteredHistory.length === 0 ? (
            <View style={styles.stateCard}>
              <Clock size={22} color={colors.slate[300]} />
              <Text style={[styles.stateText, { color: colors.slate[600] }]}>No trips found in this filter</Text>
            </View>
          ) : (
            filteredHistory.map(renderTrip)
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const black = { fontWeight: '900' };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fb' },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fb',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  headTitle: { fontSize: 18, lineHeight: 28, ...black, color: colors.slate[900], letterSpacing: -0.45, textTransform: 'uppercase' },
  filterDot: { position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.rose[500], borderWidth: 2, borderColor: colors.white },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  filterPanel: { marginBottom: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 12, ...shadow.sm },
  filterPanelTitle: { paddingHorizontal: 4, paddingBottom: 8, fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 2.2, color: colors.slate[400] },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterOption: { width: '48.5%', flexGrow: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  filterOptionText: { fontSize: 11, lineHeight: 15, ...black, textTransform: 'uppercase', letterSpacing: 0.55, textAlign: 'center' },
  showingChip: {
    marginBottom: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 9999,
    backgroundColor: driverTheme.button,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  showingText: { fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 1, color: colors.white },
  showingX: { fontSize: 10, lineHeight: 14, ...black, color: colors.white },
  tabs: { flexDirection: 'row', backgroundColor: colors.slate[100], padding: 4, borderRadius: 14, marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: colors.white, ...shadow.sm },
  tabText: { fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 1 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[50], ...shadow.sm },
  statCardDark: { backgroundColor: colors.slate[900], borderColor: colors.slate[900], ...shadow.xl },
  statLabel: { fontSize: 9, lineHeight: 9, ...black, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 20, lineHeight: 22, ...black, color: colors.slate[900] },
  statValueShrink: { flexShrink: 1 },
  recordCard: { marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, ...shadow.sm },
  recordLabel: { fontSize: 10, lineHeight: 14, ...black, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 2.2 },
  recordValue: { marginTop: 4, fontSize: 24, lineHeight: 32, ...black, color: colors.slate[900] },
  log: { gap: 12 },
  logTitle: { fontSize: 10, lineHeight: 14, ...black, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 4, marginBottom: 4 },
  stateCard: { backgroundColor: colors.white, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[50], alignItems: 'center', justifyContent: 'center', gap: 12, ...shadow.sm },
  stateText: { fontSize: 13, lineHeight: 18, ...black, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: driverTheme.button },
  retryText: { fontSize: 11, lineHeight: 15, ...black, color: colors.white, textTransform: 'uppercase', letterSpacing: 1.1 },
  tripCard: { backgroundColor: colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[50], gap: 16, ...shadow.sm },
  tripHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tripHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  typeIcon: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tripTitles: { gap: 2, flexShrink: 1 },
  tripTitle: { fontSize: 14, lineHeight: 14, ...black, color: colors.slate[900], textTransform: 'uppercase', letterSpacing: -0.35 },
  tripSub: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[500] },
  tripDate: { fontSize: 9, lineHeight: 13, fontWeight: '700', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.9 },
  tripHeadRight: { alignItems: 'flex-end' },
  earnedLabel: { fontSize: 8, lineHeight: 12, ...black, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  earnedValue: { fontSize: 16, lineHeight: 16, ...black, color: colors.slate[900] },
  statusBadge: { marginTop: 4, borderWidth: 1, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 8, lineHeight: 12, ...black, textTransform: 'uppercase', letterSpacing: 0.8 },
  fleetBox: { borderRadius: 14, borderWidth: 1, borderColor: colors.blue[100], backgroundColor: alpha(colors.blue[50], 0.6), paddingHorizontal: 12, paddingVertical: 10 },
  fleetDriver: { fontSize: 11, lineHeight: 16, ...black, color: colors.slate[900] },
  fleetLine: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.slate[600] },
  metaGrid: { flexDirection: 'row', gap: 12 },
  metaCell: { flex: 1, borderRadius: 14, backgroundColor: colors.slate[50], borderWidth: 1, borderColor: colors.slate[100], paddingHorizontal: 12, paddingVertical: 10 },
  metaLabel: { fontSize: 10, lineHeight: 14, ...black, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 1 },
  metaValueRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaValue: { fontSize: 10, lineHeight: 14, ...black, color: colors.slate[700] },
  stops: { gap: 10, paddingHorizontal: 1 },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stopDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, backgroundColor: colors.white, marginTop: 5 },
  stopBody: { flex: 1, minWidth: 0 },
  stopLabel: { fontSize: 9, lineHeight: 13, ...black, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.9 },
  stopText: { fontSize: 12, lineHeight: 15, ...black, color: colors.slate[600] },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 10 },
  footLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footText: { fontSize: 10, lineHeight: 14, ...black, color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 1, flexShrink: 1 },
});

export default RideRequests;
