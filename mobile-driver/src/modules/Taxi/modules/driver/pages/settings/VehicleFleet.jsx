// Web: modules/Taxi/modules/driver/pages/settings/VehicleFleet.jsx — the driver's "My Vehicle" (/taxi/driver/vehicle-fleet
// and vehicle-fleet/edit/:vehicleId): primary vehicle card, configuration note and the "Vehicle Details" edit sheet
// (type, make, model, plate, colour, photo from gallery / camera). An owner sees OwnerVehicleFleet instead.
// Native: the edit sheet (data-driver-overlay) is a Sheet; gallery / camera pickers come from useImageUpload
// (@/lib/media pickImage). Pull-to-refresh reloads the driver and the vehicle types.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bike, Camera, Car, CheckCircle2, Edit3, ImagePlus, LoaderCircle, Save, Truck, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { AppImage, Sheet, Text, TextInput, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import {
  getCurrentDriver,
  getDriverVehicleTypes,
  updateDriverVehicle,
} from '../../services/registrationService';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import OwnerVehicleFleet from './OwnerVehicleFleet';
import CarIcon from '../../../../assets/icons/car.png';
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

const PAGE_BG = '#f8f9fb';
const unwrap = (response) => response?.data?.data || response?.data || response;
const VEHICLE_FLEET_DRAFT_KEY = 'driver_vehicle_fleet_draft';
const VEHICLE_FLEET_EDITING_KEY = 'driver_vehicle_fleet_editing';
const DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY = 'driver_vehicle_reapproval_pending';

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
  hcv: 'HCV',
  lcv: 'LCV',
  mcv: 'MCV',
  luxary: 'Luxary',
  luxury: 'Luxary',
  mini_truck: 'truck',
  scooty: 'scooty',
  'car 5 seater': 'car_5_seater',
  'car 7 seater': 'car_7_seater',
  bus: 'bus',
  'mini bus': 'mini_bus',
};

const getVehicleTypes = (response) => {
  const data = unwrap(response);
  return data?.vehicle_types || data?.results || data?.data?.results || (Array.isArray(data) ? data : []);
};

const getTypeLabel = (type) => type?.name || type?.vehicle_type || type?.label || 'Vehicle';

const normalizeIconType = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'car';
  const lower = raw.toLowerCase();
  if (ICON_TYPE_ALIASES[lower]) return ICON_TYPE_ALIASES[lower];
  const exactKey = Object.keys(iconMap).find((key) => key.toLowerCase() === lower);
  return exactKey || 'car';
};

const getVehicleTypeImage = (type = {}) => (
  type?.image
  || type?.icon
  || type?.map_icon
  || iconMap[normalizeIconType(type?.icon_types || type?.icon_types_for || type?.name)]
  || CarIcon
);

const getDriverVehicleTypeId = (driver) => {
  if (!driver?.vehicleTypeId) {
    return '';
  }

  return String(driver.vehicleTypeId?._id || driver.vehicleTypeId);
};

const iconFor = (iconType = '') => {
  const value = String(iconType).toLowerCase();

  if (value.includes('bike')) {
    return Bike;
  }

  if (value.includes('truck') || value.includes('hcv') || value.includes('lcv') || value.includes('mcv')) {
    return Truck;
  }

  return Car;
};

const buildForm = (driver) => ({
  vehicleTypeId: getDriverVehicleTypeId(driver),
  vehicleMake: driver?.vehicleMake || '',
  vehicleModel: driver?.vehicleModel || '',
  vehicleNumber: driver?.vehicleNumber || '',
  vehicleColor: driver?.vehicleColor || '',
  vehicleImage: driver?.vehicleImage || '',
});

const buildComparableVehicleSnapshot = (value = {}) => ({
  vehicleTypeId: String(value?.vehicleTypeId || ''),
  vehicleMake: String(value?.vehicleMake || '').trim(),
  vehicleModel: String(value?.vehicleModel || '').trim(),
  vehicleNumber: String(value?.vehicleNumber || '').trim().toUpperCase(),
  vehicleColor: String(value?.vehicleColor || '').trim(),
  vehicleImage: String(value?.vehicleImage || '').trim(),
});

