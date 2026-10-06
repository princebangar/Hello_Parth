import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Clock3, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI, diningAPI } from "@food/api"
import { DINING_CUISINES, DINING_FACILITIES } from "@food/constants/dining"
import DiningBookings, { usePendingBookingCount } from "./DiningBookings"
import { Chip, Switch, TextInput, pickRestaurant } from "./kit"
import { Card, PageHeader, Spinner, btn } from "./ui"

const norm = (e) => {
  if (!e) return null
  if (typeof e === "string") return e.trim() ? { url: e.trim(), publicId: null } : null
  const url = String(e.url || "").trim()
  return url ? { url, publicId: e.publicId || null } : null
}
const list = (a) => (Array.isArray(a) ? a.map(norm).filter(Boolean) : [])

function PhotoGrid({ title, subtitle, photos, onAdd, onRemove, busy }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
        {photos.map((p) => (
          <div key={p.url} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200">
            <img src={p.url} alt="" className="h-full w-full object-cover" />
            <button onClick={() => onRemove(p.url)} disabled={busy} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-rose-600 opacity-0 shadow transition-opacity hover:bg-white group-hover:opacity-100" aria-label="Remove photo">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="h-5 w-5" />Add photos</span>
          )}
          <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={onAdd} />
        </label>
      </div>
    </Card>
  )
}

