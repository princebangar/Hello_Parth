import { FOOD_ADMIN_HOME, GLOBAL_ADMIN_HOME, TAXI_ADMIN_HOME } from './activeModule.js'

/**
 * Which parts of the admin panel the signed-in admin may open. The backend sends `moduleAccess` with the
 * login / profile response; sessions saved before that field existed fall back to the admin level.
 */
const ADMIN_USER_KEY = 'admin_user'

/** Global sidebar sections, in the order they are offered. Keys match the backend `globalPermissions`. */
export const GLOBAL_SECTIONS = [
  { key: 'overview', label: 'Overview', path: GLOBAL_ADMIN_HOME, actions: ['view'] },
  {
    key: 'customers',
    label: 'Customers',
    path: `${GLOBAL_ADMIN_HOME}/customers`,
    actions: ['view', 'edit'],
    hint: 'Edit = block or unblock a customer in both apps',
  },
  {
    key: 'landing',
    label: 'Landing Page',
    path: `${GLOBAL_ADMIN_HOME}/landing`,
    actions: ['view', 'create', 'edit', 'delete'],
    hint: 'Manage the "Other Service" cards shown on the public landing page',
  },
  {
    key: 'pagesSocialMedia',
    label: 'Pages & Social Media',
    path: `${GLOBAL_ADMIN_HOME}/pages-social-media`,
    actions: ['view', 'create', 'edit', 'delete'],
    hint: 'Terms, Privacy and Support content shown on User/Restaurant/Delivery/Captain login screens',
  },
  {
    key: 'referrals',
    label: 'Referral Management',
    path: `${GLOBAL_ADMIN_HOME}/referrals`,
    actions: ['view', 'edit'],
    hint: 'Referral dashboard, user / driver referral amounts and referral message translations for Food and Taxi',
  },
  {
    key: 'customization',
    label: 'Customization Settings',
    path: `${GLOBAL_ADMIN_HOME}/customization`,
    actions: ['view', 'edit'],
    hint: 'Edit = turn Razorpay / PhonePe and the customer Referral system on or off for Food and Taxi',
  },
  {
    key: 'businessSetup',
    label: 'Business Setup',
    path: `${GLOBAL_ADMIN_HOME}/business-setup`,
    actions: ['view', 'edit'],
    hint: 'Edit = change company name, logo, favicon and contact details shown in Food and Taxi',
  },
]

export function readAdminProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_USER_KEY) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const levelOf = (profile = {}) => String(profile.adminLevel || profile.admin_level || '').trim().toLowerCase()

/** Platform super admin (accounts saved without a level are the original full admin). */
export function isPlatformAdmin(profile = readAdminProfile()) {
  const level = levelOf(profile)
  return !level || level === 'platform_superadmin'
}

export function hasGlobalSection(profile = readAdminProfile(), section, action = 'view') {
  if (isPlatformAdmin(profile)) return true
  const row = profile?.globalPermissions?.[section]
  if (!row) return false
  if (action === 'view') return Boolean(row.view || row.create || row.edit || row.delete)
  return Boolean(row[action])
}

export function getModuleAccess(profile = readAdminProfile()) {
  if (profile?.moduleAccess && typeof profile.moduleAccess === 'object') {
    return {
      food: profile.moduleAccess.food === true,
      taxi: profile.moduleAccess.taxi === true,
      global: profile.moduleAccess.global === true,
    }
  }

  const level = levelOf(profile)
  if (isPlatformAdmin(profile)) return { food: true, taxi: true, global: true }
  if (level === 'food_superadmin') return { food: true, taxi: false, global: false }
  if (level === 'taxi_superadmin') return { food: false, taxi: true, global: false }

  if (profile.isGlobalSubAdmin) {
    const services = Array.isArray(profile.servicesAccess) ? profile.servicesAccess : []
    return {
      food: services.includes('food'),
      taxi: services.includes('taxi'),
      global: GLOBAL_SECTIONS.some((section) => hasGlobalSection(profile, section.key)),
    }
  }

  return { food: profile.module === 'food', taxi: profile.module === 'taxi', global: false }
}

export function getFirstGlobalPath(profile = readAdminProfile()) {
  const section = GLOBAL_SECTIONS.find((item) => hasGlobalSection(profile, item.key))
  return section ? section.path : ''
}

/** Where an admin lands after signing in, or when it opens a part of the panel it has no access to. */
export function getAdminHomePath(profile = readAdminProfile()) {
  if (isPlatformAdmin(profile)) return FOOD_ADMIN_HOME

  const access = getModuleAccess(profile)
  const globalPath = access.global ? getFirstGlobalPath(profile) : ''
  if (globalPath) return globalPath
  if (access.food) return FOOD_ADMIN_HOME
  if (access.taxi) return TAXI_ADMIN_HOME
  return '/admin/login'
}
