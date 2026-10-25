import React from 'react'
import { useNavigate, router } from '@/lib/router'
import CMSPage from '@food/components/user/CMSPage'
import { USER_POLICY_ENDPOINTS } from '@/shared/utils/policyPages'
import { isConsumerLoggedIn, resolveAppColdStartRoute } from '@/shared/utils/activeModule'

// Customer Terms / Privacy / Support at /user/terms, /user/privacy, /user/support. One customer uses Food and Taxi,
// and the text comes from the Global admin, so these pages belong to neither app (these are the Play Store links).
const PAGES = {
  terms: { endpoint: USER_POLICY_ENDPOINTS.terms, title: 'Terms of Service' },
  privacy: { endpoint: USER_POLICY_ENDPOINTS.privacy, title: 'Privacy Policy' },
  support: { endpoint: USER_POLICY_ENDPOINTS.support, title: 'Help & Support' },
}

export default function UserPolicyPage({ type }) {
  const navigate = useNavigate()
  const page = PAGES[type] || PAGES.terms

  // Opened from a screen in the app -> back to that screen; opened from a link (nothing behind it) -> into the app (or
  // login). The web read window.history.state.idx; the app asks the navigation stack.
  const goBack = () => {
    if (router.canGoBack()) {
      navigate(-1)
      return
    }
    navigate(isConsumerLoggedIn() ? resolveAppColdStartRoute() : '/login', { replace: true })
  }

  return <CMSPage endpoint={page.endpoint} title={page.title} module="USER" goBack={goBack} fallbackPath="/login" />
}
