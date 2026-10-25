import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Path, Pattern, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';
import {
  ArrowLeft,
  Share2,
  Star,
  RefreshCw,
  Phone,
  User,
  ChevronRight,
  MessageSquare,
  X,
  Check,
  Shield,
  Receipt,
  Loader2,
  Clock,
  Calendar,
  ShoppingBag,
  Users,
  Navigation,
} from 'lucide-react-native';
import { useParams, Link, useSearchParams, useNavigate, useLocation } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, Screen, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors, makeStyles, shadow, sp, useTheme } from '@/theme';
import AnimatedPage from '@food/components/user/AnimatedPage';
import { Card, CardContent } from '@food/components/ui/card';
import { Button } from '@food/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@food/components/ui/dialog';
import { Textarea } from '@food/components/ui/textarea';
import { useOrders } from '@food/context/OrdersContext';
import { useProfile } from '@food/context/ProfileContext';
import { useLocation as useUserLocation } from '@food/hooks/useLocation';
import DeliveryTrackingMap from '@food/components/user/DeliveryTrackingMap';
import { orderAPI, restaurantAPI } from '@food/api';
import { useCompanyName } from '@food/hooks/useCompanyName';
import { RESTAURANT_PIN_SVG, CUSTOMER_PIN_SVG, RIDER_BIKE_SVG } from '@food/constants/mapIcons';
import burgerImg from '@food/assets/takeaway_burger.png';

// Fallback definitions in case imports fail at runtime or are shadowed
const SVG_OPEN = '<' + 'svg';
const DEFAULT_CUSTOMER_PIN = `${SVG_OPEN} xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#10B981"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;
const SAFE_CUSTOMER_PIN = typeof CUSTOMER_PIN_SVG !== 'undefined' ? CUSTOMER_PIN_SVG : DEFAULT_CUSTOMER_PIN;
const DEFAULT_RESTAURANT_PIN = `${SVG_OPEN} xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;
const SAFE_RESTAURANT_PIN = typeof RESTAURANT_PIN_SVG !== 'undefined' ? RESTAURANT_PIN_SVG : DEFAULT_RESTAURANT_PIN;

const debugLog = (...args) => console.log('[OrderTracking]', ...args);
const debugWarn = (...args) => console.warn('[OrderTracking]', ...args);
const debugError = (...args) => console.error('[OrderTracking]', ...args);

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);
const AnimatedText = Animated.createAnimatedComponent(Text);

// ---------------------------------------------------------------- animation helpers (the web's CSS keyframes)
/** 0 -> 1 every `duration` ms, forever (CSS `animation: x <duration> infinite`) */
function useLoop(duration, { delay = 0, easing = Easing.linear, native = true } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop;
    const id = setTimeout(() => {
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: native }));
      loop.start();
    }, delay);
    return () => {
      clearTimeout(id);
      loop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, duration, delay, native]);
  return v;
}

/** 0 -> 1 once (framer-motion initial -> animate) */
function useEnter(duration, { delay = 0, easing = Easing.out(Easing.ease), native = true } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: native }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, duration, delay, native]);
  return v;
}

/** Keyframes -> interpolation: kf({0: a, 0.5: b, 1: c}) */
const kf = (v, frames) => {
  const keys = Object.keys(frames)
    .map(Number)
    .sort((a, b) => a - b);
  return v.interpolate({ inputRange: keys, outputRange: keys.map((k) => frames[k]) });
};

/** motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} */
function FadeUp({ delay = 0, distance = 20, style, children }) {
  const v = useEnter(350, { delay });
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function Spin({ children, active = true, duration = 1000 }) {
  const v = useLoop(duration);
  if (!active) return children;
  return <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>{children}</Animated.View>;
}

/** motion.button animate={{ rotate: isRefreshing ? 360 : 0 }} transition 0.5s */
function RefreshButton({ isRefreshing, onPress, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: isRefreshing ? 1 : 0, duration: 500, useNativeDriver: true }).start();
  }, [isRefreshing, v]);
  return (
    <Pressable onPress={onPress} style={style} hitSlop={6}>
      <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <RefreshCw size={16} color={colors.white} />
      </Animated.View>
    </Pressable>
  );
}

/** whileTap={{ scale: 0.9 }} button */
function TapScale({ onPress, style, scale = 0.9, children, ...rest }) {
  return (
    <Pressable onPress={onPress} {...rest} style={({ pressed }) => [style, pressed && { transform: [{ scale }] }]}>
      {children}
    </Pressable>
  );
}

// Animated checkmark component
const AnimatedCheckmark = ({ delay = 0 }) => {
  const circle = useEnter(500, { delay: delay * 1000, native: false });
  const check = useEnter(400, { delay: (delay + 0.4) * 1000, native: false });
  const C = 2 * Math.PI * 36;
  return (
    <View style={{ alignSelf: 'center' }}>
      <Svg width={80} height={80} viewBox="0 0 80 80">
        <AnimatedCircle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="#22c55e"
          strokeWidth="4"
          strokeDasharray={`${C}`}
          strokeDashoffset={circle.interpolate({ inputRange: [0, 1], outputRange: [C, 0] })}
          opacity={circle}
          rotation={-90}
          origin="40, 40"
        />
        <AnimatedPath
          d="M24 40 L35 51 L56 30"
          fill="none"
          stroke="#22c55e"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="50"
          strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [50, 0] })}
          opacity={check}
        />
      </Svg>
    </View>
  );
};

/** The web's radial-gradient(circle, color 1px, transparent 1px) background-size N */
function DotGrid({ color, size, r, opacity }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`dots-${size}`} x="0" y="0" width={size} height={size} patternUnits="userSpaceOnUse">
            <SvgCircle cx={size / 2} cy={size / 2} r={r} fill={color} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#dots-${size})`} />
      </Svg>
    </View>
  );
}

/** blur-3xl coloured glow (soft radial disc) with animate-pulse */
function Glow({ size, color, style, duration = 2000, delay = 0 }) {
  const v = useLoop(duration, { delay, easing: Easing.inOut(Easing.ease) });
  const id = `g-${String(color).replace(/[^a-z0-9]/gi, '')}-${size}`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, opacity: kf(v, { 0: 1, 0.5: 0.5, 1: 1 }) }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <SvgCircle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function Bokeh({ size, color, duration, frames }) {
  const v = useLoop(duration, { easing: Easing.inOut(Easing.ease) });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: kf(v, { 0: frames.o[0], 0.5: frames.o[1], 1: frames.o[0] }),
        transform: [
          { translateX: kf(v, { 0: frames.x[0], 0.5: frames.x[1], 1: frames.x[0] }) },
          { translateY: kf(v, { 0: frames.y[0], 0.5: frames.y[1], 1: frames.y[0] }) },
          { scale: kf(v, { 0: frames.s[0], 0.5: frames.s[1], 1: frames.s[0] }) },
        ],
      }}
    />
  );
}

// Premium Takeaway Animation Component for Self-Pickup
const TakeawayAnimation = memo(({ order }) => {
  const t = useTheme();
  const dark = t.dark;
  const uiStatus = mapOrderToTrackingUiStatus(order);
  const isReady = uiStatus === 'ready';

  const cycle = useLoop(3500, { easing: Easing.inOut(Easing.ease) });
  const route = useLoop(3500, { native: false });
  const phone = useLoop(4000, { easing: Easing.inOut(Easing.ease) });
  const pulse = useLoop(2000, { easing: Easing.inOut(Easing.ease) });
  const ping = useLoop(1800, { easing: Easing.out(Easing.ease) });
  const bounce = useLoop(1000);
  const sparkleCycle = useLoop(3500, { easing: Easing.out(Easing.ease) });

  const sparkle = (frames) => ({
    opacity: kf(sparkleCycle, frames.o),
    transform: [{ translateX: kf(sparkleCycle, frames.x) }, { translateY: kf(sparkleCycle, frames.y) }, { scale: kf(sparkleCycle, frames.s) }],
  });
  const sp1 = { 0: 0, 0.73: 0, 0.75: 1, 0.84: 0.3, 0.86: 0, 1: 0 };
  const zero = { 0: 0, 0.73: 0, 0.75: 0, 0.84: 0, 0.86: 0, 1: 0 };
  const op = { 0: 0, 0.73: 0, 0.75: 1, 0.84: 0, 0.86: 0, 1: 0 };

  const pathColor = dark ? alpha('#FCD34D', 0.25) : alpha('#9A3412', 0.3);
  const glowStop = dark ? '#F59E0B' : '#EA580C';

  return (
    <LinearGradient
      colors={dark ? ['#78350F', '#92400E', '#451A03'] : ['#F59E0B', '#FBBF24', '#D97706']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={ta.wrap}
    >
      <DotGrid color={alpha('#ffffff', 0.4)} size={16} r={1} opacity={0.15} />
      <Glow size={240} color={dark ? alpha('#facc15', 0.05) : alpha('#ffffff', 0.2)} duration={4000} style={{ top: '25%', left: '25%', marginLeft: -60, marginTop: -60 }} />
      <Glow size={288} color={dark ? alpha('#f97316', 0.05) : alpha('#fb923c', 0.1)} duration={6000} delay={1000} style={{ bottom: '25%', right: '25%', marginRight: -72, marginBottom: -72 }} />

      <Bokeh size={8} color={alpha('#ffffff', 0.3)} duration={8000} frames={{ x: [40, 60], y: [90, 35], s: [1, 1.2], o: [0.3, 0.6] }} />
      <Bokeh size={12} color={alpha('#fcd34d', 0.4)} duration={10000} frames={{ x: [220, 200], y: [60, 85], s: [1.2, 0.8], o: [0.2, 0.5] }} />
      <Bokeh size={6} color={alpha('#fdba74', 0.3)} duration={9000} frames={{ x: [140, 160], y: [120, 67], s: [1, 1], o: [0.4, 0.7] }} />
      <Bokeh size={10} color={alpha('#fef08a', 0.4)} duration={11000} frames={{ x: [280, 260], y: [35, 55], s: [1, 1], o: [0.3, 0.6] }} />

      <View pointerEvents="none" style={ta.titleWrap}>
        <Text style={[ta.title, { color: dark ? '#FEF3C7' : '#7C2D12' }]}>ORDER, EAT, ENJOY!</Text>
        <Text style={[ta.subtitle, { color: dark ? '#FCD34D' : '#9A3412' }]}>With Takeaway Self PickUp</Text>
      </View>

      <View style={ta.canvas}>
        <Svg width={300} height={120} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="takeaway-path-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={glowStop} stopOpacity={0} />
              <Stop offset="50%" stopColor={glowStop} stopOpacity={1} />
              <Stop offset="100%" stopColor={glowStop} stopOpacity={0} />
            </SvgLinearGradient>
          </Defs>
          <Path d="M 47,60 Q 152,-15 257,74" fill="none" stroke={pathColor} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6,6" />
          <AnimatedPath
            d="M 47,60 Q 152,-15 257,74"
            fill="none"
            stroke="url(#takeaway-path-grad)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="30,240"
            strokeDashoffset={route.interpolate({ inputRange: [0, 1], outputRange: [270, 0] })}
          />
        </Svg>

        {/* Android Phone Frame Mockup (Left) */}
        <Animated.View style={[ta.phone, { transform: [{ translateY: kf(phone, { 0: 0, 0.5: -4, 1: 0 }) }] }]}>
          <View style={ta.notch}>
            <View style={ta.notchLine} />
          </View>
          <LinearGradient colors={['#451A03', '#090514']} style={ta.screen}>
            <DotGrid color="#ffffff" size={6} r={0.5} opacity={0.1} />
            <Glow size={40} color={alpha(colors.green[500], 0.15)} />
            <View style={{ alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.9 }] }}>
              <Animated.View style={[ta.badge, { opacity: kf(pulse, { 0: 1, 0.5: 0.5, 1: 1 }) }]}>
                <Check size={18} strokeWidth={2.5} color={colors.emerald[400]} />
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    ta.ripple,
                    { opacity: kf(ping, { 0: 0.6, 0.75: 0, 1: 0 }), transform: [{ scale: kf(ping, { 0: 1, 0.75: 2, 1: 2 }) }] },
                  ]}
                />
              </Animated.View>
              <AnimatedText style={[ta.screenTitle, { opacity: kf(pulse, { 0: 1, 0.5: 0.5, 1: 1 }) }]}>{isReady ? 'READY' : 'BOOKED'}</AnimatedText>
              <Text style={ta.screenSub}>{isReady ? 'FOR PICKUP' : 'SELF PICKUP'}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Takeaway Cart/Bag Container (Right) */}
        <View style={ta.bagWrap}>
          <Animated.View
            style={[
              ta.bagShadow,
              {
                opacity: kf(cycle, { 0: 0.45, 0.6: 0.45, 0.68: 0.55, 0.75: 0.2, 0.85: 0.48, 0.92: 0.45, 1: 0.45 }),
                transform: [{ scaleX: kf(cycle, { 0: 0.95, 0.6: 0.95, 0.68: 1.2, 0.75: 0.7, 0.85: 1.05, 0.92: 0.95, 1: 0.95 }) }],
              },
            ]}
          />
          <Animated.View
            style={{
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [
                { translateY: kf(cycle, { 0: 0, 0.6: 0, 0.68: 0, 0.75: -10, 0.85: 0, 1: 0 }) },
                { scaleX: kf(cycle, { 0: 1, 0.6: 1, 0.68: 1.25, 0.75: 0.85, 0.85: 1.08, 0.92: 1, 1: 1 }) },
                { scaleY: kf(cycle, { 0: 1, 0.6: 1, 0.68: 0.75, 0.75: 1.25, 0.85: 0.92, 0.92: 1, 1: 1 }) },
                { rotate: kf(cycle, { 0: '0deg', 0.6: '0deg', 0.75: '-3deg', 0.85: '2deg', 0.92: '0deg', 1: '0deg' }) },
              ],
            }}
          >
            <Svg width={40} height={40} viewBox="0 0 24 24" fill={dark ? alpha('#FCD34D', 0.1) : alpha('#9A3412', 0.1)} stroke={dark ? '#FCD34D' : '#9A3412'} strokeWidth={2}>
              <Path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z"
              />
            </Svg>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Animated.View style={[{ position: 'absolute', top: 4, left: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.yellow[400] }, sparkle({ o: op, x: { ...zero, 0.75: -15, 0.84: -30 }, y: { ...zero, 0.75: -15, 0.84: -25 }, s: sp1 })]} />
              <Animated.View style={[{ position: 'absolute', top: 4, right: 10, width: 8, height: 8, backgroundColor: colors.white }, sparkle({ o: op, x: { ...zero, 0.75: 15, 0.84: 30 }, y: { ...zero, 0.75: -18, 0.84: -30 }, s: { ...sp1, 0.75: 1.2 } })]} />
              <Animated.View style={[{ position: 'absolute', top: 0, left: 21, width: 6, height: 6, backgroundColor: colors.yellow[500] }, sparkle({ o: op, x: { ...zero, 0.75: -4, 0.84: -8 }, y: { ...zero, 0.75: -24, 0.84: -38 }, s: sp1 })]} />
              <Animated.View style={[{ position: 'absolute', bottom: 12, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white }, sparkle({ o: op, x: { ...zero, 0.75: 12, 0.84: 22 }, y: { ...zero, 0.75: -8, 0.84: -12 }, s: sp1 })]} />
            </View>
          </Animated.View>
        </View>

        {/* Flying Burger Item */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 27,
            top: 40,
            width: 40,
            height: 40,
            zIndex: 20,
            opacity: kf(cycle, { 0: 0, 0.1: 1, 0.3: 1, 0.52: 1, 0.68: 0.95, 0.74: 0, 1: 0 }),
            transform: [
              { translateX: kf(cycle, { 0: 0, 0.1: 0, 0.3: 0, 0.52: 105, 0.68: 188, 0.74: 210, 1: 0 }) },
              { translateY: kf(cycle, { 0: 0, 0.1: -25, 0.3: -30, 0.52: -65, 0.68: -10, 0.74: 14, 1: 0 }) },
              { scale: kf(cycle, { 0: 0.1, 0.1: 1.1, 0.3: 1, 0.52: 1, 0.68: 0.7, 0.74: 0.2, 1: 0.1 }) },
              { rotate: kf(cycle, { 0: '0deg', 0.1: '0deg', 0.3: '5deg', 0.52: '90deg', 0.68: '165deg', 0.74: '180deg', 1: '0deg' }) },
            ],
          }}
        >
          <AppImage src={burgerImg} style={{ width: 40, height: 40 }} contentFit="contain" transition={0} />
        </Animated.View>
      </View>

      {isReady && (
        <View pointerEvents="none" style={{ width: '100%', alignItems: 'center', marginTop: sp(4), zIndex: 10 }}>
          <AnimatedText style={[ta.ready, { color: dark ? '#34D399' : '#047857', transform: [{ translateY: kf(bounce, { 0: 0, 0.5: -6, 1: 0 }) }] }]}>
            🎉 READY FOR PICK UP!
          </AnimatedText>
        </View>
      )}
    </LinearGradient>
  );
});

const ta = StyleSheet.create({
  wrap: { position: 'relative', width: '100%', height: 240, borderBottomWidth: 1, borderBottomColor: alpha(colors.amber[500], 0.2), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  titleWrap: { alignItems: 'center', paddingHorizontal: sp(4), marginTop: 6, zIndex: 10 },
  title: { fontWeight: '900', fontSize: 13, lineHeight: 18, letterSpacing: 1.3, marginBottom: 2, textShadowColor: alpha('#ffffff', 0.3), textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  subtitle: { fontWeight: '700', fontSize: 11, lineHeight: 15, fontStyle: 'italic', letterSpacing: 0.3, opacity: 0.95 },
  canvas: { position: 'relative', width: 300, height: 120, marginTop: 4, zIndex: 10 },
  phone: {
    position: 'absolute',
    left: 15,
    bottom: 5,
    width: 64,
    height: 110,
    backgroundColor: colors.slate[950],
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: colors.slate[800],
    padding: 4,
    overflow: 'hidden',
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  notch: { position: 'absolute', top: 0, left: '50%', marginLeft: -14, width: 28, height: 6, backgroundColor: colors.slate[800], borderBottomLeftRadius: 6, borderBottomRightRadius: 6, zIndex: 20, alignItems: 'center', justifyContent: 'center' },
  notchLine: { width: 14, height: 0.5, backgroundColor: colors.slate[700], borderRadius: 999 },
  screen: { position: 'relative', width: '100%', height: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 10 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: alpha(colors.emerald[500], 0.25),
    borderWidth: 1,
    borderColor: alpha(colors.emerald[400], 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: { borderRadius: 16, borderWidth: 1, borderColor: alpha(colors.emerald[400], 0.5) },
  screenTitle: { fontSize: 6.5, lineHeight: 9, color: colors.emerald[400], fontWeight: '800', letterSpacing: 0.65, marginTop: 4 },
  screenSub: { fontSize: 4.5, lineHeight: 6, color: colors.slate[400], fontWeight: '500', marginTop: 2 },
  bagWrap: { position: 'absolute', right: 15, bottom: 10, width: 56, height: 56, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  bagShadow: { position: 'absolute', bottom: -2, width: 40, height: 4, backgroundColor: alpha('#000000', 0.35), borderRadius: 999 },
  ready: { fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
});

// Premium Dining Animation Component for Table Service
const DiningAnimation = memo(({ order }) => {
  const t = useTheme();
  const dark = t.dark;
  const ping = useLoop(4000, { easing: Easing.out(Easing.ease) });
  const pulse = useLoop(2000, { easing: Easing.inOut(Easing.ease) });
  const cloche = useLoop(3000, { easing: Easing.inOut(Easing.ease) });
  const fork = useLoop(3000, { delay: 200, easing: Easing.inOut(Easing.ease) });
  const knife = useLoop(3000, { delay: 400, easing: Easing.inOut(Easing.ease) });
  const steam1 = useLoop(2000, { delay: 200, easing: Easing.out(Easing.ease) });
  const steam2 = useLoop(2000, { delay: 500, easing: Easing.out(Easing.ease) });
  const steam3 = useLoop(2000, { delay: 800, easing: Easing.out(Easing.ease) });
  const steamStyle = (v) => ({
    opacity: kf(v, { 0: 0, 0.15: 0.6, 0.5: 0.3, 1: 0 }),
    transform: [{ translateY: kf(v, { 0: 0, 0.5: -12, 1: -24 }) }, { scaleX: kf(v, { 0: 1, 0.5: 1.2, 1: 0.8 }) }],
  });
  const utensil = dark ? alpha(colors.red[400], 0.5) : alpha(colors.red[500], 0.7);
  return (
    <LinearGradient colors={dark ? ['#170a0c', '#261216'] : ['#FFF5F5', '#FFE3E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={di.wrap}>
      <Glow size={200} color={dark ? alpha(colors.red[500], 0.05) : alpha(colors.red[500], 0.1)} />
      <View style={di.canvas}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 999, borderWidth: 2, borderColor: alpha(colors.red[500], 0.05), opacity: kf(ping, { 0: 1, 0.75: 0, 1: 0 }), transform: [{ scale: kf(ping, { 0: 1, 0.75: 2, 1: 2 }) }] },
          ]}
        />
        <Animated.View style={{ position: 'absolute', top: 32, left: 32, right: 32, bottom: 32, borderRadius: 999, borderWidth: 1, borderColor: alpha(colors.red[500], 0.1), opacity: kf(pulse, { 0: 1, 0.5: 0.5, 1: 1 }) }} />

        <View style={di.steamRow}>
          <Animated.View style={[di.steam, { height: 20, backgroundColor: dark ? alpha(colors.red[400], 0.2) : alpha(colors.red[400], 0.3) }, steamStyle(steam1)]} />
          <Animated.View style={[di.steam, { height: 28, backgroundColor: dark ? alpha(colors.red[400], 0.3) : alpha(colors.red[400], 0.4) }, steamStyle(steam2)]} />
          <Animated.View style={[di.steam, { height: 16, backgroundColor: dark ? alpha(colors.red[400], 0.2) : alpha(colors.red[400], 0.3) }, steamStyle(steam3)]} />
        </View>

        <View style={di.setting}>
          <Animated.View style={{ transform: [{ translateY: kf(fork, { 0: 0, 0.5: -4, 1: 0 }) }] }}>
            <Svg width={24} height={48} fill="none" stroke={utensil} strokeWidth={2.5} viewBox="0 0 24 24">
              <Path strokeLinecap="round" strokeLinejoin="round" d="M4 3v7a6 6 0 006 6v5m0-18v18m4-18v7a6 6 0 01-6 6" />
            </Svg>
          </Animated.View>

          <View style={{ alignItems: 'center' }}>
            <Animated.View style={{ marginBottom: 2, transform: [{ translateY: kf(cloche, { 0: 0, 0.5: -8, 1: 0 }) }, { rotate: kf(cloche, { 0: '0deg', 0.5: '2deg', 1: '0deg' }) }] }}>
              <Svg width={80} height={64} viewBox="0 0 24 24" fill={alpha(colors.red[500], 0.1)} stroke={dark ? '#E11D48' : '#DC2626'} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2M4 19h16M12 5a8 8 0 00-8 8h16a8 8 0 00-8-8zM12 5c-1 0-2 1-2 2h4c0-1-1-2-2-2z" />
              </Svg>
            </Animated.View>
            <LinearGradient colors={dark ? [colors.red[900], colors.rose[950]] : [colors.red[400], '#B80B3D']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={di.plate} />
          </View>

          <Animated.View style={{ transform: [{ translateY: kf(knife, { 0: 0, 0.5: -4, 1: 0 }) }] }}>
            <Svg width={24} height={48} fill="none" stroke={utensil} strokeWidth={2.5} viewBox="0 0 24 24">
              <Path strokeLinecap="round" strokeLinejoin="round" d="M18 3v18M18 3c-3 0-6 3-6 7v6h6V3z" />
            </Svg>
          </Animated.View>
        </View>
      </View>

      <View pointerEvents="none" style={{ alignItems: 'center', paddingHorizontal: sp(4), marginTop: sp(2) }}>
        <View style={[di.chip, { backgroundColor: dark ? alpha(colors.red[950], 0.3) : alpha(colors.red[100], 0.8) }]}>
          <Text style={[di.chipText, { color: dark ? colors.red[400] : colors.red[700] }]}>DINING - TABLE SERVICE</Text>
        </View>
        <Text style={[di.title, { color: dark ? colors.gray[100] : colors.gray[900] }]}>Food will be served at your table</Text>
        <Text style={[di.text, { color: dark ? colors.gray[400] : colors.gray[500] }]}>
          Sit back and relax. Our server will bring your fresh hot meal directly to you shortly.
        </Text>
      </View>
    </LinearGradient>
  );
});

const di = StyleSheet.create({
  wrap: { position: 'relative', width: '100%', height: 300, borderBottomWidth: 1, borderBottomColor: colors.gray[100], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  canvas: { position: 'relative', alignItems: 'center', justifyContent: 'center', width: 256, height: 160 },
  steamRow: { position: 'absolute', top: -24, left: '48%', flexDirection: 'row', gap: 6, opacity: 0.8, zIndex: 10 },
  steam: { width: 4, borderRadius: 999 },
  setting: { flexDirection: 'row', alignItems: 'center', gap: sp(6), zIndex: 10 },
  plate: { width: 96, height: 8, borderRadius: 999, ...shadow.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: sp(3), paddingVertical: 4, borderRadius: 999, marginBottom: sp(2) },
  chipText: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.5 },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 12, lineHeight: 18, marginTop: sp(1), maxWidth: 320, textAlign: 'center' },
});

// Real Delivery Map Component with User Live Location
const DeliveryMap = memo(({ orderId, order, isVisible, fallbackCustomerCoords = null, userLiveCoords = null, userLocationAccuracy = null, onEtaUpdate = null }) => {
  const t = useTheme();
  const toPointFromGeoJSON = (coords) => {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  const restaurantCoords = useMemo(() => {
    let coords = null;
    if (order?.restaurantLocation?.coordinates && Array.isArray(order.restaurantLocation.coordinates) && order.restaurantLocation.coordinates.length >= 2) {
      coords = order.restaurantLocation.coordinates;
    } else if (order?.restaurantId?.location?.coordinates && Array.isArray(order.restaurantId.location.coordinates) && order.restaurantId.location.coordinates.length >= 2) {
      coords = order.restaurantId.location.coordinates;
    } else if (order?.restaurantId?.location?.latitude && order?.restaurantId?.location?.longitude) {
      coords = [order.restaurantId.location.longitude, order.restaurantId.location.latitude];
    }

    const fromCoords = toPointFromGeoJSON(coords);
    if (fromCoords) return fromCoords;

    const fallbackLat = Number(order?.restaurantId?.location?.latitude || order?.restaurant?.location?.latitude);
    const fallbackLng = Number(order?.restaurantId?.location?.longitude || order?.restaurant?.location?.longitude);
    if (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
      return { lat: fallbackLat, lng: fallbackLng };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.restaurantId, order?.restaurantLocation, order?.restaurant]);

  const customerCoords = useMemo(() => {
    const coords = order?.address?.coordinates || order?.address?.location?.coordinates;
    const fromCoords = toPointFromGeoJSON(coords);
    if (fromCoords) return fromCoords;
    if (fallbackCustomerCoords && Number.isFinite(fallbackCustomerCoords.lat) && Number.isFinite(fallbackCustomerCoords.lng)) {
      return fallbackCustomerCoords;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.address, fallbackCustomerCoords]);

  const deliveryBoyData = useMemo(
    () =>
      order?.deliveryPartner
        ? {
            name: order.deliveryPartner.name || 'Delivery Partner',
            avatar: order.deliveryPartner.avatar || null,
          }
        : null,
    [order?.deliveryPartner],
  );

  const effectiveCustomerCoords = useMemo(() => {
    if (order?.orderType === 'takeaway' && userLiveCoords && Number.isFinite(userLiveCoords.lat) && Number.isFinite(userLiveCoords.lng)) {
      return userLiveCoords;
    }
    if (customerCoords) return customerCoords;
    if (userLiveCoords && Number.isFinite(userLiveCoords.lat) && Number.isFinite(userLiveCoords.lng)) {
      return userLiveCoords;
    }
    if (restaurantCoords) return restaurantCoords;
    return null;
  }, [order?.orderType, customerCoords, userLiveCoords, restaurantCoords]);

  const effectiveRestaurantCoords = useMemo(() => {
    if (restaurantCoords) return restaurantCoords;
    if (effectiveCustomerCoords) return effectiveCustomerCoords;
    return null;
  }, [restaurantCoords, effectiveCustomerCoords]);

  const orderTrackingIdsList = useMemo(
    () => [order?.orderId, order?.mongoId, order?._id, orderId, order?.id].filter(Boolean),
    [order?.orderId, order?.mongoId, order?._id, orderId, order?.id],
  );

  if (!isVisible || !orderId || !order || !effectiveRestaurantCoords || !effectiveCustomerCoords) {
    return <LinearGradient colors={t.dark ? ['#0a0a0a', '#1a1a1a'] : [colors.gray[100], colors.gray[200]]} style={{ position: 'relative', height: 300 }} />;
  }

  return (
    <View style={{ position: 'relative', width: '100%', height: 300 }}>
      <DeliveryTrackingMap
        orderId={orderId}
        orderTrackingIds={orderTrackingIdsList}
        restaurantCoords={effectiveRestaurantCoords}
        customerCoords={effectiveCustomerCoords}
        userLiveCoords={userLiveCoords}
        userLocationAccuracy={userLocationAccuracy}
        deliveryBoyData={deliveryBoyData}
        order={order}
        onEtaUpdate={onEtaUpdate}
      />
    </View>
  );
});

// Section item component
const SectionItem = ({ icon: Icon, iconNode, title, subtitle, onPress, showArrow = true, rightContent, isLast = false }) => {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: sp(3),
          padding: sp(4),
          borderBottomWidth: isLast ? 0 : 1,
          borderStyle: 'dashed',
          borderBottomColor: t.dark ? colors.gray[800] : colors.gray[200],
        },
        pressed && { backgroundColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[50], transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {iconNode ? <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>{iconNode}</View> : <Icon size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '500', color: t.dark ? colors.gray[100] : colors.gray[900] }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[400] : colors.gray[500] }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightContent || (showArrow && <ChevronRight size={20} color={t.dark ? colors.gray[500] : colors.gray[400]} />)}
    </Pressable>
  );
};

function MapUnavailable() {
  const t = useTheme();
  return (
    <View
      style={{
        position: 'relative',
        height: 300,
        backgroundColor: t.dark ? colors.gray[900] : colors.gray[100],
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.dark ? colors.gray[800] : colors.gray[200],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[400] : colors.gray[600], paddingHorizontal: sp(4), textAlign: 'center' }}>Live map unavailable right now</Text>
    </View>
  );
}

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    debugError('OrderTracking map render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return <MapUnavailable />;
    }
    return this.props.children;
  }
}

/** The web renders these icon SVG strings with dangerouslySetInnerHTML */
const SvgIcon = ({ xml, size = '100%' }) => <SvgXml xml={xml.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"')} width={size} height={size} />;


const getRestaurantCoordsFromOrder = (apiOrder, fallback = null) => {
  if (
    apiOrder?.restaurantId?.location?.coordinates &&
    Array.isArray(apiOrder.restaurantId.location.coordinates) &&
    apiOrder.restaurantId.location.coordinates.length >= 2
  ) {
    return apiOrder.restaurantId.location.coordinates
  }
  if (apiOrder?.restaurantId?.location?.latitude && apiOrder?.restaurantId?.location?.longitude) {
    return [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude]
  }
  if (
    apiOrder?.restaurant?.location?.coordinates &&
    Array.isArray(apiOrder.restaurant.location.coordinates) &&
    apiOrder.restaurant.location.coordinates.length >= 2
  ) {
    return apiOrder.restaurant.location.coordinates
  }
  return fallback || null
}

const getRestaurantAddressFromOrder = (apiOrder, previousOrder = null, explicitRestaurantAddress = null) => {
  if (explicitRestaurantAddress && String(explicitRestaurantAddress).trim()) {
    return String(explicitRestaurantAddress).trim()
  }

  const location = apiOrder?.restaurantId?.location || apiOrder?.restaurant?.location || {}

  if (location?.formattedAddress && String(location.formattedAddress).trim()) {
    return String(location.formattedAddress).trim()
  }
  if (location?.address && String(location.address).trim()) {
    return String(location.address).trim()
  }
  if (location?.addressLine1 && String(location.addressLine1).trim()) {
    return String(location.addressLine1).trim()
  }

  const parts = [location?.street, location?.area, location?.city, location?.state, location?.zipCode]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter(Boolean)

  if (parts.length > 0) return parts.join(', ')

  return previousOrder?.restaurantAddress || apiOrder?.restaurantAddress || apiOrder?.restaurant?.address || 'Restaurant location'
}

const getCustomerCoordsFromApiOrder = (apiOrder, previousOrder = null) => {
  const addr = apiOrder?.address || apiOrder?.deliveryAddress || {}
  const fromLoc = addr?.location?.coordinates
  if (Array.isArray(fromLoc) && fromLoc.length >= 2) return fromLoc
  const flat = addr?.coordinates
  if (Array.isArray(flat) && flat.length >= 2) return flat

  // Some payloads provide plain object coordinates instead of GeoJSON arrays.
  const objectCoord = addr?.location || addr
  const objLat = Number(objectCoord?.lat ?? objectCoord?.latitude)
  const objLng = Number(objectCoord?.lng ?? objectCoord?.longitude)
  if (Number.isFinite(objLat) && Number.isFinite(objLng)) return [objLng, objLat]

  const prev = previousOrder?.address?.coordinates || previousOrder?.address?.location?.coordinates
  if (Array.isArray(prev) && prev.length >= 2) return prev
  return null
}

const transformOrderForTracking = (apiOrder, previousOrder = null, explicitRestaurantCoords = null, explicitRestaurantAddress = null) => {
  const restaurantCoords = explicitRestaurantCoords || getRestaurantCoordsFromOrder(apiOrder, previousOrder?.restaurantLocation?.coordinates)
  const restaurantAddress = getRestaurantAddressFromOrder(apiOrder, previousOrder, explicitRestaurantAddress)
  // API returns `deliveryAddress`; some paths use `address`
  const addr = apiOrder?.address || apiOrder?.deliveryAddress || {}
  const customerCoordsResolved = getCustomerCoordsFromApiOrder(apiOrder, previousOrder)

  return {
    id: apiOrder?.orderId || apiOrder?._id,
    mongoId: apiOrder?._id || null,
    orderId: apiOrder?.orderId || apiOrder?._id,
    restaurant: 
      apiOrder?.restaurantId?.restaurantName || 
      apiOrder?.restaurantId?.name || 
      apiOrder?.restaurantName || 
      (typeof apiOrder?.restaurant === 'string' ? apiOrder.restaurant : null) ||
      apiOrder?.restaurant?.restaurantName || 
      apiOrder?.restaurant?.name || 
      previousOrder?.restaurant || 
      'Restaurant',
    restaurantPhone:
      apiOrder?.restaurantPhone ||
      apiOrder?.restaurantId?.phone ||
      apiOrder?.restaurantId?.ownerPhone ||
      apiOrder?.restaurant?.phone ||
      apiOrder?.restaurant?.ownerPhone ||
      previousOrder?.restaurantPhone ||
      '',
    restaurantAddress,
    restaurantId: apiOrder?.restaurantId || previousOrder?.restaurantId || null,
    userId: apiOrder?.userId || previousOrder?.userId || null,
    userName: apiOrder?.userName || apiOrder?.userId?.name || apiOrder?.userId?.fullName || previousOrder?.userName || '',
    userPhone: apiOrder?.userPhone || apiOrder?.userId?.phone || previousOrder?.userPhone || '',
    address: {
      street: addr?.street || previousOrder?.address?.street || '',
      city: addr?.city || previousOrder?.address?.city || '',
      state: addr?.state || previousOrder?.address?.state || '',
      zipCode: addr?.zipCode || previousOrder?.address?.zipCode || '',
      additionalDetails: addr?.additionalDetails || previousOrder?.address?.additionalDetails || '',
      formattedAddress: addr?.formattedAddress ||
        (addr?.street && addr?.city
          ? `${addr.street}${addr.additionalDetails ? `, ${addr.additionalDetails}` : ''}, ${addr.city}${addr.state ? `, ${addr.state}` : ''}${addr.zipCode ? ` ${addr.zipCode}` : ''}`
          : previousOrder?.address?.formattedAddress || addr?.city || ''),
      coordinates: customerCoordsResolved || addr?.location?.coordinates || previousOrder?.address?.coordinates || null
    },
    restaurantLocation: {
      coordinates: restaurantCoords
    },
    items: apiOrder?.items?.map(item => ({
      name: item.name,
      variantName: item.variantName || '',
      quantity: item.quantity,
      price: item.price
    })) || previousOrder?.items || [],
    total: apiOrder?.pricing?.total || previousOrder?.total || 0,
    // Backend canonical field is orderStatus; keep legacy `status` for UI compatibility.
    status: apiOrder?.orderStatus || apiOrder?.status || previousOrder?.status || 'pending',
    deliveryPartner: apiOrder?.deliveryPartnerId ? {
      name: apiOrder.deliveryPartnerId.name || apiOrder.deliveryPartnerId.fullName || 'Delivery Partner',
      phone: apiOrder.deliveryPartnerId.phone || apiOrder.deliveryPartnerId.phoneNumber || '',
      avatar: apiOrder.deliveryPartnerId.avatar || apiOrder.deliveryPartnerId.profilePicture || null
    } : (previousOrder?.deliveryPartner || null),
    deliveryPartnerId: apiOrder?.deliveryPartnerId?._id || apiOrder?.deliveryPartnerId || apiOrder?.dispatch?.deliveryPartnerId?._id || apiOrder?.dispatch?.deliveryPartnerId || apiOrder?.assignmentInfo?.deliveryPartnerId || null,
    dispatch: apiOrder?.dispatch || previousOrder?.dispatch || null,
    assignmentInfo: apiOrder?.assignmentInfo || previousOrder?.assignmentInfo || null,
    tracking: apiOrder?.tracking || previousOrder?.tracking || {},
    deliveryState: apiOrder?.deliveryState || previousOrder?.deliveryState || null,
    scheduledAt: apiOrder?.scheduledAt || previousOrder?.scheduledAt || null,
    createdAt: apiOrder?.createdAt || previousOrder?.createdAt || null,
    preparationTime: apiOrder?.preparationTime || previousOrder?.preparationTime || 0,
    acceptedAt: apiOrder?.acceptedAt || previousOrder?.acceptedAt || null,
    totalAmount: apiOrder?.pricing?.total || apiOrder?.totalAmount || previousOrder?.totalAmount || 0,
    deliveryFee: apiOrder?.pricing?.deliveryFee || apiOrder?.deliveryFee || previousOrder?.deliveryFee || 0,
    gst: apiOrder?.pricing?.tax || apiOrder?.pricing?.gst || apiOrder?.gst || apiOrder?.tax || previousOrder?.gst || 0,
    packagingFee: apiOrder?.pricing?.packagingFee || apiOrder?.packagingFee || 0,
    platformFee: apiOrder?.pricing?.platformFee || apiOrder?.platformFee || 0,
    discount: apiOrder?.pricing?.discount || apiOrder?.discount || 0,
    subtotal: apiOrder?.pricing?.subtotal || apiOrder?.subtotal || 0,
    paymentMethod: apiOrder?.paymentMethod || apiOrder?.payment?.method || previousOrder?.paymentMethod || null,
    payment: apiOrder?.payment || previousOrder?.payment || null,
    orderType: apiOrder?.orderType || previousOrder?.orderType || 'delivery',
    // Preserve delivery OTP code received via socket event.
    // API responses intentionally strip the secret code for security,
    // so without preserving it the UI would lose the OTP on each poll refresh.
    deliveryVerification: (() => {
      const prevDV = previousOrder?.deliveryVerification || null
      const apiDV = apiOrder?.deliveryVerification || null
      const handoverOtp = apiOrder?.handoverOtp || null
      
      if (!prevDV && !apiDV && !handoverOtp) return null

      const prevDropOtp = prevDV?.dropOtp || null
      const apiDropOtp = apiDV?.dropOtp || null
      
      const merged = {
        ...(prevDV || {}),
        ...(apiDV || {})
      }

      // Prioritize: 1. Real-time handoverOtp from current API response
      // 2. Previously preserved code in local state (from socket or earlier poll)
      // 3. Nested code field in API response (if ever present)
      const finalCode = handoverOtp || prevDropOtp?.code || apiDropOtp?.code

      if (finalCode || prevDropOtp?.required || apiDropOtp?.required) {
        merged.dropOtp = {
          ...(prevDropOtp || {}),
          ...(apiDropOtp || {}),
          code: finalCode
        }
      }
      return merged
    })(),
    cancellationReason: apiOrder?.cancellationReason || previousOrder?.cancellationReason || null,
    ratings: apiOrder?.ratings || previousOrder?.ratings || {},
    restaurantRating: apiOrder?.ratings?.restaurant?.rating || apiOrder?.restaurantRating || previousOrder?.restaurantRating || null,
    deliveryPartnerRating: apiOrder?.ratings?.deliveryPartner?.rating || apiOrder?.deliveryPartnerRating || previousOrder?.deliveryPartnerRating || null,
  }
}

/**
 * Backend uses `orderStatus` (created, confirmed, preparing, ready_for_pickup, picked_up, delivered, cancelled_*).
 * In this flow `confirmed` means the user placed the order and it is waiting for restaurant acceptance.
 * `preparing` is the first true restaurant-accepted state.
 */
function mapBackendOrderStatusToUi(raw) {
  const s = String(raw || "").toLowerCase()
  if (!s || s === "pending" || s === "created" || s === "confirmed") return "placed"
  if (s === "accepted" || s === "preparing" || s === "processed") return "preparing"
  if (s === "ready" || s === "ready_for_pickup" || s === "reached_pickup" || s === "order_confirmed") return "ready"
  if (s === "picked_up" || s === "out_for_delivery" || s === "en_route_to_delivery") return "on_way"
  if (s === "reached_drop" || s === "at_drop" || s === "at_delivery") return "at_drop"
  if (s === "delivered" || s === "completed") return "delivered"
  if (s.includes("cancelled") || s === "cancelled") return "cancelled"
  return "placed"
}

function mapOrderToTrackingUiStatus(orderLike) {
  if (!orderLike) return "placed"
  const statusRaw = orderLike.status || orderLike.orderStatus
  const phase = orderLike.deliveryState?.currentPhase

  // Terminal states handled first
  if (isFoodOrderCancelledStatus(statusRaw)) return "cancelled"
  if (statusRaw === "delivered" || statusRaw === "completed") return "delivered"

  // Live Ride / Phase-based mapping (Highest priority for precision)
  const isRiderAccepted = orderLike.dispatch?.status === "accepted" || orderLike.assignmentInfo?.status === "accepted" || orderLike.deliveryPartner?.status === "accepted";
  
  if (phase === "reached_drop" || phase === "at_drop" || statusRaw === "at_drop") return "at_drop"
  if (phase === "en_route_to_delivery" || statusRaw === "picked_up" || statusRaw === "out_for_delivery") return "on_way"
  if (phase === "at_pickup" && orderLike.deliveryPartnerId && isRiderAccepted) return "at_pickup"
  if (phase === "en_route_to_pickup" && orderLike.deliveryPartnerId && isRiderAccepted) return "assigned"

  // Fallback to basic status mapping
  return mapBackendOrderStatusToUi(statusRaw)
}

/** Prefer live delivery phase when present (socket / polling include deliveryState). */
function isFoodOrderCancelledStatus(statusRaw) {
  const s = String(statusRaw || "").toLowerCase()
  return s === "cancelled" || s.includes("cancelled")
}

function normalizeLookupId(value) {
  if (value == null) return ""
  const raw = String(value).trim()
  if (!raw || raw === "undefined" || raw === "null") return ""
  return raw
}

const getGlobalLastFetchTime = (id) => {
  if (typeof window === 'undefined') return 0;
  window.__lastOrderDetailsFetchTime = window.__lastOrderDetailsFetchTime || {};
  return window.__lastOrderDetailsFetchTime[id] || 0;
};

const setGlobalLastFetchTime = (id, time) => {
  if (typeof window === 'undefined') return;
  window.__lastOrderDetailsFetchTime = window.__lastOrderDetailsFetchTime || {};
  window.__lastOrderDetailsFetchTime[id] = time;
};

export default function OrderTracking() {
  const t = useTheme()
  const s = useStyles()
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()
  const confirmed = searchParams.get("confirmed") === "true"
  const { profile, getDefaultAddress } = useProfile()
  const { location: userLiveLocation } = useUserLocation()
  const { getOrderById } = useOrders()

  const [isSocketConnected, setIsSocketConnected] = useState(() => {
    return typeof window !== 'undefined' ? !!window.orderSocketConnected : false
  })

  useEffect(() => {
    const handleConnectionChange = (e) => {
      setIsSocketConnected(!!e?.detail?.isConnected)
    }
    window.addEventListener('userSocketConnectionChange', handleConnectionChange)
    return () => {
      window.removeEventListener('userSocketConnectionChange', handleConnectionChange)
    }
  }, [])
  
  // Extract initial order from location state or context for instant 0ms rendering
  const locationOrder = location.state?.order || location.state?.placedOrder
  const contextOrder = getOrderById(orderId)
  const initialOrder = locationOrder || contextOrder || null

  // State for order data
  const [order, setOrder] = useState(() => initialOrder ? transformOrderForTracking(initialOrder) : null)
  const [loading, setLoading] = useState(() => !initialOrder)
  const [error, setError] = useState(null)

  const [showConfirmation, setShowConfirmation] = useState(confirmed)
  const [orderStatus, setOrderStatus] = useState('placed')
  const [estimatedTime, setEstimatedTime] = useState(29)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const orderRef = useRef(order)
  const estimatedTimeRef = useRef(estimatedTime)

  useEffect(() => {
    orderRef.current = order
  }, [order])

  useEffect(() => {
    estimatedTimeRef.current = estimatedTime
  }, [estimatedTime])

  const isRefreshingRef = useRef(isRefreshing)
  useEffect(() => {
    isRefreshingRef.current = isRefreshing
  }, [isRefreshing])

  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [cancellationReason, setCancellationReason] = useState("")
  const [refundDestination, setRefundDestination] = useState("source")
  const [isCancelling, setIsCancelling] = useState(false)
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false)
  const [deliveryInstructions, setDeliveryInstructions] = useState("")
  const [isUpdatingInstructions, setIsUpdatingInstructions] = useState(false)
  const [resolvedLookupId, setResolvedLookupId] = useState("")
  const [timerNow, setTimerNow] = useState(Date.now())
  
  const navigateToHomeAfterRating = useRef(false)

  // Rating states
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [selectedRestaurantRating, setSelectedRestaurantRating] = useState(null)
  const [selectedDeliveryRating, setSelectedDeliveryRating] = useState(null)
  const [restaurantFeedbackText, setRestaurantFeedbackText] = useState("")
  const [deliveryFeedbackText, setDeliveryFeedbackText] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)
  const [isLocalRated, setIsLocalRated] = useState(false)

  // Sync with localStorage on load/change
  useEffect(() => {
    const key = `rated_order_${orderId}`;
    if (localStorage.getItem(key) === 'true') {
      setIsLocalRated(true);
    }
  }, [orderId]);

  // Check if order is already rated
  const resRatingVal = Number(order?.ratings?.restaurant?.rating || order?.restaurantRating || 0)
  const delRatingVal = Number(order?.ratings?.deliveryPartner?.rating || order?.deliveryPartnerRating || 0)

  const hasRestaurantRating = resRatingVal > 0
  const hasDeliveryPartner = !!(order?.deliveryPartnerId || order?.deliveryPartnerName)
  const hasDeliveryRating = delRatingVal > 0
  const isOrderRated = hasRestaurantRating && (!hasDeliveryPartner || hasDeliveryRating)


  const handleOpenRating = () => {
    setSelectedRestaurantRating(order?.ratings?.restaurant?.rating || order?.restaurantRating || null)
    setSelectedDeliveryRating(order?.ratings?.deliveryPartner?.rating || order?.deliveryPartnerRating || null)
    setRestaurantFeedbackText(order?.ratings?.restaurant?.comment || "")
    setDeliveryFeedbackText(order?.ratings?.deliveryPartner?.comment || "")
    setShowRatingModal(true)
  }

  useEffect(() => {
    if (!showRatingModal && navigateToHomeAfterRating.current) {
      navigateToHomeAfterRating.current = false
      navigate("/food/user/home")
    }
  }, [showRatingModal])

  const handleBackClick = () => {
    const isDelivered = orderStatus === "delivered" || order?.status === "delivered" || Boolean(order?.deliveredAt)
    if (isDelivered && !isOrderRated) {
      navigateToHomeAfterRating.current = true
      handleOpenRating()
    } else {
      navigate(isDelivered ? "/user/home" : "/user/orders")
    }
  }

  const handleSubmitRating = async () => {
    const deliveryPartnerCheck = !!(order?.deliveryPartnerId || order?.deliveryPartnerName)
    const isMissingDeliveryRating = deliveryPartnerCheck && selectedDeliveryRating === null
    if (!order || selectedRestaurantRating === null || isMissingDeliveryRating) {
      toast.error("Please select all required ratings first")
      return
    }

    try {
      setSubmittingRating(true)
      const response = await orderAPI.submitOrderRatings(order.mongoId || order._id || order.id, {
        restaurantRating: selectedRestaurantRating,
        deliveryPartnerRating: deliveryPartnerCheck ? selectedDeliveryRating : undefined,
        restaurantComment: restaurantFeedbackText || undefined,
        deliveryPartnerComment: deliveryPartnerCheck ? (deliveryFeedbackText || undefined) : undefined,
      })
      
      const updatedOrderData = response?.data?.data?.order || response?.data?.order
      
      // Save rating state locally to prevent duplicate rating clicks/popups
      const oId = order.mongoId || order._id || order.id || orderId;
      localStorage.setItem(`rated_order_${oId}`, "true");
      setIsLocalRated(true);

      setOrder(prev => {
        const prevRatings = prev?.ratings || {};
        const newRestRating = selectedRestaurantRating;
        const newDelivRating = selectedDeliveryRating;
        const apiRatings = updatedOrderData?.ratings || {};
        
        return {
          ...prev,
          ...(updatedOrderData || {}),
          ratings: {
            ...prevRatings,
            ...apiRatings,
            restaurant: {
              ...(prevRatings.restaurant || {}),
              ...(apiRatings.restaurant || {}),
              rating: newRestRating,
              comment: restaurantFeedbackText || prevRatings.restaurant?.comment || ""
            },
            deliveryPartner: {
              ...(prevRatings.deliveryPartner || {}),
              ...(apiRatings.deliveryPartner || {}),
              rating: newDelivRating,
              comment: deliveryFeedbackText || prevRatings.deliveryPartner?.comment || ""
            }
          },
          restaurantRating: newRestRating,
          deliveryPartnerRating: newDelivRating
        };
      });

      toast.success("Thanks for your feedback!")
      setShowRatingModal(false)
    } catch (error) {
      debugError("Error submitting order ratings:", error)
      toast.error(error?.response?.data?.message || "Failed to submit ratings")
    } finally {
      setSubmittingRating(false)
    }
  }

  const handleEtaUpdate = useCallback((newEta) => {
    if (typeof newEta === 'string') {
      const match = newEta.match(/(\d+)/);
      if (match) {
        setEstimatedTime(parseInt(match[1], 10));
        return;
      }
    }
    if (typeof newEta === 'number' && !isNaN(newEta)) {
      setEstimatedTime(newEta);
    }
  }, [])
  const lastRealtimeRefreshRef = useRef(0)
  const trackingOrderIdsRef = useRef(new Set())
  const terminalPollStopRef = useRef(false)
  const lookupIdsRef = useRef([])
  const isInitialPollRequestedRef = useRef(null)
  const lastPollExecutionRef = useRef(0) // New: Hard throttle for extreme cases
  const lastStatusToastRef = useRef({ key: '', at: 0 })

  const ORDER_STATUS_TOAST_ID = 'order-tracking-status-update'
  const ORDER_STATUS_TOAST_DEDUPE_MS = 4000

  // Delivery handover OTP received via socket event.
  // Kept separately so UI still renders even if the event arrives
  // before the order API poll populates `order` state.
  const [socketDropOtpCode, setSocketDropOtpCode] = useState(null)


  // OTP received via socket event (deliveryDropOtp)
  useEffect(() => {
    const handleDeliveryDropOtp = (event) => {
      const detail = event?.detail || {}
      const otp = detail?.otp != null ? String(detail.otp) : null
      const evtOrderId = detail?.orderId != null ? String(detail.orderId) : null
      const evtOrderMongoId =
        detail?.orderMongoId != null ? String(detail.orderMongoId) : null

      if (!otp) return

      // If the order is already loaded, match by either orderId or mongoId.
      // Otherwise, match against the current URL param.
      const currentIds = [String(orderId)]
      if (order?.orderId) currentIds.push(String(order.orderId))
      if (order?.mongoId) currentIds.push(String(order.mongoId))
      if (order?._id) currentIds.push(String(order._id))

      const matches =
        (evtOrderId && currentIds.includes(evtOrderId)) ||
        (evtOrderMongoId && currentIds.includes(evtOrderMongoId))

      if (!matches) return

      // Always store so UI can render even if `order` hasn't loaded yet.
      setSocketDropOtpCode(otp)

      setOrder((prev) => {
        if (!prev) return prev
        const prevDV = prev.deliveryVerification || {}
        const prevDropOtp = prevDV.dropOtp || {}
        
        // Only update if code actually changed to avoid render loops
        if (prevDropOtp.code === otp) return prev;
        
        return {
          ...prev,
          deliveryVerification: {
            ...prevDV,
            dropOtp: {
              ...prevDropOtp,
              required: true,
              verified: false,
              code: otp
            }
          }
        }
      })
    }

    window.addEventListener('deliveryDropOtp', handleDeliveryDropOtp)
    return () => window.removeEventListener('deliveryDropOtp', handleDeliveryDropOtp)
  }, [orderId, order])

  // --- Start: Sync arrival time and status ---
  const getDeliveryTargetTime = useCallback((orderData) => {
    if (!orderData) return null;

    // If preparationTime is set by the restaurant, use acceptedAt + preparationTime
    if (orderData.preparationTime && orderData.acceptedAt) {
      const acceptTime = new Date(orderData.acceptedAt);
      return new Date(acceptTime.getTime() + orderData.preparationTime * 60000);
    }

    // Use scheduled time if available, fallback to creation time
    const orderTime = new Date(
      orderData.scheduledAt || orderData.createdAt || orderData.orderDate || orderData.created_at || orderData.date || Date.now()
    );

    // For non-scheduled orders, we add the estimated delivery time to the creation time.
    // For scheduled orders, scheduledAt is already the target time.
    const isScheduled = !!orderData.scheduledAt;
    const estimatedMinutes = isScheduled 
      ? 0 
      : (orderData.estimatedDeliveryTime || orderData.estimatedTime || orderData.estimated_delivery_time || 35);

    return new Date(orderTime.getTime() + estimatedMinutes * 60000);
  }, []);

  // Single clock source for estimatedTime and orderStatus sync
  useEffect(() => {
    if (!order) return;

    const targetTime = getDeliveryTargetTime(order);

    const updateTimerAndStatus = () => {
      const actualStatus = mapOrderToTrackingUiStatus(order);
      let diffMs = 0;
      if (targetTime) {
        diffMs = targetTime.getTime() - Date.now();
      }

      if (diffMs <= 0) {
        setEstimatedTime(0);
        // Do NOT auto-set to 'ready' — that status must come from the restaurant
        setOrderStatus(actualStatus);
      } else {
        const mins = Math.ceil(diffMs / 60000);
        setEstimatedTime(mins);
        setOrderStatus(actualStatus);
      }
    };

    updateTimerAndStatus();
    const interval = setInterval(updateTimerAndStatus, 1000); // Check every second for instant response

    return () => clearInterval(interval);
  }, [order, getDeliveryTargetTime]);
  // --- End: Sync arrival time and status ---

  // --------------------------------------------------------------------------
  // DATA FETCHING & POLLING STABILITY (FIXED FOR HAMMERING)
  // --------------------------------------------------------------------------

  // Socket notifications include order ids — keep a set so events match this page.
  useEffect(() => {
    const s = trackingOrderIdsRef.current
    s.add(String(orderId))
    if (order?.orderId) s.add(String(order.orderId))
    if (order?.mongoId) s.add(String(order.mongoId))
    if (order?.id) s.add(String(order.id))
  }, [orderId, order?.orderId, order?.mongoId, order?.id])

  useEffect(() => {
    const ids = [
      resolvedLookupId,
      orderId,
      order?.orderId,
      order?.mongoId,
      order?._id,
      order?.id,
    ]
      .map(normalizeLookupId)
      .filter(Boolean)
    lookupIdsRef.current = Array.from(new Set(ids))
  }, [orderId, resolvedLookupId, order?.orderId, order?.mongoId, order?._id, order?.id])

  // Stability Nuke: Move function bodies into a ref-protected execute flow
  const stableOpsRef = useRef({
    resolveOrderFromList: async (rawLookupId) => {
      const needle = normalizeLookupId(rawLookupId)
      if (!needle) return null
      try {
        const listResponse = await orderAPI.getOrders({ page: 1, limit: 50 })
        let orders = []
        if (listResponse?.data?.success && listResponse?.data?.data?.orders) {
          orders = listResponse.data.data.orders || []
        } else if (listResponse?.data?.orders) {
          orders = listResponse.data.orders || []
        } else if (Array.isArray(listResponse?.data?.data?.data)) {
          orders = listResponse.data.data.data || []
        } else if (Array.isArray(listResponse?.data?.data)) {
          orders = listResponse.data.data || []
        }

        const matched = (orders || []).find((o) => {
          const candidates = [o?._id, o?.id, o?.orderId, o?.mongoId].map(normalizeLookupId)
          return candidates.includes(needle)
        })
        if (matched) return matched
      } catch (err) {
        debugWarn('resolveOrderFromList error:', err)
      }
      return null
    },
    fetchOrderDetailsWithFallback: async (options = {}) => {
      const lookupIds = lookupIdsRef.current
      if (lookupIds.length === 0) throw new Error("Order id required")
      let lastError = null
      for (const id of lookupIds) {
        try {
          // Double guard against hammer
          return await orderAPI.getOrderDetails(id, options)
        } catch (err) {
          lastError = err
          if (err?.response?.status === 400 || err?.response?.status === 404) continue
          throw err
        }
      }
      throw lastError || new Error("Failed to fetch order details")
    }
  });

  const resolveOrderFromList = useCallback((id) => stableOpsRef.current.resolveOrderFromList(id), [])
  const fetchOrderDetailsWithFallback = useCallback((opts) => stableOpsRef.current.fetchOrderDetailsWithFallback(opts), [])

  // Clear OTP when order is finalized.
  useEffect(() => {
    if (!order) return
    const status = mapOrderToTrackingUiStatus(order)
    if (status === 'delivered' || status === 'cancelled') {
      setSocketDropOtpCode(null)


      setOrder((prev) => {
        if (!prev?.deliveryVerification?.dropOtp?.code) return prev
        return {
          ...prev,
          deliveryVerification: {
            ...(prev.deliveryVerification || {}),
            dropOtp: {
              ...(prev.deliveryVerification?.dropOtp || {}),
              code: null
            }
          }
        }
      })
    }
  }, [orderStatus, order])

  const defaultAddress = getDefaultAddress()
  const fallbackCustomerCoords = useMemo(() => {
    const orderCoords = order?.address?.coordinates || order?.address?.location?.coordinates
    if (Array.isArray(orderCoords) && orderCoords.length >= 2) {
      const lng = Number(orderCoords[0])
      const lat = Number(orderCoords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
    }

    const orderLocObj = order?.address?.location || order?.address
    const orderObjLat = Number(orderLocObj?.lat ?? orderLocObj?.latitude)
    const orderObjLng = Number(orderLocObj?.lng ?? orderLocObj?.longitude)
    if (Number.isFinite(orderObjLat) && Number.isFinite(orderObjLng)) {
      return { lat: orderObjLat, lng: orderObjLng }
    }

    const defaultCoords = defaultAddress?.location?.coordinates
    if (Array.isArray(defaultCoords) && defaultCoords.length >= 2) {
      const lng = Number(defaultCoords[0])
      const lat = Number(defaultCoords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
    }

    const defaultLocObj = defaultAddress?.location || defaultAddress
    const defaultObjLat = Number(defaultLocObj?.lat ?? defaultLocObj?.latitude)
    const defaultObjLng = Number(defaultLocObj?.lng ?? defaultLocObj?.longitude)
    if (Number.isFinite(defaultObjLat) && Number.isFinite(defaultObjLng)) {
      return { lat: defaultObjLat, lng: defaultObjLng }
    }

    const liveLat = Number(userLiveLocation?.latitude)
    const liveLng = Number(userLiveLocation?.longitude)
    if (Number.isFinite(liveLat) && Number.isFinite(liveLng)) {
      return { lat: liveLat, lng: liveLng }
    }

    return null
  }, [
    order?.address?.coordinates,
    order?.address?.location?.coordinates,
    defaultAddress?.location?.coordinates,
    userLiveLocation?.latitude,
    userLiveLocation?.longitude
  ])

  const userLiveCoords = useMemo(() => {
    const lat = Number(userLiveLocation?.latitude)
    const lng = Number(userLiveLocation?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }, [userLiveLocation?.latitude, userLiveLocation?.longitude])

  const isAdminAccepted = useMemo(() => {
    const status = order?.status
    return [
      "preparing",
      "ready",
      "ready_for_pickup",
      "picked_up",
    ].includes(status)
  }, [order?.status])

  // Single source of truth is now handled by the unified sync clock useEffect above.

  const acceptedAtMs = useMemo(() => {
    const timestamp =
      order?.tracking?.preparing?.timestamp ||
      order?.updatedAt ||
      order?.createdAt

    const parsed = timestamp ? new Date(timestamp).getTime() : NaN
    return Number.isFinite(parsed) ? parsed : null
  }, [order?.tracking?.preparing?.timestamp, order?.updatedAt, order?.createdAt])

  const editWindowRemainingMs = useMemo(() => {
    if (!isAdminAccepted || !acceptedAtMs) return 0
    const remaining = 60000 - (timerNow - acceptedAtMs)
    return Math.max(0, remaining)
  }, [isAdminAccepted, acceptedAtMs, timerNow])

  const isEditWindowOpen = editWindowRemainingMs > 0

  const editWindowText = useMemo(() => {
    const totalSeconds = Math.ceil(editWindowRemainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }, [editWindowRemainingMs])

  const handleCallRestaurant = (e) => {
    // Prevent event bubbling if necessary
    if (e && e.stopPropagation) e.stopPropagation();

    const rawPhone =
      order?.restaurantPhone ||
      order?.restaurantId?.phone ||
      order?.restaurantId?.ownerPhone ||
      order?.restaurantId?.contact?.phone ||
      order?.restaurant?.phone ||
      order?.restaurant?.ownerPhone ||
      order?.restaurantId?.location?.phone ||
      '';

    const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');
    
    if (!cleanPhone || cleanPhone.length < 5) {
      toast.error('Restaurant phone number not available');
      return;
    }

    debugLog('?? Attempting to call restaurant:', cleanPhone);
    
    // Most compatible way to trigger dialer on overall mobile/web environments:
    // Create a temporary hidden anchor and programmatically click it.
    Linking.openURL(`tel:${cleanPhone}`).catch((err) => debugError('Call failed:', err));
  };

  const handleOpenDirections = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();

    let lat = null;
    let lng = null;

    // Helper to extract coords
    const extractCoords = (obj) => {
      if (!obj) return null;
      // If array [lng, lat]
      if (Array.isArray(obj) && obj.length >= 2) {
        return { lat: Number(obj[1]), lng: Number(obj[0]) };
      }
      // If array nested in coordinates
      if (obj.coordinates && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
        return { lat: Number(obj.coordinates[1]), lng: Number(obj.coordinates[0]) };
      }
      // If object with lat/lng or latitude/longitude
      const latVal = obj.lat || obj.latitude;
      const lngVal = obj.lng || obj.longitude;
      if (latVal != null && lngVal != null) {
        return { lat: Number(latVal), lng: Number(lngVal) };
      }
      return null;
    };

    // Try multiple sources on order
    let resolved = extractCoords(order?.restaurantLocation) || 
                   extractCoords(order?.restaurantId?.location) ||
                   extractCoords(order?.restaurant?.location);

    if (resolved) {
      lat = resolved.lat;
      lng = resolved.lng;
    }

    // Fallbacks on order object properties
    if (lat === null || lng === null) {
      const loc = order?.restaurantId?.location || order?.restaurant?.location;
      if (loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) {
        lat = Number(loc.latitude);
        lng = Number(loc.longitude);
      } else if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
        lat = Number(loc.lat);
        lng = Number(loc.lng);
      }
    }

    // Dynamic fetch from restaurant API if coords are still missing
    if (lat === null || lng === null) {
      const restId = order?.restaurantId?._id || order?.restaurantId?.id || (typeof order?.restaurantId === 'string' ? order.restaurantId : null);
      if (restId) {
        try {
          const restaurantResponse = await restaurantAPI.getRestaurantById(restId);
          if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
            const restaurant = restaurantResponse.data.data.restaurant;
            const fetched = extractCoords(restaurant.location);
            if (fetched) {
              lat = fetched.lat;
              lng = fetched.lng;
            }
          }
        } catch (err) {
          debugError('Failed to fetch restaurant details in handleOpenDirections:', err);
        }
      }
    }

    let mapsUrl = '';
    const name = order?.restaurant || 'Restaurant';

    if (lat !== null && lng !== null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      mapsUrl = `https://maps.google.com/?q=${lat},${lng}+(${encodeURIComponent(name)})`;
    } else {
      const address = order?.restaurantAddress || '';
      const query = address ? `${name} ${address}` : name;
      mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(query)}`;
    }

    Linking.openURL(mapsUrl).catch(() => {});
  };

  const handleCallRider = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    
    const rawPhone = order?.deliveryPartner?.phone || '';
    const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');

    if (!cleanPhone || cleanPhone.length < 5) {
      toast.error('Rider phone number not available');
      return;
    }

    debugLog('?? Attempting to call rider:', cleanPhone);
    
    Linking.openURL(`tel:${cleanPhone}`).catch((err) => debugError('Call failed:', err));
  };

  const customerDeliveryOtp = useMemo(() => {
    const codeFromOrder = order?.deliveryVerification?.dropOtp?.code
    const code = codeFromOrder ?? socketDropOtpCode
    return code ? String(code) : null
  }, [order?.deliveryVerification?.dropOtp?.code, socketDropOtpCode])

  useEffect(() => {
    if (!isEditWindowOpen) return
    const interval = setInterval(() => {
      setTimerNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [isEditWindowOpen])

  // Poll for order updates (especially when delivery partner accepts)

  const pollRef = useRef(null);

  // Main fetch & polling core logic. (Isolated from socket connection stat-changes)
  useEffect(() => {
    if (!orderId) return;

    let isSubscribed = true;
    let requestInProgress = false;

    const poll = async (isInitial = false) => {
      if (!isSubscribed || requestInProgress) return;
      if (terminalPollStopRef.current && !isInitial) return;

      const now = Date.now();
      
      let hasOrderData = !!orderRef.current;

      // Check context immediately to avoid loaders if data exists locally
      if (isInitial) {
        const rawContext = getOrderById(orderId);
        if (rawContext) {
          setOrder(transformOrderForTracking(rawContext));
          setLoading(false);
          hasOrderData = true;
        }
      }

      // Global throttle across component remounts to prevent rapid API hammering
      const globalLastFetch = getGlobalLastFetchTime(orderId);
      if (isInitial && hasOrderData && now - globalLastFetch < 2000) {
        debugLog("?? Throttling initial poll - too soon since last fetch");
        setLoading(false);
        return;
      }
      if (isInitial) {
        setGlobalLastFetchTime(orderId, now);
      }

      if (isInitial && now - lastPollExecutionRef.current < 1000) return;
      if (isInitial) lastPollExecutionRef.current = now;

      requestInProgress = true;
      try {
        const response = await fetchOrderDetailsWithFallback({ force: isInitial });
        if (!isSubscribed) return;

        let finalOrderData = null;

        if (response.data?.success && response.data.data?.order) {
          finalOrderData = response.data.data.order;
        } else if (isInitial) {
          const matchedOrder = await resolveOrderFromList(orderId);
          if (matchedOrder) finalOrderData = matchedOrder;
        }

        if (finalOrderData) {
          setOrder(prev => {
            const transformedOrder = transformOrderForTracking(finalOrderData, prev);
            const ui = mapOrderToTrackingUiStatus(transformedOrder);
            terminalPollStopRef.current = ui === 'delivered' || ui === 'cancelled';
            return transformedOrder;
          });
          setError(null);
          setLoading(false);
          return;
        }

        if (isInitial && !order) {
          setError(response.data?.message || 'Order not found');
          terminalPollStopRef.current = true;
        }
      } catch (err) {
        if (isInitial && !order) {
          try {
            const matchedOrder = await resolveOrderFromList(orderId);
            if (matchedOrder) {
              if (!isSubscribed) return;
              setOrder(prev => transformOrderForTracking(matchedOrder, prev));
              setError(null);
              setLoading(false);
              return;
            }
          } catch {}
          if (!isSubscribed) return;
          setError(err.response?.data?.message || 'Failed to fetch order details');
          terminalPollStopRef.current = true;
        }
      } finally {
        requestInProgress = false;
        if (isInitial && isSubscribed) setLoading(false);
      }
    };

    pollRef.current = poll;
    terminalPollStopRef.current = false;

    if (isInitialPollRequestedRef.current !== orderId) {
      isInitialPollRequestedRef.current = orderId;
      poll(true);
    }

    return () => {
      isSubscribed = false;
      // Unmounted before the first load finished (StrictMode's dev remount does
      // exactly this): its response is dropped above, so let the next mount
      // start the load again — otherwise "Loading order details..." never clears.
      if (!orderRef.current) {
        isInitialPollRequestedRef.current = null;
        lastPollExecutionRef.current = 0;
      }
    };
  }, [orderId, fetchOrderDetailsWithFallback, resolveOrderFromList]);

  // Interval Manager (dynamically adapts based on socket connection state independently)
  useEffect(() => {
    if (!orderId) return;

    const tick = () => {
      if (terminalPollStopRef.current) return;
      if (document.hidden) return;
      // Delegate to the latest instance of our polling function capturing current state
      if (pollRef.current) pollRef.current(false);
    };
    
    const pollInterval = (isSocketConnected || window.orderSocketConnected) ? 60000 : 20000;
    const interval = setInterval(tick, pollInterval);

    return () => clearInterval(interval);
  }, [orderId, isSocketConnected]);

  useEffect(() => {
    if (!order) return
    const ui = mapOrderToTrackingUiStatus(order)
    terminalPollStopRef.current = ui === 'delivered' || ui === 'cancelled'
  }, [order])

  // Post-checkout splash only — real status comes from API / poll / socket.
  useEffect(() => {
    if (!confirmed) return
    const timer1 = setTimeout(() => setShowConfirmation(false), 3000)
    return () => clearTimeout(timer1)
  }, [confirmed])

  // Countdown timer is now handled by the unified sync clock useEffect above.

  // Listen for order status updates from socket (e.g., "Delivery partner on the way")
  useEffect(() => {
    const handleOrderStatusNotification = (event) => {
      const payload = event?.detail || {};
      const { message, status, estimatedDeliveryTime, orderId: evtOrderId, orderMongoId } = payload;

      const evtKeys = [evtOrderId, orderMongoId, payload?._id].filter(Boolean).map(String)
      const idMatches =
        evtKeys.length === 0 ||
        evtKeys.some((k) => String(k) === String(orderId)) ||
        evtKeys.some((k) => trackingOrderIdsRef.current.has(k))

      debugLog('?? Order status notification received:', { message, status, idMatches });

      if (idMatches) {
        const next = mapOrderToTrackingUiStatus({
          status,
          orderStatus: payload.orderStatus || status,
          deliveryState: payload.deliveryState,
        });
        const currentOrder = orderRef.current;
        const currentEstTime = estimatedTimeRef.current;
        if ((currentOrder?.orderType === 'takeaway' || currentOrder?.orderType === 'dining') && 
            currentEstTime <= 0 && 
            ['placed', 'preparing'].includes(next)) {
          setOrderStatus('ready');
        } else {
          setOrderStatus(next);
        }

        // Pull latest order state without refresh spam on bursty socket events.
        const now = Date.now();
        if (now - lastRealtimeRefreshRef.current > 1500 && !isRefreshingRef.current) {
          lastRealtimeRefreshRef.current = now;
          handleRefresh();
        }
      }

      // Show a single deduped notification toast
      if (message && idMatches) {
        const toastKey = `${String(evtOrderId || orderMongoId || orderId)}:${String(status || payload.orderStatus || '')}`
        const now = Date.now()
        const isDuplicateToast =
          toastKey &&
          toastKey === lastStatusToastRef.current.key &&
          now - lastStatusToastRef.current.at < ORDER_STATUS_TOAST_DEDUPE_MS

        if (isDuplicateToast) return

        lastStatusToastRef.current = { key: toastKey, at: now }
        toast.dismiss(ORDER_STATUS_TOAST_ID)
        toast.success(message, {
          id: ORDER_STATUS_TOAST_ID,
          duration: 5000,
          position: 'top-center',
          description: estimatedDeliveryTime
            ? `Estimated delivery in ${Math.round(estimatedDeliveryTime / 60)} minutes`
            : undefined
        });

        // Optional: Vibrate device if supported and user has interacted
        if (typeof window !== 'undefined' && window.__userHasInteracted && navigator.vibrate) {
          try {
            navigator.vibrate([200, 100, 200]);
          } catch (_) {}
        }
      }
    };

    // Listen for custom event from DeliveryTrackingMap
    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);
    };
  }, [orderId])

  const handleCancelOrder = () => {
    // Check if order can be cancelled (only Razorpay orders that aren't delivered/cancelled)
    if (!order) return;

    if (isAdminAccepted && !isEditWindowOpen) {
      toast.error('Cancellation window ended. You can no longer cancel this order.');
      return;
    }

    if (order.status === 'cancelled') {
      toast.error('Order is already cancelled');
      return;
    }

    if (order.status === 'delivered') {
      toast.error('Cannot cancel a delivered order');
      return;
    }

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    const method = String(order?.payment?.method || order?.paymentMethod || "").toLowerCase()
    const status = String(order?.payment?.status || "").toLowerCase()
    const isRazorpayPaid =
      method === "razorpay" && ["paid", "authorized", "captured", "settled", "refunded"].includes(status)

    setRefundDestination(isRazorpayPaid ? "source" : "wallet")

    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    setIsCancelling(true);
    try {
      const cancelLookupId =
        lookupIdsRef.current[0] || normalizeLookupId(orderId)
      const method = String(order?.payment?.method || order?.paymentMethod || "").toLowerCase()
      const status = String(order?.payment?.status || "").toLowerCase()
      const isRazorpayPaid =
        method === "razorpay" && ["paid", "authorized", "captured", "settled", "refunded"].includes(status)

      const payload = {
        reason: cancellationReason.trim(),
        ...(isRazorpayPaid ? { refundDestination } : {}),
      }

      const response = await orderAPI.cancelOrder(cancelLookupId, payload);
      if (response.data?.success) {
        const paymentMethod = order?.payment?.method || order?.paymentMethod;
        const successMessage = response.data?.message ||
          (paymentMethod === 'cash' || paymentMethod === 'cod'
            ? 'Order cancelled successfully. No refund required as payment was not made.'
            : refundDestination === 'wallet'
              ? 'Order cancelled successfully. Refund has been added to your wallet.'
              : 'Order cancelled successfully. Refund will be processed to your original payment method.');
        toast.success(successMessage);
        setShowCancelDialog(false);
        setCancellationReason("");
        setRefundDestination("source");
        // Refresh order data
        const orderResponse = await fetchOrderDetailsWithFallback({ force: true });
        if (orderResponse.data?.success && orderResponse.data.data?.order) {
          const apiOrder = orderResponse.data.data.order;
          setOrder(transformOrderForTracking(apiOrder, order));
        }
      } else {
        toast.error(response.data?.message || 'Failed to cancel order');
      }
    } catch (error) {
      debugError('Error cancelling order:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUpdateInstructions = async () => {
    try {
      setIsUpdatingInstructions(true);
      const response = await orderAPI.updateOrderInstructions(resolvedLookupId || orderId, deliveryInstructions);
      if (response.data?.success) {
        toast.success("Delivery instructions updated");
        setIsInstructionsModalOpen(false);
        const updatedOrder = response.data.data?.order;
        if (updatedOrder) {
          setOrder(prev => transformOrderForTracking(updatedOrder, prev));
        } else {
          setOrder(prev => ({ ...prev, note: deliveryInstructions }));
        }
      } else {
        toast.error(response.data?.message || "Failed to update instructions");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update instructions");
    } finally {
      setIsUpdatingInstructions(false);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Track my order from ${order?.restaurant || companyName}`,
          text: `Hey! Track my order from ${order?.restaurant || companyName} with ID #${order?.orderId || order?.id}.`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Tracking link copied to clipboard!");
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        debugError('Error sharing:', error);
        toast.error("Failed to share link");
      }
    }
  };

  const handleRefresh = async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    setIsRefreshing(true)
    try {
      const response = await fetchOrderDetailsWithFallback({ force: true })
      if (response.data?.success && response.data.data?.order) {
        const apiOrder = response.data.data.order

        // Extract restaurant location coordinates with multiple fallbacks
        let restaurantCoords = null;
        let restaurantAddress = null;

        // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
        if (apiOrder.restaurantId?.location?.coordinates &&
          Array.isArray(apiOrder.restaurantId.location.coordinates) &&
          apiOrder.restaurantId.location.coordinates.length >= 2) {
          restaurantCoords = apiOrder.restaurantId.location.coordinates;
        }
        // Priority 2: restaurantId.location with latitude/longitude properties
        else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
          restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
        }
        // Priority 3: Check nested restaurant data
        else if (apiOrder.restaurant?.location?.coordinates) {
          restaurantCoords = apiOrder.restaurant.location.coordinates;
        }
        // Priority 4: Check if restaurantId is a string ID and fetch restaurant details
        else if (typeof apiOrder.restaurantId === 'string') {
          debugLog('?? restaurantId is a string ID, fetching restaurant details...', apiOrder.restaurantId);
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              const restaurant = restaurantResponse.data.data.restaurant;
              if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                restaurantCoords = restaurant.location.coordinates;
                debugLog('? Fetched restaurant coordinates from API:', restaurantCoords);
              }
              restaurantAddress =
                restaurant?.location?.formattedAddress ||
                restaurant?.location?.address ||
                restaurant?.address ||
                null;
            }
          } catch (err) {
            debugError('? Error fetching restaurant details:', err);
          }
        }

        setOrder(prev => transformOrderForTracking(apiOrder, prev, restaurantCoords, restaurantAddress))
      }
    } catch (err) {
      debugError('Error refreshing order:', err)
    } finally {
      isRefreshingRef.current = false
      setIsRefreshing(false)
    }
  }

  // Loading state (moved after hooks)
  if (loading) {
    return (
      <Screen bg={t.dark ? '#0a0a0a' : colors.gray[50]}>
        <AnimatedPage style={{ flex: 1, padding: sp(4) }}>
          <View style={{ alignItems: 'center', paddingVertical: sp(20) }}>
            <Spin>
              <Loader2 size={32} color={t.dark ? colors.gray[400] : colors.gray[600]} />
            </Spin>
            <Text style={[s.mutedText, { marginTop: sp(4) }]}>Loading order details...</Text>
          </View>
        </AnimatedPage>
      </Screen>
    )
  }

  // Error state (moved after hooks)
  if (error || !order) {
    return (
      <Screen bg={t.dark ? '#0a0a0a' : colors.gray[50]}>
        <AnimatedPage style={{ flex: 1, padding: sp(4) }}>
          <View style={{ alignItems: 'center', paddingVertical: sp(20) }}>
            <Text style={s.notFoundTitle}>Order Not Found</Text>
            <Text style={[s.mutedText, { marginBottom: sp(6), textAlign: 'center' }]}>{error || "The order you're looking for doesn't exist."}</Text>
            <Button onPress={() => navigate('/food/user/orders')}>Back to Orders</Button>
          </View>
        </AnimatedPage>
      </Screen>
    )
  }

  const statusConfig = {
    placed: {
      title: 'Order Placed',
      subtitle: 'Waiting for restaurant to accept',
      color: colors.green[600],
      iconType: 'food',
    },
    confirmed: {
      title: 'Order Placed',
      subtitle: 'Waiting for restaurant to accept',
      color: colors.green[600],
      iconType: 'food',
    },
    preparing: {
      title: 'Food is being prepared',
      subtitle:
        order?.orderType === 'takeaway' || order?.orderType === 'dining'
          ? typeof estimatedTime === 'number'
            ? estimatedTime <= 0
              ? 'Waiting for restaurant to mark ready'
              : `Ready for pickup in ${estimatedTime} mins`
            : 'Cooking your meal'
          : typeof estimatedTime === 'number'
            ? estimatedTime <= 0
              ? 'Arriving soon'
              : `Arriving in ${estimatedTime} mins`
            : 'Cooking your meal',
      color: colors.green[600],
      iconType: 'food',
    },
    assigned: {
      title: 'Rider is arriving',
      subtitle: 'A delivery partner is arriving at the restaurant',
      color: colors.green[600],
      iconType: 'rider',
    },
    at_pickup: {
      title: 'Rider at restaurant',
      subtitle: 'Rider is waiting for your order',
      color: colors.green[600],
      iconType: 'rider',
    },
    ready: {
      title: order?.orderType === 'takeaway' || order?.orderType === 'dining' ? 'Ready for pickup' : 'Handover in progress',
      subtitle: order?.orderType === 'takeaway' || order?.orderType === 'dining' ? 'Please collect your order from the restaurant' : 'Rider is picking up your order',
      color: colors.green[600],
      iconType: order?.orderType === 'takeaway' || order?.orderType === 'dining' ? 'delivered' : 'rider',
    },
    on_way: {
      title: 'Out for delivery',
      subtitle: typeof estimatedTime === 'number' ? (estimatedTime <= 0 ? 'Arriving soon' : `Arriving in ${estimatedTime} mins`) : 'Rider is out for delivery',
      color: colors.green[600],
      iconType: 'rider',
    },
    at_drop: {
      title: 'Arrived at location',
      subtitle: 'Please come to the door',
      color: colors.green[600],
      iconType: 'rider',
    },
    delivered: {
      title: order?.orderType === 'takeaway' ? 'Picked UP' : 'Order delivered',
      subtitle: order?.orderType === 'takeaway' ? 'Thank you for ordering!' : 'Enjoy your meal!',
      color: colors.green[600],
      iconType: 'delivered',
    },
    cancelled: {
      title: order?.orderType === 'takeaway' ? 'Takeaway order cancelled' : order?.orderType === 'dining' ? 'Dining order cancelled' : 'Order cancelled',
      subtitle: order?.cancellationReason || 'This order has been cancelled',
      color: colors.red[600],
      iconType: 'cancelled',
    },
  }

  const currentStatus = statusConfig[orderStatus] || statusConfig.placed
  const isScheduledOrder = Boolean(order?.scheduledAt) && !['delivered', 'cancelled'].includes(orderStatus)
  const scheduledDateFormatted = order?.scheduledAt
    ? new Date(order.scheduledAt).toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null
  const isDeliveredOrder = orderStatus === 'delivered' || order?.status === 'delivered' || Boolean(order?.deliveredAt)
  const isTakeawayOrder = order?.orderType === 'takeaway'

  const paymentMethodRaw = String(order?.payment?.method || order?.paymentMethod || '').toLowerCase()
  const paymentStatusRaw = String(order?.payment?.status || '').toLowerCase()
  const isRazorpayPaidForDialog = paymentMethodRaw === 'razorpay' && ['paid', 'authorized', 'captured', 'settled', 'refunded'].includes(paymentStatusRaw)

  const deliveryAddressSubtitle = (() => {
    if (order?.orderType === 'dining') {
      return `Enjoy your food in the restaurant. Table service.`
    }
    if (order?.address?.formattedAddress && order.address.formattedAddress !== 'Select location') {
      return order.address.formattedAddress
    }
    if (order?.address) {
      const orderAddressParts = []
      if (order.address.street) orderAddressParts.push(order.address.street)
      if (order.address.additionalDetails) orderAddressParts.push(order.address.additionalDetails)
      if (order.address.city) orderAddressParts.push(order.address.city)
      if (order.address.state) orderAddressParts.push(order.address.state)
      if (order.address.zipCode) orderAddressParts.push(order.address.zipCode)
      if (orderAddressParts.length > 0) {
        return orderAddressParts.join(', ')
      }
    }
    if (defaultAddress?.formattedAddress && defaultAddress.formattedAddress !== 'Select location') {
      return defaultAddress.formattedAddress
    }
    if (defaultAddress) {
      const defaultAddressParts = []
      if (defaultAddress.street) defaultAddressParts.push(defaultAddress.street)
      if (defaultAddress.additionalDetails) defaultAddressParts.push(defaultAddress.additionalDetails)
      if (defaultAddress.city) defaultAddressParts.push(defaultAddress.city)
      if (defaultAddress.state) defaultAddressParts.push(defaultAddress.state)
      if (defaultAddress.zipCode) defaultAddressParts.push(defaultAddress.zipCode)
      if (defaultAddressParts.length > 0) {
        return defaultAddressParts.join(', ')
      }
    }
    return 'Add delivery address'
  })()

  const showInstructionsRow = !isAdminAccepted && orderStatus !== 'cancelled' && orderStatus !== 'delivered' && order?.orderType !== 'dining'

  const renderStars = (value, keyPrefix, size = 14) =>
    [1, 2, 3, 4, 5].map((star) => {
      const on = star <= value
      return <Star key={`${keyPrefix}-${star}`} size={size} color={on ? colors.yellow[400] : t.dark ? colors.gray[800] : colors.gray[200]} fill={on ? colors.yellow[400] : 'transparent'} />
    })

  const renderStarPicker = (selected, onSelect, keyPrefix) => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: sp(3) }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const on = star <= (selected || 0)
        return (
          <Pressable key={`${keyPrefix}-${star}`} onPress={() => onSelect(star)} style={({ pressed }) => [{ padding: 4 }, pressed && { transform: [{ scale: 0.9 }] }]}>
            <Star size={40} color={on ? colors.yellow[400] : t.dark ? colors.gray[800] : colors.gray[200]} fill={on ? colors.yellow[400] : 'transparent'} />
          </Pressable>
        )
      })}
    </View>
  )

  return (
    <Screen edges={['bottom']} bg={t.dark ? '#0a0a0a' : colors.gray[100]} statusBarStyle="light">
      {/* Green Header */}
      <View style={{ backgroundColor: currentStatus.color, zIndex: 40 }}>
        <StatusBarSpacer color={currentStatus.color} />
        <View style={s.navRow}>
          <TapScale style={s.navBtn} onPress={handleBackClick}>
            <ArrowLeft size={24} color={colors.white} />
          </TapScale>
          <Text style={s.navTitle} numberOfLines={1}>
            {order.restaurant}
          </Text>
          <TapScale style={s.navBtn} onPress={handleShare}>
            <Share2 size={20} color={colors.white} />
          </TapScale>
        </View>

        {isScheduledOrder && ['placed', 'confirmed'].includes(orderStatus) ? (
          <View style={{ paddingHorizontal: sp(4), paddingBottom: sp(5), alignItems: 'center' }}>
            <FadeUp distance={0} style={[s.pill, { marginBottom: sp(3), paddingVertical: 6 }]}>
              <Clock size={16} color={colors.white} />
              <Text style={s.pillTextStrong}>Scheduled Order</Text>
            </FadeUp>
            <FadeUp distance={-10}>
              <Text style={[s.statusTitle, { marginBottom: sp(2) }]}>Order Scheduled</Text>
            </FadeUp>
            <FadeUp distance={0} delay={200} style={[s.pill, { paddingHorizontal: sp(5), paddingVertical: 10 }]}>
              <Calendar size={16} color={colors.white} />
              <Text style={s.pillText}>{scheduledDateFormatted}</Text>
              <View style={s.pillDot} />
              <RefreshButton isRefreshing={isRefreshing} onPress={handleRefresh} style={{ marginLeft: 4 }} />
            </FadeUp>
            <FadeUp distance={0} delay={400}>
              <Text style={s.scheduledNote}>The restaurant will start preparing your order closer to the scheduled time</Text>
            </FadeUp>
          </View>
        ) : (
          !['at_pickup', 'ready', 'on_way', 'at_drop', 'delivered'].includes(orderStatus) && (
            <View style={{ paddingHorizontal: sp(4), paddingBottom: sp(4), alignItems: 'center' }}>
              <FadeUp key={currentStatus.title} distance={-10}>
                <Text style={[s.statusTitle, { marginBottom: sp(3) }]}>{currentStatus.title}</Text>
              </FadeUp>
              <FadeUp distance={0} delay={200} style={[s.pill, { paddingVertical: sp(2) }]}>
                <Text style={s.pillText}>{currentStatus.subtitle}</Text>
                <RefreshButton isRefreshing={isRefreshing} onPress={handleRefresh} style={{ marginLeft: 4 }} />
              </FadeUp>
            </View>
          )
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: sp(24) }} keyboardShouldPersistTaps="handled">
        {/* Map Section, Takeaway, or Dining Animation */}
        {!isDeliveredOrder &&
          orderStatus !== 'cancelled' &&
          !(isScheduledOrder && ['placed', 'confirmed'].includes(orderStatus)) &&
          (order?.orderType === 'takeaway' ? (
            <TakeawayAnimation order={order} />
          ) : order?.orderType === 'dining' ? (
            <DiningAnimation order={order} />
          ) : (
            <MapErrorBoundary>
              <DeliveryMap
                orderId={orderId}
                order={order}
                isVisible={order !== null}
                fallbackCustomerCoords={fallbackCustomerCoords}
                userLiveCoords={userLiveCoords}
                userLocationAccuracy={userLiveLocation?.accuracy ?? null}
                onEtaUpdate={handleEtaUpdate}
              />
            </MapErrorBoundary>
          ))}

        <View style={s.content}>
          {customerDeliveryOtp && orderStatus !== 'delivered' && orderStatus !== 'cancelled' && (
            <FadeUp delay={280} style={[s.otpCard, isTakeawayOrder ? s.otpTakeaway : s.otpDelivery]}>
              <Text style={[s.otpLabel, { color: isTakeawayOrder ? (t.dark ? colors.emerald[400] : colors.emerald[700]) : t.dark ? colors.blue[400] : colors.blue[700] }]}>
                {isTakeawayOrder ? 'TAKEAWAY OTP' : 'DELIVERY OTP'}
              </Text>
              <Text style={[s.otpCode, { color: isTakeawayOrder ? (t.dark ? colors.emerald[200] : colors.emerald[900]) : t.dark ? colors.blue[200] : colors.blue[900] }]}>{customerDeliveryOtp}</Text>
              <Text style={[s.otpHint, { color: isTakeawayOrder ? (t.dark ? colors.emerald[400] : colors.emerald[700]) : t.dark ? colors.blue[400] : colors.blue[700] }]}>
                {isTakeawayOrder
                  ? 'Share this 4-digit OTP with the restaurant at the counter to verify and complete your pick-up.'
                  : 'Share this 4-digit OTP with your delivery partner at drop-off.'}
              </Text>
            </FadeUp>
          )}

          {/* Takeaway / Self Pickup Card */}
          {isTakeawayOrder && orderStatus !== 'ready' && orderStatus !== 'delivered' && orderStatus !== 'cancelled' && (
            <FadeUp delay={250} style={s.pickupCard}>
              <View style={s.pickupIcon}>
                <ShoppingBag size={20} color={t.dark ? colors.orange[400] : colors.orange[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pickupTitle}>Takeaway / Self Pickup</Text>
                <Text style={s.pickupText}>
                  {orderStatus === 'preparing' ? "Your order is being prepared. We'll notify you when it's ready." : 'Waiting for the restaurant to accept and prepare your order.'}
                </Text>
              </View>
            </FadeUp>
          )}

          {/* Dynamic Status Card */}
          {['at_pickup', 'ready', 'on_way', 'at_drop', 'delivered'].includes(orderStatus) && (
            <FadeUp delay={300} style={[s.card, { padding: sp(3) }]}>
              {isScheduledOrder && ['placed', 'confirmed'].includes(orderStatus) ? (
                <View style={s.rowCenter4}>
                  <View style={[s.statusIcon, { borderColor: colors.blue[100], backgroundColor: colors.blue[50] }]}>
                    <Clock size={28} color={colors.blue[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>Order Scheduled</Text>
                    <Text style={s.cardSub}>{scheduledDateFormatted}</Text>
                    <Text style={[s.xs, { color: t.dark ? colors.blue[400] : colors.blue[600], marginTop: sp(1) }]}>We'll notify you when the restaurant starts preparing</Text>
                  </View>
                </View>
              ) : (
                <View style={s.rowCenter4}>
                  <View
                    style={[
                      s.statusIcon,
                      {
                        borderColor: t.dark ? colors.gray[800] : colors.gray[100],
                        backgroundColor:
                          currentStatus.iconType === 'rider'
                            ? t.dark
                              ? alpha(colors.blue[900], 0.2)
                              : colors.blue[50]
                            : currentStatus.iconType === 'cancelled'
                              ? t.dark
                                ? alpha(colors.red[900], 0.2)
                                : colors.red[50]
                              : currentStatus.iconType === 'delivered'
                                ? t.dark
                                  ? alpha(colors.green[900], 0.2)
                                  : colors.green[50]
                                : t.dark
                                  ? alpha(colors.orange[900], 0.2)
                                  : colors.orange[50],
                      },
                    ]}
                  >
                    {currentStatus.iconType === 'rider' ? (
                      <SvgIcon xml={RIDER_BIKE_SVG} />
                    ) : currentStatus.iconType === 'cancelled' ? (
                      <X size={40} color={colors.red[500]} />
                    ) : currentStatus.iconType === 'delivered' ? (
                      <Check size={40} color={colors.green[500]} />
                    ) : (
                      <Receipt size={40} color={colors.orange[500]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{currentStatus.title}</Text>
                    <Text style={s.cardSub}>{currentStatus.subtitle}</Text>
                  </View>
                </View>
              )}
            </FadeUp>
          )}

          {/* Rating Logic: Show rating card after delivery */}
          {orderStatus === 'delivered' && !isOrderRated && (
            <FadeUp delay={450}>
              <Pressable
                onPress={isLocalRated ? undefined : handleOpenRating}
                disabled={isLocalRated}
                style={({ pressed }) => [s.rateCard, isLocalRated && { opacity: 0.95 }, pressed && !isLocalRated && { backgroundColor: t.dark ? alpha(colors.gray[800], 0.2) : alpha(colors.gray[50], 0.8) }]}
              >
                <View pointerEvents="none" style={s.rateGlow} />
                <View style={{ alignItems: 'center', zIndex: 10 }}>
                  <View style={s.rateIcon}>
                    <Star size={32} color="#DC2626" fill="#DC2626" />
                  </View>
                  <Text style={s.rateTitle}>{isLocalRated ? 'Feedback Received' : 'Enjoyed your food?'}</Text>
                  <Text style={s.rateText}>
                    {isLocalRated
                      ? 'Thank you for rating your experience! Your feedback has been submitted.'
                      : `Rate your experience with ${order?.restaurant || 'The Restaurant'} and help us improve!`}
                  </Text>
                  <Button
                    disabled={isLocalRated}
                    onPress={() => {
                      if (!isLocalRated) {
                        handleOpenRating()
                      }
                    }}
                    style={[s.rateBtn, isLocalRated ? { backgroundColor: t.dark ? colors.gray[700] : colors.gray[300], opacity: 1 } : { backgroundColor: '#DC2626' }]}
                    textStyle={{ fontWeight: '700', color: isLocalRated ? (t.dark ? colors.gray[400] : colors.gray[500]) : colors.white }}
                  >
                    {isLocalRated ? 'Submitted' : 'Give Rating'}
                  </Button>
                </View>
              </Pressable>
            </FadeUp>
          )}

          {/* Rating Summary */}
          {orderStatus === 'delivered' && isOrderRated && (
            <FadeUp distance={10} style={[s.card, { padding: sp(5), borderWidth: 1, borderColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
              <View style={s.feedbackHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green[500] }} />
                  <Text style={s.feedbackTitle}>Your Feedback</Text>
                </View>
                <Text style={s.feedbackDone}>RATING SUBMITTED</Text>
              </View>
              <View style={{ gap: sp(4) }}>
                <View style={s.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.feedbackName}>{order?.restaurant || 'Food & Restaurant'}</Text>
                    {order?.ratings?.restaurant?.comment ? (
                      <Text style={s.feedbackComment} numberOfLines={1}>
                        "{order.ratings.restaurant.comment}"
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 2 }}>{renderStars(order?.ratings?.restaurant?.rating || order?.restaurantRating, 'res-rated')}</View>
                </View>
                {hasDeliveryPartner && (
                  <View style={s.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.feedbackName}>Delivery Service</Text>
                      {order?.ratings?.deliveryPartner?.comment ? (
                        <Text style={s.feedbackComment} numberOfLines={1}>
                          "{order.ratings.deliveryPartner.comment}"
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2 }}>{renderStars(order?.ratings?.deliveryPartner?.rating || order?.deliveryPartnerRating, 'del-rated')}</View>
                  </View>
                )}
              </View>
            </FadeUp>
          )}

          {/* Delivery Partner Info */}
          {order?.deliveryPartnerId && (
            <FadeUp delay={550} style={[s.card, { overflow: 'hidden' }]}>
              <View style={[s.partnerRow, s.dashedBottom]}>
                <View style={s.partnerAvatar}>
                  {order.deliveryPartner?.avatar ? (
                    <AppImage src={order.deliveryPartner.avatar} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <View style={{ width: '100%', height: '100%', padding: 4 }}>
                      <SvgIcon xml={RIDER_BIKE_SVG} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitleSemi}>{order.deliveryPartner?.name || 'Delivery Partner'}</Text>
                  <Text style={s.smMuted}>{orderStatus === 'delivered' ? 'Delivered your order' : 'Your delivery partner is arriving'}</Text>
                </View>
                <TapScale style={[s.circleBtn, { backgroundColor: colors.blue[50] }]} onPress={handleCallRider}>
                  <Phone size={20} color={colors.blue[600]} />
                </TapScale>
              </View>
              {order?.note ? (
                <View style={s.riderNote}>
                  <MessageSquare size={16} color={colors.blue[500]} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.riderNoteLabel}>INSTRUCTION FOR RIDER</Text>
                    <Text style={s.riderNoteText}>"{order.note}"</Text>
                  </View>
                </View>
              ) : null}
            </FadeUp>
          )}

          {/* Delivery Partner Safety */}
          {orderStatus !== 'delivered' && orderStatus !== 'cancelled' && order?.orderType !== 'takeaway' && order?.orderType !== 'dining' && (
            <FadeUp delay={600}>
              <Pressable
                onPress={() => navigate('/food/user/profile/delivery-safety', { state: { returnTo: location.pathname } })}
                style={({ pressed }) => [s.card, s.safetyRow, pressed && { transform: [{ scale: 0.99 }] }]}
              >
                <Shield size={24} color={t.dark ? colors.gray[400] : colors.gray[600]} />
                <Text style={s.safetyText}>Learn about delivery partner safety</Text>
                <ChevronRight size={20} color={colors.gray[400]} />
              </Pressable>
            </FadeUp>
          )}

          {/* Delivery Details Banner */}
          {orderStatus !== 'delivered' && orderStatus !== 'cancelled' && order?.orderType !== 'takeaway' && order?.orderType !== 'dining' && (
            <FadeUp delay={650} style={s.detailsBanner}>
              <Text style={s.detailsBannerText}>All your delivery details in one place 🥡</Text>
            </FadeUp>
          )}

          {/* Contact & Address Section */}
          {order?.orderType !== 'takeaway' && (
            <FadeUp delay={700} style={[s.card, { overflow: 'hidden' }]}>
              <SectionItem
                icon={User}
                title={order?.userName || order?.userId?.fullName || order?.userId?.name || profile?.fullName || profile?.name || 'Customer'}
                subtitle={order?.userPhone || order?.userId?.phone || profile?.phone || defaultAddress?.phone || 'Phone number not available'}
                showArrow={false}
              />
              <SectionItem
                iconNode={order?.orderType === 'dining' ? <Users size={20} color={colors.blue[600]} /> : <SvgIcon xml={SAFE_CUSTOMER_PIN} size={24} />}
                title={order?.orderType === 'dining' ? 'Dining / Table Service' : 'Delivery at Location'}
                subtitle={deliveryAddressSubtitle}
                showArrow={false}
                isLast={!showInstructionsRow}
              />
              {showInstructionsRow && (
                <SectionItem
                  icon={MessageSquare}
                  title={order?.note ? 'Edit delivery instructions' : 'Add delivery instructions'}
                  subtitle={order?.note ? order.note.substring(0, 35) + (order.note.length > 35 ? '...' : '') : ''}
                  isLast
                  onPress={() => {
                    setDeliveryInstructions(order?.note || '')
                    setIsInstructionsModalOpen(true)
                  }}
                />
              )}
            </FadeUp>
          )}

          {/* Restaurant Section */}
          <FadeUp delay={750} style={[s.card, { overflow: 'hidden' }]}>
            <View style={[s.partnerRow, s.dashedBottom]}>
              <View style={s.restaurantIcon}>
                <SvgIcon xml={SAFE_RESTAURANT_PIN} size={28} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitleSemi}>{order.restaurant}</Text>
                <Text style={s.smMuted}>{order.restaurantAddress || 'Restaurant location'}</Text>
              </View>
              <View style={{ gap: sp(2) }}>
                <TapScale style={[s.circleBtn, { backgroundColor: colors.orange[50] }, shadow.sm]} onPress={handleOpenDirections} accessibilityLabel="Get Directions">
                  <Navigation size={20} color="#DC2626" />
                </TapScale>
                <TapScale style={[s.circleBtn, { backgroundColor: colors.orange[50] }, shadow.sm]} onPress={handleCallRestaurant} accessibilityLabel="Call Restaurant">
                  <Phone size={20} color="#DC2626" />
                </TapScale>
              </View>
            </View>

            {/* Order Items */}
            <Pressable onPress={() => setShowOrderDetails(true)} style={({ pressed }) => [{ padding: sp(4) }, pressed && { backgroundColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[50] }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) }}>
                <Receipt size={20} color={colors.gray[500]} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <View style={{ marginTop: sp(2), gap: sp(1) }}>
                    {order?.items?.map((item, index) => (
                      <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
                        <View style={s.vegBox}>
                          <View style={s.vegDot} />
                        </View>
                        <Text style={s.itemLine}>
                          {item.quantity} x {item.name}
                          {item.variantName ? ` (${item.variantName})` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <ChevronRight size={20} color={colors.gray[400]} />
              </View>
            </Pressable>
          </FadeUp>

          {!isAdminAccepted && orderStatus !== 'cancelled' && orderStatus !== 'delivered' && (
            <FadeUp delay={800} style={{ gap: sp(3) }}>
              <Button variant="outline" style={s.cancelBtn} textStyle={{ color: colors.white, fontWeight: '600' }} onPress={handleCancelOrder}>
                Cancel Order
              </Button>
              <Text style={s.cancelHint}>You can cancel your order until the restaurant accepts it.</Text>
            </FadeUp>
          )}
        </View>
      </ScrollView>

      {/* Order Confirmed Modal */}
      {showConfirmation && (
        <ConfirmationOverlay
          t={t}
          s={s}
          isScheduledOrder={isScheduledOrder}
          scheduledDateFormatted={scheduledDateFormatted}
          onSafety={() => navigate('/food/user/profile/delivery-safety', { state: { returnTo: location.pathname } })}
        />
      )}

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent style={{ width: '95%', maxWidth: 600 }}>
          <DialogHeader style={{ paddingHorizontal: sp(6), paddingTop: sp(6) }}>
            <DialogTitle style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: t.dark ? colors.gray[100] : colors.gray[900] }}>Cancel Order</DialogTitle>
          </DialogHeader>
          <View style={{ gap: sp(5), paddingVertical: sp(6), paddingHorizontal: sp(2) }}>
            {isRazorpayPaidForDialog ? (
              <View style={s.refundBox}>
                <Text style={s.refundTitle}>Refund preference</Text>
                <View style={{ gap: sp(2) }}>
                  {[
                    { value: 'source', label: 'Refund to original payment method (5-7 working days)' },
                    { value: 'wallet', label: 'Refund to wallet (instant credit)' },
                  ].map((opt) => (
                    <Pressable key={opt.value} disabled={isCancelling} onPress={() => setRefundDestination(opt.value)} style={s.refundOption}>
                      <View style={[s.radioOuter, refundDestination === opt.value && { borderColor: colors.blue[600] }]}>
                        {refundDestination === opt.value ? <View style={s.radioInner} /> : null}
                      </View>
                      <Text style={s.refundLabel}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Textarea
              value={cancellationReason}
              onChangeText={setCancellationReason}
              placeholder="e.g., Changed my mind, Wrong address, etc."
              style={s.cancelReason}
              disabled={isCancelling}
            />
            <View style={{ flexDirection: 'row', gap: sp(3), paddingTop: sp(2) }}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="outline"
                  onPress={() => {
                    setShowCancelDialog(false)
                    setCancellationReason('')
                    setRefundDestination('source')
                  }}
                  disabled={isCancelling}
                >
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button onPress={handleConfirmCancel} disabled={isCancelling || !cancellationReason.trim()} style={{ backgroundColor: colors.red[600] }} textStyle={{ color: colors.white }}>
                  {isCancelling ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Spin>
                        <Loader2 size={16} color={colors.white} />
                      </Spin>
                      <Text style={{ color: colors.white, fontSize: 14, fontWeight: '500', marginLeft: sp(2) }}>Cancelling...</Text>
                    </View>
                  ) : (
                    'Confirm Cancellation'
                  )}
                </Button>
              </View>
            </View>
          </View>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent style={[s.detailsDialog]}>
          <DialogHeader style={s.detailsHeader}>
            <DialogTitle style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors.gray[900], textAlign: 'left' }}>Order Details</DialogTitle>
          </DialogHeader>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: sp(6), paddingTop: sp(4), gap: sp(6) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(4), marginTop: sp(2) }}>
              <View>
                <Text style={s.metaLabel}>DATE & TIME</Text>
                <Text style={s.metaValue}>
                  {order?.createdAt
                    ? new Date(order.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : 'N/A'}
                </Text>
              </View>
              <View style={{ height: 32, width: 1, backgroundColor: colors.gray[100] }} />
              <View>
                <Text style={s.metaLabel}>STATUS</Text>
                <Text style={s.metaStatus}>{String(order?.status === 'placed' ? 'order placed' : order?.status?.replace('_', ' ') || '').toUpperCase()}</Text>
              </View>
            </View>

            {order?.note ? (
              <View style={s.noteBox}>
                <MessageSquare size={20} color="#DC2626" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.noteBoxLabel, { color: t.dark ? colors.red[400] : '#DC2626' }]}>DELIVERY INSTRUCTIONS</Text>
                  <Text style={s.noteBoxText}>{order.note}</Text>
                </View>
              </View>
            ) : null}

            <View>
              <Text style={s.sectionLabel}>ORDER ITEMS</Text>
              <View style={{ gap: sp(4) }}>
                {order?.items?.map((item, index) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(4) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), flex: 1 }}>
                      <View style={[s.vegBox, { width: 20, height: 20, marginTop: 2 }]}>
                        <View style={[s.vegDot, { width: 10, height: 10, borderRadius: 5 }]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.detailItemName}>{item.name}</Text>
                        {item.variantName ? <Text style={s.detailItemSub}>{item.variantName}</Text> : null}
                        <Text style={s.detailItemSub}>Quantity: {item.quantity}</Text>
                      </View>
                    </View>
                    <Text style={s.detailItemPrice}>₹{((item?.price || 0) * (item?.quantity || 0)).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={s.billBox}>
              <Text style={s.billTitle}>BILL SUMMARY</Text>
              <View style={s.billRow}>
                <Text style={s.billKey}>Item Total</Text>
                <Text style={s.billVal}>₹{Number(order?.subtotal || 0).toFixed(2)}</Text>
              </View>
              {Number(order?.packagingFee) > 0 && (
                <View style={s.billRow}>
                  <Text style={s.billKey}>Packaging Charges</Text>
                  <Text style={s.billVal}>₹{Number(order.packagingFee).toFixed(2)}</Text>
                </View>
              )}
              {Number(order?.platformFee) > 0 && (
                <View style={s.billRow}>
                  <Text style={s.billKey}>Platform Fee</Text>
                  <Text style={s.billVal}>₹{Number(order.platformFee).toFixed(2)}</Text>
                </View>
              )}
              {order?.orderType !== 'takeaway' && order?.orderType !== 'dining' && (
                <View style={s.billRow}>
                  <Text style={s.billKey}>Delivery Fee</Text>
                  <Text style={s.billVal}>₹{Number(order?.deliveryFee || 0).toFixed(2)}</Text>
                </View>
              )}
              <View style={s.billRow}>
                <Text style={s.billKey}>GST</Text>
                <Text style={s.billVal}>₹{Number(order?.gst || 0).toFixed(2)}</Text>
              </View>
              {Number(order?.discount) > 0 && (
                <View style={s.billRow}>
                  <Text style={[s.billKey, { color: colors.green[600], fontWeight: '500' }]}>Discount Applied</Text>
                  <Text style={[s.billVal, { color: colors.green[600] }]}>-₹{Number(order.discount).toFixed(2)}</Text>
                </View>
              )}
              <View style={[s.billRow, s.paidRow]}>
                <Text style={s.paidLabel}>
                  Paid
                  {(() => {
                    const method = String(order?.payment?.method || order?.paymentMethod || 'online').toLowerCase()
                    if (method === 'cash' || method === 'cod') {
                      return <Text style={{ color: t.dark ? colors.gray[400] : colors.gray[500], fontWeight: '700' }}> (COD)</Text>
                    }
                    return <Text style={{ color: t.dark ? colors.green[400] : colors.green[600], fontWeight: '700' }}> (Online)</Text>
                  })()}
                </Text>
                <Text style={s.paidAmount}>₹{Number(order?.totalAmount || 0).toFixed(2)}</Text>
              </View>
            </View>

            {order?.paymentMethod ? (
              <View style={[s.rowBetween, { paddingHorizontal: 4 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
                  <Shield size={16} color={colors.gray[600]} />
                  <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[600] }}>Payment Method</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900], letterSpacing: 0.4 }}>{String(order.paymentMethod).toUpperCase()}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={{ padding: sp(6), borderTopWidth: 1, borderTopColor: colors.gray[100] }}>
            <Button onPress={() => setShowOrderDetails(false)} style={{ width: '100%', backgroundColor: colors.gray[900], height: 48, borderRadius: 14 }} textStyle={{ color: colors.white, fontWeight: '700' }}>
              Okay
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* Delivery Instructions Modal */}
      <Dialog open={isInstructionsModalOpen} onOpenChange={setIsInstructionsModalOpen}>
        <DialogContent style={s.sheetDialog}>
          <DialogHeader style={{ marginBottom: sp(2) }}>
            <DialogTitle style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: t.dark ? colors.white : colors.gray[900] }}>Delivery Instructions</DialogTitle>
          </DialogHeader>
          <View style={{ gap: sp(4) }}>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.gray[500] }}>
              Add instructions for the delivery partner to help them find your address or know where to leave your order.
            </Text>
            <Textarea
              value={deliveryInstructions}
              onChangeText={setDeliveryInstructions}
              placeholder="E.g. Ring the doorbell, leave at the front desk..."
              placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
              style={s.instructionsInput}
            />
            <Button onPress={handleUpdateInstructions} disabled={isUpdatingInstructions} style={s.redBtn} textStyle={{ color: colors.white, fontWeight: '700' }}>
              {isUpdatingInstructions ? (
                <Spin>
                  <Loader2 size={20} color={colors.white} />
                </Spin>
              ) : (
                'Save Instructions'
              )}
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* Rating & Feedback Modal */}
      <Dialog open={showRatingModal} onOpenChange={setShowRatingModal}>
        <DialogContent style={s.sheetDialog}>
          <ScrollView style={{ maxHeight: 640 }} keyboardShouldPersistTaps="handled">
            <DialogHeader style={{ marginBottom: sp(2) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2), justifyContent: 'center' }}>
                <Star size={24} color="#DC2626" fill="#DC2626" />
                <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: t.dark ? colors.white : colors.gray[900] }}>Rate your Experience</Text>
              </View>
            </DialogHeader>

            <View style={{ gap: sp(6), paddingVertical: sp(2) }}>
              <View style={{ gap: sp(3) }}>
                <View style={s.rowBetween}>
                  <Text style={s.rateQ}>How was the food?</Text>
                  <View style={[s.tag, { backgroundColor: t.dark ? alpha(colors.orange[950], 0.3) : colors.orange[50] }]}>
                    <Text style={[s.tagText, { color: t.dark ? colors.orange[400] : colors.orange[600] }]}>Restaurant</Text>
                  </View>
                </View>
                {renderStarPicker(selectedRestaurantRating, setSelectedRestaurantRating, 'res-star')}
                <Textarea
                  placeholder="Write a quick review for the food (optional)"
                  value={restaurantFeedbackText}
                  onChangeText={setRestaurantFeedbackText}
                  placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                  style={s.reviewInput}
                />
              </View>

              {hasDeliveryPartner && (
                <View style={{ gap: sp(3), paddingTop: sp(4), borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[100] }}>
                  <View style={s.rowBetween}>
                    <Text style={s.rateQ}>How was the delivery?</Text>
                    <View style={[s.tag, { backgroundColor: t.dark ? alpha(colors.blue[950], 0.3) : colors.blue[50] }]}>
                      <Text style={[s.tagText, { color: t.dark ? colors.blue[400] : colors.blue[600] }]}>Delivery</Text>
                    </View>
                  </View>
                  {renderStarPicker(selectedDeliveryRating, setSelectedDeliveryRating, 'del-star')}
                  <Textarea
                    placeholder={`How was ${order?.deliveryPartnerName || 'the rider'}? (optional)`}
                    value={deliveryFeedbackText}
                    onChangeText={setDeliveryFeedbackText}
                    placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                    style={s.reviewInput}
                  />
                </View>
              )}

              <Button
                onPress={handleSubmitRating}
                disabled={submittingRating || selectedRestaurantRating === null || (hasDeliveryPartner && selectedDeliveryRating === null)}
                style={[s.redBtn, { height: 56, borderRadius: 16, marginTop: sp(4), ...shadow.lg }]}
                textStyle={{ color: colors.white, fontWeight: '700' }}
              >
                {submittingRating ? (
                  <Spin>
                    <Loader2 size={20} color={colors.white} />
                  </Spin>
                ) : (
                  'Submit Feedback'
                )}
              </Button>

              <Pressable onPress={() => setShowRatingModal(false)} style={{ paddingVertical: sp(2), alignItems: 'center' }}>
                {({ pressed }) => (
                  <Text style={{ fontSize: 14, fontWeight: '500', color: pressed ? (t.dark ? colors.gray[400] : colors.gray[600]) : t.dark ? colors.gray[500] : colors.gray[400] }}>Maybe later</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </DialogContent>
      </Dialog>
    </Screen>
  )
}

