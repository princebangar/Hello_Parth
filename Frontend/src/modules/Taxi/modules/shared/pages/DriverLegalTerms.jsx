import { useNavigate } from "react-router-dom";
import CMSPage from "@food/components/user/CMSPage";
import { API_ENDPOINTS } from "@food/api/config";

export default function DriverLegalTerms() {
  const navigate = useNavigate();
  return (
    <div className="driver-cms-fit">
    <CMSPage
      endpoint={API_ENDPOINTS.ADMIN.TERMS_DRIVER_PUBLIC}
      title="Terms and Conditions"
      module="DRIVER"
      goBack={() => navigate(-1)}
    />
    </div>
  );
}
