// Web: modules/Taxi/modules/user/components/PromoBanners.jsx — "Recommended for you" cards + savings banner.
// (Imported by the web Home but not rendered there today; converted for parity.)
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ArrowRight, Clock3, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { useUserTheme, useUserPalette } from '../../../shared/context/UserThemeContext';

import bannerTaxi from '../../../assets/user-app/banner-taxi.jpg';
import taxiImg from '../../../assets/user-app/taxi.png';
import bikeImg from '../../../assets/user-app/bike.png';

const rotatingCards = [
  {
    icon: Clock3,
    title: 'In a hurry?',
    description: 'Auto for shorter wait times.',
    path: '/taxi/user/ride/select-location',
    state: { selectedCategory: 'auto', activeInput: 'drop', flow: 'ride' },
    images: [{ src: bikeImg, alt: 'Bike' }],
  },
  {
    icon: ShieldCheck,
    title: 'Need more space?',
    description: 'Cab for luggage or comfort.',
    path: '/taxi/user/ride/select-location',
    state: { selectedCategory: 'car', activeInput: 'drop', flow: 'ride' },
    images: [{ src: taxiImg, alt: 'Taxi' }],
  },
];

/** animate={{ y: [0, -d, 0] }} repeat: Infinity */
const useFloat = (duration, distance) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  return v.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] });
};

const ImageCarousel = ({ images, style }) => {
  const y = useFloat(3000, 4);
  const activeImage = images?.[0];
  if (!activeImage) return null;
  return (
    <Animated.View pointerEvents="none" style={[style, { transform: [{ translateY: y }] }]}>
      <AppImage src={activeImage.src} accessibilityLabel={activeImage.alt} contentFit="contain" style={{ width: '100%', aspectRatio: 1 }} />
    </Animated.View>
  );
};

const PromoCard = ({ icon: Icon, title, description, path, state, images, onNavigate, isDark }) => {
  const p = useUserPalette();
  return (
    <Pressable onPress={() => onNavigate(path, { state })} style={({ pressed }) => [{ flex: 1 }, pressed && { transform: [{ scale: 0.98 }] }]}>
      <LinearGradient
        colors={isDark ? [alpha(colors.slate[900], 0.9), alpha(colors.slate[900], 0.6)] : [alpha(colors.white, 0.95), alpha(colors.white, 0.7)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.promoCard, { borderColor: p.border }]}
      >
        <View style={styles.row}>
          <Icon size={14} strokeWidth={2.5} color={p.accent} />
        </View>
        <Text style={[styles.promoTitle, { color: p.textPrimary }]}>{title}</Text>
        <Text style={[styles.promoDesc, { color: p.textPrimary }]}>{description}</Text>
        {/* index.css remaps: dark bg-yellow-400 -> accent; light bg-slate-900 -> card colour, text-white -> primary text */}
        <View style={[styles.promoArrow, { backgroundColor: isDark ? p.accent : p.cardBg }]}>
          <ArrowRight size={15} strokeWidth={2.5} color={isDark ? '#0b1220' : p.textPrimary} />
        </View>
        <ImageCarousel images={images} style={styles.promoImage} />
      </LinearGradient>
    </Pressable>
  );
};

const PromoBanners = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';
  const taxiY = useFloat(4000, 6);

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={[styles.headingText, { color: p.textPrimary }]}>Recommended for you</Text>
      </View>

      <View style={styles.cardsRow}>
        {rotatingCards.map((card, index) => (
          <PromoCard
            key={`${String(card.title || '').trim() || 'promo'}-${index}`}
            {...card}
            isDark={isDark}
            path={routePrefix ? `${routePrefix}/ride/select-location` : '/ride/select-location'}
            onNavigate={navigate}
          />
        ))}
      </View>

      <LinearGradient
        colors={isDark ? [colors.slate[900], colors.slate[800]] : [colors.slate[950], colors.slate[900]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.savings, { borderColor: p.border }]}
      >
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <RadialGradient id="sv1" cx="20%" cy="25%" rx="240" ry="160" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#facc15" stopOpacity="0.12" />
              <Stop offset="0.6" stopColor="#facc15" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="sv2" cx="85%" cy="85%" rx="260" ry="180" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#facc15" stopOpacity="0.06" />
              <Stop offset="0.62" stopColor="#facc15" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sv1)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sv2)" />
        </Svg>

        <View style={styles.savingsInner}>
          <View style={{ maxWidth: '62%' }}>
            <View style={styles.badge}>
              <Sparkles size={12} strokeWidth={2.5} color={p.accent} />
              <Text style={styles.badgeText}>Savings</Text>
            </View>
            <Text style={styles.savingsTitle}>Better savings on your next ride.</Text>
            <Text style={styles.savingsSub}>Book quickly and save more.</Text>
            <Pressable
              onPress={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } })}
              style={({ pressed }) => [styles.rideNow, { backgroundColor: p.accent }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Text style={styles.rideNowText}>Ride Now</Text>
              <ArrowRight size={14} strokeWidth={3} color="#0b1220" />
            </Pressable>
          </View>

          <Animated.View pointerEvents="none" style={[styles.taxiImgBox, { transform: [{ translateY: taxiY }] }]}>
            <AppImage src={bannerTaxi} accessibilityLabel="Promo" contentFit="cover" style={styles.taxiImg} />
          </Animated.View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, gap: 16 },
  heading: { marginLeft: 4 },
  headingText: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.47 },
  cardsRow: { flexDirection: 'row', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promoCard: { minHeight: 140, overflow: 'hidden', borderRadius: 16, borderWidth: 1, padding: 14 },
  promoTitle: { marginTop: 10, fontSize: 17, lineHeight: 23, fontWeight: '700', letterSpacing: -0.4 },
  promoDesc: { marginTop: 4, maxWidth: 132, fontSize: 10.5, lineHeight: 14, fontWeight: '600', opacity: 0.6 },
  promoArrow: { marginTop: 12, height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  promoImage: { position: 'absolute', bottom: 4, right: 4, width: 74, opacity: 0.95 },
  savings: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, padding: 16 },
  savingsInner: { zIndex: 10, flexDirection: 'row', minHeight: 168, alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, backgroundColor: alpha('#ffffff', 0.1), paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.8, color: alpha('#ffffff', 0.85) },
  savingsTitle: { marginTop: 12, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5, color: colors.slate[50] },
  savingsSub: { marginTop: 6, fontSize: 11, lineHeight: 18, fontWeight: '600', color: alpha(colors.slate[200], 0.8) },
  rideNow: { marginTop: 16, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  rideNowText: { fontSize: 12, fontWeight: '700', color: '#0b1220' },
  taxiImgBox: { width: 140, flexShrink: 0, opacity: 0.95 },
  taxiImg: { width: '100%', aspectRatio: 1.5, borderRadius: 12 },
});

export default PromoBanners;
