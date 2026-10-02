/**
 * Loading placeholder for the Taxi customer screens (Rides, Profile, Support, Wallet, Bus, ride steps ...), shaped like
 * the screen that is opening.
 *
 * The drawing itself lives in index.html (window.__taxiPageSkeleton): that is what paints the very first frame after a
 * refresh, before any of the app's JavaScript has arrived. Rendering the very same markup here means the first paint,
 * this placeholder and the screen's own loading state are one skeleton - never a blank page, never two designs.
 */
const draw = (variant) => {
  try {
    return typeof window !== 'undefined' && typeof window.__taxiPageSkeleton === 'function' ? window.__taxiPageSkeleton(variant) : ''
  } catch {
    return ''
  }
}

export default function TaxiPageSkeleton({ variant = 'page' }) {
  return <div role="status" aria-live="polite" aria-label="Loading" dangerouslySetInnerHTML={{ __html: draw(variant) }} />
}

/** Which placeholder belongs to a Taxi address (same rule index.html uses). */
export function taxiSkeletonVariant(pathname = '') {
  try {
    return typeof window !== 'undefined' && typeof window.__taxiSkeletonVariant === 'function' ? window.__taxiSkeletonVariant(pathname) : 'page'
  } catch {
    return 'page'
  }
}
