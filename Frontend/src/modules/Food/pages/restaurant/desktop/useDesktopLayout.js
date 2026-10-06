import { useEffect, useState } from "react"
import { isNativeLikeShell } from "@/shared/utils/nativeShell"

const DESKTOP_QUERY = "(min-width: 1024px)"

/**
 * True only for the browser dashboard on laptop / tablet-landscape / desktop screens.
 * The Flutter app (WebView) and every phone / small-tablet screen keep the mobile UI untouched.
 */
export default function useDesktopLayout() {
  const read = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DESKTOP_QUERY).matches &&
    !isNativeLikeShell()

  const [isDesktop, setIsDesktop] = useState(read)

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setIsDesktop(read())
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}
