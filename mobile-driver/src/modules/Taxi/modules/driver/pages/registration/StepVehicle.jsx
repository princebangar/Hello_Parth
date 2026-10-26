// Web: pages/registration/StepVehicle.jsx — /taxi/driver/step-vehicle, /taxi/owner/step-vehicle (step 3 of 4).
// Driver: operating city, service, vehicle type, RC / plate / make / model / year / colour, admin custom fields and a
// separate driving-licence check. Owner: operating city + company details (+ custom fields).
// API: GET service locations, GET /users/vehicle-types, vehicle field templates, driver document templates,
// RC check, DL check (onboarding), PATCH onboarding vehicle -> <prefix>/step-documents.
// No registration session -> <prefix>/reg-phone. Back arrow / Android back: the web's confirm ("Go back to the previous
// step?") -> <prefix>/step-referral.
// Native: <select> = a tappable box + bottom sheet with the options; <input type="date"> = the system date dialog
// (YYYY-MM-DD like the web); window.confirm = Alert; the sticky top bar is a sticky header of the ScrollView; the fixed
// Save & Continue bar sits above the navigation bar.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { ArrowLeft, Car, ChevronRight, MapPin, ShieldCheck, Info } from 'lucide-react-native';
import { useNavigate, useLocation, useBeforeLeave } from '@/lib/router';
import { AppImage, FontScope, Sheet, Skeleton, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, fonts, shadow } from '@/theme';
import {
    getStoredDriverRegistrationSession,
    getDriverDocumentTemplates,
    getDriverServiceLocations,
    saveDriverRegistrationSession,
    saveDriverVehicle,
    getDriverVehicleTypes,
    getDriverVehicleFieldTemplates,
    verifyDriverOnboardingLicenseDocument,
    verifyDriverVehicleRc,
} from '../../services/registrationService';
import { normalizeDriverDocumentTemplates } from '../../utils/documentTemplates';
import { getVehicleTypeFallbackImage } from '../../utils/vehicleTypeIcon';
import { formatGstNumber, isValidGstNumber, GST_ERROR, formatPlateNumber, isValidPlateNumber, PLATE_ERROR } from '../../../../shared/utils/inputFormats';
import { NativeDateInput } from '../../components/FleetDocumentFields';

const getCurrentVehicleYear = () => new Date().getFullYear();
const normalizeVehicleNumber = (value = '') => formatPlateNumber(value);
const normalizePostalCode = (value = '') => String(value).replace(/\D/g, '').slice(0, 6);
const isValidIndianVehicleNumber = (value = '') => isValidPlateNumber(value);
const normalizeLabel = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const findAutofillCustomFieldKey = (fields, aliases = []) => {
    const normalizedAliases = aliases.map(normalizeLabel).filter(Boolean);
    return (
        fields.find((field) => {
            const fieldKey = normalizeLabel(field?.field_key);
            const fieldName = normalizeLabel(field?.name);
            return normalizedAliases.some((alias) => fieldKey === alias || fieldName.includes(alias) || alias.includes(fieldName));
        })?.field_key || ''
    );
};
const applyAutofillCustomField = (currentValue, fieldConfig, nextValue) => {
    if (!fieldConfig || !nextValue) return currentValue;

    const fieldType = String(fieldConfig.field_type || 'text').trim().toLowerCase();
    const normalizedValue = String(nextValue || '').trim();

    if (!normalizedValue) return currentValue;

    if (fieldType === 'multi_select') {
        const values = Array.isArray(currentValue) ? [...currentValue] : [];
        return values.includes(normalizedValue) ? values : [...values, normalizedValue];
    }

    return normalizedValue;
};
const normalizeVerificationType = (value = '') => {
    const normalized = String(value || 'none').trim().toLowerCase();
    return ['driving_license', 'pan', 'gstin', 'rc', 'bank_account'].includes(normalized) ? normalized : 'none';
};
const normalizeOnboardingDocument = (doc) => {
    if (!doc) return null;
    if (typeof doc === 'string') {
        return {
            previewUrl: doc,
            secureUrl: doc,
            uploaded: true,
        };
    }

    return {
        ...doc,
        previewUrl: doc.previewUrl || doc.secureUrl || doc.url || '',
        uploaded: doc.uploaded ?? Boolean(doc.previewUrl || doc.secureUrl || doc.url),
    };
};
const getDrivingLicenseVerificationDetails = (document = {}) =>
    [
        { key: 'verifiedName', label: 'Name' },
        { key: 'verifiedDob', label: 'Date of Birth' },
        { key: 'dlStatus', label: 'DL Status' },
        { key: 'issuingRtoName', label: 'Issuing RTO' },
        { key: 'relativeName', label: 'Relative Name' },
        { key: 'requestNumber', label: 'Request Number' },
    ]
        .map(({ key, label }) => ({
            key,
            label,
            value: String(document?.[key] || document?.[key === 'requestNumber' ? 'request_no' : ''] || '').trim(),
        }))
        .filter((item) => item.value);
const getRcVerificationDetailsList = (vehicle = {}) => [
    { key: 'ownerName', label: 'Owner Name' },
    { key: 'status', label: 'RC Status' },
    { key: 'registrationDate', label: 'Registration Date' },
    { key: 'insuranceUpto', label: 'Insurance Upto' },
    { key: 'fitnessUpto', label: 'Fitness Upto' },
    { key: 'permitNumber', label: 'Permit Number' },
    { key: 'permitValidUpto', label: 'Permit Valid Upto' },
    { key: 'pucNumber', label: 'PUC Number' },
    { key: 'pucValidUpto', label: 'PUC Valid Upto' },
    { key: 'fuelType', label: 'Fuel Type' },
    { key: 'seatCapacity', label: 'Seat Capacity' },
    { key: 'manufacturingMonthYear', label: 'Manufacturing Month/Year' },
]
    .map(({ key, label }) => ({
        key,
        label,
        value: String(vehicle?.[key] || '').trim(),
    }))
    .filter((item) => item.value);
const matchesVehicleFieldAccountType = (accountType, isOwner) => {
    const rawAccountType = String(accountType || '').trim().toLowerCase();
    const normalizedAccountType = rawAccountType || 'individual';

    if (isOwner) {
        if (!rawAccountType) {
            return false;
        }

        return [
            'fleet_drivers',
            'fleet drivers',
            'owner',
            'owners',
            'fleet_owner',
            'fleet_owners',
            'fleet owner',
            'fleet owners',
        ].includes(normalizedAccountType);
    }

    if (normalizedAccountType === 'both') {
        return true;
    }

    return normalizedAccountType === 'individual';
};
const normalizeServiceCategories = (value, registerFor = 'taxi') => {
    const rawValues = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];

    const normalized = [...new Set(
        rawValues
            .map((item) => String(item || '').trim().toLowerCase())
            .flatMap((item) => item === 'both' ? ['taxi', 'outstation'] : item ? [item] : [])
            .filter((item) => ['taxi', 'outstation', 'delivery'].includes(item)),
    )];

    if (normalized.length > 0) {
        return normalized;
    }

    const fallback = String(registerFor || 'taxi').trim().toLowerCase();
    if (fallback === 'both') {
        return ['taxi', 'outstation'];
    }

    return ['taxi', 'outstation', 'delivery'].includes(fallback) ? [fallback] : ['taxi'];
};

const getPrimaryRegisterFor = (serviceCategories = [], fallback = 'taxi') => {
    const normalized = normalizeServiceCategories(serviceCategories, fallback);

    if (normalized.includes('taxi') && normalized.includes('outstation')) return 'both';
    if (normalized.includes('taxi')) return 'taxi';
    if (normalized.includes('outstation')) return 'outstation';
    if (normalized.includes('delivery')) return 'delivery';

    return String(fallback || 'taxi').trim().toLowerCase() || 'taxi';
};

const defaultVehicleFieldConfigs = [
    { field_key: 'locationId', name: 'Operating City', account_type: 'both', is_required: true, active: true, sort_order: 10, placeholder: '', help_text: '' },
    { field_key: 'serviceCategories', name: 'Service Category', account_type: 'individual', is_required: true, active: true, sort_order: 20, placeholder: '', help_text: '' },
    { field_key: 'vehicleTypeId', name: 'Vehicle Type', account_type: 'individual', is_required: true, active: true, sort_order: 30, placeholder: '', help_text: 'Select the type of vehicle you drive.' },
    { field_key: 'rcNumber', name: 'RC / Permit Number', account_type: 'individual', is_required: true, active: true, sort_order: 35, placeholder: 'MP09AB1234', help_text: 'Enter RC number to fetch vehicle details automatically.' },
    { field_key: 'make', name: 'Brand / Make', account_type: 'individual', is_required: true, active: true, sort_order: 40, placeholder: 'e.g. Maruti Suzuki', help_text: '' },
    { field_key: 'model', name: 'Model', account_type: 'individual', is_required: true, active: true, sort_order: 50, placeholder: 'Swift, Bolt', help_text: '' },
    { field_key: 'year', name: 'Year', account_type: 'individual', is_required: true, active: true, sort_order: 60, placeholder: String(getCurrentVehicleYear()), help_text: '' },
    { field_key: 'number', name: 'Plate Number', account_type: 'individual', is_required: true, active: true, sort_order: 70, placeholder: 'DL1RT1234', help_text: '' },
    { field_key: 'color', name: 'Exterior Color', account_type: 'individual', is_required: true, active: true, sort_order: 80, placeholder: 'e.g. White, Black', help_text: '' },
    { field_key: 'companyName', name: 'Company Name', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 30, placeholder: 'Legal Company Name', help_text: '' },
    { field_key: 'companyAddress', name: 'Company Address', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 40, placeholder: 'Business Address', help_text: '' },
    { field_key: 'city', name: 'City', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 50, placeholder: 'City', help_text: '' },
    { field_key: 'postalCode', name: 'Postal Code', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 60, placeholder: 'Pincode', help_text: '' },
    { field_key: 'taxNumber', name: 'Tax Number (GST/VAT)', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 70, placeholder: 'Tax Identification', help_text: '' },
];

const chunk = (list, size) => {
    const rows = [];
    for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
    return rows;
};

// One input card: rounded-[1.8rem] border-2 p-4 (+ focus-within / error colours of the web)
const FieldBox = ({ label, error, focused, children, style, labelStyle }) => (
    <View style={[styles.fieldCard, error ? styles.fieldCardError : focused ? styles.fieldCardFocused : null, style]}>
        <Text style={[styles.fieldLabel, { color: error ? colors.rose[400] : colors.slate[500] }, labelStyle]}>{label}</Text>
        {children}
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
);

// <select>: shows the chosen option; tapping opens the option list in a bottom sheet.
const SelectBox = ({ value, options, placeholder, disabled, onSelect, onOpenChange, title, textStyle }) => {
    const [open, setOpen] = useState(false);
    const selected = options.find((opt) => String(opt.value) === String(value));
    const setOpenState = (next) => {
        setOpen(next);
        onOpenChange?.(next);
    };
    return (
        <>
            <Pressable disabled={disabled} onPress={() => setOpenState(true)} style={disabled ? styles.disabled : null} accessibilityRole="button">
                <Text style={[styles.input, textStyle]} numberOfLines={1}>{selected ? selected.label : placeholder}</Text>
            </Pressable>
            <Sheet open={open} onClose={() => setOpenState(false)} style={styles.sheet}>
                <Text style={styles.sheetTitle}>{title}</Text>
                <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
                    {[{ value: '', label: placeholder }, ...options].map((opt) => {
                        const isSelected = String(opt.value) === String(value || '');
                        return (
                            <Pressable
                                key={`opt-${opt.value}`}
                                onPress={() => {
                                    setOpenState(false);
                                    onSelect(opt.value);
                                }}
                                style={({ pressed }) => [styles.sheetOption, isSelected || pressed ? styles.sheetOptionSelected : null]}
                            >
                                <Text style={[styles.sheetOptionText, isSelected ? styles.sheetOptionTextSelected : null]}>{opt.label}</Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </Sheet>
        </>
    );
};

const DetailsGrid = ({ items }) => (
    <View style={styles.detailsGrid}>
        {chunk(items, 2).map((row, index) => (
            <View key={`details-${index}`} style={styles.gridRow}>
                {row.map((item) => (
                    <View key={item.key} style={styles.detailItem}>
                        <Text style={styles.detailLabel}>{item.label}</Text>
                        <Text style={styles.detailValue}>{item.value}</Text>
                    </View>
                ))}
                {row.length < 2 ? <View style={styles.flex1} /> : null}
            </View>
        ))}
    </View>
);

const StepVehiclePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const insets = useSafeAreaInsets();
    const routePrefix = location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver';
    const session = getStoredDriverRegistrationSession();
    const isHandlingHistoryNavigationRef = useRef(false);
    const role = session.role || 'driver';
    const isOwner = role === 'owner';
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const registrationId = String(session.registrationId || '').trim();

    const [locations, setLocations] = useState([]);
    const [locationsLoading, setLocationsLoading] = useState(true);
    const [, setLocationsError] = useState('');

    const [vehicleTypes, setVehicleTypes] = useState([]);
    const [vehicleTypesLoading, setVehicleTypesLoading] = useState(false);
    const [vehicleFieldConfigs, setVehicleFieldConfigs] = useState(defaultVehicleFieldConfigs);
    const [documentTemplates, setDocumentTemplates] = useState([]);

    const [formData, setFormData] = useState({
        registerFor: getPrimaryRegisterFor(session.serviceCategories || session.vehicleSession?.vehicle?.serviceCategories || [], session.registerFor || 'taxi'),
        serviceCategories: normalizeServiceCategories(session.serviceCategories || session.vehicleSession?.vehicle?.serviceCategories || [], session.registerFor || 'taxi'),
        locationId: session.locationId || '',
        vehicleTypeId: session.vehicleTypeId || '',
        rcNumber: session.rcNumber || session.vehicleSession?.vehicle?.rcNumber || '',
        make: session.make || '',
        model: session.model || '',
        year: session.year || '',
        number: session.number || '',
        color: session.color || '',
        // Company info for owners
        companyName: session.companyName || '',
        companyAddress: session.companyAddress || '',
        city: session.city || '',
        postalCode: session.postalCode || '',
        taxNumber: session.taxNumber || '',
        customFields: session.customFields || session.vehicleSession?.vehicle?.customFields || {},
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [, setSubmitAttempted] = useState(false);
    const [rcVerificationLoading, setRcVerificationLoading] = useState(false);
    const [rcVerificationMessage, setRcVerificationMessage] = useState('');
    const [rcVerificationError, setRcVerificationError] = useState('');
    const [rcVerificationDetails, setRcVerificationDetails] = useState(session.rcVerificationDetails || null);
    // RC check service switched off / not configured: the driver types the vehicle details himself, admin checks the papers.
    const [, setRcManualEntry] = useState(false);
    const [dlMeta, setDlMeta] = useState(() => ({
        identifyNumber: '',
        birthDate: '',
        requestNumber: '',
    }));
    const [dlVerificationLoading, setDlVerificationLoading] = useState(false);
    const [dlVerificationMessage, setDlVerificationMessage] = useState(session.dlVerificationMessage || '');
    const [dlVerificationError, setDlVerificationError] = useState('');
    const [dlVerificationDetails, setDlVerificationDetails] = useState(null);
    const lastVerifiedRcRef = useRef('');
    // web: focus-within styles of the input cards
    const [focusedField, setFocusedField] = useState('');
    const focusProps = (key) => ({
        onFocus: () => setFocusedField(key),
        onBlur: () => setFocusedField((current) => (current === key ? '' : current)),
    });

    useEffect(() => {
        saveDriverRegistrationSession({
            ...session,
            ...formData,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same as the web: saved whenever the form changes
    }, [formData]);

    useEffect(() => {
        saveDriverRegistrationSession({
            ...getStoredDriverRegistrationSession(),
            ...session,
            ...formData,
            rcVerificationDetails,
            rcVerificationMessage,
            dlVerificationMessage,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same deps as the web
    }, [formData, rcVerificationDetails, rcVerificationMessage, dlVerificationMessage]);

    useEffect(() => {
        if (isOwner) {
            return;
        }

        const storedSession = getStoredDriverRegistrationSession();
        const storedTemplates = normalizeDriverDocumentTemplates(documentTemplates);
        const dlTemplate = storedTemplates.find(
            (template) => normalizeVerificationType(template?.verification_type) === 'driving_license',
        );

        if (!dlTemplate) {
            return;
        }

        const templateId = String(dlTemplate.id || '').trim();
        const docKey = String(dlTemplate.fields?.[0]?.key || '').trim();
        const storedMeta = storedSession.documentMeta?.[templateId] || session.documentMeta?.[templateId] || {};
        const storedDoc = normalizeOnboardingDocument(
            storedSession.documents?.[docKey] || session.documents?.[docKey] || null,
        );
        const nextDlMeta = {
            identifyNumber: String(storedMeta.identifyNumber || storedDoc?.identifyNumber || storedDoc?.identify_number || '').trim(),
            birthDate: String(storedMeta.birthDate || storedDoc?.birthDate || storedDoc?.birth_date || '').trim(),
            requestNumber: String(storedMeta.requestNumber || storedDoc?.requestNumber || storedDoc?.request_no || '').trim(),
        };

        setDlMeta((current) =>
            current.identifyNumber === nextDlMeta.identifyNumber &&
            current.birthDate === nextDlMeta.birthDate &&
            current.requestNumber === nextDlMeta.requestNumber
                ? current
                : nextDlMeta,
        );
        setDlVerificationDetails((current) => {
            const currentPreview = String(current?.previewUrl || current?.secureUrl || '').trim();
            const nextPreview = String(storedDoc?.previewUrl || storedDoc?.secureUrl || '').trim();
            const currentIdentifyNumber = String(current?.identifyNumber || current?.identify_number || '').trim();
            const nextIdentifyNumber = String(storedDoc?.identifyNumber || storedDoc?.identify_number || '').trim();
            const currentRequestNumber = String(current?.requestNumber || current?.request_no || '').trim();
            const nextRequestNumber = String(storedDoc?.requestNumber || storedDoc?.request_no || '').trim();

            return currentPreview === nextPreview &&
                currentIdentifyNumber === nextIdentifyNumber &&
                currentRequestNumber === nextRequestNumber
                ? current
                : storedDoc;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same deps as the web
    }, [documentTemplates, isOwner]);

    useEffect(() => {
        if (!phone || !registrationId) {
            navigate(`${routePrefix}/reg-phone`, { replace: true });
        }
    }, [navigate, phone, registrationId, routePrefix]);

    const buildCurrentSession = () => saveDriverRegistrationSession({
        ...getStoredDriverRegistrationSession(),
        ...session,
        ...formData,
    });

    // web: window.confirm(...) on the back arrow and on the browser / phone back (popstate)
    const handleBackNavigation = () => {
        Alert.alert('', 'Go back to the previous step? Your vehicle details will stay saved.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'OK',
                onPress: () => {
                    isHandlingHistoryNavigationRef.current = true;
                    buildCurrentSession();
                    navigate(`${routePrefix}/step-referral`, { replace: true });
                },
            },
        ]);
    };

    useBeforeLeave(() => {
        if (isHandlingHistoryNavigationRef.current) {
            return false;
        }
        handleBackNavigation();
        return true;
    });

    useEffect(() => {
        let active = true;

        const loadLocations = async () => {
            try {
                setLocationsLoading(true);
                setLocationsError('');

                const response = await getDriverServiceLocations();
                const results = response?.data?.results || response?.data || [];

                if (active) {
                    setLocations(Array.isArray(results) ? results : []);
                }
            } catch (err) {
                if (active) {
                    setLocationsError(err?.message || 'Unable to load service locations');
                    setLocations([]);
                }
            } finally {
                if (active) {
                    setLocationsLoading(false);
                }
            }
        };

        const loadVehicleTypes = async () => {
            try {
                setVehicleTypesLoading(true);
                const response = await getDriverVehicleTypes();
                const results = response?.data?.results || response?.data || [];
                if (active) {
                    setVehicleTypes(Array.isArray(results) ? results : []);
                }
            } catch (err) {
                console.error('Failed to load vehicle types:', err);
            } finally {
                if (active) {
                    setVehicleTypesLoading(false);
                }
            }
        };

        const loadVehicleFieldConfigs = async () => {
            try {
                const response = await getDriverVehicleFieldTemplates(isOwner ? 'owner' : 'driver');
                const results = response?.data?.results || response?.data?.data?.results || [];
                if (active && Array.isArray(results) && results.length > 0) {
                    setVehicleFieldConfigs(results);
                }
            } catch (err) {
                console.error('Failed to load vehicle field configs:', err);
            }
        };

        const loadDocumentTemplates = async () => {
            if (isOwner) {
                if (active) {
                    setDocumentTemplates([]);
                }
                return;
            }

            try {
                const response = await getDriverDocumentTemplates('driver');
                const results = response?.data?.data?.results || response?.data?.results || [];
                if (active) {
                    setDocumentTemplates(normalizeDriverDocumentTemplates(results));
                }
            } catch (err) {
                console.error('Failed to load driver document templates:', err);
                if (active) {
                    setDocumentTemplates([]);
                }
            }
        };

        loadLocations();
        loadVehicleTypes();
        loadVehicleFieldConfigs();
        loadDocumentTemplates();

        return () => {
            active = false;
        };
    }, [isOwner]);

    const activeVehicleFields = vehicleFieldConfigs
        .filter((item) => item?.active !== false)
        .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));

    const builtInVehicleFieldKeys = new Set([
        'locationId',
        'serviceCategories',
        'vehicleTypeId',
        'rcNumber',
        'make',
        'model',
        'year',
        'number',
        'color',
        'companyName',
        'companyAddress',
        'city',
        'postalCode',
        'taxNumber',
    ]);

    const fieldConfigMap = activeVehicleFields.reduce((acc, item) => {
        acc[String(item.field_key || '').trim()] = item;
        return acc;
    }, {});

    const getFieldConfig = (key, fallback = {}) => ({
        name: fallback.name || '',
        placeholder: fallback.placeholder || '',
        help_text: fallback.help_text || '',
        is_required: fallback.is_required ?? true,
        ...fieldConfigMap[key],
    });

    const shouldShowField = (key, fallback = true) => {
        if (!fieldConfigMap[key]) return fallback;
        return fieldConfigMap[key].active !== false;
    };

    const isFieldRequired = (key, fallback = true) => {
        if (!fieldConfigMap[key]) return fallback;
        return fieldConfigMap[key].is_required !== false;
    };

    const isFilled = (value) => Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
    const handleCustomFieldChange = (key, value) => {
        setFormData((previous) => ({
            ...previous,
            customFields: {
                ...(previous.customFields || {}),
                [key]: value,
            },
        }));
    };
    const customVehicleFields = activeVehicleFields.filter((item) => !builtInVehicleFieldKeys.has(String(item?.field_key || '').trim()));
    const visibleCustomVehicleFields = customVehicleFields.filter((item) =>
        matchesVehicleFieldAccountType(item?.account_type, isOwner),
    );
    const fuelTypeFieldKey = findAutofillCustomFieldKey(visibleCustomVehicleFields, ['fuel type', 'fuel', 'vehicle fuel']);
    const seatCapacityFieldKey = findAutofillCustomFieldKey(visibleCustomVehicleFields, ['seat capacity', 'seating capacity', 'seats']);
    const manufacturerFieldKey = findAutofillCustomFieldKey(visibleCustomVehicleFields, ['manufacturer', 'vehicle manufacturer', 'brand']);
    // There is no RC lookup service: the captain always types the vehicle details, the admin checks the papers.
    const showRcAutofilledFields = true;
    const drivingLicenseTemplate = documentTemplates.find(
        (template) => normalizeVerificationType(template?.verification_type) === 'driving_license',
    ) || null;
    const drivingLicenseTemplateId = String(
        drivingLicenseTemplate?.id ||
        session.drivingLicenseTemplateId ||
        'driving_license'
    ).trim();
    const drivingLicenseDocumentKey = String(
        drivingLicenseTemplate?.fields?.[0]?.key ||
        session.drivingLicenseDocumentKey ||
        'driving_license'
    ).trim();

    useEffect(() => {
        if (!drivingLicenseTemplateId) {
            return;
        }

        const storedSession = getStoredDriverRegistrationSession();
        saveDriverRegistrationSession({
            ...storedSession,
            ...session,
            ...formData,
            rcVerificationDetails,
            rcVerificationMessage,
            dlVerificationMessage,
            drivingLicenseTemplateId,
            drivingLicenseDocumentKey,
            documents: dlVerificationDetails && drivingLicenseDocumentKey
                ? {
                    ...(storedSession.documents || {}),
                    [drivingLicenseDocumentKey]: dlVerificationDetails,
                }
                : (storedSession.documents || {}),
            documentMeta: {
                ...(storedSession.documentMeta || {}),
                [drivingLicenseTemplateId]: {
                    ...(storedSession.documentMeta?.[drivingLicenseTemplateId] || {}),
                    identifyNumber: String(dlMeta.identifyNumber || '').trim(),
                    birthDate: String(dlMeta.birthDate || '').trim(),
                    requestNumber: String(dlMeta.requestNumber || '').trim(),
                },
            },
        });
    }, [
        dlMeta,
        dlVerificationDetails,
        dlVerificationMessage,
        drivingLicenseDocumentKey,
        drivingLicenseTemplateId,
        formData,
        rcVerificationDetails,
        rcVerificationMessage,
        session,
    ]);

    // Clear field error when user edits a field
    const clearFieldError = (key) => {
        if (fieldErrors[key]) {
            setFieldErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
        }
    };

    // Kept from the web (not wired to a button there either: the RC lookup service is off).
    // eslint-disable-next-line no-unused-vars
    const handleVerifyRc = async () => {
        if (isOwner || rcVerificationLoading) {
            return;
        }

        const normalizedRcNumber = normalizeVehicleNumber(formData.rcNumber);

        if (!normalizedRcNumber) {
            setFieldErrors((previous) => ({ ...previous, rcNumber: 'RC number is required' }));
            setRcVerificationError('');
            setRcVerificationMessage('');
            return;
        }

        if (!isValidIndianVehicleNumber(normalizedRcNumber)) {
            setFieldErrors((previous) => ({ ...previous, rcNumber: PLATE_ERROR }));
            setRcVerificationError('');
            setRcVerificationMessage('');
            return;
        }

        if (!registrationId || !phone) {
            setRcVerificationError('Registration session expired. Please restart onboarding.');
            setRcVerificationMessage('');
            return;
        }

        clearFieldError('rcNumber');
        setRcVerificationError('');
        setRcVerificationMessage('');

        try {
            setRcVerificationLoading(true);
            const response = await verifyDriverVehicleRc({
                registrationId,
                phone: session.phone,
                rcNumber: normalizedRcNumber,
            });

            const vehicle = response?.data?.data?.vehicle || response?.data?.vehicle || {};
            const verificationMessage = response?.data?.data?.message || response?.data?.message || 'RC verified successfully';

            setFormData((previous) => {
                const nextCustomFields = {
                    ...(previous.customFields || {}),
                };

                if (fuelTypeFieldKey) {
                    nextCustomFields[fuelTypeFieldKey] = applyAutofillCustomField(
                        previous.customFields?.[fuelTypeFieldKey],
                        fieldConfigMap[fuelTypeFieldKey],
                        vehicle.fuelType,
                    );
                }

                if (seatCapacityFieldKey) {
                    nextCustomFields[seatCapacityFieldKey] = applyAutofillCustomField(
                        previous.customFields?.[seatCapacityFieldKey],
                        fieldConfigMap[seatCapacityFieldKey],
                        vehicle.seatCapacity,
                    );
                }

                if (manufacturerFieldKey) {
                    nextCustomFields[manufacturerFieldKey] = applyAutofillCustomField(
                        previous.customFields?.[manufacturerFieldKey],
                        fieldConfigMap[manufacturerFieldKey],
                        vehicle.make,
                    );
                }

                return {
                    ...previous,
                    rcNumber: normalizedRcNumber,
                    make: vehicle.make || previous.make,
                    model: vehicle.model || previous.model,
                    year: vehicle.year || previous.year,
                    number: vehicle.number || previous.number,
                    color: vehicle.color || previous.color,
                    customFields: nextCustomFields,
                };
            });

            setFieldErrors((previous) => {
                const next = { ...previous };
                delete next.rcNumber;
                delete next.make;
                delete next.model;
                delete next.year;
                delete next.number;
                delete next.color;
                if (fuelTypeFieldKey) delete next[`custom_${fuelTypeFieldKey}`];
                if (seatCapacityFieldKey) delete next[`custom_${seatCapacityFieldKey}`];
                if (manufacturerFieldKey) delete next[`custom_${manufacturerFieldKey}`];
                return next;
            });

            lastVerifiedRcRef.current = normalizedRcNumber;
            setRcVerificationDetails(vehicle);
            setRcVerificationMessage(verificationMessage);
            setRcVerificationError('');
        } catch (err) {
            lastVerifiedRcRef.current = '';
            setRcVerificationDetails(null);
            setRcVerificationMessage('');
            const failMessage = String(err?.message || '');
            if (/disabled in admin settings|not configured/i.test(failMessage)) {
                setRcManualEntry(true);
                setRcVerificationError('Automatic RC check is not available right now. Enter your vehicle details below - our team will verify your papers.');
            } else {
                setRcVerificationError(failMessage || 'Unable to verify RC number');
            }
        } finally {
            setRcVerificationLoading(false);
        }
    };

    const handleVerifyDl = async () => {
        if (isOwner || dlVerificationLoading) {
            return;
        }

        if (!registrationId || !phone) {
            setDlVerificationError('Registration session expired. Please restart onboarding.');
            setDlVerificationMessage('');
            return;
        }

        const identifyNumber = String(dlMeta.identifyNumber || '').trim().toUpperCase();
        const birthDate = String(dlMeta.birthDate || '').trim();
        const requestNumber = String(dlMeta.requestNumber || '').trim();

        if (!identifyNumber) {
            setDlVerificationError('Driving license number is required');
            setDlVerificationMessage('');
            return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
            setDlVerificationError('Birth date must use YYYY-MM-DD format');
            setDlVerificationMessage('');
            return;
        }

        setDlVerificationLoading(true);
        setDlVerificationError('');
        setDlVerificationMessage('');

        try {
            const response = await verifyDriverOnboardingLicenseDocument(drivingLicenseDocumentKey, {
                registrationId,
                phone: session.phone,
                licenseNumber: identifyNumber,
                birthDate,
                requestNumber,
            });

            const payload = response?.data?.data || response?.data || {};
            const verifiedDocument = normalizeOnboardingDocument(payload?.document);
            const nextRequestNumber = String(
                verifiedDocument?.requestNumber ||
                verifiedDocument?.request_no ||
                requestNumber,
            ).trim();
            const nextMessage = String(payload?.message || 'Driving license verified successfully').trim();

            setDlMeta({
                identifyNumber,
                birthDate,
                requestNumber: nextRequestNumber,
            });
            setDlVerificationDetails(verifiedDocument);
            setDlVerificationMessage(nextMessage);

            const storedSession = getStoredDriverRegistrationSession();
            saveDriverRegistrationSession({
                ...storedSession,
                ...session,
                ...formData,
                rcVerificationDetails,
                rcVerificationMessage,
                dlVerificationMessage: nextMessage,
                drivingLicenseTemplateId,
                drivingLicenseDocumentKey,
                documents: {
                    ...(storedSession.documents || {}),
                    [drivingLicenseDocumentKey]: verifiedDocument,
                },
                documentMeta: {
                    ...(storedSession.documentMeta || {}),
                    [drivingLicenseTemplateId]: {
                        ...(storedSession.documentMeta?.[drivingLicenseTemplateId] || {}),
                        identifyNumber,
                        birthDate,
                        requestNumber: nextRequestNumber,
                    },
                },
            });
        } catch (err) {
            setDlVerificationDetails(null);
            setDlVerificationMessage('');
            setDlVerificationError(err?.message || 'Unable to verify driving license');
        } finally {
            setDlVerificationLoading(false);
        }
    };

    const validateFields = () => {
        const errors = {};
        const currentYear = getCurrentVehicleYear();

        if (isFieldRequired('locationId', true) && !isFilled(formData.locationId)) {
            errors.locationId = 'Please select your operating city';
        }

        if (isOwner) {
            if (isFieldRequired('companyName', true) && !isFilled(formData.companyName)) {
                errors.companyName = 'Company name is required';
            }
            if (isFieldRequired('companyAddress', true) && !isFilled(formData.companyAddress)) {
                errors.companyAddress = 'Company address is required';
            }
            if (isFieldRequired('city', true) && !isFilled(formData.city)) {
                errors.city = 'City is required';
            }
            if (isFieldRequired('postalCode', true) && !isFilled(formData.postalCode)) {
                errors.postalCode = 'Postal code is required';
            } else if (isFilled(formData.postalCode) && !/^\d{6}$/.test(formData.postalCode)) {
                errors.postalCode = 'Must be a 6-digit number';
            }
            if (isFieldRequired('taxNumber', true) && !isFilled(formData.taxNumber)) {
                errors.taxNumber = 'GST/VAT number is required';
            } else if (isFilled(formData.taxNumber) && !isValidGstNumber(formData.taxNumber)) {
                errors.taxNumber = GST_ERROR;
            }
        } else {
            if (isFieldRequired('vehicleTypeId', true) && !isFilled(formData.vehicleTypeId)) {
                errors.vehicleTypeId = 'Please select a vehicle type';
            }
            if (!isFilled(formData.rcNumber)) {
                errors.rcNumber = 'RC number is required';
            } else {
                const normalizedRcNumber = normalizeVehicleNumber(formData.rcNumber);
                if (!isValidIndianVehicleNumber(normalizedRcNumber)) {
                    errors.rcNumber = PLATE_ERROR;
                }
            }
            if (isFieldRequired('make', true) && !isFilled(formData.make)) {
                errors.make = 'Brand / make is required';
            }
            if (isFieldRequired('model', true) && !isFilled(formData.model)) {
                errors.model = 'Model is required';
            } else if (isFilled(formData.model) && /^\d+$/.test(String(formData.model).trim())) {
                errors.model = 'Model cannot be only numbers';
            }
            if (isFieldRequired('year', true) && !isFilled(formData.year)) {
                errors.year = 'Year is required';
            } else if (isFilled(formData.year)) {
                const vehicleYear = Number(formData.year);
                if (!/^\d{4}$/.test(formData.year) || vehicleYear < 1980 || vehicleYear > currentYear) {
                    errors.year = `Must be between 1980 and ${currentYear}`;
                }
            }
            if (isFieldRequired('number', true) && !isFilled(formData.number)) {
                errors.number = 'Plate number is required';
            } else if (isFilled(formData.number)) {
                const normalizedNum = normalizeVehicleNumber(formData.number);
                if (!isValidIndianVehicleNumber(normalizedNum)) {
                    errors.number = PLATE_ERROR;
                }
            }
            if (isFieldRequired('color', true) && !isFilled(formData.color)) {
                errors.color = 'Exterior color is required';
            }
        }

        // Custom fields
        visibleCustomVehicleFields.forEach((field) => {
            if (field?.is_required !== false && !isFilled(formData.customFields?.[field.field_key])) {
                errors[`custom_${field.field_key}`] = `${field.name || 'This field'} is required`;
            }
        });

        return errors;
    };

    const handleContinue = async () => {
        setSubmitAttempted(true);
        const errors = validateFields();
        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            // Show first specific error message in the banner
            const firstError = Object.values(errors)[0];
            setError(firstError || (isOwner ? 'Please fill all required company information fields' : 'Please fill all required vehicle information fields'));
            return;
        }

        setLoading(true);
        setError('');
        setFieldErrors({});

        try {
            const normalizedRcNumber = normalizeVehicleNumber(formData.rcNumber);
            const normalizedNumber = normalizeVehicleNumber(formData.number);
            const selectedServiceLocation = locations.find(
                (item) => String(item._id || item.id) === String(formData.locationId)
            );

            const response = await saveDriverVehicle({
                registrationId: session.registrationId,
                phone: session.phone,
                registerFor: formData.registerFor,
                serviceCategories: formData.serviceCategories,
                locationId: formData.locationId,
                locationName: selectedServiceLocation?.name || selectedServiceLocation?.service_location_name || '',
                serviceLocation: selectedServiceLocation || null,
                vehicleTypeId: formData.vehicleTypeId,
                rcNumber: normalizedRcNumber,
                make: formData.make,
                model: formData.model,
                year: formData.year,
                number: normalizedNumber,
                color: formData.color,
                companyName: formData.companyName,
                companyAddress: formData.companyAddress,
                city: isOwner ? formData.city : selectedServiceLocation?.name || selectedServiceLocation?.service_location_name || formData.city,
                postalCode: formData.postalCode,
                taxNumber: formData.taxNumber,
                customFields: formData.customFields,
            });

            saveDriverRegistrationSession({
                ...session,
                ...formData,
                rcNumber: normalizedRcNumber,
                number: normalizedNumber,
                vehicleSession: response?.data?.session || null,
            });

            navigate(`${routePrefix}/step-documents`);
        } catch (err) {
            setError(err?.message || 'Unable to save vehicle details');
        } finally {
            setLoading(false);
        }
    };

    const locationField = getFieldConfig('locationId', { name: 'Operating City' });
    const vehicleTypeField = getFieldConfig('vehicleTypeId', { name: 'Vehicle Type', help_text: 'Select the type of vehicle you drive.' });
    const rcNumberField = getFieldConfig('rcNumber', { name: 'RC / Permit Number', placeholder: 'MP09AB1234', help_text: 'Enter RC number to fetch vehicle details automatically.' });
    const companyNameField = getFieldConfig('companyName', { name: 'Company Name', placeholder: 'Legal Company Name' });
    const companyAddressField = getFieldConfig('companyAddress', { name: 'Company Address', placeholder: 'Business Address' });
    const cityField = getFieldConfig('city', { name: 'City', placeholder: 'City' });
    const postalCodeField = getFieldConfig('postalCode', { name: 'Postal Code', placeholder: 'Pincode' });
    const taxNumberField = getFieldConfig('taxNumber', { name: 'Tax Number (GST/VAT)', placeholder: 'Tax Identification' });
    const makeField = getFieldConfig('make', { name: 'Brand / Make', placeholder: 'e.g. Maruti Suzuki' });
    const modelField = getFieldConfig('model', { name: 'Model', placeholder: 'Swift, Bolt' });
    const yearField = getFieldConfig('year', { name: 'Year', placeholder: String(getCurrentVehicleYear()) });
    const numberField = getFieldConfig('number', { name: 'Plate Number', placeholder: 'DL1RT1234' });
    const colorField = getFieldConfig('color', { name: 'Exterior Color', placeholder: 'e.g. White, Black' });
    const ownerHasVisibleFields = ['companyName', 'companyAddress', 'city', 'postalCode', 'taxNumber'].some((key) => shouldShowField(key, true));
    const driverHasTechnicalFields = ['rcNumber', 'make', 'model', 'year', 'number', 'color'].some((key) => shouldShowField(key, true));
    const rcVerificationDetailsList = getRcVerificationDetailsList(rcVerificationDetails || {});
    const dlVerificationDetailsList = getDrivingLicenseVerificationDetails(dlVerificationDetails || {});

    const locationOptions = locations.map((loc) => ({ value: loc._id || loc.id, label: loc.service_location_name || loc.name }));
    const showModel = showRcAutofilledFields && shouldShowField('model', true);
    const showYear = showRcAutofilledFields && shouldShowField('year', true);

    const resetDlChecks = () => {
        setDlVerificationDetails(null);
        setDlVerificationMessage('');
        setDlVerificationError('');
    };

    const renderOwnerCustomField = (field) => {
        const fieldKey = String(field.field_key || '').trim();
        const fieldType = String(field.field_type || 'text').trim().toLowerCase();
        const value = formData.customFields?.[fieldKey] || (fieldType === 'multi_select' ? [] : '');
        const optionList = Array.isArray(field.options) ? field.options : [];
        const errText = fieldErrors[`custom_${fieldKey}`];

        if (fieldType === 'select') {
            return (
                <FieldBox key={fieldKey} label={field.name} error={errText} focused={focusedField === `custom_${fieldKey}`}>
                    <SelectBox
                        title={field.name}
                        value={value}
                        placeholder={field.placeholder || `Select ${field.name}`}
                        options={optionList.map((opt) => ({ value: opt, label: opt }))}
                        onOpenChange={(open) => setFocusedField(open ? `custom_${fieldKey}` : '')}
                        onSelect={(next) => { clearFieldError(`custom_${fieldKey}`); handleCustomFieldChange(fieldKey, next); }}
                    />
                </FieldBox>
            );
        }

        return (
            <FieldBox key={fieldKey} label={field.name} error={errText} focused={focusedField === `custom_${fieldKey}`}>
                <TextInput
                    keyboardType={fieldType === 'number' ? 'phone-pad' : 'default'}
                    value={String(value)}
                    onChangeText={(text) => { clearFieldError(`custom_${fieldKey}`); handleCustomFieldChange(fieldKey, fieldType === 'number' ? text.replace(/\D/g, '') : text); }}
                    placeholder={field.placeholder || ''}
                    placeholderTextColor={colors.slate[500]}
                    style={styles.input}
                    {...focusProps(`custom_${fieldKey}`)}
                />
            </FieldBox>
        );
    };

    const renderDriverCustomField = (field) => {
        const fieldKey = String(field.field_key || '').trim();
        const fieldType = String(field.field_type || 'text').trim().toLowerCase();
        const value = formData.customFields?.[fieldKey] || (fieldType === 'multi_select' ? [] : '');
        const optionList = Array.isArray(field.options) ? field.options : [];
        const focusKey = `custom_${fieldKey}`;
        const helpText = field.help_text ? <Text style={styles.helpText}>{field.help_text}</Text> : null;

        if (fieldType === 'textarea') {
            return (
                <FieldBox key={fieldKey} label={field.name} focused={focusedField === focusKey} labelStyle={styles.labelStrong}>
                    <TextInput
                        multiline
                        numberOfLines={3}
                        value={String(value)}
                        onChangeText={(text) => handleCustomFieldChange(fieldKey, text)}
                        placeholder={field.placeholder || ''}
                        placeholderTextColor={colors.slate[500]}
                        style={[styles.input, styles.textarea]}
                        {...focusProps(focusKey)}
                    />
                    {helpText}
                </FieldBox>
            );
        }

        if (fieldType === 'select') {
            return (
                <FieldBox key={fieldKey} label={field.name} focused={focusedField === focusKey} labelStyle={styles.labelStrong}>
                    <SelectBox
                        title={field.name}
                        value={value}
                        placeholder={field.placeholder || `Select ${field.name}`}
                        options={optionList.map((opt) => ({ value: opt, label: opt }))}
                        onOpenChange={(open) => setFocusedField(open ? focusKey : '')}
                        onSelect={(next) => handleCustomFieldChange(fieldKey, next)}
                    />
                    {helpText}
                </FieldBox>
            );
        }

        if (fieldType === 'multi_select') {
            const selectedValues = Array.isArray(value) ? value : [];
            return (
                <View key={fieldKey} style={[styles.fieldCard, styles.multiCard]}>
                    <View>
                        <Text style={[styles.fieldLabel, styles.labelStrong]}>{field.name}</Text>
                        {field.help_text ? <Text style={[styles.helpTextTight]}>{field.help_text}</Text> : null}
                    </View>
                    <View style={styles.chips}>
                        {optionList.map((option) => {
                            const selected = selectedValues.includes(option);
                            return (
                                <Pressable
                                    key={option}
                                    onPress={() => {
                                        const nextValues = selected
                                            ? selectedValues.filter((item) => item !== option)
                                            : [...selectedValues, option];
                                        handleCustomFieldChange(fieldKey, nextValues);
                                    }}
                                    style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
                                >
                                    <Text style={[styles.chipText, { color: selected ? colors.white : colors.slate[700] }]}>{option}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            );
        }

        return (
            <FieldBox key={fieldKey} label={field.name} focused={focusedField === focusKey} labelStyle={styles.labelStrong}>
                <TextInput
                    keyboardType={fieldType === 'number' ? 'phone-pad' : 'default'}
                    value={String(value)}
                    onChangeText={(text) => handleCustomFieldChange(
                        fieldKey,
                        fieldType === 'number' ? text.replace(/\D/g, '') : text,
                    )}
                    placeholder={field.placeholder || ''}
                    placeholderTextColor={colors.slate[500]}
                    style={styles.input}
                    {...focusProps(focusKey)}
                />
                {helpText}
            </FieldBox>
        );
    };

    const locationFocused = focusedField === 'locationId';

    return (
        <FontScope family={fonts.inter}>
            <View style={styles.root}>
                <StatusBar style="dark" />
                <LinearGradient
                    colors={['#f6efe4', '#fcfaf6', '#ffffff']}
                    locations={[0, 0.28, 1]}
                    style={StyleSheet.absoluteFill}
                />
                <ScrollView
                    style={[styles.scroll, { marginTop: insets.top }]}
                    contentContainerStyle={[styles.content, { paddingBottom: 128 + insets.bottom }]}
                    keyboardShouldPersistTaps="handled"
                    stickyHeaderIndices={[0]}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.topBar}>
                        <Pressable
                            onPress={handleBackNavigation}
                            accessibilityLabel="Back"
                            style={({ pressed }) => [styles.backBtn, pressed ? styles.pressedSmall : null]}
                        >
                            <ArrowLeft size={18} strokeWidth={2.5} color={colors.slate[900]} />
                        </Pressable>
                        <View style={styles.stepBadge}>
                            <Text style={styles.stepBadgeText}>Step 3 of 4</Text>
                        </View>
                    </View>

                    <View style={styles.column}>
                        <View style={styles.intro}>
                            <View style={styles.introRow}>
                                <View style={styles.introIcon}>
                                    <Car size={22} strokeWidth={2.5} color={colors.white} />
                                </View>
                                <Text style={styles.introLabel}>Vehicle Details</Text>
                            </View>
                            <Text style={styles.heading}>
                                {isOwner ? 'Fleet ' : 'Vehicle '}
                                <Text style={styles.headingMuted}>Setup</Text>
                            </Text>
                            <Text style={styles.lead}>
                                {isOwner ? 'Setup your business profile to start managing your fleet.' : 'Tell us about the vehicle you\'ll be using for your services.'}
                            </Text>
                        </View>

                        <View style={styles.card}>
                            {shouldShowField('locationId', true) ? (
                                <View style={[styles.fieldCard, fieldErrors.locationId ? styles.fieldCardError : locationFocused ? styles.fieldCardFocused : null]}>
                                    <View style={styles.fieldRow}>
                                        <View style={[
                                            styles.fieldIcon,
                                            fieldErrors.locationId ? styles.fieldIconError : locationFocused ? styles.fieldIconFocused : null,
                                        ]}>
                                            <MapPin
                                                size={20}
                                                strokeWidth={2.5}
                                                color={fieldErrors.locationId ? colors.rose[400] : locationFocused ? colors.white : colors.slate[500]}
                                            />
                                        </View>
                                        <View style={styles.fieldBody}>
                                            <Text style={[styles.fieldLabel, styles.labelNoPad, { color: fieldErrors.locationId ? colors.rose[400] : colors.slate[500] }]}>
                                                {locationField.name}
                                            </Text>
                                            <SelectBox
                                                title={locationField.name}
                                                value={formData.locationId}
                                                placeholder={locationsLoading ? 'Loading...' : 'Select City'}
                                                options={locationOptions}
                                                disabled={locationsLoading || locations.length === 0}
                                                onOpenChange={(open) => setFocusedField(open ? 'locationId' : '')}
                                                onSelect={(nextLocationId) => {
                                                    clearFieldError('locationId');
                                                    const selectedServiceLocation = locations.find(
                                                        (item) => String(item._id || item.id) === String(nextLocationId),
                                                    );

                                                    setFormData((p) => ({
                                                        ...p,
                                                        locationId: nextLocationId,
                                                        vehicleTypeId: '',
                                                        ...(isOwner
                                                            ? {
                                                                companyAddress: p.companyAddress || String(selectedServiceLocation?.address || '').trim(),
                                                                city:
                                                                    p.city ||
                                                                    String(
                                                                        selectedServiceLocation?.service_location_name ||
                                                                        selectedServiceLocation?.name ||
                                                                        '',
                                                                    ).trim(),
                                                            }
                                                            : {}),
                                                    }));
                                                }}
                                            />
                                            {fieldErrors.locationId ? (
                                                <Text style={[styles.fieldError, styles.labelNoPad, { paddingTop: 2 }]}>{fieldErrors.locationId}</Text>
                                            ) : null}
                                        </View>
                                    </View>
                                </View>
                            ) : null}

                            {isOwner ? (
                                <View style={styles.ownerFields}>
                                    {ownerHasVisibleFields && shouldShowField('companyName', true) ? (
                                        <FieldBox label={companyNameField.name} error={fieldErrors.companyName} focused={focusedField === 'companyName'}>
                                            <TextInput
                                                value={formData.companyName}
                                                onChangeText={(text) => { clearFieldError('companyName'); setFormData(p => ({ ...p, companyName: text })); }}
                                                placeholder={companyNameField.placeholder || 'Legal Company Name'}
                                                placeholderTextColor={colors.slate[500]}
                                                style={styles.input}
                                                {...focusProps('companyName')}
                                            />
                                        </FieldBox>
                                    ) : null}

                                    {shouldShowField('companyAddress', true) ? (
                                        <FieldBox label={companyAddressField.name} error={fieldErrors.companyAddress} focused={focusedField === 'companyAddress'}>
                                            <TextInput
                                                value={formData.companyAddress}
                                                onChangeText={(text) => { clearFieldError('companyAddress'); setFormData(p => ({ ...p, companyAddress: text })); }}
                                                placeholder={companyAddressField.placeholder || 'Business Address'}
                                                placeholderTextColor={colors.slate[500]}
                                                style={styles.input}
                                                {...focusProps('companyAddress')}
                                            />
                                        </FieldBox>
                                    ) : null}

                                    <View style={styles.gridRow}>
                                        {shouldShowField('city', true) ? (
                                            <FieldBox label={cityField.name} error={fieldErrors.city} focused={focusedField === 'city'} style={styles.flex1}>
                                                <TextInput
                                                    value={formData.city}
                                                    onChangeText={(text) => { clearFieldError('city'); setFormData(p => ({ ...p, city: text })); }}
                                                    placeholder={cityField.placeholder || 'City'}
                                                    placeholderTextColor={colors.slate[500]}
                                                    style={styles.input}
                                                    {...focusProps('city')}
                                                />
                                            </FieldBox>
                                        ) : null}
                                        {shouldShowField('postalCode', true) ? (
                                            <FieldBox label={postalCodeField.name} error={fieldErrors.postalCode} focused={focusedField === 'postalCode'} style={styles.flex1}>
                                                <TextInput
                                                    value={formData.postalCode}
                                                    onChangeText={(text) => { clearFieldError('postalCode'); setFormData(p => ({ ...p, postalCode: normalizePostalCode(text) })); }}
                                                    placeholder={postalCodeField.placeholder || 'Pincode'}
                                                    placeholderTextColor={colors.slate[500]}
                                                    keyboardType="number-pad"
                                                    maxLength={6}
                                                    style={styles.input}
                                                    {...focusProps('postalCode')}
                                                />
                                            </FieldBox>
                                        ) : null}
                                        {shouldShowField('city', true) !== shouldShowField('postalCode', true) ? <View style={styles.flex1} /> : null}
                                    </View>

                                    {shouldShowField('taxNumber', true) ? (
                                        <FieldBox label={taxNumberField.name} error={fieldErrors.taxNumber} focused={focusedField === 'taxNumber'}>
                                            <TextInput
                                                value={formData.taxNumber}
                                                onChangeText={(text) => { clearFieldError('taxNumber'); setFormData(p => ({ ...p, taxNumber: formatGstNumber(text) })); }}
                                                placeholder={taxNumberField.placeholder || 'Tax Identification'}
                                                placeholderTextColor={colors.slate[500]}
                                                autoCapitalize="characters"
                                                autoCorrect={false}
                                                style={styles.input}
                                                {...focusProps('taxNumber')}
                                            />
                                        </FieldBox>
                                    ) : null}

                                    {/* Custom fields for fleet owners */}
                                    {visibleCustomVehicleFields.length > 0 ? (
                                        <View style={styles.block}>
                                            <View style={styles.blockHead}>
                                                <Text style={styles.blockTitle}>Additional Details</Text>
                                                <Text style={styles.blockSub}>Required information</Text>
                                            </View>
                                            <View style={styles.stack12}>
                                                {visibleCustomVehicleFields.map(renderOwnerCustomField)}
                                            </View>
                                        </View>
                                    ) : null}
                                </View>
                            ) : (
                                <View style={styles.driverFields}>
                                    {shouldShowField('vehicleTypeId', true) ? (
                                        <View style={styles.typeBlock}>
                                            <View style={styles.blockHead}>
                                                <Text style={[styles.typeTitle, { color: fieldErrors.vehicleTypeId ? colors.rose[600] : colors.slate[950] }]}>{vehicleTypeField.name}</Text>
                                                <Text style={styles.typeHelp}>
                                                    {formData.locationId
                                                        ? (vehicleTypeField.help_text || 'Select the type of vehicle you drive.')
                                                        : 'Select a vehicle type now. Choosing your city later will refine availability if needed.'}
                                                </Text>
                                            </View>
                                            <View style={styles.stack12}>
                                                {vehicleTypesLoading ? (
                                                    chunk([0, 1, 2, 3], 2).map((row, index) => (
                                                        <View key={`sk-${index}`} style={styles.gridRow}>
                                                            {row.map((i) => <Skeleton key={i} style={styles.typeSkeleton} />)}
                                                        </View>
                                                    ))
                                                ) : (
                                                    chunk(vehicleTypes, 2).map((row, index) => (
                                                        <View key={`types-${index}`} style={styles.gridRow}>
                                                            {row.map((type) => {
                                                                const typeId = type._id || type.id;
                                                                const selected = formData.vehicleTypeId === typeId;
                                                                return (
                                                                    <Pressable
                                                                        key={typeId}
                                                                        onPress={() => { clearFieldError('vehicleTypeId'); setFormData(p => ({ ...p, vehicleTypeId: typeId })); }}
                                                                        style={[
                                                                            styles.typeTile,
                                                                            selected
                                                                                ? styles.typeTileSelected
                                                                                : fieldErrors.vehicleTypeId
                                                                                    ? styles.typeTileError
                                                                                    : styles.typeTileIdle,
                                                                        ]}
                                                                    >
                                                                        <View style={styles.typeImageWrap}>
                                                                            <AppImage
                                                                                src={type.image || type.icon || type.map_icon || getVehicleTypeFallbackImage(type.name || type.vehicle_type_name)}
                                                                                fallback={getVehicleTypeFallbackImage(type.name || type.vehicle_type_name)}
                                                                                style={styles.typeImage}
                                                                                contentFit="contain"
                                                                            />
                                                                        </View>
                                                                        <View style={[styles.typeLabelBar, selected ? styles.typeLabelBarSelected : null]}>
                                                                            <Text style={[styles.typeLabel, selected ? styles.typeLabelSelected : null]} numberOfLines={1}>
                                                                                {type.name || type.vehicle_type_name}
                                                                            </Text>
                                                                        </View>
                                                                    </Pressable>
                                                                );
                                                            })}
                                                            {row.length < 2 ? <View style={styles.flex1} /> : null}
                                                        </View>
                                                    ))
                                                )}
                                            </View>
                                            {fieldErrors.vehicleTypeId ? (
                                                <Text style={styles.typeError}>{fieldErrors.vehicleTypeId}</Text>
                                            ) : null}
                                        </View>
                                    ) : null}

                                    {driverHasTechnicalFields ? (
                                        <View style={styles.block}>
                                            <View style={styles.blockHead}>
                                                <Text style={styles.blockTitle}>Technical Specs</Text>
                                                <Text style={styles.blockSub}>As per your RC / Permit</Text>
                                            </View>

                                            <View style={styles.stack12}>
                                                {shouldShowField('rcNumber', true) ? (
                                                    <View style={[styles.fieldCard, fieldErrors.rcNumber ? styles.fieldCardError : focusedField === 'rcNumber' ? styles.fieldCardFocused : null]}>
                                                        <Text style={[styles.fieldLabel, { color: fieldErrors.rcNumber ? colors.rose[400] : colors.slate[500] }]}>{rcNumberField.name}</Text>
                                                        <TextInput
                                                            value={formData.rcNumber}
                                                            onChangeText={(text) => {
                                                                clearFieldError('rcNumber');
                                                                lastVerifiedRcRef.current = '';
                                                                setRcVerificationDetails(null);
                                                                setRcVerificationMessage('');
                                                                setRcVerificationError('');
                                                                setFormData((p) => ({ ...p, rcNumber: normalizeVehicleNumber(text) }));
                                                            }}
                                                            placeholder={rcNumberField.placeholder || 'MP09AB1234'}
                                                            placeholderTextColor={colors.slate[500]}
                                                            autoCapitalize="characters"
                                                            autoCorrect={false}
                                                            style={[styles.input, styles.inputWide]}
                                                            {...focusProps('rcNumber')}
                                                        />
                                                        {fieldErrors.rcNumber ? <Text style={styles.fieldError}>{fieldErrors.rcNumber}</Text> : null}
                                                        {!fieldErrors.rcNumber && !isOwner && rcVerificationLoading ? (
                                                            <Text style={[styles.fieldNote, { color: colors.sky[600] }]}>Verifying RC and fetching vehicle details...</Text>
                                                        ) : null}
                                                        {!fieldErrors.rcNumber && !isOwner && !rcVerificationLoading && rcVerificationMessage ? (
                                                            <Text style={[styles.fieldNote, { color: colors.emerald[600] }]}>{rcVerificationMessage}</Text>
                                                        ) : null}
                                                        {!fieldErrors.rcNumber && !isOwner && !rcVerificationLoading && rcVerificationError ? (
                                                            <Text style={[styles.fieldNote, { color: colors.amber[600] }]}>{rcVerificationError}</Text>
                                                        ) : null}
                                                    </View>
                                                ) : null}

                                                {rcVerificationDetailsList.length > 0 ? (
                                                    <View style={styles.verifiedBox}>
                                                        <View style={styles.verifiedHead}>
                                                            <ShieldCheck size={15} color={colors.emerald[600]} />
                                                            <Text style={styles.verifiedTitle}>Verified RC Details</Text>
                                                        </View>
                                                        <Text style={styles.verifiedDesc}>
                                                            RC details only, including permit, insurance, fitness and PUC info when available.
                                                        </Text>
                                                        <DetailsGrid items={rcVerificationDetailsList} />
                                                    </View>
                                                ) : null}

                                                {showRcAutofilledFields && shouldShowField('make', true) ? (
                                                    <FieldBox label={makeField.name} error={fieldErrors.make} focused={focusedField === 'make'}>
                                                        <TextInput
                                                            value={formData.make}
                                                            onChangeText={(text) => { clearFieldError('make'); setFormData(p => ({ ...p, make: text })); }}
                                                            placeholder={makeField.placeholder || 'e.g. Maruti Suzuki'}
                                                            placeholderTextColor={colors.slate[500]}
                                                            style={styles.input}
                                                            {...focusProps('make')}
                                                        />
                                                    </FieldBox>
                                                ) : null}

                                                {showModel || showYear ? (
                                                    <View style={styles.gridRow}>
                                                        {showModel ? (
                                                            <FieldBox label={modelField.name} error={fieldErrors.model} focused={focusedField === 'model'} style={styles.flex1}>
                                                                <TextInput
                                                                    value={formData.model}
                                                                    onChangeText={(text) => { clearFieldError('model'); setFormData(p => ({ ...p, model: text })); }}
                                                                    placeholder={modelField.placeholder || 'Swift, Bolt'}
                                                                    placeholderTextColor={colors.slate[500]}
                                                                    style={styles.input}
                                                                    {...focusProps('model')}
                                                                />
                                                            </FieldBox>
                                                        ) : null}
                                                        {showYear ? (
                                                            <FieldBox label={yearField.name} error={fieldErrors.year} focused={focusedField === 'year'} style={styles.flex1}>
                                                                <TextInput
                                                                    keyboardType="phone-pad"
                                                                    maxLength={4}
                                                                    value={formData.year}
                                                                    onChangeText={(text) => { clearFieldError('year'); setFormData(p => ({ ...p, year: text.replace(/\D/g, '') })); }}
                                                                    placeholder={yearField.placeholder || String(getCurrentVehicleYear())}
                                                                    placeholderTextColor={colors.slate[500]}
                                                                    style={styles.input}
                                                                    {...focusProps('year')}
                                                                />
                                                            </FieldBox>
                                                        ) : null}
                                                        {showModel !== showYear ? <View style={styles.flex1} /> : null}
                                                    </View>
                                                ) : null}

                                                {showRcAutofilledFields && shouldShowField('number', true) ? (
                                                    <FieldBox label={numberField.name} error={fieldErrors.number} focused={focusedField === 'number'}>
                                                        <TextInput
                                                            value={formData.number}
                                                            onChangeText={(text) => { clearFieldError('number'); setFormData(p => ({ ...p, number: normalizeVehicleNumber(text) })); }}
                                                            placeholder={numberField.placeholder || 'DL1RT1234'}
                                                            placeholderTextColor={colors.slate[500]}
                                                            autoCapitalize="characters"
                                                            autoCorrect={false}
                                                            style={[styles.input, styles.inputWide]}
                                                            {...focusProps('number')}
                                                        />
                                                    </FieldBox>
                                                ) : null}

                                                {showRcAutofilledFields && shouldShowField('color', true) ? (
                                                    <FieldBox label={colorField.name} error={fieldErrors.color} focused={focusedField === 'color'}>
                                                        <TextInput
                                                            value={formData.color}
                                                            onChangeText={(text) => { clearFieldError('color'); setFormData(p => ({ ...p, color: text })); }}
                                                            placeholder={colorField.placeholder || 'e.g. White, Black'}
                                                            placeholderTextColor={colors.slate[500]}
                                                            style={styles.input}
                                                            {...focusProps('color')}
                                                        />
                                                    </FieldBox>
                                                ) : null}
                                            </View>
                                        </View>
                                    ) : null}

                                    {!isOwner ? (
                                        <View style={styles.block}>
                                            <View style={styles.blockHead}>
                                                <Text style={styles.blockTitle}>Driving License</Text>
                                                <Text style={styles.blockSub}>Separate DL verification</Text>
                                            </View>

                                            <View style={styles.stack12}>
                                                <FieldBox label="License Number" focused={focusedField === 'dlNumber'} labelStyle={styles.labelStrong}>
                                                    <TextInput
                                                        value={dlMeta.identifyNumber}
                                                        onChangeText={(text) => {
                                                            resetDlChecks();
                                                            setDlMeta((prev) => ({ ...prev, identifyNumber: text.toUpperCase() }));
                                                        }}
                                                        placeholder="Enter DL number"
                                                        placeholderTextColor={colors.slate[500]}
                                                        autoCapitalize="characters"
                                                        autoCorrect={false}
                                                        style={[styles.input, styles.inputDl]}
                                                        {...focusProps('dlNumber')}
                                                    />
                                                </FieldBox>

                                                <View style={styles.gridRow}>
                                                    <FieldBox label="Birth Date" labelStyle={styles.labelStrong} style={styles.flex1}>
                                                        <NativeDateInput
                                                            value={dlMeta.birthDate}
                                                            onChangeValue={(value) => {
                                                                resetDlChecks();
                                                                setDlMeta((prev) => ({ ...prev, birthDate: value }));
                                                            }}
                                                            textStyle={[styles.input, styles.inputDate]}
                                                            placeholderColor={colors.slate[950]}
                                                            iconColor={colors.slate[950]}
                                                        />
                                                    </FieldBox>

                                                    <FieldBox label="Request Number" focused={focusedField === 'dlRequest'} labelStyle={styles.labelStrong} style={styles.flex1}>
                                                        <TextInput
                                                            value={dlMeta.requestNumber}
                                                            onChangeText={(text) => {
                                                                resetDlChecks();
                                                                setDlMeta((prev) => ({ ...prev, requestNumber: text }));
                                                            }}
                                                            placeholder="Optional"
                                                            placeholderTextColor={colors.slate[500]}
                                                            style={[styles.input, styles.inputDate]}
                                                            {...focusProps('dlRequest')}
                                                        />
                                                    </FieldBox>
                                                </View>

                                                <View style={styles.verifyRow}>
                                                    <Pressable
                                                        onPress={handleVerifyDl}
                                                        disabled={dlVerificationLoading}
                                                        style={({ pressed }) => [
                                                            styles.verifyBtn,
                                                            dlVerificationLoading ? styles.verifyBtnBusy : styles.verifyBtnIdle,
                                                            pressed && !dlVerificationLoading ? styles.pressedSmall : null,
                                                        ]}
                                                    >
                                                        <Text style={[styles.verifyText, { color: dlVerificationLoading ? colors.slate[500] : colors.white }]}>
                                                            {dlVerificationLoading ? 'Verifying...' : 'Verify DL'}
                                                        </Text>
                                                    </Pressable>
                                                </View>

                                                {dlVerificationMessage ? (
                                                    <Text style={[styles.blockNote, { color: colors.emerald[600] }]}>{dlVerificationMessage}</Text>
                                                ) : null}
                                                {dlVerificationError ? (
                                                    <Text style={[styles.blockNote, { color: colors.amber[600] }]}>{dlVerificationError}</Text>
                                                ) : null}

                                                {dlVerificationDetailsList.length > 0 ? (
                                                    <View style={styles.verifiedBox}>
                                                        <View style={styles.verifiedHead}>
                                                            <ShieldCheck size={15} color={colors.emerald[600]} />
                                                            <Text style={styles.verifiedTitle}>Verified From DL</Text>
                                                        </View>
                                                        <Text style={styles.verifiedDesc}>
                                                            DL details only, kept separate from RC verification.
                                                        </Text>
                                                        <DetailsGrid items={dlVerificationDetailsList} />
                                                    </View>
                                                ) : null}
                                            </View>
                                        </View>
                                    ) : null}

                                    {visibleCustomVehicleFields.length > 0 && showRcAutofilledFields ? (
                                        <View style={styles.block}>
                                            <View style={styles.blockHead}>
                                                <Text style={styles.blockTitle}>Additional Details</Text>
                                                <Text style={styles.blockSub}>Configured from admin</Text>
                                            </View>

                                            <View style={styles.stack12}>
                                                {visibleCustomVehicleFields.map(renderDriverCustomField)}
                                            </View>
                                        </View>
                                    ) : null}
                                </View>
                            )}
                        </View>

                        <View style={styles.infoBox}>
                            <Info size={18} color={colors.blue[500]} />
                            <Text style={styles.infoText}>
                                Your vehicle information will be visible to passengers for safety and identification.
                            </Text>
                        </View>

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
                    <View style={styles.footerInner}>
                        <Pressable
                            onPress={handleContinue}
                            disabled={loading}
                            style={({ pressed }) => [
                                styles.continueBtn,
                                loading ? styles.continueBusy : styles.continueEnabled,
                                !loading && pressed ? styles.pressed : null,
                            ]}
                        >
                            {loading ? (
                                <Spin>
                                    <View style={styles.ring} />
                                </Spin>
                            ) : (
                                <>
                                    <Text style={styles.continueText}>Save &amp; Continue</Text>
                                    <ChevronRight size={18} strokeWidth={3} color={colors.white} />
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </FontScope>
    );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL), so this page is drawn only while it is in front.
const StepVehicle = () => {
    const focused = useIsFocused();
    return focused ? <StepVehiclePage /> : null;
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#ffffff' },
    scroll: { flex: 1 },
    content: { flexGrow: 1, paddingTop: 20, paddingHorizontal: 20 },
    column: { width: '100%', maxWidth: 384, alignSelf: 'center', gap: 24 },
    flex1: { flex: 1, minWidth: 0 },
    disabled: { opacity: 0.5 },
    topBar: {
        marginHorizontal: -20,
        marginBottom: 24,
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
        borderColor: colors.slate[200],
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.sm,
    },
    pressedSmall: { transform: [{ scale: 0.95 }] },
    stepBadge: {
        borderRadius: 9999,
        backgroundColor: alpha('#0f172a', 0.05),
        borderWidth: 1,
        borderColor: alpha('#0f172a', 0.05),
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    stepBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.slate[600] },
    intro: { gap: 12 },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    introIcon: {
        width: 44,
        height: 44,
        borderRadius: 20,
        backgroundColor: colors.slate[900],
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.xl,
        shadowColor: '#0f172a',
    },
    introLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 2.2, textTransform: 'uppercase', color: colors.slate[500] },
    heading: { fontSize: 48, lineHeight: 50, fontWeight: '700', letterSpacing: -1.92, color: colors.slate[900] },
    headingMuted: { color: colors.slate[500] },
    lead: { maxWidth: 235, fontSize: 15, lineHeight: 24.4, fontWeight: '700', color: alpha('#64748b', 0.8) },
    card: {
        gap: 20,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: colors.slate[100],
        backgroundColor: colors.white,
        padding: 24,
        elevation: 3,
        shadowColor: '#000000',
        shadowOpacity: 0.04,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
    },
    fieldCard: {
        borderRadius: 28.8,
        borderWidth: 2,
        borderColor: colors.slate[200],
        backgroundColor: colors.slate[50],
        padding: 16,
    },
    fieldCardFocused: {
        borderColor: alpha('#0f172a', 0.1),
        backgroundColor: colors.white,
        ...shadow.xl,
        shadowColor: '#0f172a',
        shadowOpacity: 0.05,
    },
    fieldCardError: { borderColor: colors.rose[200], backgroundColor: alpha(colors.rose[50], 0.3) },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    fieldIcon: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.sm,
    },
    fieldIconFocused: { backgroundColor: colors.slate[900] },
    fieldIconError: { backgroundColor: colors.rose[100] },
    fieldBody: { flex: 1, minWidth: 0, gap: 2 },
    fieldLabel: {
        marginBottom: 4,
        paddingHorizontal: 4,
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '700',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        opacity: 0.7,
        color: colors.slate[500],
    },
    labelNoPad: { paddingHorizontal: 0, marginBottom: 0 },
    // DL / custom-field labels: text-slate-600, no opacity
    labelStrong: { opacity: 1, color: colors.slate[600] },
    fieldError: { paddingTop: 4, paddingHorizontal: 4, fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.rose[500] },
    fieldNote: { paddingTop: 4, paddingHorizontal: 4, fontSize: 10, lineHeight: 14, fontWeight: '700' },
    input: { width: '100%', fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.slate[900], paddingVertical: 0 },
    inputWide: { color: colors.slate[950], letterSpacing: 1.6 },
    inputDl: { color: colors.slate[950], letterSpacing: 0.4 },
    inputDate: { color: colors.slate[950] },
    textarea: { minHeight: 72, textAlignVertical: 'top' },
    helpText: { marginTop: 8, fontSize: 12, lineHeight: 16, color: colors.slate[500] },
    helpTextTight: { paddingHorizontal: 4, fontSize: 12, lineHeight: 16, color: colors.slate[500] },
    ownerFields: { gap: 14 },
    driverFields: { gap: 20 },
    gridRow: { flexDirection: 'row', gap: 12 },
    stack12: { gap: 12 },
    block: { gap: 20, paddingTop: 4 },
    blockHead: { gap: 4, paddingHorizontal: 4 },
    blockTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', letterSpacing: -0.45, color: colors.slate[900] },
    blockSub: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.slate[500] },
    blockNote: { paddingHorizontal: 4, fontSize: 10, lineHeight: 14, fontWeight: '700' },
    typeBlock: { gap: 16, paddingTop: 4 },
    typeTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: -0.48 },
    typeHelp: { fontSize: 14, lineHeight: 20, color: colors.slate[500] },
    typeSkeleton: { flex: 1, height: 128, borderRadius: 16, backgroundColor: alpha(colors.slate[50], 0.5) },
    typeTile: { flex: 1, minWidth: 0, height: 128, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
    typeTileSelected: { borderColor: colors.slate[900], backgroundColor: alpha(colors.slate[900], 0.02) },
    typeTileError: { borderColor: colors.rose[200], backgroundColor: alpha(colors.rose[50], 0.2) },
    typeTileIdle: { borderColor: colors.slate[100], backgroundColor: '#FCFCFB' },
    typeImageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
    typeImage: { width: '100%', height: 56 },
    typeLabelBar: { padding: 10, backgroundColor: alpha(colors.white, 0.5) },
    typeLabelBarSelected: { backgroundColor: colors.slate[900] },
    typeLabel: { textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: -0.275, textTransform: 'uppercase', color: colors.slate[700] },
    typeLabelSelected: { fontWeight: '700', color: colors.white },
    typeError: { paddingHorizontal: 4, fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.rose[500] },
    verifiedBox: { borderRadius: 28.8, borderWidth: 1, borderColor: colors.emerald[100], backgroundColor: alpha(colors.emerald[50], 0.5), padding: 16 },
    verifiedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
    verifiedTitle: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.emerald[700] },
    verifiedDesc: { marginTop: 4, paddingHorizontal: 4, fontSize: 11, lineHeight: 16, fontWeight: '600', color: alpha(colors.emerald[800], 0.7) },
    detailsGrid: { marginTop: 12, gap: 12 },
    detailItem: { flex: 1, minWidth: 0, borderRadius: 16, backgroundColor: alpha(colors.white, 0.9), paddingHorizontal: 12, paddingVertical: 8 },
    detailLabel: { fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 1.35, textTransform: 'uppercase', color: colors.slate[500] },
    detailValue: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[900] },
    verifyRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    verifyBtn: { borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 8 },
    // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
    verifyBtnIdle: { backgroundColor: driverTheme.button },
    verifyBtnBusy: { backgroundColor: colors.slate[200] },
    verifyText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.65, textTransform: 'uppercase' },
    multiCard: { gap: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
    // web: bg-slate-900 button -> the partner button blue
    chipSelected: { backgroundColor: driverTheme.button },
    chipIdle: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[200] },
    chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 16 },
    sheetTitle: { paddingHorizontal: 8, marginBottom: 8, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.slate[500] },
    sheetList: { maxHeight: 420, marginBottom: 12 },
    sheetOption: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 },
    sheetOptionSelected: { backgroundColor: colors.slate[100] },
    sheetOptionText: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.slate[900] },
    sheetOptionTextSelected: { fontWeight: '700' },
    infoBox: {
        marginTop: 16,
        flexDirection: 'row',
        gap: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.blue[100],
        backgroundColor: alpha(colors.blue[50], 0.5),
        padding: 16,
    },
    infoText: { flex: 1, fontSize: 12, lineHeight: 19.5, fontWeight: '500', color: colors.slate[600] },
    errorBox: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.rose[200],
        backgroundColor: colors.rose[50],
        paddingHorizontal: 16,
        paddingVertical: 12,
        elevation: 2,
        shadowColor: '#f43f5e',
        shadowOpacity: 0.08,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
    },
    errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.rose[700] },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 24 },
    footerInner: { width: '100%', maxWidth: 384, alignSelf: 'center' },
    continueBtn: {
        height: 64,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        borderRadius: 28.8,
    },
    // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
    continueEnabled: {
        backgroundColor: driverTheme.button,
        elevation: 14,
        shadowColor: '#000000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 20 },
    },
    continueBusy: { backgroundColor: colors.slate[700] },
    pressed: { transform: [{ scale: 0.98 }] },
    continueText: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.white },
    ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha('#ffffff', 0.3), borderTopColor: '#ffffff' },
});

export default StepVehicle;
