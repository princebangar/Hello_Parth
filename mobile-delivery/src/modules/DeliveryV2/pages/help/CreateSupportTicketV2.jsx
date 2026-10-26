import React, { useState, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft, Check, ChevronDown, Loader2, Send } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { KeyboardAwareScrollView, Screen, Sheet, Text, TextInput } from '@/native/ui';
import { colors, fonts, shadow } from '@/theme';
import { deliveryAPI } from '@food/api';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';

const CATEGORY_OPTIONS = [
  { value: "payment", label: "Payment" },
  { value: "order", label: "Order" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Tech Issue" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function Spinner({ color, size }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

/**
 * CreateSupportTicketV2 - Restored Old UI for Ticket Creation.
 */
export const CreateSupportTicketV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    description: "",
    category: "other",
    priority: "medium"
  });
  const [focused, setFocused] = useState(null);
  const [selectOpen, setSelectOpen] = useState(null); // 'category' | 'priority'

  const handleSubmit = async () => {
    if (form.subject.length < 3) return toast.error("Subject too short");
    if (form.description.length < 10) return toast.error("Description too short");

    setLoading(true);
    try {
      const response = await deliveryAPI.createSupportTicket(form);
      if (response?.data?.success) {
        toast.success("Ticket raised successfully");
        goBack();
      }
    } catch {
      toast.error("Failed to create ticket");
    } finally {
      setLoading(false);
    }
    return undefined;
  };

  const selectOptions = selectOpen === 'category' ? CATEGORY_OPTIONS : PRIORITY_OPTIONS;
  const labelOf = (options, value) => options.find((o) => o.value === value)?.label || value;

  return (
    <Screen bg={colors.white}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[50] }]}>
          <ArrowLeft size={24} color={colors.gray[950]} />
        </Pressable>
        <Text style={styles.title}>RAISE TICKET</Text>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 24 }}>
          {/* Subject */}
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>ISSUE TOPIC</Text>
            <TextInput
              placeholder="Main subject of your concern"
              value={form.subject}
              onChangeText={(text) => setForm({ ...form, subject: text })}
              onFocus={() => setFocused('subject')}
              onBlur={() => setFocused(null)}
              placeholderTextColor={colors.gray[400]}
              style={[styles.input, focused === 'subject' && styles.inputFocused]}
            />
          </View>

          {/* Description */}
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>DETAIL DESCRIPTION</Text>
            <TextInput
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              placeholder="Explain your issue here..."
              value={form.description}
              onChangeText={(text) => setForm({ ...form, description: text })}
              onFocus={() => setFocused('description')}
              onBlur={() => setFocused(null)}
              placeholderTextColor={colors.gray[400]}
              style={[styles.input, { minHeight: 152 }, focused === 'description' && styles.inputFocused]}
            />
          </View>

          {/* Category & Priority */}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={styles.label}>CATEGORY</Text>
              <Pressable onPress={() => setSelectOpen('category')} style={[styles.input, styles.select]}>
                <Text style={styles.selectText} numberOfLines={1}>{labelOf(CATEGORY_OPTIONS, form.category).toUpperCase()}</Text>
                <ChevronDown size={16} color={colors.gray[500]} />
              </Pressable>
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={styles.label}>PRIORITY</Text>
              <Pressable onPress={() => setSelectOpen('priority')} style={[styles.input, styles.select]}>
                <Text style={styles.selectText} numberOfLines={1}>{labelOf(PRIORITY_OPTIONS, form.priority).toUpperCase()}</Text>
                <ChevronDown size={16} color={colors.gray[500]} />
              </Pressable>
            </View>
          </View>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.submit, loading && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          {loading ? <Spinner size={20} color={colors.white} /> : <Send size={20} color={colors.white} />}
          <Text style={styles.submitText}>SUBMIT TICKET</Text>
        </Pressable>
      </KeyboardAwareScrollView>

      {/* <select> for category / priority */}
      <Sheet open={Boolean(selectOpen)} onClose={() => setSelectOpen(null)} style={{ backgroundColor: colors.white }}>
        <View style={{ paddingTop: 16, paddingBottom: 12 }}>
          <Text style={styles.sheetTitle}>{selectOpen === 'category' ? 'Category' : 'Priority'}</Text>
          {selectOptions.map((opt) => {
            const selected = form[selectOpen] === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setForm((prev) => ({ ...prev, [selectOpen]: opt.value }));
                  setSelectOpen(null);
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <Text style={[styles.optionText, selected && { color: PRIMARY, fontWeight: '700' }]}>{opt.label}</Text>
                {selected ? <Check size={18} color={PRIMARY} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.gray[50], zIndex: 50, ...shadow.sm },
  backBtn: { padding: 4, borderRadius: 9999 },
  title: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.gray[950], letterSpacing: -0.5 },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 40, gap: 32 },
  label: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', color: colors.gray[400], letterSpacing: 1, marginLeft: 4 },
  input: { width: '100%', backgroundColor: colors.white, borderWidth: 1, borderColor: '#D1DCEB', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#0F1724', elevation: 3, shadowColor: '#112743', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } },
  inputFocused: { borderColor: '#8AA4C5' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontFamily: fonts.sora, fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.gray[800], letterSpacing: 1.2, flexShrink: 1 },
  submit: { width: '100%', backgroundColor: colors.black, padding: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: '#D1DCEB', ...shadow['2xl'] },
  submitText: { color: colors.white, fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900', letterSpacing: 1.4 },
  sheetTitle: { fontFamily: fonts.sora, fontSize: 16, fontWeight: '700', color: colors.gray[900], paddingHorizontal: 20, paddingBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { fontSize: 16, color: colors.gray[800] },
});
