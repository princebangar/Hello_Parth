# Group: home — conversion report

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-driver/src/…`) |
|---|---|
| `modules/Taxi/modules/driver/pages/DriverHome.jsx` | same path |
| `modules/Taxi/modules/driver/pages/IncomingRideRequest.jsx` | same path |
| `modules/Taxi/modules/driver/components/DriverRideRequestListener.jsx` | same path |

All three keep their default export and props. Every web state, text, rule, API call and navigation target is kept.

### DriverHome — what differs from the web, and why
- **Kept-alive tab** (`useDriverTabActive()`): these run only while the tab is active: the socket listeners
  (`rideRequest`, `rideRequestClosed`, `errorMessage`, `rideAccepted`, `rideBidSubmitted`, `rideBiddingUpdated`,
  `driver:wallet:updated`, `connect` / `disconnect` / `connect_error` / `reconnect_attempt`), the 10 s `locationUpdate`
  interval, the 30 s notifications + scheduled-rides polling, the summary polling (30 s online / 120 s offline), the 8 s
  socket health check, the recovery listeners (visibility / focus / online), the alert-sound replay, the 1 s
  schedule countdown and the Back guard. Coming back to the tab reloads what the web loaded on mount: driver profile +
  document templates + active trip (and opens the trip), notification count, scheduled rides, current location, the
  local preferences (route booking, vehicle re-approval flag). The balance chip pulses again until the new balance
  arrives (like the web on every visit). Going offline still disconnects the socket at any time.
  When the tab is hidden, the request popup, the other popups, the status message and the recovery timers are reset, as
  the web lost them when Home unmounted. A hidden tab never navigates (`openActiveJob` / `rideAccepted` check it).
- **"You are online" location service**: one effect follows the duty state: online → `startOnlineLocationUpdates()`,
  offline → `stopOnlineLocationUpdates()`. It runs on mount (cached `driver_is_online_cache`), after the profile fetch,
  and after every finished toggle. It waits until a toggle is finished (no start on the optimistic "online" before
  `PATCH /drivers/online` answers). It is not awaited, so the toggle UI is not slowed down. If it returns false (location
  refused), nothing more is shown: the web's own location messages already cover it. It keeps running while another tab
  or page is open. Signing out is handled by DriverLayout.
- **Back button**: the web's `history.pushState` / `popstate` trap (Back never left Home) is a `BackHandler` that
  swallows the hardware Back while Home is the screen on top (`tabActive`). A popup's own Modal takes Back first.
- **Map**: `AppMap` (react-native-maps, Google) with the same `mapStyles`, start zoom 15 and pan on every new position;
  the vehicle marker is a 40×40 image anchored at its centre, with the same icon rules. The web's persistent map / marker
  (`persistentMap.js`) is not needed, because the tab stays mounted. "Loading map..." stays on top until `onMapLoaded`
  fires (web: `tilesloaded`).
  The web imports `premium_grid_map.png` but **never draws it**, so it is not used here either.
- **Daily selfie**: the web opened an in-page camera preview (`getUserMedia` + "Capture"), with
  `<input capture="user">` as fallback, and re-encoded the photo on a canvas (max 1280 px, JPEG 0.82). Here
  "Take New Selfie" opens the phone's **front camera** (expo-image-picker, `cameraType: front`). The photo is taken at
  JPEG quality 0.6 and sent as the same base64 data URL to the same `POST /common/upload/image`
  (`folder: driver-online-selfies`), then `goOnline(selfieUrl)` runs as on the web. So there is no in-dialog preview and
  no "Capture" button. The image is not resized (no `expo-image-manipulator` installed). To resize exactly like the web,
  add `expo-image-manipulator`. Some Android camera apps ignore the front-camera hint.
- **`window.confirm`** before cancelling a scheduled ride → `Alert.alert` with the same text (Cancel / OK).
- **Popups** (Go offline?, low wallet, daily selfie) → `Dialog`. The scheduled-rides panel → `Sheet`. The request /
  preview popups → `IncomingRideRequest` (`Sheet`). All are native Modals, so they cover the floating bottom bar. The
  scheduled sheet's web `pb-28` (room for the bottom bar) is now 20 px + safe area, because the Modal already covers the bar.
- **Pull-to-refresh**: Home is a full-screen map with fixed cards (no scrolling page), so there is none on the page
  itself. It is on the scheduled-rides sheet's list (reloads `GET` scheduled rides, which shows its skeleton).
- **Alert sound unlock**: `unlockRideRequestAlertSound()` once on mount (web: first pointerdown / keydown).
- **`window.__driverReconnectRealtime`** (the Flutter-resume hook) is dropped: globals are read-only. The app-resume
  case is covered by the `visibilitychange` / `focus` events from webCompat (AppState), which start the same recovery
  burst.
- `pageshow` listeners are kept but never fire natively (webCompat does not send `pageshow`).
- **Duty toggle colours** come from the partner CSS (`.driver-theme button.bg-black / .bg-slate-900` → #2563EB). On the
  web, the offline (`bg-slate-900`) rule `* { color: inherit }` also turns the "Offline" label **and the power icon
  white**, so the icon is invisible on the white knob. This is reproduced exactly; worth a look by Prince
  (web bug, not changed).
- Unused web values are left out: `appName` / `appLogo` (`useSettings`), `MapGrid`, unused icons. The `socketStatus`
  and `routeBookingPreferences` states are kept as setters (the web sets them but never draws them).
- Dates: `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` for the selfie day key, with a fallback (UTC+05:30
  computed by hand) in case Hermes' Intl returns another format.

### IncomingRideRequest — differences
- The web's fixed bottom panel (`data-driver-overlay`) → `Sheet` with a floating card (12 px margins, radius 26, max
  height min(screen − 24, 640), scrolling body, actions always visible).
- **Countdown from timestamps**: same rule as the web (`requestExpiresAt` if it is still in the future, otherwise
  duration from `acceptRejectDurationSeconds` / `expiresInSeconds`, default 15 s). It is checked every 250 ms against
  `Date.now()`. There is one addition: when there is no future `requestExpiresAt`, the duration counts from the request's
  `receivedAt` (set by both socket listeners when the request arrives) instead of from the moment the popup could draw.
  So a request that came in while the app was in the background does not get a fresh full timer.
- Conic-gradient ring → SVG circle stroke. Progress bar → Animated width (0.35 s).
- Live request: no outside tap / Back dismiss (the web had none). Preview: outside tap and Back close it (web: outside tap).
- `tel:` link → `Linking.openURL('tel:…')` (spaces removed).
- The web's spring entrance (y 60 → 0) is the Sheet's slide-up.

### DriverRideRequestListener — differences
- Same `ignoredRoutes`, same socket flow, same `navigate('/taxi/driver/active-trip', { state })`. The unlock listeners
  are replaced by `unlockRideRequestAlertSound()` once on mount. `receivedAt` is added to the request object (see above).

## 2. Screens, guards, API calls

| Screen | Route | Guard |
|---|---|---|
| DriverHome | `/taxi/driver/home`, `/taxi/driver/dashboard` (kept-alive tab) | signed-in approved driver (DriverLayout) |
| IncomingRideRequest | popup (Home + listener) | — |
| DriverRideRequestListener | every driver route except `ignoredRoutes` (rendered by DriverLayout for role `driver`) | signed-in driver |

API / socket calls (all from the web code, unchanged):
- `GET /drivers/me` (getCurrentDriver): on visit, summary polling, after online / offline
- `GET` driver document templates (getDriverDocumentTemplates)
- `GET` driver notifications (getDriverNotifications), `GET` scheduled rides `{ limit: 20 }` (getDriverScheduledRides),
  cancel scheduled ride (cancelDriverScheduledRide)
- `GET /deliveries/active/me`, `GET /rides/active/me` (`params: { t, type }`, Bearer driver token)
- `PATCH /drivers/online { location, selfieImageUrl? }`, `PATCH /drivers/offline`
- `POST /common/upload/image { image: <data URL>, folder: 'driver-online-selfies' }`
- Socket emits: `locationUpdate { coordinates }`, `acceptRide`, `rejectRide`, `submitRideBid { rideId, bidFare }`
- Navigation: `/taxi/driver/active-trip` (state), `/taxi/driver/notifications`, `/taxi/driver/wallet`,
  `/taxi/driver/documents` (all exist in `src/app/taxi/driver`)

## 3. Web-only APIs replaced
- `history.pushState` / `popstate` → `BackHandler` (while tabActive)
- `@react-google-maps/api` + persistent map / `google.maps.Marker` → `AppMap` + `Marker` (`@/native/ui/AppMap`)
- `getUserMedia` / `<video>` / canvas / `FileReader` / `<input type=file capture>` → `expo-image-picker` front camera with base64
- `window.confirm` → `Alert.alert`
- framer-motion → `Animated` (knob spring, chevron rotate, fades, progress) + `LayoutAnimation` (summary collapse)
- `conic-gradient` → `react-native-svg`; Tailwind gradients → `expo-linear-gradient`
- `react-hot-toast` → `@/lib/toast`; `lucide-react` → `lucide-react-native`
- pointerdown / keydown audio unlock → `unlockRideRequestAlertSound()` on mount
- `window.__driverReconnectRealtime` (Flutter hook) → dropped (AppState via webCompat covers resume)

## 4. Missing imports of other groups
None. All imports resolve (`check-converted`: 0 problems).

## 5. Status
- DriverHome — Built, not tested
- IncomingRideRequest — Built, not tested
- DriverRideRequestListener — Built, not tested

`node scripts/check-converted.cjs` → 3 files, 0 problems. `eslint` → 0 errors, 0 warnings.

## 6. Blocked / notes for the integrator
- Nothing blocked.
- Optional package: `expo-image-manipulator` (to resize the selfie to 1280 px like the web canvas). Without it, the
  full-resolution front-camera photo (JPEG 0.6) is uploaded.
- Shared files: no problems found. Note: the Home location interval (10 s, while Home is on screen) and the background
  service both send `locationUpdate` while Home is open and online. Both are throttled; this was asked for in the brief.
