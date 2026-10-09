import { Suspense, useEffect, useLayoutEffect } from 'react';
import lazy from '@/shared/utils/lazyPreloaded';
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MapPin, FileText } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import api from './shared/api/axiosInstance';
import { socketService } from './shared/api/socket';
import { installLegacyBackendShim } from './shared/api/legacyBackendShim';
import { installHistoryStateGuard } from './shared/api/historyStateGuard';
import { SettingsProvider, useSettings } from './shared/context/SettingsContext';
import { UserThemeProvider } from './shared/context/UserThemeContext';
import AppAutoUpdater from './modules/shared/components/AppAutoUpdater';
import { addRealtimeNotification } from './modules/user/utils/realtimeNotificationStore';
import { clearLocalUserSessionData } from '@/shared/utils/userSession.js';
import { syncThemeForPath } from '@/shared/utils/theme.js';
import { getLocalUserToken } from './modules/user/services/authService';
import { clearCurrentRide } from './modules/user/services/currentRideService';
import userBusService from './modules/user/services/busService';
import { userService } from './modules/user/services/userService';
import { syncUpcomingRideReminders } from './modules/user/utils/upcomingRideReminderService';
import { getAuthenticatedDriverRole, getLocalDriverToken } from './modules/driver/services/registrationService';
import { installBrowserFcmRegistration } from './shared/push/browserFcmRegistration';
import { installNativeFcmBridge } from './shared/push/nativeFcmBridge';
import { POOLING_ENABLED } from './shared/featureFlags';
import UserMainTabKeepAlive from './modules/user/components/UserMainTabKeepAlive';
import AppRouteFallback from '@/shared/components/AppRouteFallback';
// Driver / owner / bus / pooling bottom-bar screens: preloadable, so a tab tap renders without waiting.
import {
  BusDriverHome,
  DriverHome,
  DriverIncentives,
  DriverProfile,
  DriverWallet,
  ManageDrivers,
  OwnerBusBookingsPage,
  OwnerBusServicePage,
  OwnerDashboard,
  OwnerPoolingVehicles,
  OwnerVehicleFleet,
  OwnerWallet,
  PoolingDriverBookings,
  PoolingDriverDashboard,
  RideRequests,
} from './modules/driver/driverTabPages';
import './App.css';
import './index.css';

// Old-Taxi admin screens still call fetch(`${__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/...`); route them to /api/v1/taxi.
installLegacyBackendShim();
installHistoryStateGuard();


// Lazy loading pages for performance
const UserHome = lazy(() => import('./modules/user/pages/Home'));
// User auth: single shared screen at /login (Frontend/src/modules/auth/pages/Login.jsx) for food + taxi.

// Ride Module Pages
const SelectLocation = lazy(() => import('./modules/user/pages/ride/SelectLocation'));
const SelectVehicle = lazy(() => import('./modules/user/pages/ride/SelectVehicle'));
const SearchingDriver = lazy(() => import('./modules/user/pages/ride/SearchingDriver'));
const RideTracking = lazy(() => import('./modules/user/pages/ride/RideTracking'));
const RideComplete = lazy(() => import('./modules/user/pages/ride/RideComplete'));
const Chat = lazy(() => import('./modules/user/pages/ride/Chat'));
const Support = lazy(() => import('./modules/user/pages/ride/Support'));
const RideDetail = lazy(() => import('./modules/user/pages/ride/RideDetail'));

// Parcel Module Pages
const ParcelType = lazy(() => import('./modules/user/pages/parcel/ParcelType'));
const SenderReceiverDetails = lazy(() => import('./modules/user/pages/parcel/SenderReceiverDetails'));

// Profile & History
const Activity = lazy(() => import('./modules/user/pages/Activity'));
const Profile = lazy(() => import('./modules/user/pages/Profile'));
const Wallet = lazy(() => import('./modules/user/pages/Wallet'));

const LegalPage = lazy(() => import('./modules/shared/pages/LegalPage'));
const DriverLegalTerms = lazy(() => import('./modules/shared/pages/DriverLegalTerms'));
const DriverLegalPrivacy = lazy(() => import('./modules/shared/pages/DriverLegalPrivacy'));
const DriverLegalSupport = lazy(() => import('./modules/shared/pages/DriverLegalSupport'));

// Phase 1 — Parcel flow completions
const ParcelSearchingDriver = lazy(() => import('./modules/user/pages/parcel/ParcelSearchingDriver'));
const ParcelTracking = lazy(() => import('./modules/user/pages/parcel/ParcelTracking'));

// Phase 2 — Core utility pages
const UserNotifications = lazy(() => import('./modules/user/pages/Notifications'));
const PromoCodes = lazy(() => import('./modules/user/pages/PromoCodes'));
const UserReferral = lazy(() => import('./modules/user/pages/Referral'));

// Phase 3 — Safety & Support
const SOSContacts = lazy(() => import('./modules/user/pages/safety/SOSContacts'));
const SupportTickets = lazy(() => import('./modules/user/pages/support/SupportTickets'));
const SupportTicketDetail = lazy(() => import('./modules/user/pages/support/SupportTicketDetail'));
const DeleteAccount = lazy(() => import('./modules/user/pages/profile/DeleteAccount'));

// Phase 4 — Cab/Intercity/Bus flows
const CabHome = lazy(() => import('./modules/user/pages/cab/CabHome'));
const SharedTaxi = lazy(() => import('./modules/user/pages/cab/SharedTaxi'));
const SharedTaxiSeats = lazy(() => import('./modules/user/pages/cab/SharedTaxiSeats'));
const SharedTaxiConfirm = lazy(() => import('./modules/user/pages/cab/SharedTaxiConfirm'));

const IntercityVehicle = lazy(() => import('./modules/user/pages/intercity/IntercityVehicle'));
const IntercityDetails = lazy(() => import('./modules/user/pages/intercity/IntercityDetails'));
const IntercityConfirm = lazy(() => import('./modules/user/pages/intercity/IntercityConfirm'));

const BusHome = lazy(() => import('./modules/user/pages/bus/BusHome'));
const BusList = lazy(() => import('./modules/user/pages/bus/BusList'));
const BusSeats = lazy(() => import('./modules/user/pages/bus/BusSeats'));
const BusPreview = lazy(() => import('./modules/user/pages/bus/BusPreview'));
const BusDetails = lazy(() => import('./modules/user/pages/bus/BusDetails'));
const BusConfirm = lazy(() => import('./modules/user/pages/bus/BusConfirm'));



// New Feature Pages
const IntercityHome = lazy(() => import('./modules/user/pages/intercity/IntercityHome'));

// Car Pooling flow
const UserPoolingHome = lazy(() => import('./modules/user/pages/pooling/PoolingHome'));
const UserPoolingList = lazy(() => import('./modules/user/pages/pooling/PoolingList'));
const UserPoolingSeats = lazy(() => import('./modules/user/pages/pooling/PoolingSeats'));
const UserPoolingConfirm = lazy(() => import('./modules/user/pages/pooling/PoolingConfirm'));

// Profile Settings Sub-pages
const ProfileSettings = lazy(() => import('./modules/user/pages/profile/ProfileSettings'));
// Settings hub (Edit Profile / Delete Account) — separate from the edit
// form itself (ProfileSettings, now mounted at .../profile/edit).
const SettingsHub = lazy(() => import('./modules/user/pages/profile/Settings'));
const PaymentSettings = lazy(() => import('./modules/user/pages/profile/PaymentSettings'));
const AddressSettings = lazy(() => import('./modules/user/pages/profile/AddressSettings'));
const BusBookings = lazy(() => import('./modules/user/pages/profile/BusBookings'));
const BusBookingDetail = lazy(() => import('./modules/user/pages/profile/BusBookingDetail'));
const UserSubscriptions = lazy(() => import('./modules/user/pages/profile/Subscriptions'));
// Driver Module - Common
// Driver / owner portal shell (with the ride-request listener and alert sound): only drivers and owners need it, so
// it is its own chunk instead of part of every customer's download.
const DriverLayout = lazy(() => import('./modules/driver/components/DriverLayout'));

// Driver Module - Registration
const LanguageSelect = lazy(() => import('./modules/driver/pages/registration/LanguageSelect'));
const DriverWelcome = lazy(() => import('./modules/driver/pages/registration/DriverWelcome'));
const PhoneRegistration = lazy(() => import('./modules/driver/pages/registration/PhoneRegistration'));
const OTPVerification = lazy(() => import('./modules/driver/pages/registration/OTPVerification'));
const RegistrationStatus = lazy(() => import('./modules/driver/pages/registration/RegistrationStatus'));
const StepPersonal = lazy(() => import('./modules/driver/pages/registration/StepPersonal'));
const StepReferral = lazy(() => import('./modules/driver/pages/registration/StepReferral'));
const StepVehicle = lazy(() => import('./modules/driver/pages/registration/StepVehicle'));
const StepDocuments = lazy(() => import('./modules/driver/pages/registration/StepDocuments'));
const ApplicationStatus = lazy(() => import('./modules/driver/pages/registration/ApplicationStatus'));

