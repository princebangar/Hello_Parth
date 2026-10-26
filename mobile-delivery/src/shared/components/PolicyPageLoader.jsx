import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Loader2 } from 'lucide-react-native'
import { Text } from '@/native/ui'
import { colors, makeStyles } from '@/theme'
import { Spin } from './Loader'

// The one loader every Terms / Privacy / Support screen shows while its text loads (the web also showed it while the
// page's code chunk downloaded), so going from a login screen to a policy is a single loader.
export default function PolicyPageLoader() {
  const s = useStyles()
  return (
    <View style={s.page} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
      <Spin>
        <Loader2 size={40} color="#CB202D" />
      </Spin>
      <Text style={s.label}>Loading...</Text>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  page: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: t.dark ? '#0a0a0a' : colors.white,
  },
  label: { marginTop: 16, color: colors.gray[500], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, lineHeight: 14 },
}))
