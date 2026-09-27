import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ChevronDown, LogOut, Menu, User } from "lucide-react"
import { GLOBAL_ADMIN_HOME } from "@/shared/utils/activeModule.js"
import { isPlatformAdmin, readAdminProfile } from "@/shared/utils/adminAccess.js"
import { getGlobalPageTitle } from "../constants/globalMenu"
import { signOutAdmin } from "../utils/adminSession"

export default function GlobalTopbar({ onMenuClick }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  const profile = readAdminProfile()
  const name = profile.name || profile.email || "Admin"
  const roleLabel = isPlatformAdmin(profile) ? "Super Admin" : "Sub Admin"
  const initial = String(name).trim().charAt(0).toUpperCase() || "A"

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const handleSignOut = async () => {
    setOpen(false)
    await signOutAdmin()
    navigate("/admin/login", { replace: true })
  }

  return (
    <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between gap-3 px-4 lg:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-none">Global Admin</p>
          <h2 className="text-base font-bold text-slate-900 truncate leading-tight mt-1">{getGlobalPageTitle(location.pathname)}</h2>
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white pl-1.5 pr-2.5 py-1.5 hover:bg-slate-50 transition-colors"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">{initial}</span>
          <span className="hidden sm:block text-left leading-tight">
            <span className="block text-sm font-semibold text-slate-900 max-w-[160px] truncate">{name}</span>
            <span className="block text-[11px] text-slate-500">{roleLabel}</span>
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>

        {open && (
          <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50">
            <div className="px-3.5 py-2 border-b border-slate-100 mb-1">
              <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
              {profile.email && <p className="text-xs text-slate-500 truncate">{profile.email}</p>}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate(`${GLOBAL_ADMIN_HOME}/profile`)
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <User className="w-4 h-4 text-slate-500" />
              Profile
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
