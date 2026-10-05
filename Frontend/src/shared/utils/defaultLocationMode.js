/**
 * Default Location Mode (Global admin > Customization Settings > Default Location Mode).
 * When ON, every customer gets Indore as their location instead of the device GPS, in Food and Taxi — meant for the
 * App Store / Play review build. Food's location hook stores Indore for Food; the customer screens (Taxi, Food, guest
 * and login) ask the browser for GPS in a dozen places, so this wraps `navigator.geolocation` once: while the switch
 * is ON, a position request made from a customer screen is answered with Indore. Drivers, owners, restaurants,
 * delivery partners and admins are never touched — they need their real position.
 */
const SETTINGS_KEY = "helloparth_customization_settings"

// Same point as Food's default (Vijay Nagar, Indore)
const INDORE_POSITION = {
  latitude: 22.7533,
  longitude: 75.8937,
  accuracy: 20,
  altitude: null,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
}

const isDefaultLocationOn = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")?.default_location_enabled === true
  } catch {
    return false
  }
}

const isCustomerPath = () => /^(\/|\/login(\/.*)?|\/taxi\/user(\/.*)?|\/food\/user(\/.*)?)$/.test(window.location.pathname || "")

const shouldOverride = () => isCustomerPath() && isDefaultLocationOn()

const indorePosition = () => ({ coords: { ...INDORE_POSITION }, timestamp: Date.now() })

let installed = false

export function installDefaultLocationMode() {
  if (installed || typeof navigator === "undefined" || !navigator.geolocation) return
  installed = true

  const geo = navigator.geolocation
  const realGetCurrentPosition = geo.getCurrentPosition.bind(geo)
  const realWatchPosition = geo.watchPosition.bind(geo)
  const realClearWatch = geo.clearWatch.bind(geo)
  const fakeWatchers = new Map()
  let nextFakeId = -1

  const patched = {
    getCurrentPosition(success, error, options) {
      if (shouldOverride()) {
        setTimeout(() => success?.(indorePosition()), 0)
        return
      }
      realGetCurrentPosition(success, error, options)
    },
    watchPosition(success, error, options) {
      if (shouldOverride()) {
        const id = nextFakeId--
        setTimeout(() => success?.(indorePosition()), 0)
        fakeWatchers.set(id, setInterval(() => success?.(indorePosition()), 10000))
        return id
      }
      return realWatchPosition(success, error, options)
    },
    clearWatch(id) {
      if (fakeWatchers.has(id)) {
        clearInterval(fakeWatchers.get(id))
        fakeWatchers.delete(id)
        return
      }
      realClearWatch(id)
    },
  }

  try {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: new Proxy(geo, {
        get(target, prop) {
          if (prop in patched) return patched[prop]
          const value = target[prop]
          return typeof value === "function" ? value.bind(target) : value
        },
      }),
    })
  } catch {
    /* some WebViews do not allow redefining it - Taxi then uses the real GPS */
  }
}
