// Shared helpers for the Food UI kit (the web's shadcn components in this folder).
// The colours are the CSS variables of Frontend/src/shared/styles/global.css (light :root and html[data-theme="dark"]),
// converted from oklch to sRGB. The radii are that file's @theme overrides (--radius: 0.625rem):
// rounded-sm = 6, rounded-md = 8, rounded-lg = 10, rounded-xl = 14 (not Tailwind's defaults).
import React from 'react';
import { Text } from '@/native/ui';
import { alpha } from '@/theme';

export const LIGHT_TOKENS = {
  background: '#ffffff',
  foreground: '#270e01',
  card: '#ffffff',
  cardForeground: '#270e01',
  popover: '#ffffff',
  popoverForeground: '#270e01',
  primary: '#c99500',
  primaryForeground: '#170400',
  secondary: '#f3f0e6',
  secondaryForeground: '#4a2200',
  muted: '#f5f3ee',
  mutedForeground: '#7b5b4a',
  accent: '#f6e2b5',
  accentForeground: '#371801',
  destructive: '#e7000b',
  border: '#e6e0d1',
  input: '#f2f0ea',
  ring: '#c99500',
};

export const DARK_TOKENS = {
  background: '#0a0a0a',
  foreground: '#fafafa',
  card: '#171717',
  cardForeground: '#fafafa',
  popover: '#171717',
  popoverForeground: '#fafafa',
  primary: '#e5e5e5',
  primaryForeground: '#171717',
  secondary: '#262626',
  secondaryForeground: '#fafafa',
  muted: '#262626',
  mutedForeground: '#a1a1a1',
  accent: '#262626',
  accentForeground: '#fafafa',
  destructive: '#ff6467',
  border: alpha('#ffffff', 0.1),
  input: alpha('#ffffff', 0.15),
  ring: '#737373',
};

export const tokensFor = (t) => (t?.dark ? DARK_TOKENS : LIGHT_TOKENS);

/** The app's rounded-* values (global.css @theme inline). */
export const uiRadius = { sm: 6, md: 8, lg: 10, xl: 14 };

const isTextChild = (c) => typeof c === 'string' || typeof c === 'number';

/**
 * Renders children like the web does inside a styled element: bare strings / numbers become <Text> with the
 * element's text style (React Native has no text inheritance from a View).
 */
export function renderTextChildren(children, textStyle, textProps) {
  return React.Children.map(children, (child) => {
    if (child == null || child === false || child === true) return null;
    if (isTextChild(child)) {
      return (
        <Text style={textStyle} {...textProps}>
          {child}
        </Text>
      );
    }
    return child;
  });
}

/** True when every child is plain text (so the whole block can be one <Text>). */
export function isAllText(children) {
  let all = true;
  let any = false;
  React.Children.forEach(children, (c) => {
    if (c == null || c === false || c === true) return;
    any = true;
    if (!isTextChild(c)) all = false;
  });
  return any && all;
}

/** onPress handler that also calls the web-style onClick prop the converted pages may pass. */
export const pressHandler = (props) => {
  const { onPress, onClick } = props;
  if (!onPress && !onClick) return undefined;
  return (e) => {
    onPress?.(e);
    onClick?.(e);
  };
};
