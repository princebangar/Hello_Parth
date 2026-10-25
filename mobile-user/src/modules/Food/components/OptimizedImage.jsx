import React, { useState, useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AppImage } from '@/native/ui'
import { colors, useTheme } from '@/theme'
import dishFallbackImage from '@food/assets/dish_fallback.webp'

/**
 * OptimizedImage Component
 *
 * Native version of the web's lazy <picture>: the image (expo-image, memory + disk cache, so a cached picture shows
 * at once), a grey pulsing placeholder until it has loaded, and the dish fallback when there is no picture or it fails.
 * The web's srcset / WebP variants were for the browser picking a size; the app loads the plain `src` (the web's own
 * <img src> too).
 *
 * The web's `className` (size / rounding of the box) is `style` here; `imageStyle` styles the picture inside.
 */
const OptimizedImage = React.memo(({
  src,
  alt,
  style,
  imageStyle,
  priority = false, // For above-the-fold images
  // eslint-disable-next-line no-unused-vars
  sizes = '100vw',
  objectFit = 'cover',
  placeholder = 'blur',
  // eslint-disable-next-line no-unused-vars
  blurDataURL,
  // eslint-disable-next-line no-unused-vars
  responsive = true,
  fallbackImage,
  onLoad,
  onError,
  ...props
}) => {
  const t = useTheme()
  const [isLoaded, setIsLoaded] = useState(priority)
  const [hasError, setHasError] = useState(false)
  const opacity = useRef(new Animated.Value(priority ? 1 : 0)).current
  const pulse = useRef(new Animated.Value(1)).current

  // a new picture starts over (the web re-checked img.complete on every src change)
  useEffect(() => {
    setHasError(false)
  }, [src])

  const isFallback = !src || (typeof src === 'string' && !src.trim()) || hasError
  const effectiveSrc = isFallback ? (fallbackImage || dishFallbackImage) : (typeof src === 'string' ? src.trim() : src)
  const showSkeleton = !isLoaded && !isFallback && placeholder !== 'empty'

  useEffect(() => {
    if (!showSkeleton) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [showSkeleton, pulse])

  const handleLoad = (e) => {
    setIsLoaded(true)
    if (!priority) Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
    if (onLoad) onLoad(e)
  }

  const handleError = (e) => {
    setHasError(true)
    opacity.setValue(1)
    if (onError) onError(e)
  }

  const fit = objectFit === 'contain' ? 'contain' : objectFit === 'cover' ? 'cover' : 'fill'
  const shade = t.dark ? [colors.gray[700], colors.gray[600], colors.gray[700]] : [colors.gray[200], colors.gray[300], colors.gray[200]]

  return (
    <View style={[styles.box, style]}>
      {/* Loading skeleton (the web's blur placeholder is a plain grey square under it, so one grey layer here) */}
      {showSkeleton && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
          <LinearGradient colors={shade} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: priority || isFallback ? 1 : opacity }]}>
        <AppImage
          src={effectiveSrc}
          accessibilityLabel={alt || 'Food item'}
          style={[styles.fill, imageStyle]}
          contentFit={fit}
          priority={priority ? 'high' : 'normal'}
          transition={0}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      </Animated.View>
    </View>
  )
})

const styles = StyleSheet.create({
  box: { position: 'relative', overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
})

export default OptimizedImage
