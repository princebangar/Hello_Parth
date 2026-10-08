/**
 * Which kind of partner the open admin page is about: "restaurant" (the Restaurants pages) or "store" (the
 * My Store pages, which reuse the same page components). adminAPI list calls read it so a page doesn't have to
 * pass partnerType by hand. Set by <PartnerScope> while such a page is mounted; null everywhere else (then the
 * API returns both kinds, as before).
 */
let current = null // { type, token }

export function setAdminPartnerScope(type, token) {
  current = type ? { type, token } : null
}

/** Cleanup of one page: only clears the scope if no newer page has taken it over meanwhile. */
export function clearAdminPartnerScope(token) {
  if (current && current.token === token) current = null
}

export function getAdminPartnerScope() {
  return current ? current.type : null
}

/** Adds partnerType to list params (an explicit value always wins). */
export function withPartnerScope(params = {}) {
  const type = getAdminPartnerScope()
  if (!type) return params
  return { partnerType: type, ...(params || {}) }
}

/** Adds partnerType to a create/update body (coupons). */
export function withPartnerBody(body = {}) {
  const type = getAdminPartnerScope()
  if (!type) return body ?? {}
  return { partnerType: type, ...(body || {}) }
}
