import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { ShoppingBasket, Zap, Clock, Star } from 'lucide-react-native';
import OptimizedImage from '@food/components/OptimizedImage';
import { Text } from '@/native/ui';
import { alpha, colors, makeStyles, radius, shadow, sp } from '@/theme';

const quickCategories = [
  { name: 'Dairy, Bread & Eggs', image: 'https://images.unsplash.com/photo-1550583760-706c4210077c?w=100&h=100&fit=crop' },
  { name: 'Vegetables & Fruits', image: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=100&h=100&fit=crop' },
  { name: 'Snacks & Munchies', image: 'https://images.unsplash.com/photo-1599490659223-e1539e7af924?w=100&h=100&fit=crop' },
  { name: 'Soft Drinks & Ice', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=100&h=100&fit=crop' },
  { name: 'Cleaning Essentials', image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=100&h=100&fit=crop' },
  { name: 'Personal Care', image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=100&h=100&fit=crop' },
  { name: 'Pet Care', image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=100&h=100&fit=crop' },
  { name: 'Baby Care', image: 'https://images.unsplash.com/photo-1555252333-978fe3f780c4?w=100&h=100&fit=crop' },
];

/** animate-pulse with a per-item animationDelay */
function Pulse({ delay, children, style }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop = null;
    const id = setTimeout(() => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
          Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]),
      );
      loop.start();
    }, delay);
    return () => {
      clearTimeout(id);
      loop?.stop();
    };
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

export default function QuickSection() {
  const s = useStyles();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true }).start();
  }, [enter]);

  return (
    <View style={s.root}>
      {/* "Coming Soon" Overlay */}
      <View style={s.overlay}>
        <Animated.View
          style={[
            s.badge,
            { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
          ]}
        >
          <Zap size={32} color={colors.white} fill={colors.white} />
          <Text style={s.badgeTitle}>Coming Soon</Text>
          <Text style={s.badgeSub}>Instant Grocery</Text>
        </Animated.View>
      </View>

      <View style={s.content} pointerEvents="none">
        {/* Banner */}
        <View style={s.banner}>
          <View style={{ gap: sp(1) }}>
            <Text style={s.bannerTitle}>{'Munchies \nat 10 PM?'}</Text>
            <Text style={s.bannerSub}>Get them in 10 mins</Text>
          </View>
          <View style={{ opacity: 0.5 }}>
            <ShoppingBasket size={40} color={colors.yellow[500]} />
          </View>
        </View>

        {/* Categories Grid */}
        <View style={{ gap: sp(4) }}>
          <Text style={s.gridTitle}>Shop by category</Text>
          <View style={s.grid}>
            {quickCategories.map((cat, idx) => (
              <Pulse key={idx} delay={idx * 100} style={s.cell}>
                <View style={s.tile}>
                  <OptimizedImage src={cat.image} alt={cat.name} style={s.tileImage} objectFit="contain" />
                </View>
                <Text style={s.cellText}>{cat.name}</Text>
              </Pulse>
            ))}
          </View>
        </View>

        {/* Features */}
        <View style={s.features}>
          <View style={s.feature}>
            <View style={[s.featureIcon, { backgroundColor: colors.blue[50] }]}>
              <Clock size={16} color={colors.blue[500]} />
            </View>
            <Text style={s.featureText}>FAST DELIVERY</Text>
          </View>
          <View style={s.feature}>
            <View style={[s.featureIcon, { backgroundColor: colors.orange[50] }]}>
              <Star size={16} color="#DC2626" />
            </View>
            <Text style={s.featureText}>TOP BRANDS</Text>
          </View>
          <View style={s.feature}>
            <View style={[s.featureIcon, { backgroundColor: colors.green[50] }]}>
              <ShoppingBasket size={16} color={colors.green[500]} />
            </View>
            <Text style={s.featureText}>BEST PRICES</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { minHeight: 400, backgroundColor: colors.white, paddingTop: sp(2), paddingBottom: sp(10) },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.white, 0.6) },
  badge: { backgroundColor: '#ef4f5f', paddingHorizontal: sp(8), paddingVertical: sp(3), borderRadius: radius['2xl'], alignItems: 'center', gap: sp(1), borderWidth: 4, borderColor: colors.white, ...shadow['2xl'] },
  badgeTitle: { fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.white, textTransform: 'uppercase', letterSpacing: -1, fontStyle: 'italic' },
  badgeSub: { fontSize: 12, lineHeight: 12, fontWeight: '700', color: alpha(colors.white, 0.8), textTransform: 'uppercase', letterSpacing: 1.2 },
  content: { paddingHorizontal: sp(4), gap: sp(6), opacity: 0.4 },
  banner: { backgroundColor: colors.yellow[50], borderRadius: radius['2xl'], padding: sp(4), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.yellow[100] },
  bannerTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900', color: colors.yellow[900] },
  bannerSub: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.yellow[700], textTransform: 'uppercase' },
  gridTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900], paddingHorizontal: sp(1) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: sp(2), rowGap: sp(4) },
  cell: { width: '22.8%', alignItems: 'center', gap: sp(1.5) },
  tile: { width: '100%', aspectRatio: 1, backgroundColor: colors.gray[50], borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray[100], alignItems: 'center', justifyContent: 'center', padding: sp(1), ...shadow.sm },
  tileImage: { width: '100%', height: '100%', borderRadius: radius.lg },
  cellText: { fontSize: 9, lineHeight: 11, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
  features: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: sp(2), paddingTop: sp(4), borderTopWidth: 1, borderTopColor: colors.gray[50] },
  feature: { alignItems: 'center', gap: sp(1) },
  featureIcon: { height: 32, width: 32, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  featureText: { fontSize: 8, lineHeight: 12, fontWeight: '700', color: colors.gray[400] },
}));
