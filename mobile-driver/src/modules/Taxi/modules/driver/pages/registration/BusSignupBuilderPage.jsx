// Web: pages/registration/BusSignupBuilderPage.jsx — /taxi/driver/role-signup/bus-builder/* : the admin bus builder
// (BusServiceManager) used during bus-driver signup. Nothing goes to the server here: the bus is kept as a draft in the
// registration session (roleDetails.busDraft + operatorName, busName, serviceNumber, originCity, destinationCity) and
// submitted later with the bus-driver request. "Back To Signup" -> /taxi/driver/role-signup.
// Native: the page scrolls as a whole (web: the document scrolled), so the manager sits inside one ScrollView; the page
// starts below the status bar.
import React, { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bus, ChevronLeft } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Text } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { colors, shadow } from '@/theme';
import BusServiceManager, { BusServiceManagerHost } from '../../../admin/pages/bus-service/BusServiceManager';
import { normalizeBusCatalog } from '../../../admin/services/busService';
import {
  getStoredDriverRegistrationSession,
  saveDriverRegistrationSession,
} from '../../services/registrationService';

const getStoredBusDrafts = () => {
  const session = getStoredDriverRegistrationSession();
  const draft = session?.roleDetails?.busDraft;
  return draft ? normalizeBusCatalog([draft]) : [];
};

const saveStoredBusDraft = (payload) => {
  const normalized = normalizeBusCatalog([payload])[0];
  const session = getStoredDriverRegistrationSession();

  saveDriverRegistrationSession({
    ...session,
    roleDetails: {
      ...(session.roleDetails || {}),
      createNewBus: true,
      busDraft: normalized,
      operatorName: normalized.operatorName || '',
      busName: normalized.busName || '',
      serviceNumber: normalized.serviceNumber || '',
      originCity: normalized.route?.originCity || '',
      destinationCity: normalized.route?.destinationCity || '',
    },
  });

  return normalized;
};

const clearStoredBusDraft = () => {
  const session = getStoredDriverRegistrationSession();
  const nextRoleDetails = {
    ...(session.roleDetails || {}),
  };

  delete nextRoleDetails.busDraft;
  delete nextRoleDetails.operatorName;
  delete nextRoleDetails.busName;
  delete nextRoleDetails.serviceNumber;
  delete nextRoleDetails.originCity;
  delete nextRoleDetails.destinationCity;

  saveDriverRegistrationSession({
    ...session,
    roleDetails: nextRoleDetails,
  });

  return true;
};

const signupBusBuilderApi = {
  deleteBus: async () => clearStoredBusDraft(),
  getBuses: async () => getStoredBusDrafts(),
  getDrivers: undefined,
  getPendingBusDrivers: async () => ({ data: { data: { results: [] } } }),
  approvePendingBusDriver: async () => true,
  rejectPendingBusDriver: async () => true,
  upsertBus: async (payload) => saveStoredBusDraft(payload),
};

const BusSignupBuilderPage = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  // the manager scrolls the form to the top on step change / to a new stop through this (web: document scroll)
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const host = useMemo(() => ({ scrollRef, scrollYRef }), []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={32}
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: 32 + 40 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigate('/taxi/driver/role-signup')}
            style={({ pressed }) => [styles.backBtn, pressed ? styles.backBtnPressed : null]}
          >
            <ChevronLeft size={16} color={colors.slate[700]} />
            <Text style={styles.backText}>Back To Signup</Text>
          </Pressable>
          <View style={styles.badge}>
            <Bus size={14} color={colors.blue[700]} />
            <Text style={styles.badgeText}>Bus Signup Builder</Text>
          </View>
        </View>

        <BusServiceManagerHost.Provider value={host}>
          <BusServiceManager
            api={signupBusBuilderApi}
            basePath="/taxi/driver/role-signup/bus-builder"
            badgeLabel="Bus Signup Flow"
            title="Create Your Bus Service"
            description="Use the full bus creation flow here, then return to signup and submit the bus driver request."
            emptyLabel="No bus draft created yet."
            defaultStatus="draft"
          />
        </BusServiceManagerHost.Provider>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fb' },
  flex1: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 24 },
  topRow: { marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
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
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 9999, backgroundColor: colors.blue[50], paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.76, color: colors.blue[700] },
});

export default BusSignupBuilderPage;
