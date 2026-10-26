// sonner's <Toaster position="top-center" richColors closeButton offset="80px" visibleToasts={1} /> look.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react-native';
import { colors, radius, shadow } from '@/theme';
import { subscribeToasts, toast as toastApi } from '@/lib/toast';
import { Text } from './Text';

// sonner richColors
const RICH = {
  success: { bg: '#ecfdf3', border: '#bffcd9', text: '#008a2e', Icon: CheckCircle2 },
  error: { bg: '#fff0f0', border: '#ffe0e1', text: '#e60000', Icon: XCircle },
  info: { bg: '#f0f8ff', border: '#d3e0fd', text: '#0973dc', Icon: Info },
  warning: { bg: '#fffcf0', border: '#fdf5d3', text: '#dc7609', Icon: AlertTriangle },
  default: { bg: colors.white, border: colors.gray[200], text: colors.gray[900], Icon: null },
  loading: { bg: colors.white, border: colors.gray[200], text: colors.gray[900], Icon: null },
};

function ToastCard({ item }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [anim]);
  const style = { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] };
  if (item.type === 'custom') {
    return <Animated.View style={style}>{item.render?.(item.id)}</Animated.View>;
  }
  const c = RICH[item.type] || RICH.default;
  const Icon = c.Icon;
  return (
    <Animated.View style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }, style]}>
      {item.type === 'loading' ? <ActivityIndicator size="small" color={colors.gray[500]} /> : Icon ? <Icon size={18} color={c.text} /> : null}
      <View style={styles.body}>
        {!!item.message && <Text style={[styles.title, { color: c.text }]}>{String(item.message)}</Text>}
        {!!item.description && <Text style={[styles.desc, { color: c.text }]}>{String(item.description)}</Text>}
      </View>
      {item.action ? (
        <Pressable onPress={() => item.action.onClick?.()} style={styles.action}>
          <Text style={styles.actionText}>{item.action.label}</Text>
        </Pressable>
      ) : null}
      <Pressable hitSlop={10} onPress={() => toastApi.dismiss(item.id)} style={styles.close}>
        <X size={12} color={colors.gray[500]} />
      </Pressable>
    </Animated.View>
  );
}

export function Toaster() {
  const [items, setItems] = useState([]);
  const insets = useSafeAreaInsets();
  useEffect(() => subscribeToasts(setItems), []);
  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 16 }]}>
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 9999, elevation: 9999 },
  card: {
    width: '100%',
    maxWidth: 356,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 28,
    borderRadius: radius.lg,
    borderWidth: 1,
    ...shadow.md,
  },
  body: { flex: 1 },
  title: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  desc: { fontSize: 13, lineHeight: 18, opacity: 0.9 },
  action: { backgroundColor: colors.gray[900], borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '500' },
  close: { position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], alignItems: 'center', justifyContent: 'center' },
});