// Driver Module - Core
const ActiveTrip = lazy(() => import('./modules/driver/pages/ActiveTrip'));
const BusDriverLiveRoute = lazy(() => import('./modules/driver/pages/BusDriverLiveRoute'));
const OwnerPoolingVehicleForm = lazy(() => import('./modules/driver/pages/OwnerPoolingVehicleForm'));
const DriverBankDetailsPage = lazy(() => import('./modules/driver/pages/DriverBankDetailsPage'));
const PoolingDriverOnboarding = lazy(() => import('./modules/driver/pages/pooling/PoolingDriverOnboarding'));
const PoolingDriverPendingStatus = lazy(() => import('./modules/driver/pages/pooling/PoolingDriverPendingStatus'));
const RoleSelection = lazy(() => import('./modules/driver/pages/registration/RoleSelection'));
const RoleSpecificOnboarding = lazy(() => import('./modules/driver/pages/registration/RoleSpecificOnboarding'));
const BusSignupBuilderPage = lazy(() => import('./modules/driver/pages/registration/BusSignupBuilderPage'));

// Driver Module - Settings
const EditProfile = lazy(() => import('./modules/driver/pages/settings/EditProfile'));
const DriverDocuments = lazy(() => import('./modules/driver/pages/settings/DriverDocuments'));
const Notifications = lazy(() => import('./modules/driver/pages/settings/Notifications'));
const Referral = lazy(() => import('./modules/driver/pages/settings/Referral'));
const DriverDeleteAccount = lazy(() => import('./modules/driver/pages/settings/DeleteAccount'));
const DriverSettings = lazy(() => import('./modules/driver/pages/settings/DriverSettings'));
const SecuritySOS = lazy(() => import('./modules/driver/pages/settings/SecuritySOS'));
const DriverSupport = lazy(() => import('./modules/driver/pages/settings/Support'));
const DriverHelpSupportOptions = lazy(() => import('./modules/driver/pages/settings/HelpSupportOptions'));
const DriverSupportChat = lazy(() => import('./modules/driver/pages/settings/SupportChat'));
const VehicleFleet = lazy(() => import('./modules/driver/pages/settings/VehicleFleet'));
const AddVehicle = lazy(() => import('./modules/driver/pages/settings/AddVehicle'));
const AddDriver = lazy(() => import('./modules/driver/pages/settings/AddDriver'));

// Admin Module Pages
const AdminLayout = lazy(() => import('./modules/admin/components/AdminLayout'));
const AdminDashboard = lazy(() => import('./modules/admin/pages/dashboard/MainDashboard'));
const AdminCancellationAnalytics = lazy(() => import('./modules/admin/pages/CancellationAnalytics'));
const AdminEarnings = lazy(() => import('./modules/admin/pages/dashboard/AdminEarnings'));
const AdminChat = lazy(() => import('./modules/admin/pages/operations/Chat'));
const AdminTrips = lazy(() => import('./modules/admin/pages/operations/Trips'));
const AdminDeliveries = lazy(() => import('./modules/admin/pages/operations/Deliveries'));
const AdminOngoing = lazy(() => import('./modules/admin/pages/operations/Ongoing'));
const AdminWalletPayment = lazy(() => import('./modules/admin/pages/wallet/WalletPayment'));
const AdminUserList = lazy(() => import('./modules/admin/pages/users/UserList'));
const AdminUserCreate = lazy(() => import('./modules/admin/pages/users/UserCreate'));
const AdminUserDetails = lazy(() => import('./modules/admin/pages/users/UserDetails'));
const AdminUserBulkUpload = lazy(() => import('./modules/admin/pages/users/UserBulkUpload'));
const AdminUserImportCreate = lazy(() => import('./modules/admin/pages/users/UserImportCreate'));
const AdminUserSubscriptions = lazy(() => import('./modules/admin/pages/users/UserSubscriptions'));
const AdminUserSubscriptionCreate = lazy(() => import('./modules/admin/pages/users/UserSubscriptionCreate'));

// DRIVER MANAGEMENT IMPORTS
const AdminDriverList = lazy(() => import('./modules/admin/pages/drivers/DriverList'));
const AdminDriverDetails = lazy(() => import('./modules/admin/pages/drivers/DriverDetails'));
const AdminPendingDrivers = lazy(() => import('./modules/admin/pages/drivers/PendingDrivers'));
const AdminDriverSubscriptions = lazy(() => import('./modules/admin/pages/drivers/DriverSubscriptions'));
const AdminDriverSubscriptionCreate = lazy(() => import('./modules/admin/pages/drivers/DriverSubscriptionCreate'));
const AdminDriverRatings = lazy(() => import('./modules/admin/pages/drivers/DriverRatings'));
const AdminDriverRatingDetail = lazy(() => import('./modules/admin/pages/drivers/DriverRatingDetail'));
const AdminNegativeBalanceDrivers = lazy(() => import('./modules/admin/pages/drivers/NegativeBalanceDrivers'));
const AdminWithdrawalRequestDrivers = lazy(() => import('./modules/admin/pages/drivers/WithdrawalRequestDrivers'));
const AdminWithdrawalRequestDetail = lazy(() => import('./modules/admin/pages/drivers/WithdrawalRequestDetail'));
const AdminDriverDeleteRequests = lazy(() => import('./modules/admin/pages/drivers/DriverDeleteRequests'));
const AdminGlobalDocuments = lazy(() => import('./modules/admin/pages/drivers/GlobalDocuments'));
const AdminDriverDocumentForm = lazy(() => import('./modules/admin/pages/drivers/DriverDocumentForm'));
const AdminDriverBulkUpload = lazy(() => import('./modules/admin/pages/drivers/DriverBulkUpload'));
const AdminDriverImportCreate = lazy(() => import('./modules/admin/pages/drivers/DriverImportCreate'));
const AdminDriverAudit = lazy(() => import('./modules/admin/pages/drivers/DriverAudit'));
const AdminPaymentMethods = lazy(() => import('./modules/admin/pages/drivers/PaymentMethods'));
const AdminDriverCreate = lazy(() => import('./modules/admin/pages/drivers/CreateDriver'));
const AdminDriverEdit = lazy(() => import('./modules/admin/pages/drivers/EditDriver'));

const AdminPromoCodes = lazy(() => import('./modules/admin/pages/promotions/PromoCodes'));
const AdminSendNotification = lazy(() => import('./modules/admin/pages/promotions/SendNotification'));
const AdminBannerImage = lazy(() => import('./modules/admin/pages/promotions/BannerImage'));

// Price Management
const AdminServiceLocation = lazy(() => import('./modules/admin/pages/price-management/ServiceLocation'));
const AdminZoneManagement = lazy(() => import('./modules/admin/pages/price-management/ZoneManagement'));
const AdminSetPrices = lazy(() => import('./modules/admin/pages/price-management/SetPrices'));
const AdminSetPackagePrices = lazy(() => import('./modules/admin/pages/price-management/SetPackagePrices'));
const AdminCreatePackagePrice = lazy(() => import('./modules/admin/pages/price-management/CreatePackagePrice'));
const AdminDriverIncentive = lazy(() => import('./modules/admin/pages/price-management/DriverIncentive'));
const AdminSurgePricing = lazy(() => import('./modules/admin/pages/price-management/SurgePricing'));
const AdminVehicleType = lazy(() => import('./modules/admin/pages/price-management/VehicleType'));
const AdminPackageTypes = lazy(() => import('./modules/admin/pages/price-management/PackageTypes'));
const AdminGoodsTypes = lazy(() => import('./modules/admin/pages/price-management/GoodsTypes'));
const AdminPoolingManager = lazy(() => import('./modules/admin/pages/pooling/PoolingManager'));
const AdminPoolingVehicles = lazy(() => import('./modules/admin/pages/pooling/PoolingVehicles'));
const AdminPoolingVehicleForm = lazy(() => import('./modules/admin/pages/pooling/PoolingVehicleForm'));
const AdminPoolingBookings = lazy(() => import('./modules/admin/pages/pooling/PoolingBookings'));
const AdminPoolingCommissionManager = lazy(() => import('./modules/admin/pages/pooling/PoolingCommissionManager'));
const AdminBusServiceManager = lazy(() => import('./modules/admin/pages/bus-service/BusServiceManager'));
const AdminBusServiceDetails = lazy(() => import('./modules/admin/pages/bus-service/BusServiceDetails'));
const AdminBusBookingManager = lazy(() => import('./modules/admin/pages/bus-service/BusBookingManager'));
const AdminBusCommissionManager = lazy(() => import('./modules/admin/pages/bus-service/BusCommissionManager'));
const AdminPricingPlaceholder = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[500px] text-gray-400 bg-white rounded-[32px] border border-gray-100 shadow-sm p-10">
    <MapPin size={60} strokeWidth={1} className="mb-6 opacity-20" />
    <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest">{title}</h2>
    <p className="mt-2 font-bold italic tracking-tight">Configuration module coming soon</p>
  </div>
);

