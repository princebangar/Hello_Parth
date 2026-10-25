import { authAPI } from "@food/api";
import { clearModuleAuth } from "@/shared/utils/moduleAuth.js";
import { getNativeFcmToken } from "@/lib/push";

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

// The web asked the Flutter wrapper for the device's FCM token (platform "mobile"); the app reads it from expo-notifications.
// "mobile" stays the platform value: the backend keeps app tokens in fcmTokenMobile only for that value.
async function resolveLogoutFcmToken() {
  try {
    const token = await getNativeFcmToken({ askPermission: false });
    if (token && typeof token === "string" && token.length > 20) {
      return { fcmToken: token.trim(), platform: "mobile" };
    }
  } catch {
    // no token on this device
  }
  return { fcmToken: null, platform: "mobile" };
}

async function signOutFirebaseIfNeeded() {
  try {
    // Loaded only now: firebase auth + database are ~100 kB that every screen used to download just to be able to
    // sign out of Firebase here.
    const [{ signOut }, { firebaseAuth }] = await Promise.all([import("firebase/auth"), import("@food/firebase")]);
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
