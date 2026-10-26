// Brand splash shown right after the native splash (the driver header's dark blue, the Captain wordmark in the middle). The first frame is the
// native splash exactly (same wordmark, same size, same place), so the hand-over is invisible. Then the wordmark lifts,
// a city skyline and a road fade in below it, and the tagline fades up. When
// the app is ready (and the entrance has finished) a taxi drives across from left to right and the splash fades out.
// Every animation runs on the native driver (UI thread): JS work behind the splash cannot stall it, UI-thread stalls can.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// white letters + the orange Hello: the wordmark made for the blue background (assets/splash-wordmark-light.png)
const WORDMARK = require('../../assets/splash-wordmark-light.png'); // 900 x 317
const WORDMARK_W = 149; // dp: app.json splash imageWidth 240 x 0.62 (the wordmark's share of assets/splash-icon.png)
const WORDMARK_H = Math.round((WORDMARK_W * 317) / 900);
const NAVY = '#0B172A';
// the driver top bar's dark end (driverTheme.chromeFrom); app.json splash + window background use the same colour
export const SPLASH_BG = '#12348C';
const ORANGE = '#FF4A06';
const SKY = 'rgba(255,255,255,0.10)';
const CITY = 'rgba(255,255,255,0.16)';
const CITY_FAR = 'rgba(255,255,255,0.08)';
const ENTRANCE_MS = 600; // wordmark lift + city and tagline fading in
const START_DELAY_MS = 450; // the native splash fades out over ~300 ms: start after it (two wordmarks overlapped)
const EXIT_MS = 1150; // the taxi crossing the screen + the fade at its end
const EXIT_DELAY_MS = 250;
const MAX_WAIT_MS = 2500;

/** ready: the app can show its first screen. onShown: hide the native splash. onDone: unmount the splash. */
export function AnimatedSplash({ ready, onShown, onDone }) {
  const { width, height } = useWindowDimensions();
  // One native timeline for the whole entrance: Animated's `delay` / sequence steps are JS timers, and the JS thread is
  // busy mounting the app behind the splash, so delayed parts used to start late (the taxi never showed).
  const t = useRef(new Animated.Value(0)).current; // entrance 0 -> 1
  const exit = useRef(new Animated.Value(0)).current; // leave 0 -> 1 (taxi drives off, splash fades)
  const [entered, setEntered] = useState(false);
  const leavingRef = useRef(false);

  const carW = Math.min(150, width * 0.38);
  const carH = carW * 0.5;
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
  // finish mounting first, so the taxi's drive across does not stall half-way
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
  // The taxi drives across in ONE pass, left to right, as the splash leaves: at app start the UI thread stalls at
  // unpredictable moments (root view, first screen, Google Play services), so a taxi driving in then raced or jumped;
  // when the app is ready it is idle and the drive is smooth. Until then it waits off screen on the left.
  const carX = exit.interpolate({ inputRange: [0, 1], outputRange: [-carW - 20, width + 20] });
  const wheelSpin = exit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1440deg'] });
  const wheelR = carW * 0.085;
  // the splash stays while the taxi crosses, then fades out as it leaves the screen
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

      {/* the taxi */}
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
        <Svg width={carW} height={carH} viewBox="0 0 160 80">
          {/* body */}
          <Path d="M8 52 Q8 40 20 38 L42 36 L58 18 Q62 14 70 14 H104 Q112 14 116 20 L128 36 L146 40 Q154 42 154 52 V60 Q154 64 150 64 H12 Q8 64 8 60 Z" fill="#FFC400" />
          {/* windows */}
          <Path d="M50 36 L62 21 Q64 19 68 19 H84 V36 Z" fill="#DCEBFF" />
          <Path d="M89 19 H103 Q107 19 109 22 L120 36 H89 Z" fill="#DCEBFF" />
          {/* roof sign */}
          <Rect x="70" y="5" width="28" height="10" rx="3" fill={NAVY} />
          <Rect x="74" y="8" width="20" height="4" rx="1.5" fill="#FFC400" />
          {/* checker stripe */}
          <Rect x="14" y="46" width="134" height="6" fill={NAVY} />
          {Array.from({ length: 11 }).map((_, i) => (
            <Rect key={i} x={16 + i * 12} y="46" width="6" height="3" fill="#FFC400" />
          ))}
          {/* lights */}
          <Rect x="146" y="44" width="7" height="6" rx="2" fill="#FFF3B0" />
          <Rect x="8" y="44" width="6" height="6" rx="2" fill={ORANGE} />
        </Svg>
        {[0.25, 0.75].map((cx) => (
          <Animated.View
            key={cx}
            style={{
              position: 'absolute',
              left: carW * cx - wheelR,
              top: carH * 0.8 - wheelR,
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

      {/* wordmark: starts exactly where the native splash drew it, then lifts */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.center,
          {
            top: height / 2 - WORDMARK_H / 2,
            transform: [
              { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.min(110, height * 0.13)] }) },
              { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
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
            DRIVE · EARN · GROW
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
  road: { height: 40, backgroundColor: '#0A1F5C', justifyContent: 'center', overflow: 'hidden' },
  roadDashes: { flexDirection: 'row' },
  dash: { width: 18, height: 3, borderRadius: 2, backgroundColor: '#F8FAFC', marginRight: 18, opacity: 0.85 },
  taglineRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ORANGE, marginHorizontal: 8 },
  tagline: { fontSize: 12, fontWeight: '800', letterSpacing: 2.4, color: 'rgba(255,255,255,0.85)', includeFontPadding: false },
});
