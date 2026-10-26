# Decisions taken without Prince (delivery app conversion, 26 Oct 2026)

Where the prompt left a choice open, the safer option was taken and written down here.

## Identity / build
1. **Package / name / scheme:** `com.helloparth.delivery`, "Hello Parth Delivery Partner", `helloparth-delivery`. Firebase
   `google-services.json` from Downloads (has the delivery client).
2. **Icon:** `Downloads\Hello Parth\Delivery Partner Apk Logo.png` through `scripts/make-app-icons.cjs` (same sizes as the user and
   Captain apps).
3. **Splash:** header blue `#15498B` (the top of the delivery header gradient `#15498b -> #000000`, `--dv-primary`) for the native
   splash, the window and the JS splash. Wordmark = the whole logo (Hello Parth + "Delivery Partner" line) with the navy letters
   made white (`scripts/make-splash-wordmark.cjs`). A yellow scooter with a rider and an orange food box rides across once as the
   splash leaves; tagline "DELIVER · EARN · GROW".
4. **Keystore:** new PKCS12 upload key `C:/Users/Prince/.helloparth/helloparth-delivery-upload.jks`, alias `helloparth-delivery`,
   random password in `DELIVERY_KEYSTORE_README.txt` next to it, Gradle properties `HELLOPARTH_DELIVERY_*`.
   SHA-1 `B9:5D:06:FE:D4:7B:B3:F5:BC:75:7D:36:5C:C4:D4:90:77:DF:9F:43`.
5. **Packages:** the Captain app's package set unchanged (one `npm ci` from its lockfile); unused modules are harmless and
   removing them risked a second native build.
6. **Fonts:** the same embedded fonts as the Captain app (they already include the weights the web loads: Nunito Sans
   500–800, Sora 600/700). The app's base font is Nunito Sans (web `.delivery-v2-theme`).

