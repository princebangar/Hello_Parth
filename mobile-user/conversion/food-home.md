# food-home — conversion report

Group: Food home screen, search / voice / location overlays, search page, voice + places logic.
Check: `node scripts/check-converted.cjs` on all files below -> 0 problems (all cross-group imports resolved at the time of the last run).

## 1. Files converted

| Web (`Frontend/src/...`) | Native (`mobile-user/src/...`) | Not reproduced exactly |
|---|---|---|
| modules/Food/pages/user/Home.jsx | same path | Page scrolls in its own `FlatList` (restaurant cards = items, everything above = header). `mask-edge-fade` on the category rows not reproduced (no CSS mask). `backdrop-blur` on the sticky header / popups replaced by the same translucent colours without blur. `grayscale` on closed restaurant cards: only the `opacity-75` part (RN has no grayscale filter). The web's sticky filter-chip row was never actually sticky (it is the last child of its container) — rendered in place. Footer is `hidden md:block` on the web -> not rendered (desktop only). Status bar: the web set `<meta theme-color>`; natively the red / fest-colour header is drawn under the translucent status bar (paddingTop = safe-area top) and the fixed sticky header gets a status-bar strip in the same colour. |
| modules/Food/components/user/home/HomeHeader.jsx | same path | Fest images enter/exit with Reanimated keyframes (spring approximated with back-easing). The blurred glow blobs behind the food images (`blur-3xl`, `blur-[40px]`) are not drawn. `-webkit-text-stroke` approximated with a dark text shadow. |
| modules/Food/components/user/home/FestBanner.jsx | same path | Not rendered by any web screen today; converted anyway (video via `expo-video`). Same blur / text-stroke notes as HomeHeader. |
| modules/Food/components/user/home/PromoRow.jsx | same path | Not rendered by Home on the web either (import only). `mix-blend-multiply blur-2xl` glow blob not drawn. |
| modules/Food/components/user/home/QuickSection.jsx | same path | `grayscale-[0.5]` and `backdrop-blur-[2px]` not reproduced (opacity / white veil kept). |
| modules/Food/components/user/VoiceSearchOverlay.jsx | same path | `backdrop-blur-md` dropped (bg-black/80 kept). |
| modules/Food/components/user/SearchOverlay.jsx | same path | Full-screen `Modal` (fade). Escape key -> Android back. |
| modules/Food/pages/user/search/ProfessionalSearch.jsx | same path | Sticky header is a `View` above the `ScrollView`; "scroll to results" scrolls the ScrollView to the results block. `backdrop-blur-xl` dropped. |
| modules/Food/components/user/LocationSelectorOverlay.jsx | same path | Map = `AppMap` with the web's pin-only `styles` as `customMapStyle`, gestures locked like the web (`gestureHandling: none`), zoom buttons on. Green marker = native green pin (web used maps.google.com green-dot.png). Blue dot + accuracy circle as `Marker` + `Circle`. The web's 500-line `trackUserLocation` (Ola/MapLibre) is dead code (never called) and was not ported. Keyword search + reverse fallback stay on Nominatim exactly like the web (a `User-Agent` header was added — Nominatim rejects anonymous clients and the browser sent its own). |
| modules/Food/hooks/useVoiceSearch.js | same path | Rewritten on `@/lib/voice`; same returned API, messages, 2 s silence commit, 2 automatic retries on "no speech". |
| modules/Food/utils/googlePlaces.js | same path | Rewritten without the Maps JS SDK: `fetchPlaceSuggestions` merges Places (New) autocomplete from `@/lib/google` + the backend text search (the web's legacy and new autocomplete are the same service natively). Exports and result shapes unchanged. |
| modules/Food/utils/googleGeocoding.js | unchanged copy | It only calls the backend geocode proxy (`/food/geocode/*`) and `navigator.geolocation` (webCompat) — already native-safe, so it was kept as is to keep the web's API calls (switching it to direct Google calls would change the requests). |

## 2. Screens, guards, API calls

| Screen / overlay | Guard | API calls (from the web code) |
|---|---|---|
| Home (Food delivery / takeaway main tab, rendered by MainTabKeepAlive with `homeMode` + `isTabActive`) | guest + user (login needed only for bell / wallet / profile -> `show-login-required` event) | GET `/food/restaurant/offers` (restaurantAPI.getPublicOffers), GET `/food/hero-banners/public`, GET `/food/explore-icons/public`, GET `/food/landing/settings/public` (publicGetOnce, `zoneId` param), GET public categories (adminAPI.getPublicCategories), GET public restaurants (restaurantAPI.getRestaurants with lat/lng/zoneId/orderType/filters), GET restaurant menus (restaurantAPI.getMenuByRestaurantId, only while Veg Mode is on); zone detect via useZone; notification inbox via useNotificationInbox (HomeHeader); wallet prefetch on press-in. |
| SearchOverlay (opened from UserLayout's search context) | guest + user | GET `/food/search/unified?q&limit=40` |
| ProfessionalSearch `/food/user/search?q&mode&cat` | guest + user | GET `/food/search/categories/admin`, GET `/food/search/unified` (q, categoryId, lat, lng, zoneId, orderType, isVeg) |
| VoiceSearchOverlay | guest + user | none (device speech recognition) |
| LocationSelectorOverlay | guest; "Add Address" requires login (else toast + `/login`) | userAPI.updateLocation (client no-op in the API layer), locationAPI.reverseGeocode (stub -> Nominatim fallback), Nominatim `/search` + `/reverse`, ProfileContext addAddress / updateAddress / setDefaultAddress |

No route or `_layout` files are owned by this group.

## 3. Web-only APIs replaced

- `window.scrollY` / scroll + resize listeners / `getBoundingClientRect` -> FlatList `onScroll` + `onLayout` measurements (sticky header threshold = bottom of the categories section).
- `IntersectionObserver` (restaurant infinite scroll) -> `onEndReached`; (filter sheet tab tracking) -> `onScroll` + section `onLayout` with the same 20%–30% band.
- `scrollIntoView` (filter tabs) -> `ScrollView.scrollTo(section y)`.
- `window.scrollTo` / browse scroll restore -> `registerBrowseScroller` / `reportBrowseScroll` / `restoreBrowseScroll` of the native browseScrollMemory, `FlatList.scrollToOffset` / `scrollToIndex`.
- `createPortal` popups / `document.body.style.overflow` -> RN `Modal` / `Sheet` (no body scroll lock needed).
- `new Image()` preload (incl. foodPageCache.preloadImageUrls) -> `expo-image` `Image.prefetch`.
- framer-motion -> RN `Animated` (springs, loops, glints) and Reanimated `Keyframe` entering/exiting (AnimatePresence swaps).
- `getBoundingClientRect` of the veg toggle -> `measureInWindow`.
- `<svg>` -> `react-native-svg`; gradients -> `expo-linear-gradient`; `<video>` -> `expo-video`.
- SpeechRecognition + Flutter mic-permission handlers -> `@/lib/voice` (expo-speech-recognition).
- google.maps JS SDK (map, markers, circle, Loader, AutocompleteService) -> `AppMap` / `Marker` / `Circle`, `@/lib/google.autocomplete`.
- `import.meta.env.*` -> `globalThis.__ENV__.*`.

## 4. Missing cross-group imports

None at the last check run (StickyCartCard, OrderTrackingCard, RestaurantImageCarousel, OptimizedImage, loading-skeletons, UserLayout hooks, ProfileContext, CartContext, useLocation, useZone, SuperAppHomeHeader, CategoryPage all resolved).

Notes for the owners:
- food-shell / UserLayout: the web's UserLayout mounted `LocationSelectorOverlay` through `useLocationSelector().openLocationSelector`; the native UserLayout I saw renders `SearchOverlay` but I did not find `LocationSelectorOverlay` mounted there. Home only calls `openLocationSelector` indirectly (HomeHeader links to `/food/user/address-selector`, as on the web), so nothing breaks on Home.
- MainTabKeepAlive: Home draws its own top safe-area inset inside the red header (edge-to-edge); the pane wrapping it must not add a top inset.

## 5. Status

| Screen | Status |
|---|---|
| Home (delivery + takeaway) incl. filter sheet, veg-mode popups/overlays, manage collections, bookmark toast | Built, not tested |
| HomeHeader / FestBanner / PromoRow / QuickSection | Built, not tested |
| SearchOverlay | Built, not tested |
| VoiceSearchOverlay + useVoiceSearch | Built, not tested |
| ProfessionalSearch | Built, not tested |
| LocationSelectorOverlay (list + add-address form with map) | Built, not tested |
| googlePlaces.js | Built, not tested |

## 6. Blocked / foundation notes

- Nothing blocked.
- Foundation: `utils/foodPageCache.js#preloadImageUrls` calls `new window.Image()`, which does not exist natively (throws if called). Home no longer calls it, but other screens importing it will crash — it should use `expo-image` `Image.prefetch`.
- Foundation: `@/lib/voice.startVoiceSearch` calls `stopVoiceSearch()` and then attaches new listeners; the previous session's `end` event can arrive after that and resolve the new session early with `''`. useVoiceSearch treats that as "no speech" and retries (up to 2 times), so it recovers, but the lib could wait for the old session's `end` before starting.
- Home's All Categories modal is unreachable on the web too (`setShowAllCategoriesModal(true)` is never called); converted for completeness.
