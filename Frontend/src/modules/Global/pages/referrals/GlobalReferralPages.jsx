import React, { lazy } from "react"
import { SettingsProvider } from "../../../Taxi/shared/context/SettingsContext"

/**
 * Referral Management lives in the Global admin: the referral amounts and rules apply to the whole platform
 * (Food and Taxi). The screens are the shared referral pages, wrapped with the settings provider they read from.
 */
const withSettings = (loader) => {
  const Page = lazy(loader)
  return function GlobalReferralPage() {
    return (
      <SettingsProvider>
        <Page />
      </SettingsProvider>
    )
  }
}

export const GlobalReferralDashboard = withSettings(() => import("../../../Taxi/modules/admin/pages/referrals/ReferralDashboard"))
export const GlobalUserReferralSettings = withSettings(() => import("../../../Taxi/modules/admin/pages/referrals/UserReferralSettings"))
export const GlobalDriverReferralSettings = withSettings(() => import("../../../Taxi/modules/admin/pages/referrals/DriverReferralSettings"))
export const GlobalReferralTranslation = withSettings(() => import("../../../Taxi/modules/admin/pages/referrals/ReferralTranslation"))
