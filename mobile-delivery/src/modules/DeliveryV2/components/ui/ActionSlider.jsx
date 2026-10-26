// Web: components/ui/ActionSlider.jsx — "Swipe to Confirm" slider (framer-motion drag on the handle). Same props, same
// thresholds (progress > 0.8 of the track, or a 150 px drag), same race lock (isAcceptingRef), reset on failure and when
// `disabled` turns on. Native: the handle is dragged with a PanResponder + Animated; `color` is the web's Tailwind class
// (bg-green-600 ...) mapped to the delivery theme colour it showed (green / orange / blue 500-600 -> #15498B).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { colors, deliveryTheme, fonts } from '@/theme';

const HANDLE = 56; // w-14
const PAD = 6; // p-1.5
const HEIGHT = 68;

const FILL_BY_CLASS = {
  'bg-green-600': deliveryTheme.primary,
  'bg-green-500': deliveryTheme.primary,
  'bg-orange-500': deliveryTheme.primary,
  'bg-orange-600': deliveryTheme.primary,
  'bg-blue-600': deliveryTheme.primary,
  'bg-blue-500': deliveryTheme.primary,
  'bg-black': colors.black,
  'bg-gray-900': colors.gray[900],
  'bg-gray-950': colors.gray[950],
};
const fillColorFor = (color) => FILL_BY_CLASS[String(color || '').trim()] || (String(color || '').startsWith('#') ? color : deliveryTheme.primary);

export const ActionSlider = ({
  label = 'Slide to Confirm',
  onConfirm,
  disabled = false,
  color = 'bg-green-600',
  successLabel = 'Confirmed ✓',
}) => {
  const [progress, setProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current; // 0..1 of the track
  const successAnim = useRef(new Animated.Value(0)).current;
  // Atomic lock: prevents double-fire when user slides rapidly or two people slide at the same time
  const isAcceptingRef = useRef(false);
  const stateRef = useRef({});
  stateRef.current = { disabled, isSuccess, width, progress, onConfirm };
  const startXRef = useRef(0);

  // Reset when disabled state changes (e.g. order was claimed by another - parent sets disabled=true)
  useEffect(() => {
    if (disabled) {
      setProgress(0);
      setIsSuccess(false);
      isAcceptingRef.current = false;
      x.setValue(0);
      fill.setValue(0);
    }
  }, [disabled, x, fill]);

  useEffect(() => {
    Animated.spring(successAnim, { toValue: isSuccess ? 1 : 0, stiffness: 300, damping: 30, useNativeDriver: true }).start();
  }, [isSuccess, successAnim]);

  const resetHandle = () => {
    Animated.spring(x, { toValue: 0, stiffness: 300, damping: 30, useNativeDriver: false }).start();
    Animated.spring(fill, { toValue: 0, stiffness: 300, damping: 30, useNativeDriver: false }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          const s = stateRef.current;
          return !(s.disabled || s.isSuccess || isAcceptingRef.current);
        },
        onMoveShouldSetPanResponder: (_e, g) => {
          const s = stateRef.current;
          return !(s.disabled || s.isSuccess || isAcceptingRef.current) && Math.abs(g.dx) > Math.abs(g.dy);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          // the finger's x inside the track (web: info.point.x - track left)
          startXRef.current = PAD + (e.nativeEvent.locationX || 0);
        },
        onPanResponderMove: (_e, g) => {
          const s = stateRef.current;
          if (s.disabled || s.isSuccess || isAcceptingRef.current) return;
          const containerWidth = s.width || 300;
          const maxX = containerWidth ? containerWidth - HEIGHT : 250; // dragConstraints right
          x.setValue(Math.min(maxX, Math.max(0, g.dx)));
          const totalPath = containerWidth - HANDLE - 12;
          const currentProgress = Math.min(1, Math.max(0, (startXRef.current + g.dx) / totalPath));
          fill.setValue(currentProgress);
          setProgress(currentProgress);
        },
        onPanResponderRelease: async (_e, g) => {
          const s = stateRef.current;
          if (s.disabled || s.isSuccess || isAcceptingRef.current) return;
          const containerWidth = s.width || 300;
          const totalPath = containerWidth - HANDLE - 12;
          const finalProgress = Math.min(1, Math.max(0, (startXRef.current + g.dx) / totalPath));
          if (finalProgress > 0.8 || g.dx > 150) {
            // Atomically lock BEFORE any async work to prevent race conditions
            isAcceptingRef.current = true;
            setIsSuccess(true);
            setProgress(1);
            Animated.spring(fill, { toValue: 1, stiffness: 300, damping: 30, useNativeDriver: false }).start();
            if (s.onConfirm) {
              try {
                await s.onConfirm();
              } catch (error) {
                // On failure, reset so the delivery boy can retry
                isAcceptingRef.current = false;
                setIsSuccess(false);
                setProgress(0);
                resetHandle();
              }
            }
          } else {
            setProgress(0);
            resetHandle();
          }
        },
        onPanResponderTerminate: () => {
          if (isAcceptingRef.current) return;
          setProgress(0);
          resetHandle();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const labelOpacity = isSuccess ? 0 : disabled ? 0.5 : Math.max(0, 1 - progress * 2.2);
  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Dynamic Progress Fill */}
      <Animated.View
        pointerEvents="none"
        style={[styles.fill, { backgroundColor: fillColorFor(color), width: fillWidth, opacity: disabled ? 0 : 1 }]}
      />

      {/* Context Label Text - fades out as progress increases during drag */}
      <View pointerEvents="none" style={[styles.labelWrap, { opacity: labelOpacity }]}>
        <Text style={styles.label} numberOfLines={1}>
          {disabled ? 'Action Locked' : label}
        </Text>
      </View>

      {/* Success View */}
      {isSuccess ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.labelWrap, { opacity: successAnim, transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}
        >
          <Text style={[styles.label, styles.successLabel]} numberOfLines={1}>
            {successLabel}
          </Text>
        </Animated.View>
      ) : null}

      {/* The Handle */}
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.handle,
          { backgroundColor: disabled ? colors.gray[200] : colors.white, transform: [{ translateX: x }] },
        ]}
      >
        <View style={isSuccess ? styles.iconSuccess : null}>
          <ChevronRight
            size={32}
            color={disabled ? colors.gray[400] : isSuccess ? deliveryTheme.primary : colors.gray[950]}
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    position: 'relative',
    width: '100%',
    height: HEIGHT,
    borderRadius: 9999,
    padding: PAD,
    overflow: 'hidden',
    backgroundColor: colors.gray[950],
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 9999 },
  labelWrap: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.white,
    fontFamily: fonts.sora,
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 12 * 0.16,
    textTransform: 'uppercase',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  successLabel: { fontSize: 14, lineHeight: 16, letterSpacing: 14 * 0.16 },
  handle: {
    width: HANDLE,
    height: HANDLE,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  iconSuccess: { transform: [{ scale: 1.1 }] },
});

export default ActionSlider;
