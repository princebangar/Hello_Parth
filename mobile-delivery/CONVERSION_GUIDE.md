# Hello Parth Delivery Partner (food delivery app) — how a web file is converted

The app in `mobile-delivery/` is a **conversion** of the web delivery-partner (rider) app in `Frontend/src`
(`/food/delivery/*` = `modules/DeliveryV2`; React + Tailwind, shown today inside a Flutter WebView). The web app at phone width (360–412 px) is the specification: same screens, texts,
colours, spacing, fonts, icons, images, states, flows and API calls. Nothing is added, nothing is redesigned.
Never use a WebView for a screen (only `src/lib/razorpay.js` uses one, for the payment page).

`Frontend/` and `Backend/` are **read-only**. Do not edit them.

## 1. Where files go

Every web file keeps its path: `Frontend/src/<path>` → `mobile-delivery/src/<path>` (same name, same exports, same props),
so every import between converted files stays exactly as on the web. One exception: the web's `src/app/*`
(Redux store, slices, App-level watchers) lives in `mobile-delivery/src/appstore/*`, because `src/app/` is Expo Router's
routes folder.

The import aliases are the web's (babel.config.js): `@/x` → `src/x`, `@food/x` → `src/modules/Food/x`,
`@food/api` → `src/services/api`, `@/components/x` → `src/modules/Taxi/components/x`, `@/assets/x` → `src/modules/Taxi/assets/x`.
(The web's `@delivery/x` alias is not used by any delivery file; write `@/modules/DeliveryV2/x` if you need it.)

Already in `mobile-delivery/src`: every non-UI `.js` file outside `modules/DeliveryV2` that the delivery screens import
(API layer `services/api/*` with `deliveryAPI`, `modules/Food/utils/*` incl. `auth.js`, `firebaseMessaging.js` (native push),
`imageUploadUtils.js`, `razorpay.js`, `currency.js`, `deliveryNotifications.js`, `modules/Food/hooks/useNotificationInbox.js`,
`useCompanyName.js`, `modules/Food/realtimeTracking.js` + `firebase.js` (Firebase Realtime DB), `shared/utils/*`), and shared
screens / components already converted for the user or driver app (`modules/Food/components/user/CMSPage.jsx`,
`AnimatedPage.jsx`, `modules/Food/components/AuthRedirect.jsx`, `Loader.jsx`, `shared/components/PolicyPageLoader.jsx`,
`OnboardingExitModal.jsx`, `shared/hooks/useOnboardingExitGuard.js`, `modules/Taxi/modules/shared/components/DriverNavBar.jsx`,
`modules/Taxi/shared/hooks/useKeyboardOffset.js`, `modules/Food/hooks/useAppBackNavigation.js`, `ProfileContext.jsx` ...).
**Everything under `src/modules/DeliveryV2/` that the shell (section 7) does not list is not there** — you write it, from
`Frontend/src/modules/DeliveryV2/<same path>` (also the `.js` hooks / utils / store there: copy them and change only what
the platform forces). Converted screens of the other apps are good examples of how similar web code was converted:
`../mobile-driver/src/modules/Taxi/modules/driver/**` (driver Home with map + online toggle + request popup + alert sound,
wallet, documents, OTP login) and `../mobile-user/src/modules/Food/**`, `../mobile-user/src/modules/auth/pages/Login.jsx`
(read-only for you).

Web files that need no conversion (dead code, nothing imports them): `components/AvailableCashLimit.jsx`,
`BottomNavigation.jsx`, `BottomPopup.example.jsx`, `DeliveryLayout.jsx`, `DeliveryRouter.jsx`, `DepositPopup.jsx`,
`FeedNavbar.jsx`, `GoogleMapsTracking.jsx`, `map/RiderMarker.jsx`, `ui/GlassCard.jsx`, `ui/PremiumButton.jsx`,
`pages/auth/Signup.jsx`. Web `modules/Food/components/ui/*` (shadcn: button, calendar, popover, skeleton) are not in the
app: draw them natively inside the file that uses them (`Skeleton` from `@/native/ui` for skeleton).

Route files (`src/app/food/delivery/**`) and the shell already exist (see section 7). Do not create or
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
| Text / inputs | `Text`, `TextInput` from `@/native/ui` — never `react-native`'s directly. `fontFamily` + `fontWeight` work like CSS (`{ fontFamily: fonts.outfit, fontWeight: '700' }`). The whole delivery app is wrapped in `<FontScope family="Nunito Sans">` (web: .delivery-v2-theme font-family "Nunito Sans"): do not set it again; set `fonts.sora` where section 7 says so, or another font where the web sets one. |
| Page container | `Screen` from `@/native/ui` (safe areas, status bar, bg) |
| Screen with inputs (forms, login, OTP, bank, ticket) | `KeyboardAwareScrollView` from `@/native/ui` (keeps the focused field above the keyboard — see section 7) |
| Skeleton (`animate-pulse`) | `Skeleton` from `@/native/ui` |
| Dialog / drawer / bottom sheet / popover / fixed overlay | `Dialog`, `Sheet`, `Overlay` from `@/native/ui` — style the content like the web one |
| `canvas-confetti` | `Confetti` from `@/native/ui` |
| Google map (`@react-google-maps/api`, leaflet) | `AppMap`, `Marker`, `Polyline`, `Circle`, `Polygon` from `@/native/ui/AppMap` (`toLatLng`, `regionFor` helpers) |
| `google.maps` Geocoder / Places / Directions | `@/lib/google`: `geocodeLatLng`, `geocodeAddress`, `autocomplete`, `placeDetails`, `nearbySearch`, `computeRoute`, `decodePolyline` (results in the old JS-SDK shapes) |
| `window.Razorpay` / payment pages | `@/lib/razorpay`: `new Razorpay(options).open()` (same options/handlers), `openPaymentPage(url)` |
| `<input type="file">`, downloads, `window.print`, jsPDF, html2canvas | `@/lib/media`: `pickImage`, `pickDocument`, `shrinkImage`, `downloadAndShare`, `shareTextFile`, `printHtml`, `openExternal`, `openMapsNavigation` |
| `new Audio(url)` / alert sounds | `expo-audio` (`createAudioPlayer(require('<relative>/assets/sounds/restaurant_alert.mp3'))`; the web's `/assets/media/restaurant_alert.mp3` is `mobile-delivery/assets/sounds/restaurant_alert.mp3`) + `Vibration` |
| `tel:`, `mailto:`, `https://wa.me` links, `window.open` | `Linking.openURL` (or `openExternal`) |
| Push / FCM token (Flutter bridge `getFcmToken`, `__nativeFcmToken`) | already native in `@food/utils/firebaseMessaging` (`collectFcmTokenFast`, `persistModuleFcmToken` ... same exports as the web) — keep the web's calls |
| Browser `Notification` (`new Notification(...)`, permission prompts) | not needed: the app is the native shell and Android shows FCM pushes. Keep the in-app sound / popup logic |
| Voice search (Flutter speech handler) | `@/lib/voice`: `startVoiceSearch({ onPartial })`, `stopVoiceSearch()` |
| Date / time inputs | `@react-native-community/datetimepicker` |
| `<input type="range">` | `@react-native-community/slider` |
| HTML content (`dangerouslySetInnerHTML`) | `react-native-render-html` (`RenderHTML`, `contentWidth` from `useWindowDimensions`) |
| Socket.IO, Firebase Realtime DB, axios | same libraries, same code |
| Long lists (`.map` over API data) | `FlatList` / `SectionList` with stable `keyExtractor`. Short static lists may stay `.map` inside a `ScrollView`. |
| Horizontal scroll rows / snap carousels | horizontal `FlatList`/`ScrollView` (`snapToInterval`, `pagingEnabled`) |
| `position: fixed` bars (bottom CTA, sticky header) | a sibling `View` outside the `ScrollView` (absolute bottom / top) |
| Keyboard | `Screen keyboard` or `KeyboardAvoidingView`; `keyboardShouldPersistTaps="handled"` on scroll views with inputs |

Installed and allowed: everything in `mobile-delivery/package.json`. **Do not run `npm install` / `npx expo install`**
(several people work in the same `node_modules`). If you truly need another package, write the closest solution with what is
installed and name the package in your report.

## 3. Styling = the web's Tailwind, by hand

Theme tokens: `import { colors, alpha, sp, fontSize, radius, shadow, fonts, brand, makeStyles, useTheme } from '@/theme'`.
- `px-4` → `paddingHorizontal: sp(4)` (16), `gap-2.5` → `gap: sp(2.5)`, `text-sm` → `...fontSize.sm`, `rounded-2xl` → `radius['2xl']`,
  `shadow-md` → `...shadow.md`, `bg-gray-100` → `colors.gray[100]`, `bg-black/40` → `alpha(colors.black, 0.4)`,
  `text-[13px]` → `fontSize: 13`, `bg-[#9A1809]` → `'#9A1809'`.
- Responsive classes: use the **mobile** value (no prefix, or what applies below 412 px). Ignore `md:`/`lg:`/`xl:` and desktop-only components.
- **The delivery app is light only** (the web keeps it outside the customer dark theme). Ignore every `dark:` class.
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

Write `mobile-delivery/conversion/<your-group>.md`:
1. Every web file you converted → native file, and anything in it you could not reproduce exactly (and why).
2. Every route/screen with its guard (who can open it: guest / logged-in user), and the API calls it makes
   (method + path, from the web code).
3. Web-only APIs you replaced and with what.
4. Imports of files owned by other groups that were still missing when you finished.
5. Status per screen: `Built, not tested` (you cannot run the app) — never `Verified`.
6. Anything blocked (missing credential, backend change needed) with the exact reason.

## 7. Delivery app specifics (read all of it)

**Shell (already written, do not edit — report problems instead):**
- `src/app/_layout.jsx` (root: storage, splash, theme, toasts, maintenance gate, payments, notification taps) and
  `src/app/food/delivery/_layout.jsx` = `src/modules/DeliveryV2/DeliveryApp.jsx`: the `.delivery-v2-theme` root (page
  gradient, `<FontScope family="Nunito Sans">`), DeliveryV2Router's session listeners, the Food router's 2 s token safety
  net / push registration / `focus` session check, then the Stack for every page.
- `src/modules/DeliveryV2/routes.jsx` + every route file: `authRoute` (AuthRedirect), `publicRoute`, `protectedRoute`
  (ProtectedRoute), `DeliveryTabRoute`, `redirectRoute`. `components/ProtectedRoute.jsx` is converted.
- `components/DeliveryRealtimeShell.jsx` (native version): mounted by DeliveryApp while the rider is signed in; it runs
  `useDeliveryNotifications()` + `useRiderLocationSync()` and starts / stops the background location service with the
  store's `isOnline`. `useDeliveryNotificationsContext()` is exported from it — same name and value as the web.
- `components/DeliveryTabKeepAlive.jsx`, `components/DeliveryBottomNav.jsx`, `deliveryTabPages.js` (see below).
- `src/lib/riderLocation.js` (background "You are online" service), `src/lib/push.js` (channel, new-order push opens
  the Feed / Orders).

**Kept-alive bottom-bar screens.** `DeliveryHomeV2` (paths /food/delivery, /feed, /pocket, /history, /profile, with
`tab` = feed | pocket | history | profile from the path) and `OrdersV2` (/orders) are NOT rendered by their route:
`DeliveryTabKeepAlive` renders each once and keeps it mounted (hidden with opacity 0 while another tab or a page is
open). In these two components (and only what they own):
- `import { useDeliveryTabActive } from '<relative path>/deliveryTabPages'` (file `src/modules/DeliveryV2/deliveryTabPages.js`).
  It is `true` while that screen is the one on screen, `false` while hidden.
- What the web did **while mounted** (GPS watch, the 15 s heartbeat, polling intervals, `authRefreshFailed` listener,
  socket-driven popups, alert rings started by the screen, back-button handling) runs only while `tabActive` (add it to
  the effect's condition and deps): on the web the screen was unmounted when another route opened. Data the web loaded
  **on mount** is loaded again when `tabActive` turns true — keep showing the old data while it reloads (no skeleton
  flash on a revisit). The incoming-order popup + ring belong to the Feed screen (gate them with `tabActive` too); on
  other pages the Orders badge / OrdersV2 handle offers like the web (the realtime shell keeps the queue).
- `DeliveryHomeV2` switches Feed / Pocket / History / Profile itself (its `currentTab` state follows the `tab` prop) —
  keep that, including `currentTab === 'feed' ? <LiveMap/> : ...` (the web unmounts the map on the other tabs).
- A tab screen's own `<StatusBar>` (from `@/native/ui/SectionStatusBar`) is rendered only while `tabActive`.
- No `navigate()` from an effect while hidden.
- **Never render `DeliveryBottomNav` in a page**: the layout draws one bottom bar on the five tab paths. The scroll
  content of DeliveryHomeV2 / OrdersV2 / PocketV2 / HistoryV2 / ProfileV2 needs room at its end:
  `paddingBottom: useBottomNavSpace()` (from `@/native/ui`) where the web had its bottom padding for the bar. Popups
  that covered the bar on the web (`fixed inset-0 z-[...]`) must be a `Dialog` / `Sheet` / `Overlay` (native Modal).

**Background location (native addition).** The shell starts `startOnlineLocationUpdates()` while `isOnline`. While the app
is on screen the screens do exactly what the web did. For the background, `DeliveryHomeV2` registers
`setRiderBackgroundHandler((location) => ...)` from `@/lib/riderLocation` while the rider is online (cleanup on
offline / unmount); the handler gets an expo-location object (`location.coords.latitude/longitude/heading/speed/accuracy`)
and must do what the web's Feed `watchPosition` callback did for a position (setRiderLocation, `deliveryAPI.updateLocation(...)`,
`emitLocation(...)` and `writeOrderTracking(...)` for the active order) — read the current order / polyline / trip status
from refs, not from a stale closure. Without a handler the service sends the HTTP update only.

**New-order alert.** `useDeliveryNotifications` (`src/modules/Food/hooks/useDeliveryNotifications.js`) is the web hook:
socket.io connection, `new_order` / `order_ready` / status events, the queue in `useDeliveryStore`, the alert sound loop
(`ALERT_LOOP_MAX_MS` 10 s, re-trigger rules, muted orders) and `emitLocation`. Convert it keeping every rule; replace:
`new Audio(...)` → `expo-audio` player with the bundled `assets/sounds/restaurant_alert.mp3` (loop / replay exactly like
the web's timer logic; the player must be able to play with the app in the background: `setAudioModeAsync({
playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' })`), plus `Vibration.vibrate(...)`
where the web called `navigator.vibrate`; the Flutter bridge (`triggerWebViewNativeNotification`) and browser
`Notification` → nothing (Android shows the FCM push the backend sends: channel `default`, `data.type: 'new_order'`);
the web's "unlock audio on first user tap" → not needed. When the app comes back to the front (`AppState` 'active' /
the web's `visibilitychange`) a dropped socket reconnects (the web's own reconnect logic; keep it).

**Delivery styling (`deliveryTheme.css`, light only).** `import { deliveryTheme, fonts } from '@/theme'`. The web CSS
recolours Tailwind classes inside every delivery screen — apply these when you translate a class:
- Font: body **Nunito Sans** (already the FontScope). `h1`–`h4`, `.font-black`, `.font-extrabold` → `fontFamily: fonts.sora`
  (Sora 600/700 are bundled; keep the web's weight value — the closest file is picked), letterSpacing ≈ 0.01em.
  `.auth-legal-footer` → Poppins. `font-['Poppins']` / `.font-poppins` → Nunito Sans.
- `bg-[#121212]` → `LinearGradient` 160deg `#15498B` → `#000000` (`deliveryTheme.headerFrom/headerTo`; start {x:0.33,y:0}
  end {x:0.67,y:1} is close to 160deg). `bg-yellow-300/400`, `bg-[#f6e9dc]` → `#EEF3FB`.
- **Primary** `#15498B` replaces: text `text-blue-500/600`, `text-cyan-*`, `text-indigo-*`, `text-teal-*`, `text-orange-500/600`,
  `text-green-500/600`, `text-emerald-500/600`, `text-[#ff8100]`, `text-[#EB590E]`, `text-[#10B981]`; backgrounds
  `bg-blue-500/600`, `bg-cyan-*`, `bg-indigo-*`, `bg-teal-*`, `bg-orange-500/600`, `bg-green-500/600`, `bg-emerald-500/600`,
  `bg-[#ff8100]`, `bg-[#00B761]`, `bg-[#10B981]` (500/600 shades only; other shades keep Tailwind's colour).
- **Primary soft** `#E7EFFA` replaces `bg-orange-50`, `bg-green-50`, `bg-emerald-50`, `bg-blue-50`, `bg-cyan-50`,
  `bg-indigo-50`, `bg-teal-50` and the `/10` tints `bg-orange-500/10`, `bg-green-500/10`, `bg-emerald-500/10`, `bg-blue-500/10`,
  `bg-cyan-500/10`, `bg-indigo-500/10`.
- Borders `border-orange-100/200`, `border-orange-500/20`, `border-green-100`, `border-green-500/20`, `border-emerald-200`,
  `border-blue-100/200`, `border-blue-500/20`, `border-cyan-100`, `border-indigo-200`, `border-[#10B981]`, `border-[#ff8100]`
  → `#C3D0E1`.
- Gradients `from-/to-` orange, green, emerald, blue, cyan, indigo, teal, amber → `#15498B` → `#040C17`.
- `rounded-2xl` / `rounded-3xl` elements get `box-shadow: 0 10px 28px -18px rgba(17,39,67,.24)` (≈ `elevation: 3`,
  shadowColor `#112743`) and border colour `#D1DCEB`.
- Inputs / textareas / selects: border `#E8DEE7`, bg white, text `#0F1724`; focused border `#8AA4C5` (+ a soft ring);
  `aria-invalid` → border `#EF4444`, bg `#FEF2F2`, text `#B91C1C`.
- `.delivery-online-toggle`: online bg `#15498B`, offline bg `#000000`.
- `main` (where a page uses `<main>`): max width = screen − 16 px, centred, paddingBottom 92 (5.75rem).
- Below 640 px (always on a phone) every element with a `px-6` class has paddingHorizontal 17.6 and every `p-6` element
  padding 17.6.

**Keyboard (mandatory, the biggest complaint on the Captain app).** Edge-to-edge Android does not resize the window
when the keyboard opens. Every screen with a text input must keep the focused input above the keyboard: put the form
in `KeyboardAwareScrollView` (from `@/native/ui`), or for a login card at the bottom use the user app login's "lift"
(`../mobile-user/src/modules/auth/pages/Login.jsx`, the card slides up by the keyboard height). Fixed bottom buttons
of a form ride on the keyboard with `useKeyboardOffset()` (`@/modules/Taxi/shared/hooks/useKeyboardOffset`). List every
input screen and how you handled it in your report.

**Other native mappings for this app:**
- Location: `navigator.geolocation.getCurrentPosition / watchPosition / clearWatch` work (webCompat over expo-location).
- Camera / gallery / files: `pickImage({ source: 'camera' | 'library', maxSide })`, `pickDocument()` from `@/lib/media` (read
  the file for the return shape). For uploads build `FormData` with `{ uri, name, type }` where the web appended a File,
  and call the same endpoint; read `modules/Food/utils/imageUploadUtils.js` and `shared/utils/imageCompressor.js` (native).
- Turn-by-turn: the same Google Maps URL the web opens, with `Linking.openURL` / `openMapsNavigation`.
- Maps: `AppMap`, `Marker`, `Polyline`, `Circle`, `regionFor`, `toLatLng` from `@/native/ui/AppMap`; routes with
  `computeRoute` / `decodePolyline` from `@/lib/google` (Routes v2 — legacy Directions is OFF). Web zoom z → `regionFor(center, z)`.
  Build the map only after the splash: `useSplashDone()` from `@/native/splashState` (Google Maps freezes the UI ~1.6 s
  the first time).
- Payments (cash-limit deposit etc.): `new Razorpay(options).open()` from `@/lib/razorpay` / `@food/utils/razorpay` (same
  options and handlers). No key in the app: it comes from the backend like on the web.
- Phone call / WhatsApp / mail / web links: `Linking.openURL`.
- Date / time / month inputs: `@react-native-community/datetimepicker` (store the web's format).
- `<select>`: a bottom `Sheet` with the same options.
- ID card / statements exported as image or PDF on the web (html2canvas / jsPDF / print): `printHtml` / `shareTextFile` /
  `downloadAndShare` from `@/lib/media` with the same content.
- Test-only buttons that exist on the web (e.g. the Feed's simulation "SIM" button) stay — parity — and are listed in your report.
- Durations under an hour show as minutes only ("20m", not "0h 20m") where the app formats durations itself.
