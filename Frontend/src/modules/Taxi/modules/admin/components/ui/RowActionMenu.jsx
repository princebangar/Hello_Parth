import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

// The "three dots" menu of a table row. The menu is drawn in <body> at a fixed position so a table wrapper with
// overflow scroll can never clip it (inside a table it was cut off, so the dots looked dead).
// items: [{ key, label, icon: <Icon/>, onClick, danger, disabled, hidden }]
const RowActionMenu = ({ items = [], label = 'Row actions', className = '' }) => {
  const [position, setPosition] = useState(null); // { top, left }
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const visibleItems = items.filter((item) => item && !item.hidden);

  useEffect(() => {
    if (!position) return undefined;
    const close = () => setPosition(null);
    const handlePointer = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener('mousedown', handlePointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  const toggle = (event) => {
    event.stopPropagation();
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = visibleItems.length * 40 + 12;
    const openUp = rect.bottom + menuHeight > window.innerHeight - 8;
    setPosition({
      top: openUp ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
      left: Math.max(8, rect.right - 192),
    });
  };

  if (visibleItems.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        onClick={toggle}
        className={`rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 ${className}`}
      >
        <MoreVertical size={18} />
      </button>
      {position
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[300] w-48 rounded-xl border border-gray-100 bg-white py-1.5 shadow-xl"
              style={{ top: position.top, left: position.left }}
              onClick={(event) => event.stopPropagation()}
            >
              {visibleItems.map((item, index) => (
                <button
                  key={item.key || item.label || index}
                  type="button"
                  disabled={item.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPosition(null);
                    item.onClick?.();
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-yellow-50 hover:text-yellow-900'
                  }`}
                >
                  {item.icon || null}
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

export default RowActionMenu;
