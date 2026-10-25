// Web: modules/Taxi/modules/user/components/ActionsSection.jsx — "What do you need today?" Ride / Delivery cards.
// (Imported by the web Home but not rendered there today; converted for parity.) Hover glows have no touch equivalent.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { useUserTheme, useUserPalette, USER_SHADOW } from '../../../shared/context/UserThemeContext';
import bikeImg from '../../../assets/user-app/bike.png';
import parcelImg from '../../../assets/user-app/parcel.png';

const ActionCard = ({ title, description, image, isDark, path }) => {
  const navigate = useNavigate();
  const p = useUserPalette();

  return (
    <Pressable onPress={() => navigate(path)} style={({ pressed }) => [{ flex: 1 }, pressed && { transform: [{ scale: 0.98 }] }]}>
      <LinearGradient
        colors={
          isDark
            ? [alpha(colors.slate[900], 0.9), alpha(colors.slate[900], 0.6), alpha(colors.slate[950], 0.2)]
            : [alpha(colors.slate[50], 0.6), alpha(colors.white, 0.8), alpha(colors.slate[100], 0.4)]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: p.border }, USER_SHADOW]}
      >
        <View style={styles.cardBody}>
          <View style={styles.textBox}>
            <Text style={[styles.title, { color: p.textPrimary }]}>{title}</Text>
            <Text style={[styles.description, { color: p.textPrimary }]}>{description}</Text>
          </View>

          <View style={styles.goRow}>
            {/* dark: bg-white -> card colour; light: bg-slate-900 -> card colour (index.css remaps) */}
            <View style={[styles.goPill, { backgroundColor: p.cardBg }]}>
              <Text style={[styles.goText, { color: p.textPrimary }]}>Go</Text>
              <ArrowRight size={11} strokeWidth={3} color={p.textPrimary} />
            </View>
          </View>
        </View>

        <View pointerEvents="none" style={styles.imageBox}>
          <View style={styles.imageGlow} />
          <AppImage src={image} contentFit="contain" style={StyleSheet.absoluteFill} />
        </View>
      </LinearGradient>
    </Pressable>
  );
};

const ActionsSection = () => {
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={[styles.headingText, { color: p.textPrimary }]}>What do you need today?</Text>
      </View>

      <View style={styles.row}>
        <ActionCard title="Ride" description="Bike, auto, and cab rides." image={bikeImg} isDark={isDark} path={`${routePrefix}/ride/select-location`} />
        <ActionCard title="Delivery" description="Send parcels across the city." image={parcelImg} isDark={isDark} path={`${routePrefix}/parcel/type`} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20 },
  heading: { marginBottom: 14, marginLeft: 4 },
  headingText: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  row: { flexDirection: 'row', gap: 16 },
  card: { minHeight: 180, flex: 1, overflow: 'hidden', borderRadius: 28, borderWidth: 1, padding: 20 },
  cardBody: { zIndex: 10, flex: 1, justifyContent: 'space-between' },
  textBox: { maxWidth: 130, gap: 4 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.5 },
  description: { fontSize: 11, lineHeight: 16, fontWeight: '500', opacity: 0.7 },
  goRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center' },
  goPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  goText: { fontSize: 10.5, fontWeight: '600' },
  imageBox: { position: 'absolute', bottom: -8, right: -8, width: 112, height: 112 },
  imageGlow: { position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 999, opacity: 0.2, backgroundColor: '#ffffff' },
});

export default ActionsSection;
