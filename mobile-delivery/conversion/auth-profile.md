# Group auth-profile — conversion report

Checks (from `mobile-delivery/`): `node scripts/check-converted.cjs` on all 19 files → **0 problems**;
`npx eslint` → **0 errors** (3 warnings in SignIn.jsx: unused `catch (e)` / `storageError` names kept from the web);
`node scripts/check-raw-text.cjs` → 0 problems.

## 1. Files converted (web `Frontend/src/<path>` → `mobile-delivery/src/<path>`)

| File | Notes / what is not 1:1 |
|---|---|
| `modules/DeliveryV2/pages/auth/SignIn.jsx` (login + `/otp`) | Same state, API calls, timers (resend 59 s, block timer, sessionStorage keys), restore popup, pending/rejected block, name step. Waves = react-native-svg paths (same viewBox/paths; the CSS `drop-shadow` filter on the waves is not drawn). "Delivery Partner" gradient text = SVG `<Text>` with a gradient fill (Sora 800). The iOS "keyboard keeper" hidden input is not needed natively (removed). OTP boxes: per-box refs + an `otpRef` mirror of the 4 values (no stale closures), multi-digit paste/SMS autofill fills from the box, keyboard dismissed after the last digit, on a wrong code the boxes are cleared and the first box is re-focused (blur+focus so Android reopens the keyboard); no OTP hard-coded. `/login` and `/otp` are two stack screens here: the pencil / "Back to login" / restore-popup close go **back** to the login screen under the code screen (web: `replace`/push to `/food/delivery/login`) so no second login screen is stacked; `usePhoneFocusRequest` is re-armed each time the login screen regains focus so the pencil still puts the cursor in the number box. Framer step slide = Animated (opacity + x ±20, 300 ms). |
| `pages/auth/SignupStep1.jsx` | Same validation/sanitising/session save. `<select>` vehicle type → bottom `Sheet` with the same 4 options. |
| `pages/auth/SignupStep2.jsx` | Camera/Gallery via `pickImage({ source })`; same prepare → save → preview flow; FormData parts `{ uri, name, type }`; same register / completeProfile branching and `finalizeDeliveryPendingSubmission`. Picker failure shows the web picker's toast text ("Could not open camera/gallery…"). |
| `pages/auth/VerificationPending.jsx` | Same poll (15 s) of `POST /food/auth/delivery/pending-status`; `document.visibilityState` / `focus` → `AppState`. Clip-path "REJECTED" tag = SVG polygon. |
| `utils/deliveryOnboardingStorage.js` | Every export and session key kept. Files are `{ uri, name, type, size }`; the IndexedDB store "DeliveryOnboardingFiles" is a folder in the app's document directory (`<docType>-<time>.<ext>`, new name per save so the image cache never shows an old photo) + in-memory copy; shrinking = `shrinkImage` (1600 px, 0.82; kept only when smaller and ≤ 1.5 MB; files ≤ 400 KB untouched; 8 s timeout); previews = the file uri (no blob URLs). Legacy `deliverySignupDocs` data-URL migration writes the base64 to a cache file. |
| `pages/TermsAndConditionsV2.jsx`, `PrivacyPolicyV2.jsx`, `CMSHelpSupportPage.jsx` | Copied unchanged (they only render the already-converted `CMSPage`). |
| `pages/NotificationsV2.jsx` | Same merge of local + broadcast inbox, mark read, clear all; list = FlatList. |
| `pages/ProfileV2.jsx` | Rendered inside DeliveryHomeV2's Profile tab. Own vertical `ScrollView` (`nestedScrollEnabled`) with `paddingBottom: useBottomNavSpace()`; no DeliveryBottomNav. Profile + referral stats load each time `useDeliveryTabActive()` turns true (old data stays, no spinner on revisit); popups close when the tab is hidden. Popups = `Dialog`; the "Type DELETE" dialog rises by the keyboard height (`useKeyboardOffset`). The web's unused `handleShareReferral` (no button calls it) is not carried over; balance-warning popup kept (web never opens it either). |
| `pages/profile/ProfileDetailsV2.jsx` | Same fetch (profile + wallet), photo upload/remove, vehicle and bank (incl. UPI QR) forms, document viewer. Pickers → `pickImage`. Vehicle-type `<select>` → `Sheet`. Fullscreen viewer → `Overlay`. `backdrop-blur` header → near-opaque white bar. |
| `pages/profile/MyReviewsV2.jsx` | Same; skeleton → `Skeleton`; list → FlatList. |
| `pages/profile/ProfileBankV2.jsx` | Same (named export only, like the web). |
| `pages/profile/ProfileDocsV2.jsx` | Same; viewer → `Dialog`. The thumbnail's CSS `grayscale` filter is not reproduced (opacity 0.5 kept) — expo-image has no grayscale. |
| `components/BottomPopup.jsx` | Native `Sheet` (Modal): same props; handle tap collapses (120 px) or closes (`closeOnHandleClick`); swipe-down on the handle/header area (PanResponder, > 100 px closes, spring back otherwise); content in `KeyboardAwareScrollView`; `maxHeight` "86vh"/"85vh" parsed to px. |
| `pages/help/SupportTicketsV2.jsx`, `CreateSupportTicketV2.jsx`, `ViewSupportTicketV2.jsx`, `ShowIdCardV2.jsx` | Same API calls/texts. Create: the two `<select>`s → one `Sheet`. ID card: display only (the web has no export/print either). |

