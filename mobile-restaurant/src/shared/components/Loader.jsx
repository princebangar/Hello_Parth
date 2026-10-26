import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { colors } from '@/theme'

/**
 * Tailwind's `animate-spin` (one turn per second, linear) for any child: a lucide <Loader2 />, a ring ...
 * Shared by the shell's loaders.
 */
export function Spin({ children, style, duration = 1000 }) {
  const value = useRef(new Animated.Value(0)).current
  useEffect(() => {
    value.setValue(0)
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [value, duration])
  const rotate = value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return <Animated.View style={[style, { transform: [{ rotate }] }]}>{children}</Animated.View>
}

/** The web's full-screen white loader with a grey ring (border-2 neutral-200, top neutral-800). */
export default function Loader() {
  return (
    <View style={styles.page} accessibilityRole="progressbar">
      <Spin>
        <View style={styles.ring} />
      </Spin>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { ...StyleSheet.absoluteFill, zIndex: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.neutral[200], borderTopColor: colors.neutral[800] },
})
