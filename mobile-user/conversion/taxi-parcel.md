# taxi-parcel conversion report

Group key: `taxi-parcel`. Every screen below is **Built, not tested**. The app was not run here. Only `node scripts/check-converted.cjs` was run, and it reports 0 problems for all 8 files.

## How the Taxi theme was reproduced (applies to every file)

These screens sit inside `.user-app-theme` (TaxiApp MainLayout). `Frontend/src/modules/Taxi/index.css` remaps many Tailwind classes with `!important` in **both** themes. For example, `bg-white` / `bg-slate-50` become `--user-card-bg`, `min-h-screen` becomes `--user-bg`, and `text-white` / `text-slate-900` become `--user-text-primary`. `button.bg-slate-900` and `bg-orange-500` become the yellow accent `#FFC400` with ink text, `font-black` becomes 700, and `text-[9px]` becomes 10.5px. The blur blobs are hidden.

Each file has a local `userTokens(dark)` with the CSS variable values (light from `.user-app-theme.light`, dark from `.user-app-theme.dark`), and the styles follow the remap rules. A `dark:` variant on a remapped base class loses to the `!important` remap, so it is ignored, as on the web. Some results look odd but match the web: `text-white` on a blue button is dark ink in light mode, and the checkbox tick in the contact sheet is nearly invisible. These are web behaviour, not conversion errors. The light/dark value comes from `useTheme()` (same `userTheme` setting), not from `useUserTheme()`.

## 1. Files converted (web -> native, same paths under src/modules/Taxi/modules/user/pages/)

| Web file | Native file | Not reproduced exactly / notes |
|---|---|---|
| intercity/IntercityHome.jsx | same | The logic is unchanged, with `window.google` replaced by `googleMapsCompat` from `shared/maps/placesCompat` (taxi-ride). The map picker is an `Overlay` (slide-up modal) with `AppMap`. `onIdle` became `onRegionChangeComplete`, and `panTo` / `setZoom(17)` became `animateCamera`. "Confirm Pickup" reads the last resting map centre instead of `map.getCenter()`. The hidden `datetime-local` input became a date dialog followed by a time dialog (`@react-native-community/datetimepicker`). The `min` is enforced by clamping to the earliest trip start. The TO suggestions dropdown is drawn over the page at the measured field position, because an absolute child outside its parent receives no touches on Android. It has the same contents, the backdrop closes it, and the page does not scroll while it is open. The `isLoaded` loader is always true natively. |
| intercity/IntercityVehicle.jsx | same | The two hidden pickers are native dialogs. Travel date is a date dialog with min/max. Pickup time is a date dialog then a time dialog, and the existing clamp effects keep it inside min/max. `showPicker()` is replaced. |
| intercity/IntercityDetails.jsx | same | The `@react-google-maps/api` `<Autocomplete>` became the headless compat widget (`createPlacesAutocomplete`), with a Google-style (white) suggestion list under the field. `onPlaceChanged` / `getPlace()` logic is unchanged. `alert()` became `Alert.alert`. The map picker works as in IntercityHome. The "Map Load Failed" and "Syncing Map" branches are gone because there is no script loading natively. The "Map Key Missing" branch is kept. |
| intercity/IntercityConfirm.jsx | same | 1:1. `animate-spin` is an Animated rotation. |
| parcel/ParcelType.jsx | same | The wave SVG uses react-native-svg. The `grayscale brightness-125` filter on the footer truck is not reproduced because expo-image has no CSS filters (opacity .2 is kept). framer entrances (fade + y / scale / x with delays) and `whileTap` are Animated / Pressable. `useBaseGoogleMapsLoader` + `window.google.maps.Geocoder` became the compat `Geocoder`. |
| parcel/SenderReceiverDetails.jsx | same | The contact sheet is `Sheet` (34px top radius, backdrop 0.4). The custom checkbox is drawn with Views. `scrollIntoView` for the goods section became `ScrollView.scrollTo` (onLayout y). `useEffectEvent` is kept (React 19.3 has it). `loadPopularPlaces` / `loadAreaHints` / `loadRoadDistances` / `nearbyAutocompleteRequest` get `googleMapsCompat` where the web passed `window.google`. The route-estimate guard `window.google.maps.importLibrary` became "a Maps key exists", because the native `computeDrivingRoute` calls Routes over HTTPS. The PhoneInput's own prop `onChange` is renamed `onValueChange` (internal component). |
| parcel/ParcelSearchingDriver.jsx | same | The map uses `customMapStyle` (same styles). Pins are `Marker` custom views. The dashed line is two `Polyline`s (faint + `lineDashPattern [4,6]`). The search radar (4 pulsing rings + rotating 60° conic sweep, the latter built from 12 SVG wedges) is drawn over the map at the pickup's screen point (`pointForCoordinate`, updated on region change) instead of an OverlayView. `window.open('tel:')` became `Linking.openURL`. The vehicle icon `brightness-0 invert` became `tintColor="#fff"`. The cancel modal is `Dialog`. |
| parcel/ParcelTracking.jsx | same | The vehicle marker is a `Marker` with `rotation` = heading (flat). `fitBounds` became `fitToCoordinates` with the same padding, and `panTo` / `setZoom` became `animateCamera`. The route-refresh guard `window.google.maps.importLibrary` is dropped (Routes over HTTPS). **Deviation:** the bottom card scrolls inside itself, up to screen height minus the header. On the web it is an absolute card in a non-scrolling page, so a tall "Delivered" card was cut off at the top. `tel:` uses `Linking`, share / clipboard use the webCompat shims, and the cancel modal is `Dialog`. |

