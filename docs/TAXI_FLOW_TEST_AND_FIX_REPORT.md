# Hello Parth – Taxi Module: Flow Test & Fix Report

Date: 2026-09-24 · **updated 2026-09-26 (session 2 — see §8)**
Companion to [TAXI_FLOW_ANALYSIS.md](TAXI_FLOW_ANALYSIS.md) (the first analysis). This file records what was **tested**, what was **fixed**, what **data was seeded**, and what is **still open** before go-live.

---

## 1. Result in one table

| Area | Status |
|---|---|
| Ride (book → dispatch → accept → OTP start → complete → pay → rate) | Works, tested end-to-end (API + real browser UI) |
| Scheduled ride | Works |
| Parcel / Delivery | Works (fare is computed on the server from the delivery vehicle price) |
| Intercity / Outstation | Works (needs admin package prices – now seeded) |
| Bus (search → seats → hold → pay → confirm → cancel/refund, bus-driver live trip) | Works |
| Car Pooling (search → seat hold → pay → confirm → cancel/refund) | Works after rewrite (see §4) |
| Wallet top-up, ride payment by wallet / Razorpay, tip | Works |
| Driver: OTP login, online/offline, wallet recharge, withdrawal, notifications | Works |
| Owner / fleet, pooling driver, bus driver | Works |
| Admin panel: lists + create/update/delete of vehicle types, prices, goods types, app modules, bus, pooling, zones, users, wallets | Works |
| Payments with **real** Razorpay | **Not testable yet** – keys in DB are demo placeholders (see §6) |
| Rental / Service-center vendors | **Removed** (UI, admin, routes, models) — see §8 |
| Airport Cab | **Removed** (UI, admin, routes, model) — see §8 |
| Spiritual Trips | Still a UI-only mock, not linked from Home (not touched) |

---

## 2. How it was tested (and what was NOT)

- Backend was run against a **separate copy of the database** (`HelloParth_TEST`, same Atlas cluster) so no test rides or bookings touched live data. That copy is deleted at the end of the work.
- Razorpay was replaced by a **local mock** in the test server only (the DB keys are placeholders). Order creation, signature verification, refunds and idempotency were exercised against the mock, not the real gateway.
- Test drivers/users were driven by real JWTs + real Socket.IO connections (driver receives `rideRequest`, accepts with `acceptRide`, etc.).

| Test set | Checks | Result |
|---|---|---|
| Ride flow + validation guards | 29 | all pass |
| Parcel / delivery | 12 | all pass |
| Bus + Pooling (incl. tamper, expiry, refund, cancel) | 41 | all pass |
| Wallet, ride payment (wallet / Razorpay / cash), intercity, scheduled ride | 20 | all pass* |
| Every GET endpoint of user / driver / owner / bus driver / pooling driver / admin | 151 calls | no 5xx |
| Driver, bus driver, pooling driver, owner | 31 | all pass |
| Admin create / update / delete flows | 41 | all pass** |
| Admin languages + cancellation analytics | 10 | all pass |
| Real browser (Chrome) page load: 24 user / driver / owner / admin pages | 24 | all render |
| Real browser ride booking through the UI (select vehicle → book → driver accepts → tracking) | 1 flow | works |
| Frontend `vite build`, undefined-variable lint over Taxi + shared + core | – | pass |

\* one "fail" in my script was only a wrong expectation (`201` instead of `200` for wallet payment).
\*\* 4 admin GET checks used guessed URLs, not real endpoints.

**Not tested** (needs real accounts / devices): real Razorpay / PhonePe, real SMS OTP, FCM push delivery, driver **onboarding / document verification** screens, owner & service-center panels beyond loading, parcel / bus / pooling booking through the browser UI (their APIs and pages were tested separately), admin login with a password.

---

## 3. What each service does (for the client)

**Roles:** user (customer), driver (taxi/parcel), owner (fleet), bus_driver, pooling_driver, admin.
Home cards come from *Admin → App Modules*; each card opens its own flow.

