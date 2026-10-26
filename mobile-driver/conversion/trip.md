# Group: trip

## 1. Files converted

| Web | Native |
|---|---|
| `Frontend/src/modules/Taxi/modules/driver/pages/ActiveTrip.jsx` | `mobile-driver/src/modules/Taxi/modules/driver/pages/ActiveTrip.jsx` (default export `ActiveTrip`) |

The whole screen is converted: restore/hydration from `location.state` + saved snapshot + active-ride fetch (same retries
0 / 700 / 1500 / 2500 / 4000 ms and the same exit-to-home messages), all phases (`to_pickup`, `otp_verification`,
`in_trip`, `payment_confirm`, `review`), parcel and ride texts, stops, waiting clock, arrival / delivery 100 m radius,
payment (cash, online QR + 3 s status polling, "will pay in the app", back to QR / cash), commission summary, earlier
cancellation fee note, rating, chat (unread badge), call contact, SOS (tel:112), support chat, trip simulation (Global
switch via `useTripSimulationEnabled`, or dev builds), live location emits, route drawing / trimming / re-route, map framing,
localStorage keys (`driverActiveTripPhase:<id>`, `driverActiveTripUiState:<id>`, `driverActiveTripSnapshot`).

Layout: full-screen map (web `.trip-screen-root`), the top cards sit below `insets.top` (web top-8 / top-28 / top-44 +
inset), the phase sheet is a bottom card that scrolls inside itself with max height 85% of the window (web
`.trip-sheet-scroll`), its bottom padding is `2rem + insets.bottom` like the web's `env(safe-area-inset-bottom)`. The
action buttons keep the web's inline black (`routeStrokeColor`), so the partner blue-button rule does not apply (web CSS
only targets `bg-slate-900` / `bg-black` ... classes, none of which these buttons use).

Not reproduced exactly:
- Sheet change animation: the new phase card slides up (spring 500 / 25, from its own height = framer's `y: '100%'`) or
  fades in (review); the web's `AnimatePresence mode="wait"` *exit* slide of the old card is not played (the old card
  disappears at once).
- `backdrop-blur` on the "Restoring active trip..." overlay and the dark top card: drawn with the same translucent
  colours, no blur.
- Vehicle marker `drop-shadow` and the OTP boxes' `shadow-inner` are not drawn (no equivalent in a map marker snapshot /
  TextInput). Marker `title` shows as a native callout on tap instead of a browser tooltip.
- `clickableIcons: false` has no react-native-maps prop; map rotation and tilt are turned off so the vehicle heading stays
  screen-relative like the web's north-up map.
- Map framing: `fitBounds(bounds, 72/80)` -> `fitToCoordinates` with the same padding, `setCenter + setZoom(15)` ->
  `setCamera`, `panTo` -> `animateCamera({ center }, 300 ms)`.
- Dashed pickup->drop rail in the summary card is drawn as 7 small dashes (RN dashed single-side borders are unreliable).

Not in the web file, so not added (the brief listed them as possible): cancel-with-fee flow, "open Google Maps" turn-by-turn
button, a back-button guard, keep-awake. The web screen's only back action is the top-left arrow (`navigate(-1)`); the
hardware back does the same stack pop.

OTP (section 7 lesson 5): each box's value is kept in a ref (`otpValuesRef`) as well as state, focus moves to the next
box, Backspace on an empty box focuses the previous one (web onKeyDown), the keyboard is dismissed when the 4th digit is
in, and after a wrong PIN (both the instant check and the server-refreshed check in `startTripAfterOtp`) the first box is
refocused. The digits stay in the boxes like on the web (`selectTextOnFocus`, so typing replaces the digit). The PIN sent is
exactly what was typed (`PATCH /rides/:id/status { status: 'started', otp }`).

## 2. Route / guard / API calls

`/taxi/driver/active-trip` — ordinary stack page (`src/app/taxi/driver/active-trip.jsx` -> `driverRoute(ActiveTrip)`), under
the shell's `DriverLayout` guard (logged-in, approved driver). Opened from DriverHome / DriverRideRequestListener with
`location.state` `{ type, rideId, otp, request, currentDriverCoords }`; without state (or without OTP) it shows
"Restoring active trip..." and fetches the active job, exactly like the web.

