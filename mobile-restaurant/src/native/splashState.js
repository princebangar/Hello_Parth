// "The brand splash is gone" for screens that should start heavy native work only after it (the driver home's Google
// map: building it while the splash ran froze the splash animation).
import { useEffect, useState } from 'react';

let done = false;
const listeners = new Set();


export function markSplashDone() {
  if (done) return;
  done = true;
  listeners.forEach((fn) => fn());
  listeners.clear();
}

export function useSplashDone() {
  const [isDone, setIsDone] = useState(done);
  useEffect(() => {
    if (done) {
      setIsDone(true);
      return undefined;
    }
    const fn = () => setIsDone(true);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return isDone;
}
