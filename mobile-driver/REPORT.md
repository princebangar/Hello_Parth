# Hello Parth Captain — native driver app report (26 Oct 2026)

## Kya ho gaya
- **APK:** `releases/HelloParth-Captain-1.0.0.apk` (71.8 MB). Package `com.helloparth.driver` hai, naam "Hello Parth Captain", version 1.0.0 (1).
  - `apksigner` se signature check kiya: v2 scheme verified.
  - SHA-1 `BF:72:DE:90:84:84:80:74:BD:9F:6F:5D:AD:46:C0:FB:58:7B:CF:E8` hai. Firebase / Maps key me restriction lagani ho to ye SHA-1 add karna padega.
  - arm64 native libs: 29/29.
  - Permissions APK me hain: background location, foreground service location, notifications, camera.
- **Screens:** web ke saare driver aur owner screens convert ho gaye, ek bhi stub ya placeholder nahi hai. Har group ki report `conversion/*.md` me hai, aur har screen ka status `CONVERSION_CHECKLIST.md` me.

## Section 7 ke checks (1–3)
| Check | Result |
|---|---|
| Route coverage (driver + owner + partner auth) | 97 routes, missing **0** |
| Web components `modules/Taxi/modules/driver/**` | 57 files, sab convert ho gaye ya use ho rahe hain, missing **0** |
| Dead links (`navigate` / `to=` literals) | 125 check kiye, asli unmatched **0**. Jo 1 flag hua woh Notifications ka template `${routePrefix}/home\|dashboard` hai, hath se check kiya, dono route maujood hain |
| `check-converted.cjs src` | 290 files, **0** problems |
| eslint src + `no-undef` | **0** errors. 39 warnings hain, zyada tar copy kiye gaye shared files me unused vars |
| Raw text inside View | 0 |
| `absoluteFillObject` / horizontal scroller ka `flexGrow: 0` | 0 problems (check-converted me covered) |

## Jo faisle maine khud liye
`DECISIONS.md` me 24 points hain. Sabse zaroori:
- **Point 11:** backend ride request ki push normal notification ki tarah bhejta hai. Isliye app poori tarah band ho to phone-call jaisi full-screen ringing nahi hogi, sirf notification aur alert sound aayega. Full-screen ringing ke liye backend ko data-only push bhejna padega. Backend read-only hai, isliye maine use nahi chheda.
- **Point 9 aur 20:** trip ke dauraan screen on nahi rehti, aur "Google Maps kholo" button bhi nahi hai, kyunki web me bhi nahi hai.
- **Point 18:** selfie 1280 px aur document photos 1600 px tak chhoti hoti hain, web jaisa (`expo-image-manipulator` add kiya).

## Abhi tak nahi hua / pata nahi
- Phone pe kuch bhi chala ke nahi dekha, kyunki phone connected nahi tha. Har screen "Built, not tested" hai.
- Active Trip: agar app cold start me seedha trip screen pe khule, to top-left back arrow kuch nahi karta, kyunki peeche koi screen nahi hoti.
- Web se chhote visual farak: sheets ke peeche blur nahi hai, kuch shadow nahi bane, BusServiceManager ka action bar sticky nahi hai (form ke end me hai). Har group ki report me ye likha hai.

## Phone pe check karna
1. **Install:** file manager se `HelloParth-Captain-1.0.0.apk` kholo → Install. Home screen pe "Hello Parth Captain" icon aana chahiye: kata hua ya zoom hua na ho. Kholte hi navy splash pe "Hello Parth Captain" dikhna chahiye.
2. **Login:** number daalo → OTP **1234** → driver Home khulna chahiye. Agar approval pending hai to Registration Status khulega.
3. **Online:** Home pe toggle → location permission me "Allow all the time" do. Notification me "You are online" aana chahiye. App background me karo aur screen off karo → admin / user side pe driver ki location update hoti rehni chahiye (har ~10 sec).
4. **Ride request, app khuli ho:** user app se ride book karo → popup + ringtone + vibration + countdown. Accept / Decline dono try karo.
5. **Ride request, app band ya background me:** notification aur sound aana chahiye, tap karne pe Home pe request khulni chahiye (full-screen ringing nahi aayegi, point 11).
6. **Trip:** Accept → Arrived → user ka OTP daalo → Start → Complete → payment screen → wallet / history me trip dikhni chahiye.
7. **Offline:** toggle off → "You are online" notification hatna chahiye.
8. **Wallet minimum:** wallet balance minimum se kam ho to Online hone pe web jaisa block aur message aana chahiye. Top-up (Razorpay) karke dekho.
9. **Bottom tabs:** Home / History / Wallet / Incentives / Profile pe tap karo. Tab turant badalna chahiye: white flash nahi, purana screen nahi dikhna chahiye. Back button bhi turant chalna chahiye.
10. **Layout:** har page pe dekho: upar status bar ke neeche kuch chhupa na ho, aakhri card bottom bar ke upar poora dikhe, keyboard input ko na dhake.
11. **Documents:** Profile → Documents (aur signup me Step Documents) → Camera / Gallery se photo upload karo → preview aur upload hona chahiye. Date fields me system calendar khulna chahiye.
12. **Owner:** owner number se login → Home / Dashboard, Manage Drivers (add / edit driver), Vehicle Fleet (add / edit vehicle), Wallet, Bus Service (bus banao: 4 step, seat layout), Bus Bookings.
13. **Bus driver:** bus driver login → Bus Home (trips, passengers, Account paid / unpaid) → Live Route: map pe bus chalni chahiye aur location jaani chahiye.
14. **Selfie:** daily selfie maange to front camera khulna chahiye aur upload hona chahiye.

Kuch commit ya push nahi kiya.
