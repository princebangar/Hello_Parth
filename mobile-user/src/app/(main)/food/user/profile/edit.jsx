// /food/user/profile/edit — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/EditProfile';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
