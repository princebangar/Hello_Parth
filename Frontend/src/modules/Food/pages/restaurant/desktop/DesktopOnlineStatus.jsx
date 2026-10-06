import { useNavigate } from "react-router-dom"
import { Clock, Power, ShoppingBag, Truck } from "lucide-react"
import { toast } from "sonner"
import { BASE, SubPageHeader, Switch } from "./kit"
import { useStatus } from "./StatusContext"
import { Card, Spinner, btn } from "./ui"

const fmt = (t) => {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`
}

/** Same two switches as the phone "Restaurant status" screen (delivery + takeaway), same rules and popups. */
export default function DesktopOnlineStatus() {
  const navigate = useNavigate()
  const s = useStatus()
  if (!s?.ready) return <Spinner />

  const day = s.timings?.[["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][s.now.getDay()]]
  const tone = s.label === "Online" ? "bg-emerald-50 text-emerald-600" : s.label === "Closed" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"

  const toggleDelivery = async (v) => {
    const ok = await s.setDelivery(v)
    if (ok === false) toast.error("Error updating delivery status")
    else if (ok) toast.success(v ? "Delivery is now ON - You're receiving orders" : "Delivery is now OFF - Not receiving orders", { closeButton: false })
  }
  const toggleTakeaway = async (v) => {
    const ok = await s.setTakeawayEnabled(v)
    if (!ok) toast.error("Failed to update takeaway status")
    else toast.success(`Takeaway ${v ? "enabled" : "disabled"} successfully`, { closeButton: false })
  }

  return (
    <>
      <SubPageHeader title="Restaurant status" subtitle="Control whether customers can place new orders" />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <div className="flex items-center gap-5">
            <span className={`grid h-16 w-16 place-items-center rounded-2xl ${tone}`}><Power className="h-7 w-7" /></span>
            <div className="flex-1">
              <p className="text-lg font-bold text-slate-900">You are {s.label.toLowerCase()}</p>
              <p className="text-sm text-slate-500">
                {s.label === "Online" && "Customers can order from your restaurant right now."}
                {s.label === "Offline" && "New orders are paused until you go online again."}
                {s.label === "Closed" && "Delivery is switched on, but you are outside your outlet timings."}
              </p>
            </div>
          </div>
          {!s.within && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {s.dayClosed ? "Today is marked closed in your outlet timings." : "You are currently outside your scheduled delivery timings."}
            </p>
          )}
        </Card>

        <Card bodyClass="p-0">
          <div className="flex items-center gap-4 px-5 py-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Truck className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Delivery status</p>
              <p className="text-xs text-slate-500">{day && day.isOpen !== false ? `Today ${fmt(day.openingTime)} – ${fmt(day.closingTime)}` : "Delivery timings follow your outlet timings"}</p>
            </div>
            <Switch checked={s.accepting} disabled={s.busy} onChange={toggleDelivery} label="Delivery status" />
          </div>
          <div className="flex items-center gap-4 border-t border-slate-100 px-5 py-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-600"><ShoppingBag className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Takeaway orders</p>
              <p className="text-xs text-slate-500">Let customers place pickup orders from your restaurant</p>
            </div>
            <Switch checked={s.takeaway} onChange={toggleTakeaway} label="Takeaway orders" />
          </div>
        </Card>

        <div className="flex items-center gap-3 rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200/80">
          <Clock className="h-5 w-5 shrink-0 text-slate-400" />
          Your opening hours are managed separately.
          <button onClick={() => navigate(`${BASE}/outlet-timings`)} className={`${btn.ghost} ml-auto`}>Outlet timings</button>
        </div>
      </div>
    </>
  )
}
