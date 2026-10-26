// Web: pages/registration/StepReferral.jsx — /taxi/driver/step-referral, /taxi/owner/step-referral (step 2 of 4).
// Optional referral code -> PATCH /drivers/onboarding/referral { registrationId, phone, referralCode } (empty = skip)
// -> <prefix>/step-vehicle. No registration session -> <prefix>/reg-phone.
// Native: the sticky top bar is a sticky header of the ScrollView; the page starts below the status bar (its strip
// shows the page's top colour) and the fixed Continue bar sits above the navigation bar.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { ArrowLeft, Gift, ChevronRight, Tag } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { Text, TextInput } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { Spin } from '@/shared/components/Loader';
import { alpha, driverTheme, shadow } from '@/theme';
import {
    getStoredDriverRegistrationSession,
    saveDriverReferral,
    saveDriverRegistrationSession,
} from '../../services/registrationService';

const StepReferralPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const insets = useSafeAreaInsets();
    const routePrefix = location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver';
    const session = getStoredDriverRegistrationSession();
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const registrationId = String(session.registrationId || '').trim();
    const [referral, setReferral] = useState(session.referralCode || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        saveDriverRegistrationSession({
            ...session,
            referralCode: referral,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same as the web: saved whenever the code changes
    }, [referral]);

    useEffect(() => {
        if (!phone || !registrationId) {
            navigate(`${routePrefix}/reg-phone`, { replace: true });
        }
    }, [navigate, phone, registrationId, routePrefix]);

    const handleNext = async (skip = false) => {
        setLoading(true);
        setError('');

        try {
            const response = await saveDriverReferral({
                registrationId: session.registrationId,
                phone: session.phone,
                referralCode: skip ? '' : referral,
            });

            saveDriverRegistrationSession({
                ...session,
                referralCode: skip ? '' : referral,
                referralSession: response?.data?.session || null,
            });

            navigate(`${routePrefix}/step-vehicle`);
        } catch (err) {
            setError(err?.message || 'Unable to save referral code');
        } finally {
            setLoading(false);
        }
    };

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
                        onPress={() => navigate(`${routePrefix}/step-personal`)}
                        accessibilityLabel="Back"
                        style={({ pressed }) => [styles.backBtn, pressed ? styles.backPressed : null]}
                    >
                        <ArrowLeft size={18} strokeWidth={2.5} color="#0f172a" />
                    </Pressable>
                    <View style={styles.stepBadge}>
                        <Text style={styles.stepBadgeText}>Step 2 of 4</Text>
                    </View>
                </View>

                <View style={styles.column}>
                    <View style={styles.intro}>
                        <View style={styles.introRow}>
                            <View style={styles.introIcon}>
                                <Gift size={22} strokeWidth={2.5} color="#ffffff" />
                            </View>
                            <Text style={styles.introLabel}>Rewards Program</Text>
                        </View>
                        <Text style={styles.heading}>
                            {'Got a '}
                            <Text style={styles.headingMuted}>Code?</Text>
                        </Text>
                        <Text style={styles.lead}>
                            Invited by a Hello Parth driver? Enter their referral code. Rewards follow the current referral programme.
                        </Text>
                    </View>

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.card}>
                        <View style={styles.cardHead}>
                            <Text style={styles.cardTitle}>Referral Code</Text>
                            <Text style={styles.cardSub}>Optional Bonus</Text>
                        </View>

                        <View style={[styles.fieldCard, focused ? styles.fieldCardFocused : null]}>
                            <View style={styles.fieldRow}>
                                <View style={[styles.fieldIcon, focused ? styles.fieldIconFocused : null]}>
                                    <Tag size={20} strokeWidth={2.5} color={focused ? '#ffffff' : '#64748b'} />
                                </View>
                                <View style={styles.fieldBody}>
                                    <Text style={styles.fieldLabel}>Referral Code</Text>
                                    <TextInput
                                        value={referral}
                                        onChangeText={(text) => setReferral(String(text || '').toUpperCase())}
                                        onFocus={() => setFocused(true)}
                                        onBlur={() => setFocused(false)}
                                        placeholder="ENTER REFERRAL CODE"
                                        placeholderTextColor="#64748b"
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        style={styles.input}
                                    />
                                </View>
                            </View>
                        </View>
                    </View>

                    <Text style={styles.note}>A referral code is not required. Leave it empty to continue.</Text>
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
                        // no code typed = continue without one (it used to stay greyed out, so drivers thought the code was compulsory)
                        onPress={() => handleNext(!referral.trim())}
                        disabled={loading}
                        style={({ pressed }) => [styles.continueBtn, pressed ? styles.pressed : null]}
                    >
                        {loading ? (
                            <Spin>
                                <View style={styles.ring} />
                            </Spin>
                        ) : (
                            <>
                                <Text style={styles.continueText}>{referral.trim() ? 'Apply & Continue' : 'Continue'}</Text>
                                <ChevronRight size={18} strokeWidth={3} color="#ffffff" />
                            </>
                        )}
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL), so this page is drawn only while it is in front.
const StepReferral = () => {
    const focused = useIsFocused();
    return focused ? <StepReferralPage /> : null;
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
    // whileTap scale 0.9
    backPressed: { transform: [{ scale: 0.9 }] },
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
    heading: { fontSize: 48, lineHeight: 50, fontWeight: '700', letterSpacing: -1.92, color: '#0f172a' },
    headingMuted: { color: '#64748b' },
    lead: { maxWidth: 235, fontSize: 15, lineHeight: 24.4, fontWeight: '700', color: alpha('#64748b', 0.8) },
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
    fieldBody: { flex: 1, minWidth: 0, gap: 2, overflow: 'hidden' },
    fieldLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: '#475569' },
    // tracking-wider uppercase (the placeholder too)
    input: { width: '100%', fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: 0.8, color: '#0f172a', paddingVertical: 0 },
    note: { paddingHorizontal: 8, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#64748b' },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 24 },
    footerInner: { width: '100%', maxWidth: 384, alignSelf: 'center' },
    // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
    continueBtn: {
        height: 64,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        borderRadius: 28.8,
        backgroundColor: driverTheme.button,
        elevation: 14,
        shadowColor: '#000000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 20 },
    },
    pressed: { transform: [{ scale: 0.98 }] },
    continueText: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: '#ffffff' },
    ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha('#ffffff', 0.3), borderTopColor: '#ffffff' },
});

export default StepReferral;
