// Brand splash shown right after the native splash (plain Taxi navy #0B172A, the colour of the Taxi home header —
// the user app opens on Taxi). Text only, Zomato-style: the wordmark of the app logo written out — "Hello" in the logo
// orange with its smile under "llo", "Parth" in white (the logo's navy would not show on navy) — and the logo's tagline.
// "Hello" slides in from the left, "Parth" from the right, the smile draws itself, the tagline fades up; once the app
// is ready the splash zooms and fades away.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Svg, { Path } from 'react-native-svg';

const NAVY = '#0B172A'; // SUPER_APP_VERTICAL_THEME.taxi.theme (Taxi home header)
const NAVY_LIGHT = '#12305E';
const BLUE = '#2563EB'; // SUPER_APP_VERTICAL_THEME.taxi.activeTab
const ORANGE = '#FF4A06'; // "Hello" + smile + tagline dots in "User Apk Logo.png"
const MIN_VISIBLE_MS = 1900; // long enough for the whole entrance

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Only the two weights the splash needs, loaded first (the app's full font set loads behind the splash).
const SPLASH_FONTS = {
  Outfit_800ExtraBold: require('@expo-google-fonts/outfit/800ExtraBold/Outfit_800ExtraBold.ttf'),
  Outfit_500Medium: require('@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf'),
};

/** ready: the app can show its first screen. onShown: hide the native splash. onDone: unmount the splash. */
export function AnimatedSplash({ ready, onShown, onDone }) {
  const [fontsLoaded, fontError] = useFonts(SPLASH_FONTS);
  const fontsReady = fontsLoaded || Boolean(fontError);
  const { width } = useWindowDimensions();
  const fontSize = Math.min(58, Math.round(width * 0.135));

  const hello = useRef(new Animated.Value(0)).current;
  const parth = useRef(new Animated.Value(0)).current;
  const smile = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const shownAt = useRef(0);
  const [helloWidth, setHelloWidth] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // start once the splash font is there (until then the native splash, same navy, stays up)
  useEffect(() => {
    if (!fontsReady) return;
    shownAt.current = Date.now();
    onShown?.();
    Animated.sequence([
      Animated.stagger(140, [
        Animated.spring(hello, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.spring(parth, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ]),
      Animated.timing(smile, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(tagline, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, when the font is ready
  }, [fontsReady]);

  useEffect(() => {
    if (!ready || !fontsReady || leaving) return undefined;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const t = setTimeout(() => {
      setLeaving(true);
      Animated.timing(exit, { toValue: 1, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onDone?.());
    }, wait);
    return () => clearTimeout(t);
  }, [ready, fontsReady, leaving, exit, onDone]);

  // the smile sits under "llo" (about 30%–67% of the "Hello" width in the logo)
  const smileW = helloWidth * 0.4;
  const smileH = fontSize * 0.26;
  const smileLen = smileW * 1.25;
  const lineW = tagline.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      <StatusBar style="light" />
      <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.glow, { width: width * 1.1, height: width * 1.1, borderRadius: width * 0.55, opacity: 0.08 }]} />
      <View pointerEvents="none" style={[styles.glow, { width: width * 0.7, height: width * 0.7, borderRadius: width * 0.35, opacity: 0.1 }]} />

      {fontsReady ? (
        <Animated.View
          style={{
            alignItems: 'center',
            transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
          }}
        >
          <View style={styles.wordmark}>
            <View>
              <Animated.View
                style={{
                  opacity: hello,
                  transform: [{ translateX: hello.interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }) }],
                }}
              >
                <Text
                  allowFontScaling={false}
                  onLayout={(e) => setHelloWidth(e.nativeEvent.layout.width)}
                  style={[styles.word, { fontSize, lineHeight: fontSize * 1.15, color: ORANGE }]}
                >
                  Hello
                </Text>
              </Animated.View>
              {helloWidth > 0 ? (
                <Svg
                  width={smileW}
                  height={smileH + 6}
                  style={{ position: 'absolute', left: helloWidth * 0.29, top: fontSize * 1.02 }}
                >
                  <AnimatedPath
                    d={`M3 3 Q ${smileW / 2} ${smileH * 2.05} ${smileW - 3} 3`}
                    stroke={ORANGE}
                    strokeWidth={Math.max(4, fontSize * 0.1)}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={`${smileLen}, ${smileLen}`}
                    strokeDashoffset={smile.interpolate({ inputRange: [0, 1], outputRange: [smileLen, 0] })}
                  />
                </Svg>
              ) : null}
            </View>
            <Animated.View
              style={{
                opacity: parth,
                transform: [{ translateX: parth.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
              }}
            >
              <Text allowFontScaling={false} style={[styles.word, { fontSize, lineHeight: fontSize * 1.15, color: '#FFFFFF' }]}>
                Parth
              </Text>
            </Animated.View>
          </View>

          <Animated.View
            style={[
              styles.taglineRow,
              {
                marginTop: fontSize * 0.42,
                opacity: tagline,
                transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
              },
            ]}
          >
            <Animated.View style={[styles.line, { width: lineW }]} />
            <View style={styles.dotEnd} />
            <Text allowFontScaling={false} style={[styles.tagline, { fontSize: Math.max(13, fontSize * 0.29) }]}>
              Taxi & Food Delivery Services
            </Text>
            <View style={styles.dotEnd} />
            <Animated.View style={[styles.line, { width: lineW }]} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', backgroundColor: NAVY, zIndex: 10000, elevation: 10000 },
  glow: { position: 'absolute', backgroundColor: BLUE },
  wordmark: { flexDirection: 'row', alignItems: 'flex-start' },
  word: { fontFamily: 'Outfit_800ExtraBold', letterSpacing: -0.5, includeFontPadding: false },
  taglineRow: { flexDirection: 'row', alignItems: 'center' },
  line: { height: 2, borderRadius: 1, backgroundColor: ORANGE },
  dotEnd: { width: 6, height: 6, borderRadius: 3, backgroundColor: ORANGE, marginHorizontal: 6 },
  tagline: { fontFamily: 'Outfit_500Medium', color: 'rgba(255,255,255,0.88)', letterSpacing: 0.2, includeFontPadding: false },
});