const AdminOwnerDashboard = lazy(() => import('./modules/admin/pages/owners/OwnerDashboard'));
const AdminManageOwners = lazy(() => import('./modules/admin/pages/owners/ManageOwners'));
const AdminPendingOwners = lazy(() => import('./modules/admin/pages/owners/PendingOwners'));
const AdminOwnerDetails = lazy(() => import('./modules/admin/pages/owners/OwnerDetails'));
const AdminOwnerCreate = lazy(() => import('./modules/admin/pages/owners/OwnerCreate'));
const AdminOwnerPasswordUpdate = lazy(() => import('./modules/admin/pages/owners/OwnerPasswordUpdate'));
const AdminOwnerNeededDocuments = lazy(() => import('./modules/admin/pages/owners/OwnerNeededDocuments'));
const AdminOwnerNeededDocumentsCreate = lazy(() => import('./modules/admin/pages/owners/OwnerNeededDocumentsCreate'));
const AdminManageFleet = lazy(() => import('./modules/admin/pages/owners/ManageFleet'));
const AdminManageFleetCreate = lazy(() => import('./modules/admin/pages/owners/ManageFleetCreate'));
const AdminFleetDrivers = lazy(() => import('./modules/admin/pages/owners/FleetDrivers'));
const AdminFleetDriverCreate = lazy(() => import('./modules/admin/pages/owners/FleetDriverCreate'));
const AdminBlockedFleetDrivers = lazy(() => import('./modules/admin/pages/owners/BlockedFleetDrivers'));
const AdminFleetNeededDocuments = lazy(() => import('./modules/admin/pages/owners/FleetNeededDocuments'));
const AdminFleetNeededDocumentsCreate = lazy(() => import('./modules/admin/pages/owners/FleetNeededDocumentsCreate'));
const AdminWithdrawalRequestOwners = lazy(() => import('./modules/admin/pages/owners/WithdrawalRequestOwners'));
const AdminWithdrawalRequestOwnerDetail = lazy(() => import('./modules/admin/pages/owners/WithdrawalRequestOwnerDetail'));
const AdminDeletedOwners = lazy(() => import('./modules/admin/pages/owners/DeletedOwners'));
const AdminOwnerBookings = lazy(() => import('./modules/admin/pages/owners/OwnerBookings'));

const AdminGeoFencing = lazy(() => import('./modules/admin/pages/geo/GeoFencing'));
const AdminHeatMap = lazy(() => import('./modules/admin/pages/geo/HeatMap'));
const AdminGodsEye = lazy(() => import('./modules/admin/pages/geo/GodsEye'));
const PublicRideTrack = lazy(() => import('./modules/user/pages/ride/PublicRideTrack'));
const AdminSafetyCenter = lazy(() => import('./modules/admin/pages/safety/SafetyCenter'));
const AdminGlobalSettings = lazy(() => import('./modules/admin/pages/settings/GlobalSettings'));
const AdminGeneralSettings = lazy(() => import('./modules/admin/pages/settings/GeneralSettings'));
const AdminCustomizationSettings = lazy(() => import('./modules/admin/pages/settings/CustomizationSettings'));
const AdminTransportRideSettings = lazy(() => import('./modules/admin/pages/settings/TransportRideSettings'));
const AdminBidRideSettings = lazy(() => import('./modules/admin/pages/settings/BidRideSettings'));
const AdminWalletSettings = lazy(() => import('./modules/admin/pages/settings/WalletSettings'));
const AdminTipSettings = lazy(() => import('./modules/admin/pages/settings/TipSettings'));
const AdminAppModules = lazy(() => import('./modules/admin/pages/settings/AppModules'));
const AdminOnboardingScreens = lazy(() => import('./modules/admin/pages/settings/OnboardingScreens'));
const AdminNotificationChannels = lazy(() => import('./modules/admin/pages/settings/NotificationChannels'));
const AdminDispatcherAddons = lazy(() => import('./modules/admin/pages/settings/DispatcherAddons'));
const AdminCountryManagement = lazy(() => import('./modules/admin/pages/masters/CountryManagement'));
const AdminSupportTicketTitle = lazy(() => import('./modules/admin/pages/support/TicketTitle'));
const AdminSupportTickets = lazy(() => import('./modules/admin/pages/support/SupportTickets'));


// Reports Module
const AdminUserReport = lazy(() => import('./modules/admin/pages/reports/UserReport'));
const AdminDriverReport = lazy(() => import('./modules/admin/pages/reports/DriverReport'));
const AdminDriverDutyReport = lazy(() => import('./modules/admin/pages/reports/DriverDutyReport'));
const AdminOwnerReport = lazy(() => import('./modules/admin/pages/reports/OwnerReport'));
const AdminFinanceReport = lazy(() => import('./modules/admin/pages/reports/FinanceReport'));
const AdminFleetFinanceReport = lazy(() => import('./modules/admin/pages/reports/FleetFinanceReport'));

// Masters Management
const AdminLanguages = lazy(() => import('./modules/admin/pages/masters/Languages'));
const AdminPreferences = lazy(() => import('./modules/admin/pages/masters/Preferences'));

// Admin Management

const AdminReportPlaceholder = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[500px] text-gray-400 bg-white rounded-[32px] border border-gray-100 shadow-sm p-10 mx-6">
    <FileText size={60} strokeWidth={1} className="mb-6 opacity-20" />
    <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest">{title}</h2>
    <p className="mt-2 font-bold italic tracking-tight text-primary">Report engine initializing...</p>
  </div>
);

