import { useEffect, useRef, useState } from "react"
import { Bell, Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import { inr2, normalizeOrder } from "./desktopData"
import { PrepStepper, btn } from "./ui"

const actionId = (o) => String(o?.orderMongoId || o?._id || o?.orderId || o?.order_id || o?.id || "").trim()

/** Incoming order alert for the desktop panel (the ringtone is handled by useRestaurantNotifications). */
export default function NewOrderModal({ order, onDone }) {
  const [prep, setPrep] = useState(11)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [timeoutSec, setTimeoutSec] = useState(null)
  const [left, setLeft] = useState(null)
  const expired = useRef(false)
  const { stopSound } = useRestaurantNotifications()

  // Same accept window as the phone app: the admin sets it (minutes) for delivery and takeaway orders.
  useEffect(() => {
    let alive = true
    const isTakeaway = String(order?.orderType || "").toLowerCase() === "takeaway"
    restaurantAPI
      .getRestaurantSettings()
      .then((res) => {
        const d = res?.data?.data || {}
        const m = Number(isTakeaway ? d.takeawayAcceptOrderTimeMinutes : d.deliveryAcceptOrderTimeMinutes)
        if (alive) setTimeoutSec(Number.isFinite(m) && m >= 1 && m <= 60 ? Math.round(m) * 60 : null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [order])

  useEffect(() => {
    if (!timeoutSec || !order) return undefined
    const created = order.createdAt ? new Date(order.createdAt).getTime() : Date.now()
    const tick = () => {
      const remaining = timeoutSec - Math.floor((Date.now() - created) / 1000)
      setLeft(Math.max(0, remaining))
      // The phone auto-rejects 5 seconds before the timer ends - do exactly the same here.
      if (remaining <= 5 && !expired.current) {
        expired.current = true
        stopSound?.()
        restaurantAPI
          .rejectOrder(actionId(order), "No response from restaurant (Auto-rejected)")
          .then(() => toast.info("Order auto-rejected due to no response"))
          .catch(() => {})
          .finally(() => onDone(order))
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutSec, order])

  if (!order) return null

  const n = normalizeOrder({ ...order, _id: order.orderMongoId || order._id, orderId: order.orderId })
  const id = actionId(order)

  const accept = async () => {
    setBusy(true)
    try {
      await restaurantAPI.acceptOrder(id, prep)
      toast.success(`Order #${n.orderId} accepted`)
      onDone(order)
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || ""
      if (msg.includes("further ahead") || msg.includes("cannot be moved backwards")) {
        toast.success("Order already accepted")
        onDone(order)
      } else toast.error(msg || "Could not accept the order")
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!reason.trim()) return toast.error("Please enter a reason")
    setBusy(true)
    try {
      await restaurantAPI.rejectOrder(id, reason.trim())
      toast.success(`Order #${n.orderId} rejected`)
      onDone(order)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not reject the order")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/60 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#B80B3D] to-[#7d0728] px-6 py-4 flex items-center gap-3 text-white">
          <span className="h-10 w-10 rounded-full bg-white/20 grid place-items-center">
            <Bell className="h-5 w-5 animate-pulse" />
          </span>
          <div className="flex-1">
            <p className="font-bold text-lg leading-tight">New order #{n.orderId}</p>
            <p className="text-xs text-white/80">{n.type === "Delivery" ? "Home Delivery" : n.type} · {n.customer}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{inr2(n.total)}</p>
            {left != null && <p className="text-[11px] font-semibold text-white/80">Auto-rejects in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>}
          </div>
        </div>

        <div className="px-6 py-5">
          <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto rounded-lg border border-slate-100">
            {n.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-slate-800">
                  <b className="text-slate-900">{it.quantity || 1}×</b> {it.name}
                  {it.variantName ? <span className="text-slate-500"> ({it.variantName})</span> : null}
                </span>
              </li>
            ))}
            {n.items.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No item details</li>}
          </ul>
          {n.note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Note: {n.note}</p>}

          {!rejecting ? (
            <>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Preparation time</p>
              <PrepStepper value={prep} onChange={setPrep} />
              <div className="mt-5 flex gap-3">
                <button onClick={() => setRejecting(true)} disabled={busy} className={`${btn.danger} flex-1 !h-11`}>
                  <X className="h-4 w-4" /> Reject
                </button>
                <button onClick={accept} disabled={busy} className={`${btn.primary} flex-[2] !h-11 !text-sm`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept order
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason for rejecting</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="e.g. Item out of stock"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15"
              />
              <div className="mt-4 flex gap-3">
                <button onClick={() => setRejecting(false)} disabled={busy} className={`${btn.ghost} flex-1 !h-11`}>Back</button>
                <button onClick={reject} disabled={busy} className={`${btn.danger} flex-1 !h-11`}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm reject
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
