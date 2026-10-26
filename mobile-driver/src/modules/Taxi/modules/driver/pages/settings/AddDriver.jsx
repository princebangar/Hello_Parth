// Web: modules/Taxi/modules/driver/pages/settings/AddDriver.jsx — add a fleet driver (step 1 details, step 2 documents
// asked by the admin, step 3 "Pending!" then back to the list after 5 s) and edit-driver/:driverId (details only).
// Native: the web's <select> boxes open a bottom sheet with the same options; the fixed bottom button sits above the
// navigation bar; file picks come from FleetDocumentFields ({ uri, name, type }).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, UserPlus, CheckCircle2, ChevronDown, ChevronRight, Check, Mail, Phone, MapPin, IndianRupee } from 'lucide-react-native';
import { useLocation, useNavigate, useParams } from '@/lib/router';
import { Sheet, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { createOwnerFleetDriver, getDriverDocumentTemplates, getOwnerFleetDrivers, getOwnerFleetVehicles, getOwnerFleetZones, updateOwnerFleetDriver } from '../../services/registrationService';
import { normalizeDriverDocumentTemplates } from '../../utils/documentTemplates';
import FleetDocumentFields, { buildFleetDocumentsPayload, validateFleetDocumentInputs } from '../../components/FleetDocumentFields';

const DRAFT_KEY = 'helloparth:addDriverDraft';

// web <select>: a box showing the chosen option; the options open in a bottom sheet
const SelectField = ({ value, options, onSelect, disabled, title }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} disabled={disabled} style={[styles.selectBox, disabled && styles.dim]}>
        <Text style={styles.selectText} numberOfLines={1}>{current?.label || ''}</Text>
        <ChevronDown size={16} color={colors.slate[500]} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} style={styles.sheet}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value || '__none'}
                onPress={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
                style={[styles.sheetOption, selected && styles.sheetOptionActive]}
              >
                <Text style={[styles.sheetOptionText, selected && styles.sheetOptionTextActive]}>{option.label}</Text>
                {selected ? <Check size={16} color={colors.slate[900]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
};

// framer-motion step entrance (opacity 0, x 20 -> 1, 0)
const StepIn = ({ children, style, from = 'slide' }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);
  const transform = from === 'scale'
    ? [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }]
    : [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }];
  return <Animated.View style={[style, { opacity: anim, transform }]}>{children}</Animated.View>;
};

const SuccessIcon = () => {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(rot, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [rot]);
  const rotate = rot.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: ['0deg', '10deg', '-10deg', '0deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <CheckCircle2 size={40} color={colors.white} />
    </Animated.View>
  );
};

const SuccessBar = () => {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: false }).start();
  }, [width]);
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
};

const FieldBox = ({ icon: Icon, label, children }) => (
  <View style={styles.field}>
    <View style={styles.labelRow}>
      {Icon ? <Icon size={10} color={colors.slate[400]} /> : null}
      <Text style={styles.label}>{label}</Text>
    </View>
    {children}
  </View>
);

