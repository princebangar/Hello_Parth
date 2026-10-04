import { useEffect, useRef } from 'react'

/**
 * While a sheet / modal is open, the device or browser Back button closes just that sheet instead of leaving the
 * page. Opening pushes one history entry (same router state, so the router sees no navigation); closing from the UI
 * removes that entry again.
 */
export default function useCloseOnBack(isOpen, onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const unmountingRef = useRef(false)

  useEffect(
    () => () => {
      unmountingRef.current = true
    },
    [],
  )

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined
    const key = `overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.history.pushState({ ...(window.history.state || {}), __overlay: key }, '')
    let handled = false

    const onPop = () => {
      handled = true
      closeRef.current?.()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      if (!handled && !unmountingRef.current && window.history.state?.__overlay === key) {
        window.history.back()
      }
    }
  }, [isOpen])
}
