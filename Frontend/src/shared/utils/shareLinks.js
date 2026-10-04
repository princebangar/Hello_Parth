import { isNativeLikeShell } from './nativeShell'

const PUBLIC_SITE = String(
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_ASSET_BASE_URL)) ||
    '',
).replace(/\/+$/, '')

/**
 * Public https address of the app. Inside the installed app's WebView the page origin is a private one
 * (file:// / localhost), so a link built from it opens nowhere for the person who receives it.
 */
export function getPublicAppOrigin() {
  if (typeof window === 'undefined') return PUBLIC_SITE
  if (PUBLIC_SITE && (isNativeLikeShell() || window.location.protocol === 'file:')) return PUBLIC_SITE
  return window.location.origin
}

/** Link to the exact screen: path must start with "/food/..." (canonical route, no redirect that drops the query). */
export function buildShareUrl(path) {
  const clean = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`
  return `${getPublicAppOrigin()}${clean}`
}

export function restaurantSharePath(slugOrId, dishId) {
  const base = `/food/user/restaurants/${encodeURIComponent(String(slugOrId || ''))}`
  return dishId ? `${base}?dish=${encodeURIComponent(String(dishId))}` : base
}
