// Native replacements for the web's dialogs / drawers / popovers:
//   <Sheet open onClose>  — bottom sheet (slides up, dimmed backdrop, tap outside or Android back closes)
//   <Dialog open onClose> — centred dialog (fades in)
// Style the content to look like the web one; these only provide the overlay behaviour.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, radius, useTheme } from '@/theme';

// The opening animation starts from the Modal's onShow: started earlier, it ran (or jumped) before the popup's window
// existed and the popup flashed in at full size. Closing animates out, then unmounts the Modal.
function useMountedWhileOpen(open, ms) {
  const [mounted, setMounted] = useState(open);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;
  const openRef = useRef(open);
  openRef.current = open;
  const shownRef = useRef(false); // the Modal window is up (reopened while still closing: no new onShow)
  const animateIn = useCallback(() => {
    Animated.timing(anim, { toValue: 1, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim, ms]);
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (shownRef.current) animateIn();
      return undefined;
    }
    const a = Animated.timing(anim, { toValue: 0, duration: Math.round(ms * 0.85), easing: Easing.in(Easing.quad), useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished && !openRef.current) {
        shownRef.current = false;
        setMounted(false);
      }
    });
    return () => a.stop();
  }, [open, anim, ms, animateIn]);
  const onShow = useCallback(() => {
    shownRef.current = true;
    if (openRef.current) animateIn();
  }, [animateIn]);
  return [mounted, anim, onShow];
}

export function Sheet({ open, onClose, children, style, backdropOpacity = 0.5, dismissible = true }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, anim, onShow] = useMountedWhileOpen(open, 260);
  if (!mounted) return null;
  const h = Dimensions.get('window').height;
  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onShow={onShow} onRequestClose={() => dismissible && onClose?.()}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', backdropOpacity), opacity: anim }]}>
          <Pressable style={styles.fill} onPress={() => dismissible && onClose?.()} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: t.card, paddingBottom: insets.bottom, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [h, 0] }) }] },
            style,
          ]}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Dialog({ open, onClose, children, style, backdropOpacity = 0.5, dismissible = true }) {
  const t = useTheme();
  const [mounted, anim, onShow] = useMountedWhileOpen(open, 220);
  if (!mounted) return null;
  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onShow={onShow} onRequestClose={() => dismissible && onClose?.()}>
      <Animated.View style={[styles.center, { backgroundColor: alpha('#000000', backdropOpacity), opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismissible && onClose?.()} />
        <Animated.View
          style={[
            styles.dialog,
            { backgroundColor: t.card, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
            style,
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** Full-screen overlay (the web's fixed inset-0 panels that sit above the page). */
export function Overlay({ open, onClose, children, style }) {
  if (!open) return null;
  return (
    <Modal visible transparent={false} statusBarTranslucent animationType="slide" onRequestClose={() => onClose?.()}>
      <View style={[styles.fill, style]}>{children}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius['3xl'], borderTopRightRadius: radius['3xl'], overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radius['2xl'], overflow: 'hidden' },
});
