import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { BootShellBody, BootShellHeader } from './BootShell'

export const SWITCH_VERTICAL_EVENT = 'helloparth:switch-vertical'

const MAX_SHOWN_MS = 6000

// Verticals opened at least once in this app session. The skeleton is for the FIRST time only: after that the screen
// builds from what it already has (its cached data) and no placeholder is put in front of it.
const visited = new Set()
export const hasVisitedVertical = (id) => visited.has(id)

/**
 * The Taxi <-> Food switch, on a phone: the destination's real header and loading skeleton go up in the very frame
 * after the tap, BEFORE the other app starts to build. Building a whole home screen is one long piece of work on the
 * page; without this the old screen simply stayed frozen for a second or two and then jumped. The switcher's
 * highlight slides in the header shown here. It goes away once the destination screen is in place.
 */
export default function VerticalSwitchOverlay() {
  const [to, setTo] = useState(null)
  const { pathname } = useLocation()

  useEffect(() => {
    if (pathname.startsWith('/food/')) visited.add('food')
    else if (pathname.startsWith('/taxi/user')) visited.add('taxi')
  }, [pathname])

  useEffect(() => {
    const onSwitch = (event) => {
      const next = event.detail?.to || null
      setTo(next && !visited.has(next) ? next : null)
    }
    window.addEventListener(SWITCH_VERTICAL_EVENT, onSwitch)
    return () => window.removeEventListener(SWITCH_VERTICAL_EVENT, onSwitch)
  }, [])

  // The destination is committed: let it paint once, then take the placeholder away.
  useEffect(() => {
    if (!to || !pathname.startsWith(`/${to}/`)) return undefined
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setTo(null))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [to, pathname])

  // never leave it covering the app if the navigation did not happen
  useEffect(() => {
    if (!to) return undefined
    const timer = setTimeout(() => setTo(null), MAX_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [to])

  if (!to || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        overflow: 'hidden',
        background: to === 'food' ? '#ffffff' : '#EEF2F7',
      }}
    >
      <BootShellHeader vertical={to} />
      <BootShellBody vertical={to} />
    </div>,
    document.body,
  )
}
