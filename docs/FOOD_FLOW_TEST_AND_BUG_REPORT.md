# Hello Parth – Food Flow: Test & Bug-Sheet Report

Date: 2026-09-30 (three working sessions, final state)
Source sheet: `Hello Parth bug report.xlsx` (56 rows with a bug; empty rows 57–70 skipped).
Scope: the full Food flow end-to-end, plus every bug in the sheet. Taxi rows #16–#21 were done in the same session after the Food part (details: `TAXI_FLOW_TEST_AND_FIX_REPORT.md` §9).

---

## 1. Summary

| Result | Count | Sheet rows |
|---|---|---|
| Fixed and checked in a real browser (or by API where it is a backend rule) | 51 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 39, 40, 42, 43, 44, 45, 46, 47, 48, 49, 16, 17, 18, 19, 20, 21, 52, 53, 54, 55, 56 |
| Fixed in code only (needs a real service outside the test setup) | 5 | 33, 38, 41, 50, 51 |

Bugs found during the flow test and fixed (not in the sheet): 13 Food (§3) plus the Taxi findings in the Taxi report.

---

## 2. End-to-end Food flow: result

Everything ran in one headless Chrome session with three separate logins (customer, restaurant, rider), against a copy of the database (`HelloParth_TEST`). **Last full run (end of session 3): every step passes.**

| Step | Result |
|---|---|
| Customer: ADD on a dish with no variants goes straight to the cart. Tapping + again gives quantity 2. | Pass (cart: `Chocolates x2`) |
| Customer: ADD on a dish that has variants opens the variant popup. Picking "Test 2" adds it. | Pass (cart: `Test x1 (Test 2)`) |
| Customer: place order (Cash on Delivery) | Pass |
| Restaurant: accept/reject popup appears on its own | Pass. It appeared 3–7 s after the order was placed. |
| Restaurant: ring keeps ringing while the popup is open | Pass |
| Restaurant: ring stops after accepting; the order is accepted once | Pass (1 accept call) |
| Restaurant logs in while an order is still waiting | Pass. The pending order pops up at once and rings. (Orders older than 30 minutes are ignored on purpose.) |
| Rider with no active order: the offer opens as a popup on the feed ("INCOMING REQUEST · #FOD-…") | Pass. It rings until accept or "Pass this task". |
| Rider: accepts with the slider, ring stops | Pass |
| Rider: Reach restaurant, then Pick up (bill photo is optional) | Pass |
| Rider: Arrive at customer | Pass |
| Customer: sees the 4-digit Delivery OTP on the tracking page | Pass |
| Rider: enters OTP, chooses Cash, completes the order | Pass. "Well Done" screen shows `Order Ref: FOD-…` |
| Customer: tracking page shows "Order delivered" | Pass |
| Rider: Orders tab → Accepted → the card reads `ORDER #FOD-…` (not the Mongo id) | Pass |

### Rider feed popup (new, your requirement)

- A rider with **no active order** gets every offer as a popup (`NewOrderModal`) on the feed. It rings until accept or "Pass" (2-minute safety cap). The ring stops on accept.
- If the admin limit is 2 or more and the rider already carries an order, new offers stay in the Orders tab with the short ring (as before).
- The popup shows `#FOD-…` and no longer shows a made-up "10 % earning".
- Files: `DeliveryV2/pages/DeliveryHomeV2.jsx`, `Food/hooks/useDeliveryNotifications.js`, `NewOrderModal.jsx`, `NewOrderCard.jsx`.
- Tested with limit 1 and limit 2.

---

## 3. Bugs found during the flow test and fixed (not in the sheet)

