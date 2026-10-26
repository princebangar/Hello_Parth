# Decisions taken without Prince (restaurant app conversion, 26 Oct 2026)

Where the prompt left a choice open, the safer option was taken and written down here.

## Identity / build
1. **Package / name / scheme:** `com.helloparth.restaurant`, "Hello Parth Restaurant Partner", `helloparth-restaurant`. Firebase
   `google-services.json` from Downloads (has the restaurant client).
2. **Icon:** `Downloads\Hello Parth\Restaurant Partner Apk Logo.png` through `mobile-user/scripts/make-app-icons.cjs` (same sizes
   as the other three apps).
3. **Splash:** the restaurant header's dark crimson `#66001D` (the end of the web header / bottom-bar gradient
   `#B80B3D -> #66001D`) for the native splash, the window and the JS splash. Wordmark = the whole logo (Hello Parth +
   "Restaurant Partner" line) with the navy letters made white (`scripts/make-splash-wordmark.cjs`); the orange "Hello", the
   smile and the orange lines stay. Entrance = fades only: a restaurant counter, two hanging lamps and a plate with a cloche
   (dish cover) fade in below the wordmark, tagline "COOK · SERVE · GROW". Exit = one move when the app is ready (+250 ms,
   1.1 s, native driver): the cloche lifts up and tilts away, a warm glow + steam rise over the dish that was under it, then
   the splash fades. onDone is read from a ref.
4. **Keystore:** new PKCS12 upload key `C:/Users/Prince/.helloparth/helloparth-restaurant-upload.jks`, alias
   `helloparth-restaurant`, random password in `RESTAURANT_KEYSTORE_README.txt` next to it, Gradle properties
   `HELLOPARTH_RESTAURANT_*`. SHA-1 `5F:45:4C:9D:EA:25:D3:C1:0E:A3:9F:F8:12:AE:FA:F5:F6:7C:02:03`.
5. **Packages:** the delivery app's package set unchanged (one `npm ci` from its lockfile, `legacy-peer-deps` like it);
   unused modules are harmless and removing them risked a second native build.
6. **Permissions:** no background location / location foreground service / battery-optimisation prompt (the restaurant app
   only reads a position for the outlet address map); camera + photos for menu / outlet / document photos.
7. **Fonts:** the same embedded fonts as the other apps; the base font is Poppins (web global.css body font).

## Behaviour
8. **Light only** (the restaurant panel has no theme switch; the few `dark:` classes on the web only applied when a
   customer dark theme leaked into the same browser).
9. **App start** = `/food/restaurant` (Orders); ProtectedRoute sends a signed-out restaurant to `/food/restaurant/login`,
   a pending / rejected / banned one to the pending screen, like the web.
10. **Unknown addresses:** RestaurantRouter has no catch-all (an unknown path showed an empty page on the web); in the app any
    unknown `/food/restaurant/*` address and any address outside the app goes to `/food/restaurant`.
    `signup-email`, `auth/sign-in`, `auth/google-callback` (listed as auth paths in Food routes.jsx but with no page in
    RestaurantRouter) go to the login. "Share-Feedback" is mapped to `share-feedback` in the router.
11. **Desktop dashboard not converted** (the app is phone only): every `Responsive` route uses its mobile element; the
    desktop redirects (`orders/all` -> `orders?tab=all` etc.) do not apply. `account` keeps the phone redirect to
    `/food/restaurant`.
12. **Kept-alive bottom-bar screens:** OrdersMain (`/food/restaurant`, `/orders`), Inventory (`/inventory`, `/menu`),
    Feedback (`/feedback`, `/reviews`) and ExploreMore (`/explore`, `/settings`) stay mounted after their first visit and are
    shown / hidden (instant tab switches, like the delivery app). What the web ran "while mounted" runs only while the screen
    is visible (`useRestaurantTabActive`); data loaded on mount is reloaded when it becomes visible again. One bottom bar is
    drawn by the layout on the tab paths; the four non-tab pages that drew it on the web (HubFinance, Hyperpure, OutletInfo,
    WithdrawalHistory) still draw their own.
13. **Bottom bar:** the web's crimson gradient pill with Orders / Inventory / Feedback / Explore. Selected tab = solid
    white icon + heavy white label, no tinted pill (Prince's rule for the Captain / delivery bars, in this bar's colours);
    idle = outline icons in white 78%. The tapped tab shows at once (announced before the router navigates).
