import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Phone, Loader2 } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Screen, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors, useTheme } from '@/theme';
import UserSupportChatPanel from '../../../shared/components/UserSupportChatPanel';
import { socketService } from '../../../../shared/api/socket';
import { getCurrentRide } from '../../services/currentRideService';
import { markRideChatSeen } from '../../../shared/chat/useRideChatUnread';

// Ride chat is plain text: emojis (typed or pasted) are stripped.
const EMOJI_PATTERN = (() => {
  try {
    return new RegExp('[\\p{Extended_Pictographic}\\u200d\\ufe0f\\u20e3]', 'gu');
  } catch {
    // engines without Unicode property escapes: pictographs (surrogate pairs + misc symbols) and joiners
    return /[☀-➿‍️⃣]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g;
  }
})();
const stripEmojis = (value) => String(value || '').replace(EMOJI_PATTERN, '');

// Give up waiting for the first ride state after this long and open the chat anyway (sent messages are queued).
const JOIN_GIVE_UP_MS = 7000;
const JOIN_RETRY_MS = 2500;

const RIDE_EVENTS = {
  joined: 'ride:joined',
  state: 'ride:state',
  send: 'ride:message:send',
  incoming: 'ride:message:new',
};

// --user-* palette of modules/Taxi/index.css; the Taxi scope remaps bg-white / slate text / borders to it.
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
const ACCENT = '#FFC400';
// `.user-app-theme .shadow-sm` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };
const BTN_SHADOW = { elevation: 2, shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } };

const toClock = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toUpperCase();
};

const normalizeMessage = (message, fallbackRole) => ({
  id: String(message?.id || message?._id || `${message?.senderId || 'msg'}-${message?.sentAt || Date.now()}`),
  senderRole: String(message?.senderRole || fallbackRole || '').toLowerCase(),
  senderId: String(message?.senderId || ''),
  message: String(message?.message || '').trim(),
  sentAt: message?.sentAt || new Date().toISOString(),
  clientId: String(message?.clientId || ''),
});

const buildPeerFromRideState = (ride, chatRole, fallbackPeer = {}) => {
  const otherParty = chatRole === 'driver' ? ride?.user : ride?.driver;
  const fallbackName = chatRole === 'driver' ? 'Passenger' : 'Driver';
  const fallbackSubtitle = chatRole === 'driver' ? 'Passenger - Active now' : 'Driver - Active now';

  return {
    name: otherParty?.name || fallbackPeer.name || fallbackName,
    phone: otherParty?.phone || otherParty?.mobile || otherParty?.phoneNumber || fallbackPeer.phone || '',
    subtitle: fallbackPeer.subtitle || fallbackSubtitle,
  };
};

// motion.div initial={{ opacity: 0, y: 8, x: ±12 }} animate={{ opacity: 1, y: 0, x: 0 }} (0.22 s); rows that were
// already there when the list appeared do not animate (AnimatePresence initial={false}).
const MessageIn = ({ fromRight, animate, children }) => {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (animate) Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [animate, v]);
  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        justifyContent: fromRight ? 'flex-end' : 'flex-start',
        opacity: v,
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [fromRight ? 12 : -12, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
};

const HeaderIn = ({ style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}>{children}</Animated.View>;
};

const tap = (scale) => ({ pressed }) => (pressed ? { transform: [{ scale }] } : null);

