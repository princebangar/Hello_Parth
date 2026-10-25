// Web: modules/Food/components/ui/select.tsx (Radix Select, position "popper"). Same exports and props:
//   <Select value onValueChange defaultValue disabled>
//     <SelectTrigger size style textStyle><SelectValue placeholder="…" /></SelectTrigger>
//     <SelectContent style><SelectItem value="a">A</SelectItem>…</SelectContent>
//   </Select>
// The list opens under the trigger, at least as wide as it, max-h-48 and scrollable, rounded-md border bg-popover
// shadow-lg; each option has a bottom border and a check on the selected one. scrollToTopOnOpen keeps the list at
// its top instead of scrolling to the selected option (the web's prop).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { shadow, useTheme } from '@/theme';
import { isAllText, renderTextChildren, tokensFor, uiRadius } from './tokens';

const SelectContext = createContext(null);
const RegisterOnly = createContext(false);

const labelText = (node) => {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(labelText).join('');
  if (React.isValidElement(node)) return labelText(node.props.children);
  return '';
};

function Select({ value: valueProp, defaultValue, onValueChange, open: openProp, defaultOpen = false, onOpenChange, disabled, children }) {
  const [inner, setInner] = useState(defaultValue);
  const [innerOpen, setInnerOpen] = useState(Boolean(defaultOpen));
  const [anchor, setAnchor] = useState(null);
  const [, setVersion] = useState(0);
  const labels = useRef(new Map());
  const triggerRef = useRef(null);
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : inner;
  const open = openProp !== undefined ? Boolean(openProp) : innerOpen;

  const setOpen = useCallback(
    (next) => {
      if (openProp === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const setValue = useCallback(
    (next) => {
      if (!isControlled) setInner(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );
  const register = useCallback((itemValue, node) => {
    const key = String(itemValue);
    const prev = labels.current.get(key);
    labels.current.set(key, node);
    if (!prev || labelText(prev) !== labelText(node)) setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    triggerRef.current?.measureInWindow?.((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, [open]);

  return (
    <SelectContext.Provider value={{ value, setValue, open, setOpen, labels, register, triggerRef, anchor, disabled }}>
      {children}
    </SelectContext.Provider>
  );
}

const useSelect = () => useContext(SelectContext) || {};

function SelectGroup({ style, children }) {
  return <View style={style}>{children}</View>;
}

const TriggerTextContext = createContext(null);

function SelectValue({ placeholder, style, children }) {
  const k = tokensFor(useTheme());
  const { value, labels } = useSelect();
  const triggerText = useContext(TriggerTextContext);
  const hasValue = value !== undefined && value !== null && value !== '';
  const label = children ?? (hasValue ? labels?.current?.get(String(value)) : null);
  const content = label ?? (hasValue ? String(value) : placeholder);
  const color = hasValue ? k.foreground : k.mutedForeground;
  if (content == null || isAllText(content) || typeof content === 'string') {
    return (
      <Text numberOfLines={1} style={[{ fontSize: 14, lineHeight: 20, color, flexShrink: 1 }, triggerText, !hasValue && { color: k.mutedForeground }, style]}>
        {content ?? ''}
      </Text>
    );
  }
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }, style]}>{renderTextChildren(content, [{ fontSize: 14, color }, triggerText])}</View>;
}

function SelectTrigger({ size = 'default', style, textStyle, iconColor, children, disabled: disabledProp }) {
  const t = useTheme();
  const k = tokensFor(t);
  const { open, setOpen, triggerRef, disabled } = useSelect();
  const isDisabled = disabledProp ?? disabled;
  return (
    <TriggerTextContext.Provider value={textStyle}>
      <Pressable
        ref={triggerRef}
        collapsable={false}
        accessibilityRole="combobox"
        disabled={isDisabled}
        onPress={() => setOpen(!open)}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            alignSelf: 'flex-start',
            gap: 8,
            borderRadius: uiRadius.md,
            borderWidth: 1,
            borderColor: k.input,
            backgroundColor: t.dark ? 'rgba(255, 255, 255, 0.045)' : k.background,
            paddingHorizontal: 12,
            paddingVertical: 8,
            height: size === 'sm' ? 32 : 36,
            ...shadow.xs,
          },
          isDisabled && { opacity: 0.5 },
          style,
        ]}
      >
        {renderTextChildren(children, [{ fontSize: 14, color: k.foreground }, textStyle], { numberOfLines: 1 })}
        <ChevronDown size={16} color={iconColor || k.mutedForeground} style={{ opacity: 0.5 }} />
      </Pressable>
    </TriggerTextContext.Provider>
  );
}

function SelectContent({ style, children, scrollToTopOnOpen = false, position: _position, align = 'center', sideOffset = 4 }) {
  const k = tokensFor(useTheme());
  const { open, setOpen, anchor, value } = useSelect();
  const [size, setSize] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const itemOffsets = useRef(new Map());

  useEffect(() => {
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    if (!open) setSize(null);
  }, [open, anim]);

  // Closed: the items only report their labels (for SelectValue); nothing is drawn.
  if (!open || !anchor) {
    return <RegisterOnly.Provider value>{children}</RegisterOnly.Provider>;
  }

  const { width: screenW, height: screenH } = Dimensions.get('window');
  const w = Math.max(size?.width || 0, anchor.width);
  const h = size?.height || 0;
  let left = anchor.x;
  if (align === 'center') left = anchor.x + anchor.width / 2 - w / 2;
  else if (align === 'end') left = anchor.x + anchor.width - w;
  left = Math.max(8, Math.min(left, screenW - w - 8));
  let top = anchor.y + anchor.height + sideOffset;
  if (top + h > screenH - 8 && anchor.y - h - sideOffset > 8) top = anchor.y - h - sideOffset;

  return (
    <>
      <RegisterOnly.Provider value>{children}</RegisterOnly.Provider>
      <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <Animated.View
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (!size || size.width !== width || size.height !== height) setSize({ width, height });
          }}
          style={[
            {
              position: 'absolute',
              top,
              left,
              minWidth: anchor.width,
              maxHeight: 192,
              overflow: 'hidden',
              borderRadius: uiRadius.md,
              borderWidth: 1,
              borderColor: k.border,
              backgroundColor: k.popover,
              ...shadow.lg,
            },
            style,
            { opacity: size ? anim : 0 },
          ]}
        >
          <ScrollView
            ref={scrollRef}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 4 }}
            onContentSizeChange={() => {
              if (scrollToTopOnOpen) return;
              const y = itemOffsets.current.get(String(value));
              if (Number.isFinite(y)) scrollRef.current?.scrollTo({ y: Math.max(0, y - 4), animated: false });
            }}
          >
            <ItemOffsetContext.Provider value={itemOffsets}>{children}</ItemOffsetContext.Provider>
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const ItemOffsetContext = createContext(null);

