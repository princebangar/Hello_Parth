# Group `orders` — conversion report

Checks: `node scripts/check-converted.cjs` on all 9 files → **0 problems**. `npx eslint` on all 9 files → **0 errors**
(11 warnings: unused catch variables / unused eslint-disable comments). Nothing outside the 9 files was edited.

## 1. Files converted (web → native, same path)

| Web file | Native file | Not reproduced exactly / why |
|---|---|---|
| `pages/restaurant/OrdersMain.jsx` (5046 lines) | same path (~4080 lines) | See "OrdersMain notes" below. |
| `pages/restaurant/AllOrdersPage.jsx` | same | The web's `components/ui/date-range-calendar` is not in the app: drawn inside the file (same Mon-first 6-week grid, colours, selection + 300 ms auto-close). framer-motion card entrance → short fade/scale per card. Popups → `Dialog` / `Sheet` / transparent `Modal`. |
| `pages/restaurant/OrderDetails.jsx` | same | jsPDF + autoTable receipt → same document as HTML → `printHtml(..., { filename: 'Order_Receipt_<id>.pdf' })` (share/save sheet). `window.location.reload()` (Try Again, after Resend) → the order is fetched again. Lenis → native scroll. The web's own bottom toast is kept. |
| `pages/restaurant/Notifications.jsx` | same | List is a `FlatList`. |
| `components/restaurant/NewOrderNotification.jsx` | same | Fixed top card → transparent native `Modal` (above every page + the bottom bar), same spring from y −50; Android Back = Dismiss; the card body scrolls if the order is taller than the screen (web ran off the page). |
| `components/restaurant/LiveDishNotice.jsx` | same | `menuItemsFromResponse` came from the desktop `desktopData.js` (not in the app) — copied into the file. `LiveDishBanner` takes `style` (web `className`) and a new optional `reloadKey` (re-read the menu when the kept-alive tab is shown again). Popup → bottom `Sheet`. |
| `components/restaurant/ResendNotificationButton.jsx` | same | — |
| `components/restaurant/RestaurantNavbar.jsx` | same, same default export + props | Header now includes the status-bar inset (`paddingTop: insets.top`) — screens that put it first must NOT add their own top safe-area padding (Inventory, ZoneSetup groups). backdrop-blur on the status pill → same colours without blur. The "New Table Request!" popup → transparent `Modal`, shown only from the screen that is on screen (`useRestaurantTabActive`) so the two kept-alive navbars (Orders + Inventory) never show it twice. On a kept-alive tab it reloads restaurant data + outlet timings each time the tab is shown again (no "Loading..." flash). |
| `hooks/useRestaurantNotifications.js` | same (rewritten from the web file; the first-pass copy was an older version) | See section 3. |

