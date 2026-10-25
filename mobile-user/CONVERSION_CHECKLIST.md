# Conversion checklist — Hello Parth user app (web → Expo / React Native, Android)

Status words: **Verified** (ran it and saw it work) · **Built, not tested** (code written, needs a device test) · **Blocked** (cannot be done; reason given).

## 0. Inputs discovered

| Item | Value | Source |
|---|---|---|
| Target app | User app (Food user + Taxi user, one consumer app) | Prince, chat 2026-10-24 (scope: all user parts) |
| Web frontend | `Frontend/` (React 19 + Vite + Tailwind 4) | repo |
| Backend | `Backend/` (Node/Express/MongoDB) | repo |
| Flutter wrapper | **Not in the repository.** Values below come from the Firebase `google-services.json` Prince gave and the web's own native-shell code | — |
| App name | Hello Parth | `Frontend/index.html` `<title>` |
| Android package | `com.helloparth.user` | `google-services.json` (client `com.helloparth.user`, Firebase project `hello-parth-84522`) |
| Version | 1.0.0 / versionCode 1 | no `pubspec.yaml` available → start value (assumption) |
| Icon / splash | `Frontend/public/hello-parth-icon.png` → `mobile-user/assets/*`; splash background `#fffdf9` (dark `#0b0b0b`) | `Frontend/index.html` boot background |
| API base URL | `https://helloparth.in/api/v1` (health: 200) | `Frontend/.env` has localhost; deployed host from `VITE_ASSET_BASE_URL` + live check |
| Socket URL | `https://helloparth.in` (Socket.IO handshake OK) | live check |
| Maps key | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (= `VITE_GOOGLE_MAPS_API_KEY`); Geocoding, Places (New), Routes v2 answer; legacy Directions disabled | `Frontend/.env`, live check |
| Payment | Razorpay test key `EXPO_PUBLIC_RAZORPAY_KEY_ID` (= `VITE_RAZORPAY_KEY_ID`, `rzp_test_…`) | `Frontend/.env` |
| Firebase client | `EXPO_PUBLIC_FIREBASE_*` (= `VITE_FIREBASE_*`), `google-services.json` for FCM | `Frontend/.env`, Prince's download |
| Test login | Phone `DEFAULT_TEST_PHONE`, OTP `1234` (`USE_DEFAULT_OTP=true`) | `Backend/.env`, `Backend/src/core/otp/otp.service.js` |
| Release signing | upload key `C:/Users/Prince/.helloparth/helloparth-user-upload.jks` (alias `helloparth-user`), passwords in `~/.gradle/gradle.properties`; SHA-1 `C7:DD:64:F6:5E:82:CD:3F:86:0B:79:89:A1:BF:70:43:92:AC:61:BF` | created 2026-10-24 (no earlier key available) |

Secrets kept out of the app: Razorpay secret, JWT secrets, Mongo URL, Firebase service account, SMS/SMTP keys (all only in `Backend/.env`).

## 1. Auth (backend contract, unchanged)

- Login: phone → OTP (`/food/auth/...` user OTP endpoints used by `modules/auth/pages/Login.jsx`); response gives JWT access + refresh tokens.
- Storage on the web: `localStorage` keys `user_accessToken`, `user_refreshToken`, `user_authenticated`, `user_user`, Taxi `userToken`/`token`. In the app the same keys go through `src/lib/storage.js`: every key containing "token" → **SecureStore**, the rest → AsyncStorage, both read synchronously after start-up hydration.
- Requests: `Authorization: Bearer <token>` (axios interceptors of `services/api/axios.js` and `modules/Taxi/shared/api/axiosInstance.js`, unchanged).
- Expiry: access `JWT_ACCESS_EXPIRES` (default 15m), refresh `JWT_REFRESH_EXPIRES` (default 7d). On 401 the client calls `POST /food/auth/refresh-token`, retries once; a 400/401/403 from refresh clears the session (`authRefreshFailed` event).
- Logout: `POST /food/auth/logout` (+ `logout-all`), local session cleared (`clearUserLocalData`).

