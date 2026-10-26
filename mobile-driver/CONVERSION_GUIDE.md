# Hello Parth Captain (driver app) — how a web file is converted

The app in `mobile-driver/` is a **conversion** of the web driver / owner / bus-driver portal in `Frontend/src`
(`/taxi/driver/*`, `/taxi/owner/*`; React + Tailwind, shown today inside a Flutter WebView). The web app at phone width (360–412 px) is the specification: same screens, texts,
colours, spacing, fonts, icons, images, states, flows and API calls. Nothing is added, nothing is redesigned.
Never use a WebView for a screen (only `src/lib/razorpay.js` uses one, for the payment page).

`Frontend/` and `Backend/` are **read-only**. Do not edit them.

## 1. Where files go

Every web file keeps its path: `Frontend/src/<path>` → `mobile-driver/src/<path>` (same name, same exports, same props),
so every import between converted files stays exactly as on the web. One exception: the web's `src/app/*`
(Redux store, slices, App-level watchers) lives in `mobile-driver/src/appstore/*`, because `src/app/` is Expo Router's
routes folder.

The import aliases are the web's (babel.config.js): `@/x` → `src/x`, `@food/x` → `src/modules/Food/x`,
`@food/api` → `src/services/api`, `@/components/x` → `src/modules/Taxi/components/x`, `@/assets/x` → `src/modules/Taxi/assets/x`.

Already in `mobile-driver/src`: every non-UI `.js` file the driver screens import (API layer `services/api/*`,
`modules/Taxi/shared/api/*`, `modules/Taxi/modules/driver/services/*`, `driver/utils/*`, hooks), the images/sounds, and the
shared screens the user app already converted (`modules/Taxi/modules/user/pages/ride/Chat.jsx`, `.../support/SupportTickets.jsx`,
`SupportTicketDetail.jsx`, `modules/Taxi/modules/shared/pages/LegalPage.jsx`, `DriverLegal*.jsx`, `UserSupportChatPanel.jsx`, ...).
**The `.jsx` files of your group are not there** — you write them. A converted user-app screen is a good example of how a
similar web screen was converted: `../mobile-user/src/modules/Taxi/modules/user/pages/**` (read-only for you).

Note: four web images are JPEG files named `.png`; in the app they are renamed (a release build rejects them):
`modules/Taxi/assets/driver_welcome_hero.jpg`, `assets/images/driver-login-bg.jpg`, `assets/map_image.jpg`,
`assets/premium_grid_map.jpg` — import the `.jpg` name.

