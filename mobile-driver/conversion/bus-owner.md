# bus-owner — conversion report

## 1. Files converted

| Web (`Frontend/src/...`) | Native (`mobile-driver/src/...`) |
|---|---|
| `modules/Taxi/modules/admin/pages/bus-service/BusServiceManager.jsx` | same path |
| `modules/Taxi/modules/driver/pages/OwnerBusServicePage.jsx` | same path |
| `modules/Taxi/modules/driver/pages/OwnerBusBookingsPage.jsx` | same path |

Default exports and props are the same as the web. BusServiceManager has one **new named export**, `BusServiceManagerHost`
(a React context, optional). Nothing was removed.

### BusServiceManager: who scrolls
The web component has **no scroller of its own** (the document scrolled). The native one is the same: it renders plain
Views, and the caller puts it inside its ScrollView. So `BusSignupBuilderPage` (one ScrollView around the manager) works
as it is: **no change is required there**.

Things the web did with the document scroll go through the optional `BusServiceManagerHost` context:
`{ scrollRef, scrollYRef, reloadKey, silentReload, onReloaded }`.
- `scrollRef` + `scrollYRef` (the ScrollView ref and its current y from `onScroll`): form brought to the top on New Bus /
  Edit / step change, the new stop card scrolled into view after "Add Stop" (web `scrollIntoView`).
- `reloadKey` / `silentReload` / `onReloaded`: the caller's pull-to-refresh and the "tab shown again" reload.
Without a provider these are skipped (no crash). OwnerBusServicePage provides it.

**Optional improvement for BusSignupBuilderPage (owner of that file):** to get the same "form to the top on step change"
there, wrap the manager:
```jsx
import BusServiceManager, { BusServiceManagerHost } from '../../../admin/pages/bus-service/BusServiceManager';
const scrollRef = useRef(null); const scrollYRef = useRef(0);
const host = useMemo(() => ({ scrollRef, scrollYRef }), []);
<ScrollView ref={scrollRef} onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} ...>
  <BusServiceManagerHost.Provider value={host}><BusServiceManager ... /></BusServiceManagerHost.Provider>
</ScrollView>
```

### Not reproduced exactly (and why)
- The form's action bar (Current Step / Route Snapshot / Inventory + Previous / Next Step / Delete / Save) was
  `sticky bottom-0` inside the document on the web. The manager does not own the scroller, so it is the last block of the
  form (its natural position). Same buttons, same rules.
- `<select>` → a field that opens a bottom sheet (`Sheet`) with the same options. `<input type="time">` → system time
  dialog, stored value stays `HH:mm`, shown `hh:mm am/pm`, empty `--:-- --`.
- Google Places `<Autocomplete>` (India, `(cities)`) → a suggestion list under the field from `@/lib/google`
  `autocomplete` + `placeDetails` (same fields used: address components + location). Save-time geocoding of a typed city
  uses the placesCompat `Geocoder` (`useAppGoogleMapsLoader().google`) like the web's `window.google.maps.Geocoder`; it
  biases to India by `region: 'in'` (the compat geocoder ignores `componentRestrictions`).
- `GoogleMap` → `AppMap`; markers A / B drawn as small red label pins (react-native-maps has no marker `label`); route via
  `computeDrivingRoute` (Routes v2), fit with `fitToCoordinates` (edge padding 60) / `animateToRegion` zoom 8.
- Bus images: web read the file with FileReader into a data URL stored in the draft; native picks with `pickImage`
  (Camera / Gallery chooser) and reads base64 (`expo-file-system` File) into the same data URL → same payload to
  the same endpoint. Gallery "multiple" uses `expo-image-picker` `allowsMultipleSelection` (pickImage is single-file).
- `window.confirm('Are you sure you want to delete this bus?')` → `Alert` (Cancel / OK). `window.prompt('Reason for
  rejection')` → a `Dialog` with a text field (only reachable with the admin API; owner/signup pass empty pending lists).
