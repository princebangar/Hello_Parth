import { API_ENDPOINTS } from "@food/api/config"

// Terms / Privacy / Support screens (customer, restaurant, delivery partner, Taxi captain). Their text is static,
// so:
//   - the last copy is kept per page (memory + localStorage): reopening shows it at once and refreshes quietly;
//   - the login screens fetch it, and download the page code, in the background while the person types their
//     number, so tapping TERMS / PRIVACY / SUPPORT opens the page without waiting.

// ---------------------------------------------------------------- page text cache

const CACHE_PREFIX = "policy_page_v1:"
const memory = new Map() // endpoint -> normalized page
const inFlight = new Map() // endpoint -> Promise<normalized page | null>

/** The two response shapes the CMS endpoints use ({ content } or { data: { content } }) -> one page object. */
export const normalizePolicyResponse = (response) => {
  const data = response?.data?.data || response?.data
  if (!data || typeof data !== "object") return null

  const source =
    "content" in data
      ? data
      : data.data && typeof data.data === "object" && "content" in data.data
        ? data.data
        : null
  if (!source) return null

  return {
    title: source.title || "",
    content: source.content || "",
    email: source.email || "",
    mobile: source.mobile || "",
    faq: source.faq || "",
  }
}

/** Last known copy of a policy page, or null. */
export const readPolicyPage = (endpoint) => {
  if (!endpoint) return null
  if (memory.has(endpoint)) return memory.get(endpoint)
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${endpoint}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    memory.set(endpoint, parsed)
    return parsed
  } catch {
    return null
  }
}

const writePolicyPage = (endpoint, page) => {
  memory.set(endpoint, page)
  try {
    localStorage.setItem(`${CACHE_PREFIX}${endpoint}`, JSON.stringify(page))
  } catch {
    // storage full / blocked: the in-memory copy still works
  }
}

/** Loads the page from the server (one request even if asked twice) and remembers it. Never throws. */
export const fetchPolicyPage = (endpoint) => {
  if (!endpoint) return Promise.resolve(null)
  if (inFlight.has(endpoint)) return inFlight.get(endpoint)

  const request = import("@food/api/axios")
    .then(({ default: apiClient }) => apiClient.get(endpoint))
    .then((response) => {
      const page = normalizePolicyResponse(response)
      if (page) writePolicyPage(endpoint, page)
      return page
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(endpoint)
    })

  inFlight.set(endpoint, request)
  return request
}

// ---------------------------------------------------------------- background warm-up for the login screens

const ADMIN = API_ENDPOINTS.ADMIN

const POLICY_WARMUP = {
  user: {
    endpoints: [ADMIN.TERMS_PUBLIC, ADMIN.PRIVACY_PUBLIC, ADMIN.SUPPORT_USER_PUBLIC],
    // Same specifiers as the lazy() imports in the routers, so the browser reuses the downloaded chunks.
    chunks: [
      () => import("@food/components/user/UserRouter"),
      () => import("@food/pages/user/profile/Terms"),
      () => import("@food/pages/user/profile/Privacy"),
      () => import("@food/pages/user/profile/UserCMSHelpSupportPage"),
    ],
  },
  restaurant: {
    endpoints: [ADMIN.TERMS_RESTAURANT_PUBLIC, ADMIN.PRIVACY_RESTAURANT_PUBLIC, ADMIN.SUPPORT_RESTAURANT_PUBLIC],
    chunks: [
      () => import("@food/pages/restaurant/TermsAndConditionsPage"),
      () => import("@food/pages/restaurant/PrivacyPolicyPage"),
      () => import("@food/pages/restaurant/CMSHelpSupportPage"),
    ],
  },
  delivery: {
    // the delivery policy pages ship inside the delivery bundle that the login screen already loaded
    endpoints: [ADMIN.TERMS_DELIVERY_PUBLIC, ADMIN.PRIVACY_DELIVERY_PUBLIC, ADMIN.SUPPORT_DELIVERY_PUBLIC],
    chunks: [],
  },
  driver: {
    endpoints: [ADMIN.TERMS_DRIVER_PUBLIC, ADMIN.PRIVACY_DRIVER_PUBLIC, ADMIN.SUPPORT_DRIVER_PUBLIC],
    chunks: [
      () => import("../../modules/Taxi/modules/shared/pages/DriverLegalTerms"),
      () => import("../../modules/Taxi/modules/shared/pages/DriverLegalPrivacy"),
      () => import("../../modules/Taxi/modules/shared/pages/DriverLegalSupport"),
    ],
  },
}

const shouldSaveData = () => {
  try {
    return Boolean(navigator.connection?.saveData)
  } catch {
    return false
  }
}

/**
 * Warms one login screen's three policy pages (text + page code) once the browser is idle. Returns a cleanup
 * function for useEffect. Kinds: "user" | "restaurant" | "delivery" | "driver".
 */
export const prefetchPolicyContentWhenIdle = (kind) => {
  const plan = POLICY_WARMUP[kind]
  if (!plan || typeof window === "undefined" || shouldSaveData()) return () => {}

  const run = () => {
    plan.endpoints.forEach((endpoint) => {
      fetchPolicyPage(endpoint)
    })
    plan.chunks.forEach((load) => {
      load().catch(() => {})
    })
  }

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 3000 })
    return () => window.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(run, 1200)
  return () => window.clearTimeout(id)
}
