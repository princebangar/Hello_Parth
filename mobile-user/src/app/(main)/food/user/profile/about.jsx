// /food/user/profile/about — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/About';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
