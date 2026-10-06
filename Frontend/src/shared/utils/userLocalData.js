// What the app keeps on the phone for ONE signed-in customer: their addresses, orders, favourites, last location,
// recent places, push token ... It is removed when they log out - and when a different customer signs in on the same
// device - so the next person never sees (or is offered) the previous one's data.
//
// Not touched: the login tokens (each logout path clears those itself), and what is the same for everybody
// (app settings, service list, zones, the device's own light/dark choice).

const USER_KEYS = [
  'userProfile', 'user_user', 'user', 'userInfo', 'user_edit_profile_draft',
  'userAddresses', 'userDishFavorites', 'userFavorites', 'userOrders', 'userPaymentMethods', 'userOrderType',
  'userVegMode', 'userVegModeOption', 'cart',
  'userLocation', 'userZone', 'userZoneId', 'userZoneStatus', 'deliveryAddressMode',
  'helloparth:lastLocation', 'helloparth:recentLocations',
  'taxi:user:notifications-last-seen', 'selectedVehicleType',
  'native_last_route',
  'fcm_web_registered_token_user', 'lastBrowserFcmRegistration',
  'food-under-250-filters', 'food-category-page-filters-v1',
]
const USER_KEY_PREFIXES = ['taxi:popular:', 'taxi:user:', 'helloparth:user']
const SIGNED_IN_USER_KEY = 'helloparth:signed-in-user-id'

export function clearUserLocalData({ session = true } = {}) {
  if (typeof localStorage === 'undefined') return
  try {
    USER_KEYS.forEach((key) => localStorage.removeItem(key))
    Object.keys(localStorage)
      .filter((key) => USER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key))
    localStorage.removeItem(SIGNED_IN_USER_KEY)
  } catch {
    // storage blocked - nothing was kept there anyway
  }
  if (!session) return
  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }
}

/** Call when a customer signs in: if it is a different person than last time, the previous one's data goes first. */
export function prepareForSignIn(user) {
  if (typeof localStorage === 'undefined') return
  const id = String(user?._id || user?.id || '').trim()
  if (!id) return
  try {
    const previous = localStorage.getItem(SIGNED_IN_USER_KEY)
    if (previous && previous !== id) clearUserLocalData()
    localStorage.setItem(SIGNED_IN_USER_KEY, id)
  } catch {
    // ignore
  }
}
