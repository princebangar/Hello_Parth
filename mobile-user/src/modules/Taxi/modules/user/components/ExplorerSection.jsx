// Web: modules/Taxi/modules/user/components/ExplorerSection.jsx — "Explore India" destination cards.
// (Imported by the web Home but not rendered there today; converted for parity.)
// whileInView stagger -> cards fade/scale in on mount (100 ms stagger).
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { useUserTheme, useUserPalette } from '../../../shared/context/UserThemeContext';
import indiaGateImg from '@/assets/india_gate_real.png';
import jaipurImg from '@/assets/jaipur.avif';
import tajMahalImg from '@/assets/taj mahal.jpeg';

const CardIn = ({ index, children, style }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.spring(v, { toValue: 1, stiffness: 260, damping: 24, delay: index * 100, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, index]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const ExplorerSection = () => {
  const navigate = useNavigate();
  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';

  const indiaCities = [
    { title: 'Taj Mahal', image: tajMahalImg, label: 'Agra', code: 'AGR', drop: 'Taj Mahal, Agra' },
    { title: 'Hawa Mahal', image: jaipurImg, label: 'Jaipur', code: 'JAI', drop: 'Hawa Mahal, Jaipur' },
    { title: 'India Gate', image: indiaGateImg, label: 'New Delhi', code: 'DEL', drop: 'India Gate, New Delhi' },
  ];

  const handleExploreDestination = (city) => {
    navigate('/taxi/user/ride/select-location', {
      state: {
        drop: city.drop || city.title,
      },
    });
  };

  return (
    <View style={styles.wrap}>
      <View>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: p.textPrimary }]}>Explore India</Text>
          <Text style={[styles.subtitle, { color: p.textPrimary }]}>Top tourist destinations across the country</Text>
        </View>

        <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {indiaCities.map((city, idx) => (
            <CardIn key={idx} index={idx}>
              <Pressable onPress={() => handleExploreDestination(city)} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}>
                <View style={[styles.imageBox, { borderColor: p.border, backgroundColor: p.cardBg }]}>
                  <AppImage src={city.image} accessibilityLabel={city.title} contentFit="cover" style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={['transparent', alpha(colors.slate[900], 0.45)]} style={StyleSheet.absoluteFill} />
                  <View style={[styles.codeBadge, { backgroundColor: p.cardBg, borderColor: p.border }]}>
                    <Text style={[styles.codeText, { color: p.accent }]}>{city.code}</Text>
                  </View>
                </View>
                <View style={styles.cardText}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: p.textPrimary }]}>{city.title}</Text>
                    <View style={[styles.arrowDot, { backgroundColor: isDark ? p.cardBg : p.cardSoft }]}>
                      <ArrowRight size={14} strokeWidth={2.5} color={isDark ? p.accent : p.textMuted} />
                    </View>
                  </View>
                  <Text style={[styles.located, { color: p.textPrimary }]}>Located in {city.label}</Text>
                </View>
              </Pressable>
            </CardIn>
          ))}

          <CardIn index={indiaCities.length}>
            <Pressable
              onPress={() => handleExploreDestination(indiaCities[0])}
              style={({ pressed }) => [styles.viewAll, { backgroundColor: p.cardBg, borderColor: p.border }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <View style={[styles.viewAllIcon, { backgroundColor: isDark ? p.cardBg : p.cardBg, borderColor: p.border }]}>
                <ArrowRight size={18} strokeWidth={2.5} color={p.accent} />
              </View>
              <Text style={[styles.viewAllText, { color: isDark ? p.accent : p.textMuted }]}>View All</Text>
            </Pressable>
          </CardIn>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 32, gap: 40 },
  heading: { marginBottom: 12, marginLeft: 4 },
  title: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.47 },
  subtitle: { marginTop: 4, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, opacity: 0.6 },
  row: { gap: 16, paddingBottom: 20, paddingHorizontal: 4 },
  card: { width: 214 },
  imageBox: { height: 136, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  codeBadge: { position: 'absolute', top: 16, right: 16, zIndex: 10, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  codeText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  cardText: { marginTop: 12, paddingHorizontal: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, lineHeight: 18, fontWeight: '700', letterSpacing: -0.37 },
  arrowDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  located: { marginTop: 4, fontSize: 11, fontWeight: '600', opacity: 0.6, letterSpacing: -0.27 },
  viewAll: { width: 128, height: 136, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewAllIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  viewAllText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
});

export default ExplorerSection;
