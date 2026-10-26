// Web: pages/registration/StepDocuments.jsx — /taxi/driver/step-documents, /taxi/owner/step-documents (step 4 of 4,
// "KYC Vault"). One card per admin document template (role-filtered); every side is uploaded as soon as it is picked
// (PATCH onboarding documents { registrationId, phone, documents: { [key]: { dataUrl, fileName, mimeType, ...meta } } }),
// numbers / dates / bank details are kept per template, the DL can be checked (onboarding DL verify), and
// "Review & Submit" completes the onboarding -> <prefix>/registration-status (state: role, completedRegistration,
// submittedDocumentSummary). No registration session -> <prefix>/reg-phone. Back: the web's confirm ("Go back to
// vehicle setup?") -> <prefix>/step-vehicle.
// Native: Gallery / Camera use the system picker (src/lib/media) instead of <input type="file"> and the Flutter camera
// bridge (window.flutter_inappwebview.callHandler / Rydon24Native); the picked photo is read as a data URL (the body
// the web sent). The web's canvas re-encode (max side 1600, JPEG 0.82) is shrinkImage (expo-image-manipulator, same size and quality).
// <input type="date"> + querySelector(...).showPicker() = the system date dialog (YYYY-MM-DD).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { File } from 'expo-file-system';
import {
    ArrowLeft,
    Camera,
    CheckCircle2,
    FileText,
    ImagePlus,
    ShieldCheck,
    AlertCircle,
    ChevronRight,
    UploadCloud,
} from 'lucide-react-native';
import { useNavigate, useLocation, useBeforeLeave } from '@/lib/router';
import { pickImage } from '@/lib/media';
import { AppImage, FontScope, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, fonts, shadow } from '@/theme';
import {
  clearDriverRegistrationSession,
  completeDriverOnboarding,
  getDriverDocumentTemplates,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverDocuments,
  saveDriverRegistrationSession,
  toPlainData,
  verifyDriverOnboardingLicenseDocument,
} from '../../services/registrationService';
import {
  flattenDriverDocumentFields,
  getDocumentPreviewUrl,
  isPastExpiryDate,
  normalizeDriverDocumentTemplates,
  todayDateInputValue,
} from '../../utils/documentTemplates';
import { NativeDateInput } from '../../components/FleetDocumentFields';

const unwrap = (response) => response?.data?.data || response?.data || response;

const normalizeDocument = (doc) => {
  if (!doc) {
    return null;
  }

  if (typeof doc === 'string') {
    return {
      previewUrl: doc,
      secureUrl: doc,
      uploaded: true,
    };
  }

  return {
    ...doc,
    previewUrl: getDocumentPreviewUrl(doc),
    uploaded: doc.uploaded ?? Boolean(getDocumentPreviewUrl(doc)),
    identifyNumber: String(doc.identifyNumber || doc.identify_number || doc.documentNumber || doc.document_number || '').trim(),
    expiryDate: String(doc.expiryDate || doc.expiry_date || doc.expiry || doc.expiresAt || '').trim(),
  };
};

