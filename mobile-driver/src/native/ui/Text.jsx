// <Text> / <TextInput> that behave like CSS text: fontFamily + fontWeight pick the bundled font file
// (Android needs one family name per weight), and the family falls back to the nearest <FontScope>
// (Poppins by default, Outfit inside the Taxi screens — the web's body fonts).
import React, { createContext, forwardRef, useContext } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { DEFAULT_FONT, useTheme } from '@/theme';
import { isKnownFamily, resolveFont } from '@/theme/fonts';

const FontContext = createContext(DEFAULT_FONT);

export function FontScope({ family, children }) {
  return <FontContext.Provider value={family}>{children}</FontContext.Provider>;
}

export const useFontFamily = () => useContext(FontContext);

// No italic font files are bundled, so Android slants the regular one; the slanted last letter then sticks out of the
// text box and is clipped ("FLAVOUR FES|T"). Italic text gets a little room on the right (and a hair on the left).
function italicRoom(flat) {
  if (flat.fontStyle !== 'italic') return null;
  const size = Number(flat.fontSize) || 14;
  const room = Math.ceil(size * 0.18);
  return {
    paddingRight: (Number(flat.paddingRight ?? flat.paddingHorizontal ?? flat.padding) || 0) + room,
    paddingLeft: (Number(flat.paddingLeft ?? flat.paddingHorizontal ?? flat.padding) || 0) + Math.ceil(room / 3),
  };
}

function fontStyle(style, scopeFamily) {
  const flat = StyleSheet.flatten(style) || {};
  const family = isKnownFamily(flat.fontFamily) ? flat.fontFamily : scopeFamily;
  const room = italicRoom(flat);
  if (flat.fontFamily && !isKnownFamily(flat.fontFamily)) {
    // already a concrete file name such as "Outfit_700Bold"
    return [style, { fontWeight: undefined }, room];
  }
  return [style, { fontFamily: resolveFont(family, flat.fontWeight), fontWeight: undefined }, room];
}

// The new Android text renderer clips the glyphs to the text's own box (padding does not help), so the slanted top of
// the last letter of an italic text was cut (the T of FLAVOUR FEST). A trailing no-break space (not trimmed like a
// normal space) makes that box wide enough.
const ITALIC_TAIL = ' ';
const withItalicTail = (children) => {
  if (typeof children === 'string' || typeof children === 'number') return `${children}${ITALIC_TAIL}`;
  if (Array.isArray(children) && children.length && typeof children[children.length - 1] === 'string') {
    return [...children.slice(0, -1), `${children[children.length - 1]}${ITALIC_TAIL}`];
  }
  return children;
};

export const Text = forwardRef(function Text({ style, children, ...props }, ref) {
  const family = useContext(FontContext);
  const t = useTheme();
  const italic = StyleSheet.flatten(style)?.fontStyle === 'italic';
  return (
    <RNText ref={ref} allowFontScaling={false} {...props} style={[{ color: t.text }, ...fontStyle(style, family)]}>
      {italic ? withItalicTail(children) : children}
    </RNText>
  );
});

export const TextInput = forwardRef(function TextInput({ style, placeholderTextColor, ...props }, ref) {
  const family = useContext(FontContext);
  const t = useTheme();
  return (
    <RNTextInput
      ref={ref}
      allowFontScaling={false}
      placeholderTextColor={placeholderTextColor ?? t.textMuted}
      underlineColorAndroid="transparent"
      {...props}
      style={[{ color: t.text, padding: 0 }, ...fontStyle(style, family)]}
    />
  );
});
