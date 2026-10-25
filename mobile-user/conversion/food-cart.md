# food-cart conversion report

Group key: `food-cart`. Everything below is **Built, not tested** (the app was not run here; only `node scripts/check-converted.cjs` was run, and it reports 0 problems for all 10 files).

## 1. Files converted (web -> native)

| Web (Frontend/src/…) | Native (mobile-user/src/…) | Not reproduced exactly / notes |
|---|---|---|
| modules/Food/pages/user/cart/Cart.jsx | same path | The component logic (state, effects, pricing / coupon / wallet / COD rules, order placement, Razorpay flow, redirect-callback handling, share) is copied unchanged from the web file (lines 89–2408) by `scratchpad/assemble_cart.cjs`; only the JSX and the DOM-only parts were rewritten. The `document.body` scroll locks are gone because native sheets are modal; when a full-screen state opens, the page scrolls back to the top. The textarea copy fallback in `copyToClipboard` became a "Failed to copy link" toast (`navigator.clipboard` is shimmed). `window.alert` became `Alert.alert`. The order-success confetti is the web's own CSS falling-pieces animation, rebuilt with `Animated` (the web Cart never calls canvas-confetti). Sheets and dialogs use `@/native/ui` Sheet / Dialog. The close button above the auto-coupon card is laid out in the flow above the card, because on Android a button that sits outside its parent's bounds cannot be tapped. |
| modules/Food/pages/user/cart/Checkout.jsx | same path | This is the legacy Checkout page. Its timeout callback reads an undeclared `pricing`, so on the web it throws after `clearCart()` and never navigates. An uncaught error would close the app here, so the same callback is wrapped in try/catch and the error is logged. The behaviour is otherwise the same: the cart is cleared and no navigation happens. |
| modules/Food/pages/user/cart/SelectAddress.jsx | same path | The suggestions dropdown is drawn in the page flow under the input, not as an absolute popover over the next card. The web `required` checks are the same toast check. |
| modules/Food/pages/user/cart/AddressSelectorPage.jsx | same path | The Google Maps JS map became `AppMap`; the `idle` event became `onRegionChangeComplete`; `panTo` / `setZoom` became `animateToRegion`. The Places `AutocompleteService` became `@/lib/google` `autocomplete`, and the map key comes from env (`VITE_GOOGLE_MAPS_API_KEY`) instead of `getGoogleMapsApiKey()` + Loader. The keyboard inset came from `visualViewport`; it now comes from `Keyboard` events. `scrollIntoView` became `scrollTo` from measured field layouts. The parallax is `Animated` on scroll. The class strings from `getAddressSelectorTheme()` (food and taxi variants) are mapped to native styles in a local `nativeUi()` for light and dark; the texts and variant still come from the shared util. backdrop-blur became expo-blur on the taxi header and the fetching overlay. |
| modules/Food/pages/user/orders/OrderTracking.jsx | same path | The logic (lines 659–1992) is copied unchanged by `scratchpad/assemble_ot.cjs`. The `tel:` hidden-anchor click became `Linking.openURL('tel:…')` and `window.open(mapsUrl)` became `Linking.openURL`. `dangerouslySetInnerHTML` SVG icons became `react-native-svg` `SvgXml`. framer-motion entrances (fade/slide/spring) and the CSS keyframes of the Takeaway / Dining animations (bokeh, route pulse, phone float, burger flight, bag squash, sparkles, steam, cloche) are rebuilt with `Animated` keyframe interpolation. The CSS `blur-3xl` glows became soft radial-gradient discs. **Not reproduced:** the web removes the white background of `takeaway_burger.png` at runtime with a canvas; native shows the PNG as-is, which is the web's own `onerror` fallback. |
| modules/Food/components/user/DeliveryTrackingMap.jsx | same path | GoogleMap + OverlayView became `AppMap` + `Marker` (custom views) + `Polyline`. `fitBounds` became `fitToCoordinates` (same padding). The Routes JS SDK baseline route became `@/lib/google` `computeRoute` (Routes API v2). `google.maps.geometry` distance and `decodePath` became the haversine / decode helpers in `liveTrackingPolyline.js`. The dashed travelled path uses `lineDashPattern`. The socket.io + Firebase subscription code is unchanged. The `loadError` / not-loaded branches are dropped because the native map has no script loading. The rider bitmap re-renders for 2 s after it first appears so the remote `MapRider.png` can paint. The smoothing loop only calls setState while the glide is running (the web set it on every frame after the glide ended). |
| modules/Food/components/user/OrderTrackingCard.jsx | same path | It is fixed to the bottom of the page via absolute positioning plus the bottom safe-area inset, so the Home owner must render it inside a full-height container. The CookingAnimation SVG is drawn with react-native-svg. The enter/exit spring is the AnimatePresence equivalent (the card keeps its last content while it slides out). |
| modules/Food/utils/razorpay.js (logic) | same path | Same exports (`loadRazorpayScript`, `preloadRazorpayScript`, `initRazorpayPayment`, `formatAmount`) and the same options, handlers and visibilitychange-to-onClose logic, implemented on `@/lib/razorpay`. The key always comes from the caller (backend `initiate-online-payment` response). Nothing is hard-coded and no payment is completed by code. The relative `image` becomes the absolute `https://helloparth.in/...`. |
| modules/Food/realtimeTracking.js (logic) | already copied, unchanged | Firebase RTDB code works as is. |
| modules/Food/utils/liveTrackingPolyline.js (logic) | copied unchanged | Pure JS; `requestAnimationFrame` exists in RN. |

