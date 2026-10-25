import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useLocation } from '@/lib/router'
import { BootShellBody, BootShellHeader } from './BootShell'

export const SWITCH_VERTICAL_EVENT = 'helloparth:switch-vertical'
// Taxi home sends this once its service tiles are on screen: the Taxi skeleton stays up until then.
export const TAXI_HOME_READY_EVENT = 'helloparth:taxi-home-ready'
const TAXI_MAX_WAIT_MS = 2500

const MAX_SHOWN_MS = 6000

// Verticals opened at least once in this app session. The skeleton is for the FIRST time only: after that the screen
// builds from what it already has (its cached data) and no placeholder is put in front of it.
const visited = new Set()
export const hasVisitedVertical = (id) => visited.has(id)

/**
 * The Taxi <-> Food switch: the destination's real header and loading skeleton go up in the very frame after the tap,
 * BEFORE the other app starts to build, so the old screen never just freezes and jumps. The switcher's highlight slides
 * in the header shown here. It goes away once the destination screen is in place.
 * Rendered once by src/appstore/AppShell.jsx above every screen (the web portalled it into <body>).
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
    if (to === 'taxi') {
      const done = () => setTo(null)
      window.addEventListener(TAXI_HOME_READY_EVENT, done)
      const cap = setTimeout(done, TAXI_MAX_WAIT_MS)
      return () => {
        window.removeEventListener(TAXI_HOME_READY_EVENT, done)
        clearTimeout(cap)
      }
    }
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

  if (!to) return null

  // the web's inline background (the same in light and dark mode; only the skeleton blocks follow the theme)
  const background = to === 'food' ? '#ffffff' : '#EEF2F7'

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10050, elevation: 50, overflow: 'hidden', backgroundColor: background }]}>
      <BootShellHeader vertical={to} />
      <BootShellBody vertical={to} />
    </View>
  )
}
