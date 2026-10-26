// Web: modules/Food/components/ui/switch.tsx — h-6 w-11 track (checked #16a34a, unchecked gray-200 / dark gray-800),
// 20px white thumb with shadow-lg sliding 20px in 300ms ease-in-out. Same props: checked, defaultChecked,
// onCheckedChange(next), disabled; `style` styles the track.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { colors, shadow, useTheme } from '@/theme';

function Switch({ checked, defaultChecked = false, onCheckedChange, disabled, style, thumbStyle, ...rest }) {
  const t = useTheme();
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const isOn = isControlled ? checked === true : inner;
  const anim = useRef(new Animated.Value(isOn ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: isOn ? 1 : 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: false }).start();
  }, [isOn, anim]);

  const { onPress, onClick, ...props } = rest;
  const toggle = (e) => {
    const next = !isOn;
    if (!isControlled) setInner(next);
    onCheckedChange?.(next);
    onPress?.(e);
    onClick?.(e);
  };
  const offColor = t.dark ? colors.gray[800] : colors.gray[200];

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: isOn, disabled: !!disabled }}
      disabled={disabled}
      onPress={toggle}
      hitSlop={6}
      {...props}
    >
      <Animated.View
        style={[
          {
            height: 24,
            width: 44,
            borderRadius: 9999,
            borderWidth: 2,
            borderColor: 'transparent',
            justifyContent: 'center',
            backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [offColor, '#16a34a'] }),
          },
          disabled && { opacity: 0.5 },
          style,
        ]}
      >
        <Animated.View
          style={[
            { height: 20, width: 20, borderRadius: 9999, backgroundColor: colors.white, ...shadow.lg },
            { transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

export { Switch };
