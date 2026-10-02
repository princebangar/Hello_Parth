import lazyPreloaded from './lazyPreloaded.js';

/**
 * The big app shells, as preloadable lazy components. Every place that renders one of them uses these (not its own
 * React.lazy), so a single `preload()` - from the idle warm-up in activeModule.js - makes the next switch (Food <->
 * Taxi, Food admin <-> Taxi admin) render at once instead of passing through a Suspense fallback.
 */
export const FoodApp = lazyPreloaded(() => import('../../modules/Food/routes.jsx'));
export const FoodUserRouter = lazyPreloaded(() => import('../../modules/Food/components/user/UserRouter.jsx'));
export const TaxiApp = lazyPreloaded(() => import('../../modules/Taxi/TaxiApp.jsx'));
export const FoodAdminRouter = lazyPreloaded(() => import('../../modules/Food/components/admin/AdminRouter.jsx'));
