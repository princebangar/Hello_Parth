// Native only (copy of the delivery app's MapLoadingOverlay, Prince 26 Oct): covers the Home map until Google Maps has
// drawn its first tiles (onMapLoaded). A new native map view is
// black until then, which looked like a broken screen. A soft street grid, a pulsing location pin and "Loading Map"
// with animated dots; it fades out once the map is on screen. (The scooter riding across was removed: Prince, 26 Oct.)
// Every animation runs on the native driver, so it keeps moving while the JS thread is busy building the screen.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from '@/native/ui';
import { fonts } from '@/theme';

const ORANGE = '#FF4A06';

export default function MapLoadingOverlay({ loaded, accent = '#2563EB', subtitle = 'Finding your location' }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const dots = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounce, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(bounce, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(Animated.timing(dots, { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pulse, bounce, dots]);

  useEffect(() => {
    if (!loaded) return;
    Animated.timing(fade, { toValue: 0, duration: 350, delay: 120, useNativeDriver: true }).start(() => setGone(true));
  }, [loaded, fade]);

  if (gone) return null;

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.12, 0] });
  const pinY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const shadowScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });

  return (
    <Animated.View pointerEvents={loaded ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      {/* soft street grid */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        {Array.from({ length: 14 }).map((_, i) => (
          <Rect key={`h${i}`} x="0" y={i * 70 + 20} width="100%" height={i % 3 === 0 ? 10 : 4} fill="#FFFFFF" opacity={0.9} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <Rect key={`v${i}`} x={i * 64 + 10} y="0" width={i % 2 === 0 ? 8 : 4} height="100%" fill="#FFFFFF" opacity={0.9} />
        ))}
      </Svg>

      <View style={styles.center}>
        <View style={styles.pinArea}>
          <Animated.View style={[styles.ring, { backgroundColor: accent, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
          <Animated.View style={[styles.pinShadow, { transform: [{ scaleX: shadowScale }] }]} />
          <Animated.View style={{ transform: [{ translateY: pinY }] }}>
            <Svg width={44} height={56} viewBox="0 0 44 56">
              <Path d="M22 2 C11 2 3 10.5 3 21 C3 35 22 54 22 54 C22 54 41 35 41 21 C41 10.5 33 2 22 2 Z" fill={accent} />
              <Circle cx="22" cy="21" r="8" fill="#FFFFFF" />
              <Circle cx="22" cy="21" r="4" fill={ORANGE} />
            </Svg>
          </Animated.View>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Loading Map</Text>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: accent },
                { opacity: dots.interpolate({ inputRange: [i, i + 0.5, i + 1, 3], outputRange: [0.25, 1, 0.25, 0.25], extrapolate: 'clamp' }) },
              ]}
            />
          ))}
        </View>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#E9EFF8', zIndex: 5, elevation: 5, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  pinArea: { width: 120, height: 110, alignItems: 'center', justifyContent: 'flex-end' },
  ring: { position: 'absolute', bottom: 2, width: 90, height: 90, borderRadius: 45 },
  pinShadow: { position: 'absolute', bottom: 0, width: 26, height: 8, borderRadius: 13, backgroundColor: 'rgba(15,23,36,0.22)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  title: { fontFamily: fonts.sora, fontWeight: '700', fontSize: 18, color: '#0F172A', letterSpacing: 0.2 },
  dot: { width: 6, height: 6, borderRadius: 3, marginLeft: 5, marginTop: 4 },
  sub: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#64748B' },
});
