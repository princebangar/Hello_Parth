// <img> replacement. `src` may be a bundled asset (import x from './a.png'), an absolute URL or a site-relative
// path such as "/uploads/a.jpg" (resolved against the asset host, like the browser resolved it against the site).
// `fallback` is shown when the image fails, like the web's onError fallbacks.
import React, { useState } from 'react';
import { Image } from 'expo-image';
import { ENV } from '@/config/env';

const ASSET_BASE = String(ENV.VITE_ASSET_BASE_URL || 'https://helloparth.in').replace(/\/$/, '');

export function resolveImageSource(src) {
  if (src == null || src === '') return null;
  if (typeof src === 'number') return src;
  if (typeof src === 'object') return src.uri ? { ...src, uri: resolveImageSource(src.uri)?.uri } : src;
  const s = String(src);
  if (/^(https?:|data:|file:|content:|blob:)/i.test(s)) return { uri: s };
  if (s.startsWith('//')) return { uri: `https:${s}` };
  return { uri: `${ASSET_BASE}${s.startsWith('/') ? '' : '/'}${s}` };
}

export function AppImage({ src, source, fallback, style, contentFit = 'cover', transition = 150, onError, ...rest }) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveImageSource(failed ? fallback : (src ?? source));
  if (!resolved) return fallback && !failed ? <AppImage src={fallback} style={style} contentFit={contentFit} {...rest} /> : null;
  return (
    <Image
      source={resolved}
      style={style}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      onError={(e) => {
        if (!failed && fallback) setFailed(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
}
