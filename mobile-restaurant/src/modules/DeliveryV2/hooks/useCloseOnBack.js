import { useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'

/**
 * While a sheet / modal is open, the device Back button closes just that sheet instead of leaving the page.
 * (Web: pushed one history entry and closed on `popstate`; here Android's Back press is handled while it is open.)
 */
export default function useCloseOnBack(isOpen, onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!isOpen) return undefined
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current?.()
      return true
    })
    return () => sub.remove()
  }, [isOpen])
}