Theme: delivery recolouring applied (orange/green/blue 500/600 → `#15498B`, 50 tints → `#E7EFFA`, borders → `#C3D0E1`, `bg-[#121212]` → 160° gradient, rounded-2xl/3xl cards → `#D1DCEB` border + soft shadow, h1–h4/font-black/extrabold → Sora, login legal footer → Poppins). Spinners: `Loader2` rotated with Animated (or ActivityIndicator where the web drew a CSS border spinner).

## 2. Screens, guards, API calls

| Route | Guard | API |
|---|---|---|
| `/food/delivery/login`, `/food/delivery/otp` (SignIn) | authRoute (guest; signed-in → /food/delivery) | `deliveryAPI.sendOTP(phone, "login"/purpose)`, `deliveryAPI.verifyOTP(phone, otp, purpose, name, fcmToken, platform, confirmAction)` |
| `/food/delivery/signup/details` (SignupStep1) | authRoute | none (sessionStorage) |
| `/food/delivery/signup/documents` (SignupStep2) | authRoute | `deliveryAPI.register(formData)` or `deliveryAPI.completeProfile(formData)` (multipart) |
| `/food/delivery/pending-verification` | publicRoute | `POST /food/auth/delivery/pending-status` (apiClient, contextModule delivery) + FCM sync helpers |
| `/food/delivery/terms`, `/privacy`, `/help/content`, `/profile/terms`, `/profile/privacy` | public / per route file | CMS endpoints `ADMIN.TERMS/PRIVACY/SUPPORT_DELIVERY_PUBLIC` (via CMSPage) |
| `/food/delivery/notifications` | protected | `useNotificationInbox("delivery")` (notification inbox API) + local store |
| `/food/delivery/profile` (ProfileV2 inside DeliveryHomeV2) | DeliveryTabRoute (protected) | `deliveryAPI.getProfile`, `getReferralStats`, `logout`, `authAPI.logoutFromAllDevices("delivery")`, `authAPI.deleteAccount("delivery")` |
| `/food/delivery/profile/details` | protected | `getProfile`, `getWallet`, `updateProfileMultipart` (profilePhoto), `updateProfileDetails` (profilePhoto "" / vehicle), `updateBankDetailsMultipart` |
| `/food/delivery/profile/reviews` | protected | `getMyReviews({ limit: 200 })` |
| `/food/delivery/profile/bank` | protected | `getProfile`, `updateProfileDetails` |
| `/food/delivery/profile/documents` | protected | `getProfile`, `updateProfileMultipart` |
| `/food/delivery/help/tickets`, `/create`, `/:ticketId` | protected | `getSupportTickets`, `createSupportTicket`, `getSupportTicketById` |
| `/food/delivery/help/id-card` | protected | `getProfile` |

## 3. Web-only APIs replaced

`<input type=file>` / `openCamera` / `openGallery` → `pickImage` (`@/lib/media`); canvas / `createImageBitmap` / `new File` / Blob / IndexedDB / `URL.createObjectURL` → `shrinkImage` + `expo-file-system` (`File`, `Directory`, `Paths.document`); `scrollIntoView` / viewport keyboard tricks → `KeyboardAwareScrollView` / `useKeyboardOffset`; `document.visibilityState` + `focus` → `AppState`; `document.body.style.overflow` locks → not needed (Modals); `<select>` → `Sheet`; fixed overlays → `Dialog` / `Sheet` / `Overlay`; framer-motion → Animated; CSS clip-path / SVG waves / gradient text → react-native-svg; `navigator.clipboard` paste handler → TextInput multi-digit change handling.

### Keyboard (every input screen)

| Screen | Handling |
|---|---|
| SignIn — phone, OTP boxes, name | whole page in `KeyboardAwareScrollView` (content centred, `extraOffset` 96 on the phone step / 120 on the OTP step so the Log in / Verify button under the field stays visible); keyboard dismissed after the 4th digit |
| SignupStep1 (10 fields + address textarea) | `KeyboardAwareScrollView` |
| ProfileV2 — "Type DELETE" in the delete dialog | dialog lifted by `useKeyboardOffset()` |
| ProfileDetailsV2 — vehicle popup, bank popup (6 fields) | BottomPopup content is a `KeyboardAwareScrollView` inside the Sheet (Sheet's own KeyboardAvoidingView) |
| ProfileBankV2 (edit mode) | `KeyboardAwareScrollView` |
| CreateSupportTicketV2 (subject, description) | `KeyboardAwareScrollView` |
| No search inputs in this group. |

Web test buttons kept: none exist in these files.

## 4. Imports of other groups' files missing when finished

None. (Shell files used: `hooks/useDeliveryBackNavigation`, `useCloseOnBack`, `useDeliveryOnboardingExitGuard`, `deliveryTabPages`.)

## 5. Status

Every screen above: **Built, not tested** (the app was not run).

## 6. Blocked / notes for the integrator

- **ProfileV2 scrolls itself** (vertical ScrollView, flex 1). DeliveryHomeV2 (home-orders group) should render `<ProfileV2 />` in a flex container for the profile tab, **not** inside another vertical ScrollView (the web had it inside the home's `overflow-y-auto` div with `pt-[120px]`); if home keeps its 120 px top offset, a plain `View` with that paddingTop around ProfileV2 is enough.
- The default avatar `/assets/images/profile_avatar.webp` is loaded from the asset host (`https://helloparth.in/...` via AppImage) — mobile-delivery has no bundled copy (mobile-driver has `assets/public/images/profile_avatar.webp`); bundling it would make it offline-safe (shell/assets, not mine).
- After a successful OTP verify the web does `navigate("/food/delivery", { replace: true })` from `/otp`; natively the login screen stays under it in the stack (AuthRedirect on it then redirects if reached). Worth a look at integration that Back from the Feed does not land on the login screen.
- No backend change or credential needed.
