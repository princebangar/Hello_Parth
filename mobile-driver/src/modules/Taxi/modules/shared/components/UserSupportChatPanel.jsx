import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bot,
  CircleUser,
  Clock3,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, useTheme } from '@/theme';
import { socketService } from '../../../shared/api/socket';
import { deleteSupportConversation, getSupportConversations, getSupportMessages, markSupportMessagesRead, sendSupportMessage } from '../chat/chatApi';
import { getChatSession, parseSupportConversationKey } from '../chat/chatIdentity';

const quickReplies = ['Payment issue', 'Ride delayed', 'Lost item', 'Safety concern'];

// --user-* palette of modules/Taxi/index.css (rider side sits inside the Taxi `user-app-theme` scope)
const USER_LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const USER_DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
// `.user-app-theme .shadow-sm` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };
const SHADOW_SM = { elevation: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } };

const formatTime = (value) => {
  if (!value) {
    return 'Just now';
  }

  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Just now';
  }
};

const normalizeMessage = (message) => ({
  ...message,
  sender: {
    role: message?.sender?.role || 'user',
    id: message?.sender?.id || '',
    name: message?.sender?.name || '',
    phone: message?.sender?.phone || '',
  },
  receiver: {
    role: message?.receiver?.role || 'admin',
    id: message?.receiver?.id || '',
    name: message?.receiver?.name || '',
    phone: message?.receiver?.phone || '',
  },
});

const normalizeConversation = (conversation) => ({
  conversationKey: conversation.conversationKey,
  peer: conversation.peer || {
    role: 'admin',
    id: '',
    name: 'Support Team',
    phone: '',
  },
  latestMessage: conversation.latestMessage ? normalizeMessage(conversation.latestMessage) : null,
  unreadCount: conversation.unreadCount || 0,
  updatedAt: conversation.updatedAt || conversation.latestMessage?.createdAt || null,
});

const getConversationIdentityKey = (conversationKey) =>
  parseSupportConversationKey(conversationKey)?.canonicalKey || String(conversationKey || '');

const mergeConversationEntry = (existing = {}, incoming = {}) => {
  const existingUpdatedAt = new Date(existing.updatedAt || 0).getTime();
  const incomingUpdatedAt = new Date(incoming.updatedAt || 0).getTime();
  const prefersIncoming = incomingUpdatedAt >= existingUpdatedAt;

  return {
    ...existing,
    ...incoming,
    conversationKey: prefersIncoming
      ? (incoming.conversationKey || existing.conversationKey)
      : (existing.conversationKey || incoming.conversationKey),
    peer: {
      ...(existing.peer || {}),
      ...(incoming.peer || {}),
    },
    latestMessage: incoming.latestMessage || existing.latestMessage || null,
    unreadCount: Math.max(existing.unreadCount || 0, incoming.unreadCount || 0),
    updatedAt: incoming.updatedAt || existing.updatedAt || null,
  };
};

const dedupeConversations = (conversationList = []) => {
  const merged = new Map();

  for (const conversation of conversationList) {
    const identityKey = getConversationIdentityKey(conversation.conversationKey);
    const existing = merged.get(identityKey);
    merged.set(identityKey, mergeConversationEntry(existing, conversation));
  }

  return Array.from(merged.values()).sort(
    (left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0),
  );
};

// framer-motion initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} for the admin error banner
const AnimatedError = ({ children, style }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>{children}</Animated.View>;
};

