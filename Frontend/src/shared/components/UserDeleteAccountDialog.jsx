import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Trash2 } from "lucide-react";

/**
 * Shared "type DELETE to confirm" account-deletion dialog — same one Food's
 * Settings page uses. Owns its own captcha input state so callers only need
 * `open` / `onClose` / `onConfirm` (called only once the user has typed
 * "DELETE") / `isDeleting`.
 */
export default function UserDeleteAccountDialog({
  open,
  onClose,
  onConfirm,
  isDeleting = false,
  warningText = "Your account will be Deleted. Admin will keep your historical records for revenue reporting.",
}) {
  const [captcha, setCaptcha] = useState("");

  useEffect(() => {
    if (!open) setCaptcha("");
  }, [open]);

  if (!open) return null;

  const canConfirm = captcha === "DELETE" && !isDeleting;

  return (
    <div className="fixed inset-0 z-[99999] overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="flex min-h-screen items-center justify-center p-4 py-10">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1a1a] shadow-2xl border border-red-100 dark:border-red-900/30 overflow-hidden p-6"
        >
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
              <Trash2 className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">Delete Your Account?</h3>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed text-center">
            Are you sure you want to delete your account?
          </p>

          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-r-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-sm font-bold text-red-700 dark:text-red-400">Warning</span>
            </div>
            <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">{warningText}</p>
          </div>

          <div className="mb-6">
            <input
              type="text"
              placeholder="Type DELETE to confirm"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value.toUpperCase())}
              className="w-full h-12 px-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-transparent dark:text-white focus:border-red-500 focus:ring-4 focus:ring-red-50 dark:focus:ring-red-900/20 outline-none transition-all font-bold text-center tracking-widest placeholder:tracking-normal placeholder:font-medium placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 h-12 rounded-xl text-md font-bold border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors outline-none disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-md font-bold shadow-lg shadow-red-600/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all outline-none"
            >
              {isDeleting ? "Deleting..." : "Delete Account"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
