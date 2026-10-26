// Web: modules/Taxi/modules/driver/pages/settings/OwnerVehicleFleet.jsx — the owner's "My Vehicles" list (primary +
// fleet vehicles with status / verification / rejection notes, edit, delete with confirm) and, on
// vehicle-fleet/edit/:vehicleId, the "Edit Vehicle" form (details, selected type preview, edit summary, documents).
// Native: a kept-alive bottom-bar tab on /taxi/owner/vehicle-fleet (driverTabPages.js) and an ordinary page on
// /taxi/owner/vehicle-fleet/edit/:vehicleId. The web loaded the list on every visit (mount); here it is loaded again each
// time the tab becomes active, keeping the last list on screen meanwhile. Pull-to-refresh reloads it. The web's <select>
// opens a bottom sheet; the delete confirm (data-driver-overlay) is a Dialog. The edit page is its own screen here, so
// after "Save Changes" it hands its success message to the list it returns to (navigation state).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Bike,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileText,
  Plus,
  Trash2,
  Truck,
  AlertCircle,
  Users,
} from 'lucide-react-native';
import { useLocation, useNavigate, useParams } from '@/lib/router';
import { AppImage, Dialog, Sheet, StatusBarScrim, Text, TextInput, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, shadow } from '@/theme';
import {
  getCurrentDriver,
  getDriverDocumentTemplates,
  getDriverVehicleTypes,
  deleteDriverVehicle,
  getOwnerFleetVehicles,
  updateOwnerFleetVehicle,
  deleteOwnerFleetVehicle,
} from '../../services/registrationService';
import { normalizeDriverDocumentTemplates } from '../../utils/documentTemplates';
import FleetDocumentFields, {
  buildFleetDocumentsPayload,
  readSavedDocumentMeta,
  validateFleetDocumentInputs,
} from '../../components/FleetDocumentFields';
import { useDriverTabActive } from '../../driverTabPages';

const unwrap = (response) => response?.data?.data || response?.data || response;

const getVehicleTypes = (response) => {
  const data = unwrap(response);
  return (
    data?.vehicle_types || data?.results || (Array.isArray(data) ? data : [])
  );
};

const getTypeLabel = (type) =>
  type?.name || type?.vehicle_type || type?.label || 'Vehicle';

const getVehicleReason = (vehicle = {}) =>
  String(
    vehicle?.reason ||
      vehicle?.rejection_reason ||
      vehicle?.rejectionReason ||
      vehicle?.comment ||
      vehicle?.admin_comment ||
      '',
  ).trim();

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

const isReverificationPending = (vehicle = {}) => {
  if (String(vehicle.status || '').toLowerCase() !== 'pending') {
    return false;
  }

  const createdAt = new Date(vehicle.createdAt || 0).getTime();
  const updatedAt = new Date(vehicle.updatedAt || 0).getTime();

  return Boolean(createdAt && updatedAt && updatedAt > createdAt);
};

const iconFor = (iconType = '') => {
  const value = String(iconType).toLowerCase();
  if (value.includes('bike')) return Bike;
  if (
    value.includes('truck') ||
    value.includes('hcv') ||
    value.includes('lcv') ||
    value.includes('mcv')
  ) {
    return Truck;
  }
  return Car;
};

const EMPTY_FORM = {
  vehicleTypeId: '',
  vehicleMake: '',
  vehicleModel: '',
  vehicleNumber: '',
  vehicleColor: '',
  rcFile: null,
  existingRcUrl: '',
};

const mapVehicles = (driver, fleetVehicles) => {
  // Combine primary vehicle with fleet vehicles
  const allVehicles = [];

  // Add primary vehicle
  if (driver?.vehicleNumber) {
    allVehicles.push({
      _id: driver._id,
      vehicleTypeId: driver.vehicleTypeId,
      vehicleMake: driver.vehicleMake,
      vehicleModel: driver.vehicleModel,
      vehicleNumber: driver.vehicleNumber,
      vehicleColor: driver.vehicleColor,
      vehicleImage: driver.vehicleImage,
      isPrimary: true,
      status: 'active',
    });
  }

  // Add fleet vehicles
  if (Array.isArray(fleetVehicles)) {
    fleetVehicles.forEach((fleetVehicle) => {
      allVehicles.push({
        _id: fleetVehicle._id || fleetVehicle.id,
        vehicleTypeId: fleetVehicle.vehicle_type_id,
        vehicleMake: fleetVehicle.car_brand,
        vehicleModel: fleetVehicle.car_model,
        vehicleNumber: fleetVehicle.license_plate_number,
        vehicleColor: fleetVehicle.car_color,
        vehicleImage: '',
        isPrimary: false,
        status: fleetVehicle.status || 'pending',
        reason: getVehicleReason(fleetVehicle),
        documents: fleetVehicle.documents || {},
        rcDocument:
          fleetVehicle.rc_document ||
          fleetVehicle.documents?.rc ||
          fleetVehicle.documents?.document ||
          fleetVehicle.documents?.file ||
          '',
        createdAt: fleetVehicle.createdAt,
        updatedAt: fleetVehicle.updatedAt,
        isFleetVehicle: true,
      });
    });
  }
  return allVehicles;
};

