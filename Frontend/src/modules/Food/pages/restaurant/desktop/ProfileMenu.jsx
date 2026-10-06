import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react"
import { BASE, imgUrl } from "./kit"

/** Avatar dropdown like the admin panel: name + email, Profile settings, Settings, Logout. */
export default function ProfileMenu({ restaurant, onLogout }) {
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const name = restaurant?.name || restaurant?.restaurantName || "Your restaurant"
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "R"
  const avatar = imgUrl(restaurant?.profileImage)
  const sub = restaurant?.ownerEmail || restaurant?.ownerName || restaurant?.primaryContactNumber || ""

  const Avatar = ({ size }) =>
    avatar ? (
      <img src={avatar} alt="" className={`${size} rounded-full object-cover border border-slate-200`} />
    ) : (
      <span className={`${size} rounded-full bg-[#B80B3D]/10 font-bold text-[#B80B3D] grid place-items-center`}>{initials}</span>
    )

  const item = (Icon, label, onClick, danger) => (
    <button
      onClick={() => {
        setOpen(false)
        onClick()
      }}
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm ${danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-label="Profile menu">
        <Avatar size="h-10 w-10" />
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-13 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 p-4">
            <Avatar size="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
              {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
            </div>
          </div>
          <div className="py-1">
            {item(UserRound, "Profile & Outlet Settings", () => navigate(`${BASE}/edit-owner`))}
            {item(Settings, "Settings", () => navigate(`${BASE}/account`))}
          </div>
          <div className="border-t border-slate-100 py-1">{item(LogOut, "Logout", onLogout, true)}</div>
        </div>
      )}
    </div>
  )
}
