import { useState } from "react"
import { Loader2 } from "lucide-react"

// The one loader every Terms / Privacy / Support screen shows - as the route fallback while the page's chunk
// downloads AND while its text loads - so going from a login screen to a policy is a single loader, never a
// skeleton followed by a loader. The spinner starts at the phase the page clock is at, so when this loader is
// swapped for an identical one (fallback -> page) the rotation carries on instead of restarting.
export default function PolicyPageLoader() {
  const [spinOffset] = useState(() =>
    typeof performance === "undefined" ? 0 : -Math.round(performance.now() % 1000),
  )

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6 bg-white dark:bg-[#0a0a0a]"
    >
      <Loader2
        className="h-10 w-10 animate-spin text-[#CB202D]"
        style={{ animationDelay: `${spinOffset}ms` }}
      />
      <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">
        Loading...
      </p>
    </div>
  )
}
