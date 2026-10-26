# Conversion checklist — Hello Parth Delivery Partner (mobile-delivery)

Status per screen: **Built, not tested** = converted, all static checks pass, not yet opened on a phone.
Nothing is "Verified" until checked on a real device (see REPORT.md "phone pe check karna").
Blocked: none.

## Static checks (26 Oct 2026)
| Check | Result |
|---|---|
| Route coverage (`node scripts/check-routes.cjs`) | 35 / 35 web routes have a route file, missing 0 |
| Web files of `modules/DeliveryV2/**` | 72: converted or explained as not needed (dead code / replaced), not converted 0 |
| Dead links (`node scripts/check-links.cjs`) | 65 in-app paths checked, unmatched 0 |
| Crash patterns (`node scripts/check-converted.cjs src`) | 194 files, 0 problems (no absoluteFillObject, no web-only APIs, imports resolve) |
| Raw text in View (`node scripts/check-raw-text.cjs`) | 115 files, 0 problems (also horizontal scrollers flexGrow 0) |
| `npx eslint src` | 0 errors (warnings only: unused catch variables kept from the web) |

## Routes (all: Built, not tested)
| Web path | Web element | App route file |
|---|---|---|
| `/food/delivery/login` | SignIn | `src/app/food/delivery/login.jsx` |
| `/food/delivery/otp` | SignIn | `src/app/food/delivery/otp.jsx` |
| `/food/delivery/signup` | Navigate | `src/app/food/delivery/signup/index.jsx` |
| `/food/delivery/signup/details` | SignupStep1 | `src/app/food/delivery/signup/details.jsx` |
| `/food/delivery/signup/documents` | SignupStep2 | `src/app/food/delivery/signup/documents.jsx` |
| `/food/delivery/pending-verification` | VerificationPending | `src/app/food/delivery/pending-verification.jsx` |
| `/food/delivery/terms` | TermsAndConditionsV2 | `src/app/food/delivery/terms.jsx` |
| `/food/delivery/privacy` | PrivacyPolicyV2 | `src/app/food/delivery/privacy.jsx` |
| `/food/delivery/profile/terms` | TermsAndConditionsV2 | `src/app/food/delivery/profile/terms.jsx` |
| `/food/delivery/profile/privacy` | PrivacyPolicyV2 | `src/app/food/delivery/profile/privacy.jsx` |
| `/food/delivery/help/content` | DeliveryCMSHelpSupportPage | `src/app/food/delivery/help/content.jsx` |
| `/food/delivery` | DeliveryHomeV2 | `src/app/food/delivery/index.jsx` |
| `/food/delivery/feed` | DeliveryHomeV2 | `src/app/food/delivery/feed.jsx` |
| `/food/delivery/orders` | OrdersV2 | `src/app/food/delivery/orders.jsx` |
| `/food/delivery/pocket` | DeliveryHomeV2 | `src/app/food/delivery/pocket/index.jsx` |
| `/food/delivery/history` | DeliveryHomeV2 | `src/app/food/delivery/history.jsx` |
| `/food/delivery/profile` | DeliveryHomeV2 | `src/app/food/delivery/profile/index.jsx` |
| `/food/delivery/notifications` | NotificationsV2 | `src/app/food/delivery/notifications.jsx` |
| `/food/delivery/profile/details` | ProfileDetailsV2 | `src/app/food/delivery/profile/details.jsx` |
| `/food/delivery/profile/reviews` | MyReviewsV2 | `src/app/food/delivery/profile/reviews.jsx` |
| `/food/delivery/profile/bank` | ProfileBankV2 | `src/app/food/delivery/profile/bank.jsx` |
| `/food/delivery/profile/documents` | ProfileDocsV2 | `src/app/food/delivery/profile/documents.jsx` |
| `/food/delivery/help/tickets` | SupportTicketsV2 | `src/app/food/delivery/help/tickets/index.jsx` |
| `/food/delivery/help/tickets/create` | CreateSupportTicketV2 | `src/app/food/delivery/help/tickets/create.jsx` |
| `/food/delivery/help/tickets/:ticketId` | ViewSupportTicketV2 | `src/app/food/delivery/help/tickets/[ticketId].jsx` |
| `/food/delivery/help/id-card` | ShowIdCardV2 | `src/app/food/delivery/help/id-card.jsx` |
| `/food/delivery/pocket/payout` | PayoutV2 | `src/app/food/delivery/pocket/payout.jsx` |
| `/food/delivery/pocket/statement` | PocketStatementV2 | `src/app/food/delivery/pocket/statement.jsx` |
| `/food/delivery/pocket/deductions` | DeductionStatementV2 | `src/app/food/delivery/pocket/deductions.jsx` |
| `/food/delivery/pocket/limit-settlement` | LimitSettlementV2 | `src/app/food/delivery/pocket/limit-settlement.jsx` |
| `/food/delivery/pocket/balance` | PocketBalanceV2 | `src/app/food/delivery/pocket/balance.jsx` |
| `/food/delivery/pocket/cash-limit` | CashLimitInfoV2 | `src/app/food/delivery/pocket/cash-limit.jsx` |
| `/food/delivery/pocket/details` | PocketDetailsV2 | `src/app/food/delivery/pocket/details.jsx` |
| `/food/delivery/earnings` | Navigate | `src/app/food/delivery/earnings.jsx` |
| `/food/delivery/*` | Navigate | `src/app/food/delivery/[...rest].jsx` |

