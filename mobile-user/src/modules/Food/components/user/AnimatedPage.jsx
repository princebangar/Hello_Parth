// Web: modules/Food/components/user/AnimatedPage.jsx — page entrance: fade in from opacity 0 and translateY(8px)
// to 0 over 120ms. In the app a page opening from a tap must be there at once: starting at opacity 0 showed an empty
// (blank / header-coloured) frame first. So pages appear instantly; `animate` keeps the web's entrance for a caller that
// wants it. className -> style.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

export default function AnimatedPage({ children, style, animate = false }) {
  if (!animate) return <View style={style}>{children}</View>;
  return <FadeInPage style={style}>{children}</FadeInPage>;
}

function FadeInPage({ children, style }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration: 120, easing: Easing.ease, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        style,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}
