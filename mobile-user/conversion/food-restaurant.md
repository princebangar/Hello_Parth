# food-restaurant — conversion report

## 1. Files converted (web → native)

| Web (`Frontend/src/…`) | Native (`mobile-user/src/…`) | Not reproduced exactly |
|---|---|---|
| modules/Food/pages/user/restaurants/RestaurantDetails.jsx | same path | See notes below |
| modules/Food/components/user/AddToCartAnimation.jsx | same path | gsap timelines → `Animated` sequences with the same steps/durations; `pillClassName` prop → `pillStyle`; `dynamicBottom` (Tailwind class such as `bottom-[92px]`) is parsed to px |
| modules/Food/components/user/AddToCartButton.jsx | same path | `className` → `style` |
| modules/Food/components/user/StickyCartCard.jsx | same path | `position: fixed; bottom: 85px` → absolute view (parent must render it outside its scroll view); hover effects dropped |
| modules/Food/pages/user/Dining.jsx | same path | hover variants (card lift / image zoom / shine) dropped — touch only; `whileInView` entrance → entrance when the FlatList mounts the row |
| modules/Food/pages/user/DiningCategory.jsx | same path | hover effects dropped |
| modules/Food/pages/user/DiningExplore50.jsx | same path (exports the shared `DiningExploreScreen`) | **hard-coded demo restaurants not shipped** (see below) |
| modules/Food/pages/user/DiningExploreNear.jsx | same path (renders `DiningExploreScreen`) | same as Explore50 |

RestaurantDetails notes:
- Page scroll = one `SectionList` (one section per menu section; subsection headers/items are rows). The web's
  "first 5 dishes, rest after first scroll / 1.5 s" rule is kept (`onScrollBeginDrag` + 1.5 s timer).
- The web header/category chips are not sticky on the web either, so they scroll as the list header.
- Menu sheet "jump to category" → `scrollToLocation` (offset 80 = `scroll-mt-20`).
- Draggable floating "Menu" button → `PanResponder` with the web's drag constraints (no momentum).
- Add-to-cart fly animation source = the press event's window point (`pageX/pageY`) instead of the button rect centre.
- Highlighted dish (`?dish=` deep link): red wash + one light sweep + red outline (framer intent).
- Whole page `grayscale opacity-75` when offline/out of zone → `filter: [{ grayscale: 1 }]` + opacity (needs the new
  architecture on Android; on older Android versions only the opacity applies).
- Error boundary "Reload Page" (`window.location.reload()`) → remounts the page.
- Text `toLocaleString()` for rating counts relies on Hermes Intl.

## 2. Screens, guards, API calls

| Route | Guard | API calls (from the web code) |
|---|---|---|
| `/food/user/restaurants/:slug` (+ `?info=true`, `?dish=`, `?under250=true`) | guest can open; add/update cart needs login (`show-login-required` event) | GET `/dining/restaurants/:slug` (diningAPI.getRestaurantBySlug, slug deep links only), GET `/restaurant/restaurants/:id` (restaurantAPI.getRestaurantById, with lat/lng), GET restaurant list fallback (restaurantAPI.getRestaurants `{limit:100, zoneId}`), GET outlet timings (getOutletTimingsByRestaurantId), GET menu (getMenuByRestaurantId), GET inventory (getInventoryByRestaurantId), GET public offers (restaurantAPI.getPublicOffers, `partnerType: store` for stores); cart calls via CartContext |
| Dining tab (rendered by MainTabKeepAlive, `isTabActive`) | guest; wallet/profile links need login | GET dining hero banners, GET dining categories, GET dining restaurants `{city, zoneId, lat, lng}` (diningAPI.getHeroBanners / getCategories / getRestaurants); page cache via foodPageCache (15 min) |
| `/food/user/dining/:category` | guest | GET dining restaurants `{zoneId, category, city}` |
| `/food/user/dining/explore/upto50`, `/food/user/dining/explore/near-rated` | guest | none (web has none) |

Route files are not mine (shell owners create them).

## 3. Web-only APIs replaced

- `createPortal` overlays → `Sheet` / `Dialog` from `@/native/ui` (Android back closes them; body scroll lock removed — modals block the page).
- `window.open(share link)` → `Linking.openURL`; `tel:` link → `Linking.openURL`.
- clipboard textarea fallback → `navigator.clipboard` (webCompat → expo-clipboard) only.
- `new Image()` preloading / `<img>.currentSrc` reuse → `expo-image` `prefetch` / `getCachePathAsync`.
- `window` resize / `offsetWidth` → `useWindowDimensions` / `onLayout`.
- `window.scrollTo` → list scroll responder `scrollTo`.
- `getBoundingClientRect` (cart pill / thumbnails) → `measureInWindow`.
- Banner swipe `touches[0].clientX` → `nativeEvent.touches[0].pageX` (same handlers).
- `react-icons/fa6 FaLocationDot` → `@expo/vector-icons` FontAwesome6 `location-dot`.
- `<style>@keyframes shimmer` → animated `LinearGradient` band (`Shimmer`, exported from Dining.jsx).
- Links to `/user/dining/<slug>`, `/user/search`, `/user/restaurants/<slug>` (web relies on the `/user/* → /food/user/*`
  redirect) point straight at the `/food/user/...` target.

## 4. Missing imports of other groups' files (when finished)

- `@food/components/user/UserLayout` (food-shell: `useLocationSelector`, `useSearchOverlay`) — used by DiningCategory and DiningExplore50.

Everything else I import exists (food-shell ui kit, AnimatedPage, OptimizedImage, CartContext/ProfileContext, hooks).
Props I rely on: Button/Card/Badge `style` + `onPress` (Button passes the press event — needed for the fly-to-cart
start point), Input `onChangeText` / `onSubmitEditing`, Checkbox `checkedStyle`, AnimatedPage `style`,
OptimizedImage `style` + `objectFit` + `fallbackImage`, HeroBannerSkeleton / RestaurantDetailSkeleton `style`.

## 5. Status

| Screen / component | Status |
|---|---|
| RestaurantDetails (menu, filters, chips, dish popup + variants, menu/filters/location/collections/schedule/options/share/offers sheets, more-info page) | Built, not tested |
| AddToCartAnimation | Built, not tested |
| AddToCartButton | Built, not tested |
| StickyCartCard | Built, not tested |
| Dining | Built, not tested |
| DiningCategory | Built, not tested |
| DiningExplore50 / DiningExploreNear | Built, not tested |

`node scripts/check-converted.cjs` → 0 problems except the missing `UserLayout` import above.

## 6. Blocked / decisions

- **DiningExplore50 / DiningExploreNear**: the web pages render a hard-coded array of six invented restaurants
  (IRIS, Skyline Rooftop, The Grand Bistro, …) and have no API. The routes are not linked from any screen. Per the
  no-fake-data rule the list is empty natively (banner, search, chips and filter sheet are converted). If these pages
  should show real data, a backend list for them is needed (product decision).
- `bg-plum-*` classes on the Dining "OFF" badge are not Tailwind colours (no CSS on the web), so the outline badge keeps its default look — same natively.
- Dining is a tab inside the Food shell; its red header pads itself by the top safe-area inset (the shell should not add another top inset for this tab).
