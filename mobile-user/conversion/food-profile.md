# food-profile — conversion report

Group: Food user profile pages, the OAuth callback page, and `utils/imageUploadUtils.js`.
`node scripts/check-converted.cjs src/modules/Food/pages/user/profile src/modules/Food/pages/user/auth src/modules/Food/utils/imageUploadUtils.js`
→ **23 files, 0 problems**. An unbound-identifier scan (Babel scope globals) of the same files is clean too.
Every screen: **Built, not tested** (the app was not run).

## 1. Files converted

All paths are `Frontend/src/…` → `mobile-user/src/…`, same name and default export.

| Web file | Notes / what is not exactly the same |
|---|---|
| `modules/Food/utils/imageUploadUtils.js` | Same exports (`convertBase64ToFile`, `openBrowserCameraFallback`, `isFlutterBridgeAvailable`, `handleImageUpload`, `openCamera`, `openGallery`) and options. The Flutter bridge and the `<input type=file>` fallback are both replaced by the system camera / photo picker (`@/lib/media` `pickImage`). For `multiple: true` it calls `expo-image-picker` with `allowsMultipleSelection`. `onSelectFile` gets `{ uri, name, type, width, height, size }`, which `FormData.append` uploads. `isFlutterBridgeAvailable()` now returns `true`, because the app is the native shell, so callers keep their "inside the app" branch (EditProfile opens the camera-or-gallery chooser). `convertBase64ToFile` writes the bytes to the cache folder and returns the same kind of file descriptor. Failure toasts are the same as on the web. |
| `pages/user/profile/Profile.jsx` | Main tab (MainTabKeepAlive). Window scroll and sessionStorage `profileScrollPos` → ScrollView offset (same key). The list is registered with `browseScrollMemory` (`registerBrowseScroller('/food/user/profile')` + `reportBrowseScroll`), so the keep-alive tab switch saves and restores it. Hover animations (`whileHover`) dropped. The top safe area is added to the content padding. The web never sets `walletBalance`, so the wallet amount always shows the pulse skeleton; this is kept. The balance-warning popup (dead code on the web) is drawn with `@/native/ui` Dialog. |
| `pages/user/profile/EditProfile.jsx` | The pencil button opens `ImageSourcePicker` (camera / gallery), then `ImageCropper`, then `userAPI.uploadProfileImage` on "Update profile". The web's FileReader data-URL preview is the picked file's local uri, which is also what `localImagePreview` stores. Fieldset/legend is drawn with an absolute label on the border line. The hump SVG uses react-native-svg. The dropdown's small rotated arrow is not drawn (the web clips it with overflow anyway). The dropdown blur uses expo-blur. The hump and avatar sit in a wrapper above the card so their taps work on Android. |
| `pages/user/profile/Payments.jsx` | `window.confirm` → `Alert.alert` (Cancel / OK). Gradients use expo-linear-gradient. The web shows the literal text `"??"` as the card icon (broken emoji); kept. The Edit link goes to `/user/profile/payments/:id/edit` exactly as on the web (the shell's `/user/*` redirect handles it). |
| `pages/user/profile/AddPayment.jsx` | `alert` → `Alert.alert`. The form body is a named export, `PaymentMethodForm` (with `usePaymentFormChange`, `validatePaymentForm`, `EMPTY_PAYMENT_FORM`), because the web's Add and Edit pages repeat the same markup. |
| `pages/user/profile/EditPayment.jsx` | Uses `PaymentMethodForm` from `./AddPayment`. The "Payment method not found" state is the same as the web. |
| `pages/user/profile/Favorites.jsx` | 2-column FlatList. `window.confirm` → Alert. Image `onError` → the Unsplash fallback through AppImage `fallback`, as on the web. The "View Restaurant" / "View Dish" buttons inside the card link get no tap of their own (`pointerEvents="none"`), so the link gets the tap. On the web, the non-veg marker classes (`border-#991B1B`) are invalid, so it shows a default-border box with an unfilled dot; reproduced. |
| `pages/user/profile/Coupons.jsx` | FlatList. The empty-state treasure map is drawn with react-native-svg + expo-linear-gradient. Clipboard via webCompat `navigator.clipboard`. |
| `pages/user/profile/About.jsx` | framer-motion entrances (same delays and offsets) → Animated `FadeIn`. The `backdrop-blur` of the info card is not drawn (it sits over a gradient). |
| `pages/user/profile/Accessibility.jsx`, `DeliverySafety.jsx`, `Logout.jsx`, `Settings.jsx` | 1:1. `animate-pulse` uses an Animated loop. On the web, Logout's page background has no dark variant; kept. |
| `pages/user/profile/ReferEarn.jsx` | `navigator.share`, `navigator.clipboard` and `window.open` (wa.me) come from webCompat. `window.location.origin` is `https://helloparth.in`, so the invite link is the same as on the web. NumberSkeleton gets the colour and font size of the text it replaces. |
| `pages/user/profile/ReportSafetyEmergency.jsx` | `tel:100` → `Linking.openURL`. The `blur-3xl` glow is a soft translucent circle. The details dialog scrolls (max 85% of the height). |
| `pages/user/profile/Cancellation.jsx` | `dangerouslySetInnerHTML` + `prose` → react-native-render-html with the prose colours, light and dark. `window.history.length > 2` → `router.canGoBack()`. The sticky blurred header is a sibling above the ScrollView. Holds the named export `FoodPolicyPage`, which Refund and Shipping use. |
| `pages/user/profile/Refund.jsx`, `Shipping.jsx` | `FoodPolicyPage` with their own endpoint, title and icon. Like the web, they have no `returnTo` handling. |
| `pages/user/profile/Privacy.jsx`, `Terms.jsx`, `UserCMSHelpSupportPage.jsx` | Thin `CMSPage` wrappers, as on the web. |
| `pages/user/auth/AuthCallback.jsx` | Same logic. Timers are cleared on unmount. The icons' `fade-in zoom-in` uses Animated. |

No Pressable is nested inside another Pressable. Where the web wraps a `<Button>` in a `<Link>`, the button navigates by itself.

## 2. Screens, guards, API calls

The route files belong to the shell group. Guards are as those route files set them.

| Route | Guard | API calls (from the web code) |
|---|---|---|
| `/food/user/profile` (Profile, kept alive) | logged-in user (MainTabKeepAlive `ProtectedRoute requiredRole="user"`) | `DELETE` account via `authAPI.deleteAccount("user")` (delete flow only; it is reachable only through the dead balance-warning path, as on the web). Logout: `performUserLogout` |
| `/food/user/profile/edit` | logged-in user | `POST /food/user/profile/profile-image` (multipart `file`); `userAPI.updateProfile` (`PATCH /food/user/profile`) |
| `/food/user/profile/payments`, `/payments/new`, `/payments/:id/edit` | logged-in user | none (ProfileContext / localStorage) |
| `/food/user/profile/favorites` | logged-in user | none (ProfileContext) |
| `/food/user/profile/coupons` | logged-in user | `GET /food/restaurant/offers` |
| `/food/user/profile/about` | logged-in user | `GET /food/pages/about`; business settings (`loadBusinessSettings`) for the logo |
| `/food/user/profile/accessibility`, `/delivery-safety`, `/logout` | logged-in user | none (logout: `performUserLogout`) |
| `/food/user/profile/settings` | logged-in user | `authAPI.deleteAccount("user")` |
| `/food/user/profile/refer-earn` | logged-in user | `userAPI.getReferralDetails()` (GET) |
| `/food/user/profile/report-safety-emergency` | logged-in user | `userAPI.createSafetyEmergencyReport` (POST), `userAPI.getMySafetyEmergencyReports({page:1,limit:20})` (GET) |
| `/food/user/profile/support` | guest route (publicRoute in the route file) | `authAPI.getCurrentUser`, `supportAPI.getMyTickets`, `supportAPI.createTicket` (POST), `orderAPI.getOrders({limit:10,page:1})`, `restaurantAPI.getRestaurants({limit:20,page:1})` |
| `/food/user/profile/cancellation`, `/refund`, `/shipping` | guest | `GET /food/pages/cancellation` / `refund` / `shipping` |
| `/food/user/profile/{terms,privacy,support-info}` | redirect to `/user/…` (shell) | Terms/Privacy/UserCMSHelpSupportPage components: `GET /food/pages/terms` / `privacy` / `support_user` (no route renders them, same as on the web) |
| `/food/user/auth/callback` | guest | none (reads `token` / `user` from the query string) |

## 3. Web-only APIs replaced

- `<input type="file">` and the Flutter camera/gallery bridge → `@/lib/media` `pickImage` / expo-image-picker. FileReader data URL → file uri. Blob/File → `{ uri, name, type }` + expo-file-system.
- `window.confirm` / `alert` → `Alert.alert`.
- `window.scrollTo` / `scrollY` / scroll listener → ScrollView ref and `onScroll`, plus the browseScrollMemory registry.
- `framer-motion` and tw-animate → Animated. `animate-spin` → `Spin` from `@/shared/components/Loader`. `animate-pulse` → `Skeleton` or an Animated loop.
- `dangerouslySetInnerHTML` → react-native-render-html. CSS gradients → expo-linear-gradient. backdrop-blur → expo-blur (dropdown, policy header). Inline SVG → react-native-svg.
- `<a href="tel:">` → `Linking.openURL`. `window.history.length` → `router.canGoBack()`.
- Radix Dialog / DropdownMenu / Select / Switch → the native kit in `components/ui/*` (food-shell).

## 4. Cross-group imports

Every import resolves. Files used from other groups: `components/ui/*` (dialog, dropdown-menu, select, card, button, badge, input, label, switch, textarea, avatar, tokens), `AnimatedPage`, `ScrollReveal`, `UserLayout` (`useLocationSelector`), `CMSPage`, `ProfileContext`, `useAppBackNavigation`, `useCompanyName`, `ImageSourcePicker`, `ImageCropper`, `shared/components/{UserAppearanceDialog, UserLogoutConfirmDialog, UserDeleteAccountDialog, NumberSkeleton, Loader}`, `shared/utils/*`, `browseScrollMemory`. None was missing when I finished.

## 5. Status

Every screen in section 2: **Built, not tested**.

## 6. Blocked / notes for integration

- Nothing is blocked. No packages were added.
- `ImageCropper` (shell) does not really crop (no image-manipulation module), so the profile photo is uploaded uncropped (the system picker may crop). If real cropping is wanted, call `pickImage({ allowsEditing: true, aspect: [1, 1] })` in imageUploadUtils, or install `expo-image-manipulator`.
- Web behaviours kept as they are: the Profile wallet amount never loads (always a skeleton), and on the Favorites rating pill the text uses the theme foreground, so in dark mode it is light text on a white pill.
