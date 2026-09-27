import { BACKEND_ORIGIN } from './runtimeConfig';

/**
 * ~25 admin screens carried over from the old standalone Taxi project call
 *   fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/...`, { headers: { Authorization: `Bearer ${localStorage.adminToken}` } })
 * In this merged app the same endpoints live under /api/v1/taxi/... and the admin token is stored by the
 * shared admin login (`admin_accessToken`). This shim keeps those screens working without touching each one:
 *  - it publishes a marker origin the legacy code builds its URLs from,
 *  - a fetch wrapper rewrites only URLs carrying that marker to the real Taxi API,
 *  - and fills in the admin Bearer token when the page sent none (or sent "Bearer null").
 * Nothing else that uses fetch (Food, uploads, third parties) is affected.
 */
const SHIM_FLAG = '__LEGACY_BACKEND_SHIM_INSTALLED__';
const LEGACY_MARKER = `${BACKEND_ORIGIN}/__legacy_taxi__`;

const readAdminToken = () => {
  try {
    return localStorage.getItem('adminToken') || localStorage.getItem('admin_accessToken') || '';
  } catch {
    return '';
  }
};

const toRealUrl = (url) => `${BACKEND_ORIGIN}/api/v1/taxi${url.slice(LEGACY_MARKER.length).replace(/^\/api\/v1/, '')}`;

export const installLegacyBackendShim = () => {
  if (globalThis[SHIM_FLAG]) {
    return;
  }

  globalThis[SHIM_FLAG] = true;
  globalThis.__LEGACY_BACKEND_ORIGIN__ = LEGACY_MARKER;

  if (typeof globalThis.fetch !== 'function') {
    return;
  }

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';

    if (!url.startsWith(LEGACY_MARKER)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(init?.headers || {});
    const current = String(headers.get('Authorization') || '').trim();
    if (!current || /^Bearer\s*(null|undefined)?$/i.test(current)) {
      const token = readAdminToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    return nativeFetch(toRealUrl(url), { ...init, headers });
  };
};