const AdminSectionPlaceholder = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const title = location.pathname
    .split('/')
    .filter(Boolean)
    .slice(1)
    .join(' / ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="max-w-xl w-full bg-white rounded-[32px] border border-gray-100 shadow-sm p-10 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5">
          <FileText size={28} />
        </div>
        <h2 className="text-2xl font-black text-gray-950 uppercase tracking-tight">{title || 'Admin Section'}</h2>
        <p className="mt-3 text-sm font-medium text-gray-500 leading-6">
          This admin section is not wired to the user app. It stays inside the admin shell so navigation remains safe.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/dashboard')}
          className="mt-8 inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#2563EB] text-white text-[12px] font-black uppercase tracking-widest shadow-lg shadow-blue-900/20"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

const PARTNER_AUTH_PATH = /^\/taxi\/(driver|owner)\/(login|reg-phone|otp-verify|select-role)\/?$/;
const PARTNER_PORTAL_PATH = /^\/taxi\/(driver|owner)(\/|$)/;

// A wrapper to handle conditional layouts (Mobile for User/Driver, Full for Admin)
const MainLayout = ({ children }) => {
  const location = useLocation();
  const staticPages = ['/taxi', '/taxi/about', '/taxi/contact', '/taxi/faq', '/taxi/services', '/taxi/privacy', '/taxi/terms', '/taxi/refund', '/taxi/cancellation', '/taxi/blog', '/taxi/links'];
  const isStaticPath = staticPages.includes(location.pathname);
  const isAdminPath =
    location.pathname.startsWith('/taxi/admin') ||
    location.pathname.startsWith('/taxi/user-import') ||
    location.pathname.startsWith('/taxi/driver-import') ||
    location.pathname === '/taxi/owner/create';

  if (isAdminPath) {
    return <div className="redigo-admin-root h-screen bg-gray-50 overflow-hidden">{children}</div>;
  }

  if (isStaticPath) {
    return (
      <div className="redigo-landing-root min-h-screen bg-white">
        <main className="min-h-screen">{children}</main>
      </div>
    );
  }

  // Driver/owner portal is light-only and must stay outside `user-app-theme`: that scope's
  // !important overrides remap slate/white colours to the customer's dark/light palette.
  if (PARTNER_PORTAL_PATH.test(location.pathname)) {
    const isPartnerAuth = PARTNER_AUTH_PATH.test(location.pathname);
    return (
      <div className="redigo-app driver-app-root light min-h-screen bg-slate-100 text-slate-900">
        <main
          className={`min-h-screen relative overflow-x-hidden bg-white ${isPartnerAuth ? 'w-full' : 'max-w-lg mx-auto shadow-2xl'}`}
        >
          {children}
        </main>
      </div>
    );
  }

  // `user-app-theme` (id="taxi-app-root") activates index.css's --user-*
  // CSS variables and its !important light/dark overrides for the whole
  // taxi user app. The `dark`/`light` class itself is applied directly to
  // this node by UserThemeContext (see TAXI_APP_ROOT_ID there) instead of
  // through this component's own className — that decouples the actual
  // colour switch from React re-rendering this div (and everything inside
  // it: all 5 kept-alive tabs), so it updates in one paint instead of
  // waiting for the whole tree to catch up. Background comes from the same
  // --user-bg variable for the same reason — no JS-computed ternary here.
  return (
    <div id="taxi-app-root" className="redigo-app user-app-theme min-h-screen" style={{ backgroundColor: 'var(--user-bg)' }}>
      <main
        className="min-h-screen relative overflow-x-clip max-w-lg mx-auto shadow-2xl"
        style={{ backgroundColor: 'var(--user-bg)' }}
      >
        {children}
      </main>
    </div>
  );
};

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Main bottom-nav tabs keep scroll via KeepAlive — don't yank to top.
    const mainTabs = new Set([
      '/taxi/user',
      '/taxi/user/activity',
      '/taxi/user/bus',
      '/taxi/user/support',
      '/taxi/user/profile',
    ]);
    const normalized = String(pathname || '').replace(/\/$/, '') || '/';
    if (mainTabs.has(normalized)) {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
};

const clearUserSession = () => {
  clearCurrentRide();
  socketService.disconnect();
  syncThemeForPath('/login');
  clearLocalUserSessionData();
};

const UserProtectedRoute = () => {
  const location = useLocation();

  if (!getLocalUserToken()) {
    // Guests cannot browse Taxi — send to shared login with taxi return intent.
    const from = location.pathname.startsWith('/taxi/')
      ? location.pathname
      : '/taxi/user';
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return <Outlet />;
};

const UserHomeRoute = ({ taxiPrefixed = true }) => (
  <UserHome />
);

const UserAccountInvalidationListener = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const isUserRoute =
      !location.pathname.startsWith('/admin') &&
      !location.pathname.startsWith('/user-import') &&
      !location.pathname.startsWith('/driver-import') &&
      !location.pathname.startsWith('/owner') &&
      !location.pathname.startsWith('/taxi/driver');

    if (!isUserRoute) {
      return undefined;
    }

    const handleLogout = () => {
      clearUserSession();
      socketService.disconnect();
      navigate('/login', { replace: true, state: { from: location.pathname } });
    };

    const handleAdminChatMessage = (payload = {}) => {
      const senderRole = String(payload.senderRole || payload.sender?.role || '').toLowerCase();
      const receiverRole = String(payload.receiverRole || payload.receiver?.role || '').toLowerCase();
      const messageBody = String(payload.message || payload.body || '').trim();

      if (senderRole !== 'admin' || !messageBody) {
        return;
      }

      if (receiverRole && receiverRole !== 'user') {
        return;
      }

      const notificationWasAdded = addRealtimeNotification({
        id: `support-chat:${payload.id || payload._id || `${Date.now()}-${messageBody}`}`,
        title: 'Support message',
        body: messageBody,
        sentAt: payload.createdAt || new Date().toISOString(),
        type: 'support',
        source: 'support-chat',
      });

      if (!notificationWasAdded) {
        return;
      }

      toast(messageBody, {
        duration: 4500,
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-sky-50 bg-white',
      });
    };

    // Ride progress goes into the same Taxi notification list the header bell opens. The id is
    // ride + status, so a repeated socket event never creates a duplicate row.
    const RIDE_NOTICES = {
      accepted: ['Driver accepted your ride', 'Your driver is on the way to the pickup point.'],
      arriving: ['Driver is arriving', 'Your driver is almost at the pickup point.'],
      arrived: ['Driver has arrived', 'Your driver is waiting at the pickup point.'],
      started: ['Ride started', 'Your trip is in progress.'],
      ongoing: ['Ride started', 'Your trip is in progress.'],
      completed: ['Ride completed', 'You have reached your destination. Thanks for riding with us.'],
      cancelled: ['Ride cancelled', 'Your ride was cancelled.'],
    };

    const handleRideStatus = (payload = {}) => {
      const rideId = String(payload.rideId || payload.id || payload._id || '').trim();
      const status = String(payload.liveStatus || payload.status || '').trim().toLowerCase();
      const notice = RIDE_NOTICES[status];
      if (!rideId || !notice) {
        return;
      }

      addRealtimeNotification({
        id: `ride:${rideId}:${status}`,
        title: notice[0],
        body: notice[1],
        sentAt: new Date().toISOString(),
        type: 'ride',
        source: 'ride-status',
      });
    };

    const handleRideAccepted = (payload = {}) => handleRideStatus({ ...payload, status: 'accepted', liveStatus: 'accepted' });
    const handleRideCancelled = (payload = {}) => handleRideStatus({ ...payload, status: 'cancelled', liveStatus: 'cancelled' });

    const socket = socketService.connect({ role: 'user' });
    if (!socket) {
      return undefined;
    }

    socketService.on('account:deleted', handleLogout);
    socketService.on('chat:message', handleAdminChatMessage);
    socketService.on('ride:status:updated', handleRideStatus);
    socketService.on('rideAccepted', handleRideAccepted);
    socketService.on('rideCancelled', handleRideCancelled);

    const handleAuthStale = (event) => {
      const staleToken = event.detail?.token || '';
      const currentUserToken = localStorage.getItem('userToken') || localStorage.getItem('user_accessToken') || localStorage.getItem('token') || '';
      const currentAdminToken = localStorage.getItem('adminToken') || '';

      if (event.detail?.role === 'user' && (!staleToken || staleToken === currentUserToken)) {
        handleLogout();
        return;
      }

      if (event.detail?.role === 'admin' && (!staleToken || staleToken === currentAdminToken)) {
        socketService.disconnect();
        navigate('/admin/login');
      }
    };

    window.addEventListener('app:auth-stale', handleAuthStale);

    return () => {
      socketService.off('account:deleted', handleLogout);
      socketService.off('chat:message', handleAdminChatMessage);
      socketService.off('ride:status:updated', handleRideStatus);
      socketService.off('rideAccepted', handleRideAccepted);
      socketService.off('rideCancelled', handleRideCancelled);
      window.removeEventListener('app:auth-stale', handleAuthStale);
      socketService.disconnect();
    };
  }, [location.pathname, navigate]);

  return null;
};

const getResponsePayload = (response) => response?.data?.data || response?.data || response || {};

// Reminder sync = 3 reads (bus, pooling, scheduled rides). It is background work, so it must never compete with
// the screen the person just opened: it starts a few seconds after the screen is up, it does not repeat on every
// in-app navigation, and focus / tab-visible events only refresh it when the last sync is a couple of minutes old.
const REMINDER_FIRST_SYNC_DELAY_MS = 4000;
const REMINDER_MIN_GAP_MS = 2 * 60 * 1000;
let lastReminderSyncAt = 0;