const readVehicleFleetDraft = () => {
  try {
    const raw = sessionStorage.getItem(VEHICLE_FLEET_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const buildVisibleVehicleTypes = (allTypes, driver) => {
  const driverMode = String(driver?.registerFor || 'taxi').toLowerCase();
  const savedVehicleTypeId = getDriverVehicleTypeId(driver);

  const activeTypes = allTypes.filter((type) => {
    const isActive = type.active !== false && Number(type.status ?? 1) !== 0;
    const transportType = String(type.transport_type || type.is_taxi || 'taxi').toLowerCase();

    if (!isActive) {
      return false;
    }

    if (driverMode === 'both') {
      return true;
    }

    return transportType === driverMode || transportType === 'both' || transportType === 'all';
  });

  const activeMatchingTypes = activeTypes.length ? activeTypes : allTypes.filter((type) => type.active !== false && Number(type.status ?? 1) !== 0);

  if (!savedVehicleTypeId) {
    return activeMatchingTypes;
  }

  const savedType = allTypes.find((type) => String(type._id || type.id) === String(savedVehicleTypeId));

  if (!savedType) {
    return activeMatchingTypes;
  }

  const alreadyIncluded = activeMatchingTypes.some((type) => String(type._id || type.id) === String(savedVehicleTypeId));

  return alreadyIncluded ? activeMatchingTypes : [savedType, ...activeMatchingTypes];
};

// animate-spin
const Spin = ({ children }) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [value]);
  const rotate = value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
};

const InputBox = ({ label, style, ...inputProps }) => (
  <View style={[styles.inputBox, style]}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput placeholderTextColor={colors.slate[300]} style={styles.input} {...inputProps} />
  </View>
);

const DriverVehicleFleet = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const [driver, setDriver] = useState(null);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [formData, setFormData] = useState(buildForm(null));
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(true);
  const {
    uploading: imageUploading,
    preview: imagePreview,
    handleFileChange: onVehicleImageChange,
    setPreview: setVehicleImagePreview,
  } = useImageUpload({
    folder: 'driver-vehicles',
    onSuccess: (url) => {
      setFormData((prev) => ({ ...prev, vehicleImage: url }));
    },
  });

  const selectedType = useMemo(() => {
    const selectedId = formData.vehicleTypeId || getDriverVehicleTypeId(driver);
    return vehicleTypes.find((type) => String(type._id || type.id) === String(selectedId));
  }, [driver, formData.vehicleTypeId, vehicleTypes]);

  const ActiveIcon = iconFor(selectedType?.icon_types || driver?.vehicleIconType || driver?.vehicleType);
  const activeVehicleName = getTypeLabel(selectedType) || driver?.vehicleType || 'Vehicle';
  const vehicleModel = [driver?.vehicleMake, driver?.vehicleModel].filter(Boolean).join(' ') || activeVehicleName;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    setMessage('');

    try {
      const [driverResponse, typeResponse] = await Promise.all([
        getCurrentDriver(),
        getDriverVehicleTypes(),
      ]);

      if (!activeRef.current) {
        return;
      }

      const nextDriver = unwrap(driverResponse);
      const nextTypes = buildVisibleVehicleTypes(getVehicleTypes(typeResponse), nextDriver);

      const savedDraft = readVehicleFleetDraft();
      const wasEditing = sessionStorage.getItem(VEHICLE_FLEET_EDITING_KEY) === 'true';

      setDriver(nextDriver);
      setVehicleTypes(nextTypes);
      setFormData(savedDraft ? { ...buildForm(nextDriver), ...savedDraft } : buildForm(nextDriver));
      setVehicleImagePreview(savedDraft?.vehicleImage || nextDriver?.vehicleImage || null);
      setIsEditing(wasEditing);
    } catch (error) {
      if (activeRef.current) {
        setMessage(error.message || 'Could not load vehicle details.');
      }
    } finally {
      if (activeRef.current) {
        setIsLoading(false);
      }
    }
  }, [setVehicleImagePreview]);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load({ quiet: true });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    sessionStorage.setItem(VEHICLE_FLEET_DRAFT_KEY, JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    sessionStorage.setItem(VEHICLE_FLEET_EDITING_KEY, isEditing ? 'true' : 'false');
  }, [isEditing]);

  const handleChange = (field, value) => {
    setFormData((prev) => {
      if (field === 'vehicleTypeId' && String(prev.vehicleTypeId) !== String(value)) {
        setVehicleImagePreview(null);
        return {
          vehicleTypeId: value,
          vehicleMake: '',
          vehicleModel: '',
          vehicleNumber: '',
          vehicleColor: '',
          vehicleImage: '',
        };
      }

      return { ...prev, [field]: value };
    });
  };

  const openVehicleGalleryPicker = () => {
    if (imageUploading) {
      return;
    }

    onVehicleImageChange({ source: 'library' });
  };

  const openVehicleCameraPicker = () => {
    if (imageUploading) {
      return;
    }

    onVehicleImageChange({ source: 'camera' });
  };

  const handleSave = async () => {
    if (!formData.vehicleTypeId) {
      setMessage('Select a vehicle type first.');
      return;
    }

    const requiresReapproval =
      JSON.stringify(buildComparableVehicleSnapshot(buildForm(driver))) !==
      JSON.stringify(buildComparableVehicleSnapshot(formData));

    setIsSaving(true);
    setMessage('');

    try {
      const response = await updateDriverVehicle(formData);
      const nextDriver = unwrap(response);
      setDriver(nextDriver);
      setFormData(buildForm(nextDriver));
      setVehicleImagePreview(nextDriver?.vehicleImage || null);
      setIsEditing(false);
      if (nextDriver?.status === 'pending' || nextDriver?.approve === false || nextDriver?.vehicleApprovalRequested || requiresReapproval) {
        localStorage.setItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY, 'true');
        setMessage(response?.data?.message || 'Vehicle updated and sent to admin for approval. Driver status is now pending.');
        sessionStorage.removeItem(VEHICLE_FLEET_DRAFT_KEY);
        sessionStorage.setItem(VEHICLE_FLEET_EDITING_KEY, 'false');
        navigate('/taxi/driver/registration-status', {
          replace: true,
          state: {
            role: 'driver',
            statusReason: 'vehicle-update',
          },
        });
        return;
      }
      localStorage.removeItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY);
      setMessage(response?.data?.message || 'Vehicle updated successfully.');
      sessionStorage.removeItem(VEHICLE_FLEET_DRAFT_KEY);
      sessionStorage.setItem(VEHICLE_FLEET_EDITING_KEY, 'false');
    } catch (error) {
      setMessage(error.message || 'Could not update vehicle.');
    } finally {
      setIsSaving(false);
    }
  };

  const previewSrc = imagePreview || formData.vehicleImage;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigate('/taxi/driver/profile')} style={styles.backBtn} accessibilityLabel="Back">
          <ArrowLeft size={18} color={colors.slate[900]} />
        </Pressable>
        <Text style={styles.title}>My Vehicle</Text>
      </View>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue[600]]} tintColor={colors.blue[600]} />}
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size={28} color={colors.slate[400]} />
          </View>
        ) : (
          <View style={styles.main}>
            <View style={styles.hero}>
              <View style={styles.heroBody}>
                <View style={styles.heroTop}>
                  <View style={styles.heroTexts}>
                    <Text style={styles.heroLabel}>Primary Vehicle</Text>
                    <Text style={styles.heroModel} numberOfLines={1}>{vehicleModel}</Text>
                    <Text style={styles.heroNumber} numberOfLines={1}>{driver?.vehicleNumber || 'Number not set'}</Text>
                    <Text style={styles.heroMeta} numberOfLines={1}>{`${activeVehicleName} • ${driver?.vehicleColor || 'Color not set'}`}</Text>
                  </View>
                  {driver?.vehicleImage ? (
                    <View style={styles.heroImageBox}>
                      <AppImage src={driver.vehicleImage} style={styles.fill} contentFit="cover" accessibilityLabel="Vehicle" />
                    </View>
                  ) : (
                    <View style={styles.heroIconBox}>
                      <ActiveIcon size={26} color={colors.white} />
                    </View>
                  )}
                </View>
                <View style={styles.linkedPill}>
                  <CheckCircle2 size={15} color={colors.emerald[400]} />
                  <Text style={styles.linkedText}>Map icon linked to selected type</Text>
                </View>
              </View>
            </View>

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>Configuration</Text>
                <Pressable
                  onPress={() => {
                    setFormData(buildForm(driver));
                    setIsEditing(true);
                  }}
                  style={styles.editBtn}
                >
                  <Edit3 size={13} color={colors.blue[600]} />
                  <Text style={styles.editText}>Edit Details</Text>
                </Pressable>
              </View>

              <View style={styles.note}>
                <Text style={styles.noteTitle}>Dispatch Matching</Text>
                <Text style={styles.noteText}>
                  Update the primary vehicle here if requests are not reaching this driver. The system uses the selected vehicle type exactly for job distribution.
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <Sheet open={isEditing} onClose={() => setIsEditing(false)} style={styles.sheet}>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetHead}>
            <View>
              <Text style={styles.sectionLabel}>Settings</Text>
              <Text style={styles.sheetTitle}>Vehicle Details</Text>
            </View>
            <Pressable onPress={() => setIsEditing(false)} style={styles.closeBtn} accessibilityLabel="Close">
              <X size={22} color={colors.slate[500]} />
            </Pressable>
          </View>

          <View style={styles.formFields}>
            <View style={styles.selectionBlock}>
              <Text style={[styles.sectionLabel, styles.pl1]}>Selection</Text>
              <View style={styles.typeGrid}>
                {vehicleTypes.map((type) => {
                  const id = String(type._id || type.id);
                  const TypeIcon = iconFor(type.icon_types || type.name);
                  const selected = String(formData.vehicleTypeId) === id;
                  const typeImage = getVehicleTypeImage(type);

                  return (
                    <Pressable
                      key={id}
                      onPress={() => handleChange('vehicleTypeId', id)}
                      style={[styles.typeTile, selected ? styles.typeTileOn : styles.typeTileOff]}
                    >
                      {typeImage ? (
                        <View style={[styles.typeImageBox, { backgroundColor: selected ? alpha(colors.white, 0.14) : colors.slate[50] }]}>
                          <AppImage src={typeImage} fallback={CarIcon} style={styles.typeImage} contentFit="contain" accessibilityLabel={getTypeLabel(type)} />
                        </View>
                      ) : (
                        <TypeIcon size={20} color={selected ? colors.white : colors.slate[400]} />
                      )}
                      <Text style={[styles.typeLabel, { color: selected ? colors.white : colors.slate[400] }]}>{getTypeLabel(type)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.row2}>
              <InputBox
                label="Make"
                style={styles.flex1}
                value={formData.vehicleMake}
                onChangeText={(text) => handleChange('vehicleMake', text)}
                placeholder="e.g. Suzuki"
              />
              <InputBox
                label="Model"
                style={styles.flex1}
                value={formData.vehicleModel}
                onChangeText={(text) => handleChange('vehicleModel', text)}
                placeholder="e.g. WagonR"
              />
            </View>

            <InputBox
              label="Plate Number"
              value={formData.vehicleNumber}
              onChangeText={(text) => handleChange('vehicleNumber', text.toUpperCase())}
              placeholder="e.g. MP 09 AB 1234"
              autoCapitalize="characters"
            />

            <InputBox
              label="Color"
              value={formData.vehicleColor}
              onChangeText={(text) => handleChange('vehicleColor', text)}
              placeholder="e.g. White, Black"
            />

            <View style={styles.inputBox}>
              <Text style={[styles.inputLabel, styles.mb3]}>Vehicle Image</Text>
              <View style={styles.imageRow}>
                <View style={styles.imageBox}>
                  {previewSrc ? (
                    <AppImage src={previewSrc} style={[styles.fill, imageUploading && styles.dim]} contentFit="cover" accessibilityLabel="Vehicle" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <ActiveIcon size={22} color={colors.slate[300]} />
                    </View>
                  )}
                </View>
                <View style={styles.imageButtons}>
                  <Pressable onPress={openVehicleGalleryPicker} disabled={imageUploading} style={[styles.pickBtn, imageUploading && styles.dim]}>
                    {imageUploading ? (
                      <Spin><LoaderCircle size={16} color={colors.slate[700]} /></Spin>
                    ) : (
                      <ImagePlus size={16} color={colors.slate[700]} />
                    )}
                    <Text style={styles.pickText}>{imageUploading ? 'Uploading...' : 'Choose From Gallery'}</Text>
                  </Pressable>
                  <Pressable onPress={openVehicleCameraPicker} disabled={imageUploading} style={[styles.pickBtn, imageUploading && styles.dim]}>
                    {imageUploading ? (
                      <Spin><LoaderCircle size={16} color={colors.slate[700]} /></Spin>
                    ) : (
                      <Camera size={16} color={colors.slate[700]} />
                    )}
                    <Text style={styles.pickText}>{imageUploading ? 'Uploading...' : 'Use Camera'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <Pressable
            onPress={handleSave}
            disabled={isSaving || imageUploading}
            style={[styles.saveBtn, (isSaving || imageUploading) && styles.half]}
          >
            {isSaving || imageUploading ? (
              <Spin><LoaderCircle size={20} color={colors.white} /></Spin>
            ) : (
              <Save size={20} color={colors.white} />
            )}
            <Text style={styles.saveText}>Update Vehicle</Text>
          </Pressable>
        </ScrollView>
      </Sheet>
    </View>
  );
};

const VehicleFleet = () => {
  const [isOwner] = useState(() => String(localStorage.getItem('role') || 'driver').toLowerCase() === 'owner');
  return isOwner ? <OwnerVehicleFleet /> : <DriverVehicleFleet />;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  flex1: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  dim: { opacity: 0.6 },
  half: { opacity: 0.5 },
  pl1: { paddingLeft: 4 },
  mb3: { marginBottom: 12 },
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
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.slate[900] },
  content: { paddingHorizontal: 24, paddingTop: 24 },
  loading: { minHeight: 420, alignItems: 'center', justifyContent: 'center' },
  main: { gap: 24 },
  hero: {
    backgroundColor: colors.slate[900],
    padding: 28,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.05),
    ...shadow.xl,
  },
  heroBody: { gap: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  heroTexts: { flex: 1, minWidth: 0, gap: 6 },
  heroLabel: { fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, color: alpha(colors.white, 0.4) },
  heroModel: { fontSize: 22, lineHeight: 24, fontWeight: '700', letterSpacing: -0.55, color: colors.white },
  heroNumber: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', color: alpha(colors.white, 0.5) },
  heroMeta: { fontSize: 11, lineHeight: 15, fontWeight: '500', color: alpha(colors.white, 0.3) },
  heroImageBox: {
    width: 80,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    backgroundColor: alpha(colors.white, 0.05),
    flexShrink: 0,
    ...shadow.lg,
  },
  heroIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: alpha(colors.white, 0.05),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...shadow.lg,
  },
  linkedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: alpha(colors.emerald[500], 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.emerald[500], 0.2),
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  linkedText: { fontSize: 11, lineHeight: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.55, color: colors.emerald[400] },
  message: { paddingHorizontal: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[500] },
  section: { gap: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionLabel: { fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[400] },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.blue[50], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  editText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.blue[600] },
  note: { backgroundColor: alpha(colors.amber[50], 0.5), borderWidth: 1, borderColor: alpha(colors.amber[100], 0.5), borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16 },
  noteTitle: { marginBottom: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.55, color: colors.amber[600] },
  noteText: { fontSize: 12, lineHeight: 19, fontWeight: '500', color: colors.slate[500] },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 40, borderTopRightRadius: 40, backgroundColor: colors.white, ...shadow['2xl'] },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { padding: 24, paddingBottom: 40, gap: 24 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.slate[900] },
  closeBtn: { width: 40, height: 40, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  formFields: { gap: 16 },
  selectionBlock: { gap: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  typeTile: {
    width: '30.5%',
    flexGrow: 0,
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
  },
  // bg-slate-950 button -> the partner button colour
  typeTileOn: { backgroundColor: driverTheme.button, borderColor: colors.slate[950], ...shadow.xl },
  typeTileOff: { backgroundColor: colors.white, borderColor: colors.slate[100] },
  typeImageBox: { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  typeImage: { width: 32, height: 32 },
  typeLabel: { fontSize: 10, lineHeight: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  row2: { flexDirection: 'row', gap: 16 },
  inputBox: { backgroundColor: colors.slate[50], borderWidth: 1, borderColor: colors.slate[200], padding: 16, borderRadius: 16 },
  inputLabel: { marginBottom: 4, fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[500] },
  input: { padding: 0, fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.slate[900] },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imageBox: {
    width: 80,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    flexShrink: 0,
    ...shadow.sm,
  },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageButtons: { flex: 1, gap: 8 },
  pickBtn: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  pickText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[700] },
  // bg-slate-950 button -> the partner button colour
  saveBtn: {
    width: '100%',
    height: 64,
    backgroundColor: driverTheme.button,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    ...shadow.xl,
  },
  saveText: { fontSize: 14, lineHeight: 20, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4, color: colors.white },
});

export default VehicleFleet;