| Service | Flow |
|---|---|
| **Ride** | User picks pickup/drop → fare per vehicle (from *Set Prices*) → books. Server finds the zone from pickup, finds online drivers of that vehicle type (radius grows), sends `rideRequest` by socket/push. First driver to accept wins. Driver: arriving → enters the 4-digit PIN the rider shows → trip → complete. Rider pays (cash / wallet / Razorpay), tips, rates. Commission settles to the driver wallet. |
| **Scheduled ride** | Same as ride with a future time; drivers get a 30-minute lock before it. |
| **Parcel** | Same pipeline as ride. Fare = delivery vehicle base + per-km, calculated on the server. Sender/receiver details captured. |
| **Intercity** | Admin defines packages (*Set Package Prices*: destination + per-vehicle price). User picks a package and vehicle; ride created with `serviceType: intercity`. |
| **Bus** | Admin creates bus service (route, stops, schedules, seat layout, fare, cancel rules) and bus-driver account. User searches route/date, picks seats, seats are **held 10 min**, pays, booking confirmed. Cancellation refunds by the bus's rules. Bus driver starts a live trip and sends location. Switch: *Business settings → transport_ride → enable_bus_service*. |
| **Car Pooling** | Owner/pooling driver registers a vehicle, admin approves. Admin creates a route (pickup/drop points, schedules, fare per seat, vehicles). User searches route, picks seats, seats are **held 10 min**, pays, confirmed. User can cancel up to 6 h before departure (refund). |
| **Wallet / Promo / Referral / SOS / Support / Notifications** | Supporting features on all of the above. |

---

## 4. Problems found and fixed

### Security / money

| # | Problem | Fix |
|---|---|---|
| 1 | `POST /taxi/users/otp-login` returned a full login token for **any existing phone number without OTP**. | Route and controller removed (frontend never used it). |
| 2 | Wrong OTP on the "unified" login left the request hanging and threw an unhandled error (in production that **restarts the server**). | `next` is now passed through. |
| 3 | Ride fare was fully trusted from the client (fare `0` accepted; hardcoded ₹106 fallback when no price existed). | Server rejects fares below the configured price (lower bound from straight-line distance, 10 % tolerance) and any fare ≤ 0. Prices are now seeded. |
| 4 | **Pooling payment**: verify did not check the paid amount vs seats (pay for 1 seat, claim 4); no seat hold (two people could pay for one seat); no refund; no user cancel; search matched `from` **or** `to`. | Rewritten: seats are held for 10 min at order time; verify takes seats/fare **from the hold, not the request**; expired/lost hold → automatic refund attempt; new `POST /users/pooling/bookings/:id/cancel` (+ "Cancel booking" button in Activity); search is now AND; past dates / non-running days / closed departures rejected. |
| 5 | Bus: if the hold expired before verify, money was captured and never refunded. | Automatic refund attempt + clear message. |
| 6 | Ride PIN was checked only in the driver's app, and a ride could go `accepted → completed` without starting. | Server checks the PIN when starting; completing is only allowed from started/arrived. Driver app now calls start first and shows the error instead of ignoring it. |
| 7 | Rides could be created outside every service zone (test rides were booked in Agra). | Pickup must be inside an active zone (when zones exist). |
| 8 | `GET /rides/available-drivers` was public and returned driver name, vehicle number and live location. | Requires user login. |
| 9 | Drivers stayed "online" forever after the app closed (one was online since 31 Aug) so requests went to ghosts. | Background sweep sets drivers offline after 15 min without location updates. |

### Crashes / 500s / broken screens

| # | Problem | Fix |
|---|---|---|
| 10 | Admin *Pooling Bookings* and pooling-driver *Bookings* returned 500 (`ref: 'User'`, model is `TaxiUser`). | Ref corrected. |
| 11 | `GET /deliveries` returned 500. | Fixed. |
| 12 | Bus driver "Start trip" crashed when the bus route had no map coordinates. | Guarded; seed adds coordinates. |
| 13 | Editing a bus or pooling route with a partial payload **blanked** operator/route names. | Text helpers fixed. |
| 14 | `POST /users/fcm-token` returned 500 when the app registered the token twice at once. | Retries on version conflict. |
| 15 | Missing imports crashed screens: Airport/Spiritual confirm (`Home`), Driver profile route-booking toggle (`updateDriverProfile`), Service grid card without route, Admin: Pooling *Edit*, Dashboard/User list (`toast`), Driver subscriptions (`ToggleSwitch`, `Loader2`), Deliveries refresh, Rental tracking (`INDIA_CENTER`), Blog (`X`), Zone deep-link. | All fixed; lint is clean. |
| 16 | Frontend called routes that did not exist: driver notification delete/clear, driver vehicle delete, admin language create/update, admin cancellation analytics. | Routes added (vehicle delete returns a clear "cannot be deleted, edit instead" message). |
| 17 | Vehicle icons `/1_Bike.png`, `/2_AutoRickshaw.png`, `/4_Taxi.png`, `/5_Parcel.png` were referenced but never existed in the repo (broken images everywhere). | Added to `Frontend/public/` from existing assets. |
| 18 | `TEMPORARY DEBUG LOG` in ride creation. | Removed. |

