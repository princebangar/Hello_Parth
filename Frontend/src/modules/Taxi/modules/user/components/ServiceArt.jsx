import React, { useEffect, useState } from 'react';
import { BusFront, CarFront, CarTaxiFront, Motorbike, Package, Route, Truck, Users } from 'lucide-react';

// One vector glyph per kind of service. Used whenever a service has no uploaded image (or the image
// fails to load), so every tile in the app gets the same clean look instead of a mix of leftover
// 3D renders and stray screenshots.
export const getServiceGlyph = (hint = '') => {
  const text = String(hint || '').toLowerCase();
  if (text.includes('bus')) return BusFront;
  if (text.includes('bike') || text.includes('moto')) return Motorbike;
  if (text.includes('parcel') || text.includes('delivery') || text.includes('courier')) return Package;
  if (text.includes('truck')) return Truck;
  if (text.includes('pool') || text.includes('share')) return Users;
  if (text.includes('intercity') || text.includes('outstation')) return Route;
  if (text.includes('taxi') || text.includes('auto') || text.includes('cab')) return CarTaxiFront;
  return CarFront;
};

/**
 * Renders the service's uploaded image when there is one, otherwise its glyph.
 * Colours come from the `.service-art` rules in index.css (theme aware).
 */
export default function ServiceArt({ src, label, hint, size = 26, imgClassName = 'h-full w-full object-contain' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    const Glyph = getServiceGlyph(hint || label);
    return <Glyph className="service-art-glyph" size={size} strokeWidth={2} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt={label || ''}
      loading="lazy"
      draggable={false}
      className={imgClassName}
      onError={() => setFailed(true)}
    />
  );
}
