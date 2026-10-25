import React, { Component } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/native/ui'
import { hardNavigate } from '@/shared/utils/nativeShell'
import { safeErrorText } from '@/shared/utils/redactSecrets'

/**
 * Last line of defence. Without one, any error while a screen renders removes the whole app and leaves a blank screen.
 * It shows a small screen with a way back, and the message so it can be reported.
 * (The web also reloaded the page when a code chunk of an old version was gone from the server; the app's code is all
 * in the installed bundle, so that case does not exist.)
 */
export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[AppErrorBoundary]', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <View style={styles.page}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.sub}>Please try again.</Text>
        <Pressable
          onPress={() => {
            this.setState({ error: null })
            hardNavigate('/', { replace: false })
          }}
          style={styles.btn}
        >
          <Text style={styles.btnText}>Go to home</Text>
        </Pressable>
        <Text style={styles.code} selectable>
          {safeErrorText(error)}
        </Text>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#fdfcf9' },
  title: { margin: 0, fontSize: 20, fontWeight: '700', color: '#0b1220', textAlign: 'center' },
  sub: { margin: 0, fontSize: 14, opacity: 0.7, color: '#0b1220', textAlign: 'center' },
  btn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, backgroundColor: '#ffc400' },
  btnText: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  code: { marginTop: 16, maxWidth: '100%', fontSize: 11, opacity: 0.5, color: '#0b1220', textAlign: 'center', fontFamily: 'monospace' },
})
