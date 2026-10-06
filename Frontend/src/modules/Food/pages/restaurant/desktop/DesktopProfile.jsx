import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { FileUp, Loader2, MapPinned, Search, X } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI, uploadAPI } from "@food/api"
import { buildRestaurantLocationUpdatePayload } from "@food/utils/restaurantLocation"
import { Chip, Field, SubPageHeader, Switch, TextInput, SelectInput, TextArea, imgUrl, useRestaurantProfile } from "./kit"
import { Card, Spinner, btn } from "./ui"

const CUISINES = [
  "Burger", "Chinese", "Momos", "North Indian", "Pizza", "Rolls", "Sandwich", "Shawarma", "South Indian", "Biryani", "Desserts",
  "Ice Cream", "Fast Food", "Cafe", "Italian", "Mexican", "Thai", "Seafood", "Salad", "Healthy Food", "Juices", "Beverages",
  "Punjabi", "Gujarati", "Rajasthani", "Mughlai", "Street Food", "Bakery",
]

const TABS = [
  ["owner", "Owner & contact"],
  ["address", "Address"],
  ["cuisines", "Cuisines"],
  ["business", "Business & FSSAI"],
  ["bank", "Bank & UPI"],
]

const digits = (v, n = 10) => String(v || "").replace(/\D/g, "").slice(-n)
const uploaded = (res) => res?.data?.data?.url || res?.data?.url || ""

