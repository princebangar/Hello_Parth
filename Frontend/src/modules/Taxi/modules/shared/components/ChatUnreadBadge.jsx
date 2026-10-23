import React from 'react';

// Red unread-count dot for a chat button (the button must be `relative`).
const ChatUnreadBadge = ({ count = 0, className = '-right-1.5 -top-1.5' }) => {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} unread message${count === 1 ? '' : 's'}`}
      className={`pointer-events-none absolute ${className} flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none ring-2 ring-white`}
      style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
};

export default ChatUnreadBadge;
