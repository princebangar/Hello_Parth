// Web: modules/Taxi/modules/user/components/HeaderGreeting.jsx — logo + location + wallet button (+ search pill).
// Used by the web's desktop Home column and kept for any caller. Colours follow index.css's .user-app-theme remaps.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Search, Wallet } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { getSavedLocationLabel, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { useUserTheme, useUserPalette, USER_SHADOW } from '../../../shared/context/UserThemeContext';
import { useSettings } from '../../../shared/context/SettingsContext';

const fallingCoins = [
  { id: 1, left: '24%', delay: 0 },
  { id: 2, left: '50%', delay: 650 },
  { id: 3, left: '72%', delay: 1200 },
];

/** A looping 0 -> 1 -> 0 value (framer-motion's repeat: Infinity keyframes). */
const useLoop = (duration, { delay = 0, repeatDelay = 0, pingPong = true } = {}) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const steps = pingPong
      ? [
          Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]
      : [
          Animated.timing(v, { toValue: 1, duration, easing: Easing.in(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ];
    if (repeatDelay) steps.push(Animated.delay(repeatDelay));
    const loop = Animated.loop(Animated.sequence(steps));
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, duration, delay, repeatDelay, pingPong]);
  return v;
};

const Coin = ({ left, delay }) => {
  const v = useLoop(1800, { delay, repeatDelay: 800, pingPong: false });
  return (
    <Animated.View
      style={[
        styles.coin,
        {
          left,
          opacity: v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 10, 16] }) },
            { scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 1, 0.92] }) },
          ],
        },
      ]}
    >
      <LinearGradient colors={[colors.slate[300], colors.slate[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
};

const HeaderGreeting = ({ floating = false, hideSearch = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const { theme } = useUserTheme();
  const p = useUserPalette();

  const { settings } = useSettings();
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';
  const appName = settings.general?.app_name || 'Hello Parth';
  const [locationLabel, setLocationLabel] = useState(getSavedLocationLabel);

  const glow = useLoop(3200);
  const logoFloat = useLoop(3200);
  const shine = useLoop(2400);
  const walletBob = useLoop(2600);

  // entrance (initial -> animate)
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 450, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [enter]);

  useEffect(() => {
    const syncLocationLabel = () => {
      setLocationLabel(getSavedLocationLabel());
    };

    syncLocationLabel();
    window.addEventListener('storage', syncLocationLabel);
    window.addEventListener(LOCATION_UPDATED_EVENT, syncLocationLabel);

    return () => {
      window.removeEventListener('storage', syncLocationLabel);
      window.removeEventListener(LOCATION_UPDATED_EVENT, syncLocationLabel);
    };
  }, []);

  if (floating) {
    return (
      <View pointerEvents="box-none" style={styles.floatingWrap}>
        <View style={styles.row}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/wallet`)}
            style={({ pressed }) => [styles.floatingWallet, { backgroundColor: p.cardBg, borderColor: p.border }, USER_SHADOW, pressed && styles.pressed95]}
          >
            <Wallet size={15} color={p.textPrimary} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.leftGroup}>
          <Animated.View
            style={[
              styles.logoBox,
              {
                opacity: enter,
                transform: [
                  { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                  { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                ],
              },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.logoGlow,
                {
                  opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.75] }),
                  transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }],
                },
              ]}
            />
            {appLogo ? (
              <Animated.View
                style={{
                  transform: [
                    { translateY: logoFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
                    { scale: logoFloat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) },
                  ],
                }}
              >
                <AppImage key={appLogo} src={appLogo} accessibilityLabel={appName} contentFit="contain" style={styles.logo} />
              </Animated.View>
            ) : (
              <Text style={[styles.appName, { color: p.accent }]}>{appName}</Text>
            )}
          </Animated.View>

          <Animated.View
            style={{ flex: 1, minWidth: 0, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}
          >
            <Pressable
              onPress={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'pickup', flow: 'ride' } })}
              style={({ pressed }) => [styles.locationBtn, pressed && { opacity: 0.8 }]}
            >
              <MapPin size={16} color={p.textMuted} strokeWidth={2.5} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.locationCaption, { color: p.textSecondary }]}>Location</Text>
                <Text numberOfLines={1} style={[styles.locationLabel, { color: p.textPrimary }]}>
                  {locationLabel}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/wallet`)}
            style={({ pressed }) => [styles.walletBtn, { backgroundColor: p.cardBg, borderColor: p.border }, USER_SHADOW, pressed && styles.pressed95]}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.walletShine, { opacity: shine.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] }) }]}
            >
              <LinearGradient colors={[alpha(colors.slate[200], 0.5), 'transparent']} style={StyleSheet.absoluteFill} />
            </Animated.View>
            {fallingCoins.map((coin) => (
              <Coin key={coin.id} left={coin.left} delay={coin.delay} />
            ))}
            <Animated.View
              style={{
                zIndex: 10,
                transform: [
                  { translateY: walletBob.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
                  { rotate: walletBob.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-2deg'] }) },
                ],
              }}
            >
              <Wallet size={20} color={p.textPrimary} strokeWidth={2.5} />
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {!hideSearch && (
        <View style={styles.searchWrap}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } })}
            style={({ pressed }) => [
              styles.searchBtn,
              theme === 'dark'
                ? { backgroundColor: '#000000', borderColor: alpha(colors.zinc[700], 0.8) }
                : { backgroundColor: '#f1f3f6', borderColor: p.border },
              pressed && { transform: [{ scale: 0.99 }] },
            ]}
          >
            <Search size={16} color={theme === 'dark' ? '#ffffff' : p.textPrimary} strokeWidth={2.5} />
            <Text numberOfLines={1} style={[styles.searchText, { color: theme === 'dark' ? '#ffffff' : p.textPrimary }]}>
              Where do you want to go?
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 24 },
  floatingWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  floatingWallet: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pressed95: { transform: [{ scale: 0.95 }] },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' },
  leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  logoBox: { position: 'relative', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 },
  logoGlow: { position: 'absolute', left: 8, right: 8, top: 4, bottom: 4, borderRadius: 999, backgroundColor: alpha(colors.emerald[100], 0.55) },
  logo: { height: 36, width: 96, zIndex: 10 },
  appName: { zIndex: 10, fontSize: 18, lineHeight: 28, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8 },
  locationCaption: { fontSize: 10.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.9 },
  locationLabel: { fontSize: 11, fontWeight: '500' },
  walletBtn: { position: 'relative', width: 48, height: 48, overflow: 'hidden', borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  walletShine: { position: 'absolute', left: 8, right: 8, top: 4, height: 12, borderRadius: 999, overflow: 'hidden' },
  coin: { position: 'absolute', top: 4, height: 6, width: 6, borderRadius: 3, overflow: 'hidden' },
  searchWrap: { marginTop: 12 },
  searchBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  searchText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600' },
});

export default HeaderGreeting;
