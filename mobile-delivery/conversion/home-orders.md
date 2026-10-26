# Group home-orders — conversion report

Status of every screen / component: **Built, not tested** (the app was not run).

## 1. Files converted (web `Frontend/src/<path>` → `mobile-delivery/src/<path>`)

| Web file | Native file | Not reproduced exactly / notes |
|---|---|---|
| modules/Food/hooks/useDeliveryNotifications.js | same | Same socket events, queue rules, 10 s loop / 2 min Feed ring cap, 15 s dedupe, muted ids in `localStorage`, `emitLocation`, `recoverDeliveryState`. Removed: browser `Notification` / service-worker notification + permission prompt, Flutter bridge ping, WebAudio synth (now vibration only), first-tap audio unlock, `window.__deliverySocketDebug` (no globals). Added: socket `connect()` when the app comes back to the front with a dropped socket. |
| modules/DeliveryV2/pages/DeliveryHomeV2.jsx | same | Kept-alive. The trip panel slides in when it opens or is restored; when minimized it disappears at once (no slide-out). `window.location.reload()` after session expiry → a second replace-navigation to `/food/delivery/login`. The map's "Navigation2" button calls `setOptions({ gestureHandling })` → no-op (the native map already pans with one finger). The GPS callback reads order / route / trip status / ETA from refs, so it always sends the current order. On the web the watch callback kept the values from when it started. |
| modules/DeliveryV2/pages/OrdersV2.jsx | same | Kept-alive, no bottom bar of its own. The header gets the status-bar height on top (edge-to-edge). |
| components/map/LiveMap.jsx | same | react-native-maps (Google). Route from `@/lib/google computeRoute` (Routes v2). Distances by haversine. Not reproduced: web `heading`/`tilt=45` props (the raster web map ignored them too) and the 0.5 s CSS glide of the rider marker. |
| components/map/map.icons.js | unchanged (already copied) | The SVG strings stay. LiveMap draws `CUSTOMER_PIN_SVG` with `react-native-svg` `SvgXml` inside a `Marker`. |
| components/modals/PickupActionModal.jsx | same | Absolute layer that ends above the bottom bar (web `bottom-[92px]`), not a native Modal. Bill photo via `openCamera` / `openGallery` → `uploadAPI.uploadMedia`. |
| components/modals/DeliveryVerificationModal.jsx | same | OTP → payment (QR / cash) → complete. The steps are absolute panels above the bar (web `bottom-[104px]`). The QR popup is a `Dialog`. |
| components/modals/NewOrderModal.jsx | same (also a default export) | Bottom `Sheet`. A tap on the backdrop does nothing (same as the web). The Android back button minimizes the popup. |
| components/modals/OrderSummaryModal.jsx | same (also a default export) | Full-screen `Overlay`. The Android back button = "Go Back Home". |
| components/orders/NewOrderCard.jsx | same | Added optional prop `onRequestScroll(overlap)`. The web called `window.scrollBy`; now OrdersV2 scrolls its ScrollView. |
| components/orders/AcceptedOrderCard.jsx, OrderSwitcher.jsx | same | — |
| components/ui/ActionSlider.jsx | same | PanResponder + Animated. Thresholds unchanged: progress > 0.8 or a 150 px drag, `isAcceptingRef` lock, reset on failure / disabled. `color` (Tailwind class) is mapped to the theme colour. |
| hooks/useOrderManager.js, store/useDeliveryStore.js | unchanged (already copied) | check-converted: 0 problems. |

## 2. Screens, guards, API calls
Both screens are protected (signed-in rider only). DeliveryTabKeepAlive renders them inside the signed-in shell.
- **DeliveryHomeV2** (/food/delivery, /feed, /pocket, /history, /profile):
  - `GET deliveryAPI.getEmergencyHelp`, `getProfile`
  - `getCurrentDelivery` (sync + poller), `getOrders({limit:20,page:1})` (poll 12 s with socket / 5 s without)
  - `updateOnlineStatus`, `updateLocation`, `rejectOrder`
  - useOrderManager: accept / reachPickup / pickUp / reachDrop / completeDelivery
  - socket `update-location`, Firebase `writeOrderTracking`
  - useNotificationInbox('delivery')
- **OrdersV2** (/food/delivery/orders): `getCurrentDelivery`, `getOrders`, `rejectOrder`, `acceptOrder`.
- **LiveMap**: `zoneAPI.getPublicZones`, Google Routes `computeRoutes`.
- **PickupActionModal**: `uploadAPI.uploadMedia` (folder `helloparth/delivery/bills`).
- **DeliveryVerificationModal**: `verifyDropOtp`, `getPaymentStatus` (5 s poll), `createCollectQr`.
- **Hook**:
  - socket events `join-delivery`, `resync`, `new_order`, `new_order_available`, `active_orders`, `active_order`, `delivery_capacity`, `play_notification_sound`, `order_ready`, `order_status_update`, `order_cancelled`, `order_deleted`, `order_reassigned_elsewhere`, `order_claimed`, `admin_notification`
  - REST: `getMe`, `getOrders`, `getCurrentDelivery`

