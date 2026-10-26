// Web: pages/registration/RegistrationStatus.jsx — /taxi/driver/registration-status and /taxi/owner/registration-status:
// "Review Started / Action Required / Verification Pending", the partner card, the document checklist (admin review +
// RechargeKit auto-check per document, rejection reason, Fix Document) and the bottom bar (Contact Support, "Not you?").
// API: GET /drivers/me approval status every 2.5 s (getDriverApprovalStatus), document templates
// (getDriverDocumentTemplates(role)), and the auto-check calls (verifyDriverPan/Gstin/Rc/Bank/LicenseDocument).
// Approved -> /taxi/owner/home | /taxi/driver/bus-home | /taxi/driver/home (registration session cleared);
// no token / 401 / 404 / non-partner 403 -> clearDriverAuthState() + /taxi/driver/login.
// Native: the web page was unmounted when Contact Support / Fix Document opened; the native stack keeps it, so the
// approval poll only runs while this page is the one on screen (and restarts, like a remount, when it comes back).
// The sticky bottom card is a fixed bar above the navigation bar.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { Clock, Mail, Search, ChevronRight } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, FontScope, Text } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, fonts, shadow } from '@/theme';
import { useSettings } from '../../../../shared/context/SettingsContext';
import {
  clearDriverRegistrationSession,
  getDriverApprovalStatus,
  getDriverDocumentTemplates,
  clearDriverAuthState,
  getLocalDriverToken,
  getStoredDriverRole,
  persistDriverAuthSession,
  verifyDriverBankDocument,
  verifyDriverGstinDocument,
  verifyDriverLicenseDocument,
  verifyDriverPanDocument,
  verifyDriverRcDocument,
} from '../../services/registrationService';

const APPROVAL_POLL_MS = 2500;
const normalizePortalRole = (role) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (normalized === 'bus_driver' || normalized === 'bus-driver' || normalized === 'busdriver') return 'bus_driver';
  return 'driver';
};

const unwrapDriver = (response) =>
  response?.data?.data || response?.data || response;

const isDriverApproved = (driver) => {
  if (!driver) {
    return false;
  }

  const approval = String(driver.approve ?? '').toLowerCase();
  const status = String(driver.status || '').toLowerCase();

  return (
    driver.approve === true ||
    driver.approve === 1 ||
    ['true', '1', 'yes', 'approved'].includes(approval) ||
    ['approved', 'active', 'verified'].includes(status)
  );
};

const redirectToDriverLogin = (navigate) => {
  clearDriverAuthState();
  navigate('/taxi/driver/login', { replace: true });
};

// Web: flushed the token the Flutter shell handed over (and registered a browser token). The app's FCM bridge
// (shared/push/nativeFcmBridge) installs the same flush function; there is no browser token in the app.
const syncPushTokens = async () => {
  await Promise.allSettled([
    window.__flushNativeFcmToken?.(),
  ]);
};

const getStatusColor = (status) => {
  const s = String(status || '').toLowerCase();
  if (['approved', 'active', 'verified', 'true', '1'].includes(s)) return { fg: colors.emerald[500], bg: colors.emerald[50] };
  if (['rejected', 'declined', 'failed'].includes(s)) return { fg: colors.rose[500], bg: colors.rose[50] };
  return { fg: colors.amber[500], bg: colors.amber[50] };
};

const getProviderStatusColor = (status) => {
  const s = String(status || '').toLowerCase();
  if (['verified', 'success', 'approved', 'completed'].includes(s)) return { fg: colors.sky[600], bg: colors.sky[50] };
  if (['failed', 'invalid', 'rejected', 'declined'].includes(s)) return { fg: colors.rose[500], bg: colors.rose[50] };
  if (['pending', 'processing', 'queued', 'verifying'].includes(s)) return { fg: colors.amber[500], bg: colors.amber[50] };
  return { fg: colors.slate[500], bg: colors.slate[100] };
};

