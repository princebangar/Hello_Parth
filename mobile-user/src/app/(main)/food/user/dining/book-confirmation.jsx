// /food/user/dining/book-confirmation — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/dining/TableBookingConfirmation';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
