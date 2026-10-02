/**
 * A small pulsing bar in place of a number that is still loading (counts, totals, balances), instead of showing a wrong
 * "0" first and the real number a moment later. It takes the text colour of the spot it sits in, so it fits light and
 * dark cards alike.
 */
export default function NumberSkeleton({ width = '1.6em', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-[0.9em] animate-pulse rounded-md bg-current align-[-0.1em] opacity-20 ${className}`}
      style={{ width }}
    />
  )
}
