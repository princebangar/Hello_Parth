import { useEffect } from "react";
import { usePathname } from "expo-router";
import { navigateTo } from "@/lib/router";
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

// Signed out (token removed, "userAuthChanged") while on a customer screen -> the login screen.
export default function UserSessionSync() {
  const pathname = usePathname();

  useEffect(() => {
    const redirectIfLoggedOut = () => {
      const path = pathname;
      if (!isConsumerUserRoute(path) || path.includes("/login")) {
        return;
      }

      if (!isModuleAuthenticated("user")) {
        navigateTo("/login", { replace: true, state: { from: path } });
      }
    };

    const handleStorage = (event) => {
      if (event?.key && USER_AUTH_STORAGE_KEYS.includes(event.key) && !event.newValue) {
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
  }, [pathname]);

  return null;
}
