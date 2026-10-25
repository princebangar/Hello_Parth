// Web: modules/Taxi/modules/user/pages/cab/CabHome.jsx — "Choose a Service" (One Way / Bus Booking when enabled).
// Colours follow index.css's .user-app-theme remaps: the page and the tiles' gradient backgrounds take the page colour,
// white surfaces the card colour, slate texts the theme's text colours. Blur blobs are hidden on the web too.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, StatusBarSpacer, Text } from '@/native/ui';
import { colors } from '@/theme';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { useUserPalette } from '../../../../shared/context/UserThemeContext';

import imgOneWay from '@/assets/3d images/AutoCab/one way.png';
import imgBus from '@/assets/3d images/AutoCab/bus.png';
import cabImg from '../../../../../../assets/public/4_Taxi.png';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const services = [
  {
    id: 'oneway',
    title: 'One Way',
    sub: 'Intercity drop at best price',
    img: imgOneWay,
    path: '/intercity',
    tag: 'No return charge',
    tagFg: colors.orange[600],
    tagBorder: colors.orange[100],
  },
  {
    id: 'bus',
    title: 'Bus Booking',
    sub: 'Comfortable intercity buses',
    img: imgBus,
    path: '/bus',
    tag: 'Sleeper & Seater',
    tagFg: colors.rose[600],
    tagBorder: colors.rose[100],
  },
];

const Enter = ({ delay = 0, rise = 12, duration = 350, children, style }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, useNativeDriver: true }).start();
  }, [v, delay, duration]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
};

const CabHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const p = useUserPalette();
  const { settings } = useSettings();
  const showBusService = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const visibleServices = services.filter((service) => showBusService || service.id !== 'bus');
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  return (
    <View style={[styles.page, { backgroundColor: p.bg }]}>
      {/* Header (sticky on the web) */}
      <Enter rise={-10} duration={300} style={{ zIndex: 20 }}>
        <View style={[styles.header, { backgroundColor: p.cardBg, borderBottomColor: p.border }]}>
          <StatusBarSpacer />
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => navigate(-1)}
              style={({ pressed }) => [styles.backBtn, { borderColor: p.border, backgroundColor: p.cardBg }, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              <ArrowLeft size={18} color={p.textPrimary} strokeWidth={2.5} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, { color: p.textSecondary }]}>Auto & Cab</Text>
              <Text style={[styles.h1, { color: p.textPrimary }]}>Choose a Service</Text>
            </View>
            <AppImage src={cabImg} accessibilityLabel="cab" contentFit="contain" style={styles.cabImg} />
          </View>
        </View>
      </Enter>

      <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={[styles.kicker, { fontSize: 10.5, color: p.textSecondary }]}>{visibleServices.length} services available</Text>
          <Text style={[styles.h2, { color: p.textPrimary }]}>What do you need?</Text>
        </View>

        {visibleServices.map((s, i) => (
          <Enter key={s.id} delay={60 + i * 70}>
            <Pressable
              onPress={() => navigate(`${routePrefix}${s.path}`)}
              style={({ pressed }) => [styles.card, { borderColor: p.border, backgroundColor: p.cardBg }, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <View style={[styles.tile, { backgroundColor: p.bg }]}>
                <AppImage src={s.img} accessibilityLabel={s.title} contentFit="contain" style={styles.tileImg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleRow}>
                  <Text style={[styles.cardTitle, { color: p.textPrimary }]}>{s.title}</Text>
                  <View style={[styles.tag, { backgroundColor: p.cardSoft, borderColor: s.tagBorder }]}>
                    <Text style={[styles.tagText, { color: s.tagFg }]}>{s.tag}</Text>
                  </View>
                </View>
                <Text style={[styles.sub, { color: p.textSecondary }]}>{s.sub}</Text>
              </View>
              <ArrowRight size={16} color={p.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </Enter>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 12 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: { paddingTop: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  kicker: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2.7 },
  h1: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.47 },
  cabImg: { height: 40, width: 40, flexShrink: 0 },
  h2: { marginTop: 2, fontSize: 16, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4 },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  tile: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'visible' },
  tileImg: { width: 56, height: 56 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  tagText: { fontSize: 10.5, fontWeight: '700' },
  sub: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '600' },
});

export default CabHome;
