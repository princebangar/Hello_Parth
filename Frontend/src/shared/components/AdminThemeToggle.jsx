import { useLayoutEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { Moon, Sun } from "lucide-react"
import { getAppRoutePath } from "@/shared/utils/nativeShell"
import "./adminTheme.css"

const KEY = (scope) => `admin_theme_${scope}`

const readDark = (scope) => {
  try {
    return localStorage.getItem(KEY(scope)) === "dark"
  } catch {
    return false
  }
}

/**
 * Light / dark switch for one admin panel. `scope` is "food", "taxi" or "global" - each panel remembers its own choice,
 * so turning Food dark never changes Taxi or Global.
 * While the panel is on screen the choice is written to <html class="admin-dark">. Food and Taxi admin stay mounted
 * (one hidden) for instant tab switches, so only the toggle that is actually visible applies its theme.
 * The switch itself flips the class straight away and plays a circle reveal from the bottom-left corner.
 */
export default function AdminThemeToggle({ scope, className = "" }) {
  const [dark, setDark] = useState(() => readDark(scope))
  const ref = useRef(null)
  const location = useLocation()

  // Runs whenever this panel (re)appears or navigates: if it is the visible one, its own choice becomes the page theme.
  useLayoutEffect(() => {
    if (!ref.current || ref.current.getClientRects().length === 0) return
    const isDark = readDark(scope)
    document.documentElement.classList.toggle("admin-dark", isDark)
    setDark(isDark)
  }, [scope, location])

  // Leaving the admin area completely: back to the normal (light) app.
  useLayoutEffect(
    () => () => {
      const path = getAppRoutePath()
      if (!(path.startsWith("/admin") || path.startsWith("/taxi/admin"))) {
        document.documentElement.classList.remove("admin-dark", "admin-theme-transition")
      }
    },
    [],
  )

  const toggle = () => {
    const root = document.documentElement
    const next = !root.classList.contains("admin-dark")
    const apply = () => {
      try {
        localStorage.setItem(KEY(scope), next ? "dark" : "light")
      } catch {
        /* ignore */
      }
      root.classList.toggle("admin-dark", next)
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (!document.startViewTransition || reduce) {
      apply()
      setDark(next)
      return
    }
    root.classList.add("admin-theme-transition")
    const t = document.startViewTransition(apply)
    t.ready
      .then(() => {
        const r = Math.hypot(window.innerWidth, window.innerHeight)
        root.animate(
          { clipPath: [`circle(0px at 0px ${window.innerHeight}px)`, `circle(${r}px at 0px ${window.innerHeight}px)`] },
          { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
        )
      })
      .catch(() => {})
    t.finished.finally(() => {
      root.classList.remove("admin-theme-transition")
      setDark(next)
    })
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 ${className}`}
    >
      <Sun className="admin-theme-icon admin-theme-sun absolute h-[18px] w-[18px]" />
      <Moon className="admin-theme-icon admin-theme-moon absolute h-[18px] w-[18px]" />
    </button>
  )
}
