// Web: modules/Taxi/modules/driver/pages/settings/AddVehicle.jsx — add a fleet vehicle (/taxi/owner/add-vehicle,
// /taxi/driver/add-vehicle): step 1 vehicle details + selected type preview + user card preview (map background),
// step 2 the vehicle documents asked by the admin + submission summary, step 3 "Vehicle submitted" then back to the
// fleet after 5 s. POST /drivers/fleet/vehicles.
// Native: the web's <select> opens a bottom sheet; the fixed Back / Next bar sits above the navigation bar; document
// photos are picked in FleetDocumentFields ({ uri, name, type }).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Sheet, StatusBarScrim, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, shadow } from '@/theme';
import {
  getDriverDocumentTemplates,
  getDriverVehicleTypes,
} from '../../services/registrationService';
import api from '../../../../shared/api/axiosInstance';
import {
  flattenDriverDocumentFields,
  normalizeDriverDocumentTemplates,
} from '../../utils/documentTemplates';
import { formatPlateNumber, isValidPlateNumber, PLATE_ERROR } from '../../../../shared/utils/inputFormats';

import CarIcon from '../../../../assets/icons/car.png';
import FleetDocumentFields, { buildFleetDocumentsPayload, validateFleetDocumentInputs } from '../../components/FleetDocumentFields';
import BikeIcon from '../../../../assets/icons/bike.png';
import AutoIcon from '../../../../assets/icons/auto.png';
import TruckIcon from '../../../../assets/icons/truck.png';
import EhcvIcon from '../../../../assets/icons/ehcv.png';
import HcvIcon from '../../../../assets/icons/hcv.png';
import LcvIcon from '../../../../assets/icons/LCV.png';
import McvIcon from '../../../../assets/icons/mcv.png';
import LuxuryIcon from '../../../../assets/icons/Luxury.png';
import PremiumIcon from '../../../../assets/icons/Premium.png';
import SuvIcon from '../../../../assets/icons/SUV.png';
import ScootyIcon from '../../../../assets/icons/scooty.png';
import HatchbackIcon from '../../../../assets/icons/Hatchback.png';
import BusIcon from '../../../../assets/icons/bus.png';
import MiniBusIcon from '../../../../assets/icons/mini_bus.png';
import MapBackground from '../../../../assets/map_image.jpg';

const PAGE_BG = '#f6f7fb';
const DRAFT_KEY = 'helloparth:addVehicleDraft';

const iconMap = {
  car: CarIcon,
  bike: BikeIcon,
  auto: AutoIcon,
  truck: TruckIcon,
  ehcb: EhcvIcon,
  HCV: HcvIcon,
  LCV: LcvIcon,
  MCV: McvIcon,
  Luxary: LuxuryIcon,
  premium: PremiumIcon,
  suv: SuvIcon,
  scooty: ScootyIcon,
  car_5_seater: HatchbackIcon,
  car_7_seater: SuvIcon,
  bus: BusIcon,
  mini_bus: MiniBusIcon,
};

const ICON_TYPE_ALIASES = {
  motor_bike: 'bike',
  motorbike: 'bike',
  mini_truck: 'truck',
  'mini truck': 'truck',
  loader: 'truck',
  hcv: 'HCV',
  lcv: 'LCV',
  mcv: 'MCV',
  luxary: 'Luxary',
  luxury: 'Luxary',
  scooty: 'scooty',
  'car 5 seater': 'car_5_seater',
  'car 7 seater': 'car_7_seater',
  bus: 'bus',
  'mini bus': 'mini_bus',
};

const unwrap = (response) => response?.data?.data || response?.data || response;

const getVehicleTypes = (response) => {
  const data = unwrap(response);
  return data?.vehicle_types || data?.results || (Array.isArray(data) ? data : []);
};

const normalizeIconType = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'car';
  const lower = raw.toLowerCase();
  if (ICON_TYPE_ALIASES[lower]) return ICON_TYPE_ALIASES[lower];
  const exactKey = Object.keys(iconMap).find((key) => key.toLowerCase() === lower);
  return exactKey || 'car';
};

const getVehicleTypeImage = (type = {}) =>
  type?.image ||
  type?.icon ||
  type?.map_icon ||
  iconMap[normalizeIconType(type?.icon_types || type?.icon_types_for || type?.name)] ||
  CarIcon;

