/**
 * Maintenance lock is for LIVE users only.
 * Local `npm run dev` / localhost UI never shows the page when it talks to a SHARED / live backend, even when that
 * backend has maintenance on. When the local UI talks to a local backend (VITE_API_BASE_URL on localhost) the
 * screen is shown, so the switches can be tested.
 *
 * Backend also bypasses API lock for localhost Origin / X-HelloParth-Client: local-dev
 * so local frontend + same live API keep working.
 *
 * Optional local preview: VITE_FORCE_MAINTENANCE=true or ?forceMaintenance=1
 */
export function shouldEnforceMaintenanceOnClient() {
  try {
    if (typeof window === "undefined") return false;

    const params = new URLSearchParams(window.location.search || "");
    if (params.get("forceMaintenance") === "1") return true;
    if (String(import.meta.env.VITE_FORCE_MAINTENANCE || "").toLowerCase() === "true") {
      return true;
    }

    const isLocalHost = (host) =>
      host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local");

    const pageHost = String(window.location.hostname || "").toLowerCase();
    if (import.meta.env.DEV || isLocalHost(pageHost)) {
      // Local UI: lock only when the API it uses is also local (own test backend), never a shared live one.
      try {
        const api = String(import.meta.env.VITE_API_BASE_URL || "");
        return isLocalHost(new URL(api, window.location.origin).hostname.toLowerCase()) && api.startsWith("http");
      } catch {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
