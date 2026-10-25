# Group "taxi-shell" — conversion report

Check: `node scripts/check-converted.cjs` over every file below → **147 files, 0 problems of my own**; the only reports are
14 imports of `taxi-bus` pages that were not written yet (section 4). Status of every screen/component: **Built, not tested**.

## 1. Web file → native file

| Web (Frontend/src) | Native (mobile-user/src) | Not reproduced exactly / notes |
|---|---|---|
| modules/Taxi/TaxiApp.jsx | same path + `app/taxi/_layout.jsx` + 102 route files | `<Routes>` became Expo Router files under `app/taxi/**`. TaxiApp is now a wrapper (`<TaxiApp>{stack}</TaxiApp>`): SettingsProvider, UserThemeProvider, `<FontScope family="Outfit">`, AppAutoUpdater, UserAccountInvalidationListener, UserUpcomingRideReminderBootstrap, FCM install, MainLayout (`--user-bg`). New exports: `userRoute(Page)` / `publicRoute(Page)` / `UserProtectedRoute` / `UserMainTabRoute` / `TAXI_USER_ROUTES`. Not ported: driver / owner / admin / bus-driver routes, legacyBackendShim (admin only), `taxi-app-active` html class, ScrollToTop (each pushed screen starts at top; tabs keep their own scroll), the react-hot-toast `<Toaster>` (root layout has the app Toaster). `app:auth-stale` for role admin only disconnects the socket (web navigated to `/admin/login`, not in the app). |
| modules/Taxi/shared/context/SettingsContext.jsx | same path | Same bootstrap fetch, cache `appSettingsCache:v1`, resume / online / focus refresh, `prefetchTaxiSettings`, `normalizeAssetUrl`. Dropped (DOM only): `document.title`, admin theme CSS variables on `<html>`. |
| modules/Taxi/shared/context/UserThemeContext.jsx | same path | Theme comes from the app ThemeProvider (`userTheme` key + THEME_CHANGE_EVENT); `toggleTheme` = `saveFoodUserTheme`. **New exports for every Taxi screen:** `userPalette(dark)` / `useUserPalette()` = the `--user-*` variables of `modules/Taxi/index.css` (bg, cardBg, cardSoft, textPrimary/Secondary/Muted, border, accent, accentInk, cardShadow, nav*, profileHeader*, serviceArt*) and `USER_SHADOW` (the `.user-app-theme .shadow-*` override). The file's header lists which Tailwind classes index.css remaps to which token — other Taxi groups can use it. |
| modules/user/components/UserMainTabKeepAlive.jsx | same path | Per the brief: tabs stay mounted after their first visit (display none when hidden) instead of the web's "only the open tab". Rendered once by `app/taxi/_layout.jsx` above the Stack; hidden on non-tab routes and when signed out. Re-mounts a keyed `<StatusBar>` per tab so the open tab's style wins over hidden tabs' status bars. |
| modules/user/components/BottomNavbar.jsx | same path | index.css `.user-bottom-nav*`: 72 px bar, 24 px + safe-area from the bottom, page-colour fading strip, sliding pill (Animated spring over measured tab boxes instead of framer layoutId). Ionicons home / receipt / bus / headset. Exports `TAXI_BOTTOM_NAV_SPACE`. |
| modules/user/components/tabPages.js (unowned .js, needed) | same path | Rewritten: plain imports (no lazyPreloaded chunks); `preloadTaxiTab` keeps the Rides history prefetch. |
| modules/user/pages/Home.jsx | same path | Mobile layout only (desktop `lg` grid not built). Recent-place road distances: Routes API (`computeRoute`) instead of `window.google` DirectionsService. Initial `scrollTop = 220` on `.user-home` dropped (no-op on the web: that element does not scroll). `console.log('--- TEMPORARY DEBUG LOG ---')` lines dropped. Scheduled-ride card follows index.css (`button.bg-slate-900` → yellow accent with themed inner cards), same as the web renders it. Unused web imports (HeaderGreeting, ActionsSection, PromoBanners, ExplorerSection, CheckUsOutSection) are not imported. |
| modules/user/pages/Activity.jsx (+ components/activity/ActivityCard, ActivityHeader, ActivityPager, ActivityStates, ActivityTabs) | same paths | Same tabs, caching (`prefetchActivityAll`), pagination, states. ActivityTabs: right-edge mask → gradient overlay; prop `onSelect` (web `onChange` still accepted). ActivityCard accepts `onPress` (web `onClick` still accepted). |
| modules/user/pages/Profile.jsx | same path | `location.key !== 'default'` → `router.canGoBack()`; scroll memory via ScrollView onScroll + `taxiProfileScrollPos`. Logout dialog uses shell props `iconBgStyle` / `iconColor` / `confirmButtonStyle` (blue-600). Default avatar bundled (`src/assets/public/images/profile_avatar.webp`). |
| modules/user/pages/Notifications.jsx | same path | `window.confirm` → `Alert.alert`; list in FlatList; toast icon / className options dropped (lib/toast has none). Header is a fixed bar outside the list (web: sticky). |
| modules/user/pages/cab/CabHome.jsx | same path | `/4_Taxi.png` from `Frontend/public` copied to `src/assets/public/4_Taxi.png`. |
| modules/user/components/ServiceGrid.jsx | same path | Same modules fetch / caches / tiles / handlers. `.everything-card` + `.service-art` from index.css. Stagger spring per tile. |
| modules/user/components/ServiceArt.jsx | same path | + `ServiceArtBox` (the `.service-art` tile); `imgClassName` → `imgPadding` / `contentFit`. |
| modules/user/components/TaxiHomeBanner.jsx, TaxiHeroBanner.jsx | same paths | Radial + linear background via react-native-svg; artwork top fade (CSS mask) approximated with a gradient strip in the banner colour. `preloadHeroArt` resolves at once (artwork is bundled). `className` → `style`. |
| modules/user/components/LocationDetector.jsx | same path | Geocoder → `@/lib/google geocodeLatLng`; watch stopped on unmount. |
| modules/user/components/LocationOffDialog.jsx | same path | Foundation `Dialog` (always light card, as the web portal sat outside the theme scope). |
| modules/user/components/LocationMapSection.jsx | same path | Not rendered by the web Home today; converted with AppMap (dark `customMapStyle`, centre pin, drag → re-geocode, starts on persistentMap's saved camera). Desktop `lg` header not built. |
| modules/user/components/HeaderGreeting.jsx, PromoBanners.jsx, ExplorerSection.jsx, CheckUsOutSection.jsx, ActionsSection.jsx | same paths | Not rendered anywhere on the web today; converted for parity (loop animations via Animated; hover effects dropped). **ExplorerSection imports `@/assets/jaipur.avif`: Metro has no `avif` asset extension by default — nothing imports ExplorerSection, but if it is ever used, add `avif` to `resolver.assetExts` or convert the file.** |

Logic files (owned):
- `shared/api/runtimeConfig.js` — rewritten: API base `https://helloparth.in/api/v1/taxi`, socket/backend origin `https://helloparth.in` (from `config/env`), no `window.location.origin` / localhost fallbacks. `socket.js`, `axiosInstance.js`, `historyStateGuard.js` unchanged (work on webCompat).
- `shared/push/nativeFcmBridge.js` — user only: `getNativeFcmToken()` (permission + FCM token) → `userAuthService.saveFcmToken(token, 'mobile')` = `POST /users/fcm-token { token, platform: 'mobile' }` (the web shell sent `mobile`; the backend keeps app tokens for `mobile`). Pending token kept until sign-in; retried on `app:auth-ready`, focus, visibility, every 15 s; `onFcmTokenChange` re-saves rotated tokens. No driver code.
- `shared/push/browserFcmRegistration.js` — `installBrowserFcmRegistration()` is a no-op (service-worker push does not exist in the app).
- `shared/services/safetyAlertService.js` — `triggerUserSosAlert` only (`POST /users/sos`); `triggerDriverSosAlert` and the driver registrationService import removed.
- `shared/hooks/useImageUpload.js` — `handleFileChange()` opens the gallery (`pickImage`), or takes a picked file / `{ target: { files } }`; reads base64 with expo-file-system and posts the same data URL to `/common/upload/image`.
- `shared/hooks/useTypingFocus.js` — keyboard show/hide events; `useScrollFocusedFieldIntoView` no-op (KeyboardAvoidingView does it).
- `shared/utils/externalNavigation.js` — `openExternalCheckout(url)` → `Linking.openURL` (system browser, UPI intents work), same diagnostic record; `isEmbeddedCheckoutWebView` / `isMobileOrWebView` → true.
- `shared/utils/historyState.js` — unchanged (`toHistorySafeState`).
- `modules/user/utils/useTaxiNotificationUnread.js` — unchanged.
- Unowned file fixed because TaxiApp needs it: `modules/user/utils/upcomingRideReminderService.js` (react-hot-toast import → `@/lib/toast`, nothing else changed).

## 2. Routes / guards / API

All under `src/app/taxi/` (102 files). Guard "user" = `userRoute()` = web `<UserProtectedRoute>`: no `getLocalUserToken()` → `/login` with `state.from` (the Taxi path).

| Route(s) | Guard | Screen |
|---|---|---|
| `/taxi`, `/taxi/about`, `contact`, `faq`, `services`, `blog`, `links` | public | Redirect to `/` |
| `/taxi/track/:token` | public | PublicRideTrack |
| `/taxi/terms`, `terms-and-conditions`, `privacy`, `privacy-policy`, `refund`, `cancellation`, `/taxi/user/terms`, `user/privacy`, `user/refund` | public | LegalPage |
| `/taxi/user`, `/taxi/user/activity`, `/taxi/user/bus`, `/taxi/user/support`, `/taxi/user/profile` | user | main tabs (UserMainTabKeepAlive: Home, Activity, BusHome, Support, Profile) |
| `/taxi[/user]/ride/select-location`, `select-vehicle`, `searching`, `tracking`, `complete`, `chat`, `detail/:id` | user | SelectLocation, SelectVehicle, SearchingDriver, RideTracking, RideComplete, Chat, RideDetail |
| `/taxi[/user]/parcel/type`, `details`, `contacts`, `searching`, `tracking`, `detail/:id`, `chat` | user | ParcelType, SenderReceiverDetails ×2, ParcelSearchingDriver, ParcelTracking, RideDetail, Chat |
| `/taxi[/user]/intercity`, `intercity/vehicle`, `details`, `confirm` | user | Intercity* |
| `/taxi[/user]/cab` | user | CabHome |
| `/taxi[/user]/bus/list`, `bus/seats`, `bus/confirm` | user | BusList, BusSeats, BusConfirm |
| `/taxi/bus`, `/taxi/bus/details` | user | BusHome, BusDetails |
| `/taxi/user/bus/details`, `/taxi/user/bus/checkout` | user | BusPreview, BusDetails |
| `/taxi/support`, `/taxi/activity`, `/taxi/profile` | user | Support, Activity, Profile (pages, not tabs — as the web) |
| `/taxi[/user]/wallet`, `notifications`, `promo`, `referral` | user | Wallet, Notifications, PromoCodes, Referral |
| `/taxi[/user]/profile/settings`, `edit`, `payments`, `addresses`, `notifications`, `delete-account` | user | Settings, ProfileSettings, PaymentSettings, AddressSettings, Notifications, DeleteAccount |
| `/taxi/user/profile/bus-bookings`, `bus-bookings/:id`, `subscriptions` | user | BusBookings, BusBookingDetail, Subscriptions |
| `/taxi[/user]/safety/sos`, `support/tickets`, `support/ticket/:id` | user | SOSContacts, SupportTickets, SupportTicketDetail |

API calls in my files (from the web code): `GET /users/bootstrap` (settings), `GET /users/app-modules` (ServiceGrid via userService.getAppModules), `GET /rides/active/me` (Home, 15 s active / 60-120-180 s idle), `GET /rides` (Activity: limit 60 / category; Profile: page 1 limit 1; reminders: category scheduled), bus bookings via `userBusService.getMyBookings`, `GET /users/me` + `GET /users/wallet` (Profile via userAuthService), notifications list / clear / delete (userAuthService), `POST /users/fcm-token`, `POST /users/sos`, `POST /common/upload/image`, Socket.IO (role user: `account:deleted`, `chat:message`, `ride:status:updated`, `rideAccepted`, `rideCancelled`), Google Geocoding + Routes (lib/google).

## 3. Web-only APIs replaced

framer-motion → Animated (fade / spring / stagger / loops / sliding pill); `<img>` → AppImage / expo-image; CSS gradients → expo-linear-gradient / react-native-svg (radial); index.css `--user-*` and `.user-app-theme` remaps → `useUserPalette()` tokens; `createPortal` dialogs → foundation Dialog; `window.confirm` → Alert; `window.google` Geocoder / Directions → lib/google; persistent Google map div → AppMap + persistentMap camera; Flutter FCM bridge → @/lib/push; FileReader / `<input type=file>` → pickImage + expo-file-system base64; checkout WebView breakout → Linking; `window.scrollTo` / scroll listeners → ScrollView refs / onScroll; `history.state` key → `router.canGoBack()`; react-icons io5 → Ionicons; `document.title`, html classes, CSS variables on `<html>` → not needed.

## 4. Imports of other groups' files still missing when I finished

All owned by **taxi-bus**: `pages/Wallet`, `pages/PromoCodes`, `pages/Referral`, `pages/bus/BusConfirm`, `pages/bus/BusDetails`, `pages/bus/BusPreview`, `pages/profile/AddressSettings`, `pages/profile/BusBookingDetail`, `pages/profile/BusBookings`, `pages/profile/DeleteAccount`, `pages/profile/PaymentSettings`, `pages/profile/ProfileSettings`, `pages/profile/Settings`, `pages/profile/Subscriptions` (route files under `app/taxi/**` import them).

## 5. Status

Every screen / component / route above: **Built, not tested** (no device or emulator run in this step).

## 6. Foundation notes / blockers

- `PUSH_PLATFORM` in `src/lib/push.js` is `'android'`; the Taxi bridge sends `'mobile'` (what the web shell sent and what the backend stores as the app token), same finding as the shell group.
- Metro has no `avif` asset extension (only `ExplorerSection` would need `jaipur.avif`; nothing imports it).
- Several Taxi `.js` helpers not owned by anyone still contain web-only code (`shared/hooks/useKeyboardOffset.js` uses `window.visualViewport`, `shared/utils/googleRoutes.js` uses `window.google`) — not imported by my files.
- Nothing blocked by credentials or backend.
