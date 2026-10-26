# Conversion checklist — Hello Parth Restaurant Partner (web /food/restaurant → Expo / React Native, Android)

Status words: **Verified** (ran it on a phone and saw it work) · **Built, not tested** (code written and statically checked, needs a phone test) · **Blocked** (cannot be done; reason given).

## 0. Identity
- Package `com.helloparth.restaurant`, name "Hello Parth Restaurant Partner", scheme `helloparth-restaurant`.
- Icon from `Downloads/Hello Parth/Restaurant Partner Apk Logo.png`; splash `#66001D` (cloche lifts off a steaming dish, COOK · SERVE · GROW).
- Keystore `C:/Users/Prince/.helloparth/helloparth-restaurant-upload.jks` (outside the repo).

## 1. Routes (web RestaurantRouter + Food auth paths) — 56 routes, missing 0

| Path | Screen | Route file | Group report | Status |
|---|---|---|---|---|
| `/food/restaurant/login` | Login | `src/app/food/restaurant/login.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant/otp` | Login | `src/app/food/restaurant/otp.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant/signup` | Signup | `src/app/food/restaurant/signup.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant/forgot-password` | ForgotPassword | `src/app/food/restaurant/forgot-password.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant/pending-verification` | VerificationPending | `src/app/food/restaurant/pending-verification.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant` | OrdersMain | `src/app/food/restaurant/index.jsx` | conversion/orders.md | Built, not tested |
| `/food/restaurant/orders` | OrdersMain | `src/app/food/restaurant/orders/index.jsx` | conversion/orders.md | Built, not tested |
| `/food/restaurant/orders/all` | AllOrdersPage | `src/app/food/restaurant/orders/all.jsx` | conversion/orders.md | Built, not tested |
| `/food/restaurant/orders/:id` | OrderDetails | `src/app/food/restaurant/orders/[id].jsx` | conversion/orders.md | Built, not tested |
| `/food/restaurant/notifications` | RestaurantNotifications | `src/app/food/restaurant/notifications.jsx` | shell | Built, not tested |
| `/food/restaurant/inventory` | Inventory | `src/app/food/restaurant/inventory/index.jsx` | conversion/menu.md | Built, not tested |
| `/food/restaurant/inventory/item/:id` | ItemDetailsPage | `src/app/food/restaurant/inventory/item/[id].jsx` | conversion/menu.md | Built, not tested |
| `/food/restaurant/hub-menu/item/:id` | ItemDetailsPage | `src/app/food/restaurant/hub-menu/item/[id].jsx` | conversion/menu.md | Built, not tested |
| `/food/restaurant/menu` | Inventory | `src/app/food/restaurant/menu.jsx` | conversion/menu.md | Built, not tested |
| `/food/restaurant/menu-categories` | MenuCategoriesPage | `src/app/food/restaurant/menu-categories.jsx` | conversion/menu.md | Built, not tested |
| `/food/restaurant/earnings` | HubFinance | `src/app/food/restaurant/earnings.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/hub-finance` | HubFinance | `src/app/food/restaurant/hub-finance.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/finance-details` | FinanceDetailsPage | `src/app/food/restaurant/finance-details.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/withdrawal-history` | WithdrawalHistoryPage | `src/app/food/restaurant/withdrawal-history.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/reviews` | Feedback | `src/app/food/restaurant/reviews.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/feedback` | Feedback | `src/app/food/restaurant/feedback.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/ratings-reviews` | RatingsReviews | `src/app/food/restaurant/ratings-reviews.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/dish-ratings` | DishRatings | `src/app/food/restaurant/dish-ratings.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/share-feedback` | ShareFeedback | `src/app/food/restaurant/share-feedback.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/Share-Feedback` | ShareFeedback | `src/app/food/restaurant/share-feedback.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/reservations` | DiningReservations | `src/app/food/restaurant/reservations.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/support` | RestaurantSupport | `src/app/food/restaurant/support.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/settings` | ExploreMore | `src/app/food/restaurant/settings.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/explore` | ExploreMore | `src/app/food/restaurant/explore.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/account` | Navigate | `/food/restaurant` | shell | Built, not tested |
| `/food/restaurant/outlet-info` | OutletInfo | `src/app/food/restaurant/outlet-info.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/outlet-timings` | OutletTimings | `src/app/food/restaurant/outlet-timings/index.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/outlet-timings/:day` | DaySlots | `src/app/food/restaurant/outlet-timings/[day].jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/edit-owner` | EditOwner | `src/app/food/restaurant/edit-owner.jsx` | conversion/settings-2.md | Built, not tested |
| `/food/restaurant/phone` | PhoneNumbersPage | `src/app/food/restaurant/phone.jsx` | conversion/settings-2.md | Built, not tested |
| `/food/restaurant/edit-address` | EditRestaurantAddress | `src/app/food/restaurant/edit-address.jsx` | conversion/settings-2.md | Built, not tested |
| `/food/restaurant/edit-cuisines` | EditCuisines | `src/app/food/restaurant/edit-cuisines.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/fssai` | FssaiDetails | `src/app/food/restaurant/fssai/index.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/fssai/update` | FssaiUpdate | `src/app/food/restaurant/fssai/update.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/update-bank-details` | UpdateBankDetails | `src/app/food/restaurant/update-bank-details.jsx` | conversion/settings-1.md | Built, not tested |
| `/food/restaurant/delivery-settings` | DeliverySettings | `src/app/food/restaurant/delivery-settings.jsx` | conversion/settings-2.md | Built, not tested |
| `/food/restaurant/status` | RestaurantStatus | `src/app/food/restaurant/status.jsx` | conversion/settings-2.md | Built, not tested |
| `/food/restaurant/rush-hour` | RushHour | `src/app/food/restaurant/rush-hour.jsx` | conversion/settings-2.md | Built, not tested |
| `/food/restaurant/download-report` | DownloadReport | `src/app/food/restaurant/download-report.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/hyperpure` | Hyperpure | `src/app/food/restaurant/hyperpure.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/manage-outlets` | ManageOutlets | `src/app/food/restaurant/manage-outlets.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/zone-setup` | ZoneSetup | `src/app/food/restaurant/zone-setup.jsx` | conversion/settings-2.md | Built, not tested |
| `/food/restaurant/onboarding` | RestaurantOnboarding | `src/app/food/restaurant/onboarding.jsx` | shell | Built, not tested |
| `/food/restaurant/privacy` | PrivacyPolicyPage | `src/app/food/restaurant/privacy.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant/terms` | TermsAndConditionsPage | `src/app/food/restaurant/terms.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant/help-centre/support` | RestaurantSupport | `src/app/food/restaurant/help-centre/support.jsx` | conversion/finance-reviews.md | Built, not tested |
| `/food/restaurant/help-content` | CMSHelpSupportPage | `src/app/food/restaurant/help-content.jsx` | conversion/auth.md | Built, not tested |
| `/food/restaurant/auth/sign-in` | (Food | `routes` | shell | Built, not tested |
| `/food/restaurant/signup-email` | (Food | `routes` | shell | Built, not tested |
| `/food/restaurant/auth/google-callback` | (Food | `routes` | shell | Built, not tested |
| `/food/restaurant/orders/` | (Food | `routes` | shell | Built, not tested |

## 2. Static checks (27 Oct)
- check-routes: 56 routes, missing 0; web components 59, not in the app 0
- check-links: 96 in-app path literals, unmatched 0 (6 reviewed by hand: legacy `/restaurant/...` mapped by the router; user / delivery / socket paths in shared code not reachable from restaurant screens)
- check-raw-text: 162 files, 0 problems
- check-converted: 249 files, 0 problems
- eslint src: 0 errors (69 warnings)

## 3. Nothing is Verified yet
No phone was connected during the conversion; see REPORT.md "phone pe check karna".
