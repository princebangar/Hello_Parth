# Group "taxi-ride" — conversion report

Check: `node scripts/check-converted.cjs` over every file below → **0 problems** (2026-10-24).
Status of every screen/component: **Built, not tested** (no device / emulator run in this step).

## 1. Web file → native file

| Web (Frontend/src) | Native (mobile-user/src) | Not reproduced exactly / notes |
|---|---|---|
| modules/Taxi/modules/user/pages/ride/SelectLocation.jsx | same path | Desktop right-column map dropped (lg only). Map picker = `Overlay` (full-screen Modal, slides up); Android back on it closes it (`handleMapBack`), web had no guard there. Blurred colour blobs not drawn (Taxi/index.css hides `.blur-3xl` anyway). `e.target.select()` → `selectTextOnFocus`. Dotted connector = 3 dots (RN has no one-sided dotted border). Field ring: `ring-2 ring-*-200` when active, theme focus ring (accent border + 1 px ring, index.css `:has(> input.bg-transparent:focus)`) when focused. `window.history.state.idx > 0` → `router.canGoBack()`. |
| modules/Taxi/modules/user/pages/ride/SelectVehicle.jsx | same path | Hidden `<input type="datetime-local">` + `showPicker()` → `DateTimePickerAndroid` (date, then time; same min/max; same "YYYY-MM-DDTHH:mm" value, so all checks/clamps unchanged). Android only (iOS: the Now/Later button does nothing). `<input type="range">` → `@react-native-community/slider`. Pointer-drag handle → `PanResponder` (same ±30 px / tap rules), map strip height animates 42/30/12 % of the window (300 ms). Vehicle markers: heading via Marker `rotation` (no 0.8 s rotate tween), pulse ring static (marker bitmaps cannot animate). `fitBounds` → `fitToCoordinates` (same padding). `zoomControl` → `zoomControlEnabled`. Modals → `Sheet` (slide up; web used a spring). The two "TEMPORARY DEBUG LOG" console.logs were not carried over. Desktop column/header dropped. |
| modules/Taxi/modules/user/pages/ride/SearchingDriver.jsx | same path | OverlayView markers → `Marker` with custom views (pickup pin, drop pin, nearby drivers; drivers' pulse ring static). The searching radar (4 expanding rings + rotating 60° sweep) is drawn above the map at the pickup's projected screen point (`pointForCoordinate`, re-projected on every region change) so it animates; conic gradient → SVG wedge with a linear fade. Dashed straight line = 2 Polylines (20 % base + `lineDashPattern [4,6]`). History back-guard (`pushState` + `popstate` → cancel) → `useBeforeLeave` (Android back while searching runs the same cancel flow; "Try again" = `navigate(-1)` therefore also ends in the cancel flow, exactly like the web). `window.open('tel:')` → `Linking.openURL`. Cancel popup → `Dialog`. `brightness-0 invert` → `tintColor="#fff"`. Exit animations of AnimatePresence not reproduced (enter only). Desktop column dropped. |
| modules/Taxi/modules/user/components/CancellationFeeNotice.jsx | same path | Same exports (`default`, `announceCancellationFee`, `useCancellationFee`, `PendingCancellationDueNotice`). `PendingCancellationDueNotice` takes `style` instead of `className`. |

Colours: every screen follows `.user-app-theme` of Taxi/index.css (the !important light/dark remaps): bg-white/bg-slate-50/bg-slate-900/950 → card, tinted 50/100 → card-soft, text-slate-900/text-white → text, text-slate-300/400/600/700 → secondary, text-slate-500 → muted, light borders → border, text-orange-500/yellow-500 → accent, `button.bg-slate-900` → yellow accent button with dark ink, font-black/extrabold → 700, font-bold → 600, 9 px text → 10.5 px. A local `taxiPalette(t)` in each file holds the --user-* values (light/dark).

### Logic files (rewritten on @/lib/google, same exports + result shapes)

| File | What changed |
|---|---|
| shared/maps/placesCompat.js | Native **window.google look-alike** `googleMapsCompat` (also default export): `maps.LatLng`, `maps.LatLngBounds`, `maps.Geocoder` (`geocode({location} / {address[, bounds, region]} / {placeId}, cb)` → old result shape, `geometry.location` is a LatLng with `lat()/lng()`), `maps.places.AutocompleteService` (`getPlacePredictions` / `getQueryPredictions`, same request fields incl. `locationRestriction` rectangle, `origin`, `bounds`, `componentRestrictions`, `types`), `maps.places.PlacesService` (`getDetails`, `nearbySearch`), `PlacesServiceStatus`, `AutocompleteSessionToken`, `places.Autocomplete` (headless: no DOM dropdown — `search(text, onPredictions)` / `choose(prediction)` + `getPlace()` / `place_changed`). `installPlacesCompat()` / `watchAndInstallPlacesCompat()` return the namespace; `createPlacesAutocomplete(input, opts)` returns the headless widget. Autocomplete calls Places API (New) directly (lib/google's `autocomplete` has no rectangle restriction); geocode-with-bounds calls the Geocoding API directly; the rest is lib/google. |
| modules/Taxi/modules/admin/utils/googleMaps.js | Same exports. `useBaseGoogleMapsLoader` / `useAppGoogleMapsLoader` / `usePlacesGoogleMapsLoader` / `useDrawingGoogleMapsLoader` return a stable `{ isLoaded: true, loadError: undefined, google: googleMapsCompat }` (nothing to load). New: `getGoogleMaps()`. **Other groups: use the `google` from the hook (or `getGoogleMaps()`) wherever the web wrote `window.google`.** |
| shared/utils/googleMapsConfig.js | Same exports (key from `globalThis.__ENV__`). |
| modules/Taxi/shared/utils/googleRoutes.js | `computeDrivingRoute` on Routes API v2 (`computeRoute`): `{ status, path: [{lat,lng}], legs, route }`; `legs` is ONE leg with the trip totals (`distanceMeters`, `durationMillis`) — `sumComputedRouteLegs` gives the same totals. Text stops are geocoded near the trip (bounds bias) like the web; a stop Google cannot place is left out. Status `LIBRARY_UNAVAILABLE` when no key. |
| modules/Taxi/modules/user/utils/nearbyPlaces.js | Unchanged logic; `google` / `placesService` args optional (fall back to `googleMapsCompat`); also callable as `loadPopularPlaces(coords)`, `nearbyAutocompleteRequest(origin)`, `loadAreaHints(items)`. |
| modules/Taxi/modules/user/utils/preciseLocation.js | `watchBestPosition` / `getBestPosition` unchanged (navigator.geolocation from webCompat). `loadRoadDistances(google, originCoords, destinations)` on Routes API v2 (placeId destinations as `{placeId}` waypoints, no Details call); `google` arg ignored, `loadRoadDistances(originCoords, destinations)` also works. |
| modules/Taxi/modules/user/utils/parcelPickerResult.js | Unchanged (sessionStorage shim). |
| modules/Taxi/modules/user/utils/persistentMap.js | A react-native-maps view cannot be detached/re-attached: keeps the map's **state** per name instead. Same exports (`hasPersistentMap`, `acquirePersistentMap(host, {center, zoom, options}, name)` → `{ map: null, reused, ready, center, zoom, options }`, `releasePersistentMap`, `resetPersistentMap`) + `markPersistentMapReady(name)`, `savePersistentMapCamera({center, zoom}, name)`, `savePersistentMapRegion(region, name)`, `getPersistentMapCamera(name)`. Owner of LocationMapSection / Home (taxi-shell): start `<AppMap initialRegion={regionFor(center, zoom)}>` from it, call `markPersistentMapReady()` in `onMapLoaded` and `savePersistentMapRegion` in `onRegionChangeComplete`. |

## 2. Routes / guards / API

Route files are not mine (taxi-shell). Web routes: `/taxi/ride/select-location`, `/taxi/ride/select-vehicle`, `/taxi/ride/searching` and the `/taxi/user/ride/...` aliases — all inside `UserProtectedRoute` (logged-in user).

| Screen | API calls (from the web code) |
|---|---|
| SelectLocation | `GET /users/zones` (when a service location is known); Google: Geocoding, Places autocomplete / details / nearby, Routes (road distances) |
| SelectVehicle | `GET /users/zones` (zone from pickup when not passed), `GET /users/vehicle-types`, `GET /users/set-prices?scope=ride&page&limit=100&zone_id&transport_type` (all pages), `GET /rides/available-drivers?vehicleTypeId&vehicleIconType&lng&lat&service_location_id&transport_type` (all types, then the selected one every 8 s while visible), userService.getAvailablePromos / validatePromo, `GET /rides/cancellation-due/me`; Google Routes |
| SearchingDriver | `POST /rides`, `GET /rides/available-drivers` (every 8 s, radius 5000), `GET /rides/active/me` (fallback poll after 10 s, every 10 s), `PATCH /rides/:id/cancel`, userAuthService.getRideBids / acceptRideBid / increaseRideBidCeiling, `GET /rides/:id/cancellation-fee`; socket `joinRide`, `ride:join` + listeners rideSearchUpdate, rideAccepted, rideBidUpdated, rideBiddingUpdated, ride:state, ride:status:updated, rideCancelled, errorMessage |

## 3. Web-only APIs replaced
`@react-google-maps/api` GoogleMap/OverlayView/Polyline → `AppMap` + `Marker` (custom views) / `Polyline`; `window.google.maps.*` → `googleMapsCompat` (placesCompat) on @/lib/google; `importLibrary('routes')` / DirectionsService → Routes API v2; framer-motion → Animated; `popstate` guard → `useBeforeLeave`; `history.state.idx` → `router.canGoBack()`; `datetime-local` → DateTimePickerAndroid; `input[type=range]` → Slider; pointer events → PanResponder; `window.open('tel:')` → Linking; `document.visibilitychange` kept (webCompat).

## 4. Missing cross-group imports
None at the end (LocationOffDialog, SettingsContext, ChatUnreadBadge, nativeShell exist).

## 5. Status
SelectLocation, SelectVehicle, SearchingDriver, CancellationFeeNotice: **Built, not tested**.

## 6. Blocked / foundation notes
- Nothing blocked. Routes API, Places API (New) and Geocoding must stay enabled for the key used as `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (and allow the Android package `com.helloparth.user` if the key is app-restricted).
- `@/lib/google` `placeDetails` caches by place id only (the first call's field list wins) and does not return `types` / viewport; `autocomplete` has no rectangle `locationRestriction`, so placesCompat calls Places Autocomplete itself.
- `react-native-maps` marker views are bitmaps on Android: animated marker content (pulses, heading tween) is static; the searching radar is an overlay instead.