**Correction to the first report:** parcel fare was *not* client-only – the server already computes it from the delivery vehicle. The real gap was a parcel with no price configured becoming ₹0; that is now rejected.

---

## 5. Configuration data seeded (main DB `HelloParth_DB`)

Script: `Backend/scripts/seed-taxi-config.js` – run with `npm run seed:taxi-config`. Safe to re-run (creates only what is missing).

| Item | What was created |
|---|---|
| Vehicle types | Bike, Auto, Sedan, SUV (taxi); existing "Delivery" turned into a real delivery vehicle with pricing |
| Ride prices (Indore zone) | Bike ₹25, Auto ₹35, Sedan ₹60, SUV ₹90 base (2 km) + per-km / per-min, 5 % tax, 15 % driver commission |
| Intercity | Package type "One Way Trip"; Indore → Ujjain, Bhopal, Omkareshwar (Sedan + SUV) |
| Home modules | Bike, Parcel, Intercity, Bus, Car Pooling (Sedan/ride already existed) |
| Goods types | Documents, Food & Beverages, Clothing, Electronics, Groceries, Medicines, Household Items, Other |
| Payout methods | Bank Transfer, UPI |
| Support ticket titles | 16 (user / driver / owner) |
| Switches | `enable_bus_service = 1` |
| Bus | Existing "Prince Bus" activated, missing stop details and map coordinates filled |
| Car pooling | Vehicle "Ertiga Pool 1" (7 seats) + route Indore → Bhopal, 07:00 & 18:00 daily, ₹450/seat |
| Existing test driver | Moved from the old "Delivery" vehicle to "Sedan" so he can receive taxi rides |

> All prices are **placeholders** – review and edit them in Admin → Price Management before launch.

---

## 6. Open items – need action / client input

1. **Real Razorpay keys.** The keys in *Admin → Payment Gateways* are demo placeholders, so every bus / pooling / wallet / ride online payment returns "Razorpay keys are demo placeholders". Add real test keys (then live) and re-test one payment of each kind. There is no Razorpay **webhook** fallback: if a user pays and closes the app before verify, the booking depends on the verify call (now auto-refunded if the seat is lost, but a paid-and-never-verified payment still needs manual reconciliation).
2. **OTP / SMS.** `.env` has `USE_DEFAULT_OTP=true` (user OTP `1234`, driver OTP `0000`, and the OTP is shown in the API response). For production set `USE_DEFAULT_OTP=false`, `NODE_ENV=production` and enable a real SMS gateway (*Admin → SMS*; India Hub is currently disabled).
3. **Business rules I chose – please confirm with the client:** pooling cancellation allowed up to **6 h** before departure with full refund; seat hold **10 min**; driver auto-offline after **15 min**; fare guard tolerance **90 %** of the straight-line minimum.
4. ~~Airport Cab~~ **removed (§8).** Spiritual Trips / Cab Hub are still UI-only mocks with hard-coded fares — hide or build.
5. ~~Rental~~ **removed (§8).**
6. ~~Driver withdrawal accepted with empty bank details~~ **fixed (§8).**
7. **Small UI items:** Bus Home logs a React duplicate-key warning (calendar); ride screen pre-selects "SUV" even when no SUV driver is near (user must pick another).
8. **Admin panel leftovers:** *Countries* page uses a static list (its toggle does nothing); roles/permissions and a few report endpoints exist in the frontend service file but no screen uses them.
9. Test data still in the main DB from before this work: 7 old cancelled test rides, stale driver wallet values.

---

## 8. Session 2 (2026-09-26) — removals, fixes and new findings

