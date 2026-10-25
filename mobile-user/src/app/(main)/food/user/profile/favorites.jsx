// /food/user/profile/favorites — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/Favorites';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
