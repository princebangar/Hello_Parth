import { Navigate } from "react-router-dom"
import { getAdminHomePath, getFirstGlobalPath, hasGlobalSection, isPlatformAdmin, readAdminProfile } from "@/shared/utils/adminAccess.js"

/**
 * Guards one Global page. `section` needs that Global permission (platform admin always passes);
 * `platformOnly` pages (sub-admin management) are for the platform super admin only.
 */
export default function GlobalSectionRoute({ section = null, platformOnly = false, children }) {
  const profile = readAdminProfile()

  const allowed = platformOnly
    ? isPlatformAdmin(profile)
    : section
      ? hasGlobalSection(profile, section)
      : true

  if (allowed) return children

  const fallback = getFirstGlobalPath(profile) || getAdminHomePath(profile)
  return <Navigate to={fallback} replace />
}
