import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { hasGlobalSection, readAdminProfile } from "@/shared/utils/adminAccess.js"
import { prepareUploadFile } from "@/shared/utils/imageCompressor"
import { apiErrorMessage, globalAdminAPI } from "../api/globalAdminAPI"

const TAXI_HEADER_COLOR = "#0B172A"

/** What to tell the admin about the old image file after it was replaced or removed (fileDeleted: true / false / null). */
const reportFile = (fileDeleted, doneMessage) => {
  if (fileDeleted === false) {
    toast.warning(`${doneMessage}, but the old image file could not be deleted from the server (it may already be gone).`)
  } else if (fileDeleted === true) {
    toast.success(`${doneMessage} and the old image file was deleted from the server.`)
  } else {
    toast.success(`${doneMessage}.`)
  }
}

/**
 * One banner: preview in the shape it has on the phone, choose a new image + Save, or Remove the live one.
 * `current` is what is live now. Choosing / Save work on the new image; Remove deletes the live banner (and its
 * file on the server) at once, after a confirmation.
 */
function BannerCard({
  title,
  description,
  size,
  tips,
  aspect,
  baseColor,
  baseColorNote,
  guideAt,
  guideLabel,
  current,
  showTopColor,
  canEdit,
  onSave,
  onRemove,
}) {
  const inputRef = useRef(null)
  const [imageUrl, setImageUrl] = useState(current.imageUrl)
  const [topColor, setTopColor] = useState(current.topColor || "")
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  // A save (or the first load) hands the saved values back: the card follows them.
  useEffect(() => {
    setImageUrl(current.imageUrl)
    setTopColor(current.topColor || "")
    setFile(null)
  }, [current.imageUrl, current.topColor])

  const changed = Boolean(file) || imageUrl !== current.imageUrl || (showTopColor && topColor !== (current.topColor || ""))

  const pickFile = (event) => {
    const picked = event.target.files?.[0]
    event.target.value = ""
    if (!picked) return
    if (!picked.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    setFile(picked)
    setImageUrl(URL.createObjectURL(picked))
  }

  // Drop a chosen-but-unsaved image: back to what is live.
  const discard = () => {
    setFile(null)
    setImageUrl(current.imageUrl)
    setTopColor(current.topColor || "")
  }

  const save = async () => {
    setSaving(true)
    try {
      const fileDeleted = await onSave({ file, imageUrl, topColor })
      reportFile(fileDeleted, `${title} saved`)
    } catch (error) {
      toast.error(apiErrorMessage(error, `Could not save the ${title.toLowerCase()}`))
    } finally {
      setSaving(false)
    }
  }

  const removeLive = async () => {
    setRemoving(true)
    try {
      const fileDeleted = await onRemove()
      setConfirmRemove(false)
      reportFile(fileDeleted, `${title} removed`)
    } catch (error) {
      toast.error(apiErrorMessage(error, `Could not remove the ${title.toLowerCase()}`))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,260px)_1fr]">
        <div>
          <div
            className="relative w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
            style={{ aspectRatio: aspect, backgroundColor: topColor || baseColor }}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className={`absolute inset-0 flex justify-center px-4 text-center text-xs font-medium text-white/80 ${guideAt != null ? 'items-start pt-[18%]' : 'items-center'}`}>
                {baseColorNote}
              </span>
            )}
            {guideAt != null && (
              <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/80" style={{ top: `${guideAt}%` }}>
                <span className="absolute right-1.5 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                  {guideLabel}
                </span>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Preview as on a phone</p>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p><span className="font-semibold text-slate-800">Image size:</span> {size}</p>
            {tips.map((tip) => (
              <p key={tip}>• {tip}</p>
            ))}
          </div>

          {showTopColor && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Top colour (optional)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(topColor) ? topColor : "#d91f3a"}
                  onChange={(event) => setTopColor(event.target.value)}
                  disabled={!canEdit || !imageUrl}
                  className="h-9 w-12 rounded border border-slate-200 bg-white p-1"
                />
                <input
                  type="text"
                  value={topColor}
                  onChange={(event) => setTopColor(event.target.value.trim())}
                  placeholder="#D91F3A"
                  disabled={!canEdit || !imageUrl}
                  className="w-32 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">The plain colour at the top of your image (used for the phone status bar).</p>
            </div>
          )}

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                {imageUrl ? "Change image" : "Choose image"}
              </button>
              {file ? (
                <button
                  type="button"
                  onClick={discard}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  Discard
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  disabled={saving || !current.imageUrl}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving || !changed}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">You can view this banner but not change it.</p>
          )}
        </div>
      </div>

      <Dialog open={confirmRemove} onOpenChange={(open) => !open && !removing && setConfirmRemove(false)}>
        <DialogContent className="max-w-sm bg-white p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
            <DialogTitle>Remove {title}?</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1">
              The banner disappears from the customer app straight away and its image file is deleted from the
              server. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              disabled={removing}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={removeLive}
              disabled={removing}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {removing ? "Removing..." : "Remove"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

export default function GlobalHomeBanners() {
  const profile = useMemo(() => readAdminProfile(), [])
  const canEdit = hasGlobalSection(profile, "userManagement", "edit")
  const [loading, setLoading] = useState(true)
  const [banners, setBanners] = useState({ food: { imageUrl: "", topColor: "" }, taxi: { imageUrl: "" } })

  const load = useCallback(async () => {
    try {
      const response = await globalAdminAPI.getHomeBanners()
      const data = response?.data?.data
      if (data) setBanners({ food: { imageUrl: "", topColor: "", ...data.food }, taxi: { imageUrl: "", ...data.taxi } })
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to load the home banners"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Upload the new file first (when one was chosen), then save its address; the server deletes the OLD file only after
  // that. If saving fails, the file that was just uploaded is removed again so nothing is left lying on the server.
  const saveBanner = async ({ file, imageUrl, folder, update }) => {
    let uploaded = ""
    if (file) {
      // Pictures wider than the 1170 px template are scaled down here already (the server converts to WebP and caps
      // them too): more pixels than a phone shows only make the home screen slower to open.
      const prepared = await prepareUploadFile(file, { maxWidth: 1170, maxHeight: 1180, alwaysCheckSize: true })
      const response = await globalAdminAPI.uploadHomeBannerImage(prepared, folder)
      uploaded = response?.data?.data?.url || ""
      if (!uploaded) throw new Error("The image could not be uploaded")
    }
    try {
      const response = await update(uploaded || imageUrl)
      const data = response?.data?.data
      if (data) setBanners((previous) => ({ ...previous, food: data.food, taxi: data.taxi }))
      return data?.fileDeleted ?? null
    } catch (error) {
      if (uploaded) globalAdminAPI.deleteUploadedImage(uploaded).catch(() => {})
      throw error
    }
  }

  const saveFood = ({ file, imageUrl, topColor }) =>
    saveBanner({
      file,
      imageUrl,
      folder: "food/landing/fest-banner",
      update: (url) => globalAdminAPI.updateFoodHomeBanner({ imageUrl: url, topColor }),
    })

  const saveTaxi = ({ file, imageUrl }) =>
    saveBanner({
      file,
      imageUrl,
      folder: "taxi/home-banner",
      update: (url) => globalAdminAPI.updateTaxiHomeBanner({ imageUrl: url }),
    })

  const removeFood = () =>
    saveBanner({ file: null, imageUrl: "", update: (url) => globalAdminAPI.updateFoodHomeBanner({ imageUrl: url, topColor: "" }) })
  const removeTaxi = () =>
    saveBanner({ file: null, imageUrl: "", update: (url) => globalAdminAPI.updateTaxiHomeBanner({ imageUrl: url }) })

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">User Management — Home Banners</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            The banner at the top of the Food and Taxi home screens in the customer app. Upload the image here; it
            goes live straight away. Without an image the default banner of that app is shown.
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-14 text-center text-sm text-slate-500">
            <Loader2 className="inline w-5 h-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : (
          <>
            <BannerCard
              title="Food Fest Banner"
              description="Fills the whole top of the Food home: behind the location, Taxi / Food switch, search bar and Veg Mode."
              size="1170 × 1180 px (about square, 390 : 393)"
              tips={[
                "Keep the top half a plain colour: the location, switch and search bar sit on it.",
                "Put the design (text, food pictures) below the dashed line, under the search bar.",
                "The bottom corners are rounded by the app.",
              ]}
              aspect="390 / 393"
              baseColor="#D91F3A"
              baseColorNote="No image: the default red Flavour Fest design is shown"
              guideAt={49}
              guideLabel="Search bar ends"
              current={banners.food}
              showTopColor
              canEdit={canEdit}
              onSave={saveFood}
              onRemove={removeFood}
            />
            <BannerCard
              title="Taxi Home Banner"
              description="Fills the space under the Taxi app bar (location, Taxi / Food switch) on the Taxi home."
              size="1170 × 789 px (390 : 263)"
              tips={[
                "The top edge blends into the dark app bar (#0B172A): start the image with that colour.",
                "The bottom corners are rounded by the app.",
                "No image: the default \"Safe Rides, Every Time\" banner (Bike / Auto / Car) is shown.",
              ]}
              aspect="390 / 263"
              baseColor={TAXI_HEADER_COLOR}
              baseColorNote="No image: the default Safe Rides, Every Time banner is shown"
              current={banners.taxi}
              canEdit={canEdit}
              onSave={saveTaxi}
              onRemove={removeTaxi}
            />
          </>
        )}
      </div>
    </div>
  )
}
