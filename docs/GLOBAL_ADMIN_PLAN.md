# Global Admin

Status: **Phase 0 (overview), Phase 1 (customers) and Global sub-admins are built.** Settings, finance and
communication below are still proposals.

## Why

Food and Taxi already share one customer identity (`users` collection, one login) and one set of money collections
(`payments`, `transactions`, `refunds`, `settlements`), but they are operated from two separate admin shells:

| | Food admin | Taxi admin |
|---|---|---|
| URL | `/admin/food/*` | `/taxi/admin/*` |
| Settings | `food_*` settings collections | `taxiadmin*settings`, `taxipaymentgateways` |
| Zones / areas | `food_zones` | `taxizones`, `taxiservicelocations` |
| Promos / banners / notifications | Food collections | `taxipromocodes`, `taxibanners`, `taxinotifications` |
| Support | `food_support_tickets` | `taxisupporttickets` |

An admin who runs the whole business has to switch panels, configure shared things twice (payment gateway, SMS, maps,
Firebase, app name/logo) and cannot see one customer across both apps.

## Principle

**Do not merge the two admins or their data.** Food and Taxi keep owning their operations (orders, rides, partners,
prices). Global is a thin layer on top for things that are genuinely cross-cutting, reading from both modules.
No collection migration is needed for any phase.

## What exists now

### Its own shell — `/admin/global/*`

Selecting **Global** under the Food / Taxi switcher opens a separate shell (`GlobalAdminLayout`) with its own sidebar
and top bar. The Global sidebar never lists Food or Taxi menu items; it holds only Global sections:

| Section | Page | Who sees it |
|---|---|---|
| Overview → Dashboard | Food and Taxi numbers side by side (only the modules the admin can open) | platform super admin, or a sub-admin with `overview` |
| People → Customers | One customer across both apps: Food orders + Taxi rides, block / unblock in both apps | platform super admin, or a sub-admin with `customers` (`edit` = block / unblock) |
| Access Control → Sub Admins | Create Global sub-admins, choose module access + sidebar options | platform super admin only |
| Account → Profile | Own profile / password | everyone |

Code: `Frontend/src/modules/Global/*` (layout, sidebar, top bar, pages, API client) and
`Backend/src/modules/global/admin/*` (`/api/v1/admin/global/*`).

### Global sub-admins

A Global sub-admin is an admin account (`admins` collection) with `isGlobalSubAdmin: true`, `adminLevel: "subadmin"`,
`module: null`, `role: "SUB_ADMIN"`. The platform super admin creates it under **Global → Sub Admins**:

1. **Create**: name, email, phone, password and **module access** (Food and/or Taxi).
2. **Access** (per sub-admin): three tabs, same idea as the Food sub-admin matrix.
   - **Global** — Overview / Customers (`view`, `edit`).
   - **Food** — every Food sidebar option with view / create / edit / delete (same rules as a Food sub-admin).
   - **Taxi** — the Taxi sidebar options plus the **service locations** (and optional zones) the sub-admin is limited to.

| Data | Field on the admin document |
|---|---|
| modules the sub-admin may open | `servicesAccess` (`food`, `taxi`) |
| Food sidebar options | `foodPermissions` — `{ key: { view, create, edit, delete } }` |
| Taxi sidebar options | `permissions` — flat keys such as `drivers.view` |
| Global sidebar options | `globalPermissions` — `{ overview, customers }` |
| Taxi scope | `service_location_ids`, `zone_ids` |

Removing a module clears that module's options, so nothing stays dormant behind a hidden tab. `subadmins.manage`
(Taxi) is never grantable from Global — managing admins stays with the platform super admin.

### Enforcement (server side, not only hidden in the UI)

Every admin signs in with an `ADMIN` token; the panel APIs look the account up behind the token:

- **Food API** (`/api/v1/food/admin/*`): `attachFoodAdminAccess` refuses disabled accounts and admins without Food
  access, and presents a sub-admin to the Food permission middleware as `SUB_ADMIN` with its `foodPermissions`.
- **Taxi API** (`/api/v1/taxi/admin/*`): `authenticate` refuses admins without Taxi access; the existing
  permission and service-location scoping applies to the Taxi keys.
- **Global API**: `requireGlobalAccess` — sub-admin management is platform-only, customers need the Global section.
- **Sign-in / refresh**: a disabled sub-admin cannot sign in, and an open session stops at its next request.
- **Front end**: `getModuleAccess()` (`shared/utils/adminAccess.js`) decides which of Food / Taxi / Global tabs an
  admin sees and where it lands after sign-in; opening a part of the panel without access redirects to its own.
  A change made by the super admin reaches an open panel without a new sign-in (profile refresh).

### Fixed on the way

- Creating a **Food sub-admin failed with a 500** (the shared admin model typed `permissions` as a string list, the
  Food matrix is an object). The Food matrix now lives in `foodPermissions`.
- A Food-side sub-admin permission redirect **blanked the page** (early `return <Navigate>` before later hooks).
- Admins created from the **Taxi Admins screen could not sign in** (password hashed twice) and were saved as
  platform super admins, so a Taxi sub-admin had **full Food access**. They are now Taxi-scoped and hashed once.
- The Taxi Admins screen no longer lists or edits Food / Global sub-admins.

## Later phases (not built)

| Phase | What | How |
|---|---|---|
| **2 — Global settings** | Configure once: app name/logo/theme, SMS/OTP provider, Firebase, Maps key, payment keys. | New `platform_settings` collection. Both modules read it first and fall back to their own setting, so rollout is per-key and reversible. |
| **3 — Global finance** | Combined revenue/commission, one payout queue, refunds in one list. | Read-only aggregation over the shared `transactions` / `refunds` / `settlements` plus module withdrawal collections. Approvals still call the owning module. |
| **4 — Global communication** | Broadcast notification / promo / banner to "all apps", one support inbox. | Thin fan-out endpoint that creates the module-specific records; inbox merges `taxisupporttickets` + `food_support_tickets`. |
| **5 — Shared geography** | One city/zone master both modules reference. | Only if the two zone sets keep drifting; needs a data migration, so do it last. |

New Global sections plug into `GLOBAL_MENU` (`Global/constants/globalMenu.js`) and `GLOBAL_SECTIONS`
(`shared/utils/adminAccess.js`); the backend list is `core/admin/globalPermissions.constants.js`.

## Rules to keep it safe

- Aggregation endpoints live under `/api/v1/admin/global/*` and are guarded on the server.
- Never sum customers of the two modules (same collection → double count); sum money and activity only.
- Global never writes directly into `food_*` or `taxi*` collections except through the shared customer record
  (block / unblock flips both `isActive` and `active`); anything else calls the owning module's service.
- Every phase ships behind the sidebar; nothing in Food / Taxi admin changes for admins without Global access.
