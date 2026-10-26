// Web: modules/Food/components/ui/skeleton.tsx — rounded-[calc(var(--radius)-2px)] bg-slate-200/80 animate-pulse
// dark:bg-white/10. Same export; size, radius and colour overrides go in `style`.
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { alpha, colors, useTheme } from '@/theme';
import { uiRadius } from './tokens';

function Skeleton({ style, ...rest }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Tailwind animate-pulse: opacity 1 -> 0.5 -> 1 over 2s, forever
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
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...rest}
      style={[{ borderRadius: uiRadius.md, backgroundColor: t.dark ? alpha('#ffffff', 0.1) : alpha(colors.slate[200], 0.8) }, style, { opacity }]}
    />
  );
}

export { Skeleton };
