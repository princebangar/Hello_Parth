/**
 * One URL for the push service worker, used by every place that registers it (Food, Taxi, login).
 *
 * The Firebase web config travels in the URL's query string, so the worker starts with it already in hand - also
 * when the browser wakes it for a push while no page is open. Before, the worker had to ask the backend for the
 * config every time it started, and the backend does not hold the web keys (they live in Frontend/.env) - that
 * lookup came back empty and the worker kept trying other, non-existent URLs (the repeated 404 in the Network tab).
 *
 * Keep the parameter list and order fixed: a different URL for the same scope makes the browser treat it as a new
 * worker and replace the running one.
 */
const SERVICE_WORKER_VERSION = '20261002';
const CONFIG_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

export function buildMessagingServiceWorkerUrl(config = {}) {
  const params = new URLSearchParams();
  CONFIG_FIELDS.forEach((field) => {
    const value = String(config?.[field] ?? '').trim();
    if (value) params.set(field, value);
  });
  params.set('v', SERVICE_WORKER_VERSION);
  return `/firebase-messaging-sw.js?${params.toString()}`;
}
