// Web: components/auth/AuthShell.jsx (+ AuthShell.css) — the frame of the partner sign-in screens (login, OTP, role
// selection). Phone width only: the hero strip on top (photo, dark gradient, logo, Taxi / Bus badges) and the form
// below it. The desktop brand panel (lg+) is not drawn in the app.
// Native: the hero reaches under the status bar (edge to edge) and its content starts below insets.top; the form
// scrolls (keyboardShouldPersistTaps) and keeps its bottom padding above the navigation bar. On Android the window
// resizes for the keyboard; on iOS a KeyboardAvoidingView does the same.
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Bus, Car } from 'lucide-react-native';
import { AppImage, Text } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha } from '@/theme';
import { DEFAULT_BRAND_LOGO } from '@/shared/constants/brandLogo';
import heroImage from '../../../../assets/images/driver-login-bg.jpg';

// The fleet this partner login covers — shown as a small badge row so the page reads as a transport app at
// a glance, not just a generic sign-in form.
const FLEET_BADGES = [
  { Icon: Car, label: 'Taxi' },
  { Icon: Bus, label: 'Bus' },
];

const FleetStrip = ({ tone = 'dark' }) => (
  <View style={styles.fleetRow}>
    {FLEET_BADGES.map(({ Icon, label }) => {
      const dark = tone === 'dark';
      const color = dark ? '#ffffff' : '#b45309';
      return (
        <View key={label} style={[styles.fleetBadge, dark ? styles.fleetBadgeDark : styles.fleetBadgeLight]}>
          <Icon size={14} strokeWidth={2.4} color={color} />
          <Text style={[styles.fleetLabel, { color }]}>{label}</Text>
        </View>
      );
    })}
  </View>
);

/**
 * Frame for the partner sign-in screens (login, OTP, role selection): a compact hero strip on top and the form
 * below it, full width (held to a readable column on wide screens).
 */
const AuthShell = ({ eyebrow, title, subtitle, onBack, backLabel = 'Back', children, footer }) => {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero strip */}
        <View style={[styles.hero, { height: 160 + insets.top }]}>
          <AppImage src={heroImage} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
          <LinearGradient
            colors={['rgba(9,12,28,0.6)', 'rgba(9,12,28,0.45)', '#f6f7fb']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroInner, { paddingTop: insets.top + 20 }]}>
            <AppImage
              src={DEFAULT_BRAND_LOGO}
              accessibilityLabel="Hello Parth"
              style={styles.logo}
              contentFit="contain"
              contentPosition="left"
            />
            <FleetStrip tone="dark" />
          </View>
        </View>

        <View style={[styles.main, { paddingBottom: Math.max(32, insets.bottom) }]}>
          <View style={styles.column}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
              >
                <ArrowLeft size={18} strokeWidth={2.4} color="#475569" />
                <Text style={styles.backLabel}>{backLabel}</Text>
              </Pressable>
            ) : null}

            <View style={onBack ? null : styles.headerPad}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            <View style={styles.body}>{children}</View>

            {footer ? <View style={styles.body}>{footer}</View> : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f7fb' },
  scrollContent: { flexGrow: 1 },
  hero: { position: 'relative', overflow: 'hidden' },
  heroInner: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  // h-14 w-auto: the logo file is 3:2
  logo: { height: 56, width: 84 },
  fleetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fleetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fleetBadgeDark: { borderColor: alpha('#ffffff', 0.15), backgroundColor: alpha('#ffffff', 0.1) },
  fleetBadgeLight: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  fleetLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  main: { flex: 1, paddingHorizontal: 20, paddingTop: 8, zIndex: 10 },
  column: { width: '100%', maxWidth: 448, alignSelf: 'center' },
  backBtn: {
    alignSelf: 'flex-start',
    marginLeft: -8,
    marginBottom: 20,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 8,
  },
  backBtnPressed: { backgroundColor: 'rgba(15,23,42,0.1)' },
  backLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#475569' },
  headerPad: { paddingTop: 12 },
  eyebrow: { marginBottom: 8, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1.68, textTransform: 'uppercase', color: '#b45309' },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '600', letterSpacing: -0.7, color: '#0b1220' },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 24, color: '#64748b' },
  body: { marginTop: 24 },
});

export default AuthShell;