/** The post-checkout "Order Placed!" splash (fixed inset-0 z-50, fades in) */
function ConfirmationOverlay({ t, s, isScheduledOrder, scheduledDateFormatted, onSafety }) {
  const fade = useEnter(250)
  const pop = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, delay: 200, friction: 6, tension: 60, useNativeDriver: true }).start()
  }, [pop])
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.confirmPage, { opacity: fade }]}>
      <Animated.View style={{ alignItems: 'center', paddingHorizontal: sp(8), opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
        <AnimatedCheckmark delay={0.3} />
        <FadeUp delay={900}>
          <Text style={s.confirmTitle}>{isScheduledOrder ? 'Order Scheduled!' : 'Order Placed!'}</Text>
        </FadeUp>
        <FadeUp delay={1100}>
          <Text style={s.confirmText}>{isScheduledOrder ? `Scheduled for ${scheduledDateFormatted}` : 'Waiting for the restaurant to accept your order'}</Text>
        </FadeUp>
        <FadeUp delay={1500} distance={0} style={{ marginTop: sp(8), alignItems: 'center' }}>
          <Spin>
            <View style={s.confirmSpinner} />
          </Spin>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.gray[500], marginTop: sp(3) }}>Loading order details...</Text>
        </FadeUp>
        <FadeUp delay={2000} distance={10} style={s.confirmFoot}>
          <Pressable onPress={onSafety} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2) }, pressed && { opacity: 0.8 }]}>
            <Shield size={16} color={t.dark ? colors.orange[400] : '#DC2626'} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: t.dark ? colors.orange[400] : '#DC2626' }}>Learn about delivery partner safety</Text>
          </Pressable>
        </FadeUp>
      </Animated.View>
    </Animated.View>
  )
}