| # | Bug | Fix |
|---|---|---|
| N1 | Customer order-tracking page stayed on "Loading order details..." when opened from a link or refreshed. | `OrderTracking.jsx`: first load restarts when the page remounts mid-load. |
| N2 | The whole customer app could sit on the grey skeleton after login (zone check cancelled and never restarted). | `useZone.jsx`: keyed on rounded coordinates; a cancelled check runs again. |
| N3 | Reload right after login, before the first GPS fix was saved, left the customer on "Select location". | `useLocation.jsx`: silent GPS refresh if nothing is stored and permission is already granted. |
| N4 | **Restaurant ring stopped after 8 s**, and the backup check never opened a popup (code looked for `status: "created"` but the list says `"confirmed"`). | `useRestaurantNotifications.js`, `OrdersMain.jsx` now read the real `orderStatus`. |
| N5 | Restaurant accept was sent twice (mouseup and click); the second got HTTP 400. | `OrdersMain.jsx`: an accept can only fire once. |
| N6 | Rider "Well Done" screen used made-up values (10 % earning, `FOD-1234`, Mongo id). | Shows only the real earning and the real `FOD-…` number. |
| N7 | Push and inbox texts said "Order #6abceb9b… delivered!" (Mongo id). | Now use the `FOD-…` number. |
| N8 | Location permission popup never showed on restaurant pages (`/food/user/restaurants/...`). | `LocationPrompt.jsx`: exact prefix check. |
| N9 | **Rider "Pass" on an open offer returned 403**, so the offer came back and rang again on every poll. | `order-delivery.service.js`: `rejectOrderDelivery` records the pass; `newOffers` hides passed offers. |
| N10 | **Pickup panel covered the bottom nav**, so the rider could not open the Orders tab while picking up. | `PickupActionModal.jsx`: the panel now stops above the nav (`bottom-[92px]`). |
| N11 | **Accepted order card showed the Mongo id.** | `useOrderManager.acceptOrder` keeps `displayOrderId`; `AcceptedOrderCard` shows it. |
| N12 | Fake "10 % earning" in the rider popup and order card. | Removed from `NewOrderModal.jsx` and `NewOrderCard.jsx`. |
| N13 | **"Add category" from the add-item page lost the state**: `/restaurant/menu-categories` (without `/food`) is redirected and the redirect drops the route state, so Back went to the dashboard instead of the add-item page. Also stale copy still said categories need admin approval. | `ItemDetailsPage.jsx`, `HubMenu.jsx`: navigate to `/food/restaurant/...` directly. `MenuCategoriesPage.jsx`: texts, toasts and the Save button no longer mention approval or "resubmit". |

---

## 4. Bug sheet: row by row

**Status key.** Tested = checked in a real browser (or by API for backend rules). Code = fix is in the code, cannot be proven in the test setup.

### User app / login

| # | Bug | Status | What was done |
|---|---|---|---|
| 1 | Location popup must come back while permission isn't given | **Tested** | Shows on every screen until permission is granted. X closes it until the next screen. Blocked-location help text added. |
| 5 | Logo cut at the edges | **Tested** | Full logo visible. |
| 6 | Back from OTP opens home, not login | **Tested** | Back returns to the phone screen. |
| 7 | Login page should be centred | **Tested** | |
| 8 | Help & Support should open Contact Us | **Tested** | Real email, phone and office from Admin > Business settings. Fake `support@helloparth.com` removed. |
| 9 | Phone number lost after Terms/Privacy | **Tested** | Number kept. |
| 10 | Resend OTP behaviour | **Tested** | Decision applied: a resend never issues the same digits again, the old OTP stops working and only the newest works (user, restaurant, delivery; checked in live-OTP mode). |
| 11 | Old OTP digits cleared on resend | **Tested** | Boxes clear on resend. |
| 12 | Back from "Enter name" opens home | **Tested** | |
| 14 | Remove Terms/Privacy from OTP and name pages | **Tested** | |
| 15 | Help & Support should allow raising a ticket | **Tested** | "Raise a support ticket" card (login first if logged out). |

### Admin – Food

| # | Bug | Status | What was done |
|---|---|---|---|
| 13 | "Unnamed user" for numbers that never finished sign-up | **Tested** (API) | Food admin and Global admin Customers list only users with a name. |
| 30 | Joining request details: show the zone | **Tested** | Zone row shows "Indore". |
| 31 | Restaurant id too long | **Tested** | `REST` + last 6 characters (`REST14a1fc`); full id on hover. |
| 32 | Search placeholder cut off | **Tested** | Placeholders shortened and inputs widened. Measured on desktop and tablet: the text fits in every admin search box. |
| 36 | Category shows zone id instead of name | **Tested** | Zone name shown. |
| 50 | Admin should get push for pending approvals | Code | Admin browser registers for push; backend already notifies admins. Needs browser notification permission. |

