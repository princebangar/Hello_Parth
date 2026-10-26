// Web: modules/Taxi/modules/driver/pages/OwnerDashboard.jsx — the owner home (/taxi/owner/home, /taxi/owner/dashboard):
// business header with wallet / today earnings, fleet stat cards, bus snapshot (bus service on), business overview,
// business details, transport mix, recent drivers / vehicles / rides, shortcuts and the "Add money to your wallet" popup.
// Native: a kept-alive bottom-bar tab (driverTabPages.js). The web loaded the dashboard on every visit (mount); here it is
// loaded again each time the tab becomes active, keeping the last dashboard on screen meanwhile. Pull-to-refresh reloads it.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  Briefcase,
  Bus,
  Car,
  IndianRupee,
  MapPin,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Dialog, StatusBarScrim, Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, shadow } from '@/theme';
import { useSettings } from '../../../shared/context/SettingsContext';
import { getOwnerFleetDashboard } from '../services/registrationService';
import { useDriverTabActive } from '../driverTabPages';

const PAGE_BG = '#f8f9fb';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatRelativeDate = (value) => {
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

const statusTone = (value = '') => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'completed' || normalized === 'active') {
    return { bg: colors.emerald[50], fg: colors.emerald[600] };
  }
  if (normalized === 'pending' || normalized === 'accepted' || normalized === 'ongoing') {
    return { bg: colors.amber[50], fg: colors.amber[600] };
  }
  if (normalized === 'cancelled' || normalized === 'rejected' || normalized === 'inactive') {
    return { bg: colors.rose[50], fg: colors.rose[600] };
  }
  return { bg: colors.slate[100], fg: colors.slate[600] };
};

const StatusPill = ({ status }) => {
  const tone = statusTone(status);
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{status || 'pending'}</Text>
    </View>
  );
};

// animate-spin
const Spin = ({ spinning, children }) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) {
      value.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spinning, value]);
  const rotate = value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
};

const STAT_TONES = {
  emerald: ['#1d4ed8', '#3b82f6'],
  blue: ['#12348c', '#2563eb'],
  amber: ['#2563eb', '#60a5fa'],
  slate: ['#12348c', '#1d4ed8'],
};

const StatCard = ({ icon, label, value, sub, tone = 'slate' }) => (
  <LinearGradient colors={STAT_TONES[tone] || STAT_TONES.slate} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statCard}>
    <View style={styles.statRow}>
      <View style={styles.flexShrink}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      </View>
      <View style={styles.statIcon}>{icon}</View>
    </View>
  </LinearGradient>
);

const MiniTile = ({ label, value, sub }) => (
  <View style={styles.miniTile}>
    <Text style={styles.miniLabel}>{label}</Text>
    <Text style={styles.miniValue}>{value}</Text>
    {sub ? <Text style={styles.miniSub}>{sub}</Text> : null}
  </View>
);

const DetailTile = ({ label, value, capitalize }) => (
  <View style={styles.miniTile}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, capitalize && styles.capitalize]}>{value}</Text>
  </View>
);

const SectionHead = ({ eyebrow, title, right }) => (
  <View style={styles.sectionHead}>
    <View style={styles.flexShrink}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {right}
  </View>
);

const ViewAll = ({ onPress }) => (
  <Pressable onPress={onPress} hitSlop={8}>
    <Text style={styles.viewAll}>View all</Text>
  </Pressable>
);

const Empty = ({ children }) => (
  <View style={styles.empty}>
    <Text style={styles.emptyText}>{children}</Text>
  </View>
);

