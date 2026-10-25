// Web: modules/Food/components/ui/badge.tsx. Same exports, variants and default. `style` = pill, `textStyle` = text.
import React from 'react';
import { View } from 'react-native';
import { alpha, useTheme } from '@/theme';
import { renderTextChildren, tokensFor } from './tokens';

export function badgeVariants({ variant = 'default', dark = false } = {}) {
  const k = tokensFor({ dark });
  const box = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
    overflow: 'hidden',
  };
  const text = { fontSize: 12, lineHeight: 16, fontWeight: '500' };
  switch (variant) {
    case 'secondary':
      Object.assign(box, { borderColor: 'transparent', backgroundColor: k.secondary });
      text.color = k.secondaryForeground;
      break;
    case 'destructive':
      Object.assign(box, { borderColor: 'transparent', backgroundColor: dark ? alpha(k.destructive, 0.6) : k.destructive });
      text.color = '#ffffff';
      break;
    case 'outline':
      Object.assign(box, { borderColor: k.border, backgroundColor: 'transparent' });
      text.color = k.foreground;
      break;
    case 'default':
    default:
      Object.assign(box, { borderColor: 'transparent', backgroundColor: k.primary });
      text.color = k.primaryForeground;
      break;
  }
  return { box, text };
}

function Badge({ variant = 'default', style, textStyle, children, ...rest }) {
  const t = useTheme();
  const { box, text } = badgeVariants({ variant, dark: t.dark });
  return (
    <View style={[box, style]} {...rest}>
      {renderTextChildren(children, [text, textStyle], { numberOfLines: 1 })}
    </View>
  );
}

export { Badge };