## Behaviour
7. **Light only** (the web delivery theme has no dark mode).
8. **App start** = `/food/delivery` (Feed); ProtectedRoute sends a signed-out rider to `/food/delivery/login` like the web.
   Any unknown address goes to `/food/delivery` (the delivery router's catch-all).
9. **Realtime shell while signed in:** on the web `DeliveryRealtimeShell` (socket + order queue) wrapped only the protected
   routes, so opening Terms / Privacy from the profile dropped the socket. In the app it runs whenever the rider is signed in
   (the kept-alive Feed needs it, and the order ring must not stop because a legal page is open).
10. **Kept-alive bottom-bar screens:** DeliveryHomeV2 (Feed / Pocket / History / Profile) and OrdersV2 stay mounted and are
    shown / hidden by route (instant tab switches). What the web ran "while mounted" runs only while the screen is visible
    (`useDeliveryTabActive`); data loaded on mount is reloaded when it becomes visible again. One bottom bar is drawn by the
    layout instead of one per screen.
11. **Background location:** while online an Android foreground service ("You are online") delivers a location every ~7 s
    (the web Feed's send interval). On screen the screens send exactly like the web; in the background the Feed's handler
    sends the same HTTP update + socket + Firebase tracking for the active order (HTTP only if the app process was restarted).
    It keeps running when the app is swiped away and stops on offline / sign-out. Battery-optimisation prompt once a day.
12. **New order with the app in the background / screen off / closed (backend change approved by Prince, 26 Oct):**
    `Backend/src/core/notifications/firebase.service.js` now honours `payload.channelId` for an allow-list of ringing
    channels (only `delivery_orders` -> sound `restaurant_alert`, PRIORITY_MAX, public); every other push stays on
    `default` as before (restaurant etc. unchanged). `order-dispatch.service.js` sends the rider's new-order push with
    `channelId: 'delivery_orders'`. The app creates that channel (MAX importance, `restaurant_alert.mp3` as ringtone usage,
    long vibration, lock screen, bypass DND), so an order rings once with the app closed. The old web-wrapper APK has no
    such channel: Android shows it on its fallback channel. **Needs a backend deploy.** While the app process is alive the
    socket also delivers `new_order` and the web's alert loop plays in the background. No full-screen "incoming call"
    screen (needs native full-screen-intent code). Tapping the push opens the Feed (or Orders when the rider already
    carries an order, like the web's popup rule).
13. **New-order push while the app is open:** list only, no banner/sound (the in-app popup is already ringing).
14. **Maintenance:** Global switch -> all-apps screen; Food switch -> Food maintenance screen (delivery is part of Food on the web).

## After Prince's first phone test (26 Oct)
15. **Feed / Pocket / History / Profile kept alive inside DeliveryHomeV2:** the web rebuilt them (and the live map) on every
    tab change; on the phone that showed a black map and the previous tab for ~1 s. Each stays mounted after its first
    visit and is shown / hidden; the tab follows the `tab` prop in the same render (the web copied it in an effect).
    Pocket / History / Profile get `useDeliveryTabActive` = visible, so they reload their data on every visit like the web.
16. **Map loading screen:** a new Google map view is black until its first tiles are drawn; the Feed shows
    `MapLoadingOverlay` (street grid, pulsing pin, "Loading Map...") until `onMapLoaded` (8 s at most). The scooter
    riding across was removed (Prince). The Captain app shows the same overlay (its blue) while its Home map loads.
17. **Online / Offline toggle (Prince):** the Captain app's duty toggle: near-black pill, white knob with a power icon,
    green ONLINE / grey OFFLINE label, no outline.
18. **Log-out popup (Prince):** the Captain app's popup (glow, power icon, Cancel | Logout) in the delivery blue, with this
    app's "Logout from all devices" button kept under it.
19. **Orders pull-to-refresh:** reloads the same lists as opening the tab (`hydrateOrders`).
20. **Splash:** the native splash shows the wordmark again (plain blue looked empty, Prince). The JS splash starts with the
    wordmark at exactly the native size and place, waits until the native splash has faded, then the wordmark grows (to
    68% of the width, max 264 dp) while it lifts. The old "wiggle" was the native wordmark still fading out while the JS
    one already moved (two wordmarks overlapping, seen in the recording).
21. **Navigation-bar strip: unchanged.** The strip shows when the bottom inset is 40 dp or more (3-button bar). MIUI on
    Android 10 (Redmi 9 Prime) reports a big inset also with gestures, so the strip shows there; Redmi Note 10 is right.
    A native module that reads the phone's navigation mode was tried and removed (Prince: leave it as it is).
22. **Map black flash on tab switches (delivery + Captain app):** two causes, both fixed. (a) Changing the map view's
    zIndex / opacity rebuilds the Google map surface: the map tab is drawn first and never restyled, the other tabs are
    shown over it or hidden with opacity 0. (b) Fabric flattened the plain wrapper View around the map away while its
    pointerEvents was 'auto' and brought it back with 'none', moving the map to a new parent (seen in the Android view
    hierarchy): every View between the tab layer and the map has collapsable={false}.
23. **Captain app (Prince):** bottom bar no longer stutters (tab screens are memoised, so a tap re-renders only the bar
    and the two tabs involved); the 4 icons in the Today's Summary card removed; selected tab = light accent pill with
    the icon filled in the accent colour (like the user app's Food bar) — same bar in the delivery app (delivery blue).
24. **Offline map (Prince):** while offline the Feed gets one GPS position for the map only (nothing is sent) and shows the
    rider's bike (the header already says "Go online to receive orders"). A single point (rider only) is centred at zoom 15
    instead of fitToCoordinates, which zoomed in to a bare white map.
25. **Selected bottom-bar tab (both apps):** solid Ionicons icon + heavy label in the accent, no tinted pill; idle tabs
    outline icons (Wallet = rupee glyph).
26. **Tabs start at the top again** after another tab was shown (scrolled to the top while hidden); Back from a page keeps
    the place (native/ui/tabShown.js).
27. **Login page:** "Delivery Partner" is plain blue text (the SVG gradient text filled the D and P); the blue waves scroll
    with the form when the keyboard opens (a native pan), so the logo never slides over them.
28. **Razorpay checkout:** the app wordmark as the checkout image and a zero-width name (no "H" circle, no merchant
    account name, Razorpay cannot use the app fonts); the checkout reaches the bottom edge.
29. **Sign-out:** the kept-alive tabs unmount ~0.9 s after the login screen is up (all three apps), not in the same frame.
30. **Login screen keyboard:** the page keeps its keyboard-closed height (the shrinking window re-centred it and the logo
    jumped up); `KeyboardAwareScrollView` now also works when the window shrinks, so only as much scrolls as the number
    box + Log in button need.
31. **Back on a login screen (all three apps):** empty number box -> the app closes at once (it went back to the signed-in
    screen under it: white for 1-2 s, then login again); something typed -> "Exit the app?" popup (Cancel | Exit) in the
    app's colour (`native/ui/LoginExitGuard.jsx`).
32. **Log-out popup** closes at once on log-out (its fade over the login screen looked like a flash), all three apps.
33. **Pocket:** a locked Deposit box says why (nothing to deposit / submission waiting for admin). Available cash limit
    page: compact, Okay fixed at the bottom in the delivery blue. Trips history opened from Profile: the back arrow
    returns to Profile.
