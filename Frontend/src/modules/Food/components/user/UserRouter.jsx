import React, { Suspense, useEffect } from "react"
import lazy from "@/shared/utils/lazyPreloaded"
import { whenAppSettled } from "@/shared/utils/whenSettled"
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom"
import UserLayout from "./UserLayout"
import Loader from "@food/components/Loader"
import ProtectedRoute from "@food/components/ProtectedRoute"
import AuthRedirect from "@food/components/AuthRedirect"

const SearchResults = lazy(() => import("@food/pages/user/search/ProfessionalSearch"))

// Lazy Loading Pages

// Home & Discovery
const DiningCategory = lazy(() => import("@food/pages/user/DiningCategory"))
const DiningExplore50 = lazy(() => import("@food/pages/user/DiningExplore50"))
const DiningExploreNear = lazy(() => import("@food/pages/user/DiningExploreNear"))
const Coffee = lazy(() => import("@food/pages/user/Coffee"))
const Categories = lazy(() => import("@food/pages/user/Categories"))
const Restaurants = lazy(() => import("@food/pages/user/restaurants/Restaurants"))
const RestaurantDetails = lazy(() => import("@food/pages/user/restaurants/RestaurantDetails"))
const DiningRestaurantDetails = lazy(() => import("@food/pages/user/dining/DiningRestaurantDetails"))
const TableBooking = lazy(() => import("@food/pages/user/dining/TableBooking"))
const TableBookingConfirmation = lazy(() => import("@food/pages/user/dining/TableBookingConfirmation"))
const TableBookingSuccess = lazy(() => import("@food/pages/user/dining/TableBookingSuccess"))
const TableModificationPolicy = lazy(() => import("@food/pages/user/dining/TableModificationPolicy"))
const TableCancellationPolicy = lazy(() => import("@food/pages/user/dining/TableCancellationPolicy"))
const TableEditUserPage = lazy(() => import("@food/pages/user/dining/TableEditUserPage"))
const MyBookings = lazy(() => import("@food/pages/user/dining/MyBookings"))
const ProductDetail = lazy(() => import("@food/pages/user/ProductDetail"))

// Cart
const Cart = lazy(() => import("@food/pages/user/cart/Cart"))
const Checkout = lazy(() => import("@food/pages/user/cart/Checkout"))
const SelectAddress = lazy(() => import("@food/pages/user/cart/SelectAddress"))
const AddressSelectorPage = lazy(() => import("@food/pages/user/cart/AddressSelectorPage"))

// Orders
const Orders = lazy(() => import("@food/pages/user/orders/Orders"))
const OrderTracking = lazy(() => import("@food/pages/user/orders/OrderTracking"))
const OrderInvoice = lazy(() => import("@food/pages/user/orders/OrderInvoice"))
const UserOrderDetails = lazy(() => import("@food/pages/user/orders/UserOrderDetails"))

// Offers
const Offers = lazy(() => import("@food/pages/user/Offers"))

// Gourmet
const Gourmet = lazy(() => import("@food/pages/user/Gourmet"))

// My Store (brand stores)
const MyStore = lazy(() => import("@food/pages/user/MyStore"))


// Collections
const Collections = lazy(() => import("@food/pages/user/Collections"))
const CollectionDetail = lazy(() => import("@food/pages/user/CollectionDetail"))



// Profile
const EditProfile = lazy(() => import("@food/pages/user/profile/EditProfile"))
const Payments = lazy(() => import("@food/pages/user/profile/Payments"))
const AddPayment = lazy(() => import("@food/pages/user/profile/AddPayment"))
const EditPayment = lazy(() => import("@food/pages/user/profile/EditPayment"))
const Favorites = lazy(() => import("@food/pages/user/profile/Favorites"))
const Support = lazy(() => import("@food/pages/user/profile/Support"))
const Coupons = lazy(() => import("@food/pages/user/profile/Coupons"))
const About = lazy(() => import("@food/pages/user/profile/About"))
const Terms = lazy(() => import("@food/pages/user/profile/Terms"))
const Privacy = lazy(() => import("@food/pages/user/profile/Privacy"))
const Refund = lazy(() => import("@food/pages/user/profile/Refund"))
const Shipping = lazy(() => import("@food/pages/user/profile/Shipping"))
const Cancellation = lazy(() => import("@food/pages/user/profile/Cancellation"))
const DeliverySafety = lazy(() => import("@food/pages/user/profile/DeliverySafety"))
const ReportSafetyEmergency = lazy(() => import("@food/pages/user/profile/ReportSafetyEmergency"))
const Accessibility = lazy(() => import("@food/pages/user/profile/Accessibility"))
const Logout = lazy(() => import("@food/pages/user/profile/Logout"))
const ReferEarn = lazy(() => import("@food/pages/user/profile/ReferEarn"))
const UserCMSHelpSupportPage = lazy(() => import("@food/pages/user/profile/UserCMSHelpSupportPage"))
const Settings = lazy(() => import("@food/pages/user/profile/Settings"))

