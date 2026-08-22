import { authAPI } from "@food/api";
import { firebaseAuth } from "@food/firebase";
import { clearModuleAuth } from "@/shared/utils/moduleAuth.js";

export const USER_SESSION_PREFERENCE_KEYS = [
  "userVegMode",
  "userVegModeOption",
  "userOrderType",
  "food-under-250-filters",
];

export function formatSavedAddressSubtitle(addresses, preferredAddress) {
  if (!addresses?.length) return "No address saved. Tap to save.";
  const addr = preferredAddress || addresses.find((item) => item.isDefault) || addresses[0];
  const line = [addr?.additionalDetails, addr?.street, addr?.city, addr?.state, addr?.zipCode]
    .filter(Boolean)
    .join(", ");
  return line || "Tap to save.";
}

export function readCachedUserAddresses() {
  if (typeof localStorage === "undefined") return [];
  try {
    const saved = localStorage.getItem("userAddresses");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

async function resolveLogoutFcmToken() {
  if (typeof window === "undefined") {
    return { fcmToken: null, platform: "web" };
  }

  if (window.flutter_inappwebview) {
    const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
    for (const handlerName of handlerNames) {
      try {
        const token = await window.flutter_inappwebview.callHandler(handlerName, { module: "user" });
        if (token && typeof token === "string" && token.length > 20) {
          return { fcmToken: token.trim(), platform: "mobile" };
        }
      } catch {
        // try next handler
      }
    }
    return { fcmToken: null, platform: "mobile" };
  }

  return {
    fcmToken: localStorage.getItem("fcm_web_registered_token_user") || null,
    platform: "web",
  };
}

async function signOutFirebaseIfNeeded() {
  try {
    const { signOut } = await import("firebase/auth");
    if (firebaseAuth?.currentUser) {
      await signOut(firebaseAuth);
    }
  } catch {
    // ignore firebase cleanup failures
  }
}

export function clearLocalUserSessionData() {
  clearModuleAuth("user");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user_authenticated");
  localStorage.removeItem("user_user");
  localStorage.removeItem("user");
  localStorage.removeItem("cart");
  USER_SESSION_PREFERENCE_KEYS.forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem("userAuthData");
  sessionStorage.removeItem("user_auth_session_data");
  window.dispatchEvent(new Event("userAuthChanged"));
}

export async function performUserLogout({ beforeClear, afterClear } = {}) {
  try {
    const { fcmToken, platform } = await resolveLogoutFcmToken();
    await authAPI.logout(null, fcmToken, platform);
  } catch {
    // continue local cleanup even if API logout fails
  }

  await signOutFirebaseIfNeeded();
  await beforeClear?.();
  clearLocalUserSessionData();
  await afterClear?.();
}
