// Toasts with the API of the web's `sonner` (and `react-hot-toast`): toast(msg), toast.success / error / info /
// warning / loading / message, toast.custom(render, opts), toast.promise(p, msgs), toast.dismiss(id).
// Rendered by <Toaster /> (src/native/ui/Toaster.jsx), which matches the web's
// <Toaster position="top-center" richColors closeButton visibleToasts={1} offset="80px" />.
let seq = 0;
let toasts = [];
const listeners = new Set();
const timers = new Map();
const emit = () => listeners.forEach((l) => l(toasts));

export const subscribeToasts = (fn) => {
  listeners.add(fn);
  fn(toasts);
  return () => listeners.delete(fn);
};

const DEFAULT_DURATION = 4000;

function show(type, message, opts = {}) {
  const id = opts.id ?? `t${++seq}`;
  const entry = {
    id,
    type,
    message: typeof message === 'function' ? null : message,
    render: type === 'custom' ? message : null,
    description: opts.description,
    action: opts.action,
    duration: type === 'loading' ? Infinity : (opts.duration ?? DEFAULT_DURATION),
    onDismiss: opts.onDismiss,
  };
  // visibleToasts={1}: the newest one replaces whatever is showing
  toasts = [entry, ...toasts.filter((t) => t.id !== id)].slice(0, 1);
  emit();
  clearTimeout(timers.get(id));
  if (Number.isFinite(entry.duration)) timers.set(id, setTimeout(() => dismiss(id), entry.duration));
  return id;
}

function dismiss(id) {
  const removed = id == null ? toasts : toasts.filter((t) => t.id === id);
  toasts = id == null ? [] : toasts.filter((t) => t.id !== id);
  removed.forEach((t) => {
    clearTimeout(timers.get(t.id));
    timers.delete(t.id);
    t.onDismiss?.(t);
  });
  emit();
}

export function toast(message, opts) {
  return show('default', message, opts);
}
toast.message = (m, o) => show('default', m, o);
toast.success = (m, o) => show('success', m, o);
toast.error = (m, o) => show('error', m, o);
toast.info = (m, o) => show('info', m, o);
toast.warning = (m, o) => show('warning', m, o);
toast.loading = (m, o) => show('loading', m, o);
toast.custom = (render, o) => show('custom', render, o);
toast.dismiss = dismiss;
toast.remove = dismiss;
toast.promise = (promise, msgs = {}) => {
  const id = show('loading', msgs.loading ?? 'Loading...');
  Promise.resolve(typeof promise === 'function' ? promise() : promise).then(
    (data) => show('success', typeof msgs.success === 'function' ? msgs.success(data) : msgs.success, { id }),
    (err) => show('error', typeof msgs.error === 'function' ? msgs.error(err) : msgs.error, { id }),
  );
  return id;
};

export default toast;
