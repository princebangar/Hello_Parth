// Web: modules/Food/components/user/TextReveal.jsx — hidden (opacity 0, translateY 20px) until the block is inside
// the viewport, then shown. The web checked on window scroll; here the block's position on screen is checked
// after layout and then a few times a second until it has been seen (pages scroll their own lists).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, View } from 'react-native';

export default function TextReveal({ children, style }) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  const checkVisibility = useCallback(() => {
    ref.current?.measureInWindow?.((x, y, w, h) => {
      const windowHeight = Dimensions.get('window').height;
      if (y < windowHeight && y + h > 0 && (w > 0 || h > 0)) setIsVisible(true);
    });
  }, []);

  useEffect(() => {
    if (isVisible) return undefined;
    const timer = setInterval(checkVisibility, 250);
    return () => clearInterval(timer);
  }, [isVisible, checkVisibility]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={checkVisibility}
      style={[style, { opacity: isVisible ? 1 : 0, transform: [{ translateY: isVisible ? 0 : 20 }] }]}
    >
      {children}
    </View>
  );
}
