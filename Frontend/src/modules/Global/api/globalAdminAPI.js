import apiClient from "@food/api/axios"

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
}

/** Server message from an axios error, for toasts. */
export const apiErrorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback
