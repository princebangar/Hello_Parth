# Group: owner — conversion report

## 1. Files converted

| Web (`Frontend/src/…`) | Native (`mobile-driver/src/…`) |
|---|---|
| `modules/Taxi/modules/driver/pages/OwnerDashboard.jsx` | same path |
| `modules/Taxi/modules/driver/pages/OwnerWallet.jsx` | same path |
| `modules/Taxi/modules/driver/pages/settings/ManageDrivers.jsx` | same path |
| `modules/Taxi/modules/driver/pages/settings/AddDriver.jsx` | same path |
| `modules/Taxi/modules/driver/pages/settings/VehicleFleet.jsx` | same path |
| `modules/Taxi/modules/driver/pages/settings/OwnerVehicleFleet.jsx` | same path |
| `modules/Taxi/modules/driver/pages/settings/AddVehicle.jsx` | same path |

All keep their default export. Texts, API calls, rules, states and navigation targets are the web's.

### What differs from the web, and why
- **Kept-alive tabs** (OwnerDashboard, ManageDrivers, OwnerVehicleFleet): data the web loaded on mount is loaded again
  each time `useDriverTabActive()` turns true; the old data stays on screen while it reloads (no spinner flash on a
  revisit). `<StatusBar>`, the low-wallet popup and the delete-confirm dialog exist only while the tab is active. The
  low-wallet popup is re-checked after every visit's load (web: on every mount). The "vehicle not found" redirect only
  runs while active.
- **OwnerVehicleFleet edit page**: on the web the list and `edit/:vehicleId` were the same screen, so the success
  message ("Vehicle updated successfully." / "Corrections saved…" / "That vehicle could not be found.") stayed visible after
  `navigate(vehicle-fleet, { replace })`. Here the edit page is its own stack screen, so it passes the message to the list
  in the navigation state (`fleetFlash`) and the list shows it for 3 s. The list also reloads on return.
- **`<select>`** (AddDriver vehicle / zone, OwnerVehicleFleet + AddVehicle vehicle type): a box with the chosen label
  that opens a bottom `Sheet` with the same options (no picker package is installed). A small chevron marks it as a select.
- **Bottom sheets / dialogs**: VehicleFleet "Vehicle Details" edit sheet → `Sheet`; OwnerVehicleFleet delete confirm and
  OwnerDashboard low-wallet popup → `Dialog`. `backdrop-blur-sm` behind them is not reproduced (plain dim backdrop).
- **Photo uploads**: VehicleFleet "Choose From Gallery" / "Use Camera" call `useImageUpload().handleFileChange({ source })`
  (pickImage → same `POST /common/upload/image` with base64 + folder `driver-vehicles`). Document files in AddDriver /
  AddVehicle / OwnerVehicleFleet go through `FleetDocumentFields` + `buildFleetDocumentsPayload` (documents group).
- **Fixed / sticky bars**: sticky headers are fixed views above the scroll list; the AddDriver / AddVehicle bottom
  buttons sit above `insets.bottom`. Bottom-bar paths use `paddingBottom: useBottomNavSpace()`.
- **ManageDrivers** floating "+" sits at `92 + max(insets.bottom, 8)` like the web; the hero's `blur-3xl` glow is a plain
  translucent circle (no element blur in RN).
- **OwnerWallet**: the white section card is drawn by the FlatList header / rows / footer (so long lists are a FlatList);
  the card's `shadow-sm` is not drawn around that split card.
- **Timers**: the 5 s "back to list" timers (AddDriver, AddVehicle) and the 3 s message timers are cleared on unmount
  (the web left them running).
- Buttons drawn `bg-slate-900` / `bg-slate-950` are `driverTheme.button` (#2563EB) per the partner CSS (ManageDrivers "+",
  AddDriver CTAs, VehicleFleet selected type tile + "Update Vehicle").
- Step entrance animations (framer-motion x/y + fade) are short `Animated` fades; success animations (wobble check,
  spring + ping, 5 s progress bar) reproduced with `Animated`.
- Pull-to-refresh: OwnerDashboard, OwnerWallet, ManageDrivers, OwnerVehicleFleet (list), VehicleFleet.

## 2. Screens, guards, API calls
All routes are behind the shell's `DriverLayout` guard (logged-in driver/owner portal; `driverRoute(...)`).

| Route | Screen | API |
|---|---|---|
| `/taxi/owner/home`, `/taxi/owner/dashboard` (tab) | OwnerDashboard | `getOwnerFleetDashboard()` (registrationService) |
| `/taxi/owner/wallet` | OwnerWallet | `GET /drivers/fleet/wallet` |
| `/taxi/owner/manage-drivers` (tab), `/taxi/driver/manage-drivers` | ManageDrivers | `getOwnerFleetDrivers()` (remove = local only, like the web) |
| `/taxi/{owner,driver}/add-driver`, `/edit-driver/:driverId` | AddDriver | `getDriverDocumentTemplates('fleet_driver')`, `getOwnerFleetDrivers()` (edit without state), `getOwnerFleetVehicles()`, `getOwnerFleetZones()`, `createOwnerFleetDriver` / `updateOwnerFleetDriver`, document uploads via `buildFleetDocumentsPayload` |
| `/taxi/driver/vehicle-fleet`, `/vehicle-fleet/edit/:vehicleId` | VehicleFleet (owner role → OwnerVehicleFleet) | `getCurrentDriver()`, `getDriverVehicleTypes()`, `updateDriverVehicle(form)`, `POST /common/upload/image`; reapproval → `/taxi/driver/registration-status` |
| `/taxi/owner/vehicle-fleet` (tab), `/vehicle-fleet/edit/:vehicleId` | OwnerVehicleFleet | `getCurrentDriver()`, `getDriverVehicleTypes()`, `getOwnerFleetVehicles()`, `getDriverDocumentTemplates('fleet')`, `updateOwnerFleetVehicle`, `deleteOwnerFleetVehicle` / `deleteDriverVehicle` |
| `/taxi/{owner,driver}/add-vehicle` | AddVehicle | `getDriverVehicleTypes()`, `getDriverDocumentTemplates('fleet')`, `POST /drivers/fleet/vehicles` |

## 3. Web-only APIs replaced
- `react-router-dom` → `@/lib/router`; `lucide-react` → `lucide-react-native`; framer-motion → `Animated`.
- `window.scrollTo` on step change → `scrollRef.scrollTo({ y: 0 })`.
- `<input type="file">` (gallery / `capture="environment"`) → `useImageUpload().handleFileChange({ source: 'library' | 'camera' })`.
- `<select>` → Sheet option list; `<textarea>` → multiline `TextInput`; `<img>` → `AppImage`.
- `sessionStorage` / `localStorage` drafts and role — kept (webCompat).
- `map_image.png` → `assets/map_image.jpg`.

## 4. Imports of other groups' files
- `components/FleetDocumentFields.jsx` (documents group) — present when I finished; used with the web's props.
- `pages/OwnerBusServicePage.jsx`, `OwnerBusBookingsPage.jsx` are only navigation targets (`/taxi/owner/bus-service`, `/taxi/owner/bus-bookings`).

## 5. Status
All seven screens: **Built, not tested** (app not run). `check-converted.cjs`: 7 files, 0 problems. ESLint: 0 errors, 0 warnings.

## 6. Blocked
Nothing blocked. No shell file needed changes.
