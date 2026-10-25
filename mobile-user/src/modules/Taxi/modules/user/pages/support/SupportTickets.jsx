import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, Plus, ChevronRight, ChevronDown, Headset, X, AlertCircle, Loader2 } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Screen, Sheet, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, useTheme } from '@/theme';
import { supportTicketService } from '../../../shared/services/supportTicketService';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

// --user-* palette of modules/Taxi/index.css; the Taxi scope remaps bg-white / slate text / borders to it.
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
const ACCENT = '#FFC400';
const INK = '#0b1220';
// `.user-app-theme .shadow-sm` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const STATUS_STYLES = {
  pending: { color: colors.orange[600], borderColor: colors.orange[100] },
  assigned: { color: colors.blue[600], borderColor: colors.blue[100] },
  closed: { color: colors.emerald[600], borderColor: colors.emerald[100] },
};

const TABS = ['All', 'Open', 'Resolved'];

// framer-motion initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} with a per-row delay
const FadeUp = ({ delay = 0, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
};

const SupportTickets = () => {
  const navigate = useNavigate();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const [tickets, setTickets] = useState([]);
  const [titleOptions, setTitleOptions] = useState([]);
  const [activeTab, setActiveTab]   = useState('All');
  const [showForm, setShowForm]     = useState(false);
  const [titleId, setTitleId]       = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [description, setDesc]      = useState('');
  const [errors, setErrors]         = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectOpen, setSelectOpen] = useState(false);
  const [focused, setFocused] = useState('');

  const rolePrefix = getAppRoutePath().includes('/taxi/driver') ? '/taxi/driver' : '/taxi/user';
  const requesterType = rolePrefix.includes('/driver') ? 'driver' : 'user';

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [titlesResponse, ticketsResponse] = await Promise.all([
        supportTicketService.getTitles(requesterType),
        supportTicketService.listMyTickets({ page: 1, limit: 100 }),
      ]);

      setTitleOptions(titlesResponse?.data?.results || []);
      setTickets(ticketsResponse?.data?.results || []);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to load support data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [requesterType]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return tickets.filter((ticket) => {
      if (activeTab === 'All') return true;
      if (activeTab === 'Open') return ['pending', 'assigned'].includes(ticket.status);
      return ticket.status === 'closed';
    });
  }, [tickets, activeTab]);

  const validate = () => {
    const e = {};
    if (!titleId && !customTitle.trim()) e.title = 'Select title or write custom title';
    if (!description.trim()) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await supportTicketService.createTicket({
        titleId: titleId || undefined,
        title: customTitle || undefined,
        description,
        message: description,
      });
      const newTicket = created?.data;
      setTickets((prev) => [newTicket, ...prev]);
      setTitleId('');
      setCustomTitle('');
      setDesc('');
      setErrors({});
      setShowForm(false);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to raise support ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTitle = titleOptions.find((option) => String(option.id) === String(titleId));
  const fieldStyle = (name) => [
    styles.field,
    { backgroundColor: p.soft, borderColor: focused === name ? ACCENT : p.border, color: p.text },
  ];

  const header = (
    <View style={[styles.header, { backgroundColor: p.card, borderBottomColor: p.border }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigate(-1)}
          style={({ pressed }) => [styles.iconBtn, SH, { borderColor: p.border, backgroundColor: p.card }, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <ArrowLeft size={18} color={p.text} strokeWidth={2.5} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: p.sec }]}>HELP CENTER</Text>
          <Text style={[styles.h1, { color: p.text }]}>Support Tickets</Text>
        </View>
        <Pressable
          onPress={() => setShowForm(true)}
          style={({ pressed }) => [styles.plusBtn, SH, pressed && { transform: [{ scale: 0.9 }] }]}
        >
          <Plus size={16} color={p.text} strokeWidth={3} />
        </Pressable>
      </View>
      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && [styles.tabActive, SH, { backgroundColor: p.card }]]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? p.text : p.muted }]}>{tab.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const listHeader = (
    <View style={{ gap: 10 }}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: p.soft }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <Spin>
            <Loader2 size={22} color={p.sec} />
          </Spin>
        </View>
      ) : null}

      {!loading && filtered.length === 0 && (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: p.card, borderColor: p.border }]}>
            <Headset size={36} color={p.sec} strokeWidth={1.5} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.emptyTitle, { color: p.sec }]}>No tickets yet</Text>
            <Text style={[styles.emptySub, { color: p.sec }]}>Tap + to get help</Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <Screen bg={p.bg} edges={['top']}>
      {header}

      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(item, index) => String(item?.id ?? item?.ticketCode ?? index)}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: ticket, index }) => {
          const statusStyle = STATUS_STYLES[ticket.status] || STATUS_STYLES.pending;
          return (
            <FadeUp delay={index * 50}>
              <Pressable
                onPress={() => navigate(`${rolePrefix}/support/ticket/${ticket.ticketCode}`, { state: { ticket } })}
                style={({ pressed }) => [styles.ticket, { borderColor: p.border, backgroundColor: p.card }, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <View style={[styles.ticketIcon, { backgroundColor: p.soft }]}>
                  <Headset size={16} color={colors.blue[500]} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.ticketTop}>
                    <Text numberOfLines={1} style={[styles.ticketTitle, { color: p.text }]}>{ticket.title}</Text>
                    <View style={[styles.statusPill, { backgroundColor: p.soft, borderColor: statusStyle.borderColor }]}>
                      <Text style={[styles.statusText, { color: statusStyle.color }]}>{ticket.status}</Text>
                    </View>
                  </View>
                  <Text style={[styles.ticketSub, { color: p.sec }]}>
                    {ticket.supportType} · {new Date(ticket.updatedAt).toLocaleString()}
                  </Text>
                </View>
                <ChevronRight size={15} color={p.sec} strokeWidth={2.5} style={{ marginTop: 4 }} />
              </Pressable>
            </FadeUp>
          );
        }}
      />

      {/* New ticket bottom sheet */}
      <Sheet open={showForm} onClose={() => setShowForm(false)} style={[styles.sheet, { backgroundColor: p.card }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
          <View style={[styles.handle, { backgroundColor: p.soft }]} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: p.text }]}>New Ticket</Text>
            <Pressable onPress={() => setShowForm(false)} style={[styles.closeBtn, { backgroundColor: p.card }]}>
              <X size={15} color={p.muted} strokeWidth={2.5} />
            </Pressable>
          </View>
          <View style={{ gap: 16 }}>
            <View>
              <Text style={[styles.label, { color: p.sec }]}>TICKET TITLE</Text>
              <Pressable
                onPress={() => setSelectOpen((open) => !open)}
                style={[styles.field, styles.select, { backgroundColor: p.soft, borderColor: selectOpen ? ACCENT : p.border }]}
              >
                <Text numberOfLines={1} style={[styles.fieldText, { color: p.text, flex: 1 }]}>{selectedTitle?.title || 'Select title'}</Text>
                <ChevronDown size={16} color={p.muted} />
              </Pressable>
              {selectOpen ? (
                <View style={[styles.options, { backgroundColor: p.card, borderColor: p.border }]}>
                  {[{ id: '', title: 'Select title' }, ...titleOptions].map((option) => (
                    <Pressable
                      key={String(option.id) || 'none'}
                      onPress={() => {
                        setTitleId(option.id ? String(option.id) : '');
                        setErrors((prev) => ({ ...prev, title: '' }));
                        setSelectOpen(false);
                      }}
                      style={({ pressed }) => [styles.option, (pressed || String(option.id) === String(titleId)) && { backgroundColor: p.soft }]}
                    >
                      <Text style={[styles.fieldText, { color: p.text }]}>{option.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View>
              <Text style={[styles.label, { color: p.sec }]}>OR CUSTOM TITLE</Text>
              <TextInput
                value={customTitle}
                onChangeText={(value) => { setCustomTitle(value); setErrors((prev) => ({ ...prev, title: '' })); }}
                placeholder="Write custom title if not listed"
                placeholderTextColor={colors.slate[300]}
                onFocus={() => setFocused('title')}
                onBlur={() => setFocused('')}
                style={fieldStyle('title')}
              />
              {errors.title ? (
                <View style={styles.errRow}>
                  <AlertCircle size={11} strokeWidth={3} color={colors.red[500]} />
                  <Text style={styles.errMsg}>{errors.title}</Text>
                </View>
              ) : null}
            </View>
            <View>
              <Text style={[styles.label, { color: p.sec }]}>DESCRIPTION</Text>
              <TextInput
                value={description}
                onChangeText={(value) => { setDesc(value); setErrors((prev) => ({ ...prev, description: '' })); }}
                placeholder="Describe your issue in detail..."
                placeholderTextColor={colors.slate[300]}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                onFocus={() => setFocused('description')}
                onBlur={() => setFocused('')}
                style={[fieldStyle('description'), { minHeight: 112 }]}
              />
              {errors.description ? (
                <View style={styles.errRow}>
                  <AlertCircle size={11} strokeWidth={3} color={colors.red[500]} />
                  <Text style={styles.errMsg}>{errors.description}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [styles.submit, SH, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              {submitting ? (
                <Spin><View style={styles.ring} /></Spin>
              ) : (
                <Text style={styles.submitText}>SUBMIT TICKET</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
    zIndex: 20,
    borderBottomWidth: 1,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 2.7 },
  h1: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.47 },
  plusBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: '#FFFDF0', borderWidth: 1, borderColor: alpha(colors.yellow[100], 0.7), padding: 4, borderRadius: 14 },
  tab: { flex: 1, paddingVertical: 6, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  tabActive: { borderColor: alpha(colors.slate[100], 0.8) },
  tabText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1 },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  errorBox: { marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.red[100], paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.red[600] },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 16 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  emptySub: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 4 },
  ticket: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  ticketIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  ticketTitle: { flex: 1, fontSize: 14, lineHeight: 17, fontWeight: '700' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 1 },
  statusText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700' },
  ticketSub: { fontSize: 11, lineHeight: 15, fontWeight: '600', marginTop: 4 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 9999, alignSelf: 'center', marginBottom: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, marginLeft: 4, marginBottom: 4 },
  field: { width: '100%', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontWeight: '600', borderWidth: 2 },
  fieldText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  options: { marginTop: 6, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  option: { paddingHorizontal: 16, paddingVertical: 10 },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4, marginTop: 4 },
  errMsg: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.red[500] },
  submit: { width: '100%', backgroundColor: ACCENT, paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4, color: INK },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' },
});

export default SupportTickets;