Route files (`src/app/taxi/driver/**`, `src/app/taxi/owner/**`) and the shell already exist (see section 7). Do not create or
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
| Text / inputs | `Text`, `TextInput` from `@/native/ui` — never `react-native`'s directly. `fontFamily` + `fontWeight` work like CSS (`{ fontFamily: fonts.outfit, fontWeight: '700' }`). The whole Captain app is wrapped in `<FontScope family="Outfit">` (web: .driver-theme font-family Outfit): do not set Outfit again unless the web sets another font. |
| Page container | `Screen` from `@/native/ui` (safe areas, status bar, bg) |
| Skeleton (`animate-pulse`) | `Skeleton` from `@/native/ui` |
| Dialog / drawer / bottom sheet / popover / fixed overlay | `Dialog`, `Sheet`, `Overlay` from `@/native/ui` — style the content like the web one |
| `canvas-confetti` | `Confetti` from `@/native/ui` |
| Google map (`@react-google-maps/api`, leaflet) | `AppMap`, `Marker`, `Polyline`, `Circle`, `Polygon` from `@/native/ui/AppMap` (`toLatLng`, `regionFor` helpers) |
| `google.maps` Geocoder / Places / Directions | `@/lib/google`: `geocodeLatLng`, `geocodeAddress`, `autocomplete`, `placeDetails`, `nearbySearch`, `computeRoute`, `decodePolyline` (results in the old JS-SDK shapes) |
| `window.Razorpay` / payment pages | `@/lib/razorpay`: `new Razorpay(options).open()` (same options/handlers), `openPaymentPage(url)` |
| `<input type="file">`, downloads, `window.print`, jsPDF | `@/lib/media`: `pickImage`, `pickDocument`, `downloadAndShare`, `shareTextFile`, `printHtml`, `openExternal`, `openMapsNavigation` |
| `tel:`, `mailto:`, `https://wa.me` links, `window.open` | `Linking.openURL` (or `openExternal`) |
| Push / FCM token (Flutter bridge `getFcmToken`, `__nativeFcmToken`) | `@/lib/push`: `getNativeFcmToken()`, `onFcmTokenChange`, `PUSH_PLATFORM` (`'mobile'`), then the **same** backend call the web makes |
| Voice search (Flutter speech handler) | `@/lib/voice`: `startVoiceSearch({ onPartial })`, `stopVoiceSearch()` |
| Date / time inputs | `@react-native-community/datetimepicker` |
| `<input type="range">` | `@react-native-community/slider` |
| HTML content (`dangerouslySetInnerHTML`) | `react-native-render-html` (`RenderHTML`, `contentWidth` from `useWindowDimensions`) |
| Socket.IO, Firebase Realtime DB, axios | same libraries, same code |
| Long lists (`.map` over API data) | `FlatList` / `SectionList` with stable `keyExtractor`. Short static lists may stay `.map` inside a `ScrollView`. |
| Horizontal scroll rows / snap carousels | horizontal `FlatList`/`ScrollView` (`snapToInterval`, `pagingEnabled`) |
| `position: fixed` bars (bottom CTA, sticky header) | a sibling `View` outside the `ScrollView` (absolute bottom / top) |
| Keyboard | `Screen keyboard` or `KeyboardAvoidingView`; `keyboardShouldPersistTaps="handled"` on scroll views with inputs |

Installed and allowed: everything in `mobile-driver/package.json`. **Do not run `npm install` / `npx expo install`**
(several people work in the same `node_modules`). If you truly need another package, write the closest solution with what is
installed and name the package in your report.

## 3. Styling = the web's Tailwind, by hand

Theme tokens: `import { colors, alpha, sp, fontSize, radius, shadow, fonts, brand, makeStyles, useTheme } from '@/theme'`.
- `px-4` → `paddingHorizontal: sp(4)` (16), `gap-2.5` → `gap: sp(2.5)`, `text-sm` → `...fontSize.sm`, `rounded-2xl` → `radius['2xl']`,
  `shadow-md` → `...shadow.md`, `bg-gray-100` → `colors.gray[100]`, `bg-black/40` → `alpha(colors.black, 0.4)`,
  `text-[13px]` → `fontSize: 13`, `bg-[#9A1809]` → `'#9A1809'`.
- Responsive classes: use the **mobile** value (no prefix, or what applies below 412 px). Ignore `md:`/`lg:`/`xl:` and desktop-only components.
- **The driver portal is light only** (the web keeps it outside the customer dark theme). Ignore every `dark:` class.
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

Write `mobile-driver/conversion/<your-group>.md`:
1. Every web file you converted → native file, and anything in it you could not reproduce exactly (and why).
2. Every route/screen with its guard (who can open it: guest / logged-in user), and the API calls it makes
   (method + path, from the web code).
3. Web-only APIs you replaced and with what.
4. Imports of files owned by other groups that were still missing when you finished.
5. Status per screen: `Built, not tested` (you cannot run the app) — never `Verified`.
6. Anything blocked (missing credential, backend change needed) with the exact reason.

## 7. Captain app specifics (read all of it)

