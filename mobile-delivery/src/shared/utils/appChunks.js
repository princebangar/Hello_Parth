// The web split each app into lazily loaded chunks and warmed them up ahead of time (activeModule.js calls
// X.preload()). In the app every screen is already in the bundle, so preloading has nothing to do.
const ready = { preload: () => Promise.resolve() }

export const FoodApp = ready
export const FoodUserRouter = ready
export const TaxiApp = ready
export const FoodAdminRouter = ready
