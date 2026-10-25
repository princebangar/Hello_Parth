/**
 * The last value a screen showed for a number or a small list (trip count, bus routes, balance ...).
 *
 * Kept per signed-in customer in localStorage, so the next visit - even after the app was closed - shows it straight away
 * and only swaps it when the fresh value arrives. Before anything is known the screen shows a NumberSkeleton, never a
 * made-up 0. Keyed by account, so one account's numbers are never shown to another.
 */
const STORAGE_KEY = 'helloparth:lastKnown'
const MAX_STORED_CHARS = 60000 // a bigger value stays in memory only
const MEMORY = new Map()

const owner = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user_user') || localStorage.getItem('userInfo') || 'null')
    return String(user?._id || user?.id || 'guest')
  } catch {
    return 'guest'
  }
}

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

/** The remembered value, or undefined when this screen has never loaded it for this account. */
export function recallLastKnown(key) {
  const fullKey = `${owner()}:${key}`
  if (MEMORY.has(fullKey)) return MEMORY.get(fullKey)
  const value = readAll()[fullKey]
  if (value !== undefined) MEMORY.set(fullKey, value)
  return value
}

export function rememberLastKnown(key, value) {
  const fullKey = `${owner()}:${key}`
  MEMORY.set(fullKey, value)
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined || serialized.length > MAX_STORED_CHARS) return
    const all = readAll()
    all[fullKey] = value
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // storage full / private mode: memory still works for this session
  }
}