// web <select>: a box showing the chosen option; the options open in a bottom sheet
const SelectField = ({ value, options, onSelect, title, style }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.selectBox, style]}>
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

// animate-pulse dot
const PulseDot = ({ color }) => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.badgeDot, { backgroundColor: color, opacity }]} />;
};

const Badge = ({ bg, fg, dot, label, pulse }) => (
  <View style={[styles.badge, { backgroundColor: bg }]}>
    {pulse ? <PulseDot color={dot} /> : <View style={[styles.badgeDot, { backgroundColor: dot }]} />}
    <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
  </View>
);

const SummaryLine = ({ label, value, capitalize }) => (
  <Text style={styles.summaryLine}>
    {`${label}: `}
    <Text style={[styles.summaryStrong, capitalize && styles.capitalize]}>{value}</Text>
  </Text>
);

const TypeTile = ({ label, value, capitalize }) => (
  <View style={styles.typeTile}>
    <Text style={styles.typeTileLabel}>{label}</Text>
    <Text style={[styles.typeTileValue, capitalize && styles.capitalize]}>{value}</Text>
  </View>
);

const OwnerVehicleFleet = () => {
  const tabScrollRef = useRef(null);
  useTabScrollTop(tabScrollRef);
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const tabActive = useDriverTabActive();
  const { vehicleId } = useParams();
  const routePrefix = useMemo(
    () =>
      location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver',
    [location.pathname],
  );
  const vehicleFleetRoute = `${routePrefix}/vehicle-fleet`;
  const [vehicles, setVehicles] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  // Vehicle papers asked by the admin (Fleet Needed Documents). New files / number / expiry typed while editing:
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [docFiles, setDocFiles] = useState({});
  const [docMeta, setDocMeta] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const messageTimerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(messageTimerRef.current);
    };
  }, []);

  const clearMessageLater = () => {
    clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setMessage('');
    }, 3000);
  };

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    setMessage('');

    try {
      const [driverResponse, typeResponse, fleetResponse] = await Promise.all(
        [
          getCurrentDriver(),
          getDriverVehicleTypes(),
          getOwnerFleetVehicles(),
        ],
      );

      if (!mountedRef.current) return;

      const driver = unwrap(driverResponse);
      const types = getVehicleTypes(typeResponse);
      const fleetData = unwrap(fleetResponse);
      const fleetVehicles = fleetData?.results || [];

      setVehicleTypes(types);
      setVehicles(mapVehicles(driver, fleetVehicles));
      loadedRef.current = true;
    } catch (error) {
      if (mountedRef.current) {
        setMessage(error.message || 'Could not load vehicles.');
        setMessageType('error');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // web: on mount (every visit) -> here: every time the tab is shown (the last list stays while it reloads)
  useEffect(() => {
    if (!tabActive) return;
    load({ quiet: loadedRef.current });
  }, [tabActive, load]);

  // the message the edit page handed back after saving (web: same screen, the message stayed)
  const flash = location.state?.fleetFlash;
  useEffect(() => {
    if (!tabActive || !flash?.message || isLoading) return;
    setMessage(flash.message);
    setMessageType(flash.type || 'success');
    clearMessageLater();
  }, [flash, tabActive, isLoading]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load({ quiet: true });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    getDriverDocumentTemplates('fleet')
      .then((response) => {
        if (!active) return;
        const results = response?.data?.data?.results || response?.data?.results || [];
        setDocumentTemplates(normalizeDriverDocumentTemplates(results));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // opening a vehicle: the saved number / expiry of every document is put into the form
  useEffect(() => {
    if (!editingVehicle) {
      setDocFiles({});
      setDocMeta({});
      return;
    }
    setDocFiles({});
    setDocMeta(
      Object.fromEntries(
        documentTemplates.map((template) => [template.id, readSavedDocumentMeta(editingVehicle.documents || {}, template)]),
      ),
    );
  }, [editingVehicle, documentTemplates]);

  const editableTemplates = useMemo(
    () => documentTemplates.filter((template) => template.is_editable !== false),
    [documentTemplates],
  );
  const documentError = editingVehicle
    ? validateFleetDocumentInputs(editableTemplates, docFiles, docMeta, editingVehicle.documents || {})
    : '';

  const selectedType = useMemo(() => {
    return vehicleTypes.find(
      (type) => String(type._id || type.id) === String(formData.vehicleTypeId),
    );
  }, [formData.vehicleTypeId, vehicleTypes]);

  const ActiveIcon = iconFor(selectedType?.icon_types || selectedType?.name);
  const canSave =
    Boolean(formData.vehicleTypeId) &&
    Boolean(String(formData.vehicleMake || '').trim()) &&
    Boolean(String(formData.vehicleModel || '').trim()) &&
    Boolean(String(formData.vehicleNumber || '').trim()) &&
    Boolean(String(formData.vehicleColor || '').trim());

  const resetEditForm = () => {
    setEditingVehicle(null);
    setFormData(EMPTY_FORM);
  };

  const openEditor = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      vehicleTypeId: String(
        vehicle.vehicleTypeId?._id || vehicle.vehicleTypeId || '',
      ),
      vehicleMake: vehicle.vehicleMake || '',
      vehicleModel: vehicle.vehicleModel || '',
      vehicleNumber: vehicle.vehicleNumber || '',
      vehicleColor: vehicle.vehicleColor || '',
      rcFile: null,
      existingRcUrl: vehicle.rcDocument || '',
    });
    setIsEditing(true);
  };

  const closeEditor = (syncRoute = true, fleetFlash = null) => {
    setIsEditing(false);
    resetEditForm();

    if (syncRoute && vehicleId) {
      navigate(vehicleFleetRoute, { replace: true, state: fleetFlash ? { fleetFlash } : undefined });
    }
  };

  const handleEdit = (vehicle) => {
    if (!vehicle?._id) {
      openEditor(vehicle);
      return;
    }

    navigate(`${vehicleFleetRoute}/edit/${vehicle._id}`);
  };

  useEffect(() => {
    if (isLoading || !tabActive) {
      return;
    }

    if (!vehicleId) {
      if (isEditing || editingVehicle) {
        setIsEditing(false);
        resetEditForm();
      }
      return;
    }

    const matchedVehicle = vehicles.find(
      (vehicle) => String(vehicle._id) === String(vehicleId),
    );

    if (!matchedVehicle) {
      setMessage('That vehicle could not be found.');
      setMessageType('error');
      navigate(vehicleFleetRoute, {
        replace: true,
        state: { fleetFlash: { message: 'That vehicle could not be found.', type: 'error' } },
      });
      return;
    }

    if (String(editingVehicle?._id) !== String(matchedVehicle._id) || !isEditing) {
      openEditor(matchedVehicle);
    }
  }, [
    editingVehicle,
    isEditing,
    isLoading,
    navigate,
    tabActive,
    vehicleFleetRoute,
    vehicleId,
    vehicles,
  ]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.vehicleTypeId) {
      setMessage('Select a vehicle type first.');
      setMessageType('error');
      return;
    }
    if (documentError) {
      setMessage(documentError);
      setMessageType('error');
      return;
    }

    setIsSaving(true);
    setMessage('');
    const wasRejected =
      String(editingVehicle?.status || '').toLowerCase() === 'rejected';

    try {
      // only the papers the admin allows to be edited are sent; the rest of the saved ones stay as they are
      const savedDocuments = editingVehicle.documents || {};
      const sentDocuments = await buildFleetDocumentsPayload(editableTemplates, docFiles, docMeta, savedDocuments);

      const response = await updateOwnerFleetVehicle(editingVehicle._id, {
        vehicleTypeId: formData.vehicleTypeId,
        vehicleMake: formData.vehicleMake,
        vehicleModel: formData.vehicleModel,
        vehicleNumber: formData.vehicleNumber,
        vehicleColor: formData.vehicleColor,
        documents: sentDocuments,
      });
      const updated = unwrap(response);

      // Update the vehicle in the list, preserving fleet vehicle status
      setVehicles((prev) =>
        prev.map((v) =>
          v._id === editingVehicle._id
            ? {
                ...v,
                vehicleTypeId: updated.vehicle_type_id || formData.vehicleTypeId,
                vehicleMake: updated.car_brand || formData.vehicleMake,
                vehicleModel: updated.car_model || formData.vehicleModel,
                vehicleNumber: updated.license_plate_number || formData.vehicleNumber,
                vehicleColor: updated.car_color || formData.vehicleColor,
                vehicleImage: updated.vehicleImage || v.vehicleImage,
                // Preserve immutable properties
                isPrimary: v.isPrimary,
                status: updated.status || v.status,
                reason:
                  updated.status === 'pending'
                    ? ''
                    : getVehicleReason(updated) || v.reason || '',
                documents: updated.documents || v.documents || {},
                rcDocument:
                  updated.rc_document ||
                  updated.documents?.rc ||
                  v.rcDocument ||
                  '',
                createdAt: updated.createdAt || v.createdAt,
                updatedAt: updated.updatedAt || v.updatedAt,
                isFleetVehicle: v.isFleetVehicle,
              }
            : v,
        ),
      );

      const doneMessage = wasRejected
        ? 'Corrections saved. The vehicle has been sent again for verification.'
        : 'Vehicle updated successfully.';
      closeEditor(true, { message: doneMessage, type: 'success', at: Date.now() });
      setMessage(doneMessage);
      setMessageType('success');
      clearMessageLater();
    } catch (error) {
      setMessage(error.message || 'Could not update vehicle.');
      setMessageType('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (vehicle) => {
    setDeleteConfirm(null);

    if (vehicles.length === 1) {
      setMessage('Cannot delete the last vehicle. Add another vehicle first.');
      setMessageType('error');
      return;
    }

    try {
      // Use appropriate delete function based on vehicle type
      if (vehicle.isFleetVehicle) {
        await deleteOwnerFleetVehicle(vehicle._id);
      } else {
        await deleteDriverVehicle(vehicle._id);
      }
      setVehicles((prev) => prev.filter((v) => v._id !== vehicle._id));
      setMessage('Vehicle deleted successfully.');
      setMessageType('success');
      clearMessageLater();
    } catch (error) {
      setMessage(error.message || 'Could not delete vehicle.');
      setMessageType('error');
    }
  };

  const handleAddFleetVehicle = () => {
    navigate(`${routePrefix}/add-vehicle`);
  };

  const typeOptions = useMemo(
    () => [
      { value: '', label: 'Select Vehicle Type' },
      ...vehicleTypes.map((type) => ({ value: String(type._id || type.id), label: type.name || type.label || '' })),
    ],
    [vehicleTypes],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingPage}>
        {tabActive ? <StatusBar style="dark" /> : null}
        <ActivityIndicator size={32} color={colors.blue[600]} />
      </View>
    );
  }

  if (isEditing && editingVehicle) {
    const rejectionReason =
      String(editingVehicle.status || '').toLowerCase() === 'rejected'
        ? getVehicleReason(editingVehicle) || 'Rejected without a reason.'
        : '';

    return (
      <View style={styles.editRoot}>
        {tabActive ? <StatusBar style="dark" /> : null}
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={[styles.editContent, { paddingTop: insets.top + 16, paddingBottom: bottomSpace }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.editHead}>
            <View style={styles.flex1}>
              <View style={styles.crumbs}>
                <Text style={styles.crumb}>{routePrefix === '/taxi/owner' ? 'Owner' : 'Driver'}</Text>
                <ChevronRight size={12} color={colors.slate[400]} />
                <Text style={styles.crumb}>Vehicle Fleet</Text>
                <ChevronRight size={12} color={colors.slate[400]} />
                <Text style={[styles.crumb, { color: colors.slate[700] }]}>Edit Vehicle</Text>
              </View>
              <Text style={styles.editTitle}>Edit Vehicle</Text>
              <Text style={styles.editSub}>Update this fleet vehicle using the same structured form as the add vehicle flow.</Text>
            </View>
            <Pressable onPress={() => closeEditor()} style={styles.backPill}>
              <ArrowLeft size={16} color={colors.slate[700]} />
              <Text style={styles.backPillText}>Back</Text>
            </Pressable>
          </View>

          {message ? (
            <View
              style={[
                styles.editMessage,
                messageType === 'error'
                  ? { borderColor: colors.red[200], backgroundColor: colors.red[50] }
                  : { borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] },
              ]}
            >
              <Text style={[styles.editMessageText, { color: messageType === 'error' ? colors.red[600] : colors.emerald[700] }]}>{message}</Text>
            </View>
          ) : null}

          {rejectionReason ? (
            <View style={styles.rejectBox}>
              <Text style={styles.rejectTitle}>Rejection Reason</Text>
              <Text style={styles.rejectText}>{rejectionReason}</Text>
            </View>
          ) : null}

          <View style={styles.editColumns}>
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Vehicle Details</Text>
                <Text style={styles.panelSub}>Adjust the fleet vehicle details and keep them aligned with the approved catalog.</Text>
              </View>

              <View style={styles.panelBody}>
                <View>
                  <Text style={styles.label}>Vehicle Type *</Text>
                  <SelectField
                    title="Vehicle Type"
                    value={String(formData.vehicleTypeId || '')}
                    options={typeOptions}
                    onSelect={(value) => handleChange('vehicleTypeId', value)}
                  />
                  <Text style={styles.helper}>Pick the same service class this vehicle should run under.</Text>
                </View>

                <View>
                  <Text style={styles.label}>Vehicle Brand *</Text>
                  <TextInput
                    value={formData.vehicleMake}
                    onChangeText={(text) => handleChange('vehicleMake', text)}
                    placeholder="Brand name, e.g. Honda, Hyundai, Bajaj"
                    placeholderTextColor={colors.slate[400]}
                    style={styles.input}
                  />
                </View>

                <View>
                  <Text style={styles.label}>Vehicle Model *</Text>
                  <TextInput
                    value={formData.vehicleModel}
                    onChangeText={(text) => handleChange('vehicleModel', text)}
                    placeholder="Model name, e.g. Activa, Swift, RE"
                    placeholderTextColor={colors.slate[400]}
                    style={styles.input}
                  />
                </View>

                <View>
                  <Text style={styles.label}>License Plate Number *</Text>
                  <TextInput
                    value={formData.vehicleNumber}
                    onChangeText={(text) => handleChange('vehicleNumber', text.toUpperCase())}
                    placeholder="MP09AB1234"
                    placeholderTextColor={colors.slate[400]}
                    autoCapitalize="characters"
                    style={styles.input}
                  />
                </View>

                <View>
                  <Text style={styles.label}>Vehicle Color *</Text>
                  <TextInput
                    value={formData.vehicleColor}
                    onChangeText={(text) => handleChange('vehicleColor', text)}
                    placeholder="White"
                    placeholderTextColor={colors.slate[400]}
                    style={styles.input}
                  />
                </View>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Selected Vehicle Type</Text>
                <Text style={styles.panelSub}>This mirrors the current admin vehicle type setup for this fleet entry.</Text>
              </View>

              {selectedType ? (
                <View style={styles.panelPad}>
                  <LinearGradient
                    colors={[colors.white, alpha(colors.blue[50], 0.4), colors.slate[50]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.typeCard}
                  >
                    <View style={styles.typeHead}>
                      <View style={styles.typeIconBox}>
                        <ActiveIcon size={30} color={colors.blue[500]} />
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

                  <View style={[styles.notesBox, styles.summaryBox]}>
                    <View style={styles.notesHead}>
                      <FileText size={16} color={colors.blue[500]} />
                      <Text style={styles.notesTitle}>Edit Summary</Text>
                    </View>
                    <View style={styles.notesBody}>
                      <SummaryLine label="Brand & Model" value={[formData.vehicleMake, formData.vehicleModel].filter(Boolean).join(' ')} />
                      <SummaryLine label="Plate Number" value={formData.vehicleNumber || '-'} />
                      <SummaryLine label="Color" value={formData.vehicleColor || '-'} />
                      <SummaryLine label="Current Status" value={editingVehicle.status || 'pending'} capitalize />
                      <SummaryLine
                        label="Documents"
                        value={`${Object.keys(editingVehicle.documents || {}).length} saved${Object.keys(docFiles).length ? `, ${Object.keys(docFiles).length} being replaced` : ''}`}
                      />
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
                    <Text style={styles.noTypeText}>{'You\'ll see the transport mode, dispatch type, capacity, and service notes here.'}</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Vehicle Documents</Text>
                <Text style={styles.panelSub}>Review the saved papers and replace or update the ones the admin allows to be edited.</Text>
              </View>

              <View style={styles.panelPad}>
                <FleetDocumentFields
                  lockUneditable
                  templates={documentTemplates}
                  files={docFiles}
                  existing={editingVehicle.documents || {}}
                  meta={docMeta}
                  onFile={(key, file) => setDocFiles((prev) => ({ ...prev, [key]: file }))}
                  onClear={(key) =>
                    setDocFiles((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    })
                  }
                  onMeta={(templateId, field, value) =>
                    setDocMeta((prev) => ({ ...prev, [templateId]: { ...(prev[templateId] || {}), [field]: value } }))
                  }
                />
              </View>
            </View>

            <View style={styles.editButtons}>
              <Pressable onPress={() => closeEditor()} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!canSave || isSaving}
                style={[styles.saveBtn, (!canSave || isSaving) && styles.dim]}
              >
                <Text style={styles.saveText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
        <StatusBarScrim color="#f6f7fb" />
      </View>
    );
  }

  const listHeader = (
    <View>
      {/* Message Alert */}
      {message ? (
        <View
          style={[
            styles.alert,
            messageType === 'error'
              ? { backgroundColor: colors.red[50], borderColor: colors.red[200] }
              : { backgroundColor: colors.green[50], borderColor: colors.green[200] },
          ]}
        >
          <AlertCircle size={18} color={messageType === 'error' ? colors.red[700] : colors.green[700]} />
          <Text style={[styles.alertText, { color: messageType === 'error' ? colors.red[700] : colors.green[700] }]}>{message}</Text>
        </View>
      ) : null}
    </View>
  );

  const listEmpty = (
    <View style={styles.emptyCard}>
      <Car size={48} color={colors.gray[300]} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>No vehicles yet</Text>
      <Text style={styles.emptyText}>
        No fleet vehicles are available right now. Add your first fleet vehicle so it can go into admin verification.
      </Text>
      <Pressable onPress={handleAddFleetVehicle} style={[styles.addBtn, styles.emptyAdd]}>
        <Plus size={16} color={colors.white} />
        <Text style={styles.addText}>Add Fleet Vehicle</Text>
      </Pressable>
    </View>
  );

  const renderVehicle = ({ item: vehicle }) => {
    const matchedType = vehicleTypes.find(
      (t) => String(t._id || t.id) === String(vehicle.vehicleTypeId?._id || vehicle.vehicleTypeId),
    );
    const VehicleIcon = iconFor(matchedType?.icon_types || 'car');
    const vehicleTypeLabel = getTypeLabel(matchedType);
    const rejectionReason =
      String(vehicle.status || '').toLowerCase() === 'rejected'
        ? getVehicleReason(vehicle) || 'Rejected without a reason.'
        : '';
    const reverificationPending = isReverificationPending(vehicle);
    const pendingLabel = reverificationPending ? 'Re-verify Pending' : 'Pending';

    return (
      <View style={styles.vehicleCard}>
        {/* Vehicle Icon */}
        <LinearGradient colors={[colors.blue[50], colors.blue[50]]} style={styles.vehicleIcon}>
          {vehicle.vehicleImage ? (
            <AppImage src={vehicle.vehicleImage} style={styles.vehicleImage} contentFit="cover" accessibilityLabel={vehicle.vehicleNumber} />
          ) : (
            <VehicleIcon size={28} color={colors.blue[400]} />
          )}
        </LinearGradient>

        {/* Vehicle Info */}
        <View style={styles.flex1}>
          <View style={styles.vehicleTitleRow}>
            <Text style={styles.vehicleTitle} numberOfLines={1}>{`${vehicle.vehicleMake || ''} ${vehicle.vehicleModel || ''}`}</Text>
            {vehicle.isPrimary ? <Badge bg={colors.emerald[50]} fg={colors.emerald[700]} dot={colors.emerald[600]} label="Primary" /> : null}
            {vehicle.isFleetVehicle && vehicle.status === 'pending' ? (
              <Badge bg={colors.yellow[50]} fg={colors.yellow[700]} dot={colors.yellow[600]} label={pendingLabel} pulse />
            ) : null}
            {vehicle.isFleetVehicle && vehicle.status === 'approved' ? (
              <Badge bg={colors.emerald[50]} fg={colors.emerald[700]} dot={colors.emerald[600]} label="Approved" />
            ) : null}
            {vehicle.isFleetVehicle && vehicle.status === 'rejected' ? (
              <Badge bg={colors.red[50]} fg={colors.red[700]} dot={colors.red[600]} label="Rejected" />
            ) : null}
          </View>

          <View style={styles.vehicleLines}>
            <Text style={styles.vehicleLine}>
              {'Type: '}
              <Text style={styles.vehicleLineStrong}>{vehicleTypeLabel}</Text>
            </Text>
            <Text style={styles.vehicleLine}>
              {'Plate: '}
              <Text style={styles.vehicleLineStrong}>{vehicle.vehicleNumber}</Text>
            </Text>
            <Text style={styles.vehicleLine}>
              {'Color: '}
              <Text style={[styles.vehicleLineStrong, styles.capitalize]}>{vehicle.vehicleColor}</Text>
            </Text>
          </View>
          {vehicle.isFleetVehicle && vehicle.status === 'pending' ? (
            <View style={styles.pendingBox}>
              <Text style={styles.pendingTitle}>{reverificationPending ? 'Re-Verification' : 'Verification Pending'}</Text>
              <Text style={styles.pendingText}>
                {reverificationPending
                  ? 'Corrections were submitted and this vehicle is back in the admin review queue.'
                  : 'This vehicle is waiting for admin approval before it becomes active.'}
              </Text>
            </View>
          ) : null}
          {rejectionReason ? (
            <View style={styles.rejectSmall}>
              <Text style={styles.rejectTitle}>Rejection Reason</Text>
              <Text style={styles.rejectSmallText}>{rejectionReason}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        <View style={styles.vehicleActions}>
          <Pressable
            onPress={() => handleEdit(vehicle)}
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.blue[50] }, pressed && styles.pressed95]}
            accessibilityLabel="Edit vehicle"
          >
            <Edit3 size={16} color={colors.blue[600]} />
          </Pressable>
          <Pressable
            onPress={() => setDeleteConfirm(vehicle)}
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.red[50] }, pressed && styles.pressed95]}
            accessibilityLabel="Delete vehicle"
          >
            <Trash2 size={16} color={colors.red[600]} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.flex1}>
      {tabActive ? <StatusBar style="dark" /> : null}
      <LinearGradient colors={[colors.slate[50], colors.blue[50]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Header */}
      <View style={[styles.listHeader, { paddingTop: insets.top }]}>
        <View style={styles.listHeaderInner}>
          <View style={styles.listHeaderLeft}>
            <Pressable
              onPress={() => navigate(`${routePrefix}/profile`)}
              style={({ pressed }) => [styles.headerBack, pressed && styles.pressed95]}
              accessibilityLabel="Back"
            >
              <ArrowLeft size={16} color={colors.blue[600]} />
            </Pressable>
            <View style={styles.flex1}>
              <View style={styles.titleRow}>
                <Text style={styles.listTitle}>My Vehicles</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{vehicles.length}</Text>
                </View>
              </View>
              <Text style={styles.listSub}>Manage your fleet</Text>
            </View>
          </View>
          {vehicles.length > 0 ? (
            <Pressable onPress={handleAddFleetVehicle} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed97]}>
              <Plus size={16} color={colors.white} />
              <Text style={styles.addText}>Add Vehicle</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList ref={tabScrollRef}
        data={vehicles}
        keyExtractor={(item, index) => String(item._id || `vehicle-${index}`)}
        renderItem={renderVehicle}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue[600]]} tintColor={colors.blue[600]} />}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={Boolean(deleteConfirm) && tabActive} onClose={() => setDeleteConfirm(null)} style={styles.confirm}>
        <View style={styles.confirmInner}>
          <View style={styles.confirmIcon}>
            <AlertCircle size={32} color={colors.red[600]} strokeWidth={1.5} />
          </View>
          <Text style={styles.confirmTitle}>Delete Vehicle?</Text>
          <Text style={styles.confirmText}>Are you sure? This action cannot be undone.</Text>
          <View style={styles.confirmButtons}>
            <Pressable onPress={() => setDeleteConfirm(null)} style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed98]}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => handleDelete(deleteConfirm)} style={({ pressed }) => [styles.confirmDelete, pressed && styles.pressed98]}>
              <Text style={styles.confirmDeleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </Dialog>
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  capitalize: { textTransform: 'capitalize' },
  dim: { opacity: 0.6 },
  pressed95: { transform: [{ scale: 0.95 }] },
  pressed97: { transform: [{ scale: 0.97 }] },
  pressed98: { transform: [{ scale: 0.98 }] },
  loadingPage: { flex: 1, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center' },
  // ---- edit page
  editRoot: { flex: 1, backgroundColor: '#f6f7fb' },
  editContent: { paddingHorizontal: 16 },
  editHead: { marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  crumbs: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  crumb: { fontSize: 12, lineHeight: 16, color: colors.slate[400] },
  editTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.slate[900] },
  editSub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backPillText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[700] },
  editMessage: { marginBottom: 20, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  editMessageText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  rejectBox: { marginBottom: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.red[200], backgroundColor: colors.red[50], paddingHorizontal: 20, paddingVertical: 16 },
  rejectTitle: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.98, color: colors.red[600] },
  rejectText: { marginTop: 8, fontSize: 14, lineHeight: 24, fontWeight: '500', color: colors.red[700] },
  editColumns: { gap: 24 },
  panel: { overflow: 'hidden', borderRadius: 28, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, ...shadow.sm },
  panelHead: { borderBottomWidth: 1, borderBottomColor: colors.slate[100], paddingHorizontal: 24, paddingVertical: 20 },
  panelTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  panelSub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  panelBody: { padding: 24, gap: 20 },
  panelPad: { padding: 24 },
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
  typeIconBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  typeName: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  typeDesc: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate[500] },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  typeTile: { flexBasis: '40%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 12 },
  typeTileLabel: { fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.98, color: colors.slate[400] },
  typeTileValue: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[900] },
  notesBox: { marginTop: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 16 },
  summaryBox: { backgroundColor: alpha(colors.slate[50], 0.8) },
  notesHead: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[700] },
  notesBody: { gap: 8 },
  summaryLine: { fontSize: 14, lineHeight: 20, color: colors.slate[600] },
  summaryStrong: { fontWeight: '600', color: colors.slate[900] },
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
  editButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12 },
  cancelText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[700] },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadow.lg,
    shadowColor: colors.blue[200],
  },
  saveText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.white },
  // ---- list page
  listHeader: {
    zIndex: 30,
    backgroundColor: alpha(colors.white, 0.8),
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.slate[200], 0.5),
    ...shadow.sm,
  },
  listHeaderInner: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  listHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  headerBack: {
    width: 32,
    height: 32,
    borderRadius: 14,
    backgroundColor: colors.blue[50],
    borderWidth: 1,
    borderColor: colors.blue[200],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  listTitle: { fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45, color: colors.slate[900] },
  countPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: colors.blue[50], borderWidth: 1, borderColor: colors.blue[200] },
  countText: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.blue[600] },
  listSub: { fontSize: 12, lineHeight: 15, fontWeight: '500', color: colors.slate[500] },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.blue[600],
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexShrink: 0,
    ...shadow.lg,
    shadowColor: colors.blue[200],
  },
  addText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.white },
  listContent: { padding: 16 },
  alert: { marginBottom: 24, padding: 16, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[300],
    backgroundColor: alpha(colors.white, 0.8),
    paddingHorizontal: 24,
    paddingVertical: 64,
    ...shadow.sm,
  },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { marginBottom: 8, fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.gray[900], textAlign: 'center' },
  emptyText: { maxWidth: 384, fontSize: 14, lineHeight: 20, color: colors.gray[600], textAlign: 'center' },
  emptyAdd: { marginTop: 24, paddingHorizontal: 20 },
  separator: { height: 12 },
  vehicleCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.blue[100],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  vehicleImage: { width: '100%', height: '100%', borderRadius: 10 },
  vehicleTitleRow: { marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  vehicleTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, flexShrink: 0 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  vehicleLines: { gap: 2 },
  vehicleLine: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  vehicleLineStrong: { fontWeight: '500' },
  pendingBox: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.amber[200], backgroundColor: colors.amber[50], paddingHorizontal: 12, paddingVertical: 8 },
  pendingTitle: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.amber[700] },
  pendingText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.amber[800] },
  rejectSmall: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.red[200], backgroundColor: colors.red[50], paddingHorizontal: 12, paddingVertical: 8 },
  rejectSmallText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.red[700] },
  vehicleActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  iconBtn: { padding: 8, borderRadius: 10 },
  // ---- delete confirm
  confirm: { maxWidth: 384, borderRadius: 24, backgroundColor: colors.white, ...shadow['2xl'] },
  confirmInner: { padding: 24 },
  confirmIcon: { alignSelf: 'center', marginBottom: 16, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.red[100], alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { marginBottom: 8, fontSize: 20, lineHeight: 28, fontWeight: '900', textTransform: 'uppercase', color: colors.slate[900], textAlign: 'center' },
  confirmText: { marginBottom: 32, fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.slate[600], textAlign: 'center' },
  confirmButtons: { flexDirection: 'row', gap: 12 },
  confirmCancel: { flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.slate[100], borderRadius: 14 },
  confirmCancelText: { fontSize: 16, lineHeight: 24, fontWeight: '700', textTransform: 'uppercase', color: colors.slate[900] },
  confirmDelete: { flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.red[600], borderRadius: 14 },
  confirmDeleteText: { fontSize: 16, lineHeight: 24, fontWeight: '700', textTransform: 'uppercase', color: colors.white },
});

export default OwnerVehicleFleet;