### Restaurant app

| # | Bug | Status | What was done |
|---|---|---|---|
| 4 | Number already filled on login | **Tested** | Dev prefill removed. |
| 22 | Phone number wiped after Terms/Privacy/Support | **Tested** | |
| 23 | Resend OTP behaviour | **Tested** | Same as #10. |
| 24 | Old OTP digits not cleared on resend | **Tested** | |
| 25 | Had to pick the same search location several times | **Tested** | After picking a suggestion the dropdown stays closed (0 suggestions for 5 s). |
| 26 | Zone should auto-fill from the location | **Tested** | |
| 27 | Location outside the zone was accepted | **Tested** | Picking Connaught Place, Delhi shows "This location is outside our service zones. Please pick your restaurant's exact location." The backend also rejects such a pin. |
| 28 | Images and documents lost on refresh | **Tested** | |
| 29 | Menu images: allow multiple selection | **Tested** | |
| 33 | Push / SMS / email when approved | Code | Push existed. The approval and rejection **emails were called but the functions did not exist**; they exist now (`Backend/src/utils/email.js`) and need SMTP in `.env`. **SMS not added.** |
| 34 | Under-review page opens the dashboard by itself | **Tested** | Dashboard opens within about 10 s of admin approval. |
| 35 | Shows "Online" on a closed day | **Tested** | Wednesday 21:00 (open) shows Online; Wednesday 23:30 and Thursday (closed day) show Closed. |
| 37 | Own category usable at once | **Tested** | A new category is "Approved" at once and is in the item's category list. |
| 38 | Notify the restaurant when a category is approved | Code | Push and inbox message on approve/reject (admin-approved global categories only, since own categories need no approval). |
| 39 | Picked image lost after going to "Add category" and back | **Tested** | Name, price, description and image are kept; Back returns to the add-item page and opens the category list with the new category (see N13). |
| 40 | Items under review show as "Live" | **Tested** | "LIVE" only on approved items. |
| 41 | Item name field hidden by the keyboard | Code | Scrolls into view after the keyboard opens (needs a real phone keyboard). |
| 42 | Pending/rejected item toggle off | **Tested** | Pending and rejected items: toggle off and disabled. |
| 53 | Changing anything should not send the restaurant back under review | **Tested** | Decision applied: an edited dish goes to admin review, the restaurant panel shows it PENDING, customers do not see it, and the restaurant stays listed. |
| 56 | Order ring not ringing, popups not coming | **Tested** | See §2, N4, N5. |

### Customer – restaurants and checkout

| # | Bug | Status | What was done |
|---|---|---|---|
| 43 | Out-of-zone restaurants visible | **Tested** (API) | With the pin inside the Indore zone the restaurant is listed; with the pin moved to Delhi the list is empty; restored afterwards. |
| 44 | ADD should open the description + variants popup | **Tested** | |
| 45 | Adding the same item more than once | **Tested** | |
| 46 | Restaurants with no dishes visible | **Tested** (API) | Hidden from delivery and takeaway lists. |
| 54 | Recipient details text in Hinglish | **Tested** | Shows "Order recipient details" in English. |
| 55 | Home / Work / Other clickable | **Tested** | Home opens the saved address. "+ Work" and "+ Other" open Add Address with that label already picked. |

### Delivery (rider) app

| # | Bug | Status | What was done |
|---|---|---|---|
| 3 | Number already filled on login | **Tested** | |
| 47 | Back from 2nd onboarding page shows "exit app" | **Tested** | |
| 48 | Header should stay fixed while scrolling | **Tested** | |
| 49 | Photos removed on refresh | **Tested** | |
| 51 | Push / SMS / email when approved | Code | Same as #33. |
| 52 | Under-review page opens the dashboard by itself | **Tested** | Pending rider approved from admin; the screen went from `/food/delivery/pending-verification` to the dashboard by itself. |

### Taxi

