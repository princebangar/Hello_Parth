import { MAINTENANCE_CONTENT } from "@food/constants/maintenanceContent";
import MaintenanceScreen from "@food/components/MaintenanceScreen";

/** Food Under Maintenance (Food admin > Customization Settings): shown in the Food user / restaurant / delivery apps. */
export default function MaintenancePage({ content = MAINTENANCE_CONTENT, onBack } = {}) {
  return <MaintenanceScreen content={content} onBack={onBack} backLabel="Back to Taxi" />;
}
