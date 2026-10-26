// Web: modules/Food/components/ui/label.tsx — flex items-center gap-2 text-sm leading-none font-medium.
// `style` = the label box, `textStyle` = its text. htmlFor has no meaning on a phone and is ignored.
import React from 'react';
import { View } from 'react-native';
import { Text } from '@/native/ui';
import { useTheme } from '@/theme';
import { isAllText, renderTextChildren, tokensFor } from './tokens';

function Label({ style, textStyle, children, htmlFor: _htmlFor, disabled, ...rest }) {
  const k = tokensFor(useTheme());
  const text = { fontSize: 14, lineHeight: 14, fontWeight: '500', color: k.foreground };
  if (isAllText(children)) {
    return (
      <Text style={[text, disabled && { opacity: 0.5 }, style, textStyle]} {...rest}>
        {children}
      </Text>
    );
  }
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, disabled && { opacity: 0.5 }, style]} {...rest}>
      {renderTextChildren(children, [text, textStyle])}
    </View>
  );
}

export { Label };
