import React, { useState } from 'react';
import { getVerticalTheme } from '@/shared/constants/superAppVerticalTheme';
import { isBannerImageReady, rememberBannerImage } from '@/shared/utils/bannerImage';
import TaxiHeroBanner from './TaxiHeroBanner';

// Same colour as the Taxi app bar above it: shown while an uploaded image is still loading (or not known yet).
const TAXI_BAR_COLOR = getVerticalTheme('taxi').theme;

// Keyed by the address, so a new image starts from "not loaded" without any reset effect (an image that is already
// cached can finish loading before such an effect runs and would then stay invisible).
// A picture the page already has (downloaded in the background while the rider was in Food) is in place from the very
// first paint; only a picture that is still arriving fades in over the plain colour.
const BannerImage = ({ src, onFail }) => {
  const [loaded, setLoaded] = useState(() => isBannerImageReady(src));
  const [wasReady] = useState(loaded);

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      decoding="async"
      fetchPriority="high"
      ref={(node) => {
        if (node?.complete && node.naturalWidth > 0) {
          rememberBannerImage(src);
          setLoaded(true);
        }
      }}
      onLoad={() => {
        rememberBannerImage(src);
        setLoaded(true);
      }}
      onError={onFail}
      className={`absolute inset-0 h-full w-full select-none object-cover ${wasReady ? '' : 'transition-opacity duration-300'} ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  );
};

/**
 * The Taxi home banner (under the app bar), always in the same box (shape 390 : 263, about 263 px on a phone, so the
 * header + banner is as tall as the Food home header) - whatever is inside it stays inside it.
 * - An image uploaded in Global admin > User Management > Home Banners fills the whole box. While it loads: plain
 *   app-bar colour. The default banner is NEVER shown while an uploaded image exists, loading or not.
 * - No image uploaded (or it was removed): the default "Safe Rides, Every Time" banner, whose vehicles start a booking.
 * - `pending`: it is not known yet whether an image is uploaded (start-up settings still on their way): plain app-bar
 *   colour, so the default design never flashes and is then swapped for the uploaded picture.
 * - If the uploaded file itself cannot be loaded (it is gone from the server) the default banner is shown.
 * `natural` (wide desktop column): the default banner takes the height it needs instead of the fixed shape.
 */
const TaxiHomeBanner = ({ imageUrl = '', onPick, className = '', natural = false, pending = false }) => {
  const [failedUrl, setFailedUrl] = useState('');
  const hasImage = Boolean(imageUrl) && failedUrl !== imageUrl;

  if (pending && !hasImage) {
    return (
      <section
        aria-label="Taxi home banner"
        className={`relative isolate w-full overflow-hidden ${className}`}
        style={{ aspectRatio: '390 / 263', backgroundColor: TAXI_BAR_COLOR }}
      />
    );
  }

  if (!hasImage && natural) {
    return <TaxiHeroBanner fillHeight={false} className={`relative ${className}`} onPick={onPick} />;
  }

  return (
    <section
      aria-label="Taxi home banner"
      className={`relative isolate w-full overflow-hidden ${className}`}
      style={{ aspectRatio: '390 / 263', backgroundColor: TAXI_BAR_COLOR }}
    >
      {hasImage ? (
        <BannerImage key={imageUrl} src={imageUrl} onFail={() => setFailedUrl(imageUrl)} />
      ) : (
        <TaxiHeroBanner className="absolute inset-0" onPick={onPick} />
      )}
    </section>
  );
};

export default TaxiHomeBanner;
