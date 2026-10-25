# Group "shell" — conversion report

Check: `node scripts/check-converted.cjs` over every file below → **90 files, 0 problems** (2026-10-24).
Status of every screen/component: **Built, not tested** (no device / emulator run in this step).

## 1. Web file → native file

| Web (Frontend/src) | Native (mobile-user/src) | Not reproduced exactly / notes |
|---|---|---|
| app/providers.jsx | appstore/providers.jsx | Redux / router / Toaster already live in `app/_layout.jsx`; this keeps the toast guard import + error boundary (used by AppShell). HashRouter choice gone (no WebView). |
| app/ThemeSync.jsx | appstore/ThemeSync.jsx | Same logic (usePathname). |
| app/StatusBarSync.jsx | appstore/StatusBarSync.jsx | Renders null: web read the top pixel colour into `<meta theme-color>`; in the app every `<Screen>` sets its own status bar. |
| app/ConnectionStatus.jsx | appstore/ConnectionStatus.jsx | Same (online/offline from webCompat). |
| app/MaintenanceGate.jsx | appstore/MaintenanceGate.jsx | Same rules; no index.html boot layer to remove. |
| app/UserSessionSync.jsx | appstore/UserSessionSync.jsx | Same. |
| app/routes.jsx (AppRoutes effects) + app/App.jsx | appstore/AppShell.jsx | syncActiveModule + rememberLoginReturnTo, NATIVE_LAST_ROUTE_KEY with transient rules, clearUserLocalData on /login when logged out, `/food/user?vertical=taxi` → `/taxi/user`, sibling-module warm-up (whenAppSettled), old-link redirects (`/user/*`, `/restaurant/*`, `/delivery/*`, `/usermain/*`, `/profile/*`, `/orders/*` → `/food…`; `/cart/*` → `/food/user/cart`; `/food/user/profile/{terms,privacy,support-info}` → `/user/…`), syncSharedLocationStoresOnBoot, installDefaultLocationMode, markNativeSessionRunning, VerticalSwitchOverlay, LocationPrompt, logout cover, MaintenanceGate. Not done: the web's catch-all `* → /` (needs a `+not-found` route; not in my brief). |
| shared/components/AppErrorBoundary.jsx | same path | Chunk-reload branch dropped (no chunks in a bundle). |
| modules/auth/pages/Login.jsx | same path | See §1a. |
| modules/auth/routes.jsx | same path (AuthRoutes + LoginRedirect) | Used by `app/login/[...rest].jsx`. |
| modules/auth/pages/Register.jsx | same path | Empty on the web too. |
| shared/components/SuperAppHomeHeader.jsx | same path | Props unchanged. The bar starts at the content top: the home screen must put a status-bar spacer of `getVerticalTheme(v).theme` above it. `backdrop-blur-md` on the tabs pill not drawn. |
| shared/components/VerticalSwitchOverlay.jsx | same path | Rendered once by AppShell (web: portal). |
| shared/components/BootShell.jsx | same path | BootShellHeader/Body natively (index.html `.bs-*` sizes, dark variants). |
| shared/components/UserLogoutConfirmDialog.jsx | same path | Class props → `iconBgStyle`, `iconColor`, `confirmButtonStyle` (Food red defaults). Backdrop blur not drawn; card blur via expo-blur. |
| shared/components/UserAppearanceDialog.jsx | same path | shadcn colours from global.css (light/dark). |
| shared/components/UserDeleteAccountDialog.jsx | same path | Not closable by backdrop tap (web neither). |
| shared/components/ShareSheet.jsx | same path | `shareMessage` / `copyToClipboard` unchanged; wa.me / sms: via Linking. RN Share never rejects on dismiss, so `shareMessage` returns `'shared'` also when the sheet is just closed. |
| shared/components/Loader.jsx | same path | + named export `Spin` (animate-spin) reused by the shell. |
| shared/components/NumberSkeleton.jsx | same path | `bg-current` → pass `color` + `fontSize` (em widths kept). |
| shared/components/PolicyPageLoader.jsx | same path | Spinner phase carry-over not reproduced. |
| shared/components/TaxiPageSkeleton.jsx | same path | All index.html variants (activity, activity-list, profile, support, wallet, bus, page), light + dark; `taxiSkeletonVariant` same rule. |
| shared/components/AppRouteFallback.jsx | same path | Same branching. |
| shared/pages/UserPolicyPage.jsx | same path | `history.state.idx` → `router.canGoBack()`. |
| shared/utils/customToasts.jsx | same path | All four helpers; Pacifico wordmark with LinearGradient. |
| modules/Food/components/ProtectedRoute.jsx, AuthRedirect.jsx, AuthInitializer.jsx | same paths | Props/behaviour unchanged (Navigate from @/lib/router). |
| modules/Food/components/OptimizedImage.jsx | same path | `className` → `style` (box), new `imageStyle`; srcset/WebP variants dropped (loads `src`). |
| modules/Food/components/ImageSourcePicker.jsx | same path | Hidden `<input type=file>` dropped; uses foundation Dialog (not `@food/components/ui/dialog`). |
| modules/Food/components/ImageCropper.jsx | same path | **Crop not applied**: no canvas / image-manipulator installed; Save returns the picked file renamed `-cropped`. Needs `expo-image-manipulator` for a real crop. No user-app screen opens it. |
| modules/Food/components/MaintenanceScreen.jsx | same path | Artwork bundled from `public/maintenance` (copied to `src/assets/public/maintenance`). document.title N/A. |
| modules/Food/components/PushSoundEnableButton.jsx | same path | null (web did nothing on phones either). |
| modules/Food/components/Loader.jsx | same path | |
| modules/Food/pages/shared/MaintenancePage.jsx, modules/Global/pages/GlobalMaintenancePage.jsx | same paths | |
| modules/Food/pages/restaurant/{TermsAndConditions,PrivacyPolicy,CMSHelpSupport}Page.jsx | same paths | Restaurant routes only. |
| modules/Taxi/modules/shared/pages/LegalPage.jsx | same path (+ `legalPageTexts.js`) | `?raw` .txt imports → generated JS strings; long text in a FlatList (card split into slices). |
| modules/Taxi/modules/shared/pages/RazorpayStatusPage.jsx, PhonePeStatusPage.jsx | same paths | framer-motion → Animated (fade/scale/spin/dots/progress); blur-3xl glow drawn as a soft plain circle. |
| modules/Taxi/modules/shared/pages/DriverLegal{Terms,Privacy,Support}.jsx | same paths | Driver routes only. |
| modules/Taxi/modules/shared/components/AppAutoUpdater.jsx | same path | null: no web bundle to poll (needs expo-updates for OTA). |
| modules/Taxi/modules/shared/components/ChatUnreadBadge.jsx | same path | `className` offsets → `style` (outer box incl. 2 px ring: web `right-2 top-2` → `{ right: 6, top: 6 }`). |
| modules/Taxi/modules/shared/components/RouteSkeleton.jsx | same path | Re-export of AppShellSkeleton. |

