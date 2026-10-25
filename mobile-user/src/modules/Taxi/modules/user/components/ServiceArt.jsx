// Web: modules/Taxi/modules/user/components/ServiceArt.jsx
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BusFront, CarFront, CarTaxiFront, Motorbike, Package, Route, Truck, Users } from 'lucide-react-native';
import { AppImage } from '@/native/ui';
import { useUserPalette } from '../../../shared/context/UserThemeContext';

// One vector glyph per kind of service. Used whenever a service has no uploaded image (or the image
// fails to load), so every tile in the app gets the same clean look.
export const getServiceGlyph = (hint = '') => {
  const text = String(hint || '').toLowerCase();
  if (text.includes('bus')) return BusFront;
  if (text.includes('bike') || text.includes('moto')) return Motorbike;
  if (text.includes('parcel') || text.includes('delivery') || text.includes('courier')) return Package;
  if (text.includes('truck')) return Truck;
  if (text.includes('share')) return Users;
  if (text.includes('intercity') || text.includes('outstation')) return Route;
  if (text.includes('taxi') || text.includes('auto') || text.includes('cab')) return CarTaxiFront;
  return CarFront;
};

/**
 * The `.service-art` tile of index.css: soft yellow tint, glyph colour #8A6100 (light) / accent (dark).
 * <ServiceArtBox style={{ width: 48, height: 48, borderRadius: 14 }}><ServiceArt ... /></ServiceArtBox>
 */
export function ServiceArtBox({ style, children }) {
  const p = useUserPalette();
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: p.serviceArtBg }, style]}>
      {children}
    </View>
  );
}

/**
 * Renders the service's uploaded image when there is one, otherwise its glyph.
 * imgPadding: the web's imgClassName padding (h-full w-full object-contain p-1.5 -> 6).
 */
export default function ServiceArt({ src, label, hint, size = 26, imgPadding = 0, contentFit = 'contain' }) {
  const p = useUserPalette();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    const Glyph = getServiceGlyph(hint || label);
    return <Glyph size={size} strokeWidth={2} color={p.serviceArtFg} />;
  }

  return (
    <View style={{ width: '100%', height: '100%', padding: imgPadding }}>
      <AppImage
        src={src}
        accessibilityLabel={label || ''}
        contentFit={contentFit}
        style={{ width: '100%', height: '100%' }}
        onError={() => setFailed(true)}
      />
    </View>
  );
}
