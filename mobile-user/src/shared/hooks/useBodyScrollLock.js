// The web pinned <body> so the page behind an open popup could not be scrolled by touch. In the app every popup is a
// native Modal (src/native/ui/Sheet.jsx) that takes all touches itself, so the screen behind it cannot scroll: there is
// nothing to lock. Kept (same signature, ref-count semantics irrelevant) so the callers stay as on the web.
export default function useBodyScrollLock() {}