function Setup() {
  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [pending, setPending] = useState(null)
  const [s, setS] = useState({ enabled: false, maxGuests: 6, types: [], cuisines: [], cost: "", facilities: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [cover, setCover] = useState([])
  const [menu, setMenu] = useState([])
  const [busyCover, setBusyCover] = useState(false)
  const [busyMenu, setBusyMenu] = useState(false)

  const apply = useCallback((r) => {
    setRestaurant(r)
    setCover(list(r?.coverImages))
    setMenu(list(r?.menuImages))
    const d = r?.diningSettings || {}
    setS({
      enabled: Boolean(d.isEnabled),
      maxGuests: Math.max(1, parseInt(d.maxGuests, 10) || 6),
      types: Array.isArray(d.diningType) ? d.diningType : d.diningType ? [d.diningType] : [],
      cuisines: Array.isArray(r?.cuisines) ? r.cuisines : [],
      cost: r?.costForTwo ? String(r.costForTwo) : "",
      facilities: Array.isArray(d.facilities) ? d.facilities : [],
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const r = pickRestaurant(await restaurantAPI.refreshCurrentRestaurant())
      apply(r)
      const [cat, req] = await Promise.allSettled([diningAPI.getCategories(), restaurantAPI.getPendingDiningRequest()])
      if (cat.status === "fulfilled") setCategories(cat.value?.data?.data || [])
      const raw = req.status === "fulfilled" && req.value?.data?.success ? req.value.data.data : null
      const p = raw && (raw._id || raw.requestedSettings) ? raw : null
      setPending(p)
      if (p?.requestedSettings) {
        const q = p.requestedSettings
        setS((x) => ({ ...x, enabled: q.isEnabled, maxGuests: q.maxGuests, types: Array.isArray(q.diningType) ? q.diningType : q.diningType ? [q.diningType] : [] }))
      }
    } catch {
      toast.error("Could not load dining settings")
    }
  }, [apply])

  useEffect(() => {
    load()
  }, [load])

  // While a request is pending, check every 15s whether the admin has answered.
  useEffect(() => {
    if (!pending) return undefined
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [pending, load])

  const upload = async (e, kind) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ""
    if (!files.length) return
    const set = kind === "cover" ? setBusyCover : setBusyMenu
    set(true)
    try {
      if (kind === "cover") await restaurantAPI.uploadCoverImages(files)
      else await restaurantAPI.uploadMenuImages(files)
      apply(pickRestaurant(await restaurantAPI.getCurrentRestaurant()))
      toast.success(`Uploaded ${files.length} photo(s)`)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Upload failed")
    } finally {
      set(false)
    }
  }

  const remove = async (url, kind) => {
    const set = kind === "cover" ? setBusyCover : setBusyMenu
    set(true)
    try {
      const next = (kind === "cover" ? cover : menu).filter((p) => p.url !== url).map((p) => ({ url: p.url, ...(p.publicId ? { publicId: p.publicId } : {}) }))
      const res = await restaurantAPI.updateProfile(kind === "cover" ? { coverImages: next } : { menuImages: next })
      apply(pickRestaurant(res) || pickRestaurant(await restaurantAPI.getCurrentRestaurant()))
      toast.success("Photo removed")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to remove photo")
    } finally {
      set(false)
    }
  }

  const toggleIn = (key, v) => setS((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((i) => i !== v) : [...x[key], v] }))

  const save = async () => {
    const known = new Set(categories.map((c) => c.slug))
    const types = [...new Set(s.types.filter((t) => known.has(t)))]
    const max = parseInt(s.maxGuests, 10) || 0
    const cost = parseInt(s.cost, 10) || 0
    let msg = ""
    if (!types.length) msg = "Please select at least one dining category"
    else if (s.enabled && !s.cuisines.length) msg = "Please choose the cuisines you serve"
    else if (s.enabled && cost <= 0) msg = "Please add the average price for two people"
    else if (s.enabled && max <= 0) msg = "Guest limit must be at least 1 when dining is enabled"
    setError(msg)
    if (msg) return toast.error(msg)
    setSaving(true)
    try {
      const res = await restaurantAPI.requestDiningUpdate({ isEnabled: s.enabled, maxGuests: max, diningType: types, cuisines: s.cuisines, costForTwo: cost || null, facilities: s.facilities })
      if (res?.data?.success) {
        setPending(res.data.data)
        toast.success("Request sent for approval")
      }
    } catch (err) {
      const m = err?.response?.data?.message || "Failed to submit request"
      setError(m)
      toast.error(m)
    } finally {
      setSaving(false)
    }
  }

  if (!restaurant) return <Spinner label="Loading dining setup…" />
  const locked = !!pending

  return (
    <div className="space-y-4">
      {pending && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Dining update request pending</p>
            <p className="text-sm text-amber-800">Your request to {pending.requestedSettings?.isEnabled ? "enable" : "update"} dining is being reviewed by the admin team. You can edit again once it is answered.</p>
          </div>
        </div>
      )}

      <Card title="Dining controls" subtitle="Changes are sent to admin for approval before they go live">
        <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Dining {s.enabled ? "enabled" : "disabled"}</p>
                <p className="text-xs text-slate-500">Let guests book tables at your restaurant</p>
              </div>
              <Switch checked={s.enabled} onChange={(v) => setS((x) => ({ ...x, enabled: v }))} disabled={locked} label="Dining" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextInput label="Max guests per booking" type="number" min="1" value={s.maxGuests} onChange={(e) => setS((x) => ({ ...x, maxGuests: e.target.value }))} disabled={locked} />
              <TextInput label="Average cost for two (₹)" type="number" min="0" value={s.cost} onChange={(e) => setS((x) => ({ ...x, cost: e.target.value }))} disabled={locked} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-slate-700">Facilities</p>
            <div className="flex flex-wrap gap-2">
              {DINING_FACILITIES.map((f) => <Chip key={f} active={s.facilities.includes(f)} disabled={locked} onClick={() => toggleIn("facilities", f)}>{f}</Chip>)}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-[13px] font-medium text-slate-700">Dining categories <span className="text-rose-500">*</span></p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {categories.map((c) => {
              const on = s.types.includes(c.slug)
              return (
                <button key={c._id} type="button" disabled={locked} onClick={() => toggleIn("types", c.slug)} className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all disabled:opacity-70 ${on ? "border-[#B80B3D] bg-[#B80B3D]/5" : "border-slate-100 hover:border-slate-200"}`}>
                  {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <span className="h-14 w-14 rounded-xl bg-slate-100" />}
                  <span className="text-center text-xs font-semibold text-slate-800">{c.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-[13px] font-medium text-slate-700">Cuisines</p>
          <div className="flex flex-wrap gap-2">
            {DINING_CUISINES.map((c) => <Chip key={c} active={s.cuisines.includes(c)} disabled={locked} onClick={() => toggleIn("cuisines", c)}>{c}</Chip>)}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
        <div className="mt-6 flex justify-end">
          <button onClick={save} disabled={saving || locked} className={`${btn.primary} !h-10 px-6`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Send for approval
          </button>
        </div>
      </Card>

      <PhotoGrid title="Restaurant photos" subtitle="Shown on your dining listing" photos={cover} busy={busyCover} onAdd={(e) => upload(e, "cover")} onRemove={(u) => remove(u, "cover")} />
      <PhotoGrid title="Menu photos" subtitle="Photos of your printed menu" photos={menu} busy={busyMenu} onAdd={(e) => upload(e, "menu")} onRemove={(u) => remove(u, "menu")} />
    </div>
  )
}

export default function DesktopReservations() {
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "setup" ? "setup" : "bookings"
  const [pending, setPending] = usePendingBookingCount()
  return (
    <>
      <PageHeader title="Reservations" subtitle="Table bookings and your dining profile" />
      <div className="mb-5 flex w-fit rounded-lg bg-slate-100 p-0.5">
        {[["bookings", "Bookings"], ["setup", "Dining setup"]].map(([v, l]) => (
          <button key={v} onClick={() => setParams(v === "bookings" ? {} : { tab: v }, { replace: true })} className={`flex h-9 items-center gap-2 rounded-md px-5 text-[13px] font-semibold ${tab === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
            {l}
            {v === "bookings" && pending > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">{pending}</span>}
          </button>
        ))}
      </div>
      {tab === "bookings" ? <DiningBookings onCount={setPending} /> : <Setup />}
    </>
  )
}
