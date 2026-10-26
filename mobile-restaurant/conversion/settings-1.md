# Group `settings-1` — conversion report

Checks: `node scripts/check-converted.cjs` on all 8 files → **0 problems**. `npx eslint` on all 8 files → **0 errors, 0 warnings**.
Nothing outside the 8 files (and this report) was edited.

## 1. Files converted (web → native, same path)

| Web file | Native file | Not reproduced exactly / why |
|---|---|---|
| `pages/restaurant/ExploreMore.jsx` (2017) | same (kept-alive tab, `/explore` + `/settings`) | See "ExploreMore notes". |
| `pages/restaurant/OutletInfo.jsx` (516) | same | Header `bg-white/80 backdrop-blur-md` → `expo-blur` under a white/80 layer. `window.confirm` (cover delete) → `Alert` Cancel / OK. The unused `ActionButton` helper (never rendered on the web) is left out. Image upload, cover delete and the "Rename Outlet" dialog have **no control that opens them on the web**; they are converted anyway (picker = converted `ImageSourcePicker`). The default banner / thumbnail are the web's own unsplash fallback URLs (kept for parity — shown only until/unless the restaurant has images; Prince may want them removed). Renders `<BottomNavOrders activeTabOverride="explore" />` itself + `useRestaurantNavSpace()`. |
| `pages/restaurant/OutletTimings.jsx` (411) | same | MUI `MobileTimePicker` → a box showing `hh:mm a` that opens `@react-native-community/datetimepicker` (`mode="time"`, Android dialog via `DateTimePickerAndroid.open`, iOS spinner in a `Sheet` + OK). Stored as `"HH:mm"` like the web; the debounced autosave (500 ms, only after a user edit) is unchanged. Switch colours green-500 / gray-300 set on the track (the kit's colour fade is replaced by the web's two colours). Accordion height animation → short fade/slide. |
| `pages/restaurant/DaySlots.jsx` (846) | same | The web's scroll-snap time wheel is drawn natively (`TimePickerWheel`: 3 `ScrollView`s with `snapToInterval` 40, 192 px high, centre lines, "Okay"); it is **also exported** (named export) because ExploreMore had a copy of the same wheel. `alert()` → `Alert.alert`. **Web bug kept:** `handleSave` uses `STORAGE_KEY`, which is not defined in the web file → ReferenceError → catch → "Error saving slots. Please try again." on every Save (nothing is saved, no navigation). The app does the same (`WEB_STORAGE_KEY = undefined`, see section 6). |
| `pages/restaurant/EditCuisines.jsx` (302) | same | Fixed bottom "Update Cuisines" bar rides on the keyboard (`useKeyboardOffset`). The "max 8" bubble timer is an effect (2.5 s) instead of a bare `setTimeout`. |
| `pages/restaurant/FssaiDetails.jsx` (100) | same | Status-bar inset added above the header. Download button has no action (same as web). |
| `pages/restaurant/FssaiUpdate.jsx` (152) | same | "Valid up to" was a free text box (`DD-MM-YYYY` placeholder) → a field that opens the native **date picker** and writes `DD-MM-YYYY` (as asked for this group). Upload = the converted `ImageSourcePicker` (camera / photo library), exactly what the web opened; **PDF** files are not offered (the web's browser fallback `<input accept="image/*,application/pdf">` could pick a PDF; the app's picker has no document option and I may not edit it). The web sends nothing to the backend here (Confirm = toast "FSSAI details updated" + back) — same in the app. |
| `pages/restaurant/UpdateBankDetails.jsx` (360) | same | `alert()` → `Alert.alert` (same texts). `isFlutterBridgeAvailable()` branch → always the in-app `ImageSourcePicker` (the web's "inside the app" path). Keyboard types: number pad for account numbers, `characters` for IFSC, email-style for UPI ID. |

### ExploreMore notes
- Kept-alive tab rules: `useRestaurantTabActive()`; **no `BottomNavOrders`**; scroll content `paddingBottom = 24 (py-6) + max(96 (pb-24), useRestaurantNavSpace())`; `useTabScrollTop(scrollRef)`; `RefreshControl` tint `#B80B3D` reloads exactly the mount data (refresh current restaurant + schedule-off entry); `<StatusBar style="dark">` only while active.
- Mount data (restaurant + `restaurant_schedule_off`) reloads every time the tab becomes active (old data stays visible); the `ownerDataUpdated` / `addressUpdated` listeners exist only while active. All popups close when the tab is hidden (web unmount).
- Log-out (both buttons in "My profile" and in the Logout popup) and successful Delete Account: popups close **at once** (`Dialog animateOut={false}` via a `leaving` flag) and `navigate('/food/restaurant/login', { replace: true })`; the web's 300 ms delay is dropped (delivery app behaviour). The restaurant's own popup look (avatar, name, phone, email, Logout / Logout from all devices / Cancel) is kept — not the Captain-style redesign of the delivery app.
- Firebase sign-out: web called `ensureFirebaseInitialized({ enableAuth: true })` then `signOut` if a user existed. The app never signs in to Firebase Auth, so it only signs out when an auth instance already exists with a user (no Auth initialisation on log-out).
- Schedule-off flow (reason sheet → dates/times sheet → success; existing-schedule sheet + Delete Schedule) is converted although **no item opens it on the web** (no menu item has id 5). The web's `DateRangeCalendar` → native date picker per button (start / end; an end before the start swaps them); its time wheel → `TimePickerWheel` from DaySlots (`okBold`).
- Search popup: a top sheet `Modal` sliding down (web `y: -100% → 0` spring), input `autoFocus`, results in a `KeyboardAwareScrollView` (max 70 % of the screen). Tapping "Takeaway" in search results does nothing but close the search (same as web: it has no route and the search handler only knows id 5 / routes).
- Balance-warning amount: web class `text-[#B80B3D]xl` is invalid, so the amount is black, font-black, default size — kept.
- framer-motion entrance animations → `Animated` fade/slide with the web's delays on first mount.

## 2. Screens, guards, API calls

| Route | Guard | API calls |
|---|---|---|
| `/food/restaurant/explore`, `/settings` (ExploreMore, kept-alive) | `RestaurantTabRoute` (protected, restaurant) | `restaurantAPI.refreshCurrentRestaurant()` (GET current restaurant), `restaurantAPI.updateTakeawaySettings({ isEnabled })`, `authAPI.checkBalance('restaurant')`, `authAPI.deleteAccount('restaurant')`, `restaurantAPI.logout()`, `authAPI.logoutFromAllDevices('restaurant')` |
| `/food/restaurant/outlet-info` | protectedRoute | `refreshCurrentRestaurant()`; (unreachable on web) `uploadProfileImage` POST `/food/restaurant/profile/profile-image`, `uploadMenuImage` POST `/food/restaurant/profile/menu-image`, `getCurrentRestaurant()`, `updateProfile({ menuImages })` / `({ name })` |
| `/food/restaurant/outlet-timings` | protectedRoute | GET `/food/restaurant/outlet-timings`, PUT `saveOutletTimings` `/food/restaurant/outlet-timings` `{ outletTimings }` |
| `/food/restaurant/outlet-timings/:day` (DaySlots) | protectedRoute | none (localStorage only, see the web bug) |
| `/food/restaurant/edit-cuisines` | protectedRoute | `getCurrentRestaurant()`, `updateProfile({ cuisines })` |
| `/food/restaurant/fssai` | protectedRoute | none |
| `/food/restaurant/fssai/update` | protectedRoute | none |
| `/food/restaurant/update-bank-details` | protectedRoute | `getCurrentRestaurant()`, `uploadAPI.uploadMedia(file, { folder: 'food/restaurants/upi-qr' })`, `updateProfile({ accountHolderName, accountNumber, ifscCode, upiId, upiQrImage })` |

## 3. Web-only APIs replaced
- `framer-motion` → `Animated` (fade / slide / spring); `AnimatePresence` popups → `Dialog` / `Sheet` (`@/native/ui`), shadcn `Dialog` (DaySlots delete) from the converted kit, a top-sheet `Modal` (search).
- `lenis`, `document.body.style.overflow` scroll locks → nothing.
- `@mui/x-date-pickers` `MobileTimePicker` → `@react-native-community/datetimepicker`; `DateRangeCalendar` → native date picker; the HTML scroll-snap wheel → native snapping ScrollViews.
- `alert()` / `window.confirm()` → `Alert.alert`.
- `<input type="file">` + `isFlutterBridgeAvailable()` → the converted `ImageSourcePicker` (camera / library).
- `<img>` → `AppImage`; `backdrop-blur` → `expo-blur`; gradients → `expo-linear-gradient`.
- `import("firebase/auth")` (dynamic) → static `signOut` import; see ExploreMore notes.
- `window.location.pathname` in ExploreMore's `navigate(item.route, { state: { from } })` → `useLocation().pathname`.

## 4. Imports of other groups' files
None. ExploreMore imports `TimePickerWheel` from `DaySlots.jsx` (this group). Navigation targets owned by others: `/edit-owner`, `/reservations`, `/menu-categories`, `/delivery-settings`, `/zone-setup`, `/orders/all`, `/feedback`, `/help-centre/support`, `/Share-Feedback` (router maps it to `share-feedback`), `/hub-finance`.

## 5. Status
All 8 screens: **Built, not tested** (no app run allowed).

## 6. Blocked / needs a decision
- **DaySlots Save never works (web bug kept for parity):** the web references an undefined `STORAGE_KEY`. Nothing in the app opens `/outlet-timings/:day` (OutletTimings does not link to it, same as web). To fix, set `WEB_STORAGE_KEY` in `DaySlots.jsx` to the intended key (and decide whether it should use the backend outlet timings instead) — Prince's call.
- FssaiUpdate has no backend (web too): number, date and file are not sent anywhere.
- PDF upload for FSSAI needs a document option in `ImageSourcePicker` (shell/other owner) or a decision to keep images only.

## 7. Input screens and keyboard
| Screen | Input(s) | Handling |
|---|---|---|
| ExploreMore — search popup | "Search features..." (autoFocus) | input at the top of the top sheet; results are a `KeyboardAwareScrollView` (room for the keyboard at its end) |
| ExploreMore — Delete Account popup | "Type DELETE to confirm" | `Dialog` lifted with `marginBottom: useKeyboardOffset()` |
| OutletInfo — Rename Outlet dialog (unreachable on web) | outlet name | `Dialog` lifted with `useKeyboardOffset()` |
| EditCuisines | "Search cuisines" | list is a `KeyboardAwareScrollView`, the search box is at its top; fixed Update bar rides on the keyboard (`useKeyboardOffset`) |
| FssaiUpdate | registration number (Valid up to = date picker, no keyboard) | `KeyboardAwareScrollView` (`extraOffset` 96 so the field clears the Confirm bar); Confirm bar rides on the keyboard (`marginBottom: useKeyboardOffset()`) |
| UpdateBankDetails | holder name, account no., confirm, IFSC, UPI ID | `KeyboardAwareScrollView` (`extraOffset` 40 keeps the error line visible); Submit is the last item of the form |
| OutletTimings, DaySlots, FssaiDetails | none (pickers only) | — |

## 8. Test-only buttons kept
None in these files.

## 9. Check on a phone
- ExploreMore: log-out from both popups (no flash, lands on login, Back does not return); Delete Account with balance > 0 and = 0; "Type DELETE" popup above the keyboard; Takeaway save + toast; search popup slides down with keyboard and results scroll; pull-to-refresh; tab switch → back to top; Back from a page keeps the place; popups close when another tab is tapped.
- Grid tiles: 3 per row at 360–412 px (tile width computed from the window width).
- OutletTimings: Android time dialog sets the right value, autosave hits the backend once per change; Switch colours.
- DaySlots wheel: snapping, initial position on open, selected value read correctly after a fling (Android), period wheel.
- OutletInfo: blur header look, banner/thumbnail overlap, bottom bar shows Explore lit and does not cover the last card.
- EditCuisines: bar above the keyboard on edge-to-edge Android; max-8 bubble position.
- UpdateBankDetails: QR upload from camera and gallery (5 MB check uses the picker's `size`), alerts.
- FssaiUpdate: date picker, picker dialog, Confirm enabled after an image.
