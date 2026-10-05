import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  ImagePlus,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { hasGlobalSection, readAdminProfile } from "@/shared/utils/adminAccess.js"
import { prepareUploadFile } from "@/shared/utils/imageCompressor"
import useDirty from "../../../shared/hooks/useDirty"
import { apiErrorMessage, globalAdminAPI } from "../api/globalAdminAPI"

const emptyForm = { name: "", url: "", image: "", description: "", isActive: true }

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition-colors"

const hostnameOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export default function GlobalLandingManagement() {
  const profile = useMemo(() => readAdminProfile(), [])
  const canCreate = hasGlobalSection(profile, "landing", "create")
  const canEdit = hasGlobalSection(profile, "landing", "edit")
  const canDelete = hasGlobalSection(profile, "landing", "delete")

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [services, setServices] = useState([])
  const [dialog, setDialog] = useState(null) // { mode: "create" | "edit", service? }
  const [form, setForm] = useState(emptyForm)
  const { isDirty, resetBaseline } = useDirty(form, true)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  const fetchServices = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    try {
      const response = await globalAdminAPI.getOtherServices()
      setServices(response?.data?.data?.services || [])
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to load landing page services"))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  const openCreate = () => {
    setForm(emptyForm)
    setDialog({ mode: "create" })
  }

  const openEdit = (service) => {
    const nextForm = {
      name: service.name,
      url: service.url,
      image: service.image || "",
      description: service.description,
      isActive: service.isActive,
    }
    setForm(nextForm)
    resetBaseline(nextForm)
    setDialog({ mode: "edit", service })
  }

  const closeDialog = () => {
    if (saving || uploadingImage) return
    setDialog(null)
    setForm(emptyForm)
  }

  const handleImageSelect = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setUploadingImage(true)
    try {
      const prepared = await prepareUploadFile(file)
      const response = await globalAdminAPI.uploadOtherServiceImage(prepared, form.image)
      const url = response?.data?.data?.url
      if (!url) throw new Error("No URL returned")
      setForm((previous) => ({ ...previous, image: url }))
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to upload banner image"))
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form.name.trim() || !form.url.trim()) {
      toast.error("Name and URL are required")
      return
    }

    setSaving(true)
    try {
      if (dialog.mode === "create") {
        await globalAdminAPI.createOtherService({
          name: form.name.trim(),
          url: form.url.trim(),
          image: form.image,
          description: form.description.trim(),
          isActive: form.isActive,
        })
        toast.success("Service card created")
      } else {
        await globalAdminAPI.updateOtherService(dialog.service.id, {
          name: form.name.trim(),
          url: form.url.trim(),
          image: form.image,
          description: form.description.trim(),
          isActive: form.isActive,
        })
        toast.success("Service card updated")
      }
      closeDialog()
      await fetchServices({ silent: true })
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save the service card"))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (service) => {
    try {
      await globalAdminAPI.updateOtherService(service.id, { isActive: !service.isActive })
      toast.success(service.isActive ? "Card hidden from the landing page" : "Card shown on the landing page")
      await fetchServices({ silent: true })
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update the card"))
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await globalAdminAPI.deleteOtherService(confirmDelete.id)
      toast.success("Service card deleted")
      setConfirmDelete(null)
      await fetchServices({ silent: true })
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to delete the card"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Landing Page — Other Services</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Clicking a card sends the visitor straight to its website.
                </p>
              </div>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Service
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          {loading ? (
            <div className="py-14 text-center text-sm text-slate-500">
              <Loader2 className="inline w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : services.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Link2 className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">No service cards yet</p>
              <p className="text-xs text-slate-400 mt-1">
                {canCreate ? 'Add one with "Add Service" above.' : "Ask a platform admin to add one."}
              </p>
            </div>
          ) : (
            <div className={`divide-y divide-slate-100 -mx-1 ${refreshing ? "opacity-60" : ""}`}>
              {services.map((service) => (
                <div key={service.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 px-1">
                  <div className="flex items-center gap-3 min-w-0">
                    {service.image ? (
                      <img
                        src={service.image}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 font-bold text-sm uppercase">
                        {service.name.charAt(0) || "?"}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{service.name}</p>
                        {!service.isActive && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                            Hidden
                          </span>
                        )}
                      </div>
                      <a
                        href={service.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 truncate"
                      >
                        {hostnameOf(service.url)}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {service.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">{service.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => toggleActive(service)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                        title={service.isActive ? "Hide from landing page" : "Show on landing page"}
                      >
                        {service.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {service.isActive ? "Visible" : "Hidden"}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(service)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(service)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
            <DialogTitle>{dialog?.mode === "edit" ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1">
              This shows up as a card in "Other Services" on the public landing page.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="px-5 py-5 space-y-4">
            <div>
              <label htmlFor="svc-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                id="svc-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="e.g. Hello Parth Store"
                maxLength={60}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="svc-url" className="block text-sm font-medium text-slate-700 mb-1">Website URL</label>
              <input
                id="svc-url"
                type="text"
                value={form.url}
                onChange={(event) => setForm((previous) => ({ ...previous, url: event.target.value }))}
                placeholder="example.com or https://example.com"
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Banner image (optional)</label>
              {form.image ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200">
                  <img src={form.image} alt="Banner preview" className="h-32 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((previous) => ({ ...previous, image: "" }))}
                    disabled={uploadingImage}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    aria-label="Remove banner image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="svc-image"
                  className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                >
                  {uploadingImage ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-xs font-medium">Upload a banner</span>
                    </>
                  )}
                </label>
              )}
              <input
                id="svc-image"
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                disabled={uploadingImage}
                className="hidden"
              />
              <p className="text-xs text-slate-400 mt-1">
                No banner? The card still posts fine — it just shows the name and description.
              </p>
            </div>
            <div>
              <label htmlFor="svc-description" className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                id="svc-description"
                value={form.description}
                onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="One or two lines about this service"
                maxLength={300}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              Show on the landing page
            </label>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving || uploadingImage}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingImage || (dialog?.mode === "edit" && !isDirty)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {dialog?.mode === "edit" ? "Save Changes" : "Create Card"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && !deleting && setConfirmDelete(null)}>
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
            <DialogTitle>Delete Service</DialogTitle>
            <DialogDescription className="sr-only">Confirm delete</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5 space-y-5">
            <p className="text-sm text-slate-700">
              Delete "{confirmDelete?.name}"? It will disappear from the landing page immediately.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <X className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 inline-flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
