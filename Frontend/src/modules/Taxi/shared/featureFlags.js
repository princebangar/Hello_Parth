/**
 * Master switch for the Taxi Car Pooling end-to-end product surface.
 * Code-level only (not admin-panel configurable).
 *
 * When false:
 * - Admin "Car Pooling" submenu is hidden
 * - User pooling routes / home grid entry are disabled
 * - Activity "Pooling" tab and reminder sync are disabled
 * - Driver onboarding cannot select pooling as a service category
 *
 * Flip to true to re-enable without hunting commented blocks.
 */
export const POOLING_ENABLED = true
