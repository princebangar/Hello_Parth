import React from "react";
import { View } from "react-native";
import { useNavigate } from "@/lib/router";
import CMSPage from "@food/components/user/CMSPage";
import { API_ENDPOINTS } from "@food/api/config";

// Captain app legal page (driver routes only; not opened from the user app). The web's .driver-cms-fit wrapper only
// kept long words / tables inside the screen width, which React Native text does by itself.
export default function DriverLegalSupport() {
  const navigate = useNavigate();
  return (
    <View style={{ flex: 1, maxWidth: "100%", overflow: "hidden" }}>
      <CMSPage
        endpoint={API_ENDPOINTS.ADMIN.SUPPORT_DRIVER_PUBLIC}
        title="Help & Support"
        module="DRIVER"
        goBack={() => navigate(-1)}
      />
    </View>
  );
}
