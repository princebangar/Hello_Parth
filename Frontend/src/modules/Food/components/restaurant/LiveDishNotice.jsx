import { useCallback, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { PackagePlus, X } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { isMyStorePartner } from "@food/utils/auth"
import { menuItemsFromResponse } from "@food/pages/restaurant/desktop/desktopData"

/**
 * Customers only see a restaurant once it has at least one approved, in-stock item
 * (the user list hides the rest). This tells an approved restaurant why it is not
 * visible yet and what to do: the Orders tab shows a banner, the Dashboard a popup.
 * My Store partners are listed without a live menu, so they never see it.
 */

const POPUP_SEEN_KEY = "hp_live_dish_popup_seen"
// Only shared between the banner and the popup that mount together; a fresh visit always re-reads the menu,
// so adding an item makes the notice disappear straight away.
const CACHE_MS = 3 * 1000
let cached = { at: 0, value: null }

const classify = (items) => {
  if (!items.length) return "none"
  const live = items.filter((i) => i.approvalStatus === "approved" && i.isAvailable !== false)
  if (live.length) return "ok"
  if (items.some((i) => i.approvalStatus === "pending")) return "pending"
  if (items.some((i) => i.approvalStatus === "approved")) return "unavailable"
  return "none"
}

const COPY = {
  none: {
    title: "Your restaurant is approved",
    body: "Customers will see it in the app only after you add at least one item to your menu. Add your first item to go live.",
    action: "Add items",
    to: "new",
  },
  pending: {
    title: "Your items are waiting for approval",
    body: "Your restaurant is approved. Customers will see it as soon as one of your items is approved by the admin.",
    action: "View items",
    to: "list",
  },
  unavailable: {
    title: "All your items are out of stock",
    body: "Customers can't see your restaurant while every item is switched off. Turn on at least one item to show up in the app.",
    action: "Open items",
    to: "list",
  },
}

export function useLiveDishStatus() {
  const [state, setState] = useState(() => (isMyStorePartner() ? "ok" : cached.value || "loading"))

  const load = useCallback(async () => {
    if (isMyStorePartner()) return
    if (cached.value && Date.now() - cached.at < CACHE_MS) {
      setState(cached.value)
      return
    }
    try {
      const next = classify(menuItemsFromResponse(await restaurantAPI.getMenu()))
      cached = { at: Date.now(), value: next }
      setState(next)
    } catch {
      // If the menu cannot be read, say nothing rather than show a wrong warning.
      setState((current) => (current === "loading" ? "ok" : current))
    }
  }, [])

  useEffect(() => {
    load()
    const onVisible = () => document.visibilityState === "visible" && load()
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [load])

  return state
}

// An empty menu goes straight to the add-item page; otherwise to the item list (to approve / switch items on).
const useActionTarget = (copy) => {
  const { pathname } = useLocation()
  const base = pathname.includes("/food/restaurant") ? "/food/restaurant" : "/restaurant"
  if (copy?.to === "new") return { path: `${base}/hub-menu/item/new`, state: { backTo: pathname } }
  return { path: `${base}/inventory`, state: undefined }
}

const BRAND_BUTTON = "bg-gradient-to-br from-[#B80B3D] to-[#66001D] text-white"

/** Inline card for the Orders tab. Renders nothing once the restaurant has a live item. */
export function LiveDishBanner({ className = "" }) {
  const status = useLiveDishStatus()
  const navigate = useNavigate()
  const copy = COPY[status]
  const target = useActionTarget(copy)
  if (!copy) return null

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl border border-[#ead6e3] bg-[#f9f0f7] px-4 py-3 text-slate-900 ${className}`}
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#B80B3D]">
        <PackagePlus className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-tight">{copy.title}</p>
        <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-slate-600">{copy.body}</p>
        <button
          type="button"
          onClick={() => navigate(target.path, { state: target.state })}
          className={`mt-2 rounded-full px-4 py-1.5 text-[12px] font-semibold active:scale-95 ${BRAND_BUTTON}`}
        >
          {copy.action}
        </button>
      </div>
    </div>
  )
}

/** Popup for the Dashboard: shown once per login session while the restaurant has no live item. */
export function LiveDishPopup() {
  const status = useLiveDishStatus()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const copy = COPY[status]
  const target = useActionTarget(copy)

  useEffect(() => {
    if (!copy) return
    try {
      if (sessionStorage.getItem(POPUP_SEEN_KEY) === "1") return
    } catch {
      // storage blocked: still show it, once per page load
    }
    setOpen(true)
  }, [copy])

  const close = () => {
    setOpen(false)
    try {
      sessionStorage.setItem(POPUP_SEEN_KEY, "1")
    } catch {
      // ignore
    }
  }

  if (!open || !copy) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f9f0f7] text-[#B80B3D]">
          <PackagePlus className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-xl font-bold text-slate-900">{copy.title}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">{copy.body}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-semibold text-slate-600"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              navigate(target.path, { state: target.state })
            }}
            className={`flex-1 rounded-full px-4 py-2.5 text-[14px] font-semibold ${BRAND_BUTTON}`}
          >
            {copy.action}
          </button>
        </div>
      </div>
    </div>
  )
}