### 8.1 Removed on request
| What | Details |
|---|---|
| **Rental** | User pages/routes/API client, admin pages (vehicles, tracking, requests, quotes, commission, service stores), driver "service center" role (signup, login, panel), backend routes + handlers + models (`RentalBookingRequest`, `RentalQuoteRequest`, `RentalVehicleType`, `ServiceStore`, `ServiceCenterStaff`), rental tracking service, default "Bike Rental" app module, rental payment-gateway flags. |
| **Airport Cab** | User pages, Cab Hub card, Intercity "Airport" tab, admin *Airport* page, `/admin/airports` API + `Airport` model. |
| **Admin "Active Vendors" card** | Replaced by a real "Total Trips" KPI. |
| **Kept on purpose** | *Package Types* and *Package Pricing* (Intercity is built on them — UI label changed from "Rental Package Types", route `/taxi/admin/pricing/package-types`, permission key `rental.view` kept so existing sub-admins keep access). |

### 8.2 Fixed
| # | Problem | Fix |
|---|---|---|
| 1 | **Driver route showed "pending approval" although no request was made, and login never opened.** Cause: the customer's login token (`localStorage.token`, role `user`) was mistaken for a driver token (`normalizeDriverPortalRole` maps every unknown role to `driver`). `/drivers/me` then returned 403 and any error was shown as "pending". | Strict role check for tokens; 403 of a foreign token → login; network/5xx → "Can't reach the server / Try again" screen; unapproved drivers can still open login; "Not you? Use a different number" button on the pending screen; sign-out no longer wipes the customer's token. |
| 2 | **Driver withdrawal** accepted with empty/invalid bank details; several pending requests could each fit the balance; the error was rendered *behind* the withdraw sheet. | Backend validates payout method + bank/UPI details (400, `PAYOUT_DETAILS_REQUIRED`), holds back pending requests from the available balance; error now shown inside the sheet with an "Add payout details" shortcut. |
| 3 | **Every Taxi API error lost its message.** `errorHandler` only sent `{error}` while the Taxi app reads `message`/`details` (the Taxi error middleware was never mounted). | Handler now sends `error` + `message` (+ `details`). Food is unaffected (additive). |
| 4 | **~25 Taxi admin screens were dead** (driver/user details, withdrawals, promo codes, referrals, owners, fleet…): they call `fetch(${__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/…)` but the shim that defines it was never installed. | `legacyBackendShim` rewritten and installed (rewrites only marked URLs to `/api/v1/taxi/…`, adds the admin token). |
| 5 | **Every "View / Edit" inside the Taxi admin that navigated to `/admin/…`** landed in the *Food* admin. ~58 places. | Central redirect `/admin/<taxi-page>/…` → `/taxi/admin/…`. |
| 6 | **New driver signup dead-ended** on a blank `/taxi/driver/select-role`. Pages existed but were never routed: role selection, bus-driver signup + bus builder, pooling-driver onboarding/status/dashboard/bookings, bus live route, **driver bank-details**, driver/owner terms & privacy, parcel chat. | Routes added. |
| 7 | The "Payout Methods" page is a mock (hard-coded "Zeto Bank Savings") — bank details could not be saved anywhere. | The real *Bank Details* page is now routed; wallet shortcut points to it. |
| 8 | Owner bottom-nav **Pooling** tab opened a blank page. | New owner *Pooling Vehicles* list (add/edit reuse the existing form). |
| 9 | Admin pooling routes always showed **no vehicles**: looked them up in `RentalVehicleType` instead of `PoolingVehicle`. | Fixed lookup + serializer. |
| 10 | Admin **bus manual booking / cancel seats** → 500 (`User`, `mongoose`, `ApiError` not imported); **owner wallet adjust/history** → 500 (`OwnerWalletTransaction` not imported). | Imports added. (Backend "undefined identifier" lint: 21 → 0.) |
| 11 | Ride/parcel screens asked `/admin/zones` (admin-only → 403), so the client-side "outside service area" check never ran. | They now use the public `/users/zones`. |
| 12 | Ride/parcel "popular suggestions" came from service stores. | Falls back to the default suggestion list. |
| 13 | `npm run cleanup:legacy-collections` pointed to a file that did not exist. | Script written (dry-run by default, backs up before dropping). `npm run audit:collections` added. |

### 8.3 Old-Taxi collections check
`node scripts/audit-collections.js` (read-only): **124 collections are used by current models; only 7 are orphaned** — 6 empty ones that belonged to the removed models (`taxiairports`, `taxirentalbookingrequests`, `taxirentalquoterequests`, `taxirentalvehicletypes`, `taxiservicestores`, `taxiservicecenterstaffs`) and `taxi_landing_services` (1 demo document "uber", no equivalent in the new taxi). No stale indexes, nothing to migrate (Taxi model names were already `Taxi*` in the old version). **Dropping them is still pending** — run `npm run cleanup:legacy-collections -- --confirm --include-nonempty` (backs the demo document up to `Backend/backups/` first).

