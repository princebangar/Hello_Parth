# Group: bus-driver — conversion report

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-driver/src/…`) |
|---|---|
| `modules/Taxi/modules/driver/pages/BusDriverHome.jsx` | same path |
| `modules/Taxi/modules/driver/pages/BusDriverLiveRoute.jsx` | same path |
| `modules/Taxi/modules/driver/components/BusDriverBottomNav.jsx` | same path |

Default exports and props are the same as the web. Every state, text, rule, API call and navigation target is kept.

### BusDriverHome — what differs from the web, and why
- **One FlatList page.** The tab content (hero / Schedule / Seat desk / Bookings header / Account) is the list header.
  The Bookings tab's passenger cards are the list rows, with the web's empty text "No bookings match this search.".
  Opening a tab scrolls to the top, like the web's `window.scrollTo`.
- **Pull-to-refresh** (new, required by the Captain rules): reloads the profile and the selected run's seat layout and
  bookings. This runs the web's `refreshDesk`, which shows the desk's own "Loading seat desk..." state. With no
  schedule it reloads only `/drivers/me`. On the Bookings tab it also reloads the Today / Upcoming list.
- **Sticky tab title bar** (Schedule / Seat desk / Bookings / Account): drawn as a fixed bar above the list, with the
  status-bar inset inside it. On the web it starts 24 px lower and then sticks to the top. The native bar is at the top
  from the start.
- **Bottom bar**: `BusDriverBottomNav` is rendered last in the page, as on the web. It uses the converted
  `DriverNavBar`, which already sits above `insets.bottom`. `DriverLayout` does not draw its own bar on `/bus-home`.
  The list ends with `useBottomNavSpace()`.
- **Back button**: the web trap (`history.pushState` + `popstate`) is rebuilt with an Android `BackHandler` (only while
  the screen is focused, `useIsFocused`) plus `useBeforeLeave` for a stack go-back. Back from a tab opens Home. Back
  from Home asks to log out.
- **window.confirm** (log out): replaced by `Alert.alert` with Cancel / OK and the same text. OK calls
  `clearDriverAuthState()` and then `navigate('/taxi/driver/login', { replace: true })`.
- **`<select>`** (schedule, schedule status, gender): replaced by a field that opens a `Sheet` with the same options.
- **`<input type="time">`**: replaced by the system time picker (`DateTimePickerAndroid.open`; on iOS a Dialog with a
  spinner and a Done button). It stores the same `HH:mm` value. An empty value shows `--:-- --` like the browser.
- **Calendar popover and run-details popup** (`data-driver-overlay`): replaced by `Dialog` (native Modal, it covers
  the bottom bar). Tap outside / Back closes them, like the web's outside click / Escape. The web's body scroll lock is
  not needed.
  Note: the web never sets `isRunDetailsOpen` to true, so the run-details popup cannot be opened there either. It is
  converted in full anyway.
- **`tel:` link** ("Call"): replaced by `Linking.openURL`.
- **Font**: the web page sets `'Plus Jakarta Sans'` inline on its root, so the page is wrapped in a
  `FontScope family="Plus Jakarta Sans"`. The bundled font has no 900 weight, so `font-black` uses the nearest weight (800).
- **Grids**: `sm:grid-cols-*` grids use the mobile value (one column). `grid-cols-2/3/7` are rows.
- **Removed**: the unused `WORKSPACE_TABS` constant (it was not exported or used on the web).

### BusDriverLiveRoute — what differs from the web, and why
- **Map**: `AppMap` (react-native-maps, Google) instead of `<GoogleMap>`. It keeps the same start zoom (6 / 8), the
  same markers (the web's three SVG pins, redrawn with react-native-svg and the same anchors), the grey remaining-route
  line (`#334155` 0.9, 5 px) and the red live trail (`#dc2626` 0.96, 6 px).
  - `fitBounds(…, 70)` is replaced by `fitToCoordinates` with 70 px padding.
  - `panTo` / `setZoom` are replaced by `animateCamera`, with the same thresholds (0.08 km, zoom −0.3 / +1.2), read
    from `getCamera()`.
  - The web's controlled `center` prop moved the map whenever `mapCenter` changed. Here `setCamera` does the same,
    but only when the coordinates really change (the web did it on every new object).
  - "Manual View": the web used `dragstart` and `zoom_changed`. Here it is `onPanDrag`, plus
    `onRegionChangeComplete` with `isGesture` (pinch), when the page did not move the camera itself.
  - `zoomControl` is `zoomControlEnabled` (Android only).
