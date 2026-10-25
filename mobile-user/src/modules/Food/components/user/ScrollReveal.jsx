// Web: modules/Food/components/user/ScrollReveal.jsx — the live version is a plain wrapper (the reveal animation is
// commented out on the web). className -> style.
import React from 'react';
import { View } from 'react-native';

export default function ScrollReveal({ children, style }) {
  return <View style={style}>{children}</View>;
}