const UserUpcomingRideReminderBootstrap = () => {
  const location = useLocation();
  const { settings, loading: settingsLoading } = useSettings();
  const busEnabled = String(settings?.transportRide?.enable_bus_service || '0') === '1';
  const isUserRoute =
    location.pathname.startsWith('/taxi/user') ||
    location.pathname === '/user' ||
    location.pathname.startsWith('/ride') ||
    location.pathname.startsWith('/pooling') ||
    location.pathname.startsWith('/bus');

  useEffect(() => {
    if (!isUserRoute || !getLocalUserToken() || settingsLoading) {
      return undefined;
    }

    let cancelled = false;

    const syncReminders = async () => {
      lastReminderSyncAt = Date.now();
      try {
        const [busResult, poolingResult, scheduledRideResult] = await Promise.all([
          busEnabled
            ? userBusService.getMyBookings({ page: 1, limit: 20, tripState: 'upcoming' }).catch(() => ({ data: { results: [] } }))
            : Promise.resolve({ data: { results: [] } }),
          POOLING_ENABLED
            ? userService.getMyPoolingBookings().catch(() => [])
            : Promise.resolve([]),
          api.get('/rides', {
            params: {
              page: 1,
              limit: 20,
              category: 'scheduled',
            },
          }).catch(() => ({ data: { results: [] } })),
        ]);

        if (cancelled) {
          return;
        }

        const busPayload = getResponsePayload(busResult);
        const poolingPayload = getResponsePayload(poolingResult);
        const scheduledRidePayload = getResponsePayload(scheduledRideResult);

        const rawPoolingBookings = POOLING_ENABLED
          ? (Array.isArray(poolingPayload)
            ? poolingPayload
            : Array.isArray(poolingPayload?.results)
              ? poolingPayload.results
              : [])
          : [];
        let poolingBookings = [];

        if (POOLING_ENABLED && rawPoolingBookings.length > 0) {
          const routeIds = [...new Set(rawPoolingBookings.map((booking) => String(booking?.route?._id || '')).filter(Boolean))];
          const routeDetailsEntries = await Promise.all(
            routeIds.map(async (routeId) => {
              try {
                const routeResponse = await userService.getPoolingRouteDetails(routeId);
                return [routeId, getResponsePayload(routeResponse)];
              } catch {
                return [routeId, null];
              }
            }),
          );

          if (cancelled) {
            return;
          }

          const routeDetailsMap = new Map(routeDetailsEntries);
          poolingBookings = rawPoolingBookings.map((booking) => {
            const routeId = String(booking?.route?._id || '');
            const routeDetails = routeDetailsMap.get(routeId);

            return routeDetails
              ? {
                ...booking,
                route: {
                  ...(booking.route || {}),
                  ...routeDetails,
                },
              }
              : booking;
          });
        }

        syncUpcomingRideReminders({
          busBookings: Array.isArray(busPayload?.results) ? busPayload.results : [],
          poolingBookings,
          scheduledRides: Array.isArray(scheduledRidePayload?.results) ? scheduledRidePayload.results : [],
        });
      } catch {
        // Reminder sync is non-blocking.
      }
    };

    const syncIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastReminderSyncAt < REMINDER_MIN_GAP_MS) return;
      syncReminders();
    };

    // First sync waits until the screen is up (and is skipped when a recent one already ran, e.g. Food <-> Taxi).
    const firstSyncTimer = window.setTimeout(syncIfStale, REMINDER_FIRST_SYNC_DELAY_MS);
    const intervalId = window.setInterval(syncIfStale, 10 * 60 * 1000);
    window.addEventListener('focus', syncIfStale);
    document.addEventListener('visibilitychange', syncIfStale);

    return () => {
      cancelled = true;
      window.clearTimeout(firstSyncTimer);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncIfStale);
      document.removeEventListener('visibilitychange', syncIfStale);
    };
  }, [isUserRoute, settingsLoading, busEnabled]);

  return null;
};

const DriverEntryRedirect = () => {
  const token = getLocalDriverToken();
  const role = String(getAuthenticatedDriverRole() || 'driver').toLowerCase();

  if (!token) {
    return <Navigate to="/taxi/driver/login" replace />;
  }

  return (
    <Navigate
      to={
        role === 'owner'
          ? '/taxi/owner/dashboard'
          : role === 'bus_driver'
            ? '/taxi/driver/bus-home'
            : '/taxi/driver/home'
      }
      replace
    />
  );
};

// Shared full-viewport skeleton (RouteSkeleton, i.e. Food's AppShellSkeleton) used for the top-level route
// Suspense — covers every lazy page in the app (admin/driver/user) with the
// same "global" loading skeleton as the bottom-nav tabs in
// UserMainTabKeepAlive.jsx, instead of each Suspense boundary having its own.
// The Terms / Privacy / Support screens get the plain loader instead (see AppRouteFallback).
const RouteSoftFallback = AppRouteFallback;