### 8.4 New — Global admin
Sidebar now has a **Global** button under Food / Taxi (both shells, only for admins who can see both) → `/admin/global`: combined Food + Taxi overview. Plan for the full version: [GLOBAL_ADMIN_PLAN.md](GLOBAL_ADMIN_PLAN.md).

### 8.5 How this was verified
Backend against a **copy of the DB (`HelloParth_TEST`)**, never the main DB: 41 API checks (removed endpoints 404, kept endpoints 200, driver auth, withdrawal rules, admin fixes, ride create) — all pass. Headless Chrome against the same stack: driver route with a customer token, pending → sign-out, offline screen, Global tab, ~55 user/driver/owner/admin pages load without JS errors, new-driver signup up to role selection, bank details → withdrawal → admin list, legacy admin links. `vite build` passes; frontend + backend lint show no undefined identifiers.

### 8.6 Still open / decisions needed
1. **Drop the 7 orphan collections** (command above) and delete `HelloParth_TEST` if it still exists.
2. About 25 unused helper functions/constants (biometric/inspection code of the old service-center feature) remain in `driverController.js`, plus the `CustomerBiometricProfile` model — harmless dead code, can be deleted in one pass.
3. Spiritual Trips / Cab Hub: still UI-only mocks.
4. Admin dashboard still shows hard-coded demo widgets (Platform uptime 99.98 %, "Online customers" = 15 % of users, leaderboard names, "AI insights").
5. Owner profile links to `/taxi/owner/incentives` (no such page); owner withdrawals have no API (`POST /drivers/wallet/withdrawals` is driver-only).
6. Driver signup for **pooling/bus** roles is now reachable but was only checked up to role selection — run one real signup of each with a phone/OTP before go-live.
7. `Frontend/src/modules/Taxi/modules/admin/pages/drivers/DriverDetails.jsx` etc. still contain the old `fetch` pattern; they work through the shim but should eventually move to `adminService`.

---

## 7. Go-live checklist

- [ ] Real Razorpay keys entered and one bus, pooling, wallet and ride payment tested end-to-end
- [ ] `USE_DEFAULT_OTP=false`, production `NODE_ENV`, SMS gateway enabled and tested
- [ ] `FRONTEND_URL` / `SOCKET_CORS_ORIGIN` set to the real domain(s)
- [ ] Google Maps key restricted to the real domain; Firebase keys valid (push)
- [ ] Review seeded prices, commissions and pooling/bus data in the admin panel
- [ ] Decide on Airport / Spiritual (hide or build) and Rental (stay off)
- [ ] `pm2 start ecosystem.config.cjs` on the server; Redis optional (single instance works without it)

---

## 9. Session (2026-09-30) — bug-sheet rows #16–#21 (Taxi user app + admin promo)

All six rows were reproduced in a real browser (headless Chrome, test DB + test stack, real Google key), fixed, and checked again.

