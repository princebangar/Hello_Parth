// Brand splash shown right after the native splash (the restaurant header's dark crimson + the Restaurant Partner
// wordmark), looking exactly like it at first. Then the wordmark grows and lifts (one slow eased move), a covered dish
// (cloche on a plate) in a soft warm spotlight fades in below it, and the tagline fades in under the dish. When the app
// is ready (and the entrance has finished) the cloche lifts off and fades in one smooth move, the steaming dish under it
// is revealed, and the splash fades out.
// Prince (27 Oct): the old counter band drew a line across the screen (it looked like a half-screen splash) - the scene
// is now free-floating and centred, with no line; and the wordmark grew in ~70 ms (it read as a jump) - it now grows
// over LIFT_MS with an ease-in start, so a UI-thread stall at its start skips almost nothing.
// Every animation runs on the native driver (UI thread): JS work behind the splash cannot stall it, UI-thread stalls can.
// Nothing moves during the entrance except the wordmark (fades only): the UI thread stalls at random moments while the
// app starts, and a part moving then jumped (Captain app, lesson 23).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

// white letters + the orange Hello: the wordmark made for the crimson background (assets/splash-wordmark-light.png,
// scripts/make-splash-wordmark.cjs)
const WORDMARK = require('../../assets/splash-wordmark-light.png'); // 900 x 262
// The native splash (assets/splash-icon-light.png, app.json imageWidth 240) draws this wordmark 635/1024 of 240 dp wide
// at the screen centre. This splash starts with the wordmark at exactly that size and place (nothing changes when it
// takes over), and the wordmark grows to the bigger size while it lifts. The entrance waits START_DELAY_MS so the
// native wordmark has faded out first (two wordmarks overlapping looked like a wiggle).
const WORDMARK_RATIO = 262 / 900;
const NATIVE_WORDMARK_W = (240 * 635) / 1024;
// the restaurant header's dark end (bg-gradient-to-br from-[#B80B3D] to-[#66001D]); app.json splash + window
// background use the same colour
export const SPLASH_BG = '#66001D';
const ORANGE = '#FF5A0A';
const WARM = '#FFD58A';
const ENTRANCE_MS = 1000; // scene and tagline fading in
const LIFT_MS = 900; // the wordmark growing + lifting
const START_DELAY_MS = 450; // the native splash fades out over ~300 ms: start after it
const EXIT_MS = 1100; // the cloche lifting off + the steam + the fade at its end
const EXIT_DELAY_MS = 250;
const SMOOTH_FRAMES = 4; // frames in a row, each under SMOOTH_FRAME_MS, before the wordmark starts to grow
const SMOOTH_FRAME_MS = 26;
const SMOOTH_MAX_WAIT_MS = 1200; // start anyway after this long
// Android does not draw a view at opacity 0, so the scene's SVGs and the tagline were first drawn (rasterised) the
// moment they started to fade in — a UI-thread stall in the middle of the wordmark's growth (it read as a jump).
// Starting them at PRE (invisible on screen) gets that first draw done while nothing moves yet.
const PRE = 0.004;
const MAX_WAIT_MS = 3000;

