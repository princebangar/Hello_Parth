import { useLayoutEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'

// The highlight of the Taxi | Food switcher. Taxi and Food are different screens, each with its own copy of the
// switcher, so the highlight cannot slide inside one component: the NEW screen's switcher puts the highlight where the
// previous screen left it and slides it to the selected tab, starting in the very first frame it is on screen. The last
// position lives here, outside React, so the loading placeholder and the real header (which replace each other) share
// it - the slide happens once.
//
// Native: the web moved the pill's CSS transform; here every switcher owns an Animated.Value (0 = Taxi, 1 = Food) and
// the pill's translateX is interpolated from it by the component (see SuperAppHomeHeader / BootShell).
let lastShown = null

const POSITION = { taxi: 0, food: 1 }
const SLIDE = { duration: 260, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }

// The highlights on screen right now, so a tap can start the slide at once - before the next screen is even built.
const mountedPills = new Set()

/** Slides every visible highlight to `active` now (used on the tap, while the old screen is still up). */
export function slideSwitcherPills(active) {
  lastShown = active
  mountedPills.forEach((value) => {
    Animated.timing(value, { ...SLIDE, toValue: POSITION[active] ?? POSITION.taxi }).start()
  })
}

/** Returns the Animated.Value (0 = Taxi, 1 = Food) the highlight's position follows. */
export function useSwitcherPill(active) {
  const valueRef = useRef(null)
  if (valueRef.current === null) {
    valueRef.current = new Animated.Value(POSITION[lastShown ?? active] ?? POSITION.taxi)
  }

  useLayoutEffect(() => {
    const value = valueRef.current
    const from = lastShown ?? active
    lastShown = active
    mountedPills.add(value)
    value.stopAnimation()
    value.setValue(POSITION[from] ?? POSITION.taxi)
    Animated.timing(value, { ...SLIDE, toValue: POSITION[active] ?? POSITION.taxi }).start()
    return () => {
      mountedPills.delete(value)
    }
  }, [active])

  return valueRef.current
}
