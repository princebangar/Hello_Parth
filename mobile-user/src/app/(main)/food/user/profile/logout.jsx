// /food/user/profile/logout — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/Logout';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
