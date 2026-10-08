import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Phone, Loader2 } from 'lucide-react';
import UserSupportChatPanel from '../../../shared/components/UserSupportChatPanel';
import { socketService } from '../../../../shared/api/socket';
import { getCurrentRide } from '../../services/currentRideService';

// Ride chat is plain text: emojis (typed or pasted) are stripped.
const EMOJI_PATTERN = /[\p{Extended_Pictographic}‍️⃣]/gu;
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

const Chat = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const [chatError, setChatError] = useState('');
  const [isJoiningRide, setIsJoiningRide] = useState(!isAdminChat);
  const [resolvedPeer, setResolvedPeer] = useState({
    name: peerFromState.name || (chatRole === 'driver' ? 'Passenger' : 'Driver'),
    phone: peerFromState.phone || peerFromState.mobile || peerFromState.phoneNumber || '',
    subtitle: peerFromState.subtitle || (chatRole === 'driver' ? 'Passenger - Active now' : 'Driver - Active now'),
  });

  // Scroll only the message list: the header and the input bar stay where they are.
  useEffect(() => {
    const list = scrollRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isJoiningRide, chatError]);

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
    const retryTimer = window.setTimeout(joinRide, JOIN_RETRY_MS);
    const giveUpTimer = window.setTimeout(() => setIsJoiningRide(false), JOIN_GIVE_UP_MS);

    return () => {
      window.clearTimeout(retryTimer);
      window.clearTimeout(giveUpTimer);
      socketService.off(RIDE_EVENTS.state, onRideState);
      socketService.off(RIDE_EVENTS.joined, onRideJoined);
      socketService.off(RIDE_EVENTS.incoming, onRideMessage);
      socketService.off('errorMessage', onSocketError);
      socketService.off('connect', joinRide);
    };
  }, [chatRole, hasLiveToken, isAdminChat, peerFromState, rideId]);

  if (isAdminChat && hasLiveToken) {
    return (
      <div className="user-app-theme mx-auto flex h-[100dvh] w-full flex-col overflow-hidden font-sans lg:my-6 lg:h-[85vh] lg:max-w-3xl lg:rounded-3xl lg:border" style={{ background: 'var(--user-bg, #F1F4F9)', borderColor: 'var(--user-border)' }}>
        <div className="flex shrink-0 items-center gap-3 px-4 py-3" style={{ background: 'var(--user-card-bg, #fff)', borderBottom: '1px solid var(--user-border)' }}>
          <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-2 rounded-full p-2 active:scale-95" style={{ color: 'var(--user-text-primary, #0B1220)' }}>
            <ArrowLeft size={22} strokeWidth={2.4} />
          </button>
          <h1 className="text-[17px] font-bold" style={{ color: 'var(--user-text-primary, #0B1220)' }}>
            {chatRole === 'driver' ? 'Captain support' : 'Live chat'}
          </h1>
        </div>
        <UserSupportChatPanel
          mode="participant"
          title={chatRole === 'driver' ? 'Captain support' : 'Hello Parth support'}
          preferredRole={chatRole}
          initialDraft={initialDraft}
          className="flex-1"
        />
      </div>
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

  return (
    <div className="h-[100dvh] bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_60%,#EEF2F7_100%)] w-full lg:max-w-3xl mx-auto flex flex-col font-sans relative overflow-hidden lg:h-[85vh] lg:my-6 lg:rounded-3xl lg:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] lg:border lg:border-white/50">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/50 blur-3xl pointer-events-none" />

      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 backdrop-blur-md px-4 py-3.5 flex items-center gap-3 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)] shrink-0 z-20">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.07)] shrink-0">
          <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
        </motion.button>

        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-[13px] flex items-center justify-center overflow-hidden border border-white/80 shadow-sm bg-slate-100">
            <img src={`https://ui-avatars.com/api/?name=${avatarName}&background=f1f5f9&color=0f172a`} alt={otherName} className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-black text-slate-900 leading-tight">{otherName}</p>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider">{otherSub}</p>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            if (!otherPhone) {
              window.alert('Phone number is not available for this chat yet.');
              return;
            }
            window.open(`tel:${String(otherPhone).replace(/[^\d+]/g, '')}`, '_self');
          }}
          className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.07)] shrink-0"
        >
          <Phone size={15} className="text-slate-700" strokeWidth={2.5} />
        </motion.button>
      </motion.header>

      <div ref={scrollRef} className="flex-1 min-h-0 px-4 py-4 space-y-3 overflow-y-auto overscroll-contain no-scrollbar">
        {isJoiningRide ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-2xl bg-white/90 border border-slate-100 px-4 py-3 shadow-sm">
              <Loader2 size={18} className="animate-spin text-slate-500" />
              <span className="text-[13px] font-bold text-slate-600">Connecting trip chat...</span>
            </div>
          </div>
        ) : (
          <>
            {!messages.length && !chatError && (
              <div className="flex justify-center pt-6">
                <div className="rounded-2xl bg-white/90 border border-slate-100 px-4 py-3 text-[12px] font-bold text-slate-500 shadow-sm">
                  Trip chat is connected.
                </div>
              </div>
            )}

            {chatError && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold text-rose-600 shadow-sm">
                {chatError}
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8, x: isUser ? 12 : -12 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    transition={{ duration: 0.22 }}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[78%] px-4 py-2.5 rounded-[18px] shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${
                        isUser ? 'bg-slate-900 text-white rounded-br-[6px]' : 'bg-white/95 border border-white/80 text-slate-800 rounded-bl-[6px]'
                      }`}
                    >
                      <p className="text-[14px] font-bold leading-relaxed">{m.text}</p>
                      <span className={`text-[10px] font-bold mt-1 flex items-center justify-end gap-1 tracking-wide ${isUser ? 'text-white/80' : 'text-slate-500'}`}>
                        {m.pending ? 'Sending...' : m.failed ? 'Not sent' : m.time}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}
      </div>

      <div className="shrink-0 bg-white/90 backdrop-blur-md border-t border-white/80 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-2.5 shadow-[0_-4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {quickReplies.map((r) => (
            <motion.button key={r} whileTap={{ scale: 0.95 }} onClick={() => send(r)} className="shrink-0 px-3.5 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-black text-slate-600 active:bg-slate-100 transition-all">
              {r}
            </motion.button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-slate-50/80 rounded-[16px] px-3 py-2 border border-slate-100">
          <input
            ref={inputRef}
            type="text"
            placeholder={rideId ? 'Type a message...' : 'Ride chat unavailable'}
            value={input}
            onChange={(e) => setInput(stripEmojis(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={!rideId}
            className="flex-1 bg-transparent border-none text-[14px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300 disabled:text-slate-400"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => send()}
            disabled={!input.trim() || !rideId}
            className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-all shrink-0 ${
              input.trim() && rideId ? 'bg-slate-900 shadow-[0_4px_10px_rgba(15,23,42,0.2)]' : 'bg-slate-200'
            }`}
          >
            <Send size={14} className={input.trim() && rideId ? 'text-white' : 'text-slate-400'} strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
