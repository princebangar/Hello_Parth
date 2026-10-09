import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import '@/shared/utils/toastGuard'
import { StrictMode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { store } from './store'
import AppErrorBoundary from '@/shared/components/AppErrorBoundary'

function shouldUseHashRouter() {
  if (typeof window === 'undefined') return false

  const protocol = String(window.location?.protocol || '').toLowerCase()
  const userAgent = String(window.navigator?.userAgent || '').toLowerCase()

  return (
    Boolean(window.flutter_inappwebview) ||
    Boolean(window.ReactNativeWebView) ||
    protocol === 'file:' ||
    userAgent.includes(' wv') ||
    userAgent.includes('; wv')
  )
}

export function AppProviders({ children }) {
  const Router = shouldUseHashRouter() ? HashRouter : BrowserRouter

  return (
    <StrictMode>
      <ReduxProvider store={store}>
        <Router unstable_useTransitions={false}>
          <AppErrorBoundary>{children}</AppErrorBoundary>
          <Toaster position="top-center" richColors offset="80px" closeButton visibleToasts={1} />
        </Router>
      </ReduxProvider>
    </StrictMode>
  )
}