const useStyles = makeStyles((t) => {
  const d = t.dark
  return {
    mutedText: { color: d ? colors.gray[400] : colors.gray[600] },
    notFoundTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', marginBottom: sp(4), color: d ? colors.gray[100] : colors.gray[900] },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(4), paddingVertical: sp(3) },
    navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    navTitle: { fontWeight: '600', fontSize: 18, lineHeight: 28, color: colors.white, flexShrink: 1, textAlign: 'center' },
    statusTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.white, textAlign: 'center' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: sp(2), backgroundColor: alpha('#ffffff', 0.2), borderRadius: 999, paddingHorizontal: sp(4) },
    pillText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.white, flexShrink: 1 },
    pillTextStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.white },
    pillDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: alpha('#ffffff', 0.6) },
    scheduledNote: { fontSize: 12, lineHeight: 16, marginTop: sp(3), color: alpha('#ffffff', 0.8), textAlign: 'center' },
    content: { paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(4) },
    card: { backgroundColor: d ? '#1a1a1a' : colors.white, borderRadius: 12, ...shadow.sm },
    rowCenter4: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, padding: 8, ...shadow.sm },
    cardTitle: { fontWeight: '600', color: d ? colors.gray[100] : colors.gray[900], lineHeight: 20 },
    cardTitleSemi: { fontWeight: '600', color: d ? colors.gray[100] : colors.gray[900] },
    cardSub: { fontSize: 14, lineHeight: 18, color: d ? colors.gray[400] : colors.gray[500], marginTop: sp(1) },
    smMuted: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[400] : colors.gray[500] },
    xs: { fontSize: 12, lineHeight: 16 },
    otpCard: { borderRadius: 12, padding: sp(4), borderWidth: 1, ...shadow.sm },
    otpTakeaway: { backgroundColor: d ? alpha(colors.emerald[950], 0.2) : colors.emerald[50], borderColor: d ? alpha(colors.emerald[900], 0.3) : colors.emerald[100] },
    otpDelivery: { backgroundColor: d ? alpha(colors.blue[900], 0.1) : colors.blue[50], borderColor: d ? alpha(colors.blue[900], 0.3) : colors.blue[100] },
    otpLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.3 },
    otpCode: { fontSize: 24, lineHeight: 32, fontWeight: '800', marginTop: sp(1), letterSpacing: 2.4 },
    otpHint: { fontSize: 12, lineHeight: 16, marginTop: sp(1) },
    pickupCard: {
      backgroundColor: d ? alpha(colors.orange[950], 0.2) : colors.orange[50],
      borderWidth: 1,
      borderColor: d ? alpha(colors.orange[900], 0.3) : colors.orange[100],
      borderRadius: 12,
      padding: sp(4),
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: sp(3),
      ...shadow.sm,
    },
    pickupIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: d ? alpha(colors.orange[900], 0.4) : colors.orange[100], alignItems: 'center', justifyContent: 'center' },
    pickupTitle: { fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900], fontSize: 14, lineHeight: 20 },
    pickupText: { fontSize: 12, lineHeight: 19, color: d ? colors.gray[400] : colors.gray[600], marginTop: sp(1) },
    rateCard: {
      backgroundColor: d ? '#1a1a1a' : colors.white,
      borderRadius: 12,
      padding: sp(6),
      borderWidth: 2,
      borderColor: alpha('#DC2626', 0.1),
      overflow: 'hidden',
      ...shadow.sm,
    },
    rateGlow: { position: 'absolute', top: -16, right: -16, width: 96, height: 96, borderRadius: 48, backgroundColor: alpha('#DC2626', 0.05) },
    rateIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: alpha('#DC2626', d ? 0.2 : 0.1), alignItems: 'center', justifyContent: 'center', marginBottom: sp(4) },
    rateTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900] },
    rateText: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[400] : colors.gray[500], marginTop: sp(2), marginBottom: sp(6), maxWidth: 280, textAlign: 'center' },
    rateBtn: { width: '100%', maxWidth: 200, height: 48, borderRadius: 14, borderWidth: 0, ...shadow.lg },
    feedbackHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(4), paddingBottom: sp(3), borderBottomWidth: 1, borderBottomColor: d ? alpha(colors.gray[800], 0.5) : colors.gray[50] },
    feedbackTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900] },
    feedbackDone: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: d ? colors.gray[500] : colors.gray[400], letterSpacing: 1, opacity: 0.5 },
    feedbackName: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: d ? colors.gray[300] : colors.gray[700] },
    feedbackComment: { fontSize: 10, lineHeight: 14, color: d ? colors.gray[400] : colors.gray[500], fontStyle: 'italic', marginTop: 2 },
    partnerRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4) },
    dashedBottom: { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: d ? colors.gray[800] : colors.gray[200] },
    partnerAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: d ? alpha(colors.blue[900], 0.2) : colors.blue[50],
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: d ? alpha(colors.blue[900], 0.3) : colors.blue[100],
      padding: 4,
    },
    circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    riderNote: {
      backgroundColor: d ? alpha(colors.blue[900], 0.1) : alpha(colors.blue[50], 0.5),
      padding: sp(3),
      marginHorizontal: sp(4),
      marginBottom: sp(4),
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: sp(2),
      borderWidth: 1,
      borderColor: d ? alpha(colors.blue[900], 0.2) : colors.blue[100],
    },
    riderNoteLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: d ? colors.blue[400] : colors.blue[600], letterSpacing: 0.5, marginBottom: 2 },
    riderNoteText: { fontSize: 12, lineHeight: 19, color: d ? colors.gray[300] : colors.gray[700], fontWeight: '500' },
    safetyRow: { width: '100%', padding: sp(4), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    safetyText: { flex: 1, fontWeight: '500', color: d ? colors.gray[100] : colors.gray[900] },
    detailsBanner: { backgroundColor: d ? alpha(colors.yellow[900], 0.1) : colors.yellow[50], borderRadius: 12, padding: sp(4), alignItems: 'center', borderWidth: d ? 1 : 0, borderColor: alpha(colors.yellow[900], 0.3) },
    detailsBannerText: { color: d ? colors.yellow[400] : colors.yellow[800], fontWeight: '500', fontSize: 14, lineHeight: 20, textAlign: 'center' },
    restaurantIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.orange[100], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    vegBox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: colors.green[600], alignItems: 'center', justifyContent: 'center' },
    vegDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green[600] },
    itemLine: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[400] : colors.gray[600], flexShrink: 1 },
    cancelBtn: { width: '100%', height: 48, borderRadius: 14, backgroundColor: colors.red[600], borderColor: colors.red[600] },
    cancelHint: { fontSize: 10, lineHeight: 14, color: colors.gray[400], textAlign: 'center', paddingHorizontal: sp(4) },

    confirmPage: { zIndex: 50, elevation: 50, backgroundColor: d ? '#1a1a1a' : colors.white, alignItems: 'center', justifyContent: 'center' },
    confirmTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900], marginTop: sp(6), textAlign: 'center' },
    confirmText: { color: d ? colors.gray[300] : colors.gray[600], marginTop: sp(2), textAlign: 'center' },
    confirmSpinner: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#DC2626', borderTopColor: 'transparent' },
    confirmFoot: { marginTop: sp(12), paddingTop: sp(8), borderTopWidth: 1, borderTopColor: d ? colors.gray[800] : colors.gray[100], alignSelf: 'stretch' },

    refundBox: { gap: sp(3), borderRadius: 8, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.gray[50], padding: sp(4) },
    refundTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
    refundOption: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), borderRadius: 6, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white, paddingHorizontal: sp(3), paddingVertical: sp(2) },
    radioOuter: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.gray[400], alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue[600] },
    refundLabel: { fontSize: 14, lineHeight: 20, color: colors.gray[700], flex: 1 },
    cancelReason: { width: '100%', minHeight: 100, borderWidth: 2, borderColor: colors.gray[300], borderRadius: 8, paddingHorizontal: sp(4), paddingVertical: sp(3), fontSize: 14 },

    detailsDialog: { width: '100%', maxWidth: 448, backgroundColor: d ? '#1a1a1a' : colors.white, borderRadius: 16, padding: 0, overflow: 'hidden', borderWidth: 0 },
    detailsHeader: { padding: sp(6), paddingBottom: sp(4), borderBottomWidth: 1, borderBottomColor: d ? colors.gray[800] : colors.gray[100], paddingRight: sp(12) },
    metaLabel: { fontSize: 12, lineHeight: 16, color: colors.gray[500], letterSpacing: 0.6 },
    metaValue: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: d ? colors.gray[100] : colors.gray[900] },
    metaStatus: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.green[600] },
    noteBox: { backgroundColor: alpha(colors.orange[50], 0.5), borderRadius: 12, padding: sp(4), borderWidth: 1, borderColor: colors.orange[100], flexDirection: 'row', gap: sp(3) },
    noteBoxLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, marginBottom: sp(1) },
    noteBoxText: { fontSize: 14, lineHeight: 22, color: colors.gray[800], fontWeight: '500', textTransform: 'capitalize' },
    sectionLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[500], letterSpacing: 0.7, marginBottom: sp(3) },
    detailItemName: { fontWeight: '600', color: colors.gray[900], lineHeight: 20 },
    detailItemSub: { fontSize: 14, lineHeight: 20, color: colors.gray[500], marginTop: 2 },
    detailItemPrice: { fontWeight: '600', color: colors.gray[900] },
    billBox: { backgroundColor: colors.gray[50], borderRadius: 12, padding: sp(4), gap: sp(3) },
    billTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900], letterSpacing: 0.7, marginBottom: sp(1) },
    billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    billKey: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
    billVal: { fontSize: 14, lineHeight: 20, color: colors.gray[900], fontWeight: '500' },
    paidRow: { paddingTop: sp(2), borderTopWidth: 1, borderTopColor: d ? colors.gray[800] : colors.gray[200] },
    paidLabel: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: d ? colors.white : colors.gray[900] },
    paidAmount: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: d ? colors.white : colors.gray[900] },

    sheetDialog: { width: '95%', maxWidth: 448, borderRadius: 24, padding: sp(6), borderWidth: 0, backgroundColor: d ? '#1a1a1a' : colors.white, ...shadow['2xl'] },
    instructionsInput: {
      minHeight: 120,
      borderColor: colors.gray[200],
      borderRadius: 14,
      backgroundColor: d ? colors.gray[800] : colors.gray[50],
      color: d ? colors.gray[100] : colors.gray[800],
      fontSize: 16,
    },
    redBtn: { width: '100%', backgroundColor: '#DC2626', height: 48, borderRadius: 14, borderWidth: 0 },
    rateQ: { fontWeight: '600', color: d ? colors.gray[200] : colors.gray[800] },
    tag: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 999 },
    tagText: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
    reviewInput: {
      minHeight: 80,
      fontSize: 14,
      backgroundColor: d ? alpha(colors.gray[800], 0.5) : colors.gray[50],
      borderColor: d ? colors.gray[800] : colors.gray[100],
      borderRadius: 14,
      color: d ? colors.gray[100] : colors.gray[800],
    },
  }
})
