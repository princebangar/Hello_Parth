const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isBrowser = typeof window !== 'undefined';
const isBrowserLocal = isBrowser && LOCAL_HOSTS.has(window.location.hostname);

// Vite proxies /api/v1 to the backend, but Socket.IO must target the backend origin directly in local dev.
const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

/** Origin only — for sockets / assets. Never use this for API base (it drops /api/v1). */
const sanitizeHost = (urlStr) => {
  if (!urlStr || typeof urlStr !== 'string') return '';
  const trimmed = urlStr.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return '';
    if (isBrowser && !isBrowserLocal) {
      if (LOCAL_HOSTS.has(parsed.hostname)) {
        return window.location.origin;
      }
    }
    return parsed.origin;
  } catch (_) {
    return '';
  }
};

const DEFAULT_BACKEND_ORIGIN = isBrowser ? window.location.origin : 'http://localhost:5000';

/**
 * Resolve API base from VITE_API_BASE_URL while preserving pathname (/api/v1).
 * Previous sanitizeHost-only path stripped /api/v1 → http://localhost:5000/taxi (404 HTML).
 */
const resolveApiBase = () => {
  const rawEnvBase = import.meta.env.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : '/api/v1';

  if (/^https?:\/\//i.test(rawEnvBase)) {
    try {
      const parsed = new URL(rawEnvBase);
      let origin = parsed.origin;
      if (isBrowser && !isBrowserLocal && LOCAL_HOSTS.has(parsed.hostname)) {
        origin = window.location.origin;
      }
      const path = trimTrailingSlash(parsed.pathname || '');
      if (path && path !== '/') {
        return `${origin}${path}`;
      }
      return `${origin}/api/v1`;
    } catch (_) {
      return `${DEFAULT_BACKEND_ORIGIN}/api/v1`;
    }
  }

  if (rawEnvBase.startsWith('/')) {
    return `${DEFAULT_BACKEND_ORIGIN}${trimTrailingSlash(rawEnvBase)}`;
  }

  return `${DEFAULT_BACKEND_ORIGIN}/api/v1`;
};

const rawApiBase = trimTrailingSlash(resolveApiBase());

export const API_BASE_URL = trimTrailingSlash(
  rawApiBase.endsWith('/taxi') ? rawApiBase : `${rawApiBase}/taxi`
);

export const BACKEND_ORIGIN = trimTrailingSlash(
  sanitizeHost(import.meta.env.VITE_BACKEND_ORIGIN) ||
  sanitizeHost(import.meta.env.VITE_SOCKET_URL) ||
  sanitizeHost(import.meta.env.VITE_ASSET_BASE_URL) ||
  (API_BASE_URL.startsWith('http') ? API_BASE_URL.replace(/\/api(?:\/v1)?(?:\/taxi)?$/, '') : DEFAULT_BACKEND_ORIGIN) ||
  DEFAULT_BACKEND_ORIGIN
);

export const BACKEND_LABEL = BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN;