## 2. Routes, guards, API calls

Route files are owned by the shell. Every one of these routes is inside `UserProtectedRoute` (logged-in user) on the web, both as `/taxi/user/...` and as the `/taxi/...` alias.

| URL | Screen | API calls (from the web code, unchanged) |
|---|---|---|
| /taxi/user/intercity | IntercityHome | GET /users/intercity-packages; GET /users/intercity-quote (free destination); Google Geocoder / Places Autocomplete / Place Details via compat |
| /taxi/user/intercity/vehicle | IntercityVehicle | none (SettingsContext values) |
| /taxi/user/intercity/details | IntercityDetails | GET /rides/available-drivers (on mount and on proceed); Google Places / Geocoder via compat |
| /taxi/user/intercity/confirm | IntercityConfirm | POST /rides (scheduled, non-bidding); otherwise redirects to /ride/searching |
| /taxi/user/parcel/type | ParcelType | GET /users/vehicle-types; reverse geocode |
| /taxi/user/parcel/details, /parcel/contacts | SenderReceiverDetails | GET /users/goods-types, /users/zones, /users/me (authService.getCurrentUser), /users/vehicle-types; Places autocomplete / nearby / geocode; Routes computeRoutes |
| /taxi/user/parcel/searching | ParcelSearchingDriver | GET /users/vehicle-types; POST /deliveries; GET /deliveries/active/me (poll); PATCH /rides/:id/cancel; socket rideSearchUpdate / rideAccepted / ride:state / ride:status:updated / rideCancelled / errorMessage, emits joinRide, ride:join |
| /taxi/user/parcel/tracking | ParcelTracking | GET /rides/app-settings/tip; GET /rides/:id (4 s poll); PATCH /rides/:id/feedback; PATCH /rides/:id/cancel (+ CancellationFeeNotice GET /rides/:id/cancellation-fee); socket ride:state / ride:driver-location:updated / ride:status:updated, ride:join; Firebase RTDB fallback (subscribeRideRealtime) |

Note: ParcelSearchingDriver calls `userAuthService.loginDemoUser()` when there is no token. That method does not exist on the web either, so the call throws into the catch and shows the error. The behaviour is kept as on the web.

## 3. Web-only APIs replaced

- react-router-dom: `@/lib/router`
- react-hot-toast: `@/lib/toast`
- lucide-react: lucide-react-native
- framer-motion: Animated (timing / spring / loop)
- `@react-google-maps/api` GoogleMap / OverlayView / Polyline: `AppMap` / `Marker` / `Polyline`
- `window.google.maps.*`: `googleMapsCompat` (placesCompat)
- `<Autocomplete>`: compat headless widget + own list
- `<input type=date|datetime-local>`: DateTimePicker dialogs
- `alert`: `Alert.alert`
- `window.open(tel:)`: `Linking.openURL`
- `scrollIntoView`: `scrollTo`
- CSS conic-gradient: SVG wedges
- `bg-gradient-*`: expo-linear-gradient
- localStorage / sessionStorage / navigator.geolocation / share / clipboard / document visibilitychange: kept through webCompat

## 4. Imports of files owned by other groups

All of them resolve today. Some are still the copied web versions, which will not run natively until their owners convert them:
- `modules/Taxi/modules/admin/utils/googleMaps.js` (taxi-ride): still imports `@react-google-maps/api` and `useJsApiLoader`. Only `HAS_VALID_GOOGLE_MAPS_KEY` / `INDIA_CENTER` are used here.
- `modules/Taxi/modules/user/utils/preciseLocation.js` (taxi-ride): `loadRoadDistances` needs `google.maps.importLibrary` / `DirectionsService`, which `googleMapsCompat` does not have. It returns null, so the rows show the straight-line distance, which is the web's own fallback.
- `modules/Taxi/modules/user/utils/nearbyPlaces.js` (taxi-ride): works with `googleMapsCompat`. Compat nearbySearch has no rating counts, so popular places use the web's "unrated" fallback ranking.
- Already native: CancellationFeeNotice (taxi-ride), SettingsContext (taxi-shell), ChatUnreadBadge (shell), placesCompat, googleRoutes.

## 5. Status

| Screen | Status |
|---|---|
| IntercityHome | Built, not tested |
| IntercityVehicle | Built, not tested |
| IntercityDetails | Built, not tested |
| IntercityConfirm | Built, not tested |
| ParcelType | Built, not tested |
| SenderReceiverDetails | Built, not tested |
| ParcelSearchingDriver | Built, not tested |
| ParcelTracking | Built, not tested |

## 6. Blocked

Nothing is blocked. The only open dependency is that `admin/utils/googleMaps.js` must be converted by taxi-ride, because its web import of `@react-google-maps/api` would fail at bundle time.