const OwnerDashboard = () => {
  const tabScrollRef = useRef(null);
  useTabScrollTop(tabScrollRef);
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const tabActive = useDriverTabActive();
  const { settings } = useSettings();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  // bumps after each visit's load (the web re-checked the low-wallet popup on every mount)
  const [visitSeq, setVisitSeq] = useState(0);
  const hasDashboardRef = useRef(false);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError('');

    try {
      const response = await getOwnerFleetDashboard();
      const payload = response?.data?.data || response?.data || response;
      setDashboard(payload);
      hasDashboardRef.current = Boolean(payload);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load owner dashboard');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // web: on mount (every visit) -> here: every time the tab is shown (old dashboard stays while it reloads)
  useEffect(() => {
    if (!tabActive) return undefined;
    let cancelled = false;
    const visit = async () => {
      if (hasDashboardRef.current) {
        try {
          const response = await getOwnerFleetDashboard();
          const payload = response?.data?.data || response?.data || response;
          if (!cancelled) {
            setDashboard(payload);
            setError('');
          }
        } catch (requestError) {
          if (!cancelled) setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load owner dashboard');
        }
      } else {
        await loadDashboard();
      }
      if (!cancelled) setVisitSeq((n) => n + 1);
    };
    visit();
    return () => {
      cancelled = true;
    };
  }, [tabActive, loadDashboard]);

  const profile = dashboard?.profile || {};
  const fleet = dashboard?.fleet || {};
  const bookings = dashboard?.bookings || {};
  const earnings = dashboard?.earnings || {};
  const serviceLocation = dashboard?.serviceLocation || null;
  const recentDrivers = dashboard?.recentDrivers || [];
  const recentVehicles = dashboard?.recentVehicles || [];
  const recentBusBookings = dashboard?.recentBusBookings || [];
  const busOverview = dashboard?.busOverview || {};
  const recentRides = dashboard?.recentRides || [];
  const transportBreakdown = dashboard?.transportBreakdown || [];
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);
  // Admin rule: below this owner-wallet balance none of the fleet's drivers get taxi/parcel rides (bus is not affected).
  const walletMinimum = Number(earnings.minimumBalanceForOrders);
  const walletBelowMinimum = Boolean(dashboard)
    && String(profile.transportType || '').toLowerCase() !== 'bus'
    && earnings.minimumBalanceForOrders !== null
    && Number.isFinite(walletMinimum)
    && Number(earnings.walletBalance || 0) < walletMinimum;
  const [lowWalletPopupOpen, setLowWalletPopupOpen] = useState(false);
  useEffect(() => {
    setLowWalletPopupOpen(walletBelowMinimum);
  }, [walletBelowMinimum, visitSeq]);

  const businessSubtitle = useMemo(() => {
    const ownerName = profile.ownerName || profile.companyName || 'Owner';
    const serviceName = serviceLocation?.name || profile.city || 'Service area';
    return `${ownerName} • ${serviceName}`;
  }, [profile.city, profile.companyName, profile.ownerName, serviceLocation?.name]);

  if (isLoading) {
    return (
      <View style={styles.loadingPage}>
        {tabActive ? <StatusBar style="dark" /> : null}
        <ActivityIndicator size={32} color={colors.slate[400]} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {tabActive ? <StatusBar style="dark" /> : null}
      <ScrollView ref={tabScrollRef}
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadDashboard({ silent: true })}
            colors={[colors.blue[600]]}
            tintColor={colors.blue[600]}
          />
        }
      >
        <LinearGradient colors={['#12348c', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.flexShrink}>
              <Text style={styles.headerEyebrow}>Owner Dashboard</Text>
              <Text style={styles.headerTitle}>{profile.companyName || profile.ownerName || 'Fleet Business'}</Text>
              <Text style={styles.headerSub}>{businessSubtitle}</Text>
            </View>
            <Pressable
              onPress={() => loadDashboard({ silent: true })}
              disabled={isRefreshing}
              style={[styles.refreshBtn, isRefreshing && styles.disabled]}
              accessibilityLabel="Refresh dashboard"
            >
              <Spin spinning={isRefreshing}>
                <RefreshCw size={18} color={colors.white} />
              </Spin>
            </Pressable>
          </View>

          <View style={[styles.grid2, styles.mt5]}>
            <View style={styles.headerTile}>
              <Text style={styles.headerTileLabel}>Wallet</Text>
              <Text style={styles.headerTileValue}>{money(earnings.walletBalance)}</Text>
            </View>
            <View style={styles.headerTile}>
              <Text style={styles.headerTileLabel}>Today Earnings</Text>
              <Text style={styles.headerTileValue}>{money(earnings.todayOwnerEarnings)}</Text>
            </View>
          </View>
        </LinearGradient>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={[styles.grid2, styles.mt5]}>
          <StatCard
            icon={<Users size={22} color={colors.white} />}
            label="Fleet Drivers"
            value={fleet.totalDrivers || 0}
            sub={`${fleet.onlineDrivers || 0} online • ${fleet.busyDrivers || 0} on trip`}
            tone="blue"
          />
          <StatCard
            icon={<Car size={22} color={colors.white} />}
            label="Fleet Vehicles"
            value={fleet.totalVehicles || 0}
            sub={`${fleet.approvedVehicles || 0} approved • ${fleet.pendingVehicles || 0} pending`}
            tone="emerald"
          />
          <StatCard
            icon={<Briefcase size={22} color={colors.white} />}
            label="Total Bookings"
            value={bookings.total || 0}
            sub={`${bookings.active || 0} active right now`}
            tone="amber"
          />
          <StatCard
            icon={<IndianRupee size={22} color={colors.white} />}
            label="Gross Revenue"
            value={money(earnings.grossRevenue)}
            sub={`${money(earnings.ownerEarnings)} net driver earnings`}
          />
        </View>

        {busEnabled ? (
          <>
            <View style={styles.card}>
              <SectionHead
                eyebrow="Bus Business"
                title="Owner bus snapshot"
                right={
                  <Pressable onPress={() => navigate('/taxi/owner/bus-service')} style={styles.openBus}>
                    <Bus size={14} color={colors.white} />
                    <Text style={styles.openBusText}>Open Bus</Text>
                  </Pressable>
                }
              />
              <View style={[styles.grid2, styles.mt4]}>
                <MiniTile label="Total Buses" value={busOverview.totalBuses || 0} sub={`${busOverview.activeBuses || 0} active`} />
                <MiniTile label="Bus Bookings" value={busOverview.totalBookings || 0} sub={`${busOverview.upcomingBookings || 0} upcoming`} />
                <MiniTile label="Confirmed" value={busOverview.confirmedBookings || 0} sub="live paid seats" />
                <MiniTile label="Bus Revenue" value={money(busOverview.grossRevenue)} sub="pending + confirmed" />
              </View>
            </View>

            <View style={styles.card}>
              <SectionHead
                eyebrow="Recent Bus Bookings"
                title="Latest seat reservations"
                right={<ViewAll onPress={() => navigate('/taxi/owner/bus-bookings')} />}
              />
              <View style={styles.list}>
                {recentBusBookings.length === 0 ? (
                  <Empty>No bus bookings found yet.</Empty>
                ) : (
                  recentBusBookings.map((booking) => (
                    <View key={booking.id} style={styles.rowCardTall}>
                      <View style={styles.rowTop}>
                        <View style={styles.flexShrink}>
                          <Text style={styles.rowTitle}>
                            {booking.busService?.busName || booking.routeSnapshot?.busName || 'Bus Service'}
                          </Text>
                          <Text style={styles.rowSub}>
                            {`${booking.routeSnapshot?.originCity || 'Origin'} to ${booking.routeSnapshot?.destinationCity || 'Destination'}`}
                          </Text>
                          <Text style={styles.rowSub}>
                            {`${booking.passenger?.name || 'Passenger'} • ${booking.seatLabels?.length || booking.seatIds?.length || 0} seats • ${booking.travelDate || '-'}`}
                          </Text>
                        </View>
                        <View style={styles.rowRight}>
                          <StatusPill status={booking.status} />
                          <Text style={styles.rowMoney}>{money(booking.amount)}</Text>
                          <Text style={styles.rowDate}>{formatRelativeDate(booking.createdAt)}</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.card}>
          <SectionHead
            eyebrow="Business Overview"
            title="Live business snapshot"
            right={<TrendingUp size={20} color={colors.emerald[500]} />}
          />
          <View style={[styles.grid2, styles.mt4]}>
            <MiniTile label="Completed" value={bookings.completed || 0} />
            <MiniTile label="Cancelled" value={bookings.cancelled || 0} />
            <MiniTile label="Cash Trips" value={earnings.cashTrips || 0} />
            <MiniTile label="Online Trips" value={earnings.onlineTrips || 0} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>From DB</Text>
          <Text style={styles.sectionTitle}>Business details</Text>
          <View style={styles.list}>
            <View style={styles.locationRow}>
              <MapPin size={18} color={colors.blue[500]} style={styles.mt05} />
              <View style={styles.flexShrink}>
                <Text style={styles.detailLabel}>Service Location</Text>
                <Text style={styles.detailValue}>{serviceLocation?.name || '-'}</Text>
                <Text style={styles.locationAddress}>{serviceLocation?.address || profile.address || 'Address not updated'}</Text>
              </View>
            </View>
            <View style={styles.grid2}>
              <DetailTile label="Owner" value={profile.ownerName || '-'} />
              <DetailTile label="Transport" value={profile.transportType || '-'} capitalize />
              <DetailTile label="Phone" value={profile.phone || '-'} />
              <DetailTile label="Status" value={profile.status || '-'} capitalize />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <SectionHead eyebrow="Transport Mix" title="Bookings by module" />
          <View style={styles.list}>
            {transportBreakdown.length === 0 ? (
              <Empty>No booking data yet.</Empty>
            ) : (
              transportBreakdown.map((item) => (
                <View key={item.transportType} style={styles.miniTileFull}>
                  <View style={styles.rowCenter}>
                    <Text style={[styles.rowTitle, styles.capitalize]}>{item.transportType}</Text>
                    <Text style={styles.mixMoney}>{money(item.earnings)}</Text>
                  </View>
                  <Text style={styles.rowSub}>{`${item.trips} trips • ${item.completedTrips} completed`}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.card}>
          <SectionHead eyebrow="Recent Drivers" title="Fleet team" right={<ViewAll onPress={() => navigate('/taxi/owner/manage-drivers')} />} />
          <View style={styles.list}>
            {recentDrivers.length === 0 ? (
              <Empty>No drivers added yet.</Empty>
            ) : (
              recentDrivers.map((driver) => (
                <View key={driver.id} style={styles.rowCard}>
                  <View style={styles.flexShrink}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{driver.name || 'Driver'}</Text>
                    <Text style={styles.rowSub}>{`${driver.phone || '-'} • ${driver.city || 'No city'}`}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <StatusPill status={driver.status} />
                    <Text style={styles.rowDate}>{driver.isOnRide ? 'On trip' : driver.isOnline ? 'Online' : 'Offline'}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.card}>
          <SectionHead eyebrow="Recent Vehicles" title="Fleet inventory" right={<ViewAll onPress={() => navigate('/taxi/owner/vehicle-fleet')} />} />
          <View style={styles.list}>
            {recentVehicles.length === 0 ? (
              <Empty>No vehicles added yet.</Empty>
            ) : (
              recentVehicles.map((vehicle) => (
                <View key={vehicle.id} style={styles.rowCard}>
                  <View style={styles.flexShrink}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || vehicle.vehicleTypeName || 'Vehicle'}
                    </Text>
                    <Text style={styles.rowSub}>
                      {`${vehicle.number || '-'} • ${vehicle.color || 'No color'} • ${vehicle.transportType || 'taxi'}`}
                    </Text>
                  </View>
                  <StatusPill status={vehicle.status} />
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.card}>
          <SectionHead eyebrow="Recent Bookings" title="Latest ride activity" />
          <View style={styles.list}>
            {recentRides.length === 0 ? (
              <Empty>No bookings found yet.</Empty>
            ) : (
              recentRides.map((ride) => (
                <View key={ride.id} style={styles.rowCardTall}>
                  <View style={styles.rowTop}>
                    <View style={styles.flexShrink}>
                      <Text style={[styles.rowTitle, styles.capitalize]}>
                        {`${ride.transportType || 'taxi'} • ${ride.driver?.name || 'Driver not assigned'}`}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{`Pickup: ${ride.pickupAddress || '-'}`}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{`Drop: ${ride.dropAddress || '-'}`}</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <StatusPill status={ride.status} />
                      <Text style={styles.rowMoney}>{money(ride.earnings || ride.fare)}</Text>
                      <Text style={styles.rowDate}>{formatRelativeDate(ride.createdAt)}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={[styles.grid2, styles.mt5]}>
          <Pressable onPress={() => navigate('/taxi/owner/manage-drivers')} style={styles.shortcut}>
            <View>
              <Text style={styles.shortcutTitle}>Manage Drivers</Text>
              <Text style={styles.shortcutSub}>Edit your team</Text>
            </View>
            <ArrowRight size={16} color={colors.slate[300]} />
          </Pressable>
          <Pressable onPress={() => navigate('/taxi/owner/vehicle-fleet')} style={styles.shortcut}>
            <View>
              <Text style={styles.shortcutTitle}>Manage Fleet</Text>
              <Text style={styles.shortcutSub}>Update vehicles</Text>
            </View>
            <ArrowRight size={16} color={colors.slate[300]} />
          </Pressable>
        </View>
      </ScrollView>
      <StatusBarScrim color={PAGE_BG} />

      <Dialog
        open={lowWalletPopupOpen && tabActive}
        onClose={() => setLowWalletPopupOpen(false)}
        backdropOpacity={0.45}
        style={styles.popup}
      >
        <View accessibilityRole="alert" style={styles.popupInner}>
          <View style={styles.popupIcon}>
            <Wallet size={22} strokeWidth={2.6} color={colors.rose[600]} />
          </View>
          <Text style={styles.popupTitle}>Add money to your wallet</Text>
          <Text style={styles.popupText}>
            {`Your wallet balance is ${money(earnings.walletBalance)}. Keep at least ${money(walletMinimum)} in your wallet, otherwise your drivers will not receive any ride requests.`}
          </Text>
          <Text style={styles.popupText}>Please contact the admin team to add money to your wallet.</Text>
          <View style={styles.popupButtons}>
            <Pressable
              onPress={() => setLowWalletPopupOpen(false)}
              style={({ pressed }) => [styles.laterBtn, pressed && styles.pressed]}
            >
              <Text style={styles.laterText} numberOfLines={1}>Later</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setLowWalletPopupOpen(false);
                navigate('/taxi/owner/wallet');
              }}
              style={({ pressed }) => [styles.viewWalletWrap, pressed && styles.pressed]}
            >
              <LinearGradient colors={['#1d4ed8', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.viewWalletBtn}>
                <Text style={styles.viewWalletText} numberOfLines={1}>View Wallet</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Dialog>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  loadingPage: { flex: 1, backgroundColor: PAGE_BG, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, width: '100%', maxWidth: 512, alignSelf: 'center' },
  flexShrink: { flex: 1, minWidth: 0 },
  capitalize: { textTransform: 'capitalize' },
  disabled: { opacity: 0.6 },
  pressed: { transform: [{ scale: 0.97 }] },
  mt4: { marginTop: 16 },
  mt5: { marginTop: 20 },
  mt05: { marginTop: 2 },
  header: { borderRadius: 32, paddingHorizontal: 20, paddingVertical: 24, ...shadow['2xl'] },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  headerEyebrow: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.4, color: colors.emerald[400] },
  headerTitle: { marginTop: 8, fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.7, color: colors.white },
  headerSub: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '700', color: alpha(colors.white, 0.7) },
  refreshBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), alignItems: 'center', justifyContent: 'center' },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  headerTile: {
    flexGrow: 1,
    flexBasis: '40%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    backgroundColor: alpha(colors.white, 0.05),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTileLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.8, color: alpha(colors.white, 0.5) },
  headerTileValue: { marginTop: 8, fontSize: 20, lineHeight: 26, fontWeight: '900', color: colors.white },
  errorBox: { marginTop: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], padding: 16 },
  errorText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.rose[600] },
  statCard: { flexBasis: '40%', flexGrow: 1, borderRadius: 28, padding: 20, ...shadow.xl },
  statRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  statLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.2, color: alpha(colors.white, 0.65) },
  statValue: { marginTop: 8, fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.7, color: colors.white },
  statSub: { marginTop: 8, fontSize: 11, lineHeight: 15, fontWeight: '700', color: alpha(colors.white, 0.75) },
  statIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: alpha(colors.white, 0.15), alignItems: 'center', justifyContent: 'center' },
  card: { marginTop: 20, borderRadius: 30, backgroundColor: colors.white, padding: 20, ...shadow.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.2, color: colors.slate[400] },
  sectionTitle: { marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.slate[950] },
  viewAll: { fontSize: 11, fontWeight: '900', color: colors.blue[600] },
  openBus: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.blue[600], paddingHorizontal: 12, paddingVertical: 8 },
  openBusText: { fontSize: 11, fontWeight: '900', color: colors.white },
  miniTile: { flexBasis: '40%', flexGrow: 1, borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  miniTileFull: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  miniLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400] },
  miniValue: { marginTop: 8, fontSize: 18, lineHeight: 26, fontWeight: '900', color: colors.slate[900] },
  miniSub: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[500] },
  detailLabel: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[400] },
  detailValue: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  list: { marginTop: 16, gap: 12 },
  empty: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 20 },
  emptyText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400] },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowCardTall: { borderRadius: 16, backgroundColor: colors.slate[50], padding: 16 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowRight: { flexShrink: 0, alignItems: 'flex-end' },
  rowTitle: { fontSize: 13, lineHeight: 18, fontWeight: '900', color: colors.slate[900] },
  rowSub: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[500] },
  rowMoney: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.emerald[600] },
  rowDate: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400] },
  mixMoney: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.emerald[600] },
  pill: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 9, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9 },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  locationAddress: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  shortcut: {
    flexBasis: '40%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 26,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...shadow.sm,
  },
  shortcutTitle: { fontSize: 11, lineHeight: 15, fontWeight: '900', color: colors.slate[900] },
  shortcutSub: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400] },
  popup: { maxWidth: 384, borderRadius: 28, backgroundColor: colors.white, ...shadow['2xl'] },
  popupInner: { padding: 24 },
  popupIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.rose[50], alignItems: 'center', justifyContent: 'center' },
  popupTitle: { marginTop: 16, fontSize: 19, lineHeight: 26, fontWeight: '900', letterSpacing: -0.5, color: colors.slate[950] },
  popupText: { marginTop: 8, fontSize: 13, lineHeight: 21, fontWeight: '600', color: colors.slate[500] },
  popupButtons: { marginTop: 24, flexDirection: 'row', gap: 12 },
  laterBtn: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1d4ed8',
    backgroundColor: colors.white,
    paddingHorizontal: 8,
  },
  laterText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: '#1d4ed8' },
  viewWalletWrap: {
    flex: 1,
    borderRadius: 16,
    elevation: 6,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.32,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 10 },
  },
  viewWalletBtn: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 8 },
  viewWalletText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.white },
});

export default OwnerDashboard;
