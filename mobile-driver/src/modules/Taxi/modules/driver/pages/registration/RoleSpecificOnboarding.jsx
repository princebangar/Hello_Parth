// Web: pages/registration/RoleSpecificOnboarding.jsx — /taxi/driver/role-signup (bus driver signup, steps 2-4):
// join an existing bus service (GET /drivers/onboarding/signup-options) or create one with the full bus builder
// (/taxi/driver/role-signup/bus-builder/create?step=1, saved as a draft in the registration session), an optional
// note, then PATCH /drivers/onboarding/role-details + POST /drivers/onboarding/complete -> token
// (persistDriverAuthSession) -> /taxi/driver/registration-status. No session / not a bus driver -> <prefix>/login.
// Native: the sticky top bar is a sticky header of the ScrollView; the page starts below the status bar and the fixed
// bottom buttons sit above the navigation bar. The bus services are drawn in the page's ScrollView (inside the card,
// a FlatList would not virtualize there either).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { ArrowLeft, BusFront, ChevronRight, Search } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, driverTheme, shadow } from '@/theme';
import {
  clearDriverRegistrationSession,
  completeDriverOnboarding,
  getDriverOnboardingSignupOptions,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverOnboardingRoleDetails,
  saveDriverRegistrationSession,
  toPlainData,
} from '../../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;

const ROLE_META = {
  bus_driver: {
    Icon: BusFront,
    color: '#2563eb', // text-blue-600
  },
};

const ROLE_STEPS = {
  bus_driver: [
    {
      key: 'bus-flow',
      badge: 'Step 2 of 4',
      title: 'Choose Bus Flow',
      subtitle: 'Join an existing bus service or create a new one with the full builder.',
    },
    {
      key: 'note',
      badge: 'Step 3 of 4',
      title: 'Add Request Note',
      subtitle: 'Tell the admin anything helpful before they review your signup.',
    },
    {
      key: 'review',
      badge: 'Step 4 of 4',
      title: 'Review & Submit',
      subtitle: 'Check your bus details and send the request.',
    },
  ],
};

// rounded-[22px] info box: label + text
const InfoBox = ({ tone = 'slate', label, children }) => {
  const toneStyle = INFO_TONES[tone] || INFO_TONES.slate;
  return (
    <View style={[styles.infoBox, toneStyle.box]}>
      <Text style={[styles.infoLabel, toneStyle.label]}>{label}</Text>
      {children}
    </View>
  );
};

const RoleSpecificOnboardingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const session = getStoredDriverRegistrationSession();
  const role = String(session.role || '').toLowerCase();
  const meta = ROLE_META[role];
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const registrationId = String(session.registrationId || '').trim();
  const steps = ROLE_STEPS[role] || [];

  const finishedRef = useRef(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState({
    busServices: [],
  });
  const [formData, setFormData] = useState(() => ({
    busSignupMode: session.roleDetails?.createNewBus ? 'create' : session.roleDetails?.busServiceId ? 'existing' : '',
    busServiceId: session.roleDetails?.busServiceId || '',
    requestNote: session.roleDetails?.requestNote || '',
    operatorName: session.roleDetails?.operatorName || '',
    busName: session.roleDetails?.busName || '',
    serviceNumber: session.roleDetails?.serviceNumber || '',
    originCity: session.roleDetails?.originCity || '',
    destinationCity: session.roleDetails?.destinationCity || '',
  }));
  const [stepIndex, setStepIndex] = useState(() => {
    if (typeof session.roleSignupStep === 'number' && session.roleSignupStep >= 0) {
      return session.roleSignupStep;
    }

    if (role === 'bus_driver') {
      if (session.roleDetails?.createNewBus && session.roleDetails?.busDraft) {
        return session.roleDetails?.requestNote ? 2 : 1;
      }
      if (session.roleDetails?.busServiceId) {
        return session.roleDetails?.requestNote ? 2 : 1;
      }
      return 0;
    }

    return 0;
  });

  useEffect(() => {
    if (finishedRef.current) {
      return undefined;
    }

    if (!phone || !registrationId || !meta) {
      navigate(`${routePrefix}/login`, { replace: true });
      return undefined;
    }

    let active = true;

    const loadOptions = async () => {
      try {
        setLoadingOptions(true);
        const response = await getDriverOnboardingSignupOptions();
        if (!active) return;
        setOptions(unwrap(response));
      } catch (requestError) {
        if (!active) return;
        setError(requestError?.message || 'Unable to load signup options');
      } finally {
        if (active) {
          setLoadingOptions(false);
        }
      }
    };

    loadOptions();
    return () => {
      active = false;
    };
  }, [meta, navigate, phone, registrationId, routePrefix]);

  useEffect(() => {
    if (finishedRef.current) {
      return;
    }

    saveDriverRegistrationSession({
      ...session,
      roleDetails: {
        ...(session.roleDetails || {}),
        ...formData,
      },
      roleSignupStep: stepIndex,
    });
  }, [formData, session, stepIndex]);

  const filteredBusServices = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    const items = Array.isArray(options.busServices) ? options.busServices : [];
    if (!term) return items;
    return items.filter((item) =>
      [item.operatorName, item.busName, item.serviceNumber, item.routeName, item.originCity, item.destinationCity]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [options.busServices, search]);

  const createdBusDraft = session?.roleDetails?.busDraft || null;

  const selectedBusService = useMemo(
    () =>
      (options.busServices || []).find((item) => String(item.id) === String(formData.busServiceId)) || null,
    [formData.busServiceId, options.busServices],
  );

  const canCreateBusDraft = Boolean(
    String(createdBusDraft?.operatorName || '').trim()
      && String(createdBusDraft?.busName || '').trim()
      && String(createdBusDraft?.route?.originCity || '').trim()
      && String(createdBusDraft?.route?.destinationCity || '').trim(),
  );

  const currentStep = steps[stepIndex] || steps[0] || null;
  const isLastStep = stepIndex === steps.length - 1;
  const isBusDriverCreateMode = role === 'bus_driver' && formData.busSignupMode === 'create';

  const headerTitle =
    role === 'bus_driver' && stepIndex === 0
      ? !formData.busSignupMode
        ? 'Choose Bus Flow'
        : formData.busSignupMode === 'create'
          ? 'Create Bus Service'
          : 'Join Existing Bus'
      : currentStep?.title || '';
  const headerSubtitle =
    role === 'bus_driver' && stepIndex === 0
      ? !formData.busSignupMode
        ? 'Choose whether this driver joins an existing bus service or creates a new one.'
        : formData.busSignupMode === 'create'
          ? 'Open the full bus builder and use the same admin-style flow for layout, route, and schedules.'
          : 'Search and select the bus service you want to join.'
      : currentStep?.subtitle || '';

  const canSubmit = isBusDriverCreateMode
    ? canCreateBusDraft
    : Boolean(formData.busServiceId);

  const canMoveForward =
    role === 'bus_driver'
      ? stepIndex === 0
        ? (
            formData.busSignupMode === 'create'
              ? canCreateBusDraft
              : formData.busSignupMode === 'existing'
                ? Boolean(formData.busServiceId)
                : false
          )
        : canSubmit
      : canSubmit;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const roleDetails = {
        createNewBus: isBusDriverCreateMode,
        busServiceId: formData.busServiceId,
        requestNote: formData.requestNote,
        busDraft: createdBusDraft,
        operatorName: formData.operatorName,
        busName: formData.busName,
        serviceNumber: formData.serviceNumber,
        originCity: formData.originCity,
        destinationCity: formData.destinationCity,
      };

      await saveDriverOnboardingRoleDetails({
        registrationId,
        phone,
        roleDetails,
      });

      const response = await completeDriverOnboarding({ registrationId, phone });
      const payload = unwrap(response);

      if (payload?.token) {
        persistDriverAuthSession({ token: payload.token, role });
      }

      saveDriverRegistrationSession({
        ...session,
        roleDetails,
        completedRegistration: payload || null,
      });
      const routeState = { role, completedRegistration: toPlainData(payload) };
      finishedRef.current = true;
      clearDriverRegistrationSession();
      navigate('/taxi/driver/registration-status', { replace: true, state: routeState });
    } catch (requestError) {
      setError(requestError?.message || 'Unable to submit this signup request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
      return;
    }
    navigate(`${routePrefix}/step-personal`);
  };

  const handleNext = () => {
    if (isLastStep || !canMoveForward) {
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const openBusBuilder = () => {
    setFormData((current) => ({ ...current, busSignupMode: 'create', busServiceId: '' }));
    navigate('/taxi/driver/role-signup/bus-builder/create?step=1');
  };

  if (!meta || !currentStep) {
    return null;
  }

  const MetaIcon = meta.Icon;
  const draftTitle = `${createdBusDraft?.operatorName || 'Operator'} - ${createdBusDraft?.busName || 'Bus'}`;
  const draftRoute = `${createdBusDraft?.route?.originCity || 'Origin'} to ${createdBusDraft?.route?.destinationCity || 'Destination'}${createdBusDraft?.serviceNumber ? ` - ${createdBusDraft.serviceNumber}` : ''}`;
  const selectedRoute = selectedBusService
    ? `${selectedBusService.originCity || 'Origin'} to ${selectedBusService.destinationCity || 'Destination'}${selectedBusService.serviceNumber ? ` - ${selectedBusService.serviceNumber}` : ''}`
    : '';
  const primaryEnabled = isLastStep ? canSubmit && !loadingOptions : canMoveForward && !loadingOptions;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#f6efe4', '#fcfaf6', '#ffffff']}
        locations={[0, 0.28, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        style={[styles.scroll, { marginTop: insets.top }]}
        contentContainerStyle={[styles.content, { paddingBottom: 144 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={handleBack} accessibilityLabel="Back" style={styles.backBtn}>
            <ArrowLeft size={18} color="#0f172a" />
          </Pressable>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{currentStep.badge}</Text>
          </View>
        </View>

        <View style={styles.column}>
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <MetaIcon size={22} color={meta.color} />
            </View>
            <Text style={styles.heading}>{headerTitle}</Text>
            <Text style={styles.lead}>{headerSubtitle}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.progress}>
              {steps.map((step, index) => (
                <View
                  key={step.key}
                  style={[styles.progressBar, { backgroundColor: index <= stepIndex ? '#0f172a' : '#e2e8f0' }]}
                />
              ))}
            </View>

            {role === 'bus_driver' && stepIndex === 0 ? (
              <>
                <View style={styles.modeGrid}>
                  <Pressable
                    onPress={() => setFormData((current) => ({ ...current, busSignupMode: 'existing' }))}
                    style={[styles.modeBtn, formData.busSignupMode === 'existing' ? styles.modeBtnActive : styles.modeBtnIdle]}
                  >
                    <Text style={[styles.modeText, { color: formData.busSignupMode === 'existing' ? '#ffffff' : '#0f172a' }]}>
                      Join Existing
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={openBusBuilder}
                    style={[styles.modeBtn, formData.busSignupMode === 'create' ? styles.modeBtnActive : styles.modeBtnIdle]}
                  >
                    <Text style={[styles.modeText, { color: formData.busSignupMode === 'create' ? '#ffffff' : '#0f172a' }]}>
                      Create New
                    </Text>
                  </Pressable>
                </View>

                {!formData.busSignupMode ? (
                  <View style={styles.stackSm}>
                    <InfoBox tone="slate" label="How bus signup works">
                      <Text style={styles.infoText}>
                        Choose an existing bus service if it is already listed, or create a new one with the same full flow used in admin.
                      </Text>
                    </InfoBox>
                    <InfoBox tone="blue" label="Full Builder Included">
                      <Text style={styles.infoText}>
                        New bus creation opens the full multi-step builder for bus basics, media, seat layout, route, and schedules.
                      </Text>
                    </InfoBox>
                  </View>
                ) : null}

                {formData.busSignupMode === 'existing' ? (
                  <>
                    <InfoBox tone="emerald" label="Existing Bus Services">
                      <Text style={styles.infoText}>
                        Select any existing bus service if you're joining one that's already listed.
                      </Text>
                    </InfoBox>

                    <View style={styles.searchWrap}>
                      <View pointerEvents="none" style={styles.searchIcon}>
                        <Search size={16} color="#64748b" />
                      </View>
                      <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search bus service"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        style={styles.searchInput}
                      />
                    </View>

                    <View style={styles.stackSm}>
                      {filteredBusServices.map((item) => {
                        const isSelected = String(formData.busServiceId) === String(item.id);

                        return (
                          <Pressable
                            key={String(item.id)}
                            onPress={() => setFormData((current) => ({ ...current, busServiceId: item.id }))}
                            style={[styles.busItem, isSelected ? styles.busItemSelected : styles.busItemIdle]}
                          >
                            <Text style={[styles.busTitle, { color: isSelected ? '#ffffff' : '#0f172a' }]}>
                              {`${item.operatorName} - ${item.busName}`}
                            </Text>
                            <Text style={[styles.busSub, { color: isSelected ? alpha('#ffffff', 0.7) : '#64748b' }]}>
                              {`${item.originCity || 'Origin'} to ${item.destinationCity || 'Destination'}${item.serviceNumber ? ` - ${item.serviceNumber}` : ''}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {!filteredBusServices.length && !loadingOptions ? (
                      <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>No bus services found for this search.</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}

                {formData.busSignupMode === 'create' ? (
                  <View style={styles.stackSm}>
                    <InfoBox tone="blue" label="Create New Bus Service">
                      <Text style={styles.infoText}>
                        Open the full builder to set up the bus basics, media, seat layout, route, and schedules.
                      </Text>
                    </InfoBox>

                    <Pressable onPress={openBusBuilder} style={styles.builderBtn}>
                      <Text style={styles.builderBtnText}>Open Full Bus Builder</Text>
                      <ChevronRight size={18} color="#ffffff" />
                    </Pressable>

                    {createdBusDraft ? (
                      <InfoBox tone="slate" label="Saved Bus Draft">
                        <Text style={styles.infoText}>{draftTitle}</Text>
                        <Text style={styles.infoSub}>{draftRoute}</Text>
                      </InfoBox>
                    ) : (
                      <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>No bus draft saved yet. Open the builder and save your bus first.</Text>
                      </View>
                    )}

                    {canCreateBusDraft ? (
                      <Pressable onPress={handleNext} style={styles.outlineBtn}>
                        <Text style={styles.outlineBtnText}>Continue With This Draft</Text>
                        <ChevronRight size={18} color="#0f172a" />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}

            {role === 'bus_driver' && stepIndex === 1 ? (
              <>
                {formData.busSignupMode === 'existing' && selectedBusService ? (
                  <InfoBox tone="slate" label="Selected Bus">
                    <Text style={styles.infoText}>{`${selectedBusService.operatorName} - ${selectedBusService.busName}`}</Text>
                    <Text style={styles.infoSub}>{selectedRoute}</Text>
                  </InfoBox>
                ) : null}

                {formData.busSignupMode === 'create' ? (
                  <View style={styles.stackSm}>
                    <InfoBox tone="slate" label="New Bus Draft">
                      <Text style={styles.infoText}>{draftTitle}</Text>
                      <Text style={styles.infoSub}>{draftRoute}</Text>
                    </InfoBox>
                    <Pressable onPress={openBusBuilder} style={styles.outlineBtn}>
                      <Text style={styles.outlineBtnText}>Edit Bus Draft</Text>
                      <ChevronRight size={18} color="#0f172a" />
                    </Pressable>
                  </View>
                ) : null}

                <TextInput
                  value={formData.requestNote}
                  onChangeText={(text) => setFormData((current) => ({ ...current, requestNote: text }))}
                  placeholder="Optional note for the admin"
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  style={styles.textarea}
                />
                <Text style={styles.hint}>
                  Example: mention your city, shift preference, or who asked you to join this bus service.
                </Text>
              </>
            ) : null}

            {role === 'bus_driver' && stepIndex === 2 ? (
              <View style={styles.stackMd}>
                <InfoBox tone="slate" label={isBusDriverCreateMode ? 'New Bus Service' : 'Bus Service'}>
                  <Text style={styles.infoText}>
                    {isBusDriverCreateMode
                      ? draftTitle
                      : selectedBusService
                        ? `${selectedBusService.operatorName} - ${selectedBusService.busName}`
                        : 'No bus selected'}
                  </Text>
                  <Text style={styles.infoSub}>
                    {isBusDriverCreateMode
                      ? draftRoute
                      : selectedBusService
                        ? selectedRoute
                        : 'Go back and choose a bus service first.'}
                  </Text>
                </InfoBox>

                <InfoBox tone="slate" label="Admin Note">
                  <Text style={styles.infoText}>{formData.requestNote.trim() || 'No note added'}</Text>
                </InfoBox>
              </View>
            ) : null}
          </View>

          {loadingOptions ? (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingText}>Loading signup options...</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 40 + insets.bottom }]} pointerEvents="box-none">
        <LinearGradient
          pointerEvents="none"
          colors={[alpha('#f8fafc', 0), '#f8fafc', '#f8fafc']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.footerRow}>
          {stepIndex > 0 ? (
            <Pressable onPress={handleBack} disabled={submitting} style={styles.footerBack}>
              <Text style={styles.footerBackText}>Back</Text>
            </Pressable>
          ) : null}

          {isLastStep ? (
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit || submitting || loadingOptions}
              style={({ pressed }) => [
                styles.primaryBtn,
                primaryEnabled ? styles.primaryEnabled : styles.primaryIdle,
                canSubmit && !submitting && pressed ? styles.pressed : null,
              ]}
            >
              {submitting ? (
                <Spin>
                  <View style={styles.ring} />
                </Spin>
              ) : (
                <>
                  <Text style={[styles.primaryText, { color: primaryEnabled ? '#ffffff' : '#64748b' }]}>Submit Request</Text>
                  <ChevronRight size={18} color={primaryEnabled ? '#ffffff' : '#64748b'} />
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNext}
              disabled={!canMoveForward || submitting || loadingOptions}
              style={({ pressed }) => [
                styles.primaryBtn,
                primaryEnabled ? styles.primaryEnabled : styles.primaryIdle,
                canMoveForward && !submitting && pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.primaryText, { color: primaryEnabled ? '#ffffff' : '#64748b' }]}>Next Step</Text>
              <ChevronRight size={18} color={primaryEnabled ? '#ffffff' : '#64748b'} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

// Web: the page unmounted when another page opened on top (the bus builder) and mounted again when it came back.
// A stack screen stays mounted under the next one (and every screen sees the current URL and the saved session),
// so this page is drawn only while it is in front.
const RoleSpecificOnboarding = () => {
  const focused = useIsFocused();
  return focused ? <RoleSpecificOnboardingPage /> : null;
};

const INFO_TONES = {
  slate: StyleSheet.create({
    box: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
    label: { color: '#64748b' },
  }),
  blue: StyleSheet.create({
    box: { borderColor: '#dbeafe', backgroundColor: alpha('#eff6ff', 0.7) },
    label: { color: '#1d4ed8' },
  }),
  emerald: StyleSheet.create({
    box: { borderColor: '#d1fae5', backgroundColor: alpha('#ecfdf5', 0.7) },
    label: { color: '#047857' },
  }),
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingTop: 20, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 384, alignSelf: 'center', gap: 24 },
  topBar: {
    marginHorizontal: -20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: alpha('#f6efe4', 0.9),
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 30,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  stepBadge: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: alpha('#0f172a', 0.05),
    backgroundColor: alpha('#0f172a', 0.05),
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  stepBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: '#475569' },
  intro: { gap: 12 },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  heading: { fontSize: 42, lineHeight: 44, fontWeight: '700', letterSpacing: -1.68, color: '#0f172a' },
  lead: { fontSize: 15, lineHeight: 24.4, fontWeight: '700', color: alpha('#64748b', 0.8) },
  card: {
    gap: 16,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    padding: 24,
    ...shadow.sm,
  },
  progress: { marginBottom: 4, flexDirection: 'row', gap: 8 },
  progressBar: { height: 8, flex: 1, borderRadius: 9999 },
  modeGrid: { flexDirection: 'row', gap: 12 },
  modeBtn: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16, alignItems: 'center' },
  // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme); the border stays slate-900
  modeBtnActive: { borderColor: '#0f172a', backgroundColor: driverTheme.button },
  modeBtnIdle: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  modeText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  stackSm: { gap: 12 },
  stackMd: { gap: 16 },
  infoBox: { borderRadius: 22, borderWidth: 1, padding: 16 },
  infoLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase' },
  infoText: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#0f172a' },
  infoSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#64748b' },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  searchInput: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 16,
    paddingLeft: 44,
    paddingRight: 16,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#0f172a',
  },
  busItem: { width: '100%', borderRadius: 22, borderWidth: 1, padding: 16 },
  // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme); the border stays slate-900
  busItemSelected: { borderColor: '#0f172a', backgroundColor: driverTheme.button },
  busItemIdle: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  busTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  busSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#64748b' },
  // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
  builderBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 28.8,
    backgroundColor: driverTheme.button,
    paddingHorizontal: 20,
    paddingVertical: 16,
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 20 },
  },
  builderBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 2.52, textTransform: 'uppercase', color: '#ffffff' },
  outlineBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 28.8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  outlineBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 2.52, textTransform: 'uppercase', color: '#0f172a' },
  textarea: {
    width: '100%',
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#0f172a',
  },
  hint: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#64748b' },
  loadingBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#64748b' },
  errorBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecdd3',
    backgroundColor: '#fff1f2',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#e11d48' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 24 },
  footerRow: { width: '100%', maxWidth: 384, alignSelf: 'center', flexDirection: 'row', gap: 12 },
  footerBack: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28.8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
  },
  footerBackText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#334155' },
  primaryBtn: {
    height: 64,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 28.8,
  },
  // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
  primaryEnabled: {
    backgroundColor: driverTheme.button,
    elevation: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 20 },
  },
  primaryIdle: { backgroundColor: '#e2e8f0' },
  pressed: { transform: [{ scale: 0.98 }] },
  primaryText: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha('#ffffff', 0.25), borderTopColor: '#ffffff' },
});

export default RoleSpecificOnboarding;
