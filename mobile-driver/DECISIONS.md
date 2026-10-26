# Decisions taken without Prince (driver app conversion, 25 Oct 2026)

Prince was away during this run. Where the prompt left a choice open, the safer option was taken and written down here.

## Identity / build
1. **Icon:** `C:\Users\Prince\Downloads\Hello Parth\Hello Parth Captain.png` through `mobile-user/scripts/make-app-icons.cjs` (same sizes as the
   user app: 740 px logo on a 1024 white square, 540 px adaptive foreground on white `#ffffff`).
2. **Splash:** the user app's text-only animated splash on Taxi navy `#0B172A`, with "Captain" (white, bold) in place of the
   user app's tagline line — the Captain logo has "Captain" under the wordmark.
3. **Keystore:** new PKCS12 upload key `C:/Users/Prince/.helloparth/helloparth-captain-upload.jks`, alias `helloparth-captain`,
   random password in `C:/Users/Prince/.helloparth/CAPTAIN_KEYSTORE_README.txt`, Gradle properties `HELLOPARTH_CAPTAIN_*` in
   `~/.gradle/gradle.properties`. SHA-1 `BF:72:DE:90:84:84:80:74:BD:9F:6F:5D:AD:46:C0:FB:58:7B:CF:E8`.
4. **Four web images are JPEG files with a `.png` name** (`driver_welcome_hero`, `images/driver-login-bg`, `map_image`,
   `premium_grid_map`). Android's resource compiler rejects a JPEG named .png in a release build, so the app has them as `.jpg`.
5. Removed from the user app's package set: `expo-speech-recognition`, `expo-video` (the driver screens have no voice search /
   video). Added: `expo-task-manager` (background location), `simplify-js` (the web's route simplifier, pure JS),
   `expo-keep-awake` (pulled in by expo anyway; not used — see 9).

## Behaviour
6. **Light only.** The web keeps the partner portal outside the customer dark theme (`driver-app-root light`), so the app's
   ThemeProvider is always light.
7. **App start** = the web's `/taxi/driver` entry (`DriverEntryRedirect`): signed-in partner -> their home (driver
   `/taxi/driver/home`, owner `/taxi/owner/dashboard`, bus driver `/taxi/driver/bus-home`), otherwise `/taxi/driver/login`.
   Unknown addresses go to the start (the web's catch-all).
8. **Kept-alive bottom tabs** (prompt lessons 13-16): the web rebuilt a tab screen on every tap; the app keeps every visited tab
   mounted and only shows/hides it. To keep the web's behaviour, each tab screen knows whether it is the visible tab
   (`useDriverTabActive`): socket listeners, timers, alert sounds and popups run only while visible (as if mounted), and data
   the web loaded on mount is reloaded when the tab is shown again. Requests on non-Home screens are still handled by
   `DriverRideRequestListener`, exactly like the web.
9. **Screen-on during a trip:** the web does not keep the screen awake (no Wake Lock anywhere in the driver code), so the app
   does not either.
10. **Background location:** while online, an Android foreground service ("You are online" notification) sends the same
    socket event the web's Home sent every 10 s (`locationUpdate { coordinates: [lng, lat] }`). It runs with "While using the
    app" permission too (a foreground service started from the app); "Allow all the time" is asked once as well. It keeps
    running if the app is swiped away (`killServiceOnDestroy: false`) and stops when the driver goes offline or signs out.
11. **Ride request with the app in the background / screen off:** the backend (read-only) sends an FCM *notification* message
    on channel `default` with `data.type = 'ride_request'`; Android shows it itself, so the app cannot turn it into a
    full-screen ringing activity without a backend change. What the app does: the `default` channel is high importance
    (heads-up + sound); while the app process is alive (the online location service keeps it alive) the socket still
    delivers `rideRequest`, and the ride alert (mp3 on a loop + vibration) plays also in the background
    (`shouldPlayInBackground`). Tapping the notification opens Taxi Home, where the request popup is.
    A real full-screen ring like phone calls needs the backend to send a *data-only* high-priority message — noted for
    Prince, not done (backend is read-only).
12. **Ride alert sound:** the web's "unlock on first tap" and WebAudio beep fallback are browser workarounds; the app plays
    the same mp3 directly and loops the same vibration pattern.
13. **expo-audio background service off:** `enableBackgroundPlayback: false` (no media-playback foreground service / extra
    Play-Store-sensitive permission); playing in the background relies on the audio mode plus the running location service.
14. **Maintenance:** the Global "Under Maintenance" switch locks the partner portal on the web too, so the app shows the same
    all-apps maintenance screen; Food's own switch does not apply (no Food in this app).
15. **Owner `/taxi/owner/select-role`:** listed in the web's `PARTNER_AUTH_PATH` but there is no such route in the owner block;
    the app does the same as the web (unknown address -> start screen).
16. **Ride-request push while the app is open:** shown only in the notification list (no banner / sound), because the
    in-app popup is already ringing. In the background it is shown normally by Android.
17. **Ride request timer after the app was in the background:** when a request has no future `requestExpiresAt`, the countdown
    runs from the moment the request arrived (`receivedAt`), not from when the popup was first drawn, so a request that came
    in while the phone was locked does not get a fresh full timer.
18. **Daily selfie (Taxi Home):** the web showed an in-page camera preview; the app opens the phone's front camera
    (expo-image-picker) and uploads the same base64 image to the same endpoint, scaled to 1280 px / JPEG 0.82 like the web
    (`expo-image-manipulator`, added 26 Oct; document photos in StepDocuments are scaled to 1600 px like the web too).
19. **Offline toggle icon:** on the web the partner-button CSS makes the offline power icon white on a white knob (invisible).
    Copied as it is (same as web); worth fixing on both sides later.
20. **Active trip:** no "open Google Maps", cancel-fee flow, back guard or keep-awake on this screen, because the web
    ActiveTrip has none of them. The hardware Back button pops the screen like the web's arrow.
21. **`<select>` and `<input type="date|time|month">`:** every select opens a bottom Sheet with the same options; dates/times
    use the Android system dialog (`@react-native-community/datetimepicker`) and store the web's format (`YYYY-MM-DD`, `HH:mm`).
    A month input uses the date dialog and keeps only the month.
22. **Wallet top-up (Razorpay):** the web's normal-browser flow (handler + verify call), as in the user app's wallet; the
    web's WebView-only `redirect: true` mode would leave the app stuck on the backend callback page.
23. **Edit vehicle (owner):** the edit page is its own screen, so its success / "not found" message goes back to the fleet
    list in the navigation state and shows there for 3 s (on the web both were the same mounted page).
24. **Registration status poll (2.5 s):** runs only while that page is on screen, so it cannot navigate away from the
    support chat / documents page opened on top of it.
25. **Ride-request ringing with the app closed (26 Oct, replaces the limitation in point 11 for the sound):** the app makes a
    `ride_requests` channel (ride alert tone ~20 s as ringtone usage, MAX importance, long vibration, public on the lock
    screen) and the backend sends `type: 'ride_request'` pushes on that channel (`Backend/.../pushNotificationService.js`,
    needs a backend deploy). Still no full-screen "incoming call" screen (needs native full-screen-intent code).
26. **Trip back arrow** with no screen below (cold start / notification) goes to Home. **Profile** shows a blue strip
    behind the status bar once the page scrolls (white icons were invisible on white).