const getDocumentStatus = (doc = {}) =>
  String(
    doc?.approvalStatus ||
    doc?.reviewStatus ||
    doc?.status ||
    'pending',
  ).toLowerCase();

const getDocumentReason = (doc = {}) =>
  String(
    doc?.comment ||
    doc?.remarks ||
    doc?.reason ||
    doc?.admin_comment ||
    doc?.rejection_reason ||
    '',
  ).trim();

const getDocumentProviderStatus = (doc = {}) => {
  const explicit = String(doc?.verificationStatus || '').trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  if (doc?.verificationResponse || doc?.verificationReferenceId || doc?.verifiedAt) {
    return 'verified';
  }

  return 'not_started';
};

const getDocumentProviderMessage = (doc = {}) =>
  String(doc?.verificationMessage || '').trim();

const getDocumentImage = (doc = {}) =>
  String(
    doc?.previewUrl ||
    doc?.secureUrl ||
    doc?.url ||
    '',
  ).trim();

const getDocumentReviewTimestamp = (doc = {}) => {
  const reviewTime = new Date(
    doc?.reverificationRequestedAt ||
    doc?.uploadedAt ||
    doc?.updatedAt ||
    0,
  ).getTime();
  const reviewedTime = new Date(doc?.reviewedAt || 0).getTime();

  if (!Number.isFinite(reviewTime) || reviewTime <= 0) {
    return false;
  }

  return Number.isFinite(reviewedTime) && reviewedTime > 0 && reviewTime >= reviewedTime;
};

// animate-pulse: opacity 1 -> 0.5 -> 1 every 2 s
const Pulse = ({ children }) => {
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return <Animated.View style={{ opacity: value }}>{children}</Animated.View>;
};

// motion.section initial { opacity: 0, y: 10 } -> animate
const FadeIn = ({ style, children }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim]);
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
};

