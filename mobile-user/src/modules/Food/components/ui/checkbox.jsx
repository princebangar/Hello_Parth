// Web: modules/Food/components/ui/checkbox.tsx (Radix Checkbox with no default styling of its own: the page styles it,
// and a 14px check icon shows while checked). Same props: checked, defaultChecked, onCheckedChange(next), disabled.
// `style` styles the box, `checkedStyle` is added while checked (the web's data-[state=checked]: classes) and
// `iconColor` colours the check (the web's text-* class on the box).
import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { tokensFor } from './tokens';

function Checkbox({ checked, defaultChecked = false, onCheckedChange, disabled, style, checkedStyle, iconColor, iconSize = 14, ...rest }) {
  const k = tokensFor(useTheme());
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked === true : inner;
  const { onPress, onClick, ...props } = rest;
  const toggle = (e) => {
    const next = !isChecked;
    if (!isControlled) setInner(next);
    onCheckedChange?.(next);
    onPress?.(e);
    onClick?.(e);
  };
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isChecked, disabled: !!disabled }}
      disabled={disabled}
      onPress={toggle}
      hitSlop={6}
      {...props}
      style={[{ alignItems: 'center', justifyContent: 'center' }, style, isChecked && checkedStyle, disabled && { opacity: 0.5 }]}
    >
      {isChecked ? <Check size={iconSize} color={iconColor || k.foreground} /> : null}
    </Pressable>
  );
}

export { Checkbox };
