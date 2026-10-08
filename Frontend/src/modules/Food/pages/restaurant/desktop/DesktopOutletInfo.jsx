import { panelWords as sw } from "@food/utils/adminPartnerLabels"
import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Camera, ImagePlus, Loader2, MapPin, Pencil, Star, Trash2, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { formatRestaurantDisplayAddress } from "@food/utils/restaurantLocation"
import { BASE, ConfirmDialog, SubPageHeader, imgUrl, useRestaurantProfile } from "./kit"
import { Card, Spinner, btn } from "./ui"

export default function DesktopOutletInfo() {
  const navigate = useNavigate()
  const { profile, loading, reload } = useRestaurantProfile({ fresh: true })
  const [busy, setBusy] = useState("")
  const [delIndex, setDelIndex] = useState(-1)
  const profileInput = useRef(null)
  const bannerInput = useRef(null)

  if (loading) return <Spinner label="Loading outlet info…" />
  if (!profile) return <Card><p className="py-10 text-center text-sm text-slate-500">Could not load your restaurant.</p></Card>

  const banners = (Array.isArray(profile.coverImages) && profile.coverImages.length ? profile.coverImages : profile.menuImages || [])
    .map((i) => ({ url: imgUrl(i), publicId: i?.publicId || null }))
    .filter((i) => i.url)
  const bannersKey = Array.isArray(profile.coverImages) && profile.coverImages.length ? "coverImages" : "menuImages"
  const logo = imgUrl(profile.profileImage)
  const address = formatRestaurantDisplayAddress(profile.location, profile)
  const rating = Number(profile.rating ?? profile.averageRating ?? 0)
  const cuisines = Array.isArray(profile.cuisines) ? profile.cuisines : []

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy("logo")
    try {
      await restaurantAPI.uploadProfileImage(file)
      await reload()
      window.dispatchEvent(new Event("restaurantProfileUpdated"))
      toast.success("Profile photo updated")
    } catch {
      toast.error("Failed to upload image. Please try again.")
    } finally {
      setBusy("")
    }
  }

  const addBanners = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ""
    if (!files.length) return
    setBusy("banner")
    try {
      const next = banners.map((b) => ({ url: b.url, publicId: b.publicId }))
      for (const file of files) {
        try {
          const res = await restaurantAPI.uploadMenuImage(file)
          const img = res?.data?.data?.menuImage
          if (img?.url && !next.find((b) => b.url === img.url)) next.push({ url: img.url, publicId: img.publicId || null })
        } catch {
          toast.error(`Could not upload ${file.name}`)
        }
      }
      await restaurantAPI.updateProfile({ [bannersKey]: next })
      await reload()
      toast.success("Images uploaded")
    } catch {
      toast.error("Images uploaded but failed to save")
    } finally {
      setBusy("")
    }
  }

  const delBanner = async () => {
    setBusy("banner")
    try {
      const next = banners.filter((_, i) => i !== delIndex).map((b) => ({ url: b.url, publicId: b.publicId }))
      await restaurantAPI.updateProfile({ [bannersKey]: next })
      await reload()
      toast.success("Image deleted")
      setDelIndex(-1)
    } catch {
      toast.error("Failed to delete image")
    } finally {
      setBusy("")
    }
  }

  return (
    <>
      <SubPageHeader title="Outlet information" subtitle="Your photos, name and listing details" />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card bodyClass="p-0 overflow-hidden">
            <div className="relative h-56 bg-gradient-to-br from-slate-200 to-slate-100">
              {banners[0] && <img src={banners[0].url} alt="" className="h-full w-full object-cover" />}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
            <div className="relative px-6 pb-6">
              <div className="flex items-start gap-4">
                <div className="relative -mt-12 shrink-0">
                  {logo ? (
                    <img src={logo} alt="" className="h-24 w-24 rounded-2xl border-4 border-white bg-white object-cover shadow-md" />
                  ) : (
                    <div className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-white bg-gradient-to-br from-[#B80B3D] to-[#7d0728] text-white shadow-md"><UtensilsCrossed className="h-8 w-8" /></div>
                  )}
                  <button onClick={() => profileInput.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow hover:text-[#B80B3D]" aria-label="Change photo">
                    {busy === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </button>
                  <input ref={profileInput} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                </div>
                <div className="min-w-0 flex-1 pt-3">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-2xl font-bold text-slate-900" title={profile.name || profile.restaurantName}>{profile.name || profile.restaurantName}</h2>
                    <button onClick={() => navigate(`${BASE}/edit-owner`)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#B80B3D]" aria-label="Edit profile" title="Edit profile"><Pencil className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">{rating ? rating.toFixed(1) : "0.0"} <Star className="h-3 w-3 fill-white" /></span>
                    <span>ID: {profile.restaurantId || "N/A"}</span>
                  </div>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><MapPin className="h-3.5 w-3.5" /> Address</dt>
                  <dd className="mt-1.5 text-sm font-medium text-slate-800">{address || "No address found"}</dd>
                  <button onClick={() => navigate(`${BASE}/edit-address`)} className="mt-2 text-xs font-semibold text-[#B80B3D] hover:underline">Edit address</button>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cuisines</dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {cuisines.length ? cuisines.map((c) => <span key={c} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{c}</span>) : <span className="text-sm text-slate-500">Not set</span>}
                  </dd>
                  <button onClick={() => navigate(`${BASE}/edit-cuisines`)} className="mt-2 text-xs font-semibold text-[#B80B3D] hover:underline">Edit cuisines</button>
                </div>
              </dl>
            </div>
          </Card>
        </div>

        <Card
          title={sw("Restaurant images")}
          subtitle="The first image is your cover"
          action={
            <button onClick={() => bannerInput.current?.click()} disabled={busy === "banner"} className={btn.ghost}>
              {busy === "banner" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Add
            </button>
          }
        >
          <input ref={bannerInput} type="file" accept="image/*" multiple className="hidden" onChange={addBanners} />
          {banners.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No images yet</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {banners.map((b, i) => (
                <div key={b.url} className="group relative aspect-video overflow-hidden rounded-xl border border-slate-200">
                  <img src={b.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
                  <button onClick={() => setDelIndex(i)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-rose-600 opacity-0 shadow hover:bg-white group-hover:opacity-100" aria-label="Delete image"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog open={delIndex >= 0} title="Delete image" message="Are you sure you want to delete this image?" confirmLabel="Delete" busy={busy === "banner"} onClose={() => setDelIndex(-1)} onConfirm={delBanner} />
    </>
  )
}
