// Page wrapper: background, safe areas, status bar colour and (optionally) keyboard avoidance.
// edges: which sides get safe-area padding. A screen with its own coloured header usually passes edges={['bottom']}
// and puts <StatusBarSpacer color=... /> (or paddingTop: insets.top) inside that header.
import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export function Screen({ children, style, bg, edges = ['top', 'bottom'], statusBarStyle, keyboard = false }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };
  const body = <View style={[styles.fill, { backgroundColor: bg ?? t.bg }, pad, style]}>{children}</View>;
  return (
    <>
      <StatusBar style={statusBarStyle ?? (t.dark ? 'light' : 'dark')} />
      {keyboard ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </>
  );
}

export function StatusBarSpacer({ color }) {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: color }} />;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
