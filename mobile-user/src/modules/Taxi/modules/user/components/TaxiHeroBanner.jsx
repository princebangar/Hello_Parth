// Web: modules/Taxi/modules/user/components/TaxiHeroBanner.jsx — the default Taxi home banner ("Safe Rides, Every
// Time" + the three ride types). Tapping a vehicle starts a booking for it.
// Native notes: the radial + linear background is drawn with react-native-svg; the artwork's CSS mask (fade-in over the
// top 7%) is a gradient strip in the banner colour laid over the top of the picture.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, ShieldCheck, Zap } from 'lucide-react-native';
import { AppImage, Text } from '@/native/ui';
import { alpha } from '@/theme';
import ridesStrip from '../../../assets/user-app/hero-rides-strip.webp';

/** Download the vehicle picture ahead of time (the Taxi start-up check calls this once it knows the default banner will be shown). */
export const preloadHeroArt = () => Promise.resolve(true); // bundled with the app: nothing to download

// Where each vehicle sits in the artwork (left edge and width, in % of the picture) - the tap areas lie over it.
const VEHICLES = [
  { key: 'bike', label: 'Bike Ride', left: 15, width: 22 },
  { key: 'auto', label: 'Auto Ride', left: 38.5, width: 20 },
  { key: 'cab', label: 'Car Ride', left: 58, width: 25 },
];

const PERKS = [
  { Icon: ShieldCheck, text: 'Safe' },
  { Icon: Zap, text: 'Fast' },
  { Icon: MapPin, text: 'Affordable' },
];

// The artwork (hero-rides-strip.webp, 1170 x 292).
const STRIP_ASPECT = 1170 / 292;

/** Background: radial glow + vertical gradient (web: CSS background on the section). */
const Background = () => (
  <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
    <Defs>
      <SvgLinearGradient id="heroBg" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#0B172A" />
        <Stop offset="0.22" stopColor="#0a2a70" />
        <Stop offset="0.52" stopColor="#00348f" />
        <Stop offset="0.78" stopColor="#002f84" />
        <Stop offset="1" stopColor="#002a77" />
      </SvgLinearGradient>
      <RadialGradient id="heroGlow" cx="50%" cy="46%" rx="120%" ry="60%" fx="50%" fy="46%">
        <Stop offset="0" stopColor="#004ad6" stopOpacity="0.5" />
        <Stop offset="0.7" stopColor="#004ad6" stopOpacity="0" />
      </RadialGradient>
    </Defs>
    <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroBg)" />
    <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGlow)" />
  </Svg>
);

/** Skyline silhouettes drawn in code so they stay sharp at any width. */
const Skyline = () => (
  <View pointerEvents="none" style={styles.skylineBox}>
    <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
      <G fill="#04297a" opacity={0.55}>
        <Rect x="0" y="52" width="26" height="68" />
        <Rect x="22" y="30" width="20" height="90" />
        <Rect x="46" y="62" width="24" height="58" />
        <Rect x="72" y="44" width="16" height="76" />
        <Rect x="312" y="48" width="22" height="72" />
        <Rect x="338" y="22" width="24" height="98" />
        <Rect x="364" y="58" width="18" height="62" />
        <Rect x="380" y="40" width="20" height="80" />
      </G>
      <G fill="#032a85" opacity={0.4}>
        <Rect x="88" y="70" width="18" height="50" />
        <Rect x="290" y="66" width="20" height="54" />
      </G>
    </Svg>
  </View>
);

const TaxiHeroBanner = ({ onPick, style, fillHeight = true }) => (
  <View accessibilityLabel="Safe rides, every time" style={[styles.section, style]}>
    <Background />
    <Skyline />

    <View style={styles.textBlock}>
      <View style={styles.taglineRow}>
        <LinearGradient colors={['transparent', alpha('#60a5fa', 0.8)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.taglineLine} />
        <Text style={styles.tagline}>Get to your destination</Text>
        <LinearGradient colors={[alpha('#60a5fa', 0.8), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.taglineLine} />
      </View>

      <View style={styles.headingBox}>
        <Text style={[styles.heading, { color: '#ffffff' }]}>Safe Rides,</Text>
        <Text style={[styles.heading, { color: '#ffc929' }]}>Every Time</Text>
      </View>

      <View style={styles.perksRow}>
        {PERKS.map(({ Icon, text }, index) => (
          <React.Fragment key={text}>
            {index > 0 && <View style={styles.perkDivider} />}
            <View style={styles.perk}>
              <Icon size={15} strokeWidth={2.4} color="#ffffff" fill={index === 1 ? alpha('#ffffff', 0.9) : 'none'} />
              <Text style={styles.perkText}>{text}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>

    {/* The picture keeps its proportions and is centred in the space that is left; the tap areas sit in the same box. */}
    <View style={[styles.stripArea, fillHeight ? styles.stripFill : { aspectRatio: STRIP_ASPECT }]}>
      <View style={fillHeight ? styles.stripBoxFill : StyleSheet.absoluteFill}>
        <AppImage src={ridesStrip} contentFit="fill" transition={0} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['#00348f', alpha('#00348f', 0)]} style={styles.stripFade} pointerEvents="none" />
        {VEHICLES.map((vehicle) => (
          <Pressable
            key={vehicle.key}
            accessibilityRole="button"
            accessibilityLabel={vehicle.label}
            onPress={() => onPick?.(vehicle.key)}
            style={({ pressed }) => [
              styles.vehicleTap,
              { left: `${vehicle.left}%`, width: `${vehicle.width}%` },
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
          />
        ))}
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  section: { flexDirection: 'column', overflow: 'hidden' },
  skylineBox: { position: 'absolute', left: 0, right: 0, bottom: '40%', height: '42%' },
  textBlock: { zIndex: 10, flexShrink: 0, alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  taglineRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  taglineLine: { height: 1, width: 24 },
  tagline: { textTransform: 'uppercase', fontSize: 10.5, fontWeight: '600', letterSpacing: 2.3, color: alpha('#bfdbfe', 0.9) },
  headingBox: { marginTop: 4, alignItems: 'center' },
  heading: {
    fontSize: 36,
    lineHeight: 37,
    fontWeight: '700',
    letterSpacing: -0.9,
    textShadowColor: 'rgba(0,20,70,0.55)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  perksRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  perkDivider: { marginHorizontal: 10, height: 14, width: 1, backgroundColor: alpha('#ffffff', 0.35) },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  perkText: { fontSize: 12.5, lineHeight: 16, fontWeight: '600', color: '#ffffff' },
  stripArea: { zIndex: 10, marginTop: 4, minHeight: 0, width: '100%' },
  stripFill: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
  stripBoxFill: { height: '100%', aspectRatio: STRIP_ASPECT },
  stripFade: { position: 'absolute', left: 0, right: 0, top: 0, height: '7%' },
  vehicleTap: { position: 'absolute', top: '4%', height: '94%', borderRadius: 16 },
});

export default TaxiHeroBanner;