function SelectLabel({ style, children }) {
  const k = tokensFor(useTheme());
  const registerOnly = useContext(RegisterOnly);
  const offsets = useContext(ItemOffsetContext);
  if (registerOnly && !offsets) return null;
  return <Text style={[{ color: k.mutedForeground, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, lineHeight: 16 }, style]}>{children}</Text>;
}

function SelectItem({ value, disabled, style, textStyle, children, isLast }) {
  const k = tokensFor(useTheme());
  const select = useSelect();
  const registerOnly = useContext(RegisterOnly);
  const offsets = useContext(ItemOffsetContext);

  useEffect(() => {
    select.register?.(value, children);
  });

  if (registerOnly && !offsets) return null;
  const selected = String(select.value) === String(value);
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onLayout={(e) => offsets?.current.set(String(value), e.nativeEvent.layout.y)}
      onPress={() => {
        select.setValue?.(value);
        select.setOpen?.(false);
      }}
      style={({ pressed }) => [
        {
          position: 'relative',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          borderRadius: uiRadius.sm,
          paddingVertical: 6,
          paddingRight: 32,
          paddingLeft: 8,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: k.border,
        },
        pressed && { backgroundColor: k.accent },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', right: 8, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <Check size={16} color={k.mutedForeground} /> : null}
      </View>
      {renderTextChildren(children, [{ fontSize: 14, lineHeight: 20, color: k.popoverForeground }, textStyle])}
    </Pressable>
  );
}

function SelectSeparator({ style }) {
  const k = tokensFor(useTheme());
  const registerOnly = useContext(RegisterOnly);
  const offsets = useContext(ItemOffsetContext);
  if (registerOnly && !offsets) return null;
  return <View pointerEvents="none" style={[{ backgroundColor: k.border, marginHorizontal: -4, marginVertical: 4, height: 1 }, style]} />;
}

// The list scrolls by touch on a phone; Radix's hover scroll buttons have nothing to do there.
function SelectScrollUpButton({ style }) {
  const k = tokensFor(useTheme());
  const registerOnly = useContext(RegisterOnly);
  if (registerOnly) return null;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }, style]}>
      <ChevronUp size={16} color={k.mutedForeground} />
    </View>
  );
}

function SelectScrollDownButton({ style }) {
  const k = tokensFor(useTheme());
  const registerOnly = useContext(RegisterOnly);
  if (registerOnly) return null;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }, style]}>
      <ChevronDown size={16} color={k.mutedForeground} />
    </View>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
