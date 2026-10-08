import { panelWords as sw } from "@food/utils/adminPartnerLabels"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, ChevronRight, FileText, Loader2, LogOut, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { authAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import LogoutDialog from "./LogoutDialog"
import { BASE, Modal, useRestaurantProfile } from "./kit"
import { Card, PageHeader, btn } from "./ui"

export default function DesktopAccount() {
  const navigate = useNavigate()
  const { profile } = useRestaurantProfile()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [balance, setBalance] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [captcha, setCaptcha] = useState("")
  const [deleting, setDeleting] = useState(false)

  const leave = () => {
    clearModuleAuth("restaurant")
    localStorage.removeItem("restaurant_authenticated")
    localStorage.removeItem("restaurant_user")
    window.dispatchEvent(new Event("restaurantAuthChanged"))
    navigate(`${BASE}/login`, { replace: true })
  }

  const startDelete = async () => {
    if (checking) return
    setChecking(true)
    try {
      const res = await authAPI.checkBalance("restaurant")
      const p = res?.data?.data ?? res?.data ?? {}
      const amount = Number(p.balance || 0)
      setCaptcha("")
      if (amount > 0) setBalance({ amount, type: p.type || "Restaurant Available Balance" })
      else setDeleteOpen(true)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not verify your available balance")
    } finally {
      setChecking(false)
    }
  }

  const confirmDelete = async () => {
    if (captcha !== "DELETE") return
    setDeleting(true)
    try {
      await authAPI.deleteAccount("restaurant")
      toast.success("Account deleted successfully")
      leave()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to delete account")
      setDeleting(false)
    }
  }

  const row = (Icon, tone, title, hint, onClick) => (
    <button onClick={onClick} className="group flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#B80B3D]" />
    </button>
  )

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, legal pages and danger zone" />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card title="Account" bodyClass="p-0">
            <div className="mt-3 flex items-center gap-4 border-b border-slate-100 px-5 pb-4">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#B80B3D]/10 text-lg font-bold text-[#B80B3D]">{(profile?.name || "R")[0]?.toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{profile?.name || profile?.restaurantName || "Your restaurant"}</p>
                <p className="truncate text-sm text-slate-500">{profile?.ownerEmail || profile?.primaryContactNumber || ""}</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {row(LogOut, "bg-rose-50 text-rose-600", "Logout", "Sign out of this device", () => setLogoutOpen(true))}
            </div>
          </Card>

          <Card title="Legal" bodyClass="p-0">
            <div className="mt-3 divide-y divide-slate-100">
              {row(ShieldCheck, "bg-blue-50 text-blue-600", "Privacy policy", "How we handle your data", () => navigate(`${BASE}/privacy`))}
              {row(FileText, "bg-violet-50 text-violet-600", "Terms & conditions", sw("Rules for restaurant partners"), () => navigate(`${BASE}/terms`))}
            </div>
          </Card>
        </div>

        <Card className="border-rose-200" title="Danger zone" subtitle="These actions cannot be undone">
          <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/60 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600"><Trash2 className="h-[18px] w-[18px]" /></span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Delete account</p>
                <p className="mt-0.5 text-sm text-slate-600">{sw("Your restaurant account will be deleted. The admin keeps historical records for revenue reporting.")}</p>
                <button onClick={startDelete} disabled={checking} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-4 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                  {checking && <Loader2 className="h-4 w-4 animate-spin" />} Delete my account
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} restaurant={profile} />

      <Modal
        open={!!balance}
        onClose={() => setBalance(null)}
        title="Wait! Balance found"
        width="max-w-md"
        footer={
          <>
            <button onClick={() => { setBalance(null); navigate(`${BASE}/earnings`) }} className={btn.ghost}>Go to payout</button>
            <button onClick={() => { setBalance(null); setDeleteOpen(true) }} className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3.5 text-[13px] font-semibold text-white hover:bg-rose-700">Continue deleting</button>
          </>
        }
      >
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{balance?.type}</p>
          <p className="mt-1 text-3xl font-black text-slate-900">₹{(balance?.amount || 0).toLocaleString("en-IN")}</p>
        </div>
        <p className="mt-4 text-sm text-slate-600">You still have an unsettled payout available to withdraw. Continue deleting your account or go to Earnings to withdraw first.</p>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete your account?"
        subtitle="Are you sure you want to delete your account?"
        width="max-w-md"
        footer={
          <>
            <button onClick={() => setDeleteOpen(false)} disabled={deleting} className={btn.ghost}>No, cancel</button>
            <button onClick={confirmDelete} disabled={deleting || captcha !== "DELETE"} className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-3.5 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Yes, delete
            </button>
          </>
        }
      >
        <div className="rounded-xl border-l-4 border-rose-500 bg-rose-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-700"><AlertTriangle className="h-4 w-4" /> Warning</p>
          <p className="mt-1 text-xs font-medium text-rose-800">Your account will be deleted. Admin will keep your historical records for revenue reporting.</p>
        </div>
        <input
          value={captcha}
          onChange={(e) => setCaptcha(e.target.value.toUpperCase())}
          placeholder="Type DELETE to confirm"
          className="mt-4 h-12 w-full rounded-xl border-2 border-slate-100 px-4 text-center font-bold tracking-widest outline-none placeholder:font-medium placeholder:tracking-normal focus:border-[#B80B3D] focus:ring-4 focus:ring-rose-50"
        />
      </Modal>
    </>
  )
}
