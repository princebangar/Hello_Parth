// Web: modules/Taxi/modules/driver/pages/settings/ManageDrivers.jsx — the owner's fleet team: total active card,
// "+ Add New Driver", the team list (edit / remove from the list) and the floating "+" button.
// Native: a kept-alive bottom-bar tab on /taxi/owner/manage-drivers (driverTabPages.js) and an ordinary page on
// /taxi/driver/manage-drivers. The web loaded the drivers on every visit (mount); here they are loaded again each time the
// tab becomes active, keeping the last list on screen meanwhile. Pull-to-refresh reloads the list.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  UserPlus,
  Mail,
  Phone,
  MapPin,
  IndianRupee,
  Trash2,
  Edit3,
  Briefcase,
  Plus,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { getOwnerFleetDrivers } from '../../services/registrationService';
import { useDriverTabActive } from '../../driverTabPages';

const PAGE_BG = '#f8f9fb';

const unwrap = (response) =>
  response?.data?.data || response?.data || response;

const mapDriver = (item) => ({
  id: item.id || item._id,
  name: item.name || '-',
  phone: item.phone || '-',
  email: item.email || '-',
  address: item.city || '-',
  salary: Number(item.salary || 0),
  assignedVehicle: item.assignedVehicle || null,
  status:
    item.approve === true ||
    item.approve === 1 ||
    String(item.status || '').toLowerCase() === 'approved'
      ? 'Active'
      : 'Pending',
});

const InfoLine = ({ icon: Icon, children, wide, truncate, upper = true }) => (
  <View style={[styles.infoLine, wide ? styles.infoWide : styles.infoHalf]}>
    <Icon size={12} strokeWidth={2.5} color={colors.slate[400]} />
    <Text style={[styles.infoText, upper && styles.infoUpper]} numberOfLines={truncate ? 1 : undefined}>
      {children}
    </Text>
  </View>
);

