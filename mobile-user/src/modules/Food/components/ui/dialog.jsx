// Web: modules/Food/components/ui/dialog.tsx (Radix Dialog). Same exports and props:
//   <Dialog open onOpenChange={setOpen}>  <DialogTrigger asChild>…</DialogTrigger>
//     <DialogContent showCloseButton style={…}> <DialogHeader><DialogTitle/><DialogDescription/></DialogHeader> …
// DialogContent: bg-black/40 backdrop, centred card w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border bg-card
// shadow-2xl, fade + zoom-in-95 over 200ms, close button top-right. Tapping the backdrop or Android back closes it
// (onInteractOutside / onPointerDownOutside / onEscapeKeyDown can prevent that with e.preventDefault(), as on the web).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { alpha, colors, shadow, useTheme } from '@/theme';
import { isAllText, renderTextChildren, tokensFor } from './tokens';

const DialogContext = createContext({ open: false, setOpen: () => {} });
const HeaderContext = createContext(false);

function Dialog({ open: openProp, defaultOpen = false, onOpenChange, children }) {
  const [inner, setInner] = useState(Boolean(defaultOpen));
  const isControlled = openProp !== undefined;
  const open = isControlled ? Boolean(openProp) : inner;
  const setOpen = useCallback(
    (next) => {
      if (!isControlled) setInner(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>;
}

const useDialog = () => useContext(DialogContext);

function pressChild(children, asChild, onPress, rest) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...rest,
      onPress: (e) => {
        children.props.onPress?.(e);
        children.props.onClick?.(e);
        onPress(e);
      },
      onClick: undefined,
    });
  }
  return (
    <Pressable onPress={onPress} {...rest}>
      {children}
    </Pressable>
  );
}

function DialogTrigger({ asChild = false, children, ...rest }) {
  const { setOpen } = useDialog();
  return pressChild(children, asChild, () => setOpen(true), rest);
}

function DialogClose({ asChild = false, children, ...rest }) {
  const { setOpen } = useDialog();
  return pressChild(children, asChild, () => setOpen(false), rest);
}

function DialogPortal({ children }) {
  return <>{children}</>;
}

function DialogOverlay({ style }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.black, 0.4) }, style]} />;
}

const makeEvent = () => {
  const e = { defaultPrevented: false };
  e.preventDefault = () => {
    e.defaultPrevented = true;
  };
  return e;
};

function DialogContent({
  style,
  children,
  showCloseButton = true,
  onInteractOutside,
  onPointerDownOutside,
  onEscapeKeyDown,
  onOpenAutoFocus: _autoFocus,
  closeButtonStyle,
}) {
  const t = useTheme();
  const k = tokensFor(t);
  const { open, setOpen } = useDialog();
  const [mounted, setMounted] = useState(open);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, anim]);

  if (!mounted) return null;

  const outside = () => {
    const e = makeEvent();
    onPointerDownOutside?.(e);
    onInteractOutside?.(e);
    if (!e.defaultPrevented) setOpen(false);
  };
  const back = () => {
    const e = makeEvent();
    onEscapeKeyDown?.(e);
    if (!e.defaultPrevented) setOpen(false);
  };

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={back}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.black, 0.4), opacity: anim }]}>
          <Pressable style={styles.fill} onPress={outside} accessibilityLabel="Close" />
        </Animated.View>
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View
            style={[
              {
                width: '100%',
                maxWidth: 512,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: k.border,
                backgroundColor: k.card,
                ...shadow['2xl'],
              },
              { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] },
              style,
            ]}
          >
            {renderTextChildren(children, { color: k.cardForeground })}
            {showCloseButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setOpen(false)}
                hitSlop={6}
                style={({ pressed }) => [
                  {
                    position: 'absolute',
                    right: 20,
                    top: 20,
                    borderRadius: 9999,
                    padding: 8,
                    borderWidth: 1,
                    backgroundColor: t.dark ? alpha(colors.gray[800], pressed ? 0.8 : 0.8) : pressed ? colors.gray[100] : colors.gray[50],
                    borderColor: t.dark ? alpha(colors.gray[700], 0.5) : alpha(colors.gray[200], 0.6),
                  },
                  closeButtonStyle,
                ]}
              >
                <X size={20} strokeWidth={2.5} color={t.dark ? colors.gray[300] : colors.gray[500]} />
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DialogHeader({ style, children, ...rest }) {
  return (
    <HeaderContext.Provider value>
      <View style={[{ flexDirection: 'column', gap: 8 }, style]} {...rest}>
        {children}
      </View>
    </HeaderContext.Provider>
  );
}

function DialogFooter({ style, children, ...rest }) {
  return (
    <View style={[{ flexDirection: 'column-reverse', gap: 8 }, style]} {...rest}>
      {children}
    </View>
  );
}

function TextBlock({ base, style, textStyle, children, ...rest }) {
  const inHeader = useContext(HeaderContext);
  const align = inHeader ? { textAlign: 'center' } : null;
  if (isAllText(children)) {
    return (
      <Text style={[base, align, style, textStyle]} {...rest}>
        {children}
      </Text>
    );
  }
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }, inHeader && { justifyContent: 'center' }, style]} {...rest}>
      {renderTextChildren(children, [base, align, textStyle])}
    </View>
  );
}

function DialogTitle(props) {
  const k = tokensFor(useTheme());
  return <TextBlock base={{ fontSize: 18, lineHeight: 18, fontWeight: '600', color: k.cardForeground }} {...props} />;
}

function DialogDescription(props) {
  const k = tokensFor(useTheme());
  return <TextBlock base={{ fontSize: 14, lineHeight: 20, color: k.mutedForeground }} {...props} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  useDialog,
};
