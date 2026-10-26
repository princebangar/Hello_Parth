# Group `menu` — conversion report

Checks (26 Oct): `node scripts/check-converted.cjs` on the 3 files → **0 problems**. `npx eslint` on the 3 files →
**0 errors, 0 warnings** (two unused `eslint-disable` comments in Inventory were removed by `eslint --fix`; nothing else
changed in that file in the last pass). Nothing outside the group's files was edited.

Note: `Inventory.jsx` was written by the earlier agent of this group just before it stopped at its usage limit (the
brief said it did not exist yet; it did, complete). The last pass re-checked it against the web file instead of
rewriting it: every API call, navigate target, local-storage key and user-visible text of the web file is present
(texts the web shows through CSS `uppercase` are written upper-case, e.g. HEALTHY / NEEDS ATTENTION / FIX / EDIT).

## 1. Files converted (web → native, same path)

| Web file | Native file | Not reproduced exactly / why |
|---|---|---|
| `pages/restaurant/Inventory.jsx` (2881 lines) | same path (~2530 lines) | Kept-alive tab (see below). The web's desktop mouse-drag swipe is not needed (touch swipe between "All items" / "Add ons" kept). "Jump to category" (Menu button) scrolls the list to the measured card instead of `scrollIntoView`. Filters / out-of-stock popups → `Sheet`; the calendar and the time wheel → `Dialog` (drawn natively with the web's grid / wheel). framer-motion → short Animated fades. Photo pick → `openGallery` from the converted `imageUploadUtils` ({ uri, name, type } → `uploadAPI.uploadMedia`). |
| `pages/restaurant/ItemDetailsPage.jsx` | same — converted earlier (not touched in this pass) | Form in `KeyboardAwareScrollView`, fixed Cancel / Save bar rides on the keyboard (`useKeyboardOffset`); photos via `ImageSourcePicker` (camera / gallery); Preparation Time `<select>` → bottom `Sheet`; "Add category" keeps the draft and reopens the picker on return. |
| `pages/restaurant/MenuCategoriesPage.jsx` | same — converted earlier (not touched in this pass) | Create / edit sheet = `Sheet` + `KeyboardAwareScrollView`; diet scope `<select>` → small `Sheet`; image via `ImageSourcePicker`; `window.confirm` delete → `Alert.alert` Cancel / OK. |

### Inventory (kept-alive tab) notes
- `useRestaurantTabActive()`: the stock-rule interval (15 s auto re-enable), the floating Menu popup, the sheets /
  dialogs and the `<StatusBar style="light">` run / show only while the tab is active; leaving the tab closes the
  Menu popup.
- On mount data (restaurant profile, menu, add-ons on the Add ons tab) is loaded again each time the tab becomes active
  again; the recommended map is re-read from storage (the item page may have changed it). Old data stays on screen.
- No `BottomNavOrders` inside; scroll content ends with `max(128 (web pb-32), useRestaurantNavSpace())`; the floating
  "+ Add item" / "Menu" buttons sit above the shared bar.
- Main scroll = `KeyboardAwareScrollView` + `useTabScrollTop(scrollRef)` + pull-to-refresh (`RefreshControl`, tint
  `#B80B3D`) that reloads profile + menu (+ add-ons on that tab).
- `RestaurantNavbar` is the first child (it draws the status-bar inset itself).

## 2. Screens, guards, API calls

| Route | Guard | API calls |
|---|---|---|
| `/food/restaurant/inventory`, `/food/restaurant/menu` (Inventory, kept-alive tab) | protectedRoute (restaurant) via RestaurantTabKeepAlive | GET `/food/restaurant/menu` (getMenu), current restaurant (getCurrentRestaurant), GET `/food/restaurant/addons`, POST `/food/restaurant/addons`, PATCH `/food/restaurant/addons/:id`, PATCH `/food/restaurant/foods/:id` (updateFood: in-stock / recommended), uploadAPI.uploadMedia (add-on image); navigates to `/food/restaurant/hub-menu/item/:id` and `/hub-menu/item/new` |
| `/food/restaurant/hub-menu/item/:id`, `/inventory/item/:id` (ItemDetailsPage) | protectedRoute | getCurrentRestaurant, getMenu, getCategories, createFood, updateFood, deleteFood, uploadAPI.uploadMedia |
| menu categories page (MenuCategoriesPage) | protectedRoute | getCurrentRestaurant, getAllCategories, createCategory, updateCategory, deleteCategory, uploadAPI.uploadMedia |

## 3. Web-only APIs replaced
- `<input type="file">` → `openGallery` (Inventory add-on image) / `ImageSourcePicker` (item, category).
- `scrollIntoView` / `window.scrollTo` → `scrollTo` on the screen's scroll view; IntersectionObserver-free.
- framer-motion / CSS transitions → `Animated`; fixed popups → `Sheet` / `Dialog`; `localStorage` keys kept (webCompat).

## 4. Missing imports of other groups
None (all imports resolve).

## 5. Status
| Screen | Status |
|---|---|
| Inventory | Built, not tested |
| ItemDetailsPage | Built, not tested |
| MenuCategoriesPage | Built, not tested |

## Input screens and keyboard handling
| Screen | Inputs | Keyboard |
|---|---|---|
| Inventory | search box (top), add-on form: name, description, price (+ image pick) | all inside the main `KeyboardAwareScrollView` (the focused field is scrolled above the keyboard); focus border `#EC8C8C` |
| ItemDetailsPage | name, description, base price, variant name / price rows, category search (sheet) | `KeyboardAwareScrollView`; Save bar lifted with `useKeyboardOffset` |
| MenuCategoriesPage | category name, type label (inside the create / edit Sheet) | `KeyboardAwareScrollView` inside the Sheet |

## Test-only buttons kept
None in these files (the web has none).

## 6. Blocked
Nothing blocked.

## To check on a phone
- Inventory: switching tabs / coming back from the item page keeps the list and reloads it without a skeleton flash;
  pull-to-refresh; the floating buttons clear the bottom bar on gesture-nav and 3-button phones.
- Inventory: swipe between All items / Add ons does not fight vertical scrolling; "Menu" jump lands on the right category.
- Out-of-stock sheet: custom date + time wheel, 15 s auto re-enable of a timed rule while on the tab.
- Add-on form fields stay above the keyboard; add-on image upload from the gallery.
- ItemDetailsPage: Save bar on the keyboard, photo from camera and gallery, delete confirm.
