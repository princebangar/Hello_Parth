// canvas-confetti replacement: <Confetti fire={n} /> bursts once every time `fire` changes (and is truthy).
// Same feel as the web's confetti({ particleCount, spread, origin }): pieces shoot up from `origin` and fall.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const DEFAULT_COLORS = ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'];

function Piece({ color, startX, startY, dx, dy, rotate, delay, duration, size }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t, duration, delay]);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  // up first, then gravity pulls it below the start point
  const translateY = t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, dy, dy + 420] });
  const rot = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${rotate}deg`] });
  const opacity = t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: startY,
        width: size,
        height: size * 0.6,
        backgroundColor: color,
        borderRadius: 1,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate: rot }],
      }}
    />
  );
}

export function Confetti({ fire, particleCount = 120, spread = 70, origin = { x: 0.5, y: 0.6 }, colors = DEFAULT_COLORS, duration = 2200 }) {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (fire) setBurst((b) => b + 1);
  }, [fire]);
  useEffect(() => {
    if (!burst) return undefined;
    const id = setTimeout(() => setBurst(0), duration + 400);
    return () => clearTimeout(id);
  }, [burst, duration]);
  const pieces = useMemo(() => {
    if (!burst) return [];
    const { width, height } = Dimensions.get('window');
    const sx = width * origin.x;
    const sy = height * origin.y;
    return Array.from({ length: particleCount }, (_, i) => {
      const angle = ((-90 + (Math.random() - 0.5) * spread * 2) * Math.PI) / 180;
      const power = 180 + Math.random() * 260;
      return {
        key: `${burst}-${i}`,
        color: colors[i % colors.length],
        startX: sx,
        startY: sy,
        dx: Math.cos(angle) * power,
        dy: Math.sin(angle) * power,
        rotate: (Math.random() - 0.5) * 1080,
        delay: Math.random() * 120,
        duration: duration * (0.7 + Math.random() * 0.3),
        size: 6 + Math.random() * 6,
      };
    });
  }, [burst, particleCount, spread, origin.x, origin.y, colors, duration]);
  if (!pieces.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(({ key, ...p }) => (
        <Piece key={key} {...p} />
      ))}
    </View>
  );
}
