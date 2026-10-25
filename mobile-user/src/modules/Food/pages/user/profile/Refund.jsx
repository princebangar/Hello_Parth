// Web: modules/Food/pages/user/profile/Refund.jsx — GET ADMIN.REFUND_PUBLIC; same page as Cancellation (FoodPolicyPage)
// without the returnTo back target.
import { Receipt } from "lucide-react-native"
import { API_ENDPOINTS } from "@food/api/config"
import { FoodPolicyPage } from "./Cancellation"

export default function Refund() {
  return <FoodPolicyPage endpoint={API_ENDPOINTS.ADMIN.REFUND_PUBLIC} defaultTitle="Refund Policy" icon={Receipt} logLabel="refund" />
}
