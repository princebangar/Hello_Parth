import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Moon, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getFoodUserTheme,
  saveFoodUserTheme,
  THEME_CHANGE_EVENT,
} from "@/shared/utils/theme.js";

export default function UserAppearanceDialog({ open, onOpenChange }) {
  const [theme, setTheme] = useState(() => getFoodUserTheme());
  // Picking a theme should feel instant — no lingering blurred backdrop
  // while it fades out. A plain dismiss (backdrop tap / X) still animates.
  const instantCloseRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    instantCloseRef.current = false;
    setTheme(getFoodUserTheme());
  }, [open]);

  useEffect(() => {
    const syncTheme = () => setTheme(getFoodUserTheme());
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  // Plain `overflow:hidden` on body doesn't reliably block touch-drag
  // scrolling on mobile WebViews. Pinning body with `position:fixed` at the
  // current scroll offset (and restoring it on close) blocks scroll on both
  // touch and desktop, and doesn't jump the page on close.
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const selectTheme = (nextTheme) => {
    instantCloseRef.current = true;
    saveFoodUserTheme(nextTheme);
    setTheme(nextTheme);
    onOpenChange?.(false);
  };

  const options = [
    {
      id: "light",
      title: "Light",
      description: "Default light theme",
      icon: Sun,
      iconClass: "text-yellow-500",
    },
    {
      id: "dark",
      title: "Dark",
      description: "Dark theme",
      icon: Moon,
      iconClass: "text-slate-500 dark:text-slate-300",
    },
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4">
          <motion.button
            type="button"
            aria-label="Close appearance settings"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: instantCloseRef.current ? 0 : 0.2 }}
            onClick={() => onOpenChange?.(false)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: instantCloseRef.current ? 0 : 0.22, ease: "easeOut" }}
            className="relative z-[1] w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Appearance</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Same theme for Food and Taxi
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange?.(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-transform active:scale-95"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-2 px-5 py-5">
              {options.map(({ id, title, description, icon: Icon, iconClass }) => {
                const selected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTheme(id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all ${
                      selected
                        ? "border-[#DC2626] bg-[#fdfafc] dark:border-[#DC2626] dark:bg-[#7F1D1D]/20"
                        : "border-border bg-background hover:border-muted-foreground/30"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                        selected
                          ? "border-[#DC2626] bg-[#DC2626]"
                          : "border-border"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <Icon className={`h-5 w-5 flex-shrink-0 ${iconClass}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{title}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
