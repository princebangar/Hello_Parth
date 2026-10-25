# food-shell — conversion report

Group: Food user shell, UI kit, contexts, hooks and every Food route file. Status of every screen/component below: **Built, not tested** (the app was not run).

## 1. Web file -> native file

### UI kit (`modules/Food/components/ui/*`, `.tsx` -> `.jsx`)
All keep the web's exports, variants, sizes and defaults. `className` -> `style` (outer box) + `textStyle` (text inside). `onClick` is accepted next to `onPress` everywhere.

| Web | Native | Notes |
|---|---|---|
| button.tsx | button.jsx | variants default/destructive/outline/secondary/ghost/link, sizes default/sm/lg/icon/icon-sm/icon-lg; `buttonVariants()` returns `{ box, text }` style objects; `asChild` clones the child with the button style + tap. hover -> pressed style. Icons inside are not recoloured automatically (web `[&_svg]` rules): pass `color` to the icon. |
| card.tsx | card.jsx | Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter. Card takes onPress/onClick. The header's CSS grid (`has-data-[slot=card-action]`) is a column; CardAction is pushed right with `marginLeft: auto`. |
| input.tsx | input.jsx | forwardRef. value always a string when given (same rule). `type` -> keyboardType / secureTextEntry / autoCapitalize. Accepts `onChangeText(text)` **or** the web's `onChange(e)` (`e.target.value`, `e.target.name`). Keyboard submit calls `onKeyDown/onKeyPress({ key: 'Enter' })`. Focus border neutral-900 (the 3px focus ring is not drawn). Exports helper `makeWebInputHandlers`. |
| textarea.tsx | textarea.jsx | Same as Input, multiline, min-h-20, `rows` sets the start height. |
| badge.tsx | badge.jsx | variants default/secondary/destructive/outline; `badgeVariants()`. |
| skeleton.tsx | skeleton.jsx | slate-200/80 (dark white/10), rounded 8, animate-pulse; size/radius/colour via `style`. |
| label.tsx | label.jsx | `htmlFor` ignored (no label->input focus on a phone). |
| checkbox.tsx | checkbox.jsx | checked / defaultChecked / onCheckedChange / disabled. The web root has no own styling; native extras: `checkedStyle` (web `data-[state=checked]:` classes), `iconColor`, `iconSize` (14). |
| switch.tsx | switch.jsx | h-6 w-11, #16a34a / gray-200 (dark gray-800), thumb slides 20px in 300ms. |
| avatar.tsx | avatar.jsx | Image shown once loaded, fallback until then / on error (Radix behaviour). |
| dialog.tsx | dialog.jsx | Dialog (open/onOpenChange/defaultOpen), DialogTrigger/DialogClose (`asChild`), DialogContent (`showCloseButton`, `onInteractOutside`, `onPointerDownOutside`, `onEscapeKeyDown` with `e.preventDefault()`), Header/Footer/Title/Description, Overlay, Portal, plus `useDialog`. Native Modal: bg-black/40, fade + zoom-95 200ms, w-[calc(100%-1.5rem)] max-w-lg, rounded-2xl, close button top-right. Android back = Escape. Header text centred (mobile value of `text-center sm:text-left`). Content scrolling (`max-h-[90vh] overflow-y-auto`) is the page's job (wrap content in a ScrollView). |
| dropdown-menu.tsx | dropdown-menu.jsx | All 15 exports. Menu opens under the trigger (align start/center/end, sideOffset 4, flips up near the bottom), closes on outside tap / back / item select (`onSelect(e)`, `e.preventDefault()` keeps it open). CheckboxItem / RadioGroup+RadioItem work. Sub menus open in place under their trigger (no room to the side on a phone). |
| select.tsx | select.jsx | Select (value/defaultValue/onValueChange/open/onOpenChange/disabled), SelectTrigger (size, `textStyle`, `iconColor`), SelectValue (placeholder), SelectContent (`scrollToTopOnOpen`, align), SelectItem, Label, Group, Separator, ScrollUp/Down buttons. Popper list under the trigger, >= trigger width, max-h-48, scrolls to the selected item unless `scrollToTopOnOpen`. Closed items still report their labels so SelectValue shows the selected label. |
| loading-skeletons.jsx | loading-skeletons.jsx | All 14 exports, phone-width sizes. Linear gradients via expo-linear-gradient, radial glows via react-native-svg. AppShellSkeleton uses the shell group's BootShellHeader/Body exactly like the web. Grids (`md:grid-cols-*`) are one column (phone). |
| horizontal-carousel.tsx | horizontal-carousel.jsx | horizontal ScrollView, gap-5 px-1 py-4, header + left/right buttons scroll by 400px. `containerClassName` -> `containerStyle`. The web's wheel/touch handlers (only there to keep page scroll working) are not needed natively. |
| dot-pattern.tsx | dot-pattern.jsx | react-native-svg Pattern. Dot colour = web's text colour -> `color` prop (default theme text colour); `opacity` prop for the web's `opacity-*` class. glow = pulsing dots. |
| (new) | ui/tokens.js | Shared helper of this folder: shadcn CSS-variable colours light/dark (global.css, oklch -> sRGB), the app's radius overrides, text-children helper. |

