import { useNavigate } from "react-router-dom";
import CMSPage from "@food/components/user/CMSPage";
import { API_ENDPOINTS } from "@food/api/config";

export default function DriverLegalPrivacy() {
  const navigate = useNavigate();
  return (
    <CMSPage
      endpoint={API_ENDPOINTS.ADMIN.PRIVACY_DRIVER_PUBLIC}
      title="Privacy Policy"
      module="DRIVER"
      goBack={() => navigate(-1)}
    />
  );
}
