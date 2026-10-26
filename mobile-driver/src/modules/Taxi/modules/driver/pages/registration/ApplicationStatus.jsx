// Web: pages/registration/ApplicationStatus.jsx — /taxi/driver/status, /taxi/owner/status. Static "application
// submitted" screen with a Contact Support button (-> /taxi/driver/support). No API calls.
// Native: the web's entrance animation of the icon is not reproduced (pages appear instantly in the app); the blurred
// pulsing ring behind the icon used an undefined colour class (bg-taxi-primary) and is invisible on the web, so it is
// not drawn. The fixed bottom panel sits above the navigation bar.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { Clock, ShieldCheck, HelpCircle, CheckCircle2, FileText, TrendingUp } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { StatusBarScrim, Text } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, driverTheme, shadow } from '@/theme';

// animate-pulse: opacity 1 -> 0.5 -> 1 every 2 s
const Pulse = ({ children }) => {
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const half = (toValue) => Animated.timing(opacity, {
            toValue,
            duration: 1000,
            easing: Easing.bezier(0.4, 0, 0.6, 1),
            useNativeDriver: true,
        });
        const loop = Animated.loop(Animated.sequence([half(0.5), half(1)]));
        loop.start();
        return () => loop.stop();
    }, [opacity]);
    return <Animated.View style={{ opacity }}>{children}</Animated.View>;
};

const ApplicationStatusPage = () => {
    const navigate = useNavigate();
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.root}>
            <StatusBar style="dark" />
            <ScrollView
                style={styles.fill}
                contentContainerStyle={[
                    styles.content,
                    { paddingTop: 80 + insets.top, paddingBottom: 128 + insets.bottom },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.center}>
                    <View style={styles.iconWrap}>
                        {/* Main Review Icon */}
                        <View style={styles.iconCard}>
                            <Clock size={52} color="#0F172A" strokeWidth={2.5} />
                            <View style={styles.iconBadge}>
                                <CheckCircle2 size={20} strokeWidth={3} color="#ffffff" />
                            </View>
                        </View>
                    </View>

                    <View style={styles.texts}>
                        <Text style={styles.title}>Application Successfully Submitted</Text>
                        <Text style={styles.body}>
                            Our team is currently reviewing your documents. This usually takes 12-24 hours.
                        </Text>
                    </View>

                    {/* Status Breakdown */}
                    <View style={styles.statusList}>
                        <View style={styles.statusCard}>
                            <View style={styles.statusLeft}>
                                <View style={[styles.statusIcon, { backgroundColor: '#ecfdf5' }]}>
                                    <FileText size={20} color="#10b981" />
                                </View>
                                <View style={styles.statusText}>
                                    <Text style={styles.statusTitle}>KYC Verification</Text>
                                    <Text style={styles.statusSub}>In Progress</Text>
                                </View>
                            </View>
                            <Pulse>
                                <TrendingUp size={16} color="#10b981" />
                            </Pulse>
                        </View>

                        <View style={styles.statusCard}>
                            <View style={styles.statusLeft}>
                                <View style={[styles.statusIcon, { backgroundColor: '#f8fafc' }]}>
                                    <ShieldCheck size={20} color="#94a3b8" />
                                </View>
                                <View style={[styles.statusText, styles.dim]}>
                                    <Text style={styles.statusTitle}>Background Check</Text>
                                    <Text style={styles.statusSub}>Waiting</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Bottom Panel */}
            <View style={[styles.bottomPanel, { paddingBottom: 48 + insets.bottom }]}>
                <Pressable
                    onPress={() => navigate('/taxi/driver/support')}
                    style={({ pressed }) => [styles.supportBtn, pressed ? styles.pressed : null]}
                >
                    <Text style={styles.supportText}>Contact Support</Text>
                    <HelpCircle size={20} strokeWidth={2.5} color="#64748b" />
                </Pressable>
            </View>
            <StatusBarScrim color={driverTheme.bg} />
        </View>
    );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one, so this page is drawn only while it is in front.
const ApplicationStatus = () => {
    const focused = useIsFocused();
    return focused ? <ApplicationStatusPage /> : null;
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: driverTheme.bg },
    fill: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: 32 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 48 },
    iconWrap: { position: 'relative' },
    iconCard: {
        width: 128,
        height: 128,
        borderRadius: 40,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        ...shadow['2xl'],
    },
    iconBadge: {
        position: 'absolute',
        bottom: -8,
        right: -8,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#10b981',
        borderWidth: 4,
        borderColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.lg,
    },
    texts: { alignItems: 'center', gap: 16, paddingHorizontal: 8 },
    title: { fontSize: 30, lineHeight: 37.5, fontWeight: '900', letterSpacing: -0.75, color: '#0F172A', textAlign: 'center' },
    body: { fontSize: 14, lineHeight: 22.75, fontWeight: '700', color: '#64748b', textAlign: 'center' },
    statusList: { width: '100%', gap: 16 },
    statusCard: {
        backgroundColor: '#ffffff',
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    statusIcon: { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    statusText: { gap: 2 },
    dim: { opacity: 0.4 },
    statusTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: '#0F172A' },
    statusSub: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: -0.55, textTransform: 'uppercase', color: '#64748b' },
    bottomPanel: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 32,
        paddingTop: 16,
        backgroundColor: alpha('#ffffff', 0.5),
        zIndex: 50,
        gap: 16,
    },
    supportBtn: {
        width: '100%',
        height: 64,
        backgroundColor: '#ffffff',
        borderWidth: 2,
        borderColor: '#f1f5f9',
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    pressed: { transform: [{ scale: 0.95 }] },
    supportText: { fontSize: 16, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4, textTransform: 'uppercase', color: '#64748b' },
});

export default ApplicationStatus;
