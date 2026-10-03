# Yatradesk bug sheet -> Hello Parth Taxi: report

Sheet: `Yatradesk bug sheet.xlsx` (272 rows, written for the Yatradesk project). Only bugs that exist in **Hello Parth's current Taxi flow** were worked on. No new flow was built (no Agent, Rental, Spiritual, Explore India, CMS-landing, Centralized Bookings).

Last updated: 2026-10-03, after batch 9 - all rows done (updated after every 10 fixes so work can continue after the usage limit). Batches 1-3 (65 fixes) were tested by you; batches 4-9 are code-read + syntax-checked only.

## Count

| | Rows |
|---|---|
| Total in sheet | **272** |
| Not in Hello Parth (module/feature does not exist here) | 72 |
| Real Hello Parth bugs to look at (272 - 72) | **200** |
| **Fixed in code** | **144** |
| Checked: already fine / fixed earlier / works as designed | 46 |
| Skipped (not clear / needs a new flow / needs your data) | 10 |
| **Still to do (not checked yet)** | **0** |

> **Important:** everything below was checked by reading code and each changed file passed a syntax check (esbuild for the frontend, `node --check` for the backend). **Nothing was tested in a browser or against the database this session.** Test the fixed screens once before go-live.

## 1. Fixed (144)

| # | Where | Bug (sheet) | What was done |
|---|---|---|---|
| 8 | User, Driver · registration | when enter name & below field --> page should be automatically scrollable | Driver/owner forms: the field being typed in scrolls into view above the keyboard (user signup has one field, already fine). |
| 10 | User · home | header should be fixed | User home: the top bar (location + Food/Taxi switch) now stays fixed while scrolling. The home wrappers used overflow-x:hidden, which silently disables sticky (that is also why the "sticky" search bar never stuck) -> overflow-x:clip. Taxi home only. |
| 13 | Driver · registration | all header should be fixed | Registration steps: back button + "Step x of 4" row now stays fixed while scrolling (5 pages). |
| 14 | Driver · registration / step 4 KYC vault | document expiry date should not accept past dates | KYC expiry date: past dates blocked in the date picker, in the Submit check, and rejected by the server. |
| 15 | Admin | admin not get notify of support ticket, driver registration request, reupload document verification | Admin bell got a "Requests" tab (driver/owner sign-ups, open tickets, re-uploaded documents) + live toast + push to admin devices. |
| 17 | Admin · driver management / pending driver | view profile --> documents --> remove coloum Identify Number (if not needed) | Admin driver documents: "Identify number" row shown only when the document has one (renamed "Document number"). |
| 18 | Admin · driver management / pending driver | view profile --> documents --> Expiry Date --> if documents with no expriy date --> should show NA or dash | Admin driver documents: missing expiry date shows "N/A". |
| 22 | Driver · home | footer menu should be fixed at bottom | Driver/owner bottom menu is rendered into <body> so it can never scroll with the page. |
| 23 | Driver, User · profile | all header should be fixed | Driver-side page headers fixed (sticky) on 13 pages (user-side headers were already sticky). |
| 24 | Driver · profile | documents --> view --> background should not be scrollable | Driver documents: page behind the viewer/modals no longer scrolls. |
| 28 | Admin · Bus service / Fleet Manager | add new bus --> Route Snapshot, save bus service section should be fixed | Bus add/edit form: "Current step / Route snapshot / Save" bar now sticks to the bottom. |
| 30 | Admin · Bus service / Fleet Manager | add new bus --> Route Name, Origin City, Destination City --> entered text & city suggestion is not fully visible | Origin/Destination city suggestion list sits above everything (z-index). |
| 32 | Bus | all header should be fixed | Bus driver app: the Schedule / Seat desk / Bookings header (back, title, logout) now stays on top while scrolling; titles read properly ("Seat desk", not "desk"). |
| 33 | Bus · desk | passenger reservation form --> when filling passenger details --> footer menu shown above the keyboard | Bus driver bottom menu hides while the keyboard is open and is portalled to <body>. |
| 35 | Admin · Fleet Manager | view bus detail --> Route Overview --> Distance & Duration data is overlaping | Bus route overview: distance/duration shown with units ("193 km", "9h 15m") and wrap, no overlap. |
| 36 | Admin · Bus Bookings / Setwise Occupancy | text is going out of box | Bus bookings admin: seat tiles/heading/calendar cells no longer overflow; "Setwise" -> "Seatwise". |
| 40 | Admin · dashboard | when click on profile --> should show profile | Admin user menu got "My Profile". |
| 44 | Admin · dashboard | Revenue Intel data is not updating | Dashboard Revenue tabs were Week/Month/Year but all showed all-time numbers -> now honest "Today / All time"; fake map pin removed. |
| 45 | Admin · Promotions management / Push Notifications | when sent Push Notifications showing --> Notification sent. Delivered to 2 of 7 device(s). 5 failed. 4 invalid token(s) were cleaned up | Push result message now plain language ("sent to N devices, M could not be reached ..."). |
| 46 | User | coming 2 default push notification | Duplicate Taxi push: service worker showed it again although Firebase already showed it (Taxi only). |
| 50 | Admin · price management / zone | Add Market Zone --> search location not proper working on map | Zone map search: Enter without picking a suggestion now finds the place; map fits the city. |
| 51 | Driver · home | today's summary --> showing wrong active time | Driver "Active" time kept running after the 15-min offline sweep / app kill -> session now closed at last sign of life; IST-midnight maths made timezone-safe. |
| 53 | User | not showing push notification of driver chat | Ride chat messages now send a push to the other side. |
| 54 | User | chat with driver --> type a message emoji is not clickable | Chat emoji icon now opens an emoji tray. |
| 56 | Driver | finalize trip/price breakdown page should be fully visible | Driver trip sheets (incl. Collect payment / Finalize earnings): height used vh, which on phones includes the hidden browser bar, so the bottom (Finalize button) sat below the screen; padding ignored the gesture bar. Now dvh + safe-area padding. |
| 58 | User · driver reached destination | should show full pickup location | Ride complete page shows the full pickup/drop text (no "..."). |
| 59 | User · driver reached destination | tip your driver --> when selecting tip --> its automatically select to no tip --> unable to give the tip(same with rating & note) | Tip / rating / note kept resetting: the 5-second ride refresh overwrote the rider choice with the empty server copy (and the refresh timer was never cleared). Same fix on the parcel page. (2026-10-03: a leftover line from that fix referenced an undefined timer and could crash the page when the payment method changed - removed.) |
| 61 | Driver · home | today's summary --> not showing earnings decimal value | Driver today's earnings show paise (e.g. Rs 152.50). |
| 62 | User · profile | all header should be fixed | User profile pages: headers were marked sticky but the page root had overflow-hidden, so they scrolled away (Address, Delete account, Wallet, Notifications, Promo codes) -> overflow-clip; Subscriptions header made sticky too. |
| 63 | User · rides | showing wrong taxes & fees charge | Trip receipt tax was a made-up 18%. Rides now store the real tax % (pricingSnapshot.service_tax); receipt shows real tax, promo discount and tip. Old rides show only the total. Also fixed: settlement used to wipe the rest of the pricing snapshot. |
| 64 | User · rides | showing wrong driver rating | Trip receipt driver rating "4.9" fallback removed (real rating or "New"). |
| 65 | Driver | ride request --> ride time not ending, it restart again & again | Driver ride-request countdown kept restarting: every DriverHome re-render (location updates) re-ran the timer, and when the phone clock was ahead of the server the expiry fell back to "now + 15 s" each time. Expiry is now fixed once per request. |
| 66 | User | ride scheduled --> all pages are in light theme but this page is in dark theme | "Ride scheduled" page was hard-coded dark (slate-950) while the rest of the user app is light; it now uses the user-app theme colours (light and dark theme both correct). |
| 68 | Driver · ride request | scheduled ride accepted --> next page --> scheduled ride --> down sheet is not working | Driver Scheduled rides -> tap a ride: the sheet could not scroll (long addresses/stops/buttons ran off the top) and tapping outside did not close it. Now it fits the screen, scrolls, and closes on outside tap. |
| 69 | Admin · ONGOING REQUESTS | scheduled ride --> should show as a scheduled ride text & it should show under upcoming status | Ongoing / Trip requests: a future scheduled ride (even after a driver accepted it) showed as "accepted / on trip". Now it is "upcoming" with a "Scheduled - date time" label until the ride really starts; Upcoming tab includes it, Accepted/On-trip tabs exclude it. Also fixed: searching replaced the tab filter (showed every status), payment always said CASH, pickup/drop showed coordinates instead of the address. |
| 70 | Admin · ONGOING REQUESTS | action dots are not clickable | Ongoing requests: the three-dots menu was cut off by the table and half of its entries only said "not implemented". Now a real menu (View details / Cancel & remove) drawn outside the table (new shared RowActionMenu). |
| 72 | User · support | payment failure overlap footer menu | Support page: last topic ("Payment failure") no longer hidden behind the bottom menu. |
| 73 | User · ride book | add stop --> filed box should be fully visible | Add-stop field no longer clipped; max 3 stops. |
| 74 | Driver · scheduled ride | should show push notification before 15 mins | Scheduled ride reminder: new server job sends the driver one push ~15 minutes before an accepted scheduled ride (bidding/outstation scheduled rides are accepted ahead of time). Ride got a driverReminderSentAt flag so it is sent once. |
| 75 | User · scheduled ride | not showing otp | Scheduled ride OTP: a user had no place to see the OTP of a ride booked for later (active-ride screen only opens once it starts). The ride detail page now shows "Scheduled ride - date, time" and the ride OTP to give the driver. |
| 77 | Driver · ride request  | user added stop location not showing | Rider stops are now saved on the ride and shown to the driver (request screen + active trip). They were dropped before. |
| 79 | Admin · Pooling / Pooling Vehicles | add --> Plate Number should be in format | Pooling vehicle (admin + owner) plate number is auto-formatted and validated (MP09AB1234). |
| 80 | Admin · Pooling Commission | correct all wrong text , alignment etc... | Pooling commission page: clearer heading/explanation, column names "Driver commission / Owner commission / Service tax", values no longer hidden behind the % icon. |
| 82 | User · sharing car(pooling) | select date --> should not show past date | Pooling: past dates blocked (date picker + server search). |
| 83 | User · sharing car(pooling) | search ride --> step 1 --> not showing pickup,Drop Points,Middle Stops details & location | Pooling search list now shows departures, pickup points, drop points and stops on the way; fake "4.8 Top Pilot" rating removed. |
| 84 | User · sharing car(pooling) | step 1 filter is not clickable | Pooling search filter button works (sort: recommended / lowest / highest price / earliest departure). |
| 85 | Admin · car Pooling / Pooling Bookings | action dots are not clickable | Pooling bookings: actions are always visible (they only showed on hover) and open a menu: View details / Mark completed / Cancel booking. |
| 86 | User · sharing car(pooling) | ride payment completed page --> when refresh it redirect to step 3 confirm ride with payment pending | Pooling: after paying, a refresh went back to "Step 3/3 - pay" (risk of paying twice). The confirmed booking is now kept in the page history, so a refresh shows the success screen. |
| 88 | User · sharing car(pooling) | search --> popular routes --> hide/show arrow is not working | Pooling "Popular routes" arrow now hides/shows the list (it used to scroll the page to the top). |
| 114 | User · ride booking | not showing Vehicle Preferences | Vehicle preferences set by admin (Masters > Preferences, per vehicle type) now show in the user's "Vehicle details" sheet on the booking page. They never reached the app; the vehicle model also pointed at a wrong model name (fixed). |
| 123 | Admin | admin not notify of any request | Same as #15 (admin notified of requests). |
| 130 | Bus · home | scan ticket qr --> but passenger ticket has no QR | Bus ticket showed a QR icon that is only a picture (and the Hello Parth bus driver app has no scanner). Replaced with "Show ticket code XXXX to the bus driver" (driver checks it in Bookings). |
| 132 | Bus | mobile back from any footer menu --> showing --> do you want to log out & leave the bus driver console | Bus driver: phone Back from Schedule / Desk / Bookings now goes to Home; the logout question only comes from Home. |
| 133 | Bus · home | daily evening service --> not updating selected card data | Bus schedule cards (e.g. "Daily evening service"): tapping a saved card now makes it the live schedule (only the small "Use for Ops" pill worked) and the calendar jumps to its next travel date. |
| 134 | Bus · desk | should show cancellation policy during bus booking | Cancellation policy shown on the bus driver seat desk (above Reserve) and on the customer passenger-details page. |
| 136 | Bus · home | below --> quick action --> open seat desk & booking --> page should open from top | Bus driver: every tab opens from the top of the page. |
| 137 | Bus · schedule | manage live service scheduling --> travel date --> accepts past date | Bus driver travel-date calendar: past days are disabled. |
| 138 | Bus · schedule / add | when enter details footer menu showing above the keyboard | Same as #33 (bus schedule form: footer no longer above the keyboard). |
| 139 | Bus · bookings | should show upcoming/future bookings also | Bus driver Bookings tab: new "This run / Today / Upcoming" switch (Upcoming = today and all future days). |
| 141 | Bus | should show same time format at every place | Bus app times: schedule/stop times were shown raw ("18:30") while others were "06:30 pm"; all shown times now use one format ("06:30 PM"). Input fields unchanged. |
| 149 | Driver | not applying waiting charge | Waiting charge now applied: admin already sets it (Set Price: waiting charge per minute + free waiting) and the driver app showed a waiting timer, but the amount never reached the fare. When the trip starts (OTP ok) the server adds (minutes from Arrived to start, rounded up, minus free minutes) x rate to the fare - the same numbers the driver saw. Not for subscription-covered rides. Driver app shows the new fare + a "Waiting charge Rs X added" toast; user receipt shows a "Waiting charge" line. Cash, online QR, wallet payment and commission all read the ride fare, so they follow automatically. |
| 150 | Driver | after trip completed --> showing cancelled | Driver: right after completing a trip it said "Ride was cancelled or is no longer active" (a socket reconnect during the payment/rating screen got "no active ride"). After payment/review stage this is now ignored - finished, not cancelled. |
| 151 | Driver · history | active logs --> change text rider to customer/user & payment to payment type | Driver history: "Rider" -> "Customer", "Payment" -> "Payment type". |
| 152 | Driver · home | today's summary section --> overlap footer menu | Driver Today's Summary no longer overlaps the bottom menu (accounts for safe-area). |
| 153 | Driver · history | should show same amount | Driver history card: two different amounts without labels (earning on top, fare at the bottom next to a tick) -> "You earned" and "Fare" labels; cancelled trips showed the full fare as earning -> Rs 0. |
| 154 | Driver · history | when filter applied should show notification dot | Driver history filter: when a status filter is on, the filter button shows a red dot and a "Showing: Completed  x" chip (tap to clear). |
| 156 | Driver · wallet  | showing wrong amount increasing/decreasing sign | Driver wallet: credits now show "+Rs", debits "-Rs". |
| 158 | User · ride booking | coupon code not applied | Coupon chosen on the Promo page was only copied; it is now remembered and applied automatically on the booking screen. |
| 159 | Driver · milestone, profile | not showing rating | Driver profile / milestones: a driver with no ratings yet saw "0.0 Rating" (looked broken) -> "New - no ratings yet"; real rating shows as before. |
| 160 | Driver · profile | profile photo not updating | Driver profile photo: after choosing a photo the app said "uploaded" but saved it only if the driver also pressed Save (Back lost it), and the picker forced the front camera (no gallery). Photo is now saved right after upload and gallery is allowed. |
| 161 | Driver · profile / documents | update expiry date --> showing waitng for admin verification --> admin not get notify & not showing verification request | Driver document update -> admin gets alert + Requests tab entry. Also closed a hole: a driver could mark his own document "approved" through the request. |
| 162 | Driver · profile / refer & earn | click on share button --> copied code & redirect to whatsapp | Driver referral Share: no longer copies the code and jumps to WhatsApp on desktop (uses the phone share sheet; on desktop it only copies). |
| 163 | Driver · profile / refer & earn | share link --> change & add app link | Driver referral share text now has code + sign-up link and an optional app link (set VITE_DRIVER_APP_URL in Frontend/.env - no store link exists in the project yet, send me the URL). |
| 165 | Driver · profile / my route booking | not made flow(only have a option to on/off route booking) | Route booking removed (your call): ON froze the matching point at the spot pinned when switched on, so a driver who kept driving got requests near the old spot, and the idle sweep never took such a driver offline. Live GPS already updates every ~10 s while the app is open (sent when the driver moves 25 m+), so no app restart is needed. Toggle removed from the driver profile; server matching + go-online always use live GPS; drivers who had it ON fall back to live GPS automatically (no DB change). |
| 166 | Driver · profile | driver application --> background should not be scrollable | Driver profile policy sheets: page behind no longer scrolls. |
| 167 | Driver · profile | remove driver application if not needed) | Driver profile: dead "Driver Application" sheet removed (it described biometric/service-centre signup that no longer exists). |
| 168 | Driver · profile / owner support | replace & add correct email | Driver profile "Owner Support" email set to helloparthg@gmail.com (change later in DriverProfile.jsx). Also: the call button had an empty tel: link -> now dials the support number, label "Call Support". |
| 169 | Driver | header & footer should be proper aligned & fixed n | Driver header/footer alignment: sticky headers + portalled footer. |
| 171 | Owner · login | click on contact support --> driver support --> page should not have horizontal scroll | Partner Contact support / Terms / Privacy: long links, wide tables or big images in the admin text made the page scroll sideways; content now wraps inside the screen (Taxi wrapper only, Food page untouched). |
| 172 | Owner · registration / all pages | when enter name & below field --> page should be automatically scrollable | Same as #8 for owner forms. |
| 173 | Owner · registration | tax no. should be in format | Owner GST/tax number auto-formatted (15 chars) and validated. |
| 174 | Owner · registration / kyc vault | expiry date --> accepts past dates | Same as #14 for owner KYC. |
| 176 | Owner · owner management / Manage Owners | pending --> view --> not showing documents | Owner View -> Documents was empty for owners who signed up in the partner app (documents stayed on the sign-up record). Approval now copies them; owners approved earlier show the sign-up documents (no DB change). |
| 177 | Owner | all heading should be fixed | Owner pages headers fixed (same sticky-header change). |
| 178 | Owner · manage driver | plus icon overlap footer menu | Owner "Manage drivers" + button floats above the bottom menu (incl. safe-area). |
| 179 | Owner · manage driver | add driver --> driver detail form --> font should be same as all font | Owner "Add driver" form: text sizes/weights now match the other forms (labels 10px, inputs 15px semibold, readable placeholder, no italic heading). |
| 180 | Owner · manage driver | add driver --> driver detail form --> on refresh form details should not be removed | Owner "Add driver" form keeps what was typed after a refresh. |
| 181 | Owner · manage driver | add driver --> driver detail form --> back from step 2 --> it redirect to manage driver page | Owner "Add driver": Back from step 2 returns to step 1 (not to the driver list). |
| 183 | Owner | footer menu should be fixed at bottom | Owner footer menu fixed at bottom (portal). |
| 184 | Owner | vehicle --> below button overlap footer menu | Owner vehicle page bottom button no longer overlaps the footer menu. |
| 185 | User | ride booking --> add stop --> showing vehicles --> but not showing added stop & price also not update accordind to add stop | Stops added on the ride booking page are sent with the booking and shown as "Via ..." on the vehicle page (route/fare were already computed with the stops). |
| 186 | Owner · vehicle | add vehicle --> license plate no. should be in format | Owner "Add vehicle" plate number format + validation. |
| 187 | Owner · vehicle | add vehicle --> selected vehicle type --> service note --> showing share ride not enabled --> there is no option to enable share ride | Owner Add vehicle: removed the "Share ride: Not enabled" service note - that vehicle-type flag is not used by any Hello Parth flow (shared rides are Pooling vehicles), so there was nothing to enable. |
| 188 | Owner · vehicle | add vehicle --> on refresh --> filled form details should not be remove | Owner "Add vehicle" form keeps what was typed after a refresh. |
| 191 | Owner | there is way to assign driver in fleet vehicle (unable to complete the flow) | Owner Add driver: the Assigned vehicle / zone pickers appeared only when editing a driver, so a new driver could not be put on a fleet vehicle; they now show while adding too (server already supported it). |
| 193 | User · rides | remove support filter | User Rides: "Support" filter tab removed. |
| 195 | User · bus booking  | book for someone else --> enter name overlap payable amount | Bus passenger-details: last fields no longer hide behind the fare summary; summary hides while the keyboard is open. |
| 198 | Admin · Dashboard / SOS Terminal | correct the alignment | SOS terminal alignment: cards/labels aligned, fake parts removed ("Escalated" always 0, "Agents" always 1, "Prio-1" on every card, a chat box that could never send); "Resolved Today" was really all-time -> "Closed (all time)". |
| 201 | Admin · Dashboard / SOS Terminal | text is going out of box | SOS terminal text: long addresses wrap inside their boxes; details show driver + passenger name with tap-to-call phone, trip, vehicle, pickup, drop (was last 8 chars of IDs and an always-"Unavailable" contact). |
| 202 | Admin · Dashboard / SOS Terminal | showing default 1 Active Distress Signals | SOS terminal: hard-coded "Avg Response < 30s" and a duplicate "High Priority" card removed (counts shown are real). |
| 206 | User | coming 2 push notification at a time | Same as #46. |
| 207 | Admin · promotion management / Push Notifications | Notification sent showing --> Delivered to 6 of 8 device(s). 2 failed. 1 invalid token(s) were cleaned up. | Same as #45. |
| 212 | Admin · price management / zone | add market zone --> search location pinpoint is not working | Zone map search drops a pin on the found place and zooms to it. |
| 214 | Admin · price management / set price | filter & search is not clickable | Set Price search no longer reloads the list on every key press (debounced). |
| 215 | Admin · price management / set price | driver incentive --> driver not received incentive | Driver incentive claim marked the reward "claimed" before crediting the wallet -> a failed credit lost the reward. Now rolled back on failure. |
| 220 | Admin · bus service / bus booking | text is going out of box | Bus booking calendar text stays inside its box. |
| 221 | Admin · bus service / bus booking | also able to book bus ticket for past time | Admin bus booking: past date blocked in picker, and server refuses a bus that has already departed. |
| 222 | Bus · bookings | not showing today's all bookings | Bus driver Bookings tab: "Today" shows all of today's bookings across runs. |
| 223 | Admin · bus service / bus booking | when search page is refresh again & again | Bus bookings search no longer refreshes the page on every key (debounced, no skeleton flash). |
| 224 | Admin · Pooling Commission | page is not fully visible | Pooling commission page fits the screen: 4 inputs were squeezed into one narrow column and the search box forced 280px; now a stacked layout on small screens and a wider grid on large ones. |
| 225 | Admin · car pooling / Routes & Stops | all routes --> vehicle count not updating | Pooling routes list: vehicle count was always "0 Assigned" (page read a field the server never sends); now shows the real assigned count. |
| 226 | Admin · car pooling / Pooling Bookings | should show action coloum data | Pooling bookings: Action column now has real content (see #85) and a booking-details popup. |
| 227 | Admin · car pooling / Pooling Bookings | three dot is not working | Pooling bookings: three dots work (see #85). |
| 228 | Admin · Delivery Requests/ONGOING REQUESTS | action dots are not clickable | Delivery requests: three-dots menu works (View details / Print invoice); fake entries removed. |
| 230 | Admin · customer manament / user  | debit also works as credit | Admin user wallet Debit added money instead: the user page sent "payment_type" but the server reads "operation" (default credit). Fixed both sides; debit larger than the balance is now refused with a clear message (it used to crash on save). |
| 231 | Admin · Customer Management / Subscription Management | not showing Vehicle Type in Vehicle Type coloum | Customer subscription list "Vehicle Type" column was empty (read the wrong field). |
| 232 | User · profile / subscription  | buy subscription --> active --> also showing --> not enough wallet balance for this plan | Customer Subscriptions page: a category that already has an active plan shows "Already active" and no false "not enough balance". |
| 233 | Admin | not showing user subscription revenue | Customer subscription plans list now shows Sold / Running / Revenue per plan + totals. |
| 235 | Admin · Customer Management / User List | view --> user payment history --> showing wrong --> Total Wallet Balance, Available Balance | User payment history: every row looked like a credit (server sends kind, page checked a field that never exists) so totals were wrong. Rows now show real credit/debit; "Available Balance" = the real wallet balance; first card renamed "Total Added". |
| 236 | Admin · Customer Management / User List | when search page is refresh again & again | User list search: the "Updating users..." strip pushed the table up/down on every search -> small spinner inside the search box instead; a failed first load no longer swaps the whole page for a loader on every key. |
| 237 | Admin · Customer Management / Subscription Management | there is no option to delete subscription | Subscription plans can now be deleted / switched active-inactive (delete blocked while customers still have a running pass). |
| 238 | Admin · Delivery Requests | correct the date format | Delivery + Ongoing requests: date shown as "03 Oct 2026, 06:33 pm" (same as Trips) on one line; was a mixed GB/US format that wrapped. |
| 239 | Admin · Driver management / Pending Drivers | remove duplicate search text | Pending drivers: "Filters" panel (date range + hard-coded Sedan/SUV/Hatchback) never filtered anything -> removed; one search box left ("name or phone" - location was never searched). |
| 240 | Admin · Driver management / Approved Drivers | driver is online but showing status offline | Admin approved-driver list now shows an Online/Offline dot. |
| 241 | Admin · Driver management / All | all selected functionality not working | All drivers "Filters": Date range and hard-coded Sedan/SUV/Hatchback were never sent to the server. Date range (registered today/this week/this month) now filters on the server; fake vehicle list replaced by Online/Offline. |
| 242 | Admin · Driver management / Active/Approved Drivers | remove password option because driver login is OTP based | "Reset password" removed from driver lists (login is OTP). |
| 244 | Admin · Driver management / Subscription | export list button is not clickable | Driver subscription "Export List" downloads a CSV. |
| 245 | Admin · Driver management / Subscription | action dots are not clickable | Driver subscription action dots now open Mark active/inactive + Delete. |
| 247 | Admin · Driver management / Driver Rating | view --> not showing driver profile | Driver rating view: new "View driver profile" button; real profile photo (read the wrong field) or initial; fake stock taxi picture removed. |
| 248 | Admin · Driver management / Driver Rating | view --> minimize the length of driver rating | Driver rating view: only trips the customer actually rated (max 100), as compact one-line rows instead of a big card for every trip. |
| 249 | Admin · Driver management / Driver Rating | should show pickup address instead of coordinates | Driver rating view: shows the pickup address (coordinates only if a ride has no address). |
| 250 | Admin · Driver management / Driver Rating | view driver --> every trip showing same rating | Driver rating view: every trip showed the driver's overall rating; now each trip shows its own customer rating + comment + customer name. |
| 251 | Admin · Driver management / Subscription | add --> how it's work is not clickable | Driver subscription "How It Works" button jumps to the How-It-Works text. |
| 252 | Admin · Driver management / driver wallet | Withdrawal request --> Withdrawal Details -->Withdrawal Request History --> action dots are not clickable | Driver withdrawal history: dots on already-approved/rejected rows opened nothing; now they open a menu (Approve/Reject for pending, otherwise "Already ..."). |
| 253 | Admin · Driver management / driver wallet | Negative Balance Drivers--> action dots are not clickable | Negative-balance drivers: dots menu was clipped by the table; now works (View driver). |
| 254 | Admin · Driver management | Add Payment Method --> Input Field Type--> there is 2 dropdown | Payment method "Input Field Type": two arrows (browser arrow + icon) -> one. |
| 258 | Admin · Referral Dashboard | not showing User Referrals Overview, Driver Referrals Overview month wise | Referral dashboard was fully mocked (always 0). Now real: referred users/drivers vs normal, month-wise counts for the current year (India time), and referral rewards actually paid from wallets. |
| 259 | Admin · Owner Dashboard | not showing all cards data | Owner dashboard: fleet counts and every money card were hard-coded 0 on the server. Now real fleet vehicles (total/approved/pending), fleet drivers, and today/overall earnings split by cash/wallet/online, commission and driver earnings. Fleet cards also linked to a page that does not exist -> fixed links. |
| 260 | Admin · Owner Management / Pending Owners | remove extra search text | Pending owners: the "Filters" button opened two more boxes that were wired to the same search text -> removed (one search box left). |
| 261 | Admin · Owner Management / Manage Owners | all selected functionality not working | Manage Owners: Status filter was not connected, "Show N" and Prev/Next did nothing, "Company Name" box was a copy of the search box, List/Grid buttons did nothing. Status filter + paging now work; dead controls removed; search also matches phone. |
| 262 | Admin · Owner Management / Manage Owners | Create Owner,Create Fleet Driver --> remove password & confirm password field because login is otp based | Password / confirm-password removed from admin Create Owner, Create Driver and Create Fleet Driver (OTP login); server no longer requires them. |
| 263 | Admin · Owner Management / Create Fleet Driver | submit & show any validation --> uploaded profile image removed | Create Fleet Driver: profile picture now shows a preview and stays through validation errors (state is kept). |
| 264 | Admin · Finance Report | download --> not showing data | Finance report download came out empty when a vehicle type was chosen (compared against the driver vehicle string); now filters by the ride's vehicle type. |
| 267 | Admin · business setting / Bid Ride Settings | correct this | Bid ride settings: "Driver Bid Range From Recommended Price" was really the Rs step per tap (now labelled so, with Rs sign); sections say where each applies (driver = outstation bidding, user = city "Offer your fare"); every "How it works" explains its own field; preview showed "$"; values checked before saving (0-100 %, step > 0). |

## 2. Checked - already fine / fixed earlier / by design (46)

| # | Where | Bug (sheet) | What was done |
|---|---|---|---|
| 1 | Admin · login | Remove terminal access | No terminal access exists on the admin login. |
| 3 | Admin · login | password field --> add two eye option | Password eye toggle exists. |
| 4 | User · login | page is shifted at left side | Shared login page is centred (max 420px column, centred); on desktop the left brand panel + right form is by design. No shift found in code. |
| 5 | User, Driver · login | country code should be aligned with entered phone no. | +91 is inline with the number on the shared login. |
| 11 | User · home | location --> showing default location --> 55 hashmath gunj.... | Fixed earlier (default Pipliyahana location removed). |
| 12 | Driver · login | contact support --> driver care no & support email --> box is getting out of page | Driver support page is the CMS support page; long email wraps. |
| 16 | Admin · support management / Support Tickets | not showing driver ticket (raised at the time of registration pending for review) | Pending driver's "Contact Support" opens the support chat (works while pending) and shows in admin Chat. |
| 19 | Driver | driver not get ride request | Ride request flow was tested end-to-end earlier. |
| 20 | Admin · driver management / Approved Drivers | Today Selfie --> text is getting out of box | Hello Parth list has a small selfie thumbnail, not a text box. |
| 21 | User · profile | showing default rating(remove rating if not needed) | Profile shows real rating or a dash (no default). |
| 25 | Driver · profile | there is no way to reupload expire documents(camera is not clickable) | Re-upload button exists on every document; expiry modal now also blocks past dates. |
| 26 | User | drop location should show according to near pickup location | Fixed earlier (nearby-first suggestions). |
| 27 | Driver | should show pop up for minimum wallet amount needed for coming ride request | Driver home already shows a wallet card "Top up to go online - keep your wallet at or above Rs X" with a Top up button, and Go online shows the same message. |
| 29 | Admin · Bus service / Fleet Manager | add new bus --> Route Assignment --> Distance / Duration --> unable to enter Distance / Duration | Distance/duration inputs are editable (and auto-filled on save). |
| 31 | Driver · login | remove --> staff, center section(if not needed) | Staff / service-center roles were removed earlier; login only has Taxi/Owner/Pooling/Bus. |
| 34 | User · Bus Bookings | not showing bus | User bus search code is fine (matches the route cities offered in the suggestions, active schedules for that weekday). Needs real bus data to check why a bus was missing. |
| 38 | Admin · admin management / Admins | add --> Credentials --> Password & Confirm Password --> add two eye option | Sub-admin password form has the eye toggle (Global admin). |
| 41 | Admin · dashboard | universal search is not working | Header search works (it searches sidebar pages). |
| 43 | Admin · dashboard | all cards should be clickable | Every dashboard card that has a destination is clickable. |
| 49 | Admin · price management / zone | Add Market Zone --> language filter going out of section | Zone language tabs already scroll inside their card. |
| 57 | User · driver reached destination | driver vehicle detail --> showing default rating | Driver rating shows real value or "New". |
| 60 | Admin · Trip Requests | page showing --> Network error or server down | Trip Requests page code and server query are fine (paged). "Network error or server down" is the generic message when the server does not answer at all. Added a Retry button and a hint on that error. |
| 67 | Driver · ride request | should show full pickup location | Driver request screen shows the full pickup (wraps). |
| 71 | Admin · Support Tickets | not showing tickets | Admin support tickets list is wired (needs live data to confirm). |
| 76 | User · rides | not showing online payment ride history | User ride history has no payment filter (online-paid rides are normal rides and are listed). Nothing to fix in code. |
| 78 | User | ride complete page --> click on go to login page --> it redirect to landing page remove this | Ride complete has no "go to login" button; its buttons go to the Taxi home. |
| 103 | Driver · home | today's summary --> showing wrong earning | Driver earnings = sum of ride driver-earnings (code checked). |
| 109 | Admin · bus service / bus Bookings | not showing Passenger Bookings | Bus "Passenger Bookings" lists bookings of the selected bus/date/schedule. |
| 140 | Bus | should show bus profile | Separate bus driver profile not needed: bus drivers are created by admin (no self sign-up / documents), and Home already shows driver name + phone, bus name + number, route, seat fare and capacity, with Logout in the bottom bar. |
| 157 | User · apply coupon | should show correct validation | Booking-screen coupon validation already returns specific reasons (expired, minimum trip amount, usage limit, wrong zone, first-time only ...). |
| 170 | Owner · login | when enter phone no. filed overlap get started button | Partner login was redesigned (form in normal page flow, no fixed "Get Started" button), so the phone field cannot sit over a button. |
| 175 | Owner · owner management / Manage Owners | pending --> there is 2 back button remove 1 | Pending owner details has a single Back button in Hello Parth (the header back is not shown). |
| 182 | Owner · manage driver | add driver --> driver detail form --> register driver --> showing salaryvalue not defined(unable to register) | Server and form both define the salary value now (backend lint is clean); no undefined variable left. |
| 192 | User · home | what do you need today --> all services book button colour should be dark | Ride/Delivery buttons are dark in the light theme (white only in dark theme, by design). |
| 197 | User · profile | when log out -->should show confirmation first then log out | Logout confirm dialog was added in an earlier session. |
| 199 | Admin · Dashboard / SOS Terminal | all cards should be clickable | SOS terminal incident cards are clickable (no separate stat-card links exist). |
| 200 | Admin · Dashboard / SOS Terminal | all three dot not clickable | SOS terminal has no three-dots menus in Hello Parth. |
| 208 | Admin · promotion management / Push Notifications | sent push notification --> then should show all sended notification | Broadcast history popup exists. |
| 213 | Admin · price management / app module | created app module --> not showing | New app modules show after the 30 s public cache. |
| 219 | Admin · bus service / Bus Commission | search icon & text should be aligned | Search icon padding is correct in the built CSS. |
| 229 | Admin · ONGOING REQUESTS | search & filter is not clickable | Ongoing requests search and filter handlers exist and are wired. |
| 234 | User | subscription flow is not working | Customer subscription purchase (wallet) and ride coverage exist in code. |
| 243 | Admin · Driver management / Subscription | all toggles only able to on & off automaticaly when other toggle on | Three mode switches are one-of-three by design (note: driver subscription mode is not read anywhere in the backend yet). |
| 265 | Admin · Languages | action coloum edit is not working | Languages edit works (create/update were tested earlier). |
| 266 | Admin · Languages | add Languages button is not clickable | Languages "Add" button works. |
| 268 | Admin · business setting / Bid Ride Settings | how it's work is not clickable | Bid ride "How it works" buttons did open the explainer; one field showed a generic text - all texts rewritten under #267. |

## 3. Skipped - need your decision (10)

| # | Where | Bug (sheet) | What was done |
|---|---|---|---|
| 39 | Subadmin | trip request --> should show assigned zone requests only | Sub-admins in Hello Parth have no zone assignment; adding zone-scoped trips = new flow. |
| 52 | Driver | not ringing ride request alert | In-app ring works (sound unlocked on first tap, beep fallback, vibration). Ringing while the app is closed / screen off must come from the Flutter app (driverOrderAlert handler / FCM sound) - not in this repo. |
| 55 | User | all pages should be auto updated | Too general ("all pages should be auto updated") - tell me which screens should refresh by themselves. |
| 81 | User · sharing car(pooling) | remove the higlighted icon | Needs the screenshot (prnt.sc link in the sheet) to know which pooling icon is "highlighted" - please tell me which icon. |
| 87 | User · sharing car(pooling) | step - 3 --> remove this icon if not needed | Same: needs the screenshot to know which icon on pooling step 3 to remove. |
| 89 | User · sharing car(pooling) | correct the position of icon | No screenshot and no screen named - which pooling icon is in the wrong position? |
| 164 | Driver · profile / emergency sos  | add new --> pick from phone contact is not clickable | Driver SOS "pick from phone contacts": the app runs inside the Flutter web view, where the browser contact picker does not exist; it needs a native contact-picker handler in the Flutter app (not in this repo). Manual entry works; the dead button is replaced by a hint. |
| 189 | Owner | all pages have refresh option | Not clear: "all pages have refresh option" - should pull-to-refresh be removed, or added to every owner page? |
| 190 | Owner | when no internet should not show webpage not available | "Webpage not available" is the Android web-view error shown when the app loads with no internet (before any app code runs). Needs an offline screen in the Flutter app (or an offline app cache, which would also change Food). |
| 246 | Driver | there is no way to subscribed subscriptions | Driver app has no way to buy a subscription; building it = new feature. |

## 4. Still to do - not checked yet (0)

Continue from here (nothing in this list has been touched):

| # | Where | Bug (sheet) |
|---|---|---|


## 5. Not in Hello Parth (72) - ignored on purpose

Agent app / agent QR / agent bookings (#90-#102, #107, #108, #110-#113, #115-#122, #124-#129, #135, #255-#257), Rental (#216-#218, #270-#272), Spiritual trips (#142-#148), Explore India (#48, #210, #211), Banner image (#47, #209), Centralized Bookings (#104-#106, #204), CMS landing "report engine" (#269), user scan-agent-QR (#194), bus QR scanner screen (#131, #155), a blank row (#203), and a few others that refer to screens Hello Parth does not have (#2, #6, #7, #9, #37, #42, #196, #205).

## 6. Things you must know

- **New files - run `git add` on them** (VS Code only commits tracked files):
  `Backend/src/modules/taxi/services/adminAlertService.js`,
  `Frontend/src/modules/Taxi/shared/hooks/useBodyScrollLock.js`,
  `Frontend/src/modules/Taxi/shared/hooks/useTypingFocus.js`,
  `Frontend/src/modules/Taxi/shared/utils/inputFormats.js`,
  `Frontend/src/modules/Taxi/shared/utils/clockTime.js`,
  `Frontend/src/modules/Taxi/modules/admin/components/ui/RowActionMenu.jsx`,
  `Backend/src/modules/taxi/services/scheduledRideReminderService.js`.
- **Backend restart needed** (new routes: `GET /admin/pending-requests`, `PATCH|DELETE /admin/{driver|user}-subscriptions/plans/:id`; ride model got `stops`, `pricingSnapshot.service_tax`, `driverReminderSentAt` and `waitingCharge` (pickup waiting is now added to the fare at trip start); new 15-min scheduled-ride reminder job starts with the socket server; old rides simply have no tax % and show the total only).
- Admin notification push uses the existing admin FCM tokens (same as Food admin); if no admin device is registered, only the in-panel bell/toast works.
- Owner support chat is not supported by the backend chat (only user/driver) - sheet #16/#168 area; not changed.
- Test data: none was created or deleted. The main database was not touched.
