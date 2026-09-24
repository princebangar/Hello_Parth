// Food's own skeleton, reused as-is — one skeleton design for every loading
// boundary in the app (Food's, and here, Taxi's route/tab Suspense
// fallbacks) instead of a separate look-alike per app. It already themes
// itself via Tailwind's `dark:` classes off the shared `<html class="dark">`
// toggle, so no theme prop needs to be threaded in here.
export { AppShellSkeleton as default } from '@food/components/ui/loading-skeletons';
