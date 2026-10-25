/**
 * Has this page load shown a real screen yet? Until it has, loading placeholders keep showing the skeleton the page
 * started with (index.html / AppShellSkeleton) instead of switching to a different loader half way through a refresh.
 */
let firstScreenShown = false

export const markFirstScreenShown = () => {
  firstScreenShown = true
}

export const hasFirstScreenShown = () => firstScreenShown
