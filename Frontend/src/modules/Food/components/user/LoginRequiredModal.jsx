import { X, LogIn } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"

export default function LoginRequiredModal({ isOpen, onClose, intent = "general" }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  if (!isOpen) return null

  const isTaxiIntent = intent === "taxi"
  const caption = isTaxiIntent
    ? "Please login to book rides, parcels, and more on Hello Parth Taxi."
    : "Please login to continue your delicious journey"

  const handleLoginClick = () => {
    onClose?.()
    // Always return guests to Food on Back — Taxi is login-only.
    const from = "/food/user"
    try {
      sessionStorage.setItem("hello_parth_login_return_to", from)
    } catch (_) {}
    navigate("/login", {
      state: {
        from,
        // Keep taxi intent only for post-login landing after successful OTP.
        postLoginTo: isTaxiIntent ? "/taxi/user" : "/food/user",
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[380px] bg-[#FCF9F2] dark:bg-[#1C1613] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-[#EBE1CD] dark:border-[#382D24] overflow-hidden transform transition-all duration-300 scale-100 flex flex-col items-center p-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-[#EBE1CD]/40 dark:hover:bg-[#382D24]/40 text-[#DC2626] dark:text-[#EAE0D5] transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-full absolute top-0 left-0 right-0 pointer-events-none select-none">
          <div className="h-[2px] w-full bg-[#DC2626] opacity-30" />
        </div>

        <div className="mt-6 mb-5 flex items-center justify-center w-16 h-16 rounded-2xl bg-[#EBE1CD]/30 dark:bg-[#382D24]/30 border border-[#EBE1CD] dark:border-[#382D24] shadow-sm">
          <LogIn className="w-7 h-7 text-[#DC2626] dark:text-[#E8AF9D]" />
        </div>

        <h3 className="text-xl font-black tracking-wider text-[#DC2626] dark:text-[#F3D7C9] uppercase mb-3 font-serif">
          LOGIN REQUIRED
        </h3>

        <p className="text-sm md:text-base text-[#615446] dark:text-[#C5B39E] font-medium leading-relaxed max-w-[300px] mb-6">
          {caption}
        </p>

        <button
          onClick={handleLoginClick}
          className="w-full py-3.5 px-6 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] active:bg-[#991B1B] text-white font-bold tracking-widest text-sm shadow-md hover:shadow-lg transition-all transform active:scale-98 mb-2"
        >
          LOGIN / SIGN UP
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 text-xs font-bold uppercase tracking-wider text-[#8A7A68] dark:text-[#A89884] hover:text-[#DC2626] transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