### User shell (`modules/Food/components/user/*`)
| Web | Native | Notes |
|---|---|---|
| UserLayout.jsx | UserLayout.jsx | Same providers (Profile, Cart, Orders, SearchOverlay, LocationSelector), `useSearchOverlay`, `useLocationSelector`, RouteSyncHandler, useUserNotifications (socket), useZone/useGeoLocation/useCartZoneGuard, initial-checking + zone-pending skeleton, OutOfZoneScreen gating (same path rules), "Fetching Location..." blocker (8s safety), login-required popup (`show-login-required` event), notification toast + out-of-zone toast (`toast.custom`), order-status -> bell inbox in localStorage, My Store -> build Home underneath, bottom nav only on exact main tabs, BackToTop on Home. Default export takes `children` = the Food Stack (web `<Outlet/>`): the Stack always stays mounted; kept-alive tabs / category page are layers above it shown with `display: none` toggles; skeleton / out-of-zone cover everything (web rendered them instead of `<main>`). Not reproduced: `window.scrollTo` on route change and browser-reload clean-ups (no page reload in the app). DesktopNavbar not rendered (desktop only). |
| MainTabKeepAlive.jsx | MainTabKeepAlive.jsx | Home(delivery), Home(takeaway), Dining, Under250, Profile (inside ProtectedRoute) mounted on first visit and kept mounted (display none). Scroll save/restore per tab (`main_tab_scroll_<tab>`, `food_browse_scroll_v1` Home restore) now runs against the tab's list registered in `browseScrollMemory` (food-browse util) — the tab pages must register their list there (see 4). `requestBottomNavShow(900)` kept. Chunk preloads dropped (one bundle). |
| (MainTabRoutePlaceholder in UserRouter) | `MainTabRoutePlaceholder` export of UserRouter.jsx | Route files of the main tabs render it. |
| CategoryBrowseKeepAlive.jsx | CategoryBrowseKeepAlive.jsx | Same; restore via `runCategoryScrollLock`. |
| UserRouter.jsx | UserRouter.jsx | Default export wraps the Stack in UserLayout (Suspense with RouteLoader). Exports `publicRoute(Page, {fallback})`, `protectedRoute(Page, {fallback})`, `AuthLoginRedirect`, `MainTabRoutePlaceholder`, `USER_ROUTES` (the web table). Prefetch of common routes dropped (no chunks). |
| routes.jsx (Food App) | routes.jsx | Default export `App({children})`: AuthInitializer, PushSoundEnableButton, FCM init/register per route (skips main-tab switches) and after `userLoginSuccess`, `authRefreshFailed` -> login, partner token watchers (2s interval), focus -> `authAPI.me`. Not carried over: restaurant/delivery/admin routers + restaurant new-order listener (partner panels are not in the user app), ScrollToTop. |
| BottomNavigation.jsx | BottomNavigation.jsx | Same 4 tabs, MaterialIcons `delivery-dining`, Ionicons `bag`/`pricetag`/`restaurant`, active pill springs between tabs (layoutId), GET /food/landing/settings/public price limit, hide on scroll down (80px) / show on scroll up (150px) / always at top, 900ms lock after route change. Scroll offset sampled (50ms) from `browseScrollMemory.getBrowseScrollY(path)`. bottom-6 + safe-area inset. |
| BackToTop.jsx | BackToTop.jsx | Same thresholds (500 / 2500 / 600px sustained scroll-up, 200ms pause reset), spring in/out, "zip 1000px in 250ms then snap" via `restoreBrowseScroll` on the Home list. Offset sampled from browseScrollMemory. |
| LocationPrompt.jsx | LocationPrompt.jsx | Same logic + `useLocationPromptPending` + texts; Modal; ping ring animation; spinner -> ActivityIndicator. Rendered once by the shell's AppShell (already there). |
| LoginRequiredModal.jsx | LoginRequiredModal.jsx | Same texts/colours/navigation. `font-serif` -> Android `serif` family (the 900 weight of the title is not applied by the Text wrapper for a non-bundled family). |
| OutOfZoneScreen.jsx | OutOfZoneScreen.jsx | Same (service="taxi" too). Text centred on 48% of the window, watermark at 71%. `mix-blend-overlay` on the watermark not reproducible (plain white/30). |
| PageNavbar.jsx | PageNavbar.jsx | The web's ~1000 lines of location-text logic copied unchanged; JSX converted (logo scale-[1.6] origin-left, location button, wallet/cart/profile). Not rendered by any web page today (Home imports it only). |
| Navbar.jsx | Navbar.jsx | Converted (not used by any user page). Its points value 99 is the web's own constant. |
| Footer.jsx | Footer.jsx | `hidden md:block` -> renders nothing; keeps the settings-logo effect. |
| DesktopNavbar.jsx | DesktopNavbar.jsx | Desktop only -> returns null (only UserLayout imports it on the web). |
| AnimatedPage.jsx | AnimatedPage.jsx | fade + translateY 8 -> 0 in 120ms. |
| ScrollReveal.jsx | ScrollReveal.jsx | Plain wrapper (as the live web code). |
| TextReveal.jsx | TextReveal.jsx | Shown once on screen (measureInWindow check after layout + every 250ms until seen). |

