import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Store, UtensilsCrossed } from "lucide-react"

const ROLE_LABEL = { restaurant: "Restaurant Partner", store: "My Store" }
const ROLE_ICON = { restaurant: UtensilsCrossed, store: Store }

/**
 * Small confirm popup on the restaurant login screen: the number already has an account for the OTHER role
 * (Restaurant Partner <-> My Store). One number can have both, so this only checks that a second account is
 * really wanted (e.g. not a mis-tap on the wrong role). Same card style as the restaurant "Logout" popup, in the
 * login page colours.
 *
 * requestedPartnerType: the role chosen on the login screen (the account that would be created).
 * existingPartnerType:  the role this number is already registered as.
 */
export default function NewRoleConfirmDialog({
  open,
  requestedPartnerType,
  existingPartnerType,
  busy = false,
  onConfirm,
  onClose,
}) {
  const requested = ROLE_LABEL[requestedPartnerType] || "My Store"
  const existing = ROLE_LABEL[existingPartnerType] || "Restaurant Partner"
  const Icon = ROLE_ICON[requestedPartnerType] || Store

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/50 px-5 py-10 backdrop-blur-sm"
          onClick={() => {
            if (!busy) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-role-title"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.2 }}
            className="flex w-full max-w-[320px] flex-col items-center rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#1a1a1a]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#B80B3D]/10">
              <Icon className="h-7 w-7 text-[#B80B3D]" strokeWidth={1.9} />
            </div>

            <h3
              id="new-role-title"
              className="mb-1.5 text-center text-[17px] font-black leading-tight text-[#1F2937] dark:text-white"
            >
              Create {requested} account?
            </h3>
            <p className="text-center text-[13.5px] font-medium leading-relaxed text-gray-500 dark:text-gray-400">
              This number is already registered as {existing}. Do you want to create a separate {requested} account
              with the same number?
            </p>

            <div className="mt-5 grid w-full grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-[14px] border-[1.5px] border-gray-300 bg-white py-3 text-[15px] font-bold text-gray-600 transition-all active:scale-[0.98] disabled:opacity-60 dark:border-gray-600 dark:bg-transparent dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-[#B80B3D] to-[#66001D] py-3 text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(184,11,61,0.3)] transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