| Web file (modules/DeliveryV2/**) | In the app |
|---|---|
| `components/AvailableCashLimit.jsx` | not needed: dead code on the web (not imported) |
| `components/BottomNavigation.jsx` | not needed: dead code on the web (not imported) |
| `components/BottomPopup.example.jsx` | not needed: example file, not imported |
| `components/BottomPopup.jsx` | yes (same path) |
| `components/DeliveryBottomNav.jsx` | yes (same path) |
| `components/DeliveryLayout.jsx` | not needed: dead code (old router) |
| `components/DeliveryRealtimeShell.jsx` | yes (same path) |
| `components/DeliveryRouter.jsx` | not needed: dead code (old router, not mounted) |
| `components/DepositPopup.jsx` | not needed: dead code on the web (not imported) |
| `components/FeedNavbar.jsx` | not needed: dead code on the web (not imported) |
| `components/GoogleMapsTracking.jsx` | not needed: dead code on the web (not imported) |
| `components/map/LiveMap.jsx` | yes (same path) |
| `components/map/map.icons.js` | yes (same path) |
| `components/map/RiderMarker.jsx` | not needed: dead code on the web (not imported) |
| `components/modals/DeliveryVerificationModal.jsx` | yes (same path) |
| `components/modals/NewOrderModal.jsx` | yes (same path) |
| `components/modals/OrderSummaryModal.jsx` | yes (same path) |
| `components/modals/PickupActionModal.jsx` | yes (same path) |
| `components/orders/AcceptedOrderCard.jsx` | yes (same path) |
| `components/orders/NewOrderCard.jsx` | yes (same path) |
| `components/orders/OrderSwitcher.jsx` | yes (same path) |
| `components/ProtectedRoute.jsx` | yes (same path) |
| `components/ui/ActionSlider.jsx` | yes (same path) |
| `components/ui/GlassCard.jsx` | not needed: dead code on the web (not imported) |
| `components/ui/PremiumButton.jsx` | not needed: dead code on the web (not imported) |
| `components/WeekSelector.jsx` | yes (same path) |
| `DeliveryV2Router.jsx` | not needed: route table -> src/app/food/delivery/** + routes.jsx |
| `hooks/proximity.utils.js` | yes (same path) |
| `hooks/useCloseOnBack.js` | yes (same path) |
| `hooks/useDeliveryBackNavigation.js` | yes (same path) |
| `hooks/useDeliveryOnboardingExitGuard.js` | yes (same path) |
| `hooks/useOrderManager.js` | yes (same path) |
| `hooks/useProximityCheck.js` | yes (same path) |
| `hooks/useRiderLocationSync.js` | yes (same path) |
| `index.jsx` | not needed: theme root -> DeliveryApp.jsx |
| `pages/auth/OTP.jsx` | not needed: dead code (/otp renders SignIn; the lazy import is unused) |
| `pages/auth/SignIn.jsx` | yes (same path) |
| `pages/auth/Signup.jsx` | not needed: dead code (/signup redirects to /login) |
| `pages/auth/SignupStep1.jsx` | yes (same path) |
| `pages/auth/SignupStep2.jsx` | yes (same path) |
| `pages/auth/VerificationPending.jsx` | yes (same path) |
| `pages/CMSHelpSupportPage.jsx` | yes (same path) |
| `pages/DeliveryHomeV2.jsx` | yes (same path) |
| `pages/help/CreateSupportTicketV2.jsx` | yes (same path) |
| `pages/help/ShowIdCardV2.jsx` | yes (same path) |
| `pages/help/SupportTicketsV2.jsx` | yes (same path) |
| `pages/help/ViewSupportTicketV2.jsx` | yes (same path) |
| `pages/HistoryV2.jsx` | yes (same path) |
| `pages/NotificationsV2.jsx` | yes (same path) |
| `pages/OrdersV2.jsx` | yes (same path) |
| `pages/pocket/CashLimitInfoV2.jsx` | yes (same path) |
| `pages/pocket/DeductionStatementV2.jsx` | yes (same path) |
| `pages/pocket/LimitSettlementV2.jsx` | yes (same path) |
| `pages/pocket/PayoutV2.jsx` | yes (same path) |
| `pages/pocket/PocketBalanceV2.jsx` | yes (same path) |
| `pages/pocket/PocketDetailsV2.jsx` | yes (same path) |
| `pages/pocket/PocketStatementV2.jsx` | yes (same path) |
| `pages/PocketV2.jsx` | yes (same path) |
| `pages/PrivacyPolicyV2.jsx` | yes (same path) |
| `pages/profile/MyReviewsV2.jsx` | yes (same path) |
| `pages/profile/ProfileBankV2.jsx` | yes (same path) |
| `pages/profile/ProfileDetailsV2.jsx` | yes (same path) |
| `pages/profile/ProfileDocsV2.jsx` | yes (same path) |
| `pages/ProfileV2.jsx` | yes (same path) |
| `pages/TermsAndConditionsV2.jsx` | yes (same path) |
| `store/useDeliveryStore.js` | yes (same path) |
| `utils/deliveryOnboardingStorage.js` | yes (same path) |
| `utils/geo.js` | yes (same path) |
| `utils/offerFreshness.js` | yes (same path) |
| `utils/orderMapping.js` | yes (same path) |
| `utils/pickupMetrics.js` | yes (same path) |
| `deliveryTheme.css` | not needed: styles -> deliveryTheme in src/theme + per-screen styles |

## Keyboard — every input screen (lesson 27)
| Screen | Handling |
|---|---|
| Login (phone, OTP boxes, name) | `KeyboardAwareScrollView`, button under the field kept visible; keyboard closes after the 4th digit |
| Signup details (10 fields + address) | `KeyboardAwareScrollView` |
| Signup documents | photo pickers only (no text input) |
| Profile — "Type DELETE" dialog | dialog lifted by `useKeyboardOffset()` |
| Profile details — vehicle / bank popups | sheet content is a `KeyboardAwareScrollView` inside the Sheet (check for a double lift on the phone) |
| Bank details (edit) | `KeyboardAwareScrollView` |
| Create support ticket | `KeyboardAwareScrollView` |
| Delivery verification (OTP at drop) | panel rides on the keyboard (`useKeyboardOffset`) |
| Pocket balance (withdraw amount) | `KeyboardAwareScrollView` |
| Pocket — deposit amount sheet | Sheet's own KeyboardAvoidingView (as Captain wallet top-up) |

## Group reports
`conversion/auth-profile.md`, `conversion/home-orders.md`, `conversion/pocket-history.md` (files, API calls, web-only
APIs replaced, differences from the web). Ownership: `conversion/OWNERSHIP.json`.
