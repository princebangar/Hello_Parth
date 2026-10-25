# Group "taxi-trip" — conversion report

Check: `node scripts/check-converted.cjs` on all 10 files below: **10 files, 0 problems** (2026-10-24).
Status of every screen/component: **Built, not tested** (no device / emulator run in this step).

## 1. Web file → native file

All paths are under `Frontend/src/` → `mobile-user/src/` (same path, same default export, same props except `className` → `style`).

| Web | Native | Not reproduced exactly / notes |
|---|---|---|
| modules/Taxi/modules/user/pages/ride/Support.jsx | same path | `motion.button whileTap` → Pressable pressed scale. `.service-art` / `.user-section-title` from Taxi/index.css done by hand. |
| modules/Taxi/modules/user/pages/ride/PublicRideTrack.jsx | same path | GoogleMap → `AppMap` + `Marker` (circle dots). `fitBounds(…, 80)` → `fitToCoordinates` edgePadding 80, `panTo` → `animateCamera`. The "Loading map..." branch is gone (native map is always there). |
| modules/Taxi/modules/user/pages/ride/RideTracking.jsx | same path | All ride logic copied 1:1 (hydrate `/rides/:id`, active-ride validator with backoff + `visibilitychange`, socket `ride:state` / `ride:driver-location:updated` / `ride:status:updated`, Firebase fallback `subscribeRideRealtime`, route cache/trim/refresh, waiting clock, scheduled ride, share link, cancel). Map: `OverlayViewF` markers → `Marker` with a rotated vehicle `Image` (`rotation` + `flat`) and a 14 px circle; `PolylineF` → `Polyline`; `fitBounds` → `fitToCoordinates` (same padding 120/48/300/48), `panTo+setZoom(15)` → `animateCamera`. The "Google Maps key missing / failed to load" boxes are dropped (the key is in the native config). Drop-shadow on the vehicle marker image and the 500 ms rotate transition are not drawn (marker rotation snaps). Share sheet = own transparent Modal (fade + slide 48 px). `window.alert` → `Alert.alert`. Web fallbacks `'James Bond'`, `'MH12AB1234'`, `'Blue'` are kept because the web shows them — **they are fake placeholder texts; please decide if they should go** (I did not change web behaviour). |
| modules/Taxi/modules/user/pages/ride/RideComplete.jsx | same path | Razorpay via `@/lib/razorpay` (`new Razorpay(options)`, same options, `handler`, `modal.ondismiss`, `payment.failed`); `loadRazorpayScript` from the lib (always resolves). Unused web state `selectedOnlineMethod` / `ONLINE_PAYMENT_OPTIONS` (never rendered) dropped. |
| modules/Taxi/modules/user/pages/ride/RideDetail.jsx | same path | Share uses `navigator.share` (webCompat → RN Share), clipboard toast branch kept. |
| modules/Taxi/modules/user/pages/ride/Chat.jsx | same path | Ride chat + admin/support chat (`?admin=true`) exactly as web. Emoji strip regex built at runtime with a fallback in case Hermes lacks `\p{Extended_Pictographic}`. Enter-to-send → `onSubmitEditing` (`submitBehavior="submit"`). AnimatePresence `initial={false}` reproduced (rows present when the list appears do not animate). |
| modules/Taxi/modules/user/pages/support/SupportTickets.jsx | same path | `<select>` → a pressable field that expands an inline option list (no picker package installed). Bottom sheet → foundation `Sheet` (timing slide instead of spring 26/320). |
| modules/Taxi/modules/user/pages/support/SupportTicketDetail.jsx | same path | Fixed reply bar → bottom View under the ScrollView; `Screen keyboard`. |
| modules/Taxi/modules/user/pages/safety/SOSContacts.jsx | same path | Gradient card → `expo-linear-gradient`. Delete confirm → foundation `Dialog` (scale/fade; web also slid 40 px). SOS countdown interval now also cleared on unmount. |
| modules/Taxi/modules/shared/components/UserSupportChatPanel.jsx | same path | Participant (rider / captain) thread converted fully. The admin desk branch (`mode="admin"`, admin app only, not reached from the user app) is converted as the mobile one-column layout (conversation list above the thread, list capped at 280 px). |

### Colours: the Taxi `user-app-theme` scope
Every one of these screens renders inside `#taxi-app-root.user-app-theme` on the web, so `modules/Taxi/index.css` `!important` remaps apply in **light and dark**. They were applied by hand per element:
`bg-white*`, `bg-slate-50`, `bg-slate-900` (on divs) → `--user-card-bg`; `bg-slate-100/200`, `bg-*-50` tints, `bg-white/10` → `--user-card-soft`; page gradients → `--user-bg`; `text-slate-900/800`, **`text-white`** → `--user-text-primary`; slate/gray 300–700 → secondary; 500 → muted; listed borders → `--user-border`; `button.bg-slate-900` → yellow `#FFC400` with `#0b1220` text; `bg-orange-500 / yellow-400 / amber-500` → accent; `text-orange-500 / amber-500` → accent; `shadow-*` → `0 12px 30px -10px rgba(0,0,0,.15)`; `font-black/extrabold` → 700, `font-bold` → 600; `text-[9px]` → 10.5 px; `blur-3xl` blobs hidden; inputs → card-soft + accent focus border.
Consequence copied from the web on purpose: `text-white` on coloured buttons becomes the dark primary text in light mode (e.g. "Rebook Ride" on `#1C2833`, the red SOS card text, the "Remove" button) — that is how the web renders today.

