// Web: pages/registration/LanguageSelect.jsx — /taxi/driver/lang-select, /taxi/owner/lang-select. Picks the partner
// app language (localStorage driver_lang), then opens the phone registration (or, for a signed-in partner, goes back
// to the app with "Save Changes").
// Native: the page background reaches under the status bar; the fixed footer button sits above the navigation bar.
// The web's staggered entrance of the language cards is not reproduced (pages appear instantly in the app).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { Check, ChevronRight, Globe } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, StatusBarScrim, Text } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, driverTheme, shadow } from '@/theme';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { getLocalDriverToken, getStoredDriverRole } from '../../services/registrationService';

const languages = [
    { id: 'english', label: 'English', sub: 'Standard Experience', native: 'English' },
    { id: 'hindi', label: 'Hindi', sub: 'मानक अनुभव', native: 'हिन्दी' },
    { id: 'marathi', label: 'Marathi', sub: 'मानक अनुभव', native: 'मराठी' },
    { id: 'gujarati', label: 'Gujarati', sub: 'પ્રમાણભૂત અનુભવ', native: 'ગુજરાતી' },
];

// motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} — the check of the selected language pops in
const SelectedCheck = () => {
    const scale = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const anim = Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 });
        anim.start();
        return () => anim.stop();
    }, [scale]);
    return (
        <Animated.View style={[styles.check, { transform: [{ scale }] }]}>
            <Check size={16} strokeWidth={3} color="#0f172a" />
        </Animated.View>
    );
};

const LanguageSelectPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const insets = useSafeAreaInsets();
    const { settings } = useSettings();
    const appName = settings.general?.app_name || 'App';
    const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';
    const [selectedLang, setSelectedLang] = useState(() => localStorage.getItem('driver_lang') || 'english');
    const isAuthenticatedDriver = Boolean(getLocalDriverToken()) && !location.state?.registrationFlow;
    const authenticatedHome =
        String(getStoredDriverRole() || 'driver').toLowerCase() === 'owner'
            ? '/taxi/driver/profile'
            : '/taxi/driver/home';

    const handleConfirm = () => {
        localStorage.setItem('driver_lang', selectedLang);
        navigate(isAuthenticatedDriver ? authenticatedHome : '/taxi/driver/reg-phone', { replace: true });
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
                style={styles.fill}
                contentContainerStyle={[
                    styles.content,
                    { paddingTop: insets.top + 32, paddingBottom: 128 + insets.bottom },
                ]}
                showsVerticalScrollIndicator={false}
            >
                {/* Branding */}
                <View style={styles.branding}>
                    {appLogo ? (
                        <AppImage src={appLogo} accessibilityLabel={appName} style={styles.logo} contentFit="contain" />
                    ) : (
                        <View style={styles.nameChip}>
                            <Text style={styles.nameChipText}>{appName}</Text>
                        </View>
                    )}
                    <View style={styles.headingBlock}>
                        <Text style={styles.title}>
                            {'Select '}
                            <Text style={styles.titleMuted}>Language</Text>
                        </Text>
                        <Text style={styles.subtitle}>Choose your preferred communication language to get started.</Text>
                    </View>
                </View>

                {/* Language Grid */}
                <View style={styles.grid}>
                    {languages.map((lang) => {
                        const selected = selectedLang === lang.id;
                        return (
                            <Pressable
                                key={lang.id}
                                onPress={() => setSelectedLang(lang.id)}
                                style={[styles.card, selected ? styles.cardSelected : styles.cardIdle]}
                            >
                                {/* Subtle Background Pattern */}
                                <View pointerEvents="none" style={[styles.pattern, { opacity: selected ? 0.05 : 0.02 }]}>
                                    <Globe size={80} color={selected ? '#ffffff' : '#0f172a'} />
                                </View>

                                <View style={styles.cardLeft}>
                                    <View style={[styles.cardIcon, selected ? styles.cardIconSelected : styles.cardIconIdle]}>
                                        <Globe size={20} strokeWidth={2.5} color={selected ? '#ffffff' : '#64748b'} />
                                    </View>
                                    <View>
                                        <Text style={[styles.langLabel, { color: selected ? '#ffffff' : '#0f172a' }]}>{lang.label}</Text>
                                        <Text style={[styles.langNative, { color: selected ? '#ffffff' : '#64748b' }]}>{lang.native}</Text>
                                    </View>
                                </View>

                                {selected ? <SelectedCheck /> : null}
                            </Pressable>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Footer Action */}
            <View style={[styles.footer, { paddingBottom: 32 + insets.bottom }]} pointerEvents="box-none">
                <LinearGradient
                    pointerEvents="none"
                    colors={[alpha('#ffffff', 0), alpha('#ffffff', 0.95), '#ffffff']}
                    style={StyleSheet.absoluteFill}
                />
                <Pressable
                    onPress={handleConfirm}
                    style={({ pressed }) => [styles.confirmBtn, pressed && styles.confirmPressed]}
                >
                    <Text style={styles.confirmText}>{isAuthenticatedDriver ? 'Save Changes' : 'Confirm & Start'}</Text>
                    <ChevronRight size={17} strokeWidth={3} color="#ffffff" />
                </Pressable>
            </View>
            <StatusBarScrim color="#f6efe4" />
        </View>
    );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL), so this page is drawn only while it is in front.
const LanguageSelect = () => {
    const focused = useIsFocused();
    return focused ? <LanguageSelectPage /> : null;
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#ffffff' },
    fill: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: 20 },
    branding: { marginBottom: 24, alignItems: 'center', gap: 16 },
    logo: { height: 40, width: 160 },
    nameChip: {
        borderRadius: 14,
        backgroundColor: '#0f172a',
        paddingHorizontal: 16,
        paddingVertical: 8,
        ...shadow.xl,
    },
    nameChipText: { fontSize: 16, lineHeight: 24, fontWeight: '900', letterSpacing: -0.8, color: '#ffffff' },
    headingBlock: { alignItems: 'center', gap: 4 },
    title: { fontSize: 32, lineHeight: 35.2, fontWeight: '900', letterSpacing: -1.28, color: '#0f172a', textAlign: 'center' },
    titleMuted: { color: '#64748b' },
    subtitle: {
        maxWidth: 250,
        fontSize: 14,
        lineHeight: 22.75,
        fontWeight: '700',
        color: alpha('#64748b', 0.8),
        textAlign: 'center',
    },
    // main.flex-1.grid: the rows stretch to fill the screen height (grid align-content: stretch)
    grid: { flex: 1, gap: 12 },
    card: {
        flexGrow: 1,
        position: 'relative',
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 16,
        borderWidth: 2,
    },
    cardSelected: { backgroundColor: '#020617', borderColor: '#020617', ...shadow.lg, shadowColor: '#0f172a', shadowOpacity: 0.2 },
    cardIdle: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', ...shadow.sm },
    pattern: { position: 'absolute', right: -12, bottom: -12 },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 10 },
    cardIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cardIconSelected: { backgroundColor: alpha('#ffffff', 0.1) },
    cardIconIdle: { backgroundColor: '#f8fafc' },
    langLabel: { fontSize: 16, lineHeight: 20, fontWeight: '900', letterSpacing: -0.4 },
    langNative: {
        marginTop: 2,
        fontSize: 11,
        lineHeight: 13.75,
        fontWeight: '900',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        opacity: 0.6,
    },
    check: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        ...shadow.xl,
    },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 20, zIndex: 20 },
    // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
    confirmBtn: {
        width: '100%',
        height: 56,
        borderRadius: 16,
        backgroundColor: driverTheme.button,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        elevation: 10,
        shadowColor: '#000000',
        shadowOpacity: 0.15,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 15 },
    },
    confirmPressed: { transform: [{ scale: 0.99 }] },
    confirmText: { fontSize: 14, lineHeight: 20, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#ffffff' },
});

export default LanguageSelect;
