import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Search, RefreshCw, Plus, Pencil, Trash2, Star, UtensilsCrossed, CheckCircle2, PauseCircle, Loader2, ImagePlus } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI, uploadAPI } from "@food/api"
import { BASE, ConfirmDialog, Modal, SelectInput, Switch, TextArea, TextInput, pickRestaurant } from "./kit"
import { inr, menuItemsFromResponse } from "./desktopData"
import { RECOMMENDED_KEY, STOCK_RULES_KEY, buildStockRule, isRuleActive, readJson, ruleLabel, writeJson } from "./stockRules"
import { Card, Empty, Kpi, PageHeader, Spinner, btn } from "./ui"

const APPROVAL = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
}

const Badge = ({ status }) => (
  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${APPROVAL[status] || APPROVAL.pending}`}>{status}</span>
)

const Thumb = ({ src, size = "h-11 w-11" }) =>
  src ? <img src={src} alt="" className={`${size} shrink-0 rounded-lg bg-slate-100 object-cover`} /> : (
    <span className={`${size} grid shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400`}><UtensilsCrossed className="h-4 w-4" /></span>
  )

const uploadedUrl = (res) => res?.data?.data?.url || res?.data?.url || ""

/* ------------------------------ Dishes ------------------------------ */
const FILTERS = [
  ["all", "All"],
  ["in-stock", "In stock"],
  ["out-of-stock", "Out of stock"],
  ["recommended", "Recommended"],
  ["veg", "Veg"],
  ["non-veg", "Non-veg"],
]

function Dishes() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [items, setItems] = useState(null)
  const [profile, setProfile] = useState(null)
  const [query, setQuery] = useState(params.get("q") || "")
  const [category, setCategory] = useState("all")
  const [filter, setFilter] = useState("all")
  const [saving, setSaving] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [rules, setRules] = useState(() => readJson(STOCK_RULES_KEY))
  const [recommended, setRecommended] = useState(() => readJson(RECOMMENDED_KEY))
  // "turn off" dialog: target = { ids: [..], label }
  const [offTarget, setOffTarget] = useState(null)
  const [option, setOption] = useState("specific-time")
  const [hours, setHours] = useState(3)
  const [customDate, setCustomDate] = useState("")
  const [customTime, setCustomTime] = useState("14:30")
  const rulesRef = useRef(rules)
  rulesRef.current = rules

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setItems(menuItemsFromResponse(await restaurantAPI.getMenu()))
    } catch {
      setItems((p) => p || [])
    } finally {
      setRefreshing(false)
    }
  }, [])
  useEffect(() => {
    load()
    restaurantAPI.getCurrentRestaurant().then((r) => setProfile(pickRestaurant(r))).catch(() => {})
  }, [load])

  const saveRules = (next) => {
    setRules(next)
    writeJson(STOCK_RULES_KEY, next)
  }

  // An item with a still-running "out of stock" rule is shown as off, like on the phone.
  const view = useMemo(
    () => (items || []).map((i) => ({ ...i, available: i.isAvailable && !isRuleActive(rules[i.id]), rule: rules[i.id] || null, recommended: recommended[i.id] === true })),
    [items, rules, recommended],
  )

  const setAvailability = useCallback(async (ids, available) => {
    setSaving((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, true])) }))
    setItems((arr) => arr.map((i) => (ids.includes(i.id) ? { ...i, isAvailable: available } : i)))
    try {
      await Promise.all(ids.map((id) => restaurantAPI.updateFood(id, { isAvailable: available })))
      return true
    } catch (e) {
      setItems((arr) => arr.map((i) => (ids.includes(i.id) ? { ...i, isAvailable: !available } : i)))
      toast.error(e?.response?.data?.message || "Failed to update availability")
      return false
    } finally {
      setSaving((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, false])) }))
    }
  }, [])

  // Items whose timer has run out come back automatically (the phone does this every 15 seconds too).
  useEffect(() => {
    const check = async () => {
      const now = Date.now()
      const expired = Object.entries(rulesRef.current)
        .filter(([, r]) => r?.mode !== "manual" && r?.resumeAt && new Date(r.resumeAt).getTime() <= now)
        .map(([id]) => id)
      if (!expired.length) return
      const next = { ...rulesRef.current }
      expired.forEach((id) => delete next[id])
      saveRules(next)
      await setAvailability(expired, true)
    }
    check()
    const t = setInterval(check, 15000)
    return () => clearInterval(t)
  }, [setAvailability])

  const turnOn = async (ids) => {
    const next = { ...rules }
    ids.forEach((id) => delete next[id])
    saveRules(next)
    await setAvailability(ids, true)
  }

  const confirmOff = async () => {
    const rule = buildStockRule({ option, hours, customDate, customTime, profile })
    if (option === "custom-date-time") {
      if (!rule.resumeAt) return toast.error("Please select a valid custom date and time")
      if (new Date(rule.resumeAt).getTime() <= Date.now()) return toast.error("Custom date & time must be in the future")
    }
    const ids = offTarget.ids
    setOffTarget(null)
    const next = { ...rules }
    ids.forEach((id) => (next[id] = rule))
    saveRules(next)
    await setAvailability(ids, false)
  }

  const askOff = (ids, label) => {
    setOption("specific-time")
    setHours(3)
    setCustomDate("")
    setCustomTime("14:30")
    setOffTarget({ ids, label })
  }

  const toggleItem = (i) => (i.available ? askOff([i.id], i.name) : turnOn([i.id]))

  const toggleRecommended = (i) => {
    const next = { ...recommended, [i.id]: !i.recommended }
    setRecommended(next)
    writeJson(RECOMMENDED_KEY, next)
  }

  const categories = useMemo(() => ["all", ...new Set(view.map((i) => i.category))], [view])
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return view.filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (filter === "all" ||
          (filter === "in-stock" && i.available) ||
          (filter === "out-of-stock" && !i.available) ||
          (filter === "recommended" && i.recommended) ||
          (filter === "veg" && i.foodType === "Veg") ||
          (filter === "non-veg" && i.foodType !== "Veg")) &&
        (!q || i.name.toLowerCase().includes(q)),
    )
  }, [view, query, category, filter])

  const remove = async () => {
    setDeleting(true)
    try {
      await restaurantAPI.deleteFood(toDelete.id)
      toast.success("Item deleted")
      setItems((arr) => arr.filter((i) => i.id !== toDelete.id))
      setToDelete(null)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not delete item")
    } finally {
      setDeleting(false)
    }
  }

  if (!items) return <Spinner label="Loading dishes…" />
  const available = view.filter((i) => i.available).length
  const catItems = category === "all" ? [] : view.filter((i) => i.category === category)
  const catAllOn = catItems.length > 0 && catItems.every((i) => i.available)

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi label="Total dishes" value={items.length} icon={UtensilsCrossed} tone="rose" />
        <Kpi label="In stock" value={available} icon={CheckCircle2} tone="emerald" />
        <Kpi label="Out of stock" value={items.length - available} icon={PauseCircle} tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search dishes" className="h-9 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none">
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </select>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {FILTERS.map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={`h-8 rounded-md px-3 text-xs font-semibold ${filter === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        {category !== "all" && catItems.length > 0 && (
          <button onClick={() => (catAllOn ? askOff(catItems.map((i) => i.id), category) : turnOn(catItems.map((i) => i.id)))} className={btn.ghost}>
            Turn whole category {catAllOn ? "off" : "on"}
          </button>
        )}
        <button onClick={load} className={`${btn.ghost} ml-auto`} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button onClick={() => navigate(`${BASE}/inventory/item/new`)} className={btn.primary}>
          <Plus className="h-4 w-4" /> Add dish
        </button>
      </div>

      <Card bodyClass="p-0 overflow-hidden">
        {list.length === 0 ? (
          <Empty title="No dishes found" hint="Add your first dish to start receiving orders." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-5 font-semibold">Dish</th>
                <th className="py-3 font-semibold">Category</th>
                <th className="py-3 font-semibold">Price</th>
                <th className="py-3 font-semibold">Approval</th>
                <th className="py-3 text-center font-semibold">In stock</th>
                <th className="py-3 pr-5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="py-3 pl-5">
                    <div className="flex items-center gap-3">
                      <Thumb src={i.image} />
                      <div>
                        <p className="font-semibold text-slate-900">{i.name}</p>
                        {i.foodType && (
                          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className={`h-2 w-2 rounded-sm ${i.foodType === "Veg" ? "bg-green-600" : "bg-red-600"}`} />{i.foodType}
                          </p>
                        )}
                        {!i.available && i.rule && <p className="text-[11px] font-medium text-amber-600">{ruleLabel(i.rule)}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-slate-600">{i.category}</td>
                  <td className="py-3 font-semibold tabular-nums">{inr(i.price)}</td>
                  <td className="py-3"><Badge status={i.approvalStatus} /></td>
                  <td className="py-3 text-center"><Switch checked={i.available} onChange={() => toggleItem(i)} disabled={saving[i.id]} label={`Toggle ${i.name}`} /></td>
                  <td className="py-3 pr-5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => toggleRecommended(i)} className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100 ${i.recommended ? "text-amber-500" : "text-slate-400"}`} aria-label="Recommended" title={i.recommended ? "Remove from recommended" : "Mark as recommended"}><Star className={`h-4 w-4 ${i.recommended ? "fill-amber-400" : ""}`} /></button>
                      <button onClick={() => navigate(`${BASE}/inventory/item/${i.id}`)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#B80B3D]" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setToDelete(i)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={!!offTarget}
        onClose={() => setOffTarget(null)}
        title="Mark out of stock"
        subtitle={offTarget && (offTarget.ids.length > 1 ? `All ${offTarget.ids.length} dishes in ${offTarget.label}` : offTarget.label)}
        width="max-w-md"
        footer={
          <>
            <button onClick={() => setOffTarget(null)} className={btn.ghost}>Cancel</button>
            <button onClick={confirmOff} className={btn.primary}>Confirm</button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">When should it come back in stock?</p>
        <div className="space-y-2">
          {[
            ["specific-time", "For a few hours"],
            ["next-business-day", "Until next business day"],
            ["custom-date-time", "Until a date & time I choose"],
            ["manual", "I will turn it on manually"],
          ].map(([v, l]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${option === v ? "border-[#B80B3D] bg-[#B80B3D]/5" : "border-slate-200 hover:bg-slate-50"}`}>
              <input type="radio" name="stock-option" checked={option === v} onChange={() => setOption(v)} className="accent-[#B80B3D]" />
              <span className="flex-1 font-medium text-slate-800">{l}</span>
              {v === "specific-time" && option === v && (
                <span className="flex items-center gap-1.5">
                  <input type="number" min="1" max="72" value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 w-16 rounded-md border border-slate-200 px-2 text-center text-sm outline-none" />
                  <span className="text-xs text-slate-500">hours</span>
                </span>
              )}
            </label>
          ))}
        </div>
        {option === "custom-date-time" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <input type="date" value={customDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustomDate(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#B80B3D]" />
            <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#B80B3D]" />
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!toDelete} title="Delete dish" message={`Delete "${toDelete?.name}"? This cannot be undone.`} confirmLabel="Delete" busy={deleting} onClose={() => setToDelete(null)} onConfirm={remove} />
    </>
  )
}

/* ------------------------------ Add-ons ------------------------------ */
function Addons() {
  const [addons, setAddons] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", price: "" })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await restaurantAPI.getAddons()
      const data = res?.data?.data?.addons || res?.data?.addons || []
      const ms = (a) => [a.requestedAt, a.createdAt, a.updatedAt].map((v) => new Date(v).getTime()).find((n) => Number.isFinite(n) && n > 0) || 0
      setAddons([...data].sort((a, b) => ms(b) - ms(a)))
    } catch {
      toast.error("Failed to load add-ons")
      setAddons([])
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    const price = parseFloat(form.price)
    if (!form.name.trim()) return toast.error("Please enter add-on name")
    if (Number.isNaN(price) || price < 0) return toast.error("Please enter a valid price")
    setBusy(true)
    try {
      let image = ""
      if (file) image = uploadedUrl(await uploadAPI.uploadMedia(file, { folder: "helloparth/restaurant/addons" }))
      await restaurantAPI.addAddon({ name: form.name.trim(), description: form.description.trim(), price, image, images: image ? [image] : [] })
      toast.success("Add-on submitted to admin for approval")
      setOpen(false)
      setForm({ name: "", description: "", price: "" })
      setFile(null)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to save add-on")
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (a) => {
    const next = !(a.isAvailable !== false)
    setAddons((arr) => arr.map((x) => (x.id === a.id ? { ...x, isAvailable: next } : x)))
    try {
      await restaurantAPI.updateAddon(a.id, { isAvailable: next })
      toast.success(`Add-on ${next ? "enabled" : "disabled"}`)
    } catch {
      setAddons((arr) => arr.map((x) => (x.id === a.id ? { ...x, isAvailable: !next } : x)))
      toast.error("Failed to update add-on")
    }
  }

  const remove = async (a) => {
    try {
      await restaurantAPI.deleteAddon(a.id)
      setAddons((arr) => arr.filter((x) => x.id !== a.id))
      toast.success("Add-on deleted")
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to delete add-on")
    }
  }

  if (!addons) return <Spinner label="Loading add-ons…" />
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className={btn.primary}><Plus className="h-4 w-4" /> Add add-on</button>
      </div>
      <Card bodyClass="p-0 overflow-hidden">
        {addons.length === 0 ? (
          <Empty title="No add-ons yet" hint="Add-ons are extras like cheese or dips that customers can add to a dish." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-5 font-semibold">Add-on</th>
                <th className="py-3 font-semibold">Price</th>
                <th className="py-3 font-semibold">Approval</th>
                <th className="py-3 text-center font-semibold">Available</th>
                <th className="py-3 pr-5 text-right font-semibold">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {addons.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="py-3 pl-5">
                    <div className="flex items-center gap-3">
                      <Thumb src={a.image || a.images?.[0]} />
                      <div>
                        <p className="font-semibold text-slate-900">{a.name}</p>
                        {a.description && <p className="max-w-xs truncate text-xs text-slate-500">{a.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 font-semibold tabular-nums">{inr(a.price)}</td>
                  <td className="py-3"><Badge status={String(a.approvalStatus || "approved").toLowerCase()} /></td>
                  <td className="py-3 text-center"><Switch checked={a.isAvailable !== false} onChange={() => toggle(a)} label={`Toggle ${a.name}`} /></td>
                  <td className="py-3 pr-5 text-right">
                    <button onClick={() => remove(a)} className="inline-grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="New add-on"
        subtitle="Sent to admin for approval before customers can see it"
        footer={
          <>
            <button onClick={() => setOpen(false)} disabled={busy} className={btn.ghost}>Cancel</button>
            <button onClick={save} disabled={busy} className={btn.primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit</button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Extra cheese" />
          <TextInput label="Price (₹)" required type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <TextArea label="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 hover:bg-slate-50">
            <ImagePlus className="h-5 w-5 text-slate-400" />
            <span className="text-sm text-slate-600">{file ? file.name : "Upload image (optional)"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>
      </Modal>
    </>
  )
}

/* ------------------------------ Categories ------------------------------ */
const emptyCat = { name: "", type: "", image: "", isActive: true, sortOrder: 0, foodTypeScope: "Veg" }

function Categories() {
  const [cats, setCats] = useState(null)
  const [pureVeg, setPureVeg] = useState(false)
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyCat)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await restaurantAPI.getAllCategories()
      const list = res?.data?.data?.categories || []
      setCats(Array.isArray(list) ? list : [])
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to load categories")
      setCats([])
    }
  }, [])
  useEffect(() => {
    load()
    restaurantAPI.getCurrentRestaurant().then((r) => setPureVeg(pickRestaurant(r)?.pureVegRestaurant === true)).catch(() => {})
  }, [load])

  const startNew = () => {
    setEditing(null)
    setForm({ ...emptyCat, foodTypeScope: pureVeg ? "Veg" : "Veg" })
    setFile(null)
    setOpen(true)
  }
  const startEdit = (c) => {
    if (c.canEdit === false) return toast.error("Admin controls this category now")
    setEditing(c)
    setForm({ name: c.name || "", type: c.type || "", image: c.image || "", isActive: c.isActive !== false, sortOrder: c.sortOrder || 0, foodTypeScope: c.foodTypeScope || "Veg" })
    setFile(null)
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error("Category name is required")
    setBusy(true)
    try {
      let image = form.image
      if (file) image = uploadedUrl(await uploadAPI.uploadMedia(file, { folder: "food/categories" })) || image
      const payload = {
        name: form.name.trim(),
        type: String(form.type || "").trim(),
        image,
        isActive: form.isActive !== false,
        sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
        foodTypeScope: pureVeg ? "Veg" : form.foodTypeScope,
      }
      if (editing) await restaurantAPI.updateCategory(editing._id || editing.id, payload)
      else await restaurantAPI.createCategory(payload)
      toast.success(editing ? "Category updated" : "Category created")
      setOpen(false)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to save category")
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (c) => {
    if (c.canEdit === false) return toast.error("Admin controls this category now")
    try {
      await restaurantAPI.updateCategory(c._id || c.id, { isActive: !(c.isActive !== false) })
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to update category")
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await restaurantAPI.deleteCategory(toDelete._id || toDelete.id)
      toast.success("Category deleted")
      setToDelete(null)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to delete category")
    } finally {
      setBusy(false)
    }
  }

  if (!cats) return <Spinner label="Loading categories…" />
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={startNew} className={btn.primary}><Plus className="h-4 w-4" /> Add category</button>
      </div>
      <Card bodyClass="p-0 overflow-hidden">
        {cats.length === 0 ? (
          <Empty title="No categories yet" hint="Create a category, then add dishes into it." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-5 font-semibold">Category</th>
                <th className="py-3 font-semibold">Food type</th>
                <th className="py-3 font-semibold">Approval</th>
                <th className="py-3 text-center font-semibold">Active</th>
                <th className="py-3 pr-5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cats.map((c) => (
                <tr key={c._id || c.id} className="hover:bg-slate-50">
                  <td className="py-3 pl-5">
                    <div className="flex items-center gap-3">
                      <Thumb src={c.image} />
                      <div>
                        <p className="font-semibold text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.ownedByRestaurant ? "Created by you" : "Platform category"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-slate-600">{c.foodTypeScope || "Both"}</td>
                  <td className="py-3"><Badge status={String(c.approvalStatus || "approved").toLowerCase()} /></td>
                  <td className="py-3 text-center"><Switch checked={c.isActive !== false} onChange={() => toggleActive(c)} disabled={c.canEdit === false} label={`Toggle ${c.name}`} /></td>
                  <td className="py-3 pr-5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => startEdit(c)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#B80B3D]" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                      <button
                        onClick={() => (c.canDelete ? setToDelete(c) : toast.error(c.canEdit ? "Remove foods from this category before deleting it" : "Admin controls this category now"))}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"
                      ><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={editing ? "Edit category" : "New category"}
        footer={
          <>
            <button onClick={() => setOpen(false)} disabled={busy} className={btn.ghost}>Cancel</button>
            <button onClick={save} disabled={busy} className={btn.primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <SelectInput
              label="Food type"
              value={pureVeg ? "Veg" : form.foodTypeScope}
              disabled={pureVeg}
              onChange={(e) => setForm({ ...form, foodTypeScope: e.target.value })}
              options={[{ value: "Veg", label: "Veg" }, { value: "Non-Veg", label: "Non-Veg" }, { value: "Both", label: "Both" }]}
            />
            <TextInput label="Sort order" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 hover:bg-slate-50">
            {file || form.image ? <img src={file ? URL.createObjectURL(file) : form.image} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <ImagePlus className="h-5 w-5 text-slate-400" />}
            <span className="text-sm text-slate-600">{file ? file.name : "Upload category image (optional)"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-700">Active</span>
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" />
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} title="Delete category" message={`Delete "${toDelete?.name}"?`} confirmLabel="Delete" busy={busy} onClose={() => setToDelete(null)} onConfirm={remove} />
    </>
  )
}

export default function DesktopInventory() {
  const [params, setParams] = useSearchParams()
  const tab = ["addons", "categories"].includes(params.get("tab")) ? params.get("tab") : "dishes"
  const setTab = (t) => setParams(t === "dishes" ? {} : { tab: t }, { replace: true })
  return (
    <>
      <PageHeader title="Inventory" subtitle="Manage your dishes, add-ons and categories" />
      <div className="mb-5 flex w-fit rounded-lg bg-slate-100 p-0.5">
        {[["dishes", "Dishes"], ["addons", "Add-ons"], ["categories", "Categories"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`h-9 rounded-md px-5 text-[13px] font-semibold ${tab === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>
      {tab === "dishes" ? <Dishes /> : tab === "addons" ? <Addons /> : <Categories />}
    </>
  )
}
