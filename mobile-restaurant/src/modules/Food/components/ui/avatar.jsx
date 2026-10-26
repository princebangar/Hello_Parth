// Web: modules/Food/components/ui/avatar.tsx (Radix Avatar: the image shows once it has loaded, the fallback
// until then or when it fails). Same exports. `style` = the circle; AvatarFallback also takes `textStyle`.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppImage } from '@/native/ui';
import { useTheme } from '@/theme';
import { renderTextChildren, tokensFor } from './tokens';

const AvatarContext = createContext({ status: 'idle', setStatus: () => {} });

function Avatar({ style, children, ...rest }) {
  const [status, setStatus] = useState('idle');
  return (
    <AvatarContext.Provider value={{ status, setStatus }}>
      <View style={[{ position: 'relative', width: 32, height: 32, flexShrink: 0, overflow: 'hidden', borderRadius: 9999 }, style]} {...rest}>
        {children}
      </View>
    </AvatarContext.Provider>
  );
}

function AvatarImage({ src, style, alt: _alt, onLoadingStatusChange, ...rest }) {
  const { status, setStatus } = useContext(AvatarContext);
  useEffect(() => {
    const next = src ? 'loading' : 'error';
    setStatus(next);
    onLoadingStatusChange?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  if (!src || status === 'error') return null;
  return (
    <AppImage
      src={src}
      contentFit="cover"
      {...rest}
      onLoad={() => {
        setStatus('loaded');
        onLoadingStatusChange?.('loaded');
      }}
      onError={() => {
        setStatus('error');
        onLoadingStatusChange?.('error');
      }}
      style={[{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: status === 'loaded' ? 1 : 0 }, style]}
    />
  );
}

function AvatarFallback({ style, textStyle, children, ...rest }) {
  const k = tokensFor(useTheme());
  const { status } = useContext(AvatarContext);
  if (status === 'loaded') return null;
  return (
    <View
      style={[{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 9999, backgroundColor: k.muted }, style]}
      {...rest}
    >
      {renderTextChildren(children, [{ color: k.foreground }, textStyle])}
    </View>
  );
}

export { Avatar, AvatarImage, AvatarFallback };
