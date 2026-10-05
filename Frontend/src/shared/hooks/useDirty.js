import { useCallback, useEffect, useRef, useState } from 'react';

const snapshot = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(Math.random());
  }
};

/**
 * Tells whether `value` differs from the last saved/loaded state.
 * - `ready`: pass false while data is loading; the baseline is taken the first time it turns true.
 * - `resetBaseline(next)`: call after a successful save (pass the saved value) to disable Save again.
 */
const useDirty = (value, ready = true) => {
  const [baseline, setBaseline] = useState(null);
  const current = snapshot(value);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (ready && baseline === null) setBaseline(currentRef.current);
  }, [ready, baseline]);

  const resetBaseline = useCallback((next) => {
    setBaseline(next === undefined ? currentRef.current : snapshot(next));
  }, []);

  return { isDirty: baseline !== null && baseline !== current, resetBaseline };
};

export default useDirty;
