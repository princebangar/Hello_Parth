/**
 * The admin "Restaurant" pages are reused for My Store (route prop `partnerType="store"`). Same page, same
 * design; only the partner kind sent to the API and the wording change ("Restaurant" -> "Store").
 */
import { isMyStorePartner } from "@food/utils/auth"

export const STORE = "store"

export const normalizeAdminPartnerType = (value) => (value === STORE ? STORE : "restaurant")

export const isStorePartner = (value) => value === STORE

/** "Restaurant Name" -> "Store Name" for My Store pages; unchanged for Restaurant pages. */
export function pw(text, partnerType) {
  if (partnerType !== STORE || typeof text !== "string") return text
  return text
    .replace(/Restaurants/g, "Stores")
    .replace(/Restaurant/g, "Store")
    .replace(/restaurants/g, "stores")
    .replace(/restaurant/g, "store")
    .replace(/RESTAURANTS/g, "STORES")
    .replace(/RESTAURANT/g, "STORE")
}

/** Panel / onboarding text for the logged-in partner: a My Store partner reads "store" wherever it says "restaurant". */
export function panelWords(text) {
  return pw(text, isMyStorePartner() ? STORE : "restaurant")
}

/** Query params for the admin API: only a My Store / Restaurant page narrows the list. */
export const partnerParams = (partnerType) => ({ partnerType: normalizeAdminPartnerType(partnerType) })