| # | Bug (sheet) | Root cause found | Fix | Result |
|---|---|---|---|---|
| 16 | After login, suggestions should follow the location: nearest first, then popular places (not hard-coded) | The "Popular Locations" list was Google's first 6 random points of interest (a coaching class, a bank, an OYO). Distance was not shown and not used to sort. | Popular places are looked up around the rider's pickup (malls, tourist spots, stations, airport, temples, parks), kept only if they have many ratings, then shown **nearest first with the distance** ("800 m", "4.0 km"). Cached per ~1 km cell for 6 h. Nothing is a fixed city list. Shared code: `Taxi/modules/user/utils/nearbyPlaces.js`. | Tested: Treasure Island Mall 4.0 km, Indore Junction 4.9 km, Kamla Nehru Zoo 5.8 km, Airport 9.7 km, in that order |
| 17 | "Change pick up point" shows the default Pipliyahana location | Three causes: (a) the ride page reused the **last saved** pickup even when it was hours old; (b) the Home map section kept the **old address text** while saving the new GPS coordinates (and never looked the address up if Google Maps had not loaded yet), so the address and the pin disagreed; (c) the Parcel page had a **hard-coded Indore list** ("Pipaliyahana, Indore", Vijay Nagar, Rajwada, …) plus a hard-coded "Indore, Madhya Pradesh" pickup label on Home and a fake saved "Home: Vijay Nagar, Indore" in Profile > Addresses. | A saved pickup is used only if it is under 10 minutes old, otherwise GPS is read again. The old address is cleared when the position changes and is looked up again as soon as Google Maps is ready. The hard-coded lists/labels are gone (Home shows "Detecting your location..." until the real address is known; saved Home address starts empty). Tapping the pickup box selects its text so typing replaces it. | Tested: a 1-hour-old "Pipliyahana" saved value is ignored; Home + CHANGE show the real address |
| 18 | Pickup suggestions come from other states | Typed search was not limited to the rider's area ("nexus" gave Bengaluru, Hyderabad, Chennai; "railway station" gave Jaipur, Surat). | Typed searches are limited to about ±33 km around the pickup (Google `locationRestriction` + `origin`, then dropped if reported farther than 45 km). Outstation/intercity parcels are not restricted. | Tested: "nexus", "rajwada", "palasia", "airport", "mall" now return only Indore places, with distances |
| 19 | Admin promo code > Users: dropdown for first-time user and others | The form only had a "Users" list + a "User specific" checkbox. | New **"Who can use this code"** dropdown: All users / First-time users only / Existing users only (completed a ride before) / One selected user. Backend: new `audience` field (old promos keep working through `user_specific`). "First-time" = no completed ride yet. Enforced when listing, validating and applying a promo. | Tested (API): new user sees/uses the first-time code, is refused the "existing" code (`EXISTING_ONLY`); after one completed ride it flips (`FIRST_TIME_ONLY`); "all" and "one user" codes behave. Admin form shows the dropdown and the user picker |
| 20 | Same place suggested several times in different ways | Google returns "Rajwada", "Rajwada Palace", "Rajwada Chowk", "Palasia"/"Palasia Square", "Nexus Indore Central Mall"/"Nexus Indore Central (Earlier TI Next)" as separate results. | Results are de-duplicated by place: generic words (chowk, square, palace, mall, area, …) and bracketed text are ignored, longer spellings of an already-listed name and places within 250 m with the same name are dropped. | Tested: "rajwada" → one result, "palasia" → "Palasia" + "palasia tower" |
| 21 | After filling pickup and drop: no vehicles, white screen, ride page reopens | The Home tiles (Auto, Bike Taxi, Cab Economy, Book now, …) opened the vehicle list **directly with no pickup/drop**. The vehicle page then had nothing to show, flashed an empty page and bounced back to the ride page, forgetting which vehicle type was tapped. A far-away drop (another state) also produced absurd fares (1 378 km = ₹30,969). | Tiles now open the place picker first and carry the chosen vehicle type. If the vehicle page is ever opened without places it shows a spinner (no white flash) and returns to the picker **keeping the category**. A drop that is more than 100 km from the pickup is refused with a clear message (not for intercity). A place Google cannot locate now shows an error instead of silently using a default point. | Tested: tile Auto → place picker → Rajwada → vehicle list shows only Auto, ₹110; far drop shows "about 1107 km away, too far for a city ride" |

**Also fixed on the way:** the Parcel page had ~500 lines of unused code (`MapPickerSheet`) that carried the same hard-coded list — removed; Parcel suggestions now use the same nearby/dedupe logic (city parcels only) and show distances.

**Not changed / for you to decide**
- `IntercityDetails.jsx` still has a small table of city centre coordinates (Indore, Bhopal, Ujjain, …) used to position the map for the intercity cities; it is not a suggestion list, so it was left.
- Google "popular" quality depends on Google's own ratings data (a very small town will show fewer places).
- The 100 km city-ride limit is a constant (`MAX_CITY_RIDE_KM` in `SelectLocation.jsx`); say if it should be an admin setting.
- Test helper scripts used: `Frontend/.claude-test/t_tx*.cjs`, `Backend/.claude-test/t19.mjs`.

Files: `Taxi/modules/user/pages/ride/{SelectLocation,SelectVehicle}.jsx`, `pages/Home.jsx`, `pages/parcel/SenderReceiverDetails.jsx`, `pages/profile/AddressSettings.jsx`, `components/LocationMapSection.jsx`, `utils/nearbyPlaces.js` (new), admin `pages/promotions/PromoCodes.jsx`; backend `taxi/admin/promotions/{models/PromoCode,services/promotionsService}.js`, `taxi/services/promoService.js`.
