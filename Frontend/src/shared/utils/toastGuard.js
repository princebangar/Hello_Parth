import { toast } from "sonner";

/**
 * Keeps toasts from stacking on top of each other.
 *  - the same message shown again updates the toast already on screen (same id) instead of adding a second one;
 *  - a new toast replaces the one before it, so two different messages are never piled up.
 * Toasts that pass their own `id` keep it (loading -> success updates, the branded notification toast, ...).
 * Imported once from the app providers; patches sonner's shared `toast` object, so every file benefits.
 */
const KINDS = ["success", "error", "info", "warning", "message", "custom"];
let lastId = null;

if (!toast.__guarded) {
  KINDS.forEach((kind) => {
    const original = toast[kind];
    if (typeof original !== "function") return;
    toast[kind] = (message, data) => {
      const options = { ...(data || {}) };
      if (options.id == null && typeof message === "string") options.id = `${kind}:${message}`;
      if (lastId != null && lastId !== options.id) toast.dismiss(lastId);
      const id = original(message, options);
      lastId = options.id ?? id;
      return id;
    };
  });
  Object.defineProperty(toast, "__guarded", { value: true });
}