const formatTransportType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'both') return 'Ride + Delivery';
  if (!normalized) return 'Taxi';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatDispatchType = (value = '') => {
  const normalized = String(value || 'normal').trim().toLowerCase();
  if (normalized === 'bidding') return 'Bidding';
  return 'Normal';
};

// web <select>: a box showing the chosen option; the options open in a bottom sheet
const SelectField = ({ value, options, onSelect, title }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.selectBox]}>
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

// framer-motion step entrance (opacity 0, y 18 -> 1, 0; success: scale 0.96 -> 1)
const StepIn = ({ children, style, scale }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);
  const transform = scale
    ? [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }]
    : [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }];
  return <Animated.View style={[style, { opacity: anim, transform }]}>{children}</Animated.View>;
};

const SuccessBadge = () => {
  const pop = useRef(new Animated.Value(0)).current;
  const ping = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(ping, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pop, ping]);
  return (
    <View style={styles.successWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.successPing,
          {
            opacity: ping.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0, 0.2] }),
            transform: [{ scale: ping.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.35, 1] }) }],
          },
        ]}
      />
      <Animated.View style={[styles.successIcon, { transform: [{ scale: pop }] }]}>
        <CheckCircle2 size={38} strokeWidth={2.5} color={colors.white} />
      </Animated.View>
    </View>
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

const Panel = ({ title, sub, children }) => (
  <View style={styles.panel}>
    <View style={styles.panelHead}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSub}>{sub}</Text>
    </View>
    {children}
  </View>
);

const TypeTile = ({ label, value, capitalize }) => (
  <View style={styles.typeTile}>
    <Text style={styles.typeTileLabel}>{label}</Text>
    <Text style={[styles.typeTileValue, capitalize && styles.capitalize]}>{value}</Text>
  </View>
);

const SummaryLine = ({ label, value }) => (
  <Text style={styles.summaryLine}>
    {`${label}: `}
    <Text style={styles.summaryStrong}>{value}</Text>
  </Text>
);

