// /food/user/profile/coupons — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/Coupons';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