// What kind of paper a template is, from its admin-given name (DrivingLicence, AadhaarCard, VehicleRC, ...).
const getTemplateKind = (template = {}) => {
  const name = String(template?.name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (/aadhaar|aadhar/.test(name)) return 'aadhaar';
  if (/drivinglicen[cs]e|^dl$/.test(name)) return 'dl';
  if (/vehiclerc|registrationcertificate|^rc$/.test(name)) return 'rc';
  if (/pan(card)?$/.test(name)) return 'pan';
  return 'other';
};

const DL_REGEX = /^[A-Z]{2}\d{2}\d{4}\d{7}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PLATE_LIKE_REGEX = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$|^\d{2}BH\d{4}[A-Z]{1,2}$/;

// Keep only characters that can appear in the number, so a wrong key press never gets in.
const cleanIdentifyNumber = (template, value) => {
  const raw = String(value || '').toUpperCase();
  switch (getTemplateKind(template)) {
    case 'aadhaar': return raw.replace(/\D/g, '').slice(0, 12);
    case 'dl': return raw.replace(/[^A-Z0-9]/g, '').slice(0, 16);
    case 'rc': return raw.replace(/[^A-Z0-9]/g, '').slice(0, 10);
    case 'pan': return raw.replace(/[^A-Z0-9]/g, '').slice(0, 10);
    default: return raw.slice(0, 30);
  }
};

// '' when the number is fine (or still empty - "required" is checked separately).
const getIdentifyNumberError = (template, value) => {
  const v = String(value || '').trim().replace(/[\s-]/g, '').toUpperCase();
  if (!v) return '';
  switch (getTemplateKind(template)) {
    case 'aadhaar': return /^\d{12}$/.test(v) ? '' : 'Aadhaar number must be 12 digits';
    case 'dl': return DL_REGEX.test(v) ? '' : 'Enter a valid licence number like MP0920150001234';
    case 'rc': return PLATE_LIKE_REGEX.test(v) ? '' : 'Enter a valid RC number like MP09AB1234';
    case 'pan': return /^[A-Z]{5}\d{4}[A-Z]$/.test(v) ? '' : 'PAN must look like ABCDE1234F';
    default: return v.length >= 3 ? '' : 'Enter a valid number';
  }
};

const getIfscError = (value) => {
  const v = String(value || '').trim();
  return !v || IFSC_REGEX.test(v) ? '' : 'IFSC must look like SBIN0001234';
};
const getHolderNameError = (value) => {
  const v = String(value || '').trim();
  return !v || /^[A-Za-z][A-Za-z .'-]{2,}$/.test(v) ? '' : 'Enter the name as on the bank account (letters only)';
};

const getDocumentIdentifyValue = (doc) =>
  String(doc?.identifyNumber || doc?.identify_number || doc?.documentNumber || doc?.document_number || '').trim();

const getDocumentExpiryValue = (doc) =>
  String(doc?.expiryDate || doc?.expiry_date || doc?.expiry || doc?.expiresAt || '').trim();

const getDocumentBirthDateValue = (doc) =>
  String(doc?.birthDate || doc?.birth_date || '').trim();

const getDocumentRequestNumberValue = (doc) =>
  String(doc?.requestNumber || doc?.request_no || '').trim();

const getDocumentIfscValue = (doc) =>
  String(doc?.ifsc || doc?.ifscCode || doc?.ifsc_code || '').trim().toUpperCase();

const getDocumentAccountHolderNameValue = (doc) =>
  String(
    doc?.accountHolderName ||
    doc?.account_holder_name ||
    doc?.beneficiaryName ||
    doc?.benificiary_name ||
    '',
  ).trim();

const normalizeVerificationType = (value) => {
  const normalized = String(value || 'none').trim().toLowerCase();
  return ['driving_license', 'pan', 'gstin', 'rc', 'bank_account'].includes(normalized) ? normalized : 'none';
};

const templateNeedsBirthDate = (template = {}) =>
  normalizeVerificationType(template?.verification_type) === 'driving_license';

const templateSupportsRequestNumber = (template = {}) =>
  normalizeVerificationType(template?.verification_type) === 'driving_license';

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

const buildTemplateMetaState = (templates = [], documents = {}) =>
  Object.fromEntries(
    templates.map((template) => {
      const templateFields = Array.isArray(template.fields) ? template.fields : [];
      const firstDocument = templateFields
        .map((field) => normalizeDocument(documents?.[field.key]))
        .find(Boolean);

      return [
        template.id,
        {
          identifyNumber: getDocumentIdentifyValue(firstDocument),
          expiryDate: getDocumentExpiryValue(firstDocument),
          birthDate: getDocumentBirthDateValue(firstDocument),
          requestNumber: getDocumentRequestNumberValue(firstDocument),
          ifsc: getDocumentIfscValue(firstDocument),
          accountHolderName: getDocumentAccountHolderNameValue(firstDocument),
        },
      ];
    }),
  );

const formatMetaLabel = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

// web: FileReader.readAsDataURL(file) (+ canvas re-encode for images)
const fileToDataUrl = async (file) => {
  try {
    const base64 = await new File(file.uri).base64();
    return `data:${String(file.type || 'image/jpeg')};base64,${base64}`;
  } catch {
    throw new Error('Failed to read file');
  }
};

const prepareImageFileForUpload = async (file) => {
  const originalDataUrl = await fileToDataUrl(file);
  if (!String(originalDataUrl || '').startsWith('data:image/')) {
    throw new Error('Please upload an image file');
  }
  return originalDataUrl;
};

const normalizeSignupRole = (role) =>
  String(role || 'driver').toLowerCase() === 'owner' ? 'owner' : 'driver';

const matchesDocumentRole = (accountType, role) => {
  const rawAccountType = String(accountType || '').trim().toLowerCase();
  const normalizedAccountType = rawAccountType || 'individual';
  const normalizedRole = normalizeSignupRole(role);

  if (normalizedAccountType === 'both') {
    return true;
  }

  if (normalizedRole === 'owner') {
    if (!rawAccountType) {
      return true;
    }

    return ['fleet_drivers', 'owner', 'owners', 'fleet_owner', 'fleet_owners'].includes(normalizedAccountType);
  }

  return normalizedAccountType === 'individual';
};

const isImageLikeFile = (file) => {
  if (!file) {
    return false;
  }

  if (String(file.type || '').startsWith('image/')) {
    return true;
  }

  return /\.(jpg|jpeg|png|webp|heic|heif|bmp|gif)$/i.test(String(file.name || ''));
};

const inferImageMeta = (file, dataUrl) => {
  const mimeMatch = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
  const mimeType = String(file?.type || mimeMatch?.[1] || 'image/jpeg').toLowerCase();
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const originalName = String(file?.name || '').trim();

  return {
    mimeType,
    fileName: originalName || `capture-${Date.now()}.${extension}`,
  };
};

const chunk = (list, size) => {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
};

// One meta input card: icon box + label + input (group focus-within styles of the web)
const MetaCard = ({ Icon, label, focused, error, children }) => (
  <View style={[styles.metaCard, error ? styles.metaCardError : null, focused ? styles.metaCardFocused : null]}>
    <View style={styles.metaRow}>
      <View style={[styles.metaIcon, focused ? styles.metaIconFocused : null]}>
        <Icon size={20} strokeWidth={2.5} color={focused ? colors.white : colors.slate[500]} />
      </View>
      <View style={styles.metaBody}>
        <Text style={styles.metaLabel}>{label}</Text>
        {children}
      </View>
    </View>
  </View>
);

const StepDocumentsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner')
    ? '/taxi/owner'
    : '/taxi/driver';
  const session = getStoredDriverRegistrationSession();
  const isHandlingHistoryNavigationRef = useRef(false);
  const finishedRef = useRef(false);
  const isMetaInitializedRef = useRef(false);
  const normalizedRole = normalizeSignupRole(session.role);
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const registrationId = String(session.registrationId || '').trim();

  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [docs, setDocs] = useState(() =>
    Object.fromEntries(
      Object.entries(session.documents || {}).map(([key, value]) => [key, normalizeDocument(value)]),
    ),
  );
  const [documentMeta, setDocumentMeta] = useState(() => session.documentMeta || {});
  const [uploading, setUploading] = useState(null);
  const [verifyingTemplateId, setVerifyingTemplateId] = useState('');
  const [verificationMessages, setVerificationMessages] = useState({});
  const [verificationErrors, setVerificationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedInput, setFocusedInput] = useState('');
  const focusProps = (key) => ({
    onFocus: () => setFocusedInput(key),
    onBlur: () => setFocusedInput((current) => (current === key ? '' : current)),
  });

  useEffect(() => {
    if (finishedRef.current) {
      return;
    }

    if (!phone || !registrationId) {
      navigate(`${routePrefix}/reg-phone`, { replace: true });
    }
  }, [navigate, phone, registrationId, routePrefix]);

  useEffect(() => {
    const loadTemplates = async () => {
      setTemplatesLoading(true);

      try {
        const response = await getDriverDocumentTemplates(normalizedRole);
        const results = response?.data?.data?.results || response?.data?.results || [];
        setTemplates(normalizeDriverDocumentTemplates(results));
      } catch {
        setTemplates(normalizeDriverDocumentTemplates([]));
      } finally {
        setTemplatesLoading(false);
      }
    };

    loadTemplates();
  }, [normalizedRole]);

  const documentTemplates = useMemo(
    () =>
      normalizeDriverDocumentTemplates(templates).filter((template) =>
        matchesDocumentRole(template.account_type, normalizedRole),
      ),
    [normalizedRole, templates],
  );
  const uploadFields = useMemo(
    () => flattenDriverDocumentFields(documentTemplates),
    [documentTemplates],
  );
  const requiredUploadFields = useMemo(
    () => uploadFields.filter((item) => Boolean(item.isRequired)),
    [uploadFields],
  );
  const templateFieldMap = useMemo(
    () =>
      Object.fromEntries(
        documentTemplates.map((template) => [template.id, Array.isArray(template.fields) ? template.fields : []]),
      ),
    [documentTemplates],
  );

  useEffect(() => {
    if (documentTemplates.length > 0 && !isMetaInitializedRef.current) {
      setDocumentMeta(buildTemplateMetaState(documentTemplates, docs));
      isMetaInitializedRef.current = true;
    }
  }, [documentTemplates, docs]);

  useEffect(() => {
    if (finishedRef.current) {
      return;
    }

    saveDriverRegistrationSession({
      ...getStoredDriverRegistrationSession(),
      ...session,
      documents: docs,
      documentMeta,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same deps as the web
  }, [docs, documentMeta]);

  const buildCurrentSession = () => saveDriverRegistrationSession({
    ...getStoredDriverRegistrationSession(),
    ...session,
    documents: docs,
    documentMeta,
  });

  // web: window.confirm(...) on the back arrow and on the browser / phone back (popstate)
  const handleBackNavigation = () => {
    Alert.alert('', 'Go back to vehicle setup? Your uploaded documents will stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        onPress: () => {
          isHandlingHistoryNavigationRef.current = true;
          buildCurrentSession();
          navigate(`${routePrefix}/step-vehicle`, { replace: true });
        },
      },
    ]);
  };

  useBeforeLeave(() => {
    if (isHandlingHistoryNavigationRef.current || finishedRef.current) {
      return false;
    }
    handleBackNavigation();
    return true;
  });

  const applyTemplateMetaToDocuments = (templateId, templateDocuments, metaOverride = null) => {
    const meta = metaOverride || documentMeta[templateId] || {
      identifyNumber: '',
      expiryDate: '',
      birthDate: '',
      requestNumber: '',
      ifsc: '',
      accountHolderName: '',
    };
    const identifyNumber = String(meta.identifyNumber || '').trim();
    const expiryDate = String(meta.expiryDate || '').trim();
    const birthDate = String(meta.birthDate || '').trim();
    const requestNumber = String(meta.requestNumber || '').trim();
    const ifsc = String(meta.ifsc || '').trim().toUpperCase();
    const accountHolderName = String(meta.accountHolderName || '').trim();

    return Object.fromEntries(
      Object.entries(templateDocuments).map(([docKey, docValue]) => [
        docKey,
        docValue
          ? {
              ...docValue,
              identifyNumber,
              identify_number: identifyNumber,
              documentNumber: identifyNumber,
              document_number: identifyNumber,
              expiryDate,
              expiry_date: expiryDate,
              birthDate,
              birth_date: birthDate,
              requestNumber,
              request_no: requestNumber,
              ifsc,
              ifscCode: ifsc,
              ifsc_code: ifsc,
              accountHolderName,
              account_holder_name: accountHolderName,
              beneficiaryName: accountHolderName,
              benificiary_name: accountHolderName,
            }
          : docValue,
      ]),
    );
  };

  const handleMetaChange = (templateId, fieldName, nextValue) => {
    const nextMeta = {
      ...(documentMeta[templateId] || {}),
      [fieldName]: nextValue,
    };

    setDocumentMeta((current) => ({
      ...current,
      [templateId]: nextMeta,
    }));

    const templateFields = templateFieldMap[templateId] || [];
    if (templateFields.length === 0) {
      return;
    }

    setDocs((current) => {
      const nextDocuments = { ...current };
      for (const field of templateFields) {
        if (!nextDocuments[field.key]) {
          continue;
        }

        nextDocuments[field.key] = applyTemplateMetaToDocuments(
          templateId,
          { [field.key]: nextDocuments[field.key] },
          nextMeta,
        )[field.key];
      }
      return nextDocuments;
    });
  };

  // The RC number was typed on Step 3 (vehicle details): copy it into the RC document instead of asking again.
  const sessionRcNumber = String(getStoredDriverRegistrationSession().rcNumber || '').trim().toUpperCase();
  useEffect(() => {
    if (!sessionRcNumber) return;
    documentTemplates.forEach((template) => {
      if (getTemplateKind(template) !== 'rc' || !template.has_identify_number) return;
      if ((documentMeta[template.id]?.identifyNumber || '') !== sessionRcNumber) {
        handleMetaChange(template.id, 'identifyNumber', sessionRcNumber);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same deps as the web
  }, [documentTemplates, sessionRcNumber]);

  const uploadDocumentFromSource = async ({ templateId, key, dataUrl, fileName = '', mimeType = 'image/jpeg', previewUri = '' }) => {
    setUploading(key);
    setError('');

    try {
      const effectiveMimeType = String(mimeType || '').trim() || 'image/jpeg';
      const effectiveFileName = String(fileName || '').trim()
        || `capture-${Date.now()}.${effectiveMimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`;

      setDocs((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          previewUrl: previewUri || dataUrl,
          fileName: effectiveFileName,
          mimeType: effectiveMimeType,
          uploaded: false,
          uploading: true,
        },
      }));

      const response = await saveDriverDocuments({
        registrationId: session.registrationId,
        phone: session.phone,
        documents: {
          [key]: {
            dataUrl,
            fileName: effectiveFileName,
            mimeType: effectiveMimeType,
            identifyNumber: documentMeta[templateId]?.identifyNumber || '',
            expiryDate: documentMeta[templateId]?.expiryDate || '',
            birthDate: documentMeta[templateId]?.birthDate || '',
            requestNumber: documentMeta[templateId]?.requestNumber || '',
            ifsc: documentMeta[templateId]?.ifsc || '',
            accountHolderName: documentMeta[templateId]?.accountHolderName || '',
          },
        },
      });
      const payload = unwrap(response);

      const uploadedDoc = payload?.documents?.[key] || payload?.session?.documents?.[key];
      const nextDoc = normalizeDocument(uploadedDoc) || {
        previewUrl: dataUrl,
        secureUrl: dataUrl,
        fileName: effectiveFileName,
        mimeType: effectiveMimeType,
        uploaded: true,
      };
      const nextDocWithMeta = applyTemplateMetaToDocuments(templateId, {
        [key]: {
          ...(docs[key] || {}),
          ...nextDoc,
        },
      })[key];

      setDocs((prev) => ({
        ...prev,
        [key]: nextDocWithMeta,
      }));

      const storedSession = getStoredDriverRegistrationSession();
      saveDriverRegistrationSession({
        ...storedSession,
        ...session,
        documents: {
          ...(storedSession.documents || {}),
          [key]: nextDocWithMeta,
        },
      });
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload document');
      setDocs((prev) => ({
        ...prev,
        [key]: normalizeDocument(session.documents?.[key]),
      }));
    } finally {
      setUploading(null);
    }
  };

  // web: the <input type="file"> change handler (gallery, or the camera input)
  const handlePickedFile = async (templateId, key, file) => {
    if (!file) {
      return;
    }

    try {
      const dataUrl = isImageLikeFile(file)
        ? await prepareImageFileForUpload(file)
        : await fileToDataUrl(file);
      const inferred = inferImageMeta(file, dataUrl);

      await uploadDocumentFromSource({
        templateId,
        key,
        dataUrl,
        fileName: inferred.fileName,
        mimeType: inferred.mimeType,
        previewUri: file.uri,
      });
    } catch (pickError) {
      setError(pickError?.message || 'Unable to upload document');
    }
  };

  const handleGallery = async (templateId, key) => {
    if (uploading === key) return;
    try {
      const file = await pickImage({ source: 'library', quality: 0.82, maxSide: 1600 });
      await handlePickedFile(templateId, key, file);
    } catch (pickError) {
      setError(pickError?.message || 'Unable to upload document');
    }
  };

  // web: the Flutter camera bridge, else <input type="file" capture="environment">
  const handleCameraCapture = async (templateId, key) => {
    try {
      const file = await pickImage({ source: 'camera', quality: 0.82, maxSide: 1600 });
      await handlePickedFile(templateId, key, file);
    } catch (cameraError) {
      setError(cameraError?.message || 'Unable to open the camera');
    }
  };

  const handleVerifyDrivingLicense = async (template) => {
    const templateId = String(template?.id || '').trim();
    const templateFields = templateFieldMap[templateId] || [];
    const primaryField = templateFields[0];
    const documentKey = String(primaryField?.key || '').trim();
    const meta = documentMeta[templateId] || {};
    const identifyNumber = String(meta.identifyNumber || '').trim().toUpperCase();
    const birthDate = String(meta.birthDate || '').trim();
    const requestNumber = String(meta.requestNumber || '').trim();

    if (!templateId || !documentKey) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: 'Driving license document is not configured properly',
      }));
      return;
    }

    if (!identifyNumber) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: 'Enter the driving license number first',
      }));
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: 'Enter the birth date in YYYY-MM-DD format',
      }));
      return;
    }

    setVerifyingTemplateId(templateId);
    setVerificationErrors((prev) => ({ ...prev, [templateId]: '' }));
    setVerificationMessages((prev) => ({ ...prev, [templateId]: '' }));
    setError('');

    try {
      const response = await verifyDriverOnboardingLicenseDocument(documentKey, {
        registrationId: session.registrationId,
        phone: session.phone,
        licenseNumber: identifyNumber,
        birthDate,
        requestNumber,
      });

      const payload = unwrap(response);
      const verifiedDocument = normalizeDocument(payload?.document);

      if (verifiedDocument) {
        setDocs((current) => ({
          ...current,
          [documentKey]: {
            ...(current[documentKey] || {}),
            ...verifiedDocument,
            uploaded: current[documentKey]?.uploaded ?? verifiedDocument.uploaded ?? false,
          },
        }));
      }

      const nextRequestNumber = String(
        verifiedDocument?.requestNumber ||
        verifiedDocument?.request_no ||
        requestNumber,
      ).trim();

      setDocumentMeta((current) => ({
        ...current,
        [templateId]: {
          ...(current[templateId] || {}),
          identifyNumber,
          birthDate,
          requestNumber: nextRequestNumber,
        },
      }));

      setVerificationMessages((prev) => ({
        ...prev,
        [templateId]: String(payload?.message || 'Driving license verified successfully').trim(),
      }));
    } catch (requestError) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: requestError?.message || 'Unable to verify driving license',
      }));
    } finally {
      setVerifyingTemplateId('');
    }
  };

  // A document whose expiry date is already over cannot be submitted (optional ones included).
  const expiredTemplate = documentTemplates.find(
    (template) => template.has_expiry_date && isPastExpiryDate(documentMeta[template.id]?.expiryDate),
  );

  const isComplete =
    !expiredTemplate &&
    requiredUploadFields.every((item) => Boolean(docs[item.key]?.uploaded || docs[item.key]?.secureUrl)) &&
    documentTemplates.every((template) => {
      if (!template.is_required) {
        return true;
      }

      const meta = documentMeta[template.id] || {};
      const hasIdentifyNumber = !template.has_identify_number
        || (Boolean(String(meta.identifyNumber || '').trim()) && !getIdentifyNumberError(template, meta.identifyNumber));
      const hasExpiryDate = !template.has_expiry_date || Boolean(String(meta.expiryDate || '').trim());
      const hasBirthDate = !templateNeedsBirthDate(template) || /^\d{4}-\d{2}-\d{2}$/.test(String(meta.birthDate || '').trim());
      const needsBankMeta = normalizeVerificationType(template.verification_type) === 'bank_account';
      const hasBankMeta = !needsBankMeta || (
        Boolean(String(meta.ifsc || '').trim()) && !getIfscError(meta.ifsc) &&
        Boolean(String(meta.accountHolderName || '').trim()) && !getHolderNameError(meta.accountHolderName)
      );
      return hasIdentifyNumber && hasExpiryDate && hasBirthDate && hasBankMeta;
    }) &&
    !uploading &&
    !templatesLoading;

  const handleSubmit = async () => {
    if (!isComplete) {
      setError(
        uploading
          ? 'Please wait for the current upload to finish'
          : expiredTemplate
            ? `${expiredTemplate.name} has expired. Enter a valid (future) expiry date.`
            : 'Please upload every required document image',
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      const submittedDocuments = Object.fromEntries(
        Object.entries(docs).filter(([, value]) => Boolean(value?.uploaded || value?.secureUrl)),
      );
      const submittedDocumentsWithMeta = { ...submittedDocuments };

      for (const template of documentTemplates) {
        const templateFields = Array.isArray(template.fields) ? template.fields : [];
        const templateDocuments = Object.fromEntries(
          templateFields
            .filter((field) => submittedDocumentsWithMeta[field.key])
            .map((field) => [field.key, submittedDocumentsWithMeta[field.key]]),
        );

        if (Object.keys(templateDocuments).length === 0) {
          continue;
        }

        Object.assign(
          submittedDocumentsWithMeta,
          applyTemplateMetaToDocuments(template.id, templateDocuments),
        );
      }

      const submittedDocumentSummary = uploadFields.map((field) => ({
        key: field.key,
        label: field.label || field.templateName || field.key,
        status: submittedDocumentsWithMeta[field.key] ? 'pending' : 'missing',
        reason: '',
        verificationType: field.verificationType || 'none',
        providerStatus:
          submittedDocumentsWithMeta[field.key] && String(field.verificationType || 'none') !== 'none'
            ? 'queued'
            : 'not_started',
        providerMessage:
          submittedDocumentsWithMeta[field.key] && String(field.verificationType || 'none') !== 'none'
            ? 'Verification will start shortly'
            : '',
        previewUrl: String(
          submittedDocumentsWithMeta[field.key]?.previewUrl ||
          submittedDocumentsWithMeta[field.key]?.secureUrl ||
          submittedDocumentsWithMeta[field.key]?.url ||
          '',
        ).trim(),
        reverificationPending: false,
      }));

      const completeResponse = await completeDriverOnboarding({
        registrationId: session.registrationId,
        phone: session.phone,
        documents: submittedDocumentsWithMeta,
      });
      const payload = unwrap(completeResponse);

      const token = payload?.token;
      if (token) {
        const authRole =
          String(session.role || 'driver').toLowerCase() === 'owner' ? 'owner' : 'driver';
        persistDriverAuthSession({ token, role: authRole });
      }

      saveDriverRegistrationSession({
        ...session,
        documents: docs,
        completedRegistration: payload || null,
      });
      const routeState = {
        role: normalizedRole,
        completedRegistration: toPlainData(payload),
        submittedDocumentSummary,
      };
      finishedRef.current = true;
      clearDriverRegistrationSession();
      navigate(`${routePrefix}/registration-status`, { replace: true, state: routeState });
    } catch (submitError) {
      setError(submitError?.message || 'Unable to complete registration');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (template, field) => {
    const document = docs[field.key];
    const isUploading = uploading === field.key;
    const isRequired = Boolean(field.required ?? field.isRequired);

    return (
      <View key={field.key} style={styles.fieldBlock}>
        <View style={styles.fieldHead}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <View style={[styles.reqBadge, { backgroundColor: isRequired ? colors.emerald[50] : colors.slate[50] }]}>
            <Text style={[styles.reqBadgeText, { color: isRequired ? colors.emerald[600] : colors.slate[500] }]}>
              {isRequired ? 'Required' : 'Optional'}
            </Text>
          </View>
        </View>

        <View style={styles.stack12}>
          <Pressable
            disabled={isUploading}
            onPress={() => handleGallery(template.id, field.key)}
            accessibilityLabel={`Upload ${field.label} from gallery`}
            style={[styles.tile, document?.previewUrl ? styles.tileFilled : styles.tileEmpty]}
          >
            {isUploading ? (
              <View style={styles.tileUploading}>
                <Spin>
                  <View style={styles.tileRing} />
                </Spin>
                <Text style={styles.tileHint}>Uploading</Text>
              </View>
            ) : document?.previewUrl ? (
              <>
                <AppImage src={document.previewUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={[StyleSheet.absoluteFill, styles.tileShade]} />
                <View style={styles.tileCheck}>
                  <CheckCircle2 size={16} strokeWidth={3} color={colors.white} />
                </View>
                <View style={styles.retakeChip}>
                  <Camera size={12} color={colors.white} />
                  <Text style={styles.retakeText}>Retake Photo</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.tileIcon}>
                  <UploadCloud size={20} color={colors.slate[500]} />
                </View>
                <Text style={styles.tileHint}>Tap to upload</Text>
                <View style={styles.tileCamera}>
                  <Camera size={14} color={colors.slate[500]} />
                </View>
              </>
            )}
          </Pressable>

          <View style={styles.pickRow}>
            <Pressable
              disabled={isUploading}
              onPress={() => handleGallery(template.id, field.key)}
              accessibilityLabel={`Upload ${field.label} from gallery`}
              style={({ pressed }) => [
                styles.pickBtn,
                isUploading ? styles.pickBtnBusy : styles.galleryIdle,
                pressed && !isUploading ? styles.pressedTiny : null,
              ]}
            >
              <ImagePlus size={16} color={isUploading ? colors.slate[400] : colors.slate[600]} />
              <Text style={[styles.pickText, { color: isUploading ? colors.slate[400] : colors.slate[600] }]}>Gallery</Text>
            </Pressable>
            <Pressable
              disabled={isUploading}
              onPress={() => handleCameraCapture(template.id, field.key)}
              accessibilityLabel={`Capture ${field.label} from camera`}
              style={({ pressed }) => [
                styles.pickBtn,
                isUploading ? styles.pickBtnBusy : styles.cameraIdle,
                pressed && !isUploading ? styles.pressedTiny : null,
              ]}
            >
              <Camera size={16} color={isUploading ? colors.slate[400] : colors.white} />
              <Text style={[styles.pickText, { color: isUploading ? colors.slate[400] : colors.white }]}>Camera</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderTemplate = (template) => {
    const verificationType = normalizeVerificationType(template.verification_type);
    const meta = documentMeta[template.id] || {};
    const identifyError = getIdentifyNumberError(template, meta.identifyNumber);
    const identifyLabel = formatMetaLabel(template.identify_number_key) || `${template.name} Number`;
    const showIdentify = template.has_identify_number
      && !(getTemplateKind(template) === 'rc' && sessionRcNumber)
      && !(getTemplateKind(template) === 'dl' && !getIdentifyNumberError(template, meta.identifyNumber) && meta.identifyNumber);
    const ifscError = getIfscError(meta.ifsc);
    const holderError = getHolderNameError(meta.accountHolderName);

    const dlDetails = (() => {
      const primaryField = (templateFieldMap[template.id] || [])[0];
      const verifiedDoc = primaryField ? docs[primaryField.key] : null;
      return getDrivingLicenseVerificationDetails(verifiedDoc);
    })();

    return (
      <View key={template.id} style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardHeadText}>
            <Text style={styles.cardTitle}>{template.name}</Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardMeta}>{template.fields.length > 1 ? 'Multiple Sides' : 'Single Side'}</Text>
              <View style={styles.dot} />
              <Text style={[styles.cardMeta, { color: template.is_required ? colors.emerald[600] : colors.slate[500] }]}>
                {template.is_required ? 'Mandatory' : 'Optional'}
              </Text>
            </View>
          </View>
          <View style={styles.accountBadge}>
            <Text style={styles.accountBadgeText}>{template.account_type || 'individual'}</Text>
          </View>
        </View>

        <View style={styles.fieldsStack}>
          {template.fields.map((field) => renderField(template, field))}
        </View>

        {(template.has_identify_number || template.has_expiry_date || verificationType === 'bank_account') && verificationType !== 'none' ? (
          <View style={styles.apiNoteWrap}>
            <Text style={styles.apiNote}>Verification details required for API check</Text>
          </View>
        ) : null}

        {(template.has_identify_number || template.has_expiry_date || templateNeedsBirthDate(template) || templateSupportsRequestNumber(template) || verificationType === 'bank_account') ? (
          <View style={styles.metaStack}>
            {/* RC number and licence number are already typed on Step 3: don't ask them a second time. */}
            {showIdentify ? (
              <MetaCard Icon={FileText} label={identifyLabel} focused={focusedInput === `${template.id}:number`} error={Boolean(identifyError)}>
                <TextInput
                  value={meta.identifyNumber || ''}
                  onChangeText={(text) => handleMetaChange(template.id, 'identifyNumber', cleanIdentifyNumber(template, text))}
                  keyboardType={getTemplateKind(template) === 'aadhaar' ? 'number-pad' : 'default'}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder={`Enter ${formatMetaLabel(template.identify_number_key) || `${template.name} number`}`}
                  placeholderTextColor={colors.slate[500]}
                  style={styles.input}
                  {...focusProps(`${template.id}:number`)}
                />
                {identifyError ? <Text style={styles.inputError}>{identifyError}</Text> : null}
              </MetaCard>
            ) : null}

            {templateNeedsBirthDate(template) ? (
              <MetaCard Icon={AlertCircle} label="Birth Date">
                <NativeDateInput
                  value={meta.birthDate || ''}
                  onChangeValue={(value) => handleMetaChange(template.id, 'birthDate', value)}
                  textStyle={styles.input}
                  placeholderColor={colors.slate[900]}
                />
              </MetaCard>
            ) : null}

            {template.has_expiry_date ? (
              <MetaCard Icon={AlertCircle} label="Expiry Date">
                <NativeDateInput
                  min={todayDateInputValue()}
                  value={meta.expiryDate || ''}
                  onChangeValue={(value) => handleMetaChange(template.id, 'expiryDate', value)}
                  textStyle={styles.input}
                  placeholderColor={colors.slate[900]}
                />
                {isPastExpiryDate(meta.expiryDate) ? (
                  <Text style={styles.inputError}>This date is over. Pick today or a later date.</Text>
                ) : null}
              </MetaCard>
            ) : null}

            {templateSupportsRequestNumber(template) ? (
              <MetaCard Icon={FileText} label="Request Number" focused={focusedInput === `${template.id}:request`}>
                <TextInput
                  value={meta.requestNumber || ''}
                  onChangeText={(text) => handleMetaChange(template.id, 'requestNumber', text)}
                  placeholder="Optional, auto-generated later if left blank"
                  placeholderTextColor={colors.slate[500]}
                  style={styles.input}
                  {...focusProps(`${template.id}:request`)}
                />
              </MetaCard>
            ) : null}

            {verificationType === 'driving_license' ? (
              <View style={styles.stack12}>
                <View style={styles.verifyRow}>
                  <Pressable
                    onPress={() => handleVerifyDrivingLicense(template)}
                    disabled={verifyingTemplateId === template.id}
                    style={[styles.verifyBtn, verifyingTemplateId === template.id ? styles.verifyBtnBusy : styles.verifyBtnIdle]}
                  >
                    <Text style={[styles.verifyText, { color: verifyingTemplateId === template.id ? colors.slate[500] : colors.white }]}>
                      {verifyingTemplateId === template.id ? 'Verifying...' : 'Verify DL'}
                    </Text>
                  </Pressable>
                </View>
                {verificationMessages[template.id] ? (
                  <Text style={[styles.note, { color: colors.emerald[600] }]}>{verificationMessages[template.id]}</Text>
                ) : null}
                {verificationErrors[template.id] ? (
                  <Text style={[styles.note, { color: colors.amber[600] }]}>{verificationErrors[template.id]}</Text>
                ) : null}
                {dlDetails.length > 0 ? (
                  <View style={styles.verifiedBox}>
                    <View style={styles.verifiedHead}>
                      <ShieldCheck size={15} color={colors.emerald[600]} />
                      <Text style={styles.verifiedTitle}>Verified From DL</Text>
                    </View>
                    <View style={styles.detailsGrid}>
                      {chunk(dlDetails, 2).map((row, index) => (
                        <View key={`dl-${index}`} style={styles.gridRow}>
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
                  </View>
                ) : null}
              </View>
            ) : null}

            {verificationType === 'bank_account' ? (
              <MetaCard Icon={FileText} label="IFSC Code" focused={focusedInput === `${template.id}:ifsc`}>
                <TextInput
                  value={meta.ifsc || ''}
                  onChangeText={(text) => handleMetaChange(template.id, 'ifsc', text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Enter IFSC code"
                  placeholderTextColor={colors.slate[500]}
                  style={styles.input}
                  {...focusProps(`${template.id}:ifsc`)}
                />
                {ifscError ? <Text style={styles.inputError}>{ifscError}</Text> : null}
              </MetaCard>
            ) : null}

            {verificationType === 'bank_account' ? (
              <MetaCard Icon={FileText} label="Account Holder Name" focused={focusedInput === `${template.id}:holder`}>
                <TextInput
                  value={meta.accountHolderName || ''}
                  onChangeText={(text) => handleMetaChange(template.id, 'accountHolderName', text.replace(/[^A-Za-z .'-]/g, '').slice(0, 60))}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder="Enter account holder name"
                  placeholderTextColor={colors.slate[500]}
                  style={styles.input}
                  {...focusProps(`${template.id}:holder`)}
                />
                {holderError ? <Text style={styles.inputError}>{holderError}</Text> : null}
              </MetaCard>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

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
              <Text style={styles.stepBadgeText}>Step 4 of 4</Text>
            </View>
          </View>

          <View style={styles.column}>
            <View style={styles.intro}>
              <View style={styles.introRow}>
                <View style={styles.introIcon}>
                  <ShieldCheck size={22} strokeWidth={2.5} color={colors.white} />
                </View>
                <Text style={styles.introLabel}>Identity Verification</Text>
              </View>
              <Text style={styles.heading}>
                {'KYC '}
                <Text style={styles.headingMuted}>Vault</Text>
              </Text>
              <Text style={styles.lead}>
                Upload clear photos of the required documents to verify your identity.
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.cards}>
              {templatesLoading ? (
                <View style={styles.loadingCard}>
                  <View style={styles.loadingIcon}>
                    <FileText size={20} color={colors.slate[400]} />
                  </View>
                  <Text style={styles.loadingText}>Loading checklist...</Text>
                </View>
              ) : (
                documentTemplates.map(renderTemplate)
              )}
            </View>

            <View style={styles.tipBox}>
              <View style={styles.tipIcon}>
                <AlertCircle size={20} color={colors.amber[600]} />
              </View>
              <Text style={styles.tipText}>
                Choose Gallery or Camera for each document. Ensure all photos are well-lit and all text is clearly readable to avoid rejection.
              </Text>
            </View>
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
              onPress={handleSubmit}
              disabled={loading || !isComplete}
              style={({ pressed }) => [
                styles.continueBtn,
                isComplete ? styles.continueEnabled : styles.continueIdle,
                isComplete && pressed ? styles.pressed : null,
              ]}
            >
              {loading ? (
                <Spin>
                  <View style={styles.ring} />
                </Spin>
              ) : (
                <>
                  <Text style={[styles.continueText, { color: isComplete ? colors.white : colors.slate[600] }]}>Review & Submit</Text>
                  <ChevronRight size={18} strokeWidth={3} color={isComplete ? colors.white : colors.slate[600]} />
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
const StepDocuments = () => {
  const focused = useIsFocused();
  return focused ? <StepDocumentsPage /> : null;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingTop: 20, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 384, alignSelf: 'center', gap: 24 },
  flex1: { flex: 1, minWidth: 0 },
  stack12: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
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
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  pressedSmall: { transform: [{ scale: 0.95 }] },
  pressedTiny: { transform: [{ scale: 0.98 }] },
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
  cards: { gap: 24 },
  loadingCard: {
    alignItems: 'center',
    gap: 16,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    padding: 48,
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  loadingIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.slate[500] },
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
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardHeadText: { flex: 1, minWidth: 0, gap: 6 },
  cardTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', letterSpacing: -0.45, color: colors.slate[900] },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardMeta: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.slate[500] },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.slate[200] },
  accountBadge: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: alpha('#0f172a', 0.05),
    backgroundColor: alpha('#0f172a', 0.05),
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  accountBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: colors.slate[500] },
  fieldsStack: { gap: 24 },
  fieldBlock: { gap: 12 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  fieldLabel: { flexShrink: 1, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.slate[500] },
  reqBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  reqBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 1.35, textTransform: 'uppercase' },
  tile: {
    minHeight: 160,
    borderRadius: 28.8,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileFilled: { borderColor: alpha(colors.emerald[500], 0.2), backgroundColor: alpha(colors.emerald[50], 0.1) },
  tileEmpty: { borderStyle: 'dashed', borderColor: colors.slate[100], backgroundColor: colors.slate[50] },
  tileUploading: { alignItems: 'center', gap: 12 },
  tileRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.slate[200], borderTopColor: colors.slate[900] },
  tileShade: { backgroundColor: alpha(colors.black, 0.1) },
  tileCheck: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.emerald[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.xl,
  },
  retakeChip: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    backgroundColor: alpha(colors.black, 0.4),
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retakeText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.white },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  tileHint: { textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.slate[500] },
  tileCamera: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 14,
    backgroundColor: alpha('#0f172a', 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: { flexDirection: 'row', gap: 8 },
  pickBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  pickBtnBusy: { borderColor: colors.slate[200], backgroundColor: colors.slate[50] },
  galleryIdle: { borderColor: colors.slate[100], backgroundColor: colors.white },
  // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme); the border stays slate-900
  cameraIdle: {
    borderColor: colors.slate[900],
    backgroundColor: driverTheme.button,
    ...shadow.lg,
    shadowColor: '#0f172a',
  },
  pickText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  apiNoteWrap: { gap: 8, paddingTop: 8 },
  apiNote: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.slate[600] },
  metaStack: { gap: 16, paddingTop: 8 },
  metaCard: {
    borderRadius: 28.8,
    borderWidth: 2,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    padding: 16,
  },
  metaCardError: { borderColor: colors.rose[200], backgroundColor: alpha(colors.rose[50], 0.3) },
  metaCardFocused: {
    borderColor: alpha('#0f172a', 0.1),
    backgroundColor: colors.white,
    ...shadow.xl,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  metaIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  metaIconFocused: { backgroundColor: colors.slate[900] },
  metaBody: { flex: 1, minWidth: 0, gap: 2 },
  metaLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.slate[600] },
  input: { width: '100%', fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.slate[900], paddingVertical: 0 },
  inputError: { paddingTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.rose[600] },
  verifyRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  verifyBtn: { borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 8 },
  // web: bg-slate-900 button -> the partner button blue
  verifyBtnIdle: { backgroundColor: driverTheme.button },
  verifyBtnBusy: { backgroundColor: colors.slate[200] },
  verifyText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.65, textTransform: 'uppercase' },
  note: { paddingHorizontal: 4, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  verifiedBox: { borderRadius: 28.8, borderWidth: 1, borderColor: colors.emerald[100], backgroundColor: alpha(colors.emerald[50], 0.5), padding: 16 },
  verifiedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  verifiedTitle: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.emerald[700] },
  detailsGrid: { marginTop: 12, gap: 12 },
  detailItem: { flex: 1, minWidth: 0, borderRadius: 16, backgroundColor: alpha(colors.white, 0.9), paddingHorizontal: 12, paddingVertical: 8 },
  detailLabel: { fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 1.35, textTransform: 'uppercase', color: colors.slate[500] },
  detailValue: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[900] },
  tipBox: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 16,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.5),
    backgroundColor: alpha(colors.white, 0.4),
    padding: 20,
    ...shadow.sm,
  },
  tipIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: colors.amber[100], alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, fontSize: 12, lineHeight: 19.5, fontWeight: '700', letterSpacing: -0.3, textTransform: 'uppercase', color: alpha(colors.amber[900], 0.6) },
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
  continueIdle: { backgroundColor: colors.slate[300] },
  pressed: { transform: [{ scale: 0.98 }] },
  continueText: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha('#ffffff', 0.3), borderTopColor: '#ffffff' },
});

export default StepDocuments;
