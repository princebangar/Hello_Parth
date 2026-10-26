# Hello Parth Restaurant Partner (restaurant app) — how a web file is converted

The app in `mobile-restaurant/` is a **conversion** of the web restaurant-partner app in `Frontend/src`
(`/food/restaurant/*` = `modules/Food/components/restaurant/RestaurantRouter.jsx` + `modules/Food/pages/restaurant/**` +
`modules/Food/components/restaurant/**`; React + Tailwind, shown today inside a Flutter WebView). The web app at phone
width (360–412 px) is the specification: same screens, texts, colours, spacing, fonts, icons, images, states, flows and
API calls. Nothing is added, nothing is redesigned. The desktop dashboard (`pages/restaurant/desktop/**`, only for
browsers >= 1024 px) is NOT part of the app: wherever the web switches on `useDesktopLayout()` / `Responsive`, take the
phone (mobile) branch. Never use a WebView for a screen (only `src/lib/razorpay.js` uses one, for the payment page).

`Frontend/` and `Backend/` are **read-only**. Do not edit them.

## 1. Where files go

Every web file keeps its path: `Frontend/src/<path>` → `mobile-restaurant/src/<path>` (same name, same exports, same props),
so every import between converted files stays exactly as on the web. One exception: the web's `src/app/*`
lives in `mobile-restaurant/src/appstore/*`, because `src/app/` is Expo Router's routes folder.

The import aliases are the web's (babel.config.js): `@/x` → `src/x`, `@food/x` → `src/modules/Food/x`,
`@food/api` → `src/services/api`, `@delivery/x` → `src/modules/DeliveryV2/x`, `@/components/x` →
`src/modules/Taxi/components/x`, `@/assets/x` → `src/modules/Taxi/assets/x`.

Already in `mobile-restaurant/src` (converted, use them; do not rewrite):
- API layer `services/api/*` (full `restaurantAPI`, `authAPI`, `uploadAPI` ... same as the web), `modules/Food/utils/*`
  (`auth.js`, `firebaseMessaging.js` (native push), `imageUploadUtils.js`, `razorpay.js`, `currency.js`, `onboardingUtils.js`,
  `adminPartnerLabels.js`, `orderStatus.js`, `restaurantLocation.js`, `restaurantAvailability.js`, `restaurantOrderPricing.js`,
  `walletState.js`, `zoneGeometry.js`, `foodVariants.js`, `googleGeocoding.js`, `googlePlaces.js` (native: Places REST),
  `googleMapsApiKey.js`, `businessSettings.js` ...), `modules/Food/constants/dining.js`, `modules/Food/hooks/*`
  (`useRestaurantBackNavigation`, `useNotificationInbox`, `useCompanyName`, `useDelayedLoading`, `useAppBackNavigation`;
  `useRestaurantNotifications.js` is a first-pass copy — the **orders** group owns and finishes it, see section 7),
  `modules/Food/firebase.js`, `shared/**` (utils, `policyPaths`, `nativeShell` (`getAppRoutePath`), `loginFocus`,
  `imageCompressor`, `customToasts`, `emailValidation`, `networkError`, `useMyStoreEnabled`, `useOnboardingExitGuard`,
  `PolicyPageLoader`, `OnboardingExitModal`, `brandLogo`), `modules/Food/components/{AuthRedirect, ProtectedRoute, Loader,
  ImageSourcePicker, OptimizedImage}.jsx`, `modules/Food/components/user/{CMSPage, AnimatedPage}.jsx`,
  `modules/Food/components/ui/loading-skeletons.jsx` (OnboardingSkeleton, RestaurantGridSkeleton ...), the native
  shadcn kit in `modules/Food/components/ui/` (`button`, `card`, `input`, `label`, `switch`, `select`, `checkbox`,
  `dialog`, `badge`, `avatar`, `textarea`, `skeleton` — read each file for its props), `@delivery/components/BottomPopup`
  (the delivery app's native bottom popup), `modules/Food/assets/{loginbanner.png, dish_fallback.webp}`.
- Web `modules/Food/components/ui/{calendar, date-range-calendar, popover, radio-group}` are NOT in the app: draw them
  natively inside the file that uses them (`@react-native-community/datetimepicker`, a `Sheet`, Pressable radios).

Everything under `modules/Food/pages/restaurant/**` and `modules/Food/components/restaurant/**` that section 7 does not
list as shell is not there yet — you write it, from the web file at the same path. Converted screens of the other apps
are good examples of how similar web code was converted (read-only for you):
- `../mobile-delivery/src/modules/DeliveryV2/**` — the newest partner app: `pages/auth/SignIn.jsx` (phone + OTP login
  with every phone fix: LoginExitGuard, KeyboardAwareScrollView, keyboard-closed height), `pages/ProfileV2.jsx` (log-out
  popup), `pages/profile/ProfileBankV2.jsx` (bank form), `pages/help/*` (ticket forms), `pages/pocket/*` (finance lists).
- `../mobile-driver/src/modules/Taxi/modules/driver/**` (documents upload, wallet, online toggle, alert sound).
- `../mobile-user/src/modules/Food/**`, `../mobile-user/src/modules/auth/pages/Login.jsx`.

Web files that need no conversion (dead code on the web, nothing routes to them): `pages/restaurant/OrdersPage.jsx`,
`pages/restaurant/AddZone.jsx`, `pages/restaurant/auth/SignIn.jsx`, `pages/restaurant/auth/OTP.jsx` (the `otp` route
renders Login; the lazy import is unused), `components/restaurant/BottomNavbar.jsx` + `MenuOverlay.jsx` (only the dead
OrdersPage uses them), `components/restaurant/StorePanelWording.jsx` (done in the shared Text, see section 7),
`restaurantTheme.css` (section 7 colours), `RestaurantRouter.jsx` (route files), `pages/restaurant/desktop/**`.

Route files (`src/app/food/restaurant/**`) and the shell already exist (see section 7). Do not create or
edit route files, `_layout.jsx` files or shell files.

## 2. Foundation you build on (do not rewrite it; if something is missing or wrong, say so in your report)

| Need | Use |
|---|---|
| `localStorage`, `sessionStorage`, `window.addEventListener/dispatchEvent`, `CustomEvent`, `document.visibilityState` + `visibilitychange`, `window.location` (pathname/search of the current route, origin `https://helloparth.in`), `navigator.geolocation`, `navigator.onLine`, `navigator.clipboard`, `navigator.share`, `navigator.vibrate`, `matchMedia('(prefers-color-scheme: dark)')`, `import.meta.env.VITE_*` → `globalThis.__ENV__.VITE_*` | they just work (`src/lib/webCompat.js`). Keep the web logic that uses them. Tokens go to SecureStore automatically. |
| `react-router-dom` (`useNavigate`, `useLocation` incl. `.state`, `useParams`, `useSearchParams`, `Link`, `Navigate`, `matchPath`, `useNavigationType`) | `@/lib/router` — same API. `useBeforeLeave(fn)` for back-button guards (`popstate` on the web). `Outlet`/`Routes` do not exist: layouts are Expo Router `_layout.jsx`. |
| `sonner` / `react-hot-toast` | `import { toast } from '@/lib/toast'` (same API; `toast.custom(() => <View/>)` works) |
| `lucide-react` | `lucide-react-native` (same icon names; `size`, `color`, `strokeWidth`; no className) |
| `react-icons/fa6`, `/fa`, `/io5`, `/md` | `@expo/vector-icons` `FontAwesome6` / `FontAwesome` / `Ionicons` / `MaterialIcons` with the same glyph |
| `framer-motion`, CSS transitions/keyframes | `Animated` / `react-native-reanimated`: reproduce the same intent (fade, slide, scale, spring); add none |
| `<img>` | `AppImage` from `@/native/ui` (`src`, `fallback`, `contentFit`; relative `/uploads/..` URLs resolved like the browser) |
| Text / inputs | `Text`, `TextInput` from `@/native/ui` — never `react-native`'s directly. `fontFamily` + `fontWeight` work like CSS (`{ fontFamily: fonts.outfit, fontWeight: '700' }`). The app is wrapped in `<FontScope family="Poppins">` (web: global.css body font): set another font only where the web sets one (`font-['Outfit']` -> `fonts.outfit`, `font-['Poppins']` -> nothing). |
| Page container | `Screen` from `@/native/ui` (safe areas, status bar, bg) |
| Screen with inputs (forms, login, OTP, bank, ticket) | `KeyboardAwareScrollView` from `@/native/ui` (keeps the focused field above the keyboard — see section 7) |
| Skeleton (`animate-pulse`) | `Skeleton` from `@/native/ui` |
| Dialog / drawer / bottom sheet / popover / fixed overlay | `Dialog`, `Sheet`, `Overlay` from `@/native/ui` — style the content like the web one |
| `canvas-confetti` | `Confetti` from `@/native/ui` |
| Google map (`@react-google-maps/api`, leaflet) | `AppMap`, `Marker`, `Polyline`, `Circle`, `Polygon` from `@/native/ui/AppMap` (`toLatLng`, `regionFor` helpers) |
| `google.maps` Geocoder / Places / Directions | `@/lib/google`: `geocodeLatLng`, `geocodeAddress`, `autocomplete`, `placeDetails`, `nearbySearch`, `computeRoute`, `decodePolyline` (results in the old JS-SDK shapes) |
| `window.Razorpay` / payment pages | `@/lib/razorpay`: `new Razorpay(options).open()` (same options/handlers), `openPaymentPage(url)` |
| `<input type="file">`, downloads, `window.print`, jsPDF, html2canvas | `@/lib/media`: `pickImage`, `pickDocument`, `shrinkImage`, `downloadAndShare`, `shareTextFile`, `printHtml`, `openExternal`, `openMapsNavigation` |
| `new Audio(url)` / alert sounds | `expo-audio` (`createAudioPlayer(require('<relative>/assets/sounds/restaurant_alert.mp3'))`; the web's `/assets/media/restaurant_alert.mp3` is `mobile-restaurant/assets/sounds/restaurant_alert.mp3`) + `Vibration` |
| `tel:`, `mailto:`, `https://wa.me` links, `window.open` | `Linking.openURL` (or `openExternal`) |
| Push / FCM token (Flutter bridge `getFcmToken`, `__nativeFcmToken`) | already native in `@food/utils/firebaseMessaging` (`collectFcmTokenFast`, `persistModuleFcmToken` ... same exports as the web) — keep the web's calls |
| Browser `Notification` (`new Notification(...)`, permission prompts) | not needed: the app is the native shell and Android shows FCM pushes. Keep the in-app sound / popup logic |
| Date / time inputs | `@react-native-community/datetimepicker` |
| `<input type="range">` | `@react-native-community/slider` |
| HTML content (`dangerouslySetInnerHTML`) | `react-native-render-html` (`RenderHTML`, `contentWidth` from `useWindowDimensions`) |
| Socket.IO, Firebase Realtime DB, axios | same libraries, same code |
| Long lists (`.map` over API data) | `FlatList` / `SectionList` with stable `keyExtractor`. Short static lists may stay `.map` inside a `ScrollView`. |
| Horizontal scroll rows / snap carousels | horizontal `FlatList`/`ScrollView` (`snapToInterval`, `pagingEnabled`) |
| `position: fixed` bars (bottom CTA, sticky header) | a sibling `View` outside the `ScrollView` (absolute bottom / top) |
| Keyboard | `Screen keyboard` or `KeyboardAvoidingView`; `keyboardShouldPersistTaps="handled"` on scroll views with inputs |

Installed and allowed: everything in `mobile-restaurant/package.json`. **Do not run `npm install` / `npx expo install`**
(several people work in the same `node_modules`). If you truly need another package, write the closest solution with what is
installed and name the package in your report.

## 3. Styling = the web's Tailwind, by hand

Theme tokens: `import { colors, alpha, sp, fontSize, radius, shadow, fonts, brand, makeStyles, useTheme } from '@/theme'`.
- `px-4` → `paddingHorizontal: sp(4)` (16), `gap-2.5` → `gap: sp(2.5)`, `text-sm` → `...fontSize.sm`, `rounded-2xl` → `radius['2xl']`,
  `shadow-md` → `...shadow.md`, `bg-gray-100` → `colors.gray[100]`, `bg-black/40` → `alpha(colors.black, 0.4)`,
  `text-[13px]` → `fontSize: 13`, `bg-[#9A1809]` → `'#9A1809'`.
- Responsive classes: use the **mobile** value (no prefix, or what applies below 412 px). Ignore `md:`/`lg:`/`xl:` and desktop-only components.
- **The restaurant app is light only** (the restaurant panel has no theme switch; only a few web pages carry `dark:` classes, which apply only when a customer dark theme leaked into the same browser). Ignore every `dark:` class.
- Gradients: `expo-linear-gradient`. Blur/backdrop-blur: `expo-blur`. SVG/inline icons: `react-native-svg`.
- `hover:` → nothing; `active:scale-95`/`active:bg-*` → `Pressable` pressed style.
- `truncate` → `numberOfLines={1}`, `line-clamp-2` → `numberOfLines={2}`.

## 4. Behaviour

- Keep the component's logic, state, effects, API calls, caching, guards and texts exactly as the web has them; change only what
  the platform forces (DOM → native, events, scroll, keyboard, back button, safe areas).
- `window.scrollTo`, `scrollIntoView`, scroll position memory → `ref.scrollTo` / `scrollToOffset` on the screen's list.
- `IntersectionObserver` (infinite scroll, lazy sections) → `onEndReached` / `onViewableItemsChanged`.
- `popstate` / history guards (close sheet on back, "exit app?" dialogs) → `useBeforeLeave` or `BackHandler`.
- The Flutter bridge (`window.flutter_inappwebview.callHandler(...)`, `isNativeLikeShell()`): replace with the native
  module from section 2 and keep the web's "inside the app" behaviour (the app IS the native shell now).
- Loading / empty / error / success states: exactly the web's.
- **No mock, sample or fake data, no placeholder screens, no TODOs for existing functionality.**
- Cleanup every listener, timer, socket subscription and location watch on unmount.

## 5. Checking your work

For every file you write or change:

    node scripts/check-converted.cjs <your files or folders>

It compiles the file, checks every import resolves and flags web-only code. It must report 0 problems for your files.
(An import of a file another group owns may be "missing" until they finish — that is fine; list them in your report.)
Do not run `expo start`, `expo export` or Gradle; the integration step does that.

## 6. Report

Write `mobile-restaurant/conversion/<your-group>.md`:
1. Every web file you converted → native file, and anything in it you could not reproduce exactly (and why).
2. Every route/screen with its guard (who can open it: guest / logged-in user), and the API calls it makes
   (method + path, from the web code).
3. Web-only APIs you replaced and with what.
4. Imports of files owned by other groups that were still missing when you finished.
5. Status per screen: `Built, not tested` (you cannot run the app) — never `Verified`.
6. Anything blocked (missing credential, backend change needed) with the exact reason.

## 7. Restaurant app specifics (read all of it)

**Shell (already written, do not edit — report problems instead):**
- `src/app/_layout.jsx` (root: storage, splash, theme, `StoreWordingProvider`, toasts, maintenance gate, payments,
  notification taps) and `src/app/food/restaurant/_layout.jsx` = `src/modules/Food/components/restaurant/RestaurantApp.jsx`:
  the session listeners of RestaurantRouter + Food routes ("Session Expired" toast, 2 s token safety net, push
  registration, `focus` session check), `RestaurantRealtimeShell` (the web's RestaurantGlobalNotificationListener: shows
  `NewOrderNotification` on non-order pages and keeps the shared restaurant socket alive), the kept-alive tab screens and
  the one bottom bar, then the Stack for every page.
- `components/restaurant/restaurantRoutes.jsx` + every route file: `authRoute` (AuthRedirect module="restaurant"),
  `publicRoute`, `protectedRoute` (ProtectedRoute requiredRole="restaurant" loginPath="/food/restaurant/login"),
  `RestaurantTabRoute`, `redirectRoute`.
- `components/restaurant/restaurantTabPages.js`, `RestaurantTabKeepAlive.jsx`, `BottomNavOrders.jsx` (converted web
  file), `RestaurantRealtimeShell.jsx`, `RestaurantApp.jsx`.
- `src/native/ui/storeWording.js` = the web's StorePanelWording: for a My Store partner (`partnerType === 'store'`) every
  `Text` / `TextInput` placeholder string reads "store" instead of "restaurant" / "outlet". It converts **string
  children** of `<Text>` only, so keep UI text as plain strings inside `Text` (as the web had it in the DOM); do not
  add your own wording swaps. The web's explicit My Store checks (`isMyStorePartner()`, `useMyStoreEnabled`,
  `adminPartnerLabels`) stay exactly as they are.
- `src/lib/push.js`: channels `default` + the ringing `restaurant_orders`; a `new_order` push tap opens `/food/restaurant`.

**Kept-alive bottom-bar screens.** `OrdersMain` (paths `/food/restaurant`, `/orders`), `Inventory` (`/inventory`,
`/menu`), `Feedback` (`/feedback`, `/reviews`) and `ExploreMore` (`/explore`, `/settings`) are NOT rendered by their
route: `RestaurantTabKeepAlive` renders each once and keeps it mounted (hidden with opacity 0 while another tab or a page
is open). In these four components (and only what they own):
- `import { useRestaurantTabActive } from '@food/components/restaurant/restaurantTabPages'`. It is `true` while that
  screen is the one on screen, `false` while hidden.
- What the web did **while mounted** (polling intervals, socket-driven popups / the accept-reject popup + its ring,
  `BackHandler` / popstate handling, `window` listeners that react to events by opening things, timers) runs only while
  `tabActive` (add it to the effect's condition and deps): on the web the screen was unmounted when another route
  opened. Data the web loaded **on mount** is loaded again when `tabActive` turns true — keep showing the old data while
  it reloads (no skeleton flash on a revisit).
- A tab screen's own `<StatusBar>` (from `@/native/ui/SectionStatusBar`) is rendered only while `tabActive`.
- No `navigate()` from an effect while hidden.
- The screen's main scroll view gets `useTabScrollTop(ref)` from `@/native/ui/tabShown` (a tab starts at the top again
  after another tab was shown; Back from a page keeps the place — Prince's rule from the delivery app).
- Pull-to-refresh (`RefreshControl`, tint `#B80B3D`) on the four tab screens: reloads exactly what opening the screen
  loads; the screen shows its own skeleton / spinner state while it reloads, like the web's loading state.
- **Never render `BottomNavOrders` in these four screens**: the layout draws one bar on the tab paths. Their scroll
  content needs room at its end: `paddingBottom: useRestaurantNavSpace()` (exported from
  `@food/components/restaurant/BottomNavOrders`) where the web had its bottom padding for the bar (use the larger of the
  two). Pages that are not tabs but drew the bar on the web (`HubFinance`, `Hyperpure`, `OutletInfo`
  (`activeTabOverride="explore"`), `WithdrawalHistoryPage`) render `<BottomNavOrders />` themselves (as the last child of
  their root View) and use `useRestaurantNavSpace()` too.
- Popups that covered the bar on the web (`fixed inset-0 z-[...]`) must be a `Dialog` / `Sheet` / `Overlay` (native Modal).

**New-order alert (orders group).** `src/modules/Food/hooks/useRestaurantNotifications.js` is the web hook (one global
socket for every user of the hook, `new_order` / reservation / status events, the alert loop, muted / processed order
ids, polling fallback, `stopSound`, `clearNewOrder`, `isConnected` ...). The file in the app is a first copy from the user
app that still uses `new Audio()` / `fetch` blobs / browser `Notification`: finish its conversion keeping every rule;
replace `new Audio(...)` with an `expo-audio` player of the bundled `assets/sounds/restaurant_alert.mp3`
(`createAudioPlayer(require('../../../../assets/sounds/restaurant_alert.mp3'))`, loop / replay exactly like the web's timer
logic, `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' })` so it
also rings while the app is in the background / the screen is off), `navigator.vibrate` -> `Vibration.vibrate(...)`, the
Flutter bridge (`triggerWebViewNativeNotification`) and browser `Notification` -> nothing (Android shows the FCM push
the backend sends), the "unlock audio on first tap" -> not needed. When the app comes back to the front (`AppState`
'active' / the web's `visibilitychange` / `focus`) a dropped socket reconnects (keep / add the web's reconnect logic).
`getAppRoutePath()` from `@/shared/utils/nativeShell` is the current app path (use it where the web read
`window.location.pathname`). Reference: `../mobile-delivery/src/modules/Food/hooks/useDeliveryNotifications.js` (same job,
already converted and tested on a phone). `NewOrderNotification.jsx` (the global card) must render in a native Modal
(`Overlay` / `Dialog`) — the shell mounts it beside the Stack.

**Restaurant styling (`restaurantTheme.css`, light only).** `import { restaurantTheme, fonts } from '@/theme'`. The web CSS
recolours Tailwind classes inside every restaurant screen — apply these when you translate a class:
- Page text colour `#1F1F24` (theme root). Header / buttons / bottom bar gradient `from-[#B80B3D] to-[#66001D]`
  (`restaurantTheme.brand` / `brandDark`; `bg-gradient-to-br` -> start {x:0,y:0} end {x:1,y:1}, `-to-r` -> end {x:1,y:0}).
- **Primary `#DC2626`** replaces text `text-[#ff8100]`, `text-[#EB590E]`, `text-orange-500/600`, `text-amber-500/600`;
  backgrounds `bg-[#ff8100]`, `bg-[#EB590E]`, `bg-orange-500/600`, `bg-amber-500/600`; and **every button (or
  role=button) with `bg-black` / `bg-gray-900`** -> bg `#DC2626` + white text.
- **Primary strong `#991B1B`** replaces `text-green-700`, `text-emerald-700`, `text-orange-700`, `text-amber-700`.
- **Primary soft `#F9F0F7`** replaces `bg-orange-50`, `bg-amber-50`, `bg-orange-500/10`.
- Borders `border-orange-100/200`, `border-orange-500/20|30`, `border-[#ff8100]`, `border-[#EB590E]` -> `#F5BEBE`;
  `border-green-300`, `border-emerald-300`, `border-orange-300`, `border-amber-300` -> `#F3B5B5`.
- Gradients `from-orange-500`, `from-amber-500`, `to-orange-600`, `to-amber-600` -> `#DC2626` -> `#991B1B`.
- Inputs / textareas / selects when focused: border `#EC8C8C` + a soft ring (`restaurantTheme.focusBorder`).
- Everything else keeps Tailwind's colour (e.g. `bg-green-500`, `text-emerald-600` stay green).

**Keyboard (mandatory — the biggest complaint on the Captain + delivery apps). This app has MANY forms.** Edge-to-edge
Android does not resize the window reliably when the keyboard opens. Every screen with a text input must keep the
focused input above the keyboard: put the form in `KeyboardAwareScrollView` (from `@/native/ui`,
`keyboardShouldPersistTaps="handled"`). Fixed bottom buttons of a form (Save / Continue bars) ride on the keyboard with
`useKeyboardOffset()` (`@/modules/Taxi/shared/hooks/useKeyboardOffset`) or sit at the end of the scroll content. Inputs
inside a `Sheet` / `Dialog` must also stay visible (KeyboardAwareScrollView inside the sheet). List every input screen
and how you handled it in your report.

**Login / OTP / auth screens (auth group) — copy the delivery app's fixes (`../mobile-delivery/src/modules/DeliveryV2/pages/auth/SignIn.jsx`):**
- the page keeps its keyboard-closed height (no re-centring when the keyboard opens: the logo must not jump), the
  `KeyboardAwareScrollView` scrolls only as much as the number box + button need; decorative backgrounds (the web's
  SVG waves / banner) scroll with the form so nothing slides over the logo;
- gradient TEXT (SVG gradient text) looks wrong on Android: draw such a heading as plain text in `#B80B3D`;
- `<LoginExitGuard enabled={<login step shown>} dirty={phone.length > 0} accent="#B80B3D" />`
  (`@/native/ui/LoginExitGuard`): Back with an empty box closes the app at once, with something typed asks "Exit the app?";
- OTP boxes: keep each box's value in a ref (stale state lost digits), `Keyboard.dismiss()` after the last digit,
  refocus the first box on a wrong OTP, `Keyboard.dismiss()` on unmount;
- never hard-code an OTP (the backend's default OTP is a backend setting);
- after login go exactly where the web goes (`/food/restaurant`, onboarding, pending-verification ... with `replace`).

**Log-out (explore / settings group):** the web's log-out popup closes at once when log-out is pressed (its fade over
the login screen looked like a flash); navigate to `/food/restaurant/login` with `replace`. The shell unmounts the
kept-alive tabs ~0.9 s after the login screen is up.

**Other native mappings for this app:**
- `recharts` (HubFinance / finance charts): draw the same chart with `react-native-svg` (bars / lines / areas, axis
  labels, the same colours and data), read-only (tap-to-show-value only if the web had a tooltip: show it on press).
- `@mui/x-date-pickers` `MobileTimePicker` (outlet timings / day slots): `@react-native-community/datetimepicker`
  (`mode="time"`), store the web's value format.
- `jspdf` / `jspdf-autotable` (download report, bills): build the same document as HTML (same title, columns, rows,
  totals) and `printHtml(html, { filename })` from `@/lib/media` (saves / shares the PDF); CSV / Excel exports ->
  `shareTextFile(content, filename, mime)`.
- `lenis` (smooth scrolling) -> nothing (native scroll).
- `@googlemaps/js-api-loader` / google.maps map (address pin, zone setup): `AppMap` + `Marker` / `Polygon` / `Circle`
  from `@/native/ui/AppMap`; geocoding / places via `@/lib/google` or the converted `@food/utils/googleGeocoding` /
  `googlePlaces`. Build the map only after the splash (`useSplashDone()` from `@/native/splashState`). Web zoom z ->
  `regionFor(center, z)`. Put `collapsable={false}` on every View between the screen root and the map.
- Camera / gallery / files: `ImageSourcePicker` (already converted) / `pickImage({ source: 'camera' | 'library', maxSide:
  1600 })`, `pickDocument()` from `@/lib/media` (read the file for the return shape). For uploads build `FormData` with
  `{ uri, name, type }` where the web appended a File and call the same endpoint (`modules/Food/utils/imageUploadUtils.js`,
  `shared/utils/imageCompressor.js`).
- Printing a bill / KOT (if the web has `window.print`): `printHtml` with the same content.
- Phone call / WhatsApp / mail / web links: `Linking.openURL`.
- Date / month inputs: `@react-native-community/datetimepicker`. `<select>`: a bottom `Sheet` with the same options
  (or the converted `@food/components/ui/select`).
- Test-only buttons that exist on the web stay — parity — and are listed in your report.
- Durations under an hour show as minutes only ("20m", not "0h 20m") where the app formats durations itself.
- RN 0.88 crash patterns (the checker flags most): `StyleSheet.absoluteFillObject` does not exist (use
  `StyleSheet.absoluteFill`); every horizontal `ScrollView` / `FlatList` gets `style={{ flexGrow: 0 }}`; text directly
  inside a `View` (not in `Text`) crashes; never call `router.replace` / `setSearchParams` from an effect in a loop.
