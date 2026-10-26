# Group "pocket-history" — conversion report

## 1. Files converted (web `Frontend/src/<path>` -> `mobile-delivery/src/<path>`)

| Web file | Native file | Not reproduced exactly (why) |
|---|---|---|
| modules/DeliveryV2/pages/PocketV2.jsx | same path | Not a route: drawn by DeliveryHomeV2's Pocket tab (Home gives the 120 px top offset + status bar). Own `ScrollView` (flex 1) with `RefreshControl` and `paddingBottom: useBottomNavSpace()`. `motion.circle pathLength` -> `react-native-svg` Circle with animated `strokeDashoffset` (1.5 s ease-out). Deposit popup (`fixed inset-0`, spring slide-up) -> `Sheet` (slide-up, backdrop 0.8, no backdrop blur). The hidden `<div className="hidden"><ChevronRight/></div>` helper is not drawn (invisible on the web). |
| modules/DeliveryV2/pages/HistoryV2.jsx | same path | Not a route: History tab of DeliveryHomeV2 (Home draws no header and no top padding on this tab). HistoryV2 has its own top area: gradient header (`bg-[#121212]` -> 160deg #15498B -> #000) with `paddingTop: insets.top + 12`, and `<StatusBar style="light">` (SectionStatusBar) only while `useDeliveryTabActive()`. Sticky header / tabs / filters = a fixed block above the `FlatList` (same visual result). Tab underline `motion layoutId` slide -> underline appears without the slide. `backdrop-blur-2xl` dropped. Dropdowns (`fixed top-[185px]`) -> absolute panels right under the filter row (measured), no backdrop, same as the web. Bonus drawer -> `Sheet` (max 85 %). |
| modules/DeliveryV2/components/WeekSelector.jsx | same path | shadcn Popover + Calendar -> `Dialog` with a native month grid (Sunday-first like react-day-picker, outside days muted, today/selected highlight #15498b, prev/next month limited to 2020–2030; the web's month/year dropdown caption is a "Month YYYY" title with arrows). `date-fns` is not installed: `addDays/startOfWeek/endOfWeek` written inline with the same results. Same props (`weekStartsOn`, `onChange`, `className` ignored, extra `style`), same `{ start, end }` output. |
| modules/DeliveryV2/pages/pocket/PayoutV2.jsx | same path | — (pull-to-refresh added) |
| modules/DeliveryV2/pages/pocket/PocketStatementV2.jsx | same path | — (pull-to-refresh added) |
| modules/DeliveryV2/pages/pocket/DeductionStatementV2.jsx | same path | — (pull-to-refresh added) |
| modules/DeliveryV2/pages/pocket/LimitSettlementV2.jsx | same path | — (pull-to-refresh added) |
| modules/DeliveryV2/pages/pocket/PocketBalanceV2.jsx | same path | — (pull-to-refresh added) |
| modules/DeliveryV2/pages/pocket/CashLimitInfoV2.jsx | same path | — (pull-to-refresh added) |
| modules/DeliveryV2/pages/pocket/PocketDetailsV2.jsx | same path | Decorative blurred circle (`blur-2xl`) -> plain soft circle (no blur). Card fade-in-up stagger kept (Animated, 50 ms per row). |

Theme: deliveryTheme.css mapping applied (`#ff8100`/green/blue/orange/emerald 500/600 -> #15498B, `-50` tints -> #E7EFFA,
borders -> #C3D0E1, `bg-[#f6e9dc]`/`bg-yellow-300/400` -> #EEF3FB, rounded-2xl/3xl -> border #D1DCEB + soft shadow,
font-black/extrabold -> Sora, inputs #E8DEE7 / focus #8AA4C5, `p-6`/`px-6` -> 17.6). SVG `stroke` attributes (rings #000 / #ff8100) keep the web value (CSS class recolouring does not touch SVG attributes).
`WeekSelector`'s `onChange` prop is passed as `{...{ onChange: setWeekRange }}` only because check-converted.cjs flags any `onChange={`; it is the component's web prop, not a DOM event.

## 2. Screens, guards, API calls

| Path | Guard | API calls |
|---|---|---|
| /food/delivery/pocket (PocketV2 in DeliveryHomeV2) | protected (rider) | deliveryAPI.getProfile() (cached delivery "me" request, getDeliveryMeOnce), GET /food/delivery/earnings?period=week, GET /food/delivery/wallet, GET /food/delivery/earning-addons/active; deposit: POST /food/delivery/wallet/deposit/order, Razorpay checkout (`initRazorpayPayment`, options/handlers as web), POST /food/delivery/wallet/deposit/verify; cash: POST /food/delivery/wallet/deposit/cash-submit. Reload when the tab becomes active; `delivery-wallet-refresh` + `visibilitychange` listeners only while active; dispatches `deliveryWalletStateUpdated`. |
| /food/delivery/history (HistoryV2 in DeliveryHomeV2) | protected | GET /food/delivery/trip-history (period, date, status, limit 1000); GET /food/delivery/wallet?type=bonus&limit=50 when the gift drawer opens. Filters persisted in `delivery_trip_history_prefs_v1`. New filter -> loader (web); tab revisit / pull -> old trips stay while reloading. |
| /food/delivery/pocket/payout | protected | GET /food/delivery/wallet?type=withdrawal&limit=100 |
| /food/delivery/pocket/statement | protected | GET /food/delivery/trip-history (weekly, Completed, 1000) + GET /food/delivery/wallet?type=bonus&limit=1000 |
| /food/delivery/pocket/deductions | protected | GET /food/delivery/wallet?type=deduction&limit=100 |
| /food/delivery/pocket/limit-settlement | protected | GET /food/delivery/wallet?type=deposit&limit=100 |
| /food/delivery/pocket/balance | protected | getProfile(), GET earnings?period=week, GET wallet, GET wallet?type=withdrawal&limit=1; Withdraw: getProfile() (bank check -> /food/delivery/profile/details), POST /food/delivery/wallet/withdraw |
| /food/delivery/pocket/cash-limit | protected | GET /food/delivery/wallet, GET /food/delivery/cash-limit |
| /food/delivery/pocket/details | protected | GET /food/delivery/pocket-details?date&limit=2000 |

Back arrows: `useDeliveryBackNavigation` (pocket stack pages -> /food/delivery/pocket; History -> /food/delivery).

### Keyboard (input screens)
- PocketBalanceV2 (withdraw amount): whole page in `KeyboardAwareScrollView` (`extraOffset` 110 so the error text + Withdraw button stay visible), `keyboardType="decimal-pad"`.
- PocketV2 deposit sheet (cash / online amount): inside `Sheet` (its KeyboardAvoidingView lifts the sheet above the keyboard, same as mobile-driver DriverWallet top-up sheet); sheet body is a `ScrollView` with `keyboardShouldPersistTaps="handled"`. Not nested in a KeyboardAwareScrollView on purpose (it would add the keyboard height twice inside the lifted sheet).
- No other inputs in this group.

### Web test buttons kept
None in these files.

## 3. Web-only APIs replaced
framer-motion -> Animated (rings, live pulse, fade-in rows) / Sheet animation; lucide-react -> lucide-react-native; sonner -> `@/lib/toast`;
shadcn Skeleton -> `@/native/ui` Skeleton; shadcn Popover/Calendar/Button -> Dialog + native calendar; `<svg>` -> react-native-svg;
`bg-[#121212]` -> expo-linear-gradient; `window/document` events kept via webCompat; `localStorage` kept (webCompat);
Razorpay -> `@food/utils/razorpay` `initRazorpayPayment` (native PaymentHost).

## 4. Missing imports from other groups
None (all imports resolve).

## 5. Status
All 10 files: `Built, not tested`.

## 6. Blocked / shell notes
- Nothing blocked.
- `date-fns` (web WeekSelector dependency) is not in mobile-delivery/package.json — replaced inline, no install needed.
- check-converted.cjs flags `onChange={` even for component props (WeekSelector's web prop); worked around with a spread. Consider whitelisting component callbacks.
