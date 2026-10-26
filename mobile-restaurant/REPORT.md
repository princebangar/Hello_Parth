# Hello Parth Restaurant Partner — native app report (27 Oct 2026, update 2)

## Kya ho gaya
- Web ka restaurant partner app (`/food/restaurant/*`) poora Expo / React Native me convert: `mobile-restaurant/`.
- Package `com.helloparth.restaurant`, naam "Hello Parth Restaurant Partner", logo `Downloads/Hello Parth/Restaurant Partner Apk Logo.png`.
- Splash: maroon `#66001D`, wordmark, soft roshni me dhakkan wali thaali — jaate waqt dhakkan uthke fade hota hai aur bhaap wali dish dikhti hai, tagline COOK · SERVE · GROW (dish ke neeche).
- Signed release: `releases/HelloParth-Restaurant-1.0.0.apk` (v2 signature OK, 29/29 arm64 libraries). Keystore
  `C:/Users/Prince/.helloparth/helloparth-restaurant-upload.jks` (password README ke saath), SHA-1
  `5F:45:4C:9D:EA:25:D3:C1:0E:A3:9F:F8:12:AE:FA:F5:F6:7C:02:03`.

## Checks
- Routes: 56, missing 0 · web ke 59 components, app me na hon: 0
- Links: 96 path, unmatched 0 (6 haath se dekhe — sab theek)
- Raw text crash scan: 0 · check-converted: 249 files, 0 problems · eslint: 0 errors
- Phone (Redmi 9): splash record kiya; login ke baad 38 pages deep link se khole — 0 crash, 0 JS error.

## Phone sweep me mila aur theek kiya
- `/reviews` pe bottom bar "Orders" highlight karta tha (web me bhi) → ab Feedback highlight hota hai (`/menu` → Inventory, `/settings` → Explore bhi).
- Back / Save pe neeche wala page dobara khul jaata tha (stack badhta tha) → ab seedha wapas jaata hai.
- OutletInfo aur Ratings page se unsplash stock photos hataye (no sample pictures).
- Build: `index.js` me delivery app ka background-location import reh gaya tha → hataya.

## 27 Oct — aapke faisle wale kaam + naye fixes
1. **Ratings page**: "4.0" hata diya → asli rating + kitni ratings (backend se). Rating nahi hai toh "NEW".
2. **DaySlots**: Save ab chalta hai.
3. **FSSAI**: photo upload + number + expiry backend me save. **Phone numbers**: restaurant page number aur 2 order
   reminder number backend me save (OTP wala popup nahi khulta).
4. **Ring (app band ho tab)**: backend `RINGING_CHANNELS` me `restaurant_orders` add kiya.
5. **Blink**: tab badalne pe / page khulne pe jo white blink thi (web wale fade-in animations) — sab hata diye; status bar
   ke icons bhi tab ke saath hi badalte hain.
6. **Logout**: turant login screen, backend logout peeche chalta hai. ("Logout from all devices" abhi bhi API ka wait
   karta hai.)
7. **Closed vs toggles**: outlet timing ke bahar navbar "Closed" dikhata tha aur status page pe dono switch ON. Ab status
   page bhi "Closed now · opens at …" dikhata hai aur switch off dikhte hain; on karne pe Outlet timings wala popup.
   Opening time pe orders apne aap shuru (jaise pehle).
8. **Inventory**: last item ka switch "+ Add item" / "Menu" ke peeche nahi chhupta.
9. **Splash**: neeche wali counter line hata di (half screen jaisa lagta tha), dish ab beech me soft roshni me; wordmark
   ab 0.9 s me smooth bada hota hai (pehle ~70 ms me jhatka).

**Backend deploy chahiye** (warna 3 aur 4 server pe kaam nahi karenge): `Backend/src/core/notifications/firebase.service.js`,
`Backend/src/modules/food/restaurant/models/restaurant.model.js`, `.../services/restaurant.service.js`.

## Abhi bhi web jaisa
- **Hyperpure**: "This page is under development".
- FSSAI me PDF upload ka option nahi (sirf camera / gallery).

## Phone pe check karna (Built, not tested)
1. Install: purana web wala "Hello Parth Restaurant Partner" APK ho toh pehle uninstall karo, phir `releases/HelloParth-Restaurant-1.0.0.apk` file manager se.
2. Login (OTP 1234) → Orders home. Header ka Open/Closed switch dabao → status badalna chahiye.
3. Naya order (user app se ek test order): app khula / background / screen off pe ring + accept-reject popup. Accept → Preparing → Ready → handover.
4. Orders → "Full History" → date range calendar → order detail → bill PDF share.
5. Inventory: item on/off, "Add item" / edit item me photo (camera + gallery), keyboard input ke upar rahe.
6. Menu categories: add / edit category.
7. Explore → Outlet info, Outlet timings (time picker), Edit cuisines, FSSAI, Bank details, Edit profile, Address (map pe pin drag + search), Zone setup (map) — har form me keyboard input ko na chhupaye.
8. Earnings / Hub finance: Withdraw popup keyboard ke saath, "Get report" PDF.
9. Feedback: Complaints / Reviews swipe, upar-neeche scroll pe swipe na ho.
10. Dining reservations: kai photos ek saath upload.
11. Support: ticket banao.
12. Bottom bar: Orders / Inventory / Feedback / Explore tap → turant switch, koi khaali ya purana page nahi; Back turant.
13. Log out (Explore) → popup turant band, login screen; login screen pe khaali number + Back → app band.
14. Splash: wordmark smooth bada ho, koi line na dikhe, dhakkan uthke fade ho.

Kuch bhi commit / push nahi kiya.
