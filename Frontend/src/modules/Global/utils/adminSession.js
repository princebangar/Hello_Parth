import { adminAPI } from "@food/api"
import { clearModuleAuth, getModuleRefreshToken, getModuleToken, setAuthData } from "@food/utils/auth"
import { clearUnifiedAdminSession, setUnifiedAdminSession } from "@/modules/Taxi/modules/admin/services/adminSession"
import { readAdminProfile } from "@/shared/utils/adminAccess.js"

/** Sign the admin out of every part of the panel (Food, Taxi and Global share one session). */
export async function signOutAdmin() {
  try {
    await adminAPI.logout()
  } catch {
    // The local clean-up below is what matters when the network call fails.
  }

  clearModuleAuth("admin")
  clearUnifiedAdminSession()
  try {
    localStorage.removeItem("admin_sidebar_state")
    localStorage.removeItem("admin_recent_searches")
    sessionStorage.removeItem("adminAuthData")
  } catch {
    // storage may be blocked
  }
  window.dispatchEvent(new Event("adminAuthChanged"))
}

/**
 * Pulls the latest profile (module access, permissions) from the server and stores it, so a change made by
 * the super admin reaches an open panel without signing in again. Resolves to true when something changed.
 */
export async function refreshAdminProfile() {
  const response = await adminAPI.getAdminProfile()
  const fresh = response?.data?.data?.admin || response?.data?.admin || null
  if (!fresh || typeof fresh !== "object") return false

  const current = readAdminProfile()
  const pick = (profile) => JSON.stringify([
    profile.role,
    profile.isActive,
    profile.moduleAccess,
    profile.foodPermissions,
    profile.globalPermissions,
    profile.permissions,
    profile.servicesAccess,
    profile.service_location_ids,
  ])
  if (pick(current) === pick(fresh)) return false

  const token = getModuleToken("admin")
  const refresh = getModuleRefreshToken("admin")
  if (!token) return false

  const merged = { ...current, ...fresh }
  setAuthData("admin", token, merged, refresh)
  setUnifiedAdminSession({ token, user: merged, refreshToken: refresh })
  return true
}
