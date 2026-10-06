import { Component } from 'react'
import { isChunkLoadError, reloadForNewVersion } from '@/shared/utils/chunkReload'
import { hardNavigate } from '@/shared/utils/nativeShell'

/**
 * Last line of defence. Without one, any error while a screen renders removes the whole app and leaves a blank page.
 * A file that no longer exists on the server (a new version was published) is fixed by loading the new page; anything
 * else shows a small screen with a way back, and the message so it can be reported.
 */
export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[AppErrorBoundary]', error)
    if (isChunkLoadError(error)) reloadForNewVersion()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (isChunkLoadError(error)) {
      return <div style={{ minHeight: '100dvh', background: '#fdfcf9' }} aria-busy="true" />
    }
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center', background: '#fdfcf9', color: '#0b1220', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h2>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>Please try again.</p>
        <button
          type="button"
          onClick={() => hardNavigate('/', { replace: false })}
          style={{ marginTop: 8, padding: '12px 24px', borderRadius: 999, border: 0, background: '#ffc400', fontWeight: 700, fontSize: 15 }}
        >
          Go to home
        </button>
        <code style={{ marginTop: 16, maxWidth: '100%', fontSize: 11, opacity: 0.5, wordBreak: 'break-word' }}>{String(error?.message || error).slice(0, 200)}</code>
      </div>
    )
  }
}
