import React from 'react'
import '@/shared/utils/toastGuard'
import AppErrorBoundary from '@/shared/components/AppErrorBoundary'

// The web's AppProviders mounted Redux, the router (Browser/Hash), the error boundary and the sonner <Toaster>.
// In the app the root layout (src/app/_layout.jsx) already mounts Redux, the theme, the Expo Router stack and the
// native <Toaster>; what is left of the web file is the toast guard (imported above, it patches the shared toast once)
// and the error boundary, which AppShell wraps around every screen through this component.
export function AppProviders({ children }) {
  return <AppErrorBoundary>{children}</AppErrorBoundary>
}

export default AppProviders
