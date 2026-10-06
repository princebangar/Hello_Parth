// A new version of the app replaces the files of the old one on the server. A phone that still runs the old page then
// asks for a screen's file (e.g. the vehicle list the moment a drop is picked) that no longer exists: the screen can
// not load and the whole app went blank. The fix is to load the new page - once, never in a loop.
const RELOAD_KEY = 'helloparth:chunk-reload-at'
const MIN_GAP_MS = 30 * 1000

export const isChunkLoadError = (error) =>
  /dynamically imported module|importing a module script failed|unable to preload css|error loading dynamically|loading chunk|loading css chunk/i.test(
    String(error?.message || error || ''),
  )

export function reloadForNewVersion() {
  if (typeof window === 'undefined') return false
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < MIN_GAP_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // storage blocked: reload anyway, once per page life is all this call site can do
  }
  window.location.reload()
  return true
}
