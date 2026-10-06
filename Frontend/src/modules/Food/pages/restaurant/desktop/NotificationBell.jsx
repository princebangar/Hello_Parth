import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, BellOff } from "lucide-react"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import { BASE } from "./kit"
import { timeAgo } from "./ui"

/** Bell with the same behaviour as the admin panel: small card with the latest alerts + "View all". */
export default function NotificationBell() {
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const { items, unreadCount, markAsRead } = useNotificationInbox("restaurant", { limit: 20, pollMs: 60 * 1000 })

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

  const viewAll = () => {
    setOpen(false)
    navigate(`${BASE}/notifications`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        className="relative h-10 w-10 grid place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#B80B3D] text-white text-[10px] font-bold grid place-items-center">
            {unreadCount > 99 ? "99+" : unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
              </p>
            </div>
            <button onClick={viewAll} className="text-xs font-semibold text-[#B80B3D] hover:underline">View all</button>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-slate-400">
                <BellOff className="h-8 w-8" />
                <p className="mt-2 text-sm text-slate-500">No notifications yet</p>
              </div>
            ) : (
              items.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markAsRead(n.id)
                    setOpen(false)
                    navigate(`${BASE}/notifications`)
                  }}
                  className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? "" : "bg-[#B80B3D]/[0.03]"}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-slate-200" : "bg-[#B80B3D]"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{n.title}</span>
                    {n.message && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{n.message}</span>}
                    <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
