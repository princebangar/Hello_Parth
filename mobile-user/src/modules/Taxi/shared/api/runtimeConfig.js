// Taxi API / socket endpoints. The web resolved them from VITE_API_BASE_URL and fell back to window.location.origin
// (the site the page was served from). The app always talks to the production backend: base
// https://helloparth.in/api/v1/taxi, socket origin https://helloparth.in (overridable via EXPO_PUBLIC_* in config/env).
import { ENV } from '@/config/env';

const PRODUCTION_ORIGIN = 'https://helloparth.in';
const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

/** Origin only — for sockets / assets. Never use this for API base (it drops /api/v1). */
const sanitizeHost = (urlStr) => {
  if (!urlStr || typeof urlStr !== 'string') return '';
  const trimmed = urlStr.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return '';
    return parsed.origin;
  } catch (_) {
    return '';
  }
};

const resolveApiBase = () => {
  const rawEnvBase = String(ENV.VITE_API_BASE_URL || '').trim();
  if (/^https?:\/\//i.test(rawEnvBase)) {
    try {
      const parsed = new URL(rawEnvBase);
      const path = trimTrailingSlash(parsed.pathname || '');
      return path && path !== '/' ? `${parsed.origin}${path}` : `${parsed.origin}/api/v1`;
    } catch (_) {
      // fall through
    }
  }
  return `${PRODUCTION_ORIGIN}/api/v1`;
};

const rawApiBase = trimTrailingSlash(resolveApiBase());

export const API_BASE_URL = trimTrailingSlash(rawApiBase.endsWith('/taxi') ? rawApiBase : `${rawApiBase}/taxi`);

const originFromApiBase = API_BASE_URL.replace(/\/api(?:\/v1)?(?:\/taxi)?$/, '');

export const BACKEND_ORIGIN = trimTrailingSlash(
  sanitizeHost(ENV.VITE_BACKEND_ORIGIN) || sanitizeHost(ENV.VITE_SOCKET_URL) || sanitizeHost(originFromApiBase) || PRODUCTION_ORIGIN,
);

export const BACKEND_LABEL = BACKEND_ORIGIN;
