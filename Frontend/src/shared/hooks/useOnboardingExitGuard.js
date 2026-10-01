import { useCallback, useEffect, useRef, useState } from "react"

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

  // Latest values for the popstate listener. The listener used to be re-created
  // (and a new history entry pushed) on every render because callers pass fresh
  // functions each time — the history stack piled up (19 entries after two
  // screens), so the phone's back button needed many taps and finally fell
  // through to the app's "exit app" popup instead of the previous step.
  const latestRef = useRef({ isFirstStep, onPreviousStep, requestExit })
  latestRef.current = { isFirstStep, onPreviousStep, requestExit }

  useEffect(() => {
    window.history.pushState(null, "", window.location.href)

    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href)

      const { isFirstStep: first, onPreviousStep: previous, requestExit: exit } = latestRef.current
      if (first) {
        exit()
        return
      }

      previous?.()
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  return {
    showExitModal,
    handleBack,
    handleStay,
    handleExit,
    requestExit,
  }
}
