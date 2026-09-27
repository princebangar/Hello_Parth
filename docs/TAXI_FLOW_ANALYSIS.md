# Hello Parth – Taxi Module Flow Analysis

Analysis date: 2026-09-24
Method: static code review (frontend + backend), `vite build`, custom ESLint undefined-variable check, frontend↔backend API route matching, read-only counts of the DB in `Backend/.env`. The app was **not** run end-to-end and **nothing was written** to the DB or repo.

---

## 1. Services in Taxi and how each works

The admin "App Modules" list (DB: `taxiappmodules`) decides which cards appear on the user Home. Each card opens its own flow.

| Service | Flow | Status |
|---|---|---|
| **Ride** (Book now / Bike / Auto / Cab) | Choose location → vehicle + fare → `POST /rides` → dispatch: pickup → zone → nearest online drivers (radius grows) → socket/FCM request to driver → driver accepts → Arriving → OTP → Started → Completed → user pays (cash / wallet / Razorpay) → tip + rating → wallet settlement. | Code complete. Data/config missing. |
| **Scheduled ride** | Same as ride with `scheduledAt`. Driver is locked out of other rides 30 min before. | Code present. |
| **Parcel / Delivery** | Same ride pipeline (`serviceType: parcel`). Sender/receiver details, fare computed on client from delivery vehicle pricing, payment hardcoded "Cash". | Code present. Data missing, fare bug. |
| **Intercity / Outstation** | Packages come from admin "Set Package Prices". User picks package + vehicle, ride created, drivers bid (`driver_bid`). | Empty without admin package data. |
| **Bus** | Admin creates bus service (route, schedules, seat layout, fare, cancel rules). User searches → picks seats → `/bus-bookings/order` holds seats and creates Razorpay order → pays → `/verify` confirms. Cancel uses refund rules. Bus driver logs in separately and streams live trip location. | Server-side fare, seat holds OK. Currently disabled in DB. |
| **Car Pooling** | Owner/pooling driver registers vehicle → admin approves. Admin creates route (schedule, seat fare, vehicles). User searches route → picks seats → Razorpay → booking confirmed. Driver only views bookings. | Works, with security/payment gaps. |
| **Rental** | Code exists, `RENTAL_ENABLED = false` in `Frontend/src/modules/Taxi/shared/featureFlags.js`. | Off. Not part of handover. |
| **Cab hub** (Shared Taxi / Airport / Spiritual) | Shared Taxi reuses pooling routes. Airport and Spiritual are UI-only: hardcoded fares (₹499/699/999), no backend call, "Success" page without a booking. Not linked from Home. | Unfinished. Hide or mark "coming soon". |

Supporting features: Wallet (top-up, transfer), Subscriptions, Promo codes, Referral, SOS, Support tickets + chat, Notifications, Delete account.
Roles: user, driver, owner (fleet), bus_driver, pooling_driver, service_center (rental, off), admin.

---

## 2. Current DB state (from `.env` MongoDB, read-only)

- App modules: **1** ("Sedan"). Parcel, Intercity, Bus, Pooling cards will not show.
- SetPrice: **0** → fare falls back to hardcoded values (a 98 km ride was priced ₹106).
- Vehicle types: **1** ("Delivery", `transport_type: taxi`) → parcel screen finds no delivery vehicle.
- Bus: `enable_bus_service = "0"` → all bus APIs return 403. The one bus service is `draft` with an empty second stop.
- Pooling routes: 0, pooling vehicles: 0.
- Goods types 0, airports 0, promo codes 0, payment methods 0.
- Rides: 7, all cancelled, none matched a driver, none completed. Pickups were in Agra; the only zone is Indore.
- Razorpay is in **test** mode. `USE_DEFAULT_OTP=true` in `.env`.

---

## 3. Issues found

### P0 – fix before handover

1. **Fare is not validated on the server.** `createRide` trusts the client `fare` (accepts 0). With no SetPrice the client shows hardcoded ₹106 (car) / ₹22 (bike); parcel sends `null` → ₹0. Server must compute fare from SetPrice. (`Backend/src/modules/taxi/services/rideService.js` `createRideRecord`; `Frontend/.../ride/SelectVehicle.jsx` `getFallbackVehicleEstimate`)
2. **Pooling payment flaws** (`Backend/src/modules/taxi/user/controllers/poolingController.js`):
   - Verify does not check that the paid order amount matches the seats sent → pay for 1 seat, claim 4.
   - No seat hold between order and verify (bus has one) → two users can pay for the same seat; the loser gets 409 after being charged and there is no refund.
   - No user cancel/refund endpoint. Search matches `from` OR `to` instead of AND.
