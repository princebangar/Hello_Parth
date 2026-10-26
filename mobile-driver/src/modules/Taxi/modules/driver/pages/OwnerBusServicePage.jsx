// Web: driver/pages/OwnerBusServicePage.jsx — the owner's bus panel: /taxi/owner/bus-service (kept-alive bottom-bar tab)
// and the stack pages /taxi/owner/bus-service/create, /edit/:id, /:id (same component; BusServiceManager picks the mode
// from the path). Owner APIs replace the admin ones (bus-driver signup approval is admin-only).
// Native: the page scrolls as a whole (web: the document scrolled) and hands its ScrollView to BusServiceManager through
// BusServiceManagerHost (form to the top on step change, new stop into view) plus a reload signal for pull-to-refresh
// and for the tab being shown again (the web remounted the screen on every visit; the old list stays while it reloads).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bus, ChevronLeft } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { colors, driverTheme, shadow } from '@/theme';
import { useSettings } from '../../../shared/context/SettingsContext';
import BusServiceManager, { BusServiceManagerHost } from '../../admin/pages/bus-service/BusServiceManager';
import { normalizeBusCatalog } from '../../admin/services/busService';
import { useDriverTabActive } from '../driverTabPages';
import {
  getOwnerFleetDrivers,
  createOwnerBusService,
  deleteOwnerBusService,
  getOwnerBusServices,
  updateOwnerBusService,
} from '../services/registrationService';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

// Bus-driver signup approval is admin-only; without these the manager falls back to admin APIs (401).
const ownerBusApi = {
  getPendingBusDrivers: async () => ({ data: { data: { results: [] } } }),
  approvePendingBusDriver: async () => true,
  rejectPendingBusDriver: async () => true,
  deleteBus: deleteOwnerBusService,
  getBuses: async () => {
    const response = await getOwnerBusServices();
    const rawItems = response?.data?.data || response?.data?.results || response?.data || [];
    return normalizeBusCatalog(Array.isArray(rawItems) ? rawItems : []);
  },
  getDrivers: async () => {
    const response = await getOwnerFleetDrivers();
    const rawItems = response?.data?.data?.results || response?.data?.results || [];
    return Array.isArray(rawItems) ? rawItems : [];
  },
  upsertBus: async (payload) =>
    normalizeBusCatalog([
      (
        payload.id?.startsWith('bus-')
          ? await createOwnerBusService(payload)
          : await updateOwnerBusService(payload.id, payload)
      )?.data?.data || {},
    ])[0],
};

const OwnerBusServicePage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const tabActive = useDriverTabActive();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();

  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const [reload, setReload] = useState({ key: 0, silent: false });
  const [refreshing, setRefreshing] = useState(false);

  // the tab is shown again: load the catalog again, keeping the old list on screen meanwhile
  const wasActiveRef = useRef(tabActive);
  useEffect(() => {
    if (tabActive && !wasActiveRef.current) setReload((current) => ({ key: current.key + 1, silent: true }));
    wasActiveRef.current = tabActive;
  }, [tabActive]);

  const onRefresh = useCallback(() => {
    if (!busEnabled) return;
    setRefreshing(true);
    setReload((current) => ({ key: current.key + 1, silent: false }));
  }, [busEnabled]);

  const onReloaded = useCallback(() => setRefreshing(false), []);

  const host = useMemo(
    () => ({ scrollRef, scrollYRef, reloadKey: reload.key, silentReload: reload.silent, onReloaded }),
    [reload, onReloaded],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {tabActive ? <StatusBar style="dark" /> : null}
      <ScrollView
        ref={scrollRef}
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: 32 + bottomSpace }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
        refreshControl={busEnabled ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigate('/taxi/owner/home')}
            style={({ pressed }) => [styles.backBtn, pressed ? styles.backBtnPressed : null]}
          >
            <ChevronLeft size={16} color={colors.slate[700]} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.badge}>
            <Bus size={14} color={colors.emerald[700]} />
            <Text style={styles.badgeText}>Owner Bus Panel</Text>
          </View>
        </View>
        <View style={styles.bookingsRow}>
          <Pressable
            onPress={() => navigate('/taxi/owner/bus-bookings')}
            style={({ pressed }) => [styles.bookingsBtn, pressed ? styles.bookingsBtnPressed : null]}
          >
            <Bus size={16} color={colors.white} />
            <Text style={styles.bookingsText}>View Bus Bookings</Text>
          </Pressable>
        </View>

        {busEnabled ? (
          <BusServiceManagerHost.Provider value={host}>
            <BusServiceManager
              api={ownerBusApi}
              basePath="/taxi/owner/bus-service"
              badgeLabel="Owner Bus Control"
              title="Add And Manage Your Buses"
              description="Create owner bus services from the same flow as admin, then manage routes, seats, pricing, and schedules in a mobile-friendly screen."
              emptyLabel="No buses added yet."
              defaultStatus="active"
            />
          </BusServiceManagerHost.Provider>
        ) : (
          <View style={styles.disabledBox}>
            <Text style={styles.disabledText}>
              Bus service is currently disabled in admin settings, so the owner bus panel is hidden until it is enabled.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fb' },
  flex1: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 24 },
  topRow: { marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...shadow.sm,
  },
  backBtnPressed: { backgroundColor: colors.slate[50] },
  backText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[700] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 9999, backgroundColor: colors.emerald[50], paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 11, lineHeight: 16.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.76, color: colors.emerald[700] },
  bookingsRow: { marginBottom: 20, flexDirection: 'row', justifyContent: 'flex-end' },
  // web bg-slate-900 button -> the partner blue (.driver-theme)
  bookingsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: driverTheme.button, paddingHorizontal: 16, paddingVertical: 12, ...shadow.sm },
  bookingsBtnPressed: { opacity: 0.9 },
  bookingsText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.white },
  disabledBox: { borderRadius: 28, borderWidth: 1, borderColor: colors.amber[200], backgroundColor: colors.amber[50], padding: 24, ...shadow.sm },
  disabledText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.amber[800] },
});

export default OwnerBusServicePage;
