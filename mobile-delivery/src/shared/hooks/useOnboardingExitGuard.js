import { useCallback, useRef, useState } from "react"
import { BackHandler } from "react-native"
import { useFocusEffect } from "expo-router"

/**
 * Guards onboarding exit on the first step only.
 * Later steps call onPreviousStep so saved progress is kept when navigating back.
 */
export default function useOnboardingExitGuard({
  isFirstStep,
  onPreviousStep,
  onExit,
  hasUnsavedProgress = () => true,
}) {
  const [showExitModal, setShowExitModal] = useState(false)

  const handleStay = useCallback(() => {
    setShowExitModal(false)
  }, [])

  const handleExit = useCallback(() => {
    onExit?.()
  }, [onExit])

  const requestExit = useCallback(() => {
    if (hasUnsavedProgress()) {
      setShowExitModal(true)
      return
    }

    onExit?.()
  }, [hasUnsavedProgress, onExit])

  const handleBack = useCallback(() => {
    if (isFirstStep) {
      requestExit()
      return
    }

    onPreviousStep?.()
  }, [isFirstStep, onPreviousStep, requestExit])

  // Latest values for the back-button listener (web: a popstate listener with a pushed history entry; callers pass
  // fresh functions on every render, so the listener reads them from a ref instead of being re-created).
  const latestRef = useRef({ isFirstStep, onPreviousStep, requestExit })
  latestRef.current = { isFirstStep, onPreviousStep, requestExit }

  // Android back button / gesture: same as the web's browser back on these screens (previous step, or the exit popup on
  // the first step). Returning true keeps the screen. Only while this screen is the one in front (a screen further down the
  // stack must not answer the back button of the screen above it).
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const { isFirstStep: first, onPreviousStep: previous, requestExit: exit } = latestRef.current
      if (first) {
        exit()
        return true
      }

      previous?.()
      return true
    })
    return () => sub.remove()
  }, []))

  return {
    showExitModal,
    handleBack,
    handleStay,
    handleExit,
    requestExit,
  }
}
