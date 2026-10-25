// /food/user/profile/payments/new — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/AddPayment';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
