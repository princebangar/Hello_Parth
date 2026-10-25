// Web: modules/Food/components/ui/input.tsx. Same export (forwardRef). `style` styles the field.
// Takes the web's props: value (always a string when given), type (email / tel / number / password / search),
// placeholder, disabled, readOnly, maxLength, autoFocus, onFocus / onBlur, and either onChangeText(text) or the
// web's onChange(event) (called with { target: { value, name } }). Enter (keyboard submit) calls onKeyDown /
// onKeyPress with { key: 'Enter' } like the web.
import React, { forwardRef, useState } from 'react';
import { TextInput } from '@/native/ui';
import { colors, shadow, useTheme } from '@/theme';
import { tokensFor, uiRadius } from './tokens';

const KEYBOARD_FOR_TYPE = { email: 'email-address', tel: 'phone-pad', number: 'numeric', url: 'url' };
const KEYBOARD_FOR_MODE = { numeric: 'number-pad', decimal: 'decimal-pad', tel: 'phone-pad', email: 'email-address', search: 'default', url: 'url' };

/** Web-style change / key events for converted pages that read e.target.value / e.key. */
export function makeWebInputHandlers(props) {
  const { onChange, onChangeText, onKeyDown, onKeyPress, onSubmitEditing, name } = props;
  return {
    onChangeText: (text) => {
      onChangeText?.(text);
      onChange?.({ target: { value: text, name }, currentTarget: { value: text, name }, preventDefault() {}, stopPropagation() {} });
    },
    onSubmitEditing: (e) => {
      onSubmitEditing?.(e);
      const keyEvent = { key: 'Enter', code: 'Enter', target: { value: e?.nativeEvent?.text, name }, preventDefault() {}, stopPropagation() {} };
      onKeyDown?.(keyEvent);
      onKeyPress?.(keyEvent);
    },
  };
}

const Input = forwardRef(function Input(props, ref) {
  const {
    style,
    type,
    value,
    disabled,
    readOnly,
    inputMode,
    onFocus,
    onBlur,
    onChange: _onChange,
    onChangeText: _onChangeText,
    onKeyDown: _onKeyDown,
    onKeyPress: _onKeyPress,
    onSubmitEditing: _onSubmit,
    autoComplete: _autoComplete,
    ...rest
  } = props;
  const t = useTheme();
  const k = tokensFor(t);
  const [focused, setFocused] = useState(false);

  // Ensure value is always a string (never undefined/null) when provided — the web's controlled-input rule.
  const hasValueProp = 'value' in props;
  const valueProps = hasValueProp ? { value: value == null ? '' : String(value) } : {};
  const handlers = makeWebInputHandlers(props);

  return (
    <TextInput
      ref={ref}
      {...rest}
      {...valueProps}
      {...handlers}
      editable={!disabled && !readOnly}
      secureTextEntry={type === 'password' || rest.secureTextEntry}
      keyboardType={rest.keyboardType || KEYBOARD_FOR_MODE[inputMode] || KEYBOARD_FOR_TYPE[type] || 'default'}
      autoCapitalize={rest.autoCapitalize || (type === 'email' || type === 'password' || type === 'url' ? 'none' : 'sentences')}
      returnKeyType={rest.returnKeyType || (type === 'search' ? 'search' : 'done')}
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
          height: 36,
          width: '100%',
          minWidth: 0,
          borderRadius: uiRadius.md,
          borderWidth: 1,
          borderColor: focused ? colors.neutral[900] : k.input,
          backgroundColor: t.dark ? 'rgba(255, 255, 255, 0.045)' : k.background,
          paddingHorizontal: 12,
          paddingVertical: 4,
          fontSize: 16,
          color: k.foreground,
          ...shadow.xs,
        },
        disabled && { opacity: 0.5 },
        style,
      ]}
    />
  );
});

Input.displayName = 'Input';

export { Input };
