import React from "react";
import { createPortal } from "react-dom";
import useTypingFocus from "../../../shared/hooks/useTypingFocus";
import "./driverChrome.css";

/**
 * The floating bottom bar shared by every driver app (taxi, owner, bus, pooling, delivery).
 * items: [{ key, label, Icon, active, onSelect, badge?, onPreload? }]
 * The blue pill is one element that is always mounted and just slides to the active tab, so a tapped tab
 * never blinks (a pill that is unmounted and mounted again leaves white text on white for a moment).
 */
const DriverNavBar = ({ items = [] }) => {
  // Hidden while the keyboard is open so it never covers the field being typed in.
  const isTyping = useTypingFocus();
  if (isTyping) return null;

  const activeIndex = items.findIndex((item) => item.active);

  const nav = (
    <nav className="driver-nav" aria-label="Main navigation" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <div className="driver-nav-bar">
        <div
          className="driver-nav-pill"
          aria-hidden="true"
          style={{
            width: `calc((100% - 16px) / ${Math.max(items.length, 1)})`,
            transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        />
        {items.map(({ key, label, Icon, active, onSelect, badge, onPreload }) => (
          <button
            key={key}
            type="button"
            onClick={onSelect}
            // the page's code starts loading as soon as a finger lands, not when it lifts
            onPointerDown={onPreload}
            aria-current={active ? "page" : undefined}
            className={`driver-nav-item outline-none touch-manipulation${active ? " is-active" : ""}`}
          >
            <span className="relative z-10 flex flex-col items-center gap-0.5">
              <span className="relative">
                <Icon size={21} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                {badge ? <span className="driver-nav-badge">{badge}</span> : null}
              </span>
              <span className="text-[9px] font-bold uppercase leading-none tracking-[0.02em]">{label}</span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );

  // In <body> so animated page wrappers cannot make it scroll with the page.
  return typeof document === "undefined" ? nav : createPortal(nav, document.body);
};

export default DriverNavBar;
