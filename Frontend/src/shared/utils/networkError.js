// One wording for "the request never reached the server". Screens used to tell users and admins things like
// "Cannot connect to backend server. Please ensure the backend is running on http://..." even when the only problem
// was that the phone / laptop had no internet.

export const NO_INTERNET_MESSAGE = "No internet connection. Please check your connection and try again."
export const SERVER_UNREACHABLE_MESSAGE = "Could not reach the server. Please try again in a moment."

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false

// axios: no response at all (network down, DNS, CORS, server not reachable)
export const isNetworkError = (error) =>
  Boolean(error) && !error.response && (error.code === "ERR_NETWORK" || /network error/i.test(String(error.message || "")) || Boolean(error.request))

export const networkErrorMessage = () => (isOffline() ? NO_INTERNET_MESSAGE : SERVER_UNREACHABLE_MESSAGE)