### Contexts / hooks / logic
| File | Change |
|---|---|
| context/CartContext.jsx | Copied; one template string rewritten (checker false positive). Logic unchanged. |
| context/ProfileContext.jsx | `new Image()` avatar preload -> `expo-image` `Image.prefetch`. |
| context/OrdersContext.jsx | Unchanged. |
| hooks/useLocation.jsx | Unchanged except `isBrowserPageReload()` -> false (no page reload in the app). |
| hooks/useZone.jsx | Unchanged. |
| hooks/useAppBackNavigation.js | react-router-dom -> @/lib/router. |
| hooks/useUserNotifications.js, useCartZoneGuard.js | sonner -> @/lib/toast. |
| hooks/useRestaurantNotifications.js | sonner -> @/lib/toast; Flutter ringtone bridge calls -> no-ops; `Object.keys(localStorage)` -> key(i) loop. (Restaurant-only, not used by the user app.) |
| hooks/useNotificationInbox.js, useMaintenanceMode.js, useDelayedLoading.js, useCompanyName.js | Unchanged (work with the webCompat shims). |
| utils/firebaseMessaging.js | `isFlutterWebView()` -> true (the app is the native shell); Flutter `getFcmToken`/permission handlers -> `getNativeFcmToken()` / `requestPushPermission()` from @/lib/push; same backend calls with platform "mobile" (POST /fcm-tokens/mobile/save, POST /fcm-tokens/pending-save). Foreground pushes: `Notifications.addNotificationReceivedListener` feeds the same handler the Flutter "native-push-notification" event fed (OS banner itself comes from expo-notifications). Service-worker URL helper (web-only file) removed; `new Audio` guarded. |
| utils/businessSettings.js | `updateFavicon` / `updateTitle` -> no-ops (no tab icon/title in an app). |
| utils/foodPageCache.js | `new window.Image()` -> `Image.prefetch`; `Object.keys(sessionStorage)` -> key(i) loop; no `pagehide` clearing (sessionStorage is empty on every launch; pagehide = app backgrounded here). |
| utils/auth.js | `Object.keys(localStorage)` -> key(i) loop. |
| firebase.js, utils/categoryCache.js, utils/mainTabRoutes.js, utils/bottomNavEvents.js | Unchanged (Realtime DB works in RN; web Messaging is not used). |

## 2. Routes (src/app/food/**)
Layout: `src/app/food/_layout.jsx` = `<FoodApp><UserRouter><Stack animation="none"/></UserRouter></FoodApp>` (web switches Food screens instantly).

Redirects: `/food` -> `/food/user`; `/food/<anything>` (legacy, web mounted the user routes under `/food/*` too) -> `/food/user/<same path + query>`; `/food/user/<unknown>` and `/food/restaurant|delivery|admin/*` -> `/food/user` (web drew an empty layout / partner panels that are not in the user app); `/food/user/food` -> `/food/user`; `/food/user/profile/terms` -> `/user/terms`, `/profile/privacy` -> `/user/privacy`, `/profile/support-info` -> `/user/support`; `/food/user/auth/login|sign-in|otp` -> AuthRedirect module="user" + Navigate `/login`.

Guest (public): main tabs `/food/user`, `/home`, `/takeaway`, `/dining`, `/under-250`, `/category/:category` (placeholders, drawn by MainTabKeepAlive); `/profile/refund|shipping|cancellation|support` (PageLoader fallback), `/help`, `/help/orders/:orderId`, `/auth/callback`, `/dining/:category`, `/dining/explore/upto50`, `/dining/explore/near-rated`, `/dining/coffee`, `/dining/:diningType/:slug`, `/categories`, `/restaurants`, `/restaurants/:slug`, `/search`, `/product/:id`, `/address-selector`, `/my-store`.

