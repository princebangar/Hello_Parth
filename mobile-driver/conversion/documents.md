# Group: documents — conversion report

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-driver/src/…`) |
|---|---|
| `modules/Taxi/modules/driver/pages/registration/StepVehicle.jsx` | same path |
| `modules/Taxi/modules/driver/pages/registration/StepDocuments.jsx` | same path |
| `modules/Taxi/modules/driver/components/FleetDocumentFields.jsx` | same path |
| `modules/Taxi/modules/driver/pages/settings/DriverDocuments.jsx` | same path |

Default exports and the web's named exports are kept (`readSavedDocumentMeta`, `validateFleetDocumentInputs`,
`buildFleetDocumentsPayload` in FleetDocumentFields). One export was added to FleetDocumentFields:
**`NativeDateInput`** (the native `<input type="date">`, value/`onChangeValue` in `YYYY-MM-DD`, `min`/`max`), used by
all four files.

### What differs from the web, and why
- **Dates**: `@react-native-community/datetimepicker` 9.2.1 (it is in package.json). Android: `DateTimePickerAndroid.open`
  (system dialog), iOS: inline picker in a `Sheet`. The value stored is the same `YYYY-MM-DD` string; the box shows
  `dd/mm/yyyy` (what Chrome showed) with a calendar icon. `min={todayDateInputValue()}` → `minimumDate`.
  StepDocuments' `querySelector('input[type="date"]').showPicker()` is gone (the box itself opens the dialog).
  iOS only: inside DriverDocuments' popups the date sheet is a second modal on top of the Dialog (Android uses the
  system dialog, no problem there).
- **StepDocuments camera / gallery**: the Flutter bridge (`flutter_inappwebview.callHandler(captureInspectionPhoto…)`,
  `Rydon24Native`, `__nativeServiceCenterCamera`) and the hidden `<input capture>` are replaced by `pickImage({ source:
  'camera' | 'library', quality: 0.82 })`. The big tile and "Gallery" open the gallery, "Camera" the camera (same
  choices as the web). The photo is read as a base64 data URL (`expo-file-system` `File.base64()`) and sent in the same
  JSON body (`documents[key].dataUrl/fileName/mimeType/...`). The web's canvas re-encode (max side 1600 px, JPEG
  0.82 → down to 0.45) is not reproduced: there is no canvas and `expo-image-manipulator` is not installed; the picker
  re-encodes at 0.82 but does not shrink the pixel size. A full-size camera photo can therefore be a bigger upload than
  on the web. While uploading, the tile shows the local photo (`file://` uri) instead of the data URL.
  Picker errors (e.g. permission denied) go to the page's error banner (`setError(err.message)`), like the web's catch.
- **FleetDocumentFields / DriverDocuments uploads**: `<input type="file" accept="image/*">` (the phone's own chooser) →
  a small Alert chooser "Camera / Gallery / Cancel", then `pickImage`. Permission denied → `toast.error(message)`.
  FleetDocumentFields hands the parent `{ uri, name, type, … }` via `onFile(key, file)`; `buildFleetDocumentsPayload`
  reads it as a data URL and uploads with the same `uploadService.uploadImage(dataUrl, folder)`. Preview = `AppImage`
  with the local uri. DriverDocuments uploads through the (already native) `useImageUpload` hook with the picked file.
  `location.state.focusDocumentKey` opens the chooser once the list is loaded (web: clicked the hidden input).
- **`window.confirm`** (StepVehicle / StepDocuments back) → `Alert.alert('', same text, Cancel / OK)`. Browser back
  (`popstate` trap) → `useBeforeLeave` showing the same confirm. OK → `buildCurrentSession()` +
  `navigate(prev step, { replace: true })`, like the web.
- **`<select>`** (StepVehicle operating city + admin "select" custom fields) → a tappable box showing the chosen option
  (or the web's first option text: "Loading..." / "Select City" / `Select <name>`), opening a bottom `Sheet` with the
  empty option + all options. Disabled while loading / no cities (opacity 0.5).
- Onboarding pages are drawn only while focused (`useIsFocused`, the same pattern as StepPersonal / StepReferral).
- Font: the web sets Inter inline on both onboarding pages → `FontScope family={fonts.inter}`.
- Partner button colour: every `<button>` with `bg-slate-900` is drawn `#2563EB` (driverTheme.button): Save & Continue,
  Verify DL, multi-select chips, Camera, Review & Submit, Refresh, Close Viewer. The vehicle-type tile's selected label
  bar is a `<div>` and stays slate-900.
- `backdrop-blur` on the sticky bars / "Retake Photo" chip / tip box: plain translucent colour (no blur).
- `focus-within` card styles are reproduced with focus state per input; for selects, while the sheet is open.
- StepVehicle's `handleVerifyRc` is kept but, as on the web, no button calls it (RC lookup is off).
- DriverDocuments "Audit Feed" has no action on the web either.

## 2. Screens, guards, API calls

| Route | Guard | API (from the web code) |
|---|---|---|
| `/taxi/driver/step-vehicle`, `/taxi/owner/step-vehicle` | registration session (`phone` + `registrationId`), else `<prefix>/reg-phone` | GET `/drivers/service-locations`; GET `/users/vehicle-types`; GET `/drivers/vehicle-field-templates`; GET `/drivers/document-templates` (driver only); POST `/drivers/onboarding/documents/:key/verify-license` (Verify DL); (POST `/drivers/onboarding/vehicle/verify-rc`, unused); PATCH `/drivers/onboarding/vehicle` → `<prefix>/step-documents`. Back → `<prefix>/step-referral` |
| `/taxi/driver/step-documents`, `/taxi/owner/step-documents` | same | GET `/drivers/document-templates`; PATCH `/drivers/onboarding/documents` (each picked side, data URL in JSON); POST `/drivers/onboarding/documents/:key/verify-license`; POST `/drivers/onboarding/complete` → `persistDriverAuthSession` + `<prefix>/registration-status` (state: role, completedRegistration, submittedDocumentSummary). Back → `<prefix>/step-vehicle` |
| `/taxi/driver/documents`, `/taxi/owner/documents` | signed-in (DriverLayout; also allowed while pending) | GET `/drivers/me` + GET `/drivers/document-templates`; POST `/common/upload/image` (folder `driver-documents`) + PATCH `/drivers/documents/:key`; PATCH `/drivers/documents/:key` (expiry / numbers); POST `/drivers/documents/:key/verify-{license,pan,gst,rc,bank}`. Back arrow → `<prefix>/profile` |
| FleetDocumentFields (component in AddVehicle / AddDriver / OwnerVehicleFleet) | parent's | POST `/common/upload/image` (`buildFleetDocumentsPayload`, folder from the caller) |

## 3. Web-only APIs replaced

| Web | Native |
|---|---|
| `<input type="file">`, `FileReader.readAsDataURL`, `URL.createObjectURL` | `pickImage` (`@/lib/media`), `expo-file-system` `File.base64()`, `AppImage` with the local uri |
| Flutter camera bridge (`window.flutter_inappwebview.callHandler`, `Rydon24Native`, `__nativeServiceCenterCamera`) | `pickImage({ source: 'camera' })` |
| canvas image re-encode | picker JPEG quality 0.82 (no resize — see above) |
| `<input type="date">`, `showPicker()` / `querySelector` | `NativeDateInput` (`@react-native-community/datetimepicker`) |
| `<select>` | box + `Sheet` option list |
| `window.confirm`, `history.pushState` / `popstate` | `Alert.alert`, `useBeforeLeave` |
| fixed overlays (`data-driver-overlay`) | `Dialog` |
| `useBodyScrollLock` | not needed (modal) |
| framer-motion tap / entrance | Pressable pressed scale; Dialog fade/scale |

## 4. Missing imports from other groups
None. FleetDocumentFields is imported by AddVehicle / AddDriver / OwnerVehicleFleet (other groups): they must pass
picked files as `{ uri, name, type }` objects (what `onFile` hands them) — `buildFleetDocumentsPayload` reads `file.uri`.

## 5. Status
| Screen | Status |
|---|---|
| StepVehicle | Built, not tested |
| StepDocuments | Built, not tested |
| FleetDocumentFields | Built, not tested |
| DriverDocuments | Built, not tested |

Checks: `node scripts/check-converted.cjs` → 0 problems for all 4 files; eslint → 0 errors, 0 warnings.

## 6. Blocked
Nothing blocked. Optional: installing `expo-image-manipulator` would allow the web's 1600 px resize before upload
(not installed, so not used).
