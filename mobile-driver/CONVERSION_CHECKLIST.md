# Conversion checklist — Hello Parth Captain (driver app, web → Expo / React Native, Android)

Status words: **Verified** (ran it on a phone and saw it work) · **Built, not tested** (code written and statically checked, needs a phone test) · **Blocked** (cannot be done; reason given).
No phone was connected during this conversion, so nothing is "Verified".

## 0. Identity
| Item | Value |
|---|---|
| App name | Hello Parth Captain |
| Package | `com.helloparth.driver` (Firebase driver client from `google-services.json`) |
| Scheme | `helloparth-captain` |
| Version | 1.0.0 / versionCode 1 |
| Signing | `C:/Users/Prince/.helloparth/helloparth-captain-upload.jks` (password in CAPTAIN_KEYSTORE_README.txt next to it), SHA-1 `BF:72:DE:90:84:84:80:74:BD:9F:6F:5D:AD:46:C0:FB:58:7B:CF:E8` |
| Backend / socket / maps / payment | same as the web (see `.env` of the app; no secrets in the app) |

## 1. Routes (web `TaxiApp.jsx` driver + owner blocks + partner auth paths) — 96 routes, missing 0
| Web path | Screen | Route file | Group report | Status |
|---|---|---|---|---|
| `/taxi/driver` | DriverEntryRedirect | `src/app/taxi/driver/index.jsx` | shell | Built, not tested |
| `/taxi/driver/lang-select` | LanguageSelect | `src/app/taxi/driver/lang-select.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/welcome` | DriverWelcome | `src/app/taxi/driver/welcome.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/login` | PhoneRegistration | `src/app/taxi/driver/login.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/reg-phone` | PhoneRegistration | `src/app/taxi/driver/reg-phone.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/otp-verify` | OTPVerification | `src/app/taxi/driver/otp-verify.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/step-personal` | StepPersonal | `src/app/taxi/driver/step-personal.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/step-referral` | StepReferral | `src/app/taxi/driver/step-referral.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/step-vehicle` | StepVehicle | `src/app/taxi/driver/step-vehicle.jsx` | conversion/documents.md | Built, not tested |
| `/taxi/driver/step-documents` | StepDocuments | `src/app/taxi/driver/step-documents.jsx` | conversion/documents.md | Built, not tested |
| `/taxi/driver/registration-status` | RegistrationStatus | `src/app/taxi/driver/registration-status.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/status` | ApplicationStatus | `src/app/taxi/driver/status.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/home` | DriverHome | `src/app/taxi/driver/home.jsx` | conversion/home.md | Built, not tested |
| `/taxi/driver/bus-home` | BusDriverHome | `src/app/taxi/driver/bus-home/index.jsx` | conversion/bus-driver.md | Built, not tested |
| `/taxi/driver/bus-home/live-route` | BusDriverLiveRoute | `src/app/taxi/driver/bus-home/live-route.jsx` | conversion/bus-driver.md | Built, not tested |
| `/taxi/driver/select-role` | RoleSelection | `src/app/taxi/driver/select-role.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/role-signup` | RoleSpecificOnboarding | `src/app/taxi/driver/role-signup/index.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/role-signup/bus-builder/*` | BusSignupBuilderPage | `src/app/taxi/driver/role-signup/bus-builder/[...rest].jsx` | conversion/auth.md | Built, not tested |
| `/taxi/driver/terms` | LegalPage | `src/app/taxi/driver/terms.jsx` | shell | Built, not tested |
| `/taxi/driver/privacy` | LegalPage | `src/app/taxi/driver/privacy.jsx` | shell | Built, not tested |
| `/taxi/driver/legal/terms` | DriverLegalTerms | `src/app/taxi/driver/legal/terms.jsx` | shell | Built, not tested |
| `/taxi/driver/legal/privacy` | DriverLegalPrivacy | `src/app/taxi/driver/legal/privacy.jsx` | shell | Built, not tested |
| `/taxi/driver/legal/support` | DriverLegalSupport | `src/app/taxi/driver/legal/support.jsx` | shell | Built, not tested |
| `/taxi/driver/dashboard` | DriverHome | `src/app/taxi/driver/dashboard.jsx` | conversion/home.md | Built, not tested |
| `/taxi/driver/active-trip` | ActiveTrip | `src/app/taxi/driver/active-trip.jsx` | conversion/trip.md | Built, not tested |
| `/taxi/driver/chat` | Chat | `src/app/taxi/driver/chat.jsx` | shell | Built, not tested |
| `/taxi/driver/wallet` | DriverWallet | `src/app/taxi/driver/wallet.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/profile` | DriverProfile | `src/app/taxi/driver/profile/index.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/profile/bank-details` | DriverBankDetailsPage | `src/app/taxi/driver/profile/bank-details.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/settings` | DriverSettings | `src/app/taxi/driver/settings.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/history` | RideRequests | `src/app/taxi/driver/history.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/incentives` | DriverIncentives | `src/app/taxi/driver/incentives.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/edit-profile` | EditProfile | `src/app/taxi/driver/edit-profile.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/documents` | DriverDocuments | `src/app/taxi/driver/documents.jsx` | conversion/documents.md | Built, not tested |
| `/taxi/driver/notifications` | Notifications | `src/app/taxi/driver/notifications.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/payout-methods` | Navigate | `src/app/taxi/driver/payout-methods.jsx` | shell | Built, not tested |
| `/taxi/driver/referral` | Referral | `src/app/taxi/driver/referral.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/delete-account` | DriverDeleteAccount | `src/app/taxi/driver/delete-account.jsx` | shell | Built, not tested |
| `/taxi/driver/security` | SecuritySOS | `src/app/taxi/driver/security.jsx` | conversion/account.md | Built, not tested |
| `/taxi/driver/support` | DriverSupport | `src/app/taxi/driver/support/index.jsx` | shell | Built, not tested |
| `/taxi/driver/help-support` | DriverHelpSupportOptions | `src/app/taxi/driver/help-support.jsx` | shell | Built, not tested |
| `/taxi/driver/support/chat` | DriverSupportChat | `src/app/taxi/driver/support/chat.jsx` | shell | Built, not tested |
| `/taxi/driver/support/tickets` | SupportTickets | `src/app/taxi/driver/support/tickets.jsx` | shell | Built, not tested |
| `/taxi/driver/support/ticket/:id` | SupportTicketDetail | `src/app/taxi/driver/support/ticket/[id].jsx` | shell | Built, not tested |
| `/taxi/driver/vehicle-fleet` | VehicleFleet | `src/app/taxi/driver/vehicle-fleet/index.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/driver/vehicle-fleet/edit/:vehicleId` | VehicleFleet | `src/app/taxi/driver/vehicle-fleet/edit/[vehicleId].jsx` | conversion/owner.md | Built, not tested |
| `/taxi/driver/add-vehicle` | AddVehicle | `src/app/taxi/driver/add-vehicle.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/driver/manage-drivers` | ManageDrivers | `src/app/taxi/driver/manage-drivers.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/driver/add-driver` | AddDriver | `src/app/taxi/driver/add-driver.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/driver/edit-driver/:driverId` | AddDriver | `src/app/taxi/driver/edit-driver/[driverId].jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner` | DriverEntryRedirect | `src/app/taxi/owner/index.jsx` | shell | Built, not tested |
| `/taxi/owner/login` | PhoneRegistration | `src/app/taxi/owner/login.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/reg-phone` | PhoneRegistration | `src/app/taxi/owner/reg-phone.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/otp-verify` | OTPVerification | `src/app/taxi/owner/otp-verify.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/lang-select` | LanguageSelect | `src/app/taxi/owner/lang-select.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/step-personal` | StepPersonal | `src/app/taxi/owner/step-personal.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/step-referral` | StepReferral | `src/app/taxi/owner/step-referral.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/step-vehicle` | StepVehicle | `src/app/taxi/owner/step-vehicle.jsx` | conversion/documents.md | Built, not tested |
| `/taxi/owner/step-documents` | StepDocuments | `src/app/taxi/owner/step-documents.jsx` | conversion/documents.md | Built, not tested |
| `/taxi/owner/registration-status` | RegistrationStatus | `src/app/taxi/owner/registration-status.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/status` | ApplicationStatus | `src/app/taxi/owner/status.jsx` | conversion/auth.md | Built, not tested |
| `/taxi/owner/home` | OwnerDashboard | `src/app/taxi/owner/home.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/dashboard` | OwnerDashboard | `src/app/taxi/owner/dashboard.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/bus-service` | OwnerBusServicePage | `src/app/taxi/owner/bus-service/index.jsx` | conversion/bus-owner.md | Built, not tested |
| `/taxi/owner/bus-service/create` | OwnerBusServicePage | `src/app/taxi/owner/bus-service/create.jsx` | conversion/bus-owner.md | Built, not tested |
| `/taxi/owner/bus-service/edit/:id` | OwnerBusServicePage | `src/app/taxi/owner/bus-service/edit/[id].jsx` | conversion/bus-owner.md | Built, not tested |
| `/taxi/owner/bus-service/:id` | OwnerBusServicePage | `src/app/taxi/owner/bus-service/[id].jsx` | conversion/bus-owner.md | Built, not tested |
| `/taxi/owner/bus-bookings` | OwnerBusBookingsPage | `src/app/taxi/owner/bus-bookings.jsx` | conversion/bus-owner.md | Built, not tested |
| `/taxi/owner/profile` | DriverProfile | `src/app/taxi/owner/profile/index.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/profile/bank-details` | DriverBankDetailsPage | `src/app/taxi/owner/profile/bank-details.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/settings` | DriverSettings | `src/app/taxi/owner/settings.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/wallet` | OwnerWallet | `src/app/taxi/owner/wallet.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/history` | RideRequests | `src/app/taxi/owner/history.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/terms` | LegalPage | `src/app/taxi/owner/terms.jsx` | shell | Built, not tested |
| `/taxi/owner/privacy` | LegalPage | `src/app/taxi/owner/privacy.jsx` | shell | Built, not tested |
| `/taxi/owner/legal/terms` | DriverLegalTerms | `src/app/taxi/owner/legal/terms.jsx` | shell | Built, not tested |
| `/taxi/owner/legal/privacy` | DriverLegalPrivacy | `src/app/taxi/owner/legal/privacy.jsx` | shell | Built, not tested |
| `/taxi/owner/legal/support` | DriverLegalSupport | `src/app/taxi/owner/legal/support.jsx` | shell | Built, not tested |
| `/taxi/owner/edit-profile` | EditProfile | `src/app/taxi/owner/edit-profile.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/documents` | DriverDocuments | `src/app/taxi/owner/documents.jsx` | conversion/documents.md | Built, not tested |
| `/taxi/owner/notifications` | Notifications | `src/app/taxi/owner/notifications.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/payout-methods` | Navigate | `src/app/taxi/owner/payout-methods.jsx` | shell | Built, not tested |
| `/taxi/owner/referral` | Referral | `src/app/taxi/owner/referral.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/delete-account` | DriverDeleteAccount | `src/app/taxi/owner/delete-account.jsx` | shell | Built, not tested |
| `/taxi/owner/security` | SecuritySOS | `src/app/taxi/owner/security.jsx` | conversion/account.md | Built, not tested |
| `/taxi/owner/support` | DriverSupport | `src/app/taxi/owner/support/index.jsx` | shell | Built, not tested |
| `/taxi/owner/help-support` | DriverHelpSupportOptions | `src/app/taxi/owner/help-support.jsx` | shell | Built, not tested |
| `/taxi/owner/support/chat` | DriverSupportChat | `src/app/taxi/owner/support/chat.jsx` | shell | Built, not tested |
| `/taxi/owner/support/tickets` | SupportTickets | `src/app/taxi/owner/support/tickets.jsx` | shell | Built, not tested |
| `/taxi/owner/support/ticket/:id` | SupportTicketDetail | `src/app/taxi/owner/support/ticket/[id].jsx` | shell | Built, not tested |
| `/taxi/owner/vehicle-fleet` | OwnerVehicleFleet | `src/app/taxi/owner/vehicle-fleet/index.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/vehicle-fleet/edit/:vehicleId` | OwnerVehicleFleet | `src/app/taxi/owner/vehicle-fleet/edit/[vehicleId].jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/add-vehicle` | AddVehicle | `src/app/taxi/owner/add-vehicle.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/manage-drivers` | ManageDrivers | `src/app/taxi/owner/manage-drivers.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/add-driver` | AddDriver | `src/app/taxi/owner/add-driver.jsx` | conversion/owner.md | Built, not tested |
| `/taxi/owner/edit-driver/:driverId` | AddDriver | `src/app/taxi/owner/edit-driver/[driverId].jsx` | conversion/owner.md | Built, not tested |

## 2. Web components under `modules/Taxi/modules/driver/**` — 57 files
| Web file | In the app | Status |
|---|---|---|
| `components/auth/AuthShell.jsx` | `src/modules/Taxi/modules/driver/components/auth/AuthShell.jsx` | Built, not tested |
| `components/auth/RolePicker.jsx` | `src/modules/Taxi/modules/driver/components/auth/RolePicker.jsx` | Built, not tested |
| `components/BusDriverBottomNav.jsx` | `src/modules/Taxi/modules/driver/components/BusDriverBottomNav.jsx` | Built, not tested |
| `components/DriverLayout.jsx` | `src/modules/Taxi/modules/driver/components/DriverLayout.jsx` | Built, not tested |
| `components/DriverRideRequestListener.jsx` | `src/modules/Taxi/modules/driver/components/DriverRideRequestListener.jsx` | Built, not tested |
| `components/FleetDocumentFields.jsx` | `src/modules/Taxi/modules/driver/components/FleetDocumentFields.jsx` | Built, not tested |
| `driverTabPages.js` | `src/modules/Taxi/modules/driver/driverTabPages.js` | Built, not tested |
| `pages/ActiveTrip.jsx` | `src/modules/Taxi/modules/driver/pages/ActiveTrip.jsx` | Built, not tested |
| `pages/BusDriverHome.jsx` | `src/modules/Taxi/modules/driver/pages/BusDriverHome.jsx` | Built, not tested |
| `pages/BusDriverLiveRoute.jsx` | `src/modules/Taxi/modules/driver/pages/BusDriverLiveRoute.jsx` | Built, not tested |
| `pages/DriverBankDetailsPage.jsx` | `src/modules/Taxi/modules/driver/pages/DriverBankDetailsPage.jsx` | Built, not tested |
| `pages/DriverHome.jsx` | `src/modules/Taxi/modules/driver/pages/DriverHome.jsx` | Built, not tested |
| `pages/DriverIncentives.jsx` | `src/modules/Taxi/modules/driver/pages/DriverIncentives.jsx` | Built, not tested |
| `pages/DriverProfile.jsx` | `src/modules/Taxi/modules/driver/pages/DriverProfile.jsx` | Built, not tested |
| `pages/DriverWallet.jsx` | `src/modules/Taxi/modules/driver/pages/DriverWallet.jsx` | Built, not tested |
| `pages/IncomingRideRequest.jsx` | `src/modules/Taxi/modules/driver/pages/IncomingRideRequest.jsx` | Built, not tested |
| `pages/OwnerBusBookingsPage.jsx` | `src/modules/Taxi/modules/driver/pages/OwnerBusBookingsPage.jsx` | Built, not tested |
| `pages/OwnerBusServicePage.jsx` | `src/modules/Taxi/modules/driver/pages/OwnerBusServicePage.jsx` | Built, not tested |
| `pages/OwnerDashboard.jsx` | `src/modules/Taxi/modules/driver/pages/OwnerDashboard.jsx` | Built, not tested |
| `pages/OwnerWallet.jsx` | `src/modules/Taxi/modules/driver/pages/OwnerWallet.jsx` | Built, not tested |
| `pages/registration/ApplicationStatus.jsx` | `src/modules/Taxi/modules/driver/pages/registration/ApplicationStatus.jsx` | Built, not tested |
| `pages/registration/BusSignupBuilderPage.jsx` | `src/modules/Taxi/modules/driver/pages/registration/BusSignupBuilderPage.jsx` | Built, not tested |
| `pages/registration/DriverWelcome.jsx` | `src/modules/Taxi/modules/driver/pages/registration/DriverWelcome.jsx` | Built, not tested |
| `pages/registration/LanguageSelect.jsx` | `src/modules/Taxi/modules/driver/pages/registration/LanguageSelect.jsx` | Built, not tested |
| `pages/registration/OTPVerification.jsx` | `src/modules/Taxi/modules/driver/pages/registration/OTPVerification.jsx` | Built, not tested |
| `pages/registration/PhoneRegistration.jsx` | `src/modules/Taxi/modules/driver/pages/registration/PhoneRegistration.jsx` | Built, not tested |
| `pages/registration/RegistrationStatus.jsx` | `src/modules/Taxi/modules/driver/pages/registration/RegistrationStatus.jsx` | Built, not tested |
| `pages/registration/RoleSelection.jsx` | `src/modules/Taxi/modules/driver/pages/registration/RoleSelection.jsx` | Built, not tested |
| `pages/registration/RoleSpecificOnboarding.jsx` | `src/modules/Taxi/modules/driver/pages/registration/RoleSpecificOnboarding.jsx` | Built, not tested |
| `pages/registration/StepDocuments.jsx` | `src/modules/Taxi/modules/driver/pages/registration/StepDocuments.jsx` | Built, not tested |
| `pages/registration/StepPersonal.jsx` | `src/modules/Taxi/modules/driver/pages/registration/StepPersonal.jsx` | Built, not tested |
| `pages/registration/StepReferral.jsx` | `src/modules/Taxi/modules/driver/pages/registration/StepReferral.jsx` | Built, not tested |
| `pages/registration/StepVehicle.jsx` | `src/modules/Taxi/modules/driver/pages/registration/StepVehicle.jsx` | Built, not tested |
| `pages/RideRequests.jsx` | `src/modules/Taxi/modules/driver/pages/RideRequests.jsx` | Built, not tested |
| `pages/settings/AddDriver.jsx` | `src/modules/Taxi/modules/driver/pages/settings/AddDriver.jsx` | Built, not tested |
| `pages/settings/AddVehicle.jsx` | `src/modules/Taxi/modules/driver/pages/settings/AddVehicle.jsx` | Built, not tested |
| `pages/settings/DeleteAccount.jsx` | `src/modules/Taxi/modules/driver/pages/settings/DeleteAccount.jsx` | Built, not tested |
| `pages/settings/DriverDocuments.jsx` | `src/modules/Taxi/modules/driver/pages/settings/DriverDocuments.jsx` | Built, not tested |
| `pages/settings/DriverSettings.jsx` | `src/modules/Taxi/modules/driver/pages/settings/DriverSettings.jsx` | Built, not tested |
| `pages/settings/EditProfile.jsx` | `src/modules/Taxi/modules/driver/pages/settings/EditProfile.jsx` | Built, not tested |
| `pages/settings/HelpSupportOptions.jsx` | `src/modules/Taxi/modules/driver/pages/settings/HelpSupportOptions.jsx` | Built, not tested |
| `pages/settings/ManageDrivers.jsx` | `src/modules/Taxi/modules/driver/pages/settings/ManageDrivers.jsx` | Built, not tested |
| `pages/settings/Notifications.jsx` | `src/modules/Taxi/modules/driver/pages/settings/Notifications.jsx` | Built, not tested |
| `pages/settings/OwnerVehicleFleet.jsx` | `src/modules/Taxi/modules/driver/pages/settings/OwnerVehicleFleet.jsx` | Built, not tested |
| `pages/settings/Referral.jsx` | `src/modules/Taxi/modules/driver/pages/settings/Referral.jsx` | Built, not tested |
| `pages/settings/SecuritySOS.jsx` | `src/modules/Taxi/modules/driver/pages/settings/SecuritySOS.jsx` | Built, not tested |
| `pages/settings/Support.jsx` | `src/modules/Taxi/modules/driver/pages/settings/Support.jsx` | Built, not tested |
| `pages/settings/SupportChat.jsx` | `src/modules/Taxi/modules/driver/pages/settings/SupportChat.jsx` | Built, not tested |
| `pages/settings/VehicleFleet.jsx` | `src/modules/Taxi/modules/driver/pages/settings/VehicleFleet.jsx` | Built, not tested |
| `services/busDriverService.js` | `src/modules/Taxi/modules/driver/services/busDriverService.js` | Built, not tested |
| `services/registrationService.js` | `src/modules/Taxi/modules/driver/services/registrationService.js` | Built, not tested |
| `utils/documentTemplates.js` | `src/modules/Taxi/modules/driver/utils/documentTemplates.js` | Built, not tested |
| `utils/driverRoles.js` | `src/modules/Taxi/modules/driver/utils/driverRoles.js` | Built, not tested |
| `utils/notificationState.js` | `src/modules/Taxi/modules/driver/utils/notificationState.js` | Built, not tested |
| `utils/rideRequestAlertSound.js` | `src/modules/Taxi/modules/driver/utils/rideRequestAlertSound.js` | Built, not tested |
| `utils/scheduledRideTime.js` | `src/modules/Taxi/modules/driver/utils/scheduledRideTime.js` | Built, not tested |
| `utils/vehicleTypeIcon.js` | `src/modules/Taxi/modules/driver/utils/vehicleTypeIcon.js` | Built, not tested |

Not present: 0
