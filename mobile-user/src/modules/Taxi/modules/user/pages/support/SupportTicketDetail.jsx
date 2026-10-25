import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Loader2, Send } from 'lucide-react-native';
import { useLocation, useNavigate, useParams } from '@/lib/router';
import { Screen, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors, useTheme } from '@/theme';
import { supportTicketService } from '../../../shared/services/supportTicketService';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

// --user-* palette of modules/Taxi/index.css; the Taxi scope remaps bg-white / slate text / borders to it.
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
const ACCENT = '#FFC400';
// `.user-app-theme .shadow-sm` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const STATUS_STYLES = {
  pending: { color: colors.orange[600], borderColor: colors.orange[100] },
  assigned: { color: colors.blue[600], borderColor: colors.blue[100] },
  closed: { color: colors.emerald[600], borderColor: colors.emerald[100] },
};

const FadeUp = ({ delay = 0, style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>{children}</Animated.View>;
};

const toEntry = (item) => ({
  id: item.id,
  senderRole: item.senderRole,
  senderName: item.senderName,
  message: item.message,
  createdAt: item.createdAt,
});

const SupportTicketDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { id: ticketCode } = useParams();
  const pathRole = getAppRoutePath().includes('/taxi/driver') ? 'driver' : 'user';
  const ticketFromState = location.state?.ticket || null;

  const [ticket, setTicket] = useState(ticketFromState);
  const [messages, setMessages] = useState((ticketFromState?.messages || []).map(toEntry));
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading] = useState(!ticketFromState);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  const fetchTicket = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await supportTicketService.getMyTicket(ticketCode);
      const nextTicket = response?.data || null;
      setTicket(nextTicket);
      setMessages((nextTicket?.messages || []).map(toEntry));
    } catch (apiError) {
      setError(apiError?.message || 'Unable to load support ticket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ticketCode) return;
    fetchTicket();
  }, [ticketCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setError('');
    try {
      await supportTicketService.replyMyTicket(ticketCode, { message: text });
      setReply('');
      await fetchTicket();
    } catch (apiError) {
      setError(apiError?.message || 'Unable to send reply');
    } finally {
      setSending(false);
    }
  };

  const statusStyle = STATUS_STYLES[ticket?.status] || STATUS_STYLES.pending;
  const canSend = Boolean(reply.trim());

  return (
    <Screen bg={p.bg} edges={['top']} keyboard>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: p.card, borderBottomColor: p.border }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [styles.iconBtn, SH, { borderColor: p.border, backgroundColor: p.card }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={p.text} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: p.sec }]}>{String(ticket?.supportType || 'support').toUpperCase()}</Text>
            <Text numberOfLines={1} style={[styles.h1, { color: p.text }]}>{ticket?.title || 'Support Ticket'}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: p.soft, borderColor: statusStyle.borderColor }]}>
            <Text style={[styles.statusText, { color: statusStyle.color }]}>{ticket?.status || 'pending'}</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.loading}>
            <Spin>
              <Loader2 size={20} color={p.sec} />
            </Spin>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: p.soft }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.senderRole === pathRole;
          return (
            <FadeUp key={m.id} delay={i * 40} style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <View
                style={[
                  styles.bubble,
                  { backgroundColor: p.card },
                  mine ? { borderBottomRightRadius: 4 } : [styles.otherBubble, { borderColor: p.border, borderBottomLeftRadius: 4 }],
                ]}
              >
                <Text style={[styles.msg, { color: p.text }]}>{m.message}</Text>
                <Text style={[styles.time, mine ? { color: 'rgba(255,255,255,0.5)', textAlign: 'right' } : { color: p.sec }]}>
                  {new Date(m.createdAt).toLocaleString()}
                </Text>
              </View>
            </FadeUp>
          );
        })}
      </ScrollView>

      {/* Reply bar */}
      <View style={[styles.replyBar, { backgroundColor: p.card, borderTopColor: p.border, paddingBottom: 24 + insets.bottom }]}>
        <TextInput
          value={reply}
          onChangeText={setReply}
          placeholder="Type your reply..."
          placeholderTextColor={colors.slate[300]}
          multiline
          submitBehavior="submit"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            { backgroundColor: p.card, borderColor: focused ? ACCENT : p.border, color: p.text },
            focused && { borderWidth: 2, paddingHorizontal: 15, paddingVertical: 11 },
          ]}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend || sending}
          style={({ pressed }) => [
            styles.send,
            canSend ? [{ backgroundColor: ACCENT }, SH] : { backgroundColor: p.soft },
            pressed && { transform: [{ scale: 0.9 }] },
          ]}
        >
          {sending ? (
            <Spin><View style={styles.ring} /></Spin>
          ) : (
            <Send size={16} color={canSend ? p.text : p.sec} strokeWidth={2.5} />
          )}
        </Pressable>
      </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  kicker: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 2.7 },
  h1: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1, marginTop: 4 },
  statusText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700' },
  messages: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: colors.red[100], paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.red[600] },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  otherBubble: {
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  msg: { fontSize: 13, lineHeight: 21, fontWeight: '600' },
  time: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', marginTop: 4 },
  replyBar: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontWeight: '600', maxHeight: 120 },
  send: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' },
});

export default SupportTicketDetail;
