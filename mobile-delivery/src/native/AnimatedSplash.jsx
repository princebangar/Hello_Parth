// Brand splash shown right after the native splash (the delivery header's blue + the Delivery Partner wordmark), looking
// exactly like it at first. Then the wordmark grows and lifts,
// a city skyline and a road fade in below it, and the tagline fades up. When
// the app is ready (and the entrance has finished) a delivery scooter (rider + food box) rides across from left to right
// and the splash fades out.
// Every animation runs on the native driver (UI thread): JS work behind the splash cannot stall it, UI-thread stalls can.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// white letters + the orange Hello: the wordmark made for the blue background (assets/splash-wordmark-light.png,
// scripts/make-splash-wordmark.cjs)
const WORDMARK = require('../../assets/splash-wordmark-light.png'); // 900 x 269
// The native splash (assets/splash-icon-light.png, app.json imageWidth 240) draws this wordmark 635/1024 of 240 dp wide
// at the screen centre. This splash starts with the wordmark at exactly that size and place (nothing changes when it
// takes over), and the wordmark grows to the bigger size while it lifts (Prince, 26 Oct). The old "wiggle" was the native
// wordmark still fading out while this one already moved: the entrance waits START_DELAY_MS.
const WORDMARK_RATIO = 269 / 900;
const NATIVE_WORDMARK_W = (240 * 635) / 1024;
// the delivery header's blue (deliveryTheme.headerFrom, --dv-primary); app.json splash + window background use the same colour
export const SPLASH_BG = '#15498B';
const ORANGE = '#FF4A06';
const SKY = 'rgba(255,255,255,0.10)';
const CITY = 'rgba(255,255,255,0.16)';
const CITY_FAR = 'rgba(255,255,255,0.08)';
const ENTRANCE_MS = 600; // wordmark lift + city and tagline fading in
const START_DELAY_MS = 450; // the native splash fades out over ~300 ms: start after it (two wordmarks overlapped)
const EXIT_MS = 1150; // the scooter crossing the screen + the fade at its end
const EXIT_DELAY_MS = 250;
const MAX_WAIT_MS = 2500;

