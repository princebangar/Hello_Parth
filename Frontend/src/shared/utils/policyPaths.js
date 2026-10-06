// Which routes are a Terms / Privacy / Support screen. Kept in its own tiny file (no imports) because the route
// fallbacks in the app shell need it, and they must not drag the policy loading code into the first download.

const POLICY_PATH = new RegExp(
  "^/(?:" +
    "user/(?:terms|privacy|support)" +
    "|food/user/profile/(?:terms|privacy|support-info|refund|shipping|cancellation)" +
    "|food/restaurant/(?:terms|privacy|help-content|help-centre/support)" +
    "|food/delivery/(?:terms|privacy|profile/terms|profile/privacy|help/content)" +
    "|taxi/(?:driver|owner)/legal/(?:terms|privacy|support)" +
    "|taxi/(?:terms|terms-and-conditions|privacy|privacy-policy|refund|cancellation)" +
  ")/?$",
)

export const isPolicyPath = (pathname = "") => POLICY_PATH.test(String(pathname || "").split("?")[0])
