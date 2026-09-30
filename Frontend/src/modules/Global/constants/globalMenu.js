import { FileText, LayoutDashboard, Link2, Lock, Headset, SlidersHorizontal, User, UserCog, Users } from "lucide-react"
import { GLOBAL_ADMIN_HOME } from "@/shared/utils/activeModule.js"
import { hasGlobalSection, isPlatformAdmin } from "@/shared/utils/adminAccess.js"

/**
 * Sidebar of the Global admin. Kept separate from the Food and Taxi menus on purpose: Global only holds what
 * belongs to the whole platform. Each item names the Global permission section that unlocks it for a
 * sub-admin; `platformOnly` items are for the platform super admin, `always` items for everyone.
 */
export const GLOBAL_MENU = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", path: GLOBAL_ADMIN_HOME, icon: LayoutDashboard, section: "overview", exact: true },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Customers", path: `${GLOBAL_ADMIN_HOME}/customers`, icon: Users, section: "customers" },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Landing Page", path: `${GLOBAL_ADMIN_HOME}/landing`, icon: Link2, section: "landing" },
    ],
  },
  {
    label: "Pages & Social Media",
    items: [
      { label: "Terms & Conditions", path: `${GLOBAL_ADMIN_HOME}/pages-social-media/terms`, icon: FileText, section: "pagesSocialMedia" },
      { label: "Privacy Policy", path: `${GLOBAL_ADMIN_HOME}/pages-social-media/privacy`, icon: Lock, section: "pagesSocialMedia" },
      { label: "Support", path: `${GLOBAL_ADMIN_HOME}/pages-social-media/support`, icon: Headset, section: "pagesSocialMedia" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Customization Settings", path: `${GLOBAL_ADMIN_HOME}/customization`, icon: SlidersHorizontal, section: "customization" },
    ],
  },
  {
    label: "Access Control",
    items: [
      { label: "Sub Admins", path: `${GLOBAL_ADMIN_HOME}/sub-admins`, icon: UserCog, platformOnly: true },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", path: `${GLOBAL_ADMIN_HOME}/profile`, icon: User, always: true },
    ],
  },
]

const canSee = (item, profile) => {
  if (item.always) return true
  if (item.platformOnly) return isPlatformAdmin(profile)
  if (item.section) return hasGlobalSection(profile, item.section)
  return false
}

/** The menu for this admin: sections without a visible item disappear. */
export function getGlobalMenu(profile) {
  return GLOBAL_MENU
    .map((group) => ({ ...group, items: group.items.filter((item) => canSee(item, profile)) }))
    .filter((group) => group.items.length > 0)
}

/** Page title for the top bar. */
export function getGlobalPageTitle(pathname = "") {
  const path = String(pathname).replace(/\/+$/, "") || "/"
  if (/\/sub-admins\/[^/]+\/access$/.test(path)) return "Sub Admin Access"
  const match = GLOBAL_MENU.flatMap((group) => group.items)
    .filter((item) => (item.exact ? path === item.path : path === item.path || path.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return match ? match.label : "Global Admin"
}
