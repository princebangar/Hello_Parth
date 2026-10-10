import { toast } from "sonner";

/**
 * Keeps toasts from stacking on top of each other.
 *  - the same message shown again updates the toast already on screen (same id) instead of adding a second one;
 *  - a new toast replaces the one before it, so two different messages are never piled up.
 * Toasts that pass their own `id` keep it (loading -> success updates, the branded notification toast, ...).
 *  - while a branded (logo) toast is on screen, plain success / info / warning toasts are not shown on top of it:
 *    the branded one is the message. Errors still show, so a failure is never hidden.
 * Imported once from the app providers; patches sonner's shared `toast` object, so every file benefits.
 */
const KINDS = ["success", "error", "info", "warning", "message", "custom"];
let lastId = null;
let brandUntil = 0;

/** Called by the branded toast helpers: plain non-error toasts stay quiet until it is gone. */
export const markBrandToastShown = (durationMs = 4000) => {
  brandUntil = Date.now() + durationMs;
};

// sonner delivers `dismiss(id)` on the next animation frame. A toast created with that same id in the same
// frame (dismiss(id) then show(id), which the branded and API-error helpers do) is then dismissed straight away
// and never appears. So a toast whose id was dismissed a moment ago is created just after that frame.
const dismissedAt = new Map();
const SAME_ID_GAP_MS = 60;

if (!toast.__guarded) {
  const originalDismiss = toast.dismiss;
  toast.dismiss = (id) => {
    if (id != null) dismissedAt.set(id, Date.now());
    return originalDismiss(id);
  };

  KINDS.forEach((kind) => {
    const original = toast[kind];
    if (typeof original !== "function") return;
    toast[kind] = (message, data) => {
      const options = { ...(data || {}) };
      if (kind !== "error" && kind !== "custom" && Date.now() < brandUntil) return lastId;
      if (options.id == null && typeof message === "string") options.id = `${kind}:${message}`;
      if (lastId != null && lastId !== options.id) toast.dismiss(lastId);
      if (options.id != null && Date.now() - (dismissedAt.get(options.id) || 0) < SAME_ID_GAP_MS) {
        lastId = options.id;
        setTimeout(() => original(message, options), SAME_ID_GAP_MS);
        return options.id;
      }
      const id = original(message, options);
      lastId = options.id ?? id;
      return id;
    };
  });
  Object.defineProperty(toast, "__guarded", { value: true });
}
