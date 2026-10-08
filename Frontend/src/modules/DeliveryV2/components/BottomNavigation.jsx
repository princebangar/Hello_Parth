import { useNavigate, useLocation } from "react-router-dom"
import { History, LayoutGrid, User, Wallet } from "lucide-react"
import DriverNavBar from "@/modules/Taxi/modules/shared/components/DriverNavBar"

// Same floating bottom bar (and icon style) as the Taxi / Owner / Bus / Pooling driver apps.
export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    if (path === "/food/delivery") return location.pathname === "/food/delivery"
    return location.pathname.startsWith(path)
  }

  const tabs = [
    { key: "feed", label: "Feed", Icon: LayoutGrid, path: "/food/delivery" },
    { key: "pocket", label: "Pocket", Icon: Wallet, path: "/food/delivery/pocket" },
    { key: "history", label: "History", Icon: History, path: "/food/delivery/history" },
    { key: "profile", label: "Profile", Icon: User, path: "/food/delivery/profile" },
  ]

  return (
    <DriverNavBar
      items={tabs.map(({ key, label, Icon, path }) => ({
        key,
        label,
        Icon,
        active: isActive(path),
        onSelect: () => navigate(path),
      }))}
    />
  )
}