const AddVehicle = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner')
    ? '/taxi/owner'
    : '/taxi/driver';

  const [step, setStep] = useState(1);
  const scrollRef = useRef(null);
  const doneTimerRef = useRef(null);
  // Every step opens from the top (the previous step's scroll position used to stay).
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);
  useEffect(() => () => clearTimeout(doneTimerRef.current), []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // The typed details survive a refresh (document photos do not - they are picked again).
  const [formData, setFormData] = useState(() => {
    let draft = {};
    try {
      draft = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || '{}') || {};
    } catch {
      draft = {};
    }
    return {
      vehicleTypeId: draft.vehicleTypeId || '',
      make: draft.make || '',
      model: draft.model || '',
      number: draft.number || '',
      color: draft.color || '',
      documents: {},
    };
  });

  useEffect(() => {
    const { vehicleTypeId, make, model, number, color } = formData;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ vehicleTypeId, make, model, number, color }));
    } catch {
      /* storage blocked: the form just is not remembered */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.vehicleTypeId, formData.make, formData.model, formData.number, formData.color]);
  // number / expiry date typed for each document template that asks for them
  const [documentMeta, setDocumentMeta] = useState({});
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setTemplatesLoading(true);

        const [typesResponse, templatesResponse] = await Promise.all([
          getDriverVehicleTypes(),
          getDriverDocumentTemplates('fleet'),
        ]);
        if (!active) return;
        const types = getVehicleTypes(typesResponse);
        const templateResults =
          templatesResponse?.data?.data?.results ||
          templatesResponse?.data?.results ||
          [];

        setVehicleTypes(Array.isArray(types) ? types : []);
        setDocumentTemplates(normalizeDriverDocumentTemplates(templateResults));
      } catch (err) {
        if (!active) return;
        setError('Failed to load vehicle setup');
        console.error(err);
      } finally {
        if (active) setTemplatesLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, []);

  const selectedType = useMemo(
    () =>
      vehicleTypes.find(
        (type) => String(type._id || type.id) === String(formData.vehicleTypeId),
      ) || null,
    [formData.vehicleTypeId, vehicleTypes],
  );

  const canContinue =
    Boolean(formData.vehicleTypeId) &&
    Boolean(formData.make.trim()) &&
    Boolean(formData.model.trim()) &&
    isValidPlateNumber(formData.number) &&
    Boolean(formData.color.trim());

  const uploadFields = useMemo(
    () => flattenDriverDocumentFields(documentTemplates),
    [documentTemplates],
  );

  const handleFileUpload = (documentKey, file) => {
    if (file) {
      setFormData((prev) => ({
        ...prev,
        documents: {
          ...(prev.documents || {}),
          [documentKey]: file,
        },
      }));
    }
  };

  const clearDocumentFile = (documentKey) => {
    setFormData((prev) => {
      const nextDocuments = { ...(prev.documents || {}) };
      delete nextDocuments[documentKey];
      return {
        ...prev,
        documents: nextDocuments,
      };
    });
  };

  const documentError = templatesLoading
    ? 'Loading'
    : validateFleetDocumentInputs(documentTemplates, formData.documents || {}, documentMeta);
  const canSubmit = !documentError;

  const handleSubmit = async () => {
    try {
      setError('');
      setIsSubmitting(true);
      const uploadedDocuments = await buildFleetDocumentsPayload(
        documentTemplates,
        formData.documents || {},
        documentMeta,
      );

      await api.post('/drivers/fleet/vehicles', {
        vehicleTypeId: formData.vehicleTypeId,
        make: formData.make,
        model: formData.model,
        number: formData.number,
        color: formData.color,
        documents: uploadedDocuments,
      });

      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setStep(3);
      doneTimerRef.current = setTimeout(() => {
        navigate(`${routePrefix}/vehicle-fleet`);
      }, 5000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Failed to submit vehicle',
      );
      setIsSubmitting(false);
      console.error(err);
    }
  };

  const typeOptions = useMemo(
    () => [
      { value: '', label: 'Select Vehicle Type' },
      ...vehicleTypes.map((type) => ({ value: String(type._id || type.id), label: type.name || type.label || '' })),
    ],
    [vehicleTypes],
  );

  const submitReady = canSubmit && !isSubmitting;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 128 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <View style={styles.crumbs}>
            <Text style={styles.crumb}>{routePrefix === '/taxi/owner' ? 'Owner' : 'Driver'}</Text>
            <ChevronRight size={12} color={colors.slate[400]} />
            <Text style={styles.crumb}>Vehicle Fleet</Text>
            <ChevronRight size={12} color={colors.slate[400]} />
            <Text style={[styles.crumb, { color: colors.slate[700] }]}>Add Vehicle</Text>
          </View>
          <Text style={styles.title}>Add Vehicle</Text>
          <Text style={styles.sub}>
            Match the approved vehicle catalog, enter the fleet details, and upload the vehicle documents.
          </Text>
        </View>

        <View style={styles.steps}>
          {[1, 2, 3].map((item) => (
            <View
              key={item}
              style={[
                styles.stepPill,
                step >= item
                  ? { borderColor: colors.blue[200], backgroundColor: colors.blue[50] }
                  : { borderColor: colors.slate[200], backgroundColor: colors.white },
              ]}
            >
              <Text style={[styles.stepText, { color: step >= item ? colors.blue[600] : colors.slate[400] }]}>{`Step ${item}`}</Text>
            </View>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === 1 ? (
          <StepIn key="details" style={styles.column}>
            <Panel title="Vehicle Details" sub="Use the same vehicle type your drivers will operate under in the taxi system.">
              <View style={styles.panelBody}>
                <View>
                  <Text style={styles.label}>Vehicle Type *</Text>
                  <SelectField
                    title="Vehicle Type"
                    value={String(formData.vehicleTypeId || '')}
                    options={typeOptions}
                    onSelect={(value) => setFormData((prev) => ({ ...prev, vehicleTypeId: value }))}
                  />
                  <Text style={styles.helper}>{'Pick the catalog entry that matches this vehicle\'s service class.'}</Text>
                </View>

                <View>
                  <Text style={styles.label}>Vehicle Brand *</Text>
                  <TextInput
                    value={formData.make}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, make: text }))}
                    placeholder="Brand name, e.g. Honda, Hyundai, Bajaj"
                    placeholderTextColor={colors.slate[400]}
                    style={styles.input}
                  />
                </View>

                <View>
                  <Text style={styles.label}>Vehicle Model *</Text>
                  <TextInput
                    value={formData.model}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, model: text }))}
                    placeholder="Model name, e.g. Activa, Swift, RE"
                    placeholderTextColor={colors.slate[400]}
                    style={styles.input}
                  />
                </View>

                <View>
                  <Text style={styles.label}>License Plate Number *</Text>
                  <TextInput
                    value={formData.number}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, number: formatPlateNumber(text) }))}
                    placeholder="MP09AB1234"
                    placeholderTextColor={colors.slate[400]}
                    autoCapitalize="characters"
                    style={styles.input}
                  />
                  {formData.number && !isValidPlateNumber(formData.number) ? (
                    <Text style={styles.plateError}>{PLATE_ERROR}</Text>
                  ) : null}
                </View>

                <View>
                  <Text style={styles.label}>Vehicle Color *</Text>
                  <TextInput
                    value={formData.color}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, color: text }))}
                    placeholder="White"
                    placeholderTextColor={colors.slate[400]}
                    style={styles.input}
                  />
                </View>
              </View>
            </Panel>

            <Panel title="Selected Vehicle Type" sub="This mirrors the vehicle configuration your admins created.">
              {selectedType ? (
                <View style={styles.panelPad}>
                  <LinearGradient
                    colors={[colors.white, alpha(colors.blue[50], 0.4), colors.slate[50]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.typeCard}
                  >
                    <View style={styles.typeHead}>
                      <View style={styles.typeImageBox}>
                        <AppImage
                          src={getVehicleTypeImage(selectedType)}
                          fallback={CarIcon}
                          style={styles.typeImage}
                          contentFit="contain"
                          accessibilityLabel={selectedType.name || 'Vehicle type'}
                        />
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.typeName}>{selectedType.name || selectedType.label || 'Vehicle'}</Text>
                        <Text style={styles.typeDesc}>
                          {selectedType.short_description || selectedType.description || 'No short description available.'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.typeGrid}>
                      <TypeTile label="Transport" value={formatTransportType(selectedType.transport_type || selectedType.is_taxi)} />
                      <TypeTile label="Dispatch" value={formatDispatchType(selectedType.dispatch_type || selectedType.trip_dispatch_type)} />
                      <TypeTile label="Capacity" value={String(selectedType.capacity || 0)} />
                      <TypeTile label="Size" value={selectedType.size || 'Standard'} capitalize />
                    </View>

                    <View style={styles.notesBox}>
                      <View style={styles.notesHead}>
                        <Users size={16} color={colors.blue[500]} />
                        <Text style={styles.notesTitle}>Service Notes</Text>
                      </View>
                      <View style={styles.notesBody}>
                        <SummaryLine
                          label="Status"
                          value={selectedType.active !== false && Number(selectedType.status ?? 1) !== 0 ? 'Active' : 'Inactive'}
                        />
                        {selectedType.description ? <Text style={styles.summaryLine}>{selectedType.description}</Text> : null}
                      </View>
                    </View>
                  </LinearGradient>

                  <View style={styles.previewBox}>
                    <Text style={styles.previewLabel}>User Card Preview</Text>
                    <View style={styles.previewCard}>
                      <AppImage src={MapBackground} style={[StyleSheet.absoluteFill, styles.previewMap]} contentFit="cover" accessibilityLabel="Map preview" />
                      <View style={styles.previewRow}>
                        <View style={styles.previewImageBox}>
                          <AppImage
                            src={getVehicleTypeImage(selectedType)}
                            fallback={CarIcon}
                            style={styles.typeImage}
                            contentFit="contain"
                            accessibilityLabel={selectedType.name || 'Vehicle'}
                          />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.previewName}>{selectedType.name || 'Vehicle'}</Text>
                          <Text style={styles.typeDesc}>{selectedType.short_description || 'Catalog description will show here.'}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.panelPad}>
                  <View style={styles.noType}>
                    <View style={styles.noTypeIcon}>
                      <Car size={24} color={colors.blue[500]} />
                    </View>
                    <Text style={styles.noTypeTitle}>Select a vehicle type to preview it</Text>
                    <Text style={styles.noTypeText}>
                      {'You\'ll see the transport mode, dispatch type, capacity, and description before moving ahead.'}
                    </Text>
                  </View>
                </View>
              )}
            </Panel>
          </StepIn>
        ) : null}

        {step === 2 ? (
          <StepIn key="documents" style={styles.column}>
            <Panel title="Vehicle Documents" sub="Upload only the vehicle documents configured by admin in fleet document settings.">
              <View style={[styles.panelPad, styles.docGap]}>
                {templatesLoading ? (
                  <View style={styles.docState}>
                    <Text style={styles.docStateText}>Loading required fleet documents...</Text>
                  </View>
                ) : uploadFields.length === 0 ? (
                  <View style={styles.docState}>
                    <Text style={styles.docStateText}>No fleet vehicle documents are configured right now.</Text>
                  </View>
                ) : (
                  <FleetDocumentFields
                    templates={documentTemplates}
                    files={formData.documents}
                    meta={documentMeta}
                    onFile={(key, file) => handleFileUpload(key, file)}
                    onClear={clearDocumentFile}
                    onMeta={(templateId, field, value) => setDocumentMeta((prev) => ({ ...prev, [templateId]: { ...(prev[templateId] || {}), [field]: value } }))}
                  />
                )}
              </View>
            </Panel>

            <Panel title="Submission Summary" sub="Quick check before sending this vehicle for approval.">
              <View style={[styles.panelPad, styles.summaryGap]}>
                <View style={styles.notesBoxPlain}>
                  <View style={styles.notesHead}>
                    <FileText size={16} color={colors.blue[500]} />
                    <Text style={styles.notesTitle}>Vehicle Summary</Text>
                  </View>
                  <View style={styles.notesBody}>
                    <SummaryLine label="Type" value={selectedType?.name || 'Not selected'} />
                    <SummaryLine label="Brand & Model" value={[formData.make, formData.model].filter(Boolean).join(' ')} />
                    <SummaryLine label="Plate Number" value={formData.number || '-'} />
                    <SummaryLine label="Color" value={formData.color || '-'} />
                  </View>
                </View>

                <LinearGradient
                  colors={[colors.white, alpha(colors.blue[50], 0.3), colors.white]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.approvalNote}
                >
                  <Text style={styles.approvalTitle}>Approval note</Text>
                  <Text style={styles.approvalText}>
                    The vehicle will be created in pending status and shown in the fleet after submission.
                  </Text>
                </LinearGradient>

                <View style={styles.notesBoxPlain}>
                  <View style={styles.notesHead}>
                    <ShieldCheck size={16} color={colors.blue[500]} />
                    <Text style={styles.notesTitle}>Document Summary</Text>
                  </View>
                  <View style={styles.notesBody}>
                    <SummaryLine label="Configured uploads" value={String(uploadFields.length)} />
                    <SummaryLine label="Attached files" value={String(Object.keys(formData.documents || {}).length)} />
                  </View>
                </View>
              </View>
            </Panel>
          </StepIn>
        ) : null}

        {step === 3 ? (
          <StepIn key="success" scale style={styles.success}>
            <SuccessBadge />
            <Text style={styles.successTitle}>Vehicle submitted</Text>
            <Text style={styles.successText}>
              {'Your vehicle has been added and sent for approval. We\'ll take you back to the fleet page in 5 seconds.'}
            </Text>
            <SuccessBar />
          </StepIn>
        ) : null}
      </ScrollView>
      <StatusBarScrim color={PAGE_BG} />

      {step !== 3 ? (
        <View style={[styles.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.bottomRow}>
            <Pressable onPress={() => (step === 2 ? setStep(1) : navigate(-1))} style={styles.backBtn}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>

            {step === 1 ? (
              <Pressable
                onPress={() => setStep(2)}
                disabled={!canContinue}
                style={[styles.nextBtn, canContinue ? styles.nextOn : styles.nextOff]}
              >
                <Text style={[styles.nextText, { color: canContinue ? colors.white : colors.slate[400] }]}>Next: Documents</Text>
                <ChevronRight size={16} color={canContinue ? colors.white : colors.slate[400]} />
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                style={[styles.nextBtn, submitReady ? styles.nextOn : styles.nextOff]}
              >
                {isSubmitting ? (
                  <>
                    <ActivityIndicator size={16} color={colors.white} />
                    <Text style={[styles.nextText, { color: colors.slate[400] }]}>Submitting...</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.nextText, { color: submitReady ? colors.white : colors.slate[400] }]}>Submit for Approval</Text>
                    <CheckCircle2 size={16} color={submitReady ? colors.white : colors.slate[400]} />
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  flex1: { flex: 1, minWidth: 0 },
  capitalize: { textTransform: 'capitalize' },
  content: { paddingHorizontal: 16 },
  head: { marginBottom: 24 },
  crumbs: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  crumb: { fontSize: 12, lineHeight: 16, color: colors.slate[400] },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.slate[900] },
  sub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  steps: { marginBottom: 24, flexDirection: 'row', gap: 12 },
  stepPill: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  stepText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2.16, textAlign: 'center' },
  errorBox: { marginBottom: 20, borderRadius: 14, borderWidth: 1, borderColor: colors.red[200], backgroundColor: colors.red[50], paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.red[600] },
  column: { gap: 24 },
  panel: { overflow: 'hidden', borderRadius: 28, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, ...shadow.sm },
  panelHead: { borderBottomWidth: 1, borderBottomColor: colors.slate[100], paddingHorizontal: 24, paddingVertical: 20 },
  panelTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  panelSub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  panelBody: { padding: 24, gap: 20 },
  panelPad: { padding: 24 },
  docGap: { gap: 20 },
  summaryGap: { gap: 16 },
  label: { marginBottom: 8, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[700] },
  input: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate[800],
  },
  helper: { marginTop: 8, fontSize: 12, lineHeight: 16, color: colors.slate[500] },
  plateError: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.rose[600] },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.slate[800] },
  sheet: { maxHeight: '70%' },
  sheetTitle: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  sheetList: { flexGrow: 0 },
  sheetListContent: { paddingHorizontal: 12, paddingBottom: 16 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 12 },
  sheetOptionActive: { backgroundColor: colors.slate[50] },
  sheetOptionText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.slate[700] },
  sheetOptionTextActive: { color: colors.slate[900], fontWeight: '800' },
  typeCard: { borderRadius: 24, borderWidth: 1, borderColor: colors.blue[100], padding: 16, ...shadow.sm },
  typeHead: { marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  typeImageBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  typeImage: { width: 48, height: 48 },
  typeName: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  typeDesc: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  typeTile: { flexBasis: '40%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 12 },
  typeTileLabel: { fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.98, color: colors.slate[400] },
  typeTileValue: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[900] },
  notesBox: { marginTop: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 16 },
  notesBoxPlain: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 16 },
  notesHead: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[700] },
  notesBody: { gap: 8 },
  summaryLine: { fontSize: 14, lineHeight: 20, color: colors.slate[600] },
  summaryStrong: { fontWeight: '600', color: colors.slate[900] },
  previewBox: { marginTop: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.8), padding: 12 },
  previewLabel: { marginBottom: 8, fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.98, color: colors.slate[400] },
  previewCard: { overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 16 },
  previewMap: { opacity: 0.2 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  previewImageBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  previewName: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.slate[900] },
  noType: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[300],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 24,
  },
  noTypeIcon: { marginBottom: 16, width: 56, height: 56, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  noTypeTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.slate[800], textAlign: 'center' },
  noTypeText: { marginTop: 8, maxWidth: 320, fontSize: 14, lineHeight: 20, color: colors.slate[500], textAlign: 'center' },
  docState: { borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 20 },
  docStateText: { fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  approvalNote: { borderRadius: 24, borderWidth: 1, borderColor: colors.blue[100], padding: 16 },
  approvalTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[900] },
  approvalText: { marginTop: 8, fontSize: 14, lineHeight: 24, color: colors.slate[500] },
  success: {
    minHeight: 480,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    ...shadow.sm,
  },
  successWrap: { marginBottom: 24, width: 96, height: 96 },
  successPing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 28, backgroundColor: '#2563eb' },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.xl,
    shadowColor: colors.blue[200],
  },
  successTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: colors.slate[900], textAlign: 'center' },
  successText: { marginTop: 12, maxWidth: 448, fontSize: 14, lineHeight: 24, color: colors.slate[500], textAlign: 'center' },
  progressTrack: { marginTop: 32, width: 224, height: 8, borderRadius: 4, backgroundColor: colors.slate[100], overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#2563eb' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    backgroundColor: alpha(colors.white, 0.95),
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 24,
  },
  backText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[700] },
  nextBtn: { height: 56, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16 },
  nextOn: { backgroundColor: '#2563eb', ...shadow.lg, shadowColor: colors.blue[200] },
  nextOff: { backgroundColor: colors.slate[100] },
  nextText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});

export default AddVehicle;