## 2. Screens, guards, API calls

Route files are not mine (Taxi shell owns `src/app/taxi/...`); none existed when I finished. Web routes (TaxiApp.jsx):

| Route (web) | Screen | Guard | API (from web code) |
|---|---|---|---|
| `/taxi/user/ride/tracking` | RideTracking | logged-in user (`UserProtectedRoute`) | `GET /rides/:id`, `GET /rides/active/me` (or `/deliveries/active/me` for parcel), `PATCH /rides/:id/cancel`, `POST /rides/:id/share`; socket `ride:join`, listens `ride:state`, `ride:driver-location:updated`, `ride:status:updated`; Firebase RTDB ride node when the socket is down; Routes API (via `googleRoutes.computeDrivingRoute`); CancellationFeeNotice's own calls |
| `/taxi/user/ride/complete` | RideComplete | logged-in user | `GET /rides/app-settings/tip`, `GET /rides/:id` (every 5 s), `userAuthService.getWallet()`, `POST /rides/:id/complete-payment/razorpay/order` + `/verify`, `POST /rides/:id/complete-payment/wallet`, `POST /rides/:id/tip/razorpay/order` + `/verify`, `PATCH /rides/:id/feedback` |
| `/taxi/user/ride/chat`, `/taxi/user/parcel/chat` | Chat | logged-in user | socket `ride:join`, `ride:message:send`; listens `ride:state`, `ride:joined`, `ride:message:new`, `errorMessage`, `connect`. With `?admin=true`: UserSupportChatPanel |
| `/taxi/user/ride/detail/:id`, `/taxi/user/parcel/detail/:id` | RideDetail | logged-in user | `GET /rides/:id` (when no `state.ride`) |
| `/taxi/user/support` | Support | logged-in user | — (tel: link, navigation) |
| `/taxi/user/support/tickets` | SupportTickets | logged-in user | `supportTicketService.getTitles(requesterType)`, `listMyTickets({page:1,limit:100})`, `createTicket` |
| `/taxi/user/support/ticket/:id` | SupportTicketDetail | logged-in user | `supportTicketService.getMyTicket(code)`, `replyMyTicket(code,{message})` |
| `/taxi/user/safety/sos` (+ alias `/taxi/user/user/safety/sos`) | SOSContacts | logged-in user | `GET/POST /users/me/emergency-contacts`, `DELETE /users/me/emergency-contacts/:id`, `triggerUserSosAlert()` |
| `/taxi/track/:token` | PublicRideTrack | anyone (no login) | `GET /common/track/:token` every 5 s until `ended` |
| (component) | UserSupportChatPanel | session token required | `getSupportConversations`, `getSupportMessages`, `markSupportMessagesRead`, `sendSupportMessage`, `deleteSupportConversation`; socket `chat:join`, `chat:read`, `chat:send`; listens `chat:message`, `chat:conversation-updated`, `chat:conversation-deleted`, `errorMessage`, `connect`, `disconnect` |

## 3. Web-only APIs replaced
`@react-google-maps/api` (GoogleMap, OverlayViewF, PolylineF, MarkerF, LatLngBounds) → `AppMap`/`Marker`/`Polyline` + `fitToCoordinates`/`animateCamera`; `window.Razorpay` + script tag → `@/lib/razorpay`; `window.open('tel:')`, `<a href=wa.me|sms:>` → `Linking.openURL`; `window.alert` → `Alert.alert`; `navigator.share/clipboard`, `document.hidden/visibilitychange`, `localStorage` → webCompat (unchanged code); framer-motion → `Animated`; `<select>` → inline option list; `<img onError>` → `AppImage` (`fallback`/`onError`), `brightness-0 invert` → `tintColor="#fff"`; scroll-to-bottom → `ScrollView.scrollToEnd`; `fixed` bars → sibling Views; bottom sheets / modals → foundation `Sheet` / `Dialog` / RN `Modal`.

## 4. Imports of other groups' files
All resolved when I finished: `modules/Taxi/shared/context/SettingsContext.jsx` (taxi-shell), `modules/Taxi/modules/user/components/CancellationFeeNotice.jsx` and `modules/Taxi/shared/utils/googleRoutes.js` (taxi-ride), `shared/components/Loader.jsx` (`Spin`, shell), `shared/utils/nativeShell.js` (shell), `modules/Taxi/modules/shared/components/ChatUnreadBadge.jsx` (shell).
Not present yet: the Taxi route files under `src/app/taxi/...` for the routes in §2 (taxi-shell).

## 5. Status
Support, PublicRideTrack, RideTracking, RideComplete, RideDetail, Chat, SupportTickets, SupportTicketDetail, SOSContacts, UserSupportChatPanel: **Built, not tested**.

## 6. Blocked / notes
- Nothing blocked by credentials or backend.
- RideTracking marker rotation uses `react-native-maps` `rotation` + `flat`; check it on a device (custom-view markers on Android need `tracksViewChanges` true while the image loads — done for 800 ms after each icon change).
- `fitToCoordinates` edgePadding is in device pixels on some Android versions of react-native-maps, so the framing can be a little tighter than the web.