## 2. Routes / guards / API calls (route files are owned by the shell)

| URL | Screen | Guard (web UserRouter) | API calls |
|---|---|---|---|
| /food/user/cart | Cart | logged-in user (ProtectedRoute role user, loginPath /login) | GET /food/public/customization-settings; GET current user (authAPI.getCurrentUser); restaurantAPI.getRestaurantById (GET /food/restaurant/restaurants/:id); restaurantAPI.getRestaurants (name fallback); getAddonsByRestaurantId (GET /food/restaurant/restaurants/:id/addons); getPublicOffers (GET /food/restaurant/offers); POST /food/orders/calculate; userAPI.getWallet; userAPI.getOrders(page 1, limit 1); adminAPI.getPublicFeeSettings (see note); userAPI.updateLocation; POST /food/orders (cash / wallet / after Razorpay); POST /food/orders/initiate-online-payment |
| /food/user/cart/checkout | Checkout (legacy) | logged-in user | GET /food/public/customization-settings; adminAPI.getTakeawayCodStatus (takeaway only); otherwise only local OrdersContext.createOrder |
| /food/user/cart/select-address | SelectAddress | logged-in user | ProfileContext addAddress / setDefaultAddress (owned by food-shell) |
| /food/user/address-selector | AddressSelectorPage | open (outside ProtectedRoute; add/edit/delete ask for login) | Places autocomplete + reverse geocode (Google HTTPS / geocodeAPI in googleGeocoding.js); ProfileContext add/update/delete/setDefault address |
| /food/user/orders/:orderId | OrderTracking | logged-in user | GET order details (orderAPI.getOrderDetails, with id fallbacks); orderAPI.getOrders(page 1, limit 50) for id resolution; restaurantAPI.getRestaurantById; PATCH /food/orders/:id/cancel; PATCH /food/orders/:id/instructions; PATCH /food/orders/:id/ratings; socket `join-tracking` / `location-update` + Firebase `active_orders/:id` (map) |

Note: `adminAPI.getPublicFeeSettings` does not exist in `services/api/index.js` (the same is true on the web). The call throws inside its try/catch, so the Cart keeps its default fee settings, exactly like the web.

## 3. Web-only APIs replaced

- react-router-dom -> `@/lib/router`
- sonner -> `@/lib/toast`
- lucide-react -> lucide-react-native
- framer-motion / CSS keyframes -> `Animated`
- canvas-confetti / CSS confetti -> `Animated` pieces
- `@react-google-maps/api` and `@googlemaps/js-api-loader` -> `AppMap` / `Marker` / `Polyline` + `@/lib/google` (`autocomplete`, `computeRoute`)
- `google.maps.geometry` -> `liveTrackingPolyline` helpers
- `window.Razorpay` -> `@/lib/razorpay`
- `document.body` scroll lock -> removed (modal sheets)
- `createPortal` -> Modal-based Sheet / Dialog
- `<img>` -> AppImage
- `dangerouslySetInnerHTML` SVG -> SvgXml
- tel / maps links -> Linking
- `visualViewport` -> Keyboard events
- `alert` -> `Alert.alert`
- `window.history.replaceState` / `window.location` / `navigator.share` / `navigator.clipboard` / `navigator.vibrate` / `document.hidden` / window `focus` -> kept; `webCompat` shims them

## 4. Imports of other groups' files

When this report was written, all of them resolved: food-shell UI kit (button, card, input, label, badge, textarea, dialog), AnimatedPage, ScrollReveal, the contexts, UserLayout (`useLocationSelector`), hooks (useLocation, useZone, useAppBackNavigation, useCompanyName), and shell's `customToasts` (`BrandToastIcon`) and `NumberSkeleton`. My pages use the props those files document: `onPress` / `onChangeText` / `style` / `textStyle`.

## 5. Status

| Screen / component | Status |
|---|---|
| Cart | Built, not tested |
| Checkout | Built, not tested |
| SelectAddress | Built, not tested |
| AddressSelectorPage | Built, not tested |
| OrderTracking | Built, not tested |
| DeliveryTrackingMap | Built, not tested |
| OrderTrackingCard | Built, not tested |
| razorpay.js | Built, not tested |

## 6. Blocked / needs attention

- **Razorpay:** the checkout runs in `PaymentHost`'s WebView with the key returned by the backend. The web passes `callback_url` / `redirect: true` to `initRazorpayPayment`, but the web wrapper never forwards them to Razorpay, so the handler flow is used (same here). Not tested end to end; no real payment was attempted.
- **Kept web bug (Cart):** the network-error branch of `handlePlaceOrder` references an undefined `backendUrl` (inside a debugError argument), so on a network error the "Processing" overlay stays and no alert is shown, exactly as on the web. I did not change it, because the rule is to keep the logic as is.
- **Map key:** the delivery map, the address map and the Places search need `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in the build env. Without it, AddressSelectorPage hides the map and search (the web's MAPS_ENABLED behaviour).
- **`/assets/images/MapRider.png`** (rider marker) is loaded from https://helloparth.in like the browser did, with `bikelogo.png` as fallback.
