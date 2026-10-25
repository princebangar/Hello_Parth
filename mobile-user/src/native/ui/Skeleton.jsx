// Tailwind's animate-pulse block (the web's skeleton loaders).
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { alpha, colors, radius, useTheme } from '@/theme';

export function Skeleton({ width, height = 16, rounded = radius.md, style }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: rounded, backgroundColor: t.dark ? alpha('#ffffff', 0.1) : colors.gray[200], opacity },
        style,
      ]}
    />
  );
}
