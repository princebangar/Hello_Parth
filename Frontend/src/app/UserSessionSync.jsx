import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isModuleAuthenticated } from "@/shared/utils/moduleAuth.js";

const USER_AUTH_STORAGE_KEYS = [
  "user_accessToken",
  "user_authenticated",
  "user_refreshToken",
  "userToken",
  "token",
];

function isConsumerUserRoute(pathname = "") {
  const path = String(pathname || "");
  return (
    path.startsWith("/food/user") ||
    path.startsWith("/user/") ||
    path === "/user" ||
    path.startsWith("/taxi/user")
  );
}

export default function UserSessionSync() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const redirectIfLoggedOut = () => {
      const path = location.pathname;
      if (!isConsumerUserRoute(path) || path.includes("/login")) {
        return;
      }

      if (!isModuleAuthenticated("user")) {
        navigate("/login", { replace: true, state: { from: path } });
      }
    };

    const handleStorage = (event) => {
      if (event.key && USER_AUTH_STORAGE_KEYS.includes(event.key) && !event.newValue) {
        redirectIfLoggedOut();
      }
    };

    const handleAuthChanged = () => redirectIfLoggedOut();

    window.addEventListener("storage", handleStorage);
    window.addEventListener("userAuthChanged", handleAuthChanged);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("userAuthChanged", handleAuthChanged);
    };
  }, [location.pathname, navigate]);

  return null;
}
