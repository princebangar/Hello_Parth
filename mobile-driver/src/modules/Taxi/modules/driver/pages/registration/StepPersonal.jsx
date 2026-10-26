// Web: pages/registration/StepPersonal.jsx — /taxi/driver/step-personal, /taxi/owner/step-personal (step 1 of 4).
// Name / email / gender -> PATCH /drivers/onboarding/personal { registrationId, phone, fullName, email, gender } ->
// /taxi/driver/role-signup (bus driver) or <prefix>/step-referral. No registration session -> <prefix>/login; a role
// still to be chosen -> /taxi/driver/select-role. Back arrow / Android back: leave at once when nothing was typed,
// otherwise the "Exit registration?" popup (useOnboardingExitGuard, already native).
// Native: the sticky top bar is a sticky header of the ScrollView; the page starts below the status bar (its strip
// shows the page's top colour) and the fixed Continue bar sits above the navigation bar.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { User, Mail, Phone, ChevronRight, ArrowLeft } from 'lucide-react-native';
import useOnboardingExitGuard from '../../../../../../shared/hooks/useOnboardingExitGuard';
import OnboardingExitModal from '../../../../../../shared/components/OnboardingExitModal';
import { useNavigate, useLocation } from '@/lib/router';
import { Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, driverTheme, shadow } from '@/theme';
import {
    getStoredDriverRegistrationSession,
    saveDriverPersonalDetails,
    saveDriverRegistrationSession,
} from '../../services/registrationService';

const NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SPECIAL_SIGNUP_ROLES = ['bus_driver'];

// One input card (group ... focus-within:* on the web)
const FieldCard = ({ Icon, label, focused, children }) => (
    <View style={[styles.fieldCard, focused ? styles.fieldCardFocused : null]}>
        <View style={styles.fieldRow}>
            <View style={[styles.fieldIcon, focused ? styles.fieldIconFocused : null]}>
                <Icon size={20} strokeWidth={2.5} color={focused ? '#ffffff' : '#64748b'} />
            </View>
            <View style={styles.fieldBody}>
                <Text style={styles.fieldLabel}>{label}</Text>
                {children}
            </View>
        </View>
    </View>
);

const StepPersonalPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const insets = useSafeAreaInsets();
    const routePrefix = location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver';
    const session = getStoredDriverRegistrationSession();
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const registrationId = session.registrationId || '';
    const role = routePrefix === '/taxi/owner'
        ? 'owner'
        : (session.role || 'driver');
    const isOwner = role === 'owner';

    const [formData, setFormData] = useState({
        fullName: session.fullName || '',
        email: session.email || '',
        gender: session.gender || '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [focusedField, setFocusedField] = useState('');

    useEffect(() => {
        saveDriverRegistrationSession({
            ...session,
            ...formData,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same as the web: saved whenever the form changes
    }, [formData]);

    useEffect(() => {
        if (!phone || !registrationId) {
            navigate(`${routePrefix}/login`, { replace: true });
        }
        if (session.roleConfirmed === false || session.needsRoleSelection === true) {
            navigate('/taxi/driver/select-role', { replace: true });
        }
    }, [navigate, phone, registrationId, routePrefix, session.needsRoleSelection, session.roleConfirmed]);

    // Back arrow / phone back button: leave straight away if nothing was typed, otherwise ask first.
    const hasUnsavedProgress = () => Boolean(formData.fullName.trim() || formData.email.trim() || formData.gender);
    const { showExitModal, handleBack, handleStay, handleExit } = useOnboardingExitGuard({
        isFirstStep: true,
        hasUnsavedProgress,
        onExit: () => navigate(`${routePrefix}/login`, { replace: true }),
    });

    const handleContinue = async () => {
        const fullName = formData.fullName.trim();
        const email = formData.email.trim().toLowerCase();

        if (!fullName || !email || !formData.gender) {
            setError('Please fill all required details');
            return;
        }

        if (!NAME_REGEX.test(fullName)) {
            setError(`${isOwner ? 'Owner' : 'Driver'} name should contain alphabets only`);
            return;
        }

        if (!EMAIL_REGEX.test(email)) {
            setError('Please enter a valid email address, example aa@gmail.com');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const normalizedFormData = {
                ...formData,
                fullName,
                email,
            };
            const response = await saveDriverPersonalDetails({
                registrationId,
                phone,
                ...normalizedFormData,
            });

            saveDriverRegistrationSession({
                ...session,
                registrationId,
                phone,
                role,
                ...normalizedFormData,
                personalSession: response?.data?.session || null,
            });

            navigate(
                SPECIAL_SIGNUP_ROLES.includes(String(role || '').toLowerCase())
                    ? '/taxi/driver/role-signup'
                    : `${routePrefix}/step-referral`,
            );
        } catch (err) {
            setError(err?.message || 'Unable to save personal details');
        } finally {
            setLoading(false);
        }
    };

    const genders = ['Male', 'Female', 'Other'];
    const formComplete = Boolean(formData.fullName && formData.email && formData.gender);

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
                contentContainerStyle={[styles.content, { paddingBottom: 128 + insets.bottom }]}
                keyboardShouldPersistTaps="handled"
                stickyHeaderIndices={[0]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.topBar}>
                    <Pressable
                        onPress={handleBack}
                        accessibilityLabel="Back"
                        style={({ pressed }) => [styles.backBtn, pressed ? styles.pressedSmall : null]}
                    >
                        <ArrowLeft size={18} strokeWidth={2.5} color="#0f172a" />
                    </Pressable>
                    <View style={styles.stepBadge}>
                        <Text style={styles.stepBadgeText}>Step 1 of 4</Text>
                    </View>
                </View>

                <View style={styles.column}>
                    <View style={styles.intro}>
                        <View style={styles.introRow}>
                            <View style={styles.introIcon}>
                                <User size={22} strokeWidth={2.5} color="#ffffff" />
                            </View>
                            <Text style={styles.introLabel}>Profile Setup</Text>
                        </View>
                        <Text style={styles.heading}>
                            {'Personal '}
                            <Text style={styles.headingMuted}>Info</Text>
                        </Text>
                        <Text style={styles.lead}>
                            Let's get the basics in place so your profile feels complete from day one.
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardHead}>
                            <Text style={styles.cardTitle}>Profile Information</Text>
                            <Text style={styles.cardSub}>Verified Credentials</Text>
                        </View>

                        <View style={styles.fields}>
                            <FieldCard Icon={User} label="Full Name" focused={focusedField === 'fullName'}>
                                <TextInput
                                    value={formData.fullName}
                                    onChangeText={(text) => setFormData(p => ({ ...p, fullName: String(text || '').replace(/[^A-Za-z .'-]/g, '') }))}
                                    onFocus={() => setFocusedField('fullName')}
                                    onBlur={() => setFocusedField((current) => (current === 'fullName' ? '' : current))}
                                    placeholder="Enter your name"
                                    placeholderTextColor="#64748b"
                                    autoCapitalize="words"
                                    autoCorrect={false}
                                    style={styles.input}
                                />
                            </FieldCard>

                            <View style={styles.phoneCard}>
                                <View style={styles.fieldRow}>
                                    <View style={styles.fieldIcon}>
                                        <Phone size={20} strokeWidth={2.5} color="#059669" />
                                    </View>
                                    <View style={styles.fieldBody}>
                                        <Text style={[styles.fieldLabel, styles.phoneLabel]}>Phone Number</Text>
                                        <Text style={styles.phoneValue}>{`+91 ${phone}`}</Text>
                                    </View>
                                </View>
                            </View>

                            <FieldCard Icon={Mail} label="Email Address" focused={focusedField === 'email'}>
                                <TextInput
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="email"
                                    value={formData.email}
                                    onChangeText={(text) => setFormData(p => ({ ...p, email: String(text || '').trim().toLowerCase() }))}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField((current) => (current === 'email' ? '' : current))}
                                    placeholder="name@gmail.com"
                                    placeholderTextColor="#64748b"
                                    style={styles.input}
                                />
                            </FieldCard>

                            <View style={styles.genderBlock}>
                                <Text style={[styles.fieldLabel, styles.genderLabel]}>Select Gender</Text>
                                <View style={styles.genderGrid}>
                                    {genders.map((g) => {
                                        const selected = formData.gender === g;
                                        return (
                                            <Pressable
                                                key={g}
                                                onPress={() => setFormData(p => ({ ...p, gender: g }))}
                                                style={[styles.genderBtn, selected ? styles.genderSelected : styles.genderIdle]}
                                            >
                                                <Text style={[styles.genderText, { color: selected ? '#ffffff' : '#64748b' }]}>{g}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
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
                        disabled={loading || !formComplete}
                        style={({ pressed }) => [
                            styles.continueBtn,
                            formComplete ? styles.continueEnabled : styles.continueIdle,
                            formComplete && pressed ? styles.pressed : null,
                        ]}
                    >
                        {loading ? (
                            <Spin>
                                <View style={styles.ring} />
                            </Spin>
                        ) : (
                            <>
                                <Text style={[styles.continueText, { color: formComplete ? '#ffffff' : '#475569' }]}>Continue</Text>
                                <ChevronRight size={18} strokeWidth={3} color={formComplete ? '#ffffff' : '#475569'} />
                            </>
                        )}
                    </Pressable>
                </View>
            </View>

            <OnboardingExitModal
                open={showExitModal}
                onStay={handleStay}
                onExit={handleExit}
                theme="taxi"
                title="Exit registration?"
                message="Are you sure you want to exit? The details you entered will not be submitted."
                stayLabel="Cancel"
                exitLabel="Exit"
            />
        </View>
    );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL), so this page is drawn only while it is in front.
const StepPersonal = () => {
    const focused = useIsFocused();
    return focused ? <StepPersonalPage /> : null;
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#ffffff' },
    scroll: { flex: 1 },
    content: { flexGrow: 1, paddingTop: 20, paddingHorizontal: 20 },
    column: { width: '100%', maxWidth: 384, alignSelf: 'center', gap: 24 },
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
        borderColor: '#e2e8f0',
        backgroundColor: '#ffffff',
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
    stepBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: '#475569' },
    intro: { gap: 12 },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    introIcon: {
        width: 44,
        height: 44,
        borderRadius: 20,
        backgroundColor: '#0f172a',
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.xl,
        shadowColor: '#0f172a',
    },
    introLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 2.2, textTransform: 'uppercase', color: '#64748b' },
    heading: { fontSize: 48, lineHeight: 50, fontWeight: '700', letterSpacing: -1.44, color: '#0f172a' },
    headingMuted: { color: '#64748b' },
    lead: { maxWidth: 235, fontSize: 15, lineHeight: 24.4, fontWeight: '700', color: alpha('#64748b', 0.8) },
    card: {
        gap: 20,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        backgroundColor: '#ffffff',
        padding: 24,
        elevation: 3,
        shadowColor: '#000000',
        shadowOpacity: 0.04,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
    },
    cardHead: { gap: 4, paddingHorizontal: 4 },
    cardTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', letterSpacing: -0.45, color: '#0f172a' },
    cardSub: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#64748b' },
    fields: { gap: 16 },
    fieldCard: {
        borderRadius: 28.8,
        borderWidth: 2,
        borderColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
        padding: 16,
    },
    fieldCardFocused: {
        borderColor: alpha('#0f172a', 0.1),
        backgroundColor: '#ffffff',
        ...shadow.xl,
        shadowColor: '#0f172a',
        shadowOpacity: 0.05,
    },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    fieldIcon: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.sm,
    },
    fieldIconFocused: { backgroundColor: '#0f172a' },
    fieldBody: { flex: 1, minWidth: 0, gap: 2 },
    fieldLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: '#475569' },
    input: { width: '100%', fontSize: 16, lineHeight: 22, fontWeight: '600', color: '#0f172a', paddingVertical: 0 },
    phoneCard: {
        borderRadius: 28.8,
        borderWidth: 2,
        borderColor: '#ecfdf5',
        backgroundColor: alpha('#ecfdf5', 0.3),
        padding: 16,
    },
    phoneLabel: { color: alpha('#059669', 0.6) },
    phoneValue: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: '#0f172a' },
    genderBlock: { gap: 12, paddingTop: 8 },
    genderLabel: { paddingHorizontal: 8 },
    genderGrid: { flexDirection: 'row', gap: 12 },
    genderBtn: { flex: 1, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
    genderSelected: { backgroundColor: driverTheme.button, ...shadow.xl, shadowColor: '#0f172a', shadowOpacity: 0.2 },
    genderIdle: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#e2e8f0' },
    genderText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    errorBox: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#fecdd3',
        backgroundColor: '#fff1f2',
        paddingHorizontal: 16,
        paddingVertical: 12,
        elevation: 2,
        shadowColor: '#f43f5e',
        shadowOpacity: 0.08,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
    },
    errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#be123c' },
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
    continueIdle: { backgroundColor: '#cbd5e1' },
    pressed: { transform: [{ scale: 0.98 }] },
    continueText: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
    ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha('#ffffff', 0.3), borderTopColor: '#ffffff' },
});

export default StepPersonal;
