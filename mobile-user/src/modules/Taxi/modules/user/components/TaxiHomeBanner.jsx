// Web: modules/Taxi/modules/user/components/TaxiHomeBanner.jsx — the Taxi home banner under the app bar, always in the
// same box (390 : 263). An image uploaded in Global admin > User Management > Home Banners fills it (plain app-bar colour
// while it loads, fading in); without one the default "Safe Rides, Every Time" banner (TaxiHeroBanner) is shown.
// `pending`: not known yet whether an image is uploaded -> plain colour. A broken upload falls back to the default.
// className -> style (e.g. Home's "-mt-px rounded-b-[2rem] shadow-lg").
import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { getVerticalTheme } from '@/shared/constants/superAppVerticalTheme';
import { isBannerImageReady, rememberBannerImage } from '@/shared/utils/bannerImage';
import TaxiHeroBanner from './TaxiHeroBanner';

// Same colour as the Taxi app bar above it: shown while an uploaded image is still loading (or not known yet).
const TAXI_BAR_COLOR = getVerticalTheme('taxi').theme;
const BANNER_ASPECT = 390 / 263;

// Keyed by the address. A picture already downloaded (in the background while the rider was in Food) is in place at
// once; only a picture that is still arriving fades in over the plain colour.
const BannerImage = ({ src, onFail }) => {
  const [wasReady] = useState(() => isBannerImageReady(src));
  const opacity = useRef(new Animated.Value(wasReady ? 1 : 0)).current;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image
        source={{ uri: src }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        transition={0}
        onLoad={() => {
          rememberBannerImage(src);
          if (!wasReady) Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }}
        onError={onFail}
      />
    </Animated.View>
  );
};

const TaxiHomeBanner = ({ imageUrl = '', onPick, style, natural = false, pending = false }) => {
  const [failedUrl, setFailedUrl] = useState('');
  const hasImage = Boolean(imageUrl) && failedUrl !== imageUrl;

  if (pending && !hasImage) {
    return <View accessibilityLabel="Taxi home banner" style={[styles.box, style]} />;
  }

  if (!hasImage && natural) {
    return <TaxiHeroBanner fillHeight={false} style={style} onPick={onPick} />;
  }

  return (
    <View accessibilityLabel="Taxi home banner" style={[styles.box, style]}>
      {hasImage ? (
        <BannerImage key={imageUrl} src={imageUrl} onFail={() => setFailedUrl(imageUrl)} />
      ) : (
        <TaxiHeroBanner style={StyleSheet.absoluteFill} onPick={onPick} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { position: 'relative', width: '100%', overflow: 'hidden', aspectRatio: BANNER_ASPECT, backgroundColor: TAXI_BAR_COLOR },
});

export default TaxiHomeBanner;