## 2. Flutter wrapper capabilities → native

The wrapper source is not available; its user-facing capabilities are known from the web code that talks to it (`flutter_inappwebview.callHandler`, `isNativeLikeShell`):

| Capability | Native |
|---|---|
| FCM push token (`getFcmToken` bridge / `__nativeFcmToken`) | `expo-notifications` device token + `google-services.json` → same backend endpoints (`POST /users/fcm-token`, Food FCM endpoints) |
| Notification display / tap | `expo-notifications` (channel `default`, high importance); tap opens `data.link/url/route` |
| Camera / gallery upload bridge | `expo-image-picker` (`src/lib/media.js`) |
| Voice search bridge | `expo-speech-recognition` (`src/lib/voice.js`) |
| Location | `expo-location`, foreground only (web: browser geolocation) |
| External navigation (Google Maps) | `Linking` `google.navigation:` (`openMapsNavigation`) |
| Payment pages | Razorpay checkout.js in a WebView for that flow only (`src/lib/razorpay.js`, `src/native/PaymentHost.jsx`), UPI intents handed to Android |
| Cold start route / last route memory | `src/app/index.jsx` + AppShell (web `index.jsx` `resolveNativeInitialRoute`) |
| Android back button | Expo Router stack + per-screen `useBeforeLeave`/`BackHandler` where the web guarded `popstate` |
| Splash / icon | `expo-splash-screen`, adaptive icon from the web logo |

## 3. Web-only APIs → native replacements

See `CONVERSION_GUIDE.md` §2 (full table) and the per-group reports in `conversion/*.md`.

## 4. Out of scope (stay on the web)

- Food admin, Taxi admin, Global admin (`/admin/*`, `/taxi/admin/*`) — desktop panels.
- Restaurant partner app (`/food/restaurant/*`), delivery partner app (`/food/delivery/*`, `modules/DeliveryV2`), Taxi driver / owner / bus-driver app (`modules/Taxi/modules/driver`).
- Public marketing landing page `/` (`modules/Landing`) — the installed app never showed it (cold start goes to `/login` or the app).

## 5. Screens, APIs and status

Every web file of the user app (227 UI files, ~98k lines, plus 136 logic files) is converted at its web path under
`src/`. 184 route files in `src/app` cover every user route of `Frontend/src/modules/Food/components/user/UserRouter.jsx`
and `Frontend/src/modules/Taxi/TaxiApp.jsx` (both `/taxi/x` and `/taxi/user/x` forms), plus `/login`, `/user/terms|privacy|support`,
`/razorpay/status`, `/phonepe/status` and a catch-all redirect. Per-screen detail (route, guard, API calls, what differs
from the web) is in the group reports:

