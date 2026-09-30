/**
 * axiosInstance wraps every API payload (and everything nested in it) in a Proxy, and history.state is
 * stored with structured clone, which rejects Proxies. Any `navigate(path, { state })` that carries API
 * data therefore threw DataCloneError and the navigation silently never happened (pooling seats → confirm,
 * ride tracking → complete, driver signup → pending...). On that one error, retry with a plain JSON copy.
 */
const GUARD_FLAG = '__TAXI_HISTORY_STATE_GUARD__';

const toPlainState = (state) => {
  try {
    return JSON.parse(JSON.stringify(state));
  } catch {
    return null;
  }
};

export const installHistoryStateGuard = () => {
  if (typeof window === 'undefined' || window[GUARD_FLAG]) {
    return;
  }
  window[GUARD_FLAG] = true;

  for (const method of ['pushState', 'replaceState']) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (state, ...rest) => {
      try {
        return original(state, ...rest);
      } catch (error) {
        if (error?.name !== 'DataCloneError') {
          throw error;
        }
        return original(toPlainState(state), ...rest);
      }
    };
  }
};
