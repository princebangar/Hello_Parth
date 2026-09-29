import { useNavigate } from "react-router-dom";
import CMSPage from "@food/components/user/CMSPage";
import { API_ENDPOINTS } from "@food/api/config";

export default function DriverLegalSupport() {
  const navigate = useNavigate();
  return (
    <CMSPage
      endpoint={API_ENDPOINTS.ADMIN.SUPPORT_DRIVER_PUBLIC}
      title="Help & Support"
      module="DRIVER"
      goBack={() => navigate(-1)}
    />
  );
}
