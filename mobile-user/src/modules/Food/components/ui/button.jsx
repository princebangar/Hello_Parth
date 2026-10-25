// Web: modules/Food/components/ui/button.tsx (shadcn Button, cva variants).
// Same exports, variants, sizes and defaults. `style` styles the button, `textStyle` the text inside it.
// `onPress` (or the web's `onClick`) fires on tap; `asChild` passes the button styling and tap to its single child.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { alpha, shadow, useTheme } from '@/theme';
import { pressHandler, renderTextChildren, tokensFor, uiRadius } from './tokens';

const SIZES = {
  default: { height: 36, paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  sm: { height: 32, paddingHorizontal: 12, gap: 6 },
  lg: { height: 40, paddingHorizontal: 24, gap: 8 },
  icon: { width: 36, height: 36, gap: 8 },
  'icon-sm': { width: 32, height: 32, gap: 8 },
  'icon-lg': { width: 40, height: 40, gap: 8 },
};

/** Style objects for a variant/size — the RN counterpart of the web's buttonVariants() class string. */
export function buttonVariants({ variant = 'default', size = 'default', dark = false, pressed = false } = {}) {
  const k = tokensFor({ dark });
  const box = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: uiRadius.md, ...(SIZES[size] || SIZES.default) };
  const text = { fontSize: 14, lineHeight: 20, fontWeight: '500' };
  switch (variant) {
    case 'destructive':
      Object.assign(box, { backgroundColor: dark ? alpha(k.destructive, pressed ? 0.54 : 0.6) : alpha(k.destructive, pressed ? 0.9 : 1) });
      text.color = '#ffffff';
      break;
    case 'outline':
      Object.assign(box, {
        borderWidth: 1,
        borderColor: k.input,
        backgroundColor: dark ? (pressed ? alpha('#ffffff', 0.075) : alpha('#ffffff', 0.045)) : pressed ? k.accent : k.background,
        ...shadow.xs,
      });
      text.color = pressed && !dark ? k.accentForeground : k.foreground;
      break;
    case 'secondary':
      box.backgroundColor = pressed ? alpha(k.secondary, 0.8) : k.secondary;
      text.color = k.secondaryForeground;
      break;
    case 'ghost':
      box.backgroundColor = pressed ? (dark ? alpha(k.accent, 0.5) : k.accent) : 'transparent';
      text.color = pressed ? k.accentForeground : k.foreground;
      break;
    case 'link':
      box.backgroundColor = 'transparent';
      text.color = k.primary;
      if (pressed) text.textDecorationLine = 'underline';
      break;
    case 'default':
    default:
      Object.assign(box, { backgroundColor: pressed ? alpha(k.primary, 0.9) : k.primary, ...shadow.xs });
      text.color = k.primaryForeground;
      break;
  }
  return { box, text };
}

function Button({ variant = 'default', size = 'default', asChild = false, disabled, style, textStyle, children, ...props }) {
  const t = useTheme();
  const onPress = pressHandler(props);
  const { onPress: _p, onClick: _c, type: _type, ...rest } = props;

  if (asChild && React.isValidElement(children)) {
    const { box, text } = buttonVariants({ variant, size, dark: t.dark });
    return React.cloneElement(children, {
      ...rest,
      disabled: disabled ?? children.props.disabled,
      style: [box, disabled && styles.disabled, style, children.props.style],
      textStyle: [text, textStyle, children.props.textStyle],
      onPress: (e) => {
        children.props.onPress?.(e);
        onPress?.(e);
      },
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      {...rest}
      style={({ pressed }) => [
        buttonVariants({ variant, size, dark: t.dark, pressed }).box,
        disabled && styles.disabled,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      {({ pressed }) =>
        renderTextChildren(typeof children === 'function' ? children({ pressed }) : children, [buttonVariants({ variant, size, dark: t.dark, pressed }).text, textStyle], {
          numberOfLines: 1,
        })
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({ disabled: { opacity: 0.5 } });

export { Button };
