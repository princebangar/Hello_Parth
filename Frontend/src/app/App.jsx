import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import StatusBarSync from './StatusBarSync'
import ConnectionStatus from './ConnectionStatus'
import MaintenanceGate from './MaintenanceGate'
import UserSessionSync from './UserSessionSync'
import LocationPrompt from '../modules/Food/components/user/LocationPrompt'
import { syncSharedLocationStoresOnBoot } from '../shared/utils/sharedUserLocation'
import { useEffect } from 'react'

function App() {
  useEffect(() => {
    syncSharedLocationStoresOnBoot()
  }, [])

  return (
    <>
      <ThemeSync />
      <StatusBarSync />
      <ConnectionStatus />
      <MaintenanceGate />
      <UserSessionSync />
      <AppRoutes />
      <LocationPrompt />
    </>
  )
}

export default App
