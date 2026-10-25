// Web: modules/Food/components/ui/dot-pattern.tsx. Same export and props (width / height spacing, x / y offset,
// cx / cy / cr dot position and radius, glow). Fills its parent (absolute inset-0, pointer-events none); the dot
// colour is the web's text colour (fill-current) and comes in `color` (default: the text colour of the theme).
// glow: each dot pulses opacity 0.3 -> 1 and radius cr -> 1.5cr with a random 1-3s duration / 0-2s delay.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function GlowDot({ x, y, cr, delay, duration, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const half = (duration * 1000) / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay * 1000);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [v, delay, duration]);
  return (
    <AnimatedCircle
      cx={x}
      cy={y}
      fill={color}
      r={v.interpolate({ inputRange: [0, 1], outputRange: [cr, cr * 1.5] })}
      opacity={v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] })}
    />
  );
}

let patternSeq = 0;

export function DotPattern({ width = 16, height = 16, x = 0, y = 0, cx = 1, cy = 1, cr = 1, style, color, glow = false, opacity }) {
  const t = useTheme();
  const idRef = useRef(null);
  if (idRef.current == null) idRef.current = `dot-pattern-${++patternSeq}`;
  const id = idRef.current;
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const fill = color || t.text;

  const dots = useMemo(() => {
    if (!glow || dimensions.width === 0 || dimensions.height === 0) return [];
    const rows = Math.ceil(dimensions.height / height);
    const cols = Math.ceil(dimensions.width / width);
    const out = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        out.push({ x: x + j * width + cx, y: y + i * height + cy, delay: Math.random() * 2, duration: 1 + Math.random() * 2 });
      }
    }
    return out;
  }, [dimensions, width, height, x, y, cx, cy, glow]);

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, opacity != null && { opacity }, style]}
      onLayout={(e) => setDimensions({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {dimensions.width > 0 ? (
        <Svg width="100%" height="100%">
          {glow ? (
            dots.map((dot, index) => (
              <GlowDot key={`${dot.x}-${dot.y}-${index}`} x={dot.x} y={dot.y} cr={cr} delay={dot.delay} duration={dot.duration} color={fill} />
            ))
          ) : (
            <>
              <Defs>
                <Pattern id={id} x={x} y={y} width={width} height={height} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse">
                  <Circle cx={cx} cy={cy} r={cr} fill={fill} />
                </Pattern>
              </Defs>
              <Rect width="100%" height="100%" fill={`url(#${id})`} />
            </>
          )}
        </Svg>
      ) : null}
    </View>
  );
}
