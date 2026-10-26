# settings-2 — conversion report

Checks: `node scripts/check-converted.cjs <8 files>` → **0 problems**; `npx eslint <8 files>` → **0 errors, 0 warnings**.

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-restaurant/src/…`) | Not reproduced exactly / why |
|---|---|---|
| `modules/Food/pages/restaurant/EditOwner.jsx` | same path | MUI `MobileTimePicker` → system time picker (shown `hh:mm AM`, stored `HH:mm`); `<input type="date">` → system date picker (shown dd/mm/yyyy, stored yyyy-mm-dd); the web's `navigate(pathname, { replace })` that cleared `updatedLocation` is left out (a native replace rebuilds the page and would lose the merged location); unsaved draft key removed when the page unmounts (see 3); `scale-105` on the active tab kept as a transform. |
| `modules/Food/pages/restaurant/PhoneNumbersPage.jsx` | same path | **The web starts all three numbers with a hard-coded sample `+91-9981127415`.** No sample data allowed → the rows start from the restaurant's real `primaryContactNumber` (else `ownerPhone`) from GET `/food/restaurant/current`, shown `+91-XXXXXXXXXX`, empty if none. This is one extra GET the web does not make. Like the web, the OTP step has **no backend** (any 6 digits accepted; nothing is saved to the server) — so "refocus the first box on a wrong code" cannot happen; Resend clears the boxes and refocuses box 1. |
| `modules/Food/pages/restaurant/EditRestaurantAddress.jsx` | same path | Search suggestions push the header down (in-flow list) instead of floating over the map. "Proceed to update" / header back hand the result to the Edit Profile page below and go back (see 3) instead of pushing a 2nd Edit Profile. Map is AppMap; idle → `onRegionChangeComplete`. |
| `modules/Food/components/restaurant/LocationSearchInput.jsx` | same path | Suggestion list is in the normal flow under the input (Android cannot tap a view outside its parent's bounds); web `className` / `dropdownClassName` → `style` / `dropdownStyle`. |
| `modules/Food/pages/restaurant/DeliverySettings.jsx` | same path | framer-motion → Animated; own bottom toast kept (absolute view). |
| `modules/Food/pages/restaurant/RestaurantStatus.jsx` | same path | The web dialogs show the literal text `??` as icon (a broken emoji in the web source) — kept as the web shows it. Weekday / "Oct 26" date computed without Intl (same output as `toLocaleDateString('en-US')`). |
| `modules/Food/pages/restaurant/RushHour.jsx` | same path | RadioGroup drawn with Pressable radios (web radio: blue-600 fill + white dot). Confirm only goes back (no API) — as on the web. |
| `modules/Food/pages/restaurant/ZoneSetup.jsx` | same path | Google's fullscreen map button left out (no native counterpart); Map / Satellite control drawn as a small 2-button bar top-right (`mapType`); marker DROP animation not reproduced; InfoWindow → the marker's native callout (title "Restaurant Location" + address). Not a polygon screen: the web page is a single draggable pin. |

Known web quirk kept: on Edit Address the pin graphic sits at 36 % of the map height, but the saved point is the map **centre** (50 %) — exactly the web's behaviour. If Prince wants the point under the pin, `map.coordinateForPoint` can do it (behaviour change, not done).

## 2. Screens, guards, API calls

All routes use `protectedRoute` (logged-in restaurant) — route files already existed.

| Route | Screen | API calls |
|---|---|---|
| `/food/restaurant/edit-owner` | EditOwner | GET `/food/restaurant/current` (refresh, cache bypass), GET `/food/zones/public`, POST `/uploads/image` (multipart, per new photo, folders `food/restaurants/{profile,pan,gst,fssai,menu}`), PATCH `/food/restaurant/profile`; place search: geocode/places via `@food/utils/googlePlaces` |
| `/food/restaurant/edit-address` | EditRestaurantAddress | GET `/food/restaurant/current`; reverse geocode (`@food/utils/googleGeocoding`), place search |
| `/food/restaurant/phone` | PhoneNumbersPage | GET `/food/restaurant/current` (native only, see 1) |
| `/food/restaurant/delivery-settings` | DeliverySettings | GET `/food/restaurant/current`, PATCH `/food/restaurant/availability` |
| `/food/restaurant/status` | RestaurantStatus | GET `/food/restaurant/current` (×2 as web, deduped by the API cache), GET `/food/restaurant/outlet-timings`, PATCH `/food/restaurant/availability`, PATCH `/food/restaurant/takeaway-settings` |
| `/food/restaurant/rush-hour` | RushHour | none |
| `/food/restaurant/zone-setup` | ZoneSetup | GET `/food/restaurant/current`, PATCH `/food/restaurant/profile` `{ location }`, Places API (New) autocomplete + place details (`@/lib/google`), reverse geocode |

## 3. Web-only APIs replaced

- `react-router-dom` → `@/lib/router`; each page keeps **its own** route state in a ref at mount (the shared location follows the top page).
- `sonner` → `@/lib/toast`; `window.alert` → `Alert.alert`; `lucide-react` → `lucide-react-native`; `framer-motion` → `Animated`; `lenis` → nothing.
- `@googlemaps/js-api-loader` / `google.maps.Map` → `AppMap` + `Marker` + `regionFor` (zoom 5 / 15 / 17 as the web), built after the splash (`useSplashDone`), `collapsable={false}` on the views around the map; loading overlay / controls are siblings (map wrapper never restyled).
- `google.maps.places.AutocompleteSuggestion` (ZoneSetup) → `@/lib/google` `autocomplete` + `placeDetails` (one session token, `country: "in"`). No keys in code.
- `<input type="file">` / `File` / `URL.createObjectURL` → `ImageSourcePicker` (`{ uri, name, type, size }`), preview = `uri`.
- MUI time picker / `<input type="date">` → `@react-native-community/datetimepicker` (`DateTimePickerAndroid.open`, iOS sheet) — same pattern as the converted Onboarding.
- `@radix` Select → converted `@food/components/ui/select`; shadcn Dialog/Button/Card/Switch/Input/Label → converted kit.
- Edit Profile ⇄ Edit Address round trip: the web pushed `/edit-owner` again with `{ updatedLocation }`. Natively Edit Profile stays mounted under the map page, so the map page writes `sessionStorage["restaurant_edit_owner_map_return"] = { activeTab, updatedLocation? }` and goes back (`navigate(-1)`) when the route below is `edit-owner`; Edit Profile reads + removes it in `useFocusEffect` and merges the location (same `mergePendingLocation`). If Edit Profile is not below, the web's push with route state is used and still handled.
- Edit Profile's `restaurant_edit_owner_draft` is removed when the page unmounts (Android back), otherwise a stale unsaved draft would reappear on the next open (on the web it only lived for the map trip).

## 4. Imports of other groups' files still missing

None. (`@delivery/components/BottomPopup` imported by relative path `../../../DeliveryV2/components/BottomPopup` — the checker has no `@delivery` alias; same as RatingsReviews.)

## 5. Status

| Screen | Status |
|---|---|
| EditOwner | Built, not tested |
| PhoneNumbersPage | Built, not tested |
| EditRestaurantAddress (+ LocationSearchInput) | Built, not tested |
| DeliverySettings | Built, not tested |
| RestaurantStatus | Built, not tested |
| RushHour | Built, not tested |
| ZoneSetup | Built, not tested |

## 6. Blocked / needs a decision

- PhoneNumbersPage has no backend on the web (numbers not saved, OTP not sent/verified). Nothing to wire; the page is also not linked from anywhere in the web app (only reachable by URL). Left as the web flow minus the sample number.

## Input screens and keyboard handling

| Screen | Inputs | Handling |
|---|---|---|
| EditOwner | ~20 text fields over 4 tabs, place search | `KeyboardAwareScrollView` (`extraOffset` = Save-bar height + 16); the fixed Save bar rides on the keyboard (`useKeyboardOffset`, `bottom: keyboardInset`); pickers / photo / map link dismiss the keyboard first. |
| EditRestaurantAddress | place search in the header | Header is above the map, so the input is always at the top of the screen (never under the keyboard); keyboard closes when a place is picked. |
| ZoneSetup | place search | page is a `KeyboardAwareScrollView`; keyboard closes when a suggestion is picked. |
| PhoneNumbersPage | phone number (Edit sheet), 6 OTP boxes (Verify sheet) | Each `Sheet` body is a `KeyboardAwareScrollView` with Cancel / Save (Verify) at its end, `extraOffset` 90 / 140 so field + buttons stay visible; OTP: values in a ref, auto-advance, Backspace goes back, paste / SMS autofill fills all boxes, `Keyboard.dismiss()` after the last digit and on unmount, first box auto-focused when the sheet opens. |
| LocationSearchInput | search box | parent's scroll view handles it (`keyboardShouldPersistTaps="handled"` so a suggestion tap works with the keyboard up). |

## Test-only buttons kept

None exist in these web files. (RushHour's Confirm has no API call on the web either — not a test button, kept as is.)

## What needs checking on a phone

1. Edit Profile: Save bar on the keyboard, last fields of each tab (Pincode, GST address, FSSAI number) visible above the bar; time + date pickers; photo pick → preview → Save uploads.
2. Edit Profile → "Select from map" → move map / search → Proceed → back on Edit Profile, Restaurant Info tab, address fields filled; header back arrow on the map page returns without changes; Android back also fine.
3. Map pages: no black flash when the suggestion list opens/closes on Edit Address (the map area shrinks while the list shows); first idle not geocoding a saved address; search result not overwritten by the idle after the camera animation.
4. ZoneSetup: map pans inside the scrolling page (react-native-maps should take the gesture), tap drops pin, pin drag, callout, Map/Satellite toggle.
5. PhoneNumbersPage sheets with the keyboard open (Sheet's own KeyboardAvoidingView + KASV — check nothing is lifted twice).
6. Status / Delivery switches revert on API failure; DeliverySettings bottom toast above the nav bar.

## For the integrator (shell)

- `useRestaurantBackNavigation` and the web's `navigate(backTarget)` always **push** (e.g. Edit Profile back/save pushes Outlet Info again), so the native stack grows and Android back walks through old pages. This is shell-wide (every converted page uses it); worth a `navigate(-1)`-when-the-target-is-below rule in the hook or the router.
