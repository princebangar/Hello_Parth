// Web: modules/Food/pages/user/profile/Shipping.jsx — GET ADMIN.SHIPPING_PUBLIC; same page as Cancellation
// (FoodPolicyPage) without the returnTo back target.
import { Truck } from "lucide-react-native"
import { API_ENDPOINTS } from "@food/api/config"
import { FoodPolicyPage } from "./Cancellation"

export default function Shipping() {
  return <FoodPolicyPage endpoint={API_ENDPOINTS.ADMIN.SHIPPING_PUBLIC} defaultTitle="Shipping Policy" icon={Truck} logLabel="shipping" />
}
