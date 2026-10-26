/**
 * Background reads (notification badge, reminders ...) must never queue in front of the screen the person opened.
 *
 * A browser talks to one server over a handful of connections at a time (6 per host over HTTP/1.1, which is what the
 * dev server and plain-HTTP setups use). When a screen opens and ten requests go out together, anything sent later
 * waits in line - including the one the person is actually looking at. So reads that only feed a badge or a reminder
 * start a moment later and never use more than two connections at once, leaving the rest to the screen itself.
 */
const MAX_PARALLEL = 2;
const START_DELAY_MS = 900;

let running = 0;
const waiting = [];

const pump = () => {
  while (running < MAX_PARALLEL && waiting.length > 0) {
    const job = waiting.shift();
    running += 1;
    job().finally(() => {
      running -= 1;
      pump();
    });
  }
};

/** Runs `task()` (returns a promise) after a short delay, at most MAX_PARALLEL background tasks at a time. */
export function runInBackground(task) {
  return new Promise((resolve, reject) => {
    const job = () => {
      let promise;
      try {
        promise = Promise.resolve(task());
      } catch (error) {
        reject(error);
        return Promise.resolve();
      }
      promise.then(resolve, reject);
      return promise.catch(() => {});
    };
    setTimeout(() => {
      waiting.push(job);
      pump();
    }, START_DELAY_MS);
  });
}

/**
 * A call opts in with `{ background: true }` in its axios config - only the ones that feed a badge / reminder
 * (the same endpoint opened as a real screen, e.g. the Notifications page, stays immediate).
 */
export function isBackgroundGet(_url, config) {
  return config?.background === true;
}