Logic files (owned): `nativeShell.js` (isNativeLikeShell → true, getAppRoutePath = window.location.pathname, hardNavigate → navigateTo replace), `userSession.js` (logout FCM token from @/lib/push, platform "mobile"), `logoutTransition.js` (cover state + `<LogoutTransitionCover>` in AppShell), `whenSettled.js` (no `load` event), `useBodyScrollLock.js` (no-op), `imageCompressor.js` (identity for native `{uri}` files), `apiError.js` (copied; Flutter snackbar / MutationObserver parts removed), `toastGuard.js` (sonner → @/lib/toast), `policyPages.js` (chunk preloads removed — they were dynamic imports Metro would bundle), `pageCache.js` + `userLocalData.js` (storage keys via `length/key(i)`), `core/auth/auth.utils.js` (copied, was missing). The rest unchanged.

Files I had to add that no group owns (needed by my files; please keep): `shared/utils/useSwitcherIndex.js` (rewritten to Animated.Value), `shared/utils/preloadLogin.js` (no-op loaders; Food/Taxi Profile, Settings, DeleteAccount import it), `shared/utils/defaultLocationMode.js` (copied; App.jsx installed it), `modules/Global/constants/globalMaintenanceContent.js` (copied), `modules/Food/hooks/useRestaurantBackNavigation.js` (copied, router import swapped), assets `src/assets/public/{auth_assets/login-hero-food-taxi.webp, images/profile_avatar.webp, maintenance/*}` (import them relatively — `@/assets/*` is the Taxi alias).

### 1a. Login
Light only (ForceLight), Inter. Hero (gradient, glow, skyline, clouds, Pacifico wordmark + marks, Food • Taxi, dome, art + pin route) drawn natively with index.html's sizes incl. `--lg-vh` / `lg-short` rules (height measured once, only grows). Steps 1–5, OTP auto-verify, resend timer, phone draft in sessionStorage, pencil → focus number, referral (`?ref` / state), Skip → guest Food, Terms/Privacy/Support links warm the text on touch.
Differences: per-step history entries → Android back (BackHandler) returns to the phone step (a pushed `/login` would mount a second login in a native stack). Keyboard: the card slides up by the web's estimate (screen×0.41, 250–380) to the shared target position, rounded + shadow; real keyboard height not used (same as web). Screen height is locked so `resize` mode never squeezes the hero.

## 2. Routes / guards / API

| Route | Guard | API (from web code) |
|---|---|---|
| `/login` (`app/login/index.jsx`) | guest; signed-in → `resolveConsumerPostLoginRoute()` | `POST` user OTP request (authAPI.sendUnifiedOTP), `POST` verify (authAPI.verifyUnifiedOTP phone, otp, ref, null, fcmToken, `"mobile"`), `POST /fcm-tokens/mobile/save`, `PATCH /food/user/profile` (name), `POST /food/auth/user/recover-account`, `POST /food/auth/user/start-fresh` |
| `/login/*` (`app/login/[...rest].jsx`) | `/login/login` → Login, else → `/login` with `state.from` | — |
| `/user/terms`, `/user/privacy`, `/user/support` | anyone | `GET` USER_POLICY_ENDPOINTS (via CMSPage) |
| `/razorpay/status` | anyone (verify needs a session) | `POST /users/wallet/razorpay/verify` (or drivers) |
| `/phonepe/status` | anyone | userAuthService.verifyPhonePeWalletTopup (`GET` status, polled every 3 s, 10×) / `GET /drivers/wallet/top-up/phonepe/status/:id` |
| AppShell watchers | — | maintenance flags (useMaintenanceMode), logout `POST /food/auth/logout` (userSession) |

## 3. Web-only APIs replaced
Flutter `callHandler('getFcmToken')` → `getNativeFcmToken()`; `document.*`/DOM covers → React overlays; `createPortal` → AppShell overlays / Modal; framer-motion → Animated; `<img>` → AppImage (bundled assets); `?raw` → JS strings; `window.history.state.idx` → `router.canGoBack()`; `visualViewport` keyboard math → Keyboard events + onLayout; `history` steps → BackHandler; `tel:`/`mailto:`/wa.me/sms → Linking; meta theme-color → per-screen StatusBar.

## 4. Missing cross-group imports
None at the end (CMSPage, LocationPrompt, loading-skeletons exist now).

## 5. Status
Every screen/component above: **Built, not tested**.

## 6. Foundation problems / blockers
- `PUSH_PLATFORM` in `src/lib/push.js` is `'android'`, but the backend stores app tokens only for `platform === "mobile"` (`auth.service.js` fcmTokenMobile, `authAPI.saveLoginFcmToken` path). Login/logout here send `"mobile"`; other groups using `PUSH_PLATFORM` for these endpoints would land in the web token list.
- `localStorage`/`sessionStorage` shim: `Object.keys(localStorage)` returns the shim's methods, not stored keys. Fixed in my files; still broken in `modules/Food/utils/auth.js:251`, `modules/Food/utils/foodPageCache.js:158,187`, `modules/Food/hooks/useRestaurantNotifications.js:191`. Best fixed in `src/lib/storage.js` (enumerable keys / Proxy).
- No `+not-found` route: unknown paths show Expo Router's default screen (web redirected to `/`).
- Real image cropping needs `expo-image-manipulator` (not installed).