## 3. Web-only APIs replaced
- `new Audio` → expo-audio `createAudioPlayer(assets/sounds/restaurant_alert.mp3)` with `setAudioModeAsync({ playsInSilentMode, shouldPlayInBackground, interruptionMode: 'duckOthers' })`.
- `navigator.vibrate` → `Vibration.vibrate([0,200,100,200,100,300])`.
- framer-motion → Animated.
- `@react-google-maps/api` → AppMap / Marker / Polyline / Polygon.
- `google.maps.geometry` → `getHaversineDistance`.
- `Route.computeRoutes` → `computeRoute`.
- `window.location.href = tel:` and `window.open(maps)` → `Linking.openURL` (the same Google Maps URLs).
- `<input type=file>` → the system camera / gallery.
- `window.scrollBy` → `ScrollView.scrollTo`.
- `import.meta.env.DEV/PROD` → `__DEV__`.
- Feed popups → `Sheet`.

## Kept-alive: effects gated by `tabActive`
**DeliveryHomeV2**:
- `authRefreshFailed` listener.
- Simulation glide interval.
- GPS `watchPosition` (online + feed tab).
- 15 s heartbeat.
- `claimedOrderId` cleanup.
- Available-order poller + visibilitychange.
- `orderStatusUpdate` (cancel) handling.
- Admin-notification toast.
- Incoming-offer popup and its ring (`feedOffer` is null while hidden).
- Emergency / notification sheets.
- Status bar.
- Reloaded each time the screen becomes active (old data stays on screen): emergency numbers + profile photo, current-trip sync, `updateOnlineStatus`.

**OrdersV2**:
- Reloaded on each activation: hydrate (current + available).
- The opening 10 s ring.
- The "new offer arrived" ring + switch to the New tab (the count ref keeps updating while hidden).
- Status bar.

There is no `navigate()` from an effect.

## Background location handler
While `isOnline`, DeliveryHomeV2 registers `setRiderBackgroundHandler` (this does not depend on `tabActive`; cleanup on offline / unmount). The handler and the foreground watch share `handleRiderPosition(coords)`, which does what the web watch callback did:
- skip in SIM mode;
- `setRiderLocation`;
- rolling speed;
- auto-arrival (non-DEV, ≤ 100 m: `reachPickup` / `reachDrop`);
- every 25 m / 7 s: `deliveryAPI.updateLocation`, plus `emitLocation` and `writeOrderTracking` for the active order.

It reads the active order, polyline, trip status, ETA, distance and the order-manager actions from `liveRef`, so values are never stale.

## Alert sound in the background
- One expo-audio player is created on mount and the audio mode allows background play.
- `playNotificationSound` vibrates, sets `loop = true`, seeks to 0 and plays.
- The web's timers decide when it stops, unchanged: 10 s (`startAlertLoop`), the 2 min Feed popup cap (`ringUntilHandled`), and stop on accept / pass / claimed / empty queue.
- JS timers and the socket keep running in the background because the "You are online" foreground service keeps the process alive. So an offer that arrives over the socket with the screen off rings the same way.
- With the app killed, only the FCM push (channel `default`) remains, as before.

## Test buttons kept (parity)
- Header **"SIM"** toggle (DEV builds only, `__DEV__`, the web's `import.meta.env.DEV`).
- The map's **Play** simulation button (always visible, like the web). It fakes rider movement along the route and sends `updateLocation` / socket / Firebase every 2 s.

## Keyboard (input screens)
- DeliveryVerificationModal OTP step (4 number boxes): the panel rides on the keyboard (`useKeyboardOffset`, bottom = max(bar space, keyboard + 8)), and its content scrolls with `keyboardShouldPersistTaps="handled"`.
- No other text inputs in this group. Cash is a button, not an amount field (same as the web).

## 4. Imports of other groups' files missing when I finished
- `src/modules/DeliveryV2/pages/PocketV2.jsx`, `pages/HistoryV2.jsx` (group pocket-history). ProfileV2 exists.

## 5. Status
All files above: Built, not tested.

## 6. Blocked / notes for the integrator (shell, not edited)
- **Images not bundled**: `cutlery_icon.webp`, `MapRider.png` and `profile_avatar.webp` (web `/assets/images/...`) are not in `mobile-delivery`. LiveMap and the header load them from `${VITE_ASSET_BASE_URL || https://helloparth.in}/assets/images/...` through AppImage, so they need network. Better: copy them from `Frontend/public/assets/images/` into `src/assets/public/images/` and switch the three paths to `require(...)` (I was not allowed to create those files).
- **Socket reconnect on foreground**: `DeliveryApp.jsx`'s header comment says "the socket the screens use reconnects when the app comes back to the front", but nothing in the shell does it. I added it inside `useDeliveryNotifications` (visibilitychange → `socket.connect()` if disconnected).
- **HistoryV2**: on the History tab the Home header is hidden and the content has no top padding (web `pt-0`), so HistoryV2 itself must leave room for the status bar (edge-to-edge). Pocket / Profile get `insets.top + 120` top padding from Home.