// Auth
const AuthCallback = lazy(() => import("@food/pages/user/auth/AuthCallback"))

// Help
const Help = lazy(() => import("@food/pages/user/help/Help"))
const OrderHelp = lazy(() => import("@food/pages/user/help/OrderHelp"))

// Notifications
const Notifications = lazy(() => import("@food/pages/user/Notifications"))

// Wallet
const Wallet = lazy(() => import("@food/pages/user/Wallet"))

// Complaints
const SubmitComplaint = lazy(() => import("@food/pages/user/complaints/SubmitComplaint"))

import PageLoader from "@/shared/components/PolicyPageLoader"
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons"
import { hasFirstScreenShown } from "@/shared/utils/firstScreen"

// Right after a refresh the app is still on the skeleton it started with: keep it until this screen is ready, instead
// of a white spinner page in between. Once a screen has been shown, opening another one uses the light spinner.
function RouteLoader() {
  return hasFirstScreenShown() ? <PageLoader /> : <AppShellSkeleton />
}

/** Main tabs render via MainTabKeepAlive in UserLayout — route match only. */
const MainTabRoutePlaceholder = () => null

const RequireInitialAuth = ({ children }) => children;

// The routes someone lands on right after the Profile page (and a few other
// very common first clicks) — warmed on idle so tapping one of these for the
// first time doesn't wait on a fresh chunk fetch. Same import() specifiers
// as the lazy() declarations above, so this shares the browser's module
// cache with them instead of causing a second fetch.
function usePrefetchCommonRoutes() {
  useEffect(() => {
    const warm = () => {
      // preload() = fetch the chunk AND remember it, so the first click renders at once (no spinner fallback).
      Wallet.preload()
      Cart.preload()
      Orders.preload()
      Settings.preload()
      EditProfile.preload()
      Coupons.preload()
      Support.preload()
      About.preload()
      Favorites.preload()
      ReferEarn.preload()
    }
    // after the open screen settled (shared/utils/whenSettled.js)
    return whenAppSettled(warm)
  }, [])
}

