import { Power } from "lucide-react";
import { motion } from "framer-motion";

export default function UserLogoutConfirmDialog({
  open,
  onClose,
  onConfirm,
  isLoggingOut = false,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm rounded-2xl bg-white/75 dark:bg-[#1a1a1a]/75 backdrop-blur-md shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden p-6 text-center"
        >
          <div className="flex flex-col items-center mb-4">
            <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-3">
              <Power className="h-7 w-7 text-[#FF3131]" />
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
              className="flex-1 h-12 rounded-xl bg-[#FF3131] hover:bg-[#E02626] text-white text-md font-bold shadow-lg shadow-red-500/20 active:scale-95 transition-all outline-none"
            >
              {isLoggingOut ? "Logging out..." : "Yes"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
