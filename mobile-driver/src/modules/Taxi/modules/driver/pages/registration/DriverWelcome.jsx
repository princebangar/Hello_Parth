// Web: pages/registration/DriverWelcome.jsx — /taxi/driver/welcome. Partner programme intro (hero photo, benefits)
// with "Apply to Drive" -> /taxi/driver/lang-select.
// Native: the hero photo reaches under the status bar (its logo starts below insets.top); the fixed footer button
// sits above the navigation bar. The web's fade-up entrance of the texts / cards is not reproduced (pages appear
// instantly in the app); the press feedback (scale) is kept.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { ChevronRight, ShieldCheck, Wallet, Clock, TrendingUp, Sparkles } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, driverTheme, shadow } from '@/theme';
import DriverHero from '@/assets/driver_welcome_hero.jpg';
import { useSettings } from '../../../../shared/context/SettingsContext';

const perks = [
    { Icon: Wallet, title: 'Weekly Payouts', sub: 'Receive your earnings directly every week.' },
    { Icon: Clock, title: 'Set Your Schedule', sub: 'Ultimate flexibility to drive whenever you want.' },
    { Icon: ShieldCheck, title: 'Premium Support', sub: 'Dedicated 24/7 assistance for our partners.' },
    { Icon: TrendingUp, title: 'Growth Incentives', sub: 'Earn bonuses for high performance and trips.' },
];