const AddDriver = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const { driverId } = useParams();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const isEditMode = Boolean(driverId);
  const [submitting, setSubmitting] = useState(false);
  const [loadingDriver, setLoadingDriver] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingZones, setLoadingZones] = useState(false);
  const [error, setError] = useState('');
  const [fleetVehicles, setFleetVehicles] = useState([]);
  const [fleetZones, setFleetZones] = useState([]);
  const [step, setStep] = useState(1); // 1: Details, 2: Documents, 3: Success
  const scrollRef = useRef(null);
  const doneTimerRef = useRef(null);
  // Every step opens from the top (the previous step's scroll position used to stay).
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);
  useEffect(() => () => clearTimeout(doneTimerRef.current), []);
  // A half-filled "add driver" form survives a refresh (files cannot be stored, so they are picked again).
  const readDraft = () => {
    if (driverId) return {};
    try {
      return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || '{}') || {};
    } catch {
      return {};
    }
  };
  const [formData, setFormData] = useState(() => ({
    name: '',
    mobile: '',
    email: '',
    address: '',
    salary: '',
    assignedFleetVehicleId: '',
    zoneId: '',
    ...readDraft(),
    documents: {},
  }));
  // The papers to collect come from Admin > Fleet Needed Documents (driver papers); number / expiry per template.
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [documentMeta, setDocumentMeta] = useState({});

  useEffect(() => {
    if (isEditMode) return undefined;
    let active = true;
    getDriverDocumentTemplates('fleet_driver')
      .then((response) => {
        if (!active) return;
        const results = response?.data?.data?.results || response?.data?.results || [];
        setDocumentTemplates(normalizeDriverDocumentTemplates(results));
      })
      .catch(() => active && setError((current) => current || 'Could not load the document list'))
      .finally(() => active && setTemplatesLoading(false));
    return () => { active = false; };
  }, [isEditMode]);

  useEffect(() => {
    if (isEditMode) return;
    const { documents: _documents, ...textFields } = formData;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(textFields));
    } catch {
      /* storage blocked: the form just is not remembered */
    }
  }, [formData, isEditMode]);

  useEffect(() => {
    if (!isEditMode) return undefined;

    const stateDriver = location.state?.driver;
    if (stateDriver && String(stateDriver.id) === String(driverId)) {
      setFormData((prev) => ({
        ...prev,
        name: stateDriver.name || '',
        mobile: stateDriver.phone || '',
        email: stateDriver.email || '',
        address: stateDriver.address || '',
        salary: stateDriver.salary ? String(stateDriver.salary) : '',
        assignedFleetVehicleId: stateDriver.assignedVehicle?.vehicleId || '',
        zoneId: stateDriver.zone?.zoneId || '',
      }));
      return undefined;
    }

    let active = true;
    setLoadingDriver(true);
    setError('');

    getOwnerFleetDrivers()
      .then((response) => {
        if (!active) return;
        const payload = response?.data?.data || response?.data || response;
        const match = (payload?.results || []).find((item) => String(item.id || item._id) === String(driverId));
        if (!match) {
          setError('Driver not found.');
          return;
        }

        setFormData((prev) => ({
          ...prev,
          name: match.name || '',
          mobile: match.phone || '',
          email: match.email || '',
          address: match.city || '',
          salary: match.salary ? String(match.salary) : '',
          assignedFleetVehicleId: match.assignedVehicle?.vehicleId || '',
          zoneId: match.zone?.zoneId || '',
        }));
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Unable to load driver details');
      })
      .finally(() => {
        if (active) setLoadingDriver(false);
      });

    return () => {
      active = false;
    };
  }, [driverId, isEditMode, location.state]);

  useEffect(() => {
    let active = true;
    setLoadingVehicles(true);

    getOwnerFleetVehicles()
      .then((response) => {
        if (!active) return;
        const payload = response?.data?.data || response?.data || response;
        setFleetVehicles(Array.isArray(payload?.results) ? payload.results : []);
      })
      .catch((err) => {
        if (!active) return;
        setError((current) => current || err?.message || 'Unable to load owner vehicles');
      })
      .finally(() => {
        if (active) setLoadingVehicles(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingZones(true);

    getOwnerFleetZones()
      .then((response) => {
        if (!active) return;
        const payload = response?.data?.data || response?.data || response;
        setFleetZones(Array.isArray(payload?.results) ? payload.results : []);
      })
      .catch((err) => {
        if (!active) return;
        setError((current) => current || err?.message || 'Unable to load owner zones');
      })
      .finally(() => {
        if (active) setLoadingZones(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleFileUpload = (fieldKey, file) => {
    if (file) setFormData((p) => ({ ...p, documents: { ...(p.documents || {}), [fieldKey]: file } }));
  };
  const clearFile = (fieldKey) => setFormData((p) => {
    const next = { ...(p.documents || {}) };
    delete next[fieldKey];
    return { ...p, documents: next };
  });
  const documentError = templatesLoading ? 'Loading' : validateFleetDocumentInputs(documentTemplates, formData.documents || {}, documentMeta);

  const returnTo = useMemo(
    () =>
      typeof location.state?.returnTo === 'string' && location.state.returnTo.trim()
        ? location.state.returnTo.trim()
        : `${routePrefix}/manage-drivers`,
    [location.state?.returnTo, routePrefix],
  );

  const availableVehicles = useMemo(
    () =>
      fleetVehicles.filter((vehicle) => {
        const assignedDriverId = vehicle?.assignedDriver?.id;
        return !assignedDriverId || String(assignedDriverId) === String(driverId);
      }),
    [driverId, fleetVehicles],
  );

  const vehicleOptions = useMemo(
    () => [
      { value: '', label: 'No vehicle assigned' },
      ...availableVehicles.map((vehicle) => {
        const optionLabel = [vehicle.car_brand, vehicle.car_model, vehicle.license_plate_number].filter(Boolean);
        return { value: String(vehicle.id || vehicle._id || ''), label: optionLabel.join(' - ') || 'Unnamed vehicle' };
      }),
    ],
    [availableVehicles],
  );

  const zoneOptions = useMemo(
    () => [
      { value: '', label: 'No zone assigned' },
      ...fleetZones.map((zone) => ({ value: String(zone.id || zone._id || ''), label: zone.name || 'Unnamed zone' })),
    ],
    [fleetZones],
  );

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        name: formData.name,
        phone: formData.mobile,
        email: formData.email,
        address: formData.address,
        city: formData.address,
        salary: Number(formData.salary || 0),
        assignedFleetVehicleId: formData.assignedFleetVehicleId || '',
        zoneId: formData.zoneId || '',
      };

      if (!isEditMode) {
        payload.documents = await buildFleetDocumentsPayload(documentTemplates, formData.documents || {}, documentMeta, {}, 'driver-documents');
      }

      if (isEditMode) {
        await updateOwnerFleetDriver(driverId, payload);
      } else {
        await createOwnerFleetDriver(payload);
      }

      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setStep(3);

      doneTimerRef.current = setTimeout(() => {
        navigate(returnTo, { replace: true });
      }, 5000);
    } catch (err) {
      setError(err?.message || 'Failed to submit driver request');
    } finally {
      setSubmitting(false);
    }
  };

  const step1Ready = Boolean(formData.name && formData.mobile && !loadingDriver);
  const step1Disabled = submitting || loadingDriver || !formData.name || !formData.mobile;
  const step2Disabled = submitting || Boolean(documentError);
  const bottomBarPad = { paddingBottom: 20 + insets.bottom };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => (step === 2 ? setStep(1) : navigate(-1))}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed95]}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={18} strokeWidth={2.5} color={colors.slate[900]} />
        </Pressable>
        <View style={styles.steps}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={[styles.stepDot, { backgroundColor: step >= s ? colors.slate[900] : colors.slate[100] }]} />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex1}
        contentContainerStyle={[styles.scroll, { paddingBottom: 128 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.main}>
          {step === 1 ? (
            <StepIn key="step1" style={styles.stepBody}>
              <View style={styles.titleBlock}>
                <Text style={styles.h1}>{isEditMode ? 'Edit Driver' : 'Driver Details'}</Text>
                <Text style={styles.subtitle}>
                  {isEditMode ? 'Update fleet driver information and monthly salary' : 'Register a new driver for your fleet and set monthly salary'}
                </Text>
              </View>

              <View style={styles.fields}>
                {loadingDriver ? <Text style={styles.infoText}>Loading driver details...</Text> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <FieldBox label="Full Name">
                  <TextInput
                    value={formData.name}
                    onChangeText={(text) => setFormData((p) => ({ ...p, name: text }))}
                    placeholder="Enter driver's name"
                    placeholderTextColor={colors.slate[300]}
                    style={styles.input}
                  />
                </FieldBox>

                <FieldBox icon={Phone} label="Mobile Number">
                  <TextInput
                    value={formData.mobile}
                    onChangeText={(text) => setFormData((p) => ({ ...p, mobile: text.replace(/\D/g, '') }))}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={colors.slate[300]}
                    maxLength={10}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </FieldBox>

                <FieldBox icon={Mail} label="Email Address">
                  <TextInput
                    value={formData.email}
                    onChangeText={(text) => setFormData((p) => ({ ...p, email: text }))}
                    placeholder="driver@example.com"
                    placeholderTextColor={colors.slate[300]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </FieldBox>

                <FieldBox icon={MapPin} label="Address">
                  <TextInput
                    value={formData.address}
                    onChangeText={(text) => setFormData((p) => ({ ...p, address: text }))}
                    placeholder="Full residential address"
                    placeholderTextColor={colors.slate[300]}
                    multiline
                    numberOfLines={2}
                    style={[styles.input, styles.textarea]}
                  />
                </FieldBox>

                <FieldBox icon={IndianRupee} label="Monthly Salary">
                  <TextInput
                    value={formData.salary}
                    onChangeText={(text) => setFormData((p) => ({ ...p, salary: text.replace(/[^\d.]/g, '') }))}
                    placeholder="Enter monthly salary"
                    placeholderTextColor={colors.slate[300]}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </FieldBox>

                <FieldBox label="Assigned Vehicle">
                  <SelectField
                    title="Assigned Vehicle"
                    value={formData.assignedFleetVehicleId}
                    options={vehicleOptions}
                    disabled={loadingVehicles}
                    onSelect={(value) => setFormData((p) => ({ ...p, assignedFleetVehicleId: value }))}
                  />
                  <Text style={styles.hint}>
                    {loadingVehicles ? 'Loading fleet vehicles...' : 'Only this owner\'s unassigned vehicles are shown here.'}
                  </Text>
                </FieldBox>

                <FieldBox label="Assigned Zone">
                  <SelectField
                    title="Assigned Zone"
                    value={formData.zoneId}
                    options={zoneOptions}
                    disabled={loadingZones}
                    onSelect={(value) => setFormData((p) => ({ ...p, zoneId: value }))}
                  />
                  <Text style={styles.hint}>
                    {loadingZones ? 'Loading zones...' : 'Only zones under this owner service location are shown here.'}
                  </Text>
                </FieldBox>
              </View>
            </StepIn>
          ) : null}

          {step === 2 ? (
            <StepIn key="step2" style={styles.stepBody}>
              <View style={styles.titleBlock}>
                <Text style={styles.h1}>Documents</Text>
                <Text style={styles.subtitle}>Documents asked by the admin</Text>
              </View>

              <View style={styles.docFields}>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {templatesLoading ? (
                  <Text style={styles.infoText}>Loading the document list...</Text>
                ) : (
                  <FleetDocumentFields
                    templates={documentTemplates}
                    files={formData.documents}
                    meta={documentMeta}
                    onFile={handleFileUpload}
                    onClear={clearFile}
                    onMeta={(templateId, field, value) => setDocumentMeta((prev) => ({ ...prev, [templateId]: { ...(prev[templateId] || {}), [field]: value } }))}
                  />
                )}
              </View>
            </StepIn>
          ) : null}

          {step === 3 ? (
            <StepIn key="step3" from="scale" style={styles.success}>
              <View style={styles.successIcon}>
                <SuccessIcon />
              </View>

              <View style={styles.successTexts}>
                <Text style={styles.successTitle}>Pending!</Text>
                <Text style={styles.successText}>
                  {isEditMode ? (
                    'Driver details updated successfully.'
                  ) : (
                    <>
                      {'Driver details sent to admin. Status will update in '}
                      <Text style={styles.successStrong}>5 seconds</Text>
                      {'.'}
                    </>
                  )}
                </Text>
              </View>

              <SuccessBar />
            </StepIn>
          ) : null}
        </View>
      </ScrollView>

      {step === 1 ? (
        <View style={[styles.bottomBar, bottomBarPad]}>
          <Pressable
            onPress={() => {
              if (isEditMode) {
                handleSubmit();
                return;
              }
              setStep(2);
            }}
            disabled={step1Disabled}
            style={[styles.cta, step1Ready ? styles.ctaOn : styles.ctaOff]}
          >
            <Text style={[styles.ctaText, { color: step1Ready ? colors.white : colors.slate[300] }]}>
              {isEditMode ? 'Save Driver' : 'Next: Documents'}
            </Text>
            {!isEditMode ? (
              <ChevronRight size={16} strokeWidth={3} color={step1Ready ? colors.white : colors.slate[300]} />
            ) : (
              <UserPlus size={16} strokeWidth={3} color={step1Ready ? colors.white : colors.slate[300]} />
            )}
          </Pressable>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={[styles.bottomBar, bottomBarPad]}>
          <Pressable onPress={handleSubmit} disabled={step2Disabled} style={[styles.cta, !documentError ? styles.ctaOn : styles.ctaOff]}>
            <Text style={[styles.ctaText, { color: !documentError ? colors.white : colors.slate[300] }]}>
              {submitting ? 'Submitting...' : 'Register Driver'}
            </Text>
            <UserPlus size={16} strokeWidth={3} color={!documentError ? colors.white : colors.slate[300]} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex1: { flex: 1 },
  dim: { opacity: 0.6 },
  pressed95: { transform: [{ scale: 0.95 }] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 30,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', gap: 4 },
  stepDot: { width: 24, height: 4, borderRadius: 2 },
  scroll: { paddingHorizontal: 20, paddingTop: 12 },
  main: { width: '100%', maxWidth: 384, alignSelf: 'center' },
  stepBody: { gap: 24 },
  titleBlock: { gap: 6 },
  h1: { fontSize: 24, lineHeight: 26, fontWeight: '900', letterSpacing: -0.6, textTransform: 'uppercase', color: colors.slate[900] },
  subtitle: { fontSize: 11, lineHeight: 18, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, color: alpha(colors.slate[400], 0.8) },
  fields: { gap: 16 },
  docFields: { gap: 20 },
  infoText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate[400] },
  errorText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.rose[500] },
  field: { backgroundColor: colors.slate[50], padding: 14, borderRadius: 16, ...shadow.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400] },
  input: { padding: 0, fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.slate[900] },
  textarea: { minHeight: 44, textAlignVertical: 'top' },
  hint: { marginTop: 8, fontSize: 9, lineHeight: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.9, color: colors.slate[400] },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 },
  selectText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.slate[900] },
  sheet: { maxHeight: '70%' },
  sheetTitle: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  sheetList: { flexGrow: 0 },
  sheetListContent: { paddingHorizontal: 12, paddingBottom: 16 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 12 },
  sheetOptionActive: { backgroundColor: colors.slate[50] },
  sheetOptionText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.slate[700] },
  sheetOptionTextActive: { color: colors.slate[900], fontWeight: '800' },
  success: { alignItems: 'center', justifyContent: 'center', gap: 32, paddingTop: 80 },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 40,
    backgroundColor: colors.emerald[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow['2xl'],
    shadowColor: colors.emerald[500],
    shadowOpacity: 0.2,
  },
  successTexts: { alignItems: 'center', gap: 12 },
  successTitle: { fontSize: 30, lineHeight: 36, fontWeight: '900', textTransform: 'uppercase', letterSpacing: -0.75, color: colors.slate[900], textAlign: 'center' },
  successText: {
    paddingHorizontal: 40,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.slate[400],
    textAlign: 'center',
  },
  successStrong: { color: colors.slate[900] },
  progressTrack: { width: 192, height: 6, borderRadius: 3, backgroundColor: colors.slate[100], overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.emerald[500] },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate[50],
  },
  cta: { width: '100%', height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow.lg },
  // bg-slate-900 button -> the partner button colour
  ctaOn: { backgroundColor: driverTheme.button },
  ctaOff: { backgroundColor: colors.slate[100] },
  ctaText: { fontSize: 13, lineHeight: 18, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3 },
});

export default AddDriver;
