import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI, uploadAPI } from "@food/api"
import { BASE, ConfirmDialog, Field, SelectInput, Switch, SubPageHeader, TextArea, TextInput, pickRestaurant } from "./kit"
import { Card, Spinner, btn } from "./ui"

const RECOMMENDED_KEY = "restaurant_inventory_recommended_map"

const findItem = (menuRes, id) => {
  const sections = menuRes?.data?.data?.menu?.sections || []
  const want = String(id)
  for (const s of sections) {
    const pools = [s.items || [], ...(s.subsections || []).map((x) => x.items || [])]
    for (const pool of pools) {
      const hit = pool.find((i) => String(i.id || i._id) === want)
      if (hit) return { ...hit, __categoryId: s.categoryId || s.id, __categoryName: s.name }
    }
  }
  return null
}

const newVariant = (v = {}) => ({
  key: String(v.id || v._id || Math.random()),
  persistedId: String(v.id || v._id || ""),
  name: String(v.name || ""),
  price: String(v.basePrice ?? v.price ?? ""),
})

export default function DesktopItemEditor() {
  const { id } = useParams()
  const isNew = id === "new"
  const navigate = useNavigate()
  const back = `${BASE}/inventory`
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pureVeg, setPureVeg] = useState(false)
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({ name: "", description: "", categoryId: "", foodType: "Veg", basePrice: "", preparationTime: "", isAvailable: true, isRecommended: false, image: "" })
  const [variants, setVariants] = useState([])
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cat, prof] = await Promise.allSettled([restaurantAPI.getCategories(), restaurantAPI.getCurrentRestaurant()])
        const list = cat.status === "fulfilled" ? cat.value?.data?.data?.categories || [] : []
        const pv = prof.status === "fulfilled" && pickRestaurant(prof.value)?.pureVegRestaurant === true
        if (!alive) return
        setCategories(list.map((c) => ({ id: c._id || c.id, name: c.name, scope: c.foodTypeScope || "Both" })))
        setPureVeg(pv)
        if (!isNew) {
          const item = findItem(await restaurantAPI.getMenu(), id)
          if (!item) {
            toast.error("Item not found")
            return navigate(back, { replace: true })
          }
          const vs = Array.isArray(item.variants) ? item.variants : Array.isArray(item.variations) ? item.variations : []
          setVariants(vs.map(newVariant).filter((v) => v.name))
          const base = item.basePrice != null && Number.isFinite(Number(item.basePrice)) ? item.basePrice : item.price
          setForm({
            name: item.name || "",
            description: item.description || "",
            categoryId: String(item.categoryId || item.__categoryId || ""),
            foodType: pv ? "Veg" : item.foodType === "Veg" ? "Veg" : "Non-Veg",
            basePrice: vs.length ? "" : base != null ? String(base) : "",
            preparationTime: item.preparationTime || "",
            isAvailable: item.isAvailable !== false,
            isRecommended: item.isRecommended === true,
            image: item.image || item.images?.[0] || "",
          })
        } else if (pv) {
          setForm((f) => ({ ...f, foodType: "Veg" }))
        }
      } catch {
        toast.error("Failed to load item")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const save = async () => {
    const err = {}
    if (!form.name.trim()) err.name = "Dish name is required"
    const cat = categories.find((c) => String(c.id) === String(form.categoryId))
    if (!cat) err.categoryId = "Select an approved category"
    else if (cat.scope !== "Both" && cat.scope !== form.foodType) err.categoryId = `This ${cat.scope} category cannot accept ${form.foodType} food`
    const vs = variants.filter((v) => v.name.trim() || v.price)
    if (vs.some((v) => !v.name.trim())) err.variants = "Each variant needs a name"
    else if (vs.some((v) => !(Number(v.price) > 0))) err.variants = "Each variant price must be greater than 0"
    if (!vs.length && !(Number(form.basePrice) >= 0 && form.basePrice !== "")) err.basePrice = "Enter a valid price"
    setErrors(err)
    if (Object.keys(err).length) return

    setSaving(true)
    try {
      let image = form.image
      if (file) {
        let res
        try {
          res = await uploadAPI.uploadMedia(file, { folder: "helloparth/restaurant/menu-items" })
        } catch {
          res = await uploadAPI.uploadMedia(file)
        }
        image = res?.data?.data?.url || res?.data?.url
        if (!image) throw new Error("Image upload failed")
      }
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: vs.length ? undefined : Number(form.basePrice),
        variants: vs.map((v) => ({ ...(v.persistedId ? { _id: v.persistedId } : {}), name: v.name.trim(), price: Number(v.price) })),
        image: image || "",
        foodType: pureVeg ? "Veg" : form.foodType,
        isAvailable: form.isAvailable,
        isRecommended: form.isRecommended === true,
        preparationTime: form.preparationTime || "",
        categoryId: cat.id,
        categoryName: cat.name,
      }
      let itemId = id
      if (isNew) {
        const r = await restaurantAPI.createFood(payload)
        const created = r?.data?.data?.food || r?.data?.food
        itemId = String(created?._id || created?.id || "")
        if (!itemId) throw new Error("Failed to create item")
      } else {
        await restaurantAPI.updateFood(id, payload)
      }
      try {
        const map = JSON.parse(localStorage.getItem(RECOMMENDED_KEY) || "{}")
        localStorage.setItem(RECOMMENDED_KEY, JSON.stringify({ ...map, [itemId]: form.isRecommended === true }))
      } catch {
        /* ignore */
      }
      toast.success(isNew ? "Item created successfully" : "Item updated and sent for approval again")
      navigate(back)
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to save item")
    } finally {
      setSaving(false)
    }
  }

  const del = async () => {
    setSaving(true)
    try {
      await restaurantAPI.deleteFood(id)
      toast.success("Item deleted")
      navigate(back)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not delete item")
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading item…" />
  const preview = file ? URL.createObjectURL(file) : form.image

  return (
    <>
      <SubPageHeader
        title={isNew ? "Add dish" : "Edit dish"}
        subtitle={isNew ? "New dishes are sent to admin for approval" : "Changes are sent for approval again"}
        back={back}
        backLabel="Inventory"
        actions={
          <>
            {!isNew && <button onClick={() => setConfirmDel(true)} className={btn.danger}><Trash2 className="h-4 w-4" /> Delete</button>}
            <button onClick={() => navigate(back)} className={btn.ghost}>Cancel</button>
            <button onClick={save} disabled={saving} className={btn.primary}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save dish</button>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Basic details">
            <div className="mt-4 grid grid-cols-2 gap-4">
              <TextInput label="Dish name" required value={form.name} onChange={set("name")} error={errors.name} className="col-span-2" />
              <TextArea label="Description" rows={3} value={form.description} onChange={set("description")} className="col-span-2" />
              <SelectInput
                label="Category"
                required
                value={form.categoryId}
                onChange={set("categoryId")}
                error={errors.categoryId}
                options={[{ value: "", label: "Select category" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
              />
              <Field label="Food type" required>
                <div className="flex gap-2">
                  {["Veg", "Non-Veg"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={pureVeg && t !== "Veg"}
                      onClick={() => setForm((f) => ({ ...f, foodType: t }))}
                      className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-40 ${form.foodType === t ? "border-[#B80B3D] bg-[#B80B3D]/10 text-[#B80B3D]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-sm ${t === "Veg" ? "bg-green-600" : "bg-red-600"}`} /> {t}
                    </button>
                  ))}
                </div>
              </Field>
              <TextInput label="Preparation time" placeholder="e.g. 15 mins" value={form.preparationTime} onChange={set("preparationTime")} />
            </div>
          </Card>

          <Card
            title="Pricing"
            subtitle="Use a single price, or add variants like Half / Full"
            action={<button onClick={() => setVariants((v) => [...v, newVariant()])} className={btn.ghost}><Plus className="h-4 w-4" /> Add variant</button>}
          >
            <div className="mt-4 space-y-3">
              {variants.length === 0 ? (
                <TextInput label="Price (₹)" required type="number" min="0" value={form.basePrice} onChange={set("basePrice")} error={errors.basePrice} className="max-w-xs" />
              ) : (
                variants.map((v, i) => (
                  <div key={v.key} className="flex items-end gap-3">
                    <TextInput label={i === 0 ? "Variant name" : undefined} placeholder="e.g. Half" value={v.name} onChange={(e) => setVariants((arr) => arr.map((x) => (x.key === v.key ? { ...x, name: e.target.value } : x)))} className="flex-1" />
                    <TextInput label={i === 0 ? "Price (₹)" : undefined} type="number" min="0" value={v.price} onChange={(e) => setVariants((arr) => arr.map((x) => (x.key === v.key ? { ...x, price: e.target.value } : x)))} className="w-40" />
                    <button onClick={() => setVariants((arr) => arr.filter((x) => x.key !== v.key))} className="mb-0.5 grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove variant"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))
              )}
              {errors.variants && <p className="text-xs text-rose-600">{errors.variants}</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Photo">
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:bg-slate-100">
              {preview ? <img src={preview} alt="" className="h-48 w-full rounded-lg object-cover" /> : <ImagePlus className="h-8 w-8 text-slate-400" />}
              <span className="text-sm text-slate-600">{preview ? "Click to change photo" : "Upload dish photo"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </Card>
          <Card title="Visibility">
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">In stock</p>
                  <p className="text-xs text-slate-500">Customers can order this dish</p>
                </div>
                <Switch checked={form.isAvailable} onChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))} label="In stock" />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Recommended</p>
                  <p className="text-xs text-slate-500">Highlight as a bestseller</p>
                </div>
                <Switch checked={form.isRecommended} onChange={(v) => setForm((f) => ({ ...f, isRecommended: v }))} label="Recommended" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={confirmDel} title="Delete dish" message="This dish will be removed permanently." confirmLabel="Delete" busy={saving} onClose={() => setConfirmDel(false)} onConfirm={del} />
    </>
  )
}
