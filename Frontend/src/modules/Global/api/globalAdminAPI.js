import apiClient from "@food/api/axios"
import { getPageCache, setPageCache } from "@/shared/utils/pageCache.js"

const admin = { contextModule: "admin" }

/** Global admin API (/api/v1/admin/global/*). Uses the admin token like the Food / Taxi admin calls. */
export const globalAdminAPI = {
  getSubAdmins: (params = {}) => apiClient.get("/admin/global/sub-admins", { params, ...admin }),
  getSubAdminScopeOptions: () => apiClient.get("/admin/global/sub-admins/scope-options", admin),
  getSubAdminById: (id) => apiClient.get(`/admin/global/sub-admins/${String(id)}`, admin),
  createSubAdmin: (body) => apiClient.post("/admin/global/sub-admins", body, admin),
  updateSubAdmin: (id, body) => apiClient.patch(`/admin/global/sub-admins/${String(id)}`, body, admin),
  updateSubAdminStatus: (id, isActive) =>
    apiClient.patch(`/admin/global/sub-admins/${String(id)}/status`, { isActive: isActive !== false }, admin),
  resetSubAdminPassword: (id, newPassword) =>
    apiClient.patch(`/admin/global/sub-admins/${String(id)}/password`, { newPassword }, admin),
  updateSubAdminAccess: (id, body) =>
    apiClient.patch(`/admin/global/sub-admins/${String(id)}/access`, body, admin),
  deleteSubAdmin: (id) => apiClient.delete(`/admin/global/sub-admins/${String(id)}`, admin),

  getCustomers: (params = {}) => apiClient.get("/admin/global/customers", { params, ...admin }),
  getCustomerById: (id) => apiClient.get(`/admin/global/customers/${String(id)}`, admin),
  updateCustomerStatus: (id, isActive) =>
    apiClient.patch(`/admin/global/customers/${String(id)}/status`, { isActive: isActive !== false }, admin),

  getCustomizationSettings: () => apiClient.get("/admin/global/customization", admin),
  updatePaymentGateways: (body) => apiClient.patch("/admin/global/customization/payment-gateways", body, admin),
  updateReferral: (enabled) => apiClient.patch("/admin/global/customization/referral", { enabled }, admin),

  getOtherServices: () => apiClient.get("/admin/global/landing/other-services", admin),
  createOtherService: (body) => apiClient.post("/admin/global/landing/other-services", body, admin),
  updateOtherService: (id, body) =>
    apiClient.patch(`/admin/global/landing/other-services/${String(id)}`, body, admin),
  deleteOtherService: (id) => apiClient.delete(`/admin/global/landing/other-services/${String(id)}`, admin),
  uploadOtherServiceImage: (file, previousUrl) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("folder", "landing/other-services")
    if (previousUrl) formData.append("replaceUrl", previousUrl)
    return apiClient.post("/uploads/image", formData, admin)
  },
}

/** Last Customization Settings seen in this tab: the page shows them at once while fresh ones load. */
export const CUSTOMIZATION_CACHE_KEY = "global_admin_customization"

/**
 * Warm the Customization Settings page: called when the Global admin opens, so by the time the admin clicks
 * "Customization Settings" the answer is already here (the page reads it from the cache and refreshes quietly).
 */
export const prefetchCustomizationSettings = () => {
  if (getPageCache(CUSTOMIZATION_CACHE_KEY)) return Promise.resolve()
  return globalAdminAPI
    .getCustomizationSettings()
    .then((response) => {
      const data = response?.data?.data
      if (data) setPageCache(CUSTOMIZATION_CACHE_KEY, data)
    })
    .catch(() => {})
}

/** Public "Other Service" cards for the marketing landing page (no auth). */
export const publicLandingAPI = {
  getOtherServices: () => apiClient.get("/landing/other-services"),
}

/** Server message from an axios error, for toasts. */
export const apiErrorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback
