// /food/user/profile/settings — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/Settings';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page, { fallback: 'loader' });
