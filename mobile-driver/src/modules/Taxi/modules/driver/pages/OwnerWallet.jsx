// Web: modules/Taxi/modules/driver/pages/OwnerWallet.jsx — /taxi/owner/wallet: owner wallet balance, minimum-balance
// notice, and two tabs: fleet earnings / commission per completed fleet trip, and the wallet transactions.
// Native: the sticky header sits above one FlatList (the white section card is drawn by the header, rows and footer of
// that list, so long trip / transaction lists scroll as a list). Pull-to-refresh reloads the wallet.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, ArrowDownLeft, ArrowLeft, ArrowUpRight, RefreshCw, Wallet } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, shadow } from '@/theme';
import api from '../../../shared/api/axiosInstance';

const PAGE_BG = '#F8F9FA';

const money = (value) => {
  const amount = Number(value || 0);
  return `${amount < 0 ? '-' : ''}Rs ${Math.abs(amount).toFixed(2)}`;
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

const TABS = [{ id: 'earnings', label: 'Fleet earnings' }, { id: 'wallet', label: 'Wallet transactions' }];

const serviceLabel = (serviceType) => (serviceType === 'parcel' ? 'Delivery' : serviceType === 'intercity' ? 'Outstation' : 'Ride');

const OwnerWallet = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [minimumBalance, setMinimumBalance] = useState(null);
  const [fleetTotals, setFleetTotals] = useState(null);
  const [fleetRides, setFleetRides] = useState([]);
  const [tab, setTab] = useState('earnings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pulled, setPulled] = useState(false);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/drivers/fleet/wallet');
      const data = response?.data?.data || response?.data || {};
      setBalance(Number(data.balance || 0));
      setTransactions(Array.isArray(data.results) ? data.results : []);
      setMinimumBalance(Number.isFinite(Number(data.minimumBalanceForOrders)) ? Number(data.minimumBalanceForOrders) : null);
      setFleetTotals(data.fleetTotals || null);
      setFleetRides(Array.isArray(data.fleetRides) ? data.fleetRides : []);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your wallet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const onRefresh = async () => {
    setPulled(true);
    try {
      await loadWallet();
    } finally {
      setPulled(false);
    }
  };

  const isEarnings = tab === 'earnings';
  const rows = isEarnings ? fleetRides : transactions;
  const below = minimumBalance !== null && balance < minimumBalance;

  const listHeader = (
    <View>
      <LinearGradient colors={['#12348c', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
        <View style={styles.balanceTop}>
          <View>
            <Text style={styles.balanceLabel}>Current balance</Text>
            <Text style={styles.balanceValue}>{money(balance)}</Text>
          </View>
          <View style={styles.balanceIcon}>
            <Wallet size={22} color={colors.white} />
          </View>
        </View>
        <Text style={styles.balanceNote}>
          Credits and debits on this wallet are made by the admin team when your fleet earnings are settled.
        </Text>
        {minimumBalance !== null ? (
          <View style={[styles.minBox, { backgroundColor: below ? alpha(colors.rose[500], 0.9) : alpha(colors.white, 0.15) }]}>
            <Text style={styles.minText}>
              {below
                ? `Your balance is below the minimum ${money(minimumBalance)}: your drivers get no rides until it is topped up.`
                : `Keep at least ${money(minimumBalance)} in this wallet so your drivers keep getting rides.`}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}>
            <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <AlertCircle size={16} color={colors.rose[600]} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.sectionTop}>
        <Text style={styles.sectionTitle}>{isEarnings ? 'Fleet earnings and commission' : 'Transactions'}</Text>
        {isEarnings && fleetTotals ? (
          <View style={styles.totals}>
            <View style={[styles.totalTile, { backgroundColor: colors.slate[50] }]}>
              <Text style={[styles.totalLabel, { color: colors.slate[400] }]}>Fare</Text>
              <Text style={[styles.totalValue, { color: colors.slate[900] }]}>{money(fleetTotals.fare)}</Text>
            </View>
            <View style={[styles.totalTile, { backgroundColor: colors.rose[50] }]}>
              <Text style={[styles.totalLabel, { color: colors.rose[400] }]}>Admin commission</Text>
              <Text style={[styles.totalValue, { color: colors.rose[600] }]}>{money(fleetTotals.commission)}</Text>
            </View>
            <View style={[styles.totalTile, { backgroundColor: colors.emerald[50] }]}>
              <Text style={[styles.totalLabel, { color: colors.emerald[500] }]}>Fleet earned</Text>
              <Text style={[styles.totalValue, { color: colors.emerald[600] }]}>{money(fleetTotals.earnings)}</Text>
            </View>
          </View>
        ) : null}
        {!loading && rows.length === 0 && !error ? (
          <Text style={styles.emptyText}>{isEarnings ? 'No completed fleet trips yet.' : 'No wallet transactions yet.'}</Text>
        ) : null}
        <View style={{ height: isEarnings ? 12 : 8 }} />
      </View>
    </View>
  );

  const renderItem = ({ item, index }) => {
    const divider = index > 0 ? styles.divider : null;
    if (isEarnings) {
      const ride = item;
      return (
        <View style={styles.rowWrap}>
          <View style={[styles.row, divider]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>{ride.driverName || 'Fleet driver'}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{ride.vehicle || 'Vehicle not set'}</Text>
              <Text style={styles.rowMeta}>
                {`${formatDate(ride.completedAt)} - ${serviceLabel(ride.serviceType)} - ${String(ride.paymentMethod || 'cash').toUpperCase()}`}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowFare}>{money(ride.fare)}</Text>
              <Text style={styles.rowCommission}>{`Commission ${money(ride.commission)}`}</Text>
              <Text style={styles.rowEarned}>{`Earned ${money(ride.driverEarnings)}`}</Text>
            </View>
          </View>
        </View>
      );
    }
    const isDebit = String(item.type || '').toLowerCase() === 'debit';
    return (
      <View style={styles.rowWrap}>
        <View style={[styles.txRow, divider]}>
          <View style={[styles.txIcon, { backgroundColor: isDebit ? colors.rose[50] : colors.emerald[50] }]}>
            {isDebit ? <ArrowDownLeft size={18} color={colors.rose[600]} /> : <ArrowUpRight size={18} color={colors.emerald[600]} />}
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.description || (isDebit ? 'Debit' : 'Credit')}</Text>
            <Text style={styles.rowSub}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={[styles.txAmount, { color: isDebit ? colors.rose[600] : colors.emerald[600] }]}>
            {`${isDebit ? '-' : '+'}${money(item.amount)}`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
        <Pressable onPress={() => navigate(-1)} style={styles.headerBtn} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.slate[900]} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Owner wallet</Text>
          <Text style={styles.headerSub}>Fleet balance and admin settlements</Text>
        </View>
        <Pressable onPress={loadWallet} style={styles.headerBtn} accessibilityLabel="Refresh">
          <Spin spinning={loading}>
            <RefreshCw size={18} color={colors.slate[900]} />
          </Spin>
        </Pressable>
      </View>

      <FlatList
        key={tab}
        data={rows}
        keyExtractor={(item, index) => String((isEarnings ? item.id : item._id) ?? index)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={<View style={styles.sectionBottom} />}
        contentContainerStyle={[styles.main, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pulled} onRefresh={onRefresh} colors={[colors.blue[600]]} tintColor={colors.blue[600]} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PAGE_BG,
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 30,
  },
  headerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[950], textAlign: 'center' },
  headerSub: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[500], textAlign: 'center' },
  main: { paddingHorizontal: 20 },
  balanceCard: { borderRadius: 28, padding: 24, ...shadow.xl },
  balanceTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  balanceLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.2, color: alpha(colors.white, 0.5) },
  balanceValue: { marginTop: 8, fontSize: 36, lineHeight: 40, fontWeight: '900', color: colors.white },
  balanceIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), alignItems: 'center', justifyContent: 'center' },
  balanceNote: { marginTop: 16, fontSize: 12, lineHeight: 20, fontWeight: '600', color: alpha(colors.white, 0.7) },
  minBox: { marginTop: 12, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  minText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.white },
  tabs: { marginTop: 16, flexDirection: 'row', gap: 4, borderRadius: 16, backgroundColor: colors.slate[100], padding: 4 },
  tab: { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.white, ...shadow.sm },
  tabText: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.55, color: colors.slate[500], textAlign: 'center' },
  tabTextActive: { color: colors.blue[700] },
  errorBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.rose[100],
    backgroundColor: colors.rose[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.rose[600] },
  sectionTop: {
    marginTop: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionBottom: { height: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: colors.white },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[950] },
  totals: { marginTop: 12, flexDirection: 'row', gap: 8 },
  totalTile: { flex: 1, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center' },
  totalLabel: { fontSize: 9, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45, textAlign: 'center' },
  totalValue: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '900', textAlign: 'center' },
  emptyText: { marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[500] },
  rowWrap: { backgroundColor: colors.white, paddingHorizontal: 20 },
  divider: { borderTopWidth: 1, borderTopColor: colors.slate[100] },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowMain: { flex: 1, minWidth: 0 },
  rowRight: { flexShrink: 0, alignItems: 'flex-end' },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
  rowSub: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  rowMeta: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '600', color: colors.slate[400] },
  rowFare: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  rowCommission: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.rose[500] },
  rowEarned: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.emerald[600] },
  txIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  txAmount: { fontSize: 14, lineHeight: 20, fontWeight: '900' },
});

export default OwnerWallet;
