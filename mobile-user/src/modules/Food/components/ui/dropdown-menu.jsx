// Web: modules/Food/components/ui/dropdown-menu.tsx (Radix DropdownMenu). Same exports and props.
// The menu opens under its trigger (align start / center / end, sideOffset default 4) as a popover above the page:
// min-w-[8rem] rounded-md border bg-popover p-1 shadow-md, fade + zoom-in-95. Tapping outside or Android back closes
// it; choosing an item calls onSelect(e) (and the web's onClick / onPress) and closes unless e.preventDefault().
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, Circle } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { alpha, shadow, useTheme } from '@/theme';
import { isAllText, renderTextChildren, tokensFor, uiRadius } from './tokens';

const MenuContext = createContext(null);
const RadioContext = createContext(null);
const SubContext = createContext(null);

function DropdownMenu({ open: openProp, defaultOpen = false, onOpenChange, children, modal: _modal }) {
  const [inner, setInner] = useState(Boolean(defaultOpen));
  const [anchor, setAnchor] = useState(null);
  const triggerRef = useRef(null);
  const isControlled = openProp !== undefined;
  const open = isControlled ? Boolean(openProp) : inner;
  const setOpen = useCallback(
    (next) => {
      if (!isControlled) setInner(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  // Measure the trigger whenever the menu opens (also when it is opened from outside, controlled).
  useEffect(() => {
    if (!open) return;
    triggerRef.current?.measureInWindow?.((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, [open]);
  return <MenuContext.Provider value={{ open, setOpen, anchor, setAnchor, triggerRef }}>{children}</MenuContext.Provider>;
}

const useMenu = () => useContext(MenuContext) || { open: false, setOpen: () => {}, anchor: null, setAnchor: () => {}, triggerRef: { current: null } };

function DropdownMenuTrigger({ asChild = false, children, disabled, style, ...rest }) {
  const { open, setOpen, triggerRef } = useMenu();
  const toggle = () => {
    if (disabled) return;
    setOpen(!open);
  };
  if (asChild && React.isValidElement(children)) {
    return (
      <View ref={triggerRef} collapsable={false} style={style}>
        {React.cloneElement(children, {
          ...rest,
          onPress: (e) => {
            children.props.onPress?.(e);
            children.props.onClick?.(e);
            toggle();
          },
          onClick: undefined,
        })}
      </View>
    );
  }
  return (
    <Pressable ref={triggerRef} collapsable={false} onPress={toggle} disabled={disabled} style={style} {...rest}>
      {children}
    </Pressable>
  );
}

function DropdownMenuPortal({ children }) {
  return <>{children}</>;
}

function DropdownMenuContent({ style, align = 'center', side = 'bottom', sideOffset = 4, alignOffset = 0, children }) {
  const t = useTheme();
  const k = tokensFor(t);
  const { open, setOpen, anchor } = useMenu();
  const [size, setSize] = useState(null);
  const [mounted, setMounted] = useState(open);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 150, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !open) {
        setMounted(false);
        setSize(null);
      }
    });
  }, [open, anim]);

  if (!mounted || !anchor) return null;

  const { width: screenW, height: screenH } = Dimensions.get('window');
  const w = size?.width || 0;
  const h = size?.height || 0;
  let left = anchor.x + alignOffset;
  if (align === 'center') left = anchor.x + anchor.width / 2 - w / 2;
  else if (align === 'end') left = anchor.x + anchor.width - w - alignOffset;
  left = Math.max(8, Math.min(left, screenW - w - 8));
  let top = side === 'top' ? anchor.y - h - sideOffset : anchor.y + anchor.height + sideOffset;
  if (side !== 'top' && top + h > screenH - 8 && anchor.y - h - sideOffset > 8) top = anchor.y - h - sideOffset;

  return (
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
            minWidth: 128,
            overflow: 'hidden',
            borderRadius: uiRadius.md,
            borderWidth: 1,
            borderColor: k.border,
            backgroundColor: k.popover,
            padding: 4,
            ...shadow.md,
          },
          style,
          {
            opacity: size ? anim : 0,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
          },
        ]}
      >
        {renderTextChildren(children, { color: k.popoverForeground })}
      </Animated.View>
    </Modal>
  );
}

function DropdownMenuGroup({ style, children }) {
  return <View style={style}>{children}</View>;
}

const selectEvent = () => {
  const e = { defaultPrevented: false };
  e.preventDefault = () => {
    e.defaultPrevented = true;
  };
  return e;
};

function useItemPress({ onSelect, onClick, onPress, disabled, closeOnSelect = true }) {
  const { setOpen } = useMenu();
  return () => {
    if (disabled) return;
    const e = selectEvent();
    onSelect?.(e);
    onClick?.(e);
    onPress?.(e);
    if (closeOnSelect && !e.defaultPrevented) setOpen(false);
  };
}