Logged-in user (ProtectedRoute requiredRole="user" loginPath="/login"): `/profile` (tab; guarded by the ProtectedRoute around the kept-alive Profile pane), `/dining/book/:slug`, `/dining/book-confirmation`, `/dining/book-success`, `/dining/modification-policy`, `/dining/cancellation-policy`, `/dining/edit-user`, `/bookings`, `/cart`, `/cart/checkout`, `/cart/select-address`, `/orders`, `/orders/:orderId`, `/orders/:orderId/invoice`, `/orders/:orderId/details`, `/offers`, `/gourmet`, `/collections`, `/collections/:id`, `/profile/edit`, `/profile/payments`, `/profile/payments/new`, `/profile/payments/:id/edit`, `/profile/favorites`, `/profile/coupons`, `/profile/about`, `/profile/delivery-safety`, `/profile/report-safety-emergency`, `/profile/accessibility`, `/profile/logout`, `/profile/refer-earn`, `/profile/dining-bookings`, `/profile/settings` (Loader fallback), `/notifications`, `/wallet`, `/complaints/submit/:orderId`. (All paths under /food/user.)

API calls made by the shell itself (from the web code): GET /food/zones/detect (useZone), authAPI.getCurrentUser (current user) + userAPI address CRUD (ProfileContext), GET/POST/PATCH/PUT/DELETE /food/cart... (CartContext), GET /food/landing/settings/public (BottomNavigation), business settings (businessSettings.js), POST /fcm-tokens/mobile/save (userAPI.saveFcmToken platform mobile), authAPI.me('restaurant'|'delivery') on focus only when a partner token exists, Socket.IO user notifications (useUserNotifications). Page API calls belong to the page groups.

## 3. Web-only APIs replaced
DOM/divs -> View/Text; Radix Dialog/DropdownMenu/Select/Checkbox/Switch/Avatar -> own native components; framer-motion -> Animated (spring/timing with the web's parameters); CSS keyframes (pulse, ping, spin) -> Animated loops; backdrop-blur -> expo-blur; gradients -> expo-linear-gradient / react-native-svg; react-icons -> @expo/vector-icons; lucide-react -> lucide-react-native; `window.scrollY` / `window.scrollTo` -> browseScrollMemory registry (lists registered by the pages); `document.body.style.overflow` -> not needed (Modal); `new Image()` -> expo-image prefetch; Flutter FCM bridge -> @/lib/push; sonner -> @/lib/toast; favicon/title -> no-op; `performance` navigation type -> no reload.

## 4. Cross-group imports missing when I finished
Pages (owned by food-orders / food-profile / food-browse / food-cart / food-restaurant groups): `@food/pages/user/` auth/AuthCallback, dining/MyBookings, dining/TableBooking, dining/TableBookingConfirmation, dining/TableBookingSuccess, dining/TableCancellationPolicy, dining/TableEditUserPage, dining/TableModificationPolicy, dining/DiningRestaurantDetails, help/Help, help/OrderHelp, Notifications, Wallet, complaints/SubmitComplaint, orders/Orders, orders/OrderTracking, orders/OrderInvoice, orders/UserOrderDetails, profile/About, Accessibility, Cancellation, Coupons, DeliverySafety, EditProfile, Favorites, Logout, Payments, AddPayment, EditPayment, ReferEarn, Refund, ReportSafetyEmergency, Settings, Shipping, Support, profile/Profile (used by MainTabKeepAlive).

Contract for page groups: Home / Dining / Under250 / Profile / CategoryPage should register their scrolling list with `registerBrowseScroller(path, …)` and call `reportBrowseScroll(path, y)` from onScroll (food-browse's browseScrollMemory) — the bottom-nav hide/show, Back to top and tab scroll restore read the offset from there. Without it those features simply stay idle (nav always visible, no Back-to-top).

## 5. Status
Every component, hook and route above: **Built, not tested**.

## 6. Problems / blocked
- Foundation `src/theme/index.js` `radius`: md 6 / lg 8 / xl 12 are Tailwind defaults, but global.css overrides them (`--radius: 0.625rem`): rounded-sm 6, rounded-md 8, rounded-lg 10, rounded-xl 14. Groups using `radius.md/lg/xl` get 2px smaller corners. My files use the correct values (ui/tokens.js `uiRadius`).
- Foundation `brand` shadcn colours are approximate (e.g. foreground #2e1f12 vs oklch(0.2 0.05 50) = #270e01, primary #d9a21b vs #c99500); ui/tokens.js has the converted values + dark set.
- Foundation storage shim: `Object.keys(localStorage/sessionStorage)` returns the shim's method names, not stored keys (web code that enumerates keys silently does nothing). Fixed in my files; other files using it: none found in Food, but shared code should use `key(i)`.
- webCompat dispatches `pagehide` when the app goes to the background; web code that clears caches on `pagehide` will do it on every backgrounding.
- `modules/Food/utils/utils.ts` (cn, tailwind-merge) is still a web file in the tree (not owned by me); nothing of mine imports it.
- No package installs needed.