/** ready: the app can show its first screen. onShown: hide the native splash. onDone: unmount the splash. */
export function AnimatedSplash({ ready, onShown, onDone }) {
  const { width, height } = useWindowDimensions();
  // One native timeline for the whole entrance: Animated's `delay` / sequence steps are JS timers, and the JS thread is
  // busy mounting the app behind the splash, so delayed parts used to start late.
  const t = useRef(new Animated.Value(0)).current; // entrance 0 -> 1
  const lift = useRef(new Animated.Value(0)).current; // wordmark 0 (native size, centre) -> 1 (big, lifted)
  const exit = useRef(new Animated.Value(0)).current; // leave 0 -> 1 (cloche lifts, steam rises, splash fades)
  const [entered, setEntered] = useState(false);
  const leavingRef = useRef(false);

  // laid out at the final (lifted) size so the image stays sharp; scaled down to the native splash's size at the start
  const WORDMARK_W = Math.round(Math.min(264, width * 0.68));
  const WORDMARK_H = Math.round(WORDMARK_W * WORDMARK_RATIO);
  const startScale = NATIVE_WORDMARK_W / WORDMARK_W;
  // final wordmark centre ~34% down; the scene box (viewBox 200 x 130) centred ~59% down; tagline under the scene
  const LIFT_Y = Math.min(150, height * 0.16);
  const BW = Math.round(Math.min(width * 0.8, 320));
  const BH = Math.round((BW * 130) / 200);
  const sceneTop = height * 0.59 - BH / 2;
  const taglineTop = sceneTop + BH + 10;

  // Hide the native splash only once this one has been laid out and drawn: hiding it on mount left a frame or two of
  // bare background (the wordmark blinked out) before the first JS frame reached the screen.
  const shownRef = useRef(false);
  const handleLayout = () => {
    if (shownRef.current) return;
    shownRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      onShown?.();
      shownAtRef.current = Date.now();
      setShown(true);
    }));
  };

  // The entrance starts START_DELAY_MS after this splash replaced the native one, once `ready`, and only when frames are
  // coming smoothly again (SMOOTH_FRAMES in a row; at most SMOOTH_MAX_WAIT_MS of waiting).
  // Prince (27 Oct): started on a timer alone, the wordmark's first ~0.3 s of growth was lost to the UI-thread stall
  // of the app tree mounting behind the splash (it read as a jump); after it has mounted, the move is smooth.
  const startRef = useRef(null);
  const [shown, setShown] = useState(false);
  const shownAtRef = useRef(0);
  useEffect(() => {
    if (!shown || !ready) return undefined;
    let cancelled = false;
    let raf = 0;
    const waitForSmoothFrames = () => {
      const since = Date.now();
      let last = since;
      let smooth = 0;
      const tick = () => {
        if (cancelled) return;
        const now = Date.now();
        smooth = now - last < SMOOTH_FRAME_MS ? smooth + 1 : 0;
        last = now;
        if (smooth >= SMOOTH_FRAMES || now - since > SMOOTH_MAX_WAIT_MS) startRef.current?.(0);
        else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(waitForSmoothFrames, Math.max(0, START_DELAY_MS - (Date.now() - shownAtRef.current)));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [shown, ready]);
  useEffect(() => {
    let started = false;
    const timers = [];
    const start = (delay = 0) => {
      if (started) return;
      started = true;
      timers.push(
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(lift, { toValue: 1, duration: LIFT_MS, easing: Easing.bezier(0.42, 0, 0.2, 1), useNativeDriver: true }),
            Animated.timing(t, { toValue: 1, duration: ENTRANCE_MS, easing: Easing.linear, useNativeDriver: true }),
          ]).start(() => setEntered(true));
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
  // finish mounting first, so the cloche's lift does not stall half-way
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

  // parts of the entrance, as slices of the timeline (eased by the interpolation points); the scene only fades
  const scene = t.interpolate({ inputRange: [0.3, 0.5, 0.7], outputRange: [PRE, 0.8, 1], extrapolate: 'clamp' });
  const tagline = t.interpolate({ inputRange: [0.6, 0.8, 1], outputRange: [PRE, 0.8, 1], extrapolate: 'clamp' });
  // The exit: ONE continuous move as the splash leaves (the UI thread is idle by then, so it is smooth). The cloche
  // lifts up, tilts away and fades (it never reaches the wordmark), the steam over the dish rises and shows, and the
  // splash fades at the end.
  const clocheY = exit.interpolate({ inputRange: [0, 0.12, 0.55, 1], outputRange: [0, -BH * 0.1, -BH * 0.38, -BH * 0.5] });
  const clocheTilt = exit.interpolate({ inputRange: [0, 0.55, 1], outputRange: ['0deg', '-12deg', '-16deg'] });
  const clocheFade = exit.interpolate({ inputRange: [0, 0.3, 0.62], outputRange: [1, 1, 0], extrapolate: 'clamp' });
  const steam = exit.interpolate({ inputRange: [0, 0.22, 0.45, 1], outputRange: [PRE, PRE, 0.95, 0.75], extrapolate: 'clamp' });
  const steamY = exit.interpolate({ inputRange: [0.2, 1], outputRange: [6, -16], extrapolate: 'clamp' });
  const glow = exit.interpolate({ inputRange: [0, 0.4, 1], outputRange: [PRE, 0.55, 0.4] });
  const fade = exit.interpolate({ inputRange: [0, 0.74, 1], outputRange: [1, 1, 0] });

  const box = { position: 'absolute', left: (width - BW) / 2, top: sceneTop, width: BW, height: BH };

  return (
    <Animated.View
      pointerEvents={entered && ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}
      onLayout={handleLayout}
    >
      <StatusBar style="light" />

      {/* warm spotlight + plate with the dish (fade in) */}
      <Animated.View pointerEvents="none" style={[box, { opacity: scene }]}>
        <Svg width={BW} height={BH} viewBox="0 0 200 130">
          {/* soft round spotlight behind the dish (no edge, no line) */}
          <Circle cx="100" cy="74" r="62" fill={WARM} opacity={0.05} />
          <Circle cx="100" cy="74" r="48" fill={WARM} opacity={0.06} />
          <Circle cx="100" cy="74" r="34" fill={WARM} opacity={0.07} />
          {/* plate + its shadow */}
          <Ellipse cx="100" cy="108" rx="54" ry="5" fill="#000000" opacity={0.22} />
          <Ellipse cx="100" cy="102" rx="50" ry="6" fill="#F1F5F9" />
          <Ellipse cx="100" cy="103.3" rx="40" ry="3.2" fill="#CBD5E1" />
          {/* the dish under the cloche: rice / curry mound with a little garnish */}
          <Path d="M70 100 Q72 76 100 74 Q128 76 130 100 Z" fill="#F59E0B" />
          <Path d="M76 100 Q80 84 100 82 Q120 84 124 100 Z" fill="#FBBF24" />
          <Circle cx="92" cy="82" r="2.6" fill="#16A34A" />
          <Circle cx="106" cy="80" r="2.2" fill="#DC2626" />
          <Circle cx="113" cy="86" r="2.4" fill="#16A34A" />
        </Svg>
      </Animated.View>

      {/* warm light + steam over the revealed dish (exit) */}
      <Animated.View pointerEvents="none" style={[box, { opacity: glow }]}>
        <Svg width={BW} height={BH} viewBox="0 0 200 130">
          <Ellipse cx="100" cy="82" rx="46" ry="28" fill={WARM} opacity={0.35} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[box, { opacity: steam, transform: [{ translateY: steamY }] }]}>
        <Svg width={BW} height={BH} viewBox="0 0 200 130">
          {[86, 100, 114].map((x) => (
            <Path
              key={x}
              d={`M${x} 70 q-6 -7 0 -14 q6 -7 0 -14 q-6 -7 0 -14`}
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </Svg>
      </Animated.View>

      {/* the cloche (dish cover): fades in with the scene, lifts off and fades as the splash leaves */}
      <Animated.View pointerEvents="none" style={[box, { opacity: scene }]}>
        <Animated.View style={{ opacity: clocheFade, transform: [{ translateY: clocheY }, { rotate: clocheTilt }] }}>
          <Svg width={BW} height={BH} viewBox="0 0 200 130">
            <Path d="M56 100 Q56 56 100 53 Q144 56 144 100 Z" fill="#E2E8F0" />
            <Path d="M66 94 Q68 66 92 60" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" fill="none" opacity={0.9} />
            <Rect x="51" y="97" width="98" height="6" rx="3" fill="#CBD5E1" />
            <Rect x="96" y="45" width="8" height="9" rx="2" fill="#CBD5E1" />
            <Circle cx="100" cy="44" r="5" fill="#E2E8F0" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* wordmark: exactly where the native splash drew it, then grows while it lifts */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.center,
          {
            top: height / 2 - WORDMARK_H / 2,
            transform: [
              { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT_Y] }) },
              { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [startScale, 1] }) },
            ],
          },
        ]}
      >
        <Image source={WORDMARK} style={{ width: WORDMARK_W, height: WORDMARK_H }} fadeDuration={0} />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.center, { top: taglineTop, opacity: tagline }]}>
        <View style={styles.taglineRow}>
          <View style={styles.dot} />
          <Text allowFontScaling={false} style={styles.tagline}>
            COOK · SERVE · GROW
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
  taglineRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ORANGE, marginHorizontal: 8 },
  tagline: { fontSize: 12, fontWeight: '800', letterSpacing: 2.4, color: 'rgba(255,255,255,0.85)', includeFontPadding: false },
});