HTTP (same method / path / body / driver Authorization header as the web):
- `GET /deliveries/active/me`, `GET /rides/active/me` (hydration, PIN re-check, server-refusal resync)
- `PATCH /rides/:rideId/status` — `{ status: 'started', otp }`; `{ status: 'completed', paymentMethod, driverPaymentCollection }`
- `POST /drivers/payments/qr` `{ rideId, amount }`
- `GET /drivers/payments/qr/status?rideId=` every 3000 ms while the QR is shown
- Geocoding of address-only pickup/drop via `Geocoder` (`@/shared/maps/placesCompat`, Geocoding API); route via
  `computeDrivingRoute` (`modules/Taxi/shared/utils/googleRoutes.js`, Routes API v2), simplified with `simplify-js`.

Socket (same names / payloads / timings): emits `ride:join`, `ride:status:update` (`arriving`, `accepted`, `started`,
`arrived`, `completed` + payment collection), `ride:driver-location:update` (`{ rideId, coordinates, heading, speed,
simulated }`, min 12 m or 3 s); listens `rideRequestClosed`, `rideCancelled`, `ride:status:updated`, `ride:state`,
`errorMessage`, `connect`. All removed on unmount. Location: `navigator.geolocation.getCurrentPosition` +
`watchPosition` (cleared on unmount). Timers: waiting clock 1 s, simulation step 750 ms, auto-start 250 ms after a
correct PIN.

Navigation targets: `/taxi/driver/home` (replace, with `statusMessage`; and after Done), `/taxi/driver/chat` (state
`{ rideId, peer }`), `/taxi/driver/support/chat` (state `{ rideId, backPath, backState }`), `navigate(-1)`.

## 3. Web-only APIs replaced

- `@react-google-maps/api` GoogleMap / PolylineF / MarkerF / OverlayViewF -> `AppMap`, `Polyline`, `Marker` (custom
  rotated vehicle marker, black dot destination marker) from `@/native/ui/AppMap`; `mapStyles` -> `customMapStyle`.
- `window.google.maps.Geocoder` -> `Geocoder` from placesCompat; the `window.google.maps.importLibrary` check before
  routing -> `!isLoaded || !HAS_VALID_GOOGLE_MAPS_KEY` (straight-line fallback without the notice, as the web does
  when the library is not there).
- `framer-motion` -> `Animated` (sheet slide/fade, card fade-ins, press scale, pulse dots, QR zoom 0.4 s
  cubic-bezier(0.16,1,0.3,1), laser scan line 2.5 s loop).
- `react-hot-toast` -> `@/lib/toast`; `lucide-react` -> `lucide-react-native`; `<img>` -> `AppImage` / `Image` in the marker.
- `window.alert` -> `Alert.alert`; `window.open('tel:...')` and the payment link `<a target=_blank>` -> `Linking.openURL`.
- `document.getElementById('otp-n').focus()` -> TextInput refs; `onKeyDown` -> `onKeyPress`.
- `import.meta.env.DEV` -> `globalThis.__ENV__.DEV`; `window.setTimeout/setInterval` -> `setTimeout/setInterval`.
- Tailwind gradients -> `expo-linear-gradient`.

## 4. Missing imports of other groups

None. Every import resolves (`check-converted`: 0 problems).

## 5. Status

| Screen | Status |
|---|---|
| ActiveTrip (`/taxi/driver/active-trip`) | Built, not tested |

Checks: `node scripts/check-converted.cjs src/modules/Taxi/modules/driver/pages/ActiveTrip.jsx` -> 0 problems;
`eslint` -> 0 errors, 0 warnings (the web's intentional hook dependency lists are kept and marked with
`eslint-disable-next-line react-hooks/exhaustive-deps`).

## 6. Blocked / notes

Nothing blocked. Note for integration: `navigate(-1)` from `@/lib/router` does nothing when the stack cannot go back
(e.g. the trip screen opened as the first screen after a cold start); the web's arrow would go to the previous browser
entry. Same code as the web, only the platform's history differs.
