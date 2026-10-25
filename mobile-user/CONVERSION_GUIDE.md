# Hello Parth user app — how a web file is converted

The app in `mobile-user/` is a **conversion** of the web user app in `Frontend/src` (React + Tailwind, shown today
inside a Flutter WebView). The web app at phone width (360–412 px) is the specification: same screens, texts,
colours, spacing, fonts, icons, images, states, flows and API calls. Nothing is added, nothing is redesigned.
Never use a WebView for a screen (only `src/lib/razorpay.js` uses one, for the payment page).

`Frontend/` and `Backend/` are **read-only**. Do not edit them.

## 1. Where files go

Every web file keeps its path: `Frontend/src/<path>` → `mobile-user/src/<path>` (same name, same exports, same props),
so every import between converted files stays exactly as on the web. One exception: the web's `src/app/*`
(Redux store, slices, App-level watchers) lives in `mobile-user/src/appstore/*`, because `src/app/` is Expo Router's
routes folder.

The import aliases are the web's (babel.config.js): `@/x` → `src/x`, `@food/x` → `src/modules/Food/x`,
`@food/api` → `src/services/api`, `@/components/x` → `src/modules/Taxi/components/x`, `@/assets/x` → `src/modules/Taxi/assets/x`.

Already in `mobile-user/src` (copied unchanged, they work as they are unless listed under your group): all non-UI
`.js` files the user app imports (API layer `services/api/*`, `modules/Taxi/shared/api/*`, utils, stores, slices) and
the images/sounds. **`.jsx`/`.tsx` files are not copied** — you write them.

Routes (Expo Router, `src/app/`) are thin files: `export { default } from '@/modules/Food/pages/user/cart/Cart';`
They use the web's URLs exactly (`src/app/food/user/cart/index.jsx` = `/food/user/cart`,
`src/app/food/user/orders/[orderId]/invoice.jsx` = `/food/user/orders/:orderId/invoice`).
Only the shell owners (see your brief) create route files and `_layout.jsx` files.

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
| Text / inputs | `Text`, `TextInput` from `@/native/ui` — never `react-native`'s directly. `fontFamily` + `fontWeight` work like CSS (`{ fontFamily: fonts.outfit, fontWeight: '700' }`). Default font: Poppins; Taxi screens are wrapped in `<FontScope family="Outfit">` by the Taxi shell. |
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

Installed and allowed: everything in `mobile-user/package.json`. **Do not run `npm install` / `npx expo install`**
(13 people work in the same `node_modules`). If you truly need another package, write the closest solution with what is
installed and name the package in your report.

## 3. Styling = the web's Tailwind, by hand

Theme tokens: `import { colors, alpha, sp, fontSize, radius, shadow, fonts, brand, makeStyles, useTheme } from '@/theme'`.
- `px-4` → `paddingHorizontal: sp(4)` (16), `gap-2.5` → `gap: sp(2.5)`, `text-sm` → `...fontSize.sm`, `rounded-2xl` → `radius['2xl']`,
  `shadow-md` → `...shadow.md`, `bg-gray-100` → `colors.gray[100]`, `bg-black/40` → `alpha(colors.black, 0.4)`,
  `text-[13px]` → `fontSize: 13`, `bg-[#9A1809]` → `'#9A1809'`.
- Responsive classes: use the **mobile** value (no prefix, or what applies below 412 px). Ignore `md:`/`lg:`/`xl:` and desktop-only components.
- **Dark mode is real in the user app** (Appearance setting, `userTheme` key). Every `dark:` class must be reproduced:
  `const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.dark ? '#141414' : colors.white } }))`.
  Auth/login screens are light only (wrap in `ForceLight`). Also read the web's CSS files the screen relies on
  (e.g. `modules/Taxi/index.css` has `!important` overrides, including dark ones, for Taxi screens).
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

Write `mobile-user/conversion/<your-group>.md`:
1. Every web file you converted → native file, and anything in it you could not reproduce exactly (and why).
2. Every route/screen with its guard (who can open it: guest / logged-in user), and the API calls it makes
   (method + path, from the web code).
3. Web-only APIs you replaced and with what.
4. Imports of files owned by other groups that were still missing when you finished.
5. Status per screen: `Built, not tested` (you cannot run the app) — never `Verified`.
6. Anything blocked (missing credential, backend change needed) with the exact reason.
