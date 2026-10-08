import { createContext, useContext, useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { clearAdminPartnerScope, setAdminPartnerScope } from "@food/utils/adminPartnerScope"

const PartnerTypeContext = createContext("restaurant")

/** "restaurant" | "store" — what the surrounding admin page is about (for labels). */
export const usePartnerType = () => {
  const ctx = useContext(PartnerTypeContext)
  const { pathname } = useLocation()
  // The My Store routes are the source of truth, so the wording stays right even if the context is missing.
  return /\/my-store(\/|$)/.test(pathname) ? "store" : ctx
}

/**
 * Wraps an admin page that exists for both Restaurant Partners and My Store (same component, different
 * route). Sets the scope during render (so the page's first data fetch already sees it) and releases it a
 * moment after the page goes away, unless the page is mounted again (React StrictMode re-runs effects) or the
 * next page has already taken the scope over.
 */
export default function PartnerScope({ type = "restaurant", children }) {
  const tokenRef = useRef(null)
  const mountedRef = useRef(false)
  if (tokenRef.current === null) tokenRef.current = Symbol("partner-scope")
  setAdminPartnerScope(type, tokenRef.current)

  useEffect(() => {
    const token = tokenRef.current
    mountedRef.current = true
    setAdminPartnerScope(type, token)
    return () => {
      mountedRef.current = false
      setTimeout(() => {
        if (!mountedRef.current) clearAdminPartnerScope(token)
      }, 0)
    }
  }, [type])

  return <PartnerTypeContext.Provider value={type}>{children}</PartnerTypeContext.Provider>
}
