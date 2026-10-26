# Group: account — conversion report

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-driver/src/…`) | By |
|---|---|---|
| `modules/Taxi/modules/driver/pages/DriverWallet.jsx` | same path | this agent |
| `modules/Taxi/modules/driver/pages/RideRequests.jsx` | same path | this agent |
| `modules/Taxi/modules/driver/pages/DriverProfile.jsx` | same path | this agent |
| `.../driver/pages/DriverIncentives.jsx` | same path | earlier agent |
| `.../driver/pages/DriverBankDetailsPage.jsx` | same path | earlier agent |
| `.../driver/pages/settings/EditProfile.jsx`, `Notifications.jsx`, `Referral.jsx`, `DeleteAccount.jsx`, `DriverSettings.jsx`, `SecuritySOS.jsx`, `Support.jsx`, `HelpSupportOptions.jsx`, `SupportChat.jsx` | same paths | earlier agent |

All keep the web default export. Texts, rules, API calls and navigation targets are the same as the web.

### DriverWallet (kept-alive tab `/taxi/driver/wallet`)
- `useDriverTabActive()`: the wallet loads again (quiet, cached data stays) each time the tab becomes active. The `driver:wallet:updated` socket listener only runs while the tab is active. The StatusBar is only drawn while active.
- Pull-to-refresh calls the same `loadWallet()` as the header refresh button (header spinner + RefreshControl).
- **Razorpay:** inside a phone WebView the web used `callback_url` + `redirect: true` (`isMobileOrWebView()`), because UPI intents could not open from Razorpay's popup there. The app's `@/lib/razorpay` checkout opens UPI apps itself and only reports back through `handler`; a redirect would leave its WebView on the backend callback page. So both buttons ("Add money", "Add money test") use the web's browser handler flow: same order call, same options (key, amount, currency, name, 'Wallet Topup', order_id, prefill, theme #E85D04), same verify call and texts. This is the same decision the user app made (mobile-user Wallet.jsx).
- PhonePe / `checkoutUrl` orders: `openExternalCheckout` (already native: opens it with Linking) + `rememberPendingPhonePeRedirect`, as on the web.
- `bg-slate-900` buttons (Withdraw, Send request, active filter chip) use the partner blue #2563EB with white text. The web's `.driver-theme` CSS forces this with `!important`, so the disabled Withdraw button is blue too (same as the web).
- The two sheets (`data-driver-overlay`) are `Sheet`s (they cover the bottom bar). There is no backdrop blur. "Add payout details" closes the sheet before it navigates to `/taxi/driver/profile/bank-details`; the native stack keeps the page mounted, so an open Modal would cover the next page.
- The 1.4 s / 1.8 s success timers are cleared on unmount.

### RideRequests (kept-alive tab `/taxi/driver/history`; ordinary page on `/taxi/owner/history`)
- The history loads again each time the tab becomes active (an ordinary page loads once). The old list stays on screen. Pull-to-refresh reloads it.
- The error card's Retry did `window.location.reload()` on the web. Here it shows the loading card and loads the history again.
- The sticky header is a fixed bar above the ScrollView. `bg-slate-900` buttons (filter options, "Showing:" chip, Retry) use the partner blue. Cards keep the web's fade-in.

### DriverProfile (kept-alive tab `/taxi/driver/profile` and `/taxi/owner/profile`)
- The driver (`getCurrentDriver`) loads again each time the tab becomes active (cached `me` stays). Pull-to-refresh reloads it. StatusBar `light` only while active (blue hero, status-bar inset inside the hero).
- **Logout is exactly the web's:** `clearDriverAuthState()` (the same shared function: registration session, `driver_is_online_cache`, `driver_verified_session`, and the driver-owned `token`/`role`/`chatRole` keys), then `navigate('<prefix>/login', { replace: true })`. There is no API call, same as the web.
- The hero gradient (110deg) uses LinearGradient, and the swoosh/wave SVGs use react-native-svg with `preserveAspectRatio="none"`. The Avatar falls back to the bundled `profile_avatar.webp`.
- The legal sheet is a `Sheet` with a transparent body holding the white rounded card. "Understood" (`bg-slate-950`) uses the partner blue. `UserLogoutConfirmDialog` gets the blue accent (#2563EB; the dialog takes one colour, so the web's #1d4ed8→#3b82f6 gradient becomes its middle colour).
- The route-booking toggle code is kept, but no menu item uses it (same as the web).

## 2. Routes / guards / API
All are behind `DriverLayout` (signed-in driver / owner).
- `/taxi/driver/wallet`: GET `/drivers/wallet`, GET `/drivers/me`, POST `/drivers/wallet/top-up/razorpay/order`, POST `/drivers/wallet/top-up/razorpay/verify`, POST `/drivers/wallet/top-up/phonepe/order`, POST `/drivers/wallet/withdrawals`; socket `driver:wallet:updated`. With no token it replaces to `/taxi/driver/login`.
- `/taxi/driver/history`, `/taxi/owner/history`: `getDriverRideHistory({ limit: 100 })`, owner also `getOwnerBusBookings()`.
- `/taxi/driver/profile`, `/taxi/owner/profile`: `getCurrentDriver()`, `updateDriverProfile({ routeBooking })` (toggle).

## 3. Web-only APIs replaced
- `window.Razorpay` / script injection → `Razorpay` + `loadRazorpayScript` from `@/lib/razorpay`.
- framer-motion → Animated (fade/slide-in rows, cards).
- `<input type=number>` → `TextInput keyboardType="numeric"`.
- `window.requestAnimationFrame` → the RN global `requestAnimationFrame`.
- `window.location.reload()` → reload the data.

## 4. Missing imports of other groups
None.

## 5. Status
DriverWallet, RideRequests, DriverProfile: `Built, not tested`. The earlier agent's files keep their own status.
`check-converted`: 0 problems. eslint: 0 errors / 0 warnings.

## 6. Blocked
Nothing.
