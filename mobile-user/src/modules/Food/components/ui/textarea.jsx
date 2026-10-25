// Web: modules/Food/components/ui/textarea.tsx. Same export. `style` styles the field; `rows` sets the start height.
// Takes onChangeText(text) or the web's onChange(event) ({ target: { value } }).
import React, { forwardRef, useState } from 'react';
import { TextInput } from '@/native/ui';
import { colors, shadow, useTheme } from '@/theme';
import { tokensFor, uiRadius } from './tokens';
import { makeWebInputHandlers } from './input';

const Textarea = forwardRef(function Textarea(props, ref) {
  const {
    style,
    value,
    rows,
    disabled,
    readOnly,
    onFocus,
    onBlur,
    onChange: _onChange,
    onChangeText: _onChangeText,
    onKeyDown: _onKeyDown,
    onKeyPress: _onKeyPress,
    onSubmitEditing: _onSubmit,
    ...rest
  } = props;
  const t = useTheme();
  const k = tokensFor(t);
  const [focused, setFocused] = useState(false);
  const hasValueProp = 'value' in props;
  const valueProps = hasValueProp ? { value: value == null ? '' : String(value) } : {};
  const { onChangeText } = makeWebInputHandlers(props);
  const minHeight = rows ? Math.max(80, rows * 20 + 18) : 80;

  return (
    <TextInput
      ref={ref}
      multiline
      textAlignVertical="top"
      {...rest}
      {...valueProps}
      onChangeText={onChangeText}
      editable={!disabled && !readOnly}
      placeholderTextColor={rest.placeholderTextColor || k.mutedForeground}
      selectionColor={rest.selectionColor || k.primary}
      cursorColor={t.dark ? '#ffffff' : '#0f172a'}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        {
          minHeight,
          width: '100%',
          borderRadius: uiRadius.md,
          borderWidth: 1,
          borderColor: focused ? colors.neutral[900] : k.input,
          backgroundColor: t.dark ? 'rgba(255, 255, 255, 0.045)' : k.background,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 14,
          lineHeight: 20,
          color: k.foreground,
          ...shadow.xs,
        },
        disabled && { opacity: 0.5 },
        style,
      ]}
    />
  );
});

export { Textarea };