function TaxiApp() {
  const { pathname } = useLocation();

  useEffect(() => {
    installNativeFcmBridge();
    installBrowserFcmRegistration();
  }, []);

  // index.css styles <html>/<body>/* (Outfit font, root colours) for the Taxi app. That stylesheet
  // stays loaded after the first visit and TaxiApp can stay mounted in the admin keep-alive, so those
  // rules are gated on this class — otherwise Food ended up in Outfit too. Driven by the URL, not by
  // mount/unmount, so it is correct in both cases.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('taxi-app-active', pathname.startsWith('/taxi'));
    return () => root.classList.remove('taxi-app-active');
  }, [pathname]);

  return (
    <>
      <SettingsProvider>
        <UserThemeProvider>
        <AppAutoUpdater />
        <ScrollToTop />
        <UserAccountInvalidationListener />
        <UserUpcomingRideReminderBootstrap />
        <MainLayout>
          <Suspense fallback={<RouteSoftFallback />}>
            <Toaster position="top-right" closeButton />
            <Routes>
              {/* Static / Public routes — the old template marketing site lived here; the real one is "/" now. */}
              <Route index element={<Navigate to="/" replace />} />
              <Route path="about" element={<Navigate to="/" replace />} />
              <Route path="contact" element={<Navigate to="/" replace />} />
              <Route path="faq" element={<Navigate to="/" replace />} />
              <Route path="services" element={<Navigate to="/" replace />} />
              <Route path="blog" element={<Navigate to="/" replace />} />
              <Route path="links" element={<Navigate to="/" replace />} />
              {/* Secret "share my ride" link: anyone with it sees the live trip, no login. */}
              <Route path="track/:token" element={<PublicRideTrack />} />
              <Route path="terms" element={<LegalPage />} />
              <Route path="terms-and-conditions" element={<LegalPage />} />
              <Route path="privacy" element={<LegalPage />} />
              <Route path="privacy-policy" element={<LegalPage />} />
              <Route path="refund" element={<LegalPage />} />
              <Route path="cancellation" element={<LegalPage />} />

              <Route element={<UserProtectedRoute />}>
                <Route path="ride/select-location" element={<SelectLocation />} />
                <Route path="ride/select-vehicle" element={<SelectVehicle />} />
                <Route path="ride/searching" element={<SearchingDriver />} />
                <Route path="ride/tracking" element={<RideTracking />} />
                <Route path="ride/complete" element={<RideComplete />} />
                <Route path="ride/chat" element={<Chat />} />
                <Route path="support" element={<Support />} />
                <Route path="ride/detail/:id" element={<RideDetail />} />

                <Route path="parcel/type" element={<ParcelType />} />
                <Route path="parcel/details" element={<SenderReceiverDetails />} />
                <Route
                  path="parcel/contacts"
                  element={<SenderReceiverDetails />}
                />
                <Route
                  path="parcel/searching"
                  element={<ParcelSearchingDriver />}
                />
                <Route path="parcel/tracking" element={<ParcelTracking />} />
                <Route path="parcel/detail/:id" element={<RideDetail />} />
                <Route path="parcel/chat" element={<Chat />} />

                {/* New Service Routes — Real pages replacing ComingSoon */}
                <Route path="intercity" element={<IntercityHome />} />
                <Route path="intercity/vehicle" element={<IntercityVehicle />} />
                <Route path="intercity/details" element={<IntercityDetails />} />
                <Route path="intercity/confirm" element={<IntercityConfirm />} />
                <Route path="cab" element={<CabHome />} />
                <Route path="cab/shared" element={<SharedTaxi />} />
                <Route path="cab/shared/seats" element={<SharedTaxiSeats />} />
                <Route
                  path="cab/shared/confirm"
                  element={<SharedTaxiConfirm />}
                />
                <Route path="bus" element={<BusHome />} />
                <Route path="bus/list" element={<BusList />} />
                <Route path="bus/seats" element={<BusSeats />} />
                <Route path="bus/details" element={<BusDetails />} />
                <Route path="bus/confirm" element={<BusConfirm />} />

                <Route path="activity" element={<Activity />} />
                <Route path="profile" element={<Profile />} />
                <Route path="wallet" element={<Wallet />} />
                <Route path="notifications" element={<UserNotifications />} />
                <Route path="promo" element={<PromoCodes />} />
                <Route path="referral" element={<UserReferral />} />

                <Route path="profile/settings" element={<SettingsHub />} />
                <Route path="profile/edit" element={<ProfileSettings />} />
                <Route path="profile/payments" element={<PaymentSettings />} />
                <Route path="profile/addresses" element={<AddressSettings />} />
                <Route
                  path="profile/notifications"
                  element={<UserNotifications />}
                />
                <Route
                  path="profile/delete-account"
                  element={<DeleteAccount />}
                />
                <Route path="safety/sos" element={<SOSContacts />} />
                <Route path="support/tickets" element={<SupportTickets />} />
                <Route
                  path="support/ticket/:id"
                  element={<SupportTicketDetail />}
                />
              </Route>

              {/* User Module Routes (Taxi-prefixed aliases to match Driver style) */}
              <Route path="user/terms" element={<LegalPage />} />
              <Route path="user/privacy" element={<LegalPage />} />
              <Route path="user/refund" element={<LegalPage />} />

              <Route element={<UserProtectedRoute />}>
                <Route path="user" element={<UserMainTabKeepAlive />} />
                <Route path="user/ride/select-location" element={<SelectLocation />} />
                <Route path="user/ride/select-vehicle" element={<SelectVehicle />} />
                <Route
                  path="user/ride/searching"
                  element={<SearchingDriver />}
                />
                <Route
                  path="user/ride/tracking"
                  element={<RideTracking />}
                />
                <Route
                  path="user/ride/complete"
                  element={<RideComplete />}
                />
                <Route path="user/ride/chat" element={<Chat />} />
                <Route path="user/support" element={<UserMainTabKeepAlive />} />
                <Route
                  path="user/ride/detail/:id"
                  element={<RideDetail />}
                />

                <Route path="user/parcel/type" element={<ParcelType />} />
                <Route
                  path="user/parcel/details"
                  element={<SenderReceiverDetails />}
                />
                <Route
                  path="user/parcel/contacts"
                  element={<SenderReceiverDetails />}
                />
                <Route
                  path="user/parcel/searching"
                  element={<ParcelSearchingDriver />}
                />
                <Route
                  path="user/parcel/tracking"
                  element={<ParcelTracking />}
                />
                <Route
                  path="user/parcel/detail/:id"
                  element={<RideDetail />}
                />
                <Route path="user/parcel/chat" element={<Chat />} />

                {POOLING_ENABLED ? (
                  <>
                    <Route path="user/pooling" element={<UserPoolingHome />} />
                    <Route path="user/pooling/list" element={<UserPoolingList />} />
                    <Route path="user/pooling/seats/:id" element={<UserPoolingSeats />} />
                    <Route path="user/pooling/confirm" element={<UserPoolingConfirm />} />
                  </>
                ) : null}
                <Route path="user/intercity" element={<IntercityHome />} />
                <Route
                  path="user/intercity/vehicle"
                  element={<IntercityVehicle />}
                />
                <Route
                  path="user/intercity/details"
                  element={<IntercityDetails />}
                />
                <Route
                  path="user/intercity/confirm"
                  element={<IntercityConfirm />}
                />
                <Route path="user/cab" element={<CabHome />} />
                <Route path="user/cab/shared" element={<SharedTaxi />} />
                <Route
                  path="user/cab/shared/seats"
                  element={<SharedTaxiSeats />}
                />
                <Route
                  path="user/cab/shared/confirm"
                  element={<SharedTaxiConfirm />}
                />
                <Route path="user/bus" element={<UserMainTabKeepAlive />} />
                <Route path="user/bus/list" element={<BusList />} />
                <Route path="user/bus/seats" element={<BusSeats />} />
                <Route path="user/bus/details" element={<BusPreview />} />
                <Route path="user/bus/checkout" element={<BusDetails />} />
                <Route path="user/bus/confirm" element={<BusConfirm />} />

                <Route path="user/activity" element={<UserMainTabKeepAlive />} />
                <Route path="user/profile" element={<UserMainTabKeepAlive />} />
                <Route path="user/wallet" element={<Wallet />} />
                <Route
                  path="user/notifications"
                  element={<UserNotifications />}
                />
                <Route path="user/promo" element={<PromoCodes />} />
                <Route path="user/referral" element={<UserReferral />} />

                <Route
                  path="user/profile/settings"
                  element={<SettingsHub />}
                />
                <Route
                  path="user/profile/edit"
                  element={<ProfileSettings />}
                />
                <Route
                  path="user/profile/payments"
                  element={<PaymentSettings />}
                />
                <Route
                  path="user/profile/addresses"
                  element={<AddressSettings />}
                />
                <Route
                  path="user/profile/bus-bookings"
                  element={<BusBookings />}
                />
                <Route
                  path="user/profile/bus-bookings/:id"
                  element={<BusBookingDetail />}
                />
                <Route
                  path="user/profile/subscriptions"
                  element={<UserSubscriptions />}
                />
                <Route
                  path="user/profile/notifications"
                  element={<UserNotifications />}
                />
                <Route
                  path="user/profile/delete-account"
                  element={<DeleteAccount />}
                />
                <Route path="user/safety/sos" element={<SOSContacts />} />
                <Route
                  path="user/support/tickets"
                  element={<SupportTickets />}
                />
                <Route
                  path="user/support/ticket/:id"
                  element={<SupportTicketDetail />}
                />
              </Route>

              {/* Driver Module Routes - Centralized under DriverLayout for Theme & Styling */}
              <Route path="driver" element={<DriverLayout />}>
                <Route
                  index
                  element={<DriverEntryRedirect />}
                />
                <Route path="lang-select" element={<LanguageSelect />} />
                <Route path="welcome" element={<DriverWelcome />} />
                <Route path="login" element={<PhoneRegistration />} />
                <Route path="reg-phone" element={<PhoneRegistration />} />
                <Route path="otp-verify" element={<OTPVerification />} />
                <Route path="step-personal" element={<StepPersonal />} />
                <Route path="step-referral" element={<StepReferral />} />
                <Route path="step-vehicle" element={<StepVehicle />} />
                <Route path="step-documents" element={<StepDocuments />} />
                <Route
                  path="registration-status"
                  element={<RegistrationStatus />}
                />
                <Route path="status" element={<ApplicationStatus />} />

                <Route path="home" element={<DriverHome />} />
                <Route path="bus-home" element={<BusDriverHome />} />
                <Route path="bus-home/live-route" element={<BusDriverLiveRoute />} />
                <Route path="select-role" element={<RoleSelection />} />
                <Route path="role-signup" element={<RoleSpecificOnboarding />} />
                <Route path="role-signup/bus-builder/*" element={<BusSignupBuilderPage />} />
                <Route path="pooling/onboarding" element={<PoolingDriverOnboarding />} />
                <Route path="pooling/status" element={<PoolingDriverPendingStatus />} />
                <Route path="pooling" element={<PoolingDriverDashboard />} />
                <Route path="pooling/bookings" element={<PoolingDriverBookings />} />
                <Route path="terms" element={<LegalPage />} />
                <Route path="privacy" element={<LegalPage />} />
                <Route path="legal/terms" element={<DriverLegalTerms />} />
                <Route path="legal/privacy" element={<DriverLegalPrivacy />} />
                <Route path="legal/support" element={<DriverLegalSupport />} />
                <Route path="dashboard" element={<DriverHome />} />
                <Route path="active-trip" element={<ActiveTrip />} />
                <Route path="chat" element={<Chat />} />
                <Route path="wallet" element={<DriverWallet />} />
                <Route path="profile" element={<DriverProfile />} />
                <Route path="profile/bank-details" element={<DriverBankDetailsPage />} />
                <Route path="settings" element={<DriverSettings />} />
                <Route path="history" element={<RideRequests />} />
                <Route path="incentives" element={<DriverIncentives />} />

                <Route path="edit-profile" element={<EditProfile />} />
                <Route path="documents" element={<DriverDocuments />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="payout-methods" element={<Navigate to="../profile/bank-details" replace />} />
                <Route path="referral" element={<Referral />} />
                <Route
                  path="delete-account"
                  element={<DriverDeleteAccount />}
                />
                <Route path="security" element={<SecuritySOS />} />
                <Route path="support" element={<DriverSupport />} />
                <Route
                  path="help-support"
                  element={<DriverHelpSupportOptions />}
                />
                <Route path="support/chat" element={<DriverSupportChat />} />
                <Route path="support/tickets" element={<SupportTickets />} />
                <Route
                  path="support/ticket/:id"
                  element={<SupportTicketDetail />}
                />
                <Route path="vehicle-fleet" element={<VehicleFleet />} />
                <Route
                  path="vehicle-fleet/edit/:vehicleId"
                  element={<VehicleFleet />}
                />
                <Route path="add-vehicle" element={<AddVehicle />} />
                <Route path="manage-drivers" element={<ManageDrivers />} />
                <Route path="add-driver" element={<AddDriver />} />
                <Route path="edit-driver/:driverId" element={<AddDriver />} />
              </Route>

              <Route path="owner" element={<DriverLayout />}>
                <Route index element={<DriverEntryRedirect />} />
                <Route path="login" element={<PhoneRegistration />} />
                <Route path="reg-phone" element={<PhoneRegistration />} />
                <Route path="otp-verify" element={<OTPVerification />} />
                <Route path="lang-select" element={<LanguageSelect />} />
                <Route path="step-personal" element={<StepPersonal />} />
                <Route path="step-referral" element={<StepReferral />} />
                <Route path="step-vehicle" element={<StepVehicle />} />
                <Route path="step-documents" element={<StepDocuments />} />
                <Route path="registration-status" element={<RegistrationStatus />} />
                <Route path="status" element={<ApplicationStatus />} />
                <Route path="home" element={<OwnerDashboard />} />
                <Route path="dashboard" element={<OwnerDashboard />} />
                <Route path="bus-service" element={<OwnerBusServicePage />} />
                <Route path="bus-service/create" element={<OwnerBusServicePage />} />
                <Route path="bus-service/edit/:id" element={<OwnerBusServicePage />} />
                <Route path="bus-service/:id" element={<OwnerBusServicePage />} />
                <Route path="bus-bookings" element={<OwnerBusBookingsPage />} />
                <Route path="profile" element={<DriverProfile />} />
                <Route path="profile/bank-details" element={<DriverBankDetailsPage />} />
                <Route path="settings" element={<DriverSettings />} />
                <Route path="pooling-vehicles" element={<OwnerPoolingVehicles />} />
                <Route path="pooling-vehicles/create" element={<OwnerPoolingVehicleForm />} />
                <Route path="pooling-vehicles/edit/:id" element={<OwnerPoolingVehicleForm />} />
                <Route path="wallet" element={<OwnerWallet />} />
                <Route path="history" element={<RideRequests />} />
                <Route path="terms" element={<LegalPage />} />
                <Route path="privacy" element={<LegalPage />} />
                <Route path="legal/terms" element={<DriverLegalTerms />} />
                <Route path="legal/privacy" element={<DriverLegalPrivacy />} />
                <Route path="legal/support" element={<DriverLegalSupport />} />
                <Route path="edit-profile" element={<EditProfile />} />
                <Route path="documents" element={<DriverDocuments />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="payout-methods" element={<Navigate to="../profile/bank-details" replace />} />
                <Route path="referral" element={<Referral />} />
                <Route path="delete-account" element={<DriverDeleteAccount />} />
                <Route path="security" element={<SecuritySOS />} />
                <Route path="support" element={<DriverSupport />} />
                <Route path="help-support" element={<DriverHelpSupportOptions />} />
                <Route path="support/chat" element={<DriverSupportChat />} />
                <Route path="support/tickets" element={<SupportTickets />} />
                <Route path="support/ticket/:id" element={<SupportTicketDetail />} />
                <Route path="vehicle-fleet" element={<OwnerVehicleFleet />} />
                <Route
                  path="vehicle-fleet/edit/:vehicleId"
                  element={<OwnerVehicleFleet />}
                />
                <Route path="add-vehicle" element={<AddVehicle />} />
                <Route path="manage-drivers" element={<ManageDrivers />} />
                <Route path="add-driver" element={<AddDriver />} />
                <Route path="edit-driver/:driverId" element={<AddDriver />} />
              </Route>

              {/* Admin Module Routes */}
              <Route path="admin/login" element={<Navigate to="/admin/login" replace />} />
              <Route path="user-import/create" element={<AdminLayout />}>
                <Route index element={<AdminUserImportCreate />} />
              </Route>
              <Route path="driver-import/create" element={<AdminLayout />}>
                <Route index element={<AdminDriverImportCreate />} />
              </Route>
              <Route path="owner/create" element={<AdminLayout />}>
                <Route index element={<AdminOwnerCreate />} />
              </Route>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/taxi/admin/dashboard" />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="cancellation-analytics" element={<AdminCancellationAnalytics />} />
                <Route path="earnings" element={<AdminEarnings />} />
                <Route path="chat" element={<AdminChat />} />
                <Route path="trips" element={<AdminTrips />} />
                <Route path="deliveries" element={<AdminDeliveries />} />
                <Route path="ongoing" element={<AdminOngoing />} />
                <Route path="bus-service" element={<AdminBusServiceManager basePath="/taxi/admin/bus-service" />} />
                <Route path="bus-service/create" element={<AdminBusServiceManager mode="create" basePath="/taxi/admin/bus-service" />} />
                <Route path="bus-service/edit/:id" element={<AdminBusServiceManager mode="edit" basePath="/taxi/admin/bus-service" />} />
                <Route path="bus-service/commission" element={<AdminBusCommissionManager />} />
                <Route path="bus-service/bookings" element={<AdminBusBookingManager />} />
                <Route path="bus-service/:id" element={<AdminBusServiceDetails />} />
                {POOLING_ENABLED ? (
                  <>
                    <Route path="pooling" element={<Navigate to="/taxi/admin/pooling/routes" replace />} />
                    <Route path="pooling/routes" element={<AdminPoolingManager />} />
                    <Route
                      path="pooling/create"
                      element={<AdminPoolingManager mode="create" />}
                    />
                    <Route
                      path="pooling/edit/:id"
                      element={<AdminPoolingManager mode="edit" />}
                    />
                    <Route path="pooling/vehicles" element={<AdminPoolingVehicles />} />
                    <Route path="pooling/commission" element={<AdminPoolingCommissionManager />} />
                    <Route
                      path="pooling/vehicles/create"
                      element={<AdminPoolingVehicleForm />}
                    />
                    <Route
                      path="pooling/vehicles/edit/:id"
                      element={<AdminPoolingVehicleForm />}
                    />
                    <Route
                      path="pooling/vehicles/view/:id"
                      element={<AdminPoolingVehicleForm mode="view" />}
                    />
                    <Route path="pooling/bookings" element={<AdminPoolingBookings />} />
                  </>
                ) : null}
                <Route path="wallet/payment" element={<AdminWalletPayment />} />
                <Route path="users" element={<AdminUserList />} />
                <Route path="users/create" element={<AdminUserCreate />} />
                <Route path="users/subscriptions" element={<AdminUserSubscriptions />} />
                <Route path="users/subscriptions/create" element={<AdminUserSubscriptionCreate />} />
                <Route path="users/:id" element={<AdminUserDetails />} />
                <Route
                  path="users/bulk-upload"
                  element={<AdminUserBulkUpload />}
                />
                <Route
                  path="user-import/create"
                  element={<AdminUserImportCreate />}
                />

                <Route path="drivers" element={<AdminDriverList />} />
                <Route path="drivers/active" element={<AdminDriverList mode="active" />} />
                <Route path="drivers/create" element={<AdminDriverCreate />} />
                <Route path="drivers/edit/:id" element={<AdminDriverEdit />} />
                <Route path="drivers/:id" element={<AdminDriverDetails />} />
                <Route
                  path="drivers/pending"
                  element={<AdminPendingDrivers />}
                />
                <Route
                  path="drivers/subscription"
                  element={<AdminDriverSubscriptions />}
                />
                <Route
                  path="drivers/subscription/create"
                  element={<AdminDriverSubscriptionCreate />}
                />
                <Route
                  path="drivers/ratings"
                  element={<AdminDriverRatings />}
                />
                <Route
                  path="drivers/ratings/:id"
                  element={<AdminDriverRatingDetail />}
                />
                <Route path="drivers/wallet" element={<Navigate to="/taxi/admin/drivers/wallet/withdrawals" replace />} />
                <Route
                  path="drivers/wallet/negative"
                  element={<AdminNegativeBalanceDrivers />}
                />
                <Route
                  path="drivers/wallet/withdrawals"
                  element={<AdminWithdrawalRequestDrivers />}
                />
                <Route
                  path="drivers/wallet/withdrawals/:id"
                  element={<AdminWithdrawalRequestDetail />}
                />
                <Route
                  path="drivers/delete-requests"
                  element={<AdminDriverDeleteRequests />}
                />
                <Route
                  path="drivers/documents"
                  element={<AdminGlobalDocuments />}
                />
                <Route
                  path="drivers/documents/create"
                  element={<AdminDriverDocumentForm />}
                />
                <Route
                  path="drivers/documents/edit/:id"
                  element={<AdminDriverDocumentForm />}
                />
                <Route
                  path="drivers/bulk-upload"
                  element={<AdminDriverBulkUpload />}
                />
                <Route
                  path="driver-import/create"
                  element={<AdminDriverImportCreate />}
                />
                <Route
                  path="drivers/payment-methods"
                  element={<AdminPaymentMethods />}
                />
                <Route
                  path="drivers/audit/:id"
                  element={<AdminDriverAudit />}
                />
                {/* Referral Management moved to the Global admin */}
                <Route path="referrals/*" element={<Navigate to="/admin/global/referrals/dashboard" replace />} />
                {/* Promotions Management */}
                <Route
                  path="promotions/promo-codes"
                  element={<AdminPromoCodes />}
                />
                <Route
                  path="promotions/promo-codes/create"
                  element={<AdminPromoCodes />}
                />
                <Route
                  path="promotions/promo-codes/edit/:id"
                  element={<AdminPromoCodes />}
                />
                <Route
                  path="promotions/send-notification"
                  element={<AdminSendNotification />}
                />
                <Route
                  path="promotions/send-notification/create"
                  element={<AdminSendNotification />}
                />
                <Route
                  path="promotions/banner-image"
                  element={<AdminBannerImage />}
                />
                <Route
                  path="promotions/banner-image/create"
                  element={<AdminBannerImage />}
                />

                {/* Sub-admins are managed only from Global admin; the old Taxi "Admins" URLs go to the dashboard. */}
                <Route path="management/*" element={<Navigate to="/taxi/admin/dashboard" replace />} />

                {/* Owner Management */}
                <Route
                  path="owners/dashboard"
                  element={<AdminOwnerDashboard />}
                />
                <Route path="owners/pending" element={<AdminPendingOwners />} />
                <Route path="owners" element={<AdminManageOwners />} />
                <Route path="owners/create" element={<AdminOwnerCreate />} />
                <Route
                  path="owners/:id/password"
                  element={<AdminOwnerPasswordUpdate />}
                />
                <Route path="owners/:id" element={<AdminOwnerDetails />} />
                <Route
                  path="owners/wallet/withdrawals"
                  element={<AdminWithdrawalRequestOwners />}
                />
                <Route
                  path="owners/wallet/withdrawals/:id"
                  element={<AdminWithdrawalRequestOwnerDetail />}
                />
                <Route path="fleet/drivers" element={<AdminFleetDrivers />} />
                <Route
                  path="fleet/drivers/create"
                  element={<AdminFleetDriverCreate />}
                />
                <Route
                  path="fleet/blocked"
                  element={<AdminBlockedFleetDrivers />}
                />
                <Route
                  path="fleet/documents"
                  element={<AdminFleetNeededDocuments />}
                />
                <Route
                  path="fleet/documents/create"
                  element={<AdminFleetNeededDocumentsCreate />}
                />
                <Route path="fleet/manage" element={<AdminManageFleet />} />
                <Route
                  path="fleet/manage/create"
                  element={<AdminManageFleetCreate />}
                />
                <Route
                  path="owners/documents"
                  element={<AdminOwnerNeededDocuments />}
                />
                <Route
                  path="owners/documents/create"
                  element={<AdminOwnerNeededDocumentsCreate />}
                />
                <Route path="owners/deleted" element={<AdminDeletedOwners />} />
                <Route
                  path="owners/bookings"
                  element={<AdminOwnerBookings />}
                />
                <Route path="geo/heatmap" element={<AdminGeoFencing />} />
                <Route path="geo/gods-eye" element={<AdminGodsEye />} />
                <Route path="geo/peak-zone" element={<AdminGeoFencing />} />
                <Route path="geo/*" element={<AdminGeoFencing />} />
                {/* The old, unlinked Finance page is gone; bookmarks go to the real money screens' home. */}
                <Route path="finance" element={<Navigate to="/taxi/admin/earnings" replace />} />
                {/* Price Management */}
                <Route path="pricing">
                  <Route index element={<Navigate to="service-location" />} />
                  <Route
                    path="service-location"
                    element={<AdminServiceLocation />}
                  />
                  <Route
                    path="service-location/add"
                    element={<AdminServiceLocation mode="create" />}
                  />
                  <Route
                    path="service-location/edit/:id"
                    element={<AdminServiceLocation mode="edit" />}
                  />
                  <Route path="app-modules" element={<AdminAppModules />} />
                  <Route
                    path="app-modules/create"
                    element={<AdminAppModules mode="create" />}
                  />
                  <Route
                    path="app-modules/edit/:id"
                    element={<AdminAppModules mode="edit" />}
                  />
                  <Route path="zone" element={<AdminZoneManagement />} />
                  <Route
                    path="zone/create"
                    element={<AdminZoneManagement mode="create" />}
                  />
                  <Route
                    path="zone/edit/:id"
                    element={<AdminZoneManagement mode="edit" />}
                  />
                  <Route path="vehicle-type" element={<AdminVehicleType />} />
                  <Route
                    path="vehicle-type/create"
                    element={<AdminVehicleType mode="create" />}
                  />
                  <Route
                    path="vehicle-type/edit/:id"
                    element={<AdminVehicleType mode="edit" />}
                  />
                  <Route
                    path="package-types"
                    element={<AdminPackageTypes />}
                  />
                  <Route
                    path="package-types/create"
                    element={<AdminPackageTypes mode="create" />}
                  />
                  <Route
                    path="package-types/edit/:id"
                    element={<AdminPackageTypes mode="edit" />}
                  />
                  <Route path="set-price" element={<AdminSetPrices />} />
                  <Route
                    path="set-price/create"
                    element={<AdminSetPrices mode="create" />}
                  />
                  <Route
                    path="set-price/edit/:id"
                    element={<AdminSetPrices mode="edit" />}
                  />
                  <Route
                    path="set-price/packages/:id"
                    element={<AdminSetPackagePrices />}
                  />
                  <Route
                    path="set-price/packages/create/:id"
                    element={<AdminCreatePackagePrice mode="create" />}
                  />
                  <Route
                    path="set-price/packages/edit/:packageId"
                    element={<AdminCreatePackagePrice mode="edit" />}
                  />
                  <Route
                    path="package-pricing"
                    element={<AdminSetPackagePrices />}
                  />
                  <Route
                    path="package-pricing/create"
                    element={<AdminCreatePackagePrice mode="create" />}
                  />
                  <Route
                    path="package-pricing/edit/:packageId"
                    element={<AdminCreatePackagePrice mode="edit" />}
                  />
                  <Route
                    path="set-price/incentive/:id"
                    element={<AdminDriverIncentive />}
                  />
                  <Route
                    path="set-price/surge/:id"
                    element={<AdminSurgePricing />}
                  />
                  <Route path="goods-types" element={<AdminGoodsTypes />} />
                  <Route
                    path="goods-types/create"
                    element={<AdminGoodsTypes mode="create" />}
                  />
                  <Route
                    path="goods-types/edit/:id"
                    element={<AdminGoodsTypes mode="edit" />}
                  />
                </Route>
                <Route path="safety" element={<AdminSafetyCenter />} />
                <Route path="safety/user" element={<AdminSafetyCenter />} />
                <Route path="safety/driver" element={<AdminSafetyCenter />} />
                <Route
                  path="support/ticket-title"
                  element={<AdminSupportTicketTitle />}
                />
                <Route
                  path="support/tickets"
                  element={<AdminSupportTickets />}
                />
                <Route path="*" element={<AdminSectionPlaceholder />} />

                {/* Report Module Routes */}
                <Route path="reports/user" element={<AdminUserReport />} />
                <Route path="reports/driver" element={<AdminDriverReport />} />
                <Route
                  path="reports/driver-duty"
                  element={<AdminDriverDutyReport />}
                />
                <Route path="reports/owner" element={<AdminOwnerReport />} />
                <Route
                  path="reports/finance"
                  element={<AdminFinanceReport />}
                />
                <Route
                  path="reports/fleet-finance"
                  element={<AdminFleetFinanceReport />}
                />

                {/* Masters Management */}
                <Route path="masters/languages" element={<AdminLanguages />} />
                <Route
                  path="masters/countries"
                  element={<AdminCountryManagement />}
                />
                <Route
                  path="masters/preferences"
                  element={<AdminPreferences />}
                />

                <Route
                  path="settings/business/general"
                  element={<AdminGeneralSettings />}
                />
                <Route
                  path="settings/business/customization"
                  element={<AdminCustomizationSettings />}
                />
                <Route
                  path="settings/business/transport-ride"
                  element={<AdminTransportRideSettings />}
                />
                <Route
                  path="settings/business/bid-ride"
                  element={<AdminBidRideSettings />}
                />

                <Route
                  path="settings/app/wallet"
                  element={<AdminWalletSettings />}
                />
                <Route path="settings/app/tip" element={<AdminTipSettings />} />
                <Route
                  path="settings/app/country"
                  element={<AdminCountryManagement />}
                />
                <Route
                  path="settings/app/onboard"
                  element={<AdminOnboardingScreens />}
                />

                <Route
                  path="settings/business/*"
                  element={<AdminGeneralSettings />}
                />
                <Route
                  path="settings/app/*"
                  element={<AdminGeneralSettings />}
                />

                <Route
                  path="settings/third-party/notification-channel"
                  element={<AdminNotificationChannels />}
                />
                <Route
                  path="settings/addons/dispatcher"
                  element={<AdminDispatcherAddons />}
                />
                <Route
                  path="settings/addons/*"
                  element={<AdminReportPlaceholder title="Addons Management" />}
                />
              </Route>

              {/* Removed catch-all to allow parent routing to handle 404s */}
            </Routes>
          </Suspense>
        </MainLayout>
        </UserThemeProvider>
      </SettingsProvider>
    </>
  );
}

/** The Taxi customer screens people open first - fetched and remembered ahead of time (see lazyPreloaded). */
export const preloadTaxiUserPages = () =>
  Promise.all([UserHome, Activity, Profile, Wallet, UserNotifications, UserReferral, PromoCodes].map((page) => page.preload()));

export default TaxiApp;
