# Conversion report — group `auth`

Status of every screen: **Built, not tested** (no app run, no phone). Checks: `node scripts/check-converted.cjs` -> 10 files, 0 problems; `npx eslint` -> 0 errors, 0 warnings.

## 1. Files converted

| Web (`Frontend/src/...`) | Native (`mobile-restaurant/src/...`) | Not reproduced exactly / why |
|---|---|---|
| `modules/Food/pages/restaurant/auth/Login.jsx` | same path | iOS "keyboard focus keeper" hidden input dropped (native focus opens the keyboard). Web `onPaste` / Ctrl+V handled by the multi-character `onChangeText` path (paste / SMS autofill). framer-motion step slide -> `Animated` (opacity + x ±20, 300 ms). The web's `navigate("/food/restaurant/login")` from the pencil and the restore popup's X goes **back** to the login screen under the code screen (`navigate(-1)`) so a second login screen is not stacked (same as the delivery app). |
| `modules/Food/pages/restaurant/auth/Signup.jsx` | same path | Desktop banner half (`lg:`) dropped. **The static "Demo Credentials" box (`+91 9876543210`, `OTP : 1234`) is NOT shown**: a hard-coded OTP / sample data (guide section 7 + Prince's no-sample-data rule). Prop `onChange` -> `onChangeText`. |
| `modules/Food/pages/restaurant/auth/ForgotPassword.jsx` | same path | Desktop banner half dropped. Calls `restaurantAPI.resetPassword(...)` exactly like the web — **that function does not exist in `restaurantAPI` (web or app)**, so step 3 always ends in the error box with the JS error text, same as the web. `restaurantAPI.sendOTP(null, ...)` also rejects ("Phone is required") on both. The screen is an old email/password flow nothing links to. Web `setInterval` countdown now also cleared on unmount. |
| `modules/Food/pages/restaurant/auth/VerificationPending.jsx` | same path | clip-path red arrow tag -> `react-native-svg` Polygon. "Allow Mail Notifications" stays in code but is hidden (as in the web app inside the wrapper: `isNativeAppWebView()` is true natively). |
| `modules/Food/pages/restaurant/Onboarding.jsx` | same path | see "Onboarding" below |
| `modules/Food/components/restaurant/PartnerRolePicker.jsx` | same path | Callback prop is `onValueChange` (the checker flags `onChange={`); the web name `onChange` is still accepted. |
| `modules/Food/components/restaurant/NewRoleConfirmDialog.jsx` | same path | fixed overlay -> native `Dialog` (tap outside / Back closes unless busy). |
| `modules/Food/pages/restaurant/PrivacyPolicyPage.jsx`, `TermsAndConditionsPage.jsx`, `CMSHelpSupportPage.jsx` | same paths | identical to the web (converted `CMSPage` + `useRestaurantBackNavigation`). |

### Onboarding (all 3 steps converted)
- Step 1: restaurant / store name, pure-veg pills, owner name / email / phone (read-only when verified), primary contact, location search, address line 1/2, landmark, area, City select (same 12 cities), state, pincode, auto service-zone box (loading / outside / zone name / hint states).
- Step 2: menu images (multi-pick, previews 2-column grid with remove + name caption), profile image (round preview + remove), cuisines chips (max `MAX_RESTAURANT_CUISINES`), opening / closing time, estimated delivery time, open days (7 cells), takeaway switch (hidden for My Store).
- Step 3: PAN number / holder name / image, GST yes/no + number / legal name / address / image, FSSAI number / expiry date / image, bank account / confirm / IFSC / account-type select / holder name.
- Header (X on step 1 / back arrow, "Restaurant onboarding" via `pw`, "STEP n OF 3", logout), footer Back / Continue / Finish, error line, `OnboardingExitModal`, `ImageSourcePicker`, `OnboardingSkeleton` while hydrating — all as on the web.
- Platform replacements:
  - `<input type=file>` + Flutter bridge -> `ImageSourcePicker` (camera / gallery, gallery multi-select for menu images). Files are `{ uri, name, type }`; `isUploadableFile` = an object with a local (non-http) `uri`. Final submit builds the same multipart `FormData` with `{ uri, name, type }` parts; the existing-profile path uploads through `uploadAPI.uploadMedia` like the web.
  - IndexedDB file store -> `sessionStorage` (app-session memory) under the prefix `RestaurantOnboardingFiles:`. Picked photos survive leaving and re-opening the screen inside one app session, not an app restart (the web kept them across page reloads; a picker cache file is not guaranteed to survive a restart anyway). The text data is still saved in `localStorage` exactly like the web (key `restaurant_onboarding_data[_<userId>]`).
  - Google Places Autocomplete widget -> `@/lib/google` `autocomplete` (biased to the centre of all service zones, country `in`) + `placeDetails` (same `parsePlace` fields). Drawn as the web's styled `.pac-container` list (red pin, bold main text). The Nominatim fallback list is kept (same request, `rankLocationResults`), and is shown only when Google returns no prediction (on the web the two dropdowns could overlap each other). Both lists are drawn **inline under the search box** (pushing the next inputs down) instead of absolutely over them: on Android an absolute child outside its parent cannot be tapped. "Click outside closes" -> the box losing focus closes the lists.
  - MUI `MobileTimePicker` (ampm, `hh:mm a`) -> `@react-native-community/datetimepicker` time dialog (Android) / spinner sheet (iOS); stored as `HH:mm` like the web.
  - Calendar popover (past dates disabled) -> date picker with `minimumDate = today`; label formatted "Oct 26, 2026" like `toLocaleDateString('en-US', …)`.
  - `window.scrollTo(0)` on step change -> scroll view `scrollTo({ y: 0 })`.
  - The `.pac-container` CSS, `URL.createObjectURL` previews, `visualViewport` keyboard inset -> native equivalents (preview = file uri; keyboard via `useKeyboardOffset`).

## 2. Screens, guards, API calls

| Route | Guard (route file) | API calls |
|---|---|---|
| `/food/restaurant/login` | `authRoute` (AuthRedirect module="restaurant") | `POST /food/auth/restaurant/request-otp` (restaurantAPI.sendOTP, with partnerType + confirmNewRole) |
| `/food/restaurant/otp` | `authRoute` | `POST /food/auth/restaurant/verify-otp` (verifyOTP with fcmToken, platform, confirmAction restore/new, partnerType); resend = request-otp; FCM save via `persistModuleFcmToken`; `checkOnboardingStatus()` (`GET /food/restaurant/current`) when onboarding is incomplete |
| `/food/restaurant/signup` | `authRoute` | `POST /food/auth/restaurant/request-otp` (purpose register) |
| `/food/restaurant/forgot-password` | `authRoute` | sendOTP / verifyOTP with `null` phone (reject client-side, as on web); `restaurantAPI.resetPassword` (missing, as on web) |
| `/food/restaurant/pending-verification` | `publicRoute` | `POST /food/auth/restaurant/pending-status` (pending ticket, every 15 s while in front + on return to front), `GET /food/restaurant/current` (with a session), pending FCM sync helpers |
| `/food/restaurant/onboarding` | `publicRoute` | `GET /food/restaurant/current`, `GET /food/zones/public`, Places autocomplete / details (Google), Nominatim search, `PATCH /food/restaurant/profile` (image removal + existing-profile submit), `POST /uploads/image` (existing-profile images), `POST /food/restaurant/register` (multipart), restaurant logout |
| `/food/restaurant/privacy`, `/terms`, `/help-content` | `publicRoute` | `GET /food/pages/privacy_restaurant`, `/food/pages/terms_restaurant`, `/food/pages/support_restaurant` (inside CMSPage) |

Redirects after login (all `replace`, exactly the web's targets): deleted account -> restore popup; pending / rejected -> `/food/restaurant/pending-verification` (state phone / isRejected / isDisabled / message); needs registration -> `/food/restaurant/onboarding` (`?type=store` for My Store); approved with incomplete onboarding -> `/food/restaurant/onboarding?step=N`; sign-up -> `/food/restaurant/onboarding`; else `/food/restaurant`. `hardNavigate` = `navigateTo(route, { replace: true })`.

## 3. Web-only APIs replaced
framer-motion -> Animated; lucide-react -> lucide-react-native; sonner -> `@/lib/toast`; `<img>` -> `AppImage`; SVG waves / pin -> react-native-svg; gradient classes -> expo-linear-gradient; `scrollIntoView` / `visualViewport` -> `KeyboardAwareScrollView` + `useKeyboardOffset`; `<input type=file>` -> `ImageSourcePicker`; IndexedDB -> sessionStorage; google.maps Places widget -> `@/lib/google`; MUI time picker / shadcn Calendar + Popover -> datetimepicker (+ `Sheet` on iOS); `fixed inset-0` popups -> `Dialog`; `document`/`window` focus + visibilitychange kept (webCompat); `<Link>` -> `@/lib/router` Link; `window.flutter_inappwebview` -> not needed.

## 4. Imports of other groups' files
None missing. Uses foundation / shell only (`@food/components/user/CMSPage`, `ImageSourcePicker`, `OnboardingExitModal`, `useOnboardingExitGuard`, `loading-skeletons`, ui `input` / `select`, `useKeyboardOffset`, `@/lib/google`).

## 5. Input screens and keyboard handling
| Screen | Inputs | Keyboard handling |
|---|---|---|
| Login (/login) | phone | `KeyboardAwareScrollView` (`extraOffset` 96 so the Log in button stays visible), page keeps its keyboard-closed height (`minHeight` = largest window height seen), red waves drawn inside the scroll content, `LoginExitGuard enabled={login step} dirty={phone.length > 0} accent="#B80B3D"`, title plain `#B80B3D` text, pencil refocus via `usePhoneFocusRequest` when the screen is focused again |
| Login (/otp) | 4 OTP boxes | same scroll view (`extraOffset` 120); values kept in `otpRef`; auto-focus first box after 300 ms; `Keyboard.dismiss()` after the last digit; wrong code empties the boxes and refocuses box 1 (blur + focus); `Keyboard.dismiss()` on unmount; no hard-coded OTP |
| Signup | restaurant name, phone, country select | `KeyboardAwareScrollView` (`extraOffset` 72 for the error line + button) |
| ForgotPassword | email; 6 OTP boxes; 2 password fields | `KeyboardAwareScrollView`; OTP boxes in a ref, keyboard dismissed after 6th digit, refocus box 1 on a wrong code |
| Onboarding | ~25 inputs in 3 steps (see above) | `KeyboardAwareScrollView` around the form (focused field scrolled above the keyboard); footer Back / Continue hidden while the keyboard is open (web parity: `keyboardInset ? hidden`); location suggestion lists inline so they stay in the scroll area; pickers close the keyboard first |
| VerificationPending, policy pages | none | — |

Test-only buttons kept: none exist in these web files (the Signup demo-credentials box is static text and was dropped, see above).

## 6. Blocked / for the integrator
- `@food/utils/onboardingUtils.clearAllFilesFromDB` (foundation) only deletes the web IndexedDB. Onboarding keeps picked photos under the sessionStorage prefix `RestaurantOnboardingFiles:`; Login and Onboarding clear that prefix themselves. Suggest adding the same prefix cleanup inside `clearAllFilesFromDB` so any other caller clears it too.
- `restaurantAPI.resetPassword` does not exist (web too) — ForgotPassword step 3 cannot succeed; backend/API decision, not changed.
- Nominatim (`nominatim.openstreetmap.org`) may rate-limit requests without a custom User-Agent; the web sent none either.

## 7. Check on a phone
1. Login: open keyboard on the number box — logo must not jump, waves move with the form, Log in button visible above the keyboard; Back with empty box closes the app, with digits shows "Exit the app?".
2. Role picker + "Create My Store account?" popup (number registered for the other role).
3. OTP: autofocus + keyboard, SMS autofill / paste, backspace across boxes, keyboard closes after 4th digit, wrong OTP -> "Invalid OTP" + box 1 focused with keyboard, resend timer 00:59, block timer box.
4. Pencil -> back on the number screen with the cursor in the box.
5. Each redirect: pending, rejected, banned, needs registration (restaurant and `?type=store`), incomplete onboarding `?step=N`, approved -> `/food/restaurant`.
6. Pending screen: auto-login on approval (15 s poll, and on returning to the app), rejected -> Re-apply, banned -> Contact Support.
7. Onboarding: every input above the keyboard (especially the bank fields at the bottom of step 3), location search (Google list, Nominatim list when Google empty, picking fills area/city/state/pincode/zone), time + date pickers, camera and gallery (menu multi-select), image previews + remove, the final multipart submit (register) and the existing-profile submit (PATCH + uploads), hardware Back = previous step / exit popup on step 1, logout.