3. **Drivers never go offline.** Socket disconnect only clears `socketId` (`socket/index.js`). The DB driver has been `isOnline: true` since 31 Aug with stale location, so dispatch targets ghost drivers. Needs heartbeat / stale-location timeout.
4. **Crashes from undefined identifiers** (ESLint):
   - `AirportCabConfirm.jsx:133`, `SpiritualTripConfirm.jsx:147` – `Home` not imported.
   - `driver/pages/DriverProfile.jsx:245,276` – `updateDriverProfile` not imported (route-booking toggle).
   - `user/components/ServiceGrid.jsx:816` – `onServiceClick` undefined (card without a route).
   - Admin: `PoolingManager.jsx:816` (`setPropMode`, `setPropEditId` – Edit button), `MainDashboard.jsx:542` and `UserList.jsx:161` (`toast`), `DriverSubscriptions.jsx` (`ToggleSwitch`, `Loader2`), `Deliveries.jsx:482` (`handleNotImplemented`), `RentalTrackingDetail.jsx:216` (`INDIA_CENTER`), `BlogPage.jsx:271` (`X`).
5. **Frontend calls with no backend route (404):**
   - Driver: `DELETE /drivers/notifications`, `DELETE /drivers/notifications/:id`, `DELETE /drivers/vehicle/:id`.
   - Admin: `/admin/cancellation-analytics`, `/admin/wallet/users`, `/admin/wallet/drivers`, `/admin/reports/options`, `/admin/dashboard/page`, `/admin/owners`, roles/permissions endpoints, languages/preferences create/update, payment-gateway and notification-channel PATCH, wallet withdrawals PATCH, country PATCH.
6. **Missing data/config** (see section 2 and section 5).

### P1

- Ride OTP is checked only in the driver frontend; backend never verifies it, and sends it to the driver in the payload. A ride can also go straight to `completed` without `started` (`updateRideLifecycle`).
- No zone/service-area validation when creating a ride.
- `GET /rides/available-drivers` is unauthenticated and returns driver name, vehicle number and live location.
- Leftover `console.log('--- TEMPORARY DEBUG LOG ---')` in `rideController.js:306`.
- Bus/pooling payments are Razorpay-only with no webhook fallback: if the app closes after payment, the money is taken but the booking is not confirmed.
- Parcel payment is hardcoded to "Cash".
- Airport / Spiritual pages are mock-only.

### Verified OK

- `vite build` passes; all taxi backend files pass syntax check.
- ~518 frontend API calls matched against ~487 backend routes; user/driver ride, bus, pooling, parcel and wallet calls all match (only the gaps in P0-5 are missing).
- Bus fare is computed server-side, seat holds expire, cancel rules work.
- Ride accept uses a transaction, so two drivers cannot take one ride.

---

## 4. Suggested fix order

1. Server-side fare calculation; reject fare mismatch.
2. Pooling: seat hold at order time, validate order amount/seats at verify, refund on conflict, user cancel.
3. Driver auto-offline (heartbeat / stale location).
4. Missing imports, missing routes, remove debug log.
5. Server-side OTP check, block completing an unstarted ride, zone validation, auth on `available-drivers`.
6. Hide or finish Airport / Spiritual.

---

## 5. Data setup needed (admin panel or seed script)

1. Vehicle types: Bike, Auto, Sedan, Delivery (`transport_type: delivery`).
2. SetPrice per vehicle for the Indore zone (base, per-km, per-min).
3. App Modules: Ride, Bike, Parcel, Intercity, Bus, Pooling.
4. Goods types (parcel), intercity packages (e.g. Indore→Bhopal, Ujjain).
5. `enable_bus_service = 1` and make the bus service `active` with full stops/seat layout.
6. One pooling vehicle + route (schedule, seat fare), approved by admin.
7. Payment methods; **live Razorpay keys**; set `USE_DEFAULT_OTP=false` on production.

Temporary seed data should be prefixed `SEED-TEST` so it can be removed later. Confirm whether to seed the live DB or a copy.
