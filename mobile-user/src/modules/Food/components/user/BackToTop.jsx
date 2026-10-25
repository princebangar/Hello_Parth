// Web: modules/Food/components/user/BackToTop.jsx — "Back to top" pill on the Food home: appears after a sustained
// 600px scroll-up while deeper than 2500px, hides near the top (< 500px) or on scroll-down; tapping it zips the list
// up 1000px in 250ms (ease-out) and then snaps to the top. Spring in/out like the web's framer-motion.
// The web read window.scrollY; here the Home list's offset comes from browseScrollMemory (Home registers its list
// there and reports its offset), and the scroll-to-top goes to that same list.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowUp } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { alpha, shadow, useTheme } from '@/theme';
import { getBrowseScrollY, restoreBrowseScroll } from '@food/utils/browseScrollMemory';

const HOME_PATH = '/food/user';

export default function BackToTop() {
  const t = useTheme();
  const [show, setShow] = useState(false);
  const [rendered, setRendered] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const lastScrollYRef = useRef(0);
  const accumulatorRef = useRef(0);
  const isAutoScrollingRef = useRef(false);
  const pauseTimerRef = useRef(null);

  useEffect(() => {
    const handleScroll = (currentScrollY) => {
      // Near top -> always hide and reset
      if (currentScrollY < 500) {
        setShow(false);
        isAutoScrollingRef.current = false;
        accumulatorRef.current = 0;
        lastScrollYRef.current = currentScrollY;
        clearTimeout(pauseTimerRef.current);
        return;
      }

      // Auto-scrolling in progress -> skip all logic
      if (isAutoScrollingRef.current) {
        lastScrollYRef.current = currentScrollY;
        return;
      }

      const delta = lastScrollYRef.current - currentScrollY; // positive = scrolling up

      if (currentScrollY > 2500) {
        if (delta > 0) {
          accumulatorRef.current += delta;
          // If the user pauses scrolling for 200ms, reset the accumulator.
          clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = setTimeout(() => {
            accumulatorRef.current = 0;
          }, 200);
          // Show ONLY after 600px of continuous, uninterrupted scroll-up.
          if (accumulatorRef.current > 600) setShow(true);
        } else {
          clearTimeout(pauseTimerRef.current);
          accumulatorRef.current = 0;
          if (Math.abs(delta) > 10) setShow(false);
        }
      } else {
        setShow(false);
        accumulatorRef.current = 0;
      }

      lastScrollYRef.current = currentScrollY;
    };

    // The Home list reports its offset; sample it like scroll events.
    const timer = setInterval(() => {
      const y = getBrowseScrollY(HOME_PATH);
      if (y !== lastScrollYRef.current) handleScroll(y);
    }, 50);
    return () => {
      clearInterval(timer);
      clearTimeout(pauseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (show) setRendered(true);
    Animated.spring(anim, { toValue: show ? 1 : 0, stiffness: 260, damping: 20, mass: 0.5, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !show) setRendered(false);
    });
  }, [show, anim]);

  const scrollToTop = useCallback(() => {
    isAutoScrollingRef.current = true;
    accumulatorRef.current = 0;
    setShow(false);

    // "Warped" scroll: zip up 1000px then snap to top
    const startY = getBrowseScrollY(HOME_PATH);
    const startTime = Date.now();
    const warpDistance = 1000;
    const duration = 250;

    const step = () => {
      const progress = Math.min((Date.now() - startTime) / duration, 1);
      const easeOutQuad = progress * (2 - progress);
      const travel = warpDistance * easeOutQuad;
      if (progress < 1) {
        restoreBrowseScroll({ path: HOME_PATH, scrollY: Math.max(0, startY - travel) }, { retries: 1 });
        requestAnimationFrame(step);
      } else {
        restoreBrowseScroll({ path: HOME_PATH, scrollY: 0 }, { retries: 3 });
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 50);
      }
    };
    requestAnimationFrame(step);
  }, []);

  if (!rendered) return null;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Animated.View
        style={{
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [show ? -40 : -20, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
          ],
        }}
      >
        <Pressable onPress={scrollToTop} style={({ pressed }) => [styles.pill, pressed && { transform: [{ scale: 0.95 }] }]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', t.dark ? 0.8 : 0.6) }]} />
          <ArrowUp size={14} strokeWidth={3} color="#ffffff" />
          <Text style={styles.label}>Back to top</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // fixed top-80 (320px) left-1/2 -translate-x-1/2 z-[60]
  layer: { position: 'absolute', top: 320, left: 0, right: 0, alignItems: 'center', zIndex: 60, elevation: 60 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: alpha('#ffffff', 0.2),
    overflow: 'hidden',
    ...shadow.lg,
  },
  label: { color: '#ffffff', fontWeight: '500', fontSize: 11, lineHeight: 16 },
});
