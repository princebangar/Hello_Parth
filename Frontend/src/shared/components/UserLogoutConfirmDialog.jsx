import { createPortal } from "react-dom";
import { Power } from "lucide-react";
import { motion } from "framer-motion";
import useBodyScrollLock from "@/shared/hooks/useBodyScrollLock.js";

export default function UserLogoutConfirmDialog({
  open,
  onClose,
  onConfirm,
  isLoggingOut = false,
  // Food's own red accent, kept as the default so Food's usage needs no
  // changes. Taxi passes its own (blue) values — same dialog, same layout,
  // just a different brand colour, per how the two apps otherwise share
  // this component.
  iconBgClassName = "bg-red-50 dark:bg-red-950/30",
  iconClassName = "text-[#FF3131]",
  confirmButtonClassName = "bg-[#FF3131] hover:bg-[#E02626] shadow-red-500/20",
}) {
  // The page behind must not scroll while the popup is open.
  useBodyScrollLock(open);

  if (!open || typeof document === "undefined") return null;

  // Rendered straight into <body>, like the Appearance dialog. Inside a page the popup inherited that
  // page's styling: Taxi's `.user-app-theme` turned the dim backdrop and the full-height wrapper into
  // solid white (plain white screen, white-on-dark button text), and any transformed / clipped parent
  // could push the fixed overlay away from the viewport so the user had to scroll to find it.
  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={isLoggingOut ? undefined : onClose}
      role="presentation"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        role="alertdialog"
        aria-modal="true"
        aria-label="Log out"
        onClick={(event) => event.stopPropagation()}
        className="my-auto w-full max-w-sm rounded-2xl bg-white/75 dark:bg-[#1a1a1a]/75 backdrop-blur-md shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden p-6 text-center"
      >
        <div className="flex flex-col items-center mb-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${iconBgClassName}`}>
            <Power className={`h-7 w-7 ${iconClassName}`} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Log out?</h3>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
          Are you sure you want to log out?
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoggingOut}
            className="flex-1 h-12 rounded-xl text-md font-bold border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#262626] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#333] transition-colors outline-none"
          >
            No
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className={`flex-1 h-12 rounded-xl text-white text-md font-bold shadow-lg active:scale-95 transition-all outline-none ${confirmButtonClassName}`}
          >
            {isLoggingOut ? "Logging out..." : "Yes"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