function ItemBox({ style, textStyle, inset, destructive, disabled, onPress, leftSlot, rightSlot, children, padLeft }) {
  const t = useTheme();
  const k = tokensFor(t);
  const text = { fontSize: 14, lineHeight: 20, color: destructive ? k.destructive : k.popoverForeground };
  return (
    <Pressable
      accessibilityRole="menuitem"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          position: 'relative',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: uiRadius.sm,
          paddingHorizontal: 8,
          paddingVertical: 6,
          paddingLeft: padLeft || (inset ? 32 : 8),
        },
        pressed && { backgroundColor: destructive ? alpha(k.destructive, t.dark ? 0.2 : 0.1) : k.accent },
        disabled && { opacity: 0.5 },
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      {leftSlot}
      {renderTextChildren(children, [text, textStyle])}
      {rightSlot}
    </Pressable>
  );
}

function DropdownMenuItem({ style, textStyle, inset, variant = 'default', disabled, onSelect, onClick, onPress, children }) {
  const press = useItemPress({ onSelect, onClick, onPress, disabled });
  return (
    <ItemBox style={style} textStyle={textStyle} inset={inset} destructive={variant === 'destructive'} disabled={disabled} onPress={press}>
      {children}
    </ItemBox>
  );
}

function DropdownMenuCheckboxItem({ style, textStyle, checked, onCheckedChange, disabled, onSelect, children }) {
  const k = tokensFor(useTheme());
  const press = useItemPress({
    disabled,
    onSelect: (e) => {
      onCheckedChange?.(!(checked === true));
      onSelect?.(e);
    },
  });
  return (
    <ItemBox
      style={style}
      textStyle={textStyle}
      disabled={disabled}
      onPress={press}
      padLeft={32}
      leftSlot={
        <View style={styles.indicator} pointerEvents="none">
          {checked === true ? <Check size={16} color={k.popoverForeground} /> : null}
        </View>
      }
    >
      {children}
    </ItemBox>
  );
}

function DropdownMenuRadioGroup({ value, onValueChange, style, children }) {
  return (
    <RadioContext.Provider value={{ value, onValueChange }}>
      <View style={style}>{children}</View>
    </RadioContext.Provider>
  );
}

function DropdownMenuRadioItem({ style, textStyle, value, disabled, onSelect, children }) {
  const k = tokensFor(useTheme());
  const radio = useContext(RadioContext);
  const selected = radio?.value === value;
  const press = useItemPress({
    disabled,
    onSelect: (e) => {
      radio?.onValueChange?.(value);
      onSelect?.(e);
    },
  });
  return (
    <ItemBox
      style={style}
      textStyle={textStyle}
      disabled={disabled}
      onPress={press}
      padLeft={32}
      leftSlot={
        <View style={styles.indicator} pointerEvents="none">
          {selected ? <Circle size={8} color={k.popoverForeground} fill={k.popoverForeground} /> : null}
        </View>
      }
    >
      {children}
    </ItemBox>
  );
}

function DropdownMenuLabel({ style, textStyle, inset, children }) {
  const k = tokensFor(useTheme());
  const text = { fontSize: 14, lineHeight: 20, fontWeight: '500', color: k.popoverForeground };
  const box = { paddingHorizontal: 8, paddingVertical: 6, paddingLeft: inset ? 32 : 8 };
  if (isAllText(children)) return <Text style={[text, box, style, textStyle]}>{children}</Text>;
  return <View style={[box, style]}>{renderTextChildren(children, [text, textStyle])}</View>;
}

function DropdownMenuSeparator({ style }) {
  const k = tokensFor(useTheme());
  return <View style={[{ backgroundColor: k.border, marginHorizontal: -4, marginVertical: 4, height: StyleSheet.hairlineWidth || 1 }, style]} />;
}

function DropdownMenuShortcut({ style, children }) {
  const k = tokensFor(useTheme());
  return <Text style={[{ marginLeft: 'auto', fontSize: 12, lineHeight: 16, letterSpacing: 1.2, color: k.mutedForeground }, style]}>{children}</Text>;
}

function DropdownMenuSub({ open: openProp, defaultOpen = false, onOpenChange, children }) {
  const [inner, setInner] = useState(Boolean(defaultOpen));
  const isControlled = openProp !== undefined;
  const open = isControlled ? Boolean(openProp) : inner;
  const setOpen = (next) => {
    if (!isControlled) setInner(next);
    onOpenChange?.(next);
  };
  return <SubContext.Provider value={{ open, setOpen }}>{children}</SubContext.Provider>;
}

function DropdownMenuSubTrigger({ style, textStyle, inset, disabled, children }) {
  const k = tokensFor(useTheme());
  const sub = useContext(SubContext);
  return (
    <ItemBox
      style={[sub?.open && { backgroundColor: k.accent }, style]}
      textStyle={textStyle}
      inset={inset}
      disabled={disabled}
      onPress={() => sub?.setOpen(!sub.open)}
      rightSlot={<ChevronRight size={16} color={k.mutedForeground} style={{ marginLeft: 'auto' }} />}
    >
      {children}
    </ItemBox>
  );
}

// On a phone the sub menu opens in place, under its trigger (there is no room to its side).
function DropdownMenuSubContent({ style, children }) {
  const k = tokensFor(useTheme());
  const sub = useContext(SubContext);
  if (!sub?.open) return null;
  return (
    <View style={[{ minWidth: 128, borderRadius: uiRadius.md, borderWidth: 1, borderColor: k.border, backgroundColor: k.popover, padding: 4, marginLeft: 8 }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: { position: 'absolute', left: 8, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
});

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