const SupportChatPanel = ({
  mode = 'participant',
  title = 'Support Chat',
  subtitle = 'Live messages with admin',
  preferredRole,
  style,
  initialDraft = '',
  surface = 'card',
  targetConversationKey = '',
  targetPeerRole = '',
  targetPeerId = '',
  targetPeerName = '',
  targetPeerPhone = '',
  showSidebar = true,
}) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const session = useMemo(
    () => getChatSession(preferredRole || (mode === 'admin' ? 'admin' : undefined)),
    [mode, preferredRole],
  );
  const isAdminPanel = mode === 'admin';
  const isLiveEnabled = session.isAuthenticated;
  const isPlainSurface = surface === 'plain';

  useEffect(() => {
    if (!session.role || session.role === 'guest') {
      return undefined;
    }

    localStorage.setItem('chatRole', session.role);

    return () => {
      if (localStorage.getItem('chatRole') === session.role) {
        localStorage.removeItem('chatRole');
      }
    };
  }, [session.role]);

  const [conversations, setConversations] = useState([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(socketService.isConnected());
  const listRef = useRef(null);
  const appliedInitialDraftRef = useRef('');

  useEffect(() => {
    if (targetConversationKey) {
      setSelectedConversationKey(targetConversationKey);
      setConversations((current) => {
        const identityKey = getConversationIdentityKey(targetConversationKey);
        const exists = current.some(
          (item) => getConversationIdentityKey(item.conversationKey) === identityKey
        );
        if (!exists) {
          const synthetic = {
            conversationKey: targetConversationKey,
            peer: {
              role: targetPeerRole || parseSupportConversationKey(targetConversationKey)?.peerRole || 'user',
              id: targetPeerId || parseSupportConversationKey(targetConversationKey)?.peerId || '',
              name: targetPeerName || 'Support Contact',
              phone: targetPeerPhone || '',
            },
            latestMessage: null,
            unreadCount: 0,
            updatedAt: new Date().toISOString(),
          };
          return dedupeConversations([synthetic, ...current]);
        }
        return current;
      });
    }
  }, [targetConversationKey, targetPeerRole, targetPeerId, targetPeerName, targetPeerPhone]);

  const normalizedSelectedConversationKey = useMemo(
    () => getConversationIdentityKey(selectedConversationKey),
    [selectedConversationKey],
  );

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (item) => getConversationIdentityKey(item.conversationKey) === normalizedSelectedConversationKey,
      ) || null,
    [conversations, normalizedSelectedConversationKey],
  );

  const isMessageForActiveConversation = (message, conversationKey = selectedConversationKey) => {
    const parsedConversation = parseSupportConversationKey(conversationKey);

    if (!parsedConversation || !message?.sender || !message?.receiver) {
      return false;
    }

    const sessionId = session.id ? String(session.id) : '';
    const senderId = String(message.sender.id || '');
    const receiverId = String(message.receiver.id || '');

    if (!sessionId || !senderId || !receiverId) {
      return message.conversationKey === conversationKey || message.conversationKey === parsedConversation.canonicalKey;
    }

    if (session.role === 'admin') {
      return (
        message.sender.role === 'admin' &&
        senderId === sessionId &&
        message.receiver.role === parsedConversation.peerRole &&
        receiverId === String(parsedConversation.peerId)
      ) || (
        message.sender.role === parsedConversation.peerRole &&
        senderId === String(parsedConversation.peerId) &&
        message.receiver.role === 'admin' &&
        receiverId === sessionId
      );
    }

    return (
      message.sender.role === session.role &&
      senderId === sessionId &&
      message.receiver.role === 'admin' &&
      receiverId === String(parsedConversation.adminId)
    ) || (
      message.sender.role === 'admin' &&
      senderId === String(parsedConversation.adminId) &&
      message.receiver.role === session.role &&
      receiverId === sessionId
    );
  };

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const peerName = conversation.peer?.name || '';
      const peerPhone = conversation.peer?.phone || '';
      const latestText = conversation.latestMessage?.message || '';
      return [peerName, peerPhone, latestText].some((value) => value.toLowerCase().includes(query));
    });
  }, [conversations, search]);

  const syncConversationList = (message) => {
    setConversations((current) => {
      const latestMessage = normalizeMessage(message);
      const parsedConversation = parseSupportConversationKey(message.conversationKey);
      const identityKey = getConversationIdentityKey(message.conversationKey);
      const existingConversation =
        current.find((item) => getConversationIdentityKey(item.conversationKey) === identityKey) || null;
      const adminSide =
        latestMessage.sender.role === 'admin'
          ? {
              role: 'admin',
              id: latestMessage.sender.id,
              name: latestMessage.sender.name,
              phone: latestMessage.sender.phone,
            }
          : {
              role: 'admin',
              id: latestMessage.receiver.id,
              name: latestMessage.receiver.name,
              phone: latestMessage.receiver.phone,
            };

      const peer =
        session.role === 'admin'
          ? {
              role: parsedConversation?.peerRole || (latestMessage.sender.role === 'admin' ? latestMessage.receiver.role : latestMessage.sender.role),
              id: parsedConversation?.peerId || (latestMessage.sender.role === 'admin' ? latestMessage.receiver.id : latestMessage.sender.id),
              name: latestMessage.sender.role === 'admin' ? latestMessage.receiver.name : latestMessage.sender.name,
              phone: latestMessage.sender.role === 'admin' ? latestMessage.receiver.phone : latestMessage.sender.phone,
            }
          : {
              ...adminSide,
              name: adminSide.name || 'Support Team',
              phone: adminSide.phone || '',
            };

      const unreadCount =
        message.receiver.role === session.role &&
        message.sender.role !== session.role &&
        normalizedSelectedConversationKey !== identityKey
          ? (existingConversation?.unreadCount || 0) + 1
          : 0;

      const nextConversation = {
        conversationKey: parsedConversation?.canonicalKey || message.conversationKey,
        peer,
        latestMessage,
        unreadCount,
        updatedAt: message.createdAt,
      };
      const next = current.map((item) =>
        getConversationIdentityKey(item.conversationKey) === identityKey ? mergeConversationEntry(item, nextConversation) : item,
      );

      if (next.some((item) => getConversationIdentityKey(item.conversationKey) === identityKey)) {
        return dedupeConversations(next);
      }

      return dedupeConversations([nextConversation, ...current]);
    });
  };

  const resolveConversationKeys = (conversationKey) => {
    const parsed = parseSupportConversationKey(conversationKey);
    return parsed?.keys || (conversationKey ? [conversationKey] : []);
  };

  const matchesConversationKey = (leftKey, rightKey) => {
    const leftKeys = resolveConversationKeys(leftKey);
    const rightKeys = resolveConversationKeys(rightKey);
    return leftKeys.some((key) => rightKeys.includes(key));
  };

  useEffect(() => {
    if (!isLiveEnabled) {
      return undefined;
    }

    socketService.connect({ role: session.role, token: session.token });

    const handleMessage = (incomingMessage) => {
      const message = normalizeMessage(incomingMessage);
      syncConversationList(message);

      if (isMessageForActiveConversation(message)) {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) {
            return current;
          }

          return [...current, message];
        });

        if (message.sender.role !== session.role) {
          socketService.emit('chat:read', { conversationKey: message.conversationKey });
        }
      }
    };

    const handleConversationUpdate = ({ message }) => {
      if (!message) {
        return;
      }

      syncConversationList(normalizeMessage(message));
    };

    const handleSocketError = (payload) => {
      setError(payload?.message || 'Socket connection error');
    };

    const handleConversationDeleted = (payload) => {
      const deletedKeys = payload?.keys || resolveConversationKeys(payload?.conversationKey);
      const activeConversationKeys = resolveConversationKeys(selectedConversationKey);
      const isActiveDeleted = activeConversationKeys.some((key) => deletedKeys.includes(key));

      if (isActiveDeleted) {
        setMessages([]);
        setDraft('');
      }

      setConversations((current) => {
        const next = current.filter((item) => !deletedKeys.includes(item.conversationKey));

        if (!isAdminPanel) {
          if (next.length === 0 && current.length > 0) {
            const fallback = current[0];
            return [
              {
                ...fallback,
                latestMessage: null,
                unreadCount: 0,
                updatedAt: null,
              },
            ];
          }

          return next.map((item) =>
            deletedKeys.includes(item.conversationKey)
              ? {
                  ...item,
                  latestMessage: null,
                  unreadCount: 0,
                  updatedAt: null,
                }
              : item,
          );
        }

        if (isActiveDeleted) {
          setSelectedConversationKey(next[0]?.conversationKey || '');
        }

        return next;
      });
    };

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);

    socketService.on('chat:message', handleMessage);
    socketService.on('chat:conversation-updated', handleConversationUpdate);
    socketService.on('chat:conversation-deleted', handleConversationDeleted);
    socketService.on('errorMessage', handleSocketError);

    setIsConnected(socketService.isConnected());

    return () => {
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
      socketService.off('chat:message', handleMessage);
      socketService.off('chat:conversation-updated', handleConversationUpdate);
      socketService.off('chat:conversation-deleted', handleConversationDeleted);
      socketService.off('errorMessage', handleSocketError);
    };
  }, [isLiveEnabled, session.role, selectedConversationKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLiveEnabled) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    const loadConversations = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await getSupportConversations(session.token);
        const nextConversations = (response?.data?.conversations || []).map(normalizeConversation);

        if (!active) {
          return;
        }

        setConversations((current) => {
          return dedupeConversations([...current, ...nextConversations]);
        });

        if (!selectedConversationKey && nextConversations.length > 0) {
          setSelectedConversationKey(getConversationIdentityKey(nextConversations[0].conversationKey));
        }
      } catch (chatError) {
        if (!active) {
          return;
        }

        setError(chatError?.message || 'Unable to load conversations');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadConversations();

    return () => {
      active = false;
    };
  }, [isLiveEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLiveEnabled || !selectedConversationKey) {
      return undefined;
    }

    let active = true;

    const loadMessages = async () => {
      setMessages([]);
      setLoading(true);
      setError('');

      try {
        const response = await getSupportMessages(selectedConversationKey, session.token);
        const nextMessages = (response?.data?.messages || [])
          .map(normalizeMessage)
          .filter((message) => isMessageForActiveConversation(message, selectedConversationKey));

        if (!active) {
          return;
        }

        setMessages(
          nextMessages.sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0)),
        );
        socketService.emit('chat:join', { conversationKey: selectedConversationKey });
        socketService.emit('chat:read', { conversationKey: selectedConversationKey });
        await markSupportMessagesRead(selectedConversationKey, session.token);
      } catch (chatError) {
        if (!active) {
          return;
        }

        setError(chatError?.message || 'Unable to load messages');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      active = false;
    };
  }, [isLiveEnabled, selectedConversationKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const parsedConversation = parseSupportConversationKey(selectedConversationKey);

    if (parsedConversation && parsedConversation.canonicalKey !== selectedConversationKey) {
      setSelectedConversationKey(parsedConversation.canonicalKey);
    }
  }, [selectedConversationKey]);

  // Only the message list scrolls; the header and the typing bar stay put.
  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages, loading]);

  useEffect(() => {
    const normalizedInitialDraft = String(initialDraft || '').trim();

    if (!normalizedInitialDraft || appliedInitialDraftRef.current === normalizedInitialDraft) {
      return;
    }

    setDraft((current) => current || normalizedInitialDraft);
    appliedInitialDraftRef.current = normalizedInitialDraft;
  }, [initialDraft]);

  const handleSelectConversation = (conversationKey) => {
    const parsedConversation = parseSupportConversationKey(conversationKey);
    setSelectedConversationKey(parsedConversation?.canonicalKey || conversationKey);
  };

  const handleClearChat = async () => {
    if (!selectedConversationKey || deleting) {
      return;
    }

    setDeleting(true);
    setError('');

    try {
      await deleteSupportConversation(selectedConversationKey, session.token);
      const selectedKeys = resolveConversationKeys(selectedConversationKey);

      setMessages([]);
      setDraft('');

      setConversations((current) => {
        if (!isAdminPanel) {
          return current.map((item) =>
            selectedKeys.some((key) => matchesConversationKey(item.conversationKey, key))
              ? {
                  ...item,
                  latestMessage: null,
                  unreadCount: 0,
                  updatedAt: null,
                }
              : item,
          );
        }

        const next = current.filter((item) => !selectedKeys.some((key) => matchesConversationKey(item.conversationKey, key)));
        setSelectedConversationKey(next[0]?.conversationKey || '');
        return next;
      });
    } catch (chatError) {
      setError(chatError?.message || 'Unable to delete chat');
    } finally {
      setDeleting(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !selectedConversationKey) {
      return;
    }

    setSending(true);
    setError('');
    const parsedConversation = parseSupportConversationKey(selectedConversationKey);

    const payload = isAdminPanel
      ? {
          message: text,
          receiverRole: parsedConversation?.peerRole || selectedConversation?.peer?.role || 'user',
          receiverId: parsedConversation?.peerId || selectedConversation?.peer?.id,
          conversationKey: selectedConversationKey,
        }
      : {
          message: text,
          conversationKey: selectedConversationKey,
        };

    try {
      if (socketService.isConnected()) {
        socketService.emit('chat:send', payload);
      } else {
        const response = await sendSupportMessage(payload, session.token);
        const savedMessage = normalizeMessage(response?.data?.message);

        if (savedMessage?.id) {
          setMessages((current) => [...current, savedMessage]);
          syncConversationList(savedMessage);
        }
      }

      setDraft('');
    } catch (chatError) {
      setError(chatError?.message || 'Unable to send message');
    } finally {
      setSending(false);
    }
  };

  const isDriverSide = session.role === 'driver';
  // Rider screens sit in the Taxi `user-app-theme` scope (its colour remaps apply); driver screens are light only.
  const u = t.dark && !isDriverSide ? USER_DARK : USER_LIGHT;

  if (!isLiveEnabled) {
    const scoped = !isDriverSide;
    return (
      <View
        style={[
          isPlainSurface
            ? { height: '100%', backgroundColor: scoped ? u.card : colors.white, padding: 24 }
            : [styles.offCard, scoped ? SH : SHADOW_SM, { borderColor: scoped ? u.border : colors.slate[200], backgroundColor: scoped ? u.card : colors.white }],
          style,
        ]}
      >
        <View style={styles.row12}>
          <View style={styles.offIcon}>
            <ShieldCheck size={20} color={scoped ? u.text : colors.white} />
          </View>
          <View>
            <Text style={[styles.offKicker, { color: scoped ? u.sec : colors.slate[400] }]}>SUPPORT CHAT</Text>
            <Text style={[styles.offTitle, { color: scoped ? u.text : colors.slate[900] }]}>{title}</Text>
          </View>
        </View>
        <Text style={[styles.offText, { color: scoped ? u.muted : colors.slate[500] }]}>
          Live chat will activate once the current session has a valid token.
        </Text>
      </View>
    );
  }

  if (!isAdminPanel) {
    // Rider / captain help chat: a phone-style thread. Header and typing bar are fixed, only the messages scroll.
    const mineStyle = isDriverSide
      ? { backgroundColor: '#1d4ed8', color: '#ffffff' }
      : { backgroundColor: '#FFC400', color: '#0B1220' };
    const chat = isDriverSide
      ? { bg: '#F5F8FF', card: '#ffffff', text: '#0f1b4c', muted: '#5a6b8f', border: 'rgba(15,27,76,0.10)' }
      : { bg: u.bg, card: u.card, text: u.text, muted: u.muted, border: u.border };
    const bubbleShadow = isDriverSide ? SHADOW_SM : SH;
    const clearDisabled = !selectedConversationKey || messages.length === 0 || deleting;
    const sendDisabled = sending || !draft.trim();

    return (
      <View style={[styles.thread, { backgroundColor: chat.bg }, style]}>
        <View style={[styles.threadHead, { backgroundColor: chat.card, borderBottomColor: chat.border }]}>
          <View style={[styles.threadAvatar, { backgroundColor: mineStyle.backgroundColor }]}>
            <MessageCircle size={18} color={mineStyle.color} />
          </View>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text numberOfLines={1} style={[styles.threadTitle, { color: chat.text }]}>{title}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: isConnected ? colors.emerald[500] : colors.rose[500] }]} />
              <Text style={[styles.statusText, { color: chat.muted }]}>
                {isConnected ? 'Support team - online' : 'Reconnecting...'}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleClearChat}
            disabled={clearDisabled}
            accessibilityLabel="Clear chat"
            style={[styles.clearBtn, { borderColor: chat.border }, clearDisabled && { opacity: 0.4 }]}
          >
            <Trash2 size={15} color={colors.rose[600]} />
          </Pressable>
        </View>

        <ScrollView
          ref={listRef}
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={[styles.threadList, loading && { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.centerFill}>
              <View style={[styles.loadingPill, bubbleShadow, { backgroundColor: chat.card, borderColor: chat.border }]}>
                <Spin><Loader2 size={16} color={chat.muted} /></Spin>
                <Text style={[styles.loadingText, { color: chat.muted }]}>Loading messages...</Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {messages.length === 0 && (
                <Text style={[styles.emptyText, { color: chat.muted }]}>
                  Say hello - our support team will reply here.
                </Text>
              )}
              {messages.map((message) => {
                const isMine =
                  message.sender.id && session.id
                    ? String(message.sender.id) === String(session.id)
                    : message.sender.role === session.role;

                return (
                  <View key={message.id} style={{ flexDirection: 'row', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <View
                      style={[
                        styles.bubble,
                        bubbleShadow,
                        isMine
                          ? { borderBottomRightRadius: 6, backgroundColor: mineStyle.backgroundColor }
                          : { borderBottomLeftRadius: 6, backgroundColor: chat.card, borderWidth: 1, borderColor: chat.border },
                      ]}
                    >
                      <Text style={[styles.bubbleText, { color: isMine ? mineStyle.color : chat.text }]}>{message.message}</Text>
                      <Text style={[styles.bubbleTime, { color: isMine ? mineStyle.color : chat.text }]}>{formatTime(message.createdAt)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={[styles.composer, { backgroundColor: chat.card, borderTopColor: chat.border, paddingBottom: Math.max(12, insets.bottom) }]}>
          {error ? (
            <Text style={[styles.composerError, { backgroundColor: isDriverSide ? colors.rose[50] : u.soft }]}>{error}</Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.replies} style={{ marginBottom: 8, flexGrow: 0 }}>
            {quickReplies.map((reply) => (
              <Pressable key={reply} onPress={() => setDraft(reply)} style={[styles.replyChip, { borderColor: chat.border }]}>
                <Text style={[styles.replyText, { color: chat.muted }]}>{reply}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={[styles.inputRow, { backgroundColor: chat.bg, borderColor: chat.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleSend}
              submitBehavior="submit"
              returnKeyType="send"
              placeholder="Type a message"
              placeholderTextColor={alpha(isDriverSide ? '#0f1b4c' : (t.dark ? '#ffffff' : '#0B1220'), 0.6)}
              style={[styles.input, { color: chat.text }]}
            />
            <Pressable
              onPress={handleSend}
              disabled={sendDisabled}
              accessibilityLabel="Send"
              style={[styles.sendBtn, { backgroundColor: mineStyle.backgroundColor }, sendDisabled && { opacity: 0.4 }]}
            >
              {sending ? <Spin><Loader2 size={16} color={mineStyle.color} /></Spin> : <Send size={16} color={mineStyle.color} />}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // Admin desk (admin app only; the mobile single-column layout of the web panel).
  return (
    <View style={[isPlainSurface ? styles.adminPlain : styles.adminCard, style]}>
      <View style={styles.adminHead}>
        <View style={[styles.row12, { gap: 16, minWidth: 0, flexShrink: 1 }]}>
          <View style={styles.adminIcon}>
            <MessageCircle size={20} color={colors.white} />
          </View>
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text numberOfLines={1} style={styles.adminTitle}>{title}</Text>
            <View style={[styles.row12, { gap: 8, flexWrap: 'wrap' }]}>
              <Text style={styles.adminDesk}>DESK TERMINAL</Text>
              <View style={styles.dotSep} />
              <Text style={styles.adminSubtitle}>{String(subtitle).toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.connBox, isConnected ? styles.connOn : styles.connOff]}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? colors.emerald[500] : colors.rose[500] }]} />
          <Text style={[styles.connText, { color: isConnected ? colors.emerald[700] : colors.rose[700] }]}>
            {isConnected ? 'CONNECTION: LIVE' : 'CONNECTION: OFFLINE'}
          </Text>
        </View>
      </View>

      {showSidebar ? (
        <View style={styles.aside}>
          <View style={styles.asideSearchWrap}>
            <View style={styles.searchBox}>
              <Search size={16} color={colors.slate[400]} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, role or phone"
                placeholderTextColor={colors.slate[400]}
                style={styles.searchInput}
              />
            </View>
          </View>
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
            {visibleConversations.map((conversation) => {
              const selected = selectedConversationKey === conversation.conversationKey;
              return (
                <Pressable
                  key={conversation.conversationKey}
                  onPress={() => handleSelectConversation(conversation.conversationKey)}
                  style={[styles.convRow, selected ? styles.convSelected : null]}
                >
                  <View style={[styles.convIcon, selected ? { backgroundColor: colors.indigo[600] } : styles.convIconIdle]}>
                    {conversation.peer?.role === 'driver'
                      ? <CircleUser size={20} color={selected ? colors.white : colors.slate[400]} />
                      : <UserRound size={20} color={selected ? colors.white : colors.slate[400]} />}
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <View style={[styles.row12, { justifyContent: 'space-between', gap: 8 }]}>
                      <Text numberOfLines={1} style={[styles.convName, { color: selected ? colors.indigo[600] : colors.slate[900] }]}>
                        {conversation.peer?.name || 'Support Contact'}
                      </Text>
                      {conversation.unreadCount > 0 && (
                        <View style={styles.unread}><Text style={styles.unreadText}>{conversation.unreadCount}</Text></View>
                      )}
                    </View>
                    <View style={[styles.row12, { gap: 6, marginTop: 2 }]}>
                      <Text style={[styles.convRole, { color: selected ? alpha(colors.indigo[600], 0.6) : colors.slate[400] }]}>
                        {String(conversation.peer?.role || 'user').toUpperCase()}
                      </Text>
                      <View style={styles.dotSep} />
                      <Text style={styles.convTime}>{formatTime(conversation.updatedAt).split(',')[1] || 'Today'}</Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.convLatest, { color: selected ? colors.slate[600] : colors.slate[500] }]}>
                      {conversation.latestMessage?.message || 'No messages yet'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {!loading && visibleConversations.length === 0 && (
              <View style={styles.noConv}>
                <Text style={styles.noConvText}>No active conversations yet.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ flex: 1, minHeight: 0, backgroundColor: '#f8fafc' }}>
        <View style={styles.mainHead}>
          <View style={[styles.row12, { minWidth: 0, flexShrink: 1 }]}>
            <View style={styles.peerIcon}>
              {selectedConversation?.peer?.role === 'driver' ? <CircleUser size={20} color={colors.slate[500]} /> : <Bot size={20} color={colors.slate[500]} />}
            </View>
            <View style={{ minWidth: 0, flexShrink: 1 }}>
              <Text numberOfLines={1} style={styles.peerName}>{String(selectedConversation?.peer?.name || 'Support Team').toUpperCase()}</Text>
              <Text style={styles.peerThread}>
                {selectedConversation?.peer?.role === 'driver' ? 'DRIVER SUPPORT THREAD' : 'USER SUPPORT THREAD'}
              </Text>
            </View>
          </View>
          <View style={[styles.row12, { gap: 8 }]}>
            <Pressable
              onPress={() => {
                if (selectedConversationKey) {
                  socketService.emit('chat:read', { conversationKey: selectedConversationKey });
                }
              }}
              style={styles.refreshBtn}
            >
              <RefreshCcw size={14} color={colors.slate[500]} />
            </Pressable>
            <Pressable
              onPress={handleClearChat}
              disabled={!selectedConversationKey || messages.length === 0 || deleting}
              style={[styles.deleteBtn, (!selectedConversationKey || messages.length === 0 || deleting) && { opacity: 0.5 }]}
            >
              <Trash2 size={14} color={colors.rose[600]} />
            </Pressable>
          </View>
        </View>

        <ScrollView ref={listRef} style={{ flex: 1 }} contentContainerStyle={[{ paddingHorizontal: 20, paddingVertical: 20 }, loading && { flexGrow: 1 }]}>
          {loading ? (
            <View style={styles.centerFill}>
              <View style={[styles.loadingPill, SHADOW_SM, { backgroundColor: colors.white, borderColor: colors.slate[200] }]}>
                <Spin><Loader2 size={16} color={colors.slate[500]} /></Spin>
                <Text style={[styles.loadingText, { color: colors.slate[500], fontWeight: '700' }]}>Loading messages...</Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {messages.map((message) => {
                const isMine =
                  message.sender.id && session.id
                    ? String(message.sender.id) === String(session.id)
                    : message.sender.role === session.role;

                return (
                  <View key={message.id} style={{ flexDirection: 'row', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <View style={{ maxWidth: '78%', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 12 }}>
                      <View style={[styles.msgAvatar, SHADOW_SM]}>
                        {isMine ? <CircleUser size={15} color={colors.slate[400]} /> : <Bot size={15} color={colors.slate[400]} />}
                      </View>
                      <View style={{ flexShrink: 1 }}>
                        <View style={[styles.adminBubble, SHADOW_SM, isMine ? styles.adminMine : styles.adminOther]}>
                          <Text style={[styles.adminBubbleText, { color: isMine ? colors.white : colors.slate[800] }]}>{message.message}</Text>
                        </View>
                        <View style={[styles.row12, { gap: 8, marginTop: 4, justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
                          <Clock3 size={11} color={colors.slate[400]} />
                          <Text style={styles.adminTime}>{formatTime(message.createdAt).toUpperCase()}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={[styles.adminComposer, { paddingBottom: 16 + (isPlainSurface ? insets.bottom : 0) }]}>
          {error ? (
            <AnimatedError style={styles.adminError}>
              <Text style={styles.adminErrorText}>{error}</Text>
            </AnimatedError>
          ) : null}
          <View style={styles.adminInputRow}>
            <View style={[styles.shieldBtn, SHADOW_SM]}>
              <ShieldCheck size={16} color={colors.slate[400]} />
            </View>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleSend}
              submitBehavior="submit"
              returnKeyType="send"
              placeholder="Reply to support request"
              placeholderTextColor={colors.slate[400]}
              style={styles.adminInput}
            />
            <Pressable
              onPress={handleSend}
              disabled={sending || !draft.trim()}
              style={[styles.adminSend, { backgroundColor: sending || !draft.trim() ? colors.slate[300] : colors.indigo[600] }]}
            >
              {sending ? <Spin><Loader2 size={16} color={colors.white} /></Spin> : <Send size={16} color={colors.white} />}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row12: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  offCard: { borderRadius: 32, borderWidth: 1, padding: 32 },
  offIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.indigo[600], alignItems: 'center', justifyContent: 'center' },
  offKicker: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0.55 },
  offTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  offText: { marginTop: 16, fontSize: 13, lineHeight: 24, fontWeight: '600' },
  thread: { flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' },
  threadHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  threadAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  threadTitle: { fontSize: 15, lineHeight: 19, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  clearBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  threadList: { paddingHorizontal: 16, paddingVertical: 16 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingPill: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 9999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  loadingText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  emptyText: { paddingVertical: 40, textAlign: 'center', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  bubbleTime: { marginTop: 4, textAlign: 'right', fontSize: 10, lineHeight: 14, fontWeight: '600', opacity: 0.7 },
  composer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  composerError: { marginBottom: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.rose[600], overflow: 'hidden' },
  replies: { gap: 8 },
  replyChip: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  replyText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '500', paddingVertical: 4 },
  sendBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // admin desk
  adminCard: { overflow: 'hidden', borderRadius: 32, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 40, shadowOffset: { width: 0, height: 30 } },
  adminPlain: { flex: 1, overflow: 'hidden', backgroundColor: colors.white },
  adminHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: alpha(colors.slate[200], 0.6), backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 16 },
  adminIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#405189', alignItems: 'center', justifyContent: 'center' },
  adminTitle: { fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45, color: colors.slate[900] },
  adminDesk: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, color: colors.slate[400] },
  adminSubtitle: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, color: colors.indigo[600] },
  dotSep: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.slate[300] },
  connBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  connOn: { borderColor: colors.emerald[100], backgroundColor: colors.emerald[50] },
  connOff: { borderColor: colors.rose[100], backgroundColor: colors.rose[50] },
  connText: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.8 },
  aside: { borderBottomWidth: 1.5, borderBottomColor: alpha(colors.slate[200], 0.6), backgroundColor: '#F8FAFC' },
  asideSearchWrap: { borderBottomWidth: 1, borderBottomColor: alpha(colors.slate[200], 0.6), backgroundColor: colors.white, padding: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.5), paddingHorizontal: 16, paddingVertical: 14 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.slate[700] },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 12, paddingVertical: 14 },
  convSelected: { borderColor: alpha(colors.indigo[600], 0.2), backgroundColor: colors.white, elevation: 3, shadowColor: '#4f46e5', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  convIcon: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  convIconIdle: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[200] },
  convName: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: -0.3 },
  unread: { borderRadius: 9999, backgroundColor: colors.orange[500], paddingHorizontal: 8, paddingVertical: 2 },
  unreadText: { fontSize: 10, lineHeight: 14, fontWeight: '900', color: colors.white },
  convRole: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1 },
  convTime: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.slate[400] },
  convLatest: { marginTop: 6, fontSize: 12, lineHeight: 19, fontWeight: '500' },
  noConv: { borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.slate[200], backgroundColor: colors.white, padding: 24, alignItems: 'center' },
  noConvText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[500] },
  mainHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.slate[100], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 16 },
  peerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  peerName: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.4, color: colors.slate[900] },
  peerThread: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.55, color: colors.emerald[600] },
  refreshBtn: { borderRadius: 12, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 8 },
  deleteBtn: { borderRadius: 12, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], paddingHorizontal: 12, paddingVertical: 8 },
  msgAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  adminBubble: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  adminMine: { borderBottomRightRadius: 6, borderColor: colors.indigo[600], backgroundColor: colors.indigo[600] },
  adminOther: { borderBottomLeftRadius: 6, borderColor: colors.slate[200], backgroundColor: colors.white },
  adminBubbleText: { fontSize: 14, lineHeight: 24, fontWeight: '500' },
  adminTime: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5, color: colors.slate[400] },
  adminComposer: { borderTopWidth: 1, borderTopColor: colors.slate[100], backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 16 },
  adminError: { marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], paddingHorizontal: 16, paddingVertical: 12 },
  adminErrorText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.rose[600] },
  adminInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  shieldBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  adminInput: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.slate[900] },
  adminSend: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

export default SupportChatPanel;
