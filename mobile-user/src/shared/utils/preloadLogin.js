// The web downloaded the /login screen's two lazy chunks ahead of time so a logout never showed a blank frame.
// In the app the login screen is part of the bundle: there is nothing to download, so every loader resolves at once.
// Same exports as the web file, so the callers (profile / settings / delete-account screens) stay unchanged.
const done = Promise.resolve()

export const loadAuthApp = () => done
export const loadLoginPage = () => done

/** Never rejects. */
export const preloadAuthApp = () => done

/** Returns a cleanup function, like the web's whenAppSettled-based version. */
export const preloadAuthAppWhenIdle = () => () => {}