export default function UserRouter() {
  usePrefetchCommonRoutes()

  // AppShellSkeleton (home-page-shaped) only makes visual sense for routes
  // that actually look like the home page. Most routes here (Cart, Wallet,
  // Coupons, Restaurants, …) don't have their own nested Suspense, so this
  // outer boundary was their fallback too — swapping a full fake home-page
  // skeleton in and out for a Cart/Terms/Wallet visit read as a jarring
  // "flash" on every such click. PageLoader (a plain spinner, already used
  // by several routes below) is the fallback everywhere else in this file;
  // using it here too makes the one-time per-route chunk-load moment
  // consistent instead of sometimes-spinner, sometimes-full-skeleton.
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route element={<RequireInitialAuth><UserLayout /></RequireInitialAuth>}>
          {/* ========================================== */}
          {/* PUBLIC ROUTES (No login required)          */}
          {/* ========================================== */}
          
          {/* Public Legal Policies & Support */}
          <Route path="profile/terms" element={<Suspense fallback={<PageLoader />}><Terms /></Suspense>} />
          <Route path="profile/privacy" element={<Suspense fallback={<PageLoader />}><Privacy /></Suspense>} />
          <Route path="profile/refund" element={<Suspense fallback={<PageLoader />}><Refund /></Suspense>} />
          <Route path="profile/shipping" element={<Suspense fallback={<PageLoader />}><Shipping /></Suspense>} />
          <Route path="profile/cancellation" element={<Suspense fallback={<PageLoader />}><Cancellation /></Suspense>} />
          <Route path="profile/support" element={<Suspense fallback={<PageLoader />}><Support /></Suspense>} />
          <Route path="profile/support-info" element={<Suspense fallback={<PageLoader />}><UserCMSHelpSupportPage /></Suspense>} />
          
          {/* Help Center */}
          <Route path="help" element={<Help />} />
          <Route path="help/orders/:orderId" element={<OrderHelp />} />

          {/* Auth Redirects & Callbacks */}
          <Route path="auth/login" element={
            <AuthRedirect module="user">
              <Navigate to="/login" replace />
            </AuthRedirect>
          } />
          <Route path="auth/sign-in" element={
            <AuthRedirect module="user">
              <Navigate to="/login" replace />
            </AuthRedirect>
          } />
          <Route path="auth/otp" element={
            <AuthRedirect module="user">
              <Navigate to="/login" replace />
            </AuthRedirect>
          } />
          <Route path="auth/callback" element={<AuthCallback />} />


          {/* ========================================== */}
          {/* PUBLIC DISCOVERY ROUTES (Guest mode allowed) */}
          {/* ========================================== */}
          {/* Home & Discovery — kept alive in UserLayout MainTabKeepAlive */}
          <Route path="" element={<MainTabRoutePlaceholder />} />
          <Route path="home" element={<MainTabRoutePlaceholder />} />
          <Route path="takeaway" element={<MainTabRoutePlaceholder />} />
          <Route path="dining" element={<MainTabRoutePlaceholder />} />
          <Route path="dining/:category" element={<DiningCategory />} />
          <Route path="dining/explore/upto50" element={<DiningExplore50 />} />
          <Route path="dining/explore/near-rated" element={<DiningExploreNear />} />
          <Route path="dining/coffee" element={<Coffee />} />
          <Route path="dining/:diningType/:slug" element={<DiningRestaurantDetails />} />
          <Route path="under-250" element={<MainTabRoutePlaceholder />} />
          <Route path="categories" element={<Categories />} />
          <Route path="category/:category" element={<MainTabRoutePlaceholder />} />
          <Route path="restaurants" element={<Restaurants />} />
          <Route path="restaurants/:slug" element={<RestaurantDetails />} />
          <Route path="search" element={<SearchResults />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="address-selector" element={<AddressSelectorPage />} />
          {/* My Store (brand stores) — browsing is open to guests, like restaurants */}
          <Route path="my-store" element={<MyStore />} />

          {/* ========================================== */}
          {/* PROTECTED ROUTES (Login required)          */}
          {/* ========================================== */}
          <Route element={<ProtectedRoute requiredRole="user" loginPath="/login"><Outlet /></ProtectedRoute>}>
            {/* Dining Table Bookings */}
            <Route path="dining/book/:slug" element={<TableBooking />} />
            <Route path="dining/book-confirmation" element={<TableBookingConfirmation />} />
            <Route path="dining/book-success" element={<TableBookingSuccess />} />
            <Route path="dining/modification-policy" element={<TableModificationPolicy />} />
            <Route path="dining/cancellation-policy" element={<TableCancellationPolicy />} />
            <Route path="dining/edit-user" element={<TableEditUserPage />} />
            <Route path="bookings" element={<MyBookings />} />

            {/* Cart */}
            <Route path="cart" element={<Cart />} />
            <Route path="cart/checkout" element={<Checkout />} />
            <Route path="cart/select-address" element={<SelectAddress />} />

            {/* Orders */}
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:orderId" element={<OrderTracking />} />
            <Route path="orders/:orderId/invoice" element={<OrderInvoice />} />
            <Route path="orders/:orderId/details" element={<UserOrderDetails />} />

            {/* Offers */}
            <Route path="offers" element={<Offers />} />

            {/* Gourmet */}
            <Route path="gourmet" element={<Gourmet />} />

            {/* Collections */}
            <Route path="collections" element={<Collections />} />
            <Route path="collections/:id" element={<CollectionDetail />} />

            {/* Profile — kept alive in UserLayout MainTabKeepAlive */}
            <Route path="profile" element={<MainTabRoutePlaceholder />} />
            <Route path="profile/edit" element={<EditProfile />} />
            <Route path="profile/payments" element={<Payments />} />
            <Route path="profile/payments/new" element={<AddPayment />} />
            <Route path="profile/payments/:id/edit" element={<EditPayment />} />
            <Route path="profile/favorites" element={<Favorites />} />
            <Route path="profile/coupons" element={<Coupons />} />
            <Route path="profile/about" element={<About />} />
            <Route path="profile/delivery-safety" element={<DeliverySafety />} />
            <Route path="profile/report-safety-emergency" element={<ReportSafetyEmergency />} />
            <Route path="profile/accessibility" element={<Accessibility />} />
            <Route path="profile/logout" element={<Logout />} />
            <Route path="profile/refer-earn" element={<ReferEarn />} />
            <Route path="profile/dining-bookings" element={<MyBookings />} />
            <Route path="profile/settings" element={<Suspense fallback={<Loader />}><Settings /></Suspense>} />

            {/* Notifications */}
            <Route path="notifications" element={<Notifications />} />

            {/* Wallet */}
            <Route path="wallet" element={<Wallet />} />

            {/* Complaints */}
            <Route path="complaints/submit/:orderId" element={<SubmitComplaint />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