| Group | Screens | Report | Status |
|---|---|---|---|
| shell | App watchers (session, maintenance, connection, theme), Login, policy pages, shared dialogs/headers, Food/Taxi shared pages | `conversion/shell.md` | Built, not tested |
| food-shell | Food layout + keep-alive tabs, bottom nav, UI kit, Cart/Orders/Profile contexts, location/zone hooks, 72 Food routes | `conversion/food-shell.md` | Built, not tested |
| food-home | Food Home, header, fest banner, location picker overlay, search + voice search | `conversion/food-home.md` | Built, not tested |
| food-browse | Category, Under 250, Categories, Collections, Gourmet, Offers, Coffee, My Store, Product, Restaurants | `conversion/food-browse.md` | Built, not tested |
| food-restaurant | Restaurant details (menu, add to cart), Dining tab pages | `conversion/food-restaurant.md` | Built, not tested |
| food-cart | Cart, Checkout, Select address, Address selector, Order tracking (map, live) | `conversion/food-cart.md` | Built, not tested |
| food-orders | Orders, order details, invoice (print/PDF), help, complaints, table booking, notifications, wallet | `conversion/food-orders.md` | Built, not tested |
| food-profile | Profile tab and all profile sub-pages, edit profile (photo upload), auth callback | `conversion/food-profile.md` | Built, not tested |
| taxi-shell | Taxi layout + keep-alive tabs, Taxi Home, Activity, Profile, Notifications, Cab, 102 Taxi routes, push/socket config | `conversion/taxi-shell.md` | Built, not tested |
| taxi-ride | Select location, Select vehicle, Searching driver, Google maps/places/routes utils | `conversion/taxi-ride.md` | Built, not tested |
| taxi-trip | Ride tracking, ride complete (payment, rating), ride detail, chat, public track, support tickets, SOS | `conversion/taxi-trip.md` | Built, not tested |
| taxi-parcel | Parcel (type, details, searching, tracking), Intercity (home, vehicle, details, confirm) | `conversion/taxi-parcel.md` | Built, not tested |
| taxi-bus | Bus (home, list, seats, details, preview, confirm), bus bookings, profile settings, wallet, promo codes, referral | `conversion/taxi-bus.md` | Built, not tested |

APIs: the app calls exactly the web's API layer (`src/services/api/*`, `src/modules/Taxi/shared/api/*`, copied unchanged
apart from `import.meta.env`), so the endpoint list is the web's; each report lists the calls per screen.

### Verified (run on 2026-10-24)

| Check | Result |
|---|---|
| `node scripts/check-converted.cjs src` (compile, imports resolve, no web-only code) | 575 files, 0 problems |
| `npx eslint src` | 0 errors (warnings only: unused vars, exhaustive-deps, import order) |
| `npx expo-doctor` | 20/20 checks passed |
| `npx expo export --platform android` | Android JS bundle builds (5266 modules, 13 MB Hermes bytecode) |
| Backend reachable | `GET /api/v1/health` 200, Socket.IO handshake OK |
| Test login (live backend) | `POST /food/auth/user/request-otp` + `verify-otp` with OTP 1234 → access + refresh token |
| Authenticated GETs with that token | `/food/auth/me`, `/food/user/profile`, `/food/user/addresses`, `/food/user/wallet`, `/taxi/users/me`, `/taxi/users/wallet`, `/food/pages/terms` → 200 |
| Google web services with the app key | Geocoding, Places (New) autocomplete, Routes v2 → OK |

Not run: the app itself (no emulator/device attached to this PC), payments (no payment attempted), create/update/delete calls.
So every screen and every native capability (push, camera, location, maps, voice, payment, session persistence across
restart) is **Built, not tested** until the device test below.

### Integration fixes made after conversion
- `webCompat`: `tel:/sms:/mailto:/upi:` via `window.location` go to Android, no `pagehide` on background (web code wiped caches on it), `window.alert` → `Alert.alert`.
- `storage`: `Object.keys(localStorage)` lists stored keys (Proxy), as in the browser.
- `push`: platform value `mobile` (what the backend stores app tokens under).
- `theme.radius`: global.css values (sm 6, md 8, lg 10, xl 14).
- `rideRealtime.js`: Firebase REST event stream (EventSource, not in React Native) → Firebase SDK `onValue` on the same `taxiRides/<id>` path.
- Cart: dead try/catch around `useCart()` removed (hook order); SenderReceiverDetails: two `useEffectEvent` functions that handlers call made plain functions.
- 7 Food images were corrupted in git (binary CRLF conversion in commit `5a3e2b5`); the app uses the intact copies from commit `dce2859`. 15 JPEGs saved with a `.png` name were re-encoded as PNG.

