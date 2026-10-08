import { Store, UtensilsCrossed } from "lucide-react"

const PARTNER_ROLES = [
  { id: "restaurant", label: "Restaurant Partner", Icon: UtensilsCrossed },
  { id: "store", label: "My Store", Icon: Store },
]

/**
 * Two-way role switch on the restaurant login screen: Restaurant Partner or
 * My Store. A phone number belongs to one of them only, so this is chosen before
 * the OTP is sent (same idea as the driver app's role picker).
 */
export default function PartnerRolePicker({ value, onChange, disabled = false }) {
  return (
    <div
      role="radiogroup"
      aria-label="Login as"
      className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1 dark:bg-gray-800"
    >
      {PARTNER_ROLES.map(({ id, label, Icon }) => {
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-[13px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "bg-gradient-to-r from-[#B80B3D] to-[#66001D] text-white shadow-md shadow-[#B80B3D]/25"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
