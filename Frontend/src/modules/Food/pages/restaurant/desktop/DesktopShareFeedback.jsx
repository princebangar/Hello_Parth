import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { SubPageHeader } from "./kit"
import { Card, btn } from "./ui"

/** Same survey as the phone ("Overall experience", 0-10) and the same endpoint. */
export default function DesktopShareFeedback() {
  const companyName = useCompanyName()
  const [rating, setRating] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (rating === null) return
    setBusy(true)
    try {
      const res = await api.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE, {
        rating: Math.ceil(rating / 2) || 1,
        module: "restaurant",
        comment: `User rated ${rating}/10 overall experience`,
      })
      if (res.data?.success) setDone(true)
      else throw new Error(res.data?.message || "Failed to submit")
    } catch (e) {
      toast.error(e?.message || "Failed to save feedback")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SubPageHeader title="Share your feedback" subtitle="Tell us how we are doing" back={-1} backLabel="Back" />
      <Card className="max-w-3xl">
        {done ? (
          <div className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 text-xl font-bold text-slate-900">Thank you!</p>
            <p className="mt-1 text-sm text-slate-500">Your feedback has been shared with the team.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">Tell us about your</p>
            <p className="text-lg font-semibold text-slate-900">Overall experience with {String(companyName || "us").toLowerCase()}</p>
            <div className="mt-5 grid grid-cols-11 overflow-hidden rounded-xl border border-slate-200">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`h-12 border-l border-slate-200 text-sm font-semibold first:border-l-0 transition-colors ${rating === n ? "bg-gradient-to-br from-[#B80B3D] to-[#66001D] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-xs">
              <span className="text-[#B80B3D]">Very Bad</span>
              <span className="text-emerald-600">Very Good</span>
            </div>
            {rating !== null && <p className="mt-4 text-sm text-slate-600">You rated your experience <b className="text-slate-900">{rating}/10</b>.</p>}
            <div className="mt-6 flex justify-end">
              <button onClick={submit} disabled={rating === null || busy} className={`${btn.primary} !h-10 px-6`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue</button>
            </div>
          </>
        )}
      </Card>
    </>
  )
}