### Known differences / decisions for Prince (details in the reports)
- Web content that is hard-coded sample data was kept as the web shows it (ProductDetail, Coffee, DiningExplore50/Near lists, Help "+1 (800)" rows, RideTracking driver fallbacks "James Bond / MH12AB1234", TableBookingConfirmation "Shailu" fallback). They break the no-fake-data rule on the web too — decide whether to remove them in both.
- ImageCropper does not crop (no image editing package): profile photos upload uncropped.
- AppAutoUpdater does nothing (the web reloaded a new web bundle; app updates come from a new APK / Play Store).
- Login: Android back from the OTP step returns to the phone step (the web used history entries).

## 6. Release build

| Item | Value |
|---|---|
| APK | `releases/HelloParth-user-1.0.0.apk` (87.6 MB, arm64-v8a + armeabi-v7a), built 2026-10-25 |
| Icon / splash | icon = Prince's `User Apk Logo.png` (white background); splash = Taxi header navy `#0B172A` (native) then the animated text wordmark (`src/native/AnimatedSplash.jsx`) |
| Signed with | upload key `C:/Users/Prince/.helloparth/helloparth-user-upload.jks`, SHA-1 `C7:DD:64:F6:5E:82:CD:3F:86:0B:79:89:A1:BF:70:43:92:AC:61:BF` (`apksigner verify` OK) |
| Manifest | `com.helloparth.user`, versionCode 1 / 1.0.0, targetSdk 36; permissions: location (foreground), camera, microphone (voice search), notifications, vibrate, network; biometric / foreground-service blocked (unused) |
| Command | `cd mobile-user && npm run build:apk` (prebuild + Gradle release, then copies the APK to `releases/`) |
| EAS (optional) | `npx eas-cli login`, then `npx eas-cli build --platform android --profile production` (`eas.json` outputs an APK) |

Windows build notes (this PC): the native C++ build needs SDK **CMake 3.31.6** (set via `cmake.dir` by
`plugins/withShortCmakeObjectPaths.js`; the default 3.22.1 ninja fails on paths over 260 characters), and Gradle runs
with one worker and a 1.28 GB heap because the PC has ~6 GB RAM (more workers ran out of memory). A clean build takes ~25 min.

After installing from Play Store with Play App Signing, add Google's app-signing SHA-1 too (Play Console → App integrity).
The Maps key is currently unrestricted; if it is restricted later, allow package `com.helloparth.user` with the SHA-1 above.

## 7. Device test list (in this order)

1. Install `releases/HelloParth-user-1.0.0.apk`; first start shows the splash, then Login (light theme).
2. Login with the test phone + OTP 1234 → lands on Taxi Home. Allow notifications and location when asked.
3. Kill the app and open it again → still logged in (session persisted in SecureStore), opens Taxi Home.
4. Taxi: Home tiles, bottom tabs (Home / Activity / Bus / Profile / Support) switch instantly; map shows your position.
5. Taxi ride: select pickup/drop (Places search), select vehicle (route on map, fare), book, searching screen, cancel.
6. Parcel and Intercity flows up to the searching/confirm screens; date/time pickers.
7. Bus: search city pair, list, seats, details, Razorpay test payment (test card), confirmation, booking in Profile → Bus bookings.
8. Wallet add money (Razorpay test), promo codes, referral share/copy.
9. Switch to Food (header switch overlay): Home, location picker, categories, Under 250, restaurant page, add to cart, cart, checkout with a test payment / COD, order tracking map.
10. Food orders list, order details, invoice PDF share, help, complaint, notifications, wallet.
11. Food profile: edit profile + photo (camera and gallery), addresses, favourites, coupons, refer & earn, policy pages, appearance → dark mode on Food and Taxi screens.
12. Voice search in Food search.
13. Push: send a test notification from admin; it shows with the app closed and tapping it opens the right screen.
14. No network: turn on airplane mode → connection banner; turn off → screens recover.
15. Android back button on every flow (sheets close first, then the screen; on a home tab it leaves the app).
16. Session expiry: wait > access-token lifetime (15 min) and use the app → silent refresh; logout → back to Login, back button does not return into the app.
17. Delete account dialog (cancel only, unless testing on a throwaway account).
