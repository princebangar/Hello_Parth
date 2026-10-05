import MaintenanceScreen from "@food/components/MaintenanceScreen"
import { GLOBAL_MAINTENANCE_CONTENT } from "../constants/globalMaintenanceContent"

/**
 * All-apps Under Maintenance (Global admin > Customization Settings): shown in every Food and Taxi app.
 * Same design as the Food screen; only the three points mention both Food and Taxi.
 */
export default function GlobalMaintenancePage({ content = GLOBAL_MAINTENANCE_CONTENT } = {}) {
  return <MaintenanceScreen content={content} />
}
