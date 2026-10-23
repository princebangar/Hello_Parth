import { useEffect, useRef, useState } from 'react';
import { socketService } from '../../../shared/api/socket';

// Unread count for the ride (trip) chat, shown on the chat buttons of the trip screens.
// "Seen" = time of the newest message from the other side that was on screen in the chat page (server time, so the
// phone's clock does not matter). Kept per role + ride on this device.
const SEEN_EVENT = 'ride-chat-seen';
const seenKey = (role, rideId) => `ride_chat_seen:${role}:${rideId}`;
const toTime = (value) => new Date(value).getTime() || 0;

export const readRideChatSeen = (role, rideId) => {
  try {
    return Number(localStorage.getItem(seenKey(role, rideId)) || 0) || 0;
  } catch {
    return 0;
  }
};

export const markRideChatSeen = (role, rideId, at) => {
  const id = String(rideId || '');
  if (!role || !id) return;
  const next = Math.max(readRideChatSeen(role, id), Number(at) || 0);
  try {
    localStorage.setItem(seenKey(role, id), String(next));
  } catch {
    // storage blocked: the count just stays until the next state
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { role, rideId: id } }));
};

export default function useRideChatUnread(rideId, role) {
  const [count, setCount] = useState(0);
  const incomingRef = useRef(new Map());

  useEffect(() => {
    const id = String(rideId || '');
    incomingRef.current = new Map();
    setCount(0);
    if (!id || !role) return undefined;

    const recount = () => {
      const seen = readRideChatSeen(role, id);
      let unread = 0;
      incomingRef.current.forEach((at) => {
        if (at > seen) unread += 1;
      });
      setCount(unread);
    };
    const add = (message) => {
      if (!message || String(message.senderRole || '').toLowerCase() === role || !String(message.message || '').trim()) return;
      const messageId = String(message.id || message._id || `${message.senderId}-${message.sentAt}`);
      incomingRef.current.set(messageId, toTime(message.sentAt));
    };
    // ride:state carries the latest messages (on join / reconnect / status change); ride:message:new each new one.
    const onState = (ride) => {
      if (!ride || String(ride.rideId || ride._id || '') !== id || !Array.isArray(ride.messages)) return;
      ride.messages.forEach(add);
      recount();
    };
    const onMessage = (message) => {
      if (String(message?.rideId || '') !== id) return;
      add(message);
      recount();
    };
    const onSeen = (event) => {
      if (event.detail?.rideId === id && event.detail?.role === role) recount();
    };

    socketService.on('ride:state', onState);
    socketService.on('ride:message:new', onMessage);
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => {
      socketService.off('ride:state', onState);
      socketService.off('ride:message:new', onMessage);
      window.removeEventListener(SEEN_EVENT, onSeen);
    };
  }, [rideId, role]);

  return count;
}