const DriverWelcomePage = () => {
    const navigate = useNavigate();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const { settings } = useSettings();
    const appName = settings.general?.app_name || 'App';
    const appLogo = settings.general?.logo || settings.customization?.logo;
    // h-[48vh] of the page area (the WebView sat below the status bar), plus the status bar the hero now covers
    const heroHeight = Math.round((windowHeight - insets.top - insets.bottom) * 0.48) + insets.top;

    return (
        <View style={styles.root}>
            <StatusBar style="light" />
            <LinearGradient
                colors={['#f6efe4', '#fcfaf6', '#ffffff']}
                locations={[0, 0.28, 1]}
                style={StyleSheet.absoluteFill}
            />
            <ScrollView
                style={styles.fill}
                contentContainerStyle={{ paddingBottom: 144 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Section */}
                <View style={[styles.heroShadow, { height: heroHeight }]}>
                    <View style={styles.hero}>
                        <AppImage
                            src={DriverHero}
                            accessibilityLabel={`Drive with ${appName}`}
                            style={[StyleSheet.absoluteFill, styles.heroImage]}
                            contentFit="cover"
                            transition={0}
                        />
                        <LinearGradient
                            colors={['transparent', alpha('#0f172a', 0.4), '#0f172a']}
                            locations={[0, 0.5, 1]}
                            style={[StyleSheet.absoluteFill, styles.z10]}
                        />

                        {/* Branding Top Overlay */}
                        <View style={[styles.brandingTop, { top: insets.top + 40 }]}>
                            {appLogo ? (
                                <AppImage src={appLogo} accessibilityLabel={appName} style={styles.logo} contentFit="contain" contentPosition="left" />
                            ) : (
                                <View style={styles.nameChip}>
                                    <Text style={styles.nameChipText}>{appName}</Text>
                                </View>
                            )}
                        </View>

                        {/* Overlay Greeting */}
                        <View style={styles.greeting}>
                            <View style={styles.badge}>
                                <Sparkles size={12} strokeWidth={3} color="#fbbf24" />
                                <Text style={styles.badgeText}>Partner Program</Text>
                            </View>
                            <Text style={styles.heroTitle}>
                                {'Drive & '}
                                <Text style={styles.heroTitleAccent}>Earn Daily</Text>
                            </Text>
                            <Text style={styles.heroSub}>
                                {`Join the professional network of ${appName} partners and take control of your time.`}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Content Section */}
                <View style={styles.main}>
                    <View style={styles.sectionHead}>
                        <Text style={styles.sectionTitle}>Partner Benefits</Text>
                        <Text style={styles.sectionSub}>{`Why partners choose ${appName}`}</Text>
                    </View>

                    <View style={styles.perks}>
                        {perks.map(({ Icon, title, sub }) => (
                            <Pressable key={title} style={({ pressed }) => [styles.perkCard, pressed && styles.perkPressed]}>
                                <View style={styles.perkIcon}>
                                    <Icon size={18} color="#ffffff" />
                                </View>
                                <View style={styles.perkText}>
                                    <Text style={styles.perkTitle}>{title}</Text>
                                    <Text style={styles.perkSub}>{sub}</Text>
                                </View>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </ScrollView>

            {/* Sticky Action Footer */}
            <View style={[styles.footer, { paddingBottom: 40 + insets.bottom }]} pointerEvents="box-none">
                <LinearGradient
                    pointerEvents="none"
                    colors={[alpha('#f8fafc', 0), '#f8fafc', '#f8fafc']}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.footerInner}>
                    <Pressable
                        onPress={() => navigate('/taxi/driver/lang-select')}
                        style={({ pressed }) => [styles.applyBtn, pressed && styles.applyPressed]}
                    >
                        <Text style={styles.applyText}>Apply to Drive</Text>
                        <ChevronRight size={18} strokeWidth={3} color="#ffffff" />
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL), so this page is drawn only while it is in front.
const DriverWelcome = () => {
    const focused = useIsFocused();
    return focused ? <DriverWelcomePage /> : null;
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#ffffff' },
    fill: { flex: 1 },
    z10: { zIndex: 10 },
    heroShadow: {
        borderBottomLeftRadius: 56,
        borderBottomRightRadius: 56,
        backgroundColor: '#0f172a',
        ...shadow['2xl'],
    },
    hero: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        borderBottomLeftRadius: 56,
        borderBottomRightRadius: 56,
    },
    // scale-110
    heroImage: { transform: [{ scale: 1.1 }] },
    brandingTop: { position: 'absolute', left: 32, zIndex: 20 },
    logo: { height: 40, width: 160 },
    nameChip: { borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 8, ...shadow.xl },
    nameChipText: { fontSize: 14, lineHeight: 20, fontWeight: '900', letterSpacing: -0.7, color: '#0f172a' },
    greeting: { position: 'absolute', bottom: 48, left: 32, right: 32, zIndex: 20, gap: 16 },
    badge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 9999,
        backgroundColor: alpha('#ffffff', 0.1),
        borderWidth: 1,
        borderColor: alpha('#ffffff', 0.1),
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    badgeText: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', color: '#fbbf24' },
    heroTitle: { fontSize: 48, lineHeight: 45.6, fontWeight: '900', letterSpacing: -2.4, color: '#ffffff', paddingTop: 4 },
    heroTitleAccent: { color: '#fbbf24' },
    heroSub: {
        maxWidth: 200,
        fontSize: 15,
        lineHeight: 24.4,
        fontWeight: '700',
        color: alpha('#ffffff', 0.7),
        opacity: 0.9,
    },
    main: { paddingHorizontal: 24, paddingTop: 48, gap: 32 },
    sectionHead: { paddingHorizontal: 4, gap: 4 },
    sectionTitle: { fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45, color: '#0f172a' },
    sectionSub: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '900',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: '#64748b',
        opacity: 0.6,
    },
    perks: { gap: 20 },
    perkCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 20,
        backgroundColor: '#ffffff',
        padding: 20,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        elevation: 3,
        shadowColor: '#000000',
        shadowOpacity: 0.04,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
    },
    perkPressed: { transform: [{ scale: 0.98 }] },
    perkIcon: {
        marginTop: 4,
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: '#0f172a',
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.lg,
        shadowColor: '#0f172a',
    },
    perkText: { flex: 1, gap: 4 },
    perkTitle: { fontSize: 17, lineHeight: 24, fontWeight: '900', letterSpacing: -0.43, color: '#0f172a' },
    perkSub: { fontSize: 13, lineHeight: 21.1, fontWeight: '700', color: alpha('#64748b', 0.8) },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 24, zIndex: 50 },
    footerInner: { width: '100%', maxWidth: 384, alignSelf: 'center' },
    // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme)
    applyBtn: {
        width: '100%',
        height: 64,
        borderRadius: 28.8,
        backgroundColor: driverTheme.button,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        elevation: 14,
        shadowColor: '#000000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 20 },
    },
    applyPressed: { transform: [{ scale: 0.98 }] },
    applyText: { fontSize: 15, lineHeight: 20, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', color: '#ffffff' },
});

export default DriverWelcome;