/** ready: the app can show its first screen. onShown: hide the native splash. onDone: unmount the splash. */
export function AnimatedSplash({ ready, onShown, onDone }) {
  const { width, height } = useWindowDimensions();
  // One native timeline for the whole entrance: Animated's `delay` / sequence steps are JS timers, and the JS thread is
  // busy mounting the app behind the splash, so delayed parts used to start late (the vehicle never showed).
  const t = useRef(new Animated.Value(0)).current; // entrance 0 -> 1
  const exit = useRef(new Animated.Value(0)).current; // leave 0 -> 1 (scooter rides off, splash fades)
  const [entered, setEntered] = useState(false);
  const leavingRef = useRef(false);

  // laid out at the final (lifted) size so the image stays sharp; scaled down to the native splash's size at the start
  const WORDMARK_W = Math.round(Math.min(264, width * 0.68));
  const WORDMARK_H = Math.round(WORDMARK_W * WORDMARK_RATIO);
  const startScale = NATIVE_WORDMARK_W / WORDMARK_W;
  const carW = Math.min(150, width * 0.38);
  const carH = carW * 0.625;
  const sceneH = Math.min(190, height * 0.24);

  // Hide the native splash only once this one has been laid out and drawn: hiding it on mount left a frame or two of
  // bare background (the wordmark blinked out) before the first JS frame reached the screen.
  const shownRef = useRef(false);
  const handleLayout = () => {
    if (shownRef.current) return;
    shownRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      onShown?.();
      startRef.current?.(START_DELAY_MS);
    }));
  };

  // The entrance starts START_DELAY_MS after this splash replaced the native one: right at that moment the UI thread is
  // still busy with the app's start (root view, first screens), and an entrance running then jumped or raced. Until
  // then the splash looks exactly like the native one (wordmark only). Not tied to the network or the first screen,
  // so it is the same every time.
  const startRef = useRef(null);
  useEffect(() => {
    let started = false;
    const timers = [];
    const start = (delay = 0) => {
      if (started) return;
      started = true;
      timers.push(
        setTimeout(() => {
          Animated.timing(t, { toValue: 1, duration: ENTRANCE_MS, easing: Easing.linear, useNativeDriver: true }).start(() => setEntered(true));
          timers.push(setTimeout(() => setEntered(true), ENTRANCE_MS + 400));
        }, delay),
      );
    };
    startRef.current = start;
    timers.push(setTimeout(() => start(0), MAX_WAIT_MS)); // never laid out (should not happen)
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);

  // leave once the entrance is complete and the app is ready; EXIT_DELAY_MS lets the first screen behind the splash
  // finish mounting first, so the scooter's ride across does not stall half-way
  // (onDone is a new function on every render of the root layout: read it from a ref so a re-render cannot cancel the
  // pending exit)
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (!ready || !entered || leavingRef.current) return;
    leavingRef.current = true;
    setTimeout(() => {
      Animated.timing(exit, { toValue: 1, duration: EXIT_MS, easing: Easing.linear, useNativeDriver: true }).start(() => onDoneRef.current?.());
    }, EXIT_DELAY_MS);
  }, [ready, entered, exit]);

  // parts of the entrance, as slices of the timeline (eased by the interpolation points)
  const lift = t.interpolate({ inputRange: [0.06, 0.2, 0.4], outputRange: [0, 0.75, 1], extrapolate: 'clamp' });
  const city = t.interpolate({ inputRange: [0.12, 0.3, 0.5], outputRange: [0, 0.8, 1], extrapolate: 'clamp' });
  const tagline = t.interpolate({ inputRange: [0.45, 0.75, 0.95], outputRange: [0, 0.8, 1], extrapolate: 'clamp' });
  // The scooter rides across in ONE pass, left to right, as the splash leaves: at app start the UI thread stalls at
  // unpredictable moments (root view, first screen, Google Play services), so a vehicle driving in then raced or jumped;
  // when the app is ready it is idle and the drive is smooth. Until then it waits off screen on the left.
  const carX = exit.interpolate({ inputRange: [0, 1], outputRange: [-carW - 20, width + 20] });
  const wheelSpin = exit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1440deg'] });
  const wheelR = carW * 0.085;
  // the splash stays while the scooter crosses, then fades out as it leaves the screen
  const fade = exit.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents={entered && ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}
      onLayout={handleLayout}
    >
      <StatusBar style="light" />

      {/* city + road, rising into the lower half */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scene,
          {
            height: sceneH + 40,
            top: height / 2 + 34,
            opacity: city,
            transform: [{ translateY: city.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          },
        ]}
      >
        <Svg width={width} height={sceneH} viewBox="0 0 400 190" preserveAspectRatio="none">
          <Path d="M0 190 V120 H30 V90 H60 V120 H80 V70 H115 V120 H140 V100 H170 V60 H200 V120 H225 V85 H260 V120 H290 V75 H320 V120 H345 V95 H375 V120 H400 V190 Z" fill={CITY_FAR} />
          <Path d="M0 190 V140 H22 V110 H48 V140 H70 V95 H98 V140 H128 V118 H150 V140 H178 V82 H206 V140 H236 V112 H262 V140 H292 V100 H318 V140 H346 V120 H372 V140 H400 V190 Z" fill={CITY} />
          <Rect x="0" y="176" width="400" height="14" fill={SKY} />
        </Svg>
        <View style={styles.road}>
          <View style={styles.roadDashes}>
            {Array.from({ length: Math.ceil(width / 36) }).map((_, i) => (
              <View key={i} style={styles.dash} />
            ))}
          </View>
        </View>
      </Animated.View>

      {/* the delivery scooter: rider + food box */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: height / 2 + 34 + sceneH - carH + 6,
          width: carW,
          height: carH,
          transform: [{ translateX: carX }],
        }}
      >
        <Svg width={carW} height={carH} viewBox="0 0 160 100">
          {/* food box on the back */}
          <Rect x="4" y="20" width="40" height="34" rx="5" fill={ORANGE} />
          <Rect x="4" y="20" width="40" height="8" rx="4" fill="#C93A00" />
          <Rect x="16" y="34" width="16" height="12" rx="3" fill="#FFFFFF" opacity={0.92} />
          <Rect x="14" y="53" width="22" height="5" fill="#1F2937" />
          {/* scooter: rear cowl, low floorboard, front apron */}
          <Path d="M14 74 Q14 58 30 57 H60 Q66 57 66 63 V69 H96 L104 42 H114 L120 45 L115 61 Q132 63 140 75 L141 80 H20 Q14 80 14 74 Z" fill="#FFC400" />
          <Path d="M104 42 H114 L120 45 L113 58 Z" fill="#E0A800" />
          {/* seat */}
          <Rect x="28" y="51" width="38" height="8" rx="4" fill="#1F2937" />
          {/* handlebar */}
          <Path d="M113 44 L121 22" stroke="#1F2937" strokeWidth="4" strokeLinecap="round" />
          <Path d="M115 21 H130" stroke="#1F2937" strokeWidth="4" strokeLinecap="round" />
          {/* lights */}
          <Rect x="134" y="64" width="7" height="6" rx="2" fill="#FFF3B0" />
          <Rect x="13" y="65" width="5" height="6" rx="2" fill="#EF4444" />
          {/* rider */}
          <Path d="M54 50 L82 53 L92 68" stroke="#0F172A" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M54 48 L66 23" stroke="#F8FAFC" strokeWidth="14" strokeLinecap="round" />
          <Path d="M67 28 L114 23" stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" />
          <Circle cx="70" cy="12" r="10" fill={ORANGE} />
          <Path d="M72 8 H81 Q82 14 78 16 H72 Z" fill="#0F172A" />
        </Svg>
        {[34 / 160, 122 / 160].map((cx) => (
          <Animated.View
            key={cx}
            style={{
              position: 'absolute',
              left: carW * cx - wheelR,
              top: carH * 0.82 - wheelR,
              width: wheelR * 2,
              height: wheelR * 2,
              transform: [{ rotate: wheelSpin }],
            }}
          >
            <Svg width={wheelR * 2} height={wheelR * 2} viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="10" fill="#1F2937" />
              <Circle cx="10" cy="10" r="4.5" fill="#CBD5E1" />
              <Rect x="9" y="1.5" width="2" height="5" fill="#CBD5E1" />
            </Svg>
          </Animated.View>
        ))}
      </Animated.View>

      {/* wordmark: exactly where the native splash drew it, then grows while it lifts */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.center,
          {
            top: height / 2 - WORDMARK_H / 2,
            transform: [
              { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.min(110, height * 0.13)] }) },
              { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [startScale, 1] }) },
            ],
          },
        ]}
      >
        <Image source={WORDMARK} style={{ width: WORDMARK_W, height: WORDMARK_H }} fadeDuration={0} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.center,
          {
            top: height / 2 - 6,
            opacity: tagline,
            transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
      >
        <View style={styles.taglineRow}>
          <View style={styles.dot} />
          <Text allowFontScaling={false} style={styles.tagline}>
            DELIVER · EARN · GROW
          </Text>
          <View style={styles.dot} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: SPLASH_BG, zIndex: 10000, elevation: 10000 },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  scene: { position: 'absolute', left: 0, right: 0 },
  road: { height: 40, backgroundColor: '#0D3263', justifyContent: 'center', overflow: 'hidden' },
  roadDashes: { flexDirection: 'row' },
  dash: { width: 18, height: 3, borderRadius: 2, backgroundColor: '#F8FAFC', marginRight: 18, opacity: 0.85 },
  taglineRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ORANGE, marginHorizontal: 8 },
  tagline: { fontSize: 12, fontWeight: '800', letterSpacing: 2.4, color: 'rgba(255,255,255,0.85)', includeFontPadding: false },
});
