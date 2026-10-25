# food-browse — conversion report

Group: Food browsing pages. All files pass `node scripts/check-converted.cjs` (0 problems) and an unbound-identifier scan.
Status of every screen: **Built, not tested** (app not run).

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-user/src/…`) | Not reproduced exactly / notes |
|---|---|---|
| `modules/Food/utils/browseScrollMemory.js` | same path | Rewritten for lists (see §3). Same exports + new list registry: `registerBrowseScroller(path, {scrollTo, getContentHeight, getViewportHeight, scrollToFocus?})`, `setActiveBrowseScroller`, `reportBrowseScroll(path, y)`, `notifyBrowseUserIntent()`, `getBrowseScrollY(path)`. **Home (food-home) and CategoryBrowseKeepAlive must register their list** for `restoreBrowseScroll` / `runCategoryScrollLock` to move anything (CategoryPage already does). |
| `modules/Food/pages/user/CategoryPage.jsx` | same | Logic copied 1:1 (fetch, enrichment, caches, filters, localStorage). Header is above the FlatList (web: fixed + spacer) and adds `insets.top` itself. While re-filtering with cards on screen, the web's white overlay is drawn above the dimmed cards via `ListHeaderComponentStyle zIndex` (may show only as dimmed cards on some devices). Filter sheet section tracking = pane onScroll (web IntersectionObserver). "All restaurants" lazy window = `onEndReached`. |
| `modules/Food/pages/user/Under250.jsx` | same | Logic copied 1:1 (progressive paging, cache, filters, cart sync). Fixed red header adds `insets.top`. Banner slider = Animated translateX + PanResponder. Item sheet swipe-down close = PanResponder (web touch/wheel). `AddToCartAnimation dynamicBottom` gets the web strings (`bottom-[92px]` / `bottom-[72px]`); the native component parses them. Out-of-service grayscale = RN `filter: grayscale(1)` (Android). |
| `modules/Food/pages/user/Categories.jsx` | same | 4-column FlatList; motion fade-in per index kept; hover gradient dropped (hover). |
| `modules/Food/pages/user/Collections.jsx` | same | Card clip-path flag drawn with react-native-svg; striped awning = views. Create dialog = `Dialog`. |
| `modules/Food/pages/user/CollectionDetail.jsx` | same | `window.confirm` → `Alert.alert` (Cancel / OK). |
| `modules/Food/pages/user/Gourmet.jsx` | same | Retry (`window.location.reload()`) re-runs the fetch. Banner `animate-in fade-in zoom-in` (tw-animate: opacity 0→1, scale 0→1, 1s) kept. |
| `modules/Food/pages/user/Offers.jsx` | same | Banner `offerpagebanner.svg` re-drawn with react-native-svg (no SVG transformer in Metro). Retry re-runs the fetch. |
| `modules/Food/pages/user/Coffee.jsx` | same | **Web page is static sample data** (Starbucks list, Unsplash images) and no screen links to it (`/food/user/dining/coffee`). Converted as the web has it; suggest removing the route. |
| `modules/Food/pages/user/MyStore.jsx` | same | Glossy radial back button = SVG RadialGradient. |
| `modules/Food/pages/user/ProductDetail.jsx` | same | **Web page is the old static sample product table + random reviews**, nothing links to `/food/user/product/:id`. Converted as is (the review UI is commented out on the web, so only its state is kept). `alert` → `Alert.alert`. Suggest removing the route. |
| `modules/Food/pages/user/restaurants/Restaurants.jsx` | same | Card link is `/restaurants/:slug` exactly like the web (no such app route — web bug kept, not changed). |
| `modules/Food/components/user/RestaurantImageCarousel.jsx` | same | Props: web `className` → `style` (`{ height }`, default 224 = h-56); `roundedClass` string still accepted (parsed) or `roundedStyle`. Auto-slide only while the card is in the middle 60% of the screen (measureInWindow every 3s; web IntersectionObserver). Swipe = PanResponder. Tap on a dish slide opens the dish (absolute Pressable, so the parent card Link does not fire). |

## 2. Screens, guards, API calls

| Route | Guard (web UserRouter) | API calls |
|---|---|---|
| `/food/user/category/:category` (CategoryPage, kept alive by CategoryBrowseKeepAlive) | guest | `GET /food/restaurant/categories/public` (zoneId); `GET /food/search/unified` (categoryId or q, zoneId, lat, lng, limit 18); `GET /food/restaurant/restaurants` (all); `GET /food/restaurant/restaurants/:id/menu` (enrichment, 3 at a time) |
| `/food/user/under-250` (Under250, in MainTabKeepAlive with `isTabActive`) | guest (cart/wallet/profile ask login via `show-login-required`) | `GET /food/hero-banners/under-250/public`; `GET /food/landing/settings/public`; `GET /food/restaurant/under-250` (paged: zoneId, priceLimit, limit 6, offset, scanSkip); `GET /food/restaurant/categories/public`; cart calls through CartContext |
| `/food/user/categories` | guest | `GET /food/restaurant/categories/public` |
| `/food/user/restaurants` | guest | `GET /food/restaurant/restaurants` (limit 300, noCache) |
| `/food/user/product/:id` | guest | none (static); cart via CartContext |
| `/food/user/dining/coffee` | guest | none (static) |
| `/food/user/my-store` | guest; redirects to `/food/user` when the Global My Store switch is off | `GET /food/restaurant/my-stores` (zoneId, lat, lng) |
| `/food/user/offers` | logged-in user | `GET /food/restaurant/offers` |
| `/food/user/gourmet` | logged-in user | `GET /food/hero-banners/gourmet/public` (zoneId) |
| `/food/user/collections`, `/food/user/collections/:id` | logged-in user | none (local state / favorites from ProfileContext) |

Route files are created by the shell owners (not this group).

## 3. Web-only APIs replaced

- `window.scrollY` / `window.scrollTo` / `[data-browse-focus]` / scroll listeners → FlatList `onScroll`, `scrollToOffset`, `scrollToIndex` through the browseScrollMemory registry; user wheel/touch cancel → `onScrollBeginDrag` → `notifyBrowseUserIntent`.
- `IntersectionObserver` → `onEndReached` (lazy list), pane `onScroll` (filter sheet), `measureInWindow` (carousel autoplay).
- `ResizeObserver` / `getBoundingClientRect` → `onLayout`.
- `document.body` scroll lock → not needed (native Modal sheets).
- `createPortal` + fixed overlays → `Sheet` / `Dialog`.
- `new Image()` preload → `expo-image` `Image.prefetch`.
- `framer-motion` → Animated (fade / slide / scale) and Pressable pressed scale.
- `sms:` / `mailto:` via `window.location.href` → `Linking.openURL`; `window.open` (WhatsApp/Telegram) and `navigator.share/clipboard` via webCompat.
- `react-icons/fa6` FaLocationDot → `@expo/vector-icons/FontAwesome6` `location-dot`.
- SVG banner import → react-native-svg drawing; CSS gradients → expo-linear-gradient; backdrop-blur → expo-blur.
- shadcn `Button` / `Card` / `Badge` / `Input` / `Avatar` → styled Pressable / View / TextInput with the same Tailwind classes (CSS-variable colours from global.css, light + dark).

## 4. Cross-group imports

All present when finished: `OptimizedImage` (shell), `AnimatedPage`, `ScrollReveal`, `TextReveal`, `Footer`, `UserLayout` (`useLocationSelector`), `ui/loading-skeletons`, `CartContext`, `OrdersContext`, `ProfileContext`, `hooks/useLocation`, `hooks/useZone` (food-shell), `AddToCartAnimation` (food-restaurant). None missing.

## 5. Status

Every screen above: **Built, not tested**.

## 6. Blocked / notes for integration

- Nothing blocked.
- Foundation: `window.location.href = "sms:…"/"mailto:…"/"tel:…"` in `src/lib/webCompat.js` is sent to the router (only http(s) goes to `Linking`). I used `Linking.openURL` here; other groups may hit this.
- CategoryPage and Under250 pad their own top header with the safe-area inset (web headers are `fixed top-0`); the keep-alive wrappers should not add a top inset again.
- Home (food-home) must call `registerBrowseScroller` / `reportBrowseScroll` for its own list so its back-restore works (API documented at the top of `browseScrollMemory.js`).
