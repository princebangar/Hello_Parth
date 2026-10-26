// Web: pages/restaurant/RestaurantSupport.jsx (/support and /help-centre/support) — "Support": ticket counters, the
// "Raise support ticket" form (category, priority, issue type (required), subject, order ID, description) ->
// POST restaurantAPI.createSupportTicket, and "My tickets" (status filter) <- restaurantAPI.getSupportTickets
// { status, limit: 100, page: 1 }, reloaded when the filter changes and after a submit. Same texts, limits and toasts.
// Native:
// - The page is a KeyboardAwareScrollView: the focused field (and the Submit button under the description, via
//   extraOffset) stays above the keyboard.
// - <select> -> a box that opens a bottom Sheet with the same options (check on the chosen one).
// - The web imports BottomNavOrders but never renders it on this page (and the bar hides itself on
//   /help-centre/support), so no bar here either.
// - restaurantTheme.css recolours: bg-amber-50 -> #F9F0F7, text-amber-700 / text-emerald-700 -> #991B1B.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronDown, ChevronLeft, Loader2, Send } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { KeyboardAwareScrollView, Screen, StatusBarSpacer, Sheet, Text, TextInput } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { restaurantAPI } from '@food/api';

const CATEGORY_OPTIONS = [
  { value: 'orders', label: 'Orders' },
  { value: 'payments', label: 'Payments' },
  { value: 'menu', label: 'Menu' },
  { value: 'restaurant', label: 'Restaurant Profile' },
  { value: 'technical', label: 'Technical' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
];

const getStatusStyle = (status) => {
  if (status === 'resolved') return { bg: colors.emerald[100], text: restaurantTheme.primaryStrong, border: colors.emerald[200] };
  if (status === 'in-progress') return { bg: colors.blue[100], text: colors.blue[700], border: colors.blue[200] };
  return { bg: colors.amber[100], text: restaurantTheme.primaryStrong, border: colors.amber[200] };
};

function Spinner({ size = 16, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

// <select> replacement: the box shows the chosen label, a tap opens the options in a bottom sheet
function SelectBox({ value, options, onSelect, style, textStyle, title }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.select, style]} accessibilityRole="combobox">
        <Text style={[styles.selectText, textStyle]} numberOfLines={1}>
          {current?.label ?? ''}
        </Text>
        <ChevronDown size={16} color={colors.slate[500]} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <View style={styles.sheetBody}>
          {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value || 'all'}
                  onPress={() => {
                    onSelect(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.sheetOption, pressed && { backgroundColor: colors.slate[50] }]}
                >
                  <Text style={[styles.sheetOptionText, selected && { fontWeight: '600', color: restaurantTheme.brand }]}>{option.label}</Text>
                  {selected ? <Check size={16} color={restaurantTheme.brand} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Sheet>
    </>
  );
}

function FocusInput({ style, multiline, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholderTextColor={colors.gray[400]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, multiline && styles.textarea, focused && styles.inputFocused, style]}
    />
  );
}

export default function RestaurantSupport() {
  const goBack = useRestaurantBackNavigation();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState({
    category: 'orders',
    issueType: '',
    subject: '',
    orderRef: '',
    priority: 'medium',
    description: '',
  });

  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === 'open').length;
    const inProgress = tickets.filter((t) => t.status === 'in-progress').length;
    const resolved = tickets.filter((t) => t.status === 'resolved').length;
    return { total, open, inProgress, resolved };
  }, [tickets]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const response = await restaurantAPI.getSupportTickets({
        status: statusFilter || undefined,
        limit: 100,
        page: 1,
      });
      const list = response?.data?.data?.tickets || [];
      setTickets(list);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load support tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!form.issueType.trim()) {
      toast.error('Issue type is required');
      return;
    }
    try {
      setSubmitting(true);
      await restaurantAPI.createSupportTicket({
        category: form.category,
        issueType: form.issueType.trim(),
        subject: form.subject.trim(),
        orderRef: form.orderRef.trim(),
        priority: form.priority,
        description: form.description.trim(),
      });
      toast.success('Support ticket submitted');
      setForm((prev) => ({ ...prev, issueType: '', subject: '', orderRef: '', description: '' }));
      await loadTickets();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to submit support ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen bg={colors.slate[50]} edges={[]}>
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.slate[100] }]}>
            <ChevronLeft size={24} color={colors.slate[900]} />
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Support</Text>
            <Text style={styles.headerSub}>Raise issue and track admin response</Text>
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: sp(28) + insets.bottom }]}
        extraOffset={80}
      >
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderColor: colors.slate[200], backgroundColor: colors.white }]}>
            <Text style={[styles.statLabel, { color: colors.slate[500] }]}>Total</Text>
            <Text style={[styles.statValue, { color: colors.slate[900] }]}>{stats.total}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: colors.amber[200], backgroundColor: restaurantTheme.primarySoft }]}>
            <Text style={[styles.statLabel, { color: restaurantTheme.primaryStrong }]}>Open</Text>
            <Text style={[styles.statValue, { color: colors.amber[800] }]}>{stats.open}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: colors.blue[200], backgroundColor: colors.blue[50] }]}>
            <Text style={[styles.statLabel, { color: colors.blue[700] }]}>In progress</Text>
            <Text style={[styles.statValue, { color: colors.blue[800] }]}>{stats.inProgress}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] }]}>
            <Text style={[styles.statLabel, { color: restaurantTheme.primaryStrong }]}>Resolved</Text>
            <Text style={[styles.statValue, { color: colors.emerald[800] }]}>{stats.resolved}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Raise support ticket</Text>
          <View style={styles.formGrid}>
            <SelectBox
              title="Category"
              value={form.category}
              options={CATEGORY_OPTIONS}
              onSelect={(v) => setForm((prev) => ({ ...prev, category: v }))}
            />
            <SelectBox
              title="Priority"
              value={form.priority}
              options={PRIORITY_OPTIONS}
              onSelect={(v) => setForm((prev) => ({ ...prev, priority: v }))}
            />
          </View>
          <FocusInput
            value={form.issueType}
            onChangeText={(v) => setForm((prev) => ({ ...prev, issueType: v }))}
            placeholder="Issue type (required)"
            maxLength={120}
          />
          <FocusInput
            value={form.subject}
            onChangeText={(v) => setForm((prev) => ({ ...prev, subject: v }))}
            placeholder="Short subject"
            maxLength={180}
          />
          <FocusInput
            value={form.orderRef}
            onChangeText={(v) => setForm((prev) => ({ ...prev, orderRef: v }))}
            placeholder="Order ID (optional)"
            maxLength={80}
          />
          <FocusInput
            value={form.description}
            onChangeText={(v) => setForm((prev) => ({ ...prev, description: v }))}
            placeholder="Describe your issue"
            maxLength={1000}
            multiline
          />
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [styles.submitBtn, submitting && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {submitting ? <Spinner size={16} color={colors.white} /> : <Send size={16} color={colors.white} />}
            <Text style={styles.submitText}>Submit Ticket</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.ticketsHead}>
            <Text style={styles.cardTitle}>My tickets</Text>
            <SelectBox
              title="Status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onSelect={setStatusFilter}
              style={styles.filterSelect}
              textStyle={styles.filterSelectText}
            />
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <Spinner size={16} color={colors.slate[500]} />
              <Text style={styles.loadingText}>Loading tickets...</Text>
            </View>
          ) : tickets.length === 0 ? (
            <View style={styles.loadingRow}>
              <Text style={styles.loadingText}>No support tickets found.</Text>
            </View>
          ) : (
            <View style={styles.ticketList}>
              {tickets.map((ticket) => {
                const st = getStatusStyle(ticket.status);
                return (
                  <View key={ticket._id} style={styles.ticket}>
                    <View style={styles.ticketTop}>
                      <Text style={styles.ticketMeta}>
                        #{String(ticket._id).slice(-6)} • {new Date(ticket.createdAt).toLocaleString()}
                      </Text>
                      <View style={[styles.statusPill, { backgroundColor: st.bg, borderColor: st.border }]}>
                        <Text style={[styles.statusPillText, { color: st.text }]}>
                          {ticket.status ? String(ticket.status).charAt(0).toUpperCase() + String(ticket.status).slice(1) : ''}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.ticketIssue}>{ticket.issueType}</Text>
                    {ticket.subject ? <Text style={styles.ticketLine}>Subject: {ticket.subject}</Text> : null}
                    {ticket.orderRef ? <Text style={styles.ticketLine}>Order: {ticket.orderRef}</Text> : null}
                    {ticket.description ? <Text style={styles.ticketDesc}>{ticket.description}</Text> : null}
                    {ticket.adminResponse ? (
                      <View style={styles.adminBox}>
                        <Text style={styles.adminLabel}>ADMIN RESPONSE</Text>
                        <Text style={styles.adminText}>{ticket.adminResponse}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.slate[200], zIndex: 40 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: sp(1), borderRadius: 9999 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  headerSub: { fontSize: 12, lineHeight: 16, color: colors.slate[500] },
  content: { paddingHorizontal: sp(4), paddingTop: sp(4), gap: sp(4) },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  statCard: { flexBasis: '48%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: sp(3) },
  statLabel: { fontSize: 12, lineHeight: 16 },
  statValue: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], padding: sp(4), gap: sp(3) },
  cardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
  formGrid: { gap: sp(3) },
  select: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.slate[300],
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(2),
  },
  selectText: { fontSize: 14, lineHeight: 20, color: colors.slate[900], flexShrink: 1 },
  filterSelect: { width: 'auto', paddingHorizontal: sp(2), paddingVertical: 6 },
  filterSelectText: { fontSize: 12, lineHeight: 16 },
  sheetBody: { paddingTop: sp(4), paddingBottom: sp(4) },
  sheetTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.slate[900], paddingHorizontal: sp(4), marginBottom: sp(2) },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(4), paddingVertical: sp(3.5) },
  sheetOptionText: { fontSize: 14, lineHeight: 20, color: colors.slate[900] },
  input: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.slate[300],
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate[900],
    backgroundColor: colors.white,
  },
  textarea: { minHeight: 96 },
  inputFocused: { borderColor: restaurantTheme.focusBorder },
  submitBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: sp(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
    ...shadow.lg,
    shadowColor: restaurantTheme.brand,
    shadowOpacity: 0.2,
  },
  submitText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  ticketsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(3) },
  loadingRow: { paddingVertical: sp(8), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2) },
  loadingText: { color: colors.slate[500], fontSize: 14, lineHeight: 20, textAlign: 'center' },
  ticketList: { gap: sp(3) },
  ticket: { borderRadius: 14, borderWidth: 1, borderColor: colors.slate[200], padding: sp(3) },
  ticketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(2) },
  ticketMeta: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500], flexShrink: 1 },
  statusPill: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999, borderWidth: 1 },
  statusPillText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  ticketIssue: { marginTop: sp(2), fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[900] },
  ticketLine: { fontSize: 12, lineHeight: 16, color: colors.slate[600], marginTop: sp(1) },
  ticketDesc: { fontSize: 14, lineHeight: 20, color: colors.slate[700], marginTop: sp(2) },
  adminBox: { marginTop: sp(3), borderRadius: 10, borderWidth: 1, borderColor: colors.blue[200], backgroundColor: colors.blue[50], padding: sp(2.5) },
  adminLabel: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.blue[700] },
  adminText: { fontSize: 14, lineHeight: 20, color: colors.blue[900], marginTop: sp(1) },
});