**Shell (already written, do not edit — report problems instead):** `src/app/taxi/_layout.jsx` = `DriverApp` (settings, push,
Outfit, bg `#F8F9FA`) + `DriverLayout` (the web DriverLayout guard: /drivers/me, approval, roles, connection error) + one Stack
for all of /taxi/driver/** and /taxi/owner/**. `DriverLayout` also draws `DriverTabKeepAlive`, `DriverBottomNav` (the floating
bottom bar) and `DriverRideRequestListener`. `modules/Taxi/modules/shared/components/DriverTopBar.jsx` and `DriverNavBar.jsx`
are converted (same props as the web).

**Kept-alive bottom-bar tabs.** These screens are NOT rendered by their route: `DriverTabKeepAlive` renders them once and keeps
them mounted (hidden with opacity 0 while another tab is open): DriverHome (/taxi/driver/home, /dashboard), RideRequests
(/taxi/driver/history), DriverWallet (/taxi/driver/wallet), DriverIncentives (/taxi/driver/incentives), DriverProfile
(/taxi/driver/profile, /taxi/owner/profile), OwnerDashboard (/taxi/owner/home, /dashboard), ManageDrivers
(/taxi/owner/manage-drivers), OwnerVehicleFleet (/taxi/owner/vehicle-fleet), OwnerBusServicePage (/taxi/owner/bus-service).
The same components are also ordinary stack pages on other paths (RideRequests on /taxi/owner/history, ManageDrivers on
/taxi/driver/manage-drivers, OwnerVehicleFleet on /taxi/owner/vehicle-fleet/edit/:vehicleId ...). In these components:
- `import { useDriverTabActive } from '<relative path>/driverTabPages'` (file `modules/Taxi/modules/driver/driverTabPages.js`).
  It is `true` on an ordinary page and for the tab on screen, `false` for a hidden kept-alive tab.
- What the web did **while mounted** (socket listeners, intervals / polling, alert sounds, popups, `focus` listeners,
  back-button handling) runs only while `tabActive` (add it to the effect's condition and deps): on the web the screen was
  unmounted when another tab opened. Data the web loaded **on mount** is loaded again when `tabActive` turns true (the web
  remounted the screen on every visit) — keep showing the old data while it reloads (no skeleton flash on a revisit).
- A tab screen's own `<StatusBar>` (from `@/native/ui/SectionStatusBar`) is rendered only while `tabActive`
  (`{tabActive ? <StatusBar style="light" /> : null}`): React Native keeps status-bar entries as a stack and the newest wins.
- No `navigate()` from an effect while the tab is hidden.

**Bottom bar space.** On the paths with the floating bottom bar (driver: home, dashboard, history, wallet, incentives,
profile, vehicle-fleet/**; owner: home, dashboard, history, wallet, profile, manage-drivers, vehicle-fleet/**,
bus-service/**, bus-bookings) the scroll content needs room at its end: `paddingBottom: useBottomNavSpace()` (from
`@/native/ui`) where the web had its bottom padding for the bar. The bar itself is drawn by the layout — never render
`DriverBottomNav` in a page. A web element marked `data-driver-overlay` (popups that hide the bar) must be a `Dialog` /
`Sheet` / `Overlay` (native Modal), which covers the bar.

**Edge to edge.** The app draws under the status bar and the Android navigation bar. A page with a coloured header puts
the status-bar inset inside that header (`paddingTop: insets.top` from `useSafeAreaInsets()`); a plain page uses `<Screen>`
or adds `<StatusBarScrim color=...>` (from `@/native/ui`) when its content scrolls under the status bar; fixed bottom
buttons sit above `insets.bottom`. Status-bar icons: `<StatusBar style="light" | "dark" />` from `@/native/ui/SectionStatusBar`
(the app default is dark icons).

**Partner styling (Taxi index.css `.driver-theme`, light only).** Page background `driverTheme.bg` (#F8F9FA), text #0F172A,
Outfit. `text-primary` / `bg-primary` / `border-primary` = `driverTheme.primary` (#1C2833). **Buttons** (`<button>` or `<a>`)
drawn `bg-slate-900`, `bg-slate-950`, `bg-black`, `bg-indigo-600`, `bg-violet-600`, `bg-purple-600`, `bg-orange-500`,
`bg-yellow-400`, `bg-[#FFC400]` or `bg-[#ff6b4a]` are shown **#2563EB with white text** on the web (forced by CSS), unless
the button has `data-card`. `import { driverTheme } from '@/theme'`. Read the web CSS a screen imports
(`driver/styles/driver.css`, `components/auth/AuthShell.css`, `shared/components/driverChrome.css`) and
`Frontend/src/modules/Taxi/index.css` for classes it uses (`trip-screen-root`, `trip-sheet-scroll`, `no-scrollbar`,
`glass-morphism`, `driver-cms-fit` ...).

**React Native 0.88 / Expo SDK 58 rules that broke the user app on a real phone (all mandatory):**
1. `StyleSheet.absoluteFillObject` does not exist any more: use `StyleSheet.absoluteFill`.
2. Every horizontal `ScrollView` / `FlatList` gets `style={{ flexGrow: 0 }}` (otherwise it fills the screen height).
3. Never put text directly inside a `View` (also not `{' '}` or a string from a ternary / `&&`): always inside `<Text>`.
   It crashes the screen. Watch `{count && <X/>}` with a number `count` (renders "0" as raw text): use `count ? ... : null`.
4. Do not assign to globals (`navigator.x =`, `window.x =`): they are read-only.
5. OTP / PIN inputs: keep each box's value in a ref (state lost digits), dismiss the keyboard after the last digit,
   refocus the first box after a wrong code. Never hard-code an OTP; send exactly what was typed (backend default 1234).
6. Never write the URL query from an effect with `navigate(..., { replace })`: use `setSearchParams` from `@/lib/router`.
7. Pages appear instantly (no entrance fade from opacity 0). Dialogs / sheets: `Dialog` / `Sheet` from `@/native/ui`.
8. Main screens (Home, History, Wallet, Milestone, owner dashboard, lists) get pull-to-refresh (`RefreshControl`) that
   reloads the page's data; the page shows its own loading state while it reloads.
9. Every literal path you navigate to must exist in `src/app/taxi/**` (the web's route table, already created). Use the
   full web path (`/taxi/driver/...`). `navigate(-1)` works.
10. Long lists from the API: `FlatList` (stable `keyExtractor`); short static lists may `.map` in a `ScrollView`.
11. Forms: `keyboardShouldPersistTaps="handled"` on scroll views with inputs; the window resizes for the keyboard.

**Native modules for driver features:**
- Location: `navigator.geolocation.getCurrentPosition / watchPosition / clearWatch` work (webCompat over expo-location).
  The background **"You are online" service**: `import { startOnlineLocationUpdates, stopOnlineLocationUpdates } from '@/lib/driverLocation'`.
- Ride alert: `driver/utils/rideRequestAlertSound.js` is already native (same exports as the web).
- Camera / gallery / files: `pickImage({ source: 'camera' | 'library' })`, `pickDocument()` from `@/lib/media` (read the file
  for the exact return shape). For uploads build `FormData` with `{ uri, name, type }` objects exactly where the web
  appended a File, and call the same endpoint. Read `modules/Taxi/shared/hooks/useImageUpload.js` and
  `shared/services/uploadService.js` / `shared/utils/imageCompressor.js` (already native) before writing your own.
- Turn-by-turn: the same Google Maps URL the web opens, with `Linking.openURL` (`modules/Taxi/shared/utils/externalNavigation.js`).
- Maps: `AppMap`, `Marker`, `Polyline`, `Circle` from `@/native/ui/AppMap`; routes with `computeRoute` / `decodePolyline` from
  `@/lib/google` (Routes v2 — legacy Directions is OFF) or `modules/Taxi/shared/utils/googleRoutes.js` where the web used it.
- Payments: `new Razorpay(options).open()` from `@/lib/razorpay` (same options / handlers as the web), `openPaymentPage(url)`.
  No key in the app: it comes from the backend response like on the web.
- Phone call / WhatsApp / mail / web links: `Linking.openURL`.
- Date / time inputs: `@react-native-community/datetimepicker`.
- `simplify-js` is installed (same as the web).
