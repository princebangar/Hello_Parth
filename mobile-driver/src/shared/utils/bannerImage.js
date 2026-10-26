import { Image } from 'expo-image';
// Home-banner pictures uploaded in Global admin (Food fest banner, Taxi home banner). They are downloaded quietly in the
// background while the person is in the OTHER app, so tapping Taxi / Food finds the picture already in the browser and
// the banner paints at once instead of waiting for a download.

const ready = new Set();
const inFlight = new Map();

const dataSaverOn = () => {
  try {
    return Boolean(navigator.connection?.saveData);
  } catch {
    return false;
  }
};

/** True when this address has already been downloaded by the page (so it can show without a fade-in). */
export const isBannerImageReady = (url) => Boolean(url) && ready.has(url);

/** Remember a picture the page has loaded itself (an <img> that fired onLoad). */
export const rememberBannerImage = (url) => {
  if (url) ready.add(url);
};

/** Download a banner picture ahead of time. Never throws; does nothing on Data Saver. */
export const preloadBannerImage = (url) => {
  if (typeof window === 'undefined' || typeof url !== 'string' || !url || dataSaverOn()) return Promise.resolve(false);
  if (ready.has(url)) return Promise.resolve(true);
  if (inFlight.has(url)) return inFlight.get(url);

  // expo-image keeps it in its memory/disk cache, so the banner's <AppImage> paints at once
  const job = Image.prefetch(url, 'memory-disk')
    .then((ok) => {
      inFlight.delete(url);
      if (ok) ready.add(url);
      return Boolean(ok);
    })
    .catch(() => {
      inFlight.delete(url);
      return false;
    });
  inFlight.set(url, job);
  return job;
};
