import { useEffect, useState } from "react"
import { Copy, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { SubPageHeader, Switch } from "./kit"
import { Card, Spinner, btn } from "./ui"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const defaults = () => Object.fromEntries(DAYS.map((d) => [d, { isOpen: true, openingTime: "09:00", closingTime: "22:00" }]))

const timeCls = "h-10 w-36 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15 disabled:bg-slate-50 disabled:text-slate-400"

export default function DesktopTimings() {
  const [days, setDays] = useState(null)
  const [initial, setInitial] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    restaurantAPI
      .getOutletTimings()
      .then((res) => {
        const t = res?.data?.data?.outletTimings || res?.data?.outletTimings
        const next = { ...defaults(), ...(t && typeof t === "object" ? t : {}) }
        if (alive) {
          setDays(next)
          setInitial(JSON.stringify(next))
        }
      })
      .catch(() => {
        if (alive) {
          setDays(defaults())
          setInitial(JSON.stringify(defaults()))
        }
      })
    return () => {
      alive = false
    }
  }, [])

  const patch = (d, p) => setDays((x) => ({ ...x, [d]: { ...x[d], ...p } }))
  const copyMonday = () => setDays((x) => Object.fromEntries(DAYS.map((d) => [d, { ...x[d], isOpen: x.Monday.isOpen, openingTime: x.Monday.openingTime, closingTime: x.Monday.closingTime }])))

  const save = async () => {
    for (const d of DAYS) {
      const v = days[d]
      if (v.isOpen && v.openingTime >= v.closingTime) return toast.error(`${d}: closing time must be after opening time`)
    }
    setSaving(true)
    try {
      await restaurantAPI.saveOutletTimings(days)
      window.dispatchEvent(new Event("outletTimingsUpdated"))
      setInitial(JSON.stringify(days))
      toast.success("Outlet timings saved")
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to save timings")
    } finally {
      setSaving(false)
    }
  }

  if (!days) return <Spinner label="Loading timings…" />
  const dirty = JSON.stringify(days) !== initial

  return (
    <>
      <SubPageHeader
        title="Outlet timings"
        subtitle="Set the hours your kitchen is open each day"
        actions={
          <>
            <button onClick={copyMonday} className={btn.ghost}><Copy className="h-4 w-4" /> Copy Monday to all</button>
            <button onClick={save} disabled={saving || !dirty} className={btn.primary}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save timings</button>
          </>
        }
      />
      <Card bodyClass="p-0">
        <ul className="divide-y divide-slate-100">
          {DAYS.map((d) => {
            const v = days[d]
            return (
              <li key={d} className="flex items-center gap-6 px-6 py-4">
                <p className="w-32 text-sm font-semibold text-slate-900">{d}</p>
                <Switch checked={v.isOpen} onChange={(o) => patch(d, { isOpen: o })} label={`${d} open`} />
                <span className={`w-14 text-xs font-semibold ${v.isOpen ? "text-emerald-600" : "text-slate-400"}`}>{v.isOpen ? "Open" : "Closed"}</span>
                <div className="flex items-center gap-3">
                  <input type="time" value={v.openingTime} disabled={!v.isOpen} onChange={(e) => patch(d, { openingTime: e.target.value })} className={timeCls} />
                  <span className="text-sm text-slate-400">to</span>
                  <input type="time" value={v.closingTime} disabled={!v.isOpen} onChange={(e) => patch(d, { closingTime: e.target.value })} className={timeCls} />
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
