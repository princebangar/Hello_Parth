// /food/user/bookings — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/dining/MyBookings';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
