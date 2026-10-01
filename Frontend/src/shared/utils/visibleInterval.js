// setInterval that only does work while the tab is visible, and refreshes once when the tab comes back.
// Admin screens poll for "live" numbers; a background tab used to keep hammering the API for nobody.
// Returns a cleanup function: `return setVisibleInterval(refresh, 15000)` inside a useEffect.
export function setVisibleInterval(callback, ms) {
  if (typeof document === 'undefined') {
    const id = setInterval(callback, ms);
    return () => clearInterval(id);
  }

  const isVisible = () => document.visibilityState === 'visible';
  const id = setInterval(() => {
    if (isVisible()) callback();
  }, ms);
  const onVisibilityChange = () => {
    if (isVisible()) callback();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
