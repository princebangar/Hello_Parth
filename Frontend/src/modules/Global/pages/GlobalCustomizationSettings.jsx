import { useCallback, useEffect, useMemo, useState } from "react"
import { CreditCard, Gift, Loader2, SlidersHorizontal, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@food/components/ui/switch"
import { hasGlobalSection, readAdminProfile } from "@/shared/utils/adminAccess.js"
import { getPageCache, setPageCache } from "@/shared/utils/pageCache.js"
import { CUSTOMIZATION_CACHE_KEY, apiErrorMessage, globalAdminAPI } from "../api/globalAdminAPI"

/** Who uses which gateway — shown on its card so the admin knows what a switch affects. */
const GATEWAY_USAGE = {
  razorpay: "Food: checkout + wallet top-up. Taxi: ride, tip, pooling, bus booking, driver QR, wallet top-up.",
  phonepe: "Taxi wallet top-up only (user and driver). Used when Razorpay is off.",
}

export default function GlobalCustomizationSettings() {
  const profile = useMemo(() => readAdminProfile(), [])
  const canEdit = hasGlobalSection(profile, "customization", "edit")

  const cached = useMemo(() => getPageCache(CUSTOMIZATION_CACHE_KEY), [])
  const [loading, setLoading] = useState(!cached)
  const [gateways, setGateways] = useState(cached?.paymentGateways || [])
  const [referralEnabled, setReferralEnabled] = useState(cached?.referral?.enabled !== false)
  const [savingKey, setSavingKey] = useState(null)

  const applySettings = useCallback((data) => {
    if (!data) return
    setGateways(data.paymentGateways || [])
    setReferralEnabled(data.referral?.enabled !== false)
    setPageCache(CUSTOMIZATION_CACHE_KEY, data)
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const response = await globalAdminAPI.getCustomizationSettings()
      applySettings(response?.data?.data)
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to load customization settings"))
    } finally {
      setLoading(false)
    }
  }, [applySettings])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const toggleGateway = async (gateway, enabled) => {
    setSavingKey(gateway.key)
    try {
      const response = await globalAdminAPI.updatePaymentGateways({ [gateway.key]: enabled })
      const paymentGateways = response?.data?.data?.paymentGateways || []
      setGateways(paymentGateways)
      setPageCache(CUSTOMIZATION_CACHE_KEY, { ...(getPageCache(CUSTOMIZATION_CACHE_KEY) || {}), paymentGateways })
      toast.success(`${gateway.label} ${enabled ? "ON" : "OFF"}`)
    } catch (error) {
      toast.error(apiErrorMessage(error, `Failed to update ${gateway.label}`))
    } finally {
      setSavingKey(null)
    }
  }

  const toggleReferral = async (enabled) => {
    setSavingKey("referral")
    try {
      const response = await globalAdminAPI.updateReferral(enabled)
      const next = response?.data?.data?.referral?.enabled !== false
      setReferralEnabled(next)
      setPageCache(CUSTOMIZATION_CACHE_KEY, { ...(getPageCache(CUSTOMIZATION_CACHE_KEY) || {}), referral: { enabled: next } })
      toast.success(`Referral system ${next ? "ON" : "OFF"}`)
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update referral system"))
    } finally {
      setSavingKey(null)
    }
  }

  const noneActive = !loading && gateways.length > 0 && gateways.every((gateway) => !gateway.active)

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Customization Settings</h1>
              <p className="text-sm text-slate-500 mt-0.5">Switches that apply to the whole app — Food and Taxi.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Payment Gateways</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Turning a gateway off stops new payments only — payments already started still verify and refund.
          </p>

          {noneActive && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 mb-4 text-xs text-amber-800">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>No gateway is active — customers can only pay by cash or wallet balance.</span>
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <Loader2 className="inline w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {gateways.map((gateway) => (
                <div key={gateway.key} className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{gateway.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{GATEWAY_USAGE[gateway.key]}</p>
                    </div>
                    <div className="shrink-0 pt-0.5">
                      {savingKey === gateway.key ? (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      ) : (
                        <Switch
                          checked={gateway.enabled}
                          onCheckedChange={(checked) => toggleGateway(gateway, checked)}
                          disabled={!canEdit}
                          aria-label={`${gateway.label} on or off`}
                          className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Referral System</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Customer "Refer &amp; Earn" in the Food and Taxi wallets. Turning it off hides it in both apps and stops
            new referral rewards. Rewards already paid stay in the wallets. Driver / rider referral is separate.
          </p>

          {loading ? (
            <div className="py-6 text-center text-sm text-slate-500">
              <Loader2 className="inline w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">Customer referral</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                  Reward amount and limits are set in each app's own Referral settings.
                </p>
              </div>
              <div className="shrink-0 pt-0.5">
                {savingKey === "referral" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                ) : (
                  <Switch
                    checked={referralEnabled}
                    onCheckedChange={toggleReferral}
                    disabled={!canEdit}
                    aria-label="Referral system on or off"
                    className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