- `<a href="tel:">` for the assigned driver phone → `Linking.openURL('tel:...')`.
- Desktop-only blocks (`hidden md:block` table, the always-hidden `hidden` catalog block, `false && ...`) are not drawn,
  as at phone width. Multi-column grids use the mobile (1 / 2 column) layout.
- `.driver-theme` forces `bg-slate-900` buttons to #2563EB + white text: Edit, Edit Bus, selected fleet-driver card,
  "Return On" toggle, View Bus Bookings, selected calendar day, Cancel Full Booking are drawn blue (both callers are
  inside DriverLayout on the web).
- Fleet-driver picker (`max-h-52 overflow-auto`) → small nested vertical ScrollView (`nestedScrollEnabled`).

### OwnerBusBookingsPage
- `<input type="date">` → `NativeDateInput` (YYYY-MM-DD). `<input type="month">` → system date dialog; the picked day's
  month becomes the value (`YYYY-MM`), shown "October 2026" (Android has no month-only picker).
- `animate-pulse` blocks → `Skeleton`. Calendar = rows of 7 Views.
- Pull-to-refresh: reloads bookings + calendar (same calls as the web's `refreshData`), showing the row / calendar
  skeletons while it runs.

## 2. Screens, guards, API calls
All under DriverLayout (logged-in owner; guard is the shell's).

| Path | Screen | API calls (from web code) |
|---|---|---|
| `/taxi/owner/bus-service` (kept-alive tab) | OwnerBusServicePage → BusServiceManager list | `getOwnerBusServices` (GET owner bus services), `getOwnerFleetDrivers` |
| `/taxi/owner/bus-service/create` | same, create flow (4 steps, `?step=`) | save: `createOwnerBusService` (POST) when id starts with `bus-` |
| `/taxi/owner/bus-service/edit/:id` | same, edit flow | save: `updateOwnerBusService(id)` (PUT/PATCH), delete: `deleteOwnerBusService(id)` |
| `/taxi/owner/bus-service/:id` | same, details | — (catalog from list call) |
| `/taxi/owner/bus-bookings` | OwnerBusBookingsPage | `getOwnerBusBookings(filters)`, `getOwnerBusBookingCalendar({ busServiceId, month })`, `cancelOwnerBusBookingSeats(bookingId, { seatIds, ownerNote })` |
| `/taxi/driver/role-signup/bus-builder/*` | BusSignupBuilderPage (other group) → BusServiceManager | local session only (no server) |

Exact methods/paths are those of `driver/services/registrationService.js` (unchanged, already native). Google: Places
autocomplete + details, Geocoding, Routes v2 (route preview).
Default (admin) API when no `api` prop: `adminService.getPendingBusDrivers` / approve / reject, `busService` admin calls.

Kept-alive tab rules (OwnerBusServicePage): `useDriverTabActive`; status bar only while active; catalog + fleet drivers
reloaded when the tab becomes active again (old list stays on screen, no "Loading..." flash); bottom space
`useBottomNavSpace()`; pull-to-refresh on the list (shows "Loading bus services..." while it reloads).

## 3. Web-only APIs replaced
FileReader → expo-file-system base64; `<input type=file>` → pickImage / expo-image-picker; window.confirm/prompt →
Alert / Dialog; scrollIntoView → host ScrollView `scrollTo` via measureInWindow; window.google Places / Geocoder /
GoogleMap → @/lib/google, placesCompat Geocoder, AppMap; `<select>` → Sheet; date/time/month inputs →
@react-native-community/datetimepicker; `tel:` link → Linking.

## 4. Missing imports from other groups
None (check-converted resolved every import).

## 5. Status
- BusServiceManager (list / details / create / edit, all 4 steps): Built, not tested
- OwnerBusServicePage (tab + stack paths): Built, not tested
- OwnerBusBookingsPage: Built, not tested

`node scripts/check-converted.cjs` → 0 problems; eslint → 0 errors, 0 warnings for the three files.

## 6. Blocked
Nothing blocked. Note: `computeDrivingRoute` / Places need the Google key in the app env (already used by other screens).
