// Web: pages/settings/DriverDocuments.jsx — /taxi/driver/documents, /taxi/owner/documents (signed-in driver / owner;
// DriverLayout also lets a pending account open it). Lists every document field of the admin templates with its
// status (Verified / Rejected / Pending / Expired / Uploaded / Missing), a viewer popup, Re-upload (POST
// /common/upload/image via useImageUpload, then updateDriverDocument), an expiry-date popup and a number / verify popup
// (DL / PAN / GST / RC / bank checks). location.state.focusDocumentKey opens the picker for that document at once.
// API: getCurrentDriver + getDriverDocumentTemplates, updateDriverDocument, verifyDriver{License,Pan,Gstin,Rc,Bank}Document.
// Native: <input type="file" accept="image/*"> = a Camera / Gallery chooser (the phone's chooser on the web);
// <input type="date"> = the system date dialog (YYYY-MM-DD); the three fixed overlays are Dialogs (they cover the bar).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, CalendarDays, Camera, CheckCircle2, Eye, FileText, Loader2, ShieldCheck, X, ArrowLeft } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { pickImage } from '@/lib/media';
import { toast } from '@/lib/toast';
import { AppImage, Dialog, Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { getCurrentDriver, getDriverDocumentTemplates, updateDriverDocument, verifyDriverBankDocument, verifyDriverGstinDocument, verifyDriverLicenseDocument, verifyDriverPanDocument, verifyDriverRcDocument } from '../../services/registrationService';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import {
  flattenDriverDocumentFields,
  getDocumentPreviewUrl,
  isPastExpiryDate,
  normalizeDriverDocumentTemplates,
  todayDateInputValue,
} from '../../utils/documentTemplates';
import { NativeDateInput } from '../../components/FleetDocumentFields';

const formatDate = (value) => {
  if (!value) return 'Uploaded';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const getDocumentReviewStatus = (document = {}) =>
  String(
    document?.approvalStatus ||
    document?.reviewStatus ||
    document?.status ||
    '',
  ).trim().toLowerCase();

const getDocumentReason = (document = {}) =>
  String(
    document?.comment ||
    document?.remarks ||
    document?.reason ||
    document?.admin_comment ||
    document?.rejection_reason ||
    '',
  ).trim();

const getDocumentExpiryValue = (document = {}) =>
  document?.expiryDate ||
  document?.expiry_date ||
  document?.expiry ||
  document?.expiresAt ||
  null;

const getDocumentIdentifyValue = (document = {}) =>
  String(
    document?.identifyNumber ||
    document?.identify_number ||
    document?.documentNumber ||
    document?.document_number ||
    '',
  ).trim();

const getDocumentBirthDateValue = (document = {}) =>
  String(document?.birthDate || document?.birth_date || '').trim();

const getDocumentRequestNumberValue = (document = {}) =>
  String(document?.requestNumber || document?.request_no || '').trim();

const getDocumentIfscValue = (document = {}) =>
  String(document?.ifsc || document?.ifscCode || document?.ifsc_code || '').trim().toUpperCase();

const getDocumentAccountHolderNameValue = (document = {}) =>
  String(
    document?.accountHolderName ||
    document?.account_holder_name ||
    document?.beneficiaryName ||
    document?.benificiary_name ||
    '',
  ).trim();

const isDrivingLicenseDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'driving_license' ||
  String(doc?.id || '').trim() === 'drivingLicense';

const isPanDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'pan' ||
  /\bpan\b/i.test(String(doc?.id || '')) ||
  /\bpan\b/i.test(String(doc?.name || '')) ||
  /\bpancard\b/i.test(String(doc?.id || '')) ||
  /\bpancard\b/i.test(String(doc?.name || ''));

const isGstDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'gstin' ||
  /\bgst\b/i.test(String(doc?.id || '')) ||
  /\bgstin\b/i.test(String(doc?.id || '')) ||
  /\bgst\b/i.test(String(doc?.name || '')) ||
  /\bgstin\b/i.test(String(doc?.name || ''));

const isRcDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'rc' ||
  /\brc\b/i.test(String(doc?.id || '')) ||
  /\bvehicle rc\b/i.test(String(doc?.name || '')) ||
  /\bregistration certificate\b/i.test(String(doc?.name || ''));

const isBankDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'bank_account' ||
  /\bbank\b/i.test(String(doc?.id || '')) ||
  /\bbank\b/i.test(String(doc?.name || ''));

const isDocumentExpired = (document = {}) => {
  const value = getDocumentExpiryValue(document);
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
};

const formatExpiryDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const unwrapDriver = (response) => response?.data?.data || response?.data || response || null;
const toTimestamp = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

// <input type="file" accept="image/*">: the phone offered camera or photos.
const chooseImage = () =>
  new Promise((resolve) => {
    const pick = async (source) => {
      try {
        resolve(await pickImage({ source }));
      } catch (error) {
        if (error?.code === 'PERMISSION_DENIED') toast.error(error.message);
        resolve(null);
      }
    };
    Alert.alert('Upload photo', undefined, [
      { text: 'Camera', onPress: () => pick('camera') },
      { text: 'Gallery', onPress: () => pick('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });

const ModalInputLabel = ({ Icon, children }) => (
  <View style={styles.modalLabelRow}>
    <Icon size={13} color={colors.slate[500]} />
    <Text style={styles.modalLabel}>{children}</Text>
  </View>
);

const DriverDocuments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const focusDocumentKey = String(location.state?.focusDocumentKey || '').trim();
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [driver, setDriver] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('');
  const [expiryModal, setExpiryModal] = useState({ isOpen: false, docId: '', name: '', value: '', isSubmitting: false });
  const [metaModal, setMetaModal] = useState({
    isOpen: false,
    mode: 'license',
    docId: '',
    name: '',
    identifyNumber: '',
    birthDate: '',
    requestNumber: '',
    ifsc: '',
    accountHolderName: '',
    isSubmitting: false,
    isVerifying: false,
  });
  const uploadingDocumentKeyRef = useRef('');
  const autoOpenedDocumentRef = useRef('');

  const {
    uploading: imageUploading,
    handleFileChange: onDocumentImageChange,
  } = useImageUpload({
    folder: 'driver-documents',
    onSuccess: async (url) => {
      const activeDocumentKey = uploadingDocumentKeyRef.current;

      if (!activeDocumentKey) {
        return;
      }

      const updatedDocument = {
        key: activeDocumentKey,
        fileName: activeDocumentKey,
        previewUrl: url,
        secureUrl: url,
        uploaded: true,
        uploadedAt: new Date().toISOString(),
      };

      try {
        const response = await updateDriverDocument(activeDocumentKey, updatedDocument);
        const documents = response?.data?.documents || {
          ...(driver?.documents || {}),
          [activeDocumentKey]: updatedDocument,
        };
        setDriver((prev) => ({ ...(prev || {}), documents }));
      } catch (requestError) {
        setError(requestError?.message || 'Unable to update document image');
      } finally {
        uploadingDocumentKeyRef.current = '';
        setUploadingDocumentKey('');
      }
    },
    onError: () => {
      uploadingDocumentKeyRef.current = '';
      setUploadingDocumentKey('');
    },
  });

  const loadDriver = async () => {
    setIsSyncing(true);
    setError('');

    try {
      const [driverResponse, templateResponse] = await Promise.all([
        getCurrentDriver(),
        getDriverDocumentTemplates(),
      ]);

      setDriver(unwrapDriver(driverResponse));
      setTemplates(normalizeDriverDocumentTemplates(templateResponse?.data?.data?.results || templateResponse?.data?.results || []));
    } catch (err) {
      setError(err?.message || 'Unable to load driver documents');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadDriver();
  }, []);

  const docs = useMemo(() => {
    const documents = driver?.documents || {};

    return flattenDriverDocumentFields(templates).map((field, index) => {
      const doc = documents[field.key] || null;
      const previewUrl = getDocumentPreviewUrl(doc);
      const uploadedAt = doc?.uploadedAt || doc?.createdAt || doc?.updatedAt || '';
      const hasDoc = Boolean(previewUrl || doc);
      const expiryDate = getDocumentExpiryValue(doc);
      const identifyNumber = getDocumentIdentifyValue(doc);
      const birthDate = getDocumentBirthDateValue(doc);
      const requestNumber = getDocumentRequestNumberValue(doc);
      const ifsc = getDocumentIfscValue(doc);
      const accountHolderName = getDocumentAccountHolderNameValue(doc);
      const expired = isDocumentExpired(doc);
      const rejected = ['rejected', 'declined'].includes(getDocumentReviewStatus(doc));
      const verified = ['verified', 'approved'].includes(getDocumentReviewStatus(doc));
      const reason = getDocumentReason(doc);
      const reverificationPending =
        getDocumentReviewStatus(doc) === 'pending' &&
        Math.max(
          toTimestamp(doc?.reverificationRequestedAt),
          toTimestamp(doc?.uploadedAt),
          toTimestamp(doc?.updatedAt),
        ) > toTimestamp(doc?.reviewedAt);

      return {
        id: field.key,
        // "Driving Licence - Front", not just "Front": a side label alone doesn't say which document it is.
        name: (() => {
          const label = String(field.label || '').trim();
          const template = String(field.templateName || '').trim();
          if (!template) return label;
          if (!label || label.toLowerCase().includes(template.toLowerCase())) return label || template;
          return `${template} - ${label}`;
        })(),
        templateName: field.templateName,
        verificationType: field.verificationType,
        hasExpiryDate: field.hasExpiryDate,
        rawDocument: doc,
        reviewStatus: getDocumentReviewStatus(doc),
        hasDocument: hasDoc,
        status: verified
          ? 'Verified'
          : rejected
            ? 'Rejected'
            : reverificationPending
              ? 'Pending Reverification'
              : expired
                ? 'Expired'
                : hasDoc
                  ? 'Uploaded'
                  : 'Missing',
        date: hasDoc ? formatDate(uploadedAt) : 'Not uploaded',
        previewUrl,
        fileName: doc?.fileName || field.label,
        uploadedAt,
        expiryDate,
        identifyNumber,
        birthDate,
        requestNumber,
        ifsc,
        accountHolderName,
        hasIdentifyNumber: field.hasIdentifyNumber,
        expired,
        rejected,
        reverificationPending,
        reason,
        verified,
        order: index,
      };
    });
  }, [driver?.documents, templates]);

  const uploadedCount = docs.filter((doc) => doc.hasDocument).length;
  const actionRequiredCount = docs.filter((doc) => !doc.verified).length;

  // web: <label><input type="file"/></label> -> pick, then the same upload hook
  const startDocumentUpload = async (docId) => {
    if (imageUploading) return;
    const file = await chooseImage();
    if (!file) return;
    uploadingDocumentKeyRef.current = docId;
    setUploadingDocumentKey(docId);
    onDocumentImageChange(file);
  };

  useEffect(() => {
    if (!focusDocumentKey || isLoading || imageUploading) {
      return undefined;
    }

    if (autoOpenedDocumentRef.current === focusDocumentKey) {
      return undefined;
    }

    const targetDoc = docs.find((doc) => doc.id === focusDocumentKey);

    if (!targetDoc) {
      return undefined;
    }

    autoOpenedDocumentRef.current = focusDocumentKey;
    const timer = setTimeout(() => {
      startDocumentUpload(focusDocumentKey);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same deps as the web
  }, [docs, focusDocumentKey, imageUploading, isLoading]);

  const closeExpiryModal = () => {
    setExpiryModal({ isOpen: false, docId: '', name: '', value: '', isSubmitting: false });
  };

  const closeMetaModal = () => {
    setMetaModal({
      isOpen: false,
      mode: 'license',
      docId: '',
      name: '',
      identifyNumber: '',
      birthDate: '',
      requestNumber: '',
      ifsc: '',
      accountHolderName: '',
      isSubmitting: false,
      isVerifying: false,
    });
  };

  const handleExpirySave = async () => {
    if (!expiryModal.docId || !expiryModal.value) {
      return;
    }

    if (isPastExpiryDate(expiryModal.value)) {
      setError('Expiry date cannot be in the past.');
      return;
    }

    const currentDocument = driver?.documents?.[expiryModal.docId] || {};
    const nextExpiryDate = String(expiryModal.value).trim();

    try {
      setExpiryModal((prev) => ({ ...prev, isSubmitting: true }));
      setError('');

      const response = await updateDriverDocument(expiryModal.docId, {
        ...currentDocument,
        key: expiryModal.docId,
        expiryDate: nextExpiryDate,
        expiry_date: nextExpiryDate,
        expiresAt: nextExpiryDate,
        uploaded: currentDocument?.uploaded ?? true,
      });

      const documents = response?.data?.documents || {
        ...(driver?.documents || {}),
        [expiryModal.docId]: {
          ...currentDocument,
          key: expiryModal.docId,
          expiryDate: nextExpiryDate,
          expiry_date: nextExpiryDate,
          expiresAt: nextExpiryDate,
        },
      };

      setDriver((prev) => ({ ...(prev || {}), documents }));
      closeExpiryModal();
    } catch (requestError) {
      setError(requestError?.message || 'Unable to update document expiry date');
      setExpiryModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleMetaSave = async ({ verify = false } = {}) => {
    if (!metaModal.docId) {
      return;
    }

    const currentDocument = driver?.documents?.[metaModal.docId] || {};
    const identifyNumber = String(metaModal.identifyNumber || '').trim().toUpperCase();
    const birthDate = String(metaModal.birthDate || '').trim();
    const requestNumber = String(metaModal.requestNumber || '').trim();
    const ifsc = String(metaModal.ifsc || '').trim().toUpperCase();
    const accountHolderName = String(metaModal.accountHolderName || '').trim();

    try {
      setMetaModal((prev) => ({
        ...prev,
        isSubmitting: !verify,
        isVerifying: verify,
      }));
      setError('');

      const saveResponse = await updateDriverDocument(metaModal.docId, {
        ...currentDocument,
        key: metaModal.docId,
        identifyNumber,
        identify_number: identifyNumber,
        documentNumber: identifyNumber,
        document_number: identifyNumber,
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
        uploaded: currentDocument?.uploaded ?? true,
      });

      let documents = saveResponse?.data?.documents || {
        ...(driver?.documents || {}),
        [metaModal.docId]: {
          ...currentDocument,
          key: metaModal.docId,
          identifyNumber,
          identify_number: identifyNumber,
          documentNumber: identifyNumber,
          document_number: identifyNumber,
          birthDate,
          birth_date: birthDate,
          requestNumber,
          request_no: requestNumber,
        },
      };

      if (verify) {
        const verifyResponse =
          metaModal.mode === 'pan'
            ? await verifyDriverPanDocument(metaModal.docId)
            : metaModal.mode === 'gst'
              ? await verifyDriverGstinDocument(metaModal.docId)
              : metaModal.mode === 'rc'
                ? await verifyDriverRcDocument(metaModal.docId)
                : metaModal.mode === 'bank'
                  ? await verifyDriverBankDocument(metaModal.docId, {
                      accountNumber: identifyNumber,
                      ifsc,
                      accountHolderName,
                    })
                : await verifyDriverLicenseDocument(metaModal.docId);
        documents = verifyResponse?.data?.data?.documents || verifyResponse?.data?.documents || documents;
      }

      setDriver((prev) => ({ ...(prev || {}), documents }));
      closeMetaModal();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Unable to update document details');
      setMetaModal((prev) => ({
        ...prev,
        isSubmitting: false,
        isVerifying: false,
      }));
    }
  };

  const metaDisabled =
    metaModal.isSubmitting ||
    metaModal.isVerifying ||
    !metaModal.identifyNumber ||
    (metaModal.mode === 'license' && !metaModal.birthDate) ||
    (metaModal.mode === 'bank' && (!metaModal.ifsc || !metaModal.accountHolderName));
  const expiryDisabled = expiryModal.isSubmitting || !expiryModal.value || isPastExpiryDate(expiryModal.value);

  const statusBadgeColors = (doc) =>
    doc.verified
      ? { bg: colors.emerald[50], text: colors.emerald[600], border: colors.emerald[100] }
      : doc.reverificationPending
        ? { bg: colors.blue[50], text: colors.blue[600], border: colors.blue[100] }
        : doc.rejected || doc.expired
          ? { bg: colors.rose[50], text: colors.rose[600], border: colors.rose[100] }
          : doc.status === 'Uploaded'
            ? { bg: colors.blue[50], text: colors.blue[600], border: colors.blue[100] }
            : { bg: colors.rose[50], text: colors.rose[600], border: colors.rose[100] };

  const openMetaModal = (doc) => {
    setMetaModal({
      isOpen: true,
      mode: isPanDocument(doc)
        ? 'pan'
        : isGstDocument(doc)
          ? 'gst'
          : isRcDocument(doc)
            ? 'rc'
            : isBankDocument(doc)
              ? 'bank'
            : 'license',
      docId: doc.id,
      name: doc.name,
      identifyNumber: doc.identifyNumber || '',
      birthDate: toDateInputValue(doc.birthDate),
      requestNumber: doc.requestNumber || '',
      ifsc: doc.ifsc || '',
      accountHolderName: doc.accountHolderName || '',
      isSubmitting: false,
      isVerifying: false,
    });
  };

  const renderDoc = (doc) => {
    const badge = statusBadgeColors(doc);
    const isThisUploading = imageUploading && uploadingDocumentKey === doc.id;
    return (
      <Pressable
        key={doc.id}
        onPress={() => setSelectedDoc(doc)}
        style={({ pressed }) => [styles.docCard, pressed ? styles.pressedCard : null]}
      >
        <View style={[styles.docAccent, { backgroundColor: doc.verified ? colors.emerald[500] : doc.status === 'Uploaded' ? colors.blue[500] : colors.rose[500] }]} />

        <View style={styles.docTop}>
          <View style={styles.docIcon}>
            <FileText size={18} strokeWidth={2.5} color={colors.slate[400]} />
          </View>
          <View style={styles.docBody}>
            <Text style={styles.docName}>{doc.name}</Text>
            <View style={styles.docMetaRow}>
              <Text style={styles.docDate} numberOfLines={1}>{doc.date}</Text>
              {doc.expiryDate ? (
                <View style={styles.docTag}>
                  <Text style={[styles.docTagText, { color: doc.expired ? colors.rose[500] : colors.slate[500] }]}>
                    {`${doc.expired ? 'Expired' : 'Exp'} ${formatExpiryDate(doc.expiryDate)}`}
                  </Text>
                </View>
              ) : null}
              {doc.identifyNumber ? (
                <View style={styles.docTag}>
                  <Text style={styles.docTagText}>{doc.identifyNumber}</Text>
                </View>
              ) : null}
              {doc.requestNumber ? (
                <View style={styles.docTag}>
                  <Text style={styles.docTagText}>{`Req ${doc.requestNumber.slice(0, 8)}`}</Text>
                </View>
              ) : null}
            </View>

            {doc.reverificationPending ? (
              <Text style={[styles.docNote, { color: colors.blue[500] }]}>Waiting for admin verification</Text>
            ) : null}
            {doc.reason && !doc.reverificationPending ? (
              <Text style={[styles.docNote, { color: colors.rose[500] }]} numberOfLines={2}>{doc.reason}</Text>
            ) : null}
            {doc.rawDocument?.verificationMessage && doc.verified ? (
              <Text style={[styles.docNote, { color: colors.emerald[600] }]} numberOfLines={2}>{doc.rawDocument.verificationMessage}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.docActions}>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]}>
              {doc.status === 'Pending Reverification' ? 'Pending' : doc.status}
            </Text>
          </View>

          <View style={styles.actionGroup}>
            {isDrivingLicenseDocument(doc) || isPanDocument(doc) || isGstDocument(doc) || isRcDocument(doc) || isBankDocument(doc) ? (
              <Pressable
                onPress={() => openMetaModal(doc)}
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.emerald[50] }, pressed ? styles.pressedAction : null]}
              >
                <ShieldCheck size={13} strokeWidth={2.5} color={colors.emerald[600]} />
                <Text style={[styles.actionText, { color: colors.emerald[600] }]}>
                  {isPanDocument(doc)
                    ? doc.verified ? 'View PAN' : 'Verify PAN'
                    : isGstDocument(doc)
                      ? doc.verified ? 'View GST' : 'Verify GST'
                      : isRcDocument(doc)
                        ? 'RC Details'
                        : isBankDocument(doc)
                          ? doc.verified ? 'View Bank' : 'Verify Bank'
                    : doc.verified ? 'View DL' : 'Verify DL'}
                </Text>
              </Pressable>
            ) : null}
            {doc.hasExpiryDate ? (
              <Pressable
                onPress={() => {
                  setExpiryModal({
                    isOpen: true,
                    docId: doc.id,
                    name: doc.name,
                    value: toDateInputValue(doc.expiryDate),
                    isSubmitting: false,
                  });
                }}
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.amber[50] }, pressed ? styles.pressedAction : null]}
              >
                <CalendarDays size={13} strokeWidth={2.5} color={colors.amber[600]} />
                <Text style={[styles.actionText, { color: colors.amber[600] }]}>{doc.expiryDate ? 'Edit Date' : 'Add Date'}</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={imageUploading}
              onPress={() => startDocumentUpload(doc.id)}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: isThisUploading ? colors.slate[100] : colors.blue[50] },
                pressed && !imageUploading ? styles.pressedAction : null,
              ]}
            >
              {isThisUploading ? (
                <Spin>
                  <Loader2 size={12} color={colors.slate[400]} />
                </Spin>
              ) : (
                <Camera size={13} strokeWidth={2.5} color={colors.blue[600]} />
              )}
              <Text style={[styles.actionText, { color: isThisUploading ? colors.slate[400] : colors.blue[600] }]}>
                {doc.hasDocument ? 'Re-upload' : 'Upload'}
              </Text>
            </Pressable>
            <View style={styles.eyeBox}>
              <Eye size={14} strokeWidth={2.5} color={colors.slate[300]} />
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        style={[styles.scroll, { marginTop: insets.top }]}
        contentContainerStyle={[styles.content, { paddingBottom: 128 + insets.bottom }]}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/profile`)}
            style={({ pressed }) => [styles.backBtn, pressed ? styles.pressedSmall : null]}
            accessibilityLabel="Back"
          >
            <ArrowLeft size={18} strokeWidth={2.5} color={colors.slate[600]} />
          </Pressable>
          <View>
            <Text style={styles.title}>Documents</Text>
            <View style={styles.titleBar} />
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.summary}>
            <View style={styles.summaryLeft}>
              <View style={styles.summaryIcon}>
                <CheckCircle2 size={24} strokeWidth={2.5} color={colors.emerald[500]} />
              </View>
              <View style={styles.summaryText}>
                <Text style={styles.summaryTitle}>{isLoading ? 'Loading Documents' : `${uploadedCount} Uploaded`}</Text>
                <Text style={styles.summarySub}>{`${actionRequiredCount} Action Required`}</Text>
              </View>
            </View>
            <Pressable
              onPress={loadDriver}
              disabled={isSyncing}
              style={({ pressed }) => [styles.refreshBtn, isSyncing ? styles.refreshBusy : styles.refreshIdle, pressed && !isSyncing ? styles.pressedSmall : null]}
            >
              {isSyncing ? (
                <Spin>
                  <Loader2 size={14} color={colors.slate[300]} />
                </Spin>
              ) : (
                <Text style={styles.refreshText}>Refresh</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.listBlock}>
            <View style={styles.listHead}>
              <Text style={styles.listTitle}>Uploaded Documents</Text>
              <Pressable style={styles.auditBtn}>
                <Text style={styles.auditText}>Audit Feed</Text>
              </Pressable>
            </View>

            <View style={styles.list}>
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {!error && docs.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No documents uploaded yet.</Text>
                </View>
              ) : (
                docs.map(renderDoc)
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* document viewer */}
      <Dialog open={Boolean(selectedDoc)} onClose={() => setSelectedDoc(null)} backdropOpacity={0.6} style={[styles.modal, styles.viewer]}>
        {selectedDoc ? (
          <View style={styles.modalStack16}>
            <View style={styles.viewerHead}>
              <View style={styles.viewerIcon}>
                <FileText size={20} strokeWidth={2.5} color={colors.slate[900]} />
              </View>
              <Pressable onPress={() => setSelectedDoc(null)} style={styles.closeBtn}>
                <X size={18} strokeWidth={2.5} color={colors.slate[400]} />
              </Pressable>
            </View>
            <View style={styles.viewerTitleBox}>
              <Text style={styles.modalTitle}>{selectedDoc.name}</Text>
              <Text style={styles.modalSub}>{selectedDoc.templateName}</Text>
            </View>
            <View style={styles.previewBox}>
              {selectedDoc.previewUrl ? (
                <AppImage src={selectedDoc.previewUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <Text style={styles.noPreview}>No Preview Available</Text>
              )}
            </View>
            {selectedDoc.reason ? (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackLabel}>Admin Feedback</Text>
                <Text style={styles.feedbackText}>{selectedDoc.reason}</Text>
              </View>
            ) : null}
            <Pressable onPress={() => setSelectedDoc(null)} style={({ pressed }) => [styles.viewerClose, pressed ? styles.pressedSmall : null]}>
              <Text style={styles.viewerCloseText}>Close Viewer</Text>
            </Pressable>
          </View>
        ) : null}
      </Dialog>

      {/* expiry date */}
      <Dialog open={expiryModal.isOpen} onClose={closeExpiryModal} backdropOpacity={0.6} style={[styles.modal, styles.formModal]}>
        <View style={styles.modalStack20}>
          <View style={styles.formHead}>
            <View style={styles.flexShrink}>
              <Text style={styles.modalTitle}>Update Expiry Date</Text>
              <Text style={[styles.modalSub, styles.mt4]}>{expiryModal.name}</Text>
            </View>
            <Pressable onPress={closeExpiryModal} style={styles.closeBtn}>
              <X size={18} strokeWidth={2.5} color={colors.slate[400]} />
            </Pressable>
          </View>

          <View>
            <ModalInputLabel Icon={CalendarDays}>Expiry Date</ModalInputLabel>
            <NativeDateInput
              min={todayDateInputValue()}
              value={expiryModal.value}
              onChangeValue={(value) => setExpiryModal((prev) => ({ ...prev, value }))}
              style={styles.modalInput}
              textStyle={styles.modalInputText}
            />
            {isPastExpiryDate(expiryModal.value) ? (
              <Text style={styles.pastText}>This date is over. Pick today or a later date.</Text>
            ) : null}
          </View>

          <View style={styles.modalButtons}>
            <Pressable onPress={closeExpiryModal} style={({ pressed }) => [styles.modalBtn, styles.cancelBtn, pressed ? styles.pressedSmall : null]}>
              <Text style={[styles.modalBtnText, { color: colors.slate[600] }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleExpirySave}
              disabled={expiryDisabled}
              style={({ pressed }) => [styles.modalBtn, { backgroundColor: expiryDisabled ? colors.slate[300] : colors.emerald[600] }, pressed && !expiryDisabled ? styles.pressedSmall : null]}
            >
              <Text style={[styles.modalBtnText, { color: colors.white }]}>{expiryModal.isSubmitting ? 'Saving...' : 'Save Date'}</Text>
            </Pressable>
          </View>
        </View>
      </Dialog>

      {/* number / verification */}
      <Dialog open={metaModal.isOpen} onClose={closeMetaModal} backdropOpacity={0.6} style={[styles.modal, styles.formModal]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalStack20} showsVerticalScrollIndicator={false}>
          <View style={styles.formHead}>
            <View style={styles.flexShrink}>
              <Text style={styles.modalTitle}>Document Details</Text>
              <Text style={[styles.modalSub, styles.mt4]}>{metaModal.name}</Text>
            </View>
            <Pressable onPress={closeMetaModal} style={styles.closeBtn}>
              <X size={18} strokeWidth={2.5} color={colors.slate[400]} />
            </Pressable>
          </View>

          <View>
            <ModalInputLabel Icon={BadgeCheck}>
              {metaModal.mode === 'pan'
                ? 'PAN Number'
                : metaModal.mode === 'gst'
                  ? 'GSTIN'
                  : metaModal.mode === 'rc'
                    ? 'RC Number'
                    : metaModal.mode === 'bank'
                      ? 'Bank Account Number'
                    : 'License Number'}
            </ModalInputLabel>
            <TextInput
              value={metaModal.identifyNumber}
              onChangeText={(text) => setMetaModal((prev) => ({ ...prev, identifyNumber: text.toUpperCase() }))}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.modalInput, styles.modalInputText]}
              placeholderTextColor={colors.slate[400]}
              placeholder={
                metaModal.mode === 'pan'
                  ? 'Enter PAN number'
                  : metaModal.mode === 'gst'
                    ? 'Enter GSTIN'
                    : metaModal.mode === 'rc'
                      ? 'Enter RC number'
                      : metaModal.mode === 'bank'
                        ? 'Enter bank account number'
                      : 'Enter DL number'
              }
            />
          </View>

          {metaModal.mode === 'bank' ? (
            <View>
              <ModalInputLabel Icon={BadgeCheck}>IFSC Code</ModalInputLabel>
              <TextInput
                value={metaModal.ifsc}
                onChangeText={(text) => setMetaModal((prev) => ({ ...prev, ifsc: text.toUpperCase() }))}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.modalInput, styles.modalInputText]}
                placeholderTextColor={colors.slate[400]}
                placeholder="Enter IFSC code"
              />
            </View>
          ) : null}

          {metaModal.mode === 'bank' ? (
            <View>
              <ModalInputLabel Icon={BadgeCheck}>Account Holder Name</ModalInputLabel>
              <TextInput
                value={metaModal.accountHolderName}
                onChangeText={(text) => setMetaModal((prev) => ({ ...prev, accountHolderName: text }))}
                style={[styles.modalInput, styles.modalInputText]}
                placeholderTextColor={colors.slate[400]}
                placeholder="Enter account holder name"
              />
            </View>
          ) : null}

          {metaModal.mode === 'license' ? (
            <View>
              <ModalInputLabel Icon={CalendarDays}>Birth Date</ModalInputLabel>
              <NativeDateInput
                value={metaModal.birthDate}
                onChangeValue={(value) => setMetaModal((prev) => ({ ...prev, birthDate: value }))}
                style={styles.modalInput}
                textStyle={styles.modalInputText}
              />
            </View>
          ) : null}

          {metaModal.mode === 'license' ? (
            <View>
              <ModalInputLabel Icon={BadgeCheck}>Request No</ModalInputLabel>
              <TextInput
                value={metaModal.requestNumber}
                onChangeText={(text) => setMetaModal((prev) => ({ ...prev, requestNumber: text }))}
                style={[styles.modalInput, styles.modalInputText]}
                placeholderTextColor={colors.slate[400]}
                placeholder="Optional override, otherwise generated automatically"
              />
            </View>
          ) : null}

          <View style={styles.modalButtons}>
            <Pressable
              onPress={() => handleMetaSave({ verify: false })}
              disabled={metaDisabled}
              style={({ pressed }) => [styles.modalBtn, styles.cancelBtn, metaDisabled ? styles.half : null, pressed && !metaDisabled ? styles.pressedSmall : null]}
            >
              <Text style={[styles.modalBtnText, { color: colors.slate[700] }]}>{metaModal.isSubmitting ? 'Saving...' : 'Save'}</Text>
            </Pressable>
            <Pressable
              onPress={() => handleMetaSave({ verify: true })}
              disabled={metaDisabled}
              style={({ pressed }) => [styles.modalBtn, { backgroundColor: colors.emerald[600] }, metaDisabled ? styles.half : null, pressed && !metaDisabled ? styles.pressedSmall : null]}
            >
              <Text style={[styles.modalBtnText, { color: colors.white }]}>
                {metaModal.isVerifying
                  ? 'Verifying...'
                  : metaModal.mode === 'pan'
                    ? 'Verify PAN'
                    : metaModal.mode === 'gst'
                      ? 'Verify GST'
                      : metaModal.mode === 'rc'
                        ? 'Verify RC'
                        : metaModal.mode === 'bank'
                          ? 'Verify Bank'
                        : 'Verify DL'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </Dialog>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fb' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: 24, paddingTop: 16 },
  header: {
    marginHorizontal: -24,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#f8f9fb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    zIndex: 30,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  pressedSmall: { transform: [{ scale: 0.95 }] },
  pressedCard: { transform: [{ scale: 0.99 }] },
  pressedAction: { transform: [{ scale: 0.9 }] },
  title: { fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45, textTransform: 'uppercase', color: colors.slate[900] },
  titleBar: { marginTop: 2, width: 32, height: 2, borderRadius: 9999, backgroundColor: colors.emerald[500] },
  main: { gap: 24 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 28.8,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    padding: 18,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.emerald[100],
    backgroundColor: colors.emerald[50],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  summaryText: { gap: 2, flexShrink: 1 },
  summaryTitle: { fontSize: 14, lineHeight: 16, fontWeight: '900', letterSpacing: -0.35, textTransform: 'uppercase', color: colors.slate[900] },
  summarySub: { fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 1, color: alpha(colors.slate[400], 0.6) },
  refreshBtn: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
  refreshIdle: { backgroundColor: driverTheme.button },
  refreshBusy: { backgroundColor: colors.slate[100] },
  refreshText: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: colors.white },
  listBlock: { gap: 16 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  listTitle: { marginLeft: 8, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: alpha(colors.slate[400], 0.6) },
  auditBtn: { borderBottomWidth: 1, borderBottomColor: colors.slate[200], paddingBottom: 2 },
  auditText: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: colors.slate[600] },
  list: { gap: 12 },
  errorBox: { borderRadius: 16, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.rose[600] },
  emptyBox: { borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 20, ...shadow.sm },
  emptyText: { textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.slate[400] },
  docCard: {
    gap: 12,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    padding: 14,
    paddingLeft: 16,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  docAccent: { position: 'absolute', top: 12, bottom: 12, left: 0, width: 4, borderTopRightRadius: 9999, borderBottomRightRadius: 9999 },
  docTop: { flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 },
  docIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  docBody: { flex: 1, minWidth: 0 },
  docName: { fontSize: 13, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', color: colors.slate[900] },
  docMetaRow: { marginTop: 2, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  docDate: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.slate[400] },
  docTag: { borderRadius: 4, backgroundColor: colors.slate[100], paddingHorizontal: 6, paddingVertical: 2 },
  docTagText: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: colors.slate[500] },
  docNote: { marginTop: 4, fontSize: 9, lineHeight: 12, fontWeight: '700' },
  docActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, ...shadow.sm },
  statusBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
  actionGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actionBtn: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10 },
  actionText: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  eyeBox: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modal: { borderRadius: 28.8, padding: 24, backgroundColor: colors.white, ...shadow['2xl'] },
  viewer: { maxWidth: 320 },
  formModal: { maxWidth: 360, maxHeight: '90%' },
  modalStack16: { gap: 16 },
  modalStack20: { gap: 20 },
  viewerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  viewerIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  viewerTitleBox: { gap: 2 },
  modalTitle: { fontSize: 16, lineHeight: 20, fontWeight: '900', letterSpacing: -0.4, textTransform: 'uppercase', color: colors.slate[900] },
  modalSub: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.slate[400] },
  mt4: { marginTop: 4 },
  flexShrink: { flexShrink: 1 },
  previewBox: {
    aspectRatio: 4 / 3,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPreview: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: colors.slate[300] },
  feedbackBox: { borderRadius: 14, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], paddingHorizontal: 16, paddingVertical: 12 },
  feedbackLabel: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase', color: colors.rose[500] },
  feedbackText: { marginTop: 4, fontSize: 11, lineHeight: 18, fontWeight: '600', color: colors.rose[700] },
  // web: bg-slate-900 button -> the partner button blue
  viewerClose: { height: 44, borderRadius: 14, backgroundColor: driverTheme.button, alignItems: 'center', justifyContent: 'center' },
  viewerCloseText: { fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.white },
  formHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  modalLabelRow: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: colors.slate[500] },
  modalInput: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalInputText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
  pastText: { marginTop: 8, fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.rose[600] },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: colors.slate[100] },
  half: { opacity: 0.5 },
  modalBtnText: { fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
});

export default DriverDocuments;
