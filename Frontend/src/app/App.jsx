import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import StatusBarSync from './StatusBarSync'
import ConnectionStatus from './ConnectionStatus'
import MaintenanceGate from './MaintenanceGate'
import UserSessionSync from './UserSessionSync'
import LocationPrompt from '../modules/Food/components/user/LocationPrompt'
import { syncSharedLocationStoresOnBoot } from '../shared/utils/sharedUserLocation'
import { installDefaultLocationMode } from '../shared/utils/defaultLocationMode'
import { useEffect } from 'react'

// Default Location Mode: answers Taxi customer GPS requests with Indore while the Global admin switch is ON.
installDefaultLocationMode()

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