const Chat = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const searchParams = new URLSearchParams(location.search);
  const isAdminChat = searchParams.get('admin') === 'true';
  const routeRole = searchParams.get('role');
  const isDriverRoute = location.pathname.startsWith('/taxi/driver');
  const chatRole = routeRole === 'driver' || routeRole === 'user'
    ? routeRole
    : isDriverRoute
      ? 'driver'
      : 'user';

  // Kept in a ref: a fresh {} on every render used to restart the join effect (and re-join the ride) in a loop.
  const peerFromStateRef = useRef(location.state?.peer || location.state?.driver || {});
  const peerFromState = peerFromStateRef.current;
  const initialDraft = String(location.state?.initialDraft || '').trim();
  const rideId = location.state?.rideId || getCurrentRide()?.rideId || '';
  const hasLiveToken = Boolean(
    chatRole === 'driver'
      ? localStorage.getItem('driverToken') || localStorage.getItem('token')
      : localStorage.getItem('userToken') || localStorage.getItem('token'),
  );

  const [messages, setMessages] = useState(() => (
    isAdminChat
      ? [{ id: 'support-init', sender: 'other', text: 'Hello! How can we help you today?', time: '12:45' }]
      : []
  ));
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const initialIdsRef = useRef(null);
  const [chatError, setChatError] = useState('');
  const [isJoiningRide, setIsJoiningRide] = useState(!isAdminChat);
  const [resolvedPeer, setResolvedPeer] = useState({
    name: peerFromState.name || (chatRole === 'driver' ? 'Passenger' : 'Driver'),
    phone: peerFromState.phone || peerFromState.mobile || peerFromState.phoneNumber || '',
    subtitle: peerFromState.subtitle || (chatRole === 'driver' ? 'Passenger - Active now' : 'Driver - Active now'),
  });

  // Scroll only the message list: the header and the input bar stay where they are.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages, isJoiningRide, chatError]);

  // Everything on screen is read: clears the unread count on the trip screen's chat button.
  useEffect(() => {
    if (isAdminChat || !rideId) return;
    const latestIncoming = messages.reduce((latest, entry) => (entry.sender === 'other' && !entry.pending ? Math.max(latest, entry.at || 0) : latest), 0);
    if (latestIncoming) markRideChatSeen(chatRole, rideId, latestIncoming);
  }, [chatRole, isAdminChat, messages, rideId]);

  const quickReplies = isAdminChat
    ? ['Payment Issue', 'Ride Cancelled', 'Lost Item', 'Safety']
    : ['Wait for me', "I'm coming", 'Where exactly?', 'Okay'];

  useEffect(() => {
    if (isAdminChat || !hasLiveToken) {
      return undefined;
    }

    if (!rideId) {
      setIsJoiningRide(false);
      setChatError('Ride chat is unavailable because no active ride was found.');
      return undefined;
    }

    const socket = socketService.connect({ role: chatRole });
    if (!socket) {
      setIsJoiningRide(false);
      setChatError('Could not connect trip chat right now.');
      return undefined;
    }

    const toEntry = (message) => ({
      id: message.id,
      clientId: message.clientId,
      sender: message.senderRole === chatRole ? 'user' : 'other',
      text: message.message,
      time: toClock(message.sentAt),
      at: new Date(message.sentAt).getTime() || Date.now(),
    });

    const onRideState = (ride) => {
      if (!ride || String(ride.rideId || ride._id || '') !== String(rideId)) {
        return;
      }

      setResolvedPeer(buildPeerFromRideState(ride, chatRole, peerFromState));
      const saved = Array.isArray(ride.messages)
        ? ride.messages
            .map((message) => normalizeMessage(message, chatRole))
            .filter((message) => message.message)
            .map(toEntry)
        : [];
      // Messages still on their way (not in the server list yet) stay on screen.
      setMessages((prev) => [...saved, ...prev.filter((entry) => entry.pending && !saved.some((item) => item.text === entry.text && item.sender === 'user'))].sort((a, b) => a.at - b.at));
      setChatError('');
      setIsJoiningRide(false);
    };

    const onRideJoined = (payload) => {
      if (String(payload?.rideId || '') === String(rideId)) {
        setChatError('');
        setIsJoiningRide(false);
      }
    };

    const onRideMessage = (message) => {
      const normalized = normalizeMessage(message, chatRole);
      if (!normalized.message || String(message?.rideId || '') !== String(rideId)) {
        return;
      }

      setMessages((prev) => {
        if (prev.some((entry) => entry.id === normalized.id)) {
          return prev;
        }

        const entry = toEntry(normalized);
        // Our own message coming back from the server replaces the "sending" copy.
        const pendingIndex = normalized.clientId ? prev.findIndex((item) => item.clientId === normalized.clientId) : -1;
        if (pendingIndex >= 0) {
          const next = [...prev];
          next[pendingIndex] = entry;
          return next.sort((a, b) => a.at - b.at);
        }

        return [...prev, entry].sort((a, b) => a.at - b.at);
      });
    };

    const onSocketError = (payload) => {
      const nextMessage = payload?.message || 'Could not load ride chat.';
      setChatError(nextMessage);
      setIsJoiningRide(false);
      setMessages((prev) => prev.map((entry) => (entry.pending ? { ...entry, pending: false, failed: true } : entry)));
    };

    const joinRide = () => {
      socketService.emit('ride:join', { rideId });
    };

    socketService.on(RIDE_EVENTS.state, onRideState);
    socketService.on(RIDE_EVENTS.joined, onRideJoined);
    socketService.on(RIDE_EVENTS.incoming, onRideMessage);
    socketService.on('errorMessage', onSocketError);
    // A dropped and restored connection starts a new server socket: join again and pull the missed messages.
    socketService.on('connect', joinRide);

    joinRide();
    const retryTimer = setTimeout(joinRide, JOIN_RETRY_MS);
    const giveUpTimer = setTimeout(() => setIsJoiningRide(false), JOIN_GIVE_UP_MS);

    return () => {
      clearTimeout(retryTimer);
      clearTimeout(giveUpTimer);
      socketService.off(RIDE_EVENTS.state, onRideState);
      socketService.off(RIDE_EVENTS.joined, onRideJoined);
      socketService.off(RIDE_EVENTS.incoming, onRideMessage);
      socketService.off('errorMessage', onSocketError);
      socketService.off('connect', joinRide);
    };
  }, [chatRole, hasLiveToken, isAdminChat, peerFromState, rideId]);

  if (isAdminChat && hasLiveToken) {
    return (
      <Screen bg={p.bg} edges={['top']} keyboard>
        <View style={[styles.adminHead, { backgroundColor: p.card, borderBottomColor: p.border }]}>
          <Pressable onPress={() => navigate(-1)} accessibilityLabel="Back" style={(s) => [styles.adminBack, tap(0.95)(s)]}>
            <ArrowLeft size={22} strokeWidth={2.4} color={p.text} />
          </Pressable>
          <Text style={[styles.adminTitle, { color: p.text }]}>
            {chatRole === 'driver' ? 'Captain support' : 'Live chat'}
          </Text>
        </View>
        <UserSupportChatPanel
          mode="participant"
          title={chatRole === 'driver' ? 'Captain support' : 'Hello Parth support'}
          preferredRole={chatRole}
          initialDraft={initialDraft}
          style={{ flex: 1 }}
        />
      </Screen>
    );
  }

  const send = (text) => {
    const outgoing = stripEmojis(text || input).trim();
    if (!outgoing || !rideId) {
      return;
    }

    const clientId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    setInput('');
    setChatError('');
    // Shows at once as "sending"; the server copy (same clientId) replaces it with the real time.
    setMessages((prev) => [
      ...prev,
      { id: clientId, clientId, sender: 'user', text: outgoing, time: toClock(new Date()), at: Date.now(), pending: true },
    ]);
    socketService.emit(RIDE_EVENTS.send, {
      rideId,
      message: outgoing,
      clientId,
    });
  };

  const otherName = resolvedPeer.name;
  const otherSub = resolvedPeer.subtitle;
  const otherPhone = resolvedPeer.phone;
  const avatarName = encodeURIComponent(otherName);
  const canSend = Boolean(input.trim()) && Boolean(rideId);

  if (!isJoiningRide && initialIdsRef.current === null) {
    initialIdsRef.current = new Set(messages.map((m) => m.id));
  }

  return (
    <Screen bg={p.bg} edges={['top']} keyboard>
      <HeaderIn style={[styles.header, { backgroundColor: p.card, borderBottomColor: p.border }]}>
        <Pressable
          onPress={() => navigate(-1)}
          style={(s) => [styles.headBtn, BTN_SHADOW, { borderColor: p.border, backgroundColor: p.card }, tap(0.9)(s)]}
        >
          <ArrowLeft size={18} color={p.text} strokeWidth={2.5} />
        </Pressable>

        <View>
          <View style={[styles.avatarBox, SH, { borderColor: p.border, backgroundColor: p.soft }]}>
            <AppImage
              src={`https://ui-avatars.com/api/?name=${avatarName}&background=f1f5f9&color=0f172a`}
              accessibilityLabel={otherName}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
          <View style={[styles.onlineDot, { borderColor: p.border }]} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.peerName, { color: p.text }]}>{otherName}</Text>
          <Text style={styles.peerSub}>{String(otherSub).toUpperCase()}</Text>
        </View>

        <Pressable
          onPress={() => {
            if (!otherPhone) {
              Alert.alert('', 'Phone number is not available for this chat yet.');
              return;
            }
            Linking.openURL(`tel:${String(otherPhone).replace(/[^\d+]/g, '')}`).catch(() => {});
          }}
          style={(s) => [styles.headBtn, BTN_SHADOW, { borderColor: p.border, backgroundColor: p.card }, tap(0.9)(s)]}
        >
          <Phone size={15} color={p.sec} strokeWidth={2.5} />
        </Pressable>
      </HeaderIn>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[styles.list, isJoiningRide && { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isJoiningRide ? (
          <View style={styles.centerFill}>
            <View style={[styles.pill, SH, { backgroundColor: p.card, borderColor: p.border }]}>
              <Spin><Loader2 size={18} color={p.muted} /></Spin>
              <Text style={[styles.pillText, { color: p.sec }]}>Connecting trip chat...</Text>
            </View>
          </View>
        ) : (
          <>
            {!messages.length && !chatError && (
              <View style={{ alignItems: 'center', paddingTop: 24 }}>
                <View style={[styles.pill, SH, { backgroundColor: p.card, borderColor: p.border }]}>
                  <Text style={[styles.connectedText, { color: p.muted }]}>Trip chat is connected.</Text>
                </View>
              </View>
            )}

            {chatError ? (
              <View style={[styles.errorBox, SH, { backgroundColor: p.soft }]}>
                <Text style={styles.errorText}>{chatError}</Text>
              </View>
            ) : null}

            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <MessageIn key={m.id} fromRight={isUser} animate={!initialIdsRef.current?.has(m.id)}>
                  <View
                    style={[
                      styles.bubble,
                      { backgroundColor: p.card },
                      isUser ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6, borderWidth: 1, borderColor: p.border },
                    ]}
                  >
                    <Text style={[styles.bubbleText, { color: p.text }]}>{m.text}</Text>
                    <Text style={[styles.bubbleTime, { color: isUser ? 'rgba(255,255,255,0.8)' : p.muted }]}>
                      {m.pending ? 'Sending...' : m.failed ? 'Not sent' : m.time}
                    </Text>
                  </View>
                </MessageIn>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={[styles.bottom, { backgroundColor: p.card, borderTopColor: p.border, paddingBottom: Math.max(20, insets.bottom) }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.replies} style={{ flexGrow: 0 }}>
          {quickReplies.map((r) => (
            <Pressable
              key={r}
              onPress={() => send(r)}
              style={({ pressed }) => [styles.replyChip, { borderColor: p.border, backgroundColor: pressed ? p.soft : p.card }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Text style={[styles.replyText, { color: p.sec }]}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.inputRow, { backgroundColor: p.soft, borderColor: inputFocused ? ACCENT : p.border }, inputFocused && styles.inputFocusRing]}>
          <TextInput
            ref={inputRef}
            placeholder={rideId ? 'Type a message...' : 'Ride chat unavailable'}
            placeholderTextColor={colors.slate[300]}
            value={input}
            onChangeText={(value) => setInput(stripEmojis(value))}
            onSubmitEditing={() => send()}
            submitBehavior="submit"
            returnKeyType="send"
            editable={Boolean(rideId)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={[styles.input, { color: rideId ? p.text : p.sec }]}
          />
          <Pressable
            onPress={() => send()}
            disabled={!canSend}
            style={(s) => [
              styles.sendBtn,
              canSend ? [styles.sendActive, { backgroundColor: ACCENT }] : { backgroundColor: p.soft },
              tap(0.9)(s),
            ]}
          >
            <Send size={14} color={canSend ? p.text : p.sec} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  adminHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  adminBack: { marginLeft: -8, borderRadius: 9999, padding: 8 },
  adminTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    zIndex: 20,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  headBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarBox: { width: 40, height: 40, borderRadius: 13, overflow: 'hidden', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.emerald[500], borderWidth: 2 },
  peerName: { fontSize: 14, lineHeight: 17, fontWeight: '700' },
  peerSub: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5, color: colors.emerald[500] },
  list: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  pillText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  connectedText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  errorBox: { borderRadius: 16, borderWidth: 1, borderColor: colors.rose[100], paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.rose[600] },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  bubbleText: { fontSize: 14, lineHeight: 23, fontWeight: '600' },
  bubbleTime: { fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 4, textAlign: 'right', letterSpacing: 0.25 },
  bottom: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    elevation: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
  },
  replies: { gap: 8, paddingBottom: 2 },
  replyChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999, borderWidth: 1 },
  replyText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  inputFocusRing: { borderWidth: 2, paddingHorizontal: 11, paddingVertical: 7 },
  input: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 2 },
  sendBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendActive: { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
});

export default Chat;
