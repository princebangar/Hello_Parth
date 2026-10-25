# food-orders — conversion report

All 18 files of the group are converted. `node scripts/check-converted.cjs` on every one: 0 problems.

## 1. Files converted (web → native, same path under `mobile-user/src/…`)

| Web (`Frontend/src/…`) | Not reproduced exactly |
|---|---|
| modules/Food/components/user/CMSPage.jsx | `prose` HTML → `react-native-render-html` with tagsStyles copied from the prose overrides (p/li 16px medium, headings/strong black, links #CB202D / #DC2626 dark). mailto:/tel:/content links → `Linking.openURL`. Sticky blurred header → a fixed header above the ScrollView (80% white/#0a0a0a, no blur). `window.history.length > 2` → `router.canGoBack()`. Default `fallbackPath` is `/food/user` (the web default `/user` only redirected there). |
| modules/Food/components/user/AddMoneyModal.jsx | Razorpay through `@food/utils/razorpay` (`initRazorpayPayment`), as the web. `animate-spin` Loader2 → `Spin`. |
| modules/Food/pages/user/Wallet.jsx | Gradient wallet icon → `expo-linear-gradient`; backdrop-blur inner tile → translucent white only. Transaction list → FlatList with the header block as ListHeaderComponent. |
| modules/Food/pages/user/Notifications.jsx | Stored items keep the web's Tailwind colour classes (`iconColor: "text-[#991B1B]"`, `"text-blue-600"`); they are turned into colours at render time. |
| modules/Food/pages/user/complaints/SubmitComplaint.jsx | `<select>` → a field that opens the options in a `Dialog` (what a WebView shows for a select). `focus:ring-2` → 2px red border while focused. `fixed` submit bar → absolute bottom bar. |
| modules/Food/pages/user/help/Help.jsx | Static content kept 1:1 (see §6 — the web's own placeholder contact rows). `alert()` → `Alert.alert`. |
| modules/Food/pages/user/help/OrderHelp.jsx | `document.getElementById("contact-support").scrollIntoView` → scroll to the section's measured y. `alert()` → `Alert.alert`. |
| modules/Food/pages/user/orders/Orders.jsx | FlatList. Phone-width (<640px) branches used: item photos, "each" price, subtotal/delivery/tax/coupon rows hidden. Three-dots menu = absolute dropdown in the card. Share: `navigator.share` (webCompat → RN Share) first, the web's share modal (WhatsApp/Telegram/Email/SMS/Facebook/X/LinkedIn/Copy) via `Linking` when it is not available. textarea copy fallback removed (clipboard shim only). |
| modules/Food/pages/user/orders/UserOrderDetails.jsx | jsPDF + autoTable summary → same fields/table laid out as HTML and turned into a PDF with `printHtml` (share sheet; file `Order_Summary_<id>_<ts>.pdf`). Wavy savings edge → `react-native-svg`. `window.location.href = tel:` → `Linking`. |
| modules/Food/pages/user/orders/OrderInvoice.jsx | Web printed the card's innerHTML in a new window with print CSS. Native: same markup + the web's print CSS built as HTML; **Print** → system print dialog (`printHtml(..., { share: false })`), **PDF** → PDF file in the share sheet (the web's PDF button also only opened print). Table at phone width: Item + Total columns with "Qty: n × ₹price" (Quantity / Unit Price columns are `hidden sm/md` on the web). |
| modules/Food/pages/user/dining/DiningRestaurantDetails.jsx | Sticky Menu/Photos/About tabs → `stickyHeaderIndices`; tab tap → scroll to measured section. Radial-gradient placeholder → linear gradient with the same stops. Guest picker → `Sheet`. `document.body.style.overflow` lock dropped (modal blocks the page). The web calls an undefined `debugError` when the bookings fetch fails (that threw into the outer catch → "Failed to load restaurant"); here it is a no-op, so the page still shows. |
| modules/Food/pages/user/dining/MyBookings.jsx | Review modal → `Dialog`. Empty-state "Book a table" links to `/dining` on the web, which is not a route (catch-all sends it to `/`) → navigates to `/`. |
| modules/Food/pages/user/dining/TableBooking.jsx | Same slot/seat logic. `fixed` bottom CTA → absolute bar with the bottom inset. |
| modules/Food/pages/user/dining/TableBookingConfirmation.jsx | Special-request modal → `Dialog`; the policy and edit-user sheets (never opened on the web) are kept as `Sheet`s. |
| modules/Food/pages/user/dining/TableBookingSuccess.jsx | canvas-confetti (2 bursts every 250 ms for 3 s) → two `<Confetti>` (left/right) re-fired every 500 ms for 3 s with the shrinking count. `if (!booking) navigate()` during render → `<Navigate>`. |
| modules/Food/pages/user/dining/TableCancellationPolicy.jsx | Light only (as the web). `animate-bounce` → Animated loop. |
| modules/Food/pages/user/dining/TableModificationPolicy.jsx | Light only. `animate-pulse` → Animated loop. Also exports `policyStyles` (shared with TableCancellationPolicy). |
| modules/Food/pages/user/dining/TableEditUserPage.jsx | — |

Global: `hover:` dropped; `active:scale-*` → Pressable pressed transform; links to `/user/...` (web relied on the `/user/* → /food/user/*` redirect) point straight at `/food/user/...`.
Radii use the web's global.css @theme values (rounded-lg 10, rounded-xl 14), not `@/theme` `radius` (see §7).

## 2. Screens, guards, API calls (route files are owned by the shell group)

| Route | Guard (web UserRouter) | API calls (from the web code) |
|---|---|---|
| `/food/user/orders` | logged-in user | GET orders (`orderAPI.getOrders {limit:100,page}` all pages, poll 20 s while visible); PATCH/POST ratings (`orderAPI.submitOrderRatings`) |
| `/food/user/orders/:orderId/details` | logged-in user | GET order details (`orderAPI.getOrderDetails`), GET restaurant (`restaurantAPI.getRestaurantById`) when not populated; business settings (company name for PDF) |
| `/food/user/orders/:orderId/invoice` | logged-in user | OrdersContext, else GET order details |
| `/food/user/help` | guest | none |
| `/food/user/help/orders/:orderId` | guest | none (OrdersContext) |
| `/food/user/complaints/submit/:orderId` | logged-in user | GET order details; POST complaint (`orderAPI.submitComplaint`) |
| `/food/user/notifications` | logged-in user | notification inbox via `useNotificationInbox("user",{limit:100})` (GET `/food/notifications/inbox`, mark read / dismiss) |
| `/food/user/wallet` | logged-in user | GET wallet (`userAPI.getWallet`); AddMoneyModal: POST top-up order (`userAPI.createWalletTopupOrder`), GET profile (prefill), Razorpay checkout, POST `/food/user/wallet/topup/verify` |
| `/food/user/dining/:diningType/:slug` | guest (booking needs login → `show-login-required` event) | GET dining restaurant by slug, GET restaurant by id/slug, GET dining restaurants `{limit:100}` (fallback), GET restaurant bookings `/food/dining/bookings/by-restaurant/:id` (logged in), GET outlet timings, GET menu |
| `/food/user/dining/book/:slug` | logged-in user | GET dining restaurant by slug (when no route state), GET restaurant bookings, GET outlet timings |
| `/food/user/dining/book-confirmation` | logged-in user | GET current user (`authAPI.getCurrentUser`), POST `/food/dining/bookings` |
| `/food/user/dining/book-success` | logged-in user | GET `/food/dining/bookings` (poll 10 s until final, refetch on visibility) + `diningBookingStatusUpdate` window event |
| `/food/user/dining/modification-policy`, `/cancellation-policy`, `/edit-user` | logged-in user | none |
| `/food/user/bookings`, `/food/user/profile/dining-bookings` | logged-in user | GET `/food/dining/bookings` (poll 15 s), POST `/food/dining/bookings/:id/review` |
| CMSPage (used by the policy/support pages of other groups) | as the caller | policy page fetch (`fetchPolicyPage(endpoint)`), business settings |

## 3. Web-only APIs replaced

`react-router-dom` → `@/lib/router`; `sonner` → `@/lib/toast`; `lucide-react` → `lucide-react-native`; `<img>` → `AppImage`; framer-motion entrances → `Animated` (spring/timing); `dangerouslySetInnerHTML` → `RenderHTML`; jsPDF/autoTable and `window.open + print()` → `printHtml` (`@/lib/media`); `tel:`/`mailto:`/share URLs/`window.open` → `Linking.openURL`; `alert()` → `Alert.alert`; `scrollIntoView` → `ScrollView.scrollTo` with onLayout offsets; `position: sticky/fixed` → stickyHeaderIndices / absolute bars; `document.body.style.overflow` → removed (Modal); `document.createElement('textarea')` copy fallback → removed; inline `<svg>` → `react-native-svg`; canvas-confetti → `Confetti`; `<select>` → Dialog list; `window.history.length` → `router.canGoBack()`.

## 4. Imports of other groups' files missing when I finished

None. Everything I import exists (food-shell UI kit: button, card, badge, dialog, input, loading-skeletons, tokens; AnimatedPage, ScrollReveal, Loader, PolicyPageLoader, OrdersContext, CartContext, ProfileContext, hooks, utils).

## 5. Status

Every screen above: **Built, not tested** (the app was not run).

## 6. Web content kept as is that Prince may want changed (not changed — the web is the spec)

- Help.jsx / OrderHelp.jsx: hard-coded contact "+1 (800) 123-4567", "support@helloparth.com", `$` prices in the FAQ/summary, and "Live chat would open here" / "Refund request would be processed here" alerts.
- TableBookingConfirmation.jsx: contact fallback `"Shailu"` / `"8090512291"` when the user has no name/phone; it also ignores the user returned by TableEditUserPage (refetches the current user) — web behaviour.
- TableBookingSuccess.jsx: restaurant name fallback "The Great Indian Restaurant".
- DiningRestaurantDetails.jsx: when the menu has no sections it shows fixed cards "Food · 16 pages" / "Beverages · 10 pages".
- Orders.jsx / UserOrderDetails.jsx: Unsplash fallback photos for restaurants without an image.

## 7. Foundation problems hit

- `@/theme` `radius` uses Tailwind defaults (lg 8, xl 12) but the web's global.css overrides them (rounded-sm 6, md 8, lg 10, xl 14; `uiRadius` in ui/tokens.js has them). I used the global.css values as numbers.
- `window.history.length` from webCompat is always 1, so web code like `history.length > 2 ? back : fallback` always takes the fallback; I used `router.canGoBack()` instead.
- `navigator.share` (webCompat) always exists and resolves on Android, so Orders' own share modal will practically never open (same branch as a browser with Web Share).
- The checker flags HTML tag names inside template strings (print/PDF HTML); I build that HTML with a small `h(tag, attrs, ...children)` helper so it passes.

## 8. Blocked

Nothing blocked.