14. **My Store wording (web StorePanelWording):** the web rewrote the page DOM with a MutationObserver. In the app the
    shared `Text` converts its string children and `TextInput` its placeholder for a My Store partner (same word list, the
    partner's own values protected, re-checked every 1.5 s and on `restaurantAuthChanged` / `storage`). Typed input values
    are never converted (the web skipped inputs too).
15. **Global new-order card (web RestaurantGlobalNotificationListener):** mounted by the restaurant layout while signed in;
    shown on every restaurant page except the auth / onboarding / pending pages and the order pages (OrdersMain has its own
    accept / reject popup), only for an approved restaurant — like the web. The shared restaurant socket stays connected on
    every page while signed in.
16. **New order with the app closed — backend change needed (NOT made, Backend is read-only):** the backend already sends the
    restaurant's new-order push with `channelId: 'restaurant_orders'` (`order.helpers.js notifyRestaurantNewOrder`), but
    `firebase.service.js` only honours channel ids in its `RINGING_CHANNELS` allow-list, which has only `delivery_orders`.
    So the push arrives on the plain `default` channel (one normal notification sound, no ringtone). The app already creates
    the ringing `restaurant_orders` channel (MAX importance, `restaurant_alert.mp3`, long vibration, lock screen, bypass DND).
    One line in the backend makes it ring with the app closed:
    `restaurant_orders: { channelId: 'restaurant_orders', sound: 'restaurant_alert' },` in `RINGING_CHANNELS` — for Prince
    to approve and deploy.
17. **New-order push while the app is open:** list only, no banner / sound (the in-app popup is already ringing). Tapping a
    new-order push opens `/food/restaurant`.
18. **Maintenance:** Global switch -> all-apps screen; Food switch -> Food maintenance screen (the restaurant panel is Food).
19. **Session listeners:** RestaurantRouter's "Session Expired" toast + login on `authRefreshFailed` / removed token, the Food
    router's 2 s token safety net and `focus` session check, push registration on every route change — run in the
    restaurant layout for every restaurant page.
20. **Phone-tested fixes carried over from the delivery / Captain apps (Prince):** login keeps its keyboard-closed height and
    lifts only the form, LoginExitGuard on login screens, OTP per-box refs, log-out popup closes at once, kept-alive tabs
    unmount ~0.9 s after the login screen is up, tabs start at the top after another tab, navigation-bar strip
    (`NavBarScrim`) unchanged, no slide animations, maps built after the splash with `collapsable={false}` wrappers.
21. **Back / Save to the page below = Back (27 Oct):** the web's Back and Save buttons `navigate(backTarget)` to a path;
    natively that pushed a second copy of the page below and the stack kept growing. `src/lib/router.js` now keeps the
    walked stack (RouteSync) and, for a plain path (no route state, no query) equal to the page right below, goes back
    instead of pushing.
22. **No stock photos (27 Oct):** OutletInfo showed the web's unsplash banner / thumbnail until the outlet's images
    loaded → empty panel instead; RatingsReviews' unsplash banner → the restaurant gradient. (RatingsReviews' numbers
    such as the "4.0" rating are hard-coded in the web page too — no API; kept, listed in REPORT for Prince.)
23. **Web gaps kept as the web has them (27 Oct):** DaySlots Save uses an undefined storage key (always fails; nothing
    links to /outlet-timings/:day); FssaiUpdate and PhoneNumbersPage have no backend call; PhoneNumbersPage starts from
    the outlet's real number instead of the web's hard-coded sample number.
24. **Prince's 4 decisions done (27 Oct) — replaces 22's "4.0 kept" and 23:** Ratings page shows the real `rating` /
    `totalRatings` from GET /food/restaurant/current ("NEW" until rated). DaySlots saves under
    `restaurant_outlet_day_slots`. FssaiUpdate uploads the photo (uploadAPI, folder food/restaurants/fssai) and PATCHes
    /food/restaurant/profile with fssaiNumber / fssaiExpiry (YYYY-MM-DD) / fssaiImage. PhoneNumbersPage saves without
    the OTP sheet: the restaurant page number -> primaryContactNumber, the two order-reminder numbers -> the new backend
    field `orderReminderNumbers` (model + profile select + update). Backend `RINGING_CHANNELS` gained
    `restaurant_orders` (the killed-app new-order ring). The backend changes need a deploy.
25. **No entrance fades (27 Oct):** the web's framer-motion entrance fades (ExploreMore, Inventory, OrdersMain,
    DiningReservations, OutletTimings rows, AllOrdersPage cards, Login's first open) read as a blink on the phone (white
    page, then content). They are plain Views now; Login still slides between the number and OTP steps. The kept-alive
    tabs set their status bar while *shown* (not after the route change), so the icons switch in the tab's frame.
26. **Instant log-out (27 Oct):** Explore's Logout opens the login screen first, then clears the session; the backend
    logout (needs only the refresh token, read at call time) and the Firebase sign-out finish in the background.
    "Logout from all devices" still waits for its API call (it needs the access token).
27. **Status page = navbar (27 Oct):** RestaurantStatus uses the navbar's getRestaurantAvailabilityStatus. While the
    outlet is closed by its timings both switches show off with "Closed now · opens at …" / "today is off"; turning one
    on opens the web's dialogs. The saved switch is untouched, so orders start at opening time by themselves.
28. **Inventory bottom room (27 Oct):** on the items tab the list ends above the floating "+ Add item" / "Menu" pair.
29. **Splash v2 (27 Oct):** no counter band (its line made the splash look half-screen) and no lamps — the dish sits in
    a soft round spotlight, tagline under it; the wordmark grows over 900 ms (eased) instead of ~70 ms; the cloche
    lifts, tilts and fades without crossing the wordmark. The grow starts only once frames come smoothly again (4 frames
    in a row under 26 ms, max 1.2 s wait — the app tree mounting behind the splash stalled the UI thread), and the
    scene layers start at opacity 0.004 so their first (costly) SVG draw happens before anything moves.