| # | Bug | Status | Note |
|---|---|---|---|
| 2 | Captain Terms/Privacy text not visible | **Tested** | Readable in dark mode; opens without login. The Captain Terms text itself is CMS content (you already fixed it). |
| 16 | Suggestions by distance / popular places | **Tested** | Popular places near the rider's pickup, nearest first with the distance, nothing hard-coded. |
| 17 | Default "Pipliyahana" location in pickup | **Tested** | Old saved pickup is ignored after 10 min, stale address text cleared, hard-coded Indore lists and labels removed (Parcel page, Home label, Profile). |
| 18 | Pickup suggestions from other states | **Tested** | Typed searches are limited to about 33 km around the pickup. |
| 19 | Admin promo code: first-time user dropdown | **Tested** | "Who can use this code": All / First-time / Existing / One user; enforced by the backend. |
| 20 | Same place suggested several times | **Tested** | De-duplicated (Rajwada, Palasia, Nexus …). |
| 21 | White screen instead of vehicles | **Tested** | Home tiles opened the vehicle list without places; now they open the place picker first. Far drops are refused. |

---

## 5. Needs you (not code bugs, or your call)

Answered and applied: #10/#23 (resend), #53 (dish edits), rider feed popup (brought back, see §2). Nothing else is waiting on a decision.

1. **Rider earning is ₹0.** There are no *Delivery Boy Commission* slabs in the database. You said you will add the slab yourself (Food admin → Delivery Boy Commission → base slab with min distance 0).
2. **The rider can pick up while the order is still "preparing".** Allowed today. Say if pickup should wait for "Ready".
3. Found but not changed:
   - `auth.service.js` auto-creates a "Hello Parth Demo Restaurant" (Bhopal) when the default restaurant phone from `.env` logs in. Demo data.
   - OTPs are printed to the server log (`[OTP DEBUG] Generated OTP …`). Risky in production.
   - The customer gets the "Order on the way!" push twice on pickup.
   - The app treats a saved location that exactly equals the built-in "default Indore" point as the default and clears it when "default location" is switched off. Real GPS never hits that exact value, so it only affects tests.
   - `/food/restaurant/hub-menu` (without `/item/...`) has no route and renders a blank page; nothing links to it.

---

## 6. How it was tested

- A second backend on :5055 against `HelloParth_TEST` (copy of the main DB) and a second Vite on :5174. Your own :5000 / :5173 were not touched.
- Playwright + installed Chrome, headless, phone-sized screen. The ring was counted by wrapping the audio `play()` call. Uploads were faked so nothing reached the live server. The rider's GPS was moved with Playwright geolocation (the 100 m rule). The restaurant's closed-day check used Playwright's fake clock.
- Helper scripts live in `Backend/.claude-test/` and `Frontend/.claude-test/` (both only used for testing).
- Test data created, only in `HelloParth_TEST`: a few orders, "Pending Test Kitchen", "Joining Test Kitchen", a pending rider, a pending dish, two test categories. **Nothing was written to the main database.**
- Tip: do not redirect test output into a file inside `Frontend/`; Vite sees the file change and reloads the page in a loop.

## 7. Files changed (all three sessions, nothing committed yet)

Frontend – Food: `pages/user/orders/OrderTracking.jsx`, `hooks/useZone.jsx`, `hooks/useLocation.jsx`, `hooks/useRestaurantNotifications.js`, `hooks/useDeliveryNotifications.js`, `pages/restaurant/OrdersMain.jsx`, `pages/restaurant/ItemDetailsPage.jsx`, `pages/restaurant/HubMenu.jsx`, `pages/restaurant/MenuCategoriesPage.jsx`, `pages/restaurant/OTP.jsx`, `components/user/LocationPrompt.jsx`, `components/restaurant/RestaurantNavbar.jsx`, `pages/admin/restaurant/RestaurantsList.jsx`, `pages/admin/restaurant/JoiningRequest.jsx`.
Frontend – Delivery: `DeliveryV2/pages/DeliveryHomeV2.jsx`, `DeliveryV2/hooks/useOrderManager.js`, `components/modals/{NewOrderModal,OrderSummaryModal,PickupActionModal}.jsx`, `components/orders/{AcceptedOrderCard,NewOrderCard}.jsx`.
Backend: `core/otp/otp.service.js`, `food/orders/services/{order-delivery,order}.service.js`, `food/restaurant/services/{restaurant,restaurantCategory,restaurantFood}.service.js`, `utils/email.js`.
The rest of `git status` is from the earlier sessions' fixes listed above.