const RegistrationStatus = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { settings } = useSettings();
  // `checking` and `statusMessage` are kept like the web, which never shows them
  const [, setChecking] = useState(true);
  const [driver, setDriver] = useState(null);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [, setStatusMessage] = useState(
    'Waiting for admin approval',
  );
  const [providerVerificationState, setProviderVerificationState] = useState({});
  // True while the approval check can't reach the server, so we don't pretend the audit is running.
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const timeoutRef = useRef(null);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const verificationStartedRef = useRef({});

  const appName = settings.general?.app_name || 'App';
  const appLogo = settings.general?.logo || settings.customization?.logo;
  const isVehicleReapproval = location.state?.statusReason === 'vehicle-update' || driver?.approve === false;
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

  // web: on mount -> here: while this page is on screen (see the note at the top)
  useEffect(() => {
    if (!isFocused) return undefined;

    if (location.state?.role) {
      const normalizedRole = normalizePortalRole(location.state.role);
      persistDriverAuthSession({ role: normalizedRole });
    }

    const onboardingToken =
      location.state?.completedRegistration?.token ||
      location.state?.token ||
      '';

    if (onboardingToken) {
      const roleFromState = String(location.state?.role || '').toLowerCase();
      persistDriverAuthSession({
        token: onboardingToken,
        role: normalizePortalRole(roleFromState),
      });
    }

    syncPushTokens().catch(() => {});

    mountedRef.current = true;

    const fetchTemplates = async () => {
      try {
        const role = normalizePortalRole(getStoredDriverRole() || location.state?.role || 'driver');
        const response = await getDriverDocumentTemplates(role);
        const templates = response?.data?.data?.results || response?.data?.results || [];
        if (mountedRef.current) setDocumentTemplates(templates);
      } catch (err) {
        console.error('Failed to fetch templates', err);
      }
    };

    fetchTemplates();

    const checkApproval = async () => {
      if (!mountedRef.current || requestInFlightRef.current) {
        return;
      }

      requestInFlightRef.current = true;
      const token = getLocalDriverToken();

      if (!token) {
        if (mountedRef.current) {
          setChecking(false);
          setStatusMessage(
            'Registration session not found. Please start again.',
          );
        }
        redirectToDriverLogin(navigate);
        requestInFlightRef.current = false;
        return;
      }

      try {
        const response = await getDriverApprovalStatus();
        const driverData = unwrapDriver(response);
        if (mountedRef.current) {
          setDriver(driverData);
          setConnectionIssue(false);
        }

        const isApproved = isDriverApproved(driverData);

        if (!mountedRef.current) {
          return;
        }

        if (isApproved) {
          clearDriverRegistrationSession();
          const normalizedRole = normalizePortalRole(
            getStoredDriverRole() || location.state?.role || 'driver',
          );
          const path =
            normalizedRole === 'owner'
              ? '/taxi/owner/home'
              : normalizedRole === 'bus_driver'
                ? '/taxi/driver/bus-home'
                : '/taxi/driver/home';

          navigate(path, { replace: true });
          requestInFlightRef.current = false;
          return;
        }

        setChecking(false);
        setStatusMessage('Your application is being audited by our verification team.');
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        if (error?.status === 401) {
          redirectToDriverLogin(navigate);
          requestInFlightRef.current = false;
          return;
        }

        if (error?.status === 404) {
          setStatusMessage('Driver account deleted. Redirecting to login...');
          redirectToDriverLogin(navigate);
          requestInFlightRef.current = false;
          return;
        }

        setChecking(false);
        // 403 with a non-pending message = this login is not a driver-portal account at all.
        if (error?.status === 403 && !/pending|inactive/i.test(String(error?.message || ''))) {
          redirectToDriverLogin(navigate);
          requestInFlightRef.current = false;
          return;
        }
        setConnectionIssue(!error?.status || error.status >= 500);
        setStatusMessage(
          error?.message || 'Your request is still under review.',
        );
      } finally {
        requestInFlightRef.current = false;
      }
    };

    checkApproval();
    timeoutRef.current = setInterval(checkApproval, APPROVAL_POLL_MS);

    return () => {
      mountedRef.current = false;
      requestInFlightRef.current = false;
      clearInterval(timeoutRef.current);
    };
  }, [isFocused, location.state, navigate]);

  const getDocumentDetails = () => {
    const submittedDocumentSummary = Array.isArray(location.state?.submittedDocumentSummary)
      ? location.state.submittedDocumentSummary.map((item) => ({
          ...item,
          providerStatus: item?.providerStatus || 'not_started',
          providerMessage: item?.providerMessage || '',
        }))
      : [];

    if (!driver || !documentTemplates.length) {
      return submittedDocumentSummary;
    }

    const docs = driver.documents || {};
    const flatFields = documentTemplates.flatMap((t) => t.fields || []);

    return flatFields.map((field) => {
      const doc = docs[field.key];
      const status = getDocumentStatus(doc);
      const reason = getDocumentReason(doc);
      const providerState = providerVerificationState[field.key] || {};

      return {
        label: field.label || field.name || field.key,
        status,
        reason,
        key: field.key,
        previewUrl: getDocumentImage(doc),
        reverificationPending: status === 'pending' && getDocumentReviewTimestamp(doc),
        providerStatus: providerState.status || getDocumentProviderStatus(doc),
        providerMessage: providerState.message || getDocumentProviderMessage(doc),
      };
    });
  };

  const docDetails = getDocumentDetails();
  const isSpecialRole = ['bus_driver'].includes(
    normalizePortalRole(getStoredDriverRole() || location.state?.role || 'driver'),
  );
  const rejectedDocs = docDetails.filter((d) => d.status === 'rejected' || d.status === 'declined');
  const pendingReverificationDocs = docDetails.filter((doc) => doc.reverificationPending);

  useEffect(() => {
    if (!driver || !documentTemplates.length) {
      return;
    }

    const runVerification = async () => {
      const docs = driver.documents || {};
      const tasks = [];

      for (const template of documentTemplates) {
        const verificationType = String(template?.verification_type || 'none').trim().toLowerCase();
        if (!['driving_license', 'pan', 'gstin', 'rc', 'bank_account'].includes(verificationType)) {
          continue;
        }

        for (const field of Array.isArray(template.fields) ? template.fields : []) {
          const key = String(field?.key || '').trim();
          if (!key || verificationStartedRef.current[key]) {
            continue;
          }

          const doc = docs[key];
          if (!doc) {
            continue;
          }

          const existingProviderStatus = getDocumentProviderStatus(doc);
          if (['verified', 'failed'].includes(existingProviderStatus)) {
            continue;
          }

          const identifyNumber = String(
            doc?.identifyNumber ||
            doc?.identify_number ||
            doc?.documentNumber ||
            doc?.document_number ||
            '',
          ).trim();
          const birthDate = String(doc?.birthDate || doc?.birth_date || '').trim();
          const ifsc = String(doc?.ifsc || doc?.ifscCode || doc?.ifsc_code || '').trim().toUpperCase();
          const accountHolderName = String(
            doc?.accountHolderName ||
            doc?.account_holder_name ||
            doc?.beneficiaryName ||
            doc?.benificiary_name ||
            '',
          ).trim();

          if (!identifyNumber) {
            continue;
          }

          if (verificationType === 'driving_license' && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
            continue;
          }

          if (verificationType === 'bank_account' && (!ifsc || !accountHolderName)) {
            continue;
          }

          verificationStartedRef.current[key] = true;
          setProviderVerificationState((current) => ({
            ...current,
            [key]: {
              status: 'verifying',
              message: 'RechargeKit verification in progress',
            },
          }));

          let runner = null;
          if (verificationType === 'pan') {
            runner = () => verifyDriverPanDocument(key);
          } else if (verificationType === 'gstin') {
            runner = () => verifyDriverGstinDocument(key);
          } else if (verificationType === 'rc') {
            runner = () => verifyDriverRcDocument(key);
          } else if (verificationType === 'bank_account') {
            runner = () => verifyDriverBankDocument(key, {
              accountNumber: identifyNumber,
              ifsc,
              accountHolderName,
            });
          } else if (verificationType === 'driving_license') {
            runner = () => verifyDriverLicenseDocument(key);
          }

          if (runner) {
            tasks.push(
              runner()
                .then((response) => {
                  const payload = response?.data?.data || response?.data || {};
                  const updatedDocuments = payload?.documents || {};
                  const updatedDocument = payload?.document || updatedDocuments?.[key] || {};
                  const providerStatus = getDocumentProviderStatus(updatedDocument);
                  const providerMessage = getDocumentProviderMessage(updatedDocument) || 'RechargeKit verification completed';

                  setProviderVerificationState((current) => ({
                    ...current,
                    [key]: {
                      status: providerStatus,
                      message: providerMessage,
                    },
                  }));

                  setDriver((current) => (
                    current
                      ? {
                          ...current,
                          documents: {
                            ...(current.documents || {}),
                            ...(updatedDocuments || {}),
                            [key]: {
                              ...(current.documents?.[key] || {}),
                              ...(updatedDocuments?.[key] || updatedDocument || {}),
                            },
                          },
                        }
                      : current
                  ));
                })
                .catch((error) => {
                  setProviderVerificationState((current) => ({
                    ...current,
                    [key]: {
                      status: 'failed',
                      message: error?.response?.data?.message || error?.message || 'RechargeKit verification failed',
                    },
                  }));
                }),
            );
          }
        }
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    };

    runVerification().catch(() => {});
  }, [driver, documentTemplates]);

  return (
    <FontScope family={fonts.jakarta}>
      <View style={styles.root}>
        <StatusBar style="dark" />
        {/* bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] */}
        <LinearGradient colors={['#f6efe4', '#fcfaf6', '#ffffff']} locations={[0, 0.28, 1]} style={StyleSheet.absoluteFill} />
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: bottomBarHeight + 16 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            {appLogo ? (
              <AppImage src={appLogo} style={styles.logo} contentFit="contain" accessibilityLabel={appName} />
            ) : (
              <View style={styles.nameBadge}>
                <Text style={styles.nameBadgeText}>{appName}</Text>
              </View>
            )}
          </View>

          <View style={styles.main}>
            <View style={styles.hero}>
              <View style={styles.clockWrap}>
                <View style={styles.clockBox}>
                  <Pulse>
                    <Clock size={42} strokeWidth={2.5} color={colors.slate[900]} />
                  </Pulse>
                </View>
                <View style={styles.searchBadge}>
                  <Search size={16} strokeWidth={3} color={colors.white} />
                </View>
              </View>

              <View style={styles.heroText}>
                <Text style={styles.kicker}>
                  {pendingReverificationDocs.length > 0 ? 'Submission received' : isVehicleReapproval ? 'Update in review' : 'Live Audit Status'}
                </Text>
                <Text style={styles.title}>
                  {rejectedDocs.length > 0 ? (
                    <>
                      {'Action '}
                      <Text style={styles.titleMuted}>Required</Text>
                    </>
                  ) : pendingReverificationDocs.length > 0 ? (
                    <>
                      {'Verification '}
                      <Text style={styles.titleMuted}>Pending</Text>
                    </>
                  ) : (
                    <>
                      {'Review '}
                      <Text style={styles.titleMuted}>Started</Text>
                    </>
                  )}
                </Text>
                {connectionIssue ? (
                  <Text style={styles.connection}>
                    Can't reach the server right now, so we can't show your latest status. Retrying automatically…
                  </Text>
                ) : null}
                <Text style={styles.lead}>
                  {rejectedDocs.length > 0
                    ? 'Some of your documents were rejected. Please re-upload them to continue.'
                    : pendingReverificationDocs.length > 0
                      ? 'Your updated documents were sent back to admin for another review.'
                      : 'Our team is currently performing a manual audit of your profile.'}
                </Text>
              </View>
            </View>

            {driver ? (
              <FadeIn style={styles.partnerCard}>
                <View style={styles.partnerRow}>
                  <View style={styles.partnerIcon}>
                    <Mail size={24} color={colors.slate[500]} />
                  </View>
                  <View style={styles.partnerText}>
                    <Text style={styles.partnerName} numberOfLines={1}>{driver.name || 'Partner'}</Text>
                    <Text style={styles.partnerPhone} numberOfLines={1}>{`+91 ${driver.phone ?? ''}`}</Text>
                  </View>
                  <View style={styles.partnerStatus}>
                    <Text style={styles.partnerStatusText}>{driver.status || 'Pending'}</Text>
                  </View>
                </View>
              </FadeIn>
            ) : null}

            <View style={styles.checklist}>
              <Text style={styles.checklistTitle}>Checklist Summary</Text>
              <View style={styles.checklistItems}>
                {docDetails.length > 0 ? docDetails.map((doc, idx) => {
                  const review = getStatusColor(doc.status);
                  const provider = getProviderStatusColor(doc.providerStatus);
                  return (
                    <View key={idx} style={styles.docCard}>
                      <View style={styles.docHead}>
                        <Text style={styles.docLabel} numberOfLines={1}>{doc.label}</Text>
                        <View style={styles.docBadges}>
                          <View style={[styles.docBadge, { backgroundColor: review.bg }]}>
                            <Text style={[styles.docBadgeText, { color: review.fg }]}>{`Review: ${doc.status}`}</Text>
                          </View>
                          {/* automatic (RechargeKit) check only shown when it actually ran */}
                          {doc.providerStatus && doc.providerStatus !== 'not_started' ? (
                            <View style={[styles.docBadge, { backgroundColor: provider.bg }]}>
                              <Text style={[styles.docBadgeText, { color: provider.fg }]}>{`Auto-check: ${doc.providerStatus}`}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {doc.providerMessage ? (
                        <View style={[styles.noteBox, { backgroundColor: colors.sky[50], borderColor: colors.sky[100] }]}>
                          <Text style={[styles.noteKicker, { color: colors.sky[700] }]}>Auto-check:</Text>
                          <Text style={[styles.noteText, { color: colors.sky[700] }]}>{doc.providerMessage}</Text>
                        </View>
                      ) : null}
                      {doc.reason ? (
                        <View style={[styles.noteBox, { backgroundColor: colors.rose[50], borderColor: colors.rose[100] }]}>
                          <Text style={[styles.noteKicker, { color: colors.rose[600] }]}>Reason for rejection:</Text>
                          <Text style={[styles.noteText, { color: colors.rose[600] }]}>{doc.reason}</Text>
                        </View>
                      ) : null}
                      {doc.reverificationPending ? (
                        <View style={[styles.noteBox, { backgroundColor: alpha(colors.slate[900], 0.05), borderColor: alpha(colors.slate[900], 0.1) }]}>
                          <Text style={[styles.noteText, { color: colors.slate[600] }]}>Re-uploaded and waiting for admin re-verification.</Text>
                        </View>
                      ) : null}
                      {doc.status === 'rejected' || doc.status === 'declined' ? (
                        <Pressable
                          onPress={() => navigate(`${routePrefix}/documents`, {
                            state: {
                              focusDocumentKey: doc.key,
                              fromRegistrationStatus: true,
                            },
                          })}
                          style={({ pressed }) => [styles.fixBtn, pressed ? styles.pressed95 : null]}
                        >
                          <Text style={styles.fixBtnText}>Fix Document</Text>
                          <ChevronRight size={16} strokeWidth={3} color={colors.white} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                }) : isSpecialRole ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No document uploads required for this role.</Text>
                  </View>
                ) : (
                  <View style={styles.emptyCard}>
                    <Spin style={styles.syncSpin}>
                      <View style={styles.syncRing} />
                    </Spin>
                    <Text style={styles.emptyText}>Syncing documents...</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        <View
          style={[styles.bottomBar, { bottom: insets.bottom }]}
          onLayout={(e) => setBottomBarHeight(e.nativeEvent.layout.height)}
        >
          {rejectedDocs.length > 0 ? (
            <View style={styles.rejectedNote}>
              <Text style={styles.rejectedNoteText}>Select a rejected document above to re-upload the correct file.</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => navigate(`${routePrefix}/support/chat`, {
              state: {
                backPath: `${routePrefix}/registration-status`,
                backState: location.state || null,
              },
            })}
            style={({ pressed }) => [styles.supportBtn, pressed ? styles.pressed95 : null]}
          >
            <Text style={styles.supportText}>Contact Support</Text>
          </Pressable>
          <Pressable
            onPress={() => redirectToDriverLogin(navigate)}
            style={({ pressed }) => [styles.notYouBtn, pressed ? styles.pressed95 : null]}
          >
            <Text style={styles.notYouText}>Not you? Use a different number</Text>
          </Pressable>
        </View>
      </View>
    </FontScope>
  );
};

const black = { fontWeight: '900' };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex1: { flex: 1 },
  pressed95: { transform: [{ scale: 0.95 }] },
  content: { paddingHorizontal: 20, alignItems: 'center' },
  header: { marginBottom: 40, width: '100%', alignItems: 'center' },
  logo: { height: 40, width: 200 },
  nameBadge: {
    borderRadius: 16,
    backgroundColor: colors.slate[950],
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    elevation: 10,
    shadowColor: colors.slate[950],
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  nameBadgeText: { fontSize: 18, lineHeight: 28, ...black, letterSpacing: -0.9, color: colors.white },
  main: { width: '100%', maxWidth: 384, gap: 32 },
  hero: { alignItems: 'center', gap: 24 },
  clockWrap: { position: 'relative' },
  clockBox: {
    width: 112,
    height: 112,
    borderRadius: 40,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  searchBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: colors.slate[950],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.white,
    ...shadow.xl,
  },
  heroText: { alignItems: 'center', gap: 12 },
  kicker: { fontSize: 11, lineHeight: 15, ...black, textTransform: 'uppercase', letterSpacing: 2.2, color: colors.slate[500], opacity: 0.6, textAlign: 'center' },
  title: { fontFamily: fonts.outfit, fontSize: 42, lineHeight: 46, ...black, letterSpacing: -1.68, color: colors.slate[900], textAlign: 'center' },
  titleMuted: { fontFamily: fonts.outfit, ...black, color: colors.slate[500] },
  connection: {
    maxWidth: 300,
    borderRadius: 16,
    backgroundColor: colors.amber[50],
    borderWidth: 1,
    borderColor: colors.amber[100],
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.amber[700],
    textAlign: 'center',
    overflow: 'hidden',
  },
  lead: { maxWidth: 270, fontSize: 15, lineHeight: 24, fontWeight: '700', color: colors.slate[500], opacity: 0.8, textAlign: 'center' },
  partnerCard: {
    backgroundColor: colors.white,
    borderRadius: 40,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.slate[100],
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  partnerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  partnerText: { flex: 1, minWidth: 0 },
  partnerName: { fontSize: 16, lineHeight: 24, ...black, letterSpacing: -0.4, color: colors.slate[900] },
  partnerPhone: { fontSize: 11, lineHeight: 15, ...black, color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 1.1, opacity: 0.6 },
  partnerStatus: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.slate[950],
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    ...shadow.lg,
  },
  partnerStatusText: { fontSize: 9, lineHeight: 13, ...black, textTransform: 'uppercase', letterSpacing: 1.35, color: colors.white },
  checklist: { gap: 16 },
  checklistTitle: { fontSize: 11, lineHeight: 15, ...black, color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 2.2, paddingHorizontal: 8, opacity: 0.6 },
  checklistItems: { gap: 16 },
  docCard: {
    backgroundColor: colors.white,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: colors.slate[100],
    padding: 20,
    gap: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
  },
  docHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  docLabel: { flexShrink: 1, fontSize: 15, lineHeight: 22, ...black, letterSpacing: -0.375, color: colors.slate[800] },
  docBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, flexShrink: 1 },
  docBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  docBadgeText: { fontSize: 10, lineHeight: 14, ...black, textTransform: 'uppercase', letterSpacing: 1 },
  noteBox: { padding: 16, borderWidth: 1, borderRadius: 16 },
  noteKicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6, marginBottom: 4 },
  noteText: { fontSize: 13, lineHeight: 21, fontWeight: '700' },
  fixBtn: {
    width: '100%',
    height: 48,
    backgroundColor: driverTheme.button,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadow.xl,
  },
  fixBtnText: { fontSize: 13, lineHeight: 18, ...black, textTransform: 'uppercase', letterSpacing: 1.3, color: colors.white },
  emptyCard: { backgroundColor: colors.white, borderRadius: 29, borderWidth: 1, borderColor: colors.slate[100], padding: 40, alignItems: 'center', ...shadow.sm },
  emptyText: { fontSize: 12, lineHeight: 16, ...black, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.slate[500], opacity: 0.6, textAlign: 'center' },
  syncSpin: { marginBottom: 16 },
  syncRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.slate[100], borderTopColor: colors.slate[900] },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: alpha(colors.white, 0.95),
    padding: 16,
    gap: 12,
    elevation: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -12 },
  },
  rejectedNote: { borderRadius: 16, backgroundColor: colors.rose[50], borderWidth: 1, borderColor: colors.rose[100], paddingHorizontal: 20, paddingVertical: 16, ...shadow.sm },
  rejectedNoteText: { fontSize: 12, lineHeight: 19.5, fontWeight: '700', color: colors.rose[600] },
  supportBtn: { width: '100%', height: 56, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[200], borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  supportText: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.slate[600] },
  notYouBtn: { width: '100%', height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notYouText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.slate[500] },
});

export default RegistrationStatus;
