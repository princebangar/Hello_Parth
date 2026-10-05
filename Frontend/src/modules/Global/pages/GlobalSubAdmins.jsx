import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
} from "lucide-react"
import { toast } from "sonner"
import AdminListPagination from "@food/components/admin/AdminListPagination"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { GLOBAL_ADMIN_HOME } from "@/shared/utils/activeModule.js"
import useDirty from "../../../shared/hooks/useDirty"
import { apiErrorMessage, globalAdminAPI } from "../api/globalAdminAPI"

const emptyForm = { name: "", email: "", phone: "", password: "", servicesAccess: ["food", "taxi"] }

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition-colors"

const MODULES = [
  { key: "food", label: "Food", description: "Restaurants, orders, delivery", Icon: UtensilsCrossed },
  { key: "taxi", label: "Taxi", description: "Rides, drivers, bus, pooling", Icon: Truck },
]

const ModuleBadge = ({ module }) => {
  const meta = MODULES.find((item) => item.key === module)
  if (!meta) return null
  const Icon = meta.Icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  )
}

export default function GlobalSubAdmins() {
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    try {
      return Number(localStorage.getItem("admin_global_sub_admins_pageSize")) || 20
    } catch {
      return 20
    }
  })
  const [totalItems, setTotalItems] = useState(0)
  const [subAdmins, setSubAdmins] = useState([])
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [passwordDialog, setPasswordDialog] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" })
  const { isDirty: passwordDirty, resetBaseline: resetPasswordBaseline } = useDirty(passwordForm, true)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const requestIdRef = useRef(0)

  const fetchSubAdmins = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setRefreshing(true)
    try {
      const response = await globalAdminAPI.getSubAdmins({
        search: searchQuery.trim() || undefined,
        page: currentPage,
        limit: pageSize,
      })
      if (requestId !== requestIdRef.current) return
      const data = response?.data?.data || {}
      setSubAdmins(Array.isArray(data.subAdmins) ? data.subAdmins : [])
      setTotalItems(data.pagination?.total ?? 0)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      toast.error(apiErrorMessage(error, "Failed to load sub admins"))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [searchQuery, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  useEffect(() => {
    const timer = setTimeout(fetchSubAdmins, searchQuery.trim() ? 300 : 0)
    return () => {
      clearTimeout(timer)
      requestIdRef.current += 1
    }
  }, [fetchSubAdmins, searchQuery])

  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }))

  const toggleFormModule = (module) =>
    setForm((previous) => ({
      ...previous,
      servicesAccess: previous.servicesAccess.includes(module)
        ? previous.servicesAccess.filter((item) => item !== module)
        : [...previous.servicesAccess, module],
    }))

  const resetForm = () => {
    setForm(emptyForm)
    setShowPassword(false)
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error("Name, email and password are required")
      return
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    if (form.servicesAccess.length === 0) {
      toast.error("Give access to at least one module (Food or Taxi)")
      return
    }

    setCreating(true)
    try {
      const response = await globalAdminAPI.createSubAdmin({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        servicesAccess: form.servicesAccess,
      })
      const created = response?.data?.data?.subAdmin
      toast.success("Sub admin created. Now choose what they can open.")
      resetForm()
      if (created?.id) {
        navigate(`${GLOBAL_ADMIN_HOME}/sub-admins/${created.id}/access`)
      } else {
        await fetchSubAdmins()
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to create sub admin"))
    } finally {
      setCreating(false)
    }
  }

  const closePasswordDialog = (force = false) => {
    if (savingPassword && !force) return
    setPasswordDialog(null)
    setPasswordForm({ newPassword: "", confirmPassword: "" })
    setShowNewPassword(false)
  }

  const handleSavePassword = async () => {
    if (!passwordDialog) return
    const newPassword = passwordForm.newPassword.trim()
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    if (newPassword !== passwordForm.confirmPassword.trim()) {
      toast.error("New password and confirm password do not match")
      return
    }

    setSavingPassword(true)
    try {
      await globalAdminAPI.resetSubAdminPassword(passwordDialog.id, newPassword)
      toast.success("Password updated. They will need to sign in again.")
      closePasswordDialog(true)
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update password"))
    } finally {
      setSavingPassword(false)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmDialog?.admin) return
    const { type, admin } = confirmDialog
    setActionLoading(true)
    try {
      if (type === "delete") {
        await globalAdminAPI.deleteSubAdmin(admin.id)
        toast.success("Sub admin deleted")
      } else {
        await globalAdminAPI.updateSubAdminStatus(admin.id, type === "enable")
        toast.success(type === "enable" ? "Sub admin enabled" : "Sub admin disabled")
      }
      setConfirmDialog(null)
      await fetchSubAdmins()
    } catch (error) {
      toast.error(apiErrorMessage(error, "Action failed"))
    } finally {
      setActionLoading(false)
    }
  }

  const confirmCopy = () => {
    const name = confirmDialog?.admin?.name || "this sub admin"
    if (confirmDialog?.type === "delete") {
      return { title: "Delete Sub Admin", message: `Are you sure you want to delete "${name}"? This action cannot be undone.` }
    }
    if (confirmDialog?.type === "disable") {
      return { title: "Disable Sub Admin", message: `Disable "${name}"? They will be signed out and cannot sign in until enabled again.` }
    }
    return { title: "Enable Sub Admin", message: `Enable "${name}"?` }
  }
  const { title: confirmTitle, message: confirmMessage } = confirmCopy()

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <div className="space-y-4 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
              <UserCog className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Sub Admin Management</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Create sub admins that work across Food and Taxi, then choose the sidebar options each one gets.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Plus className="w-4 h-4 text-slate-700" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">Create Sub Admin</h2>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="gsa-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input id="gsa-name" type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Full name" className={inputClass} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="gsa-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input id="gsa-email" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="email@example.com" className={inputClass} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="gsa-phone" className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input id="gsa-phone" type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="Phone number" className={inputClass} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="gsa-password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    id="gsa-password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    placeholder="Min 6 characters"
                    className={`${inputClass} pr-10`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <fieldset>
              <legend className="block text-sm font-medium text-slate-700 mb-2">Module access</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MODULES.map(({ key, label, description, Icon }) => {
                  const checked = form.servicesAccess.includes(key)
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${
                        checked ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleFormModule(key)} className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-500">{description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">You choose the exact sidebar options for each module on the next screen.</p>
            </fieldset>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-60 shadow-sm"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Sub Admin
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-2 shrink-0">
              <Users className="w-5 h-5 text-slate-600" />
              <h2 className="text-base sm:text-lg font-semibold text-slate-900">Sub Admins</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 min-w-[1.5rem] text-center">{totalItems}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 sm:justify-end">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sub admins"
                  className="pl-9 pr-3 py-2 w-full text-sm rounded-lg border border-slate-200 bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={fetchSubAdmins}
                disabled={refreshing || loading}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-all shrink-0"
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {loading && subAdmins.length === 0 ? (
            <div className="space-y-3 py-2" aria-busy="true">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex items-center gap-3 py-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-40 bg-slate-200 rounded" />
                    <div className="h-3 w-56 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : subAdmins.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">No sub admins found</p>
              <p className="text-xs text-slate-400 mt-1">Create one using the form above</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 -mx-1">
              {subAdmins.map((admin) => {
                const active = admin.isActive !== false
                return (
                  <div key={admin.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 py-3.5 px-1 hover:bg-slate-50/80 rounded-lg transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                        {(admin.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">{admin.name}</p>
                          {(admin.servicesAccess || []).map((module) => <ModuleBadge key={module} module={module} />)}
                          {!active && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-50 text-red-600 shrink-0">Disabled</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {admin.email}
                          {admin.phone ? ` · ${admin.phone}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate(`${GLOBAL_ADMIN_HOME}/sub-admins/${admin.id}/access`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 transition-colors"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Access
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const blankPasswordForm = { newPassword: "", confirmPassword: "" }
                          setPasswordForm(blankPasswordForm)
                          resetPasswordBaseline(blankPasswordForm)
                          setPasswordDialog(admin)
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Forget Password
                      </button>
                      {active ? (
                        <button type="button" onClick={() => setConfirmDialog({ type: "disable", admin })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">
                          <Ban className="w-3.5 h-3.5" />
                          Disable
                        </button>
                      ) : (
                        <button type="button" onClick={() => setConfirmDialog({ type: "enable", admin })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Enable
                        </button>
                      )}
                      <button type="button" onClick={() => setConfirmDialog({ type: "delete", admin })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <AdminListPagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={totalItems}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              try {
                localStorage.setItem("admin_global_sub_admins_pageSize", String(size))
              } catch {
                // storage may be blocked
              }
              setCurrentPage(1)
            }}
            itemLabel="sub admins"
          />
        </div>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription className="sr-only">{confirmMessage}</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5 space-y-5">
            <p className="text-sm text-slate-700">{confirmMessage}</p>
            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setConfirmDialog(null)} disabled={actionLoading} className="px-5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all">
                No
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={actionLoading}
                className={`px-5 py-2 text-sm font-medium rounded-lg text-white transition-all inline-flex items-center gap-2 ${
                  confirmDialog?.type === "enable" ? "bg-slate-900 hover:bg-slate-800" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordDialog} onOpenChange={(open) => !open && closePasswordDialog()}>
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-slate-700" />
              Forget Password
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1">
              Set a new password for <span className="font-medium text-slate-700">{passwordDialog?.name || "this sub admin"}</span>
              {passwordDialog?.email ? ` (${passwordDialog.email})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5 space-y-4">
            <div>
              <label htmlFor="gsa-new-password" className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <div className="relative">
                <input
                  id="gsa-new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((previous) => ({ ...previous, newPassword: event.target.value }))}
                  placeholder="Min 6 characters"
                  className={`${inputClass} pr-10`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((value) => !value)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="gsa-confirm-password" className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
              <input
                id="gsa-confirm-password"
                type={showNewPassword ? "text" : "password"}
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
                placeholder="Re-enter new password"
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button type="button" onClick={() => closePasswordDialog()} disabled={savingPassword} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button type="button" onClick={handleSavePassword} disabled={savingPassword || !passwordDirty} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                {savingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Password
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