- **GPS**: `navigator.geolocation` (webCompat), with the same `getCurrentPosition` / `watchPosition` options.
  - The send rule is the same: `PATCH /drivers/bus/live-trip/location` every 120 m or 8 s.
  - The live trip is refreshed every 20 s, as on the web.
  - The watch is cleared on pause / complete / reset and on unmount.
  - The web does not keep the screen on and does not open Google Maps, so neither does the app.
  - It runs in the foreground only, like the web page. It does not use the background "online" service.
- **Map availability**: the map is shown when `HAS_VALID_GOOGLE_MAPS_KEY`. If not, the web's text "Route map will
  appear once Google Maps is ready." is shown.
- **window.confirm** ("Reached destination"): replaced by `Alert.alert` with Cancel / OK.
- **"Recenter Bus" button**: the web's `bg-slate-900` button is shown as the partner blue `#2563EB`, because the
  `.driver-theme` CSS forces that colour.
- The "Routing Meta" text "Browser GPS + simplified trail" is kept as on the web.
- **Font**: Plus Jakarta Sans, as in Home.

## 2. Routes, guards, API calls

Both routes exist already: `src/app/taxi/driver/bus-home/index.jsx` and `live-route.jsx`, through `driverRoute`. The
guard is `DriverLayout`: a signed-in, approved driver with role `bus_driver`. Other roles are sent away from
`/taxi/driver/bus-home*`.

| Screen | API calls (from the web code) |
|---|---|
| BusDriverHome `/taxi/driver/bus-home` | `GET /drivers/me`; `GET /drivers/bus/seats?scheduleId&date`; `GET /drivers/bus/bookings?scheduleId&date`; `GET /drivers/bus/bookings?date=today&activeOnly=1` / `?from=today&activeOnly=1`; `PATCH /drivers/bus/schedules {schedules}`; `POST /drivers/bus/reservations {scheduleId, travelDate, seatIds, passenger, notes, paymentStatus}`; `PATCH /drivers/bus/bookings/:id/paid` |
| BusDriverLiveRoute `/taxi/driver/bus-home/live-route` | `GET /drivers/me`; `GET /drivers/bus/live-trip` (on mount and every 20 s); `POST /drivers/bus/live-trip/start {scheduleId, travelDate, location?}`; `PATCH /drivers/bus/live-trip/location {scheduleId, travelDate, location}`; `PATCH /drivers/bus/live-trip/status {action: pause/resume/complete/reset}`; Google Routes v2 (`computeDrivingRoute`) |

Navigation targets:
- `/taxi/driver/bus-home/live-route` (with `state: { profile, travelDate, selectedScheduleId }`)
- `/taxi/driver/bus-home`
- `/taxi/driver/login` (replace)

## 3. Web-only APIs replaced
- `window.confirm` → `Alert.alert`.
- `popstate` / `history.pushState` → `BackHandler` + `useBeforeLeave`.
- `window.scrollTo` → `scrollToOffset`.
- `document` mousedown / touchstart / keydown listeners and the body scroll lock → `Dialog` (Modal).
- `<select>` → `Sheet`. `<input type="time">` → `@react-native-community/datetimepicker`.
- `<a href="tel:">` → `Linking`.
- `@react-google-maps/api` → `AppMap` / `Marker` / `Polyline`. SVG data-URL marker icons → react-native-svg.
- `react-hot-toast` → `@/lib/toast`. `lucide-react` → `lucide-react-native`.

## 4. Missing imports from other groups
None. `check-converted.cjs`: 0 problems for all 3 files. ESLint: 0 problems.

## 5. Status
- BusDriverHome: Built, not tested
- BusDriverLiveRoute: Built, not tested
- BusDriverBottomNav: Built, not tested

## 6. Blocked
Nothing. The map needs the Google Maps key in the app's env, as every map screen does.