function DocUpload({ label, value, onChange, folder }) {
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error("File is larger than 5MB")
    setBusy(true)
    try {
      const url = uploaded(await uploadAPI.uploadMedia(file, { folder }))
      if (!url) throw new Error("Upload failed")
      onChange(url)
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Upload failed")
    } finally {
      setBusy(false)
    }
  }
  const isPdf = /\.pdf($|\?)/i.test(value || "")
  return (
    <Field label={label}>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        {value && !isPdf ? <img src={value} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <FileUp className="h-6 w-6 text-slate-400" />}
        <div className="min-w-0 flex-1 text-sm text-slate-600">
          {value ? <a href={value} target="_blank" rel="noreferrer" className="font-medium text-[#B80B3D] hover:underline">View uploaded file</a> : "No file uploaded"}
        </div>
        <label className={`${btn.ghost} cursor-pointer`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {value ? "Replace" : "Upload"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={pick} />
        </label>
        {value && <button type="button" onClick={() => onChange("")} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove"><X className="h-4 w-4" /></button>}
      </div>
    </Field>
  )
}

export default function DesktopProfile({ defaultTab = "owner" }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : defaultTab
  const { profile, loading, reload } = useRestaurantProfile({ fresh: true })
  const [f, setF] = useState(null)
  const [initial, setInitial] = useState("")
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [cuisineQuery, setCuisineQuery] = useState("")
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const setLoc = (k) => (e) => setF((x) => ({ ...x, loc: { ...x.loc, [k]: e.target.value } }))

  useEffect(() => {
    if (!profile) return
    const l = profile.location || {}
    const next = {
      ownerName: profile.ownerName || "",
      ownerEmail: profile.ownerEmail || "",
      ownerPhone: digits(profile.ownerPhone),
      primaryContactNumber: digits(profile.primaryContactNumber),
      restaurantName: profile.restaurantName || profile.name || "",
      pureVegRestaurant: Boolean(profile.pureVegRestaurant),
      estimatedDeliveryTime: profile.estimatedDeliveryTime || "",
      loc: {
        formattedAddress: l.formattedAddress || l.address || "",
        addressLine1: l.addressLine1 || "",
        addressLine2: l.addressLine2 || "",
        area: l.area || "",
        city: l.city || "",
        state: l.state || "",
        pincode: l.pincode || "",
        landmark: l.landmark || "",
        latitude: l.latitude != null ? String(l.latitude) : Array.isArray(l.coordinates) ? String(l.coordinates[1] ?? "") : "",
        longitude: l.longitude != null ? String(l.longitude) : Array.isArray(l.coordinates) ? String(l.coordinates[0] ?? "") : "",
      },
      cuisines: Array.isArray(profile.cuisines)
        ? profile.cuisines.flatMap((c) => (typeof c === "string" ? c.split(",").map((s) => s.trim()) : c)).filter(Boolean)
        : [],
      panNumber: profile.panNumber || "",
      nameOnPan: profile.nameOnPan || "",
      panImage: imgUrl(profile.panImage),
      gstRegistered: Boolean(profile.gstRegistered),
      gstNumber: profile.gstNumber || "",
      gstLegalName: profile.gstLegalName || "",
      gstAddress: profile.gstAddress || "",
      gstImage: imgUrl(profile.gstImage),
      fssaiNumber: profile.fssaiNumber || "",
      fssaiExpiry: profile.fssaiExpiry ? String(profile.fssaiExpiry).split("T")[0] : "",
      fssaiImage: imgUrl(profile.fssaiImage),
      accountHolderName: profile.accountHolderName || "",
      accountNumber: profile.accountNumber || "",
      confirmAccountNumber: profile.accountNumber || "",
      ifscCode: profile.ifscCode || "",
      accountType: profile.accountType || "Saving",
      upiId: profile.upiId || "",
      upiQrImage: imgUrl(profile.upiQrImage),
    }
    setF(next)
    setInitial(JSON.stringify(next))
  }, [profile])

  const dirty = useMemo(() => (f ? JSON.stringify(f) !== initial : false), [f, initial])

  const validate = () => {
    const e = {}
    if (tab === "owner") {
      if (!f.ownerName.trim()) e.ownerName = "Owner name is required"
      if (!/^\S+@\S+\.\S+$/.test(f.ownerEmail.trim())) e.ownerEmail = "Enter a valid email"
      if (f.ownerPhone && f.ownerPhone.length !== 10) e.ownerPhone = "Phone must be 10 digits"
      if (f.primaryContactNumber && f.primaryContactNumber.length !== 10) e.primaryContactNumber = "Phone must be 10 digits"
      if (!f.restaurantName.trim()) e.restaurantName = "Restaurant name is required"
      else if (/[/-]/.test(f.restaurantName)) e.restaurantName = "Name cannot contain slashes (/) or hyphens (-)"
    }
    if (tab === "address") {
      if (!f.loc.addressLine1.trim() && !f.loc.formattedAddress.trim()) e.addressLine1 = "Address is required"
      if (!f.loc.city.trim()) e.city = "City is required"
      if (f.loc.pincode && !/^\d{6}$/.test(f.loc.pincode)) e.pincode = "Pincode must be 6 digits"
    }
    if (tab === "cuisines" && f.cuisines.length === 0) e.cuisines = "Select at least one cuisine"
    if (tab === "business") {
      if (f.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(f.panNumber.trim())) e.panNumber = "Invalid PAN (e.g. ABCDE1234F)"
      if (f.gstRegistered && f.gstNumber && !/^[0-9A-Z]{15}$/i.test(f.gstNumber.trim())) e.gstNumber = "GST number must be 15 characters"
      if (f.fssaiNumber && !/^\d{14}$/.test(f.fssaiNumber.trim())) e.fssaiNumber = "FSSAI number must be 14 digits"
    }
    if (tab === "bank") {
      if (f.accountNumber && !/^\d{6,18}$/.test(f.accountNumber.replace(/\s|-/g, ""))) e.accountNumber = "Enter a valid account number"
      if (f.accountNumber && f.accountNumber !== f.confirmAccountNumber) e.confirmAccountNumber = "Account numbers do not match"
      if (f.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(f.ifscCode.trim())) e.ifscCode = "Invalid IFSC code"
      if (f.upiId && !/^[\w.-]{2,}@[A-Za-z]{2,}$/.test(f.upiId.trim())) e.upiId = "Invalid UPI ID (e.g. name@bank)"
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const payloadFor = () => {
    if (tab === "owner")
      return {
        ownerName: f.ownerName.trim(),
        ownerEmail: f.ownerEmail.trim(),
        ownerPhone: f.ownerPhone.trim(),
        primaryContactNumber: f.primaryContactNumber.trim(),
        restaurantName: f.restaurantName.trim(),
        pureVegRestaurant: f.pureVegRestaurant,
        estimatedDeliveryTime: String(f.estimatedDeliveryTime || "").trim(),
      }
    if (tab === "address") return { location: buildRestaurantLocationUpdatePayload(f.loc) }
    if (tab === "cuisines") return { cuisines: f.cuisines }
    if (tab === "business")
      return {
        panNumber: f.panNumber.trim().toUpperCase(),
        nameOnPan: f.nameOnPan.trim(),
        panImage: f.panImage,
        gstRegistered: f.gstRegistered,
        gstNumber: f.gstRegistered ? f.gstNumber.trim().toUpperCase() : "",
        gstLegalName: f.gstRegistered ? f.gstLegalName.trim() : "",
        gstAddress: f.gstRegistered ? f.gstAddress.trim() : "",
        gstImage: f.gstRegistered ? f.gstImage : "",
        fssaiNumber: f.fssaiNumber.trim(),
        fssaiExpiry: f.fssaiExpiry,
        fssaiImage: f.fssaiImage,
      }
    return {
      accountHolderName: f.accountHolderName.trim(),
      accountNumber: f.accountNumber.replace(/\s|-/g, ""),
      ifscCode: f.ifscCode.trim().toUpperCase(),
      accountType: f.accountType,
      upiId: f.upiId.trim(),
      upiQrImage: f.upiQrImage,
    }
  }

  const save = async () => {
    if (!validate()) return toast.error("Please fix the highlighted fields")
    setSaving(true)
    try {
      await restaurantAPI.updateProfile(payloadFor())
      toast.success("Details updated successfully")
      window.dispatchEvent(new Event("restaurantProfileUpdated"))
      await reload()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to update details")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !f) return <Spinner label="Loading profile…" />

  const filtered = CUISINES.filter((c) => c.toLowerCase().includes(cuisineQuery.trim().toLowerCase()))
  const extra = f.cuisines.filter((c) => !CUISINES.includes(c))

  return (
    <>
      <SubPageHeader
        title="Profile & Outlet Settings"
        subtitle="Keep your restaurant information up to date"
        back={-1}
        backLabel="Back"
        actions={
          <button onClick={save} disabled={saving || !dirty} className={`${btn.primary} !h-10 px-5`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
          </button>
        }
      />

      <div className="mb-5 flex w-fit rounded-lg bg-slate-100 p-0.5">
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => { setParams({ tab: v }, { replace: true }); setErrors({}) }} className={`h-9 rounded-md px-4 text-[13px] font-semibold ${tab === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "owner" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Owner details" subtitle="Used for all business communication">
            <div className="mt-4 grid grid-cols-2 gap-4">
              <TextInput label="Full name" required value={f.ownerName} onChange={set("ownerName")} error={errors.ownerName} className="col-span-2" />
              <TextInput label="Email address" required type="email" value={f.ownerEmail} onChange={set("ownerEmail")} error={errors.ownerEmail} className="col-span-2" />
              <TextInput label="Phone number" inputMode="numeric" maxLength={10} value={f.ownerPhone} onChange={(e) => setF((x) => ({ ...x, ownerPhone: digits(e.target.value) }))} error={errors.ownerPhone} className="col-span-2" />
            </div>
          </Card>
          <Card title="Restaurant" subtitle="How customers see you">
            <div className="mt-4 grid grid-cols-2 gap-4">
              <TextInput label="Restaurant name" required value={f.restaurantName} onChange={set("restaurantName")} error={errors.restaurantName} className="col-span-2" />
              <TextInput label="Primary contact number" inputMode="numeric" maxLength={10} hint="Customers and delivery partners may call this number for order support" value={f.primaryContactNumber} onChange={(e) => setF((x) => ({ ...x, primaryContactNumber: digits(e.target.value) }))} error={errors.primaryContactNumber} className="col-span-2" />
              <TextInput label="Estimated delivery time" placeholder="e.g. 25-30 mins" value={f.estimatedDeliveryTime} onChange={set("estimatedDeliveryTime")} className="col-span-2" />
              <div className="col-span-2 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Pure veg restaurant</p>
                  <p className="text-xs text-slate-500">Helps users filter restaurants by dietary preference</p>
                </div>
                <Switch checked={f.pureVegRestaurant} onChange={(v) => setF((x) => ({ ...x, pureVegRestaurant: v }))} label="Pure veg" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "address" && (
        <Card
          title="Restaurant address"
          subtitle="Shown to customers and delivery partners"
          action={<button onClick={() => navigate("/food/restaurant/zone-setup")} className={btn.ghost}><MapPinned className="h-4 w-4" /> Pick on map</button>}
        >
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-3">
            <TextInput label="Address line 1" required value={f.loc.addressLine1} onChange={setLoc("addressLine1")} error={errors.addressLine1} className="xl:col-span-2" />
            <TextInput label="Address line 2" value={f.loc.addressLine2} onChange={setLoc("addressLine2")} />
            <TextInput label="Area / locality" value={f.loc.area} onChange={setLoc("area")} />
            <TextInput label="Landmark" value={f.loc.landmark} onChange={setLoc("landmark")} />
            <TextInput label="City" required value={f.loc.city} onChange={setLoc("city")} error={errors.city} />
            <TextInput label="State" value={f.loc.state} onChange={setLoc("state")} />
            <TextInput label="Pincode" inputMode="numeric" maxLength={6} value={f.loc.pincode} onChange={(e) => setF((x) => ({ ...x, loc: { ...x.loc, pincode: digits(e.target.value, 6) } }))} error={errors.pincode} />
            <TextArea label="Full address (as shown to customers)" rows={2} value={f.loc.formattedAddress} onChange={setLoc("formattedAddress")} className="col-span-2 xl:col-span-3" />
            <TextInput label="Latitude" value={f.loc.latitude} onChange={setLoc("latitude")} hint="Map position used for delivery distance" />
            <TextInput label="Longitude" value={f.loc.longitude} onChange={setLoc("longitude")} />
          </div>
        </Card>
      )}

      {tab === "cuisines" && (
        <Card title="Cuisines" subtitle={`${f.cuisines.length} selected`}>
          <div className="relative mt-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={cuisineQuery} onChange={(e) => setCuisineQuery(e.target.value)} placeholder="Search cuisines" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[...extra, ...filtered].map((c) => (
              <Chip key={c} active={f.cuisines.includes(c)} onClick={() => setF((x) => ({ ...x, cuisines: x.cuisines.includes(c) ? x.cuisines.filter((i) => i !== c) : [...x.cuisines, c] }))}>{c}</Chip>
            ))}
          </div>
          {errors.cuisines && <p className="mt-3 text-sm text-rose-600">{errors.cuisines}</p>}
        </Card>
      )}

      {tab === "business" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="PAN" subtitle="Permanent Account Number of the business owner">
            <div className="mt-4 space-y-4">
              <TextInput label="PAN number" placeholder="ABCDE1234F" maxLength={10} value={f.panNumber} onChange={(e) => setF((x) => ({ ...x, panNumber: e.target.value.toUpperCase() }))} error={errors.panNumber} />
              <TextInput label="Name on PAN" value={f.nameOnPan} onChange={set("nameOnPan")} />
              <DocUpload label="PAN card image" value={f.panImage} onChange={(v) => setF((x) => ({ ...x, panImage: v }))} folder="food/restaurants/pan" />
            </div>
          </Card>
          <Card title="FSSAI licence" subtitle="Food safety licence of your restaurant">
            <div className="mt-4 space-y-4">
              <TextInput label="FSSAI registration number" inputMode="numeric" maxLength={14} value={f.fssaiNumber} onChange={(e) => setF((x) => ({ ...x, fssaiNumber: digits(e.target.value, 14) }))} error={errors.fssaiNumber} />
              <TextInput label="Valid up to" type="date" value={f.fssaiExpiry} onChange={set("fssaiExpiry")} />
              <DocUpload label="Licence document" value={f.fssaiImage} onChange={(v) => setF((x) => ({ ...x, fssaiImage: v }))} folder="food/restaurants/fssai" />
            </div>
          </Card>
          <Card className="xl:col-span-2" title="GST" subtitle="Only if your restaurant is GST registered" action={<Switch checked={f.gstRegistered} onChange={(v) => setF((x) => ({ ...x, gstRegistered: v }))} label="GST registered" />}>
            {f.gstRegistered && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <TextInput label="GST number" maxLength={15} value={f.gstNumber} onChange={(e) => setF((x) => ({ ...x, gstNumber: e.target.value.toUpperCase() }))} error={errors.gstNumber} />
                <TextInput label="Legal name" value={f.gstLegalName} onChange={set("gstLegalName")} />
                <TextInput label="Registered address" value={f.gstAddress} onChange={set("gstAddress")} className="col-span-2" />
                <div className="col-span-2"><DocUpload label="GST certificate" value={f.gstImage} onChange={(v) => setF((x) => ({ ...x, gstImage: v }))} folder="food/restaurants/gst" /></div>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "bank" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Bank account" subtitle="Payouts are sent to this account">
            <div className="mt-4 grid grid-cols-2 gap-4">
              <TextInput label="Account holder name" value={f.accountHolderName} onChange={set("accountHolderName")} className="col-span-2" />
              <TextInput label="Account number" inputMode="numeric" value={f.accountNumber} onChange={(e) => setF((x) => ({ ...x, accountNumber: e.target.value.replace(/[^\d]/g, "") }))} error={errors.accountNumber} />
              <TextInput label="Confirm account number" inputMode="numeric" value={f.confirmAccountNumber} onChange={(e) => setF((x) => ({ ...x, confirmAccountNumber: e.target.value.replace(/[^\d]/g, "") }))} error={errors.confirmAccountNumber} />
              <TextInput label="IFSC code" maxLength={11} value={f.ifscCode} onChange={(e) => setF((x) => ({ ...x, ifscCode: e.target.value.toUpperCase() }))} error={errors.ifscCode} />
              <SelectInput label="Account type" value={f.accountType} onChange={set("accountType")} options={[{ value: "Saving", label: "Saving" }, { value: "Current", label: "Current" }]} />
            </div>
          </Card>
          <Card title="UPI" subtitle="Optional - for faster payouts">
            <div className="mt-4 space-y-4">
              <TextInput label="UPI ID" placeholder="name@bank" value={f.upiId} onChange={set("upiId")} error={errors.upiId} />
              <DocUpload label="UPI QR code" value={f.upiQrImage} onChange={(v) => setF((x) => ({ ...x, upiQrImage: v }))} folder="food/restaurants/upi-qr" />
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