### OrdersMain notes
- Kept-alive tab: no `BottomNavOrders`; content `paddingBottom: max(96 (web pb-24), useRestaurantNavSpace())`; `useTabScrollTop(contentRef)`; pull-to-refresh (`RefreshControl`, `#B80B3D`) reloads settings, counts, verification status, popup check, live-dish banner and remounts the shown list (its own "Loading..." state).
- Everything the web ran while mounted runs only while `tabActive`: accept-time settings poll (30 s), counts poll (30 s), popup check (8 s), AllOrders/Takeaway 10 s poll + 1 s countdown, Dining bookings 8 s poll, Preparing countdown + 2 s auto-mark-ready, the popup queue, countdown/auto-reject, the ring control, `restaurantSearchUpdated` / `unhandledrejection` listeners, onboarding redirect (no navigate while hidden). Lists reload when the tab is shown again (old data stays).
- Leaving the tab closes all popups like the web's unmount; the order stays queued and pops again (countdown recalculated from `createdAt`) when the tab is back. The ring is left to the shared hook (web behaviour after unmount: `RestaurantRealtimeShell` card + ring on other pages).
- Slide to accept: `PanResponder` on the handle, same maths (handle 40, travel `width-56`, 0.45 threshold); a tap on the handle accepts (web `onClick` did). Countdown bar kept (same gradient as the track, like the web).
- Not carried over (dead on the web): swipe-between-tabs touch handlers (never attached), `handlePrint` jsPDF receipt (referenced an undefined `orderToPrint`, no button calls it), `notificationSound` constant, `isConnected`.
- Error boundary kept; "Reload Page" remounts the screen (no page reload in an app).
- `alert()` → webCompat `Alert.alert` (reverify messages).
- Web quirks kept on purpose (parity): the in-screen search box only sets `searchQuery`; results come only from the navbar's `restaurantSearchUpdated` event, which OrdersMain's hidden navbar search never sends → any search shows "No results found" (same as web). `restaurantAPI.reverify` does not exist in the API layer (web and app) → "Reverify" always shows "Failed to reverify restaurant. Please try again." The dining-booking toast compares against the value captured when the poll effect started (web: always 0).
- Order lists are `.map` inside the screen `ScrollView` (they sit under banners/buttons in one scroll, as on the web; sizes are the API's default page of 50).

## 2. Screens, guards, API calls

| Route | Guard | API calls |
|---|---|---|
| `/food/restaurant`, `/food/restaurant/orders` (OrdersMain, kept-alive tab) | protectedRoute (restaurant) via RestaurantTabKeepAlive | GET `/food/restaurant/orders` (restaurantAPI.getOrders, many lists + popup check + counts `limit 100`), GET current restaurant, GET restaurant settings (accept-time), GET pending dining request, dining GET restaurant bookings / PATCH booking status, POST accept (with prep time), reject, mark ready, complete takeaway (OTP), resend delivery notification, `restaurantAPI.reverify` (missing), GET menu (live-dish), refresh current restaurant + GET outlet timings (navbar), notification inbox (navbar) |
| `/food/restaurant/orders/all` (AllOrdersPage) | protectedRoute | GET orders `page 1 limit 1000`, GET current restaurant |
| `/food/restaurant/orders/:id` (OrderDetails) | protectedRoute | GET order by id (readable id, then `location.state.mongoId`), resend delivery notification |
| `/food/restaurant/notifications` | protectedRoute | GET orders `page 1 limit 30`, notification inbox (get / mark read / dismiss / dismiss all) |
| Global card (NewOrderNotification) | shell: approved, signed-in, non-order, non-auth pages | — (data from the hook) |
| Hook | — | GET current restaurant, socket.io (`join-restaurant`; `new_order`, `new_dining_booking`, `play_notification_sound`, `order_status_update`, `admin_notification`), 8 s GET orders poll |

## 3. Web-only APIs replaced
- `new Audio()` / fetched blob URL → one `expo-audio` player of `assets/sounds/restaurant_alert.mp3`, `setAudioModeAsync({ playsInSilentMode, shouldPlayInBackground, interruptionMode: 'duckOthers' })`; each ring = `seekTo(0)` + `play()` every 4.5 s exactly like the web loop (orders and dining requests).
- `navigator.vibrate([200,100,200,100,300])` → `Vibration.vibrate([0,200,100,200,100,300])`; `Vibration.cancel()` on stop.
- Flutter bridge (`triggerWebViewNativeNotification` / `stopWebViewNativeNotification`), browser `Notification` / service-worker notification + permission prompt, "unlock audio on first tap" → removed (FCM push on `restaurant_orders` channel).
- Module-load reads of `localStorage` (muted / processed ids, mute flag) → read on first use of the hook (storage is hydrated after modules load). `Object.keys(localStorage)` → `localStorage.key(i)`.
- Added: when the app returns to the front (`visibilitychange` → AppState) a dropped socket reconnects, then the poll runs.
- `window.location.reload()` → refetch / remount; `jsPDF` → `printHtml`; `navigator.clipboard` (webCompat); `framer-motion` → `Animated`; `lucide-react` → `lucide-react-native`; inline SVG → `react-native-svg`.

## 4. Imports of other groups' files
None of my files import other groups' files. (OrderDetails/AllOrders/Notifications navigate to routes owned by others: `/food/restaurant/support`, `/status`, `/dining-reservations`, `/hub-menu/item/new`, `/inventory`, `/onboarding`.)

## 5. Status
All screens: **Built, not tested** (no app run allowed).

## 6. Input screens and keyboard
| Screen | Input | Handling |
|---|---|---|
| OrdersMain | order search (top, fixed area above the scroll) | sits at the top, never covered; scroll has `keyboardShouldPersistTaps="handled"` |
| OrdersMain | takeaway 4-digit OTP in a Dialog | `useKeyboardOffset()` → dialog `marginBottom` lifts it above the keyboard; dialog content is a ScrollView limited to `window − keyboard`; refocus after a wrong OTP kept |
| RestaurantNavbar | search bar (only when `showSearch && !hideSearch`) | at the top of the page |
| AllOrdersPage | search by order ID (list header) | top of list, `keyboardShouldPersistTaps` |
| AllOrdersPage | filter "Search" inside the filter Sheet | `Sheet` has a KeyboardAvoidingView; input is at the top of the sheet |

## 7. Test-only buttons kept
None exist in these web files (the `[Async Error]` toast on unhandled rejections is a debug aid from the web and is kept).

## 8. Check on a phone
1. New order with the app in front, in background and with the screen off: popup + ring (4.5 s replays), vibration, mute/unmute, slide-to-accept and tap-on-handle, reject reasons, auto-reject countdown.
2. New order while on Inventory / Explore: global card + ring; "View Order" → Orders tab popup opens with the right countdown.
3. Switching tabs with the popup open: popup closes, ring continues, comes back on return.
4. Takeaway OTP dialog above the keyboard; AllOrders filter sheet search with keyboard.
5. Receipt PDF share (OrderDetails print button).
6. Navbar header under the status bar on Orders / Inventory / ZoneSetup (no double top padding).
7. Pull-to-refresh on Orders.

## 9. For the integrator (shell / other groups)
- `RestaurantNavbar` now draws the status-bar inset itself: Inventory and ZoneSetup must place it at the very top without extra top safe-area padding (Inventory's web `sticky top-0 bg-white` wrapper is fine).
- `Dialog` (native/ui/Sheet.jsx) has no keyboard handling; I lifted the OTP dialog with `useKeyboardOffset`. Other groups with inputs in a Dialog need the same (or the shell could add it).
- `restaurantAPI.reverify` is missing in `services/api` (also missing on the web) — the Reverify button can never succeed. Backend/API change needed if it should work.
