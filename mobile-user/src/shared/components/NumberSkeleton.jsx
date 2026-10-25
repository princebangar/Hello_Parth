import React from 'react'
import { View } from 'react-native'
import { Skeleton } from '@/native/ui'
import { useTheme } from '@/theme'

/**
 * A small pulsing bar in place of a number that is still loading (counts, totals, balances), instead of showing a wrong
 * "0" first and the real number a moment later. On the web it took the text colour of its spot (bg-current at 20%
 * opacity, 0.9em high); pass `color` (the text colour there) and `fontSize` to get the same bar.
 * `width` keeps the web's em values ("1.6em") or takes a number.
 */
export default function NumberSkeleton({ width = '1.6em', fontSize = 16, color, style }) {
  const t = useTheme()
  const em = (v) => {
    const m = /^([\d.]+)em$/.exec(String(v))
    return m ? Number(m[1]) * fontSize : v
  }
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={[{ opacity: 0.2, alignSelf: 'center' }, style]}>
      <Skeleton width={em(width)} height={Math.round(fontSize * 0.9)} rounded={6} style={{ backgroundColor: color ?? t.text }} />
    </View>
  )
}
