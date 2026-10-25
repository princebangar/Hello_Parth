// Web: modules/Taxi/modules/user/components/CheckUsOutSection.jsx — "Check us out" community card.
// (Imported by the web Home but not rendered there today; converted for parity.) The blur-3xl blobs are hidden on the
// web (index.css), so they are not drawn. whileInView fade-up -> on mount.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ArrowRight, Camera, PlayCircle, Share2 } from 'lucide-react-native';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { useUserTheme, useUserPalette, USER_SHADOW } from '../../../shared/context/UserThemeContext';
import checkUsOutImg from '@/assets/check_us_out.jpg';

const SocialBadge = ({ Icon }) => (
  <View style={styles.badge}>
    <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
    <Icon size={16} strokeWidth={2.5} color="#ffffff" />
  </View>
);

const CheckUsOutSection = () => {
  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [enter]);

  const statColor = isDark ? p.accent : p.textPrimary;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: p.textPrimary }]}>Check us out</Text>
        <Text style={[styles.subtitle, { color: p.textPrimary }]}>Join our growing community</Text>
      </View>

      <Animated.View
        style={[
          styles.card,
          { backgroundColor: p.cardBg, borderColor: p.border },
          USER_SHADOW,
          { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
        ]}
      >
        <View style={styles.imageBox}>
          <AppImage src={checkUsOutImg} accessibilityLabel="Check Us Out" contentFit="cover" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['transparent', alpha(colors.slate[900], 0.2), alpha(colors.slate[900], 0.8)]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.badges}>
            <SocialBadge Icon={Camera} />
            <SocialBadge Icon={PlayCircle} />
            <SocialBadge Icon={Share2} />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.contentRow}>
            <View style={{ maxWidth: '75%' }}>
              <Text style={[styles.cardTitle, { color: p.textPrimary }]}>Experience the ride of your life.</Text>
              <Text style={[styles.cardBody, { color: p.textPrimary }]}>Follow us for exclusive offers, updates, and more amazing journeys.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                USER_SHADOW,
                // dark: bg-yellow-400 -> accent; light: button.bg-slate-900 -> accent (index.css black-button rule)
                { backgroundColor: p.accent },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <ArrowRight size={20} strokeWidth={3} color="#0b1220" />
            </Pressable>
          </View>

          <View style={[styles.stats, { borderTopColor: p.border }]}>
            {[
              ['Rating', '4.8/5.0'],
              ['Users', '50K+'],
              ['Cities', '20+'],
            ].map(([label, value]) => (
              <View key={label} style={{ flex: 1 }}>
                <Text style={[styles.statLabel, { color: p.textPrimary }]}>{label}</Text>
                <Text style={[styles.statValue, { color: statColor }]}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 40 },
  heading: { marginBottom: 16, marginLeft: 4 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { marginTop: 4, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, opacity: 0.6 },
  card: { overflow: 'hidden', borderRadius: 32, borderWidth: 1 },
  imageBox: { height: 220, overflow: 'hidden' },
  badges: { position: 'absolute', bottom: 16, left: 20, flexDirection: 'row', gap: 8 },
  badge: {
    height: 32,
    width: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: alpha('#ffffff', 0.3),
    backgroundColor: alpha('#ffffff', 0.2),
  },
  content: { padding: 24 },
  contentRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.55 },
  cardBody: { marginTop: 8, fontSize: 13, lineHeight: 21, fontWeight: '600', opacity: 0.6 },
  cta: { height: 48, width: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stats: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, flexDirection: 'row', gap: 16 },
  statLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 },
  statValue: { marginTop: 4, fontSize: 16, lineHeight: 24, fontWeight: '700' },
});

export default CheckUsOutSection;
