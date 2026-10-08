import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import useTypingFocus from "../../../shared/hooks/useTypingFocus";
import "./driverChrome.css";

/**
 * The floating glass bottom bar shared by every driver app (taxi, owner, bus, pooling).
 * items: [{ key, label, Icon, active, onSelect, badge?, onPreload? }]
 */
const DriverNavBar = ({ items = [] }) => {
  // Hidden while the keyboard is open so it never covers the field being typed in.
  const isTyping = useTypingFocus();
  if (isTyping) return null;

  const nav = (
    <nav className="driver-nav" aria-label="Main navigation" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <div className="driver-nav-bar">
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
            {active && (
              <motion.div
                layoutId="driver-nav-active-pill"
                className="driver-nav-pill"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex flex-col items-center gap-0.5">
              <span className="relative">
                <Icon size={21} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                {badge ? <span className="driver-nav-badge">{badge}</span> : null}
              </span>
              <span className="text-[9px] font-extrabold uppercase leading-none tracking-[0.04em]">{label}</span>
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
