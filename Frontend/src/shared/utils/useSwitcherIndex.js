import { useLayoutEffect, useRef } from 'react'

// The highlight of the Taxi | Food switcher. Taxi and Food are different screens, each with its own copy of the
// switcher, so the highlight cannot slide inside one component: the NEW screen's switcher puts the highlight where the
// previous screen left it and slides it to the selected tab, starting in the very first frame it is on screen (a layout
// effect with a forced reflow - waiting for animation frames let a busy page delay the slide by a second). The last
// position lives here, outside React, so the loading placeholder and the real header (which replace each other) share
// it - the slide happens once.
let lastShown = null

const POSITION = {
  taxi: 'translateX(0)',
  food: 'translateX(calc(100% + 2px))',
}
const SLIDE = 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1), background-color 260ms ease, background 260ms ease'

// The highlights on screen right now, so a tap can start the slide at once - before the next screen is even built.
const mountedPills = new Set()

/** Slides every visible highlight to `active` now (used on the tap, while the old screen is still up). */
export function slideSwitcherPills(active) {
  lastShown = active
  mountedPills.forEach((pill) => {
    pill.style.transition = SLIDE
    pill.style.transform = POSITION[active] || POSITION.taxi
  })
}

/** Returns the ref to put on the highlight element. */
export function useSwitcherPill(active) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const pill = ref.current
    const from = lastShown ?? active
    lastShown = active
    if (!pill) return undefined
    mountedPills.add(pill)
    pill.style.transition = 'none'
    pill.style.transform = POSITION[from] || POSITION.taxi
    void pill.offsetWidth // the start position is applied before the move, or the browser skips the transition
    pill.style.transition = SLIDE
    pill.style.transform = POSITION[active] || POSITION.taxi
    return () => mountedPills.delete(pill)
  }, [active])

  return ref
}
