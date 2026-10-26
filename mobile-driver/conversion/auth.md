# Group: auth — conversion report

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-driver/src/…`) | By |
|---|---|---|
| `modules/Taxi/modules/driver/pages/registration/BusSignupBuilderPage.jsx` | same path | this agent |
| `modules/Taxi/modules/driver/pages/registration/RegistrationStatus.jsx` | same path | this agent |
| `.../driver/components/auth/AuthShell.jsx`, `RolePicker.jsx` | same paths | earlier agent |
| `.../registration/LanguageSelect.jsx`, `DriverWelcome.jsx`, `PhoneRegistration.jsx`, `OTPVerification.jsx`, `RoleSelection.jsx`, `RoleSpecificOnboarding.jsx`, `StepPersonal.jsx`, `StepReferral.jsx`, `ApplicationStatus.jsx` | same paths | earlier agent |
| `shared/components/OnboardingExitModal.jsx` | same path | earlier agent |

### BusSignupBuilderPage (`/taxi/driver/role-signup/bus-builder/*`)
- The same signup API object as the web (the bus draft is kept in the registration session `roleDetails`, with no server calls), the same `BusServiceManager` props (`basePath`, `badgeLabel`, title, description, `emptyLabel`, `defaultStatus="draft"`), and "Back To Signup" → `/taxi/driver/role-signup`.
- The web document scrolled as a whole, so the header and `BusServiceManager` sit in one vertical ScrollView (`keyboardShouldPersistTaps="handled"`). **Integration check:** if the bus-owner group's BusServiceManager has its own vertical ScrollView or FlatList at its root, it will be nested inside this one. In that case, wrap it the same way their `OwnerBusServicePage` does.

### RegistrationStatus (`/taxi/driver/registration-status`, `/taxi/owner/registration-status`)
- All logic is kept: role/token from `location.state` → `persistDriverAuthSession`, the push-token flush, document templates, the 2.5 s approval poll with the same redirects (approved → owner home / bus-home / driver home; no token, 401, 404 or non-partner 403 → `clearDriverAuthState()` + `/taxi/driver/login`), the RechargeKit auto-checks, and the checklist states.
- **Poll only while focused** (`useIsFocused`). On the web, Contact Support or Fix Document unmounted this page. The native stack keeps it mounted, and without this a background poll would navigate away from the chat or documents page. Coming back re-runs the effect, like a remount.
- `syncPushTokens`: `window.__flushNativeFcmToken` is installed by the app's FCM bridge (same as OTPVerification). The browser `__registerBrowserFcmToken` does not exist in the app, so it was dropped.
- The sticky bottom card is a fixed bar above the navigation inset. The scroll content gets its measured height as end padding. There is no backdrop blur (white/95 instead).
- `checking` / `statusMessage` are kept as state but never shown, same as the web.
- Plus Jakarta Sans via `FontScope`; the title uses Outfit, as on the web. "Fix Document" (`bg-slate-900`) uses the partner blue. animate-pulse on the clock and the fade-in partner card are kept.

## 2. Routes / guards / API
- Bus builder: signup flow (registration session). It makes no API calls.
- Registration status: `getDriverApprovalStatus()` every 2.5 s, `getDriverDocumentTemplates(role)`, and `verifyDriverPan/Gstin/Rc/Bank/LicenseDocument(key…)`. It navigates to `<prefix>/documents` (state `focusDocumentKey`, `fromRegistrationStatus`) and to `<prefix>/support/chat` (state `backPath`, `backState`).

## 3. Web-only APIs replaced
framer-motion → Animated, CSS gradient → expo-linear-gradient, `<img>` → AppImage, `window.__registerBrowserFcmToken` → none in the app.

## 4. Missing imports of other groups
- `src/modules/Taxi/modules/admin/pages/bus-service/BusServiceManager.jsx` (group **bus-owner**) was not there when I finished. BusSignupBuilderPage imports it (default export), so `check-converted` / eslint report this one unresolved import until that file lands.

## 5. Status
BusSignupBuilderPage, RegistrationStatus: `Built, not tested`.
`check-converted`: RegistrationStatus has 0 problems. BusSignupBuilderPage's only problem is the missing BusServiceManager import above. eslint: same, with no other errors or warnings.

## 6. Blocked
Nothing, apart from the bus-owner file above.