const ManageDrivers = () => {
  const tabScrollRef = useRef(null);
  useTabScrollTop(tabScrollRef);
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const tabActive = useDriverTabActive();
  const routePrefix = String(localStorage.getItem('role') || 'driver').toLowerCase() === 'owner'
    ? '/taxi/owner'
    : '/taxi/driver';
  const [drivers, setDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const loadedRef = useRef(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    setError('');

    try {
      const response = await getOwnerFleetDrivers();
      const payload = unwrap(response);
      const results = payload?.results || [];

      if (!activeRef.current) return;

      setDrivers(results.map(mapDriver));
      loadedRef.current = true;
    } catch (err) {
      if (!activeRef.current) return;
      setError(err?.message || 'Unable to load fleet drivers');
      setDrivers([]);
    } finally {
      if (activeRef.current) setIsLoading(false);
    }
  }, []);

  // web: on mount (every visit) -> here: every time the tab is shown (the last list stays while it reloads)
  useEffect(() => {
    if (!tabActive) return;
    load({ quiet: loadedRef.current });
  }, [tabActive, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load({ quiet: true });
    } finally {
      setRefreshing(false);
    }
  };

  const deleteDriver = (id) => {
    setDrivers((d) => d.filter((item) => item.id !== id));
  };

  const activeCount = useMemo(
    () => drivers.filter((d) => d.status === 'Active').length,
    [drivers],
  );

  const listHeader = (
    <View>
      <LinearGradient colors={[colors.slate[900], colors.slate[800]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View pointerEvents="none" style={styles.heroGlow} />
        <View style={styles.heroBody}>
          <View style={styles.heroTop}>
            <View style={styles.heroTexts}>
              <Text style={styles.heroLabel}>Total Active</Text>
              <Text style={styles.heroValue}>{`${activeCount} Drivers`}</Text>
              <Text style={styles.heroSub}>Managing your fleet team</Text>
            </View>
            <View style={styles.heroIcon}>
              <Briefcase size={28} color={colors.sky[500]} />
            </View>
          </View>
          <Pressable
            onPress={() => navigate(`${routePrefix}/add-driver`)}
            style={({ pressed }) => [styles.heroBtn, pressed && styles.heroBtnPressed]}
          >
            <Text style={styles.heroBtnText}>+ Add New Driver</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.listHead}>
        <Text style={styles.listHeadTitle}>Team List</Text>
        <Text style={styles.listHeadSub}>Status Overview</Text>
      </View>

      {isLoading ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>Loading drivers...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Text style={[styles.stateText, { color: colors.rose[500] }]}>{error}</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>No drivers found.</Text>
        </View>
      ) : null}
    </View>
  );

  const renderDriver = ({ item: d }) => {
    const active = d.status === 'Active';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardIdentity}>
            <View style={[styles.avatar, { backgroundColor: active ? colors.emerald[50] : colors.amber[50] }]}>
              <UserPlus size={18} color={active ? colors.emerald[500] : colors.amber[500]} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.name}>{d.name}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: active ? colors.emerald[500] : colors.amber[500] }]} />
                <Text style={styles.statusText}>{d.status}</Text>
              </View>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                navigate(`${routePrefix}/edit-driver/${d.id}`, {
                  state: {
                    driver: d,
                    returnTo: `${routePrefix}/manage-drivers`,
                  },
                })
              }
              style={styles.actionBtn}
              accessibilityLabel="Edit driver"
            >
              <Edit3 size={14} color={colors.slate[400]} />
            </Pressable>
            <Pressable onPress={() => deleteDriver(d.id)} style={styles.actionBtn} accessibilityLabel="Remove driver">
              <Trash2 size={14} color={colors.slate[400]} />
            </Pressable>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <InfoLine icon={Phone}>{d.phone}</InfoLine>
          <InfoLine icon={Mail} truncate upper={false}>{d.email}</InfoLine>
          <InfoLine icon={IndianRupee}>{`Monthly Salary Rs ${Number(d.salary || 0).toLocaleString('en-IN')}`}</InfoLine>
          <InfoLine icon={Briefcase} wide>
            {d.assignedVehicle?.number
              ? `${d.assignedVehicle.name || 'Assigned Vehicle'} ${d.assignedVehicle.number}`
              : 'No vehicle assigned'}
          </InfoLine>
          <InfoLine icon={MapPin} wide>{d.address}</InfoLine>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {tabActive ? <StatusBar style="dark" /> : null}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigate(`${routePrefix}/profile`)} style={styles.backBtn} accessibilityLabel="Back">
          <ArrowLeft size={18} color={colors.slate[900]} />
        </Pressable>
        <Text style={styles.title}>Manage Drivers</Text>
      </View>

      <FlatList ref={tabScrollRef}
        data={isLoading || error ? [] : drivers}
        keyExtractor={(item, index) => String(item.id ?? index)}
        renderItem={renderDriver}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue[600]]} tintColor={colors.blue[600]} />}
      />

      {/* Floats just above the bottom bar (bar = 76px + safe-area padding). */}
      <View style={[styles.fabWrap, { bottom: 92 + Math.max(insets.bottom, 8) }]} pointerEvents="box-none">
        <Pressable
          onPress={() => navigate(`${routePrefix}/add-driver`)}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityLabel="Add driver"
        >
          <Plus size={24} strokeWidth={3} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  flex1: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: PAGE_BG,
    paddingHorizontal: 24,
    paddingBottom: 12,
    zIndex: 30,
  },
  backBtn: {
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
  title: { fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.9, textTransform: 'uppercase', color: colors.slate[900] },
  content: { paddingHorizontal: 24, paddingTop: 12 },
  hero: { borderRadius: 32, padding: 24, overflow: 'hidden', ...shadow['2xl'] },
  heroGlow: {
    position: 'absolute',
    top: -60,
    right: -30,
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: alpha(colors.sky[500], 0.1),
  },
  heroBody: { gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroTexts: { gap: 4, flex: 1 },
  heroLabel: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, color: alpha(colors.sky[500], 0.6) },
  heroValue: { fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.7, fontStyle: 'italic', color: colors.white },
  heroSub: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: alpha(colors.white, 0.4) },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: alpha(colors.white, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },
  heroBtn: {
    alignSelf: 'flex-start',
    backgroundColor: alpha(colors.white, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  heroBtnPressed: { backgroundColor: alpha(colors.white, 0.2) },
  heroBtnText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.white },
  listHead: { marginTop: 24, marginBottom: 16, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listHeadTitle: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400], opacity: 0.6 },
  listHeadSub: { fontSize: 9, lineHeight: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9, color: colors.slate[300] },
  stateCard: { backgroundColor: colors.white, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.white, ...shadow.sm },
  stateText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[400] },
  separator: { height: 12 },
  card: { backgroundColor: colors.white, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.white, gap: 16, ...shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardIdentity: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  name: { fontSize: 14, lineHeight: 18, fontWeight: '900', textTransform: 'uppercase', letterSpacing: -0.7, color: colors.slate[900] },
  statusRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9, color: colors.slate[400] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { padding: 8, backgroundColor: colors.slate[50], borderRadius: 10 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 12, paddingTop: 4 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoHalf: { flexBasis: '45%', flexGrow: 1, minWidth: 0 },
  infoWide: { width: '100%' },
  infoText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[600] },
  infoUpper: { textTransform: 'uppercase', letterSpacing: -0.5 },
  fabWrap: { position: 'absolute', right: 24, zIndex: 55 },
  // bg-slate-900 button -> the partner button colour
  fab: { width: 56, height: 56, borderRadius: 16, backgroundColor: driverTheme.button, alignItems: 'center', justifyContent: 'center', ...shadow['2xl'] },
  fabPressed: { transform: [{ scale: 0.95 }] },
});

export default ManageDrivers;
