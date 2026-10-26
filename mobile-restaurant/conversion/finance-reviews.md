# Group `finance-reviews` — conversion report

Checks (26 Oct): `node scripts/check-converted.cjs` on HubFinance, Feedback, DiningReservations → **0 problems**;
`npx eslint` on them → **0 errors, 0 warnings**. The other 9 files of the group were converted (and checked clean) by
the earlier agent of this group; they were not touched in this pass. Nothing outside the group's files was edited.

## 1. Files converted (web → native, same path)

| Web file | Native file | Not reproduced exactly / why |
|---|---|---|
| `pages/restaurant/HubFinance.jsx` (1469 lines) | same path | **No recharts in this web file** (nothing to redraw). Not a tab: renders `<BottomNavOrders />` itself (last child) and ends its scroll with `max(useRestaurantNavSpace(), 112 (web pb-28))`. Date range popup, custom calendar and the "Withdraw Amount" popup → `Dialog`. The web's `DateRangeCalendar` (components/ui, not in the app) is drawn in the file (same Mon-first 6-week grid, colours, 300 ms auto-close; copy of AllOrdersPage's). "Get report" dropdown → transparent `Modal` placed under the button (tap outside closes it, like the mousedown-outside listener). PDF: html2canvas + jsPDF → the same report HTML → `printHtml(html, { filename: 'finance-report-<range>_<date>.pdf' })` (share / save sheet). `alert()` → webCompat `Alert.alert`. `document.body.style.overflow` lock → not needed (native Modals). The withdraw popup cannot be closed by tapping outside (web: its content layer covered the backdrop): `dismissible={false}`, so it closes only with X / Cancel (Android Back does nothing while it is open). |
| `pages/restaurant/Feedback.jsx` (815 lines) | same path | Kept-alive tab (see below). The `?tab=` query is read from the frozen-aware `useLocation()` (a hidden tab does not react to another page's URL; `useSearchParams` reads the global route). Date range sheet + filter sheets → `Sheet`; custom range → `Dialog` with the in-file `DateRangeCalendar` + "Apply Custom Range". Page swipe (touchstart/move/end) → `onTouchStart/Move/End` on the root View with `nativeEvent.pageX/Y`, same 10 / 50 px thresholds. `isFilterLoading` (set, never shown on the web) dropped; `isLoadingReviews` / `ratingSummary` are still computed but, as on the web, not shown. CSS `uppercase` texts written upper-case; `capitalize` range labels capitalised by hand ("This Week", "Last 5 Days"). The date button shows the raw key (`last5days`, `thisWeek` ...) exactly like the web. |
| `pages/restaurant/DiningReservations.jsx` (1252 lines) | same path | Phone layout = the web's `md:hidden` branch (booking cards; the desktop table is not drawn). `<input type="file" multiple accept="image/*">` → gallery with several photos (`expo-image-picker` `allowsMultipleSelection`, a small helper in the file because `@/lib/media` `pickImage` returns one photo), sent as `{ uri, name, type }` to the same upload calls; a denied permission shows in the page's upload error box. **Web bug fixed**: the web uses `<UtensilsCrossed>` (category without an image) without importing it, so the web throws as soon as such a category is drawn — here it is imported and the intended placeholder shows. `text-[#B80B3D]xl` (invalid class on the web) → the stat numbers keep the web's effective look (16 px, black weight). Grids (categories 2 cols, thumbnails 3 / 2 cols, booking info 2 cols) are measured rows with the web's gaps. framer-motion entrances → short Animated fades; the custom on/off switch animates like the web's knob. Header (web sticky + backdrop-blur) is a fixed white/95 header without blur. |

### Feedback (kept-alive tab) notes
- `useRestaurantTabActive()`: sheets / dialog show only while active and are closed when the tab is left; the
  `<StatusBar style="dark">` is rendered only while active.
- What the web loaded on mount (current restaurant → delivered orders → reviews; complaints when on the Complaints
  tab) loads again each time the tab becomes active (old data stays; complaints show the web's spinner while loading).
- No `BottomNavOrders`; content ends with `max(useRestaurantNavSpace(), 96 (web p-4 + pb-20))`.
- `KeyboardAwareScrollView` (review search field) + `useTabScrollTop` + pull-to-refresh (`#B80B3D`): reloads the
  restaurant, waits for the reviews reload, and reloads complaints (spinner) on that tab.
- Timers of the web's fake 200 ms loading states are cleared on unmount.

## 2. Screens, guards, API calls

| Route | Guard | API calls |
|---|---|---|
| `/food/restaurant/earnings`, `/food/restaurant/hub-finance` (HubFinance) | protectedRoute (restaurant) | GET `/food/restaurant/finance` (getFinance, also with `startDate` / `endDate`), GET `/food/restaurant/withdrawals` (getWithdrawalHistory), getRestaurantByOwner (when finance has no restaurant), POST `/food/restaurant/withdraw` (createWithdrawalRequest); navigates to `/withdrawal-history`, `/notifications`, `/explore`, `/finance-details` |
| `/food/restaurant/feedback`, `/food/restaurant/reviews` (Feedback, kept-alive tab) | protectedRoute via RestaurantTabKeepAlive | getCurrentRestaurant, GET `/food/restaurant/complaints` (fromDate, toDate, complaintType, search), GET `/food/restaurant/orders` (`status: delivered`, `limit 1000`, pages up to 50); navigates to `/help-centre/support` |
| `/food/restaurant/reservations` (DiningReservations) | protectedRoute | getCurrentRestaurant, dining GET `/food/dining/bookings/by-restaurant/:id`, GET `/food/dining/categories/public`, getPendingDiningRequest (15 s poll while a request is pending), POST `/food/restaurant/dining-settings/request`, PATCH `/food/dining/bookings/:id/status`, POST `/food/restaurant/profile/cover-images` + `/menu-images` (multipart `files`), PATCH `/food/restaurant/profile` (remove cover / menu image) |
| FinanceDetailsPage, WithdrawalHistoryPage, DownloadReport, RatingsReviews, DishRatings, ShareFeedback, RestaurantSupport, Hyperpure, ManageOutlets | protectedRoute | converted earlier — see each file's header comment (WithdrawalHistory: GET withdrawals; ShareFeedback: POST feedback-experience; RestaurantSupport: GET / POST support tickets; the others make no API call) |

## 3. Web-only APIs replaced
- `recharts` → none needed (HubFinance has no chart in the web file).
- html2canvas + jsPDF (HubFinance report) → `printHtml` from `@/lib/media` with the same HTML.
- `<input type="file" multiple>` → `expo-image-picker` multi-select (DiningReservations).
- `alert()` → webCompat `Alert.alert`. `document` click-outside listener → transparent Modal backdrop.
- `document.body.style.overflow` → not needed. framer-motion → `Animated` / Sheet / Dialog animations.
- Touch swipe (`e.touches[0].clientX`) → `nativeEvent.pageX` on the root View.

## 4. Missing imports of other groups
None (all imports resolve).

## 5. Status
| Screen | Status |
|---|---|
| HubFinance | Built, not tested |
| Feedback | Built, not tested |
| DiningReservations | Built, not tested |
| FinanceDetailsPage, WithdrawalHistoryPage, DownloadReport, RatingsReviews, DishRatings, ShareFeedback, RestaurantSupport, Hyperpure, ManageOutlets | Built, not tested (converted earlier) |

## Input screens and keyboard handling
| Screen | Inputs | Keyboard |
|---|---|---|
| HubFinance | "Enter Amount to Withdraw" (inside the Withdraw `Dialog`) | the dialog card gets `marginBottom = useKeyboardOffset()`, so the centred card moves up by half the keyboard height and the field + buttons stay above it; `decimal-pad` keyboard, same digit / dot clean-up |
| Feedback | "Search reviews" (top of the tab) | main `KeyboardAwareScrollView` |
| DiningReservations | "Search guests..." (fixed header), "Average price for two (₹)" (in the dining controls) | header field is at the top (never covered); the page is a `KeyboardAwareScrollView`, so the price field scrolls above the keyboard; `number-pad` |
| RestaurantSupport (earlier) | ticket form (subject, order ID, description ...) | `KeyboardAwareScrollView` (see its file) |

## Test-only buttons kept
None — the web files of this group have no test-only buttons.

## 6. Blocked
Nothing blocked.

## Things for the integrator / web quirks kept on purpose
- HubFinance: the "Withdraw" popup's amount check uses `currentCycle.estimatedPayout` exactly like the web.
- Feedback: complaints "issue type" filter sends only the first selected type (web).
- DiningReservations: the 15 s poll compares against the request it was started with (web closure) — kept.
- No shell changes needed.

## To check on a phone
- HubFinance: Withdraw popup with the keyboard open (card fully visible, Submit reachable); "Get report" dropdown
  position under the button; the PDF share sheet and that the A4 report fits the page (`@media print` rule applies);
  the date range popup + custom calendar; bottom bar on this page.
- Feedback: swipe left / right between Complaints and Reviews (should not trigger while scrolling vertically); revisit
  of the tab reloads without flashing; pull-to-refresh; ?tab=complaints from RatingsReviews / notifications opens Complaints.
- DiningReservations: multi-photo upload from the gallery (cover + menu), remove photo, main photo pick; price field
  above the keyboard; the on/off switch while a request is pending (locked); the 15 s approval poll toast.
