import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { User } from "lucide-react"
import { authAPI, restaurantAPI } from "@food/api"
import { clearAuthData, clearModuleAuth, getCurrentUser } from "@food/utils/auth"
import { BASE, imgUrl } from "./kit"

/**
 * The same account popup as the phone (Explore -> profile): photo, name, phone, email,
 * "Logout", "Logout from all devices" (signs this account out everywhere) and Cancel.
 * The logout steps are the same as the phone screen.
 */
export default function LogoutDialog({ open, onClose, restaurant }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const user = useMemo(() => {
    const s = getCurrentUser("restaurant")
    const r = restaurant || {}
    if (s && s.name && s.role) {
      return {
        name: s.name,
        phone: s.phone || r.ownerPhone || r.phone || "",
        email: s.email || r.ownerEmail || r.email || "",
        image: s.profileImage || r.profileImage,
      }
    }
    return {
      name: r.ownerName || r.name || r.restaurantName || "Restaurant",
      phone: r.ownerPhone || r.primaryContactNumber || r.phone || "",
      email: r.ownerEmail || r.email || "",
      image: r.profileImage,
    }
  }, [restaurant, open])

  const signOutFirebase = async () => {
    try {
      const { signOut } = await import("firebase/auth")
      const { firebaseAuth, ensureFirebaseInitialized } = await import("@food/firebase")
      ensureFirebaseInitialized({ enableAuth: true, enableRealtimeDb: false })
      if (firebaseAuth.currentUser) await signOut(firebaseAuth)
    } catch {
      /* continue with local cleanup */
    }
  }

  const finish = () => {
    window.dispatchEvent(new Event("restaurantAuthChanged"))
    setTimeout(() => navigate(`${BASE}/login`, { replace: true }), 300)
  }

  const logout = async () => {
    if (busy) return
    setBusy(true)
    try {
      try {
        await restaurantAPI.logout()
      } catch {
        /* continue with local cleanup */
      }
      await signOutFirebase()
      clearModuleAuth("restaurant")
      ;["restaurant_onboarding", "restaurant_accessToken", "restaurant_authenticated", "restaurant_user"].forEach((k) => localStorage.removeItem(k))
      sessionStorage.removeItem("restaurantAuthData")
    } finally {
      finish()
    }
  }

  const logoutAll = async () => {
    if (busy) return
    setBusy(true)
    try {
      try {
        await authAPI.logoutFromAllDevices("restaurant")
      } catch {
        /* continue with local cleanup */
      }
      await signOutFirebase()
      clearAuthData()
      localStorage.removeItem("restaurant_onboarding")
      ;["restaurantAuthData", "adminAuthData", "deliveryAuthData", "userAuthData"].forEach((k) => sessionStorage.removeItem(k))
      ;["restaurantAuthChanged", "adminAuthChanged", "deliveryAuthChanged", "userAuthChanged"].forEach((e) => window.dispatchEvent(new Event(e)))
    } finally {
      finish()
    }
  }

  if (!open) return null
  const img = imgUrl(user.image)

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/55 p-6 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div className="flex w-full max-w-[360px] flex-col items-center rounded-[1.8rem] bg-white p-7 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {img ? (
          <img src={img} alt="" className="h-[84px] w-[84px] rounded-full object-cover shadow-sm ring-4 ring-slate-50" />
        ) : (
          <div className="grid h-[84px] w-[84px] place-items-center rounded-full bg-slate-100 ring-4 ring-slate-50"><User className="h-10 w-10 text-slate-400" /></div>
        )}
        <h3 className="mt-3 text-center text-[19px] font-black leading-tight text-slate-900">{user.name}</h3>
        {user.phone && <p className="mt-1 text-[13px] font-medium text-slate-500">{user.phone}</p>}
        {user.email && user.email !== "N/A" && <p className="text-[13px] font-medium text-slate-400">{user.email}</p>}

        <button onClick={logout} disabled={busy} className="mt-6 h-12 w-full rounded-2xl bg-red-600 text-sm font-extrabold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-60">
          {busy ? "Logging out..." : "Logout"}
        </button>
        <button onClick={logoutAll} disabled={busy} className="mt-3 h-12 w-full rounded-2xl border border-red-300 bg-white text-sm font-extrabold text-red-600 transition hover:bg-red-50 active:scale-[0.98] disabled:opacity-60">
          {busy ? "Logging out..." : "Logout from all devices"}
        </button>
        <button onClick={onClose} disabled={busy} className="mt-4 text-sm font-bold text-slate-500 hover:text-slate-800 disabled:opacity-50">Cancel</button>
      </div>
    </div>
  )
}
